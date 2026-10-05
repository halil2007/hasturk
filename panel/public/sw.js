// Servis çalışanı: (1) uygulama dosyaları cihazda saklanır, panel ağı beklemeden açılır; (2) anlık bildirim.
// Veri (/api/*) hiçbir zaman saklanmaz, her zaman sunucudan gelir. Yeni yayında panel sürüm farkını görür,
// saklanan dosyaları siler ve sayfayı bir kez yeniler (app.js → checkBuild).
const SHELL = 'shell-v1';
const DEV = /^(localhost|127\.0\.0\.1)$/.test(self.location.hostname);

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
    const hit = await cache.match(key);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') cache.put(key, res.clone()).catch(() => {});
    return res;
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
