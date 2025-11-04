self.addEventListener('install', e => {
  e.waitUntil(caches.open('valonia-v1').then(c => c.addAll([
    './', './index.html',
    './js/customizer.js',
    'https://cdn.jsdelivr.net/npm/fabric@5.3.0/dist/fabric.min.js',
    'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
    './assets/img/logo-valonia.png',
    './assets/img/logo-valonia_icons.png'
  ])));
});
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});