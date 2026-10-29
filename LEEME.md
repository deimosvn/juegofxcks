# FXCKS KOMBAT

Juego de pelea 3D para el navegador (Three.js) con los compas: contra la CPU, 1 vs 1 en el mismo teclado, o
**en línea** con presencia en tiempo real (ves quién está conectado), retos, **salas con espectadores**, ranking y
netcode con *rollback*.

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

## 📱 En el celular (y como app)
- **Joystick** en la mitad izquierda (aparece donde pones el dedo): moverse, saltar (arriba) y agacharse (abajo).
- **PUÑO · PATADA · BLOQ. · ESPECIAL** a la derecha. ESPECIAL solo = especial 1, adelante = 2, abajo = 3, atrás = 4;
  arriba del botón sale el nombre del que vas a hacer.
- **☠ FATALITY**: aparece en “¡ACÁBALO!” y la marca por ti. **❚❚** = pausa.
- Se juega mejor acostado (horizontal); al entrar a jugar se pone en pantalla completa.
- No hace zoom aunque toques dos veces rápido (ni en la pelea ni en los menús) ni con dos dedos.
- **Instalarlo como app**: en Android sale el botón “INSTALAR EL JUEGO” en el menú (o menú del navegador → Instalar).
  En iPhone: Safari → Compartir → “Agregar a inicio”. Después de abrirlo una vez, contra la CPU funciona **sin internet**.

## Peleadores

### Diego (robot) — y con MODO TITÁN se pone un traje de robot
| Especial | Entrada | Qué hace |
|---|---|---|
| PUÑO COHETE | `← → + P` | El antebrazo sale disparado con propulsor y derriba (14 de daño) |
| LÁSER OCULAR | `↓ → + P` | Rayos de los ojos, 5 impactos (18 en total). Pasa por encima si el rival se agacha |
| LLUVIA DE MISILES | `↓ ← + K` | 4 misiles desde la espalda que caen alrededor del rival (20 en total) |
| MODO TITÁN | `↓ ↓ + P` (o Especial + atrás) | Se pone el traje de robot 7 s: camina y salta mucho más rápido, recibe 35% menos daño, no le hace daño bloquear y el botón de especial saca las armas del robot |
| ☠ DESINTEGRACIÓN | `→ → ↓ + P` | Escaneo láser y el rival se deshace en cubos de luz |

Con el traje puesto (al final parpadea y se le cae en pedazos):

| Arma del robot | Entrada | Qué hace |
|---|---|---|
| CAÑÓN DE PLASMA | `← → + P` (o Especial solo) | Bola de plasma grande que tumba (16) |
| PROPULSORES | `→ → + K` (o Especial + adelante) | Sale volando a ras de suelo y embiste (15) |
| MEGA LÁSER | `↓ → + P` (o Especial + abajo) | Rayo gordo desde el pecho, 8 impactos; agacharse no lo esquiva |
| DESCARGA ELÉCTRICA | `↓ ↓ + P` (o Especial + atrás) | Rayos alrededor, 4 toques de cerca; el último deja al rival mareado |

### Alan (ingeniería aeroespacial) — trae jetpack en la espalda… y su Camaro
| Especial | Entrada | Qué hace |
|---|---|---|
| CAMARAZO | `→ → + P` (o el botón Especial solo) | Hace una pose de JoJo (con sus ゴゴゴ) y su Camaro entra por detrás del rival y lo atropella (16). No se bloquea: hay que saltarlo. Luego se queda derrapando junto a Alan y se va |
| COHETE SATURNO | `← → + P` (o Especial + adelante) | Cohete que acelera y explota al impactar |
| JETPACK | `→ ↓ → + K` (o Especial + abajo) | Despega y cae en picada sobre el rival |
| ATAQUE ORBITAL | `↓ ← + P` (o Especial + atrás) | Un satélite dispara un rayo desde el cielo donde está el rival |
| TURBINA | `← ← + K` (solo con la combinación) | Turbina de avión: ráfaga caliente que empuja y golpea varias veces |
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

### Emi (pescadero) — pescados y caguamas
| Especial | Entrada | Qué hace |
|---|---|---|
| PESCADAZO | `← → + P` (o el botón Especial solo) | Avienta un pescado que va dando vueltas |
| KAWAMA VOLADORA | `↓ → + P` | Avienta una caguama en parábola: se rompe y deja al rival mareado |
| LLUVIA DE PESCADOS | `↓ ← + K` | Chifla y le caen 5 pescados encima (el último lo tumba) |
| BAÑO DE CHELA | `← ← + K` | Agita la caguama y lo baña: varios chorros que lo empujan |
| ☠ PESCADO GIGANTE | `→ ↓ → + K` | Un pescado gigante sale del suelo y se lo traga |

### Ramces (barbero) — trae sus tijeras, máquina, navaja y brocha
| Especial | Entrada | Qué hace |
|---|---|---|
| TIJERAS BUMERÁN | `← → + P` (o Especial solo) | Avienta las tijeras girando: van, se regresan a su mano y pegan de ida (10) y de vuelta (6) |
| RAPADO EXPRESS | `→ → + P` (o Especial + adelante) | Se lanza con la máquina y le rapa la cabeza: 6 toques con pelos volando (agachado se esquiva) |
| NAVAJAZO | `↓ → + P` (o Especial + abajo) | Tajo de navaja de abajo hacia arriba que lo manda por los aires |
| BROCHAZO DE TALCO | `↓ ← + K` (o Especial + atrás) | Nube de talco en la cara: si lo agarra de cerca se queda mareado tosiendo |
| ☠ CORTE AL RAS | `↓ ← → + P` | Sale su silla de barbero, lo sienta, le pone la capa y le pasa la máquina… afila la navaja y le quedó demasiado al ras: la cabeza sale volando |

