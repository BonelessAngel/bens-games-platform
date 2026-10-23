/* Nova Bastion: Offline-Start. Die Seite wird bevorzugt frisch geladen (damit Updates sofort ankommen),
   ohne Internet kommt sie aus dem Zwischenspeicher. Schriften und Symbole werden beim ersten Laden mitgespeichert. */
var CACHE='nova-bastion-202610231728';
var CACHE_PREFIX='nova-bastion-';
var APP_PATH='/games/nova-bastion/';
var CORE=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png','icon-180.png','PressStart2P-Regular-latin.woff2','VT323-Regular-latin.woff2'];
self.addEventListener('install',function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(CORE);}));
});
self.addEventListener('message',function(e){if(e.data&&e.data.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',function(e){
  var own=function(k){return k.indexOf(CACHE_PREFIX)===0;};
  if(new URL(self.registration.scope).pathname!==APP_PATH){
    e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(own).map(function(k){return caches.delete(k);}));}).then(function(){return self.registration.unregister();}));return;
  }
  e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return own(k)&&k!==CACHE;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));
});
self.addEventListener('fetch',function(e){
  if(new URL(self.registration.scope).pathname!==APP_PATH)return;
  var req=e.request;if(req.method!=='GET')return;
  /* Online-Funktionen (Bestenliste, Community, Kampagne) nie aus dem Zwischenspeicher */
  if(req.url.indexOf('/api/')>=0||req.url.indexOf('/.netlify/')>=0)return;
  if(req.mode==='navigate'){
    e.respondWith(fetch(req).then(function(r){var cp=r.clone();caches.open(CACHE).then(function(c){c.put('index.html',cp);});return r;})
      .catch(function(){return caches.match('index.html');}));
    return;
  }
  e.respondWith(caches.match(req).then(function(hit){
    return hit||fetch(req).then(function(r){if(r.ok||r.type==='opaque'){var cp=r.clone();caches.open(CACHE).then(function(c){c.put(req,cp);});}return r;});
  }));
});
