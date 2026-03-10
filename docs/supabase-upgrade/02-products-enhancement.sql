-- ============================================================
-- SFI SUPABASE UPGRADE - PART 2: PRODUCTS ENHANCEMENT
-- Execute in Supabase SQL Editor
-- ============================================================

-- 2.1 ENHANCE PRODUCTS TABLE
-- ============================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT;              -- EAN/UPC
ALTER TABLE products ADD COLUMN IF NOT EXISTS manufacturer TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS country_of_origin TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS shelf_life_days INT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS storage_instructions TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS allergens TEXT[];           -- ['gluten', 'dairy', 'soy']
ALTER TABLE products ADD COLUMN IF NOT EXISTS certifications TEXT[];      -- ['informed-sport', 'organic', 'vegan']
ALTER TABLE products ADD COLUMN IF NOT EXISTS vegan BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS gluten_free BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS caffeine_free BOOLEAN DEFAULT false;

-- Dimensions for shipping
ALTER TABLE products ADD COLUMN IF NOT EXISTS length_cm DECIMAL(8,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS width_cm DECIMAL(8,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS height_cm DECIMAL(8,2);

-- Vendor/Supplier info
ALTER TABLE products ADD COLUMN IF NOT EXISTS vendor TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS vendor_sku TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price_gbp DECIMAL(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS margin_percent DECIMAL(5,2);

-- Publishing
ALTER TABLE products ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE products ADD COLUMN IF NOT EXISTS published_scope TEXT DEFAULT 'web' CHECK (published_scope IN ('web', 'global'));

-- SEO enhancement
ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_url_handle TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_keywords TEXT[];

-- Sales tracking
ALTER TABLE products ADD COLUMN IF NOT EXISTS total_sold INT DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS total_revenue_eur DECIMAL(12,2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS view_count INT DEFAULT 0;

-- 2.2 PRODUCT IMAGES (separate table, more flexible than JSONB)
-- ============================================================
CREATE TABLE IF NOT EXISTS product_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt_text TEXT,
  position INT DEFAULT 0,           -- sort order
  is_primary BOOLEAN DEFAULT false,
  width INT,
  height INT,
  file_size_bytes INT,
  content_type TEXT DEFAULT 'image/webp',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);

-- 2.3 PRODUCT COLLECTIONS (like Shopify collections)
-- ============================================================
CREATE TABLE IF NOT EXISTS collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  image_url TEXT,
  
  -- Type: manual or automatic (rule-based)
  collection_type TEXT DEFAULT 'manual' CHECK (collection_type IN ('manual', 'automatic')),
  rules JSONB DEFAULT '[]',  -- for automatic: [{"field":"category","condition":"equals","value":"Nutrition"}]
  
  -- Display
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  display_on_homepage BOOLEAN DEFAULT false,
  
  -- SEO
  meta_title TEXT,
  meta_description TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS collection_products (
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position INT DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (collection_id, product_id)
);

-- Insert default collections
INSERT INTO collections (name, slug, description, display_on_homepage) VALUES
  ('Best Sellers', 'best-sellers', 'Our most popular products', true),
  ('New Arrivals', 'new-arrivals', 'Recently added products', true),
  ('On Sale', 'on-sale', 'Products with active discounts', true),
  ('Cycling Essentials', 'cycling-essentials', 'Must-have cycling gear', true),
  ('Race Day Nutrition', 'race-day-nutrition', 'Pre, during and post-race nutrition', false),
  ('Swimming Gear', 'swimming-gear', 'Open water and pool swimming equipment', false),
  ('Recovery & Wellness', 'recovery-wellness', 'Recovery products and supplements', false)
ON CONFLICT (slug) DO NOTHING;

-- 2.4 PRODUCT METAFIELDS (flexible custom data, Shopify-style)
-- ============================================================
CREATE TABLE IF NOT EXISTS product_metafields (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  namespace TEXT NOT NULL,     -- e.g. 'nutrition', 'shipping', 'custom'
  key TEXT NOT NULL,           -- e.g. 'serving_size', 'calories'
  value TEXT NOT NULL,
  value_type TEXT DEFAULT 'string' CHECK (value_type IN ('string', 'integer', 'decimal', 'boolean', 'json', 'date')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(product_id, namespace, key)
);

CREATE INDEX IF NOT EXISTS idx_metafields_product ON product_metafields(product_id);
CREATE INDEX IF NOT EXISTS idx_metafields_namespace ON product_metafields(namespace, key);
