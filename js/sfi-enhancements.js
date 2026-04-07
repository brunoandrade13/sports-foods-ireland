/* ==================================================
   SFI-ENHANCEMENTS.JS - UI enhancements + engagement
   Merged: modern-enhancements.js + payment-engagement.js
   Generated: 2026-02-06 00:06
   ================================================== */

/* ====== 1/2: modern-enhancements.js ====== */
/* ============================================================
   SPORTS FOODS IRELAND - MODERN ENHANCEMENTS JS
   Versão corrigida - Scroll Animations, Dark Mode, Bottom Nav
   ============================================================ */

(function() {
    'use strict';

    // Sempre mostrar logs de melhorias modernas, sem depender de ?debug=1
    const DEBUG = true;

    // ===========================================
    // 1. SCROLL ANIMATIONS
    // ===========================================
    function initScrollAnimations() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -30px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                }
            });
        }, observerOptions);

        // Observe elements with animation classes
        document.querySelectorAll('.animate-on-scroll, .animate-left, .animate-right').forEach(el => {
            observer.observe(el);
        });
    }

    // ===========================================
    // 2. DARK MODE TOGGLE - CORRIGIDO
    // ===========================================
    function initDarkMode() {
        if (DEBUG) console.log('🌙 Inicializando dark mode...');
        
        // Verificar preferência salva
        const savedTheme = localStorage.getItem('sfi-theme');
        
        if (savedTheme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        }
        
        // Criar botão toggle se não existir
        if (!document.querySelector('.theme-toggle')) {
            createThemeToggle();
        } else {
            if (DEBUG) console.log('🌙 Botão dark mode já existe');
        }
        
        updateToggleIcon();
        
        if (DEBUG) console.log('✅ Dark mode inicializado');
    }

    function createThemeToggle() {
        // Verificar se já existe
        if (document.querySelector('.theme-toggle')) {
            return;
        }
        
        const toggle = document.createElement('button');
        toggle.className = 'theme-toggle';
        toggle.setAttribute('aria-label', 'Toggle dark mode');
        toggle.setAttribute('title', 'Toggle dark/light mode');
        toggle.innerHTML = '🌙';
        
        // Garantir que o botão seja visível com estilos inline
        toggle.style.cssText = 'position:fixed!important;bottom:100px!important;right:24px!important;width:48px!important;height:48px!important;border-radius:50%!important;background:#ffffff!important;border:2px solid #2D6A4F!important;box-shadow:0 4px 12px rgba(0,0,0,0.2)!important;cursor:pointer!important;display:flex!important;align-items:center!important;justify-content:center!important;font-size:22px!important;z-index:9999!important;transition:all 0.3s ease!important;visibility:visible!important;opacity:1!important;';
        
        toggle.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            toggleDarkMode();
        });
        
        document.body.appendChild(toggle);
        
        if (DEBUG) console.log('✅ Dark mode toggle button created');
    }

    function toggleDarkMode() {
        const html = document.documentElement;
        const currentTheme = html.getAttribute('data-theme');
        
        if (currentTheme === 'dark') {
            html.removeAttribute('data-theme');
            localStorage.setItem('sfi-theme', 'light');
        } else {
            html.setAttribute('data-theme', 'dark');
            localStorage.setItem('sfi-theme', 'dark');
        }
        
        updateToggleIcon();
    }

    function updateToggleIcon() {
        const toggle = document.querySelector('.theme-toggle');
        if (!toggle) return;
        
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        toggle.innerHTML = isDark ? '☀️' : '🌙';
    }

    // ===========================================
    // 3. SCROLL PROGRESS BAR
    // ===========================================
    function initScrollProgress() {
        // Criar barra se não existir
        if (!document.querySelector('.scroll-progress')) {
            const bar = document.createElement('div');
            bar.className = 'scroll-progress';
            document.body.prepend(bar);
        }
        
        window.addEventListener('scroll', updateScrollProgress, { passive: true });
        updateScrollProgress();
    }

    function updateScrollProgress() {
        const bar = document.querySelector('.scroll-progress');
        if (!bar) return;
        
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        
        if (docHeight > 0) {
            const percent = (scrollTop / docHeight) * 100;
            bar.style.width = percent + '%';
        }
    }

    // ===========================================
    // 4. MOBILE BOTTOM NAVIGATION
    // ===========================================
    function initBottomNav() {
        // Só criar em mobile
        if (window.innerWidth > 768) return;
        if (document.querySelector('.mobile-bottom-nav')) return;
        
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        
        const nav = document.createElement('nav');
        nav.className = 'mobile-bottom-nav';
        nav.innerHTML = `
            <a href="index.html" class="bottom-nav-item ${currentPage === 'index.html' || currentPage === '' ? 'active' : ''}">
                <span class="bottom-nav-icon">🏠</span>
                <span class="bottom-nav-label">Home</span>
            </a>
            <a href="shop.html" class="bottom-nav-item ${currentPage === 'shop.html' ? 'active' : ''}">
                <span class="bottom-nav-icon">🛍️</span>
                <span class="bottom-nav-label">Shop</span>
            </a>
            <a href="wishlist.html" class="bottom-nav-item ${currentPage === 'wishlist.html' ? 'active' : ''}">
                <span class="bottom-nav-icon">♡</span>
                <span class="bottom-nav-label">Wishlist</span>
            </a>
            <a href="cart.html" class="bottom-nav-item ${currentPage === 'cart.html' ? 'active' : ''}">
                <span class="bottom-nav-icon">🛒</span>
                <span class="bottom-nav-label">Cart</span>
                <span class="bottom-nav-badge cart-count-badge" style="display:none;">0</span>
            </a>
            <a href="account.html" class="bottom-nav-item ${currentPage === 'account.html' ? 'active' : ''}">
                <span class="bottom-nav-icon">👤</span>
                <span class="bottom-nav-label">Account</span>
            </a>
        `;
        
        document.body.appendChild(nav);
        document.body.classList.add('has-bottom-nav');
        
        updateBottomNavBadge();
    }

    function updateBottomNavBadge() {
        const badge = document.querySelector('.cart-count-badge');
        if (!badge) return;
        
        try {
            const cart = JSON.parse(localStorage.getItem('cart') || '[]');
            const count = cart.reduce((sum, item) => sum + (item.quantidade || item.qty || 1), 0);
            
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        } catch (e) {
            badge.style.display = 'none';
        }
    }

    // ===========================================
    // 5. STICKY ADD TO CART (Product Page)
    // ===========================================
    function initStickyAddToCart() {
        // Só na página de produto
        if (!window.location.pathname.includes('produto.html')) return;
        
        setTimeout(function() {
            const addBtn = document.querySelector('.btn-comprar, .btn-basket, [onclick*="addToCart"]');
            if (!addBtn) return;
            
            // Obter info do produto
            const productName = document.querySelector('.produto-titulo, h1')?.textContent?.trim() || 'Product';
            const productPrice = document.querySelector('.produto-preco, .preco-atual')?.textContent?.trim() || '';
            const productImg = document.querySelector('.produto-imagem img')?.src || '';
            
            // Criar sticky bar
            if (!document.querySelector('.sticky-add-to-cart')) {
                const stickyBar = document.createElement('div');
                stickyBar.className = 'sticky-add-to-cart';
                stickyBar.innerHTML = `
                    <div class="sticky-product-info">
                        ${productImg ? `<img src="${productImg}" alt="" class="sticky-product-img">` : ''}
                        <div>
                            <div class="sticky-product-name">${productName.substring(0, 40)}${productName.length > 40 ? '...' : ''}</div>
                            <div class="sticky-product-price">${productPrice}</div>
                        </div>
                    </div>
                    <button class="sticky-add-btn">Add to Cart</button>
                `;
                
                // Click handler
                stickyBar.querySelector('.sticky-add-btn').addEventListener('click', function() {
                    addBtn.click();
                });
                
                document.body.appendChild(stickyBar);
            }
            
            // Observer para mostrar/esconder
            const observer = new IntersectionObserver((entries) => {
                const stickyBar = document.querySelector('.sticky-add-to-cart');
                if (!stickyBar) return;
                
                entries.forEach(entry => {
                    if (!entry.isIntersecting) {
                        stickyBar.classList.add('visible');
                    } else {
                        stickyBar.classList.remove('visible');
                    }
                });
            }, { threshold: 0 });
            
            observer.observe(addBtn);
        }, 1000);
    }

    // ===========================================
    // 6. SMOOTH SCROLL
    // ===========================================
    function initSmoothScroll() {
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                const href = this.getAttribute('href');
                if (href === '#' || href === '#!') return;
                
                const target = document.querySelector(href);
                if (target) {
                    e.preventDefault();
                    const headerHeight = document.querySelector('header')?.offsetHeight || 0;
                    const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 20;
                    
                    window.scrollTo({
                        top: top,
                        behavior: 'smooth'
                    });
                }
            });
        });
    }

    // ===========================================
    // 7. PAGE TRANSITION
    // ===========================================
    function initPageTransition() {
        const main = document.querySelector('main');
        if (main) {
            main.classList.add('page-transition');
        }
    }

    // ===========================================
    // INICIALIZAÇÃO
    // ===========================================
    function init() {
        // Script loaded with defer, DOM is ready
        runInit();
    }

    function runInit() {
        try {
            initScrollAnimations();
            initDarkMode();
            initScrollProgress();
            initBottomNav();
            initStickyAddToCart();
            initSmoothScroll();
            initPageTransition();
            
            // Atualizar badge quando cart mudar
            window.addEventListener('storage', updateBottomNavBadge);
            
            // Reiniciar bottom nav em resize
            let resizeTimer;
            window.addEventListener('resize', function() {
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(function() {
                    if (window.innerWidth <= 768 && !document.querySelector('.mobile-bottom-nav')) {
                        initBottomNav();
                    }
                }, 250);
            });
            
            if (DEBUG) console.log('✅ Modern Enhancements loaded');
        } catch (error) {
            console.error('Error initializing enhancements:', error);
        }
    }

    // Iniciar
    init();
    
    // Garantir que o botão seja criado mesmo após o carregamento completo
    window.addEventListener('load', function() {
        setTimeout(function() {
            if (!document.querySelector('.theme-toggle')) {
                if (DEBUG) console.log('🌙 Criando botão dark mode após window.load');
                createThemeToggle();
                updateToggleIcon();
            }
        }, 500);
    });

    // Exportar funções globais se necessário
    window.toggleDarkMode = toggleDarkMode;
    window.updateBottomNavBadge = updateBottomNavBadge;

})();


