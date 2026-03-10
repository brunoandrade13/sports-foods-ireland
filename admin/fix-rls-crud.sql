-- ============================================================
-- FIX RLS: Permitir CRUD completo para o admin panel SFI
-- Executar no Supabase SQL Editor (https://supabase.com/dashboard)
-- Data: 9 Fev 2026
-- ============================================================

-- 1) PRODUCTS
DROP POLICY IF EXISTS "products_select" ON products;
DROP POLICY IF EXISTS "products_insert" ON products;
DROP POLICY IF EXISTS "products_update" ON products;
DROP POLICY IF EXISTS "products_delete" ON products;
DROP POLICY IF EXISTS "Allow public read" ON products;
DROP POLICY IF EXISTS "Allow public select" ON products;
DROP POLICY IF EXISTS "Enable read access for all users" ON products;
CREATE POLICY "allow_all_select" ON products FOR SELECT USING (true);
CREATE POLICY "allow_all_insert" ON products FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_all_update" ON products FOR UPDATE USING (true);
CREATE POLICY "allow_all_delete" ON products FOR DELETE USING (true);

-- 2) BRANDS
DROP POLICY IF EXISTS "brands_select" ON brands;
DROP POLICY IF EXISTS "brands_insert" ON brands;
DROP POLICY IF EXISTS "brands_update" ON brands;
DROP POLICY IF EXISTS "brands_delete" ON brands;
DROP POLICY IF EXISTS "Allow public read" ON brands;
DROP POLICY IF EXISTS "Allow public select" ON brands;
DROP POLICY IF EXISTS "Enable read access for all users" ON brands;
CREATE POLICY "allow_all_select" ON brands FOR SELECT USING (true);
CREATE POLICY "allow_all_insert" ON brands FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_all_update" ON brands FOR UPDATE USING (true);
CREATE POLICY "allow_all_delete" ON brands FOR DELETE USING (true);

-- 3) CATEGORIES
DROP POLICY IF EXISTS "categories_select" ON categories;
DROP POLICY IF EXISTS "categories_insert" ON categories;
DROP POLICY IF EXISTS "categories_update" ON categories;
DROP POLICY IF EXISTS "categories_delete" ON categories;
DROP POLICY IF EXISTS "Allow public read" ON categories;
DROP POLICY IF EXISTS "Allow public select" ON categories;
DROP POLICY IF EXISTS "Enable read access for all users" ON categories;
CREATE POLICY "allow_all_select" ON categories FOR SELECT USING (true);
CREATE POLICY "allow_all_insert" ON categories FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_all_update" ON categories FOR UPDATE USING (true);
CREATE POLICY "allow_all_delete" ON categories FOR DELETE USING (true);

-- 4) SUBCATEGORIES
DROP POLICY IF EXISTS "Allow public read" ON subcategories;
DROP POLICY IF EXISTS "Allow public select" ON subcategories;
DROP POLICY IF EXISTS "Enable read access for all users" ON subcategories;
CREATE POLICY "allow_all_select" ON subcategories FOR SELECT USING (true);
CREATE POLICY "allow_all_insert" ON subcategories FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_all_update" ON subcategories FOR UPDATE USING (true);
CREATE POLICY "allow_all_delete" ON subcategories FOR DELETE USING (true);

-- 5) DISCOUNT_CODES
DROP POLICY IF EXISTS "Allow public read" ON discount_codes;
DROP POLICY IF EXISTS "Allow public select" ON discount_codes;
DROP POLICY IF EXISTS "Enable read access for all users" ON discount_codes;
CREATE POLICY "allow_all_select" ON discount_codes FOR SELECT USING (true);
CREATE POLICY "allow_all_insert" ON discount_codes FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_all_update" ON discount_codes FOR UPDATE USING (true);
CREATE POLICY "allow_all_delete" ON discount_codes FOR DELETE USING (true);

-- 6) PRODUCT_VARIANTS
DROP POLICY IF EXISTS "Allow public read" ON product_variants;
DROP POLICY IF EXISTS "Allow public select" ON product_variants;
DROP POLICY IF EXISTS "Enable read access for all users" ON product_variants;
CREATE POLICY "allow_all_select" ON product_variants FOR SELECT USING (true);
CREATE POLICY "allow_all_insert" ON product_variants FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_all_update" ON product_variants FOR UPDATE USING (true);
CREATE POLICY "allow_all_delete" ON product_variants FOR DELETE USING (true);

-- 7) VARIANT_TYPES
DROP POLICY IF EXISTS "Allow public read" ON variant_types;
DROP POLICY IF EXISTS "Allow public select" ON variant_types;
DROP POLICY IF EXISTS "Enable read access for all users" ON variant_types;
CREATE POLICY "allow_all_select" ON variant_types FOR SELECT USING (true);
CREATE POLICY "allow_all_insert" ON variant_types FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_all_update" ON variant_types FOR UPDATE USING (true);
CREATE POLICY "allow_all_delete" ON variant_types FOR DELETE USING (true);

-- 8) CUSTOMERS (if exists)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Allow public read" ON customers;
  DROP POLICY IF EXISTS "Enable read access for all users" ON customers;
  CREATE POLICY "allow_all_select" ON customers FOR SELECT USING (true);
  CREATE POLICY "allow_all_insert" ON customers FOR INSERT WITH CHECK (true);
  CREATE POLICY "allow_all_update" ON customers FOR UPDATE USING (true);
  CREATE POLICY "allow_all_delete" ON customers FOR DELETE USING (true);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- 9) ORDERS (if exists)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Allow public read" ON orders;
  DROP POLICY IF EXISTS "Enable read access for all users" ON orders;
  CREATE POLICY "allow_all_select" ON orders FOR SELECT USING (true);
  CREATE POLICY "allow_all_insert" ON orders FOR INSERT WITH CHECK (true);
  CREATE POLICY "allow_all_update" ON orders FOR UPDATE USING (true);
  CREATE POLICY "allow_all_delete" ON orders FOR DELETE USING (true);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- 10) ORDER_ITEMS (if exists)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Allow public read" ON order_items;
  DROP POLICY IF EXISTS "Enable read access for all users" ON order_items;
  CREATE POLICY "allow_all_select" ON order_items FOR SELECT USING (true);
  CREATE POLICY "allow_all_insert" ON order_items FOR INSERT WITH CHECK (true);
  CREATE POLICY "allow_all_update" ON order_items FOR UPDATE USING (true);
  CREATE POLICY "allow_all_delete" ON order_items FOR DELETE USING (true);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================================
-- BONUS: Fix image_url extensions (.jpg/.png -> .webp)
-- ============================================================
UPDATE products 
SET image_url = regexp_replace(image_url, '\.(jpg|jpeg|png|gif)$', '.webp') 
WHERE image_url ~ '\.(jpg|jpeg|png|gif)$';

-- ============================================================
-- VERIFICATION: Run this to confirm policies are set
-- ============================================================
SELECT schemaname, tablename, policyname, permissive, cmd
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename IN ('products','brands','categories','subcategories','discount_codes','product_variants','variant_types')
ORDER BY tablename, cmd;
