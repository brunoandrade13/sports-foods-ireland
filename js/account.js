/**
 * SFI Account Page — Auth & Dashboard Logic
 */
(function() {
'use strict';

// ---- DOM REFS ----
const loginCard = document.getElementById('loginCard');
const registerCard = document.getElementById('registerCard');
const dashboard = document.getElementById('accountDashboard');
const guestCard = document.querySelector('.guest-checkout-card');

// ---- HELPERS ----
function show(el) { if (el) el.style.display = ''; }
function hide(el) { if (el) el.style.display = 'none'; }

function showMsg(id, text, type) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'form-msg ' + type;
    setTimeout(() => { el.textContent = ''; }, 4000);
}

function showToast(msg, type) {
    if (typeof window.showNotification === 'function') {
        window.showNotification(msg, type);
    } else {
        alert(msg);
    }
}

// ---- AUTH STATE ----
function checkAuthState() {
    if (window.sfi && sfi.auth.isLoggedIn()) {
        showDashboard();
    } else {
        showLoginForms();
    }
}

function showLoginForms() {
    show(loginCard); hide(registerCard); hide(dashboard); show(guestCard);
    document.body.classList.remove('account-logged-in');
}

function showDashboard() {
    hide(loginCard); hide(registerCard); show(dashboard); hide(guestCard);
    // Full-width dashboard mode
    document.body.classList.add('account-logged-in');
    loadProfile();
}

window.showRegister = function() { hide(loginCard); show(registerCard); };
window.showLogin = function() { show(loginCard); hide(registerCard); };

// ---- LOGIN ----
document.getElementById('loginForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = this.querySelector('button[type="submit"]');
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) return;

    btn.textContent = 'Signing in...';
    btn.disabled = true;

    try {
        const data = await sfi.auth.signIn(email, password);
        if (data.access_token) {
            showToast('Welcome back!', 'success');
            showDashboard();
        } else {
            showToast(data.error_description || data.msg || 'Invalid email or password.', 'error');
        }
    } catch (err) {
        showToast('Connection error. Please try again.', 'error');
    } finally {
        btn.textContent = 'Sign In';
        btn.disabled = false;
    }
});

// ---- REGISTER ----
document.getElementById('registerForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = this.querySelector('button[type="submit"]');
    const firstName = document.getElementById('registerFirstName').value.trim();
    const lastName = document.getElementById('registerLastName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirm = document.getElementById('registerConfirmPassword').value;

    if (password.length < 8) {
        showToast('Password must be at least 8 characters.', 'error');
        return;
    }
    if (password !== confirm) {
        showToast('Passwords do not match.', 'error');
        return;
    }
    if (!this.querySelector('[name="terms"]').checked) {
        showToast('Please accept the Terms & Conditions.', 'error');
        return;
    }

    btn.textContent = 'Creating account...';
    btn.disabled = true;

    try {
        const data = await sfi.auth.signUp(email, password, { firstName, lastName });
        if (data.access_token) {
            showToast('Account created! Welcome to SFI.', 'success');
            showDashboard();
        } else if (data.msg || data.error_description) {
            showToast(data.msg || data.error_description, 'error');
        } else {
            showToast('Please check your email to confirm your account.', 'success');
            window.showLogin();
        }
    } catch (err) {
        showToast('Connection error. Please try again.', 'error');
    } finally {
        btn.textContent = 'Create Account';
        btn.disabled = false;
    }
});

// ---- SIGN OUT ----
window.handleSignOut = function() {
    sfi.auth.signOut();
    showToast('Signed out successfully.', 'success');
    showLoginForms();
};

