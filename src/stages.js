import * as THREE from 'three';

// =====================================================================
//  ESCENARIOS — todo se construye con figuras y texturas dibujadas en
//  canvas (sin archivos). Los peleadores pelean sobre la línea z = 0;
//  lo que está detrás va en z negativa. La cámara mira desde z positiva.
// =====================================================================

// ------------------------------------------------------------- utilidades
function tex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, ...o });
const basic = (o) => new THREE.MeshBasicMaterial(o);
function mesh(geo, mat, x = 0, y = 0, z = 0, parent = null, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
const box = (w, h, d, mat, x, y, z, p, s) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, p, s);
const cyl = (rt, rb, h, mat, x, y, z, p, seg = 16) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, p);
const rnd = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();

// Cartel de texto (plano con textura). w,h en metros.
function textPlane(text, { w = 2, h = 0.6, px = 512, font = 'Bebas Neue', weight = '900', color = '#fff', stroke = null, strokeW = 0, bg = null, italic = false, align = 'center', lines = null, lineH = 1.05, glow = null } = {}, parent, x = 0, y = 0, z = 0) {
  const ph = Math.round(px * h / w);
  const t = tex(px, ph, (g, W, H) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, W, H); }
    const L = lines || [text];
    const size = (H * 0.86) / (L.length * lineH);
    g.font = `${italic ? 'italic ' : ''}${weight} ${size}px "${font}", Impact, sans-serif`;
    g.textAlign = align; g.textBaseline = 'middle';
    L.forEach((ln, i) => {
      const yy = H / 2 + (i - (L.length - 1) / 2) * size * lineH;
      const xx = align === 'center' ? W / 2 : align === 'left' ? W * 0.04 : W * 0.96;
      if (glow) { g.shadowColor = glow; g.shadowBlur = size * 0.35; }
      if (stroke) { g.lineJoin = 'round'; g.strokeStyle = stroke; g.lineWidth = strokeW || size * 0.14; g.strokeText(ln, xx, yy); }
      g.fillStyle = color; g.fillText(ln, xx, yy);
      g.shadowBlur = 0;
    });
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, transparent: !bg, roughness: 0.7 }));
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}

function skyDome(top, bottom, parent) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, bottom: { value: new THREE.Color(bottom) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = normalize(vP).y; gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.02, 0.45, h)), 1.0); }',
  }));
  parent.add(m);
  return m;
}

function sun(parent, color, intensity, pos, area = 14) {
  const l = new THREE.DirectionalLight(color, intensity);
  l.position.set(...pos);
  l.castShadow = true;
  l.shadow.mapSize.set(2048, 2048);
  Object.assign(l.shadow.camera, { left: -area, right: area, top: 10, bottom: -6, near: 1, far: 60 });
  l.shadow.bias = -0.0004;
  parent.add(l);
  return l;
}

function ground(parent, draw, repeat, size = [80, 50], color = '#fff') {
  const t = tex(512, 512, draw, repeat);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), std({ map: t, color, roughness: 0.95 }));
  m.rotation.x = -Math.PI / 2; m.receiveShadow = true;
  parent.add(m);
  return m;
}

// Suelo de tierra/arena con piedritas y marcas de llantas
function dirt(base, dots, tracks = true) {
  return (g, W, H) => {
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) {
      const c = dots[i % dots.length];
      g.fillStyle = c; g.globalAlpha = 0.25 + rnd() * 0.5;
      const s = 1 + rnd() * 3; g.fillRect(rnd() * W, rnd() * H, s, s);
    }
    g.globalAlpha = 0.12;
    for (let i = 0; i < 30; i++) { g.fillStyle = rnd() < 0.5 ? '#000' : '#fff'; g.beginPath(); g.ellipse(rnd() * W, rnd() * H, 20 + rnd() * 60, 10 + rnd() * 30, rnd() * 3, 0, 7); g.fill(); }
    if (tracks) {
      g.globalAlpha = 0.18; g.strokeStyle = '#3a2a18'; g.lineWidth = 9; g.setLineDash([6, 5]);
      for (const off of [0.3, 0.42]) { g.beginPath(); g.moveTo(0, H * off); g.bezierCurveTo(W * 0.3, H * (off + 0.08), W * 0.7, H * (off - 0.06), W, H * off); g.stroke(); }
      g.setLineDash([]);
    }
    g.globalAlpha = 1;
  };
}

// Malla ciclónica (textura con transparencia)
function chainLink(color = '#b9bec4') {
  return tex(256, 256, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    g.strokeStyle = color; g.lineWidth = 3;
    const s = 32;
    for (let i = -W; i < W * 2; i += s) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke();
      g.beginPath(); g.moveTo(i, H); g.lineTo(i + H, 0); g.stroke();
    }
  });
}
function fence(parent, x0, x1, z, h, { color = '#b9bec4', post = '#8e959c', rotY = 0 } = {}) {
  const len = Math.abs(x1 - x0);
  const t = chainLink(color); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(len / 1.2, h / 1.2);
  const g = new THREE.Group();
  const net = new THREE.Mesh(new THREE.PlaneGeometry(len, h), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5 }));
  net.position.set(0, h / 2, 0); net.castShadow = true; g.add(net);
  const pm = std({ color: post, metalness: 0.6, roughness: 0.45 });
  for (let i = 0; i <= Math.ceil(len / 2.5); i++) cyl(0.04, 0.04, h + 0.1, pm, -len / 2 + Math.min(len, i * 2.5), (h + 0.1) / 2, 0, g, 8);
  cyl(0.03, 0.03, len, pm, 0, h, 0, g, 6).rotation.z = Math.PI / 2;
  g.position.set((x0 + x1) / 2, 0, z); g.rotation.y = rotY;
  parent.add(g);
  return g;
}

function tree(parent, x, z, { h = 3, crown = '#4f7a2f', blobs = 4, r = 1.1 } = {}) {
  const g = new THREE.Group();
  cyl(0.12, 0.2, h, std({ color: '#5a4030' }), 0, h / 2, 0, g, 8);
  const cm = std({ color: crown, roughness: 0.9, flatShading: true });
  for (let i = 0; i < blobs; i++) {
    const b = mesh(new THREE.IcosahedronGeometry(r * (0.7 + rnd() * 0.5), 0), cm, (rnd() - 0.5) * r * 1.6, h + (rnd() - 0.2) * r, (rnd() - 0.5) * r, g);
    b.rotation.set(rnd() * 3, rnd() * 3, 0);
  }
  g.position.set(x, 0, z);
  parent.add(g);
  return g;
}

function bush(parent, x, z, color = '#5d7f34', s = 0.8) {
  const m = mesh(new THREE.IcosahedronGeometry(s, 0), std({ color, flatShading: true }), x, s * 0.6, z, parent);
  m.scale.y = 0.75; m.rotation.y = rnd() * 3;
  return m;
}

// Cables de luz con curva
function wire(parent, a, b, sag = 0.6, color = '#111') {
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    pts.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(Math.PI * t) * sag, a[2] + (b[2] - a[2]) * t));
  }
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color }));
  parent.add(l);
  return l;
}

// Lámina acanalada (para fachadas y techos)
function corrugated(base, line, repeat, vertical = true) {
  return tex(256, 256, (g, W, H) => {
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 16; i++) {
      const p = i * (vertical ? W : H) / 16;
      const grd = vertical ? g.createLinearGradient(p, 0, p + W / 16, 0) : g.createLinearGradient(0, p, 0, p + H / 16);
      grd.addColorStop(0, 'rgba(255,255,255,0.18)'); grd.addColorStop(0.5, 'rgba(0,0,0,0)'); grd.addColorStop(1, line);
      g.fillStyle = grd;
      if (vertical) g.fillRect(p, 0, W / 16, H); else g.fillRect(0, p, W, H / 16);
    }
  }, repeat);
}

// Todo lo que no se mueve y comparte material se junta en una sola malla: así el escenario
// se dibuja con pocas llamadas aunque tenga cientos de piezas. Lo que se anima va en un
// grupo con userData.vivo (ese grupo se puede juntar por dentro llamando batchStatic(grupo)).
function matKey(m) {
  if (Array.isArray(m) || m.transparent || !(m.isMeshStandardMaterial || m.isMeshBasicMaterial)) return null;
  return [m.type, m.color.getHex(), m.emissive?.getHex(), m.emissiveIntensity, m.roughness, m.metalness, m.map?.uuid, m.side, m.flatShading, m.alphaTest, m.fog].join('|');
}
function batchStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), rel = new THREE.Matrix4();
  const buckets = new Map();
  const walk = (o, top) => {
    if (!top && o.userData.vivo) return;
    let key = null;
    if (o.isMesh && !o.isInstancedMesh && o.matrixWorld.determinant() > 0) {
      const k = matKey(o.material);
      if (k) key = `${k}|${o.castShadow}|${o.receiveShadow}`;
    } else if (o.isLine && !o.isLineSegments && o.material.isLineBasicMaterial) key = 'cable|' + o.material.color.getHex();
    if (key) { if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(o); }
    for (const c of o.children) walk(c, false);
  };
  walk(root, true);
  const v = new THREE.Vector3();
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    if (list[0].isLine) { // los cables: todos en una sola malla de segmentos
      const seg = [];
      for (const o of list) {
        rel.multiplyMatrices(inv, o.matrixWorld);
        const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count - 1; i++) for (const j of [i, i + 1]) { v.fromBufferAttribute(p, j).applyMatrix4(rel); seg.push(v.x, v.y, v.z); }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
      root.add(new THREE.LineSegments(g, list[0].material));
      for (const o of list) { o.removeFromParent(); o.geometry.dispose(); }
      continue;
    }
    const geos = list.map((o) => (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld)));
    const n = geos.reduce((s, g) => s + g.attributes.position.count, 0);
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let k = 0;
    for (const g of geos) {
      const a = g.attributes;
      pos.set(a.position.array, k * 3);
      if (a.normal) nor.set(a.normal.array, k * 3);
      if (a.uv) uv.set(a.uv.array, k * 2);
      k += a.position.count; g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const m = new THREE.Mesh(geo, list[0].material);
    m.castShadow = list[0].castShadow; m.receiveShadow = list[0].receiveShadow;
    root.add(m);
    for (const o of list) { o.removeFromParent(); o.geometry.dispose(); }
  }
  return root;
}

// =====================================================================
//  Piezas para dar vida a los lados y al fondo
// =====================================================================
// Cerros a lo lejos: la neblina los pinta del color del cielo
function cerros(parent, color, z, { w = 220, h = 14, n = 56, seed = 0 } = {}) {
  const pos = [], hs = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    hs.push(h * (0.3 + 0.7 * Math.abs(Math.sin(t * 9.3 + seed) * Math.sin(t * 4.1 + seed * 2.3))) * (0.75 + rnd() * 0.25));
  }
  for (let i = 0; i < n; i++) {
    const x0 = -w / 2 + i * w / n, x1 = x0 + w / n, b0 = z - 3 - rnd() * 4, b1 = z - 3 - rnd() * 4;
    pos.push(x0, 0, z, x1, 0, z, x1, hs[i + 1], b1, x0, 0, z, x1, hs[i + 1], b1, x0, hs[i], b0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  g.computeVertexNormals();
  return mesh(g, std({ color, flatShading: true, roughness: 1 }), 0, 0, 0, parent, false);
}

// Nubes en un anillo alrededor de todo: el anillo gira despacito
function nubes(parent, vida, n = 9, y = 26, r = 78) {
  const ring = new THREE.Group(); ring.userData.vivo = true; parent.add(ring);
  const w = basic({ color: '#ffffff', fog: false }), s = basic({ color: '#e3ecf7', fog: false });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.4, c = new THREE.Group();
    c.position.set(Math.cos(a) * r, y + rnd() * 9, Math.sin(a) * r); c.rotation.y = -a + Math.PI / 2; ring.add(c);
    const k = 3 + Math.floor(rnd() * 3);
    for (let j = 0; j < k; j++) {
      const sz = 2.4 + rnd() * 2.8;
      const b = mesh(new THREE.IcosahedronGeometry(sz, 1), j === 0 ? s : w, (j - (k - 1) / 2) * sz * 0.95, (j === 0 ? -0.6 : rnd() * 1.4), rnd() * 2, c, false);
      b.scale.y = 0.5; b.receiveShadow = false;
    }
  }
  batchStatic(ring);
  vida.push((t) => { ring.rotation.y = t * 0.006; });
  return ring;
}

// Casa de block: azotea con pretil, tinaco negro, varillas, antena de Sky, ventanas con protección y puerta
function casa(parent, x, z, { w = 6, h = 2.8, d = 5, color = '#e9e1d3', trim = '#b8afa0', pisos = 1, rot = 0, noche = false, tinaco = true, varillas = false, antena = false, puerta = '#6b4a35' } = {}) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; parent.add(g);
  const H = h * pisos, front = d / 2 + 0.01;
  box(w, H, d, std({ color, roughness: 0.95 }), 0, H / 2, 0, g);
  const tm = std({ color: trim, roughness: 0.95 });
  box(w + 0.12, 0.38, d + 0.12, tm, 0, H + 0.1, 0, g);
  box(w + 0.04, 0.3, d + 0.04, tm, 0, 0.15, 0, g);
  const dark = std({ color: '#1d2630', roughness: 0.25, metalness: 0.3 });
  const lit = std({ color: '#3a3020', emissive: '#ffc977', emissiveIntensity: 1.1 });
  const bar = std({ color: '#202020', metalness: 0.5, roughness: 0.5 });
  const nw = Math.max(1, Math.floor(w / 2.6));
  for (let p = 0; p < pisos; p++) {
    for (let i = 0; i < nw; i++) {
      const wx = -w / 2 + (i + 0.5) * w / nw + (p === 0 ? w / nw * 0.18 : 0);
      if (p === 0 && i === 0) { box(0.95, 2.05, 0.08, std({ color: puerta, roughness: 0.6, metalness: 0.2 }), wx - 0.4, 1.03, front, g); continue; }
      const on = noche && rnd() < 0.55;
      box(1.15, 1.0, 0.06, on ? lit : dark, wx, p * h + 1.55, front, g, false);
      for (let k = 0; k < 5; k++) box(0.03, 1.05, 0.04, bar, wx - 0.5 + k * 0.25, p * h + 1.55, front + 0.04, g, false);
      box(1.3, 0.08, 0.16, tm, wx, p * h + 1.0, front + 0.05, g, false);
    }
  }
  if (tinaco) {
    const tk = std({ color: '#1b1c1e', roughness: 0.6 });
    cyl(0.55, 0.5, 1.1, tk, w / 2 - 0.9, H + 0.85, -d / 2 + 0.9, g, 14);
    cyl(0.3, 0.45, 0.18, tk, w / 2 - 0.9, H + 1.48, -d / 2 + 0.9, g, 14);
  }
  if (varillas) for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) cyl(0.012, 0.012, 0.9 + rnd() * 0.5, std({ color: '#5a3e2b', metalness: 0.4 }), sx * (w / 2 - 0.12) + (k % 2) * 0.1 * -sx, H + 0.6, front - 0.12 - Math.floor(k / 2) * 0.1, g, 4);
  if (antena) {
    const dm = std({ color: '#e8e8e4', roughness: 0.5, side: THREE.DoubleSide });
    const dish = mesh(new THREE.SphereGeometry(0.38, 12, 6, 0, Math.PI * 2, 0, 0.9), dm, -w / 2 + 0.8, H + 0.9, front - 0.6, g);
    dish.rotation.x = 1.25; dish.rotation.z = 0.3;
    cyl(0.03, 0.03, 0.7, dm, -w / 2 + 0.8, H + 0.55, front - 0.75, g, 6);
  }
  return g;
}

