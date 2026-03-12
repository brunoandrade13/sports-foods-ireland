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


// ══════════════════════════════════════════════════════════
// VARIANT SELECTOR MODAL — Para produtos com variantes
// ══════════════════════════════════════════════════════════

/**
 * Extrai variantes (Flavour, Size, Model, Colour) do campo descricao_detalhada.
 * Retorna { type: string, options: string[] } ou null se sem variantes.
 */
function extractProductVariants(product) {
    const desc = product && (product.descricao_detalhada || '');
    if (!desc || desc.length < 10) return null;

    // Procurar no final da descrição (últimos 500 chars)
    const tail = desc.slice(-500);

    // Padrões a procurar: última ocorrência do keyword seguido de opções
    const keywords = [
        { regex: /Flavou?rs?\s+(.+)$/im, type: 'Flavour' },
        { regex: /(?:^|\s)SIZE\s+(.+)$/im, type: 'Size' },
        { regex: /(?:^|\s)Sizes?\s+(.+)$/im, type: 'Size' },
        { regex: /Models?\s+(.+)$/im, type: 'Model' },
        { regex: /Colou?rs?\s+(.+)$/im, type: 'Colour' }
    ];

    for (const kw of keywords) {
        // Encontrar a ÚLTIMA ocorrência no tail
        const matches = [...tail.matchAll(new RegExp(kw.regex.source, 'gim'))];
        const m = matches.length > 0 ? matches[matches.length - 1] : null;
        if (!m) continue;

        let raw = m[1].trim();

        // Limpar entidades HTML
        raw = raw.replace(/&#8211;/g, '–').replace(/&#8217;/g, "'").replace(/&#8220;/g, '"').replace(/&#8221;/g, '"').replace(/&amp;/g, '&');

        // Ignorar "SIZE FITS ALL" ou "ONE SIZE"
        if (/fits?\s*all|one\s*size/i.test(raw)) continue;

        // Tentar split por vírgula primeiro
        let options = raw.split(',').map(s => s.trim()).filter(s => s.length > 0 && s.length < 80);

        // Se só uma opção, tentar pattern "S M L XL" (sizes separados por espaço)
        if (options.length <= 1 && kw.type === 'Size') {
            const sizeMatch = raw.match(/^((?:(?:XX?S|XX?L|SM?|ML?|L(?:\/XL)?|M(?:\/L)?|S(?:\/M)?|Small(?:\/Medium)?|Medium(?:\/Large)?|Large(?:\/XLarge)?|XSmall|XXLarge|XLarge|XXL|Medium|Small|Large)\s*,?\s*)+)/i);
            if (sizeMatch) {
                options = sizeMatch[1].split(/[,\s]+/).map(s => s.trim()).filter(s => s.length > 0);
            }
        }

        // Filtrar opções que parecem ser texto descritivo
        options = options.filter(opt => opt.length <= 50);

        // Remover opções que são claramente instruções/descrições
        options = options.filter(opt => !/(?:CIRCUMFERENCE|CHEST|WAIST|GUIDE|CHART|Features|Available|PRODUCT|DESCRIPTION|Consume|Recommended)/i.test(opt));

        // Remover opções que começam com parênteses ou contêm frases
        options = options.filter(opt => !opt.startsWith('(') && !/\.\s/.test(opt) && opt.indexOf('.') < 0);

        // Rejeitar se média de caracteres por opção é muito alta (provável texto descritivo)
        if (options.length >= 2) {
            const avgLen = options.reduce((a, o) => a + o.length, 0) / options.length;
            if (avgLen > 35) continue; // provavelmente não são variantes reais
            return { type: kw.type, options: options };
        }
    }
    return null;
}

window.extractProductVariants = extractProductVariants;

/**
 * Injeta o CSS do modal de variantes (uma única vez).
 */
(function injectVariantModalCSS() {
    if (document.getElementById('variant-modal-css')) return;
    const style = document.createElement('style');
    style.id = 'variant-modal-css';
    style.textContent = `
        .variant-modal-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,0.55);
            z-index: 10000; display: flex; align-items: center; justify-content: center;
            padding: 16px; opacity: 0; transition: opacity 0.2s ease;
        }
        .variant-modal-overlay.show { opacity: 1; }
        .variant-modal {
            background: #fff; border-radius: 12px; padding: 0;
            max-width: 420px; width: 100%; max-height: 80vh; overflow-y: auto;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3); transform: translateY(20px);
            transition: transform 0.25s ease;
        }
        .variant-modal-overlay.show .variant-modal { transform: translateY(0); }
        .variant-modal-header {
            display: flex; align-items: center; gap: 14px;
            padding: 18px 20px; border-bottom: 1px solid #eee;
        }
        .variant-modal-header img {
            width: 64px; height: 64px; object-fit: contain;
            border-radius: 8px; background: #f5f5f5; flex-shrink: 0;
        }
        .variant-modal-header .vm-info { flex: 1; min-width: 0; }
        .variant-modal-header .vm-name {
            font-size: 0.95rem; font-weight: 600; color: #1a1a1a;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .variant-modal-header .vm-price { font-size: 1rem; font-weight: 700; color: #2D6A4F; margin-top: 2px; }
        .variant-modal-close {
            position: absolute; top: 12px; right: 14px;
            width: 32px; height: 32px; border: none; background: #f0f0f0;
            border-radius: 50%; font-size: 18px; color: #666; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            transition: background 0.15s;
        }
        .variant-modal-close:hover { background: #e0e0e0; }
        .variant-modal-body { padding: 18px 20px; }
        .variant-modal-body .vm-label {
            font-size: 0.8rem; font-weight: 600; color: #666;
            text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;
        }
        .variant-options { display: flex; flex-wrap: wrap; gap: 8px; }
        .variant-option {
            padding: 8px 16px; border: 2px solid #e0e0e0; border-radius: 8px;
            background: #fff; cursor: pointer; font-size: 0.88rem; color: #333;
            transition: all 0.15s ease; user-select: none;
        }
        .variant-option:hover { border-color: #2D6A4F; background: #f0faf4; }
        .variant-option.selected {
            border-color: #2D6A4F; background: #e8f5ee; color: #1a5c3a; font-weight: 600;
        }
        .variant-modal-footer {
            padding: 14px 20px; border-top: 1px solid #eee;
            display: flex; gap: 10px;
        }
        .variant-modal-footer button {
            flex: 1; padding: 12px; border: none; border-radius: 8px;
            font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: all 0.15s;
        }
        .vm-btn-cancel { background: #f0f0f0; color: #666; }
        .vm-btn-cancel:hover { background: #e4e4e4; }
        .vm-btn-add { background: #2D6A4F; color: #fff; opacity: 0.4; pointer-events: none; }
        .vm-btn-add.active { opacity: 1; pointer-events: auto; }
        .vm-btn-add.active:hover { background: #245a42; }
        /* Dark mode */
        html[data-theme="dark"] .variant-modal { background: #1e293b; }
        html[data-theme="dark"] .variant-modal-header { border-color: #334155; }
        html[data-theme="dark"] .variant-modal-header .vm-name { color: #e2e8f0; }
        html[data-theme="dark"] .variant-modal-header .vm-price { color: #4ade80; }
        html[data-theme="dark"] .variant-modal-close { background: #334155; color: #94a3b8; }
        html[data-theme="dark"] .variant-modal-body .vm-label { color: #94a3b8; }
        html[data-theme="dark"] .variant-option { border-color: #334155; background: #1e293b; color: #e2e8f0; }
        html[data-theme="dark"] .variant-option:hover { border-color: #4ade80; background: #1a3a2a; }
        html[data-theme="dark"] .variant-option.selected { border-color: #4ade80; background: #1a3a2a; color: #4ade80; }
        html[data-theme="dark"] .variant-modal-footer { border-color: #334155; }
        html[data-theme="dark"] .vm-btn-cancel { background: #334155; color: #94a3b8; }
        html[data-theme="dark"] .vm-btn-add { background: #2D6A4F; }
    `;
    document.head.appendChild(style);
})();

/**
 * Mostra o modal de seleção de variante.
 * @param {Object} product - Dados do produto (do dados.json ou extraído do card)
 * @param {Object} variantInfo - { type, options } do extractProductVariants
 * @param {Function} onConfirm - Callback(selectedVariant) quando confirmado
 */
function showVariantModal(product, variantInfo, onConfirm) {
    // Remover modal anterior se existir
    const prev = document.getElementById('variantModalOverlay');
    if (prev) prev.remove();

    const name = product.nome || product.name || 'Product';
    const price = parseFloat(product.preco || product.price) || 0;
    const imgSrc = getCardProductImage(product.imagem || product.image || '', product.id || 0);

    let selectedVariant = null;

    const overlay = document.createElement('div');
    overlay.id = 'variantModalOverlay';
    overlay.className = 'variant-modal-overlay';
    overlay.innerHTML = `
        <div class="variant-modal" role="dialog" aria-label="Select variant">
            <button class="variant-modal-close" aria-label="Close">&times;</button>
            <div class="variant-modal-header">
                <img src="${imgSrc}" alt="${name.replace(/"/g, '&quot;')}" onerror="this.src='img/produto1.jpg'">
                <div class="vm-info">
                    <div class="vm-name">${name.replace(/</g, '&lt;')}</div>
                    <div class="vm-price">€${price.toFixed(2)}</div>
                </div>
            </div>
            <div class="variant-modal-body">
                <div class="vm-label">Select ${variantInfo.type}</div>
                <div class="variant-options">
                    ${variantInfo.options.map(opt => 
                        `<button class="variant-option" type="button" data-variant="${opt.replace(/"/g, '&quot;')}">${opt.replace(/</g, '&lt;')}</button>`
                    ).join('\n                    ')}
                </div>
            </div>
            <div class="variant-modal-footer">
                <button class="vm-btn-cancel" type="button">Cancel</button>
                <button class="vm-btn-add" type="button">Add to Basket</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Animar entrada
    requestAnimationFrame(() => overlay.classList.add('show'));

    // Referências
    const modal = overlay.querySelector('.variant-modal');
    const addBtn = overlay.querySelector('.vm-btn-add');
    const cancelBtn = overlay.querySelector('.vm-btn-cancel');
    const closeBtn = overlay.querySelector('.variant-modal-close');
    const optionBtns = overlay.querySelectorAll('.variant-option');

    // Selecionar variante
    optionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            optionBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedVariant = btn.getAttribute('data-variant');
            addBtn.classList.add('active');
        });
    });

    // Fechar modal
    function closeModal() {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 250);
    }

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });

    // ESC para fechar
    function onEsc(e) { if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', onEsc); } }
    document.addEventListener('keydown', onEsc);

    // Confirmar
    addBtn.addEventListener('click', () => {
        if (!selectedVariant) return;
        closeModal();
        if (typeof onConfirm === 'function') {
            onConfirm(selectedVariant);
        }
    });
}

