// =====================================================================
//  Fatalities de cine (solo se ve: no cambia nada de la pelea)
// =====================================================================
//  Lo que pasa en cada fatality y cuándo está en specials.js / specials-amigos.js y corre dentro
//  de la simulación (en línea las dos computadoras la calculan igual). Aquí se decide cómo se ve:
//    · la cámara: tomas con cortes y movimientos, pegadas a quien sale en cuadro
//    · golpes de efecto en los momentos clave (destello, cámara lenta, zoom, temblor, sonido)
//    · luz de escenario sobre los dos, color de la imagen, franjas negras de cine y el título
//    · poses extra (el que va a morir ve venir lo que le cae, Alan saluda a su cohete…)
//  Tiempos en cuadros de la fatality (60 por segundo), los mismos de specials.js.
// =====================================================================
import * as THREE from 'three';
import { sfx, audioState } from './audio.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const EASE = { S: smooth, L: clamp01, O: (x) => 1 - (1 - clamp01(x)) ** 3, I: (x) => clamp01(x) ** 2.2 };
const $ = (id) => document.getElementById(id);

// Toma: dónde va la cámara (p) y a dónde mira (l), cada una pegada a un "ancla":
//   W el que gana · L el que pierde · M entre los dos, en el piso · Wf / Lf la cara de cada uno
//   Wh la mano del que gana · H la cabeza que vuela (Ramces) · F el pescado gigante (Emi)
// x va hacia donde mira el que gana (así sirve de los dos lados), y hacia arriba, z hacia la cámara.
// Lo que se pega a W crece con él (Conde gigante).
const S = (pa, px, py, pz, la, lx, ly, lz, fov = 38, roll = 0) => ({ p: [pa, px, py, pz], l: [la, lx, ly, lz], fov, roll });
// vuelta alrededor de un ancla: ángulo inicial y final (0 = de frente, + hacia donde mira el que gana),
// radio, altura de la cámara, altura a la que mira
const O = (a, a0, a1, r, y, ly, fov = 36) => ({ orbit: a, a0, a1, r, y, ly, fov });

// Escenarios de noche: la imagen se oscurece menos (si no, no se ve nada)
const DARK_STAGES = { casachuy: 0.18, templo: 0.32 };

// Tomas que se repiten: abre con el que gana de cerca y desde abajo; cierra con él posando
const OPEN = (t1 = 18) => [0, t1, S('Wf', 1.0, -0.55, 2.1, 'Wf', 0, -0.18, 0, 34), S('Wf', 0.75, -0.45, 1.75, 'Wf', 0, -0.12, 0, 30)];
const HERO = (t0, t1) => [t0, t1, S('W', 1.4, 0.85, 2.9, 'W', 0, 1.3, 0, 36), S('W', 1.0, 0.95, 2.4, 'W', 0, 1.38, 0, 32)];
// después, con el "¡FATALIDAD!": vuelta lenta alrededor del que ganó
// (el que ganó queda abajo del letrero: la cámara mira un poco arriba de su cabeza)
const POST = [[0, 150, O('W', 0.85, 0.2, 3.9, 0.75, 1.85, 36)]];

