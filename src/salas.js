// =====================================================================
//  SALAS: varios compas en un mismo cuarto. Pelean de dos en dos ("la reta":
//  el que gana se queda, el que pierde se forma al final de la fila) y los
//  demás ven la pelea en vivo.
//
//  - arenas/{id}: nombre, miembros (cada quien escribe el suyo) y el turno
//    (quién pelea ahora). Cualquiera de la sala puede pasar al siguiente turno;
//    las transacciones evitan que dos lo hagan a la vez.
//  - vivo/{id}/{turno}: el anfitrión de la pelea manda las entradas ya
//    confirmadas de los dos jugadores. La simulación es determinista, así que
//    cada espectador vuelve a jugar la misma pelea, un segundo atrás.
// =====================================================================
import { PELEADORES } from './roster.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const CHUNK = 15;          // frames por paquete de la transmisión (4 por segundo)
const LEAD = 40;           // colchón del espectador (~0.7 s) para que no se trabe
const SHOW_RESULT = 5000;  // ms con el resultado en pantalla antes de la siguiente pelea
const hex = (m) => ((m ?? 0) & 255).toString(16).padStart(2, '0');

// ------------------------------------------------------------------ transmisión
// La manda el anfitrión: solo frames en los que ya conoce los botones de los dos.
class Streamer {
  constructor(store, arena, turno, session) {
    this.store = store; this.base = `vivo/${arena}/${turno}`; this.s = session; this.sent = 0; this.k = 0;
    store.remove(`vivo/${arena}`).catch(() => {});   // la transmisión anterior ya no sirve
  }
  flush(final = false) {
    const s = this.s, upto = Math.min(s.remoteConfirmed, s.localAssigned);
    const [m1, m2] = s.local === 0 ? [s.localIn, s.remoteIn] : [s.remoteIn, s.localIn];
    while (upto - this.sent >= CHUNK || (final && upto > this.sent)) {
      const from = this.sent + 1, n = Math.min(CHUNK, upto - this.sent);
      let a = '', b = '';
      for (let f = from; f < from + n; f++) { a += hex(m1[f]); b += hex(m2[f]); }
      this.store.set(`${this.base}/k${String(this.k++).padStart(5, '0')}`, { f: from, a, b }).catch(() => {});
      this.sent += n;
    }
  }
}

// ------------------------------------------------------------------ espectador
// Repite la pelea con las entradas que van llegando (hace las veces de RollbackSession).
class WatchSession {
  constructor(game) { this.g = game; this.m1 = []; this.m2 = []; this.avail = 0; this.playing = false; this.n = 0; this.heard = performance.now(); }
  add({ f, a, b }) {
    for (let i = 0; i * 2 < a.length; i++) { this.m1[f + i] = parseInt(a.substr(i * 2, 2), 16); this.m2[f + i] = parseInt(b.substr(i * 2, 2), 16); }
    while (this.m1[this.avail + 1] !== undefined) this.avail++;
    this.heard = performance.now();
  }
  get behind() { return this.avail - this.g.frame; }
  get catchingUp() { return this.behind > LEAD + 180; }
  step() { const g = this.g, f = g.frame + 1; g.setInputMasks(this.m1[f], this.m2[f]); g.simStep(); }
  tick() {
    const g = this.g, behind = this.behind;
    if (!this.playing) { if (behind < LEAD) return false; this.playing = true; }
    if (behind <= 0) { this.playing = false; return false; }   // se acabó lo recibido: juntar otro colchón
    if (this.catchingUp) {
      // entró con la pelea ya empezada: adelantar sin efectos ni sonidos hasta casi alcanzarla
      const t0 = performance.now();
      g.ffwd = true;
      while (this.behind > LEAD && performance.now() - t0 < 8) this.step();
      g.ffwd = false;
      return true;
    }
    this.step();
    if (behind > LEAD + 40 && ++this.n % 4 === 0) this.step();   // se juntó retraso: un poco más rápido
    return true;
  }
  dispose() {}
}

