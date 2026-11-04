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

// =====================================================================
//  Utilería de Abel (guitarra), Jaziel (vaquero) y Diego Suárez (aeroespacial).
//  Igual que las de Ramces: acostadas sobre el eje x con la punta hacia +x.
// =====================================================================
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...o });

// Guitarra eléctrica morada con golpeador blanco (~1 m; Abel va de negro y así se ve). El mástil va hacia +x; el origen es donde se agarra
// (en el cuello, cuando la avienta o la usa de mazo). `cuerpo`: el origen al centro del cuerpo (colgada).
export function makeGuitar({ cuerpo = false } = {}) {
  const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
  const black = mat('#141418', { roughness: 0.25, metalness: 0.2 }), wood = mat('#6b4425', { roughness: 0.6 });
  const chrome = mat('#dfe4e8', { metalness: 0.9, roughness: 0.2 }), violet = mat('#6a2bd9', { roughness: 0.2, metalness: 0.35 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 20), violet);
  body.rotation.x = Math.PI / 2; body.scale.set(1.15, 1, 1); body.position.x = -0.02; inner.add(body);
  const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 20), violet);
  lower.rotation.x = Math.PI / 2; lower.scale.set(1.2, 1, 1); lower.position.x = -0.2; inner.add(lower);
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.052, 16), mat('#f4f2f8', { roughness: 0.3 }));
  guard.rotation.x = Math.PI / 2; guard.position.set(-0.12, -0.06, 0.003); inner.add(guard);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.03), wood); neck.position.x = 0.38; inner.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.03), black); head.position.set(0.68, 0.01, 0); head.rotation.z = 0.12; inner.add(head);
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 6), chrome);
    peg.position.set(0.64 + i * 0.035, 0.01 + s * 0.045, 0); inner.add(peg);
  }
  for (const x of [-0.06, -0.16]) { const pu = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.056), chrome); pu.position.set(x, 0, 0); inner.add(pu); }
  const strings = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.03, 0.002), mat('#e8e8e8', { metalness: 0.9, roughness: 0.3 }));
  strings.position.set(0.22, 0, 0.03); inner.add(strings);
  inner.position.x = cuerpo ? 0.15 : -0.38;   // colgada: el centro del cuerpo · en la mano: el cuello
  return shadowed(g);
}

// Lazo enrollado (rollo de cuerda en la mano)
export function makeLassoCoil() {
  const g = new THREE.Group(), rope = mat('#c9a46a', { roughness: 0.9 });
  for (let i = 0; i < 4; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.15 + i * 0.008, 0.012, 6, 22), rope);
    r.rotation.y = Math.PI / 2; r.rotation.x = i * 0.12; r.position.set(0.02, -0.12, 0); g.add(r);
  }
  return shadowed(g);
}

// Revólver de vaquero: el cañón hacia +x
export function makeRevolver() {
  const g = new THREE.Group(), steel = mat('#3a3d42', { metalness: 0.85, roughness: 0.3 }), grip = mat('#6b4425', { roughness: 0.7 });
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 10), steel); barrel.rotation.z = Math.PI / 2; barrel.position.set(0.14, 0.03, 0); g.add(barrel);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.05, 8), steel); drum.rotation.z = Math.PI / 2; drum.position.set(0.03, 0.025, 0); g.add(drum);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.025), steel); frame.position.set(0.02, 0.03, 0); g.add(frame);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.03), grip); handle.position.set(-0.02, -0.03, 0); handle.rotation.z = 0.35; g.add(handle);
  return shadowed(g);
}

// Remachadora neumática (pistola de remaches de la planta de aviones)
export function makeRivetGun() {
  const g = new THREE.Group(), body = mat('#2a5fbf', { roughness: 0.4, metalness: 0.3 }), steel = mat('#cfd6dd', { metalness: 0.9, roughness: 0.25 });
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.2, 12), body); b.rotation.z = Math.PI / 2; b.position.set(0.08, 0.04, 0); g.add(b);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.08, 10), steel); tip.rotation.z = Math.PI / 2; tip.position.set(0.21, 0.04, 0); g.add(tip);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.11, 0.035), mat('#1b1b1f', { roughness: 0.6 })); handle.position.set(0, -0.02, 0); handle.rotation.z = 0.25; g.add(handle);
  const hose = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.008, 6, 14, Math.PI), mat('#ffb000', { roughness: 0.6 })); hose.position.set(-0.02, -0.12, 0); hose.rotation.z = Math.PI / 2; g.add(hose);
  return shadowed(g);
}

