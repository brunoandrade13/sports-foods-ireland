# SECURITY AUDIT REPORT
**Sports Foods Ireland E-Commerce Platform**

**Date:** April 4, 2026
**Project:** /Users/test/Desktop/sport/website-sfi-novo
**Auditor:** Claude Opus 4.6 Security Audit
**Technology Stack:** Static HTML/JS frontend, Supabase Backend, Stripe Payments, Deno Edge Functions

---

## EXECUTIVE SUMMARY

This comprehensive security audit identified **17 security issues** across the application, including **2 CRITICAL vulnerabilities** that must be addressed immediately before any production deployment.

### Severity Breakdown
- **CRITICAL**: 2 findings
- **HIGH**: 2 findings
- **MEDIUM**: 6 findings
- **LOW**: 3 findings
- **INFO**: 4 positive findings

### Critical Issues Requiring Immediate Action
1. **Hardcoded Stripe Secret Key** in Edge Function with fallback to test key
2. **Wildcard CORS (`*`)** on all Edge Functions allowing unrestricted cross-origin access

---

## CRITICAL FINDINGS

### 🔴 CRITICAL-1: Hardcoded Stripe Secret Key in Source Code

**OWASP:** A02:2021 - Cryptographic Failures
**CWE:** CWE-798 - Use of Hard-coded Credentials

**File:** `supabase/functions/create-checkout/index.ts:8`

```typescript
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "sk_test_OQw8cXMtCdyG16wTAxg742GF";
```

**Impact:**
- Stripe test secret key `sk_test_OQw8cXMtCdyG16wTAxg742GF` is hardcoded and committed to Git
- Key can create charges, access customer data, issue refunds, modify account settings
- If env var is missing in production, function silently falls back to test key, causing payment failures
- Establishes dangerous pattern that could lead to production keys being similarly embedded

**Remediation:**
```typescript
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
if (!STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY environment variable is required");
}
```

**Additional Steps:**
1. Rotate the exposed test key in Stripe dashboard
2. Use `git filter-branch` or BFG Repo-Cleaner to remove from Git history
3. Audit all Edge Functions for similar patterns

---

### 🔴 CRITICAL-2: Wildcard CORS on All Edge Functions

**OWASP:** A01:2021 - Broken Access Control
**CWE:** CWE-942 - Permissive Cross-domain Policy

**Affected Files:** All 9 Edge Functions

Every Edge Function sets `Access-Control-Allow-Origin: "*"`, allowing **any website** to call these endpoints:

| Function | Risk |
|---|---|
| `create-checkout` | Any site can create Stripe checkout sessions |
| `brevo-proxy` | Any site can send emails through your Brevo account |
| `b2b-notify` | Any site can trigger B2B notification emails |
| `qb-sync-*` | Any site can trigger QuickBooks synchronization |
| `woo-sync-skus` | Any site can modify WooCommerce SKUs |

**Impact:**
- Email abuse/spam through `brevo-proxy`
- Unauthorized Stripe session creation
- Data exfiltration via sync endpoints
- Quota exhaustion and financial liability

**Remediation:**

Create shared CORS helper:
```typescript
// supabase/functions/_shared/cors.ts
const ALLOWED_ORIGINS = [
  "https://www.sportsfoodsireland.ie",
  "https://sportsfoodsireland.ie",
];

export function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
```

For server-to-server functions (`qb-sync-*`, `woo-sync-*`, `stripe-webhook`), **remove CORS headers entirely** as they are not called from browsers.

---

## HIGH SEVERITY FINDINGS

### 🟠 HIGH-1: Stripe Webhook Signature Verification Bypass

**OWASP:** A07:2021 - Identification and Authentication Failures
**File:** `supabase/functions/stripe-webhook/index.ts:156-158`

```typescript
if (!secret) {
    console.warn("[stripe-webhook] STRIPE_WEBHOOK_SECRET not set - skipping verification (dev mode)");
    return JSON.parse(payload) as StripeEvent;
}
```