// ---- FORGOT PASSWORD ----
document.querySelector('.forgot-link')?.addEventListener('click', function(e) {
    e.preventDefault();
    const overlay = document.createElement('div');
    overlay.className = 'forgot-overlay';
    overlay.innerHTML = `
        <div class="forgot-card">
            <h3>Reset Password</h3>
            <p>Enter your email and we'll send you a link to reset your password.</p>
            <form id="forgotForm" class="account-form">
                <div class="form-group">
                    <label>Email Address</label>
                    <input type="email" id="forgotEmail" required placeholder="you@example.com">
                </div>
                <button type="submit" class="btn-account-primary" style="width:100%">Send Reset Link</button>
            </form>
            <p style="text-align:center;margin-top:12px">
                <a href="#" class="forgot-close" style="color:var(--color-text-secondary)">Cancel</a>
            </p>
        </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('.forgot-close').onclick = function(ev) { ev.preventDefault(); overlay.remove(); };
    overlay.addEventListener('click', function(ev) { if (ev.target === overlay) overlay.remove(); });

    overlay.querySelector('#forgotForm').addEventListener('submit', async function(ev) {
        ev.preventDefault();
        const email = document.getElementById('forgotEmail').value.trim();
        const btn = this.querySelector('button');
        btn.textContent = 'Sending...'; btn.disabled = true;
        try {
            await sfi.auth.resetPassword(email);
            overlay.querySelector('.forgot-card').innerHTML =
                '<h3>✅ Email Sent</h3><p>Check your inbox for a password reset link.</p>' +
                '<button class="btn-account-primary" style="width:100%;margin-top:16px" onclick="this.closest(\'.forgot-overlay\').remove()">Close</button>';
        } catch (err) {
            showToast('Error sending email. Try again.', 'error');
            btn.textContent = 'Send Reset Link'; btn.disabled = false;
        }
    });
});

// ---- LOAD PROFILE ----
function loadProfile() {
    const user = sfi.auth.getUser();
    if (!user) return;
    const meta = user.user_metadata || {};
    document.getElementById('dashName').textContent = meta.first_name || 'Customer';
    document.getElementById('dashEmail').textContent = user.email || '';
    document.getElementById('profFirstName').value = meta.first_name || '';
    document.getElementById('profLastName').value = meta.last_name || '';
    document.getElementById('profPhone').value = meta.phone || '';
    const emailField = document.getElementById('profEmail');
    if (emailField) emailField.value = user.email || '';
    loadOrders();
    loadAddresses();
    loadOverview();

    // --- B2B status check ---
    checkB2BStatus();
}

async function checkB2BStatus() {
    try {
        if (typeof sfi === 'undefined' || !sfi.b2b) return;
        const profile = await sfi.b2b.getProfile();
        const pendingBadge = document.getElementById('b2bPendingBadge');
        const accessBtn = document.getElementById('b2bAccessBtn');
        const applyLink = document.getElementById('b2bApplyLink');

        if (profile?.is_b2b && profile?.b2b_status === 'approved') {
            // B2B approved: redirect directly to B2B portal
            window.location.href = 'b2b/portal.html';
            return;
        } else if (profile?.b2b_status === 'pending') {
            // Show pending badge
            if (pendingBadge) pendingBadge.style.display = 'block';
        } else {
            // Show apply link for non-B2B users
            if (applyLink) applyLink.style.display = 'block';
        }
    } catch (e) {
        // Silently fail — B2B features just won't show
    }
}

// ---- TABS ----
document.querySelectorAll('.dash-tab').forEach(tab => {
    tab.addEventListener('click', function() {
        document.querySelectorAll('.dash-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
        this.classList.add('active');
        const panel = document.getElementById('tab-' + this.dataset.tab);
        if (panel) panel.classList.add('active');
    });
});

// ---- SAVE PROFILE ----
document.getElementById('profileForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = this.querySelector('button');
    btn.textContent = 'Saving...'; btn.disabled = true;
    try {
        const token = localStorage.getItem('sfi_token');
        const res = await fetch(sfi.auth._url || `https://styynhgzrkyoioqjssuw.supabase.co/auth/v1/user`, {
            method: 'PUT',
            headers: {
                'apikey': 'sb_publishable_tiF58FbBT9UsaEMAaJlqWA_k3dLHElH',
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                data: {
                    first_name: document.getElementById('profFirstName').value.trim(),
                    last_name: document.getElementById('profLastName').value.trim(),
                    phone: document.getElementById('profPhone').value.trim()
                }
            })
        });
        const data = await res.json();
        if (data.id) {
            localStorage.setItem('sfi_user', JSON.stringify(data));
            showMsg('profileMsg', '✓ Saved', 'success');
            document.getElementById('dashName').textContent = data.user_metadata?.first_name || 'Customer';
        } else {
            showMsg('profileMsg', 'Error saving', 'error');
        }
    } catch (err) {
        showMsg('profileMsg', 'Connection error', 'error');
    }
    btn.textContent = 'Save Changes'; btn.disabled = false;
});

