// Sonidos sintetizados (sin archivos) + narrador con la voz del navegador.
// Todo pasa por un compresor (suena parejo y no satura cuando se juntan muchos golpes) y un poco de
// eco de cuarto. Efectos y música van en canales aparte para bajarles el volumen por separado (OPCIONES);
// la música está en music.js. Si luego quieres sonidos reales, pon .mp3 en assets/sonidos/ y cámbialos aquí.

let ctx = null;
let master = null, sfxBus = null, musicBus = null, reverbIn = null;
let noiseBuf = null;
export let voiceEnabled = true;
export const volumes = { musica: 0.7, efectos: 0.9 };
const SFX_LEVEL = 0.62, MUSIC_LEVEL = 0.5;
// music.js se entera cuando habla el narrador (para bajar la música) y cuando ya se puede sonar
export const audioHooks = { onAnnounce: null };
const unlockListeners = [];

export function setVoice(v) { voiceEnabled = v; if (!v && 'speechSynthesis' in window) speechSynthesis.cancel(); }
export function setVolumes(musica, efectos) {
  volumes.musica = musica; volumes.efectos = efectos;
  if (!ctx) return;
  sfxBus.gain.setTargetAtTime(SFX_LEVEL * efectos, ctx.currentTime, 0.05);
  musicBus.gain.setTargetAtTime(MUSIC_LEVEL * musica, ctx.currentTime, 0.05);
}
export function onAudioUnlock(fn) { if (ctx) fn(); else unlockListeners.push(fn); }
export function audioBus() { return ctx ? { ctx, master, musicBus, noiseBuf } : null; }

// Respuesta de un cuarto: ruido que se va apagando (para el convolver)
function impulse(seconds, decay) {
  const n = Math.round(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
  }
  return b;
}

export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -15; comp.knee.value = 12; comp.ratio.value = 3.5; comp.attack.value = 0.003; comp.release.value = 0.22;
  master = ctx.createGain(); master.gain.value = 1;
  master.connect(comp); comp.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = SFX_LEVEL * volumes.efectos; sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = MUSIC_LEVEL * volumes.musica; musicBus.connect(master);
  // eco: los efectos mandan un poco; la música solo sus agudos (el bajo con eco se oye lodoso)
  const verb = ctx.createConvolver(); verb.buffer = impulse(1.7, 3.2);
  reverbIn = ctx.createGain(); reverbIn.connect(verb); verb.connect(master);
  const sfxSend = ctx.createGain(); sfxSend.gain.value = 0.15;
  sfxBus.connect(sfxSend); sfxSend.connect(reverbIn);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 450;
  const musicSend = ctx.createGain(); musicSend.gain.value = 0.22;
  musicBus.connect(hp); hp.connect(musicSend); musicSend.connect(reverbIn);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  for (const fn of unlockListeners.splice(0)) fn();
}

// attack > 0: el sonido crece en vez de empezar de golpe (para los "whoosh" que suben)
function noise(dur, freq, q = 1, gain = 1, type = 'lowpass', sweepTo = null, attack = 0) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ctx.createGain();
  if (attack) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); } else g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + Math.max(dur, attack + 0.02));
  src.connect(f); f.connect(g); g.connect(sfxBus);
  src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
}

function tone(freq, dur, type = 'sine', gain = 0.5, slideTo = null, attack = 0) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  if (attack) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); } else g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + Math.max(dur, attack + 0.02));
  o.connect(g); g.connect(sfxBus);
  o.start(t); o.stop(t + dur + 0.05);
}
// Acorde grave de película: osciladores un poco desafinados entre sí, por un filtro que se va cerrando
function chord(freqs, dur, gain = 0.3, cutoff = 900, attack = 0.04, type = 'sawtooth') {
  if (!ctx) return;
  const t = ctx.currentTime;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.8;
  f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(Math.max(60, cutoff * 0.22), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  f.connect(g); g.connect(sfxBus);
  for (const fr of freqs) for (const det of [-7, 7]) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = fr; o.detune.value = det;
    o.connect(f); o.start(t); o.stop(t + dur + 0.05);
  }
}
// un poco distinto cada vez: el mismo golpe repetido no suena a máquina
const vary = () => 0.93 + Math.random() * 0.14;

