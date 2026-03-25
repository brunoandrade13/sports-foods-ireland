/**
 * SFI Attribution Tracking
 * Captures visitor source/origin for order attribution.
 * Replicates WooCommerce Order Attribution functionality.
 * Include on ALL pages before checkout scripts.
 */
(function() {
  'use strict';
  const KEY = 'sfi_attribution';

  function getSourceFromReferrer(ref) {
    if (!ref) return { type: 'typein', source: '(direct)' };
    try {
      const url = new URL(ref);
      const host = url.hostname.toLowerCase();

      // Search engines → organic
      const searchEngines = {
        'google': /google\./i,
        'bing': /bing\.com/i,
        'duckduckgo': /duckduckgo\.com/i,
        'yahoo': /yahoo\./i,
        'ecosia': /ecosia\.org/i,
        'baidu': /baidu\.com/i,
        'yandex': /yandex\./i
      };
      for (const [name, pattern] of Object.entries(searchEngines)) {
        if (pattern.test(host)) return { type: 'organic', source: name };
      }

      // AI assistants → utm
      const aiSources = ['chatgpt.com', 'chat.openai.com', 'gemini.google.com', 'perplexity.ai', 'claude.ai', 'copilot.microsoft.com'];
      if (aiSources.some(d => host.includes(d))) return { type: 'utm', source: host };

      // Own domain → ignore (not a new source)
      if (host.includes('sportsfoodsireland.ie')) return null;

      // Everything else → referral
      return { type: 'referral', source: host };
    } catch(e) {
      return { type: 'typein', source: '(direct)' };
    }
  }

  function getDeviceType() {
    const ua = navigator.userAgent;
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return 'Mobile';
    return 'Desktop';
  }

  function getUTMParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get('utm_source') || null,
      utm_medium: params.get('utm_medium') || null,
      utm_campaign: params.get('utm_campaign') || null
    };
  }

  function initAttribution() {
    // Check if we already have a session attribution
    let existing = null;
    try { existing = JSON.parse(sessionStorage.getItem(KEY)); } catch(e) {}

    // If existing session, just increment page count
    if (existing && existing.source_type) {
      existing.session_pages = (existing.session_pages || 0) + 1;
      sessionStorage.setItem(KEY, JSON.stringify(existing));
      return;
    }

    // New session — determine source
    const utms = getUTMParams();
    let sourceType, utmSource;

    if (utms.utm_source) {
      // Explicit UTM parameters take priority
      sourceType = 'utm';
      utmSource = utms.utm_source;
    } else {
      const detected = getSourceFromReferrer(document.referrer);
      if (detected) {
        sourceType = detected.type;
        utmSource = detected.source;
      } else {
        // Referrer is own site, no UTMs — likely internal nav, don't overwrite
        return;
      }
    }

    const data = {
      source_type: sourceType,
      utm_source: utmSource,
      utm_medium: utms.utm_medium || null,
      utm_campaign: utms.utm_campaign || null,
      device_type: getDeviceType(),
      session_entry: window.location.href,
      session_start: new Date().toISOString(),
      session_pages: 1,
      user_agent: navigator.userAgent
    };

    sessionStorage.setItem(KEY, JSON.stringify(data));
  }

  /**
   * Public API: get attribution data for order creation
   * Call this at checkout to attach to the order.
   * Returns object with attribution fields or empty object.
   */
  window.sfiGetAttribution = function() {
    try {
      const data = JSON.parse(sessionStorage.getItem(KEY));
      if (!data || !data.source_type) return {};
      return {
        attribution_source_type: data.source_type,
        attribution_utm_source: data.utm_source,
        attribution_utm_medium: data.utm_medium || null,
        attribution_utm_campaign: data.utm_campaign || null,
        attribution_device_type: data.device_type,
        attribution_session_entry: data.session_entry,
        attribution_session_pages: data.session_pages
      };
    } catch(e) {
      return {};
    }
  };

  // Initialize on page load
  initAttribution();
})();
