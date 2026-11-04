import * as THREE from 'three';
import { sfx } from './audio.js';
import { SPECIALS, FATALITIES, PROJ_UPDATE, SOLID_PROJECTILES, spawnProjectile } from './specials.js';
import { PICADA } from './especiales-extra.js';
import { BRUTALITIES } from './brutalidades.js';

// =====================================================================
//  ABEL (guitarra) · DIEGO SUÁREZ (aviones y la planta aeroespacial) · JAZIEL (vaquero y caballos)
//  Sus especiales, su picada en el aire, sus fatalities y sus brutalities.
//  Mismas reglas que specials.js: aquí solo estado con datos simples (en línea las dos
//  computadoras lo calculan igual); los caballos, la guitarra, los aviones, el bebé… los
//  dibuja vista-nuevos.js leyendo este estado.
// =====================================================================

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const ARENA = 9;
const clamp = THREE.MathUtils.clamp;
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const CAJA_G = 16;   // gravedad de la caja negra que rebota
SOLID_PROJECTILES.add('caja');

// ---------------------------------------------------------------- caballos (Jaziel)
// Dónde va cada caballo de una estampida (los mismos números en la vista): salen de x0 hacia `dir`,
// uno cada `gap` cuadros, a `vel` m/s
export const ESTAMPIDA = { n: 5, gap: 4, vel: 18, desde: 14 };
export function caballoX(d, t, i, cfg = ESTAMPIDA, t0 = cfg.desde) {
  return d.x0 + d.dir * cfg.vel / 60 * Math.max(0, t - t0 - i * cfg.gap);
}
// el caballo i cruzó x entre el cuadro anterior y este
const cruza = (d, t, i, x, cfg, t0) => {
  const a = caballoX(d, t - 1, i, cfg, t0), b = caballoX(d, t, i, cfg, t0);
  return a !== b && (x - a) * d.dir > 0 && (x - b) * d.dir <= 0;
};

// chispa chica (en las tomas de cerca la normal tapa todo)
function spark(g, pos, color, strong) {
  g.effects.burst(pos, color, strong ? 26 : 14, strong ? 6 : 4.5, 0.12);
  g.effects.emitGlow({ pos, count: 1, speed: 0, color: '#ffffff', colorEnd: color, life: 0.08, size: strong ? 0.75 : 0.5 });
}
const noOwn = (kind) => (f, o, s, g) => !g.projectiles.some((p) => p.alive && p.owner === f.side && p.kind === kind);
// astillas de la guitarra (madera y pedacitos morados) que caen al piso
function astillas(g, pos, n) {
  g.effects.emitSolid({ pos, count: n, speed: 5, color: '#8a5a32', colorEnd: '#4a2c16', life: 0.9, size: 0.07, gravity: 12, drag: 0.4 });
  g.effects.emitSolid({ pos, count: Math.round(n / 3), speed: 4, color: '#8a5cff', colorEnd: '#4a1a9a', life: 0.8, size: 0.06, gravity: 12, drag: 0.4 });
}

