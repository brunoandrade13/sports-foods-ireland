-- B2B Portal: Top Products RPC
-- Returns the most frequently ordered products for a specific B2B customer
-- Run this in Supabase SQL Editor

CREATE OR REPLACE FUNCTION get_b2b_top_products(
  p_customer_id BIGINT,
  p_limit INT DEFAULT 12
)
RETURNS TABLE (
  product_id BIGINT,
  product_name TEXT,
  brand_name TEXT,
  image_url TEXT,
  b2b_price NUMERIC,
  order_count BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    oi.product_id,
    COALESCE(p.name, oi.name) AS product_name,
    b.name AS brand_name,
    p.image_url,
    COALESCE(p.wholesale_price_eur, p.price_eur) AS b2b_price,
    COUNT(DISTINCT oi.order_id) AS order_count
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  LEFT JOIN products p ON p.id = oi.product_id
  LEFT JOIN brands b ON b.id = p.brand_id
  WHERE o.customer_id = p_customer_id
    AND o.financial_status = 'paid'
    AND oi.product_id IS NOT NULL
  GROUP BY oi.product_id, p.name, oi.name, b.name, p.image_url, p.wholesale_price_eur, p.price_eur
  ORDER BY order_count DESC, product_name ASC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION get_b2b_top_products(BIGINT, INT) TO anon, authenticated;
