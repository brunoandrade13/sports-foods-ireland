// ============================================================
// SFI Analytics Tracker v1.0
// Tracks: page views, product events, funnel steps
// ============================================================
(function() {
  'use strict';

  const SUPA_URL = 'https://styynhgzrkyoioqjssuw.supabase.co';
  const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0eXluaGd6cmt5b2lvcWpzc3V3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzc3NjIwMDAsImV4cCI6MjA1MzMzODAwMH0.xM1m1HRt6RBlGOJFBFBk_5P_oHgbkBIjBTl8GUemREA';

  // ---- Session Management ----
  function getSessionId() {
    let sid = sessionStorage.getItem('sfi_sid');
    if (!sid) {
      sid = 'ses_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem('sfi_sid', sid);
    }
    return sid;
  }

  function getVisitorId() {
    let vid = localStorage.getItem('sfi_vid');
    if (!vid) {
      vid = 'vis_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('sfi_vid', vid);
    }
    return vid;
  }

  function isFirstVisit() {
    const key = 'sfi_first_visit_done';
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, '1');
      return true;
    }
    return false;
  }

  function getVisitCount() {
    let c = parseInt(localStorage.getItem('sfi_visit_count') || '0');
    return c;
  }

  function incrementVisitCount() {
    let c = getVisitCount() + 1;
    localStorage.setItem('sfi_visit_count', String(c));
    return c;
  }

  // ---- Device Detection ----
  function getDeviceType() {
    const w = window.innerWidth;
    if (w < 768) return 'mobile';
    if (w < 1024) return 'tablet';
    return 'desktop';
  }

  function getBrowser() {
    const ua = navigator.userAgent;
    if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('Edg')) return 'Edge';
    return 'Other';
  }

  function getOS() {
    const ua = navigator.userAgent;
    if (ua.includes('Win')) return 'Windows';
    if (ua.includes('Mac')) return 'macOS';
    if (ua.includes('Linux') && !ua.includes('Android')) return 'Linux';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
    return 'Other';
  }

  // ---- Page Type Detection ----
  function detectPageType() {
    const path = window.location.pathname.toLowerCase();
    const page = path.split('/').pop() || 'index.html';
    if (page === '' || page === 'index.html') return 'home';
    if (page === 'shop.html') return 'shop';
    if (page === 'produto.html' || page === 'product.html') return 'product';
    if (page === 'cart.html') return 'cart';
    if (page === 'checkout.html') return 'checkout';
    if (page === 'about.html') return 'about';
    if (page === 'contact.html') return 'contact';
    if (page === 'faq.html') return 'faq';
    if (page.includes('blog')) return 'blog';
    if (page === 'offers.html') return 'offers';
    if (page === 'b2b.html' || page === 'wholesale.html') return 'b2b';
    return page.replace('.html', '');
  }

  function getProductIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id') || params.get('product_id') || null;
  }

  function getCategoryFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('category') || params.get('cat') || null;
  }

  // ---- UTM Parameters ----
  function getUTM() {
    const p = new URLSearchParams(window.location.search);
    return {
      utm_source: p.get('utm_source') || null,
      utm_medium: p.get('utm_medium') || null,
      utm_campaign: p.get('utm_campaign') || null,
      utm_content: p.get('utm_content') || null
    };
  }


  // ---- API Send ----
  function sendToSupa(table, data) {
    fetch(SUPA_URL + '/rest/v1/' + table, {
      method: 'POST',
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': 'Bearer ' + SUPA_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(data),
      keepalive: true
    }).catch(function(){});
  }

  // ---- Scroll Depth Tracking ----
  let maxScroll = 0;
  function trackScroll() {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const docHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const winHeight = window.innerHeight;
    const pct = Math.round((scrollTop / (docHeight - winHeight)) * 100);
    if (pct > maxScroll) maxScroll = Math.min(pct, 100);
  }
  window.addEventListener('scroll', trackScroll, { passive: true });

  // ---- Time on Page ----
  const pageStartTime = Date.now();

  // ---- Track Page View (on unload to capture time + scroll) ----
  function sendPageView() {
    const timeOnPage = Math.round((Date.now() - pageStartTime) / 1000);
    const utm = getUTM();
    const data = {
      session_id: getSessionId(),
      page_url: window.location.pathname + window.location.search,
      page_type: detectPageType(),
      product_id: getProductIdFromUrl(),
      referrer: document.referrer || null,
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
      utm_content: utm.utm_content,
      device_type: getDeviceType(),
      browser: getBrowser(),
      os: getOS(),
      screen_width: window.innerWidth,
      time_on_page_seconds: timeOnPage,
      scroll_depth_percent: maxScroll,
      country: null, city: null
    };
    sendToSupa('page_views', data);
  }


  // ---- Product Event Tracking ----
  window.sfiTrackProduct = function(eventType, productId, extra) {
    const data = {
      session_id: getSessionId(),
      product_id: productId || null,
      event_type: eventType,
      source_page: detectPageType(),
      source_component: (extra && extra.component) || null,
      search_query: (extra && extra.search_query) || null,
      position: (extra && extra.position) || null,
      metadata: extra ? JSON.stringify(extra) : null
    };
    sendToSupa('product_events', data);
  };

  // ---- Funnel Event Tracking ----
  window.sfiTrackFunnel = function(step, extra) {
    const data = {
      session_id: getSessionId(),
      step: step,
      cart_value: (extra && extra.cart_value) || null,
      item_count: (extra && extra.item_count) || null,
      metadata: extra ? JSON.stringify(extra) : null
    };
    sendToSupa('funnel_events', data);
  };

  // ---- Initialize ----
  incrementVisitCount();

  // Send page view on unload (captures final time + scroll)
  window.addEventListener('beforeunload', sendPageView);

  // Also send after 30s in case user stays long (backup)
  setTimeout(function() { sendPageView(); }, 30000);

  // Track initial page load as funnel step
  const pt = detectPageType();
  if (pt === 'product') {
    const pid = getProductIdFromUrl();
    if (pid) window.sfiTrackProduct('view', pid, { component: 'page_load' });
  }
  if (pt === 'cart') window.sfiTrackFunnel('view_cart');
  if (pt === 'checkout') window.sfiTrackFunnel('begin_checkout');

  // Expose for external use
  window.sfiAnalytics = {
    trackProduct: window.sfiTrackProduct,
    trackFunnel: window.sfiTrackFunnel,
    getSessionId: getSessionId,
    getVisitorId: getVisitorId,
    isFirstVisit: isFirstVisit,
    getVisitCount: getVisitCount
  };

})();