Object.assign(SPECIALS, {
  // ================================================================ ABEL
  // ACORDE SÓNICO: rasguea con todo y sale una onda de sonido que avanza
  acorde: {
    total: 40, anim: 'guitarra', s: 0.25, a: 0.6,
    canStart: noOwn('acorde'),
    update(f, o, s, g, t) {
      if (t === 9) {
        spawnProjectile(g, f, 'acorde', s, { x: f.x + f.facing * 0.75, y: f.y + 1.15 * f.sizeScale, vx: (s.velocidad ?? 8.5) * f.facing });
        sfx.powerChord();
      }
      return t >= 40;
    },
  },

  // GUITARRAZO: se lanza con la guitarra arriba y se la rompe en la cabeza (hay que cubrirse parado)
  guitarrazo: {
    total: 46, anim: 'guitarrazo', s: 16 / 46, a: 22 / 46,
    update(f, o, s, g, t) {
      const d = f.specData;
      if (t < 12) f.vx = 5 * f.facing * f.speed; else f.vx *= 0.6;
      if (t === 4) sfx.whoosh(true);
      if (t >= 15 && t <= 19 && !d.hit && f.reaches(o, 1.35, 1.6)) {
        d.hit = true;
        const p = V(o.x - f.facing * 0.15, o.y + 1.65, 0.3);
        const r = o.receive({ dmg: s.danio ?? 15, height: 'overhead', knockdown: true, push: 5, color: s.color }, f, p);
        if (r === 'hit') { astillas(g, p, 26); g.effects.burst(p, '#ffd27a', 30, 5); sfx.splinter(); sfx.strum(); }
      }
      if (t === 18 && !d.hit) { g.effects.dust(V(f.x + f.facing * 1.2, 0.1), 20); sfx.thump(); }
      return t >= 46;
    },
  },

  // AMPLIFICADOR: azota un amplificador en el piso y suelta un acorde que empuja una y otra vez
  amplificador: {
    total: 72, anim: 'guitarra', s: 0.25, a: 0.8,
    start(f) { f.specData.ampX = clamp(f.x + f.facing * 0.95, -ARENA, ARENA); },
    update(f, o, s, g, t) {
      const d = f.specData;
      if (t === 6) { sfx.thump(); g.effects.dust(V(d.ampX, 0.1), 16); }
      if (t === 16) { sfx.powerChord(); sfx.feedback(); }
      if (t >= 18 && t < 60 && (t - 18) % 7 === 0) {
        const dx = (o.x - d.ampX) * f.facing;
        if (dx > -0.2 && dx < 3.6 && o.y < 2 && !o.invulnerable()) {
          o.receive({ dmg: (s.danio ?? 16) / 6, height: 'mid', hitstun: 14, push: 2.2, color: s.color }, f, V(o.x - f.facing * 0.2, o.y + 1.2, 0.3));
        }
        g.effects.ring(d.ampX + f.facing * 0.5, s.color || '#ff4fd8', 1.4, 0.3);
      }
      return t >= 72;
    },
  },

  // SERENATA: toca algo bonito; si el otro está cerca se le cierran los ojos y se queda dormido un rato
  serenata: {
    total: 64, anim: 'guitarra', s: 0.3, a: 0.75,
    update(f, o, s, g, t) {
      if (t === 6 || t === 14 || t === 22) sfx.note(t / 4);
      if (t === 30) {
        const dx = (o.x - f.x) * f.facing;
        if (dx > -0.3 && dx < 4.2 && o.y < 1.2 && !o.invulnerable()) {
          const r = o.receive({ dmg: s.danio ?? 5, height: 'mid', hitstun: 16, push: 0.5, unblockable: true, color: s.color }, f, V(o.x, o.y + 1.7, 0.3));
          if (r === 'hit' && !o.dead && o.state === 'hitstun') { o.setState('stunned', 'mareado'); o.stunDur = 75; sfx.magic(); }
        }
      }
      return t >= 64;
    },
  },

  // CUERDAZO: le revienta una cuerda a la guitarra y la usa de látigo: lo engancha y lo jala
  cuerdazo: {
    total: 0, anim: 'lanzar', s: 0.3, a: 0.7,
    start(f) { const d = f.specData; d.len = 0; d.phase = 'out'; f.anim('lanzar', 20, 0.35, 0.8); },
    update(f, o, s, g, t) {
      const d = f.specData;
      if (t < 6) return false;
      if (t === 6) sfx.whip();
      if (d.phase === 'out') {
        d.len += 0.55;
        const tipX = f.x + f.facing * (0.7 + d.len);
        if (!o.invulnerable() && Math.abs(o.x - tipX) < 0.45 && o.y < 1.6) {
          const r = o.receive({ dmg: s.danio ?? 8, height: 'mid', push: 0, color: s.color, pull: true }, f, V(tipX, f.y + 1.3, 0.3));
          d.phase = r === 'hit' && !o.dead ? 'pull' : 'back';
          if (d.phase === 'pull') sfx.whip();
        } else if (d.len > 3.8) d.phase = 'back';
      } else if (d.phase === 'pull') {
        const target = f.x + f.facing * 1.0;
        o.x += (target - o.x) * 0.25; o.vx = 0;
        d.len = Math.max(0, Math.abs(o.x - f.x) - 0.7);
        if (Math.abs(o.x - target) < 0.12 || t > 70) { o.setState('stunned', 'mareado'); o.stunDur = 40; d.phase = 'end'; d.endT = t; sfx.note(7); }
      } else if (d.phase === 'back') {
        d.len -= 0.7;
        if (d.len <= 0) { d.phase = 'end'; d.endT = t; }
      }
      return d.phase === 'end' && t - d.endT > 6;
    },
    interrupt(f, g) { const o = g.other(f); if (f.specData?.phase === 'pull' && o.state === 'pulled') o.setState('idle'); },
  },

  // ================================================================ DIEGO SUÁREZ
  // AVIÓN DE PAPEL: lo avienta y vuela en ondas buscando al rival
  avion_papel: {
    total: 38, anim: 'lanzar', s: 0.35, a: 0.6,
    canStart: noOwn('avion_papel'),
    update(f, o, s, g, t) {
      if (t === 12) {
        spawnProjectile(g, f, 'avion_papel', s, { x: f.x + f.facing * 0.7, y: f.y + 1.5, y0: f.y + 1.4, vx: (s.velocidad ?? 6.5) * f.facing });
        sfx.paper();
      }
      return t >= 38;
    },
  },

  // REMACHADORA: ráfaga de remaches de la planta; el último lo empuja
  remachadora: {
    total: 52, anim: 'remachar', s: 0.2, a: 0.8,
    update(f, o, s, g, t) {
      if (t === 4) sfx.servo();
      if (t >= 10 && t <= 40 && (t - 10) % 5 === 0) {
        const k = (t - 10) / 5, y = f.y + 1.36 * f.sizeScale + (k % 2 ? 0.07 : -0.07);
        spawnProjectile(g, f, 'remache', s, { x: f.x + f.facing * 0.95, y, vx: 22 * f.facing, dmg: (s.danio ?? 12) / 7, last: t === 40 });
        sfx.rivet();
        g.effects.emitGlow({ pos: V(f.x + f.facing * 1.0, y, 0.25), count: 4, speed: 3, dir: [f.facing, 0, 0], spread: 0.4, color: '#ffffff', colorEnd: '#ffd27a', life: 0.1, size: 0.12 });
      }
      return t >= 52;
    },
  },

  // AVIONETA FUMIGADORA: con las paletas le hace señas a una avioneta que pasa rociando donde estaba el rival
  fumigadora: {
    total: 70, anim: 'senalero',
    start(f, o) { f.specData.tx = clamp(o.x, -ARENA, ARENA); },
    update(f, o, s, g, t) {
      const d = f.specData;
      if (t === 2) sfx.whistle();
      if (t === 8) sfx.propeller(1.6);
      if (t >= 34 && t <= 58 && (t - 34) % 8 === 0) {
        if (!o.invulnerable() && Math.abs(o.x - d.tx) < 1.7 && o.y < 2.2) {
          const r = o.receive({ dmg: (s.danio ?? 13) / 4, height: 'overhead', hitstun: 16, push: 0.6, color: s.color }, f, V(o.x, o.y + 1.6, 0.3));
          if (r === 'hit' && t === 58 && !o.dead && o.state === 'hitstun') { o.setState('stunned', 'mareado'); o.stunDur = 50; sfx.cough(); }
        }
      }
      return t >= 70;
    },
  },

  // HÉLICE: gira como hélice con los brazos estirados y avanza pegando varias veces
  helice: {
    total: 54, anim: 'helice',
    update(f, o, s, g, t) {
      if (t === 2) sfx.propeller(0.9);
      if (t >= 6 && t < 40) {
        f.vx = 3.6 * f.facing * f.speed;
        if ((t - 6) % 6 === 0 && f.reaches(o, 1.05, 1.3)) {
          const last = t >= 36;
          o.receive({ dmg: (s.danio ?? 13) / 6, height: 'mid', hitstun: 14, push: last ? 5 : 1, launch: last ? 6 : 0, knockdown: last, color: s.color }, f, V(o.x - f.facing * 0.2, o.y + 1.2, 0.3));
        }
      } else f.vx *= 0.7;
      if (t === 44) f.faceOpponent(o);
      return t >= 54;
    },
  },

  // CAJA NEGRA: la avienta (es naranja y no se rompe nunca): rebota dos veces y tumba al que pega
  caja_negra: {
    total: 40, anim: 'lanzar', s: 0.4, a: 0.6,
    canStart: noOwn('caja'),
    update(f, o, s, g, t) {
      if (t === 12) { spawnProjectile(g, f, 'caja', s, { x: f.x + f.facing * 0.6, y: f.y + 1.5, vx: 6.5 * f.facing, vy: 5, bounces: 0 }); sfx.whoosh(true); }
      return t >= 40;
    },
  },

  // ================================================================ JAZIEL
  // LAZO: le da vueltas arriba de la cabeza, lo avienta y si lo laza lo jala hasta él
  lazo: {
    total: 0, anim: 'lazo',
    start(f) { const d = f.specData; d.len = 0; d.phase = 'twirl'; f.anim('lazo', 18); },
    update(f, o, s, g, t) {
      const d = f.specData;
      if (d.phase === 'twirl') {
        if (t % 8 === 0) sfx.whoosh();
        if (t >= 16) { d.phase = 'out'; f.anim('lanzar', 20, 0.3, 0.8); sfx.whoosh(true); }
        return false;
      }
      if (d.phase === 'out') {
        d.len += 0.42;
        const tipX = f.x + f.facing * (0.6 + d.len);
        if (!o.invulnerable() && Math.abs(o.x - tipX) < 0.5 && o.y < 1.6) {
          const r = o.receive({ dmg: s.danio ?? 7, height: 'mid', push: 0, color: s.color, pull: true }, f, V(tipX, o.y + 1.2, 0.3));
          d.phase = r === 'hit' && !o.dead ? 'pull' : 'back';
          if (d.phase === 'pull') sfx.whip();
        } else if (d.len > 5.6) d.phase = 'back';
      } else if (d.phase === 'pull') {
        const target = f.x + f.facing * 1.05;
        o.x += (target - o.x) * 0.16; o.vx = 0;
        d.len = Math.max(0, Math.abs(o.x - f.x) - 0.6);
        if (t % 5 === 0) sfx.reel();
        if (Math.abs(o.x - target) < 0.12 || t > 120) { o.setState('stunned', 'mareado'); o.stunDur = 60; d.phase = 'end'; d.endT = t; }
      } else if (d.phase === 'back') {
        d.len -= 0.55;
        if (d.len <= 0) { d.phase = 'end'; d.endT = t; }
      }
      return d.phase === 'end' && t - d.endT > 8;
    },
    interrupt(f, g) { const o = g.other(f); if (f.specData?.phase === 'pull' && o.state === 'pulled') o.setState('idle'); },
  },

  // CABALLAZO: chifla, su caballo llega galopando por detrás, se sube de un brinco y se lo lleva de corbata
  caballazo: {
    total: 72, anim: 'lazo',
    update(f, o, s, g, t) {
      const d = f.specData;
      if (t === 2) sfx.whistle();
      if (t === 6) sfx.gallop(4);
      if (t === 16) { d.montado = true; f.anim('jinete', 40); sfx.neigh(); }
      if (t >= 16 && t < 46) {
        f.vx = (s.velocidad ?? 10) * f.facing;
        if (!d.hit && f.reaches(o, 1.6, 1.2)) {
          d.hit = true;
          o.receive({ dmg: s.danio ?? 14, height: 'mid', knockdown: true, launch: 6, push: 8, color: s.color }, f, V(o.x - f.facing * 0.3, o.y + 1.1, 0.3));
          g.effects.dust(V(o.x, 0.1), 30); g.effects.addShake(0.35); sfx.thump();
        }
        if (t % 3 === 0) g.effects.dust(V(f.x - f.facing * 0.8, 0.1), 4);
      } else if (t >= 46) f.vx *= 0.8;
      if (t === 52) { d.montado = false; d.bajo = t; f.anim('idle'); sfx.land(); }
      if (t === 60) f.faceOpponent(o);
      return t >= 72;
    },
  },

  // ESTAMPIDA: chifla y una manada de caballos pasa por encima de todo (brincan sobre Jaziel y arrollan al otro)
  estampida: {
    total: 100, anim: 'lazo',
    start(f) { const d = f.specData; d.dir = f.facing; d.x0 = f.x - f.facing * 9; },
    update(f, o, s, g, t) {
      const d = f.specData;
      if (t === 2) sfx.whistle();
      if (t === 10) { sfx.gallop(8); sfx.neigh(); }
      if (t >= ESTAMPIDA.desde && t < 96) {
        if (t % 4 === 0) g.effects.addShake(0.05);
        for (let i = 0; i < ESTAMPIDA.n; i++) {
          if (!cruza(d, t, i, o.x, ESTAMPIDA, ESTAMPIDA.desde) || o.y > 1.5 || o.invulnerable()) continue;
          const last = i === ESTAMPIDA.n - 1;
          o.receive({ dmg: (s.danio ?? 18) / ESTAMPIDA.n, height: 'mid', hitstun: 18, push: 1.5, knockdown: last, launch: last ? 5 : 0, color: s.color }, f, V(o.x, o.y + 1.0, 0.3));
          g.effects.dust(V(o.x, 0.1), 14); sfx.thump();
        }
      }
      return t >= 100;
    },
  },

  // REVÓLVER: desenfunda rápido y echa dos tiros
  revolver: {
    total: 44, anim: 'disparo', s: 0.2, a: 0.6,
    update(f, o, s, g, t) {
      if (t === 4) sfx.clank();
      if (t === 10 || t === 18) {
        const y = f.y + 1.42 * f.sizeScale, mx = f.x + f.facing * 1.0;
        spawnProjectile(g, f, 'tiro', s, { x: f.x + f.facing * 0.95, y, vx: 30 * f.facing, dmg: (s.danio ?? 12) / 2, last: t === 18 });
        sfx.bang(); g.effects.flash(V(mx, y, 0.2), '#ffd27a', 6);
        g.effects.emitGlow({ pos: V(mx, y, 0.2), count: 12, speed: 4, dir: [f.facing, 0, 0], spread: 0.3, color: '#ffffff', colorEnd: '#ffb347', life: 0.12, size: 0.2 });
      }
      return t >= 44;
    },
  },

  // PATADA DE MULA: se voltea y suelta las dos patas hacia atrás, con espuelas
  coz: {
    total: 42, anim: 'coz', s: 14 / 42, a: 22 / 42,
    update(f, o, s, g, t) {
      const d = f.specData;
      if (t === 6) sfx.whoosh(true);
      if (t >= 14 && t <= 18 && !d.hit) {
        const dx = (o.x - f.x) * f.facing;
        if (dx > -0.2 && dx < 1.6 && o.y < 1.4 && !o.invulnerable()) {
          d.hit = true;
          const p = V(o.x - f.facing * 0.2, o.y + 0.9, 0.3);
          const r = o.receive({ dmg: s.danio ?? 13, height: 'mid', knockdown: true, push: 8, launch: 4, color: s.color }, f, p);
          if (r === 'hit') { g.effects.burst(p, '#ffd27a', 24, 5); g.effects.dust(V(o.x, 0.1), 16); sfx.thump(); sfx.neigh(); }
        }
      }
      return t >= 42;
    },
  },
});

