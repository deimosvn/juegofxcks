import * as THREE from 'three';

// Escenario: templo de noche con antorchas. Todo procedural (sin archivos).
// Para usar un escenario propio en .glb, carga el archivo aquí y añádelo a la escena.

function stoneTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#3b3530'; g.fillRect(0, 0, 512, 512);
  const tile = 128;
  for (let y = 0; y < 512; y += tile) for (let x = 0; x < 512; x += tile) {
    const v = 45 + Math.random() * 25;
    g.fillStyle = `rgb(${v + 8},${v + 2},${v - 4})`;
    g.fillRect(x + 3, y + 3, tile - 6, tile - 6);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`;
      g.fillRect(x + Math.random() * tile, y + Math.random() * tile, 2 + Math.random() * 8, 2 + Math.random() * 8);
    }
  }
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2;
  for (let i = 0; i < 12; i++) { g.beginPath(); let x = Math.random() * 512, y = Math.random() * 512; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildArena(scene, effects) {
  scene.background = new THREE.Color('#0a0610');
  scene.fog = new THREE.Fog('#120a14', 14, 42);

  // Cielo con gradiente
  const sky = new THREE.Mesh(new THREE.SphereGeometry(80, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 a = vec3(0.02,0.01,0.04); vec3 b = vec3(0.35,0.07,0.06); gl_FragColor = vec4(mix(b, a, smoothstep(-0.05, 0.5, h)), 1.0); }',
  }));
  scene.add(sky);

  // Luna
  const moon = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.MeshBasicMaterial({ color: '#ffe9c4', fog: false }));
  moon.position.set(-14, 16, -50); scene.add(moon);
  const halo = new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.MeshBasicMaterial({ color: '#ff9a6a', transparent: true, opacity: 0.12, fog: false }));
  halo.position.set(-14, 16, -50.1); scene.add(halo);

  // Luces
  scene.add(new THREE.HemisphereLight('#8a7cff', '#2a1a10', 0.55));
  const key = new THREE.DirectionalLight('#ffd7b0', 1.6);
  key.position.set(4, 10, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -12, right: 12, top: 8, bottom: -2, near: 1, far: 30 });
  key.shadow.bias = -0.0005;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#5a7bff', 1.0);
  rim.position.set(-6, 5, -8); scene.add(rim);

  // Suelo
  const tex = stoneTexture(); tex.repeat.set(12, 6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  // Sello en el suelo
  const seal = new THREE.Mesh(new THREE.RingGeometry(2.6, 2.8, 64), new THREE.MeshBasicMaterial({ color: '#7a1010', transparent: true, opacity: 0.6 }));
  seal.rotation.x = -Math.PI / 2; seal.position.y = 0.01; scene.add(seal);
  const seal2 = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.5, 6), new THREE.MeshBasicMaterial({ color: '#7a1010', transparent: true, opacity: 0.5 }));
  seal2.rotation.x = -Math.PI / 2; seal2.position.y = 0.012; scene.add(seal2);

  // Columnas y muro del fondo
  const stone = new THREE.MeshStandardMaterial({ color: '#5a4e45', roughness: 0.9 });
  const darkStone = new THREE.MeshStandardMaterial({ color: '#2c2420', roughness: 0.95 });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(60, 9, 1), darkStone);
  wall.position.set(0, 4.5, -9); wall.receiveShadow = true; scene.add(wall);
  for (let i = -5; i <= 5; i++) {
    const col = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 7, 12), stone);
    shaft.position.y = 3.5; shaft.castShadow = true; shaft.receiveShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 1.4), stone); cap.position.y = 7.1;
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 1.4), stone); base.position.y = 0.2;
    col.add(shaft, cap, base);
    col.position.set(i * 4.2, 0, -7);
    if (Math.abs(i) === 3) col.rotation.z = (Math.random() - 0.5) * 0.05;
    scene.add(col);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(48, 0.9, 1.8), stone);
  lintel.position.set(0, 7.7, -7); scene.add(lintel);

  // Estatuas / braseros a los lados
  const torches = [];
  for (const x of [-8.4, -2.1, 2.1, 8.4]) {
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 2.2, 8), new THREE.MeshStandardMaterial({ color: '#222', metalness: 0.6, roughness: 0.4 }));
    stand.position.set(x, 1.1, -5.6); stand.castShadow = true; scene.add(stand);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.2, 0.3, 12), new THREE.MeshStandardMaterial({ color: '#3a2a1a', metalness: 0.7, roughness: 0.4 }));
    bowl.position.set(x, 2.3, -5.6); scene.add(bowl);
    const light = new THREE.PointLight('#ff7a2a', 18, 9, 1.6);
    light.position.set(x, 2.9, -5.4); scene.add(light);
    torches.push({ pos: new THREE.Vector3(x, 2.45, -5.6), light });
  }

  // Polvo flotante
  const motes = [];
  return {
    update(t) {
      for (const tr of torches) {
        tr.light.intensity = 16 + Math.sin(t * 13 + tr.pos.x) * 3 + Math.random() * 3;
        effects.glow.emit({ pos: tr.pos, count: 2, speed: 1.2, dir: [0, 1, 0], spread: 0.25, jitter: 0.25, color: '#ffd27a', colorEnd: '#ff2a00', life: 0.55, size: 0.35, drag: 1 });
      }
      if (Math.random() < 0.3) effects.glow.emit({ pos: new THREE.Vector3((Math.random() - 0.5) * 24, 0.2, -3 + Math.random() * 3), count: 1, speed: 0.4, dir: [0.3, 1, 0], spread: 0.4, color: '#ff8a4a', colorEnd: '#000000', life: 3, size: 0.06, drag: 0.1 });
    },
    motes,
  };
}
