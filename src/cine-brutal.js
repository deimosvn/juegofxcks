import * as THREE from 'three';
import { V, clamp01, smooth, S, O, HERO } from './cine-util.js';
import { makeFish } from './props.js';
import { camaro as buildCamaro } from './stages.js';
import { DESINSTALAR } from './brutalidades.js';

// =====================================================================
//  BRUTALITIES de cine (solo se ve: los tiempos están en brutalidades.js)
//  Igual que las fatalities de fatal.js (shots, beats, pose, mood…) y además:
//    prop   lo que trae en la mano el que gana / el que pierde: { W: [[cuadro, 'pez'], …] }
//    view(d, t, dt, prev, data, post)  cada cuadro: lo propio de cada una (la barra, el Camaro, la grieta…)
//    keep(d, data)  al final de la pelea sigue ahí (la tumba, las piernas enterradas, las marcas de llanta)
//    warm(d)        crea antes sus objetos (prewarm) para que no se trabe al salir
//  `data` es lo que guarda la simulación (brutalidades.js): d.pct, d.swell, d.crack, d.ang…
// =====================================================================

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...o });
const glowMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
const passed = (prev, t, x) => prev < x && t >= x;
const live = (d, dt) => dt > 0 && !d.g.ffwd;
const eo = (u) => 1 - (1 - clamp01(u)) ** 2;
// números al azar pero siempre iguales (las grietas y los cortes salen igual cada vez)
const seeded = (s) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
const loserModel = (d) => d.g.viewModel(d.g.loserSide);

// ---------------------------------------------------------------- Diego: DESINSTALACIÓN
// La ventana de "DIEGO.OS" (en la pantalla, arriba y del lado de Diego): primero analiza al otro, luego borra sus
// "archivos" uno por uno y al final sale el ERROR 404 con su botón de eliminar. Solo se reescribe cuando cambia.
const ARCHIVOS = ['brazo_izq.dll', 'brazo_der.dll', 'piernas.sys', 'orgullo.exe', 'cerebro.exe'];
const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let dosSide = 'izq';
// st: { mode: 'scan' | 'del' | 'err', name, scan, pct, del, blink, sel }
function dosShow(st, side, jitter) {
  const el = document.getElementById('dos');
  if (!el) return;
  el.classList.add('show'); el.classList.toggle('err', st.mode === 'err'); el.classList.toggle('der', side === 'der');
  el.style.translate = jitter ? `${(Math.random() - 0.5) * 8}px ${(Math.random() - 0.5) * 6}px` : '';
  const key = `${st.mode}|${st.name}|${st.scan}|${st.pct}|${st.del}|${st.blink}|${st.sel}`;
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  const name = escHtml(st.name), bar = (p) => `<div class="prog"><i style="--p:${p}%"></i><b>${p}%</b></div>`;
  let body;
  if (st.mode === 'scan') {
    const rows = [['NOMBRE', name, ''], ['AMENAZA', 'NULA', ''], ['ESTADO', 'DAÑADO', ''], ['SOLUCIÓN', 'DESINSTALAR', 'bad']]
      .map(([a, b, c], i) => (st.scan >= (i + 1) * 22 ? `<div class="row"><span class="dim">${a}</span><span class="${c}">${b}</span></div>` : '<div class="row">&nbsp;</div>'));
    body = `<h5>ANALIZANDO OBJETIVO…</h5>${rows.join('')}${bar(st.scan)}`;
  } else if (st.mode === 'del') {
    const rows = ARCHIVOS.map((f, i) => {
      if (st.del > i) return i === 4 ? `<div class="row"><span>✗ ${f}</span><span class="warn">NO ENCONTRADO</span></div>` : `<div class="row"><span>✓ ${f}</span><span class="ok">BORRADO</span></div>`;
      if (st.del === i) return `<div class="row cur"><span>▸ ${f}</span><span class="tag">${st.blink ? 'borrando…' : ''}</span></div>`;
      return `<div class="row dim"><span>&nbsp; ${f}</span><span></span></div>`;
    });
    body = `<h5>DESINSTALANDO: ${name}</h5>${bar(st.pct)}${rows.join('')}`;
  } else {
    body = `<div class="e404"><h4>⚠ ERROR 404</h4><div>RIVAL NO ENCONTRADO</div><div class="q">¿Eliminar los restos de ${name}?</div>`
      + `<div class="btns"><span class="${st.sel >= 2 ? 'b-ok' : st.sel >= 1 ? 'b-on' : ''}">SÍ</span><span>NO</span></div></div>`;
  }
  el.innerHTML = `<div class="dt"><span>DIEGO.OS ▸ DESINSTALADOR</span><span>–&nbsp;□&nbsp;✕</span></div><div class="body">${body}</div>`;
}
export function dosHide() {
  const el = document.getElementById('dos');
  if (el?.classList.contains('show')) { el.classList.remove('show'); el.dataset.key = ''; }
}

// el anillo del escáner que lo recorre de la cabeza a los pies
function scanRing() {
  const g = new THREE.Group();
  for (const [r0, r1, c, o] of [[0.42, 0.47, '#4fd8ff', 0.95], [0.51, 0.53, '#bff6ff', 0.55]]) {
    const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 48), glowMat(c, o));
    m.material.side = THREE.DoubleSide; m.rotation.x = -Math.PI / 2; g.add(m);
  }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.47, 40), glowMat('#4fd8ff', 0.13));
  disc.material.side = THREE.DoubleSide; disc.rotation.x = -Math.PI / 2; g.add(disc);
  return g;
}

