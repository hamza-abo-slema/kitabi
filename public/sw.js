const CACHE = 'kitabi-v1';
const PRECACHE = [
  '/', '/index.html', '/css/style.css',
  '/js/audio-engine.js', '/js/detection-engine.js', '/js/app.js',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('/api/')) return;
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => r))
  );
});
