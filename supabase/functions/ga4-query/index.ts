import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GA4_PROPERTY_ID = "533649369";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Get access token from OAuth refresh token OR service account ───────────
async function getAccessToken(): Promise<string> {
  // Try OAuth refresh token first (set by grant_ga4_access.py)
  const oauthJson = Deno.env.get("GA4_OAUTH_TOKEN");
  if (oauthJson) {
    const oauth = JSON.parse(oauthJson);
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: oauth.client_id,
        client_secret: oauth.client_secret,
        refresh_token: oauth.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const data = await res.json();
    if (data.access_token) return data.access_token;
  }

  // Fallback: service account JWT
  const credsJson = Deno.env.get("GA4_SERVICE_ACCOUNT");
  if (!credsJson) throw new Error("No GA4 credentials configured");
  const creds = JSON.parse(credsJson);

  const now = Math.floor(Date.now() / 1000);
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  const sigInput = `${enc({alg:"RS256",typ:"JWT"})}.${enc({
    iss: creds.client_email, sub: creds.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
    scope: "https://www.googleapis.com/auth/analytics.readonly"
  })}`;
  const pem = creds.private_key.replace("-----BEGIN PRIVATE KEY-----","").replace("-----END PRIVATE KEY-----","").replace(/\n/g,"");
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(sigInput));
  const jwt = `${sigInput}.${btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Token error: " + JSON.stringify(data));
  return data.access_token;
}

type DR = { startDate: string; endDate: string };
const R: Record<string, (d: DR) => unknown> = {
  traffic: (d) => ({ dimensions:[{name:"sessionDefaultChannelGroup"}], metrics:[{name:"sessions"},{name:"activeUsers"},{name:"newUsers"},{name:"engagedSessions"},{name:"bounceRate"},{name:"averageSessionDuration"}], dateRanges:[d], orderBys:[{metric:{metricName:"sessions"},desc:true}] }),
  ecommerce: (d) => ({ dimensions:[{name:"date"}], metrics:[{name:"sessions"},{name:"addToCarts"},{name:"checkouts"},{name:"ecommercePurchases"},{name:"purchaseRevenue"}], dateRanges:[d], orderBys:[{dimension:{dimensionName:"date"},desc:true}] }),
  pages: (d) => ({ dimensions:[{name:"pagePath"}], metrics:[{name:"screenPageViews"},{name:"activeUsers"},{name:"bounceRate"},{name:"averageSessionDuration"}], dateRanges:[d], orderBys:[{metric:{metricName:"screenPageViews"},desc:true}], limit:20 }),
  countries: (d) => ({ dimensions:[{name:"country"}], metrics:[{name:"sessions"},{name:"activeUsers"},{name:"engagedSessions"},{name:"bounceRate"}], dateRanges:[d], orderBys:[{metric:{metricName:"sessions"},desc:true}], limit:10 }),
  devices: (d) => ({ dimensions:[{name:"deviceCategory"}], metrics:[{name:"sessions"},{name:"activeUsers"},{name:"bounceRate"},{name:"averageSessionDuration"},{name:"engagedSessions"}], dateRanges:[d] }),
};

const GA_URL = `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}`;

async function runReport(token: string, body: unknown) {
  const r = await fetch(`${GA_URL}:runReport`, { method:"POST", headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"}, body:JSON.stringify(body) });
  return r.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("report") ?? "traffic";
    const dr: DR = { startDate: url.searchParams.get("start") ?? "30daysAgo", endDate: url.searchParams.get("end") ?? "today" };
    const token = await getAccessToken();
    let data: unknown;
    if (type === "realtime") {
      const r = await fetch(`${GA_URL}:runRealtimeReport`, { method:"POST", headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"}, body:JSON.stringify({ dimensions:[{name:"unifiedScreenName"},{name:"deviceCategory"}], metrics:[{name:"activeUsers"}], minuteRanges:[{startMinutesAgo:29,endMinutesAgo:0}] }) });
      data = await r.json();
    } else if (type === "summary") {
      const [t, e, d] = await Promise.all(["traffic","ecommerce","devices"].map(k => runReport(token, R[k](dr))));
      data = { traffic:t, ecommerce:e, devices:d };
    } else {
      data = await runReport(token, (R[type] ?? R.traffic)(dr));
    }
    return new Response(JSON.stringify(data), { headers:{...CORS,"Content-Type":"application/json"} });
  } catch(err) {
    return new Response(JSON.stringify({ error: String(err) }), { status:500, headers:{...CORS,"Content-Type":"application/json"} });
  }
});
