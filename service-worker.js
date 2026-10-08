/**
 * App-shell cache so the form loads and works with zero connectivity.
 * Only same-origin GET requests for the app shell are handled here -
 * everything else (including POSTs to the Apps Script backend) passes
 * straight through to the network untouched.
 *
 * Bump CACHE_NAME whenever any precached file changes, so the new
 * version is fetched and old caches are cleaned up on activate.
 */
var CACHE_NAME = 'oral-screening-v1';
var PRECACHE_URLS = [
  './',
  'index.html',
  'manifest.json',
  'css/styles.css',
  'js/scoring.js',
  'js/db.js',
  'js/sync.js',
  'js/app.js',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (name) { return name !== CACHE_NAME; })
          .map(function (name) { return caches.delete(name); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  var request = event.request;

  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return; // let it go straight to the network (e.g. Apps Script sync POSTs)
  }

  event.respondWith(
    caches.match(request).then(function (cached) {
      var networkFetch = fetch(request).then(function (response) {
        if (response && response.ok) {
          caches.open(CACHE_NAME).then(function (cache) { cache.put(request, response.clone()); });
        }
        return response;
      }).catch(function () { return cached; });
      return cached || networkFetch;
    })
  );
});
