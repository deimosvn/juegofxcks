// Sonidos sintetizados (sin archivos) + narrador con la voz del navegador.
// Si luego quieres sonidos reales, pon .mp3 en assets/sonidos/ y cámbialos aquí.

let ctx = null;
let master = null;
let noiseBuf = null;
export let voiceEnabled = true;

export function setVoice(v) { voiceEnabled = v; }

export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function noise(dur, freq, q = 1, gain = 1, type = 'lowpass', sweepTo = null) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur);
}

function tone(freq, dur, type = 'sine', gain = 0.5, slideTo = null) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur);
}

export const sfx = {
  whoosh: () => noise(0.15, 900, 0.8, 0.25, 'bandpass', 2600),
  hit: (strong) => { noise(strong ? 0.22 : 0.12, strong ? 700 : 1200, 1, strong ? 1.1 : 0.8); tone(strong ? 90 : 140, 0.15, 'sine', 0.7, 40); },
  block: () => { noise(0.08, 3000, 4, 0.5, 'bandpass'); tone(900, 0.05, 'square', 0.12); },
  jump: () => noise(0.12, 500, 1, 0.15, 'lowpass', 1500),
  land: () => noise(0.12, 300, 1, 0.35),
  fall: () => { noise(0.4, 250, 1, 0.9); tone(60, 0.4, 'sine', 0.8, 30); },
  fire: () => { noise(0.5, 400, 0.6, 0.6, 'lowpass', 2000); tone(200, 0.4, 'sawtooth', 0.12, 80); },
  ice: () => { tone(1800, 0.3, 'triangle', 0.2, 600); noise(0.3, 6000, 2, 0.25, 'highpass'); },
  zap: () => { noise(0.35, 4000, 0.4, 0.6, 'highpass'); tone(120, 0.3, 'square', 0.18, 60); },
  magic: () => { tone(300, 0.5, 'sine', 0.25, 1200); tone(450, 0.5, 'triangle', 0.15, 1800); },
  boom: () => { noise(0.9, 200, 0.7, 1.2); tone(55, 0.9, 'sine', 1, 25); },
  chain: () => { for (let i = 0; i < 4; i++) setTimeout(() => noise(0.04, 5000, 6, 0.3, 'bandpass'), i * 30); },
  teleport: () => tone(200, 0.35, 'sine', 0.3, 1600),
  select: () => tone(660, 0.08, 'square', 0.12),
  confirm: () => { tone(440, 0.1, 'square', 0.15); setTimeout(() => tone(880, 0.15, 'square', 0.15), 80); },
  shatter: () => { for (let i = 0; i < 6; i++) setTimeout(() => noise(0.15, 5000 + Math.random() * 3000, 3, 0.4, 'bandpass'), i * 25); },
  // --- robot ---
  servo: () => { for (let i = 0; i < 3; i++) setTimeout(() => tone(320 + i * 140, 0.07, 'square', 0.1, 520 + i * 140), i * 70); },
  rocket: () => { noise(0.7, 600, 0.7, 0.7, 'lowpass', 2400); tone(90, 0.6, 'sawtooth', 0.25, 160); },
  charge: () => tone(180, 0.25, 'sawtooth', 0.12, 900),
  laser: () => { tone(1400, 0.45, 'sawtooth', 0.12, 1100); tone(700, 0.45, 'square', 0.08, 560); noise(0.45, 5000, 2, 0.12, 'bandpass'); },
  missile: () => { noise(0.25, 900, 1, 0.45, 'bandpass', 3000); tone(300, 0.2, 'triangle', 0.15, 700); },
  smallBoom: () => { noise(0.45, 400, 0.7, 0.8); tone(70, 0.4, 'sine', 0.6, 35); },
  armor: () => { tone(220, 0.5, 'square', 0.15, 880); setTimeout(() => { noise(0.08, 3500, 6, 0.4, 'bandpass'); tone(1200, 0.12, 'triangle', 0.2); }, 380); },
  clank: () => { noise(0.07, 4200, 8, 0.6, 'bandpass'); tone(1500, 0.09, 'triangle', 0.25, 1200); },
  // Diego se pone el traje: motor que sube, placas que se cierran y el encendido
  transform: () => {
    tone(110, 0.8, 'sawtooth', 0.15, 440);
    for (let i = 0; i < 5; i++) setTimeout(() => { noise(0.06, 3800, 7, 0.45, 'bandpass'); tone(700 + i * 160, 0.08, 'square', 0.1); }, 100 + i * 85);
    setTimeout(() => { tone(880, 0.4, 'triangle', 0.2, 1760); tone(440, 0.4, 'square', 0.08, 880); }, 560);
  },
  // Alan y su Camaro: claxon, motor, rechinido de llantas y el atropellón
  honk: () => { tone(392, 0.2, 'square', 0.14); tone(494, 0.2, 'square', 0.1); setTimeout(() => { tone(392, 0.32, 'square', 0.14); tone(494, 0.32, 'square', 0.1); }, 240); },
  vroom: () => { tone(70, 1.0, 'sawtooth', 0.3, 230); tone(105, 1.0, 'square', 0.1, 330); noise(1.0, 400, 0.8, 0.45, 'lowpass', 1600); },
  screech: () => { noise(0.7, 3200, 9, 0.3, 'bandpass', 2300); tone(1900, 0.6, 'sawtooth', 0.04, 1500); },
  crash: () => { noise(0.5, 1800, 0.8, 1.1); tone(80, 0.4, 'sine', 0.9, 35); setTimeout(() => noise(0.25, 4500, 4, 0.5, 'bandpass'), 60); },
  powerDown: () => { tone(620, 0.7, 'sawtooth', 0.12, 110); noise(0.5, 1500, 1, 0.3, 'lowpass', 300); },
  voxel: () => { for (let i = 0; i < 10; i++) setTimeout(() => tone(600 + Math.random() * 1600, 0.06, 'square', 0.06), i * 45); },
  // --- Gera y José ---
  boing: () => { tone(160, 0.4, 'sine', 0.35, 640); tone(240, 0.35, 'triangle', 0.15, 900); },
  ding: () => { tone(1320, 1.2, 'sine', 0.35); tone(1980, 0.9, 'sine', 0.12); },
  slap: () => { noise(0.09, 2500, 1.2, 1.0, 'bandpass'); tone(120, 0.12, 'sine', 0.5, 70); },
  thump: () => { tone(70, 0.18, 'sine', 0.8, 45); noise(0.06, 300, 1, 0.4); },
  grow: () => { tone(55, 1.1, 'sawtooth', 0.3, 190); tone(82, 1.1, 'square', 0.1, 260); noise(1.0, 180, 1, 0.45, 'lowpass', 700); },
  whistle: () => { tone(1500, 0.18, 'sine', 0.3, 2300); setTimeout(() => tone(2300, 0.35, 'sine', 0.3, 1700), 170); },
  fizz: () => noise(0.9, 5200, 0.8, 0.35, 'highpass', 2600),
  splash: () => { noise(0.6, 900, 0.7, 0.8, 'lowpass', 300); noise(0.35, 3500, 1.5, 0.35, 'bandpass', 1800); },
  fart: () => { tone(95, 0.7, 'sawtooth', 0.22, 60); tone(110, 0.65, 'square', 0.08, 70); noise(0.7, 260, 3, 0.25, 'bandpass', 160); },
  // Ramces (barbero): tijeras, máquina, navaja, talco, tos, la campanita y el pistón de la silla
  snip: () => { noise(0.05, 6000, 6, 0.5, 'bandpass'); setTimeout(() => noise(0.05, 7200, 6, 0.45, 'bandpass'), 70); },
  clippers: () => { tone(118, 0.55, 'sawtooth', 0.09); tone(236, 0.55, 'square', 0.035); noise(0.55, 2400, 3, 0.12, 'bandpass'); },
  shink: () => { noise(0.3, 5200, 9, 0.35, 'bandpass', 8000); tone(2400, 0.25, 'triangle', 0.08, 3600); },
  slash: () => { noise(0.18, 3000, 2, 0.6, 'bandpass', 9000); tone(900, 0.12, 'sawtooth', 0.1, 300); },
  puff: () => noise(0.55, 900, 0.6, 0.5, 'lowpass', 300),
  cough: () => { for (let i = 0; i < 3; i++) setTimeout(() => { noise(0.12, 700, 1.5, 0.5, 'bandpass'); tone(180, 0.1, 'sawtooth', 0.07, 120); }, i * 170); },
  bell: () => { tone(1568, 0.9, 'sine', 0.2); tone(2093, 0.7, 'sine', 0.09); setTimeout(() => { tone(1568, 1.1, 'sine', 0.18); tone(2093, 0.9, 'sine', 0.07); }, 180); },
  pump: () => { for (let i = 0; i < 3; i++) setTimeout(() => { tone(90, 0.12, 'sine', 0.4, 60); noise(0.1, 400, 2, 0.2, 'bandpass'); }, i * 130); },
  // Para todo el juego
  step: () => noise(0.06, 900, 1, 0.12, 'lowpass'),
  clankStep: () => { noise(0.05, 3500, 5, 0.18, 'bandpass'); tone(160, 0.07, 'square', 0.07, 110); },
  smack: () => noise(0.07, 1800, 1.2, 0.5, 'bandpass'),                        // capa extra para los puños
  thud: () => { tone(70, 0.16, 'sine', 0.55, 45); noise(0.1, 350, 1, 0.35); },  // capa extra para las patadas
  combo: (n) => tone(520 + Math.min(n, 10) * 70, 0.12, 'triangle', 0.12, 800 + Math.min(n, 10) * 90),
  tick: () => tone(1250, 0.06, 'square', 0.09),
  roundBell: () => { tone(988, 1.2, 'sine', 0.22); tone(1976, 0.8, 'sine', 0.07); },
  crowd: () => { noise(1.6, 700, 0.5, 0.3, 'bandpass', 420); noise(1.6, 1400, 0.6, 0.15, 'bandpass', 900); },
  cheer: () => { noise(2.2, 1200, 0.4, 0.28, 'bandpass', 2000); for (let i = 0; i < 6; i++) setTimeout(() => noise(0.12, 2500 + Math.random() * 2000, 4, 0.1, 'bandpass'), 150 + i * 220); },
  heartbeat: () => { tone(58, 0.14, 'sine', 0.5, 40); setTimeout(() => tone(52, 0.18, 'sine', 0.42, 36), 170); },
  tweet: () => { for (let i = 0; i < 3; i++) setTimeout(() => tone(2600 + Math.random() * 900, 0.07, 'sine', 0.07, 3400), i * 110); },
  drum: () => { tone(48, 0.9, 'sine', 0.9, 30); noise(0.5, 160, 1, 0.5); setTimeout(() => tone(44, 1.0, 'sine', 0.8, 28), 420); },
  fanfare: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => { const d = i === 3 ? 0.7 : 0.18; tone(f, d, 'square', 0.09); tone(f / 2, d, 'triangle', 0.09); }, i * 150)); },
  back: () => tone(520, 0.08, 'square', 0.09, 330),
  getup: () => noise(0.25, 1200, 0.8, 0.16, 'bandpass', 600),
};

