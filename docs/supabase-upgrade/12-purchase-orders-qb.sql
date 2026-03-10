-- ============================================================
-- Purchase Orders: colunas para sync QuickBooks → Supabase
-- Executar no SQL Editor do Supabase (uma vez) antes do sync
-- ============================================================

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS qb_id TEXT UNIQUE;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS vendor_qb_id TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS private_note TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS qb_created TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS qb_updated TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_po_qb_id ON purchase_orders(qb_id);
CREATE INDEX IF NOT EXISTS idx_po_vendor ON purchase_orders(vendor_qb_id);