// Avión de papel: la punta hacia +x (~0.5 de largo; el que avienta se escala)
export function makePaperPlane(stripe = '#2a7fff') {
  const g = new THREE.Group();
  const paper = new THREE.MeshStandardMaterial({ color: '#f7f7f2', roughness: 0.8, side: THREE.DoubleSide });
  const geo = new THREE.BufferGeometry();
  // dos alas y la quilla, de papel doblado
  const v = [0.25, 0, 0, -0.25, 0.02, 0.2, -0.25, 0.02, 0.02, 0.25, 0, 0, -0.25, 0.02, -0.02, -0.25, 0.02, -0.2,
    0.25, 0, 0, -0.25, 0.02, 0.02, -0.25, -0.08, 0, 0.25, 0, 0, -0.25, -0.08, 0, -0.25, 0.02, -0.02];
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, paper));
  for (const z of [-1, 1]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.002, 0.012), mat(stripe)); s.position.set(-0.1, 0.016, z * 0.12); s.rotation.y = z * -0.32; g.add(s);
  }
  return shadowed(g);
}

// Paleta de señalero de aeropuerto (bastón naranja que brilla): a lo largo de +x
export function makeWand() {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 10), new THREE.MeshStandardMaterial({ color: '#ff8a1a', emissive: '#ff6a00', emissiveIntensity: 1.6, roughness: 0.4 }));
  stick.rotation.z = Math.PI / 2; stick.position.x = 0.2; g.add(stick);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 10), mat('#1b1b1f')); grip.rotation.z = Math.PI / 2; grip.position.x = -0.03; g.add(grip);
  return shadowed(g);
}

// Caja negra (que en realidad es naranja, para encontrarla entre los restos)
export function makeBlackBox() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.18), mat('#ff7a00', { roughness: 0.45 })));
  for (const x of [-0.085, 0.085]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.205, 0.185), mat('#f2f2f2', { roughness: 0.3 })); s.position.x = x; g.add(s); }
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12, Math.PI), mat('#2a2a2a')); handle.position.y = 0.1; g.add(handle);
  return shadowed(g);
}

// Amplificador de guitarra (la bocina ve hacia +z). userData.cone: la bocina (late con el sonido)
export function makeAmp() {
  const g = new THREE.Group(), black = mat('#151515', { roughness: 0.7 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.56, 0.34), black); box.position.y = 0.28; g.add(box);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.4, 0.01), mat('#2b2b2e', { roughness: 0.95 })); grille.position.set(0, 0.25, 0.172); g.add(grille);
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 20), mat('#3a3a3e', { roughness: 0.5, metalness: 0.3 }));
  cone.rotation.x = Math.PI / 2; cone.position.set(0, 0.25, 0.18); g.add(cone);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.07, 0.012), mat('#c9a24a', { metalness: 0.7, roughness: 0.3 })); panel.position.set(0, 0.5, 0.172); g.add(panel);
  for (let i = 0; i < 5; i++) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 8), black); k.rotation.x = Math.PI / 2; k.position.set(-0.2 + i * 0.1, 0.5, 0.18); g.add(k); }
  g.userData.cone = cone;
  return shadowed(g);
}

