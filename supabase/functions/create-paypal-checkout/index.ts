/**
 * create-paypal-checkout v25 — fix double access token fetch
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PAYPAL_CLIENT_ID     = Deno.env.get("PAYPAL_CLIENT_ID") ?? "";
const PAYPAL_CLIENT_SECRET = Deno.env.get("PAYPAL_CLIENT_SECRET") ?? "";
const PAYPAL_MODE          = Deno.env.get("PAYPAL_MODE") ?? "sandbox";
const PAYPAL_BASE          = PAYPAL_MODE === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

const CURRENCY = "EUR";
const FREE_SHIP_MIN_B2C = 60;
const FREE_SHIP_MIN_B2B = 150;
const SHIPPING_COST     = 9.04;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function getPayPalAccessToken(): Promise<string> {
  const auth = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`);
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`PayPal auth failed: ${data.error_description || res.status}`);
  return data.access_token;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
      return new Response(JSON.stringify({ error: "PayPal not configured." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { items, email, shippingAddress, contact, coupon, is_b2b, return_base } = await req.json();
    if (!items?.length) {
      return new Response(JSON.stringify({ error: "Cart is empty" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const siteUrl = Deno.env.get("SITE_URL") || "https://sportsfoodsireland.ie";
    let baseUrl = return_base;
    if (!baseUrl || baseUrl === "null") {
      const originUrl = req.headers.get("origin");
      baseUrl = (originUrl && originUrl !== "null" && originUrl.startsWith("http")) ? originUrl : siteUrl;
    }

    const subtotal = items.reduce((s: number, i: { price: number; quantity: number }) =>
      s + i.price * (i.quantity || 1), 0);

    const freeShipMin = is_b2b ? FREE_SHIP_MIN_B2B : FREE_SHIP_MIN_B2C;
    let shippingCost = subtotal >= freeShipMin ? 0 : SHIPPING_COST;
    let discountAmount = 0;

    if (coupon) {
      if (coupon.type === "percent")   discountAmount = subtotal * coupon.value / 100;
      else if (coupon.type === "fixed") discountAmount = coupon.value;
      else if (coupon.type === "shipping") shippingCost = 0;
      if (coupon.freeShipping) shippingCost = 0;
    }

    const total = subtotal - discountAmount + shippingCost;

    const ppItems = items.map((item: { name: string; price: number; quantity: number }) => ({
      name: item.name.substring(0, 127),
      unit_amount: { currency_code: CURRENCY, value: item.price.toFixed(2) },
      quantity: String(item.quantity || 1),
    }));

    // Single access token fetch (was fetched twice before — bug fixed in v25)
    const accessToken = await getPayPalAccessToken();

    const orderPayload = {
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: "SFI_ORDER",
        description: "Sports Foods Ireland Order",
        amount: {
          currency_code: CURRENCY,
          value: total.toFixed(2),
          breakdown: {
            item_total: { currency_code: CURRENCY, value: subtotal.toFixed(2) },
            shipping:   { currency_code: CURRENCY, value: shippingCost.toFixed(2) },
            ...(discountAmount > 0
              ? { discount: { currency_code: CURRENCY, value: discountAmount.toFixed(2) } }
              : {}),
          },
        },
        items: ppItems,
        ...(shippingAddress ? {
          shipping: {
            name: { full_name: `${contact?.firstName || ''} ${contact?.lastName || ''}`.trim() },
            address: {
              address_line_1: shippingAddress.addr1 || '',
              address_line_2: shippingAddress.addr2 || '',
              admin_area_2:   shippingAddress.city || '',
              postal_code:    shippingAddress.postcode || '',
              country_code:   shippingAddress.country || 'IE',
            },
          },
        } : {}),
      }],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name:  "Sports Foods Ireland",
            locale:      "en-IE",
            landing_page: "LOGIN",
            user_action: "PAY_NOW",
            return_url:  `${baseUrl}/checkout.html?paypal_success=true`,
            cancel_url:  `${baseUrl}/checkout.html?paypal_canceled=true`,
          },
          ...(email ? { email_address: email } : {}),
        },
      },
    };

    const orderRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      body: JSON.stringify(orderPayload),
    });
    const order = await orderRes.json();
    if (!orderRes.ok) throw new Error(order.message || order.details?.[0]?.description || `PayPal error ${orderRes.status}`);

    const approveLink =
      order.links?.find((l: { rel: string; href: string }) => l.rel === "payer-action")?.href ||
      order.links?.find((l: { rel: string; href: string }) => l.rel === "approve")?.href;
    if (!approveLink) throw new Error("No PayPal approval URL returned");

    return new Response(
      JSON.stringify({ url: approveLink, order_id: order.id, shipping_cost: shippingCost }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[create-paypal-checkout] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
