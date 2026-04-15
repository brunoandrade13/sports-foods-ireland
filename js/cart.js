/* ===========================================
   CART FUNCTIONALITY - Sports Foods Ireland
   Versão Corrigida - Janeiro 2026
   =========================================== */

// ============================================
// CART DATA MANAGEMENT
// ============================================

function getCart() {
    try {
        return JSON.parse(localStorage.getItem('cart')) || [];
    } catch (e) {
        console.error('Error reading cart:', e);
        return [];
    }
}

function saveCart(cart) {
    try {
        localStorage.setItem('cart', JSON.stringify(cart));
        updateCartCount();
        updateCartModalContent();
    } catch (e) {
        console.error('Error saving cart:', e);
    }
}

function updateCartCount() {
    const cart = getCart();
    const count = cart.reduce((sum, item) => sum + (item.quantidade || 1), 0);
    
    // Update header cart count
    document.querySelectorAll('.cart-count').forEach(el => {
        const oldCount = parseInt(el.textContent) || 0;
        el.textContent = count;
        if (count > oldCount) {
            el.style.transform = 'scale(1.5)';
            el.style.transition = 'transform 0.2s ease';
            setTimeout(() => { el.style.transform = 'scale(1)'; }, 250);
        }
    });
    
    // Update mobile bottom nav cart badge
    document.querySelectorAll('.cart-count-badge').forEach(el => {
        el.textContent = count;
        el.style.display = count > 0 ? 'flex' : 'none';
        if (count > 0) {
            el.style.transform = 'scale(1.5)';
            el.style.transition = 'transform 0.2s ease';
            setTimeout(() => { el.style.transform = 'scale(1)'; }, 250);
        }
    });
}

function getCartTotal() {
    const cart = getCart();
    return cart.reduce((sum, item) => sum + (item.preco * (item.quantidade || 1)), 0);
}

// ============================================
// CART ITEM KEY — composite key for variant support
// Each product+variant combination is a unique cart line
// ============================================
function cartItemKey(item) {
    return item.variant_id ? item.id + '__' + item.variant_id : String(item.id);
}

function findCartItem(cart, id, variantId) {
    if (variantId) {
        return cart.find(item => (item.id === id || item.id == id) && item.variant_id === variantId);
    }
    return cart.find(item => (item.id === id || item.id == id) && !item.variant_id);
}

// ============================================
// ADD TO CART
// ============================================

function resolveProduct(productId) {
    // Support both numeric legacy IDs and UUID strings
    const numId = typeof productId === 'string' ? parseInt(productId, 10) : productId;
    const isNumeric = !isNaN(numId) && String(numId) === String(productId);
    const id = isNumeric ? numId : productId;
    if (!id) return null;
    const fromMain = (window.PRODUTOS || []).find(p => p.id === id || p.id == id || p._supabase_id === productId);
    if (fromMain) return fromMain;
    if (Array.isArray(window.EMBEDDED_PRODUCTS)) {
        const fromEmbed = window.EMBEDDED_PRODUCTS.find(p => p.id === id || p.id == id || p._supabase_id === productId);
        if (fromEmbed) return fromEmbed;
    }
    return null;
}