// ---------------------------------------------------------------- picadas en el aire
Object.assign(PICADA, {
  // Abel: se avienta del escenario con la guitarra arriba; al caer suena el acorde y sale la onda
  stagedive: { pose: 'mazazo', go: 'whoosh', land(g, x, c) { g.effects.ring(x, c, 2.4); g.effects.ring(x, '#ffffff', 1.6, 0.3); g.effects.burst(V(x, 0.4), c, 50, 6); sfx.powerChord(); sfx.thump(); } },
  // Diego Suárez: cae en barrena como avión
  barrena: { pose: 'avion', go: 'jet', land(g, x, c) { g.effects.explosion(V(x, 0.3, 0.2), c, 0.7); g.effects.dust(V(x, 0.1), 30); sfx.smallBoom(); } },
  // Jaziel: salto de rodeo, cae de botas y levanta polvo
  rodeo: { pose: 'patada_aerea', go: 'whoosh', land(g, x, c) { g.effects.dust(V(x, 0.1), 60); g.effects.ring(x, c, 2.4); sfx.thump(); sfx.boom(); } },
});

// ---------------------------------------------------------------- proyectiles
// golpe genérico de proyectil chico: lo que pega se acaba
function pegaA(p, g, opp, r, hit) {
  if (opp.invulnerable() || Math.abs(opp.x - p.x) > r || p.y < opp.y - 0.15 || p.y > opp.y + opp.height + 0.15) return false;
  opp.receive({ height: 'mid', color: p.color, ...hit }, g.fighters[p.owner], V(p.x, p.y, 0.3));
  p.alive = false;
  return true;
}

