// Product Page JavaScript

let currentProduct = null;
window.currentProduct = null; // Expose for reviews.js
let currentQuantity = 1;
let selectedVariants = {};

// Helper function para obter produtos (com fallback para file://)
async function getProductsData() {
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

// Category mapping - Updated for 279 products catalog
const categoryMap = {
    // Novas categorias (279 produtos)
    'Nutrição Esportiva': 'Nutrition',
    'iGSPORT': 'Electronics',
    'Lock Laces': 'Accessories',
    "Chamois Butt'r": 'Cycling',
    'Run Accessories': 'Running',
    'Spatzwear': 'Cycling',
    'Swim Secure': 'Swimming',
    'Zone 3': 'Triathlon',
    'Blackwitch': 'Accessories',
    'Swimming & Watersports': 'Swimming',
    // Categorias antigas (compatibilidade)
    'Nutricao': 'Nutrition',
    'Ciclismo': 'Cycling',
    'Natacao': 'Swimming',
    'Corrida': 'Running',
    'Triathlon': 'Triathlon',
    'Acessorios': 'Accessories',
    'Eletronicos': 'Electronics'
};

// Calculate total stock (sum of variant stocks if variants exist)
function calculateTotalStock(product) {
    const variants = product.variantes;
    if (variants && variants.length > 0) {
        let total = 0;
        variants.forEach(group => {
            group.options.forEach(opt => {
                if (opt.stock != null) total += opt.stock;
            });
        });
        return total;
    }
    // No variants — use product-level stock
    return product._stock_qty != null ? product._stock_qty : null;
}

// Load product from URL parameter
async function loadProduct() {
    try {
        // Get product ID from URL — supports both numeric legacy IDs and UUIDs
        const urlParams = new URLSearchParams(window.location.search);
        const rawId = urlParams.get('id');
        const numId = parseInt(rawId);
        const productId = (!isNaN(numId) && String(numId) === rawId) ? numId : rawId;

        // Usar helper para obter produtos
        const productsArray = await getProductsData();

        // Find product by ID (numeric legacy_id or UUID _supabase_id)
        const product = productsArray.find(p => p.id === productId || p.id == productId || p._supabase_id === productId);

        if (!product) {
            document.getElementById('productTitle').textContent = 'Product Not Found';
            return;
        }

        currentProduct = {
            ...product,
            categoryEn: categoryMap[product.categoria] || product.categoria,
            price: parseFloat(product.preco) || 0,
            oldPrice: parseFloat(product.preco_antigo) || null,
            discount: product.desconto || 0,
            inStock: product.em_stock !== false,
            stockQty: calculateTotalStock(product)
        };
        window.currentProduct = currentProduct; // Expose for reviews.js

        // Render product
        renderProduct();

        // Load all product sections immediately
        loadRelatedProducts(product.relacionados || []);

        // Load promotion products and best sellers
        loadPromotionProducts();
        loadBestSellers();

    } catch (error) {
        console.error('Error loading product:', error);
        document.getElementById('productTitle').textContent = 'Error loading product';
    }
}

// Render product information
function renderProduct() {
    if (!currentProduct) return;

    // Title
    document.getElementById('productTitle').textContent = currentProduct.nome;

    // Brand (with link to shop filtered by brand)
    const brandEl = document.getElementById('productBrand');
    if (brandEl && currentProduct.marca) {
        brandEl.textContent = currentProduct.marca;
        brandEl.href = 'shop.html?brand=' + encodeURIComponent(currentProduct.marca);
        brandEl.style.display = 'inline-block';
    }

    // Breadcrumb (both desktop and mobile)
    const breadcrumbCategory = document.getElementById('breadcrumbCategory');
    const breadcrumbProduct = document.getElementById('breadcrumbProduct');
    const breadcrumbCategoryDesktop = document.getElementById('breadcrumbCategoryDesktop');
    const breadcrumbProductDesktop = document.getElementById('breadcrumbProductDesktop');

    const categoryLink = 'shop.html#' + (currentProduct.categoryEn || '').toLowerCase();
    if (breadcrumbCategory) {
        breadcrumbCategory.textContent = currentProduct.categoryEn;
        breadcrumbCategory.href = categoryLink;
    }
    if (breadcrumbProduct) breadcrumbProduct.textContent = currentProduct.nome;
    if (breadcrumbCategoryDesktop) {
        breadcrumbCategoryDesktop.textContent = currentProduct.categoryEn;
        breadcrumbCategoryDesktop.href = categoryLink;
    }
    if (breadcrumbProductDesktop) breadcrumbProductDesktop.textContent = currentProduct.nome;

    // Rating
    const rating = currentProduct.rating || 0;
    const reviews = currentProduct.reviews || 0;
    document.getElementById('productRating').textContent = '⭐'.repeat(Math.floor(rating));
    document.getElementById('productReviewCount').textContent = `(${reviews} reviews)`;

    // Short description
    const shortDescEl = document.getElementById('productShortDesc');
    if (shortDescEl && currentProduct.descricao) {
        shortDescEl.textContent = currentProduct.descricao;
        shortDescEl.style.display = 'block';
    }

    // 12-Month Warranty (Wetsuits + Electronics: Bike Computers, Sensors, Lights)
    const warrantySubcats = ['Openwater Wetsuits', 'Triathlon Wetsuits', 'Bike Computers', 'Sensors & Monitors', 'Lights'];
    const sub = currentProduct.subcategoria || '';
    if (warrantySubcats.includes(sub)) {
        const badge = document.getElementById('warrantyBadge');
        const section = document.getElementById('warrantySection');
        if (badge) badge.style.display = 'block';
        if (section) {
            section.style.display = 'block';
            const txt = document.getElementById('warrantyText');
            if (txt) {
                if (sub.includes('Wetsuit')) {
                    txt.textContent = 'This wetsuit comes with a 12-month manufacturer warranty against manufacturing defects including seam failure, zipper issues and neoprene delamination. Normal wear and tear is not covered. Please retain your proof of purchase.';
                } else {
                    txt.textContent = 'This electronic product comes with a 12-month manufacturer warranty covering hardware defects and malfunctions under normal use. Software issues and physical damage are not covered. Please retain your proof of purchase.';
                }
            }
        }
    }

    // Price
    document.getElementById('productPrice').textContent = `€${currentProduct.price.toFixed(2)}`;

    if (currentProduct.oldPrice && currentProduct.oldPrice > currentProduct.price) {
        document.getElementById('productOldPrice').textContent = `€${currentProduct.oldPrice.toFixed(2)}`;
        document.getElementById('productOldPrice').style.display = 'inline';
    } else {
        document.getElementById('productOldPrice').style.display = 'none';
    }

    if (currentProduct.discount > 0) {
        document.getElementById('productDiscount').textContent = `-${currentProduct.discount}%`;
        document.getElementById('productDiscount').style.display = 'inline-block';
    } else {
        document.getElementById('productDiscount').style.display = 'none';
    }

    // ── Variants ──
    renderProductVariants(currentProduct);

    // Description (in accordion) — supports HTML or plain text
    const descriptionFull = document.getElementById('productDescriptionFull');
    if (descriptionFull) {
        const desc = currentProduct.descricao_detalhada || 'No description available.';
        // Se a descrição contém tags HTML, renderiza direto; senão converte \n para <br>
        if (/<[a-z][\s\S]*>/i.test(desc)) {
            descriptionFull.innerHTML = desc;
        } else {
            descriptionFull.innerHTML = `<p>${desc.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
        }
    }

    // Description visible above accordion — mostra apenas texto plano (preview)
    const descriptionVisible = document.getElementById('productDescriptionVisible');
    if (descriptionVisible && currentProduct.descricao_detalhada) {
        // Strip HTML tags para preview limpo
        const plainText = currentProduct.descricao_detalhada.replace(/<[^>]*>/g, '');
        descriptionVisible.textContent = plainText;
        descriptionVisible.style.display = 'block';
    }

    // Main image
    const mainMediaContainer = document.getElementById('productMainMedia');
    const mainImage = document.getElementById('productMainImage');
    const defaultMainImage = 'img/produto1.jpg';
    const isVideoUrl = (url) => /\.(mp4|webm|mov)(\?|$)/i.test(url);

    // Helper: set main media (image or video)
    function setMainMedia(src, alt) {
        if (isVideoUrl(src)) {
            mainMediaContainer.innerHTML = `<video src="${src}" controls autoplay muted playsinline style="width:100%;height:100%;object-fit:contain;display:block;border-radius:inherit"></video>`;
        } else {
            mainMediaContainer.innerHTML = `<img id="productMainImage" src="${src}" alt="${(alt || '').replace(/"/g, '&quot;')}" loading="eager" style="width:100%;height:100%;object-fit:contain;display:block" onerror="this.onerror=null;this.src='${defaultMainImage}'">`;
        }
    }

    // Normalize extension: Supabase may have .jpg/.png but real files are .webp
    if (currentProduct.imagem && currentProduct.imagem.includes('produtos-279/')) {
        currentProduct.imagem = currentProduct.imagem.replace(/\.(jpg|jpeg|png)$/i, '.webp');
    }
    if (currentProduct.imagem && currentProduct.imagem.trim() !== '') {
        let src = currentProduct.imagem;
        if (/^https?:\/\//i.test(src)) { /* absolute URL — use as-is */ }
        else if (src.startsWith('img/')) { /* already prefixed */ }
        else { src = `img/${src}`; }
        setMainMedia(src, currentProduct.nome);
    } else {
        setMainMedia(defaultMainImage, currentProduct.nome);
    }

    // Thumbnails — use product_images array from Supabase
    const thumbnailsContainer = document.getElementById('productThumbnails');
    const defaultThumb = 'produto1.jpg';

    // Build media list from imagens array (multi-image + video support)
    let allMedia = [];
    if (currentProduct.imagens && currentProduct.imagens.length > 0) {
        allMedia = currentProduct.imagens.map(img => {
            let src = img.url || '';
            if (/^https?:\/\//i.test(src)) { /* absolute */ }
            else if (src.startsWith('img/')) { /* prefixed */ }
            else if (src.includes('produtos-279/')) { src = 'img/' + src.replace(/\.(jpg|jpeg|png)$/i, '.webp'); }
            else if (src) { src = 'img/' + src; }
            return { src, alt: img.alt || currentProduct.nome, isVideo: isVideoUrl(src) };
        }).filter(img => img.src);
    }

    // Fallback: use main image if no imagens array
    if (allMedia.length === 0 && currentProduct.imagem && currentProduct.imagem.trim()) {
        let src = currentProduct.imagem;
        if (/^https?:\/\//i.test(src)) { /* absolute */ }
        else if (src.startsWith('img/')) { /* prefixed */ }
        else { src = 'img/' + src; }
        allMedia.push({ src, alt: currentProduct.nome, isVideo: isVideoUrl(src) });
    }

    // Set main media to first in array
    if (allMedia.length > 0) {
        setMainMedia(allMedia[0].src, allMedia[0].alt);
    }

    // Only show thumbnails if we have more than 1 media item
    if (allMedia.length > 1) {
        thumbnailsContainer.innerHTML = allMedia.map((item, index) => {
            if (item.isVideo) {
                return `<div class="product-thumbnail ${index === 0 ? 'active' : ''}" data-src="${item.src}" data-type="video" style="position:relative;cursor:pointer;width:80px;height:80px;border-radius:8px;overflow:hidden;border:2px solid ${index === 0 ? 'var(--accent-green, #2D6A4F)' : '#ddd'}">
                    <video src="${item.src}" style="width:100%;height:100%;object-fit:cover" muted preload="metadata"></video>
                    <span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:20px;color:#fff;text-shadow:0 0 6px rgba(0,0,0,0.8);pointer-events:none">▶</span>
                </div>`;
            } else {
                return `<img src="${item.src}" 
                     alt="${(item.alt || '').replace(/"/g, '&quot;')} ${index + 1}" 
                     class="product-thumbnail ${index === 0 ? 'active' : ''}"
                     data-src="${item.src}" data-type="image"
                     onerror="this.onerror=null; this.src='img/${defaultThumb}';">`;
            }
        }).join('');
        thumbnailsContainer.style.display = '';
    } else {
        thumbnailsContainer.innerHTML = '';
        thumbnailsContainer.style.display = 'none';
    }

    // Thumbnail click handlers (images + videos)
    thumbnailsContainer.querySelectorAll('.product-thumbnail, .product-thumbnail[data-src]').forEach(thumb => {
        thumb.addEventListener('click', function () {
            thumbnailsContainer.querySelectorAll('.product-thumbnail, [data-src]').forEach(t => { t.classList.remove('active'); if (t.style) t.style.borderColor = '#ddd'; });
            this.classList.add('active');
            if (this.style) this.style.borderColor = 'var(--accent-green, #2D6A4F)';
            const src = this.getAttribute('data-src') || this.getAttribute('data-image') || this.src;
            setMainMedia(src, currentProduct.nome);
        });
    });

    // Specifications (in accordion)
    const specs = document.getElementById('productSpecifications');
    if (specs) {
        specs.innerHTML = `
            <table>
                <tr>
                    <td>Category</td>
                    <td>${currentProduct.categoryEn}</td>
                </tr>
                <tr>
                    <td>Subcategory</td>
                    <td>${currentProduct.subcategoria}</td>
                </tr>
                <tr>
                    <td>Brand</td>
                    <td>${currentProduct.marca}</td>
                </tr>
                <tr>
                    <td>Stock</td>
                    <td>${currentProduct.stockQty != null ? (currentProduct.stockQty > 0 ? '<span style="color:#2D6A4F;font-weight:600">In Stock</span>' : '<span style="color:#e74c3c;font-weight:600">Out of Stock</span>') : (currentProduct.inStock ? 'In Stock' : 'Out of Stock')}</td>
                </tr>
            </table>
        `;
    }

    // Technologies (in accordion)
    const technologies = document.getElementById('productTechnologies');
    if (technologies) {
        technologies.innerHTML = `
            <p>${currentProduct.tecnologias || currentProduct.descricao_curta || 'Product technologies and features information will be displayed here.'}</p>
        `;
    }

    // ── Subscribe & Save (disabled — re-enable later) ──
    // initSubscribeSave(currentProduct);
}

// ════════════════════════════════════════════════
// SUBSCRIBE & SAVE — Nutrition products only (15% off)
// ════════════════════════════════════════════════
// Progressive discount: 5% first, 10% second, 15% from third
const SUBSCRIBE_TIERS = [
    { delivery: 1, discount: 0.05, label: '5%' },
    { delivery: 2, discount: 0.10, label: '10%' },
    { delivery: 3, discount: 0.15, label: '15%' }
];
const SUBSCRIBE_FIRST_DISCOUNT = 0.05;
let isSubscription = false;

function initSubscribeSave(product) {
    const container = document.getElementById('subscribeContainer');
    if (!container) return;

    // Only show for Nutrition category
    const cat = (product.categoryEn || product.categoria || '').toLowerCase();
    const isNutrition = cat === 'nutrition' || cat === 'nutrição esportiva' || cat === 'nutricao';
    if (!isNutrition) {
        container.style.display = 'none';
        isSubscription = false;
        return;
    }

    // Show the component
    container.style.display = '';
    isSubscription = false;

    const price = product.price || parseFloat(product.preco) || 0;
    const subPrice = price * (1 - SUBSCRIBE_FIRST_DISCOUNT);
    const savings = price - subPrice;

    // Update dynamic prices (first delivery = 5%)
    const onetimeEl = document.getElementById('onetimePrice');
    const subPriceEl = document.getElementById('subscriptionPrice');
    const savingsEl = document.getElementById('savingsAmount');

    if (onetimeEl) onetimeEl.textContent = '€' + price.toFixed(2);
    if (subPriceEl) subPriceEl.textContent = '€' + subPrice.toFixed(2) + ' /delivery';
    if (savingsEl) savingsEl.textContent = 'Save €' + savings.toFixed(2);

    // Update progressive tiers info
    const tiersEl = document.getElementById('subscribeTiers');
    if (tiersEl) {
        const p = price;
        tiersEl.innerHTML = '<div class="subscribe-tiers-title">🎯 Loyalty rewards — save more as you stay:</div>' +
            '<div class="subscribe-tier"><span class="tier-dot t1"></span>1st delivery: <strong>5% off</strong> — €' + (p * 0.95).toFixed(2) + '</div>' +
            '<div class="subscribe-tier"><span class="tier-dot t2"></span>2nd delivery: <strong>10% off</strong> — €' + (p * 0.90).toFixed(2) + '</div>' +
            '<div class="subscribe-tier"><span class="tier-dot t3"></span>3rd+ delivery: <strong>15% off</strong> — €' + (p * 0.85).toFixed(2) + '</div>';
    }

    // Reset to one-time selected
    const radios = container.querySelectorAll('input[name="purchase_type"]');
    radios.forEach(r => r.checked = (r.value === 'onetime'));

    // Reset option styling
    const options = container.querySelectorAll('.subscribe-option');
    if (options[0]) options[0].classList.add('selected');
    if (options[1]) options[1].classList.remove('selected');

    // Hide frequency selector and tiers
    const freqSelect = document.getElementById('frequencySelect');
    if (freqSelect) freqSelect.style.display = 'none';
    if (tiersEl) tiersEl.style.display = 'none';
}

window.updateSubscription = function(isSub) {
    isSubscription = isSub;
    const freqSelect = document.getElementById('frequencySelect');
    const tiersEl = document.getElementById('subscribeTiers');
    if (freqSelect) freqSelect.style.display = isSub ? 'block' : 'none';
    if (tiersEl) tiersEl.style.display = isSub ? 'block' : 'none';

    // Update main price display (first delivery = 5%)
    if (currentProduct) {
        const price = currentProduct.price || parseFloat(currentProduct.preco) || 0;
        const displayPrice = isSub ? price * (1 - SUBSCRIBE_FIRST_DISCOUNT) : price;
        const priceEl = document.getElementById('productPrice');
        if (priceEl) priceEl.textContent = '€' + displayPrice.toFixed(2);

        const oldPriceEl = document.getElementById('productOldPrice');
        if (oldPriceEl) {
            if (isSub) {
                oldPriceEl.textContent = '€' + price.toFixed(2);
                oldPriceEl.style.display = 'inline';
            } else if (currentProduct.oldPrice && currentProduct.oldPrice > price) {
                oldPriceEl.textContent = '€' + currentProduct.oldPrice.toFixed(2);
                oldPriceEl.style.display = 'inline';
            } else {
                oldPriceEl.style.display = 'none';
            }
        }
    }
};

// Load related products
async function loadRelatedProducts(relatedIds) {
    try {
        const productsArray = await getProductsData();

        let relatedProducts = [];

        // Get related products by ID
        if (relatedIds && relatedIds.length > 0) {
            relatedProducts = productsArray
                .filter(p => relatedIds.includes(p.id))
                .slice(0, 4);
        }

        // If not enough related products, get products from same category
        if (relatedProducts.length < 4 && currentProduct) {
            const sameCategory = productsArray
                .filter(p => p.categoria === currentProduct.categoria && p.id !== currentProduct.id && !relatedProducts.find(rp => rp.id === p.id))
                .slice(0, 4 - relatedProducts.length);

            relatedProducts.push(...sameCategory);
        }

        // If still not enough, get any products
        if (relatedProducts.length < 4) {
            const anyProducts = productsArray
                .filter(p => p.id !== currentProduct?.id && !relatedProducts.find(rp => rp.id === p.id))
                .slice(0, 4 - relatedProducts.length);

            relatedProducts.push(...anyProducts);
        }

        // Map products to correct format
        const mappedProducts = relatedProducts.slice(0, 4).map(product => ({
            ...product,
            categoryEn: categoryMap[product.categoria] || product.categoria,
            price: parseFloat(product.preco) || 0,
            oldPrice: parseFloat(product.preco_antigo) || null,
            discount: product.desconto || 0
        }));

        renderRelatedProducts(mappedProducts);

    } catch (error) {
        console.error('Error loading related products:', error);
        // Show error message in container
        const container = document.getElementById('relatedProductsGrid');
        if (container) {
            container.innerHTML = '<p>Error loading related products. Please refresh the page.</p>';
        }
    }
}

// Render related products
function renderRelatedProducts(products) {
    renderProductCards(products, 'relatedProductsGrid');
}

// Quantity controls
document.addEventListener('DOMContentLoaded', () => {
    const decreaseBtn = document.getElementById('quantityDecrease');
    const increaseBtn = document.getElementById('quantityIncrease');
    const quantityInput = document.getElementById('quantityInput');

    decreaseBtn?.addEventListener('click', () => {
        const current = parseInt(quantityInput.value) || 1;
        if (current > 1) {
            quantityInput.value = current - 1;
            currentQuantity = current - 1;
        }
        updateQuantityButtons();
    });

    increaseBtn?.addEventListener('click', () => {
        const current = parseInt(quantityInput.value) || 1;
        const max = parseInt(quantityInput.max) || 10;
        if (current < max) {
            quantityInput.value = current + 1;
            currentQuantity = current + 1;
        }
        updateQuantityButtons();
    });

    quantityInput?.addEventListener('change', (e) => {
        const value = parseInt(e.target.value) || 1;
        const min = parseInt(e.target.min) || 1;
        const max = parseInt(e.target.max) || 10;
        currentQuantity = Math.max(min, Math.min(max, value));
        e.target.value = currentQuantity;
        updateQuantityButtons();
    });

    function updateQuantityButtons() {
        const current = parseInt(quantityInput.value) || 1;
        const min = parseInt(quantityInput.min) || 1;
        const max = parseInt(quantityInput.max) || 10;
        decreaseBtn.disabled = current <= min;
        increaseBtn.disabled = current >= max;
    }

    // Accordion functionality
    document.querySelectorAll('.accordion-header').forEach(header => {
        header.addEventListener('click', function () {
            const accordionId = this.getAttribute('data-accordion');
            const content = document.getElementById(`accordion-${accordionId}`);
            const isActive = this.classList.contains('active');

            // Close all accordions
            document.querySelectorAll('.accordion-header').forEach(h => {
                h.classList.remove('active');
            });
            document.querySelectorAll('.accordion-content').forEach(c => {
                c.classList.remove('active');
            });

            // Toggle clicked accordion
            if (!isActive) {
                this.classList.add('active');
                if (content) {
                    content.classList.add('active');
                }
            }
        });
    });

    // Add to cart
    document.getElementById('addToCartBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (currentProduct) {
            productPageAddToCart(currentProduct.id);
        } else {
            console.error('currentProduct is not set');
        }
    });

    // Buy now
    document.getElementById('buyNowBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (currentProduct) {
            productPageAddToCart(currentProduct.id);
            setTimeout(() => {
                window.location.href = 'cart.html';
            }, 100);
        } else {
            console.error('currentProduct is not set');
        }
    });

    // Initialize accordion on page load (for static HTML)
    // Accordion is initialized inline above, no need for separate function

    // Load product
    loadProduct();
});

