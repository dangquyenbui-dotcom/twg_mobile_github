/**
 * TWG Mobile — Service Worker
 * Cache-first for static assets, network-first for API/HTML.
 */

var CACHE_NAME = "twg-mobile-v1";

// Static assets to pre-cache on install
var PRECACHE_URLS = [
    "/static/css/app.css",
    "/static/js/app.js",
    "/static/js/dialogs.js",
    "/static/manifest.json",
];

// ---------- Install: pre-cache static shell ----------
self.addEventListener("install", function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            return cache.addAll(PRECACHE_URLS);
        })
    );
    self.skipWaiting();
});

// ---------- Activate: clean up old caches ----------
self.addEventListener("activate", function (event) {
    event.waitUntil(
        caches.keys().then(function (names) {
            return Promise.all(
                names
                    .filter(function (name) {
                        return name !== CACHE_NAME;
                    })
                    .map(function (name) {
                        return caches.delete(name);
                    })
            );
        })
    );
    self.clients.claim();
});

// ---------- Fetch: network-first for HTML, cache-first for static ----------
self.addEventListener("fetch", function (event) {
    var url = new URL(event.request.url);

    // Static assets — cache-first
    if (url.pathname.startsWith("/static/")) {
        event.respondWith(
            caches.match(event.request).then(function (cached) {
                return cached || fetch(event.request).then(function (response) {
                    // Cache the new response for next time
                    var clone = response.clone();
                    caches.open(CACHE_NAME).then(function (cache) {
                        cache.put(event.request, clone);
                    });
                    return response;
                });
            })
        );
        return;
    }

    // HTML / API — network-first with offline fallback
    event.respondWith(
        fetch(event.request).catch(function () {
            return caches.match(event.request);
        })
    );
});