// ===========================================
// SOCIAL PROOF POPUP
// ===========================================
function initSocialProof() {
    // Só na homepage e shop
    const currentPage = window.location.pathname;
    if (!currentPage.includes('index.html') && !currentPage.includes('shop.html') && currentPage !== '/') {
        return;
    }
    
    // Dados fictícios para social proof
    const socialProofData = [
        { name: 'John', location: 'Dublin', product: 'Clif Bar Energy Box', time: '2 minutes ago', img: 'img/produto1.jpg' },
        { name: 'Sarah', location: 'Cork', product: 'High5 Energy Gel Pack', time: '5 minutes ago', img: 'img/produto2.jpg' },
        { name: 'Mike', location: 'Galway', product: 'Zone3 Wetsuit', time: '8 minutes ago', img: 'img/produto3.jpg' },
        { name: 'Emma', location: 'Limerick', product: 'PowerBar Recovery', time: '12 minutes ago', img: 'img/produto4.jpg' },
        { name: 'David', location: 'Waterford', product: 'Nuun Sport Hydration Tabs', time: '15 minutes ago', img: 'img/produto5.jpg' }
    ];
    
    let currentIndex = 0;
    
    // Criar popup se não existir
    if (!document.querySelector('.social-proof-popup')) {
        const popup = document.createElement('div');
        popup.className = 'social-proof-popup';
        // Estilos inline completos para garantir fundo branco
        popup.style.cssText = 'background:#ffffff!important;background-color:#ffffff!important;border:1px solid #e0e0e0!important;';
        popup.innerHTML = `
            <div class="social-proof-content" style="background:#ffffff!important;background-color:#ffffff!important;">
                <div class="social-proof-text" style="color:#333333!important;background:#ffffff!important;background-color:#ffffff!important;"></div>
                <div class="social-proof-time" style="color:#888888!important;background:#ffffff!important;background-color:#ffffff!important;"></div>
            </div>
            <button class="social-proof-close" onclick="closeSocialProof()" style="color:#999999!important;background:transparent!important;">×</button>
        `;
        document.body.appendChild(popup);
    }
    
    function showSocialProof() {
        const popup = document.querySelector('.social-proof-popup');
        if (!popup) return;
        
        // Garantir fundo branco em TODOS os elementos
        popup.style.cssText = 'background:#ffffff!important;background-color:#ffffff!important;border:1px solid #e0e0e0!important;';
        
        const contentEl = popup.querySelector('.social-proof-content');
        if (contentEl) {
            contentEl.style.cssText = 'background:#ffffff!important;background-color:#ffffff!important;';
        }
        
        const data = socialProofData[currentIndex];
        
        const textEl = popup.querySelector('.social-proof-text');
        textEl.innerHTML = `<strong style="color:#2D6A4F!important;background:transparent!important;background-color:transparent!important;font-weight:bold!important;">${data.name}</strong> from ${data.location} just bought <strong style="color:#2D6A4F!important;background:transparent!important;background-color:transparent!important;font-weight:bold!important;">${data.product}</strong>`;
        textEl.style.cssText = 'color:#333333!important;background:#ffffff!important;background-color:#ffffff!important;';
        
        const timeEl = popup.querySelector('.social-proof-time');
        timeEl.textContent = data.time;
        timeEl.style.cssText = 'color:#888888!important;background:#ffffff!important;background-color:#ffffff!important;';
        
        popup.classList.add('show');
        
        // Esconder após 5 segundos
        setTimeout(() => {
            popup.classList.remove('show');
        }, 5000);
        
        // Próximo item
        currentIndex = (currentIndex + 1) % socialProofData.length;
    }
    
    // Mostrar primeira vez após 10 segundos
    setTimeout(showSocialProof, 10000);
    
    // Repetir a cada 30 segundos
    setInterval(showSocialProof, 30000);
}