// ------------------------------------------------------------------ salas
export class Salas {
  constructor(game) {
    this.g = game; this.list = {}; this.cur = null; this.loaded = false;
    this.done = new Set();     // turnos y salas que este cliente ya atendió
    this.streamer = null; this.watching = null;
    $('createArena').onclick = () => this.create();
    $('arena-play').onclick = () => this.toggleJuega();
    $('arena-watch').onclick = () => this.watchNow();
    $('arena-share').onclick = () => this.share();
  }

  start(net) {
    this.net = net; this.store = net.store;
    this.off = this.store.onValue('arenas', (v) => this.onArenas(v || {}), (err) => {
      console.warn('salas', err);
      $('arenas').innerHTML = '<li class="small">Para usar salas hay que publicar las reglas nuevas de database.rules.json en Firebase.</li>';
    });
    net.onReconnect(() => this.rejoin());
  }

  async stop() {
    this.off?.(); this.off = null;
    await this.leave();
  }

  get me() { return this.net.uid; }
  path(...p) { return ['arenas', this.cur.id, ...p].join('/'); }

  // ---------------------------------------------------------------- datos
  onArenas(all) {
    this.list = all; this.loaded = true;
    this.renderList();
    const c = this.cur;
    if (c) {
      const a = all[c.id];
      if (!a) this.closed();
      else if (!a.miembros?.[this.me]) this.rejoin();   // se cayó la conexión un momento: volver a su lugar
      else {
        c.data = a; c.mine = a.miembros[this.me];
        this.arbitrate(c.id, a);
        this.follow(c.id, a);
        this.renderArena();
      }
    }
    // salas que se quedaron sin nadie (alguien cerró la app sin salir): se borran
    for (const [id, a] of Object.entries(all)) {
      if (a.miembros || this.done.has('x' + id)) continue;
      this.done.add('x' + id);
      setTimeout(() => { this.store.remove(`vivo/${id}`).catch(() => {}); this.store.remove(`arenas/${id}`).catch(() => {}); }, 800 + Math.random() * 1500);
    }
    if (this.pending) {
      const id = this.pending; this.pending = null;
      if (all[id]?.miembros) this.join(id, true); else this.g.toast('Esa sala ya no existe');
    }
  }

  // Entrar desde una liga compartida (?sala=): en cuanto se conozcan las salas
  joinWhenReady(id) { this.pending = id; if (this.loaded) this.onArenas(this.list); }

  member(juega) { const now = this.store.now(); return { nombre: this.net.name, juega, orden: now, entro: now, racha: 0 }; }

  async create() {
    if (this.cur) return this.g.showArena();
    const id = this.store.key('arenas');
    const nombre = `Sala de ${this.net.name}`.slice(0, 24);
    try {
      await this.store.set(`arenas/${id}`, { nombre, creada: this.store.now(), miembros: { [this.me]: this.member(true) } });
    } catch (err) { console.warn(err); this.g.toast('No se pudo crear la sala'); return; }
    sfx.confirm();
    this.enter(id);
    this.g.toast('¡Sala lista! Compártela con tus compas', 3500);
  }

  async join(id, juega) {
    if (this.cur?.id === id) return this.g.showArena();
    if (!this.list[id]?.miembros) { this.g.toast('Esa sala ya no existe'); return; }
    if (this.cur) await this.leave();
    try { await this.store.set(`arenas/${id}/miembros/${this.me}`, this.member(juega)); } catch (err) {
      console.warn(err); this.g.toast('Esa sala ya no existe'); return;
    }
    sfx.confirm();
    this.enter(id);
  }

  enter(id) {
    this.cur = { id, data: this.list[id] || null };
    this.cur.offDisc = this.store.onDisconnectRemove(`arenas/${id}/miembros/${this.me}`);
    this.net.setStatus('sala', this.list[id]?.nombre || 'una sala');
    this.g.showArena();
    this.onArenas(this.list);   // lo que ya está pasando adentro (p. ej. una pelea en vivo)
  }

  async leave() {
    const c = this.cur, g = this.g;
    if (!c) return;
    this.cur = null;
    this.stopWatching();
    if (g.online?.arena === c.id) g.leaveRoom(true);   // abandonar la pelea cuenta como perder
    c.offDisc?.();
    const ms = this.list[c.id]?.miembros || {};
    const last = Object.keys(ms).every((u) => u === this.me);
    if (last) await this.store.remove(`vivo/${c.id}`).catch(() => {});
    await this.store.remove(`arenas/${c.id}/miembros/${this.me}`).catch(() => {});
    if (last) await this.store.remove(`arenas/${c.id}`).catch(() => {});
    this.net?.setStatus('libre');
  }

