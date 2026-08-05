'use strict';

const CACHE_VERSION = '13.0.0';
const CACHE_NAME = `ddf-tracker-${CACHE_VERSION}`;
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './episodes-seed.js',
  './episodes.json',
  './manifest.json',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './icon.svg',
];

async function cacheIndividually(cache, urls) {
  await Promise.allSettled(urls.map(async (url) => {
    const response = await fetch(url, { cache: 'reload' });
    if (response.ok) await cache.put(url, response);
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cacheIndividually(cache, APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('ddf-tracker-') && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  const update = fetch(request).then(async (response) => {
    if (response.ok) await cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || (await update) || Response.error();
}

async function networkFirst(request, timeoutMs = 3500) {
  const cache = await caches.open(CACHE_NAME);
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs));
  const network = fetch(request).then(async (response) => {
    if (response.ok) await cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  const response = await Promise.race([network, timeout]);
  return response || await cache.match(request, { ignoreSearch: true }) || await network || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match('./index.html') || await cache.match('./');
      const update = fetch(request).then(async (response) => {
        if (response.ok) await cache.put('./index.html', response.clone());
        return response;
      }).catch(() => null);
      return cached || await update || Response.error();
    })());
    return;
  }

  if (url.pathname.endsWith('/episodes.json')) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