//  shots  [desde, hasta, toma inicial, toma final, curva]; si la toma inicial cambia, es un corte
//  beats  [cuadro, { kill (el remate), flash, light, aberr, fov, shake, slow, sfx, riser, glint, star, burst, fireworks }]
//  pose   { W: [[cuadro, animación, opciones]], L: … }  (null = la de la simulación)
//  mood   color de la imagen · key  color de la luz de escenario · glitch  [desde, hasta] la imagen se descompone
//  fx(d, t, n)  efectos de cada cuadro (n = cuántos cuadros de 60 pasaron)
export const FATALS = {
  // Genérica: carga energía y el otro revienta
  explosion: {
    mood: '#ff6a00', key: '#ffd8b0',
    shots: [OPEN(18),
      [18, 38, S('Lf', -1.15, -0.35, 2.4, 'Lf', 0, -0.3, 0, 36), S('Lf', -0.85, -0.3, 1.8, 'Lf', 0, -0.25, 0, 31, 0.05)],
      [38, 70, S('M', 0, 1.6, 6.6, 'L', 0, 1.1, 0, 42), S('M', 0, 1.45, 5.7, 'L', 0, 1.0, 0, 40)],
      HERO(70, 150)],
    beats: [[18, { riser: 0.4 }], [40, { kill: true }]],
    pose: { W: [[0, 'carga'], [24, 'especial', { total: 30, s: 0.45, a: 0.95 }], [70, null]], L: [[0, 'atrapado'], [40, null]] },
  },

  // Brasa: lanzallamas y el otro se hace ceniza
  incinerar: {
    mood: '#ff5500', key: '#ffb070',
    shots: [OPEN(14),
      [14, 60, O('L', -0.95, 0.45, 2.7, 1.25, 1.1, 36)],
      [60, 108, S('L', -1.6, 1.15, 2.9, 'L', 0, 1.15, 0, 36), S('L', -1.35, 1.1, 2.5, 'L', 0, 1.1, 0, 34)],
      [108, 130, S('L', -1.5, 0.45, 3.0, 'L', 0, 0.9, 0, 40), S('L', -1.4, 0.4, 3.3, 'L', 0, 0.45, 0, 40)],
      HERO(130, 190)],
    beats: [[110, { kill: true, flash: '#ff7a2a' }]],
    pose: { W: [[14, 'especial', { total: 30, s: 0.3, a: 0.95, hold: 12 }], [110, null]], L: [[10, 'miedo'], [110, null]] },
    fx(d, t) { if (t > 10 && t < 110) d.light('Lf', '#ff6a00', 3 + Math.random() * 4); },
  },

  // Escarcha: lo congela, aparece junto a él y lo rompe de una patada giratoria
  congelar_romper: {
    mood: '#4fb8ff', key: '#cfe9ff',
    shots: [OPEN(14),
      [14, 46, O('L', 0.95, -0.35, 2.5, 1.35, 1.1, 34)],
      [46, 62, S('L', -1.5, 1.0, 2.7, 'L', -0.4, 1.1, 0, 38), S('L', -1.1, 1.1, 2.15, 'L', -0.3, 1.15, 0, 33)],
      [62, 100, S('L', -0.5, 1.35, 4.6, 'L', 0, 0.9, 0, 42), S('L', -0.4, 1.4, 5.2, 'L', 0, 0.8, 0, 42)],
      HERO(100, 170)],
    beats: [[14, { light: ['Lf', '#bfefff', 14], aberr: 0.6 }], [50, { burst: ['W', '#bfefff', 40], sfx: ['teleport', 'swoosh'], slow: 26 }],
      [62, { kill: true, flash: '#d8f6ff' }]],
  },

  // Voltio: llama a la tormenta, cuatro rayos y revienta
  rayo: {
    mood: '#6a8cff', key: '#cfd8ff', desat: 0.25,
    shots: [
      [0, 10, S('W', 1.2, 0.55, 2.4, 'W', 0, 1.7, 0, 38), S('W', 1.0, 0.5, 2.2, 'W', 0, 1.9, 0, 36)],
      [10, 60, S('L', -1.9, 0.6, 4.8, 'L', 0, 2.3, 0, 48), S('L', -1.6, 0.65, 4.2, 'L', 0, 2.0, 0, 46)],
      [60, 70, S('Lf', -0.8, -0.25, 1.75, 'Lf', 0, -0.2, 0, 32), S('Lf', -0.65, -0.2, 1.55, 'Lf', 0, -0.2, 0, 30, -0.05)],
      [70, 100, S('M', 0, 1.5, 6.2, 'L', 0, 1.0, 0, 42), S('M', 0, 1.45, 5.6, 'L', 0, 1.0, 0, 41)],
      HERO(100, 170)],
    beats: [...[10, 24, 38, 52].map((t) => [t, { flash: '#dfe8ff', aberr: 0.9, sfx: 'thunder' }]), [70, { kill: true, flash: '#ffffff' }]],
    pose: {
      W: [[1, 'levantar'], [70, null]],
      L: [[1, 'atrapado'], [10, 'golpeado'], [18, 'atrapado'], [24, 'golpeado'], [32, 'atrapado'], [38, 'golpeado'], [46, 'atrapado'], [52, 'golpeado'], [60, 'atrapado'], [70, null]],
    },
  },

  // Mole: brinca altísimo y le cae encima
  aplastar: {
    mood: '#ff2a2a', key: '#ffd8b0',
    shots: [
      [0, 12, S('W', 1.2, 0.8, 2.6, 'W', 0, 1.2, 0, 38), S('W', 1.0, 0.4, 3.0, 'W', 0, 1.7, 0, 42)],
      [12, 28, S('W', -1.3, -0.3, 3.4, 'W', 0, 0.6, 0, 44), S('W', -1.15, 0.05, 3.0, 'W', 0, 0.5, 0, 44)],
      [28, 35, S('Lf', -0.25, -0.35, 0.75, 'W', 0, 0.55, 0, 64), S('Lf', -0.22, -0.4, 0.7, 'W', 0, 0.5, 0, 66)],
      [35, 80, S('L', 0, 0.35, 3.3, 'L', 0, 0.8, 0, 44), S('L', 0.2, 0.55, 4.4, 'L', 0, 0.8, 0, 42)],
      HERO(80, 160)],
    beats: [[10, { riser: 0.45 }], [36, { kill: true }]],
    pose: { L: [[12, 'miedo'], [36, null]] },
  },

  // Diego (robot): lo escanea con el láser de los ojos y lo deshace en cubos de luz
  desintegrar: {
    mood: '#4fd8ff', key: '#d8f4ff', glitch: [28, 70],
    shots: [
      [0, 12, S('Wf', 0.5, 0, 0.75, 'Wf', 0, 0.02, 0, 24), S('Wf', 0.42, 0, 0.62, 'Wf', 0, 0.02, 0, 22)],
      [12, 40, S('Wf', 0.9, -0.1, 1.5, 'M', 0, 1.35, 0, 34), S('Lf', -1.1, -0.25, 1.7, 'L', 0, 1.2, 0, 34)],
      [40, 68, O('L', -0.6, 0.7, 2.25, 1.3, 1.1, 34)],
      [68, 110, S('M', 0, 1.4, 5.6, 'L', 0, 0.9, 0, 42), S('M', 0, 1.5, 6.2, 'L', 0, 1.0, 0, 42)],
      HERO(110, 190)],
    beats: [[12, { aberr: 0.6 }], [70, { kill: true, flash: '#9fefff' }]],
    pose: { L: [[12, 'atrapado'], [70, null]] },
  },

  // Alan: le amarra un cohete, lo despide con un saludo y explota en fuegos artificiales
  despegue: {
    mood: '#ff7a1a', key: '#ffe0c0',
    shots: [OPEN(20),
      [20, 45, S('L', 1.75, 1.35, 2.2, 'L', 0, 1.15, -0.2, 36), S('L', 1.5, 1.3, 1.9, 'L', 0, 1.15, -0.2, 33)],
      [45, 62, S('L', -1.3, 0.25, 2.7, 'L', 0, 1.7, 0, 48), S('L', -1.3, 0.25, 2.8, 'L', 0, 1.5, 0, 48)],
      [62, 128, S('L', -1.5, -0.7, 4.4, 'L', 0, 0.7, 0, 44), S('L', -1.2, -1.6, 5.2, 'L', 0, 0.4, 0, 46)],
      [128, 150, S('L', 0, -1.8, 9.5, 'L', 0, 0, 0, 50), S('L', 0, -2.2, 10.5, 'L', 0, 0, 0, 52)],
      [150, 182, S('W', 1.7, 2.8, 4.2, 'W', 0, 1.6, 0, 42), S('W', 1.2, 1.1, 2.7, 'W', 0, 1.4, 0, 35)],
      HERO(182, 220)],
    beats: [[28, { sfx: 'fuse' }], [45, { shake: 0.4, flash: '#ffb060', light: ['L', '#ff8a3a', 14] }], [130, { kill: true, flash: '#fff6d0', sfx: 'crackle' }],
      [137, { fireworks: ['#ff3a3a', '#ffd23a'] }], [145, { fireworks: ['#4fd8ff', '#9be15d'] }], [154, { fireworks: ['#ff7ab8', '#ffffff'] }]],
    pose: { W: [[44, 'saludo'], [150, null]], L: [[45, 'miedo'], [130, null]] },
    fx(d, t, n) {
      // la mecha chisporrotea y al encender sale una nube de humo del piso
      if (t >= 28 && t < 45) d.glow(d.at('L', 0, 0.42, -0.35), { count: 2 * n, speed: 2.2, color: '#ffffff', colorEnd: '#ff8a1a', life: 0.25, size: 0.12, gravity: -2 });
      if (t >= 45 && t < 62) d.solid(d.at('L', 0, 0.1, 0), { count: 4 * n, speed: 4, dir: [0, 0.2, 0], spread: 1.4, color: '#c8c8c8', colorEnd: '#555', life: 1.2, size: 0.5, grow: 2.5, drag: 1.5 });
    },
  },

  // Gera: ráfaga de golpes, el gancho que lo manda a las estrellas… y brilla como una
  nocaut: {
    mood: '#ffd23a', key: '#fff0c8',
    shots: [OPEN(16),
      [16, 30, S('L', -1.3, 1.25, 2.7, 'L', 0, 1.3, 0, 36), S('L', -1.15, 1.25, 2.45, 'L', 0, 1.3, 0, 35)],
      [30, 44, S('W', -0.95, 1.6, 2.0, 'L', 0, 1.35, 0, 36), S('W', -0.85, 1.6, 1.85, 'L', 0, 1.35, 0, 35, 0.03)],
      [44, 60, S('M', 0, 0.75, 3.5, 'M', 0, 1.3, 0, 40), S('M', 0, 0.8, 3.2, 'M', 0, 1.3, 0, 38)],
      [60, 72, S('L', -0.95, 0.65, 1.5, 'L', 0, 1.5, 0, 36), S('L', -0.9, 0.6, 1.45, 'L', 0, 1.6, 0, 36)],
      [72, 150, S('L', -1.0, -1.2, 5.2, 'L', 0, 0, 0, 44), S('L', -0.6, -1.6, 6.5, 'L', 0, 0, 0, 46)],
      [150, 176, S('W', 1.6, 2.6, 4.0, 'W', 0, 1.6, 0, 42), S('W', 1.2, 1.1, 2.7, 'W', 0, 1.4, 0, 35)],
      HERO(176, 210)],
    beats: [[62, { slow: 30, sfx: 'swoosh' }], [70, { kill: true, flash: '#fff6c0' }], [150, { star: 'L' }]],
  },

  // José: brinca altísimo, las nalgas le crecen y aplasta al rival
  nalgon: {
    mood: '#ff7ab8', key: '#ffe0ee',
    shots: [
      [0, 18, S('W', 0.9, 1.0, 4.0, 'W', 0, 1.4, 0, 42), S('W', 0.9, 0.2, 4.6, 'W', 0, 1.0, 0, 44)],
      // lo sigue bajando de lado y al final, desde los ojos del otro: las nalgas gigantes le caen encima
      [18, 32, S('W', -1.3, -0.3, 3.4, 'W', 0, 0.55, 0, 44), S('W', -1.15, 0.05, 3.0, 'W', 0, 0.5, 0, 44)],
      [32, 39, S('Lf', -0.25, -0.35, 0.75, 'W', 0, 0.55, 0, 64), S('Lf', -0.22, -0.4, 0.7, 'W', 0, 0.5, 0, 66)],
      [39, 100, S('L', 0.1, 0.4, 3.4, 'L', 0, 0.8, 0, 44), S('L', 0.4, 0.7, 4.4, 'L', 0, 0.8, 0, 42)],
      HERO(100, 170)],
    beats: [[18, { riser: 0.36 }], [40, { kill: true, flash: '#ffc0e0', sfx: 'boing' }]],
    pose: { L: [[18, 'miedo'], [40, null]] },
  },

  // Conde: se hace gigantesco y lo aplasta de un pisotón
  pisoton: {
    mood: '#ff7a1a', key: '#ffd8b0',
    shots: [
      // la cámara se queda y él crece hasta salirse del cuadro (la toma mira hacia arriba siguiéndole la cabeza)
      [0, 44, S('L', 0.6, 0.9, 4.4, 'W', 0, 1.25, 0, 44), S('L', 0.9, 0.55, 5.4, 'W', 0, 1.15, 0, 54)],
      [44, 60, S('M', 0.4, 0.5, 7.8, 'W', 0, 0.95, 0, 50), S('M', 0.35, 0.45, 7.2, 'W', 0, 1.0, 0, 50)],
      // desde abajo y de frente: el pie gigante sube y baja, con el otro encogido adelante
      [60, 92, S('L', 0.75, 0.3, 2.6, 'W', 0, 1.0, 0, 56), S('L', 0.65, 0.28, 2.3, 'W', 0, 0.75, 0, 58)],
      [92, 150, S('M', 0, 3.2, 11.5, 'M', 0, 2.6, 0, 46), S('M', 0, 3.0, 10.5, 'M', 0, 2.4, 0, 46)],
      [150, 186, S('W', 1.6, 1.0, 3.6, 'W', 0, 1.4, 0, 40), S('W', 1.3, 0.95, 3.0, 'W', 0, 1.4, 0, 37)],
      HERO(186, 230)],
    beats: [[44, { flash: '#ffd0a0', aberr: 0.8 }], [62, { sfx: 'heartbeat' }], [74, { sfx: 'heartbeat' }], [80, { riser: 0.2 }], [92, { kill: true, shake: 0.5 }]],
    pose: { L: [[60, 'miedo'], [92, null]] },
  },

  // Emi: chifla y un pescado gigante sale del piso, se lo traga y se vuelve a clavar
  pescadote: {
    mood: '#4fb8ff', key: '#d8ecff',
    shots: [
      [0, 24, S('Wf', 0.85, -0.05, 1.5, 'Wf', 0, -0.05, 0, 30), S('Wf', 0.75, -0.05, 1.35, 'Wf', 0, -0.02, 0, 29)],
      [24, 52, S('L', -2.4, 0.4, 3.7, 'L', 0, 1.4, 0, 46), S('L', -2.5, 0.5, 4.0, 'F', 0, 0.4, 0, 48)],
      [52, 104, S('M', 0, 2.0, 7.6, 'F', 0, 0, 0, 44), S('M', 0, 1.6, 7.0, 'F', 0, 0, 0, 44)],
      HERO(104, 200)],
    beats: [[24, { shake: 0.2 }], [52, { kill: true, flash: '#cfeeff' }], [104, { flash: '#dff4ff', aberr: 0.6 }]],
    pose: { L: [[24, 'miedo'], [52, null]] },
    fx(d, t, n) {
      // el agua que sale disparada cuando el pescado rompe el piso y cuando se vuelve a clavar
      if (t >= 24 && t < 50) d.solid(d.at('L', 0, 0.1, 0), { count: 5 * n, speed: 7, dir: [0, 1, 0], spread: 0.6, color: '#e8f8ff', colorEnd: '#4fb8ff', life: 0.9, size: 0.2, gravity: 12, drag: 0.3 });
      if (t >= 104 && t < 114) d.solid(d.at('F', 0, -0.3, 0), { count: 7 * n, speed: 8, dir: [0, 1, 0], spread: 0.7, color: '#e8f8ff', colorEnd: '#4fb8ff', life: 1.0, size: 0.22, gravity: 12, drag: 0.3 });
    },
  },

  // Ramces: lo sienta en la silla, la máquina, afila la navaja… y la cabeza sale volando
  corte: {
    mood: '#ff1a1a', key: '#ffe2c8',
    shots: [
      [0, 30, S('L', -2.5, 1.3, 3.6, 'L', 0, 1.0, 0, 42), S('L', -1.6, 1.25, 2.9, 'L', 0, 1.05, 0, 38)],
      [30, 40, S('L', 1.5, 1.6, 2.4, 'L', 0, 1.3, 0, 36), S('L', 1.15, 1.55, 2.2, 'L', 0, 1.3, 0, 34)],
      [40, 100, O('Lf', 0.95, -0.55, 1.35, 0.15, 0.02, 30)],
      [100, 127, S('Wh', 0.6, 0.12, 1.15, 'Wh', 0, 0, 0, 30), S('Wh', 0.5, 0.1, 0.98, 'Wh', 0, 0, 0, 28)],
      [127, 150, S('M', 0, 0.8, 3.4, 'L', 0, 1.35, 0, 40, -0.06), S('M', 0, 1.0, 4.3, 'H', 0, 0, 0, 44)],
      [150, 176, S('M', -0.4, 1.2, 4.6, 'H', 0, 0, 0, 44), S('M', -0.3, 1.1, 4.8, 'H', 0, 0, 0, 42)],
      HERO(176, 230)],
    beats: [[104, { glint: 'Wh' }], [116, { glint: 'Wh' }], [122, { riser: 0.12 }], [128, { kill: true, flash: '#ff2020' }]],
  },
};