// Caballo de ~2.3 m de largo y 1.55 m a la cruz, mirando hacia +x con las patas en y = 0.
// userData.pose(fase, galope, extra): fase 0..1 del paso, galope 0 = parado · 1 = a todo;
// extra.salto 0..1 = patas recogidas (brinca) · extra.coz 0..1 = patada de mula con las de atrás
// userData.horn: la cabeza de la silla (de ahí se amarra la reata)
export function makeHorse({ pelo = '#7a4a26', crin = '#24160c', silla = false, manta = '#b8322a' } = {}) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const skin = mat(pelo, { roughness: 0.55 }), hair = mat(crin, { roughness: 0.85 }), hoofM = mat('#1a1410', { roughness: 0.6 });
  const add = (parent, geo, m, x, y, z, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.z = rz; parent.add(o); return o; };
  // tronco, pecho y anca
  add(body, new THREE.CapsuleGeometry(0.31, 0.95, 6, 14), skin, 0, 1.12, 0, Math.PI / 2).scale.set(1.05, 1, 0.85);
  add(body, new THREE.SphereGeometry(0.33, 16, 12), skin, 0.55, 1.13, 0).scale.set(1, 1.05, 0.88);
  add(body, new THREE.SphereGeometry(0.34, 16, 12), skin, -0.56, 1.18, 0).scale.set(1, 1, 0.92);
  // cuello, crin y cabeza
  add(body, new THREE.CylinderGeometry(0.14, 0.24, 0.74, 12), skin, 0.8, 1.58, 0, -0.57);
  add(body, new THREE.BoxGeometry(0.08, 0.76, 0.06), hair, 0.66, 1.67, 0, -0.57);
  const head = new THREE.Group(); head.position.set(1.0, 1.9, 0); body.add(head);
  add(head, new THREE.CapsuleGeometry(0.115, 0.36, 4, 10), skin, 0.15, -0.15, 0, -2.36).scale.set(1, 1, 0.85);
  add(head, new THREE.SphereGeometry(0.1, 12, 8), mat('#2a1e18', { roughness: 0.6 }), 0.31, -0.31, 0).scale.set(1.1, 0.9, 0.9);
  add(head, new THREE.BoxGeometry(0.09, 0.12, 0.05), hair, 0.02, 0.07, 0, 0.5);
  for (const z of [-1, 1]) {
    add(head, new THREE.ConeGeometry(0.035, 0.13, 6), skin, -0.02, 0.12, z * 0.06, 0.25);
    add(head, new THREE.SphereGeometry(0.026, 8, 6), mat('#0b0b0b', { roughness: 0.2 }), 0.09, -0.03, z * 0.085);
  }
  // cola
  const tail = new THREE.Group(); tail.position.set(-0.88, 1.32, 0); body.add(tail);
  add(tail, new THREE.CapsuleGeometry(0.065, 0.55, 4, 8), hair, -0.1, -0.32, 0, 0.3).scale.set(1, 1, 0.8);
  // patas: cadera / rodilla / casco. Las de adelante doblan hacia atrás, las de atrás hacia adelante
  const legs = [[0.55, 0.16, 0], [0.55, -0.16, 0.08], [-0.58, 0.16, 0.5], [-0.58, -0.16, 0.58]].map(([x, z, off]) => {
    const front = x > 0, hip = new THREE.Group(), knee = new THREE.Group();
    hip.position.set(x, 1.0, z); body.add(hip);
    add(hip, new THREE.CylinderGeometry(front ? 0.09 : 0.11, 0.06, 0.5, 8), skin, 0, -0.25, 0);
    knee.position.y = -0.5; hip.add(knee);
    add(knee, new THREE.CylinderGeometry(0.05, 0.045, 0.42, 8), skin, 0, -0.21, 0);
    add(knee, new THREE.CylinderGeometry(0.058, 0.07, 0.09, 8), hoofM, 0, -0.455, 0);
    return { hip, knee, front, off };
  });
  if (silla) {
    const leather = mat('#5a3519', { roughness: 0.65 });
    const blanket = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.56, 18, 1, true, -0.95, 1.9), mat(manta, { roughness: 0.9 }));
    blanket.rotation.z = Math.PI / 2; blanket.position.set(0.02, 1.13, 0); blanket.scale.set(1.08, 1, 0.92); body.add(blanket);
    add(body, new THREE.SphereGeometry(0.28, 16, 10), leather, 0.02, 1.47, 0).scale.set(1.05, 0.32, 0.95);
    add(body, new THREE.BoxGeometry(0.07, 0.16, 0.34), leather, -0.22, 1.54, 0, 0.35);
    add(body, new THREE.CylinderGeometry(0.025, 0.03, 0.14, 8), leather, 0.24, 1.58, 0);
    g.userData.horn = add(body, new THREE.SphereGeometry(0.04, 8, 6), leather, 0.25, 1.66, 0);
    for (const z of [-1, 1]) {
      add(body, new THREE.BoxGeometry(0.04, 0.46, 0.015), leather, 0.02, 1.2, z * 0.33);
      add(body, new THREE.TorusGeometry(0.055, 0.012, 6, 12), mat('#c9cfd6', { metalness: 0.8, roughness: 0.3 }), 0.02, 0.94, z * 0.34);
    }
  }
  const TAU = Math.PI * 2, mix = (a, b, u) => a + (b - a) * u;
  g.userData.pose = (fase, galope = 1, o = {}) => {
    const k = galope, salto = o.salto || 0, coz = o.coz || 0;
    for (const L of legs) {
      const ph = (fase + L.off) * TAU;
      let hipA = Math.sin(ph) * 0.55 * k, kneeA = Math.max(0, Math.sin(ph - 0.9)) * 1.2 * k;
      if (L.front) kneeA = -kneeA;
      if (salto) { hipA = mix(hipA, L.front ? 0.95 : -0.85, salto); kneeA = mix(kneeA, L.front ? -1.9 : 1.6, salto); }
      if (coz) {
        if (L.front) { hipA = mix(hipA, 0.3, coz); kneeA = mix(kneeA, -0.2, coz); }
        else { hipA = mix(hipA, -1.3, coz); kneeA = mix(kneeA, 0.1, coz); }
      }
      L.hip.rotation.z = hipA; L.knee.rotation.z = kneeA;
    }
    body.position.y = Math.abs(Math.sin(fase * TAU)) * 0.06 * k + coz * 0.12;
    body.rotation.z = Math.sin(fase * TAU) * 0.05 * k - coz * 0.3;
    head.rotation.z = Math.sin(fase * TAU + 1) * 0.1 * k + coz * 0.35;
    tail.rotation.z = -0.15 - 0.65 * Math.max(k, coz) + Math.sin(fase * TAU * 2) * 0.12 * k;
  };
  g.userData.pose(0, 0);
  return shadowed(g);
}

