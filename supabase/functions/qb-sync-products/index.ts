import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const QB_CLIENT_ID = Deno.env.get("QB_CLIENT_ID") || "";
const QB_CLIENT_SECRET = Deno.env.get("QB_CLIENT_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const QB_API_BASE =
  Deno.env.get("QB_ENVIRONMENT") === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";

async function getValidToken(supabase: any) {
  const { data: integration, error } = await supabase
    .from("qb_integration")
    .select("*")
    .limit(1)
    .single();
  if (error || !integration) throw new Error("No QuickBooks integration found");

  const expiresAt = new Date(integration.token_expires_at);
  if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    const basicAuth = btoa(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`);
    const tokenRes = await fetch(
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: integration.refresh_token,
        }),
      },
    );
    if (!tokenRes.ok) throw new Error("Failed to refresh token");
    const tokens = await tokenRes.json();
    await supabase
      .from("qb_integration")
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: new Date(
          Date.now() + tokens.expires_in * 1000,
        ).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", integration.id);
    integration.access_token = tokens.access_token;
  }
  return {
    accessToken: integration.access_token,
    realmId: integration.realm_id,
  };
}

async function qbQuery(accessToken: string, realmId: string, query: string) {
  const url = `${QB_API_BASE}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=75`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok)
    throw new Error(`QB API error ${res.status}: ${await res.text()}`);
  return res.json();
}

function normalizeForMatch(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[\s-_]+/g, " ");
}

Deno.serve(async (req: Request) => {
  // Validate Authorization header with service role key
  const authHeader = req.headers.get("Authorization");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (
    !authHeader ||
    !serviceRoleKey ||
    authHeader !== `Bearer ${serviceRoleKey}`
  ) {
    return new Response(
      JSON.stringify({ error: "Unauthorized - Service role key required" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: syncRecord } = await supabase
    .from("qb_sync_history")
    .insert({ sync_type: "products", direction: "qb_to_supabase" })
    .select()
    .single();
  const stats = {
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [] as any[],
    unmatched: [] as any[],
  };

  try {
    const { accessToken, realmId } = await getValidToken(supabase);

    // ── Load QB Tax Rates and Tax Codes to resolve VAT per product ──
    const taxRateMap = new Map<string, number>(); // TaxRate.Id → RateValue
    const taxCodeMap = new Map<
      string,
      { name: string; rate: number; isTaxable: boolean }
    >(); // TaxCode.Id → { name, rate, isTaxable }

    // Step 1: Fetch all TaxRate entities
    try {
      const trResult = await qbQuery(
        accessToken,
        realmId,
        "SELECT * FROM TaxRate",
      );
      const taxRates = trResult?.QueryResponse?.TaxRate || [];
      for (const tr of taxRates) {
        let rate = Number(tr.RateValue) || 0;
        if (
          !tr.RateValue &&
          tr.EffectiveTaxRate &&
          tr.EffectiveTaxRate.length > 0
        ) {
          const now = new Date().toISOString();
          const activeRate = tr.EffectiveTaxRate.find((r: any) => {
            const effective = r.EffectiveDate
              ? new Date(r.EffectiveDate).toISOString()
              : null;
            const end = r.EndDate ? new Date(r.EndDate).toISOString() : null;
            if (effective && effective > now) return false;
            if (end && end < now) return false;
            return true;
          });
          if (activeRate) {
            rate = Number(activeRate.RateValue) || 0;
          } else {
            // Fallback to the last available rate
            rate =
              Number(
                tr.EffectiveTaxRate[tr.EffectiveTaxRate.length - 1].RateValue,
              ) || 0;
          }
        }
        taxRateMap.set(String(tr.Id), rate);
      }
    } catch (e: any) {
      stats.errors.push({ type: "tax_rate_fetch", error: e.message });
    }

    // Step 2: Fetch all TaxCode entities and resolve rates
    try {
      const tcResult = await qbQuery(
        accessToken,
        realmId,
        "SELECT * FROM TaxCode",
      );
      const taxCodes = tcResult?.QueryResponse?.TaxCode || [];
      for (const tc of taxCodes) {
        const isTaxable = tc.Taxable !== false;
        let totalRate = 0;

        // Sum all sale tax rates linked to this TaxCode
        const rateDetails = tc.SalesTaxRateList?.TaxRateDetail || [];
        for (const detail of rateDetails) {
          const rateId = String(detail.TaxRateRef?.value || "");
          if (rateId && taxRateMap.has(rateId)) {
            totalRate += taxRateMap.get(rateId)!;
          }
        }

        taxCodeMap.set(String(tc.Id), {
          name: tc.Name || "",
          rate: totalRate,
          isTaxable,
        });
      }
    } catch (e: any) {
      stats.errors.push({ type: "tax_code_fetch", error: e.message });
    }

    // Load all existing Supabase products for matching
    const { data: supaProducts } = await supabase
      .from("products")
      .select("id, sku, name, qb_item_id, cost_price_eur, vendor, barcode");
    const productBySku = new Map();
    const productByName = new Map();
    const productByQbId = new Map();

    (supaProducts || []).forEach((p: any) => {
      if (p.sku) productBySku.set(p.sku.toLowerCase().trim(), p);
      if (p.name) productByName.set(normalizeForMatch(p.name), p);
      if (p.qb_item_id) productByQbId.set(p.qb_item_id, p);
    });

    // Fetch all items from QB
    let startPosition = 1;
    const pageSize = 100;
    let hasMore = true;

    while (hasMore) {
      const query = `SELECT * FROM Item STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`;
      const result = await qbQuery(accessToken, realmId, query);
      const items = result?.QueryResponse?.Item || [];

      if (items.length === 0) {
        hasMore = false;
        break;
      }

      for (const item of items) {
        stats.processed++;
        try {
          // Skip non-product items (categories, service-only, etc.)
          if (item.Type === "Category" || item.Type === "Service") {
            stats.skipped++;
            continue;
          }

          // Try to match with existing Supabase product
          let matchedProduct = null;
          const qbId = String(item.Id);
          const qbName = item.Name?.toLowerCase().trim() || "";
          const qbSku = item.Sku?.toLowerCase().trim() || "";
          const qbDesc = item.Description?.toLowerCase().trim() || "";
          const qbPurchaseDesc = item.PurchaseDesc?.toLowerCase().trim() || "";

          // Priority 1: Match by qb_item_id (already linked)
          matchedProduct = productByQbId.get(qbId);

          // Priority 2: Match by exact SKU comparison (against QB Sku or QB Name)
          if (!matchedProduct) {
            if (qbSku) matchedProduct = productBySku.get(qbSku);
            if (!matchedProduct && qbName)
              matchedProduct = productBySku.get(qbName);
          }

          // Priority 3: Match by Code in Name/Sku (Many codes are 5+ digits)
          if (!matchedProduct) {
            const codeInName = qbName.match(/\d{5,}/)?.[0];
            const codeInSku = qbSku.match(/\d{5,}/)?.[0];
            if (codeInName) matchedProduct = productBySku.get(codeInName);
            if (!matchedProduct && codeInSku)
              matchedProduct = productBySku.get(codeInSku);
          }

          // Priority 4: Match by Description (Fuzzy match against Supabase name)
          if (!matchedProduct && item.Description) {
            matchedProduct = productByName.get(
              normalizeForMatch(item.Description),
            );
          }

          // Priority 5: Match by Sku field as Name (swapped fields case)
          if (!matchedProduct && item.Sku) {
            matchedProduct = productByName.get(normalizeForMatch(item.Sku));
          }

          // Priority 6: Match by Name (exact)
          if (!matchedProduct && item.Name) {
            matchedProduct = productByName.get(normalizeForMatch(item.Name));
          }

          // Priority 7: Partial Description match — QB stores real product name in Description,
          // while Name field is a warehouse/SKU code (e.g. "ST-03-1060" as Name,
          // "SaltStick FastChews 60 Tables - Tart Orange" as Description)
          if (!matchedProduct && item.Description) {
            const qbDescNorm = normalizeForMatch(item.Description);
            for (const [supaNorm, product] of productByName.entries()) {
              if (
                supaNorm.length > 5 &&
                (qbDescNorm.includes(supaNorm) || supaNorm.includes(qbDescNorm))
              ) {
                matchedProduct = product;
                break;
              }
            }
          }

          // Priority 8: Partial PurchaseDesc match (some items have name in purchase desc)
          if (!matchedProduct && item.PurchaseDesc) {
            const qbPDNorm = normalizeForMatch(item.PurchaseDesc);
            for (const [supaNorm, product] of productByName.entries()) {
              if (
                supaNorm.length > 5 &&
                (qbPDNorm.includes(supaNorm) || supaNorm.includes(qbPDNorm))
              ) {
                matchedProduct = product;
                break;
              }
            }
          }

          // Priority 9: Partial Name match (QB Name contains or is contained by Supabase name)
          if (!matchedProduct && item.Name) {
            const qbNorm2 = normalizeForMatch(item.Name);
            for (const [supaNorm, product] of productByName.entries()) {
              if (
                supaNorm.length > 5 &&
                (qbNorm2.includes(supaNorm) || supaNorm.includes(qbNorm2))
              ) {
                matchedProduct = product;
                break;
              }
            }
          }

          // Priority 10: SKU substring — Supabase SKU appears inside QB name/sku/desc
          if (!matchedProduct) {
            for (const [sku, product] of productBySku.entries()) {
              if (
                sku.length > 3 &&
                (qbName.includes(sku) ||
                  qbSku.includes(sku) ||
                  qbDesc.includes(sku))
              ) {
                matchedProduct = product;
                break;
              }
            }
          }

          if (!matchedProduct) {
            stats.unmatched.push({
              qb_id: item.Id,
              qb_name: item.Name,
              qb_sku: item.Sku || null,
              qb_type: item.Type,
              message: "No matching product found in Supabase",
            });
            stats.skipped++;
            continue;
          }

          // Enrich: only fill in fields that are empty/null in Supabase
          const updateData: Record<string, any> = {
            qb_item_id: qbId,
            qb_sync_token: item.SyncToken,
            qb_last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          // Cost: QB PurchaseCost is always authoritative — always overwrite
          if (item.PurchaseCost) {
            updateData.cost_price_eur = item.PurchaseCost;
          }
          if (!matchedProduct.vendor && item.PrefVendorRef?.name) {
            updateData.vendor = item.PrefVendorRef.name;
          }
          if (!matchedProduct.barcode && item.Sku) {
            updateData.barcode = item.Sku;
          }

          // Purchase description can go to vendor_sku if useful, but here we mainly want the mapping
          if (item.PurchaseDesc && !matchedProduct.vendor_sku) {
            updateData.vendor_sku = item.PurchaseDesc;
          }

          // SKU: se o produto ainda não tem SKU no Supabase, preencher com o Item.Sku do QuickBooks
          if (
            (!matchedProduct.sku || String(matchedProduct.sku).trim() === "") &&
            item.Sku
          ) {
            updateData.sku = item.Sku;
          }

          // VAT: Resolve tax code from QB SalesTaxCodeRef → rate percentage
          if (item.SalesTaxCodeRef?.value) {
            const taxCodeId = String(item.SalesTaxCodeRef.value);
            const taxInfo = taxCodeMap.get(taxCodeId);
            updateData.qb_sales_tax_code_id = taxCodeId;
            updateData.qb_sales_tax_code =
              taxInfo?.name || item.SalesTaxCodeRef.name || null;
            updateData.is_taxable = taxInfo ? taxInfo.isTaxable : true;
            updateData.vat_rate = taxInfo ? taxInfo.rate : null;
          } else {
            // No tax code on this item — mark as not taxable
            updateData.is_taxable = false;
            updateData.vat_rate = 0;
            updateData.qb_sales_tax_code = null;
            updateData.qb_sales_tax_code_id = null;
          }

          const { error } = await supabase
            .from("products")
            .update(updateData)
            .eq("id", matchedProduct.id);

          if (error) throw error;
          stats.updated++;
        } catch (err: any) {
          stats.failed++;
          stats.errors.push({
            qb_id: item.Id,
            name: item.Name,
            error: err.message,
          });
        }
      }

      startPosition += pageSize;
      if (items.length < pageSize) hasMore = false;
    }

    await supabase
      .from("qb_sync_history")
      .update({
        records_processed: stats.processed,
        records_created: stats.created,
        records_updated: stats.updated,
        records_skipped: stats.skipped,
        records_failed: stats.failed,
        errors: [
          ...stats.errors,
          ...stats.unmatched.map((u: any) => ({ type: "unmatched", ...u })),
        ],
        completed_at: new Date().toISOString(),
        status: "completed",
      })
      .eq("id", syncRecord?.id);

    // Build tax codes summary for the response
    const taxCodesSummary = Array.from(taxCodeMap.entries()).map(
      ([id, info]) => ({
        qb_tax_code_id: id,
        name: info.name,
        vat_rate: info.rate,
        is_taxable: info.isTaxable,
      }),
    );

    return new Response(
      JSON.stringify({
        success: true,
        sync_type: "products",
        stats: { ...stats, unmatched_count: stats.unmatched.length },
        tax_codes_resolved: taxCodesSummary,
        unmatched_products: stats.unmatched,
      }),
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error: any) {
    await supabase
      .from("qb_sync_history")
      .update({
        errors: [...stats.errors, { error: error.message }],
        completed_at: new Date().toISOString(),
        status: "failed",
      })
      .eq("id", syncRecord?.id);

    return new Response(
      JSON.stringify({ success: false, error: error.message, stats }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
});
