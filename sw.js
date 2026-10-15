// Cache-first offline shell. Bump V when questions.js or index.html change.
const V = 'v1', FILES = ['./', 'index.html', 'questions.js', 'manifest.json', 'icon.svg'];
addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(FILES))));
addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))));
addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));