  closed() {
    const g = this.g;
    this.cur = null;
    this.stopWatching();
    g.toast('La sala se cerró');
    if (!g.online) g.openLobby();
  }

  rejoin() {
    const c = this.cur;
    if (!c?.mine || Date.now() - (c.rejoined || 0) < 3000) return;
    c.rejoined = Date.now();
    this.store.set(this.path('miembros', this.me), c.mine).catch(() => {});
    c.offDisc?.();
    c.offDisc = this.store.onDisconnectRemove(this.path('miembros', this.me));
  }

  toggleJuega() {
    const c = this.cur;
    if (!c?.mine) return;
    const juega = !c.mine.juega;
    // al volver a la fila te formas al final
    this.store.update(this.path('miembros', this.me), juega ? { juega, orden: this.store.now() } : { juega }).catch(() => {});
    sfx.select();
  }

  // ---------------------------------------------------------------- turnos
  // Los dos siguientes de la fila (el que acaba de perder, hasta atrás)
  pickPair(id, a, loser = null) {
    const q = Object.entries(a.miembros || {}).filter(([, m]) => m.juega)
      .map(([uid, m]) => ({ uid, nombre: m.nombre, k: uid === loser ? Infinity : (m.orden || 0) }))
      .sort((x, y) => (x.k === y.k ? (x.uid < y.uid ? -1 : 1) : x.k - y.k));
    if (q.length < 2) return null;
    return { id: this.store.key(`arenas/${id}/turno`), p1: q[0].uid, n1: q[0].nombre, p2: q[1].uid, n2: q[1].nombre, estado: 'nuevo', t: this.store.now() };
  }

  // Cambia el turno solo si sigue siendo el mismo (otro pudo haberlo cambiado ya)
  patch(id, turno, fields) {
    return this.store.transaction(`arenas/${id}/turno`, (cur) => (cur?.id === turno && !cur.fin ? { ...cur, ...fields } : undefined)).catch(() => false);
  }
  // abandono: no terminó la pelea · ausente: ni siquiera contestó (se pasa a "solo ver")
  finish(id, turno, ganador, perdedor, abandono = false, ausente = false) {
    return this.patch(id, turno, { fin: { ganador, perdedor, ...(abandono ? { abandono: true } : {}), ...(ausente ? { ausente: true } : {}) } });
  }

  // Lo que mantiene viva la sala. Lo hace "el árbitro" (el que lleva más tiempo en ella) y,
  // al terminar una pelea, los dos que pelearon.
  arbitrate(id, a) {
    const me = this.me, t = a.turno || null, ms = a.miembros;
    const arb = Object.keys(ms).sort((x, y) => ((ms[x].entro || 0) - (ms[y].entro || 0)) || (x < y ? -1 : 1))[0];
    if (t?.fin) {
      const fought = t.p1 === me || t.p2 === me;
      if ((fought || arb === me) && !this.done.has('f' + t.id)) {
        this.done.add('f' + t.id);
        // los dos que pelearon a destiempo (para no chocar); el árbitro después, por si ellos ya no están
        setTimeout(() => this.next(id, t.id), fought ? SHOW_RESULT + (t.p2 === me ? 700 : 0) : SHOW_RESULT + 4000);
      }
      return;
    }
    if (arb !== me) return;
    if (t) {
      const gone = [t.p1, t.p2].find((u) => !ms[u]);
      if (gone && !this.done.has('g' + t.id + gone)) {
        // se salió de la sala; si solo se le fue la señal un momento, vuelve solo antes de 8 s
        this.done.add('g' + t.id + gone);
        setTimeout(() => {
          const now = this.list[id];
          if (now?.turno?.id === t.id && !now.miembros?.[gone]) this.finish(id, t.id, gone === t.p1 ? t.p2 : t.p1, gone, true);
        }, 8000);
      } else if (t.estado === 'nuevo' && !this.done.has('n' + t.id)) {
        // el anfitrión nunca abrió la pelea (app congelada o sin señal): pierde su turno
        this.done.add('n' + t.id);
        setTimeout(() => { const now = this.list[id]?.turno; if (now?.id === t.id && now.estado === 'nuevo') this.finish(id, t.id, t.p2, t.p1, true, true); }, 15000);
      }
      return;
    }
    const pair = this.pickPair(id, a);
    if (pair) this.store.transaction(`arenas/${id}/turno`, (cur) => (cur ? undefined : pair)).catch(() => {});
  }