// Poste de luz (concreto o madera) con cruceta y aisladores; regresa el punto de donde salen los cables.
// rot: la cruceta queda de través a los cables (0 = cables a lo largo de x)
function posteLuz(parent, x, z, h = 8, { color = '#bdbab3', rot = 0, trafo = false } = {}) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; parent.add(g);
  cyl(0.12, 0.18, h, std({ color, roughness: 0.95 }), 0, h / 2, 0, g, 8);
  box(0.12, 0.12, 1.7, std({ color: '#6e6256' }), 0, h - 0.45, 0, g);
  for (const dz of [-0.75, 0, 0.75]) cyl(0.035, 0.05, 0.16, std({ color: '#d5e3dc', roughness: 0.3 }), 0, h - 0.3, dz, g, 6);
  if (trafo) { cyl(0.3, 0.3, 0.8, std({ color: '#8d959b', metalness: 0.5, roughness: 0.5 }), 0.36, h - 1.6, 0, g, 12); box(0.12, 0.12, 0.12, std({ color: '#555' }), 0.2, h - 1.2, 0, g); }
  return [x, h - 0.25, z];
}
function cableado(parent, puntos, sag = 0.5) {
  for (let i = 0; i < puntos.length - 1; i++) {
    const a = puntos[i], b = puntos[i + 1], L = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
    const px = -(b[2] - a[2]) / L * 0.75, pz = (b[0] - a[0]) / L * 0.75;
    for (const s of [-1, 1]) wire(parent, [a[0] + px * s, a[1], a[2] + pz * s], [b[0] + px * s, b[1], b[2] + pz * s], sag);
  }
}

// Carro viejo de barrio: sedán o troca (perfil extruido), con llantas, vidrios y faros. El frente va hacia x negativa.
function carro(parent, x, z, { color = '#b8322c', tipo = 'sedan', rot = 0, noche = false } = {}) {
  const car = new THREE.Group(); car.position.set(x, 0, z); car.rotation.y = rot; parent.add(car);
  const paint = std({ color, metalness: 0.3, roughness: 0.42 });
  const glass = std({ color: '#121820', metalness: 0.5, roughness: 0.12, side: THREE.DoubleSide });
  const dark = std({ color: '#161616', roughness: 0.75 });
  const chrome = std({ color: '#c9ced3', metalness: 0.9, roughness: 0.25 });
  const troca = tipo === 'troca', W = troca ? 1.86 : 1.7;
  const P = troca
    ? [[-2.6, 0.4], [-2.62, 1.02], [-1.55, 1.1], [-1.1, 1.78], [0.2, 1.78], [0.28, 1.1], [2.55, 1.1], [2.6, 0.4]]
    : [[-2.25, 0.36], [-2.28, 0.86], [-1.25, 0.96], [-0.72, 1.42], [0.85, 1.42], [1.42, 0.98], [2.25, 0.92], [2.28, 0.36]];
  const s = new THREE.Shape(); s.moveTo(...P[0]); for (const p of P.slice(1)) s.lineTo(...p); s.closePath();
  mesh(new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 }), paint, 0, 0, -W / 2, car);
  // ventanas de los lados, parabrisas y medallón
  const Q = troca ? [[-1.48, 1.14], [-1.07, 1.71], [0.13, 1.71], [0.19, 1.14]] : [[-1.17, 0.99], [-0.7, 1.37], [0.82, 1.37], [1.32, 1.0]];
  const win = new THREE.Shape(); win.moveTo(...Q[0]); for (const q of Q.slice(1)) win.lineTo(...q); win.closePath();
  for (const zz of [-1, 1]) mesh(new THREE.ShapeGeometry(win), glass, 0, 0, zz * (W / 2 + 0.05), car, false);
  const panel = (p, q) => {
    const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy);
    const b = box(L * 0.9, 0.025, W - 0.16, glass, (p[0] + q[0]) / 2 - dy / L * 0.055, (p[1] + q[1]) / 2 + dx / L * 0.055, 0, car, false);
    b.rotation.z = Math.atan2(dy, dx);
  };
  panel(P[2], P[3]); panel(P[4], P[5]);
  if (troca) box(2.1, 0.02, W - 0.22, dark, 1.42, 1.13, 0, car, false);   // la caja abierta
  // llantas, defensas y faros
  const R = troca ? 0.4 : 0.34;
  for (const xx of troca ? [-1.75, 1.7] : [-1.42, 1.42]) for (const zz of [-1, 1]) {
    cyl(R, R, 0.26, dark, xx, R, zz * (W / 2 - 0.08), car, 14).rotation.x = Math.PI / 2;
    cyl(R * 0.55, R * 0.55, 0.28, chrome, xx, R, zz * (W / 2 - 0.07), car, 8).rotation.x = Math.PI / 2;
  }
  const fx = Math.min(P[0][0], P[1][0]) - 0.07, bx = Math.max(P[6][0], P[7][0]) + 0.07;
  box(0.1, 0.13, W + 0.12, chrome, fx, P[0][1] + 0.06, 0, car, false);
  box(0.1, 0.13, W + 0.12, chrome, bx, P[7][1] + 0.06, 0, car, false);
  const head = noche ? std({ color: '#fffbe6', emissive: '#fff2c0', emissiveIntensity: 1.5 }) : std({ color: '#f4f1e0', roughness: 0.2, metalness: 0.3 });
  const tail = std({ color: '#b3140f', emissive: '#ff1a0a', emissiveIntensity: noche ? 0.8 : 0.12 });
  for (const zz of [-1, 1]) {
    box(0.05, 0.14, 0.3, head, fx + 0.03, P[1][1] - 0.18, zz * (W / 2 - 0.3), car, false);
    box(0.05, 0.16, 0.22, tail, bx - 0.03, P[6][1] - 0.18, zz * (W / 2 - 0.22), car, false);
  }
  return car;
}

// Papel picado: tiras de banderitas que se mecen con el aire (una malla instanciada por tira).
// Regresa add(a, b, sag) para colgar tiras entre dos puntos.
const PAPEL = ['#e4007c', '#ff7a00', '#ffd400', '#00a651', '#00aeef', '#7b3fe4', '#ff2a2a'];
function papelPicado(parent, vida) {
  const map = tex(64, 80, (g, W, H) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H - 8);
    for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(i * 8, H - 8); g.lineTo(i * 8 + 4, H); g.lineTo(i * 8 + 8, H - 8); g.fill(); }
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; g.moveTo(32 + Math.cos(a) * 13, 38 + Math.sin(a) * 13); g.ellipse(32 + Math.cos(a) * 8, 38 + Math.sin(a) * 8, 5, 2.6, a, 0, 7); } g.fill();
    for (const [x, y] of [[11, 13], [53, 13], [11, 62], [53, 62], [32, 12], [32, 64]]) { g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 4, y); g.lineTo(x, y + 5); g.lineTo(x - 4, y); g.fill(); }
    g.globalCompositeOperation = 'source-over';
  });
  const mat = new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 });
  const geo = new THREE.PlaneGeometry(0.32, 0.4).translate(0, -0.2, 0);
  const tiras = [], q = new THREE.Quaternion(), e = new THREE.Euler(), m4 = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
  const pose = (s, time) => {
    s.pts.forEach((p, i) => { e.set(Math.sin(time * 2.3 + i * 0.9 + s.rotY * 3) * 0.32, s.rotY, 0, 'YXZ'); s.im.setMatrixAt(i, m4.compose(p, q.setFromEuler(e), one)); });
    s.im.instanceMatrix.needsUpdate = true;
  };
  vida.push((t) => { for (const s of tiras) pose(s, t); });
  return (a, b, sag = 0.35) => {
    const n = Math.max(3, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.42));
    const im = new THREE.InstancedMesh(geo, mat, n); im.userData.vivo = true; im.castShadow = true; im.frustumCulled = false;
    const s = { im, pts: [], rotY: Math.atan2(-(b[2] - a[2]), b[0] - a[0]) };
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      s.pts.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(Math.PI * t) * sag, a[2] + (b[2] - a[2]) * t));
      im.setColorAt(i, new THREE.Color(PAPEL[(i + tiras.length * 3) % PAPEL.length]));
    }
    parent.add(im); wire(parent, a, b, sag, '#e9e4da');
    tiras.push(s); pose(s, 0);
  };
}

// Perro echado de los que cuidan la cuadra: mueve la cola de vez en cuando
function perro(parent, vida, x, z, rot = 0, color = '#c79a62') {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; parent.add(g);
  const fur = std({ color, roughness: 1, flatShading: true }), dark = std({ color: '#2a1d14', roughness: 0.8 });
  mesh(new THREE.CapsuleGeometry(0.16, 0.42, 3, 8), fur, 0, 0.16, 0, g).rotation.z = Math.PI / 2;
  mesh(new THREE.SphereGeometry(0.15, 8, 6), fur, 0.22, 0.14, 0.09, g).scale.set(1.15, 0.8, 0.9);
  for (const s of [-1, 1]) box(0.3, 0.07, 0.08, fur, -0.42, 0.04, s * 0.08, g);
  const head = new THREE.Group(); head.position.set(-0.43, 0.19, 0); head.rotation.z = -0.12; g.add(head);
  box(0.22, 0.18, 0.21, fur, 0, 0, 0, head);
  box(0.15, 0.09, 0.12, fur, -0.16, -0.04, 0, head);
  box(0.04, 0.045, 0.06, dark, -0.245, -0.02, 0, head);
  for (const s of [-1, 1]) {
    box(0.07, 0.13, 0.03, dark, 0.03, 0.04, s * 0.115, head).rotation.x = s * 0.35;
    box(0.05, 0.012, 0.02, dark, -0.07, 0.04, s * 0.106, head);   // ojos cerrados
  }
  const tail = new THREE.Group(); tail.userData.vivo = true; tail.position.set(0.4, 0.17, 0); g.add(tail);
  cyl(0.022, 0.04, 0.32, fur, 0.15, 0, 0, tail, 6).rotation.z = Math.PI / 2 + 0.3;
  vida.push((t) => { tail.rotation.y = Math.sin(t * 10) * (Math.sin(t * 0.6) > 0.3 ? 0.55 : 0.08); });
  return g;
}

// Llantas apiladas (acostadas) o paradas
function llantas(parent, x, z, n = 4, paradas = false, rot = 0) {
  const m = std({ color: '#1a1a1a', roughness: 0.9 });
  for (let i = 0; i < n; i++) {
    const t = mesh(new THREE.TorusGeometry(0.3, 0.11, 6, 14), m, x + (rnd() - 0.5) * 0.06, paradas ? 0.41 : 0.11 + i * 0.22, z + (rnd() - 0.5) * 0.06, parent);
    if (paradas) { t.position.x += Math.cos(rot) * i * 0.24; t.position.z -= Math.sin(rot) * i * 0.24; t.rotation.y = rot + Math.PI / 2; t.rotation.x = 0.12; }
    else t.rotation.x = Math.PI / 2;
  }
}

function cactus(parent, x, z, h = 2.4) {
  const m = std({ color: '#55803d', roughness: 0.85, flatShading: true });
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rnd() * 6; parent.add(g);
  cyl(0.17, 0.2, h, m, 0, h / 2, 0, g, 8); mesh(new THREE.SphereGeometry(0.17, 8, 5), m, 0, h, 0, g);
  for (const s of [-1, 1]) {
    const y = h * (0.35 + rnd() * 0.25), up = h * (0.22 + rnd() * 0.2);
    cyl(0.11, 0.11, 0.45, m, s * 0.3, y, 0, g, 7).rotation.z = Math.PI / 2;
    cyl(0.11, 0.12, up, m, s * 0.5, y + up / 2, 0, g, 7);
    mesh(new THREE.SphereGeometry(0.11, 7, 5), m, s * 0.5, y + up, 0, g);
  }
  return g;
}

function palma(parent, x, z, h = 7) {
  const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
  cyl(0.15, 0.24, h, std({ color: '#8b7458', roughness: 1 }), 0, h / 2, 0, g, 9);
  cyl(0.42, 0.2, 1.3, std({ color: '#7a6040', roughness: 1, flatShading: true }), 0, h - 0.55, 0, g, 9);
  const leaf = std({ color: '#3f6f2e', roughness: 0.9, side: THREE.DoubleSide, flatShading: true });
  for (let i = 0; i < 12; i++) {
    const f = new THREE.Group(); f.position.set(0, h, 0); f.rotation.set(0, i / 12 * Math.PI * 2 + rnd() * 0.3, -0.25 - rnd() * 0.55); g.add(f);
    box(1.8, 0.03, 0.46, leaf, 0.85, 0, 0, f).rotation.x = (rnd() - 0.5) * 0.6;
  }
  return g;
}

// Zopilotes dando vueltas allá arriba
function zopilotes(parent, vida, cx, cz, n = 3) {
  const m = std({ color: '#141210', roughness: 1, side: THREE.DoubleSide });
  const birds = [];
  for (let i = 0; i < n; i++) {
    const b = new THREE.Group(); b.userData.vivo = true; parent.add(b);
    box(0.18, 0.12, 0.55, m, 0, 0, 0, b, false);
    const w = [-1, 1].map((s) => { const wing = new THREE.Group(); b.add(wing); box(0.95, 0.03, 0.34, m, s * 0.47, 0, 0.02, wing, false); return wing; });
    birds.push({ b, w, r: 6 + i * 3, y: 18 + i * 2.5, ph: i * 2.1, sp: 0.16 + i * 0.035 });
  }
  vida.push((t) => {
    for (const k of birds) {
      const a = t * k.sp + k.ph;
      k.b.position.set(cx + Math.cos(a) * k.r, k.y + Math.sin(t * 0.5 + k.ph) * 0.6, cz + Math.sin(a) * k.r);
      k.b.rotation.set(0, -a, 0.28);
      const flap = Math.sin(t * 0.9 + k.ph) > 0.85 ? Math.sin(t * 9) * 0.35 : 0;
      k.w[0].rotation.z = -0.15 + flap; k.w[1].rotation.z = 0.15 - flap;
    }
  });
}

// Rodadora (bola de ramas secas) que cruza de vez en cuando
function rodadora(parent, vida, z, { x0 = -34, x1 = 34, periodo = 27, ph = 0 } = {}) {
  const g = new THREE.Group(); g.userData.vivo = true; parent.add(g);
  const ball = new THREE.Group(); g.add(ball);
  const m = std({ color: '#9c7b4c', roughness: 1 });
  for (let i = 0; i < 8; i++) mesh(new THREE.TorusGeometry(0.4 + rnd() * 0.1, 0.02, 4, 16), m, 0, 0, 0, ball).rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
  batchStatic(ball);
  vida.push((t) => {
    const x = x0 + (x1 - x0) * (((t + ph) % periodo) / periodo);
    g.position.set(x, 0.48 + Math.abs(Math.sin(t * 3.1)) * 0.35, z + Math.sin(t * 0.8) * 0.6);
    ball.rotation.z = -(x - x0) / 0.48;
  });
}

