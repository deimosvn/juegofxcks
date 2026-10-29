import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { ANIMACIONES } from './roster.js';
import { makeFish, makeKawama } from './props.js';

export const TARGET_HEIGHT = 1.85;
const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader();
const assetCache = new Map();
let sharedClips = null;     // { key: AnimationClip }
let sharedHipsRef = 0;      // altura de cadera del esqueleto de las animaciones

// ---------------------------------------------------------------------
//  Carga de archivos
// ---------------------------------------------------------------------
export function loadAsset(url) {
  if (!assetCache.has(url)) {
    const isFbx = /\.fbx$/i.test(url);
    const p = (isFbx ? fbxLoader : gltfLoader).loadAsync(url).then((r) => (
      isFbx ? { scene: r, animations: r.animations || [] } : { scene: r.scene, animations: r.animations || [] }
    ));
    assetCache.set(url, p);
  }
  return assetCache.get(url);
}

const norm = (n) => (n || '').toLowerCase().replace(/^.*[:|]/, '').replace(/mixamorig\d*/g, '').replace(/[^a-z0-9]/g, '');

// Alias para animaciones que ya vienen dentro del modelo (ej. exportadas de Tripo)
const ALIAS = {
  idle: 'idle', fightingidle: 'idle', walk: 'caminar', walking: 'caminar', walkback: 'caminar_atras',
  jump: 'saltar', crouch: 'agacharse', block: 'bloqueo', punch: 'puno', jab: 'puno', kick: 'patada',
  uppercut: 'gancho_arriba', sweep: 'barrida', hit: 'golpeado', hitreaction: 'golpeado', fall: 'caer',
  death: 'caer', dying: 'caer', getup: 'levantarse', dizzy: 'mareado', victory: 'victoria', cheer: 'victoria',
  special: 'especial', cast: 'especial', throw: 'lanzar',
};

export async function loadSharedAnimations(onlyIfModels) {
  if (sharedClips || !onlyIfModels) return sharedClips || {};
  sharedClips = {};
  await Promise.all(Object.entries(ANIMACIONES).map(async ([key, url]) => {
    try {
      const a = await loadAsset(url);
      if (a.animations[0]) {
        const clip = a.animations[0].clone();
        clip.name = key;
        sharedClips[key] = clip;
        if (key === 'idle') {
          const t = clip.tracks.find((tr) => tr.name.endsWith('.position') && norm(tr.name.split('.')[0]) === 'hips');
          if (t) sharedHipsRef = t.values[1];
        }
      }
    } catch { /* archivo no existe todavía: se usa animación procedural */ }
  }));
  return sharedClips;
}

// Adapta un clip al esqueleto del modelo: renombra huesos, quita
// desplazamientos de raíz y escala la altura de la cadera.
function retarget(clip, boneMap, hipsRestY, refY, opts = {}) {
  const tracks = [];
  for (const tr of clip.tracks) {
    const dot = tr.name.lastIndexOf('.');
    const node = tr.name.slice(0, dot), prop = tr.name.slice(dot + 1);
    const n = norm(node);
    const target = boneMap.get(n);
    if (!target) continue;
    if (prop === 'quaternion') {
      const t = tr.clone(); t.name = `${target}.quaternion`; tracks.push(t);
    } else if (prop === 'position' && n === 'hips') {
      const t = tr.clone(); t.name = `${target}.position`;
      const v = t.values;
      const x0 = v[0], z0 = v[2];
      const ratio = refY && hipsRestY ? hipsRestY / refY : 1;
      for (let i = 0; i < v.length; i += 3) {
        v[i] = x0 * ratio; v[i + 2] = z0 * ratio;
        v[i + 1] = opts.lockY ? v[1] * ratio : v[i + 1] * ratio;
      }
      tracks.push(t);
    }
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

// ---------------------------------------------------------------------
//  Muñeco provisional (hasta que lleguen los modelos)
// ---------------------------------------------------------------------
function buildPlaceholder(def, tint) {
  const base = new THREE.Color(def.color);
  if (tint) base.offsetHSL(0.5, 0, 0.05);
  const gi = new THREE.MeshStandardMaterial({ color: base, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: base.clone().multiplyScalar(0.35), roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: '#d29a72', roughness: 0.6 });
  const black = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.5 });
  const eye = new THREE.MeshBasicMaterial({ color: '#ffffff' });

  const cap = (r, len, mat) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), mat);
    m.castShadow = true; return m;
  };
  const P = {};
  const hips = P.hips = new THREE.Group(); hips.position.y = 0.98;
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.22), dark); pelvis.castShadow = true; hips.add(pelvis);

  const torso = P.torso = new THREE.Group(); torso.position.y = 0.05; hips.add(torso);
  const chest = cap(0.17, 0.32, gi); chest.position.y = 0.3; chest.scale.set(1.3, 1, 0.8); torso.add(chest);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 8, 20), black); belt.rotation.x = Math.PI / 2; belt.scale.set(1.25, 0.85, 1); belt.position.y = 0.05; torso.add(belt);

  const head = P.head = new THREE.Group(); head.position.y = 0.6; torso.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.125, 20, 16), skin); skull.position.y = 0.13; skull.castShadow = true; head.add(skull);
  const mask = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), gi); mask.position.y = 0.13; head.add(mask);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.135, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), gi); hood.position.y = 0.13; head.add(hood);
  for (const sx of [-0.045, 0.045]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), eye); e.position.set(sx, 0.15, 0.115); head.add(e); }
  const neck = cap(0.055, 0.06, skin); neck.position.y = 0.0; head.add(neck);

  const arm = (side) => {
    const sh = new THREE.Group(); sh.position.set(side * 0.25, 0.5, 0); torso.add(sh);
    const up = cap(0.06, 0.2, gi); up.position.y = -0.14; sh.add(up);
    const el = new THREE.Group(); el.position.y = -0.29; sh.add(el);
    const fo = cap(0.05, 0.18, skin); fo.position.y = -0.12; el.add(fo);
    const wrap = cap(0.055, 0.06, black); wrap.position.y = -0.2; el.add(wrap);
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), skin); fist.position.y = -0.29; fist.castShadow = true; el.add(fist);
    return [sh, el];
  };
  // N = lado cercano a la cámara (x local negativa), F = lado lejano
  [P.shN, P.elN] = arm(-1);
  [P.shF, P.elF] = arm(1);

  const leg = (side) => {
    const hp = new THREE.Group(); hp.position.set(side * 0.1, -0.04, 0); hips.add(hp);
    const th = cap(0.08, 0.3, dark); th.position.y = -0.22; hp.add(th);
    const kn = new THREE.Group(); kn.position.y = -0.45; hp.add(kn);
    const sh = cap(0.065, 0.3, dark); sh.position.y = -0.2; kn.add(sh);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.24), black); foot.position.set(0, -0.44, 0.05); foot.castShadow = true; kn.add(foot);
    return [hp, kn];
  };
  [P.hipN, P.knN] = leg(-1);
  [P.hipF, P.knF] = leg(1);

  const g = new THREE.Group(); g.add(hips);
  return { object: g, parts: P, eyes: { bone: head, local: new THREE.Vector3(0, 0.15, 0.12) } };
}

// ---------------------------------------------------------------------
//  AUTO-RIG: esqueleto automático para modelos sin huesos (Meshy, Tripo…)
//  Requisitos: cuerpo completo, de pie, mirando a +Z, en pose T o A.
// ---------------------------------------------------------------------
const DOWN = new THREE.Vector3(0, -1, 0);

