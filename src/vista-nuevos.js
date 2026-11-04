import * as THREE from 'three';
import { ESTAMPIDA } from './especiales-nuevos.js';
import { TRAIL } from './vista-especiales.js';
import { makeHorse, makeCropDuster, makeAmp, makePaperPlane, makeBlackBox } from './props.js';

// =====================================================================
//  Cómo se ven los ataques de Abel, Diego Suárez y Jaziel (especiales-nuevos.js). Solo se ve: no cambia la pelea.
//  · los caballos de Jaziel (el suyo con silla y la manada) y él montado · la reata y la lazada
//  · el amplificador, la cuerda de la guitarra y las notas de Abel · la avioneta fumigadora y la
//    HÉLICE de Diego Suárez · sus proyectiles (acorde, avión de papel, remaches, tiros y la caja negra)
//  Las fatalities (cine-nuevos.js) usan los mismos caballos y notas: game.vista2.
// =====================================================================

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const glowMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
const UP = new THREE.Vector3(0, 1, 0);
export const RIDE_Y = 0.92;   // cuánto sube Jaziel montado (para quedar en la silla)
// la manada (ESTAMPIDA y la brutality de Jaziel): el pelo y la crin de cada caballo
export const MANADA = [
  { pelo: '#2b2420', crin: '#111111' }, { pelo: '#d9d2c5', crin: '#9a948a' }, { pelo: '#c9a25a', crin: '#f1e6c8' },
  { pelo: '#8e3f1c', crin: '#3a1a0c' }, { pelo: '#5e4a3a', crin: '#1a120c' },
];
const KINDS = new Set(['acorde', 'avion_papel', 'remache', 'tiro', 'caja']);

// Lo que traen en la mano según su especial (main.js lo pone en model.prop)
export function propNuevo(f, tipo) {
  switch (tipo) {
    case 'acorde': case 'amplificador': case 'serenata': case 'cuerdazo': return 'guitarra';
    case 'guitarrazo': return 'guitarra_mano';
    case 'remachadora': return 'remachadora';
    case 'avion_papel': return f.t < 12 ? 'avion' : null;
    case 'caja_negra': return f.t < 12 ? 'caja' : null;
    case 'fumigadora': return 'paletas';
    case 'revolver': return 'pistola';
    case 'picada': return f.spec?.estilo === 'stagedive' ? 'guitarra_mano' : null;
    default: return null;
  }
}

// ---------------------------------------------------------------- piezas
// reata o cuerda: un cilindro delgado que se estira entre dos puntos (las líneas de WebGL se ven de 1 pixel)
export function rope(color = '#c9a46a', r = 0.02) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
  m.userData.r = r; m.castShadow = true;
  return m;
}
const _d = new THREE.Vector3();
export function stretch(m, a, b, r = m.userData.r ?? 0.02) {
  const len = a.distanceTo(b);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.scale.set(r, Math.max(len, 0.001), r);
  if (len > 1e-5) m.quaternion.setFromUnitVectors(UP, _d.subVectors(b, a).normalize());
  m.visible = true;
}
// la lazada (aro de reata): radio 1, se escala
export function loop() {
  const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 28), new THREE.MeshStandardMaterial({ color: '#c9a46a', roughness: 0.9 }));
  m.castShadow = true;
  return m;
}
// pone un caballo en su lugar: dir = hacia dónde ve; fase y galope para las patas (props.js makeHorse)
export function placeHorse(h, x, y, z, dir, fase, galope, extra) {
  h.visible = true;
  h.position.set(x, y, z);
  h.rotation.set(0, dir > 0 ? 0 : Math.PI, 0);
  h.userData.pose(fase, galope, extra);
}

