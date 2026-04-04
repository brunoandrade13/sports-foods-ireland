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

function mapQbPoStatus(po: any): string {
  const status = (po.POStatus || "").toLowerCase();
  if (status === "closed") return "closed";
  if (status === "pending") return "pending";
  return "ordered";
}

Deno.serve(async (req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let syncRecord: { id?: string } | null = null;
  try {
    const r = await supabase
      .from("qb_sync_history")
      .insert({ sync_type: "purchase_orders", direction: "qb_to_supabase" })
      .select()
      .single();
    syncRecord = r.data;
  } catch (_) {
    /* table may not exist */
  }
  const stats = {
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [] as any[],
  };

  try {
    const { accessToken, realmId } = await getValidToken(supabase);

    const { data: suppliers } = await supabase
      .from("suppliers")
      .select("id, name");
    const supplierByName = new Map<string, string>();
    (suppliers || []).forEach((s: any) =>
      supplierByName.set((s.name || "").trim().toLowerCase(), s.id),
    );

    const { data: products } = await supabase
      .from("products")
      .select("id, sku, name, qb_item_id");
    const productByQbId = new Map<string, any>();
    (products || []).forEach((p: any) => {
      if (p.qb_item_id) productByQbId.set(String(p.qb_item_id), p);
    });

    let startPosition = 1;
    const pageSize = 100;
    let hasMore = true;

    while (hasMore) {
      const query = `SELECT * FROM PurchaseOrder STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`;
      const result = await qbQuery(accessToken, realmId, query);
      const purchaseOrders = result?.QueryResponse?.PurchaseOrder || [];

      if (purchaseOrders.length === 0) {
        hasMore = false;
        break;
      }

      for (const po of purchaseOrders) {
        stats.processed++;
        try {
          const qbId = String(po.Id);
          const poNumber = po.DocNumber ? `QB-${po.DocNumber}` : `QB-${po.Id}`;
          const vendorRef = po.VendorRef || {};
          const vendorQbId = vendorRef.value ? String(vendorRef.value) : null;
          const vendorName = vendorRef.name || "Unknown Vendor";
          const vendorNameNorm = vendorName.trim().toLowerCase();
          const supplierId = supplierByName.get(vendorNameNorm) || null;

          const orderDate = po.TxnDate
            ? new Date(po.TxnDate).toISOString().slice(0, 10)
            : null;
          const dueDate = po.DueDate
            ? new Date(po.DueDate).toISOString().slice(0, 10)
            : null;
          const totalAmt = po.TotalAmt ?? 0;
          const status = mapQbPoStatus(po);
          const notes =
            [po.PrivateNote, supplierId ? null : `QB Vendor: ${vendorName}`]
              .filter(Boolean)
              .join("\n") || null;

          let existing: { id: string } | null = null;
          const byPo = await supabase
            .from("purchase_orders")
            .select("id")
            .eq("po_number", poNumber)
            .maybeSingle();
          existing = byPo.data;
          if (!existing && byPo.error && byPo.error.code !== "PGRST116")
            throw new Error(byPo.error.message);

          const poData: Record<string, any> = {
            po_number: poNumber,
            supplier_id: supplierId,
            status,
            order_date: orderDate,
            expected_date: dueDate,
            currency: po.CurrencyRef?.value || "EUR",
            total: totalAmt,
            subtotal: totalAmt - (po.TxnTaxDetail?.TotalTax || 0),
            tax_amount: po.TxnTaxDetail?.TotalTax || 0,
            notes: notes || po.PrivateNote || null,
            updated_at: new Date().toISOString(),
          };

          let poRecordId: string;
          if (existing && existing.id) {
            await supabase
              .from("purchase_orders")
              .update(poData)
              .eq("id", existing.id);
            poRecordId = existing.id;
            await supabase
              .from("purchase_order_items")
              .delete()
              .eq("purchase_order_id", existing.id);
            stats.updated++;
          } else {
            const { data: inserted, error: insertErr } = await supabase
              .from("purchase_orders")
              .insert(poData)
              .select("id")
              .single();
            if (insertErr) throw insertErr;
            poRecordId = inserted.id;
            stats.created++;
          }

          const lines = (po.Line || []).filter(
            (l: any) =>
              l.DetailType === "ItemBasedExpenseLineDetail" ||
              l.DetailType === "PurchaseOrderItemLineDetail" ||
              (l.ItemBasedExpenseLineDetail && l.Amount != null),
          );
          const items: any[] = [];
          for (const line of lines) {
            const detail =
              line.ItemBasedExpenseLineDetail ||
              line.PurchaseOrderItemLineDetail ||
              line;
            const qty = detail.Qty ?? line.Qty ?? 1;
            const unitPrice = detail.UnitPrice ?? line.UnitPrice ?? 0;
            const amount = line.Amount ?? qty * unitPrice;
            const itemRef = detail.ItemRef || line.ItemRef;
            const itemName = (
              itemRef?.name ||
              line.Description ||
              "Item"
            ).trim();
            const itemQbId = itemRef?.value ? String(itemRef.value) : null;
            const product = itemQbId ? productByQbId.get(itemQbId) : null;

            items.push({
              purchase_order_id: poRecordId,
              product_id: product?.id || null,
              sku: product?.sku || null,
              product_name: itemName,
              quantity_ordered: Math.round(qty),
              quantity_received: 0,
              unit_cost: unitPrice,
              total_cost: amount,
            });
          }
          if (items.length > 0) {
            const { error: itemsErr } = await supabase
              .from("purchase_order_items")
              .insert(items);
            if (itemsErr)
              stats.errors.push({
                qb_po: poNumber,
                error: `Items: ${itemsErr.message}`,
              });
          }
        } catch (err: any) {
          stats.failed++;
          stats.errors.push({
            qb_po: po.DocNumber || po.Id,
            error: err.message,
          });
        }
      }

      startPosition += pageSize;
      if (purchaseOrders.length < pageSize) hasMore = false;
    }

    if (syncRecord?.id) {
      await supabase
        .from("qb_sync_history")
        .update({
          records_processed: stats.processed,
          records_created: stats.created,
          records_updated: stats.updated,
          records_failed: stats.failed,
          errors: stats.errors,
          completed_at: new Date().toISOString(),
          status: "completed",
        })
        .eq("id", syncRecord.id);
    }

    return new Response(
      JSON.stringify({ success: true, sync_type: "purchase_orders", stats }),
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error: any) {
    if (syncRecord?.id) {
      await supabase
        .from("qb_sync_history")
        .update({
          errors: [...stats.errors, { error: error.message }],
          completed_at: new Date().toISOString(),
          status: "failed",
        })
        .eq("id", syncRecord.id);
    }

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
