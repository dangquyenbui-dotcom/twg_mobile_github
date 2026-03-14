/**
 * TWG Mobile — Service Worker
 * Cache-first for static assets, network-first for HTML/API.
 *
 * The APP_VERSION query param on the sw.js URL triggers a new install
 * whenever the version bumps, which in turn creates a fresh cache name
 * and purges stale caches during activation.
 */

// Pull the version from the query string the page uses to register us:
//   navigator.serviceWorker.register("/static/sw.js?v=1.0.0")
var APP_VERSION = new URL(self.location).searchParams.get("v") || "1";
var CACHE_NAME = "twg-mobile-v" + APP_VERSION;
var OFFLINE_URL = "/offline";

// Static assets to pre-cache on install
var PRECACHE_URLS = [
    "/static/css/app.css",
    "/static/js/app.js",
    "/static/js/dialogs.js",
    "/static/manifest.json",
    OFFLINE_URL,
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

// ---------- Activate: clean up old version caches ----------
self.addEventListener("activate", function (event) {
    event.waitUntil(
        caches.keys().then(function (names) {
            return Promise.all(
                names
                    .filter(function (name) {
                        return name.startsWith("twg-mobile-") && name !== CACHE_NAME;
                    })
                    .map(function (name) {
                        return caches.delete(name);
                    })
            );
        })
    );
    self.clients.claim();
});

// ---------- Fetch ----------
self.addEventListener("fetch", function (event) {
    var url = new URL(event.request.url);

    // Only handle same-origin requests
    if (url.origin !== self.location.origin) return;

    // Static assets — cache-first, then network
    if (url.pathname.startsWith("/static/")) {
        event.respondWith(
            caches.match(event.request).then(function (cached) {
                return cached || fetch(event.request).then(function (response) {
                    if (response.ok) {
                        var clone = response.clone();
                        caches.open(CACHE_NAME).then(function (cache) {
                            cache.put(event.request, clone);
                        });
                    }
                    return response;
                });
            })
        );
        return;
    }

    // HTML navigation — network-first, offline fallback page
    if (event.request.mode === "navigate") {
        event.respondWith(
            fetch(event.request).catch(function () {
                return caches.match(OFFLINE_URL);
            })
        );
        return;
    }

    // API / other — network-first, cached fallback
    event.respondWith(
        fetch(event.request).catch(function () {
            return caches.match(event.request);
        })
    );
});
