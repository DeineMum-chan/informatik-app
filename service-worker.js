/*
 * Service Worker des C-Klausurtrainers.
 *
 * Strategie:
 *  - App-Shell (HTML/CSS/JS/Icons): Cache-first. Wird bei Installation
 *    vollständig vorgeladen, danach läuft die App komplett offline.
 *  - data/questions.json: Network-first mit Cache-Fallback, damit ein
 *    aktualisierter Fragenpool beim nächsten Online-Besuch übernommen
 *    wird, offline aber die gecachte Version verfügbar bleibt.
 *
 * Beim Austausch von Dateien (z. B. neuer Fragenpool) die VERSION hochzählen,
 * damit alte Caches aufgeräumt und alle Assets neu geladen werden.
 */

const VERSION = 'ckt-v5';
const CACHE_NAME = `c-klausurtrainer-${VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/config.js',
  './js/app.js',
  './js/quiz-engine.js',
  './js/storage.js',
  './data/questions.json',
  './manifest.webmanifest',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/qrcode.png',
  './assets/fonts/montserrat-latin-400-normal.woff2',
  './assets/fonts/montserrat-latin-500-normal.woff2',
  './assets/fonts/montserrat-latin-600-normal.woff2',
  './assets/fonts/montserrat-latin-700-normal.woff2',
  './assets/fonts/montserrat-latin-800-normal.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('c-klausurtrainer-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // keine Fremd-Requests (es gibt keine)

  // API (Login/Stats-Sync) nie cachen — immer direkt zum Server.
  if (url.pathname.includes('/api/')) return;

  // Fragenpool: Netz zuerst, sonst Cache (offline).
  if (url.pathname.endsWith('/data/questions.json')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // App-Shell: Cache zuerst, sonst Netz (und nachträglich cachen).
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
