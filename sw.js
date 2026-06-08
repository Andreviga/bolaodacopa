const CACHE_NAME = "bolao-copa-2026-v17";
const APP_SHELL = [
  "./",
  "index.html",
  "bolao_copa2026.html",
  "manifest.webmanifest",
  "icons/app-icon.svg",
  "social-preview.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const request = event.request;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (!sameOrigin || url.pathname.endsWith("/backend-config.js")) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  const networkFirst = () => fetch(request, { cache: "no-store" }).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    return response;
  });

  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst()
        .catch(() => caches.match("./").then(response => response || caches.match("bolao_copa2026.html")))
    );
    return;
  }

  event.respondWith(
    networkFirst().catch(() => caches.match(request))
  );
});
