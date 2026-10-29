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
};

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