// ---- LOAD ORDERS ----
async function loadOverview() {
    try {
        const orders = await sfi.orders.myOrders();
        const count = orders?.length || 0;
        const el = document.getElementById('overviewOrderCount');
        if (el) el.textContent = count + ' orders';
        
        // Recent orders (last 3)
        const recent = document.getElementById('overviewRecentOrders');
        if (recent && orders && orders.length > 0) {
            recent.innerHTML = orders.slice(0, 3).map(o => {
                const num = o.order_number || '#' + (o.id?.slice(0,8) || '');
                const date = new Date(o.created_at).toLocaleDateString('en-IE', {day:'numeric',month:'short'});
                const status = o.financial_status || o.status || 'pending';
                const color = status === 'paid' ? '#169B62' : '#d97706';
                return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f1f5f9">' +
                    '<div><span style="font-weight:600;color:#1e293b">' + num + '</span><span style="color:#94a3b8;margin-left:8px;font-size:0.85rem">' + date + '</span></div>' +
                    '<div style="display:flex;align-items:center;gap:12px"><span style="font-weight:600;color:#1e293b">€' + (Number(o.total)||0).toFixed(2) + '</span><span style="background:' + color + '20;color:' + color + ';padding:2px 8px;border-radius:12px;font-size:0.7rem;font-weight:600">' + status.toUpperCase() + '</span></div></div>';
            }).join('');
        } else if (recent) {
            recent.innerHTML = '<p style="color:#94a3b8;font-size:0.9rem">No orders yet. <a href="shop.html" style="color:#FF883E;font-weight:600">Start shopping →</a></p>';
        }
    } catch(e) { console.warn('loadOverview:', e); }
}

