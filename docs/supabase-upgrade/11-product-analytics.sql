-- ============================================================
-- SFI SUPABASE UPGRADE - PART 11: PRODUCT ANALYTICS RPC
-- Execute in Supabase SQL Editor to enable the "Top Products" reports
-- ============================================================

CREATE OR REPLACE FUNCTION get_product_analytics(date_from TIMESTAMPTZ, date_to TIMESTAMPTZ)
RETURNS TABLE (
    product_id UUID,
    product_name TEXT,
    product_sku TEXT,
    brand_name TEXT,
    category_name TEXT,
    total_qty BIGINT,
    total_revenue DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id AS product_id,
        MAX(p.name) AS product_name,
        MAX(p.sku) AS product_sku,
        MAX(b.name) AS brand_name,
        MAX(c.name) AS category_name,
        COALESCE(SUM(oi.quantity), 0)::BIGINT AS total_qty,
        COALESCE(SUM(oi.total), 0)::DECIMAL AS total_revenue
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    LEFT JOIN products p ON oi.product_id = p.id
    LEFT JOIN brands b ON p.brand_id = b.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE o.created_at >= date_from 
      AND o.created_at <= date_to
      AND o.status NOT IN ('cancelled', 'refunded', 'failed')
    GROUP BY p.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
