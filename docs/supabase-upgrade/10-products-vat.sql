-- ============================================================
-- SFI SUPABASE UPGRADE - PART 10: PRODUCT VAT FROM QUICKBOOKS
-- Execute in Supabase SQL Editor
-- ============================================================

-- 10.1 ADD VAT COLUMNS TO PRODUCTS TABLE
-- ============================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_taxable BOOLEAN DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS vat_rate DECIMAL(5,2);               -- e.g. 23.00, 13.50, 0.00
ALTER TABLE products ADD COLUMN IF NOT EXISTS qb_sales_tax_code TEXT;              -- QB TaxCode name (e.g. 'Standard Rate', 'Reduced Rate', 'Zero Rated')
ALTER TABLE products ADD COLUMN IF NOT EXISTS qb_sales_tax_code_id TEXT;           -- QB TaxCode Id for reference

-- 10.2 INDEX FOR TAX QUERIES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_products_vat_rate ON products(vat_rate);
CREATE INDEX IF NOT EXISTS idx_products_is_taxable ON products(is_taxable);

-- 10.3 COMMENT FOR DOCUMENTATION
-- ============================================================
COMMENT ON COLUMN products.is_taxable IS 'Whether this product is subject to VAT (from QuickBooks SalesTaxCodeRef)';
COMMENT ON COLUMN products.vat_rate IS 'VAT percentage rate for this product (from QuickBooks TaxCode/TaxRate)';
COMMENT ON COLUMN products.qb_sales_tax_code IS 'QuickBooks Tax Code name (e.g. Standard Rate, Reduced Rate)';
COMMENT ON COLUMN products.qb_sales_tax_code_id IS 'QuickBooks Tax Code Id for sync reference';
