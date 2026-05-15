//

// RANDS VIBE PASS - SERVICE WORKER

// Repo: mzonke (GitHub Pages)

//

const CACHE_NAME = 'rands-wallet-v1.0.0';

// IMPORTANT: repo base path

const REPO_PATH = '/mzonke';

// -----------------------------

// CORE ASSETS ONLY (SHELL CACHE)

// -----------------------------

const PRECACHE_URLS = [

  REPO_PATH + '/',

  REPO_PATH + '/index.html',

  REPO_PATH + '/login.html',

  REPO_PATH + '/manifest.json',

  REPO_PATH + '/assets/css/index.css',

  REPO_PATH + '/assets/js/index.js',

  REPO_PATH + '/assets/icons/icon-192x192.png',

  REPO_PATH + '/assets/icons/icon-512x512.png'

];

// -----------------------------

// INSTALL EVENT

// -----------------------------

self.addEventListener('install', event => {

  console.log('[SW] Installing...');

  event.waitUntil(

    caches.open(CACHE_NAME).then(cache => {

      return cache.addAll(PRECACHE_URLS);

    }).then(() => self.skipWaiting())

  );

});

// -----------------------------

// ACTIVATE EVENT (CLEAN OLD CACHE)

// -----------------------------

self.addEventListener('activate', event => {

  console.log('[SW] Activating...');

  event.waitUntil(

    caches.keys().then(keys => {

      return Promise.all(

        keys.map(key => {

          if (key !== CACHE_NAME) {

            console.log('[SW] Deleting old cache:', key);

            return caches.delete(key);

          }

        })

      );

    }).then(() => self.clients.claim())

  );

});

// -----------------------------

// FETCH STRATEGY (CACHE FIRST + NETWORK UPDATE)

// -----------------------------

self.addEventListener('fetch', event => {

  if (event.request.method !== 'GET') return;

  // Only handle same-origin requests

  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(

    caches.match(event.request).then(cached => {

      // Return cached version first

      const fetchPromise = fetch(event.request).then(networkRes => {

        if (!networkRes || networkRes.status !== 200) return networkRes;

        const clone = networkRes.clone();

        caches.open(CACHE_NAME).then(cache => {

          cache.put(event.request, clone);

        });

        return networkRes;

      }).catch(() => null);

      // If cached exists → return it

      if (cached) return cached;

      // Otherwise wait for network

      return fetchPromise || caches.match(REPO_PATH + '/index.html');

    })

  );

});

// -----------------------------

// BACKGROUND SYNC (future use)

// -----------------------------

self.addEventListener('sync', event => {

  console.log('[SW] Sync:', event.tag);

});

// -----------------------------

// PUSH NOTIFICATIONS

// -----------------------------

self.addEventListener('push', event => {

  const data = event.data ? event.data.json() : {};

  const options = {

    body: data.body || 'New update from Rands',

    icon: REPO_PATH + '/assets/icons/icon-192x192.png',

    badge: REPO_PATH + '/assets/icons/icon-192x192.png',

    vibrate: [200, 100, 200],

    data: {

      url: data.url || REPO_PATH + '/home.html'

    }

  };

  event.waitUntil(

    self.registration.showNotification(

      data.title || 'Rands Vibe Pass',

      options

    )

  );

});

// -----------------------------

// NOTIFICATION CLICK

// -----------------------------

self.addEventListener('notificationclick', event => {

  event.notification.close();

  const url = event.notification.data?.url || REPO_PATH + '/home.html';

  event.waitUntil(

    clients.matchAll({ type: 'window', includeUncontrolled: true })

      .then(clientList => {

        for (let client of clientList) {

          if (client.url === url && 'focus' in client) {

            return client.focus();

          }

        }

        if (clients.openWindow) {

          return clients.openWindow(url);

        }

      })

  );

});

// -----------------------------

// MANUAL UPDATE CONTROL

// -----------------------------

self.addEventListener('message', event => {

  if (event.data === 'skipWaiting') {

    self.skipWaiting();

  }

});
