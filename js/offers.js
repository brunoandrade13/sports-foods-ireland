// Offers Page JavaScript
let allOffers = [];
let displayedOffers = [];

// Category mapping (Portuguese to English)
const categoryMap = {
    'Nutricao': 'Nutrition',
    'Ciclismo': 'Cycling',
    'Natacao': 'Swimming',
    'Corrida': 'Running',
    'Triathlon': 'Triathlon',
    'Acessorios': 'Accessories',
    'Eletronicos': 'Electronics',
    // Current categories
    'Nutrition': 'Nutrition',
    'Cycling': 'Cycling',
    'Swimming': 'Swimming',
    'Running': 'Running',
    'Electronics': 'Electronics',
    // Legacy mappings
    'Nutrição Esportiva': 'Nutrition',
    'iGSPORT': 'Electronics',
    'Lock Laces': 'Running',
    "Chamois Butt'r": 'Cycling',
    'Run Accessories': 'Running',
    'Spatzwear': 'Cycling',
    'Swim Secure': 'Swimming',
    'Zone 3': 'Swimming',
    'Blackwitch': 'Running',
    'Swimming & Watersports': 'Swimming'
};

// Helper: Função para obter imagem válida do produto
function getOfferProductImage(imagem, productId) {
    // 0) Normalize extension: Supabase may have .jpg/.png but real files are .webp
    if (imagem && imagem.includes('produtos-279/')) {
        imagem = imagem.replace(/\.(jpg|jpeg|png)$/i, '.webp');
    }
    
    // 1) Caminho relativo para a pasta de produtos baixados (279 novos produtos)
    if (imagem && (imagem.startsWith('produtos-279/') || imagem.startsWith('produtos-279\\'))) {
        return `img/${imagem}`;
    }
    
    // 1b) Caminho antigo produtos-site (compatibilidade)
    if (imagem && (imagem.startsWith('produtos-site/') || imagem.startsWith('produtos-site\\'))) {
        return `img/${imagem}`;
    }
    
    // 2) Já tem img/ no início
    if (imagem && imagem.startsWith('img/')) {
        return imagem;
    }

    // 3) URL absoluta
    if (imagem && /^https?:\/\//i.test(imagem)) {
        return imagem;
    }

    // 4) Compatibilidade com nomes tipo produtoX.jpg
    if (imagem && /^produto\d+\.jpg$/i.test(imagem)) {
        return `img/${imagem}`;
    }
    
    // 5) Imagem simples sem path
    if (imagem) {
        return `img/${imagem}`;
    }

    // 6) Fallback final
    const fallbackIndex = ((productId || 1) % 5) + 1;
    return `img/produto${fallbackIndex}.jpg`;
}

// Load products with discounts
async function loadOffers() {
    try {
        let data;
        
        // PRIORIDADE 1: Usar dados embutidos se disponíveis (funciona com file://)
        if (Array.isArray(window.EMBEDDED_PRODUCTS) && window.EMBEDDED_PRODUCTS.length > 0) {
            data = window.EMBEDDED_PRODUCTS;
        } 
        // PRIORIDADE 2: Usar window.PRODUTOS se disponível
        else if (Array.isArray(window.PRODUTOS) && window.PRODUTOS.length > 0) {
            data = window.PRODUTOS;
        }
        // PRIORIDADE 3: Tentar fetch
        else {
            try {
                const response = await fetch('js/dados.json');
                if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
                data = await response.json();
            } catch (fetchError) {
                // Fallback para XMLHttpRequest (funciona com file://)
                data = await new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open('GET', 'js/dados.json', true);
                    xhr.onreadystatechange = function() {
                        if (xhr.readyState === 4) {
                            if (xhr.status === 200 || xhr.status === 0) {
                                try {
                                    if (xhr.responseText && xhr.responseText.trim()) {
                                        resolve(JSON.parse(xhr.responseText));
                                    } else {
                                        reject(new Error('Empty response from XHR'));
                                    }
                                } catch (e) {
                                    reject(e);
                                }
                            } else {
                                reject(new Error(`XHR error: ${xhr.status}`));
                            }
                        }
                    };
                    xhr.onerror = () => reject(new Error('XHR network error'));
                    xhr.send();
                });
            }
        }
        
        // Obter array de produtos
        const productsArray = Array.isArray(data) ? data : (data.produtos || []);
        
        
        // Filtrar produtos COM desconto > 0
        allOffers = productsArray
            .filter(product => (product.desconto || 0) > 0)
            .map(product => ({
                ...product,
                categoryEn: categoryMap[product.categoria] || product.categoria,
                price: parseFloat(product.preco) || 0,
                oldPrice: parseFloat(product.preco_antigo) || null,
                discount: product.desconto || 0,
                inStock: product.em_stock !== false
            }));
        
        
        // Sort by highest discount by default
        sortOffers('discount-desc');
        
    } catch (error) {
        console.error('❌ Offers: Error loading offers:', error);
        document.getElementById('offersGrid').innerHTML = '<p style="text-align:center;padding:2rem;color:red;">Error loading offers. Please try again later.<br>Error: ' + error.message + '</p>';
    }
}

