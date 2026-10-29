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

// =====================================================================
//  SIX (Cruz de Piedra) — de día
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
  tree(root, -9.5, -12.5, { h: 2.6 }); tree(root, -12, -9.5, { h: 3.2, crown: '#6b8f3a' }); tree(root, 11, -11.5, { h: 3.4, crown: '#c7471f', r: 1.3 });
  tree(root, 13, -8, { h: 2.8, crown: '#5c7f30' });
  for (let i = 0; i < 7; i++) bush(root, -9 + rnd() * 3, -6 - rnd() * 6, '#6b8a3a', 0.5 + rnd() * 0.5);
  const houseCols = ['#e9e1d3', '#d9c7a8', '#f2efe7', '#c9d7c9'];
  for (let i = 0; i < 6; i++) box(3 + rnd() * 2, 2.4 + rnd(), 3, std({ color: houseCols[i % 4] }), -26 + i * 9, 1.3, -24 - rnd() * 4, root, false);
  return {};
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
  return {};
}

// =====================================================================
//  CASA CHUY — de noche, con un Camaro blanco y hieleras de cheve
// =====================================================================
function camaro(parent, x, z, facing = -1) {
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
  const glow = new THREE.PointLight('#fff2c0', 4, 6); glow.position.set(-3.0, 0.6, 0); car.add(glow);
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
  wire(root, [-7.6, 7.3, -3.9], [12, 6.8, -12], 0.9);
  // foco de la cochera y luz de la tele en la ventana
  const bulb = new THREE.PointLight('#ffe0a0', 9, 10); bulb.position.set(3.2, 2.45, -6.6); root.add(bulb);
  mesh(new THREE.SphereGeometry(0.07, 8, 6), basic({ color: '#fff3c8' }), 3.2, 2.52, -6.6, root, false);
  const tv = new THREE.PointLight('#5f8cff', 4, 6); tv.position.set(1.6, 1.6, -7.2); root.add(tv);
  tree(root, 10.5, -12.5, { h: 3.6, crown: '#1f3320' }); tree(root, -13, -13, { h: 3.2, crown: '#22361f' });

  return {
    update(t) {
      tv.intensity = 3 + Math.sin(t * 7) * 1.2 + Math.sin(t * 23) * 0.8;
      street.intensity = 260 * (Math.sin(t * 37) > 0.995 ? 0.6 : 1);
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
