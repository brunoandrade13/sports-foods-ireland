/**
 * SFI E-Commerce - Supabase Client
 * Replaces direct dados.json loading with Supabase API calls
 * 
 * Usage:
 *   import { sfi } from './sfi-api.js';
 *   const products = await sfi.products.list({ category: 'Nutrition' });
 *   const product = await sfi.products.get(42);
 *   await sfi.cart.checkout(items, customerEmail);
 */

// ============================================================
// CONFIGURATION (replace with your Supabase project values)
// ============================================================
const SUPABASE_URL = 'https://styynhgzrkyoioqjssuw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_tiF58FbBT9UsaEMAaJlqWA_k3dLHElH'; // Get from Supabase → Settings → API

// SFI sells in EUR only (Ireland). GBP is not supported.
// Clear any legacy GBP stored in localStorage from old site versions.
(function() {
  try {
    if (localStorage.getItem('sfi_currency') === 'GBP') {
      localStorage.removeItem('sfi_currency');
    }
  } catch(e) {}
})();

const DEFAULT_CURRENCY = 'EUR';

function detectCurrency() {
  return DEFAULT_CURRENCY; // Always EUR
}

// ============================================================
// SUPABASE CLIENT WRAPPER
// ============================================================
class SupabaseClient {
  constructor(url, key) {
    this.url = url;
    this.key = key;
    this.token = null; // JWT for authenticated users
  }

  async query(table, { select = '*', filters = {}, order, limit, offset } = {}) {
    let url = `${this.url}/rest/v1/${table}?select=${encodeURIComponent(select)}`;

    for (const [key, value] of Object.entries(filters)) {
      if (Array.isArray(value)) {
        url += `&${key}=in.(${value.join(',')})`;
      } else if (typeof value === 'object' && value !== null) {
        // Operators: { gte: 10, lte: 50 }
        for (const [op, val] of Object.entries(value)) {
          url += `&${key}=${op}.${val}`;
        }
      } else {
        url += `&${key}=eq.${encodeURIComponent(value)}`;
      }
    }

    if (order) url += `&order=${order}`;
    if (limit) url += `&limit=${limit}`;
    if (offset) url += `&offset=${offset}`;

    const headers = {
      'apikey': this.key,
      'Authorization': `Bearer ${this.token || this.key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
    return res.json();
  }

  async insert(table, data) {
    const res = await fetch(`${this.url}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'apikey': this.key,
        'Authorization': `Bearer ${this.token || this.key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`Insert error: ${res.status}`);
    return res.json();
  }

  async rpc(fnName, params = {}) {
    const res = await fetch(`${this.url}/rest/v1/rpc/${fnName}`, {
      method: 'POST',
      headers: {
        'apikey': this.key,
        'Authorization': `Bearer ${this.token || this.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });
    if (!res.ok) throw new Error(`RPC error: ${res.status}`);
    return res.json();
  }
}

const db = new SupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// HIGH-LEVEL API (matches current frontend usage patterns)
// ============================================================
const currency = 'EUR';
const currencySymbol = '€';
const priceField = 'price_eur';
const compareField = 'compare_at_price_eur';

