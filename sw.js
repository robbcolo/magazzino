// Service worker: rende l'app disponibile anche senza internet.
// Generato automaticamente: la versione cambia quando cambia un file dell'app.
const VERSION = 'magazzino-65098962d4';
const FILES = [
  "./",
  "./css/app.css",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./index.html",
  "./js/app.js",
  "./js/codes.js",
  "./js/db.js",
  "./js/demo.js",
  "./js/icons.js",
  "./js/logic.js",
  "./js/scanner.js",
  "./js/screens/attivita.js",
  "./js/screens/fornitori.js",
  "./js/screens/home.js",
  "./js/screens/impostazioni.js",
  "./js/screens/lock.js",
  "./js/screens/magazzino.js",
  "./js/screens/ordini.js",
  "./js/screens/scansiona.js",
  "./js/shared.js",
  "./js/sheets/misc.js",
  "./js/sheets/orders.js",
  "./js/sheets/product.js",
  "./js/store.js",
  "./js/ui.js",
  "./manifest.webmanifest",
  "./vendor/preact-htm.js",
  "./vendor/qrcode.js",
  "./vendor/zxing-reader.js",
  "./vendor/zxing_reader.wasm"
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      if (req.mode === 'navigate') return (await cache.match('./index.html')) || Response.error();
      throw err;
    }
  })());
});
