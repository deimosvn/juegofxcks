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