function distToSegment(px, py, pz, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = px - a.x, apy = py - a.y, apz = pz - a.z;
  const len2 = abx * abx + aby * aby + abz * abz || 1e-9;
  let t = (apx * abx + apy * aby + apz * abz) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ¿Es piel el color de la textura en (u, v)? Sirve para separar la mano del pantalón cuando se tocan.
function skinSampler(map) {
  const img = map?.image;
  if (!img || !img.width || typeof document === 'undefined') return null;
  const S = 256, c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  try { ctx.drawImage(img, 0, 0, S, S); } catch { return null; }
  const px = ctx.getImageData(0, 0, S, S).data;
  return (u, v) => {
    const x = Math.min(S - 1, Math.max(0, Math.floor((u - Math.floor(u)) * S)));
    const vv = v - Math.floor(v);
    const y = Math.min(S - 1, Math.max(0, Math.floor((map.flipY ? 1 - vv : vv) * S)));
    const i = (y * S + x) * 4, r = px[i], g = px[i + 1], b = px[i + 2];
    // piel: rojo > verde > azul, pero con bastante verde (una tela roja casi no tiene)
    return r > 90 && g > 0.42 * r && g < 0.92 * r && b < g * 1.05 && r - b > 20;
  };
}

// Agrupa los puntos (x,z intercalados) de una rebanada por cercanía en x
function clusterSlice(bin, gap) {
  const n = bin.length / 2;
  if (!n) return [];
  const idx = Array.from({ length: n }, (_, i) => i).sort((i, j) => bin[i * 2] - bin[j * 2]);
  const out = [];
  let cur = null;
  for (const i of idx) {
    const x = bin[i * 2], z = bin[i * 2 + 1];
    if (!cur || x - cur.max > gap) { cur = { min: x, max: x, n: 0, sx: 0, sz: 0, minZ: z, maxZ: z }; out.push(cur); }
    cur.max = x; cur.n++; cur.sx += x; cur.sz += z;
    if (z < cur.minZ) cur.minZ = z; if (z > cur.maxZ) cur.maxZ = z;
  }
  for (const c of out) { c.mx = c.sx / c.n; c.mz = c.sz / c.n; }
  return out;
}

export function autoRig(obj, height) {
  obj.updateMatrixWorld(true);
  const meshes = [];
  obj.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh) meshes.push(o); });
  if (!meshes.length) return null;

  // 1) Geometría al espacio del modelo: pies en y=0, centrado y con la altura deseada
  const geos = meshes.map((m) => { const g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld); return g; });
  const box = new THREE.Box3();
  for (const g of geos) { g.computeBoundingBox(); box.union(g.boundingBox); }
  const H = height;
  const s = H / ((box.max.y - box.min.y) || 1);
  const fix = new THREE.Matrix4().makeScale(s, s, s).multiply(new THREE.Matrix4().makeTranslation(
    -(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2));
  for (const g of geos) { g.applyMatrix4(fix); g.computeBoundingSphere(); }

  // 2) Nube de puntos repartida por toda la superficie (no por vértices: así funciona
  //    igual con modelos pesados o reducidos) y agrupada en rebanadas horizontales
  const NB = 120;
  const bins = Array.from({ length: NB }, () => []);
  const pts = [];
  const tris = [];
  let area = 0;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  for (const g of geos) {
    const p = g.attributes.position, idx = g.index;
    const n = idx ? idx.count : p.count;
    for (let i = 0; i < n; i += 3) {
      const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
      A.fromBufferAttribute(p, ia); B.fromBufferAttribute(p, ib); C.fromBufferAttribute(p, ic);
      area += B.sub(A).cross(C.sub(A)).length() / 2;
      tris.push(p, ia, ib, ic, area);
    }
  }
  let seed = 12345;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const SAMPLES = 120000, ntri = tris.length / 5;
  for (let s = 0; s < SAMPLES; s++) {
    const target = rnd() * area;
    let lo = 0, hi = ntri - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tris[mid * 5 + 4] < target) lo = mid + 1; else hi = mid; }
    const p = tris[lo * 5];
    A.fromBufferAttribute(p, tris[lo * 5 + 1]); B.fromBufferAttribute(p, tris[lo * 5 + 2]); C.fromBufferAttribute(p, tris[lo * 5 + 3]);
    let u = rnd(), v = rnd();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const x = A.x + (B.x - A.x) * u + (C.x - A.x) * v;
    const y = A.y + (B.y - A.y) * u + (C.y - A.y) * v;
    const z = A.z + (B.z - A.z) * u + (C.z - A.z) * v;
    const b = Math.min(NB - 1, Math.max(0, Math.floor(y / H * NB)));
    bins[b].push(x, z); pts.push(x, y, z);
  }
  const binAt = (y) => bins[Math.min(NB - 1, Math.max(0, Math.floor(y / H * NB)))];
  const clamp = THREE.MathUtils.clamp;

  // Entrepierna: donde la profundidad del cuerpo en el centro (x≈0) alcanza la de la cadera.
  // Funciona aunque las piernas del pantalón se toquen.
  let crotchY = null;
  const ratio = (b) => {
    const bin = bins[b];
    let cmin = Infinity, cmax = -Infinity, bmin = Infinity, bmax = -Infinity;
    for (let k = 0; k < bin.length; k += 2) {
      const x = bin[k], z = bin[k + 1];
      if (Math.abs(x) < 0.015 * H) { if (z < cmin) cmin = z; if (z > cmax) cmax = z; }
      if (Math.abs(x) < 0.2 * H) { if (z < bmin) bmin = z; if (z > bmax) bmax = z; }
    }
    return cmax > cmin && bmax > bmin ? (cmax - cmin) / (bmax - bmin) : 0;
  };
  for (let b = Math.floor(0.3 * NB); b < Math.floor(0.6 * NB); b++) {
    if (ratio(b) >= 0.95 && ratio(b + 1) >= 0.95) { crotchY = b / NB * H; break; }
  }
  crotchY = clamp(crotchY ?? 0.47 * H, 0.4 * H, 0.54 * H);

  const centralZ = (y, fallback = 0) => {
    const cl = clusterSlice(binAt(y), 0.01 * H).filter((c) => c.min < 0.02 * H && c.max > -0.02 * H);
    return cl.length ? cl.sort((a, b) => b.n - a.n)[0].mz : fallback;
  };
  const torsoZ = centralZ(0.68 * H);
  const chest = clusterSlice(binAt(0.66 * H), 0.008 * H).find((c) => c.min < 0 && c.max > 0);
  const torsoHalf = clamp(chest ? (chest.max - chest.min) / 2 : 0.1 * H, 0.07 * H, 0.13 * H);

  // Manos: los puntos más extremos en x por encima de la cadera
  const tipN = new THREE.Vector3(-torsoHalf, 0.45 * H, torsoZ), tipF = new THREE.Vector3(torsoHalf, 0.45 * H, torsoZ);
  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i], y = pts[i + 1], z = pts[i + 2];
    if (y < crotchY - 0.12 * H || y > 0.86 * H) continue;
    if (x < minX) { minX = x; tipN.set(x, y, z); }
    if (x > maxX) { maxX = x; tipF.set(x, y, z); }
  }
  // Brazos pegados al cuerpo (chamarras abultadas): lo más ancho puede ser la manga y no la mano.
  // Se sigue el brazo hacia abajo mientras siga por fuera de la pierna. Como el brazo toca el
  // cuerpo, en cada rebanada se guarda dónde empieza el brazo (su borde exterior menos su grueso)
  // para separar sin mezcla brazo y cuerpo en el paso 4: si se mezclan, se estiran como una sábana.
  const hangs = {};
  const followHand = (tip, side) => {
    if (tip.x * side > 0.24 * H) return;   // pose en A o en T: la punta ya es la mano
    let legOuter = 0;
    const lb = binAt(crotchY - 0.1 * H);
    for (let k = 0; k < lb.length; k += 2) legOuter = Math.max(legOuter, lb[k] * side);
    const outer = new Float32Array(NB);
    for (let b = 0; b < NB; b++) for (let k = 0; k < bins[b].length; k += 2) outer[b] = Math.max(outer[b], bins[b][k] * side);
    const handTop = tip.y;
    let cx = tip.x * side;
    for (let b = Math.floor(tip.y / H * NB) - 1; b > 0.25 * NB; b--) {
      const bin = bins[b];
      let sx = 0, sz = 0, n = 0;
      for (let k = 0; k < bin.length; k += 2) {
        const ax = bin[k] * side;
        if (ax > legOuter + 0.01 * H && Math.abs(ax - cx) < 0.05 * H) { sx += ax; sz += bin[k + 1]; n++; }
      }
      if (n < 3) break;
      cx = sx / n;
      tip.set(side * cx, (b + 0.5) / NB * H, sz / n);
    }
    // grueso: el de la mano abajo (se mide en la punta, y nunca entra en la pierna) y el de la manga arriba
    const handDiam = clamp(2.2 * (outer[Math.min(NB - 1, Math.floor(tip.y / H * NB))] - tip.x * side), 0.03 * H, 0.06 * H);
    const inner = outer.map((o, b) => ((b + 0.5) / NB * H < handTop ? Math.max(o - handDiam, legOuter + 0.005 * H) : o - 0.075 * H));
    hangs[side] = { inner, tipY: tip.y, handTop, legOuter };
  };
  followHand(tipN, -1); followHand(tipF, 1);
  // Hombros: la articulación queda un poco por debajo de lo más alto del hombro,
  // justo encima del costado del torso.
  const armAxis = (tip, side) => {
    let top = -Infinity, sz = 0, nz = 0;
    for (let i = 0; i < pts.length; i += 3) {
      const ax = pts[i] * side, y = pts[i + 1];
      if (ax > torsoHalf * 0.9 && ax < torsoHalf * 1.15 && y < 0.9 * H && y > top) top = y;
    }
    for (let i = 0; i < pts.length; i += 3) {
      const ax = pts[i] * side, y = pts[i + 1];
      if (ax > torsoHalf * 0.9 && ax < torsoHalf * 1.15 && y > top - 0.06 * H && y < 0.9 * H) { sz += pts[i + 2]; nz++; }
    }
    let sy = top > 0 ? top - 0.035 * H : 0.81 * H;
    if (Math.abs(tip.y - 0.81 * H) < 0.06 * H) sy = tip.y;                // pose en T
    sy = clamp(sy, 0.74 * H, 0.86 * H);
    sz = nz ? sz / nz : torsoZ;
    return new THREE.Vector3(side * torsoHalf * 0.95, sy, clamp(sz, torsoZ - 0.05 * H, torsoZ + 0.05 * H));
  };
  const SN = armAxis(tipN, -1), SF = armAxis(tipF, 1);
  const shoulderY = (SN.y + SF.y) / 2, shoulderX = (SF.x - SN.x) / 2, armpitY = null;
  const EN = SN.clone().lerp(tipN, 0.43), EF = SF.clone().lerp(tipF, 0.43);

  // Piernas: centro de cada lado (sirve aunque las piernas se toquen)
  const legPoint = (y, side, fallbackX) => {
    const bin = binAt(y);
    let sx = 0, sz = 0, n = 0;
    for (let k = 0; k < bin.length; k += 2) {
      const x = bin[k];
      if (x * side > 0.002 * H && Math.abs(x) < 0.2 * H) { sx += x; sz += bin[k + 1]; n++; }
    }
    return n > 3 ? new THREE.Vector3(sx / n, y, sz / n) : new THREE.Vector3(fallbackX, y, torsoZ);
  };
  const hipJY = crotchY + 0.035 * H;
  const upN = legPoint(crotchY - 0.04 * H, -1, -0.055 * H), upF = legPoint(crotchY - 0.04 * H, 1, 0.055 * H);
  const HN = new THREE.Vector3(upN.x, hipJY, upN.z), HF = new THREE.Vector3(upF.x, hipJY, upF.z);
  const KN = legPoint(0.285 * H, -1, upN.x), KF = legPoint(0.285 * H, 1, upF.x);
  const AN = legPoint(0.05 * H, -1, KN.x), AF = legPoint(0.05 * H, 1, KF.x);

  const pelvisY = crotchY + 0.06 * H, torsoY = crotchY + 0.12 * H;
  const neckY = clamp(shoulderY + 0.05 * H, 0.84 * H, 0.9 * H);
  const zPelvis = centralZ(pelvisY, torsoZ), zTorso = centralZ(torsoY, torsoZ), zNeck = centralZ(neckY, torsoZ), zHead = centralZ(0.93 * H, torsoZ);
  // Ojos: la cara es lo más adelantado de la cabeza a la altura de los ojos
  let zFace = zHead;
  { const bin = binAt(0.935 * H); for (let k = 0; k < bin.length; k += 2) if (Math.abs(bin[k]) < 0.04 * H && bin[k + 1] > zFace) zFace = bin[k + 1]; }

  // 3) Huesos (identidad = brazos/piernas hacia abajo, como el muñeco provisional)
  const bone = (name) => { const b = new THREE.Bone(); b.name = 'ar_' + name; return b; };
  const hips = bone('hips'); hips.position.set(0, pelvisY, zPelvis);
  const torso = bone('torso'); torso.position.set(0, torsoY - pelvisY, zTorso - zPelvis); hips.add(torso);
  const head = bone('head'); head.position.set(0, neckY - torsoY, zNeck - zTorso); torso.add(head);
  const torsoW = new THREE.Vector3(0, torsoY, zTorso);
  const arm = (S, E, T, side) => {
    const sh = bone('sh' + side); torso.add(sh);
    sh.position.copy(S).sub(torsoW);
    sh.quaternion.setFromUnitVectors(DOWN, T.clone().sub(S).normalize());
    const el = bone('el' + side); sh.add(el); el.position.set(0, -S.distanceTo(E), 0);
    return [sh, el];
  };
  const [shN, elN] = arm(SN, EN, tipN, 'N');
  const [shF, elF] = arm(SF, EF, tipF, 'F');
  const hipsW = new THREE.Vector3(0, pelvisY, zPelvis);
  const leg = (Hj, K, A, side) => {
    const hp = bone('hip' + side); hips.add(hp);
    hp.position.copy(Hj).sub(hipsW);
    const dir = K.clone().sub(Hj).normalize();
    hp.quaternion.setFromUnitVectors(DOWN, dir);
    const kn = bone('kn' + side); hp.add(kn); kn.position.set(0, -Hj.distanceTo(K), 0);
    kn.quaternion.setFromUnitVectors(DOWN, A.clone().sub(K).normalize().applyQuaternion(hp.quaternion.clone().invert()));
    return [hp, kn, Math.atan2(dir.x, -dir.y)];
  };
  const [hipN, knN, abdN] = leg(HN, KN, AN, 'N');
  const [hipF, knF, abdF] = leg(HF, KF, AF, 'F');

  // Nalgas: hueso propio detrás de la cadera (para los ataques de José se pueden inflar)
  const buttY = crotchY + 0.045 * H;
  let backZ = Infinity, chestBack = Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i], y = pts[i + 1], z = pts[i + 2];
    if (Math.abs(x) < 0.08 * H && Math.abs(y - buttY) < 0.02 * H && z < backZ) backZ = z;
    if (Math.abs(x) < 0.06 * H && Math.abs(y - 0.68 * H) < 0.02 * H && z < chestBack) chestBack = z;
  }
  if (!isFinite(backZ)) backZ = zPelvis - 0.07 * H;
  if (!isFinite(chestBack)) chestBack = zTorso - 0.07 * H;
  const butt = bone('butt'); hips.add(butt);
  butt.position.set(0, buttY - pelvisY, backZ + 0.05 * H - zPelvis);

  // 4) Pesos: cada vértice sigue a los huesos más cercanos (distancia / grosor del hueso)
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const segs = [
    { b: hips, a: V(0, crotchY + 0.01 * H, zPelvis), e: V(0, torsoY, zTorso), r: 0.09 * H, hips: true, core: true },
    { b: torso, a: V(0, torsoY, zTorso), e: V(0, neckY, zNeck), r: 0.1 * H, core: true },
    { b: head, a: V(0, neckY, zNeck), e: V(0, 0.97 * H, zHead), r: 0.075 * H, core: true },
    { b: shN, a: SN, e: EN, r: 0.06 * H, side: -1, arm: true }, { b: elN, a: EN, e: tipN, r: 0.045 * H, side: -1, arm: true },
    { b: shF, a: SF, e: EF, r: 0.06 * H, side: 1, arm: true }, { b: elF, a: EF, e: tipF, r: 0.045 * H, side: 1, arm: true },
    { b: hipN, a: HN, e: KN, r: 0.055 * H, side: -1, leg: true }, { b: knN, a: KN, e: AN.clone().setY(0.02 * H), r: 0.045 * H, side: -1, leg: true },
    { b: hipF, a: HF, e: KF, r: 0.055 * H, side: 1, leg: true }, { b: knF, a: KF, e: AF.clone().setY(0.02 * H), r: 0.045 * H, side: 1, leg: true },
    { b: butt, a: V(-0.065 * H, buttY, backZ + 0.035 * H), e: V(0.065 * H, buttY, backZ + 0.035 * H), r: 0.055 * H, butt: true },
  ];
  const boneList = [hips, torso, head, shN, elN, shF, elF, hipN, knN, hipF, knF, butt];
  segs.forEach((sg) => { sg.i = boneList.indexOf(sg.b); });
  const sideTol = 0.004 * H, legTop = crotchY + 0.08 * H;
  const sc = new Float32Array(segs.length);
  geos.forEach((g, gi) => {
    const a = g.attributes.position.array, n = a.length / 3;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    const zones = new Int8Array(n);
    const isSkin = (hangs[-1] || hangs[1]) && g.attributes.uv ? skinSampler([].concat(meshes[gi].material)[0]?.map) : null;
    for (let v = 0; v < n; v++) {
      const x = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2];
      const lateral = Math.abs(x) > torsoHalf + 0.012 * H && y > crotchY + 0.05 * H;
      // brazo colgando: 1 = es brazo, -1 = es cuerpo (sin mezcla)
      const hs = x < 0 ? -1 : 1, hg = hangs[hs];
      let zone = 0;
      if (hg && y < (hs < 0 ? SN : SF).y - 0.04 * H) {
        // debajo de la mano ya nada es brazo
        zone = y > hg.tipY - 0.02 * H && x * hs >= hg.inner[Math.min(NB - 1, Math.max(0, Math.floor(y / H * NB)))] ? 1 : -1;
        // donde la mano toca el muslo decide el color: la piel es de la mano
        if (zone === -1 && isSkin && y > hg.tipY - 0.02 * H && y < hg.handTop && x * hs > hg.legOuter - 0.02 * H &&
          isSkin(g.attributes.uv.getX(v), g.attributes.uv.getY(v))) zone = 1;
      }
      zones[v] = zone;
      let best = Infinity;
      for (let k = 0; k < segs.length; k++) {
        const sg = segs[k];
        if ((sg.side && x * sg.side < -sideTol) || (sg.leg && y > legTop)) { sc[k] = Infinity; continue; }
        const ownArm = sg.arm && sg.side === hs;
        if ((zone === 1 && !ownArm) || (zone === -1 && ownArm)) { sc[k] = Infinity; continue; }
        // las nalgas: solo la parte de atrás, entre los muslos y la cintura
        if (sg.butt && (z > zPelvis - 0.01 * H || y < crotchY - 0.05 * H || y > torsoY + 0.01 * H)) { sc[k] = Infinity; continue; }
        let d = distToSegment(x, y, z, sg.a, sg.e) / sg.r;
        if (sg.hips && y < crotchY) d *= 2;
        // fuera del ancho del torso (y por encima de la cadera) solo pueden estar los brazos
        if (sg.core && lateral) d *= 3;
        if (sg.arm && Math.abs(x) < torsoHalf * 0.6) d *= 3;
        sc[k] = d; if (d < best) best = d;
      }
      // las 4 mejores, con mezcla suave en las articulaciones
      const top = [];
      for (let k = 0; k < segs.length; k++) {
        if (sc[k] === Infinity) continue;
        const w = Math.exp(-6 * (sc[k] - best));
        if (w < 0.01) continue;
        top.push([segs[k].i, w]);
      }
      top.sort((p, q) => q[1] - p[1]);
      let sum = 0; for (let j = 0; j < Math.min(4, top.length); j++) sum += top[j][1];
      for (let j = 0; j < Math.min(4, top.length); j++) { si[v * 4 + j] = top[j][0]; sw[v * 4 + j] = top[j][1] / sum; }
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    // brazo colgando: los triángulos que unen brazo y cuerpo se estirarían como una sábana al mover
    // el brazo. Cada uno se queda entero del lado que tiene más vértices (con vértices duplicados):
    // quieto se ve igual y al moverse se abre un hueco limpio (por eso se pintan las dos caras).
    if (g.index && (hangs[-1] || hangs[1])) {
      const ix = Array.from(g.index.array), dup = [];   // pares [vértice, donador de pesos]
      for (let t = 0; t < ix.length; t += 3) {
        const zs = [zones[ix[t]], zones[ix[t + 1]], zones[ix[t + 2]]];
        if (Math.max(...zs) !== 1 || Math.min(...zs) !== -1) continue;
        const keepZone = zs.filter((z) => z === 1).length >= 2 ? 1 : -1;
        const donor = ix[t + zs.indexOf(keepZone)];
        for (let j = 0; j < 3; j++) if (zs[j] !== keepZone) { dup.push(ix[t + j], donor); ix[t + j] = n + dup.length / 2 - 1; }
      }
      for (const [name, attr] of Object.entries(g.attributes)) {
        const k = attr.itemSize, arr = new attr.array.constructor((n + dup.length / 2) * k);
        arr.set(attr.array);
        const skin = name === 'skinIndex' || name === 'skinWeight';
        for (let d = 0; d < dup.length; d += 2) {
          const src = skin ? dup[d + 1] : dup[d];
          for (let c = 0; c < k; c++) arr[(n + d / 2) * k + c] = attr.array[src * k + c];
        }
        g.setAttribute(name, new THREE.BufferAttribute(arr, k, attr.normalized));
      }
      g.setIndex(ix);
    }
  });
  if (hangs[-1] || hangs[1]) for (const m of meshes) for (const mat of [].concat(m.material)) mat.side = THREE.DoubleSide;

  // 5) Mallas con piel
  const group = new THREE.Group();
  group.add(hips);
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(boneList);
  const skinned = geos.map((g, i) => {
    const sm = new THREE.SkinnedMesh(g, meshes[i].material);
    sm.castShadow = true; sm.frustumCulled = false;
    group.add(sm);
    sm.bind(skeleton);
    return sm;
  });
  const eyeLocal = new THREE.Vector3(0, 0.935 * H, zFace + 0.005 * H).sub(new THREE.Vector3(0, neckY, zNeck));
  return {
    group, skinned,
    parts: { hips, torso, head, shN, elN, shF, elF, hipN, knN, hipF, knF, butt },
    rig: {
      pelvisY, spread: 0.13, abdN, abdF, H, hang: !!(hangs[-1] || hangs[1]),
      // dónde van los accesorios (guantes en las manos, jetpack en la espalda)
      handN: new THREE.Vector3(0, -EN.distanceTo(tipN) * 0.8, 0), handF: new THREE.Vector3(0, -EF.distanceTo(tipF) * 0.8, 0),
      back: new THREE.Vector3(0, (neckY - torsoY) * 0.55, chestBack - zTorso - 0.02 * H),
    },
    eyes: { bone: head, local: eyeLocal },
    debug: { crotchY, armpitY, shoulderY, shoulderX, tipN, tipF, KN, KF },
  };
}