// Estrella de cuatro puntas (destellos de la navaja y del que sale volando)
let STAR = null;
function starTexture() {
  if (STAR) return STAR;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 40);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#fff';
  for (const rot of [0, Math.PI / 2]) {
    x.save(); x.translate(64, 64); x.rotate(rot);
    x.beginPath(); x.moveTo(-62, 0); x.quadraticCurveTo(0, -4, 62, 0); x.quadraticCurveTo(0, 4, -62, 0); x.fill();
    x.restore();
  }
  STAR = new THREE.CanvasTexture(c); STAR.colorSpace = THREE.SRGBColorSpace;
  return STAR;
}

export class FatalDirector {
  constructor(game) {
    this.g = game;
    this.cam = null;            // { pos, look, fov, roll } mientras dura: main.js la usa en updateCamera
    this.key = null; this.def = null; this.fired = new Set();
    this.f = 1; this.t = 0; this.t0 = 0; this.killPulse = 0; this.spotI = 36;
    this.anchors = {}; this.wScale = 1;
    this.exposure = 1; this.desat = 0; this.vignette = 0.4; this.tint = new THREE.Color('#ff2020'); this.tintAmt = 0; this.glitch = 0;
    this._p = V(); this._l = V(); this._v = V();
    // luz de escenario: un cañón sobre los dos. Está oculta y se prende en la fatality; sus sombreados se
    // preparan antes (prewarm) para que al prenderla no se trabe el juego recompilando
    this.spot = new THREE.SpotLight('#ffe2c8', 0, 34, 0.48, 0.6, 1.1);
    this.spot.visible = false;
    game.scene.add(this.spot, this.spot.target);
  }

