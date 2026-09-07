/* Service worker do RastroCar: cache do "casco" da aplicação para abrir rápido e funcionar como app instalado.
   Dados (API, tiles do mapa) sempre vêm da rede. */
const CACHE = 'rastrocar-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/brand/logo-mark.svg', '/brand/logo-horizontal-white.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws')) return;
  // Assets com hash (Vite) e imagens: cache-first
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/img/') || url.pathname.startsWith('/brand/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(event.request, copy)); return res; })));
    return;
  }
  // Navegação: network-first com fallback ao shell
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/index.html')));
  }
});
