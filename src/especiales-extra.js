import * as THREE from 'three';
import { sfx } from './audio.js';
import { SPECIALS, PROJ_UPDATE, spawnProjectile } from './specials.js';
import { BUTT_SPECIALS } from './specials-amigos.js';

// =====================================================================
//  ATAQUES NUEVOS
//  · picada: el especial en el aire de todos (Especial mientras saltas). `estilo` dice cómo se ve.
//  · drones (Diego) · boom_sonico (Alan) · higadazo (Gera) · iman (José) · losa (Conde)
//    anzuelo (Emi) · lanzallamas (Ramces)
//  Mismas reglas que specials.js: estado con datos simples; lo visual (drones, la losa en las
//  manos, el hilo de pescar, las llamas, los corazones…) lo dibuja vista-especiales.js.
// =====================================================================

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const ARENA = 9;
const clamp = THREE.MathUtils.clamp;
const LOSA_G = 18;    // gravedad de la losa que avienta Conde
BUTT_SPECIALS.add('iman');

// Cómo se ve cada picada: pose de la caída, sonido al lanzarse y lo que pasa si cae al piso sin pegar
const PICADA = {
  cohete:    { pose: 'patada_aerea', go: 'rocket', land(g, x, c) { g.effects.explosion(V(x, 0.3, 0.2), c, 0.8); sfx.smallBoom(); } },
  reentrada: { pose: 'jet_cae', go: 'fire', land(g, x, c) { g.effects.ring(x, c, 2.8); g.effects.burst(V(x, 0.3), '#fff3c0', 70, 7); g.effects.smoke(V(x, 0.6), '#3a3a3a', 20); sfx.boom(); } },
  mazazo:    { pose: 'mazazo', go: 'whoosh', land(g, x, c) { g.effects.dust(V(x, 0.1), 34); g.effects.ring(x, c, 2.2); sfx.thump(); sfx.boom(); } },
  pedo:      { pose: 'culazo', go: 'fart', land(g, x) { g.effects.smoke(V(x, 0.7), '#86c24a', 34); g.effects.ring(x, '#9be15d', 2); sfx.fart(); sfx.thump(); } },
  plancha:   { pose: 'plancha', go: 'whoosh', land(g, x, c) { g.effects.dust(V(x, 0.1), 70); g.effects.ring(x, c, 3.2); g.effects.ring(x, '#ffffff', 2.2, 0.3); g.effects.addShake(0.45); sfx.boom(); sfx.slap(); } },
  clavado:   { pose: 'clavado', go: 'whistle', land(g, x) { g.effects.emitSolid({ pos: V(x, 0.15, 0.1), count: 70, speed: 7, dir: [0, 1, 0], spread: 0.7, color: '#e8f8ff', colorEnd: '#4fb8ff', life: 0.9, size: 0.2, gravity: 12, drag: 0.3 }); g.effects.ring(x, '#4fb8ff', 2.6); sfx.splash(); } },
  navaja:    { pose: 'navaja', go: 'shink', land(g, x) { g.effects.dust(V(x, 0.1), 16); sfx.slash(); } },
  fuego:     { pose: 'patada_aerea', go: 'fire', land(g, x, c) { g.effects.emitGlow({ pos: V(x, 0.2), count: 70, speed: 6, dir: [0, 1, 0], spread: 1.0, color: '#fff3c0', colorEnd: c, life: 0.6, size: 0.4 }); g.effects.ring(x, c, 2.4); sfx.fire(); sfx.smallBoom(); } },
  hielo:     { pose: 'patada_aerea', go: 'ice', land(g, x, c) { g.effects.shards(V(x, 0.3), c, 22); g.effects.ring(x, c, 2); sfx.shatter(); } },
  rayo:      { pose: 'jet_cae', go: 'zap', land(g, x, c) { g.effects.lightning(V(x, 6, -0.5), V(x, 0, 0), c, 0.25); g.effects.burst(V(x, 0.3), c, 60, 6); g.effects.ring(x, c, 2.4); sfx.zap(); sfx.thump(); } },
  bala:      { pose: 'bola', go: 'whoosh', land(g, x, c) { g.effects.dust(V(x, 0.1), 60); g.effects.ring(x, c, 3); g.effects.addShake(0.4); sfx.boom(); } },
};
export const PICADA_POSES = new Set(Object.values(PICADA).map((p) => p.pose));