// Ambiente de cada escenario, muy bajito: un fondo continuo y detalles al azar (pájaros, grillos…)
let amb = null;
const chirp = () => { const f = 2200 + Math.random() * 1500; tone(f, 0.08, 'sine', 0.03, f * 1.4); setTimeout(() => tone(f * 1.1, 0.07, 'sine', 0.025, f * 0.9), 110); };
const crickets = () => { const f = 4300 + Math.random() * 300; for (let i = 0; i < 4; i++) setTimeout(() => tone(f, 0.035, 'sine', 0.02), i * 55); };
const chime = () => tone(880 * [1, 1.25, 1.5, 2][Math.random() * 4 | 0], 1.6, 'sine', 0.035);
const carPass = () => noise(2.4, 260, 0.6, 0.05, 'lowpass', 900);
const farHonk = () => { tone(330, 0.25, 'square', 0.012); tone(415, 0.25, 'square', 0.01); };
export function setAmbience(id) {
  if (amb) {
    clearInterval(amb.timer);
    for (const n of amb.nodes) { try { n.stop?.(); } catch { /* ya parado */ } n.disconnect(); }
    amb = null;
  }
  if (!id || !ctx) return;
  const nodes = [];
  const bed = (freq, type, q, gain, lfo = 0) => {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(master); src.start();
    nodes.push(src, f, g);
    if (lfo) {   // el viento sube y baja
      const o = ctx.createOscillator(); o.frequency.value = lfo;
      const og = ctx.createGain(); og.gain.value = gain * 0.6;
      o.connect(og); og.connect(g.gain); o.start();
      nodes.push(o, og);
    }
  };
  const events = {
    six: [[0.3, carPass], [0.25, chirp]],
    cabana: [[0.45, chirp]],
    casachuy: [[0.9, crickets], [0.04, farHonk]],
    templo: [[0.18, chime]],
  }[id] || [];
  if (id === 'six') bed(170, 'lowpass', 0.7, 0.045);
  if (id === 'cabana' || id === 'templo') bed(id === 'cabana' ? 420 : 300, 'bandpass', 0.45, 0.035, id === 'cabana' ? 0.12 : 0.08);
  if (id === 'casachuy') bed(140, 'lowpass', 0.6, 0.02);
  const timer = setInterval(() => { if (ctx.state === 'running') for (const [p, fn] of events) if (Math.random() < p * 0.5) fn(); }, 500);
  amb = { nodes, timer };
}

// Durante el rollback del modo en línea no deben sonar golpes repetidos (`gate` lo pone main.js)
export const audioState = { gate: null };
for (const k of Object.keys(sfx)) {
  const f = sfx[k];
  sfx[k] = (...a) => { if (!audioState.gate || audioState.gate('sfx.' + k, a)) f(...a); };
}

let voices = [];
if ('speechSynthesis' in window) {
  const load = () => { voices = speechSynthesis.getVoices(); };
  load(); speechSynthesis.onvoiceschanged = load;
}

export function announce(text) {
  if (!voiceEnabled || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'es-ES';
  const v = voices.find((x) => /^es/i.test(x.lang) && /male|hombre|pablo|jorge|raul|alvaro|diego/i.test(x.name)) || voices.find((x) => /^es/i.test(x.lang));
  if (v) u.voice = v;
  u.rate = 0.85; u.pitch = 0.4; u.volume = 1;
  speechSynthesis.speak(u);
}
