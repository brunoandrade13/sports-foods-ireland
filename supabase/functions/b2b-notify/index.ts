/**
 * b2b-notify — Supabase Edge Function
 * Sends email notifications for B2B status changes.
 *
 * Trigger via Supabase Database Webhook on profiles table
 * when b2b_status column changes.
 *
 * Expected payload (from webhook or direct call):
 * {
 *   type: "UPDATE",
 *   record: { user_id, email, b2b_status, b2b_company_name, ... },
 *   old_record: { b2b_status: "pending", ... }
 * }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";

/**
 * Sanitize a string for safe use in HTML context.
 * Prevents XSS injection via user-supplied fields (name, company, email).
 */
function sanitizeHtml(str: unknown): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
const ADMIN_EMAIL = "admin@sportsfoodsireland.ie";
const FROM_EMAIL = "Sports Foods Ireland <noreply@sportsfoodsireland.ie>";
const SITE_URL = "https://www.sportsfoodsireland.ie";

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

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) {
    console.log(
      `[b2b-notify] RESEND_API_KEY not set. Would send to ${to}: ${subject}`,
    );
    return { success: true, mock: true };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[b2b-notify] Resend error: ${err}`);
    throw new Error(`Email send failed: ${res.status}`);
  }

  return await res.json();
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const record = payload.record || payload;
    const oldRecord = payload.old_record || {};

    const newStatus = record.b2b_status;
    const oldStatus = oldRecord.b2b_status;
    const email = sanitizeHtml(record.email || "");
    const company = sanitizeHtml(record.b2b_company_name || "Unknown Company");
    const name = sanitizeHtml(
      [record.first_name, record.last_name].filter(Boolean).join(" ") ||
      "Customer",
    );

    // Only act if status actually changed
    if (newStatus === oldStatus) {
      return new Response(JSON.stringify({ message: "No status change" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: string[] = [];

    // --- APPROVED ---
    if (newStatus === "approved") {
      await sendEmail(
        email,
        "🎉 Your B2B Application Has Been Approved!",
        `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;">
          <div style="text-align:center;margin-bottom:30px;">
            <h1 style="color:#2D6A4F;font-size:24px;">Welcome to SFI Wholesale!</h1>
          </div>
          <p>Hi ${name},</p>
          <p>Great news! Your B2B wholesale application for <strong>${company}</strong> has been approved.</p>
          <p>You now have access to our exclusive wholesale portal with discounted pricing on all products.</p>
          <div style="text-align:center;margin:30px 0;">
            <a href="${SITE_URL}/b2b/shop.html" style="background:#2D6A4F;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
              Access Wholesale Portal →
            </a>
          </div>
          <p style="color:#636E72;font-size:14px;">If you have any questions, reply to this email or contact us at info@sportsfoodsireland.ie</p>
          <hr style="border:none;border-top:1px solid #eee;margin:30px 0;">
          <p style="color:#999;font-size:12px;">Sports Foods Ireland — Premium Sports Nutrition & Triathlon Gear</p>
        </div>
      `,
      );
      results.push("Sent approval email to " + email);
    }

    // --- REJECTED ---
    if (newStatus === "rejected" && oldStatus === "pending") {
      const notes = sanitizeHtml(record.b2b_notes || "");
      await sendEmail(
        email,
        "Your B2B Application Update — Sports Foods Ireland",
        `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;">
          <h1 style="color:#333;font-size:22px;">B2B Application Update</h1>
          <p>Hi ${name},</p>
          <p>Thank you for your interest in becoming a wholesale partner with Sports Foods Ireland.</p>
          <p>Unfortunately, we're unable to approve your application for <strong>${company}</strong> at this time.</p>
          ${notes ? `<p style="background:#f8f9fa;padding:12px 16px;border-radius:6px;color:#495057;"><em>${notes}</em></p>` : ""}
          <p>If you believe this is an error or if your circumstances change, please don't hesitate to contact us at info@sportsfoodsireland.ie</p>
          <p>You can continue shopping as a retail customer at <a href="${SITE_URL}" style="color:#2D6A4F;">sportsfoodsireland.ie</a></p>
          <hr style="border:none;border-top:1px solid #eee;margin:30px 0;">
          <p style="color:#999;font-size:12px;">Sports Foods Ireland — Premium Sports Nutrition & Triathlon Gear</p>
        </div>
      `,
      );
      results.push("Sent rejection email to " + email);
    }

    // --- NEW PENDING APPLICATION → notify admin ---
    if (newStatus === "pending" && oldStatus !== "pending") {
      await sendEmail(
        ADMIN_EMAIL,
        `🏢 New B2B Application: ${company}`,
        `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;">
          <h1 style="color:#2D6A4F;font-size:22px;">New B2B Application</h1>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;">
            <tr><td style="padding:8px 0;color:#666;width:140px;">Company</td><td style="padding:8px 0;font-weight:600;">${company}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Contact</td><td style="padding:8px 0;">${name}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Email</td><td style="padding:8px 0;"><a href="mailto:${email}">${email}</a></td></tr>
            <tr><td style="padding:8px 0;color:#666;">VAT Number</td><td style="padding:8px 0;font-family:monospace;">${record.b2b_vat_number || "—"}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Business Type</td><td style="padding:8px 0;">${record.b2b_business_type || "—"}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Expected Volume</td><td style="padding:8px 0;">${record.b2b_expected_volume || "—"}</td></tr>
            <tr><td style="padding:8px 0;color:#666;">Website</td><td style="padding:8px 0;">${record.b2b_website || "—"}</td></tr>
          </table>
          <div style="text-align:center;margin:30px 0;">
            <a href="${SITE_URL}/admin/index.html" style="background:#2D6A4F;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
              Review in Admin Panel →
            </a>
          </div>
        </div>
      `,
      );
      results.push("Sent notification to admin for " + company);
    }

    return new Response(JSON.stringify({ success: true, actions: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[b2b-notify] Error:", error);
    return new Response(JSON.stringify({ error: "An internal error occurred." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
