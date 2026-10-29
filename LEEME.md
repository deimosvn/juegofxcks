# FXCKS KOMBAT

Juego de pelea 3D para el navegador (Three.js) con los compas: contra la CPU, 1 vs 1 en el mismo teclado, o
**en línea** con presencia en tiempo real (ves quién está conectado), retos, ranking y netcode con *rollback*.

## Jugar en tu computadora

```
node servidor.js
```

Abre http://localhost:8080 (no funciona abriendo el `.html` con doble clic; necesita el servidor).

| | Jugador 1 | Jugador 2 |
|---|---|---|
| Moverse / saltar / agacharse | A D W S | Flechas |
| Puño | F | K (o Num1) |
| Patada | G | L (o Num2) |
| Bloqueo | H | Ñ (o Num3) |
| Especial | R | I (o Num0) |

Abajo+Puño = gancho al aire · Abajo+Patada = barrida · Adelante+Puño = puño fuerte · Atrás+Patada = patada giratoria.
Especiales: su combinación (ej. `← → + P`) o el botón Especial (solo / adelante / abajo / atrás).
ESC = pausa con la lista de movimientos y fatalidades. En línea se puede usar cualquiera de las dos teclas o un mando.

## Peleadores

### Diego (robot)
| Especial | Entrada | Qué hace |
|---|---|---|
| PUÑO COHETE | `← → + P` | El antebrazo sale disparado con propulsor y derriba |
| LÁSER OCULAR | `↓ → + P` | Rayos de los ojos, 5 impactos. Pasa por encima si el rival se agacha |
| LLUVIA DE MISILES | `↓ ← + K` | 4 misiles desde la espalda que caen alrededor del rival |
| MODO TITÁN | `↓ ↓ + P` | Armadura 6 s: mitad de daño, sin daño por bloqueo |
| ☠ DESINTEGRACIÓN | `→ → ↓ + P` | Escaneo láser y el rival se deshace en cubos de luz |

### Alan (ingeniería aeroespacial) — trae jetpack en la espalda
| Especial | Entrada | Qué hace |
|---|---|---|
| COHETE SATURNO | `← → + P` | Cohete que acelera y explota al impactar |
| JETPACK | `→ ↓ → + K` | Despega y cae en picada sobre el rival |
| ATAQUE ORBITAL | `↓ ← + P` | Un satélite dispara un rayo desde el cielo donde está el rival |
| TURBINA | `← ← + K` | Turbina de avión: ráfaga caliente que empuja y golpea varias veces |
| ☠ DESPEGUE ESPACIAL | `↓ → ↓ + P` | Le amarra un cohete al rival y lo manda al espacio con fuegos artificiales |

### Gera (boxeo) — siempre con guantes de box
| Especial | Entrada | Qué hace |
|---|---|---|
| RÁFAGA DE JABS | `→ → + P` | 6 jabs seguidos avanzando (fallan si el rival se agacha) |
| GANCHO DEMOLEDOR | `→ ↓ → + P` | Gancho volador que lanza al rival por los aires |
| PUÑO RESORTE | `← → + P` | Un guante con resorte sale disparado a lo lejos |
| CONTRAGOLPE | `↓ ← + P` | Guardia: si le pegan, responde con un gancho imbloqueable |
| ☠ NOCAUT | `→ → → + P` | Ráfaga de golpes y un gancho que lo manda a las estrellas |

### José Cortez (nalgas)
| Especial | Entrada | Qué hace |
|---|---|---|
| NALGADA VOLADORA | `← → + K` | Se lanza de espaldas con las nalgas por delante |
| SENTÓN | `↓ ↓ + K` | Brinca y cae sentado: aplasta al de abajo y hace una onda |
| TWERK SÍSMICO | `↓ ← + K` | Cada sacudida manda una onda (7 golpes de cerca) |
| GAS NUCLEAR | `← ← + P` | Nube verde que avanza y lastima mientras estés dentro (no se bloquea) |
| ☠ APLASTE NALGÓN | `↓ ↓ ↓ + K` | Las nalgas le crecen y aplasta al rival desde el cielo |

### Conde (fuerza) — un poco más chaparro que los demás… hasta que se hace gigante
| Especial | Entrada | Qué hace |
|---|---|---|
| SÚPER GIGANTE | `↓ ↓ + P` (o el botón Especial solo) | Hace fuerza y crece 35% durante 7 s: pega 60% más, recibe 40% menos, nada lo tumba y llega más lejos. Cada paso retumba |
| EMBESTIDA DE TORO | `← → + K` | Se lanza con el hombro y tumba al rival |
| PISOTÓN SÍSMICO | `↓ ↓ + K` | Brinca y cae con todo: onda en el suelo (bloquear agachado) |
| LANZAMIENTO TITÁNICO | `← → + P` | Agarre de cerca: lo levanta sobre la cabeza y lo avienta. No se puede bloquear |
| ☠ PISOTÓN GIGANTE | `↓ → ↓ + K` | Se hace gigantesco y lo aplasta de un pisotón |

