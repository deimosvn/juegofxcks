// =====================================================================
//  MODO EN LÍNEA
//
//  - Firebase Realtime Database: quién está conectado (presencia), retos,
//    salas, señalización WebRTC, ranking y respaldo de las entradas.
//    `backend.store` es un árbol en tiempo real con la misma forma de uso en
//    Firebase y en modo local (lo usan las salas con espectadores, salas.js).
//  - WebRTC (conexión directa entre los dos jugadores): las entradas del
//    combate viajan por aquí, sin pasar por ningún servidor.
//  - Rollback: el juego no espera al rival. Predice sus botones y, si se
//    equivocó, rebobina unos frames y los vuelve a simular al instante.
//
//  Sin configuración de Firebase funciona en "modo local": varias pestañas
//  del mismo navegador se ven entre sí (sirve para probar).
// =====================================================================
import { readLocalMask } from './input.js';

const FB = '10.12.2';
const qs = new URLSearchParams(location.search);
// Para pruebas: ?lag=80&jitter=20&loss=0.05 simula una conexión mala
const TEST = { lag: +qs.get('lag') || 0, jitter: +qs.get('jitter') || 0, loss: +qs.get('loss') || 0 };

export async function loadNetConfig() {
  let cfg = { firebase: null, iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };
  try {
    const r = await fetch('/api/config', { cache: 'no-store' });
    if (r.ok) { const j = await r.json(); cfg = { ...cfg, ...j, iceServers: j.iceServers || cfg.iceServers }; }
  } catch { /* sin servidor de config */ }
  if (!cfg.firebase) {
    try { const m = await import('./firebase-config.js'); if (m.FIREBASE_CONFIG?.projectId) cfg.firebase = { ...m.FIREBASE_CONFIG }; } catch { /* sin archivo */ }
  }
  if (qs.has('local')) cfg.firebase = null;
  return cfg;
}

// Error con un mensaje claro para mostrar en el lobby
class NetError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// La URL de la Realtime Database depende de la región en que se creó: se busca sola.
async function resolveDatabaseURL(cfg) {
  if (cfg.databaseURL) return cfg.databaseURL;
  const id = cfg.projectId;
  const candidates = [
    `https://${id}-default-rtdb.firebaseio.com`,
    `https://${id}-default-rtdb.us-central1.firebasedatabase.app`,
    `https://${id}-default-rtdb.europe-west1.firebasedatabase.app`,
    `https://${id}-default-rtdb.asia-southeast1.firebasedatabase.app`,
  ];
  for (const url of candidates) {
    try {
      // el ranking se puede leer sin sesión: si la base existe responde 200 (o 401 si faltan las reglas)
      const r = await fetch(`${url}/kombate/ranking.json?shallow=true`, { cache: 'no-store' });
      if (r.status !== 404) return url;
    } catch { /* probar la siguiente */ }
  }
  throw new NetError('sin-base', 'Falta crear la Realtime Database en Firebase (Compilación → Realtime Database → Crear base de datos).');
}

