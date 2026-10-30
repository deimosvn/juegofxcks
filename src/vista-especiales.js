import * as THREE from 'three';

// =====================================================================
//  Cómo se ven los ataques nuevos (especiales-extra.js). Solo se ve: no cambia la pelea.
//  · la estela de cada picada según su estilo · los drones de Diego · el cono del BOOM SÓNICO
//  · los corazones del IMÁN DE NALGAS · la losa en las manos de Conde (y volando)
//  · la caña, el hilo y el anzuelo de Emi · la lata de spray y las llamas de Ramces
//  · la columna de fuego de Brasa
// =====================================================================

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const glowMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, ...o });

// ---------------------------------------------------------------- piezas
function makeDrone() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const dark = std('#2b3036', { metalness: 0.6, roughness: 0.35 });
  body.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.3), dark));
  body.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std('#11161b', { metalness: 0.8, roughness: 0.2 })));
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff2a2a' })); led.position.set(0.16, 0, 0); body.add(led);
  const rotors = [];
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.025, 0.035), dark);
    arm.position.set(x * 0.12, 0.02, z * 0.12); arm.rotation.y = x * z > 0 ? -Math.PI / 4 : Math.PI / 4; body.add(arm);
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.008, 16), glowMat('#c8d6e0', 0.35));
    rotor.position.set(x * 0.22, 0.06, z * 0.22); body.add(rotor); rotors.push(rotor);
  }
  return { g, body, led, rotors };
}

function makeSlab() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 0.7), std('#a8a196', { roughness: 0.95 }));
  g.add(top);
  // tierra pegada abajo y una orilla de banqueta pintada de amarillo
  const dirt = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.6), std('#6b5236', { roughness: 1 })); dirt.position.y = -0.12; g.add(dirt);
  const curb = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.7), std('#e8c21c', { roughness: 0.8 })); curb.position.set(0.5, 0.02, 0); g.add(curb);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function makeRod() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.025, 1.7, 8), std('#2a2a2a', { roughness: 0.4 }));
  pole.position.y = 0.85; g.add(pole);
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 12), std('#c9cfd6', { metalness: 0.8, roughness: 0.3 }));
  reel.rotation.z = Math.PI / 2; reel.position.set(0.04, 0.2, 0); g.add(reel);
  return g;
}

function makeHook() {
  const g = new THREE.Group();
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 16, Math.PI * 1.4), std('#d9dee3', { metalness: 0.9, roughness: 0.2 }));
  hook.rotation.z = Math.PI * 0.8; g.add(hook);
  // el corcho: rojo y blanco, flota un poco antes del anzuelo
  const bob = new THREE.Group(); bob.position.set(-0.45, 0.12, 0);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std('#d81e1e'));
  const bot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std('#f4f4f4'));
  bob.add(top, bot); g.add(bob);
  return g;
}

function makeSprayCan() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.22, 14), std('#d62828', { metalness: 0.5, roughness: 0.3 }));
  g.add(body);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.05, 12), std('#f2f2f2', { metalness: 0.3 })); cap.position.y = 0.135; g.add(cap);
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0465, 0.0465, 0.08, 14), std('#ffd23a')); g.add(label);
  return g;
}

let HEART = null;
function heartTexture() {
  if (HEART) return HEART;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.shadowColor = '#ff2a8a'; x.shadowBlur = 10;
  x.fillStyle = '#ff5fae';
  x.beginPath();
  x.moveTo(32, 54); x.bezierCurveTo(6, 36, 6, 12, 22, 12); x.bezierCurveTo(28, 12, 32, 18, 32, 22);
  x.bezierCurveTo(32, 18, 36, 12, 42, 12); x.bezierCurveTo(58, 12, 58, 36, 32, 54); x.fill();
  x.fillStyle = 'rgba(255,255,255,.7)'; x.beginPath(); x.ellipse(22, 22, 5, 3, -0.6, 0, Math.PI * 2); x.fill();
  HEART = new THREE.CanvasTexture(c); HEART.colorSpace = THREE.SRGBColorSpace;
  return HEART;
}