// Avioneta fumigadora (amarilla, ala baja, ~4.5 m de largo y 7 de ala), mirando hacia +x. userData.prop: la hélice
export function makeCropDuster() {
  const g = new THREE.Group(), yellow = mat('#f2c230', { roughness: 0.45, metalness: 0.15 }), dark = mat('#2a2d31', { roughness: 0.5 });
  const red = mat('#d8301f', { roughness: 0.5 });
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); parent.add(o); return o; };
  add(new THREE.CylinderGeometry(0.36, 0.17, 3.4, 14), yellow, 0.1, 0, 0, 0, 0, -Math.PI / 2);
  add(new THREE.CylinderGeometry(0.38, 0.36, 0.55, 14), dark, 1.95, 0, 0, 0, 0, -Math.PI / 2);
  add(new THREE.SphereGeometry(0.32, 14, 10), mat('#1f3344', { metalness: 0.6, roughness: 0.15 }), 0.55, 0.3, 0).scale.set(1.5, 0.75, 0.8);
  add(new THREE.BoxGeometry(1.15, 0.08, 7.0), yellow, 0.55, -0.22, 0);
  for (const z of [-1, 1]) add(new THREE.BoxGeometry(1.16, 0.09, 0.5), red, 0.55, -0.22, z * 3.3);
  add(new THREE.BoxGeometry(0.62, 0.06, 2.1), yellow, -1.55, 0.05, 0);
  add(new THREE.BoxGeometry(0.75, 0.85, 0.06), red, -1.55, 0.45, 0, 0, 0, 0.35);
  add(new THREE.CylinderGeometry(0.022, 0.022, 6.2, 6), dark, 0.1, -0.33, 0, Math.PI / 2);
  for (const z of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.55, 6), dark, 1.0, -0.5, z * 0.75, z * 0.25);
    add(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 14), dark, 1.0, -0.78, z * 0.82, Math.PI / 2);
  }
  const prop = new THREE.Group(); prop.position.x = 2.27; g.add(prop);
  add(new THREE.ConeGeometry(0.13, 0.25, 12), dark, 0, 0, 0, 0, 0, -Math.PI / 2, prop);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.05, 0.85, 0.13), dark, 0, s * 0.45, 0, 0, 0, 0, prop);
  add(new THREE.CircleGeometry(0.92, 24), new THREE.MeshBasicMaterial({ color: '#e8e8e8', transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }), 0, 0, 0, 0, Math.PI / 2, 0, prop);
  g.userData.prop = prop;
  return shadowed(g);
}