// ---------------------------------------------------------------------
//  Poses procedurales
// ---------------------------------------------------------------------
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
// Curva de extensión de un golpe: sube durante el arranque, se mantiene en frames activos y baja en la recuperación
function ext(a) {
  if (!a.total) return 0;
  const p = a.t / a.total;
  if (p < a.s) return clamp01(p / a.s) ** 0.6;
  if (p < a.a) return 1;
  return 1 - clamp01((p - a.a) / (1 - a.a)) ** 1.4;
}

const GUARD = { hipsY: 0.93, hipsX: 0, torsoX: 0.1, torsoY: 0.35, torsoZ: 0, headX: 0, spin: 0, tilt: 0,
  shNX: -1.0, shNZ: 0.1, elNX: -1.8, shFX: -0.8, shFZ: -0.1, elFX: -2.0,
  hipNX: -0.35, knNX: 0.55, hipFX: 0.25, knFX: 0.4 };

// Poses extra de los especiales (Alan, Gera, José). spin = PI: de espaldas al rival.
function extraPose(a, P, e, t) {
  switch (a.key) {
    case 'jet_sube':
      Object.assign(P, { hipsY: 0.98, torsoX: -0.1, torsoY: 0, shNX: 0.25, shNZ: -0.35, elNX: -0.3, shFX: 0.25, shFZ: 0.35, elFX: -0.3, hipNX: 0.05, knNX: 0.15, hipFX: 0.1, knFX: 0.3 }); return true;
    case 'jet_cae':
      Object.assign(P, { tilt: 1.15, torsoX: 0, torsoY: 0, headX: -0.6, shNX: -2.9, shNZ: 0.15, elNX: 0, shFX: -2.9, shFZ: -0.15, elFX: 0, hipNX: 0.15, knNX: 0.1, hipFX: 0.15, knFX: 0.1 }); return true;
    case 'turbina':
      Object.assign(P, { torsoY: 0, torsoX: 0.15, shNX: -1.5, shNZ: 0.25, elNX: -0.5, shFX: -1.5, shFZ: -0.25, elFX: -0.5, hipNX: -0.75, knNX: 1.0, hipFX: 0.35, knFX: 0.3, hipsY: 0.88 });
      P.torsoZ = Math.sin(t * 1.3) * 0.03; return true;
    case 'orbital':
      Object.assign(P, { torsoY: 0, torsoX: -0.15, headX: -0.5, shFX: lerp(-0.8, -3.0, e), shFZ: -0.15, elFX: lerp(-2.0, -0.1, e), shNX: -1.1, elNX: -1.7 }); return true;
    case 'rafaga': {
      const k = Math.floor(t / 5), s = Math.sin((t % 5) / 5 * Math.PI);
      if (k % 2) { P.shNX = lerp(-1.0, -1.6, s); P.elNX = lerp(-1.8, -0.05, s); P.torsoY = lerp(0.35, -0.1, s); }
      else { P.shFX = lerp(-0.8, -1.6, s); P.elFX = lerp(-2.0, -0.05, s); P.torsoY = lerp(0.35, -0.45, s); }
      P.hipsY = 0.9 + Math.sin(t * 0.6) * 0.01; return true;
    }
    case 'resorte':
      Object.assign(P, { shFX: lerp(-0.8, -1.6, e), elFX: lerp(-2.0, 0, e), torsoY: lerp(0.35, -0.7, e), torsoX: 0.2, hipNX: -0.7, knNX: 0.9, hipsY: 0.88 }); return true;
    case 'contra':
      Object.assign(P, { shNX: -1.3, shNZ: 0.3, elNX: -2.2, shFX: -1.25, shFZ: -0.3, elFX: -2.3, torsoX: 0.25, torsoY: 0.2, hipsY: 0.86, knNX: 0.8, knFX: 0.7 });
      P.torsoZ = Math.sin(t * 0.35) * 0.12; return true;
    case 'culazo':
      Object.assign(P, { spin: Math.PI, torsoX: 0.95, torsoY: 0, headX: -0.5, shNX: 0.7, shNZ: -0.3, elNX: -0.4, shFX: 0.7, shFZ: 0.3, elFX: -0.4, hipNX: -0.35, knNX: 0.5, hipFX: -0.2, knFX: 0.4, hipsY: 0.9 }); return true;
    case 'senton':
      Object.assign(P, { torsoX: -0.25, torsoY: 0, headX: 0.2, shNX: -2.6, shNZ: 0.4, elNX: -0.3, shFX: -2.6, shFZ: -0.4, elFX: -0.3, hipNX: -1.55, knNX: 1.55, hipFX: -1.55, knFX: 1.55, hipsY: 0.9 }); return true;
    case 'senton_suelo':
      Object.assign(P, { torsoX: -0.2, torsoY: 0, shNX: -0.3, shNZ: 0.6, elNX: -0.2, shFX: -0.3, shFZ: -0.6, elFX: -0.2, hipNX: -1.55, knNX: 0.3, hipFX: -1.55, knFX: 0.3, hipsY: 0.24 }); return true;
    case 'twerk': {
      const w = Math.sin(t * 1.25);
      Object.assign(P, { spin: Math.PI, torsoX: 0.75, torsoY: 0, headX: -0.4, shNX: -0.9, shNZ: 0.1, elNX: -0.15, shFX: -0.9, shFZ: -0.1, elFX: -0.15, hipNX: -0.95, knNX: 1.35, hipFX: -0.95, knFX: 1.35, hipsY: 0.78 });
      P.hipsX = w * 0.22; P.torsoZ = w * 0.05; return true;
    }
    case 'gas':
      Object.assign(P, { spin: Math.PI, torsoX: lerp(0.3, 1.15, e), torsoY: 0, headX: -0.6, shNX: -0.7, elNX: -0.2, shFX: -0.7, elFX: -0.2, hipNX: -0.4, knNX: 0.45, hipFX: -0.3, knFX: 0.4, hipsY: 0.92 }); return true;
    // Alan: pose de JoJo (de tres cuartos hacia la cámara, una mano en la cara y la otra señalando)
    case 'jojo': {
      const k = clamp01(t / 10);
      Object.assign(P, { spin: -0.75 * k, hipsY: 0.9, torsoX: -0.25 * k, torsoY: -0.35 * k, torsoZ: 0.18 * k, headX: -0.18 * k,
        shFX: lerp(-0.8, -1.35, k), shFZ: -0.15, elFX: lerp(-2.0, -0.05, k),
        shNX: lerp(-1.0, -2.55, k), shNZ: 0.55 * k, elNX: lerp(-1.8, -2.35, k),
        hipNX: lerp(-0.35, -0.55, k), knNX: lerp(0.55, 0.35, k), hipFX: lerp(0.25, 0.35, k), knFX: lerp(0.4, 0.6, k) });
      P.torsoZ += Math.sin(t * 0.12) * 0.015;
      return true;
    }
    // Diego con el traje de robot
    case 'canon':      // apunta el brazo como cañón; al disparar el retroceso lo echa un poco atrás
      Object.assign(P, { torsoY: -0.5, torsoX: lerp(0.08, -0.12, e), headX: -0.05, shFX: -1.55, shFZ: -0.05, elFX: -0.05, shNX: -1.2, shNZ: 0.25, elNX: -1.5,
        hipNX: -0.55, knNX: 0.7, hipFX: 0.35, knFX: 0.45, hipsY: 0.88 }); return true;
    case 'propulsor':  // se lanza casi acostado, con los brazos hacia atrás
      Object.assign(P, { torsoX: 1.05, torsoY: 0, headX: -0.7, shNX: 0.55, shNZ: 0.25, elNX: -0.1, shFX: 0.55, shFZ: -0.25, elFX: -0.1, hipNX: 0.35, knNX: 0.5, hipFX: 0.6, knFX: 0.7, hipsY: 0.72 });
      return true;
    case 'descarga':   // brazos abiertos, temblando por la electricidad
      Object.assign(P, { torsoX: -0.15, torsoY: 0, headX: -0.25, shNX: -0.4, shNZ: 1.25, elNX: -0.3, shFX: -0.4, shFZ: -1.25, elFX: -0.3, hipNX: -0.45, knNX: 0.6, hipFX: 0.35, knFX: 0.5, hipsY: 0.88 });
      P.torsoZ = Math.sin(t * 2.3) * 0.04; P.shNZ += Math.sin(t * 3.1) * 0.08; P.shFZ -= Math.sin(t * 2.7) * 0.08; return true;
    // Conde
    case 'flexion':   // pose de fisicoculturista temblando de fuerza mientras crece
      Object.assign(P, { torsoX: 0.3, torsoY: 0, headX: -0.15, shNX: -0.5, shNZ: 0.55, elNX: -1.7, shFX: -0.5, shFZ: -0.55, elFX: -1.7, hipNX: -0.45, knNX: 0.7, hipFX: 0.25, knFX: 0.55, hipsY: 0.86 });
      P.torsoZ = Math.sin(t * 1.7) * 0.025; return true;
    case 'agarrar':
      Object.assign(P, { torsoX: 0.25, torsoY: 0, shNX: -1.45, shNZ: 0.25, elNX: -0.35, shFX: -1.45, shFZ: -0.25, elFX: -0.35, hipNX: -0.6, knNX: 0.8, hipsY: 0.88 }); return true;
    case 'levantar':
      Object.assign(P, { torsoX: -0.2, torsoY: 0, headX: -0.3, shNX: -2.9, shNZ: 0.2, elNX: -0.5, shFX: -2.9, shFZ: -0.2, elFX: -0.5, hipNX: -0.35, knNX: 0.45, hipFX: 0.3, knFX: 0.4, hipsY: 0.92 }); return true;
    case 'pisar_arriba':
      Object.assign(P, { torsoX: -0.25, torsoY: 0, shNX: -0.4, shNZ: -0.6, elNX: -0.6, shFX: -0.4, shFZ: 0.6, elFX: -0.6, hipNX: -1.7, knNX: 1.5, hipFX: 0.1, knFX: 0.15, hipsY: 0.97 }); return true;
    case 'pisar':
      Object.assign(P, { torsoX: 0.3, torsoY: 0, shNX: -0.6, shNZ: -0.3, elNX: -1.2, shFX: -0.6, shFZ: 0.3, elFX: -1.2, hipNX: -0.75, knNX: 0.15, hipFX: 0.45, knFX: 0.5, hipsY: 0.84 }); return true;
    // Emi
    case 'silbido':   // chifla con los dedos y alza la otra mano: ¡que lluevan pescados!
      Object.assign(P, { torsoX: -0.15, torsoY: 0.1, headX: -0.25, shNX: -1.25, shNZ: 0.45, elNX: -2.45, shFX: -2.95, shFZ: -0.15, elFX: -0.25, hipNX: -0.25, knNX: 0.3, hipFX: 0.2, knFX: 0.3, hipsY: 0.96 });
      P.elFX += Math.sin(t * 0.6) * 0.25; return true;
    case 'chela':     // agita la caguama y luego la apunta al rival
      Object.assign(P, { torsoX: 0.12, torsoY: -0.2, shFX: -1.45, shFZ: -0.1, elFX: -0.15, shNX: -0.6, shNZ: 0.3, elNX: -1.9, hipNX: -0.5, knNX: 0.7, hipFX: 0.3, knFX: 0.5, hipsY: 0.9 });
      if (t < 14) { P.shFX = -1.0; P.elFX = -1.2 + Math.sin(t * 2.2) * 0.6; }
      return true;
  }
  return false;
}

