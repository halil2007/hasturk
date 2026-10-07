// Servis çalışanı: (1) uygulama dosyaları cihazda yedeklenir (ağ yoksa / çok yavaşsa panel yine açılır); (2) anlık bildirim.
// Veri (/api/*) hiçbir zaman saklanmaz, her zaman sunucudan gelir.
// Uygulama dosyaları ÖNCE AĞDAN alınır (4 sn içinde gelmezse cihazdaki kopya): yeni yayından sonra eski ve yeni dosyaların
// (ör. yeni app.js + eski core.js) karışıp panelin boş ekranda takılması böyle önlenir.
const SHELL = 'shell-v3';
const DEV = /^(localhost|127\.0\.0\.1)$/.test(self.location.hostname);
const NET_WAIT = 4000;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  // Chrome: /api/ istekleri servis çalışanına hiç uğramasın (doğrudan ağ; ek gecikme yok)
  if (e.addRoutes) e.waitUntil(e.addRoutes({ condition: { urlPattern: new URLPattern({ pathname: '/api/*' }) }, source: 'network' }).catch(() => {}));
});
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== SHELL) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (DEV || req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.search) return;
  // Sayfa adresi (/, /?firma=…) tek kayıt: index.html
  const key = req.mode === 'navigate' ? '/' : url.pathname;
  e.respondWith((async () => {
    const cache = await caches.open(SHELL);
    // Ağdan alınırken tarayıcının HTTP önbelleği doğrulanır (no-cache): değişmeyen dosya hızlıca 304 ile gelir
    const net = fetch(req.mode === 'navigate' ? req : new Request(req, { cache: 'no-cache' })).then((res) => {
      if (res.ok && res.type === 'basic') cache.put(key, res.clone()).catch(() => {});
      return res;
    });
    const slow = new Promise((ok) => setTimeout(ok, NET_WAIT, null));
    const first = await Promise.race([net.catch(() => null), slow]);
    if (first) return first;
    const hit = await cache.match(key);
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net; // cihazda kopya yoksa ağ beklenir
  })());
});
self.addEventListener('message', (e) => {
  if (e.data === 'clear-shell') e.waitUntil(caches.delete(SHELL));
});

self.addEventListener('push', (e) => e.waitUntil((async () => {
  let m = { title: 'Hastürk Panel', body: 'Yeni bildirim', url: '#/' };
  try { const r = await fetch('/api/push/latest', { credentials: 'include', cache: 'no-store' }); if (r.ok) m = { ...m, ...(await r.json()) }; } catch { /* varsayılan metin */ }
  await self.registration.showNotification(m.title, { body: m.body, icon: '/icon.svg', badge: '/icon.svg', tag: 'hasturk', renotify: true, data: { url: m.url || '#/' } });
})()));
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = '/' + ((e.notification.data && e.notification.data.url) || '');
  e.waitUntil((async () => {
    for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
      if ('focus' in c) { try { await c.navigate(url); } catch { /* aynı sayfa */ } return c.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
