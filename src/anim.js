// =====================================================================
//  Animación de los peleadores (solo se ve: no cambia nada de la pelea)
// =====================================================================
//  animate(a, ctx) devuelve la pose de este cuadro:
//    cadera (altura, giro, inclinación), torso y cabeza; y para cada brazo y pierna
//    a dónde va la mano o el pie. model.js lo resuelve con cinemática inversa: los pies
//    se quedan plantados en el piso y los golpes llegan hasta donde está el rival.
//    Algunas poses sueltas de los especiales usan ángulos directos (fk).
//  Espacio del peleador, en metros (para alguien de 1.85 m; h escala la estatura):
//    +z hacia el rival · +y arriba · -x hacia la cámara.
//  Guardia de pelea: el lado F (lejos de la cámara) va adelante —mano y pie de guardia—
//  y el lado N (el de la cámara) atrás —la mano y la pierna de poder—, con el pecho
//  abierto hacia la cámara para que se vean las caras.
//  a   = { key, t, total, s, a, id, flip }  (t en cuadros, 60 por segundo)
//  ctx = lo que pasa en la pelea: velocidad, si va en el aire, distancia al rival…
// =====================================================================

const PI = Math.PI;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const EASE = {
  L: clamp01,
  S: smooth,
  O: (x) => 1 - (1 - clamp01(x)) ** 3,          // sale disparado y frena: un golpe que llega
  Q: (x) => 1 - (1 - clamp01(x)) ** 2,
  I: (x) => clamp01(x) ** 2,                     // arranca lento
  B: (x) => { const u = clamp01(x) - 1; return 1 + u * u * (2.7 * u + 1.7); },   // se pasa tantito y regresa
};
// Cuadros clave [[cuadro, valor, curva], …]: la curva es cómo llega a ese valor
export function kf(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (t < k[0]) { const p = keys[i - 1]; return lerp(p[1], k[1], (EASE[k[2]] || smooth)((t - p[0]) / ((k[0] - p[0]) || 1))); }
  }
  return keys[keys.length - 1][1];
}
// tiempos de un golpe: arranque (S), fin de los cuadros que pegan (A) y total (T)
const phases = (a) => { const T = a.total || 30; return { T, S: T * (a.s || 0.3), A: T * (a.a || 0.55) }; };

// Alturas a las que pega cada golpe (las mismas de MOVES en fighter.js)
const HY = { puno: 1.5, puno_fuerte: 1.45, patada: 1.25, patada_giratoria: 1.4, gancho_arriba: 1.2, patada_aerea: 0.9 };

const arm = (x, y, z, pole) => ({ ik: 1, x, y, z, pole, fk: [-0.9, 0, 0, -1.9] });
const leg = (x, z, yaw, pitch) => ({ ik: 1, x, y: 0, z, yaw, pitch, rel: 0, knee: 0, pole: null, plant: 1, fk: [0, 0, 0, 0, 0] });
const fkArm = (A, shX, shZ, elX, shY = 0) => { A.ik = 0; A.fk = [shX, shY, shZ, elX]; };
const fkLeg = (L, hipX, knX, hipZ = 0, foot = 0) => { L.ik = 0; L.plant = 0; L.fk = [hipX, 0, hipZ, knX, foot]; };
// mueve una mano (o pie) hacia un punto, w = cuánto
const toward = (o, x, y, z, w) => { o.x = lerp(o.x, x, w); o.y = lerp(o.y, y, w); o.z = lerp(o.z, z, w); };

// Guardia
function guard(h, st) {
  const gy = st.guardY || 0;
  return {
    spin: 0, tilt: 0, tiltY: 0, rootZ: 0,
    hipsY: 0.915, hipsX: 0.06, hipsYaw: -0.55, hipsRoll: 0, hipsZ: 0, hipsSide: 0,
    torsoX: 0.07, torsoY: -0.12, torsoZ: 0, headX: 0, headY: 0, headZ: 0, look: 1,
    arms: {
      F: arm(0.05 * h, (1.46 + gy) * h, 0.42 * h, [0.3, -1, -0.15]),
      N: arm(-0.07 * h, (1.5 + gy) * h, 0.22 * h, [-0.45, -1, -0.2]),
    },
    legs: {
      F: leg(0.085 * h, 0.235 * h, -0.3, 0),
      N: leg(-0.1 * h, -0.215 * h, -0.8, 0.18),
    },
  };
}

// hasta dónde llega un golpe: se detiene en el cuerpo del rival (si está lejos, se estira todo)
function reach(c, h, max, body = 0.2) {
  const d = c.dist != null ? c.dist / (c.size || 1) - body : 9;
  return Math.max(0.3 * h, Math.min(max * h, d));
}

const STYLE0 = { bounce: 1, tempo: 1, guardY: 0, victoria: 0 };

export function animate(a, c = {}) {
  const h = (c.H || 1.85) / 1.85, st = c.style || STYLE0;
  const P = guard(h, st);
  const fn = ANIMS[a.key];
  if (fn) return fn(P, a, c, h, st) === null ? null : P;
  if (OLD_KEYS.has(a.key)) return legacy(a, h, st);
  ANIMS.idle(P, a, c, h, st);
  return P;
}

// ---------------------------------------------------------------- moverse
function idle(P, a, c, h, st) {
  const s = a.t / 60, w = st.tempo * 1.6 * 2 * PI;
  const b = (1 - Math.cos(s * w)) / 2;              // rebote: 0 arriba · 1 abajo
  const b2 = (1 - Math.cos(s * w - 0.9)) / 2;       // las manos van un poquito después
  P.hipsY -= 0.022 * st.bounce * b;
  P.hipsZ += 0.012 * h * Math.sin(s * 0.8);         // pasa el peso de un pie al otro
  P.hipsYaw += 0.04 * Math.sin(s * 0.55);
  P.torsoX += 0.02 * st.bounce * b2 + 0.012 * Math.sin(s * 1.7);   // + la respiración
  P.torsoY += 0.035 * Math.sin(s * 0.55 + 1);
  P.arms.F.y -= 0.02 * h * st.bounce * b2; P.arms.N.y -= 0.016 * h * st.bounce * b2;
  P.arms.F.z += 0.025 * h * Math.sin(s * 1.25);      // la mano de adelante tantea
  P.arms.N.x += 0.012 * h * Math.sin(s * 0.9 + 2);
  P.legs.N.pitch += 0.12 * st.bounce * (1 - b);      // sobre las puntas al rebotar
  P.legs.F.pitch += 0.05 * st.bounce * (1 - b);
  P.headX += 0.025 * Math.sin(s * 0.7);
}

// Un pie en la caminata: apoyado se queda quieto en el piso (respecto al cuerpo va hacia atrás)
// y en el aire avanza al siguiente paso. Como el ciclo avanza con la distancia recorrida, no resbala.
function gait(ph, s0, sw, L) {
  const u = ((ph - s0) % 1 + 1) % 1, A = L * (1 - sw) / 2;
  if (u < sw) { const k = u / sw; return { z: -A + 2 * A * smooth(k), lift: Math.sin(PI * k), k, air: true }; }
  const k = (u - sw) / (1 - sw);
  return { z: A - 2 * A * k, lift: 0, k, air: false };
}

function walk(P, a, c, h, st, dir, L = 0.95, sw = 0.42, lift = 0.07) {
  const S = L * h;
  const odo = c.odo ?? (a.t / 60) * 3.3 * dir;
  const ph = ((odo / S) % 1 + 1) % 1;
  for (const [k, s0] of [['F', 0], ['N', 0.5]]) {
    const g = gait(ph, s0, sw, S), l = P.legs[k];
    l.z += g.z; l.y = g.lift * lift * h; l.plant = 0;
    // despega con la punta y aterriza con el pie plano
    l.pitch = g.air ? lerp(0.5, -0.1, g.k) : lerp(l.pitch, 0.45, smooth((g.k - 0.7) / 0.3));
  }
  const bob = (1 + Math.cos((ph - sw) * 4 * PI)) / 2;   // abajo cuando apoya cada pie
  P.hipsY -= 0.01 + 0.016 * bob;
  P.hipsYaw += 0.08 * Math.sin(ph * 2 * PI);
  P.torsoY -= 0.06 * Math.sin(ph * 2 * PI);
  P.torsoZ += 0.025 * Math.sin(ph * 2 * PI);
  P.torsoX += dir > 0 ? 0.06 : -0.03;
  P.arms.F.y -= 0.014 * h * bob; P.arms.N.y -= 0.012 * h * bob;
  P.arms.F.z += 0.03 * h * dir;
}

