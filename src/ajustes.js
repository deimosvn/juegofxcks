// Opciones del jugador (pantalla OPCIONES). Se guardan en este navegador.
import { JUEGO } from './roster.js';

const KEY = 'fxcks-ajustes';
const phone = matchMedia('(pointer: coarse)').matches;

export const ajustes = {
  musica: 0.7,
  efectos: 0.9,
  narrador: JUEGO.voz !== false,
  calidad: phone ? 'media' : 'alta',   // 'alta' | 'media' | 'baja'
  sangre: JUEGO.sangre !== false,
  vibracion: true,
  dificultad: 'normal',               // la CPU: 'facil' | 'normal' | 'dificil' | 'pesadilla' (ai.js)
};
try { Object.assign(ajustes, JSON.parse(localStorage.getItem(KEY)) || {}); } catch { /* sin almacenamiento */ }

export function guardarAjustes() {
  try { localStorage.setItem(KEY, JSON.stringify(ajustes)); } catch { /* sin almacenamiento */ }
}

// Filas de la pantalla de opciones (etiquetas: cómo se muestra cada valor)
export const OPCIONES = [
  { id: 'dificultad', nombre: 'DIFICULTAD CPU', tipo: 'lista', valores: ['facil', 'normal', 'dificil', 'pesadilla'],
    etiquetas: { facil: 'FÁCIL', normal: 'NORMAL', dificil: 'DIFÍCIL', pesadilla: 'PESADILLA' } },
  { id: 'musica', nombre: 'MÚSICA', tipo: 'vol' },
  { id: 'efectos', nombre: 'EFECTOS', tipo: 'vol' },
  { id: 'narrador', nombre: 'NARRADOR', tipo: 'si' },
  { id: 'calidad', nombre: 'GRÁFICOS', tipo: 'lista', valores: ['baja', 'media', 'alta'] },
  { id: 'sangre', nombre: 'SANGRE', tipo: 'si' },
  { id: 'vibracion', nombre: 'VIBRACIÓN', tipo: 'si', soloCelular: true },
];