// Cubitos (lo que queda de cada parte que borra): unos cuantos cientos, siempre los mismos (no se crean a media
// escena). `suck`: los del final, que flotan y luego se van a la papelera
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _eu = new THREE.Euler(), _sv = V(), _pv = V(), _col = new THREE.Color();
function cubePool() {
  const n = 760;
  // sólidos (como pixeles): sumados con brillo se hacían una mancha blanca
  const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff' }), n);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < n; i++) { m.setMatrixAt(i, _m4.makeScale(0, 0, 0)); m.setColorAt(i, _col.set('#4fd8ff')); }
  m.frustumCulled = false;
  m.userData = { n, p: new Float32Array(n * 3), v: new Float32Array(n * 3), r: new Float32Array(n * 3), w: new Float32Array(n * 3),
    s: new Float32Array(n), life: new Float32Array(n), suck: new Uint8Array(n), next: 0, eaten: 0, run: null };
  return m;
}
function resetCubes(pool) {
  const U = pool.userData;
  U.life.fill(0); U.next = 0; U.eaten = 0;
  for (let i = 0; i < U.n; i++) pool.setMatrixAt(i, _m4.makeScale(0, 0, 0));
  pool.instanceMatrix.needsUpdate = true;
}
// n cubitos a lo largo de la línea a → b (un brazo, una pierna) o en una bola alrededor de a (o.ball = radio)
function spawnCubes(pool, a, b, n, o = {}) {
  const U = pool.userData, cols = o.colors || ['#4fd8ff'];
  for (let k = 0; k < n; k++) {
    const i = U.next, i3 = i * 3; U.next = (U.next + 1) % U.n;
    const u = Math.random(), j = o.jitter ?? 0.07;
    let ox = (Math.random() - 0.5) * 2 * j, oy = (Math.random() - 0.5) * 2 * j, oz = (Math.random() - 0.5) * 2 * j;
    if (o.ball) { const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), r = o.ball * Math.cbrt(Math.random()); ox = r * Math.sin(ph) * Math.cos(th); oy = r * Math.cos(ph) * (o.tall ?? 1); oz = r * Math.sin(ph) * Math.sin(th); }
    U.p[i3] = a.x + (b.x - a.x) * u + ox; U.p[i3 + 1] = a.y + (b.y - a.y) * u + oy; U.p[i3 + 2] = a.z + (b.z - a.z) * u + oz;
    let dx = Math.random() - 0.5, dy = Math.random() - 0.5 + (o.up ?? 0.35), dz = Math.random() - 0.5;
    if (o.ball) { dx += ox * 2; dy += oy * 2; dz += oz * 2; }   // revienta hacia afuera
    const len = Math.hypot(dx, dy, dz) || 1, sp = (o.speed ?? 2.5) * (0.35 + Math.random());
    U.v[i3] = dx / len * sp + (o.push?.x ?? 0); U.v[i3 + 1] = dy / len * sp + (o.push?.y ?? 0); U.v[i3 + 2] = dz / len * sp + (o.push?.z ?? 0);
    for (let c = 0; c < 3; c++) { U.r[i3 + c] = Math.random() * 6; U.w[i3 + c] = (Math.random() - 0.5) * 14; }
    U.s[i] = (o.size ?? 0.05) * (0.55 + Math.random() * 0.9);
    U.life[i] = (o.life ?? 1.4) * (0.7 + Math.random() * 0.6);
    U.suck[i] = o.suck ? 1 : 0;
    pool.setColorAt(i, _col.set(cols[(Math.random() * cols.length) | 0]));
  }
  pool.instanceColor.needsUpdate = true;
}
// se mueven; con `bin` (y `pull` de 0 a 1) los de la papelera dan vueltas alrededor de ella y se meten
function stepCubes(pool, dt, bin, pull) {
  const U = pool.userData;
  for (let i = 0; i < U.n; i++) {
    if (U.life[i] <= 0) continue;
    const i3 = i * 3;
    let shrink = 1;
    if (U.suck[i] && bin && pull > 0) {
      // resorte hacia la papelera (siempre llegan) con un remolino alrededor
      const dx = bin.x - U.p[i3], dy = bin.y - U.p[i3 + 1], dz = bin.z - U.p[i3 + 2], dist = Math.hypot(dx, dy, dz) || 1e-3;
      const k = 34 * pull, sw = 7 * pull / Math.max(0.5, dist), damp = Math.exp(-(1.5 + 6 * pull) * dt);
      U.v[i3] = (U.v[i3] + (dx * k - dz / dist * sw) * dt) * damp;
      U.v[i3 + 1] = (U.v[i3 + 1] + dy * k * dt) * damp;
      U.v[i3 + 2] = (U.v[i3 + 2] + (dz * k + dx / dist * sw) * dt) * damp;
      shrink = Math.min(1, 0.2 + dist / 0.9);
      if (dist < 0.3) { U.life[i] = 0; U.eaten++; } else U.life[i] = Math.max(U.life[i], 0.4);   // no se apagan hasta entrar
    } else {
      U.life[i] -= dt;
      const damp = Math.exp(-(U.suck[i] ? 2.6 : 1.1) * dt);
      U.v[i3] *= damp; U.v[i3 + 2] *= damp;
      U.v[i3 + 1] = U.v[i3 + 1] * damp - (U.suck[i] ? 0.5 : 7.5) * dt;   // los del final casi flotan
    }
    U.p[i3] += U.v[i3] * dt; U.p[i3 + 1] += U.v[i3 + 1] * dt; U.p[i3 + 2] += U.v[i3 + 2] * dt;
    if (U.p[i3 + 1] < 0.03) { U.p[i3 + 1] = 0.03; U.v[i3 + 1] *= -0.3; U.v[i3] *= 0.6; U.v[i3 + 2] *= 0.6; }
    for (let c = 0; c < 3; c++) U.r[i3 + c] += U.w[i3 + c] * dt;
    const sc = U.life[i] > 0 ? U.s[i] * Math.min(1, U.life[i] / 0.3) * shrink : 0;
    _q.setFromEuler(_eu.set(U.r[i3], U.r[i3 + 1], U.r[i3 + 2]));
    pool.setMatrixAt(i, _m4.compose(_pv.set(U.p[i3], U.p[i3 + 1], U.p[i3 + 2]), _q, _sv.set(sc, sc, sc)));
  }
  pool.instanceMatrix.needsUpdate = true;
}
function eatAll(pool) {   // la papelera se cierra: los que faltaban se van con ella
  const U = pool.userData;
  for (let i = 0; i < U.n; i++) if (U.suck[i] && U.life[i] > 0) { U.life[i] = 0; pool.setMatrixAt(i, _m4.makeScale(0, 0, 0)); }
  pool.instanceMatrix.needsUpdate = true;
}

// su PUÑO COHETE (el mismo del especial): puño mecánico con antebrazo y propulsor; apunta hacia +x
function rocketFist() {
  const g = new THREE.Group();
  const metal = std('#b9c3cc', { metalness: 0.9, roughness: 0.28 }), dark = std('#555555', { metalness: 0.8, roughness: 0.3 });
  const add = (geo, mat, f) => { const m = new THREE.Mesh(geo, mat); f(m); g.add(m); return m; };
  add(new THREE.BoxGeometry(0.2, 0.17, 0.16), metal, (m) => { m.position.x = 0.12; });
  for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.04, 0.035, 0.035), dark, (m) => m.position.set(0.23, 0.06 - i * 0.04, 0.06));
  add(new THREE.CylinderGeometry(0.06, 0.07, 0.34, 12), metal, (m) => { m.rotation.z = Math.PI / 2; m.position.x = -0.13; });
  add(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 12), new THREE.MeshBasicMaterial({ color: '#4fd8ff' }), (m) => { m.rotation.z = Math.PI / 2; m.position.x = -0.02; });
  const flame = add(new THREE.ConeGeometry(0.08, 0.5, 10), glowMat('#ffb347', 0.9), (m) => { m.rotation.z = Math.PI / 2; m.position.x = -0.55; });
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(1.35);
  g.userData = { flame };
  return g;
}

