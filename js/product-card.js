/**
 * PRODUCT CARD — Template Unificado
 * ==================================
 * Um único ficheiro que gera o HTML do card de produto.
 * Usado por: main.js, shop.js, product.js, global-fixes.js, offers.js
 * 
 * Baseado no card da página Shop (referência visual).
 * O botão wishlist (coração) é adicionado dinamicamente pelo
 * addQuickActionsToCards() no main.js — NÃO incluído aqui.
 * 
 * Qualquer alteração visual nos cards é feita AQUI e reflecte em todo o site.
 */

// ── Imagens existentes (fallback) ──
const CARD_EXISTING_IMAGES = ['produto1.jpg','produto2.jpg','produto3.jpg','produto4.jpg','produto5.jpg'];

/**
 * Resolve o caminho correcto para a imagem de um produto.
 */
function getCardProductImage(imagem, productId) {
    // Normalize extension: Supabase may have .jpg/.png but real files are .webp
    if (imagem && imagem.includes('produtos-279/')) {
        imagem = imagem.replace(/\.(jpg|jpeg|png)$/i, '.webp');
    }
    if (imagem && imagem.startsWith('img/')) return imagem;
    if (imagem && (imagem.startsWith('produtos-279/') || imagem.startsWith('produtos-site/'))) {
        return `img/${imagem}`;
    }
    if (imagem && /^https?:\/\//i.test(imagem)) return imagem;
    if (imagem && CARD_EXISTING_IMAGES.includes(imagem)) return `img/${imagem}`;
    if (imagem && /^produto\d+\.jpg$/i.test(imagem)) return `img/${imagem}`;
    const fallbackIndex = ((productId - 1) % 5) + 1;
    return `img/produto${fallbackIndex}.jpg`;
}

/**
 * Normaliza um produto vindo do dados.json para formato consistente.
 */
function normalizeProduct(prod) {
    if (!prod || !prod.id) return null;
    return {
        ...prod,
        price:    parseFloat(prod.preco) || parseFloat(prod.price) || 0,
        oldPrice: parseFloat(prod.preco_antigo) || parseFloat(prod.oldPrice) || null,
        discount: prod.desconto || prod.discount || 0,
        nome:     prod.nome || prod.name || 'Product',
        marca:    prod.marca || prod.brand || '',
        rating:   Number(prod.rating) || 0,
        reviews:  prod.reviews != null ? prod.reviews : 0,
        imagem:   prod.imagem || prod.image || ''
    };
}

/**
 * Gera o HTML de um card de produto.
 * Estrutura idêntica ao card da página Shop.
 * O wishlist heart é adicionado depois pelo main.js (addQuickActionsToCards).
 */
function createProductCardHTML(rawProd, opts = {}) {
    const prod = normalizeProduct(rawProd);
    if (!prod) return '';

    const { showBrand = true, lazyLoad = true } = opts;

    const prodId    = prod.id;
    const imgSrc    = getCardProductImage(prod.imagem, prodId);
    const safeName  = (prod.nome || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const safeBrand = (prod.marca || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Discount badge
    const discountBadge = prod.discount > 0
        ? `<span class="badge-desconto">-${prod.discount}%</span>`
        : '';

    // Old price
    const oldPrice = prod.oldPrice && prod.oldPrice > prod.price
        ? `<span class="old-price">€${prod.oldPrice.toFixed(2)}</span>`
        : '';

    // Rating (sempre mostrar: estrelas + número de reviews; 0 quando não houver)
    const numStars = Math.min(5, Math.max(0, Math.floor(Number(prod.rating) || 0)));
    const stars = '★'.repeat(numStars) + '☆'.repeat(5 - numStars);
    const reviewCount = prod.reviews != null ? Number(prod.reviews) : 0;
    const ratingBlock = `<div class="product-rating"><span class="stars">${stars}</span> <span class="review-count">(${reviewCount})</span></div>`;

    // Brand
    const brandBlock = (showBrand && safeBrand)
        ? `<span class="product-brand">${safeBrand}</span>`
        : '';

    const loadAttr = lazyLoad ? 'loading="lazy"' : '';

    // ── Slider de imagens (múltiplas imagens do Supabase) ──
    let dataImagesAttr = '';
    let dotsHTML = '';
    const imagens = prod.imagens || rawProd.imagens || [];
    // Construir lista de URLs normalizadas (filtrar vazios e vídeos)
    const sliderUrls = imagens
        .map(img => {
            let url = (typeof img === 'string') ? img : (img.url || '');
            if (!url || /\.(mp4|webm|mov)$/i.test(url)) return null;
            return getCardProductImage(url, prodId);
        })
        .filter(Boolean);

    // Garantir que a imagem principal está na lista
    if (sliderUrls.length > 0 && !sliderUrls.includes(imgSrc)) {
        sliderUrls.unshift(imgSrc);
    }

    if (sliderUrls.length > 1) {
        // Limitar a 5 imagens para não sobrecarregar
        const limitedUrls = sliderUrls.slice(0, 5);
        dataImagesAttr = ` data-images='${JSON.stringify(limitedUrls)}'`;
        dotsHTML = `<div class="card-img-dots">${limitedUrls.map((_, i) => `<span class="card-dot${i === 0 ? ' active' : ''}"></span>`).join('')}</div>`;
    }

    // Short description (2-line max)
    const descBlock = (prod.descricao || rawProd.descricao || '')
        ? `<p class="product-short-desc">${(prod.descricao || rawProd.descricao || '').replace(/</g, '&lt;')}</p>`
        : '';

    return `
            <article class="product-card" data-id="${prodId}" data-product-id="${prodId}"${dataImagesAttr}>
                ${discountBadge}
                <a href="produto.html?id=${prodId}">
                    <img src="${imgSrc}" alt="${safeName}" class="product-img" ${loadAttr} onerror="this.onerror=null; this.src='img/produto1.jpg';">
                </a>
                ${dotsHTML}
                <h3 class="product-name"><a href="produto.html?id=${prodId}">${safeName}</a></h3>
                ${brandBlock}
                ${ratingBlock}
                ${descBlock}
                <div class="product-prices">
                    ${oldPrice}
                    <span class="new-price">€${prod.price.toFixed(2)}</span>
                </div>
                <button class="btn-basket" data-product-id="${prodId}">ADD TO BASKET</button>
            </article>`;
}

/**
 * Renderiza uma lista de produtos num container.
 */
function renderProductCards(products, containerId, opts = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!products || products.length === 0) {
        container.innerHTML = '<p style="padding:20px;text-align:center;color:#666;">No products found.</p>';
        return;
    }

    container.innerHTML = products
        .map(p => createProductCardHTML(p, opts))
        .filter(html => html !== '')
        .join('');

    // Garantir que imagens lazy fiquem visíveis
    container.querySelectorAll('img.product-img[loading="lazy"]').forEach(img => {
        if (img.complete && img.naturalWidth > 0) img.classList.add('loaded');
        else img.addEventListener('load', function() { this.classList.add('loaded'); });
    });

    // Trigger addQuickActionsToCards if available (adds wishlist heart)
    if (typeof addQuickActionsToCards === 'function') {
        addQuickActionsToCards();
    }
}

// ══════════════════════════════════════════════════════════
// CARD IMAGE SLIDER — Hover automático com fade
// ══════════════════════════════════════════════════════════
(function initCardImageSlider() {
    // Injetar CSS para dots e transição de fade
    if (!document.getElementById('card-slider-css')) {
        const style = document.createElement('style');
        style.id = 'card-slider-css';
        style.textContent = `
            /* Fade suave para troca de imagem */
            .product-card .product-img {
                transition: opacity 0.3s ease;
            }
            .product-card .product-img.card-img-fading {
                opacity: 0;
            }
            /* Container dos dots indicadores */
            .card-img-dots {
                display: none;
                justify-content: center;
                align-items: center;
                gap: 5px;
                padding: 6px 0 2px;
                position: relative;
                z-index: 2;
            }
            .product-card[data-images]:hover .card-img-dots,
            .product-card[data-images].card-hovered .card-img-dots {
                display: flex;
            }
            /* Dot individual */
            .card-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #ccc;
                transition: background 0.3s ease, transform 0.3s ease;
                cursor: pointer;
            }
            .card-dot.active {
                background: #2D6A4F;
                transform: scale(1.3);
            }
            /* Dark mode */
            html[data-theme="dark"] .card-dot {
                background: #555;
            }
            html[data-theme="dark"] .card-dot.active {
                background: #6fcf97;
            }
        `;
        document.head.appendChild(style);
    }

    // Estado do slider ativo
    let activeSlider = null; // { card, interval, index, images, originalSrc }

    function startSlider(card) {
        if (activeSlider && activeSlider.card === card) return;
        stopSlider(); // limpar qualquer slider anterior

        const imagesAttr = card.getAttribute('data-images');
        if (!imagesAttr) return;

        let images;
        try {
            images = JSON.parse(imagesAttr);
        } catch (e) {
            return;
        }
        if (!Array.isArray(images) || images.length <= 1) return;

        const img = card.querySelector('img.product-img');
        if (!img) return;

        const originalSrc = img.getAttribute('src');
        let index = 0;

        activeSlider = {
            card: card,
            images: images,
            index: index,
            originalSrc: originalSrc,
            interval: setInterval(function() {
                // Avançar índice
                activeSlider.index = (activeSlider.index + 1) % activeSlider.images.length;
                const nextSrc = activeSlider.images[activeSlider.index];

                // Fade out
                img.classList.add('card-img-fading');

                setTimeout(function() {
                    img.src = nextSrc;
                    // Fade in
                    img.classList.remove('card-img-fading');

                    // Atualizar dots
                    const dots = card.querySelectorAll('.card-dot');
                    dots.forEach(function(dot, i) {
                        dot.classList.toggle('active', i === activeSlider.index);
                    });
                }, 300); // Mesma duração da transição CSS
            }, 1500)
        };
    }

    function stopSlider() {
        if (!activeSlider) return;

        clearInterval(activeSlider.interval);

        const card = activeSlider.card;
        const img = card.querySelector('img.product-img');
        const originalSrc = activeSlider.originalSrc;

        if (img && originalSrc) {
            // Fade out → voltar à imagem original → fade in
            img.classList.add('card-img-fading');
            setTimeout(function() {
                img.src = originalSrc;
                img.classList.remove('card-img-fading');
            }, 300);
        }

        // Reset dots
        const dots = card.querySelectorAll('.card-dot');
        dots.forEach(function(dot, i) {
            dot.classList.toggle('active', i === 0);
        });

        activeSlider = null;
    }

    // Delegação de eventos em document (funciona para cards renderizados dinamicamente)
    document.addEventListener('mouseenter', function(e) {
        const card = e.target.closest ? e.target.closest('.product-card[data-images]') : null;
        if (card) startSlider(card);
    }, true);

    document.addEventListener('mouseleave', function(e) {
        const card = e.target.closest ? e.target.closest('.product-card[data-images]') : null;
        if (card && activeSlider && activeSlider.card === card) stopSlider();
    }, true);

    // Clique num dot para saltar para aquela imagem
    document.addEventListener('click', function(e) {
        const dot = e.target.closest ? e.target.closest('.card-dot') : null;
        if (!dot) return;

        e.preventDefault();
        e.stopPropagation();

        const card = dot.closest('.product-card[data-images]');
        if (!card || !activeSlider || activeSlider.card !== card) return;

        const dots = Array.from(card.querySelectorAll('.card-dot'));
        const dotIndex = dots.indexOf(dot);
        if (dotIndex < 0 || dotIndex === activeSlider.index) return;

        // Resetar intervalo
        clearInterval(activeSlider.interval);
        activeSlider.index = dotIndex;

        const img = card.querySelector('img.product-img');
        if (img) {
            img.classList.add('card-img-fading');
            setTimeout(function() {
                img.src = activeSlider.images[dotIndex];
                img.classList.remove('card-img-fading');
                dots.forEach(function(d, i) {
                    d.classList.toggle('active', i === dotIndex);
                });
            }, 300);
        }

        // Reiniciar auto-play
        activeSlider.interval = setInterval(function() {
            activeSlider.index = (activeSlider.index + 1) % activeSlider.images.length;
            const nextSrc = activeSlider.images[activeSlider.index];
            img.classList.add('card-img-fading');
            setTimeout(function() {
                img.src = nextSrc;
                img.classList.remove('card-img-fading');
                dots.forEach(function(d, i) {
                    d.classList.toggle('active', i === activeSlider.index);
                });
            }, 300);
        }, 1500);
    }, true);
})();
