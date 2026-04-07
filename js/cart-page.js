/**
 * SFI Cart Page — Renders full cart view in cart.html
 */
(function() {
'use strict';

const container = document.getElementById('cartContent');
if (!container) return; // Not on cart page

function fmt(n) { return '€' + Number(n).toFixed(2); }

function renderCartPage() {
    const cart = getCart();
    if (!cart.length) {
        container.innerHTML = `
            <div class="cart-empty">
                <h2>Your cart is empty</h2>
                <p>Looks like you haven't added anything yet.</p>
                <a href="shop.html" class="btn-account-primary" style="display:inline-block;margin-top:16px;text-decoration:none">Browse Products</a>
            </div>`;
        return;
    }

    const subtotal = cart.reduce((s, i) => s + i.preco * (i.quantidade || 1), 0);
    const shipping = subtotal >= 60 ? 0 : 9.04;
    const total = subtotal + shipping;

    container.innerHTML = `
        <div class="cart-layout">
            <div class="cart-items">
                ${cart.map((item, idx) => {
                    const subBadge = item.subscription?.active
                        ? `<span style="display:inline-block;background:#2D6A4F;color:#fff;font-size:11px;padding:2px 8px;border-radius:4px;margin-top:4px;font-weight:600">🔄 Subscribe & Save · ${item.subscription.frequency?.replace('weeks',' weeks') || '4 weeks'}</span>`
                        : '';
                    const priceHtml = item.subscription?.active && item.precoOriginal
                        ? `<span style="text-decoration:line-through;color:#94a3b8;font-size:13px;margin-right:4px">${fmt(item.precoOriginal)}</span>${fmt(item.preco)}`
                        : fmt(item.preco);
                    return `
                    <div class="cart-item" data-idx="${idx}">
                        <img src="${item.imagem || 'img/placeholder.jpg'}" alt="${item.nome}" class="cart-item-img" loading="lazy">
                        <div class="cart-item-info">
                            <h3>${item.nome}</h3>
                            ${item.variante ? `<span class="cart-item-variant">${item.variante}</span>` : ''}
                            ${subBadge}
                            <span class="cart-item-price">${priceHtml}</span>
                        </div>
                        <div class="cart-item-qty">
                            <button class="qty-btn" onclick="changeQty(${idx}, -1)">−</button>
                            <span>${item.quantidade || 1}</span>
                            <button class="qty-btn" onclick="changeQty(${idx}, 1)">+</button>
                        </div>
                        <span class="cart-item-total">${fmt(item.preco * (item.quantidade || 1))}</span>
                        <button class="cart-item-remove" onclick="removeItem(${idx})">✕</button>
                    </div>
                `}).join('')}
            </div>
            <div class="cart-summary">
                <h2>Order Summary</h2>
                <div class="summary-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
                <div class="summary-row"><span>Shipping</span><span>${shipping === 0 ? 'FREE' : fmt(shipping)}</span></div>
                ${shipping > 0 ? `<div class="summary-hint">Free delivery on orders over €50</div>` : ''}
                <div class="summary-row summary-total"><span>Total</span><span>${fmt(total)}</span></div>
                <a href="checkout.html" class="checkout-btn">Proceed to Checkout</a>
                <a href="shop.html" class="continue-link">← Continue Shopping</a>
            </div>
        </div>
        ${renderCartPageRecommendations(cart)}`;
}

function renderCartPageRecommendations(cart) {
    if (typeof getCartRecommendations !== 'function') return '';
    const recs = getCartRecommendations(cart, 12);
    if (!recs.related.length && !recs.onSale.length) return '';

    let html = '<div class="cart-page-upsell">';

    if (recs.related.length) {
        html += '<div class="cpu-block">';
        html += '<h3 class="cpu-title">🎯 You Might Also Like</h3>';
        html += '<div class="cpu-grid">';
        html += recs.related.slice(0, 6).map(p => renderCartPageCard(p)).join('');
        html += '</div></div>';
    }

    if (recs.onSale.length) {
        const relIds = new Set(recs.related.slice(0, 6).map(p => p.id));
        const sales = recs.onSale.filter(p => !relIds.has(p.id)).slice(0, 6);
        if (sales.length) {
            html += '<div class="cpu-block">';
            html += '<h3 class="cpu-title">🔥 On Sale Now</h3>';
            html += '<div class="cpu-grid">';
            html += sales.map(p => renderCartPageCard(p)).join('');
            html += '</div></div>';
        }
    }

    html += '</div>';
    return html;
}

function renderCartPageCard(p) {
    const img = p.imagem || 'img/produto1.jpg';
    const imgSrc = img.startsWith('img/') || img.startsWith('http') ? img : 'img/' + img;
    const hasOld = p.preco_antigo && p.preco_antigo > p.preco;
    const disc = hasOld ? Math.round((1 - p.preco / p.preco_antigo) * 100) : (p.desconto || 0);
    return `
        <div class="cpu-card">
            ${disc > 0 ? '<span class="cpu-badge">-' + disc + '%</span>' : ''}
            <a href="produto.html?id=${p.id}" class="cpu-img-link">
                <img src="${imgSrc}" alt="${p.nome}" class="cpu-img" loading="lazy" onerror="this.src='img/produto1.jpg'">
            </a>
            <div class="cpu-info">
                <a href="produto.html?id=${p.id}" class="cpu-name">${p.nome}</a>
                <div class="cpu-price-row">
                    ${hasOld ? '<span class="cpu-old">€' + p.preco_antigo.toFixed(2) + '</span>' : ''}
                    <span class="cpu-price">€${p.preco.toFixed(2)}</span>
                </div>
                <button class="cpu-add" onclick="addToCart(${p.id}); this.textContent='✓ Added'; this.style.background='#1B4332'; setTimeout(()=>{this.textContent='+ Add to Cart'; this.style.background='';}, 1500);">+ Add to Cart</button>
            </div>
        </div>`;
}

window.changeQty = function(idx, delta) {
    const cart = getCart();
    if (!cart[idx]) return;
    cart[idx].quantidade = Math.max(1, (cart[idx].quantidade || 1) + delta);
    saveCart(cart);
    renderCartPage();
};

window.removeItem = function(idx) {
    const cart = getCart();
    cart.splice(idx, 1);
    saveCart(cart);
    renderCartPage();
};

// Render cart items immediately (doesn't need product catalog)
renderCartPage();

// When full product catalog loads, re-render to show recommendations
if (window._sfiDataReady && window.PRODUTOS && window.PRODUTOS.length) {
    // Data already loaded — recommendations will appear from initial render
} else {
    // Wait for data to load, then re-render with recommendations
    window.addEventListener('sfi:products-loaded', function() {
        renderCartPage();
    });
    // Fallback: if promise exists, wait on it
    if (window._sfiProductsPromise) {
        window._sfiProductsPromise.then(function() {
            renderCartPage();
        });
    }
}
})();
