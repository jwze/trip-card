const CACHE_PREFIX = `trip-card:${self.registration.scope}:`;
const CACHE_NAME = `${CACHE_PREFIX}__VERSION__`;
const ASSETS = /* __ASSETS__ */ [];
const appURL = file => new URL(file, self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS.map(file => new Request(appURL(file), { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (request.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  event.respondWith((async () => {
    // Prefer current files online; use the complete installed version offline.
    try { return await fetch(request); }
    catch (error) {
      const cache = await caches.open(CACHE_NAME);
      const fallback = request.mode === 'navigate' ? appURL('index.html') : request;
      const response = await cache.match(fallback, { ignoreSearch: true });
      if (response) return response;
      throw error;
    }
  })());
});
