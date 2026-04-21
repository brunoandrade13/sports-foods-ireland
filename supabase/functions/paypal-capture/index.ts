/**
 * paypal-capture v27 — tax_amount calculated + variant images in order_items
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const PAYPAL_CLIENT_ID         = Deno.env.get("PAYPAL_CLIENT_ID") ?? "";
const PAYPAL_CLIENT_SECRET      = Deno.env.get("PAYPAL_CLIENT_SECRET") ?? "";
const PAYPAL_MODE               = Deno.env.get("PAYPAL_MODE") ?? "sandbox";
const PAYPAL_BASE               = PAYPAL_MODE === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
const SUPABASE_URL              = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BREVO_API_KEY             = Deno.env.get("BREVO_API_KEY") ?? "";
const SITE_URL = "https://sportsfoodsireland.ie";
const LOGO     = `${SITE_URL}/img/logo.png`;
const CURRENCY = "EUR";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function notifyStaff(orderId: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/order-notify-staff`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ order_id: orderId }),
    });
  } catch (e) { console.warn("[paypal] notify-staff:", e); }
}

async function getAccessToken(): Promise<string> {
  const auth = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`);
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal auth: ${data.error_description || res.status}`);
  return data.access_token;
}

function toAbsoluteImageUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return `${SITE_URL}${url.startsWith("/") ? url : "/" + url}`;
}

async function getProductImages(items: Array<Record<string, unknown>>, sb: ReturnType<typeof createClient>): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  // 1. Variant images (highest priority)
  const variantIds = items.map(i => i.variant_id).filter((v): v is string => typeof v === "string" && !!v);
  if (variantIds.length) {
    const { data } = await sb.from("product_variants").select("id,image_url").in("id", variantIds);
    if (data) for (const v of data) if (v.image_url) map[`v_${v.id}`] = toAbsoluteImageUrl(v.image_url);
  }
  // 2. Product images (fallback)
  const ids = items.map(i => i.id).filter(Boolean);
  const numIds = ids.filter(id => !isNaN(Number(id)) && !String(id).includes("-")).map(Number);
  const uuidIds = ids.filter(id => String(id).includes("-"));
  if (numIds.length) {
    const { data } = await sb.from("products").select("legacy_id,image_url").in("legacy_id", numIds);
    if (data) for (const p of data) if (p.image_url) map[String(p.legacy_id)] = toAbsoluteImageUrl(p.image_url);
  }
  if (uuidIds.length) {
    const { data } = await sb.from("products").select("id,image_url").in("id", uuidIds);
    if (data) for (const p of data) if (p.image_url) map[String(p.id)] = toAbsoluteImageUrl(p.image_url);
  }
  return map;
}

function buildItemsTable(items: Array<Record<string,unknown>>, imgMap: Record<string,string>): string {
  const rows = items.map(it => {
    const vid = it.variant_id ? String(it.variant_id) : null;
    const imgUrl = (vid && imgMap[`v_${vid}`]) || imgMap[String(it.id)] || "";
    const imgTd = imgUrl
      ? `<td style="width:72px;padding:12px 10px;vertical-align:middle"><img src="${imgUrl}" width="58" height="58" style="width:58px;height:58px;object-fit:contain;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0" alt=""></td>`
      : `<td style="width:72px;padding:12px 10px;vertical-align:middle"><div style="width:58px;height:58px;background:#f1f5f9;border-radius:8px;border:1px solid #e2e8f0"></div></td>`;
    const variantBadge = it.variant_label ? `<div style="color:#64748b;font-size:11px;margin-top:2px;">${it.variant_label}</div>` : "";
    return `<tr style="border-bottom:1px solid #f1f5f9">${imgTd}<td style="padding:12px 10px;vertical-align:middle"><div style="font-weight:600;color:#1e293b;font-size:14px">${it.name||"Product"}</div>${variantBadge}<div style="color:#94a3b8;font-size:12px;margin-top:3px">Qty: ${it.qty||it.quantity||1}</div></td><td style="padding:12px 10px;text-align:right;vertical-align:middle"><span style="font-weight:700;color:#1e293b;font-size:15px">&euro;${(Number(it.price)||0).toFixed(2)}</span></td></tr>`;
  }).join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#fff">${rows}</table>`;
}

function buildEmail(p: {firstName:string, orderId:string, date:string, total:string, subtotal:string, shipping:string, method:string, itemsHtml:string}): string {
  const shippingRow = Number(p.shipping) > 0
    ? `<tr><td style="padding:5px 0;color:#64748b;font-size:14px">Shipping</td><td style="padding:5px 0;color:#1e293b;font-size:14px">&euro;${p.shipping}</td></tr>`
    : `<tr><td style="padding:5px 0;color:#64748b;font-size:14px">Shipping</td><td style="padding:5px 0;color:#22c55e;font-size:14px;font-weight:600">Free</td></tr>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f0f2f5;font-family:'Helvetica Neue',Arial,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:20px 0"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)"><tr><td style="background:linear-gradient(135deg,#1B4332,#2D6A4F);padding:28px 40px;text-align:center"><img src="${LOGO}" alt="Sports Foods Ireland" width="180" style="max-width:180px"></td></tr><tr><td style="background:#169B62;padding:16px 40px;text-align:center"><span style="color:#fff;font-size:20px;font-weight:700">&#10003; Order Confirmed</span></td></tr><tr><td style="padding:30px 40px 16px"><p style="margin:0;color:#1e293b;font-size:18px;font-weight:600">Hi ${p.firstName},</p><p style="margin:10px 0 0;color:#64748b;font-size:15px;line-height:1.6">Thank you for your order! We've received your payment and your order is being prepared.</p></td></tr><tr><td style="padding:0 40px 20px"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f8faf9;border:2px solid #d1fae5;border-radius:10px;overflow:hidden"><tr><td style="background:#169B62;padding:12px 20px"><span style="color:#fff;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px">Order Details</span></td></tr><tr><td style="padding:18px 20px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:5px 0;color:#64748b;font-size:14px;width:130px">Order Number</td><td style="padding:5px 0;color:#1e293b;font-size:14px;font-weight:700">#${p.orderId}</td></tr><tr><td style="padding:5px 0;color:#64748b;font-size:14px">Date</td><td style="padding:5px 0;color:#1e293b;font-size:14px">${p.date}</td></tr><tr><td style="padding:5px 0;color:#64748b;font-size:14px">Payment</td><td style="padding:5px 0;color:#1e293b;font-size:14px">${p.method}</td></tr>${shippingRow}<tr><td colspan="2" style="padding:10px 0 0;border-top:1px solid #d1fae5"></td></tr><tr><td style="padding:5px 0;color:#1e293b;font-size:16px;font-weight:700">Total</td><td style="padding:5px 0;color:#169B62;font-size:22px;font-weight:800">&euro;${p.total}</td></tr></table></td></tr></table></td></tr><tr><td style="padding:0 40px 24px"><p style="margin:0 0 14px;color:#1e293b;font-size:15px;font-weight:700">Items Ordered</p>${p.itemsHtml}</td></tr><tr><td style="padding:8px 40px 28px;text-align:center"><a href="${SITE_URL}/tracking.html?order=${p.orderId}" style="display:inline-block;background:#FF883E;color:#fff;padding:16px 40px;border-radius:8px;font-size:16px;font-weight:700;text-decoration:none">Track Your Order &#8594;</a></td></tr><tr><td style="background:#1B4332;padding:24px 40px;text-align:center"><img src="${LOGO}" alt="SFI" width="90" style="max-width:90px;opacity:0.8;margin-bottom:10px"><p style="margin:0 0 4px;color:#a7c4b5;font-size:12px">Sports Foods Ireland</p><p style="margin:0 0 10px;color:#6b9e87;font-size:11px">Unit 12, Northwest Business Park, Blanchardstown, Dublin D15 YC53</p><p style="margin:0;color:#6b9e87;font-size:11px"><a href="${SITE_URL}" style="color:#4ade80;text-decoration:none">sportsfoodsireland.ie</a></p></td></tr></table></td></tr></table></body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { order_id, items, email, contact, shippingAddress, coupon, attribution, shipping_cost } = await req.json();
    if (!order_id) return new Response(JSON.stringify({ error: "Missing order_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const accessToken = await getAccessToken();
    const captureRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${order_id}/capture`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });
    const capture = await captureRes.json();
    if (!captureRes.ok || capture.status !== "COMPLETED") {
      return new Response(JSON.stringify({ error: "Payment capture failed", details: capture }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const captureId   = capture.purchase_units?.[0]?.payments?.captures?.[0]?.id;
    const capturedAmt = capture.purchase_units?.[0]?.payments?.captures?.[0]?.amount;
    const payerEmail  = capture.payer?.email_address || email || "";
    const payerName   = `${capture.payer?.name?.given_name || ""} ${capture.payer?.name?.surname || ""}`.trim();
    const total       = Number(capturedAmt?.value) || 0;

    const cartItems = items || [];
    const itemsSubtotal = cartItems.reduce((s: number, i: Record<string,unknown>) => s + Number(i.price||0) * Number(i.quantity||i.qty||1), 0);
    const computedShipping = shipping_cost != null ? Number(shipping_cost) : Math.max(0, parseFloat((total - itemsSubtotal).toFixed(2)));
    // B2C prices include 23% VAT — extract the tax component
    const taxAmount = parseFloat((itemsSubtotal - itemsSubtotal / 1.23).toFixed(2));

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: dup } = await sb.from("orders").select("id").eq("stripe_payment_intent_id", `paypal_${order_id}`).maybeSingle();
    if (dup) return new Response(JSON.stringify({ status: "COMPLETED", capture_id: captureId, amount: capturedAmt, payer_email: payerEmail, order_id: capture.id }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const itemCount    = cartItems.reduce((s: number, i: Record<string,unknown>) => s + (Number(i.quantity||i.qty)||1), 0);
    const contactName  = contact ? `${contact.firstName||""} ${contact.lastName||""}`.trim() : payerName;
    const contactEmail = contact?.email || payerEmail;
    const attr = attribution || {};

    const { data: orderRow, error: orderErr } = await sb.from("orders").insert({
      stripe_payment_intent_id: `paypal_${order_id}`,
      status: "processing", payment_status: "paid", financial_status: "paid",
      total,
      subtotal: parseFloat(itemsSubtotal.toFixed(2)),
      shipping_total: parseFloat(computedShipping.toFixed(2)),
      shipping_cost: parseFloat(computedShipping.toFixed(2)),
      tax_amount: taxAmount,
      tax_total: taxAmount,
      discount_total: 0,
      currency: CURRENCY,
      customer_email: contactEmail, customer_name: contactName, customer_phone: contact?.phone||"",
      shipping_address: shippingAddress || capture.purchase_units?.[0]?.shipping || {}, billing_address: {},
      coupon_code: coupon?.code||null, source: "web", order_source: "website", payment_method: "paypal", item_count: itemCount,
      attribution_source_type: attr.attribution_source_type||null, attribution_utm_source: attr.attribution_utm_source||null, attribution_device_type: attr.attribution_device_type||null,
    }).select("id, order_number").single();

    if (orderErr) {
      console.error("[paypal-capture] Order insert error:", JSON.stringify(orderErr));
    } else {
      const oid = orderRow?.order_number || `SFI-${orderRow?.id?.slice(0,8)}`;
      if (cartItems.length && orderRow?.id) {
        // Pre-fetch variant images
        const vids = cartItems.map((i: Record<string,unknown>) => i.variant_id).filter((v): v is string => typeof v === "string" && !!v);
        const variantImgMap: Record<string, string> = {};
        if (vids.length) {
          const { data: vRows } = await sb.from("product_variants").select("id,image_url").in("id", vids);
          if (vRows) for (const v of vRows) if (v.image_url) variantImgMap[v.id] = v.image_url;
        }
        for (const it of cartItems) {
          const pid = it.id ? String(it.id) : null;
          const isUuid = pid && /^[0-9a-f]{8}-/.test(pid);
          let resolvedPid: string|null = isUuid ? pid : null;
          if (!resolvedPid && pid && !isNaN(Number(pid))) {
            const { data: pRow } = await sb.from("products").select("id").eq("legacy_id", Number(pid)).maybeSingle();
            if (pRow) resolvedPid = pRow.id;
          }
          const vid = it.variant_id ? String(it.variant_id) : null;
          const resolvedVariantId = (vid && /^[0-9a-f]{8}-/.test(vid)) ? vid : null;
          const variantImg = resolvedVariantId ? (variantImgMap[resolvedVariantId] || null) : null;
          await sb.from("order_items").insert({
            order_id: orderRow.id, product_id: resolvedPid,
            product_name: String(it.name||"Product"),
            variant_id: resolvedVariantId,
            variant_label: it.variant_label ? String(it.variant_label) : null,
            quantity: Number(it.quantity||it.qty||1),
            unit_price: Number(it.price||0),
            total_price: Number(it.price||0) * Number(it.quantity||it.qty||1),
            product_image_url: variantImg || null,
          });
        }
      }
      if (orderRow?.id) await notifyStaff(orderRow.id);
      if (contactEmail && BREVO_API_KEY) {
        try {
          const imgMap    = await getProductImages(cartItems, sb);
          const itemsHtml = buildItemsTable(cartItems, imgMap);
          const html = buildEmail({ firstName: contactName.split(" ")[0]||"Customer", orderId: oid, date: new Date().toLocaleDateString("en-IE"), total: total.toFixed(2), subtotal: itemsSubtotal.toFixed(2), shipping: computedShipping.toFixed(2), method: "PayPal", itemsHtml });
          await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ sender: { name: "Sports Foods Ireland", email: "info@sportsfoodsireland.ie" }, to: [{ email: contactEmail, name: contactName }], subject: `Order Confirmed #${oid} \u2705`, htmlContent: html }) });
        } catch (e) { console.warn("[paypal-capture] Email error:", e); }
      }
    }
    return new Response(JSON.stringify({ status: "COMPLETED", capture_id: captureId, amount: capturedAmt, payer_email: payerEmail, order_id: capture.id, sfi_order: oid }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[paypal-capture] Error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unexpected error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
