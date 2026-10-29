import * as THREE from 'three';
import { parseInput } from './input.js';
import { SPECIALS } from './specials.js';
import { sfx } from './audio.js';

// =====================================================================
//  Peleador = SOLO simulación (datos simples). El modelo 3D vive en main.js.
//  Todo el estado está en campos simples para poder guardarlo y restaurarlo
//  en cada frame (necesario para el rollback del modo en línea).
// =====================================================================

export const GRAVITY = 32;
export const ARENA_HALF = 9;
const BODY_H = 1.85, CROUCH_H = 1.1;
// Conde gigante: +35% de tamaño. En su fatality crece hasta 3.2 veces y luego regresa.
export const GIANT = 0.35;
const ramp = (x) => Math.min(1, Math.max(0, x));
export const stompScale = (t) => 1 + 2.2 * ramp((t - 8) / 36) * (1 - ramp((t - 150) / 30));

// Golpes normales. Tiempos en frames (60 por segundo).
//  hy = altura del golpe; height: high (falla si te agachas), mid, low (hay que bloquear abajo), overhead (desde el aire)
export const MOVES = {
  puno:             { startup: 5,  active: 3,  recovery: 9,  dmg: 5,  range: 1.05, hy: 1.5,  height: 'high', hitstun: 14, push: 2.5 },
  puno_fuerte:      { startup: 9,  active: 4,  recovery: 16, dmg: 9,  range: 1.15, hy: 1.45, height: 'high', hitstun: 20, push: 4.5, lunge: 3 },
  patada:           { startup: 8,  active: 4,  recovery: 14, dmg: 8,  range: 1.4,  hy: 1.25, height: 'mid',  hitstun: 18, push: 4 },
  patada_giratoria: { startup: 12, active: 5,  recovery: 18, dmg: 11, range: 1.5,  hy: 1.4,  height: 'high', knockdown: true, push: 6 },
  gancho_arriba:    { startup: 9,  active: 5,  recovery: 24, dmg: 12, range: 1.0,  hy: 1.2,  height: 'mid',  launch: 11, push: 2 },
  barrida:          { startup: 9,  active: 5,  recovery: 20, dmg: 7,  range: 1.6,  hy: 0.2,  height: 'low',  knockdown: true, push: 1.5, crouching: true },
  patada_aerea:     { startup: 4,  active: 12, recovery: 4,  dmg: 8,  range: 1.3,  hy: 0.9,  height: 'overhead', hitstun: 18, push: 3, air: true },
};
for (const k in MOVES) { const m = MOVES[k]; m.name = k; m.total = m.startup + m.active + m.recovery; }

// Campos que forman el estado del peleador
const FIELDS = ['x', 'y', 'vx', 'vy', 'facing', 'health', 'state', 't', 'moveName', 'hasHit', 'specIdx', 'specData',
  'combo', 'comboTaken', 'buffTimer', 'buffKind', 'buffColor', 'invuln', 'stunDur', 'airAttackUsed', 'wasCrouchBlock',
  'animKey', 'animTotal', 'animS', 'animA', 'animStart', 'animId', 'flip', 'wins', 'hidden', 'burn', 'squash', 'iced', 'rocket'];

export class Fighter {
  constructor(def, side, game) {
    this.def = def;
    this.side = side;            // 0 = izquierda (P1), 1 = derecha (P2)
    this.game = game;
    this.speed = def.stats?.velocidad ?? 1;
    this.power = def.stats?.fuerza ?? 1;
    this.maxHealth = def.stats?.vida ?? 100;
    const parse = (list) => (list || []).map((s) => ({ ...s, parsed: parseInput(s.input) }));
    // con el traje de robot (MODO TITÁN) los botones sacan otras armas: especialesTitan
    this.normalSpecials = parse(def.especiales);
    this.titanSpecials = parse(def.especialesTitan);
    this.allSpecials = [...this.normalSpecials, ...this.titanSpecials];
    this.titanSpeed = this.normalSpecials.find((s) => s.tipo === 'titan')?.velocidad ?? 1.7;
    this.fatality = def.fatality ? { ...def.fatality, parsed: parseInput(def.fatality.input) } : null;
    this.wins = 0;
    this.reset(side === 0 ? -2.6 : 2.6);
  }