const rankKey = (n) => n.toLowerCase().replace(/[.#$[\]/\s]+/g, '_').slice(0, 24) || 'jugador';

// ---------------------------------------------------------------------
//  Backend Firebase
// ---------------------------------------------------------------------
class FirebaseBackend {
  constructor() { this.kind = 'firebase'; this.subs = []; this.reconnects = []; }

  async init(cfg) {
    const [app, auth, db] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FB}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FB}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${FB}/firebase-database.js`),
    ]);
    this.f = db;
    const databaseURL = await resolveDatabaseURL(cfg);
    const fbApp = app.initializeApp({ ...cfg, databaseURL });
    this.db = db.getDatabase(fbApp);
    this.store = firebaseStore(db, (p) => this.ref(p));
    const a = auth.getAuth(fbApp);
    // ?aislado: cada pestaña es un jugador distinto (para probar en una sola computadora)
    if (qs.has('aislado')) await auth.setPersistence(a, auth.inMemoryPersistence);
    try {
      const cred = await auth.signInAnonymously(a);
      this.uid = cred.user.uid;
    } catch (err) {
      if (/configuration-not-found|operation-not-allowed|admin-restricted/.test(err.code || '')) {
        throw new NetError('sin-auth', 'Falta activar el acceso anónimo en Firebase (Authentication → Método de acceso → Anónimo).');
      }
      throw err;
    }
  }

  ref(path) { return this.f.ref(this.db, 'kombate/' + path); }

  async connect(name) {
    const { onValue, onDisconnect, set, serverTimestamp, ref } = this.f;
    this.name = name; this.estado = 'libre'; this.sala = null;
    this.meRef = this.ref('conectados/' + this.uid);
    // primera escritura: si las reglas no están publicadas, avisar claro
    try {
      await set(this.meRef, { nombre: name, estado: this.estado, t: serverTimestamp() });
    } catch (err) {
      if (/permission/i.test(err.code || err.message || '')) {
        throw new NetError('sin-reglas', 'Firebase rechazó la escritura: publica las reglas de database.rules.json (Realtime Database → Reglas).');
      }
      throw err;
    }
    this.subs.push(onValue(ref(this.db, '.info/connected'), (s) => {
      if (s.val() !== true) return;
      onDisconnect(this.meRef).remove();
      set(this.meRef, { nombre: name, estado: this.estado, ...(this.sala ? { sala: this.sala } : {}), t: serverTimestamp() });
      for (const cb of this.reconnects) cb();
    }));
  }

  // al volver la conexión (en el celular se cae seguido) cada quien vuelve a su lugar
  onReconnect(cb) { this.reconnects.push(cb); }

  onPlayers(cb) {
    this.subs.push(this.f.onValue(this.ref('conectados'), (s) => {
      const v = s.val() || {};
      cb(Object.entries(v).map(([uid, p]) => ({ uid, nombre: p.nombre, estado: p.estado, sala: p.sala })));
    }));
  }

  setStatus(estado, sala = null) { this.estado = estado; this.sala = sala; if (this.meRef) this.f.update(this.meRef, { estado, sala }); }

  onChallenge(cb, onCancel) {
    this.subs.push(this.f.onChildAdded(this.ref('retos/' + this.uid), (s) => cb({ from: s.key, ...s.val() })));
    this.subs.push(this.f.onChildRemoved(this.ref('retos/' + this.uid), (s) => onCancel({ from: s.key, ...s.val() })));
  }

  async challenge(toUid) {
    const { push, set, onDisconnect, serverTimestamp } = this.f;
    const sala = push(this.ref('salas')).key;
    await set(this.ref('salas/' + sala), { host: this.uid, guest: toUid, estado: 'pendiente', t: serverTimestamp() });
    onDisconnect(this.ref('salas/' + sala)).remove();
    const reto = this.ref(`retos/${toUid}/${this.uid}`);
    await set(reto, { nombre: this.name, sala, t: serverTimestamp() });
    onDisconnect(reto).remove();
    return sala;
  }

  watchRoomState(sala, cb) {
    return this.f.onValue(this.ref(`salas/${sala}/estado`), (s) => cb(s.val()));
  }

  async respond(ch, accept) {
    await this.f.set(this.ref(`salas/${ch.sala}/estado`), accept ? 'aceptado' : 'rechazado');
    await this.f.remove(this.ref(`retos/${this.uid}/${ch.from}`));
  }

  cancelChallenge(toUid, sala) {
    this.f.remove(this.ref(`retos/${toUid}/${this.uid}`));
    this.f.remove(this.ref('salas/' + sala));
  }

  // Pelea de una sala con espectadores: ya está aceptada, solo falta su cuarto de señalización
  async createMatchRoom(sala, guest) {
    const { set, onDisconnect, serverTimestamp } = this.f;
    await set(this.ref('salas/' + sala), { host: this.uid, guest, estado: 'aceptado', t: serverTimestamp() });
    onDisconnect(this.ref('salas/' + sala)).remove();
  }

  openRoom(sala, peerUid, isHost) {
    const { onChildAdded, onValue, push, set, remove } = this.f;
    const base = `salas/${sala}`;
    const room = {
      ctrl: [], fast: [], closed: [],
      onCtrl: (cb) => room.ctrl.push(cb),
      onFast: (cb) => room.fast.push(cb),
      onClosed: (cb) => room.closed.push(cb),
      sendCtrl: (o) => push(this.ref(`${base}/msg/${this.uid}`), JSON.stringify(o)),
      sendFast: (o, ch = 'in') => set(this.ref(`${base}/${ch}/${this.uid}`), JSON.stringify(o)),
      close: () => { for (const u of unsub) u(); if (isHost) remove(this.ref(base)); },
    };
    const deliver = (list) => (s) => { const v = s.val(); if (v) { const o = JSON.parse(v); for (const cb of list) cb(o); } };
    let alive = false;
    const unsub = [
      onChildAdded(this.ref(`${base}/msg/${peerUid}`), deliver(room.ctrl)),
      onValue(this.ref(`${base}/in/${peerUid}`), deliver(room.fast)),
      onValue(this.ref(`${base}/ping/${peerUid}`), deliver(room.fast)),
      // si el anfitrión borra la sala, Firebase manda null o cancela la lectura (las reglas ya no la permiten)
      onValue(this.ref(`${base}/host`), (s) => { if (s.val()) alive = true; else if (alive) for (const cb of room.closed) cb(); },
        () => { if (alive) for (const cb of room.closed) cb(); }),
    ];
    return room;
  }

  onRanking(cb) {
    const { query, orderByChild, limitToLast, onValue } = this.f;
    this.subs.push(onValue(query(this.ref('ranking'), orderByChild('victorias'), limitToLast(10)), (s) => {
      const list = []; s.forEach((c) => { list.push(c.val()); });
      cb(list.reverse());
    }, () => cb([])));
  }

  reportResult(won) {
    const name = this.name;
    this.f.runTransaction(this.ref('ranking/' + rankKey(name)), (cur) => {
      cur = cur || { nombre: name, victorias: 0, derrotas: 0 };
      if (won) cur.victorias++; else cur.derrotas++;
      cur.nombre = name;
      return cur;
    }).catch(() => {});
  }

  disconnect() {
    for (const u of this.subs) try { u(); } catch { /* ya cerrado */ }
    this.subs = [];
    if (this.meRef) this.f.remove(this.meRef);
    this.meRef = null;
  }
}

// ---------------------------------------------------------------------
//  Backend local (BroadcastChannel): pestañas del mismo navegador
// ---------------------------------------------------------------------
class LocalBackend {
  constructor() {
    this.kind = 'local';
    this.uid = Math.random().toString(36).slice(2, 10);
    this.bc = new BroadcastChannel('kombate-local');
    this.players = new Map();
    this.handlers = [];
    this.bc.onmessage = (e) => { for (const h of this.handlers) h(e.data); };
    this.store = new LocalStore();
  }
  async init() {}
  onReconnect() {}
  async createMatchRoom() {}
  post(m) { this.bc.postMessage(m); }
  on(fn) { this.handlers.push(fn); }

  async connect(name) {
    this.name = name; this.estado = 'libre'; this.sala = null;
    const hello = () => this.post({ t: 'hello', uid: this.uid, nombre: this.name, estado: this.estado, sala: this.sala });
    hello();
    this.helloTimer = setInterval(hello, 1000);
    addEventListener('beforeunload', () => this.post({ t: 'bye', uid: this.uid }));
  }
  onPlayers(cb) {
    const emit = () => cb([{ uid: this.uid, nombre: this.name, estado: this.estado, sala: this.sala }, ...[...this.players.entries()].map(([uid, p]) => ({ uid, ...p }))]);
    this.on((m) => {
      if (m.t === 'hello') { const isNew = !this.players.has(m.uid); this.players.set(m.uid, { nombre: m.nombre, estado: m.estado, sala: m.sala, seen: Date.now() }); if (isNew) this.post({ t: 'hello', uid: this.uid, nombre: this.name, estado: this.estado, sala: this.sala }); emit(); }
      if (m.t === 'bye') { this.players.delete(m.uid); emit(); }
    });
    this.pruneTimer = setInterval(() => {
      let changed = false;
      for (const [uid, p] of this.players) if (Date.now() - p.seen > 3500) { this.players.delete(uid); changed = true; }
      if (changed) emit();
    }, 1000);
    emit();
  }
  setStatus(estado, sala = null) { this.estado = estado; this.sala = sala; this.post({ t: 'hello', uid: this.uid, nombre: this.name, estado, sala }); }
  onChallenge(cb, onCancel) {
    this.on((m) => {
      if (m.t === 'reto' && m.to === this.uid) cb({ from: m.from, nombre: m.nombre, sala: m.sala });
      if (m.t === 'retoCancel' && m.to === this.uid) onCancel({ from: m.from, sala: m.sala });
    });
  }
  async challenge(toUid) {
    const sala = 'L' + Math.random().toString(36).slice(2, 9);
    this.post({ t: 'reto', to: toUid, from: this.uid, nombre: this.name, sala });
    return sala;
  }
  watchRoomState(sala, cb) {
    const fn = (m) => { if (m.t === 'retoResp' && m.sala === sala) cb(m.estado); };
    this.on(fn);
    return () => { this.handlers = this.handlers.filter((h) => h !== fn); };
  }
  async respond(ch, accept) { this.post({ t: 'retoResp', sala: ch.sala, estado: accept ? 'aceptado' : 'rechazado' }); }
  cancelChallenge(toUid, sala) { this.post({ t: 'retoCancel', to: toUid, from: this.uid, sala }); }
  openRoom(sala, peerUid) {
    const room = {
      ctrl: [], fast: [], closed: [],
      onCtrl: (cb) => room.ctrl.push(cb),
      onFast: (cb) => room.fast.push(cb),
      onClosed: (cb) => room.closed.push(cb),
      sendCtrl: (o) => this.post({ t: 'room', sala, from: this.uid, kind: 'ctrl', o }),
      sendFast: (o) => this.post({ t: 'room', sala, from: this.uid, kind: 'fast', o }),
      close: () => { this.post({ t: 'roomClose', sala, from: this.uid }); this.handlers = this.handlers.filter((h) => h !== fn); },
    };
    const fn = (m) => {
      if (m.sala !== sala || m.from !== peerUid) return;
      if (m.t === 'room') for (const cb of (m.kind === 'ctrl' ? room.ctrl : room.fast)) cb(m.o);
      if (m.t === 'roomClose') for (const cb of room.closed) cb();
    };
    this.on(fn);
    return room;
  }
  onRanking(cb) {
    const read = () => { try { return JSON.parse(localStorage.getItem('kombate-ranking') || '{}'); } catch { return {}; } };
    const emit = () => cb(Object.values(read()).sort((a, b) => b.victorias - a.victorias).slice(0, 10));
    this.on((m) => { if (m.t === 'ranking') emit(); });
    emit();
    this.emitRanking = emit;
  }
  reportResult(won) {
    try {
      const r = JSON.parse(localStorage.getItem('kombate-ranking') || '{}');
      const k = rankKey(this.name);
      const cur = r[k] || { nombre: this.name, victorias: 0, derrotas: 0 };
      if (won) cur.victorias++; else cur.derrotas++;
      r[k] = cur;
      localStorage.setItem('kombate-ranking', JSON.stringify(r));
      this.post({ t: 'ranking' }); this.emitRanking?.();
    } catch { /* sin almacenamiento */ }
  }
  disconnect() {
    clearInterval(this.helloTimer); clearInterval(this.pruneTimer);
    this.post({ t: 'bye', uid: this.uid });
    this.handlers = [];
    this.bc.onmessage = (e) => { for (const h of this.handlers) h(e.data); };
  }
}

// ---------------------------------------------------------------------
//  Árbol en tiempo real (salas con espectadores). Rutas sin el prefijo 'kombate/'.
// ---------------------------------------------------------------------
function firebaseStore(f, ref) {
  return {
    set: (p, v) => f.set(ref(p), v),
    update: (p, o) => f.update(ref(p), o),
    remove: (p) => f.remove(ref(p)),
    key: (p) => f.push(ref(p)).key,
    onValue: (p, cb, onErr) => f.onValue(ref(p), (s) => cb(s.val()), onErr),
    onChildAdded: (p, cb) => f.onChildAdded(ref(p), (s) => cb(s.key, s.val())),
    onDisconnectRemove: (p) => { const od = f.onDisconnect(ref(p)); od.remove(); return () => od.cancel(); },
    // fn recibe el valor actual y devuelve el nuevo (undefined = no cambiar); resuelve true si se guardó.
    // Sin applyLocally: nadie ve un turno que al final no ganó la carrera contra otro cliente
    transaction: (p, fn) => f.runTransaction(ref(p), fn, { applyLocally: false }).then((r) => r.committed),
    now: () => f.serverTimestamp(),
  };
}

// Modo local: el árbol vive en localStorage y las demás pestañas se enteran con el evento 'storage'
class LocalStore {
  constructor() {
    this.k = 'kombate-db'; this.subs = new Set(); this.leaving = new Set();
    addEventListener('storage', (e) => { if (e.key === this.k) this.emit(); });
    addEventListener('pagehide', () => { if (this.leaving.size) this.write(Object.fromEntries([...this.leaving].map((p) => [p, null]))); });
  }
  root() { try { return JSON.parse(localStorage.getItem(this.k)) || {}; } catch { return {}; } }
  get(p, v = this.root()) { for (const k of p.split('/')) { if (v == null || typeof v !== 'object') return null; v = v[k]; } return v ?? null; }
  write(changes) {
    const root = this.root();
    for (const [p, val] of Object.entries(changes)) {
      const ks = p.split('/'), last = ks.pop(), chain = [root];
      let o = root;
      for (const k of ks) { if (!o[k] || typeof o[k] !== 'object') o[k] = {}; o = o[k]; chain.push(o); }
      if (val == null) delete o[last]; else o[last] = JSON.parse(JSON.stringify(val));
      // como en Firebase: un nodo que se queda sin hijos deja de existir
      for (let i = ks.length - 1; i >= 0 && !Object.keys(chain[i + 1]).length; i--) delete chain[i][ks[i]];
    }
    try { localStorage.setItem(this.k, JSON.stringify(root)); } catch { /* sin espacio */ }
    queueMicrotask(() => this.emit());
    return Promise.resolve();
  }
  emit() { for (const s of [...this.subs]) s(); }
  watch(run) { this.subs.add(run); queueMicrotask(() => { if (this.subs.has(run)) run(); }); return () => this.subs.delete(run); }
  set(p, v) { return this.write({ [p]: v }); }
  update(p, o) { return this.write(Object.fromEntries(Object.entries(o).map(([k, v]) => [`${p}/${k}`, v]))); }
  remove(p) { return this.write({ [p]: null }); }
  key() { return Date.now().toString(36).padStart(9, '0') + Math.random().toString(36).slice(2, 8); }
  onValue(p, cb) { let last; return this.watch(() => { const v = this.get(p), j = JSON.stringify(v); if (j !== last) { last = j; cb(v); } }); }
  onChildAdded(p, cb) {
    const seen = new Set();
    return this.watch(() => {
      const v = this.get(p) || {};
      for (const k of seen) if (!(k in v)) seen.delete(k);
      for (const k of Object.keys(v).sort()) if (!seen.has(k)) { seen.add(k); cb(k, v[k]); }
    });
  }
  onDisconnectRemove(p) { this.leaving.add(p); return () => this.leaving.delete(p); }
  transaction(p, fn) { const v = fn(this.get(p)); return v === undefined ? Promise.resolve(false) : this.write({ [p]: v }).then(() => true); }
  now() { return Date.now(); }
}

export async function createBackend(cfg) {
  if (cfg.firebase) {
    const be = new FirebaseBackend();
    await be.init(cfg.firebase);
    return be;
  }
  const be = new LocalBackend();
  await be.init();
  return be;
}

// ---------------------------------------------------------------------
//  WebRTC: canal directo entre los dos jugadores (sin servidor de por medio)
// ---------------------------------------------------------------------
class P2PLink {
  constructor(sendSignal, isHost, iceServers, onMessage) {
    this.sendSignal = sendSignal; this.onMessage = onMessage;
    this.open = false; this.pendingIce = []; this.remoteSet = false;
    this.pc = new RTCPeerConnection({ iceServers });
    this.pc.onicecandidate = (e) => { if (e.candidate) sendSignal({ t: 'rtc', ice: e.candidate.toJSON() }); };
    this.pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(this.pc.connectionState)) this.open = false;
    };
    if (isHost) {
      this.setupChannel(this.pc.createDataChannel('entradas', { ordered: false, maxRetransmits: 0 }));
      this.offer();
    } else {
      this.pc.ondatachannel = (e) => this.setupChannel(e.channel);
    }
  }
  setupChannel(dc) {
    this.dc = dc;
    dc.onopen = () => { this.open = true; };
    dc.onclose = () => { this.open = false; };
    dc.onmessage = (e) => { try { this.onMessage(JSON.parse(e.data)); } catch { /* mensaje roto */ } };
  }
  async offer() {
    await this.pc.setLocalDescription(await this.pc.createOffer());
    this.sendSignal({ t: 'rtc', sdp: this.pc.localDescription.toJSON() });
  }
  async signal(m) {
    try {
      if (m.sdp) {
        await this.pc.setRemoteDescription(m.sdp);
        this.remoteSet = true;
        for (const c of this.pendingIce) await this.pc.addIceCandidate(c).catch(() => {});
        this.pendingIce = [];
        if (m.sdp.type === 'offer') {
          await this.pc.setLocalDescription(await this.pc.createAnswer());
          this.sendSignal({ t: 'rtc', sdp: this.pc.localDescription.toJSON() });
        }
      } else if (m.ice) {
        if (this.remoteSet) await this.pc.addIceCandidate(m.ice).catch(() => {});
        else this.pendingIce.push(m.ice);
      }
    } catch (err) { console.warn('WebRTC', err); }
  }
  send(o) {
    if (!this.open || !this.dc || this.dc.readyState !== 'open') return false;
    try { this.dc.send(JSON.stringify(o)); return true; } catch { return false; }
  }
  close() { try { this.pc.close(); } catch { /* ya cerrada */ } this.open = false; }
}

// ---------------------------------------------------------------------
//  Link: sala (Firebase/local) + WebRTC. Entradas por P2P si se puede.
// ---------------------------------------------------------------------
export class Link {
  constructor(room, isHost, iceServers) {
    this.room = room; this.isHost = isHost; this.iceServers = iceServers;
    this.inputCbs = []; this.ctrlCbs = [];
    this.peerReady = false; this.p2p = null;
    this.rtt = 120; this.lastHeard = performance.now(); this.closed = false;
    room.onCtrl((m) => this.handleCtrl(m));
    room.onFast((m) => this.handleFast(m));
    if (!isHost) this.p2p = new P2PLink((m) => this.sendCtrl(m), false, iceServers, (m) => this.handleFast(m));
    this.sendCtrl({ t: 'hola' });
    this.helloTimer = setInterval(() => { if (!this.peerReady) this.sendCtrl({ t: 'hola' }); }, 500);
    this.pingTimer = setInterval(() => this.sendFast({ t: 'ping', ts: performance.now() }, 'ping'), 500);
  }

  get mode() { return this.p2p?.open ? 'P2P' : 'servidor'; }
  // devuelven una función para dejar de escuchar
  onInput(cb) { this.inputCbs.push(cb); return () => { this.inputCbs = this.inputCbs.filter((c) => c !== cb); }; }
  onCtrl(cb) { this.ctrlCbs.push(cb); return () => { this.ctrlCbs = this.ctrlCbs.filter((c) => c !== cb); }; }

  handleCtrl(m) {
    this.lastHeard = performance.now();
    if (m.t === 'hola') {
      if (!this.peerReady) {
        this.peerReady = true;
        this.sendCtrl({ t: 'hola' });
        if (this.isHost && !this.p2p) this.p2p = new P2PLink((s) => this.sendCtrl(s), true, this.iceServers, (x) => this.handleFast(x));
      }
      return;
    }
    if (m.t === 'rtc') { this.p2p?.signal(m); return; }
    for (const cb of this.ctrlCbs) cb(m);
  }

  handleFast(m) {
    this.lastHeard = performance.now();
    if (m.t === 'ping') { this.sendFast({ t: 'pong', ts: m.ts }, 'ping'); return; }
    if (m.t === 'pong') { const r = performance.now() - m.ts; if (r >= 0 && r < 5000) this.rtt = this.rtt * 0.8 + r * 0.2; return; }
    for (const cb of this.inputCbs) cb(m);
  }

  // Simulación de mala conexión para pruebas (?lag=)
  later(fn, droppable) {
    if (droppable && TEST.loss && Math.random() < TEST.loss) return;
    if (!TEST.lag && !TEST.jitter) return fn();
    setTimeout(fn, TEST.lag + Math.random() * TEST.jitter);
  }

  sendFast(o, ch = 'in') {
    if (this.closed) return;
    this.later(() => { if (!(this.p2p && this.p2p.send(o))) this.room.sendFast(o, ch); }, true);
  }
  sendCtrl(o) {
    if (this.closed) return;
    this.later(() => this.room.sendCtrl(o), false);
  }

  close() {
    this.closed = true;
    clearInterval(this.helloTimer); clearInterval(this.pingTimer);
    this.p2p?.close();
    this.room.close();
  }
}

// ---------------------------------------------------------------------
//  Rollback (estilo GGPO)
// ---------------------------------------------------------------------
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export class RollbackSession {
  constructor(game, link, localSide, opts = {}) {
    this.g = game; this.link = link; this.local = localSide;
    this.D = opts.delay ?? 2;            // frames de retraso de entrada (suaviza las correcciones)
    this.MAXP = opts.maxPrediction ?? 10; // máximo de frames que se predicen al rival
    this.localIn = []; this.remoteIn = [];
    for (let f = 0; f <= this.D; f++) { this.localIn[f] = 0; this.remoteIn[f] = 0; }
    this.localAssigned = this.D; this.remoteConfirmed = this.D;
    this.localChanges = []; this.lastLocalMask = 0; this.unsent = false;
    this.peerAck = 0;
    this.used = [];
    this.snaps = new Map();
    this.hashes = new Map();
    this.pending = null;
    this.remoteFrame = 0; this.remoteFrameAt = performance.now();
    this.sendCounter = 0; this.skip = 0; this.lastResyncAsk = 0; this.checkedHash = 0;
    this.stats = { rollbacks: 0, depth: 0, stalls: 0, skips: 0, desyncs: 0 };
    this.readMask = opts.readMask || readLocalMask;
    this.unsub = [link.onInput((m) => this.onMessage(m)), link.onCtrl((m) => this.onCtrl(m))];
  }

  dispose() { for (const u of this.unsub) u(); }

  remoteMask(f) { return f <= this.remoteConfirmed ? this.remoteIn[f] : this.remoteIn[this.remoteConfirmed]; }

  // Un "tick" de 1/60 s. Devuelve false si hubo que esperar al rival.
  tick() {
    const g = this.g;
    if (this.pending != null) this.rollback();
    if (g.frame + 1 - this.remoteConfirmed > this.MAXP) { this.stats.stalls++; this.send(); return false; }
    // Sincronía: si vamos por delante del rival, esperamos un frame de vez en cuando
    const remoteNow = this.remoteFrame + ((performance.now() - this.remoteFrameAt) + this.link.rtt / 2) / (1000 / 60);
    if (g.frame - remoteNow > 2 && (++this.skip % 3 === 0)) { this.stats.skips++; this.send(); return false; }
    const next = g.frame + 1;
    const lm = this.readMask();
    const af = next + this.D;
    this.localIn[af] = lm; this.localAssigned = af;
    if (lm !== this.lastLocalMask) { this.localChanges.push([af, lm]); this.lastLocalMask = lm; this.unsent = true; }
    this.simulate(next);
    this.send();
    this.prune();
    return true;
  }

  simulate(f) {
    const g = this.g;
    this.snaps.set(f, g.saveState());
    const rm = this.remoteMask(f);
    this.used[f] = rm;
    const lm = this.localIn[f] ?? 0;
    g.setInputMasks(this.local === 0 ? lm : rm, this.local === 0 ? rm : lm);
    g.simStep();
    if (f % 60 === 0) this.hashes.set(f, g.hashState());
  }

  rollback() {
    const from = this.pending; this.pending = null;
    const g = this.g, end = g.frame;
    if (from > end) return;
    const snap = this.snaps.get(from);
    if (!snap) { console.warn('rollback sin estado guardado', from); return; }
    g.loadState(snap);
    g.setResim(true);
    for (let f = from; f <= end; f++) this.simulate(f);
    g.setResim(false);
    this.stats.rollbacks++; this.stats.depth = Math.max(this.stats.depth, end - from + 1);
  }

  send() {
    const p2p = this.link.mode === 'P2P';
    this.sendCounter++;
    // P2P: cada frame. Por servidor: al cambiar algo (máx. cada 2 frames) y como latido cada 6.
    if (!p2p && !(this.unsent && this.sendCounter >= 2) && this.sendCounter < 6) return;
    this.sendCounter = 0; this.unsent = false;
    const c = [];
    for (let i = this.localChanges.length - 1; i >= 0 && c.length < 200; i--) {
      const e = this.localChanges[i];
      if (e[0] <= this.peerAck) break;
      c.push(e);
    }
    c.reverse();
    const msg = { t: 'in', f: this.localAssigned, c, a: this.remoteConfirmed, cur: this.g.frame };
    const h = this.finalHash();
    if (h) msg.h = h;
    this.link.sendFast(msg);
  }

  onMessage(m) {
    if (m.t !== 'in') return;
    if (m.cur > this.remoteFrame || performance.now() - this.remoteFrameAt > 500) { this.remoteFrame = m.cur; this.remoteFrameAt = performance.now(); }
    if (m.a > this.peerAck) this.peerAck = m.a;
    if (m.f > this.remoteConfirmed) {
      const ch = new Map(m.c || []);
      let cur = this.remoteIn[this.remoteConfirmed];
      for (let k = this.remoteConfirmed + 1; k <= m.f; k++) {
        if (ch.has(k)) cur = ch.get(k);
        this.remoteIn[k] = cur;
        if (k <= this.g.frame && this.used[k] !== cur && (this.pending == null || k < this.pending)) this.pending = k;
      }
      this.remoteConfirmed = m.f;
    }
    if (m.h) this.checkHash(m.h);
  }

  // --- detección y corrección de desincronización ---
  finalHash() {
    let best = 0;
    for (const k of this.hashes.keys()) if (k <= this.remoteConfirmed && k <= this.g.frame && k > best) best = k;
    return best ? [best, this.hashes.get(best)] : null;
  }

  checkHash([k, h]) {
    if (k <= this.checkedHash || !this.hashes.has(k) || k > this.remoteConfirmed || k > this.g.frame) return;
    this.checkedHash = k;
    if (this.hashes.get(k) === h) return;
    this.stats.desyncs++;
    console.warn('Desincronización en el frame', k);
    if (this.local === 1 && performance.now() - this.lastResyncAsk > 2000) {
      this.lastResyncAsk = performance.now();
      this.link.sendCtrl({ t: 'resync' });
    }
  }

  onCtrl(m) {
    const g = this.g;
    if (m.t === 'resync' && this.local === 0) {
      // Enviamos el estado del último frame confirmado por ambos
      let k = Math.min(this.remoteConfirmed, g.frame);
      while (k > 0 && !this.snaps.has(k + 1)) k--;
      const s = this.snaps.get(k + 1) || (k === g.frame ? g.saveState() : null);
      if (s) this.link.sendCtrl({ t: 'state', f: k, s });
    }
    if (m.t === 'state' && this.local === 1) {
      if (m.f + 1 > g.frame) { g.loadState(m.s); this.snaps.clear(); return; }
      this.snaps.set(m.f + 1, m.s);
      if (this.pending == null || m.f + 1 < this.pending) this.pending = m.f + 1;
    }
  }

  prune() {
    const min = this.g.frame - 64;
    for (const k of this.snaps.keys()) if (k < min) this.snaps.delete(k);
    for (const k of this.hashes.keys()) if (k < min - 600) this.hashes.delete(k);
  }

  hash() { return fnv(JSON.stringify(this.g.saveState())); }
}

export { fnv };
