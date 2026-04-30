/**
 * brand-page-products.js
 * Renders product cards on brand pages — identical to shop cards.
 * Loaded with defer, so runs AFTER all other defer scripts.
 */
(function() {
  // Inject CSS fix for brand page cards — override shop card defaults
  // that cause images to be too small and names to be clipped
  (function injectCSS() {
    if (document.getElementById('brand-page-card-fix')) return;
    var style = document.createElement('style');
    style.id = 'brand-page-card-fix';
    style.textContent = [
      '.brand-products-section .product-card > a:first-child {',
      '  display: block !important;',
      '  height: 200px !important;',
      '  aspect-ratio: unset !important;',
      '  overflow: hidden !important;',
      '  background: #f5f8f5 !important;',
      '  width: 100% !important;',
      '}',
      '.brand-products-section .product-img {',
      '  width: 100% !important;',
      '  height: 100% !important;',
      '  object-fit: contain !important;',
      '  padding: 8px !important;',
      '  display: block !important;',
      '}',
      '.brand-products-section .product-name {',
      '  max-height: none !important;',
      '  -webkit-line-clamp: unset !important;',
      '  -webkit-box-orient: unset !important;',
      '  display: block !important;',
      '  overflow: visible !important;',
      '  white-space: normal !important;',
      '}',
      '@media (max-width: 600px) {',
      '  .brand-products-section .product-card > a:first-child { height: 160px !important; }',
      '}',
    ].join('\n');
    document.head.appendChild(style);
  })();
  // Map: grid element ID → brand name filter
  var BRAND_GRIDS = {
    'tailwindProductsGrid': 'tailwind',
    'clifProductsGrid':     'clif',
    'high5ProductsGrid':    'high5',
    'powerbarProductsGrid': 'powerbar',
    'saltstickProductsGrid':'saltstick',
    'zone3ProductsGrid':    'zone3',
  };
  var MAX_PRODUCTS = 8;

  function renderGrid(gridId, brandFilter) {
    var grid = document.getElementById(gridId);
    if (!grid) return false;
    if (grid.querySelector('.product-card')) return true; // already rendered

    var prods = (window.PRODUTOS || []).filter(function(p) {
      return (p.marca || '').toLowerCase().includes(brandFilter);
    }).slice(0, MAX_PRODUCTS);

    if (!prods.length) return false;

    if (typeof renderProductCards === 'function') {
      renderProductCards(prods, gridId);
    } else if (typeof createProductCardHTML === 'function') {
      grid.innerHTML = prods.map(function(p) { return createProductCardHTML(p); }).join('');
    } else {
      return false;
    }

    if (typeof addQuickActionsToCards === 'function') setTimeout(addQuickActionsToCards, 200);
    return true;
  }

  function renderAll() {
    Object.keys(BRAND_GRIDS).forEach(function(gridId) {
      renderGrid(gridId, BRAND_GRIDS[gridId]);
    });
  }

  // This script is defer — runs after all other defer scripts.
  // If PRODUTOS is already loaded, render immediately.
  if (window.PRODUTOS && window.PRODUTOS.length > 0) {
    renderAll();
    return;
  }

  // Otherwise wait for sfi:products-loaded
  window.addEventListener('sfi:products-loaded', function() {
    setTimeout(renderAll, 0);
  });

  // Also via promise
  if (window._sfiProductsPromise) {
    window._sfiProductsPromise.then(function() { setTimeout(renderAll, 50); });
  }

  // Fallback poll — max 5 seconds
  var _t = 0;
  var _poll = setInterval(function() {
    if (window.PRODUTOS && window.PRODUTOS.length > 0) {
      renderAll();
      clearInterval(_poll);
      return;
    }
    if (++_t > 50) clearInterval(_poll);
  }, 100);
})();