  reset(x) {
    this.x = x; this.y = 0; this.vx = 0; this.vy = 0;
    this.facing = this.side === 0 ? 1 : -1;
    this.health = this.maxHealth;
    this.state = 'idle'; this.t = 0;
    this.moveName = null; this.hasHit = false;
    this.specIdx = -1; this.specData = null;
    this.combo = 0; this.comboTaken = 0;
    this.buffTimer = 0; this.buffKind = null; this.buffColor = null; this.invuln = 0;
    this.stunDur = 0; this.airAttackUsed = false; this.wasCrouchBlock = false;
    this.animKey = 'idle'; this.animTotal = 0; this.animS = 0; this.animA = 0; this.animStart = 0; this.animId = 0;
    this.flip = false; this.hidden = false; this.burn = 0; this.squash = 1; this.iced = false; this.rocket = false;
  }

  serialize() {
    const o = {};
    for (const k of FIELDS) o[k] = this[k];
    o.specData = this.specData ? structuredClone(this.specData) : null;
    return o;
  }
  deserialize(o) {
    for (const k of FIELDS) this[k] = o[k];
    this.specData = o.specData ? structuredClone(o.specData) : null;
  }

  get move() { return this.moveName ? MOVES[this.moveName] : null; }
  get spec() { return this.specIdx >= 0 ? this.allSpecials[this.specIdx] : null; }
  get specials() { return this.titan && this.titanSpecials.length ? this.titanSpecials : this.normalSpecials; }
  get titan() { return this.buffKind === 'titan' && this.buffTimer > 0; }
  get grounded() { return this.y <= 0.0001 && this.vy <= 0; }
  get dead() { return this.health <= 0; }
  get giant() { return this.buffKind === 'giant' && this.buffTimer > 0; }
  // Tamaño: sale del estado (buff, especial, fatality), así que es igual en las dos computadoras
  get sizeScale() {
    const g = this.game;
    if (g.phase === 'fatality' && g.fatal?.tipo === 'pisoton' && g.winner === this) return stompScale(g.phaseT);
    if (this.giant) return 1 + GIANT * ramp(this.buffTimer / 24);   // al final se encoge
    if (this.state === 'special' && this.spec?.tipo === 'gigante') return 1 + GIANT * ramp((this.t - 12) / 26);
    return 1;
  }
  get height() {
    const h = (this.state === 'crouch' || this.state === 'crouchBlock' || (this.state === 'attack' && this.move?.crouching)) ? CROUCH_H : (this.state === 'knockdown' || this.state === 'dead') ? 0.45 : BODY_H;
    return h * this.sizeScale;
  }
  get chest() { return new THREE.Vector3(this.x, this.y + this.height * 0.72, 0.15); }
  get hand() { const k = this.sizeScale; return new THREE.Vector3(this.x + this.facing * 0.75 * k, this.y + 1.4 * k, 0.2); }

  setState(state, animKey = null, total = 0, s = 0, a = 0) {
    this.state = state; this.t = 0;
    this.anim(animKey || state, total, s, a);
  }
  anim(key, total = 0, s = 0, a = 0) {
    this.animKey = key; this.animTotal = total; this.animS = s; this.animA = a; this.animStart = this.t; this.animId++;
  }

  canAct() { return ['idle', 'walk', 'crouch', 'block', 'crouchBlock'].includes(this.state); }
  invulnerable() { return this.invuln > 0 || ['knockdown', 'getup', 'dead', 'victory', 'intro', 'vanished'].includes(this.state); }

  faceOpponent(opp) {
    const f = opp.x >= this.x ? 1 : -1;
    if (Math.abs(opp.x - this.x) > 0.05) this.facing = f;
  }

  startAttack(name) {
    const m = MOVES[name];
    this.moveName = name; this.hasHit = false;
    this.setState(m.air ? 'airAttack' : 'attack', name, m.total, m.startup / m.total, (m.startup + m.active) / m.total);
    sfx.whoosh();
  }