// Acorde de Abel: una onda que avanza
PROJ_UPDATE.acorde = (p, g) => {
  const opp = g.fighters[1 - p.owner];
  p.t++; p.x += p.vx / 60;
  if (pegaA(p, g, opp, 0.55, { dmg: p.dmg, hitstun: 20, push: 4.5 })) { g.effects.ring(p.x, p.color, 1.6, 0.3); g.effects.burst(V(p.x, p.y, 0.2), p.color, 40, 5); sfx.note(5); }
  else if (p.t > 100 || Math.abs(p.x) > ARENA + 2) p.alive = false;
};

// Avión de papel: vuela en ondas y poco a poco se acomoda a la altura del pecho del rival
PROJ_UPDATE.avion_papel = (p, g) => {
  const opp = g.fighters[1 - p.owner];
  p.t++; p.x += p.vx / 60;
  p.y0 += (opp.y + 1.25 - p.y0) * 0.03;
  p.y = p.y0 + Math.sin(p.t * 0.13) * 0.45;
  p.vy = Math.cos(p.t * 0.13) * 0.45 * 0.13 * 60;   // (para que la vista lo incline)
  if (pegaA(p, g, opp, 0.5, { dmg: p.dmg, hitstun: 22, push: 3.5 })) { g.effects.burst(V(p.x, p.y, 0.2), '#ffffff', 30, 4); sfx.paper(); sfx.slap(); }
  else if (p.t > 150 || Math.abs(p.x) > ARENA + 2) p.alive = false;
};