// Piedritas, matitas secas y corcholatas regadas por el suelo (todo bajito: no tapa a nadie)
function suelto(parent, { x0 = -18, x1 = 18, z0 = -3, z1 = 7, piedras = 40, matas = 24, corcholatas = 0, piedra = '#9c8e7a', mata = '#a08a4a' } = {}) {
  const pm = std({ color: piedra, roughness: 1, flatShading: true }), mm = std({ color: mata, roughness: 1, flatShading: true });
  const cm = std({ color: '#c9ccd1', metalness: 0.7, roughness: 0.35 });
  // nada justo en la línea donde pelean
  const at = () => { let x, z; do { x = x0 + rnd() * (x1 - x0); z = z0 + rnd() * (z1 - z0); } while (Math.abs(z) < 1.2 && Math.abs(x) < 10.5); return [x, z]; };
  for (let i = 0; i < piedras; i++) {
    const s = 0.04 + rnd() * 0.08, [x, z] = at();
    const p = mesh(new THREE.DodecahedronGeometry(s, 0), pm, x, s * 0.3, z, parent, false); p.scale.y = 0.6; p.rotation.set(rnd() * 3, rnd() * 3, 0);
  }
  for (let i = 0; i < matas; i++) {
    let [x, z] = at();
    if (z > 2.5) z = z0 + rnd() * Math.max(0, -1.3 - z0);   // las matitas no cerca de la cámara (de cerca parecen espinas)
    for (let k = 0; k < 6; k++) { const h = 0.1 + rnd() * 0.14; mesh(new THREE.ConeGeometry(0.016, h, 3), mm, x + (rnd() - 0.5) * 0.16, h / 2, z + (rnd() - 0.5) * 0.16, parent, false).rotation.set((rnd() - 0.5) * 0.9, 0, (rnd() - 0.5) * 0.9); }
  }
  for (let i = 0; i < corcholatas; i++) { const [x, z] = at(); mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 8), cm, x, 0.006, z, parent, false); }
}

function maguey(parent, x, z, s = 1) {
  const m = std({ color: '#6f9a7a', roughness: 0.8, flatShading: true });
  for (let i = 0; i < 11; i++) {
    const leaf = new THREE.Group(); leaf.position.set(x, 0, z); leaf.rotation.set(0, i / 11 * Math.PI * 2 + rnd() * 0.3, 0.45 + rnd() * 0.55); parent.add(leaf);
    mesh(new THREE.ConeGeometry(0.09 * s, 1.1 * s, 4), m, 0, 0.5 * s, 0, leaf);
  }
}

// Silla de plástico (de las de fiesta)
function silla(parent, x, z, rot = 0, color = '#c8171d') {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; parent.add(g);
  const m = std({ color, roughness: 0.45 });
  box(0.46, 0.05, 0.44, m, 0, 0.45, 0, g); box(0.46, 0.42, 0.05, m, 0, 0.7, -0.21, g).rotation.x = -0.12;
  for (const dx of [-0.2, 0.2]) for (const dz of [-0.18, 0.18]) box(0.04, 0.45, 0.04, m, dx, 0.22, dz, g);
  return g;
}

// Papalote (molino de viento para sacar agua): la rueda gira
function papalote(parent, vida, x, z, h = 8) {
  const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
  const steel = std({ color: '#8d9399', metalness: 0.6, roughness: 0.5 });
  const a = Math.atan2(0.85, h);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = cyl(0.04, 0.05, h * 1.01, steel, sx * 0.58, h / 2, sz * 0.58, g, 5);
    leg.rotation.set(-sz * a, 0, sx * a);
  }
  for (const y of [1.6, 3.4, 5.2, 6.8]) {
    const w = 1.0 - 0.85 * (y / h);
    for (const s of [-1, 1]) { box(w * 2, 0.04, 0.04, steel, 0, y, s * w, g, false); box(0.04, 0.04, w * 2, steel, s * w, y, 0, g, false); }
  }
  box(0.5, 0.08, 0.5, steel, 0, h, 0, g);
  box(0.06, 0.06, 1.6, steel, 0, h + 0.25, -0.5, g);
  box(0.04, 0.7, 1.2, std({ color: '#c8171d', roughness: 0.6 }), 0, h + 0.35, -1.3, g);
  const rotor = new THREE.Group(); rotor.userData.vivo = true; rotor.position.set(0, h + 0.25, 0.42); g.add(rotor);
  const blade = std({ color: '#b9bfc5', metalness: 0.5, roughness: 0.45, side: THREE.DoubleSide });
  mesh(new THREE.TorusGeometry(1.1, 0.025, 4, 24), steel, 0, 0, 0, rotor, false);
  cyl(0.12, 0.12, 0.2, steel, 0, 0, 0, rotor, 8).rotation.x = Math.PI / 2;
  for (let i = 0; i < 14; i++) {
    const b = new THREE.Group(); b.rotation.z = i / 14 * Math.PI * 2; rotor.add(b);
    box(0.95, 0.2, 0.02, blade, 0.62, 0, 0, b, false).rotation.x = 0.5;
  }
  batchStatic(rotor);
  vida.push((t) => { rotor.rotation.z = -t * 1.6; });
  return g;
}

// Caballo de rancho: pasta (baja la cabeza a comer) y mueve la cola
function caballo(parent, vida, x, z, rot = 0, color = '#6b4226') {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; parent.add(g);
  const hide = std({ color, roughness: 0.85, flatShading: true }), dark = std({ color: '#1e1410', roughness: 0.9, flatShading: true });
  const body = mesh(new THREE.CapsuleGeometry(0.36, 1.0, 4, 10), hide, 0, 1.28, 0, g); body.rotation.z = Math.PI / 2; body.scale.set(1, 1, 0.82);
  mesh(new THREE.SphereGeometry(0.33, 8, 6), hide, 0.52, 1.18, 0, g).scale.set(1, 1.05, 0.95);   // anca
  mesh(new THREE.SphereGeometry(0.32, 8, 6), hide, -0.55, 1.22, 0, g).scale.set(1, 1.1, 0.9);   // pecho
  for (const [lx, hind] of [[-0.55, false], [0.55, true]]) for (const s of [-1, 1]) {
    if (hind) mesh(new THREE.SphereGeometry(0.17, 7, 5), hide, lx, 1.0, s * 0.16, g).scale.set(1, 1.6, 0.8);
    cyl(0.075, 0.055, 1.0, hide, lx, 0.55, s * 0.17, g, 6);
    cyl(0.07, 0.08, 0.1, dark, lx, 0.05, s * 0.17, g, 6);
  }
  // cuello y cabeza giran juntos desde la base del cuello
  const neck = new THREE.Group(); neck.userData.vivo = true; neck.position.set(-0.72, 1.35, 0); g.add(neck);
  cyl(0.14, 0.24, 1.0, hide, -0.25, 0.43, 0, neck, 7).rotation.z = 0.53;
  box(0.08, 0.9, 0.06, dark, -0.15, 0.49, 0, neck).rotation.z = 0.53;
  box(0.62, 0.25, 0.22, hide, -0.72, 0.86, 0, neck).rotation.z = 0.85;
  box(0.16, 0.17, 0.2, dark, -0.95, 0.6, 0, neck).rotation.z = 0.85;
  for (const s of [-1, 1]) mesh(new THREE.ConeGeometry(0.04, 0.14, 4), hide, -0.55, 1.15, s * 0.07, neck);
  batchStatic(neck);
  const tail = new THREE.Group(); tail.userData.vivo = true; tail.position.set(0.88, 1.42, 0); g.add(tail);
  mesh(new THREE.ConeGeometry(0.1, 0.85, 6), dark, 0.12, -0.38, 0, tail).rotation.z = Math.PI + 0.3;
  const ph = rnd() * 9;
  vida.push((t) => {
    const k = (t + ph) % 14, graze = k < 6 ? 0 : k < 7 ? (k - 6) : k < 12 ? 1 : 1 - (k - 12) / 2;
    neck.rotation.z = graze * 1.25 + Math.sin(t * 1.3 + ph) * 0.03;
    tail.rotation.x = Math.sin(t * 1.9 + ph) * 0.35;
  });
  return g;
}

// Corral de palos con dos travesaños
function corral(parent, x0, x1, z0, z1) {
  const m = std({ color: '#7a5c3e', roughness: 1 });
  const side = (ax, az, bx, bz) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 2.2)), ang = Math.atan2(-(bz - az), bx - ax);
    for (let i = 0; i <= n; i++) cyl(0.07, 0.08, 1.45, m, ax + (bx - ax) * i / n, 0.72, az + (bz - az) * i / n, parent, 6);
    for (const y of [0.6, 1.15]) box(L, 0.09, 0.06, m, (ax + bx) / 2, y, (az + bz) / 2, parent).rotation.y = ang;
  };
  side(x0, z0, x1, z0); side(x0, z1, x1, z1); side(x0, z0, x0, z1); side(x1, z0, x1, z1);
}

// De noche: un letrero que brilla solo (sin luces de verdad: lo prende el bloom)
function brilla(m, k = 1) { m.material.emissive.set('#ffffff'); m.material.emissiveMap = m.material.map; m.material.emissiveIntensity = k; return m; }
// Charco de luz en el piso (bordes suaves) debajo de focos y anuncios
function luzPiso(parent, x, z, r, color, opacity = 0.22, y = 0.012, rz = r) {
  const map = tex(64, 64, (g, W, H) => { const gr = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); });
  const m = mesh(new THREE.PlaneGeometry(r * 2, rz * 2), basic({ map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }), x, y, z, parent, false);
  m.rotation.x = -Math.PI / 2; m.receiveShadow = false;
  return m;
}
// Barra de un punto a otro (torres, refuerzos)
function vara(parent, a, b, r, mat, seg = 5) {
  const A = new THREE.Vector3(...a), d = new THREE.Vector3(...b).sub(A);
  const m = mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), mat, A.x + d.x / 2, A.y + d.y / 2, A.z + d.z / 2, parent);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}
