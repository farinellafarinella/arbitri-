importScripts("firebase-config-sw.js?v=20260318b");
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");

const CACHE_NAME = "arbitri-arene-v27";
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
  "firebase-config-sw.js",
  "manifest.json",
  "icon.png"
];

let messaging = null;
if (self.FIREBASE_CONFIG && self.firebase && firebase.apps && firebase.apps.length === 0) {
  firebase.initializeApp(self.FIREBASE_CONFIG);
}
if (self.firebase && typeof firebase.messaging === "function") {
  messaging = firebase.messaging();
}

if (messaging && typeof messaging.onBackgroundMessage === "function") {
  messaging.onBackgroundMessage((payload) => {
    if (payload && payload.notification) return;
    const title = (payload.notification && payload.notification.title) || "Chiamata arena";
    const body = (payload.notification && payload.notification.body) || "Sei stato chiamato";
    const data = payload.data || {};
    self.registration.showNotification(title, {
      body,
      data
    });
  });
}

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