// Remache y bala: rapidísimos y chiquitos
PROJ_UPDATE.remache = (p, g) => {
  const opp = g.fighters[1 - p.owner];
  p.t++; p.x += p.vx / 60;
  if (pegaA(p, g, opp, 0.4, { dmg: p.dmg, hitstun: p.last ? 18 : 10, push: p.last ? 4 : 0.8 })) { g.effects.burst(V(p.x, p.y, 0.25), '#ffd27a', 8, 3, 0.08); sfx.clank(); }
  else if (p.t > 40 || Math.abs(p.x) > ARENA + 2) p.alive = false;
};
PROJ_UPDATE.tiro = (p, g) => {
  const opp = g.fighters[1 - p.owner];
  p.t++; p.x += p.vx / 60;
  if (pegaA(p, g, opp, 0.42, { dmg: p.dmg, hitstun: 16, push: p.last ? 3.5 : 2 })) g.effects.burst(V(p.x, p.y, 0.2), '#ffd27a', 16, 4);
  else if (p.t > 40 || Math.abs(p.x) > ARENA + 2) p.alive = false;
};

// Caja negra: cae, rebota dos veces y a la tercera se queda
PROJ_UPDATE.caja = (p, g) => {
  const owner = g.fighters[p.owner], opp = g.fighters[1 - p.owner];
  p.t++;
  p.vy -= CAJA_G / 60; p.x += p.vx / 60; p.y += p.vy / 60;
  const pos = V(p.x, Math.max(p.y, 0.2), 0.2);
  if (!opp.invulnerable() && Math.abs(opp.x - p.x) < 0.5 && p.y > opp.y - 0.1 && p.y < opp.y + opp.height + 0.1) {
    p.alive = false;
    opp.receive({ dmg: p.dmg, height: 'mid', knockdown: true, push: 6, color: p.color }, owner, pos);
    g.effects.burst(pos, '#ffb000', 30, 5); g.effects.addShake(0.25); sfx.clank(); sfx.thump();
    return;
  }
  if (p.y <= 0.15) {
    p.y = 0.15;
    if (p.bounces < 2) { p.vy = Math.abs(p.vy) * 0.6; p.vx *= 0.85; p.bounces++; g.effects.dust(V(p.x, 0.1), 10); sfx.clank(); }
    else { p.alive = false; g.effects.dust(V(p.x, 0.1), 16); sfx.thump(); }
  }
  if (p.t > 200 || Math.abs(p.x) > ARENA + 2) p.alive = false;
};

