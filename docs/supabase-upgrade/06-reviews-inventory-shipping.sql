-- ============================================================
-- SFI SUPABASE UPGRADE - PART 6: REVIEWS, INVENTORY, SHIPPING
-- Execute in Supabase SQL Editor
-- ============================================================

-- 6.1 PRODUCT REVIEWS
-- ============================================================
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  
  -- Review content
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  body TEXT,
  
  -- Reviewer info (if no customer account)
  reviewer_name TEXT,
  reviewer_email TEXT,
  
  -- Media
  images JSONB DEFAULT '[]',     -- [{url, alt_text}]
  
  -- Moderation
  review_status TEXT DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected', 'spam')),
  moderated_by TEXT,
  moderated_at TIMESTAMPTZ,
  
  -- Admin response
  admin_reply TEXT,
  admin_reply_at TIMESTAMPTZ,
  
  -- Helpfulness
  helpful_votes INT DEFAULT 0,
  not_helpful_votes INT DEFAULT 0,
  
  -- Verification
  verified_purchase BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(review_status);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(product_id, rating);

-- 6.2 INVENTORY MOVEMENTS (stock history log)
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  
  -- Movement details
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'sale', 'return', 'restock', 'adjustment', 'damage', 'transfer', 'initial'
  )),
  quantity_change INT NOT NULL,      -- positive = stock in, negative = stock out
  quantity_before INT NOT NULL,
  quantity_after INT NOT NULL,
  
  -- Reference
  order_id UUID REFERENCES orders(id),
  refund_id UUID,
  
  -- Metadata
  reason TEXT,
  performed_by TEXT,     -- admin email or 'system'
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_type ON inventory_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_inventory_created ON inventory_movements(created_at DESC);

-- 6.3 SHIPPING ZONES & RATES
-- ============================================================
CREATE TABLE IF NOT EXISTS shipping_zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,                          -- 'Ireland', 'UK', 'EU', 'Rest of World'
  countries TEXT[] NOT NULL,                   -- ['IE'], ['GB'], ['DE','FR','ES'...]
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipping_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shipping_zone_id UUID NOT NULL REFERENCES shipping_zones(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                          -- 'Standard', 'Express', 'Free over €50'
  
  -- Rate calculation
  rate_type TEXT DEFAULT 'flat' CHECK (rate_type IN ('flat', 'weight_based', 'price_based', 'free')),
  price_eur DECIMAL(10,2) DEFAULT 0,
  price_gbp DECIMAL(10,2) DEFAULT 0,
  
  -- Conditions
  min_order_amount DECIMAL(10,2),              -- free shipping threshold
  max_order_amount DECIMAL(10,2),
  min_weight_grams INT,
  max_weight_grams INT,
  
  -- Delivery time
  estimated_days_min INT,
  estimated_days_max INT,
  
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default shipping zones for Ireland/UK
INSERT INTO shipping_zones (name, countries) VALUES
  ('Ireland', ARRAY['IE']),
  ('Northern Ireland', ARRAY['GB-NIR']),
  ('United Kingdom', ARRAY['GB']),
  ('EU', ARRAY['DE','FR','ES','IT','NL','BE','AT','PT','PL','SE','DK','FI','CZ','GR','HU','RO','BG','HR','SK','SI','LT','LV','EE','CY','LU','MT'])
ON CONFLICT DO NOTHING;

-- 6.4 TAX RATES
-- ============================================================
CREATE TABLE IF NOT EXISTS tax_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,                          -- 'Ireland VAT', 'UK VAT', 'EU Standard'
  country_code TEXT NOT NULL,
  rate_percent DECIMAL(5,2) NOT NULL,          -- 23.0 for Ireland
  
  -- Apply to
  applies_to TEXT DEFAULT 'all' CHECK (applies_to IN ('all', 'shipping', 'products')),
  product_types TEXT[],                        -- optional filter by product type
  
  is_active BOOLEAN DEFAULT true,
  priority INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default tax rates
INSERT INTO tax_rates (name, country_code, rate_percent) VALUES
  ('Ireland Standard VAT', 'IE', 23.00),
  ('Ireland Reduced VAT (Food)', 'IE', 13.50),
  ('UK Standard VAT', 'GB', 20.00)
ON CONFLICT DO NOTHING;
