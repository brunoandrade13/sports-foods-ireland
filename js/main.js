// Main JS - helper de debug (use ?debug=1 na URL para ativar logs)
const _dbg = () => !!(typeof URLSearchParams !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1');

// ======== HELPER: Função para obter dados de produtos (com fallback para file://) =========
async function getMainProductsData() {
    // Quando a página é aberta via file:// (sem servidor), usar dados embutidos
    if (window.location.protocol === 'file:' && Array.isArray(window.EMBEDDED_PRODUCTS)) {
        return window.EMBEDDED_PRODUCTS;
    }

    // Load products data via fetch
    const response = await fetch('js/dados.json');
    const data = await response.json();

    // Suporta tanto array direto quanto objeto com .produtos
    return Array.isArray(data) ? data : data.produtos;
}

// ======== HELPER: Função para obter imagem válida do produto =========
// Lista de imagens que existem no projeto (placeholders antigos)
const EXISTING_IMAGES = ['produto1.jpg', 'produto2.jpg', 'produto3.jpg', 'produto4.jpg', 'produto5.jpg'];

function getProductImage(imagem, productId) {
    // 0) Normalize extension: Supabase may have .jpg/.png but real files are .webp
    if (imagem && imagem.includes('produtos-279/')) {
        imagem = imagem.replace(/\.(jpg|jpeg|png)$/i, '.webp');
    }

    // 0b) Already has correct img/ prefix — return as-is
    if (imagem && imagem.startsWith('img/')) {
        return imagem;
    }

    // 1) Se já vier um caminho relativo para a pasta de produtos novos (279 produtos)
    //    Ex.: "produtos-279/001-beet-it-regen-cherry.webp"
    if (imagem && (imagem.startsWith('produtos-279/') || imagem.startsWith('produtos-279\\'))) {
        return `img/${imagem}`;
    }

    // 1b) Compatibilidade com pasta antiga produtos-site
    //    Ex.: "produtos-site/spatzwear-race-layer-1.jpg"
    if (imagem && (imagem.startsWith('produtos-site/') || imagem.startsWith('produtos-site\\'))) {
        return `img/${imagem}`;
    }

    // 2) Se a imagem for uma URL absoluta (CDN, site externo), retornar como está
    if (imagem && /^https?:\/\//i.test(imagem)) {
        return imagem;
    }

    // 3) Se a imagem estiver na lista de placeholders antigos, usar esses arquivos
    if (imagem && EXISTING_IMAGES.includes(imagem)) {
        return `img/${imagem}`;
    }

    // 4) Se começa com 'produtoX.jpg', manter compatibilidade com as imagens antigas
    if (imagem && /^produto\d+\.jpg$/i.test(imagem)) {
        return `img/${imagem}`;
    }

    // 5) Fallback final: usar uma das imagens placeholder baseadas no ID
    const fallbackIndex = (productId % 5) + 1;
    return `img/produto${fallbackIndex}.jpg`;
}

// ======== 1. CARREGAR DADOS DOS PRODUTOS =========
let PRODUTOS = [];
let produtosFiltrados = []; // usado em busca/filtros

async function carregarProdutos() {
    try {
        let data;

        // Quando a página é aberta via file:// (sem servidor), usar dados embutidos
        if (window.location.protocol === 'file:' && Array.isArray(window.EMBEDDED_PRODUCTS)) {
            PRODUTOS = window.EMBEDDED_PRODUCTS.slice();
            produtosFiltrados = PRODUTOS.slice();
            // Renderizar apenas se não estivermos na página shop (shop.js cuida dela)
            if (document.getElementById('productsGrid') && !window.location.pathname.includes('shop.html')) {
                renderProductGrid(produtosFiltrados, document.getElementById('productsGrid'));
            }
            if (isHomePage()) { populateHomeCarousels(); }
            return;
        }

        // Try fetch first
        try {
            const response = await fetch('js/dados.json');
            data = await response.json();
        } catch (fetchError) {
            if (_dbg()) console.log('⚠️ Main: fetch failed, trying XMLHttpRequest...', fetchError.message);
            // Fallback to XMLHttpRequest for local files
            data = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', 'js/dados.json', true);
                xhr.onreadystatechange = function () {
                    if (xhr.readyState === 4) {
                        if (xhr.status === 200 || xhr.status === 0) { // status 0 for local files
                            try {
                                resolve(JSON.parse(xhr.responseText));
                            } catch (e) {
                                reject(e);
                            }
                        } else {
                            reject(new Error(`XHR error: ${xhr.status}`));
                        }
                    }
                };
                xhr.onerror = () => reject(new Error('XHR network error'));
                xhr.send();
            });
        }

        PRODUTOS = Array.isArray(data) ? data : (data.produtos || []);
        produtosFiltrados = PRODUTOS.slice();
        // Expor globalmente para que cart.js (resolveProduct) consiga encontrar produtos
        window.PRODUTOS = PRODUTOS;
        // Após carregar, podemos renderizar na página principal se for necessário
        // NÃO renderizar se estiver na página shop.html (shop.js cuida disso)
        if (document.getElementById('productsGrid') && !window.location.pathname.includes('shop.html')) {
            renderProductGrid(produtosFiltrados, document.getElementById('productsGrid'));
        }
        if (isHomePage()) { populateHomeCarousels(); }
    } catch (e) {
        console.error('Erro ao carregar produtos:', e);
    }
}

function isHomePage() {
    const path = (window.location.pathname || '').replace(/\/$/, '');
    return path === '' || path.endsWith('index.html');
}