async function loadOrders() {
    const el = document.getElementById('ordersList');
    if (!el) return;
    try {
        const orders = await sfi.orders.myOrders();
        if (!orders || orders.length === 0) {
            el.innerHTML = '<p class="empty-state">You haven\'t placed any orders yet. <a href="shop.html">Start shopping</a></p>';
            return;
        }
        el.innerHTML = orders.map(o => {
            const orderNum = o.order_number || ('#' + (o.id?.slice(0,8) || ''));
            const date = new Date(o.created_at).toLocaleDateString('en-IE', { day:'numeric', month:'short', year:'numeric' });
            const status = o.status || o.financial_status || 'pending';
            const statusColor = status === 'paid' || status === 'processing' ? '#169B62' : status === 'pending' ? '#d97706' : status === 'cancelled' ? '#dc2626' : '#636E72';
            const items = o.order_items || [];
            const fulfillment = o.fulfillment_status || 'unfulfilled';
            const fulfillBadge = fulfillment === 'fulfilled' ? '<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:12px;font-size:0.7rem;font-weight:600">DELIVERED</span>'
                : fulfillment === 'partial' ? '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:12px;font-size:0.7rem;font-weight:600">PARTIAL</span>'
                : '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:12px;font-size:0.7rem;font-weight:600">PROCESSING</span>';
            const payBadge = '<span style="background:' + (status==='paid'?'#d1fae5;color:#065f46':'#fef3c7;color:#92400e') + ';padding:2px 8px;border-radius:12px;font-size:0.7rem;font-weight:600">' + (o.financial_status||status).toUpperCase() + '</span>';

            const itemsHtml = items.length ? items.map(it => {
                const name = it.product_name || it.name || 'Product';
                const qty = it.quantity || 1;
                const price = Number(it.unit_price || it.price || 0).toFixed(2);
                return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:0.85rem"><span style="color:#334155">' + name + ' <span style="color:#94a3b8">x' + qty + '</span></span><span style="font-weight:600;color:#1e293b">€' + price + '</span></div>';
            }).join('') : '<div style="padding:8px 0;color:#94a3b8;font-size:0.85rem">Order details not available</div>';

            // FE-A2: use data-* attribute to avoid JSON-in-onclick breakage with special chars
            const itemsPayload = encodeURIComponent(JSON.stringify(items.map(it => ({
                id: it.product_id, name: it.product_name || it.name, price: Number(it.unit_price || it.price || 0), qty: it.quantity || 1
            }))));

            return '<div class="order-card" style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:0 1px 3px rgba(0,0,0,0.05)">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">' +
                    '<div><span style="font-weight:700;color:#1e293b;font-size:1.05rem">' + orderNum + '</span><span style="color:#94a3b8;margin-left:10px;font-size:0.85rem">' + date + '</span></div>' +
                    '<div style="display:flex;gap:6px">' + payBadge + fulfillBadge + '</div>' +
                '</div>' +
                '<div style="margin-bottom:12px">' + itemsHtml + '</div>' +
                '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:2px solid #f1f5f9">' +
                    '<div><span style="color:#64748b;font-size:0.85rem">Payment: </span><span style="color:#334155;font-size:0.85rem;font-weight:500">' + (o.payment_method || '—') + '</span></div>' +
                    '<div style="display:flex;align-items:center;gap:12px"><span style="font-weight:700;font-size:1.1rem;color:#169B62">€' + (Number(o.total)||0).toFixed(2) + '</span>' +
                    '<button type="button" class="sfi-reorder-btn" data-items="' + itemsPayload + '" style="background:#FF883E;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:600;font-size:0.8rem;cursor:pointer">🔄 Reorder</button></div>' +
                '</div>' +
            '</div>';
        }).join('');
        // Event delegation for reorder buttons (avoids inline onclick)
        el.addEventListener('click', function(e) {
            const btn = e.target.closest('.sfi-reorder-btn');
            if (btn) window.reorderItems(btn.dataset.items);
        }, { once: false });
    } catch (err) {
        console.error('loadOrders:', err);
        el.innerHTML = '<p class="empty-state">Unable to load orders.</p>';
    }
}

// ---- REORDER ----
window.reorderItems = function(itemsJson) {
    try {
        const items = JSON.parse(decodeURIComponent(itemsJson));
        if (!items || !items.length) { alert('No items to reorder'); return; }
        const cart = JSON.parse(localStorage.getItem('sfi_cart') || '[]');
        let added = 0;
        items.forEach(item => {
            if (!item.name) return;
            const existing = cart.find(c => c.nome === item.name);
            if (existing) {
                existing.quantidade = (existing.quantidade || 1) + (item.qty || 1);
            } else {
                cart.push({ id: item.id, nome: item.name, preco: item.price || 0, quantidade: item.qty || 1, imagem: '' });
            }
            added++;
        });
        localStorage.setItem('sfi_cart', JSON.stringify(cart));
        if (typeof window.updateCartCount === 'function') window.updateCartCount();
        alert(added + ' item(s) added to your cart!');
    } catch (e) {
        console.error('Reorder error:', e);
        alert('Could not reorder. Please try again.');
    }
};

// ---- ADDRESSES ----
async function loadAddresses() {
    const el = document.getElementById('addressesList');
    if (!el) return;
    try {
        const user = sfi.auth.getUser();
        const addrs = user?.user_metadata?.addresses || [];
        if (addrs.length === 0) {
            el.innerHTML = '<p class="empty-state">No saved addresses yet.</p>';
            return;
        }
        el.innerHTML = addrs.map((a, i) => `
            <div class="address-card">
                <div>
                    <div class="addr-label">${a.label || 'Address ' + (i+1)}</div>
                    <div class="addr-text">${a.line1}${a.line2 ? ', ' + a.line2 : ''}<br>${a.city}, ${a.postcode}<br>${a.country === 'IE' ? 'Ireland' : 'United Kingdom'}</div>
                </div>
                <button class="btn-account-outline" style="font-size:0.8rem;padding:6px 12px" onclick="removeAddress(${i})">Remove</button>
            </div>
        `).join('');
    } catch (err) {
        el.innerHTML = '<p class="empty-state">Unable to load addresses.</p>';
    }
}

