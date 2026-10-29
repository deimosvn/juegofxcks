// Herramienta local: optimiza un modelo de Meshy/Tripo y lo guarda en assets/peleadores/<id>/
// Solo funciona con `node servidor.js` (usa la ruta /__guardar del servidor local).
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer';
import { FighterModel, TARGET_HEIGHT } from '../src/model.js';

const $ = (id) => document.getElementById(id);
const log = (...a) => { $('log').textContent += a.join(' ') + '\n'; console.log(...a); };

// --------------------------------------------------------------- escena
const renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#202026');
scene.add(new THREE.HemisphereLight('#cfd8ff', '#3a2a20', 1.6));
const key = new THREE.DirectionalLight('#fff1e0', 2.2); key.position.set(2, 4, 4); scene.add(key);
const rim = new THREE.DirectionalLight('#6a8cff', 1.4); rim.position.set(-3, 3, -3); scene.add(rim);
const grid = new THREE.GridHelper(4, 8, '#555', '#333'); scene.add(grid);
const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
camera.position.set(1.6, 1.4, 3.6);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.95, 0); controls.update();
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

let processed = null;   // objeto optimizado (sin esqueleto) que se exporta
let preview = null;     // FighterModel con auto-rig para probar
let animKey = 'idle', animT = 0;
const ANIMS = ['idle', 'caminar', 'puno', 'puno_fuerte', 'patada', 'gancho_arriba', 'barrida', 'bloqueo', 'laser', 'misiles', 'golpeado', 'caer', 'victoria', 'retrato'];
const TOTALS = { puno: 17, puno_fuerte: 29, patada: 26, gancho_arriba: 38, barrida: 34, laser: 46, misiles: 50, caer: 40, golpeado: 20 };
for (const k of ANIMS) {
  const b = document.createElement('button'); b.textContent = k;
  b.onclick = () => { animKey = k; animT = 0; };
  $('anims').appendChild(b);
}

let last = performance.now();
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (preview) {
    if (!window.tool?.hold) animT += dt * 60;
    const total = TOTALS[animKey] || 0;
    if (total && animT > total + 30) animT = 0;
    preview.apply({ key: animKey, t: Math.min(animT, total || animT), total, s: 0.3, a: 0.55, id: 1 }, dt);
  }
  renderer.render(scene, camera);
});

// --------------------------------------------------------------- carga
async function loadFiles(files) {
  const byName = new Map([...files].map((f) => [f.name.toLowerCase(), URL.createObjectURL(f)]));
  const main = [...files].find((f) => /\.(fbx|glb|gltf)$/i.test(f.name));
  if (!main) throw new Error('Falta el archivo .fbx o .glb');
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    const base = decodeURIComponent(url.split(/[\\/]/).pop().split('?')[0]).toLowerCase();
    return byName.get(base) || url;
  });
  const url = byName.get(main.name.toLowerCase());
  if (/\.fbx$/i.test(main.name)) return new FBXLoader(manager).loadAsync(url);
  return (await new GLTFLoader(manager).loadAsync(url)).scene;
}

async function loadUrl(src) {
  if (/\.fbx$/i.test(src)) return new FBXLoader().loadAsync(src);
  return (await new GLTFLoader().loadAsync(src)).scene;
}

// --------------------------------------------------------------- optimización
function resizedTexture(tex, size, mime) {
  if (!tex || !tex.image) return null;
  const img = tex.image;
  const w = img.width, h = img.height;
  const k = Math.min(1, size / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.flipY = tex.flipY; t.colorSpace = tex.colorSpace; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT;
  t.userData.mimeType = mime;
  return t;
}

async function waitTextures(obj) {
  const texs = [];
  obj.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) for (const k of ['map', 'normalMap']) if (m[k]) texs.push(m[k]); });
  for (let i = 0; i < 100 && texs.some((t) => !t.image || !t.image.width); i++) await new Promise((r) => setTimeout(r, 100));
}

