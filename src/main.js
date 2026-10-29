import * as THREE from 'three';
import { JUEGO, PELEADORES } from './roster.js';
import { FighterModel, loadAsset } from './model.js';
import { Fighter, ARENA_HALF } from './fighter.js';
import { PlayerInput, consumeKey, clearKeyEdges, decodeMask } from './input.js';
import { Effects } from './effects.js';
import { buildArena } from './arena.js';
import { CPU } from './ai.js';
import { FATALITIES, updateProjectile, impactProjectile, SOLID_PROJECTILES } from './specials.js';
import { sfx, announce, unlockAudio, setVoice, audioState } from './audio.js';
import { loadNetConfig, createBackend, Link, RollbackSession, fnv } from './net.js';

const $ = (id) => document.getElementById(id);
const STEP = 1 / 60;
const MAX_GAP = 9.5;               // distancia máxima entre peleadores (cámara)
const ORDINAL = ['UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO'];
const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
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
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    this.camera.position.set(0, 2, 9);
    this.camLook = new THREE.Vector3(0, 1.2, 0);
    this.effects = new Effects(this.scene, this.camera);
    this.effects.blood = JUEGO.sangre;
    this.arena = buildArena(this.scene, this.effects);
    setVoice(JUEGO.voz);
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
    this.cpu = null; this.session = null; this.online = null; this.net = null;
    this.screen = 'menu'; this.menuIdx = 0; this.mode = 'cpu';
    this.fxSeen = new Map(); this.fxCount = new Map();
    this.effects.gate = (name, args) => this.fxAllow(name, args);
    audioState.gate = (name, args) => this.fxAllow(name, args);

    this.buildMenu();
    this.buildSelect();
    this.buildLobby();
    this.buildViews();
    addEventListener('resize', () => this.resize()); this.resize();
    const unlock = () => unlockAudio();
    addEventListener('keydown', unlock); addEventListener('pointerdown', unlock);

    this.last = performance.now(); this.acc = 0;
    const frame = (t) => { this.loop(t); requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
    // En línea el juego no puede pararse si la pestaña queda en segundo plano
    setInterval(() => { if (document.hidden && this.session) this.loop(performance.now()); }, 100);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 60 : 40;
    this.camera.updateProjectionMatrix();
  }

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
    if (Math.abs(a.y - b.y) < 1.3 && Math.abs(dx) < 0.7 && !a.hidden && !b.hidden && a.state !== 'scripted') {
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
      if (!this.session) this.slowmo = 50;
      sfx.boom();
    } else if (this.phase === 'finish') {
      this.phase = 'finishBlow'; this.phaseT = 0;
      if (!this.session) this.slowmo = 40;
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
    return true;
  }

  phases(a, b) {
    const need = JUEGO.rondasParaGanar;
    switch (this.phase) {
      case 'intro':
        if (this.phaseT === 90) {
          for (const f of this.fighters) f.setState('idle');
          this.phase = 'fight'; this.phaseT = 0;
        }
        break;
      case 'fight':
        if (++this.timerFrames >= 60) {
          this.timerFrames = 0; this.timer--;
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
        if (this.phaseT > 80 && ['dead', 'knockdown'].includes(this.loser.state)) {
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
        if (this.phaseT > 150) this.startRound();
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
  }

  // ================================================================== PANTALLAS
  show(screen) {
    this.screen = screen;
    for (const id of ['menu', 'select', 'controls', 'lobby']) $(id).classList.toggle('hidden', id !== screen);
    $('hud').classList.toggle('hidden', screen !== 'fight');
    clearKeyEdges();
  }

  toast(text, ms = 3000) {
    const t = $('toast');
    t.textContent = text; t.classList.add('show');
    clearTimeout(this.toastT); this.toastT = setTimeout(() => t.classList.remove('show'), ms);
  }

  buildMenu() {
    this.menuButtons = [...document.querySelectorAll('#menu button')];
    this.menuButtons.forEach((b, i) => {
      b.addEventListener('mouseenter', () => this.setMenuIdx(i));
      b.addEventListener('click', () => this.menuAccept(i));
    });
  }
  setMenuIdx(i) {
    this.menuIdx = (i + this.menuButtons.length) % this.menuButtons.length;
    this.menuButtons.forEach((b, k) => b.classList.toggle('sel', k === this.menuIdx));
  }
  menuAccept(i) {
    unlockAudio(); sfx.confirm();
    const mode = this.menuButtons[i].dataset.mode;
    if (mode === 'controls') { this.showControls(false); return; }
    if (mode === 'online') { this.openLobby(); return; }
    this.mode = mode;
    this.openSelect();
  }

  showControls(pause) {
    $('controls-title').textContent = pause ? 'PAUSA' : 'CONTROLES';
    $('controls-hint').textContent = pause ? 'ESC para continuar · Q para salir al menú' : 'ESC para volver';
    const list = $('movelist');
    list.innerHTML = '';
    if (pause) for (const f of this.fighters) {
      const div = document.createElement('div');
      div.innerHTML = `<h3>${esc(f.def.nombre)}</h3><table>${f.specials.map((s) => `<tr><td>${esc(s.nombre)}</td><td>${esc(s.input)}</td></tr>`).join('')}${f.fatality ? `<tr><td>☠ ${esc(f.fatality.nombre)}</td><td>${esc(f.fatality.input)}</td></tr>` : ''}</table>`;
      list.appendChild(div);
    }
    this.prevScreen = this.screen;
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
    this.show('select');
    this.renderSelect();
  }

  clickCard(i) {
    if (this.mode === 'online') { const p = this.online.side; if (!this.sel.locked[p]) { this.sel.cur[p] = i; this.lock(p); } return; }
    if (!this.sel.locked[0]) { this.sel.cur[0] = i; this.lock(0); }
    else if (this.mode === 'vs' && !this.sel.locked[1]) { this.sel.cur[1] = i; this.lock(1); }
  }

  selectMoved(p) {
    sfx.select(); this.renderSelect();
    if (this.mode === 'online') this.online.link.sendCtrl({ t: 'cursor', id: PELEADORES[this.sel.cur[p]].id });
  }

  lock(p) {
    this.sel.locked[p] = true; sfx.confirm();
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
    if (this.sel.locked[0] && this.sel.locked[1]) setTimeout(() => this.startMatch(PELEADORES[this.sel.cur[0]], PELEADORES[this.sel.cur[1]]), 700);
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
      $(`pick${p + 1}`).textContent = show ? def.nombre : '?';
      $(`pspec${p + 1}`).innerHTML = show ? def.especiales.map((e) => `<b>${esc(e.nombre)}</b><br><span class="inp">${esc(e.input)}</span>`).join('<br>') + (s.locked[p] ? '<p class="ready">¡LISTO!</p>' : '') : '';
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
    if (consumeKey('Escape')) { if (s.locked[0] && !(this.mode === 'cpu' && s.locked[1])) { s.locked[0] = false; this.renderSelect(); } else this.show('menu'); }
  }

  // ------------------------------------------------------------------ partida
  async loadModels(def1, def2) {
    $('loading').classList.remove('hidden');
    for (const m of this.models) m.dispose();
    this.models = [];
    const models = await Promise.all([FighterModel.create(def1, false), FighterModel.create(def2, def1 === def2)]);
    $('loading').classList.add('hidden');
    return models;
  }

  async startMatch(def1, def2, preloaded = null) {
    const models = preloaded || await this.loadModels(def1, def2);
    this.models = models;
    this.scene.add(models[0].root, models[1].root);
    this.fighters = [new Fighter(def1, 0, this), new Fighter(def2, 1, this)];
    this.inputs = [new PlayerInput(0), new PlayerInput(1)];
    this.cpu = this.mode === 'cpu' ? new CPU(this.fighters[1], this.inputs[1], this, 0.6) : null;
    this.frame = 0; this.round = 0; this.projSeq = 0; this.slowmo = 0;
    this.fxSeen.clear();
    this.clearViews();
    $('name1').textContent = def1.nombre; $('name2').textContent = def2.nombre;
    $('player1').textContent = this.mode === 'online' ? (this.online.side === 0 ? this.online.myName : this.online.peerName) : '';
    $('player2').textContent = this.mode === 'online' ? (this.online.side === 1 ? this.online.myName : this.online.peerName) : '';
    this.show('fight');
    this.startRound();
    this.reported = false;
  }

  quitMatch() {
    for (const m of this.models) m.dispose();
    this.models = []; this.fighters = []; this.projectiles = [];
    this.clearViews();
    this.effects.clear();
    this.session?.dispose();
    this.session = null; this.cpu = null; this.phase = 'none';
    $('announcer').classList.remove('show');
    $('netbadge').classList.add('hidden');
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
    if (!this.net) setTimeout(() => $('myname').focus(), 50);
    else this.net.setStatus('libre');
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
      $('netstatus').textContent = 'No se pudo conectar: ' + (err.code || err.message);
    }
    $('connectBtn').disabled = false;
  }

  leaveLobby() {
    if (this.pendingChallenge) this.cancelMyChallenge();
    this.net?.disconnect();
    this.net = null;
    this.show('menu');
  }

  renderPlayers(list) {
    this.players = list;
    const me = this.net?.uid;
    $('online-count').textContent = `(${list.length})`;
    $('players').innerHTML = list.sort((a, b) => (a.uid === me ? -1 : b.uid === me ? 1 : a.nombre.localeCompare(b.nombre))).map((p) => `
      <li class="${p.uid === me ? 'me' : ''}">
        <span class="dot ${p.estado === 'jugando' ? 'busy' : ''}"></span>
        <span class="pname">${esc(p.nombre)}${p.uid === me ? ' (tú)' : ''}</span>
        <span class="pstate">${p.estado === 'jugando' ? 'en pelea' : 'libre'}</span>
        ${p.uid !== me && p.estado !== 'jugando' ? `<button data-uid="${esc(p.uid)}">RETAR</button>` : ''}
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
    if (this.online || this.incoming || this.pendingChallenge) { this.net.respond(ch, false); return; }
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

  enterRoom(sala, peerUid, peerName, isHost) {
    const room = this.net.openRoom(sala, peerUid, isHost);
    const link = new Link(room, isHost, this.netCfg.iceServers);
    this.online = { sala, peerUid, peerName, myName: this.myName, isHost, side: isHost ? 0 : 1, link, picks: [null, null], ready: [false, false], rematch: [false, false] };
    this.net.setStatus('jugando');
    link.onCtrl((m) => this.onRoomMsg(m));
    room.onClosed(() => this.peerGone());
    this.toast(`¡Pelea contra ${peerName}!`);
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
      case 'ready': o.ready[peer] = true; this.maybeGo(); break;
      case 'go': if (!o.isHost) this.goOnline(); break;
      case 'rematch': o.rematch[peer] = true; this.toast(`${o.peerName} quiere la revancha`); this.maybeRematch(); break;
      case 'leave': this.toast(`${o.peerName} salió de la sala`); this.leaveRoom(false); break;
    }
  }

  async checkOnlinePicks() {
    const o = this.online;
    o.picks[o.side] = this.sel.locked[o.side] ? PELEADORES[this.sel.cur[o.side]].id : null;
    if (!o.picks[0] || !o.picks[1] || o.loading) return;
    o.loading = true;
    const d1 = PELEADORES.find((d) => d.id === o.picks[0]), d2 = PELEADORES.find((d) => d.id === o.picks[1]);
    o.defs = [d1, d2];
    o.models = await this.loadModels(d1, d2);
    if (!this.online) return;
    o.ready[o.side] = true;
    o.link.sendCtrl({ t: 'ready' });
    $('loading').classList.remove('hidden'); $('loading-text').textContent = `Esperando a ${o.peerName}…`;
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
    await this.startMatch(o.defs[0], o.defs[1], o.models);
    this.session = new RollbackSession(this, o.link, o.side);
    window.session = this.session;
    this.acc = 0;
    $('netbadge').classList.remove('hidden');
  }

  maybeRematch() {
    const o = this.online;
    if (!o || !o.rematch[0] || !o.rematch[1]) return;
    o.rematch = [false, false]; o.picks = [null, null]; o.loading = false;
    this.quitMatch();
    this.openSelect();
  }

  leaveRoom(notify) {
    const o = this.online;
    if (!o) return;
    if (notify) o.link.sendCtrl({ t: 'leave' });
    setTimeout(() => o.link.close(), notify ? 300 : 0);
    this.online = null;
    $('loading').classList.add('hidden');
    this.hideModal();
    this.quitMatch();
    this.openLobby();
  }

  peerGone() {
    if (!this.online) return;
    this.toast(`Se perdió la conexión con ${this.online.peerName}`, 4000);
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
    this.arena.update(now / 1000);
    this.syncView(dt);
    this.effects.update(dt);
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  handleUI() {
    if (this.screen === 'menu') {
      if (consumeKey('ArrowUp', 'KeyW')) { this.setMenuIdx(this.menuIdx - 1); sfx.select(); }
      if (consumeKey('ArrowDown', 'KeyS')) { this.setMenuIdx(this.menuIdx + 1); sfx.select(); }
      if (consumeKey('Enter', 'KeyF', 'Space', 'KeyK')) this.menuAccept(this.menuIdx);
    } else if (this.screen === 'select') this.selectInput();
    else if (this.screen === 'lobby') {
      if (consumeKey('Escape')) { if (!$('modal').classList.contains('hidden')) this.modalAnswer(false); else this.leaveLobby(); }
      if (this.incoming && consumeKey('Enter')) this.modalAnswer(true);
    } else if (this.screen === 'controls') {
      if (consumeKey('Escape', 'Enter')) { this.paused = false; this.show(this.prevScreen === 'fight' ? 'fight' : 'menu'); }
      if (this.prevScreen === 'fight' && consumeKey('KeyQ')) { this.paused = false; this.quitMatch(); this.show('menu'); }
    } else if (this.screen === 'fight') {
      if (this.mode === 'online') {
        if (this.phase === 'matchEnd') {
          this.reportResult();
          if (this.phaseT > 120 && consumeKey('Enter', 'KeyF', 'KeyK') && !this.online.rematch[this.online.side]) {
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
      } else if (consumeKey('Escape')) { this.paused = true; this.showControls(true); }
    }
  }

  updateNetBadge() {
    const o = this.online;
    if (!o) return;
    const quiet = performance.now() - o.link.lastHeard;
    const s = this.session?.stats;
    $('netbadge').innerHTML = quiet > 2500
      ? `<span class="bad">● Esperando a ${esc(o.peerName)}…</span>`
      : `<span class="${o.link.rtt < 80 ? 'good' : o.link.rtt < 160 ? 'mid' : 'bad'}">●</span> ${Math.round(o.link.rtt)} ms · ${o.link.mode}${s ? ` · rollback ${s.depth}f` : ''}`;
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
  }

  clearViews() {
    for (const v of this.projViews.values()) this.scene.remove(v.obj);
    this.projViews.clear();
    this.events.length = 0;
    this.viewRound = -1; this.announced = null;
  }

  syncView(dt) {
    for (const e of this.events) this.handleEvent(e);
    this.events.length = 0;
    if (!this.fighters.length) return;
    const animDt = Math.min(0.25, (this.animFrames - this.viewAnimFrames) * STEP);
    this.viewAnimFrames = this.animFrames;
    if (this.round !== this.viewRound) { this.viewRound = this.round; this.effects.clear(); }
    this.fighters.forEach((f, i) => this.syncFighter(f, this.models[i], animDt));
    this.syncProjectiles(dt);
    this.syncChains();
    this.syncLasers(dt);
    this.updateAnnouncer();
    this.updateHUD();
    const exp = this.phase === 'fatality' ? 0.55 : 1;
    this.renderer.toneMappingExposure += (exp - this.renderer.toneMappingExposure) * Math.min(1, dt * 6);
  }

  handleEvent(e) {
    if (e.type === 'special') this.showSpecialName(e.side, e.nombre, e.color);
    if (e.type === 'hit') {
      this.models[e.side]?.flash(1);
      if (e.combo >= 2) {
        const el = $(e.attacker === 0 ? 'combo1' : 'combo2');
        el.textContent = `${e.combo} GOLPES`;
        el.classList.add('show');
        clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 1200);
      }
    }
  }

  showSpecialName(side, nombre, color) {
    const el = $(side === 0 ? 'spec1' : 'spec2');
    el.textContent = nombre;
    el.style.setProperty('--c', color || '#f80');
    el.classList.add('show');
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 1100);
  }

  syncFighter(f, m, animDt) {
    m.root.position.set(f.x, f.y, 0);
    m.setFacing(f.facing);
    m.root.visible = !f.hidden;
    m.burn = f.burn; m.squash = f.squash;
    m.paused = f.iced; m.setIced(f.iced);
    m.detachArm = this.projectiles.some((p) => p.alive && p.owner === f.side && p.kind === 'puno');
    m.apply(f.animState(), animDt);
    let tint = null, amount = 0.6;
    if (f.iced) tint = '#3aa8ff';
    else if (f.buffTimer > 0 && f.buffKind === 'armor') { tint = f.buffColor; amount = 0.28 + 0.16 * Math.sin(performance.now() / 90); }
    else if (f.buffTimer > 0 && (f.t >> 2) % 2) tint = f.buffColor;
    m.tickMaterials(animDt || 1 / 60, tint, amount);
  }

  makeProjectileView(p) {
    const g = new THREE.Group();
    const add = (geo, mat, setup) => { const mesh = new THREE.Mesh(geo, mat); setup?.(mesh); g.add(mesh); return mesh; };
    const glow = (c, o = 0.7) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
    const metal = new THREE.MeshStandardMaterial({ color: '#b9c3cc', metalness: 0.9, roughness: 0.28 });
    let spin = null;
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
    } else {
      const icy = p.kind === 'hielo';
      add(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
      spin = add(icy ? new THREE.OctahedronGeometry(0.27) : new THREE.SphereGeometry(0.24, 16, 12), glow(p.color));
    }
    const light = new THREE.PointLight(p.kind === 'puno' ? '#ffb347' : p.color, p.kind === 'misil' ? 8 : 22, 5);
    g.add(light);
    this.scene.add(g);
    return { obj: g, spin, t: 0 };
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
      v.obj.position.set(p.x, p.y, 0.1);
      const dir = Math.sign(p.vx) || 1;
      if (p.kind === 'misil') v.obj.rotation.z = Math.atan2(p.vy, p.vx);
      else v.obj.rotation.y = dir > 0 ? 0 : Math.PI;
      if (v.spin) { v.spin.rotation.x += dt * 12; v.spin.rotation.y += dt * 9; v.spin.scale.setScalar(1 + Math.sin(v.t * 36) * 0.12); }
      const back = V(p.x - Math.cos(v.obj.rotation.z) * 0.3 * (p.kind === 'misil' ? 1 : dir), p.y - (p.kind === 'misil' ? Math.sin(v.obj.rotation.z) * 0.3 : 0), 0.1);
      if (p.kind === 'puno' || p.kind === 'misil') {
        glow.emit({ pos: back, count: 2 * n, speed: 1.5, dir: [-dir, 0, 0], spread: 0.5, color: '#fff3c0', colorEnd: '#ff5a00', life: 0.25, size: 0.25 });
        solid.emit({ pos: back, count: n, speed: 0.6, jitter: 0.1, color: '#777', colorEnd: '#222', life: 0.9, size: 0.22, grow: 2, drag: 2 });
      } else {
        glow.emit({ pos: V(p.x, p.y, 0.1), count: 3 * n, speed: 1.2, dir: [-dir, 0.2, 0], spread: 0.6, jitter: 0.2, color: '#ffffff', colorEnd: p.color, life: 0.35, size: 0.3, drag: 2 });
      }
    }
    for (const [id, v] of this.projViews) if (!seen.has(id)) { this.scene.remove(v.obj); this.projViews.delete(id); }
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
      const m = this.models[i];
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
    const final = this.fighters.every((f) => f.wins === JUEGO.rondasParaGanar - 1);
    switch (this.phase) {
      case 'intro': return t < 88 ? { text: final ? 'RONDA FINAL' : `RONDA ${this.round}`, say: final ? 'Ronda final' : `Ronda ${ORDINAL[this.round - 1] || this.round}` } : null;
      case 'fight': return t < 50 ? { text: '¡PELEA!', say: '¡Pelea!' } : null;
      case 'ko': return t < 95 ? { text: this.koKind === 'time' ? '¡TIEMPO!' : 'K.O.', blood: true } : null;
      case 'roundOver': return t > 5 ? (w ? { text: `GANA ${w.def.nombre}` } : { text: 'EMPATE' }) : null;
      case 'finish': return t < 120 ? { text: '¡ACÁBALO!', blood: true, say: '¡Acábalo!' } : null;
      case 'finishBlow': return null;
      case 'fatality': return null;
      case 'postFatality': return t < 130 ? { text: '¡FATALIDAD!', blood: true, say: 'Fatalidad' } : null;
      case 'matchEnd': {
        const hint = t > 120 ? (this.mode === 'online' ? 'ENTER revancha · ESC salir' : 'ENTER para continuar · ESC menú') : '';
        return { text: `GANA ${w.def.nombre}`, sub: [w.def.frase, hint].filter(Boolean), say: `${w.def.nombre} gana` };
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
    a.innerHTML = esc(s.text) + (s.sub || []).map((x) => `<small>${esc(x)}</small>`).join('');
    a.classList.toggle('blood', !!s.blood);
    if (!sameText) {
      a.classList.remove('show'); void a.offsetWidth; a.classList.add('show');
      if (s.say && this.lastSaid !== s.text) { announce(s.say); this.lastSaid = s.text; clearTimeout(this.saidT); this.saidT = setTimeout(() => { this.lastSaid = null; }, 1500); }
    }
  }

  updateHUD() {
    for (const [i, f] of this.fighters.entries()) {
      const pct = Math.max(0, f.health / f.maxHealth * 100);
      const fill = $(`hp${i + 1}`), lag = $(`lag${i + 1}`);
      fill.style.width = pct + '%'; lag.style.width = pct + '%';
      fill.classList.toggle('low', pct < 30);
      $(`wins${i + 1}`).textContent = '◆ '.repeat(f.wins).trim();
    }
    $('timer').textContent = Math.max(0, this.timer);
  }

  updateCamera(dt) {
    const cam = this.camera;
    let target, look;
    if (this.screen === 'fight' && this.fighters.length) {
      const [a, b] = this.fighters;
      const mid = (a.x + b.x) / 2, dist = Math.abs(a.x - b.x);
      const maxY = Math.max(a.y, b.y);
      const narrow = THREE.MathUtils.clamp(1.75 / cam.aspect, 1, 2.2);
      let z = THREE.MathUtils.clamp(4.6 + dist * 0.62, 6.2, 11.5) * narrow;
      let focusX = mid;
      if (this.phase === 'fatality' || this.phase === 'finish') { z = THREE.MathUtils.clamp(3.6 + dist * 0.6, 4.8, 9) * narrow; focusX = this.loser ? mid * 0.6 + this.loser.x * 0.4 : mid; }
      target = new THREE.Vector3(focusX, 1.7 + maxY * 0.25, z);
      look = new THREE.Vector3(focusX, 1.15 + maxY * 0.25, 0);
    } else {
      const t = performance.now() / 1000 * 0.12;
      target = new THREE.Vector3(Math.sin(t) * 6, 2.4, 9 + Math.cos(t) * 2);
      look = new THREE.Vector3(0, 1.6, -3);
    }
    const k = 1 - Math.exp(-dt * 5);
    cam.position.lerp(target, k);
    this.camLook.lerp(look, k);
    const s = this.effects.shake;
    cam.lookAt(this.camLook.x + (Math.random() - 0.5) * s, this.camLook.y + (Math.random() - 0.5) * s, this.camLook.z);
  }
}

window.game = new Game();
// precargar en segundo plano los modelos de los peleadores
for (const d of PELEADORES) if (d.modelo) loadAsset(d.modelo).catch(() => {});