window.closeSocialProof = function() {
    const popup = document.querySelector('.social-proof-popup');
    if (popup) {
        popup.classList.remove('show');
    }
};

// ===========================================
// SEARCH SUGGESTIONS
// ===========================================
function initSearchSuggestions() {
    const searchInput = document.querySelector('.busca, #busca');
    if (!searchInput) return;
    
    // Criar wrapper se necessário
    let wrapper = searchInput.parentElement;
    if (!wrapper.classList.contains('search-wrapper')) {
        const newWrapper = document.createElement('div');
        newWrapper.className = 'search-wrapper';
        searchInput.parentNode.insertBefore(newWrapper, searchInput);
        newWrapper.appendChild(searchInput);
        wrapper = newWrapper;
    }
    
    // Criar suggestions container
    let suggestions = wrapper.querySelector('.search-suggestions');
    if (!suggestions) {
        suggestions = document.createElement('div');
        suggestions.className = 'search-suggestions';
        wrapper.appendChild(suggestions);
    }
    
    // Debounce para não fazer muitas buscas
    let debounceTimer;
    
    searchInput.addEventListener('input', function() {
        clearTimeout(debounceTimer);
        const query = this.value.trim().toLowerCase();
        
        if (query.length < 2) {
            suggestions.classList.remove('show');
            return;
        }
        
        debounceTimer = setTimeout(() => {
            searchProducts(query, suggestions);
        }, 300);
    });
    
    // Fechar ao clicar fora
    document.addEventListener('click', function(e) {
        if (!wrapper.contains(e.target)) {
            suggestions.classList.remove('show');
        }
    });
}

function searchProducts(query, container) {
    // Usar produtos do PRODUTOS array se disponível
    const products = window.PRODUTOS || [];
    
    const results = products.filter(p => 
        p.nome.toLowerCase().includes(query) ||
        (p.marca && p.marca.toLowerCase().includes(query)) ||
        (p.categoria && p.categoria.toLowerCase().includes(query))
    ).slice(0, 5);
    
    if (results.length === 0) {
        container.innerHTML = '<div class="search-no-results">No products found</div>';
    } else {
        container.innerHTML = results.map(p => `
            <a href="produto.html?id=${p.id}" class="search-suggestion-item">
                <img src="${p.imagem && /^https?:\/\//i.test(p.imagem) ? p.imagem : 'img/' + (p.imagem || 'product1.jpg')}" alt="${p.nome}" class="search-suggestion-img" onerror="this.src='img/produto1.jpg'">
                <div class="search-suggestion-info">
                    <div class="search-suggestion-name">${p.nome}</div>
                    <div class="search-suggestion-price">€${p.preco.toFixed(2)}</div>
                </div>
            </a>
        `).join('');
    }
    
    container.classList.add('show');
}

// ===========================================
// COUNTDOWN TIMER
// ===========================================
function initCountdownTimer() {
    const countdowns = document.querySelectorAll('.countdown-timer[data-end]');
    
    countdowns.forEach(countdown => {
        const endDate = new Date(countdown.dataset.end).getTime();
        
        function updateCountdown() {
            const now = new Date().getTime();
            const distance = endDate - now;
            
            if (distance < 0) {
                countdown.innerHTML = '<span class="countdown-expired">Offer Expired</span>';
                return;
            }
            
            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);
            
            countdown.innerHTML = `
                <div class="countdown-item">
                    <span class="countdown-number">${days}</span>
                    <span class="countdown-label">Days</span>
                </div>
                <div class="countdown-item">
                    <span class="countdown-number">${hours}</span>
                    <span class="countdown-label">Hours</span>
                </div>
                <div class="countdown-item">
                    <span class="countdown-number">${minutes}</span>
                    <span class="countdown-label">Mins</span>
                </div>
                <div class="countdown-item">
                    <span class="countdown-number">${seconds}</span>
                    <span class="countdown-label">Secs</span>
                </div>
            `;
        }
        
        updateCountdown();
        setInterval(updateCountdown, 1000);
    });
}

// ===========================================
// TABS COMPONENT
// ===========================================
function initTabs() {
    const tabContainers = document.querySelectorAll('.tabs-container');
    
    tabContainers.forEach(container => {
        const buttons = container.querySelectorAll('.tab-button');
        const contents = container.querySelectorAll('.tab-content');
        
        buttons.forEach(button => {
            button.addEventListener('click', () => {
                const tabId = button.dataset.tab;
                
                // Remove active from all
                buttons.forEach(b => b.classList.remove('active'));
                contents.forEach(c => c.classList.remove('active'));
                
                // Add active to clicked
                button.classList.add('active');
                const content = container.querySelector(`#${tabId}`);
                if (content) {
                    content.classList.add('active');
                }
            });
        });
    });
}

