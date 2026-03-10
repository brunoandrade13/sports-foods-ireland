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
}

function showDashboard() {
    hide(loginCard); hide(registerCard); show(dashboard); hide(guestCard);
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
    loadOrders();
    loadAddresses();

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
            // Show B2B portal buttons
            if (accessBtn) accessBtn.style.display = 'block';
            const shopBtn = document.getElementById('b2bShopBtn');
            if (shopBtn) shopBtn.style.display = 'block';
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
                'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0eXluaGd6cmt5b2lvcWpzc3V3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0Mjg4NzcsImV4cCI6MjA4NjAwNDg3N30.Qx7g5brABFwFKnv_ZLRYteSXnGSaLTKpDFbbSUYepbE',
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
async function loadOrders() {
    const el = document.getElementById('ordersList');
    if (!el) return;
    try {
        const orders = await sfi.orders.myOrders();
        if (!orders || orders.length === 0) {
            el.innerHTML = '<p class="empty-state">You haven\'t placed any orders yet. <a href="shop.html">Start shopping</a></p>';
            return;
        }
        el.innerHTML = orders.map(o => `
            <div class="order-card">
                <div class="order-header">
                    <span><strong>Order #${o.id?.slice(0,8)}</strong></span>
                    <span>${new Date(o.created_at).toLocaleDateString('en-IE')}</span>
                    <span class="order-status ${o.status || 'pending'}">${(o.status || 'pending').toUpperCase()}</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <span>${o.order_items?.length || 0} item(s)</span>
                    <strong>€${(o.total || 0).toFixed(2)}</strong>
                </div>
            </div>
        `).join('');
    } catch (err) {
        el.innerHTML = '<p class="empty-state">Unable to load orders.</p>';
    }
}

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
    const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0eXluaGd6cmt5b2lvcWpzc3V3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0Mjg4NzcsImV4cCI6MjA4NjAwNDg3N30.Qx7g5brABFwFKnv_ZLRYteSXnGSaLTKpDFbbSUYepbE';
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
    const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0eXluaGd6cmt5b2lvcWpzc3V3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0Mjg4NzcsImV4cCI6MjA4NjAwNDg3N30.Qx7g5brABFwFKnv_ZLRYteSXnGSaLTKpDFbbSUYepbE';
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
