import * as THREE from 'three';
import { V, clamp01, smooth, S, HERO } from './cine-util.js';
import { makeFish } from './props.js';
import { camaro as buildCamaro } from './stages.js';

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

// ---------------------------------------------------------------- Diego: la barra de "desinstalando"
function barSprite() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  s.scale.set(1.7, 0.425, 1); s.renderOrder = 10;
  s.userData = { c, tex, key: '' };
  return s;
}
function drawBar(s, pct, err) {
  const u = s.userData, key = pct + (err ? 'e' : '');
  if (u.key === key) return;
  u.key = key;
  const x = u.c.getContext('2d'), col = err ? '#ff3b3b' : '#4fd8ff';
  x.clearRect(0, 0, 512, 128);
  x.fillStyle = 'rgba(3, 14, 22, .85)'; x.strokeStyle = col; x.lineWidth = 4;
  x.beginPath(); x.roundRect(6, 6, 500, 116, 14); x.fill(); x.stroke();
  x.fillStyle = err ? '#ff6a6a' : '#bff6ff'; x.font = 'bold 26px monospace';
  x.fillText(err ? 'ERROR 404: RIVAL NO ENCONTRADO' : 'DESINSTALANDO RIVAL...', 24, 46);
  x.fillStyle = '#0b2a36'; x.fillRect(24, 66, 380, 34);
  x.fillStyle = col; x.fillRect(24, 66, 380 * pct / 100, 34);
  for (let i = 1; i < 10; i++) { x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(24 + i * 38, 66, 3, 34); }
  x.fillStyle = '#ffffff'; x.font = 'bold 32px monospace'; x.fillText(`${pct}%`, 416, 96);
  u.tex.needsUpdate = true;
}

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
  // Diego: ráfaga de puños de robot, lo escanea y lo "desinstala" (la imagen se descompone) … ERROR 404
  desinstalar: {
    mood: '#4fd8ff', key: '#d8f4ff', glitch: [96, 140],
    shots: [
      [0, 22, S('M', 0.2, 1.3, 3.0, 'M', 0, 1.3, 0, 40), S('M', 0.1, 1.25, 2.6, 'M', 0, 1.3, 0, 38)],
      [22, 40, S('W', -0.6, 1.65, 1.5, 'L', 0, 1.3, 0, 38), S('W', -0.5, 1.6, 1.25, 'L', 0, 1.3, 0, 36, 0.04)],
      [40, 60, S('L', 0.85, 0.45, 1.9, 'W', 0, 1.35, 0, 46), S('L', 0.7, 0.42, 1.65, 'W', 0, 1.35, 0, 44)],
      [60, 140, S('Lf', -1.3, 0.1, 2.6, 'Lf', 0, 0.25, 0, 38), S('Lf', -0.95, 0.05, 2.0, 'Lf', 0, 0.3, 0, 34)],
      [140, 175, S('L', 0, 1.6, 6.5, 'L', 0, 1.2, 0, 46), S('L', 0, 1.5, 6.0, 'L', 0, 1.1, 0, 46)],
      HERO(175, 205)],
    beats: [[1, { riser: 0.3 }], [58, { flash: '#4fd8ff', aberr: 1, fov: 2 }], [100, { sfx: 'glitch' }], [140, { kill: true, flash: '#ff2a3a' }]],
    warm(d) { d.obj('barra', barSprite); },
    view(d, t, dt, prev, data) {
      const g = d.g, L = d.anchors.L;
      if (t >= 62 && t < 150) {
        const s = d.obj('barra', barSprite);
        s.position.copy(d.anchors.Lf).add(V(0, 0.62, 0.35));
        drawBar(s, data.pct || 0, t >= 136);
      }
      const lm = loserModel(d);
      if (lm && t >= 62 && t < 140 && !g.loser.hidden) {
        const k = clamp01((t - 62) / 78);
        lm.root.position.x += (Math.random() - 0.5) * 0.09 * k;
        if (Math.random() < 0.08 + 0.12 * k) lm.root.visible = false;   // parpadea como señal mala
        lm.tickMaterials(0, Math.random() < 0.5 ? '#ff2a3a' : '#4fd8ff', 0.15 + 0.5 * k * Math.random());
        // el escaneo de los ojos de Diego
        const wm = g.viewModel(g.winnerSide);
        if (wm && d.rb && t < 136) {
          wm.root.updateMatrixWorld(true);
          const aim = V(L.x, L.y + 0.25 + (Math.sin(t * 0.21) * 0.5 + 0.5) * 1.5, 0);
          d.beam(d.rb.beams[0], wm.eyeWorld(), aim, 0.025 + Math.random() * 0.01, '#4fd8ff');
          g.scanner.visible = true; g.scanner.position.copy(aim); g.scanner.material.color.set('#4fd8ff');
          if (live(d, dt)) d.glow(aim, { count: 2, speed: 2, color: '#ffffff', colorEnd: '#4fd8ff', life: 0.2, size: 0.12 });
        }
      }
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
