/* ==================================================
   SFI-FIXES.JS - Consolidated fixes
   Merged: global-fixes.js + carousel-fix.js + darkmode-fix.js
   Generated: 2026-02-06 00:06
   ================================================== */

/* ====== 1/3: global-fixes.js ====== */
/* ===========================================
   CORREÇÕES GLOBAIS DO SITE
   Sports Foods Ireland - Janeiro 2026
   Este arquivo resolve todos os bugs conhecidos
   =========================================== */

(function() {
    'use strict';
    
    // Debug do modal do carrinho: ativar com ?debug=1 na URL ou window.SFI_DEBUG_CART = true
    const DEBUG_CART = !!(window.SFI_DEBUG_CART || (typeof URLSearchParams !== 'undefined' && new URLSearchParams(location.search).get('debug') === '1'));
    function debugLog(...args) { if (DEBUG_CART) console.log(...args); }
    function debugWarn(...args) { if (DEBUG_CART) console.warn(...args); }
    
    if (typeof URLSearchParams !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1') {
    }
    
    // Flag to prevent immediate closing after opening
    let modalJustOpened = false;
    
    // ============================================
    // 1. GARANTIR QUE PRODUTOS CARREGAM
    // ============================================
    
    window.ensureProductsLoad = async function() {
        const grid = document.getElementById('productsGrid');
        if (!grid) return;
        
        // Na página shop.html, esperar mais tempo pois shop.js cuida do carregamento
        if (window.location.pathname.includes('shop.html')) {
            // Se shop.js já carregou produtos (mais de 0 filhos), não fazer nada
            if (grid.children.length > 0 && !grid.innerHTML.includes('will be loaded') && !grid.innerHTML.includes('Loading')) {
                return;
            }
        }
        
        // Se o grid está vazio após 2 segundos, forçar carregamento
        if (grid.children.length === 0 || grid.innerHTML.trim() === '' || grid.innerHTML.includes('will be loaded')) {
            
            try {
                let data;
                
                // Try fetch first
                try {
                    const response = await fetch('js/dados.json');
                    data = await response.json();
                } catch (fetchError) {
                    // Fallback to XMLHttpRequest for local files
                    data = await new Promise((resolve, reject) => {
                        const xhr = new XMLHttpRequest();
                        xhr.open('GET', 'js/dados.json', true);
                        xhr.onreadystatechange = function() {
                            if (xhr.readyState === 4) {
                                if (xhr.status === 200 || xhr.status === 0) {
                                    try {
                                        resolve(JSON.parse(xhr.responseText));
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
                
                const products = Array.isArray(data) ? data : (data.produtos || []);
                
                if (products.length > 0) {
                    renderProductsForce(products, grid);
                }
            } catch (e) {
                console.error('❌ Error loading products:', e);
                grid.innerHTML = '<p style="text-align:center;padding:2rem;color:red;">Error loading products. Please refresh the page.</p>';
            }
        }
    };
    
    function renderProductsForce(products, container) {
        if (!container || !products.length) return;
        
        // Use shared template if available, otherwise fallback
        if (typeof createProductCardHTML === 'function') {
            container.innerHTML = products.slice(0, 24).map(prod => createProductCardHTML(prod)).join('');
        } else {
            container.innerHTML = products.slice(0, 24).map(prod => `
                <article class="product-card" data-id="${prod.id}">
                    ${prod.desconto > 0 ? `<span class="badge-desconto">-${prod.desconto}%</span>` : ''}
                    <a href="produto.html?id=${prod.id}" class="product-link">
                        <img src="${prod.imagem && /^https?:\/\//i.test(prod.imagem) ? prod.imagem : (prod.imagem && prod.imagem.startsWith('img/') ? prod.imagem : 'img/' + (prod.imagem || 'produto1.jpg'))}" 
                             alt="${prod.nome}" 
                             class="product-img" 
                             loading="lazy"
                             onerror="this.src='img/produto1.jpg'">
                    </a>
                    <h3 class="product-name">
                        <a href="produto.html?id=${prod.id}">${prod.nome}</a>
                    </h3>
                    ${prod.marca ? `<span class="product-brand">${prod.marca}</span>` : ''}
                    <div class="product-prices">
                        ${prod.preco_antigo && prod.preco_antigo > prod.preco ? 
                            `<span class="old-price">€${prod.preco_antigo.toFixed(2)}</span>` : ''}
                        <span class="new-price">€${prod.preco.toFixed(2)}</span>
                    </div>
                    <button class="btn-basket" onclick="addToCartGlobal(${prod.id}, '${prod.nome.replace(/'/g, "\\'")}', ${prod.preco})" type="button">
                        ADD TO BASKET
                    </button>
                </article>
            `).join('');
        }
    }
    
    // ============================================
    // 2. FUNÇÃO GLOBAL PARA ADICIONAR AO CARRINHO
    // ============================================
    
    window.addToCartGlobal = function(productId, productName, productPrice) {
        debugLog('🛒 Adding to cart:', productId, productName, productPrice);
        
        // Tentar usar a função existente
        if (typeof window.addToCart === 'function') {
            window.addToCart(productId, 1, {
                id: productId,
                nome: productName,
                preco: productPrice,
                imagem: `img/produto${((productId - 1) % 5) + 1}.jpg`
            });
        } else {
            // Fallback: salvar diretamente no localStorage
            let cart = JSON.parse(localStorage.getItem('cart') || '[]');
            const existingItem = cart.find(item => item.id === productId);
            
            if (existingItem) {
                existingItem.quantidade += 1;
            } else {
                cart.push({
                    id: productId,
                    nome: productName,
                    preco: productPrice,
                    imagem: `img/produto${((productId - 1) % 5) + 1}.jpg`,
                    quantidade: 1
                });
            }
            
            localStorage.setItem('cart', JSON.stringify(cart));
            
            // Atualizar contador do carrinho
            updateCartCountGlobal();
        }
        
        // Mostrar notificação
        showAddToCartNotification(productName);
    };
    
    function updateCartCountGlobal() {
        const cart = JSON.parse(localStorage.getItem('cart') || '[]');
        const count = cart.reduce((sum, item) => sum + (item.quantidade || 1), 0);
        
        document.querySelectorAll('.cart-count').forEach(el => {
            el.textContent = count;
        });
    }
    
    function showAddToCartNotification(productName) {
        // Remover notificação existente
        const existing = document.querySelector('.add-cart-notification');
        if (existing) existing.remove();
        
        const notification = document.createElement('div');
        notification.className = 'add-cart-notification';
        notification.innerHTML = `
            <span class="notification-icon">✓</span>
            <span class="notification-text">${productName} added to cart!</span>
        `;
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #2D6A4F;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            z-index: 10000;
            display: flex;
            align-items: center;
            gap: 10px;
            animation: slideUp 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(-50%) translateY(20px)';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    // ============================================
    // 3. CORRIGIR TOGGLE DO CARRINHO
    // ============================================
    
    // Toggle: abre ou fecha conforme estado do overlay (sem delegar para site-fixes)
    window.toggleCartModal = function() {
        debugLog('🔵 toggleCartModal');
        const overlay = document.getElementById('cartModalOverlay');
        if (overlay) {
            if (overlay.classList.contains('active')) {
                if (typeof window.closeCartModal === 'function') {
                    window.closeCartModal();
                }
            } else {
                if (typeof window.openCartModal === 'function') {
                    window.openCartModal();
                }
            }
        }
    };
    
    // Abrir modal: POSIÇÃO FIXA SIMPLES
    window.openCartModal = function() {
        const overlay = document.getElementById('cartModalOverlay');
        const modal = document.getElementById('cartModal');
        if (!overlay) {
            console.error('Cart modal overlay not found');
            return;
        }
        debugLog('openCartModal - FIXED POSITION');
            
        // Set flag to prevent immediate closing
        modalJustOpened = true;
        setTimeout(() => {
            modalJustOpened = false;
        }, 300);
        
        // Remove inert and set aria-hidden to false before showing
        overlay.removeAttribute('inert');
        overlay.setAttribute('aria-hidden', 'false');
        
        // OVERLAY - full screen
        overlay.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; width: 100vw !important; height: 100vh !important; background: rgba(0,0,0,0.5) !important; z-index: 10000 !important; display: block !important; opacity: 1 !important; visibility: visible !important; pointer-events: auto !important;';
        overlay.classList.add('active');
        
        document.body.classList.add('cart-modal-open');
        if (document.documentElement) {
            document.documentElement.classList.add('cart-modal-open');
        }
        
        // MODAL - POSIÇÃO FIXA: top 120px
        if (modal) {
            modal.style.cssText = 'position: fixed !important; top: 120px !important; right: 20px !important; left: auto !important; width: 380px !important; max-width: calc(100vw - 40px) !important; max-height: calc(100vh - 150px) !important; background: #fff !important; border-radius: 16px !important; z-index: 10001 !important; display: flex !important; flex-direction: column !important; opacity: 1 !important; visibility: visible !important; pointer-events: auto !important; transform: none !important; box-shadow: 0 25px 80px rgba(0,0,0,0.25) !important;';
            debugLog('Modal positioned at top: 120px');
        }
        
        // Update cart content — using cart.js canonical version
        if (typeof window.updateCartModalContent === 'function') {
            window.updateCartModalContent();
        }
        
        // Focus close button
        const closeBtn = modal ? modal.querySelector('.cart-modal-close') : null;
        if (closeBtn) {
            setTimeout(() => closeBtn.focus(), 100);
        }
        
        debugLog('✅ Cart modal opened');
    };
    
    // Always override any previous definition to ensure our version is used
    window.closeCartModal = function() {
        debugLog('closeCartModal called');
        
        // Prevent multiple simultaneous calls
        if (window._closingCartModal) {
            debugLog('closeCartModal already in progress, ignoring...');
            return;
        }
        window._closingCartModal = true;
        
        // Reset flag when closing
        modalJustOpened = false;
        
        const overlay = document.getElementById('cartModalOverlay');
        const modal = document.getElementById('cartModal');
        if (overlay) {
            // Remove focus from any element inside modal before hiding
            const activeElement = document.activeElement;
            
            // Force remove focus from all focusable elements inside modal
            if (modal) {
                const focusableElements = modal.querySelectorAll('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])');
                focusableElements.forEach(el => {
                    if (el === document.activeElement) {
                        el.blur();
                        // Also remove focus programmatically
                        if (typeof el.focus === 'function') {
                            try {
                                el.blur();
                            } catch (e) {
                                // Ignore errors
                            }
                        }
                    }
                });
            }
            
            // If active element is still inside overlay, force blur multiple times
            if (overlay.contains(activeElement)) {
                // Blur immediately
                activeElement.blur();
                
                // Force focus to body temporarily
                if (!document.body.hasAttribute('tabindex')) {
                    document.body.setAttribute('tabindex', '-1');
                }
                document.body.focus();
                
                // Also try to blur using requestAnimationFrame for better timing
                requestAnimationFrame(() => {
                    if (overlay.contains(document.activeElement)) {
                        document.activeElement.blur();
                        document.body.focus();
                    }
                });
            }
            
            // Use requestAnimationFrame + setTimeout to ensure blur completes before setting aria-hidden
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    // Double-check that no element inside modal has focus
                    const currentActive = document.activeElement;
                    if (overlay.contains(currentActive)) {
                        currentActive.blur();
                        document.body.focus();
                    }
                    
                    // Small delay to ensure blur is fully processed
                    setTimeout(() => {
                        // Final check
                        const finalActive = document.activeElement;
                        if (overlay.contains(finalActive)) {
                            finalActive.blur();
                            document.body.focus();
                        }
                        
                        // Now safe to set aria-hidden
            overlay.classList.remove('active');
                        overlay.setAttribute('aria-hidden', 'true');
                        overlay.setAttribute('inert', ''); // Use inert instead of aria-hidden for better accessibility
                        
                        // CRITICAL FIX: Force overlay to be completely hidden
                        overlay.style.setProperty('display', 'none', 'important');
                        overlay.style.setProperty('visibility', 'hidden', 'important');
                        overlay.style.setProperty('opacity', '0', 'important');
                        overlay.style.setProperty('pointer-events', 'none', 'important');
                        overlay.style.setProperty('z-index', '-1', 'important');
                        // Use 0 instead of -9999px to prevent affecting children positioning
                        overlay.style.setProperty('position', 'fixed', 'important');
                        overlay.style.setProperty('top', '0', 'important');
                        overlay.style.setProperty('left', '0', 'important');
                        overlay.style.setProperty('width', '0', 'important');
                        overlay.style.setProperty('height', '0', 'important');
                        
                        // CRITICAL: Reset modal position to prevent it from being off-screen
                        if (modal) {
                            modal.style.setProperty('display', 'none', 'important');
                            modal.style.setProperty('opacity', '0', 'important');
                            modal.style.setProperty('visibility', 'hidden', 'important');
                            // Remove positioning to reset it
                            modal.style.removeProperty('top');
                            modal.style.removeProperty('left');
                            modal.style.removeProperty('right');
                            modal.style.removeProperty('bottom');
                        }
                        
                        // Remove tabindex from body
                        if (document.body.hasAttribute('tabindex')) {
                            document.body.removeAttribute('tabindex');
                        }
                        
                        // Keep overlay hidden - don't remove any styles, keep them as hidden
                        // The CSS rule :not(.active) will ensure it stays hidden
                        
                        if (modal) {
                            modal.style.setProperty('display', 'none', 'important');
                            modal.style.setProperty('opacity', '0', 'important');
                            modal.style.setProperty('visibility', 'hidden', 'important');
                            modal.style.removeProperty('pointer-events');
                        }
                        
                        // CRITICAL: Remove cart-modal-open class from body and html FIRST
                        document.body.classList.remove('cart-modal-open');
                        if (document.documentElement) {
                            document.documentElement.classList.remove('cart-modal-open');
                        }
                        
                        // CRITICAL: Force restore body and html styles to ensure header is visible
                        // Remove ALL possible styles that could hide the header
                        const bodyStylesToRemove = ['position', 'overflow', 'width', 'height', 'top', 'left', 'right', 'bottom', 'touch-action', '-webkit-overflow-scrolling', 'margin', 'padding'];
                        bodyStylesToRemove.forEach(prop => {
                            document.body.style.removeProperty(prop);
                            document.body.style.removeProperty(prop.replace(/([A-Z])/g, '-$1').toLowerCase());
                        });
                        
                        // Force body to static position
                        document.body.style.setProperty('position', 'static', 'important');
                        document.body.style.setProperty('overflow', '', 'important');
                        document.body.style.setProperty('width', '', 'important');
                        document.body.style.setProperty('height', '', 'important');
                        
                        if (document.documentElement) {
                            document.documentElement.style.removeProperty('overflow');
                            document.documentElement.style.removeProperty('height');
                            document.documentElement.style.setProperty('overflow', '', 'important');
                            document.documentElement.style.setProperty('height', '', 'important');
                        }
                        
                        // Force a reflow to ensure styles are applied
                        void document.body.offsetHeight;
                        
                        // Additional check: ensure body is not stuck in fixed position
                        const bodyComputed = window.getComputedStyle(document.body);
                        if (bodyComputed.position === 'fixed' || bodyComputed.position === 'absolute') {
                            debugWarn('⚠️ Body still has position:', bodyComputed.position, '- forcing static...');
                            document.body.style.setProperty('position', 'static', 'important');
                            setTimeout(() => {
                                document.body.style.removeProperty('position');
                            }, 50);
                        }
                        
                        // Ensure header is visible - force it to appear with multiple selectors
                        const headerSelectors = ['header', '.header', '#header', 'header.main-header', '.main-header'];
                        let headerFound = false;
                        headerSelectors.forEach(selector => {
                            const header = document.querySelector(selector);
                            if (header && !headerFound) {
                                headerFound = true;
                                // Force visibility - KEEP these styles, don't remove them
                                header.style.setProperty('display', 'block', 'important');
                                header.style.setProperty('visibility', 'visible', 'important');
                                header.style.setProperty('opacity', '1', 'important');
                                header.style.setProperty('z-index', '10004', 'important'); // Higher than overlay (10000)
                                header.style.setProperty('position', 'relative', 'important');
                                
                                // Verify after a delay and re-apply if needed
                                setTimeout(() => {
                                    const computed = window.getComputedStyle(header);
                                    if (computed.display === 'none' || computed.visibility === 'hidden' || computed.opacity === '0') {
                                        debugWarn('⚠️ Header became hidden again, re-forcing visibility...');
                                        header.style.setProperty('display', 'block', 'important');
                                        header.style.setProperty('visibility', 'visible', 'important');
                                        header.style.setProperty('opacity', '1', 'important');
                                    }
                                }, 100);
                                debugLog('Header styles restored', {
                                    selector: selector,
                                    display: window.getComputedStyle(header).display,
                                    visibility: window.getComputedStyle(header).visibility,
                                    opacity: window.getComputedStyle(header).opacity,
                                    zIndex: window.getComputedStyle(header).zIndex
                                });
                            }
                        });
                        
                        // Ensure cart icon is visible - force it to appear - KEEP these styles
                        const cartIcon = document.getElementById('cartIcon');
                        if (cartIcon) {
                            cartIcon.style.setProperty('display', 'flex', 'important');
                            cartIcon.style.setProperty('visibility', 'visible', 'important');
                            cartIcon.style.setProperty('opacity', '1', 'important');
                            cartIcon.style.setProperty('z-index', '10005', 'important'); // Higher than header
                            
                            // Verify after a delay and re-apply if needed
                            setTimeout(() => {
                                const computed = window.getComputedStyle(cartIcon);
                                if (computed.display === 'none' || computed.visibility === 'hidden' || computed.opacity === '0') {
                                    debugWarn('⚠️ Cart icon became hidden again, re-forcing visibility...');
                                    cartIcon.style.setProperty('display', 'flex', 'important');
                                    cartIcon.style.setProperty('visibility', 'visible', 'important');
                                    cartIcon.style.setProperty('opacity', '1', 'important');
                                }
                            }, 100);
                            debugLog('Cart icon styles restored', {
                                display: window.getComputedStyle(cartIcon).display,
                                visibility: window.getComputedStyle(cartIcon).visibility,
                                opacity: window.getComputedStyle(cartIcon).opacity
                            });
                        }
                        
                        // Also ensure header-right and other header elements are visible - KEEP these styles
                        const headerRight = document.querySelector('.header-right, header .header-right, .header .header-right');
                        if (headerRight) {
                            headerRight.style.setProperty('display', 'flex', 'important');
                            headerRight.style.setProperty('visibility', 'visible', 'important');
                            headerRight.style.setProperty('opacity', '1', 'important');
                            
                            // Verify after a delay and re-apply if needed
                            setTimeout(() => {
                                const computed = window.getComputedStyle(headerRight);
                                if (computed.display === 'none' || computed.visibility === 'hidden' || computed.opacity === '0') {
                                    debugWarn('⚠️ Header-right became hidden again, re-forcing visibility...');
                                    headerRight.style.setProperty('display', 'flex', 'important');
                                    headerRight.style.setProperty('visibility', 'visible', 'important');
                                    headerRight.style.setProperty('opacity', '1', 'important');
                                }
                            }, 100);
                            debugLog('Header-right styles restored', {
                                display: window.getComputedStyle(headerRight).display,
                                visibility: window.getComputedStyle(headerRight).visibility
                            });
                        }
                        
                        // Force all header children to be visible
                        const allHeaderElements = document.querySelectorAll('header *, .header *');
                        let fixedCount = 0;
                        allHeaderElements.forEach(el => {
                            const computed = window.getComputedStyle(el);
                            if (computed.display === 'none' || computed.visibility === 'hidden' || computed.opacity === '0') {
                                // Determine appropriate display value
                                const tagName = el.tagName.toLowerCase();
                                let displayValue = '';
                                if (tagName === 'div' || tagName === 'section' || tagName === 'nav') {
                                    displayValue = 'block';
                                } else if (tagName === 'a' || tagName === 'span' || tagName === 'button') {
                                    displayValue = 'inline-block';
                                } else if (el.classList.contains('header-right') || el.classList.contains('header-left')) {
                                    displayValue = 'flex';
                                }
                                
                                el.style.setProperty('display', displayValue || 'block', 'important');
                                el.style.setProperty('visibility', 'visible', 'important');
                                el.style.setProperty('opacity', '1', 'important');
                                fixedCount++;
                            }
                        });
                        if (fixedCount > 0) {
                            debugLog(`Fixed ${fixedCount} hidden header elements`);
                        }
                        
                        // Final check - scroll to top to ensure header is in view
                        setTimeout(() => {
                            window.scrollTo(0, 0);
                            document.body.scrollTop = 0;
                            document.documentElement.scrollTop = 0;
                            
                            // Final verification of header visibility
                            const headerFinal = document.querySelector('header, .header, #header');
                            const overlayFinal = document.getElementById('cartModalOverlay');
                            
                            // CRITICAL: Re-force overlay to be hidden when closed (!active)
                            if (overlayFinal && !overlayFinal.classList.contains('active')) {
                                const oc = overlayFinal ? window.getComputedStyle(overlayFinal) : null;
                                const wasVisible = oc && (oc.display !== 'none' || parseFloat(oc.opacity) > 0);
                                overlayFinal.style.setProperty('display', 'none', 'important');
                                overlayFinal.style.setProperty('visibility', 'hidden', 'important');
                                overlayFinal.style.setProperty('opacity', '0', 'important');
                                overlayFinal.style.setProperty('pointer-events', 'none', 'important');
                                overlayFinal.style.setProperty('z-index', '-1', 'important');
                                overlayFinal.style.setProperty('position', 'fixed', 'important');
                                overlayFinal.style.setProperty('top', '0', 'important');
                                overlayFinal.style.setProperty('left', '0', 'important');
                                overlayFinal.style.setProperty('width', '0', 'important');
                                overlayFinal.style.setProperty('height', '0', 'important');
                                const modalFinal = overlayFinal.querySelector('#cartModal, .cart-modal');
                                if (modalFinal) {
                                    modalFinal.style.setProperty('display', 'none', 'important');
                                    modalFinal.style.setProperty('opacity', '0', 'important');
                                    modalFinal.style.setProperty('visibility', 'hidden', 'important');
                                    modalFinal.style.removeProperty('top');
                                    modalFinal.style.removeProperty('left');
                                    modalFinal.style.removeProperty('right');
                                    modalFinal.style.removeProperty('bottom');
                                }
                                if (wasVisible) {
                                    debugWarn('⚠️ Overlay became visible again, re-forcing hidden...');
                                }
                            }
                            
                            const overlayFinalComputed = overlayFinal ? window.getComputedStyle(overlayFinal) : null;
                            const overlayFinalRect = overlayFinal ? overlayFinal.getBoundingClientRect() : null;
                            
                            if (headerFinal) {
                                const headerRect = headerFinal.getBoundingClientRect();
                                const headerComputed = window.getComputedStyle(headerFinal);
                                debugLog('🔍 Final header check:', {
                                    display: headerComputed.display,
                                    visibility: headerComputed.visibility,
                                    opacity: headerComputed.opacity,
                                    width: headerRect.width,
                                    height: headerRect.height,
                                    top: headerRect.top,
                                    left: headerRect.left,
                                    backgroundColor: headerComputed.backgroundColor,
                                    color: headerComputed.color,
                                    clip: headerComputed.clip,
                                    overflow: headerComputed.overflow,
                                    inViewport: headerRect.width > 0 && headerRect.height > 0 && headerRect.top >= 0
                                });
                                
                                // If header is not visible, force it again
                                if (headerRect.width === 0 || headerRect.height === 0 || headerComputed.display === 'none') {
                                    debugWarn('⚠️ Header not visible, forcing again...');
                                    headerFinal.style.cssText = 'display: block !important; visibility: visible !important; opacity: 1 !important; position: relative !important; width: 100% !important; z-index: 9999 !important; top: 0 !important; left: 0 !important;';
                                }
                                
                                // Ensure header is not behind modal overlay
                                if (headerComputed.zIndex && parseInt(headerComputed.zIndex) < 10000) {
                                    headerFinal.style.setProperty('z-index', '10002', 'important');
                                    headerFinal.style.setProperty('position', 'relative', 'important');
                                    debugLog('✅ Header z-index increased to 10002 to be above modal');
                                }
                            }
                            
                            // Final verification of cart icon
                            const cartIconFinal = document.getElementById('cartIcon');
                            if (cartIconFinal) {
                                const iconRect = cartIconFinal.getBoundingClientRect();
                                const iconComputed = window.getComputedStyle(cartIconFinal);
                                debugLog('🔍 Final cart icon check:', {
                                    display: iconComputed.display,
                                    visibility: iconComputed.visibility,
                                    opacity: iconComputed.opacity,
                                    width: iconRect.width,
                                    height: iconRect.height,
                                    inViewport: iconRect.width > 0 && iconRect.height > 0
                                });
                                
                                // If cart icon is not visible, force it again
                                if (iconRect.width === 0 || iconRect.height === 0 || iconComputed.display === 'none') {
                                    debugWarn('⚠️ Cart icon not visible, forcing again...');
                                    cartIconFinal.style.cssText = 'display: flex !important; visibility: visible !important; opacity: 1 !important; position: relative !important; z-index: 10003 !important;';
                                }
                                
                                // Ensure cart icon is not behind modal overlay
                                if (iconComputed.zIndex && parseInt(iconComputed.zIndex) < 10005) {
                                    cartIconFinal.style.setProperty('z-index', '10005', 'important');
                                    cartIconFinal.style.setProperty('position', 'relative', 'important');
                                    debugLog('✅ Cart icon z-index increased to 10005 to be above modal');
                                }
                            }
                        }, 150);
                        
                        debugLog('Modal closed successfully');
                        
                        // Clear the flag after a delay
                        setTimeout(() => {
                            window._closingCartModal = false;
                        }, 200);
                    }, 100);
                });
            });
        } else {
            console.error('Cart modal overlay not found');
            window._closingCartModal = false;
        }
    };
    
    // Log that all cart modal functions are defined
    debugLog('✅ Cart modal functions defined:', {
        toggleCartModal: typeof window.toggleCartModal,
        openCartModal: typeof window.openCartModal,
        closeCartModal: typeof window.closeCartModal
    });
    
    // updateCartModalContent() removed — using canonical version from cart.js (window.updateCartModalContent)
    
    window.updateCartItemQty = function(productId, change) {
        let cart = JSON.parse(localStorage.getItem('cart') || '[]');
        // Garantir comparação robusta entre IDs numéricos e strings
        const item = cart.find(i => String(i.id) === String(productId));
        
        if (item) {
            item.quantidade = (item.quantidade || 0) + change;
            if (item.quantidade <= 0) {
                cart = cart.filter(i => String(i.id) !== String(productId));
            }
            localStorage.setItem('cart', JSON.stringify(cart));
            if (typeof window.updateCartModalContent === 'function') window.updateCartModalContent();
            updateCartCountGlobal();
        }
    };
    
    window.removeCartItem = function(productId) {
        let cart = JSON.parse(localStorage.getItem('cart') || '[]');
        // Remover por ID independentemente de ser número ou string
        cart = cart.filter(i => String(i.id) !== String(productId));
        localStorage.setItem('cart', JSON.stringify(cart));
        if (typeof window.updateCartModalContent === 'function') window.updateCartModalContent();
        updateCartCountGlobal();
    };
    
    // ============================================
    // 4. CORRIGIR WISHLIST (mesma chave que main.js e wishlist.html: sfi_wishlist)
    // ============================================
    const WISHLIST_KEY_GLOBAL = 'sfi_wishlist';
    
    window.toggleWishlist = function(productId) {
        const productIdNum = typeof productId === 'string' ? parseInt(productId, 10) : productId;
        if (!productIdNum || isNaN(productIdNum)) return false;
        let wishlist = JSON.parse(localStorage.getItem(WISHLIST_KEY_GLOBAL) || '[]');
        const index = wishlist.indexOf(productIdNum);
        if (index > -1) {
            wishlist.splice(index, 1);
            showNotificationGlobal('Removed from wishlist', 'info');
        } else {
            wishlist.push(productIdNum);
            showNotificationGlobal('Added to wishlist!', 'success');
        }
        localStorage.setItem(WISHLIST_KEY_GLOBAL, JSON.stringify(wishlist));
        updateWishlistIcons();
        return wishlist.includes(productIdNum);
    };
    
    function updateWishlistIcons() {
        const wishlist = JSON.parse(localStorage.getItem(WISHLIST_KEY_GLOBAL) || '[]');
        
        document.querySelectorAll('.wishlist-icon').forEach(icon => {
            const card = icon.closest('.product-card');
            if (card) {
                const productId = parseInt(card.getAttribute('data-id') || card.querySelector('[data-product-id]')?.getAttribute('data-product-id') || '0', 10);
                if (productId && wishlist.includes(productId)) {
                    icon.classList.add('active');
                } else {
                    icon.classList.remove('active');
                }
            }
        });
    }
    
    // ============================================
    // 5. NOTIFICAÇÃO GLOBAL
    // ============================================
    
    window.showNotificationGlobal = function(message, type = 'info') {
        const existing = document.querySelector('.global-notification');
        if (existing) existing.remove();
        
        const colors = {
            success: '#2D6A4F',
            error: '#DC2626',
            warning: '#D97706',
            info: '#0284C7'
        };
        
        const notification = document.createElement('div');
        notification.className = 'global-notification';
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${colors[type] || colors.info};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            z-index: 10001;
            animation: fadeIn 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    };
    
    // ============================================
    // 6. INICIALIZAÇÃO
    // ============================================
    
    document.addEventListener('DOMContentLoaded', function() {
        if (DEBUG_CART) console.log('🚀 Sports Foods Ireland - Global Fixes Initializing...');
        
        // Atualizar contador do carrinho
        updateCartCountGlobal();
        
        // Atualizar ícones de wishlist
        updateWishlistIcons();
        
        // Garantir que produtos carregam (após um delay para dar tempo ao shop.js)
        setTimeout(window.ensureProductsLoad, 1500);
        setTimeout(window.ensureProductsLoad, 3000);
        
        // Configurar clique no carrinho
        function setupCartIconListeners() {
            // Verify functions are available
            if (typeof window.toggleCartModal !== 'function') {
                console.error('❌ toggleCartModal not available yet, retrying in 100ms...');
                setTimeout(setupCartIconListeners, 100);
                return;
            }
            
            const cartIcons = document.querySelectorAll('.cart, #cartIcon, .cart-wrapper a, .cart-wrapper .cart');
            debugLog(`Found ${cartIcons.length} cart icon elements:`, cartIcons);
            
            cartIcons.forEach((el, index) => {
                // Remove any existing onclick handlers
                el.removeAttribute('onclick');
                
                // Remove existing listeners by cloning (to avoid duplicates)
                const newEl = el.cloneNode(true);
                el.parentNode.replaceChild(newEl, el);
                
                newEl.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                    e.stopImmediatePropagation();
                    debugLog(`Cart icon ${index} clicked - calling toggleCartModal`);
                    debugLog('window.toggleCartModal type:', typeof window.toggleCartModal);
                    debugLog('window.toggleCartModal value:', window.toggleCartModal);
                    
                    // Verify function exists
                    if (typeof window.toggleCartModal === 'function') {
                        debugLog('toggleCartModal function exists, calling...');
                        // Use setTimeout to ensure event doesn't propagate
                        setTimeout(() => {
                            try {
                                debugLog('🔵 About to call window.toggleCartModal()...');
                                const result = window.toggleCartModal();
                                debugLog('🔵 toggleCartModal returned:', result);
                            } catch (error) {
                                console.error('❌ Error calling toggleCartModal:', error);
                                console.error('Error stack:', error.stack);
                            }
                        }, 10);
                    } else {
                        console.error('❌ toggleCartModal function not found! Available functions:', Object.keys(window).filter(k => k.includes('cart')));
                    }
                }, true); // Use capture phase to catch early
                
                debugLog(`Listener attached to cart icon ${index}:`, newEl);
            });
            debugLog(`✅ Cart icon listeners attached to ${cartIcons.length} elements`);
        }
        
        // Setup immediately and also after DOM is ready
        // Already inside DOMContentLoaded — call once
        setupCartIconListeners();
        
        // Also setup after window load to catch any dynamically added elements
        window.addEventListener('load', function() {
            setTimeout(setupCartIconListeners, 100);
        });
        
        // Fechar modal ao clicar no overlay (mas não no modal em si)
        function setupCartModalListeners() {
        const overlay = document.getElementById('cartModalOverlay');
            const modal = document.getElementById('cartModal');
            
        if (overlay) {
                // Remove any existing listeners first
                const newOverlay = overlay.cloneNode(true);
                overlay.parentNode.replaceChild(newOverlay, overlay);
                
                // Use event delegation
                newOverlay.addEventListener('click', function(e) {
                    // Prevent closing if modal was just opened (within 300ms)
                    if (modalJustOpened) {
                        debugLog('Modal just opened, ignoring overlay click');
                        e.stopPropagation();
                        return;
                    }
                    
                    // Only close if clicking directly on the overlay, not on the modal or its children
                    const clickedElement = e.target;
                    const modalElement = document.getElementById('cartModal');
                    
                    if (clickedElement === newOverlay || (clickedElement.id === 'cartModalOverlay' && (!modalElement || !modalElement.contains(clickedElement)))) {
                        debugLog('Overlay clicked, closing modal');
                    closeCartModal();
                }
                }, false); // Use bubble phase, not capture
            }
            
            // Setup close button
            const closeBtn = document.querySelector('.cart-modal-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    debugLog('Close button clicked');
                    closeCartModal();
                });
            }
            
            // Prevent modal clicks from closing
            if (modal) {
                modal.addEventListener('click', function(e) {
                    e.stopPropagation();
                });
            }
        }
        
        // Already inside DOMContentLoaded — call once
        setupCartModalListeners();
        window.addEventListener('load', function() {
            setTimeout(setupCartModalListeners, 100);
        });
        
        // Tecla ESC para fechar modais
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeCartModal();
                if (typeof closeQuiz === 'function') closeQuiz();
            }
        });
        
        // ============================================
        // CORRIGIR TODOS OS BOTÕES ADD TO BASKET
        // ============================================
        setupAddToBasketButtons();
        
        // Observar mudanças no DOM para novos produtos
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.addedNodes.length > 0) {
                    setTimeout(setupAddToBasketButtons, 100);
                }
            });
        });
        
        observer.observe(document.body, { childList: true, subtree: true });
        
        // Verificar se os elementos do modal existem
        const overlay = document.getElementById('cartModalOverlay');
        const modal = document.getElementById('cartModal');
        const cartIcon = document.getElementById('cartIcon');
        
        debugLog('Modal elements check:', {
            overlay: overlay ? 'found' : 'NOT FOUND',
            modal: modal ? 'found' : 'NOT FOUND',
            cartIcon: cartIcon ? 'found' : 'NOT FOUND',
            toggleCartModal: typeof toggleCartModal === 'function' ? 'function exists' : 'function NOT FOUND'
        });
        
        if (!overlay) {
            console.error('❌ cartModalOverlay element not found in DOM!');
        }
        if (!modal) {
            console.error('❌ cartModal element not found in DOM!');
        }
        if (!cartIcon) {
            console.error('❌ cartIcon element not found in DOM!');
        }
        
        // Função de teste para debug
        window.testCartModal = function() {
            debugLog('🧪 Testing cart modal...');
            const overlay = document.getElementById('cartModalOverlay');
            const modal = document.getElementById('cartModal');
            
            if (!overlay) {
                console.error('❌ Overlay not found!');
                return;
            }
            if (!modal) {
                console.error('❌ Modal not found!');
                return;
            }
            
            debugLog('✅ Elements found, forcing modal to appear...');
            
            // Force all styles
            overlay.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; width: 100vw !important; height: 100vh !important; background: rgba(0,0,0,0.5) !important; z-index: 10000 !important; display: block !important; opacity: 1 !important; visibility: visible !important; pointer-events: auto !important;';
            overlay.classList.add('active');
            
            modal.style.cssText = 'position: fixed !important; top: 120px !important; right: 20px !important; left: auto !important; width: 380px !important; max-width: calc(100vw - 40px) !important; max-height: calc(100vh - 150px) !important; background: #fff !important; border-radius: 16px !important; z-index: 10001 !important; display: flex !important; flex-direction: column !important; opacity: 1 !important; visibility: visible !important; pointer-events: auto !important; transform: translateY(0) !important; box-shadow: 0 25px 80px rgba(0,0,0,0.25) !important;';
            
            debugLog('✅ Modal should now be visible!');
            debugLog('Overlay computed styles:', window.getComputedStyle(overlay));
            debugLog('Modal computed styles:', window.getComputedStyle(modal));
        };
        
        debugLog('✅ Sports Foods Ireland - Global Fixes Ready!');
        debugLog('💡 Tip: Run testCartModal() in console to test modal visibility');
    });
    
    // Delegação única: um clique em .btn-basket = uma adição ao carrinho (todas as páginas: index, shop, etc.)
    document.addEventListener('click', function(e) {
        const btn = e.target.closest('.btn-basket');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        
        const card = btn.closest('.product-card, article');
        const idStr = btn.getAttribute('data-product-id') || (card && (card.getAttribute('data-id') || card.getAttribute('data-product-id')));
        
        // Extrair dados do card HTML como backup (caso resolveProduct falhe)
        let productData = null;
        if (card) {
            const nameEl = card.querySelector('.product-name, h3, h4');
            const priceEl = card.querySelector('.new-price, .product-price, .price');
            const imgEl = card.querySelector('.product-img, img');
            
            const nome = nameEl ? nameEl.textContent.trim() : 'Product';
            let preco = 0;
            if (priceEl) {
                preco = parseFloat(priceEl.textContent.replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
            }
            const imagem = imgEl ? imgEl.getAttribute('src') : 'img/produto1.jpg';
            
            productData = { nome, preco, imagem };
        }
        
        // Se tiver um ID válido, usar a função normal com productData como fallback
        if (idStr) {
            const id = parseInt(idStr, 10);
            if (!isNaN(id) && typeof window.addToCart === 'function') {
                // Verificar se o produto tem variantes (Supabase data ou fallback descrição)
                const fullProduct = (typeof resolveProduct === 'function') ? resolveProduct(id) : null;
                const hasSupabaseVariants = fullProduct && fullProduct.variantes && fullProduct.variantes.length > 0 &&
                    fullProduct.variantes.some(g => g.options && g.options.length > 0);

                if (hasSupabaseVariants && typeof window.showSupabaseVariantModal === 'function') {
                    // Produto com variantes do Supabase — abrir modal de seleção
                    const prodForModal = fullProduct || { id: id, nome: productData?.nome, preco: productData?.preco, imagem: productData?.imagem };
                    window.showSupabaseVariantModal(prodForModal, function(selected) {
                        const cartData = productData ? Object.assign({}, productData) : {};
                        cartData.nome = (cartData.nome || prodForModal.nome || 'Product') + ' — ' + selected.label;
                        cartData.variant = selected.label;
                        cartData.variantId = selected.id;
                        cartData.preco = selected.price || cartData.preco;
                        window.addToCart(id, 1, cartData);
                        const origText = btn.textContent;
                        btn.textContent = '✓ ADDED';
                        btn.style.background = '#00A651';
                        setTimeout(() => { btn.textContent = origText; btn.style.background = ''; }, 2000);
                    });
                    return;
                }

                // Fallback: extrair variantes da descrição do produto
                const descVariants = (fullProduct && typeof window.extractProductVariants === 'function') ? window.extractProductVariants(fullProduct) : null;
                if (descVariants && typeof window.showVariantModal === 'function') {
                    const prodForModal2 = fullProduct || { id: id, nome: productData?.nome, preco: productData?.preco, imagem: productData?.imagem };
                    window.showVariantModal(prodForModal2, descVariants, function(selectedVariant) {
                        const cartData = productData ? Object.assign({}, productData) : {};
                        cartData.nome = (cartData.nome || prodForModal2.nome || 'Product') + ' — ' + selectedVariant;
                        cartData.variant = selectedVariant;
                        cartData.variantType = descVariants.type;
                        window.addToCart(id, 1, cartData);
                        const origText = btn.textContent;
                        btn.textContent = '✓ ADDED';
                        btn.style.background = '#00A651';
                        setTimeout(() => { btn.textContent = origText; btn.style.background = ''; }, 2000);
                    });
                    return;
                }

                window.addToCart(id, 1, productData);
                // Visual feedback no botão
                const originalText = btn.textContent;
                btn.textContent = '✓ ADDED';
                btn.style.background = '#00A651';
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.style.background = '';
                }, 2000);
                return;
            }
        }
        
        // FALLBACK: Para produtos estáticos sem ID, extrair dados do HTML
        if (card) {
            debugLog('🛒 Produto estático detectado, extraindo dados do HTML...');
            
            // Extrair nome
            const nameEl = card.querySelector('.product-name');
            const nome = nameEl ? nameEl.textContent.trim() : 'Product';
            
            // Extrair preço
            const priceEl = card.querySelector('.new-price');
            let preco = 0;
            if (priceEl) {
                const priceText = priceEl.textContent.trim();
                preco = parseFloat(priceText.replace('€', '').replace(',', '.').trim()) || 0;
            }
            
            // Extrair imagem
            const imgEl = card.querySelector('.product-img, img');
            const imagem = imgEl ? imgEl.getAttribute('src') : 'img/produto1.jpg';
            
            // Gerar ID único baseado no nome
            let hash = 0;
            for (let i = 0; i < nome.length; i++) {
                const char = nome.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            const staticId = 90000 + Math.abs(hash) % 10000;
            
            debugLog('🛒 Dados extraídos:', { staticId, nome, preco, imagem });
            
            // Adicionar ao carrinho
            if (typeof window.addToCart === 'function') {
                window.addToCart(staticId, 1, {
                    nome: nome,
                    preco: preco,
                    imagem: imagem
                });
            } else {
                // Fallback manual
                let cart = JSON.parse(localStorage.getItem('cart') || '[]');
                const existingItem = cart.find(item => item.id === staticId || item.nome === nome);
                
                if (existingItem) {
                    existingItem.quantidade = (existingItem.quantidade || 1) + 1;
                } else {
                    cart.push({
                        id: staticId,
                        nome: nome,
                        preco: preco,
                        imagem: imagem,
                        quantidade: 1
                    });
                }
                
                localStorage.setItem('cart', JSON.stringify(cart));
                updateCartCountGlobal();
                showAddToCartNotification(nome);
                
                // Modal não abre automaticamente - só abre quando clicar no ícone do carrinho
            }
        }
    }, true);

    // Delegação única: wishlist em qualquer card de produto (todas as páginas, incluindo shop)
    document.addEventListener('click', function(e) {
        let el = e.target;
        if (el.nodeType !== 1) el = el.parentElement;
        if (!el || !el.closest) return;
        const icon = el.closest('.wishlist-icon');
        if (!icon) return;
        e.preventDefault();
        e.stopPropagation();
        const card = icon.closest('.product-card, article');
        const idFromCard = card ? (card.getAttribute('data-id') || card.getAttribute('data-product-id')) : null;
        const idFromIcon = icon.getAttribute('data-product-id');
        const productId = parseInt(idFromCard || idFromIcon || '0', 10);
        if (!productId || isNaN(productId)) return;
        if (typeof window.toggleWishlist === 'function') {
            const isNowIn = window.toggleWishlist(productId);
            icon.classList.toggle('active', isNowIn);
        }
    }, true);

    function setupAddToBasketButtons() {
        // Não anexar listeners por botão; a delegação acima trata .btn-basket e .wishlist-icon em todas as páginas
    }
    
    // addProductToCart() removed — using canonical version from cart.js (window.addToCart)
    
    // ============================================
    // 7. CSS ANIMATIONS
    // ============================================
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideUp {
            from { opacity: 0; transform: translateX(-50%) translateY(20px); }
            to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .add-cart-notification, .global-notification {
            transition: opacity 0.3s ease, transform 0.3s ease;
        }
        .wishlist-icon.active {
            color: #E07A5F !important;
        }
        .cart-modal-item {
            display: flex;
            gap: 12px;
            padding: 12px 0;
            border-bottom: 1px solid #eee;
        }
        .cart-item-img {
            width: 60px;
            height: 60px;
            object-fit: cover;
            border-radius: 8px;
        }
        .cart-item-details {
            flex: 1;
            color: #001f3f !important;
        }
        .cart-item-name {
            font-size: 14px;
            font-weight: 600;
            margin: 0 0 4px 0;
            color: #001f3f !important;
        }
        .cart-item-price {
            color: #001f3f !important;
            font-weight: 600;
        }
        .cart-item-quantity {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 8px;
            color: #001f3f !important;
        }
        .cart-item-quantity span {
            color: #001f3f !important;
        }
        .cart-item-quantity button {
            width: 24px;
            height: 24px;
            border: 1px solid #ddd;
            background: #f5f5f5;
            border-radius: 4px;
            cursor: pointer;
        }
        .cart-item-remove {
            background: none;
            border: none;
            font-size: 20px;
            color: #001f3f !important;
            cursor: pointer;
        }
        .cart-item-remove:hover {
            color: #001f3f !important;
        }
    `;
    document.head.appendChild(style);
    
})();

/* ====== 2/3: carousel-fix.js ====== */
/**
 * Product Carousel Fix - Garantir funcionamento dos carrosséis
 */
(function() {
    'use strict';
    
    function initCarouselFix() {
        
        const carousels = document.querySelectorAll('.product-carousel-wrapper[data-carousel]');
        
        if (carousels.length === 0) {
            return;
        }
        
        
        carousels.forEach((wrapper, index) => {
            const carouselId = wrapper.getAttribute('data-carousel');
            const track = wrapper.querySelector('.product-carousel-track');
            const prevBtn = wrapper.querySelector('.product-carousel-prev');
            const nextBtn = wrapper.querySelector('.product-carousel-next');
            const cards = track ? Array.from(track.querySelectorAll('.product-card')) : [];
            
            //     track: !!track,
            //     prevBtn: !!prevBtn,
            //     nextBtn: !!nextBtn,
            //     cards: cards.length
            // });
            
            if (!track || cards.length === 0) {
                return;
            }
            
            // Forçar visibilidade do track e cards
            track.style.cssText = `
                display: flex !important;
                visibility: visible !important;
                opacity: 1 !important;
                overflow: visible !important;
                gap: 16px !important;
                transition: transform 0.4s ease !important;
            `;
            
            // Forçar visibilidade de cada card
            cards.forEach(card => {
                card.style.cssText = `
                    display: flex !important;
                    flex-direction: column !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                    flex: 0 0 220px !important;
                    min-width: 220px !important;
                    max-width: 220px !important;
                    width: 220px !important;
                `;
            });
            
            // Configurar navegação
            let currentIndex = 0;
            const cardWidth = 220;
            const gap = 16;
            const cardWithGap = cardWidth + gap;
            const visibleCards = Math.floor(wrapper.clientWidth / cardWithGap) || 4;
            const maxIndex = Math.max(0, cards.length - visibleCards);
            
            function updatePosition() {
                const translateX = -currentIndex * cardWithGap;
                track.style.transform = `translateX(${translateX}px)`;
                
                // Atualizar estado dos botões
                if (prevBtn) {
                    prevBtn.disabled = currentIndex <= 0;
                    prevBtn.style.opacity = currentIndex <= 0 ? '0.5' : '1';
                }
                if (nextBtn) {
                    nextBtn.disabled = currentIndex >= maxIndex;
                    nextBtn.style.opacity = currentIndex >= maxIndex ? '0.5' : '1';
                }
            }
            
            // Configurar botões
            if (prevBtn) {
                prevBtn.style.cssText = `
                    display: flex !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                    z-index: 1001 !important;
                    pointer-events: auto !important;
                    cursor: pointer !important;
                `;
                
                // Remover listeners antigos e adicionar novo
                const newPrevBtn = prevBtn.cloneNode(true);
                prevBtn.parentNode.replaceChild(newPrevBtn, prevBtn);
                
                newPrevBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (currentIndex > 0) {
                        currentIndex--;
                        updatePosition();
                    }
                });
            }
            
            if (nextBtn) {
                nextBtn.style.cssText = `
                    display: flex !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                    z-index: 1001 !important;
                    pointer-events: auto !important;
                    cursor: pointer !important;
                `;
                
                // Remover listeners antigos e adicionar novo
                const newNextBtn = nextBtn.cloneNode(true);
                nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
                
                newNextBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (currentIndex < maxIndex) {
                        currentIndex++;
                        updatePosition();
                    }
                });
            }
            
            // Inicializar posição
            updatePosition();
        });
    }
    
    // Execute immediately (script loaded with defer, DOM is ready)
    setTimeout(initCarouselFix, 300);
    
    // Re-executar após load completo
    window.addEventListener('load', function() {
        setTimeout(initCarouselFix, 500);
    });
    
})();

/* ====== 3/3: darkmode-fix.js ====== */
/**
 * Dark Mode Fix - Garantir que o botão apareça
 */
(function() {
    'use strict';
    
    
    function createDarkModeButton() {
        // Verificar se já existe (incluindo o do HTML)
        if (document.querySelector('.theme-toggle') || document.getElementById('darkModeToggleHTML')) {
            return;
        }
        
        
        const toggle = document.createElement('button');
        toggle.className = 'theme-toggle';
        toggle.id = 'darkModeToggleJS';
        toggle.setAttribute('aria-label', 'Toggle dark mode');
        toggle.setAttribute('title', 'Alternar modo escuro/claro');
        
        // Verificar tema atual
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        toggle.innerHTML = isDark ? '☀️' : '🌙';
        
        // Estilos inline para garantir visibilidade
        toggle.style.cssText = `
            position: fixed !important;
            bottom: 100px !important;
            right: 24px !important;
            width: 52px !important;
            height: 52px !important;
            border-radius: 50% !important;
            background: #ffffff !important;
            border: 3px solid #2D6A4F !important;
            box-shadow: 0 4px 15px rgba(0,0,0,0.25) !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            font-size: 24px !important;
            z-index: 99999 !important;
            transition: all 0.3s ease !important;
            visibility: visible !important;
            opacity: 1 !important;
            pointer-events: auto !important;
        `;
        
        // Click handler
        toggle.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const html = document.documentElement;
            const currentTheme = html.getAttribute('data-theme');
            
            if (currentTheme === 'dark') {
                html.removeAttribute('data-theme');
                localStorage.setItem('sfi-theme', 'light');
                toggle.innerHTML = '🌙';
                toggle.style.background = '#ffffff';
                toggle.style.borderColor = '#2D6A4F';
            } else {
                html.setAttribute('data-theme', 'dark');
                localStorage.setItem('sfi-theme', 'dark');
                toggle.innerHTML = '☀️';
                toggle.style.background = '#333333';
                toggle.style.borderColor = '#FF883E';
            }
        });
        
        // Adicionar ao body
        document.body.appendChild(toggle);
        
    }
    
    function applyStoredTheme() {
        const savedTheme = localStorage.getItem('sfi-theme');
        if (savedTheme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        }
    }
    
    function init() {
        // Aplicar tema salvo
        applyStoredTheme();
        
        // Criar botão
        createDarkModeButton();
    }
    
    // Execute immediately (script loaded with defer, DOM is ready)
    init();
    
    // Também executar após load completo (backup)
    window.addEventListener('load', function() {
        setTimeout(function() {
            if (!document.querySelector('.theme-toggle')) {
                createDarkModeButton();
            }
        }, 1000);
    });
    
    // Expor função globalmente
    window.toggleDarkMode = function() {
        const toggle = document.querySelector('.theme-toggle');
        if (toggle) {
            toggle.click();
        }
    };
    
})();