// Sort offers
function sortOffers(sortBy) {
    displayedOffers = [...allOffers];
    
    switch(sortBy) {
        case 'discount-desc':
            displayedOffers.sort((a, b) => (b.discount || 0) - (a.discount || 0));
            break;
        case 'discount-asc':
            displayedOffers.sort((a, b) => (a.discount || 0) - (b.discount || 0));
            break;
        case 'price-asc':
            displayedOffers.sort((a, b) => a.price - b.price);
            break;
        case 'price-desc':
            displayedOffers.sort((a, b) => b.price - a.price);
            break;
        case 'name-asc':
            displayedOffers.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
            break;
        case 'name-desc':
            displayedOffers.sort((a, b) => (b.nome || '').localeCompare(a.nome || ''));
            break;
        default:
            displayedOffers.sort((a, b) => (b.discount || 0) - (a.discount || 0));
    }
    
    renderOffers();
}

// Render offers
function renderOffers() {
    const grid = document.getElementById('offersGrid');
    const empty = document.getElementById('offersEmpty');
    
    if (displayedOffers.length === 0) {
        grid.style.display = 'none';
        empty.style.display = 'block';
        return;
    }
    
    grid.style.display = 'grid';
    empty.style.display = 'none';
    
    grid.innerHTML = displayedOffers.map(product => {
        // Use shared template if available
        if (typeof createProductCardHTML === 'function') {
            return createProductCardHTML(product);
        }
        
        const imagePath = getOfferProductImage(product.imagem, product.id);
        const discountBadge = product.discount > 0 
            ? `<span class="badge-desconto">-${product.discount}%</span>` 
            : '';
        const oldPrice = product.oldPrice && product.oldPrice > product.price
            ? `<span class="old-price">€${product.oldPrice.toFixed(2)}</span>`
            : '';
        
        return `
            <article class="product-card" data-id="${product.id}">
                ${discountBadge}
                <a href="produto.html?id=${product.id}">
                    <img src="${imagePath}" alt="${product.nome}" class="product-img" loading="lazy" onerror="this.src='img/produto1.jpg'">
                </a>
                <h3 class="product-name"><a href="produto.html?id=${product.id}">${product.nome}</a></h3>
                ${product.marca ? `<span class="product-brand">${product.marca}</span>` : ''}
                <div class="product-prices">
                    ${oldPrice}
                    <span class="new-price">€${product.price.toFixed(2)}</span>
                </div>
                <button class="btn-basket" data-product-id="${product.id}">ADD TO BASKET</button>
            </article>
        `;
    }).join('');
    
    // Add event listeners
    grid.querySelectorAll('.btn-basket').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const productId = parseInt(e.target.getAttribute('data-product-id'));
            offersAddToCart(productId);
        });
    });
    
    grid.querySelectorAll('.wishlist-icon').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const productId = parseInt(e.target.getAttribute('data-product-id'));
            offersToggleWishlist(productId);
        });
    });
}

// Add to cart - renamed to avoid conflict with window.addToCart
function offersAddToCart(productId) {
    
    // Find product in allOffers
    const product = allOffers.find(p => p.id === productId);
    
    if (product) {
        // Processar imagem para garantir caminho correto
        const imagemProcessada = getOfferProductImage(product.imagem, productId);
        const offersProductData = { nome: product.nome, preco: product.preco, preco_antigo: product.preco_antigo, imagem: imagemProcessada };

        // Verificar se tem variantes
        const variants = (typeof window.extractProductVariants === 'function') ? window.extractProductVariants(product) : null;
        if (variants && typeof window.showVariantModal === 'function') {
            window.showVariantModal(product, variants, function(selectedVariant) {
                const cartData = Object.assign({}, offersProductData);
                cartData.nome = cartData.nome + ' — ' + selectedVariant;
                cartData.variant = selectedVariant;
                cartData.variantType = variants.type;
                if (typeof window.addToCart === 'function') window.addToCart(productId, 1, cartData);
            });
            return;
        }

        // Use the cart.js function if available, otherwise fallback
        if (typeof window.addToCart === 'function') {
            window.addToCart(productId, 1, offersProductData);
        } else {
            // Fallback: use localStorage directly
            let cart = JSON.parse(localStorage.getItem('cart') || '[]');
            const existingItem = cart.find(item => item.id === productId);
            
            if (existingItem) {
                existingItem.quantidade += 1;
            } else {
                cart.push({
                    id: productId,
                    nome: product.nome,
                    preco: product.preco,
                    preco_antigo: product.preco_antigo,
                    imagem: imagemProcessada,
                    quantidade: 1
                });
            }
            
            localStorage.setItem('cart', JSON.stringify(cart));
            
            // Update cart count
            const cartCountElements = document.querySelectorAll('.cart-count');
            const totalItems = cart.reduce((sum, item) => sum + item.quantidade, 0);
            cartCountElements.forEach(element => {
                element.textContent = totalItems;
            });
        }
        
        // Show feedback
        const button = document.querySelector(`.btn-basket[data-product-id="${productId}"]`);
        if (button) {
            const originalText = button.textContent;
            button.textContent = '✓ ADDED';
            button.style.background = '#00A651';
            setTimeout(() => {
                button.textContent = originalText;
                button.style.background = '';
            }, 2000);
        }
    }
}