// Gato negro sentado en la barda: ojos que brillan (y parpadean) y cola que se mueve
function gato(parent, vida, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const fur = std({ color: '#1a1a1c', roughness: 0.9, flatShading: true });
  mesh(new THREE.SphereGeometry(0.16, 8, 6), fur, 0, 0.17, 0, g).scale.set(0.85, 1.2, 0.8);
  mesh(new THREE.SphereGeometry(0.105, 8, 6), fur, 0, 0.42, 0.04, g);
  for (const s of [-1, 1]) mesh(new THREE.ConeGeometry(0.035, 0.09, 4), fur, s * 0.055, 0.53, 0.03, g);
  const ojos = new THREE.Group(); ojos.userData.vivo = true; g.add(ojos);
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.026, 6, 4), basic({ color: '#c6ff4a' }), s * 0.042, 0.43, 0.13, ojos, false);
  const tail = new THREE.Group(); tail.userData.vivo = true; tail.position.set(0.1, 0.06, 0.08); g.add(tail);
  cyl(0.02, 0.026, 0.4, fur, 0, -0.2, 0, tail, 5);
  vida.push((t) => { ojos.visible = (t % 4.3) > 0.18; tail.rotation.z = Math.sin(t * 1.4) * 0.35; });
  return g;
}
// =====================================================================
function six(root, env) {
  env.background = '#6fb8ff'; env.fog = ['#cfe6ff', 35, 95];
  skyDome('#1f78e6', '#cfe9ff', root);
  root.add(new THREE.HemisphereLight('#d9eeff', '#b39a72', 1.1));
  sun(root, '#fff2d9', 2.8, [7, 15, 10]);
  ground(root, dirt('#cdb48c', ['#a88f68', '#e3d1ad', '#8d7656', '#f1e4c8']), [10, 6]);

  const white = std({ color: '#f1f1ee', roughness: 0.85 });
  const red = std({ map: corrugated('#c8171d', 'rgba(60,0,0,0.45)', [6, 1]), roughness: 0.55, metalness: 0.15 });
  const black = std({ color: '#141414' });
  // banqueta de concreto
  box(9.4, 0.14, 2.8, std({ color: '#c9c6bf', roughness: 0.9 }), 0.4, 0.07, -5.2, root);

  // cuerpo de la tienda
  box(7.4, 3.8, 6, white, 0, 1.9, -9.2, root);
  // marco rojo en forma de C con franja negra
  box(8.2, 1.7, 0.4, red, 0, 4.75, -6.05, root);
  box(0.95, 5.6, 0.4, red, -3.62, 2.8, -6.05, root);
  box(0.95, 5.6, 0.4, red, 3.62, 2.8, -6.05, root);
  box(6.3, 0.2, 0.42, black, 0, 3.86, -6.04, root);
  box(0.2, 3.85, 0.42, black, -3.05, 1.93, -6.04, root);
  box(0.2, 3.85, 0.42, black, 3.05, 1.93, -6.04, root);
  // pared blanca alrededor de la entrada
  box(5.9, 0.75, 0.3, white, 0, 3.38, -6.1, root);
  box(0.4, 3.0, 0.3, white, -2.75, 1.5, -6.1, root);
  box(0.4, 3.0, 0.3, white, 2.75, 1.5, -6.1, root);
  textPlane('CRUZ DE PIEDRA', { w: 2.8, h: 0.42, color: '#1b1b1b', font: 'Rubik', weight: '700' }, root, 0.25, 3.36, -5.94);

  // interior (oscuro) con mostrador, refrigeradores y anaqueles
  box(5.1, 3.0, 0.1, std({ color: '#8a1f1f' }), 0, 1.5, -8.6, root);
  box(5.1, 0.1, 2.6, std({ color: '#222' }), 0, 3.0, -7.3, root, false);
  box(5.0, 1.05, 0.7, std({ color: '#d7d7d2' }), 0, 0.52, -6.75, root);
  box(5.0, 0.08, 0.8, std({ color: '#9aa0a6', metalness: 0.5, roughness: 0.4 }), 0, 1.08, -6.75, root);
  const fridge = std({ color: '#e8f4ff', emissive: '#a8d4ff', emissiveIntensity: 0.55 });
  box(1.4, 2.3, 0.4, fridge, 1.7, 1.25, -8.35, root);
  const bottleCols = ['#c0392b', '#f39c12', '#27ae60', '#2980b9', '#f1c40f', '#8e44ad', '#e67e22'];
  for (let r = 0; r < 4; r++) for (let i = 0; i < 9; i++) {
    cyl(0.05, 0.05, 0.28, std({ color: bottleCols[(i + r * 3) % bottleCols.length], roughness: 0.3 }), -2.1 + i * 0.32, 1.25 + r * 0.42, -8.4, root, 6);
  }
  const shelf = std({ color: '#5b4635' });
  for (let r = 0; r < 4; r++) box(3.2, 0.05, 0.35, shelf, -0.7, 1.1 + r * 0.42, -8.4, root);
  const inside = new THREE.PointLight('#fff7e0', 6, 6); inside.position.set(0, 2.6, -7.2); root.add(inside);
  // máquina de recargas
  box(0.9, 1.25, 0.45, white, 1.55, 0.62, -6.15, root);
  textPlane('', { w: 0.82, h: 0.6, lines: ['RECARGAS', 'SIN CARGO'], color: '#1b1b1b', bg: '#ffffff', font: 'Rubik', weight: '700' }, root, 1.55, 0.85, -5.91);

  // letreros arriba: TECATE, SIX y águilas
  textPlane('SIX', { w: 2.9, h: 1.25, color: '#ffffff', stroke: '#5a0a0a', strokeW: 26, italic: true, font: 'Rubik', weight: '900', glow: '#000' }, root, 0.35, 4.78, -5.83);
  textPlane('TECATE', { w: 1.9, h: 0.6, color: '#ffffff', stroke: '#111', strokeW: 14, font: 'Rubik', weight: '900', italic: true }, root, -2.3, 4.58, -5.83);
  const shield = tex(128, 160, (g, W, H) => {
    g.fillStyle = '#f4f4f4'; g.beginPath(); g.moveTo(8, 8); g.lineTo(W - 8, 8); g.lineTo(W - 8, H * 0.65); g.quadraticCurveTo(W / 2, H, 8, H * 0.65); g.closePath(); g.fill();
    g.strokeStyle = '#999'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#1a1a1a'; g.beginPath(); // águila simplificada
    g.moveTo(W / 2, 30); g.lineTo(W / 2 + 34, 58); g.lineTo(W / 2 + 18, 62); g.lineTo(W / 2 + 26, 100); g.lineTo(W / 2, 86); g.lineTo(W / 2 - 26, 100); g.lineTo(W / 2 - 18, 62); g.lineTo(W / 2 - 34, 58); g.closePath(); g.fill();
  });
  for (const x of [-3.55, 3.55]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.78), std({ map: shield, transparent: true }));
    s.position.set(x, 4.62, -5.83); root.add(s);
  }

  // poste de concreto con letrero SIX, cartel de hamburguesas y capillita
  const pole = std({ color: '#bdbab3', roughness: 0.95 });
  cyl(0.17, 0.22, 9, pole, 5.7, 4.5, -4.3, root, 12);
  box(2.0, 0.78, 0.22, std({ color: '#f5f5f5' }), 5.7, 6.3, -4.05, root);
  textPlane('SIX', { w: 1.8, h: 0.68, color: '#d21a1f', stroke: '#5a0a0a', strokeW: 10, italic: true, font: 'Rubik', weight: '900' }, root, 5.7, 6.3, -3.93);
  textPlane('', { w: 0.62, h: 0.84, bg: '#c8ff3a', color: '#1c1c1c', font: 'Comic Sans MS', weight: '700', lines: ['Se venden', 'hamburguesas', 'en casa de', 'Doña Beny', 'sáb y dom'] }, root, 5.7, 2.35, -4.1);
  const shrineM = std({ color: '#efefea' });
  box(0.85, 0.75, 0.75, shrineM, 4.95, 0.38, -3.4, root);
  const roof = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.75, 16, 1, false, 0, Math.PI), shrineM, 4.95, 0.75, -3.4, root);
  roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 2;
  box(0.4, 0.4, 0.05, std({ color: '#3a2a1a', emissive: '#a86b2a', emissiveIntensity: 0.4 }), 4.95, 0.32, -3.02, root);
  wire(root, [5.7, 8.7, -4.3], [-16, 8.4, -14], 1.2);
  wire(root, [5.7, 8.7, -4.3], [18, 8.2, -3], 0.9);
  wire(root, [5.7, 8.3, -4.3], [0, 4.6, -7], 0.4);

  // exhibidor rojo de refrescos, hielera negra y tambo blanco
  const cocaRed = std({ color: '#d0141b' });
  box(0.6, 1.7, 0.38, cocaRed, 3.7, 0.85, -4.75, root);
  textPlane('Coca-Cola', { w: 0.58, h: 0.2, color: '#ffffff', bg: '#d0141b', font: 'Brush Script MT', weight: '700', italic: true }, root, 3.7, 1.62, -4.55);
  const ads = ['#ff6a00', '#ffd23a', '#3fb6ff'];
  ads.forEach((c, i) => box(0.52, 0.42, 0.05, std({ color: c, emissive: c, emissiveIntensity: 0.15 }), 3.7, 1.25 - i * 0.45, -4.54, root));
  box(1.7, 0.95, 0.95, std({ color: '#1f2224', roughness: 0.6 }), -4.65, 0.48, -5.05, root);
  box(1.75, 0.08, 1.0, std({ color: '#2a2e31', roughness: 0.6 }), -4.65, 0.98, -5.05, root);
  cyl(0.33, 0.33, 0.98, std({ color: '#f2f2ef', roughness: 0.5 }), 3.15, 0.49, -5.25, root);

  // cercas, árboles y casitas al fondo
  fence(root, -16, 16, -13.5, 2.1);
  fence(root, -4.5, 4.5, 0, 2.1, { rotY: Math.PI / 2 }).position.set(8.8, 0, -9);
  fence(root, -4.5, 4.5, 0, 2.1, { rotY: Math.PI / 2 }).position.set(-9.5, 0, -9);
  tree(root, -9.5, -12.5, { h: 2.6 }); tree(root, -11.8, -13.0, { h: 3.2, crown: '#6b8f3a' }); tree(root, 11, -11.5, { h: 3.4, crown: '#c7471f', r: 1.3 });
  tree(root, 10.9, -7.4, { h: 2.8, crown: '#5c7f30' });
  for (let i = 0; i < 7; i++) bush(root, -9 + rnd() * 3, -6 - rnd() * 6, '#6b8a3a', 0.5 + rnd() * 0.5);
  const vida = [];

  // la tienda: hielera de HIELO, murales en los costados y tambo de basura
  box(1.15, 0.9, 0.72, std({ color: '#f4f6f8', roughness: 0.4 }), -2.65, 0.59, -5.4, root);
  box(1.17, 0.07, 0.74, std({ color: '#dfe5ea', roughness: 0.4 }), -2.65, 1.07, -5.4, root);
  textPlane('HIELO', { w: 0.95, h: 0.42, bg: '#1e88e5', color: '#ffffff', font: 'Rubik', weight: '900' }, root, -2.65, 0.68, -5.03);
  const muralL = textPlane('', { w: 5.6, h: 3.0, bg: '#c8171d', color: '#ffffff', stroke: '#5a0a0a', strokeW: 10, font: 'Rubik', weight: '900', italic: true, lines: ['CERVEZA', 'BIEN FRÍA'] }, root, -3.72, 1.95, -9.2);
  muralL.rotation.y = -Math.PI / 2;
  const sixR = textPlane('SIX', { w: 3.2, h: 1.3, color: '#d21a1f', stroke: '#5a0a0a', strokeW: 18, italic: true, font: 'Rubik', weight: '900' }, root, 3.72, 2.45, -9.2);
  sixR.rotation.y = Math.PI / 2;
  const subR = textPlane('HIELO · BOTANAS · RECARGAS', { w: 5.0, h: 0.42, color: '#1b1b1b', font: 'Rubik', weight: '700' }, root, 3.72, 1.35, -9.2);
  subR.rotation.y = Math.PI / 2;
  box(0.04, 0.42, 6.0, red, 3.72, 0.3, -9.2, root);
  cyl(0.3, 0.3, 0.9, std({ color: '#2e7d32', roughness: 0.5 }), 7.3, 0.45, -4.6, root);
  cyl(0.32, 0.32, 0.06, std({ color: '#1b5e20' }), 7.3, 0.92, -4.6, root);
  perro(root, vida, -6.8, -4.3, 0.5);

  // izquierda: la llantera con sus pilas de llantas y una troca vieja
  casa(root, -14.4, -9.4, { w: 6.6, h: 3.0, d: 5, color: '#7fc4b4', trim: '#4f8f80', antena: true, varillas: true, puerta: '#3b4a52' });
  textPlane('', { w: 3.4, h: 0.62, bg: '#ffd23a', color: '#1b1b1b', font: 'Rubik', weight: '900', lines: ['LLANTERA', 'SE PARCHAN · SE VENDEN'] }, root, -14.0, 2.6, -6.86);
  llantas(root, -11.5, -6.1, 5); llantas(root, -12.3, -6.3, 3); llantas(root, -17.3, -6.2, 4);
  llantas(root, -15.1, -6.0, 3, true, 0.1);
  carro(root, -13.7, -3.4, { tipo: 'troca', color: '#a8322b', rot: Math.PI - 0.06 });
  cactus(root, -19.4, -9.2, 3.1); cactus(root, -18.4, -12.8, 2.4); cactus(root, 17.6, -13.0, 2.7);
  // la cruz de piedra en su lomita, detrás de la cerca
  const piedra = std({ map: tex(128, 128, (g, W, H) => {
    g.fillStyle = '#a49c90'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(60,50,40,0.5)'; g.lineWidth = 3;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) g.strokeRect(c * 64 + (r % 2) * 32, r * 32, 64, 32);
    for (let i = 0; i < 300; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)'; g.fillRect(rnd() * W, rnd() * H, 3, 3); }
  }), roughness: 1 });
  mesh(new THREE.SphereGeometry(2.6, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: '#b39b78', roughness: 1, flatShading: true }), -17.5, 0, -16.8, root).scale.y = 0.35;
  box(0.5, 3.6, 0.5, piedra, -17.5, 2.6, -16.8, root);
  box(2.0, 0.48, 0.48, piedra, -17.5, 3.4, -16.8, root);
  for (let i = 0; i < 5; i++) box(0.12, 0.2, 0.12, std({ color: PAPEL[i], emissive: PAPEL[i], emissiveIntensity: 0.2 }), -18.1 + i * 0.3, 0.95, -16.25, root);

  // derecha: carrito de dogos con sombrilla, casa amarilla con un sedán enfrente y palmas
  const inox = std({ color: '#c7ccd0', metalness: 0.8, roughness: 0.3 });
  const dog = new THREE.Group(); dog.position.set(11.4, 0, -4.4); root.add(dog);
  box(1.9, 0.95, 0.85, inox, 0, 0.76, 0, dog);
  box(2.0, 0.05, 0.95, inox, 0, 1.26, 0, dog);
  box(1.2, 0.42, 0.5, std({ color: '#a9d6e5', roughness: 0.08, metalness: 0.2 }), 0.2, 1.5, -0.1, dog);
  ['#d62828', '#f4f1de', '#2a9d8f', '#f2cc8f', '#6a994e'].forEach((c, i) => box(0.16, 0.06, 0.16, std({ color: c }), -0.75 + i * 0.2, 1.32, 0.3, dog));
  cyl(0.05, 0.05, 0.22, std({ color: '#d62828' }), 0.85, 1.4, 0.32, dog, 8); cyl(0.05, 0.05, 0.22, std({ color: '#ffcc00' }), 0.72, 1.4, 0.32, dog, 8);
  for (const s of [-1, 1]) cyl(0.28, 0.28, 0.08, std({ color: '#222' }), 0.7, 0.28, s * 0.47, dog, 14).rotation.x = Math.PI / 2;
  box(0.06, 0.3, 0.06, inox, -0.85, 0.15, 0.35, dog); box(0.06, 0.3, 0.06, inox, -0.85, 0.15, -0.35, dog);
  textPlane('', { w: 1.6, h: 0.52, bg: '#ffd23a', color: '#c8171d', font: 'Rubik', weight: '900', lines: ['DOGOS', 'EL GÜERO'] }, dog, 0, 0.78, 0.435);
  cyl(0.03, 0.03, 1.8, inox, 0, 2.1, 0, dog, 6);
  const stripes = tex(256, 32, (g, W, H) => { const cs = ['#e63946', '#ffd23a', '#1d7cf2', '#ffffff']; for (let i = 0; i < 8; i++) { g.fillStyle = cs[i % 4]; g.fillRect(i * W / 8, 0, W / 8, H); } });
  mesh(new THREE.ConeGeometry(1.55, 0.55, 8, 1, true), std({ map: stripes, side: THREE.DoubleSide, roughness: 0.7 }), 0, 3.0, 0, dog);
  for (const [x, z] of [[-0.6, 0.9], [0.3, 1.0], [1.15, 0.85]]) {
    cyl(0.17, 0.2, 0.42, std({ color: '#d62828', roughness: 0.5 }), x, 0.21, z, dog, 10);
  }
  casa(root, 15.7, -10.4, { w: 6.4, h: 2.9, d: 5, color: '#f2cf63', trim: '#c9a43f', varillas: true });
  carro(root, 15.9, -6.2, { color: '#e9ecef', rot: 0.04 });
  cactus(root, 13.9, -4.5, 2.2);
  palma(root, 14.6, -15.2, 8.5); palma(root, -13.2, -15.6, 7.6);

  // atrás: postes con sus cables, casas del barrio, cerros, nubes, zopilotes y una rodadora
  const p1 = posteLuz(root, -16, -14, 8.65), p2 = posteLuz(root, 18, -3, 8.45);
  const linea = [-32, -20, -8, 4, 16, 28].map((x) => posteLuz(root, x, -16.2, 8));
  cableado(root, linea, 0.45);
  wire(root, p1, linea[1], 0.25); wire(root, p2, linea[4], 0.5);
  const cols = ['#e9e1d3', '#d9c7a8', '#f2efe7', '#c9d7c9', '#f0b8a0', '#a8c8e8', '#e8d27a', '#cfa0c8'];
  for (let i = 0; i < 9; i++) {
    const w = 5 + rnd() * 2.5;
    casa(root, -34 + i * 8.5 + rnd() * 1.5, -21.5 - rnd() * 4, { w, h: 2.7 + rnd() * 0.4, d: 5, pisos: rnd() < 0.3 ? 2 : 1, color: cols[i % cols.length], trim: '#9c9488', antena: rnd() < 0.4, varillas: rnd() < 0.4, tinaco: rnd() < 0.8 });
  }
  cerros(root, '#6f5a44', -46, { h: 13, seed: 1 });
  cerros(root, '#6c7f9c', -66, { h: 22, seed: 4 });
  nubes(root, vida, 9, 20);
  zopilotes(root, vida, -4, -26, 3);
  rodadora(root, vida, -15.1);
  suelto(root, { x0: -22, x1: 22, z0: -3.5, z1: 8, piedras: 45, matas: 28, corcholatas: 30, piedra: '#a8977c', mata: '#a99556' });
  return { update(t) { for (const f of vida) f(t); } };
}

// =====================================================================
//  LA CABAÑA (de la Progreso) — de día
// =====================================================================
function planks(base, opts = {}) {
  return tex(512, 512, (g, W, H) => {
    const n = opts.n || 12;
    for (let i = 0; i < n; i++) {
      const c = new THREE.Color(base).offsetHSL(0, 0, (rnd() - 0.5) * 0.08);
      g.fillStyle = `#${c.getHexString()}`;
      if (opts.vertical) g.fillRect(i * W / n, 0, W / n, H); else g.fillRect(0, i * H / n, W, H / n);
      g.fillStyle = 'rgba(0,0,0,0.45)';
      if (opts.vertical) g.fillRect(i * W / n, 0, 3, H); else g.fillRect(0, i * H / n, W, 3);
      g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1;
      for (let k = 0; k < 8; k++) { // vetas
        g.beginPath();
        if (opts.vertical) { const x = i * W / n + rnd() * W / n; g.moveTo(x, 0); g.bezierCurveTo(x + 6, H * 0.3, x - 6, H * 0.6, x + 3, H); }
        else { const y = i * H / n + rnd() * H / n; g.moveTo(0, y); g.bezierCurveTo(W * 0.3, y + 4, W * 0.6, y - 4, W, y + 2); }
        g.stroke();
      }
    }
    for (let k = 0; k < 40; k++) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(rnd() * W, rnd() * H, 2 + rnd() * 2, 0, 7); g.fill(); }
  }, opts.repeat);
}

