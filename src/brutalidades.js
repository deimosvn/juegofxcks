import * as THREE from 'three';
import { sfx } from './audio.js';

// =====================================================================
//  BRUTALITIES — con "¡ACÁBALO!" se marca la fatality y se DEJA PRESIONADO el botón (main.js tryFatality):
//  si lo sueltas antes de MANTENER cuadros es FATALITY; si lo aguantas, BRUTALITY.
//  Como las fatalities: brutal(t, ganador, perdedor, definición, juego, datos) -> true al terminar.
//  Aquí solo van los tiempos, las posiciones y los golpes (en línea las dos computadoras lo calculan igual);
//  cómo se ve (la cámara, la barra de "desinstalando", la grieta, el Camaro, el pez globo…) lo pone
//  cine-brutal.js leyendo `datos`.
// =====================================================================

export const MANTENER = 26;   // cuadros con el botón presionado para que sea BRUTALITY (~0.4 s)

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const ARENA = 9;
const clamp = THREE.MathUtils.clamp;
const ramp = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => { x = ramp(x); return x * x * (3 - 2 * x); };

// se pega al rival en los primeros cuadros (sin salirse del escenario)
function closeIn(t, w, l, d, gap) {
  if (t === 1) { d.x = clamp(l.x - w.facing * gap, -ARENA + 0.4, ARENA - 0.4); w.facing = l.x >= d.x ? 1 : -1; }
  if (t < 9) w.x += (d.x - w.x) * 0.35;
}

// chispa de golpe más chica que la de la pelea (en las tomas de cerca la normal tapa todo)
function spark(g, pos, color, strong) {
  g.effects.burst(pos, color, strong ? 26 : 14, strong ? 6 : 4.5, 0.12);
  g.effects.emitGlow({ pos, count: 1, speed: 0, color: '#ffffff', colorEnd: color, life: 0.08, size: strong ? 0.75 : 0.5 });
  g.effects.bloodSplash(pos, g.winner?.facing ?? 1, strong ? 0.6 : 0.3);
}

// Ráfaga de golpes: el otro se sacude con cada uno
function flurry(t, from, to, every, l, g, color, at = 1.3) {
  if (t < from || t > to || (t - from) % every) return false;
  const k = (t - from) / every, strong = k % 4 === 3;
  l.anim('golpeado');
  spark(g, V(l.x - (g.winner?.facing ?? 1) * 0.12, l.y + at + (k % 3) * 0.12, 0.3), color, strong);
  g.effects.addShake(strong ? 0.12 : 0.05); sfx.hit(strong);
  return true;
}

// Brazo de Conde (MUÑECO DE TRAPO): a qué ángulo va el brazo con el que lo azota. 0 = adelante · π = atrás
const SWINGS = [[14, 34, 0, Math.PI], [36, 54, Math.PI, 0], [56, 70, 0, Math.PI], [72, 90, Math.PI, 0]];