// ========= HELPER: Card HTML para carrosséis da homepage =========
function buildHomeCarouselCard(prod) {
    // Use shared template if available
    if (typeof createProductCardHTML === 'function') {
        return createProductCardHTML(prod);
    }
    // Fallback — same structure as shop card
    const discountBadge = prod.desconto > 0 ? `<span class="badge-desconto">-${prod.desconto}%</span>` : '';
    const oldPrice = prod.preco_antigo && prod.preco_antigo > prod.preco
        ? `<span class="old-price">€${Number(prod.preco_antigo).toFixed(2)}</span>`
        : '';
    const imgSrc = getProductImage(prod.imagem, prod.id);
    const prodId = prod.id;
    return `
                        <article class="product-card" data-id="${prodId}" data-product-id="${prodId}">
                            ${discountBadge}
                            <a href="produto.html?id=${prodId}">
                                <img src="${imgSrc}" alt="${(prod.nome || '').replace(/"/g, '&quot;')}" class="product-img" loading="lazy" onerror="this.src='img/produto1.jpg'">
                            </a>
                            <h3 class="product-name">
                                <a href="produto.html?id=${prodId}">${(prod.nome || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</a>
                            </h3>
                            ${prod.marca ? `<span class="product-brand">${(prod.marca || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>` : ''}
                            <div class="product-prices">
                                ${oldPrice}
                                <span class="new-price">€${Number(prod.preco).toFixed(2)}</span>
                            </div>
                            <button class="btn-basket" data-product-id="${prodId}">ADD TO BASKET</button>
                        </article>`;
}

// ========= PREENCHER CARROSSÉIS DA HOMEPAGE (Best Sellers, New Products, Promotions) =========
// Extrai "marca" do nome (primeira palavra significativa) para diversificar carrosséis
function getBrandKey(p) {
    const nome = (p.nome || '').trim();
    const match = nome.match(/^([A-Za-z0-9]+(?:\s+[A-Za-z0-9]+)?)\s/) || nome.match(/^([A-Za-z0-9]+)/);
    const first = (match ? match[1] : nome.split(/\s+/)[0] || '').toLowerCase();
    if (first.length <= 2) return (nome.split(/\s+/).slice(0, 2).join(' ') || 'other').toLowerCase();
    return first;
}
// Agrupa por tipo (categoria + palavra-chave no nome) para evitar muitos produtos idênticos
function getTypeKey(p) {
    const cat = (p.categoria || '').toLowerCase();
    const n = (p.nome || '').toLowerCase();
    if (/bar|barra\b/.test(n)) return cat + '_bar';
    if (/gel\b/.test(n)) return cat + '_gel';
    if (/drink|bebida|sachet|tablet|electrolyte/.test(n)) return cat + '_drink';
    if (/protein|recovery|whey/.test(n)) return cat + '_protein';
    return cat + '_other';
}
// Diversifica lista: máx 2 por marca e 2 por tipo, mantendo a ordem original dos candidatos
function diversifyCarousel(candidates, limit) {
    if (!candidates.length || limit <= 0) return [];
    const maxPerBrand = 2;
    const maxPerType = 2;
    const countBrand = {};
    const countType = {};
    const picked = new Set();
    const result = [];
    for (const p of candidates) {
        if (result.length >= limit) break;
        const b = getBrandKey(p);
        const t = getTypeKey(p);
        const nBrand = countBrand[b] || 0;
        const nType = countType[t] || 0;
        if (nBrand >= maxPerBrand || nType >= maxPerType) continue;
        countBrand[b] = nBrand + 1;
        countType[t] = nType + 1;
        picked.add(p.id);
        result.push(p);
    }
    if (result.length < limit) {
        for (const p of candidates) {
            if (result.length >= limit) break;
            if (!picked.has(p.id)) { picked.add(p.id); result.push(p); }
        }
    }
    return result.slice(0, limit);
}

function populateHomeCarousels() {
    const products = PRODUTOS && PRODUTOS.length ? PRODUTOS : (Array.isArray(window.EMBEDDED_PRODUCTS) ? window.EMBEDDED_PRODUCTS : []);
    if (!products.length) return;

    const usedIds = new Set();

    // 1) Promotions: produtos com desconto, ordenados por maior desconto; depois diversificar (máx 2 por marca/tipo)
    const promotionsSorted = products
        .filter(p => p.desconto > 0)
        .sort((a, b) => (b.desconto || 0) - (a.desconto || 0));
    const promotions = diversifyCarousel(promotionsSorted, 12);
    promotions.forEach(p => usedIds.add(p.id));

    // 2) New Products: is_new primeiro, depois mais recentes; depois diversificar
    const newProductsSorted = products
        .filter(p => !usedIds.has(p.id))
        .sort((a, b) => {
            const aNew = a.is_new ? 1 : 0;
            const bNew = b.is_new ? 1 : 0;
            if (bNew !== aNew) return bNew - aNew;
            return (b.id || 0) - (a.id || 0);
        });
    const newProducts = diversifyCarousel(newProductsSorted, 12);
    newProducts.forEach(p => usedIds.add(p.id));

    // 3) Best Sellers: prioridade Nutrição Esportiva (barras, gels, bebidas), depois rating; depois diversificar
    const availableForBestsellers = products.filter(p => !usedIds.has(p.id));
    const isNutrition = (p) => (p.categoria || '').toLowerCase().includes('nutrição') || (p.categoria || '').toLowerCase().includes('nutricao');
    const isBarOrNutrition = (p) => {
        const n = (p.nome || '').toLowerCase();
        return /bar|barra|gel|energy|drink|bebida|shot|chew|recovery|protein|electrolyte|fuel/i.test(n);
    };
    const nutritionFirst = availableForBestsellers
        .filter(p => isNutrition(p))
        .sort((a, b) => {
            const barA = isBarOrNutrition(a) ? 1 : 0;
            const barB = isBarOrNutrition(b) ? 1 : 0;
            if (barB !== barA) return barB - barA;
            const rA = a.rating || 0;
            const rB = b.rating || 0;
            if (rB !== rA) return rB - rA;
            return (b.id || 0) - (a.id || 0);
        });
    const othersByRating = availableForBestsellers
        .filter(p => !isNutrition(p))
        .sort((a, b) => {
            const rA = a.rating || 0;
            const rB = b.rating || 0;
            if (rB !== rA) return rB - rA;
            return (b.id || 0) - (a.id || 0);
        });
    const bestSellersSorted = [...nutritionFirst, ...othersByRating];
    const bestSellers = diversifyCarousel(bestSellersSorted, 12);

    const trackByCarousel = {
        bestsellers: document.querySelector('.category-products-grid[data-carousel="bestsellers"]')
            || document.querySelector('.product-carousel-wrapper[data-carousel="bestsellers"] .product-carousel-track'),
        newproducts: document.querySelector('.category-products-grid[data-carousel="newproducts"]')
            || document.querySelector('.product-carousel-wrapper[data-carousel="newproducts"] .product-carousel-track'),
        promotions: document.querySelector('.category-products-grid[data-carousel="promotions"]')
            || document.querySelector('.product-carousel-wrapper[data-carousel="promotions"] .product-carousel-track')
    };

    if (trackByCarousel.bestsellers) {
        trackByCarousel.bestsellers.innerHTML = bestSellers.map(buildHomeCarouselCard).join('');
    }
    if (trackByCarousel.newproducts) {
        trackByCarousel.newproducts.innerHTML = newProducts.map(buildHomeCarouselCard).join('');
    }
    if (trackByCarousel.promotions) {
        trackByCarousel.promotions.innerHTML = promotions.map(buildHomeCarouselCard).join('');
    }

    // Garantir que imagens lazy fiquem visíveis (adicionar .loaded)
    document.querySelectorAll('.product-carousel-section img.product-img[loading="lazy"]').forEach(img => {
        if (img.complete && img.naturalWidth > 0) img.classList.add('loaded');
        else img.addEventListener('load', function () { this.classList.add('loaded'); });
        img.addEventListener('error', function () { this.classList.add('loaded'); });
    });

    // Re-inicializar hover da barra de quick actions (cards foram recriados)
    if (typeof initQuickActionsHover === 'function') initQuickActionsHover();

    // Anexar listener em novos .btn-basket (carrosséis foram substituídos)
    document.querySelectorAll('.btn-basket').forEach(button => {
        if (button.hasAttribute('data-listener-attached')) return;
        button.setAttribute('data-listener-attached', 'true');
        button.addEventListener('click', function (e) {
            e.stopPropagation();
            if (this.closest('form')) e.preventDefault();
            const productId = this.getAttribute('data-product-id');
            if (productId && typeof window.addToCart === 'function') {
                window.addToCart(parseInt(productId, 10), 1);
            }
        });
    });

    if (typeof initProductCarousels === 'function') initProductCarousels();
}

// ========= 2. RENDERIZAR PRODUTOS =============
// Generic card renderer for non-shop pages (home, categories, search results, etc.)
// shop.js has its own renderProducts() with pagination/view modes for shop.html
function renderProductGrid(produtos, container) {
    if (!container) return;
    if (produtos.length === 0) {
        container.innerHTML = '<p style="text-align:center;grid-column:1/-1;padding:2rem;">Nenhum produto encontrado.</p>';
        return;
    }
    container.innerHTML = produtos.map(prod => {
        // Use shared template if available
        if (typeof createProductCardHTML === 'function') {
            return createProductCardHTML(prod);
        }
        return `
        <article class="product-card" data-id="${prod.id}" data-product-id="${prod.id}">
            ${prod.desconto > 0 ? `<span class="badge-desconto">-${prod.desconto}%</span>` : ''}
            <a href="produto.html?id=${prod.id}">
                <img src="${getProductImage(prod.imagem, prod.id)}" alt="${prod.nome}" class="product-img" loading="lazy" onerror="this.src='img/produto1.jpg'">
            </a>
            <h3 class="product-name">
                <a href="produto.html?id=${prod.id}">${prod.nome}</a>
            </h3>
            ${prod.marca ? `<span class="product-brand">${prod.marca}</span>` : ''}
            ${prod.descricao ? `<p class="product-short-desc">${prod.descricao}</p>` : ''}
            <div class="product-prices">
                ${prod.preco_antigo && prod.preco_antigo > prod.preco ? `<span class="old-price">€${prod.preco_antigo.toFixed(2)}</span>` : ''}
                <span class="new-price">€${prod.preco.toFixed(2)}</span>
            </div>
            <button class="btn-basket" data-product-id="${prod.id}" type="button">ADD TO BASKET</button>
        </article>
    `;
    }).join('');
    // Event delegation para performance
    container.onclick = function (e) {
        // Clique no card - abre página do produto
        const card = e.target.closest('.product-card');
        const link = e.target.closest('.product-link');
        if (link && card) {
            e.preventDefault();
            const id = card.getAttribute('data-id');
            window.location.href = `produto.html?id=${id}`;
            return;
        }

        // Clique em "ADD TO BASKET"
        const btn = e.target.closest('.btn-basket');
        if (btn) {
            e.preventDefault();
            const id = Number(btn.getAttribute('data-product-id'));
            if (typeof window.addToCart === 'function') {
                window.addToCart(id, 1);
            }
        }
    }
}

// ========= 3. BUSCA PRODUTOS EM TEMPO REAL =========
let buscaInitialized = false; // Flag para evitar múltiplas inicializações

function initBuscaLive() {
    const buscaInput = document.getElementById('busca') || document.getElementById('searchInput') || document.querySelector('.busca');
    const grid = document.getElementById('productsGrid');
    if (!buscaInput) return;

    if (buscaInput.hasAttribute('data-search-initialized')) return;
    buscaInput.setAttribute('data-search-initialized', 'true');

    // ── Create Search Dropdown ──
    let dropdown = document.getElementById('sfi-search-dropdown');
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.id = 'sfi-search-dropdown';
        dropdown.style.cssText = `
            display:none; position:fixed; z-index:999999;
            background:#1a1a2e; border:1px solid #444; border-radius:0 0 12px 12px;
            max-height:420px; overflow-y:auto; box-shadow:0 12px 32px rgba(0,0,0,0.6);
        `;
        // Inject scrollbar CSS once
        if (!document.getElementById('sfi-search-css')) {
            const style = document.createElement('style');
            style.id = 'sfi-search-css';
            style.textContent = `
                #sfi-search-dropdown::-webkit-scrollbar { width:6px; }
                #sfi-search-dropdown::-webkit-scrollbar-track { background:transparent; }
                #sfi-search-dropdown::-webkit-scrollbar-thumb { background:#444; border-radius:3px; }
                .sfi-sr-item { display:flex; align-items:center; gap:12px; padding:10px 14px; cursor:pointer; border-bottom:1px solid #2a2a3e; transition:background .15s; text-decoration:none; color:#e0e0e0; }
                .sfi-sr-item:hover, .sfi-sr-item.sfi-sr-active { background:#2a2a4e; }
                .sfi-sr-item img { width:48px; height:48px; object-fit:contain; border-radius:6px; background:#fff; flex-shrink:0; }
                .sfi-sr-info { flex:1; min-width:0; }
                .sfi-sr-name { font-size:0.88rem; font-weight:500; color:#f0f0f0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
                .sfi-sr-meta { font-size:0.75rem; color:#888; margin-top:2px; }
                .sfi-sr-price { font-weight:700; color:#4ade80; font-size:0.9rem; flex-shrink:0; }
                .sfi-sr-old { text-decoration:line-through; color:#888; font-size:0.75rem; margin-left:6px; font-weight:400; }
                .sfi-sr-footer { padding:10px 14px; text-align:center; font-size:0.82rem; color:#60a5fa; cursor:pointer; border-top:1px solid #333; }
                .sfi-sr-footer:hover { background:#2a2a4e; }
                .sfi-sr-empty { padding:20px 14px; text-align:center; color:#888; font-size:0.9rem; }
            `;
            document.head.appendChild(style);
        }
        document.body.appendChild(dropdown);
    }

    let debounceTimer = null;
    let activeIndex = -1;

    function searchProducts(term) {
        if (!term || term.length < 2) return [];
        const words = term.toLowerCase().trim().split(/\s+/).filter(w => w.length > 0);
        const products = window.PRODUTOS || window.EMBEDDED_PRODUCTS || window.allProducts || [];
        return products.filter(p => {
            const text = `${p.nome || ''} ${p.marca || ''} ${p.categoria || ''} ${p.subcategoria || ''} ${p.descricao || ''}`.toLowerCase();
            return words.every(w => text.includes(w));
        }).slice(0, 8);
    }

    function getImageSrc(product) {
        const img = product.imagem || '';
        if (/^https?:\/\//i.test(img)) return img;
        if (img.startsWith('img/')) return img;
        return img ? 'img/' + img : 'img/placeholder.webp';
    }

    function positionDropdown() {
        const rect = buscaInput.getBoundingClientRect();
        dropdown.style.top = rect.bottom + 'px';
        dropdown.style.left = rect.left + 'px';
        dropdown.style.width = Math.max(rect.width, 350) + 'px';
    }

    function showDropdown(results, term) {
        positionDropdown();
        if (results.length === 0) {
            dropdown.innerHTML = `<div class="sfi-sr-empty">No products found for "<strong>${term}</strong>"</div>`;
            dropdown.style.display = 'block';
            activeIndex = -1;
            return;
        }
        const currency = (window._sfiCurrency === 'GBP') ? '£' : '€';
        let html = results.map((p, i) => {
            const price = parseFloat(p.preco) || 0;
            const oldPrice = parseFloat(p.preco_antigo) || 0;
            const oldHtml = oldPrice > price ? `<span class="sfi-sr-old">${currency}${oldPrice.toFixed(2)}</span>` : '';
            return `<a class="sfi-sr-item" href="produto.html?id=${p.id}" data-idx="${i}">
                <img src="${getImageSrc(p)}" alt="" onerror="this.src='img/placeholder.webp'">
                <div class="sfi-sr-info">
                    <div class="sfi-sr-name">${highlightMatch(p.nome || '', term)}</div>
                    <div class="sfi-sr-meta">${p.marca || p.categoria || ''}</div>
                </div>
                <div class="sfi-sr-price">${currency}${price.toFixed(2)}${oldHtml}</div>
            </a>`;
        }).join('');
        html += `<div class="sfi-sr-footer" onclick="window.location.href='shop.html?search=${encodeURIComponent(term)}'">View all results for "${term}" →</div>`;
        dropdown.innerHTML = html;
        dropdown.style.display = 'block';
        activeIndex = -1;
    }

    function highlightMatch(text, term) {
        if (!term) return text;
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return text.replace(new RegExp(`(${escaped})`, 'gi'), '<strong style="color:#fff">$1</strong>');
    }

    function hideDropdown() {
        dropdown.style.display = 'none';
        activeIndex = -1;
    }

    // ── Input event: live search ──
    buscaInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const term = buscaInput.value.trim();
        if (term.length < 2) { hideDropdown(); return; }
        debounceTimer = setTimeout(() => {
            // Wait for products to be loaded
            if (!window.PRODUTOS || window.PRODUTOS.length === 0) {
                if (window._sfiProductsPromise) {
                    window._sfiProductsPromise.then(() => {
                        showDropdown(searchProducts(term), term);
                    });
                    return;
                }
            }
            showDropdown(searchProducts(term), term);

            // Also filter shop grid if on shop page
            if (typeof applyFilters === 'function' && grid) {
                applyFilters();
            }
        }, 200);
    });

    // ── Keyboard navigation ──
    buscaInput.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('.sfi-sr-item');
        if (dropdown.style.display === 'none' || items.length === 0) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const term = buscaInput.value.trim();
                if (term) window.location.href = `shop.html?search=${encodeURIComponent(term)}`;
            }
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, items.length - 1);
            items.forEach((el, i) => el.classList.toggle('sfi-sr-active', i === activeIndex));
            items[activeIndex]?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, -1);
            items.forEach((el, i) => el.classList.toggle('sfi-sr-active', i === activeIndex));
            if (activeIndex >= 0) items[activeIndex]?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0 && items[activeIndex]) {
                window.location.href = items[activeIndex].getAttribute('href');
            } else {
                const term = buscaInput.value.trim();
                if (term) window.location.href = `shop.html?search=${encodeURIComponent(term)}`;
            }
        } else if (e.key === 'Escape') {
            hideDropdown();
            buscaInput.blur();
        }
    });

    // ── Click outside to close ──
    document.addEventListener('click', (e) => {
        if (!buscaInput.contains(e.target) && !dropdown.contains(e.target)) {
            hideDropdown();
        }
    });

    // ── Focus: reopen if has content ──
    buscaInput.addEventListener('focus', () => {
        const term = buscaInput.value.trim();
        if (term.length >= 2) {
            showDropdown(searchProducts(term), term);
        }
    });

    // ── Reposition on scroll/resize ──
    window.addEventListener('scroll', () => { if (dropdown.style.display !== 'none') positionDropdown(); }, { passive: true });
    window.addEventListener('resize', () => { if (dropdown.style.display !== 'none') positionDropdown(); }, { passive: true });

    // ── URL search param ──
    const urlParams = new URLSearchParams(window.location.search);
    const searchParam = urlParams.get('search');
    if (searchParam && buscaInput) {
        buscaInput.value = searchParam;
        if (window.location.pathname.includes('shop') && typeof applyFilters === 'function') {
            setTimeout(() => applyFilters(), 100);
        }
    }
}

// ========= 4 & 5. CARRINHO ===========

function getCarrinho() {
    return JSON.parse(localStorage.getItem('sfi_carrinho') || '[]');
}

function saveCarrinho(arr) {
    localStorage.setItem('sfi_carrinho', JSON.stringify(arr));
    atualizarIconeCarrinho();
}

// NOTA: As funções addToCart, removeFromCart e updateQuantity estão centralizadas em cart.js
// Use window.addToCart(), window.removeFromCart() e window.updateCartQuantity()

function calculateTotal() {
    const carrinho = getCarrinho();
    const subtotal = carrinho.reduce((t, item) => t + item.preco * item.quantidade, 0);
    const isB2B = window._sfiCustomerIsB2B || false;
    const freeMin = isB2B ? 150 : 60;
    const frete = subtotal >= freeMin ? 0 : 9.04;
    const total = subtotal + frete;
    return { subtotal, frete, total };
}

function atualizarIconeCarrinho() {
    // Use the existing cart.js update function
    if (typeof window.updateCartCount === 'function') {
        window.updateCartCount();
    } else {
        // Fallback
        const count = getCarrinho().reduce((a, c) => a + c.quantidade, 0);
        const el = document.querySelector('.cart-count, #cartCount');
        if (el) el.textContent = count;
    }
}

// Toast simples
function showToast(msg) {
    let toast = document.getElementById('toast-sfi');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-sfi';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#00A651;color:#fff;padding:12px 24px;border-radius:8px;z-index:10001;opacity:0;transform:translateY(20px);transition:opacity 0.3s,transform 0.3s;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-size:14px;font-weight:500;';
        toast.setAttribute('aria-atomic', 'true');
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
    }, 3000);
}

// Hero Carousel
let currentSlide = 0;
let carouselInterval = null;
let carouselSlides = [];
let indicators = [];
let prevBtn = null;
let nextBtn = null;
let carouselContainer = null;

