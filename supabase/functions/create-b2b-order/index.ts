/**
 * create-b2b-order v9 — variant images in email + product_image_url in order_items
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const SITE_URL = 'https://sportsfoodsireland.ie';
const LOGO = `${SITE_URL}/img/logo.png`;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

async function notifyStaff(orderId: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/order-notify-staff`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ order_id: orderId }),
    });
  } catch (e) { console.warn("[b2b] notify-staff:", e); }
}

function toAbsImg(url: string) {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return `${SITE_URL}${url.startsWith("/") ? url : "/" + url}`;
}

async function resolveB2BPrice(item: Record<string, unknown>, sb: ReturnType<typeof createClient>): Promise<number> {
  const rawId = item.id ? String(item.id) : null;
  const variantId = item.variant_id ? String(item.variant_id) : null;
  if (variantId) {
    const { data: vRow } = await sb.from("product_variants").select("wholesale_price, price").eq("id", variantId).single();
    if (vRow && vRow.wholesale_price > 0) return Number(vRow.wholesale_price);
    if (vRow && vRow.price > 0) return Number(vRow.price);
  }
  if (rawId) {
    const isUuid = /^[0-9a-f]{8}-/.test(rawId);
    const filter = isUuid ? `id=eq.${rawId}` : `legacy_id=eq.${rawId}`;
    const { data: pRows } = await sb.from("products").select("wholesale_price_eur, price_eur").or(filter);
    const p = pRows?.[0];
    if (p) {
      const ws = Number(p.wholesale_price_eur); const rt = Number(p.price_eur);
      if (ws > 0 && ws < rt) return ws;
      if (rt > 0) return rt;
    }
  }
  const clientPrice = Number(item.price) || 0;
  console.warn(`[b2b] FALLBACK to client price ${clientPrice} for item id=${rawId} variant=${variantId}`);
  return clientPrice;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { items, email, currency = "EUR", shippingAddress, contact, coupon, payment_method } = await req.json();
    if (!items?.length) return new Response(JSON.stringify({ error: "Cart is empty" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    if (!payment_method || !["net30", "cod"].includes(payment_method)) return new Response(JSON.stringify({ error: "Invalid payment" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    let customerId: string | null = null;
    if (email) {
      const { data: custRow } = await sb.from("customers").select("id").eq("email", email.trim().toLowerCase()).limit(1).single();
      if (custRow) customerId = custRow.id;
    }

    const resolvedItems = await Promise.all(items.map(async (it: Record<string, unknown>) => {
      const serverPrice = await resolveB2BPrice(it, sb);
      const clientPrice = Number(it.price) || 0;
      if (Math.abs(serverPrice - clientPrice) > 0.01) console.warn(`[b2b] PRICE OVERRIDE: client sent ${clientPrice}, using DB price ${serverPrice} for "${it.name}"`);
      return { ...it, price: serverPrice };
    }));

    const { data: oidData } = await sb.rpc("generate_sfi_order_number");
    const orderId = oidData || ("SFI-" + Date.now().toString().slice(-8));
    const subtotal = resolvedItems.reduce((s: number, i: Record<string, unknown>) => s + Number(i.price) * (Number(i.quantity) || 1), 0);
    let shipCost = subtotal >= 150 ? 0 : 9.04;
    let discount = 0;
    if (coupon) {
      if (coupon.type === "percent") discount = subtotal * coupon.value / 100;
      else if (coupon.type === "fixed") discount = coupon.value;
      else if (coupon.type === "shipping") shipCost = 0;
      if (coupon.freeShipping) shipCost = 0;
    }
    const total = subtotal - discount + shipCost;
    const methodLabel = payment_method === "net30" ? "Net 30 (Invoice)" : "Cash on Delivery";
    const customerName = contact ? `${contact.firstName || ""} ${contact.lastName || ""}`.trim() : "";

    const { data: orderRow, error } = await sb.from("orders").insert({
      order_number: orderId, status: "processing", payment_status: "pending", financial_status: "pending",
      total, subtotal, shipping_cost: shipCost, discount_amount: discount, currency: currency.toUpperCase(),
      customer_email: email || "", customer_name: customerName, customer_phone: contact?.phone || "",
      customer_id: customerId,
      shipping_address: shippingAddress || {}, billing_address: shippingAddress || {},
      coupon_code: coupon?.code || null, source: "web", order_source: "b2b_portal", payment_method: methodLabel,
      item_count: resolvedItems.reduce((s: number, i: Record<string, unknown>) => s + (Number(i.quantity) || 1), 0),
      notes: payment_method === "net30" ? "Payment due within 30 days" : "Cash on delivery",
    }).select("id").single();
    if (error) throw new Error(error.message);

    if (orderRow?.id) {
      const numericIds = resolvedItems.map((it: Record<string, unknown>) => it.id).filter((id: unknown) => id != null && !isNaN(Number(id)) && !String(id).includes("-")).map(Number);
      const legacyMap: Record<number, string> = {};
      if (numericIds.length) {
        const { data: pRows } = await sb.from("products").select("id,legacy_id").in("legacy_id", numericIds);
        if (pRows) for (const p of pRows) legacyMap[p.legacy_id] = p.id;
      }
      const variantIds = resolvedItems.map((it: Record<string, unknown>) => it.variant_id || it.variantId).filter((v): v is string => !!v && typeof v === "string");
      const variantImgMap: Record<string, string> = {};
      if (variantIds.length) {
        const { data: vRows } = await sb.from("product_variants").select("id, image_url").in("id", variantIds);
        if (vRows) for (const v of vRows) if (v.image_url) variantImgMap[v.id] = v.image_url;
      }
      for (const it of resolvedItems) {
        const rawId = it.id ? String(it.id) : null;
        let productId: string | null = null;
        if (rawId) {
          if (/^[0-9a-f]{8}-/.test(rawId)) productId = rawId;
          else if (!isNaN(Number(rawId))) productId = legacyMap[Number(rawId)] || null;
        }
        const variantId = String(it.variantId || it.variant_id || "");
        const variantImg = variantId ? variantImgMap[variantId] : null;
        await sb.from("order_items").insert({
          order_id: orderRow.id,
          product_id: productId,
          product_name: String(it.name || "Product"),
          quantity: Number(it.quantity) || 1,
          unit_price: Number(it.price) || 0,
          total_price: (Number(it.price) || 0) * (Number(it.quantity) || 1),
          variant_id: variantId || null,
          variant_label: String(it.variant || it.variant_label || "") || null,
          product_image_url: variantImg || null,
        });
      }
      await notifyStaff(orderRow.id);
    }

    if (email && BREVO_API_KEY) {
      try {
        const imgMap = await getProductImages(resolvedItems, sb);
        const itemsHtml = buildItemsTable(resolvedItems, imgMap);
        const html = buildEmail({ firstName: contact?.firstName || "Customer", orderId, date: new Date().toLocaleDateString("en-IE"), total: total.toFixed(2), method: methodLabel, itemsHtml });
        await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST", headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ sender: { name: "Sports Foods Ireland", email: "stores@sportsfoodsireland.ie" }, to: [{ email, name: customerName }], subject: `Order Confirmed #${orderId} \u2705`, htmlContent: html }),
        });
      } catch (e) { console.warn("[b2b] email:", e); }
    }

    return new Response(JSON.stringify({ success: true, order_number: orderId, total, payment_method: methodLabel }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[b2b]", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Error" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});

async function getProductImages(items: Array<Record<string,unknown>>, sb: ReturnType<typeof createClient>): Promise<Record<string,string>> {
  const map: Record<string,string> = {};
  const variantIds = items.map(i => i.variant_id || i.variantId).filter((v): v is string => !!v && typeof v === "string");
  if (variantIds.length) {
    const { data } = await sb.from("product_variants").select("id, image_url").in("id", variantIds);
    if (data) for (const v of data) if (v.image_url) map[String(v.id)] = toAbsImg(v.image_url);
  }
  const numIds = items.map(i => i.id).filter(id => id != null && !isNaN(Number(id)) && !String(id).includes("-")).map(Number);
  const uuidIds = items.map(i => String(i.id)).filter(id => id.includes("-"));
  if (numIds.length) {
    const { data } = await sb.from("products").select("legacy_id,image_url").in("legacy_id", numIds);
    if (data) for (const p of data) if (p.image_url) map[`prod_${p.legacy_id}`] = toAbsImg(p.image_url);
  }
  if (uuidIds.length) {
    const { data } = await sb.from("products").select("id,image_url").in("id", uuidIds);
    if (data) for (const p of data) if (p.image_url) map[`prod_${p.id}`] = toAbsImg(p.image_url);
  }
  return map;
}

function buildItemsTable(items: Array<Record<string,unknown>>, imgMap: Record<string,string>): string {
  const rows = items.map(it => {
    const variantId = String(it.variant_id || it.variantId || "");
    const imgUrl = (variantId && imgMap[variantId]) || imgMap[`prod_${it.id}`] || "";
    const imgTd = imgUrl
      ? `<td style="width:72px;padding:12px 10px;vertical-align:middle"><img src="${imgUrl}" width="58" height="58" style="width:58px;height:58px;object-fit:contain;border-radius:8px;border:1px solid #e2e8f0" alt=""></td>`
      : `<td style="width:72px;padding:12px 10px"><div style="width:58px;height:58px;background:#f1f5f9;border-radius:8px"></div></td>`;
    const variantLabel = String(it.variant || it.variant_label || "");
    const variantHtml = variantLabel ? `<div style="color:#94a3b8;font-size:12px;margin-top:2px">${variantLabel}</div>` : "";
    return `<tr style="border-bottom:1px solid #f1f5f9">${imgTd}<td style="padding:12px 10px;vertical-align:middle"><div style="font-weight:600;color:#1e293b;font-size:14px">${it.name||"Product"}</div>${variantHtml}<div style="color:#94a3b8;font-size:12px;margin-top:3px">Qty: ${it.quantity||1}</div></td><td style="padding:12px 10px;text-align:right;vertical-align:middle"><span style="font-weight:700;color:#1e293b;font-size:15px">\u20ac${(Number(it.price)||0).toFixed(2)}</span></td></tr>`;
  }).join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#fff">${rows}</table>`;
}

function buildEmail(p: {firstName:string,orderId:string,date:string,total:string,method:string,itemsHtml:string}): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f0f2f5;font-family:'Helvetica Neue',Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:20px 0"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden"><tr><td style="background:linear-gradient(135deg,#1B4332,#2D6A4F);padding:28px 40px;text-align:center"><img src="${LOGO}" alt="Sports Foods Ireland" width="180"></td></tr><tr><td style="background:#169B62;padding:16px 40px;text-align:center"><span style="color:#fff;font-size:20px;font-weight:700">\u2713 Order Confirmed</span></td></tr><tr><td style="padding:30px 40px 16px"><p style="margin:0;color:#1e293b;font-size:18px;font-weight:600">Hi ${p.firstName},</p><p style="margin:10px 0 0;color:#64748b;font-size:15px">Thank you! Your order is confirmed and will be processed shortly.</p></td></tr><tr><td style="padding:0 40px 20px"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f8faf9;border:2px solid #d1fae5;border-radius:10px;overflow:hidden"><tr><td style="background:#169B62;padding:12px 20px"><span style="color:#fff;font-size:13px;font-weight:700;text-transform:uppercase">Order Details</span></td></tr><tr><td style="padding:18px 20px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:5px 0;color:#64748b;font-size:14px;width:130px">Order Number</td><td style="padding:5px 0;color:#1e293b;font-size:14px;font-weight:700">#${p.orderId}</td></tr><tr><td style="padding:5px 0;color:#64748b;font-size:14px">Date</td><td style="padding:5px 0;color:#1e293b;font-size:14px">${p.date}</td></tr><tr><td style="padding:5px 0;color:#64748b;font-size:14px">Payment</td><td style="padding:5px 0;color:#1e293b;font-size:14px">${p.method}</td></tr><tr><td colspan="2" style="padding:10px 0 0;border-top:1px solid #d1fae5"></td></tr><tr><td style="padding:5px 0;color:#1e293b;font-size:16px;font-weight:700">Total</td><td style="padding:5px 0;color:#169B62;font-size:22px;font-weight:800">\u20ac${p.total}</td></tr></table></td></tr></table></td></tr><tr><td style="padding:0 40px 24px"><p style="margin:0 0 14px;color:#1e293b;font-size:15px;font-weight:700">Items Ordered</p>${p.itemsHtml}</td></tr><tr><td style="background:#1B4332;padding:24px 40px;text-align:center"><img src="${LOGO}" alt="SFI" width="90" style="opacity:0.8;margin-bottom:10px"><p style="margin:0;color:#6b9e87;font-size:11px">Sports Foods Ireland \u00b7 <a href="${SITE_URL}" style="color:#4ade80">sportsfoodsireland.ie</a></p></td></tr></table></td></tr></table></body></html>`;
}
