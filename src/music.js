// Música sintetizada (sin archivos). Un secuenciador agenda las notas un poquito antes de que suenen,
// así no se atrasa aunque el juego tenga un tirón. Cada pista dice qué tocar en cada dieciseisavo;
// `nivel` agrega capas: 0 = tranquila (menú, presentación de la ronda), 1 = completa (la pelea),
// 2 = con todo (ronda final o poco tiempo). Al pasar de 0 a más, la pista "cae" con un platillo.
import { audioBus, audioHooks, volumes } from './audio.js';

const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const on = (pat, s) => pat[s % pat.length] !== '.';
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// 'C#5' → 73
const nm = (s) => { const m = /^([A-G])([#b]?)(\d)$/.exec(s); return NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12; };
// melodía: por compás, [paso, nota, duración en pasos]
const mel = (bars) => bars.map((b) => b.map(([s, n, l]) => [s, nm(n), l]));
const CH = { m: [0, 3, 7], M: [0, 4, 7] };
// las notas del acorde desde `lo` hacia arriba (así los acordes no brincan de octava)
const inRange = (root, q, lo, n) => {
  const pcs = CH[q].map((x) => (root + x) % 12), out = [];
  for (let m = lo; out.length < n; m++) if (pcs.includes(m % 12)) out.push(m);
  return out;
};

// ---------------------------------------------------------------- instrumentos
class Synth {
  constructor(c, out, noiseBuf, send) { this.c = c; this.out = out; this.nb = noiseBuf; this.send = send; }

  // volumen con forma: sube en `a`, se sostiene hasta `hold` (segundos desde t) y se apaga en `rel`
  amp(t, peak, a, hold, rel, dest = this.out) {
    const g = this.c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    if (hold > a) g.gain.setValueAtTime(peak, t + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(hold, a) + rel);
    g.connect(dest);
    return g;
  }
  osc(type, f, t, end, dest, detune = 0) {
    const o = this.c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    o.connect(dest); o.start(t); o.stop(end + 0.02);
    return o;
  }
  noise(t, end, dest) {
    const s = this.c.createBufferSource(); s.buffer = this.nb; s.loop = true;
    s.connect(dest); s.start(t, Math.random() * 1.5); s.stop(end + 0.02);
  }
  filt(type, f, q, dest) {
    const b = this.c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q;
    b.connect(dest);
    return b;
  }
  vibrato(t, end, rate, depth, delay) {
    const o = this.c.createOscillator(); o.frequency.value = rate;
    const g = this.c.createGain(); g.gain.setValueAtTime(0, t); g.gain.setValueAtTime(0, t + delay); g.gain.linearRampToValueAtTime(depth, t + delay + 0.3);
    o.connect(g); o.start(t); o.stop(end);
    return g;
  }

  // --- batería ---
  kick(t, v = 1) {
    const o = this.osc('sine', 150, t, t + 0.45, this.amp(t, 0.95 * v, 0.002, 0.02, 0.38));
    o.frequency.exponentialRampToValueAtTime(52, t + 0.09); o.frequency.exponentialRampToValueAtTime(40, t + 0.4);
    this.noise(t, t + 0.03, this.filt('highpass', 2500, 0.7, this.amp(t, 0.2 * v, 0.001, 0.003, 0.012)));
  }
  snare(t, v = 1) {
    this.noise(t, t + 0.25, this.filt('bandpass', 1900, 0.8, this.amp(t, 0.4 * v, 0.001, 0.01, 0.19)));
    this.noise(t, t + 0.18, this.filt('highpass', 5500, 0.7, this.amp(t, 0.18 * v, 0.001, 0.01, 0.13)));
    const o = this.osc('triangle', 210, t, t + 0.12, this.amp(t, 0.3 * v, 0.001, 0.01, 0.09));
    o.frequency.exponentialRampToValueAtTime(165, t + 0.08);
  }
  clap(t, v = 1) {
    const bp = (dest) => this.filt('bandpass', 1250, 1.1, dest);
    for (let k = 0; k < 3; k++) this.noise(t + k * 0.011, t + k * 0.011 + 0.03, bp(this.amp(t + k * 0.011, 0.34 * v, 0.001, 0.003, 0.022)));
    this.noise(t + 0.022, t + 0.25, bp(this.amp(t + 0.022, 0.38 * v, 0.002, 0.01, 0.17)));
  }
  hat(t, v = 1, open = false) {
    this.noise(t, t + (open ? 0.32 : 0.06), this.filt('highpass', 7600, 0.8, this.amp(t, 0.12 * v, 0.001, 0.004, open ? 0.26 : 0.04)));
  }
  crash(t, v = 1) {
    this.noise(t, t + 1.8, this.filt('highpass', 4200, 0.6, this.amp(t, 0.24 * v, 0.002, 0.01, 1.6)));
    this.noise(t, t + 0.9, this.filt('bandpass', 8000, 1.2, this.amp(t, 0.1 * v, 0.002, 0.01, 0.8)));
  }
  taiko(t, v = 1, f = 66) {
    const o = this.osc('sine', f * 1.7, t, t + 0.8, this.amp(t, 0.95 * v, 0.003, 0.02, 0.65));
    o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
    this.noise(t, t + 0.25, this.filt('lowpass', 420, 0.8, this.amp(t, 0.45 * v, 0.002, 0.01, 0.18)));
  }
  tom(t, f, v = 1) {
    const o = this.osc('sine', f * 1.4, t, t + 0.35, this.amp(t, 0.5 * v, 0.002, 0.01, 0.26));
    o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
    this.noise(t, t + 0.05, this.filt('bandpass', f * 4, 1.5, this.amp(t, 0.1 * v, 0.001, 0.003, 0.03)));
  }
  rim(t, v = 1) {
    this.osc('triangle', 1750, t, t + 0.05, this.amp(t, 0.16 * v, 0.001, 0.003, 0.03));
    this.noise(t, t + 0.05, this.filt('bandpass', 2600, 4, this.amp(t, 0.15 * v, 0.001, 0.003, 0.03)));
  }
  cowbell(t, v = 1) {
    const bp = this.filt('bandpass', 900, 2.2, this.amp(t, 0.14 * v, 0.001, 0.01, 0.22));
    this.osc('square', 565, t, t + 0.3, bp); this.osc('square', 845, t, t + 0.3, bp);
  }
  // güiro de cumbia: raspado largo (varios dientes) o cortito
  guiro(t, v = 1, long = false) {
    const n = long ? 7 : 3, st = long ? 0.024 : 0.018;
    const g = this.c.createGain(); g.gain.setValueAtTime(0, t);
    for (let i = 0; i < n; i++) { g.gain.setValueAtTime(0.2 * v, t + i * st); g.gain.linearRampToValueAtTime(0.03 * v, t + (i + 0.85) * st); }
    g.gain.linearRampToValueAtTime(0, t + n * st + 0.01);
    g.connect(this.out);
    this.noise(t, t + n * st + 0.02, this.filt('bandpass', 3800, 2.5, g));
  }
  shaker(t, v = 1) { this.noise(t, t + 0.08, this.filt('highpass', 6500, 0.8, this.amp(t, 0.08 * v, 0.012, 0.015, 0.05))); }
  timpani(t, m, v = 1) {
    const f = hz(m);
    const o = this.osc('sine', f * 1.08, t, t + 1.4, this.amp(t, 0.65 * v, 0.003, 0.02, 1.1));
    o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    this.osc('sine', f * 1.5, t, t + 0.8, this.amp(t, 0.14 * v, 0.003, 0.01, 0.5));
    this.noise(t, t + 0.3, this.filt('lowpass', 500, 0.8, this.amp(t, 0.3 * v, 0.002, 0.01, 0.22)));
  }

  // --- con nota ---
  bass(t, m, dur, v = 1, bright = 1) {
    const f = hz(m);
    const g = this.amp(t, 0.36 * v, 0.004, Math.max(0.01, dur - 0.04), 0.07);
    const lp = this.filt('lowpass', 160, 5, g);
    lp.frequency.setValueAtTime(160, t);
    lp.frequency.exponentialRampToValueAtTime(220 + 1500 * bright, t + 0.012);
    lp.frequency.exponentialRampToValueAtTime(260 + 300 * bright, t + 0.2);
    this.osc('sawtooth', f, t, t + dur + 0.1, lp);
    const sub = this.c.createGain(); sub.gain.value = 0.6; sub.connect(g);
    this.osc('sine', f, t, t + dur + 0.1, sub);
  }
  pluck(t, m, dur, v = 1, type = 'square', cutoff = 2600) {
    const g = this.amp(t, 0.11 * v, 0.003, 0.01, Math.min(0.45, dur + 0.15));
    const lp = this.filt('lowpass', cutoff, 2, g);
    lp.frequency.setValueAtTime(cutoff, t); lp.frequency.exponentialRampToValueAtTime(Math.max(300, cutoff * 0.18), t + 0.22);
    this.osc(type, hz(m), t, t + dur + 0.5, lp);
    g.connect(this.send);
  }
  // melodía principal: dos sierras desafinadas, una cuadrada una octava abajo y vibrato que entra después
  lead(t, m, dur, v = 1) {
    const f = hz(m), end = t + dur + 0.3;
    const g = this.amp(t, 0.1 * v, 0.015, Math.max(0.03, dur - 0.03), 0.14);
    const lp = this.filt('lowpass', 2600, 1.2, g);
    const vib = this.vibrato(t, end, 5.6, 14, 0.18);
    for (const d of [-8, 8]) vib.connect(this.osc('sawtooth', f, t, end, lp, d).detune);
    vib.connect(this.osc('square', f / 2, t, end, this.amp(t, 0.03 * v, 0.02, Math.max(0.03, dur - 0.03), 0.12)).detune);
    g.connect(this.send);
  }
  pad(t, ms, dur, v = 1, cutoff = 1300) {
    const g = this.amp(t, 0.04 * v, Math.min(0.5, dur * 0.3), Math.max(0.5, dur - 0.2), 0.8);
    const lp = this.filt('lowpass', cutoff * 0.6, 0.7, g);
    lp.frequency.setValueAtTime(cutoff * 0.6, t); lp.frequency.linearRampToValueAtTime(cutoff, t + dur * 0.6);
    for (const m of ms) for (const d of [-11, 11]) this.osc('sawtooth', hz(m), t, t + dur + 1, lp, d);
  }
  // acorde de metales: el filtro se abre de golpe y se cierra
  stab(t, ms, dur, v = 1) {
    const g = this.amp(t, 0.05 * v, 0.008, Math.max(0.02, dur - 0.03), 0.09);
    const lp = this.filt('lowpass', 500, 2, g);
    lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(3200, t + 0.03); lp.frequency.exponentialRampToValueAtTime(900, t + 0.25);
    for (const m of ms) for (const d of [-6, 6]) this.osc('sawtooth', hz(m), t, t + dur + 0.15, lp, d);
  }
  // teclado de cumbia: acordes cortitos en el contratiempo
  organ(t, ms, dur, v = 1) {
    const lp = this.filt('lowpass', 2400, 0.7, this.amp(t, 0.045 * v, 0.004, Math.max(0.02, dur - 0.02), 0.05));
    for (const m of ms) { this.osc('square', hz(m), t, t + dur + 0.1, lp); this.osc('sine', hz(m + 12), t, t + dur + 0.1, lp); }
  }
  accordion(t, m, dur, v = 1) {
    const f = hz(m), end = t + dur + 0.2;
    const g = this.amp(t, 0.075 * v, 0.02, Math.max(0.03, dur - 0.02), 0.06);
    const trem = this.c.createGain(); trem.gain.value = 1; trem.connect(g);
    const lfo = this.c.createOscillator(); lfo.frequency.value = 6.2;
    const lg = this.c.createGain(); lg.gain.value = 0.28;
    lfo.connect(lg); lg.connect(trem.gain); lfo.start(t); lfo.stop(end);
    const lp = this.filt('lowpass', 2600, 0.9, trem);
    this.osc('square', f, t, end, lp, -7); this.osc('square', f, t, end, lp, 7); this.osc('sawtooth', f * 2, t, end, lp);
    g.connect(this.send);
  }
  koto(t, m, dur, v = 1) {
    const f = hz(m);
    const g = this.amp(t, 0.14 * v, 0.002, 0.005, Math.min(0.9, dur + 0.4));
    const o = this.osc('triangle', f * 1.02, t, t + 1.4, this.filt('lowpass', 3200, 1, g));
    o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
    this.osc('sine', f * 2, t, t + 0.8, this.amp(t, 0.035 * v, 0.002, 0.005, 0.3));
    g.connect(this.send);
  }
  // flauta de bambú: seno con aire y vibrato lento
  flute(t, m, dur, v = 1) {
    const f = hz(m), end = t + dur + 0.3, hold = Math.max(0.08, dur - 0.05);
    const g = this.amp(t, 0.09 * v, 0.06, hold, 0.18);
    const vib = this.vibrato(t, end, 5, 18, 0.25);
    vib.connect(this.osc('sine', f, t, end, g).detune);
    this.osc('triangle', f * 2, t, end, this.amp(t, 0.012 * v, 0.06, hold, 0.15));
    this.noise(t, end, this.filt('bandpass', f * 2, 3, this.amp(t, 0.03 * v, 0.04, hold, 0.1)));
    g.connect(this.send);
  }
  strings(t, ms, dur, v = 1, tremolo = 0) {
    const g = this.amp(t, 0.045 * v, 0.25, Math.max(0.3, dur - 0.1), 0.5);
    let dest = g;
    if (tremolo) {
      const tg = this.c.createGain(); tg.gain.value = 0.6; tg.connect(g);
      const lfo = this.c.createOscillator(); lfo.frequency.value = tremolo;
      const lg = this.c.createGain(); lg.gain.value = 0.4;
      lfo.connect(lg); lg.connect(tg.gain); lfo.start(t); lfo.stop(t + dur + 0.6);
      dest = tg;
    }
    const lp = this.filt('lowpass', 2200, 0.6, dest);
    for (const m of ms) for (const d of [-9, 9]) this.osc('sawtooth', hz(m), t, t + dur + 0.6, lp, d);
  }
}

// ---------------------------------------------------------------- pistas (todas originales)
const ARP = [0, 1, 2, 3, 2, 1, 2, 4, 0, 1, 2, 3, 2, 1, 3, 4];
const play = (S, list, s, t, d, fn) => { for (const [st, m, len] of list) if (st === s) fn.call(S, t, m, len * d, 1); };

// Menú: tema épico en La menor
const MENU_P = [[45, 'm'], [41, 'M'], [48, 'M'], [43, 'M'], [45, 'm'], [41, 'M'], [43, 'M'], [40, 'M']];
const MENU_M = mel([
  [[0, 'E5', 6], [6, 'D5', 2], [8, 'C5', 4], [12, 'B4', 2], [14, 'C5', 2]],
  [[0, 'A4', 8], [8, 'C5', 4], [12, 'F5', 4]],
  [[0, 'E5', 6], [6, 'G5', 2], [8, 'E5', 4], [12, 'D5', 2], [14, 'C5', 2]],
  [[0, 'D5', 12], [12, 'B4', 4]],
  [[0, 'E5', 4], [4, 'A5', 4], [8, 'G5', 2], [10, 'F5', 2], [12, 'E5', 4]],
  [[0, 'F5', 4], [4, 'E5', 2], [6, 'D5', 2], [8, 'C5', 4], [12, 'A4', 4]],
  [[0, 'B4', 4], [4, 'D5', 4], [8, 'G5', 4], [12, 'F5', 4]],
  [[0, 'G#5', 8], [8, 'B5', 4], [12, 'E5', 4]],
]);

// SIX (Cruz de Piedra): electrónica rápida en Re menor
const SIX_P = [[38, 'm'], [38, 'm'], [34, 'M'], [36, 'M'], [38, 'm'], [38, 'm'], [43, 'm'], [45, 'M']];
const SIX_M = mel([
  [[0, 'D5', 2], [2, 'F5', 2], [4, 'A5', 2], [6, 'G5', 2], [8, 'F5', 2], [10, 'E5', 2], [12, 'D5', 4]],
  [[0, 'A4', 3], [3, 'D5', 3], [6, 'F5', 2], [8, 'E5', 4], [12, 'C5', 4]],
  [[0, 'D5', 2], [2, 'F5', 2], [4, 'Bb5', 4], [8, 'A5', 2], [10, 'G5', 2], [12, 'F5', 4]],
  [[0, 'E5', 2], [2, 'G5', 2], [4, 'C6', 4], [8, 'Bb5', 2], [10, 'A5', 2], [12, 'G5', 4]],
  [[0, 'D5', 2], [2, 'F5', 2], [4, 'A5', 2], [6, 'G5', 2], [8, 'F5', 2], [10, 'E5', 2], [12, 'D5', 4]],
  [[0, 'A5', 3], [3, 'G5', 3], [6, 'F5', 2], [8, 'E5', 2], [10, 'F5', 2], [12, 'D5', 4]],
  [[0, 'G5', 2], [2, 'Bb5', 2], [4, 'D6', 4], [8, 'C6', 2], [10, 'Bb5', 2], [12, 'A5', 4]],
  [[0, 'C#6', 4], [4, 'A5', 4], [8, 'E5', 4], [12, 'C#5', 4]],
]);

// La Cabaña: cumbia con güiro, acordeón y el teclado en el contratiempo
const CAB_P = [[33, 'm'], [33, 'm'], [38, 'm'], [38, 'm'], [40, 'M'], [40, 'M'], [33, 'm'], [33, 'm']];
const CAB_M = mel([
  [[0, 'E5', 2], [2, 'E5', 2], [4, 'A5', 2], [6, 'G5', 1], [7, 'F5', 1], [8, 'E5', 4], [12, 'C5', 2], [14, 'D5', 2]],
  [[0, 'E5', 6], [6, 'C5', 2], [8, 'B4', 2], [10, 'C5', 2], [12, 'A4', 4]],
  [[0, 'D5', 2], [2, 'F5', 2], [4, 'A5', 2], [6, 'G5', 1], [7, 'F5', 1], [8, 'E5', 2], [10, 'F5', 2], [12, 'D5', 4]],
  [[0, 'A5', 6], [6, 'F5', 2], [8, 'D5', 4], [12, 'F5', 4]],
  [[0, 'E5', 2], [2, 'G#5', 2], [4, 'B5', 2], [6, 'A5', 1], [7, 'G#5', 1], [8, 'E5', 2], [10, 'D5', 2], [12, 'B4', 4]],
  [[0, 'G#5', 6], [6, 'F5', 2], [8, 'E5', 2], [10, 'D5', 2], [12, 'B4', 4]],
  [[0, 'C5', 2], [2, 'E5', 2], [4, 'A5', 2], [6, 'C6', 2], [8, 'B5', 2], [10, 'A5', 2], [12, 'E5', 4]],
  [[0, 'A5', 4], [4, 'E5', 2], [6, 'C5', 2], [8, 'A4', 8]],
]);

// Casa Chuy (de noche): synthwave para ir en el Camaro
const CHUY_P = [[40, 'm'], [36, 'M'], [43, 'M'], [38, 'M'], [40, 'm'], [36, 'M'], [45, 'm'], [47, 'M']];
const CHUY_M = mel([
  [[0, 'B4', 8], [8, 'E5', 4], [12, 'F#5', 4]],
  [[0, 'G5', 12], [12, 'E5', 4]],
  [[0, 'D5', 8], [8, 'B4', 4], [12, 'D5', 4]],
  [[0, 'F#5', 8], [8, 'A5', 4], [12, 'F#5', 4]],
  [[0, 'G5', 6], [6, 'F#5', 2], [8, 'E5', 8]],
  [[0, 'E5', 4], [4, 'G5', 4], [8, 'C6', 8]],
  [[0, 'C6', 4], [4, 'B5', 4], [8, 'A5', 4], [12, 'G5', 4]],
  [[0, 'F#5', 8], [8, 'D#5', 8]],
]);

// Templo: tambores taiko, koto y flauta
const TEM_P = [[38, 'm'], [38, 'm'], [34, 'M'], [36, 'M'], [38, 'm'], [38, 'm'], [34, 'M'], [33, 'M']];
const TEM_M = mel([
  [[0, 'A5', 8], [8, 'G5', 4], [12, 'F5', 4]],
  [[0, 'D5', 12], [12, 'C5', 4]],
  [[0, 'D5', 4], [4, 'F5', 4], [8, 'G5', 8]],
  [[0, 'A5', 4], [4, 'C6', 4], [8, 'A5', 4], [12, 'G5', 4]],
  [[0, 'A5', 8], [8, 'D6', 8]],
  [[0, 'C6', 4], [4, 'A5', 4], [8, 'G5', 4], [12, 'F5', 4]],
  [[0, 'G5', 8], [8, 'F5', 4], [12, 'D5', 4]],
  [[0, 'E5', 8], [8, 'C#5', 8]],
]);

const VIC_M = mel([
  [[0, 'G4', 2], [2, 'G4', 2], [4, 'G4', 2], [6, 'C5', 10]],
  [[0, 'Eb5', 6], [6, 'D5', 2], [8, 'F5', 8]],
  [[0, 'G5', 14]],
]);

export const TRACKS = {
  menu: { bpm: 94, bars: 8, play(S, bar, s, t, d, lvl) {
    const [r, q] = MENU_P[bar];
    if (s === 0) { S.pad(t, inRange(r, q, 55, 3), d * 16, 1); S.bass(t, r - 12, lvl ? d * 3 : d * 15, 0.8, 0.25); S.taiko(t, lvl ? 1 : 0.55, 62); }
    S.pluck(t, inRange(r, q, 64, 5)[ARP[s]], d, s % 4 === 0 ? 0.9 : 0.6, 'square', lvl ? 2600 : 1700);
    if (!lvl) return;
    if (on('......x...x.x...', s)) S.taiko(t, 0.55, 74);
    if (s === 4 || s === 12) S.snare(t, 0.5);
    if (s % 2 === 0) S.hat(t, s % 4 ? 0.35 : 0.55);
    if (on('......x.x.....x.', s)) S.bass(t, r - 12 + (s === 14 ? 12 : 0), d * 1.5, 0.7, 0.4);
    play(S, MENU_M[bar], s, t, d, S.lead);
  } },

  six: { bpm: 140, bars: 8, play(S, bar, s, t, d, lvl) {
    const [r, q] = SIX_P[bar];
    if (lvl === 0) {   // presentación de la ronda: tensión
      if (s === 0) { S.pad(t, inRange(r, q, 57, 3), d * 16, 1.1, 1600); S.taiko(t, 0.7, 58); }
      if (s % 2 === 0) S.bass(t, r, d * 1.5, 0.7, 0.35);
      S.hat(t, 0.15 + s / 16 * 0.35);
      return;
    }
    const fill = bar % 4 === 3;
    if (on(fill ? 'x...x...x...x.x.' : 'x...x...x...x...', s)) S.kick(t);
    if (s === 4 || s === 12) S.clap(t, 0.85);
    if (fill && s >= 12) S.snare(t, 0.25 + (s - 12) * 0.15);
    S.hat(t, s % 2 ? 0.22 : 0.45);
    if (lvl >= 2 && s % 4 === 2) S.hat(t, 0.45, true);
    if (s === 0 && lvl >= 2 && bar === 4) S.crash(t, 0.6);
    if (on('x.xxx.xxx.xxx.xx', s)) S.bass(t, r + (s % 4 === 3 || s === 14 ? 12 : 0), d * 0.9, 0.8, 0.9);
    if (on('x..x..x...x..x..', s)) S.stab(t, inRange(r, q, 62, 3), d * 1.3, 0.85);
    if (lvl >= 2 || bar >= 4) play(S, SIX_M[bar], s, t, d, S.lead);
  } },

  cabana: { bpm: 100, bars: 8, play(S, bar, s, t, d, lvl) {
    const [r, q] = CAB_P[bar];
    if (s % 4 === 0) S.guiro(t, 0.9, true); else if (s % 4 >= 2) S.guiro(t, 0.6, false);
    if (s === 0 || s === 8) S.bass(t, r, d * 3.5, 0.9, 0.35);
    if (s === 4 || s === 12) S.bass(t, r + 7, d * 3.5, 0.75, 0.35);
    if (s % 4 === 2) S.organ(t, inRange(r, q, 60, 3), d * 0.9, lvl ? 1 : 0.8);
    if (!lvl) return;
    if (s === 0 || s === 8) S.kick(t, 0.55);
    if (s === 4 || s === 12) S.rim(t, 0.7);
    if (s === 6 || s === 14) S.tom(t, 300, 0.5);
    if (s === 7 || s === 15) S.tom(t, 220, 0.6);
    if (s % 4 === 2) S.cowbell(t, 0.45);
    if (lvl >= 2) S.shaker(t, s % 2 ? 0.5 : 0.8);
    if (s === 0 && bar === 0 && lvl >= 2) S.crash(t, 0.4);
    play(S, CAB_M[bar], s, t, d, S.accordion);
  } },

  casachuy: { bpm: 112, bars: 8, play(S, bar, s, t, d, lvl) {
    const [r, q] = CHUY_P[bar];
    if (s === 0) S.pad(t, inRange(r, q, 55, 4), d * 16, 1.1, 1500);
    if (s % 2 === 0) S.bass(t, r + (s % 4 === 2 ? 12 : 0), d * 1.8, 0.75, 0.5);
    S.pluck(t, inRange(r, q, 64, 4)[s % 4] + (s >= 8 ? 12 : 0), d, 0.45, 'sawtooth', 2000);
    if (!lvl) { if (s === 0) S.kick(t, 0.6); return; }
    if (s === 0 || s === 8 || (bar % 2 && s === 10)) S.kick(t, 0.9);
    if (s === 4 || s === 12) { S.snare(t, 0.8); S.clap(t, 0.35); }
    if (s % 2 === 0) S.hat(t, s % 4 ? 0.4 : 0.25);
    if (lvl >= 2 && s % 2) S.hat(t, 0.15);
    if (lvl >= 2 || bar >= 4) play(S, CHUY_M[bar], s, t, d, S.lead);
  } },

  templo: { bpm: 104, bars: 8, play(S, bar, s, t, d, lvl) {
    const [r, q] = TEM_P[bar];
    if (s === 0) { S.strings(t, inRange(r, q, 57, 3), d * 16, 1); S.bass(t, r, d * 14, 0.6, 0.15); S.taiko(t, 1, 60); }
    if (s % 2 === 0) S.koto(t, inRange(r, q, 62, 4)[[0, 2, 1, 3, 2, 1, 3, 2][s / 2]], d * 2, s % 4 ? 0.6 : 0.9);
    if (!lvl) { if (s === 8) S.taiko(t, 0.5, 72); return; }
    if (on('......x...x.....', s)) S.taiko(t, 0.8, 66);
    if (s % 2 === 0) S.tom(t, 340, s % 4 ? 0.25 : 0.4);
    if (bar === 7 && s >= 12) S.taiko(t, 0.5 + (s - 12) * 0.15, 70);
    if (lvl >= 2 && s % 4 === 2) S.shaker(t, 0.7);
    if (lvl >= 2 || bar >= 4) play(S, TEM_M[bar], s, t, d, S.flute);
  } },

  // ¡ACÁBALO! y la fatality: latido, timbal y cuerdas temblando
  tension: { bpm: 120, bars: 2, play(S, bar, s, t, d) {
    if (s === 0 && bar === 0) { S.strings(t, [74, 75], d * 32, 0.6, 12); S.strings(t, [38, 45], d * 32, 0.9); }
    if (s === 0) S.timpani(t, 38, 0.9);
    if (s === 0 || s === 3) S.kick(t, s ? 0.55 : 0.85);
    if (s % 2 === 0) S.bass(t, bar === 1 && s === 14 ? 39 : 38, d * 1.5, 0.5, 0.2);
  } },

  // el que gana: fanfarria de metales (una sola vez)
  victoria: { bpm: 132, bars: 3, once: true, play(S, bar, s, t, d) {
    const C = [60, 64, 67, 72], Ab = [56, 60, 63, 68], Bb = [58, 62, 65, 70];
    if (bar === 0 && (s === 0 || s === 2 || s === 4)) { S.stab(t, C, d * 1.4, 1.1); S.timpani(t, 43, 0.45); }
    if (bar === 0 && s === 6) { S.stab(t, C, d * 9, 1.1); S.timpani(t, 48, 0.8); S.crash(t, 0.5); }
    if (bar === 1 && s === 0) { S.stab(t, Ab, d * 7.5, 1.1); S.timpani(t, 44, 0.8); }
    if (bar === 1 && s === 8) { S.stab(t, Bb, d * 7.5, 1.1); S.timpani(t, 46, 0.8); }
    if (bar === 1 && s >= 12) S.timpani(t, 48, 0.2 + (s - 12) * 0.08);
    if (bar === 2 && s === 0) { S.stab(t, C, d * 14, 1.2); S.strings(t, [48, 55, 64, 72], d * 14, 1.2); S.crash(t, 0.8); S.timpani(t, 48, 1); }
    play(S, VIC_M[bar], s, t, d, S.lead);
  } },
};

// ---------------------------------------------------------------- reproductor
class Player {
  constructor(eng, track, level) {
    const c = eng.ctx;
    this.c = c; this.track = track; this.level = level;
    this.out = c.createGain(); this.out.gain.value = 0.0001; this.out.connect(eng.input);
    this.out.gain.setTargetAtTime(1, c.currentTime, 0.08);
    // eco rítmico (un dieciseisavo con puntillo) para las melodías y los arpegios
    const beat = 60 / track.bpm;
    const dl = c.createDelay(1.5); dl.delayTime.value = beat * 0.75;
    const fb = c.createGain(); fb.gain.value = 0.32;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    const wet = c.createGain(); wet.gain.value = 0.3;
    const send = c.createGain();
    send.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(wet); wet.connect(this.out);
    this.nodes = [dl, fb, lp, wet, send];
    this.syn = new Synth(c, this.out, eng.noise, send);
    this.sd = beat / 4; this.bar = 0; this.step = 0; this.next = c.currentTime + 0.08;
  }
  schedule(until) {
    while (!this.done && this.next < until) {
      if (this.drop) { this.drop = false; this.bar = 0; this.step = 0; this.syn.crash(this.next, 0.8); }
      try { this.track.play(this.syn, this.bar, this.step, this.next, this.sd, this.level); } catch (e) { console.warn(e); }
      this.next += this.sd;
      if (++this.step === 16) {
        this.step = 0;
        if (++this.bar === this.track.bars) { this.bar = 0; if (this.track.once) this.done = true; }
      }
    }
  }
  stop(fade) {
    const t = this.c.currentTime, g = this.out.gain;
    this.done = true;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + fade);
    setTimeout(() => { this.out.disconnect(); for (const n of this.nodes) n.disconnect(); }, (fade + 4) * 1000);
  }
}

class Music {
  constructor() { this.id = null; this.cur = null; this.ctx = null; this.muffled = false; }

  init() {
    const b = audioBus();
    if (!b) return false;
    const c = this.ctx = b.ctx;
    this.noise = b.noiseBuf;
    this.input = c.createGain();
    this.filter = c.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 20000; this.filter.Q.value = 0.7;
    this.duckG = c.createGain();
    this.input.connect(this.filter); this.filter.connect(this.duckG); this.duckG.connect(b.musicBus);
    audioHooks.onAnnounce = () => this.duck(0.5, 1.4);   // el narrador se oye por encima
    setInterval(() => this.tick(), 25);
    return true;
  }

  tick() {
    const p = this.cur, c = this.ctx;
    if (!p || c.state !== 'running') return;
    // con la pestaña escondida los temporizadores se atrasan: mejor no agendar y seguir al volver;
    // con la música en 0 tampoco (en el celular ahorra trabajo)
    if (document.hidden || volumes.musica <= 0) { p.next = Math.max(p.next, c.currentTime + 0.05); return; }
    p.schedule(c.currentTime + 0.14);
  }

  // id = null: silencio
  set(id, level = 0) {
    if (!this.ctx && !this.init()) return;
    if (id === this.id) {
      const p = this.cur;
      if (p && level !== p.level) { if (p.level === 0 && level > 0) p.drop = true; p.level = level; }
      return;
    }
    this.id = id;
    this.cur?.stop(id ? 0.7 : 1.4);
    this.cur = id && TRACKS[id] ? new Player(this, TRACKS[id], level) : null;
  }

  // pausa o cámara lenta: la música se oye como detrás de una puerta
  muffle(on) {
    if (!this.ctx || this.muffled === on) return;
    this.muffled = on;
    this.filter.frequency.setTargetAtTime(on ? 650 : 20000, this.ctx.currentTime, on ? 0.06 : 0.25);
  }

  duck(level, sec) {
    if (!this.ctx) return;
    const g = this.duckG.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setTargetAtTime(level, t, 0.04); g.setTargetAtTime(1, t + sec, 0.35);
  }
}

export const music = new Music();