export function proceduralPose(a) {
  const t = a.t, e = ext(a), p = a.total ? clamp01(a.t / a.total) : 0;
  const P = { ...GUARD };
  const crouch = () => Object.assign(P, { hipsY: 0.56, hipNX: -1.45, knNX: 2.2, hipFX: -0.95, knFX: 2.1, torsoX: 0.35 });
  if (extraPose(a, P, e, t)) return P;
  switch (a.key) {
    case 'idle': {
      // guardia de peleador: rebota suave sobre las puntas, respira y mueve un poco los puños
      const b = Math.sin(t * 0.123), b2 = Math.sin(t * 0.123 - 0.6);
      P.hipsY += b * 0.016;
      P.knNX -= b * 0.09; P.knFX -= b * 0.08; P.hipNX += b * 0.05; P.hipFX += b * 0.04;
      P.torsoX += b2 * 0.025; P.torsoY += Math.sin(t * 0.045) * 0.05; P.headX -= b2 * 0.03;
      P.shNX += b2 * 0.05; P.elNX += Math.sin(t * 0.123 + 1.2) * 0.07;
      P.shFX += b2 * 0.04; P.elFX += Math.sin(t * 0.123 + 2.0) * 0.06;
      break;
    }
    case 'caminar': case 'caminar_atras': {
      const ph = t * 0.22 * (a.key === 'caminar' ? 1 : -1), s = Math.sin(ph), c = Math.cos(ph);
      P.hipNX = -0.3 + s * 0.45; P.knNX = 0.4 + Math.max(0, -s) * 0.8;
      P.hipFX = -0.1 - s * 0.45; P.knFX = 0.4 + Math.max(0, s) * 0.8;
      P.hipsY = 0.93 + Math.abs(c) * 0.025;      // arriba al cruzar las piernas, abajo al apoyar
      P.torsoY += s * 0.07; P.torsoZ = c * 0.025;  // los hombros giran y el cuerpo se balancea
      P.shNX -= s * 0.08; P.shFX += s * 0.08;      // los puños acompañan el paso
      break;
    }
    case 'agacharse': crouch(); break;
    case 'saltar': Object.assign(P, { hipNX: -1.3, knNX: 2.1, hipFX: -0.9, knFX: 1.9, shNX: -1.4, shFX: -1.2 }); P.spin = a.flip ? -p * Math.PI * 2 : 0; break;
    case 'bloqueo': Object.assign(P, { shNX: -1.45, elNX: -2.1, shFX: -1.35, elFX: -2.2, shNZ: 0.35, shFZ: -0.35, torsoX: -0.05, torsoY: 0.1 }); break;
    case 'bloqueo_bajo': crouch(); Object.assign(P, { shNX: -1.45, elNX: -2.1, shFX: -1.35, elFX: -2.2, shNZ: 0.35, shFZ: -0.35 }); break;
    case 'puno':
      P.shNX = lerp(-1.0, -1.6, e); P.elNX = lerp(-1.8, -0.05, e); P.torsoY = lerp(0.35, -0.15, e); P.hipNX = lerp(-0.35, -0.6, e); break;
    case 'puno_fuerte':
      P.shFX = lerp(-0.8, -1.6, e); P.elFX = lerp(-2.0, -0.05, e); P.torsoY = lerp(0.35, -0.75, e); P.torsoX = lerp(0.1, 0.3, e);
      P.hipNX = lerp(-0.35, -0.8, e); P.knNX = lerp(0.55, 0.9, e); P.hipsY = lerp(0.93, 0.86, e); break;
    case 'patada':
      P.hipNX = lerp(-0.35, -1.65, e); P.knNX = lerp(0.55, 0.05, e); P.torsoX = lerp(0.1, -0.45, e); P.hipFX = lerp(0.25, 0.05, e); P.knFX = 0.2; break;
    case 'patada_giratoria':
      P.spin = -Math.min(1, p / a.a) * Math.PI * 2; P.hipFX = lerp(0.25, -1.5, e); P.knFX = lerp(0.4, 0.05, e); P.torsoX = lerp(0.1, -0.5, e); break;
    case 'gancho_arriba':
      if (a.t / a.total < a.s) { crouch(); P.shFX = -0.4; P.elFX = -1.6; }
      else { P.shFX = lerp(-0.8, -3.0, e); P.elFX = lerp(-2.0, -0.3, e); P.torsoX = lerp(0.3, -0.3, e); P.hipsY = lerp(0.62, 1.0, e); P.torsoY = -0.3; }
      break;
    case 'barrida':
      Object.assign(P, { hipsY: 0.42, hipFX: -0.3, knFX: 2.5, torsoX: 0.3, torsoZ: 0.2 });
      P.hipNX = lerp(-1.4, -1.55, e); P.knNX = lerp(2.2, 0.0, e); P.spin = -e * 0.4; break;
    case 'patada_aerea':
      Object.assign(P, { hipFX: -0.9, knFX: 1.9, shNX: -1.3, shFX: -1.0 }); P.hipNX = lerp(-1.3, -1.0, e); P.knNX = lerp(2.0, 0.05, e); P.torsoX = -0.3 * e; break;
    case 'golpeado': {
      const k = 1 - clamp01(t / 14);
      Object.assign(P, { torsoX: lerp(0.1, -0.55, k), headX: -0.5 * k, shNX: lerp(-1.0, 0.4, k), elNX: lerp(-1.8, -0.4, k), shFX: lerp(-0.8, 0.5, k), hipsY: 0.9 });
      break;
    }
    case 'caer': case 'muerto': {
      const l = clamp01(t / 14);
      Object.assign(P, { hipsX: -Math.PI / 2 * l, hipsY: lerp(0.9, 0.17, l), torsoX: lerp(-0.3, 0, l), shNX: lerp(0.4, -2.6, l), elNX: -0.3, shFX: lerp(0.5, -2.4, l), elFX: -0.3,
        hipNX: -0.2, knNX: 0.3, hipFX: -0.5, knFX: 0.9, torsoY: 0, headX: 0.2 * l });
      break;
    }
    case 'levantarse': {
      const l = 1 - clamp01(p * 1.2);
      Object.assign(P, { hipsX: -Math.PI / 2 * l, hipsY: lerp(0.93, 0.17, l), shNX: lerp(-1, -2.6, l), shFX: lerp(-0.8, -2.4, l), hipNX: lerp(-0.35, -1.2, l), knNX: lerp(0.55, 1.8, l) });
      break;
    }
    case 'mareado':
      Object.assign(P, { shNX: -0.15, elNX: -0.3, shFX: -0.1, elFX: -0.25, torsoX: 0.3 + Math.sin(t * 0.05) * 0.1, torsoZ: Math.sin(t * 0.07) * 0.28, headX: 0.35, hipsY: 0.9, torsoY: 0 });
      break;
    case 'victoria': {
      const b = Math.abs(Math.sin(t * 0.09));
      Object.assign(P, { shFX: -3.0, elFX: -0.25, shFZ: -0.2, shNX: -0.2, shNZ: 0.5, elNX: -1.6, torsoY: 0, torsoX: -0.1, hipsY: 0.93 + b * 0.06, hipNX: -0.1, knNX: 0.2, hipFX: 0.1, knFX: 0.2 });
      break;
    }
    case 'especial': case 'lanzar':
      P.shNX = lerp(-1.0, -1.55, e); P.shFX = lerp(-0.8, -1.5, e); P.elNX = lerp(-1.8, -0.1, e); P.elFX = lerp(-2.0, -0.1, e);
      P.torsoY = lerp(0.35, 0.0, e); P.hipNX = lerp(-0.35, -0.7, e); P.knNX = 0.8; P.hipsY = 0.88; break;
    case 'carga':
      Object.assign(P, { shNX: -0.6, elNX: -1.2, shFX: -0.5, elFX: -1.2, shNZ: 0.6, shFZ: -0.6, torsoX: -0.2, headX: -0.3, hipsY: 0.9 + Math.sin(t * 0.5) * 0.01 }); break;
    case 'embestida':
      Object.assign(P, { torsoX: 0.9, shNX: -1.6, elNX: 0, shFX: -1.5, elFX: 0, hipNX: 0.5, knNX: 0.3, hipFX: 0.9, knFX: 0.2, hipsY: 0.75, torsoY: 0 }); break;
    case 'laser':   // mirada fija hacia adelante, brazos firmes y la cabeza un poco inclinada
      Object.assign(P, { torsoY: 0, torsoX: -0.05, headX: -0.08 - e * 0.05, shNX: -0.3, shNZ: 0.5, elNX: -1.3, shFX: -0.3, shFZ: -0.5, elFX: -1.3, hipNX: -0.4, knNX: 0.5, hipFX: 0.3, knFX: 0.4 });
      P.hipsY = 0.92 - e * 0.03; break;
    case 'misiles':   // se agacha y lanza desde la espalda
      Object.assign(P, { torsoX: lerp(0.1, 0.55, e), torsoY: 0, headX: -0.3 * e, shNX: lerp(-1.0, -0.3, e), shNZ: 0.7, elNX: -1.5, shFX: lerp(-0.8, -0.3, e), shFZ: -0.7, elFX: -1.5, hipsY: lerp(0.93, 0.8, e), knNX: 0.9, knFX: 0.8 }); break;
    case 'retrato':   // de pie y relajado, para la foto de la pantalla de selección
      Object.assign(P, { hipsY: 0.98, torsoX: 0, torsoY: 0, headX: 0.05, shNX: -0.1, shNZ: 0, elNX: -0.25, shFX: -0.1, shFZ: 0, elFX: -0.25, hipNX: 0, knNX: 0, hipFX: 0, knFX: 0 });
      break;
    case 'congelado': return null;
  }
  return P;
}

