-- ============================================================
-- SFI SUPABASE UPGRADE - PART 3: ORDERS & FINANCIAL
-- Execute in Supabase SQL Editor
-- ============================================================

-- 3.1 ENHANCE ORDERS TABLE
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number SERIAL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EUR' CHECK (currency IN ('EUR', 'GBP'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal DECIMAL(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_total DECIMAL(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_total DECIMAL(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_total DECIMAL(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total DECIMAL(10,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS financial_status TEXT DEFAULT 'pending' 
  CHECK (financial_status IN ('pending', 'authorized', 'paid', 'partially_paid', 'partially_refunded', 'refunded', 'voided'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_status TEXT DEFAULT 'unfulfilled'
  CHECK (fulfillment_status IN ('unfulfilled', 'partial', 'fulfilled', 'restocked'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Customer info snapshot (in case customer is deleted)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS billing_address JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_email TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT;

-- Payment
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_charge_id TEXT;

-- Shipping
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_method TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_delivery_date DATE;

-- Discounts
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_id UUID;

-- Metadata
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;            -- internal notes
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_notes TEXT;   -- customer order notes
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'web' CHECK (source IN ('web', 'admin', 'api', 'pos'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ip_address INET;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Weight for shipping calculation
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_weight_grams INT DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS item_count INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_orders_financial_status ON orders(financial_status);
CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_status ON orders(fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);

-- 3.2 ENHANCE ORDER_ITEMS
-- ============================================================
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_label TEXT;    -- snapshot: "Large / Red"
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10,2) DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS total DECIMAL(10,2) DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10,2);        -- for profit calculation
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_name TEXT;                -- snapshot
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_image_url TEXT;           -- snapshot
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS requires_shipping BOOLEAN DEFAULT true;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS weight_grams INT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS fulfillment_status TEXT DEFAULT 'unfulfilled';

-- 3.3 ORDER FULFILLMENTS (shipments)
-- ============================================================
CREATE TABLE IF NOT EXISTS order_fulfillments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  
  fulfillment_status TEXT DEFAULT 'pending' CHECK (fulfillment_status IN ('pending', 'open', 'success', 'cancelled', 'error', 'failure')),
  tracking_company TEXT,       -- 'An Post', 'DPD', 'DHL', 'Royal Mail'
  tracking_number TEXT,
  tracking_url TEXT,
  
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fulfillment_items (
  fulfillment_id UUID NOT NULL REFERENCES order_fulfillments(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 1,
  PRIMARY KEY (fulfillment_id, order_item_id)
);

-- 3.4 REFUNDS
-- ============================================================
CREATE TABLE IF NOT EXISTS order_refunds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  reason TEXT,
  note TEXT,
  
  -- Stripe
  stripe_refund_id TEXT,
  
  -- Status
  refund_status TEXT DEFAULT 'pending' CHECK (refund_status IN ('pending', 'processed', 'failed', 'cancelled')),
  
  refunded_by TEXT,    -- admin email
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refund_items (
  refund_id UUID NOT NULL REFERENCES order_refunds(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 1,
  amount DECIMAL(10,2) NOT NULL,
  restock BOOLEAN DEFAULT true,
  PRIMARY KEY (refund_id, order_item_id)
);

-- 3.5 PAYMENT TRANSACTIONS (full payment history, Shopify-style)
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('authorization', 'capture', 'sale', 'void', 'refund')),
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  
  -- Stripe details
  stripe_payment_intent_id TEXT,
  stripe_charge_id TEXT,
  stripe_refund_id TEXT,
  
  -- Status
  transaction_status TEXT DEFAULT 'pending' CHECK (transaction_status IN ('pending', 'success', 'failure', 'error')),
  error_code TEXT,
  error_message TEXT,
  
  -- Card details (masked)
  card_brand TEXT,       -- 'visa', 'mastercard'
  card_last4 TEXT,
  
  gateway TEXT DEFAULT 'stripe',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_order ON payment_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_stripe ON payment_transactions(stripe_payment_intent_id);

-- 3.6 INVOICES
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL UNIQUE,
  
  subtotal DECIMAL(10,2) NOT NULL,
  tax_total DECIMAL(10,2) DEFAULT 0,
  shipping_total DECIMAL(10,2) DEFAULT 0,
  discount_total DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  
  -- Status
  invoice_status TEXT DEFAULT 'draft' CHECK (invoice_status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  
  due_date DATE,
  paid_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  
  -- PDF
  pdf_url TEXT,
  
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Invoice number sequence
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1001;
