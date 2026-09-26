const CACHE = 'flow2kw-v11';
const ASSETS = ['./','./index.html','./project.js','./manifest.json','./favicon.png','./icons/icon-192.png','./icons/icon-512.png',
  './assets/adi-logo.jpg','./assets/adi-footer.jpg','./lib/jspdf.umd.min.js','./lib/jspdf.plugin.autotable.min.js'];

// Fetch fresh copies (bypassing the browser's HTTP cache) so a new version never caches stale files.
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))));
});

// The page asks for this when the user taps "Update" (or straight away on a first install).
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
  if (e.data === 'VERSION' && e.source) e.source.postMessage({ version: CACHE });
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Pages: network first, so opening the app online always shows the latest version; cached copy offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then(res => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); }
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  // Everything else: cache first, then network.
  e.respondWith(caches.match(req).then(r => r || fetch(req).catch(() => caches.match('./index.html'))));
});
