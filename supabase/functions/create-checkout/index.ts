/**
 * create-checkout — Supabase Edge Function
 * Creates a Stripe Checkout Session and returns the redirect URL.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const STANDARD_SHIPPING_CENTS = 904; // €9.04
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

if (!STRIPE_SECRET_KEY) {
  throw new Error(
    "STRIPE_SECRET_KEY environment variable is required but not set",
  );
}

const ALLOWED_ORIGINS = [
  "https://sportsfoodsireland.ie",
  "https://www.sportsfoodsireland.ie",
];

function getCorsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

// Simple in-memory rate limiter (resets on cold start, per-instance)
// For production scale, use Upstash Redis instead
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_MAX = 10;       // max requests
const RATE_LIMIT_WINDOW = 60_000; // per 60 seconds

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Rate limiting — max 10 checkout requests per IP per minute
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") || "unknown";
  if (isRateLimited(clientIp)) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please wait a moment and try again." }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": "60",
        },
      },
    );
  }

  try {
    const {
      items,
      email,
      currency = "EUR",
      shippingAddress,
      coupon,
      is_b2b = false,
    } = await req.json();

    if (!items?.length) {
      return new Response(JSON.stringify({ error: "Cart is empty" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SERVER-SIDE PRICE VALIDATION
    // Fetch real prices from database to prevent client-side price manipulation
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const priceField = currency === "GBP" ? "price_gbp" : "price_eur";
    const itemIds = items
      .map((i: { id?: string | number }) => i.id)
      .filter(Boolean);

    const productPrices = new Map<string | number, number>();

    if (itemIds.length > 0) {
      // Separate UUID ids from legacy numeric ids
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const uuidIds = itemIds.filter((id: string | number) => uuidRegex.test(String(id)));
      const legacyIds = itemIds.filter((id: string | number) => !uuidRegex.test(String(id)));

      // Lookup by UUID
      if (uuidIds.length > 0) {
        const { data: products, error: dbError } = await supabase
          .from("products")
          .select(`id, ${priceField}`)
          .in("id", uuidIds);
        if (!dbError) {
          for (const p of products || []) {
            const price = Number(p[priceField as keyof typeof p]);
            if (price > 0) productPrices.set(p.id, price);
          }
        } else {
          console.error("[create-checkout] UUID lookup error:", dbError);
        }
      }

      // Lookup by legacy_id or woo_product_id for numeric IDs
      if (legacyIds.length > 0) {
        const numericIds = legacyIds.map((id: string | number) => Number(id)).filter((n: number) => !isNaN(n));
        if (numericIds.length > 0) {
          const { data: legacyProducts, error: legacyError } = await supabase
            .from("products")
            .select(`id, legacy_id, woo_product_id, ${priceField}`)
            .or(`legacy_id.in.(${numericIds.join(",")}),woo_product_id.in.(${numericIds.join(",")})`);
          if (!legacyError) {
            for (const p of legacyProducts || []) {
              const price = Number(p[priceField as keyof typeof p]);
              if (price > 0) {
                for (const origId of legacyIds) {
                  const n = Number(origId);
                  if ((p as any).legacy_id === n || (p as any).woo_product_id === n) {
                    productPrices.set(origId, price);
                  }
                }
              }
            }
          } else {
            console.error("[create-checkout] Legacy lookup error:", legacyError);
          }
        }
      }
    }

    // Replace client-sent prices with server-authoritative prices
    const validatedItems = items.map(
      (item: {
        id?: string | number;
        name: string;
        price: number;
        quantity: number;
        image?: string;
      }) => {
        if (item.id !== undefined && productPrices.has(item.id)) {
          const serverPrice = productPrices.get(item.id)!;
          if (item.price !== serverPrice) {
            console.warn(
              `[create-checkout] Price mismatch for product ${item.id}: ` +
                `client sent ${item.price}, using server price ${serverPrice}`,
            );
          }
          return { ...item, price: serverPrice };
        }
        // No server price found — log and allow (e.g. shipping-only items)
        console.warn(
          `[create-checkout] No DB price for item id=${item.id} name=${item.name}, using client price`,
        );
        return item;
      },
    );

    const siteUrl =
      Deno.env.get("SITE_URL") || "https://sportsfoodsireland.com";

    // Determine the base URL for the success/cancel redirects based on the request's origin.
    // If the request comes from localhost:8000, it stays on localhost.
    let originUrl = req.headers.get("origin");
    if (!originUrl || originUrl === "null" || !originUrl.startsWith("http")) {
      originUrl = siteUrl;
    }

    const lineItems = validatedItems.map(
      (item: {
        name: string;
        price: number;
        quantity: number;
        image?: string;
      }) => {
        let imageUrl = item.image;
        if (imageUrl && !imageUrl.startsWith("http")) {
          // Stripe requires absolute, publicly accessible URLs for images.
          // Use the live site URL for relative images so Stripe can reach them even when testing locally.
          const prefix = imageUrl.startsWith("/") ? "" : "/";
          imageUrl = `${siteUrl}${prefix}${imageUrl}`;
        }

        return {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: item.name,
              ...(imageUrl ? { images: [imageUrl] } : {}),
            },
            unit_amount: Math.round(item.price * 100),
          },
          quantity: item.quantity || 1,
        };
      },
    );

    const subtotal = validatedItems.reduce(
      (s: number, i: { price: number; quantity: number }) =>
        s + i.price * (i.quantity || 1),
      0,
    );

    const freeShipMin = is_b2b ? 150 : 60;
    let shippingCost = subtotal >= freeShipMin ? 0 : 9.04;
    let discountAmount = 0;

    if (coupon) {
      if (coupon.type === "percent")
        discountAmount = (subtotal * coupon.value) / 100;
      else if (coupon.type === "fixed") discountAmount = coupon.value;
      else if (coupon.type === "shipping") shippingCost = 0;
    }

    const shippingOptions =
      shippingCost === 0
        ? [
            {
              shipping_rate_data: {
                type: "fixed_amount",
                fixed_amount: { amount: 0, currency: currency.toLowerCase() },
                display_name: "Free Shipping",
              },
            },
          ]
        : [
            {
              shipping_rate_data: {
                type: "fixed_amount",
                fixed_amount: { amount: STANDARD_SHIPPING_CENTS, currency: currency.toLowerCase() },
                display_name: "Standard Shipping Ireland (3-5 days)",
              },
            },
          ];

    const discounts: Array<{ coupon: string }> = [];
    if (coupon && discountAmount > 0) {
      const couponRes = await stripeRequest("POST", "/v1/coupons", {
        ...(coupon.type === "percent"
          ? { percent_off: coupon.value }
          : {
              amount_off: Math.round(discountAmount * 100),
              currency: currency.toLowerCase(),
            }),
        duration: "once",
        name: `${coupon.code} discount`,
      });
      if (couponRes.id) discounts.push({ coupon: couponRes.id });
    }

    const session = await stripeRequest("POST", "/v1/checkout/sessions", {
      mode: "payment",
      line_items: lineItems,
      shipping_options: shippingOptions,
      shipping_address_collection: { allowed_countries: ["IE", "GB"] },
      customer_email: email || undefined,
      ...(discounts.length ? { discounts } : {}),
      success_url: `${originUrl}/checkout.html?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${originUrl}/checkout.html?canceled=true`,
      metadata: {
        items_json: JSON.stringify(
          validatedItems.map(
            (i: {
              id?: string | number;
              name: string;
              price: number;
              quantity: number;
            }) => ({
              id: i.id,
              name: i.name,
              price: i.price,
              qty: i.quantity || 1,
            }),
          ),
        ),
        shipping_json: JSON.stringify(shippingAddress || {}),
        coupon_code: coupon?.code || "",
      },
      payment_method_types: ["card"],
    });

    return new Response(
      JSON.stringify({ url: session.url, session_id: session.id }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("[create-checkout] Error:", err);
    return new Response(
      JSON.stringify({ error: "An internal error occurred. Please try again." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

async function stripeRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
) {
  const res = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    ...(body ? { body: toFormEncoded(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(`Stripe ${path}: ${data.error?.message || res.status}`);
  return data;
}

function toFormEncoded(obj: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (val === null || val === undefined) continue;
    if (Array.isArray(val)) {
      val.forEach((item, i) => {
        if (typeof item === "object" && item !== null) {
          parts.push(
            toFormEncoded(item as Record<string, unknown>, `${fullKey}[${i}]`),
          );
        } else {
          parts.push(
            `${encodeURIComponent(`${fullKey}[${i}]`)}=${encodeURIComponent(String(item))}`,
          );
        }
      });
    } else if (typeof val === "object") {
      parts.push(toFormEncoded(val as Record<string, unknown>, fullKey));
    } else {
      parts.push(
        `${encodeURIComponent(fullKey)}=${encodeURIComponent(String(val))}`,
      );
    }
  }
  return parts.join("&");
}
