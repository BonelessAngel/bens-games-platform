// Service Worker von Drei Fronten – gilt nur für den Ordner des Spiels (/games/drei-fronten/).
// CACHE und FILES setzt scripts/build.mjs beim Bauen ein. Fremde Caches werden nie angefasst.

const CACHE = 'drei-fronten-v0.11.1-959414c05f';
const FILES = ["./","achievements.json","index.html","style.css","main.js","platform.js","engine.js","bot.js","cards.js","decks.js","collection.js","opponents.js","campaign.js","achievements.js","audio.js","fx.js","tutorial.js","online.js","manifest.webmanifest","icon.svg","rueckseite.webp","karten/aschekrieger.webp","karten/beschwoerung.webp","karten/blitzschlag.webp","karten/donnergreif.webp","karten/dornenranke.webp","karten/einhorn.webp","karten/eisgeist.webp","karten/eiskoenigin.webp","karten/erdbeben.webp","karten/feuerball.webp","karten/feuerdrache.webp","karten/feuerfuchs.webp","karten/flutwelle.webp","karten/funkenkobold.webp","karten/gargoyle.webp","karten/gedankenraub.webp","karten/geisterwolf.webp","karten/gezeitenhueterin.webp","karten/glutgolem.webp","karten/heilregen.webp","karten/korallenwaechter.webp","karten/kraftrune.webp","karten/kriegsschrei.webp","karten/lavawurm.webp","karten/meteorschauer.webp","karten/mimik.webp","karten/moosgolem.webp","karten/nebelkrake.webp","karten/pegasus.webp","karten/phoenix.webp","karten/pilzkoenig.webp","karten/runenschmied.webp","karten/salamander.webp","karten/schildkroete.webp","karten/schildzauber.webp","karten/seeschlange.webp","karten/sirene.webp","karten/steintroll.webp","karten/sturmadler.webp","karten/sturmdschinn.webp","karten/sylphe.webp","karten/teleport.webp","karten/waldriese.webp","karten/wellennixe.webp","karten/weltenbaum.webp","karten/windfee.webp","karten/wolkenwal.webp","karten/wurzelgriff.webp","karten/wurzelschrat.webp","karten/zeitriss.webp","fronten/blutmond.webp","fronten/drachenhort.webp","fronten/engpass.webp","fronten/frostfeld.webp","fronten/gezeitensee.webp","fronten/lawinenpass.webp","fronten/nebelmoor.webp","fronten/ruinen.webp","fronten/spiegelsee.webp","fronten/sturmgipfel.webp","fronten/urwald.webp","fronten/vulkan.webp","fronten/zauberturm.webp","gegner/aeris.webp","gegner/grom.webp","gegner/lio.webp","gegner/morwen.webp","gegner/silva.webp","gegner/varok.webp","umgebung/hintergrund-hoch.webp","umgebung/hintergrund-quer.webp","umgebung/titelbild.webp","umgebung/tisch.webp","symbole/banner.webp","symbole/banner-leer.webp","symbole/trommel.webp","symbole/energie.webp","symbole/krone.webp","symbole/schild.webp","symbole/muenze.webp","symbole/paket.webp","symbole/sieg.webp","symbole/niederlage.webp"];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES.map((file) => new Request(file, { cache: 'reload' })))),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('drei-fronten-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) return;
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
