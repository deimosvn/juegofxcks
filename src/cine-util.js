import * as THREE from 'three';

// Ayudas para las escenas de cine (fatal.js y cine-brutal.js)
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };

// Toma: dónde va la cámara (p) y a dónde mira (l), cada una pegada a un "ancla":
//   W el que gana · L el que pierde · M entre los dos, en el piso · Wf / Lf la cara de cada uno
//   Wh la mano del que gana · H la cabeza que vuela (Ramces) · F el pescado gigante (Emi)
// x va hacia donde mira el que gana (así sirve de los dos lados), y hacia arriba, z hacia la cámara.
// Lo que se pega a W crece con él (Conde gigante).
export const S = (pa, px, py, pz, la, lx, ly, lz, fov = 38, roll = 0) => ({ p: [pa, px, py, pz], l: [la, lx, ly, lz], fov, roll });
// vuelta alrededor de un ancla: ángulo inicial y final (0 = de frente, + hacia donde mira el que gana),
// radio, altura de la cámara, altura a la que mira
export const O = (a, a0, a1, r, y, ly, fov = 36) => ({ orbit: a, a0, a1, r, y, ly, fov });

// Tomas que se repiten: abre con el que gana de cerca y desde abajo; cierra con él posando
export const OPEN = (t1 = 18) => [0, t1, S('Wf', 1.0, -0.55, 2.1, 'Wf', 0, -0.18, 0, 34), S('Wf', 0.75, -0.45, 1.75, 'Wf', 0, -0.12, 0, 30)];
export const HERO = (t0, t1) => [t0, t1, S('W', 1.4, 0.85, 2.9, 'W', 0, 1.3, 0, 36), S('W', 1.0, 0.95, 2.4, 'W', 0, 1.38, 0, 32)];