**Impact:**
- If `STRIPE_WEBHOOK_SECRET` is missing, signature verification is completely bypassed
- Attackers can send forged webhook payloads to create fraudulent orders
- "Dev mode" comment suggests this might be acceptable, but no guarantee env var is always set

**Remediation:**
```typescript
if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET not configured - cannot verify webhook");
}
```

---

### 🟠 HIGH-2: No Authentication on Admin/Sync Edge Functions

**OWASP:** A01:2021 - Broken Access Control
**Files:** `qb-sync-orders`, `qb-sync-products`, `qb-sync-purchase-orders`, `woo-sync-skus`, `b2b-price-report`, `b2b-notify`, `brevo-proxy`

**Impact:**
- Combined with wildcard CORS, any anonymous request can:
  - Trigger full QuickBooks sync
  - Overwrite product data
  - Modify orders
  - Send B2B notification emails
  - Send arbitrary emails via Brevo proxy

**Remediation:**
```typescript
const authHeader = req.headers.get("Authorization");
const expectedKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!authHeader || authHeader !== `Bearer ${expectedKey}`) {
  return new Response("Unauthorized", {
    status: 401,
    headers: corsHeaders
  });
}
```

---

## MEDIUM SEVERITY FINDINGS

### 🟡 MEDIUM-1: Content Security Policy Allows unsafe-inline and unsafe-eval

**OWASP:** A03:2021 - Injection
**File:** `.htaccess:43`

```apache
script-src 'self' 'unsafe-inline' 'unsafe-eval' ...
```

**Impact:**
- Both directives effectively neutralize XSS protections from CSP
- Any XSS vector can execute arbitrary JavaScript

**Remediation:**
1. **Short-term:** Remove `'unsafe-eval'` (rarely necessary)
2. **Long-term:** Migrate to nonce-based CSP:
```apache
script-src 'self' 'nonce-{random}' https://fonts.googleapis.com https://*.supabase.co;
```

---

### 🟡 MEDIUM-2: Missing Stripe/PayPal Domains in CSP connect-src

**File:** `.htaccess:43`

Current CSP `connect-src` is missing `https://api.stripe.com` and `https://*.paypal.com`. If checkout calls these APIs client-side, they will be blocked.

**Remediation:**
```apache
connect-src 'self' https://*.supabase.co https://api.stripe.com https://*.paypal.com https://api.brevo.com https://fonts.googleapis.com;
```

---

### 🟡 MEDIUM-3: No Server-Side Price Validation in create-checkout

**OWASP:** A03:2021 - Injection
**File:** `supabase/functions/create-checkout/index.ts:22`

```typescript
const { items, email, currency = "EUR", shippingAddress, coupon } = await req.json();
```

**Impact:**
- Client supplies prices directly: `unit_amount: Math.round(item.price * 100)`
- Attackers can submit negative prices, zero prices, or inflated coupon values
- No validation that prices match server-side product catalog

**Remediation:**
```typescript
// Look up prices from database instead of trusting client
const { data: product } = await supabase
  .from('products')
  .select('price')
  .eq('id', item.id)
  .single();

if (!product) {
  return new Response(JSON.stringify({ error: "Invalid product" }), { status: 400 });
}

// Use server-side price
unit_amount: Math.round(product.price * 100)
```

---

### 🟡 MEDIUM-4: HTML Injection in B2B Email Templates

**OWASP:** A03:2021 - Injection
**File:** `supabase/functions/b2b-notify/index.ts:86,110`

User-supplied values (`name`, `company`, `notes`) are interpolated directly into HTML email templates without escaping.

**Example:**
```typescript
<p>Hi ${name},</p>
<p>...application for <strong>${company}</strong> has been approved.</p>
```

**Impact:**
- XSS in admin email clients if B2B applicant submits malicious company name like `<script>alert(1)</script>`

**Remediation:**
```typescript
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Use: <p>Hi ${escapeHtml(name)},</p>
```

---

### 🟡 MEDIUM-5: Customer PII Persists in localStorage Without TTL

