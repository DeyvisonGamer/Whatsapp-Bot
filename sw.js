// Service worker mínimo — só existir já é o suficiente pra navegadores e
// ferramentas de empacotamento (PWABuilder etc.) considerarem o painel
// como um app instalável. Não faz cache agressivo pra sempre pegar os
// dados mais recentes do painel.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