// la papelera de reciclaje (holograma): se llena con los cubitos y al final se vacía
function binSprite() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 320;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  // (con fondo oscuro y no sumada: de día, en SIX o La Cabaña, la pura línea de luz casi no se veía)
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(1.1, 1.375, 1); s.renderOrder = 9;
  s.userData = { c, tex, key: '' };
  return s;
}
function drawBin(s, fill, emptied) {
  const u = s.userData, key = `${Math.round(fill * 20)}|${emptied}`;
  if (u.key === key) return;
  u.key = key;
  const x = u.c.getContext('2d'), C = emptied ? '#5dff6a' : '#4fd8ff';
  x.clearRect(0, 0, 256, 320);
  // el cuerpo, oscuro y transparente (como la ventana de DIEGO.OS)
  x.fillStyle = 'rgba(2, 16, 24, .6)';
  x.beginPath(); x.moveTo(64, 80); x.lineTo(192, 80); x.lineTo(178, 252); x.lineTo(78, 252); x.closePath(); x.fill();
  x.beginPath(); x.roundRect(50, 46, 156, 20, 6); x.fill();
  x.beginPath(); x.roundRect(40, 268, 176, 44, 8); x.fill();
  // lo que ya se tragó: se llena de abajo para arriba
  if (fill > 0) {
    const top = 250 - 168 * fill;
    x.fillStyle = emptied ? 'rgba(93, 255, 106, .45)' : 'rgba(79, 216, 255, .55)';
    x.beginPath(); x.moveTo(66 + (top - 82) * 0.08, top); x.lineTo(190 - (top - 82) * 0.08, top); x.lineTo(178, 250); x.lineTo(78, 250); x.closePath(); x.fill();
  }
  x.save(); x.shadowColor = C; x.shadowBlur = 18; x.strokeStyle = C; x.lineWidth = 9; x.lineJoin = 'round';
  x.beginPath(); x.roundRect(50, 46, 156, 20, 6); x.stroke();      // tapa
  x.beginPath(); x.roundRect(104, 28, 48, 18, 5); x.stroke();      // agarradera
  x.beginPath(); x.moveTo(64, 80); x.lineTo(192, 80); x.lineTo(178, 252); x.lineTo(78, 252); x.closePath(); x.stroke();
  x.lineWidth = 5;
  for (const k of [-1, 0, 1]) { x.beginPath(); x.moveTo(128 + k * 34, 104); x.lineTo(128 + k * 30, 230); x.stroke(); }
  x.restore();
  x.fillStyle = C; x.font = 'bold 30px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(emptied ? 'VACIADA ✓' : 'PAPELERA', 128, 290);
  u.tex.needsUpdate = true;
}
const XAXIS = V(1, 0, 0);
const bez = (a, b, c, u) => V(
  (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * b.x + u * u * c.x,
  (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * b.y + u * u * c.y,
  (1 - u) * (1 - u) * a.z + 2 * (1 - u) * u * b.z + u * u * c.z);

// ---------------------------------------------------------------- Alan: el Camaro y las marcas de llanta
function carModel(d) {
  const url = d.g.fighters.flatMap((f) => f.allSpecials).find((s) => s.tipo === 'camaro')?.modelo;
  const asset = url && d.g.props.get(url);
  const g = new THREE.Group();
  if (asset) {
    const car = asset.scene.clone();
    car.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.add(car);
  } else buildCamaro(g, 0, 0, 1, false);
  return g;
}
function tireMarks() {
  const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: '#0d0d0d', transparent: true, opacity: 0.5, depthWrite: false });
  for (const x of [-0.82, 0.82]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 13), mat);
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.016, -0.5); g.add(m);
  }
  const donut = new THREE.Mesh(new THREE.RingGeometry(1.5, 2.1, 40), mat); donut.rotation.x = -Math.PI / 2; donut.position.set(0, 0.017, -5); g.add(donut);
  g.userData = { mat, donut };
  return g;
}
// por dónde va el carro (z: + hacia la cámara). Pasa por encima en 19, 52 y 82 (ATROPELLOS de brutalidades.js)
function carZ(t) {
  if (t < 2) return 30;
  if (t < 30) return 24 - 28.5 * eo((t - 2) / 28);
  if (t < 40) return -4.5;
  if (t < 64) return -4.5 + 9 * smooth((t - 40) / 24);
  if (t < 72) return 4.5;
  if (t < 92) return 4.5 - 9.5 * smooth((t - 72) / 20);
  if (t < 140) return -5;
  return -5 - 26 * clamp01((t - 140) / 60) ** 2;
}

// ---------------------------------------------------------------- José: la grieta, el hoyo y la tumba
function crackDecal() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d'), rnd = seeded(11);
  x.lineCap = 'round'; x.lineJoin = 'round';
  for (let i = 0; i < 10; i++) {
    const a0 = i / 10 * Math.PI * 2 + rnd() * 0.5, len = 150 + rnd() * 90, pts = [[256, 256]];
    let px = 256, py = 256;
    for (let k = 0; k < 7; k++) { const a = a0 + (rnd() - 0.5) * 0.9; px += Math.cos(a) * len / 7; py += Math.sin(a) * len / 7; pts.push([px, py]); }
    for (const [w, col] of [[22, 'rgba(255, 80, 40, .28)'], [10, '#120604'], [3, 'rgba(255, 120, 60, .8)']]) {
      x.strokeStyle = col; x.lineWidth = w * (1 - i * 0.03);
      x.beginPath(); pts.forEach(([u, v], j) => (j ? x.lineTo(u, v) : x.moveTo(u, v))); x.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}
function holeDisc() {
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: '#050302', depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}
function tombstone() {
  const g = new THREE.Group(), stone = std('#8e9095', { roughness: 0.95 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.8, 0.18), stone); body.position.y = 0.4; g.add(body);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.18, 28), stone); top.rotation.x = Math.PI / 2; top.position.y = 0.8; g.add(top);
  const c = document.createElement('canvas'); c.width = 256; c.height = 320;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.825), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  face.position.set(0, 0.62, 0.092); g.add(face);
  const dirt = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.12, 24), std('#5a4330', { roughness: 1 })); dirt.position.y = 0.03; dirt.scale.z = 0.6; g.add(dirt);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { c, tex, name: null };
  return g;
}
function engrave(stone, name) {
  const u = stone.userData;
  if (u.name === name) return;
  u.name = name;
  const x = u.c.getContext('2d');
  x.clearRect(0, 0, 256, 320);
  x.fillStyle = '#3b3d42'; x.textAlign = 'center';
  x.font = 'bold 54px serif'; x.fillText('✝', 128, 70);
  x.font = 'bold 50px serif'; x.fillText('Q.E.P.', 128, 140);
  x.font = 'bold 30px serif'; x.fillText(name.length > 12 ? name.slice(0, 12) : name, 128, 196);
  x.font = 'italic 22px serif'; x.fillText('se lo tragó', 128, 246); x.fillText('la tierra', 128, 274);
  u.tex.needsUpdate = true;
}

// ---------------------------------------------------------------- Emi: el pez globo y sus púas
function puffer() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), std('#e8c24a', { roughness: 0.5 })));
  const spike = std('#f4e7b0');
  const rnd = seeded(5);
  for (let i = 0; i < 18; i++) {
    const v = V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 6), spike);
    c.position.copy(v).multiplyScalar(0.15); c.quaternion.setFromUnitVectors(V(0, 1, 0), v); g.add(c);
  }
  for (const s of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), std('#111')); eye.position.set(0.11, 0.05, s * 0.06); g.add(eye); }
  return g;
}
function spikes() {
  const g = new THREE.Group(), mat = std('#f1e3b0', { roughness: 0.5 });
  const n = 46, golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {   // repartidas parejo sobre una esfera
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = golden * i;
    const v = V(Math.cos(th) * r, y, Math.sin(th) * r);
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 7), mat);
    c.position.copy(v); c.quaternion.setFromUnitVectors(V(0, 1, 0), v); g.add(c);
  }
  return g;
}

// ---------------------------------------------------------------- Ramces: los cortes que quedan en el aire
function cuts() {
  const g = new THREE.Group(), rnd = seeded(23);
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.68, 32, 1, 0, 1.6 + rnd() * 0.8), glowMat('#ffffff', 0.9));
    m.material.side = THREE.DoubleSide;
    m.userData = { a: i * 2.39996, y: 0.55 + rnd() * 1.25, rz: rnd() * Math.PI * 2, s: 0.8 + rnd() * 0.7 };
    g.add(m);
  }
  return g;
}