  get active() { return !!this.key; }

  prewarm() {
    const g = this.g, r = g.renderer;
    this.spot.visible = true;
    // (compile y no compileAsync: si se sale de la pelea mientras compila, compileAsync truena)
    try { r.compile(g.scene, g.camera); } catch { /* sin compilar antes */ }
    this.spot.visible = false;
  }

  reset() { if (this.key) this.end(); }

  begin(def, key) {
    const g = this.g, w = g.winner, fat = w.fatality || {};
    this.key = key; this.def = def; this.fired.clear(); this.killPulse = 0;
    this.f = w.facing || 1; this.t0 = performance.now();
    $('cine').classList.add('on');
    document.body.classList.add('cine');   // sin HUD ni botones del celular
    const card = $('fcard');
    $('fcard-name').textContent = fat.nombre || 'FATALITY';
    $('fcard-who').textContent = w.def.nombre;
    card.style.setProperty('--c', fat.color || '#ff2a2a');
    this.spot.color.set(def.key || '#ffe2c8');
    this.spot.visible = true;
    this.tint.set(def.mood || '#ff2020');
    if (!g.ffwd) this.snd('braam');
  }

  end() {
    this.key = null; this.def = null; this.cam = null;
    this.spot.visible = false; this.spot.intensity = 0;
    $('cine').classList.remove('on');
    document.body.classList.remove('cine');
    $('fcard').classList.remove('show');
    $('flash').style.background = '';
    this.exposure = 1; this.desat = 0; this.vignette = 0.4; this.tintAmt = 0; this.glitch = 0;
  }