function showSlide(index) {
    if (carouselSlides.length === 0) return;

    // Remove active class from all slides and indicators
    carouselSlides.forEach((slide, i) => {
        slide.classList.remove('active');
        slide.setAttribute('aria-hidden', 'true');
    });
    indicators.forEach((indicator, i) => {
        indicator.classList.remove('active');
        indicator.setAttribute('aria-selected', 'false');
        indicator.setAttribute('tabindex', '-1');
    });

    // Add active class to current slide and indicator
    if (carouselSlides[index]) {
        carouselSlides[index].classList.add('active');
        carouselSlides[index].setAttribute('aria-hidden', 'false');
    }
    if (indicators[index]) {
        indicators[index].classList.add('active');
        indicators[index].setAttribute('aria-selected', 'true');
        indicators[index].setAttribute('tabindex', '0');
    }

    currentSlide = index;
}

function nextSlide() {
    if (carouselSlides.length === 0) return;
    const next = (currentSlide + 1) % carouselSlides.length;
    showSlide(next);
}

function prevSlide() {
    if (carouselSlides.length === 0) return;
    const prev = (currentSlide - 1 + carouselSlides.length) % carouselSlides.length;
    showSlide(prev);
}

function startCarousel() {
    if (carouselInterval) {
        clearInterval(carouselInterval);
    }
    carouselInterval = setInterval(nextSlide, 5000); // Change slide every 5 seconds
}

function stopCarousel() {
    if (carouselInterval) {
        clearInterval(carouselInterval);
        carouselInterval = null;
    }
}

// Initialize carousel
function initHeroCarousel() {
    // Re-query elements to ensure they exist
    carouselSlides = document.querySelectorAll('.carousel-slide');
    indicators = document.querySelectorAll('.indicator');
    prevBtn = document.querySelector('.carousel-btn-prev');
    nextBtn = document.querySelector('.carousel-btn-next');
    carouselContainer = document.querySelector('.hero-carousel');

    if (carouselSlides.length === 0) {
        if (_dbg()) console.log('Hero carousel slides not found');
        return;
    }

    if (_dbg()) console.log('Hero carousel initialized:', {
        slides: carouselSlides.length,
        indicators: indicators.length,
        prevBtn: !!prevBtn,
        nextBtn: !!nextBtn,
        container: !!carouselContainer
    });

    // Ensure first slide is active
    showSlide(0);

    // Initialize carousel functionality
    if (carouselSlides.length > 0) {
        // Navigation buttons
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                nextSlide();
                stopCarousel();
                startCarousel();
            });

            // Keyboard navigation
            nextBtn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    nextSlide();
                    stopCarousel();
                    startCarousel();
                }
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                prevSlide();
                stopCarousel();
                startCarousel();
            });

            // Keyboard navigation
            prevBtn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    prevSlide();
                    stopCarousel();
                    startCarousel();
                }
            });
        }

        // Indicators
        indicators.forEach((indicator, index) => {
            indicator.addEventListener('click', () => {
                showSlide(index);
                stopCarousel();
                startCarousel();
            });
        });

        // Pause on hover
        if (carouselContainer) {
            carouselContainer.addEventListener('mouseenter', stopCarousel);
            carouselContainer.addEventListener('mouseleave', startCarousel);
        }

        // Touch swipe support for mobile
        let touchStartX = 0;
        let touchEndX = 0;

        if (carouselContainer) {
            carouselContainer.addEventListener('touchstart', (e) => {
                if (e.touches && e.touches[0]) touchStartX = e.touches[0].screenX;
            });

            carouselContainer.addEventListener('touchend', (e) => {
                if (e.changedTouches && e.changedTouches[0]) {
                    touchEndX = e.changedTouches[0].screenX;
                    handleSwipe();
                }
            });
        }

        function handleSwipe() {
            const swipeThreshold = 50;
            const diff = touchStartX - touchEndX;

            if (Math.abs(diff) > swipeThreshold) {
                if (diff > 0) {
                    // Swipe left - next slide
                    nextSlide();
                } else {
                    // Swipe right - previous slide
                    prevSlide();
                }
                stopCarousel();
                startCarousel();
            }
        }

        // Keyboard navigation - only when carousel is focused
        if (carouselContainer) {
            carouselContainer.setAttribute('tabindex', '0');
            carouselContainer.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    prevSlide();
                    stopCarousel();
                    startCarousel();
                } else if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    nextSlide();
                    stopCarousel();
                    startCarousel();
                } else if (e.key === 'Home') {
                    e.preventDefault();
                    showSlide(0);
                    stopCarousel();
                    startCarousel();
                } else if (e.key === 'End') {
                    e.preventDefault();
                    showSlide(carouselSlides.length - 1);
                    stopCarousel();
                    startCarousel();
                }
            });
        }

        // Start autoplay
        startCarousel();
        carouselContainer.setAttribute('data-hero-carousel-inited', 'true');
    }
}

// Initialize hero carousel when DOM is ready
function initHeroCarouselComplete() {
    initHeroCarousel();
    switchToMobileImages();
}

function initHeroCarouselWhenReady() {
    // Moved to unified DOMContentLoaded — initHeroCarouselComplete() called from there
    initHeroCarouselComplete();
    setTimeout(function () {
        let hero = document.querySelector('.hero-carousel');
        if (carouselSlides.length === 0 && hero && !hero.hasAttribute('data-hero-carousel-inited')) {
            initHeroCarouselComplete();
        }
    }, 150);
}

// Will be called from unified DOMContentLoaded at end of file

// Trocar imagens do banner para mobile/desktop
function switchToMobileImages() {
    const athleteSlide = document.querySelector('.slide-image-athlete-mobile');
    const saleSlide = document.querySelector('.slide-image-sale-mobile');
    const sportsSlide = document.querySelector('.slide-image-sports-mobile');

    const isMobile = window.innerWidth <= 767;

    // Slide 1 - Athlete: usa <img> para máxima resolução (não aplicar background)
    if (athleteSlide && !athleteSlide.querySelector('.hero-banner-img')) {
        const imagePath = 'img/hero-banner-new.webp';
        const imageUrl = `url('${imagePath}')`;
        athleteSlide.style.setProperty('background-image', imageUrl, 'important');
        if (isMobile) {
            athleteSlide.style.setProperty('background-size', 'cover', 'important');
            athleteSlide.style.setProperty('background-position', 'center 0%', 'important');
        } else {
            athleteSlide.style.setProperty('background-size', 'cover', 'important');
            athleteSlide.style.setProperty('background-position', 'center center', 'important');
        }
    }

    // Slide 2 - Sale
    if (saleSlide) {
        const imagePath = isMobile ? 'img/hero-sale-mobile.webp' : 'img/hero-sale.webp';
        const imageUrl = `url('${imagePath}')`;
        saleSlide.style.setProperty('background-image', imageUrl, 'important');
        if (isMobile) {
            saleSlide.style.setProperty('background-size', 'contain', 'important');
            saleSlide.style.setProperty('background-position', 'center 0%', 'important');
        } else {
            saleSlide.style.setProperty('background-size', 'cover', 'important');
            saleSlide.style.setProperty('background-position', 'center center', 'important');
        }
    }

    // Slide 3 - Sports (com data attributes)
    if (sportsSlide) {
        const mobileImg = sportsSlide.getAttribute('data-mobile-img') || 'img/hero-sports-mobile.webp';
        const desktopImg = sportsSlide.getAttribute('data-desktop-img') || 'img/hero-sports.webp';
        const imagePath = isMobile ? mobileImg : desktopImg;
        const imageUrl = `url('${imagePath}')`;

        // Aplicar imediatamente
        sportsSlide.style.setProperty('background-image', imageUrl, 'important');
        if (isMobile) {
            sportsSlide.style.setProperty('background-size', 'contain', 'important');
            sportsSlide.style.setProperty('background-position', 'center 0%', 'important');
        } else {
            sportsSlide.style.setProperty('background-size', 'cover', 'important');
            sportsSlide.style.setProperty('background-position', 'center center', 'important');
        }
    }

    // Corrigir imagem de Swimming - apenas cards de categoria, não links do footer
    // Usar cache para evitar recarregar a mesma imagem múltiplas vezes
    if (!window.swimmingImageCache) {
        window.swimmingImageCache = new Set();
    }

    const swimmingCards = document.querySelectorAll('.categorias-grid .cat-swimming, .categorias-grid .cat-natacao, .categoria-card.cat-swimming, .categoria-card.cat-natacao');
    swimmingCards.forEach(swimmingCard => {
        const bgImg = swimmingCard.getAttribute('data-bg-img') || 'img/cat-swimming.webp';
        const imageUrl = `url('${bgImg}')`;

        // Verificar se já foi processado
        const cardId = swimmingCard.getAttribute('data-card-id') || Math.random().toString(36);
        if (!swimmingCard.hasAttribute('data-card-id')) {
            swimmingCard.setAttribute('data-card-id', cardId);
        }

        // Aplicar imediatamente
        swimmingCard.style.setProperty('background-image', imageUrl, 'important');

        // Verificar se carrega apenas se ainda não foi carregado
        if (!window.swimmingImageCache.has(bgImg)) {
            window.swimmingImageCache.add(bgImg);
            const preloadSwimming = new Image();
            preloadSwimming.src = bgImg;
            preloadSwimming.onload = function () {
                // Apenas logar uma vez por imagem única
                if (window.swimmingImageCache.size === 1 || !window.swimmingImageLogged) {
                    window.swimmingImageLogged = true;
                }
                swimmingCard.style.setProperty('background-image', imageUrl, 'important');
            };
            preloadSwimming.onerror = function () {
                // Tentar caminhos alternativos apenas uma vez
                const altPaths = [
                    `./${bgImg}`,
                    `/${bgImg}`,
                    bgImg.replace('img/', '/img/')
                ];
                let altIndex = 0;
                const tryAltPath = () => {
                    if (altIndex < altPaths.length) {
                        const altImg = new Image();
                        altImg.src = altPaths[altIndex];
                        altImg.onload = function () {
                            swimmingCard.style.setProperty('background-image', `url('${altPaths[altIndex]}')`, 'important');
                        };
                        altImg.onerror = function () {
                            altIndex++;
                            tryAltPath();
                        };
                    }
                };
                tryAltPath();
            };
        }
    });
}

// Executar quando o DOM estiver pronto e ao redimensionar
function initMobileImages() {
    // Trocar imagens imediatamente
    switchToMobileImages();

    // Também trocar ao redimensionar a janela
    window.addEventListener('resize', () => {
        switchToMobileImages();
    });
}

// Mobile images init — called from unified DOMContentLoaded
// (removed standalone readyState check)

// Ajustar animação da barra de benefícios para loop contínuo perfeito
function setupBenefitsAnimation() {
    const benefitsTrack = document.querySelector('.benefits-track');
    if (!benefitsTrack || window.innerWidth > 767) {
        // Remover animação no desktop
        const existingStyle = document.getElementById('benefits-animation-style');
        if (existingStyle) {
            existingStyle.remove();
        }
        return;
    }

    const items = benefitsTrack.querySelectorAll('.benefit-item');
    if (items.length < 8) return; // Precisa ter 8 itens (4 originais + 4 duplicados)

    // Aguardar renderização completa
    setTimeout(() => {
        // Calcular a largura exata dos 4 primeiros itens (originais) incluindo gaps
        let firstFourWidth = 0;
        const gap = parseFloat(getComputedStyle(benefitsTrack).gap) || 0;

        // Calcular usando offsetWidth para maior precisão
        for (let i = 0; i < 4; i++) {
            const item = items[i];
            firstFourWidth += item.offsetWidth;
            if (i < 3) {
                firstFourWidth += gap;
            }
        }

        // Adicionar um pouco mais para garantir que o último item seja completamente visível
        // Adicionar um gap completo extra para dar espaço e evitar travamento no final
        const extraSpace = gap;
        const moveDistance = firstFourWidth + extraSpace;

        // Remover estilo anterior se existir
        const existingStyle = document.getElementById('benefits-animation-style');
        if (existingStyle) {
            existingStyle.remove();
        }

        // Aplicar animação usando pixels para precisão absoluta
        const style = document.createElement('style');
        style.id = 'benefits-animation-style';
        style.textContent = `
            @keyframes scroll-benefits-continuous {
                0% {
                    transform: translateX(0);
                }
                100% {
                    transform: translateX(-${moveDistance}px);
                }
            }
            @media (max-width: 767px) {
                .benefits-track {
                    animation: scroll-benefits-continuous 15s linear infinite !important;
                    will-change: transform !important;
                }
            }
        `;
        document.head.appendChild(style);

        // Forçar reflow
        void benefitsTrack.offsetHeight;
    }, 500);
}

// Benefits animation init — called from unified DOMContentLoaded
// (removed standalone readyState check)

// Reexecutar no resize
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        setupBenefitsAnimation();
    }, 300);
});

// Inicializar scroll centralizado para produtos de categoria (APENAS MOBILE)
function initializeCategoryProductsScroll() {
    // Verificar se está no mobile
    const isMobile = window.innerWidth <= 767;

    if (!isMobile) {
        return; // Não executar no desktop
    }

    const productGrids = document.querySelectorAll('.category-products-grid');

    productGrids.forEach(grid => {
        // Aguardar o layout ser calculado
        const initScroll = () => {
            const firstCard = grid.querySelector('.category-product-card');
            if (firstCard && grid.scrollWidth > grid.clientWidth) {
                const containerWidth = grid.clientWidth;
                const cardWidth = firstCard.offsetWidth;

                // Posição inicial: começar do padding esquerdo (50%) menos metade do card
                const initialScroll = (containerWidth / 2) - (cardWidth / 2);
                grid.scrollLeft = Math.max(0, initialScroll);
            }
        };

        // Tentar múltiplas vezes para garantir que o layout esteja pronto
        setTimeout(initScroll, 50);
        setTimeout(initScroll, 200);
        setTimeout(initScroll, 500);

        // Reexecutar no resize (apenas se ainda estiver no mobile)
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (window.innerWidth <= 767) {
                    initScroll();
                }
            }, 200);
        });
    });
}

