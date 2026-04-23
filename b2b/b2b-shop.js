/**
 * B2B Shop — Sports Foods Ireland
 * v7 — cards clicáveis, modal de produto com selecção de variante obrigatória
 */
(function() {
  'use strict';

  let allProducts = [];
  let currentPage = 1;
  const perPage = 500;
  let allProductsCache = [];
  let searchTimeout = null;

  // ─── Helpers ───────────────────────────────────────────────────────────────
  function productInStock(p) {
    const variants = p.variantes || p.variants || [];
    const allOptions = variants.flatMap(g => g.options || g.opcoes || []);
    if (allOptions.length > 0) return allOptions.some(o => o.stock == null || Number(o.stock) > 0);
    return p.em_stock !== false && p.em_stock !== 0;
  }

  function fmt(v) { return '€' + Number(v || 0).toFixed(2); }

  // ─── Access check ──────────────────────────────────────────────────────────
  async function checkB2BAccess() {
    try {
      const hasAccess = await sfi.b2b.checkAccess();
      if (!hasAccess) {
        document.getElementById('accessDenied').style.display = 'block';
        if (sfi.auth.isLoggedIn()) {
          document.getElementById('accessDenied').querySelector('p').textContent =
            'Your B2B application is pending or has not been approved yet.';
        }
        return false;
      }
      const profile = await sfi.b2b.getProfile();
      if (profile?.b2b_company_name) {
        document.getElementById('companyName').textContent = 'Welcome, ' + profile.b2b_company_name;
      }
      document.getElementById('shopContent').style.display = 'block';
      return true;
    } catch (e) {
      document.getElementById('accessDenied').style.display = 'block';
      return false;
    }
  }

  // ─── Product Modal ─────────────────────────────────────────────────────────
  function injectModalHTML() {
    if (document.getElementById('shopProductModal')) return;

    const style = document.createElement('style');
    style.textContent = `
      #shopProductModal{display:none;position:fixed;inset:0;z-index:9999}
      #shopProductModal.open{display:flex;align-items:center;justify-content:center}
      .spm-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.55)}
      .spm-box{position:relative;background:#fff;border-radius:16px;max-width:520px;width:calc(100% - 32px);
        max-height:90vh;overflow-y:auto;padding:28px 28px 24px;box-shadow:0 20px 60px rgba(0,0,0,.3)}
      .spm-close{position:absolute;top:14px;right:16px;background:none;border:none;font-size:22px;
        cursor:pointer;color:#64748b;line-height:1}
      .spm-close:hover{color:#1e293b}
      .spm-img{width:100%;max-height:220px;object-fit:contain;background:#f8f9fa;
        border-radius:10px;margin-bottom:16px;padding:12px}
      .spm-brand{font-size:.72rem;text-transform:uppercase;color:#94a3b8;letter-spacing:.5px}
      .spm-name{font-weight:700;font-size:1.1rem;color:#1e293b;margin:4px 0 8px;line-height:1.3}
      .spm-price{font-size:1.3rem;font-weight:800;color:#1B4332;margin-bottom:16px}
      .spm-stock{font-size:.72rem;font-weight:700;padding:3px 10px;border-radius:20px;
        display:inline-block;margin-bottom:14px;text-transform:uppercase}
      .spm-stock.in{background:#f0fdf4;color:#166534}
      .spm-stock.backorder{background:#fffbeb;color:#92400e}
      .spm-var-section{margin-bottom:14px}
      .spm-var-label{font-size:.8rem;font-weight:700;text-transform:uppercase;
        letter-spacing:.4px;color:#475569;margin-bottom:8px}
      .spm-var-label span{font-weight:400;color:#94a3b8;margin-left:6px;text-transform:none}
      .spm-var-options{display:flex;flex-wrap:wrap;gap:8px}
      .spm-var-btn{padding:7px 14px;border:2px solid #e2e8f0;border-radius:8px;background:#fff;
        font-size:.82rem;font-weight:600;color:#1e293b;cursor:pointer;transition:all .15s}
      .spm-var-btn:hover:not(:disabled){border-color:#2D6A4F;color:#2D6A4F}
      .spm-var-btn.selected{border-color:#2D6A4F;background:#2D6A4F;color:#fff}
      .spm-var-btn.oos{border-style:dashed;color:#94a3b8}
      .spm-qty-row{display:flex;align-items:center;gap:12px;margin:16px 0}
      .spm-qty-row label{font-size:.82rem;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.4px}
      .spm-qty-row input{width:64px;padding:8px 10px;border:2px solid #e2e8f0;border-radius:8px;
        font-size:1rem;font-weight:700;text-align:center}
      .spm-add-btn{display:block;width:100%;padding:14px;background:#2D6A4F;color:#fff;border:none;
        border-radius:10px;font-weight:700;font-size:1rem;cursor:pointer;transition:background .2s;margin-top:4px}
      .spm-add-btn:hover:not(:disabled){background:#1B4332}
      .spm-add-btn:disabled{background:#94a3b8;cursor:not-allowed}
      .spm-error{color:#ef4444;font-size:.82rem;margin-top:8px;display:none}
      .spm-loading{text-align:center;padding:40px;color:#94a3b8}
    `;
    document.head.appendChild(style);

    const div = document.createElement('div');
    div.id = 'shopProductModal';
    div.innerHTML = `
      <div class="spm-backdrop" onclick="closeShopModal()"></div>
      <div class="spm-box">
        <button class="spm-close" onclick="closeShopModal()">✕</button>
        <div id="spmBody"><div class="spm-loading">Loading...</div></div>
      </div>`;
    document.body.appendChild(div);

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeShopModal();
    });
  }

  window.closeShopModal = function() {
    const m = document.getElementById('shopProductModal');
    if (m) { m.classList.remove('open'); document.body.style.overflow = ''; }
  };

  // Selected variant state for current open modal
  let _sel = { variantId: null, variantLabel: null, variantPrice: null };

  window.openShopProductModal = async function(id) {
    const modal = document.getElementById('shopProductModal');
    if (!modal) return;
    const body = document.getElementById('spmBody');
    body.innerHTML = '<div class="spm-loading">Loading product details...</div>';
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    try {
      // Try cache first
      let p = allProductsCache.find(x => String(x.id) === String(id)) || null;

      // If not in cache or cache has no variant data, fetch from Supabase directly
      const cachedVariants = (p?.variantes || p?.variants || []).flatMap(g => g.options || g.opcoes || []);
      if (!p || cachedVariants.length === 0) {
        try {
          const rows = await sfi.b2b.getProducts({ perPage: 500 });
          // Refresh entire cache
          rows.forEach(r => {
            const idx = allProductsCache.findIndex(x => String(x.id) === String(r.id));
            if (idx >= 0) allProductsCache[idx] = r; else allProductsCache.push(r);
          });
          p = allProductsCache.find(x => String(x.id) === String(id)) || p;
        } catch(e2) { /* use whatever we have */ }
      }

      if (!p) { body.innerHTML = '<div class="spm-loading">Product not found.</div>'; return; }
      renderShopModal(p);
    } catch (e) {
      body.innerHTML = '<div class="spm-loading">Error loading product. Please try again.</div>';
    }
  };

  function renderShopModal(p) {
    _sel = { variantId: null, variantLabel: null, variantPrice: null };
    window._spmFlavors = null;
    window._spmSizes   = null;

    const imgSrc    = p.imagem ? (p.imagem.startsWith('http') ? p.imagem : '../' + p.imagem) : '../img/placeholder.webp';
    const brand     = p.brands?.name || p.marca || '';
    const b2bPrice  = Number(p.b2b_price || 0);
    const varGroups = p.variantes || p.variants || [];
    const allOpts   = varGroups.flatMap(g => g.options || g.opcoes || []);
    const hasVar    = allOpts.length > 0;
    const inStock   = productInStock(p);

    const stockBadge = inStock
      ? '<span class="spm-stock in">In Stock</span>'
      : '<span class="spm-stock backorder">Backorder Available</span>';

    let varHtml = '';
    if (hasVar) {
      const isCompound = allOpts.some(o => (o.label || '').includes(' / '));
      if (isCompound) {
        const flavors = new Map();
        const sizes   = new Set();
        allOpts.forEach(o => {
          const parts  = (o.label || '').split(' / ');
          const flavor = parts[0]?.trim() || '';
          const size   = parts.slice(1).join(' / ').trim() || '';
          if (!flavors.has(flavor)) flavors.set(flavor, []);
          flavors.get(flavor).push({ ...o, _flavor: flavor, _size: size });
          if (size) sizes.add(size);
        });
        window._spmFlavors = flavors;
        window._spmSizes   = sizes;

        varHtml += `<div class="spm-var-section">
          <div class="spm-var-label">Flavour <span id="spmFlavorLabel"></span></div>
          <div class="spm-var-options" id="spmFlavorOptions">
            ${[...flavors.keys()].map(fl => {
              const ok = flavors.get(fl).some(o => o.stock == null || Number(o.stock) > 0);
              return `<button class="spm-var-btn${!ok ? ' oos' : ''}"
                onclick="selectShopFlavor(this,'${fl.replace(/'/g,"\\'")}')">
                ${fl}${!ok ? ' (Backorder)' : ''}</button>`;
            }).join('')}
          </div>
        </div>`;

        if (sizes.size > 1) {
          varHtml += `<div class="spm-var-section" id="spmSizeSection" style="display:none">
            <div class="spm-var-label">Size <span id="spmSizeLabel"></span></div>
            <div class="spm-var-options" id="spmSizeOptions"></div>
          </div>`;
        }
      } else {
        const gName = varGroups[0]?.name || varGroups[0]?.nome || 'Option';
        varHtml += `<div class="spm-var-section">
          <div class="spm-var-label">${gName} <span id="spmOptionLabel"></span></div>
          <div class="spm-var-options">
            ${allOpts.map(o => {
              const ok  = o.stock == null || Number(o.stock) > 0;
              const pr  = o.price != null ? o.price : b2bPrice;
              return `<button class="spm-var-btn${!ok ? ' oos' : ''}"
                data-variant-id="${o.id}"
                data-variant-label="${(o.label||'').replace(/"/g,'&quot;')}"
                data-variant-price="${pr}"
                data-variant-img="${o.image_url||''}"
                onclick="selectShopVariant(this)">
                ${o.label || o.nome || ''}${!ok ? ' (Backorder)' : ''}</button>`;
            }).join('')}
          </div>
        </div>`;
      }
    }

    document.getElementById('spmBody').innerHTML = `
      <img class="spm-img" src="${imgSrc}" id="spmImg" alt="${p.nome||''}" onerror="this.src='../img/placeholder.webp'">
      <div class="spm-brand">${brand}</div>
      <div class="spm-name">${p.nome||''}</div>
      <div class="spm-price" id="spmPrice">${fmt(b2bPrice)} <small style="font-size:.7em;font-weight:400;color:#64748b">ex-VAT</small></div>
      ${stockBadge}
      ${varHtml}
      <div class="spm-qty-row">
        <label for="spmQty">Qty</label>
        <input type="number" id="spmQty" value="1" min="1" max="999">
      </div>
      <button class="spm-add-btn" id="spmAddBtn"
        onclick="confirmShopAddToCart('${p.id}','${(p.nome||'').replace(/'/g,"\\'")}',${b2bPrice})"
        ${hasVar ? 'disabled' : ''}>
        ${hasVar ? 'Select an option above' : '🛒 Add to Cart'}
      </button>
      <div class="spm-error" id="spmError">Please select all options before adding to cart.</div>
    `;

    if (!hasVar) _sel.variantPrice = b2bPrice;
  }

  window.selectShopVariant = function(btn) {
    document.querySelectorAll('#spmBody .spm-var-options .spm-var-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    _sel.variantId    = btn.dataset.variantId;
    _sel.variantLabel = btn.dataset.variantLabel;
    _sel.variantPrice = parseFloat(btn.dataset.variantPrice) || null;
    const lbl = document.getElementById('spmOptionLabel');
    if (lbl) lbl.textContent = '— ' + btn.dataset.variantLabel;
    if (_sel.variantPrice) {
      const el = document.getElementById('spmPrice');
      if (el) el.innerHTML = fmt(_sel.variantPrice) + ' <small style="font-size:.7em;font-weight:400;color:#64748b">ex-VAT</small>';
    }
    if (btn.dataset.variantImg) { const img = document.getElementById('spmImg'); if (img) img.src = btn.dataset.variantImg; }
    const addBtn = document.getElementById('spmAddBtn');
    if (addBtn) { addBtn.disabled = false; addBtn.textContent = '🛒 Add to Cart'; }
    const err = document.getElementById('spmError');
    if (err) err.style.display = 'none';
  };

  window.selectShopFlavor = function(btn, flavor) {
    document.querySelectorAll('#spmFlavorOptions .spm-var-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    const lbl = document.getElementById('spmFlavorLabel');
    if (lbl) lbl.textContent = '— ' + flavor;

    const flOpts = window._spmFlavors?.get(flavor) || [];
    const flImg  = flOpts.find(o => o.image_url)?.image_url;
    if (flImg) { const img = document.getElementById('spmImg'); if (img) img.src = flImg; }

    const sizes = window._spmSizes;
    if (!sizes || sizes.size <= 1) {
      const sz    = sizes ? [...sizes][0] : '';
      const match = flOpts.find(o => !sz || o._size === sz);
      if (match) {
        _sel.variantId    = match.id;
        _sel.variantLabel = match.label;
        _sel.variantPrice = match.price != null ? match.price : null;
        if (_sel.variantPrice) {
          const el = document.getElementById('spmPrice');
          if (el) el.innerHTML = fmt(_sel.variantPrice) + ' <small style="font-size:.7em;font-weight:400;color:#64748b">ex-VAT</small>';
        }
        const addBtn = document.getElementById('spmAddBtn');
        if (addBtn) { addBtn.disabled = false; addBtn.textContent = '🛒 Add to Cart'; }
      }
      return;
    }

    const sec = document.getElementById('spmSizeSection');
    if (sec) {
      sec.style.display = '';
      document.getElementById('spmSizeOptions').innerHTML = [...sizes].map(sz => {
        const match = flOpts.find(o => o._size === sz);
        const ok    = match && (match.stock == null || Number(match.stock) > 0);
        return `<button class="spm-var-btn${!ok ? ' oos' : ''}"
          data-size="${sz.replace(/"/g,'&quot;')}"
          ${match ? `data-variant-id="${match.id}"
            data-variant-label="${(match.label||'').replace(/"/g,'&quot;')}"
            data-variant-price="${match.price != null ? match.price : ''}"
            data-variant-img="${match.image_url||''}"` : ''}
          onclick="selectShopSize(this)">
          ${sz}${!ok ? ' (Backorder)' : ''}</button>`;
      }).join('');
    }
    _sel.variantId    = null;
    _sel.variantLabel = null;
    const addBtn = document.getElementById('spmAddBtn');
    if (addBtn) { addBtn.disabled = true; addBtn.textContent = 'Select size above'; }
  };

  window.selectShopSize = function(btn) {
    document.querySelectorAll('#spmSizeOptions .spm-var-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    _sel.variantId    = btn.dataset.variantId;
    _sel.variantLabel = btn.dataset.variantLabel;
    _sel.variantPrice = btn.dataset.variantPrice ? parseFloat(btn.dataset.variantPrice) : null;
    const lbl = document.getElementById('spmSizeLabel');
    if (lbl) lbl.textContent = '— ' + btn.dataset.size;
    if (btn.dataset.variantImg) { const img = document.getElementById('spmImg'); if (img) img.src = btn.dataset.variantImg; }
    if (_sel.variantPrice) {
      const el = document.getElementById('spmPrice');
      if (el) el.innerHTML = fmt(_sel.variantPrice) + ' <small style="font-size:.7em;font-weight:400;color:#64748b">ex-VAT</small>';
    }
    const addBtn = document.getElementById('spmAddBtn');
    if (addBtn) { addBtn.disabled = false; addBtn.textContent = '🛒 Add to Cart'; }
    const err = document.getElementById('spmError');
    if (err) err.style.display = 'none';
  };

  window.confirmShopAddToCart = function(id, name, basePrice) {
    const p       = allProductsCache.find(x => String(x.id) === String(id));
    const allOpts = (p?.variantes || p?.variants || []).flatMap(g => g.options || g.opcoes || []);
    const hasVar  = allOpts.length > 0;

    if (hasVar && !_sel.variantId) {
      const err = document.getElementById('spmError');
      if (err) { err.textContent = 'Please select all options before adding to cart.'; err.style.display = 'block'; }
      return;
    }

    const qty      = parseInt(document.getElementById('spmQty')?.value || '1') || 1;
    const price    = _sel.variantPrice != null ? _sel.variantPrice : basePrice;
    const label    = _sel.variantLabel || '';
    const imgEl    = document.getElementById('spmImg');
    const img      = imgEl?.src || '';
    const fullName = label ? name + ' \u2014 ' + label : name;

    if (typeof window.addToCart === 'function') {
      window.addToCart(id, qty, {
        nome:          fullName,
        preco:         price,
        imagem:        img,
        variant_id:    _sel.variantId || undefined,
        variantId:     _sel.variantId || undefined,
        variant_label: label || undefined,
        variant:       label || undefined,
      });
    }

    const addBtn = document.getElementById('spmAddBtn');
    if (addBtn) { addBtn.textContent = '\u2713 Added!'; addBtn.style.background = '#166534'; }
    setTimeout(() => closeShopModal(), 900);
  };

  // ─── addB2BToCart — entry point from card button ───────────────────────────
  window.addB2BToCart = function(id, name, price, isBackorder) {
    const cached  = allProductsCache.find(p => String(p.id) === String(id));
    const allOpts = (cached?.variantes || cached?.variants || []).flatMap(g => g.options || g.opcoes || []);

    if (allOpts.length > 0) {
      openShopProductModal(id);
      return;
    }

    if (typeof window.addToCart === 'function') {
      window.addToCart(id, 1, { nome: name, preco: price / 1.23, imagem: '' });
    } else {
      const cart = JSON.parse(localStorage.getItem('cart') || '[]');
      const ex   = cart.find(i => i.id === id);
      if (ex) ex.quantidade = (ex.quantidade || 1) + 1;
      else cart.push({ id, nome: name, preco: price / 1.23, quantidade: 1, imagem: '' });
      localStorage.setItem('cart', JSON.stringify(cart));
      if (typeof updateCartCount === 'function') updateCartCount();
    }

    const btn = event?.target;
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = isBackorder ? '\u2713 Backorder Added' : '\u2713 Added';
      btn.style.background = isBackorder ? '#92400e' : '#166534';
      setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 1200);
    }
  };

  // Exposed for cart.js variant enforcement
  window.addShopToCart = function(id) { openShopProductModal(id); };

  // ─── Render products ───────────────────────────────────────────────────────
  window.debounceSearch = function() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => loadProducts(), 350);
  };

  window.loadProducts = async function() {
    const grid = document.getElementById('productGrid');
    grid.innerHTML = '<div class="b2b-loading">Loading products...</div>';
    try {
      const catBtn = document.querySelector('.b2b-cat-card.active');
      const cat    = catBtn ? catBtn.getAttribute('data-cat') : '';
      const brand  = document.querySelector('input[name="brand"]:checked')?.value || '';
      const sub    = document.querySelector('input[name="subcategory"]:checked')?.value || '';
      const search = document.getElementById('b2bSearch')?.value?.trim() || '';
      const sort   = document.getElementById('sortSelect').value;

      let products = await sfi.b2b.getProducts({
        category: cat || undefined, subcategory: sub || undefined,
        brand: brand || undefined, search: search || undefined,
        page: currentPage, perPage
      });

      const showOOS = document.getElementById('showOutOfStock')?.checked !== false;
      if (!showOOS) products = products.filter(p => productInStock(p));
      allProducts = products;

      // Keep cache updated — merge into allProductsCache by id so modal can always find the product
      products.forEach(p => {
        const idx = allProductsCache.findIndex(x => String(x.id) === String(p.id));
        if (idx >= 0) allProductsCache[idx] = p;
        else allProductsCache.push(p);
      });

      products.sort((a, b) => {
        const aS = productInStock(a) ? 0 : 1, bS = productInStock(b) ? 0 : 1;
        if (aS !== bS) return aS - bS;
        if (sort === 'name_asc')  return (a.nome||'').localeCompare(b.nome||'');
        if (sort === 'name_desc') return (b.nome||'').localeCompare(a.nome||'');
        if (sort === 'price_asc') return (a.b2b_price||0) - (b.b2b_price||0);
        if (sort === 'price_desc')return (b.b2b_price||0) - (a.b2b_price||0);
        return 0;
      });

      const oos = products.filter(p => !productInStock(p)).length;
      document.getElementById('productCount').textContent =
        products.length + ' products' + (oos > 0 ? ` (${oos} backorder)` : '');
      renderProducts(products);
    } catch (e) {
      grid.innerHTML = '<div class="b2b-loading">Error loading products. Please try again.</div>';
    }
  };

  function renderProducts(products) {
    const grid = document.getElementById('productGrid');
    if (!products.length) {
      grid.innerHTML = '<div class="b2b-loading">No products found for this filter.</div>';
      return;
    }

    grid.innerHTML = products.map(p => {
      const imgSrc    = p.imagem ? (p.imagem.startsWith('http') ? p.imagem : '../' + p.imagem) : '../img/placeholder.webp';
      const b2bPrice  = p.b2b_price != null ? '\u20ac' + Number(p.b2b_price).toFixed(2) : 'N/A';
      const brandName = p.brands?.name || p.marca || '';
      const variants  = (p.variantes || p.variants || []).flatMap(g => g.options || g.opcoes || []);
      const hasVar    = variants.length > 0;
      const anyOk     = hasVar
        ? variants.some(o => o.stock == null || Number(o.stock) > 0)
        : (p.em_stock !== false && p.em_stock !== 0);
      const stockQty  = hasVar
        ? variants.reduce((s, o) => s + (Number(o.stock) || 0), 0)
        : p._stock_qty;

      const stockBadge = anyOk
        ? (stockQty != null && stockQty > 0 && stockQty <= 5
            ? `<div class="b2b-stock-badge low">Only ${stockQty} left</div>`
            : '<div class="b2b-stock-badge in">In Stock</div>')
        : '<div class="b2b-stock-badge backorder">\uD83D\uDCCB Backorder</div>';

      const safeName = (p.nome||'').replace(/'/g,"\\'");
      const pid    = String(p.id); // always string-safe for onclick attributes
      const btnClass = anyOk ? 'btn-add' : 'btn-backorder';
      const btnLabel = hasVar
        ? (anyOk ? 'Select Options' : '\uD83D\uDCCB Select Options')
        : (anyOk ? 'Add to Cart' : '\uD83D\uDCCB Backorder');
      const btnClick = `event.stopPropagation();addB2BToCart('${pid}','${safeName}',${p.b2b_price||0},${!anyOk})`;

      const favs  = JSON.parse(localStorage.getItem('sfi_b2b_favourites') || '[]');
      const isFav = favs.some(f => String(f.id) === pid);
      const favBtn = `<button class="b2b-fav-btn${isFav ? ' active' : ''}"
        onclick="event.stopPropagation();toggleFav('${pid}','${safeName}',${p.b2b_price||0},'${imgSrc.replace(/'/g,"\\'")}','${brandName.replace(/'/g,"\\'")}',this)"
        title="${isFav ? 'Remove from favourites' : 'Add to favourites'}">${isFav ? '\u2605' : '\u2606'}</button>`;

      return `<div class="b2b-card${!anyOk ? ' b2b-backorder' : ''}" style="cursor:pointer"
        onclick="openShopProductModal('${pid}')" title="View details">
        ${favBtn}
        <img src="${imgSrc}" alt="${p.nome}" loading="lazy" onerror="this.src='../img/placeholder.webp'">
        <div class="b2b-card-body">
          <div class="brand">${brandName}</div>
          <div class="name">${p.nome}</div>
          ${stockBadge}
          <div class="b2b-price-row"><span class="b2b-price">${b2bPrice}</span></div>
          <button class="${btnClass}" onclick="${btnClick}">${btnLabel}</button>
        </div>
      </div>`;
    }).join('');
  }

  // ─── Filters ───────────────────────────────────────────────────────────────
  function buildFilters(products) {
    allProductsCache = products;
    const cats = new Map(), brands = new Set(), subcats = new Map();
    products.forEach(p => {
      const c = p.categories?.name || p.categoria;
      if (c) cats.set(c, (cats.get(c) || 0) + 1);
      if (p.brands?.name) brands.add(p.brands.name); else if (p.marca) brands.add(p.marca);
      const s = p.subcategories?.name || p.subcategoria;
      if (c && s) {
        if (!subcats.has(c)) subcats.set(c, new Map());
        subcats.get(c).set(s, (subcats.get(c).get(s) || 0) + 1);
      }
    });
    window._b2bSubcats = subcats;

    document.querySelectorAll('.b2b-cat-card').forEach(btn => {
      const c = btn.getAttribute('data-cat');
      const sp = btn.querySelector('span');
      if (!c && sp) sp.textContent = `All Products (${products.length})`;
      else if (c && cats.has(c) && sp) sp.textContent = `${c} (${cats.get(c)})`;
    });

    const catDiv = document.getElementById('filterCategories');
    catDiv.innerHTML = '<label><input type="radio" name="cat" value="" checked onchange="syncCatBtn(this.value);updateSubcatFilter();loadProducts()"> All Categories</label>';
    [...cats.keys()].sort().forEach(c => {
      catDiv.innerHTML += `<label><input type="radio" name="cat" value="${c}" onchange="syncCatBtn(this.value);updateSubcatFilter();loadProducts()"> ${c} (${cats.get(c)})</label>`;
    });

    const brandDiv = document.getElementById('filterBrands');
    brandDiv.innerHTML = '<label><input type="radio" name="brand" value="" checked onchange="loadProducts()"> All Brands</label>';
    [...brands].sort().forEach(b => {
      brandDiv.innerHTML += `<label><input type="radio" name="brand" value="${b}" onchange="loadProducts()"> ${b}</label>`;
    });
  }

  window.updateSubcatFilter = function() {
    const group = document.getElementById('subcategoryFilterGroup');
    const div   = document.getElementById('filterSubcategories');
    const cat   = document.querySelector('.b2b-cat-card.active')?.getAttribute('data-cat') || '';
    if (!cat || !window._b2bSubcats?.has(cat)) { group.style.display = 'none'; div.innerHTML = ''; return; }
    const subs = window._b2bSubcats.get(cat);
    group.style.display = 'block';
    div.innerHTML = '<label><input type="radio" name="subcategory" value="" checked onchange="loadProducts()"> All Subcategories</label>';
    [...subs.keys()].sort().forEach(s => {
      div.innerHTML += `<label><input type="radio" name="subcategory" value="${s}" onchange="loadProducts()"> ${s} (${subs.get(s)})</label>`;
    });
  };

  window.syncCatBtn = function(val) {
    document.querySelectorAll('.b2b-cat-card').forEach(c =>
      c.classList.toggle('active', c.getAttribute('data-cat') === val));
  };

  window.filterByCategory = function(btn) {
    document.querySelectorAll('.b2b-cat-card').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const cat = btn.getAttribute('data-cat');
    const radio = document.querySelector(`input[name="cat"][value="${cat}"]`);
    if (radio) radio.checked = true;
    updateSubcatFilter();
    loadProducts();
  };

  window.toggleFav = function(id, name, price, image, brand, btn) {
    let favs = JSON.parse(localStorage.getItem('sfi_b2b_favourites') || '[]');
    const idx = favs.findIndex(f => f.id === id);
    if (idx >= 0) {
      favs.splice(idx, 1);
      if (btn) { btn.textContent = '\u2606'; btn.classList.remove('active'); btn.title = 'Add to favourites'; }
    } else {
      favs.push({ id, name, price, image, brand });
      if (btn) { btn.textContent = '\u2605'; btn.classList.add('active'); btn.title = 'Remove from favourites'; }
    }
    localStorage.setItem('sfi_b2b_favourites', JSON.stringify(favs));
  };

  // ─── Init ──────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async function() {
    injectModalHTML();
    const hasAccess = await checkB2BAccess();
    if (!hasAccess) return;
    try {
      const all = await sfi.b2b.getProducts({ perPage: 500 });
      buildFilters(all);
    } catch (e) { /* filters won't populate but shop still works */ }
    await loadProducts();
  });

})();