function horseshoe(parent, x, y, z, s = 1, rot = 0) {
  const m = mesh(new THREE.TorusGeometry(0.11 * s, 0.022 * s, 6, 16, Math.PI * 1.45), std({ color: '#6b6f72', metalness: 0.8, roughness: 0.4 }), x, y, z, parent);
  m.rotation.z = -Math.PI * 0.225 + Math.PI + rot;
  return m;
}

function cabana(root, env) {
  env.background = '#5aa6ff'; env.fog = ['#d2e7ff', 35, 95];
  skyDome('#1765d8', '#cfe6ff', root);
  root.add(new THREE.HemisphereLight('#dcecff', '#a08a68', 1.0));
  sun(root, '#fff0d6', 2.9, [9, 13, 7]);
  ground(root, dirt('#c4ad8a', ['#9d8a6c', '#e2d3b8', '#7f6c52', '#b9a789'], false), [10, 6]);

  // cabaña de madera oscura con techo a dos aguas
  const wood = std({ map: planks('#3d3833', { repeat: [2, 1.2] }), roughness: 0.95 });
  const cabin = new THREE.Group(); cabin.position.set(0, 0, -10.5); root.add(cabin);
  box(9, 3.6, 5, wood, 0, 1.8, 0, cabin);
  const gable = new THREE.Shape(); gable.moveTo(-4.5, 0); gable.lineTo(4.5, 0); gable.lineTo(0, 1.9); gable.closePath();
  const gm = mesh(new THREE.ExtrudeGeometry(gable, { depth: 0.12, bevelEnabled: false }), wood, 0, 3.6, 2.4, cabin);
  gm.castShadow = true;
  const roofM = std({ color: '#2b2622', roughness: 0.9 });
  for (const s of [-1, 1]) {
    const r = box(5.4, 0.14, 5.6, roofM, s * 2.25, 4.55, 0, cabin);
    r.rotation.z = -s * Math.atan2(1.9, 4.5);
  }
  // puerta abierta con sombrero, interior oscuro y banquito rojo
  box(1.35, 2.5, 0.2, std({ color: '#0b0908' }), 0.5, 1.25, 2.45, cabin, false);
  box(0.42, 0.42, 0.42, std({ color: '#c0161c' }), 0.5, 0.22, 2.2, cabin);
  const door = new THREE.Group(); door.position.set(-0.17, 0, 2.55); door.rotation.y = -1.25; cabin.add(door);
  box(1.3, 2.45, 0.08, std({ map: planks('#b48a5a', { vertical: true, n: 6 }) }), 0.65, 1.25, 0, door);
  const hat = new THREE.Group(); hat.position.set(0.65, 1.85, 0.08); hat.rotation.x = Math.PI / 2; door.add(hat);
  mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.02, 20), std({ color: '#c9a66b' }), 0, 0, 0, hat);
  mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.18, 16), std({ color: '#c9a66b' }), 0, 0.1, 0, hat);
  // ventanas con cortinas rojas
  const curtain = tex(128, 128, (g, W, H) => { for (let i = 0; i < 8; i++) { const grd = g.createLinearGradient(i * 16, 0, i * 16 + 16, 0); grd.addColorStop(0, '#7d0d12'); grd.addColorStop(0.5, '#d1242b'); grd.addColorStop(1, '#7d0d12'); g.fillStyle = grd; g.fillRect(i * 16, 0, 16, H); } });
  for (const x of [-2.6, 3.0]) {
    box(1.2, 1.25, 0.12, std({ color: '#5a4a3a' }), x, 1.85, 2.48, cabin);
    box(1.0, 1.05, 0.05, std({ map: curtain, emissive: '#3a0306', emissiveIntensity: 0.3 }), x, 1.85, 2.55, cabin);
  }
  // letrero
  textPlane('', { w: 2.0, h: 1.25, bg: '#5a3426', color: '#f3e7d6', font: 'Georgia', weight: '700', italic: true, lines: ['La Cabaña', 'de la', 'Progreso'] }, cabin, 0, 4.3, 2.56);
  // adornos: herraduras, serrucho, aros, plato, letrero de no fumar y foquitos
  horseshoe(cabin, -1.8, 3.1, 2.56); horseshoe(cabin, 1.9, 3.15, 2.56, 1.1); horseshoe(cabin, -3.6, 2.9, 2.56, 0.9);
  box(0.9, 0.18, 0.02, std({ color: '#7d8287', metalness: 0.8, roughness: 0.35 }), 1.6, 2.65, 2.58, cabin).rotation.z = -0.5;
  mesh(new THREE.TorusGeometry(0.2, 0.015, 6, 24), std({ color: '#6e5a45', metalness: 0.5 }), -1.3, 2.4, 2.58, cabin);
  mesh(new THREE.CircleGeometry(0.2, 20), std({ color: '#b9bec4', metalness: 0.8, roughness: 0.3 }), 1.55, 1.7, 2.58, cabin);
  textPlane('', { w: 0.4, h: 0.28, bg: '#ffffff', color: '#d0141b', font: 'Rubik', weight: '700', lines: ['🚭'] }, cabin, 1.2, 2.05, 2.58);
  const bulbM = std({ color: '#fff3c0', emissive: '#ffd27a', emissiveIntensity: 1.2 });
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    mesh(new THREE.SphereGeometry(0.035, 6, 4), bulbM, -4 + t * 8, 3.3 - Math.sin(Math.PI * t) * 0.35, 2.6, cabin, false);
  }
  // porche: sillas de madera y banca blanca
  const chairM = std({ color: '#6b5440' });
  for (const x of [-3.9, -3.1]) {
    box(0.55, 0.06, 0.5, chairM, x, 0.5, 3.2, cabin); box(0.55, 0.6, 0.06, chairM, x, 0.8, 2.95, cabin);
    for (const dx of [-0.24, 0.24]) for (const dz of [-0.2, 0.2]) box(0.05, 0.5, 0.05, chairM, x + dx, 0.25, 3.2 + dz, cabin);
  }
  const benchM = std({ color: '#f2f2ef' });
  for (let i = 0; i < 5; i++) box(1.5, 0.05, 0.1, benchM, 3.4, 0.48, 3.0 + i * 0.12, cabin);
  for (let i = 0; i < 5; i++) box(1.5, 0.08, 0.04, benchM, 3.4, 0.6 + i * 0.12, 2.92, cabin);
  for (const dx of [-0.65, 0.65]) box(0.08, 0.48, 0.55, benchM, 3.4 + dx, 0.24, 3.2, cabin);

  // arco de entrada "BIENVENIDOS" con puertas de madera abiertas
  const post = std({ map: planks('#9a7a55', { vertical: true, n: 3 }), roughness: 0.95 });
  for (const s of [-1, 1]) cyl(0.24, 0.27, 4.6, post, s * 4.7, 2.3, -3.6, root, 10);
  box(11, 0.75, 0.48, std({ map: planks('#3a2c22', { repeat: [3, 1] }) }), 0, 4.4, -3.6, root);
  textPlane('BIENVENIDOS', { w: 7.6, h: 0.62, color: '#f6efe2', font: 'Rubik', weight: '700' }, root, 0, 4.4, -3.35);
  horseshoe(root, -4.9, 4.4, -3.34, 1.3); horseshoe(root, 4.6, 4.4, -3.34, 1.3, 0.4);
  const gateM = std({ map: planks('#c19c6b', { vertical: true, n: 8 }), roughness: 0.95 });
  for (const s of [-1, 1]) {
    const gate = new THREE.Group(); gate.position.set(s * 4.45, 0, -3.6); gate.rotation.y = s * 1.95; root.add(gate);
    box(1.9, 2.9, 0.08, gateM, -s * 0.95, 1.45, 0, gate);
  }
  // reja blanca de herrería (izquierda), malla blanca y celosía (derecha)
  const iron = tex(256, 256, (g, W, H) => {
    g.strokeStyle = '#f4f4f4'; g.lineWidth = 6;
    g.strokeRect(4, 4, W - 8, H - 8);
    for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(i * W / 6, 0); g.lineTo(i * W / 6, H); g.stroke(); }
    for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(i * W / 5 + W / 10, H * 0.62, 14, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(i * W / 5 + W / 10, H * 0.3, 10, Math.PI, 0); g.stroke(); }
  });
  const ironM = new THREE.MeshStandardMaterial({ map: iron, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
  mesh(new THREE.PlaneGeometry(3.4, 2.4), ironM, -7.4, 1.2, -3.9, root);
  fence(root, 5.6, 12, -3.6, 2.3, { color: '#f2f2f2', post: '#f2f2f2' });
  const lattice = tex(256, 256, (g, W, H) => { g.strokeStyle = '#d9b98f'; g.lineWidth = 10; for (let i = -W; i < W * 2; i += 40) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke(); g.beginPath(); g.moveTo(i, H); g.lineTo(i + H, 0); g.stroke(); } }, [3, 1]);
  mesh(new THREE.PlaneGeometry(6, 2.2), new THREE.MeshStandardMaterial({ map: lattice, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }), 8.4, 1.6, -6.2, root);

  // árbol seco que da sombra al suelo
  const dry = std({ color: '#6f5a46', roughness: 1 });
  const trunk = new THREE.Group(); trunk.position.set(9.5, 0, 2.5); root.add(trunk);
  cyl(0.12, 0.2, 3.2, dry, 0, 1.6, 0, trunk, 7);
  for (let i = 0; i < 7; i++) {
    const b = cyl(0.03, 0.07, 1.6 + rnd(), dry, 0, 2.4 + rnd() * 0.8, 0, trunk, 5);
    b.rotation.z = (rnd() - 0.5) * 2.2; b.rotation.x = (rnd() - 0.5) * 1.2;
    b.position.x = Math.sin(b.rotation.z) * -0.6; b.position.z = Math.sin(b.rotation.x) * 0.6;
  }
  tree(root, -12, -12, { h: 3.4, crown: '#58713a' }); tree(root, 13, -13, { h: 3.0, crown: '#6a8a40' });
  const vida = [];
  const paja = tex(128, 128, (g, W, H) => {
    g.fillStyle = '#c9a25a'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 420; i++) {
      g.strokeStyle = rnd() < 0.5 ? 'rgba(90,60,20,0.35)' : 'rgba(255,240,190,0.35)'; g.lineWidth = 1 + rnd();
      const x = rnd() * W, y = rnd() * H; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 6, y + 10 + rnd() * 14); g.stroke();
    }
  }, [3, 2]);
  const palo = std({ color: '#7a5c3e', roughness: 1 });

  // izquierda: palapa con mesa, sillas rojas y hielera
  const pal = new THREE.Group(); pal.position.set(-12.2, 0, -7.6); root.add(pal);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(0.1, 0.12, 2.7, palo, sx * 1.7, 1.35, sz * 1.7, pal, 7);
  mesh(new THREE.ConeGeometry(3.1, 1.7, 4, 1, true), std({ map: paja, side: THREE.DoubleSide, roughness: 1 }), 0, 3.4, 0, pal).rotation.y = Math.PI / 4;
  const mantel = tex(64, 64, (g) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#d62828' : '#f4f1de'; g.fillRect(i * 8, j * 8, 8, 8); } });
  box(1.8, 0.06, 0.9, std({ map: mantel, roughness: 0.8 }), 0, 0.76, 0, pal);
  for (const dx of [-0.8, 0.8]) for (const dz of [-0.38, 0.38]) box(0.05, 0.74, 0.05, palo, dx, 0.37, dz, pal);
  const ambar = std({ color: '#6b3a0e', roughness: 0.15 });
  for (let i = 0; i < 5; i++) cyl(0.035, 0.035, 0.24, ambar, -0.6 + i * 0.3, 0.91, (rnd() - 0.5) * 0.4, pal, 8);
  silla(pal, -0.5, 0.75, Math.PI); silla(pal, 0.5, 0.8, Math.PI + 0.2); silla(pal, -0.4, -0.78, 0.1); silla(pal, 0.55, -0.75, -0.15);
  cooler(pal, 1.3, 0.9, '#1565c0', '#e3f2fd', true, 0.3);
  // asador de tambo con carne y humo
  const asador = new THREE.Group(); asador.position.set(-9.4, 0, -4.9); root.add(asador);
  const negro = std({ color: '#1d1d1d', roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide });
  mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 14, 1, true, Math.PI, Math.PI), negro, 0, 0.85, 0, asador).rotation.z = Math.PI / 2;
  box(0.84, 0.06, 0.42, std({ color: '#3a1606', emissive: '#ff5a1a', emissiveIntensity: 1.6 }), 0, 0.64, 0, asador, false);
  for (let i = 0; i < 9; i++) box(0.02, 0.02, 0.56, std({ color: '#888', metalness: 0.8 }), -0.4 + i * 0.1, 0.86, 0, asador, false);
  for (const dx of [-0.38, 0.38]) for (const dz of [-0.2, 0.2]) box(0.04, 0.6, 0.04, negro, dx, 0.3, dz, asador);
  for (let i = 0; i < 4; i++) box(0.16, 0.03, 0.12, std({ color: '#5a2a14', roughness: 0.7 }), -0.3 + i * 0.2, 0.885, (rnd() - 0.5) * 0.15, asador, false);
  const humo = new THREE.Group(); humo.userData.vivo = true; humo.position.set(-9.4, 0.9, -4.9); root.add(humo);
  const puffs = [];
  for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), basic({ color: '#d8d2c8', transparent: true, opacity: 0, depthWrite: false })); humo.add(m); puffs.push(m); }
  vida.push((t) => puffs.forEach((m, i) => {
    const k = (t * 0.3 + i / puffs.length) % 1;
    m.position.set(Math.sin(t * 0.7 + i) * 0.15 + k * 0.7, k * 2.8, Math.cos(t * 0.5 + i) * 0.1);
    m.scale.setScalar(0.6 + k * 2.3);
    m.material.opacity = Math.min(1, k / 0.12) * (1 - k) * 0.45;
  }));
  // pacas, rueda de carreta, magueyes y las bocinas de la fiesta (laten con la cumbia)
  const paca = std({ map: paja, roughness: 1 });
  for (const [x, y, z, r] of [[-12.4, 0.27, -4.3, 0.1], [-13.5, 0.27, -4.45, -0.05], [-12.95, 0.81, -4.4, 0.03], [-15.9, 0.27, -4.8, 0.2]]) box(1.05, 0.54, 0.62, paca, x, y, z, root).rotation.y = r;
  const rueda = new THREE.Group(); rueda.position.set(-14.7, 0.6, -5.75); rueda.rotation.set(-0.15, 0.3, 0); root.add(rueda);
  mesh(new THREE.TorusGeometry(0.58, 0.05, 6, 20), palo, 0, 0, 0, rueda);
  cyl(0.09, 0.09, 0.14, palo, 0, 0, 0, rueda, 8).rotation.x = Math.PI / 2;
  for (let i = 0; i < 6; i++) box(0.035, 1.12, 0.035, palo, 0, 0, 0, rueda).rotation.z = i / 6 * Math.PI;
  maguey(root, 9.6, -12.8, 1.0); maguey(root, -8.6, -13.2, 1.2); maguey(root, -17.2, -9.4, 1.1);
  const bocina = (x, z, rot) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; root.add(g);
    const blk = std({ color: '#151515', roughness: 0.7 }), cono = std({ color: '#2b2b2b', roughness: 0.5 });
    for (const a of [0, 2.1, 4.2]) cyl(0.02, 0.02, 1.4, blk, Math.sin(a) * 0.25, 0.65, Math.cos(a) * 0.25, g, 5).rotation.set(-Math.cos(a) * 0.37, 0, Math.sin(a) * 0.37);
    cyl(0.025, 0.025, 0.5, blk, 0, 1.45, 0, g, 6);
    box(0.62, 1.0, 0.5, blk, 0, 2.15, 0, g);
    mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 20), std({ color: '#555', metalness: 0.6 }), 0, 1.98, 0.255, g, false);
    mesh(new THREE.CircleGeometry(0.07, 14), cono, 0, 2.47, 0.256, g, false);
    const w = mesh(new THREE.CircleGeometry(0.19, 20), cono, 0, 1.98, 0.257, g, false); w.userData.vivo = true;
    return w;
  };
  const woofers = [bocina(-5.7, -6.5, 0.35), bocina(5.1, -6.9, -0.35)];
  vida.push((t) => { const b = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 1.6)), 6); for (const w of woofers) w.scale.setScalar(1 + b * 0.14); });

  // derecha: troca dentro de la cerca, corral con dos caballos, pila de agua y papalote
  carro(root, 8.3, -4.95, { tipo: 'troca', color: '#3c5a7a' });
  corral(root, 10.4, 16.6, -7.3, -11.8);
  caballo(root, vida, 13.4, -9.4, 0.25);
  caballo(root, vida, 15.3, -10.7, -2.7, '#d9d2c5');
  box(1.6, 0.5, 0.6, palo, 11.7, 0.25, -10.9, root);
  box(1.45, 0.04, 0.47, std({ color: '#4f7f9a', roughness: 0.05, metalness: 0.3 }), 11.7, 0.47, -10.9, root, false);
  papalote(root, vida, 17.6, -13.4, 8);
  cyl(1.0, 1.0, 1.3, std({ color: '#9aa3aa', metalness: 0.6, roughness: 0.4 }), 19.4, 0.65, -12.6, root, 18);

  // papel picado: bajo el arco, hacia la cabaña y hacia los lados
  const papel = papelPicado(root, vida);
  papel([-4.6, 3.95, -3.75], [-4.35, 3.45, -7.75], 0.25);
  papel([4.6, 3.95, -3.75], [4.35, 3.45, -7.75], 0.25);
  cyl(0.07, 0.09, 3.7, palo, 11.8, 1.85, -6.6, root, 6);
  papel([4.75, 3.9, -3.5], [11.8, 3.6, -6.6], 0.5);
  papel([4.4, 3.45, -7.85], [11.8, 3.5, -6.65], 0.45);
  papel([-4.75, 3.9, -3.5], [-10.5, 2.75, -5.9], 0.45);
  papel([-4.4, 3.45, -7.85], [-10.5, 2.75, -9.3], 0.4);

  // al fondo: alambre de púas, postes de madera, mezquites, palmas, el tanque elevado, casitas y cerros
  for (let x = -26; x <= 26; x += 2.6) cyl(0.05, 0.06, 1.3, palo, x, 0.65, -15.2, root, 5);
  for (const y of [0.45, 0.8, 1.15]) for (let x = -26; x < 25; x += 2.6) wire(root, [x, y, -15.2], [x + 2.6, y, -15.2], 0.03, '#5b5650');
  cableado(root, [-26, -13, 0, 13, 26].map((x) => posteLuz(root, x, -17.6, 7.5, { color: '#6e5640' })), 0.4);
  for (const [x, z, r] of [[-20, -18.5, 1.2], [-7.5, -19.5, 1.4], [6.5, -20.5, 1.3], [21, -18, 1.1], [-16, -12.2, 1.0]]) tree(root, x, z, { h: 2.4, crown: '#7d8f3e', blobs: 5, r });
  palma(root, -6.4, -17.2, 7.5); palma(root, 9.2, -18.8, 8.2);
  const tq = new THREE.Group(); tq.position.set(-21, 0, -27); root.add(tq);
  const blanco = std({ color: '#e9ecef', roughness: 0.6 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(0.1, 0.12, 9.2, blanco, sx * 1.2, 4.6, sz * 1.2, tq, 6);
  for (const y of [3, 6]) for (const s of [-1, 1]) { box(2.4, 0.08, 0.08, blanco, 0, y, s * 1.2, tq, false); box(0.08, 0.08, 2.4, blanco, s * 1.2, y, 0, tq, false); }
  cyl(1.7, 1.7, 2.6, blanco, 0, 10.4, 0, tq, 20);
  cyl(1.72, 1.72, 0.4, std({ color: '#1f6fd1' }), 0, 9.6, 0, tq, 20);
  mesh(new THREE.ConeGeometry(1.8, 0.8, 20), blanco, 0, 12.1, 0, tq);
  textPlane('PROGRESO', { w: 2.4, h: 0.5, color: '#1f6fd1', font: 'Rubik', weight: '900' }, tq, 0, 10.7, 1.72);
  const cols = ['#e9e1d3', '#d9c7a8', '#f0b8a0', '#a8c8e8', '#e8d27a'];
  for (let i = 0; i < 6; i++) casa(root, -30 + i * 12 + rnd() * 3, -31 - rnd() * 3, { w: 5 + rnd() * 2, h: 2.6, color: cols[i % cols.length], trim: '#9c9488', tinaco: rnd() < 0.7 });
  cerros(root, '#7a6550', -46, { h: 12, seed: 2.5 });
  cerros(root, '#6c7f9c', -66, { h: 20, seed: 6 });
  nubes(root, vida, 8, 20);

  // en el suelo: herradura, reata enrollada, piedritas y matitas
  const hs = horseshoe(root, -2.6, 0.03, 3.2, 1.6); hs.rotation.x = -Math.PI / 2;
  const reata = std({ color: '#b08d5a', roughness: 1 });
  for (const [r, y] of [[0.28, 0.03], [0.22, 0.06]]) mesh(new THREE.TorusGeometry(r, 0.025, 5, 22), reata, 7.2, y, 2.6, root, false).rotation.x = -Math.PI / 2;
  suelto(root, { x0: -22, x1: 22, z0: -3, z1: 8, piedras: 40, matas: 30, piedra: '#9d8b70', mata: '#9a8a4a' });
  return { update(t) { for (const f of vida) f(t); } };
}

// =====================================================================
//  CASA CHUY — de noche, con un Camaro blanco y hieleras de cheve
// =====================================================================
// también lo usa el especial de Alan mientras carga su Camaro de verdad (sin la luz: no trabar el juego)
export function camaro(parent, x, z, facing = -1, light = true) {
  const car = new THREE.Group(); car.position.set(x, 0, z); car.rotation.y = facing < 0 ? 0 : Math.PI; parent.add(car);
  const paint = std({ color: '#f4f4f1', metalness: 0.35, roughness: 0.22 });
  const glass = std({ color: '#0d1117', metalness: 0.6, roughness: 0.08, side: THREE.DoubleSide });
  const black = std({ color: '#111', roughness: 0.6 });
  const chrome = std({ color: '#d8dde2', metalness: 1, roughness: 0.18 });
  // perfil del muscle car extruido a lo ancho
  const s = new THREE.Shape();
  s.moveTo(2.35, 0.32); s.lineTo(2.38, 0.82); s.lineTo(1.65, 0.92); s.lineTo(0.95, 1.3); s.lineTo(-0.1, 1.34);
  s.lineTo(-0.9, 0.97); s.lineTo(-2.05, 0.86); s.lineTo(-2.4, 0.68); s.lineTo(-2.36, 0.32); s.closePath();
  const body = mesh(new THREE.ExtrudeGeometry(s, { depth: 1.86, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 }), paint, 0, 0, -0.93, car);
  body.castShadow = true;
  // vidrios
  const win = new THREE.Shape();
  win.moveTo(1.55, 0.95); win.lineTo(0.92, 1.27); win.lineTo(-0.08, 1.31); win.lineTo(-0.8, 0.99); win.closePath();
  for (const zz of [-0.97, 0.97]) mesh(new THREE.ShapeGeometry(win), glass, 0, 0, zz, car, false);
  const ws = box(0.05, 0.45, 1.7, glass, -0.5, 1.14, 0, car, false); ws.rotation.z = 0.95;
  const rw = box(0.05, 0.42, 1.6, glass, 1.3, 1.11, 0, car, false); rw.rotation.z = -0.95;
  // franjas negras de carreras en el cofre y techo
  for (const zz of [-0.18, 0.18]) {
    const st = box(1.2, 0.012, 0.16, black, -1.45, 0.9, zz, car, false); st.rotation.z = 0.09;
    box(1.0, 0.012, 0.16, black, 0.4, 1.35, zz, car, false);
  }
  // llantas con rines cromados
  for (const xx of [-1.45, 1.45]) for (const zz of [-0.88, 0.88]) {
    const w = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 20), black, xx, 0.36, zz, car); w.rotation.x = Math.PI / 2;
    const r = mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.3, 10), chrome, xx, 0.36, zz * 1.02, car); r.rotation.x = Math.PI / 2;
  }
  // parrilla, faros y calaveras
  box(0.06, 0.25, 1.4, black, -2.4, 0.55, 0, car, false);
  const head = std({ color: '#fffbe6', emissive: '#fff2c0', emissiveIntensity: 1.6 });
  for (const zz of [-0.62, 0.62]) {
    mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 14), head, -2.42, 0.6, zz, car, false).rotation.z = Math.PI / 2;
    box(0.04, 0.12, 0.42, std({ color: '#ff2a1a', emissive: '#ff1a0a', emissiveIntensity: 1.2 }), 2.4, 0.72, zz * 0.85, car, false);
  }
  box(0.08, 0.1, 1.9, chrome, -2.42, 0.36, 0, car, false);
  box(0.08, 0.1, 1.9, chrome, 2.4, 0.36, 0, car, false);
  if (light) { const glow = new THREE.PointLight('#fff2c0', 4, 6); glow.position.set(-3.0, 0.6, 0); car.add(glow); }
  return car;
}