function simplify(geo, targetTris) {
  let g = geo.index ? geo : mergeVertices(geo, 1e-5);
  const before = g.index.count / 3;
  if (before <= targetTris) return { geo: g, before, after: before };
  const idx = new Uint32Array(g.index.array);
  const pos = new Float32Array(g.attributes.position.array);
  let [out] = MeshoptSimplifier.simplify(idx, pos, 3, targetTris * 3, 0.01);
  if (out.length / 3 > targetTris * 1.5) [out] = MeshoptSimplifier.simplify(idx, pos, 3, targetTris * 3, 0.04);
  // compactar vértices
  const remap = new Int32Array(g.attributes.position.count).fill(-1);
  let next = 0;
  for (let i = 0; i < out.length; i++) if (remap[out[i]] < 0) remap[out[i]] = next++;
  const ng = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(g.attributes)) {
    const n = attr.itemSize, arr = new attr.array.constructor(next * n);
    for (let v = 0; v < remap.length; v++) if (remap[v] >= 0) for (let c = 0; c < n; c++) arr[remap[v] * n + c] = attr.array[v * n + c];
    ng.setAttribute(name, new THREE.BufferAttribute(arr, n, attr.normalized));
  }
  const ni = new Uint32Array(out.length);
  for (let i = 0; i < out.length; i++) ni[i] = remap[out[i]];
  ng.setIndex(new THREE.BufferAttribute(ni, 1));
  return { geo: ng, before, after: out.length / 3 };
}

async function process(obj) {
  await MeshoptSimplifier.ready;
  await waitTextures(obj);
  obj.rotation.y = THREE.MathUtils.degToRad(+$('rot').value);
  obj.updateMatrixWorld(true);
  const meshes = [];
  obj.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const totalTris = meshes.reduce((s, m) => s + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0);
  const target = +$('tris').value;
  const texSize = +$('texsize').value;
  const out = new THREE.Group();
  const box = new THREE.Box3().setFromObject(obj);
  const s = TARGET_HEIGHT / (box.max.y - box.min.y);
  const fix = new THREE.Matrix4().makeScale(s, s, s).multiply(new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2));
  for (const m of meshes) {
    const tris = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
    const g0 = m.geometry.clone();
    for (const k of Object.keys(g0.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g0.deleteAttribute(k);
    g0.applyMatrix4(m.matrixWorld); g0.applyMatrix4(fix);
    const r = simplify(g0, Math.max(500, Math.round(target * tris / totalTris)));
    log(`malla ${m.name || '?'}: ${Math.round(r.before).toLocaleString()} → ${Math.round(r.after).toLocaleString()} triángulos`);
    const src = [].concat(m.material)[0];
    const mat = new THREE.MeshStandardMaterial({
      name: src.name || 'piel', roughness: 0.75, metalness: 0,
      map: resizedTexture(src.map, texSize, 'image/jpeg'),
      normalMap: resizedTexture(src.normalMap, Math.min(1024, texSize), 'image/jpeg'),
    });
    if (!mat.map && src.color) mat.color.copy(src.color);
    if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
    r.geo.computeBoundingBox(); r.geo.computeBoundingSphere();
    out.add(new THREE.Mesh(r.geo, mat));
  }
  return out;
}

async function show(obj) {
  if (preview) preview.root.removeFromParent();
  processed = await process(obj);
  preview = await FighterModel.fromAsset({ scene: processed, animations: [] }, { escala: 1, rotacionY: 0 });
  preview.setFacing(1);
  preview.root.rotation.y = 0;   // de frente a la cámara en la vista previa
  scene.add(preview.root);
  const d = preview.rigDebug;
  log(`auto-rig: entrepierna ${(d.crotchY / TARGET_HEIGHT * 100).toFixed(0)}% · hombros ${(d.shoulderY / TARGET_HEIGHT * 100).toFixed(0)}% de la altura`);
  const helper = new THREE.SkeletonHelper(preview.parts.hips);
  scene.add(helper);
  $('save').disabled = false;
  log('Listo. Revisa las animaciones con los botones y guarda.');
}

// --------------------------------------------------------------- guardar
async function post(path, blob) {
  const r = await fetch('/__guardar?archivo=' + encodeURIComponent(path), { method: 'POST', body: blob });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function portrait() {
  const W = 600, H = 800;
  const rr = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  rr.setSize(W, H); rr.outputColorSpace = THREE.SRGBColorSpace; rr.toneMapping = THREE.ACESFilmicToneMapping;
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight('#cfd8ff', '#3a2a20', 1.5));
  const k = new THREE.DirectionalLight('#fff1e0', 2.4); k.position.set(1.5, 2.5, 3); sc.add(k);
  const r2 = new THREE.DirectionalLight('#ff7a3a', 1.6); r2.position.set(-2, 2, -1); sc.add(r2);
  const m = await FighterModel.fromAsset({ scene: processed, animations: [] }, { escala: 1, rotacionY: 0 });
  m.root.rotation.y = 0.25;
  m.apply({ key: 'retrato', t: 0, total: 0 }, 1);
  // brazos pegados al cuerpo: en la foto se quedan tal como vienen (si se mueven se abre la costura)
  if (m.rig?.hang) for (const b of ['shN', 'shF', 'elN', 'elF']) m.parts[b].rotation.set(0, 0, 0);
  sc.add(m.root);
  const top = TARGET_HEIGHT * 1.02, h = 0.95;
  const cam = new THREE.OrthographicCamera(-h * 0.375, h * 0.375, top, top - h, 0.1, 20);
  cam.position.set(0, 0, 5);
  rr.render(sc, cam);
  const blob = await new Promise((res) => rr.domElement.toBlob(res, 'image/png'));
  rr.dispose();
  return blob;
}

$('save').onclick = async () => {
  const id = $('fid').value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!id) return alert('Escribe el id (nombre de la carpeta, sin espacios)');
  $('save').disabled = true;
  try {
    const glb = await new GLTFExporter().parseAsync(processed, { binary: true });
    const a = await post(`assets/peleadores/${id}/modelo.glb`, new Blob([glb]));
    log(`modelo.glb guardado (${(a.bytes / 1048576).toFixed(1)} MB)`);
    const b = await post(`assets/peleadores/${id}/retrato.png`, await portrait());
    log(`retrato.png guardado (${(b.bytes / 1024).toFixed(0)} KB)`);
    log(`\nEn src/roster.js usa:\n  modelo: 'assets/peleadores/${id}/modelo.glb',\n  retrato: 'assets/peleadores/${id}/retrato.png',`);
  } catch (e) { log('ERROR: ' + e.message); }
  $('save').disabled = false;
};