  startSpecial(spec, opp) {
    const S = SPECIALS[spec.tipo];
    if (!S || (S.canStart && !S.canStart(this, opp, spec, this.game))) return false;
    this.specIdx = this.allSpecials.indexOf(spec); this.specData = {};
    this.setState('special', spec.animacion || S.anim || 'especial', S.total || 0, S.s || 0.3, S.a || 0.5);
    this.game.event('special', { side: this.side, nombre: spec.nombre, color: spec.color });
    S.start?.(this, opp, spec, this.game);
    return true;
  }

  trySpecial(inp, opp) {
    const frame = this.game.frame;
    // 1) Secuencias tipo ← → + P (las más largas primero)
    const sorted = [...this.specials].sort((a, b) => (b.parsed?.seq.length || 0) - (a.parsed?.seq.length || 0));
    for (const sp of sorted) {
      const p = sp.parsed; if (!p) continue;
      if (p.btn ? inp.pressed[p.btn] : (inp.newDir && p.seq.length >= 2 && inp.buffer.at(-1)?.d === p.seq.at(-1))) {
        if (inp.matchMotion(p.seq, frame) && (p.btn || p.seq.length)) {
          if (this.startSpecial(sp, opp)) { inp.clearBuffer(); return true; }
        }
      }
    }
    // 2) Botón de especial: solo = 1º, adelante = 2º, abajo = 3º, atrás = 4º
    if (inp.pressed.special) {
      let i = 0;
      if (inp.held.down) i = 2; else if (inp.forward(this.facing)) i = 1; else if (inp.back(this.facing)) i = 3;
      const sp = this.specials[i] || this.specials[0];
      if (sp && this.startSpecial(sp, opp)) { inp.clearBuffer(); return true; }
    }
    return false;
  }

