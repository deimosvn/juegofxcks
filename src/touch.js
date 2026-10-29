import { setVirtualKey } from './input.js';

// =====================================================================
//  CELULAR: controles táctiles y app instalable (PWA)
//  Todo lo que se toca se traduce a las teclas del jugador 1 (A D W S · F G H R),
//  así funciona igual en los menús, contra la CPU y en línea.
// =====================================================================

const $ = (id) => document.getElementById(id);
const html = document.documentElement;
const MIN_HOLD = 45;   // ms: hasta el toque más rápido dura un par de cuadros de la simulación
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const setText = (el, t) => { if (el.textContent !== t) el.textContent = t; };
// seguir al dedo aunque se salga del botón (algunos navegadores lo rechazan: no pasa nada)
const capture = (el, id) => { try { el.setPointerCapture(id); } catch { /* sin captura */ } };

export const isTouch = () => html.classList.contains('touch');

// El peleador que maneja esta pantalla (en línea puede ser el de la derecha)
const localFighter = (g) => (!g.fighters?.length ? null : g.mode === 'online' && g.online ? g.fighters[g.online.side] : g.fighters[0]);

// Botón con data-key: apretar = tecla abajo, soltar = tecla arriba (aguanta varios dedos)
function bindKeyButton(el) {
  const code = el.dataset.key;
  const ids = new Set();
  let downAt = 0;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    ids.add(e.pointerId);
    capture(el, e.pointerId);
    if (ids.size === 1) { downAt = performance.now(); setVirtualKey(code, true); el.classList.add('down'); }
  });
  const release = (e) => {
    if (!ids.delete(e.pointerId) || ids.size) return;
    setTimeout(() => { if (!ids.size) { setVirtualKey(code, false); el.classList.remove('down'); } }, Math.max(0, MIN_HOLD - (performance.now() - downAt)));
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

// Joystick flotante: aparece donde pones el dedo (mitad izquierda)
function bindJoystick() {
  const pad = $('tpad'), base = pad.querySelector('.base'), knob = pad.querySelector('.knob');
  const R = 56;
  const held = { KeyA: false, KeyD: false, KeyW: false, KeyS: false };
  const set = (code, v) => { if (held[code] !== v) { held[code] = v; setVirtualKey(code, v); } };
  let id = null, cx = 0, cy = 0;
  const apply = (dx, dy) => {
    const len = Math.hypot(dx, dy), k = len > R ? R / len : 1;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    const nx = dx / R, ny = dy / R;
    set('KeyA', nx < -0.38); set('KeyD', nx > 0.38);
    set('KeyW', ny < -0.55); set('KeyS', ny > 0.5);   // saltar pide empujar un poco más
  };
  pad.addEventListener('pointerdown', (e) => {
    if (id !== null) return;
    e.preventDefault();
    id = e.pointerId; capture(pad, id);
    const r = pad.getBoundingClientRect();
    cx = e.clientX; cy = e.clientY;
    base.style.left = `${cx - r.left}px`; base.style.top = `${cy - r.top}px`;
    pad.classList.add('on');
    apply(0, 0);
  });
  pad.addEventListener('pointermove', (e) => { if (e.pointerId === id) apply(e.clientX - cx, e.clientY - cy); });
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null; pad.classList.remove('on');
    base.style.left = ''; base.style.top = '';   // regresa a su lugar
    apply(0, 0);
  };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);
  return { held, reset: () => { if (id === null) for (const c in held) set(c, false); } };
}