function crouch(P, h) {
  Object.assign(P, { hipsY: 0.6, hipsX: 0.22, hipsYaw: -0.5, hipsZ: -0.03 * h, torsoX: 0.3, torsoY: -0.1 });
  const F = P.legs.F, N = P.legs.N;
  Object.assign(F, { x: 0.1 * h, z: 0.3 * h, yaw: -0.25, knee: 0.15, pitch: 0 });
  Object.assign(N, { x: -0.12 * h, z: -0.22 * h, yaw: -0.85, knee: 0.05, pitch: 0.55 });
  toward(P.arms.F, 0.06 * h, 1.08 * h, 0.42 * h, 1);
  toward(P.arms.N, -0.06 * h, 1.12 * h, 0.24 * h, 1);
}

function block(P, a, c, h, low) {
  if (low) crouch(P, h);
  const y = low ? 1.12 : 1.6, z = low ? 0.36 : 0.27;
  const F = P.arms.F, N = P.arms.N;
  toward(F, 0.07 * h, y * h, z * h, 1); F.pole = [0.1, -1, 0.75];
  toward(N, -0.07 * h, (y - 0.02) * h, (z - 0.03) * h, 1); N.pole = [-0.1, -1, 0.75];
  P.torsoX += low ? 0.05 : 0.14; P.headX += 0.12; P.hipsYaw += 0.15;
  if (!low) P.hipsY -= 0.02;
  if (c.state === 'blockstun') {   // el golpe empuja la guardia contra la cara y se resbala hacia atrás
    const r = kf(a.t, [[0, 0], [2, 1, 'O'], [11, 0, 'S']]);
    P.torsoX -= 0.2 * r; P.headX -= 0.12 * r; P.hipsZ -= 0.04 * h * r;
    F.z -= 0.06 * h * r; N.z -= 0.05 * h * r; F.y += 0.02 * h * r;
    P.legs.F.plant = 0; P.legs.N.plant = 0;
  }
}

function jump(P, a, c, h) {
  const v0 = 11.5, vy = c.vy;
  // qué tanto del salto lleva: 0 despega · 0.5 arriba · 1 aterriza
  const p = vy == null ? clamp01(a.t / 43) : vy > 0 ? 0.5 * (1 - Math.min(1, vy / v0)) : 0.5 + 0.5 * Math.min(1, -vy / v0);
  const flip = a.flip ? ((c.vx ?? 1) < 0 ? -1 : 1) : 0;
  const tuck = smooth(p / 0.28) * (1 - smooth((p - 0.72) / 0.24));
  const ball = flip ? tuck : tuck * 0.65;
  Object.assign(P, { hipsY: 0.96, hipsYaw: -0.35, hipsX: 0.1 * ball, torsoX: 0.05 + (flip ? 0.45 : 0.15) * ball, torsoY: -0.1 });
  const F = P.legs.F, N = P.legs.N;
  for (const l of [F, N]) { l.plant = 0; l.rel = 1; l.pitch = 0.7; }
  Object.assign(F, { x: 0.07 * h, y: 0.5 * h * ball, z: lerp(0.17, 0.2, ball) * h });
  Object.assign(N, { x: -0.08 * h, y: 0.4 * h * ball, z: lerp(-0.13, 0.04, ball) * h });
  // los brazos suben al despegar y regresan a la guardia
  const up = 1 - smooth(p / 0.35);
  toward(P.arms.F, 0.12 * h, 1.78 * h, 0.2 * h, up); toward(P.arms.N, -0.14 * h, 1.72 * h, 0.05 * h, up);
  if (flip) {   // marometa: se hace bolita y gira sobre su centro
    P.tilt = flip * 2 * PI * smooth((p - 0.08) / 0.78); P.tiltY = 0.85 * h;
    toward(P.arms.F, 0.1 * h, 0.92 * h, 0.36 * h, ball); toward(P.arms.N, -0.1 * h, 0.9 * h, 0.32 * h, ball);
    P.look = 1 - ball;
  }
}

// ---------------------------------------------------------------- golpes
// Jab con la mano de adelante: casi sin aviso, sale recto y regresa por el mismo camino
function jab(P, a, c, h) {
  const { T, S, A } = phases(a), t = a.t, F = P.arms.F;
  const z = reach(c, h, 0.86), g = { x: F.x, y: F.y, z: F.z }, back = A + (T - A) * 0.75;
  F.z = kf(t, [[0, g.z], [S * 0.35, g.z - 0.03 * h], [S, z, 'O'], [A, z + 0.015 * h, 'L'], [back, g.z, 'S']]);
  F.y = kf(t, [[0, g.y], [S * 0.35, g.y - 0.012 * h], [S, HY.puno, 'O'], [A, HY.puno], [back, g.y, 'S']]);
  F.x = kf(t, [[0, g.x], [S, 0.01 * h, 'O'], [A, 0.01 * h], [back, g.x, 'S']]);
  F.pole = [0.65, -1, 0];
  const e = kf(t, [[0, 0], [S * 0.35, -0.15], [S, 1, 'O'], [A, 1], [T, 0, 'S']]);
  P.torsoY -= 0.32 * e; P.hipsYaw -= 0.08 * e; P.hipsZ += 0.03 * h * e; P.torsoX += 0.05 * e;
  P.headX += 0.06 * e;
  P.arms.N.y += 0.02 * h * e; P.arms.N.z -= 0.03 * h * e;   // la otra mano cuida la barbilla
  P.legs.N.pitch += 0.12 * e;
}

// Recto con la mano de atrás: carga hacia atrás, gira toda la cadera y entra con un paso
function cross(P, a, c, h) {
  const { T, S, A } = phases(a), t = a.t, N = P.arms.N, F = P.arms.F;
  const z = reach(c, h, 1.0), g = { x: N.x, y: N.y, z: N.z };
  const W = S * 0.38, back = A + (T - A) * 0.7;
  N.z = kf(t, [[0, g.z], [W, g.z - 0.06 * h], [S, z, 'O'], [A, z + 0.02 * h], [back, g.z, 'S']]);
  N.y = kf(t, [[0, g.y], [W, g.y - 0.04 * h], [S, HY.puno_fuerte, 'O'], [A, HY.puno_fuerte], [back, g.y, 'S']]);
  N.x = kf(t, [[0, g.x], [W, g.x - 0.03 * h], [S, -0.01 * h, 'O'], [A, -0.01 * h], [back, g.x, 'S']]);
  N.pole = [-0.55, -1, -0.1];
  const cover = kf(t, [[0, 0], [S, 1, 'O'], [A, 1], [T * 0.92, 0, 'S']]);   // la de adelante se va a la cara
  toward(F, 0.07 * h, 1.53 * h, 0.17 * h, cover);
  const r = kf(t, [[0, 0], [W, -0.3], [S, 1, 'O'], [A, 1.05], [T, 0, 'S']]), rp = Math.max(0, r);
  P.hipsYaw += 0.75 * r; P.torsoY += 0.55 * r;
  P.hipsZ += kf(t, [[0, 0], [W, -0.02 * h], [S, 0.08 * h, 'O'], [A, 0.08 * h], [T, 0, 'S']]);
  P.hipsY -= 0.025 * rp; P.torsoX += 0.14 * rp; P.headX += 0.04 * rp;
  // pies: el de adelante da un pasito con la embestida y el de atrás gira sobre la punta y se arrastra
  const lunge = t < A;
  P.legs.F.plant = lunge ? 0 : 1; P.legs.N.plant = lunge ? 0 : 1;
  P.legs.F.y = Math.sin(PI * clamp01((t - W * 0.5) / (S - W * 0.5))) * 0.05 * h;
  P.legs.N.pitch = lerp(P.legs.N.pitch, 0.75, rp); P.legs.N.yaw = lerp(P.legs.N.yaw, -0.15, rp); P.legs.N.knee -= 0.5 * rp;
}

