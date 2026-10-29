// =====================================================================
//  PELEADORES  —  aquí se agregan tus amigos
// =====================================================================
//
//  Cada peleador:
//    id         carpeta en assets/peleadores/<id>/
//    nombre     nombre que sale en pantalla
//    color      color del traje provisional y de la interfaz
//    modelo     ruta al .glb o .fbx (null = muñeco provisional)
//    retrato    imagen para la pantalla de selección (null = iniciales)
//    escala     ajuste fino del tamaño (1 = 1.85 m de alto)
//    rotacionY  grados para girar el modelo si mira hacia otro lado
//    stats      velocidad / fuerza (1 = normal), vida (100 = normal)
//    especiales lista de habilidades (ver tipos en src/specials.js)
//    fatality   remate final cuando sale "¡ACÁBALO!"
//
//  Entradas (input) — relativas a hacia dónde mira el peleador:
//    →  adelante    ←  atrás    ↓  abajo    ↑  arriba
//    P  puño        K  patada
//    Ejemplo: '← → + P'  = atrás, adelante y puño
//
//  Tipos de especial disponibles:
//    proyectil, teletransporte, embestida, terremoto, gancho,
//    congelar, uppercut_volador, poder, rayo
//    robot: puno_cohete, laser, misiles, armadura
//    aeroespacial: cohete, jetpack, orbital, turbina
//    boxeo: rafaga, resorte, contra (y uppercut_volador)
//    nalgas: culazo, senton, twerk, gas
//
//  Tipos de fatality disponibles:
//    explosion, incinerar, congelar_romper, rayo, aplastar, desintegrar,
//    despegue, nocaut, nalgon
//
//  accesorios: ['guantes'] (guantes de box, color con colorGuantes) y/o ['jetpack']
//
//  Modelos: pasa el .fbx/.glb de Meshy o Tripo por herramientas/convertir.html
//  (lo reduce, le pone esqueleto automático y crea el retrato).
// =====================================================================

export const JUEGO = {
  titulo: 'FXCKS KOMBAT',
  rondasParaGanar: 2,
  tiempoRonda: 99,
  sangre: true,
  voz: true,          // narrador con voz del navegador
};

// Animaciones compartidas (Mixamo, "Without Skin"). Si un archivo no existe
// se usa una animación procedural. Ver LEEME.md para cuáles descargar.
export const ANIMACIONES = {
  idle:          'assets/animaciones/idle.fbx',
  caminar:       'assets/animaciones/caminar.fbx',
  caminar_atras: 'assets/animaciones/caminar_atras.fbx',
  saltar:        'assets/animaciones/saltar.fbx',
  agacharse:     'assets/animaciones/agacharse.fbx',
  bloqueo:       'assets/animaciones/bloqueo.fbx',
  bloqueo_bajo:  'assets/animaciones/bloqueo_bajo.fbx',
  puno:          'assets/animaciones/puno.fbx',
  puno_fuerte:   'assets/animaciones/puno_fuerte.fbx',
  patada:        'assets/animaciones/patada.fbx',
  patada_giratoria: 'assets/animaciones/patada_giratoria.fbx',
  gancho_arriba: 'assets/animaciones/gancho_arriba.fbx',
  barrida:       'assets/animaciones/barrida.fbx',
  patada_aerea:  'assets/animaciones/patada_aerea.fbx',
  golpeado:      'assets/animaciones/golpeado.fbx',
  caer:          'assets/animaciones/caer.fbx',
  levantarse:    'assets/animaciones/levantarse.fbx',
  mareado:       'assets/animaciones/mareado.fbx',
  victoria:      'assets/animaciones/victoria.fbx',
  especial:      'assets/animaciones/especial.fbx',
  lanzar:        'assets/animaciones/lanzar.fbx',
};