// Avión de hélices de ala alta (~15 m de largo y 16 de ala), mirando hacia +x, con el tren de aterrizaje
// abajo: las llantas tocan el piso cuando su centro está a 2.35 m. La punta de la nariz queda en x = 6.4.
// userData.props: las dos hélices · userData.lights: las luces de aterrizaje
export function makeTurboprop() {
  const g = new THREE.Group();
  const white = mat('#f4f6f8', { roughness: 0.35, metalness: 0.2 }), blue = mat('#1f5fbf', { roughness: 0.4 }), orange = mat('#ff7a00', { roughness: 0.45 });
  const dark = mat('#20242a', { roughness: 0.4, metalness: 0.4 }), glass = mat('#16222e', { roughness: 0.1, metalness: 0.7 });
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); parent.add(o); return o; };
  add(new THREE.CylinderGeometry(0.85, 0.85, 10, 22), white, 0, 0, 0, 0, 0, Math.PI / 2);
  add(new THREE.SphereGeometry(0.85, 22, 14), white, 5, 0, 0).scale.set(1.65, 0.92, 1);
  add(new THREE.CylinderGeometry(0.85, 0.22, 3.6, 22), white, -6.75, 0.32, 0, 0, 0, Math.PI / 2 + 0.09);
  add(new THREE.BoxGeometry(0.55, 0.3, 1.2), glass, 5.7, 0.42, 0, 0, 0, -0.55);
  add(new THREE.BoxGeometry(8.4, 0.2, 1.72), glass, 0.2, 0.22, 0);
  add(new THREE.BoxGeometry(10.6, 0.1, 1.715), orange, 0, -0.08, 0);
  add(new THREE.BoxGeometry(10.6, 0.05, 1.712), blue, 0, -0.2, 0);
  // ala alta con motores y hélices
  add(new THREE.BoxGeometry(1.9, 0.22, 16), white, 0.7, 0.98, 0);
  for (const z of [-1, 1]) add(new THREE.BoxGeometry(1.92, 0.23, 0.6), blue, 0.7, 0.98, z * 7.7);
  const props = [], lights = [];
  for (const z of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.4, 0.34, 2.5, 14), white, 1.25, 0.72, z * 2.9, 0, 0, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 14), dark, 2.52, 0.72, z * 2.9, 0, 0, Math.PI / 2);
    const prop = new THREE.Group(); prop.position.set(2.62, 0.72, z * 2.9); g.add(prop);
    add(new THREE.ConeGeometry(0.17, 0.35, 12), dark, 0.08, 0, 0, 0, 0, -Math.PI / 2, prop);
    for (let i = 0; i < 6; i++) { const b = add(new THREE.BoxGeometry(0.06, 0.82, 0.15), dark, 0, 0, 0, i * Math.PI / 3, 0, 0, prop); b.geometry.translate(0, 0.45, 0); }
    add(new THREE.CircleGeometry(0.92, 24), new THREE.MeshBasicMaterial({ color: '#dfe6ee', transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }), 0, 0, 0, 0, Math.PI / 2, 0, prop);
    props.push(prop);
    lights.push(add(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff6d8' }), 1.3, 0.92, z * 1.4));
  }
  // cola en T
  add(new THREE.BoxGeometry(2.4, 2.6, 0.18), blue, -7.7, 1.75, 0, 0, 0, 0.42);
  add(new THREE.BoxGeometry(1.5, 0.14, 5.2), white, -8.35, 2.98, 0);
  // tren de aterrizaje
  for (const z of [-1, 1]) {
    add(new THREE.BoxGeometry(2.0, 0.5, 0.5), white, -0.3, -0.72, z * 0.92);
    add(new THREE.CylinderGeometry(0.07, 0.07, 1.05, 8), dark, -0.3, -1.45, z * 0.92);
    for (const dx of [-0.2, 0.2]) add(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 16), dark, -0.3 + dx, -2.03, z * 0.92, Math.PI / 2);
  }
  add(new THREE.CylinderGeometry(0.06, 0.06, 1.25, 8), dark, 3.6, -1.35, 0);
  for (const z of [-1, 1]) add(new THREE.CylinderGeometry(0.28, 0.28, 0.16, 14), dark, 3.6, -2.07, z * 0.14, Math.PI / 2);
  // el nombre en la cola, de los dos lados
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.font = 'bold 70px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('AEROSUÁREZ', 256, 68);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  for (const z of [-1, 1]) add(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }), -7.55, 1.55, z * 0.1, 0, z > 0 ? 0 : Math.PI, 0.42 * z);
  g.userData.props = props; g.userData.lights = lights;
  return shadowed(g);
}

