/**
 * B2B Price Report — report only (no writes).
 * Compares QuickBooks Item.UnitPrice and WooCommerce wholesale meta with Supabase products.wholesale_price_eur.
 * Returns how many prices are present in QB/WC but missing in Supabase.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const QB_CLIENT_ID = Deno.env.get("QB_CLIENT_ID") || "";
const QB_CLIENT_SECRET = Deno.env.get("QB_CLIENT_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const QB_API_BASE = Deno.env.get("QB_ENVIRONMENT") === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";

const WOO_URL = (Deno.env.get("WOOCOMMERCE_URL") || Deno.env.get("WOO_URL") || "").replace(/\/$/, "");
const WOO_CK = Deno.env.get("WOOCOMMERCE_CONSUMER_KEY") || Deno.env.get("WOO_CK") || "";
const WOO_CS = Deno.env.get("WOOCOMMERCE_CONSUMER_SECRET") || Deno.env.get("WOO_CS") || "";

const WHOLESALE_META_KEYS = [
    "wholesale_price", "_wholesale_price", "wwp_wholesale_price", "_wwp_wholesale_price",
    "wholesale_price_eur", "_wholesale_price_eur", "b2b_price", "_b2b_price",
];

async function getValidToken(supabase: Awaited<ReturnType<typeof createClient>>) {
    const { data: integration, error } = await supabase.from("qb_integration").select("*").limit(1).single();
    if (error || !integration) throw new Error("No QuickBooks integration found");
    const expiresAt = new Date(integration.token_expires_at);
    if (expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
        const basicAuth = btoa(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`);
        const tokenRes = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
            method: "POST",
            headers: { "Accept": "application/json", "Authorization": `Basic ${basicAuth}`, "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: integration.refresh_token }),
        });
        if (!tokenRes.ok) throw new Error("Failed to refresh QB token");
        const tokens = await tokenRes.json();
        await supabase.from("qb_integration").update({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            updated_at: new Date().toISOString(),
        }).eq("id", integration.id);
        (integration as any).access_token = tokens.access_token;
    }
    return { accessToken: (integration as any).access_token, realmId: integration.realm_id };
}

async function qbQuery(accessToken: string, realmId: string, query: string) {
    const url = `${QB_API_BASE}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}&minorversion=75`;
    const res = await fetch(url, { headers: { "Accept": "application/json", "Authorization": `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`QB API error ${res.status}: ${await res.text()}`);
    return res.json();
}

function normalizeForMatch(name: string): string {
    return (name || "").toLowerCase().trim().replace(/[\s-_]+/g, " ");
}

function findMatchedProduct(
    item: { Id: string; Name?: string; Sku?: string; Description?: string; PurchaseDesc?: string },
    productByQbId: Map<string, any>,
    productBySku: Map<string, any>,
    productByName: Map<string, any>,
): any | null {
    const qbId = String(item.Id);
    const qbName = (item.Name || "").toLowerCase().trim();
    const qbSku = (item.Sku || "").toLowerCase().trim();
    const qbDesc = (item.Description || "").toLowerCase().trim();
    let matched = productByQbId.get(qbId);
    if (matched) return matched;
    if (qbSku) matched = productBySku.get(qbSku);
    if (matched) return matched;
    if (qbName) matched = productBySku.get(qbName);
    if (matched) return matched;
    const codeInName = qbName.match(/\d{5,}/)?.[0];
    const codeInSku = qbSku.match(/\d{5,}/)?.[0];
    if (codeInName) matched = productBySku.get(codeInName);
    if (matched) return matched;
    if (codeInSku) matched = productBySku.get(codeInSku);
    if (matched) return matched;
    if (item.Description) matched = productByName.get(normalizeForMatch(item.Description));
    if (matched) return matched;
    if (item.Sku) matched = productByName.get(normalizeForMatch(item.Sku));
    if (matched) return matched;
    if (item.Name) matched = productByName.get(normalizeForMatch(item.Name));
    if (matched) return matched;
    if (item.Description) {
        const qbDescNorm = normalizeForMatch(item.Description);
        for (const [supaNorm, product] of productByName.entries()) {
            if (supaNorm.length > 5 && (qbDescNorm.includes(supaNorm) || supaNorm.includes(qbDescNorm))) return product;
        }
    }
    if (item.PurchaseDesc) {
        const qbPDNorm = normalizeForMatch(item.PurchaseDesc);
        for (const [supaNorm, product] of productByName.entries()) {
            if (supaNorm.length > 5 && (qbPDNorm.includes(supaNorm) || supaNorm.includes(qbPDNorm))) return product;
        }
    }
    if (item.Name) {
        const qbNorm2 = normalizeForMatch(item.Name);
        for (const [supaNorm, product] of productByName.entries()) {
            if (supaNorm.length > 5 && (qbNorm2.includes(supaNorm) || supaNorm.includes(qbNorm2))) return product;
        }
    }
    for (const [sku, product] of productBySku.entries()) {
        if (sku.length > 3 && (qbName.includes(sku) || qbSku.includes(sku) || qbDesc.includes(sku))) return product;
    }
    return null;
}

function getWholesaleFromMeta(meta_data: { key: string; value?: string }[] | undefined): number | null {
    if (!Array.isArray(meta_data)) return null;
    for (const key of WHOLESALE_META_KEYS) {
        const m = meta_data.find((x: any) => String(x.key) === key);
        if (m && m.value != null && m.value !== "") {
            const v = parseFloat(String(m.value));
            if (!isNaN(v) && v > 0) return v;
        }
    }
    return null;
}

/** Try every possible price field name from QBO Item (API may return different casing). */
function getItemPrice(item: any): number {
    const raw = item?.UnitPrice ?? item?.unitPrice ?? item?.Price ?? item?.price ?? item?.SalesPrice ?? item?.salesPrice ?? item?.Amount ?? item?.amount ?? null;
    if (raw == null) return 0;
    const n = Number(raw);
    return isNaN(n) ? 0 : n;
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const report: {
        supabase: { total: number; with_wholesale: number; without_wholesale: number };
        quickbooks: {
            items_with_unit_price: number; matched: number; missing_in_supabase: number;
            rows: { qb_id: string; qb_name: string; qb_sku: string; unit_price: number; supabase_id: string; supabase_name: string; supabase_sku: string }[];
            /** Lista de todos os preços encontrados no QB (para o utilizador ver o que está no QuickBooks) */
            prices_found: { qb_id: string; qb_name: string; qb_sku: string; unit_price: number; purchase_cost?: number }[];
        };
        woocommerce: {
            configured: boolean; products_with_wholesale: number; matched: number; missing_in_supabase: number;
            rows: { woo_id: number; woo_sku: string; woo_name: string; wholesale_price: number; supabase_id?: string; supabase_name?: string; supabase_sku?: string }[];
            /** Lista de todos os preços B2B encontrados no WooCommerce */
            prices_found: { woo_id: number; woo_name: string; woo_sku: string; wholesale_price: number }[];
        };
        generated_at: string;
    } = {
        supabase: { total: 0, with_wholesale: 0, without_wholesale: 0 },
        quickbooks: { items_with_unit_price: 0, matched: 0, missing_in_supabase: 0, rows: [], prices_found: [] },
        woocommerce: { configured: false, products_with_wholesale: 0, matched: 0, missing_in_supabase: 0, rows: [], prices_found: [] },
        generated_at: new Date().toISOString(),
    };

    try {
        const { data: supaProducts } = await supabase
            .from("products")
            .select("id, sku, name, wholesale_price_eur, qb_item_id");
        const products = supaProducts || [];

        report.supabase.total = products.length;
        report.supabase.with_wholesale = products.filter((p: any) => p.wholesale_price_eur != null && Number(p.wholesale_price_eur) > 0).length;
        report.supabase.without_wholesale = products.filter((p: any) => p.wholesale_price_eur == null || Number(p.wholesale_price_eur) <= 0).length;

        const productBySku = new Map<string, any>();
        const productByName = new Map<string, any>();
        const productByQbId = new Map<string, any>();
        products.forEach((p: any) => {
            if (p.sku) productBySku.set(String(p.sku).toLowerCase().trim(), p);
            if (p.name) productByName.set(normalizeForMatch(p.name), p);
            if (p.qb_item_id) productByQbId.set(String(p.qb_item_id), p);
        });

        // ── QuickBooks ──
        const MAX_QB_PRICES_DISPLAY = 500;
        try {
            const { accessToken, realmId } = await getValidToken(supabase);
            let startPosition = 1;
            const pageSize = 100;
            let hasMore = true;

            while (hasMore) {
                const query = `SELECT * FROM Item STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`;
                const result = await qbQuery(accessToken, realmId, query);
                const items = result?.QueryResponse?.Item || [];
                if (items.length === 0) { hasMore = false; break; }

                for (const item of items) {
                    if (item.Type === "Category" || item.Type === "Service") continue;

                    const unitPrice = getItemPrice(item);
                    const purchaseCost = (item.PurchaseCost != null || (item as any).purchaseCost != null) ? Number((item as any).PurchaseCost ?? (item as any).purchaseCost) : undefined;

                    if (report.quickbooks.prices_found.length < MAX_QB_PRICES_DISPLAY) {
                        report.quickbooks.prices_found.push({
                            qb_id: String(item.Id),
                            qb_name: item.Name || "",
                            qb_sku: item.Sku || "",
                            unit_price: unitPrice,
                            purchase_cost: purchaseCost != null && !isNaN(purchaseCost) ? purchaseCost : undefined,
                        });
                    }

                    if (unitPrice <= 0) continue;

                    report.quickbooks.items_with_unit_price++;
                    const matched = findMatchedProduct(item, productByQbId, productBySku, productByName);
                    if (!matched) continue;

                    report.quickbooks.matched++;
                    const hasWholesale = matched.wholesale_price_eur != null && Number(matched.wholesale_price_eur) > 0;
                    if (!hasWholesale) {
                        report.quickbooks.missing_in_supabase++;
                        report.quickbooks.rows.push({
                            qb_id: String(item.Id),
                            qb_name: item.Name || "",
                            qb_sku: item.Sku || "",
                            unit_price: unitPrice,
                            supabase_id: matched.id,
                            supabase_name: matched.name || "",
                            supabase_sku: matched.sku || "",
                        });
                    }
                }
                startPosition += pageSize;
                if (items.length < pageSize) hasMore = false;
            }
        } catch (qbErr: any) {
            report.quickbooks = { ...report.quickbooks, rows: [], prices_found: [], error: qbErr.message } as any;
        }

        // ── WooCommerce ──
        const hasWoo = WOO_URL && WOO_CK && WOO_CS;
        report.woocommerce.configured = hasWoo;

        if (hasWoo) {
            try {
                let page = 1;
                const perPage = 100;
                const auth = btoa(`${WOO_CK}:${WOO_CS}`);
                const baseUrl = `${WOO_URL}/wp-json/wc/v3/products`;

                while (true) {
                    const url = `${baseUrl}?per_page=${perPage}&page=${page}`;
                    const res = await fetch(url, { headers: { "Authorization": `Basic ${auth}` } });
                    if (!res.ok) throw new Error(`WooCommerce API ${res.status}: ${await res.text()}`);
                    const list = await res.json();
                    if (!Array.isArray(list) || list.length === 0) break;

                    for (const prod of list) {
                        const wholesale = getWholesaleFromMeta(prod.meta_data);
                        if (wholesale == null || wholesale <= 0) continue;

                        report.woocommerce.products_with_wholesale++;
                        (report.woocommerce.prices_found as any[]).push({
                            woo_id: prod.id,
                            woo_name: prod.name || "",
                            woo_sku: prod.sku || "",
                            wholesale_price: wholesale,
                        });

                        const sku = (prod.sku || "").toString().toLowerCase().trim();
                        const name = prod.name || "";
                        const matched = sku ? productBySku.get(sku) : productByName.get(normalizeForMatch(name));
                        if (matched) {
                            report.woocommerce.matched++;
                            const hasWholesale = matched.wholesale_price_eur != null && Number(matched.wholesale_price_eur) > 0;
                            if (!hasWholesale) {
                                report.woocommerce.missing_in_supabase++;
                                (report.woocommerce.rows as any[]).push({
                                    woo_id: prod.id,
                                    woo_sku: prod.sku || "",
                                    woo_name: name,
                                    wholesale_price: wholesale,
                                    supabase_id: matched.id,
                                    supabase_name: matched.name || "",
                                    supabase_sku: matched.sku || "",
                                });
                            }
                        }
                    }
                    if (list.length < perPage) break;
                    page++;
                }
            } catch (wooErr: any) {
                (report.woocommerce as any).error = wooErr.message;
            }
        }

        return new Response(JSON.stringify({ success: true, report }, null, 2), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
    } catch (err: any) {
        return new Response(JSON.stringify({ success: false, error: err.message, report }, null, 2), {
            status: 500,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
    }
});