const sfi = {
  currency,

  setCurrency(cur) {
    // EUR only — GBP not accepted
    if (cur !== 'EUR') {
      console.warn('[SFI] Only EUR is supported. Ignoring setCurrency:', cur);
      return;
    }
    localStorage.setItem('sfi_currency', 'EUR');
    window.location.reload();
  },

  // ---- PRODUCTS ----
  products: {
    /** List products with filters (replaces dados.json loading) */
    async list({ category, brand, search, minPrice, maxPrice, isNew, inStock, sort, page = 1, perPage = 20 } = {}) {
      const filters = { is_active: true };

      if (category) filters['category_name'] = category;
      if (brand) filters['brand_name'] = brand;
      if (isNew) filters['is_new'] = true;
      if (inStock !== undefined) filters['in_stock'] = inStock;
      if (minPrice) filters[priceField] = { ...(filters[priceField] || {}), gte: minPrice };
      if (maxPrice) filters[priceField] = { ...(filters[priceField] || {}), lte: maxPrice };

      let order = `${priceField}.asc`;
      if (sort === 'price_desc') order = `${priceField}.desc`;
      if (sort === 'name') order = 'name.asc';
      if (sort === 'newest') order = 'created_at.desc';
      if (sort === 'rating') order = 'rating.desc';
      if (sort === 'discount') order = 'discount_percent.desc';

      const select = `*,brands(name,slug),categories(name,slug)`;
      const products = await db.query('products', {
        select,
        filters,
        order,
        limit: perPage,
        offset: (page - 1) * perPage
      });

      // Transform to match current dados.json format for backward compatibility
      return products.map(p => ({
        id: p.legacy_id || p.id,
        nome: p.name,
        preco: p[priceField],
        preco_antigo: p[compareField],
        categoria: p.categories?.name || '',
        imagem: p.image_url,
        rating: p.rating,
        em_stock: p.in_stock,
        desconto: p.discount_percent,
        is_new: p.is_new,
        marca: p.brands?.name || '',
        subcategoria: p.subcategories?.name || '',
        sku: p.sku,
        descricao_detalhada: p.description,
        ingredientes: p.ingredients,
        info_nutricional: p.nutritional_info,
        modo_uso: p.usage_instructions,
        especificacoes_tecnicas: p.technical_specs,
        caracteristicas: p.features,
        // New fields available
        _id: p.id,
        _slug: p.slug,
        _currency: currency,
        _stock_qty: p.stock_quantity
      }));
    },

    /** Get single product by legacy ID or slug */
    async get(idOrSlug) {
      const filter = typeof idOrSlug === 'number'
        ? { legacy_id: idOrSlug }
        : { slug: idOrSlug };
      const results = await db.query('products', {
        select: '*,brands(name,slug),categories(name,slug)',
        filters: { ...filter, is_active: true },
        limit: 1
      });
      return results[0] || null;
    },

    /** Full-text search */
    async search(query) {
      if (!query || query.length < 2) return [];
      const results = await db.query('products', {
        select: '*,brands(name,slug),categories(name,slug)',
        filters: { is_active: true, name: { ilike: `%${query}%` } },
        limit: 20,
        order: 'rating.desc'
      });
      return results;
    },

    /** Get products for carousels */
    async carousel(type) {
      // type: 'best_sellers', 'new_products', 'promotions', 'featured'
      const items = await db.query('carousel_config', {
        select: 'sort_order,products(*,brands(name,slug),categories(name,slug))',
        filters: { carousel_type: type, is_active: true },
        order: 'sort_order.asc',
        limit: 12
      });
      return items.map(i => i.products).filter(Boolean);
    },

    /** Get all categories with product counts */
    async categories() {
      return db.query('categories', {
        select: 'id,name,slug,image_url',
        filters: { is_active: true },
        order: 'sort_order.asc'
      });
    },

    /** Get all active brands */
    async brands() {
      return db.query('brands', {
        select: 'id,name,slug,logo_url',
        filters: { is_active: true },
        order: 'sort_order.asc'
      });
    }
  },

  // ---- CART & CHECKOUT ----
  cart: {
    /** Create Stripe Checkout session via Edge Function */
    async checkout(items, { email, currency = 'EUR', shippingAddress } = {}) {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-checkout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ items, email, currency, shippingAddress })
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      return data;
    }
  },

  // ---- AUTH ----
  auth: {
    async signUp(email, password, { firstName, lastName } = {}) {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, data: { first_name: firstName, last_name: lastName } })
      });
      const data = await res.json();
      // Throw on any auth error so callers can catch it properly
      if (!res.ok || data.error_code || data.error) {
        const raw = data.msg || data.message || data.error_description || data.error || 'Registration failed';
        // Map Supabase error codes to friendly messages
        let friendly = raw;
        if (data.error_code === 'weak_password' || (raw || '').toLowerCase().includes('password')) {
          friendly = 'Password is too weak. It must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character (e.g. !@#$%).';
        } else if (data.error_code === 'email_exists' || (raw || '').toLowerCase().includes('already registered')) {
          friendly = 'This email is already registered. Try signing in instead.';
        } else if (data.error_code === 'invalid_email') {
          friendly = 'Please enter a valid email address.';
        }
        throw new Error(friendly);
      }
      if (data.access_token) {
        db.token = data.access_token;
        localStorage.setItem('sfi_token', data.access_token);
        localStorage.setItem('sfi_user', JSON.stringify(data.user));
        if (data.refresh_token) localStorage.setItem('sfi_refresh', data.refresh_token);
        if (data.expires_in) localStorage.setItem('sfi_token_exp', String(Date.now() + data.expires_in * 1000));
      }
      return data;
    },

    async signIn(email, password) {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.access_token) {
        db.token = data.access_token;
        localStorage.setItem('sfi_token', data.access_token);
        localStorage.setItem('sfi_user', JSON.stringify(data.user));
        if (data.refresh_token) localStorage.setItem('sfi_refresh', data.refresh_token);
        if (data.expires_in) localStorage.setItem('sfi_token_exp', String(Date.now() + data.expires_in * 1000));
      }
      return data;
    },

    signOut() {
      db.token = null;
      localStorage.removeItem('sfi_token');
      localStorage.removeItem('sfi_user');
      localStorage.removeItem('sfi_refresh');
      localStorage.removeItem('sfi_token_exp');
    },

    /** Sign in with OAuth provider (Google, Facebook) */
    signInWithOAuth(provider) {
      let redirectUrl;
      if (window.location.protocol === 'file:') {
        // Local dev: use the file:// path directly
        redirectUrl = window.location.href.split('#')[0].split('?')[0];
      } else {
        redirectUrl = window.location.origin + '/account.html';
      }
      const url = `${SUPABASE_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectUrl)}`;
      window.location.href = url;
    },

    /** Handle OAuth callback — extract tokens from URL hash */
    handleOAuthCallback() {
      const hash = window.location.hash;
      if (!hash || !hash.includes('access_token')) return false;
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const expiresIn = params.get('expires_in');
      if (!accessToken) return false;
      db.token = accessToken;
      localStorage.setItem('sfi_token', accessToken);
      if (refreshToken) localStorage.setItem('sfi_refresh', refreshToken);
      if (expiresIn) localStorage.setItem('sfi_token_exp', String(Date.now() + Number(expiresIn) * 1000));
      // Fetch user data
      fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${accessToken}` }
      }).then(r => r.json()).then(user => {
        if (user && user.id) localStorage.setItem('sfi_user', JSON.stringify(user));
      }).catch(() => {});
      // Clean URL hash
      history.replaceState(null, '', window.location.pathname + window.location.search);
      return true;
    },

    /** Refresh JWT using stored refresh_token */
    async refreshToken() {
      const rt = localStorage.getItem('sfi_refresh');
      if (!rt) return false;
      try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: rt })
        });
        if (!res.ok) { sfi.auth.signOut(); return false; }
        const data = await res.json();
        if (data.access_token) {
          db.token = data.access_token;
          localStorage.setItem('sfi_token', data.access_token);
          if (data.user) localStorage.setItem('sfi_user', JSON.stringify(data.user));
          if (data.refresh_token) localStorage.setItem('sfi_refresh', data.refresh_token);
          if (data.expires_in) localStorage.setItem('sfi_token_exp', String(Date.now() + data.expires_in * 1000));
          return true;
        }
        return false;
      } catch(e) { return false; }
    },

    /** Ensure token is fresh — call before critical API operations */
    async ensureAuth() {
      const exp = Number(localStorage.getItem('sfi_token_exp') || 0);
      if (exp && Date.now() > exp - 60000) { // Refresh 1 min before expiry
        return await sfi.auth.refreshToken();
      }
      return !!db.token;
    },

    getUser() {
      const u = localStorage.getItem('sfi_user');
      return u ? JSON.parse(u) : null;
    },

    isLoggedIn() {
      return !!localStorage.getItem('sfi_token');
    },

    async resetPassword(email) {
      // Uses our Edge Function which generates the link via Admin API + sends via Brevo
      const res = await fetch(`${SUPABASE_URL}/functions/v1/b2b-reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      return res.json();
    },

    /** Update password using the recovery access_token from URL hash */
    async updatePassword(newPassword, accessToken) {
      const token = accessToken || localStorage.getItem('sfi_reset_token') || db.token;
      if (!token) throw new Error('No valid session. Please use the reset link from your email.');
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ password: newPassword })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.msg || 'Failed to update password');
      }
      localStorage.removeItem('sfi_reset_token');
      return res.json();
    }
  },

  // ---- NEWSLETTER ----
  newsletter: {
    async subscribe(email, firstName) {
      return db.insert('newsletter_subscribers', { email, first_name: firstName });
    }
  },

  // ---- ORDERS (authenticated) ----
  orders: {
    async myOrders() {
      return db.query('orders', {
        select: '*,order_items(*)',
        order: 'created_at.desc'
      });
    },
    async create(orderData) {
      const user = sfi.auth.getUser();
      const order = {
        user_id: user?.id || null,
        status: orderData.status || 'pending',
        total: orderData.total,
        contact_name: `${orderData.contact.firstName} ${orderData.contact.lastName}`,
        contact_email: orderData.contact.email,
        shipping_address: JSON.stringify(orderData.shipping),
        items: JSON.stringify(orderData.items)
      };
      return db.insert('orders', order);
    }
  },

  // ---- B2B ----
  b2b: {
    /** Check if current user has approved B2B access */
    async checkAccess() {
      const user = sfi.auth.getUser();
      if (!user) return false;
      await sfi.auth.ensureAuth();
      try {
        // Try user_id first, fall back to email match (handles legacy customers with null user_id)
        let rows = await db.query('customers', {
          select: 'is_b2b,b2b_status,customer_type',
          filters: { user_id: user.id },
          limit: 1
        });
        if (!rows || !rows[0]) {
          // Fallback: match by email
          rows = await db.query('customers', {
            select: 'is_b2b,b2b_status,customer_type',
            filters: { email: user.email },
            limit: 1
          });
        }
        const p = rows && rows[0];
        if (!p) return false;
        // Accept customer_type='b2b' with approved or null status (legacy imports)
        if (p.customer_type === 'b2b' || p.is_b2b === true) {
          return p.b2b_status === 'approved' || p.b2b_status === null;
        }
        return false;
      } catch (e) { return false; }
    },

    /** Get B2B profile for current user */
    async getProfile() {
      const user = sfi.auth.getUser();
      if (!user) return null;
      await sfi.auth.ensureAuth();
      try {
        const rows = await db.query('customers', {
          select: '*',
          filters: { user_id: user.id },
          limit: 1
        });
        return rows[0] || null;
      } catch (e) { return null; }
    },

    /** Submit B2B application */
    async apply({ companyName, vatNumber, website, businessType, expectedVolume, aboutBusiness }) {
      const user = sfi.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const res = await fetch(`${SUPABASE_URL}/rest/v1/customers?user_id=eq.${user.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${db.token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          b2b_company_name: companyName,
          b2b_vat_number: vatNumber,
          b2b_website: website || null,
          b2b_business_type: businessType,
          b2b_expected_volume: expectedVolume,
          b2b_notes: aboutBusiness || null,
          b2b_status: 'pending',
          b2b_applied_at: new Date().toISOString()
        })
      });
      if (!res.ok) throw new Error('Failed to submit B2B application');
      return res.json();
    },

    /** Get B2B dashboard stats (via RPC) */
    async getDashboardStats() {
      const profile = await sfi.b2b.getProfile();
      if (!profile?.id) return null;
      try {
        const result = await db.rpc('get_b2b_dashboard_stats', { p_customer_id: profile.id });
        return result;
      } catch (e) { console.error('[SFI B2B] getDashboardStats error:', e); return null; }
    },

    /** Get most frequently ordered products by this customer */
    async getFrequentProducts() {
      const profile = await sfi.b2b.getProfile();
      if (!profile?.id) return [];
      try {
        return await db.rpc('get_b2b_frequent_products', { p_customer_id: profile.id });
      } catch (e) { console.error('[SFI B2B] getFrequentProducts error:', e); return []; }
    },

    /** Get recommended products (lapsed + similar not bought) */
    async getRecommendedProducts() {
      const profile = await sfi.b2b.getProfile();
      if (!profile?.id) return [];
      try {
        return await db.rpc('get_b2b_recommended_products', { p_customer_id: profile.id });
      } catch (e) { console.error('[SFI B2B] getRecommendedProducts error:', e); return []; }
    },

    /** Get sub-accounts linked to this customer group */
    async getSubAccounts() {
      const profile = await sfi.b2b.getProfile();
      if (!profile?.id) return [];
      try {
        return await db.rpc('get_b2b_sub_accounts', { p_customer_id: profile.id });
      } catch (e) { console.error('[SFI B2B] getSubAccounts error:', e); return []; }
    },

    /** Get B2B customer orders with item counts (via RPC) */
    async getOrders({ limit = null, offset = 0 } = {}) {
      const profile = await sfi.b2b.getProfile();
      if (!profile?.id) return [];
      try {
        const params = { p_customer_id: profile.id, p_offset: offset };
        if (limit) params.p_limit = limit;
        return await db.rpc('get_b2b_orders', params);
      } catch (e) { console.error('[SFI B2B] getOrders error:', e); return []; }
    },

    /** Get order items for a specific order (for reorder) */
    async getOrderItems(orderId) {
      if (!orderId) return [];
      try {
        const rows = await db.query('order_items', {
          select: '*,products(name,image_url,sku,brands(name))',
          filters: { order_id: orderId }
        });
        return rows || [];
      } catch (e) { console.error('[SFI B2B] getOrderItems error:', e); return []; }
    },

    /** Get top purchased products for this B2B customer */
    async getTopProducts({ limit = 12 } = {}) {
      const profile = await sfi.b2b.getProfile();
      if (!profile?.id) return [];
      try {
        return await db.rpc('get_b2b_top_products', {
          p_customer_id: profile.id,
          p_limit: limit
        });
      } catch (e) { console.error('[SFI B2B] getTopProducts error:', e); return []; }
    },

    /** Get invoices for this B2B customer (from QuickBooks synced data) */
    async getInvoices({ limit = 20 } = {}) {
      const profile = await sfi.b2b.getProfile();
      if (!profile?.email) return [];
      try {
        // qb_invoices links via email, not customer_id UUID
        const rows = await db.query('qb_invoices', {
          select: '*',
          filters: { customer_email: profile.email },
          order: 'txn_date.desc',
          limit
        });
        return rows || [];
      } catch (e) { return []; }
    },

    /** List products with B2B prices (approved users only) */
    async getProducts({ category, subcategory, brand, search, sort, page = 1, perPage = 20 } = {}) {
      const hasAccess = await sfi.b2b.checkAccess();
      if (!hasAccess) throw new Error('B2B access required');

      // Build URL manually to support filtering on joined tables
      let brandsJoin = 'brands(name,slug)';
      let catsJoin = 'categories(name,slug)';
      let subsJoin = 'subcategories(name,slug)';
      let extraFilters = '';
      
      if (brand) {
        brandsJoin = 'brands!inner(name,slug)';
        extraFilters += `&brands.name=eq.${encodeURIComponent(brand)}`;
      }
      if (category) {
        catsJoin = 'categories!inner(name,slug)';
        extraFilters += `&categories.name=eq.${encodeURIComponent(category)}`;
      }
      if (subcategory) {
        subsJoin = 'subcategories!inner(name,slug)';
        extraFilters += `&subcategories.name=eq.${encodeURIComponent(subcategory)}`;
      }
      if (search) {
        extraFilters += `&name=ilike.*${encodeURIComponent(search)}*`;
      }

      let order = `${priceField}.asc`;
      if (sort === 'price_desc') order = `${priceField}.desc`;
      if (sort === 'price_asc') order = `${priceField}.asc`;
      if (sort === 'name') order = 'name.asc';
      if (sort === 'category') order = 'name.asc';

      // Include default variant to get wholesale_price when product-level wholesale_price_eur is missing
      const variantsJoin = 'product_variants(wholesale_price,price,is_default,is_active)';
      const selectStr = encodeURIComponent(`*,${brandsJoin},${catsJoin},${subsJoin},${variantsJoin}`);
      const url = `${SUPABASE_URL}/rest/v1/products?select=${selectStr}&is_active=eq.true${extraFilters}&order=${order}&limit=${perPage}&offset=${(page - 1) * perPage}`;
      
      const res = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${db.token || SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
      const products = await res.json();

      return products.map(p => {
        // 1. Try product-level wholesale_price_eur first
        let wsEur = p.wholesale_price_eur && p.wholesale_price_eur > 0 ? Number(p.wholesale_price_eur) : null;
        // 2. Fallback: use min wholesale_price from active variants (default variant preferred)
        if (!wsEur && p.product_variants && p.product_variants.length > 0) {
          const activeVars = p.product_variants.filter(v => v.is_active !== false && v.wholesale_price > 0);
          const defaultVar = activeVars.find(v => v.is_default) || activeVars[0];
          if (defaultVar && defaultVar.wholesale_price > 0) wsEur = Number(defaultVar.wholesale_price);
        }
        const retailEur = Number(p[priceField]) || 0;
        const b2bEur = (wsEur && wsEur < retailEur) ? wsEur : retailEur;

        return {
          id: p.legacy_id || p.id,
          nome: p.name,
          imagem: p.image_url || '',
          categoria: p.categories?.name || '',
          subcategoria: p.subcategories?.name || '',
          marca: p.brands?.name || '',
          sku: p.sku,
          retail_price: p[priceField],
          retail_compare: p[compareField],
          b2b_price: b2bEur,
          has_wholesale: wsEur !== null && wsEur > 0 && wsEur < retailEur,
          b2b_min_qty: 1,
          em_stock: p.in_stock,
          backorder_available: p.backorder_available || false,
          desconto: p.discount_percent,
          _id: p.id,
          _slug: p.slug,
          _stock_qty: p.stock_quantity
        };
      });
    }
  }
};

// Auto-restore auth token on page load
const savedToken = localStorage.getItem('sfi_token');
if (savedToken) {
  db.token = savedToken;
  // Auto-refresh if token is near expiry or expired
  const exp = Number(localStorage.getItem('sfi_token_exp') || 0);
  if (exp && Date.now() > exp - 120000) {
    sfi.auth.refreshToken().catch(() => {});
  }
}

// Make available globally for non-module scripts
window.sfi = sfi;

// console.log(`[SFI] API ready | Currency: ${currency} | Auth: ${sfi.auth.isLoggedIn() ? 'yes' : 'no'}`);