// estallido sin humo negro (drones)
function blast(g, pos, color, size = 1) {
  g.effects.burst(pos, color, Math.round(50 * size), 6 * size, 0.26 * size);
  g.effects.burst(pos, '#ffffff', Math.round(20 * size), 4 * size);
  g.effects.flash(pos, color, 8 * size); g.effects.addShake(0.12 * size);
  sfx.smallBoom();
}

Object.assign(SPECIALS, {
  // En el aire: se queda un instante arriba (se ve venir) y se lanza en picada hacia el rival.
  // Si pega rebota hacia atrás; si cae al piso sin pegar, `onda` = radio de la onda que tumba a los que estén parados cerca.
  picada: {
    total: 0, anim: 'picada_carga', aire: true,
    canStart: (f) => f.y > 0.45,
    start(f, o) {
      const d = f.specData;
      d.phase = 'hang'; f.vx = 0; f.vy = 0;
      f.facing = o.x >= f.x ? 1 : -1;
      f.anim('picada_carga', 12, 0.5, 1);
      sfx.whoosh();
    },
    update(f, o, s, g, t) {
      const d = f.specData, st = PICADA[s.estilo] || PICADA.cohete;
      if (d.phase === 'hang') {
        f.vx = 0; f.vy = 0;
        if (t >= 7) {
          // hacia los pies del rival, entre 30° y 70° hacia abajo
          const dx = Math.max(0.15, (o.x - f.x) * f.facing), dy = f.y - (o.y + 0.45);
          const ang = clamp(Math.atan2(dy, dx), 0.5, 1.25), sp = s.velocidad ?? 17;
          d.vx = Math.cos(ang) * sp * f.facing; d.vy = -Math.sin(ang) * sp;
          d.phase = 'dive';
          f.anim(s.animacion || st.pose, 26, 0.15, 0.95);
          sfx[st.go]?.(true);
        }
        return false;
      }
      if (d.phase === 'dive') {
        f.vx = d.vx; f.vy = d.vy;
        if (!d.hit && f.reaches(o, 1.0, 0.55)) {
          d.hit = true;
          o.receive({ dmg: s.danio ?? 12, height: 'overhead', knockdown: true, push: 5, color: s.color }, f);
          d.phase = 'bounce'; f.vy = 7; f.vx = -2.6 * f.facing; f.anim('saltar', 40);
        }
        return false;
      }
      return d.phase === 'land' && f.t - d.landT >= (d.hit ? 8 : 16);
    },
    onLand(f, o, s, g) {
      const d = f.specData;
      if (d.phase !== 'dive' && d.phase !== 'bounce') return;
      const missed = d.phase === 'dive';
      d.phase = 'land'; d.landT = f.t; f.vx = 0; f.anim('agacharse');
      if (!missed) { sfx.land(); return; }
      (PICADA[s.estilo] || PICADA.cohete).land(g, f.x, s.color || '#ffffff');
      if (s.onda && !o.invulnerable() && o.y < 0.25 && Math.abs(o.x - f.x) < s.onda) {
        o.receive({ dmg: (s.danio ?? 12) * 0.6, height: 'low', knockdown: true, push: 4, color: s.color }, f, V(o.x, 0.3, 0.3));
      }
    },
  },

  // ---------------- Diego ----------------
  // Suelta dos drones de la espalda: se acomodan arriba y se lanzan contra el rival (uno a la cabeza, otro al cuerpo)
  drones: {
    total: 42, anim: 'orbital', s: 0.3, a: 0.9,
    canStart: (f, o, s, g) => !g.projectiles.some((p) => p.alive && p.owner === f.side && p.kind === 'dron'),
    update(f, o, s, g, t) {
      if (t === 3) sfx.servo();
      if (t === 12 || t === 20) {
        const alto = t === 12;
        spawnProjectile(g, f, 'dron', s, { x: f.x - f.facing * 0.3, y: f.y + 1.75, vx: f.facing * (alto ? 1.5 : 3), vy: alto ? 4 : 2.6, alto, dmg: (s.danio ?? 14) / 2, last: !alto });
        sfx.drone();
      }
      return t >= 42;
    },
  },

  // ---------------- Alan ----------------
  // Prende el jetpack a todo y pasa A TRAVÉS del rival más rápido que el sonido: el estruendo lo manda a volar
  boom_sonico: {
    total: 50, anim: 'carga',
    update(f, o, s, g, t) {
      const d = f.specData;
      if (t === 2) sfx.charge();
      if (t < 10 && t % 2 === 0) g.effects.aura(V(f.x, f.y + 0.9), s.color, 3);
      if (t === 10) { f.anim('propulsor'); d.ghost = true; d.side = Math.sign(o.x - f.x) || f.facing; sfx.rocket(); }
      if (t >= 10 && t < 22) {
        f.vx = (s.velocidad ?? 24) * f.facing;
        const now = Math.sign(o.x - f.x) || d.side;
        if (!d.hit && (now !== d.side || Math.abs(o.x - f.x) < 0.3) && Math.abs(o.y - f.y) < 1.6) { d.hit = true; d.hitT = t; }
      } else f.vx *= 0.75;
      // ya lo cruzó: el estruendo le pega un instante después (no lo empuja al pasar: lo atraviesa)
      if (d.hit && !d.boomed && t >= d.hitT + 3) {
        d.boomed = true;
        const p = V(o.x, o.y + 1.1, 0.3);
        g.effects.ring(o.x, '#ffffff', 3.6, 0.35); g.effects.burst(p, '#ffffff', 60, 7); g.effects.addShake(0.4); sfx.sonicBoom();
        o.receive({ dmg: s.danio ?? 13, height: 'mid', launch: 9, push: 3, color: s.color }, f, p);
      }
      if (t === 22) { d.ghost = false; f.anim('idle'); }
      if (t === 30) f.faceOpponent(o);
      return t >= 50;
    },
    interrupt(f) { if (f.specData) f.specData.ghost = false; },
  },

  // ---------------- Gera ----------------
  // Higadazo: entra agachado y le hunde el puño en el costado. Si conecta, el otro se dobla de rodillas sin aire.
  higadazo: {
    total: 40, anim: 'higadazo', s: 10 / 40, a: 16 / 40,
    update(f, o, s, g, t) {
      const d = f.specData;
      if (t < 9) f.vx = 4.5 * f.facing * f.speed; else f.vx *= 0.6;
      if (t === 6) sfx.whoosh(true);
      if (t >= 10 && t <= 14 && !d.hit && f.reaches(o, 1.15, 1.05)) {
        d.hit = true;
        const r = o.receive({ dmg: s.danio ?? 12, height: 'mid', hitstun: 22, push: 1.2, color: s.color }, f, V(o.x - f.facing * 0.2, o.y + 1.05, 0.3));
        if (r === 'hit' && !o.dead && o.state === 'hitstun') { o.setState('stunned', 'doblado'); o.stunDur = 75; sfx.oof(); }
      }
      return t >= 40;
    },
  },

  // ---------------- José ----------------
  // Imán de nalgas: se voltea y las menea; si el rival está cerca queda hipnotizado, se acerca solito… y nalgazo.
  iman: {
    total: 0, anim: 'twerk',
    update(f, o, s, g, t) {
      const d = f.specData;
      if (!d.phase) { d.phase = 'call'; sfx.magic(); }
      if (d.phase === 'call') {
        if (t === 16) {
          if (Math.abs(o.x - f.x) < 5 && o.y < 0.4 && !o.invulnerable() && o.state !== 'scripted') {
            const r = o.receive({ dmg: 2, height: 'mid', unblockable: true, push: 0, color: s.color, pull: true }, f, V(o.x, o.y + 1.4, 0.3));
            d.phase = r === 'hit' && !o.dead ? 'pull' : 'miss';
            if (d.phase === 'pull') sfx.kiss();
          } else d.phase = 'miss';
        }
        return false;
      }
      if (d.phase === 'pull') {
        const target = clamp(f.x + f.facing * 0.95, -ARENA, ARENA);
        o.x += (target - o.x) * 0.12; o.vx = 0;
        if (Math.abs(o.x - target) < 0.12 || t > 76) { d.phase = 'bump'; d.bt = t; f.anim('culazo'); }
        return false;
      }
      if (d.phase === 'bump') {
        if (t === d.bt + 4) {
          o.receive({ dmg: s.danio ?? 12, height: 'mid', unblockable: true, knockdown: true, push: 7, color: s.color }, f, V(o.x, o.y + 1.0, 0.3));
          g.effects.addShake(0.3); sfx.slap(); sfx.boing();
        }
        return t >= d.bt + 24;
      }
      return t >= 40;   // no estaba cerca: meneó para nada
    },
    // si le pegan mientras lo jala, el otro despierta
    interrupt(f, g) {
      const o = g.other(f);
      if (f.specData?.phase === 'pull' && o.state === 'pulled') o.setState('idle');
    },
  },

  // ---------------- Conde ----------------
  // Arrancabanquetas: arranca un pedazo de banqueta del piso y se lo avienta en arco; al caer se hace pedazos
  losa: {
    total: 50, anim: 'agarrar',
    canStart: (f, o, s, g) => !g.projectiles.some((p) => p.alive && p.owner === f.side && p.kind === 'losa'),
    start(f) { f.anim('agarrar', 10, 0.5, 1); },
    update(f, o, s, g, t) {
      const d = f.specData;
      if (t === 9) {
        d.lift = true; f.anim('levantar');
        const p = V(f.x + f.facing * 0.6, 0.12);
        g.effects.dust(p, 30); g.effects.shards(p, '#9a948a', 12); g.effects.addShake(0.2); sfx.crumble();
      }
      if (t === 28) {
        d.lift = false; f.anim('lanzar', 18, 0.15, 0.5);
        const x0 = f.x + f.facing * 0.3, y0 = f.y + 2.5 * f.sizeScale, vy = 4.5;
        const T = (vy + Math.sqrt(vy * vy + 2 * LOSA_G * Math.max(0.2, y0 - 1.0))) / LOSA_G;
        const dx = clamp(o.x - x0, -8, 8);
        spawnProjectile(g, f, 'losa', s, { x: x0, y: y0, vx: (dx * f.facing < 0.6 ? f.facing * 3 : dx / T), vy });
        sfx.whoosh(true);
      }
      return t >= 50;
    },
  },

  // ---------------- Emi ----------------
  // Anzuelo: lanza el hilo de pescar; si lo engancha, lo jala hasta él y lo deja mareado (como la cadena)
  anzuelo: {
    total: 0, anim: 'lanzar', s: 0.4, a: 0.8,
    start(f) {
      const d = f.specData;
      d.len = 0; d.phase = 'out';
      f.anim('lanzar', 22, 0.4, 0.9);
    },
    update(f, o, s, g, t) {
      const d = f.specData;
      if (t < 8) return false;
      if (t === 8) sfx.whoosh();
      const hand = f.hand;
      if (d.phase === 'out') {
        d.len += 0.36;
        const tipX = hand.x + f.facing * d.len;
        if (!o.invulnerable() && Math.abs(o.x - tipX) < 0.4 && o.y < 1.3) {
          const r = o.receive({ dmg: s.danio ?? 6, height: 'mid', push: 0, color: '#ffffff', pull: true }, f, V(tipX, hand.y, 0.3));
          d.phase = r === 'hit' && !o.dead ? 'pull' : 'back';
          if (d.phase === 'pull') sfx.splash();
        } else if (d.len > 6.5) d.phase = 'back';
      } else if (d.phase === 'pull') {
        const target = f.x + f.facing * 1.0;
        o.x += (target - o.x) * 0.2; o.vx = 0;
        d.len = Math.abs(o.x - hand.x);
        if (t % 4 === 0) sfx.reel();
        if (Math.abs(o.x - target) < 0.1) { o.setState('stunned', 'mareado'); o.stunDur = 55; d.phase = 'end'; d.endT = t; }
      } else if (d.phase === 'back') {
        d.len -= 0.5;
        if (t % 4 === 0) sfx.reel();
        if (d.len <= 0) { d.phase = 'end'; d.endT = t; }
      }
      return d.phase === 'end' && t - d.endT > 6;
    },
    interrupt(f, g) {
      const o = g.other(f);
      if (f.specData?.phase === 'pull' && o.state === 'pulled') o.setState('idle');
    },
  },

  // ---------------- Ramces ----------------
  // Spray para el pelo + encendedor = lanzallamas: varios golpes de cerca que lo van empujando
  lanzallamas: {
    total: 62, anim: 'chela', s: 0.2, a: 0.85,
    update(f, o, s, g, t) {
      if (t === 3) sfx.clank();
      if (t === 12) sfx.flame();
      if (t >= 14 && t < 50 && (t - 14) % 6 === 0) {
        const dx = (o.x - f.x) * f.facing;
        if (dx > 0 && dx < 3.1 && !o.invulnerable() && o.y < 1.8) {
          o.receive({ dmg: (s.danio ?? 15) / 6, height: 'mid', hitstun: 14, push: 1.6, color: '#ff8a2a' }, f, V(o.x - f.facing * 0.25, o.y + 1.2, 0.3));
        }
        if ((t - 14) % 18 === 0) sfx.fire();
      }
      return t >= 62;
    },
  },
});

