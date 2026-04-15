// Shop Page JavaScript
let allProducts = [];
let filteredProducts = [];
let currentPage = 1;
const productsPerPage = 20;
let currentView = 'grid';
let currentSort = 'relevance';

// Helper: Função para obter imagem válida do produto na página shop
const SHOP_EXISTING_IMAGES = ['produto1.jpg', 'produto2.jpg', 'produto3.jpg', 'produto4.jpg', 'produto5.jpg'];

function getShopProductImage(imagem, productId) {
    // 0) Normalize extension: Supabase may have .jpg/.png but real files are .webp
    if (imagem && imagem.includes('produtos-279/')) {
        imagem = imagem.replace(/\.(jpg|jpeg|png)$/i, '.webp');
    }
    
    // 0b) Already has correct img/ prefix — return as-is
    if (imagem && imagem.startsWith('img/')) {
        return imagem;
    }
    
    // 1) Caminho relativo para a pasta de produtos baixados (279 novos produtos)
    if (imagem && (imagem.startsWith('produtos-279/') || imagem.startsWith('produtos-279\\'))) {
        return `img/${imagem}`;
    }
    
    // 1b) Caminho antigo produtos-site (compatibilidade)
    if (imagem && (imagem.startsWith('produtos-site/') || imagem.startsWith('produtos-site\\'))) {
        return `img/${imagem}`;
    }

    // 2) URL absoluta
    if (imagem && /^https?:\/\//i.test(imagem)) {
        return imagem;
    }

    // 3) Placeholders antigos
    if (imagem && SHOP_EXISTING_IMAGES.includes(imagem)) {
        return `img/${imagem}`;
    }

    // 4) Compatibilidade com nomes tipo produtoX.jpg
    if (imagem && /^produto\d+\.jpg$/i.test(imagem)) {
        return `img/${imagem}`;
    }

    // 5) Fallback final – se nada funcionar
    const fallbackIndex = (productId % 5) + 1;
    return `img/produto${fallbackIndex}.jpg`;
}

// ── Build variant selector HTML for product cards ──
function buildCardVariantHTML(product) {
    const variants = product.variantes;
    if (!variants || variants.length === 0) return '';
    
    return variants.map(group => {
        const options = group.options.map(opt => {
            const sel = opt.is_default ? ' selected' : '';
            const priceStr = opt.price ? ` data-price="${opt.price}"` : '';
            const oldPriceStr = opt.compare_at_price ? ` data-old-price="${opt.compare_at_price}"` : '';
            const stockStr = (opt.stock !== null && opt.stock <= 0) ? ' disabled' : '';
            return `<option value="${opt.id}"${sel}${priceStr}${oldPriceStr}${stockStr}>${opt.label}${opt.stock !== null && opt.stock <= 0 ? ' ((Backorder))' : ''}</option>`;
        }).join('');
        return `<div class="card-variant-selector">
            <select class="card-variant-select" data-type="${group.slug}" title="${group.type}">
                ${options}
            </select>
        </div>`;
    }).join('');
}

// Category mapping (Portuguese to English) - Updated for 279 products catalog
const categoryMap = {
    // Current categories
    'Nutrition': 'nutrition',
    'Cycling': 'cycling',
    'Swimming': 'swimming',
    'Running': 'running',
    'Electronics': 'electronics',
    // Legacy mappings (backwards compatibility)
    'Nutrição Esportiva': 'nutrition',
    'iGSPORT': 'electronics',
    'Lock Laces': 'running',
    "Chamois Butt'r": 'cycling',
    'Run Accessories': 'running',
    'Spatzwear': 'cycling',
    'Swim Secure': 'swimming',
    'Zone 3': 'swimming',
    'Blackwitch': 'running',
    'Swimming & Watersports': 'swimming',
    'Nutricao': 'nutrition',
    'Ciclismo': 'cycling',
    'Natacao': 'swimming',
    'Corrida': 'running',
    'Triathlon': 'triathlon',
    'Acessorios': 'accessories',
    'Eletronicos': 'electronics'
};

// Some brands belong to additional categories (multi-categoria)
// Ex.: Chamois Butt'r é Cycling mas também faz sentido em Running
const extraCategoriesByBrand = {
    "Chamois Butt'r": ['running']
};

// Subcategory mapping for better matching
const subcategoryMap = {
    'Jerseys & Gilets': 'Jerseys & Gilets',
    'Jerseys': 'Jerseys & Gilets',
    'Gilets': 'Jerseys & Gilets'
};