// Load promotion products
async function loadPromotionProducts() {
    try {
        const productsArray = await getProductsData();

        // Get products with discount > 0, excluding current product
        const currentProductId = currentProduct?.id || null;
        let promotionProducts = productsArray
            .filter(p => (p.desconto || 0) > 0 && p.id !== currentProductId)
            .sort((a, b) => (b.desconto || 0) - (a.desconto || 0))
            .slice(0, 4);

        // If not enough promotion products, fill with any products
        if (promotionProducts.length < 4) {
            const anyProducts = productsArray
                .filter(p => p.id !== currentProductId && !promotionProducts.find(pp => pp.id === p.id))
                .slice(0, 4 - promotionProducts.length);
            promotionProducts.push(...anyProducts);
        }

        const mappedProducts = promotionProducts.map(product => ({
            ...product,
            categoryEn: categoryMap[product.categoria] || product.categoria,
            price: parseFloat(product.preco) || 0,
            oldPrice: parseFloat(product.preco_antigo) || null,
            discount: product.desconto || 0
        }));

        renderProductCards(mappedProducts, 'promotionProductsGrid');

    } catch (error) {
        console.error('Error loading promotion products:', error);
        const container = document.getElementById('promotionProductsGrid');
        if (container) {
            container.innerHTML = '<p>Error loading promotion products. Please refresh the page.</p>';
        }
    }
}

