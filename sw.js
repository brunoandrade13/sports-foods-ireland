// SFI Service Worker v2.0 — Cache estratégico para performance
const CACHE_NAME = 'sfi-v2';
const CACHE_STATIC = 'sfi-static-v2';
const CACHE_IMAGES = 'sfi-images-v2';

// Recursos críticos a pré-cachear no install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/shop.html',
  '/cart.html',
  '/css/sfi-styles.min.css?v=25',
  '/js/main.min.js',
  '/js/cart.min.js',
  '/js/sfi-api.min.js',
  '/js/sfi-data-loader.min.js',
  '/js/product-card.min.js',
  '/js/sfi-fixes.min.js',
  '/js/sfi-enhancements.min.js',
  '/img/logo.webp',
  '/img/placeholder.webp',
  '/img/hero-tailwind.webp',
  '/img/hero-tailwind-mobile.webp',
  '/img/hero-clif-new.webp',
  '/img/hero-zone3.webp',
  '/img/hero-powerbar-new.webp',
  '/img/hero-saltstick.webp',
  '/img/hero-igpsport.webp',
  '/js/dados-slim.json',
];

// Install — pré-cachear recursos críticos
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      return cache.addAll(PRECACHE_URLS).catch(err => {
        console.log('[SW] Precache error (non-fatal):', err);
      });
    })
  );
});

// Activate — limpar caches antigas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_STATIC && k !== CACHE_IMAGES)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch — estratégia por tipo de recurso
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requests não-GET, cross-origin e Supabase API
  if (request.method !== 'GET') return;
  if (!url.origin.includes(self.location.origin.replace(/^https?:\/\//, ''))) return;
  if (url.hostname.includes('supabase')) return;
  if (url.hostname.includes('brevo')) return;
  if (url.hostname.includes('fonts.googleapis')) return;

  // Imagens — Cache First (imagens mudam raramente)
  if (/\.(webp|png|jpg|jpeg|gif|svg|ico)(\?|$)/i.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_IMAGES).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  // CSS/JS minificados — Cache First com versão (v= no URL garante refresh)
  if (/\.(min\.css|min\.js)(\?|$)/i.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_STATIC).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // HTML e JSON — Network First (conteúdo dinâmico), fallback cache
  if (/\.(html|json)(\?|$)/i.test(url.pathname) || url.pathname === '/') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            caches.open(CACHE_STATIC).then(cache => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }
});
