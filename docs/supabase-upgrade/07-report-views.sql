-- ============================================================
-- SFI SUPABASE UPGRADE - PART 7: REPORT VIEWS & FUNCTIONS
-- Execute in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- SALES REPORTS
-- ============================================================

-- 7.1 DAILY SALES SUMMARY
-- ============================================================
CREATE OR REPLACE VIEW report_sales_daily AS
SELECT 
  DATE(o.created_at) AS sale_date,
  COUNT(DISTINCT o.id) AS total_orders,
  SUM(o.item_count) AS total_items,
  SUM(CASE WHEN o.currency = 'EUR' THEN o.total ELSE 0 END) AS revenue_eur,
  SUM(CASE WHEN o.currency = 'GBP' THEN o.total ELSE 0 END) AS revenue_gbp,
  SUM(o.discount_total) AS total_discounts,
  SUM(o.shipping_total) AS total_shipping,
  SUM(o.tax_total) AS total_tax,
  AVG(o.total) AS avg_order_value,
  COUNT(DISTINCT o.customer_id) AS unique_customers
FROM orders o
WHERE o.financial_status IN ('paid', 'partially_refunded')
GROUP BY DATE(o.created_at)
ORDER BY sale_date DESC;

-- 7.2 MONTHLY SALES SUMMARY
-- ============================================================
CREATE OR REPLACE VIEW report_sales_monthly AS
SELECT 
  DATE_TRUNC('month', o.created_at)::DATE AS sale_month,
  COUNT(DISTINCT o.id) AS total_orders,
  SUM(o.total) AS total_revenue,
  SUM(o.discount_total) AS total_discounts,
  SUM(o.shipping_total) AS total_shipping,
  SUM(o.tax_total) AS total_tax,
  AVG(o.total) AS avg_order_value,
  COUNT(DISTINCT o.customer_id) AS unique_customers,
  SUM(o.item_count) AS total_items
FROM orders o
WHERE o.financial_status IN ('paid', 'partially_refunded')
GROUP BY DATE_TRUNC('month', o.created_at)
ORDER BY sale_month DESC;

-- 7.3 SALES BY PRODUCT (Top sellers)
-- ============================================================
CREATE OR REPLACE VIEW report_sales_by_product AS
SELECT 
  p.id AS product_id,
  p.name AS product_name,
  p.sku,
  b.name AS brand_name,
  c.name AS category_name,
  COUNT(DISTINCT oi.order_id) AS orders_count,
  SUM(oi.quantity) AS units_sold,
  SUM(oi.total) AS total_revenue,
  AVG(oi.unit_price) AS avg_selling_price,
  p.cost_price_eur,
  SUM(oi.total) - (SUM(oi.quantity) * COALESCE(p.cost_price_eur, 0)) AS estimated_profit,
  p.stock_quantity AS current_stock
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
JOIN products p ON p.id = oi.product_id
LEFT JOIN brands b ON b.id = p.brand_id
LEFT JOIN categories c ON c.id = p.category_id
WHERE o.financial_status IN ('paid', 'partially_refunded')
GROUP BY p.id, p.name, p.sku, b.name, c.name, p.cost_price_eur, p.stock_quantity
ORDER BY total_revenue DESC;

-- 7.4 SALES BY CATEGORY
-- ============================================================
CREATE OR REPLACE VIEW report_sales_by_category AS
SELECT 
  c.id AS category_id,
  c.name AS category_name,
  COUNT(DISTINCT oi.order_id) AS orders_count,
  SUM(oi.quantity) AS units_sold,
  SUM(oi.total) AS total_revenue,
  COUNT(DISTINCT oi.product_id) AS products_sold,
  AVG(oi.total / NULLIF(oi.quantity, 0)) AS avg_unit_price
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
JOIN products p ON p.id = oi.product_id
LEFT JOIN categories c ON c.id = p.category_id
WHERE o.financial_status IN ('paid', 'partially_refunded')
GROUP BY c.id, c.name
ORDER BY total_revenue DESC;