  // ---------------------------------------------------------------- cada cuadro
  update(dt) {
    const g = this.g;
    const on = g.screen === 'fight' && g.fatal && (g.phase === 'fatality' || g.phase === 'postFatality') && g.winner && g.loser;
    if (!on) { if (this.key) this.end(); return; }
    const def = FATALS[g.fatal.tipo] || FATALS.explosion;
    const key = `${g.round}:${g.fatal.tipo}:${g.winnerSide}`;
    if (key !== this.key) this.begin(def, key);
    const post = g.phase === 'postFatality';
    const t = g.phaseT + (g.alpha ?? 0);
    this.t = t;
    this.updateAnchors();
    // momentos clave (solo una vez cada uno; si ya pasaron hace mucho, por ejemplo al entrar a ver una sala, no)
    if (!g.ffwd) {
      if (!post) def.beats?.forEach(([bt, o], i) => { if (!this.fired.has(i) && t >= bt) { this.fired.add(i); if (t - bt < 20) this.beat(o); } });
      else if (!this.fired.has('post')) { this.fired.add('post'); this.beat({ sfx: 'stinger', flash: '#ff1a1a', aberr: 0.9 }); this.killPulse = Math.max(this.killPulse, 0.55); }
      if (!post && def.fx && dt > 0) def.fx(this, t, Math.max(1, Math.round(dt * 60)));
    }
    // cámara
    const segs = post ? def.post || POST : def.shots;
    const seg = segs.find((s) => t >= s[0] && t < s[1]) || (t < segs[0][0] ? segs[0] : segs[segs.length - 1]);
    this.cam = this.evalSeg(seg, t);
    // luz de escenario sobre los dos (sube al empezar)
    // (sigue al que está en el aire: el cohete, el que vuela de un golpe, el que brinca)
    const M = this.anchors.M, up = smooth((performance.now() - this.t0) / 450), big = this.wScale;
    const hy = Math.min(12, Math.max(this.anchors.W.y, this.anchors.L.y));
    this.spot.position.set(M.x + this.f * 0.8, 7.5 + (big - 1) * 3 + hy, 5.5);
    this.spot.target.position.set(M.x, 0.9 * big + hy * 0.9, 0);
    this.spot.intensity = this.spotI * up * (post ? 0.6 : 1) * (1 + (big - 1) * 0.5);
    // color de la imagen: más oscuro alrededor, un poco gris y del color de la fatality; el remate lo pinta fuerte
    this.killPulse = Math.max(0, this.killPulse - dt * 1.3);
    const dark = DARK_STAGES[g.stageId] || 0;   // en los escenarios de noche no se oscurece tanto
    this.exposure = (post ? 0.62 : 0.5) + dark;
    this.vignette = post ? 0.68 : 0.78;
    this.desat = (post ? 0.3 : 0.12 + (def.desat || 0)) + this.killPulse * 0.25;
    if (post) this.tint.lerp(this._red ||= new THREE.Color('#ff1010'), Math.min(1, dt * 3));
    this.tintAmt = (post ? 0.16 : 0.1) + this.killPulse * 0.28;
    const gl = def.glitch;
    this.glitch = !post && gl ? smooth((t - gl[0]) / (gl[1] - gl[0])) * (t < gl[1] ? 0.55 : Math.max(0, 1 - (t - gl[1]) / 24)) : 0;
    // título de la fatality (abajo, como en el cine)
    $('fcard').classList.toggle('show', !post && t >= 6 && t < 100);
  }