// ---------------------------------------------------------------- proyectiles nuevos
// Dron de Diego: sube, se acomoda y luego persigue al rival hasta estrellarse (uno a la cabeza, otro al cuerpo)
PROJ_UPDATE.dron = (p, g) => {
  const owner = g.fighters[p.owner], opp = g.fighters[1 - p.owner];
  p.t++;
  if (p.t < 16) { p.vy *= 0.9; p.vx *= 0.95; }
  else {
    const dx = opp.x - p.x, dy = opp.y + (p.alto ? 1.55 : 0.95) - p.y, len = Math.hypot(dx, dy) || 1, sp = 8.5;
    p.vx += (dx / len * sp - p.vx) * 0.1; p.vy += (dy / len * sp - p.vy) * 0.1;
  }
  p.x += p.vx / 60; p.y += p.vy / 60;
  const pos = V(p.x, p.y, 0.25);
  if (!opp.invulnerable() && Math.abs(opp.x - p.x) < 0.45 && p.y > opp.y && p.y < opp.y + opp.height + 0.1) {
    opp.receive({ dmg: p.dmg, height: 'mid', hitstun: 18, push: 2.5, knockdown: !!p.last, color: p.color }, owner, pos);
    p.alive = false; blast(g, pos, p.color, 0.8);
  } else if (p.t > 170 || p.y < 0.1 || Math.abs(p.x) > ARENA + 2) { p.alive = false; blast(g, pos, p.color, 0.6); }
};

