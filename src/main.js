import * as THREE from 'three';
import { JUEGO, PELEADORES } from './roster.js';
import { FighterModel, loadAsset } from './model.js';
import { styleOf } from './anim.js';
import { Fighter, ARENA_HALF } from './fighter.js';
import { PlayerInput, consumeKey, clearKeyEdges, decodeMask } from './input.js';
import { Effects } from './effects.js';
import { createStage, STAGES, camaro as buildCamaro } from './stages.js';
import { CPU, DIFICULTADES, NIVELES } from './ai.js';
import { FATALITIES, impactProjectile, SOLID_PROJECTILES } from './specials.js';
import { updateProjectileExtra as updateProjectile, BUTT_SPECIALS } from './specials-amigos.js';
import { sfx, announce, unlockAudio, setVoice, setVolumes, audioState, setAmbience } from './audio.js';
import { music } from './music.js';
import { Post } from './post.js';
import { Hud, cssUrl } from './hud.js';
import { ajustes, guardarAjustes, OPCIONES } from './ajustes.js';
import { loadNetConfig, createBackend, Link, RollbackSession, fnv } from './net.js';
import { makeFish, makeKawama, makeScissors, makeBarberChair, makeCape } from './props.js';
import { initTouch, isTouch, registerServiceWorker } from './touch.js';
import { Salas } from './salas.js';

const $ = (id) => document.getElementById(id);
const STEP = 1 / 60;
const MAX_GAP = 9.5;               // distancia máxima entre peleadores (cámara)
const ORDINAL = ['UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO'];
const PERFECT = '¡VICTORIA PERFECTA!';
const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const smooth = (x) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
// La música de cada escenario (music.js)
const STAGE_MUSIC = { six: 'six', cabana: 'cabana', casachuy: 'casachuy', templo: 'templo' };
// Pose de presentación en la ronda 1 (solo se ve: la pelea no cambia). Con `intro` en roster.js cada quien
// tiene la suya; si la pose usa una herramienta, la saca.
const INTRO_PROP = { chela: 'caguama', afilar: 'navaja', rapar: 'maquina' };
// Golpes fuertes que dejan estela: hueso del brazo o de la pierna que pega (N = mano/pierna de atrás, F = la de adelante)
const TRAILS = { puno_fuerte: 'elN', gancho_arriba: 'elN', patada: 'knN', patada_giratoria: 'knN', patada_aerea: 'knN', barrida: 'knN' };
// Firma aproximada de un efecto (tipo + posición redondeada) para no repetirlo en el rollback
const r4 = (v) => Math.round(v * 4);
const fxSig = (args) => args.slice(0, 2).map((a) => {
  if (a == null) return '';
  if (typeof a === 'number') return r4(a);
  if (typeof a === 'string') return a;
  if (a.isVector3) return `${r4(a.x)},${r4(a.y)}`;
  if (a.pos) return `p${r4(a.pos.x)},${r4(a.pos.y)}`;
  return typeof a === 'boolean' ? String(a) : '';
}).join('|');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

class Game {
  constructor() {
    const canvas = $('game');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    this.camera.position.set(0, 2, 9);
    this.camLook = new THREE.Vector3(0, 1.2, 0);
    this.baseFov = 40; this.fovKick = 0;
    // brillo, color de cine y calidad (en celular, menos píxeles: se ve casi igual y va más fluido)
    this.post = new Post(this.renderer, this.scene, this.camera);
    this.effects = new Effects(this.scene, this.camera);
    this.stage = createStage('six', this.scene, this.effects);
    this.stageId = 'six';
    this.hud = new Hud();
    this.applySettings();
    document.title = JUEGO.titulo;

    // estado de la simulación
    this.frame = 0; this.phase = 'none'; this.phaseT = 0; this.round = 0;
    this.timer = JUEGO.tiempoRonda; this.timerFrames = 0; this.hitstop = 0;
    this.winnerSide = -1; this.loserSide = -1; this.koKind = 'ko'; this.fatal = null;
    this.projectiles = []; this.projSeq = 0;
    this.fighters = []; this.inputs = [new PlayerInput(0), new PlayerInput(1)];
    // vista
    this.models = []; this.projViews = new Map(); this.events = [];
    this.animFrames = 0; this.viewAnimFrames = 0; this.viewRound = -1; this.slowmo = 0; this.resim = false;
    this.cpu = null; this.session = null; this.online = null; this.net = null; this.salas = null;
    this.props = new Map();   // modelos que usan los especiales (el Camaro de Alan), ya cargados
    this.screen = 'menu'; this.menuIdx = 0; this.mode = 'cpu';
    this.fxSeen = new Map(); this.fxCount = new Map();
    this.effects.gate = (name, args) => this.fxAllow(name, args);
    audioState.gate = (name, args) => this.fxAllow(name, args);

    this.post.setStage(this.stageId);
    this.stats = { hits: [0, 0], combo: [0, 0], specials: [0, 0] };

    this.buildMenu();
    this.buildSelect();
    this.buildLobby();
    this.buildViews();
    addEventListener('resize', () => this.resize()); this.resize();
    // pantalla de título: con la primera tecla o toque ya se puede sonar (los navegadores lo exigen)
    this.splash = true;
    const unlock = () => { unlockAudio(); if (this.splash && this.screen === 'menu') this.leaveSplash(); };
    addEventListener('keydown', unlock); addEventListener('pointerdown', unlock);

    this.last = performance.now(); this.acc = 0;
    const frame = (t) => { this.loop(t); requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
    // En línea el juego no puede pararse si la pestaña queda en segundo plano
    setInterval(() => { if (document.hidden && this.session) this.loop(performance.now()); }, 100);
    // liga de una sala (?sala=...): directo al modo en línea y a esa sala
    const sala = new URLSearchParams(location.search).get('sala');
    if (sala) { this.pendingSala = sala; setTimeout(() => this.openLobby(), 0); }
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h);
    this.camera.aspect = w / h;
    this.baseFov = w / h < 1 ? 60 : 40;
    this.camera.fov = this.baseFov - this.fovKick;
    this.camera.updateProjectionMatrix();
  }

  // Opciones guardadas → audio, narrador, sangre y calidad de imagen
  applySettings() {
    setVolumes(ajustes.musica, ajustes.efectos);
    setVoice(ajustes.narrador);
    this.effects.blood = ajustes.sangre;
    this.post.setQuality(ajustes.calidad);
  }

  leaveSplash(silent = false) {
    if (!this.splash) return;
    this.splash = false;
    $('menu').classList.remove('splash');
    clearKeyEdges();   // la tecla que quitó el título no cuenta como "aceptar"
    if (!silent) { sfx.impact(); sfx.confirm(); }
  }

  vibrate(pattern) { if (ajustes.vibracion && isTouch()) navigator.vibrate?.(pattern); }

  get winner() { return this.fighters[this.winnerSide] || null; }
  get loser() { return this.fighters[this.loserSide] || null; }
  other(f) { return this.fighters[1 - f.side]; }
  hasProjectile(f) { return this.projectiles.some((p) => p.alive && p.owner === f.side && SOLID_PROJECTILES.has(p.kind)); }

  // ================================================================== SIMULACIÓN
  saveState() {
    return {
      frame: this.frame, phase: this.phase, phaseT: this.phaseT, round: this.round, timer: this.timer, timerFrames: this.timerFrames,
      hitstop: this.hitstop, winnerSide: this.winnerSide, loserSide: this.loserSide, koKind: this.koKind,
      fatal: this.fatal ? structuredClone(this.fatal) : null, projSeq: this.projSeq,
      projectiles: this.projectiles.map((p) => ({ ...p })),
      fighters: this.fighters.map((f) => f.serialize()),
      inputs: this.inputs.map((i) => i.serialize()),
    };
  }
  loadState(s) {
    Object.assign(this, {
      frame: s.frame, phase: s.phase, phaseT: s.phaseT, round: s.round, timer: s.timer, timerFrames: s.timerFrames,
      hitstop: s.hitstop, winnerSide: s.winnerSide, loserSide: s.loserSide, koKind: s.koKind,
      fatal: s.fatal ? structuredClone(s.fatal) : null, projSeq: s.projSeq,
      projectiles: s.projectiles.map((p) => ({ ...p })),
    });
    this.fighters.forEach((f, i) => f.deserialize(s.fighters[i]));
    this.inputs.forEach((inp, i) => inp.deserialize(s.inputs[i]));
  }
  hashState() { return fnv(JSON.stringify(this.saveState())); }
  setInputMasks(m0, m1) {
    this.inputs[0].virtual = decodeMask(m0, {});
    this.inputs[1].virtual = decodeMask(m1, {});
  }
  setResim(on) { this.resim = on; }

  // En línea, el rollback repite frames ya simulados. Cada efecto/sonido/evento se registra
  // por frame: si ya salió en ese frame no se repite; si es nuevo (p. ej. el rival hizo algo
  // que no habíamos predicho) sale aunque llegue unos frames tarde.
  fxAllow(name, args) {
    if (this.ffwd) return false;   // espectador adelantando la pelea: sin efectos ni sonidos
    if (!this.session) return true;
    const key = name + ':' + fxSig(args);
    const n = (this.fxCount.get(key) || 0) + 1;
    this.fxCount.set(key, n);
    let seen = this.fxSeen.get(this.frame);
    if (!seen) { seen = new Set(); this.fxSeen.set(this.frame, seen); }
    const full = key + '#' + n;
    if (seen.has(full)) return false;
    seen.add(full);
    return true;
  }
  event(type, data) { if (this.fxAllow('ev.' + type, [data.side, data.nombre ?? data.combo])) this.events.push({ type, ...data }); }

  startRound() {
    this.round++;
    this.projectiles = [];
    this.fighters[0].reset(-2.6); this.fighters[1].reset(2.6);
    for (const f of this.fighters) f.setState('intro', 'idle');
    this.timer = JUEGO.tiempoRonda; this.timerFrames = 0;
    this.phase = 'intro'; this.phaseT = 0; this.hitstop = 0;
    this.winnerSide = -1; this.loserSide = -1; this.koKind = 'ko'; this.fatal = null;
  }