function addToCart(productId, quantity = 1, productData = null, subscriptionData = null) {
    // Support both numeric legacy IDs and UUID strings
    const numId = typeof productId === 'string' ? parseInt(productId, 10) : productId;
    const isNumeric = !isNaN(numId) && String(numId) === String(productId);
    const id = isNumeric ? numId : productId;
    if (!id) {
        if (typeof showCartNotification === 'function') showCartNotification('Invalid product.');
        return;
    }
    const product = productData ? null : resolveProduct(id);
    const nome = productData?.nome || productData?.name || product?.nome || 'Product';
    const preco = productData?.preco ?? productData?.price ?? product?.preco;
    const imagem = productData?.imagem || productData?.image || product?.imagem;

    // Validar preço - aceitar preço 0 ou maior, mas rejeitar undefined/null/NaN
    const precoNum = Number(preco);
    if (preco === undefined || preco === null || isNaN(precoNum) || precoNum < 0) {
        console.warn('addToCart: Invalid price for product', id, preco);
        if (typeof showCartNotification === 'function') showCartNotification('Product not found. Please refresh and try again.');
        return;
    }

    let cart = getCart();
    const incomingVariantId = productData?.variant_id || productData?.variantId || undefined;
    const existingItem = findCartItem(cart, id, incomingVariantId);

    if (existingItem) {
        existingItem.quantidade = (existingItem.quantidade || 1) + quantity;
    } else {
        // Corrigir caminho da imagem - não adicionar img/ se já tiver
        let imagemFinal = imagem;
        if (imagem) {
            // Se já começa com img/, http, https ou /, usar como está
            if (imagem.startsWith('img/') || imagem.startsWith('../') || imagem.startsWith('http') || imagem.startsWith('/')) {
                imagemFinal = imagem;
            } else {
                imagemFinal = `img/${imagem}`;
            }
        } else {
            // Fallback para imagem padrão
            imagemFinal = `img/produto${((id - 1) % 5) + 1}.jpg`;
        }
        
        cart.push({
            id: id,
            nome: nome,
            preco: subscriptionData ? precoNum * (1 - subscriptionData.discount) : precoNum,
            precoOriginal: subscriptionData ? precoNum : undefined,
            imagem: imagemFinal,
            quantidade: quantity,
            variant_id: productData?.variant_id || productData?.variantId || undefined,
            variant_label: productData?.variant_label || productData?.variant || undefined,
            subscription: subscriptionData ? {
                active: true,
                frequency: subscriptionData.frequency,
                discount: subscriptionData.discount
            } : undefined
        });
    }

    saveCart(cart);
    updateCartCount();
    updateCartModalContent();
    const notifMsg = subscriptionData ? '🔄 Subscription added to cart!' : 'Product added to cart!';
    if (typeof showCartNotification === 'function') showCartNotification(notifMsg);
    // Modal não abre automaticamente - só abre quando clicar no ícone do carrinho
}

function updateCartQuantity(productId, newQuantity, variantId) {
    let cart = getCart();
    const item = findCartItem(cart, productId, variantId || undefined);
    
    if (item) {
        if (newQuantity <= 0) {
            const key = cartItemKey(item);
            cart = cart.filter(i => cartItemKey(i) !== key);
        } else {
            item.quantidade = newQuantity;
        }
        saveCart(cart);
    }
}

function removeFromCart(productId, variantId) {
    let cart = getCart();
    if (variantId) {
        cart = cart.filter(item => !(( item.id === productId || item.id == productId) && item.variant_id === variantId));
    } else {
        cart = cart.filter(item => !(( item.id === productId || item.id == productId) && !item.variant_id));
    }
    saveCart(cart);
}

// ============================================
// CART MODAL - FUNÇÕES PRINCIPAIS
// ============================================

function openCartModal() {
    
    const overlay = document.getElementById('cartModalOverlay');
    if (!overlay) {
        console.warn('Cart modal overlay not found');
        return;
    }
    
    // Acessibilidade: overlay visível = não ocultar para leitores de ecrã (evita aviso "aria-hidden on focused element")
    overlay.removeAttribute('inert');
    overlay.setAttribute('aria-hidden', 'false');
    
    // Atualizar conteúdo
    updateCartModalContent();
    
    // Mostrar modal
    overlay.classList.add('active');
    document.body.classList.add('cart-modal-open');
    
    // Focus no botão de fechar para acessibilidade (após aria-hidden=false para não violar a11y)
    const closeBtn = overlay.querySelector('.cart-modal-close');
    if (closeBtn) {
        setTimeout(() => closeBtn.focus(), 100);
    }
    
}

function closeCartModal() {
    
    const overlay = document.getElementById('cartModalOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        document.body.classList.remove('cart-modal-open');
        overlay.setAttribute('aria-hidden', 'true');
        overlay.setAttribute('inert', '');
    }
    
}

function toggleCartModal() {
    const overlay = document.getElementById('cartModalOverlay');
    
    if (overlay && overlay.classList.contains('active')) {
        closeCartModal();
    } else {
        openCartModal();
    }
}