  // ---------------------------------------------------------------- cámara
  updateAnchors() {
    const g = this.g, w = g.winner, l = g.loser, A = this.anchors;
    A.W = V(w.rx ?? w.x, w.y, 0);
    A.L = V(l.rx ?? l.x, l.y, 0);
    A.M = V((A.W.x + A.L.x) / 2, 0, 0);
    this.wScale = w.sizeScale || 1;
    const wm = g.viewModel(g.winnerSide), lm = g.viewModel(g.loserSide);
    A.Wf = this.bone(wm, 'head', 0.12) || V(A.W.x, A.W.y + 1.62 * this.wScale, 0);
    A.Lf = this.bone(lm, 'head', 0.12) || V(A.L.x, A.L.y + 1.62, 0);
    A.Wh = this.bone(wm, 'elF', 0, wm?.rig?.handF) || V(A.W.x + this.f * 0.6, A.W.y + 1.35, 0.2);
    const head = g.models[g.loserSide]?.head;
    A.H = head?.visible ? head.position.clone() : A.Lf.clone();
    A.F = g.bigFish?.visible ? g.bigFish.position.clone() : V(A.L.x, A.L.y + 1, 0);
    A.F.y = Math.max(A.F.y, 0.5);   // cuando se clava en el piso, la cámara no lo sigue bajo tierra
  }

