// Servis çalışanı: yalnız anlık bildirim (önbellek / çevrimdışı yok). Push gövdesiz gelir; metin panelden okunur.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
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
