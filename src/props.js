import * as THREE from 'three';

// =====================================================================
//  Utilería de Emi (pescadero): pescado y caguama.
//  Se usan para lo que avienta, para lo que trae en la mano y para el
//  pescado gigante de su fatality.
// =====================================================================

// Pescado acostado sobre el eje x: cabeza hacia +x (mide ~0.6 de largo)
export function makeFish({ body = '#8fb3c9', belly = '#eef3f6', fin = '#5d7d92' } = {}) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: body, metalness: 0.55, roughness: 0.32 });
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), skin);
  torso.scale.set(2.1, 0.85, 0.55); g.add(torso);
  const pale = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 10), new THREE.MeshStandardMaterial({ color: belly, metalness: 0.25, roughness: 0.4 }));
  pale.scale.set(1.85, 0.6, 0.5); pale.position.y = -0.035; g.add(pale);
  const finMat = new THREE.MeshStandardMaterial({ color: fin, roughness: 0.5, side: THREE.DoubleSide });
  // cola en V (pirámide aplastada con la punta hacia el cuerpo)
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 3), finMat);
  tail.rotation.z = -Math.PI / 2; tail.scale.z = 0.18; tail.position.x = -0.31; g.add(tail);
  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.13, 3), finMat);
  dorsal.scale.z = 0.2; dorsal.position.set(0.0, 0.11, 0); g.add(dorsal);
  for (const z of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 3), finMat);
    side.rotation.set(0.6 * z, 0, 2.2); side.scale.z = 0.25; side.position.set(0.08, -0.05, 0.05 * z); g.add(side);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), new THREE.MeshBasicMaterial({ color: '#f5f5f5' }));
    eye.position.set(0.19, 0.03, 0.055 * z); g.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), new THREE.MeshBasicMaterial({ color: '#111' }));
    pupil.position.set(0.203, 0.03, 0.066 * z); g.add(pupil);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 12), new THREE.MeshStandardMaterial({ color: '#5a3d3d', roughness: 0.6 }));
  mouth.rotation.y = Math.PI / 2; mouth.position.set(0.25, -0.01, 0); g.add(mouth);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Caguama de pie sobre el eje y: base en y=0, tapa en y≈0.36
export function makeKawama() {
  const g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: '#6b3a0e', roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.9 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.06, 0.2, 18), glass); body.position.y = 0.1; g.add(body);
  const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.062, 0.07, 18), glass); shoulder.position.y = 0.235; g.add(shoulder);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.022, 0.09, 12), glass); neck.position.y = 0.315; g.add(neck);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.016, 12), new THREE.MeshStandardMaterial({ color: '#d9b04a', metalness: 0.8, roughness: 0.3 }));
  cap.position.y = 0.366; g.add(cap);
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0635, 0.0635, 0.1, 18, 1, true), new THREE.MeshStandardMaterial({ color: '#c8102e', roughness: 0.6 }));
  label.position.y = 0.1; g.add(label);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0638, 0.0638, 0.02, 18, 1, true), new THREE.MeshStandardMaterial({ color: '#f2e6c8', roughness: 0.6 }));
  band.position.y = 0.1; g.add(band);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// =====================================================================
//  Utilería de Ramces (barbero): tijeras, máquina, navaja, brocha y, para
//  su fatality, la silla de barbero y la capa.
//  Las herramientas van acostadas sobre el eje x con la punta hacia +x.
// =====================================================================
const steel = () => new THREE.MeshStandardMaterial({ color: '#dfe4e8', metalness: 0.9, roughness: 0.22 });
const shadowed = (g) => { g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); return g; };

// Tijeras abiertas (~0.27 de largo)
export function makeScissors() {
  const g = new THREE.Group(), blade = steel();
  const grip = new THREE.MeshStandardMaterial({ color: '#c0161b', roughness: 0.45 });
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.016, 0.005), blade);
    b.geometry.translate(0.095, 0, 0); b.rotation.z = s * 0.16; b.position.z = s * 0.003; g.add(b);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.008, 6, 14), grip);
    ring.position.set(-0.04, s * 0.03, 0); g.add(ring);
  }
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 8), blade);
  pin.rotation.x = Math.PI / 2; g.add(pin);
  return shadowed(g);
}