// Load best sellers
async function loadBestSellers() {
    try {
        const productsArray = await getProductsData();

        // Get best sellers (products with highest rating and reviews, excluding current product)
        const currentProductId = currentProduct?.id || null;
        const allBestSellers = productsArray.filter(p => p.id !== currentProductId);

        const bestSellers = allBestSellers
            .sort((a, b) => {
                // Sort by rating first, then by number of reviews
                const ratingDiff = (b.rating || 0) - (a.rating || 0);
                if (ratingDiff !== 0) return ratingDiff;
                return (b.reviews || 0) - (a.reviews || 0);
            })
            .slice(0, 4);

        const mappedProducts = bestSellers.map(product => ({
            ...product,
            categoryEn: categoryMap[product.categoria] || product.categoria,
            price: parseFloat(product.preco) || 0,
            oldPrice: parseFloat(product.preco_antigo) || null,
            discount: product.desconto || 0
        }));

        renderProductCards(mappedProducts, 'bestSellersGrid');

    } catch (error) {
        console.error('Error loading best sellers:', error);
        const container = document.getElementById('bestSellersGrid');
        if (container) {
            container.innerHTML = '<p>Error loading best sellers. Please refresh the page.</p>';
        }
    }
}

// Generic function to render product grid
// (renderProductPageGrid removed — now uses shared createProductCardHTML from product-card.js)

