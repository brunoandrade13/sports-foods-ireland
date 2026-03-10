-- ============================================================
-- SFI SUPABASE UPGRADE - PART 5: ANALYTICS & USER TRACKING
-- Execute in Supabase SQL Editor
-- ============================================================

-- 5.1 PAGE VIEWS
-- ============================================================
CREATE TABLE IF NOT EXISTS page_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Who
  session_id TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  
  -- What page
  page_url TEXT NOT NULL,
  page_type TEXT,              -- 'home', 'shop', 'product', 'cart', 'checkout', 'blog', 'about', 'faq'
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  
  -- Referrer
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  
  -- Device
  device_type TEXT,            -- 'desktop', 'mobile', 'tablet'
  browser TEXT,
  os TEXT,
  screen_width INT,
  
  -- Engagement
  time_on_page_seconds INT,
  scroll_depth_percent INT,    -- how far they scrolled (0-100)
  
  -- Geo
  country TEXT,
  city TEXT,
  
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_views_session ON page_views(session_id);
CREATE INDEX IF NOT EXISTS idx_page_views_product ON page_views(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_page_views_created ON page_views(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_page_type ON page_views(page_type);

-- 5.2 PRODUCT CLICKS / INTERACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS product_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  session_id TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  
  -- Event type
  event_type TEXT NOT NULL,    
  -- Types: 'view', 'click', 'quick_view', 'add_to_cart', 'remove_from_cart', 
  --        'add_to_wishlist', 'remove_from_wishlist', 'share', 'review_written',
  --        'image_zoom', 'variant_selected', 'size_guide_opened', 'compare'
  
  -- Context
  source_page TEXT,            -- where the click happened: 'home', 'shop', 'search', 'collection', 'related'
  source_component TEXT,       -- 'carousel_bestsellers', 'product_grid', 'search_results', 'recently_viewed'
  search_query TEXT,           -- if from search
  position INT,                -- position in list/carousel when clicked
  
  -- Extra data
  metadata JSONB DEFAULT '{}', -- flexible: {variant_label: "Large", color: "Red", quantity: 2}
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_events_product ON product_events(product_id);
CREATE INDEX IF NOT EXISTS idx_product_events_type ON product_events(event_type);
CREATE INDEX IF NOT EXISTS idx_product_events_session ON product_events(session_id);
CREATE INDEX IF NOT EXISTS idx_product_events_created ON product_events(created_at DESC);

-- 5.3 SEARCH QUERIES (what people search for)
-- ============================================================
CREATE TABLE IF NOT EXISTS search_queries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  
  query TEXT NOT NULL,
  results_count INT DEFAULT 0,
  
  -- Did they click on a result?
  clicked_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  clicked_position INT,
  
  -- Filters applied
  filters_applied JSONB DEFAULT '{}',  -- {category: "Nutrition", brand: "SiS", price_min: 10}
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_queries_query ON search_queries(query);
CREATE INDEX IF NOT EXISTS idx_search_queries_created ON search_queries(created_at DESC);

-- 5.4 WISHLISTS / SAVED LISTS
-- ============================================================
CREATE TABLE IF NOT EXISTS wishlists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  session_id TEXT,                    -- for anonymous wishlists
  name TEXT DEFAULT 'My Wishlist',
  is_public BOOLEAN DEFAULT false,    -- shareable link
  share_token TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wishlist_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wishlist_id UUID NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  
  -- Price when added (to show price changes)
  price_when_added DECIMAL(10,2),
  
  notes TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(wishlist_id, product_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_wishlist_items_product ON wishlist_items(product_id);

-- 5.5 RECENTLY VIEWED (per session/customer)
-- ============================================================
CREATE TABLE IF NOT EXISTS recently_viewed (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  view_count INT DEFAULT 1,
  
  UNIQUE(session_id, product_id)
);

-- 5.6 CART EVENTS (server-side cart + tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS cart_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  quantity INT NOT NULL DEFAULT 1,
  
  -- Price snapshot
  unit_price DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  
  added_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cart_items_session ON cart_items(session_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_customer ON cart_items(customer_id) WHERE customer_id IS NOT NULL;

-- 5.7 CONVERSION FUNNEL EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS funnel_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  
  -- Funnel step
  step TEXT NOT NULL,
  -- Steps: 'page_view', 'product_view', 'add_to_cart', 'begin_checkout', 
  --        'add_shipping_info', 'add_payment_info', 'purchase'
  
  -- Related data
  order_id UUID REFERENCES orders(id),
  cart_value DECIMAL(10,2),
  item_count INT,
  
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_funnel_session ON funnel_events(session_id);
CREATE INDEX IF NOT EXISTS idx_funnel_step ON funnel_events(step);
CREATE INDEX IF NOT EXISTS idx_funnel_created ON funnel_events(created_at DESC);

-- 5.8 SITE NOTIFICATIONS / ALERTS
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  notification_type TEXT NOT NULL,  -- 'new_order', 'low_stock', 'abandoned_cart', 'new_review', 'refund_request'
  title TEXT NOT NULL,
  message TEXT,
  
  -- Related entity
  related_type TEXT,    -- 'order', 'product', 'customer', 'review'
  related_id UUID,
  
  -- Status
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_unread ON admin_notifications(is_read) WHERE is_read = false;
