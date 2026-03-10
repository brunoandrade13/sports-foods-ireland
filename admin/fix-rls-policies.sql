-- ============================================================
-- FIX RLS: Allow full CRUD for anon role on all admin tables
-- Run this in Supabase SQL Editor
-- ============================================================

-- PRODUCTS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products_select" ON products;
DROP POLICY IF EXISTS "products_insert" ON products;
DROP POLICY IF EXISTS "products_update" ON products;
DROP POLICY IF EXISTS "products_delete" ON products;
CREATE POLICY "products_select" ON products FOR SELECT USING (true);
CREATE POLICY "products_insert" ON products FOR INSERT WITH CHECK (true);
CREATE POLICY "products_update" ON products FOR UPDATE USING (true);
CREATE POLICY "products_delete" ON products FOR DELETE USING (true);

-- BRANDS
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "brands_select" ON brands;
DROP POLICY IF EXISTS "brands_insert" ON brands;
DROP POLICY IF EXISTS "brands_update" ON brands;
DROP POLICY IF EXISTS "brands_delete" ON brands;
CREATE POLICY "brands_select" ON brands FOR SELECT USING (true);
CREATE POLICY "brands_insert" ON brands FOR INSERT WITH CHECK (true);
CREATE POLICY "brands_update" ON brands FOR UPDATE USING (true);
CREATE POLICY "brands_delete" ON brands FOR DELETE USING (true);

-- CATEGORIES
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "categories_select" ON categories;
DROP POLICY IF EXISTS "categories_insert" ON categories;
DROP POLICY IF EXISTS "categories_update" ON categories;
DROP POLICY IF EXISTS "categories_delete" ON categories;
CREATE POLICY "categories_select" ON categories FOR SELECT USING (true);
CREATE POLICY "categories_insert" ON categories FOR INSERT WITH CHECK (true);
CREATE POLICY "categories_update" ON categories FOR UPDATE USING (true);
CREATE POLICY "categories_delete" ON categories FOR DELETE USING (true);

-- SUBCATEGORIES
ALTER TABLE subcategories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subcategories_select" ON subcategories;
DROP POLICY IF EXISTS "subcategories_insert" ON subcategories;
DROP POLICY IF EXISTS "subcategories_update" ON subcategories;
DROP POLICY IF EXISTS "subcategories_delete" ON subcategories;
CREATE POLICY "subcategories_select" ON subcategories FOR SELECT USING (true);
CREATE POLICY "subcategories_insert" ON subcategories FOR INSERT WITH CHECK (true);
CREATE POLICY "subcategories_update" ON subcategories FOR UPDATE USING (true);
CREATE POLICY "subcategories_delete" ON subcategories FOR DELETE USING (true);

-- DISCOUNT_CODES
ALTER TABLE discount_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "discount_codes_select" ON discount_codes;
DROP POLICY IF EXISTS "discount_codes_insert" ON discount_codes;
DROP POLICY IF EXISTS "discount_codes_update" ON discount_codes;
DROP POLICY IF EXISTS "discount_codes_delete" ON discount_codes;
CREATE POLICY "discount_codes_select" ON discount_codes FOR SELECT USING (true);
CREATE POLICY "discount_codes_insert" ON discount_codes FOR INSERT WITH CHECK (true);
CREATE POLICY "discount_codes_update" ON discount_codes FOR UPDATE USING (true);
CREATE POLICY "discount_codes_delete" ON discount_codes FOR DELETE USING (true);

-- PRODUCT_VARIANTS
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "product_variants_select" ON product_variants;
DROP POLICY IF EXISTS "product_variants_insert" ON product_variants;
DROP POLICY IF EXISTS "product_variants_update" ON product_variants;
DROP POLICY IF EXISTS "product_variants_delete" ON product_variants;
CREATE POLICY "product_variants_select" ON product_variants FOR SELECT USING (true);
CREATE POLICY "product_variants_insert" ON product_variants FOR INSERT WITH CHECK (true);
CREATE POLICY "product_variants_update" ON product_variants FOR UPDATE USING (true);
CREATE POLICY "product_variants_delete" ON product_variants FOR DELETE USING (true);

-- VARIANT_TYPES
ALTER TABLE variant_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "variant_types_select" ON variant_types;
DROP POLICY IF EXISTS "variant_types_insert" ON variant_types;
DROP POLICY IF EXISTS "variant_types_update" ON variant_types;
DROP POLICY IF EXISTS "variant_types_delete" ON variant_types;
CREATE POLICY "variant_types_select" ON variant_types FOR SELECT USING (true);
CREATE POLICY "variant_types_insert" ON variant_types FOR INSERT WITH CHECK (true);
CREATE POLICY "variant_types_update" ON variant_types FOR UPDATE USING (true);
CREATE POLICY "variant_types_delete" ON variant_types FOR DELETE USING (true);

-- CUSTOMERS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "customers_select" ON customers;
DROP POLICY IF EXISTS "customers_insert" ON customers;
DROP POLICY IF EXISTS "customers_update" ON customers;
DROP POLICY IF EXISTS "customers_delete" ON customers;
CREATE POLICY "customers_select" ON customers FOR SELECT USING (true);
CREATE POLICY "customers_insert" ON customers FOR INSERT WITH CHECK (true);
CREATE POLICY "customers_update" ON customers FOR UPDATE USING (true);
CREATE POLICY "customers_delete" ON customers FOR DELETE USING (true);

-- ORDERS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "orders_select" ON orders;
DROP POLICY IF EXISTS "orders_insert" ON orders;
DROP POLICY IF EXISTS "orders_update" ON orders;
DROP POLICY IF EXISTS "orders_delete" ON orders;
CREATE POLICY "orders_select" ON orders FOR SELECT USING (true);
CREATE POLICY "orders_insert" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "orders_update" ON orders FOR UPDATE USING (true);
CREATE POLICY "orders_delete" ON orders FOR DELETE USING (true);

-- ORDER_ITEMS
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_items_select" ON order_items;
DROP POLICY IF EXISTS "order_items_insert" ON order_items;
DROP POLICY IF EXISTS "order_items_update" ON order_items;
DROP POLICY IF EXISTS "order_items_delete" ON order_items;
CREATE POLICY "order_items_select" ON order_items FOR SELECT USING (true);
CREATE POLICY "order_items_insert" ON order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "order_items_update" ON order_items FOR UPDATE USING (true);
CREATE POLICY "order_items_delete" ON order_items FOR DELETE USING (true);