// Add to cart — delegates to cart.js (window.addToCart) + product page visual feedback
function productPageAddToCart(productId) {
    if (!currentProduct) {
        console.error('Current product not set, trying to fetch product data...');
        getProductsData()
            .then(productsArray => {
                const product = productsArray.find(p => p.id === productId);
                if (product) {
                    currentProduct = product;
                    productPageAddToCart(productId);
                }
            })
            .catch(error => console.error('Error fetching product data:', error));
        return;
    }

    // Delegate to cart.js canonical addToCart (handles localStorage, cart count, notification)
    if (typeof window.addToCart === 'function' && window.addToCart !== productPageAddToCart) {
        // Pass subscription info if active
        const subData = isSubscription ? {
            subscription: true,
            frequency: document.querySelector('select[name="delivery_frequency"]')?.value || '4weeks',
            discount: SUBSCRIBE_FIRST_DISCOUNT,
            originalPrice: currentProduct.price || parseFloat(currentProduct.preco) || 0
        } : null;
        window.addToCart(productId, currentQuantity, currentProduct, subData);
    } else {
        // Fallback: add directly to localStorage if cart.js not loaded yet
        let cart = JSON.parse(localStorage.getItem('cart') || '[]');
        const existingItem = cart.find(item => item.id === productId);
        if (existingItem) {
            existingItem.quantidade += currentQuantity;
        } else {
            cart.push({
                id: productId,
                nome: currentProduct.nome,
                preco: currentProduct.preco,
                imagem: currentProduct.imagem,
                quantidade: currentQuantity
            });
        }
        localStorage.setItem('cart', JSON.stringify(cart));
        if (typeof window.updateCartCount === 'function') window.updateCartCount();
    }

    // Product page specific visual feedback
    const addToCartBtn = document.getElementById('addToCartBtn');
    if (addToCartBtn) {
        const originalText = addToCartBtn.textContent;
        addToCartBtn.textContent = '✓ ADDED TO CART';
        addToCartBtn.style.background = '#00A651';
        setTimeout(() => {
            addToCartBtn.textContent = originalText;
            addToCartBtn.style.background = '';
        }, 2000);
    }
}

