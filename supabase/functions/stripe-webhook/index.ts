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
  const items = safeJson(metadata.items_json, []);
  const shipping = safeJson(metadata.shipping_json, {});

  // Generate a readable order ID
  const orderId = `SFI-${Date.now().toString(36).toUpperCase()}`;

  const orderData = {
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent ?? null,
    status: "processing", // order fulfillment status
    payment_status: "paid", // enum value in DB
    financial_status: "paid",
    total: (session.amount_total ?? 0) / 100,
    subtotal: (session.amount_total ?? 0) / 100, // webhook total includes shipping; close enough
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
    order_source: "website",
    payment_method: "stripe",
  };

  console.log(
    `[stripe-webhook] Saving order ${orderId} for ${orderData.customer_email}`,
  );

  const { error } = await supabase
    .from("orders")
    .insert({ ...orderData, order_number: orderId });

  if (error) {
    console.error("[stripe-webhook] Failed to save order:", error);
    throw new Error(`DB insert failed: ${error.message}`);
  }

  // Mark session as processed to prevent duplicates on Stripe retries
  await supabase.from("processed_webhook_events").insert({
    event_id: session.id,
    event_type: "checkout.session.completed",
  });

  console.log(`[stripe-webhook] Order ${orderId} saved successfully`);

  // Optionally trigger QB sync (fire-and-forget, don't block webhook response)
  triggerQBSync(supabase, orderId).catch((e) =>
    console.warn("[stripe-webhook] QB sync failed (non-critical):", e),
  );
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