  async next(id, ended) {
    const a = this.list[id], t = a?.turno;
    if (!t || t.id !== ended || !t.fin) return;
    const { ganador, perdedor, abandono, ausente } = t.fin;
    const pair = this.pickPair(id, a, perdedor);
    const ok = await this.store.transaction(`arenas/${id}/turno`, (cur) => (cur?.id === ended ? pair : undefined)).catch(() => false);
    if (!ok) return;
    // el que perdió se forma al final; el que ganó suma a su racha
    const ms = a.miembros || {}, up = {};
    if (ms[perdedor]) Object.assign(up, { [`miembros/${perdedor}/orden`]: this.store.now(), [`miembros/${perdedor}/racha`]: 0 });
    // el que no contestó deja de estar en la fila (si regresa, le pica a QUIERO JUGAR)
    if (ms[perdedor] && ausente) up[`miembros/${perdedor}/juega`] = false;
    if (ms[ganador] && !abandono) up[`miembros/${ganador}/racha`] = (ms[ganador].racha || 0) + 1;
    if (Object.keys(up).length) this.store.update(`arenas/${id}`, up).catch(() => {});
  }

  // Qué hace este cliente según el turno: pelear, ver la pelea o regresar a la sala
  follow(id, a) {
    const g = this.g, me = this.me, t = a.turno || null, o = g.online;
    // mi pelea ya pasó (hay otro turno o ninguno): de regreso a la sala
    if (o?.arena === id && (!t || t.id !== o.turno)) g.leaveRoom(false);
    // me toca pelear (el anfitrión abre la pelea; el otro entra cuando ya está abierta)
    if (t && !t.fin && (t.p1 === me || t.p2 === me) && !g.online && this.cur.turno !== t.id) {
      const host = t.p1 === me;
      if (host ? t.estado === 'nuevo' : t.estado !== 'nuevo') {
        this.cur.turno = t.id;
        this.stopWatching();
        if (host) this.host(id, t);
        else g.enterRoom(t.id, t.p1, t.n1, false, { arena: id, turno: t.id });
      }
    }
    // espectador: empezó una pelea, a verla (salvo que se haya salido de esa)
    const live = t && !t.fin && t.estado === 'peleando' && t.p1 !== me && t.p2 !== me;
    if (live && !this.watching && g.screen === 'arena' && this.cur.skip !== t.id) this.watch(id, t);
  }

  async host(id, t) {
    try { await this.net.createMatchRoom(t.id, t.p2); } catch (err) { console.warn('sala de pelea', err); return; }
    if (!(await this.patch(id, t.id, { estado: 'eligiendo' }))) return;
    if (this.cur?.id === id && !this.g.online) this.g.enterRoom(t.id, t.p2, t.n2, true, { arena: id, turno: t.id });
  }

  // main.js avisa cuando empieza la pelea, cuando termina y cuando alguien se sale
  matchStarted(o) {
    if (!o.isHost) return;
    this.patch(o.arena, o.turno, { estado: 'peleando', d1: o.defs[0].id, d2: o.defs[1].id, escenario: o.stageId });
    this.streamer = new Streamer(this.store, o.arena, o.turno, this.g.session);
  }
  matchOver(o) {
    if (o.finSent) return;
    o.finSent = true;
    const won = this.g.winnerSide === o.side;
    this.finish(o.arena, o.turno, won ? this.me : o.peerUid, won ? o.peerUid : this.me);
  }
  leftMatch(o, quit) {
    if (this.streamer) { this.streamer.flush(true); this.streamer = null; }
    if (o.finSent) return;
    o.finSent = true;
    // sin terminar: el que se salió pierde (si se fue el otro, gano yo)
    this.finish(o.arena, o.turno, quit ? o.peerUid : this.me, quit ? this.me : o.peerUid, true, !!o.ausente);
  }