// ---------------------------------------------------------------------
//  FighterModel
// ---------------------------------------------------------------------
const FALLBACK = {
  caminar_atras: ['caminar'], bloqueo_bajo: ['agacharse'], puno_fuerte: ['puno'], patada_giratoria: ['patada'],
  patada_aerea: ['patada'], gancho_arriba: ['puno_fuerte', 'puno'], barrida: ['patada'], muerto: ['caer'],
  lanzar: ['especial', 'puno'], embestida: ['especial'], carga: ['especial', 'victoria'], mareado: ['idle'],
  laser: ['especial'], misiles: ['especial'],
  jet_sube: ['saltar'], jet_cae: ['saltar'], turbina: ['especial'], orbital: ['especial'], rafaga: ['puno'],
  resorte: ['puno_fuerte', 'puno'], contra: ['bloqueo'], culazo: ['especial'], senton: ['saltar'],
  senton_suelo: ['agacharse'], twerk: ['agacharse'], gas: ['agacharse'],
  flexion: ['carga', 'especial'], agarrar: ['puno'], levantar: ['victoria'], pisar_arriba: ['patada'], pisar: ['patada'],
  silbido: ['victoria', 'especial'], chela: ['lanzar', 'especial'],
  canon: ['puno_fuerte', 'especial'], jojo: ['victoria', 'especial'], propulsor: ['embestida', 'especial'], descarga: ['carga', 'especial'],
};
const LOOPING = new Set(['idle', 'caminar', 'caminar_atras', 'agacharse', 'bloqueo', 'bloqueo_bajo', 'mareado', 'victoria', 'carga']);
const BURNT = new THREE.Color('#0d0806');

