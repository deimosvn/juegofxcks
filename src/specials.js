import * as THREE from 'three';
import { sfx } from './audio.js';

// =====================================================================
//  HABILIDADES ESPECIALES
//  Cada tipo define: total (frames), anim (animación), start, update
//  (devuelve true al terminar), onLand e interrupt opcionales.
//  En roster.js cada especial elige un `tipo` y lo ajusta con color,
//  danio y, si existe, `animacion` (nombre de un clip propio).
//
//  Regla para el modo en línea: aquí solo se guarda estado con datos
//  simples (números, textos). Nada de mallas ni objetos de Three.js:
//  lo visual se dibuja en main.js a partir de este estado.
// =====================================================================

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const ARENA = 9;
export const MISSILE_G = 20;

// ---------------------------------------------------------------------
//  Proyectiles (datos simples; las mallas las pone la vista)
//  kind: bola | hielo | puno (puño cohete) | misil
// ---------------------------------------------------------------------
export function spawnProjectile(g, f, kind, spec, extra = {}) {
  const p = {
    id: ++g.projSeq, owner: f.side, kind, color: spec.color || '#ff6a00',
    x: f.x + f.facing * 0.8, y: f.y + 1.38, vx: (spec.velocidad ?? 10) * f.facing, vy: 0,
    t: 0, alive: true, dmg: spec.danio ?? 10, ...extra,
  };
  g.projectiles.push(p);
  return p;
}

export const SOLID_PROJECTILES = new Set(['bola', 'hielo', 'puno', 'cohete']);

export function updateProjectile(p, g) {
  const owner = g.fighters[p.owner], opp = g.fighters[1 - p.owner];
  p.t++;
  if (p.kind === 'misil') {
    p.vy -= MISSILE_G / 60; p.x += p.vx / 60; p.y += p.vy / 60;
    const body = !opp.invulnerable() && Math.abs(opp.x - p.x) < 0.4 && p.y > opp.y && p.y < opp.y + opp.height;
    if (p.y <= 0.05 || body) explodeMissile(p, g, owner, opp);
    return;
  }
  p.x += p.vx / 60;
  if (Math.abs(p.x) > ARENA + 2) { p.alive = false; return; }
  if (!opp.invulnerable() && Math.abs(opp.x - p.x) < 0.45 && p.y > opp.y - 0.1 && p.y < opp.y + opp.height + 0.1) {
    const hit = { dmg: p.dmg, height: 'mid', hitstun: 22, push: 3.5, color: p.color };
    if (p.kind === 'hielo') hit.freeze = p.freeze ?? 100;
    if (p.kind === 'puno') { hit.knockdown = true; hit.push = 6; }
    opp.receive(hit, owner, V(p.x, p.y, 0.3));
    impactProjectile(p, g);
  }
}

export function impactProjectile(p, g) {
  p.alive = false;
  const pos = V(p.x, p.y, 0.2);
  if (p.kind === 'puno') { g.effects.explosion(pos, '#ffb347', 0.6); sfx.clank(); return; }
  if (p.kind === 'cohete') { g.effects.explosion(pos, '#ff7a1a', 1.0); sfx.smallBoom(); return; }
  g.effects.burst(pos, p.color, 50, 6);
  if (p.kind === 'hielo') g.effects.shards(V(p.x, p.y), p.color, 6);
}

function explodeMissile(p, g, owner, opp) {
  p.alive = false;
  g.effects.explosion(V(p.x, Math.max(p.y, 0.25), 0.2), p.color, 0.8);
  sfx.smallBoom();
  if (!opp.invulnerable() && Math.abs(opp.x - p.x) < 0.95 && opp.y < 1.8) {
    opp.receive({ dmg: p.dmg, height: 'mid', hitstun: 16, push: 2.5, color: p.color, knockdown: !!p.last }, owner, V(opp.x, opp.y + 1.0, 0.3));
  }
}

function aura(g, f, color, n = 3) { g.effects.aura(V(f.x, f.y + 0.9), color, n); }