// Losa de Conde: vuela en arco; si le cae encima lo tumba, y si se rompe a sus pies también le llega
PROJ_UPDATE.losa = (p, g) => {
  const owner = g.fighters[p.owner], opp = g.fighters[1 - p.owner];
  p.t++;
  p.vy -= LOSA_G / 60; p.x += p.vx / 60; p.y += p.vy / 60;
  const body = !opp.invulnerable() && Math.abs(opp.x - p.x) < 0.6 && p.y > opp.y - 0.1 && p.y < opp.y + opp.height + 0.2;
  if (body || p.y <= 0.12 || Math.abs(p.x) > ARENA + 2) {
    p.alive = false;
    const pos = V(p.x, Math.max(p.y, 0.15), 0.2);
    g.effects.shards(pos, '#a9a297', 24); g.effects.dust(V(p.x, 0.1), 40); g.effects.addShake(0.3);
    sfx.crumble(); sfx.boom();
    if (body) opp.receive({ dmg: p.dmg, height: 'mid', knockdown: true, push: 6, color: p.color }, owner, pos);
    else if (!opp.invulnerable() && opp.y < 0.3 && Math.abs(opp.x - p.x) < 1.3) opp.receive({ dmg: p.dmg * 0.5, height: 'low', knockdown: true, push: 4, color: p.color }, owner, V(opp.x, 0.3, 0.3));
  }
};