export class FighterModel {
  constructor() {
    this.root = new THREE.Group();     // posición y orientación en el mundo
    this.pivot = new THREE.Group();    // para poses procedurales de cuerpo entero
    this.root.add(this.pivot);
    this.parts = null;
    this.rig = null;
    this.eyes = null;
    this.mixer = null;
    this.actions = {};
    this.current = null;
    this.materials = [];
    this.flashAmt = 0;
    this.burn = 0;
    this.squash = 1;
    this.paused = false;
    this.detachArm = false;
    this.buttScale = 1;      // nalgas infladas (José)
    this.jetOn = false;      // fuego del jetpack (Alan)
    this.prop = null;        // lo que trae en la mano: 'pez' | 'caguama' (Emi)
    this.acc = {};           // accesorios: guantes, jetpack, pescado, caguama
    this.pose = { ...GUARD };
  }

  // Accesorios que se pegan a los huesos: guantes de box y jetpack
  addAccessories(def) {
    const list = def.accesorios || [];
    if (!this.parts || !list.length) return;
    const P = this.parts, R = this.rig;
    if (list.includes('guantes')) {
      const red = new THREE.MeshStandardMaterial({ color: def.colorGuantes || '#d1121b', roughness: 0.35, metalness: 0.05 });
      const white = new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.6 });
      const glove = () => {
        const g = new THREE.Group();
        const fist = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), red); fist.scale.set(1, 1.15, 1.25); fist.position.y = -0.02;
        const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), red); thumb.position.set(0.06, 0.02, 0.05);
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.09, 14), white); cuff.position.y = 0.08;
        for (const m of [fist, thumb, cuff]) { m.castShadow = true; g.add(m); }
        return g;
      };
      for (const s of ['N', 'F']) {
        const g = glove();
        g.position.copy(R ? R['hand' + s] : new THREE.Vector3(0, -0.29, 0));
        P['el' + s].add(g);
        this.materials.push(red);
      }
    }
    // Emi: el pescado (agarrado de la cola) o la caguama en la mano; solo se ven mientras los usa
    if (list.includes('pescadero')) {
      const hand = R ? R.handF : new THREE.Vector3(0, -0.29, 0);
      const fish = makeFish(); fish.rotation.z = -Math.PI / 2; fish.position.copy(hand).add(new THREE.Vector3(0, -0.38, 0));
      const bottle = makeKawama(); bottle.rotation.x = Math.PI; bottle.position.copy(hand).add(new THREE.Vector3(0, 0.04, 0));
      for (const o of [fish, bottle]) { o.visible = false; P.elF.add(o); }
      this.acc.pez = fish; this.acc.caguama = bottle;
    }
    if (list.includes('jetpack')) {
      const metal = new THREE.MeshStandardMaterial({ color: '#c9d1d9', metalness: 0.85, roughness: 0.3 });
      const dark = new THREE.MeshStandardMaterial({ color: '#333a40', metalness: 0.6, roughness: 0.4 });
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.32, 0.1), dark); g.add(body);
      for (const x of [-0.09, 0.09]) {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 14), metal); tank.position.set(x, 0, -0.06); g.add(tank);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), metal); cap.position.set(x, 0.2, -0.06); g.add(cap);
        const noz = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 12, 1, true), dark); noz.position.set(x, -0.25, -0.06); g.add(noz);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.45, 10), new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
        flame.rotation.x = Math.PI; flame.position.set(x, -0.5, -0.06); flame.visible = false;
        g.add(flame); (this.acc.flames ||= []).push(flame);
      }
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      g.position.copy(R ? R.back : new THREE.Vector3(0, 0.32, -0.16));
      P.torso.add(g);
      this.acc.jetpack = g;
    }
  }

  static async create(def, altTint = false) {
    let asset = null;
    if (def.modelo) {
      try { asset = await loadAsset(def.modelo); } catch (err) { console.warn(`No se pudo cargar ${def.modelo}, usando muñeco provisional`, err); }
    }
    return FighterModel.fromAsset(asset, def, altTint);
  }

  static async fromAsset(asset, def, altTint = false) {
    const fm = new FighterModel();
    if (!asset) {
      const ph = buildPlaceholder(def, altTint);
      fm.parts = ph.parts; fm.eyes = ph.eyes;
      fm.pivot.add(ph.object);
      ph.object.traverse((o) => { if (o.material && !fm.materials.includes(o.material)) fm.materials.push(o.material); });
      fm.addAccessories(def);
      return fm;
    }
    const obj = SkeletonUtils.clone(asset.scene);
    obj.rotation.y = THREE.MathUtils.degToRad(def.rotacionY || 0);
    let hasBones = false;
    obj.traverse((o) => { if (o.isBone || o.isSkinnedMesh) hasBones = true; });
    if (hasBones) {
      fm.setupLoaded(obj, def, altTint);
      await fm.setupClips(obj, asset.animations, def);
    } else {
      const r = autoRig(obj, TARGET_HEIGHT * (def.escala || 1));
      fm.parts = r.parts; fm.rig = r.rig; fm.eyes = r.eyes; fm.rigDebug = r.debug;
      fm.pivot.add(r.group);
      fm.cloneMaterials(r.group, altTint);
      fm.addAccessories(def);
    }
    return fm;
  }

  cloneMaterials(root, altTint) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const cloned = mats.map((m) => {
        const c = m.clone();
        if (altTint && c.color) c.color.multiply(new THREE.Color('#9db8ff'));
        c.userData.baseColor = c.color ? c.color.clone() : null;
        this.materials.push(c);
        return c;
      });
      o.material = Array.isArray(o.material) ? cloned : cloned[0];
    });
  }

  setupLoaded(obj, def, altTint) {
    const holder = new THREE.Group();
    holder.add(obj);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    const size = box.getSize(new THREE.Vector3());
    const s = (TARGET_HEIGHT * (def.escala || 1)) / (size.y || 1);
    holder.scale.setScalar(s);
    holder.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
    this.cloneMaterials(obj, altTint);
    this.pivot.add(holder);
    this.loaded = obj;
    obj.traverse((o) => { if (!this.eyes && o.isBone && norm(o.name) === 'head') this.eyes = { bone: o, local: new THREE.Vector3(0, 10, 9) }; });
  }

  async setupClips(obj, embedded, def) {
    this.mixer = new THREE.AnimationMixer(obj);
    const boneMap = new Map();
    let hipsRestY = 0;
    obj.traverse((o) => {
      const n = norm(o.name);
      if (n && !boneMap.has(n)) boneMap.set(n, o.name);
      if (n === 'hips' && o.isBone && !hipsRestY) hipsRestY = o.position.y;
    });
    const isRigged = [...boneMap.keys()].some((k) => k === 'hips' || k === 'spine');
    const shared = isRigged ? await loadSharedAnimations(true) : {};
    const all = {};
    for (const [key, clip] of Object.entries(shared)) all[key] = retarget(clip, boneMap, hipsRestY, sharedHipsRef, { lockY: key === 'saltar' });
    // Las animaciones del propio modelo tienen prioridad
    for (const clip of embedded) {
      const n = norm(clip.name);
      const key = ALIAS[n] || Object.keys(ANIMACIONES).find((k) => norm(k) === n) || (def.especiales || []).map((s) => s.animacion).find((k) => k && norm(k) === n);
      if (key) all[key] = clip;
    }
    // Animaciones extra por peleador: { especial1: 'assets/peleadores/x/bola.fbx' }
    for (const [key, url] of Object.entries(def.animaciones || {})) {
      try { const a = await loadAsset(url); if (a.animations[0]) all[key] = retarget(a.animations[0], boneMap, hipsRestY, sharedHipsRef); } catch { /* sin archivo */ }
    }
    for (const [key, clip] of Object.entries(all)) this.actions[key] = this.mixer.clipAction(clip);
  }

  resolveAction(key) {
    if (this.actions[key]) return { action: this.actions[key], key };
    for (const k of FALLBACK[key] || []) if (this.actions[k]) return { action: this.actions[k], key: k, reverse: key === 'caminar_atras' };
    return null;
  }

  // anim = { key, t, total, s, a, id }
  apply(anim, dt) {
    if (this.paused) return;
    const r = this.mixer ? this.resolveAction(anim.key) : null;
    if (r) {
      const tag = anim.key + ':' + (anim.id || 0);
      if (this.current !== tag) {
        const prev = this.currentAction;
        const act = r.action;
        act.reset();
        act.setLoop(LOOPING.has(anim.key) ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        act.clampWhenFinished = true;
        let ts = 1;
        if (anim.total && !LOOPING.has(anim.key)) ts = act.getClip().duration / (anim.total / 60);
        act.timeScale = (r.reverse ? -1 : 1) * ts;
        if (r.reverse) act.time = act.getClip().duration;
        act.enabled = true;
        act.setEffectiveWeight(1);
        act.play();
        if (prev && prev !== act) act.crossFadeFrom(prev, anim.fade ?? 0.08, false);
        this.currentAction = act;
        this.current = tag;
      }
      this.mixer.update(dt);
      this.wholeBodyFallback(anim, true);
    } else if (this.parts) {
      this.current = null;
      const target = proceduralPose(anim);
      if (target) {
        // suavizado independiente de los fps
        const rate = 1 - Math.pow(1 - (anim.total ? 0.55 : 0.25), Math.max(dt, 0) * 60);
        for (const k in target) this.pose[k] = lerp(this.pose[k] ?? target[k], target[k], rate);
        this.applyPose();
      }
    } else {
      if (this.mixer) this.mixer.update(dt);
      this.wholeBodyFallback(anim, false);
    }
  }

  applyPose() {
    const P = this.parts, q = this.pose, R = this.rig;
    if (R) {
      P.hips.position.y = R.pelvisY * (q.hipsY / 0.98);
      P.shN.rotation.set(q.shNX, 0, q.shNZ - R.spread); P.shF.rotation.set(q.shFX, 0, q.shFZ + R.spread);
      P.hipN.rotation.set(q.hipNX, 0, R.abdN); P.hipF.rotation.set(q.hipFX, 0, R.abdF);
      P.knN.rotation.set(q.knNX, 0, 0); P.knF.rotation.set(q.knFX, 0, 0);
    } else {
      P.hips.position.y = q.hipsY;
      P.shN.rotation.set(q.shNX, 0, q.shNZ); P.shF.rotation.set(q.shFX, 0, q.shFZ);
      P.hipN.rotation.x = q.hipNX; P.knN.rotation.x = q.knNX;
      P.hipF.rotation.x = q.hipFX; P.knF.rotation.x = q.knFX;
    }
    P.hips.rotation.x = q.hipsX;
    P.torso.rotation.set(q.torsoX, q.torsoY, q.torsoZ);
    P.head.rotation.x = q.headX;
    P.elN.rotation.set(q.elNX, 0, 0);
    P.elF.rotation.set(q.elFX, 0, 0);
    P.elF.scale.setScalar(this.detachArm ? 0.001 : 1);   // ¡el antebrazo salió volando!
    if (P.butt) P.butt.scale.setScalar(this.buttScale);
    for (const fl of this.acc.flames || []) { fl.visible = this.jetOn; if (this.jetOn) fl.scale.y = 0.8 + Math.random() * 0.5; }
    for (const k of ['pez', 'caguama']) if (this.acc[k]) this.acc[k].visible = this.prop === k;
    this.pivot.rotation.y = q.spin;
    this.pivot.rotation.x = q.tilt || 0;
    this.pivot.scale.y = this.squash;
  }

  // Modelo con esqueleto pero sin animación para este estado: mover el cuerpo completo
  wholeBodyFallback(anim, hasClip) {
    const pv = this.pivot;
    const e = ext(anim), t = anim.t;
    let sy = 1, rx = 0, rz = 0, ry = 0, pz = 0, py = 0;
    if (!hasClip) {
      switch (anim.key) {
        case 'agacharse': case 'bloqueo_bajo': sy = 0.68; break;
        case 'puno': case 'puno_fuerte': case 'especial': case 'lanzar': case 'laser': pz = e * 0.2; rx = e * 0.12; break;
        case 'patada': case 'patada_aerea': pz = e * 0.15; rx = -e * 0.2; break;
        case 'patada_giratoria': ry = -Math.min(1, anim.t / anim.total / anim.a) * Math.PI * 2; break;
        case 'gancho_arriba': py = e * 0.15; rx = -e * 0.15; break;
        case 'barrida': sy = 0.6; pz = e * 0.25; break;
        case 'golpeado': rx = -0.3 * (1 - clamp01(t / 14)); break;
        case 'caer': case 'muerto': rx = -Math.PI / 2 * clamp01(t / 14); py = 0.15 * clamp01(t / 14); break;
        case 'levantarse': rx = -Math.PI / 2 * (1 - clamp01(t / anim.total * 1.2)); break;
        case 'mareado': rz = Math.sin(t * 0.07) * 0.2; break;
        case 'victoria': py = Math.abs(Math.sin(t * 0.09)) * 0.12; break;
        case 'saltar': if (anim.flip) rx = -(anim.t / anim.total) * Math.PI * 2; break;
        case 'embestida': rx = 0.6; break;
        case 'misiles': rx = e * 0.4; break;
        case 'idle': sy = 1 + Math.sin(t * 0.08) * 0.008; break;
      }
    }
    pv.scale.y = lerp(pv.scale.y, sy * this.squash, 0.4);
    pv.rotation.x = rx; pv.rotation.z = rz; pv.rotation.y = ry;
    pv.position.z = pz; pv.position.y = py;
  }

  setFacing(facing) {
    this.root.rotation.y = Math.PI / 2;
    const k = this.size ?? 1;   // tamaño (Conde gigante)
    this.root.scale.set(k, k, facing * k);   // z: espejo, como en los juegos 2D
  }

  setIced(on) {
    if (on && !this.ice) {
      this.ice = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 2.1, 0.9),
        new THREE.MeshStandardMaterial({ color: '#bfefff', transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.2, emissive: '#3aa8ff', emissiveIntensity: 0.25 }),
      );
      this.ice.position.y = 1.0;
      this.root.add(this.ice);
    } else if (!on && this.ice) {
      this.ice.removeFromParent(); this.ice = null;
    }
  }

  // Posición de los ojos en el mundo (para el láser)
  eyeWorld(out = new THREE.Vector3()) {
    if (!this.eyes) return out.set(0, 1.65, 0.1).applyMatrix4(this.root.matrixWorld);
    this.eyes.bone.updateWorldMatrix(true, false);
    return out.copy(this.eyes.local).applyMatrix4(this.eyes.bone.matrixWorld);
  }

  flash(amount = 1) { this.flashAmt = amount; }

  tickMaterials(dt, tintColor, tintAmount = 0.6) {
    this.flashAmt = Math.max(0, this.flashAmt - dt * 6);
    for (const m of this.materials) {
      if (m.emissive) {
        if (tintColor) m.emissive.set(tintColor).multiplyScalar(tintAmount);
        else m.emissive.setScalar(this.flashAmt * 0.8);
      }
      if (m.color) {
        if (!m.userData.baseColor) m.userData.baseColor = m.color.clone();
        if (this.burn > 0) m.color.copy(m.userData.baseColor).lerp(BURNT, this.burn);
        else if (m.userData.burnt) m.color.copy(m.userData.baseColor);
        m.userData.burnt = this.burn > 0;
      }
    }
  }

  dispose() {
    this.root.removeFromParent();
    if (this.mixer) this.mixer.stopAllAction();
  }
}
