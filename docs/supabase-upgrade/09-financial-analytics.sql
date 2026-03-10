-- ============================================================
-- SFI SUPABASE UPGRADE - PART 9: FINANCIAL ANALYTICS
-- Execute in Supabase SQL Editor to enable the Reports tab
-- ============================================================

-- One-time backfill: copy product cost to order_items where missing
UPDATE order_items oi
SET cost_price = COALESCE(NULLIF(p.cost_price_eur, 0), p.purchase_cost)
FROM products p
WHERE oi.product_id = p.id
  AND oi.cost_price IS NULL
  AND ( (p.cost_price_eur IS NOT NULL AND p.cost_price_eur <> 0) OR (p.purchase_cost IS NOT NULL AND p.purchase_cost <> 0) );

-- Unit cost: order line first, then product (cost_price_eur = "Cost Price (EUR)" in admin)
CREATE OR REPLACE FUNCTION _fin_unit_cost(oi_cp DECIMAL, p_cpe DECIMAL, p_pc DECIMAL)
RETURNS DECIMAL AS $$
  SELECT COALESCE(NULLIF(oi_cp, 0), NULLIF(p_cpe, 0), NULLIF(p_pc, 0), 0)::DECIMAL;
$$ LANGUAGE sql IMMUTABLE;

DROP FUNCTION IF EXISTS get_financial_report(TIMESTAMPTZ, TIMESTAMPTZ);
CREATE OR REPLACE FUNCTION get_financial_report(date_from TIMESTAMPTZ, date_to TIMESTAMPTZ)
RETURNS TABLE (
    month TEXT,
    product_id UUID,
    product_name TEXT,
    brand_name TEXT,
    category_name TEXT,
    total_revenue DECIMAL,
    total_qty BIGINT,
    order_count BIGINT,
    total_cost DECIMAL,
    net_profit DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        to_char(o.created_at, 'YYYY-MM')::TEXT AS month,
        p.id AS product_id,
        MAX(p.name) AS product_name,
        MAX(b.name) AS brand_name,
        MAX(c.name) AS category_name,
        COALESCE(SUM(oi.total), 0)::DECIMAL AS total_revenue,
        COALESCE(SUM(oi.quantity), 0)::BIGINT AS total_qty,
        COUNT(DISTINCT o.id)::BIGINT AS order_count,
        COALESCE(SUM(oi.quantity * _fin_unit_cost(oi.cost_price, p.cost_price_eur, p.purchase_cost)), 0)::DECIMAL AS total_cost,
        (COALESCE(SUM(oi.total), 0) - COALESCE(SUM(oi.quantity * _fin_unit_cost(oi.cost_price, p.cost_price_eur, p.purchase_cost)), 0))::DECIMAL AS net_profit
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    LEFT JOIN products p ON oi.product_id = p.id
    LEFT JOIN brands b ON p.brand_id = b.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE o.created_at >= date_from
      AND o.created_at <= date_to
      AND o.status NOT IN ('cancelled', 'refunded', 'failed')
      AND (o.financial_status IS NULL OR o.financial_status IN ('paid', 'partially_refunded', 'partially_paid'))
    GROUP BY to_char(o.created_at, 'YYYY-MM'), p.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP FUNCTION IF EXISTS get_financial_analytics(TIMESTAMPTZ, TIMESTAMPTZ);
CREATE OR REPLACE FUNCTION get_financial_analytics(date_from TIMESTAMPTZ, date_to TIMESTAMPTZ)
RETURNS TABLE (
    product_id UUID,
    product_name TEXT,
    brand_name TEXT,
    category_name TEXT,
    total_qty BIGINT,
    gross_revenue DECIMAL,
    total_cost DECIMAL,
    net_profit DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id AS product_id,
        MAX(p.name) AS product_name,
        MAX(b.name) AS brand_name,
        MAX(c.name) AS category_name,
        COALESCE(SUM(oi.quantity), 0)::BIGINT AS total_qty,
        COALESCE(SUM(oi.total), 0)::DECIMAL AS gross_revenue,
        COALESCE(SUM(oi.quantity * _fin_unit_cost(oi.cost_price, p.cost_price_eur, p.purchase_cost)), 0)::DECIMAL AS total_cost,
        (COALESCE(SUM(oi.total), 0) - COALESCE(SUM(oi.quantity * _fin_unit_cost(oi.cost_price, p.cost_price_eur, p.purchase_cost)), 0))::DECIMAL AS net_profit
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    LEFT JOIN products p ON oi.product_id = p.id
    LEFT JOIN brands b ON p.brand_id = b.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE o.created_at >= date_from
      AND o.created_at <= date_to
      AND o.status NOT IN ('cancelled', 'refunded', 'failed')
      AND (o.financial_status IS NULL OR o.financial_status IN ('paid', 'partially_refunded', 'partially_paid'))
    GROUP BY p.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
