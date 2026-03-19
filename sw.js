const CACHE_NAME = "arbitri-arene-v44";
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
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isAppShellAsset = isSameOrigin && (
    event.request.mode === "navigate" ||
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".json")
  );

  if (isAppShellAsset) {
    event.respondWith(
      fetch(event.request).then((response) => {
        const cloned = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned)).catch(() => {});
        return response;
      }).catch(() =>
        caches.match(event.request).then((cached) => cached || fetch(event.request))
      )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

self.addEventListener("push", (event) => {
  const payload = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return { title: "Nuova chiamata", body: event.data ? event.data.text() : "" };
    }
  })();
  const title = String(payload.title || "Chiamata arena");
  const body = String(payload.body || "Sei stato chiamato");
  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  const options = {
    body,
    data,
    icon: "icon.png",
    badge: "icon.png",
    requireInteraction: true
  };
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => {
        client.postMessage({ type: "push:received", payload });
      });
      const hasVisibleClient = clients.some((client) => client.visibilityState === "visible");
      if (hasVisibleClient) return null;
      return self.registration.showNotification(title, options);
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification && event.notification.data && event.notification.data.url;
  if (!targetUrl) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url === targetUrl);
      if (existing) return existing.focus();
      return self.clients.openWindow(targetUrl);
    })
  );
});