  // posición en el mundo de un hueso del modelo (con un desplazamiento)
  bone(m, name, up = 0, off = null) {
    const b = m?.parts?.[name];
    if (!b) return null;
    m.root.updateMatrixWorld(true);
    return b.localToWorld(off ? off.clone() : V(0, up / (m.size || 1), 0));
  }

  pt(name, x = 0, y = 0, z = 0, out = V()) {
    const A = this.anchors[name] || this.anchors.M, k = name === 'W' ? this.wScale : 1;
    return out.set(A.x + x * this.f * k, A.y + y * k, A.z + z * k);
  }
  at(name, x, y, z) { return this.pt(name, x, y, z); }

  shot(s, pos, look) {
    this.pt(s.p[0], s.p[1], s.p[2], s.p[3], pos);
    this.pt(s.l[0], s.l[1], s.l[2], s.l[3], look);
  }

  evalSeg(seg, t) {
    const [t0, t1, A, B, ease = 'S'] = seg;
    const u = (EASE[ease] || smooth)((t - t0) / Math.max(1e-6, t1 - t0));
    const pos = V(), look = V();
    if (A.orbit) {
      const ang = lerp(A.a0, A.a1, u), C = this.pt(A.orbit), k = A.orbit === 'W' ? this.wScale : 1;
      pos.set(C.x + Math.sin(ang) * A.r * this.f * k, C.y + A.y * k, C.z + Math.cos(ang) * A.r * k);
      look.set(C.x, C.y + A.ly * k, C.z);
      return { pos, look, fov: A.fov, roll: 0 };
    }
    this.shot(A, pos, look);
    if (!B) return { pos, look, fov: A.fov, roll: A.roll };
    const p2 = this._p, l2 = this._l;
    this.shot(B, p2, l2);
    pos.lerp(p2, u); look.lerp(l2, u);
    return { pos, look, fov: lerp(A.fov, B.fov, u), roll: lerp(A.roll, B.roll, u) };
  }

