/* Nexus Chat — service worker
   Правило: HTML/JS/CSS ВСЕГДА из сети (cache: 'reload' обходит даже кэш CDN).
   Кэш нужен только как страховка на случай офлайна. */
const CACHE = 'nexus-chat-v14';
const ASSETS = ['./', './index.html', './manifest.json', './icons/icon.svg'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // внешние (шрифты, mqtt) — мимо кэша

  /* cache:'reload' — форсируем запрос мимо HTTP-кэша и кэша CDN.
     Именно из-за CDN GitHub Pages старый index.html жил на телефоне неделями. */
  const net = fetch(new Request(req.url, { cache: 'reload', credentials: 'same-origin' }))
    .then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    })
    .catch(() => caches.match(req).then(r => r || caches.match('./index.html')));

  e.respondWith(net);
});
