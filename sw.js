'use strict';

const CACHE_NAME = 'kings-race-v8';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './race.js',
  './bets.js',
  './game.js',
  './faces.js',
  './faces.css',
  './manifest.webmanifest',
  './assets/fonts/Card%20Characters/CARDC___.TTF',
  './assets/images/black_king.png',
  './assets/images/black_jack.webp',
  './assets/images/black_joker.webp',
  './assets/images/black_king.webp',
  './assets/images/black_queen.webp',
  './assets/images/creator.webp',
  './assets/images/group.webp',
  './assets/images/paypal.webp',
  './assets/images/pc.webp',
  './assets/images/red_jack.webp',
  './assets/images/red_joker.webp',
  './assets/images/red_king.webp',
  './assets/images/red_queen.webp'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('./index.html')));
    return;
  }

  // ponytail: code goes network-first so a deploy can't be masked by a stale cache;
  // images/fonts stay cache-first. Bumping CACHE_NAME by hand was the old, forgettable way.
  if (/\.(js|css|html)$/.test(new URL(event.request.url).pathname)) {
    event.respondWith(
      fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return response;
    }))
  );
});