$('files').onchange = async (e) => {
  $('log').textContent = '';
  try { log('Cargando…'); await show(await loadFiles(e.target.files)); } catch (err) { log('ERROR: ' + err.message); }
};

// ?src=/assets/peleadores/diego/raw_m.fbx&id=diego
const qs = new URLSearchParams(location.search);
if (qs.get('id')) $('fid').value = qs.get('id');
if (qs.get('src')) { log('Cargando ' + qs.get('src') + '…'); loadUrl(qs.get('src')).then(show).catch((err) => log('ERROR: ' + err.message)); }
// Colorea cada vértice según el hueso que lo mueve (para revisar el auto-rig)
function showWeights() {
  const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ff8800', '#8800ff', '#0088ff', '#88ff00', '#ff0088', '#ffffff'].map((c) => new THREE.Color(c));
  preview.pivot.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const g = o.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const col = new Float32Array(si.count * 3);
    for (let v = 0; v < si.count; v++) for (let j = 0; j < 4; j++) {
      const w = sw.getComponent(v, j), c = colors[si.getComponent(v, j)];
      col[v * 3] += c.r * w; col[v * 3 + 1] += c.g * w; col[v * 3 + 2] += c.b * w;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    o.material = new THREE.MeshBasicMaterial({ vertexColors: true });
  });
}

window.tool = {
  get preview() { return preview; }, get processed() { return processed; }, portrait, post, camera, controls, showWeights,
  setAnim(k, t = 0, freeze = false) { animKey = k; animT = t; if (freeze) preview.apply({ key: k, t, total: TOTALS[k] || 0, s: 0.3, a: 0.55, id: 2 }, 1); },
};