// =====================================================================
//  FATALITIES
// =====================================================================
Object.assign(FATALITIES, {
  // Abel: le toca una canción de cuna, el otro se hace bebé… y lo avienta hasta las estrellas
  cuna(t, w, l, fat, g, d) {
    if (t === 1) {
      d.x = clamp(l.x, -ARENA + 1.8, ARENA - 1.8);
      l.x = d.x; l.vx = 0; l.y = 0;
      w.anim('guitarra', 400); l.anim('mareado'); sfx.lullaby();
    }
    if (t < 24) w.x += (d.x - w.facing * 1.8 - w.x) * 0.15;
    if (t >= 30 && t <= 80) d.bebe = smooth((t - 30) / 50);
    if (t === 30) l.anim('miedo');
    if (t === 52) { g.effects.burst(V(l.x, 0.9, 0.2), '#ffb3d1', 50, 4); sfx.magic(); }
    if (t === 82) { l.anim('bebe', 400); sfx.cry(); }
    if (t === 100) w.anim('idle');
    if (t > 100 && t < 118) w.x += (d.x - w.facing * 0.55 - w.x) * 0.2;
    if (t === 118) w.anim('agarrar', 14, 0.5, 1);
    if (t === 126) { d.cargado = true; l.anim('cargado', 400); sfx.cry(); }
    if (d.cargado && !d.lanzado) { l.x = w.x + w.facing * 0.42; l.y = 0.75; }
    if (t === 142) w.anim('lanzar', 30, 0.4, 0.6);
    if (t === 152) { d.lanzado = true; d.vx = w.facing * 0.1; d.vy = 0.24; sfx.whoosh(true); }
    if (d.lanzado && !l.hidden) { l.x += d.vx; l.y += d.vy; d.vy -= 0.0032; }
    if (t === 205) { l.hidden = true; sfx.ding(); }
    if (t === 214) w.anim('victoria');
    return t >= 268;
  },

  // Diego Suárez: con las paletas de señalero le da pista a un avión de hélices que llega por encima de la
  // cámara, aterriza encima del otro, sigue rodando y se estrella al fondo (el avión lo dibuja cine-nuevos.js)
  aterrizaje(t, w, l, fat, g, d) {
    if (t === 1) { d.x = l.x; d.dir = w.facing; w.anim('senalero', 400); l.anim('mareado'); sfx.whistle(); }
    if (t === 14) { sfx.jet(3.6); sfx.propeller(3.2); }
    if (t === 64) l.anim('miedo');
    if (t === 100) {
      l.hidden = true; d.impacto = true;
      g.effects.gore(V(l.x, 0.4, 0.2), 1.4); g.effects.dust(V(l.x, 0.1), 90); g.effects.addShake(0.9);
      sfx.crash(); sfx.boom(); sfx.screech();
    }
    if (t === CHOQUE) {
      const p = V(d.x, 2.0, -6.2);
      g.effects.explosion(p, '#ff7a1a', 2.4); g.effects.smoke(p, '#2a2a2a', 60); g.effects.addShake(0.7);
      sfx.crash(); sfx.boom();
    }
    if (t === 168) w.anim('victoria');
    return t >= 230;
  },

  // Jaziel: lo laza, amarra la reata a la silla de su caballo y el caballo sale disparado arrastrándolo hasta
  // perderse… y regresa solito con nomás las botas en la reata (el caballo lo dibuja cine-nuevos.js)
  arrastre(t, w, l, fat, g, d) {
    if (t === 1) {
      d.x = clamp(l.x, -ARENA + 1, ARENA - 1); l.x = d.x; l.vx = 0; d.dir = w.facing;
      d.hx0 = d.x - d.dir * 2.45;   // donde se para el caballo (detrás de los dos): así el jalón siempre es en el cuadro 114
      w.anim('lazo', 30); l.anim('mareado'); sfx.whoosh();
    }
    if (t === 26) { w.anim('lanzar', 20, 0.3, 0.8); sfx.whoosh(true); }
    if (t === 34) { d.atado = true; l.anim('atrapado'); sfx.whip(); }
    if (t === 40) sfx.whistle();
    if (t === 46) { sfx.gallop(5); sfx.neigh(); }
    if (t === 74) { d.amarrado = true; w.anim('agarrar', 10, 0.5, 1); sfx.slap(); }
    if (t === 86) { d.corre = true; w.anim('lanzar', 14, 0.3, 0.6); sfx.slap(); sfx.neigh(); sfx.gallop(6); }
    if (d.corre && !l.hidden && (arrastreX(d, t) - d.dir * REATA - d.x) * d.dir > 0) {
      // la reata ya se tensó: el caballo lo jala de los pies
      if (!d.jalon) { d.jalon = true; l.anim('muerto', 400); g.effects.dust(V(l.x, 0.1), 30); g.effects.addShake(0.35); sfx.thump(); sfx.whip(); }
      l.x = arrastreX(d, t) - d.dir * REATA; l.y = Math.abs(Math.sin(t * 0.45)) * 0.15;
      if (t % 4 === 0) g.effects.dust(V(l.x, 0.1), 8);
    }
    if (t === 100) w.anim('idle');
    if (t === 160) l.hidden = true;
    if (t === 172) { sfx.crash(); d.lejos = true; }
    if (t === 176) sfx.gallop(4);
    if (t === 238) w.anim('victoria');
    return t >= 270;
  },
});
// cuándo se estrella el avión de ATERRIZAJE FORZOSO contra el fondo (la vista lo deja de dibujar ahí)
export const CHOQUE = 110;
// Por dónde va el caballo de ARRASTRADO (el mismo cálculo en la vista): parado hasta que lo azota y luego a todo
export const REATA = 2.5;
export const arrastreX = (d, t) => d.hx0 + d.dir * (t <= 86 ? 0 : 0.05 * (t - 86) + 0.0045 * (t - 86) ** 2);