export function initTouch(game) {
  const enable = () => html.classList.add('touch');
  if (matchMedia('(pointer: coarse)').matches) enable();
  addEventListener('touchstart', enable, { passive: true, once: true });

  document.querySelectorAll('[data-key]').forEach(bindKeyButton);
  const joy = bindJoystick();

  // Especial: solo = 1º, adelante = 2º, abajo = 3º, atrás = 4º (igual que fighter.js trySpecial)
  const specialIndex = (f) => {
    if (joy.held.KeyS) return 2;
    const hx = joy.held.KeyD ? 1 : joy.held.KeyA ? -1 : 0;
    return hx && hx === f.facing ? 1 : hx && hx === -f.facing ? 3 : 0;
  };

  // ☠ marca la fatality del peleador con las teclas, como si la hiciera el jugador
  let busy = false;
  $('tfatal').addEventListener('pointerdown', async (e) => {
    e.preventDefault();
    const f = localFighter(game), p = f?.fatality?.parsed;
    if (busy || !p) return;
    busy = true;
    joy.reset();
    const fwd = f.facing > 0 ? 'KeyD' : 'KeyA', back = f.facing > 0 ? 'KeyA' : 'KeyD';
    const dirKey = { F: fwd, B: back, D: 'KeyS', U: 'KeyW' };
    const btnKey = { punch: 'KeyF', kick: 'KeyG', block: 'KeyH', special: 'KeyR' }[p.btn] || 'KeyF';
    const tap = async (code) => { setVirtualKey(code, true); await sleep(55); setVirtualKey(code, false); await sleep(35); };
    for (const d of p.seq) await tap(dirKey[d]);
    await tap(btnKey);
    busy = false;
  });

  // Pantalla completa y horizontal al entrar a jugar desde el celular
  const installed = () => matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone;
  document.querySelectorAll('#menu .menu-options button').forEach((b) => b.addEventListener('click', () => {
    if (!isTouch() || document.fullscreenElement || installed() || !html.requestFullscreen) return;
    html.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  }));

  // Instalar la app (Android/Chrome); en iPhone se explica cómo
  let deferred = null;
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; $('installBtn').classList.remove('hidden'); });
  addEventListener('appinstalled', () => $('installBtn').classList.add('hidden'));
  $('installBtn').addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => {});
    deferred = null;
    $('installBtn').classList.add('hidden');
  });
  $('ios-hint').classList.toggle('hidden', !(/iphone|ipad|ipod/i.test(navigator.userAgent) && !installed()));

  // Cada cuadro: qué se ve según la pantalla
  const ui = { touch: $('touch'), spec: $('tspec-name'), fatal: $('tfatal'), end: $('endbtns'), ok: $('end-ok'), menu: $('end-menu'),
    rotate: $('rotate-hint'), back: $('controls-back'), quit: $('controls-quit'), pause: $('tpause'), announcer: $('announcer') };
  const frame = () => {
    requestAnimationFrame(frame);
    const touch = isTouch();
    const fight = game.screen === 'fight' && game.fighters.length > 0;
    // al terminar la pelea mandan los botones de CONTINUAR / MENÚ
    ui.touch.classList.toggle('hidden', !(touch && fight && game.phase !== 'matchEnd'));
    // la pausa no tapa los letreros grandes (RONDA, K.O., ¡ACÁBALO!)
    ui.pause.style.visibility = ui.announcer.classList.contains('show') ? 'hidden' : '';
    if (!fight) joy.reset();
    const f = fight ? localFighter(game) : null;
    if (touch && f) { const s = f.specials[specialIndex(f)] || f.specials[0]; setText(ui.spec, s ? s.nombre : ''); }
    ui.fatal.classList.toggle('hidden', !(touch && f && game.phase === 'finish' && game.winner === f && f.fatality));
    const end = fight && game.phase === 'matchEnd' && game.phaseT > 120;
    ui.end.classList.toggle('hidden', !end);
    if (end) { const online = game.mode === 'online'; setText(ui.ok, online ? 'REVANCHA' : 'CONTINUAR'); setText(ui.menu, online ? 'SALIR' : 'MENÚ'); }
    ui.rotate.classList.toggle('hidden', !(touch && fight && innerHeight > innerWidth));
    setText(ui.back, game.paused ? 'SEGUIR' : '← VOLVER');
    ui.quit.classList.toggle('hidden', !game.paused);
  };
  requestAnimationFrame(frame);
}

// App instalable: el service worker guarda el juego para abrirlo sin internet.
// En la compu de desarrollo no se usa (para no ver archivos viejos), salvo con ?sw
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (local && !new URLSearchParams(location.search).has('sw')) return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
