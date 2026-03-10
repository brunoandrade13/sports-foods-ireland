-- ============================================
-- PURCHASE ORDERS SYSTEM - SFI Admin
-- ============================================

-- 1. SUPPLIERS
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  address TEXT,
  city TEXT,
  country TEXT DEFAULT 'Ireland',
  payment_terms TEXT DEFAULT 'Net 30',
  currency TEXT DEFAULT 'EUR',
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. PURCHASE ORDERS
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT UNIQUE NOT NULL,
  supplier_id UUID REFERENCES suppliers(id),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','pending','ordered','partial','received','cancelled','closed')),
  order_date DATE,
  expected_date DATE,
  received_date DATE,
  currency TEXT DEFAULT 'EUR',
  subtotal NUMERIC(10,2) DEFAULT 0,
  tax_rate NUMERIC(5,2) DEFAULT 0,
  tax_amount NUMERIC(10,2) DEFAULT 0,
  shipping_cost NUMERIC(10,2) DEFAULT 0,
  discount_amount NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) DEFAULT 0,
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','partial','paid')),
  payment_method TEXT,
  payment_date DATE,
  shipping_method TEXT,
  tracking_number TEXT,
  destination TEXT DEFAULT 'Main Warehouse',
  notes TEXT,
  internal_notes TEXT,
  tags TEXT[],
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. PURCHASE ORDER ITEMS
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  variant_id UUID REFERENCES product_variants(id),
  sku TEXT,
  product_name TEXT NOT NULL,
  variant_label TEXT,
  quantity_ordered INT NOT NULL DEFAULT 0,
  quantity_received INT DEFAULT 0,
  unit_cost NUMERIC(10,2) DEFAULT 0,
  total_cost NUMERIC(10,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. PO ACTIVITY LOG
CREATE TABLE IF NOT EXISTS purchase_order_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. AUTO PO NUMBER SEQUENCE
CREATE SEQUENCE IF NOT EXISTS po_number_seq START 1001;

CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.po_number IS NULL OR NEW.po_number = '' THEN
    NEW.po_number := 'PO-' || LPAD(nextval('po_number_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_po_number ON purchase_orders;
CREATE TRIGGER trg_po_number BEFORE INSERT ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION generate_po_number();

-- 6. AUTO UPDATED_AT
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_suppliers_updated ON suppliers;
CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_po_updated ON purchase_orders;
CREATE TRIGGER trg_po_updated BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 7. INDEXES
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_poi_po ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_poi_product ON purchase_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_pol_po ON purchase_order_logs(purchase_order_id);

-- 8. RLS
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for service role" ON suppliers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON purchase_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON purchase_order_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON purchase_order_logs FOR ALL USING (true) WITH CHECK (true);