// ---------------------------------------------------------------- estela de cada picada (cada cuadro de la caída)
const TRAIL = {
  cohete(e, p, f, n) { e.glow.emit({ pos: V(p.x - f.facing * 0.15, p.y - 0.5, 0.1), count: 4 * n, speed: 4, dir: [-f.facing * 0.4, 1, 0], spread: 0.3, color: '#ffffff', colorEnd: '#ff6a00', life: 0.3, size: 0.32 }); e.solid.emit({ pos: V(p.x, p.y - 0.4, 0), count: n, speed: 1, color: '#9a9a9a', colorEnd: '#333', life: 0.8, size: 0.3, grow: 2, drag: 2 }); },
  reentrada(e, p, f, n) { e.glow.emit({ pos: V(p.x + f.facing * 0.2, p.y, 0.15), count: 6 * n, speed: 3, dir: [-f.facing * 0.5, 1, 0], spread: 0.6, jitter: 0.35, color: '#fff3c0', colorEnd: '#ff5a00', life: 0.35, size: 0.42 }); e.glow.emit({ pos: p, count: n, speed: 6, spread: 1, color: '#ffffff', colorEnd: '#ffb347', life: 0.2, size: 0.08 }); },
  mazazo(e, p, f, n) { e.glow.emit({ pos: V(p.x + f.facing * 0.35, p.y + 0.2, 0.2), count: 2 * n, speed: 1, jitter: 0.15, color: '#ffffff', colorEnd: '#ffd23a', life: 0.25, size: 0.3 }); e.glow.emit({ pos: p, count: n, speed: 5, dir: [-f.facing * 0.6, 1, 0], spread: 0.2, color: '#ffffff', colorEnd: '#ffffff', life: 0.15, size: 0.06 }); },
  pedo(e, p, f, n) { e.solid.emit({ pos: V(p.x + f.facing * 0.25, p.y - 0.1, 0), count: 3 * n, speed: 2, dir: [-f.facing * 0.5, 1, 0], spread: 0.4, jitter: 0.25, color: '#b7e86a', colorEnd: '#4f7a24', life: 1.0, size: 0.5, grow: 1.6, drag: 1.6, gravity: -0.4 }); },
  plancha(e, p, f, n) { e.glow.emit({ pos: p, count: 3 * n, speed: 2, jitter: 0.5, color: '#ffffff', colorEnd: '#ff7a1a', life: 0.25, size: 0.3 }); e.solid.emit({ pos: V(p.x, p.y + 0.3, 0), count: n, speed: 1.5, jitter: 0.5, color: '#c9a77a', colorEnd: '#6b5236', life: 0.6, size: 0.25, grow: 1.5, drag: 2 }); },
  clavado(e, p, f, n) { e.solid.emit({ pos: V(p.x, p.y + 0.4, 0.1), count: 3 * n, speed: 1.5, jitter: 0.3, color: '#e8f8ff', colorEnd: '#4fb8ff', life: 0.5, size: 0.08, gravity: 6 }); e.glow.emit({ pos: p, count: n, speed: 1, jitter: 0.3, color: '#ffffff', colorEnd: '#4fb8ff', life: 0.25, size: 0.25 }); },
  navaja(e, p, f, n) { e.glow.emit({ pos: V(p.x + f.facing * 0.4, p.y + 0.5, 0.25), count: 3 * n, speed: 0.6, jitter: 0.25, color: '#ffffff', colorEnd: '#9fb3c8', life: 0.25, size: 0.16 }); },
  fuego(e, p, f, n) { e.glow.emit({ pos: p, count: 5 * n, speed: 2.5, dir: [-f.facing * 0.4, 1, 0], spread: 0.5, jitter: 0.3, color: '#fff3c0', colorEnd: '#ff3a00', life: 0.4, size: 0.4 }); },
  hielo(e, p, f, n) { e.glow.emit({ pos: p, count: 3 * n, speed: 1.5, jitter: 0.35, color: '#ffffff', colorEnd: '#9fe8ff', life: 0.35, size: 0.3 }); e.solid.emit({ pos: p, count: n, speed: 1, jitter: 0.3, color: '#ffffff', colorEnd: '#bfefff', life: 0.6, size: 0.06, gravity: 3 }); },
  rayo(e, p, f, n) { e.glow.emit({ pos: p, count: 3 * n, speed: 2, jitter: 0.3, color: '#ffffff', colorEnd: '#fff27a', life: 0.25, size: 0.3 }); e.glow.emit({ pos: p, count: 2 * n, speed: 7, spread: 1, color: '#ffffff', colorEnd: '#fff27a', life: 0.12, size: 0.07 }); },
  bala(e, p, f, n) { e.solid.emit({ pos: p, count: 2 * n, speed: 1, jitter: 0.4, color: '#8a8a8a', colorEnd: '#2a2a2a', life: 0.7, size: 0.35, grow: 1.8, drag: 2 }); },
};

