const CACHE = "voleiflow-shell-v1";
const DATA_CACHE = "voleiflow-data-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/VoleiFlow_logo.svg"];

self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then(async (cache) => {
  await cache.addAll(SHELL);
  const html = await (await fetch("/index.html")).text();
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match) => match[1]);
  if (assets.length) await cache.addAll(assets);
})));
self.addEventListener("activate", (event) => event.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((key) => ![CACHE, DATA_CACHE].includes(key)).map((key) => caches.delete(key))))
));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/") && /bootstrap|events|formation/.test(url.pathname)) {
    event.respondWith(fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(DATA_CACHE).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (url.origin === location.origin) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => caches.match("/index.html"))));
});