// ---------------------------------------------------------------- las escenas
export const BRUTALS = {
  // Diego: lo levanta del cuello, lo escanea y lo DESINSTALA parte por parte (se hacen cubitos)… ERROR 404: lo
  // revienta con su PUÑO COHETE (que da la vuelta y regresa a su brazo) y los cubitos se van a la papelera
  desinstalar: {
    mood: '#4fd8ff', key: '#d8f4ff', glitch: [196, 250],
    shots: [
      // se le acerca y lo levanta del cuello: desde abajo, por detrás del otro, se ve la cara de Diego
      [0, 8, S('M', 0.35, 1.2, 3.3, 'M', 0, 1.25, 0, 40), S('M', 0.3, 1.2, 3.0, 'M', 0.1, 1.3, 0, 40)],
      [8, 36, S('L', 0.65, 0.35, 1.55, 'Wf', 0, 0.02, 0, 46), S('L', 0.55, 0.3, 1.3, 'Wf', 0, 0.05, 0, 42)],
      // el escáner y la ventana: de lado, con los dos en cuadro
      [36, 86, S('M', 0.1, 1.6, 3.5, 'M', 0.15, 1.55, 0, 40), S('M', 0.05, 1.55, 3.1, 'M', 0.15, 1.6, 0, 38)],
      // sus ojos
      [86, 98, S('Wf', 0.75, 0.0, 1.25, 'Wf', 0, -0.02, 0, 32), S('Wf', 0.68, 0.0, 1.1, 'Wf', 0, 0, 0, 30)],
      // un brazo (el del lado de la cámara)
      [98, 118, S('Lf', -0.35, -0.35, 1.7, 'Lf', 0.05, -0.35, 0, 38), S('Lf', -0.3, -0.3, 1.5, 'Lf', 0.05, -0.32, 0, 37)],
      // el otro brazo: desde arriba
      [118, 142, S('L', 0.4, 2.9, 2.3, 'Lf', 0, -0.4, 0, 42), S('L', 0.35, 2.7, 2.0, 'Lf', 0, -0.4, 0, 40)],
      // las piernas: desde abajo, de frente
      [142, 166, S('L', -0.35, 0.25, 2.5, 'L', 0, 0.75, 0, 46), S('L', -0.3, 0.22, 2.2, 'L', 0, 0.7, 0, 46)],
      // orgullo.exe, cerebro.exe… vuelta lenta con la ventana
      [166, 200, O('M', -0.45, 0.25, 4.4, 1.7, 1.55, 42)],
      // ERROR 404 (la ventana roja): lo suelta y brinca para atrás
      [200, 218, S('M', 0.1, 1.75, 3.9, 'M', 0.25, 1.55, 0, 40), S('M', 0.05, 1.7, 3.5, 'M', 0.25, 1.6, 0, 40)],
      // carga el puño: por detrás de su hombro, hacia lo que queda flotando
      [218, 236, S('W', -1.45, 1.55, 0.95, 'L', -0.7, 0.8, 0, 44), S('W', -1.3, 1.5, 0.85, 'L', -0.6, 0.9, 0, 42)],
      // ¡IMPACTO!: de lado, cerca, y se abre mientras revienta
      [236, 256, S('L', -0.6, 1.35, 2.6, 'L', 0, 1.25, 0, 40), S('L', -0.5, 1.3, 3.8, 'L', 0, 1.1, 0, 46)],
      // la papelera se traga los cubitos (y el puño regresa)
      [256, 306, S('M', 0.3, 1.25, 4.3, 'L', -0.45, 1.0, 0, 42), S('M', 0.25, 1.2, 3.8, 'L', -0.4, 0.95, 0, 40)],
      HERO(306, 335)],
    beats: [[1, { riser: 0.15 }], [8, { flash: '#4fd8ff', aberr: 0.6, fov: 2 }],
      [100, { flash: '#4fd8ff', aberr: 1.3, fov: 3, slow: 12 }], [124, { flash: '#4fd8ff', aberr: 1.3, fov: 3, slow: 12 }],
      [148, { flash: '#4fd8ff', aberr: 1.4, fov: 3, slow: 14 }], [200, { flash: '#ff2a3a', aberr: 1.5, fov: 2 }], [218, { riser: 0.27 }],
      [234, { aberr: 0.9, fov: 3, sfx: 'swoosh' }], [240, { kill: true, flash: '#bff6ff', slow: 50, shake: 0.5 }]],
    warm(d) { d.obj('anilloScan', scanRing); d.obj('cubosDiego', cubePool); d.obj('punoCohete', rocketFist); d.obj('papelera', binSprite); },
    view(d, t, dt, prev, data, post) {
      const g = d.g, X = DESINSTALAR, A = d.anchors, on = live(d, dt);
      const adt = g.hitstop > 0 || g.paused ? 0 : Math.min(0.1, dt) * (!g.session && g.slowmo > 0 ? 0.35 : 1);
      const pool = d.obj('cubosDiego', cubePool);
      if (pool.userData.run !== d.t0) { pool.userData.run = d.t0; resetCubes(pool); }
      if (post) { stepCubes(pool, adt, null, 0); return; }
      const lm = loserModel(d), wm = g.viewModel(g.winnerSide), P = lm?.parts, del = data.del || 0, gone = g.loser.hidden;
      const binPos = V(A.L.x, 0.78, 0.2);
      // lo trae del cuello: el cuello del otro va a la mano de Diego (al soltarlo regresa a donde lo deja la pelea)
      if (lm && wm && data.grab && !gone) {
        const k = data.free ? 1 - smooth((t - X.SUELTA) / 10) : smooth((t - X.AGARRE) / 5);
        const neck = d.bone(lm, 'head', -0.02);
        if (k > 0 && neck) lm.root.position.addScaledVector(V().subVectors(A.Wh, neck), k);
        if (data.free) { lm.root.rotation.order = 'ZYX'; lm.root.rotation.z = Math.sin(t * 0.09) * 0.12; }
      }
      // cada parte que borra: primero falla como señal mala… y luego se hace cubitos (antes de esconderla)
      const B = X.BORRADOS;
      for (let k = 0; k < 3; k++) {
        if (lm && !gone && t >= B[k] - 12 && t < B[k]) {
          lm.tickMaterials(0, (Math.floor(t) >> 1) % 2 ? '#4fd8ff' : '#ff2a3a', 0.45);
          lm.root.position.x += (Math.random() - 0.5) * 0.05;
        }
        if (passed(prev, t, B[k]) && on && P) {
          const limbs = k === 0 ? [['shN', 'elN', 'handN']] : k === 1 ? [['shF', 'elF', 'handF']] : [['hipN', 'knN', 'ftN'], ['hipF', 'knF', 'ftF']];
          for (const [a, b, c] of limbs) {
            const pa = d.bone(lm, a), pb = d.bone(lm, b);
            if (!pa || !pb) continue;
            const pc = (c.startsWith('hand') ? d.bone(lm, b, 0, lm.rig?.[c]) : d.bone(lm, c)) || pb;
            spawnCubes(pool, pa, pb, 46, { colors: ['#4fd8ff', '#4fd8ff', '#1f7bff', '#e8fbff', '#ff2a3a'], speed: 2.6, size: 0.055, life: 1.3 });
            spawnCubes(pool, pb, pc, 40, { colors: ['#4fd8ff', '#1f7bff', '#ff2a3a'], speed: 3, size: 0.05, life: 1.3 });
            d.glow(pa, { count: 12, speed: 3.5, color: '#ffffff', colorEnd: '#4fd8ff', life: 0.3, size: 0.1 });
            d.fx((e) => e.flash(pa, '#4fd8ff', 4));
          }
        }
      }
      // lo que ya borró no está (end() lo regresa para la siguiente pelea)
      if (P) {
        const z = 0.001;
        P.shN?.scale.setScalar(del >= 1 ? z : 1); P.shF?.scale.setScalar(del >= 2 ? z : 1);
        P.hipN?.scale.setScalar(del >= 3 ? z : 1); P.hipF?.scale.setScalar(del >= 3 ? z : 1);
      }
      // los ojos de Diego encendidos (más al escanear y al cargar el puño)
      if (wm && on && t < X.PAPELERA) {
        const big = (t >= X.ESCANEO && t < X.CARGA) || (t >= X.SUELTA + 12 && t < X.IMPACTO) ? 0.22 : 0.13;
        d.glow(wm.eyeWorld(), { count: 1, speed: 0.1, color: '#ffffff', colorEnd: '#4fd8ff', life: 0.1, size: big });
      }
      // el escáner: un anillo lo recorre de la cabeza a los pies y de regreso, con un rayo desde los ojos de Diego
      if (t >= X.ESCANEO && t < X.CARGA - 4 && !gone) {
        const u = (t - X.ESCANEO) / (X.CARGA - 4 - X.ESCANEO), h = 0.5 + 0.5 * Math.cos(u * Math.PI * 2);
        const ring = d.obj('anilloScan', scanRing), y = A.L.y + 0.08 + 1.75 * h;
        ring.position.set(A.L.x, y, 0); ring.scale.setScalar(1 + 0.08 * Math.sin(t * 0.7));
        if (lm) lm.tickMaterials(0, '#4fd8ff', 0.18 + 0.12 * Math.sin(t * 0.5));
        if (wm && d.rb) { wm.root.updateMatrixWorld(true); d.beam(d.rb.beams[0], wm.eyeWorld(), V(A.L.x, y, 0.3), 0.022 + Math.random() * 0.008, '#4fd8ff'); }
        if (on) d.glow(V(A.L.x + (Math.random() - 0.5) * 0.8, y, (Math.random() - 0.5) * 0.8), { count: 2, speed: 0.4, color: '#ffffff', colorEnd: '#4fd8ff', life: 0.3, size: 0.06 });
      }
      // la ventana de DIEGO.OS: analiza, borra archivo por archivo y al final ERROR 404 … ¿eliminar? SÍ
      // (del lado de la pantalla donde está Diego, para no tapar al otro)
      if (t >= X.ESCANEO + 6 && t < X.IMPACTO && on) {
        const sw = _pv.copy(A.Wf).project(g.camera).x, sl = _sv.copy(A.Lf).project(g.camera).x;
        if (Math.abs(sw - sl) > 0.25) dosSide = sw < sl ? 'izq' : 'der';
        const err = t >= X.D404;
        dosShow({ mode: err ? 'err' : t < X.CARGA ? 'scan' : 'del', name: g.loser.def.nombre,
          scan: Math.min(100, Math.round((t - X.ESCANEO) / (X.CARGA - X.ESCANEO) * 100)), pct: data.pct || 0, del,
          blink: (Math.floor(t) >> 3) % 2 === 0, sel: t >= X.DISPARO - 4 ? 2 : t >= X.D404 + 16 ? 1 : 0 }, dosSide, err);
      } else dosHide();
      // ERROR 404: lo que queda falla todo y flota temblando
      if (lm && !gone && t >= X.D404) {
        lm.tickMaterials(0, Math.floor(t) % 3 ? '#ff2a3a' : '#4fd8ff', 0.3 + 0.4 * Math.random());
        lm.root.position.x += (Math.random() - 0.5) * 0.07;
        if (Math.random() < 0.12) lm.root.visible = false;
      }
      // carga el puño cohete: la luz le crece en la mano
      if (t >= X.SUELTA + 12 && t < X.DISPARO && on) {
        const k = clamp01((t - X.SUELTA - 12) / (X.DISPARO - X.SUELTA - 12));
        d.glow(A.Wh, { count: 1 + Math.round(3 * k), speed: 1.2 + 2 * k, color: '#ffffff', colorEnd: '#4fd8ff', life: 0.25, size: 0.08 + 0.25 * k });
        d.light('Wh', '#4fd8ff', 2 + 7 * k);
      }
      // el PUÑO COHETE: sale de su brazo, le atraviesa el pecho, sigue de largo, da la vuelta y regresa
      if (wm?.parts?.elF && t >= X.DISPARO && t < X.REGRESA) {
        const elbow = d.bone(wm, 'elF'), target = V(A.L.x, A.L.y + 1.25, 0.1);
        let p, q;
        if (t < X.IMPACTO) { p = elbow.clone().lerp(target, (t - X.DISPARO) / (X.IMPACTO - X.DISPARO)); q = target.clone().sub(elbow); }
        else {
          const dir = target.clone().sub(elbow).setY(0).normalize();   // sigue de largo, sube hacia la cámara y regresa
          const far = target.clone().addScaledVector(dir, 3.2).add(V(0, 1.8, 2.4));
          const u = (t - X.IMPACTO) / (X.REGRESA - X.IMPACTO);
          p = bez(target, far, elbow, u); q = bez(target, far, elbow, Math.min(1, u + 0.03)).sub(p);
        }
        const fist = d.obj('punoCohete', rocketFist);
        fist.position.copy(p);
        if (q.lengthSq() > 1e-8) fist.quaternion.setFromUnitVectors(XAXIS, q.normalize());
        fist.userData.flame.scale.set(1, 0.8 + Math.random() * 0.5, 1);
        wm.parts.elF.scale.setScalar(0.001);   // ¡el antebrazo salió volando!
        if (on) d.glow(p.clone().addScaledVector(q, -0.65), { count: 3, speed: 1.5, color: '#fff3c0', colorEnd: '#ff7a1a', life: 0.3, size: 0.25 });
      }
      // ¡IMPACTO!: lo que quedaba revienta en cubitos (los que luego se traga la papelera)
      if (passed(prev, t, X.IMPACTO) && on) {
        const c = V(A.L.x, A.L.y + 1.2, 0.1);
        spawnCubes(pool, c, c, 300, { ball: 0.42, tall: 1.6, suck: true, speed: 6.5, up: 0.25, size: 0.065, life: 3,
          colors: ['#4fd8ff', '#4fd8ff', '#4fd8ff', '#1f7bff', '#e8fbff', '#ff2a3a', '#ff2a3a'] });
        spawnCubes(pool, c, c, 120, { ball: 0.3, speed: 9, up: 0.5, size: 0.05, life: 1.4, colors: ['#ff2a3a', '#b0001a', '#4fd8ff'] });
        d.glow(c, { count: 70, speed: 10, color: '#ffffff', colorEnd: '#4fd8ff', life: 0.45, size: 0.15 });
        d.fx((e) => { e.ring(A.L.x, '#4fd8ff', 5.5, 0.6); e.ring(A.L.x, '#ff2a3a', 3.5, 0.45); e.impactRing(c, '#bff6ff', 3.2); e.flash(c, '#bff6ff', 12); });
        d.sparkle(c, '#ffffff', 1.7, 0.45);
      }
      // la papelera de reciclaje: sale, se traga los cubitos dando vueltas… y se vacía
      const T0 = X.IMPACTO + 14;
      if (t >= T0 && t < X.PAPELERA + 22) {
        const bin = d.obj('papelera', binSprite), U = pool.userData;
        const inK = smooth((t - T0) / 10), outK = smooth((t - X.PAPELERA - 6) / 16);
        let sx = inK * (1 + 0.12 * Math.sin(clamp01((t - T0) / 10) * Math.PI)), sy = sx;
        if (t >= X.PAPELERA) { const sq = smooth((t - X.PAPELERA) / 6); sy *= 1 - 0.55 * sq + 0.55 * outK; sx *= 1 + 0.25 * sq; }   // se aplasta al vaciarse
        sx *= 1 - outK; sy *= 1 - outK;
        bin.scale.set(1.5 * Math.max(0.001, sx), 1.875 * Math.max(0.001, sy), 1);
        bin.position.set(binPos.x, 0.06 + bin.scale.y / 2, binPos.z);
        drawBin(bin, Math.min(1, U.eaten / 300), !!data.emptied);
        if (passed(prev, t, X.PAPELERA) && on) {
          eatAll(pool);
          d.glow(binPos, { count: 60, speed: 5, color: '#ffffff', colorEnd: '#5dff6a', life: 0.5, size: 0.18 });
          d.sparkle(V(binPos.x, 1.0, binPos.z), '#bfffd0', 1.6, 0.45);
        }
      }
      const pull = t >= T0 && t < X.PAPELERA ? smooth((t - T0) / 12) : 0;
      stepCubes(pool, adt, binPos, pull);
    },
  },

  // Alan: el Camaro lo atropella, se echa de reversa sobre él, lo vuelve a atropellar y hace donas
  atropello: {
    mood: '#ff7a1a', key: '#ffe0c0',
    shots: [
      [0, 12, S('W', 1.4, 1.3, 2.2, 'W', 0, 1.4, 0, 36), S('W', 1.15, 1.35, 1.95, 'W', 0, 1.4, 0, 34)],
      [12, 32, S('L', 2.5, 0.35, 2.5, 'L', 0, 0.6, -0.6, 50), S('L', 2.3, 0.35, 2.2, 'L', 0, 0.5, -0.6, 50)],
      [32, 46, S('W', 1.6, 1.1, 3.0, 'W', 0, 1.3, 0, 40), S('W', 1.3, 1.1, 2.6, 'W', 0, 1.35, 0, 38)],
      [46, 66, S('L', 2.4, 3.2, 4.2, 'L', 0, 0.3, 0, 46), S('L', 2.0, 3.0, 3.8, 'L', 0, 0.3, 0, 46)],
      [66, 96, S('L', 2.0, 0.3, 3.6, 'L', 0, 0.45, -1.4, 50), S('L', 1.8, 0.3, 3.2, 'L', 0, 0.45, -1.2, 50)],
      [96, 140, S('L', 0, 2.4, 8.8, 'L', 0, 0.8, -2.6, 48), S('L', 0, 2.2, 8.2, 'L', 0, 0.8, -2.6, 48)],
      [140, 180, S('L', 0.01, 4.6, 1.3, 'L', 0, 0, 0, 50), S('L', 0.01, 3.9, 1.1, 'L', 0, 0, 0, 50)],
      HERO(180, 215)],
    beats: [[19, { flash: '#ffffff', aberr: 1.2, fov: 3 }], [52, { flash: '#ffffff', aberr: 1.2, fov: 3 }], [82, { kill: true, flash: '#ffd8b0' }]],
    warm(d) { d.obj('carro', () => carModel(d)); d.obj('marcas', tireMarks); },
    view(d, t, dt, prev, data) {
      const x = data.x ?? d.anchors.L.x;
      const z = carZ(t);
      // marcas de llanta: más negras con cada pasada; y la dona al final
      if (t >= 19) {
        const m = d.obj('marcas', tireMarks);
        m.position.set(x, 0, 0);
        m.userData.mat.opacity = t >= 82 ? 0.75 : t >= 52 ? 0.55 : 0.35;
        m.userData.donut.visible = t >= 100;
      }
      if (z > 26 || z < -30) return;
      const car = d.obj('carro', () => carModel(d));
      const spin = t >= 96 && t < 136 ? Math.PI * 2 * smooth((t - 96) / 40) : 0;   // dona
      const bump = [19, 52, 82].reduce((a, c) => Math.max(a, 0.16 * (1 - Math.abs(t - c) / 3)), 0);
      car.position.set(x, Math.max(0, bump), z);
      car.rotation.set(0, Math.PI / 2 + spin, 0);
      // humo de las llantas al frenar, de reversa y en la dona
      const smoke = (t > 24 && t < 36) || (t > 58 && t < 66) || (t > 88 && t < 136) || (t > 140 && t < 160);
      if (smoke && live(d, dt)) {
        car.updateMatrixWorld(true);
        for (const s of [-0.85, 0.85]) d.solid(car.localToWorld(V(-1.45, 0.2, s)), { count: 3, speed: 1.2, jitter: 0.3, color: '#d6d6d6', colorEnd: '#5a5a5a', life: 1.0, size: 0.5, grow: 2.2, drag: 1.5, gravity: -0.4 });
      }
    },
    keep(d, data) {
      const m = d.obj('marcas', tireMarks);
      m.position.set(data.x ?? d.anchors.L.x, 0, 0);
      m.userData.mat.opacity = 0.75; m.userData.donut.visible = true;
    },
  },

  // Gera: con cada golpe la cabeza se le infla… y el gancho la revienta como piñata (¡dulces y confeti!)
  pinata: {
    mood: '#ffd23a', key: '#fff0c8',
    shots: [
      [0, 25, S('M', 0.3, 1.5, 2.6, 'M', 0, 1.45, 0, 38), S('M', 0.2, 1.5, 2.3, 'M', 0, 1.5, 0, 37)],
      [25, 50, S('Lf', -1.05, 0.0, 1.7, 'Lf', 0, 0.12, 0, 34), S('Lf', -0.9, 0.0, 1.45, 'Lf', 0, 0.15, 0, 33)],
      [50, 78, S('W', -0.55, 1.75, 1.25, 'Lf', 0, 0.15, 0, 36), S('W', -0.5, 1.75, 1.1, 'Lf', 0, 0.2, 0, 35, -0.04)],
      [78, 96, S('L', 1.1, 0.4, 2.6, 'Lf', 0, 0.35, 0, 44), S('L', 1.0, 0.35, 2.4, 'Lf', 0, 0.4, 0, 46)],
      [96, 132, S('L', 0, 1.9, 5.6, 'L', 0, 1.7, 0, 46), S('L', 0, 1.7, 6.0, 'L', 0, 1.2, 0, 46)],
      [132, 170, S('L', -1.1, 2.6, 3.1, 'L', 0, 0.3, 0, 44), S('L', -0.9, 2.4, 2.8, 'L', 0, 0.3, 0, 44)],
      HERO(170, 205)],
    beats: [[1, { riser: 0.25 }], [90, { slow: 30, sfx: 'swoosh' }], [96, { kill: true, flash: '#ffd23a' }]],
    view(d, t, dt, prev, data) {
      const lm = loserModel(d), head = lm?.parts?.head;
      if (head) {
        head.scale.setScalar(data.pop ? 0.001 : 1 + (data.swell || 0));
        if (!data.pop && data.swell) lm.tickMaterials(0, '#ff2a2a', Math.min(0.4, data.swell * 0.28));
      }
      if (passed(prev, t, 96) && live(d, dt)) {
        const p = d.anchors.Lf.clone().add(V(0, 0.2, 0.1));
        for (const c of ['#ff3b3b', '#ffd23a', '#4fd8ff', '#9be15d', '#ff7ab8', '#b05bff']) {
          d.solid(p, { count: 16, speed: 7, color: c, colorEnd: c, life: 1.8, size: 0.08, gravity: 8, drag: 0.6 });   // confeti
          d.solid(p, { count: 6, speed: 5, color: '#ffffff', colorEnd: c, life: 1.6, size: 0.15, gravity: 12, drag: 0.2 });   // dulces
        }
        d.glow(p, { count: 60, speed: 6, color: '#ffffff', colorEnd: '#ffd23a', life: 0.5, size: 0.3 });
      }
    },
    keep(d) { const head = loserModel(d)?.parts?.head; if (head) head.scale.setScalar(0.001); },
  },

  // José: menea las nalgas, el piso se abre y se lo traga… y sale una tumba
  tragado: {
    mood: '#ff7ab8', key: '#ffe0ee',
    shots: [
      [0, 30, S('W', -1.5, 1.0, 2.3, 'W', 0, 0.9, 0, 40), S('W', -1.3, 0.95, 2.1, 'W', 0, 0.9, 0, 40)],
      [30, 60, S('L', -0.8, 2.7, 2.5, 'L', 0, 0, 0, 44), S('L', -0.7, 2.4, 2.3, 'L', 0, 0, 0, 44)],
      [60, 92, S('M', 0, 1.3, 6.8, 'M', 0, 1.0, 0, 44), S('M', 0, 1.2, 6.2, 'M', 0, 0.9, 0, 44)],
      [92, 152, S('L', -1.7, 0.35, 2.5, 'L', 0, 0.7, 0, 42), S('L', -1.4, 0.3, 2.2, 'L', 0, 0.15, 0, 42)],
      [152, 168, S('L', 0, 1.7, 5.4, 'L', 0, 0.4, 0, 44), S('L', 0, 1.6, 5.0, 'L', 0, 0.4, 0, 44)],
      [168, 205, S('L', -0.95, 0.75, 2.1, 'L', 0, 0.6, 0, 38), S('L', -0.8, 0.7, 1.85, 'L', 0, 0.6, 0, 37)],
      HERO(205, 235)],
    beats: [[92, { flash: '#ff7ab8', aberr: 1, fov: 3 }], [152, { kill: true, flash: '#ffd0e8' }]],
    warm(d) { d.obj('grieta', crackDecal); d.obj('hoyo', holeDisc); d.obj('tumba', tombstone); },
    view(d, t, dt, prev, data) {
      const x = d.anchors.L.x;
      const cr = data.closed ? 0.55 : data.crack || 0;
      if (cr > 0) {
        const c = d.obj('grieta', crackDecal);
        c.position.set(x, 0.02, 0); c.scale.setScalar(0.25 + cr * 0.85);
        c.material.opacity = data.closed ? 0.75 : 1;
      }
      const sink = data.sink || 0;
      if (sink > 0 && !data.closed) {
        const h = d.obj('hoyo', holeDisc);
        h.position.set(x, 0.025, 0); h.scale.setScalar(0.25 + 0.75 * Math.min(1, sink * 3));
        if (live(d, dt) && t % 3 < 1) d.solid(V(x + (Math.random() - 0.5) * 1.6, 0.05, (Math.random() - 0.5) * 0.8), { count: 2, speed: 1.5, dir: [0, 1, 0], spread: 0.6, color: '#8a6a4a', colorEnd: '#3a2a1a', life: 0.7, size: 0.1, gravity: 9 });
      }
      if (data.tomb) {
        const s = d.obj('tumba', tombstone);
        engrave(s, d.g.loser.def.nombre);
        const k = clamp01((t - 168) / 12), pop = k < 1 ? 1.15 * Math.sin(k * Math.PI / 2) + (k > 0.7 ? -0.15 * (k - 0.7) / 0.3 : 0) : 1;
        s.position.set(x, 0, -0.2); s.scale.set(1, Math.max(0.01, pop), 1);
        if (passed(prev, t, 168) && live(d, dt)) d.solid(V(x, 0.1, -0.2), { count: 30, speed: 3, dir: [0, 1, 0], spread: 1.2, color: '#a08060', colorEnd: '#4a3a2a', life: 0.9, size: 0.18, gravity: 9 });
      }
    },
    keep(d) {
      const x = d.anchors.L.x;
      const c = d.obj('grieta', crackDecal); c.position.set(x, 0.02, 0); c.scale.setScalar(0.72); c.material.opacity = 0.75;
      const s = d.obj('tumba', tombstone); s.position.set(x, 0, -0.2); s.scale.set(1, 1, 1);
    },
  },

  // Conde: lo agarra de los tobillos y lo azota contra el piso de un lado y del otro; lo deja enterrado de cabeza
  trapo: {
    mood: '#ff7a1a', key: '#ffd8b0',
    shots: [
      [0, 14, S('W', 1.3, 0.5, 2.6, 'W', 0, 1.3, 0, 40), S('W', 1.15, 0.5, 2.4, 'W', 0, 1.3, 0, 40)],
      [14, 54, S('W', 0, 2.3, 6.6, 'W', 0, 2.0, 0, 50), S('W', 0, 2.2, 6.2, 'W', 0, 1.9, 0, 50)],
      [54, 92, S('W', 0.4, 0.4, 5.4, 'W', 0, 2.1, 0, 54), S('W', 0.3, 0.4, 5.0, 'W', 0, 1.8, 0, 54)],
      [92, 130, S('W', 2.3, 0.75, 2.5, 'W', 1.0, 0.55, 0, 40), S('W', 2.1, 0.7, 2.25, 'W', 1.0, 0.5, 0, 40)],
      [130, 180, S('W', 1.4, 1.0, 3.2, 'W', 0, 1.4, 0, 38), S('W', 1.2, 1.0, 2.9, 'W', 0, 1.4, 0, 37)],
      HERO(180, 215)],
    beats: [[34, { aberr: 0.9, fov: 2 }], [54, { aberr: 0.9, fov: 2 }], [70, { aberr: 0.9, fov: 2 }], [90, { kill: true, flash: '#ffb070' }]],
    view(d, t, dt, prev, data) {
      if (!data.grab) return;
      holdBody(d, data);
      // estela del cuerpo mientras lo azota
      if (!data.buried && live(d, dt)) {
        const L = d.anchors.L, a = data.ang ?? 0;
        d.glow(V(L.x + d.f * Math.cos(a) * 1.4, L.y + Math.sin(a) * 1.4, 0.1), { count: 3, speed: 0.5, jitter: 0.25, color: '#ffffff', colorEnd: '#ff7a1a', life: 0.25, size: 0.3 });
      }
      // ya enterrado: las piernas se sacuden tantito
      if (data.buried && live(d, dt) && t % 20 < 1) d.solid(V(d.anchors.L.x, 0.05, 0), { count: 6, speed: 1.2, dir: [0, 1, 0], spread: 0.8, color: '#8a6a4a', colorEnd: '#3a2a1a', life: 0.6, size: 0.08, gravity: 9 });
    },
    keep(d, data) { if (data.buried) holdBody(d, data); },
  },

  // Emi: pescadazos, el pez globo a la boca, se infla con púas… y revienta en lluvia de pescaditos
  pezglobo: {
    mood: '#4fb8ff', key: '#d8ecff',
    shots: [
      [0, 34, S('M', 0.2, 1.4, 2.7, 'M', 0, 1.4, 0, 40), S('M', 0.15, 1.4, 2.4, 'M', 0, 1.4, 0, 39)],
      [34, 52, S('Lf', -0.95, -0.05, 1.55, 'Lf', 0, 0, 0, 34), S('Lf', -0.85, -0.05, 1.4, 'Lf', 0, 0, 0, 33)],
      [52, 124, S('L', -0.6, 1.2, 3.7, 'L', 0, 1.4, 0, 42), S('L', -0.5, 1.6, 5.4, 'L', 0, 2.0, 0, 44)],
      [124, 160, S('L', 0, 1.9, 6.2, 'L', 0, 1.5, 0, 46), S('L', 0, 1.7, 6.6, 'L', 0, 1.0, 0, 46)],
      HERO(160, 215)],
    beats: [[44, { sfx: 'swoosh' }], [128, { kill: true, flash: '#ffd23a' }]],
    prop: { W: [[0, 'pez'], [36, null]] },
    warm(d) { d.obj('pezglobo', puffer); d.obj('pinchos', spikes); },
    view(d, t, dt, prev, data) {
      const g = d.g, lm = loserModel(d), k = data.inflate || 0;
      // el pez globo en la mano de Emi, antes de metérselo a la boca
      if (t >= 36 && t < 48) { const p = d.obj('pezglobo', puffer); p.position.copy(d.anchors.Wh); p.scale.setScalar(1 + 0.3 * Math.sin(t * 0.8)); }
      if (lm && k > 0 && !g.loser.hidden) {
        lm.root.scale.x *= 1 + 1.3 * k; lm.root.scale.y *= 1 + 0.4 * k; lm.root.scale.z *= 1 + 1.3 * k;
        lm.tickMaterials(0, '#ffd23a', 0.12 * k);
        if (k > 0.3) {
          const sp = d.obj('pinchos', spikes), L = d.anchors.L;
          sp.position.set(L.x, L.y + 1.05 * (1 + 0.4 * k), 0);
          sp.scale.setScalar(0.45 + 0.75 * k); sp.rotation.y = t * 0.02;
        }
      }
      if (passed(prev, t, 128) && live(d, dt)) {
        const c = V(d.anchors.L.x, d.anchors.L.y + 1.4, 0.1);
        d.fx((e) => {
          for (let i = 0; i < 14; i++) {
            const f = makeFish(i % 3 ? {} : { body: '#e8c24a', belly: '#fff3c0', fin: '#c49a2a' }); f.scale.setScalar(0.55 + Math.random() * 0.3);
            const v = V((Math.random() - 0.5) * 8, 4 + Math.random() * 6, (Math.random() - 0.5) * 3), spin = (Math.random() - 0.5) * 18;
            f.position.copy(c);
            e.addTemp(f, 2.4, (dt2, k) => {
              v.y -= 14 * dt2; f.position.addScaledVector(v, dt2); f.rotation.z += spin * dt2;
              if (f.position.y < 0.08) { f.position.y = 0.08; v.y = Math.abs(v.y) * 0.35; v.x *= 0.6; f.rotation.x = Math.PI / 2; }   // rebota y queda de lado
              if (k >= 1) f.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
            });
          }
        });
      }
    },
  },

  // Ramces: afila la navaja, lo atraviesa en un parpadeo y queda de espaldas… "clic": el otro se cae en pedazos
  rasurado: {
    mood: '#ff1a1a', key: '#ffe2c8',
    shots: [
      [0, 30, S('Wh', 0.62, 0.12, 1.15, 'Wh', 0, 0, 0, 30), S('Wh', 0.52, 0.1, 0.98, 'Wh', 0, 0, 0, 28)],
      [30, 40, S('M', 0, 1.3, 6.2, 'M', 0, 1.2, 0, 44), S('M', 0, 1.25, 5.8, 'M', 0, 1.2, 0, 44)],
      [40, 104, S('W', 2.4, 1.1, 1.7, 'W', -1.1, 1.3, 0, 38), S('W', 2.0, 1.1, 1.45, 'W', -1.1, 1.3, 0, 36)],
      [104, 140, S('W', 2.7, 1.0, 2.3, 'W', -1.5, 1.3, 0, 42), S('W', 2.9, 1.1, 2.6, 'W', -1.5, 1.2, 0, 44)],
      [140, 170, S('M', 0, 1.6, 6.0, 'M', 0, 1.0, 0, 46), S('M', 0, 1.5, 5.6, 'M', 0, 1.0, 0, 46)],
      HERO(170, 205)],
    beats: [[8, { glint: 'Wh' }], [20, { glint: 'Wh' }], [32, { flash: '#ffffff', aberr: 1.4, fov: 3, sfx: 'swoosh' }], [60, { riser: 0.7 }],
      [104, { glint: 'Wh' }], [110, { kill: true, flash: '#d62828' }]],
    warm(d) { d.obj('cortes', cuts); },
    view(d, t, dt, prev, data) {
      // el rayo blanco por donde pasó
      if (data.dash && t < 42 && d.rb) {
        const k = clamp01((t - 32) / 10), y = 1.3;
        d.beam(d.rb.beams[0], V(data.from, y, 0.2), V(data.from + (data.to - data.from) * Math.min(1, (t - 32) / 4), y, 0.2), 0.06 * (1 - k) + 0.005, '#ffffff');
      }
      // los cortes que se quedan en el aire alrededor del otro hasta el "clic"
      if (data.cuts && t < 112) {
        const g = d.obj('cortes', cuts), L = d.anchors.L;
        g.children.forEach((m, i) => {
          const u = m.userData, on = t >= 36 + i;
          m.visible = on;
          if (!on) return;
          m.position.set(L.x + Math.cos(u.a) * 0.25, L.y + u.y, Math.sin(u.a) * 0.25 + 0.2);
          m.rotation.set(0, 0, u.rz); m.scale.setScalar(u.s);
          m.material.opacity = t >= 104 ? 1 : 0.85 - 0.35 * clamp01((t - 36 - i) / 30);
        });
      }
    },
  },

  // Los demás: combo de ocho golpes, gancho que lo levanta… y revienta en el aire
  combo_brutal: {
    mood: '#ff2a2a', key: '#ffe2c8',
    shots: [
      [0, 24, S('M', 0.25, 1.35, 3.0, 'M', 0, 1.3, 0, 40), S('M', 0.2, 1.3, 2.7, 'M', 0, 1.3, 0, 39)],
      [24, 48, S('W', -0.6, 1.7, 1.4, 'L', 0, 1.3, 0, 38), S('W', -0.5, 1.65, 1.2, 'L', 0, 1.3, 0, 37, 0.04)],
      [48, 76, S('L', 1.0, 0.4, 2.2, 'W', 0, 1.3, 0, 46), S('L', 0.9, 0.38, 2.0, 'W', 0, 1.3, 0, 46)],
      [76, 96, S('L', 0, 1.0, 5.2, 'L', 0, 1.6, 0, 46), S('L', 0, 1.6, 5.6, 'L', 0, 3.0, 0, 48)],
      [96, 130, S('L', 0, 2.2, 6.4, 'L', 0, 2.2, 0, 48), S('L', 0, 1.8, 6.0, 'L', 0, 1.4, 0, 48)],
      HERO(130, 175)],
    beats: [[1, { riser: 0.3 }], [76, { flash: '#ffffff', aberr: 1, fov: 2 }], [96, { kill: true }]],
  },
};

// el cuerpo de la víctima de Conde apunta hacia donde va su brazo (de cabeza al final): giro sobre el eje de la pantalla
function holdBody(d, data) {
  const lm = loserModel(d);
  if (!lm?.root) return;
  const a = data.ang ?? Math.PI / 2;
  lm.root.rotation.order = 'ZYX';
  lm.root.rotation.z = Math.atan2(-d.f * Math.cos(a), Math.sin(a));
}
