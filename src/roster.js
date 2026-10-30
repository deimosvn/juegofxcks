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
//    traje      (opcional) modelo que se pone con un especial tipo 'titan': { modelo, escala }
//    especialesTitan  (opcional) lo que sacan los mismos botones mientras trae el traje puesto
//    intro      (opcional) pose de presentación en la ronda 1 (una animación de especial: jojo, flexion, carga…)
//    victoria   (opcional) pose al ganar: 0 puño arriba, 1 brazos en V, 2 bíceps, 3 brazos cruzados (si no, según su estilo)
//
//  Entradas (input) — relativas a hacia dónde mira el peleador:
//    →  adelante    ←  atrás    ↓  abajo    ↑  arriba
//    P  puño        K  patada
//    Ejemplo: '← → + P'  = atrás, adelante y puño
//
//  Tipos de especial disponibles:
//    proyectil, teletransporte, embestida, terremoto, gancho,
//    congelar, uppercut_volador, poder, rayo
//    robot: puno_cohete, laser, misiles, armadura, titan (se pone el traje: más rápido y aguanta más)
//    robot con traje: plasma (cañón), megalaser (rayo gordo desde el pecho), propulsores (embestida
//      volando), descarga (eléctrica de cerca, deja mareado)
//    aeroespacial: cohete, jetpack, orbital, turbina, camaro (su Camaro atropella al rival; `modelo` = el carro)
//    boxeo: rafaga, resorte, contra (y uppercut_volador)
//    nalgas: culazo, senton, twerk, gas
//    fuerza: gigante (se hace gigante y súper fuerte), agarre (lo levanta y lo avienta)
//    pescadero: pescado, kawama (caguama en parábola), lluvia_pescados, chela (chorro de cerveza)
//    barbero: tijeras (bumerán), rapado (máquina, varios toques), navaja (tajo hacia arriba), talco (lo marea)
//
//  Tipos de fatality disponibles:
//    explosion, incinerar, congelar_romper, rayo, aplastar, desintegrar,
//    despegue, nocaut, nalgon, pisoton, pescadote, corte (silla de barbero)
//
//  accesorios: ['guantes'] (guantes de box, color con colorGuantes), ['jetpack'],
//    ['pescadero'] (pescado y caguama en la mano), ['barbero'] (tijeras, máquina, navaja y brocha)
//  rig: { colgando: false }  si el esqueleto automático corta la ropa entre brazo y cuerpo
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
    // MODO TITÁN: se pone este traje de robot (Robot X de Meshy)
    traje: { modelo: 'assets/peleadores/diego-robot/modelo.glb', escala: 1.06 },
    stats: { velocidad: 1.05, fuerza: 1, vida: 100 },
    especiales: [
      { nombre: 'PUÑO COHETE', tipo: 'puno_cohete', input: '← → + P', color: '#ff8a00', danio: 14 },
      { nombre: 'LÁSER OCULAR', tipo: 'laser', input: '↓ → + P', color: '#ff2a3a', danio: 18 },
      { nombre: 'LLUVIA DE MISILES', tipo: 'misiles', input: '↓ ← + K', color: '#ffb000', danio: 20 },
      { nombre: 'MODO TITÁN', tipo: 'titan', input: '↓ ↓ + P', color: '#4fd8ff', duracion: 7, velocidad: 1.7 },
    ],
    // Con el traje puesto, el botón de especial (solo / adelante / abajo / atrás) saca las armas del robot
    especialesTitan: [
      { nombre: 'CAÑÓN DE PLASMA', tipo: 'plasma', input: '← → + P', color: '#4fd8ff', danio: 16 },
      { nombre: 'PROPULSORES', tipo: 'propulsores', input: '→ → + K', color: '#4fd8ff', danio: 15 },
      { nombre: 'MEGA LÁSER', tipo: 'megalaser', input: '↓ → + P', color: '#ff2a3a', danio: 24 },
      { nombre: 'DESCARGA ELÉCTRICA', tipo: 'descarga', input: '↓ ↓ + P', color: '#9fe8ff', danio: 16 },
    ],
    fatality: { nombre: 'DESINTEGRACIÓN', tipo: 'desintegrar', input: '→ → ↓ + P', color: '#4fd8ff' },
    frase: 'Sistema de combate: victoria confirmada.',
    intro: 'carga',
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
    // CAMARAZO va primero: es el que sale con el botón de especial solo. TURBINA, con su combinación.
    especiales: [
      { nombre: 'CAMARAZO', tipo: 'camaro', input: '→ → + P', color: '#cfd6dd', danio: 16, modelo: 'assets/props/camaro.glb' },
      { nombre: 'COHETE SATURNO', tipo: 'cohete', input: '← → + P', color: '#ff7a1a', danio: 12 },
      { nombre: 'JETPACK', tipo: 'jetpack', input: '→ ↓ → + K', color: '#4fd8ff', danio: 13 },
      { nombre: 'ATAQUE ORBITAL', tipo: 'orbital', input: '↓ ← + P', color: '#7fe3ff', danio: 14 },
      { nombre: 'TURBINA', tipo: 'turbina', input: '← ← + K', color: '#ffd27a', danio: 12 },
    ],
    fatality: { nombre: 'DESPEGUE ESPACIAL', tipo: 'despegue', input: '↓ → ↓ + P', color: '#ff7a1a' },
    frase: 'Houston, tenemos un ganador.',
    intro: 'jojo',
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
    intro: 'rafaga',
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
    intro: 'twerk',
  },
  {
    id: 'conde',
    nombre: 'CONDE',
    color: '#b3261e',
    modelo: 'assets/peleadores/conde/modelo.glb',
    retrato: 'assets/peleadores/conde/retrato.png',
    escala: 0.94, rotacionY: 0,   // un poco más chaparro que los demás
    stats: { velocidad: 0.95, fuerza: 1.1, vida: 105 },
    especiales: [
      { nombre: 'SÚPER GIGANTE', tipo: 'gigante', input: '↓ ↓ + P', color: '#ff7a1a', duracion: 7 },
      { nombre: 'EMBESTIDA DE TORO', tipo: 'embestida', input: '← → + K', color: '#ff3b2f', danio: 12 },
      { nombre: 'PISOTÓN SÍSMICO', tipo: 'terremoto', input: '↓ ↓ + K', color: '#c98b4a', danio: 13 },
      { nombre: 'LANZAMIENTO TITÁNICO', tipo: 'agarre', input: '← → + P', color: '#ffd23a', danio: 15 },
    ],
    fatality: { nombre: 'PISOTÓN GIGANTE', tipo: 'pisoton', input: '↓ → ↓ + K', color: '#ff7a1a' },
    frase: 'Ahora sí, ¿quién es el chaparro?',
    intro: 'flexion',
  },
  {
    id: 'emi',
    nombre: 'EMI',
    color: '#1f8fbf',
    modelo: 'assets/peleadores/emi/modelo.glb',
    retrato: 'assets/peleadores/emi/retrato.png',
    escala: 1, rotacionY: 0,
    accesorios: ['pescadero'],
    stats: { velocidad: 1, fuerza: 1, vida: 100 },
    especiales: [
      { nombre: 'PESCADAZO', tipo: 'pescado', input: '← → + P', color: '#8fd3ff', danio: 10 },
      { nombre: 'KAWAMA VOLADORA', tipo: 'kawama', input: '↓ → + P', color: '#ffb000', danio: 12 },
      { nombre: 'LLUVIA DE PESCADOS', tipo: 'lluvia_pescados', input: '↓ ← + K', color: '#4fb8ff', danio: 15 },
      { nombre: 'BAÑO DE CHELA', tipo: 'chela', input: '← ← + K', color: '#ffd23a', danio: 12 },
    ],
    fatality: { nombre: 'PESCADO GIGANTE', tipo: 'pescadote', input: '→ ↓ → + K', color: '#4fb8ff' },
    frase: '¡Pásele, pásele, que hoy hay paliza fresca!',
    intro: 'chela',
  },
  {
    id: 'ramces',
    nombre: 'RAMCES',
    color: '#d62828',
    modelo: 'assets/peleadores/ramces/modelo.glb',
    retrato: 'assets/peleadores/ramces/retrato.png',
    escala: 1, rotacionY: 0,
    rig: { colgando: false },      // brazos un poco separados del mandil
    accesorios: ['barbero'],        // tijeras, máquina, navaja y brocha en la mano
    stats: { velocidad: 1.05, fuerza: 1, vida: 100 },
    especiales: [
      { nombre: 'TIJERAS BUMERÁN', tipo: 'tijeras', input: '← → + P', color: '#d9dee3', danio: 10 },
      { nombre: 'RAPADO EXPRESS', tipo: 'rapado', input: '→ → + P', color: '#9fe8ff', danio: 15 },
      { nombre: 'NAVAJAZO', tipo: 'navaja', input: '↓ → + P', color: '#e8eef2', danio: 13 },
      { nombre: 'BROCHAZO DE TALCO', tipo: 'talco', input: '↓ ← + K', color: '#ffffff', danio: 6 },
    ],
    fatality: { nombre: 'CORTE AL RAS', tipo: 'corte', input: '↓ ← → + P', color: '#d62828' },
    frase: '¡Siguiente! ¿Degradado o rapado?',
    intro: 'afilar',
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
