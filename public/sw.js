/**
 * Service Worker for Tikka N Talk PWA
 * - App shell caching for offline support (critical for iOS standalone mode)
 * - Network-first API caching for partial offline functionality
 * - Push notification handling
 */

const CACHE_NAME = 'tikka-v2';
const API_CACHE_NAME = 'tikka-api-v1';

// App shell files to pre-cache on install
const APP_SHELL = [
  '/',
  '/favicon.svg',
  '/icon-192.svg',
  '/manifest.json',
];

// API URL patterns to cache with network-first strategy
const API_CACHE_PATTERNS = [
  '/functions/v1/make-server-e5e192fb/public/',
  '/functions/v1/make-server-e5e192fb/menu',
  '/functions/v1/make-server-e5e192fb/restaurant-settings',
  '/functions/v1/make-server-e5e192fb/branding',
];

// Paths that should NEVER be cached (auth, orders, payments, admin mutations)
const NEVER_CACHE_PATTERNS = [
  '/auth/',
  '/login',
  '/signup',
  '/order',
  '/payment',
  '/admin/',
  '/staff/',
  '/cart',
  '/checkout',
  '/kv/',
  '/push-subscription',
];

// ─── Install: Pre-cache app shell ────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing with app shell caching...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL).catch((err) => {
        console.warn('[SW] Some app shell files failed to cache:', err);
        // Don't fail install if some files aren't available yet
      });
    })
  );
  self.skipWaiting();
});

// ─── Activate: Clean old caches ──────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activated — cleaning old caches');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== API_CACHE_NAME)
          .map((key) => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      );
    }).then(() => clients.claim())
  );
});

// ─── Fetch: Serve from cache with strategies ─────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension, blob, data URLs
  if (!url.protocol.startsWith('http')) return;

  // Skip never-cache patterns
  if (NEVER_CACHE_PATTERNS.some((p) => url.pathname.includes(p))) return;

  // API requests: Network-first with cache fallback
  if (API_CACHE_PATTERNS.some((p) => url.href.includes(p))) {
    event.respondWith(networkFirstWithCache(request, API_CACHE_NAME, 5000));
    return;
  }

  // Navigation requests (HTML pages): Network-first, fallback to cached index
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache a copy of the navigation response
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/', clone));
          }
          return response;
        })
        .catch(() => {
          // Offline: serve cached index.html for SPA routing
          return caches.match('/').then((cached) => {
            return cached || new Response('Offline — please check your connection.', {
              status: 503,
              headers: { 'Content-Type': 'text/html' },
            });
          });
        })
    );
    return;
  }

  // Static assets (JS, CSS, images, fonts): Stale-while-revalidate
  if (isStaticAsset(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, CACHE_NAME));
    return;
  }
});

// ─── Strategy: Network-first with timeout ────────────────────────
async function networkFirstWithCache(request, cacheName, timeoutMs) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const clone = response.clone();
      caches.open(cacheName).then((cache) => cache.put(request, clone));
    }
    return response;
  } catch (err) {
    // Network failed or timed out — try cache
    const cached = await caches.match(request);
    if (cached) {
      console.log('[SW] Serving API from cache:', request.url);
      return cached;
    }
    // Nothing cached — return error response
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ─── Strategy: Stale-while-revalidate ────────────────────────────
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Always fetch in background to update cache
  const networkPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  // Return cached immediately if available, otherwise wait for network
  if (cached) {
    return cached;
  }
  const networkResponse = await networkPromise;
  return networkResponse || new Response('', { status: 503 });
}

// ─── Helpers ─────────────────────────────────────────────────────
function isStaticAsset(pathname) {
  return /\.(js|css|woff2?|ttf|otf|eot|png|jpg|jpeg|gif|webp|avif|svg|ico|json)(\?.*)?$/.test(pathname)
    || pathname.startsWith('/assets/');
}

// ─── Push Notifications ──────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'Tikka N Talk', body: 'You have a new notification!', url: '/' };

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (e) {
    console.warn('[SW] Failed to parse push data:', e);
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.svg',
    badge: data.badge || '/icon-192.svg',
    tag: data.tag || 'tikka-notification-' + Date.now(),
    renotify: true,
    data: {
      url: data.url || '/',
    },
    vibrate: [100, 50, 100],
    actions: data.actions || [],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ─── Notification Click ──────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
