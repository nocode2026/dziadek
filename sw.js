const CACHE_NAME = "dziadek-live-v14";
const APP_SHELL = [
  "./?v=14",
  "./style.css?v=14",
  "./app.js?v=14",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    })
  );
});

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
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(function () {
        return caches.match("./index.html");
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request).then(function (response) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(function (cache) {
        cache.put(event.request, copy);
      });
      return response;
    }).catch(function () {
      return caches.match(event.request);
    })
  );
});
