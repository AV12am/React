// Reaction Core service worker: push notifications only (no caching — the app always loads fresh).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() }; }
  const title = data.title || 'Reaction Core';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // A notification on the main domain (subscribed before the workspace moved) opens the workspace.
  const home = self.location.hostname === 'reactioncore.uk' ? 'https://workspace.reactioncore.uk' : self.location.origin;
  const url = new URL(event.notification.data?.url || '/', home).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === new URL(home).origin) { await w.focus(); w.navigate?.(url); return; }
    }
    await self.clients.openWindow(url);
  })());
});