-- 7.5 SALES BY BRAND
-- ============================================================
CREATE OR REPLACE VIEW report_sales_by_brand AS
SELECT 
  b.id AS brand_id,
  b.name AS brand_name,
  COUNT(DISTINCT oi.order_id) AS orders_count,
  SUM(oi.quantity) AS units_sold,
  SUM(oi.total) AS total_revenue,
  COUNT(DISTINCT oi.product_id) AS products_sold
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
JOIN products p ON p.id = oi.product_id
LEFT JOIN brands b ON b.id = p.brand_id
WHERE o.financial_status IN ('paid', 'partially_refunded')
GROUP BY b.id, b.name
ORDER BY total_revenue DESC;

-- ============================================================
-- FINANCIAL REPORTS
-- ============================================================

-- 7.6 FINANCIAL SUMMARY (P&L style)
-- ============================================================
CREATE OR REPLACE VIEW report_financial_summary AS
SELECT 
  DATE_TRUNC('month', o.created_at)::DATE AS period,
  
  -- Revenue
  SUM(o.subtotal) AS gross_sales,
  SUM(o.discount_total) AS total_discounts,
  SUM(o.subtotal) - SUM(o.discount_total) AS net_sales,
  
  -- Shipping
  SUM(o.shipping_total) AS shipping_revenue,
  
  -- Tax
  SUM(o.tax_total) AS tax_collected,
  
  -- Total
  SUM(o.total) AS total_revenue,
  
  -- Costs (estimated from cost_price_eur)
  SUM(oi_costs.total_cost) AS estimated_cogs,
  SUM(o.total) - COALESCE(SUM(oi_costs.total_cost), 0) AS estimated_gross_profit,
  
  -- Refunds
  COALESCE(SUM(ref.refund_total), 0) AS total_refunds,
  
  -- Net
  SUM(o.total) - COALESCE(SUM(oi_costs.total_cost), 0) - COALESCE(SUM(ref.refund_total), 0) AS estimated_net_profit,
  
  -- Metrics
  COUNT(DISTINCT o.id) AS order_count,
  AVG(o.total) AS avg_order_value
  
FROM orders o
LEFT JOIN LATERAL (
  SELECT SUM(oi.quantity * COALESCE(oi.cost_price, 0)) AS total_cost
  FROM order_items oi WHERE oi.order_id = o.id
) oi_costs ON true
LEFT JOIN LATERAL (
  SELECT SUM(r.amount) AS refund_total
  FROM order_refunds r WHERE r.order_id = o.id AND r.refund_status = 'processed'
) ref ON true
WHERE o.financial_status IN ('paid', 'partially_refunded', 'partially_paid')
GROUP BY DATE_TRUNC('month', o.created_at)
ORDER BY period DESC;

-- ============================================================
-- CUSTOMER REPORTS
-- ============================================================

-- 7.7 CUSTOMER LIFETIME VALUE
-- ============================================================
CREATE OR REPLACE VIEW report_customer_ltv AS
SELECT 
  cu.id AS customer_id,
  cu.first_name || ' ' || cu.last_name AS customer_name,
  cu.email,
  cu.created_at AS customer_since,
  COUNT(DISTINCT o.id) AS total_orders,
  SUM(o.total) AS total_spent,
  AVG(o.total) AS avg_order_value,
  MIN(o.created_at) AS first_order_at,
  MAX(o.created_at) AS last_order_at,
  EXTRACT(DAYS FROM NOW() - MAX(o.created_at)) AS days_since_last_order,
  
  -- Customer segment
  CASE 
    WHEN COUNT(o.id) >= 10 THEN 'Champion'
    WHEN COUNT(o.id) >= 5 THEN 'Loyal'
    WHEN COUNT(o.id) >= 3 THEN 'Potential Loyalist'
    WHEN COUNT(o.id) >= 2 THEN 'Promising'
    WHEN COUNT(o.id) = 1 AND EXTRACT(DAYS FROM NOW() - MAX(o.created_at)) <= 30 THEN 'New'
    WHEN COUNT(o.id) = 1 THEN 'Needs Attention'
    ELSE 'At Risk'
  END AS customer_segment
  
