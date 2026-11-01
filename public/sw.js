'use strict';
// Cache only app assets. Photo/PDF blob URLs never enter the service worker cache.
const PREFIX = `photo-pdf-${self.registration.scope}-`;
const CACHE = `${PREFIX}v2`;
const ASSETS = ['./', './index.html', './styles.css?v=1.1.0', './app.js?v=1.1.0', './scan.js', './scan-worker.js', './vendor/pdf-lib.min.js', './icon.svg', './manifest.webmanifest', './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png'];
// Let the new page finish loading before it requests activation. Never reload
// open pages: their selected photos and unsaved PDFs must remain intact.
self.addEventListener('install', (event) => { event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS))); });
self.addEventListener('message', (event) => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(new URL('./index.html', self.location.href))));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