// Load products from JSON (with fallback for local files)
async function loadProducts() {
    try {
        let data;
        
        // Quando a página é aberta via file:// (sem servidor), usar dados embutidos
        if (window.location.protocol === 'file:' && Array.isArray(window.EMBEDDED_PRODUCTS)) {
            allProducts = window.EMBEDDED_PRODUCTS.map(product => {
                const baseCategory = categoryMap[product.categoria] || product.categoria.toLowerCase();
                const extras = extraCategoriesByBrand[product.marca] || [];
                return {
                    ...product,
                    categoryEn: baseCategory,
                    extraCategories: extras,
                    price: parseFloat(product.preco) || 0,
                    oldPrice: parseFloat(product.preco_antigo) || null,
                    discount: product.desconto || 0,
                    inStock: product.em_stock === true};
            });
            
            // Aplicar filtro de marca via URL (ex.: shop.html?brand=Clif)
            let brandParamLocal = null;
            const fullUrlLocal = window.location.href;
            const brandMatchLocal = fullUrlLocal.match(/[?&]brand=([^&#]*)/);
            if (brandMatchLocal) brandParamLocal = decodeURIComponent(brandMatchLocal[1]);
            if (brandParamLocal) {
                const brandCheckboxes = document.querySelectorAll('.brand-filter-all');
                brandCheckboxes.forEach(cb => {
                    if (cb.value.toLowerCase() === brandParamLocal.toLowerCase()) {
                        cb.checked = true;
                    }
                });
            }
            
            // Aplicar filtros iniciais; depois ativar categoria do hash (ex.: shop.html#nutrition)
            applyFilters();
            const hashLocal = window.location.hash.replace('#', '');
            if (hashLocal) {
                const hashParts = hashLocal.split('#');
                activateCategoryFilter(hashParts[0], hashParts[1] || null);
            }
            return;
        }
        
        // Try fetch first
        try {
            const response = await fetch('js/dados.json');
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            data = await response.json();
        } catch (fetchError) {
            // Fallback to XMLHttpRequest for local files
            data = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', 'js/dados.json', true);
                xhr.onreadystatechange = function() {
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
        
        
        // Suporta tanto array direto quanto objeto com .produtos
        const productsArray = Array.isArray(data) ? data : data.produtos;
        
        allProducts = productsArray.map(product => {
            const baseCategory = categoryMap[product.categoria] || product.categoria.toLowerCase();
            const extras = extraCategoriesByBrand[product.marca] || [];
            return {
                ...product,
                categoryEn: baseCategory,
                extraCategories: extras,
                price: parseFloat(product.preco) || 0,
                oldPrice: parseFloat(product.preco_antigo) || null,
                discount: product.desconto || 0,
                inStock: product.em_stock === true
            };
        });
        
        // Check URL hash for category filter and expand it
        const hash = window.location.hash.replace('#', '');
        if (hash) {
            const hashParts = hash.split('#');
            activateCategoryFilter(hashParts[0], hashParts[1] || null);
        }
        
        // Check URL search parameter
        const urlParams = new URLSearchParams(window.location.search);
        const searchParam = urlParams.get('search');
        if (searchParam) {
            const searchInput = document.getElementById('busca');
            if (searchInput) {
                searchInput.value = searchParam;
            }
        }
        
        // Check URL price parameters (from mobile menu filter)
        const minPriceParam = urlParams.get('minPrice');
        const maxPriceParam = urlParams.get('maxPrice');
        if (minPriceParam) {
            const priceMinInput = document.getElementById('price-min');
            if (priceMinInput) priceMinInput.value = minPriceParam;
        }
        if (maxPriceParam) {
            const priceMaxInput = document.getElementById('price-max');
            if (priceMaxInput) priceMaxInput.value = maxPriceParam;
        }
        
        // Check URL brand parameter (from brand logos on homepage)
        // Use multiple methods to extract brand param (file:// protocol compatibility)
        let brandParam = urlParams.get('brand');
        if (!brandParam) {
            const fullUrl = window.location.href;
            const brandMatch = fullUrl.match(/[?&]brand=([^&#]*)/);
            if (brandMatch) brandParam = decodeURIComponent(brandMatch[1]);
        }
        if (brandParam) {
            const brandCheckboxes = document.querySelectorAll('.brand-filter-all');
            let matched = false;
            brandCheckboxes.forEach(cb => {
                if (cb.value.toLowerCase() === brandParam.toLowerCase()) {
                    cb.checked = true;
                    matched = true;
                }
            });
            if (!matched) {
            }
        }

        // Check URL category + sub parameters (from mobile menu links)
        const categoryParam = urlParams.get('category');
        const subParam = urlParams.get('sub');
        if (categoryParam) {
            const catKey = categoryParam.toLowerCase();

            // Activate the category toggle
            const toggle = document.querySelector(`.filter-category-toggle[data-category="${catKey}"]`);
            if (toggle) {
                toggle.classList.add('active');
                const subcatGroup = document.getElementById(`filter-subcategory-${catKey}`);
                if (subcatGroup) subcatGroup.classList.add('active');
            }

            // Map URL sub slugs → exact checkbox values
            const subMap = {
                // Nutrition
                'gels':        'Gels',
                'shots':       'Shots',
                'drinks':      'Sports Drinks',
                'bars':        'Bars',
                'amino':       'Amino Acids',
                'electrolytes':'Electrolytes',
                'recovery':    'Recovery',
                'endurance':   'Endurance Fuel',
                'chews':       'Energy Chews',
                'minerals':    'Minerals',
                // Cycling
                'jerseys':     'Jerseys & Gilets',
                'baselayers':  'Baselayers',
                'shorts':      'Shorts',
                'gloves':      'Gloves',
                'overshoes':   'Overshoes',
                'warmers':     'Warmers',
                'socks':       'Socks',
                'computers':   'Bike Computers',
                'lights':      'Lights',
                'sensors':     'Sensors & Monitors',
                'antichafing': 'Anti-Chafing',
                'bottles':     'Bottles & Other',
                // Swimming
                'wetsuits-mens':   "Men's",
                'wetsuits-womens': "Women's",
                'wetsuits-kids':   'Kids',
                'thermal':         'Thermal',
                'costumes':        'Costumes',
                'jammers':         'Jammers & Shorts',
                'yulex':           'Yulex Collection',
                'neoprene':        'Neoprene Layers',
                'trisuits':        'Trisuits',
                'goggles':         'Goggles',
                'swimcaps':        'Swim Caps',
                'beanies':         'Beanies & Headwear',
                'safety':          'Safety Buoys',
                'robes':           'Robes & Towels',
                'training':        'Training Aids',
                // Running
                'shoes':       'Running Shoes',
                'accessories': 'Accessories',
                'belts':       'Race Belts',
                'laces':       'Laces',
            };

            if (subParam) {
                const checkboxValue = subMap[subParam.toLowerCase()];
                if (checkboxValue) {
                    const cb = document.querySelector(
                        `.subcategory-filter[data-category="${catKey}"][value="${checkboxValue}"]`
                    );
                    if (cb) cb.checked = true;
                }
            }
        }
        
        applyFilters();
    } catch (error) {
        console.error('❌ Shop: Error loading products:', error);
        const grid = document.getElementById('productsGrid');
        if (grid) {
            grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: 2rem; color: red;">Error loading products. Please refresh the page.<br>Error: ' + error.message + '</p>';
        }
    }
}

// Mobile Price Filter — removed duplicate (unified version lives in main.js)
// main.js applyMobilePriceFilter() detects shop.html and calls applyFilters() directly

// Initialize Custom Sort Select
function initCustomSortSelect() {
    const wrapper = document.getElementById('sortSelectWrapper');
    const trigger = document.getElementById('sortSelectTrigger');
    const options = document.getElementById('sortSelectOptions');
    const label = document.getElementById('sortSelectLabel');
    const hiddenInput = document.getElementById('sortSelect');
    
    if (!wrapper || !trigger || !options) return;
    
    // Toggle dropdown
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        wrapper.classList.toggle('open');
    });
    
    // Select option
    options.querySelectorAll('.custom-select-option').forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const value = option.dataset.value;
            const text = option.textContent;
            
            // Update UI
            label.textContent = text;
            options.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            
            // Update hidden input
            if (hiddenInput) hiddenInput.value = value;
            
            // Close dropdown
            wrapper.classList.remove('open');
            
            // Apply filter
            currentSort = value;
            currentPage = 1;
            applyFilters();
        });
    });
    
    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            wrapper.classList.remove('open');
        }
    });
    
    // Mark initial selected option
    const initialValue = hiddenInput?.value || 'relevance';
    const initialOption = options.querySelector(`[data-value="${initialValue}"]`);
    if (initialOption) initialOption.classList.add('selected');
}