// Inicializar scroll centralizado para carrosséis de produtos (APENAS MOBILE)
function initializeProductCarouselsScroll() {
    // Verificar se está no mobile
    const isMobile = window.innerWidth <= 767;

    if (!isMobile) {
        return; // Não executar no desktop
    }

    const productTracks = document.querySelectorAll('.product-carousel-track');

    productTracks.forEach(track => {
        // Aguardar o layout ser calculado
        const initScroll = () => {
            const firstCard = track.querySelector('.product-card');
            if (firstCard && track.scrollWidth > track.clientWidth) {
                const containerWidth = track.clientWidth;
                const cardWidth = firstCard.offsetWidth;

                // Posição inicial: começar do padding esquerdo (50%) menos metade do card
                const initialScroll = (containerWidth / 2) - (cardWidth / 2);
                track.scrollLeft = Math.max(0, initialScroll);
            }
        };

        // Tentar múltiplas vezes para garantir que o layout esteja pronto
        setTimeout(initScroll, 50);
        setTimeout(initScroll, 200);
        setTimeout(initScroll, 500);

        // Reexecutar no resize (apenas se ainda estiver no mobile)
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (window.innerWidth <= 767) {
                    initScroll();
                }
            }, 200);
        });
    });
}
// Category/product scroll init — called from unified DOMContentLoaded
// (removed standalone readyState check)

// Cart functionality
let cartCount = 0;
const cartCountElement = document.querySelector('.cart-count');

// Mobile Menu Toggle
const mobileMenuToggle = document.getElementById('mobileMenuToggle');
const mobileMenu = document.getElementById('mobileMenu');
const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');

function toggleMobileMenu() {
    const isActive = mobileMenu.classList.contains('active');

    if (isActive) {
        mobileMenu.classList.remove('active');
        mobileMenuOverlay.classList.remove('active');
        mobileMenuToggle.classList.remove('active');
        document.body.style.overflow = '';
    } else {
        mobileMenu.classList.add('active');
        mobileMenuOverlay.classList.add('active');
        mobileMenuToggle.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', toggleMobileMenu);
}

if (mobileMenuOverlay) {
    mobileMenuOverlay.addEventListener('click', toggleMobileMenu);
}

// Close mobile menu when clicking on a link (but not subcategory toggles)
if (mobileMenu) {
    const mobileMenuLinks = mobileMenu.querySelectorAll('a.mobile-menu-item, a.mobile-menu-subcategory');
    mobileMenuLinks.forEach(link => {
        link.addEventListener('click', () => {
            toggleMobileMenu();
        });
    });
}

// Mobile menu category toggles (expand/collapse subcategories)
const categoryToggles = document.querySelectorAll('.mobile-menu-category-toggle');
categoryToggles.forEach(toggle => {
    toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const category = toggle.getAttribute('data-category');
        const subcategories = document.getElementById(`subcategory-${category}`);
        const isActive = toggle.classList.contains('active');

        // Close all other categories
        categoryToggles.forEach(otherToggle => {
            if (otherToggle !== toggle) {
                otherToggle.classList.remove('active');
                const otherCategory = otherToggle.getAttribute('data-category');
                const otherSubcategories = document.getElementById(`subcategory-${otherCategory}`);
                if (otherSubcategories) {
                    otherSubcategories.classList.remove('active');
                }
            }
        });

        // Toggle current category
        if (isActive) {
            toggle.classList.remove('active');
            if (subcategories) {
                subcategories.classList.remove('active');
            }
        } else {
            toggle.classList.add('active');
            if (subcategories) {
                subcategories.classList.add('active');
            }
        }
    });
});

// Header scroll effect
let lastScroll = 0;
const header = document.querySelector('header');

window.addEventListener('scroll', () => {
    const currentScroll = window.pageYOffset;

    if (currentScroll > 100) {
        header.classList.add('scrolled');
    } else {
        header.classList.remove('scrolled');
    }

    lastScroll = currentScroll;
});

// Back to Top Button
const backToTopButton = document.getElementById('backToTop');

if (backToTopButton) {
    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 300) {
            backToTopButton.classList.add('visible');
        } else {
            backToTopButton.classList.remove('visible');
        }
    });

    backToTopButton.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

// Add to basket functionality
function initAddToBasketAndUI() {
    if (_dbg()) console.log('Setting up add to basket buttons...');

    // Função auxiliar para aplicar links/add-to-basket usando dados já carregados
    function processProductsData(data) {
        const productCards = document.querySelectorAll('.product-card:not([data-linked])');
        productCards.forEach(card => {
            const productNameElement = card.querySelector('.product-name');
            const productImg = card.querySelector('.product-img');

            if (productNameElement && !productNameElement.querySelector('a')) {
                const productName = productNameElement.textContent.trim();

                // Try to find product ID by name (improved search)
                const normalizedName = productName.toLowerCase().trim();
                let product = null;

                // Strategy 1: Exact match
                product = (Array.isArray(data) ? data : data.produtos).find(p =>
                    p.nome.toLowerCase() === normalizedName
                );

                // Strategy 2: Remove numbers and try again
                if (!product) {
                    const nameWithoutNumbers = normalizedName.replace(/\d+/g, '').trim();
                    product = (Array.isArray(data) ? data : data.produtos).find(p => {
                        const pName = p.nome.toLowerCase().replace(/\d+/g, '').trim();
                        return pName === nameWithoutNumbers;
                    });
                }

                // Strategy 3: Match all words (order independent)
                if (!product) {
                    const searchWords = normalizedName.split(/\s+/).filter(w => w.length > 2);
                    product = (Array.isArray(data) ? data : data.produtos).find(p => {
                        const pName = p.nome.toLowerCase();
                        return searchWords.every(word => pName.includes(word));
                    });
                }

                // Strategy 4: Match at least 2 key words
                if (!product) {
                    const searchWords = normalizedName.split(/\s+/).filter(w => w.length > 2);
                    if (searchWords.length >= 2) {
                        product = (Array.isArray(data) ? data : data.produtos).find(p => {
                            const pName = p.nome.toLowerCase();
                            const matchCount = searchWords.filter(word => pName.includes(word)).length;
                            return matchCount >= 2;
                        });
                    }
                }

                // Strategy 5: Match first 2-3 words
                if (!product) {
                    const nameWords = normalizedName.split(' ').slice(0, 3);
                    const searchPattern = nameWords.join(' ');
                    product = (Array.isArray(data) ? data : data.produtos).find(p => {
                        const pName = p.nome.toLowerCase();
                        return pName.includes(searchPattern) || searchPattern.includes(pName.split(' ').slice(0, 3).join(' '));
                    });
                }

                // Strategy 6: Match brand name (first word)
                if (!product && normalizedName.split(' ').length > 0) {
                    const firstWord = normalizedName.split(' ')[0];
                    if (firstWord.length > 2) {
                        product = (Array.isArray(data) ? data : data.produtos).find(p =>
                            p.nome.toLowerCase().startsWith(firstWord) ||
                            p.nome.toLowerCase().includes(firstWord)
                        );
                    }
                }

                // Strategy 7: Match any significant word
                if (!product) {
                    const significantWords = normalizedName.split(' ').filter(w => w.length > 3);
                    for (const word of significantWords) {
                        product = (Array.isArray(data) ? data : data.produtos).find(p =>
                            p.nome.toLowerCase().includes(word)
                        );
                        if (product) break;
                    }
                }

                if (product) {
                    // Add link to image
                    if (productImg && !productImg.closest('a')) {
                        const imgLink = document.createElement('a');
                        imgLink.href = `produto.html?id=${product.id}`;
                        imgLink.style.display = 'block';
                        productImg.parentNode.insertBefore(imgLink, productImg);
                        imgLink.appendChild(productImg);
                    }

                    // Add link to product name
                    const nameLink = document.createElement('a');
                    nameLink.href = `produto.html?id=${product.id}`;
                    nameLink.textContent = productName;
                    productNameElement.innerHTML = '';
                    productNameElement.appendChild(nameLink);

                    // Add data-product-id to button and data-id on card (para delegação global do carrinho)
                    const basketButton = card.querySelector('.btn-basket');
                    if (basketButton) {
                        basketButton.setAttribute('data-product-id', product.id);
                    }
                    card.setAttribute('data-id', product.id);
                    // Mark card as linked
                    card.setAttribute('data-linked', 'true');
                }
            }
        });
    }

    // Se estivermos em file:// e tivermos EMBEDDED_PRODUCTS, evitar fetch/XHR (evita CORS)
    if (window.location.protocol === 'file:' && Array.isArray(window.EMBEDDED_PRODUCTS)) {
        processProductsData({ produtos: window.EMBEDDED_PRODUCTS });
        return;
    }

    // Caso normal (servido via HTTP/HTTPS): usar fetch
    fetch('js/dados.json')
        .then(response => response.json())
        .then(data => {
            processProductsData(data);
        })
        .catch(error => {
            console.error('Error fetching products for links:', error);
        });

    // Only add listeners on pages that don't have their own cart system (not shop.html or offers.html)
    const isShopPage = window.location.pathname.includes('shop.html');
    const isOffersPage = window.location.pathname.includes('offers.html');

    if (isShopPage || isOffersPage) {
        if (_dbg()) console.log('Shop/Offers page detected, skipping main.js cart listeners');
        return; // Let shop.js/offers.js handle their own buttons
    }

    const addToBasketButtons = document.querySelectorAll('.btn-basket');
    if (_dbg()) console.log('Found', addToBasketButtons.length, 'add to basket buttons');

    addToBasketButtons.forEach(button => {
        // Skip if button already has a listener (from shop.js or offers.js)
        if (button.hasAttribute('data-listener-attached')) {
            return;
        }
        button.setAttribute('data-listener-attached', 'true');

        button.addEventListener('click', function (e) {
            e.stopPropagation();
            if (this.closest('form')) e.preventDefault();

            const productId = this.getAttribute('data-product-id');
            if (productId && typeof window.addToCart === 'function') {
                window.addToCart(parseInt(productId, 10));
            } else if (productId) {
                // Fallback if cart.js not loaded yet
                const id = parseInt(productId, 10);
                let cart = JSON.parse(localStorage.getItem('cart') || '[]');
                const existing = cart.find(item => item.id === id);
                if (existing) {
                    existing.quantidade = (existing.quantidade || 1) + 1;
                } else {
                    const card = this.closest('.product-card');
                    const name = card?.querySelector('.product-name')?.textContent?.trim() || 'Product';
                    const priceEl = card?.querySelector('.new-price');
                    const price = priceEl ? parseFloat(priceEl.textContent.replace(/[^\d.]/g, '')) || 0 : 0;
                    cart.push({ id: id, nome: name, preco: price, imagem: '', quantidade: 1 });
                }
                localStorage.setItem('cart', JSON.stringify(cart));
                // Update count manually
                const total = cart.reduce((s, i) => s + (i.quantidade || 1), 0);
                document.querySelectorAll('.cart-count').forEach(el => { el.textContent = total; });
            }

            // Visual feedback
            const originalText = this.textContent;
            this.textContent = '✓ ADDED';
            this.style.background = '#00A651';
            setTimeout(() => { this.textContent = originalText; this.style.background = ''; }, 2000);
        });
    });

    // Event delegation for dynamically added buttons
    document.addEventListener('click', function (e) {
        const button = e.target.closest('.btn-basket');
        if (button && !button.hasAttribute('data-listener-attached')) {
            e.stopPropagation();
            button.setAttribute('data-listener-attached', 'true');
            const productId = button.getAttribute('data-product-id');
            if (productId && typeof window.addToCart === 'function') {
                window.addToCart(parseInt(productId, 10));
                // Visual feedback
                const originalText = button.textContent;
                button.textContent = '✓ ADDED';
                button.style.background = '#00A651';
                setTimeout(() => { button.textContent = originalText; button.style.background = ''; }, 2000);
            }
        }
    });

    // Wishlist toggle
    const wishlistIcons = document.querySelectorAll('.wishlist-icon');
    wishlistIcons.forEach(icon => {
        icon.addEventListener('click', function (e) {
            e.stopPropagation();
            this.classList.toggle('active');
            if (this.classList.contains('active')) {
                if (_dbg()) console.log('Added to wishlist');
            } else {
                if (_dbg()) console.log('Removed from wishlist');
            }
        });
    });

    // Newsletter form handling
    const newsletterForms = document.querySelectorAll('.newsletter-form, .footer-newsletter');
    newsletterForms.forEach(form => {
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            const emailInput = this.querySelector('input[type="email"]');
            const email = emailInput.value;

            if (email) {
                if (_dbg()) console.log('Newsletter subscription:', email);

                // Visual feedback
                const submitButton = this.querySelector('button[type="submit"]');
                const originalText = submitButton.textContent;
                submitButton.textContent = '✓ SUBSCRIBED!';
                submitButton.style.background = '#00A651';

                setTimeout(() => {
                    submitButton.textContent = originalText;
                    submitButton.style.background = '';
                    this.reset();
                }, 2000);
            }
        });
    });

    // Lazy loading images
    const images = document.querySelectorAll('img[loading="lazy"]');
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.classList.add('loaded');
                    observer.unobserve(img);
                }
            });
        });

        images.forEach(img => imageObserver.observe(img));
    } else {
        // Fallback for older browsers
        images.forEach(img => img.classList.add('loaded'));
    }

    // Product Carousels
    initProductCarousels();
}

