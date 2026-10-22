// Service Worker von Royal Blocks – gilt nur für den Ordner des Spiels (/games/royal-blocks/).
// CACHE und FILES setzt scripts/build.mjs beim Bauen ein. Fremde Caches werden nie angefasst.

const CACHE = 'royal-blocks-v1.4.0-f87357a26e';
const FILES = ["./","index.html","style.css","main.js","platform.js","game.js","poker.js","pieces.js","audio.js","fx.js","storage.js","progress.js","scratch.js","manifest.webmanifest","icon-180.png","icon-192.png","icon-512.png"];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES.map((file) => new Request(file, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('royal-blocks-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  // Seite und Skripte immer aus demselben Cache-Stand, damit nie alte und neue Dateien gemischt werden.
  // Eine neue Version wird beim nächsten Start aktiv.
  if (request.mode === 'navigate') {
    const index = new URL('index.html', self.registration.scope).href;
    event.respondWith(caches.match(index, { cacheName: CACHE }).then((hit) => hit || fetch(request)));
    return;
  }
  event.respondWith(caches.match(request, { ignoreSearch: true, cacheName: CACHE }).then((hit) => hit || fetch(request)));
});