window.toggleAddressForm = function() {
    const f = document.getElementById('addressForm');
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
};

document.getElementById('addressForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const user = sfi.auth.getUser();
    const addrs = user?.user_metadata?.addresses || [];
    addrs.push({
        label: document.getElementById('addrLabel').value.trim(),
        line1: document.getElementById('addrLine1').value.trim(),
        line2: document.getElementById('addrLine2').value.trim(),
        city: document.getElementById('addrCity').value.trim(),
        postcode: document.getElementById('addrPostcode').value.trim(),
        country: document.getElementById('addrCountry').value
    });
    await saveUserMeta({ addresses: addrs });
    this.reset();
    this.style.display = 'none';
    loadAddresses();
    showToast('Address saved!', 'success');
});

window.removeAddress = async function(idx) {
    const user = sfi.auth.getUser();
    const addrs = user?.user_metadata?.addresses || [];
    addrs.splice(idx, 1);
    await saveUserMeta({ addresses: addrs });
    loadAddresses();
    showToast('Address removed.', 'success');
};

// ---- SHARED: Update user metadata ----
async function saveUserMeta(dataObj) {
    const token = localStorage.getItem('sfi_token');
    const SUPA_URL = 'https://styynhgzrkyoioqjssuw.supabase.co';
    const SUPA_KEY = 'sb_publishable_tiF58FbBT9UsaEMAaJlqWA_k3dLHElH';
    const res = await fetch(`${SUPA_URL}/auth/v1/user`, {
        method: 'PUT',
        headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: dataObj })
    });
    const updated = await res.json();
    if (updated.id) localStorage.setItem('sfi_user', JSON.stringify(updated));
    return updated;
}

// ---- CHANGE PASSWORD ----
document.getElementById('changePasswordForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const pw = document.getElementById('newPassword').value;
    const confirm = document.getElementById('confirmNewPassword').value;
    if (pw.length < 8) { showMsg('passwordMsg', 'Min 8 characters', 'error'); return; }
    if (pw !== confirm) { showMsg('passwordMsg', 'Passwords don\'t match', 'error'); return; }

    const token = localStorage.getItem('sfi_token');
    const SUPA_URL = 'https://styynhgzrkyoioqjssuw.supabase.co';
    const SUPA_KEY = 'sb_publishable_tiF58FbBT9UsaEMAaJlqWA_k3dLHElH';
    try {
        const res = await fetch(`${SUPA_URL}/auth/v1/user`, {
            method: 'PUT',
            headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pw })
        });
        if (res.ok) {
            showMsg('passwordMsg', '✓ Password updated', 'success');
            this.reset();
        } else {
            showMsg('passwordMsg', 'Error updating password', 'error');
        }
    } catch (err) {
        showMsg('passwordMsg', 'Connection error', 'error');
    }
});

// ---- DELETE ACCOUNT ----
window.confirmDeleteAccount = function() {
    if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
        sfi.auth.signOut();
        showToast('Account deletion requested. Contact support@sportsfoodsireland.ie for completion.', 'success');
        showLoginForms();
    }
};

// ---- HEADER AUTH ICON ----
function updateHeaderAuth() {
    const accountLink = document.querySelector('a[href="account.html"]');
    if (accountLink && sfi.auth.isLoggedIn()) {
        const user = sfi.auth.getUser();
        const name = user?.user_metadata?.first_name || '';
        if (name) accountLink.title = 'Hi, ' + name;
    }
}

// ---- INIT ----
checkAuthState();
updateHeaderAuth();

})(); // End IIFE