// Las botas que se quedan amarradas en la reata (Jaziel), acostadas, la punta hacia +x
export function makeBoots() {
  const g = new THREE.Group(), leather = mat('#6b3f1d', { roughness: 0.6 }), sole = mat('#2a1a0e', { roughness: 0.8 });
  for (const z of [-0.09, 0.09]) {
    const b = new THREE.Group(); b.position.z = z; g.add(b);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.3, 10), leather); shaft.rotation.z = Math.PI / 2; shaft.position.set(-0.12, 0.08, 0); b.add(shaft);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.1), leather); foot.position.set(0.1, 0.06, 0); b.add(foot);
    const toe = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 8), leather); toe.rotation.z = -Math.PI / 2; toe.position.set(0.28, 0.06, 0); b.add(toe);
    const heel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.09), sole); heel.position.set(-0.01, 0.0, 0); b.add(heel);
    const spur = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 4, 10), mat('#c9cfd6', { metalness: 0.8, roughness: 0.3 })); spur.position.set(-0.07, 0.02, 0); b.add(spur);
  }
  return shadowed(g);
}

// Chupón y pañal (la fatality de Abel)
export function makePacifier() {
  const g = new THREE.Group();
  const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.014, 16), mat('#7fd0ff', { roughness: 0.3 }));
  shield.rotation.x = Math.PI / 2; g.add(shield);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.009, 6, 16), mat('#ff7ab8', { roughness: 0.35 })); ring.position.z = 0.03; g.add(ring);
  const nip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), mat('#ffe2b8', { roughness: 0.4 })); nip.position.z = -0.025; g.add(nip);
  return g;
}
export function makeDiaper() {
  const g = new THREE.Group();
  const d = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), mat('#fbfbf8', { roughness: 0.9 })); d.scale.set(1.15, 0.85, 1); g.add(d);
  for (const s of [-1, 1]) { const pin = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat('#7fd0ff', { roughness: 0.3 })); pin.position.set(s * 0.95, 0.3, 0.35); g.add(pin); }
  return g;
}

// Gorrito con hélice (la brutality de Diego Suárez): userData.prop gira
export function makePropellerCap() {
  const g = new THREE.Group();
  ['#ff3b3b', '#ffd23a', '#2a7fff', '#3bd16f'].forEach((c, i) => {
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8, i * Math.PI / 2, Math.PI / 2, 0, Math.PI / 2), mat(c, { roughness: 0.5 })));
  });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.1, 6), mat('#c9cfd6', { metalness: 0.8 })); stem.position.y = 0.17; g.add(stem);
  const prop = new THREE.Group(); prop.position.y = 0.22; g.add(prop);
  for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.05), mat(s > 0 ? '#ff3b3b' : '#2a7fff', { roughness: 0.4 })); b.position.x = s * 0.1; b.rotation.x = s * 0.25; prop.add(b); }
  g.userData.prop = prop;
  return shadowed(g);
}
