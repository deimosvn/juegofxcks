import * as THREE from 'three';
import { V, clamp01, lerp, smooth, S, O, OPEN, HERO } from './cine-util.js';
import { FATALS } from './fatal.js';
import { BRUTALS } from './cine-brutal.js';
import { PISOTEO, REATA, CHOQUE, arrastreX } from './especiales-nuevos.js';
import { stretch, rope, loop, placeHorse } from './vista-nuevos.js';
import { makeTurboprop, makeBoots, makePacifier, makeDiaper, makePropellerCap, makeGuitar } from './props.js';

// =====================================================================
//  Fatalities y brutalities de cine de ABEL, DIEGO SUÁREZ y JAZIEL (los tiempos están en especiales-nuevos.js)
//  Igual que fatal.js / cine-brutal.js: shots, beats, prop, warm y view(d, t, dt, prev, data, post).
//  Anclas propias de la cámara: A = el avión de Diego Suárez · B = las botas que regresan en la reata
//  Los caballos y las notas son los de la vista de los especiales (game.vista2), los del que gana.
// =====================================================================

const passed = (prev, t, x) => prev < x && t >= x;
const live = (d, dt) => dt > 0 && !d.g.ffwd;
const loserModel = (d) => d.g.viewModel(d.g.loserSide);
const winnerModel = (d) => d.g.viewModel(d.g.winnerSide);
const herdOf = (d) => d.g.vista2?.per[d.g.winnerSide];
const notas = (d) => d.g.vista2?.notas;
const wp = (o) => o.getWorldPosition(V());
// la guitarra que trae colgada Abel mientras toca
function guitarPos(m) {
  const gt = m?.acc?.guitarra;
  if (!gt?.visible) return null;
  m.root.updateMatrixWorld(true);
  return wp(gt);
}

// ---------------------------------------------------------------- piezas
// Abel: su guitarra hecha pedazos en el piso
function brokenGuitar() {
  const g = new THREE.Group();
  const gt = makeGuitar({ cuerpo: true }); gt.rotation.set(-Math.PI / 2, 0, 0.3); gt.position.y = 0.03; g.add(gt);
  const inner = gt.children[0];
  inner.children.forEach((c, i) => { if ((i >= 3 && i <= 10) || i === 13) c.visible = false; });   // sin mástil ni cuerdas
  const wood = new THREE.MeshStandardMaterial({ color: '#6b4425', roughness: 0.6 }), black = new THREE.MeshStandardMaterial({ color: '#141418', roughness: 0.3 });
  const violet = new THREE.MeshStandardMaterial({ color: '#6a2bd9', roughness: 0.2, metalness: 0.35 });
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.05), wood); neck.position.set(0.55, 0.03, 0.25); neck.rotation.y = 0.7; g.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.03, 0.08), black); head.position.set(0.76, 0.03, 0.08); head.rotation.y = 0.7; g.add(head);
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.06 + (i % 3) * 0.03, 0.02, 0.03), i % 2 ? wood : violet);
    s.position.set(-0.4 + i * 0.17, 0.02, -0.3 + (i % 3) * 0.25); s.rotation.y = i * 1.3; g.add(s);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
// Diego Suárez: los remaches que le quedan clavados
function rivets() {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: '#d9dee3', metalness: 0.9, roughness: 0.25 });
  for (let i = 0; i < 14; i++) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10), m); r.rotation.z = Math.PI / 2; g.add(r); }
  return g;
}
// las marcas de las llantas del avión (de donde tocó el piso hasta el fondo) y la mancha donde estaba el otro
function skidMarks() {
  const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: '#0d0d0d', transparent: true, opacity: 0.55, depthWrite: false });
  for (const x of [-0.92, 0.92]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 10), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.016, -0.6); g.add(m); }
  const blood = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24), new THREE.MeshBasicMaterial({ color: '#5a0000', transparent: true, opacity: 0.8, depthWrite: false }));
  blood.rotation.x = -Math.PI / 2; blood.position.set(0, 0.018, -0.6); blood.scale.set(1, 2.2, 1); g.add(blood);
  return g;
}

