//
// RANDS VIBE PASS - SERVICE WORKER
// Repo: mziwonkekabuyaphi/mzonke (GitHub Pages)
// FIX: removed /mzonke base path – works on root deployments (Vercel)
//

const CACHE_NAME = 'rands-wallet-v1.1.0';

// —————————–
// SHELL CACHE (minimal, reliable)
// —————————–
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/login.html',
  '/manifest.json',
  '/assets/css/index.css',
  '/assets/js/index.js',
  '/assets/icons/icon-192x192.png',
  '/assets/icons/icon-512x512.png'
];

// —————————–
// INSTALL EVENT
// —————————–
self.addEventListener('install', event => {
  console.log('[SW] Installing v' + CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        PRECACHE_URLS.map(url =>
          cache.add(url).catch(err => {
            console.warn('[SW] Failed to cache:', url, err);
          })
        )
      );
    }).then(() => {
      console.log('[SW] Install complete, skipping waiting');
      return self.skipWaiting();
    })
  );
});

// —————————–
// ACTIVATE EVENT (clean old caches)
// —————————–
self.addEventListener('activate', event => {
  console.log('[SW] Activating…');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

// —————————–
// FETCH STRATEGY: Stale-While-Revalidate
// —————————–
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Only handle same-origin requests
  if (!event.request.url.startsWith(self.location.origin)) return;

  // Skip non-http(s) schemes
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request).then(cached => {
        // Revalidate in background
        const fetchPromise = fetch(event.request)
          .then(networkRes => {
            if (networkRes && networkRes.status === 200) {
              cache.put(event.request, networkRes.clone());
            }
            return networkRes;
          })
          .catch(() => null);

        // Return cached immediately, or wait for network, or fallback to index.html
        return cached || fetchPromise || cache.match('/index.html');
      })
    )
  );
});

// —————————–
// PUSH NOTIFICATIONS
// —————————–
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.body || 'New update from Rands',
    icon: '/assets/icons/icon-192x192.png',
    badge: '/assets/icons/icon-192x192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/home.html' }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Rands Vibe Pass', options)
  );
});

// —————————–
// NOTIFICATION CLICK
// —————————–
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/home.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// —————————–
// MANUAL UPDATE CONTROL
// —————————–
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});

// —————————–
// BACKGROUND SYNC (future use)
// —————————–
self.addEventListener('sync', event => {
  console.log('[SW] Sync:', event.tag);
});