  update(inp, opp) {
    const g = this.game;
    this.t++;
    if (this.invuln > 0) this.invuln--;
    if (this.buffTimer > 0) {
      this.buffTimer--;
      if (this.t % (this.titan ? 6 : 3) === 0) g.effects.aura(new THREE.Vector3(this.x, this.y + 0.9 * this.sizeScale, 0), this.buffColor || '#ff2a2a', 2);
      // gigante: cada paso retumba
      if (this.giant && this.state === 'walk' && this.t % 16 === 8) {
        g.effects.dust(new THREE.Vector3(this.x, 0.05, 0), 10); g.effects.addShake(0.05); sfx.thump();
      }
      if (this.buffTimer === 0) {
        // se acaba el MODO TITÁN: el traje sale volando en pedazos
        if (this.buffKind === 'titan') {
          const c = new THREE.Vector3(this.x, this.y + 1.1, 0.2);
          g.effects.shards(c, '#9fb3c8', 26); g.effects.smoke(c, '#555', 26); g.effects.burst(c, this.buffColor || '#4fd8ff', 40, 5);
          sfx.powerDown();
        }
        this.buffKind = null;
      }
    }
    const wasAir = this.y > 0 || this.vy > 0;
    const fwd = inp.forward(this.facing), back = inp.back(this.facing);
    const boost = this.giant ? 0.85 : this.titan ? this.titanSpeed : 1;   // gigante lento, robot rápido
    const walkSpd = 3.3 * this.speed * boost;

    switch (this.state) {
      case 'idle': case 'walk': case 'crouch': case 'block': case 'crouchBlock': {
        this.faceOpponent(opp);
        this.vx = 0;
        if (g.phase !== 'fight' && g.phase !== 'finish') { this.setIfNew('idle'); break; }
        if (g.phase === 'finish' && g.winner === this && g.tryFatality(this, inp)) break;
        if (this.trySpecial(inp, opp)) break;
        if (inp.pressed.punch) {
          if (inp.held.down) this.startAttack('gancho_arriba');
          else if (fwd) this.startAttack('puno_fuerte');
          else this.startAttack('puno');
          break;
        }
        if (inp.pressed.kick) {
          if (inp.held.down) this.startAttack('barrida');
          else if (back) this.startAttack('patada_giratoria');
          else this.startAttack('patada');
          break;
        }
        if (inp.held.block) { this.setIfNew(inp.held.down ? 'crouchBlock' : 'block', inp.held.down ? 'bloqueo_bajo' : 'bloqueo'); break; }
        if (inp.held.up) {
          const jx = 4 * this.speed * (this.titan ? 1.35 : 1);
          this.vy = 11.5; this.vx = fwd ? jx * this.facing : back ? -jx * this.facing : 0;
          this.flip = this.vx !== 0;
          this.airAttackUsed = false;
          this.setState('jump', 'saltar', 50);
          sfx.jump();
          break;
        }
        if (inp.held.down) { this.setIfNew('crouch', 'agacharse'); break; }
        if (fwd || back) {
          this.vx = (fwd ? walkSpd : -walkSpd * 0.82) * this.facing;
          this.setIfNew('walk', fwd ? 'caminar' : 'caminar_atras');
          if (this.animKey !== (fwd ? 'caminar' : 'caminar_atras')) this.anim(fwd ? 'caminar' : 'caminar_atras');
          // pasos (el robot suena a metal; el gigante ya retumba)
          if (!this.giant && this.t % (this.titan ? 9 : 15) === 7) { if (this.titan) sfx.clankStep(); else sfx.step(); }
          break;
        }
        this.setIfNew('idle');
        break;
      }

      case 'jump':
        if ((inp.pressed.punch || inp.pressed.kick) && !this.airAttackUsed && g.phase === 'fight') {
          this.airAttackUsed = true;
          const m = MOVES.patada_aerea;
          this.moveName = 'patada_aerea'; this.hasHit = false;
          this.state = 'airAttack'; this.t = 0;
          this.anim('patada_aerea', m.total, m.startup / m.total, (m.startup + m.active) / m.total);
          sfx.whoosh();
        }
        break;

      case 'attack': case 'airAttack': {
        const m = this.move;
        if (this.state === 'attack') {
          this.vx = (m.lunge && this.t < m.startup + 2) ? m.lunge * this.facing : this.vx * 0.7;
          if (this.t >= m.total) { this.endAction(inp); break; }
        }
        if (this.t > m.startup && this.t <= m.startup + m.active && !this.hasHit) this.checkHit(opp, m);
        break;
      }

      case 'hitstun': case 'blockstun':
        this.vx *= 0.82;
        if (this.t >= this.stunDur) {
          if (this.state === 'blockstun') this.setState(this.wasCrouchBlock ? 'crouchBlock' : 'block', this.wasCrouchBlock ? 'bloqueo_bajo' : 'bloqueo');
          else this.setState('idle');
          opp.combo = 0; this.comboTaken = 0;
        }
        break;

      case 'stunned':
        this.vx *= 0.8;
        if (this.t % 40 === 8) sfx.tweet();   // pajaritos
        if (this.t >= this.stunDur) { this.setState('idle'); opp.combo = 0; this.comboTaken = 0; }
        break;

      case 'frozen':
        this.vx *= 0.9;
        if (this.t % 6 === 0) g.effects.aura(new THREE.Vector3(this.x, this.y + 1, 0), '#bff3ff', 1);
        if (this.t >= this.stunDur) this.unfreeze();
        break;

      case 'airHit': break;   // se resuelve al aterrizar
      case 'knockdown':
        this.vx *= 0.85;
        if (this.dead) { this.state = 'dead'; break; }
        if (this.t >= 38) { this.setState('getup', 'levantarse', 24); this.invuln = 30; sfx.getup(); }
        break;
      case 'getup':
        if (this.t >= 24) { this.setState('idle'); opp.combo = 0; this.comboTaken = 0; }
        break;

      case 'special': {
        const S = SPECIALS[this.spec.tipo];
        if (S.update(this, opp, this.spec, g, this.t)) this.endAction(inp);
        break;
      }

      case 'pulled': case 'dizzy': case 'dead': case 'victory': case 'intro': case 'vanished': case 'scripted':
        this.vx *= 0.85;
        if (this.state === 'dizzy' && this.t % 50 === 12) sfx.tweet();
        break;
    }

    // Física
    this.x += this.vx / 60;
    this.y += this.vy / 60;
    if (this.y > 0 || this.vy > 0) this.vy -= GRAVITY / 60 * (this.state === 'airHit' ? 0.85 : 1);
    if (this.y <= 0) {
      this.y = 0;
      if (wasAir && this.vy <= 0) { this.vy = 0; this.onLand(); }
    }
    this.x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, this.x));
  }

  setIfNew(state, animKey) {
    if (this.state !== state) this.setState(state, animKey || state);
  }

  endAction(inp) {
    this.moveName = null; this.specIdx = -1; this.specData = null;
    if (this.y > 0) { this.setState('jump', 'saltar', 50); this.airAttackUsed = true; return; }
    if (inp.held.down) this.setState('crouch', 'agacharse'); else this.setState('idle');
  }

  onLand() {
    const g = this.game;
    switch (this.state) {
      case 'jump': case 'airAttack':
        this.vx = 0; this.flip = false; this.setState('idle'); sfx.land(); break;
      case 'airHit':
        this.vx *= 0.3;
        this.state = this.dead ? 'dead' : 'knockdown'; this.t = 0;   // la animación de caída sigue
        g.effects.dust(new THREE.Vector3(this.x, 0.1, 0), 22); g.effects.addShake(0.15); sfx.fall();
        break;
      case 'special': {
        const S = SPECIALS[this.spec.tipo];
        S.onLand?.(this, this.game.other(this), this.spec, g);
        break;
      }
      case 'frozen': case 'dizzy': case 'scripted': break;
      default: if (this.state !== 'dead') this.setState('idle');
    }
  }

  // ¿El golpe alcanza al rival? (un gigante llega más lejos)
  reaches(opp, range, hy) {
    const k = this.sizeScale;
    const dx = (opp.x - this.x) * this.facing;
    if (dx < -0.25 || dx > range * k + 0.35) return false;
    const top = opp.y + opp.height, hitY = this.y + hy * Math.min(k, 1.15);
    return hitY >= opp.y - 0.2 && hitY <= top + 0.15;
  }

  checkHit(opp, m) {
    if (!this.reaches(opp, m.range, m.hy)) return;
    this.hasHit = true;
    opp.receive(m, this, new THREE.Vector3((this.x + opp.x) / 2 + this.facing * 0.2, this.y + m.hy, 0.3));
  }

  isBlocking(height) {
    if (this.state === 'block' || (this.state === 'blockstun' && !this.wasCrouchBlock)) return height !== 'low';
    if (this.state === 'crouchBlock' || (this.state === 'blockstun' && this.wasCrouchBlock)) return height !== 'overhead';
    return false;
  }

  // hit: { dmg, height, hitstun, push, launch, knockdown, unblockable, color, freeze, pull }
  receive(hit, attacker, pos) {
    const g = this.game;
    if (this.invulnerable() || (this.health <= 0 && !['airHit', 'dizzy'].includes(this.state))) return 'miss';
    pos = pos || this.chest;
    const dir = attacker.x < this.x ? 1 : -1;
    const armored = this.buffKind === 'armor' && this.buffTimer > 0;
    const giant = this.giant, robot = this.titan;   // el traje de robot aguanta casi como la armadura
    // guardia de contragolpe (Gera)
    if (this.state === 'special' && !hit.isCounter && SPECIALS[this.spec?.tipo]?.counter) {
      const r = SPECIALS[this.spec.tipo].counter(this, attacker, hit, g);
      if (r) return r;
    }

    if (!hit.unblockable && this.isBlocking(hit.height) && this.grounded) {
      if (!armored && !giant && !robot) this.health = Math.max(1, this.health - hit.dmg * 0.12 * attacker.power);
      this.wasCrouchBlock = this.state === 'crouchBlock' || (this.state === 'blockstun' && this.wasCrouchBlock);
      this.setState('blockstun', this.wasCrouchBlock ? 'bloqueo_bajo' : 'bloqueo');
      this.stunDur = 10;
      this.vx = dir * (hit.push ?? 3) * 0.9;
      g.effects.blockSpark(pos); sfx.block();
      g.hitstop = 2;
      return 'blocked';
    }

    const scale = Math.max(0.35, 1 - this.comboTaken * 0.09);
    const buff = attacker.buffTimer > 0 ? (attacker.buffKind === 'dmg' ? 1.5 : attacker.buffKind === 'giant' ? 1.6 : 1) : 1;
    const dmg = hit.dmg * attacker.power * buff * scale * (armored ? 0.5 : giant ? 0.6 : robot ? 0.65 : 1);
    this.health = Math.max(0, this.health - dmg);
    this.comboTaken++;
    attacker.combo++;
    g.event('hit', { side: this.side, attacker: attacker.side, combo: attacker.combo });

    const strong = dmg >= 9 || hit.launch || hit.knockdown;
    if (armored || robot) { g.effects.metalSpark(pos, this.buffColor || '#9fe8ff'); sfx.clank(); }
    else {
      g.effects.hitSpark(pos, hit.color || '#ffd27a', strong);
      g.effects.bloodSplash(pos, dir, strong ? 1.3 : 0.7);
    }
    g.effects.addShake(strong ? 0.22 : 0.09);
    g.hitstop = strong ? 6 : 3;
    sfx.hit(strong);
    if (hit.name) { if (hit.name.startsWith('patada') || hit.name === 'barrida') sfx.thud(); else sfx.smack(); }   // puño o patada
    if (attacker.combo >= 3) sfx.combo(attacker.combo);                                                            // el combo sube de tono

    if (this.state === 'frozen') this.unfreeze();
    if (this.state === 'special') this.spec && SPECIALS[this.spec.tipo]?.interrupt?.(this, g);

    // gigante: nada lo tumba, lo congela ni lo jala; apenas se tambalea
    if (giant && this.health > 0) {
      this.setState('hitstun', 'golpeado');
      this.stunDur = Math.round((hit.hitstun ?? 16) * 0.4);
      this.vx = dir * (hit.push ?? 3) * 0.3;
      return 'hit';
    }
    if (this.health > 0 && hit.freeze) { this.freeze(hit.freeze); return 'hit'; }
    if (this.health > 0 && hit.pull) { this.setState('pulled', 'golpeado'); return 'hit'; }

    const air = this.y > 0.05;
    if (this.health <= 0) {
      this.setState('airHit', 'caer');
      this.vy = Math.max(hit.launch || 0, 8); this.vx = dir * Math.max(hit.push ?? 3, 4);
      g.onKO(attacker, this);
    } else if (hit.launch || air) {
      this.setState('airHit', 'caer');
      this.vy = hit.launch || Math.max(6, this.vy + 3); this.vx = dir * (hit.push ?? 2) * 0.6;
    } else if (hit.knockdown) {
      this.setState('airHit', 'caer');
      this.vy = 5; this.vx = dir * (hit.push ?? 4);
    } else {
      this.setState('hitstun', 'golpeado');
      const tough = armored ? 0.5 : robot ? 0.6 : 1;
      this.stunDur = Math.round((hit.hitstun ?? 16) * tough);
      this.vx = dir * (hit.push ?? 3) * tough;
    }
    return 'hit';
  }

  freeze(frames) {
    this.setState('frozen', 'congelado');
    this.iced = true;
    this.stunDur = frames;
    this.vx = 0;
    sfx.ice();
  }

  unfreeze() {
    if (this.iced) this.game.effects.shards(new THREE.Vector3(this.x, this.y + 1, 0), '#bfefff', 10);
    this.iced = false;
    if (this.state === 'frozen') this.setState('idle');
  }

  // Lo que se le pasa al modelo para animar
  animState() {
    // el robot camina más rápido: sus pasos también
    const rate = this.titan && this.state === 'walk' ? this.titanSpeed : 1;
    return {
      key: this.animKey, t: (this.t - this.animStart) * rate, total: this.animTotal, s: this.animS, a: this.animA,
      id: this.animId, flip: this.flip, rate,
    };
  }
}