// Máquina de cortar el pelo
export function makeClippers() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.16, 14), new THREE.MeshStandardMaterial({ color: '#1b1b1f', roughness: 0.35, metalness: 0.3 }));
  body.rotation.z = Math.PI / 2; g.add(body);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 14), new THREE.MeshStandardMaterial({ color: '#d4af37', metalness: 0.85, roughness: 0.3 }));
  ring.rotation.z = Math.PI / 2; ring.position.x = 0.03; g.add(ring);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.064, 0.05), steel());
  head.position.x = 0.09; g.add(head);
  for (let i = 0; i < 7; i++) {   // dientes
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.005, 0.044), steel());
    tooth.position.set(0.106, -0.027 + i * 0.009, 0); g.add(tooth);
  }
  return shadowed(g);
}

// Navaja de barbero abierta
export function makeRazor() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.022, 0.012), new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.35 }));
  handle.position.x = -0.06; g.add(handle);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.004), new THREE.MeshStandardMaterial({ color: '#eef2f5', metalness: 1, roughness: 0.1 }));
  blade.position.x = 0.07; g.add(blade);
  return shadowed(g);
}

// Brocha para quitar los pelitos (y aventar talco)
export function makeBrush() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.12, 10), new THREE.MeshStandardMaterial({ color: '#7a4a24', roughness: 0.5 }));
  handle.rotation.z = Math.PI / 2; g.add(handle);
  const bristles = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), new THREE.MeshStandardMaterial({ color: '#f1ece2', roughness: 0.95 }));
  bristles.scale.set(1.35, 1, 1); bristles.position.x = 0.1; g.add(bristles);
  return shadowed(g);
}

// Silla de barbero (cromo y vinil rojo). El frente mira a +z; el asiento queda a ~0.57 m.
export function makeBarberChair() {
  const g = new THREE.Group();
  const chrome = new THREE.MeshStandardMaterial({ color: '#d8dde2', metalness: 0.95, roughness: 0.18 });
  const vinyl = new THREE.MeshStandardMaterial({ color: '#a3121a', roughness: 0.42 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.6 });
  const add = (geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; g.add(m); return m; };
  add(new THREE.CylinderGeometry(0.34, 0.38, 0.05, 28), chrome, 0, 0.025, 0);             // base
  add(new THREE.CylinderGeometry(0.07, 0.08, 0.36, 16), chrome, 0, 0.23, 0);              // pistón
  add(new THREE.BoxGeometry(0.5, 0.06, 0.5), chrome, 0, 0.42, 0);                          // soporte
  add(new THREE.BoxGeometry(0.58, 0.12, 0.56), vinyl, 0, 0.51, 0.02);                      // asiento
  add(new THREE.BoxGeometry(0.56, 0.74, 0.12), vinyl, 0, 0.94, -0.28, -0.12);              // respaldo
  add(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 8), chrome, 0, 1.37, -0.34, -0.12);   // varilla
  add(new THREE.BoxGeometry(0.28, 0.12, 0.1), vinyl, 0, 1.49, -0.35, -0.12);               // cabecero
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.09, 0.07, 0.5), vinyl, s * 0.34, 0.75, 0.02);              // descansabrazos
    add(new THREE.BoxGeometry(0.03, 0.2, 0.03), chrome, s * 0.34, 0.63, 0.2);
    add(new THREE.BoxGeometry(0.03, 0.2, 0.03), chrome, s * 0.34, 0.63, -0.18);
  }
  add(new THREE.BoxGeometry(0.44, 0.03, 0.16), chrome, 0, 0.16, 0.44);                     // reposapiés
  add(new THREE.BoxGeometry(0.03, 0.03, 0.34), chrome, 0, 0.3, 0.29, 0.9);
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8), chrome, 0.37, 0.38, 0.12, 0.6);    // palanca
  add(new THREE.SphereGeometry(0.03, 10, 8), dark, 0.37, 0.5, 0.21);
  return shadowed(g);
}

// Capa de barbero: cono blanco abierto con la punta en el origen (va en el cuello)
export function makeCape() {
  const geo = new THREE.ConeGeometry(0.82, 0.95, 24, 1, true);
  geo.translate(0, -0.475, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#f4f4f2', roughness: 0.75, side: THREE.DoubleSide }));
  m.castShadow = true;
  return m;
}
