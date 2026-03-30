/* ═══════════════════════════════════════════════
   B2B Portal Controller — v3 (Fixed data flow)
   Sports Foods Ireland
   ═══════════════════════════════════════════════ */
const B2B = (function() {
  'use strict';
  let profile = null;
  let allOrders = [];
  let reorderItems = [];
  const FMT = v => '€' + Number(v||0).toLocaleString('en-IE',{minimumFractionDigits:2,maximumFractionDigits:2});
  const EXVAT = v => Number(v||0) / 1.23;  // Remove 23% VAT for B2B display
  const FMTX = v => FMT(EXVAT(v));  // Format ex-VAT price

  // Helper: resolve product image from item_summary data, with fallback to cached products by name
  function resolveItemImage(item) {
    if (item.image_url) return item.image_url;
    var allCached = portalShopAll.length ? portalShopAll : inlineShopProducts;
    if (!allCached.length) return '';
    var cached = null;
    // 1. Match by legacy_id
    if (item.legacy_id) cached = allCached.find(function(p) { return p.id === item.legacy_id; });
    // 2. Match by name
    if (!cached && item.product_name) {
      var iName = (item.product_name || '').toLowerCase().trim();
      var iBase = iName.replace(/ - .*$/, '').trim();
      // Exact full name
      cached = allCached.find(function(p) { return (p.nome||'').toLowerCase().trim() === iName; });
      // Exact base name (stripped variant suffix)
      if (!cached) cached = allCached.find(function(p) { return (p.nome||'').toLowerCase().trim() === iBase; });
      // Product name is prefix of order item name
      if (!cached) cached = allCached.find(function(p) {
        var pn = (p.nome||'').toLowerCase().trim();
        return pn.length > 8 && iName.startsWith(pn);
      });
      // Order item base matches product base
      if (!cached) cached = allCached.find(function(p) {
        var pBase = (p.nome||'').toLowerCase().replace(/ - .*$/, '').trim();
        return pBase.length > 8 && (pBase === iBase || iBase.startsWith(pBase) || pBase.startsWith(iBase));
      });
      // 3+ keyword match (for reordered words or slight name differences)
      if (!cached) {
        var words = iBase.split(/\s+/).filter(function(w) { return w.length > 2 && !/^(the|and|for|box|bag|pack|x|of)$/i.test(w); }).slice(0, 5);
        if (words.length >= 3) {
          cached = allCached.find(function(p) {
            var pLower = (p.nome||'').toLowerCase();
            var matchCount = words.filter(function(w) { return pLower.indexOf(w) >= 0; }).length;
            return matchCount >= Math.min(3, words.length);
          });
        }
      }
    }
    return cached ? (cached.imagem || cached.image_url || '') : '';
  }

  function imgSrc(rawUrl) {
    if (!rawUrl) return '../img/placeholder.webp';
    return rawUrl.startsWith('http') ? rawUrl : '../' + rawUrl;
  }

  // ── Init ──
  async function init() {
    try {
      if (typeof sfi === 'undefined' || !sfi.b2b) throw new Error('API not loaded');
      const ok = await sfi.b2b.checkAccess();
      if (!ok) { showDenied(); return; }
      profile = await sfi.b2b.getProfile();
      if (!profile) { showDenied(); return; }

      const name = profile.display_name || profile.name || [profile.first_name,profile.last_name].filter(Boolean).join(' ') || 'B2B Account';
      document.getElementById('heroCompany').textContent = name;
      document.getElementById('heroBadge').textContent = (profile.customer_type||'b2b').toUpperCase() + ' Customer';

      // Populate customer details in hero
      const infoEl = document.getElementById('heroCustomerInfo');
      if (infoEl) {
        const parts = [];
        const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
        if (fullName) parts.push('👤 ' + fullName);
        if (profile.email) parts.push('📧 ' + profile.email);
        if (profile.phone) parts.push('📞 ' + profile.phone);
        const addr = [profile.address, profile.city, profile.country].filter(Boolean).join(', ');
        if (addr) parts.push('📍 ' + addr);
        infoEl.innerHTML = parts.join('<br>');
      }

      document.getElementById('portalLoading').style.display = 'none';
      document.getElementById('portalContent').style.display = 'block';

      // Hide Sub-Accounts tab if this user is a sub-account (has parent)
      if (profile.parent_customer_id) {
        var saTab = document.querySelector('.b2b-tab[data-tab="subaccounts"]');
        if (saTab) saTab.style.display = 'none';
      }

      await loadDashboard();
      setTimeout(() => { loadTopProducts(); loadInvoices(); loadCompanyInfo(); }, 300);
      // Open tab from URL param (?tab=orders)
      const urlTab = new URLSearchParams(window.location.search).get('tab');
      if (urlTab) setTimeout(() => showTab(urlTab), 100);
    } catch(e) {
      console.error('B2B init error:', e);
      showDenied();
    }
  }

  function showDenied() {
    document.getElementById('portalLoading').style.display = 'none';
    document.getElementById('portalDenied').style.display = 'block';
  }

  function showTab(tabId) {
    document.querySelectorAll('.b2b-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.b2b-tab').forEach(t => t.classList.remove('active'));
    const panel = document.getElementById('tab-' + tabId);
    if (panel) panel.classList.add('active');
    const btn = document.querySelector(`.b2b-tab[data-tab="${tabId}"]`);
    if (btn) btn.classList.add('active');
    window.scrollTo({top: document.getElementById('b2bTabs').offsetTop - 100, behavior:'smooth'});
    // Populate orders stats when switching to orders tab
    if (tabId === 'orders') populateOrdersStats();
    // Load shop when switching to shop tab
    if (tabId === 'shop' && !portalShopLoaded) loadPortalShop();
    // Load financial data when switching to financial tab
    if (tabId === 'financial') loadFinancialData();
    // Load sub-accounts when switching to subaccounts tab
    if (tabId === 'subaccounts') loadSubAccounts();
  }

  function populateOrdersStats() {
    const el1 = document.getElementById('ordStatSpend');
    const el2 = document.getElementById('ordStatOrders');
    const el3 = document.getElementById('ordStatPending');
    const s1 = document.getElementById('statSpendYear');
    const s2 = document.getElementById('statOrdersYear');
    const s3 = document.getElementById('statPending');
    if (el1 && s1) el1.textContent = s1.textContent;
    if (el2 && s2) el2.textContent = s2.textContent;
    if (el3 && s3) el3.textContent = s3.textContent;
    // Populate sub-account dropdown
    populateSubAccountFilter();
  }

  async function populateSubAccountFilter() {
    var sel = document.getElementById('orderSubAccount');
    if (!sel || sel.options.length > 1) return;
    try {
      var subs = await sfi.b2b.getSubAccounts();
      if (!subs || !subs.length) { sel.style.display = 'none'; return; }
      var mainName = profile ? ([profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email) : 'My Account';
      sel.innerHTML = '<option value="">All Accounts</option>';
      sel.innerHTML += '<option value="' + (profile.id||'') + '">\u2b50 ' + mainName + '</option>';
      subs.forEach(function(s) {
        var name = [s.first_name, s.last_name].filter(Boolean).join(' ') || s.email;
        sel.innerHTML += '<option value="' + s.id + '">' + name + ' (' + s.email + ')</option>';
      });
    } catch(e) {}
  }

  // ── Financial Tab ──
  let financialLoaded = false;

  function showFinTab(subId) {
    document.querySelectorAll('.fin-panel').forEach(function(p) { p.style.display = 'none'; p.classList.remove('active'); });
    document.querySelectorAll('.fin-subtab').forEach(function(t) { t.classList.remove('active'); });
    var panel = document.getElementById('fin-' + subId);
    if (panel) { panel.style.display = 'block'; panel.classList.add('active'); }
    var btn = document.querySelector('.fin-subtab[data-fin="' + subId + '"]');
    if (btn) btn.classList.add('active');
  }

  // ── Sub-Accounts ──
  let subAccountsLoaded = false;

  async function loadSubAccounts() {
    if (subAccountsLoaded) return;
    subAccountsLoaded = true;
    // Populate main account info with INDIVIDUAL data (not group total)
    if (profile) {
      var mainName = profile.display_name || profile.name || [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Main Account';
      document.getElementById('subMainName').textContent = mainName;
      document.getElementById('subMainEmail').textContent = profile.email || '';
      // Fetch individual account stats
      document.getElementById('subMainSpent').textContent = FMT(Number(profile.total_spent_eur || 0));
      document.getElementById('subMainOrders').textContent = profile.total_orders || 0;
    }
    // Load sub-accounts
    var list = document.getElementById('subAccountsList');
    if (!list) return;
    list.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;"><p>Loading sub-accounts...</p></div>';
    try {
      var subs = await sfi.b2b.getSubAccounts();
      if (!subs || !subs.length) {
        list.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;"><div style="font-size:2rem;margin-bottom:8px;">👤</div><p>No sub-accounts linked yet. Add a sub-account to let team members place orders under your company.</p></div>';
        return;
      }
      window._b2bSubAccounts = subs;
      list.innerHTML = subs.map(function(s, idx) {
        var name = [s.first_name, s.last_name].filter(Boolean).join(' ') || s.email;
        var spent = Number(s.total_spent || 0);
        var lastOrder = s.last_order_date ? new Date(s.last_order_date).toLocaleDateString('en-IE', {day:'2-digit', month:'short', year:'numeric'}) : 'Never';
        return '<div class="sub-account-card" id="subCard' + idx + '">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;cursor:pointer;" onclick="B2B.toggleSubDetail(' + idx + ')">' +
            '<div style="flex:1;min-width:200px;">' +
              '<div style="font-weight:600;color:#1e293b;font-size:0.95rem;">' + name + '</div>' +
              '<div style="font-size:0.85rem;color:#636E72;">' + (s.email || '') + '</div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:repeat(3,auto);gap:20px;text-align:center;">' +
              '<div><div style="font-size:0.7rem;color:#94a3b8;text-transform:uppercase;">Orders</div><div style="font-weight:700;color:#1e293b;">' + (s.total_orders || 0) + '</div></div>' +
              '<div><div style="font-size:0.7rem;color:#94a3b8;text-transform:uppercase;">Total Spent</div><div style="font-weight:700;color:#1B4332;">' + FMT(spent) + '</div></div>' +
              '<div><div style="font-size:0.7rem;color:#94a3b8;text-transform:uppercase;">Last Order</div><div style="font-weight:600;color:#636E72;font-size:0.85rem;">' + lastOrder + '</div></div>' +
            '</div>' +
            '<div style="color:#94a3b8;font-size:1.1rem;transition:transform 0.2s;" id="subArrow' + idx + '">▼</div>' +
          '</div>' +
          '<div class="sub-detail-panel" id="subDetail' + idx + '" style="display:none;margin-top:16px;padding-top:16px;border-top:1px solid #f1f5f9;">' +
            '<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;">' +
              '<button onclick="event.stopPropagation();B2B.showSubPermissions(' + idx + ')" class="sub-action-btn">🔒 Edit Permissions</button>' +
              '<button onclick="event.stopPropagation();B2B.showSubOrders(' + idx + ')" class="sub-action-btn">📦 View Orders</button>' +
            '</div>' +
            '<div id="subContent' + idx + '"></div>' +
          '</div>' +
        '</div>';
      }).join('');
    } catch(e) {
      list.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444;"><p>Error loading sub-accounts.</p></div>';
    }
  }

  function toggleSubDetail(idx) {
    var panel = document.getElementById('subDetail' + idx);
    var arrow = document.getElementById('subArrow' + idx);
    if (!panel) return;
    var show = panel.style.display === 'none';
    panel.style.display = show ? 'block' : 'none';
    if (arrow) arrow.style.transform = show ? 'rotate(180deg)' : 'rotate(0deg)';
  }

  function showSubPermissions(idx) {
    var subs = window._b2bSubAccounts || [];
    var s = subs[idx];
    if (!s) return;
    var content = document.getElementById('subContent' + idx);
    if (!content) return;
    var name = [s.first_name, s.last_name].filter(Boolean).join(' ') || s.email;
    content.innerHTML = '<div style="background:#f8f9fa;border-radius:8px;padding:16px;">' +
      '<h4 style="color:#1e293b;margin-bottom:12px;">🔒 Permissions for ' + name + '</h4>' +
      '<div style="display:grid;gap:8px;">' +
        permRow('View Dashboard', true) +
        permRow('View Product Catalogue', true) +
        permRow('Place Orders', true) +
        permRow('View Order History (Own)', true) +
        permRow('View All Sub-Account Orders', false) +
        permRow('View Financial / Invoices', false) +
        permRow('View Marketing Resources', true) +
        permRow('Access Support / Tickets', true) +
        permRow('Manage Sub-Accounts', false) +
        permRow('Edit Company Details', false) +
      '</div>' +
      '<p style="font-size:0.8rem;color:#94a3b8;margin-top:12px;">To change permissions, contact <a href="mailto:b2b@sportsfoodsireland.ie" style="color:#2D6A4F;">b2b@sportsfoodsireland.ie</a></p>' +
    '</div>';
  }

  function permRow(label, enabled) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#fff;border-radius:6px;border:1px solid #e2e8f0;">' +
      '<span style="font-size:0.85rem;color:#1e293b;">' + label + '</span>' +
      '<span style="font-size:0.8rem;font-weight:600;color:' + (enabled ? '#166534' : '#991b1b') + ';">' + (enabled ? '✓ Allowed' : '✕ Restricted') + '</span>' +
    '</div>';
  }

  async function showSubOrders(idx) {
    var subs = window._b2bSubAccounts || [];
    var s = subs[idx];
    if (!s) return;
    var content = document.getElementById('subContent' + idx);
    if (!content) return;
    var name = [s.first_name, s.last_name].filter(Boolean).join(' ') || s.email;
    content.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;">Loading orders for ' + name + '...</div>';

    try {
      var SUPABASE_URL = 'https://styynhgzrkyoioqjssuw.supabase.co';
      var SUPABASE_KEY = 'sb_publishable_tiF58FbBT9UsaEMAaJlqWA_k3dLHElH';
      var res = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_b2b_sub_account_orders', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_sub_customer_id: s.id, p_limit: 20 })
      });
      var orders = await res.json();
      if (!orders || !orders.length) {
        content.innerHTML = '<div style="text-align:center;padding:20px;color:#94a3b8;">No orders found for ' + name + '.</div>';
        return;
      }
      content.innerHTML = '<div style="background:#f8f9fa;border-radius:8px;padding:16px;">' +
        '<h4 style="color:#1e293b;margin-bottom:12px;">📦 Recent Orders — ' + name + '</h4>' +
        '<table style="width:100%;border-collapse:collapse;font-size:0.85rem;">' +
        '<thead><tr style="border-bottom:2px solid #e2e8f0;"><th style="padding:8px;text-align:left;color:#636E72;font-size:0.75rem;text-transform:uppercase;">Order</th><th style="padding:8px;text-align:left;color:#636E72;font-size:0.75rem;text-transform:uppercase;">Date</th><th style="padding:8px;text-align:right;color:#636E72;font-size:0.75rem;text-transform:uppercase;">Total</th><th style="padding:8px;text-align:center;color:#636E72;font-size:0.75rem;text-transform:uppercase;">Status</th></tr></thead><tbody>' +
        orders.map(function(o) {
          var d = new Date(o.created_at).toLocaleDateString('en-IE',{day:'2-digit',month:'short',year:'numeric'});
          var st = (o.status||'processing');
          var stMap = { processing:'Paid', delivered:'Delivered', pending:'Pending' };
          var stCls = st === 'delivered' ? 'delivered' : (st === 'pending' ? 'pending' : 'processing');
          return '<tr style="border-bottom:1px solid #f1f5f9;">' +
            '<td style="padding:8px;font-weight:600;">' + (o.order_number||'') + '</td>' +
            '<td style="padding:8px;color:#636E72;">' + d + '</td>' +
            '<td style="padding:8px;text-align:right;font-weight:600;">' + FMT(o.total) + '</td>' +
            '<td style="padding:8px;text-align:center;"><span class="status ' + stCls + '">' + (stMap[st]||st) + '</span></td>' +
            '</tr>';
        }).join('') +
        '</tbody></table></div>';
    } catch(e) {
      content.innerHTML = '<div style="text-align:center;padding:20px;color:#ef4444;">Error loading orders.</div>';
    }
  }

  function showAddSubAccount() {
    var modal = document.getElementById('addSubAccountModal');
    if (modal) { modal.style.display = 'block'; document.body.style.overflow = 'hidden'; }
    // Reset form
    var n = document.getElementById('newSubName'); if(n) n.value = '';
    var e = document.getElementById('newSubEmail'); if(e) e.value = '';
    var p = document.getElementById('newSubPhone'); if(p) p.value = '';
    var r = document.getElementById('newSubRole'); if(r) r.value = 'buyer';
    updateSubRolePerms();
  }

  function closeAddSubModal() {
    var modal = document.getElementById('addSubAccountModal');
    if (modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }
  }

  function updateSubRolePerms() {
    var role = document.getElementById('newSubRole')?.value || 'buyer';
    var el = document.getElementById('subRolePerms');
    if (!el) return;
    var perms = {
      buyer: '\u2713 View Dashboard &nbsp; \u2713 Browse Products &nbsp; \u2713 Place Orders<br>\u2717 View Financial &nbsp; \u2717 Manage Sub-Accounts &nbsp; \u2717 Edit Company',
      viewer: '\u2713 View Dashboard &nbsp; \u2713 Browse Products &nbsp; \u2717 Place Orders<br>\u2717 View Financial &nbsp; \u2717 Manage Sub-Accounts &nbsp; \u2717 Edit Company',
      admin: '\u2713 View Dashboard &nbsp; \u2713 Browse Products &nbsp; \u2713 Place Orders<br>\u2713 View Financial &nbsp; \u2713 Manage Sub-Accounts &nbsp; \u2713 Edit Company'
    };
    el.innerHTML = perms[role] || perms.buyer;
  }

  function addSubAccount() {
    var name = document.getElementById('newSubName')?.value?.trim();
    var email = document.getElementById('newSubEmail')?.value?.trim();
    var phone = document.getElementById('newSubPhone')?.value?.trim() || '';
    var role = document.getElementById('newSubRole')?.value || 'buyer';
    if (!name) { toast('Please enter a name'); return; }
    if (!email) { toast('Please enter an email'); return; }
    var roleLabels = { buyer: 'Buyer', viewer: 'Viewer', admin: 'Admin' };
    var companyName = profile?.display_name || profile?.name || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'your company';
    var body = 'New Sub-Account Request\n\nCompany: ' + companyName + '\nMain Account: ' + (profile?.email||'') + '\n\nNew User Name: ' + name + '\nNew User Email: ' + email + (phone ? '\nPhone: ' + phone : '') + '\nRole: ' + (roleLabels[role]||role) + '\n\nPlease create this sub-account and link it to our company.';
    window.open('mailto:b2b@sportsfoodsireland.ie?subject=B2B%20Sub-Account%20Request%20-%20' + encodeURIComponent(name) + '&body=' + encodeURIComponent(body));
    toast('Invitation request sent for ' + name + '!');
    closeAddSubModal();
  }

  function showMktTab(subId) {
    document.querySelectorAll('.mkt-panel').forEach(function(p) { p.style.display = 'none'; p.classList.remove('active'); });
    document.querySelectorAll('.mkt-subtab').forEach(function(t) { t.classList.remove('active'); });
    var panel = document.getElementById('mkt-' + subId);
    if (panel) { panel.style.display = 'block'; panel.classList.add('active'); }
    var btn = document.querySelector('.mkt-subtab[data-mkt="' + subId + '"]');
    if (btn) btn.classList.add('active');
  }

  // ── Support Tabs ──
  function showSupTab(subId) {
    document.querySelectorAll('.sup-panel').forEach(function(p) { p.style.display = 'none'; p.classList.remove('active'); });
    document.querySelectorAll('.sup-subtab').forEach(function(t) { t.classList.remove('active'); });
    var panel = document.getElementById('sup-' + subId);
    if (panel) { panel.style.display = 'block'; panel.classList.add('active'); }
    var btn = document.querySelector('.sup-subtab[data-sup="' + subId + '"]');
    if (btn) btn.classList.add('active');
    if (subId === 'tickets') renderTickets();
  }

  // ── Ticket System ──
  function getTickets() {
    return JSON.parse(localStorage.getItem('sfi_b2b_tickets') || '[]');
  }

  function submitTicket() {
    var type = document.getElementById('supTicketType')?.value || 'commercial';
    var subject = document.getElementById('supTicketSubject')?.value?.trim() || '';
    var message = document.getElementById('supTicketMessage')?.value?.trim() || '';
    if (!subject) { toast('Please enter a subject'); return; }
    if (!message) { toast('Please describe your issue'); return; }

    var tickets = getTickets();
    var ticketId = 'TK-' + String(Date.now()).slice(-6);
    var typeLabels = { commercial: '🏢 Commercial', financial: '💰 Financial', technical: '🔧 Technical' };
    tickets.unshift({
      id: ticketId,
      type: type,
      typeLabel: typeLabels[type] || type,
      subject: subject,
      message: message,
      date: new Date().toISOString(),
      status: 'pending'
    });
    localStorage.setItem('sfi_b2b_tickets', JSON.stringify(tickets));

    // Also send email
    var emailBody = 'Ticket: ' + ticketId + '\nType: ' + (typeLabels[type]||type) + '\nSubject: ' + subject + '\n\n' + message;
    window.open('mailto:b2b@sportsfoodsireland.ie?subject=B2B%20Ticket%20' + encodeURIComponent(ticketId + ' - ' + subject) + '&body=' + encodeURIComponent(emailBody));

    document.getElementById('supTicketSubject').value = '';
    document.getElementById('supTicketMessage').value = '';
    toast('Ticket ' + ticketId + ' submitted!');
    showSupTab('tickets');
  }

  function renderTickets() {
    var list = document.getElementById('supTicketsList');
    if (!list) return;
    var tickets = getTickets();
    if (!tickets.length) {
      list.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;"><div style="font-size:2rem;margin-bottom:8px;">📭</div><p>No tickets yet. Open a ticket to get support from our team.</p></div>';
      return;
    }
    list.innerHTML = '<div class="sup-ticket-row header"><div>#</div><div>Type</div><div>Subject</div><div>Date</div><div>Status</div></div>' +
      tickets.map(function(t) {
        var d = new Date(t.date).toLocaleDateString('en-IE',{day:'2-digit',month:'short',year:'numeric'});
        var stColor = t.status === 'responded' ? '#166534' : (t.status === 'in_review' ? '#1e40af' : '#92400e');
        var stBg = t.status === 'responded' ? '#d1fae5' : (t.status === 'in_review' ? '#dbeafe' : '#fef3c7');
        var stLabel = t.status === 'responded' ? 'Responded' : (t.status === 'in_review' ? 'In Review' : 'Pending');
        return '<div class="sup-ticket-row">' +
          '<div style="font-weight:600;color:#2D6A4F;">' + t.id + '</div>' +
          '<div style="font-size:0.8rem;">' + (t.typeLabel||t.type) + '</div>' +
          '<div style="color:#1e293b;">' + t.subject + '</div>' +
          '<div style="color:#636E72;font-size:0.8rem;">' + d + '</div>' +
          '<div><span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;background:' + stBg + ';color:' + stColor + ';">' + stLabel + '</span></div>' +
          '</div>';
      }).join('');
  }

  async function loadFinancialData() {
    if (financialLoaded) return;
    financialLoaded = true;
    try {
      var stats = await sfi.b2b.getDashboardStats();
      if (stats) {
        var totalSpent = Number(stats.total_spent||0);
        var totalOrders = Number(stats.total_orders||0);
        var yearSpent = Number(stats.month_spent||0);
        var outstanding = Number(stats.outstanding||0);
        var avg = totalOrders > 0 ? totalSpent / totalOrders : 0;
        document.getElementById('finOpenBalance').textContent = FMT(outstanding);
        document.getElementById('finOverdue').textContent = FMT(0);
        document.getElementById('finTotalSpent').textContent = FMT(totalSpent);
        document.getElementById('finTotalOrders').textContent = totalOrders;
        document.getElementById('finYearSpent').textContent = FMT(yearSpent);
        document.getElementById('finAvgOrder').textContent = FMT(avg);
      }
      // Load invoices into financial tab
      loadFinInvoices();
    } catch(e) {}
  }

  async function loadFinInvoices() {
    var list = document.getElementById('finInvoicesList');
    if (!list) return;
    list.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;"><p>Loading invoices...</p></div>';
    try {
      var invoices = await sfi.b2b.getInvoices({ limit: 50 });
      if (!invoices || !invoices.length) {
        var paid = allOrders.slice(0, 50);
        if (!paid.length) { list.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;">📄 No invoices available yet.</div>'; return; }
        window._b2bFinInvoices = paid.map(function(o) {
          return { id: o.id, number: o.order_number, date: o.created_at, total: o.total, balance: 0, status: 'Paid', items: o.item_count, type: 'order', customer_id: o.customer_id || '', customer_email: o.customer_email || '' };
        });
      } else {
        window._b2bFinInvoices = invoices.map(function(inv) {
          return { id: inv.id, number: inv.doc_number||inv.number||'INV-'+inv.id, date: inv.txn_date||inv.created_at, total: inv.total_amount||inv.total, balance: inv.balance||0, status: inv.balance > 0 ? 'Unpaid' : 'Paid', type: 'invoice', customer_id: inv.customer_id || '' };
        });
      }
      renderFinInvoices(window._b2bFinInvoices);
      populateFinSubAccountFilter();
    } catch(e) { list.innerHTML = '<div style="text-align:center;padding:40px;color:#ef4444;">Error loading invoices.</div>'; }
  }

  function renderFinInvoices(data) {
    var list = document.getElementById('finInvoicesList');
    if (!list || !data.length) { if(list) list.innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;">No invoices found.</div>'; return; }
    list.innerHTML = '<table class="b2b-table"><thead><tr><th>Invoice / Order</th><th>Date</th><th>Total</th><th>Balance</th><th>Status</th></tr></thead><tbody>' +
      data.map(function(inv, idx) {
        var d = new Date(inv.date).toLocaleDateString('en-IE',{day:'2-digit',month:'short',year:'numeric'});
        var stClass = inv.balance > 0 ? 'pending' : 'delivered';
        var stLabel = inv.balance > 0 ? 'Unpaid' : 'Paid';
        return '<tr style="cursor:pointer;" onclick="B2B.showFinInvoiceDetail(' + idx + ')">' +
          '<td><strong style="color:#2D6A4F;text-decoration:underline;">' + (inv.number||'') + '</strong></td>' +
          '<td>' + d + '</td>' +
          '<td>' + FMT(inv.total) + '</td>' +
          '<td>' + (inv.balance > 0 ? FMT(inv.balance) : '—') + '</td>' +
          '<td><span class="status ' + stClass + '">' + stLabel + '</span></td>' +
          '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  function filterFinInvoices() {
    var q = (document.getElementById('finInvoiceSearch')?.value||'').toLowerCase().trim();
    var subAcc = document.getElementById('finInvoiceSubAccount')?.value || '';
    var dateFrom = document.getElementById('finInvoiceDateFrom')?.value || '';
    var dateTo = document.getElementById('finInvoiceDateTo')?.value || '';
    var all = window._b2bFinInvoices || [];
    var filtered = all.filter(function(inv) {
      var matchQ = !q || (inv.number||'').toLowerCase().includes(q) || String(inv.total).includes(q);
      var invDate = inv.date ? inv.date.substring(0,10) : '';
      var matchFrom = !dateFrom || invDate >= dateFrom;
      var matchTo = !dateTo || invDate <= dateTo;
      var matchSub = !subAcc || inv.customer_id === subAcc;
      return matchQ && matchFrom && matchTo && matchSub;
    });
    renderFinInvoices(filtered);
    var countEl = document.getElementById('finInvoiceCount');
    if (countEl) {
      if (q || dateFrom || dateTo || subAcc) {
        var total = filtered.reduce(function(s,i) { return s + Number(i.total||0); }, 0);
        countEl.textContent = 'Showing ' + filtered.length + ' invoices \u00b7 \u20ac' + total.toFixed(2) + ' total';
      } else {
        countEl.textContent = '';
      }
    }
  }

  function clearFinInvoiceFilters() {
    document.getElementById('finInvoiceSearch').value = '';
    var subSel = document.getElementById('finInvoiceSubAccount');
    if (subSel) subSel.value = '';
    document.getElementById('finInvoiceDateFrom').value = '';
    document.getElementById('finInvoiceDateTo').value = '';
    document.getElementById('finInvoiceCount').textContent = '';
    renderFinInvoices(window._b2bFinInvoices || []);
  }

  async function populateFinSubAccountFilter() {
    var sel = document.getElementById('finInvoiceSubAccount');
    if (!sel || sel.options.length > 1) return;
    try {
      var subs = await sfi.b2b.getSubAccounts();
      if (!subs || !subs.length) { sel.style.display = 'none'; return; }
      var mainName = profile ? ([profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email) : 'My Account';
      sel.innerHTML = '<option value="">All Accounts</option>';
      sel.innerHTML += '<option value="' + (profile.id||'') + '">\u2b50 ' + mainName + '</option>';
      subs.forEach(function(s) {
        var name = [s.first_name, s.last_name].filter(Boolean).join(' ') || s.email;
        sel.innerHTML += '<option value="' + s.id + '">' + name + '</option>';
      });
    } catch(e) {}
  }

  // ── Invoice Detail Modal ──
  var currentInvoiceIdx = -1;

  function showFinInvoiceDetail(idx) {
    var invoices = window._b2bFinInvoices || [];
    var inv = invoices[idx];
    if (!inv) return;
    currentInvoiceIdx = idx;
    var modal = document.getElementById('b2bInvoiceModal');
    var body = document.getElementById('invModalBody');
    var title = document.getElementById('invModalTitle');
    if (!modal || !body) return;
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    title.textContent = 'Invoice ' + (inv.number||'');

    var d = new Date(inv.date).toLocaleDateString('en-IE',{day:'2-digit',month:'long',year:'numeric'});
    var stClass = inv.balance > 0 ? 'pending' : 'delivered';
    var stLabel = inv.balance > 0 ? 'Unpaid' : 'Paid';

    // Try to load order items if this is from an order
    var itemsHtml = '';
    if (inv.type === 'order' && inv.id) {
      var order = allOrders.find(function(o) { return o.id === inv.id; });
      if (order && order.item_summary) {
        var items = typeof order.item_summary === 'string' ? JSON.parse(order.item_summary) : order.item_summary;
        if (items && items.length) {
          itemsHtml = '<h4 style="margin-top:20px;margin-bottom:10px;color:#1e293b;font-size:0.9rem;">Order Items</h4>' +
            '<table style="width:100%;border-collapse:collapse;font-size:0.85rem;">' +
            '<thead><tr style="background:#f8f9fa;"><th style="padding:8px;text-align:left;">Product</th><th style="padding:8px;text-align:center;">Qty</th><th style="padding:8px;text-align:right;">Unit Price</th><th style="padding:8px;text-align:right;">Total</th></tr></thead><tbody>' +
            items.map(function(i) {
              return '<tr style="border-bottom:1px solid #f1f5f9;">' +
                '<td style="padding:8px;">' + (i.product_name||'') + '</td>' +
                '<td style="padding:8px;text-align:center;">' + (i.quantity||1) + '</td>' +
                '<td style="padding:8px;text-align:right;">' + FMT(i.unit_price||0) + '</td>' +
                '<td style="padding:8px;text-align:right;">' + FMT(i.total||0) + '</td>' +
                '</tr>';
            }).join('') +
            '</tbody></table>';
        }
      }
    }

    body.innerHTML = '<div id="invoicePrintArea">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;">' +
        '<div>' +
          '<div style="font-size:1.2rem;font-weight:700;color:#1B4332;margin-bottom:4px;">Sports Foods Ireland</div>' +
          '<div style="font-size:0.8rem;color:#636E72;line-height:1.6;">Unit 12 Northwest Centre<br>Northwest Business Park, Blanchardstown<br>Dublin D15 YC53, Ireland<br>info@sportsfoodsireland.ie</div>' +
        '</div>' +
        '<div style="text-align:right;">' +
          '<div style="font-size:1.4rem;font-weight:700;color:#1e293b;">INVOICE</div>' +
          '<div style="font-size:0.85rem;color:#636E72;margin-top:4px;">' + (inv.number||'') + '</div>' +
          '<div style="font-size:0.85rem;color:#636E72;">' + d + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;padding:16px;background:#f8f9fa;border-radius:8px;margin-bottom:20px;">' +
        '<div><div style="font-size:0.7rem;text-transform:uppercase;color:#94a3b8;margin-bottom:4px;">Bill To</div><div style="font-weight:600;color:#1e293b;">' + (profile?.display_name || profile?.name || [profile?.first_name,profile?.last_name].filter(Boolean).join(' ') || 'Customer') + '</div><div style="font-size:0.85rem;color:#636E72;">' + (profile?.email||'') + '</div></div>' +
        '<div style="text-align:right;"><div style="font-size:0.7rem;text-transform:uppercase;color:#94a3b8;margin-bottom:4px;">Status</div><span class="status ' + stClass + '" style="font-size:0.85rem;">' + stLabel + '</span></div>' +
      '</div>' +
      itemsHtml +
      '<div style="margin-top:20px;padding:16px;background:#f0fdf4;border-radius:8px;display:flex;justify-content:space-between;align-items:center;">' +
        '<div><div style="font-size:0.75rem;color:#636E72;">Total Amount</div><div style="font-size:1.4rem;font-weight:700;color:#1B4332;">' + FMT(inv.total) + '</div></div>' +
        (inv.balance > 0 ? '<div style="text-align:right;"><div style="font-size:0.75rem;color:#636E72;">Balance Due</div><div style="font-size:1.2rem;font-weight:700;color:#991b1b;">' + FMT(inv.balance) + '</div></div>' : '<div style="font-size:0.85rem;color:#166534;font-weight:600;">✓ Paid in Full</div>') +
      '</div>' +
    '</div>';
  }

  function closeInvoiceModal() {
    var modal = document.getElementById('b2bInvoiceModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  function downloadInvoicePDF() {
    var invoices = window._b2bFinInvoices || [];
    var inv = invoices[currentInvoiceIdx];
    if (!inv) return;
    var area = document.getElementById('invoicePrintArea');
    if (!area) return;

    // Use html2canvas to capture and download as image
    toast('Generating invoice...');
    var script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    script.onload = function() {
      html2canvas(area, { scale: 2, backgroundColor: '#ffffff', useCORS: true }).then(function(canvas) {
        var link = document.createElement('a');
        link.download = 'Invoice-' + (inv.number||'unknown') + '.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        toast('Invoice downloaded!');
      }).catch(function() { toast('Error generating invoice'); });
    };
    document.head.appendChild(script);
  }

  // Close invoice modal on Escape
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { closeInvoiceModal(); closeProductModal(); closeAddSubModal(); }
  });


  // ── Dashboard ──
  async function loadDashboard() {
    try {
      // Load dashboard stats via dedicated RPC
      const stats = await sfi.b2b.getDashboardStats();
      if (stats) {
        document.getElementById('statSpendYear').textContent = FMT(Number(stats.month_spent||0));
        document.getElementById('statOrdersYear').textContent = stats.month_orders || 0;
        document.getElementById('statPending').textContent = FMT(Number(stats.outstanding||0));
        document.getElementById('statInProgress').textContent = stats.pending_orders || 0;
      }

      // Load orders for table
      const orders = await sfi.b2b.getOrders();
      allOrders = orders || [];

      // Recent orders (last 5)
      renderOrderRows('recentOrdersBody', allOrders.slice(0, 5));
      // All orders
      renderOrderRows('allOrdersBody', allOrders);
      // Reorder banner - preload products for image resolution
      if (allOrders.length > 0) {
        if (!portalShopAll.length) {
          try { var prods = await sfi.b2b.getProducts({ perPage: 500 }); if (prods && prods.length) portalShopAll = prods; } catch(e) {}
        }
        setupReorderBanner(allOrders[0]);
      }
    } catch(e) { console.error('Dashboard load error:', e); }
  }

  function renderOrderRows(bodyId, orders) {
    const body = document.getElementById(bodyId);
    if (!body) return;
    if (!orders.length) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#636E72;padding:24px;">No orders found</td></tr>';
      return;
    }
    body.innerHTML = orders.map(o => {
      const d = new Date(o.created_at);
      const dateStr = d.toLocaleDateString('en-IE',{day:'2-digit',month:'short',year:'numeric'});
      // Map WooCommerce statuses to B2B-friendly labels
      const rawStatus = (o.status||'').toLowerCase();
      const statusMap = {
        'processing': { label: 'Paid', cls: 'delivered' },
        'delivered': { label: 'Delivered', cls: 'delivered' },
        'completed': { label: 'Delivered', cls: 'delivered' },
        'pending': { label: 'Pending', cls: 'pending' },
        'on-hold': { label: 'On Hold', cls: 'pending' },
        'cancelled': { label: 'Cancelled', cls: 'pending' },
        'refunded': { label: 'Refunded', cls: 'pending' }
      };
      const st = statusMap[rawStatus] || { label: rawStatus || 'Paid', cls: o.financial_status === 'paid' ? 'delivered' : 'processing' };
      return `<tr style="cursor:pointer" ${o.id ? 'onclick="B2B.showOrderDetail(\''+o.id+'\')"' : ''}>
        <td><strong>#${o.order_number||''}</strong></td>
        <td>${dateStr}</td>
        <td>${o.item_count||'—'}</td>
        <td>${FMT(o.total)}</td>
        <td><span class="status ${st.cls}"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor;"></span> ${st.label}</span></td>
        <td>${o.id ? '<button class="btn-sm" onclick="event.stopPropagation();B2B.openReorderForOrder(\''+o.id+'\')">Reorder</button>' : ''}</td>
      </tr>`;
    }).join('');
  }

  function setupReorderBanner(order) {
    const banner = document.getElementById('reorderBanner');
    if (!banner) return;
    const items = order.item_summary || [];
    if (!items.length) return;

    document.getElementById('rbRef').textContent = '#' + (order.order_number||'');
    document.getElementById('rbDate').textContent = new Date(order.created_at).toLocaleDateString('en-IE',{day:'2-digit',month:'short'});
    document.getElementById('rbItems').textContent = order.item_count || items.length;
    document.getElementById('rbTotal').textContent = FMT(order.total);

    const thumbs = document.getElementById('rbThumbs');
    const show = items.map(i => Object.assign({}, i, { _resolvedImg: resolveItemImage(i) })).filter(i => i._resolvedImg).slice(0, 4);
    thumbs.innerHTML = show.map(i => {
      const src = imgSrc(i._resolvedImg);
      return `<img src="${src}" alt="" onerror="this.src='../img/placeholder.webp'">`;
    }).join('');
    if (items.length > 4) thumbs.innerHTML += `<span style="display:flex;align-items:center;font-size:0.8rem;color:#636E72;font-weight:600;">+${items.length-4}</span>`;
    banner.style.display = 'flex';
  }


  // ── Filter Orders ──
  var subAccountOrdersCache = {};

  async function filterOrders() {
    const q = (document.getElementById('orderSearch').value||'').toLowerCase();
    const statusFilter = document.getElementById('orderFilter').value;
    const dateFrom = document.getElementById('orderDateFrom').value;
    const dateTo = document.getElementById('orderDateTo').value;
    const subAccount = document.getElementById('orderSubAccount')?.value || '';

    // Get the right order set based on sub-account selection
    var ordersToFilter = allOrders;
    if (subAccount) {
      if (!subAccountOrdersCache[subAccount]) {
        // Fetch orders for this specific sub-account via RPC
        try {
          var SUPABASE_URL = 'https://styynhgzrkyoioqjssuw.supabase.co';
          var SUPABASE_KEY = 'sb_publishable_tiF58FbBT9UsaEMAaJlqWA_k3dLHElH';
          var res = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_b2b_sub_account_orders', {
            method: 'POST',
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_sub_customer_id: subAccount, p_limit: 500 })
          });
          subAccountOrdersCache[subAccount] = await res.json();
        } catch(e) { subAccountOrdersCache[subAccount] = []; }
      }
      ordersToFilter = subAccountOrdersCache[subAccount];
    }

    const filtered = ordersToFilter.filter(o => {
      const matchQ = !q || String(o.order_number||'').toLowerCase().includes(q) || String(o.total).includes(q);
      const matchS = !statusFilter || (o.status||'').toLowerCase() === statusFilter;
      const oDate = o.created_at ? o.created_at.substring(0,10) : '';
      const matchFrom = !dateFrom || oDate >= dateFrom;
      const matchTo = !dateTo || oDate <= dateTo;
      return matchQ && matchS && matchFrom && matchTo;
    });
    renderOrderRows('allOrdersBody', filtered);
    const periodSpent = filtered.reduce((s,o) => s + Number(o.total||0), 0);
    const countEl = document.getElementById('orderResultCount');
    if (countEl) {
      if (dateFrom || dateTo || q || statusFilter || subAccount) {
        countEl.textContent = 'Showing ' + filtered.length + ' orders \u00b7 \u20ac' + periodSpent.toFixed(2) + ' total';
      } else {
        countEl.textContent = '';
      }
    }
  }

  function clearOrderFilters() {
    document.getElementById('orderSearch').value = '';
    document.getElementById('orderFilter').value = '';
    document.getElementById('orderDateFrom').value = '';
    document.getElementById('orderDateTo').value = '';
    var subSel = document.getElementById('orderSubAccount');
    if (subSel) subSel.value = '';
    document.getElementById('orderResultCount').textContent = '';
    renderOrderRows('allOrdersBody', allOrders);
  }

  // ── Top Products (auto-resolves customer from profile) ──
  async function loadTopProducts() {
    try {
      const products = await sfi.b2b.getTopProducts({ limit: 8 });
      const grid = document.getElementById('topProductsGrid');
      if (!products || !products.length) {
        grid.innerHTML = '<div class="empty-b2b"><div class="empty-icon">📦</div><p>No purchase history yet. Start ordering to see your top products here!</p></div>';
        return;
      }
      // Store products for cart reference
      window._b2bTopProducts = products;
      grid.innerHTML = products.map((p, idx) => {
        const img = p.image_url ? (p.image_url.startsWith('http') ? p.image_url : '../' + p.image_url) : '../img/placeholder.webp';
        return `<div class="top-prod-card">
          <button class="btn-add" title="Add to cart" onclick="event.stopPropagation();B2B.addTopProduct(${idx});">+</button>
          <img src="${img}" alt="${p.product_name||''}" onerror="this.src='../img/placeholder.webp'">
          <div class="prod-brand">${p.brand_name||''}</div>
          <div class="prod-name">${p.product_name||'Product'}</div>
          <div class="prod-price">${p.b2b_price != null ? FMT(Number(p.b2b_price)) : 'N/A'}</div>
          <div class="prod-orders">${p.order_count} order${p.order_count!==1?'s':''}</div>
        </div>`;
      }).join('');
    } catch(e) {
      console.error('Top products error:', e);
      document.getElementById('topProductsGrid').innerHTML = '<div class="empty-b2b"><div class="empty-icon">⚠️</div><p>Could not load products.</p></div>';
    }
  }

  // ── Invoices (auto-resolves customer from profile) ──
  async function loadInvoices() {
    try {
      const invoices = await sfi.b2b.getInvoices({ limit: 20 });
      const list = document.getElementById('invoicesList');
      if (!invoices || !invoices.length) {
        // Fallback: show paid orders as invoice references
        const paid = allOrders.slice(0, 15);
        if (!paid.length) { list.innerHTML = '<div class="empty-b2b"><div class="empty-icon">📄</div><p>No invoices available yet.</p></div>'; return; }
        list.innerHTML = paid.map(o => {
          const d = new Date(o.created_at).toLocaleDateString('en-IE',{day:'2-digit',month:'short',year:'numeric'});
          return `<div class="invoice-item" style="cursor:pointer" onclick="B2B.showInvoiceFromOrder('${o.id}')">
            <div class="invoice-info">
              <div class="invoice-icon">📄</div>
              <div><strong style="color:#1e293b;font-size:0.9rem;">Order #${o.order_number||''}</strong><br><span style="color:#636E72;font-size:0.8rem;">${d} — ${o.item_count||0} items</span></div>
            </div>
            <div style="text-align:right;"><strong style="color:#1e293b;">${FMT(o.total)}</strong><br><span style="color:#636E72;font-size:0.75rem;">Paid</span></div>
          </div>`;
        }).join('');
        return;
      }
      window._b2bInvoices = invoices;
      list.innerHTML = invoices.map((inv, idx) => {
        const d = new Date(inv.txn_date||inv.created_at).toLocaleDateString('en-IE',{day:'2-digit',month:'short',year:'numeric'});
        return `<div class="invoice-item" style="cursor:pointer" onclick="B2B.showInvoiceDetail(${idx})">
          <div class="invoice-info">
            <div class="invoice-icon">📄</div>
            <div><strong style="color:#1e293b;font-size:0.9rem;">${inv.doc_number||inv.number||'INV-'+inv.id}</strong><br><span style="color:#636E72;font-size:0.8rem;">${d}</span></div>
          </div>
          <div style="text-align:right;"><strong style="color:#1e293b;">${FMT(inv.total_amount||inv.total)}</strong><br><span style="color:#636E72;font-size:0.75rem;">${inv.balance > 0 ? 'Due: '+FMT(inv.balance) : 'Paid'}</span></div>
        </div>`;
      }).join('');
    } catch(e) { console.error('Invoices error:', e); }
  }


  // ── Company Info ──
  function loadCompanyInfo() {
    if (!profile) return;
    const p = profile;
    document.getElementById('infoCompany').textContent = p.display_name || p.name || '—';
    document.getElementById('infoVat').textContent = p.vat_number || p.tax_id || p.b2b_vat_number || '—';
    document.getElementById('infoBizType').textContent = p.business_type || p.b2b_business_type || 'Retail';
    document.getElementById('infoWebsite').textContent = p.website || p.b2b_website || '—';
    document.getElementById('infoContact').textContent = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.name || '—';
    document.getElementById('infoEmail').textContent = p.email || '—';
    document.getElementById('infoPhone').textContent = p.phone || '—';
    document.getElementById('infoSince').textContent = p.created_at ? new Date(p.created_at).toLocaleDateString('en-IE',{month:'short',year:'numeric'}) : '—';

    const total = allOrders.reduce((s,o) => s + Number(o.total||0), 0);
    document.getElementById('infoTotalOrders').textContent = allOrders.length;
    document.getElementById('infoLifetime').textContent = FMT(total);

    const addr = [p.address_1, p.address_2, p.city, p.state, p.postcode, p.country].filter(Boolean);
    if (addr.length) document.getElementById('defaultAddress').innerHTML = addr.join('<br>');
  }

  // ── Tier System ──
  const TIERS = [
    { name: 'Bronze', emoji: '🥉', min: 0, max: 9999, discount: 5 },
    { name: 'Silver', emoji: '🥈', min: 10000, max: 49999, discount: 10 },
    { name: 'Gold',   emoji: '🥇', min: 50000, max: 99999, discount: 15 },
    { name: 'Platinum', emoji: '💎', min: 100000, max: Infinity, discount: 20 }
  ];

  function getTier(spend) {
    for (let i = TIERS.length - 1; i >= 0; i--) {
      if (spend >= TIERS[i].min) return TIERS[i];
    }
    return TIERS[0];
  }

  function loadTierProgress(totalSpent) {
    const tier = getTier(totalSpent);
    const tierIdx = TIERS.indexOf(tier);
    document.getElementById('tierName').textContent = tier.emoji + ' ' + tier.name + ' (' + tier.discount + '% off)';

    const nextEl = document.getElementById('tierNextInfo');
    if (tierIdx < TIERS.length - 1) {
      const next = TIERS[tierIdx + 1];
      const remaining = next.min - totalSpent;
      nextEl.innerHTML = `${FMT(remaining)} more to reach <strong>${next.emoji} ${next.name}</strong>`;
    } else {
      nextEl.innerHTML = '🎉 You\'ve reached the highest tier!';
    }

    const maxForBar = TIERS[TIERS.length - 1].min;
    const pct = Math.min(100, (totalSpent / maxForBar) * 100);
    document.getElementById('tierBarFill').style.width = pct + '%';

    const markers = document.getElementById('tierMarkers');
    markers.innerHTML = TIERS.map((t, i) => {
      const reached = totalSpent >= t.min;
      const current = i === tierIdx;
      return `<div class="tier-marker ${reached ? 'reached' : ''} ${current ? 'current' : ''}">
        <div class="dot"></div>
        <div>${t.emoji} ${t.name}</div>
        <div style="font-weight:600;">${t.min > 0 ? FMT(t.min) : '€0'}</div>
      </div>`;
    }).join('');
  }


  // ── Reorder ──
  function openReorder() {
    if (!allOrders.length) return;
    openReorderForOrder(allOrders[0].id);
  }

  async function openReorderForOrder(orderId) {
    const order = allOrders.find(o => String(o.id) === String(orderId));
    if (!order) return;

    // Ensure product cache is loaded for image resolution
    if (!portalShopAll.length && !inlineShopProducts.length) {
      try {
        var prods = await sfi.b2b.getProducts({ perPage: 500 });
        if (prods && prods.length) portalShopAll = prods;
      } catch(e) {}
    }

    // Use item_summary from the RPC (already includes product details)
    let items = order.item_summary || [];
    if (!items.length) {
      // Fallback: fetch from order_items table
      try {
        const fetched = await sfi.b2b.getOrderItems(orderId);
        items = (fetched || []).map(i => ({
          product_name: i.product_name || i.products?.name || 'Product',
          quantity: i.quantity,
          unit_price: i.unit_price,
          total: i.total,
          product_id: i.product_id,
          image_url: i.products?.image_url || i.product_image_url || i.product_image
        }));
      } catch(e) { console.error(e); }
    }
    if (!items.length) { toast('No items found in this order'); return; }

    reorderItems = items.map(i => {
      var imgUrl = resolveItemImage(i);
      return {
        id: i.product_id || '',
        legacy_id: i.legacy_id || 0,
        name: i.product_name || 'Product',
        price: Number(i.unit_price || i.total || 0),
        quantity: Number(i.quantity || 1),
        image: imgUrl
      };
    });

    const container = document.getElementById('reorderItems');
    container.innerHTML = reorderItems.map((item, idx) => {
      const img = item.image ? (item.image.startsWith('http') ? item.image : '../' + item.image) : '../img/placeholder.webp';
      return `<div class="reorder-item">
        <img src="${img}" alt="" onerror="this.src='../img/placeholder.webp'">
        <div class="ri-info">
          <div class="ri-name">${item.name}</div>
          <div class="ri-price">${FMT(Number(item.price))} each</div>
        </div>
        <div class="qty-controls">
          <button onclick="B2B.updateQty(${idx},-1)">−</button>
          <span id="reorderQty${idx}">${item.quantity}</span>
          <button onclick="B2B.updateQty(${idx},1)">+</button>
        </div>
      </div>`;
    }).join('');
    updateReorderTotal();
    document.getElementById('reorderOverlay').classList.add('open');
  }

  function updateQty(idx, delta) {
    if (!reorderItems[idx]) return;
    reorderItems[idx].quantity = Math.max(0, reorderItems[idx].quantity + delta);
    const el = document.getElementById('reorderQty' + idx);
    if (el) el.textContent = reorderItems[idx].quantity;
    updateReorderTotal();
  }

  function updateReorderTotal() {
    const total = reorderItems.reduce((s, i) => s + (i.price * i.quantity), 0);
    document.getElementById('reorderTotal').textContent = FMT(total);
  }

  function closeReorder() {
    document.getElementById('reorderOverlay').classList.remove('open');
  }

  function addReorderToCart() {
    const active = reorderItems.filter(i => i.quantity > 0);
    if (!active.length) { toast('No items selected'); return; }
    if (typeof addToCart !== 'function') { toast('Cart not ready — please refresh'); return; }
    let added = 0;
    active.forEach(i => {
      if (i.legacy_id) {
        addToCart(i.legacy_id, i.quantity, { nome: i.name, preco: Number(i.price), imagem: i.image });
        added++;
      }
    });
    if (added) {
      toast(`${added} item${added>1?'s':''} added to cart!`);
      if (typeof toggleCartModal === 'function') toggleCartModal();
    }
    closeReorder();
  }

  // ── Toast ──
  function toast(msg) {
    const el = document.getElementById('b2bToast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3000);
  }

  // ── Start ──
  document.addEventListener('DOMContentLoaded', function() {
    const check = setInterval(() => {
      if (typeof sfi !== 'undefined' && sfi.b2b) {
        clearInterval(check);
        init();
      }
    }, 100);
    setTimeout(() => { clearInterval(check); if (!profile) showDenied(); }, 8000);
  });

  // ── Add Top Product to Cart ──
  function addTopProduct(idx) {
    const p = (window._b2bTopProducts || [])[idx];
    if (!p || !p.legacy_id) { toast('Product not available'); return; }
    b2bAddWithVariants(p.legacy_id, p.product_name, Number(p.b2b_price)||0, p.image_url||'');
  }

  // ── Order Detail Modal ──
  async function showOrderDetail(orderId) {
    // Ensure product cache for image resolution
    if (!portalShopAll.length && !inlineShopProducts.length) {
      try {
        var prods = await sfi.b2b.getProducts({ perPage: 500 });
        if (prods && prods.length) portalShopAll = prods;
      } catch(e) {}
    }
    const order = allOrders.find(o => o.id === orderId);
    if (!order) return;

    const d = new Date(order.created_at);
    const dateStr = d.toLocaleDateString('en-IE',{day:'2-digit',month:'short',year:'numeric'});
    const rawStatus = (order.status||'').toLowerCase();
    const statusMap = {
      'processing': { label: 'Paid', cls: 'delivered' },
      'delivered': { label: 'Delivered', cls: 'delivered' },
      'completed': { label: 'Delivered', cls: 'delivered' },
      'pending': { label: 'Pending', cls: 'pending' },
      'on-hold': { label: 'On Hold', cls: 'pending' },
      'cancelled': { label: 'Cancelled', cls: 'pending' },
      'refunded': { label: 'Refunded', cls: 'pending' }
    };
    const st = statusMap[rawStatus] || { label: rawStatus || 'Paid', cls: 'delivered' };

    document.getElementById('odNumber').textContent = '#' + (order.order_number||'');
    document.getElementById('odDate').textContent = dateStr;
    document.getElementById('odItems').textContent = order.item_count || 0;
    document.getElementById('odStatus').innerHTML = `<span class="status ${st.cls}" style="font-size:.78rem"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor;margin-right:4px;"></span>${st.label}</span>`;
    document.getElementById('odTotal').textContent = FMT(order.total);

    const items = order.item_summary || [];
    const list = document.getElementById('odItemsList');
    if (!items.length) {
      list.innerHTML = '<p style="text-align:center;color:#636E72;padding:24px;">No item details available</p>';
    } else {
      list.innerHTML = items.map(i => {
        const img = imgSrc(resolveItemImage(i));
        return `<div class="od-item">
          <img class="od-item-img" src="${img}" alt="" onerror="this.src='../img/placeholder.webp'">
          <div class="od-item-info">
            <div class="od-item-name" title="${i.product_name||''}">${i.product_name||'Product'}</div>
            <div class="od-item-meta">${i.quantity||1} × ${FMT(i.unit_price)}</div>
          </div>
          <div class="od-item-total">${FMT(i.total)}</div>
        </div>`;
      }).join('');
    }

    window._odCurrentOrder = order;
    const overlay = document.getElementById('orderDetailOverlay');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeOrderDetail() {
    document.getElementById('orderDetailOverlay').classList.remove('active');
    document.body.style.overflow = '';
    const footer = document.querySelector('#orderDetailOverlay .od-footer');
    if (footer) footer.style.display = '';
  }

  function showInvoiceDetail(idx) {
    const inv = (window._b2bInvoices || [])[idx];
    if (!inv) return;
    const lines = (inv.raw_data && inv.raw_data.Line) || [];
    const sales = lines.filter(l => l.DetailType === 'SalesItemLineDetail');
    const rows = sales.map(l => {
      const d = l.SalesItemLineDetail || {};
      return { name: (d.ItemRef&&d.ItemRef.name)||l.Description||'Item', qty: d.Qty||1, price: d.UnitPrice||(l.Amount/(d.Qty||1))||0, total: l.Amount||0 };
    });
    renderInvoiceDoc({
      number: inv.doc_number || 'INV-' + inv.id,
      date: inv.txn_date || inv.created_at,
      dueDate: inv.due_date,
      customerName: inv.customer_name || profile.display_name || profile.name || '',
      customerEmail: inv.customer_email || profile.email || '',
      items: rows,
      subtotal: Number(inv.total_amount||inv.total) - Number(inv.tax_amount||0),
      tax: Number(inv.tax_amount||0),
      total: Number(inv.total_amount||inv.total),
      balance: Number(inv.balance||0),
      isPaid: !inv.balance || Number(inv.balance) === 0,
      note: inv.private_note || ''
    });
  }

  function showInvoiceFromOrder(orderId) {
    const order = allOrders.find(o => o.id === orderId);
    if (!order) return;
    const items = (order.item_summary || []).map(i => ({
      name: i.product_name || 'Product', qty: i.quantity||1,
      price: Number(i.unit_price)||0, total: Number(i.total)||0
    }));
    const total = Number(order.total)||0;
    const subtotal = +total.toFixed(2);
    const tax = +(total - subtotal).toFixed(2);
    renderInvoiceDoc({
      number: 'SFI-' + (order.order_number||order.id),
      date: order.created_at,
      dueDate: null,
      customerName: profile.display_name || profile.name || [profile.first_name,profile.last_name].filter(Boolean).join(' ') || '',
      customerEmail: profile.email || '',
      items: items,
      subtotal: subtotal,
      tax: tax,
      total: total,
      balance: 0,
      isPaid: true,
      note: ''
    });
  }

  function renderInvoiceDoc(d) {
    const fmtD = (v) => v ? new Date(v).toLocaleDateString('en-IE',{day:'2-digit',month:'short',year:'numeric'}) : '—';
    const custAddr = [profile.address_1, profile.city, profile.state, profile.postcode, profile.country].filter(Boolean).join(', ');
    const vatNum = profile.vat_number || profile.tax_id || profile.b2b_vat_number || '';
    let html = `
      <div class="inv-header">
        <div>
          <img src="../img/logo.png" class="inv-logo" alt="SFI" onerror="this.outerHTML='<strong style=\\'font-size:1.3rem;color:#2D6A4F\\'>Sports Foods Ireland</strong>'">
          <p style="margin:6px 0 0;font-size:.78rem;color:#636E72;line-height:1.5">
            Sports Foods Ireland Ltd<br>
            Unit 2, Ballymount Road<br>
            Dublin 12, Ireland<br>
            VAT: IE 123456789
          </p>
        </div>
        <div class="inv-title">
          <h2>Invoice</h2>
          <div class="inv-num">${d.number}</div>
        </div>
      </div>

      <div class="inv-parties">
        <div class="inv-party">
          <h4>Bill To</h4>
          <p><strong>${d.customerName}</strong></p>
          ${custAddr ? '<p>'+custAddr+'</p>' : ''}
          ${d.customerEmail ? '<p>'+d.customerEmail+'</p>' : ''}
          ${vatNum ? '<p>VAT: '+vatNum+'</p>' : ''}
        </div>
        <div class="inv-party" style="text-align:right">
          <h4>Invoice Details</h4>
          <p><strong>Date:</strong> ${fmtD(d.date)}</p>
          ${d.dueDate ? '<p><strong>Due:</strong> '+fmtD(d.dueDate)+'</p>' : ''}
          <p><strong>Status:</strong> <span style="color:${d.isPaid?'#2D6A4F':'#E17055'};font-weight:700">${d.isPaid?'PAID':'OUTSTANDING'}</span></p>
        </div>
      </div>`;

    if (d.items.length) {
      html += `<table class="inv-table"><thead><tr><th style="width:50%">Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead><tbody>`;
      d.items.forEach(i => {
        html += `<tr><td>${i.name}</td><td>${i.qty}</td><td style="text-align:right">${FMT(i.price)}</td><td style="text-align:right">${FMT(i.total)}</td></tr>`;
      });
      html += `</tbody></table>`;
    }

    html += `<div class="inv-totals">
      <div class="inv-totals-row"><span>Subtotal</span><span>${FMT(d.subtotal)}</span></div>
      <div class="inv-totals-row"><span>VAT (23%)</span><span>${FMT(d.tax)}</span></div>
      <div class="inv-totals-row total"><span>Total</span><span>${FMT(d.total)}</span></div>
      ${!d.isPaid ? '<div class="inv-totals-row due"><span>Balance Due</span><span>'+FMT(d.balance)+'</span></div>' : ''}
    </div>`;

    if (d.note) html += `<p style="font-size:.82rem;color:#636E72;margin-bottom:12px"><strong>Note:</strong> ${d.note}</p>`;
    html += `<div class="inv-footer">Thank you for your business &mdash; Sports Foods Ireland Ltd</div>`;

    document.getElementById('invoiceDoc').innerHTML = html;
    document.getElementById('invoiceOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeInvoice() {
    document.getElementById('invoiceOverlay').classList.remove('active');
    document.body.style.overflow = '';
  }

  function reorderFromDetail() {
    const order = window._odCurrentOrder;
    if (!order) return;
    const items = order.item_summary || [];
    if (!items.length) { toast('No items to reorder'); return; }
    if (typeof addToCart !== 'function') { toast('Cart not ready'); return; }
    let added = 0;
    items.forEach(i => {
      if (i.legacy_id) {
        addToCart(i.legacy_id, i.quantity||1, { nome: i.product_name, preco: Number(i.unit_price), imagem: i.image_url||'' });
        added++;
      }
    });
    closeOrderDetail();
    toast(added + ' item' + (added!==1?'s':'') + ' added to cart');
  }

  // Close on overlay click & ESC
  document.addEventListener('click', function(e) {
    if (e.target && e.target.id === 'orderDetailOverlay') closeOrderDetail();
    if (e.target && e.target.id === 'invoiceOverlay') closeInvoice();
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      if (document.getElementById('invoiceOverlay').classList.contains('active')) closeInvoice();
      else if (document.getElementById('orderDetailOverlay').classList.contains('active')) closeOrderDetail();
    }
  });

  // ── Support Request ──
  function sendSupport() {
    const subject = document.getElementById('supportSubject')?.value || '';
    const message = document.getElementById('supportMessage')?.value?.trim() || '';
    if (!message) { toast('Please enter a message'); return; }
    const user = sfi.auth.getUser();
    const email = user?.email || '';
    const mailto = 'b2b@sportsfoodsireland.ie';
    const body = encodeURIComponent('Subject: ' + subject + '\n\nFrom: ' + email + '\n\n' + message);
    window.open('mailto:' + mailto + '?subject=B2B%20Support%3A%20' + encodeURIComponent(subject) + '&body=' + body);
    toast('Opening your email client...');
    document.getElementById('supportMessage').value = '';
  }

  // ── Notices toggle ──
  function showNotices() {
    const panel = document.getElementById('noticesPanel');
    if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  }

  // ── Portal Shop (full shop in tab) ──
  let portalShopProducts = [];
  let portalShopAll = [];
  let portalShopLoaded = false;

  async function loadPortalShop() {
    const grid = document.getElementById('portalShopGrid');
    if (!grid) return;
    grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:40px;color:#94a3b8;">Loading products...</p>';
    try {
      const cat = document.getElementById('portalShopCat')?.value || '';
      const [freqData, products] = await Promise.all([
        Object.keys(frequentMap).length ? Promise.resolve(null) : sfi.b2b.getFrequentProducts(),
        sfi.b2b.getProducts({ category: cat || undefined, perPage: 500 })
      ]);
      if (freqData) {
        freqData.forEach(function(f) { frequentMap[f.legacy_id] = { qty: f.total_qty, orders: f.order_count }; });
      }
      portalShopAll = products;
      portalShopLoaded = true;
      // Build brand filter
      var brands = new Set();
      products.forEach(function(p) { var b = p.brands?.name || p.marca; if (b) brands.add(b); });
      var brandSel = document.getElementById('portalShopBrand');
      if (brandSel) {
        var curVal = brandSel.value;
        brandSel.innerHTML = '<option value="">All Brands</option>';
        Array.from(brands).sort().forEach(function(b) { brandSel.innerHTML += '<option value="' + b + '">' + b + '</option>'; });
        brandSel.value = curVal;
      }
      // Build subcategory filter
      updateSubcatFilter(products);
      filterPortalShop();
    } catch(e) {
      grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:40px;color:#ef4444;">Error loading products.</p>';
    }
  }

  function updateSubcatFilter(products) {
    var subcatSel = document.getElementById('portalShopSubcat');
    if (!subcatSel) return;
    var catFilter = document.getElementById('portalShopCat')?.value || '';
    var brandFilter = document.getElementById('portalShopBrand')?.value || '';
    var subcats = new Set();
    (products || portalShopAll).forEach(function(p) {
      var sc = p.subcategories?.name || p.subcategoria || '';
      var cat = p.categories?.name || p.categoria || '';
      var brand = p.brands?.name || p.marca || '';
      if (!sc) return;
      if (catFilter && cat !== catFilter) return;
      if (brandFilter && brand !== brandFilter) return;
      subcats.add(sc);
    });
    var curVal = subcatSel.value;
    subcatSel.innerHTML = '<option value="">All Subcategories</option>';
    Array.from(subcats).sort().forEach(function(sc) {
      subcatSel.innerHTML += '<option value="' + sc + '">' + sc + '</option>';
    });
    subcatSel.value = subcats.has(curVal) ? curVal : '';
  }

  function filterPortalShop() {
    var brand = document.getElementById('portalShopBrand')?.value || '';
    var sort = document.getElementById('portalShopSort')?.value || 'freq';
    var q = (document.getElementById('portalShopSearch')?.value || '').toLowerCase().trim();
    // Update subcategory options based on current category + brand
    updateSubcatFilter();
    // Read subcat AFTER update (may have been reset if no longer valid)
    var subcat = document.getElementById('portalShopSubcat')?.value || '';
    var filtered = portalShopAll.filter(function(p) {
      var matchB = !brand || (p.brands?.name || p.marca || '') === brand;
      var matchSC = !subcat || (p.subcategories?.name || p.subcategoria || '') === subcat;
      var matchQ = !q || (p.nome||'').toLowerCase().includes(q) || (p.marca||'').toLowerCase().includes(q) || (p.subcategoria||'').toLowerCase().includes(q);
      return matchB && matchSC && matchQ;
    });
    filtered.sort(function(a, b) {
      if (sort === 'freq') {
        var fA = frequentMap[a.id] ? frequentMap[a.id].orders : 0;
        var fB = frequentMap[b.id] ? frequentMap[b.id].orders : 0;
        if (fB !== fA) return fB - fA;
        return (a.nome||'').localeCompare(b.nome||'');
      }
      if (sort === 'name_asc') return (a.nome||'').localeCompare(b.nome||'');
      if (sort === 'name_desc') return (b.nome||'').localeCompare(a.nome||'');
      if (sort === 'price_asc') return (a.b2b_price||0) - (b.b2b_price||0);
      if (sort === 'price_desc') return (b.b2b_price||0) - (a.b2b_price||0);
      return 0;
    });
    portalShopProducts = filtered;
    renderPortalShop(filtered);
  }

  function searchPortalShop() {
    clearTimeout(window._portalShopDebounce);
    window._portalShopDebounce = setTimeout(filterPortalShop, 300);
  }

  function renderPortalShop(products) {
    var grid = document.getElementById('portalShopGrid');
    var countEl = document.getElementById('portalShopCount');
    if (!grid) return;
    if (countEl) countEl.textContent = products.length + ' products';
    if (!products.length) {
      grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:40px;color:#94a3b8;">No products found.</p>';
      return;
    }
    var currency = sfi.currency === 'GBP' ? '£' : '€';
    var favs = JSON.parse(localStorage.getItem('sfi_b2b_favourites') || '[]');
    grid.innerHTML = products.map(function(p) {
      var rawImg = p.imagem || p.image_url || '';
      var img = rawImg ? (rawImg.startsWith('http') ? rawImg : '../' + rawImg) : '../img/placeholder.webp';
      var price = p.b2b_price != null ? currency + Number(p.b2b_price).toFixed(2) : 'N/A';
      var brand = p.brands?.name || p.marca || '';
      var inStock = p.em_stock !== false;
      var freq = frequentMap[p.id];
      var freqBadge = freq ? '<div style="font-size:0.6rem;color:#2D6A4F;font-weight:700;background:#f0fdf4;padding:2px 8px;border-radius:4px;display:inline-block;margin-bottom:4px;">🔁 Ordered ' + freq.orders + 'x</div>' : '';
      var isFav = favs.some(function(f) { return f.id === p.id; });
      var stockBadge = inStock ? '' : '<div style="font-size:0.6rem;font-weight:700;padding:2px 8px;border-radius:4px;display:inline-block;margin-bottom:4px;background:#fffbeb;color:#92400e;">📋 Backorder Available</div>';
      return '<div onclick="B2B.showProductModal(' + (p.id||0) + ')" style="background:#fff;border:1px solid ' + (freq ? '#86efac' : '#e2e8f0') + ';border-radius:10px;overflow:hidden;position:relative;cursor:pointer;transition:box-shadow 0.2s;display:flex;flex-direction:column;" onmouseover="this.style.boxShadow=\'0 4px 16px rgba(0,0,0,0.08)\'" onmouseout="this.style.boxShadow=\'none\'">' +
        '<button onclick="event.stopPropagation();toggleFav(' + p.id + ',\'' + (p.nome||'').replace(/'/g,"\\'") + '\',' + (p.b2b_price||0) + ',\'' + (rawImg||'').replace(/'/g,"\\'") + '\',\'' + (brand||'').replace(/'/g,"\\'") + '\',this)" style="position:absolute;top:8px;right:8px;background:#fff;border:1px solid #e2e8f0;border-radius:50%;width:28px;height:28px;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:' + (isFav ? '#f59e0b' : '#d1d5db') + ';z-index:2;">' + (isFav ? '★' : '☆') + '</button>' +
        '<img src="' + img + '" alt="" style="width:100%;height:130px;object-fit:contain;background:#f8f9fa;padding:8px;" onerror="this.src=\'../img/placeholder.webp\'">' +
        '<div style="padding:12px;flex:1;display:flex;flex-direction:column;">' +
        freqBadge + stockBadge +
        '<div style="font-size:0.6rem;text-transform:uppercase;color:#94a3b8;">' + brand + '</div>' +
        '<div style="font-weight:600;font-size:0.8rem;color:#1e293b;margin-bottom:6px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">' + (p.nome||'') + '</div>' +
        '<div style="margin-top:auto;">' +
        '<div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px;">' +
          '<span style="font-weight:700;color:#1B4332;font-size:0.95rem;">' + price + '</span>' +
        '</div>' +
        (inStock
          ? '<button onclick="event.stopPropagation();B2B.addShopToCart(' + (p.id||0) + ',\'' + (p.nome||'').replace(/'/g,"\\'") + '\',' + (p.b2b_price||0) + ',\'' + (rawImg||'').replace(/'/g,"\\'") + '\')" style="width:100%;padding:8px;background:#2D6A4F;color:#fff;border:none;border-radius:6px;font-weight:600;font-size:0.8rem;cursor:pointer;">Add to Cart</button>'
          : '<button onclick="event.stopPropagation();B2B.addShopToCart(' + (p.id||0) + ',\'' + (p.nome||'').replace(/'/g,"\\'") + '\',' + (p.b2b_price||0) + ',\'' + (rawImg||'').replace(/'/g,"\\'") + '\')" style="width:100%;padding:8px;background:#92400e;color:#fff;border:none;border-radius:6px;font-weight:600;font-size:0.8rem;cursor:pointer;">📋 Backorder</button>'
        ) +
        '</div></div></div>';
    }).join('');
  }

  function addShopToCart(id, name, price, image) { b2bAddWithVariants(id, name, price, image); }

  // ── Product Detail Modal ──
  async function showProductModal(legacyId) {
    var modal = document.getElementById('b2bProductModal');
    var body = document.getElementById('b2bProductModalBody');
    if (!modal || !body) return;
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    body.innerHTML = '<div style="text-align:center;padding:60px;color:#94a3b8;"><p>Loading product details...</p></div>';

    try {
      var cachedList = portalShopAll.length ? portalShopAll : inlineShopProducts;
      var p = cachedList.find(function(x) { return x.id === legacyId; });
      var fullData = null;
      try {
        await sfi.auth.ensureAuth();
        var SUPABASE_URL = 'https://styynhgzrkyoioqjssuw.supabase.co';
        var SUPABASE_KEY = 'sb_publishable_tiF58FbBT9UsaEMAaJlqWA_k3dLHElH';
        var res = await fetch(SUPABASE_URL + '/rest/v1/products?legacy_id=eq.' + legacyId + '&select=*,brands(name),categories(name),subcategories(name)', {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
        });
        var arr = await res.json();
        if (arr && arr[0]) fullData = arr[0];
      } catch(e) {}

      // Also fetch variants
      var vGroups = await b2bFetchVariants(legacyId);
      var hasVariants = vGroups && vGroups.length > 0 && vGroups.some(function(g) { return g.options && g.options.length > 0; });

      var name = (p && p.nome) || (fullData && fullData.name) || 'Product';
      var rawImg = (p && p.imagem) || (fullData && fullData.image_url) || '';
      var img = rawImg;
      if (img && !img.startsWith('http') && !img.startsWith('../')) img = '../' + img;
      if (!img) img = '../img/placeholder.webp';
      var currency = sfi.currency === 'GBP' ? '\u00a3' : '\u20ac';
      var b2bPrice = (p && p.b2b_price != null) ? p.b2b_price : (fullData && fullData.wholesale_price_eur);
      var retailPrice = (p && p.retail_price) || (fullData && fullData.price_eur);
      var brand = (p && p.brands && p.brands.name) || (p && p.marca) || (fullData && fullData.brands && fullData.brands.name) || '';
      var inStock = p ? p.em_stock !== false : (fullData ? fullData.in_stock !== false : true);
      var freq = frequentMap[legacyId];
      var desc = (fullData && fullData.description) || '';
      var shortDesc = (fullData && fullData.short_description) || '';
      var prodSku = (fullData && fullData.sku) || '';
      var cat = (fullData && fullData.categories && fullData.categories.name) || (p && p.categoria) || '';
      var subcat = (fullData && fullData.subcategories && fullData.subcategories.name) || '';
      var stockQty = fullData && fullData.stock_quantity;
            var b2bStr = b2bPrice != null ? currency + Number(b2bPrice).toFixed(2) : 'N/A';
      var dietaryTags = fullData && fullData.dietary_tags ? fullData.dietary_tags : [];

      // Build variant buttons HTML
      var variantsHtml = '';
      if (hasVariants) {
        variantsHtml = vGroups.map(function(g) {
          var optBtns = g.options.map(function(o) {
            var oos = o.stock != null && o.stock <= 0;
            return '<button type="button" class="pm-var-btn' + (oos ? ' pm-var-backorder' : '') + '" ' +
              'data-vid="' + o.id + '" data-lbl="' + (o.label||'') + '" data-pr="' + (o.price||'') + '" data-b2bpr="' + (o.wholesale_price||'') + '" data-sku="' + (o.sku||'') + '" data-stock="' + (o.stock!=null?o.stock:'') + '" data-imgurl="' + (o.image_url||'') + '" ' +
              'style="padding:8px 16px;border:2px solid #e0e0e0;border-radius:8px;background:#fff;cursor:pointer;font-size:0.88rem;color:#333;transition:all .15s;user-select:none;' + (oos?'border-color:#fbbf24;color:#92400e;background:#fffbeb;':'') + '">' +
              (o.label||'') + (oos ? ' (Backorder)' : '') + '</button>';
          }).join('');
          return '<div style="margin-bottom:12px;">' +
            '<div style="font-size:0.8rem;font-weight:600;color:#636E72;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">' + g.type + '</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:8px;">' + optBtns + '</div>' +
            '</div>';
        }).join('');
      }

      // SKU row in info box
      var firstVarSku = '';
      if (hasVariants && vGroups[0].options[0]) firstVarSku = vGroups[0].options[0].sku || '';
      var skuToShow = firstVarSku || prodSku || '';

      body.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;align-items:start;">' +
        '<div>' +
          '<img id="pmMainImg" src="' + img + '" alt="" style="width:100%;border-radius:10px;background:#f8f9fa;padding:16px;object-fit:contain;max-height:400px;transition:opacity 0.25s;" onerror="this.src=\'../img/placeholder.webp\'">' +
        '</div>' +
        '<div>' +
          '<div style="font-size:0.75rem;text-transform:uppercase;color:#94a3b8;letter-spacing:0.5px;margin-bottom:4px;">' + brand + '</div>' +
          '<h2 style="font-size:1.3rem;color:#1e293b;margin-bottom:12px;line-height:1.3;">' + name + '</h2>' +
          (shortDesc ? '<p style="font-size:0.9rem;color:#636E72;margin-bottom:16px;line-height:1.5;">' + shortDesc + '</p>' : '') +
          (freq ? '<div style="display:inline-block;background:#f0fdf4;color:#166534;font-size:0.8rem;font-weight:600;padding:4px 12px;border-radius:6px;margin-bottom:12px;">\ud83d\udd01 You ordered this ' + freq.orders + ' times (' + freq.qty + ' units)</div><br>' : '') +
          '<div style="display:flex;align-items:baseline;gap:12px;margin-bottom:6px;">' +
            '<span id="pmPrice" style="font-size:1.6rem;font-weight:700;color:#1B4332;">' + b2bStr + '</span>' +
          '</div>' +

          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.85rem;color:#636E72;margin-bottom:16px;padding:12px;background:#f8f9fa;border-radius:8px;">' +
            '<div id="pmSkuRow"' + (skuToShow ? '' : ' style="display:none"') + '><strong>SKU:</strong> <span id="pmSkuVal" style="font-family:\'JetBrains Mono\',monospace;">' + skuToShow + '</span></div>' +
            (cat ? '<div><strong>Category:</strong> ' + cat + '</div>' : '') +
            (subcat ? '<div><strong>Subcategory:</strong> ' + subcat + '</div>' : '') +
            '<div id="pmStockRow"><strong>Stock:</strong> ' + (inStock ? '<span style="color:#166534;">\u2713 In Stock</span>' + (stockQty != null ? ' (' + stockQty + ')' : '') : '<span style="color:#d97706;">\ud83d\udccb Backorder Available</span>') + '</div>' +
            (dietaryTags.length ? '<div style="grid-column:1/-1"><strong>Dietary:</strong> ' + dietaryTags.join(', ') + '</div>' : '') +
          '</div>' +

          variantsHtml +

          '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">' +
            '<span style="font-size:0.85rem;font-weight:600;color:#636E72;text-transform:uppercase;">Quantity</span>' +
            '<div style="display:flex;align-items:center;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">' +
              '<button type="button" id="pmQtyDec" style="width:36px;height:36px;border:none;background:#f8f9fa;cursor:pointer;font-size:1.1rem;color:#333;">-</button>' +
              '<input type="number" id="pmQtyInput" value="1" min="1" max="999" style="width:50px;height:36px;border:none;border-left:1px solid #e0e0e0;border-right:1px solid #e0e0e0;text-align:center;font-size:0.95rem;font-weight:600;-moz-appearance:textfield;" />' +
              '<button type="button" id="pmQtyInc" style="width:36px;height:36px;border:none;background:#f8f9fa;cursor:pointer;font-size:1.1rem;color:#333;">+</button>' +
            '</div>' +
          '</div>' +

          '<div style="display:flex;gap:10px;margin-bottom:20px;">' +
            '<button id="pmAddBtn" style="flex:1;padding:14px;background:' + (inStock ? '#2D6A4F' : '#92400e') + ';color:#fff;border:none;border-radius:8px;font-weight:700;font-size:0.95rem;cursor:pointer;">' + (inStock ? '\ud83d\uded2 Add to Cart' : '\ud83d\udccb Backorder') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      (desc ? '<div style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:20px;"><h3 style="font-size:1rem;color:#1e293b;margin-bottom:12px;">Product Description</h3><div style="font-size:0.9rem;color:#495057;line-height:1.7;" class="b2b-prod-desc">' + desc + '</div></div>' : '');

      // ── Wire up interactivity ──
      var _pmSelVar = null;
      var _pmBasePrice = b2bPrice;

      // Variant buttons
      if (hasVariants) {
        var allBtns = body.querySelectorAll('.pm-var-btn');
        // Auto-select first variant
        if (allBtns.length > 0) {
          allBtns[0].style.borderColor = '#2D6A4F';
          allBtns[0].style.background = '#e8f5ee';
          allBtns[0].style.fontWeight = '600';
          var fb2b = parseFloat(allBtns[0].dataset.b2bpr); var fpr = parseFloat(allBtns[0].dataset.pr);
          _pmSelVar = { id: allBtns[0].dataset.vid, label: allBtns[0].dataset.lbl, price: (fb2b > 0 ? fb2b : fpr) || b2bPrice, sku: allBtns[0].dataset.sku || '' };
          if (fb2b > 0 || fpr) { var fpe = document.getElementById('pmPrice'); if (fpe) fpe.textContent = currency + Number(fb2b > 0 ? fb2b : fpr).toFixed(2); }
          var firstImgUrl = allBtns[0].dataset.imgurl;
          if (firstImgUrl) { var pmImg0 = document.getElementById('pmMainImg'); if (pmImg0) { pmImg0.src = firstImgUrl.startsWith('http') ? firstImgUrl : '../' + firstImgUrl; } }
          // Update SKU for auto-selected first variant
          var skuR = document.getElementById('pmSkuRow');
          var skuV = document.getElementById('pmSkuVal');
          if (skuR && skuV && _pmSelVar.sku) { skuV.textContent = _pmSelVar.sku; skuR.style.display = ''; }
        }
        allBtns.forEach(function(btn) {
          btn.addEventListener('click', function() {
            allBtns.forEach(function(b) {
              var isBO = b.classList.contains('pm-var-backorder');
              b.style.borderColor = isBO ? '#fbbf24' : '#e0e0e0';
              b.style.background = isBO ? '#fffbeb' : '#fff';
              b.style.fontWeight = 'normal';
            });
            this.style.borderColor = '#2D6A4F';
            this.style.background = '#e8f5ee';
            this.style.fontWeight = '600';
            var vp = parseFloat(this.dataset.pr);
            var vb2b = parseFloat(this.dataset.b2bpr);
            var displayP = (vb2b > 0) ? vb2b : vp;
            _pmSelVar = { id: this.dataset.vid, label: this.dataset.lbl, price: displayP || b2bPrice, sku: this.dataset.sku || '' };
            // Update price
            var pe = document.getElementById('pmPrice');
            if (pe && displayP) pe.textContent = currency + Number(displayP).toFixed(2);
            // Update SKU
            var skuRow = document.getElementById('pmSkuRow');
            var skuVal = document.getElementById('pmSkuVal');
            if (skuRow && skuVal) {
              if (_pmSelVar.sku) { skuVal.textContent = _pmSelVar.sku; skuRow.style.display = ''; }
              else if (prodSku) { skuVal.textContent = prodSku; skuRow.style.display = ''; }
              else { skuRow.style.display = 'none'; }
            }
            // Update image
            var viUrl = this.dataset.imgurl;
            if (viUrl) {
              var pmImg = document.getElementById('pmMainImg');
              if (pmImg) { var imgSrc = viUrl.startsWith('http') ? viUrl : '../' + viUrl; pmImg.style.opacity='0.5'; pmImg.onload=function(){pmImg.style.opacity='1';}; pmImg.src = imgSrc; }
            }
            // Update stock display
            var vs = this.dataset.stock;
            var sr = document.getElementById('pmStockRow');
            if (sr && vs !== '') {
              var vsi = parseInt(vs);
              sr.innerHTML = '<strong>Stock:</strong> ' + (vsi > 0 ? '<span style="color:#166534;">\u2713 In Stock (' + vsi + ')</span>' : '<span style="color:#d97706;">\ud83d\udccb Backorder</span>');
            }
          });
        });
      }

      // Quantity buttons
      var qtyInput = document.getElementById('pmQtyInput');
      var qtyDec = document.getElementById('pmQtyDec');
      var qtyInc = document.getElementById('pmQtyInc');
      if (qtyDec) qtyDec.addEventListener('click', function() { var v = parseInt(qtyInput.value)||1; if(v>1) qtyInput.value = v-1; });
      if (qtyInc) qtyInc.addEventListener('click', function() { var v = parseInt(qtyInput.value)||1; qtyInput.value = v+1; });

      // Add to Cart button
      var addBtn = document.getElementById('pmAddBtn');
      if (addBtn) {
        addBtn.addEventListener('click', function() {
          var qty = parseInt(qtyInput.value) || 1;
          if (_pmSelVar) {
            var finalPrice = Number(_pmSelVar.price) || Number(b2bPrice);
            if (typeof addToCart === 'function') {
              addToCart(legacyId, qty, { nome: name + ' \u2014 ' + _pmSelVar.label, preco: finalPrice, imagem: rawImg, variant: _pmSelVar.label, variantId: _pmSelVar.id });
              toast('Added ' + qty + 'x to cart');
            }
          } else {
            var finalP = Number(b2bPrice);
            if (typeof addToCart === 'function') {
              addToCart(legacyId, qty, { nome: name, preco: finalP, imagem: rawImg });
              toast('Added ' + qty + 'x to cart');
            }
          }
          closeProductModal();
        });
      }

    } catch(e) {
      body.innerHTML = '<p style="text-align:center;padding:40px;color:#ef4444;">Error loading product details.</p>';
    }
  }


  function closeProductModal() {
    var modal = document.getElementById('b2bProductModal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  // Close on Escape key

  // Toggle favourite (global for onclick in rendered HTML)
  window.toggleFav = function(id, name, price, image, brand, btn) {
    var favs = JSON.parse(localStorage.getItem('sfi_b2b_favourites') || '[]');
    var idx = favs.findIndex(function(f) { return f.id === id; });
    if (idx >= 0) {
      favs.splice(idx, 1);
      if (btn) { btn.textContent = '☆'; btn.style.color = '#d1d5db'; }
    } else {
      favs.push({ id: id, name: name, price: price, image: image, brand: brand });
      if (btn) { btn.textContent = '★'; btn.style.color = '#f59e0b'; }
    }
    localStorage.setItem('sfi_b2b_favourites', JSON.stringify(favs));
  };

  // ── Inline Shop ──
  let inlineShopProducts = [];
  let inlineShopLoaded = false;
  let frequentMap = {};
  let recommendedLoaded = false;

  // ── Recommended ──
  function toggleRecommended() {
    const panel = document.getElementById('recommendedPanel');
    if (!panel) return;
    const show = panel.style.display === 'none';
    panel.style.display = show ? 'block' : 'none';
    if (show && !recommendedLoaded) loadRecommended();
  }

  async function loadRecommended() {
    const grid = document.getElementById('recommendedGrid');
    if (!grid) return;
    grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:40px;color:#94a3b8;">Loading recommendations...</p>';
    try {
      const recs = await sfi.b2b.getRecommendedProducts();
      recommendedLoaded = true;
      if (!recs || !recs.length) {
        grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:40px;color:#94a3b8;">No recommendations available yet. Order more to get personalised suggestions!</p>';
        return;
      }
      var currency = sfi.currency === 'GBP' ? '£' : '€';
      var sectionTitles = {
        1: '🆕 New products in your top category',
        2: '⏰ Products you used to buy — time to restock?',
        3: '📦 Other categories — haven\'t ordered in a while',
        4: '✨ Discover more from brands you know'
      };
      var lastPriority = 0;
      var html = '';
      recs.forEach(function(p) {
        if (p.sort_priority !== lastPriority) {
          lastPriority = p.sort_priority;
          var title = sectionTitles[p.sort_priority] || '';
          if (title) html += '<div style="grid-column:1/-1;margin-top:' + (html ? '20px' : '0') + ';margin-bottom:4px;"><h4 style="font-size:14px;color:#1B4332;font-weight:700;">' + title + '</h4></div>';
        }
        var rawImg = p.image_url || '';
        var img = rawImg ? (rawImg.startsWith('http') ? rawImg : '../' + rawImg) : '../img/placeholder.webp';
        var priceStr = p.price ? currency + Number(p.price).toFixed(2) : '';
        var isLapsed = p.sort_priority === 2 || p.sort_priority === 3;
        var badgeColor = isLapsed ? '#fef3c7' : (p.sort_priority === 1 ? '#dbeafe' : '#f0fdf4');
        var badgeText = isLapsed ? '#92400e' : (p.sort_priority === 1 ? '#1e40af' : '#166534');
        var borderColor = isLapsed ? '#fde68a' : (p.sort_priority === 1 ? '#93c5fd' : '#e2e8f0');
        html += '<div onclick="B2B.showProductModal(' + (p.legacy_id||0) + ')" style="background:#fff;border:1px solid ' + borderColor + ';border-radius:10px;overflow:hidden;cursor:pointer;transition:box-shadow 0.2s;" onmouseover="this.style.boxShadow=\'0 4px 16px rgba(0,0,0,0.08)\'" onmouseout="this.style.boxShadow=\'none\'">' +
          '<img src="' + img + '" alt="" style="width:100%;height:130px;object-fit:contain;background:#f8f9fa;padding:8px;" onerror="this.src=\'../img/placeholder.webp\'">' +
          '<div style="padding:12px;">' +
          '<div style="font-size:0.6rem;font-weight:700;padding:2px 8px;border-radius:4px;display:inline-block;margin-bottom:4px;background:' + badgeColor + ';color:' + badgeText + ';">' + (p.reason||'') + '</div>' +
          '<div style="font-size:0.65rem;text-transform:uppercase;color:#94a3b8;">' + (p.brand_name||'') + '</div>' +
          '<div style="font-weight:600;font-size:0.8rem;color:#1e293b;margin-bottom:6px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">' + (p.product_name||'') + '</div>';
        var wsP = p.wholesale_price != null ? Number(p.wholesale_price) : Number(p.price);
        var rtP = p.price;
        var hasWsDisc = wsP != null && rtP != null && wsP < rtP;
        html += '<div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px;">' +
          '<span style="font-weight:700;color:#1B4332;font-size:0.95rem;">' + (wsP != null ? currency + Number(wsP).toFixed(2) : '') + '</span>' +
        '</div>' +
          '<button onclick="event.stopPropagation();B2B.addRecToCart(' + (p.legacy_id||0) + ',\'' + (p.product_name||'').replace(/'/g,"\\'") + '\',' + (wsP||0) + ',\'' + (rawImg||'').replace(/'/g,"\\'") + '\')" style="width:100%;padding:8px;background:#2D6A4F;color:#fff;border:none;border-radius:6px;font-weight:600;font-size:0.8rem;cursor:pointer;">Add to Cart</button>' +
          '</div></div>';
      });
      grid.innerHTML = html;
    } catch(e) {
      grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:40px;color:#ef4444;">Error loading recommendations.</p>';
    }
  }

  function addRecToCart(id, name, price, image) { b2bAddWithVariants(id, name, price, image); }

  function toggleInlineShop() {
    const panel = document.getElementById('inlineShopPanel');
    const orders = document.getElementById('recentOrdersSection');
    if (!panel) return;
    const show = panel.style.display === 'none';
    panel.style.display = show ? 'block' : 'none';
    if (orders) orders.style.display = show ? 'none' : 'block';
    if (show && !inlineShopLoaded) loadInlineShop();
  }

  async function loadInlineShop() {
    const grid = document.getElementById('inlineShopGrid');
    if (!grid) return;
    grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:40px;color:#94a3b8;">Loading products...</p>';
    try {
      // Load frequency data + products in parallel
      const cat = document.getElementById('inlineShopCat')?.value || '';
      const [freqData, products] = await Promise.all([
        Object.keys(frequentMap).length ? Promise.resolve(null) : sfi.b2b.getFrequentProducts(),
        sfi.b2b.getProducts({ category: cat || undefined, perPage: 500 })
      ]);

      // Build frequency map (once)
      if (freqData) {
        freqData.forEach(function(f) {
          frequentMap[f.legacy_id] = { qty: f.total_qty, orders: f.order_count };
        });
      }

      // Sort: most ordered first, then by name
      products.sort(function(a, b) {
        var freqA = frequentMap[a.id] ? frequentMap[a.id].orders : 0;
        var freqB = frequentMap[b.id] ? frequentMap[b.id].orders : 0;
        if (freqB !== freqA) return freqB - freqA;
        return (a.nome || '').localeCompare(b.nome || '');
      });

      inlineShopProducts = products;
      inlineShopLoaded = true;
      renderInlineShop(products);
    } catch(e) {
      grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:40px;color:#ef4444;">Error loading products.</p>';
    }
  }

  function searchInlineShop() {
    const q = (document.getElementById('inlineShopSearch')?.value || '').toLowerCase().trim();
    if (!q) { renderInlineShop(inlineShopProducts); return; }
    const filtered = inlineShopProducts.filter(function(p) {
      return (p.nome||'').toLowerCase().includes(q) || (p.marca||'').toLowerCase().includes(q);
    });
    // Keep frequency sort within search results
    filtered.sort(function(a, b) {
      var freqA = frequentMap[a.id] ? frequentMap[a.id].orders : 0;
      var freqB = frequentMap[b.id] ? frequentMap[b.id].orders : 0;
      if (freqB !== freqA) return freqB - freqA;
      return (a.nome || '').localeCompare(b.nome || '');
    });
    renderInlineShop(filtered);
  }

  function renderInlineShop(products) {
    const grid = document.getElementById('inlineShopGrid');
    if (!grid) return;
    if (!products.length) {
      grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:40px;color:#94a3b8;">No products found.</p>';
      return;
    }
    var currency = sfi.currency === 'GBP' ? '£' : '€';
    grid.innerHTML = products.map(function(p) {
      var rawImg = p.imagem || p.image_url || '';
      var img = rawImg ? (rawImg.startsWith('http') ? rawImg : '../' + rawImg) : '../img/placeholder.webp';
      var price = p.b2b_price != null ? currency + Number(p.b2b_price).toFixed(2) : 'N/A';
      var brand = p.brands?.name || p.marca || '';
      var inStock = p.em_stock !== false;
      var freq = frequentMap[p.id];
      var freqBadge = freq ? '<div style="font-size:0.65rem;color:#2D6A4F;font-weight:700;background:#f0fdf4;padding:2px 8px;border-radius:4px;display:inline-block;margin-bottom:4px;">🔁 Ordered ' + freq.orders + 'x</div>' : '';
      return '<div onclick="B2B.showProductModal(' + (p.id||0) + ')" style="background:#fff;border:1px solid ' + (freq ? '#86efac' : '#e2e8f0') + ';border-radius:10px;overflow:hidden;cursor:pointer;transition:box-shadow 0.2s;display:flex;flex-direction:column;" onmouseover="this.style.boxShadow=\'0 4px 16px rgba(0,0,0,0.08)\'" onmouseout="this.style.boxShadow=\'none\'">' +
        '<img src="' + img + '" alt="" style="width:100%;height:130px;object-fit:contain;background:#f8f9fa;padding:8px;" onerror="this.src=\'../img/placeholder.webp\'">' +
        '<div style="padding:12px;flex:1;display:flex;flex-direction:column;">' +
        freqBadge +
        '<div style="font-size:0.65rem;text-transform:uppercase;color:#94a3b8;">' + brand + '</div>' +
        '<div style="font-weight:600;font-size:0.8rem;color:#1e293b;margin-bottom:6px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">' + (p.nome||'') + '</div>' +
        '<div style="margin-top:auto;">' +
        '<div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px;">' +
          '<span style="font-weight:700;color:#1B4332;font-size:0.95rem;">' + price + '</span>' +
        '</div>' +
        (inStock
          ? '<button onclick="event.stopPropagation();B2B.addInlineToCart(' + (p.id||0) + ',\'' + (p.nome||'').replace(/'/g,"\\'") + '\',' + (p.b2b_price||0) + ',\'' + (rawImg||'').replace(/'/g,"\\'") + '\')" style="width:100%;padding:8px;background:#2D6A4F;color:#fff;border:none;border-radius:6px;font-weight:600;font-size:0.8rem;cursor:pointer;">Add to Cart</button>'
          : '<button onclick="event.stopPropagation();B2B.addInlineToCart(' + (p.id||0) + ',\'' + (p.nome||'').replace(/'/g,"\\'") + '\',' + (p.b2b_price||0) + ',\'' + (rawImg||'').replace(/'/g,"\\'") + '\')" style="width:100%;padding:8px;background:#92400e;color:#fff;border:none;border-radius:6px;font-weight:600;font-size:0.8rem;cursor:pointer;">📋 Backorder</button>'
        ) +
        '</div></div></div>';
    }).join('');
  }

  function addInlineToCart(id, name, price, image) { b2bAddWithVariants(id, name, price, image); }

  // ── Favourites ──
  function toggleFavourites() {
    const panel = document.getElementById('favouritesPanel');
    if (!panel) return;
    const show = panel.style.display === 'none';
    panel.style.display = show ? 'block' : 'none';
    if (show) renderFavourites();
  }

  function renderFavourites() {
    const grid = document.getElementById('favouritesGrid');
    if (!grid) return;
    const favs = JSON.parse(localStorage.getItem('sfi_b2b_favourites') || '[]');
    if (!favs.length) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px 20px;color:#94a3b8;"><div style="font-size:2rem;margin-bottom:8px;">⭐</div><p style="font-size:14px;">No favourite products yet.</p><p style="font-size:13px;margin-top:6px;">Browse the <a href="javascript:void(0)" onclick="B2B.toggleInlineShop()" style="color:#2D6A4F;font-weight:600;cursor:pointer;">B2B Shop</a> and click the ⭐ on any product to save it here.</p></div>';
      return;
    }
    grid.innerHTML = favs.map(function(p) {
      var img = p.image || '../img/placeholder.webp';
      if (img && !img.startsWith('http') && !img.startsWith('../')) img = '../' + img;
      return '<div onclick="B2B.showProductModal(' + p.id + ')" style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;position:relative;cursor:pointer;transition:box-shadow 0.2s;" onmouseover="this.style.boxShadow=\'0 4px 16px rgba(0,0,0,0.08)\'" onmouseout="this.style.boxShadow=\'none\'">' +
        '<button onclick="event.stopPropagation();B2B.removeFavourite(' + p.id + ')" style="position:absolute;top:8px;right:8px;background:#fff;border:1px solid #e2e8f0;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;z-index:2;" title="Remove">✕</button>' +
        '<img src="' + img + '" alt="" style="width:100%;height:140px;object-fit:contain;background:#f8f9fa;padding:8px;" onerror="this.src=\'../img/placeholder.webp\'">' +
        '<div style="padding:12px;">' +
        '<div style="font-size:0.7rem;text-transform:uppercase;color:#94a3b8;">' + (p.brand || '') + '</div>' +
        '<div style="font-weight:600;font-size:0.85rem;color:#1e293b;margin-bottom:6px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">' + (p.name || '') + '</div>' +
        '<div style="font-weight:700;color:#1B4332;">€' + Number(p.price||0).toFixed(2) + '</div>' +
        '<button onclick="event.stopPropagation();B2B.addFavToCart(' + p.id + ')" style="width:100%;margin-top:8px;padding:8px;background:#2D6A4F;color:#fff;border:none;border-radius:6px;font-weight:600;font-size:0.8rem;cursor:pointer;">Add to Cart</button>' +
        '</div></div>';
    }).join('');
  }

  function removeFavourite(id) {
    var favs = JSON.parse(localStorage.getItem('sfi_b2b_favourites') || '[]');
    favs = favs.filter(function(f) { return f.id !== id; });
    localStorage.setItem('sfi_b2b_favourites', JSON.stringify(favs));
    renderFavourites();
    toast('Removed from favourites');
  }

  function addFavToCart(id) {
    var favs = JSON.parse(localStorage.getItem('sfi_b2b_favourites') || '[]');
    var p = favs.find(function(f) { return f.id === id; });
    if (p) { b2bAddWithVariants(p.id, p.name, Number(p.price||0), p.image||''); }
  }


  // B2B VARIANT MODAL
  (function(){if(document.getElementById('b2b-vm-css'))return;var s=document.createElement('style');s.id='b2b-vm-css';s.textContent='.b2b-vm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity .2s}.b2b-vm-overlay.show{opacity:1}.b2b-vm{background:#fff;border-radius:12px;max-width:420px;width:100%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);transform:translateY(20px);transition:transform .25s}.b2b-vm-overlay.show .b2b-vm{transform:translateY(0)}.b2b-vm-header{display:flex;align-items:center;gap:14px;padding:18px 20px;border-bottom:1px solid #e2e8f0;position:relative}.b2b-vm-header img{width:64px;height:64px;object-fit:contain;border-radius:8px;background:#f5f5f5}.b2b-vm-name{font-size:.95rem;font-weight:600;color:#1e293b}.b2b-vm-price{font-size:1rem;font-weight:700;color:#1B4332;margin-top:2px}.b2b-vm-close{position:absolute;top:12px;right:14px;width:32px;height:32px;border:none;background:#f0f0f0;border-radius:50%;font-size:18px;color:#666;cursor:pointer;display:flex;align-items:center;justify-content:center}.b2b-vm-close:hover{background:#e0e0e0}.b2b-vm-body{padding:18px 20px}.b2b-vm-label{font-size:.8rem;font-weight:600;color:#636E72;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px}.b2b-vm-opts{display:flex;flex-wrap:wrap;gap:8px}.b2b-vm-opt{padding:8px 16px;border:2px solid #e0e0e0;border-radius:8px;background:#fff;cursor:pointer;font-size:.88rem;color:#333;transition:all .15s;user-select:none}.b2b-vm-opt:hover{border-color:#2D6A4F;background:#f0faf4}.b2b-vm-opt.selected{border-color:#2D6A4F;background:#e8f5ee;color:#1a5c3a;font-weight:600}.b2b-vm-opt.disabled{opacity:.4;cursor:not-allowed;pointer-events:none}.b2b-vm-footer{padding:14px 20px;border-top:1px solid #e2e8f0;display:flex;gap:10px}.b2b-vm-footer button{flex:1;padding:12px;border:none;border-radius:8px;font-size:.95rem;font-weight:600;cursor:pointer}.b2b-vm-cancel{background:#f0f0f0;color:#666}.b2b-vm-cancel:hover{background:#e4e4e4}.b2b-vm-add{background:#2D6A4F;color:#fff;opacity:.4;pointer-events:none}.b2b-vm-add.active{opacity:1;pointer-events:auto}.b2b-vm-add.active:hover{background:#245a42}.b2b-vm-opt.b2b-vm-backorder{border-color:#fbbf24;color:#92400e;background:#fffbeb}.b2b-vm-opt.b2b-vm-backorder:hover{border-color:#d97706;background:#fef3c7}';document.head.appendChild(s)})();
  var _b2bVarCache = {};
  async function b2bFetchVariants(lid) {
    if (_b2bVarCache[lid] !== undefined) return _b2bVarCache[lid];
    try {
      var U = 'https://styynhgzrkyoioqjssuw.supabase.co', K = 'sb_publishable_tiF58FbBT9UsaEMAaJlqWA_k3dLHElH';
      var r = await fetch(U + '/rest/v1/products?legacy_id=eq.' + lid + '&select=id,product_variants(id,sku,label,price,wholesale_price,cost_price,compare_at_price,stock,is_default,sort_order,image_url,variant_types(name,slug))&product_variants.is_active=eq.true&product_variants.order=sort_order.asc', { headers: { 'apikey': K, 'Authorization': 'Bearer ' + K } });
      var a = await r.json(), pv = (a && a[0] && a[0].product_variants) || [];
      if (!pv.length) { _b2bVarCache[lid] = null; return null; }
      var g = {}; pv.forEach(function(v) { var t = v.variant_types || { name: 'Option', slug: 'option' }; var k = t.slug || 'option'; if (!g[k]) g[k] = { type: t.name, slug: k, options: [] }; g[k].options.push({ id: v.id, label: v.label, price: v.price, wholesale_price: v.wholesale_price, stock: v.stock, is_default: v.is_default, sku: v.sku, image_url: v.image_url || '' }); });
      var res = Object.values(g); _b2bVarCache[lid] = res; return res;
    } catch (e) { _b2bVarCache[lid] = null; return null; }
  }
  function b2bShowVariantModal(pInfo, vGroups, onConfirm) {
    var prev = document.getElementById('b2bVarOvl'); if (prev) prev.remove();
    var cur = sfi.currency === 'GBP' ? '\u00a3' : '\u20ac';
    var img = pInfo.image || '';
    if (img && !img.startsWith('http') && !img.startsWith('../')) img = '../' + img;
    if (!img) img = '../img/placeholder.webp';
    var allL = []; vGroups.forEach(function(g) { g.options.forEach(function(o) { if (o.label) allL.push(o); }); });
    var ws = allL.filter(function(o) { return o.label.indexOf(' / ') > -1; });
    var isCmp = false, cOpts = [];
    if (ws.length >= 2) {
      var pts = ws.map(function(o) { var s = o.label.split(' / '); return Object.assign({}, o, { l1: s[0].trim(), l2: (s[1] || '').trim() }); });
      if (new Set(pts.map(function(p) { return p.l1; })).size >= 2 && new Set(pts.filter(function(p) { return p.l2; }).map(function(p) { return p.l2; })).size >= 2) { isCmp = true; cOpts = pts; }
    }
    var sel = null, ov = document.createElement('div'); ov.id = 'b2bVarOvl'; ov.className = 'b2b-vm-overlay';
    var bH = '';
    if (isCmp) {
      var l1v = Array.from(new Set(cOpts.map(function(o) { return o.l1; }))), t1 = vGroups[0] ? vGroups[0].type : 'Option';
      bH = '<div class="b2b-vm-label">' + t1 + '</div><div class="b2b-vm-opts" id="bvL1">' + l1v.map(function(v) { return '<button class="b2b-vm-opt" type="button" data-level1="' + v + '">' + v + '</button>'; }).join('') + '</div><div id="bvL2W" style="display:none;margin-top:16px"><div class="b2b-vm-label">Size</div><div class="b2b-vm-opts" id="bvL2"></div></div>';
    } else {
      bH = vGroups.map(function(g, gi) { var h = gi > 0 ? ' style="display:none"' : ''; return '<div class="b2b-vm-group" data-gi="' + gi + '"' + h + '><div class="b2b-vm-label">' + g.type + '</div><div class="b2b-vm-opts">' + g.options.map(function(o) { var d = o.stock != null && o.stock <= 0; return '<button class="b2b-vm-opt' + (d ? ' b2b-vm-backorder' : '') + '" type="button" data-vid="' + o.id + '" data-lbl="' + (o.label || '') + '" data-pr="' + (o.price || '') + '" data-b2bpr="' + (o.wholesale_price || '') + '" data-sku="' + (o.sku || '') + '" data-imgurl="' + (o.image_url || '') + '"' + '>' + (o.label || '') + (d ? ' (Backorder)' : '') + '</button>'; }).join('') + '</div></div>'; }).join('');
    }
    var sn = (pInfo.name || 'Product').replace(/</g, '&lt;');
    ov.innerHTML = '<div class="b2b-vm"><button class="b2b-vm-close">&times;</button><div class="b2b-vm-header"><img src="' + img + '" alt=""><div><div class="b2b-vm-name">' + sn + '</div><div class="b2b-vm-price" id="bvPr">' + cur + Number(pInfo.price || 0).toFixed(2) + '</div><div id="bvSku" style="font-size:0.75rem;color:#636E72;font-family:monospace;margin-top:2px;"></div></div></div><div class="b2b-vm-body">' + bH + '</div><div class="b2b-vm-footer"><button class="b2b-vm-cancel" type="button">Cancel</button><button class="b2b-vm-add" type="button">Add to Cart</button></div></div>';
    document.body.appendChild(ov); requestAnimationFrame(function() { ov.classList.add('show'); });
    var ab = ov.querySelector('.b2b-vm-add');
    function cls() { ov.classList.remove('show'); setTimeout(function() { ov.remove(); }, 250); }
    ov.querySelector('.b2b-vm-close').onclick = cls; ov.querySelector('.b2b-vm-cancel').onclick = cls;
    ov.addEventListener('click', function(e) { if (e.target === ov) cls(); });
    ov.addEventListener('click', function(e) {
      var o = e.target.closest('.b2b-vm-opt'); if (!o || o.disabled) return;
      if (isCmp) {
        var lv = o.dataset.level1;
        if (lv !== undefined) {
          ov.querySelectorAll('#bvL1 .b2b-vm-opt').forEach(function(b) { b.classList.remove('selected'); }); o.classList.add('selected'); sel = null; ab.classList.remove('active');
          var mt = cOpts.filter(function(x) { return x.l1 === lv && x.l2; });
          ov.querySelector('#bvL2').innerHTML = mt.map(function(x) { var d = x.stock != null && x.stock <= 0; return '<button class="b2b-vm-opt' + (d ? ' b2b-vm-backorder' : '') + '" type="button" data-vid="' + x.id + '" data-lbl="' + x.label + '" data-pr="' + (x.price || '') + '" data-b2bpr="' + (x.wholesale_price || '') + '" data-sku="' + (x.sku || '') + '" data-imgurl="' + (x.image_url || '') + '"' + '>' + x.l2 + (d ? ' (Backorder)' : '') + '</button>'; }).join('');
          ov.querySelector('#bvL2W').style.display = '';
        } else if (o.dataset.vid) {
          ov.querySelectorAll('#bvL2 .b2b-vm-opt').forEach(function(b) { b.classList.remove('selected'); }); o.classList.add('selected');
          var vb2b = parseFloat(o.dataset.b2bpr); sel = { id: o.dataset.vid, label: o.dataset.lbl, price: (vb2b > 0 ? vb2b : parseFloat(o.dataset.pr)) || pInfo.price }; ab.classList.add('active');
          var pe = ov.querySelector('#bvPr'); if (pe && o.dataset.pr) pe.textContent = cur + parseFloat(o.dataset.pr).toFixed(2);
          var se = ov.querySelector('#bvSku'); if (se) se.textContent = o.dataset.sku ? 'SKU: ' + o.dataset.sku : '';
          var iuc = o.dataset.imgurl; if (iuc) { var mic = ov.querySelector('.b2b-vm-header img'); if (mic) { var nuc = iuc.startsWith('http') ? iuc : '../' + iuc; mic.style.opacity='0.5'; mic.onload=function(){mic.style.opacity='1';}; mic.src = nuc; } }
        }
      } else {
        var gr = o.closest('.b2b-vm-group'); if (!gr) return;
        gr.querySelectorAll('.b2b-vm-opt').forEach(function(b) { b.classList.remove('selected'); }); o.classList.add('selected');
        var gi = parseInt(gr.dataset.gi), ag = ov.querySelectorAll('.b2b-vm-group');
        if (gi + 1 < ag.length) { ag[gi + 1].style.display = ''; for (var i = gi + 1; i < ag.length; i++) { ag[i].querySelectorAll('.b2b-vm-opt').forEach(function(b) { b.classList.remove('selected'); }); if (i > gi + 1) ag[i].style.display = 'none'; } }
        var lg = ag[ag.length - 1], ls = lg.querySelector('.b2b-vm-opt.selected');
        if (ls) { sel = { id: ls.dataset.vid, label: ls.dataset.lbl, price: parseFloat(ls.dataset.pr) || pInfo.price }; ab.classList.add('active'); var svb2b = parseFloat(ls.dataset.b2bpr); if (svb2b > 0) { sel.price = svb2b; var spe = ov.querySelector('#bvPr'); if (spe) spe.textContent = cur + svb2b.toFixed(2); }
          var se2 = ov.querySelector('#bvSku'); if (se2) se2.textContent = ls.dataset.sku ? 'SKU: ' + ls.dataset.sku : '';
          var iu = ls.dataset.imgurl; if (iu) { var mi = ov.querySelector('.b2b-vm-header img'); if (mi) { var nu = iu.startsWith('http') ? iu : '../' + iu; mi.style.opacity='0.5'; mi.onload=function(){mi.style.opacity='1';}; mi.src = nu; } }
        } else { sel = null; ab.classList.remove('active'); }
      }
    });
    ab.addEventListener('click', function() { if (!sel) return; cls(); if (typeof onConfirm === 'function') onConfirm(sel); });
  }
  async function b2bAddWithVariants(id, name, price, image) {
    price = Number(price);  // B2B wholesale prices already ex-VAT
    var v = await b2bFetchVariants(id);
    if (v && v.length > 0 && v.some(function(g) { return g.options && g.options.length > 0; })) {
      b2bShowVariantModal({ name: name, price: price, image: image }, v, function(s) {
        if (typeof addToCart === 'function') { addToCart(id, 1, { nome: name + ' \u2014 ' + s.label, preco: Number(s.price) || price, imagem: image, variant: s.label, variantId: s.id }); toast('Added to cart'); }
      });
    } else {
      if (typeof addToCart === 'function') { addToCart(id, 1, { nome: name, preco: price, imagem: image }); toast('Added to cart'); }
    }
  }


  return {
    showTab, filterOrders, clearOrderFilters, openReorder, openReorderForOrder,
    updateQty, closeReorder, addReorderToCart, addTopProduct, toast,
    showOrderDetail, closeOrderDetail, reorderFromDetail,
    showInvoiceDetail, showInvoiceFromOrder, closeInvoice,
    sendSupport, showNotices, toggleFavourites, removeFavourite, addFavToCart,
    toggleInlineShop, loadInlineShop, searchInlineShop, addInlineToCart,
    toggleRecommended, addRecToCart,
    loadPortalShop, filterPortalShop, searchPortalShop, updateSubcatFilter, addShopToCart,
    showProductModal, closeProductModal, b2bAddWithVariants,
    showFinTab, filterFinInvoices, clearFinInvoiceFilters, showFinInvoiceDetail, closeInvoiceModal, downloadInvoicePDF,
    showMktTab,
    showSupTab, submitTicket,
    showAddSubAccount, addSubAccount, closeAddSubModal, updateSubRolePerms,
    toggleSubDetail, showSubPermissions, showSubOrders
  };
})();
