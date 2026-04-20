/**
 * order-notify-staff v6
 * Fixes duplicate variant_label in product names
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL  = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";

const STAFF_EMAILS = [
  { email: "info@sportsfoodsireland.ie",   name: "SFI Info" },
  { email: "damien@sportsfoodsireland.ie", name: "Damien" },
  { email: "stores@sportsfoodsireland.ie", name: "Stores" },
  { email: "ronnie@sportsfoodsireland.ie", name: "Ronnie" },
];

const LOGO = "https://sportsfoodsireland.ie/img/logo.png";
const SITE = "https://sportsfoodsireland.ie";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, authorization", "Access-Control-Allow-Methods": "POST, OPTIONS" };

function fmt(v: number | string) { return Number(v || 0).toFixed(2); }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" }); }

// ---- Variant dedup helpers ----
// Removes self-duplication: "Lemon — Lemon / 30 Serv Bag" → "Lemon / 30 Serv Bag"
function cleanVariantLabel(vl: string): string {
  if (!vl) return vl;
  const sep = " — ";
  const idx = vl.indexOf(sep);
  if (idx < 0) return vl;
  const before = vl.substring(0, idx);        // e.g. "Lemon"
  const after  = vl.substring(idx + sep.length); // e.g. "Lemon / 30 Serv Bag"
  if (after.startsWith(before + " ") || after === before) return after;
  return vl;
}

// Strips variant suffix from product_name so it is not duplicated when displayed
function cleanProductName(pn: string, cleanedVariant: string): string {
  if (!pn) return pn;
  if (cleanedVariant) {
    if (pn.endsWith(" — " + cleanedVariant)) return pn.slice(0, pn.length - 3 - cleanedVariant.length).trim();
    if (pn.endsWith(" - "  + cleanedVariant)) return pn.slice(0, pn.length - 3 - cleanedVariant.length).trim();
  }
  // Strip any remaining double-variant suffix: last " — X — X / Y" or " — X / Y" embedded
  const lastDash = pn.lastIndexOf(" — ");
  if (lastDash > 0) {
    const suffix = pn.substring(lastDash + 3);
    if (suffix.includes(" / ") || suffix.includes(" — ")) return pn.substring(0, lastDash).trim();
  }
  return pn;
}

interface MergedItem {
  product_name: string; variant_label: string; sku: string; image_url: string;
  ship_qty: number; backorder_qty: number; unit_price: number; total_price: number;
}

function mergeItems(allItems: Record<string, unknown>[]): MergedItem[] {
  const regular  = allItems.filter(i => !i.is_backorder);
  const backorder = allItems.filter(i => i.is_backorder);
  const boMap = new Map<string, number>();
  for (const bo of backorder) {
    const key = String(bo.product_id || bo.product_name || "");
    boMap.set(key, (boMap.get(key) || 0) + Number(bo.quantity || 0));
  }
  const merged: MergedItem[] = [];
  const usedBoKeys = new Set<string>();
  for (const item of regular) {
    const key = String(item.product_id || item.product_name || "");
    const boQty = boMap.get(key) || 0;
    if (boQty > 0) usedBoKeys.add(key);
    merged.push({
      product_name: String(item.product_name || "Product"),
      variant_label: String(item.variant_label || ""),
      sku: String(item.sku || item.product_sku || ""),
      image_url: String(item.image_url || ""),
      ship_qty: Number(item.quantity || 0),
      backorder_qty: boQty,
      unit_price: Number(item.unit_price || 0),
      total_price: Number(item.total_price || (Number(item.unit_price || 0) * Number(item.quantity || 0))),
    });
  }
  for (const bo of backorder) {
    const key = String(bo.product_id || bo.product_name || "");
    if (usedBoKeys.has(key)) continue;
    usedBoKeys.add(key);
    merged.push({
      product_name: String(bo.product_name || "Product"),
      variant_label: String(bo.variant_label || ""),
      sku: String(bo.sku || bo.product_sku || ""),
      image_url: String(bo.image_url || ""),
      ship_qty: 0,
      backorder_qty: Number(bo.quantity || 0),
      unit_price: Number(bo.unit_price || 0),
      total_price: Number(bo.total_price || (Number(bo.unit_price || 0) * Number(bo.quantity || 0))),
    });
  }
  return merged;
}

function buildItemRow(item: MergedItem): string {
  // Clean variant and name to avoid duplication
  const cleanedVariant = cleanVariantLabel(item.variant_label);
  const cleanedName    = cleanProductName(item.product_name, cleanedVariant);
  const sku      = item.sku ? `(#${item.sku})` : "";
  const totalQty = item.ship_qty + item.backorder_qty;
  const price    = item.total_price || (item.unit_price * item.ship_qty);
  const imgCell  = item.image_url
    ? `<img src="${item.image_url}" width="40" height="40" style="width:40px;height:40px;object-fit:contain;border-radius:4px;border:1px solid #e2e8f0;" alt="">`
    : `<div style="width:40px;height:40px;background:#f1f5f9;border-radius:4px;display:inline-block;"></div>`;
  const variantHtml = cleanedVariant ? ` &mdash; ${cleanedVariant}` : "";
  let qtyHtml = "";
  if (item.backorder_qty > 0 && item.ship_qty > 0) {
    qtyHtml = `<div style="color:#374151;font-size:12px;margin-top:2px;">Qty ordered: <strong>${totalQty}</strong> &nbsp;|&nbsp; Ship: <strong style="color:#16a34a;">${item.ship_qty}</strong> &nbsp;|&nbsp; <span style="color:#dc2626;font-weight:700;">📦 Backorder: ${item.backorder_qty}</span></div>`;
  } else if (item.backorder_qty > 0 && item.ship_qty === 0) {
    qtyHtml = `<div style="color:#374151;font-size:12px;margin-top:2px;">Qty ordered: <strong>${item.backorder_qty}</strong> &nbsp;|&nbsp; <span style="color:#dc2626;font-weight:700;">📦 ALL Backorder (${item.backorder_qty})</span></div>`;
  } else {
    qtyHtml = `<div style="color:#374151;font-size:12px;margin-top:2px;">Quantity: ${item.ship_qty}</div>`;
  }
  return `<tr style="border-bottom:1px solid #e5e7eb;${item.backorder_qty > 0 ? 'background:#fef9ee;' : ''}">
    <td style="padding:10px 8px;width:52px;">${imgCell}</td>
    <td style="padding:10px 8px;">
      <div style="font-weight:600;color:#111827;font-size:13px;">${cleanedName}${variantHtml}</div>
      ${sku ? `<div style="color:#6b7280;font-size:12px;">${sku}</div>` : ""}
      ${qtyHtml}
    </td>
    <td style="padding:10px 8px;text-align:right;vertical-align:top;font-weight:600;color:#111827;font-size:13px;white-space:nowrap;">&euro;${fmt(price)}</td>
  </tr>`;
}

function buildAddressBlock(label: string, a: Record<string, unknown>, custName?: string, custCompany?: string, custPhone?: string, custEmail?: string): string {
  if (!a || !Object.keys(a).length) return `<td style="padding:8px;vertical-align:top;width:50%;"><strong>${label}</strong><br>—</td>`;
  const lines = [
    custCompany || custName || [a.first_name, a.last_name].filter(Boolean).join(" ") || "",
    a.company, a.addr1 || a.address_1 || a.line1, a.addr2 || a.address_2 || a.line2,
    a.city, a.state, a.postcode || a.postal_code, a.country,
    custPhone || a.phone, custEmail || a.email,
  ].filter(v => v && String(v).trim()).map(String);
  return `<td style="padding:8px;vertical-align:top;width:50%;"><strong style="font-size:13px;">${label}</strong><br>${lines.join("<br>")}</td>`;
}

async function lookupCustomer(sb: ReturnType<typeof createClient>, customerId: string, customerEmail: string) {
  if (customerId) { const { data } = await sb.from("customers").select("*").eq("id", customerId).single(); if (data) return data as Record<string, unknown>; }
  if (customerEmail) { const { data } = await sb.from("customers").select("*").or(`email.ilike.%${customerEmail}%`).eq("b2b_status", "approved").order("total_spent_eur", { ascending: false }).limit(1); if (data?.length) return data[0] as Record<string, unknown>; }
  return null;
}

async function buildAndSendEmail(order: Record<string, unknown>, items: Record<string, unknown>[], customer: Record<string, unknown> | null) {
  const orderNum  = String(order.order_number || order.id || "");
  const total     = Number(order.total || 0);
  const subtotal  = Number(order.subtotal || total);
  const shipping  = Number(order.shipping_total || order.shipping_cost || 0);
  const discount  = Number(order.discount_amount || order.discount_total || 0);
  const storedTax = Number(order.tax_total || order.tax_amount || 0);
  const date      = fmtDate(String(order.created_at || new Date().toISOString()));
  const payMethod = String(order.payment_method || "—");
  const custNotes = String(order.customer_notes || order.notes || "");

  const netAmount       = subtotal + shipping - discount;
  const vatAmount       = storedTax > 0 ? storedTax : Math.round(netAmount * 23) / 100;
  const totalInclVat    = storedTax > 0 ? total : netAmount + vatAmount;

  const custName    = String(order.customer_name || customer?.name || customer?.b2b_company_name || "");
  const custCompany = String(customer?.b2b_company_name || customer?.company || custName || "");
  const custEmail   = String(order.customer_email || customer?.email || "");
  const custPhone   = String(customer?.phone || "");
  const custAddress = customer ? String(customer.address || "") : "";
  const custCity    = customer ? String(customer.city || "") : "";
  const custPostcode = customer ? String(customer.postcode || "") : "";
  const custCountry = customer ? String(customer.country || "") : "";

  let billing = (order.billing_address || {}) as Record<string, unknown>;
  let shipping_addr = (order.shipping_address || {}) as Record<string, unknown>;
  if (!billing.addr1 && !billing.address_1 && !billing.line1 && custAddress) billing = { addr1: custAddress, city: custCity, postcode: custPostcode, country: custCountry };
  if (!shipping_addr.addr1 && !shipping_addr.address_1 && !shipping_addr.line1 && custAddress) shipping_addr = { addr1: custAddress, city: custCity, postcode: custPostcode, country: custCountry };

  const merged   = mergeItems(items);
  const itemRows = merged.map(buildItemRow).join("");

  const totalBO = merged.reduce((s, i) => s + i.backorder_qty, 0);
  const boCount = merged.filter(i => i.backorder_qty > 0).length;
  const boBanner = totalBO > 0
    ? `<tr><td style="padding:10px 24px;background:#fef3c7;border-bottom:1px solid #fbbf24;"><div style="font-weight:700;color:#92400e;font-size:13px;">⚠️ Backorder Alert: ${totalBO} unit${totalBO > 1 ? 's' : ''} across ${boCount} product${boCount > 1 ? 's' : ''} placed on backorder</div></td></tr>`
    : "";

  const shippingLine = shipping > 0 ? `&euro;${fmt(shipping)}` : `<span style="color:#16a34a;">Free shipping</span>`;
  const discountLine = discount > 0 ? `<tr style="border-top:1px solid #e5e7eb;"><td style="padding:8px 12px;font-size:13px;">Discount</td><td style="padding:8px 12px;text-align:right;font-size:13px;color:#dc2626;">-&euro;${fmt(discount)}</td></tr>` : "";
  const notesSection = custNotes ? `<tr><td colspan="2" style="padding:8px 12px;font-size:12px;color:#374151;font-style:italic;border-top:1px solid #e5e7eb;">Customer notes: ${custNotes}</td></tr>` : "";
  const payMethodLabel: Record<string, string> = { paypal: "PayPal", stripe: "Card (Stripe)", "net 30 (invoice)": "Net 30 (Invoice)", net30: "Net 30 (Invoice)", cod: "Cash on Delivery", b2b: "Account Payment", account: "Account Payment" };
  const payDisplay = payMethodLabel[payMethod.toLowerCase()] || payMethod;

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#374151;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:24px 0;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #e5e7eb;border-radius:4px;">
  <tr><td style="padding:24px;text-align:center;border-bottom:1px solid #e5e7eb;"><img src="${LOGO}" alt="Sports Foods Ireland" height="60" style="height:60px;"></td></tr>
  <tr><td style="padding:16px 24px;text-align:center;border-bottom:1px solid #e5e7eb;"><p style="margin:0;color:#111827;font-size:14px;">Order #${orderNum} &mdash; Total &euro;${fmt(totalInclVat)} &mdash; ${date}</p></td></tr>
  ${custName ? `<tr><td style="padding:14px 24px;background:#f0fdf4;border-bottom:1px solid #e5e7eb;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td><div style="font-weight:700;font-size:15px;color:#1B4332;">${custCompany || custName}</div>${custCompany && custName && custCompany !== custName ? `<div style="font-size:12px;color:#374151;">${custName}</div>` : ""}<div style="font-size:12px;color:#6b7280;margin-top:2px;">${custEmail}${custPhone ? " &bull; " + custPhone : ""}</div></td></tr></table></td></tr>` : ""}
  ${boBanner}
  <tr><td style="padding:0 24px;"><table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">${itemRows}</table></td></tr>
  <tr><td style="padding:0 24px 16px;"><table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="width:50%;vertical-align:top;padding-right:12px;"><table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:4px;"><tr><td style="padding:8px 12px;background:#f3f4f6;font-weight:700;font-size:12px;">Payment Method</td></tr><tr><td style="padding:8px 12px;font-size:13px;">${payDisplay}</td></tr>${payMethod.toLowerCase().includes("net 30") || payMethod.toLowerCase() === "net30" ? `<tr><td style="padding:4px 12px 8px;font-size:11px;color:#b45309;font-style:italic;">Payment due within 30 days</td></tr>` : ""}${notesSection}</table></td>
    <td style="width:50%;vertical-align:top;"><table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:4px;">
      <tr><td style="padding:8px 12px;font-size:13px;">Subtotal (ex VAT)</td><td style="padding:8px 12px;text-align:right;font-size:13px;">&euro;${fmt(subtotal)}</td></tr>
      <tr style="border-top:1px solid #e5e7eb;"><td style="padding:8px 12px;font-size:13px;">Shipping</td><td style="padding:8px 12px;text-align:right;font-size:13px;">${shippingLine}</td></tr>
      ${discountLine}
      <tr style="border-top:1px solid #e5e7eb;"><td style="padding:8px 12px;font-size:13px;">VAT (23%)</td><td style="padding:8px 12px;text-align:right;font-size:13px;">&euro;${fmt(vatAmount)}</td></tr>
      <tr style="border-top:2px solid #111827;background:#f9fafb;"><td style="padding:10px 12px;font-weight:700;font-size:14px;">Total (incl. VAT)</td><td style="padding:10px 12px;text-align:right;font-weight:700;font-size:15px;color:#111827;">&euro;${fmt(totalInclVat)}</td></tr>
    </table></td>
  </tr></table></td></tr>
  <tr><td style="padding:0 24px 24px;"><table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:4px;font-size:13px;"><tr>${buildAddressBlock("Billing Address", billing, custName, custCompany, custPhone, custEmail)}${buildAddressBlock("Shipping Address", shipping_addr, custName, custCompany, custPhone)}</tr></table></td></tr>
  <tr><td style="padding:12px 24px;border-top:1px solid #e5e7eb;text-align:center;"><p style="margin:0;color:#9ca3af;font-size:11px;"><a href="${SITE}" style="color:#9ca3af;">${SITE}</a></p></td></tr>
</table></td></tr></table></body></html>`;

  const subject = custName ? `${custName} placed a new order #${orderNum} on your store` : `New order #${orderNum} on your store`;
  const replyTo = custEmail ? { email: custEmail, name: custName } : undefined;
  const payload: Record<string, unknown> = { sender: { name: "Sports Foods Ireland Ltd", email: "info@sportsfoodsireland.ie" }, to: STAFF_EMAILS, subject, htmlContent: html };
  if (replyTo) payload.replyTo = replyTo;

  const res = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) { const err = await res.json(); throw new Error(`Brevo: ${JSON.stringify(err)}`); }
  console.log(`[order-notify-staff] Sent ${orderNum} | ${custName} | BO: ${totalBO} units`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } }); }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  let order: Record<string, unknown>;
  let items: Record<string, unknown>[];

  if (body.order_id) {
    const { data: orderRow, error } = await sb.from("orders").select("*").eq("id", body.order_id).single();
    if (error || !orderRow) return new Response(JSON.stringify({ error: "Order not found" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
    order = orderRow as Record<string, unknown>;
    const { data: itemRows } = await sb.from("order_items").select("*, products(image_url, sku)").eq("order_id", body.order_id);
    items = (itemRows || []).map((i: Record<string, unknown> & { products?: Record<string, unknown> }) => ({ ...i, sku: i.products?.sku || i.product_sku || "", image_url: i.products?.image_url || i.product_image_url || "" }));
  } else if (body.order && body.items) {
    order = body.order as Record<string, unknown>;
    items = body.items as Record<string, unknown>[];
  } else {
    return new Response(JSON.stringify({ error: "Provide order_id or {order, items}" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const customer = await lookupCustomer(sb, String(order.customer_id || ""), String(order.customer_email || ""));
  try {
    await buildAndSendEmail(order, items, customer);
    return new Response(JSON.stringify({ sent: true }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