Además siguen Brasa, Escarcha, Voltio y Mole (muñecos de ejemplo).

## Escenarios
**SIX** (Cruz de Piedra, de día) · **LA CABAÑA** (de la Progreso, de día) · **CASA CHUY** (de noche, con el
Camaro blanco afuera y las hieleras de cheve) · **TEMPLO** · y **ALEATORIO**. Se eligen después de los peleadores;
en línea elige el anfitrión (quien mandó el reto) y el otro lo ve en vivo.

---

## 🌐 En línea (Firebase + Vercel)

- **Firebase Realtime Database**: lista de conectados en tiempo real (detecta desconexiones al instante),
  retos, salas, ranking y señalización.
- **WebRTC (P2P)**: durante la pelea los botones van **directo de un jugador al otro**. Si la red no lo permite,
  se usa Firebase de respaldo automáticamente.
- **Rollback**: tu personaje responde al instante; si el juego adivinó mal los botones del rival, rebobina unos
  frames y corrige sin que se note.

El proyecto `juegofxcks` ya está listo: su configuración está en [`src/firebase-config.js`](src/firebase-config.js),
la Realtime Database está creada (Estados Unidos, us-central1) con las reglas de
[`database.rules.json`](database.rules.json) publicadas, y el acceso anónimo está activado.
**En Vercel no hay que poner variables.**

Si algún día usas otro proyecto de Firebase, pega su `firebaseConfig` en ese archivo y en su consola haz esto una vez:

1. **Compilación → Realtime Database → Crear base de datos** (cualquier ubicación; el juego encuentra la dirección
   solo) → empezar en *modo bloqueado*.
2. En esa base de datos, pestaña **Reglas** → pega el contenido de [`database.rules.json`](database.rules.json) → **Publicar**.
3. **Compilación → Authentication → Comenzar → Método de acceso → Anónimo → Habilitar**.

Si algo falta, el lobby del juego te dice exactamente qué.

### Vercel
Importa el repositorio en Vercel (Framework: **Other**) y listo: cada `git push` a `main` vuelve a publicar.
Opcional: variables `FIREBASE_*` (ver [`.env.example`](.env.example)) para usar otro proyecto de Firebase, y
`TURN_URLS` / `TURN_USERNAME` / `TURN_CREDENTIAL` si a alguien no le conecta directo (redes muy cerradas).

Para probar el modo en línea sin Firebase: http://localhost:8080/herramientas/prueba-online.html (dos jugadores
en la misma pantalla con mala conexión simulada) o abre el juego con `?local=1` en dos pestañas.
Con `prueba-online.html?firebase=1` los dos jugadores se conectan por la base de datos real.

---

## ➕ Agregar a otro compa

1. **Modelo** de Meshy o Tripo: cuerpo completo, de pie, de frente, en **pose de T o de A**; exporta **FBX** o **GLB** con texturas.
2. Con `node servidor.js` corriendo abre **http://localhost:8080/herramientas/convertir.html**, sube el archivo,
   escribe el **id** (ej. `juan`), revisa las animaciones y dale **GUARDAR EN EL JUEGO** → crea
   `assets/peleadores/<id>/modelo.glb` (~3 MB, con esqueleto automático) y `retrato.png`.
3. En [`src/roster.js`](src/roster.js) copia el bloque de otro peleador y cambia `id`, `nombre`, `color`,
   `modelo`, `retrato`, `especiales`, `fatality` y `frase`.

Tipos de especial: `proyectil`, `congelar`, `teletransporte`, `embestida`, `terremoto`, `gancho`,
`uppercut_volador`, `poder`, `rayo`; robot: `puno_cohete`, `laser`, `misiles`, `armadura`; aeroespacial:
`cohete`, `jetpack`, `orbital`, `turbina`; boxeo: `rafaga`, `resorte`, `contra`; nalgas: `culazo`, `senton`,
`twerk`, `gas`; fuerza: `gigante`, `agarre`. Fatalidades: `explosion`, `incinerar`, `congelar_romper`, `rayo`,
`aplastar`, `desintegrar`, `despegue`, `nocaut`, `nalgon`, `pisoton`. Accesorios: `accesorios: ['guantes']` y/o `['jetpack']`.

Si el modelo sale de lado, usa "Girar" en el convertidor (o `rotacionY` en el roster). `escala` cambia la estatura
(Conde usa `0.94`). Lo mejor es que el modelo venga en **pose de T o de A**; si viene con los brazos pegados al cuerpo
(como Conde) también funciona: el esqueleto automático separa brazo y cuerpo sin estirar la ropa.
