// Oponente controlado por la computadora.
// Escribe en input.virtual como si fuera un jugador apretando botones.

export class CPU {
  constructor(me, input, game, level = 0.6) {
    this.me = me; this.input = input; this.game = game; this.level = level;
    this.queue = [];      // [{ keys: {...}, frames }]
    this.cool = 30;
    input.virtual = {};
  }

  dirKey(fwd) { return (this.me.facing > 0) === fwd ? 'right' : 'left'; }

  // Agrega una secuencia: cada paso mantiene teclas por N frames (con un frame vacío entre botones)
  plan(...steps) {
    for (const s of steps) { this.queue.push(s); if (s.tap) this.queue.push({ keys: {}, frames: 1 }); }
  }
  tap(keys, extra = {}) { return { keys, frames: 2, tap: true, ...extra }; }

  update(opp) {
    const me = this.me, g = this.game;
    const v = {};
    if (g.phase !== 'fight' && !(g.phase === 'finish' && g.winner === me)) { this.input.virtual = v; this.queue.length = 0; return; }

    if (this.queue.length) {
      const step = this.queue[0];
      Object.assign(v, step.keys);
      if (--step.frames <= 0) this.queue.shift();
      this.input.virtual = v;
      return;
    }
    if (--this.cool > 0) { this.input.virtual = v; return; }
    this.input.virtual = v;
    if (!me.canAct() && me.state !== 'jump') { this.cool = 2; return; }

    const d = Math.abs(opp.x - me.x);
    const r = Math.random();
    const L = this.level;
    const fwd = this.dirKey(true), back = this.dirKey(false);
    const specials = me.specials;
    const findSpec = (...tipos) => specials.findIndex((s) => tipos.includes(s.tipo));
    const useSpec = (i) => {
      if (i > 3) {   // sin lugar en el botón de especial: con su combinación de flechas
        const p = specials[i].parsed, map = { F: { [fwd]: true }, B: { [back]: true }, D: { down: true }, U: { up: true } };
        for (const s of p.seq) this.plan(this.tap(map[s]));
        if (p.btn) this.plan(this.tap({ [p.btn]: true }));
        return;
      }
      const dir = i === 1 ? { [fwd]: true } : i === 2 ? { down: true } : i === 3 ? { [back]: true } : {};
      this.plan({ keys: dir, frames: 2 }, this.tap({ ...dir, special: true }));
    };

    // Rematar en la fase "¡ACÁBALO!": a veces hace la fatalidad
    if (g.phase === 'finish') {
      if (me.fatality && Math.random() < 0.5 && d < 4) {
        const p = me.fatality.parsed;
        const map = { F: { [fwd]: true }, B: { [back]: true }, D: { down: true }, U: { up: true } };
        for (const s of p.seq) this.plan(this.tap(map[s]));
        if (p.btn) this.plan(this.tap({ [p.btn]: true }));
      } else this.plan(this.tap({ punch: true }));
      this.cool = 40;
      return;
    }

    // Defensa
    const oppAttacking = ['attack', 'airAttack', 'special'].includes(opp.state);
    const incoming = g.projectiles.find((p) => p.owner === opp.side && Math.sign(me.x - p.x) === Math.sign(p.vx) && Math.abs(p.x - me.x) < 4.5);
    if (incoming && r < L) {
      if (Math.random() < 0.5) this.plan({ keys: { up: true, [fwd]: true }, frames: 3 });
      else this.plan({ keys: { block: true }, frames: 24 });
      this.cool = 6; return;
    }
    if (oppAttacking && d < 2.4 && r < L * 0.75) {
      const low = opp.move?.height === 'low';
      this.plan({ keys: { block: true, down: low }, frames: 14 + Math.random() * 10 | 0 });
      this.cool = 4; return;
    }
    if (me.state === 'jump') { if (d < 2 && r < 0.5) this.plan(this.tap({ kick: true })); this.cool = 6; return; }

    // Ataque
    const proj = findSpec('proyectil', 'congelar', 'puno_cohete', 'laser', 'pescado', 'kawama', 'cohete', 'plasma');
    if (d > 4) {
      if (proj >= 0 && r < 0.35 && !g.hasProjectile(me)) useSpec(proj);
      else if (r < 0.5) this.plan({ keys: { [fwd]: true }, frames: 20 + Math.random() * 20 | 0 });
      else if (r < 0.65) { const i = findSpec('rayo', 'teletransporte', 'gancho', 'embestida', 'misiles', 'lluvia_pescados', 'orbital', 'propulsores', 'megalaser', 'camaro'); if (i >= 0) useSpec(i); else this.plan({ keys: { up: true, [fwd]: true }, frames: 3 }); }
      else this.plan({ keys: { up: true, [fwd]: true }, frames: 3 });
    } else if (d > 1.9) {
      if (r < 0.45) this.plan({ keys: { [fwd]: true }, frames: 10 + Math.random() * 14 | 0 });
      else if (r < 0.65) { const i = findSpec('embestida', 'terremoto', 'gancho', 'teletransporte', 'rayo', 'misiles', 'laser', 'chela', 'turbina', 'resorte', 'propulsores', 'megalaser', 'descarga', 'camaro'); if (i >= 0) useSpec(i); }
      else if (r < 0.8) this.plan({ keys: { up: true, [fwd]: true }, frames: 3 });
      else if (proj >= 0 && !g.hasProjectile(me)) useSpec(proj);
      else this.plan(this.tap({ [fwd]: true, punch: true }));
    } else {
      const combos = [
        () => this.plan(this.tap({ punch: true }), { keys: {}, frames: 6 }, this.tap({ punch: true }), { keys: {}, frames: 6 }, this.tap({ down: true, punch: true })),
        () => this.plan(this.tap({ kick: true })),
        () => this.plan({ keys: { down: true }, frames: 2 }, this.tap({ down: true, kick: true })),
        () => this.plan(this.tap({ [fwd]: true, punch: true })),
        () => this.plan(this.tap({ [back]: true, kick: true })),
        () => this.plan({ keys: { down: true }, frames: 2 }, this.tap({ down: true, punch: true })),
        () => this.plan({ keys: { [back]: true }, frames: 12 }),
        () => { const i = findSpec('uppercut_volador', 'gancho', 'poder', 'terremoto', 'armadura', 'titan', 'descarga'); if (i >= 0 && Math.random() < L) useSpec(i); else this.plan(this.tap({ punch: true })); },
        () => { const i = findSpec('agarre', 'gigante', 'rafaga', 'contra'); if (i >= 0 && Math.random() < L) useSpec(i); else this.plan(this.tap({ kick: true })); },
      ];
      combos[Math.random() * combos.length | 0]();
    }
    this.cool = Math.round((1.2 - L) * 22 + Math.random() * 10);
  }
}