function cooler(parent, x, z, body, lid, open = false, rot = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; parent.add(g);
  const bm = std({ color: body, roughness: 0.45 }), lm = std({ color: lid, roughness: 0.45 });
  box(0.8, 0.5, 0.48, bm, 0, 0.27, 0, g);
  if (open) {
    const l = box(0.82, 0.1, 0.5, lm, 0, 0.75, -0.26, g); l.rotation.x = -1.35; l.position.y = 0.56;
    // hielo y cervezas
    const ice = std({ color: '#e8f6ff', transparent: true, opacity: 0.8, roughness: 0.1 });
    for (let i = 0; i < 26; i++) box(0.07, 0.07, 0.07, ice, (rnd() - 0.5) * 0.66, 0.5 + rnd() * 0.04, (rnd() - 0.5) * 0.36, g, false);
    const amber = std({ color: '#6b3a0e', roughness: 0.15, metalness: 0.1 });
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Group(); b.position.set(-0.28 + (i % 3) * 0.26, 0.55, -0.1 + Math.floor(i / 3) * 0.2); b.rotation.z = (rnd() - 0.5) * 0.4; g.add(b);
      cyl(0.035, 0.035, 0.2, amber, 0, 0, 0, b, 10); cyl(0.013, 0.03, 0.09, amber, 0, 0.14, 0, b, 8);
      cyl(0.015, 0.015, 0.02, std({ color: '#d4af37', metalness: 0.8 }), 0, 0.19, 0, b, 8);
    }
  } else box(0.84, 0.1, 0.52, lm, 0, 0.57, 0, g);
  for (const s of [-1, 1]) box(0.04, 0.06, 0.2, std({ color: '#ddd' }), s * 0.42, 0.4, 0, g, false);
  return g;
}