  // ---------------------------------------------------------------- poses
  // La animación que se ve de cada peleador durante la fatality (null = la de la simulación)
  pose(f) {
    const g = this.g;
    if (!this.def || g.phase !== 'fatality') return null;
    const list = this.def.pose?.[f === g.winner ? 'W' : 'L'];
    if (!list) return null;
    const t = g.phaseT;
    let cur = null;
    for (const e of list) if (t >= e[0]) cur = e;
    if (!cur || !cur[1]) return null;
    const o = cur[2] || {};
    const at = o.hold != null ? Math.min(t - cur[0], o.hold) : t - cur[0];
    return { key: cur[1], t: at, total: o.total || 0, s: o.s ?? 0.3, a: o.a ?? 0.6, id: 'cine' + cur[0], flip: false, rate: o.hold != null && t - cur[0] >= o.hold ? 0 : 1 };
  }

  // ---------------------------------------------------------------- golpes de efecto
  beat(o) {
    const g = this.g;
    if (o.kill) this.kill(o);
    else if (o.flash) this.screenFlash(o.flash);
    if (o.aberr) g.aberr = Math.max(g.aberr || 0, o.aberr);
    if (o.fov) g.fovKick = Math.max(g.fovKick || 0, o.fov);
    if (o.shake && !o.kill) this.fx((e) => e.addShake(o.shake));
    if (o.slow && !g.session) g.slowmo = Math.max(g.slowmo || 0, o.slow);
    for (const s of [].concat(o.sfx || [])) this.snd(s);
    if (o.riser) this.snd('riser', o.riser);
    if (o.light) { const [a, c, i] = o.light; this.light(a, c, i); }
    if (o.glint) { this.sparkle(this.at(o.glint), '#ffffff', 0.16, 0.3); this.snd('glint'); }
    if (o.star) this.sparkle(this.at(o.star, 0, 1.0, 0), '#fff6c0', 1.6, 0.9);
    if (o.burst) { const [a, c, n] = o.burst; this.fx((e) => e.burst(this.at(a, 0, 1.0, 0.2), c, n || 40, 5)); }
    if (o.fireworks) {
      o.fireworks.forEach((c, i) => {
        const p = this.at('L', (i ? 1 : -1) * (1.2 + Math.random()), 0.6 + Math.random() * 1.6, -1.2);
        this.fx((e) => { e.burst(p, c, 70, 8, 0.25); e.flash(p, c, 10); });
      });
      this.snd('crackle');
    }
  }

  // El remate: destello, colores corridos, zoom de golpe, temblor, cámara lenta (si no es en línea) y el trancazo
  kill(o) {
    const g = this.g;
    this.killPulse = 1;
    this.screenFlash(o.flash || '#ffffff');
    g.aberr = Math.max(g.aberr || 0, 2.2);
    g.fovKick = Math.max(g.fovKick || 0, 6);
    this.fx((e) => { e.addShake(o.shake ?? 0.35); e.flash(this.at('Lf'), o.flash || '#ffffff', 16); });
    if (!g.session) g.slowmo = Math.max(g.slowmo || 0, o.slow ?? 40);
    this.snd('fatalHit');
    g.vibrate?.([90, 40, 160]);
  }

  screenFlash(color) {
    const fl = $('flash');
    fl.style.background = color;
    fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on');
  }

  // destello de estrella que crece y se apaga
  sparkle(pos, color, size, life) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    m.position.copy(pos); m.scale.setScalar(0.001);
    this.g.scene.add(m);
    this.fx((e) => e.addTemp(null, life, (dt, k) => {
      const s = Math.max(0.001, Math.sin(Math.min(1, k) * Math.PI) * size);
      m.scale.set(s, s, 1); m.material.rotation = k * 1.4;
      if (k >= 1) { this.g.scene.remove(m); m.material.dispose(); }
    }));
  }

  // ayudas para los efectos de cada fatality (fx): sin el filtro del rollback, que es para la simulación
  fx(fn) { const e = this.g.effects, gate = e.gate; e.gate = null; try { fn(e); } finally { e.gate = gate; } }
  snd(name, ...a) { const gate = audioState.gate; audioState.gate = null; try { sfx[name]?.(...a); } finally { audioState.gate = gate; } }
  glow(pos, o) { this.g.effects.glow.emit({ pos, ...o }); }
  solid(pos, o) { this.g.effects.solid.emit({ pos, ...o }); }
  light(name, color, intensity) { this.fx((e) => e.flash(this.at(name, 0, 0.1, 0.3), color, intensity)); }
}
