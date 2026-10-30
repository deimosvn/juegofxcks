// Oponente controlado por la computadora.
// Escribe en input.virtual como si fuera un jugador apretando botones.
// La dificultad cambia qué tan rápido reacciona (ve lo que haces unos cuadros tarde), cuánto se cubre,
// si castiga tus golpes fallados, si te recibe cuando saltas y si encadena combos.
import { MOVES } from './fighter.js';

//  react   cuadros que tarda en darse cuenta de lo que haces (60 = 1 segundo)
//  guard   probabilidad de cubrirse cuando le tiras un golpe      read  de adivinar arriba/abajo
//  punish  de castigar un golpe que fallaste                       antiAir  de pegarte cuando saltas
//  combo   de seguir pegando cuando conecta                        aggro  qué tanto ataca
//  footsies  de jugar con la distancia                             spec  de usar especiales
//  rest    pausa entre decisiones [mín, máx] en cuadros            fatal  de hacer la fatality
export const DIFICULTADES = {
  facil:     { nombre: 'FÁCIL', color: '#5fd35f', react: 26, guard: 0.15, read: 0.5, punish: 0.08, antiAir: 0.1, combo: 0.08, aggro: 0.35, footsies: 0.15, spec: 0.18, rest: [40, 75], fatal: 0.25 },
  normal:    { nombre: 'NORMAL', color: '#ffd23a', react: 16, guard: 0.42, read: 0.72, punish: 0.35, antiAir: 0.35, combo: 0.35, aggro: 0.55, footsies: 0.45, spec: 0.3, rest: [16, 40], fatal: 0.5 },
  dificil:   { nombre: 'DIFÍCIL', color: '#ff8a2a', react: 10, guard: 0.7, read: 0.9, punish: 0.72, antiAir: 0.65, combo: 0.7, aggro: 0.7, footsies: 0.75, spec: 0.4, rest: [7, 22], fatal: 0.8 },
  pesadilla: { nombre: 'PESADILLA', color: '#ff2a2a', react: 6, guard: 0.88, read: 0.97, punish: 0.95, antiAir: 0.88, combo: 0.92, aggro: 0.82, footsies: 0.92, spec: 0.45, rest: [2, 12], fatal: 1 },
};
export const NIVELES = Object.keys(DIFICULTADES);

// Especiales según para qué sirven
const PROJ = ['proyectil', 'congelar', 'puno_cohete', 'laser', 'pescado', 'kawama', 'cohete', 'plasma', 'tijeras'];
const DASH = ['rayo', 'teletransporte', 'gancho', 'embestida', 'misiles', 'lluvia_pescados', 'orbital', 'propulsores', 'megalaser', 'camaro'];
const CLOSE = ['embestida', 'terremoto', 'gancho', 'teletransporte', 'rayo', 'misiles', 'laser', 'chela', 'turbina', 'resorte', 'propulsores', 'megalaser', 'descarga', 'camaro', 'rapado', 'talco'];
const POWER = ['uppercut_volador', 'gancho', 'poder', 'terremoto', 'armadura', 'titan', 'descarga', 'navaja', 'talco'];
const GRAB = ['agarre', 'gigante', 'rafaga', 'contra'];

export class CPU {
  constructor(me, input, game, nivel = 'normal') {
    this.me = me; this.input = input; this.game = game;
    this.nivel = DIFICULTADES[nivel] ? nivel : 'normal';
    this.P = DIFICULTADES[this.nivel];
    this.queue = [];      // [{ keys, frames, tap?, soft? (se puede interrumpir), when? (espera a poder) }]
    this.cool = 30;
    this.seen = [];       // lo que ve del rival, cuadro por cuadro
    this.myCombo = 0; this.juggle = 0; this.wasStunned = false; this.blockedT = 0;
    this.lastAtk = null; this.lastProj = null; this.lastAir = null; this.lastPunish = null; this.airRoll = false;
    input.virtual = {};
  }

  dirKey(fwd) { return (this.me.facing > 0) === fwd ? 'right' : 'left'; }

  // Agrega una secuencia: cada paso mantiene teclas por N frames (con un frame vacío entre botones)
  plan(...steps) {
    for (const s of steps) { this.queue.push(s); if (s.tap) this.queue.push({ keys: {}, frames: 1 }); }
  }
  tap(keys) { return { keys, frames: 2, tap: true }; }
  // golpe que sale en cuanto se pueda (para encadenar)
  next(keys) { return { keys, frames: 2, tap: true, when: () => this.me.canAct() }; }
  walk(fwd, frames) { return { keys: { [this.dirKey(fwd)]: true }, frames: Math.max(1, frames), soft: true }; }
  wait(frames) { return { keys: {}, frames, soft: true }; }
  roll(p) { return Math.random() < p; }