  simStep() {
    // dónde estaba todo antes de este paso: la vista interpola entre los dos (movimiento fluido)
    for (const f of this.fighters) { f.px = f.x; f.py = f.y; }
    this.projPrev = new Map(this.projectiles.map((p) => [p.id, [p.x, p.y]]));
    this.frame++;
    this.phaseT++;
    this.fxCount.clear();
    if (this.session && this.frame % 60 === 0) for (const k of this.fxSeen.keys()) if (k < this.frame - 180) this.fxSeen.delete(k);
    if (this.hitstop > 0) { this.hitstop--; return; }
    this.animFrames++;
    const [a, b] = this.fighters;

    if (this.phase === 'fatality') {
      for (const f of this.fighters) f.t++;
      const w = this.winner, l = this.loser;
      if (FATALITIES[this.fatal.tipo](this.phaseT, w, l, w.fatality, this, this.fatal.data)) { this.phase = 'postFatality'; this.phaseT = 0; }
      return;
    }

    if (this.cpu) this.cpu.update(a);
    this.inputs[0].update(this.frame, a.facing);
    this.inputs[1].update(this.frame, b.facing);
    const mid = (a.x + b.x) / 2;
    a.update(this.inputs[0], b);
    b.update(this.inputs[1], a);
    this.separate(a, b, mid);

    for (const p of this.projectiles) if (p.alive) updateProjectile(p, this);
    const solid = this.projectiles.filter((p) => p.alive && SOLID_PROJECTILES.has(p.kind));
    for (const p of solid) for (const q of solid) {
      if (p.owner < q.owner && p.alive && q.alive && Math.abs(p.x - q.x) < 0.5 && Math.abs(p.y - q.y) < 0.6) {
        impactProjectile(p, this); impactProjectile(q, this); sfx.boom();
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.alive);
    this.phases(a, b);
  }

  separate(a, b, mid) {
    const dx = b.x - a.x;
    if (Math.abs(a.y - b.y) < 1.3 && Math.abs(dx) < 0.7 && !a.hidden && !b.hidden && a.state !== 'scripted' && b.state !== 'scripted') {
      const push = (0.7 - Math.abs(dx)) / 2 * (dx >= 0 ? 1 : -1) || 0.35;
      a.x -= push; b.x += push;
      for (const f of [a, b]) if (Math.abs(f.x) > ARENA_HALF) { const o = Math.sign(f.x) * (Math.abs(f.x) - ARENA_HALF); f.x -= o; this.other(f).x -= o; }
    }
    for (const f of [a, b]) f.x = Math.max(mid - MAX_GAP / 2, Math.min(mid + MAX_GAP / 2, f.x));
  }

  onKO(attacker, victim) {
    if (this.phase === 'fight') {
      this.phase = 'ko'; this.phaseT = 0; this.koKind = 'ko';
      this.winnerSide = attacker.side; this.loserSide = victim.side;
      if (!this.session) this.slowmo = 36;
      sfx.ko(); sfx.crowd();
    } else if (this.phase === 'finish') {
      this.phase = 'finishBlow'; this.phaseT = 0;
      if (!this.session) this.slowmo = 30;
    }
  }

  tryFatality(f, inp) {
    const fat = f.fatality;
    if (!fat || !fat.parsed) return false;
    const p = fat.parsed;
    const trigger = p.btn ? inp.pressed[p.btn] : inp.newDir;
    if (!trigger || !inp.matchMotion(p.seq, this.frame, 34)) return false;
    if (Math.abs(f.x - this.loser.x) > 4.5) return false;
    this.phase = 'fatality'; this.phaseT = 0;
    this.fatal = { tipo: FATALITIES[fat.tipo] ? fat.tipo : 'explosion', data: {} };
    f.faceOpponent(this.loser);
    f.state = 'scripted'; this.loser.state = 'scripted';
    this.event('special', { side: f.side, nombre: fat.nombre, color: fat.color });
    sfx.drum();
    return true;
  }

  phases(a, b) {
    const need = JUEGO.rondasParaGanar;
    switch (this.phase) {
      case 'intro':
        if (this.phaseT === 90) {
          for (const f of this.fighters) f.setState('idle');
          sfx.roundBell();
          this.phase = 'fight'; this.phaseT = 0;
        }
        break;
      case 'fight':
        if (++this.timerFrames >= 60) {
          this.timerFrames = 0; this.timer--;
          if (this.timer > 0 && this.timer <= 10) sfx.tick();   // ya se acaba el tiempo
          if (this.timer <= 0) {
            this.timer = 0;
            if (a.health === b.health) { this.phase = 'roundOver'; this.phaseT = 0; this.winnerSide = -1; }
            else {
              this.winnerSide = a.health > b.health ? 0 : 1; this.loserSide = 1 - this.winnerSide;
              this.phase = 'ko'; this.phaseT = 0; this.koKind = 'time';
              this.loser.health = 0; this.loser.setState('airHit', 'caer'); this.loser.vy = 4;
            }
          }
        }
        break;
      case 'ko':
        if (this.phaseT > 70 && ['dead', 'knockdown'].includes(this.loser.state)) {
          this.winner.wins++;
          if (this.winner.wins >= need) {
            this.loser.setState('dizzy', 'mareado');
            this.loser.health = 0;
            this.winner.setState('idle');
            this.inputs[this.winner.side].clearBuffer();
            this.phase = 'finish'; this.phaseT = 0;
          } else {
            this.winner.setState('victory', 'victoria');
            this.phase = 'roundOver'; this.phaseT = 0;
          }
        }
        break;
      case 'roundOver':
        if (this.phaseT > 120) this.startRound();
        break;
      case 'finish':
        if (this.phaseT > 60 * 6) { this.loser.setState('airHit', 'caer'); this.loser.vy = 3; this.phase = 'finishBlow'; this.phaseT = 0; }
        break;
      case 'finishBlow':
        if (this.phaseT > 70) this.endMatch();
        break;
      case 'postFatality':
        if (this.phaseT === 140) this.endMatch();
        break;
    }
  }

  endMatch() {
    this.phase = 'matchEnd'; this.phaseT = 0;
    this.winner.setState('victory', 'victoria');
    sfx.cheer();   // la fanfarria la toca la música (music.js)
  }

  // ================================================================== PANTALLAS
  show(screen) {
    this.screen = screen;
    for (const id of ['menu', 'select', 'controls', 'lobby', 'stages', 'arena', 'options']) $(id).classList.toggle('hidden', id !== screen);
    $('hud').classList.toggle('hidden', screen !== 'fight');
    if (screen !== 'menu') this.leaveSplash(true);   // la liga de una sala se salta el título
    clearKeyEdges();
  }

  toast(text, ms = 3000) {
    const t = $('toast');
    t.textContent = text; t.classList.add('show');
    clearTimeout(this.toastT); this.toastT = setTimeout(() => t.classList.remove('show'), ms);
  }

  buildMenu() {
    this.menuButtons = [...document.querySelectorAll('#menu .menu-options button')];
    this.menuButtons.forEach((b, i) => {
      b.addEventListener('mouseenter', () => { if (this.menuIdx !== i) { this.setMenuIdx(i); sfx.select(); } });
      b.addEventListener('click', () => this.menuAccept(i));
    });
    $('controls-opts').addEventListener('click', () => this.openOptions());
  }
  setMenuIdx(i) {
    this.menuIdx = (i + this.menuButtons.length) % this.menuButtons.length;
    this.menuButtons.forEach((b, k) => b.classList.toggle('sel', k === this.menuIdx));
  }
  menuAccept(i) {
    unlockAudio(); sfx.confirm();
    const mode = this.menuButtons[i].dataset.mode;
    if (mode === 'controls') { this.showControls(false); return; }
    if (mode === 'options') { this.openOptions(); return; }
    if (mode === 'online') { this.openLobby(); return; }
    this.mode = mode;
    this.openSelect();
  }

  // ------------------------------------------------------------------ opciones
  openOptions() {
    // desde la pausa se regresa a la pausa (la pelea sigue detrás, congelada)
    this.optReturn = this.screen === 'controls' && this.paused ? 'pause' : 'menu';
    const box = $('opts');
    box.innerHTML = '';
    this.optRows = OPCIONES.filter((o) => !o.soloCelular || isTouch()).map((o, i) => {
      const row = document.createElement('div');
      row.className = 'opt';
      row.innerHTML = `<span class="olabel">${o.nombre}</span><div class="oval"><button class="oarrow" data-d="-1" aria-label="menos">◀</button><span class="oview"></span><button class="oarrow" data-d="1" aria-label="más">▶</button></div>`;
      row.addEventListener('mouseenter', () => { if (this.optIdx !== i) { this.optIdx = i; this.renderOptions(); } });
      row.addEventListener('click', (e) => { this.optIdx = i; this.changeOption(+(e.target.closest('.oarrow')?.dataset.d || 1)); });
      box.appendChild(row);
      return { o, row };
    });
    this.optIdx = 0;
    this.show('options');
    if (this.optReturn === 'pause') $('hud').classList.remove('hidden');
    this.renderOptions();
  }

  renderOptions() {
    this.optRows.forEach(({ o, row }, i) => {
      row.classList.toggle('sel', i === this.optIdx);
      const v = ajustes[o.id];
      row.querySelector('.oview').innerHTML = o.tipo === 'vol'
        ? `<span class="obar">${Array.from({ length: 10 }, (_, k) => `<i class="${k < Math.round(v * 10) ? 'on' : ''}"></i>`).join('')}</span>`
        : `<b class="otext">${o.tipo === 'si' ? (v ? 'SÍ' : 'NO') : esc(o.etiquetas?.[v] ?? String(v).toUpperCase())}</b>`;
    });
  }

  changeOption(d) {
    const { o } = this.optRows[this.optIdx];
    if (o.tipo === 'vol') ajustes[o.id] = Math.round(Math.min(1, Math.max(0, ajustes[o.id] + d * 0.1)) * 10) / 10;
    else if (o.tipo === 'si') ajustes[o.id] = !ajustes[o.id];
    else { const L = o.valores, k = L.indexOf(ajustes[o.id]); ajustes[o.id] = L[(k + d + L.length) % L.length]; }
    guardarAjustes();
    this.applySettings();
    this.renderOptions();
    // que se oiga/sienta el cambio
    if (o.id === 'efectos') sfx.hit(false); else sfx.select();
    if (o.id === 'narrador' && ajustes.narrador) announce('Narrador');
    if (o.id === 'vibracion') this.vibrate(80);
  }

  closeOptions() {
    sfx.back();
    if (this.optReturn === 'pause') this.showControls(true); else this.show('menu');
  }

  showControls(pause) {
    $('controls-title').textContent = pause ? 'PAUSA' : 'CONTROLES';
    $('controls-hint').textContent = pause ? 'ESC para continuar · O opciones · Q para salir al menú' : 'ESC para volver';
    $('controls').classList.toggle('paused', !!pause);
    $('controls-opts').classList.toggle('hidden', !pause);
    const list = $('movelist');
    list.innerHTML = '';
    if (pause) for (const f of this.fighters) {
      const div = document.createElement('div');
      const row = (s) => `<tr><td>${esc(s.nombre)}</td><td>${esc(s.input)}</td></tr>`;
      div.innerHTML = `<h3>${esc(f.def.nombre)}</h3><table>${f.normalSpecials.map(row).join('')}${f.fatality ? `<tr><td>☠ ${esc(f.fatality.nombre)}</td><td>${esc(f.fatality.input)}</td></tr>` : ''}`
        + (f.titanSpecials.length ? `<tr><td colspan="2" class="sub">CON EL TRAJE DE ROBOT</td></tr>${f.titanSpecials.map(row).join('')}` : '') + '</table>';
      list.appendChild(div);
    }
    if (this.screen !== 'options') this.prevScreen = this.screen;
    this.show('controls');
    if (pause) $('hud').classList.remove('hidden');
  }

  // ------------------------------------------------------------------ selección
  buildSelect() {
    const grid = $('grid');
    grid.innerHTML = '';
    this.cards = PELEADORES.map((def, i) => {
      const c = document.createElement('div');
      c.className = 'card';
      c.style.background = `linear-gradient(160deg, ${def.color}, #111 85%)`;
      const initials = def.nombre.split(/\s+/).map((w) => w[0]).join('').slice(0, 2);
      c.innerHTML = `${def.retrato ? `<img class="portrait-img" src="${esc(def.retrato)}" alt="">` : `<div class="portrait">${esc(initials)}</div>`}<div class="label">${esc(def.nombre)}</div>`;
      c.addEventListener('click', () => this.clickCard(i));
      c.addEventListener('mouseenter', () => {
        const p = this.localSelectSide();
        if (!this.sel.locked[p]) { this.sel.cur[p] = i; this.selectMoved(p); }
        else if (this.mode === 'vs' && !this.sel.locked[1]) { this.sel.cur[1] = i; this.renderSelect(); }
      });
      grid.appendChild(c);
      return c;
    });
    for (const b of $('diff').querySelectorAll('.darrow')) b.addEventListener('click', () => this.changeDiff(+b.dataset.d));
  }

  // Dificultad de la CPU (en el panel de la CPU; también en OPCIONES)
  get cpuLevel() { return DIFICULTADES[ajustes.dificultad] || DIFICULTADES.normal; }
  renderDiff(pop = true) {
    const D = this.cpuLevel, el = $('diff-val');
    el.textContent = D.nombre;
    $('diff').style.setProperty('--dc', D.color);
    if (pop) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  }
  changeDiff(d) {
    const k = Math.max(0, NIVELES.indexOf(ajustes.dificultad));
    ajustes.dificultad = NIVELES[(k + d + NIVELES.length) % NIVELES.length];
    guardarAjustes();
    sfx.select();
    this.renderDiff();
  }

  localSelectSide() { return this.mode === 'online' ? this.online.side : 0; }

  openSelect() {
    const n = PELEADORES.length;
    this.sel = { cur: [0, Math.min(1, n - 1)], locked: [false, false] };
    if (this.mode === 'online') {
      $('ptag1').textContent = this.online.side === 0 ? 'TÚ' : esc(this.online.peerName);
      $('ptag2').textContent = this.online.side === 1 ? 'TÚ' : esc(this.online.peerName);
    } else {
      $('ptag1').textContent = 'P1';
      $('ptag2').textContent = this.mode === 'cpu' ? 'CPU' : 'P2';
    }
    $('diff').classList.toggle('hidden', this.mode !== 'cpu');
    this.renderDiff(false);
    this.show('select');
    this.renderSelect();
  }

  clickCard(i) {
    // en el celular no hay "pasar el mouse": el primer toque muestra al peleador y sus especiales,
    // el segundo toque en el mismo lo elige
    const pick = (p) => {
      if (isTouch() && this.sel.tapped?.[p] !== i) { (this.sel.tapped ||= [])[p] = i; this.sel.cur[p] = i; this.selectMoved(p); return; }
      this.sel.cur[p] = i; this.lock(p);
    };
    if (this.mode === 'online') { const p = this.online.side; if (!this.sel.locked[p]) pick(p); return; }
    if (!this.sel.locked[0]) pick(0);
    else if (this.mode === 'vs' && !this.sel.locked[1]) pick(1);
  }

  selectMoved(p) {
    sfx.select(); this.renderSelect();
    if (this.mode === 'online') this.online.link.sendCtrl({ t: 'cursor', id: PELEADORES[this.sel.cur[p]].id });
  }

  lock(p) {
    this.sel.locked[p] = true; sfx.lockIn();
    announce(PELEADORES[this.sel.cur[p]].nombre);
    if (this.mode === 'online') {
      this.online.link.sendCtrl({ t: 'pick', id: PELEADORES[this.sel.cur[p]].id });
      this.renderSelect();
      this.checkOnlinePicks();
      return;
    }
    if (this.mode === 'cpu' && p === 0) {
      const others = PELEADORES.map((_, i) => i).filter((i) => i !== this.sel.cur[0]);
      this.sel.cur[1] = others.length ? others[Math.random() * others.length | 0] : 0;
      this.sel.locked[1] = true;
    }
    this.renderSelect();
    if (this.sel.locked[0] && this.sel.locked[1]) {
      const d1 = PELEADORES[this.sel.cur[0]], d2 = PELEADORES[this.sel.cur[1]];
      setTimeout(() => this.openStageSelect(true, (id) => this.versusThenFight(d1, d2, id)), 600);
    }
  }

  // Presentación (VS) mientras cargan los modelos; la pelea empieza cuando ya se vio completa
  async versusThenFight(d1, d2, stageId) {
    const shown = this.versus(d1, d2, stageId, ['JUGADOR 1', this.mode === 'cpu' ? `CPU · ${this.cpuLevel.nombre}` : 'JUGADOR 2']);
    const models = this.loadModels(d1, d2, true);
    await shown;
    $('vs-status').textContent = 'Cargando peleadores…';   // solo se ve si todavía no terminan
    this.startMatch(d1, d2, await models, stageId);
  }

  versus(def1, def2, stageId, names = [], minMs = 2700) {
    const st = STAGES.find((s) => s.id === stageId);
    [def1, def2].forEach((d, i) => {
      const n = i + 1, img = $(`vs-img${n}`);
      img.parentElement.style.setProperty('--c', d.color || '#444');
      img.style.setProperty('--img', d.retrato ? cssUrl(d.retrato) : 'none');
      img.classList.toggle('none', !d.retrato);
      img.textContent = d.retrato ? '' : d.nombre.split(/\s+/).map((w) => w[0]).join('').slice(0, 2);
      $(`vs-n${n}`).textContent = d.nombre;
      $(`vs-p${n}`).textContent = names[i] || '';
    });
    $('vs-stage').textContent = st ? `${st.nombre} · ${st.lugar}` : '';
    $('vs-status').textContent = '';
    $('loading').classList.add('hidden');
    $('versus').classList.remove('hidden', 'out');
    this.versusOn = true;
    sfx.swoosh();
    setTimeout(() => { if (this.versusOn) { sfx.impact(); this.vibrate(70); } }, 470);
    announce(`${def1.nombre} contra ${def2.nombre}`);
    return new Promise((res) => setTimeout(res, minMs));
  }

  hideVersus() {
    if (!this.versusOn) return;
    this.versusOn = false;
    $('versus').classList.add('out');
    setTimeout(() => { if (!this.versusOn) $('versus').classList.add('hidden'); }, 400);
  }

  renderSelect() {
    const s = this.sel;
    const showP2 = this.mode !== 'cpu' || s.locked[1];
    this.cards.forEach((c, i) => {
      c.classList.toggle('c1', s.cur[0] === i);
      c.classList.toggle('c2', s.cur[1] === i && showP2);
      c.classList.toggle('locked1', s.locked[0] && s.cur[0] === i);
      c.classList.toggle('locked2', s.locked[1] && s.cur[1] === i);
      c.querySelectorAll('.badge').forEach((b) => b.remove());
      if (s.cur[0] === i) c.insertAdjacentHTML('beforeend', '<div class="badge b1">P1</div>');
      if (s.cur[1] === i && showP2) c.insertAdjacentHTML('beforeend', `<div class="badge b2">${this.mode === 'cpu' ? 'CPU' : 'P2'}</div>`);
    });
    for (const p of [0, 1]) {
      const show = p === 0 || showP2;
      const def = PELEADORES[s.cur[p]];
      // retrato grande: se cambia (con un destello) solo cuando cambia el peleador señalado
      const face = $(`pface${p + 1}`), fid = show ? def.id : '';
      if (face.dataset.id !== fid) {
        face.dataset.id = fid;
        face.style.setProperty('--img', show && def.retrato ? cssUrl(def.retrato) : 'none');
        face.style.setProperty('--fc', show ? def.color : '#222');
        face.classList.remove('swap'); void face.offsetWidth; face.classList.add('swap');
      }
      $(`pick${p + 1}`).textContent = show ? def.nombre : '?';
      const list = (l) => l.map((e) => `<b>${esc(e.nombre)}</b><br><span class="inp">${esc(e.input)}</span>`).join('<br>');
      $(`pspec${p + 1}`).innerHTML = show ? list(def.especiales) + (def.especialesTitan ? `<p class="suit">Con el traje de robot:</p>${list(def.especialesTitan)}` : '')
        + (s.locked[p] ? '<p class="ready">¡LISTO!</p>' : '') : '';
    }
  }

  selectInput() {
    const s = this.sel;
    const n = PELEADORES.length;
    const cols = Math.max(1, Math.round($('grid').clientWidth / 130));
    const nav = (p, l, r, u, d, ok) => {
      if (s.locked[p]) return;
      const before = s.cur[p];
      if (consumeKey(...l)) s.cur[p] = (s.cur[p] - 1 + n) % n;
      if (consumeKey(...r)) s.cur[p] = (s.cur[p] + 1) % n;
      if (consumeKey(...u)) s.cur[p] = (s.cur[p] - cols + n) % n;
      if (consumeKey(...d)) s.cur[p] = (s.cur[p] + cols) % n;
      if (before !== s.cur[p]) this.selectMoved(p);
      if (consumeKey(...ok)) this.lock(p);
    };
    if (this.mode === 'online') {
      nav(this.online.side, ['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight'], ['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown'], ['KeyF', 'KeyK', 'Enter', 'Space']);
      if (consumeKey('Escape')) this.leaveRoom(true);
      return;
    }
    nav(0, ['KeyA'], ['KeyD'], ['KeyW'], ['KeyS'], ['KeyF', 'Enter', 'Space']);
    if (this.mode === 'vs') nav(1, ['ArrowLeft'], ['ArrowRight'], ['ArrowUp'], ['ArrowDown'], ['KeyK', 'Numpad1', 'NumpadEnter']);
    else if (!s.locked[0]) {
      const before = s.cur[0];
      if (consumeKey('ArrowLeft')) s.cur[0] = (s.cur[0] - 1 + n) % n;
      if (consumeKey('ArrowRight')) s.cur[0] = (s.cur[0] + 1) % n;
      if (before !== s.cur[0]) this.selectMoved(0);
    }
    if (this.mode === 'cpu') { if (consumeKey('KeyQ')) this.changeDiff(-1); if (consumeKey('KeyE')) this.changeDiff(1); }
    if (consumeKey('Escape')) { if (s.locked[0] && !(this.mode === 'cpu' && s.locked[1])) { s.locked[0] = false; this.renderSelect(); } else { sfx.back(); this.show('menu'); } }
  }

  // ------------------------------------------------------------------ partida
  // quiet: sin la pantalla de "Cargando…" (la presentación VS la tapa)
  async loadModels(def1, def2, quiet = false) {
    if (!quiet) $('loading').classList.remove('hidden');
    this.disposeModels();
    this.models = [];
    // con `traje` también se carga el robot que se pone en el MODO TITÁN (model.suit)
    const make = async (def, alt) => {
      const [m, suit] = await Promise.all([FighterModel.create(def, alt),
        def.traje ? FighterModel.create({ ...def, modelo: def.traje.modelo, escala: def.traje.escala ?? 1, accesorios: [] }, alt) : null]);
      if (suit) {
        for (const mt of suit.materials) if (mt.isMeshStandardMaterial) { mt.metalness = 0.3; mt.roughness = 0.45; }   // un poco de brillo metálico
        m.suit = suit;
      }
      return m;
    };
    // y los objetos de sus especiales (el Camaro de Alan), para que salgan sin esperar
    const urls = [def1, def2].flatMap((d) => [...(d.especiales || []), ...(d.especialesTitan || [])]).map((s) => s.modelo).filter((u) => u && !this.props.has(u));
    // fatality de Ramces: una copia del rival en la que solo se ve la cabeza (la que sale volando)
    const heads = [def1, def2].map((d, i) => ([def2, def1][i].fatality?.tipo === 'corte' ? FighterModel.create(d, i === 1 && def1 === def2) : null));
    const [models, , hds] = await Promise.all([
      Promise.all([make(def1, false), make(def2, def1 === def2)]),
      Promise.all(urls.map((u) => loadAsset(u).then((a) => this.props.set(u, a), () => {}))),
      Promise.all(heads),
    ]);
    models.forEach((m, i) => { if (hds[i]) m.head = this.prepareHead(hds[i]); });
    $('loading').classList.add('hidden');
    return models;
  }

  // Copia del modelo encogida toda menos la cabeza, centrada en la cabeza
  prepareHead(hm) {
    const P = hm.parts;
    if (!P?.hips || !P.head) return null;
    P.hips.scale.setScalar(0.001); P.head.scale.setScalar(1000);
    hm.setFacing(1);
    hm.root.updateMatrixWorld(true);
    const c = P.head.getWorldPosition(new THREE.Vector3()).add(V(0, 0.12, 0));
    const holder = new THREE.Group();
    holder.add(hm.root);
    hm.root.position.sub(c);
    holder.visible = false;
    holder.userData.model = hm;
    return holder;
  }

  disposeModels() {
    for (const m of this.models) { m.suit?.dispose(); m.head?.removeFromParent(); m.dispose(); }
  }

  setStage(id) {
    if (id === 'aleatorio') id = STAGES[Math.random() * STAGES.length | 0].id;
    if (this.stage && this.stageId === id) return;
    this.stage?.dispose();
    this.stage = createStage(id, this.scene, this.effects);
    this.stageId = id;
    this.post.setStage(id);
  }

  async startMatch(def1, def2, preloaded = null, stageId = null) {
    const models = preloaded || await this.loadModels(def1, def2);
    if (stageId) this.setStage(stageId);
    this.models = models;
    this.scene.add(models[0].root, models[1].root);
    for (const m of models) {
      m.suitOn = false;
      if (m.suit) { m.suit.root.visible = false; this.scene.add(m.suit.root); }
      if (m.head) { m.head.visible = false; this.scene.add(m.head); }
    }
    this.fighters = [new Fighter(def1, 0, this), new Fighter(def2, 1, this)];
    this.inputs = [new PlayerInput(0), new PlayerInput(1)];
    this.cpu = this.mode === 'cpu' ? new CPU(this.fighters[1], this.inputs[1], this, ajustes.dificultad) : null;
    this.frame = 0; this.round = 0; this.projSeq = 0; this.slowmo = 0;
    this.fxSeen.clear();
    this.clearViews();
    const o = this.online;
    this.hud.start([def1, def2], this.mode === 'online' && o ? (o.side === 0 ? [o.myName, o.peerName] : [o.peerName, o.myName])
      : this.mode === 'cpu' ? ['', `CPU · ${this.cpuLevel.nombre}`] : []);
    this.stats = { hits: [0, 0], combo: [0, 0], specials: [0, 0] };
    this.firstHitRound = 0; this.viewPhase = null; this.introCue = 0;
    this.hideVersus();
    this.show('fight');
    this.startRound();
    this.reported = false;
    setAmbience(this.stageId);   // pájaros, grillos, viento… según el escenario
  }

  quitMatch() {
    this.disposeModels();
    setAmbience(null);
    this.models = []; this.fighters = []; this.projectiles = [];
    this.clearViews();
    this.effects.clear();
    this.session?.dispose();
    this.session = null; this.cpu = null; this.phase = 'none';
    $('announcer').classList.remove('show');
    $('netbadge').classList.add('hidden');
    $('results').classList.add('hidden'); this.resultsOn = false;
    $('fade').style.opacity = 0;
    this.hideVersus();
    Object.assign(this.post.fx, { aberr: 0, desat: 0, danger: 0 });
    this.aberr = 0; this.fovKick = 0; this.camRoll = 0;
    this.renderer.toneMappingExposure = 1;
  }

  // ================================================================== EN LÍNEA
  buildLobby() {
    const name = $('myname');
    try { name.value = localStorage.getItem('kombate-nombre') || ''; } catch { /* sin almacenamiento */ }
    $('connectBtn').onclick = () => this.connectOnline();
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.connectOnline(); e.stopPropagation(); });
    $('lobbyBack').onclick = () => this.leaveLobby();
    $('modal-yes').onclick = () => this.modalAnswer(true);
    $('modal-no').onclick = () => this.modalAnswer(false);
  }

  async openLobby() {
    this.mode = 'online';
    this.show('lobby');
    $('lobby-main').classList.toggle('hidden', !this.net);
    $('lobby-login').classList.toggle('hidden', !!this.net);
    if (!this.net) {
      setTimeout(() => $('myname').focus(), 50);
      if (this.pendingSala && $('myname').value.trim()) this.connectOnline();
    } else this.net.setStatus('libre');
  }

  showArena() {
    this.mode = 'online';
    this.show('arena');
    this.net?.setStatus('sala', this.salas?.cur?.data?.nombre || 'una sala');
    this.salas?.renderArena();
  }

  async connectOnline() {
    const name = $('myname').value.trim().slice(0, 16);
    if (!name) { $('netstatus').textContent = 'Escribe tu nombre'; return; }
    try { localStorage.setItem('kombate-nombre', name); } catch { /* sin almacenamiento */ }
    $('connectBtn').disabled = true;
    $('netstatus').textContent = 'Conectando…';
    try {
      this.netCfg = this.netCfg || await loadNetConfig();
      const be = await createBackend(this.netCfg);
      await be.connect(name);
      this.net = be; this.myName = name;
      $('netstatus').textContent = '';
      this.salas = new Salas(this);
      this.salas.start(be);
      if (this.pendingSala) {
        this.salas.joinWhenReady(this.pendingSala);
        this.pendingSala = null;
        const u = new URL(location.href); u.searchParams.delete('sala'); history.replaceState(null, '', u);
      }
      be.onPlayers((list) => this.renderPlayers(list));
      be.onChallenge((ch) => this.incomingChallenge(ch), (ch) => this.challengeCancelled(ch));
      be.onRanking((list) => this.renderRanking(list));
      $('lobby-mode').textContent = be.kind === 'firebase'
        ? 'Conectado a Firebase en tiempo real'
        : 'Modo local: sin Firebase configurado, solo se ven otras pestañas de este navegador';
      $('lobby-login').classList.add('hidden');
      $('lobby-main').classList.remove('hidden');
    } catch (err) {
      console.error(err);
      $('netstatus').textContent = 'No se pudo conectar: ' + (err.message || err.code);
    }
    $('connectBtn').disabled = false;
  }

  leaveLobby() {
    if (this.pendingChallenge) this.cancelMyChallenge();
    this.salas?.stop(); this.salas = null;
    this.net?.disconnect();
    sfx.back();
    this.net = null;
    this.show('menu');
  }

  renderPlayers(list) {
    this.players = list;
    const me = this.net?.uid;
    $('online-count').textContent = `(${list.length})`;
    $('players').innerHTML = list.sort((a, b) => (a.uid === me ? -1 : b.uid === me ? 1 : a.nombre.localeCompare(b.nombre))).map((p) => `
      <li class="${p.uid === me ? 'me' : ''}">
        <span class="dot ${p.estado === 'jugando' || p.estado === 'sala' ? 'busy' : ''}"></span>
        <span class="pname">${esc(p.nombre)}${p.uid === me ? ' (tú)' : ''}</span>
        <span class="pstate">${p.estado === 'jugando' ? 'en pelea' : p.estado === 'sala' ? `en ${esc(p.sala || 'una sala')}` : 'libre'}</span>
        ${p.uid !== me && p.estado !== 'jugando' && p.estado !== 'sala' ? `<button data-uid="${esc(p.uid)}">RETAR</button>` : ''}
      </li>`).join('');
    $('players').querySelectorAll('button[data-uid]').forEach((b) => { b.onclick = () => this.challenge(b.dataset.uid); });
    // si mi rival se desconectó mientras peleamos o elegíamos
    if (this.online && !list.some((p) => p.uid === this.online.peerUid)) this.peerGone();
  }

  renderRanking(list) {
    $('ranking').innerHTML = list.length
      ? list.map((r) => `<li><span>${esc(r.nombre)}</span><b>${r.victorias}</b><small>V</small> <b>${r.derrotas}</b><small>D</small></li>`).join('')
      : '<li class="small">Todavía no hay peleas</li>';
  }

  async challenge(uid) {
    if (this.pendingChallenge || this.online) return;
    const peer = this.players.find((p) => p.uid === uid);
    const sala = await this.net.challenge(uid);
    this.pendingChallenge = { uid, sala, name: peer?.nombre || '?' };
    this.showModal(`Esperando a que <b>${esc(peer?.nombre)}</b> acepte…`, null, 'CANCELAR');
    const stop = this.net.watchRoomState(sala, (estado) => {
      if (!this.pendingChallenge || this.pendingChallenge.sala !== sala) return;
      if (estado === 'aceptado') { stop?.(); this.hideModal(); this.enterRoom(sala, uid, peer?.nombre || 'Rival', true); this.pendingChallenge = null; }
      if (estado === 'rechazado') { stop?.(); this.hideModal(); this.toast(`${peer?.nombre || 'El rival'} rechazó el reto`); this.net.cancelChallenge(uid, sala); this.pendingChallenge = null; }
    });
    this.pendingChallenge.stop = stop;
  }

  cancelMyChallenge() {
    const c = this.pendingChallenge;
    if (!c) return;
    c.stop?.();
    this.net.cancelChallenge(c.uid, c.sala);
    this.pendingChallenge = null;
  }

  incomingChallenge(ch) {
    if (this.online || this.incoming || this.pendingChallenge || this.salas?.cur) { this.net.respond(ch, false); return; }
    this.incoming = ch;
    sfx.confirm(); announce('¡Nuevo reto!');
    this.showModal(`<b>${esc(ch.nombre)}</b> te reta a pelear`, 'ACEPTAR', 'RECHAZAR');
  }

  challengeCancelled(ch) {
    if (this.incoming && this.incoming.from === ch.from) { this.incoming = null; this.hideModal(); this.toast('El reto fue cancelado'); }
  }

  showModal(html, yes, no) {
    $('modal-text').innerHTML = html;
    $('modal-yes').classList.toggle('hidden', !yes); if (yes) $('modal-yes').textContent = yes;
    $('modal-no').classList.toggle('hidden', !no); if (no) $('modal-no').textContent = no;
    $('modal').classList.remove('hidden');
  }
  hideModal() { $('modal').classList.add('hidden'); this.modalKind = null; }

  modalAnswer(yes) {
    if (this.modalKind === 'leave') { this.hideModal(); if (yes) this.leaveRoom(true); return; }
    if (this.incoming) {
      const ch = this.incoming; this.incoming = null;
      this.hideModal();
      this.net.respond(ch, yes);
      if (yes) this.enterRoom(ch.sala, ch.from, ch.nombre, false);
      return;
    }
    if (this.pendingChallenge) { this.hideModal(); this.cancelMyChallenge(); }
  }

  // arena: { arena, turno } cuando la pelea es un turno de una sala con espectadores (salas.js)
  enterRoom(sala, peerUid, peerName, isHost, arena = null) {
    const room = this.net.openRoom(sala, peerUid, isHost);
    const link = new Link(room, isHost, this.netCfg.iceServers);
    const o = this.online = { sala, peerUid, peerName, myName: this.myName, isHost, side: isHost ? 0 : 1, link, picks: [null, null], ready: [false, false], rematch: [false, false],
      arena: arena?.arena || null, turno: arena?.turno || null };
    this.net.setStatus('jugando');
    // solo cuentan los avisos de esta pelea (en una sala la siguiente empieza mientras la anterior se cierra)
    link.onCtrl((m) => { if (this.online === o) this.onRoomMsg(m); });
    room.onClosed(() => { if (this.online === o) this.peerGone(); });
    if (arena) {
      sfx.confirm(); announce('¡Te toca!');
      this.toast(`¡Te toca! Contra ${peerName}`, 3500);
      // si el otro nunca contesta (app cerrada o sin señal), pierde su turno
      o.waitPeer = setTimeout(() => { if (this.online === o && !link.peerReady) { o.ausente = true; this.toast(`${peerName} no respondió`); this.leaveRoom(false); } }, 20000);
    } else this.toast(`¡Pelea contra ${peerName}!`);
    this.mode = 'online';
    this.openSelect();
  }

  onRoomMsg(m) {
    const o = this.online;
    if (!o) return;
    const peer = 1 - o.side;
    switch (m.t) {
      case 'cursor': {
        const i = PELEADORES.findIndex((d) => d.id === m.id);
        if (i >= 0 && this.screen === 'select' && !this.sel.locked[peer]) { this.sel.cur[peer] = i; this.renderSelect(); }
        break;
      }
      case 'pick': {
        const i = PELEADORES.findIndex((d) => d.id === m.id);
        if (i < 0) { this.toast('Tu rival tiene un peleador que tú no tienes. Actualicen el juego.'); break; }
        if (this.screen === 'select') { this.sel.cur[peer] = i; this.sel.locked[peer] = true; this.renderSelect(); }
        o.picks[peer] = m.id;
        this.checkOnlinePicks();
        break;
      }
      case 'stageCursor': {
        const i = this.stageList().findIndex((s) => s.id === m.id);
        o.stageCursor = m.id;
        if (i >= 0 && this.screen === 'stages' && this.stageSel && !this.stageSel.canPick) { this.stageSel.cur = i; this.renderStages(); }
        break;
      }
      case 'stage': if (!o.isHost) this.prepareOnline(m.id); break;
      case 'ready': o.ready[peer] = true; this.maybeGo(); break;
      case 'go': if (!o.isHost) this.goOnline(); break;
      case 'rematch': o.rematch[peer] = true; this.toast(`${o.peerName} quiere la revancha`); this.maybeRematch(); break;
      case 'leave':
        if (!(o.turno && this.phase === 'matchEnd')) this.toast(o.turno ? `${o.peerName} abandonó la pelea` : `${o.peerName} salió de la sala`);
        this.leaveRoom(false);
        break;
    }
  }

  checkOnlinePicks() {
    const o = this.online;
    o.picks[o.side] = this.sel.locked[o.side] ? PELEADORES[this.sel.cur[o.side]].id : null;
    if (!o.picks[0] || !o.picks[1] || o.loading) return;
    o.loading = true;
    o.defs = [PELEADORES.find((d) => d.id === o.picks[0]), PELEADORES.find((d) => d.id === o.picks[1])];
    // el anfitrión elige el escenario; el invitado ve su selección en vivo
    setTimeout(() => {
      if (!this.online) return;
      if (o.isHost) this.openStageSelect(true, (id) => { o.link.sendCtrl({ t: 'stage', id }); this.prepareOnline(id); });
      else this.openStageSelect(false);
    }, 600);
  }

  async prepareOnline(stageId) {
    const o = this.online;
    if (!o || o.stageId) return;
    o.stageId = stageId;
    // los dos ven la presentación completa mientras cargan; luego se esperan uno al otro
    const shown = this.versus(o.defs[0], o.defs[1], stageId, o.side === 0 ? [o.myName, o.peerName] : [o.peerName, o.myName]);
    o.models = await this.loadModels(o.defs[0], o.defs[1], true);
    await shown;
    if (this.online !== o) return;
    o.ready[o.side] = true;
    o.link.sendCtrl({ t: 'ready' });
    $('vs-status').textContent = `Esperando a ${o.peerName}…`;
    this.maybeGo();
  }

  maybeGo() {
    const o = this.online;
    if (!o || !o.isHost || !o.ready[0] || !o.ready[1]) return;
    o.link.sendCtrl({ t: 'go' });
    // el anfitrión arranca medio ping después para empezar casi a la vez
    setTimeout(() => this.goOnline(), Math.min(250, o.link.rtt / 2));
  }

  async goOnline() {
    const o = this.online;
    if (!o || this.session) return;
    $('loading').classList.add('hidden'); $('loading-text').textContent = 'Cargando peleadores…';
    o.ready = [false, false]; o.rematch = [false, false];
    await this.startMatch(o.defs[0], o.defs[1], o.models, o.stageId);
    this.session = new RollbackSession(this, o.link, o.side);
    window.session = this.session;
    this.acc = 0;
    $('netbadge').classList.remove('hidden');
    if (o.turno) this.salas?.matchStarted(o);
  }

  maybeRematch() {
    const o = this.online;
    if (!o || !o.rematch[0] || !o.rematch[1]) return;
    o.rematch = [false, false]; o.picks = [null, null]; o.loading = false; o.stageId = null;
    this.quitMatch();
    this.openSelect();
  }

  // ------------------------------------------------------------------ escenarios
  stageList() { return [...STAGES, { id: 'aleatorio', nombre: 'ALEATORIO', lugar: 'sorpresa', color: '#333' }]; }

  // canPick=false: el invitado en línea solo ve lo que elige el anfitrión
  openStageSelect(canPick, onDone) {
    const list = this.stageList();
    const start = (!canPick && this.online?.stageCursor) || this.stageId;
    this.stageSel = { cur: Math.max(0, list.findIndex((s) => s.id === start)), canPick, onDone, locked: false };
    $('stage-hint').textContent = !canPick ? `${this.online?.peerName || 'Tu rival'} está eligiendo el escenario…`
      : isTouch() ? 'Toca un escenario para elegirlo' : 'A D / ← → para elegir · F / K / ENTER para aceptar · ESC volver';
    this.show('stages');
    this.renderStages();
    this.stageThumbs().then(() => this.renderStages());
  }

  renderStages() {
    const grid = $('stage-grid');
    const list = this.stageList();
    if (grid.children.length !== list.length) {
      grid.innerHTML = '';
      list.forEach((s, i) => {
        const c = document.createElement('div');
        c.className = 'stage-card';
        c.innerHTML = `<div class="stage-label"><b>${esc(s.nombre)}</b><small>${esc(s.lugar)}</small></div>`;
        c.addEventListener('click', () => { if (this.stageSel?.canPick) { this.stageSel.cur = i; this.lockStage(); } });
        c.addEventListener('mouseenter', () => { if (this.stageSel?.canPick && !this.stageSel.locked) { this.stageSel.cur = i; this.stageMoved(); } });
        grid.appendChild(c);
      });
    }
    [...grid.children].forEach((c, i) => {
      const s = list[i];
      const img = this.thumbs?.[s.id];
      c.style.backgroundImage = img ? `url(${img})` : `linear-gradient(135deg, ${s.color}, #111)`;
      if (s.id === 'aleatorio') c.style.backgroundImage = 'linear-gradient(135deg, #c8171d, #1b2648 50%, #6b4a2e)';
      c.classList.toggle('sel', this.stageSel?.cur === i);
      c.classList.toggle('locked', !!this.stageSel?.locked && this.stageSel.cur === i);
    });
  }

  stageMoved() {
    sfx.select(); this.renderStages();
    if (this.mode === 'online' && this.online?.isHost) this.online.link.sendCtrl({ t: 'stageCursor', id: this.stageList()[this.stageSel.cur].id });
  }

  lockStage() {
    const st = this.stageSel;
    if (!st || st.locked || !st.canPick) return;
    st.locked = true; sfx.confirm();
    let id = this.stageList()[st.cur].id;
    if (id === 'aleatorio') id = STAGES[Math.random() * STAGES.length | 0].id;
    announce(STAGES.find((s) => s.id === id).nombre.toLowerCase());
    this.renderStages();
    setTimeout(() => st.onDone(id), 500);
  }

  stageInput() {
    const st = this.stageSel;
    if (!st) return;
    if (st.canPick && !st.locked) {
      const n = this.stageList().length;
      if (consumeKey('KeyA', 'ArrowLeft')) { st.cur = (st.cur - 1 + n) % n; this.stageMoved(); }
      if (consumeKey('KeyD', 'ArrowRight')) { st.cur = (st.cur + 1) % n; this.stageMoved(); }
      if (consumeKey('KeyF', 'KeyK', 'Enter', 'Space')) this.lockStage();
    }
    if (consumeKey('Escape')) {
      if (this.mode === 'online') this.leaveRoom(true);
      else { this.sel.locked = [false, false]; this.openSelect(); }
    }
  }

  // Miniaturas de cada escenario (se dibujan una vez con un renderizador aparte)
  async stageThumbs() {
    if (this.thumbs || this.thumbsBusy) return this.thumbsBusy;
    this.thumbsBusy = (async () => {
      const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      r.setSize(384, 216); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.shadowMap.enabled = true;
      const cam = new THREE.PerspectiveCamera(42, 384 / 216, 0.1, 200);
      cam.position.set(0, 2.3, 9.5); cam.lookAt(0, 1.7, -4);
      const thumbs = {};
      for (const s of STAGES) {
        const sc = new THREE.Scene();
        const st = createStage(s.id, sc, { glow: { emit() {} } });
        r.render(sc, cam);
        thumbs[s.id] = r.domElement.toDataURL('image/jpeg', 0.85);
        st.dispose();
        await new Promise((res) => setTimeout(res, 0));
      }
      r.dispose(); r.forceContextLoss?.();
      this.thumbs = thumbs;
    })();
    return this.thumbsBusy;
  }

  leaveRoom(notify) {
    const o = this.online;
    if (!o) return;
    if (notify) o.link.sendCtrl({ t: 'leave' });
    setTimeout(() => o.link.close(), notify ? 300 : 0);
    clearTimeout(o.waitPeer);
    if (o.turno) this.salas?.leftMatch(o, notify);
    this.online = null;
    $('loading').classList.add('hidden');
    this.hideModal();
    this.quitMatch();
    if (o.arena && this.salas?.cur?.id === o.arena) this.showArena();
    else this.openLobby();
  }

  peerGone() {
    const o = this.online;
    if (!o) return;
    // en una sala, al terminar la pelea cada quien regresa por su lado: no es que se perdiera la conexión
    if (!(o.turno && this.phase === 'matchEnd')) this.toast(`Se perdió la conexión con ${o.peerName}`, 4000);
    this.leaveRoom(false);
  }

  reportResult() {
    if (this.reported || !this.online || !this.net) return;
    this.reported = true;
    this.net.reportResult(this.winnerSide === this.online.side);
  }

  // ================================================================== BUCLE
  loop(now) {
    const dt = Math.min(document.hidden ? 1 : 0.1, Math.max(0, (now - this.last) / 1000)); this.last = now;
    this.handleUI();
    if (this.session) {
      this.acc += dt;
      let n = 0;
      const max = document.hidden ? 60 : 8;
      while (this.acc >= STEP && n < max) { this.session.tick(); this.acc -= STEP; n++; }
      if (n >= max) this.acc = 0;
    } else if (this.screen === 'fight' && this.fighters.length && !this.paused) {
      if (this.slowmo > 0) this.slowmo -= dt * 60;
      this.acc += dt * (this.slowmo > 0 ? 0.35 : 1);
      let n = 0;
      while (this.acc >= STEP && n < 5) { this.simStep(); this.acc -= STEP; n++; }
      if (n >= 5) this.acc = 0;
    }
    this.salas?.update();
    // cuánto falta para el siguiente paso de la simulación (0..1): la vista dibuja entre pasos
    this.alpha = Math.min(1, Math.max(0, this.acc / STEP));
    this.stage.update(now / 1000);
    this.syncView(dt);
    this.menuEmbers(dt);
    this.effects.update(dt);
    this.updateCamera(dt);
    this.updateMusic();
    this.post.render(dt);
  }

  // Qué música va: la del menú, la del escenario (con más capas en la ronda final), la tensión del
  // "¡ACÁBALO!" o la fanfarria del que gana. En pausa y en cámara lenta se oye apagada.
  updateMusic() {
    if (this.paused) { music.muffle(true); return; }
    let id = 'menu', lvl = ['menu', 'options', 'controls'].includes(this.screen) ? 0 : 1;
    if (this.versusOn) id = null;
    else if (this.screen === 'fight' && this.fighters.length) {
      const ph = this.phase;
      lvl = 0;
      if (ph === 'matchEnd') id = 'victoria';
      else if (ph === 'postFatality') id = null;
      else if (ph === 'finish' || ph === 'finishBlow' || ph === 'fatality') id = 'tension';
      else {
        id = STAGE_MUSIC[this.stageId] || 'six';
        const final = this.fighters.every((f) => f.wins === JUEGO.rondasParaGanar - 1);
        lvl = ph === 'intro' ? 0 : final || this.timer <= 15 ? 2 : 1;
      }
    }
    music.set(id, lvl);
    music.muffle(!this.session && this.slowmo > 0);
  }

  // En los menús: chispas de brasa que suben despacio frente al escenario
  menuEmbers(dt) {
    if (this.fighters.length) return;
    this.emberT = (this.emberT || 0) + dt;
    while (this.emberT > 0.06) {
      this.emberT -= 0.06;
      this.effects.glow.emit({ pos: V((Math.random() - 0.5) * 18, Math.random() * 2, -5 + Math.random() * 9), count: 1, speed: 0.5, dir: [0.25, 1, 0], spread: 0.5,
        color: '#ffd08a', colorEnd: '#ff3000', life: 4.5, size: 0.07, drag: 0.15, gravity: -0.12 });
    }
  }

  handleUI() {
    if (this.versusOn) { clearKeyEdges(); return; }   // durante la presentación no se aceptan teclas
    if (this.screen === 'menu') {
      if (consumeKey('ArrowUp', 'KeyW')) { this.setMenuIdx(this.menuIdx - 1); sfx.select(); }
      if (consumeKey('ArrowDown', 'KeyS')) { this.setMenuIdx(this.menuIdx + 1); sfx.select(); }
      if (consumeKey('Enter', 'KeyF', 'Space', 'KeyK')) this.menuAccept(this.menuIdx);
    } else if (this.screen === 'select') this.selectInput();
    else if (this.screen === 'stages') this.stageInput();
    else if (this.screen === 'arena') {
      if (consumeKey('Escape')) this.salas?.leave().then(() => this.openLobby());
      if (consumeKey('Enter', 'KeyV')) this.salas?.watchNow();
    } else if (this.screen === 'lobby') {
      if (consumeKey('Escape')) { if (!$('modal').classList.contains('hidden')) this.modalAnswer(false); else this.leaveLobby(); }
      if (this.incoming && consumeKey('Enter')) this.modalAnswer(true);
    } else if (this.screen === 'options') {
      const n = this.optRows.length;
      if (consumeKey('ArrowUp', 'KeyW')) { this.optIdx = (this.optIdx - 1 + n) % n; sfx.select(); this.renderOptions(); }
      if (consumeKey('ArrowDown', 'KeyS')) { this.optIdx = (this.optIdx + 1) % n; sfx.select(); this.renderOptions(); }
      if (consumeKey('ArrowLeft', 'KeyA')) this.changeOption(-1);
      if (consumeKey('ArrowRight', 'KeyD', 'Enter', 'KeyF', 'Space')) this.changeOption(1);
      if (consumeKey('Escape')) this.closeOptions();
    } else if (this.screen === 'controls') {
      if (consumeKey('Escape', 'Enter')) {
        const back = this.prevScreen === 'fight';
        this.paused = false; if (back) sfx.pauseOut(); else sfx.back();
        this.show(back ? 'fight' : 'menu');
      }
      if (this.prevScreen === 'fight' && consumeKey('KeyO')) this.openOptions();
      if (this.prevScreen === 'fight' && consumeKey('KeyQ')) { this.paused = false; this.quitMatch(); this.show('menu'); }
    } else if (this.screen === 'fight') {
      // espectador: solo puede salirse a la sala
      if (this.mode === 'watch') {
        if (consumeKey('Escape')) this.salas?.stopWatching(true);
        this.salas?.badge();
        return;
      }
      // los golpes que venían de la pelea no cuentan como "continuar" ni como "revancha"
      if (this.phase === 'matchEnd' && this.phaseT <= 120) consumeKey('Enter', 'KeyF', 'KeyK', 'Space');
      if (this.mode === 'online') {
        if (this.phase === 'matchEnd') {
          this.reportResult();
          if (this.online.turno) {
            // en una sala la siguiente pelea la arma la sala; ESC regresa antes
            this.salas?.matchOver(this.online);
            if (consumeKey('Escape')) this.leaveRoom(false);
          } else if (this.phaseT > 120 && consumeKey('Enter', 'KeyF', 'KeyK') && !this.online.rematch[this.online.side]) {
            this.online.rematch[this.online.side] = true;
            this.online.link.sendCtrl({ t: 'rematch' });
            this.toast('Esperando a que tu rival acepte la revancha…');
            this.maybeRematch();
          } else if (consumeKey('Escape')) this.leaveRoom(true);
        } else if (consumeKey('Escape')) {
          this.modalKind = 'leave';
          this.showModal('¿Abandonar la pelea?', 'SALIR', 'SEGUIR');
        }
        if (this.modalKind === 'leave' && consumeKey('Enter')) this.modalAnswer(true);
        this.updateNetBadge();
        return;
      }
      if (this.phase === 'matchEnd' && this.phaseT > 120) {
        if (consumeKey('Enter', 'KeyF', 'KeyK', 'Space')) { this.quitMatch(); this.openSelect(); }
        else if (consumeKey('Escape')) { this.quitMatch(); this.show('menu'); }
      } else if (consumeKey('Escape')) { this.paused = true; sfx.pauseIn(); this.showControls(true); }
    }
  }

  updateNetBadge() {
    const o = this.online;
    if (!o) return;
    const quiet = performance.now() - o.link.lastHeard;
    const s = this.session?.stats;
    const crowd = o.arena ? Object.keys(this.salas?.cur?.data?.miembros || {}).length - 2 : 0;
    $('netbadge').innerHTML = quiet > 2500
      ? `<span class="bad">● Esperando a ${esc(o.peerName)}…</span>`
      : `<span class="${o.link.rtt < 80 ? 'good' : o.link.rtt < 160 ? 'mid' : 'bad'}">●</span> ${Math.round(o.link.rtt)} ms · ${o.link.mode}${s ? ` · rollback ${s.depth}f` : ''}${crowd > 0 ? ` · ${crowd} viendo` : ''}`;
    if (quiet > 15000) this.peerGone();
  }

  // ================================================================== VISTA
  buildViews() {
    // cadenas del especial "gancho"
    this.chains = [0, 1].map(() => {
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(0, 0), V(1, 0)]), new THREE.LineBasicMaterial({ color: '#cfcfcf' }));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 8), new THREE.MeshStandardMaterial({ color: '#ddd', metalness: 0.9, roughness: 0.2 }));
      line.add(tip); line.visible = false; line.frustumCulled = false;
      this.scene.add(line);
      return { line, tip };
    });
    // rayos láser (dos por peleador: un ojo cada uno) + núcleo blanco
    const beam = (color, r, opacity) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.rotation.z = Math.PI / 2; m.visible = false; m.frustumCulled = false;
      this.scene.add(m);
      return m;
    };
    this.lasers = [0, 1].map(() => ({ beams: [beam('#ff2a3a', 0.035, 0.55), beam('#ff2a3a', 0.035, 0.55)], cores: [beam('#ffffff', 0.012, 0.9), beam('#ffffff', 0.012, 0.9)] }));
    // escáner de la fatalidad robot
    this.scanner = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.42, 40), new THREE.MeshBasicMaterial({ color: '#4fd8ff', transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scanner.rotation.x = -Math.PI / 2; this.scanner.visible = false;
    this.scene.add(this.scanner);

    // Alan: satélite con rayo orbital y turbina · Gera: resorte con guante · cohete de la fatalidad de Alan
    const glowMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
    const metal = (c) => new THREE.MeshStandardMaterial({ color: c, metalness: 0.85, roughness: 0.3 });
    // Pose de JoJo de Alan: letras "ゴ" moradas flotando (dibujadas a mano: no dependen de fuentes japonesas)
    const go = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const x = c.getContext('2d');
      x.setTransform(0.75, 0, -0.18, 0.75, 30, 14);   // en cursiva
      const draw = (w, col) => {
        x.lineWidth = w; x.strokeStyle = col; x.lineJoin = 'miter';
        x.beginPath(); x.moveTo(24, 40); x.lineTo(88, 40); x.lineTo(88, 104); x.lineTo(20, 104); x.stroke();   // コ
        x.beginPath(); x.moveTo(96, 12); x.lineTo(104, 30); x.moveTo(110, 8); x.lineTo(118, 26); x.stroke();  // ゛
      };
      draw(22, '#16001f'); draw(11, '#c23cff');
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    this.gadgets = [0, 1].map(() => {
      const sat = new THREE.Group();
      sat.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), metal('#d9b04a')));
      for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.5), new THREE.MeshStandardMaterial({ color: '#1d3f8f', metalness: 0.5, roughness: 0.3, emissive: '#0a1a44' })); p.position.x = s * 1.0; sat.add(p); }
      const dish = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.25, 16, 1, true), metal('#e0e0e0')); dish.position.y = -0.42; dish.rotation.x = Math.PI; sat.add(dish);
      const aim = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 6, 1, true), glowMat('#ff2a3a', 0.8));
      const ray = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1, 20, 1, true), glowMat('#7fe3ff', 0.5));
      ray.add(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 1, 12, 1, true), glowMat('#ffffff', 0.85)));
      const turb = new THREE.Group();
      const nac = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.7, 20, 1, true), new THREE.MeshStandardMaterial({ color: '#c9d1d9', metalness: 0.9, roughness: 0.25, side: THREE.DoubleSide }));
      nac.rotation.z = Math.PI / 2; turb.add(nac);
      const fan = new THREE.Group(); fan.position.x = 0.2; turb.add(fan);
      for (let i = 0; i < 10; i++) {
        const piv = new THREE.Group(); piv.rotation.x = i / 10 * Math.PI * 2; fan.add(piv);
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.28, 0.08), metal('#4f565d')); b.position.y = 0.15; b.rotation.y = 0.5; piv.add(b);
      }
      const hub = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 12), metal('#999')); hub.rotation.z = -Math.PI / 2; hub.position.x = 0.3; turb.add(hub);
      const exhaust = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 16, 1, true), glowMat('#ffb347', 0.55)); exhaust.rotation.z = -Math.PI / 2; exhaust.position.x = -0.78; turb.add(exhaust);
      const springGeo = new THREE.BufferGeometry(); springGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(121 * 3), 3));
      const spring = new THREE.Line(springGeo, new THREE.LineBasicMaterial({ color: '#dfe3e6' }));
      const sglove = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), new THREE.MeshStandardMaterial({ color: '#d1121b', roughness: 0.35 })); sglove.scale.set(1.25, 1, 1);
      const rocket = new THREE.Group();
      rocket.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.3, 16), new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.3 })));
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 16), new THREE.MeshStandardMaterial({ color: '#d1121b' })); nose.position.y = 0.85; rocket.add(nose);
      for (let i = 0; i < 3; i++) { const pv = new THREE.Group(); pv.rotation.y = i * Math.PI * 2 / 3; const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.32, 0.22), new THREE.MeshStandardMaterial({ color: '#d1121b' })); fin.position.set(0, -0.5, 0.2); pv.add(fin); rocket.add(pv); }
      const rflame = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.7, 12), glowMat('#ffb347', 0.85)); rflame.rotation.x = Math.PI; rflame.position.y = -1.0; rocket.add(rflame);
      for (const o of [sat, aim, ray, turb, spring, sglove, rocket]) { o.visible = false; o.frustumCulled = false; this.scene.add(o); }
      const gogo = Array.from({ length: 6 }, () => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: go, transparent: true, depthWrite: false, opacity: 0 }));
        s.visible = false; this.scene.add(s);
        return s;
      });
      return { sat, aim, ray, turb, fan, spring, sglove, rocket, rflame, gogo };
    });
    // Emi: pescado gigante de la fatality
    this.bigFish = makeFish({ body: '#6f8fa6', belly: '#e6edf1', fin: '#45606f' });
    this.bigFish.scale.setScalar(7); this.bigFish.visible = false;
    // Ramces: la silla de barbero y la capa de su fatality
    this.chair = makeBarberChair(); this.chair.visible = false; this.scene.add(this.chair);
    this.cape = makeCape(); this.cape.visible = false; this.scene.add(this.cape);
    this.scene.add(this.bigFish);
    // Luz de los proyectiles: siempre existe (con brillo 0 si no hay). Si se agregaran y quitaran
    // luces, Three.js recompilaría todos los materiales y el juego se trabaría un instante.
    this.projLight = new THREE.PointLight('#ffffff', 0, 5);
    this.scene.add(this.projLight);
  }

  syncGadgets(dt) {
    const now = performance.now() / 1000;
    const n = Math.max(1, Math.round(dt * 60));
    this.fighters.forEach((f, i) => {
      const G = this.gadgets[i], d = f.specData, tipo = f.state === 'special' ? f.spec?.tipo : null;
      // satélite y rayo orbital
      const orb = tipo === 'orbital' && d && d.x != null && f.t >= 6 && f.t < 54;
      G.sat.visible = orb; G.aim.visible = false; G.ray.visible = false;
      if (orb) {
        const sx = d.x + Math.sin(now * 0.8) * 0.3, sy = 8.2;
        G.sat.position.set(sx, sy, -1.5); G.sat.rotation.y = now * 0.6;
        const top = V(sx, sy - 0.55, -1.5), bottom = V(d.x, 0, 0);
        if (f.t < 32) this.placeBeam(G.aim, top, bottom);
        else if (f.t < 46) {
          this.placeBeam(G.ray, top, bottom);
          const k = 1 - (f.t - 32) / 14;
          G.ray.scale.x = G.ray.scale.z = 0.3 + k;
          G.ray.material.color.set(f.spec.color || '#7fe3ff');
          this.effects.glow.emit({ pos: V(d.x, 0.2, 0.1), count: 4 * n, speed: 5, dir: [0, 1, 0], spread: 1.2, color: '#ffffff', colorEnd: f.spec.color || '#7fe3ff', life: 0.35, size: 0.25 });
        }
      }
      // turbina
      const tb = tipo === 'turbina' && f.t >= 6 && f.t < 58;
      G.turb.visible = tb;
      if (tb) {
        G.turb.position.set(f.x + f.facing * 0.9, f.y + 1.3, 0.3);
        G.turb.rotation.y = f.facing > 0 ? Math.PI : 0;
        G.fan.rotation.x += dt * 45;
        if (f.t >= 12 && f.t < 52) {
          const p = V(f.x + f.facing * 1.4, f.y + 1.3, 0.3);
          this.effects.glow.emit({ pos: p, count: 3 * n, speed: 9, dir: [f.facing, 0, 0], spread: 0.25, color: '#fff3c0', colorEnd: f.spec.color || '#ffd27a', life: 0.35, size: 0.22, drag: 1 });
          this.effects.solid.emit({ pos: p, count: n, speed: 6, dir: [f.facing, 0.05, 0], spread: 0.3, color: '#d8d8d8', colorEnd: '#777', life: 0.6, size: 0.35, grow: 2, drag: 2 });
        }
      }
      // resorte con guante (Gera)
      const sp = tipo === 'resorte' && d && (d.phase === 'out' || d.phase === 'back');
      G.spring.visible = sp; G.sglove.visible = sp;
      if (sp) {
        const hand = f.hand, len = Math.max(d.len, 0.01);
        const arr = G.spring.geometry.attributes.position.array;
        for (let k = 0; k <= 120; k++) {
          const t = k / 120, ang = t * Math.PI * 2 * 14;
          arr[k * 3] = hand.x + f.facing * len * t; arr[k * 3 + 1] = hand.y + Math.cos(ang) * 0.09; arr[k * 3 + 2] = 0.25 + Math.sin(ang) * 0.09;
        }
        G.spring.geometry.attributes.position.needsUpdate = true;
        G.sglove.position.set(hand.x + f.facing * (len + 0.12), hand.y, 0.25);
        G.sglove.material.color.set(f.def.colorGuantes || '#d1121b');
      }
      // cohete amarrado (fatalidad de Alan)
      G.rocket.visible = f.rocket && !f.hidden;
      if (G.rocket.visible) {
        G.rocket.position.set(f.x, f.y + 1.1, -0.35);
        G.rflame.visible = this.phase === 'fatality' && this.phaseT >= 45;
        G.rflame.scale.y = 0.8 + Math.random() * 0.6;
      }
      // pose de JoJo (Alan mandando su Camaro): "ゴゴゴ" subiendo a su alrededor
      const jojo = tipo === 'camaro' && f.t >= 4 && f.t < 78;
      G.gogo.forEach((s, j) => {
        s.visible = jojo;
        if (!jojo) return;
        const ph = (f.t / 60 + j / G.gogo.length) % 1, side = j % 2 ? -1 : 1;
        s.position.set((f.rx ?? f.x) + side * (0.85 + (j % 3) * 0.3), f.y + 0.5 + ph * 2.2, 0.35 + (j % 2) * 0.2);
        s.scale.setScalar(0.78 + 0.16 * Math.sin(f.t * 0.35 + j * 1.7));
        s.material.opacity = Math.sin(ph * Math.PI) * Math.min(1, (f.t - 4) / 8, (78 - f.t) / 8);
      });
      // robot: fuego de los propulsores y chispas de la descarga eléctrica
      if (tipo === 'propulsores' && f.t >= 6 && f.t < 24) {
        const back = V((f.rx ?? f.x) - f.facing * 0.5, f.y + 1.1, -0.1);
        this.effects.glow.emit({ pos: back, count: 5 * n, speed: 7, dir: [-f.facing, -0.1, 0], spread: 0.25, color: '#ffffff', colorEnd: f.spec.color || '#4fd8ff', life: 0.3, size: 0.32 });
        this.effects.solid.emit({ pos: back, count: n, speed: 3, dir: [-f.facing, 0, 0], spread: 0.4, color: '#bbbbbb', colorEnd: '#444', life: 0.6, size: 0.3, grow: 2, drag: 2 });
      }
      if (tipo === 'descarga' && f.t >= 6 && f.t < 36 && (G.arcT = (G.arcT || 0) + dt) > 0.05) {
        G.arcT = 0;
        const c = V(f.rx ?? f.x, f.y + 1.1, 0.2), ang = Math.random() * Math.PI * 2, r = 0.7 + Math.random() * 0.6;
        this.effects.lightning(c, V(c.x + Math.cos(ang) * r, c.y + Math.sin(ang) * r, 0.2 + (Math.random() - 0.5) * 0.4), f.spec.color || '#9fe8ff', 0.06);
      }
      // chorro de cerveza (Emi): sale de la boca de la caguama
      if (tipo === 'chela' && f.t >= 14 && f.t < 46) {
        const bottle = this.models[i]?.acc?.caguama;
        const mouth = bottle ? bottle.localToWorld(V(0, 0.37, 0)) : V(f.x + f.facing * 0.9, f.y + 1.4, 0.3);
        this.effects.solid.emit({ pos: mouth, count: 3 * n, speed: 7, dir: [f.facing, 0.15, 0], spread: 0.18, color: '#fff6d8', colorEnd: '#e8b030', life: 0.45, size: 0.22, grow: 1.5, drag: 1.2, gravity: 3 });
        this.effects.glow.emit({ pos: mouth, count: n, speed: 6, dir: [f.facing, 0.1, 0], spread: 0.25, color: '#ffffff', colorEnd: '#ffd23a', life: 0.3, size: 0.18 });
      }
    });
    // pescado gigante (fatality de Emi): sale del suelo, se traga al rival y se vuelve a clavar
    const bf = this.bigFish, ft = this.phaseT;
    bf.visible = !!(this.phase === 'fatality' && this.fatal?.tipo === 'pescadote' && ft >= 24 && ft < 108 && this.loser && this.winner);
    if (bf.visible) {
      const dir = this.winner.facing;
      let x = this.loser.x, y, rot;
      if (ft < 52) { y = -2.6 + (ft - 24) / 28 * 3.4; rot = Math.PI / 2; }                      // sube con la boca hacia arriba
      else if (ft < 70) { const k = (ft - 52) / 18; y = 0.8 + Math.sin(k * Math.PI) * 0.6; rot = Math.PI / 2 * (1 - k); x += dir * k * 0.7; }   // se dobla
      else { const k = (ft - 70) / 34; y = 0.8 - k * 3.6; rot = -k * Math.PI / 2; x += dir * (0.7 + k * 0.7); }   // se clava de cabeza
      bf.position.set(x, y, 0);
      bf.rotation.set(0, dir > 0 ? 0 : Math.PI, rot);
    }
  }

  clearViews() {
    for (const v of this.projViews.values()) this.scene.remove(v.obj);
    this.projViews.clear();
    this.events.length = 0;
    this.viewRound = -1; this.announced = null;
    // sin peleadores nadie apaga estos objetos: que no se queden en el menú (la capa, el satélite…)
    for (const o of [this.chair, this.cape, this.bigFish, this.scanner]) o.visible = false;
    for (const c of this.chains) c.line.visible = false;
    for (const L of this.lasers) for (const m of [...L.beams, ...L.cores]) m.visible = false;
    for (const G of this.gadgets) for (const o of [G.sat, G.aim, G.ray, G.turb, G.spring, G.sglove, G.rocket, ...G.gogo]) o.visible = false;
    this.projLight.intensity = 0;
  }

  syncView(dt) {
    for (const e of this.events) this.handleEvent(e);
    this.events.length = 0;
    if (!this.fighters.length) return;
    // las poses avanzan con el tiempo real (no a saltos de 60 fps); se congelan en el impacto y en pausa
    const frozen = this.hitstop > 0 || this.paused || this.screen !== 'fight';
    const animDt = frozen ? 0 : Math.min(0.1, dt) * (!this.session && this.slowmo > 0 ? 0.35 : 1);
    if (this.round !== this.viewRound) { this.viewRound = this.round; this.effects.clear(); }
    this.fighters.forEach((f, i) => this.syncFighter(f, this.models[i], animDt));
    this.syncProjectiles(dt);
    this.syncChains();
    this.syncLasers(dt);
    this.syncGadgets(dt);
    this.updateAnnouncer();
    this.syncBarber(dt);
    this.hud.update(this.fighters, this.timer);
    // poca vida: se oye el corazón del que juega en esta pantalla (y las orillas se ponen rojas)
    const me = this.localFighter();
    const danger = me && this.phase === 'fight' && !this.paused && me.health > 0 && me.health < me.maxHealth * 0.25;
    if (danger) {
      this.beat = (this.beat ?? 0) - dt;
      if (this.beat <= 0) { this.beat = 0.85; sfx.heartbeat(); }
    }
    const exp = this.phase === 'fatality' ? 0.55 : 1;
    this.renderer.toneMappingExposure += (exp - this.renderer.toneMappingExposure) * Math.min(1, dt * 6);
    this.screenFx(dt, danger);
  }

  localFighter() { return this.mode === 'watch' ? null : this.fighters[this.online ? this.online.side : 0]; }

  // Postproceso y capas de la pantalla según lo que pasa: destello y aberración en el K.O., gris en la
  // cámara lenta, orillas rojas con poca vida, fundido a negro entre rondas y la tabla de resultados
  screenFx(dt, danger) {
    const fx = this.post.fx, ph = this.phase, t = this.phaseT;
    // presentación de la ronda 1: el nombre de cada quien mientras la cámara lo enfoca
    if (ph === 'intro' && this.round === 1) {
      if (t >= 2 && this.introCue < 1) { this.introCue = 1; this.hud.special(0, this.fighters[0].def.nombre, this.fighters[0].def.color, 950); }
      if (t >= 30 && this.introCue < 2) { this.introCue = 2; this.hud.special(1, this.fighters[1].def.nombre, this.fighters[1].def.color, 950); }
    }
    if (ph !== this.viewPhase) {
      if (ph === 'ko' && this.koKind === 'ko') {
        const fl = $('flash'); fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on');
        this.aberr = 1.8; this.fovKick = Math.max(this.fovKick, 3);
        this.vibrate([70, 50, 140]);
      }
      if (ph === 'fight' && this.viewPhase === 'intro') this.fovKick = Math.max(this.fovKick, 2.2);   // ¡PELEA!
      this.viewPhase = ph;
    }
    this.aberr = Math.max(0, (this.aberr || 0) - dt * 2.6);
    fx.aberr = this.aberr;
    const desat = (ph === 'ko' && this.koKind === 'ko' && t < 70) ? 0.6 : ph === 'finish' ? 0.3 : 0;
    fx.desat += (desat - fx.desat) * Math.min(1, dt * 5);
    fx.danger = danger ? 0.3 + 0.14 * Math.sin(performance.now() / 150) : Math.max(0, fx.danger - dt * 2);
    const fade = this.fadeLevel().toFixed(3);
    if (fade !== this.fadeShown) { this.fadeShown = fade; $('fade').style.opacity = fade; }
    const res = this.screen === 'fight' && ph === 'matchEnd' && t > 100;
    if (res !== !!this.resultsOn) {
      this.resultsOn = res;
      if (res) this.renderResults();
      $('results').classList.toggle('hidden', !res);
    }
  }

  // Negro entre rondas: baja al final de "GANA ..." y sube al empezar la siguiente
  fadeLevel() {
    if (this.screen !== 'fight') return 0;
    const t = this.phaseT + (this.alpha ?? 0);
    if (this.phase === 'roundOver') return smooth((t - 98) / 20);
    if (this.phase === 'intro') return 1 - smooth(t / 16);
    return 0;
  }

  renderResults() {
    const s = this.stats, w = this.winnerSide;
    const row = (label, v) => {
      const best = v[0] === v[1] ? -1 : v[0] > v[1] ? 0 : 1;
      return `<tr><td>${label}</td>${v.map((x, i) => `<td class="${i === best ? 'best' : ''}">${x}</td>`).join('')}</tr>`;
    };
    $('results').innerHTML = `<table><tr><th></th>${this.fighters.map((f, i) => `<th class="${i === w ? 'win' : ''}">${esc(f.def.nombre)}</th>`).join('')}</tr>`
      + row('GOLPES', s.hits) + row('COMBO MÁX.', s.combo) + row('ESPECIALES', s.specials) + row('RONDAS', this.fighters.map((f) => f.wins)) + '</table>';
  }

  // Fatality de Ramces: la silla sube del piso, le pone la capa y, tras el navajazo, la cabeza sale volando
  syncBarber(dt) {
    const fat = this.fatal, d = fat?.data;
    const on = fat?.tipo === 'corte' && ['fatality', 'postFatality', 'matchEnd'].includes(this.phase) && this.loser && d?.x != null;
    this.chair.visible = !!on; this.cape.visible = false;
    for (const m of this.models) { m.headless = false; if (m.suit) m.suit.headless = false; }
    if (!on) { for (const m of this.models) if (m.head) m.head.visible = false; return; }
    const t = this.phase === 'fatality' ? this.phaseT : 999;
    this.chair.position.set(d.x, -1.3 * (1 - Math.min(1, t / 20)), 0);
    const lm = this.viewModel(this.loserSide), hd = this.models[this.loserSide]?.head;
    if (!lm?.parts) return;
    lm.root.updateMatrixWorld(true);
    if (t >= 30) {
      lm.parts.head.getWorldPosition(this.cape.position);
      this.cape.visible = true;
      this.cape.scale.setScalar(Math.max(0.001, Math.min(1, (t - 30) / 6)));
    }
    if (!d.cut) return;
    lm.headless = true;
    if (!hd) return;
    const u = hd.userData;
    if (!hd.visible) {   // sale del cuello
      hd.visible = true;
      lm.parts.head.getWorldPosition(hd.position).add(V(0, 0.15, 0.05));
      hd.rotation.set(0, -Math.PI / 2, 0);
      u.v = V(this.winner.facing * 2.3, 5.8, 0.6); u.spin = 9 * this.winner.facing; u.done = false;
    }
    if (dt > 0 && !u.done) {
      u.v.y -= 13 * dt;
      hd.position.addScaledVector(u.v, dt);
      hd.rotation.z += u.spin * dt;
      if (hd.position.y < 0.13) {   // rebota y rueda hasta quedarse quieta
        hd.position.y = 0.13;
        if (u.v.y < -1.5) { u.v.y *= -0.38; u.v.x *= 0.6; u.v.z *= 0.5; u.spin *= 0.5; sfx.thump(); }
        else { u.v.set(0, 0, 0); u.done = true; }
      }
    }
  }

  handleEvent(e) {
    const s = this.stats;
    if (e.type === 'special') {
      this.hud.special(e.side, e.nombre, e.color);
      if (this.phase !== 'fatality') s.specials[e.side]++;
      this.fovKick = Math.max(this.fovKick, 1.2);
    }
    if (e.type === 'hit') {
      const a = e.attacker;
      this.viewModel(e.side)?.flash(1);
      s.hits[a]++; s.combo[a] = Math.max(s.combo[a], e.combo);
      if (e.combo >= 2) this.hud.combo(a, e.combo);
      if (this.firstHitRound !== this.round && this.phase === 'fight') {
        this.firstHitRound = this.round;
        this.hud.banner(a, '¡PRIMER GOLPE!'); sfx.firstHit();
      }
      if (e.strong) { this.fovKick = Math.max(this.fovKick, 1.6); this.aberr = Math.max(this.aberr || 0, 0.6); }
      // cómo reacciona el que recibe: según a qué altura le pegaron (cabeza, cuerpo o piernas)
      const mv = this.fighters[a]?.move, vm = this.models[e.side];
      if (vm) vm.hitInfo = { h: !mv ? 'mid' : mv.height === 'low' || mv.height === 'mid' ? mv.height : 'high', strong: e.strong };
      // en el celular se siente cuando te pegan
      if (this.localFighter()?.side === e.side) this.vibrate(e.strong ? 45 : 18);
    }
  }

  // el modelo que se ve de cada peleador (Diego en MODO TITÁN: el traje de robot)
  viewModel(i) { const m = this.models[i]; return m?.suitOn && m.suit ? m.suit : m; }

  syncFighter(f, base, animDt) {
    // MODO TITÁN: se ve el traje de robot en lugar del modelo; al ponérselo "se arma" en un instante
    const robot = !!base.suit && f.titan;
    if (robot !== !!base.suitOn) {
      base.suitOn = robot; base.suitT = 0;
      base.suit?.flash(1.3); base.flash(1.3);
    }
    base.suitT = (base.suitT ?? 1) + (animDt || 0);
    base.root.visible = false;
    if (base.suit) base.suit.root.visible = false;
    const m = robot ? base.suit : base;
    // posición entre el paso anterior y el actual (sin saltos aunque la pantalla vaya a 120/144 Hz)
    const a = this.alpha ?? 1;
    const jump = f.px === undefined || Math.abs(f.x - f.px) > 1.5 || Math.abs(f.y - f.py) > 1.5;
    f.rx = jump ? f.x : f.px + (f.x - f.px) * a;
    const ry = jump ? f.y : f.py + (f.y - f.py) * a;
    // congelado del impacto: el que recibe el golpe vibra (se siente el golpe, no una pausa)
    let shake = 0;
    if (this.hitstop > 0 && f.t === 0 && ['hitstun', 'blockstun', 'airHit', 'pulled'].includes(f.state)) {
      shake = Math.sin(performance.now() * 0.12) * 0.012 * (this.hitstop + 1);
    }
    m.root.position.set(f.rx + shake, ry, 0);
    m.size = f.sizeScale * (robot ? 0.8 + 0.2 * Math.min(1, base.suitT / 0.25) : 1);
    m.setFacing(f.facing);
    m.root.visible = !f.hidden;
    m.burn = f.burn; m.squash = f.squash;
    m.paused = f.iced; m.setIced(f.iced);
    m.detachArm = this.projectiles.some((p) => p.alive && p.owner === f.side && p.kind === 'puno');
    // ronda 1: cada quien hace su pose de presentación mientras la cámara pasa (`intro` en roster.js)
    const intro = this.phase === 'intro' && f.state === 'intro' && this.round === 1 && this.phaseT < 74 ? f.def.intro || 'victoria' : null;
    // nalgas infladas (José) y fuego del jetpack (Alan)
    let butt = 1;
    if (f.state === 'special' && BUTT_SPECIALS.has(f.spec?.tipo)) butt = f.spec.tipo === 'twerk' ? 1.75 + Math.sin(f.t * 1.25) * 0.25 : 1.7;
    if (intro === 'twerk') butt = 1.75 + Math.sin(this.phaseT * 1.25) * 0.25;
    if (this.phase === 'fatality' && this.fatal?.tipo === 'nalgon' && this.winner === f && this.phaseT < 100) butt = 1 + 2.3 * Math.min(1, Math.max(0, (this.phaseT - 6) / 30));
    m.buttScale += (butt - m.buttScale) * Math.min(1, (animDt || 0) * 10);
    m.jetOn = f.state === 'special' && f.spec?.tipo === 'jetpack' && ['up', 'dive'].includes(f.specData?.phase);
    // Emi: el pescado o la caguama en la mano antes de aventarlos
    const tipo = f.state === 'special' ? f.spec?.tipo : null;
    // Ramces: la herramienta que está usando (en su fatality, la máquina y luego la navaja)
    const corte = this.phase === 'fatality' && this.fatal?.tipo === 'corte' && this.winner === f ? this.phaseT : -1;
    m.prop = tipo === 'pescado' && f.t < 12 ? 'pez' : (tipo === 'kawama' && f.t < 14) || tipo === 'chela' ? 'caguama'
      : tipo === 'tijeras' && f.t < 12 ? 'tijeras' : tipo === 'rapado' ? 'maquina' : tipo === 'navaja' ? 'navaja' : tipo === 'talco' ? 'brocha'
        : corte >= 40 && corte < 104 ? 'maquina' : corte >= 104 && corte < 176 ? 'navaja' : null;
    if (intro) m.prop = INTRO_PROP[intro] || null;
    if (m.jetOn && animDt) this.effects.glow.emit({ pos: V(f.x - f.facing * 0.3, f.y + 0.75, -0.1), count: 3, speed: 4, dir: [0, -1, 0], spread: 0.25, color: '#fff3c0', colorEnd: '#ff6a00', life: 0.3, size: 0.28 });
    // el robot corre con chispas de propulsor en los pies
    if (robot && f.state === 'walk' && animDt) this.effects.glow.emit({ pos: V(f.rx - f.facing * 0.2, f.y + 0.12, 0), count: 2, speed: 2.5, dir: [-f.facing, 0.3, 0], spread: 0.4, color: '#ffffff', colorEnd: f.buffColor || '#4fd8ff', life: 0.25, size: 0.18 });
    const st = intro ? { key: intro, t: this.phaseT, total: 74, s: 0.25, a: 0.8, id: 'intro', flip: false, rate: 1 } : f.animState();
    if (this.hitstop <= 0 && !this.paused) st.t += a * st.rate;   // tiempo de animación continuo entre pasos
    // lo que la animación necesita saber de la pelea (anim.js): solo se usa para verse, no cambia nada
    const opp = this.other(f);
    base.animStyle ||= styleOf(f.def);
    const sty = robot ? { ...base.animStyle, bounce: 0.45, tempo: 0.85 } : f.giant ? { ...base.animStyle, bounce: 0.6, tempo: 0.7 } : base.animStyle;
    st.ctx = {
      rx: f.rx, facing: f.facing, size: m.size, vx: f.vx * f.facing, vy: f.vy, air: ry > 0.001 || f.vy > 0,
      dist: opp ? Math.abs((opp.rx ?? opp.x) - f.rx) : null, state: f.state, stun: f.stunDur, hit: base.hitInfo, style: sty,
    };
    m.apply(st, animDt);
    this.swingTrail(f, m, st, animDt);
    let tint = null, amount = 0.6;
    if (f.iced) tint = '#3aa8ff';
    else if (f.buffTimer > 0 && f.buffKind === 'armor') { tint = f.buffColor; amount = 0.28 + 0.16 * Math.sin(performance.now() / 90); }
    else if (f.titan) tint = f.buffTimer < 90 && (f.t >> 3) % 2 ? f.buffColor : null;   // parpadea cuando ya se le acaba
    else if (f.buffTimer > 0 && (f.t >> 2) % 2) tint = f.buffColor;
    m.tickMaterials(animDt || 1 / 60, tint, amount);
  }

  // Golpes fuertes: una estela de luz sigue al puño o al pie que pega
  swingTrail(f, m, st, dt) {
    const boneName = TRAILS[st.key], bone = boneName && m.parts?.[boneName];
    const p = st.total ? st.t / st.total : 0;
    if (!bone || !dt || f.hidden || p < st.s * 0.6 || p > st.a + 0.1) { m.trail = null; return; }
    m.root.updateMatrixWorld(true);
    const off = boneName[0] === 'e' ? m.rig?.['hand' + boneName[2]] ?? V(0, -0.29, 0) : V(0, -(m.rig?.H ?? 1.85) * 0.24, 0);
    const pos = bone.localToWorld(off.clone());
    if (m.trail && m.trail.distanceTo(pos) < 1.5) {
      for (let i = 1; i <= 5; i++) this.effects.glow.emit({ pos: m.trail.clone().lerp(pos, i / 5), count: 1, speed: 0.02, color: '#fff6dc', colorEnd: f.def.color || '#ffb347', life: 0.15, size: 0.2, drag: 0 });
    }
    m.trail = pos;
  }

  makeProjectileView(p) {
    const g = new THREE.Group();
    const add = (geo, mat, setup) => { const mesh = new THREE.Mesh(geo, mat); setup?.(mesh); g.add(mesh); return mesh; };
    const glow = (c, o = 0.7) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
    const metal = new THREE.MeshStandardMaterial({ color: '#b9c3cc', metalness: 0.9, roughness: 0.28 });
    let spin = null, tumble = null;
    if (p.kind === 'puno') {
      // puño mecánico con antebrazo y propulsor
      add(new THREE.BoxGeometry(0.2, 0.17, 0.16), metal, (m) => { m.position.x = 0.12; });
      for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.04, 0.035, 0.035), new THREE.MeshStandardMaterial({ color: '#555', metalness: 0.8, roughness: 0.3 }), (m) => m.position.set(0.23, 0.06 - i * 0.04, 0.06));
      add(new THREE.CylinderGeometry(0.06, 0.07, 0.34, 12), metal, (m) => { m.rotation.z = Math.PI / 2; m.position.x = -0.13; });
      add(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 12), new THREE.MeshBasicMaterial({ color: '#4fd8ff' }), (m) => { m.rotation.z = Math.PI / 2; m.position.x = -0.02; });
      add(new THREE.ConeGeometry(0.07, 0.35, 10), glow('#ffb347', 0.85), (m) => { m.rotation.z = Math.PI / 2; m.position.x = -0.47; });
    } else if (p.kind === 'misil') {
      add(new THREE.CylinderGeometry(0.045, 0.045, 0.32, 10), new THREE.MeshStandardMaterial({ color: '#e8e8e8', metalness: 0.4, roughness: 0.4 }), (m) => { m.rotation.z = -Math.PI / 2; });
      add(new THREE.ConeGeometry(0.045, 0.12, 10), new THREE.MeshStandardMaterial({ color: '#d22', roughness: 0.5 }), (m) => { m.rotation.z = -Math.PI / 2; m.position.x = 0.22; });
      for (const s of [1, -1]) add(new THREE.BoxGeometry(0.08, 0.1, 0.01), new THREE.MeshStandardMaterial({ color: '#555' }), (m) => { m.position.set(-0.13, 0.05 * s, 0); });
      add(new THREE.ConeGeometry(0.04, 0.22, 8), glow('#ffcf5a', 0.9), (m) => { m.rotation.z = Math.PI / 2; m.position.x = -0.27; });
    } else if (p.kind === 'cohete') {
      // cohete blanco con franja negra y aletas rojas
      add(new THREE.CylinderGeometry(0.075, 0.075, 0.62, 14), new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.35 }), (m) => { m.rotation.z = -Math.PI / 2; });
      add(new THREE.CylinderGeometry(0.078, 0.078, 0.07, 14), new THREE.MeshStandardMaterial({ color: '#111' }), (m) => { m.rotation.z = -Math.PI / 2; m.position.x = 0.12; });
      add(new THREE.ConeGeometry(0.075, 0.24, 14), new THREE.MeshStandardMaterial({ color: '#d1121b' }), (m) => { m.rotation.z = -Math.PI / 2; m.position.x = 0.43; });
      for (const s of [1, -1]) add(new THREE.BoxGeometry(0.16, 0.14, 0.012), new THREE.MeshStandardMaterial({ color: '#d1121b' }), (m) => { m.position.set(-0.25, 0.09 * s, 0); });
      add(new THREE.ConeGeometry(0.065, 0.45, 10), glow('#ffcf5a', 0.9), (m) => { m.rotation.z = Math.PI / 2; m.position.x = -0.54; });
    } else if (p.kind === 'tijeras') {
      // tijeras de Ramces girando
      const sc = makeScissors(); sc.scale.setScalar(1.8);
      tumble = new THREE.Group(); tumble.add(sc); g.add(tumble);
    } else if (p.kind === 'pescado' || p.kind === 'kawama') {
      // Emi: pescado o caguama dando vueltas en el aire
      const prop = p.kind === 'pescado' ? makeFish() : makeKawama();
      if (p.kind === 'kawama') prop.position.y = -0.18; else prop.scale.setScalar(1.15);
      tumble = new THREE.Group(); tumble.add(prop); g.add(tumble);
    } else if (p.kind === 'plasma') {
      // cañón del robot: núcleo blanco, esfera azul y dos anillos girando
      add(new THREE.SphereGeometry(0.15, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      spin = add(new THREE.SphereGeometry(0.34, 20, 14), glow(p.color, 0.55));
      tumble = new THREE.Group(); g.add(tumble);
      for (const rx of [0, Math.PI / 2]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.025, 8, 36), glow('#ffffff', 0.75)); ring.rotation.x = rx; tumble.add(ring); }
    } else if (p.kind === 'camaro') {
      // el Camaro de Alan (modelo del especial, mirando a +X); si no cargó, el de cajas de Casa Chuy
      const url = this.fighters[p.owner]?.allSpecials.find((s) => s.tipo === 'camaro')?.modelo;
      const asset = url && this.props.get(url);
      if (asset) {
        const car = asset.scene.clone();
        car.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          for (const m of [].concat(o.material)) if (m.isMeshStandardMaterial) { m.metalness = 0.35; m.roughness = 0.35; }
        });
        g.add(car);
      } else buildCamaro(g, 0, 0, 1, false);
    } else if (p.kind === 'gas') {
      // la nube de gas son partículas (ver syncProjectiles)
    } else {
      const icy = p.kind === 'hielo';
      add(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      spin = add(icy ? new THREE.OctahedronGeometry(0.27) : new THREE.SphereGeometry(0.24, 16, 12), glow(p.color));
    }
    // brillo que ilumina alrededor (lo pone la luz fija de syncProjectiles, ver buildViews)
    const light = p.kind === 'pescado' || p.kind === 'kawama' || p.kind === 'tijeras' ? null
      : { color: p.kind === 'puno' || p.kind === 'cohete' ? '#ffb347' : p.color, power: p.kind === 'misil' ? 8 : p.kind === 'gas' ? 3 : p.kind === 'plasma' ? 32 : p.kind === 'camaro' ? 14 : 22 };
    this.scene.add(g);
    return { obj: g, spin, tumble, light, t: 0 };
  }

  syncProjectiles(dt) {
    const seen = new Set();
    const glow = this.effects.glow, solid = this.effects.solid;
    const n = Math.max(1, Math.round(dt * 60));
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      seen.add(p.id);
      let v = this.projViews.get(p.id);
      if (!v) { v = this.makeProjectileView(p); this.projViews.set(p.id, v); }
      v.t += dt;
      const pv = this.projPrev?.get(p.id), a = this.alpha ?? 1;
      v.obj.position.set(pv ? pv[0] + (p.x - pv[0]) * a : p.x, pv ? pv[1] + (p.y - pv[1]) * a : p.y, 0.1);
      const dir = Math.sign(p.vx) || 1;
      if (p.kind === 'misil') v.obj.rotation.z = Math.atan2(p.vy, p.vx);
      else v.obj.rotation.y = dir > 0 ? 0 : Math.PI;
      if (p.kind === 'camaro') { this.syncCamaro(p, v, dt, n); continue; }
      if (v.spin) { v.spin.rotation.x += dt * 12; v.spin.rotation.y += dt * 9; v.spin.scale.setScalar(1 + Math.sin(v.t * 36) * 0.12); }
      // pescado/caguama: da vueltas; el de la lluvia cae de cabeza coleteando
      if (v.tumble) v.tumble.rotation.z = p.fall ? -Math.PI / 2 + Math.sin(v.t * 9) * 0.35 : -v.t * (p.kind === 'kawama' ? 11 : 15);
      const back = V(p.x - Math.cos(v.obj.rotation.z) * 0.3 * (p.kind === 'misil' ? 1 : dir), p.y - (p.kind === 'misil' ? Math.sin(v.obj.rotation.z) * 0.3 : 0), 0.1);
      if (p.kind === 'gas') {
        solid.emit({ pos: V(p.x, p.y, 0.1), count: 3 * n, speed: 0.6, jitter: 1.0, color: '#a6e35a', colorEnd: '#4b6b25', life: 1.3, size: 0.7, grow: 1.6, drag: 1.5, gravity: -0.3 });
        if (v.t % 0.2 < dt) glow.emit({ pos: V(p.x, p.y, 0.1), count: 1, speed: 0.3, jitter: 0.8, color: '#d4ff7a', colorEnd: '#000000', life: 0.8, size: 0.5 });
      } else if (p.kind === 'puno' || p.kind === 'misil' || p.kind === 'cohete') {
        glow.emit({ pos: back, count: 2 * n, speed: 1.5, dir: [-dir, 0, 0], spread: 0.5, color: '#fff3c0', colorEnd: '#ff5a00', life: 0.25, size: 0.25 });
        solid.emit({ pos: back, count: n, speed: 0.6, jitter: 0.1, color: '#777', colorEnd: '#222', life: 0.9, size: 0.22, grow: 2, drag: 2 });
      } else if (p.kind === 'tijeras') {
        if (Math.random() < 0.5) glow.emit({ pos: v.obj.position, count: 1, speed: 0.3, jitter: 0.05, color: '#ffffff', colorEnd: '#9fb3c8', life: 0.2, size: 0.09 });
      } else if (p.kind === 'pescado' || p.kind === 'kawama') {
        // gotitas de agua (pescado) o de cerveza (caguama)
        if (Math.random() < 0.6) solid.emit({ pos: v.obj.position, count: 1, speed: 0.4, jitter: 0.08, color: p.kind === 'kawama' ? '#ffd27a' : '#cdeeff', colorEnd: '#ffffff', life: 0.35, size: 0.07, gravity: 3 });
      } else {
        glow.emit({ pos: V(p.x, p.y, 0.1), count: 3 * n, speed: 1.2, dir: [-dir, 0.2, 0], spread: 0.6, jitter: 0.2, color: '#ffffff', colorEnd: p.color, life: 0.35, size: 0.3, drag: 2 });
      }
    }
    for (const [id, v] of this.projViews) if (!seen.has(id)) { this.scene.remove(v.obj); this.projViews.delete(id); }
    // una sola luz fija sigue al proyectil que brilla (el número de luces nunca cambia: sin trabones)
    const lit = [...this.projViews.values()].find((v) => v.light);
    this.projLight.intensity = lit ? lit.light.power : 0;
    if (lit) { this.projLight.position.copy(lit.obj.position); this.projLight.color.set(lit.light.color); }
  }

  // Camaro de Alan: llega derecho, al frenar derrapa y queda de lado, luego se da la vuelta y se va al fondo
  syncCamaro(p, v, dt, n) {
    const d = p.dir, o = v.obj;
    let yaw = 0;
    if (p.phase === 'frena') yaw = 1.25 * THREE.MathUtils.smoothstep(4 - Math.abs(p.x - p.stopX), 0, 4);
    else if (p.phase === 'parado') yaw = 1.25;
    else if (p.phase === 'sale') yaw = Math.min(Math.PI / 2, (v.yaw ?? 1.25) + dt * 2.5);
    v.yaw = yaw;
    o.rotation.set(0, (d > 0 ? 0 : Math.PI) + d * yaw, 0);
    v.z = v.z == null ? p.z : v.z + (p.z - v.z) * Math.min(1, dt * 20);
    o.position.z = v.z;
    // humo de llantas al derrapar y al arrancar
    if (p.phase === 'frena' || (p.phase === 'sale' && p.z > -6)) {
      o.updateMatrixWorld(true);
      for (const side of [-0.85, 0.85]) {
        this.effects.solid.emit({ pos: o.localToWorld(V(-1.45, 0.2, side)), count: 2 * n, speed: 1.2, jitter: 0.25, color: '#d6d6d6', colorEnd: '#5a5a5a', life: 0.9, size: 0.45, grow: 2.2, drag: 1.5, gravity: -0.4 });
      }
    }
  }

  syncChains() {
    this.fighters.forEach((f, i) => {
      const c = this.chains[i];
      const d = f.specData;
      const on = f.state === 'special' && f.spec?.tipo === 'gancho' && f.t >= 8 && d && ['out', 'pull', 'back'].includes(d.phase);
      c.line.visible = on;
      if (!on) return;
      const hand = f.hand, tipX = hand.x + f.facing * Math.max(d.len, 0);
      const pos = c.line.geometry.attributes.position;
      pos.setXYZ(0, hand.x, hand.y, 0.25); pos.setXYZ(1, tipX, hand.y, 0.25); pos.needsUpdate = true;
      c.tip.position.set(tipX, hand.y, 0.25); c.tip.rotation.z = -f.facing * Math.PI / 2;
    });
  }

  // Coloca un cilindro entre dos puntos (los rayos láser)
  placeBeam(m, a, b) {
    const len = a.distanceTo(b);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.scale.set(1, Math.max(len, 0.001), 1);
    m.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
    m.visible = true;
  }

  syncLasers(dt) {
    const fat = this.phase === 'fatality' && this.fatal?.tipo === 'desintegrar' ? this.winner : null;
    this.scanner.visible = false;
    this.fighters.forEach((f, i) => {
      const L = this.lasers[i];
      for (const m of [...L.beams, ...L.cores]) m.visible = false;
      const m = this.viewModel(i);
      // MEGA LÁSER del traje de robot: un solo rayo gordo desde el pecho
      if (f.state === 'special' && f.spec?.tipo === 'megalaser') {
        const k = f.sizeScale, chest = V((f.rx ?? f.x) + f.facing * 0.42 * k, f.y + 1.25 * k, 0.3), color = f.spec.color || '#ff2a3a';
        if (f.t < 14) { this.effects.glow.emit({ pos: chest, count: 3, speed: 1.2, jitter: 0.12, color: '#ffffff', colorEnd: color, life: 0.25, size: 0.2 }); return; }
        if (f.t >= 46) return;
        const o = this.other(f);
        let endX = f.facing * (ARENA_HALF + 2);
        if ((o.x - f.x) * f.facing > 0 && !o.hidden && chest.y >= o.y - 0.4 && chest.y <= o.y + o.height + 0.4) endX = (o.rx ?? o.x) - f.facing * 0.25;
        const end = V(endX, chest.y, chest.z);
        L.beams[0].material.color.set(color);
        this.placeBeam(L.beams[0], chest, end); this.placeBeam(L.cores[0], chest, end);
        const w = 4 + Math.random() * 1.2;
        L.beams[0].scale.x = L.beams[0].scale.z = w; L.cores[0].scale.x = L.cores[0].scale.z = w * 0.9;
        this.effects.glow.emit({ pos: end, count: Math.max(2, Math.round(dt * 400)), speed: 5, color: '#ffffff', colorEnd: color, life: 0.25, size: 0.25, gravity: 3 });
        return;
      }
      const laserSpecial = f.state === 'special' && f.spec?.tipo === 'laser';
      const charging = (laserSpecial && f.t < 14) || (fat === f && this.phaseT < 12);
      const firing = (laserSpecial && f.t >= 14 && f.t < 36) || (fat === f && this.phaseT >= 12 && this.phaseT < 70);
      if (!charging && !firing) return;
      m.root.updateMatrixWorld(true);
      const eye = m.eyeWorld();
      const color = laserSpecial ? (f.spec.color || '#ff2a3a') : (f.fatality?.color || '#4fd8ff');
      if (charging) { this.effects.glow.emit({ pos: eye, count: 2, speed: 0.6, jitter: 0.08, color: '#ffffff', colorEnd: color, life: 0.2, size: 0.12 }); return; }
      const o = this.other(f);
      let endX = f.facing * (ARENA_HALF + 2);
      if (fat === f) endX = o.x;
      else if ((o.x - f.x) * f.facing > 0 && eye.y >= o.y && eye.y <= o.y + o.height + 0.05 && !o.hidden) endX = o.x - f.facing * 0.22;
      const targetY = fat === f ? 0.25 + (Math.sin(this.phaseT * 0.16) * 0.5 + 0.5) * 1.6 : eye.y;
      for (let k = 0; k < 2; k++) {
        const a = eye.clone().add(V(0, 0, k ? 0.035 : -0.035));
        const b = V(endX, targetY, a.z);
        L.beams[k].material.color.set(color);
        this.placeBeam(L.beams[k], a, b); this.placeBeam(L.cores[k], a, b);
        L.beams[k].scale.x = L.beams[k].scale.z = 1 + Math.random() * 0.4;
      }
      this.effects.glow.emit({ pos: V(endX, targetY, 0.1), count: Math.max(1, Math.round(dt * 240)), speed: 3, color: '#ffffff', colorEnd: color, life: 0.2, size: 0.14, gravity: 4 });
      if (fat === f) { this.scanner.visible = true; this.scanner.position.set(o.x, targetY, 0); this.scanner.material.color.set(color); }
    });
  }

  announcerState() {
    const t = this.phaseT, w = this.winner;
    const final = this.fighters.length === 2 && this.fighters.every((f) => f.wins === JUEGO.rondasParaGanar - 1);
    const perfect = !!w && w.health >= w.maxHealth;   // ganó sin que le pegaran
    switch (this.phase) {
      // ronda 1: el letrero sale ya que la cámara se abre (antes se ven de cerca los dos)
      case 'intro': return t < 88 && (this.round > 1 || t >= 38) ? { text: final ? 'RONDA FINAL' : `RONDA ${this.round}`, say: final ? 'Ronda final' : `Ronda ${ORDINAL[this.round - 1] || this.round}` } : null;
      case 'fight': return t < 50 ? { text: '¡PELEA!', say: '¡Pelea!' } : null;
      case 'ko': return t < 95 ? { text: this.koKind === 'time' ? '¡TIEMPO!' : 'K.O.', blood: true, kind: 'ko' } : null;
      case 'roundOver':
        if (t <= 5) return null;
        return w ? { text: `GANA ${w.def.nombre}`, sub: perfect ? [PERFECT] : [], perfect, say: perfect ? '¡Victoria perfecta!' : `Gana ${w.def.nombre}` } : { text: 'EMPATE', say: 'Empate' };
      case 'finish': return t < 120 ? { text: '¡ACÁBALO!', blood: true, kind: 'ko', say: '¡Acábalo!' } : null;
      case 'finishBlow': return null;
      case 'fatality': return null;
      case 'postFatality': return t < 130 ? { text: '¡FATALIDAD!', blood: true, kind: 'ko', say: 'Fatalidad' } : null;
      case 'matchEnd': {
        const room = this.mode === 'watch' || !!this.online?.turno;
        const hint = room ? (t > 60 ? 'Siguiente pelea en un momento…' : '')
          : t > 120 && !isTouch() ? (this.mode === 'online' ? 'ENTER revancha · ESC salir' : 'ENTER para continuar · ESC menú') : '';
        return { text: `GANA ${w.def.nombre}`, sub: [perfect ? PERFECT : '', w.def.frase, hint].filter(Boolean), perfect, say: `${w.def.nombre} gana` };
      }
    }
    return null;
  }

  updateAnnouncer() {
    const s = this.announcerState();
    const key = s ? s.text + '|' + (s.sub || []).join('|') : '';
    if (key === this.announced) return;
    const a = $('announcer');
    const sameText = s && this.announcedText === s.text;
    this.announced = key; this.announcedText = s?.text;
    if (!s) { a.classList.remove('show'); return; }
    const subs = (s.sub || []).map((x) => `<small class="${x === PERFECT ? 'perfect' : ''}">${esc(x)}</small>`).join('');
    a.classList.toggle('end', this.phase === 'matchEnd');   // más arriba: abajo va la tabla de resultados
    // mismo letrero con otra línea abajo (p. ej. la ayuda de teclas): solo se cambian las líneas
    if (sameText) { a.querySelectorAll('small').forEach((n) => n.remove()); a.insertAdjacentHTML('beforeend', subs); return; }
    a.innerHTML = `<div class="big"><span>${esc(s.text)}</span></div>${subs}`;
    a.classList.toggle('blood', !!s.blood);
    a.classList.toggle('ko', s.kind === 'ko');
    a.classList.remove('show'); void a.offsetWidth; a.classList.add('show');
    if (s.perfect) sfx.perfect();
    if (s.say && this.lastSaid !== s.text) { announce(s.say); this.lastSaid = s.text; clearTimeout(this.saidT); this.saidT = setTimeout(() => { this.lastSaid = null; }, 1500); }
  }

  updateCamera(dt) {
    const cam = this.camera;
    let target, look, roll = 0, k = 1 - Math.exp(-dt * 5);
    if (this.screen === 'fight' && this.fighters.length) {
      const [a, b] = this.fighters;
      const ax = a.rx ?? a.x, bx = b.rx ?? b.x;
      const mid = (ax + bx) / 2, dist = Math.abs(ax - bx);
      const maxY = Math.max(a.y, b.y);
      const narrow = THREE.MathUtils.clamp(1.75 / cam.aspect, 1, 2.2);
      let z = THREE.MathUtils.clamp(4.6 + dist * 0.62, 6.2, 11.5) * narrow;
      let focusX = mid;
      if (this.phase === 'fatality' || this.phase === 'finish') { z = THREE.MathUtils.clamp(3.6 + dist * 0.6, 4.8, 9) * narrow; focusX = this.loser ? mid * 0.6 + this.loser.x * 0.4 : mid; }
      // un gigante (Conde) no debe salirse del cuadro
      const big = Math.max(a.sizeScale, b.sizeScale) - 1;
      z += big * 3.0 * narrow;
      target = new THREE.Vector3(focusX, 1.7 + maxY * 0.25 + big * 0.9, z);
      look = new THREE.Vector3(focusX, 1.15 + maxY * 0.25 + big * 0.8, 0);
      // fatalidades que mandan al rival por los aires: la cámara lo sigue hacia arriba
      if (this.phase === 'fatality' && ['despegue', 'nocaut'].includes(this.fatal?.tipo) && this.loser) {
        const ly = Math.min(this.loser.y, 10);
        target.y += ly * 0.7; target.z += ly * 0.35; look.y += ly * 0.9;
      }
      // tomas de cine (solo la vista, no cambian la pelea): presentación, K.O. y el que gana
      const t = this.phaseT + (this.alpha ?? 0), w = this.winner, l = this.loser, close = Math.min(narrow, 1.4);
      if (this.phase === 'intro') {
        if (this.round === 1) {
          // de cerca a uno, pasa al otro y se abre a la toma de pelea
          const near = (f, fx) => [V(fx + f.facing * 1.25 * f.sizeScale, 1.4 * f.sizeScale, 2.7 * f.sizeScale * close), V(fx, 1.2 * f.sizeScale, 0)];
          const [p1, l1] = near(a, ax), [p2, l2] = near(b, bx);
          const e1 = smooth((t - 26) / 18), e2 = smooth((t - 54) / 32);
          target = p1.lerp(p2, e1).lerp(target, e2);
          look = l1.lerp(l2, e1).lerp(look, e2);
        } else {
          const e = 1 - smooth(t / 70);   // desde arriba y lejos, bajando a la toma de pelea
          target.add(V(0, 2.4 * e, 3.5 * e)); look.y += 0.4 * e;
        }
        k = 1;
      } else if (this.phase === 'ko' && this.koKind === 'ko' && w && l) {
        // se acerca al que cae y se ladea
        const e = smooth(t / 12) * (1 - smooth((t - 58) / 28)), lx = l.rx ?? l.x;
        target.lerp(V(lx - w.facing * 0.9, 1.1 + l.y * 0.4, 3.6 * close), e * 0.8);
        look.lerp(V(lx, 0.8 + l.y * 0.6, 0), e * 0.85);
        roll = 0.07 * e * w.facing;
      } else if (this.phase === 'roundOver' && w) {
        const e = smooth((t - 10) / 50) * 0.65, wx = w.rx ?? w.x;
        target.lerp(V(wx + w.facing * 1.6, 1.5 * w.sizeScale, 4.4 * close * w.sizeScale), e);
        look.lerp(V(wx, 1.25 * w.sizeScale, 0), e);
      } else if (this.phase === 'matchEnd' && w) {
        // vuelta lenta alrededor del que ganó
        const wx = w.rx ?? w.x, s = w.sizeScale, ang = Math.sin(t * 0.008) * 0.75 + w.facing * 0.35, R = 4.3 * Math.min(narrow, 1.5) * s;
        target = V(wx + Math.sin(ang) * R, 1.55 * s, Math.cos(ang) * R);
        look = V(wx, 1.2 * s, 0);
        k = 1 - Math.exp(-dt * 2.2);
      }
    } else {
      // menús: la cámara pasea despacio por el escenario
      const t = performance.now() / 1000 * 0.12;
      target = new THREE.Vector3(Math.sin(t) * 5.5, 2.1 + Math.sin(t * 0.7) * 0.3, 8.6 + Math.cos(t) * 1.8);
      look = new THREE.Vector3(0, 1.5, -3);
    }
    cam.position.lerp(target, k);
    this.camLook.lerp(look, k);
    const s = this.effects.shake;
    cam.lookAt(this.camLook.x + (Math.random() - 0.5) * s, this.camLook.y + (Math.random() - 0.5) * s, this.camLook.z);
    this.camRoll = (this.camRoll || 0) + (roll - (this.camRoll || 0)) * Math.min(1, dt * 6);
    if (Math.abs(this.camRoll) > 0.0005) cam.rotateZ(this.camRoll);
    // "golpe" de zoom en los golpes fuertes, los especiales y el K.O.
    this.fovKick *= Math.exp(-dt * 6);
    const fov = this.baseFov - this.fovKick;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }
}

window.game = new Game();
initTouch(window.game);
registerServiceWorker();
// precargar en segundo plano los modelos de los peleadores
for (const d of PELEADORES) for (const url of [d.modelo, d.traje?.modelo, ...(d.especiales || []).map((s) => s.modelo)]) if (url) loadAsset(url).catch(() => {});