FROM customers cu
LEFT JOIN orders o ON o.customer_id = cu.id AND o.financial_status IN ('paid', 'partially_refunded')
GROUP BY cu.id, cu.first_name, cu.last_name, cu.email, cu.created_at;

-- 7.8 CUSTOMER ACQUISITION
-- ============================================================
CREATE OR REPLACE VIEW report_customer_acquisition AS
SELECT 
  DATE_TRUNC('month', cu.created_at)::DATE AS month,
  COUNT(*) AS new_customers,
  COUNT(CASE WHEN cu.source = 'website' THEN 1 END) AS from_website,
  COUNT(CASE WHEN cu.source = 'woocommerce' THEN 1 END) AS from_migration,
  COUNT(CASE WHEN cu.source = 'manual' THEN 1 END) AS from_manual,
  COUNT(CASE WHEN cu.accepts_marketing THEN 1 END) AS marketing_opted_in
FROM customers cu
GROUP BY DATE_TRUNC('month', cu.created_at)
ORDER BY month DESC;
-- ============================================================
-- INVENTORY REPORTS
-- ============================================================

-- 7.9 INVENTORY STATUS REPORT
-- ============================================================
CREATE OR REPLACE VIEW report_inventory_status AS
SELECT 
  p.id AS product_id,
  p.name,
  p.sku,
  b.name AS brand,
  c.name AS category,
  p.stock_quantity,
  p.low_stock_threshold,
  
  CASE 
    WHEN p.stock_quantity = 0 THEN 'Out of Stock'
    WHEN p.stock_quantity <= p.low_stock_threshold THEN 'Low Stock'
    WHEN p.stock_quantity <= p.low_stock_threshold * 3 THEN 'Medium'
    ELSE 'Good'
  END AS stock_status,
  
  p.cost_price_eur,
  p.stock_quantity * COALESCE(p.cost_price_eur, 0) AS stock_value_at_cost,
  p.stock_quantity * p.price_eur AS stock_value_at_retail,
  p.is_active,
  p.track_inventory
FROM products p
LEFT JOIN brands b ON b.id = p.brand_id
LEFT JOIN categories c ON c.id = p.category_id
WHERE p.is_active = true
ORDER BY 
  CASE WHEN p.stock_quantity = 0 THEN 0 
       WHEN p.stock_quantity <= p.low_stock_threshold THEN 1 
       ELSE 2 END,
  p.stock_quantity ASC;

-- 7.10 INVENTORY VALUATION SUMMARY
-- ============================================================
CREATE OR REPLACE VIEW report_inventory_valuation AS
SELECT 
  c.name AS category,
  COUNT(p.id) AS product_count,
  SUM(p.stock_quantity) AS total_units,
  SUM(p.stock_quantity * COALESCE(p.cost_price_eur, 0)) AS total_value_at_cost,
  SUM(p.stock_quantity * p.price_eur) AS total_value_at_retail,
  SUM(p.stock_quantity * p.price_eur) - SUM(p.stock_quantity * COALESCE(p.cost_price_eur, 0)) AS potential_profit,
  COUNT(CASE WHEN p.stock_quantity = 0 THEN 1 END) AS out_of_stock_count,
  COUNT(CASE WHEN p.stock_quantity <= p.low_stock_threshold AND p.stock_quantity > 0 THEN 1 END) AS low_stock_count
FROM products p
LEFT JOIN categories c ON c.id = p.category_id
WHERE p.is_active = true
GROUP BY c.name
ORDER BY total_value_at_retail DESC;

-- ============================================================
-- ANALYTICS REPORTS
-- ============================================================

