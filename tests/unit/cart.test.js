/**
 * Unit Tests for Cart Functionality
 * Tests cart operations, localStorage management, and cart calculations
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

// Mock console methods to avoid clutter in test output
global.console = {
    ...console,
    error: jest.fn(),
    warn: jest.fn(),
    log: jest.fn()
};

// Mock window.PRODUTOS — in jsdom, window === global, so set directly on global
const MOCK_PRODUTOS = [
    { id: 1, nome: 'Whey Protein', preco: 29.99, imagem: 'img/produto1.jpg', em_stock: true },
    { id: 2, nome: 'Creatine Monohydrate', preco: 19.99, imagem: 'img/produto2.jpg', em_stock: true },
    { id: 3, nome: 'BCAA Powder', preco: 24.99, imagem: 'img/produto3.jpg', em_stock: true }
];
global.PRODUTOS = MOCK_PRODUTOS;

// Import cart functions (simulated - since we can't directly import from cart.js)
// We'll define them here based on the actual implementation

function getCart() {
    try {
        return JSON.parse(localStorage.getItem('sfi_cart')) || [];
    } catch (e) {
        console.error('Error reading cart:', e);
        return [];
    }
}

function saveCart(cart) {
    try {
        localStorage.setItem('sfi_cart', JSON.stringify(cart));
    } catch (e) {
        console.error('Error saving cart:', e);
    }
}

function getCartTotal() {
    const cart = getCart();
    return cart.reduce((sum, item) => sum + (item.preco * (item.quantidade || 1)), 0);
}

function addToCart(productId, quantity = 1, productData = null) {
    const product = productData || window.PRODUTOS.find(p => p.id === productId);
    if (!product) return;

    const nome = product.nome;
    const preco = product.preco;
    const imagem = product.imagem;

    let cart = getCart();
    const existingItem = cart.find(item => item.id === productId);

    if (existingItem) {
        existingItem.quantidade = (existingItem.quantidade || 1) + quantity;
    } else {
        cart.push({
            id: productId,
            nome: nome,
            preco: preco,
            imagem: imagem,
            quantidade: quantity
        });
    }

    saveCart(cart);
}

function removeFromCart(productId) {
    let cart = getCart();
    cart = cart.filter(item => item.id !== productId);
    saveCart(cart);
}

// ============================================
// TESTS
// ============================================

describe('Cart Data Management', () => {

    beforeEach(() => {
        // Clear localStorage before each test
        localStorage.clear();
    });

    test('localStorage key is "sfi_cart" (not "cart")', () => {
        const testCart = [{ id: 1, nome: 'Test Product', preco: 10, quantidade: 1 }];
        saveCart(testCart);

        // Verify the key used is 'sfi_cart'
        expect(localStorage.getItem('sfi_cart')).toBeTruthy();
        expect(localStorage.getItem('cart')).toBeNull();
    });

    test('getCart returns empty array when localStorage is empty', () => {
        const cart = getCart();
        expect(cart).toEqual([]);
        expect(Array.isArray(cart)).toBe(true);
    });

    test('getCart returns parsed cart from localStorage', () => {
        const mockCart = [
            { id: 1, nome: 'Product 1', preco: 20, quantidade: 2 }
        ];
        localStorage.setItem('sfi_cart', JSON.stringify(mockCart));

        const cart = getCart();
        expect(cart).toEqual(mockCart);
        expect(cart.length).toBe(1);
    });

    test('saveCart stores cart in localStorage as JSON', () => {
        const mockCart = [
            { id: 2, nome: 'Product 2', preco: 15, quantidade: 1 }
        ];

        saveCart(mockCart);

        const stored = localStorage.getItem('sfi_cart');
        expect(stored).toBeTruthy();
        expect(JSON.parse(stored)).toEqual(mockCart);
    });
});

describe('Add to Cart', () => {

    beforeEach(() => {
        localStorage.clear();
        global.PRODUTOS = MOCK_PRODUTOS;
    });

    test('addToCart adds item correctly with default quantity', () => {
        addToCart(1);

        const cart = getCart();
        expect(cart.length).toBe(1);
        expect(cart[0].id).toBe(1);
        expect(cart[0].nome).toBe('Whey Protein');
        expect(cart[0].preco).toBe(29.99);
        expect(cart[0].quantidade).toBe(1);
    });

    test('addToCart adds item with custom quantity', () => {
        addToCart(2, 3);

        const cart = getCart();
        expect(cart.length).toBe(1);
        expect(cart[0].id).toBe(2);
        expect(cart[0].quantidade).toBe(3);
    });

    test('addToCart increases quantity for existing item', () => {
        addToCart(1, 2);
        addToCart(1, 3);

        const cart = getCart();
        expect(cart.length).toBe(1);
        expect(cart[0].quantidade).toBe(5);
    });

    test('addToCart adds multiple different products', () => {
        addToCart(1);
        addToCart(2);
        addToCart(3);

        const cart = getCart();
        expect(cart.length).toBe(3);
        expect(cart.map(item => item.id)).toEqual([1, 2, 3]);
    });

    test('addToCart uses productData when provided', () => {
        const customProduct = {
            id: 99,
            nome: 'Custom Product',
            preco: 49.99,
            imagem: 'img/custom.jpg'
        };

        addToCart(99, 1, customProduct);

        const cart = getCart();
        expect(cart.length).toBe(1);
        expect(cart[0].nome).toBe('Custom Product');
        expect(cart[0].preco).toBe(49.99);
    });
});

describe('Remove from Cart', () => {

    beforeEach(() => {
        localStorage.clear();
    });

    test('removeFromCart removes item correctly', () => {
        addToCart(1);
        addToCart(2);

        let cart = getCart();
        expect(cart.length).toBe(2);

        removeFromCart(1);

        cart = getCart();
        expect(cart.length).toBe(1);
        expect(cart[0].id).toBe(2);
    });

    test('removeFromCart handles non-existent product', () => {
        addToCart(1);

        removeFromCart(999);

        const cart = getCart();
        expect(cart.length).toBe(1);
    });

    test('removeFromCart on empty cart does not throw error', () => {
        expect(() => removeFromCart(1)).not.toThrow();
        expect(getCart()).toEqual([]);
    });
});

describe('Cart Total Calculation', () => {

    beforeEach(() => {
        localStorage.clear();
    });

    test('empty cart returns 0', () => {
        const total = getCartTotal();
        expect(total).toBe(0);
    });

    test('cart total calculation with single item', () => {
        addToCart(1, 1);

        const total = getCartTotal();
        expect(total).toBe(29.99);
    });

    test('cart total calculation with multiple quantities', () => {
        addToCart(1, 2); // 2 x 29.99 = 59.98

        const total = getCartTotal();
        expect(total).toBeCloseTo(59.98, 2);
    });

    test('cart total calculation with multiple items', () => {
        addToCart(1, 2); // 2 x 29.99 = 59.98
        addToCart(2, 1); // 1 x 19.99 = 19.99
        addToCart(3, 3); // 3 x 24.99 = 74.97

        const total = getCartTotal();
        // 59.98 + 19.99 + 74.97 = 154.94
        expect(total).toBeCloseTo(154.94, 2);
    });

    test('cart total handles items with no quantity (defaults to 1)', () => {
        const cart = [
            { id: 1, nome: 'Test', preco: 10 } // no quantidade field
        ];
        saveCart(cart);

        const total = getCartTotal();
        expect(total).toBe(10);
    });

    test('cart total with mixed quantities', () => {
        const cart = [
            { id: 1, nome: 'Product 1', preco: 25.50, quantidade: 2 },
            { id: 2, nome: 'Product 2', preco: 15.00, quantidade: 1 },
            { id: 3, nome: 'Product 3', preco: 30.00, quantidade: 4 }
        ];
        saveCart(cart);

        const total = getCartTotal();
        // (25.50 * 2) + (15.00 * 1) + (30.00 * 4) = 51 + 15 + 120 = 186
        expect(total).toBeCloseTo(186.00, 2);
    });
});

describe('Cart Edge Cases', () => {

    beforeEach(() => {
        localStorage.clear();
    });

    test('handles corrupted localStorage data gracefully', () => {
        localStorage.setItem('sfi_cart', 'invalid json data');

        const cart = getCart();
        expect(cart).toEqual([]);
        expect(console.error).toHaveBeenCalled();
    });

    test('handles zero price products', () => {
        const freeProduct = {
            id: 100,
            nome: 'Free Sample',
            preco: 0,
            imagem: 'img/free.jpg'
        };

        addToCart(100, 1, freeProduct);

        const cart = getCart();
        expect(cart.length).toBe(1);
        expect(cart[0].preco).toBe(0);

        const total = getCartTotal();
        expect(total).toBe(0);
    });

    test('handles large quantities', () => {
        addToCart(1, 100);

        const cart = getCart();
        expect(cart[0].quantidade).toBe(100);

        const total = getCartTotal();
        expect(total).toBeCloseTo(2999.00, 2);
    });
});