  // lo que "ve" del rival: lo de hace unos cuadros (según la dificultad)
  see() { return this.seen[Math.max(0, this.seen.length - 1 - this.P.react)]; }

  findSpec(...tipos) { return this.me.specials.findIndex((s) => tipos.includes(s.tipo)); }
  useSpec(i) {
    const specials = this.me.specials, fwd = this.dirKey(true), back = this.dirKey(false);
    if (i > 3) {   // sin lugar en el botón de especial: con su combinación de flechas
      const p = specials[i].parsed, map = { F: { [fwd]: true }, B: { [back]: true }, D: { down: true }, U: { up: true } };
      for (const s of p.seq) this.plan(this.tap(map[s]));
      if (p.btn) this.plan(this.tap({ [p.btn]: true }));
      return;
    }
    const dir = i === 1 ? { [fwd]: true } : i === 2 ? { down: true } : i === 3 ? { [back]: true } : {};
    this.plan({ keys: dir, frames: 2 }, this.tap({ ...dir, special: true }));
  }

  update(opp) {
    const me = this.me, g = this.game;
    this.seen.push({ state: opp.state, move: opp.moveName, t: opp.t, id: opp.animId, x: opp.x, y: opp.y, vx: opp.vx, vy: opp.vy, hit: opp.hasHit });
    if (this.seen.length > 40) this.seen.shift();
    // acaba de recibir o de bloquear: en eso sí está atento
    if (me.state === 'hitstun' || me.state === 'blockstun') { this.wasStunned = me.state === 'hitstun'; this.blockedT = me.state === 'blockstun' ? 12 : 0; }
    else if (this.blockedT > 0) this.blockedT--;
    if (g.phase !== 'fight' && !(g.phase === 'finish' && g.winner === me)) { this.input.virtual = {}; this.queue.length = 0; return; }
    const step = this.queue[0];
    if (step && !step.soft) return this.run();
    if (g.phase === 'finish') {
      if (!step && --this.cool <= 0) { this.finish(opp); this.cool = 40; }
      return this.run();
    }
    if (this.react(opp)) return this.run();
    if (step) return this.run();
    if (--this.cool > 0) { this.input.virtual = {}; return; }
    if (!me.canAct() && me.state !== 'jump') { this.cool = 2; this.input.virtual = {}; return; }
    this.think(opp);
    const [a, b] = this.P.rest;
    this.cool = Math.round(a + (b - a) * Math.random());
    this.run();
  }

  run() {
    const s = this.queue[0];
    if (!s) { this.input.virtual = {}; return; }
    if (s.when && !s.when()) {   // espera a poder moverse; si tarda demasiado, lo deja
      this.input.virtual = {};
      s.waited = (s.waited || 0) + 1;
      if (s.waited > 45) this.queue.shift();
      return;
    }
    this.input.virtual = s.keys;
    if (--s.frames <= 0) this.queue.shift();
  }

