const CACHE_VERSION = 'v2';
const CACHE_NAME = `algo-infinity-verse-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `algo-infinity-verse-dynamic-${CACHE_VERSION}`;

function isCacheable(response) {
  return response && response.ok && (response.type === 'basic' || response.type === 'cors');
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // NAVIGATION
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (isCacheable(res)) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, res.clone()));
          }
          return res;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached || caches.match('/offline.html'))
        )
    );
    return;
  }

  // API
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (isCacheable(res)) {
            caches.open(DYNAMIC_CACHE).then((cache) => cache.put(event.request, res.clone()));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // STATIC ASSETS
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((res) => {
          if (isCacheable(res)) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, res.clone()));
          }
          return res;
        })
        .catch(() => undefined);

      return cached || fetchPromise;
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-offline-actions') {
    event.waitUntil(processOfflineQueue());
  }
});

async function processOfflineQueue() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });

  for (const client of clients) {
    client.postMessage({ type: 'PROCESS_OFFLINE_QUEUE' });
  }
}