-- 7.11 PRODUCT PERFORMANCE (views vs sales)
-- ============================================================
CREATE OR REPLACE VIEW report_product_performance AS
SELECT 
  p.id AS product_id,
  p.name,
  p.sku,
  b.name AS brand,
  
  -- Views
  COALESCE(pv.total_views, 0) AS total_views,
  COALESCE(pv.unique_sessions, 0) AS unique_visitors,
  
  -- Add to cart
  COALESCE(cart_events.add_to_cart_count, 0) AS add_to_cart_count,
  
  -- Purchases
  COALESCE(sales.units_sold, 0) AS units_sold,
  COALESCE(sales.revenue, 0) AS revenue,
  
  -- Conversion rates
  CASE WHEN COALESCE(pv.total_views, 0) > 0 
    THEN ROUND(COALESCE(cart_events.add_to_cart_count, 0)::NUMERIC / pv.total_views * 100, 2)
    ELSE 0 
  END AS view_to_cart_rate,
  
  CASE WHEN COALESCE(cart_events.add_to_cart_count, 0) > 0 
    THEN ROUND(COALESCE(sales.units_sold, 0)::NUMERIC / cart_events.add_to_cart_count * 100, 2)
    ELSE 0 
  END AS cart_to_purchase_rate,
  
  -- Wishlist
  COALESCE(wish.wishlist_count, 0) AS wishlist_saves
  
FROM products p
LEFT JOIN brands b ON b.id = p.brand_id
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS total_views, COUNT(DISTINCT session_id) AS unique_sessions
  FROM product_events WHERE product_id = p.id AND event_type = 'view'
) pv ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS add_to_cart_count
  FROM product_events WHERE product_id = p.id AND event_type = 'add_to_cart'
) cart_events ON true
LEFT JOIN LATERAL (
  SELECT SUM(oi.quantity) AS units_sold, SUM(oi.total) AS revenue
  FROM order_items oi JOIN orders o ON o.id = oi.order_id
  WHERE oi.product_id = p.id AND o.financial_status IN ('paid', 'partially_refunded')
) sales ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS wishlist_count
  FROM wishlist_items WHERE product_id = p.id
) wish ON true
WHERE p.is_active = true
ORDER BY COALESCE(sales.revenue, 0) DESC;

-- 7.12 TRAFFIC OVERVIEW
-- ============================================================
CREATE OR REPLACE VIEW report_traffic_daily AS
SELECT 
  DATE(pv.created_at) AS visit_date,
  COUNT(*) AS total_page_views,
  COUNT(DISTINCT pv.session_id) AS unique_sessions,
  COUNT(DISTINCT pv.customer_id) FILTER (WHERE pv.customer_id IS NOT NULL) AS logged_in_users,
  
  -- By device
  COUNT(*) FILTER (WHERE pv.device_type = 'desktop') AS desktop_views,
  COUNT(*) FILTER (WHERE pv.device_type = 'mobile') AS mobile_views,
  COUNT(*) FILTER (WHERE pv.device_type = 'tablet') AS tablet_views,
  
  -- By page type
  COUNT(*) FILTER (WHERE pv.page_type = 'home') AS home_views,
  COUNT(*) FILTER (WHERE pv.page_type = 'shop') AS shop_views,
  COUNT(*) FILTER (WHERE pv.page_type = 'product') AS product_views,
  COUNT(*) FILTER (WHERE pv.page_type = 'cart') AS cart_views,
  COUNT(*) FILTER (WHERE pv.page_type = 'checkout') AS checkout_views,
  
  -- Engagement
  AVG(pv.time_on_page_seconds) AS avg_time_on_page,
  AVG(pv.scroll_depth_percent) AS avg_scroll_depth
  
FROM page_views pv
GROUP BY DATE(pv.created_at)
ORDER BY visit_date DESC;