export const sfx = {
  whoosh: (heavy) => {
    const p = vary();
    if (heavy) { noise(0.26, 380 * p, 0.8, 0.42, 'bandpass', 1900 * p, 0.06); tone(170 * p, 0.2, 'sine', 0.08, 90); }
    else noise(0.12 + Math.random() * 0.05, 750 * p, 0.9, 0.26, 'bandpass', 2800 * p, 0.03);
  },
  // golpe en capas: chasquido + cuerpo + golpe seco (+ retumbo si es fuerte)
  hit: (strong) => {
    const p = vary();
    noise(0.035, 3200 * p, 0.8, 0.5, 'highpass');
    noise(strong ? 0.24 : 0.13, (strong ? 700 : 1150) * p, 1, strong ? 1.05 : 0.8, 'lowpass', 180);
    tone((strong ? 95 : 150) * p, strong ? 0.26 : 0.15, 'sine', strong ? 0.85 : 0.6, 40);
    if (strong) { tone(52, 0.5, 'sine', 0.45, 30); noise(0.45, 900, 0.5, 0.22, 'lowpass', 120); }
  },
  block: () => { const p = vary(); tone(1750 * p, 0.12, 'triangle', 0.12, 1500 * p); tone(2630 * p, 0.09, 'sine', 0.05); noise(0.08, 3000, 4, 0.45, 'bandpass'); tone(130, 0.08, 'sine', 0.32, 70); },
  jump: () => noise(0.12, 500, 1, 0.15, 'lowpass', 1500),
  land: () => { noise(0.12, 300, 1, 0.35); tone(90, 0.08, 'sine', 0.2, 50); },
  fall: () => { noise(0.4, 250, 1, 0.9); tone(60, 0.4, 'sine', 0.8, 30); },
  fire: () => { noise(0.5, 400, 0.6, 0.6, 'lowpass', 2000); tone(200, 0.4, 'sawtooth', 0.12, 80); },
  ice: () => { tone(1800, 0.3, 'triangle', 0.2, 600); noise(0.3, 6000, 2, 0.25, 'highpass'); },
  zap: () => { noise(0.35, 4000, 0.4, 0.6, 'highpass'); tone(120, 0.3, 'square', 0.18, 60); },
  magic: () => { tone(300, 0.5, 'sine', 0.25, 1200); tone(450, 0.5, 'triangle', 0.15, 1800); },
  boom: () => { noise(0.9, 200, 0.7, 1.2); tone(55, 0.9, 'sine', 1, 25); },
  chain: () => { for (let i = 0; i < 4; i++) setTimeout(() => noise(0.04, 5000, 6, 0.3, 'bandpass'), i * 30); },
  teleport: () => tone(200, 0.35, 'sine', 0.3, 1600),
  shatter: () => { for (let i = 0; i < 6; i++) setTimeout(() => noise(0.15, 5000 + Math.random() * 3000, 3, 0.4, 'bandpass'), i * 25); },
  // --- interfaz ---
  select: () => { tone(1046, 0.05, 'triangle', 0.09); tone(1568, 0.04, 'sine', 0.035); },
  confirm: () => {
    tone(523, 0.09, 'square', 0.08); noise(0.3, 5000, 2, 0.1, 'bandpass', 9000);
    setTimeout(() => { tone(784, 0.16, 'square', 0.08); tone(1568, 0.22, 'sine', 0.045); }, 70);
  },
  back: () => { tone(660, 0.07, 'triangle', 0.09, 440); setTimeout(() => tone(440, 0.09, 'triangle', 0.08, 330), 60); },
  // peleador elegido: golpe grave con brillo metálico
  lockIn: () => { tone(72, 0.55, 'sine', 0.7, 34); noise(0.3, 1300, 0.7, 0.55, 'lowpass', 200); tone(1318, 0.6, 'triangle', 0.07); noise(0.5, 6500, 3, 0.12, 'bandpass', 3000); },
  // golpe de cine (VS, logo): sub que cae + polvo + chasquido
  impact: () => { tone(64, 1.4, 'sine', 0.95, 27); noise(1.0, 700, 0.6, 0.9, 'lowpass', 80); noise(0.06, 2600, 0.8, 0.6, 'highpass'); tone(128, 0.7, 'triangle', 0.14, 60); },
  riser: (dur = 1.3) => { noise(dur, 260, 1.4, 0.45, 'bandpass', 7000, dur * 0.92); tone(110, dur, 'sawtooth', 0.045, 880, dur * 0.9); },
  swoosh: () => noise(0.32, 1700, 0.9, 0.3, 'bandpass', 380, 0.05),
  pauseIn: () => { tone(440, 0.16, 'triangle', 0.1, 220); noise(0.2, 1500, 1, 0.12, 'bandpass', 400); },
  pauseOut: () => { tone(220, 0.16, 'triangle', 0.1, 440); noise(0.2, 400, 1, 0.12, 'bandpass', 1500); },
  ko: () => {
    tone(58, 1.6, 'sine', 1, 24); noise(1.2, 900, 0.5, 1.1, 'lowpass', 70); noise(0.07, 3000, 0.7, 0.7, 'highpass');
    setTimeout(() => noise(1.4, 6000, 0.6, 0.18, 'highpass', 2500), 40);   // el "shhh" del golpe en cámara lenta
  },
  perfect: () => [1047, 1319, 1568, 2093].forEach((f, i) => setTimeout(() => { tone(f, 0.9 - i * 0.12, 'sine', 0.09); tone(f * 2, 0.4, 'sine', 0.02); }, i * 70)),
  firstHit: () => { tone(880, 0.12, 'square', 0.06); tone(1320, 0.18, 'triangle', 0.06); },
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
  step: () => noise(0.06, 900 * vary(), 1, 0.12, 'lowpass'),
  clankStep: () => { noise(0.05, 3500, 5, 0.18, 'bandpass'); tone(160, 0.07, 'square', 0.07, 110); },
  smack: () => noise(0.07, 1800 * vary(), 1.2, 0.5, 'bandpass'),                        // capa extra para los puños
  thud: () => { tone(70 * vary(), 0.16, 'sine', 0.55, 45); noise(0.1, 350, 1, 0.35); },   // capa extra para las patadas
  combo: (n) => tone(520 + Math.min(n, 10) * 70, 0.12, 'triangle', 0.12, 800 + Math.min(n, 10) * 90),
  tick: () => tone(1250, 0.06, 'square', 0.09),
  roundBell: () => { tone(988, 1.2, 'sine', 0.22); tone(1976, 0.8, 'sine', 0.07); },
  crowd: () => { noise(1.6, 700, 0.5, 0.3, 'bandpass', 420); noise(1.6, 1400, 0.6, 0.15, 'bandpass', 900); },
  cheer: () => { noise(2.2, 1200, 0.4, 0.28, 'bandpass', 2000); for (let i = 0; i < 6; i++) setTimeout(() => noise(0.12, 2500 + Math.random() * 2000, 4, 0.1, 'bandpass'), 150 + i * 220); },
  heartbeat: () => { tone(58, 0.14, 'sine', 0.5, 40); setTimeout(() => tone(52, 0.18, 'sine', 0.42, 36), 170); },
  tweet: () => { for (let i = 0; i < 3; i++) setTimeout(() => tone(2600 + Math.random() * 900, 0.07, 'sine', 0.07, 3400), i * 110); },
  drum: () => { tone(48, 0.9, 'sine', 0.9, 30); noise(0.5, 160, 1, 0.5); setTimeout(() => tone(44, 1.0, 'sine', 0.8, 28), 420); },
  fanfare: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => { const d = i === 3 ? 0.7 : 0.18; tone(f, d, 'square', 0.09); tone(f / 2, d, 'triangle', 0.09); }, i * 150)); },
  getup: () => noise(0.25, 1200, 0.8, 0.16, 'bandpass', 600),
  // fatalities de cine (fatal.js)
  braam: () => {   // golpe grave al empezar, como en los tráilers
    chord([43.65, 65.4, 87.3], 2.8, 0.3, 760, 0.05); tone(43.65, 2.4, 'sine', 0.42, 40);
    noise(2.2, 150, 0.7, 0.38, 'lowpass', 60, 0.03); noise(0.4, 2200, 0.6, 0.14, 'bandpass', 500);
  },
  fatalHit: () => {   // el remate: trueno seco, golpe que se hunde y retumbo largo
    tone(72, 1.9, 'sine', 1.0, 24); chord([36.7, 55], 1.7, 0.26, 520, 0.01);
    noise(0.14, 2600, 0.6, 0.95, 'highpass'); noise(2.2, 420, 0.5, 0.6, 'lowpass', 80);
  },
  stinger: () => {   // ¡FATALIDAD!: acorde menor oscuro con un brillo agudo encima
    chord([55, 110, 130.81, 164.81], 3.4, 0.3, 1500, 0.12); chord([440, 523.25, 659.26], 3.0, 0.045, 2800, 0.45, 'triangle');
    tone(65, 1.2, 'sine', 0.8, 45); noise(1.4, 300, 0.6, 0.4, 'lowpass', 80);
  },
  thunder: () => { noise(0.22, 1900, 0.5, 0.7, 'bandpass', 400); noise(2.6, 150, 0.6, 0.9, 'lowpass', 55, 0.08); tone(38, 1.8, 'sine', 0.45, 27); },
  crackle: () => { for (let i = 0; i < 16; i++) setTimeout(() => noise(0.035, 3000 + Math.random() * 5000, 4, 0.28, 'bandpass'), i * 38 + Math.random() * 45); },
  fuse: () => { noise(1.1, 5200, 0.9, 0.2, 'highpass', 3200); for (let i = 0; i < 7; i++) setTimeout(() => noise(0.02, 6000, 5, 0.18, 'bandpass'), i * 140 + Math.random() * 60); },
  glint: () => { tone(2637, 0.5, 'sine', 0.06, 3520); tone(3951, 0.35, 'sine', 0.035); },
  // --- ataques nuevos (especiales-extra.js)
  drone: () => { tone(220, 0.5, 'sawtooth', 0.05, 260); tone(330, 0.5, 'square', 0.03, 380); noise(0.5, 2600, 3, 0.08, 'bandpass'); },
  sonicBoom: () => {   // dos chasquidos secos y el retumbo (el estruendo de romper la barrera del sonido)
    noise(0.08, 2400, 0.6, 1.0, 'highpass'); tone(48, 0.9, 'sine', 0.9, 26); noise(0.9, 500, 0.6, 0.8, 'lowpass', 80);
    setTimeout(() => noise(0.07, 2000, 0.6, 0.8, 'highpass'), 90);
  },
  oof: () => { tone(140, 0.25, 'sawtooth', 0.12, 80); noise(0.2, 600, 1.5, 0.35, 'bandpass', 300); tone(60, 0.3, 'sine', 0.6, 40); },
  crumble: () => {   // piso que se rompe
    noise(0.7, 500, 0.6, 0.7, 'lowpass', 120); tone(45, 0.6, 'sine', 0.5, 30);
    for (let i = 0; i < 6; i++) setTimeout(() => noise(0.06, 1200 + Math.random() * 1500, 2, 0.25, 'bandpass'), i * 60 + Math.random() * 40);
  },
  flame: () => { noise(1.4, 700, 0.5, 0.55, 'lowpass', 1800, 0.08); noise(0.15, 4000, 1, 0.25, 'highpass'); },
  reel: () => noise(0.03, 4500, 5, 0.25, 'bandpass'),
  kiss: () => { tone(1200, 0.08, 'sine', 0.15, 1800); setTimeout(() => tone(900, 0.25, 'sine', 0.1, 1400), 90); },
  // --- brutalities (brutalidades.js)
  pop: () => { noise(0.05, 3000, 0.8, 1.0, 'highpass'); tone(500, 0.08, 'sine', 0.4, 120); noise(0.3, 900, 0.8, 0.5, 'lowpass', 200); },
  inflate: () => { tone(160, 1.2, 'sine', 0.18, 900, 0.1); noise(1.2, 1200, 2, 0.12, 'bandpass', 4000, 0.3); },
  gulp: () => { tone(300, 0.12, 'sine', 0.3, 120); setTimeout(() => tone(180, 0.15, 'sine', 0.25, 90), 120); },
  beep: (pct = 0) => tone(600 + pct * 6, 0.05, 'square', 0.06),
  glitch: () => { for (let i = 0; i < 5; i++) setTimeout(() => { tone(200 + Math.random() * 2000, 0.03, 'square', 0.07); noise(0.03, 3000, 4, 0.15, 'bandpass'); }, i * 25); },
  brutalHit: () => { tone(90, 0.5, 'square', 0.18, 40); noise(0.3, 1400, 0.7, 0.8, 'lowpass', 120); },
  brutal: () => {   // BRUTALITY: tres trancazos de tambor y un acorde rasposo
    for (let i = 0; i < 3; i++) setTimeout(() => { tone(62, 0.5, 'sine', 0.9, 30); noise(0.25, 900, 0.6, 0.7, 'lowpass', 100); }, i * 150);
    setTimeout(() => { chord([55, 82.4, 110], 2.8, 0.32, 1800, 0.02, 'square'); noise(1.5, 300, 0.6, 0.4, 'lowpass', 70); }, 450);
  },
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
    src.connect(f); f.connect(g); g.connect(sfxBus); src.start();
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

// lang 'en': FATALITY y BRUTALITY se dicen en inglés, más lento y más grave (como el narrador de las maquinitas)
export function announce(text, lang = 'es') {
  if (!voiceEnabled || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const en = lang === 'en', re = en ? /^en/i : /^es/i;
  u.lang = en ? 'en-US' : 'es-ES';
  const male = en ? /david|daniel|guy|fred|alex|george|james|mark|ryan|christopher|\bmale/i : /male|hombre|pablo|jorge|raul|alvaro|diego/i;
  const woman = /female|woman|zira|samantha|victoria|susan|hazel|helena|sabina|laura/i;
  const v = voices.find((x) => re.test(x.lang) && male.test(x.name) && !woman.test(x.name)) || voices.find((x) => re.test(x.lang));
  if (v) u.voice = v;
  u.rate = en ? 0.7 : 0.85; u.pitch = en ? 0.1 : 0.4; u.volume = 1;
  speechSynthesis.speak(u);
  audioHooks.onAnnounce?.(text);   // la música se hace a un lado mientras habla
}
