// HUD de la pelea: retrato, barra de vida, rondas ganadas, reloj, combos y letreros de cada lado.
// Solo toca el HTML cuando algo cambia (en el celular reescribirlo cada cuadro cuesta).
import { JUEGO } from './roster.js';

const $ = (id) => document.getElementById(id);
const initials = (n) => n.split(/\s+/).map((w) => w[0]).join('').slice(0, 2);
const PRAISE = [[8, '¡INHUMANO!'], [6, '¡IMPARABLE!'], [5, '¡SALVAJE!'], [4, '¡BRUTAL!'], [3, '¡BIEN!']];
// vuelve a arrancar una animación de CSS aunque el elemento ya tenga la clase
const replay = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
// url() para una variable de CSS: con ruta completa (si no, se buscaría junto a style.css)
export const cssUrl = (path) => `url("${new URL(path, document.baseURI).href}")`;

export class Hud {
  start(defs, players = []) {
    this.hp = [-1, -1]; this.wins = [-1, -1]; this.time = null;
    defs.forEach((d, i) => {
      const n = i + 1, face = $(`face${n}`);
      face.style.setProperty('--img', d.retrato ? cssUrl(d.retrato) : 'none');
      face.textContent = d.retrato ? '' : initials(d.nombre);
      face.parentElement.style.setProperty('--fc', d.color || '#444');
      $(`name${n}`).textContent = d.nombre;
      $(`player${n}`).textContent = players[i] || '';
      $(`wins${n}`).innerHTML = '<i></i>'.repeat(JUEGO.rondasParaGanar);
      for (const id of [`combo${n}`, `spec${n}`, `banner${n}`]) $(id).classList.remove('show');
    });
  }

  update(fighters, timer) {
    fighters.forEach((f, i) => {
      const n = i + 1, pct = Math.max(0, f.health / f.maxHealth * 100);
      if (pct !== this.hp[i]) {
        const fill = $(`hp${n}`), box = fill.parentElement;
        fill.style.width = pct + '%'; $(`lag${n}`).style.width = pct + '%';
        box.classList.toggle('low', pct < 30);
        if (this.hp[i] >= 0 && pct < this.hp[i]) replay(box, 'hurt');
        this.hp[i] = pct;
      }
      if (f.wins !== this.wins[i]) {
        [...$(`wins${n}`).children].forEach((w, k) => {
          const on = k < f.wins;
          if (on && !w.classList.contains('on') && this.wins[i] >= 0) replay(w, 'pop');
          w.classList.toggle('on', on);
        });
        this.wins[i] = f.wins;
      }
    });
    const tm = Math.max(0, timer);
    if (tm !== this.time) {
      const el = $('timer');
      el.textContent = tm;
      el.classList.toggle('hurry', tm > 0 && tm <= 10);
      if (tm <= 10 && this.time !== null) replay(el, 'tick');
      this.time = tm;
    }
  }

  combo(side, n) {
    const el = $(side === 0 ? 'combo1' : 'combo2');
    const praise = PRAISE.find(([k]) => n >= k)?.[1];
    el.innerHTML = `<b>${n}</b><span>GOLPES</span>${praise ? `<em>${praise}</em>` : ''}`;
    el.classList.add('show'); replay(el, 'pop');
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 1300);
  }

  special(side, nombre, color, ms = 1300) {
    const el = $(side === 0 ? 'spec1' : 'spec2');
    el.textContent = nombre;
    el.style.setProperty('--c', color || '#f80');
    el.style.animationDuration = ms + 'ms';
    replay(el, 'show');
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), ms);
  }

  banner(side, text) {
    const el = $(side === 0 ? 'banner1' : 'banner2');
    el.textContent = text;
    replay(el, 'show');
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 1600);
  }
}
