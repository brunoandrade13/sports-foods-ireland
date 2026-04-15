/**
 * B2B Shop — Sports Foods Ireland
 * Handles product loading, filtering, sorting and pagination for B2B portal
 */
(function() {
  'use strict';

  let allProducts = [];
  let currentPage = 1;
  const perPage = 500;

  // --- Access check ---
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
      // Show company name
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

  let allProductsCache = []; // full cache for filter building
  let searchTimeout = null;

  window.debounceSearch = function() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => loadProducts(), 350);
  };

  // --- Load & render products ---
  window.loadProducts = async function() {
    const grid = document.getElementById('productGrid');
    grid.innerHTML = '<div class="b2b-loading">Loading products...</div>';

    try {
      const catBtn = document.querySelector('.b2b-cat-card.active');
      const cat = catBtn ? catBtn.getAttribute('data-cat') : (document.querySelector('input[name="cat"]:checked')?.value || '');
      const brand = document.querySelector('input[name="brand"]:checked')?.value || '';
      const sub = document.querySelector('input[name="subcategory"]:checked')?.value || '';
      const search = document.getElementById('b2bSearch')?.value?.trim() || '';
      const sort = document.getElementById('sortSelect').value;

      let products = await sfi.b2b.getProducts({
        category: cat || undefined,
        subcategory: sub || undefined,
        brand: brand || undefined,
        search: search || undefined,
        page: currentPage,
        perPage: perPage
      });

      // Filter out of stock if toggle is unchecked
      const showOOS = document.getElementById('showOutOfStock')?.checked !== false;
      if (!showOOS) {
        products = products.filter(p => p.em_stock !== false);
      }

      allProducts = products;

      // Sort client-side (in-stock first, then by selected sort)
      products.sort((a, b) => {
        const aInStock = a.em_stock !== false ? 0 : 1;
        const bInStock = b.em_stock !== false ? 0 : 1;
        if (aInStock !== bInStock) return aInStock - bInStock;
        if (sort === 'name_asc') return (a.nome || '').localeCompare(b.nome || '');
        if (sort === 'name_desc') return (b.nome || '').localeCompare(a.nome || '');
        if (sort === 'price_asc') return (a.b2b_price || 0) - (b.b2b_price || 0);
        if (sort === 'price_desc') return (b.b2b_price || 0) - (a.b2b_price || 0);
        return 0;
      });

      const inStockCount = products.filter(p => p.em_stock !== false).length;
      const oosCount = products.length - inStockCount;
      document.getElementById('productCount').textContent = products.length + ' products' + (oosCount > 0 ? ` (${oosCount} backorder)` : '');
      renderProducts(products);
    } catch (e) {
      grid.innerHTML = '<div class="b2b-loading">Error loading products. Please try again.</div>';
    }
  };

  const EXVAT = v => Number(v||0) / 1.23;  // Remove 23% VAT for B2B display

  function renderProducts(products) {
    const grid = document.getElementById('productGrid');
    if (!products.length) {
      grid.innerHTML = '<div class="b2b-loading">No products found for this filter.</div>';
      return;
    }
    const currency = '€';
    grid.innerHTML = products.map(p => {
      const imgSrc = p.imagem ? (p.imagem.startsWith('http') ? p.imagem : '../' + p.imagem) : '../img/placeholder.webp';
      const b2bPrice = p.b2b_price != null ? currency + Number(p.b2b_price).toFixed(2) : 'N/A';
      const brandName = p.brands?.name || p.marca || '';
      const inStock = p.em_stock !== false;
      const stockQty = p._stock_qty;

      let stockBadge = '';
      let actionBtn = '';
      if (inStock && (stockQty === null || stockQty === undefined || stockQty > 0)) {
        stockBadge = stockQty != null && stockQty <= 5
          ? `<div class="b2b-stock-badge low">Only ${stockQty} left</div>`
          : '<div class="b2b-stock-badge in">In Stock</div>';
        actionBtn = `<button class="btn-add" onclick="addB2BToCart(${p.id}, '${(p.nome||'').replace(/'/g,"\\'")}', ${p.b2b_price || 0}, false)">Add to Cart</button>`;
      } else {
        stockBadge = '<div class="b2b-stock-badge backorder">📋 Backorder</div>';
        actionBtn = `<button class="btn-backorder" onclick="addB2BToCart(${p.id}, '${(p.nome||'').replace(/'/g,"\\'")}', ${p.b2b_price || 0}, true)">📋 Backorder</button>`;
      }

      const favs = JSON.parse(localStorage.getItem('sfi_b2b_favourites') || '[]');
      const isFav = favs.some(f => f.id === p.id);
      const favBtn = `<button class="b2b-fav-btn${isFav ? ' active' : ''}" onclick="event.stopPropagation();toggleFav(${p.id}, '${(p.nome||'').replace(/'/g,"\\'")}', ${p.b2b_price || 0}, '${(imgSrc||'').replace(/'/g,"\\'")}', '${(brandName||'').replace(/'/g,"\\'")}', this)" title="${isFav ? 'Remove from favourites' : 'Add to favourites'}">${isFav ? '★' : '☆'}</button>`;

      return `<div class="b2b-card${!inStock ? ' b2b-backorder' : ''}">
        ${favBtn}
        <img src="${imgSrc}" alt="${p.nome}" loading="lazy" onerror="this.src='../img/placeholder.webp'">
        <div class="b2b-card-body">
          <div class="brand">${brandName}</div>
          <div class="name">${p.nome}</div>
          ${stockBadge}
          
          <div class="b2b-price-row">
            <span class="b2b-price">${b2bPrice}</span>
          </div>
          ${actionBtn}
        </div>
      </div>`;
    }).join('');
  }

  // --- Build filters from data ---
  function buildFilters(products) {
    allProductsCache = products;
    const cats = new Map();
    const brands = new Set();
    const subcats = new Map(); // cat -> Set of subcats
    products.forEach(p => {
      const catName = p.categories?.name || p.categoria;
      if (catName) cats.set(catName, (cats.get(catName) || 0) + 1);
      if (p.brands?.name) brands.add(p.brands.name);
      else if (p.marca) brands.add(p.marca);
      // Build subcategory map per category
      const subName = p.subcategories?.name || p.subcategoria;
      if (catName && subName) {
        if (!subcats.has(catName)) subcats.set(catName, new Map());
        const catSubs = subcats.get(catName);
        catSubs.set(subName, (catSubs.get(subName) || 0) + 1);
      }
    });
    window._b2bSubcats = subcats;

    // Update category button counts
    document.querySelectorAll('.b2b-cat-card').forEach(btn => {
      const cat = btn.getAttribute('data-cat');
      if (!cat) {
        const countSpan = btn.querySelector('span');
        if (countSpan) countSpan.textContent = `All Products (${products.length})`;
      } else if (cats.has(cat)) {
        const countSpan = btn.querySelector('span');
        if (countSpan) countSpan.textContent = `${cat} (${cats.get(cat)})`;
      }
    });

    const catDiv = document.getElementById('filterCategories');
    catDiv.innerHTML = '<label><input type="radio" name="cat" value="" checked onchange="syncCatBtn(this.value);updateSubcatFilter();loadProducts()"> All Categories</label>';
    [...cats.keys()].sort().forEach(c => {
      catDiv.innerHTML += '<label><input type="radio" name="cat" value="' + c + '" onchange="syncCatBtn(this.value);updateSubcatFilter();loadProducts()"> ' + c + ' (' + cats.get(c) + ')</label>';
    });

    const brandDiv = document.getElementById('filterBrands');
    brandDiv.innerHTML = '<label><input type="radio" name="brand" value="" checked onchange="loadProducts()"> All Brands</label>';
    [...brands].sort().forEach(b => {
      brandDiv.innerHTML += '<label><input type="radio" name="brand" value="' + b + '" onchange="loadProducts()"> ' + b + '</label>';
    });
  }

  // --- Update subcategory filter based on selected category ---
  window.updateSubcatFilter = function() {
    const group = document.getElementById('subcategoryFilterGroup');
    const div = document.getElementById('filterSubcategories');
    const cat = document.querySelector('.b2b-cat-card.active')?.getAttribute('data-cat') || '';
    
    if (!cat || !window._b2bSubcats?.has(cat)) {
      group.style.display = 'none';
      div.innerHTML = '';
      return;
    }
    
    const subs = window._b2bSubcats.get(cat);
    group.style.display = 'block';
    div.innerHTML = '<label><input type="radio" name="subcategory" value="" checked onchange="loadProducts()"> All Subcategories</label>';
    [...subs.keys()].sort().forEach(s => {
      div.innerHTML += '<label><input type="radio" name="subcategory" value="' + s + '" onchange="loadProducts()"> ' + s + ' (' + subs.get(s) + ')</label>';
    });
  };

  // --- Sync category buttons from sidebar radio ---
  window.syncCatBtn = function(val) {
    document.querySelectorAll('.b2b-cat-card').forEach(c => {
      c.classList.toggle('active', c.getAttribute('data-cat') === val);
    });
  };

  // --- Category button click handler ---
  window.filterByCategory = function(btn) {
    document.querySelectorAll('.b2b-cat-card').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const cat = btn.getAttribute('data-cat');
    const radio = document.querySelector(`input[name="cat"][value="${cat}"]`);
    if (radio) radio.checked = true;
    updateSubcatFilter();
    loadProducts();
  };

  // --- Add to cart (B2B) — uses main cart.js addToCart for correct checkout flow ---
  window.addB2BToCart = function(id, name, price, isBackorder) {
    if (typeof window.addToCart === 'function') {
      window.addToCart(id, 1, {
        nome: name,
        preco: price / 1.23, // ex-VAT for B2B
        imagem: '',
      });
    } else {
      // Fallback: use main cart localStorage
      const cart = JSON.parse(localStorage.getItem('cart') || '[]');
      const existing = cart.find(item => item.id === id);
      if (existing) {
        existing.quantidade = (existing.quantidade || 1) + 1;
      } else {
        cart.push({ id, nome: name, preco: price / 1.23, quantidade: 1, imagem: '' });
      }
      localStorage.setItem('cart', JSON.stringify(cart));
      if (typeof updateCartCount === 'function') updateCartCount();
    }
    // Quick feedback
    const btn = event?.target;
    if (btn) {
      const orig = btn.textContent;
      if (isBackorder) {
        btn.textContent = '✓ Backorder Added';
        btn.style.background = '#92400e';
      } else {
        btn.textContent = '✓ Added';
        btn.style.background = '#166534';
      }
      setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 1200);
    }
  };

  // --- Toggle Favourite ---
  window.toggleFav = function(id, name, price, image, brand, btn) {
    let favs = JSON.parse(localStorage.getItem('sfi_b2b_favourites') || '[]');
    const idx = favs.findIndex(f => f.id === id);
    if (idx >= 0) {
      favs.splice(idx, 1);
      if (btn) { btn.textContent = '☆'; btn.classList.remove('active'); btn.title = 'Add to favourites'; }
    } else {
      favs.push({ id, name, price, image, brand });
      if (btn) { btn.textContent = '★'; btn.classList.add('active'); btn.title = 'Remove from favourites'; }
    }
    localStorage.setItem('sfi_b2b_favourites', JSON.stringify(favs));
  };

  // --- Init ---
  document.addEventListener('DOMContentLoaded', async function() {
    const hasAccess = await checkB2BAccess();
    if (!hasAccess) return;

    // Load all products once to build filters
    try {
      const all = await sfi.b2b.getProducts({ perPage: 500 });
      buildFilters(all);
    } catch (e) { /* filters won't populate but shop still works */ }

    await loadProducts();
  });

})();