  // Reacciones a lo que hace el rival (con el retraso de la dificultad). true = ya decidió algo.
  react(opp) {
    const me = this.me, g = this.game, P = this.P, s = this.see();
    if (!s) return false;
    const dx = s.x - me.x, d = Math.abs(dx), fwd = this.dirKey(true);
    // conectó un golpe: seguir el combo
    if (me.combo > this.myCombo) {
      this.myCombo = me.combo;
      if (this.roll(P.combo)) { this.followUp(opp); if (this.queue.length) return true; }
    }
    if (me.combo === 0) this.myCombo = 0;
    // malabares: lo remata cuando va cayendo
    if (this.juggle > 0) {
      if (opp.state !== 'airHit') this.juggle = 0;
      else if (me.canAct()) {
        const od = Math.abs(opp.x - me.x);
        if (od < 1.35 && opp.vy < 1 && opp.y < 1.35 && opp.y > 0.15) { this.juggle--; this.plan(this.tap({ [fwd]: true, punch: true })); return true; }
        if (od > 1.3 && od < 3.2) { this.plan(this.walk(true, 3)); return true; }
      }
    }
    if (me.state === 'jump') {
      if (d < 1.9 && this.roll(0.08)) { this.plan(this.tap({ kick: true })); return true; }
      return false;
    }
    if (!me.canAct()) return false;
    // si te está presionando (le acabas de pegar o te bloqueó), sigue cubierto mientras sigas atacando
    if ((this.wasStunned || this.blockedT > 0) && (opp.state === 'attack' || opp.state === 'special') && d < 2.6 && this.roll(P.guard)) {
      this.wasStunned = false;
      this.plan({ keys: { block: true, down: this.roll(1 - P.read) ? opp.move?.height !== 'low' : opp.move?.height === 'low' }, frames: 10 });
      return true;
    }
    // se cubre de un golpe nuevo (si alcanza a verlo)
    const atk = s.state === 'attack' || s.state === 'airAttack' || s.state === 'special';
    if (atk && s.id !== this.lastAtk) {
      this.lastAtk = s.id;
      const m = s.move ? MOVES[s.move] : null;
      const reach = m ? m.range * opp.sizeScale + 0.9 : 3.6;
      if (d < reach && this.roll(P.guard)) {
        let low = m?.height === 'low';
        if (!this.roll(P.read)) low = !low;
        const left = m ? m.startup + m.active + 6 - (s.t + P.react) : 22;
        this.queue.length = 0;
        this.plan({ keys: { block: true, down: low }, frames: Math.max(6, Math.min(26, left)) });
        return true;
      }
    }
    // proyectiles: los brinca o se cubre
    const pr = g.projectiles.find((p) => p.alive && p.owner === opp.side && Math.sign(me.x - p.x) === Math.sign(p.vx) && Math.abs(p.x - me.x) < 2.2 + Math.abs(p.vx) * P.react / 60);
    if (pr && pr.id !== this.lastProj) {
      this.lastProj = pr.id;
      if (this.roll(P.guard)) {
        this.queue.length = 0;
        if (this.roll(0.35)) this.plan({ keys: { up: true, [fwd]: true }, frames: 3 });
        else this.plan({ keys: { block: true }, frames: 24 });
        return true;
      }
    }
    // antiaéreo: viene saltando hacia mí
    if ((s.state === 'jump' || s.state === 'airAttack') && d < 2.8) {
      if (s.id !== this.lastAir) { this.lastAir = s.id; this.airRoll = this.roll(P.antiAir); }
      if (this.airRoll && s.vy < 3 && d < 1.45 && s.y < 2.3) {
        this.airRoll = false; this.queue.length = 0;
        this.plan({ keys: { down: true }, frames: 1 }, this.tap({ down: true, punch: true }));
        return true;
      }
    }
    // castigo: falló un golpe y se quedó expuesto
    if (s.state === 'attack' && !s.hit && s.move && s.id !== this.lastPunish) {
      const m = MOVES[s.move], left = m.total - (s.t + P.react);
      if (s.t > m.startup + m.active && left > 6) {
        this.lastPunish = s.id;
        if (this.roll(P.punish) && this.punish(d, left)) return true;
      }
    }
    return false;
  }

  // el mejor golpe que alcanza a entrar antes de que se recupere
  punish(d, left) {
    const fwd = this.dirKey(true);
    this.queue.length = 0;
    if (d < 1.25 && left >= 10) { this.plan({ keys: { down: true }, frames: 1 }, this.tap({ down: true, punch: true })); return true; }
    if (d < 1.65 && left >= 9) { this.plan(this.tap({ kick: true })); return true; }
    if (d < 2.05 && left >= 10) { this.plan(this.tap({ [fwd]: true, punch: true })); return true; }
    if (d < 1.35 && left >= 6) { this.plan(this.tap({ punch: true })); return true; }
    const i = this.findSpec(...DASH);
    if (i >= 0 && left >= 12) { this.useSpec(i); return true; }
    return false;
  }

  // después de conectar: en el aire lo remata al caer; en el piso sigue con otro golpe pegado
  followUp(opp) {
    const fwd = this.dirKey(true), back = this.dirKey(false), d = Math.abs(opp.x - this.me.x);
    if (opp.state === 'airHit') { this.juggle = this.P.combo > 0.6 ? 2 : 1; return; }
    if (opp.state !== 'hitstun') return;
    const opts = d < 1.2
      ? [() => this.plan(this.next({ punch: true }), this.next({ [fwd]: true, punch: true })), () => this.plan(this.next({ down: true, punch: true })), () => this.plan(this.next({ kick: true }))]
      : [() => this.plan(this.next({ kick: true })), () => this.plan(this.next({ [back]: true, kick: true })), () => this.plan(this.next({ [fwd]: true, punch: true }))];
    opts[Math.random() * opts.length | 0]();
  }