// ============================================
// UPSELL - PRODUCT RECOMMENDATIONS
// ============================================

function getCartRecommendations(cart, maxTotal) {
    maxTotal = maxTotal || 8;
    const allProducts = window.PRODUTOS || [];
    if (!allProducts.length || !cart.length) return { related: [], onSale: [] };

    const cartIds = new Set(cart.map(item => item.id));
    const cartCategories = new Set();
    const cartBrands = new Set();
    const cartSubcats = new Set();

    // Analyze cart items to find categories, brands, subcategories
    cart.forEach(item => {
        const prod = allProducts.find(p => p.id === item.id);
        if (prod) {
            if (prod.categoria) cartCategories.add(prod.categoria.toLowerCase());
            if (prod.marca) cartBrands.add(prod.marca.toLowerCase());
            if (prod.subcategoria) cartSubcats.add(prod.subcategoria.toLowerCase());
        }
    });

    const available = allProducts.filter(p => !cartIds.has(p.id) && p.em_stock !== false && p.preco > 0);

    // Score each product by relevance
    const scored = available.map(p => {
        let score = 0;
        // Same category = high relevance
        if (p.categoria && cartCategories.has(p.categoria.toLowerCase())) score += 3;
        // Same brand = medium relevance
        if (p.marca && cartBrands.has(p.marca.toLowerCase())) score += 2;
        // Same subcategory = high relevance
        if (p.subcategoria && cartSubcats.has(p.subcategoria.toLowerCase())) score += 4;
        // In relacionados of cart items
        cart.forEach(ci => {
            const cp = allProducts.find(x => x.id === ci.id);
            if (cp && cp.relacionados && cp.relacionados.includes(p.id)) score += 5;
        });
        return { product: p, score: score };
    });

    // Related/similar products (highest scored, non-zero)
    const related = scored
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxTotal)
        .map(s => s.product);

    // Products on sale (discount > 0 or has preco_antigo)
    const onSale = available
        .filter(p => (p.desconto && p.desconto > 0) || (p.preco_antigo && p.preco_antigo > p.preco))
        .sort((a, b) => (b.desconto || 0) - (a.desconto || 0))
        .slice(0, maxTotal);

    return { related, onSale };
}

function renderRecommendationCard(product, imgPrefix) {
    const img = product.imagem || 'img/produto1.jpg';
    const imgSrc = img.startsWith('img/') || img.startsWith('http') ? img : 'img/' + img;
    const hasDiscount = product.preco_antigo && product.preco_antigo > product.preco;
    const discountPct = hasDiscount ? Math.round((1 - product.preco / product.preco_antigo) * 100) : (product.desconto || 0);

    return `
        <div class="upsell-card" onclick="addToCart(${product.id})" title="Add to cart">
            ${discountPct > 0 ? '<span class="upsell-badge">-' + discountPct + '%</span>' : ''}
            <img src="${imgSrc.startsWith('http') ? imgSrc : imgPrefix + imgSrc}" alt="${product.nome}" class="upsell-img" onerror="this.src='${imgPrefix}img/produto1.jpg'" loading="lazy">
            <div class="upsell-info">
                <p class="upsell-name">${product.nome}</p>
                <div class="upsell-price-row">
                    ${hasDiscount ? '<span class="upsell-old-price">€' + product.preco_antigo.toFixed(2) + '</span>' : ''}
                    <span class="upsell-price">€${product.preco.toFixed(2)}</span>
                </div>
                <button class="upsell-add-btn" onclick="event.stopPropagation(); addToCart(${product.id})">+ Add</button>
            </div>
        </div>
    `;
}