  // ---------------------------------------------------------------- ver peleas
  async watch(id, t) {
    const g = this.g;
    const d1 = PELEADORES.find((d) => d.id === t.d1), d2 = PELEADORES.find((d) => d.id === t.d2);
    if (!d1 || !d2) { this.cur.skip = t.id; g.toast('Esta pelea tiene un peleador que no tienes: actualiza el juego'); return; }
    const w = this.watching = { id: t.id, arena: id };
    g.mode = 'watch';
    const models = await g.loadModels(d1, d2);
    if (this.watching !== w) { for (const m of models) m.dispose(); return; }
    await g.startMatch(d1, d2, models, t.escenario);
    $('player1').textContent = t.n1; $('player2').textContent = t.n2;
    w.ws = g.session = new WatchSession(g);
    g.acc = 0;
    w.off = this.store.onChildAdded(`vivo/${id}/${t.id}`, (k, v) => { if (v?.a) w.ws.add(v); });
    $('netbadge').classList.remove('hidden');
  }

  watchNow() {
    const t = this.cur?.data?.turno;
    if (!t || t.fin || t.estado !== 'peleando' || t.p1 === this.me || t.p2 === this.me || this.watching) return;
    this.cur.skip = null;
    this.watch(this.cur.id, t);
  }

  stopWatching(byUser = false) {
    const w = this.watching, g = this.g;
    if (!w) return;
    this.watching = null;
    w.off?.();
    if (byUser && this.cur) this.cur.skip = w.id;   // no volver a meterlo a esa misma pelea
    if (g.mode === 'watch') { g.quitMatch(); g.mode = 'online'; }
    if (this.cur && !g.online) {
      g.showArena();
      // si mientras tanto ya empezó la siguiente pelea, a verla
      if (!byUser && this.cur.data) this.follow(this.cur.id, this.cur.data);
    }
  }

  // Cada cuadro: mandar la transmisión y, viendo, saber cuándo terminó
  update() {
    this.streamer?.flush();
    const w = this.watching, g = this.g;
    if (!w?.ws || g.mode !== 'watch') return;
    const t = this.cur?.data?.turno, same = t?.id === w.id;
    const seenEnd = g.phase === 'matchEnd' && g.phaseT > 240;
    const dry = w.ws.behind <= 0 && performance.now() - w.ws.heard > 1500;   // ya no llega nada
    const quit = same && t.fin?.abandono;
    if (seenEnd || (dry && (!same || quit))) {
      if (!seenEnd) g.toast(quit ? `${t.fin.perdedor === t.p1 ? t.n1 : t.n2} abandonó la pelea` : 'Se acabó la pelea');
      this.stopWatching();
    }
  }

  badge() {
    const w = this.watching, a = this.cur?.data;
    if (!w || !a) return;
    const n = Object.keys(a.miembros || {}).length;
    const s = !w.ws ? 'cargando…' : w.ws.catchingUp ? 'alcanzando la pelea…' : !w.ws.playing ? 'esperando señal…' : `${n} en la sala`;
    const html = `<span class="bad">●</span> EN VIVO · ${esc(a.nombre)} · ${s}`;
    if (this.badgeHtml !== html) { this.badgeHtml = html; $('netbadge').innerHTML = html; }
  }

