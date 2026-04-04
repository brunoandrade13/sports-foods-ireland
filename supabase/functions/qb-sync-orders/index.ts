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

function mapQbStatusToOrderStatus(invoice: any): {
  status: string;
  payment_status: string;
  financial_status: string;
} {
  const balance = invoice.Balance || 0;
  const total = invoice.TotalAmt || 0;

  if (balance === 0 && total > 0) {
    return {
      status: "delivered",
      payment_status: "paid",
      financial_status: "paid",
    };
  } else if (balance < total && balance > 0) {
    return {
      status: "confirmed",
      payment_status: "paid",
      financial_status: "partially_paid",
    };
  } else {
    return {
      status: "pending",
      payment_status: "pending",
      financial_status: "pending",
    };
  }
}

Deno.serve(async (req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: syncRecord } = await supabase
    .from("qb_sync_history")
    .insert({ sync_type: "orders", direction: "qb_to_supabase" })
    .select()
    .single();
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

    // Build lookup maps
    const { data: customers } = await supabase
      .from("customers")
      .select("id, qb_customer_id")
      .not("qb_customer_id", "is", null);
    const customerMap = new Map();
    (customers || []).forEach((c: any) =>
      customerMap.set(c.qb_customer_id, c.id),
    );

    const { data: products } = await supabase
      .from("products")
      .select("id, sku, name, qb_item_id");
    const productBySku = new Map();
    const productByQbId = new Map();
    (products || []).forEach((p: any) => {
      if (p.sku) productBySku.set(p.sku.toLowerCase().trim(), p);
      if (p.qb_item_id) productByQbId.set(p.qb_item_id, p);
    });

    let startPosition = 1;
    const pageSize = 100;
    let hasMore = true;

    while (hasMore) {
      const query = `SELECT * FROM Invoice STARTPOSITION ${startPosition} MAXRESULTS ${pageSize}`;
      const result = await qbQuery(accessToken, realmId, query);
      const invoices = result?.QueryResponse?.Invoice || [];

      if (invoices.length === 0) {
        hasMore = false;
        break;
      }

      for (const invoice of invoices) {
        stats.processed++;
        try {
          const { data: existing } = await supabase
            .from("orders")
            .select("id")
            .eq("qb_invoice_id", String(invoice.Id))
            .maybeSingle();

          if (existing) {
            const statusInfo = mapQbStatusToOrderStatus(invoice);
            await supabase
              .from("orders")
              .update({
                ...statusInfo,
                total: invoice.TotalAmt,
                qb_sync_token: invoice.SyncToken,
                qb_last_synced_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", existing.id);

            // Delete old items and re-sync to ensure correct descriptions/links
            await supabase
              .from("order_items")
              .delete()
              .eq("order_id", existing.id);
          }

          const customerId = invoice.CustomerRef?.value
            ? customerMap.get(String(invoice.CustomerRef.value))
            : null;

          const statusInfo = mapQbStatusToOrderStatus(invoice);
          const shippingAddr = invoice.ShipAddr
            ? {
                line1: invoice.ShipAddr.Line1 || "",
                line2: invoice.ShipAddr.Line2 || "",
                city: invoice.ShipAddr.City || "",
                county: invoice.ShipAddr.CountrySubDivisionCode || "",
                postal_code: invoice.ShipAddr.PostalCode || "",
                country: invoice.ShipAddr.Country || "IE",
              }
            : {};

          const billingAddr = invoice.BillAddr
            ? {
                line1: invoice.BillAddr.Line1 || "",
                line2: invoice.BillAddr.Line2 || "",
                city: invoice.BillAddr.City || "",
                county: invoice.BillAddr.CountrySubDivisionCode || "",
                postal_code: invoice.BillAddr.PostalCode || "",
                country: invoice.BillAddr.Country || "IE",
              }
            : null;

          const orderData: Record<string, any> = {
            order_number: invoice.DocNumber
              ? `QB-${invoice.DocNumber}`
              : `QB-${invoice.Id}`,
            customer_id: customerId || null,
            customer_email: invoice.BillEmail?.Address || null,
            customer_name: invoice.CustomerRef?.name || null,
            ...statusInfo,
            currency: invoice.CurrencyRef?.value || "EUR",
            subtotal: invoice.TotalAmt - (invoice.TxnTaxDetail?.TotalTax || 0),
            tax_amount: invoice.TxnTaxDetail?.TotalTax || 0,
            tax_total: invoice.TxnTaxDetail?.TotalTax || 0,
            total: invoice.TotalAmt,
            shipping_address: shippingAddr,
            billing_address: billingAddr,
            shipping_cost: 0,
            discount_amount: 0,
            qb_invoice_id: String(invoice.Id),
            qb_sync_token: invoice.SyncToken,
            qb_last_synced_at: new Date().toISOString(),
            source: "api",
            notes: invoice.CustomerMemo?.value || null,
            created_at:
              invoice.MetaData?.CreateTime ||
              invoice.TxnDate ||
              new Date().toISOString(),
          };

          let orderId = existing?.id;
          if (!existing) {
            const { data: newOrder, error: orderError } = await supabase
              .from("orders")
              .insert(orderData)
              .select("id")
              .single();
            if (orderError) throw orderError;
            orderId = newOrder.id;
          }

          const lineItems = (invoice.Line || []).filter(
            (l: any) => l.DetailType === "SalesItemLineDetail",
          );
          const orderItems = [];

          for (const line of lineItems) {
            const detail = line.SalesItemLineDetail;
            const qbItemId = detail?.ItemRef?.value
              ? String(detail.ItemRef.value)
              : null;
            const qbNameRaw = detail?.ItemRef?.name || "";
            const qbName = qbNameRaw.toLowerCase().trim();

            let matchedProduct = null;
            if (qbItemId) matchedProduct = productByQbId.get(qbItemId);

            // Item name match
            if (!matchedProduct && qbName) {
              matchedProduct = productBySku.get(qbName);
            }

            // Code in name match (e.g. 12345)
            if (!matchedProduct && qbName) {
              const code = qbName.match(/\d{5,}/)?.[0];
              if (code) matchedProduct = productBySku.get(code);
            }

            // Substring match
            if (!matchedProduct && qbName.length > 3) {
              for (const [sku, product] of productBySku.entries()) {
                if (sku.length > 3 && qbName.includes(sku)) {
                  matchedProduct = product;
                  break;
                }
              }
            }

            orderItems.push({
              order_id: orderId,
              product_id: matchedProduct?.id || null,
              // Favor line description for readable names if no match found
              product_name:
                matchedProduct?.name ||
                line.Description ||
                qbNameRaw ||
                "Unknown",
              product_sku: matchedProduct?.sku || qbNameRaw || qbItemId || "",
              quantity: detail?.Qty || 1,
              unit_price: detail?.UnitPrice || line.Amount || 0,
              total_price: line.Amount || 0,
              total: line.Amount || 0,
              created_at:
                invoice.MetaData?.CreateTime || new Date().toISOString(),
            });
          }

          if (orderItems.length > 0) {
            const { error: itemsError } = await supabase
              .from("order_items")
              .insert(orderItems);
            if (itemsError)
              stats.errors.push({
                qb_invoice: invoice.DocNumber,
                error: `Items error: ${itemsError.message}`,
              });
          }

          await supabase
            .from("orders")
            .update({
              item_count: orderItems.reduce(
                (s: number, i: any) => s + i.quantity,
                0,
              ),
            })
            .eq("id", orderId);

          if (existing) stats.updated++;
          else stats.created++;
        } catch (err: any) {
          stats.failed++;
          stats.errors.push({
            qb_invoice: invoice.DocNumber || invoice.Id,
            error: err.message,
          });
        }
      }

      startPosition += pageSize;
      if (invoices.length < pageSize) hasMore = false;
    }

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
      .eq("id", syncRecord?.id);

    return new Response(
      JSON.stringify({ success: true, sync_type: "orders", stats }),
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