// Toggle wishlist - use global function from main.js
function offersToggleWishlist(productId) {
    
    // Use the global toggleWishlist function from main.js if available
    if (typeof window.toggleWishlist === 'function') {
        const isNowInWishlist = window.toggleWishlist(productId);
        
        // Update the icon visually
        const icon = document.querySelector(`.wishlist-icon[data-product-id="${productId}"]`);
        if (icon) {
            if (isNowInWishlist) {
                icon.classList.add('active');
                icon.innerHTML = '&#9829;'; // filled heart
            } else {
                icon.classList.remove('active');
                icon.innerHTML = '&#9825;'; // empty heart
            }
        }
    } else {
        // Fallback: use localStorage directly (same key as main.js)
        const WISHLIST_KEY = 'sfi_wishlist';
        let wishlist = JSON.parse(localStorage.getItem(WISHLIST_KEY) || '[]');
        const index = wishlist.indexOf(productId);
        const icon = document.querySelector(`.wishlist-icon[data-product-id="${productId}"]`);
        
        if (index > -1) {
            wishlist.splice(index, 1);
            if (icon) {
                icon.classList.remove('active');
                icon.innerHTML = '&#9825;';
            }
        } else {
            wishlist.push(productId);
            if (icon) {
                icon.classList.add('active');
                icon.innerHTML = '&#9829;';
            }
        }
        
        localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
    }
}

// Search functionality
function handleSearch() {
    const searchInput = document.getElementById('busca');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        
        if (searchTerm === '') {
            displayedOffers = [...allOffers];
        } else {
            displayedOffers = allOffers.filter(product => {
                const name = (product.nome || '').toLowerCase();
                const category = (product.categoryEn || '').toLowerCase();
                const brand = (product.marca || '').toLowerCase();
                return name.includes(searchTerm) || category.includes(searchTerm) || brand.includes(searchTerm);
            });
        }
        
        renderOffers();
    });
}

// Função para esperar os dados ficarem disponíveis
function waitForData(callback, maxAttempts = 10) {
    let attempts = 0;
    
    function check() {
        attempts++;
        
        // Verificar se EMBEDDED_PRODUCTS ou PRODUTOS está disponível
        if ((Array.isArray(window.EMBEDDED_PRODUCTS) && window.EMBEDDED_PRODUCTS.length > 0) ||
            (Array.isArray(window.PRODUTOS) && window.PRODUTOS.length > 0)) {
            callback();
            return;
        }
        
        if (attempts < maxAttempts) {
            setTimeout(check, 100);
        } else {
            callback();
        }
    }
    
    check();
}

// Initialize page (script loaded with defer — DOM is ready)
// Esperar um pouco para garantir que dados-embed.js foi executado
waitForData(() => {
    loadOffers();
    handleSearch();
    
    // Sort handler - fallback for native select
    const sortSelect = document.getElementById('sortOffers');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            sortOffers(e.target.value);
        });
    }
    
    // Custom Sort Select
    initCustomOffersSortSelect();
});

// Initialize Custom Sort Select for Offers
function initCustomOffersSortSelect() {
    const wrapper = document.getElementById('sortOffersWrapper');
    const trigger = document.getElementById('sortOffersTrigger');
    const options = document.getElementById('sortOffersOptions');
    const label = document.getElementById('sortOffersLabel');
    const hiddenInput = document.getElementById('sortOffers');
    
    if (!wrapper || !trigger || !options) return;
    
    // Toggle dropdown
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        wrapper.classList.toggle('open');
    });
    
    // Select option
    options.querySelectorAll('.custom-select-option').forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const value = option.dataset.value;
            const text = option.textContent;
            
            // Update UI
            label.textContent = text;
            options.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            
            // Update hidden input
            if (hiddenInput) hiddenInput.value = value;
            
            // Close dropdown
            wrapper.classList.remove('open');
            
            // Apply sort
            sortOffers(value);
        });
    });
    
    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            wrapper.classList.remove('open');
        }
    });
}
