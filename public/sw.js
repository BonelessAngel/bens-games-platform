/* Bens Games: löst den alten Nova-Bastion-Service-Worker ab, der früher an der Domain-Wurzel lief.
   Die Startseite selbst hat keinen Service Worker (PLATTFORM-PLAN.md, Abschnitt 5 und 7).
   Gelöscht werden nur Caches aus der Zeit vor dem Umzug; das Spiel unter /games/nova-bastion/
   verwendet neuere Cache-Namen und bleibt unberührt. */
var OLD_CACHE = /^nova-bastion-(\d{12})$/;
var MOVED_AT = '202610201935';

self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (key) {
          var match = OLD_CACHE.exec(key);
          return match !== null && match[1] < MOVED_AT;
        }).map(function (key) {
          return caches.delete(key);
        }));
      })
      .then(function () {
        return self.registration.unregister();
      })
  );
});