  // ¡ACÁBALO!: a veces hace su fatality
  finish(opp) {
    const me = this.me, d = Math.abs(opp.x - me.x), fwd = this.dirKey(true), back = this.dirKey(false);
    if (me.fatality && d < 4 && this.roll(this.P.fatal)) {
      const p = me.fatality.parsed, map = { F: { [fwd]: true }, B: { [back]: true }, D: { down: true }, U: { up: true } };
      for (const s of p.seq) this.plan(this.tap(map[s]));
      if (p.btn) this.plan(this.tap({ [p.btn]: true }));
    } else if (d > 1.3) this.plan(this.walk(true, 12));
    else this.plan(this.tap({ punch: true }));
  }

  // Qué hacer cuando nadie está atacando: acercarse, jugar con la distancia, presionar o tirar especiales
  think(opp) {
    const me = this.me, g = this.game, P = this.P;
    const d = Math.abs(opp.x - me.x), fwd = this.dirKey(true), back = this.dirKey(false);
    const proj = this.findSpec(...PROJ), canProj = proj >= 0 && !g.hasProjectile(me);
    // se está levantando: se acerca para recibirlo
    if ((opp.state === 'knockdown' || opp.state === 'getup') && this.roll(P.aggro)) {
      if (d > 1.3) this.plan(this.walk(true, Math.min(30, (d - 1.1) / 0.055 | 0)));
      else this.plan(this.wait(8));
      return;
    }
    if (d > 3.6) {
      if (canProj && this.roll(P.spec * 1.6)) return this.useSpec(proj);
      if (this.roll(P.aggro)) return this.plan(this.walk(true, 18 + Math.random() * 22 | 0));
      const i = this.findSpec(...DASH);
      if (i >= 0 && this.roll(P.spec)) return this.useSpec(i);
      if (this.roll(0.2)) return this.plan({ keys: { up: true, [fwd]: true }, frames: 3 });
      return this.plan(this.wait(10));
    }
    if (d > 1.9) {
      // juega con la distancia: entra y sale del alcance de tus patadas
      if (this.roll(P.footsies)) {
        if (this.roll(0.55)) return this.plan(this.walk(true, 6 + Math.random() * 10 | 0));
        if (this.roll(0.5)) return this.plan(this.walk(false, 6 + Math.random() * 8 | 0));
      }
      if (this.roll(0.3 + P.aggro * 0.3)) return this.plan(this.walk(true, 10 + Math.random() * 14 | 0));
      if (canProj && this.roll(P.spec)) return this.useSpec(proj);
      const i = this.findSpec(...CLOSE);
      if (i >= 0 && this.roll(P.spec)) return this.useSpec(i);
      if (d < 2.2 && this.roll(0.5)) return this.plan(this.tap({ [fwd]: true, punch: true }));   // recto con paso
      if (this.roll(0.25)) return this.plan({ keys: { up: true, [fwd]: true }, frames: 3 });
      return this.plan(this.wait(6));
    }
    // de cerca: a veces se cubre por si acaso (adivinando arriba o abajo), otras se aleja…
    if (this.roll(P.guard * 0.4)) return this.plan({ keys: { block: true, down: this.roll(0.35) }, frames: 12 + Math.random() * 16 | 0, soft: true });
    if (!this.roll(P.aggro) && this.roll(0.5)) return this.plan(this.walk(false, 10));
    // …y si no, presiona mezclando golpes arriba y abajo
    const strings = [
      () => this.plan(this.tap({ punch: true }), this.next({ punch: true }), this.next({ [fwd]: true, punch: true })),
      () => this.plan(this.tap({ kick: true })),
      () => this.plan({ keys: { down: true }, frames: 2 }, this.tap({ down: true, kick: true })),
      () => this.plan(this.tap({ [fwd]: true, punch: true })),
      () => this.plan(this.tap({ punch: true }), this.next({ down: true, kick: true })),   // arriba y luego abajo
      () => this.plan({ keys: { down: true }, frames: 2 }, this.tap({ down: true, punch: true })),
      () => this.plan(this.tap({ [back]: true, kick: true })),
      () => { const i = this.findSpec(...POWER); if (i >= 0 && this.roll(P.spec * 2)) this.useSpec(i); else this.plan(this.tap({ punch: true })); },
      () => { const i = this.findSpec(...GRAB); if (i >= 0 && this.roll(P.spec * 2)) this.useSpec(i); else this.plan(this.tap({ kick: true })); },
    ];
    // en fácil casi nunca encadena: un golpe suelto
    const pick = this.roll(P.combo) ? strings[Math.random() * strings.length | 0] : strings[[1, 3, 6][Math.random() * 3 | 0]];
    pick();
  }
}