// el avión de ATERRIZAJE FORZOSO: llega por encima de la cámara (z positiva) bajando hacia el fondo, toca el piso
// encima del otro en el cuadro 100, sigue rodando y en CHOQUE se estrella contra el fondo
function vuelo(t) {
  if (t < 100) { const u = 100 - t; return { z: 4.2 + u * 0.45, y: 2.35 + u * 0.16, pitch: lerp(-0.12, 0.08, smooth((t - 86) / 14)) }; }
  const k = t - 100;
  return { z: 4.2 - k * 0.45 + k * k * 0.002, y: 2.35, pitch: 0.08 * Math.max(0, 1 - k / 8) };
}

// =====================================================================
//  FATALITIES
// =====================================================================
Object.assign(FATALS, {
  // Abel: le toca una canción de cuna, el otro se encoge hasta ser un bebé (chupón y pañal)… y lo avienta a las estrellas
  cuna: {
    mood: '#ff9ad5', key: '#ffe6f4',
    shots: [OPEN(18),
      [18, 50, O('W', -0.5, 0.45, 2.6, 1.3, 1.25, 36)],
      [50, 82, S('L', -1.0, 1.1, 2.7, 'L', 0, 0.95, 0, 40), S('L', -0.8, 0.55, 2.0, 'L', 0, 0.45, 0, 38)],
      [82, 118, S('L', -0.6, 0.45, 1.5, 'L', 0, 0.38, 0, 36), S('L', -0.5, 0.42, 1.3, 'L', 0, 0.38, 0, 34)],
      [118, 152, S('M', 0, 1.2, 4.6, 'M', 0, 0.95, 0, 42), S('M', 0, 1.1, 4.2, 'M', 0, 1.0, 0, 42)],
      [152, 205, S('L', -1.0, -1.4, 5.0, 'L', 0, 0, 0, 44), S('L', -0.7, -1.8, 6.2, 'L', 0, 0, 0, 46)],
      [205, 230, S('W', 1.6, 2.6, 4.0, 'W', 0, 1.6, 0, 42), S('W', 1.2, 1.1, 2.7, 'W', 0, 1.4, 0, 35)],
      HERO(230, 268)],
    beats: [[30, { riser: 0.8 }], [52, { flash: '#ffd0ec', aberr: 0.8 }], [82, { flash: '#ffffff', fov: 3 }],
      [152, { kill: true, flash: '#ffe0f0', slow: 24 }], [205, { star: 'L' }]],
    prop: { W: [[0, 'guitarra'], [100, null]] },
    warm(d) { d.obj('chupon', makePacifier); d.obj('panal', makeDiaper); },
    view(d, t, dt, prev, data) {
      const g = d.g, lm = loserModel(d), k = data.bebe || 0;
      // la canción de cuna: notas de la guitarra a su cabeza
      const gp = t < 100 && guitarPos(winnerModel(d));
      if (gp) notas(d)?.arc(gp, d.at('Lf', 0, 0.15, 0.2), t, 5, '#ffd0ec', 0.5);
      if (!lm || g.loser.hidden) return;
      // se encoge y la cabeza le queda grandota
      if (k > 0) {
        const s = 1 - 0.52 * k;
        lm.root.scale.multiplyScalar(s);
        lm.parts?.head?.scale.setScalar(1 + 0.8 * k);
        lm.root.updateMatrixWorld(true);
        if (k > 0.35 && lm.parts?.hips) {
          const p = d.obj('panal', makeDiaper);
          p.position.copy(wp(lm.parts.hips)); p.rotation.set(0, Math.PI / 2, 0); p.scale.setScalar(0.22 * s * (0.4 + 0.6 * clamp01((k - 0.35) / 0.3)));
        }
        const face = d.bone(lm, 'head', 0.1);
        if (k > 0.6 && face) {
          const c = d.obj('chupon', makePacifier);
          c.position.copy(face).add(V(-d.f * 0.12 * (1 + 0.8 * k) * s, -0.03, 0.02)); c.rotation.set(0, Math.PI / 2, 0); c.scale.setScalar(1.3);
        }
        // llora a chorros
        if (t >= 82 && t < 152 && face && live(d, dt)) {
          for (const side of [-1, 1]) d.solid(V(face.x - d.f * 0.06, face.y, face.z + side * 0.07), { count: 1, speed: 1.8, dir: [0, 0.7, side], spread: 0.3, color: '#bfe8ff', colorEnd: '#4fb8ff', life: 0.5, size: 0.045, gravity: 9 });
        }
      }
      // volando: brillitos
      if (data.lanzado && live(d, dt)) d.glow(V(d.anchors.L.x, d.anchors.L.y + 0.4, 0), { count: 2, speed: 0.5, color: '#ffffff', colorEnd: '#ffd0ec', life: 0.4, size: 0.2 });
    },
  },

  // Diego Suárez: le da pista con las paletas a un avión de hélices que pasa por encima de la cámara, aterriza
  // encima del otro y se estrella al fondo
  aterrizaje: {
    mood: '#7fb8ff', key: '#e6f0ff',
    shots: [OPEN(14),
      [14, 40, S('W', 1.5, 1.1, 2.9, 'W', 0, 1.5, 0, 38), S('W', 1.15, 1.2, 2.5, 'W', 0, 1.55, 0, 36)],
      // desde atrás del otro: el avión viene bajando en el cielo
      [40, 66, S('L', -1.6, 0.5, -1.4, 'A', 0, 0, 0, 46), S('L', -1.5, 0.45, -1.3, 'A', 0, 0, 0, 40)],
      [66, 86, S('Lf', -0.75, 0.05, 1.45, 'Lf', 0, 0.05, 0, 34), S('Lf', -0.6, 0.0, 1.25, 'Lf', 0, 0.08, 0, 32)],
      // el avión pasa por encima de la cámara y le cae encima; sigue rodando y se estrella al fondo
      [86, 104, S('L', -2.5, 0.8, 5.0, 'L', 0, 1.3, 0, 50), S('L', -2.4, 0.75, 4.6, 'L', 0, 1.0, 0, 52)],
      [104, 136, S('L', -2.6, 1.2, 6.5, 'L', 0, 1.6, -5, 46), S('L', -2.4, 1.3, 7.2, 'L', 0, 1.9, -5, 46)],
      [136, 168, S('L', -0.5, 3.0, 5.5, 'L', 0, 0.2, 0, 44), S('L', -0.3, 2.6, 4.8, 'L', 0, 0.1, 0, 44)],
      HERO(168, 230)],
    beats: [[14, { riser: 1.4 }], [64, { sfx: 'heartbeat' }], [76, { sfx: 'heartbeat' }], [100, { kill: true, flash: '#ffffff', shake: 0.8 }],
      [CHOQUE, { flash: '#ffb060', aberr: 1, fov: 3 }]],
    prop: { W: [[0, 'paletas']] },
    warm(d) { d.obj('avion', makeTurboprop); d.obj('marcas', skidMarks); },
    view(d, t, dt, prev, data, post) {
      const x = data.x ?? d.anchors.L.x;
      if (t >= 100 || post) d.obj('marcas', skidMarks).position.set(x, 0, 0);
      // ya estrellado: se quema al fondo
      if (t >= CHOQUE || post) {
        if (live(d, dt)) {
          d.glow(V(x + (Math.random() - 0.5) * 2, 0.6, -6.4), { count: 3, speed: 2.5, dir: [0, 1, 0], spread: 0.5, color: '#fff3c0', colorEnd: '#ff4a1a', life: 0.6, size: 0.6 });
          if (Math.random() < 0.5) d.solid(V(x, 2.2, -6.6), { count: 1, speed: 1.5, dir: [0, 1, 0], spread: 0.4, color: '#3a3a3a', colorEnd: '#111111', life: 2.4, size: 1.0, grow: 2.6, drag: 0.6, gravity: -1.2 });
        }
        return;
      }
      const p = vuelo(t), plane = d.obj('avion', makeTurboprop);
      plane.position.set(x, p.y, p.z); plane.rotation.set(0, Math.PI / 2, p.pitch);
      d.anchors.A = V(x, p.y, p.z);
      for (const pr of plane.userData.props) pr.rotation.x += Math.max(dt, 1 / 60) * 45;
      if (!live(d, dt)) return;
      plane.updateMatrixWorld(true);
      for (const l of plane.userData.lights) d.glow(wp(l), { count: 1, speed: 0, color: '#ffffff', colorEnd: '#fff3c0', life: 0.06, size: 1.3 });
      // humo de las llantas al tocar el piso
      if (t >= 98) for (const s of [-1, 1]) d.solid(V(x + s * 0.92, 0.25, p.z + 0.3), { count: 4, speed: 2, dir: [0, 1, 1], spread: 0.8, color: '#e6e6e6', colorEnd: '#777777', life: 1.0, size: 0.5, grow: 2.2, drag: 1.5 });
    },
  },

  // Jaziel: lo laza, amarra la reata a su caballo, el caballo se lo lleva arrastrando… y regresa solo con las botas
  arrastre: {
    mood: '#c98b4a', key: '#ffe6c8',
    shots: [
      [0, 26, S('W', 1.4, 2.0, 2.8, 'W', 0, 1.75, 0, 40), S('W', 1.2, 1.9, 2.5, 'W', 0, 1.8, 0, 38)],
      [26, 40, S('M', 0, 1.5, 6.2, 'M', 0, 1.1, 0, 44), S('M', 0, 1.4, 5.8, 'M', 0, 1.1, 0, 44)],
      [40, 74, S('M', -0.5, 1.3, 7.8, 'M', -2.5, 1.0, -1, 48), S('M', -0.3, 1.2, 7.2, 'M', -1.5, 1.0, -1, 46)],
      [74, 90, S('W', -0.4, 1.5, 3.4, 'W', -0.6, 1.3, -1.0, 40), S('W', -0.3, 1.45, 3.1, 'W', -0.5, 1.3, -1.0, 38)],
      [90, 116, S('L', -1.8, 0.7, 3.6, 'L', 1.0, 0.8, -0.6, 46), S('L', -1.5, 0.6, 3.3, 'L', 0.5, 0.6, -0.6, 46)],
      [116, 140, S('L', -2.6, 0.9, 4.0, 'L', 0, 0.3, 0, 48), S('L', -2.4, 0.8, 3.8, 'L', 0, 0.3, 0, 48)],
      [140, 172, S('W', -1.2, 1.7, 3.2, 'W', 6, 0.9, -0.6, 42), S('W', -1.1, 1.65, 3.0, 'W', 7, 0.8, -0.6, 40)],
      [172, 186, S('Wf', 0.85, -0.1, 1.5, 'Wf', 0, -0.05, 0, 30), S('Wf', 0.75, -0.1, 1.35, 'Wf', 0, -0.03, 0, 29)],
      [186, 222, S('W', 2.4, 0.9, 6.0, 'W', 4.5, 0.8, -0.6, 44), S('W', 2.2, 0.85, 5.6, 'W', 4.0, 0.8, -0.6, 44)],
      [222, 238, S('B', -0.9, 0.5, 1.9, 'B', 0, 0.15, 0, 36), S('B', -0.8, 0.45, 1.7, 'B', 0, 0.15, 0, 34)],
      HERO(238, 270)],
    beats: [[34, { sfx: 'whip', aberr: 0.6 }], [86, { flash: '#ffd8a0', fov: 2 }], [115, { kill: true, flash: '#ffd8a0' }], [172, { shake: 0.25 }], [226, { glint: 'B' }]],
    warm(d) { d.obj('reata', rope); d.obj('lazada', loop); d.obj('botas', makeBoots); },
    view(d, t, dt, prev, data) {
      const g = d.g, P = herdOf(d), dir = data.dir ?? d.f, Z = -1.3;
      if (!P || data.hx0 == null) return;
      const H = P.horse, R = d.obj('reata', rope), lz = d.obj('lazada', loop), hand = d.anchors.Wh;
      // el caballo: llega por detrás, espera, sale a todo y regresa caminando con las botas
      let hx = null, gal = 1, face = dir, z = Z;
      if (t >= 46 && t < 70) { const u = clamp01((t - 46) / 24); hx = data.hx0 - dir * 14 * (1 - u) ** 2; gal = 1 - u * 0.8; }
      else if (t >= 70 && t < 86) { hx = data.hx0; gal = 0; }
      else if (t >= 86 && t < 176) hx = arrastreX(data, t);
      else if (t >= 176) { const u = smooth((t - 176) / 46); hx = lerp(data.hx0 + dir * 18, data.x + dir * 1.2, u); face = -dir; gal = 0.35 * (1 - u); z = -0.6; }
      if (hx != null) placeHorse(H, hx, 0, z, face, t * (gal > 0.5 ? 0.055 : 0.03), gal);
      const horn = hx != null && H.userData.horn ? (H.updateMatrixWorld(true), wp(H.userData.horn)) : null;
      const chest = V(d.anchors.L.x, d.anchors.L.y + 1.15, 0);
      if (t < 26) {
        // vueltas arriba de la cabeza
        const c = V(hand.x, hand.y + 0.2, hand.z);
        lz.position.copy(c); lz.scale.setScalar(0.5); lz.rotation.set(Math.PI / 2 + Math.sin(t * 0.55) * 0.3, 0, Math.cos(t * 0.55) * 0.3);
        stretch(R, hand, V(c.x + Math.cos(t * 0.55) * 0.5, c.y, c.z + Math.sin(t * 0.55) * 0.5));
      } else if (t < 34) {
        // vuela hacia él
        const u = (t - 26) / 8, p = hand.clone().lerp(chest, u);
        p.y += Math.sin(u * Math.PI) * 0.5;
        lz.position.copy(p); lz.scale.setScalar(0.42); lz.rotation.set(0, Math.PI / 2 - 0.5 * dir, 0);
        stretch(R, hand, p);
      } else if (!data.jalon && !g.loser.hidden) {
        // lazado del pecho; la reata en la mano de Jaziel o ya amarrada a la silla
        lz.position.copy(chest); lz.scale.setScalar(0.32); lz.rotation.set(Math.PI / 2, 0, 0);
        stretch(R, t >= 74 && horn ? horn : hand, chest);
      } else if (!g.loser.hidden && horn) {
        // lo jala de los pies
        const feet = V(d.anchors.L.x + dir * 0.75, 0.22, 0);
        lz.position.copy(feet); lz.scale.setScalar(0.18); lz.rotation.set(0, Math.PI / 2, 0);
        stretch(R, horn, feet);
        if (live(d, dt) && t % 2 < 1) d.solid(V(d.anchors.L.x, 0.1, 0), { count: 4, speed: 1.5, dir: [-dir, 0.6, 0], spread: 0.8, color: '#d8c3a0', colorEnd: '#8a7458', life: 0.8, size: 0.4, grow: 2, drag: 2 });
      } else if (t >= 176 && horn) {
        // regresa con nomás las botas en la reata
        const b = d.obj('botas', makeBoots), bx = hx + dir * REATA;
        b.position.set(bx, Math.abs(Math.sin(t * 0.3)) * 0.05, z); b.rotation.set(0, dir > 0 ? 0 : Math.PI, 0); b.scale.setScalar(1.2);
        d.anchors.B = V(bx, 0, z);
        stretch(R, horn, V(bx - dir * 0.15, 0.12, z));
        lz.position.set(bx - dir * 0.15, 0.12, z); lz.scale.setScalar(0.12); lz.rotation.set(0, Math.PI / 2, 0);
      } else { R.visible = false; lz.visible = false; }
      if (passed(prev, t, 172) && live(d, dt)) d.solid(V(data.hx0 + dir * 30, 0.5, Z), { count: 50, speed: 5, dir: [0, 1, 0], spread: 1.2, color: '#d8c3a0', colorEnd: '#8a7458', life: 1.6, size: 0.9, grow: 2.5, drag: 1.5 });
    },
  },
});