function casachuy(root, env) {
  env.background = '#060a18'; env.fog = ['#0b1226', 20, 60];
  skyDome('#02040c', '#1b2648', root);
  // estrellas y luna
  const starGeo = new THREE.BufferGeometry();
  const sp = [];
  for (let i = 0; i < 700; i++) { const a = rnd() * Math.PI * 2, e = 0.08 + rnd() * 1.3; sp.push(Math.cos(a) * Math.cos(e) * 85, Math.sin(e) * 85, Math.sin(a) * Math.cos(e) * 85); }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  root.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.25, sizeAttenuation: true, fog: false })));
  const moon = mesh(new THREE.CircleGeometry(2.2, 40), basic({ color: '#f3f0dc', fog: false }), 14, 18, -60, root, false);
  mesh(new THREE.CircleGeometry(5, 40), basic({ color: '#7f8fd0', transparent: true, opacity: 0.12, fog: false }), 14, 18, -60.2, root, false);
  moon.lookAt(0, 2, 10);

  root.add(new THREE.HemisphereLight('#3a4a7a', '#0d0d14', 0.55));
  sun(root, '#a9b8ff', 0.55, [-8, 14, 8]);

  // calle de asfalto, banqueta con guarnición y lote baldío
  ground(root, (g, W, H) => {
    g.fillStyle = '#2b2b2e'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 9000; i++) { g.fillStyle = rnd() < 0.5 ? '#3a3a3e' : '#1e1e20'; g.fillRect(rnd() * W, rnd() * H, 2, 2); }
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 2;
    for (let i = 0; i < 10; i++) { g.beginPath(); let x = rnd() * W, y = rnd() * H; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 50; y += (rnd() - 0.5) * 50; g.lineTo(x, y); } g.stroke(); }
    g.fillStyle = 'rgba(120,115,105,0.08)';
    for (let i = 0; i < 18; i++) { g.beginPath(); g.ellipse(rnd() * W, rnd() * H, 30 + rnd() * 50, 10 + rnd() * 20, rnd() * 3, 0, 7); g.fill(); }
  }, [8, 5]);
  const conc = std({ color: '#8d8a84', roughness: 0.95 });
  box(30, 0.16, 1.7, conc, 0, 0.08, -4.1, root);
  box(30, 0.2, 0.18, std({ color: '#a29f98' }), 0, 0.1, -3.2, root);
  const lot = mesh(new THREE.PlaneGeometry(11, 7), std({ map: tex(256, 256, dirt('#8a7558', ['#6d5c45', '#a8916f', '#5a4b38']), [3, 2]) }), -6.6, 0.02, -8.3, root);
  lot.rotation.x = -Math.PI / 2;
  fence(root, -12, -1.3, -5.0, 2.0, { color: '#8f948f', post: '#6a5a4a' });
  // basura en el lote
  const trashCols = ['#c0392b', '#ecf0f1', '#2980b9', '#f1c40f', '#27ae60'];
  for (let i = 0; i < 22; i++) box(0.12 + rnd() * 0.2, 0.05 + rnd() * 0.1, 0.1 + rnd() * 0.2, std({ color: trashCols[i % 5] }), -11 + rnd() * 9, 0.06, -6 - rnd() * 4.5, root).rotation.y = rnd() * 3;
  for (let i = 0; i < 4; i++) mesh(new THREE.SphereGeometry(0.6 + rnd() * 0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: '#a8916f' }), -10 + rnd() * 8, 0, -7 - rnd() * 3, root).scale.y = 0.4;
  bush(root, -4.2, -9.8, '#3d5a2a', 0.9);

  // barda de block con grafiti
  const graffiti = tex(1024, 280, (g, W, H) => {
    g.fillStyle = '#9b9890'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(40,40,40,0.35)'; g.lineWidth = 2;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 17; c++) g.strokeRect(c * 62 + (r % 2) * 31, r * 32, 62, 32);
    g.fillStyle = '#9a4b33'; g.fillRect(0, 0, W, 34);
    g.lineJoin = 'round';
    const tag = (txt, x, y, size, fill, stroke, rot) => { g.save(); g.translate(x, y); g.rotate(rot); g.font = `900 ${size}px Impact, "Bebas Neue", sans-serif`; g.lineWidth = size * 0.14; g.strokeStyle = stroke; g.strokeText(txt, 0, 0); g.fillStyle = fill; g.fillText(txt, 0, 0); g.restore(); };
    tag('CHUY', 60, 150, 120, '#f2f2f2', '#111', -0.06);
    tag('FXCKS', 420, 130, 96, '#7b3fe4', '#111', 0.04);
    tag('KOMBAT', 450, 225, 64, '#ffd23a', '#111', -0.03);
    tag('jack', 780, 230, 70, '#141414', '#555', 0.08);
    g.fillStyle = '#5b3b22'; g.fillRect(890, 60, 110, H - 60);
  });
  box(10.6, 2.9, 0.3, std({ map: graffiti }), -6.7, 1.45, -11.2, root);

  // casa roja con cochera de lámina, reja negra y troca
  const redWall = std({ color: '#a8312a', roughness: 0.95 });
  box(10.4, 3.1, 5, redWall, 3.9, 1.55, -10.4, root);
  box(10.6, 0.25, 5.2, std({ color: '#7a7672' }), 3.9, 3.2, -10.4, root);
  const winM = std({ color: '#1a2233', emissive: '#4f7dff', emissiveIntensity: 0.35 });
  box(1.4, 1.2, 0.08, winM, 1.6, 1.7, -7.86, root);
  for (let i = 0; i < 7; i++) box(0.04, 1.3, 0.05, std({ color: '#111' }), 0.95 + i * 0.22, 1.7, -7.8, root, false);
  box(1.0, 2.2, 0.08, std({ color: '#3a2a20' }), 5.2, 1.1, -7.86, root);
  const lamina = std({ map: corrugated('#9aa0a6', 'rgba(0,0,0,0.35)', [10, 1]), metalness: 0.6, roughness: 0.45, side: THREE.DoubleSide });
  const roof = box(10.2, 0.06, 3.3, lamina, 3.9, 2.65, -6.3, root);
  roof.rotation.x = 0.04;
  const postM = std({ color: '#1b1b1b', metalness: 0.6, roughness: 0.4 });
  for (const x of [-1.05, 4.0, 8.8]) box(0.14, 2.65, 0.14, postM, x, 1.32, -4.85, root);
  // reja negra de barrotes
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 2.0, 0.035), postM, 120);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 120; i++) bars.setMatrixAt(i, m4.makeTranslation(-0.9 + i * 0.082, 1.0, -4.85));
  bars.castShadow = true; root.add(bars);
  for (const y of [0.15, 1.95]) box(9.9, 0.06, 0.06, postM, 4.0, y, -4.85, root);
  box(0.5, 2.3, 0.5, conc, -1.35, 1.15, -4.85, root);
  box(0.3, 0.4, 0.15, std({ color: '#7d858c', metalness: 0.5 }), -1.35, 1.6, -4.55, root);
  // troca gris dentro de la cochera
  const truck = new THREE.Group(); truck.position.set(2.2, 0, -7.4); truck.rotation.y = Math.PI / 2; root.add(truck);
  const grey = std({ color: '#8f969c', metalness: 0.4, roughness: 0.35 });
  box(5.0, 0.75, 1.95, grey, 0, 0.75, 0, truck);
  box(1.9, 0.75, 1.85, grey, -0.4, 1.5, 0, truck);
  box(1.85, 0.6, 1.9, std({ color: '#0d1117', metalness: 0.6, roughness: 0.1 }), -0.42, 1.52, 0, truck, false);
  for (const xx of [-1.6, 1.6]) for (const zz of [-0.95, 0.95]) { const w = cyl(0.38, 0.38, 0.28, std({ color: '#111' }), xx, 0.38, zz, truck, 16); w.rotation.x = Math.PI / 2; }
  // tambo azul
  cyl(0.32, 0.32, 0.92, std({ color: '#1f5fbf', roughness: 0.5 }), -0.55, 0.46, -4.35, root);

  // EL CAMARO BLANCO afuera
  camaro(root, 4.4, -2.3);

  // hieleras de cerveza, cartones, latas y sillas
  cooler(root, -0.4, -3.75, '#c62828', '#f5f5f5', false, 0.1);
  cooler(root, 0.6, -3.7, '#1565c0', '#e3f2fd', true, -0.15);
  cooler(root, 1.55, -3.8, '#f5f5f5', '#1e88e5', false, 0.25);
  cooler(root, 0.1, -4.4, '#2e7d32', '#e8f5e9', true, 0.05);
  const carton = std({ color: '#c8171d' });
  for (let i = 0; i < 3; i++) box(0.45, 0.3, 0.32, carton, 2.3 + (i % 2) * 0.1, 0.17 + i * 0.3, -4.2, root);
  textPlane('', { w: 0.42, h: 0.18, bg: '#c8171d', color: '#fff', font: 'Rubik', weight: '900', lines: ['CHEVE'] }, root, 2.3, 0.5, -4.03);
  const can = std({ color: '#c8171d', metalness: 0.7, roughness: 0.3 });
  for (let i = 0; i < 9; i++) { const c = cyl(0.033, 0.033, 0.12, can, -1 + rnd() * 3.2, 0.035, -2.9 - rnd() * 0.5, root, 10); c.rotation.z = Math.PI / 2; c.rotation.y = rnd() * 3; }
  const chairW = std({ color: '#ececec', roughness: 0.6 });
  for (const [x, r] of [[-2.0, 0.4], [3.0, -0.3]]) {
    const ch = new THREE.Group(); ch.position.set(x, 0, -3.9); ch.rotation.y = r; root.add(ch);
    box(0.5, 0.05, 0.48, chairW, 0, 0.45, 0, ch); box(0.5, 0.5, 0.05, chairW, 0, 0.72, -0.22, ch);
    for (const dx of [-0.22, 0.22]) for (const dz of [-0.2, 0.2]) box(0.04, 0.45, 0.04, chairW, dx, 0.22, dz, ch);
  }

  // poste con lámpara de calle (luz naranja)
  const poleM = std({ color: '#7a7d80', metalness: 0.5, roughness: 0.5 });
  cyl(0.11, 0.15, 7.6, poleM, -7.6, 3.8, -3.9, root, 10);
  const arm = box(2.2, 0.08, 0.08, poleM, -6.6, 7.4, -3.9, root); arm.rotation.z = -0.08;
  box(0.6, 0.12, 0.3, std({ color: '#ffcf8a', emissive: '#ffa64d', emissiveIntensity: 2.2 }), -5.6, 7.25, -3.9, root, false);
  const street = new THREE.SpotLight('#ffab5c', 260, 26, 0.85, 0.55, 1.6);
  street.position.set(-5.6, 7.1, -3.9); street.target.position.set(-3.5, 0, -1); root.add(street, street.target);
  street.castShadow = true; street.shadow.mapSize.set(1024, 1024); street.shadow.bias = -0.0006;
  const cone = mesh(new THREE.ConeGeometry(3.2, 7, 24, 1, true), basic({ color: '#ffb36b', transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), -5.0, 3.6, -3.3, root, false);
  cone.rotation.z = 0.15;
  wire(root, [-7.6, 7.3, -3.9], [-20, 7.0, -6], 0.6);
  const pDer = posteLuz(root, 12.2, -4.0, 7.5, { trafo: true });
  wire(root, [-7.6, 7.3, -3.9], pDer, 0.6);
  // foco de la cochera y luz de la tele en la ventana
  const bulb = new THREE.PointLight('#ffe0a0', 9, 10); bulb.position.set(3.2, 2.45, -6.6); root.add(bulb);
  mesh(new THREE.SphereGeometry(0.07, 8, 6), basic({ color: '#fff3c8' }), 3.2, 2.52, -6.6, root, false);
  const tv = new THREE.PointLight('#5f8cff', 4, 6); tv.position.set(1.6, 1.6, -7.2); root.add(tv);
  tree(root, 10.5, -12.5, { h: 3.6, crown: '#1f3320' }); tree(root, -13, -13, { h: 3.2, crown: '#22361f' });
  const vida = [];

  // izquierda: los abarrotes de la esquina, con su anuncio prendido y el ABIERTO que parpadea
  casa(root, -16.2, -8.8, { w: 7, h: 3.1, d: 5, color: '#e3dccb', trim: '#9c2f25', noche: true, antena: true });
  const fz = -6.27, prod = ['#d62828', '#f77f00', '#fcbf49', '#2a9d8f', '#e9c46a', '#457b9d', '#ffffff'];
  box(2.4, 1.7, 0.04, std({ color: '#fff1c8', emissive: '#ffd98a', emissiveIntensity: 1.1 }), -14.0, 1.05, fz, root, false);
  for (let r = 0; r < 3; r++) {
    box(2.2, 0.04, 0.06, std({ color: '#6b4a30' }), -14.0, 0.45 + r * 0.45, fz + 0.03, root, false);
    for (let i = 0; i < 10; i++) { const c = prod[(i + r * 3) % prod.length]; box(0.14, 0.2 + rnd() * 0.1, 0.05, std({ color: c, emissive: c, emissiveIntensity: 0.35 }), -15.0 + i * 0.22, 0.6 + r * 0.45, fz + 0.04, root, false); }
  }
  box(2.5, 0.9, 0.06, std({ map: corrugated('#8b9096', 'rgba(0,0,0,0.4)', [4, 1], false), metalness: 0.5, roughness: 0.5 }), -14.0, 2.35, fz + 0.01, root);
  brilla(textPlane('', { w: 5.4, h: 0.8, bg: '#a3221b', color: '#fff3c4', font: 'Rubik', weight: '900', lines: ['ABARROTES "LUPITA"'] }, root, -16.2, 3.62, fz + 0.06), 0.9);
  const abierto = brilla(textPlane('ABIERTO', { w: 1.2, h: 0.38, color: '#ff4a6a', glow: '#ff0033', font: 'Rubik', weight: '900' }, root, -12.95, 2.05, fz + 0.06), 2.2);
  abierto.userData.vivo = true;
  vida.push((t) => { const k = t % 7; abierto.material.emissiveIntensity = k > 5.2 && k < 5.9 && Math.sin(t * 60) > 0 ? 0.15 : 2.2; });
  const coca = brilla(textPlane('', { w: 4.6, h: 2.0, bg: '#c8102e', color: '#ffffff', font: 'Brush Script MT', weight: '700', italic: true, lines: ['Coca-Cola'] }, root, -12.68, 1.55, -8.8), 0.22);
  coca.rotation.y = Math.PI / 2;
  box(0.8, 1.9, 0.7, std({ color: '#b5121b', roughness: 0.5 }), -18.3, 0.95, -5.95, root);
  box(0.66, 1.5, 0.03, std({ color: '#e8f6ff', emissive: '#bfe3ff', emissiveIntensity: 1.0 }), -18.3, 1.05, -5.59, root, false);
  luzPiso(root, -14.6, -5.7, 2.6, '#ffcf80', 0.24, 0.012, 1.4);
  luzPiso(root, -14.6, -4.1, 2.6, '#ffcf80', 0.16, 0.17, 0.85);
  // puesto de tacos en la banqueta: el trompo gira, el comal echa vapor, foco y bancos
  const tac = new THREE.Group(); tac.position.set(-13.4, 0.16, -4.3); root.add(tac);
  const inox = std({ color: '#b9c0c6', metalness: 0.8, roughness: 0.3 });
  box(1.9, 0.95, 0.75, inox, 0, 0.48, 0, tac);
  box(2.0, 0.05, 0.85, inox, 0, 0.98, 0, tac);
  brilla(textPlane('', { w: 1.7, h: 0.5, bg: '#1b5e20', color: '#ffe082', font: 'Rubik', weight: '900', lines: ['TACOS', 'EL CHUY'] }, tac, 0, 0.55, 0.385), 0.55);
  const lona = tex(128, 32, (g, W, H) => { const cs = ['#d62828', '#f1faee', '#1d3557']; for (let i = 0; i < 12; i++) { g.fillStyle = cs[i % 3]; g.fillRect(i * W / 12, 0, W / 12, H); } });
  mesh(new THREE.PlaneGeometry(2.6, 1.8), std({ map: lona, side: THREE.DoubleSide, roughness: 0.8 }), 0, 2.25, 0.1, tac).rotation.x = -Math.PI / 2 + 0.12;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(0.025, 0.025, 2.25, inox, sx * 1.2, 1.12, sz * 0.8 + 0.1, tac, 5);
  cyl(0.006, 0.006, 0.35, std({ color: '#111' }), 0.25, 1.98, 0.1, tac, 4);
  mesh(new THREE.SphereGeometry(0.075, 8, 6), basic({ color: '#fff4cf' }), 0.25, 1.76, 0.1, tac, false);
  const trompo = new THREE.Group(); trompo.userData.vivo = true; trompo.position.set(-0.55, 1.0, -0.12); tac.add(trompo);
  mesh(new THREE.CylinderGeometry(0.17, 0.09, 0.62, 10), std({ color: '#9c3d1c', roughness: 0.6, emissive: '#5a1a00', emissiveIntensity: 0.5, flatShading: true }), 0, 0.36, 0, trompo);
  mesh(new THREE.SphereGeometry(0.08, 8, 6), std({ color: '#e8b730', emissive: '#6a4a00', emissiveIntensity: 0.4 }), 0, 0.72, 0, trompo);
  cyl(0.012, 0.012, 0.95, inox, 0, 0.45, 0, trompo, 5);
  batchStatic(trompo);
  box(0.06, 0.62, 0.3, std({ color: '#401000', emissive: '#ff4a10', emissiveIntensity: 2.0 }), -0.85, 1.36, -0.12, tac, false);
  cyl(0.32, 0.32, 0.03, std({ color: '#222', metalness: 0.6, roughness: 0.4 }), 0.45, 1.02, -0.05, tac, 18);
  for (const x of [-0.6, 0.15, 0.85]) cyl(0.16, 0.19, 0.42, std({ color: '#1565c0', roughness: 0.5 }), x, 0.21, 0.7, tac, 10);
  const vapor = new THREE.Group(); vapor.userData.vivo = true; vapor.position.set(-12.95, 1.25, -4.35); root.add(vapor);
  const humoV = [];
  for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), basic({ color: '#e8e6e0', transparent: true, opacity: 0, depthWrite: false })); vapor.add(m); humoV.push(m); }
  vida.push((t) => {
    trompo.rotation.y = t * 0.8;
    humoV.forEach((m, i) => { const k = (t * 0.45 + i / humoV.length) % 1; m.position.set(Math.sin(t + i) * 0.08, k * 1.1, 0); m.scale.setScalar(0.6 + k * 2); m.material.opacity = Math.min(1, k / 0.15) * (1 - k) * 0.3; });
  });
  luzPiso(root, -13.2, -4.1, 1.9, '#fff0c0', 0.28, 0.17, 0.85);
  gato(root, vida, -9.4, 2.9, -11.2);

  // derecha: la casa de dos pisos del vecino (foco del porche), barda con barrotes y un nicho con veladoras
  casa(root, 15.2, -10.6, { w: 7.4, h: 2.8, d: 5.5, pisos: 2, color: '#5d7fa3', trim: '#3f5b7a', noche: true, antena: true, varillas: true });
  mesh(new THREE.SphereGeometry(0.08, 8, 6), basic({ color: '#fff1c4' }), 12.6, 2.4, -7.75, root, false);
  luzPiso(root, 12.8, -7.0, 2.0, '#ffe2a0', 0.22);
  const barda = std({ color: '#c9c2b4', roughness: 0.95 }), fierro = std({ color: '#151515', metalness: 0.5, roughness: 0.5 });
  box(7.6, 1.0, 0.25, barda, 15.2, 0.5, -6.2, root);
  for (let x = 12.5; x <= 18.9; x += 0.16) box(0.025, 1.1, 0.025, fierro, x, 1.55, -6.2, root, false);
  box(6.5, 0.05, 0.05, fierro, 15.7, 2.1, -6.2, root, false);
  const nicho = new THREE.Group(); nicho.position.set(11.95, 1.0, -6.05); root.add(nicho);
  const cal = std({ color: '#f1efe9', roughness: 0.9 });
  box(0.62, 0.78, 0.42, cal, 0, 0.39, 0, nicho);
  mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.42, 14, 1, false, Math.PI / 2, Math.PI), cal, 0, 0.78, 0, nicho).rotation.x = Math.PI / 2;
  box(0.44, 0.52, 0.02, std({ color: '#203a7a', emissive: '#3f6fd8', emissiveIntensity: 0.6 }), 0, 0.42, 0.212, nicho, false);
  mesh(new THREE.TorusGeometry(0.14, 0.02, 6, 20), std({ color: '#d4af37', emissive: '#ffbf3a', emissiveIntensity: 1.2 }), 0, 0.48, 0.225, nicho, false).scale.y = 1.35;
  box(0.66, 0.04, 0.22, cal, 0, 0.02, 0.3, nicho);
  const llamas = [];
  for (const [x, c] of [[-0.2, '#c62828'], [0, '#f5f5f5'], [0.2, '#c62828']]) {
    cyl(0.035, 0.035, 0.13, std({ color: c, emissive: '#ff8a30', emissiveIntensity: 0.3 }), x, 0.105, 0.3, nicho, 8);
    const f = mesh(new THREE.SphereGeometry(0.022, 6, 4), basic({ color: '#ffd27a' }), x, 0.2, 0.3, nicho, false); f.userData.vivo = true; llamas.push(f);
  }
  vida.push((t) => llamas.forEach((f, i) => { const s = 0.85 + Math.sin(t * 17 + i * 2) * 0.12 + Math.sin(t * 29 + i) * 0.08; f.scale.set(s, s * 1.6, s); }));
  luzPiso(root, 11.95, -5.6, 0.9, '#ffb060', 0.3);
  luzPiso(root, 12.4, -4.1, 2.8, '#ffd9a0', 0.14, 0.17, 0.85);
  luzPiso(root, 12.4, -1.2, 3.2, '#ffd9a0', 0.07, 0.012, 2.0);
  carro(root, 15.2, -2.2, { color: '#1d3557' });
  // unos tenis colgando del cable de la luz
  const tenis = new THREE.Group(); tenis.userData.vivo = true; tenis.position.set(3.0, 6.68, -3.95); root.add(tenis);
  for (const s of [-1, 1]) {
    const shoe = new THREE.Group(); shoe.position.set(s * 0.09, s > 0 ? -0.52 : -0.42, 0); shoe.rotation.x = s * 0.3; tenis.add(shoe);
    box(0.1, 0.09, 0.27, std({ color: '#f2f2f2', roughness: 0.6 }), 0, 0, 0, shoe);
    box(0.11, 0.035, 0.28, std({ color: '#c62828' }), 0, -0.055, 0, shoe);
    wire(tenis, [0, 0, 0], [s * 0.09, s > 0 ? -0.47 : -0.37, 0], 0, '#dddddd');
  }
  vida.push((t) => { tenis.rotation.z = Math.sin(t * 0.9) * 0.07; tenis.rotation.x = Math.sin(t * 0.63) * 0.05; });

  // atrás: casas con ventanas prendidas, torre de celular con su foco rojo, cerro con las luces de la ciudad
  // y un carro que pasa a lo lejos
  const colsN = ['#8a7f73', '#6f7f8f', '#8f6f6a', '#7a8a72', '#9a8f7a', '#7f6f8f'];
  for (let i = 0; i < 8; i++) casa(root, -31 + i * 8.8 + rnd() * 2, -18.5 - rnd() * 4, { w: 5 + rnd() * 2.5, h: 2.7, pisos: rnd() < 0.35 ? 2 : 1, color: colsN[i % colsN.length], trim: '#55504a', noche: true, tinaco: rnd() < 0.7, antena: rnd() < 0.4 });
  const torre = new THREE.Group(); torre.position.set(16, 0, -27); root.add(torre);
  const acero = std({ color: '#59616b', metalness: 0.6, roughness: 0.5 }), H = 13, ang = [0, 1, 2].map((i) => i / 3 * Math.PI * 2);
  const P = (a, y) => { const r = 1.1 - 0.8 * (y / H); return [Math.cos(a) * r, y, Math.sin(a) * r]; };
  for (const a of ang) vara(torre, P(a, 0), P(a, H), 0.05, acero);
  for (let y = 0; y < H - 1; y += 1.6) for (let i = 0; i < 3; i++) vara(torre, P(ang[i], y), P(ang[(i + 1) % 3], y + 1.6), 0.02, acero, 4);
  for (const a of ang) box(0.22, 1.1, 0.08, std({ color: '#d9dde1' }), Math.cos(a + 0.5) * 0.45, H - 0.6, Math.sin(a + 0.5) * 0.45, torre).rotation.y = -(a + 0.5);
  const foco = mesh(new THREE.SphereGeometry(0.17, 8, 6), basic({ color: '#ff2a2a', fog: false }), 0, H + 0.35, 0, torre, false); foco.userData.vivo = true;
  vida.push((t) => { foco.visible = t % 1.8 < 0.9; });
  cerros(root, '#0c1220', -50, { h: 8, seed: 3 });
  const lp = [];
  for (let i = 0; i < 520; i++) lp.push(-95 + rnd() * 190, 0.3 + rnd() * rnd() * 6, -48.5 - rnd() * 3);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  root.add(new THREE.Points(lg, new THREE.PointsMaterial({ color: '#ffcf8a', size: 0.24, sizeAttenuation: true, fog: false })));
  const auto = new THREE.Group(); auto.userData.vivo = true; root.add(auto);
  mesh(new THREE.SphereGeometry(0.2, 8, 6), basic({ color: '#fff6dc', fog: false }), 1.2, 0, 0, auto, false);
  mesh(new THREE.SphereGeometry(0.15, 8, 6), basic({ color: '#ff3020', fog: false }), -1.2, 0, 0, auto, false);
  vida.push((t) => { const k = (t % 22) / 22; auto.position.set(-70 + k * 140, 1.2 + Math.sin(k * 9) * 0.4, -47.5); });

  // en la calle: topes, coladera, charcos que reflejan el foco, la raya del centro y basura
  for (const [x, z0, n] of [[-11.4, -1.1, 8], [11.6, -2.6, 10]]) for (let i = 0; i < n; i++) box(0.55, 0.07, 0.95, std({ color: i % 2 ? '#1b1b1b' : '#d9ad1f', roughness: 0.8 }), x, 0.035, z0 + i * 0.97, root, false);
  cyl(0.4, 0.4, 0.02, std({ color: '#26262a', metalness: 0.7, roughness: 0.5 }), 5.6, 0.01, 2.2, root, 20);
  const agua = std({ color: '#303137', roughness: 0.12, metalness: 0.15 });
  for (const [x, z, sx, sz] of [[-4.6, 2.6, 1.0, 0.5], [7.9, 1.8, 1.1, 0.6], [-10.2, 4.4, 1.4, 0.7], [13.5, 3.6, 1.2, 0.7]]) {
    const p = mesh(new THREE.CircleGeometry(1, 20), agua, x, 0.006, z, root, false); p.rotation.x = -Math.PI / 2; p.scale.set(sx, sz, 1);
  }
  for (let x = -30; x < 30; x += 3.5) box(1.6, 0.006, 0.1, std({ color: '#6f6233', roughness: 0.9 }), x, 0.004, 4.8, root, false);
  const bolsa = std({ color: '#141416', roughness: 0.45, flatShading: true });
  mesh(new THREE.IcosahedronGeometry(0.3, 1), bolsa, -3.0, 0.4, -4.55, root).scale.set(1, 0.78, 0.9);
  mesh(new THREE.ConeGeometry(0.07, 0.16, 5), bolsa, -3.0, 0.7, -4.55, root);
  suelto(root, { x0: -20, x1: 20, z0: -3, z1: 8, piedras: 25, matas: 0, corcholatas: 25, piedra: '#55534f' });

  return {
    update(t) {
      tv.intensity = 3 + Math.sin(t * 7) * 1.2 + Math.sin(t * 23) * 0.8;
      street.intensity = 260 * (Math.sin(t * 37) > 0.995 ? 0.6 : 1);
      for (const f of vida) f(t);
    },
  };
}