// Notas musicales que flotan (sprites). Cada cuadro se apagan todas (begin) y se prenden las que se usan (put)
let NOTE_TEX = null;
function noteTextures() {
  if (NOTE_TEX) return NOTE_TEX;
  NOTE_TEX = ['♪', '♫', '♬'].map((ch) => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    x.font = 'bold 50px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = '#000000'; x.shadowBlur = 6; x.fillStyle = '#ffffff'; x.fillText(ch, 32, 34);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
  return NOTE_TEX;
}
export class Notas {
  constructor(scene, n = 20) {
    const tex = noteTextures();
    this.sprites = Array.from({ length: n }, (_, i) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex[i % tex.length], transparent: true, depthWrite: false }));
      s.visible = false; scene.add(s);
      return s;
    });
    this.used = 0;
  }
  begin() { for (let i = 0; i < this.used; i++) this.sprites[i].visible = false; this.used = 0; }
  put(pos, size = 0.3, opacity = 1, color = '#ffffff') {
    if (this.used >= this.sprites.length) return;
    const s = this.sprites[this.used++];
    s.visible = true; s.position.copy(pos); s.scale.set(size, size, 1);
    s.material.opacity = opacity; s.material.color.set(color);
  }
  // n notas que van de un punto a otro en arco (k avanza con el tiempo)
  arc(from, to, k, n = 4, color = '#ffffff', lift = 0.6) {
    for (let j = 0; j < n; j++) {
      const u = (k * 0.025 + j / n) % 1, s = Math.sin(u * Math.PI);
      const p = from.clone().lerp(to, u);
      p.y += s * lift + Math.sin(k * 0.2 + j * 2) * 0.06;
      this.put(p, 0.2 + 0.12 * s, s, color);
    }
  }
}

// ---------------------------------------------------------------- estela de las picadas nuevas
Object.assign(TRAIL, {
  stagedive(e, p, f, n) { e.glow.emit({ pos: p, count: 3 * n, speed: 2, dir: [-f.facing * 0.4, 1, 0], spread: 0.5, jitter: 0.3, color: '#ffffff', colorEnd: '#b18cff', life: 0.3, size: 0.3 }); },
  barrena(e, p, f, n, k) {
    const a = k * 0.6;
    e.solid.emit({ pos: V(p.x + Math.cos(a) * 0.3, p.y + 0.3 + Math.sin(a) * 0.3, 0.1), count: n, speed: 0.6, color: '#bdbdbd', colorEnd: '#3a3a3a', life: 0.9, size: 0.3, grow: 2, drag: 2 });
    e.glow.emit({ pos: p, count: 2 * n, speed: 2, dir: [-f.facing * 0.4, 1, 0], spread: 0.4, color: '#fff3c0', colorEnd: '#ff7a1a', life: 0.25, size: 0.3 });
  },
  rodeo(e, p, f, n) {
    e.solid.emit({ pos: V(p.x, p.y - 0.2, 0), count: n, speed: 1.2, jitter: 0.3, color: '#d8b98a', colorEnd: '#8a6a4a', life: 0.6, size: 0.25, grow: 1.6, drag: 2 });
    e.glow.emit({ pos: p, count: n, speed: 1, jitter: 0.3, color: '#ffffff', colorEnd: '#ffb347', life: 0.2, size: 0.22 });
  },
});