// Build subcategory list for a brand from loaded product data
function toggleBrandSubcategories(checkbox) {
    const brandName = checkbox.value;
    const wrapper = checkbox.closest('.filter-checkbox');
    let subList = wrapper.nextElementSibling;
    
    // If already has a sub-list, toggle it
    if (subList && subList.classList.contains('brand-sub-list')) {
        if (checkbox.checked) {
            subList.classList.add('active');
        } else {
            subList.classList.remove('active');
            // Uncheck all sub-filters when brand is unchecked
            subList.querySelectorAll('.brand-sub-filter').forEach(cb => cb.checked = false);
        }
        return;
    }
    
    // Create new sub-list if brand is checked
    if (!checkbox.checked) return;
    
    // Get unique subcategories for this brand from product data
    const brandProducts = allProducts.filter(p => p.marca === brandName);
    const subcatMap = {};
    brandProducts.forEach(p => {
        const sub = p.subcategoria || p.sub_subcategoria;
        if (sub && sub !== '' && sub !== 'undefined') {
            subcatMap[sub] = (subcatMap[sub] || 0) + 1;
        }
    });
    
    // Sort by count descending
    const subcats = Object.entries(subcatMap).sort((a, b) => b[1] - a[1]);
    if (subcats.length === 0) return;
    
    // Create the subcategory list
    subList = document.createElement('div');
    subList.className = 'brand-sub-list active';
    const slug = brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    
    subcats.forEach(([name, count]) => {
        const subSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const id = 'bsub-' + slug + '-' + subSlug;
        const div = document.createElement('div');
        div.className = 'filter-checkbox';
        div.innerHTML = '<input type="checkbox" id="' + id + '" value="' + name + '" class="brand-sub-filter" data-brand="' + brandName + '">' +
            '<label for="' + id + '">' + name + ' <span style="opacity:0.5;font-size:0.75rem">(' + count + ')</span></label>';
        subList.appendChild(div);
    });
    
    // Insert after the brand checkbox wrapper
    wrapper.after(subList);
}

