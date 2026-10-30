// Servidor local sin dependencias: node servidor.js  ->  http://localhost:8080
// - Sirve el juego
// - /api/config igual que en Vercel (lee las variables de .env)
// - /__guardar: solo local, lo usa herramientas/convertir.html para guardar modelos
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
// Variables de .env (FIREBASE_*, TURN_*)
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* sin .env: el modo en línea usa la config de src/firebase-config.js o el modo local */ }

const config = require('./api/config.js');
const PORT = process.env.PORT || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.fbx': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};
const SAVE_OK = /^assets\/(peleadores\/[a-z0-9_-]+\/(modelo\.glb|retrato\.png)|props\/[a-z0-9_-]+\.glb)$/;
const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

function save(req, res, rel) {
  if (!isLocal(req) || !SAVE_OK.test(rel)) { res.writeHead(403); return res.end('Ruta no permitida'); }
  const chunks = []; let size = 0;
  req.on('data', (c) => { size += c.length; if (size > 80 * 1048576) req.destroy(); else chunks.push(c); });
  req.on('end', () => {
    const file = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.concat(chunks));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, bytes: size }));
  });
}

http.createServer((req, res) => {
  const [rawPath, query = ''] = req.url.split('?');
  const url = decodeURIComponent(rawPath);
  if (url === '/api/config') return config(req, res);
  if (url === '/__guardar' && req.method === 'POST') return save(req, res, new URLSearchParams(query).get('archivo') || '');
  const file = path.normalize(path.join(ROOT, url === '/' ? 'index.html' : url));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    const head = { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes' };
    // las canciones se piden por pedazos (Range): Safari no las toca si el servidor no lo hace
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range) {
      const size = data.length, a = range[1] ? +range[1] : Math.max(0, size - +range[2]), b = range[1] && range[2] ? Math.min(+range[2], size - 1) : size - 1;
      if (a >= size || a > b) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
      res.writeHead(206, { ...head, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': b - a + 1 });
      return res.end(data.subarray(a, b + 1));
    }
    res.writeHead(200, head);
    res.end(data);
  });
}).listen(PORT, () => console.log(`Kombate de Amigos en http://localhost:${PORT}`));
