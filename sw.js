// =====================================================================
//  Service worker de FXCKS KOMBAT (app instalable)
//  - Con internet: el código siempre se pide nuevo (cada push a GitHub se ve al momento)
//    y se guarda una copia.
//  - Sin internet: abre con la copia guardada (contra la CPU o 1 vs 1).
//  - Modelos e imágenes: se usan de la copia y se actualizan en segundo plano.
//  - Firebase (tiempo real) y /api/ nunca pasan por aquí.
// =====================================================================
const VERSION = 'fxcks-v6';
const SHELL = [
  './', 'css/style.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'src/main.js', 'src/model.js', 'src/fighter.js', 'src/specials.js', 'src/specials-amigos.js', 'src/stages.js',
  'src/effects.js', 'src/audio.js', 'src/input.js', 'src/ai.js', 'src/roster.js', 'src/net.js',
  'src/firebase-config.js', 'src/props.js', 'src/touch.js', 'src/salas.js',
  'src/music.js', 'src/post.js', 'src/hud.js', 'src/ajustes.js',
];
// Librerías con versión fija: si ya están guardadas no hace falta pedirlas otra vez
const CDN = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/herramientas/')) return;
    e.respondWith(url.pathname.startsWith('/assets/') ? staleWhileRevalidate(req) : networkFirst(req));
    return;
  }
  const firebaseSdk = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  if (CDN.includes(url.hostname) || firebaseSdk) e.respondWith(cacheFirst(req));
});

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') (await caches.open(VERSION)).put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok && !res.redirected) (await caches.open(VERSION)).put(req, res.clone());
    return res;
  } catch (err) {
    // ?aislado, ?v=… también abren sin internet
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') { const home = await caches.match('./'); if (home) return home; }
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  const fresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; });
  if (hit) { fresh.catch(() => {}); return hit; }
  return fresh;
}
