/* Letra a letra | service worker: funciona sin conexión y se actualiza solo.
   Solo borra sus propias cachés: en github.io varias apps comparten el mismo origen. */
const PREFIX = 'letra-a-letra-es-';
const VERSION = PREFIX + 'v5';
const AUDIO = 'letra-a-letra-audio-es'; /* los audios van aparte: no se borran al actualizar la app */
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

  /* audios: el índice se pide primero a la red (por si hay audios nuevos);
     los paquetes no cambian nunca de nombre, así que se sirven desde la copia guardada */
  if (url.origin === self.location.origin && url.pathname.includes('/audio/')){
    if (url.pathname.endsWith('/indice.json')){
      e.respondWith(fetch(req).then(res => {
        if (res.ok){ const copy = res.clone(); caches.open(AUDIO).then(c => c.put(url.pathname, copy)); res.clone().json().then(j => prune(url, j)).catch(() => {}); }
        return res;
      }).catch(() => caches.open(AUDIO).then(c => c.match(url.pathname))));
      return;
    }
    e.respondWith(caches.open(AUDIO).then(c => c.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }))));
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

/* borra los paquetes de audio antiguos que ya no aparecen en el índice */
function prune(url, j){
  const dir = url.pathname.replace(/indice\.json$/, '');
  const keep = new Set((j.packs || []).map(p => dir + p)); keep.add(dir + 'indice.json');
  caches.open(AUDIO).then(c => c.keys().then(ks => ks.forEach(r => { const p = new URL(r.url).pathname; if (p.startsWith(dir) && !keep.has(p)) c.delete(r); })));
}