// Product Carousel Functionality (DESKTOP e MOBILE)
function initProductCarousels() {
    const carousels = document.querySelectorAll('.product-carousel-wrapper');

    if (carousels.length === 0) {
        if (_dbg()) console.log('No carousels found');
        return;
    }

    if (_dbg()) console.log(`Found ${carousels.length} carousels`);

    const isMobile = window.innerWidth <= 767;

    // On mobile, skip JS carousel completely - use pure CSS scroll (like category grids)
    if (isMobile) {
        carousels.forEach((wrapper) => {
            const track = wrapper.querySelector('.product-carousel-track');
            const prevBtn = wrapper.querySelector('.product-carousel-prev');
            const nextBtn = wrapper.querySelector('.product-carousel-next');

            // Hide buttons on mobile
            if (prevBtn) prevBtn.style.cssText = 'display: none !important;';
            if (nextBtn) nextBtn.style.cssText = 'display: none !important;';

            // Reset any inline styles that may interfere with CSS scroll
            if (track) {
                track.style.cssText = '';
                track.querySelectorAll('.product-card').forEach(card => {
                    card.style.cssText = '';
                });
            }
        });
        if (_dbg()) console.log('Mobile: skipping JS carousels, using CSS scroll');
        return;
    }

    carousels.forEach((wrapper, wrapperIndex) => {
        const carouselId = wrapper.getAttribute('data-carousel') || `carousel-${wrapperIndex}`;
        const track = wrapper.querySelector('.product-carousel-track');
        let prevBtn = wrapper.querySelector('.product-carousel-prev');
        let nextBtn = wrapper.querySelector('.product-carousel-next');
        const cards = track ? track.querySelectorAll('.product-card') : [];

        if (_dbg()) console.log(`Carousel ${wrapperIndex} (${carouselId}):`, {
            hasTrack: !!track,
            hasPrevBtn: !!prevBtn,
            hasNextBtn: !!nextBtn,
            cardsCount: cards.length,
            wrapperElement: wrapper
        });

        if (!track || !cards.length) {
            if (_dbg()) console.warn(`Carousel ${wrapperIndex} (${carouselId}) missing track or cards`, { track, cardsCount: cards.length });
            return;
        }

        if (!prevBtn || !nextBtn) {
            if (_dbg()) console.warn(`Carousel ${wrapperIndex} (${carouselId}) missing buttons`, { prevBtn, nextBtn });
            return;
        }

        // Ensure buttons are visible BEFORE attaching listeners
        if (prevBtn) {
            prevBtn.style.cssText += 'display: flex !important; opacity: 1 !important; visibility: visible !important; pointer-events: auto !important; position: absolute !important; z-index: 1001 !important;';
        }
        if (nextBtn) {
            nextBtn.style.cssText += 'display: flex !important; opacity: 1 !important; visibility: visible !important; pointer-events: auto !important; position: absolute !important; z-index: 1001 !important;';
        }

        let currentIndex = 0;

        function calculateDimensions() {
            // Esperar layout estar pronto
            if (cards.length === 0) return { cardWidth: 0, gap: 0, cardWidthWithGap: 0, visibleCards: 0, maxIndex: 0 };

            const isMobile = window.innerWidth <= 767;
            const firstCard = cards[0];

            const trackStyle = getComputedStyle(track);
            const gap = parseInt(trackStyle.gap) || parseInt(trackStyle.columnGap) || 8;

            let cardWidth;

            if (isMobile) {
                // No mobile usamos uma largura fixa aproximada
                cardWidth = 240;
            } else {
                // No desktop medimos a largura real do card
                void firstCard.offsetWidth;
                const cardRect = firstCard.getBoundingClientRect();
                cardWidth = cardRect.width || firstCard.offsetWidth || 300;
            }

            const cardWidthWithGap = cardWidth + gap;
            // Forçar um número fixo de cards visíveis para garantir movimento do carrossel
            const visibleCards = isMobile ? 1 : Math.min(3, cards.length);
            const maxIndex = Math.max(0, cards.length - visibleCards);

            return { cardWidth, gap, cardWidthWithGap, visibleCards, maxIndex };
        }

        function updateCarousel() {
            const { cardWidthWithGap, maxIndex, visibleCards, cardWidth } = calculateDimensions();

            if (cardWidthWithGap === 0) {
                // Retry after a short delay if dimensions aren't ready
                setTimeout(updateCarousel, 100);
                return;
            }

            // Ensure currentIndex is within bounds
            if (currentIndex > maxIndex) {
                currentIndex = maxIndex;
            }
            if (currentIndex < 0) {
                currentIndex = 0;
            }

            const translateX = -currentIndex * cardWidthWithGap;

            // On mobile, use native scroll instead of transforms
            if (isMobile) {
                track.style.transform = 'none';
                track.style.webkitTransform = 'none';
                track.style.overflowX = 'auto';
                track.style.width = '100%';
                track.style.minWidth = '100%';
                track.scrollTo({ left: currentIndex * cardWidthWithGap, behavior: 'smooth' });
            } else {
                // Apply transform with hardware acceleration for desktop
                track.style.transform = `translate3d(${translateX}px, 0, 0)`;
                track.style.webkitTransform = `translate3d(${translateX}px, 0, 0)`;
                track.style.willChange = 'transform';
                track.style.overflowX = 'visible';
                track.style.overflowY = 'hidden';
                track.style.width = 'auto';
                track.style.minWidth = 'max-content';
            }
            track.style.visibility = 'visible';
            track.style.opacity = '1';

            // On mobile, don't apply inline styles that interfere with native scroll
            if (!isMobile) {
                // Ensure all cards are visible and properly rendered (desktop only)
                cards.forEach((card, index) => {
                    // Force visibility and prevent shrinking
                    card.style.opacity = '1';
                    card.style.visibility = 'visible';
                    card.style.display = 'flex';
                    card.style.flexShrink = '0';
                    card.style.position = 'relative';
                    card.style.zIndex = '1';
                    card.style.transform = 'translateZ(0)';
                    card.style.webkitTransform = 'translateZ(0)';
                    card.style.overflow = 'visible';

                    // Force rendering of all child elements
                    const img = card.querySelector('img');
                    if (img) {
                        img.style.opacity = '1';
                        img.style.visibility = 'visible';
                        img.style.display = 'block';
                        img.style.width = '100%';
                        img.style.height = 'auto';
                    }

                    // Force rendering of text elements
                    const textElements = card.querySelectorAll('h3, .product-name, .product-prices, .btn-basket, a');
                    textElements.forEach(el => {
                        el.style.opacity = '1';
                        el.style.visibility = 'visible';
                        if (el.tagName === 'BUTTON') {
                            el.style.display = 'block';
                        }
                    });
                });

                // Force multiple reflows to ensure everything is rendered
                void track.offsetHeight;
                void track.offsetWidth;
                void cards[0]?.offsetHeight;

                // Update button states (desktop only) - visual only, never disable
                if (prevBtn) {
                    // Não desabilitar, apenas mudar opacidade visual
                    prevBtn.style.opacity = currentIndex === 0 ? '0.3' : '1';
                    prevBtn.setAttribute('aria-disabled', currentIndex === 0);
                    // Garantir que o botão sempre pode ser clicado
                    prevBtn.disabled = false;
                    prevBtn.style.pointerEvents = 'auto';
                }
                if (nextBtn) {
                    // Não desabilitar, apenas mudar opacidade visual
                    nextBtn.style.opacity = currentIndex >= maxIndex ? '0.3' : '1';
                    nextBtn.setAttribute('aria-disabled', currentIndex >= maxIndex);
                    // Garantir que o botão sempre pode ser clicado
                    nextBtn.disabled = false;
                    nextBtn.style.pointerEvents = 'auto';
                }
            }

        }

        // Navegação via índice: usamos translate3d no track
        function nextSlide() {
            const { maxIndex } = calculateDimensions();
            if (currentIndex < maxIndex) {
                currentIndex++;
                updateCarousel();
            }
        }

        function prevSlide() {
            if (currentIndex > 0) {
                currentIndex--;
                updateCarousel();
            }
        }

        // Botões funcionam em todas as larguras de tela
        if (nextBtn) {
            nextBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (_dbg()) console.log(`Next button clicked for carousel ${carouselId}`);
                nextSlide();
            });
            if (_dbg()) console.log(`Next button listener attached for ${carouselId}`, nextBtn);
        } else {
            if (_dbg()) console.warn(`Next button not found in carousel ${carouselId}`, wrapperIndex);
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (_dbg()) console.log(`Prev button clicked for carousel ${carouselId}`);
                prevSlide();
            });
            if (_dbg()) console.log(`Prev button listener attached for ${carouselId}`, prevBtn);
        } else {
            if (_dbg()) console.warn(`Prev button not found in carousel ${carouselId}`, wrapperIndex);
        }

        // Recalculate on resize
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                const isMobileDevice = window.innerWidth <= 767;
                if (isMobileDevice) {
                    // On mobile, just update visibility
                    updateCarousel();
                    // Hide buttons on mobile
                    if (prevBtn) prevBtn.style.display = 'none';
                    if (nextBtn) nextBtn.style.display = 'none';
                } else {
                    // On desktop, recalculate dimensions
                    const { maxIndex } = calculateDimensions();
                    if (currentIndex > maxIndex) {
                        currentIndex = maxIndex;
                    }
                    updateCarousel();
                    // Show buttons on desktop
                    if (prevBtn) prevBtn.style.display = 'flex';
                    if (nextBtn) nextBtn.style.display = 'flex';
                }
            }, 250);
        });

        // Initial update - wait for images to load
        const initCarousel = () => {
            setTimeout(() => {
                if (_dbg()) console.log(`Initializing carousel ${carouselId}`);
                const isMobileDevice = window.innerWidth <= 767;
                updateCarousel();
                // Only show buttons on desktop
                if (!isMobileDevice) {
                    if (prevBtn) {
                        prevBtn.style.cssText += 'display: flex !important; opacity: 1 !important; visibility: visible !important; pointer-events: auto !important; position: absolute !important; z-index: 1001 !important;';
                    }
                    if (nextBtn) {
                        nextBtn.style.cssText += 'display: flex !important; opacity: 1 !important; visibility: visible !important; pointer-events: auto !important; position: absolute !important; z-index: 1001 !important;';
                    }
                } else {
                    // Hide buttons on mobile
                    if (prevBtn) prevBtn.style.display = 'none';
                    if (nextBtn) nextBtn.style.display = 'none';
                }
            }, 100);

            // Retry initialization after a longer delay to ensure everything is loaded
            setTimeout(() => {
                const { maxIndex } = calculateDimensions();
                if (maxIndex >= 0) {
                    updateCarousel();
                    // Ensure buttons are still visible and functional
                    if (prevBtn) {
                        prevBtn.style.cssText += 'display: flex !important; opacity: 1 !important; visibility: visible !important; pointer-events: auto !important; position: absolute !important; z-index: 1001 !important;';
                    }
                    if (nextBtn) {
                        nextBtn.style.cssText += 'display: flex !important; opacity: 1 !important; visibility: visible !important; pointer-events: auto !important; position: absolute !important; z-index: 1001 !important;';
                    }
                }
            }, 500);
        };

        // Initialize immediately (script has defer, DOM is already parsed)
        initCarousel();

        // Also try to initialize on window load as a fallback
        window.addEventListener('load', () => {
            setTimeout(() => {
                if (_dbg()) console.log(`Window load - reinitializing carousel ${carouselId}`);
                updateCarousel();
            }, 200);
        });
    });
}

// Initialize search functionality
function initSearchFunctionality() {
    // Inicializar busca imediatamente para que o Enter funcione
    initBuscaLive();

    // Adicionar evento ao botão de pesquisa
    const searchBtn = document.getElementById('searchBtn');
    const buscaInput = document.getElementById('busca');

    if (searchBtn && buscaInput) {
        searchBtn.addEventListener('click', function (e) {
            e.preventDefault();
            const termo = buscaInput.value.trim();
            if (termo) {
                window.location.href = `shop.html?search=${encodeURIComponent(termo)}`;
            } else if (window.location.pathname.includes('shop.html')) {
                // Se já está na shop e não há termo, recarregar sem filtro
                window.location.href = 'shop.html';
            }
        });
    }

    // Carregar produtos e reinicializar busca
    carregarProdutos().then(() => {
        // Reinicializar busca após produtos carregados (para busca em tempo real)
        const buscaInputReload = document.getElementById('busca');
        if (buscaInputReload) {
            buscaInputReload.removeAttribute('data-search-initialized');
        }
        initBuscaLive();
    });
}



// ============================================================
// WISHLIST FUNCTIONALITY
// ============================================================

const WISHLIST_KEY = 'sfi_wishlist';

function getWishlist() {
    return JSON.parse(localStorage.getItem(WISHLIST_KEY) || '[]');
}

function saveWishlist(wishlist) {
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
    updateWishlistUI();
}

