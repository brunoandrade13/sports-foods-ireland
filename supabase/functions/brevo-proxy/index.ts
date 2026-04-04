import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") || "";
const BREVO_BASE = "https://api.brevo.com/v3";
const SENDER = {
  name: "Sports Foods Ireland",
  email: "brunoandrade13@yahoo.com.br",
};

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
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

async function brevoFetch(endpoint: string, body: object) {
  return await fetch(`${BREVO_BASE}${endpoint}`, {
    method: "POST",
    headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function addContact(
  email: string,
  attributes: object,
  listIds: number[],
) {
  return await brevoFetch("/contacts", {
    email,
    attributes,
    listIds,
    updateEnabled: true,
  });
}

async function sendTemplate(email: string, templateId: number, params: object) {
  return await brevoFetch("/smtp/email", {
    templateId,
    to: [{ email }],
    params,
  });
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, ...data } = await req.json();

    switch (action) {
      case "subscribe_newsletter": {
        const contactRes = await addContact(
          data.email,
          { FIRSTNAME: data.firstName || "" },
          [data.listId],
        );
        let msg = "Successfully subscribed!";
        if (!contactRes.ok) {
          const err = await contactRes.json();
          if (err.code === "duplicate_parameter")
            msg = "You are already subscribed!";
          else
            return new Response(
              JSON.stringify({
                success: false,
                message: "Subscription failed.",
              }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
        }
        await sendTemplate(data.email, data.templateId, {
          FIRSTNAME: data.firstName || "there",
        });
        return new Response(JSON.stringify({ success: true, message: msg }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "send_order_confirmation": {
        if (data.attributes && data.listId) {
          await addContact(data.email, data.attributes, [data.listId]);
        }
        await sendTemplate(data.email, data.templateId, data.params);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "send_template": {
        await sendTemplate(data.email, data.templateId, data.params);
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "send_b2b_welcome": {
        await addContact(
          data.email,
          { FIRSTNAME: data.firstName || "", CUSTOMER_TYPE: "b2b" },
          [data.listId],
        );
        await sendTemplate(data.email, data.templateId, {
          FIRSTNAME: data.firstName || "Partner",
        });
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(
          JSON.stringify({ success: false, message: "Unknown action" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
    }
  } catch (err) {
    console.error("[brevo-proxy] Error:", err);
    return new Response(
      JSON.stringify({ success: false, message: "An internal error occurred. Please try again." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