window.showVariantModal = showVariantModal;


// ════════════════════════════════════════════════
// SUPABASE VARIANT MODAL — uses real variant data from DB
// ════════════════════════════════════════════════
/**
 * Shows a variant selection modal using Supabase variant data (product.variantes).
 * Handles both simple variants (single group) and compound variants (Color / Size).
 * @param {Object} product - Full product object with .variantes array
 * @param {Function} onConfirm - Callback({ id, label, price, variantType }) when confirmed
 */
function showSupabaseVariantModal(product, onConfirm) {
    const prev = document.getElementById('variantModalOverlay');
    if (prev) prev.remove();

    const name = product.nome || product.name || 'Product';
    const basePrice = parseFloat(product.preco || product.price) || 0;
    const imgSrc = getCardProductImage(product.imagem || product.image || '', product.id || 0);
    const variants = product.variantes;
    const currency = (window._sfiCurrency === 'GBP') ? '£' : '€';

    // Detect compound variants (labels with " / " and multiple distinct level1+level2)
    let isCompound = false;
    let allCompoundOpts = [];
    const allLabels = [];
    variants.forEach(g => g.options.forEach(o => { if (o.label) allLabels.push(o); }));
    const withSlash = allLabels.filter(o => o.label.includes(' / '));
    if (withSlash.length >= 2) {
        const parts = withSlash.map(o => {
            const s = o.label.split(' / ');
            return { ...o, l1: s[0].trim(), l2: (s[1] || '').trim() };
        });
        const uL1 = new Set(parts.map(p => p.l1));
        const uL2 = new Set(parts.filter(p => p.l2).map(p => p.l2));
        if (uL1.size >= 2 && uL2.size >= 2) {
            isCompound = true;
            allCompoundOpts = parts;
        }
    }

    let selectedVariant = null;

    const overlay = document.createElement('div');
    overlay.id = 'variantModalOverlay';
    overlay.className = 'variant-modal-overlay';

    if (isCompound) {
        // ── Compound: show level1 first, then level2 on selection ──
        const level1Values = [...new Set(allCompoundOpts.map(o => o.l1))];
        const type1Name = variants[0]?.type || 'Option';
        // Guess type2 name
        let type2Name = 'Size';
        const t1 = type1Name.toLowerCase();
        if (t1.includes('size')) type2Name = 'Color';
        else if (t1.includes('flavor') || t1.includes('flavour')) type2Name = 'Pack';

        const level1Html = level1Values.map(val =>
            `<button class="variant-option" type="button" data-level1="${val.replace(/"/g, '&quot;')}">${val}</button>`
        ).join('\n');

        overlay.innerHTML = `
            <div class="variant-modal" role="dialog" aria-label="Select variant">
                <button class="variant-modal-close" aria-label="Close">&times;</button>
                <div class="variant-modal-header">
                    <img src="${imgSrc}" alt="${name.replace(/"/g, '&quot;')}" onerror="this.src='img/produto1.jpg'">
                    <div class="vm-info">
                        <div class="vm-name">${name.replace(/</g, '&lt;')}</div>
                        <div class="vm-price" id="vmPriceDisplay">${currency}${basePrice.toFixed(2)}</div>
                    </div>
                </div>
                <div class="variant-modal-body">
                    <div class="vm-label">${type1Name}</div>
                    <div class="variant-options" id="vmLevel1Opts">${level1Html}</div>
                    <div id="vmLevel2Wrap" style="display:none;margin-top:16px">
                        <div class="vm-label" id="vmLevel2Label">${type2Name}</div>
                        <div class="variant-options" id="vmLevel2Opts"></div>
                    </div>
                </div>
                <div class="variant-modal-footer">
                    <button class="vm-btn-cancel" type="button">Cancel</button>
                    <button class="vm-btn-add" type="button">Add to Basket</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('show'));

        const addBtn = overlay.querySelector('.vm-btn-add');
        const level2Wrap = overlay.querySelector('#vmLevel2Wrap');
        const level2Opts = overlay.querySelector('#vmLevel2Opts');
        const priceDisplay = overlay.querySelector('#vmPriceDisplay');

        // Level 1 click
        overlay.querySelector('#vmLevel1Opts').addEventListener('click', function(e) {
            const btn = e.target.closest('.variant-option');
            if (!btn) return;
            this.querySelectorAll('.variant-option').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedVariant = null;
            addBtn.classList.remove('active');

            const selL1 = btn.dataset.level1;
            const matching = allCompoundOpts.filter(o => o.l1 === selL1);
            level2Opts.innerHTML = matching.map(opt => {
                const outOfStock = opt.stock != null && opt.stock <= 0;
                return `<button class="variant-option${outOfStock ? ' backorder-variant' : ''}" type="button"
                    data-variant-id="${opt.id}" data-label="${opt.label.replace(/"/g, '&quot;')}"
                    data-price="${opt.price || ''}" ${outOfStock ? 'data-backorder="true"' : ''}>${opt.l2}${outOfStock ? ' (Backorder)' : ''}</button>`;
            }).join('\n');
            level2Wrap.style.display = '';
            level2Wrap.style.animation = 'fadeSlideIn 0.3s ease';
        });

        // Level 2 click
        level2Opts.addEventListener('click', function(e) {
            const btn = e.target.closest('.variant-option');
            if (!btn || btn.disabled) return;
            this.querySelectorAll('.variant-option').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedVariant = { id: btn.dataset.variantId, label: btn.dataset.label, price: parseFloat(btn.dataset.price) || null };
            addBtn.classList.add('active');
            if (selectedVariant.price) priceDisplay.textContent = currency + selectedVariant.price.toFixed(2);
        });

    } else {
        // ── Simple: single or multiple groups, show all options ──
        const groupsHtml = variants.map((group, gi) => {
            const hidden = gi > 0 ? 'style="display:none"' : '';
            const optsHtml = group.options.map(opt => {
                const outOfStock = opt.stock != null && opt.stock <= 0;
                return `<button class="variant-option${outOfStock ? ' backorder-variant' : ''}" type="button"
                    data-variant-id="${opt.id}" data-label="${(opt.label || '').replace(/"/g, '&quot;')}"
                    data-price="${opt.price || ''}" data-group="${gi}" ${outOfStock ? 'data-backorder="true"' : ''}>${opt.label}${outOfStock ? ' (Backorder)' : ''}</button>`;
            }).join('\n');
            return `<div class="vm-group" data-group-index="${gi}" ${hidden}>
                <div class="vm-label">${group.type}</div>
                <div class="variant-options">${optsHtml}</div>
            </div>`;
        }).join('');

        overlay.innerHTML = `
            <div class="variant-modal" role="dialog" aria-label="Select variant">
                <button class="variant-modal-close" aria-label="Close">&times;</button>
                <div class="variant-modal-header">
                    <img src="${imgSrc}" alt="${name.replace(/"/g, '&quot;')}" onerror="this.src='img/produto1.jpg'">
                    <div class="vm-info">
                        <div class="vm-name">${name.replace(/</g, '&lt;')}</div>
                        <div class="vm-price" id="vmPriceDisplay">${currency}${basePrice.toFixed(2)}</div>
                    </div>
                </div>
                <div class="variant-modal-body">${groupsHtml}</div>
                <div class="variant-modal-footer">
                    <button class="vm-btn-cancel" type="button">Cancel</button>
                    <button class="vm-btn-add" type="button">Add to Basket</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('show'));

        const addBtn = overlay.querySelector('.vm-btn-add');
        const priceDisplay = overlay.querySelector('#vmPriceDisplay');
        const allGroups = overlay.querySelectorAll('.vm-group');

        // Simple variant click handler with cascading groups
        overlay.querySelector('.variant-modal-body').addEventListener('click', function(e) {
            const btn = e.target.closest('.variant-option');
            if (!btn || btn.disabled) return;
            const groupEl = btn.closest('.vm-group');
            const gIdx = parseInt(groupEl.dataset.groupIndex);

            // Deselect siblings
            groupEl.querySelectorAll('.variant-option').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');

            // Show next group if exists
            if (gIdx + 1 < allGroups.length) {
                const next = allGroups[gIdx + 1];
                if (next.style.display === 'none') {
                    next.style.display = '';
                    next.style.animation = 'fadeSlideIn 0.3s ease';
                }
                // Reset subsequent groups
                for (let i = gIdx + 1; i < allGroups.length; i++) {
                    allGroups[i].querySelectorAll('.variant-option').forEach(b => b.classList.remove('selected'));
                    if (i > gIdx + 1) allGroups[i].style.display = 'none';
                }
            }

            // Build selected label from all selected options across groups
            const allSelected = overlay.querySelectorAll('.variant-option.selected');
            const labels = Array.from(allSelected).map(b => b.dataset.label);
            const allGroupsSelected = Array.from(allGroups).every(g => g.querySelector('.variant-option.selected'));

            if (allGroupsSelected) {
                const lastSelected = allSelected[allSelected.length - 1];
                selectedVariant = {
                    id: lastSelected.dataset.variantId,
                    label: labels.join(' / '),
                    price: parseFloat(lastSelected.dataset.price) || null
                };
                addBtn.classList.add('active');
                if (selectedVariant.price) priceDisplay.textContent = currency + selectedVariant.price.toFixed(2);
            } else {
                selectedVariant = null;
                addBtn.classList.remove('active');
                // Update price from current selection if available
                const p = parseFloat(btn.dataset.price);
                if (p) priceDisplay.textContent = currency + p.toFixed(2);
            }
        });
    }

    // ── Shared: close + confirm logic ──
    function closeModal() {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 250);
    }

    overlay.querySelector('.variant-modal-close').addEventListener('click', closeModal);
    overlay.querySelector('.vm-btn-cancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
    function onEsc(e) { if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', onEsc); } }
    document.addEventListener('keydown', onEsc);

    overlay.querySelector('.vm-btn-add').addEventListener('click', function() {
        if (!selectedVariant) return;
        closeModal();
        if (typeof onConfirm === 'function') onConfirm(selectedVariant);
    });
}

window.showSupabaseVariantModal = showSupabaseVariantModal;