function toggleWishlist(productId) {
    let wishlist = getWishlist();
    const index = wishlist.indexOf(productId);

    if (index > -1) {
        // Remove from wishlist
        wishlist.splice(index, 1);
        showNotification('Removed from wishlist', 'info');
    } else {
        // Add to wishlist
        wishlist.push(productId);
        showNotification('Added to wishlist! ♡', 'success');
    }

    saveWishlist(wishlist);
    return wishlist.includes(productId);
}

function isInWishlist(productId) {
    return getWishlist().includes(productId);
}

function updateWishlistUI() {
    const wishlist = getWishlist();

    // Update all wishlist icons on the page
    document.querySelectorAll('.wishlist-icon').forEach(icon => {
        const card = icon.closest('.product-card');
        if (card) {
            const productId = parseInt(card.dataset.id);
            if (wishlist.includes(productId)) {
                icon.classList.add('active');
                icon.innerHTML = '♥';
            } else {
                icon.classList.remove('active');
                icon.innerHTML = '♡';
            }
        }
    });
}

// ============================================================
// WISHLIST PAGE RENDERING (wishlist.html)
// ============================================================

function renderWishlistPage() {
    const wishlistGrid = document.getElementById('wishlistGrid');
    const wishlistEmpty = document.getElementById('wishlistEmpty');
    const wishlistActions = document.getElementById('wishlistActions');
    const wishlistCount = document.getElementById('wishlistCount');

    // Only run on wishlist.html page
    if (!wishlistGrid) return;

    const wishlist = getWishlist();

    // Normalize wishlist IDs to numbers
    const wishlistIds = wishlist.map(id => typeof id === 'string' ? parseInt(id, 10) : id).filter(id => !isNaN(id));

    // Update count
    if (wishlistCount) {
        wishlistCount.textContent = wishlistIds.length;
    }

    if (wishlistIds.length === 0) {
        // Show empty state
        if (wishlistEmpty) wishlistEmpty.style.display = 'block';
        wishlistGrid.style.display = 'none';
        if (wishlistActions) wishlistActions.style.display = 'none';
        return;
    }

    // Hide empty state, show grid
    if (wishlistEmpty) wishlistEmpty.style.display = 'none';
    wishlistGrid.style.display = 'grid';
    if (wishlistActions) wishlistActions.style.display = 'flex';

    // Get products data and render
    if (typeof PRODUTOS !== 'undefined' && PRODUTOS.length > 0) {
        renderWishlistProducts(wishlistIds, PRODUTOS);
    } else {
        // Load products from dados.json
        fetch('js/dados.json')
            .then(res => res.json())
            .then(data => {
                const produtos = data.produtos || data;
                renderWishlistProducts(wishlistIds, produtos);
            })
            .catch(err => {
                console.error('Error loading products for wishlist:', err);
                wishlistGrid.innerHTML = '<p style="text-align:center;color:#666;">Error loading wishlist products.</p>';
            });
    }
}

function renderWishlistProducts(wishlistIds, produtos) {
    const wishlistGrid = document.getElementById('wishlistGrid');
    if (!wishlistGrid) return;

    // Filter products that are in wishlist
    const wishlistProducts = produtos.filter(p => wishlistIds.includes(p.id));

    if (wishlistProducts.length === 0) {
        wishlistGrid.innerHTML = '<p style="text-align:center;color:#666;grid-column:1/-1;">No products found.</p>';
        return;
    }

    // Usar createProductCardHTML para manter slider de imagens consistente
    wishlistGrid.innerHTML = wishlistProducts.map(prod => {
        if (typeof createProductCardHTML === 'function') {
            // Usar o template unificado (inclui data-images e dots do slider)
            let cardHTML = createProductCardHTML(prod);
            // Injetar classe wishlist-item e botão de remover
            cardHTML = cardHTML.replace(
                '<article class="product-card"',
                '<article class="product-card wishlist-item"'
            );
            // Inserir botão de remover logo após a abertura do article
            cardHTML = cardHTML.replace(
                /(<article[^>]*>)/,
                `$1\n            <button class="wishlist-remove" onclick="removeFromWishlistPage(${prod.id})" title="Remove from wishlist">×</button>`
            );
            return cardHTML;
        }
        // Fallback caso createProductCardHTML não esteja disponível
        const imagePath = typeof getCardProductImage === 'function'
            ? getCardProductImage(prod.imagem, prod.id)
            : (prod.imagem && prod.imagem.startsWith('img/') ? prod.imagem : 'img/' + (prod.imagem || 'produto1.jpg'));
        const safeName = (prod.nome || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeBrand = (prod.marca || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `
        <article class="product-card wishlist-item" data-id="${prod.id}" data-product-id="${prod.id}">
            <button class="wishlist-remove" onclick="removeFromWishlistPage(${prod.id})" title="Remove from wishlist">×</button>
            <a href="produto.html?id=${prod.id}">
                <img src="${imagePath}" alt="${safeName}" class="product-img" loading="lazy" onerror="this.onerror=null;this.src='img/produto1.jpg'">
            </a>
            <h3 class="product-name">
                <a href="produto.html?id=${prod.id}">${safeName}</a>
            </h3>
            ${safeBrand ? `<span class="product-brand">${safeBrand}</span>` : ''}
            <div class="product-prices">
                ${prod.preco_antigo && prod.preco_antigo > prod.preco ? `<span class="old-price">€${prod.preco_antigo.toFixed(2)}</span>` : ''}
                <span class="new-price">€${prod.preco.toFixed(2)}</span>
            </div>
            <button class="btn-basket" data-product-id="${prod.id}">ADD TO BASKET</button>
        </article>
    `;
    }).join('');
}

function removeFromWishlistPage(productId) {
    let wishlist = getWishlist();
    wishlist = wishlist.filter(id => {
        const numId = typeof id === 'string' ? parseInt(id, 10) : id;
        return numId !== productId;
    });
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
    showNotification('Removed from wishlist', 'info');
    renderWishlistPage(); // Re-render
}

function clearWishlist() {
    if (confirm('Are you sure you want to clear your entire wishlist?')) {
        localStorage.setItem(WISHLIST_KEY, '[]');
        showNotification('Wishlist cleared', 'info');
        renderWishlistPage();
    }
}

function addAllToCart() {
    const wishlist = getWishlist();
    if (wishlist.length === 0) return;

    wishlist.forEach(id => {
        const numId = typeof id === 'string' ? parseInt(id, 10) : id;
        if (typeof window.addToCart === 'function') {
            window.addToCart(numId, 1);
        }
    });
    showNotification(`Added ${wishlist.length} items to cart!`, 'success');
}

// Wishlist page init — called from unified DOMContentLoaded
function initWishlistPage() {
    if (document.getElementById('wishlistGrid')) {
        renderWishlistPage();
    }
}

// Initialize wishlist icons click handler
document.addEventListener('click', function (e) {
    if (e.target.closest('.wishlist-icon')) {
        e.preventDefault();
        e.stopPropagation();

        const icon = e.target.closest('.wishlist-icon');
        const card = icon.closest('.product-card');

        if (card) {
            const productId = parseInt(card.dataset.id || icon.getAttribute('data-product-id') || card.querySelector('[data-product-id]')?.getAttribute('data-product-id') || '0', 10);
            if (productId) {
                toggleWishlist(productId);
                icon.classList.toggle('active', isInWishlist(productId));
                if (!icon.querySelector('.wishlist-heart-img')) {
                    icon.innerHTML = isInWishlist(productId) ? '♥' : '♡';
                }
            }
        }
    }
});

// ============================================================
// RECENTLY VIEWED FUNCTIONALITY
// ============================================================

const RECENTLY_VIEWED_KEY = 'sfi_recently_viewed';
const MAX_RECENT_ITEMS = 10;

function addToRecentlyViewed(productId) {
    if (!productId) return;

    let recent = JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) || '[]');

    // Remove if already exists (to move to front)
    recent = recent.filter(id => id !== productId);

    // Add to beginning
    recent.unshift(productId);

    // Limit to max items
    recent = recent.slice(0, MAX_RECENT_ITEMS);

    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(recent));
}

function getRecentlyViewed() {
    return JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) || '[]');
}

function renderRecentlyViewed() {
    const container = document.getElementById('recentlyViewedProducts');
    const section = document.getElementById('recentlyViewedSection');

    if (!container || !section) return;

    const recentIds = getRecentlyViewed();

    if (recentIds.length === 0 || !PRODUTOS || PRODUTOS.length === 0) {
        section.style.display = 'none';
        return;
    }

    const recentProducts = PRODUTOS.filter(p => recentIds.includes(p.id));

    if (recentProducts.length > 0) {
        section.style.display = 'block';

        container.innerHTML = recentProducts.slice(0, 6).map(prod => {
            if (typeof createProductCardHTML === 'function') {
                return createProductCardHTML(prod);
            }
            return `
            <article class="product-card" data-id="${prod.id}">
                ${prod.desconto > 0 ? `<span class="badge-desconto">-${prod.desconto}%</span>` : ''}
                <a href="produto.html?id=${prod.id}">
                    <img src="${getProductImage(prod.imagem, prod.id)}" alt="${prod.nome}" class="product-img" loading="lazy" onerror="this.src='img/produto1.jpg'">
                </a>
                <h3 class="product-name">
                    <a href="produto.html?id=${prod.id}">${prod.nome}</a>
                </h3>
                <div class="product-prices">
                    ${prod.preco_antigo ? `<span class="old-price">€${prod.preco_antigo.toFixed(2)}</span>` : ''}
                    <span class="new-price">€${prod.preco.toFixed(2)}</span>
                </div>
                <button class="btn-basket" data-product-id="${prod.id}">ADD TO BASKET</button>
            </article>`;
        }).join('');
    } else {
        section.style.display = 'none';
    }
}

// Track product views
function trackProductView() {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = parseInt(urlParams.get('id'));

    if (productId && window.location.pathname.includes('produto.html')) {
        addToRecentlyViewed(productId);
    }
}

// ============================================================
// NOTIFICATION SYSTEM (unified — see TOAST NOTIFICATION SYSTEM below)
// ============================================================
// showNotification() is now defined once at line ~3058 with icon support

// ============================================================
// INITIALIZE ON PAGE LOAD — called from unified DOMContentLoaded
// ============================================================
function initPageLoadFeatures() {
    trackProductView();
    setTimeout(updateWishlistUI, 500);
    setTimeout(renderRecentlyViewed, 1000);
}


// ============================================
// QUICK VIEW MODAL FUNCTIONALITY
// ============================================

let currentQuickViewProduct = null;

function openQuickView(productId) {
    // Try to find product in the global products array or fetch from data
    let product = null;

    // Check PRODUTOS (main.js homepage)
    if (typeof PRODUTOS !== 'undefined' && Array.isArray(PRODUTOS)) {
        product = PRODUTOS.find(p => p.id == productId);
    }
    // Check products (shop.js)
    if (!product && typeof products !== 'undefined' && Array.isArray(products)) {
        product = products.find(p => p.id == productId);
    }
    // Check window.allProducts / EMBEDDED_PRODUCTS
    if (!product && typeof window.allProducts !== 'undefined') {
        product = window.allProducts.find(p => p.id == productId);
    }
    if (!product && Array.isArray(window.EMBEDDED_PRODUCTS)) {
        product = window.EMBEDDED_PRODUCTS.find(p => p.id == productId);
    }

    if (!product) {
        if (_dbg()) console.warn('Product not found for Quick View:', productId);
        // Redirect to product page as fallback
        window.location.href = `produto.html?id=${productId}`;
        return;
    }

    currentQuickViewProduct = product;

    // Populate modal
    const modal = document.getElementById('quickViewModal');
    document.getElementById('qvImage').src = getProductImage(product.imagem, product.id);
    document.getElementById('qvImage').alt = product.nome;
    document.getElementById('qvBrand').textContent = product.marca || '';
    document.getElementById('qvTitle').textContent = product.nome;
    document.getElementById('qvPrice').textContent = `€${product.preco.toFixed(2)}`;
    document.getElementById('qvDescription').textContent = product.descricao || 'No description available.';
    document.getElementById('qvFullLink').href = `produto.html?id=${product.id}`;
    document.getElementById('qvQuantity').value = 1;

    // Handle old price and discount
    const oldPriceEl = document.getElementById('qvOldPrice');
    const discountEl = document.getElementById('qvDiscount');

    if (product.preco_antigo && product.preco_antigo > product.preco) {
        oldPriceEl.textContent = `€${product.preco_antigo.toFixed(2)}`;
        oldPriceEl.style.display = 'inline';
        const discountPercent = Math.round((1 - product.preco / product.preco_antigo) * 100);
        discountEl.textContent = `-${discountPercent}%`;
        discountEl.style.display = 'inline';
    } else {
        oldPriceEl.style.display = 'none';
        discountEl.style.display = 'none';
    }

    // Handle stock status
    const stockEl = document.getElementById('qvStock');
    if (product.stock === 0) {
        stockEl.className = 'qv-stock out-of-stock';
        stockEl.querySelector('.stock-text').textContent = 'Out of Stock';
    } else if (product.stock && product.stock < 5) {
        stockEl.className = 'qv-stock low-stock';
        stockEl.querySelector('.stock-text').textContent = `Only ${product.stock} left!`;
    } else {
        stockEl.className = 'qv-stock in-stock';
        stockEl.querySelector('.stock-text').textContent = 'In Stock';
    }

    // Update wishlist button state
    const wishlistBtn = document.getElementById('qvWishlist');
    if (typeof isInWishlist === 'function' && isInWishlist(product.id)) {
        wishlistBtn.classList.add('active');
        wishlistBtn.innerHTML = '♥';
    } else {
        wishlistBtn.classList.remove('active');
        wishlistBtn.innerHTML = '♡';
    }

    // Show modal
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeQuickView() {
    const modal = document.getElementById('quickViewModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        currentQuickViewProduct = null;
    }
}

function updateQvQuantity(change) {
    const input = document.getElementById('qvQuantity');
    let value = parseInt(input.value) + change;
    if (value < 1) value = 1;
    if (value > 99) value = 99;
    input.value = value;
}

function addToCartFromQuickView() {
    if (!currentQuickViewProduct) return;
    const quantity = parseInt(document.getElementById('qvQuantity').value) || 1;
    if (typeof window.addToCart === 'function') {
        const p = currentQuickViewProduct;
        window.addToCart(p.id, quantity, {
            nome: p.nome,
            preco: p.preco,
            preco_antigo: p.preco_antigo,
            imagem: p.imagem
        });
        if (typeof showNotification === 'function') {
            showNotification(`Added ${quantity}x ${p.nome} to cart!`, 'success');
        } else if (typeof showToast === 'function') {
            showToast('Added to cart!');
        }
        closeQuickView();
    }
}

function toggleWishlistFromQuickView() {
    if (!currentQuickViewProduct) return;

    const wishlistBtn = document.getElementById('qvWishlist');

    if (typeof toggleWishlist === 'function') {
        toggleWishlist(currentQuickViewProduct.id);

        // Update button state
        if (typeof isInWishlist === 'function' && isInWishlist(currentQuickViewProduct.id)) {
            wishlistBtn.classList.add('active');
            wishlistBtn.innerHTML = '♥';
        } else {
            wishlistBtn.classList.remove('active');
            wishlistBtn.innerHTML = '♡';
        }
    }
}

// Close modal on Escape key
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        closeQuickView();
    }
});