function renderRecommendationsSection(cart, imgPrefix) {
    const recs = getCartRecommendations(cart);
    if (!recs.related.length && !recs.onSale.length) return '';

    let html = '<div class="upsell-section">';

    if (recs.related.length) {
        html += `
            <div class="upsell-block">
                <h4 class="upsell-title">🎯 You Might Also Like</h4>
                <div class="upsell-scroll">${recs.related.slice(0, 6).map(p => renderRecommendationCard(p, imgPrefix)).join('')}</div>
            </div>
        `;
    }

    if (recs.onSale.length) {
        // Filter out products already shown in related
        const relatedIds = new Set(recs.related.slice(0, 6).map(p => p.id));
        const uniqueSale = recs.onSale.filter(p => !relatedIds.has(p.id)).slice(0, 6);
        if (uniqueSale.length) {
            html += `
                <div class="upsell-block">
                    <h4 class="upsell-title">🔥 On Sale Now</h4>
                    <div class="upsell-scroll">${uniqueSale.map(p => renderRecommendationCard(p, imgPrefix)).join('')}</div>
                </div>
            `;
        }
    }

    html += '</div>';
    return html;
}

// ============================================
// ATUALIZAR CONTEÚDO DO MODAL
// ============================================

function updateCartModalContent() {
    const cart = getCart();
    const itemsContainer = document.getElementById('cartModalItems');
    const footer = document.getElementById('cartModalFooter');
    
    if (!itemsContainer) return;

    // Detect subdirectory depth for correct image paths
    const loc = window.location.pathname;
    const inSubdir = loc.includes('/b2b/') || loc.includes('/admin/') || loc.includes('/pages/');
    const imgPrefix = inSubdir ? '../' : '';
    
    if (cart.length === 0) {
        itemsContainer.innerHTML = `
            <div class="cart-modal-empty" style="color:#001f3f">
                <span style="font-size: 48px; display: block; margin-bottom: 16px;">🛒</span>
                <p style="color:#001f3f">Your cart is empty</p>
                <a href="${imgPrefix}shop.html" style="display: inline-block; margin-top: 16px; padding: 12px 24px; background: #2D6A4F; color: white; border-radius: 8px; text-decoration: none; font-weight: 600;">Continue Shopping</a>
            </div>
        `;
        if (footer) footer.style.display = 'none';
        return;
    }
    
    // Renderizar itens – texto em azul-marinho (#001f3f) para leitura no fundo branco
    itemsContainer.innerHTML = cart.map(item => {
        const subBadge = item.subscription?.active
            ? `<span style="display:inline-block;background:#2D6A4F;color:#fff;font-size:10px;padding:2px 6px;border-radius:4px;margin-top:4px;font-weight:600">🔄 Subscribe & Save · ${item.subscription.frequency?.replace('weeks',' weeks') || '4 weeks'}</span>`
            : '';
        const priceDisplay = item.subscription?.active && item.precoOriginal
            ? `<span style="text-decoration:line-through;color:#94a3b8;font-size:12px;margin-right:4px">€${(item.precoOriginal * (item.quantidade || 1)).toFixed(2)}</span>€${((item.preco || 0) * (item.quantidade || 1)).toFixed(2)}`
            : `€${((item.preco || 0) * (item.quantidade || 1)).toFixed(2)}`;
            const itemImg = (item.imagem || 'img/produto1.jpg');
            const itemImgSrc = itemImg.startsWith('http') ? itemImg : imgPrefix + itemImg;
            const itemImgFallback = imgPrefix + 'img/produto1.jpg';
            // Escape variant_id for safe use in onclick handlers
            const vId = item.variant_id ? "'" + item.variant_id + "'" : 'undefined';
            const itemIdArg = typeof item.id === 'string' ? "'" + item.id + "'" : item.id;
        return `
        <div class="cart-modal-item" data-id="${item.id}" data-variant-id="${item.variant_id || ''}" style="display:flex;gap:12px;padding:14px 16px;border-bottom:1px solid rgba(0,31,63,0.1);align-items:flex-start;background:#fff">
            <img src="${itemImgSrc}" alt="${item.nome}" style="width:84px !important;height:84px !important;min-width:84px !important;min-height:84px !important;max-width:84px !important;max-height:84px !important;object-fit:contain;border-radius:8px;flex-shrink:0;background:#f9fafb;border:1px solid #e5e7eb;display:block" onerror="this.src='${itemImgFallback}'">
            <div style="flex:1;min-width:0">
                <div style="font-size:14px;font-weight:600;color:#001f3f;margin-bottom:6px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${item.nome}</div>
                ${subBadge}
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
                    <div style="display:flex;align-items:center;gap:8px;color:#001f3f">
                        <button class="qty-btn" onclick="updateCartQuantity(${itemIdArg}, ${(item.quantidade || 1) - 1}, ${vId})">−</button>
                        <span>${item.quantidade || 1}</span>
                        <button class="qty-btn" onclick="updateCartQuantity(${itemIdArg}, ${(item.quantidade || 1) + 1}, ${vId})">+</button>
                    </div>
                    <div style="font-weight:700;color:#001f3f;font-size:15px">${priceDisplay}</div>
                </div>
            </div>
            <button onclick="removeFromCart(${itemIdArg}, ${vId})" style="background:none;border:none;font-size:20px;color:#001f3f;cursor:pointer;flex-shrink:0;padding:0 4px">×</button>
        </div>
    `}).join('');
    
    // Atualizar totais
    const subtotal = cart.reduce((sum, item) => sum + (parseFloat(item.preco) || 0) * (parseInt(item.quantidade) || 1), 0);
    const isB2B = window._sfiCustomerIsB2B || false;
    const freeShipMin = isB2B ? 150 : 60;
    const delivery = subtotal >= freeShipMin ? 0 : 9.04;
    const total = subtotal + delivery;
    
    const subtotalEl = document.getElementById('cartModalSubtotal');
    const deliveryEl = document.getElementById('cartModalDelivery');
    const totalEl = document.getElementById('cartModalTotal');
    
    if (subtotalEl) subtotalEl.textContent = `€${subtotal.toFixed(2)}`;
    if (deliveryEl) deliveryEl.textContent = delivery === 0 ? 'FREE' : `€${delivery.toFixed(2)}`;
    if (totalEl) totalEl.textContent = `€${total.toFixed(2)}`;
    
    if (footer) footer.style.display = 'block';
}