export class VistaEspeciales {
  constructor(game) {
    this.g = game;
    const scene = game.scene;
    // por peleador: cono sónico, losa en las manos, caña con hilo y anzuelo, lata de spray
    this.per = [0, 1].map(() => {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.4, 24, 1, true), glowMat('#e8f6ff', 0.22));
      cone.material.side = THREE.DoubleSide;
      const slab = makeSlab(), rod = makeRod(), hook = makeHook(), can = makeSprayCan();
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(0, 0), V(1, 0)]), new THREE.LineBasicMaterial({ color: '#f4f8ff' }));
      for (const o of [cone, slab, rod, line, hook, can]) { o.visible = false; o.frustumCulled = false; scene.add(o); }
      return { cone, slab, rod, line, hook, can, k: 0 };
    });
    this.hearts = Array.from({ length: 10 }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTexture(), transparent: true, depthWrite: false }));
      s.visible = false; scene.add(s);
      return s;
    });
  }

  clear() {
    for (const P of this.per) for (const o of [P.cone, P.slab, P.rod, P.line, P.hook, P.can]) o.visible = false;
    for (const h of this.hearts) h.visible = false;
  }

  // mano de adelante del modelo (donde trae las cosas); si no tiene esqueleto, la de la simulación
  hand(i, f) {
    const m = this.g.viewModel(i);
    if (m?.parts?.elF && m.rig?.handF) { m.root.updateMatrixWorld(true); return m.parts.elF.localToWorld(m.rig.handF.clone()); }
    return f.hand;
  }

  update(dt) {
    const g = this.g, e = g.effects, n = Math.max(1, Math.round(dt * 60)), live = dt > 0 && !g.paused;
    let heartsUsed = 0;
    g.fighters.forEach((f, i) => {
      const P = this.per[i], d = f.specData, tipo = f.state === 'special' ? f.spec?.tipo : null, s = f.spec;
      const x = f.rx ?? f.x;
      P.k++;
      // picada: brillo al cargarse arriba y la estela de su estilo al caer
      if (tipo === 'picada' && d && live) {
        const p = V(x, f.y + 0.9, 0.1);
        if (d.phase === 'hang') e.glow.emit({ pos: p, count: 2 * n, speed: 2.5, jitter: 0.4, color: '#ffffff', colorEnd: s.color || '#ffffff', life: 0.25, size: 0.22 });
        else if (d.phase === 'dive') (TRAIL[s.estilo] || TRAIL.cohete)(e, p, f, n, P.k);
      }
      // BOOM SÓNICO: cono de aire alrededor de Alan mientras cruza
      const boom = tipo === 'boom_sonico' && f.t >= 10 && f.t < 22;
      P.cone.visible = boom;
      if (boom) {
        P.cone.position.set(x + f.facing * 0.5, f.y + 1.05, 0.1);
        P.cone.rotation.set(0, 0, -f.facing * Math.PI / 2);
        P.cone.scale.set(1 + Math.random() * 0.12, 1 + Math.random() * 0.2, 1 + Math.random() * 0.12);
        if (live) e.glow.emit({ pos: V(x - f.facing * 0.6, f.y + 1.05, 0.1), count: 4 * n, speed: 3, dir: [-f.facing, 0, 0], spread: 0.3, color: '#ffffff', colorEnd: '#9fd8ff', life: 0.3, size: 0.25 });
      }
      // IMÁN DE NALGAS: corazones que salen de las nalgas de José y se le van al rival
      if (tipo === 'iman' && d && (d.phase === 'call' || d.phase === 'pull')) {
        const o = g.other(f), ox = o.rx ?? o.x;
        for (let j = 0; j < 5 && heartsUsed < this.hearts.length; j++) {
          const h = this.hearts[heartsUsed++], u = ((f.t * 0.035) + j / 5) % 1;
          h.visible = true;
          h.position.set(x - f.facing * 0.3 + (ox - x + f.facing * 0.3) * u, f.y + 1.0 + Math.sin(u * Math.PI) * 0.8 + Math.sin(f.t * 0.3 + j) * 0.08, 0.3);
          h.scale.setScalar(0.28 + 0.12 * Math.sin(f.t * 0.4 + j * 2));
          h.material.opacity = Math.sin(u * Math.PI);
        }
      }
      // ARRANCABANQUETAS: la losa arriba de su cabeza hasta que la avienta
      const lift = tipo === 'losa' && d?.lift;
      P.slab.visible = lift;
      if (lift) {
        const sz = f.sizeScale;
        P.slab.position.set(x + f.facing * 0.1, f.y + 2.45 * sz, 0.05);
        P.slab.rotation.set(0.05 * Math.sin(f.t * 0.5), 0, 0.12 * f.facing);
        P.slab.scale.setScalar(sz);
        if (live && f.t % 4 === 0) e.solid.emit({ pos: V(x, f.y + 2.3 * sz, 0.05), count: 2, speed: 0.6, jitter: 0.4, color: '#6b5236', colorEnd: '#3a2b1c', life: 0.7, size: 0.08, gravity: 9 });
      }
      // ANZUELO: la caña en la mano, el hilo y el anzuelo con su corcho
      const rod = tipo === 'anzuelo';
      P.rod.visible = rod;
      const fishing = rod && d && f.t >= 8 && ['out', 'pull', 'back'].includes(d.phase);
      P.line.visible = fishing; P.hook.visible = fishing;
      if (rod) {
        const hd = this.hand(i, f);
        P.rod.position.copy(hd);
        P.rod.rotation.set(0, 0, -f.facing * (f.t < 8 ? 1.9 - f.t * 0.12 : 0.85));
        if (fishing) {
          P.rod.updateMatrixWorld(true);
          const tip = P.rod.localToWorld(V(0, 1.7, 0));
          const hy = f.y + 1.45, tipX = f.hand.x + f.facing * Math.max(d.len, 0);
          const pos = P.line.geometry.attributes.position;
          pos.setXYZ(0, tip.x, tip.y, tip.z); pos.setXYZ(1, tipX, hy, 0.25); pos.needsUpdate = true;
          P.hook.position.set(tipX, hy, 0.25); P.hook.scale.set(f.facing, 1, 1);
        }
      }
      // LANZALLAMAS: la lata en la mano y las llamas cuando prende el encendedor
      const spray = tipo === 'lanzallamas';
      P.can.visible = spray;
      if (spray) {
        const hd = this.hand(i, f);
        P.can.position.copy(hd); P.can.rotation.set(0, 0, -f.facing * (f.t < 14 ? 0.3 + Math.sin(f.t * 2.2) * 0.4 : Math.PI / 2));
        if (live && f.t >= 12 && f.t < 50) {
          const nozzle = V(hd.x + f.facing * 0.14, hd.y + 0.02, hd.z);
          e.glow.emit({ pos: nozzle, count: 6 * n, speed: 9, dir: [f.facing, 0.05, 0], spread: 0.16, color: '#fff3c0', colorEnd: '#ff3a00', life: 0.32, size: 0.32, drag: 1.2 });
          e.glow.emit({ pos: nozzle, count: 2 * n, speed: 6, dir: [f.facing, 0.15, 0], spread: 0.3, color: '#ffd27a', colorEnd: '#ff2200', life: 0.45, size: 0.55, drag: 2, gravity: -2 });
          if (f.t % 3 === 0) e.solid.emit({ pos: V(nozzle.x + f.facing * 2.2, nozzle.y + 0.3, 0.1), count: n, speed: 1, dir: [0, 1, 0], spread: 0.5, color: '#4a4a4a', colorEnd: '#111', life: 1.0, size: 0.45, grow: 2, drag: 1.5, gravity: -1 });
        }
      }
      // COLUMNA DE FUEGO (Brasa): el fuego se queda ardiendo un momento
      if (tipo === 'rayo' && s?.estilo === 'fuego' && d?.x != null && live) {
        if (f.t >= 6 && f.t < 28 && f.t % 2 === 0) e.glow.emit({ pos: V(d.x, 0.1, 0.1), count: 2, speed: 1, spread: 1, jitter: 0.5, color: '#ffb347', colorEnd: '#ff3a00', life: 0.4, size: 0.25 });
        if (f.t >= 28 && f.t < 46) e.glow.emit({ pos: V(d.x + (Math.random() - 0.5) * 0.5, 0.2, 0.1), count: 5 * n, speed: 7, dir: [0, 1, 0], spread: 0.2, color: '#fff3c0', colorEnd: s.color || '#ff5500', life: 0.5, size: 0.45, drag: 0.5 });
      }
    });
    for (let j = heartsUsed; j < this.hearts.length; j++) this.hearts[j].visible = false;
  }

  // ---------------------------------------------------------------- proyectiles nuevos
  has(kind) { return kind === 'dron' || kind === 'losa'; }

  makeProjectile(p) {
    const g = new THREE.Group();
    let drone = null, slab = null;
    if (p.kind === 'dron') { drone = makeDrone(); g.add(drone.g); }
    else { slab = makeSlab(); g.add(slab); }
    this.g.scene.add(g);
    return { obj: g, drone, slab, custom: true, light: p.kind === 'dron' ? { color: '#ff2a2a', power: 6 } : null, t: 0 };
  }

  syncProjectile(p, v, dt, n) {
    const e = this.g.effects;
    if (v.drone) {
      const D = v.drone;
      v.obj.rotation.set(0, 0, 0);
      D.body.rotation.set(0, 0, -THREE.MathUtils.clamp(p.vx * 0.06, -0.5, 0.5));
      for (const r of D.rotors) r.rotation.y += dt * 60;
      D.led.material.color.set((v.t * 4) % 1 < 0.5 ? '#ff2a2a' : '#5a0000');
      if (dt > 0 && Math.random() < 0.5) e.glow.emit({ pos: V(v.obj.position.x, v.obj.position.y - 0.08, 0.1), count: 1, speed: 1.5, dir: [0, -1, 0], spread: 0.3, color: '#ffffff', colorEnd: p.color, life: 0.15, size: 0.12 });
    } else if (v.slab) {
      v.obj.rotation.set(0, 0, -Math.sign(p.vx || 1) * v.t * 5);
      if (dt > 0 && Math.random() < 0.6) e.solid.emit({ pos: v.obj.position, count: n, speed: 0.6, jitter: 0.3, color: '#7a6a55', colorEnd: '#3a2b1c', life: 0.6, size: 0.08, gravity: 8 });
    }
  }
}