// ============================================
// RECENTLY VIEWED PRODUCTS - Additional render function
// ============================================
// NOTE: RECENTLY_VIEWED_KEY, getRecentlyViewed() and addToRecentlyViewed() 
// are already declared above (line 1840). This is an additional render function.

function renderRecentlyViewedAlt(containerId, productsArray) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const recentIds = getRecentlyViewed();

    if (recentIds.length === 0) {
        container.style.display = 'none';
        return;
    }

    // Find products matching recent IDs
    const recentProducts = recentIds
        .map(id => productsArray.find(p => p.id == id))
        .filter(p => p !== undefined)
        .slice(0, 6); // Show max 6

    if (recentProducts.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.innerHTML = recentProducts.map(product => {
        // Use shared template for consistency
        if (typeof createProductCardHTML === 'function') {
            return createProductCardHTML(product);
        }
        const imageSrc = getProductImage(product.imagem, product.id);
        return `
            <div class="product-card recently-viewed-item">
                <a href="produto.html?id=${product.id}">
                    <img src="${imageSrc}" alt="${product.nome}" class="product-img" onerror="this.src='img/produto1.jpg'">
                </a>
                <div class="product-info-card">
                    <h3 class="product-name">${product.nome}</h3>
                    <span class="product-price">€${product.preco.toFixed(2)}</span>
                </div>
            </div>
        `;
    }).join('');

    container.style.display = 'grid';
}


// ============================================
// COOKIE CONSENT BANNER (GDPR)
// ============================================

const COOKIE_CONSENT_KEY = 'sfi_cookie_consent';

function showCookieBanner() {
    // Check if user already gave consent
    if (localStorage.getItem(COOKIE_CONSENT_KEY)) {
        return;
    }

    // Create banner element
    const banner = document.createElement('div');
    banner.className = 'cookie-banner';
    banner.innerHTML = `
        <div class="cookie-banner-content">
            <p>🍪 We use cookies to enhance your browsing experience and analyze site traffic. 
            By clicking "Accept", you consent to our use of cookies. 
            <a href="cookies.html">Learn more</a></p>
            <div class="cookie-banner-buttons">
                <button class="cookie-btn cookie-btn-accept" onclick="acceptCookies()">Accept All</button>
                <button class="cookie-btn cookie-btn-decline" onclick="declineCookies()">Decline</button>
            </div>
        </div>
    `;

    document.body.appendChild(banner);

    // Show with animation after a short delay
    setTimeout(() => {
        banner.classList.add('show');
    }, 1000);
}

function acceptCookies() {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
    hideCookieBanner();
}

function declineCookies() {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'declined');
    hideCookieBanner();
}

function hideCookieBanner() {
    const banner = document.querySelector('.cookie-banner');
    if (banner) {
        banner.classList.remove('show');
        setTimeout(() => {
            banner.remove();
        }, 300);
    }
}

// Cookie banner — called from unified DOMContentLoaded
// (removed standalone addEventListener)


// ============================================
// SIZE GUIDE MODAL
// ============================================

function openSizeGuide() {
    const modal = document.getElementById('sizeGuideModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeSizeGuide() {
    const modal = document.getElementById('sizeGuideModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function switchSizeTab(category) {
    // Hide all tables
    document.querySelectorAll('.size-table-content').forEach(table => {
        table.style.display = 'none';
    });

    // Remove active from all tabs
    document.querySelectorAll('.size-tab').forEach(tab => {
        tab.classList.remove('active');
    });

    // Show selected table and activate tab
    const selectedTable = document.getElementById('size-' + category);
    const selectedTab = document.querySelector(`[data-category="${category}"]`);

    if (selectedTable) selectedTable.style.display = 'block';
    if (selectedTab) selectedTab.classList.add('active');
}

// ============================================
// NEWSLETTER POPUP
// ============================================

const NEWSLETTER_SHOWN_KEY = 'sfi_newsletter_shown';
const NEWSLETTER_DELAY = 30000; // Show after 30 seconds

function showNewsletterPopup() {
    // Don't show if already shown in this session
    if (sessionStorage.getItem(NEWSLETTER_SHOWN_KEY)) {
        return;
    }

    // Don't show if already subscribed
    if (localStorage.getItem('sfi_newsletter_subscribed')) {
        return;
    }

    // Create popup element
    const popup = document.createElement('div');
    popup.className = 'newsletter-popup';
    popup.innerHTML = `
        <div class="newsletter-popup-overlay" onclick="closeNewsletterPopup()"></div>
        <div class="newsletter-popup-content">
            <button class="newsletter-popup-close" onclick="closeNewsletterPopup()" aria-label="Close">&times;</button>
            <div class="newsletter-popup-icon">📧</div>
            <h2>Get 10% Off Your First Order!</h2>
            <p>Subscribe to our newsletter and receive exclusive offers, new product alerts, and training tips.</p>
            <form class="newsletter-popup-form" onsubmit="submitNewsletter(event)">
                <input type="email" id="newsletterEmail" placeholder="Enter your email" required>
                <button type="submit" class="btn-newsletter-submit">Subscribe & Save</button>
            </form>
            <p class="newsletter-privacy">We respect your privacy. Unsubscribe anytime.</p>
        </div>
    `;

    document.body.appendChild(popup);

    // Animate in
    setTimeout(() => {
        popup.classList.add('show');
    }, 100);

    sessionStorage.setItem(NEWSLETTER_SHOWN_KEY, 'true');
}

function closeNewsletterPopup() {
    const popup = document.querySelector('.newsletter-popup');
    if (popup) {
        popup.classList.remove('show');
        setTimeout(() => {
            popup.remove();
        }, 300);
    }
}

function submitNewsletter(e) {
    e.preventDefault();
    const email = document.getElementById('newsletterEmail').value;

    // In production, this would send to your email service
    localStorage.setItem('sfi_newsletter_subscribed', 'true');
    localStorage.setItem('sfi_newsletter_email', email);

    // Show success message
    const content = document.querySelector('.newsletter-popup-content');
    if (content) {
        content.innerHTML = `
            <div class="newsletter-success">
                <div class="success-icon">✓</div>
                <h2>Thank You!</h2>
                <p>Check your email for your 10% discount code.</p>
                <button class="btn-newsletter-submit" onclick="closeNewsletterPopup()">Start Shopping</button>
            </div>
        `;
    }
}

// Newsletter popup — called from unified DOMContentLoaded
function initNewsletterPopup() {
    const isProductPage = window.location.pathname.includes('produto.html');
    const isCheckoutPage = window.location.pathname.includes('checkout.html');
    if (!isProductPage && !isCheckoutPage) {
        setTimeout(showNewsletterPopup, NEWSLETTER_DELAY);
    }
}


// ============================================
// STOCK INDICATOR FUNCTIONS
// ============================================

function getStockStatus(stock) {
    if (stock === 0 || stock === null || stock === undefined) {
        return {
            class: 'out-of-stock',
            text: 'Out of Stock',
            showNotify: true
        };
    } else if (stock <= 5) {
        return {
            class: 'low-stock',
            text: `Only ${stock} left!`,
            showNotify: false
        };
    } else {
        return {
            class: 'in-stock',
            text: 'In Stock',
            showNotify: false
        };
    }
}

function createStockIndicator(stock) {
    const status = getStockStatus(stock);

    let html = `
        <div class="stock-indicator ${status.class}">
            <span class="stock-dot"></span>
            <span class="stock-text">${status.text}</span>
    `;

    if (status.showNotify) {
        html += `<button class="notify-btn" onclick="showNotifyModal()">Notify Me</button>`;
    }

    html += `</div>`;

    return html;
}

function createStockBadge(stock) {
    const status = getStockStatus(stock);

    if (status.class === 'low-stock') {
        return `<span class="product-stock-badge low-stock">Only ${stock} left!</span>`;
    } else if (status.class === 'out-of-stock') {
        return `<span class="product-stock-badge out-of-stock">Out of Stock</span>`;
    }

    return '';
}

// Notify Me Modal
function showNotifyModal() {
    const email = prompt('Enter your email to be notified when this item is back in stock:');

    if (email && email.includes('@')) {
        // In production, this would send to your backend
        alert('Thank you! We\'ll notify you at ' + email + ' when this item is back in stock.');
    }
}

// ============================================
// PRODUCT COMPARISON SYSTEM
// ============================================

const COMPARE_KEY = 'sfi_compare_products';
const MAX_COMPARE = 4;

function getCompareList() {
    return JSON.parse(localStorage.getItem(COMPARE_KEY) || '[]');
}

function saveCompareList(list) {
    localStorage.setItem(COMPARE_KEY, JSON.stringify(list));
    updateCompareBar();
}

function addToCompare(productId) {
    let compareList = getCompareList();

    if (compareList.includes(productId)) {
        showNotification('Product already in compare list', 'info');
        return;
    }

    if (compareList.length >= MAX_COMPARE) {
        showNotification(`Maximum ${MAX_COMPARE} products can be compared`, 'warning');
        return;
    }

    compareList.push(productId);
    saveCompareList(compareList);
    showNotification('Added to compare list', 'success');
}

function removeFromCompare(productId) {
    let compareList = getCompareList();
    compareList = compareList.filter(id => id !== productId);
    saveCompareList(compareList);
}

function clearCompare() {
    localStorage.removeItem(COMPARE_KEY);
    updateCompareBar();
}

function updateCompareBar() {
    const compareList = getCompareList();
    let bar = document.getElementById('compareBar');

    if (compareList.length === 0) {
        if (bar) bar.remove();
        return;
    }

    // Create bar if doesn't exist
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'compareBar';
        bar.className = 'compare-bar';
        document.body.appendChild(bar);
    }

    // Get product details
    let productsHtml = '';

    if (typeof products !== 'undefined' && Array.isArray(products)) {
        compareList.forEach(id => {
            const product = products.find(p => p.id == id);
            if (product) {
                const imgSrc = getProductImage(product.imagem, product.id);
                productsHtml += `
                    <div class="compare-item">
                        <img src="${imgSrc}" alt="${product.nome}" onerror="this.src='img/produto1.jpg'">
                        <button class="compare-item-remove" onclick="removeFromCompare(${id})" title="Remove">×</button>
                    </div>
                `;
            }
        });
    }

    bar.innerHTML = `
        <div class="compare-bar-content">
            <div class="compare-bar-items">
                ${productsHtml}
                ${compareList.length < MAX_COMPARE ? `<div class="compare-item-placeholder">+ Add</div>` : ''}
            </div>
            <div class="compare-bar-actions">
                <span class="compare-count">${compareList.length}/${MAX_COMPARE} products</span>
                <button class="btn-compare-now" onclick="goToCompare()" ${compareList.length < 2 ? 'disabled' : ''}>
                    Compare Now
                </button>
                <button class="btn-compare-clear" onclick="clearCompare()">Clear</button>
            </div>
        </div>
    `;
}

function goToCompare() {
    const compareList = getCompareList();
    if (compareList.length >= 2) {
        window.location.href = 'compare.html?ids=' + compareList.join(',');
    }
}

// Compare bar — called from unified DOMContentLoaded
// (removed standalone addEventListener)

// ============================================
// HOVER BARRA QUICK ACTIONS – delegação global + controle direto da barra
// Garante que a barra (olho, comparar, wishlist) apareça ao passar o rato em qualquer card
// ============================================
(function () {
    let currentHoveredCard = null;

    function showQuickActionsBar(card) {
        if (!card) return;
        let bar = card.querySelector('.product-quick-actions-inline');
        if (bar) {
            bar.style.display = 'flex';
            bar.style.visibility = 'visible';
            bar.style.opacity = '1';
            bar.style.maxHeight = '56px';
            bar.style.pointerEvents = 'auto';
            bar.style.overflow = 'visible';
            bar.querySelectorAll('.quick-action-btn-inline, .wishlist-icon').forEach(function (btn) {
                btn.style.display = 'flex';
                btn.style.visibility = 'visible';
                btn.style.opacity = '1';
            });
        }
        card.classList.add('card-hovered');
        currentHoveredCard = card;
    }

    function hideQuickActionsBar(card) {
        if (!card) return;
        let bar = card.querySelector('.product-quick-actions-inline');
        if (bar) {
            bar.style.display = '';
            bar.style.visibility = '';
            bar.style.opacity = '';
            bar.style.maxHeight = '';
            bar.style.pointerEvents = '';
            bar.style.overflow = '';
            bar.querySelectorAll('.quick-action-btn-inline, .wishlist-icon').forEach(function (btn) {
                btn.style.display = '';
                btn.style.visibility = '';
                btn.style.opacity = '';
            });
        }
        card.classList.remove('card-hovered');
        if (currentHoveredCard === card) currentHoveredCard = null;
    }

    function initQuickActionsHover() {
        document.removeEventListener('mouseover', onMouseOver);
        document.removeEventListener('mouseout', onMouseOut);
        document.addEventListener('mouseover', onMouseOver, true);
        document.addEventListener('mouseout', onMouseOut, true);
    }

    function onMouseOver(e) {
        let card = e.target && e.target.closest ? e.target.closest('.product-card') : null;
        if (!card || !card.querySelector('.product-quick-actions-inline')) return;
        if (card === currentHoveredCard) return;
        if (currentHoveredCard) hideQuickActionsBar(currentHoveredCard);
        showQuickActionsBar(card);
    }

    function onMouseOut(e) {
        let card = e.target && e.target.closest ? e.target.closest('.product-card') : null;
        if (!card) return;
        let related = e.relatedTarget;
        if (related && card.contains(related)) return;
        hideQuickActionsBar(card);
    }

    // Initialize immediately (script has defer, DOM is already parsed)
    initQuickActionsHover();
    // Re-run quando carrosséis forem preenchidos (MutationObserver já existe; chamar init de novo após pequeno delay)
    setTimeout(initQuickActionsHover, 800);
    setTimeout(initQuickActionsHover, 2000);
})();

// ============================================
// QUICK ACTIONS ON PRODUCT CARDS
// ============================================

function createQuickActionsHTML(productId) {
    const safeProductId = typeof productId === 'string' ? `'${productId}'` : productId;
    const numId = typeof productId === 'number' ? productId : (typeof productId === 'string' && /^\d+$/.test(productId) ? parseInt(productId, 10) : 0);
    return `<div class="product-quick-actions-inline">
            <button class="quick-action-btn-inline wishlist-icon" data-product-id="${productId}" title="Add to Wishlist" type="button" onclick="event.preventDefault(); event.stopPropagation(); typeof toggleWishlist==='function'&&toggleWishlist(${safeProductId});">
                <img src="img/heart-icon.svg" alt="" class="wishlist-heart-img" width="24" height="24">
            </button>
        </div>`;
}

// Function to add quick actions to existing product cards
function addQuickActionsToCards() {
    const productCards = document.querySelectorAll('.product-card:not(.has-quick-actions)');

    productCards.forEach(card => {
        // Try to get product ID from various sources
        let productId = null;

        // 1. Check for data attribute on card (data-product-id or data-id)
        if (card.dataset.productId) {
            productId = card.dataset.productId;
        }
        if (!productId && card.dataset.id) {
            productId = card.dataset.id;
        }
        if (!productId && card.getAttribute('data-id')) {
            productId = card.getAttribute('data-id');
        }

        // 2. Check for data-product-id on Add to Basket button
        if (!productId) {
            const basketBtn = card.querySelector('.btn-basket[data-product-id]');
            if (basketBtn) {
                productId = basketBtn.dataset.productId;
            }
        }

        // 3. Check for link to product page
        if (!productId) {
            const link = card.querySelector('a[href*="produto.html"]');
            if (link) {
                const match = link.href.match(/id=(\d+)/);
                if (match) {
                    productId = match[1];
                }
            }
        }

        // 4. Check for onclick on Add to Basket button
        if (!productId) {
            const basketBtn = card.querySelector('.btn-basket');
            if (basketBtn) {
                const onclickStr = basketBtn.getAttribute('onclick') || '';
                const match = onclickStr.match(/addToCart\((\d+)/);
                if (match) {
                    productId = match[1];
                }
            }
        }

        // 5. Generate a unique ID if none found (for static products)
        if (!productId) {
            productId = 'static-' + Math.random().toString(36).substr(2, 9);
        }

        // Add quick actions before the Add to Basket button
        if (!card.querySelector('.product-quick-actions-inline')) {
            const basketBtn = card.querySelector('.btn-basket');
            if (basketBtn) {
                basketBtn.insertAdjacentHTML('beforebegin', createQuickActionsHTML(productId));
                card.classList.add('has-quick-actions');
            }
        }
    });
}

// Quick actions on cards — called from unified DOMContentLoaded
function initQuickActionsOnCards() {
    setTimeout(addQuickActionsToCards, 300);
    setTimeout(addQuickActionsToCards, 800);
    setTimeout(addQuickActionsToCards, 1500);
    setTimeout(addQuickActionsToCards, 3000);
    setTimeout(addQuickActionsToCards, 5000);
}

// Also run when products are dynamically loaded
if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            if (mutation.addedNodes.length > 0) {
                setTimeout(addQuickActionsToCards, 100);
            }
        });
    });

    // Start observing — called from unified DOMContentLoaded
    function initQuickActionsObserver() {
        const containers = document.querySelectorAll('.products-grid, .product-carousel-track, #produtosGrid, .product-carousel-wrapper, #relatedProductsGrid, #promotionProductsGrid, #bestSellersGrid, .shop-products-grid, .shop-products-list');
        containers.forEach(container => {
            if (container) {
                observer.observe(container, { childList: true, subtree: true });
            }
        });
    }
    // Expose for unified handler
    window._initQuickActionsObserver = initQuickActionsObserver;
}


