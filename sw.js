//
// RANDS VIBE PASS - SERVICE WORKER
// Repo: mziwonkekabuyaphi/mzonke (GitHub Pages)
//

const CACHE_NAME = ‘rands-wallet-v1.1.0’;

// FIX: GitHub Pages repo base path — must end with /
const REPO_PATH = ‘/mzonke’;

// —————————–
// SHELL CACHE (minimal, reliable)
// FIX: Only cache files that definitely exist.
// Do NOT cache every page here — that causes install failures
// if any URL returns 404. Dynamic pages are cached on first visit.
// —————————–
const PRECACHE_URLS = [
REPO_PATH + ‘/’,
REPO_PATH + ‘/index.html’,
REPO_PATH + ‘/login.html’,
REPO_PATH + ‘/manifest.json’,
REPO_PATH + ‘/assets/css/index.css’,
REPO_PATH + ‘/assets/js/index.js’,
// FIX: match icon paths used in manifest.json (assets/icons/)
REPO_PATH + ‘/assets/icons/icon-192x192.png’,
REPO_PATH + ‘/assets/icons/icon-512x512.png’
];

// —————————–
// INSTALL EVENT
// FIX: wrap each URL individually so one 404 doesn’t fail everything
// —————————–
self.addEventListener(‘install’, event => {
console.log(’[SW] Installing v’ + CACHE_NAME);
event.waitUntil(
caches.open(CACHE_NAME).then(cache => {
// FIX: use individual adds so a missing file won’t abort the whole install
return Promise.allSettled(
PRECACHE_URLS.map(url =>
cache.add(url).catch(err => {
console.warn(’[SW] Failed to cache:’, url, err);
})
)
);
}).then(() => {
console.log(’[SW] Install complete, skipping waiting’);
return self.skipWaiting();
})
);
});

// —————————–
// ACTIVATE EVENT (clean old caches)
// —————————–
self.addEventListener(‘activate’, event => {
console.log(’[SW] Activating…’);
event.waitUntil(
caches.keys().then(keys =>
Promise.all(
keys.map(key => {
if (key !== CACHE_NAME) {
console.log(’[SW] Deleting old cache:’, key);
return caches.delete(key);
}
})
)
).then(() => self.clients.claim())
);
});

// —————————–
// FETCH STRATEGY: Stale-While-Revalidate
// - Serve from cache immediately if available
// - Fetch fresh copy in background and update cache
// - Fall back to cache-only if offline
// —————————–
self.addEventListener(‘fetch’, event => {
// FIX: only handle GET requests
if (event.request.method !== ‘GET’) return;

// FIX: only handle same-origin requests (ignore CDN, analytics, etc.)
if (!event.request.url.startsWith(self.location.origin)) return;

// FIX: skip chrome-extension and non-http(s) schemes
if (!event.request.url.startsWith(‘http’)) return;

event.respondWith(
caches.open(CACHE_NAME).then(cache =>
cache.match(event.request).then(cached => {
// Revalidate in background regardless
const fetchPromise = fetch(event.request)
.then(networkRes => {
if (networkRes && networkRes.status === 200) {
cache.put(event.request, networkRes.clone());
}
return networkRes;
})
.catch(() => null);

```
    // Return cached immediately, or wait for network
    return cached || fetchPromise || cache.match(REPO_PATH + '/index.html');
  })
)
```

);
});

// —————————–
// PUSH NOTIFICATIONS
// —————————–
self.addEventListener(‘push’, event => {
const data = event.data ? event.data.json() : {};
const options = {
body: data.body || ‘New update from Rands’,
icon: REPO_PATH + ‘/assets/icons/icon-192x192.png’,
badge: REPO_PATH + ‘/assets/icons/icon-192x192.png’,
vibrate: [200, 100, 200],
data: { url: data.url || REPO_PATH + ‘/home.html’ }
};

event.waitUntil(
self.registration.showNotification(data.title || ‘Rands Vibe Pass’, options)
);
});

// —————————–
// NOTIFICATION CLICK
// —————————–
self.addEventListener(‘notificationclick’, event => {
event.notification.close();
const url = event.notification.data?.url || REPO_PATH + ‘/home.html’;

event.waitUntil(
clients.matchAll({ type: ‘window’, includeUncontrolled: true }).then(clientList => {
for (const client of clientList) {
if (client.url === url && ‘focus’ in client) return client.focus();
}
if (clients.openWindow) return clients.openWindow(url);
})
);
});

// —————————–
// MANUAL UPDATE CONTROL
// —————————–
self.addEventListener(‘message’, event => {
if (event.data === ‘skipWaiting’) {
self.skipWaiting();
}
});

// —————————–
// BACKGROUND SYNC (future use)
// —————————–
self.addEventListener(‘sync’, event => {
console.log(’[SW] Sync:’, event.tag);
});
