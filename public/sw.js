// Roam service worker — caches the app shell for offline-first loading.
// Strategy:
//   - App shell (HTML, JS, CSS, fonts, icons): cache-first, network fallback
//   - API calls & Supabase: network-only (handled by the app's own offline layer)
//
// To update cached assets, increment CACHE_VERSION.

const CACHE_VERSION = "roam-v4";
const SHELL_URLS = [
  // ── Pages (every route a user can navigate to) ──
  "/",
  "/trip/",
  "/guide/",
  "/sos/",
  "/new/",
  "/live/",
  "/discover/",
  "/journal/",
  "/places/",
  "/untethered/",
  "/login/",

  // ── PWA manifest + icons ──
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",

  // ── Static images used by share cards + UI ──
  "/img/roam-app-icon.png",
  "/img/roam-logo.png",
  "/img/noise.png",
  "/img/paper-texture.png",

  // ── Bundled share card fonts (offline fallback) ──
  "/fonts/PlusJakartaSans-Bold.woff2",
  "/fonts/PlusJakartaSans-ExtraBold.woff2",
  "/fonts/Syne-Bold.woff2",
];

// ── Install: pre-cache the app shell ──────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

// ── Activate: clean up old caches ─────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// ── Fetch: cache-first for navigation + assets, network-only for API ──────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Pass through: API calls, Supabase, external resources
  if (
    url.hostname !== self.location.hostname ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    request.method !== "GET"
  ) {
    return; // let browser handle normally
  }

  // Navigation requests: network-first, then try the exact cached page,
  // then fall back to cached "/" as a last resort (SPA routing).
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((exact) =>
          exact ?? caches.match("/").then((root) => root ?? Response.error()),
        ),
      ),
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Cache successful GET responses for static assets
        if (response.ok && response.type === "basic") {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    }),
  );
});