// ============================================
// TOAST NOTIFICATION SYSTEM
// ============================================

function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existing = document.querySelector('.toast-notification');
    if (existing) {
        existing.remove();
    }

    // Create notification element
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;

    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };

    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;

    document.body.appendChild(toast);

    // Trigger animation
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    // Auto remove after 4 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Mobile Price Filter Function
// FALLBACK version: redirects to shop.html with URL params (runs on non-shop pages).
// On shop.html, shop.js loads AFTER main.js and overwrites this with an in-page filter version.
function applyMobilePriceFilter() {
    const minPrice = document.getElementById('mobilePriceMin')?.value || '';
    const maxPrice = document.getElementById('mobilePriceMax')?.value || '';

    // Close mobile menu first (always)
    const mobileMenu = document.getElementById('mobileMenu');
    const mobileOverlay = document.getElementById('mobileMenuOverlay');
    if (mobileMenu) mobileMenu.classList.remove('active');
    if (mobileOverlay) mobileOverlay.classList.remove('active');

    // If on shop page with applyFilters available, use shop.js logic directly
    if (typeof applyFilters === 'function') {
        const priceMinInput = document.getElementById('price-min');
        const priceMaxInput = document.getElementById('price-max');
        if (priceMinInput && minPrice) priceMinInput.value = minPrice;
        if (priceMaxInput && maxPrice) priceMaxInput.value = maxPrice;
        if (typeof currentPage !== 'undefined') currentPage = 1;
        applyFilters();
        return;
    }

    // Otherwise redirect to shop.html with price parameters
    let url = 'shop.html';
    const params = [];
    if (minPrice) params.push(`minPrice=${minPrice}`);
    if (maxPrice) params.push(`maxPrice=${maxPrice}`);
    if (params.length > 0) url += '?' + params.join('&');
    window.location.href = url;
}


// ============================================
// FIX: Add to Basket para produtos estáticos (sem data-product-id)
// Corrigido em Janeiro 2026 - Versão 2
// ============================================

function initStaticProductButtons() {
    const allButtons = document.querySelectorAll('.btn-basket');

    allButtons.forEach((button, index) => {
        if (button.hasAttribute('data-static-listener-attached')) {
            return;
        }
        button.setAttribute('data-static-listener-attached', 'true');

        const existingId = button.getAttribute('data-product-id');
        const isInCarousel = button.closest('.product-carousel-track');

        if (existingId && !isNaN(parseInt(existingId, 10)) && isInCarousel) {
            return;
        }

        button.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            const productId = this.getAttribute('data-product-id');
            if (productId && !isNaN(parseInt(productId, 10))) {
                if (typeof window.addToCart === 'function') {
                    window.addToCart(parseInt(productId, 10));
                }
                return;
            }

            const card = this.closest('.product-card');
            if (!card) {
                if (typeof showToast === 'function') {
                    showToast('Error: Could not find product information');
                }
                return;
            }

            const nameEl = card.querySelector('.product-name');
            const nome = nameEl ? nameEl.textContent.trim() : 'Product';

            const newPriceEl = card.querySelector('.new-price');
            let preco = 0;
            if (newPriceEl) {
                const priceText = newPriceEl.textContent.trim();
                preco = parseFloat(priceText.replace('€', '').replace(',', '.').trim());
            }

            const imgEl = card.querySelector('.product-img, img');
            let imagem = imgEl ? imgEl.getAttribute('src') : 'img/produto1.jpg';

            let staticId = 90000 + Math.abs(hashCodeSimple(nome)) % 10000;
            const cart = JSON.parse(localStorage.getItem('cart') || '[]');
            const existingItem = cart.find(item => item.nome === nome);
            if (existingItem) {
                staticId = existingItem.id;
            }

            if (typeof window.addToCart === 'function') {
                window.addToCart(staticId, 1, {
                    nome: nome,
                    preco: preco,
                    imagem: imagem
                });
            } else if (typeof addToCartGlobal === 'function') {
                addToCartGlobal(staticId, nome, preco);
            } else {
                // Fallback manual
                let cartData = JSON.parse(localStorage.getItem('cart') || '[]');
                const existingIdx = cartData.findIndex(item => item.id === staticId);

                if (existingIdx > -1) {
                    cartData[existingIdx].quantidade = (cartData[existingIdx].quantidade || 1) + 1;
                } else {
                    cartData.push({
                        id: staticId,
                        nome: nome,
                        preco: preco,
                        imagem: imagem,
                        quantidade: 1
                    });
                }

                localStorage.setItem('cart', JSON.stringify(cartData));

                // Atualizar contador
                const count = cartData.reduce((sum, item) => sum + (item.quantidade || 1), 0);
                document.querySelectorAll('.cart-count').forEach(el => {
                    el.textContent = count;
                });

                // Mostrar notificação
                if (typeof showToast === 'function') {
                    showToast('Added to cart!');
                }

                // Modal não abre automaticamente - só abre quando clicar no ícone do carrinho
            }
        });
    });
}

// Função hash simples para gerar IDs consistentes
function hashCodeSimple(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash;
}

// Static product buttons init — called from unified DOMContentLoaded
// (removed standalone readyState check)

window.addEventListener('load', function () {
    setTimeout(initStaticProductButtons, 500);
});

window.initStaticProductButtons = initStaticProductButtons;

// ============================================================
// UNIFIED DOMContentLoaded — Single entry point for all initializations
// ============================================================
document.addEventListener('DOMContentLoaded', function () {
    // Scroll to top on page load (so footer links open at top)
    if (!window.location.hash) window.scrollTo(0, 0);
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    if (_dbg()) console.log('🚀 Unified DOMContentLoaded — initializing all modules...');

    // 0. Detect B2B customer (global flag for shipping rules)
    window._sfiCustomerIsB2B = false;
    if (window.sfi?.b2b?.checkAccess) {
        sfi.b2b.checkAccess().then(function(isB2B) {
            window._sfiCustomerIsB2B = !!isB2B;
        }).catch(function() {});
    }

    // 1. Hero carousel
    if (typeof initHeroCarouselWhenReady === 'function') initHeroCarouselWhenReady();

    // 2. Mobile image switching
    if (typeof switchToMobileImages === 'function') switchToMobileImages();

    // 3. Benefits bar animation
    if (typeof setupBenefitsAnimation === 'function') setupBenefitsAnimation();

    // 4. Category products horizontal scroll
    if (typeof initializeCategoryProductsScroll === 'function') initializeCategoryProductsScroll();

    // 5. Add to basket + UI setup (product links, cart listeners, image lazy load, carousels)
    if (typeof initAddToBasketAndUI === 'function') initAddToBasketAndUI();

    // 6. Search functionality
    if (typeof initSearchFunctionality === 'function') initSearchFunctionality();

    // 7. Wishlist page (only on wishlist.html)
    if (document.getElementById('wishlistGrid') && typeof initWishlistPage === 'function') {
        initWishlistPage();
    }

    // 8. Page load features (dark mode, mobile menu, etc.)
    if (typeof initPageLoadFeatures === 'function') initPageLoadFeatures();

    // 9. Newsletter popup
    if (typeof initNewsletterPopup === 'function') initNewsletterPopup();

    // 10. Quick actions on product cards
    if (typeof initQuickActionsOnCards === 'function') initQuickActionsOnCards();

    // 11. Static product buttons (delayed for dynamic content)
    if (typeof initStaticProductButtons === 'function') {
        setTimeout(initStaticProductButtons, 300);
    }

    if (_dbg()) console.log('✅ Unified DOMContentLoaded — all modules initialized');
});