-- 7.13 SEARCH ANALYTICS
-- ============================================================
CREATE OR REPLACE VIEW report_search_analytics AS
SELECT 
  sq.query,
  COUNT(*) AS search_count,
  AVG(sq.results_count) AS avg_results,
  COUNT(CASE WHEN sq.results_count = 0 THEN 1 END) AS zero_result_count,
  COUNT(sq.clicked_product_id) AS click_count,
  ROUND(COUNT(sq.clicked_product_id)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1) AS click_through_rate,
  MAX(sq.created_at) AS last_searched
FROM search_queries sq
GROUP BY sq.query
ORDER BY search_count DESC;

-- 7.14 CONVERSION FUNNEL REPORT
-- ============================================================
CREATE OR REPLACE VIEW report_conversion_funnel AS
WITH funnel AS (
  SELECT 
    DATE(created_at) AS funnel_date,
    COUNT(DISTINCT session_id) FILTER (WHERE step = 'page_view') AS sessions,
    COUNT(DISTINCT session_id) FILTER (WHERE step = 'product_view') AS product_viewers,
    COUNT(DISTINCT session_id) FILTER (WHERE step = 'add_to_cart') AS cart_adders,
    COUNT(DISTINCT session_id) FILTER (WHERE step = 'begin_checkout') AS checkout_starters,
    COUNT(DISTINCT session_id) FILTER (WHERE step = 'purchase') AS purchasers
  FROM funnel_events
  GROUP BY DATE(created_at)
)
SELECT 
  funnel_date,
  sessions,
  product_viewers,
  cart_adders,
  checkout_starters,
  purchasers,
  ROUND(product_viewers::NUMERIC / NULLIF(sessions, 0) * 100, 1) AS view_rate,
  ROUND(cart_adders::NUMERIC / NULLIF(product_viewers, 0) * 100, 1) AS add_to_cart_rate,
  ROUND(checkout_starters::NUMERIC / NULLIF(cart_adders, 0) * 100, 1) AS checkout_rate,
  ROUND(purchasers::NUMERIC / NULLIF(checkout_starters, 0) * 100, 1) AS purchase_rate,
  ROUND(purchasers::NUMERIC / NULLIF(sessions, 0) * 100, 2) AS overall_conversion_rate
FROM funnel
ORDER BY funnel_date DESC;

-- 7.15 COUPON PERFORMANCE
-- ============================================================
CREATE OR REPLACE VIEW report_coupon_performance AS
SELECT 
  c.code,
  c.description,
  c.discount_type,
  c.discount_value,
  c.times_used,
  c.usage_limit,
  SUM(cu.discount_amount) AS total_discount_given,
  COUNT(DISTINCT cu.order_id) AS orders_using_coupon,
  AVG(o.total) AS avg_order_value_with_coupon,
  c.starts_at,
  c.expires_at,
  c.is_active
FROM coupons c
LEFT JOIN coupon_usage cu ON cu.coupon_id = c.id
LEFT JOIN orders o ON o.id = cu.order_id
GROUP BY c.id, c.code, c.description, c.discount_type, c.discount_value, 
         c.times_used, c.usage_limit, c.starts_at, c.expires_at, c.is_active
ORDER BY c.times_used DESC;

-- 7.16 ABANDONED CART REPORT
-- ============================================================
CREATE OR REPLACE VIEW report_abandoned_carts AS
SELECT 
  DATE(ac.abandoned_at) AS abandoned_date,
  COUNT(*) AS total_abandoned,
  SUM(ac.subtotal) AS total_value_lost,
  AVG(ac.subtotal) AS avg_cart_value,
  AVG(ac.item_count) AS avg_items,
  COUNT(CASE WHEN ac.recovery_status = 'recovered' THEN 1 END) AS recovered,
  COUNT(CASE WHEN ac.recovery_status = 'email_sent' THEN 1 END) AS emails_sent,
  ROUND(
    COUNT(CASE WHEN ac.recovery_status = 'recovered' THEN 1 END)::NUMERIC / 
    NULLIF(COUNT(*), 0) * 100, 1
  ) AS recovery_rate
FROM abandoned_carts ac
GROUP BY DATE(ac.abandoned_at)
ORDER BY abandoned_date DESC;
