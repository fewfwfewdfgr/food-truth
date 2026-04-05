const CACHE_NAME = 'food-truth-v6';
const urlsToCache = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css',
  'https://unpkg.com/html5-qrcode'
];

// Install Event
self.addEventListener('install', event => {
  self.skipWaiting(); // Force activate new service worker immediately
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch Event (Serving Cached Files)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cache hit or network fetch
        return response || fetch(event.request);
      })
  );
});

// Activate Event (Cleanup Old Caches)
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