// Gancho hacia arriba: se agacha, explota hacia arriba y el puño sube por el centro
function uppercut(P, a, c, h) {
  const { T, S, A } = phases(a), t = a.t, N = P.arms.N;
  const W = S * 0.55, top = A + (T - A) * 0.3, g = { x: N.x, y: N.y, z: N.z };
  const dip = kf(t, [[0, 0], [W, 1], [S, -0.4, 'O'], [A, -0.5], [top, -0.35], [T, 0, 'S']]);
  P.hipsY += -0.15 * Math.max(0, dip) + 0.06 * Math.max(0, -dip);
  P.torsoX += 0.28 * Math.max(0, dip) - 0.14 * Math.max(0, -dip);
  P.hipsZ += 0.04 * h * Math.max(0, -dip);
  const r = kf(t, [[0, 0], [W, -0.35], [S, 0.8, 'O'], [A, 0.9], [T, 0, 'S']]);
  P.hipsYaw += 0.6 * r; P.torsoY += 0.4 * r;
  N.x = kf(t, [[0, g.x], [W, -0.12 * h], [S, -0.02 * h, 'O'], [A, 0], [T, g.x, 'S']]);
  N.y = kf(t, [[0, g.y], [W, 1.0 * h], [S, 1.4 * h, 'O'], [A, 1.95 * h, 'Q'], [top, 1.9 * h], [T, g.y, 'S']]);
  N.z = kf(t, [[0, g.z], [W, 0.18 * h], [S, 0.52 * h, 'O'], [A, 0.36 * h], [top, 0.34 * h], [T, g.z, 'S']]);
  N.pole = [-0.2, -1, 0.45];
  toward(P.arms.F, 0.07 * h, 1.5 * h, 0.2 * h, Math.max(0, dip) * 0.5 + Math.max(0, -dip));
  const toes = Math.max(0, -dip);
  P.legs.N.pitch += 0.55 * toes; P.legs.F.pitch += 0.3 * toes;
  P.look = 1 - 0.4 * toes; P.headX -= 0.15 * toes;
}

// Patada circular con la pierna de atrás: recoge la rodilla, gira la cadera y la suelta
function kick(P, a, c, h) {
  const { T, S, A } = phases(a), t = a.t, L = P.legs.N, Sup = P.legs.F;
  const z = reach(c, h, 0.98, 0.32), C = S * 0.55, R1 = A + (T - A) * 0.42, R2 = A + (T - A) * 0.78;
  const g = { x: L.x, z: L.z };
  L.plant = 0; L.rel = 1;
  L.x = kf(t, [[0, g.x], [C, -0.05 * h], [S, 0, 'O'], [A, 0], [R1, -0.05 * h], [R2, g.x, 'S']]);
  L.y = kf(t, [[0, 0], [C, 0.5 * h, 'Q'], [S, HY.patada - 0.2, 'O'], [A, HY.patada - 0.17], [R1, 0.5 * h, 'S'], [R2, 0, 'I']]);
  L.z = kf(t, [[0, g.z], [C, 0.12 * h], [S, z, 'O'], [A, z + 0.02 * h], [R1, 0.08 * h, 'S'], [R2, g.z, 'S']]);
  L.pitch = kf(t, [[0, 0.18], [C, 0.9], [S, 1.15], [A, 1.15], [R2, 0.18, 'S']]);
  const knee = kf(t, [[0, 0], [C, 0.4], [S, 1, 'O'], [A, 1], [R2, 0, 'S']]);
  L.pole = [lerp(-0.1, -0.55, knee), lerp(0.35, 1, knee), lerp(1, 0.1, knee)];
  const r = kf(t, [[0, 0], [C, 0.55], [S, 1, 'O'], [A, 1.05], [R2, 0.35, 'S'], [T, 0, 'S']]);
  P.hipsYaw += 1.25 * r; P.torsoY -= 0.55 * r;
  P.torsoX -= 0.32 * r; P.torsoZ += 0.1 * r;
  P.hipsY += 0.03 * r; P.hipsZ += 0.05 * h * r; P.hipsSide += 0.03 * h * r;
  Sup.yaw = lerp(Sup.yaw, 0.55, r);   // el pie de apoyo gira con la cadera
  // el brazo del lado que patea se va hacia atrás para equilibrar; el otro cuida la cara
  toward(P.arms.N, -0.2 * h, 1.12 * h, -0.12 * h, r);
  toward(P.arms.F, 0.1 * h, 1.55 * h, 0.22 * h, r);
  P.look = 1 - 0.3 * r;
}

// Patada giratoria: da la vuelta completa y la pierna de atrás barre a la altura de la cabeza
function spinKick(P, a, c, h) {
  const { T, S, A } = phases(a), t = a.t, L = P.legs.N, Sup = P.legs.F;
  const R1 = A + (T - A) * 0.45, R2 = A + (T - A) * 0.8;
  P.spin = kf(t, [[0, 0], [S * 0.25, -0.2], [S * 1.08, 2 * PI, 'L']]);
  const z = reach(c, h, 0.95, 0.3), g = { x: L.x, z: L.z };
  L.plant = 0; L.rel = 1; Sup.plant = 0;
  L.x = kf(t, [[0, g.x], [S * 0.6, -0.04 * h], [S, 0], [A, 0], [R2, g.x, 'S']]);
  L.y = kf(t, [[0, 0], [S * 0.6, 0.45 * h, 'Q'], [S, HY.patada_giratoria - 0.2, 'O'], [A, HY.patada_giratoria - 0.18], [R1, 0.45 * h, 'S'], [R2, 0, 'I']]);
  L.z = kf(t, [[0, g.z], [S * 0.6, 0.1 * h], [S, z, 'O'], [A, z], [R1, 0.08 * h, 'S'], [R2, g.z, 'S']]);
  L.pitch = kf(t, [[0, 0.18], [S, 1.1], [A, 1.1], [R2, 0.18, 'S']]);
  L.pole = [-0.5, 1, 0.1];
  // el pie de apoyo se acomoda bajo el cuerpo para girar en su lugar
  const piv = kf(t, [[0, 0], [S * 0.3, 1, 'S'], [A, 1], [R2, 0, 'S']]);
  Sup.x = lerp(Sup.x, 0.03 * h, piv); Sup.z = lerp(Sup.z, 0.02 * h, piv); Sup.pitch = 0.4 * piv;
  P.hipsYaw = lerp(P.hipsYaw, 0.7, piv); P.torsoY -= 0.3 * piv;
  P.torsoX -= 0.35 * kf(t, [[0, 0], [S, 1, 'O'], [A, 1], [R2, 0, 'S']]);
  P.hipsY += 0.03 * piv;
  toward(P.arms.N, -0.25 * h, 1.2 * h, -0.1 * h, piv); toward(P.arms.F, 0.12 * h, 1.55 * h, 0.2 * h, piv);
  P.look = 1 - piv;   // mira por encima del hombro mientras gira
}

// Barrida: se tira al piso, apoya la mano y la pierna de atrás barre a ras del suelo
function sweep(P, a, c, h) {
  const { T, S, A } = phases(a), t = a.t, L = P.legs.N, Sup = P.legs.F;
  const D = S * 0.45, R = A + (T - A) * 0.5;
  const down = kf(t, [[0, 0], [D, 1, 'O'], [R, 1], [T, 0, 'S']]);
  P.hipsY = lerp(P.hipsY, 0.42, down); P.hipsX += 0.25 * down; P.torsoX += 0.5 * down;
  P.hipsZ -= 0.05 * h * down;
  Object.assign(Sup, { x: lerp(Sup.x, 0.14 * h, down), z: lerp(Sup.z, 0.1 * h, down), pitch: 0.65 * down, knee: Sup.knee + 0.5 * down, plant: 0 });
  const z = reach(c, h, 0.95, 0.25);
  L.plant = 0; L.rel = 1;
  L.x = kf(t, [[0, L.x], [D, -0.42 * h], [S, 0.02 * h, 'O'], [A, 0.04 * h], [R, -0.3 * h, 'S'], [T, L.x, 'S']]);
  L.z = kf(t, [[0, L.z], [D, -0.05 * h], [S, z, 'O'], [A, z], [R, -0.05 * h, 'S'], [T, L.z, 'S']]);
  L.y = kf(t, [[0, 0], [D * 0.5, 0.08 * h], [D, 0.02 * h], [R, 0.02 * h], [T, 0]]);
  L.pitch = 0.5 * down; L.pole = [-0.6, 1, 0.2];
  const r = kf(t, [[0, 0], [D, -0.6], [S, 0.6, 'O'], [A, 0.7], [T, 0, 'S']]);
  P.hipsYaw += r; P.torsoY -= 0.4 * r;
  // una mano al piso para apoyarse
  toward(P.arms.F, 0.2 * h, 0.12 * h, 0.4 * h, down); P.arms.F.pole = [0.5, 0, -1];
  toward(P.arms.N, -0.08 * h, 0.82 * h, 0.32 * h, down);
  P.look = 1 - 0.5 * down;
}