// =====================================================================
//  TEMPLO (el escenario original)
// =====================================================================
function templo(root, env, effects) {
  env.background = '#0a0610'; env.fog = ['#120a14', 14, 42];
  skyDome('#050208', '#59110f', root);
  mesh(new THREE.CircleGeometry(3, 48), basic({ color: '#ffe9c4', fog: false }), -14, 16, -50, root, false);
  mesh(new THREE.CircleGeometry(6, 48), basic({ color: '#ff9a6a', transparent: true, opacity: 0.12, fog: false }), -14, 16, -50.1, root, false);
  root.add(new THREE.HemisphereLight('#8a7cff', '#2a1a10', 0.55));
  sun(root, '#ffd7b0', 1.6, [4, 10, 8], 12);
  const rim = new THREE.DirectionalLight('#5a7bff', 1.0); rim.position.set(-6, 5, -8); root.add(rim);
  ground(root, (g, W, H) => {
    g.fillStyle = '#3b3530'; g.fillRect(0, 0, W, H);
    const tile = 128;
    for (let y = 0; y < H; y += tile) for (let x = 0; x < W; x += tile) {
      const v = 45 + rnd() * 25;
      g.fillStyle = `rgb(${v + 8},${v + 2},${v - 4})`; g.fillRect(x + 3, y + 3, tile - 6, tile - 6);
    }
  }, [12, 6], [60, 30]);
  const stone = std({ color: '#5a4e45', roughness: 0.9 });
  box(60, 9, 1, std({ color: '#2c2420', roughness: 0.95 }), 0, 4.5, -9, root);
  for (let i = -5; i <= 5; i++) {
    cyl(0.45, 0.55, 7, stone, i * 4.2, 3.5, -7, root, 12);
    box(1.4, 0.4, 1.4, stone, i * 4.2, 7.1, -7, root);
    box(1.4, 0.4, 1.4, stone, i * 4.2, 0.2, -7, root);
  }
  box(48, 0.9, 1.8, stone, 0, 7.7, -7, root);
  const seal = mesh(new THREE.RingGeometry(2.6, 2.8, 64), basic({ color: '#7a1010', transparent: true, opacity: 0.6 }), 0, 0.01, 0, root, false);
  seal.rotation.x = -Math.PI / 2;
  const torches = [];
  for (const x of [-8.4, -2.1, 2.1, 8.4]) {
    cyl(0.12, 0.2, 2.2, std({ color: '#222', metalness: 0.6, roughness: 0.4 }), x, 1.1, -5.6, root, 8);
    cyl(0.4, 0.2, 0.3, std({ color: '#3a2a1a', metalness: 0.7, roughness: 0.4 }), x, 2.3, -5.6, root, 12);
    const light = new THREE.PointLight('#ff7a2a', 18, 9, 1.6); light.position.set(x, 2.9, -5.4); root.add(light);
    torches.push({ pos: new THREE.Vector3(x, 2.45, -5.6), light });
  }
  return {
    update(t) {
      for (const tr of torches) {
        tr.light.intensity = 16 + Math.sin(t * 13 + tr.pos.x) * 3 + Math.random() * 3;
        effects.glow.emit({ pos: tr.pos, count: 2, speed: 1.2, dir: [0, 1, 0], spread: 0.25, jitter: 0.25, color: '#ffd27a', colorEnd: '#ff2a00', life: 0.55, size: 0.35, drag: 1 });
      }
    },
  };
}

// =====================================================================
export const STAGES = [
  { id: 'six', nombre: 'SIX', lugar: 'Cruz de Piedra', build: six, color: '#c8171d' },
  { id: 'cabana', nombre: 'LA CABAÑA', lugar: 'de la Progreso', build: cabana, color: '#6b4a2e' },
  { id: 'casachuy', nombre: 'CASA CHUY', lugar: 'de noche', build: casachuy, color: '#1b2648' },
  { id: 'templo', nombre: 'TEMPLO', lugar: 'el clásico', build: templo, color: '#59110f' },
];

export function createStage(id, scene, effects) {
  const def = STAGES.find((s) => s.id === id) || STAGES[0];
  const root = new THREE.Group();
  root.name = 'escenario-' + def.id;
  const env = { background: '#000', fog: null };
  const api = def.build(root, env, effects) || {};
  batchStatic(root);
  scene.add(root);
  scene.background = new THREE.Color(env.background);
  scene.fog = env.fog ? new THREE.Fog(env.fog[0], env.fog[1], env.fog[2]) : null;
  return {
    id: def.id,
    root,
    update: api.update || (() => {}),
    dispose() {
      scene.remove(root);
      root.traverse((o) => {
        o.geometry?.dispose?.();
        for (const m of [].concat(o.material || [])) { m.map?.dispose?.(); m.dispose?.(); }
        if (o.isLight && o.shadow?.map) o.shadow.map.dispose();
      });
    },
  };
}
