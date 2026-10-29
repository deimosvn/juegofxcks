import * as THREE from 'three';
import { sfx } from './audio.js';
import { SPECIALS, FATALITIES, SOLID_PROJECTILES, spawnProjectile, updateProjectile } from './specials.js';

// =====================================================================
//  ALAN (ingeniería aeroespacial) · GERA (boxeo) · JOSÉ CORTEZ (nalgas) · CONDE (fuerza, gigante)
//  EMI (pescadero: pescados y caguamas)
//  Mismas reglas que specials.js: estado con datos simples, lo visual
//  (satélite, turbina, resorte, cohete en la espalda…) se dibuja en main.js.
// =====================================================================

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const ARENA = 9;
const clampT = THREE.MathUtils.clamp;
const KAWAMA_G = 20, FISH_G = 14;     // gravedad de la caguama y de la lluvia de pescados
SOLID_PROJECTILES.add('pescado');     // un pescado choca contra otros proyectiles

Object.assign(SPECIALS, {
  // ---------------- Alan ----------------
  // Le chifla a su Camaro y hace una pose de JoJo: el carro entra por detrás del rival, lo atropella
  // (no se bloquea; se salta), se queda derrapando junto a Alan y luego se va. El carro es un
  // proyectil con datos simples; el modelo (`modelo` del especial) lo dibuja main.js.
  camaro: {
    total: 80, anim: 'jojo',
    canStart: (f, o, s, g) => !g.projectiles.some((p) => p.alive && p.owner === f.side && p.kind === 'camaro'),
    update(f, o, s, g, t) {
      if (t === 2) sfx.honk();
      if (t === 8) {
        const dir = -f.facing;   // hacia Alan
        spawnProjectile(g, f, 'camaro', s, {
          x: f.x + f.facing * 15, y: 0, z: 0.15, vx: (s.velocidad ?? 26) * dir, dir, phase: 'llega',
          stopX: clampT(f.x + f.facing * 1.9, -ARENA, ARENA), dmg: s.danio ?? 16,
        });
        sfx.vroom();
      }
      return t >= 80;
    },
  },
  // Cohete que acelera en línea recta y explota al impactar
  cohete: {
    total: 40, anim: 'lanzar', s: 12 / 40, a: 20 / 40,
    canStart: (f, o, s, g) => !g.hasProjectile(f),
    update(f, o, s, g, t) {
      if (t === 2) sfx.servo();
      if (t === 12) {
        spawnProjectile(g, f, 'cohete', s, { y: f.y + 1.45, vx: 3 * f.facing });
        g.effects.smoke(f.hand, '#888', 14); sfx.rocket();
      }
      return t >= 40;
    },
  },

  // Despega con el jetpack y cae en picada sobre el rival
  jetpack: {
    total: 0, anim: 'agacharse',
    update(f, o, s, g, t) {
      const d = f.specData;
      if (t === 6) { d.phase = 'up'; f.vy = 13; f.vx = 1.5 * f.facing; f.anim('jet_sube'); sfx.rocket(); }
      if (d.phase === 'up') {
        f.vy += 0.6;                                    // empuje del jetpack
        if (t >= 24) {
          d.phase = 'dive';
          const dx = o.x - f.x;
          f.facing = dx >= 0 ? 1 : -1;
          f.vy = -10;
          const T = (-10 + Math.sqrt(100 + 64 * Math.max(f.y, 0.1))) / 32;   // tiempo hasta el suelo
          f.vx = clampT(dx / Math.max(T, 0.12), -16, 16);
          f.anim('jet_cae'); sfx.whoosh();
        }
      }
      if (d.phase === 'dive' && !d.hit && f.reaches(o, 0.9, 0.9)) {
        d.hit = true;
        o.receive({ dmg: s.danio ?? 13, height: 'overhead', knockdown: true, push: 6, color: s.color }, f);
      }
      return d.phase === 'land' && f.t - d.landT >= 16;
    },
    onLand(f, o, s, g) {
      const d = f.specData;
      if (d.phase !== 'dive') return;
      d.phase = 'land'; d.landT = f.t; f.vx = 0; f.anim('agacharse');
      g.effects.explosion(V(f.x, 0.3, 0.2), s.color || '#4fd8ff', 0.9); sfx.smallBoom();
      if (!d.hit && o.y < 0.2 && Math.abs(o.x - f.x) < 1.6) o.receive({ dmg: (s.danio ?? 13) * 0.6, height: 'low', knockdown: true, push: 4, color: s.color }, f, V(o.x, 0.3, 0.3));
    },
  },

  // Un satélite en órbita dispara un rayo donde estaba el rival (se dibuja en main.js)
  orbital: {
    total: 56, anim: 'orbital', s: 0.3, a: 0.9,
    update(f, o, s, g, t) {
      const d = f.specData;
      if (t === 6) {
        d.x = o.x; sfx.charge();
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.9, 40), new THREE.MeshBasicMaterial({ color: s.color, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2; ring.position.set(d.x, 0.04, 0);
        g.effects.addTemp(ring, 0.5, (dt, k) => { ring.material.opacity = 0.35 + Math.sin(k * 40) * 0.35; ring.scale.setScalar(1.4 - k * 0.6); });
      }
      if (t === 34) {
        g.effects.burst(V(d.x, 0.3), s.color, 90, 7); g.effects.ring(d.x, s.color, 2.6); g.effects.ring(d.x, '#ffffff', 1.6, 0.3);
        g.effects.addShake(0.35); sfx.laser(); sfx.zap();
        if (Math.abs(o.x - d.x) < 1.0) o.receive({ dmg: s.danio ?? 14, height: 'mid', knockdown: true, push: 2, color: s.color }, f, V(o.x, 1.2, 0.3));
      }
      return t >= 56;
    },
  },

  // Turbina de avión: ráfaga de aire caliente que empuja y golpea varias veces
  turbina: {
    total: 62, anim: 'turbina',
    update(f, o, s, g, t) {
      if (t === 4) sfx.servo();
      if (t === 12) sfx.rocket();
      if (t >= 12 && t < 52) {
        const dx = (o.x - f.x) * f.facing;
        if (dx > 0 && dx < 3.8 && o.y < 2 && !o.invulnerable()) {
          if (o.state === 'hitstun' || o.state === 'blockstun') o.vx += f.facing * 0.35;
          if ((t - 12) % 8 === 0) o.receive({ dmg: (s.danio ?? 12) / 5, height: 'mid', hitstun: 12, push: 3.2, color: s.color }, f, V(o.x - f.facing * 0.3, o.y + 1.2, 0.3));
        }
      }
      return t >= 62;
    },
  },

  // ---------------- Gera ----------------
  // Ráfaga de jabs: 6 golpes seguidos avanzando (fallan si el rival se agacha)
  rafaga: {
    total: 44, anim: 'rafaga',
    update(f, o, s, g, t) {
      if ([8, 13, 18, 23, 28, 33].includes(t)) {
        sfx.whoosh();
        if (f.reaches(o, 1.2, 1.45)) {
          const last = t === 33;
          o.receive({ dmg: (s.danio ?? 14) / 6, height: 'high', hitstun: last ? 22 : 14, push: last ? 4.5 : 0.5, color: s.color }, f);
        }
      }
      f.vx = t < 30 ? 1.2 * f.facing : 0;
      return t >= 44;
    },
  },

  // Guante con resorte que sale disparado y regresa (se dibuja en main.js)
  resorte: {
    total: 50, anim: 'resorte', s: 8 / 50, a: 36 / 50,
    update(f, o, s, g, t) {
      const d = f.specData;
      if (t === 8) { d.len = 0; d.phase = 'out'; sfx.boing(); }
      if (d.phase === 'out') {
        d.len += 0.4;
        const tipX = f.hand.x + f.facing * d.len, y = f.y + 1.45;
        if (!d.hit && !o.invulnerable() && Math.abs(o.x - tipX) < 0.45 && y >= o.y && y <= o.y + o.height + 0.1) {
          d.hit = true; d.phase = 'back';
          o.receive({ dmg: s.danio ?? 11, height: 'high', knockdown: true, push: 7, color: s.color }, f, V(tipX, y, 0.3));
        } else if (d.len >= 4.4) d.phase = 'back';
      } else if (d.phase === 'back') {
        d.len -= 0.55;
        if (d.len <= 0) { d.len = 0; d.phase = 'end'; }
      }
      return t >= 50 && d.phase !== 'out' && d.phase !== 'back';
    },
  },

  // Guardia de contragolpe: si le pegan en los primeros frames, responde con un gancho
  contra: {
    total: 46, anim: 'contra',
    update(f, o, s, g, t) {
      const d = f.specData;
      if (t === 1) sfx.block();
      if (d.countered) return f.t - d.ct >= 30;
      return t >= 46;
    },
    // Lo llama Fighter.receive mientras Gera está en esta guardia
    counter(f, attacker, hit, g) {
      const d = f.specData;
      if (d.countered || f.t > 36) return null;
      d.countered = true; d.ct = f.t;
      f.anim('gancho_arriba', 30, 0.15, 0.6);
      g.effects.metalSpark(f.chest, '#ffffff'); sfx.clank();
      g.event('special', { side: f.side, nombre: '¡CONTRAGOLPE!', color: f.spec.color });
      if (attacker !== f && Math.abs(attacker.x - f.x) < 2.6) {
        f.facing = attacker.x >= f.x ? 1 : -1;
        attacker.receive({ dmg: f.spec.danio ?? 16, height: 'mid', launch: 13, push: 3, color: f.spec.color, unblockable: true, isCounter: true }, f);
      }
      g.hitstop = 8;
      return 'countered';
    },
  },

  // ---------------- José Cortez ----------------
  // Se lanza de espaldas con las nalgas por delante
  culazo: {
    total: 42, anim: 'culazo',
    update(f, o, s, g, t) {
      const d = f.specData;
      if (t === 6) sfx.whoosh();
      if (t >= 6 && t < 24 && !d.hit) {
        f.vx = 12 * f.facing * f.speed;
        if (t % 2 === 0) g.effects.emitGlow({ pos: V(f.x + f.facing * 0.3, f.y + 1.0), count: 4, speed: 1, jitter: 0.6, color: '#ffffff', colorEnd: s.color, life: 0.3, size: 0.3 });
        if (f.reaches(o, 0.85, 1.0)) {
          d.hit = true; f.vx = -2 * f.facing;
          o.receive({ dmg: s.danio ?? 11, height: 'mid', knockdown: true, push: 7, color: s.color }, f);
          sfx.slap();
        }
      } else f.vx *= 0.8;
      return t >= 42;
    },
  },

  // Salta y cae sentado: aplasta al que está debajo y hace una onda alrededor
  senton: {
    total: 0, anim: 'agacharse',
    update(f, o, s, g, t) {
      const d = f.specData;
      if (t === 5) { f.vy = 13; f.vx = clampT((o.x - f.x) / 0.8, -7, 7); f.anim('senton'); sfx.jump(); }
      if (t > 5 && !d.landed && f.vy < 0) f.vy -= 1.2;
      return d.landed && f.t - d.landT >= 24;
    },
    onLand(f, o, s, g) {
      const d = f.specData;
      if (d.landed || f.t < 6) return;
      d.landed = true; d.landT = f.t; f.vx = 0; f.anim('senton_suelo');
      g.effects.ring(f.x, s.color, 3.2); g.effects.dust(V(f.x, 0.1), 50); g.effects.addShake(0.45); sfx.boom(); sfx.slap();
      const dx = Math.abs(o.x - f.x);
      if (o.y < 0.3 && dx < 1.1) o.receive({ dmg: s.danio ?? 13, height: 'mid', unblockable: true, knockdown: true, push: 3, color: s.color }, f, V(o.x, 0.6, 0.3));
      else if (o.y < 0.3 && dx < 3) o.receive({ dmg: (s.danio ?? 13) * 0.6, height: 'low', knockdown: true, push: 4, color: s.color }, f, V(o.x, 0.3, 0.3));
    },
  },

  // Twerk sísmico: cada sacudida manda una onda que golpea de cerca (7 golpes)
  twerk: {
    total: 66, anim: 'twerk',
    update(f, o, s, g, t) {
      if (t >= 10 && t <= 58 && (t - 10) % 8 === 0) {
        g.effects.ring(f.x + f.facing * 0.5, s.color, 1.6, 0.3); sfx.thump();
        const last = t >= 58;
        if (Math.abs(o.x - f.x) < 1.9 && o.y < 1.5) {
          o.receive({ dmg: (s.danio ?? 14) / 7, height: 'mid', hitstun: 14, push: last ? 7 : 1.8, knockdown: last, color: s.color }, f, V(o.x, o.y + 1.0, 0.3));
        }
      }
      return t >= 66;
    },
  },

  // Nube verde que avanza despacio y lastima mientras el rival esté dentro (no se puede bloquear)
  gas: {
    total: 50, anim: 'gas', s: 16 / 50, a: 40 / 50,
    canStart: (f, o, s, g) => !g.projectiles.some((p) => p.alive && p.owner === f.side && p.kind === 'gas'),
    update(f, o, s, g, t) {
      if (t === 16) {
        spawnProjectile(g, f, 'gas', s, { x: f.x + f.facing * 0.6, y: f.y + 0.95, vx: 2.4 * f.facing, life: 150, dmg: (s.danio ?? 12) / 6 });
        sfx.fart();
      }
      return t >= 50;
    },
  },

  // ---------------- Conde ----------------
  // Se pone súper fuerte y se hace gigante (fighter.js: +60% de daño, recibe 40% menos,
  // nada lo tumba y llega más lejos). Crece mientras hace fuerza y al final se encoge.
  gigante: {
    total: 56, anim: 'flexion',
    canStart: (f) => f.buffTimer <= 0,
    update(f, o, s, g, t) {
      if (t === 4) sfx.grow();
      if (t % 2 === 0) g.effects.aura(V(f.x, f.y + 0.9 * f.sizeScale), s.color, 5);
      if (t >= 12 && t < 38 && t % 6 === 0) { g.effects.addShake(0.06); g.effects.dust(V(f.x, 0.05), 6); }
      if (t === 38) {
        g.effects.burst(f.chest, s.color, 120, 8); g.effects.ring(f.x, s.color, 4); g.effects.ring(f.x, '#ffffff', 2.6, 0.3);
        g.effects.dust(V(f.x, 0.1), 40); g.effects.addShake(0.45); sfx.boom();
        f.buffTimer = 60 * (s.duracion ?? 7); f.buffKind = 'giant'; f.buffColor = s.color;
      }
      return t >= 56;
    },
  },

  // Lo agarra, lo levanta sobre la cabeza y lo avienta. Un agarre: no se puede bloquear.
  agarre: {
    total: 0, anim: 'agarrar',
    start(f) { f.anim('agarrar', 12, 0.5, 1); sfx.whoosh(); },
    update(f, o, s, g, t) {
      const d = f.specData;
      if (t === 6) {
        if (!o.invulnerable() && o.y < 0.3 && o.state !== 'scripted' && f.reaches(o, 0.75, 1.1)) {
          d.grab = true; o.setState('scripted', 'golpeado'); o.vx = 0; o.vy = 0;
          f.anim('levantar'); sfx.slap(); g.effects.addShake(0.1);
        } else d.miss = true;
      }
      if (d.miss) { f.vx *= 0.7; return t >= 30; }
      if (d.grab && !d.thrown) {
        const k = Math.min(1, Math.max(0, (t - 6) / 22)), sz = f.sizeScale;
        o.x = f.x + f.facing * (0.55 - 0.45 * k) * sz; o.y = (0.15 + 1.9 * k) * sz; o.vx = 0; o.vy = 0;
        if (t === 34) {
          d.thrown = true; f.anim('lanzar', 20, 0.1, 0.5);
          o.x = f.x + f.facing * 0.4 * sz;
          o.receive({ dmg: s.danio ?? 15, height: 'mid', unblockable: true, launch: 6, push: 9, color: s.color }, f, V(o.x, o.y + 0.5, 0.3));
          g.effects.addShake(0.3); sfx.whoosh();
        }
      }
      return !!d.thrown && t >= 52;
    },
    // si a Conde le pegan mientras lo carga, lo suelta
    interrupt(f, g) {
      const o = g.other(f);
      if (f.specData?.grab && !f.specData.thrown && o.state === 'scripted') { o.setState('airHit', 'caer'); o.vy = 2; }
    },
  },

  // ---------------- Emi (pescadero) ----------------
  // Avienta un pescado que va dando vueltas
  pescado: {
    total: 34, anim: 'lanzar', s: 12 / 34, a: 20 / 34,
    canStart: (f, o, s, g) => !g.hasProjectile(f),
    update(f, o, s, g, t) {
      if (t === 12) { spawnProjectile(g, f, 'pescado', s, { y: f.y + 1.4, vx: (s.velocidad ?? 11) * f.facing }); sfx.whoosh(); }
      return t >= 34;
    },
  },

  // Avienta una caguama en parábola hacia el pecho del rival: se rompe y lo deja mareado
  kawama: {
    total: 40, anim: 'lanzar', s: 14 / 40, a: 22 / 40,
    canStart: (f, o, s, g) => !g.projectiles.some((p) => p.alive && p.owner === f.side && p.kind === 'kawama'),
    update(f, o, s, g, t) {
      if (t === 14) {
        const x0 = f.x + f.facing * 0.5, y0 = f.y + 1.75, vy = 7;
        const T = (vy + Math.sqrt(vy * vy + 2 * KAWAMA_G * (y0 - 1.1))) / KAWAMA_G;
        const dx = clampT(o.x - x0, -8, 8);
        spawnProjectile(g, f, 'kawama', s, { x: x0, y: y0, vx: (Math.abs(dx) < 0.5 ? f.facing * 2 : dx) / T, vy });
        sfx.whoosh();
      }
      return t >= 40;
    },
  },

  // Chifla y le llueven pescados encima al rival
  lluvia_pescados: {
    total: 58, anim: 'silbido',
    update(f, o, s, g, t) {
      if (t === 4) sfx.whistle();
      const i = [16, 22, 28, 34, 40].indexOf(t);
      if (i >= 0) {
        const x = clampT(o.x + (i - 2) * 0.4 * f.facing, -ARENA, ARENA);
        spawnProjectile(g, f, 'pescado', s, { x, y: 8 + i * 0.25, vx: 0, vy: -1, fall: true, dmg: (s.danio ?? 15) / 5, last: i === 4 });
      }
      return t >= 58;
    },
  },

  // Agita una caguama y lo baña de cerveza: varios chorros que lo empujan (el chorro lo dibuja main.js)
  chela: {
    total: 60, anim: 'chela', s: 0.2, a: 0.85,
    update(f, o, s, g, t) {
      if (t === 2) sfx.clank();
      if (t === 14) sfx.fizz();
      if (t >= 14 && t < 46 && (t - 14) % 8 === 0) {
        const dx = (o.x - f.x) * f.facing;
        if (dx > 0 && dx < 2.9 && !o.invulnerable() && o.y < 1.6) {
          o.receive({ dmg: (s.danio ?? 12) / 4, height: 'mid', hitstun: 16, push: 2.4, color: s.color || '#ffd23a' }, f, V(o.x - f.facing * 0.25, o.y + 1.3, 0.3));
        }
      }
      return t >= 60;
    },
  },
});

// Pescado que pega o cae al suelo: salpica
function splashFish(p, g) {
  p.alive = false;
  g.effects.burst(V(p.x, Math.max(p.y, 0.12), 0.2), '#bfe8ff', 26, 3.5);
  sfx.slap();
}

// Especiales en los que José saca las nalgas (la vista las infla)
export const BUTT_SPECIALS = new Set(['culazo', 'senton', 'twerk', 'gas']);

// Proyectiles nuevos: cohete (acelera y explota) y gas (nube que se queda)
export function updateProjectileExtra(p, g) {
  const owner = g.fighters[p.owner], opp = g.fighters[1 - p.owner];
  // Camaro de Alan: llega, atropella, frena derrapando junto a Alan, se queda un momento y se va al fondo
  if (p.kind === 'camaro') {
    p.t++;
    const dir = p.dir;
    if (p.phase === 'llega' || p.phase === 'frena') {
      const left = (p.x - p.stopX) * dir * -1;   // cuánto le falta para pararse
      if (p.phase === 'llega' && left <= 4) { p.phase = 'frena'; sfx.screech(); }
      if (p.phase === 'frena') p.vx = dir * Math.max(2, Math.sqrt(Math.max(0, 2 * 84 * left)));
      p.x += p.vx / 60;
      if ((p.x - p.stopX) * dir >= 0) { p.x = p.stopX; p.vx = 0; p.phase = 'parado'; p.pt = p.t; }
      // atropellar: el carro ocupa ~4.8 m; si el rival va saltando alto, pasa por debajo
      const front = p.x + dir * 2.35, rear = p.x - dir * 2.45;
      const lo = Math.min(front, rear) - 0.25, hi = Math.max(front, rear) + 0.25;
      if (!p.hit && Math.abs(p.vx) > 3 && opp.x > lo && opp.x < hi && opp.y < 1.15 && !opp.invulnerable()) {
        p.hit = true;
        opp.receive({ dmg: p.dmg, height: 'mid', unblockable: true, launch: 12, push: 10, color: '#ffffff' }, owner, V(opp.x, opp.y + 0.8, 0.5));
        g.effects.dust(V(opp.x, 0.2), 34); g.effects.burst(V(opp.x, 0.9, 0.4), '#ffffff', 40, 6); g.effects.addShake(0.4);
        sfx.crash();
      }
    } else if (p.phase === 'parado') {
      if (p.t - p.pt >= 34) { p.phase = 'sale'; sfx.vroom(); }
    } else {
      p.z -= 0.32;   // se va hacia el fondo del escenario
      if (p.z < -24) p.alive = false;
    }
    return;
  }
  if (p.kind === 'cohete') {
    p.t++;
    p.vx = clampT(p.vx + 0.55 * Math.sign(p.vx), -17, 17);
    p.x += p.vx / 60;
    if (Math.abs(p.x) > ARENA + 2) { p.alive = false; return; }
    if (!opp.invulnerable() && Math.abs(opp.x - p.x) < 0.5 && p.y > opp.y - 0.1 && p.y < opp.y + opp.height + 0.1) {
      opp.receive({ dmg: p.dmg, height: 'mid', knockdown: true, push: 6, color: p.color }, owner, V(p.x, p.y, 0.3));
      p.alive = false;
      g.effects.explosion(V(p.x, p.y, 0.2), '#ff7a1a', 1.1); sfx.smallBoom();
    }
    return;
  }
  if (p.kind === 'gas') {
    p.t++; p.life--;
    p.x += p.vx / 60; p.vx *= 0.985;
    if (p.life <= 0 || Math.abs(p.x) > ARENA + 2) { p.alive = false; return; }
    if (p.t % 15 === 0 && !opp.invulnerable() && Math.abs(opp.x - p.x) < 1.15 && opp.y < 2) {
      opp.receive({ dmg: p.dmg, height: 'mid', unblockable: true, hitstun: 18, push: 0.6, color: p.color }, owner, V(opp.x, opp.y + 1.3, 0.3));
    }
    return;
  }
  if (p.kind === 'pescado') {
    p.t++;
    if (p.fall) {   // lluvia de pescados: cae del cielo (hay que bloquear parado)
      p.vy -= FISH_G / 60; p.y += p.vy / 60;
      if (!opp.invulnerable() && Math.abs(opp.x - p.x) < 0.5 && p.y > opp.y && p.y < opp.y + opp.height) {
        opp.receive({ dmg: p.dmg, height: 'mid', hitstun: 14, push: 1.2, color: p.color, knockdown: !!p.last }, owner, V(p.x, p.y, 0.3));
        splashFish(p, g);
      } else if (p.y <= 0.08) splashFish(p, g);
      return;
    }
    p.x += p.vx / 60;
    if (Math.abs(p.x) > ARENA + 2) { p.alive = false; return; }
    if (!opp.invulnerable() && Math.abs(opp.x - p.x) < 0.45 && p.y > opp.y - 0.1 && p.y < opp.y + opp.height + 0.1) {
      opp.receive({ dmg: p.dmg, height: 'mid', hitstun: 20, push: 3.5, color: p.color }, owner, V(p.x, p.y, 0.3));
      splashFish(p, g);
    }
    return;
  }
  if (p.kind === 'kawama') {
    p.t++;
    p.vy -= KAWAMA_G / 60; p.x += p.vx / 60; p.y += p.vy / 60;
    const body = !opp.invulnerable() && Math.abs(opp.x - p.x) < 0.45 && p.y > opp.y && p.y < opp.y + opp.height + 0.1;
    if (body || p.y <= 0.06 || Math.abs(p.x) > ARENA + 2) {
      p.alive = false;
      const pos = V(p.x, Math.max(p.y, 0.15), 0.2);
      g.effects.shards(pos, '#8a4a12', 10); g.effects.burst(pos, '#ffe9a8', 50, 4);   // vidrio y espuma
      sfx.shatter();
      // si le cae encima (o se rompe a sus pies) queda mareado
      if (!opp.invulnerable() && (body || (Math.abs(opp.x - p.x) < 0.8 && opp.y < 0.3))) {
        const r = opp.receive({ dmg: p.dmg, height: 'mid', hitstun: 20, push: 2, color: p.color }, owner, pos);
        if (r === 'hit' && opp.health > 0 && opp.state === 'hitstun') { opp.setState('stunned', 'mareado'); opp.stunDur = 50; }
      }
    }
    return;
  }
  updateProjectile(p, g);
}

Object.assign(FATALITIES, {
  // Alan: le amarra un cohete al rival y lo manda al espacio (fuegos artificiales)
  despegue(t, w, l, fat, g, data) {
    if (t === 1) { w.anim('orbital', 60, 0.3, 0.95); l.anim('mareado'); sfx.servo(); }
    if (t === 20) { l.rocket = true; sfx.clank(); }
    if (t === 45) sfx.rocket();
    if (t >= 45 && !l.hidden) {
      data.v = (data.v || 0) + (t < 60 ? 0.002 : 0.012);
      l.y += data.v;
      if (t % 2 === 0) g.effects.smoke(V(l.x, l.y + 0.2), '#aaa', 4);
      g.effects.emitGlow({ pos: V(l.x, l.y + 0.4, -0.15), count: 3, speed: 3, dir: [0, -1, 0], spread: 0.3, color: '#fff3c0', colorEnd: '#ff5a00', life: 0.3, size: 0.3 });
    }
    if (t === 130) {
      l.hidden = true;
      const p = V(l.x, l.y, -1);
      for (const c of ['#ff3a3a', '#ffd23a', '#4fd8ff', '#9be15d']) g.effects.burst(p, c, 70, 9, 0.25);
      g.effects.flash(p, '#ffffff', 12); sfx.boom();
    }
    if (t === 150) w.anim('victoria');
    return t >= 220;
  },

  // Gera: ráfaga de golpes y un gancho que lo manda a volar hasta las estrellas
  nocaut(t, w, l, fat, g, data) {
    if (t === 1) { w.x = l.x - w.facing * 1.0; w.anim('rafaga', 60); }
    if (t > 4 && t < 60 && t % 5 === 0) {
      l.anim('golpeado');
      g.effects.hitSpark(l.chest, fat.color || '#ffd23a', t % 10 === 0); sfx.hit(t % 10 === 0); g.effects.addShake(0.08);
    }
    if (t === 64) w.anim('gancho_arriba', 30, 0.15, 0.6);
    if (t === 70) { data.vy = 0.45; l.anim('caer'); g.effects.hitSpark(l.chest, '#ffffff', true); g.effects.addShake(0.5); sfx.boom(); }
    if (t > 70 && !l.hidden) { l.y += data.vy; data.vy += 0.008; l.x += w.facing * 0.03; }
    if (t === 150) { l.hidden = true; g.effects.burst(V(l.x, l.y, -1), '#ffffff', 50, 4, 0.2); sfx.ding(); }
    if (t === 160) w.anim('victoria');
    return t >= 210;
  },

  // José: brinca altísimo, las nalgas le crecen y aplasta al rival
  nalgon(t, w, l, fat, g, data) {
    if (t === 1) { data.x0 = w.x; w.anim('saltar', 40); sfx.jump(); }
    if (t <= 40) {
      const k = t / 40;
      w.x = data.x0 + (l.x - data.x0) * k;
      w.y = Math.sin(Math.PI * k) * 6;
    }
    if (t === 18) w.anim('senton');
    if (t === 40) {
      w.y = 0; l.squash = 0.1;
      g.effects.gore(V(l.x, 0.2), 1.2); g.effects.dust(V(l.x, 0.1), 70); g.effects.ring(l.x, fat.color || '#ff7ab8', 3.5);
      g.effects.addShake(0.7); sfx.boom(); sfx.slap(); w.anim('senton_suelo');
    }
    if (t === 100) w.anim('victoria');
    return t >= 170;
  },

  // Conde: se hace gigantesco (fighter.js stompScale) y aplasta al rival de un pisotón
  pisoton(t, w, l, fat, g, data) {
    if (t === 1) { w.x = l.x - w.facing * 1.6; w.anim('flexion', 44); l.anim('mareado'); sfx.grow(); }
    if (t > 8 && t < 44 && t % 5 === 0) { g.effects.addShake(0.12); g.effects.dust(V(w.x, 0.05), 10); }
    if (t === 44) { g.effects.ring(w.x, fat.color || '#ff7a1a', 5); g.effects.addShake(0.4); sfx.boom(); }
    if (t === 60) w.anim('pisar_arriba');
    if (t === 92) {
      w.anim('pisar'); l.squash = 0.08;
      g.effects.gore(V(l.x, 0.2), 1.4); g.effects.dust(V(l.x, 0.1), 90); g.effects.ring(l.x, '#ffffff', 5, 0.4);
      g.effects.addShake(0.9); sfx.boom(); sfx.thump();
    }
    if (t === 186) w.anim('victoria');
    return t >= 230;
  },

  // Emi: un pescado gigante sale del suelo, se traga al rival y se vuelve a clavar (lo dibuja main.js)
  pescadote(t, w, l, fat, g, data) {
    if (t === 1) { w.anim('silbido', 40); l.anim('mareado'); sfx.whistle(); }
    if (t === 24) { g.effects.ring(l.x, '#4fb8ff', 2.6); g.effects.burst(V(l.x, 0.2), '#bfe8ff', 70, 5); g.effects.addShake(0.3); sfx.splash(); }
    if (t === 52) { l.hidden = true; g.effects.burst(V(l.x, 2.0), '#bfe8ff', 90, 6); g.effects.addShake(0.5); sfx.slap(); sfx.boom(); }
    if (t === 104) {
      const x = l.x + w.facing * 1.4;
      g.effects.burst(V(x, 0.2), '#bfe8ff', 100, 6); g.effects.ring(x, '#4fb8ff', 3.6); g.effects.addShake(0.4); sfx.splash();
    }
    if (t === 125) w.anim('victoria');
    return t >= 200;
  },
});