// Apply filters
function applyFilters() {
    filteredProducts = [...allProducts];
    
    // Get active categories (from expanded groups)
    const activeCategories = [];
    document.querySelectorAll('.filter-category-toggle.active').forEach(toggle => {
        const category = toggle.getAttribute('data-category');
        if (category) {
            activeCategories.push(category);
        }
    });

    // DEBUG — log filter state (remove after confirming fix)
    console.log('[SFI Filter] activeCategories:', activeCategories);
    const checkedSubs = Array.from(document.querySelectorAll('.subcategory-filter:checked')).map(cb => cb.value + '(' + cb.dataset.category + ')');
    console.log('[SFI Filter] checked subcategories:', checkedSubs);
    if (allProducts.length > 0) {
        const sample = allProducts[0];
        console.log('[SFI Filter] sample product categoryEn:', sample.categoryEn, '| subcategoria:', sample.subcategoria);
    }
    
    // General brand filter (applies to all categories)
    const generalBrandFilters = Array.from(document.querySelectorAll('.brand-filter-all:checked')).map(cb => cb.value);
    
    // If any category is expanded, filter by subcategories/brands within those categories
    if (activeCategories.length > 0) {
        let hasSpecificFilters = false;
        const categoryFilters = {};
        
        activeCategories.forEach(category => {
            // Get subcategory filters for this category
            const subcategoryFilters = Array.from(
                document.querySelectorAll(`.subcategory-filter[data-category="${category}"]:checked`)
            ).map(cb => cb.value);
            
            // Get brand filters for this category
            const brandFilters = Array.from(
                document.querySelectorAll(`.brand-filter[data-category="${category}"]:checked`)
            ).map(cb => cb.value);
            
            // Get dietary filters for this category
            const dietaryFilters = Array.from(
                document.querySelectorAll(`.dietary-filter[data-category="${category}"]:checked`)
            ).map(cb => cb.value);
            
            if (subcategoryFilters.length > 0 || brandFilters.length > 0 || dietaryFilters.length > 0) {
                hasSpecificFilters = true;
                categoryFilters[category] = {
                    subcategories: subcategoryFilters,
                    brands: brandFilters,
                    dietary: dietaryFilters
                };
            }
        });
        
        // Apply filters
        if (hasSpecificFilters) {
            filteredProducts = filteredProducts.filter(p => {
                // Check general brand filter first
                if (generalBrandFilters.length > 0 && !generalBrandFilters.includes(p.marca)) {
                    return false;
                }

                const catsForProduct = [p.categoryEn, ...((p.extraCategories || []))];
                let passes = false;

                for (const cat of catsForProduct) {
                    const categoryFilter = categoryFilters[cat];
                    if (!categoryFilter) continue;

                    let matchesSubcategory = categoryFilter.subcategories.length === 0;
                    let matchesBrand = categoryFilter.brands.length === 0;

                    if (categoryFilter.subcategories.length > 0) {
                        matchesSubcategory = categoryFilter.subcategories.includes(p.subcategoria) || categoryFilter.subcategories.includes(p.sub_subcategoria);
                    }

                    if (categoryFilter.brands.length > 0) {
                        matchesBrand = categoryFilter.brands.includes(p.marca);
                    }

                    // Dietary tag filter
                    let matchesDietary = true;
                    if (categoryFilter.dietary && categoryFilter.dietary.length > 0) {
                        const tags = p.dietary_tags || [];
                        matchesDietary = categoryFilter.dietary.every(d => tags.includes(d));
                    }

                    if (matchesSubcategory && matchesBrand && matchesDietary) {
                        passes = true;
                        break;
                    }
                }

                return passes;
            });
        } else {
            // If categories are expanded but no specific filters, show all products in those categories
            filteredProducts = filteredProducts.filter(p => {
                const catsForProduct = [p.categoryEn, ...((p.extraCategories || []))];
                if (!catsForProduct.some(c => activeCategories.includes(c))) return false;
                // Apply general brand filter if set
                if (generalBrandFilters.length > 0) {
                    if (!generalBrandFilters.includes(p.marca)) return false;
                    // Apply brand-subcategory filters
                    const brandSubFilters = {};
                    document.querySelectorAll('.brand-sub-filter:checked').forEach(cb => {
                        const brand = cb.getAttribute('data-brand');
                        if (!brandSubFilters[brand]) brandSubFilters[brand] = [];
                        brandSubFilters[brand].push(cb.value);
                    });
                    const subs = brandSubFilters[p.marca];
                    if (subs && subs.length > 0) {
                        return subs.includes(p.subcategoria) || subs.includes(p.sub_subcategoria);
                    }
                }
                return true;
            });
        }
    } else {
        // No categories expanded, apply general brand filter if set
        if (generalBrandFilters.length > 0) {
            // Get brand-subcategory filters (nested under brands)
            const brandSubFilters = {};
            document.querySelectorAll('.brand-sub-filter:checked').forEach(cb => {
                const brand = cb.getAttribute('data-brand');
                if (!brandSubFilters[brand]) brandSubFilters[brand] = [];
                brandSubFilters[brand].push(cb.value);
            });
            
            filteredProducts = filteredProducts.filter(p => {
                if (!generalBrandFilters.includes(p.marca)) return false;
                // If this brand has subcategory filters, apply them
                const subs = brandSubFilters[p.marca];
                if (subs && subs.length > 0) {
                    return subs.includes(p.subcategoria) || subs.includes(p.sub_subcategoria);
                }
                return true;
            });
        }
    }
    
    // Price filter
    const priceMinEl = document.getElementById('price-min');
    const priceMaxEl = document.getElementById('price-max');
    const minPrice = priceMinEl ? (parseFloat(priceMinEl.value) || 0) : 0;
    const maxPrice = priceMaxEl ? (parseFloat(priceMaxEl.value) || Infinity) : Infinity;
    filteredProducts = filteredProducts.filter(p => 
        p.price >= minPrice && p.price <= maxPrice
    );
    
    // Search filter - busca melhorada em múltiplos campos
    const searchTerm = document.getElementById('busca')?.value.trim() || '';
    if (searchTerm) {
        const termo = searchTerm.toLowerCase();
        const searchWords = termo.split(/\s+/).filter(w => w.length > 0);
        
        filteredProducts = filteredProducts.filter(p => {
            const nome = (p.nome || '').toLowerCase();
            const descricao = (p.descricao_curta || p.descricao || '').toLowerCase();
            const marca = (p.marca || '').toLowerCase();
            const categoria = (p.categoria || '').toLowerCase();
            const subcategoria = (p.subcategoria || '').toLowerCase();
            
            // Busca exata no nome (prioridade)
            if (nome.includes(termo)) return true;
            
            // Busca por palavras-chave em qualquer campo
            const allText = `${nome} ${descricao} ${marca} ${categoria} ${subcategoria}`;
            return searchWords.every(word => allText.includes(word));
        });
    }
    
    // Sort products
    sortProducts();
    
    // Update UI
    updateProductsCount();
    renderProducts();
    renderPagination();
}