// Patada voladora: una pierna en diagonal hacia abajo y la otra recogida
function airKick(P, a, c, h) {
  const { T, S, A } = phases(a), t = a.t;
  const e = kf(t, [[0, 0], [S, 1, 'O'], [A, 1], [T, 0.7, 'S']]);
  Object.assign(P, { hipsY: 0.96, hipsYaw: lerp(-0.45, 0.25, e), hipsX: -0.1 * e, torsoX: lerp(0.25, -0.3, e), torsoY: -0.2 * e });
  const L = P.legs.N;
  Object.assign(L, { plant: 0, rel: 1, pitch: lerp(0.6, 1.1, e), pole: [-0.3, 1, 0.3],
    x: lerp(-0.06, 0, e) * h, y: lerp(0.45 * h, HY.patada_aerea - 0.72, e), z: lerp(0.12, 0.72, e) * h });
  fkLeg(P.legs.F, -1.55, 2.15, 0, 0.6);
  toward(P.arms.N, -0.3 * h, 1.3 * h, -0.2 * h, e);
  toward(P.arms.F, 0.12 * h, 1.6 * h, 0.3 * h, e);
}

// ---------------------------------------------------------------- recibir
// Golpeado: la cabeza se va para atrás (arriba), se dobla (al cuerpo) o se le dobla la pierna (abajo)
function hurt(P, a, c, h) {
  const t = a.t, D = Math.max(10, c.stun || 16), hit = c.hit || {};
  const k = hit.strong ? 1.3 : 1, sg = (a.id & 1) ? 1 : -1;
  const r = kf(t, [[0, 0], [2.2, 1, 'O'], [4.5, 0.82], [D, 0, 'S']]) * k, rw = Math.min(1, r);
  P.look = 1 - 0.75 * rw;
  const F = P.arms.F, N = P.arms.N;
  if (hit.h === 'mid') {
    P.torsoX += 0.5 * r; P.hipsX += 0.15 * r; P.headX += 0.3 * r; P.hipsZ -= 0.06 * h * r; P.hipsY -= 0.05 * r;
    toward(F, 0.05 * h, 1.12 * h, 0.24 * h, rw); toward(N, -0.06 * h, 1.16 * h, 0.17 * h, rw);
  } else if (hit.h === 'low') {
    P.hipsY -= 0.08 * r; P.torsoX += 0.22 * r; P.torsoZ += 0.15 * sg * r; P.hipsRoll += 0.08 * sg * r;
    P.legs.F.z -= 0.1 * h * rw; P.legs.F.pitch += 0.4 * rw; P.legs.F.plant = 0;
    toward(F, 0.2 * h, 1.3 * h, 0.3 * h, rw); toward(N, -0.24 * h, 1.3 * h, 0.05 * h, rw);
  } else {
    P.headX -= 0.5 * r; P.headY += 0.35 * sg * r; P.headZ += 0.18 * sg * r;
    P.torsoX -= 0.32 * r; P.torsoY += 0.18 * sg * r; P.hipsZ += 0.03 * h * r; P.hipsX -= 0.1 * r;
    toward(F, 0.22 * h, 1.3 * h, 0.14 * h, rw); toward(N, -0.26 * h, 1.32 * h, 0, rw);
  }
}

// Caer: en el aire se va de espaldas agitando brazos y piernas; al tocar el piso rebota y se queda tendido
function fall(P, a, c, h) {
  const t = a.t;
  P.look = 0;
  if (c.air ?? t < 14) {
    const vy = c.vy ?? 6 - t;
    const rot = lerp(-1.4, -0.55, clamp01(vy / 9)) * smooth(t / 5);
    Object.assign(P, { hipsX: rot, hipsYaw: -0.4, hipsY: lerp(0.9, 0.5, clamp01(-rot / 1.4)), torsoX: -0.25, torsoY: 0, headX: -0.35, headY: -0.3 });
    const w = Math.sin(t * 0.45);
    fkArm(P.arms.N, -2.5 + 0.45 * w, 0.4, -0.5); fkArm(P.arms.F, -2.2 - 0.45 * w, -0.45, -0.6);
    fkLeg(P.legs.N, -0.9 + 0.35 * w, 1.2, 0, 0.6); fkLeg(P.legs.F, -0.45 - 0.3 * w, 0.7, 0, 0.6);
    return;
  }
  // tendido boca arriba, con el rebote del golpe contra el piso
  const d = c.landT ?? Math.max(0, t - 14);
  const bo = d < 16 ? Math.sin(Math.min(1, d / 11) * PI) * Math.exp(-d / 9) : 0;
  Object.assign(P, { hipsX: -PI / 2 + 0.14 * bo, hipsYaw: -0.25, hipsY: 0.17 + 0.14 * bo, torsoX: -0.05 + 0.15 * bo, torsoY: 0, headX: 0.15 + 0.25 * bo, headY: -0.45 });
  fkArm(P.arms.N, -2.7 + 0.7 * bo, 0.45, -0.25); fkArm(P.arms.F, -2.45 + 0.5 * bo, -0.55, -0.4);
  fkLeg(P.legs.N, -0.2 - 0.5 * bo, 0.3 + 0.6 * bo, 0, 0.5); fkLeg(P.legs.F, -0.55 - 0.3 * bo, 0.9, 0, 0.5);
}

// Levantarse: recoge las piernas, se sienta, apoya los pies y se para en guardia
function getUp(P, a, c, h, st) {
  const t = a.t, G = guard(h, st);
  const k1 = kf(t, [[0, 0], [7, 1, 'S']]), k2 = kf(t, [[5, 0], [15, 1, 'S']]), k3 = kf(t, [[13, 0], [24, 1, 'S']]);
  P.hipsX = lerp(lerp(-PI / 2, -0.6, k1 * 0.4), lerp(0.45, G.hipsX, k3), k2);
  P.hipsY = lerp(0.17, lerp(0.56, G.hipsY, k3), k2);
  P.hipsZ = lerp(-0.25 * h, 0, k2);
  P.torsoX = lerp(0, lerp(0.35, G.torsoX, k3), k2);
  P.look = k2;
  fkLeg(P.legs.N, -1.3 * k1, 1.9 * k1, 0, 0.5); fkLeg(P.legs.F, -1.0 * k1, 1.6 * k1, 0, 0.5);
  P.legs.N.ik = k2; P.legs.F.ik = k2;   // a la mitad ya apoya los pies
  P.legs.F.z = lerp(0.3 * h, G.legs.F.z, k3); P.legs.N.z = lerp(0.02 * h, G.legs.N.z, k3);
  fkArm(P.arms.N, lerp(-0.4, -1.0, k1), 0.5, -0.6); fkArm(P.arms.F, lerp(-0.3, -0.9, k1), -0.5, -0.7);
  P.arms.N.ik = k3; P.arms.F.ik = k3;
}

function dizzy(P, a, c, h) {
  const s = a.t / 60;
  Object.assign(P, {
    hipsSide: 0.04 * h * Math.sin(s * 2.1), hipsZ: 0.03 * h * Math.cos(s * 1.7), hipsY: 0.87 + 0.025 * Math.sin(s * 3.4),
    hipsYaw: -0.35, torsoZ: 0.22 * Math.sin(s * 2.1 - 0.6), torsoX: 0.2 + 0.08 * Math.sin(s * 1.7), torsoY: 0,
    headZ: 0.3 * Math.sin(s * 2.1 - 1.2), headX: 0.35 + 0.1 * Math.sin(s * 1.3), look: 0.3,
  });
  fkArm(P.arms.N, 0.12 + 0.15 * Math.sin(s * 2.1 - 0.8), 0.12, -0.35);
  fkArm(P.arms.F, 0.08 - 0.12 * Math.sin(s * 2.1 - 1.1), -0.12, -0.45);
  Object.assign(P.legs.F, { x: 0.12 * h, z: 0.17 * h, yaw: -0.2 }); Object.assign(P.legs.N, { x: -0.14 * h, z: -0.15 * h, yaw: -0.6, pitch: 0 });
}

