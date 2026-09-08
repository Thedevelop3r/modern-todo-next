/**
 * A deliberately small service worker: it exists so the app is installable and
 * so a reload works offline. It never touches /api - stale todos would be worse
 * than no todos - and it never caches anything but same-origin GETs.
 */

const CACHE = "modern-todo-v1";
const SHELL = ["/", "/dashboard", "/icon.svg", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // A missing shell entry must not fail the whole install.
      .then((cache) => Promise.allSettled(SHELL.map((path) => cache.add(path))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Hashed build assets never change under the same URL: cache first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((response) => store(request, response)))
    );
    return;
  }

  // Everything else: fresh when online, the last copy when not.
  event.respondWith(
    fetch(request)
      .then((response) => store(request, response))
      .catch(() => caches.match(request).then((hit) => hit || caches.match("/dashboard")))
  );
});

function store(request, response) {
  if (response.ok && response.type === "basic") {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy));
  }
  return response;
}