export const BRUTALITIES = {
  // Diego: ráfaga de puños de robot, lo escanea y lo "desinstala": la barra llega a 100%… ERROR 404
  desinstalar(t, w, l, def, g, d) {
    closeIn(t, w, l, d, 1.0);
    if (t === 1) { w.anim('rafaga', 60); l.anim('golpeado'); sfx.servo(); }
    if (flurry(t, 6, 58, 4, l, g, '#4fd8ff') && (t - 6) % 12 === 0) sfx.clank();
    if (t === 62) { w.anim('laser', 80, 0.1, 0.95); l.anim('mareado'); sfx.charge(); }
    if (t >= 66 && t <= 136) {
      d.pct = Math.min(100, Math.round((t - 66) / 70 * 100));
      if (t % 8 === 2) sfx.beep(d.pct);
      if (t % 23 === 0) sfx.glitch();
    }
    if (t === 140) {
      l.hidden = true; d.boom = true;
      g.effects.gore(l.chest, 1.5); g.effects.burst(l.chest, '#ff2a3a', 110, 9); g.effects.burst(l.chest, '#4fd8ff', 60, 6);
      g.effects.addShake(0.6); sfx.boom(); sfx.voxel();
    }
    if (t === 168) w.anim('victoria');
    return t >= 205;
  },

  // Alan: su Camaro lo atropella, se echa de reversa sobre él y lo vuelve a atropellar (el carro lo mueve cine-brutal.js;
  // los apachurrones van en ATROPELLOS, cuando el carro pasa por encima)
  atropello(t, w, l, def, g, d) {
    if (t === 1) { w.anim('jojo'); l.anim('mareado'); sfx.honk(); d.x = l.x; }
    if (t === 4) sfx.vroom();
    const i = ATROPELLOS.indexOf(t);
    if (i >= 0) {
      l.anim(i === 0 ? 'caer' : 'muerto'); l.squash = [0.62, 0.32, 0.1][i];
      g.effects.gore(V(l.x, 0.35, 0.2), i === 2 ? 1.3 : 0.6); g.effects.dust(V(l.x, 0.1), 30);
      g.effects.addShake(i === 2 ? 0.6 : 0.35); sfx.crash(); if (i === 2) sfx.boom();
    }
    if (t === 38 || t === 98) sfx.screech();
    if (t === 44) sfx.vroom();
    if (t === 72) sfx.vroom();
    if (t === 116 || t === 126) sfx.honk();
    if (t === 140) sfx.vroom();
    if (t === 150) w.anim('victoria');
    return t >= 215;
  },

  // Gera: ráfaga a la cara; con cada golpe la cabeza se le infla… y el gancho la revienta como piñata
  pinata(t, w, l, def, g, d) {
    closeIn(t, w, l, d, 0.95);
    if (t === 1) { w.anim('rafaga', 70); l.anim('golpeado'); d.swell = 0; }
    if (flurry(t, 6, 76, 5, l, g, '#ffd23a', 1.55)) d.swell = Math.min(1.35, d.swell + 0.09);
    if (t === 80) { w.anim('agacharse'); sfx.riser(0.4); }
    if (t === 90) w.anim('gancho_arriba', 30, 0.15, 0.6);
    if (t === 96) {
      d.pop = true; l.anim('caer');
      g.effects.gore(V(l.x, l.y + 1.7, 0.2), 1.2); g.effects.addShake(0.6); sfx.pop(); sfx.boom();
    }
    if (t === 150) w.anim('victoria');
    return t >= 205;
  },

  // José: menea las nalgas tan fuerte que el piso se abre bajo el otro y se lo traga; queda una tumba
  tragado(t, w, l, def, g, d) {
    if (t === 1) { w.anim('twerk', 110); l.anim('mareado'); d.crack = 0; d.sink = 0; }
    if (t >= 10 && t <= 90 && (t - 10) % 10 === 0) {
      const k = (t - 10) / 80;
      d.crack = Math.min(1, k + 0.12);
      g.effects.ring(l.x, '#ff7ab8', 1.4 + k * 1.6, 0.35); g.effects.dust(V(l.x, 0.1), 10 + Math.round(k * 20)); g.effects.addShake(0.08 + k * 0.2);
      sfx.thump(); if (k > 0.4) sfx.crumble();
    }
    if (t === 40) l.anim('miedo');
    if (t === 92) { l.anim('atrapado'); sfx.crumble(); sfx.boom(); }
    if (t >= 92 && t <= 150) {
      d.sink = smooth((t - 92) / 58); l.y = -2.3 * d.sink;
      if (t % 6 === 0) g.effects.dust(V(l.x, 0.1), 8);
    }
    if (t === 152) { d.closed = true; l.hidden = true; g.effects.dust(V(l.x, 0.1), 60); g.effects.addShake(0.45); sfx.boom(); }
    if (t === 168) { d.tomb = true; sfx.thump(); sfx.bell(); }
    if (t === 185) w.anim('victoria');
    return t >= 235;
  },

  // Conde: lo agarra de los tobillos y lo azota contra el piso de un lado y del otro; el último lo entierra de cabeza
  trapo(t, w, l, def, g, d) {
    closeIn(t, w, l, d, 1.25);
    if (t === 1) { w.anim('agarrar', 14, 0.5, 1); l.anim('mareado'); sfx.whoosh(); }
    if (t === 12) { d.grab = true; w.anim('levantar'); l.anim('colgado'); sfx.slap(); }
    if (d.grab && !d.buried) {
      let th = 0, final = false;
      for (const [a, b, from, to] of SWINGS) {
        if (t < a) break;
        const u = ramp((t - a) / (b - a)) ** 1.6;   // arranca lento y azota rápido
        th = from + (to - from) * u;
        final = a === SWINGS[3][0];
        if (t === b) {   // ¡azotón! (el último lo clava de cabeza junto a él)
          const hx = w.x + w.facing * (final ? 1.0 : to === 0 ? 2.4 : -2.4);
          g.effects.dust(V(hx, 0.1), 40); g.effects.ring(hx, '#c98b4a', 2.4);
          if (final) g.effects.gore(V(hx, 0.4, 0.2), 0.8); else g.effects.bloodSplash(V(hx, 0.4, 0.2), to === 0 ? w.facing : -w.facing, 1.2);
          g.effects.addShake(final ? 0.6 : 0.4); sfx.boom(); sfx.slap();
        }
      }
      // sus manos van en arco arriba de su cabeza; el cuerpo del otro apunta hacia afuera (y al final, de cabeza al piso)
      let ang = th - 0.6 + (th / Math.PI) * 1.2, px = w.x + w.facing * 0.9 * Math.cos(th), py = 1.0 + 1.4 * Math.sin(th);
      if (final && t > 81) { const k = ramp((t - 81) / 9); ang += (-Math.PI / 2 - ang) * k; px += (w.x + w.facing * 1.0 - px) * k; py += (1.0 - py) * k; }
      l.x = px; l.y = py; d.ang = ang;
      if (t >= 90) { d.buried = true; d.ang = -Math.PI / 2; l.x = w.x + w.facing * 1.0; l.y = 1.0; }
    }
    if (t === 92) { w.anim('agacharse'); sfx.crumble(); }
    if (t === 128) w.anim('flexion', 60);
    return t >= 215;
  },

  // Emi: cuatro pescadazos, le mete un pez globo a la boca, se infla como globo… y revienta en lluvia de pescaditos
  pezglobo(t, w, l, def, g, d) {
    closeIn(t, w, l, d, 0.95);
    if (t === 1) { l.anim('golpeado'); d.inflate = 0; }
    if ([6, 14, 22, 30].includes(t)) {
      w.anim('lanzar', 8, 0.3, 0.7); l.anim('golpeado');
      spark(g, V(l.x, l.y + 1.5, 0.3), '#8fd3ff', t === 30); g.effects.burst(V(l.x, l.y + 1.5, 0.3), '#bfe8ff', 24, 3.5);
      g.effects.addShake(0.08); sfx.slap();
    }
    if (t === 40) { w.anim('agarrar', 16, 0.4, 1); d.feed = true; sfx.whoosh(); }
    if (t === 48) { l.anim('atrapado'); sfx.gulp(); }
    if (t === 52) sfx.inflate();
    if (t >= 50 && t <= 122) { d.inflate = smooth((t - 50) / 72); l.y = 0.9 * d.inflate; }
    if (t === 124) { w.anim('lanzar', 14, 0.3, 0.6); sfx.whoosh(); }
    if (t === 128) {
      d.pop = true; l.hidden = true;
      const c = V(l.x, l.y + 1.1, 0.2);
      g.effects.gore(c, 1.4); g.effects.burst(c, '#bfe8ff', 90, 8); g.effects.addShake(0.6);
      sfx.pop(); sfx.splash(); sfx.boom();
    }
    if (t === 160) w.anim('victoria');
    return t >= 215;
  },

  // Ramces: afila la navaja, lo atraviesa en un parpadeo y queda de espaldas… "clic": el otro se cae en pedazos
  rasurado(t, w, l, def, g, d) {
    if (t === 1) { w.anim('afilar', 30); l.anim('mareado'); }
    if (t === 8 || t === 20) sfx.shink();
    if (t === 32) { d.from = w.x; d.to = clamp(l.x + w.facing * 1.7, -ARENA + 0.4, ARENA - 0.4); d.dash = true; sfx.slash(); sfx.whoosh(true); }
    if (t >= 32 && t <= 36) w.x = d.from + (d.to - d.from) * ((t - 32) / 4);
    if (t === 36) { w.anim('navaja', 26, 0.05, 0.45); l.anim('atrapado'); d.cuts = true; g.effects.addShake(0.2); }
    if (t === 60) w.anim('afilar', 40);   // de espaldas, cierra la navaja despacio
    if (t === 104) sfx.snip();          // "clic"
    if (t === 110) {
      l.hidden = true; d.boom = true;
      g.effects.gore(l.chest, 1.8); g.effects.bloodSplash(V(l.x, l.y + 1.3, 0.2), w.facing, 1.6); g.effects.bloodSplash(V(l.x, l.y + 0.8, 0.2), -w.facing, 1.2);
      g.effects.addShake(0.7); sfx.slash(); sfx.boom();
    }
    if (t === 150) w.anim('victoria');
    return t >= 205;
  },

  // Los demás: combo brutal de ocho golpes, gancho que lo levanta… y revienta en el aire (de su elemento)
  combo_brutal(t, w, l, def, g, d) {
    closeIn(t, w, l, d, 1.0);
    const c = def.color || '#ff2a2a';
    const SEQ = ['puno', 'puno_fuerte', 'patada', 'puno', 'patada_giratoria', 'puno_fuerte', 'patada', 'puno_fuerte'];
    if (t >= 4 && t < 76 && (t - 4) % 9 === 0) w.anim(SEQ[(t - 4) / 9], 16, 0.3, 0.6);
    flurry(t, 8, 71, 9, l, g, c);
    if (t === 76) { w.anim('gancho_arriba', 30, 0.15, 0.6); d.vy = 0.22; l.anim('caer'); spark(g, l.chest, c, true); g.effects.addShake(0.4); sfx.boom(); }
    if (t > 76 && t < 96) { l.y += d.vy; d.vy *= 0.92; }
    if (t === 96) {
      l.hidden = true;
      const p = l.chest;
      g.effects.gore(p, 1.6); g.effects.addShake(0.6); sfx.boom();
      if (def.estilo === 'fuego') { g.effects.emitGlow({ pos: p, count: 120, speed: 8, color: '#fff3c0', colorEnd: c, life: 0.7, size: 0.45 }); g.effects.smoke(p, '#222', 40); sfx.fire(); }
      else if (def.estilo === 'hielo') { g.effects.shards(p, c, 40); sfx.shatter(); }
      else if (def.estilo === 'rayo') { for (let i = 0; i < 3; i++) g.effects.lightning(V(p.x + (i - 1) * 0.8, 9, -0.5), p, c, 0.3); g.effects.burst(p, c, 90, 8); sfx.zap(); }
      else { g.effects.dust(V(p.x, 0.1), 50); g.effects.burst(p, c, 90, 8); }
    }
    if (t === 125) w.anim('victoria');
    return t >= 175;
  },
};

// Cuándo pasa el Camaro por encima (los mismos cuadros que su recorrido en cine-brutal.js)
export const ATROPELLOS = [19, 52, 82];