// ============================================
// NOTIFICAÇÃO
// ============================================

function showCartNotification(message) {
    const existing = document.querySelector('.cart-notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = 'cart-notification';
    notification.innerHTML = `
        <span class="notification-icon">✓</span>
        <span class="notification-text">${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 400);
    }, 3000);
}

// ============================================
// INICIALIZAÇÃO
// ============================================

// Script loaded with defer — DOM is already parsed
(function() {
    
    // Atualizar contador
    updateCartCount();
    
    // Configurar clique no ícone do carrinho
    document.querySelectorAll('.cart, #cartIcon, [onclick*="toggleCartModal"]').forEach(el => {
        // Remover onclick inline
        el.removeAttribute('onclick');
        
        el.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            toggleCartModal();
        });
    });
    
    // Configurar botão de fechar
    document.querySelectorAll('.cart-modal-close').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            closeCartModal();
        });
    });
    
    // Fechar modal ao clicar no overlay
    const overlay = document.getElementById('cartModalOverlay');
    if (overlay) {
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                closeCartModal();
            }
        });
        
        // Impedir que cliques no modal fechem o overlay
        const modal = document.getElementById('cartModal');
        if (modal) {
            modal.addEventListener('click', function(e) {
                e.stopPropagation();
            });
        }
    }
    
    // Tecla ESC para fechar
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeCartModal();
        }
    });
    
    // Log opcional apenas se a flag global DEBUG existir
    if (typeof DEBUG !== 'undefined' && DEBUG) {
    }
})();

// Exportar funções para uso global
window.getCart = getCart;
window.saveCart = saveCart;
window.addToCart = addToCart;
window.updateCartQuantity = updateCartQuantity;
window.removeFromCart = removeFromCart;
window.openCartModal = openCartModal;
window.closeCartModal = closeCartModal;
window.toggleCartModal = toggleCartModal;
window.updateCartCount = updateCartCount;
window.updateCartModalContent = updateCartModalContent;
window.cartItemKey = cartItemKey;
window.findCartItem = findCartItem;
