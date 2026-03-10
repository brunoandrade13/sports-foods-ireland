-- ============================================================
-- SFI SUPABASE UPGRADE - PART 8: TRIGGERS & FUNCTIONS
-- Execute in Supabase SQL Editor
-- ============================================================

-- 8.1 AUTO-UPDATE updated_at TIMESTAMP
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all relevant tables
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN 
    SELECT unnest(ARRAY[
      'products', 'customers', 'orders', 'addresses', 'collections',
      'coupons', 'gift_cards', 'wishlists', 'reviews', 'abandoned_carts',
      'shipping_rates', 'product_metafields'
    ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at ON %I; 
       CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I 
       FOR EACH ROW EXECUTE FUNCTION update_updated_at();', t, t
    );
  END LOOP;
END;
$$;

-- 8.2 AUTO-UPDATE PRODUCT STOCK ON ORDER
-- ============================================================
CREATE OR REPLACE FUNCTION update_stock_on_order()
RETURNS TRIGGER AS $$
BEGIN
  -- Only reduce stock when order is paid
  IF NEW.financial_status = 'paid' AND (OLD.financial_status IS NULL OR OLD.financial_status != 'paid') THEN
    UPDATE products p
    SET stock_quantity = GREATEST(0, p.stock_quantity - oi.quantity),
        in_stock = (p.stock_quantity - oi.quantity) > 0,
        total_sold = COALESCE(p.total_sold, 0) + oi.quantity,
        total_revenue_eur = COALESCE(p.total_revenue_eur, 0) + oi.total
    FROM order_items oi
    WHERE oi.order_id = NEW.id AND p.id = oi.product_id AND p.track_inventory = true;
    
    -- Log inventory movements
    INSERT INTO inventory_movements (product_id, variant_id, movement_type, quantity_change, quantity_before, quantity_after, order_id, performed_by)
    SELECT 
      oi.product_id,
      oi.variant_id,
      'sale',
      -oi.quantity,
      p.stock_quantity + oi.quantity,
      p.stock_quantity,
      NEW.id,
      'system'
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_stock_on_order ON orders;
CREATE TRIGGER trg_update_stock_on_order
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_stock_on_order();

-- 8.3 AUTO-UPDATE CUSTOMER STATS ON ORDER
-- ============================================================
CREATE OR REPLACE FUNCTION update_customer_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.financial_status = 'paid' AND NEW.customer_id IS NOT NULL THEN
    UPDATE customers cu SET
      total_orders = (SELECT COUNT(*) FROM orders WHERE customer_id = cu.id AND financial_status = 'paid'),
      total_spent_eur = (SELECT COALESCE(SUM(total), 0) FROM orders WHERE customer_id = cu.id AND financial_status = 'paid' AND currency = 'EUR'),
      total_spent_gbp = (SELECT COALESCE(SUM(total), 0) FROM orders WHERE customer_id = cu.id AND financial_status = 'paid' AND currency = 'GBP'),
      avg_order_value_eur = (SELECT COALESCE(AVG(total), 0) FROM orders WHERE customer_id = cu.id AND financial_status = 'paid' AND currency = 'EUR'),
      last_order_at = NOW()
    WHERE cu.id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_customer_stats ON orders;
CREATE TRIGGER trg_update_customer_stats
  AFTER INSERT OR UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_stats();

-- 8.4 AUTO-UPDATE PRODUCT RATING ON REVIEW
-- ============================================================
CREATE OR REPLACE FUNCTION update_product_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE products SET
    rating = (SELECT COALESCE(AVG(rating)::DECIMAL(2,1), 0) FROM reviews WHERE product_id = NEW.product_id AND review_status = 'approved'),
    review_count = (SELECT COUNT(*) FROM reviews WHERE product_id = NEW.product_id AND review_status = 'approved')
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_product_rating ON reviews;
CREATE TRIGGER trg_update_product_rating
  AFTER INSERT OR UPDATE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_product_rating();

-- 8.5 LOW STOCK NOTIFICATION
-- ============================================================
CREATE OR REPLACE FUNCTION notify_low_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stock_quantity <= NEW.low_stock_threshold AND NEW.stock_quantity > 0 
     AND (OLD.stock_quantity > OLD.low_stock_threshold OR OLD.stock_quantity IS NULL) THEN
    INSERT INTO admin_notifications (notification_type, title, message, related_type, related_id, priority)
    VALUES (
      'low_stock',
      'Low Stock Alert: ' || NEW.name,
      NEW.name || ' has only ' || NEW.stock_quantity || ' units left (threshold: ' || NEW.low_stock_threshold || ')',
      'product',
      NEW.id,
      'high'
    );
  END IF;
  
  IF NEW.stock_quantity = 0 AND OLD.stock_quantity > 0 THEN
    INSERT INTO admin_notifications (notification_type, title, message, related_type, related_id, priority)
    VALUES (
      'low_stock',
      'OUT OF STOCK: ' || NEW.name,
      NEW.name || ' is now out of stock!',
      'product',
      NEW.id,
      'urgent'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_low_stock ON products;
CREATE TRIGGER trg_notify_low_stock
  AFTER UPDATE OF stock_quantity ON products
  FOR EACH ROW
  EXECUTE FUNCTION notify_low_stock();

-- 8.6 NEW ORDER NOTIFICATION
-- ============================================================
CREATE OR REPLACE FUNCTION notify_new_order()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO admin_notifications (notification_type, title, message, related_type, related_id, priority)
  VALUES (
    'new_order',
    'New Order #' || NEW.order_number,
    'Order from ' || COALESCE(NEW.customer_name, NEW.customer_email, 'Unknown') || ' — €' || NEW.total,
    'order',
    NEW.id,
    'normal'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_new_order ON orders;
CREATE TRIGGER trg_notify_new_order
  AFTER INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION notify_new_order();

-- 8.7 COUPON USAGE COUNTER
-- ============================================================
CREATE OR REPLACE FUNCTION increment_coupon_usage()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE coupons SET times_used = times_used + 1 WHERE id = NEW.coupon_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_increment_coupon ON coupon_usage;
CREATE TRIGGER trg_increment_coupon
  AFTER INSERT ON coupon_usage
  FOR EACH ROW
  EXECUTE FUNCTION increment_coupon_usage();

-- 8.8 PRODUCT VIEW COUNTER (increment on product_events)
-- ============================================================
CREATE OR REPLACE FUNCTION increment_product_views()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.event_type = 'view' THEN
    UPDATE products SET view_count = COALESCE(view_count, 0) + 1 WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_increment_views ON product_events;
CREATE TRIGGER trg_increment_views
  AFTER INSERT ON product_events
  FOR EACH ROW
  EXECUTE FUNCTION increment_product_views();