// Sort products
function sortProducts() {
    switch (currentSort) {
        case 'price-asc':
            filteredProducts.sort((a, b) => a.price - b.price);
            break;
        case 'price-desc':
            filteredProducts.sort((a, b) => b.price - a.price);
            break;
        case 'name-asc':
            filteredProducts.sort((a, b) => a.nome.localeCompare(b.nome));
            break;
        case 'name-desc':
            filteredProducts.sort((a, b) => b.nome.localeCompare(a.nome));
            break;
        default: // relevance
            // Keep original order or sort by rating/stock
            filteredProducts.sort((a, b) => {
                if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
                return (b.rating || 0) - (a.rating || 0);
            });
    }
}

// Render products
function renderProducts() {
    const grid = document.getElementById('productsGrid');
    if (!grid) {
        console.error('❌ Shop: productsGrid element not found!');
        return;
    }
    
    const startIndex = (currentPage - 1) * productsPerPage;
    const endIndex = startIndex + productsPerPage;
    const pageProducts = filteredProducts.slice(startIndex, endIndex);
    
    
    if (pageProducts.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; padding: var(--space-xxl);">No products found. Try adjusting your filters.</p>';
        return;
    }
    
    grid.className = currentView === 'list' ? 'shop-products-list' : 'shop-products-grid';
    
    grid.innerHTML = pageProducts.map(product => {
        // Use shared template if available
        if (typeof createProductCardHTML === 'function') {
            return createProductCardHTML(product);
        }
        // Fallback
        const discountBadge = product.discount > 0 
            ? `<span class="badge-desconto">-${product.discount}%</span>` 
            : '';
        const oldPrice = product.oldPrice && product.oldPrice > product.price
            ? ''
            : '';
        
        // Variant selector for cards
        const variantHtml = buildCardVariantHTML(product);
        
        return `
            <article class="product-card" data-id="${product.id}" data-product-id="${product.id}">
                ${discountBadge}
                <a href="produto.html?id=${product.id}">
                    <img src="${getShopProductImage(product.imagem, product.id)}" alt="${product.nome}" class="product-img" loading="lazy" onerror="this.src='img/produto1.jpg'">
                </a>
                <h3 class="product-name"><a href="produto.html?id=${product.id}">${product.nome}</a></h3>
                ${product.marca ? `<span class="product-brand">${product.marca}</span>` : ''}
                ${variantHtml}
                ${product.descricao ? `<p class="product-short-desc">${product.descricao}</p>` : ''}
                <div class="product-prices">
                    ${oldPrice}
                    <span class="new-price">€${product.price.toFixed(2)}</span>
                </div>
                ${product.inStock === false
                    ? `<button class="btn-basket btn-out-of-stock" data-product-id="${product.id}" disabled style="background:#94a3b8;cursor:not-allowed;opacity:0.7;">Out of Stock</button>`
                    : `<button class="btn-basket" data-product-id="${product.id}">ADD TO BASKET</button>`
                }
            </article>
        `;
    }).join('');
    
    // Garantir que imagens lazy fiquem visíveis ao carregar (CSS usa opacity 0 até .loaded)
    grid.querySelectorAll('img.product-img[loading="lazy"]').forEach(img => {
        if (img.complete && img.naturalWidth > 0) img.classList.add('loaded');
        else img.addEventListener('load', function() { this.classList.add('loaded'); });
    });
    
    // Delegação no grid: carrinho e wishlist (uma vez por grid, evita múltiplos listeners)
    if (!grid._shopGridClickBound) {
        grid._shopGridClickBound = true;
        
        // Variant select change → update price
        grid.addEventListener('change', function(e) {
            const sel = e.target.closest('.card-variant-select');
            if (!sel) return;
            const opt = sel.options[sel.selectedIndex];
            const price = parseFloat(opt.dataset.price);
            if (!price || isNaN(price)) return;
            const card = sel.closest('.product-card');
            if (!card) return;
            const newPriceEl = card.querySelector('.new-price');
            if (newPriceEl) newPriceEl.textContent = `€${price.toFixed(2)}`;
            const oldPriceVal = parseFloat(opt.dataset.oldPrice);
            const oldPriceEl = card.querySelector('.old-price');
            if (oldPriceVal && !isNaN(oldPriceVal) && oldPriceVal > price) {
                if (oldPriceEl) { oldPriceEl.textContent = `${currency}${oldPriceVal.toFixed(2)}`; oldPriceEl.style.display = ''; }
                else { /* RRP removed */ }
            } else if (oldPriceEl) { oldPriceEl.style.display = 'none'; }
        });
        
        grid.addEventListener('click', function(e) {
            const icon = e.target.closest('.wishlist-icon');
            if (icon) {
                e.preventDefault();
                e.stopPropagation();
                const productId = parseInt(icon.getAttribute('data-product-id'), 10);
                if (productId && !isNaN(productId) && typeof window.toggleWishlist === 'function') {
                    const isNowIn = window.toggleWishlist(productId);
                    icon.classList.toggle('active', isNowIn);
                    icon.textContent = isNowIn ? '♥' : '♡';
                }
                return;
            }
            const btn = e.target.closest('.btn-basket');
            if (!btn) return;
            e.preventDefault();
            e.stopPropagation();
            const rawId = btn.getAttribute('data-product-id');
            const numId = parseInt(rawId, 10);
            const productId = (!isNaN(numId) && String(numId) === rawId) ? numId : rawId;
            if (productId) {
                // Buscar produto nos dados carregados do shop
                const product = allProducts.find(p => p.id === productId || p.id == productId || p._supabase_id === rawId);
                // Bloquear se produto sem stock
                if (product && product.inStock === false) {
                    btn.textContent = 'Out of Stock';
                    btn.disabled = true;
                    btn.style.background = '#94a3b8';
                    btn.style.cursor = 'not-allowed';
                    return;
                }

                if (product && typeof window.addToCart === 'function') {
                    const imagemProcessada = getShopProductImage(product.imagem, productId);
                    const shopProductData = { nome: product.nome, preco: product.preco || product.price, imagem: imagemProcessada };

                    // Verificar se tem variantes (Supabase first, then description fallback)
                    const hasSupaV = product.variantes && product.variantes.length > 0 &&
                        product.variantes.some(g => g.options && g.options.length > 0);
                    if (hasSupaV && typeof window.showSupabaseVariantModal === 'function') {
                        window.showSupabaseVariantModal(product, function(selected) {
                            const cartData = Object.assign({}, shopProductData);
                            cartData.nome = cartData.nome + ' — ' + selected.label;
                            cartData.variant = selected.label;
                            cartData.variantId = selected.id;
                            cartData.preco = selected.price || cartData.preco;
                            window.addToCart(productId, 1, cartData);
                        });
                        return;
                    }
                    const descV = (typeof window.extractProductVariants === 'function') ? window.extractProductVariants(product) : null;
                    if (descV && typeof window.showVariantModal === 'function') {
                        window.showVariantModal(product, descV, function(selectedVariant) {
                            const cartData = Object.assign({}, shopProductData);
                            cartData.nome = cartData.nome + ' — ' + selectedVariant;
                            cartData.variant = selectedVariant;
                            cartData.variantType = descV.type;
                            window.addToCart(productId, 1, cartData);
                        });
                        return;
                    }

                    window.addToCart(productId, 1, shopProductData);
                } else if (typeof window.addToCart === 'function') {
                    window.addToCart(productId, 1);
                }
            }
        });
    }
    
    // Adicionar quick actions (wishlist, compare, quick view) aos cards
    if (typeof addQuickActionsToCards === 'function') {
        setTimeout(() => {
            addQuickActionsToCards();
        }, 100);
    }
}