// ---------------------------------------------------------------- fatalities (fatal.js)
// Miedo: ve venir lo que le va a caer, se echa para atrás y se cubre la cara, temblando
function fear(P, a, c, h) {
  const k = kf(a.t, [[0, 0], [8, 1, 'O']]), tr = Math.sin(a.t * 1.9) * 0.012 * k;
  Object.assign(P, { hipsY: lerp(P.hipsY, 0.86, k), hipsYaw: lerp(P.hipsYaw, -0.8, k), hipsX: -0.06 * k, hipsZ: -0.06 * h * k,
    torsoX: lerp(P.torsoX, -0.28, k) + tr, torsoY: lerp(P.torsoY, -0.25, k), headX: -0.5 * k, look: 1 - 0.85 * k });
  toward(P.arms.F, 0.14 * h, (1.76 + tr) * h, 0.34 * h, k); P.arms.F.pole = [0.6, -0.6, 0.4];
  toward(P.arms.N, -0.15 * h, (1.72 - tr) * h, 0.3 * h, k); P.arms.N.pole = [-0.6, -0.6, 0.4];
  P.legs.F.z = lerp(P.legs.F.z, 0.12 * h, k); P.legs.N.z = lerp(P.legs.N.z, -0.3 * h, k); P.legs.N.pitch = 0.3 * k;
}

// Atrapado (rayos, láser, energía): rígido, brazos abiertos, de puntitas y sacudiéndose
function trapped(P, a, c, h) {
  const k = kf(a.t, [[0, 0], [6, 1, 'O']]), s = Math.sin(a.t * 2.7) * 0.035 * k, s2 = Math.sin(a.t * 3.3 + 1) * 0.035 * k;
  Object.assign(P, { hipsY: lerp(P.hipsY, 0.97, k), hipsYaw: lerp(P.hipsYaw, -0.5, k), torsoX: lerp(P.torsoX, -0.18, k) + s, torsoY: lerp(P.torsoY, 0, k),
    torsoZ: s2, headX: -0.35 * k + s2, headZ: s, look: 1 - k });
  fkArm(P.arms.N, lerp(-1.0, -0.35, k) + s, lerp(0.1, 0.8, k) + s2, lerp(-1.8, -0.25, k));
  fkArm(P.arms.F, lerp(-0.9, -0.35, k) - s2, lerp(-0.1, -0.8, k) - s, lerp(-1.9, -0.25, k));
  Object.assign(P.legs.F, { z: lerp(P.legs.F.z, 0.1 * h, k), pitch: 0.55 * k }); Object.assign(P.legs.N, { z: lerp(P.legs.N.z, -0.1 * h, k), pitch: 0.55 * k });
}

// Saludo militar (Alan despidiendo a su cohete): firmes, la mano en la frente, mirando al cielo
function salute(P, a, c, h) {
  const k = kf(a.t, [[0, 0], [10, 1, 'B']]);
  Object.assign(P, { hipsY: lerp(P.hipsY, 0.975, k), hipsYaw: lerp(P.hipsYaw, -0.9, k), hipsX: lerp(P.hipsX, 0, k), torsoX: lerp(P.torsoX, -0.1, k),
    torsoY: lerp(P.torsoY, -0.05, k), headX: -0.55 * k, look: 1 - k });
  toward(P.arms.N, -0.05 * h, 1.73 * h, 0.13 * h, k); P.arms.N.pole = [-1, 0.25, 0.15];
  toward(P.arms.F, 0.19 * h, 0.95 * h, 0.02 * h, k); P.arms.F.pole = [0.3, -1, -0.5];
  Object.assign(P.legs.F, { x: lerp(P.legs.F.x, 0.07 * h, k), z: lerp(P.legs.F.z, 0.05 * h, k), yaw: -0.45 });
  Object.assign(P.legs.N, { x: lerp(P.legs.N.x, -0.07 * h, k), z: lerp(P.legs.N.z, -0.04 * h, k), yaw: -0.7, pitch: 0 });
}

// ---------------------------------------------------------------- ganar
// 0 puño arriba · 1 brazos en V (campeón) · 2 bíceps · 3 brazos cruzados
function victory(P, a, c, h, st) {
  const t = a.t, s = t / 60, v = st.victoria || 0;
  const in1 = kf(t, [[0, 0], [12, 1, 'B']]);
  P.hipsYaw = lerp(P.hipsYaw, -0.95, in1); P.torsoY = lerp(P.torsoY, -0.2, in1); P.look = 1 - 0.6 * in1;
  P.headY -= 0.35 * in1;
  Object.assign(P.legs.F, { x: 0.12 * h, z: 0.16 * h, yaw: -0.5 }); Object.assign(P.legs.N, { x: -0.13 * h, z: -0.14 * h, yaw: -0.9, pitch: 0 });
  const F = P.arms.F, N = P.arms.N;
  if (v === 1) {
    const b = Math.abs(Math.sin(s * 4.2));
    P.hipsY = 0.95 + 0.04 * b * in1; P.headX -= 0.25 * in1;
    toward(N, -0.38 * h, 2.06 * h, 0.05 * h, in1); toward(F, 0.36 * h, 2.06 * h, 0.12 * h, in1);
    N.pole = [-1, 0, -0.4]; F.pole = [1, 0, -0.4];
  } else if (v === 2) {
    const tr = Math.sin(s * 40) * 0.006 * h * in1;
    P.hipsYaw = lerp(P.hipsYaw, -1.25, in1); P.hipsY = 0.9; P.torsoX = lerp(P.torsoX, -0.05, in1);
    toward(N, -0.36 * h, 1.72 * h + tr, -0.02 * h, in1); toward(F, 0.34 * h, 1.72 * h - tr, 0.1 * h, in1);
    N.pole = [-1, -0.25, -0.1]; F.pole = [1, -0.25, -0.1];
  } else if (v === 3) {
    P.hipsY = 0.96; P.hipsSide = 0.03 * h * in1; P.headX += 0.1 * Math.max(0, Math.sin(s * 2.5)) * in1;
    toward(N, 0.12 * h, 1.33 * h, 0.15 * h, in1); toward(F, -0.12 * h, 1.36 * h, 0.17 * h, in1);
    N.pole = [-1, -0.3, 0]; F.pole = [1, -0.3, 0];
  } else {
    const pump = 0.06 * Math.max(0, Math.sin(s * 5.5)) * smooth((t - 14) / 10);
    P.hipsY = 0.93 + 0.03 * Math.abs(Math.sin(s * 5.5)) * in1; P.headX -= 0.2 * in1;
    toward(N, -0.12 * h, (2.12 + pump) * h, 0.1 * h, in1); N.pole = [-1, 0, -0.2];
    toward(F, 0.16 * h, 1.05 * h, 0.06 * h, in1); F.pole = [1, -0.4, -0.6];
  }
}

// ---------------------------------------------------------------- especiales comunes
// Las dos palmas hacia adelante (bola de energía)
function push(P, a, c, h) {
  const { T, S, A } = phases(a), t = a.t;
  const w = kf(t, [[0, 0], [S * 0.6, 1, 'S'], [S, 0, 'O']]), e = kf(t, [[0, 0], [S * 0.6, 0], [S, 1, 'O'], [A, 1], [T, 0, 'S']]);
  toward(P.arms.N, -0.18 * h, 1.05 * h, -0.05 * h, w); toward(P.arms.F, -0.06 * h, 1.08 * h, 0.02 * h, w);
  toward(P.arms.N, -0.05 * h, 1.36 * h, 0.66 * h, e); toward(P.arms.F, 0.06 * h, 1.4 * h, 0.7 * h, e);
  P.arms.N.pole = [-0.6, -1, -0.3]; P.arms.F.pole = [0.6, -1, -0.3];
  P.hipsYaw += -0.45 * w + 0.35 * e; P.torsoY += -0.3 * w + 0.25 * e;
  P.hipsY -= 0.05 * w + 0.04 * e; P.hipsZ += 0.06 * h * e; P.torsoX += 0.1 * e;
  P.legs.F.z += 0.08 * h * e; P.legs.F.plant = t < S ? 0 : 1;
}

// Aventar algo con la mano de adelante (donde trae el pescado, la caguama o las tijeras)
function toss(P, a, c, h) {
  const { T, S, A } = phases(a), t = a.t, F = P.arms.F;
  const g = { x: F.x, y: F.y, z: F.z }, W = S * 0.85;
  F.x = kf(t, [[0, g.x], [W, 0.26 * h], [S * 1.1, 0.06 * h, 'O'], [A, 0.04 * h], [T, g.x, 'S']]);
  F.y = kf(t, [[0, g.y], [W, 1.68 * h], [S * 1.1, 1.55 * h, 'O'], [A, 1.2 * h], [T, g.y, 'S']]);
  F.z = kf(t, [[0, g.z], [W, -0.28 * h], [S * 1.1, 0.72 * h, 'O'], [A, 0.55 * h], [T, g.z, 'S']]);
  F.pole = [1, -0.6, -0.4];
  const r = kf(t, [[0, 0], [W, 1, 'S'], [S * 1.1, -1, 'O'], [A, -1.1], [T, 0, 'S']]);
  P.hipsYaw += 0.45 * r; P.torsoY += 0.55 * r; P.torsoX += 0.12 * Math.max(0, -r) - 0.05 * Math.max(0, r);
  P.hipsZ += 0.05 * h * Math.max(0, -r);
  P.legs.F.y = 0.06 * h * Math.sin(PI * clamp01(t / W)); P.legs.F.plant = t < S ? 0 : 1;
  toward(P.arms.N, -0.2 * h, 1.3 * h, 0.1 * h, Math.max(0, r));
}

