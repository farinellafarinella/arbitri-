const CACHE_NAME = "arbitri-arene-v18";
const ASSETS = [
  "./",
  "index.html",
  "tournament.html",
  "arena.html",
  "coin.html",
  "kiosk.html",
  "login.html",
  "referee.html",
  "styles.css",
  "state.js",
  "status.js",
  "auth.js",
  "admin.js",
  "arena.js",
  "coin.js",
  "kiosk.js",
  "login.js",
  "kiosk-link.js",
  "referee.js",
  "tournaments.js",
  "firebase-config.js",
  "manifest.json",
  "icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => (key === CACHE_NAME ? null : caches.delete(key))))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
