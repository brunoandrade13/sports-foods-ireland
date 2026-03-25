/**
 * SFI Checkout Page — Multi-step checkout
 */
(function () {
    'use strict';

    const container = document.getElementById('checkoutContent');
    if (!container) return;

    function fmt(n) { return '€' + Number(n).toFixed(2); }
    let step = 1;
    let checkoutData = { contact: {}, shipping: {}, payment: {} };
    let appliedCoupon = null;

    const COUPONS = {
        'WELCOME10': { type: 'percent', value: 10, label: '10% off' },
        'SFI20': { type: 'percent', value: 20, label: '20% off' },
        'FIVER': { type: 'fixed', value: 5, label: '€5 off' },
        'FREESHIP': { type: 'shipping', value: 0, label: 'Free shipping' }
    };

    function renderCheckout() {
        const cart = getCart();
        if (!cart.length) {
            container.innerHTML = `
            <div class="cart-empty">
                <h2>Your cart is empty</h2>
                <p>Add items before checking out.</p>
                <a href="shop.html" class="btn-account-primary" style="display:inline-block;margin-top:16px;text-decoration:none">Browse Products</a>
            </div>`;
            return;
        }
        container.innerHTML = `
        <div class="checkout-steps">${renderSteps()}</div>
        <div class="checkout-layout">
            <div class="checkout-form">${renderCurrentStep()}</div>
            <div class="checkout-sidebar">${renderOrderSummary(cart)}</div>
        </div>`;
        attachStepListeners();
    }

    function renderSteps() {
        const steps = ['Contact', 'Shipping', 'Payment'];
        return steps.map((s, i) => {
            const n = i + 1;
            const cls = n < step ? 'done' : n === step ? 'active' : '';
            return `<div class="ck-step ${cls}"><span class="ck-step-num">${n < step ? '✓' : n}</span>${s}</div>`;
        }).join('<div class="ck-step-line"></div>');
    }

    function renderOrderSummary(cart) {
        const subtotal = cart.reduce((s, i) => s + i.preco * (i.quantidade || 1), 0);
        let discount = 0;
        const freeShipMin = window._sfiCustomerIsB2B ? 150 : 60;
        let shipCost = subtotal >= freeShipMin ? 0 : 9.04;
        if (appliedCoupon) {
            if (appliedCoupon.type === 'percent') discount = subtotal * appliedCoupon.value / 100;
            else if (appliedCoupon.type === 'fixed') discount = appliedCoupon.value;
            else if (appliedCoupon.type === 'shipping') shipCost = 0;
        }
        const total = subtotal - discount + shipCost;
        const taxIncluded = total - (total / 1.23);
        return `
        <h3>Order Summary</h3>
        ${cart.map(i => `
            <div class="ck-item">
                <img src="${i.imagem || 'img/placeholder.jpg'}" alt="${i.nome}">
                <div><span class="ck-item-name">${i.nome}</span>
                ${i.variante ? `<small>${i.variante}</small>` : ''}
                <span class="ck-item-qty">Qty: ${i.quantidade || 1}</span></div>
                <span class="ck-item-price">${fmt(i.preco * (i.quantidade || 1))}</span>
            </div>`).join('')}
        <div class="ck-summary-divider"></div>
        <div class="ck-coupon">
            ${appliedCoupon ? `<div class="ck-coupon-applied">✓ ${appliedCoupon.label} <button onclick="removeCoupon()">✕</button></div>` :
                `<div class="ck-coupon-form"><input type="text" id="couponInput" placeholder="Discount code"><button onclick="applyCoupon()">Apply</button></div>`}
        </div>
        <div class="summary-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
        ${discount > 0 ? `<div class="summary-row" style="color:#16a34a"><span>Discount</span><span>-${fmt(discount)}</span></div>` : ''}
        <div class="summary-row"><span>Shipping</span><span>${shipCost === 0 ? 'FREE' : fmt(shipCost)}</span></div>
        <div class="summary-row summary-total">
            <span>Total</span>
            <span style="text-align:right">
                ${fmt(total)}<br>
                <small style="font-size:12px;color:var(--color-text-muted);font-weight:normal">(includes €${taxIncluded.toFixed(2)} Tax)</small>
            </span>
        </div>`;
    }

    function renderCurrentStep() {
        const user = window.sfi?.auth?.getUser();
        const meta = user?.user_metadata || {};

        if (step === 1) {
            return `
        <h3>Contact Information</h3>
        <form id="stepForm" class="account-form">
            <div class="form-row">
                <div class="form-group"><label>First Name *</label>
                    <input type="text" id="ckFirstName" required value="${checkoutData.contact.firstName || meta.first_name || ''}"></div>
                <div class="form-group"><label>Last Name *</label>
                    <input type="text" id="ckLastName" required value="${checkoutData.contact.lastName || meta.last_name || ''}"></div>
            </div>
            <div class="form-group"><label>Email *</label>
                <input type="email" id="ckEmail" required value="${checkoutData.contact.email || user?.email || ''}"></div>
            <div class="form-group"><label>Phone</label>
                <input type="tel" id="ckPhone" value="${checkoutData.contact.phone || meta.phone || ''}" placeholder="+353 XX XXX XXXX"></div>
            <div class="ck-nav">
                <a href="cart.html" class="continue-link">← Back to Cart</a>
                <button type="submit" class="btn-account-primary">Continue to Shipping →</button>
            </div>
        </form>`;
        }

        if (step === 2) {
            return `
        <h3>Shipping Address</h3>
        <form id="stepForm" class="account-form">
            <div class="form-group"><label>Address Line 1 *</label>
                <input type="text" id="ckAddr1" required value="${checkoutData.shipping.addr1 || ''}"></div>
            <div class="form-group"><label>Address Line 2</label>
                <input type="text" id="ckAddr2" value="${checkoutData.shipping.addr2 || ''}"></div>
            <div class="form-row">
                <div class="form-group"><label>City *</label>
                    <input type="text" id="ckCity" required value="${checkoutData.shipping.city || ''}"></div>
                <div class="form-group"><label>County / Eircode *</label>
                    <input type="text" id="ckPostcode" required value="${checkoutData.shipping.postcode || ''}"></div>
            </div>
            <div class="form-group"><label>Country</label>
                <select id="ckCountry">
                    <option value="IE" ${checkoutData.shipping.country === 'IE' || !checkoutData.shipping.country ? 'selected' : ''}>Ireland</option>
                    <option value="GB" ${checkoutData.shipping.country === 'GB' ? 'selected' : ''}>United Kingdom</option>
                </select>
            </div>
            <div class="ck-nav">
                <button type="button" class="btn-account-outline" onclick="goStep(1)">← Back</button>
                <button type="submit" class="btn-account-primary">Continue to Payment →</button>
            </div>
        </form>`;
        }

        if (step === 3) {
            const cart = getCart();
            const subtotal = cart.reduce((s, i) => s + i.preco * (i.quantidade || 1), 0);
            let discount = 0;
            const freeShipMin2 = window._sfiCustomerIsB2B ? 150 : 60;
            let shipCost = subtotal >= freeShipMin2 ? 0 : 9.04;
            if (appliedCoupon) {
                if (appliedCoupon.type === 'percent') discount = subtotal * appliedCoupon.value / 100;
                else if (appliedCoupon.type === 'fixed') discount = appliedCoupon.value;
                else if (appliedCoupon.type === 'shipping') shipCost = 0;
            }
            const total = subtotal - discount + shipCost;

            // Klarna: only for B2C customers with orders >= €100
            const isB2B = window._sfiCustomerIsB2B || false;
            const showKlarna = !isB2B && total >= 100;
            const klarnaInstalment = (total / 3).toFixed(2);

            const c = checkoutData.contact || {};
            const s = checkoutData.shipping || {};
            const countryName = s.country === 'IE' ? 'Ireland' : (s.country === 'GB' ? 'United Kingdom' : s.country);
            const addressParts = [s.addr1, s.addr2, s.city, s.postcode, countryName].filter(Boolean).join(', ');

            const klarnaHtml = showKlarna ? `
                <label class="ck-payment-option" style="display:flex;align-items:center;gap:14px;padding:16px 20px;border:2px solid #e2e8f0;border-radius:10px;cursor:pointer;background:#fff;transition:all 0.2s;">
                    <input type="radio" name="paymentMethod" value="klarna" style="accent-color:#FFB3C7;width:18px;height:18px;">
                    <div style="flex:1;">
                        <div style="font-weight:600;font-size:14px;color:#1e293b;margin-bottom:4px;">🛍️ Klarna — Pay in 3 instalments</div>
                        <div style="font-size:12px;color:#636E72;">3 interest-free payments of €${klarnaInstalment}</div>
                    </div>
                    <img src="img/payment-icons/card_klarna.svg" style="height:26px;" alt="Klarna" onerror="this.style.display='none'">
                </label>` : '';

            return `
        <h3>Payment</h3>
        <div class="ck-review" style="background:#f8f9fa; padding:16px; border-radius:10px; margin-bottom:24px; border:1px solid var(--color-border-light);">
            <div style="margin-bottom:8px">
                <span style="color:var(--color-text-muted);font-size:12px;text-transform:uppercase;font-weight:700">Contact</span><br>
                <strong>${c.firstName || ''} ${c.lastName || ''}</strong> · ${c.email || ''} ${c.phone ? '· ' + c.phone : ''}
            </div>
            <div>
                <span style="color:var(--color-text-muted);font-size:12px;text-transform:uppercase;font-weight:700">Shipping Address</span><br>
                ${addressParts}
            </div>
        </div>
        <form id="stepForm" class="account-form">
            <p style="font-weight:600;font-size:15px;margin-bottom:14px;color:#1e293b;">Choose your payment method:</p>
            <div class="ck-payment-methods" style="display:flex;flex-direction:column;gap:12px;margin-bottom:24px;">
                <label class="ck-payment-option active" style="display:flex;align-items:center;gap:14px;padding:16px 20px;border:2px solid #2D6A4F;border-radius:10px;cursor:pointer;background:#f0fdf4;transition:all 0.2s;">
                    <input type="radio" name="paymentMethod" value="stripe" checked style="accent-color:#2D6A4F;width:18px;height:18px;">
                    <div style="flex:1;">
                        <div style="font-weight:600;font-size:14px;color:#1e293b;margin-bottom:4px;">💳 Credit / Debit Card</div>
                        <div style="font-size:12px;color:#636E72;">Visa, Mastercard, Amex, Apple Pay, Google Pay</div>
                    </div>
                    <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;">
                        <img src="img/payment-icons/card_visa.svg" style="height:22px;" alt="Visa" onerror="this.style.display='none'">
                        <img src="img/payment-icons/card_mastercard.svg" style="height:22px;" alt="Mastercard" onerror="this.style.display='none'">
                        <img src="img/payment-icons/card_american_express.svg" style="height:22px;" alt="Amex" onerror="this.style.display='none'">
                        <img src="img/payment-icons/card_apple_pay.svg" style="height:22px;" alt="Apple Pay" onerror="this.style.display='none'">
                        <img src="img/payment-icons/card_google_pay.svg" style="height:22px;" alt="Google Pay" onerror="this.style.display='none'">
                    </div>
                </label>
                <label class="ck-payment-option" style="display:flex;align-items:center;gap:14px;padding:16px 20px;border:2px solid #e2e8f0;border-radius:10px;cursor:pointer;background:#fff;transition:all 0.2s;">
                    <input type="radio" name="paymentMethod" value="paypal" style="accent-color:#0070ba;width:18px;height:18px;">
                    <div style="flex:1;">
                        <div style="font-weight:600;font-size:14px;color:#1e293b;margin-bottom:4px;">🅿️ PayPal</div>
                        <div style="font-size:12px;color:#636E72;">Pay securely with your PayPal account</div>
                    </div>
                    <img src="img/payment-icons/card_paypal.svg" style="height:26px;" alt="PayPal" onerror="this.textContent='PayPal'">
                </label>
                ${klarnaHtml}
            </div>
            <div style="background:#f8f9fa;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:20px;text-align:center;">
                <span style="font-size:13px;color:#636E72;">🔒 Your payment is processed securely. We never store your card details.</span>
            </div>
            <div class="ck-nav">
                <button type="button" class="btn-account-outline" onclick="goStep(2)">← Back</button>
                <button type="submit" class="btn-account-primary ck-pay-btn">Proceed to Secure Payment (${fmt(total)})</button>
            </div>
        </form>`;
        }
        return '';
    }

    function attachStepListeners() {
        const form = document.getElementById('stepForm');
        if (!form) return;

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (step === 1) {
                checkoutData.contact = {
                    firstName: document.getElementById('ckFirstName').value.trim(),
                    lastName: document.getElementById('ckLastName').value.trim(),
                    email: document.getElementById('ckEmail').value.trim(),
                    phone: document.getElementById('ckPhone').value.trim()
                };
                step = 2; renderCheckout();
            } else if (step === 2) {
                checkoutData.shipping = {
                    addr1: document.getElementById('ckAddr1').value.trim(),
                    addr2: document.getElementById('ckAddr2').value.trim(),
                    city: document.getElementById('ckCity').value.trim(),
                    postcode: document.getElementById('ckPostcode').value.trim(),
                    country: document.getElementById('ckCountry').value
                };
                step = 3; renderCheckout();
            } else if (step === 3) {
                placeOrder();
            }
        });

        // Payment method toggle
        document.querySelectorAll('.ck-payment-option input[name="paymentMethod"]').forEach(r => {
            r.addEventListener('change', function () {
                document.querySelectorAll('.ck-payment-option').forEach(o => {
                    o.classList.remove('active');
                    o.style.borderColor = '#e2e8f0';
                    o.style.background = '#fff';
                });
                const opt = this.closest('.ck-payment-option');
                opt.classList.add('active');
                const colors = { stripe: '#2D6A4F', paypal: '#0070ba', klarna: '#FFB3C7' };
                const bgs = { stripe: '#f0fdf4', paypal: '#f0f7ff', klarna: '#fff5f7' };
                opt.style.borderColor = colors[this.value] || '#2D6A4F';
                opt.style.background = bgs[this.value] || '#f0fdf4';
                const btn = document.querySelector('.ck-pay-btn');
                if (btn) {
                    const labels = { stripe: 'Proceed to Secure Payment', paypal: 'Proceed to PayPal', klarna: 'Proceed to Klarna' };
                    btn.textContent = (labels[this.value] || 'Pay') + ' (' + btn.textContent.split('(').pop();
                }
            });
        });
    }

    window.goStep = function (n) { step = n; renderCheckout(); };

    window.applyCoupon = function () {
        const input = document.getElementById('couponInput');
        if (!input) return;
        const code = input.value.trim().toUpperCase();
        if (COUPONS[code]) {
            appliedCoupon = { ...COUPONS[code], code };
            renderCheckout();
            if (typeof showNotification === 'function') showNotification('Coupon applied: ' + appliedCoupon.label, 'success');
        } else {
            input.style.borderColor = '#ef4444';
            if (typeof showNotification === 'function') showNotification('Invalid coupon code', 'error');
        }
    };

    window.removeCoupon = function () {
        appliedCoupon = null;
        renderCheckout();
    };

    async function placeOrder() {
        const btn = document.querySelector('.ck-pay-btn');
        if (btn) { btn.textContent = 'Redirecting to payment...'; btn.disabled = true; }

        const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'stripe';
        const cart = getCart();
        const currency = window.sfi?.currency || 'EUR';

        const items = cart.map(i => ({
            id: i.id || i._id,
            name: i.nome,
            price: Number(i.preco),
            quantity: i.quantidade || 1,
            image: i.imagem || undefined,
        }));

        try {
            const SUPABASE_URL = 'https://styynhgzrkyoioqjssuw.supabase.co';
            const SUPABASE_ANON_KEY = 'sb_publishable_tiF58FbBT9UsaEMAaJlqWA_k3dLHElH';

            const endpoint = paymentMethod === 'paypal' 
                ? `${SUPABASE_URL}/functions/v1/create-paypal-checkout`
                : `${SUPABASE_URL}/functions/v1/create-checkout`;

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    items,
                    email: checkoutData.contact.email,
                    currency,
                    shippingAddress: checkoutData.shipping,
                    contact: checkoutData.contact,
                    coupon: appliedCoupon || null,
                    preferred_method: paymentMethod === 'klarna' ? 'klarna' : undefined,
                    is_b2b: window._sfiCustomerIsB2B || false,
                    attribution: typeof sfiGetAttribution === 'function' ? sfiGetAttribution() : {},
                }),
            });

            const data = await res.json();

            if (!res.ok || !data.url) {
                throw new Error(data.error || 'Could not create checkout session');
            }

            // Security: validate redirect URL before navigating
            const allowedDomains = ['checkout.stripe.com', 'sportsfoodsireland.ie', 'www.sportsfoodsireland.ie'];
            try {
                const redirectUrl = new URL(data.url);
                if (!allowedDomains.some(d => redirectUrl.hostname === d || redirectUrl.hostname.endsWith('.' + d))) {
                    throw new Error('Untrusted redirect domain: ' + redirectUrl.hostname);
                }
                window.location.href = data.url;
            } catch (urlErr) {
                throw new Error('Invalid checkout URL');
            }

        } catch (err) {
            console.error('[checkout] Payment error:', err);
            if (btn) { btn.textContent = 'Try Again'; btn.disabled = false; }
            if (typeof showNotification === 'function') {
                showNotification('Payment error: ' + (err.message || 'Please try again'), 'error');
            } else {
                alert('Payment error: ' + (err.message || 'Please try again'));
            }
        }
    }

    // ---- Handle Payment return (Stripe + PayPal) ----

    function handleStripeReturn() {
        const params = new URLSearchParams(window.location.search);

        if (params.get('success') === 'true' || params.get('paypal_success') === 'true') {
            localStorage.setItem('cart', '[]');
            if (typeof updateCartCount === 'function') updateCartCount();

            const provider = params.get('paypal_success') ? 'PayPal' : 'Stripe';
            container.innerHTML = `
            <div class="ck-confirmation">
                <div class="ck-check">✓</div>
                <h2>Payment Successful!</h2>
                <p class="ck-order-id">Thank you for your order.</p>
                <p>A confirmation email will be sent to you shortly. Your order is being processed.</p>
                <div class="ck-confirm-details">
                    <div><strong>Payment via</strong><br>${provider}</div>
                    <div><strong>What's next?</strong><br>You'll receive a shipping confirmation email within 1-2 business days.</div>
                    <div><strong>Questions?</strong><br>Contact us at <a href="mailto:info@sportsfoodsireland.ie">info@sportsfoodsireland.ie</a> or call +353 1 840 0403</div>
                </div>
                <a href="shop.html" class="btn-account-primary" style="display:inline-block;margin-top:24px;text-decoration:none">Continue Shopping</a>
                <a href="account.html" class="btn-account-outline" style="display:inline-block;margin-top:12px;margin-left:8px;text-decoration:none">View Orders</a>
            </div>`;
            return true;
        }

        if (params.get('canceled') === 'true' || params.get('paypal_canceled') === 'true') {
            if (typeof showNotification === 'function') {
                showNotification('Payment was cancelled. Your cart is still saved.', 'info');
            }
            // Remove query params from URL without reload
            window.history.replaceState({}, document.title, window.location.pathname);
            return false; // Continue to render normal checkout
        }

        return false;
    }

    // Pre-fill from auth if available + detect B2B
    window._sfiCustomerIsB2B = false;
    if (window.sfi?.auth?.isLoggedIn()) {
        const u = sfi.auth.getUser();
        const m = u?.user_metadata || {};
        checkoutData.contact = {
            firstName: m.first_name || '', lastName: m.last_name || '',
            email: u?.email || '', phone: m.phone || ''
        };
        const addrs = m.addresses || [];
        if (addrs.length) {
            const a = addrs[0];
            checkoutData.shipping = {
                addr1: a.line1 || '', addr2: a.line2 || '',
                city: a.city || '', postcode: a.postcode || '', country: a.country || 'IE'
            };
        }
        // Check B2B status (async, updates flag for Klarna visibility)
        if (sfi.b2b?.checkAccess) {
            sfi.b2b.checkAccess().then(isB2B => {
                window._sfiCustomerIsB2B = !!isB2B;
            }).catch(() => {});
        }
    }

    // Check if returning from Stripe before rendering checkout
    const stripeReturn = handleStripeReturn();
    if (!stripeReturn) {
        renderCheckout();
    }
})();
