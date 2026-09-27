/* Letra a letra | service worker: funciona sin conexión y se actualiza solo.
   Solo borra sus propias cachés: en github.io varias apps comparten el mismo origen. */
const PREFIX = 'letra-a-letra-es-';
const VERSION = PREFIX + 'v3';
const SHELL = ['./', './index.html', './manifest.webmanifest', './logo.png',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* páginas: primero la red (para recibir cambios), si no hay conexión, la copia guardada */
  if (req.mode === 'navigate'){
    e.respondWith(fetch(req)
      .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put('./index.html', copy)); return res; })
      .catch(() => caches.match('./index.html')));
    return;
  }

  /* fuentes de Google: copia guardada al momento y se renueva en segundo plano */
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'){
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  /* archivos propios: primero la copia guardada */
  /* el PDF de la cartilla no se guarda: siempre se descarga la versión actual */
  if (url.pathname.endsWith('.pdf')) return;

  if (url.origin === self.location.origin){
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok){ const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    })));
  }
});