**OWASP:** A04:2021 - Insecure Design
**File:** `js/checkout.js:431-436`

```javascript
localStorage.setItem('sfi_paypal_checkout', JSON.stringify({
    items, email: checkoutData.contact.email,
    contact: checkoutData.contact,
    shippingAddress: checkoutData.shipping,
    coupon: appliedCoupon || null,
}));
```

**Impact:**
- Customer PII (name, email, phone, address) persists indefinitely if user abandons checkout
- Accessible to any JavaScript (including XSS attacks)

**Additional localStorage PII:**
- `sfi_user` - Full user object
- `sfi_newsletter_email` - Email address

**Remediation:**
```javascript
// Add TTL cleanup
const PAYPAL_CHECKOUT_TTL = 30 * 60 * 1000; // 30 minutes

function setTemporaryItem(key, value, ttl) {
  const item = {
    value: value,
    expiry: Date.now() + ttl
  };
  localStorage.setItem(key, JSON.stringify(item));
}

// On page load, clean expired items
function cleanExpiredItems() {
  for (let key in localStorage) {
    if (key.startsWith('sfi_')) {
      const item = JSON.parse(localStorage.getItem(key));
      if (item.expiry && Date.now() > item.expiry) {
        localStorage.removeItem(key);
      }
    }
  }
}
```

---

### 🟡 MEDIUM-6: 4 npm Dependency Vulnerabilities

**File:** `package.json` (transitive dependencies)

| Package | Severity | CVEs |
|---|---|---|
| `undici` | HIGH | 6 CVEs (WebSocket overflow, HTTP smuggling) |
| `minimatch` | HIGH | 3 ReDoS vulnerabilities |
| `picomatch` | HIGH | Method injection + ReDoS |
| `brace-expansion` | MODERATE | Zero-step sequence causes hang |

**Remediation:**
```bash
npm audit fix
```

---

## LOW SEVERITY FINDINGS

### 🟢 LOW-1: Error Responses Expose Internal Details

**Files:** Multiple Edge Functions return `err.message` directly to clients

**Impact:** Leaks database table names, column names, connection errors, Stripe error codes

**Remediation:**
```typescript
console.error("[function-name] Error:", err); // Log server-side only
return new Response(
  JSON.stringify({ error: "Internal server error" }),
  { status: 500 }
);
```

---

### 🟢 LOW-2: HSTS Missing preload Directive

**File:** `.htaccess:55`

**Remediation:**
```apache
Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" env=HTTPS
```

---

### 🟢 LOW-3: Inconsistent Supabase API Keys

Two different Supabase anon key formats in use:
1. JWT format: `eyJhbGciOiJIUzI1NiIs...` (checkout.js:16, admin/index.html:4321)
2. Short format: `sb_publishable_tiF58FbBT9UsaEMAaJlqWA_k3dLHElH` (18+ files)

**Remediation:** Centralize in `js/config.js`:
```javascript
// js/config.js
export const SUPABASE_URL = "https://styynhgzrkyoioqjssuw.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_tiF58FbBT9UsaEMAaJlqWA_k3dLHElH";
```

---

## POSITIVE FINDINGS (Good Security Practices)

✅ **No credit card data handled client-side** - All payments via Stripe Checkout/PayPal hosted pages
✅ **.env files properly gitignored** - No secrets committed to repository
✅ **Security headers implemented** - X-Frame-Options, X-Content-Type-Options, HSTS, CSP
✅ **Edge Functions use environment variables** - Except for the one hardcoded Stripe key
✅ **Stripe webhook has signature verification** - When secret is set
✅ **No HTTP cookies used** - Uses localStorage (though see PII concerns)
✅ **Public product data only** - dados.json contains no cost prices or sensitive data

---

## REMEDIATION PRIORITY

### 🚨 IMMEDIATE (Before Production Deployment)

1. **Remove hardcoded Stripe secret key** from `create-checkout/index.ts`
   - Rotate the exposed test key in Stripe dashboard
   - Add explicit error throw if env var missing

