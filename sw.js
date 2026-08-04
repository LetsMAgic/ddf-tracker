const CACHE = 'ddf-tracker-v3.0.0';
const CORE = ['./','index.html','style.css','app.js','manifest.json','episodes-seed.js','episodes.json','apple-touch-icon.png','icon-192.png','icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const copy=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