// Render pagination
// Render pagination
function renderPagination() {
    const pagination = document.getElementById('pagination');
    if (!pagination) {
        // console.warn('⚠️ Shop: pagination element not found');
        return;
    }
    
    const totalPages = Math.ceil(filteredProducts.length / productsPerPage);
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let paginationHTML = '';
    
    // Previous button
    paginationHTML += `<button ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${currentPage - 1})">← Previous</button>`;
    
    // Page numbers
    const maxPagesToShow = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
    
    if (endPage - startPage < maxPagesToShow - 1) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    
    if (startPage > 1) {
        paginationHTML += `<button onclick="goToPage(1)">1</button>`;
        if (startPage > 2) {
            paginationHTML += `<span>...</span>`;
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `<button class="${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            paginationHTML += `<span>...</span>`;
        }
        paginationHTML += `<button onclick="goToPage(${totalPages})">${totalPages}</button>`;
    }
    
    // Next button
    paginationHTML += `<button ${currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${currentPage + 1})">Next →</button>`;
    
    pagination.innerHTML = paginationHTML;
}

// Go to page
function goToPage(page) {
    const totalPages = Math.ceil(filteredProducts.length / productsPerPage);
    if (page >= 1 && page <= totalPages) {
        currentPage = page;
        renderProducts();
        renderPagination();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// Update products count
function updateProductsCount() {
    const count = document.getElementById('productsCount');
    if (count) {
        count.textContent = `${filteredProducts.length} product${filteredProducts.length !== 1 ? 's' : ''} found`;
    }
}

// Add to cart — delegates to cart.js (window.addToCart) + shop page visual feedback
function shopPageAddToCart(productId) {
    const product = allProducts.find(p => p.id === productId);
    if (!product) {
        console.error('Product not found in allProducts:', productId);
        return;
    }

    // Prepare product data with processed image path
    const imagemProcessada = getShopProductImage(product.imagem, productId);
    const productData = {
        nome: product.nome,
        preco: product.preco,
        imagem: imagemProcessada
    };

    // Delegate to cart.js canonical addToCart
    if (typeof window.addToCart === 'function' && window.addToCart !== shopPageAddToCart) {
        window.addToCart(productId, 1, productData);
    } else {
        // Fallback: add directly if cart.js not loaded yet
        let cart = JSON.parse(localStorage.getItem('cart') || '[]');
        const existingItem = cart.find(item => item.id === productId);
        if (existingItem) {
            existingItem.quantidade += 1;
        } else {
            cart.push({ id: productId, ...productData, quantidade: 1 });
        }
        localStorage.setItem('cart', JSON.stringify(cart));
        if (typeof window.updateCartCount === 'function') window.updateCartCount();
    }

    // Shop page specific visual feedback
    const button = document.querySelector(`.btn-basket[data-product-id="${productId}"]`);
    if (button) {
        const originalText = button.textContent;
        button.textContent = '✓ ADDED';
        button.style.background = '#00A651';
        setTimeout(() => {
            button.textContent = originalText;
            button.style.background = '';
        }, 2000);
    }
}

// Wishlist: usar sempre window.toggleWishlist (definido em global-fixes). Não definir toggleWishlist aqui para não sobrescrever o global e causar recursão.

// Nota: initializeFilterToggles está definida em filtros.js

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    
    // Load products (filtros.js já inicializa os filter toggles)
    loadProducts();
    
    // Filter event listeners (use event delegation for dynamically loaded content)
    document.addEventListener('change', (e) => {
        if (e.target.matches('.brand-filter-all')) {
            toggleBrandSubcategories(e.target);
            currentPage = 1;
            applyFilters();
        } else if (e.target.matches('.brand-filter, .subcategory-filter, .dietary-filter, .brand-sub-filter')) {
            currentPage = 1;
            applyFilters();
        }
    });
    
    document.getElementById('applyPriceFilter')?.addEventListener('click', () => {
        currentPage = 1;
        applyFilters();
    });
    
    // Custom Sort Select
    initCustomSortSelect();
    
    // Fallback for native sort select (if exists)
    document.getElementById('sortSelect')?.addEventListener('change', (e) => {
        currentSort = e.target.value;
        currentPage = 1;
        applyFilters();
    });
    
    // View toggle
    document.querySelectorAll('.view-toggle button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.view-toggle button').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentView = e.target.getAttribute('data-view');
            renderProducts();
        });
    });
    
    // Mobile filters toggle
    document.getElementById('mobileFiltersToggle')?.addEventListener('click', () => {
        const filters = document.getElementById('shopFilters');
        filters.classList.toggle('active');
    });
    
    // Category toggle buttons - expandir/colapsar categorias
    document.querySelectorAll('.filter-category-toggle').forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            const category = toggle.getAttribute('data-category');
            const subcategoryGroup = document.getElementById(`filter-subcategory-${category}`);
            
            // Toggle active class
            toggle.classList.toggle('active');
            
            // Expand/collapse subcategory group
            if (subcategoryGroup) {
                if (toggle.classList.contains('active')) {
                    subcategoryGroup.classList.add('active');
                } else {
                    subcategoryGroup.classList.remove('active');
                }
            }
            
            // Apply filters
            currentPage = 1;
            applyFilters();
        });
    });
    
    // Search input
    document.getElementById('busca')?.addEventListener('input', (e) => {
        currentPage = 1;
        applyFilters();
    });
    
    // Handle URL hash changes
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.replace('#', '');
        if (hash) {
            const hashParts = hash.split('#');
            activateCategoryFilter(hashParts[0], hashParts[1] || null);
        }
    });
});