2. **Fix Stripe webhook signature bypass** in `stripe-webhook/index.ts`
   - Change to throw error instead of skipping verification

3. **Restrict CORS origins** on all Edge Functions
   - Implement origin allowlist
   - Remove CORS from server-to-server functions

4. **Add authentication** to admin/sync Edge Functions
   - Validate `Authorization` header with service role key

### ⚡ SHORT-TERM (This Sprint)

5. **Run `npm audit fix`** to resolve dependency vulnerabilities

6. **Add server-side price validation** in `create-checkout`

7. **Remove `'unsafe-eval'` from CSP**, plan migration from `'unsafe-inline'`

8. **Add missing API domains to CSP `connect-src`**

9. **Sanitize HTML in `b2b-notify`** email templates

### 📋 MEDIUM-TERM (Next Sprint)

10. **Add TTL cleanup for PII in localStorage**

11. **Centralize Supabase API keys** in single config file

12. **Improve error handling** to avoid leaking internal details

13. **Add HSTS preload directive**

14. **Add rate limiting** to Edge Functions (especially `create-checkout`)

### 🔮 LONG-TERM (Backlog)

15. **Migrate to nonce-based CSP** to eliminate `'unsafe-inline'`

16. **Consider httpOnly cookies** for auth tokens instead of localStorage

17. **Add Content-Type validation** in Service Worker caching

18. **Implement cache size limits** in Service Worker

---

## COMPLIANCE NOTES

### GDPR Considerations
- Customer PII in localStorage has no defined retention policy (see MEDIUM-5)
- Server logs contain customer emails (stripe-webhook:95) - ensure log retention policy complies with GDPR
- No cookie consent banner needed (no HTTP cookies used)

### PCI DSS Considerations
- ✅ No card data touches application (Stripe handles all payment data)
- ✅ HTTPS enforced with HSTS
- ⚠️ Price validation vulnerability (MEDIUM-3) could allow payment amount manipulation

---

## TESTING RECOMMENDATIONS

1. **Security Testing:**
   - Penetration test the `create-checkout` endpoint with manipulated prices
   - Test Stripe webhook with forged signatures
   - Attempt CSRF attacks on state-changing operations
   - XSS testing with `'unsafe-inline'` CSP

2. **Regression Testing After Fixes:**
   - Verify CORS restrictions don't break legitimate frontend requests
   - Test checkout flow after price validation changes
   - Ensure Edge Function auth doesn't break admin panel integrations

---

## APPENDIX A: Files Requiring Immediate Changes

### Critical Priority
- `supabase/functions/create-checkout/index.ts` (line 8) - Remove hardcoded key
- `supabase/functions/stripe-webhook/index.ts` (lines 156-158) - Fix verification bypass
- All 9 Edge Function files - Fix CORS configuration
- All admin/sync Edge Functions - Add authentication

### High Priority
- `.htaccess` (line 43) - Update CSP
- `supabase/functions/create-checkout/index.ts` (line 22) - Add price validation
- `supabase/functions/b2b-notify/index.ts` (lines 86, 110) - Sanitize HTML
- `package.json` - Run npm audit fix

### Medium Priority
- `js/checkout.js` (lines 431-436) - Add TTL for localStorage PII
- Create new `js/config.js` - Centralize Supabase keys
- Multiple Edge Functions - Improve error handling

---

## CONCLUSION

This application has a **solid security foundation** with proper HTTPS enforcement, security headers, and use of managed payment services. However, the **two critical vulnerabilities** (hardcoded Stripe key and wildcard CORS) create significant risk and must be addressed before production deployment.

The recommended fixes are straightforward and can be completed within 1-2 days of development effort. After addressing the immediate/short-term items, the application's security posture will be significantly improved.

**Overall Risk Level:** HIGH (due to CRITICAL-1 and CRITICAL-2)
**Post-Remediation Risk Level:** LOW-MEDIUM (after addressing immediate priorities)

---

**Report Generated:** 2026-04-04
**Next Audit Recommended:** After remediation completion + quarterly thereafter