// Concentra poder: puños a los lados, codos afuera, tiembla
function charge(P, a, c, h) {
  const t = a.t, k = kf(t, [[0, 0], [10, 1, 'O']]), tr = Math.sin(t * 2.3) * 0.006 * h * k;
  Object.assign(P, { hipsY: lerp(P.hipsY, 0.87, k), hipsYaw: lerp(P.hipsYaw, -0.8, k), torsoX: lerp(P.torsoX, -0.12, k), headX: -0.18 * k });
  toward(P.arms.N, -0.26 * h, 1.02 * h + tr, 0.06 * h, k); toward(P.arms.F, 0.24 * h, 1.02 * h - tr, 0.1 * h, k);
  P.arms.N.pole = [-1, -0.3, -0.3]; P.arms.F.pole = [1, -0.3, -0.3];
  P.torsoZ = Math.sin(t * 1.9) * 0.02 * k;
  Object.assign(P.legs.F, { x: 0.12 * h, z: 0.2 * h }); Object.assign(P.legs.N, { x: -0.14 * h, z: -0.18 * h, pitch: 0 });
}

// Embestida corriendo: muy agachado, el hombro por delante
function tackle(P, a, c, h, st) {
  walk(P, a, c, h, st, 1, 1.6, 0.55, 0.12);
  Object.assign(P, { hipsY: 0.8, hipsX: 0.35, torsoX: 0.55, torsoY: -0.45, headX: -0.5 });
  toward(P.arms.F, 0.05 * h, 1.3 * h, 0.5 * h, 1); toward(P.arms.N, -0.1 * h, 1.25 * h, 0.25 * h, 1);
}

function laser(P, a, c, h) {
  const e = ext(a);
  Object.assign(P, { torsoY: 0.1, torsoX: -0.05, headX: -0.08 - e * 0.05, hipsY: 0.92 - e * 0.03, hipsYaw: -0.45, look: 1 });
  fkArm(P.arms.N, -0.3, 0.5, -1.3); fkArm(P.arms.F, -0.3, -0.5, -1.3);
}

function misiles(P, a, c, h) {
  const e = ext(a);
  Object.assign(P, { torsoX: lerp(0.1, 0.55, e), torsoY: 0.1, hipsYaw: -0.45, headX: -0.3 * e, hipsY: lerp(0.93, 0.8, e) });
  fkArm(P.arms.N, lerp(-1.0, -0.3, e), 0.7, -1.5); fkArm(P.arms.F, lerp(-0.8, -0.3, e), -0.7, -1.5);
}

// De pie y relajado, para la foto de la pantalla de selección
function retrato(P) {
  Object.assign(P, { hipsY: 0.98, hipsX: 0, hipsYaw: 0, torsoX: 0, torsoY: 0, headX: 0.05, look: 0 });
  fkArm(P.arms.N, -0.1, 0, -0.25); fkArm(P.arms.F, -0.1, 0, -0.25);
  fkLeg(P.legs.N, 0, 0); fkLeg(P.legs.F, 0, 0);
}

// Gera (box): ráfaga de rectos alternando manos
function rafaga(P, a, c, h) {
  const t = a.t, k = Math.floor(t / 5), s = Math.sin((t % 5) / 5 * PI);
  const z = reach(c, h, 0.86);
  if (k % 2) { toward(P.arms.N, -0.02 * h, 1.45, z, s); P.hipsYaw += 0.4 * s; P.torsoY += 0.35 * s; }
  else { toward(P.arms.F, 0.02 * h, 1.5, z, s); P.torsoY -= 0.3 * s; }
  P.hipsY = 0.9 + Math.sin(t * 0.6) * 0.01; P.hipsZ += 0.03 * h; P.torsoX += 0.08;
}

// Gera: resortazo, un recto enorme que se estira de más
function resorte(P, a, c, h) {
  const e = ext(a);
  toward(P.arms.N, -0.02 * h, 1.45 * h, reach(c, h, 1.05), e); P.arms.N.pole = [-0.5, -1, -0.1];
  P.hipsYaw += 0.85 * e; P.torsoY += 0.6 * e; P.torsoX += 0.2 * e; P.hipsY -= 0.04 * e; P.hipsZ += 0.08 * h * e;
  P.legs.N.pitch = 0.7 * e; P.legs.N.yaw = lerp(P.legs.N.yaw, -0.15, e);
}

// Gera: guardia de contragolpe, cubierto y meciéndose
function contra(P, a, c, h) {
  block(P, a, {}, h, false);
  P.hipsY = 0.87; P.torsoZ = Math.sin(a.t * 0.35) * 0.12; P.hipsSide = Math.sin(a.t * 0.35) * 0.03 * h;
}

const ANIMS = {
  idle,
  caminar: (P, a, c, h, st) => walk(P, a, c, h, st, 1),
  caminar_atras: (P, a, c, h, st) => walk(P, a, c, h, st, -1),
  agacharse: (P, a, c, h) => { crouch(P, h); P.hipsY += 0.006 * Math.sin(a.t / 60 * 3); },
  bloqueo: (P, a, c, h) => block(P, a, c, h, false),
  bloqueo_bajo: (P, a, c, h) => block(P, a, c, h, true),
  saltar: jump,
  puno: jab, puno_fuerte: cross, gancho_arriba: uppercut,
  patada: kick, patada_giratoria: spinKick, barrida: sweep, patada_aerea: airKick,
  golpeado: hurt, caer: fall, muerto: fall, levantarse: getUp, mareado: dizzy, victoria: victory,
  especial: push, lanzar: toss, carga: charge, embestida: tackle, laser, misiles, retrato,
  rafaga, resorte, contra,
  miedo: fear, atrapado: trapped, saludo: salute,
  congelado: () => null,
};

// ---------------------------------------------------------------- poses de especiales (ángulos directos)
// Curva de un movimiento: sube durante el arranque, se mantiene y baja en la recuperación
function ext(a) {
  if (!a.total) return 0;
  const p = a.t / a.total;
  if (p < a.s) return clamp01(p / a.s) ** 0.6;
  if (p < a.a) return 1;
  return 1 - clamp01((p - a.a) / (1 - a.a)) ** 1.4;
}

const OLD = { hipsY: 0.93, hipsX: 0, torsoX: 0.1, torsoY: 0.35, torsoZ: 0, headX: 0, spin: 0, tilt: 0,
  shNX: -1.0, shNZ: 0.1, elNX: -1.8, shFX: -0.8, shFZ: -0.1, elFX: -2.0,
  hipNX: -0.35, knNX: 0.55, hipFX: 0.25, knFX: 0.4 };
// piernas en ángulos directos (en el aire, sentado, de espaldas…); 'swap': la de adelante es la F
const LEG_MODE = { jet_sube: 'fk', jet_cae: 'fk', turbina: 'swap', culazo: 'fk', senton: 'fk', senton_suelo: 'fk', twerk: 'fk',
  gas: 'fk', jojo: 'fk', navaja: 'swap', sentado: 'fk', propulsor: 'fk', pisar_arriba: 'fk', pisar: 'fk',
  picada_carga: 'fk', mazazo: 'fk', plancha: 'fk', clavado: 'fk', bola: 'fk', doblado: 'fk', colgado: 'fk' };

function legacy(a, h, st) {
  const L = { ...OLD };
  oldPose(a, L, ext(a), a.t);
  const P = guard(h, st);
  Object.assign(P, { spin: L.spin, tilt: L.tilt || 0, hipsY: L.hipsY, hipsX: L.hipsX, hipsYaw: 0, torsoX: L.torsoX, torsoY: L.torsoY, torsoZ: L.torsoZ, headX: L.headX, look: 0 });
  fkArm(P.arms.N, L.shNX, L.shNZ, L.elNX); fkArm(P.arms.F, L.shFX, L.shFZ, L.elFX);
  const mode = LEG_MODE[a.key];
  if (mode) {
    const [n, f] = mode === 'swap' ? ['F', 'N'] : ['N', 'F'];
    fkLeg(P.legs.N, L[`hip${n}X`], L[`kn${n}X`]); fkLeg(P.legs.F, L[`hip${f}X`], L[`kn${f}X`]);
  } else {   // de pie: los pies plantados (la cadera no gira, así que van más cuadrados)
    Object.assign(P.legs.F, { z: 0.2 * h, yaw: -0.12 }); Object.assign(P.legs.N, { z: -0.19 * h, yaw: -0.55 });
  }
  return P;
}