export class VistaNuevos {
  constructor(game) {
    this.g = game;
    const scene = game.scene;
    // por peleador: su caballo con silla, la manada, la avioneta, el amplificador, la reata, la cuerda y el disco de la hélice
    this.per = [0, 1].map(() => {
      const disc = new THREE.Mesh(new THREE.RingGeometry(0.22, 1.08, 36), glowMat('#ffffff', 0.15));
      disc.material.side = THREE.DoubleSide; disc.rotation.x = -Math.PI / 2;
      const P = {
        horse: makeHorse({ silla: true }), herd: MANADA.map((c) => makeHorse(c)), plane: makeCropDuster(), amp: makeAmp(),
        loop: loop(), rope: rope(), string: new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), glowMat('#e2ccff', 0.95)), disc,
        mem: {}, ph: 0,   // mem: lo que la vista recuerda (el caballo o la avioneta que se van cuando ya acabó el especial)
      };
      P.string.userData.r = 0.014;
      P.all = [P.horse, ...P.herd, P.plane, P.amp, P.loop, P.rope, P.string, P.disc];
      for (const o of P.all) { o.visible = false; scene.add(o); }
      return P;
    });
    this.notas = new Notas(scene);
  }

  // para que prewarm (fatal.js) prepare sus sombreados antes de la pelea
  warmList() { return [...this.per.flatMap((P) => P.all), ...this.notas.sprites]; }

  clear() {
    for (const P of this.per) { for (const o of P.all) o.visible = false; P.mem = {}; }
    this.notas.begin();
  }

  // mano de adelante del modelo (si no tiene esqueleto, la de la simulación)
  hand(i, f) {
    const m = this.g.viewModel(i);
    if (m?.parts?.elF && m.rig?.handF) { m.root.updateMatrixWorld(true); return m.parts.elF.localToWorld(m.rig.handF.clone()); }
    return f.hand;
  }
  // la guitarra de Abel cuando la está tocando
  guitar(i) {
    const m = this.g.viewModel(i), gt = m?.acc?.guitarra;
    if (!gt?.visible) return null;
    m.root.updateMatrixWorld(true);
    return gt.getWorldPosition(V());
  }

  update(dt) {
    const g = this.g, e = g.effects, live = dt > 0 && !g.paused, n = Math.max(1, Math.round(dt * 60));
    this.notas.begin();
    g.fighters.forEach((f, i) => {
      const P = this.per[i];
      for (const o of P.all) o.visible = false;
      const tipo = f.state === 'special' ? f.spec?.tipo : null, d = f.specData, s = f.spec;
      const x = f.rx ?? f.x, tt = f.t - 1 + (g.alpha ?? 1), o = g.other(f), ox = o ? o.rx ?? o.x : x;
      P.ph += dt * 3.3;

      // ---- CABALLAZO: llega galopando, se sube de un brinco y al final el caballo se va solo
      if (tipo === 'caballazo') {
        let hx;
        if (f.t < 16) { hx = x - f.facing * (16 - tt) * 0.55; P.mem.bajoX = null; }
        else if (d.montado) {
          hx = x;
          const m = g.viewModel(i);
          if (m) m.root.position.y += RIDE_Y + Math.abs(Math.sin(P.ph * Math.PI * 2)) * 0.06;
        } else { P.mem.bajoX ??= x; hx = P.mem.bajoX + f.facing * (tt - 52) * 0.2; }
        placeHorse(P.horse, hx, 0, 0, f.facing, P.ph, 1);
        P.mem.horse = { x: hx, dir: f.facing, life: 1.4 };
        if (live && f.t % 3 === 0) e.solid.emit({ pos: V(hx - f.facing * 0.6, 0.08, 0), count: 3, speed: 1.2, dir: [-f.facing, 0.6, 0], spread: 0.6, color: '#d8c3a0', colorEnd: '#8a7458', life: 0.7, size: 0.3, grow: 1.8, drag: 2 });
      } else if (P.mem.horse) {
        const H = P.mem.horse;
        H.x += H.dir * 11 * dt; H.life -= dt;
        if (H.life > 0) placeHorse(P.horse, H.x, 0, 0, H.dir, P.ph, 1); else P.mem.horse = null;
      }

      // ---- ESTAMPIDA: la manada pasa; brinca a Jaziel y arrolla al otro
      if (tipo === 'estampida' && d?.x0 != null) {
        P.mem.herd = P.herd.map((_, k) => ({ x: d.x0 + d.dir * ESTAMPIDA.vel / 60 * (tt - ESTAMPIDA.desde - k * ESTAMPIDA.gap), dir: d.dir }));
        P.mem.herdLife = 1.5;
      } else if (P.mem.herd) {
        P.mem.herdLife -= dt;
        for (const H of P.mem.herd) H.x += H.dir * ESTAMPIDA.vel * dt;
        if (P.mem.herdLife <= 0) P.mem.herd = null;
      }
      P.mem.herd?.forEach((H, k) => {
        const dj = H.x - x, jump = Math.abs(dj) < 1.9 ? 1 - (dj / 1.9) ** 2 : 0;
        placeHorse(P.herd[k], H.x, jump * 1.75, k % 2 ? -0.35 : 0.35, H.dir, P.ph + k * 0.37, 1, { salto: jump });
        if (live && Math.random() < 0.35) e.solid.emit({ pos: V(H.x - H.dir * 0.7, 0.1, k % 2 ? -0.35 : 0.35), count: 2, speed: 1.2, dir: [-H.dir, 0.5, 0], spread: 0.7, color: '#d8c3a0', colorEnd: '#8a7458', life: 0.8, size: 0.35, grow: 2, drag: 2 });
      });

      // ---- LAZO: vueltas arriba de la cabeza, sale volando y lo laza del pecho
      if (tipo === 'lazo' && d) {
        const hd = this.hand(i, f);
        if (d.phase === 'twirl') {
          const c = V(hd.x, hd.y + 0.18, 0.05);
          P.loop.visible = true; P.loop.position.copy(c); P.loop.scale.setScalar(0.48);
          P.loop.rotation.set(Math.PI / 2 + Math.sin(tt * 0.55) * 0.3, 0, Math.cos(tt * 0.55) * 0.3);
          stretch(P.rope, hd, V(c.x + Math.cos(tt * 0.55) * 0.48, c.y, c.z + Math.sin(tt * 0.55) * 0.48));
        } else if (['out', 'back', 'pull'].includes(d.phase)) {
          const pull = d.phase === 'pull';
          const tip = pull ? V(ox, o.y + 1.15, 0) : V(x + f.facing * (0.6 + d.len), hd.y - 0.2 * Math.min(1, d.len / 4), 0);
          stretch(P.rope, hd, tip);
          P.loop.visible = true; P.loop.position.copy(tip);
          if (pull) { P.loop.scale.setScalar(0.34); P.loop.rotation.set(Math.PI / 2, 0, 0); }
          else { P.loop.scale.setScalar(0.38); P.loop.rotation.set(0, Math.PI / 2 - 0.5 * f.facing, 0); }
        }
      }

      // ---- CUERDAZO: la cuerda de la guitarra, como látigo
      if (tipo === 'cuerdazo' && d && f.t >= 6 && ['out', 'back', 'pull'].includes(d.phase)) {
        const hd = this.hand(i, f);
        const tip = d.phase === 'pull' ? V(ox, o.y + 1.3, 0.1) : V(x + f.facing * (0.7 + d.len), f.y + 1.3, 0.1);
        stretch(P.string, hd, tip, 0.014);
        if (live) e.glow.emit({ pos: tip, count: n, speed: 0.6, color: '#ffffff', colorEnd: s.color || '#b18cff', life: 0.15, size: 0.16 });
      }

      // ---- AMPLIFICADOR: cae del cielo, se azota en el piso y la bocina late con cada acorde
      if (tipo === 'amplificador' && d?.ampX != null) {
        const a = P.amp, beat = f.t >= 16 && f.t < 60 ? Math.max(0, Math.sin(tt * 0.9)) : 0;
        a.visible = true;
        a.position.set(d.ampX, f.t < 6 ? (6 - tt) * 0.4 : 0, -0.1);
        a.rotation.set(0, f.facing * 0.55, 0);
        a.scale.setScalar(1.7 * (1 + beat * 0.04));
        a.userData.cone.scale.set(1 + beat * 0.3, 1, 1 + beat * 0.3);
        if (live && beat > 0.5) {
          a.updateMatrixWorld(true);
          e.glow.emit({ pos: a.userData.cone.getWorldPosition(V()), count: 2 * n, speed: 4, dir: [f.facing, 0.1, 0], spread: 0.3, color: '#ffffff', colorEnd: s.color || '#b18cff', life: 0.3, size: 0.3 });
        }
        if (f.t >= 16 && f.t < 60) this.notas.arc(V(d.ampX, 1.0, 0.2), V(d.ampX + f.facing * 3.2, 1.5, 0.2), tt * 1.6, 4, s.color, 0.4);
      }

      // ---- SERENATA y los acordes: notas que salen de la guitarra
      if ((tipo === 'serenata' && f.t < 50) || (tipo === 'acorde' && f.t < 16)) {
        const from = this.guitar(i) || this.hand(i, f);
        if (tipo === 'serenata') this.notas.arc(from, V(ox, o.y + 1.75, 0.2), tt, 5, s.color, 0.7);
        else this.notas.arc(from, V(from.x + f.facing * 0.8, from.y + 0.5, 0.2), tt * 2, 2, s.color, 0.2);
      }

      // ---- HÉLICE: gira con los brazos estirados (el disco borroso a la altura de los hombros)
      if (tipo === 'helice' && f.t >= 4 && f.t < 42) {
        P.disc.visible = true;
        P.disc.position.set(x, f.y + 1.42 * f.sizeScale, 0);
        P.disc.material.opacity = 0.12 + 0.06 * Math.sin(tt * 2.3);
        if (live) e.glow.emit({ pos: V(x, f.y + 1.42, 0), count: 2 * n, speed: 5, dir: [0, 0.05, 0], spread: 1.6, color: '#ffffff', colorEnd: '#bfe9ff', life: 0.2, size: 0.12 });
      }

      // ---- AVIONETA FUMIGADORA: pasa rociando por donde estaba el rival (y se va aunque ya acabó el especial)
      if (tipo === 'fumigadora' && d?.tx != null) P.mem.plane = { x: d.tx + f.facing * (tt - 46) * 0.28, dir: f.facing, life: 1.6, spray: f.t >= 30 && f.t < 62 };
      else if (P.mem.plane) {
        const A = P.mem.plane;
        A.x += A.dir * 16.8 * dt; A.life -= dt; A.spray = false;
        if (A.life <= 0) P.mem.plane = null;
      }
      if (P.mem.plane) {
        const A = P.mem.plane, pl = P.plane, y = 3.05 + Math.sin(tt * 0.06) * 0.1;
        pl.visible = true;
        pl.position.set(A.x, y, 0.3);
        pl.rotation.set(Math.sin(tt * 0.05) * 0.08, A.dir > 0 ? 0 : Math.PI, 0.03);
        pl.userData.prop.rotation.x += Math.max(dt, 1 / 60) * 40;
        if (live && A.spray) {
          for (let k = 0; k < 2; k++) e.solid.emit({ pos: V(A.x - A.dir * 0.2, y - 0.35, (Math.random() - 0.5) * 6), count: n, speed: 0.6, dir: [0, -1, 0], spread: 0.5, color: '#eaffd8', colorEnd: '#9be15d', life: 1.3, size: 0.4, grow: 2.4, drag: 1.2, gravity: 1.5 });
        }
      }
    });

    // notas alrededor de cada acorde que va volando
    for (const p of g.projectiles) {
      if (!p.alive || p.kind !== 'acorde') continue;
      for (let j = 0; j < 2; j++) this.notas.put(V(p.x - Math.sign(p.vx) * 0.25 * j, p.y + 0.35 + Math.sin(p.t * 0.3 + j * 2) * 0.12, 0.25), 0.26, 0.9, p.color);
    }
  }

  // ---------------------------------------------------------------- proyectiles
  has(kind) { return KINDS.has(kind); }

  makeProjectile(p) {
    const g = new THREE.Group(), v = { obj: g, custom: true, nuevo: true, t: 0, light: null };
    if (p.kind === 'acorde') {
      // onda de sonido: tres arcos ")))" que laten
      v.rings = [0, 1, 2].map((k) => {
        const m = new THREE.Mesh(new THREE.RingGeometry(0.3 + k * 0.17, 0.37 + k * 0.17, 28, 1, -1.0, 2.0), glowMat(p.color, 0.8));
        m.material.side = THREE.DoubleSide; m.position.x = -k * 0.12; g.add(m);
        return m;
      });
      v.light = { color: p.color, power: 5 };
    } else if (p.kind === 'avion_papel') {
      v.plane = makePaperPlane(); v.plane.scale.setScalar(1.4); g.add(v.plane);
    } else if (p.kind === 'caja') {
      v.box = makeBlackBox(); v.box.scale.setScalar(1.7); g.add(v.box);
    } else {
      // remache o bala: punta brillante con su estela
      const bala = p.kind === 'tiro';
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, bala ? 0.4 : 0.14, 6), new THREE.MeshBasicMaterial({ color: bala ? '#fff3c0' : '#e6edf3' }));
      core.rotation.z = Math.PI / 2; g.add(core);
      const streak = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.008, bala ? 1.4 : 0.6, 6), glowMat(bala ? '#ffb347' : '#ffd27a', 0.55));
      streak.rotation.z = Math.PI / 2; streak.position.x = bala ? -0.8 : -0.35; g.add(streak);
    }
    this.g.scene.add(g);
    return v;
  }

  syncProjectile(p, v, dt, n) {
    const e = this.g.effects, dir = Math.sign(p.vx) || 1;
    if (v.rings) {
      v.rings.forEach((m, k) => {
        const w = Math.sin(v.t * 18 - k * 1.3);
        m.scale.set(1 + 0.15 * w, 1 + 0.15 * w, 1); m.material.opacity = 0.6 + 0.3 * w;
      });
      if (dt > 0) e.glow.emit({ pos: v.obj.position, count: 2 * n, speed: 1, dir: [-dir, 0, 0], spread: 0.6, color: '#ffffff', colorEnd: p.color, life: 0.3, size: 0.3 });
    } else if (v.plane) {
      v.obj.rotation.set(0, dir > 0 ? 0 : Math.PI, Math.atan2(p.vy || 0, Math.abs(p.vx)) * 0.8);
      v.plane.rotation.x = Math.sin(v.t * 6) * 0.3;   // se ladea como avión de papel
      if (dt > 0 && Math.random() < 0.4) e.glow.emit({ pos: v.obj.position, count: 1, speed: 0.3, jitter: 0.1, color: '#ffffff', colorEnd: '#bfe9ff', life: 0.3, size: 0.12 });
    } else if (v.box) {
      v.box.rotation.z -= dir * Math.max(dt, 1 / 60) * 9; v.box.rotation.x += Math.max(dt, 1 / 60) * 4;
    } else if (dt > 0 && p.kind === 'remache' && Math.random() < 0.5) {
      e.glow.emit({ pos: v.obj.position, count: 1, speed: 1, dir: [-dir, 0, 0], spread: 0.4, color: '#ffffff', colorEnd: '#ffd27a', life: 0.12, size: 0.1 });
    }
  }
}