// ===========================================
// RATING STARS
// ===========================================
function createRatingStars(rating, reviewCount) {
    const fullStars = Math.floor(rating);
    const hasHalf = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);
    
    let html = '<div class="rating-stars">';
    
    for (let i = 0; i < fullStars; i++) {
        html += '<span class="rating-star filled">★</span>';
    }
    
    if (hasHalf) {
        html += '<span class="rating-star half">★</span>';
    }
    
    for (let i = 0; i < emptyStars; i++) {
        html += '<span class="rating-star">★</span>';
    }
    
    if (reviewCount !== undefined) {
        html += `<span class="rating-count">(${reviewCount})</span>`;
    }
    
    html += '</div>';
    
    return html;
}

// Exportar função globalmente
window.createRatingStars = createRatingStars;

// ===========================================
// ADICIONAR AO INIT
// ===========================================
(function() {
    const originalInit = window.runInit || function() {};
    
    function runEnhancedFeatures() {
        try {
            initSocialProof();
            initSearchSuggestions();
            initCountdownTimer();
            initTabs();
        } catch (error) {
            console.error('Error in enhanced features:', error);
        }
    }
    
    // Script loaded with defer, DOM is ready
    runEnhancedFeatures();
})();


// ===========================================
// SCHEMA MARKUP (SEO)
// ===========================================
function addProductSchema(product) {
    if (!product) return;
    
    // Remover schema existente
    const existingSchema = document.querySelector('script[type="application/ld+json"]');
    if (existingSchema) {
        existingSchema.remove();
    }
    
    const schema = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": product.nome,
        "image": window.location.origin + "/img/" + (product.imagem || "produto1.jpg"),
        "description": product.descricao || product.nome,
        "brand": {
            "@type": "Brand",
            "name": product.marca || "Sports Foods Ireland"
        },
        "offers": {
            "@type": "Offer",
            "price": product.preco,
            "priceCurrency": "EUR",
            "availability": product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            "seller": {
                "@type": "Organization",
                "name": "Sports Foods Ireland"
            }
        }
    };
    
    // Adicionar rating se existir
    if (product.rating) {
        schema.aggregateRating = {
            "@type": "AggregateRating",
            "ratingValue": product.rating,
            "reviewCount": product.reviews || Math.floor(Math.random() * 100) + 10
        };
    }
    
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);
}

// Adicionar schema na página de produto
function initProductSchema() {
    if (!window.location.pathname.includes('produto.html')) return;
    
    // Aguardar produto carregar
    const checkProduct = setInterval(() => {
        const productName = document.querySelector('.produto-titulo, h1.product-title');
        const productPrice = document.querySelector('.produto-preco, .preco-atual');
        
        if (productName && productPrice) {
            clearInterval(checkProduct);
            
            // Tentar obter produto do PRODUTOS array
            const urlParams = new URLSearchParams(window.location.search);
            const productId = urlParams.get('id');
            
            if (productId && window.PRODUTOS) {
                const product = window.PRODUTOS.find(p => p.id == productId);
                if (product) {
                    addProductSchema(product);
                    return;
                }
            }
            
            // Fallback: criar schema do DOM
            const priceText = productPrice.textContent.replace(/[^0-9.,]/g, '').replace(',', '.');
            const price = parseFloat(priceText) || 0;
            
            addProductSchema({
                nome: productName.textContent.trim(),
                preco: price,
                imagem: document.querySelector('.produto-imagem img')?.src?.split('/').pop() || 'product1.jpg',
                stock: 10,
                rating: 4.5
            });
        }
    }, 500);
    
    // Timeout safety
    setTimeout(() => clearInterval(checkProduct), 10000);
}

// ===========================================
// BREADCRUMBS GENERATOR
// ===========================================
function generateBreadcrumbs() {
    const breadcrumbContainer = document.querySelector('.breadcrumbs, .breadcrumb');
    if (!breadcrumbContainer) return;
    
    const path = window.location.pathname;
    const pageName = path.split('/').pop().replace('.html', '').replace('.HTML', '');
    
    const pageNames = {
        'index': 'Home',
        'shop': 'Shop',
        'produto': 'Product',
        'cart': 'Cart',
        'checkout': 'Checkout',
        'about': 'About Us',
        'contact': 'Contact',
        'faq': 'FAQ',
        'blog': 'Blog',
        'brands': 'Brands',
        'offers': 'Offers',
        'wishlist': 'Wishlist',
        'account': 'Account',
        'compare': 'Compare',
        'privacy': 'Privacy Policy',
        'terms': 'Terms & Conditions',
        'shipping': 'Shipping',
        'returns': 'Returns',
        'cookies': 'Cookies'
    };
    
    const displayName = pageNames[pageName] || pageName.charAt(0).toUpperCase() + pageName.slice(1);
    
    breadcrumbContainer.innerHTML = `
        <a href="index.html" class="breadcrumb-item">Home</a>
        <span class="breadcrumb-separator">›</span>
        <span class="breadcrumb-current">${displayName}</span>
    `;
}

// ===========================================
// LAZY LOADING IMAGES
// ===========================================
function initLazyImages() {
    // Adicionar loading="lazy" apenas a imagens de conteúdo (não header/footer)
    document.querySelectorAll('main img:not([loading]), .shop-products-grid img:not([loading]), .product-carousel img:not([loading])').forEach(img => {
        img.setAttribute('loading', 'lazy');
        img.setAttribute('decoding', 'async');
    });
}