// =====================================================================
//  BRUTALITIES (con el botón presionado)
// =====================================================================
function closeIn(t, w, l, d, gap) {
  if (t === 1) { d.x = clamp(l.x - w.facing * gap, -ARENA + 0.4, ARENA - 0.4); w.facing = l.x >= d.x ? 1 : -1; }
  if (t < 9) w.x += (d.x - w.x) * 0.35;
}

Object.assign(BRUTALITIES, {
  // Abel: SOLO MORTAL. Un solo que se acelera: el otro cabecea cada vez más fuerte, la guitarra se prende…
  // y la cabeza le revienta. Luego Abel rompe la guitarra en el piso como estrella de rock.
  solo_mortal(t, w, l, def, g, d) {
    closeIn(t, w, l, d, 1.6);
    if (t === 1) { w.anim('guitarra', 400); l.anim('mareado'); sfx.powerChord(); d.bang = 0; }
    if (t >= 8 && t < 100) {
      const every = t < 40 ? 8 : t < 70 ? 5 : 3;
      if (t % every === 0) {
        sfx.note((t / every) | 0);
        d.bang = Math.min(1, (t - 8) / 90);
        g.effects.ring(l.x, def.color || '#b18cff', 1 + d.bang * 1.5, 0.25);
        if (t % (every * 2) === 0) l.anim('golpeado');
      }
    }
    if (t === 60) { d.fuego = true; sfx.fire(); }
    if (t === 96) sfx.feedback();
    if (t === 104) {
      d.pop = true; l.anim('caer');
      g.effects.gore(V(l.x, l.y + 1.7, 0.2), 1.4); g.effects.addShake(0.6); sfx.pop(); sfx.boom(); sfx.powerChord();
    }
    if (t === 126) w.anim('guitarrazo', 30, 0.5, 0.7);
    if (t === 141) {
      d.rota = true;
      const p = V(w.x + w.facing * 1.0, 0.2, 0.2);
      astillas(g, p, 44); g.effects.burst(p, '#ffd27a', 50, 6); g.effects.addShake(0.4); sfx.splinter(); sfx.crash();
    }
    if (t === 172) w.anim('victoria');
    return t >= 220;
  },

  // Diego Suárez: HÉLICE DE CABEZA. Lo llena de remaches como si fuera un avión, le remacha una hélice
  // en la cabeza… y despega dando vueltas hasta que se le acaba la gasolina.
  remachado(t, w, l, def, g, d) {
    closeIn(t, w, l, d, 1.0);
    if (t === 1) { w.anim('remachar', 400); l.anim('golpeado'); d.n = 0; }
    if (t >= 6 && t <= 54 && (t - 6) % 4 === 0) {
      d.n++;
      l.anim('golpeado');
      spark(g, V(l.x - w.facing * 0.12, l.y + 0.85 + (d.n % 5) * 0.16, 0.3), '#ffd27a', d.n % 4 === 0);
      sfx.rivet(); if (d.n % 3 === 0) sfx.hit(false);
      g.effects.addShake(0.04);
    }
    if (t === 62) { d.helice = true; w.anim('idle'); sfx.clank(); sfx.servo(); }
    if (t === 70) { sfx.propeller(2.6); l.anim('miedo'); }
    if (t === 80) l.anim('atrapado');
    if (t >= 76 && !d.boom) { d.vy = Math.min(0.17, (t - 76) * 0.003); l.y += d.vy; l.x += Math.sin(t * 0.21) * 0.04; }
    if (t === 150) {
      d.boom = true; l.hidden = true;
      const p = V(l.x, l.y + 1, -0.3);
      g.effects.explosion(p, '#ff7a1a', 1.6); g.effects.gore(p, 1.2); g.effects.addShake(0.5); sfx.boom();
    }
    if (t === 165) w.anim('victoria');
    return t >= 220;
  },

  // Jaziel: ESTAMPIDA. Una manada de caballos le pasa por encima, luego otra de regreso… y el último
  // se acerca, se voltea y lo manda a volar de una patada.
  pisoteado(t, w, l, def, g, d) {
    if (t === 1) {
      d.x = l.x; d.dir = w.facing; l.vx = 0;
      d.x0 = d.x - d.dir * 14; d.x1 = d.x + d.dir * 14;
      w.anim('lazo', 40); l.anim('mareado'); sfx.whistle();
    }
    if (t === 12) { sfx.gallop(10); sfx.neigh(); }
    for (let i = 0; i < PISOTEO.n; i++) {
      const ida = cruza(d, t, i, d.x, PISOTEO, PISOTEO.ida);
      const vuelta = cruza({ x0: d.x1, dir: -d.dir }, t, i, d.x, PISOTEO, PISOTEO.vuelta);
      if (!ida && !vuelta) continue;
      d.pisadas = (d.pisadas || 0) + 1;
      l.anim(d.pisadas === 1 ? 'caer' : 'muerto', 400);
      l.squash = Math.max(0.14, 1 - d.pisadas * 0.09);
      g.effects.gore(V(l.x, 0.3, 0.2), 0.5); g.effects.dust(V(l.x, 0.1), 20); g.effects.addShake(0.25);
      sfx.thump(); if (d.pisadas % 3 === 0) sfx.neigh();
    }
    if (t === 150) sfx.neigh();
    if (t === 175) {
      d.patada = true; d.vx = d.dir * 0.12; d.vy = 0.2; l.squash = 1; l.anim('caer', 400);
      g.effects.dust(V(l.x, 0.1), 30); g.effects.addShake(0.4); sfx.thump(); sfx.boom(); sfx.neigh();
    }
    if (d.patada && !l.hidden) { l.x += d.vx; l.y += d.vy; d.vy -= 0.004; }
    if (t === 211) { l.hidden = true; sfx.ding(); }
    if (t === 219) w.anim('victoria');
    return t >= 265;
  },
});
// dos pasadas de la manada por encima del otro (ida y vuelta), las mismas en la vista
export const PISOTEO = { n: 5, gap: 6, vel: 26, ida: 16, vuelta: 104 };
