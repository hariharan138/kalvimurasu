// Cache-first offline. Bump V when any file changes.
const V='kalvimurasu-pwa-v26',FILES=['./', 'assets/study-hero.png', 'assets/nmms-spark-logo.png', 'assets/nmms-spark-approved-logo.png', 'assets/nmms-spark-header.png', 'assets/nmms-spark-symbol.png', 'assets/nmms-spark-wordmark.png', 'assets/nmms-spark-approved-192.png', 'assets/nmms-spark-approved-512.png', 'assets/nmms-spark-approved-32.png', 'index.html', 'style.css', 'app.js', 'sheet-sync.js', 'sheet-config.js', 'student-tracking.js', 'icon.svg', 'manifest.webmanifest', 'questions-02.js', 'questions-4000.js', 'questions-5000.js', 'questions-7000.js', 'questions-expanded.js', 'questions-next.js', 'questions-samacheer.js', 'questions-subjects.js', 'questions-math-focus.js', 'questions-math-25000.js', 'questions.js'];
addEventListener('install',e=>e.waitUntil(caches.open(V).then(c=>c.addAll(FILES.map(file=>new Request(file,{cache:'reload'}))))));
addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('kalvimurasu-')&&k!==V).map(k=>caches.delete(k))))));
addEventListener('message',e=>{if(e.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();});
addEventListener('fetch',e=>{
  // Leave question feeds and student uploads on the network, independent of app caching.
  if(e.request.method!=='GET' || new URL(e.request.url).origin!==self.location.origin)return;
  e.respondWith(caches.open(V).then(c=>c.match(e.request)).then(r=>r||fetch(e.request)));
});
