// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GA4_PROPERTY_ID = "533649369";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getAccessToken(creds) {
  const now = Math.floor(Date.now() / 1000);
  const enc = (obj) => btoa(JSON.stringify(obj)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  const header = { alg: "RS256", typ: "JWT" };
  const payload = { iss: creds.client_email, sub: creds.client_email, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600, scope: "https://www.googleapis.com/auth/analytics.readonly" };
  const sigInput = `${enc(header)}.${enc(payload)}`;
  const pem = creds.private_key.replace("-----BEGIN PRIVATE KEY-----","").replace("-----END PRIVATE KEY-----","").replace(/\n/g,"");
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(sigInput));
  const jwt = `${sigInput}.${btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}`;
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}` });
  const data = await res.json();
  if (!data.access_token) throw new Error("Token error: " + JSON.stringify(data));
  return data.access_token;
}

const REPORTS = {
  traffic: (dr) => ({ dimensions:[{name:"sessionDefaultChannelGroup"}], metrics:[{name:"sessions"},{name:"activeUsers"},{name:"newUsers"},{name:"engagedSessions"},{name:"bounceRate"},{name:"averageSessionDuration"}], dateRanges:[dr], orderBys:[{metric:{metricName:"sessions"},desc:true}] }),
  ecommerce: (dr) => ({ dimensions:[{name:"date"}], metrics:[{name:"sessions"},{name:"addToCarts"},{name:"checkouts"},{name:"ecommercePurchases"},{name:"purchaseRevenue"}], dateRanges:[dr], orderBys:[{dimension:{dimensionName:"date"},desc:true}] }),
  pages: (dr) => ({ dimensions:[{name:"pagePath"}], metrics:[{name:"screenPageViews"},{name:"activeUsers"},{name:"bounceRate"},{name:"averageSessionDuration"}], dateRanges:[dr], orderBys:[{metric:{metricName:"screenPageViews"},desc:true}], limit:20 }),
  countries: (dr) => ({ dimensions:[{name:"country"}], metrics:[{name:"sessions"},{name:"activeUsers"},{name:"engagedSessions"},{name:"bounceRate"}], dateRanges:[dr], orderBys:[{metric:{metricName:"sessions"},desc:true}], limit:10 }),
  devices: (dr) => ({ dimensions:[{name:"deviceCategory"}], metrics:[{name:"sessions"},{name:"activeUsers"},{name:"bounceRate"},{name:"averageSessionDuration"},{name:"engagedSessions"}], dateRanges:[dr] }),
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const creds = JSON.parse(Deno.env.get("GA4_SERVICE_ACCOUNT") ?? "{}");
    if (!creds.private_key) throw new Error("GA4_SERVICE_ACCOUNT not configured");
    const url = new URL(req.url);
    const type = url.searchParams.get("report") ?? "traffic";
    const dr = { startDate: url.searchParams.get("start") ?? "30daysAgo", endDate: url.searchParams.get("end") ?? "today" };
    const token = await getAccessToken(creds);
    let data;
    if (type === "realtime") {
      const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runRealtimeReport`, { method:"POST", headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"}, body: JSON.stringify({ dimensions:[{name:"unifiedScreenName"},{name:"deviceCategory"}], metrics:[{name:"activeUsers"}], minuteRanges:[{startMinutesAgo:29,endMinutesAgo:0}] }) });
      data = await r.json();
    } else if (type === "summary") {
      const [t,e,d] = await Promise.all(["traffic","ecommerce","devices"].map(k => fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(REPORTS[k](dr))}).then(r=>r.json())));
      data = { traffic:t, ecommerce:e, devices:d };
    } else {
      const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`, { method:"POST", headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"}, body:JSON.stringify((REPORTS[type]??REPORTS.traffic)(dr)) });
      data = await r.json();
    }
    return new Response(JSON.stringify(data), { headers:{...CORS,"Content-Type":"application/json"} });
  } catch(err) {
    return new Response(JSON.stringify({error:String(err)}), { status:500, headers:{...CORS,"Content-Type":"application/json"} });
  }
});
