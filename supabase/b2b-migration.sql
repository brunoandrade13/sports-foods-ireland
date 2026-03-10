-- ============================================================
-- SFI B2B Migration Script
-- Run in Supabase SQL Editor
-- ============================================================

-- A) Add B2B fields to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_b2b BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS b2b_status TEXT DEFAULT NULL
  CHECK (b2b_status IN ('pending', 'approved', 'rejected'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS b2b_company_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS b2b_vat_number TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS b2b_website TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS b2b_business_type TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS b2b_expected_volume TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS b2b_applied_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS b2b_approved_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS b2b_notes TEXT;

-- B) Create B2B prices table
CREATE TABLE IF NOT EXISTS b2b_prices (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(legacy_id),
  price_eur DECIMAL(10,2) NOT NULL,
  price_gbp DECIMAL(10,2),
  min_quantity INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- C) RLS Policies — only approved B2B users can see B2B prices
ALTER TABLE b2b_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "b2b_prices_approved_only" ON b2b_prices
  FOR SELECT USING (
    auth.uid() IN (
      SELECT user_id FROM profiles
      WHERE is_b2b = TRUE AND b2b_status = 'approved'
    )
  );

-- D) Allow service_role full access to b2b_prices (for admin)
CREATE POLICY "b2b_prices_service_role" ON b2b_prices
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- E) Index for performance
CREATE INDEX IF NOT EXISTS idx_profiles_b2b_status ON profiles(b2b_status) WHERE b2b_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_b2b_prices_product ON b2b_prices(product_id);