export const PELEADORES = [
  {
    id: 'diego',
    nombre: 'DIEGO',
    color: '#1f5fbf',
    modelo: 'assets/peleadores/diego/modelo.glb',
    retrato: 'assets/peleadores/diego/retrato.png',
    escala: 1, rotacionY: 0,
    stats: { velocidad: 1.05, fuerza: 1, vida: 100 },
    especiales: [
      { nombre: 'PUÑO COHETE', tipo: 'puno_cohete', input: '← → + P', color: '#ff8a00', danio: 11 },
      { nombre: 'LÁSER OCULAR', tipo: 'laser', input: '↓ → + P', color: '#ff2a3a', danio: 14 },
      { nombre: 'LLUVIA DE MISILES', tipo: 'misiles', input: '↓ ← + K', color: '#ffb000', danio: 16 },
      { nombre: 'MODO TITÁN', tipo: 'armadura', input: '↓ ↓ + P', color: '#4fd8ff', duracion: 6 },
    ],
    fatality: { nombre: 'DESINTEGRACIÓN', tipo: 'desintegrar', input: '→ → ↓ + P', color: '#4fd8ff' },
    frase: 'Sistema de combate: victoria confirmada.',
  },
  {
    id: 'alan',
    nombre: 'ALAN',
    color: '#f28c28',
    modelo: 'assets/peleadores/alan/modelo.glb',
    retrato: 'assets/peleadores/alan/retrato.png',
    escala: 1, rotacionY: 0,
    accesorios: ['jetpack'],
    stats: { velocidad: 1, fuerza: 1, vida: 105 },
    especiales: [
      { nombre: 'COHETE SATURNO', tipo: 'cohete', input: '← → + P', color: '#ff7a1a', danio: 12 },
      { nombre: 'JETPACK', tipo: 'jetpack', input: '→ ↓ → + K', color: '#4fd8ff', danio: 13 },
      { nombre: 'ATAQUE ORBITAL', tipo: 'orbital', input: '↓ ← + P', color: '#7fe3ff', danio: 14 },
      { nombre: 'TURBINA', tipo: 'turbina', input: '← ← + K', color: '#ffd27a', danio: 12 },
    ],
    fatality: { nombre: 'DESPEGUE ESPACIAL', tipo: 'despegue', input: '↓ → ↓ + P', color: '#ff7a1a' },
    frase: 'Houston, tenemos un ganador.',
  },
  {
    id: 'gera',
    nombre: 'GERA',
    color: '#1f9d55',
    modelo: 'assets/peleadores/gera/modelo.glb',
    retrato: 'assets/peleadores/gera/retrato.png',
    escala: 1, rotacionY: 0,
    accesorios: ['guantes'], colorGuantes: '#d1121b',
    stats: { velocidad: 1.1, fuerza: 1.05, vida: 100 },
    especiales: [
      { nombre: 'RÁFAGA DE JABS', tipo: 'rafaga', input: '→ → + P', color: '#ffd23a', danio: 14 },
      { nombre: 'GANCHO DEMOLEDOR', tipo: 'uppercut_volador', input: '→ ↓ → + P', color: '#ff3b2f', danio: 14 },
      { nombre: 'PUÑO RESORTE', tipo: 'resorte', input: '← → + P', color: '#d1121b', danio: 11 },
      { nombre: 'CONTRAGOLPE', tipo: 'contra', input: '↓ ← + P', color: '#ffffff', danio: 16 },
    ],
    fatality: { nombre: 'NOCAUT', tipo: 'nocaut', input: '→ → → + P', color: '#ffd23a' },
    frase: '¡Ding, ding! Se acabó la pelea.',
  },
  {
    id: 'jose',
    nombre: 'JOSÉ CORTEZ',
    color: '#e84393',
    modelo: 'assets/peleadores/jose/modelo.glb',
    retrato: 'assets/peleadores/jose/retrato.png',
    escala: 1, rotacionY: 0,
    stats: { velocidad: 0.95, fuerza: 1.1, vida: 110 },
    especiales: [
      { nombre: 'NALGADA VOLADORA', tipo: 'culazo', input: '← → + K', color: '#ff7ab8', danio: 11 },
      { nombre: 'SENTÓN', tipo: 'senton', input: '↓ ↓ + K', color: '#ffb3d1', danio: 13 },
      { nombre: 'TWERK SÍSMICO', tipo: 'twerk', input: '↓ ← + K', color: '#ff4fa3', danio: 14 },
      { nombre: 'GAS NUCLEAR', tipo: 'gas', input: '← ← + P', color: '#9be15d', danio: 12 },
    ],
    fatality: { nombre: 'APLASTE NALGÓN', tipo: 'nalgon', input: '↓ ↓ ↓ + K', color: '#ff7ab8' },
    frase: 'Con estas nalgas no se juega.',
  },
  {
    id: 'fuego',
    nombre: 'BRASA',
    color: '#d8401f',
    modelo: null,          // ej: 'assets/peleadores/fuego/modelo.fbx'
    retrato: null,         // ej: 'assets/peleadores/fuego/retrato.png'
    escala: 1, rotacionY: 0,
    stats: { velocidad: 1, fuerza: 1, vida: 100 },
    especiales: [
      { nombre: 'BOLA DE FUEGO', tipo: 'proyectil', input: '← → + P', color: '#ff6a00', danio: 10 },
      { nombre: 'PUÑO DEL DRAGÓN', tipo: 'uppercut_volador', input: '→ ↓ → + P', color: '#ffb000', danio: 13 },
      { nombre: 'METEORO', tipo: 'terremoto', input: '↓ ↓ + K', color: '#ff3300', danio: 12 },
    ],
    fatality: { nombre: 'INCINERACIÓN', tipo: 'incinerar', input: '→ → ← + K', color: '#ff5500' },
    frase: '¡Te dejé hecho cenizas!',
  },
  {
    id: 'hielo',
    nombre: 'ESCARCHA',
    color: '#2f7fd8',
    modelo: null, retrato: null,
    escala: 1, rotacionY: 0,
    stats: { velocidad: 1, fuerza: 0.95, vida: 100 },
    especiales: [
      { nombre: 'RAYO HELADO', tipo: 'congelar', input: '↓ → + P', color: '#9fe8ff', danio: 4 },
      { nombre: 'DESLIZ GLACIAL', tipo: 'embestida', input: '← → + K', color: '#bff3ff', danio: 10 },
      { nombre: 'TELETRANSPORTE', tipo: 'teletransporte', input: '↓ ← + K', color: '#7fd4ff', danio: 9 },
    ],
    fatality: { nombre: 'CONGELAR Y ROMPER', tipo: 'congelar_romper', input: '→ ↓ → + P', color: '#aef' },
    frase: 'Quédate frío.',
  },
  {
    id: 'rayo',
    nombre: 'VOLTIO',
    color: '#e3c21a',
    modelo: null, retrato: null,
    escala: 1, rotacionY: 0,
    stats: { velocidad: 1.15, fuerza: 0.9, vida: 95 },
    especiales: [
      { nombre: 'TORMENTA', tipo: 'rayo', input: '↓ ← + P', color: '#c9e6ff', danio: 12 },
      { nombre: 'TORPEDO', tipo: 'embestida', input: '← ← → + P', color: '#fff27a', danio: 11 },
      { nombre: 'SALTO ESPACIAL', tipo: 'teletransporte', input: '↓ ↑', color: '#9cf', danio: 9 },
    ],
    fatality: { nombre: 'ELECTROCUCIÓN', tipo: 'rayo', input: '← → ← + K', color: '#bdf' },
    frase: 'Rápido como un rayo.',
  },
  {
    id: 'tanque',
    nombre: 'MOLE',
    color: '#4c8a2e',
    modelo: null, retrato: null,
    escala: 1.08, rotacionY: 0,
    stats: { velocidad: 0.85, fuerza: 1.25, vida: 115 },
    especiales: [
      { nombre: 'CADENA', tipo: 'gancho', input: '← ← + P', color: '#d0d0d0', danio: 5 },
      { nombre: 'FURIA', tipo: 'poder', input: '↓ ↓ + P', color: '#ff2a2a', danio: 0 },
      { nombre: 'PISOTÓN', tipo: 'terremoto', input: '↓ ↓ + K', color: '#b38b4d', danio: 13 },
    ],
    fatality: { nombre: 'APLASTAMIENTO', tipo: 'aplastar', input: '↓ ↓ ↓ + K', color: '#a77' },
    frase: '¿Eso fue todo?',
  },
];