Además siguen Brasa, Escarcha, Voltio y Mole (muñecos de ejemplo).

## 🔊 Sonidos
Todo es sonido sintetizado (no hay archivos de audio). Además de golpes, especiales y el narrador:
pasos (de metal con el traje de robot), puños y patadas suenan distinto, el combo sube de tono, campana al empezar
cada round, tic-tac en los últimos 10 segundos, el público en el K.O. y al final, tambores en la fatality, fanfarria
de victoria, corazón cuando te queda poca vida, pajaritos cuando alguien está mareado y ambiente en cada escenario
(carretera y pájaros en SIX, viento en La Cabaña y el Templo, grillos de noche en Casa Chuy).

## Escenarios
**SIX** (Cruz de Piedra, de día) · **LA CABAÑA** (de la Progreso, de día) · **CASA CHUY** (de noche, con el
Camaro blanco afuera y las hieleras de cheve) · **TEMPLO** · y **ALEATORIO**. Se eligen después de los peleadores;
en línea elige el anfitrión (quien mandó el reto) y el otro lo ve en vivo.

---

## 🏟️ Salas: la reta y peleas en vivo

En **EN LÍNEA** está el panel **SALAS**:

- **+ CREAR SALA** y luego **COMPARTIR LIGA** (en el celular abre WhatsApp y demás). Quien abre la liga entra directo a la sala.
- En la lista de salas: **JUGAR** te forma en la fila; **VER** entra solo a mirar. Adentro puedes cambiar con
  **QUIERO JUGAR / SOLO QUIERO VER**.
- **La reta**: pelean los dos primeros de la fila. El que gana se queda (🔥 cuenta su racha) y el que pierde se forma al
  final. La siguiente pelea se arma sola unos segundos después.
- Los que esperan **ven la pelea en vivo** (como un segundo atrás). Si entras a media pelea, se adelanta sola hasta
  alcanzarla. **✕ SALIR** (o ESC) regresa a la sala; **VER LA PELEA** te vuelve a meter.
- Si alguien se sale a media pelea pierde, y si no contesta cuando le toca, pasa a "solo ver".

Cómo funciona: el que pelea a la izquierda manda a Firebase los botones ya confirmados de los dos (unos cuantos bytes
por segundo) y, como la simulación es determinista, cada espectador vuelve a jugar exactamente la misma pelea.
Necesita las reglas de [`database.rules.json`](database.rules.json) publicadas (secciones `arenas` y `vivo`).

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
en la misma pantalla con mala conexión simulada; `?n=3` o `?n=4` abre más ventanas para probar salas con espectadores)
o abre el juego con `?local=1` en varias pestañas.
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
`cohete`, `jetpack`, `orbital`, `turbina`, `camaro` (con `modelo`: el carro); robot con traje: `titan`, `plasma`, `megalaser`, `propulsores`, `descarga`; boxeo: `rafaga`, `resorte`, `contra`; nalgas: `culazo`, `senton`,
`twerk`, `gas`; fuerza: `gigante`, `agarre`; barbero: `tijeras`, `rapado`, `navaja`, `talco`. Fatalidades: `explosion`, `incinerar`, `congelar_romper`, `rayo`,
`aplastar`, `desintegrar`, `despegue`, `nocaut`, `nalgon`, `pisoton`, `pescadote`, `corte`. Accesorios: `accesorios: ['guantes']` y/o `['jetpack']`.

Traje que se pone con un especial `titan` (como Diego): pasa el modelo por el convertidor con otro id (ej. `diego-robot`)
y en el roster agrega `traje: { modelo: 'assets/peleadores/diego-robot/modelo.glb', escala: 1.06 }` y la lista
`especialesTitan` con lo que hace el botón de especial mientras lo trae puesto. Los modelos de Meshy con la textura
partida en muchas islas también se reducen bien: el convertidor lo detecta solo.

Objetos que salen en un especial (como el Camaro de Alan): abre el convertidor con
`convertir.html?src=/assets/props/raw_camaro/archivo.fbx&prop=camaro&largo=4.8&rot=180` (`largo` en metros; con
`rot` gíralo hasta que el frente vea hacia la línea roja) y guarda: queda en `assets/props/camaro.glb`. Pon los
originales en `assets/props/raw_<algo>/` (no se suben a GitHub).

Si el esqueleto automático corta la ropa entre el brazo y el cuerpo (salen pedacitos flotando cerca de las manos),
pon `rig: { colgando: false }` en el roster (como Ramces); en el convertidor se prueba con `&colgando=0`.

Si el modelo sale de lado, usa "Girar" en el convertidor (o `rotacionY` en el roster). `escala` cambia la estatura
(Conde usa `0.94`). Lo mejor es que el modelo venga en **pose de T o de A**; si viene con los brazos pegados al cuerpo
(como Conde) también funciona: el esqueleto automático separa brazo y cuerpo sin estirar la ropa.
