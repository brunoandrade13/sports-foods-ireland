import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const WOO_URL = (
  Deno.env.get("WOOCOMMERCE_URL") ||
  Deno.env.get("WOO_URL") ||
  ""
).replace(/\/$/, "");
const WOO_CK =
  Deno.env.get("WOOCOMMERCE_CONSUMER_KEY") || Deno.env.get("WOO_CK") || "";
const WOO_CS =
  Deno.env.get("WOOCOMMERCE_CONSUMER_SECRET") || Deno.env.get("WOO_CS") || "";

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[\s-_]+/g, " ");
}

Deno.serve(async (req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const stats = {
    processed: 0,
    matched: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [] as any[],
    unmatched: [] as any[],
  };

  try {
    if (!WOO_URL || !WOO_CK || !WOO_CS) {
      throw new Error(
        "WooCommerce not configured. Set WOOCOMMERCE_URL + WOOCOMMERCE_CONSUMER_KEY + WOOCOMMERCE_CONSUMER_SECRET (or WOO_URL/WOO_CK/WOO_CS).",
      );
    }

    const { data: products, error } = await supabase
      .from("products")
      .select("id, sku, name")
      .eq("is_active", true);

    if (error) throw error;

    const bySku = new Map<string, any>();
    const byName = new Map<string, any>();

    (products || []).forEach((p: any) => {
      if (p.sku) bySku.set(String(p.sku).toLowerCase().trim(), p);
      if (p.name) byName.set(normalizeName(p.name), p);
    });

    const auth = btoa(`${WOO_CK}:${WOO_CS}`);
    const baseUrl = `${WOO_URL}/wp-json/wc/v3/products`;
    let page = 1;
    const perPage = 100;

    while (true) {
      const url = `${baseUrl}?per_page=${perPage}&page=${page}`;
      const res = await fetch(url, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!res.ok) {
        throw new Error(`WooCommerce API ${res.status}: ${await res.text()}`);
      }

      const list = await res.json();
      if (!Array.isArray(list) || list.length === 0) break;

      for (const prod of list) {
        stats.processed++;
        try {
          const wooSkuRaw = prod.sku || "";
          const wooName = prod.name || "";
          const wooSku = String(wooSkuRaw).trim();

          if (!wooSku && !wooName) {
            stats.skipped++;
            continue;
          }

          let matched: any = null;
          if (wooSku) {
            matched = bySku.get(wooSku.toLowerCase());
          }
          if (!matched && wooName) {
            matched = byName.get(normalizeName(wooName));
          }

          if (!matched) {
            stats.unmatched.push({
              woo_id: prod.id,
              woo_name: wooName,
              woo_sku: wooSku || null,
              message: "No matching product found in Supabase",
            });
            stats.skipped++;
            continue;
          }

          stats.matched++;

          const currentSku = matched.sku ? String(matched.sku).trim() : "";
          if (!wooSku) {
            stats.skipped++;
            continue;
          }

          // Se o SKU já é igual ao do Woo, não precisa atualizar
          if (currentSku === wooSku) {
            stats.skipped++;
            continue;
          }

          const { error: updErr } = await supabase
            .from("products")
            .update({ sku: wooSku, updated_at: new Date().toISOString() })
            .eq("id", matched.id);

          if (updErr) throw updErr;
          stats.updated++;

          // ----------------------------------------------------------
          // Variant SKUs: se produto for variável no Woo, tentar casar
          // variações do Woo com product_variants do Supabase pelo label
          // e atualizar product_variants.sku com o SKU da variação.
          // ----------------------------------------------------------
          if (Array.isArray(prod.variations) && prod.variations.length > 0) {
            const { data: variants, error: varErr } = await supabase
              .from("product_variants")
              .select("id,label,sku")
              .eq("product_id", matched.id)
              .eq("is_active", true);
            if (!varErr && variants && variants.length) {
              const byLabel = new Map<string, any>();
              (variants as any[]).forEach((v) => {
                if (v.label) {
                  byLabel.set(normalizeName(String(v.label)), v);
                }
              });

              // Buscar todas variações deste produto em uma chamada
              const varUrl = `${baseUrl}/${prod.id}/variations?per_page=100`;
              const vRes = await fetch(varUrl, {
                headers: { Authorization: `Basic ${auth}` },
              });
              if (vRes.ok) {
                const vList = await vRes.json();
                if (Array.isArray(vList) && vList.length) {
                  for (const vv of vList) {
                    const vSkuRaw = vv.sku || "";
                    const vSku = String(vSkuRaw).trim();
                    if (!vSku) continue;

                    const vName = vv.name || "";
                    const key = normalizeName(String(vName));
                    const matchVar = byLabel.get(key);
                    if (!matchVar) continue;

                    const currentVarSku = matchVar.sku
                      ? String(matchVar.sku).trim()
                      : "";
                    if (currentVarSku === vSku) continue;

                    await supabase
                      .from("product_variants")
                      .update({
                        sku: vSku,
                        updated_at: new Date().toISOString(),
                      })
                      .eq("id", matchVar.id);
                  }
                }
              }
            }
          }
        } catch (e: any) {
          stats.failed++;
          stats.errors.push({ woo_id: prod.id, error: e.message || String(e) });
        }
      }

      if (list.length < perPage) break;
      page++;
    }

    return new Response(JSON.stringify({ success: true, stats }, null, 2), {
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message, stats }, null, 2),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }
});