// ════════════════════════════════════════════════
// VARIANT RENDERING (Product Detail Page)
// ════════════════════════════════════════════════
function renderProductVariants(product) {
    const container = document.getElementById('productVariants');
    if (!container) return;

    const variants = product.variantes;
    if (!variants || variants.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = '';
    container.innerHTML = '';

    // Detect compound variants (labels with " / " separator)
    const hasCompound = variants.some(g => g.options.some(o => o.label && o.label.includes(' / ')));

    if (hasCompound) {
        renderCompoundVariants(container, variants, product);
    } else {
        renderSimpleVariants(container, variants, product);
    }
}

// ── Simple variants: one or more groups, cascade display ──
function renderSimpleVariants(container, variants, product) {
    container.innerHTML = variants.map((group, gi) => {
        const optionsHtml = group.options.map(opt => {
            const outOfStock = opt.stock != null && opt.stock <= 0;
            const priceAttr = opt.price ? `data-price="${opt.price}"` : '';
            const oldPriceAttr = opt.compare_at_price ? `data-old-price="${opt.compare_at_price}"` : '';
            return `<button type="button" class="variant-option${outOfStock ? ' disabled' : ''}"
                data-variant-id="${opt.id}" data-label="${opt.label}" ${priceAttr} ${oldPriceAttr}
                ${outOfStock ? 'disabled' : ''}>${opt.label}${outOfStock ? ' (Out of Stock)' : ''}</button>`;
        }).join('');
        const hidden = gi > 0 ? 'style="display:none"' : '';
        return `<div class="variant-group" data-group-index="${gi}" ${hidden}>
            <label class="variant-label">${group.type}</label>
            <div class="variant-options">${optionsHtml}</div>
        </div>`;
    }).join('');

    container.addEventListener('click', function handler(e) {
        const btn = e.target.closest('.variant-option');
        if (!btn || btn.disabled) return;
        const groupEl = btn.closest('.variant-group');
        const groupIdx = parseInt(groupEl.dataset.groupIndex);
        groupEl.querySelectorAll('.variant-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const allGroups = container.querySelectorAll('.variant-group');
        if (groupIdx + 1 < allGroups.length) {
            const next = allGroups[groupIdx + 1];
            if (next.style.display === 'none') {
                next.style.display = '';
                next.style.animation = 'fadeSlideIn 0.3s ease';
            }
            for (let i = groupIdx + 1; i < allGroups.length; i++) {
                allGroups[i].querySelectorAll('.variant-option').forEach(b => b.classList.remove('selected'));
                if (i > groupIdx + 1) allGroups[i].style.display = 'none';
            }
        }
        updateVariantPrice(btn, product);
    });
}

// ── Compound variants: "Color / Size" → cascading selectors ──
function renderCompoundVariants(container, variants, product) {
    // Collect all compound options
    const allOptions = [];
    variants.forEach(group => {
        group.options.forEach(opt => {
            if (opt.label && opt.label.includes(' / ')) {
                const parts = opt.label.split(' / ');
                allOptions.push({
                    ...opt,
                    level1: parts[0].trim(),
                    level2: parts[1].trim(),
                    groupType: group.type,
                    groupSlug: group.slug
                });
            } else {
                allOptions.push({ ...opt, level1: opt.label, level2: null, groupType: group.type, groupSlug: group.slug });
            }
        });
    });

    // Get unique level 1 values (first part before " / ")
    const level1Values = [...new Set(allOptions.filter(o => o.level1).map(o => o.level1))];
    const hasLevel2 = allOptions.some(o => o.level2);

    // Determine type names
    let type1Name = variants[0]?.type || 'Option';
    let type2Name = 'Size';
    if (hasLevel2) {
        const t1 = type1Name.toLowerCase();
        if (t1 === 'size') type2Name = 'Color';
        else if (t1 === 'color' || t1 === 'colour') type2Name = 'Size';
        else if (t1 === 'flavor' || t1 === 'flavour') type2Name = 'Pack Size';
        else type2Name = 'Option';
    }

    // Build Level 1 HTML
    const level1Html = level1Values.map(val => {
        const matchingOpts = allOptions.filter(o => o.level1 === val);
        const totalStock = matchingOpts.reduce((s, o) => s + (o.stock || 0), 0);
        const outOfStock = totalStock <= 0;
        return `<button type="button" class="variant-option${outOfStock ? ' disabled' : ''}"
            data-level1="${val}" ${outOfStock ? 'disabled' : ''}>${val}${outOfStock ? ' (Out of Stock)' : ''}</button>`;
    }).join('');

    container.innerHTML = `
        <div class="variant-group" data-level="1">
            <label class="variant-label">${type1Name}</label>
            <div class="variant-options">${level1Html}</div>
        </div>
        ${hasLevel2 ? `<div class="variant-group" data-level="2" style="display:none">
            <label class="variant-label" id="variantLevel2Label">${type2Name}</label>
            <div class="variant-options" id="variantLevel2Options"></div>
        </div>` : ''}
    `;

    // Store options data for lookup
    container._compoundOptions = allOptions;

    // Click handler
    container.addEventListener('click', function (e) {
        const btn = e.target.closest('.variant-option');
        if (!btn || btn.disabled) return;

        const groupEl = btn.closest('.variant-group');
        const level = groupEl.dataset.level;

        // Deselect siblings
        groupEl.querySelectorAll('.variant-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');

        if (level === '1' && hasLevel2) {
            const selectedL1 = btn.dataset.level1;
            const level2Group = container.querySelector('[data-level="2"]');
            const level2Opts = container.querySelector('#variantLevel2Options');

            // Get matching level 2 options
            const matching = allOptions.filter(o => o.level1 === selectedL1 && o.level2);

            level2Opts.innerHTML = matching.map(opt => {
                const outOfStock = opt.stock != null && opt.stock <= 0;
                const priceAttr = opt.price ? `data-price="${opt.price}"` : '';
                const oldPriceAttr = opt.compare_at_price ? `data-old-price="${opt.compare_at_price}"` : '';
                return `<button type="button" class="variant-option${outOfStock ? ' disabled' : ''}"
                    data-variant-id="${opt.id}" data-label="${opt.label}" ${priceAttr} ${oldPriceAttr}
                    ${outOfStock ? 'disabled' : ''}>${opt.level2}${outOfStock ? ' (Out of Stock)' : ''}</button>`;
            }).join('');

            // Show level 2 with animation
            level2Group.style.display = '';
            level2Group.style.animation = 'fadeSlideIn 0.3s ease';
        }

        if (level === '2' || !hasLevel2) {
            updateVariantPrice(btn, product);
        }
    });
}

// ── Update price from selected variant ──
function updateVariantPrice(btn, product) {
    const variantPrice = parseFloat(btn.dataset.price);
    const variantOldPrice = parseFloat(btn.dataset.oldPrice);
    if (variantPrice && !isNaN(variantPrice)) {
        const currency = (window._sfiCurrency === 'GBP') ? '£' : '€';
        document.getElementById('productPrice').textContent = `${currency}${variantPrice.toFixed(2)}`;
        const oldPriceEl = document.getElementById('productOldPrice');
        if (variantOldPrice && !isNaN(variantOldPrice) && variantOldPrice > variantPrice) {
            oldPriceEl.textContent = `${currency}${variantOldPrice.toFixed(2)}`;
            oldPriceEl.style.display = 'inline';
        } else if (product.oldPrice && product.oldPrice > variantPrice) {
            oldPriceEl.textContent = `${currency}${product.oldPrice.toFixed(2)}`;
            oldPriceEl.style.display = 'inline';
        } else {
            oldPriceEl.style.display = 'none';
        }
    }
}
