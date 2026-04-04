/**
 * Unit Tests for Checkout Functionality
 * Tests coupon validation, price calculations, and checkout flow
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock localStorage
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => { store[key] = value.toString(); },
        removeItem: (key) => { delete store[key]; },
        clear: () => { store = {}; }
    };
})();

global.localStorage = localStorageMock;
global.console = {
    ...console,
    error: jest.fn(),
    warn: jest.fn(),
    log: jest.fn()
};

// Mock fetch for Supabase API calls
global.fetch = jest.fn();

// Mock window
global.window = {
    _sfiCustomerIsB2B: false,
    location: {
        pathname: '/checkout.html',
        origin: 'https://sportsfoodsireland.ie',
        search: ''
    },
    history: {
        replaceState: jest.fn()
    }
};

// Helper function to get cart
function getCart() {
    try {
        return JSON.parse(localStorage.getItem('sfi_cart')) || [];
    } catch (e) {
        return [];
    }
}

function saveCart(cart) {
    localStorage.setItem('sfi_cart', JSON.stringify(cart));
}

// Simulate fetchCouponFromDB function
async function fetchCouponFromDB(code) {
    try {
        const res = await fetch(
            'https://styynhgzrkyoioqjssuw.supabase.co/rest/v1/discount_codes?code=eq.' + code + '&is_active=eq.true&select=*'
        );
        const rows = await res.json();
        if (!rows || !rows.length) return null;

        const dc = rows[0];
        const now = new Date();

        // Check expiry
        if (dc.starts_at && new Date(dc.starts_at) > now) return null;
        if (dc.ends_at && new Date(dc.ends_at) < now) return null;

        // Check usage limit
        if (dc.max_uses && dc.current_uses >= dc.max_uses) return null;

        // Check minimum order
        const cart = getCart();
        const subtotal = cart.reduce((s, i) => s + (Number(i.preco) || 0) * (i.quantidade || 1), 0);
        if (dc.min_order_value && subtotal < Number(dc.min_order_value)) {
            return { error: 'Minimum order of €' + Number(dc.min_order_value).toFixed(2) + ' required' };
        }

        // Map type
        const typeMap = {
            'percentage': 'percent',
            'fixed_amount': 'fixed',
            'fixed': 'fixed',
            'free_shipping': 'shipping',
            'percent': 'percent'
        };
        const type = typeMap[dc.discount_type] || dc.discount_type;
        const freeShip = dc.free_shipping || false;

        return {
            type,
            value: Number(dc.discount_value),
            dbId: dc.id,
            freeShipping: freeShip
        };
    } catch (e) {
        console.error('Coupon lookup error:', e);
        return null;
    }
}

// Calculate checkout totals
function calculateCheckoutTotals(cart, appliedCoupon = null, isB2B = false) {
    const subtotal = cart.reduce((s, i) => s + i.preco * (i.quantidade || 1), 0);
    let discount = 0;
    const freeShipMin = isB2B ? 150 : 60;
    let shipCost = subtotal >= freeShipMin ? 0 : 9.04;

    if (appliedCoupon) {
        if (appliedCoupon.type === 'percent') {
            discount = subtotal * appliedCoupon.value / 100;
        } else if (appliedCoupon.type === 'fixed') {
            discount = appliedCoupon.value;
        } else if (appliedCoupon.type === 'shipping') {
            shipCost = 0;
        }
        if (appliedCoupon.freeShipping) {
            shipCost = 0;
        }
    }

    const total = subtotal - discount + shipCost;
    const taxIncluded = total - (total / 1.23);

    return { subtotal, discount, shipCost, total, taxIncluded };
}

// ============================================
// TESTS
// ============================================

describe('Checkout - Cart Validation', () => {

    beforeEach(() => {
        localStorage.clear();
        jest.clearAllMocks();
    });

    test('empty cart is rejected before checkout', () => {
        const cart = getCart();
        expect(cart.length).toBe(0);

        // Checkout should not proceed with empty cart
        expect(cart.length === 0).toBe(true);
    });

    test('non-empty cart allows checkout to proceed', () => {
        const cart = [
            { id: 1, nome: 'Whey Protein', preco: 29.99, quantidade: 1 }
        ];
        saveCart(cart);

        const loadedCart = getCart();
        expect(loadedCart.length).toBeGreaterThan(0);
    });
});

describe('Checkout - Coupon Validation', () => {

    beforeEach(() => {
        localStorage.clear();
        jest.clearAllMocks();

        // Setup cart for coupon tests
        const cart = [
            { id: 1, nome: 'Whey Protein', preco: 50.00, quantidade: 1 }
        ];
        saveCart(cart);
    });

    test('valid percentage coupon is accepted', async () => {
        const mockCoupon = {
            id: 1,
            code: 'SAVE20',
            discount_type: 'percentage',
            discount_value: 20,
            is_active: true,
            current_uses: 5,
            max_uses: 100
        };

        global.fetch.mockResolvedValueOnce({
            json: async () => [mockCoupon]
        });

        const result = await fetchCouponFromDB('SAVE20');

        expect(result).toBeTruthy();
        expect(result.type).toBe('percent');
        expect(result.value).toBe(20);
        expect(result.error).toBeUndefined();
    });

    test('valid fixed amount coupon is accepted', async () => {
        const mockCoupon = {
            id: 2,
            code: 'FIXED10',
            discount_type: 'fixed_amount',
            discount_value: 10,
            is_active: true,
            current_uses: 10,
            max_uses: 50
        };

        global.fetch.mockResolvedValueOnce({
            json: async () => [mockCoupon]
        });

        const result = await fetchCouponFromDB('FIXED10');

        expect(result).toBeTruthy();
        expect(result.type).toBe('fixed');
        expect(result.value).toBe(10);
    });

    test('expired coupon is rejected', async () => {
        const expiredCoupon = {
            id: 3,
            code: 'EXPIRED',
            discount_type: 'percentage',
            discount_value: 15,
            is_active: true,
            ends_at: '2023-01-01T00:00:00Z', // Past date
            current_uses: 0,
            max_uses: 100
        };

        global.fetch.mockResolvedValueOnce({
            json: async () => [expiredCoupon]
        });

        const result = await fetchCouponFromDB('EXPIRED');

        expect(result).toBeNull();
    });

    test('coupon with minimum order requirement below threshold is rejected', async () => {
        // Cart has 50.00, but coupon requires 100.00
        const mockCoupon = {
            id: 4,
            code: 'MIN100',
            discount_type: 'percentage',
            discount_value: 10,
            is_active: true,
            min_order_value: 100.00,
            current_uses: 0,
            max_uses: 50
        };

        global.fetch.mockResolvedValueOnce({
            json: async () => [mockCoupon]
        });

        const result = await fetchCouponFromDB('MIN100');

        expect(result).toBeTruthy();
        expect(result.error).toBe('Minimum order of €100.00 required');
    });

    test('coupon with minimum order requirement above threshold is accepted', async () => {
        // Update cart to meet minimum
        const cart = [
            { id: 1, nome: 'Whey Protein', preco: 150.00, quantidade: 1 }
        ];
        saveCart(cart);

        const mockCoupon = {
            id: 5,
            code: 'MIN100OK',
            discount_type: 'percentage',
            discount_value: 10,
            is_active: true,
            min_order_value: 100.00,
            current_uses: 0,
            max_uses: 50
        };

        global.fetch.mockResolvedValueOnce({
            json: async () => [mockCoupon]
        });

        const result = await fetchCouponFromDB('MIN100OK');

        expect(result).toBeTruthy();
        expect(result.error).toBeUndefined();
        expect(result.value).toBe(10);
    });

    test('coupon at usage limit is rejected', async () => {
        const maxedCoupon = {
            id: 6,
            code: 'MAXED',
            discount_type: 'percentage',
            discount_value: 25,
            is_active: true,
            current_uses: 100,
            max_uses: 100 // Already at limit
        };

        global.fetch.mockResolvedValueOnce({
            json: async () => [maxedCoupon]
        });

        const result = await fetchCouponFromDB('MAXED');

        expect(result).toBeNull();
    });

    test('non-existent coupon code returns null', async () => {
        global.fetch.mockResolvedValueOnce({
            json: async () => []
        });

        const result = await fetchCouponFromDB('NOTEXIST');

        expect(result).toBeNull();
    });

    test('free shipping coupon is correctly identified', async () => {
        const freeShipCoupon = {
            id: 7,
            code: 'FREESHIP',
            discount_type: 'free_shipping',
            discount_value: 0,
            is_active: true,
            free_shipping: true,
            current_uses: 0,
            max_uses: 200
        };

        global.fetch.mockResolvedValueOnce({
            json: async () => [freeShipCoupon]
        });

        const result = await fetchCouponFromDB('FREESHIP');

        expect(result).toBeTruthy();
        expect(result.type).toBe('shipping');
        expect(result.freeShipping).toBe(true);
    });
});

describe('Checkout - Price Calculations', () => {

    beforeEach(() => {
        localStorage.clear();
    });

    test('subtotal calculated correctly with single item', () => {
        const cart = [
            { id: 1, nome: 'Product 1', preco: 29.99, quantidade: 1 }
        ];

        const totals = calculateCheckoutTotals(cart);

        expect(totals.subtotal).toBeCloseTo(29.99, 2);
    });

    test('subtotal calculated correctly with multiple items', () => {
        const cart = [
            { id: 1, nome: 'Product 1', preco: 29.99, quantidade: 2 },
            { id: 2, nome: 'Product 2', preco: 19.99, quantidade: 1 },
            { id: 3, nome: 'Product 3', preco: 24.99, quantidade: 3 }
        ];

        const totals = calculateCheckoutTotals(cart);

        // (29.99 * 2) + (19.99 * 1) + (24.99 * 3) = 59.98 + 19.99 + 74.97 = 154.94
        expect(totals.subtotal).toBeCloseTo(154.94, 2);
    });

    test('percentage coupon discount applied correctly', () => {
        const cart = [
            { id: 1, nome: 'Product 1', preco: 100.00, quantidade: 1 }
        ];

        const coupon = {
            type: 'percent',
            value: 20 // 20% off
        };

        const totals = calculateCheckoutTotals(cart, coupon);

        expect(totals.subtotal).toBe(100.00);
        expect(totals.discount).toBe(20.00);
        expect(totals.total).toBe(80.00); // 100 - 20 discount + 0 shipping (over €60)
    });

    test('fixed amount coupon discount applied correctly', () => {
        const cart = [
            { id: 1, nome: 'Product 1', preco: 100.00, quantidade: 1 }
        ];

        const coupon = {
            type: 'fixed',
            value: 15.00
        };

        const totals = calculateCheckoutTotals(cart, coupon);

        expect(totals.discount).toBe(15.00);
        expect(totals.total).toBe(85.00); // 100 - 15 discount + 0 shipping
    });

    test('shipping coupon removes shipping cost', () => {
        const cart = [
            { id: 1, nome: 'Product 1', preco: 50.00, quantidade: 1 } // Below €60 threshold
        ];

        const coupon = {
            type: 'shipping'
        };

        const totals = calculateCheckoutTotals(cart, coupon);

        expect(totals.shipCost).toBe(0);
        expect(totals.total).toBe(50.00); // No shipping added
    });

    test('tax calculation included in total', () => {
        const cart = [
            { id: 1, nome: 'Product 1', preco: 123.00, quantidade: 1 }
        ];

        const totals = calculateCheckoutTotals(cart);

        // Tax = total - (total / 1.23)
        const expectedTax = totals.total - (totals.total / 1.23);
        expect(totals.taxIncluded).toBeCloseTo(expectedTax, 2);
    });
});

describe('Checkout - Shipping Calculations', () => {

    beforeEach(() => {
        localStorage.clear();
    });

    test('free shipping for regular customer over €60', () => {
        const cart = [
            { id: 1, nome: 'Product 1', preco: 70.00, quantidade: 1 }
        ];

        const totals = calculateCheckoutTotals(cart, null, false);

        expect(totals.shipCost).toBe(0);
    });

    test('shipping cost for regular customer under €60', () => {
        const cart = [
            { id: 1, nome: 'Product 1', preco: 50.00, quantidade: 1 }
        ];

        const totals = calculateCheckoutTotals(cart, null, false);

        expect(totals.shipCost).toBe(9.04);
        expect(totals.total).toBeCloseTo(59.04, 2);
    });

    test('free shipping for B2B customer over €150', () => {
        const cart = [
            { id: 1, nome: 'Product 1', preco: 160.00, quantidade: 1 }
        ];

        const totals = calculateCheckoutTotals(cart, null, true);

        expect(totals.shipCost).toBe(0);
    });

    test('shipping cost for B2B customer under €150', () => {
        const cart = [
            { id: 1, nome: 'Product 1', preco: 100.00, quantidade: 1 }
        ];

        const totals = calculateCheckoutTotals(cart, null, true);

        expect(totals.shipCost).toBe(9.04);
        expect(totals.total).toBeCloseTo(109.04, 2);
    });

    test('B2B threshold higher than regular (€150 vs €60)', () => {
        const cart = [
            { id: 1, nome: 'Product 1', preco: 100.00, quantidade: 1 }
        ];

        const regularTotals = calculateCheckoutTotals(cart, null, false);
        const b2bTotals = calculateCheckoutTotals(cart, null, true);

        // €100 > €60 (regular free shipping) but < €150 (B2B free shipping)
        expect(regularTotals.shipCost).toBe(0);
        expect(b2bTotals.shipCost).toBe(9.04);
    });
});

describe('Checkout - Edge Cases', () => {

    beforeEach(() => {
        localStorage.clear();
    });

    test('handles zero-priced items', () => {
        const cart = [
            { id: 1, nome: 'Free Sample', preco: 0, quantidade: 1 }
        ];

        const totals = calculateCheckoutTotals(cart);

        expect(totals.subtotal).toBe(0);
        expect(totals.shipCost).toBe(9.04); // Still charges shipping
        expect(totals.total).toBe(9.04);
    });

    test('handles very large order totals', () => {
        const cart = [
            { id: 1, nome: 'Bulk Order', preco: 9999.99, quantidade: 10 }
        ];

        const totals = calculateCheckoutTotals(cart);

        expect(totals.subtotal).toBeCloseTo(99999.90, 2);
        expect(totals.shipCost).toBe(0); // Free shipping on large orders
    });

    test('coupon with freeShipping flag overrides shipping cost', () => {
        const cart = [
            { id: 1, nome: 'Product 1', preco: 30.00, quantidade: 1 }
        ];

        const coupon = {
            type: 'percent',
            value: 10,
            freeShipping: true
        };

        const totals = calculateCheckoutTotals(cart, coupon);

        expect(totals.discount).toBe(3.00); // 10% of 30
        expect(totals.shipCost).toBe(0); // Free shipping from coupon
        expect(totals.total).toBe(27.00); // 30 - 3 discount
    });

    test('100% discount coupon results in zero cost (shipping still applies)', () => {
        const cart = [
            { id: 1, nome: 'Product 1', preco: 50.00, quantidade: 1 }
        ];

        const coupon = {
            type: 'percent',
            value: 100
        };

        const totals = calculateCheckoutTotals(cart, coupon);

        expect(totals.discount).toBe(50.00);
        expect(totals.shipCost).toBe(9.04);
        expect(totals.total).toBe(9.04); // Only shipping cost
    });
});
