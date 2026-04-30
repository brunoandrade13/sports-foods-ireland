/**
 * brand-page-products.js  v3
 * Renders product cards on brand pages using the EXACT same
 * renderProductCards() function as the shop — zero extra CSS.
 * The shop's sfi-styles.min.css handles all card styling automatically.
 */
(function() {
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
    if (grid.querySelector('.product-card')) return true;

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

  if (window.PRODUTOS && window.PRODUTOS.length > 0) {
    renderAll();
    return;
  }

  window.addEventListener('sfi:products-loaded', function() { setTimeout(renderAll, 0); });

  if (window._sfiProductsPromise) {
    window._sfiProductsPromise.then(function() { setTimeout(renderAll, 50); });
  }

  var _t = 0;
  var _poll = setInterval(function() {
    if (window.PRODUTOS && window.PRODUTOS.length > 0) { renderAll(); clearInterval(_poll); return; }
    if (++_t > 50) clearInterval(_poll);
  }, 100);
})();
