const CACHE = "resihub-static-v1";
const STATIC_TYPES = new Set(["style", "script", "image", "font"]);

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET" || !STATIC_TYPES.has(event.request.destination)) return;
    event.respondWith(caches.match(event.request).then((cached) => {
        const refresh = fetch(event.request).then((response) => {
            if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
            return response;
        }).catch(() => cached);
        return cached || refresh;
    }));
});