  // ---------------------------------------------------------------- pantalla
  renderList() {
    const rows = Object.entries(this.list).filter(([, a]) => a?.miembros && a.nombre)
      .sort((x, y) => (y[1].creada || 0) - (x[1].creada || 0));
    const html = rows.length ? rows.map(([id, a]) => {
      const n = Object.keys(a.miembros).length, t = a.turno;
      const info = !t ? 'esperando retadores' : t.fin ? 'cambiando de pelea'
        : `${esc(t.n1)} vs ${esc(t.n2)}${t.estado === 'peleando' ? ' · <b class="live">EN VIVO</b>' : ''}`;
      const btns = this.cur?.id === id ? `<button data-go="${esc(id)}">ENTRAR</button>`
        : `<button data-play="${esc(id)}">JUGAR</button><button class="ghost" data-see="${esc(id)}">VER</button>`;
      return `<li><div class="aname">${esc(a.nombre)}</div><div class="ainfo">${n} adentro · ${info}</div>${btns}</li>`;
    }).join('') : '<li class="small">No hay salas todavía. Crea una y comparte la liga.</li>';
    if (this.listHtml === html) return;
    this.listHtml = html;
    const ul = $('arenas');
    ul.innerHTML = html;
    ul.querySelectorAll('[data-play]').forEach((b) => { b.onclick = () => this.join(b.dataset.play, true); });
    ul.querySelectorAll('[data-see]').forEach((b) => { b.onclick = () => this.join(b.dataset.see, false); });
    ul.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => this.g.showArena(); });
  }

  renderArena() {
    const c = this.cur, a = c?.data;
    if (!a) return;
    const me = this.me, t = a.turno || null, ms = a.miembros || {};
    const who = (uid, n) => `<b class="${uid === me ? 'me' : ''}">${esc(n)}${uid === me ? ' (tú)' : ''}</b>`;
    let fight;
    if (!t) {
      const q = Object.values(ms).filter((m) => m.juega).length;
      fight = `<p class="arena-status">${q < 2 ? `Falta${q === 1 ? '' : 'n'} ${2 - q} en la fila para empezar` : 'Armando la pelea…'}</p>`;
    } else {
      const st = t.fin ? `Ganó <b>${esc(t.fin.ganador === t.p1 ? t.n1 : t.n2)}</b>${t.fin.abandono ? ' (el otro se salió)' : ''}`
        : t.estado === 'peleando' ? '<span class="live">● EN VIVO</span>' : 'Eligiendo peleadores…';
      fight = `<div class="arena-vs">${who(t.p1, t.n1)}<span>VS</span>${who(t.p2, t.n2)}</div><p class="arena-status">${st}</p>`;
    }
    // la reta: los que quieren jugar, en el orden en que les toca
    const fighting = t && !t.fin ? [t.p1, t.p2] : [];
    const queue = Object.entries(ms).filter(([, m]) => m.juega)
      .sort((x, y) => ((x[1].orden || 0) - (y[1].orden || 0)) || (x[0] < y[0] ? -1 : 1));
    const qhtml = queue.map(([uid, m]) => `<li class="${uid === me ? 'me' : ''}">${esc(m.nombre)}${uid === me ? ' (tú)' : ''}`
      + `${m.racha > 1 ? ` <span class="streak">🔥${m.racha}</span>` : ''}${fighting.includes(uid) ? ' <small>peleando</small>' : ''}</li>`).join('')
      || '<li class="small">Nadie quiere jugar</li>';
    const watchers = Object.entries(ms).filter(([, m]) => !m.juega).map(([uid, m]) => esc(m.nombre) + (uid === me ? ' (tú)' : ''));
    const html = [a.nombre, fight, qhtml, watchers.join(', '), Object.keys(ms).length, !!c.mine?.juega].join('§');
    if (this.arenaHtml === html) return;
    this.arenaHtml = html;
    $('arena-name').textContent = a.nombre;
    $('arena-fight').innerHTML = fight;
    $('arena-queue').innerHTML = qhtml;
    $('arena-watchers').innerHTML = watchers.length ? watchers.join(', ') : 'Nadie, todos quieren pelear';
    $('arena-count').textContent = `(${Object.keys(ms).length})`;
    $('arena-play').textContent = c.mine?.juega ? 'SOLO QUIERO VER' : 'QUIERO JUGAR';
    $('arena-watch').classList.toggle('hidden', !(t && !t.fin && t.estado === 'peleando' && !fighting.includes(me)));
  }

  share() {
    const a = this.cur?.data;
    if (!a) return;
    const url = new URL(location.pathname, location.origin);
    url.searchParams.set('sala', this.cur.id);
    const text = `¡Métete a mi sala de FXCKS KOMBAT! (${a.nombre})`;
    if (navigator.share) { navigator.share({ title: 'FXCKS KOMBAT', text, url: url.href }).catch(() => {}); return; }
    const show = () => this.g.toast(url.href, 8000);
    if (navigator.clipboard) navigator.clipboard.writeText(url.href).then(() => this.g.toast('Liga copiada: pégala en WhatsApp'), show);
    else show();
  }
}
