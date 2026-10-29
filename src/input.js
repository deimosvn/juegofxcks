// Teclado + mandos + búfer de movimientos (para especiales tipo ← → + P)

const keys = new Set();
const pressedOnce = new Set();
const BLOCK_DEFAULT = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'];

window.addEventListener('keydown', (e) => {
  if (BLOCK_DEFAULT.includes(e.code)) e.preventDefault();
  if (!keys.has(e.code)) pressedOnce.add(e.code);
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

// Botones en pantalla (celular): aprietan las mismas teclas que el teclado, así sirven en
// menús, en la pelea y en línea sin cambiar nada más
export function setVirtualKey(code, down) {
  if (down) { if (!keys.has(code)) pressedOnce.add(code); keys.add(code); }
  else keys.delete(code);
}

// Teclas pulsadas desde el último consumo (para menús)
export function consumeKey(...codes) {
  for (const c of codes) if (pressedOnce.has(c)) { pressedOnce.delete(c); return true; }
  return false;
}
export function clearKeyEdges() { pressedOnce.clear(); }

export const KEYMAPS = [
  { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], punch: ['KeyF'], kick: ['KeyG'], block: ['KeyH'], special: ['KeyR'] },
  { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
    punch: ['KeyK', 'Numpad1'], kick: ['KeyL', 'Numpad2'], block: ['Semicolon', 'Numpad3'], special: ['KeyI', 'Numpad0'] },
];

const BUTTONS = ['left', 'right', 'up', 'down', 'punch', 'kick', 'block', 'special'];

// En línea las entradas viajan como un byte: un bit por botón
export function encodeMask(h) {
  let m = 0;
  for (let i = 0; i < BUTTONS.length; i++) if (h[BUTTONS[i]]) m |= 1 << i;
  return m;
}
export function decodeMask(m, out = {}) {
  for (let i = 0; i < BUTTONS.length; i++) out[BUTTONS[i]] = !!(m & (1 << i));
  return out;
}
// En línea cada jugador puede usar cualquiera de los dos juegos de teclas o cualquier mando
export function readLocalMask() {
  const h = {};
  for (const k of BUTTONS) h[k] = KEYMAPS.some((map) => map[k].some((c) => keys.has(c)));
  for (let i = 0; i < 4; i++) {
    const pad = readPad(i);
    if (pad) for (const k of BUTTONS) h[k] = h[k] || pad[k];
  }
  return encodeMask(h);
}

function readPad(index) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const p = pads && pads[index];
  if (!p) return null;
  const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
  const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
  return {
    left: b(14) || ax < -0.5, right: b(15) || ax > 0.5,
    up: b(12) || ay < -0.6, down: b(13) || ay > 0.6,
    punch: b(2) || b(5), kick: b(0) || b(7), block: b(1) || b(4) || b(6), special: b(3),
  };
}

// Parsea '← → + P' -> { seq: ['B','F'], btn: 'punch' }
export function parseInput(str) {
  if (!str) return null;
  const [dirs, btn] = str.replace(/\s+/g, '').split('+');
  const map = { '→': 'F', '←': 'B', '↓': 'D', '↑': 'U' };
  const seq = [...dirs].map((c) => map[c]).filter(Boolean);
  const b = btn ? ({ P: 'punch', K: 'kick', E: 'special', B: 'block' })[btn.toUpperCase()] : null;
  return { seq, btn: b };
}

export class PlayerInput {
  constructor(playerIndex) {
    this.map = KEYMAPS[playerIndex];
    this.padIndex = playerIndex;
    this.virtual = null;          // la CPU escribe aquí { left: true, ... }
    this.held = {}; this.prev = {}; this.pressed = {};
    this.buffer = [];             // [{ d: 'F'|'B'|'D'|'U', f: frame }]
    this.newDir = false;
  }

  update(frame, facing) {
    this.prev = this.held;
    const h = {};
    if (this.virtual) {
      for (const k of BUTTONS) h[k] = !!this.virtual[k];
    } else {
      const pad = readPad(this.padIndex);
      for (const k of BUTTONS) h[k] = this.map[k].some((c) => keys.has(c)) || !!(pad && pad[k]);
    }
    this.held = h;
    for (const k of BUTTONS) this.pressed[k] = h[k] && !this.prev[k];

    // Direcciones relativas a hacia dónde mira
    this.newDir = false;
    const fwd = facing > 0 ? 'right' : 'left', back = facing > 0 ? 'left' : 'right';
    const push = (d) => { this.buffer.push({ d, f: frame }); this.newDir = true; };
    if (this.pressed.down) push('D');
    if (this.pressed.up) push('U');
    if (this.pressed[fwd]) push('F');
    if (this.pressed[back]) push('B');
    while (this.buffer.length && frame - this.buffer[0].f > 40) this.buffer.shift();
  }

  // ¿Se marcó la secuencia en los últimos `window` frames?
  matchMotion(seq, frame, window = 26) {
    if (!seq.length) return true;
    let i = seq.length - 1;
    for (let j = this.buffer.length - 1; j >= 0 && i >= 0; j--) {
      const e = this.buffer[j];
      if (frame - e.f > window) break;
      if (e.d === seq[i]) i--;
    }
    return i < 0;
  }

  clearBuffer() { this.buffer.length = 0; }

  serialize() {
    return { held: { ...this.held }, prev: { ...this.prev }, pressed: { ...this.pressed }, buffer: this.buffer.map((e) => ({ ...e })), newDir: this.newDir };
  }
  deserialize(o) {
    this.held = { ...o.held }; this.prev = { ...o.prev }; this.pressed = { ...o.pressed };
    this.buffer = o.buffer.map((e) => ({ ...e })); this.newDir = o.newDir;
  }

  forward(facing) { return facing > 0 ? this.held.right : this.held.left; }
  back(facing) { return facing > 0 ? this.held.left : this.held.right; }
}
