/* Nexus Chat — service worker
   Правило: HTML/JS/CSS ВСЕГДА из сети (cache: 'reload' обходит даже кэш CDN).
   Кэш нужен только как страховка на случай офлайна. */
const CACHE = 'nexus-chat-v17';
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

/* ================= WEB PUSH =================
   Пришло уведомление от сервера nexus_ws.
   Если приложение открыто и видно — не дублируем: просто шлём окну сообщение. */
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  const title = d.title || '💬 Nexus Chat';
  const body = d.body || 'Новое сообщение';
  const room = d.room || '';
  e.waitUntil((async () => {
    try {
      const cls = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of cls) {
        if (c.visibilityState === 'visible') {
          c.postMessage({ type: 'push', room, title, body });
          return;   // человек и так смотрит в чат — тревожить не нужно
        }
      }
    } catch (_) {}
    await self.registration.showNotification(title, {
      body,
      tag: d.tag || 'nexus-chat',   // одинаковый tag — уведомления канала схлопываются
      renotify: true,
      icon: './icons/icon.svg',
      badge: './icons/icon.svg',
      data: { room, url: d.url || './' }
    });
  })());
});

/* тап по уведомлению — открываем приложение и нужный канал */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data = e.notification.data || {};
  const room = data.room || '';
  const url = data.url || './';
  e.waitUntil((async () => {
    const cls = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of cls) {
      if ('focus' in c) {
        c.postMessage({ type: 'open-room', room });
        return c.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
