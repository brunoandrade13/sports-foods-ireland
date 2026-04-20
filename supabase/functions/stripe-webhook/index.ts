/**
 * stripe-webhook — Supabase Edge Function
 * Receives Stripe events after payment and saves orders to Supabase.
 *
 * Handles:
 *   - checkout.session.completed  → save order as 'paid', trigger QB sync
 *   - payment_intent.payment_failed → update order status to 'failed'
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req: Request) => {
  // Stripe sends a POST with signature header
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  const body = await req.text();

  // Verify webhook signature to prevent spoofed requests
  let event: StripeEvent;
  try {
    event = await verifyStripeSignature(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  console.log(`[stripe-webhook] Event: ${event.type}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutComplete(
        event.data.object as unknown as StripeSession,
        supabase,
      );
    } else if (event.type === "payment_intent.payment_failed") {
      await handlePaymentFailed(
        event.data.object as unknown as StripePaymentIntent,
        supabase,
      );
    }
    // Other events are acknowledged but ignored
  } catch (err) {
    console.error("[stripe-webhook] Handler error:", err);
    // Return 200 so Stripe doesn't retry — log the error internally
    return new Response(
      JSON.stringify({ received: true, error: String(err) }),
      { status: 200 },
    );
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

// ---- Event Handlers ----

async function handleCheckoutComplete(
  session: StripeSession,
  supabase: ReturnType<typeof createClient>,
) {
  // IDEMPOTENCY CHECK: prevent duplicate orders if Stripe retries the webhook
  const { data: alreadyProcessed } = await supabase
    .from("processed_webhook_events")
    .select("event_id")
    .eq("event_id", session.id)
    .maybeSingle();

  if (alreadyProcessed) {
    console.log(
      `[stripe-webhook] Session ${session.id} already processed — skipping duplicate`,
    );
    return;
  }

  const metadata = session.metadata || {};
  // items_json is now array of [id, qty, price] arrays (compact to avoid Stripe 500-char limit)
  const rawItems = safeJson(metadata.items_json, []);
  const variantIds: Record<string, string> = safeJson(metadata.variant_ids, {});
  const itemNames: string[] = safeJson(metadata.item_names, []);

  // Reconstruct items from compact format
  const items = Array.isArray(rawItems)
    ? rawItems.map((item: unknown, idx: number) => {
        if (Array.isArray(item)) {
          // New compact format: [id, qty, price]
          return {
            id: item[0],
            qty: item[1],
            quantity: item[1],
            price: item[2],
            name: itemNames[idx] || String(item[0]),
            variant_id: variantIds[String(idx)] || undefined,
          };
        }
        // Legacy format (object) — backwards compatibility
        const it = item as Record<string, unknown>;
        return { ...it, variant_id: it.vid || it.variant_id || variantIds[String(idx)] };
      })
    : [];
  const shipping = safeJson(metadata.shipping_json, {});

  // Generate a readable order ID
  const orderId = `SFI-${Date.now().toString(36).toUpperCase()}`;

  // Calculate correct financial values from Stripe session
  const totalEur = (session.amount_total ?? 0) / 100;
  const shippingEur = (session.shipping_cost?.amount_total ?? 0) / 100;
  const subtotalEur = totalEur - shippingEur;
  // VAT is included in prices (Irish VAT 23%) — extract it
  const taxEur = parseFloat((subtotalEur - subtotalEur / 1.23).toFixed(2));

  const orderData = {
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent ?? null,
    status: "processing",
    payment_status: "paid",
    financial_status: "paid",
    total: totalEur,
    subtotal: subtotalEur,
    shipping_cost: shippingEur,
    shipping_total: shippingEur,
    tax_amount: taxEur,
    tax_total: taxEur,
    currency: (session.currency ?? "eur").toUpperCase(),
    customer_email:
      session.customer_details?.email ?? session.customer_email ?? "",
    customer_name: session.customer_details?.name ?? "",
    customer_phone: session.customer_details?.phone ?? "",
    shipping_address: {
      ...shipping,
      stripe_shipping: session.shipping_details ?? null,
    },
    coupon_code: metadata.coupon_code || null,
    source: "website_direct",
    order_source: metadata.is_b2b === "1" ? "b2b_portal" : "website",
    is_b2b: metadata.is_b2b === "1",
    payment_method: "stripe",
  };

  console.log(
    `[stripe-webhook] Saving order ${orderId} for ${orderData.customer_email}`,
  );

  const { data: insertedOrder, error } = await supabase
    .from("orders")
    .insert({ ...orderData, order_number: orderId })
    .select("id")
    .single();

  if (error) {
    console.error("[stripe-webhook] Failed to save order:", error);
    throw new Error(`DB insert failed: ${error.message}`);
  }

  // Mark session as processed to prevent duplicates on Stripe retries
  await supabase.from("processed_webhook_events").insert({
    event_id: session.id,
    event_type: "checkout.session.completed",
  });

  // ---- Create order_items from metadata.items_json ----
  if (insertedOrder?.id && items.length > 0) {
    await insertOrderItems(supabase, insertedOrder.id, items);
  }

  console.log(`[stripe-webhook] Order ${orderId} saved with ${items.length} items`);

  // Trigger staff notification email (fire-and-forget)
  supabase.functions.invoke("order-notify-staff", {
    body: { order_id: insertedOrder?.id },
  }).catch((e: unknown) => console.warn("[stripe-webhook] Staff notify failed:", e));

  // Send customer confirmation email (fire-and-forget)
  if (orderData.customer_email && insertedOrder?.id) {
    sendCustomerConfirmation({
      orderId,
      dbOrderId: insertedOrder.id,
      customerEmail: orderData.customer_email,
      customerName: orderData.customer_name,
      items,
      total: totalEur,
      shippingCost: shippingEur,
      paymentMethod: "Card / PayPal",
      supabase,
    }).catch((e: unknown) => console.warn("[stripe-webhook] Customer email failed:", e));
  }

  // Optionally trigger QB sync (fire-and-forget, don't block webhook response)
  triggerQBSync(supabase, orderId).catch((e) =>
    console.warn("[stripe-webhook] QB sync failed (non-critical):", e),
  );
}

// ---- Customer Confirmation Email ----
const SITE_URL = "https://sportsfoodsireland.ie";
const LOGO = `${SITE_URL}/img/logo.png`;
const BREVO_KEY = () => Deno.env.get("BREVO_API_KEY") ?? "";

async function sendCustomerConfirmation(p: {
  orderId: string;
  dbOrderId: string;
  customerEmail: string;
  customerName: string;
  items: Array<Record<string, unknown>>;
  total: number;
  shippingCost: number;
  paymentMethod: string;
  supabase: ReturnType<typeof createClient>;
}) {
  const brevoKey = BREVO_KEY();
  if (!brevoKey) return;

  // Build variant image + label map from product_variants
  const variantIds = p.items
    .map(i => i.variant_id)
    .filter((v): v is string => !!v && typeof v === "string");
  const variantImageMap = new Map<string, string>();
  const variantLabelMap = new Map<string, string>();
  if (variantIds.length > 0) {
    const { data: variants } = await p.supabase
      .from("product_variants")
      .select("id, image_url, label")
      .in("id", variantIds);
    for (const v of variants || []) {
      if (v.image_url) variantImageMap.set(v.id, v.image_url);
      if (v.label) variantLabelMap.set(v.id, v.label);
    }
  }

  // Build product image map (fallback)
  const productImageMap = new Map<string, string>();
  const numIds = p.items.map(i => i.id).filter((id): id is string | number => id != null && !isNaN(Number(id)) && !String(id).includes('-')).map(Number);
  const uuidIds = p.items.map(i => String(i.id)).filter(id => id.includes('-'));
  if (numIds.length) {
    const { data } = await p.supabase.from("products").select("legacy_id,image_url").in("legacy_id", numIds);
    for (const r of data || []) if (r.image_url) productImageMap.set(String(r.legacy_id), toAbsImg(r.image_url));
  }
  if (uuidIds.length) {
    const { data } = await p.supabase.from("products").select("id,image_url").in("id", uuidIds);
    for (const r of data || []) if (r.image_url) productImageMap.set(r.id, toAbsImg(r.image_url));
  }

  const firstName = p.customerName?.split(" ")[0] || "Customer";
  const date = new Date().toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" });
  const subtotal = p.total - p.shippingCost;

  const itemRows = p.items.map(item => {
    // metadata uses compact keys vid/vlb
    const variantId = (String(item.vid||item.variant_id||"")) || undefined;
    if (!item.variant_label && !item.vlb && variantId && variantLabelMap.has(variantId)) {
      (item as Record<string,unknown>).variant_label = variantLabelMap.get(variantId);
    }
    if (!item.variant_label && item.vlb) (item as Record<string,unknown>).variant_label = item.vlb;
    const imgUrl = (variantId && variantImageMap.get(variantId))
      || productImageMap.get(String(item.id))
      || (item.image as string | undefined)
      || "";
    const absImg = imgUrl && !imgUrl.startsWith("http") ? `${SITE_URL}/${imgUrl.replace(/^\//,"")}` : imgUrl;
    const imgHtml = absImg
      ? `<td style="width:72px;padding:10px;vertical-align:middle"><img src="${absImg}" width="56" height="56" style="width:56px;height:56px;object-fit:contain;border-radius:8px;border:1px solid #e2e8f0" alt=""></td>`
      : `<td style="width:72px;padding:10px"><div style="width:56px;height:56px;background:#f1f5f9;border-radius:8px"></div></td>`;
    const rawName = String(item.name || "Product");
    const variantLabel = String(item.variant_label || "");
    let cleanName = rawName;
    if (variantLabel && cleanName.includes(" — " + variantLabel)) cleanName = cleanName.replace(" — " + variantLabel, "").trim();
    const variantHtml = variantLabel ? `<div style="color:#94a3b8;font-size:12px;margin-top:2px">${variantLabel}</div>` : "";
    const lineTotal = (Number(item.price) || 0) * (Number(item.qty || item.quantity) || 1);
    return `<tr style="border-bottom:1px solid #f1f5f9">${imgHtml}<td style="padding:10px;vertical-align:middle"><div style="font-weight:600;color:#1e293b;font-size:14px">${cleanName}</div>${variantHtml}<div style="color:#94a3b8;font-size:12px;margin-top:2px">Qty: ${item.qty || item.quantity || 1}</div></td><td style="padding:10px;text-align:right;vertical-align:middle;font-weight:700;color:#1e293b;font-size:14px">€${lineTotal.toFixed(2)}</td></tr>`;
  }).join("");

  const shippingLine = p.shippingCost > 0
    ? `<tr><td style="padding:5px 0;color:#64748b;font-size:13px">Shipping</td><td style="padding:5px 0;color:#1e293b;font-size:13px;text-align:right">€${p.shippingCost.toFixed(2)}</td></tr>`
    : `<tr><td style="padding:5px 0;color:#64748b;font-size:13px">Shipping</td><td style="padding:5px 0;color:#16a34a;font-size:13px;font-weight:600;text-align:right">Free</td></tr>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f0f2f5;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:20px 0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden">
<tr><td style="background:linear-gradient(135deg,#1B4332,#2D6A4F);padding:28px 40px;text-align:center"><img src="${LOGO}" alt="Sports Foods Ireland" width="180"></td></tr>
<tr><td style="background:#169B62;padding:14px 40px;text-align:center"><span style="color:#fff;font-size:20px;font-weight:700">✓ Order Confirmed</span></td></tr>
<tr><td style="padding:28px 40px 16px"><p style="margin:0;color:#1e293b;font-size:18px;font-weight:600">Hi ${firstName},</p><p style="margin:10px 0 0;color:#64748b;font-size:15px">Thank you for your order! We’re preparing it for dispatch and will send you a shipping confirmation soon.</p></td></tr>
<tr><td style="padding:0 40px 20px">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8faf9;border:2px solid #d1fae5;border-radius:10px;overflow:hidden">
<tr><td style="background:#169B62;padding:10px 20px"><span style="color:#fff;font-size:12px;font-weight:700;text-transform:uppercase">Order Details</span></td></tr>
<tr><td style="padding:16px 20px">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding:4px 0;color:#64748b;font-size:13px;width:120px">Order number</td><td style="padding:4px 0;color:#1e293b;font-size:13px;font-weight:700">#${p.orderId}</td></tr>
<tr><td style="padding:4px 0;color:#64748b;font-size:13px">Date</td><td style="padding:4px 0;color:#1e293b;font-size:13px">${date}</td></tr>
<tr><td style="padding:4px 0;color:#64748b;font-size:13px">Payment</td><td style="padding:4px 0;color:#1e293b;font-size:13px">${p.paymentMethod}</td></tr>
<tr><td colspan="2" style="padding:10px 0 0;border-top:1px solid #d1fae5"></td></tr>
<tr><td style="padding:4px 0;color:#1e293b;font-size:15px;font-weight:700">Total</td><td style="padding:4px 0;color:#169B62;font-size:20px;font-weight:800">€${p.total.toFixed(2)}</td></tr>
</table></td></tr></table></td></tr>
<tr><td style="padding:0 40px 24px"><p style="margin:0 0 12px;color:#1e293b;font-size:15px;font-weight:700">Items Ordered</p>
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">${itemRows}</table>
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">${shippingLine}
<tr style="border-top:2px solid #e2e8f0"><td style="padding:8px 0;font-weight:700;color:#1e293b;font-size:15px">Total</td><td style="padding:8px 0;font-weight:700;color:#1e293b;font-size:15px;text-align:right">€${p.total.toFixed(2)}</td></tr>
</table></td></tr>
<tr><td style="padding:0 40px 28px;text-align:center"><p style="color:#64748b;font-size:13px;margin:0 0 16px">Questions? Contact us at <a href="mailto:info@sportsfoodsireland.ie" style="color:#169B62">info@sportsfoodsireland.ie</a> or call +353 1 840 0403</p>
<a href="${SITE_URL}/shop.html" style="display:inline-block;background:#169B62;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px">Continue Shopping</a></td></tr>
<tr><td style="background:#1B4332;padding:20px 40px;text-align:center"><img src="${LOGO}" alt="SFI" width="80" style="opacity:.8;margin-bottom:8px"><p style="margin:0;color:#6b9e87;font-size:11px">Sports Foods Ireland · <a href="${SITE_URL}" style="color:#4ade80">sportsfoodsireland.ie</a></p></td></tr>
</table></td></tr></table></body></html>`;

  await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": brevoKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: { name: "Sports Foods Ireland", email: "stores@sportsfoodsireland.ie" },
      to: [{ email: p.customerEmail, name: p.customerName || "Customer" }],
      subject: `Order Confirmed #${p.orderId} ✅`,
      htmlContent: html,
    }),
  });
  console.log(`[stripe-webhook] Customer confirmation email sent to ${p.customerEmail}`);
}

function toAbsImg(url: string): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return `${SITE_URL}/${url.replace(/^\//, "")}`;
}

// ---- Insert order items with variant image lookup ----
async function insertOrderItems(
  supabase: ReturnType<typeof createClient>,
  orderId: string,
  items: Array<Record<string, unknown>>,
) {
  // Lookup variant images from product_variants in one query
  const variantIds = items
    .map((i) => i.variant_id)
    .filter((v): v is string => !!v && typeof v === "string");

  const variantImageMap = new Map<string, string>();
  const variantLabelMap = new Map<string, string>();

  if (variantIds.length > 0) {
    const { data: variants } = await supabase
      .from("product_variants")
      .select("id, image_url, label")
      .in("id", variantIds);

    for (const v of variants || []) {
      if (v.image_url) variantImageMap.set(v.id, v.image_url);
      if (v.label) variantLabelMap.set(v.id, v.label);
    }
  }

  // Build order_items rows
  const rows = items.map((item) => {
    // metadata uses compact keys vid/vlb
    const variantId = (String(item.vid||item.variant_id||"")) || undefined;
    // Enrich variant_label from DB if not in metadata (compact format omits it)
    if (!item.variant_label && !item.vlb && variantId && variantLabelMap.has(variantId)) {
      (item as Record<string,unknown>).variant_label = variantLabelMap.get(variantId);
    }
    if (!item.variant_label && item.vlb) (item as Record<string,unknown>).variant_label = item.vlb;
    const variantImage = variantId ? variantImageMap.get(variantId) || null : null;
    // Use variant image if available, else product image from item
    const imageUrl = variantImage || (item.image as string | undefined) || null;

    // Clean product name: extract base name (before " — variantLabel")
    const rawName = String(item.name || "Product");
    const variantLabel = String(item.variant_label || "");
    let productName = rawName;
    if (variantLabel && rawName.includes(" — " + variantLabel)) {
      productName = rawName.replace(" — " + variantLabel, "").trim();
    } else if (variantLabel && rawName.endsWith(" — " + variantLabel.split(" — ")[0])) {
      // Partial match — strip last " — X"
      const lastDash = rawName.lastIndexOf(" — ");
      if (lastDash > 0) productName = rawName.substring(0, lastDash).trim();
    }

    const qty = Number(item.qty || item.quantity || 1);
    const price = Number(item.price || 0);

    return {
      order_id: orderId,
      product_id: typeof item.id === "string" && item.id.includes("-") ? item.id : null,
      variant_id: variantId || null,
      product_name: productName,
      variant_label: variantLabel || null,
      quantity: qty,
      unit_price: price,
      total_price: price * qty,
      product_image_url: imageUrl,
      requires_shipping: true,
      fulfillment_status: "unfulfilled",
    };
  });

  const { error } = await supabase.from("order_items").insert(rows);
  if (error) {
    console.error("[stripe-webhook] Failed to insert order_items:", error);
  } else {
    console.log(`[stripe-webhook] Inserted ${rows.length} order_items for order ${orderId}`);
  }
}

async function handlePaymentFailed(
  pi: StripePaymentIntent,
  supabase: ReturnType<typeof createClient>,
) {
  console.log(`[stripe-webhook] Payment failed for intent: ${pi.id}`);

  // Update any order that was pre-created with pending status
  await supabase
    .from("orders")
    .update({ status: "payment_failed" })
    .eq("stripe_payment_intent_id", pi.id); // fix: coluna correcta é stripe_payment_intent_id
}

// ---- QuickBooks Sync Trigger ----

async function triggerQBSync(
  _supabase: ReturnType<typeof createClient>,
  orderId: string,
) {
  // Call the existing qb-sync-orders function
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const res = await fetch(`${supabaseUrl}/functions/v1/qb-sync-orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ order_id: orderId, source: "stripe_webhook" }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`QB sync returned ${res.status}: ${err}`);
  }

  console.log(`[stripe-webhook] QB sync triggered for order ${orderId}`);
}

// ---- Stripe Signature Verification ----
// (Manual implementation — no external Stripe SDK needed in Deno)

async function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
): Promise<StripeEvent> {
  if (!secret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET environment variable is required but not set. " +
        "Webhook signature verification cannot be skipped for security reasons.",
    );
  }

  const parts = header
    .split(",")
    .reduce<Record<string, string>>((acc, part) => {
      const [k, v] = part.split("=");
      acc[k] = v;
      return acc;
    }, {});

  const timestamp = parts["t"];
  const signature = parts["v1"];

  if (!timestamp || !signature)
    throw new Error("Invalid stripe-signature format");

  // Verify timestamp is within 5 minutes to prevent replay attacks
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    throw new Error("Stripe webhook timestamp too old");
  }

  // Compute expected signature using Web Crypto API (available in Deno)
  const signingPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signingPayload),
  );
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (expected !== signature) throw new Error("Stripe signature mismatch");

  return JSON.parse(payload) as StripeEvent;
}

// ---- Type helpers ----

function safeJson<T>(str: string | undefined, fallback: T): T {
  try {
    return str ? JSON.parse(str) : fallback;
  } catch {
    return fallback;
  }
}

interface StripeEvent {
  type: string;
  data: { object: Record<string, unknown> };
}
interface StripeSession {
  id: string;
  payment_intent?: string;
  amount_total?: number;
  currency?: string;
  customer_email?: string;
  customer_details?: { email?: string; name?: string; phone?: string };
  shipping_details?: Record<string, unknown>;
  metadata?: Record<string, string>;
}
interface StripePaymentIntent {
  id: string;
}
