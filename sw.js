const ROOT_CACHE = 'petricoach-root-redirect-v6';
const OLD_ROOT_CACHES = [
  'petricoach-nrw-v3-1',
  'petricoach-nrw-v3-2-1'
];

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all(OLD_ROOT_CACHES.map(name => caches.delete(name)))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(() => Response.redirect('/v6/', 302))
    );
    return;
  }
  event.respondWith(fetch(event.request));
});