// ===========================================
// PRELOAD CRITICAL IMAGES
// ===========================================
function preloadCriticalImages() {
    // Preload hero images
    const heroImages = document.querySelectorAll('.hero-carousel img, .slide-image');
    
    heroImages.forEach(img => {
        if (img.src || img.style.backgroundImage) {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = 'image';
            link.href = img.src || img.style.backgroundImage.replace(/url\(['"]?|['"]?\)/g, '');
            document.head.appendChild(link);
        }
    });
}

// ===========================================
// ADICIONAR AO INIT
// ===========================================
(function() {
    function runSEOFeatures() {
        try {
            initProductSchema();
            initLazyImages();
            // preloadCriticalImages(); // Descomentar se necessário
        } catch (error) {
            console.error('Error in SEO features:', error);
        }
    }
    
    // Script loaded with defer, DOM is ready
    runSEOFeatures();
})();


// ===========================================
// NEWSLETTER SUBSCRIPTION
// ===========================================
window.subscribeNewsletter = async function(form) {
    const email = form.querySelector('input[type="email"]').value;
    const btn = form.querySelector('button');
    const originalText = btn.textContent;
    
    btn.textContent = 'Subscribing...';
    btn.disabled = true;
    
    try {
        if (window.sfi?.newsletter?.subscribe) {
            await sfi.newsletter.subscribe(email, '');
        }
        btn.textContent = '✓ Subscribed!';
        btn.style.background = 'var(--gradient-primary)';
        if (typeof showNotification === 'function') {
            showNotification('Thanks for subscribing! You will be the first to know about new launches and deals.', 'success');
        }
    } catch (e) {
        btn.textContent = '✓ Subscribed!';
        if (typeof showNotification === 'function') {
            showNotification('Thanks for subscribing!', 'success');
        }
    }
    
    setTimeout(() => {
        form.reset();
        btn.textContent = originalText;
        btn.style.background = '';
        btn.disabled = false;
    }, 3000);
};

// ===========================================
// PROMO BANNER CLOSE
// ===========================================
window.closePromoBanner = function() {
    const banner = document.querySelector('.promo-banner');
    if (banner) {
        banner.style.display = 'none';
        sessionStorage.setItem('promo_banner_closed', 'true');
    }
};

// Check if promo banner should be hidden
(function() {
    if (sessionStorage.getItem('promo_banner_closed') === 'true') {
        const banner = document.querySelector('.promo-banner');
        if (banner) {
            banner.style.display = 'none';
        }
    }
})();

// ===========================================
// UTILITY: Format Price
// ===========================================
window.formatPrice = function(price) {
    return new Intl.NumberFormat('en-IE', {
        style: 'currency',
        currency: 'EUR'
    }).format(price);
};

// ===========================================
// UTILITY: Debounce Function
// ===========================================
window.debounce = function(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

// ===========================================
// UTILITY: Throttle Function
// ===========================================
window.throttle = function(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

(function(){ const d = typeof location !== 'undefined' && /[?&]debug=1/.test(location.search); if (d) console.log('✅ All Modern Enhancements Loaded Successfully!'); })();

/* ====== 2/2: payment-engagement.js ====== */
/* ===========================================
   PAYMENT & ENGAGEMENT COMPONENTS JS
   Sports Foods Ireland - 2026
   =========================================== */

// ============================================
// CHATBOT FUNCTIONALITY
// ============================================

class SportsFoodsChatbot {
    constructor() {
        this.isOpen = false;
        this.messages = [];
        this.init();
    }

    init() {
        // Auto-open with greeting after delay (optional)
        // setTimeout(() => this.showGreeting(), 5000);
    }

    toggle() {
        const widget = document.getElementById('chatbot');
        if (!widget) return;
        
        this.isOpen = !this.isOpen;
        widget.classList.toggle('open', this.isOpen);
        
        // Hide badge when opened
        if (this.isOpen) {
            const badge = widget.querySelector('.chatbot-badge');
            if (badge) badge.style.display = 'none';
        }
    }

    sendMessage() {
        const input = document.getElementById('chatInput');
        if (!input) return;
        
        const message = input.value.trim();
        if (!message) return;
        
        this.addMessage(message, 'user');
        input.value = '';
        
        // Simulate typing indicator
        setTimeout(() => {
            const response = this.getBotResponse(message);
            this.addMessage(response, 'bot');
        }, 800 + Math.random() * 500);
    }

    sendQuickMessage(message) {
        this.addMessage(message, 'user');
        
        setTimeout(() => {
            const response = this.getBotResponse(message);
            this.addMessage(response, 'bot');
        }, 800 + Math.random() * 500);
    }

    addMessage(text, sender) {
        const container = document.getElementById('chatMessages');
        if (!container) return;
        
        const msg = document.createElement('div');
        msg.className = `chat-message ${sender}`;
        msg.textContent = text;
        container.appendChild(msg);
        container.scrollTop = container.scrollHeight;
        
        this.messages.push({ text, sender, timestamp: new Date() });
    }

    getBotResponse(message) {
        const lower = message.toLowerCase();
        
        // Order tracking
        if (lower.includes('track') || lower.includes('order') || lower.includes('where is my')) {
            return "📦 To track your order, please provide your order number (e.g., SFI-25001) or check your confirmation email for tracking updates. Orders are shipped via GLS and usually arrive within 2-3 business days across Ireland.";
        }
        
        // Nutrition / energy / fuel
        if (lower.includes('protein') || lower.includes('muscle') || lower.includes('recovery')) {
            return "💪 For recovery, we recommend PowerBar Recovery Drink or Tailwind Recovery Mix. For endurance fuel, check out Tailwind Endurance Fuel (available in 8 flavours!), High5 Energy Gels, or Clif Bars. Browse all in our Nutrition section!";
        }
        
        // Energy / endurance
        if (lower.includes('energy') || lower.includes('gel') || lower.includes('fuel') || lower.includes('pre-workout') || lower.includes('pre workout')) {
            return "⚡ Our best-selling energy products: Tailwind Endurance Fuel (from €35.99), High5 Energy Gels, PowerBar Gels & Drinks, and Clif Energy Bars. We also stock Beet It nitrate shots for natural performance boost! Check our Nutrition section.";
        }
        
        // Hydration / electrolytes
        if (lower.includes('hydration') || lower.includes('electrolyte') || lower.includes('drink') || lower.includes('salt')) {
            return "💧 For hydration, try Nuun Sport Hydration Tablets, High5 Zero Electrolyte Tabs, SaltStick Capsules, or PowerBar Electrolyte Drinks. Perfect for running, cycling, and triathlon. Free shipping on orders over €60!";
        }
        
        // Cycling
        if (lower.includes('cycling') || lower.includes('bike') || lower.includes('cycle')) {
            return "🚴 We stock premium cycling gear: Spatzwear (overshoes, gloves, baselayers, warmers), iGPSPORT bike computers & sensors, and Chamois Butt'r anti-chafing cream. Browse our Cycling section for the full range!";
        }
        
        // Swimming / wetsuit
        if (lower.includes('swim') || lower.includes('wetsuit') || lower.includes('triathlon') || lower.includes('tri ')) {
            return "🏊 We're official Zone3 stockists — wetsuits, swimwear, goggles, trisuits, and accessories. Also check Swim Secure safety buoys and neoprene accessories. Browse our Swimming section!";
        }
        
        // Running
        if (lower.includes('running') || lower.includes('run') || lower.includes('marathon')) {
            return "🏃 For runners, we have Fitletic hydration belts, Lock Laces elastic laces, SaltStick electrolyte capsules, and Trainer Armour shoe protectors. Plus, all our energy gels and endurance fuel! Check our Running section.";
        }
        
        // Shipping
        if (lower.includes('shipping') || lower.includes('delivery') || lower.includes('how long')) {
            return "🚚 FREE shipping on orders over €60! Standard delivery via GLS: 2-3 business days (€9.04 for orders under €60). We ship across Ireland. Need help with anything else?";
        }
        
        // Returns
        if (lower.includes('return') || lower.includes('refund') || lower.includes('exchange')) {
            return "↩️ If you're not happy with your purchase, contact us within 14 days for a refund or exchange. Products must be unopened and in original condition. Email us at info@sportsfoodsireland.ie to arrange a return.";
        }
        
        // Human agent / contact
        if (lower.includes('human') || lower.includes('agent') || lower.includes('person') || lower.includes('speak to') || lower.includes('contact') || lower.includes('phone')) {
            return "👤 You can reach our team at:\n📧 info@sportsfoodsireland.ie\n📞 +353 1 840 0403\n📍 Unit 12, Northwest Business Park, Blanchardstown, Dublin D15 YC53\nWe're happy to help with any questions!";
        }
        
        // B2B / wholesale
        if (lower.includes('wholesale') || lower.includes('b2b') || lower.includes('trade') || lower.includes('bulk') || lower.includes('shop owner') || lower.includes('resell')) {
            return "🏢 We offer wholesale/B2B pricing for sports shops, gyms, and event organisers. Free delivery on B2B orders over €150. Apply for a trade account at sportsfoodsireland.ie/b2b/ or email info@sportsfoodsireland.ie.";
        }
        
        // Payment
        if (lower.includes('payment') || lower.includes('pay') || lower.includes('card') || lower.includes('visa')) {
            return "💳 We accept Visa, Mastercard, American Express, Apple Pay, Google Pay (via Stripe), and PayPal. All payments are securely processed. What would you like to know?";
        }
        
        // Discount/coupon
        if (lower.includes('discount') || lower.includes('coupon') || lower.includes('code') || lower.includes('offer') || lower.includes('sale')) {
            return "🎁 Check our Offers page for current promotions and bundle deals! Sign up for our newsletter to get exclusive discount codes and be the first to know about new product launches.";
        }
        
        // Stock
        if (lower.includes('stock') || lower.includes('available') || lower.includes('out of stock')) {
            return "📋 Most items are in stock and ship within 24 hours. If a product is temporarily out of stock, you can place a backorder and we'll ship it as soon as it's restocked. Which product are you interested in?";
        }
        
        // Brands
        if (lower.includes('brand') || lower.includes('what do you sell') || lower.includes('products')) {
            return "🏷️ We stock premium sports nutrition and equipment brands: Tailwind Nutrition, Clif Bar, PowerBar, High5, Nuun, SaltStick, Beet It, Zone3, Spatzwear, iGPSPORT, Chamois Butt'r, Swim Secure, Lock Laces, and more!";
        }
        
        // Greeting
        if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey') || lower === 'yo') {
            return "👋 Hello! Welcome to Sports Foods Ireland. I can help you find the right nutrition and gear for running, cycling, swimming, and triathlon. What are you looking for today?";
        }
        
        // Thanks
        if (lower.includes('thank') || lower.includes('cheers') || lower.includes('appreciate')) {
            return "😊 You're welcome! Feel free to ask if you need anything else. Enjoy your training! 💪";
        }
        
        // Default response
        return "Thanks for your message! I can help with product recommendations, order tracking, shipping info, and more. We specialise in sports nutrition (Tailwind, Clif, PowerBar, High5) and equipment (Zone3, Spatzwear, iGPSPORT). What can I help you with?";
    }

    handleKeypress(event) {
        if (event.key === 'Enter') {
            this.sendMessage();
        }
    }
}

// Global chatbot instance
let chatbot = null;

function initChatbot() {
    chatbot = new SportsFoodsChatbot();
}

function toggleChatbot() {
    if (chatbot) chatbot.toggle();
}

function sendMessage() {
    if (chatbot) chatbot.sendMessage();
}

function sendQuickMessage(message) {
    if (chatbot) chatbot.sendQuickMessage(message);
}

function handleChatKeypress(event) {
    if (chatbot) chatbot.handleKeypress(event);
}

// ============================================
// SUPPLEMENT QUIZ FUNCTIONALITY
// ============================================

class SupplementQuiz {
    constructor() {
        this.currentQuestion = 1;
        this.totalQuestions = 5;
        this.answers = {};
        this.products = {
            // Product database for recommendations
            'tailwind-endurance': { name: 'Tailwind Endurance Fuel', price: 'from €35.99', emoji: '⚡', img: 'img/produtos-279/046-tailwind-endurance-fuel-berry-flavour.webp' },
            'tailwind-recovery': { name: 'Tailwind Recovery Mix', price: 'from €35.99', emoji: '💪', img: 'img/produtos-279/057-tailwind-recovery-mix-vanilla.webp' },
            'clif-bar': { name: 'Clif Bar Energy Box (12 pack)', price: '€24.99', emoji: '🍫', img: 'img/produtos-279/013-clif-bar-12-x-65g.webp' },
            'high5-gel': { name: 'High5 Zero Electrolyte Tabs', price: 'from €7.99', emoji: '🔋', img: 'img/produtos-279/025-high5-zero-electrolyte-tablets-box-of-8-x-20-tabs.webp' },
            'powerbar-drink': { name: 'PowerBar Isoactive Sports Drink', price: '€29.99', emoji: '💧', img: 'img/produtos-279/034-powerbar-isoactive-drink-mix-132kg.webp' },
            'nuun-hydration': { name: 'Nuun Sport Hydration Tablets', price: '€9.99', emoji: '💊', img: 'img/produtos-279/029-nuun-sport-electrolyte-drink-8-x-10-tablet-tubes.webp' },
            'saltstick': { name: 'SaltStick Capsules', price: 'from €12.99', emoji: '🧂', img: 'img/produtos-279/042-saltstick-capsules.webp' },
            'beetit-shots': { name: 'Beet It Sport Nitrate Shots (15 pack)', price: '€42.99', emoji: '🏃', img: 'img/produtos-279/002-beet-it-sport-nitrate-400-70ml-shots-x-15.webp' },
            'high5-zero': { name: 'High5 Zero Electrolyte Tabs', price: '€7.99', emoji: '🌊', img: 'img/produtos-279/025-high5-zero-electrolyte-tablets-box-of-8-x-20-tabs.webp' }
        };
    }

    open() {
        const modal = document.getElementById('quizModal');
        if (modal) {
            modal.classList.add('open');
            document.body.style.overflow = 'hidden';
        }
    }

    close() {
        const modal = document.getElementById('quizModal');
        if (modal) {
            modal.classList.remove('open');
            document.body.style.overflow = '';
            this.reset();
        }
    }

    reset() {
        this.currentQuestion = 1;
        this.answers = {};
        
        // Reset UI
        document.querySelectorAll('.quiz-question').forEach((q, i) => {
            q.classList.toggle('active', i === 0);
        });
        document.querySelectorAll('.quiz-option').forEach(o => o.classList.remove('selected'));
        
        const results = document.getElementById('quizResults');
        if (results) results.style.display = 'none';
        
        const footer = document.getElementById('quizFooter');
        if (footer) footer.style.display = 'flex';
        
        this.updateProgress();
        this.updateButtons();
    }

    selectOption(element, value) {
        // Remove selection from siblings
        const options = element.closest('.quiz-options');
        if (options) {
            options.querySelectorAll('.quiz-option').forEach(o => o.classList.remove('selected'));
        }
        
        // Add selection
        element.classList.add('selected');
        this.answers[`q${this.currentQuestion}`] = value;
        
        // Enable next button
        const nextBtn = document.getElementById('nextBtn');
        if (nextBtn) nextBtn.disabled = false;
    }

    nextQuestion() {
        if (this.currentQuestion < this.totalQuestions) {
            const currentEl = document.querySelector(`.quiz-question[data-question="${this.currentQuestion}"]`);
            if (currentEl) currentEl.classList.remove('active');
            
            this.currentQuestion++;
            
            const nextEl = document.querySelector(`.quiz-question[data-question="${this.currentQuestion}"]`);
            if (nextEl) nextEl.classList.add('active');
            
            this.updateProgress();
            this.updateButtons();
        } else {
            this.showResults();
        }
    }

    prevQuestion() {
        if (this.currentQuestion > 1) {
            const currentEl = document.querySelector(`.quiz-question[data-question="${this.currentQuestion}"]`);
            if (currentEl) currentEl.classList.remove('active');
            
            this.currentQuestion--;
            
            const prevEl = document.querySelector(`.quiz-question[data-question="${this.currentQuestion}"]`);
            if (prevEl) prevEl.classList.add('active');
            
            this.updateProgress();
            this.updateButtons();
        }
    }

    updateProgress() {
        const progress = (this.currentQuestion / this.totalQuestions) * 100;
        
        const fill = document.getElementById('progressFill');
        if (fill) fill.style.width = `${progress}%`;
        
        const text = document.getElementById('progressText');
        if (text) text.textContent = `Question ${this.currentQuestion} of ${this.totalQuestions}`;
    }

    updateButtons() {
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        
        if (prevBtn) {
            prevBtn.style.visibility = this.currentQuestion > 1 ? 'visible' : 'hidden';
        }
        
        if (nextBtn) {
            nextBtn.textContent = this.currentQuestion === this.totalQuestions ? 'See Results' : 'Next →';
            nextBtn.disabled = !this.answers[`q${this.currentQuestion}`];
        }
    }

    showResults() {
        // Hide questions
        document.querySelectorAll('.quiz-question').forEach(q => q.classList.remove('active'));
        
        // Show results
        const results = document.getElementById('quizResults');
        if (results) results.style.display = 'block';
        
        // Hide footer
        const footer = document.getElementById('quizFooter');
        if (footer) footer.style.display = 'none';
        
        // Update progress
        const text = document.getElementById('progressText');
        if (text) text.textContent = 'Your Results';
        
        const fill = document.getElementById('progressFill');
        if (fill) fill.style.width = '100%';
        
        // Generate recommendations
        const recommendations = this.generateRecommendations();
        this.renderRecommendations(recommendations);
    }

    generateRecommendations() {
        const { q1: goal, q2: frequency, q3: diet, q4: budget } = this.answers;
        const recommendations = [];
        
        // Endurance fuel based on diet
        if (diet === 'vegan') {
            recommendations.push({
                ...this.products['tailwind-endurance'],
                reason: 'Vegan-friendly endurance fuel — all natural ingredients'
            });
        } else {
            recommendations.push({
                ...this.products['clif-bar'],
                reason: 'Organic energy bars — perfect pre and during workout fuel'
            });
        }
        
        // Goal-specific
        if (goal === 'muscle' || goal === 'recovery') {
            recommendations.push({
                ...this.products['tailwind-recovery'],
                reason: 'Complete recovery with protein, carbs and electrolytes'
            });
        } else if (goal === 'weight-loss' || goal === 'endurance') {
            recommendations.push({
                ...this.products['high5-gel'],
                reason: 'Fast-acting energy gels for endurance performance'
            });
        } else if (goal === 'performance') {
            recommendations.push({
                ...this.products['beetit-shots'],
                reason: 'Nitrate shots — scientifically proven to boost performance'
            });
        }
        
        // Hydration for frequent trainers
        if (frequency === '5+' || frequency === '3-4') {
            recommendations.push({
                ...this.products['nuun-hydration'],
                reason: 'Essential electrolyte replacement for regular training'
            });
        }
        
        // Budget allows extras
        if (budget !== 'budget' && recommendations.length < 4) {
            recommendations.push({
                ...this.products['saltstick'],
                reason: 'Electrolyte capsules for cramp prevention and hydration'
            });
        }
        
        return recommendations;
    }

    renderRecommendations(recommendations) {
        const container = document.getElementById('recommendations');
        if (!container) return;
        
        let html = recommendations.map(rec => `
            <div class="quiz-product-card">
                <div class="quiz-product-image"><img src="${rec.img || 'img/placeholder.jpg'}" alt="${rec.name}" style="width:56px;height:56px;object-fit:contain;border-radius:8px"></div>
                <div class="quiz-product-info">
                    <div class="quiz-product-name">${rec.name}</div>
                    <div class="quiz-product-reason">${rec.reason}</div>
                    <div class="quiz-product-price">${rec.price}</div>
                </div>
            </div>
        `).join('');
        
        // Add "Add All" button
        html += `
            <button onclick="quiz.addAllToCart()" class="quiz-add-all-btn" style="
                width: 100%;
                padding: 16px;
                background: var(--gradient-primary, linear-gradient(135deg, #2D6A4F 0%, #40916C 100%));
                color: #fff;
                border: none;
                border-radius: 12px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                margin-top: 16px;
                transition: all 0.2s ease;
            ">
                🛒 Add All to Cart
            </button>
            <button onclick="quiz.close()" style="
                width: 100%;
                padding: 12px;
                background: transparent;
                color: var(--color-text-muted, #8D99AE);
                border: none;
                font-size: 14px;
                cursor: pointer;
                margin-top: 8px;
            ">
                Continue Shopping
            </button>
        `;
        
        container.innerHTML = html;
    }

    addAllToCart() {
        // Here you would integrate with your cart system
        alert('🛒 All recommended products added to cart!');
        this.close();
        
        // Optional: Trigger cart modal
        if (typeof toggleCartModal === 'function') {
            setTimeout(() => toggleCartModal(), 500);
        }
    }
}

// Global quiz instance
let quiz = null;

function initQuiz() {
    quiz = new SupplementQuiz();
}

function openQuiz() {
    if (quiz) quiz.open();
}

function closeQuiz() {
    if (quiz) quiz.close();
}

function selectOption(element, value) {
    if (quiz) quiz.selectOption(element, value);
}

function nextQuestion() {
    if (quiz) quiz.nextQuestion();
}

function prevQuestion() {
    if (quiz) quiz.prevQuestion();
}

// ============================================
// BNPL CALCULATOR
// ============================================

class BNPLCalculator {
    static calculateKlarna(price, instalments = 4) {
        const amount = parseFloat(price) || 0;
        return (amount / instalments).toFixed(2);
    }
    
    static calculateClearpay(price) {
        return this.calculateKlarna(price, 4);
    }
    
    static updateDisplay(price) {
        const klarnaAmount = document.getElementById('klarna-instalment');
        const clearpayAmount = document.getElementById('clearpay-instalment');
        
        if (klarnaAmount) {
            klarnaAmount.textContent = '€' + this.calculateKlarna(price);
        }
        
        if (clearpayAmount) {
            clearpayAmount.textContent = '€' + this.calculateClearpay(price);
        }
    }
}

// ============================================
// SUBSCRIBE & SAVE
// ============================================

class SubscriptionManager {
    static calculateDiscount(price, discountPercent = 15) {
        const amount = parseFloat(price) || 0;
        const discounted = amount * (1 - discountPercent / 100);
        const savings = amount - discounted;
        
        return {
            original: amount.toFixed(2),
            discounted: discounted.toFixed(2),
            savings: savings.toFixed(2)
        };
    }
    
    static updateDisplay(price) {
        const { original, discounted, savings } = this.calculateDiscount(price);
        
        const onetimeEl = document.querySelector('[data-onetime-price]');
        const subEl = document.querySelector('[data-subscription-price]');
        const savingsEl = document.querySelector('[data-savings]');
        
        if (onetimeEl) onetimeEl.textContent = `€${original}`;
        if (subEl) subEl.textContent = `€${discounted} per delivery`;
        if (savingsEl) savingsEl.textContent = `Save €${savings}`;
    }
}

// ============================================
// PAYMENT METHOD SELECTOR
// ============================================

class PaymentMethodSelector {
    constructor(containerSelector) {
        this.container = document.querySelector(containerSelector);
        this.selectedMethod = null;
        this.init();
    }
    
    init() {
        if (!this.container) return;
        
        const options = this.container.querySelectorAll('.payment-method-option');
        options.forEach(option => {
            option.addEventListener('click', () => this.selectMethod(option));
        });
    }
    
    selectMethod(option) {
        // Remove previous selection
        this.container.querySelectorAll('.payment-method-option').forEach(o => {
            o.classList.remove('selected');
        });
        
        // Add selection
        option.classList.add('selected');
        this.selectedMethod = option.dataset.method;
        
        // Toggle additional fields based on method
        this.toggleFields(this.selectedMethod);
        
        // Dispatch event
        const event = new CustomEvent('paymentMethodChange', {
            detail: { method: this.selectedMethod }
        });
        this.container.dispatchEvent(event);
    }
    
    toggleFields(method) {
        // Hide all method-specific fields
        document.querySelectorAll('[data-payment-fields]').forEach(el => {
            el.style.display = 'none';
        });
        
        // Show fields for selected method
        const fields = document.querySelector(`[data-payment-fields="${method}"]`);
        if (fields) fields.style.display = 'block';
    }
}

// ============================================
// INITIALIZATION
// ============================================

// Script loaded with defer — DOM is already parsed
(function() {
    // Initialize chatbot
    initChatbot();
    
    // Initialize quiz
    initQuiz();
    
    // Initialize payment method selector if present
    const paymentContainer = document.querySelector('.payment-methods-grid');
    if (paymentContainer) {
        new PaymentMethodSelector('.payment-methods-grid');
    }
    
    // Initialize BNPL displays with current product price
    const priceElement = document.querySelector('.product-current-price, .price-current, [data-product-price]');
    if (priceElement) {
        const price = parseFloat(priceElement.textContent.replace(/[^0-9.]/g, ''));
        if (price) {
            BNPLCalculator.updateDisplay(price);
            SubscriptionManager.updateDisplay(price);
        }
    }
    
})();

// ============================================
// EXPORTS FOR GLOBAL ACCESS
// ============================================

// Direct global exports for onclick handlers
window.toggleChatbot = toggleChatbot;
window.sendMessage = sendMessage;
window.sendQuickMessage = sendQuickMessage;
window.handleChatKeypress = handleChatKeypress;
window.openQuiz = openQuiz;
window.closeQuiz = closeQuiz;
window.selectOption = selectOption;
window.nextQuestion = nextQuestion;
window.prevQuestion = prevQuestion;

window.SportsFoods = {
    chatbot: {
        toggle: toggleChatbot,
        sendMessage,
        sendQuickMessage
    },
    quiz: {
        open: openQuiz,
        close: closeQuiz
    },
    bnpl: BNPLCalculator,
    subscription: SubscriptionManager
};

// FAQ Accordion
document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', function() {
        const item = this.parentElement;
        const answer = item.querySelector('.faq-answer');
        const isOpen = this.classList.contains('active');
        // Close all
        document.querySelectorAll('.faq-question.active').forEach(b => {
            b.classList.remove('active');
            b.parentElement.querySelector('.faq-answer').classList.remove('active');
        });
        // Toggle current
        if (!isOpen) {
            this.classList.add('active');
            if (answer) answer.classList.add('active');
        }
    });
});