// Poses de los especiales de cada amigo (Alan, José, Ramces, Diego, Conde, Emi). spin = PI: de espaldas al rival.
function oldPose(a, P, e, t) {
  switch (a.key) {
    case 'jet_sube':
      Object.assign(P, { hipsY: 0.98, torsoX: -0.1, torsoY: 0, shNX: 0.25, shNZ: -0.35, elNX: -0.3, shFX: 0.25, shFZ: 0.35, elFX: -0.3, hipNX: 0.05, knNX: 0.15, hipFX: 0.1, knFX: 0.3 }); return;
    case 'jet_cae':
      Object.assign(P, { tilt: 1.15, torsoX: 0, torsoY: 0, headX: -0.6, shNX: -2.9, shNZ: 0.15, elNX: 0, shFX: -2.9, shFZ: -0.15, elFX: 0, hipNX: 0.15, knNX: 0.1, hipFX: 0.15, knFX: 0.1 }); return;
    case 'turbina':
      Object.assign(P, { torsoY: 0, torsoX: 0.15, shNX: -1.5, shNZ: 0.25, elNX: -0.5, shFX: -1.5, shFZ: -0.25, elFX: -0.5, hipNX: -0.75, knNX: 1.0, hipFX: 0.35, knFX: 0.3, hipsY: 0.88 });
      P.torsoZ = Math.sin(t * 1.3) * 0.03; return;
    case 'orbital':
      Object.assign(P, { torsoY: 0, torsoX: -0.15, headX: -0.5, shFX: lerp(-0.8, -3.0, e), shFZ: -0.15, elFX: lerp(-2.0, -0.1, e), shNX: -1.1, elNX: -1.7 }); return;
    case 'culazo':
      Object.assign(P, { spin: Math.PI, torsoX: 0.95, torsoY: 0, headX: -0.5, shNX: 0.7, shNZ: -0.3, elNX: -0.4, shFX: 0.7, shFZ: 0.3, elFX: -0.4, hipNX: -0.35, knNX: 0.5, hipFX: -0.2, knFX: 0.4, hipsY: 0.9 }); return;
    case 'senton':
      Object.assign(P, { torsoX: -0.25, torsoY: 0, headX: 0.2, shNX: -2.6, shNZ: 0.4, elNX: -0.3, shFX: -2.6, shFZ: -0.4, elFX: -0.3, hipNX: -1.55, knNX: 1.55, hipFX: -1.55, knFX: 1.55, hipsY: 0.9 }); return;
    case 'senton_suelo':
      Object.assign(P, { torsoX: -0.2, torsoY: 0, shNX: -0.3, shNZ: 0.6, elNX: -0.2, shFX: -0.3, shFZ: -0.6, elFX: -0.2, hipNX: -1.55, knNX: 0.3, hipFX: -1.55, knFX: 0.3, hipsY: 0.24 }); return;
    case 'twerk': {
      const w = Math.sin(t * 1.25);
      Object.assign(P, { spin: Math.PI, torsoX: 0.75, torsoY: 0, headX: -0.4, shNX: -0.9, shNZ: 0.1, elNX: -0.15, shFX: -0.9, shFZ: -0.1, elFX: -0.15, hipNX: -0.95, knNX: 1.35, hipFX: -0.95, knFX: 1.35, hipsY: 0.78 });
      P.hipsX = w * 0.22; P.torsoZ = w * 0.05; return;
    }
    case 'gas':
      Object.assign(P, { spin: Math.PI, torsoX: lerp(0.3, 1.15, e), torsoY: 0, headX: -0.6, shNX: -0.7, elNX: -0.2, shFX: -0.7, elFX: -0.2, hipNX: -0.4, knNX: 0.45, hipFX: -0.3, knFX: 0.4, hipsY: 0.92 }); return;
    // Alan: pose de JoJo (de tres cuartos hacia la cámara, una mano en la cara y la otra señalando)
    case 'jojo': {
      const k = clamp01(t / 10);
      Object.assign(P, { spin: -0.75 * k, hipsY: 0.9, torsoX: -0.25 * k, torsoY: -0.35 * k, torsoZ: 0.18 * k, headX: -0.18 * k,
        shFX: lerp(-0.8, -1.35, k), shFZ: -0.15, elFX: lerp(-2.0, -0.05, k),
        shNX: lerp(-1.0, -2.55, k), shNZ: 0.55 * k, elNX: lerp(-1.8, -2.35, k),
        hipNX: lerp(-0.35, -0.55, k), knNX: lerp(0.55, 0.35, k), hipFX: lerp(0.25, 0.35, k), knFX: lerp(0.4, 0.6, k) });
      P.torsoZ += Math.sin(t * 0.12) * 0.015;
      return;
    }
    // Ramces (barbero)
    case 'rapar':      // la máquina por delante, a la altura de la cabeza del otro (zumba)
      Object.assign(P, { torsoX: 0.18, torsoY: -0.3, shFX: -1.65, shFZ: -0.1, elFX: -0.35, shNX: -1.3, shNZ: 0.2, elNX: -0.9, hipsY: 0.9 });
      P.elFX += Math.sin(t * 2.6) * 0.05; P.shFX += Math.sin(t * 1.9) * 0.04; return;
    case 'navaja':     // tajo de abajo hacia arriba
      Object.assign(P, { torsoY: -0.4, shNX: -0.6, elNX: -1.4, hipNX: -0.5, knNX: 0.6, hipFX: 0.3, knFX: 0.3 });
      P.shFX = lerp(-0.3, -3.0, e); P.elFX = lerp(-1.5, -0.15, e); P.torsoX = lerp(0.35, -0.3, e); P.hipsY = lerp(0.82, 0.98, e); return;
    case 'afilar':     // afila la navaja: la mano va y viene
      Object.assign(P, { torsoX: 0.1, torsoY: -0.2, shNX: -1.2, shNZ: 0.15, elNX: -0.7, shFX: -1.25 + Math.sin(t * 0.55) * 0.3, elFX: -1.1, hipsY: 0.93 }); return;
    case 'capa':       // brochazo de lado a lado
      Object.assign(P, { torsoX: 0.12, shNX: -0.7, elNX: -1.2, hipsY: 0.9 });
      P.torsoY = lerp(0.6, -0.65, e); P.shFX = lerp(-0.7, -1.6, e); P.shFZ = lerp(-0.7, 0.25, e); P.elFX = lerp(-1.2, -0.25, e); return;
    case 'sentado':    // en la silla del barbero, de frente a la cámara
      Object.assign(P, { spin: -Math.PI / 2, hipsY: 0.66, torsoX: -0.1, torsoY: 0, torsoZ: 0, headX: 0.05, hipNX: -1.5, knNX: 1.5, hipFX: -1.5, knFX: 1.5,
        shNX: -0.3, shNZ: 0.28, elNX: -0.95, shFX: -0.3, shFZ: -0.28, elFX: -0.95 });
      return;
    // Diego con el traje de robot
    case 'canon':      // apunta el brazo como cañón; al disparar el retroceso lo echa un poco atrás
      Object.assign(P, { torsoY: -0.5, torsoX: lerp(0.08, -0.12, e), headX: -0.05, shFX: -1.55, shFZ: -0.05, elFX: -0.05, shNX: -1.2, shNZ: 0.25, elNX: -1.5, hipsY: 0.88 }); return;
    case 'propulsor':  // se lanza casi acostado, con los brazos hacia atrás
      Object.assign(P, { torsoX: 1.05, torsoY: 0, headX: -0.7, shNX: 0.55, shNZ: 0.25, elNX: -0.1, shFX: 0.55, shFZ: -0.25, elFX: -0.1, hipNX: 0.35, knNX: 0.5, hipFX: 0.6, knFX: 0.7, hipsY: 0.72 });
      return;
    case 'descarga':   // brazos abiertos, temblando por la electricidad
      Object.assign(P, { torsoX: -0.15, torsoY: 0, headX: -0.25, shNX: -0.4, shNZ: 1.25, elNX: -0.3, shFX: -0.4, shFZ: -1.25, elFX: -0.3, hipsY: 0.88 });
      P.torsoZ = Math.sin(t * 2.3) * 0.04; P.shNZ += Math.sin(t * 3.1) * 0.08; P.shFZ -= Math.sin(t * 2.7) * 0.08; return;
    // Conde
    case 'flexion':   // pose de fisicoculturista temblando de fuerza mientras crece
      Object.assign(P, { torsoX: 0.3, torsoY: 0, headX: -0.15, shNX: -0.5, shNZ: 0.55, elNX: -1.7, shFX: -0.5, shFZ: -0.55, elFX: -1.7, hipsY: 0.86 });
      P.torsoZ = Math.sin(t * 1.7) * 0.025; return;
    case 'agarrar':
      Object.assign(P, { torsoX: 0.25, torsoY: 0, shNX: -1.45, shNZ: 0.25, elNX: -0.35, shFX: -1.45, shFZ: -0.25, elFX: -0.35, hipsY: 0.88 }); return;
    case 'levantar':
      Object.assign(P, { torsoX: -0.2, torsoY: 0, headX: -0.3, shNX: -2.9, shNZ: 0.2, elNX: -0.5, shFX: -2.9, shFZ: -0.2, elFX: -0.5, hipsY: 0.92 }); return;
    case 'pisar_arriba':
      Object.assign(P, { torsoX: -0.25, torsoY: 0, shNX: -0.4, shNZ: -0.6, elNX: -0.6, shFX: -0.4, shFZ: 0.6, elFX: -0.6, hipNX: -1.7, knNX: 1.5, hipFX: 0.1, knFX: 0.15, hipsY: 0.97 }); return;
    case 'pisar':
      Object.assign(P, { torsoX: 0.3, torsoY: 0, shNX: -0.6, shNZ: -0.3, elNX: -1.2, shFX: -0.6, shFZ: 0.3, elFX: -1.2, hipNX: -0.75, knNX: 0.15, hipFX: 0.45, knFX: 0.5, hipsY: 0.84 }); return;
    // Emi
    case 'silbido':   // chifla con los dedos y alza la otra mano: ¡que lluevan pescados!
      Object.assign(P, { torsoX: -0.15, torsoY: 0.1, headX: -0.25, shNX: -1.25, shNZ: 0.45, elNX: -2.45, shFX: -2.95, shFZ: -0.15, elFX: -0.25, hipsY: 0.96 });
      P.elFX += Math.sin(t * 0.6) * 0.25; return;
    case 'chela':     // agita la caguama y luego la apunta al rival
      Object.assign(P, { torsoX: 0.12, torsoY: -0.2, shFX: -1.45, shFZ: -0.1, elFX: -0.15, shNX: -0.6, shNZ: 0.3, elNX: -1.9, hipsY: 0.9 });
      if (t < 14) { P.shFX = -1.0; P.elFX = -1.2 + Math.sin(t * 2.2) * 0.6; }
      return;
    // Ataques nuevos (especiales-extra.js)
    case 'picada_carga':   // en el aire: se encoge un instante antes de lanzarse en picada
      Object.assign(P, { torsoX: 0.45, torsoY: 0, headX: -0.3, shNX: 0.4, shNZ: 0.5, elNX: -1.2, shFX: 0.4, shFZ: -0.5, elFX: -1.2, hipNX: -1.4, knNX: 1.9, hipFX: -1.2, knFX: 1.7, hipsY: 0.95 });
      return;
    case 'mazazo':         // Gera: los dos puños juntos arriba de la cabeza… y abajo con todo
      Object.assign(P, { torsoY: 0, headX: -0.2, hipNX: -0.6, knNX: 0.8, hipFX: -0.2, knFX: 0.5, hipsY: 0.95, shNZ: 0.15, shFZ: -0.15 });
      P.shNX = P.shFX = lerp(-3.0, -1.2, e); P.elNX = P.elFX = lerp(-0.6, -0.2, e); P.torsoX = lerp(-0.35, 0.6, e);
      return;
    case 'plancha':        // Conde: vuela acostado con brazos y piernas abiertos, como luchador
      Object.assign(P, { tilt: 1.35, torsoX: -0.1, torsoY: 0, headX: -0.5, shNX: -1.6, shNZ: 0.9, elNX: -0.3, shFX: -1.6, shFZ: -0.9, elFX: -0.3, hipNX: 0.1, knNX: 0.3, hipFX: 0.15, knFX: 0.3, hipsY: 0.95 });
      return;
    case 'clavado':        // Emi: clavado olímpico de cabeza, los brazos estirados por delante
      Object.assign(P, { tilt: 2.4, torsoX: 0, torsoY: 0, headX: -0.3, shNX: -3.0, shNZ: 0.1, elNX: 0, shFX: -3.0, shFZ: -0.1, elFX: 0, hipNX: 0.05, knNX: 0.05, hipFX: 0.05, knFX: 0.05, hipsY: 0.95 });
      return;
    case 'bola':           // bala de cañón: hecho bolita
      Object.assign(P, { tilt: 0.6, torsoX: 1.0, torsoY: 0, headX: 0.4, shNX: -0.9, shNZ: 0.2, elNX: -1.9, shFX: -0.9, shFZ: -0.2, elFX: -1.9, hipNX: -2.0, knNX: 2.3, hipFX: -2.0, knFX: 2.3, hipsY: 0.95 });
      return;
    case 'higadazo':       // Gera: se agacha, gira el torso y el puño de atrás se hunde en el costado
      Object.assign(P, { torsoX: 0.3, hipsY: 0.8, headX: 0.1, shFX: -1.1, shFZ: -0.1, elFX: -1.9, hipNX: -0.5, knNX: 0.8, hipFX: 0.2, knFX: 0.6 });
      P.torsoY = lerp(0.4, -0.6, e); P.shNX = lerp(-0.3, -1.25, e); P.shNZ = lerp(0.5, 0.15, e); P.elNX = lerp(-1.9, -1.1, e);
      return;
    case 'doblado':        // le sacaron el aire: de rodillas, doblado y agarrándose la panza
      Object.assign(P, { torsoX: 0.95, torsoY: 0, headX: 0.25, shNX: -0.55, shNZ: 0.35, elNX: -1.7, shFX: -0.55, shFZ: -0.35, elFX: -1.7, hipNX: -1.45, knNX: 2.0, hipFX: -0.7, knFX: 1.5, hipsY: 0.52 });
      P.torsoZ = Math.sin(t * 0.3) * 0.03;
      return;
    case 'colgado':        // lo cargan de los tobillos (brutality de Conde): flojo, las piernas juntas y los brazos colgando
      Object.assign(P, { torsoX: 0, torsoY: 0, headX: 0.2, shNX: -2.8, shNZ: 0.35, elNX: -0.3, shFX: -2.7, shFZ: -0.35, elFX: -0.4, hipNX: 0, knNX: 0.08, hipFX: 0.05, knFX: 0.1, hipsY: 0.95 });
      P.shNX += Math.sin(t * 0.5) * 0.25; P.shFX += Math.sin(t * 0.5 + 1) * 0.25;
      return;
  }
}
const OLD_KEYS = new Set(['jet_sube', 'jet_cae', 'turbina', 'orbital', 'culazo', 'senton', 'senton_suelo', 'twerk', 'gas', 'jojo',
  'rapar', 'navaja', 'afilar', 'capa', 'sentado', 'canon', 'propulsor', 'descarga', 'flexion', 'agarrar', 'levantar', 'pisar_arriba', 'pisar', 'silbido', 'chela',
  'picada_carga', 'mazazo', 'plancha', 'clavado', 'bola', 'higadazo', 'doblado', 'colgado']);

// Cómo se mueve cada quien (sale de sus stats y accesorios)
export function styleOf(def) {
  const s = def?.stats || {}, acc = def?.accesorios || [];
  const boxer = acc.includes('guantes'), heavy = (s.fuerza ?? 1) >= 1.08 || (s.vida ?? 100) >= 108;
  let hash = 0;
  for (const ch of def?.id || '') hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return {
    bounce: boxer ? 1.35 : heavy ? 0.75 : 1,
    tempo: (boxer ? 1.15 : heavy ? 0.85 : 1) * (s.velocidad ?? 1),
    guardY: boxer ? 0.03 : 0,
    victoria: def?.victoria ?? (boxer ? 1 : heavy ? 2 : Math.abs(hash) % 2 ? 3 : 0),
  };
}
