-- ============================================================
-- SFI SUPABASE UPGRADE - PART 9: RLS POLICIES
-- Execute in Supabase SQL Editor
-- ============================================================

-- Enable RLS on all new tables
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN 
    SELECT unnest(ARRAY[
      'addresses', 'customer_groups', 'customer_group_members',
      'product_images', 'collections', 'collection_products', 'product_metafields',
      'order_fulfillments', 'fulfillment_items', 'order_refunds', 'refund_items',
      'payment_transactions', 'invoices',
      'coupons', 'coupon_usage', 'gift_cards', 'gift_card_transactions',
      'abandoned_carts', 'email_log',
      'page_views', 'product_events', 'search_queries',
      'wishlists', 'wishlist_items', 'recently_viewed', 'cart_items', 'funnel_events',
      'admin_notifications',
      'reviews', 'inventory_movements',
      'shipping_zones', 'shipping_rates', 'tax_rates'
    ])
  LOOP
    EXECUTE format('ALTER TABLE IF EXISTS %I ENABLE ROW LEVEL SECURITY;', t);
  END LOOP;
END;
$$;

-- PUBLIC READ for products-related tables (anyone can browse the store)
CREATE POLICY IF NOT EXISTS "Public read products" ON products FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Public read brands" ON brands FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Public read categories" ON categories FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Public read subcategories" ON subcategories FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Public read product_images" ON product_images FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Public read collections" ON collections FOR SELECT USING (is_active = true);
CREATE POLICY IF NOT EXISTS "Public read collection_products" ON collection_products FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Public read product_metafields" ON product_metafields FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Public read product_variants" ON product_variants FOR SELECT USING (is_active = true);
CREATE POLICY IF NOT EXISTS "Public read reviews" ON reviews FOR SELECT USING (review_status = 'approved');
CREATE POLICY IF NOT EXISTS "Public read shipping_zones" ON shipping_zones FOR SELECT USING (is_active = true);
CREATE POLICY IF NOT EXISTS "Public read shipping_rates" ON shipping_rates FOR SELECT USING (is_active = true);
CREATE POLICY IF NOT EXISTS "Public read tax_rates" ON tax_rates FOR SELECT USING (is_active = true);
CREATE POLICY IF NOT EXISTS "Public read coupons" ON coupons FOR SELECT USING (is_active = true);

-- ANONYMOUS INSERT for tracking (anyone can send analytics)
CREATE POLICY IF NOT EXISTS "Anon insert page_views" ON page_views FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Anon insert product_events" ON product_events FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Anon insert search_queries" ON search_queries FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Anon insert funnel_events" ON funnel_events FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Anon insert recently_viewed" ON recently_viewed FOR INSERT WITH CHECK (true);

-- ANONYMOUS cart management
CREATE POLICY IF NOT EXISTS "Anon manage cart" ON cart_items FOR ALL USING (true) WITH CHECK (true);

-- ANONYMOUS wishlist (session-based)
CREATE POLICY IF NOT EXISTS "Anon manage wishlists" ON wishlists FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "Anon manage wishlist_items" ON wishlist_items FOR ALL USING (true) WITH CHECK (true);

-- ANONYMOUS review submission
CREATE POLICY IF NOT EXISTS "Anon submit reviews" ON reviews FOR INSERT WITH CHECK (true);

-- SERVICE ROLE has full access to everything (for admin panel)
-- This is automatic in Supabase when using the service_role key

-- ============================================================
-- GRANT ACCESS TO anon and authenticated roles
-- ============================================================
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

-- Analytics inserts for anonymous users
GRANT INSERT ON page_views TO anon;
GRANT INSERT ON product_events TO anon;
GRANT INSERT ON search_queries TO anon;
GRANT INSERT ON funnel_events TO anon;
GRANT INSERT ON recently_viewed TO anon;
GRANT INSERT ON reviews TO anon;

-- Cart and wishlist management
GRANT INSERT, UPDATE, DELETE ON cart_items TO anon;
GRANT INSERT, UPDATE, DELETE ON wishlists TO anon;
GRANT INSERT, UPDATE, DELETE ON wishlist_items TO anon;

-- Authenticated users can manage their own data
GRANT INSERT, UPDATE ON addresses TO authenticated;
GRANT INSERT, UPDATE, DELETE ON cart_items TO authenticated;
GRANT INSERT, UPDATE, DELETE ON wishlists TO authenticated;
GRANT INSERT, UPDATE, DELETE ON wishlist_items TO authenticated;
GRANT INSERT ON reviews TO authenticated;
GRANT INSERT ON abandoned_carts TO authenticated;