// ---------------------------------------------------------------------
export const SPECIALS = {
  // Lanza una bola de energía (fuego, plasma, lo que quieras)
  proyectil: {
    total: 38, anim: 'lanzar', s: 14 / 38, a: 22 / 38,
    canStart: (f, o, s, g) => !g.hasProjectile(f),
    update(f, o, s, g, t) {
      if (t < 14 && t % 2 === 0) g.effects.aura(f.hand, s.color, 4);
      if (t === 14) { spawnProjectile(g, f, 'bola', s); sfx.fire(); }
      return t >= 38;
    },
  },

  // Proyectil que congela al rival
  congelar: {
    total: 40, anim: 'lanzar', s: 14 / 40, a: 22 / 40,
    canStart: (f, o, s, g) => !g.hasProjectile(f),
    update(f, o, s, g, t) {
      if (t < 14 && t % 2 === 0) g.effects.aura(f.hand, s.color, 4);
      if (t === 14) { spawnProjectile(g, f, 'hielo', s, { vx: (s.velocidad ?? 8) * f.facing, freeze: s.duracion ?? 100 }); sfx.ice(); }
      return t >= 40;
    },
  },

  // Desaparece en humo y reaparece detrás del rival con una patada
  teletransporte: {
    total: 46, anim: 'especial',
    start(f, o, s, g) {
      g.effects.smoke(f.chest, '#222', 30); g.effects.burst(f.chest, s.color, 40, 4);
      f.hidden = true; f.invuln = 20; sfx.teleport();
    },
    update(f, o, s, g, t) {
      const d = f.specData;
      if (t === 14) {
        const side = f.x < o.x ? 1 : -1;
        let nx = o.x + side * 1.0;
        if (Math.abs(nx) > ARENA - 0.3) nx = o.x - side * 1.0;
        f.x = nx; f.faceOpponent(o);
        f.hidden = false;
        g.effects.burst(f.chest, s.color, 50, 5); g.effects.smoke(f.chest, '#222', 20);
        f.anim(s.animacion || 'patada', 26, 6 / 26, 14 / 26);
        sfx.teleport();
      }
      if (t > 19 && t <= 27 && !d.hit && f.reaches(o, 1.4, 1.3)) {
        d.hit = true;
        o.receive({ dmg: s.danio ?? 9, height: 'mid', knockdown: true, push: 5, color: s.color }, f);
      }
      return t >= 46;
    },
    interrupt(f) { f.hidden = false; },
  },

  // Carga hacia adelante a toda velocidad
  embestida: {
    total: 42, anim: 'carga',
    update(f, o, s, g, t) {
      const d = f.specData;
      if (t < 8) aura(g, f, s.color, 2);
      if (t === 8) { f.anim(s.animacion || 'embestida'); sfx.whoosh(); }
      if (t >= 8 && t < 28 && !d.hit) {
        f.vx = 15 * f.facing * f.speed;
        g.effects.emitGlow({ pos: V(f.x, f.y + 1.0), count: 6, speed: 1, jitter: 0.9, color: s.color, colorEnd: '#000000', life: 0.35, size: 0.35 });
        if (f.reaches(o, 0.75, 1.0)) {
          d.hit = true; f.vx = -3 * f.facing;
          o.receive({ dmg: s.danio ?? 11, height: 'mid', knockdown: true, push: 8, color: s.color }, f);
        }
      } else f.vx *= 0.8;
      if (t === 28 || (d.hit && !d.slowed)) { d.slowed = true; f.anim('idle'); }
      return t >= 42;
    },
  },

  // Salta y golpea el suelo: onda expansiva (bloquear agachado)
  terremoto: {
    total: 0, anim: 'saltar',
    start(f, o, s, g) {
      f.vy = 13;
      f.vx = THREE.MathUtils.clamp((o.x - f.x) / 0.8, -7, 7);
      f.anim(s.animacion || 'saltar', 50);
      sfx.jump();
    },
    update(f, o, s, g, t) {
      const d = f.specData;
      if (!d.landed) {
        aura(g, f, s.color, 3);
        if (f.vy < 0) f.vy -= 1.5;       // cae con fuerza
        return false;
      }
      return f.t - d.landT >= 22;
    },
    onLand(f, o, s, g) {
      const d = f.specData;
      if (d.landed) return;
      d.landed = true; d.landT = f.t; f.vx = 0;
      f.anim('agacharse');
      g.effects.ring(f.x, s.color, 3.5); g.effects.ring(f.x, '#ffffff', 2.4, 0.3);
      g.effects.dust(V(f.x, 0.1), 40); g.effects.addShake(0.4); sfx.boom();
      if (o.y < 0.2 && Math.abs(o.x - f.x) < 3.3) o.receive({ dmg: s.danio ?? 12, height: 'low', knockdown: true, push: 5, color: s.color }, f, V(o.x, 0.3, 0.3));
    },
  },

  // Lanza una cadena; si atrapa al rival lo jala y lo deja aturdido.
  // La cadena se dibuja en main.js leyendo specData.len / specData.phase.
  gancho: {
    total: 0, anim: 'lanzar', s: 0.4, a: 0.8,
    start(f) {
      const d = f.specData;
      d.len = 0; d.phase = 'out';
      f.anim(f.spec.animacion || 'lanzar', 22, 0.4, 0.9);
    },
    update(f, o, s, g, t) {
      const d = f.specData;
      if (t < 8) return false;
      if (t === 8) sfx.chain();
      const hand = f.hand;
      if (d.phase === 'out') {
        d.len += 0.34;
        const tipX = hand.x + f.facing * d.len;
        if (!o.invulnerable() && Math.abs(o.x - tipX) < 0.4 && o.y < 1.2) {
          const r = o.receive({ dmg: s.danio ?? 5, height: 'mid', push: 0, color: '#fff', pull: true }, f, V(tipX, hand.y, 0.3));
          d.phase = r === 'hit' && !o.dead ? 'pull' : 'back';
        } else if (d.len > 6.5) d.phase = 'back';
      } else if (d.phase === 'pull') {
        const target = f.x + f.facing * 1.0;
        o.x += (target - o.x) * 0.22; o.vx = 0;
        d.len = Math.abs(o.x - hand.x);
        if (Math.abs(o.x - target) < 0.1) { o.setState('stunned', 'mareado'); o.stunDur = 60; d.phase = 'end'; d.endT = t; }
      } else if (d.phase === 'back') {
        d.len -= 0.5;
        if (d.len <= 0) { d.phase = 'end'; d.endT = t; }
      }
      return d.phase === 'end' && t - d.endT > 6;
    },
  },

  // Gancho volador envuelto en energía, lanza al rival por los aires
  uppercut_volador: {
    total: 0, anim: 'agacharse',
    start(f) { f.invuln = 10; },
    update(f, o, s, g, t) {
      const d = f.specData;
      if (t === 5) { f.vy = 13; f.vx = 2.2 * f.facing; f.anim(s.animacion || 'gancho_arriba', 32, 0.05, 0.6); sfx.fire(); }
      if (t >= 5 && t < 28) g.effects.emitGlow({ pos: V(f.x + f.facing * 0.35, f.y + 2.0), count: 5, speed: 2, dir: [0, -1, 0], spread: 0.6, jitter: 0.3, color: '#ffffff', colorEnd: s.color, life: 0.35, size: 0.3 });
      if (t >= 5 && t <= 22 && !d.hit && f.reaches(o, 1.0, 1.4)) {
        d.hit = true;
        o.receive({ dmg: s.danio ?? 13, height: 'mid', launch: 13, push: 2, color: s.color }, f);
      }
      return d.landed && f.t - d.landT > 12;
    },
    onLand(f) { const d = f.specData; if (d.landed || f.t < 8) return; d.landed = true; d.landT = f.t; f.vx = 0; f.anim('agacharse'); },
  },

  // Se llena de poder: +50% de daño durante 7 segundos
  poder: {
    total: 50, anim: 'carga',
    canStart: (f) => f.buffTimer <= 0,
    update(f, o, s, g, t) {
      if (t % 2 === 0) aura(g, f, s.color, 6);
      if (t === 30) {
        g.effects.burst(f.chest, s.color, 90, 7); g.effects.ring(f.x, s.color, 3);
        g.effects.addShake(0.2); sfx.magic();
        f.buffTimer = 60 * (s.duracion ?? 7); f.buffKind = 'dmg'; f.buffColor = s.color;
      }
      return t >= 50;
    },
  },

  // Invoca un rayo del cielo sobre el rival
  rayo: {
    total: 48, anim: 'especial',
    start(f, o, s) { f.anim(s.animacion || 'especial', 48, 0.3, 0.8); },
    update(f, o, s, g, t) {
      const d = f.specData;
      if (t === 6) {
        d.x = o.x;
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.7, 32), new THREE.MeshBasicMaterial({ color: s.color, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2; ring.position.set(d.x, 0.04, 0);
        g.effects.addTemp(ring, 0.4, (dt, k) => { ring.material.opacity = 0.4 + Math.sin(k * 30) * 0.4; ring.scale.setScalar(1.3 - k * 0.5); });
        sfx.magic();
      }
      if (t > 6 && t < 28 && t % 2 === 0) g.effects.aura(f.hand, s.color, 2);
      if (t === 28) {
        g.effects.lightning(V(d.x, 13, 0), V(d.x, 0, 0), s.color, 0.4);
        g.effects.lightning(V(d.x + 0.8, 13, -1), V(d.x, 0, 0), '#ffffff', 0.25);
        g.effects.burst(V(d.x, 0.3), s.color, 70, 6); g.effects.ring(d.x, s.color, 2);
        g.effects.addShake(0.3); sfx.zap();
        if (Math.abs(o.x - d.x) < 0.9) o.receive({ dmg: s.danio ?? 12, height: 'mid', knockdown: true, push: 2, color: s.color }, f, V(o.x, 1.2, 0.3));
      }
      return t >= 48;
    },
  },

  // ==================================================================
  //  ROBOT
  // ==================================================================

  // El antebrazo sale disparado como un cohete (el brazo se ve sin antebrazo mientras vuela)
  puno_cohete: {
    total: 36, anim: 'puno_fuerte', s: 10 / 36, a: 30 / 36,
    canStart: (f, o, s, g) => !g.hasProjectile(f),
    update(f, o, s, g, t) {
      if (t === 2) sfx.servo();
      if (t < 10) g.effects.emitGlow({ pos: f.hand, count: 3, speed: 2, color: '#ffffff', colorEnd: '#ff8a00', life: 0.2, size: 0.15 });
      if (t === 10) {
        spawnProjectile(g, f, 'puno', s, { y: f.y + 1.42, vx: (s.velocidad ?? 14) * f.facing });
        g.effects.smoke(f.hand, '#666', 12);
        sfx.rocket();
      }
      return t >= 36;
    },
  },

  // Láser desde los ojos: varios impactos seguidos. Pasa por encima si el rival se agacha.
  laser: {
    total: 50, anim: 'laser', s: 14 / 50, a: 36 / 50,
    update(f, o, s, g, t) {
      if (t === 1) sfx.charge();
      if (t === 14) sfx.laser();
      if (t >= 14 && t < 36 && (t - 14) % 5 === 0) {
        const y = f.y + 1.62;
        const ahead = (o.x - f.x) * f.facing > 0;
        if (ahead && !o.invulnerable() && y >= o.y && y <= o.y + o.height + 0.05) {
          const last = t >= 34;
          o.receive({ dmg: (s.danio ?? 14) / 5, height: 'high', hitstun: last ? 22 : 12, push: last ? 4 : 1.2, color: s.color }, f, V(o.x - f.facing * 0.2, y, 0.3));
        }
      }
      return t >= 50;
    },
  },

  // Lluvia de misiles desde la espalda que caen alrededor del rival
  misiles: {
    total: 52, anim: 'misiles', s: 12 / 52, a: 36 / 52,
    update(f, o, s, g, t) {
      if (t === 2) sfx.servo();
      const i = [12, 18, 24, 30].indexOf(t);
      if (i >= 0) {
        const x0 = f.x - f.facing * 0.25, y0 = f.y + 1.65;
        const tx = THREE.MathUtils.clamp(o.x + f.facing * (i - 1) * 0.55, -ARENA, ARENA);
        const vy = 8 + i * 0.4;
        const T = (vy + Math.sqrt(vy * vy + 2 * MISSILE_G * y0)) / MISSILE_G;
        spawnProjectile(g, f, 'misil', s, { x: x0, y: y0, vx: (tx - x0) / T, vy, dmg: (s.danio ?? 16) / 4, last: i === 3 });
        g.effects.smoke(V(x0, y0), '#666', 8);
        sfx.missile();
      }
      return t >= 52;
    },
  },

  // Armadura de titanio: recibe la mitad de daño y no sufre daño por bloqueo
  armadura: {
    total: 46, anim: 'carga',
    canStart: (f) => f.buffTimer <= 0,
    update(f, o, s, g, t) {
      if (t % 3 === 0) aura(g, f, s.color, 4);
      if (t === 6) sfx.servo();
      if (t === 26) {
        g.effects.burst(f.chest, s.color, 80, 6); g.effects.ring(f.x, s.color, 2.6);
        g.effects.addShake(0.15); sfx.armor();
        f.buffTimer = 60 * (s.duracion ?? 6); f.buffKind = 'armor'; f.buffColor = s.color;
      }
      return t >= 46;
    },
  },
};

// =====================================================================
//  FATALIDADES — se ejecutan con la entrada correcta durante "¡ACÁBALO!"
//  fatal(t, ganador, perdedor, definición, juego, datos) -> true al terminar
//  `datos` es un objeto simple que se guarda con el estado (rollback).
// =====================================================================
export const FATALITIES = {
  explosion(t, w, l, fat, g) {
    if (t === 1) w.anim('especial', 40, 0.5, 0.9);
    if (t < 40) g.effects.aura(l.chest, fat.color || '#f80', 6);
    if (t === 40) { l.hidden = true; g.effects.gore(l.chest, 1.4); g.effects.burst(l.chest, fat.color || '#f80', 140, 9); g.effects.addShake(0.6); sfx.boom(); }
    if (t === 70) w.anim('victoria');
    return t >= 150;
  },

  incinerar(t, w, l, fat, g) {
    if (t === 1) { w.anim('lanzar', 30, 0.4, 0.9); l.anim('mareado'); }
    if (t > 10 && t < 110) {
      for (let i = 0; i < 6; i++) g.effects.emitGlow({ pos: V(l.x + (Math.random() - 0.5) * 0.6, Math.random() * 1.9, 0.1), count: 1, speed: 2.5, dir: [0, 1, 0], spread: 0.3, color: '#ffe08a', colorEnd: fat.color || '#ff3a00', life: 0.6, size: 0.4 });
      l.burn = Math.min(1, (t - 10) / 70);
      if (t % 12 === 0) sfx.fire();
      g.effects.flash(l.chest, '#ff6a00', 3);
    }
    if (t === 110) { l.hidden = true; g.effects.smoke(V(l.x, 0.9), '#111', 70); g.effects.dust(V(l.x, 0.2), 50); sfx.boom(); }
    if (t === 130) w.anim('victoria');
    return t >= 190;
  },

  congelar_romper(t, w, l, fat, g) {
    if (t === 1) w.anim('lanzar', 30, 0.4, 0.9);
    if (t === 14) { l.iced = true; sfx.ice(); }
    if (t === 50) { w.x = l.x - w.facing * 1.2; w.anim('patada_giratoria', 28, 12 / 28, 17 / 28); }
    if (t === 62) {
      l.iced = false; l.hidden = true;
      g.effects.shards(l.chest, '#bfefff', 40); g.effects.gore(l.chest, 0.5); g.effects.addShake(0.5); sfx.shatter();
    }
    if (t === 100) w.anim('victoria');
    return t >= 170;
  },

  rayo(t, w, l, fat, g) {
    if (t === 1) w.anim('especial', 80, 0.2, 0.9);
    if ([10, 24, 38, 52].includes(t)) {
      g.effects.lightning(V(l.x + (Math.random() - 0.5), 13), V(l.x, 1.0), fat.color || '#bdf', 0.3);
      l.anim('golpeado'); l.burn = t / 60; g.effects.addShake(0.2); sfx.zap();
    }
    if (t === 70) { l.hidden = true; g.effects.gore(l.chest, 1); g.effects.burst(l.chest, fat.color || '#bdf', 120, 8); sfx.boom(); g.effects.addShake(0.5); }
    if (t === 100) w.anim('victoria');
    return t >= 170;
  },

  aplastar(t, w, l, fat, g, data) {
    if (t === 1) { data.x0 = w.x; w.anim('saltar', 40); sfx.jump(); }
    if (t <= 36) {
      const k = t / 36;
      w.x = data.x0 + (l.x - data.x0) * k;
      w.y = Math.sin(Math.PI * k) * 5;
    }
    if (t === 36) {
      w.y = 0; l.squash = 0.12;
      g.effects.gore(V(l.x, 0.2), 1.2); g.effects.dust(V(l.x, 0.1), 50); g.effects.ring(l.x, '#a00', 3);
      g.effects.addShake(0.6); sfx.boom(); w.anim('agacharse');
    }
    if (t === 80) w.anim('victoria');
    return t >= 160;
  },

  // Robot: escaneo láser y el rival se deshace en cubos de luz (los rayos se dibujan en main.js)
  desintegrar(t, w, l, fat, g) {
    if (t === 1) { w.anim('laser', 80, 0.1, 0.95); l.anim('mareado'); sfx.charge(); }
    if (t === 12 || t === 36) sfx.laser();
    if (t > 12 && t < 70 && t % 4 === 0) g.effects.emitGlow({ pos: V(l.x, 0.2 + Math.random() * 1.7, 0.2), count: 3, speed: 1.5, color: '#ffffff', colorEnd: fat.color || '#4fd8ff', life: 0.3, size: 0.12 });
    if (t === 70) {
      l.hidden = true;
      g.effects.voxels(V(l.x, 0, 0), fat.color || '#4fd8ff', 300);
      g.effects.flash(l.chest, fat.color || '#4fd8ff', 10); g.effects.addShake(0.25); sfx.voxel();
    }
    if (t === 110) w.anim('victoria');
    return t >= 190;
  },
};
