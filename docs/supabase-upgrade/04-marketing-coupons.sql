-- ============================================================
-- SFI SUPABASE UPGRADE - PART 4: MARKETING & COUPONS
-- Execute in Supabase SQL Editor
-- ============================================================

-- 4.1 COUPONS / DISCOUNT CODES
-- ============================================================
CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  
  -- Discount type
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount', 'free_shipping', 'buy_x_get_y')),
  discount_value DECIMAL(10,2) NOT NULL,     -- percentage or fixed amount
  currency TEXT DEFAULT 'EUR',
  
  -- Limits
  minimum_order_amount DECIMAL(10,2) DEFAULT 0,
  maximum_discount_amount DECIMAL(10,2),      -- cap for percentage discounts
  usage_limit INT,                             -- total uses allowed
  usage_limit_per_customer INT DEFAULT 1,
  times_used INT DEFAULT 0,
  
  -- Applicability
  applies_to TEXT DEFAULT 'all' CHECK (applies_to IN ('all', 'specific_products', 'specific_collections', 'specific_categories')),
  applicable_ids UUID[] DEFAULT '{}',          -- product/collection/category IDs
  excluded_product_ids UUID[] DEFAULT '{}',
  
  -- Customer restrictions
  customer_group_id UUID REFERENCES customer_groups(id),
  first_order_only BOOLEAN DEFAULT false,
  
  -- Validity
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  
  -- Metadata
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(is_active, starts_at, expires_at);

-- Track coupon usage
CREATE TABLE IF NOT EXISTS coupon_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  discount_amount DECIMAL(10,2) NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4.2 GIFT CARDS
-- ============================================================
CREATE TABLE IF NOT EXISTS gift_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  initial_value DECIMAL(10,2) NOT NULL,
  balance DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  
  -- Source
  issued_to_customer_id UUID REFERENCES customers(id),
  issued_to_email TEXT,
  sender_name TEXT,
  recipient_name TEXT,
  message TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gift_card_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gift_card_id UUID NOT NULL REFERENCES gift_cards(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id),
  amount DECIMAL(10,2) NOT NULL,   -- negative for charges, positive for refunds
  balance_after DECIMAL(10,2) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4.3 ABANDONED CARTS
-- ============================================================
CREATE TABLE IF NOT EXISTS abandoned_carts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  session_id TEXT,
  email TEXT,
  
  -- Cart content
  items JSONB NOT NULL DEFAULT '[]',    -- [{product_id, variant_id, name, quantity, price, image_url}]
  subtotal DECIMAL(10,2) DEFAULT 0,
  currency TEXT DEFAULT 'EUR',
  item_count INT DEFAULT 0,
  
  -- Recovery
  recovery_status TEXT DEFAULT 'abandoned' CHECK (recovery_status IN ('abandoned', 'email_sent', 'recovered', 'expired')),
  recovery_email_sent_at TIMESTAMPTZ,
  recovered_order_id UUID REFERENCES orders(id),
  
  -- Metadata
  abandoned_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_status ON abandoned_carts(recovery_status);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_email ON abandoned_carts(email);

-- 4.4 EMAIL MARKETING LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS email_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Recipient
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  
  -- Email details
  email_type TEXT NOT NULL,  -- 'order_confirmation', 'shipping_notification', 'abandoned_cart', 'marketing', 'welcome', 'password_reset'
  subject TEXT NOT NULL,
  template_id TEXT,
  
  -- Related entities
  order_id UUID REFERENCES orders(id),
  
  -- Status
  email_status TEXT DEFAULT 'sent' CHECK (email_status IN ('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
  
  -- Resend integration
  resend_message_id TEXT,
  
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_log_customer ON email_log(customer_id);
CREATE INDEX IF NOT EXISTS idx_email_log_type ON email_log(email_type);