// Function to activate a category filter from URL hash
function activateCategoryFilter(category, subcategory) {
    // First, deactivate all category toggles
    document.querySelectorAll('.filter-category-toggle.active').forEach(toggle => {
        toggle.classList.remove('active');
        const subcategoryGroup = document.getElementById(`filter-subcategory-${toggle.getAttribute('data-category')}`);
        if (subcategoryGroup) {
            subcategoryGroup.classList.remove('active');
            subcategoryGroup.style.maxHeight = null;
        }
    });
    
    // Find and activate the target category toggle
    const categoryToggle = document.querySelector(`.filter-category-toggle[data-category="${category}"]`);
    if (categoryToggle) {
        // Add active class to toggle
        categoryToggle.classList.add('active');
        
        // Expand the subcategory group
        const subcategoryGroup = document.getElementById(`filter-subcategory-${category}`);
        if (subcategoryGroup) {
            subcategoryGroup.classList.add('active');
            subcategoryGroup.style.maxHeight = subcategoryGroup.scrollHeight + 'px';
            subcategoryGroup.style.display = 'block';
        }
        
        // Scroll to filters on mobile
        if (window.innerWidth < 768) {
            categoryToggle.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        
        // If subcategory hash provided, check the matching checkbox
        if (subcategory) {
            const subCheckboxes = subcategoryGroup ? subcategoryGroup.querySelectorAll('.subcategory-filter') : [];
            subCheckboxes.forEach(cb => {
                const val = (cb.value || '').toLowerCase();
                const id = (cb.id || '').toLowerCase();
                if (val.toLowerCase() === subcategory.toLowerCase() || 
                    id.includes(subcategory.toLowerCase())) {
                    cb.checked = true;
                }
            });
        }

        // Apply filters
        currentPage = 1;
        applyFilters();
    }
}