// =====================================================================
//  BRUTALITIES
// =====================================================================
Object.assign(BRUTALS, {
  // Abel: SOLO MORTAL. Cada vez más rápido: el otro cabecea, la guitarra se prende… la cabeza revienta y la guitarra se rompe en el piso
  solo_mortal: {
    mood: '#b18cff', key: '#efe2ff',
    shots: [
      [0, 26, S('W', 1.3, 1.0, 2.6, 'W', 0, 1.25, 0, 38), S('W', 1.0, 1.05, 2.25, 'W', 0, 1.3, 0, 36)],
      [26, 60, S('L', -1.0, 1.55, 2.3, 'Lf', 0, -0.05, 0, 36), S('L', -0.85, 1.5, 2.0, 'Lf', 0, -0.05, 0, 34)],
      [60, 96, O('W', -0.6, 0.6, 2.7, 1.2, 1.2, 38)],
      [96, 112, S('Lf', -0.85, 0.0, 1.35, 'Lf', 0, 0, 0, 34), S('Lf', -0.7, 0.0, 1.15, 'Lf', 0, 0, 0, 32)],
      [112, 126, S('M', 0, 1.3, 5.6, 'M', 0, 1.1, 0, 44), S('M', 0, 1.25, 5.2, 'M', 0, 1.1, 0, 44)],
      [126, 162, S('W', 1.9, 0.45, 2.6, 'W', 0.9, 0.5, 0, 42), S('W', 1.7, 0.42, 2.3, 'W', 0.9, 0.45, 0, 40)],
      HERO(162, 220)],
    beats: [[1, { riser: 0.3 }], [60, { flash: '#ff8a2a', sfx: 'fire', aberr: 0.6 }], [104, { kill: true, flash: '#b18cff' }], [141, { shake: 0.4, aberr: 1, fov: 2 }]],
    prop: { W: [[0, 'guitarra'], [120, 'guitarra_mano'], [141, 'rota']] },
    warm(d) { d.obj('rota', brokenGuitar); },
    view(d, t, dt, prev, data) {
      const lm = loserModel(d), gp = t < 104 && guitarPos(winnerModel(d)), bang = data.bang || 0;
      if (gp) {
        notas(d)?.arc(gp, d.at('Lf', 0, 0.2, 0.2), t * (1 + bang), 6, '#d9b8ff', 0.4);
        if (data.fuego && live(d, dt)) d.glow(gp, { count: 4, speed: 2.5, dir: [0, 1, 0], spread: 0.6, jitter: 0.12, color: '#fff3c0', colorEnd: '#ff4a1a', life: 0.35, size: 0.3 });
      }
      // cabecea cada vez más fuerte… hasta que revienta
      const head = lm?.parts?.head;
      if (head) {
        if (data.pop) head.scale.setScalar(0.001);
        else if (bang) head.rotation.x += Math.sin(t * (0.25 + bang * 0.5)) * (0.15 + bang * 0.55);
      }
      if (passed(prev, t, 104) && live(d, dt)) {
        const p = d.at('Lf', 0, 0.05, 0.1);
        d.glow(p, { count: 70, speed: 6, color: '#ffffff', colorEnd: '#b18cff', life: 0.5, size: 0.3 });
        for (let j = 0; j < 8; j++) notas(d)?.put(p.clone().add(V((Math.random() - 0.5) * 1.2, Math.random() * 0.8, 0.2)), 0.35, 1, '#e2ccff');
      }
      if (data.rota) { const r = d.obj('rota', brokenGuitar); r.position.set(d.anchors.W.x + d.f * 1.0, 0, 0.3); r.rotation.y = d.f > 0 ? 0 : Math.PI; }
    },
    keep(d, data) {
      const head = loserModel(d)?.parts?.head;
      if (head) head.scale.setScalar(0.001);
      if (data.rota) { const r = d.obj('rota', brokenGuitar); r.position.set(d.anchors.W.x + d.f * 1.0, 0, 0.3); r.rotation.y = d.f > 0 ? 0 : Math.PI; }
    },
  },

  // Diego Suárez: HÉLICE DE CABEZA. Lo llena de remaches como avión, le remacha un gorrito con hélice y despega dando vueltas…
  remachado: {
    mood: '#ffb000', key: '#fff1d6',
    shots: [
      [0, 22, S('Wh', 0.7, 0.15, 1.2, 'Wh', 0, 0, 0, 32), S('Wh', 0.6, 0.12, 1.05, 'Wh', 0, 0, 0, 30)],
      [22, 60, S('M', 0.2, 1.3, 3.4, 'M', 0, 1.25, 0, 40), S('M', 0.15, 1.3, 3.0, 'M', 0, 1.25, 0, 38)],
      [60, 80, S('Lf', -0.8, 0.35, 1.5, 'Lf', 0, 0.1, 0, 34), S('Lf', -0.7, 0.3, 1.3, 'Lf', 0, 0.12, 0, 32)],
      [80, 150, S('L', -1.6, -0.4, 4.4, 'L', 0, 1.0, 0, 44), S('L', -1.2, -1.4, 5.6, 'L', 0, 0.8, 0, 46)],
      [150, 168, S('L', 0, 0.5, 8.0, 'L', 0, 0.5, 0, 48), S('L', 0, 0.2, 9.0, 'L', 0, 0, 0, 50)],
      HERO(168, 220)],
    beats: [[1, { riser: 0.3 }], [62, { glint: 'Lf', sfx: 'clank' }], [70, { riser: 1.2 }], [150, { kill: true, flash: '#ffb347' }]],
    prop: { W: [[0, 'remachadora'], [62, null]] },
    warm(d) { d.obj('remaches', rivets); d.obj('gorrito', makePropellerCap); },
    view(d, t, dt, prev, data) {
      const g = d.g, L = d.anchors.L, n = data.n || 0;
      if (g.loser.hidden) return;
      if (n > 0) {
        d.obj('remaches', rivets).children.forEach((m, k) => {
          m.visible = k < n;
          m.position.set(L.x - d.f * 0.17, L.y + 0.85 + (k % 5) * 0.16 + Math.floor(k / 5) * 0.05, 0.1 + ((k * 3) % 5 - 2) * 0.06);
        });
      }
      if (data.helice) {
        const c = d.obj('gorrito', makePropellerCap), hp = d.bone(loserModel(d), 'head', 0.19) || d.at('Lf', 0, 0.08, 0);
        c.position.copy(hp);
        c.userData.prop.rotation.y += Math.max(dt, 1 / 60) * (t > 70 ? 60 : 3);
        if (t > 76 && live(d, dt)) d.glow(V(hp.x, hp.y + 0.22, hp.z), { count: 2, speed: 2.5, dir: [0, -1, 0], spread: 1.2, color: '#ffffff', colorEnd: '#bfe9ff', life: 0.25, size: 0.12 });
      }
    },
  },

  // Jaziel: ESTAMPIDA MORTAL. La manada le pasa por encima de ida y de vuelta y su caballo lo manda a volar de una coz
  pisoteado: {
    mood: '#c98b4a', key: '#ffe6c8',
    shots: [
      [0, 14, S('W', 1.2, 1.6, 2.6, 'W', 0, 1.6, 0, 38), S('W', 1.0, 1.6, 2.3, 'W', 0, 1.65, 0, 36)],
      [14, 46, S('L', 2.4, 0.35, 2.4, 'L', -4, 0.9, 0, 52), S('L', 2.2, 0.3, 2.2, 'L', -3, 0.8, 0, 52)],
      [46, 84, S('M', 0, 2.8, 8.0, 'L', 0, 0.5, 0, 46), S('M', 0, 2.6, 7.4, 'L', 0, 0.4, 0, 46)],
      [84, 110, S('L', -0.7, 0.55, 2.3, 'L', 0, 0.15, 0, 40), S('L', -0.6, 0.5, 2.0, 'L', 0, 0.15, 0, 38)],
      [110, 166, S('L', -2.8, 0.5, 4.2, 'L', 2, 0.6, 0, 48), S('L', -2.5, 0.45, 3.8, 'L', 1.5, 0.5, 0, 48)],
      [166, 182, S('L', -0.9, 0.9, 4.0, 'L', -0.9, 0.8, 0, 44), S('L', -0.8, 0.85, 3.7, 'L', -0.8, 0.8, 0, 44)],
      [182, 211, S('L', -1.0, -1.2, 5.2, 'L', 0, 0, 0, 44), S('L', -0.6, -1.6, 6.5, 'L', 0, 0, 0, 46)],
      [211, 226, S('W', 1.6, 2.6, 4.0, 'W', 0, 1.6, 0, 42), S('W', 1.2, 1.1, 2.7, 'W', 0, 1.4, 0, 35)],
      HERO(226, 265)],
    beats: [[48, { aberr: 0.8, fov: 2 }], [136, { aberr: 0.8, fov: 2 }], [175, { kill: true, flash: '#ffd8a0' }], [211, { star: 'L' }]],
    view(d, t, dt, prev, data) {
      const P = herdOf(d);
      if (!P || data.x0 == null) return;
      const C = PISOTEO, wx = d.anchors.W.x;
      P.herd.forEach((h, i) => {
        const ida = t < C.vuelta + i * C.gap;
        const dir = ida ? data.dir : -data.dir;
        const x = (ida ? data.x0 : data.x1) + dir * C.vel / 60 * (t - (ida ? C.ida : C.vuelta) - i * C.gap);
        if (Math.abs(x - data.x) > 15) return;
        const dj = x - wx, jump = ida && Math.abs(dj) < 1.9 ? 1 - (dj / 1.9) ** 2 : 0;   // a Jaziel lo brincan
        const z = i % 2 ? -0.3 : 0.3;
        placeHorse(h, x, jump * 1.75, z, dir, t * 0.06 + i * 0.37, 1, { salto: jump });
        if (live(d, dt) && Math.random() < 0.4) d.solid(V(x - dir * 0.7, 0.1, z), { count: 2, speed: 1.2, dir: [-dir, 0.5, 0], spread: 0.7, color: '#d8c3a0', colorEnd: '#8a7458', life: 0.8, size: 0.4, grow: 2, drag: 2 });
      });
      // su caballo llega, se voltea, le da la espalda… y la coz
      if (t >= 140 && t < 205) {
        const target = data.x - data.dir * 1.75, u = clamp01((t - 140) / 24);
        const hx = lerp(target - data.dir * 9, target, 1 - (1 - u) ** 2);
        const coz = Math.max(0, 1 - Math.abs(t - 176) / 7);
        placeHorse(P.horse, hx, 0, -0.9, data.dir, t * 0.05, u < 1 ? 1 - u : 0, { coz });   // un poco atrás: no se encima con Jaziel
        P.horse.rotation.y = (data.dir > 0 ? 0 : Math.PI) + smooth((t - 164) / 8) * Math.PI;
      }
    },
  },
});
