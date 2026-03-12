/**
 * SFI Data Loader — Supabase Bridge
 * 
 * Replaces dados.json + dados-embed.js with Supabase REST API.
 * Populates the same globals (PRODUTOS, EMBEDDED_PRODUCTS, allProducts)
 * so existing JS code works without modification.
 * 
 * Load this BEFORE main.js, shop.js, product.js, etc.
 * <script src="js/sfi-data-loader.js"></script>
 */

(function() {
  'use strict';

  // ============================================================
  // CONFIG — Update these with your Supabase project values
  // ============================================================
  const SUPABASE_URL = 'https://styynhgzrkyoioqjssuw.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_tiF58FbBT9UsaEMAaJlqWA_k3dLHElH';

  // Currency detection
  function detectCurrency() {
    try {
      const stored = localStorage.getItem('sfi_currency');
      if (stored) return stored;
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && tz.includes('London')) return 'GBP';
      if ((navigator.language || '').startsWith('en-GB')) return 'GBP';
    } catch(e) {}
    return 'EUR';
  }

  const CURRENCY = detectCurrency();
  const PRICE_FIELD = CURRENCY === 'GBP' ? 'price_gbp' : 'price_eur';
  const COMPARE_FIELD = CURRENCY === 'GBP' ? 'compare_at_price_gbp' : 'compare_at_price_eur';

  // ============================================================
  // FETCH ALL PRODUCTS FROM SUPABASE
  // ============================================================
  async function fetchFromSupabase() {
    const select = encodeURIComponent('*,brands(name,slug),categories(name,slug),subcategories(name,slug),sub_subcategories(name,slug),product_images(id,url,alt_text,position,is_primary),product_variants(id,variant_type_id,label,price,compare_at_price,sku,stock,is_default,is_active,sort_order,parent_variant_id,variant_types(name,slug))');
    const url = `${SUPABASE_URL}/rest/v1/products?select=${select}&is_active=eq.true&order=legacy_id.asc&limit=500`;

    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    if (!res.ok) throw new Error(`Supabase ${res.status}: ${res.statusText}`);
    return res.json();
  }

  // ============================================================
  // FETCH REVIEW AGGREGATES (rating + count per product) for cards
  // ============================================================
  async function fetchReviewsAggregates() {
    const url = `${SUPABASE_URL}/rest/v1/reviews?review_status=eq.approved&select=product_id,rating&limit=2000`;
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    });
    if (!res.ok) return {};
    const rows = await res.json();
    const byProduct = {};
    rows.forEach(function (r) {
      const id = r.product_id;
      if (!id) return;
      if (!byProduct[id]) byProduct[id] = { count: 0, sumRating: 0 };
      byProduct[id].count += 1;
      byProduct[id].sumRating += Number(r.rating) || 0;
    });
    return byProduct;
  }

  // ============================================================
  // HELPER: Group variants by type
  // ============================================================
  function buildVariants(variants) {
    if (!variants || variants.length === 0) return [];
    const active = variants.filter(v => v.is_active !== false);
    if (active.length === 0) return [];

    // Detect compound/nested variants (parent_variant_id)
    const children = active.filter(v => v.parent_variant_id);
    const parents = active.filter(v => !v.parent_variant_id);

    if (children.length > 0) {
      // ── Compound variants: parent (Flavor) → children (Pack sizes) ──
      // Build a map of parent id → parent variant
      const parentMap = {};
      parents.forEach(p => { parentMap[p.id] = p; });

      // Group children by parent, generate compound labels
      const compoundOptions = [];
      children.forEach(child => {
        const parent = parentMap[child.parent_variant_id];
        if (!parent) return; // orphan child, skip
        const parentLabel = parent.label || 'Unknown';
        const childLabel = child.label || 'Unknown';
        compoundOptions.push({
          id: child.id,
          label: parentLabel + ' / ' + childLabel,
          price: child.price || parent.price,
          compare_at_price: child.compare_at_price || parent.compare_at_price,
          sku: child.sku || parent.sku,
          stock: child.stock,
          is_default: child.is_default || parent.is_default,
          sort_order: (parent.sort_order || 0) * 100 + (child.sort_order || 0)
        });
      });

      // Also include parents that have NO children (standalone)
      const parentIdsWithChildren = new Set(children.map(c => c.parent_variant_id));
      parents.forEach(p => {
        if (!parentIdsWithChildren.has(p.id)) {
          compoundOptions.push({
            id: p.id, label: p.label, price: p.price,
            compare_at_price: p.compare_at_price, sku: p.sku,
            stock: p.stock, is_default: p.is_default,
            sort_order: (p.sort_order || 0) * 100
          });
        }
      });

      compoundOptions.sort((a, b) => a.sort_order - b.sort_order);

      // Use parent's variant type as the group type
      const firstParent = parents[0];
      const typeName = firstParent?.variant_types?.name || 'Option';
      const typeSlug = firstParent?.variant_types?.slug || 'option';

      return [{ type: typeName, slug: typeSlug, options: compoundOptions }];
    }

    // ── Simple (flat) variants: group by type as before ──
    const byType = {};
    active.forEach(v => {
      const typeName = v.variant_types?.name || 'Option';
      const typeSlug = v.variant_types?.slug || 'option';
      if (!byType[typeSlug]) byType[typeSlug] = { type: typeName, slug: typeSlug, options: [] };
      byType[typeSlug].options.push({
        id: v.id, label: v.label, price: v.price,
        compare_at_price: v.compare_at_price, sku: v.sku,
        stock: v.stock, is_default: v.is_default, sort_order: v.sort_order || 0
      });
    });
    return Object.values(byType).map(g => {
      g.options.sort((a, b) => a.sort_order - b.sort_order);
      return g;
    });
  }

  // ============================================================
  // TRANSFORM: Supabase row → dados.json format
  // ============================================================
  function transformProduct(p) {
    return {
      id: p.legacy_id || p.id,
      nome: p.name,
      preco: p[PRICE_FIELD] || 0,
      preco_antigo: p[COMPARE_FIELD] || null,
      categoria: p.categories?.name || '',
      marca: p.brands?.name || '',
      subcategoria: p.subcategories?.name || '',
      sub_subcategoria: p.sub_subcategories?.name || '',
      imagem: (p.image_url || '').includes('produtos-279/') 
        ? (p.image_url || '').replace(/\.(jpg|jpeg|png)$/i, '.webp')
        : (p.image_url || ''),
      imagens: (p.product_images || [])
        .sort((a, b) => (a.position || 0) - (b.position || 0))
        .map(img => ({
          id: img.id,
          url: img.url,
          alt: img.alt_text || p.name,
          is_primary: img.is_primary
        })),
      variantes: buildVariants(p.product_variants || []),
      descricao: p.short_description || '',
      descricao_detalhada: p.description || '',
      sku: p.sku || '',
      rating: Number(p.rating) || 0,
      reviews: (p.review_count != null && p.review_count !== '') ? Number(p.review_count) : (p.reviews != null ? Number(p.reviews) : 0),
      em_stock: p.in_stock !== false,
      is_new: p.is_new || false,
      desconto: p.discount_percent || 0,
      ingredientes: p.ingredients || '',
      info_nutricional: p.nutritional_info || '',
      modo_uso: p.usage_instructions || '',
      especificacoes_tecnicas: p.technical_specs || null,
      caracteristicas: p.features || null,
      dietary_tags: p.dietary_tags || [],
      peso: p.weight || '',
      _supabase_id: p.id,
      _slug: p.slug,
      _currency: CURRENCY,
      _stock_qty: p.stock_quantity
    };
  }

  // ============================================================
  // FALLBACK: Load from dados.json if Supabase fails
  // ============================================================
  async function fetchFromJSON() {
    // Use slim version (61KB) instead of full (608KB) for listing pages
    const isProductPage = location.pathname.includes('produto');
    const jsonFile = isProductPage ? 'js/dados.json' : 'js/dados-slim.json';
    const res = await fetch(jsonFile);
    if (!res.ok) throw new Error(jsonFile + ' failed');
    const data = await res.json();
    return Array.isArray(data) ? data : (data.produtos || []);
  }

  // ============================================================
  // MAIN LOADER — Populates globals used by existing JS
  // ============================================================
  async function loadProducts() {
    let products = [];
    let source = 'unknown';

    try {
      const raw = await fetchFromSupabase();
      products = raw.map(transformProduct);
      source = 'supabase';

      // Merge review aggregates from reviews table so cards show stars + count everywhere
      try {
        const reviewAgg = await fetchReviewsAggregates();
        products.forEach(function (p) {
          const sid = p._supabase_id;
          if (!sid || !reviewAgg[sid]) return;
          const a = reviewAgg[sid];
          p.reviews = a.count;
          p.rating = a.count > 0 ? Math.round((a.sumRating / a.count) * 10) / 10 : 0;
        });
      } catch (e) {
        // ignore if reviews fetch fails; keep product.rating/reviews from table or 0
      }
    } catch (err) {
      console.error('[SFI] Supabase load failed:', err.message);
      try {
        products = await fetchFromJSON();
        source = 'dados.json';
      } catch (err2) {
        console.error('[SFI] All data sources failed:', err2.message);
        products = [];
        source = 'none';
      }
    }

    // Populate ALL globals that existing code expects
    window.PRODUTOS = products;
    window.EMBEDDED_PRODUCTS = products;
    window.allProducts = products;
    window.produtosFiltrados = products.slice();

    // Store metadata
    window._sfiDataSource = source;
    window._sfiCurrency = CURRENCY;
    window._sfiDataReady = true;

    // console.log(`[SFI] ${products.length} products loaded from ${source} | Currency: ${CURRENCY}`);

    // Dispatch event so other scripts know data is ready
    window.dispatchEvent(new CustomEvent('sfi:products-loaded', {
      detail: { count: products.length, source, currency: CURRENCY }
    }));

    return products;
  }

  // ============================================================
  // INTERCEPT fetch('js/dados.json') — Return Supabase data
  // ============================================================
  const originalFetch = window.fetch;
  window.fetch = function(url, options) {
    if (typeof url === 'string' && (url.includes('dados.json') || url.includes('dados-slim.json'))) {
      // If data is already loaded, return immediately
      if (window.PRODUTOS && window.PRODUTOS.length > 0) {
        return Promise.resolve(new Response(
          JSON.stringify(window.PRODUTOS),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        ));
      }
      // If still loading from Supabase, wait for it
      if (window._sfiProductsPromise) {
        return window._sfiProductsPromise.then(products => {
          return new Response(
            JSON.stringify(products),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }).catch(() => {
          // Supabase failed, fall back to actual dados.json
          return originalFetch.call(this, url, options);
        });
      }
    }
    return originalFetch.call(this, url, options);
  };

  // ============================================================
  // AUTO-LOAD on script parse
  // ============================================================
  window._sfiProductsPromise = loadProducts();

})();
