-- ============================================================
-- SFI SUPABASE UPGRADE - PART 1: CUSTOMERS & ADDRESSES
-- Execute in Supabase SQL Editor
-- Date: February 2026
-- ============================================================

-- 1.1 ENHANCE CUSTOMERS TABLE (add columns if missing)
-- ============================================================
ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS accepts_marketing BOOLEAN DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS marketing_opt_in_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_orders INT DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_spent_eur DECIMAL(10,2) DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_spent_gbp DECIMAL(10,2) DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS avg_order_value_eur DECIMAL(10,2) DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_order_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS currency_preference TEXT DEFAULT 'EUR' CHECK (currency_preference IN ('EUR', 'GBP'));
ALTER TABLE customers ADD COLUMN IF NOT EXISTS locale TEXT DEFAULT 'en';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'website';  -- website, import, manual, woocommerce
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tax_exempt BOOLEAN DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS verified_email BOOLEAN DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'active' CHECK (account_status IN ('active', 'disabled', 'invited', 'declined'));
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS woo_customer_id INT;

-- 1.2 ADDRESSES
-- ============================================================
CREATE TABLE IF NOT EXISTS addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Address type
  address_type TEXT DEFAULT 'shipping' CHECK (address_type IN ('shipping', 'billing', 'both')),
  is_default BOOLEAN DEFAULT false,
  
  -- Contact
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  phone TEXT,
  
  -- Address fields (Shopify compatible)
  address1 TEXT NOT NULL,
  address2 TEXT,
  city TEXT NOT NULL,
  county TEXT,           -- province/state
  eircode TEXT,          -- postal code (Irish term)
  country_code TEXT NOT NULL DEFAULT 'IE',
  country TEXT NOT NULL DEFAULT 'Ireland',
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_addresses_customer ON addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_addresses_default ON addresses(customer_id, is_default) WHERE is_default = true;

-- 1.3 CUSTOMER GROUPS / SEGMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  discount_percent DECIMAL(5,2) DEFAULT 0,
  is_automatic BOOLEAN DEFAULT false,  -- auto-assign based on rules
  rules JSONB DEFAULT '{}',            -- e.g. {"min_orders": 5, "min_spent": 200}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_group_members (
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES customer_groups(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (customer_id, group_id)
);

-- Insert default groups
INSERT INTO customer_groups (name, description, discount_percent) VALUES
  ('Regular', 'Standard customers', 0),
  ('VIP', 'High-value customers (5+ orders or €500+ spent)', 5),
  ('Wholesale', 'Wholesale/B2B customers', 15),
  ('Staff', 'Internal staff discount', 20)
ON CONFLICT (name) DO NOTHING;
