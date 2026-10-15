// Cache-first offline. Bump V when any file changes.
const V='kalvimurasu-design-v5',FILES=['./', 'assets/study-hero.png', 'index.html', 'style.css', 'app.js', 'icon.svg', 'manifest.webmanifest', 'questions-02.js', 'questions-4000.js', 'questions-5000.js', 'questions-7000.js', 'questions-expanded.js', 'questions-next.js', 'questions-samacheer.js', 'questions-subjects.js', 'questions.js'];
addEventListener('install',e=>e.waitUntil(caches.open(V).then(c=>c.addAll(FILES))));
addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('kalvimurasu-')&&k!==V).map(k=>caches.delete(k))))));
addEventListener('fetch',e=>e.respondWith(caches.open(V).then(c=>c.match(e.request)).then(r=>r||fetch(e.request))));
