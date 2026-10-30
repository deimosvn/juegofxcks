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
Especiales: su combinación (ej. `← → + P`) o el botón Especial: solo / adelante / abajo / atrás / abajo-adelante /
abajo-atrás (especial 1 a 6). **Saltando + Especial** = el especial en el aire de cada quien.
En “¡ACÁBALO!”: la entrada de la fatality soltando el botón = **FATALITY**; dejándolo presionado = **BRUTALITY**.
ESC = pausa con la lista de movimientos, fatalities y brutalities (ahí mismo **O** abre las opciones). En línea se puede usar
cualquiera de las dos teclas o un mando.

## 🎬 Presentación
- **Pantalla de título**: “PRESIONA CUALQUIER TECLA” (o “TOCA PARA EMPEZAR”); con eso arranca el sonido.
- **VS** antes de cada pelea: los retratos entran de lado, “VS” de metal y el escenario (también en línea y al ver
  una sala; mientras tanto cargan los modelos).
- **Ronda 1**: la cámara pasa de cerca por cada peleador mientras hace su pose (`intro` en el roster) y sale su nombre.
- **K.O.**: destello, cámara lenta, la imagen se pone gris y la cámara se acerca ladeada al que cae. Al ganar la ronda se
  acerca al ganador; al final da vueltas alrededor de él con la tabla de resultados (golpes, combo máximo, especiales).
- Letreros: “¡PRIMER GOLPE!”, contador de combos que rebota (¡BIEN!, ¡BRUTAL!, ¡IMPARABLE!…) y “¡VICTORIA PERFECTA!”
  si ganas sin que te peguen. Entre rondas la pantalla se va a negro.
- Imagen “de cine”: brillo (bloom) en focos, rayos y chispas, viñeta, grano fino, estelas en los golpes fuertes,
  onda de choque en cada impacto, polvo al saltar y caer, y orillas rojas cuando te queda poca vida.

## ☠ Fatalities de cine
Cada fatality se ve como escena de película ([`src/fatal.js`](src/fatal.js)). Lo que pasa y cuándo sigue en
`specials.js` (en línea las dos computadoras lo calculan igual); la de Diego ahora dura más (5 s), así que para hacerla
en línea los dos tienen que tener la versión nueva del juego.
- **Franjas negras** arriba y abajo, se esconde el HUD (y los botones del celular) y abajo a la izquierda sale el
  **título**: “FATALITY · CORTE AL RAS · RAMCES”.
- **Cámara propia de cada una**, con cortes y movimientos: primeros planos, contrapicados, vueltas alrededor del que va a
  morir y persecuciones (al que sale volando de un gancho, al cohete de Alan, a la cabeza que vuela con Ramces).
- **Luz de escenario** sobre los dos, el resto se oscurece y la imagen toma el color de la fatality (rojo sangre, azul
  hielo, naranja fuego…). En la de Diego la imagen “se descompone” como señal digital cuando disparan todos juntos.
- **El remate**: destello, colores corridos, zoom de golpe, temblor, cámara lenta (contra la CPU; en línea no) y un
  trancazo grave. Al empezar suena un golpe de tráiler y al final sale **FATALITY** (o **BRUTALITY**) tal cual, como en
  las maquinitas: letras que escurren sangre y el narrador lo dice en inglés con voz grave.
- **Poses**: el que va a morir ve venir lo que le cae y se cubre temblando; Alan saluda a su cohete; Voltio alza los
  brazos para llamar a los rayos.
- **Sin trabones**: al empezar la pelea se prepara, sin que se vea, todo lo que solo sale en las fatalities (la luz, el
  traje y los robots de Diego, los rayos…), dibujándolo una vez en la imagen intermedia del post-proceso. Antes la
  primera fatality se detenía ~½ s mientras la tarjeta de video armaba sus sombreados.

| Quién | Cómo se ve |
|---|---|
| Ramces | la silla sube, vuelta lenta alrededor de la cabeza con la máquina, primer plano de la navaja con destello, tajo en cámara lenta y la cámara sigue a la cabeza |
| Diego | se pone el traje de robot y bajan del cielo cuatro robots como el suyo (rojo, azul, amarillo y morado); cada uno lo ataca a su manera: láser de los ojos que lo escanea, balas de plasma, descargas eléctricas y lluvia de misiles. Al final disparan todos juntos con el rayo del pecho de Diego, el otro flota entre los rayos y se deshace en cubos de luz; los robots celebran y se van volando |
| Alan | el cohete amarrado, despegue desde el piso entre humo, lo persigue hasta el cielo y fuegos artificiales de colores |
| Gera | ráfaga con tres ángulos, gancho en cámara lenta y lo sigue volando hasta que brilla como estrella |
| José | lo sigue en el brinco, desde los ojos del otro ve caer las nalgas gigantes y el aplastón sale con destello rosa |
| Conde | la cámara se queda y él crece hasta salirse del cuadro; contrapicado con el pie gigante sobre el otro |
| Emi | primer plano chiflando, el pescado rompe el piso entre agua, se lo traga y se vuelve a clavar |

## 💀 Brutalities
Con “¡ACÁBALO!” marca la entrada de tu fatality y **deja presionado el botón** (P o K) ~medio segundo: te pones rojo y
tiemblas mientras carga, y en vez de la fatality sale la **BRUTALITY** (si lo sueltas antes, es FATALITY). En el
celular: toca ☠ para la fatality o déjalo presionado para la brutality. La CPU a veces hace una y a veces la otra.
Tiempos en [`src/brutalidades.js`](src/brutalidades.js) (en línea las dos computadoras lo calculan igual) y la escena de
cine en [`src/cine-brutal.js`](src/cine-brutal.js).

| Quién | Brutality | Qué pasa |
|---|---|---|
| Diego | DESINSTALACIÓN | Ráfaga de puños de robot, lo escanea con los ojos y le sale una barra “DESINSTALANDO RIVAL…” que sube a 100% mientras el otro parpadea como señal mala… **ERROR 404: RIVAL NO ENCONTRADO** y revienta |
| Alan | TRIPLE ATROPELLO | Pose de JoJo y su Camaro lo atropella, se echa de reversa sobre él y lo vuelve a atropellar; hace donas y se va. Queda aplastado como calcomanía entre las marcas de llanta (toma desde arriba) |
| Gera | CABEZA DE PIÑATA | Ráfaga a la cara: con cada golpe la cabeza se le infla y se pone roja… el gancho la revienta como piñata: confeti, dulces y el cuerpo sin cabeza |
| José | TRAGADO POR LA TIERRA | Menea las nalgas tan fuerte que el piso se agrieta bajo el otro y se lo traga (se hunde gritando); el piso se cierra y sale una tumba: “Q.E.P. — se lo tragó la tierra” |
| Conde | MUÑECO DE TRAPO | Lo agarra de los tobillos y lo azota contra el piso de un lado y del otro, cada vez más rápido; el último lo clava de cabeza: quedan las piernas saliendo del piso |
| Emi | PEZ GLOBO | Cuatro pescadazos, le mete un pez globo a la boca, se infla con púas y flota… y revienta en lluvia de pescaditos |
| Ramces | YA ESTÁS RASURADO | Afila la navaja, lo atraviesa en un parpadeo y queda de espaldas cerrándola mientras los cortes se quedan brillando en el aire… “clic”: el otro se cae en pedazos |
| Brasa · Escarcha · Voltio · Mole | CARBONIZADO · ESTATUA ROTA · CORTOCIRCUITO · APLANADO | Combo de ocho golpes, gancho que lo levanta y revienta en el aire en fuego, hielo, rayos o polvo |

## ✈️ Ataques nuevos
- **Especial en el aire** (saltando + Especial): se queda un instante arriba y se lanza en picada hacia el rival; si
  pega rebota hacia atrás y si cae al piso sin pegar algunos hacen una onda. Cada quien con su estilo: PATADA METEORO
  de Diego (botas cohete), REENTRADA de Alan (envuelto en fuego como cápsula espacial), MAZAZO de Gera, PEDO COHETE de
  José, PLANCHA de Conde, CLAVADO de Emi, NAVAJA EN PICADA de Ramces, y fuego, hielo, rayo y bala de cañón para los demás.
- **Un especial más para cada uno** (Especial + abajo-adelante, o su combinación): ver las tablas de abajo.

## 🤖 Dificultad de la CPU
Al elegir peleador contra la CPU, en el panel de la CPU: **◀ NORMAL ▶** (con el mouse, tocándolo o con **Q / E**).
También está en OPCIONES. Sale en el VS y arriba de la barra de vida de la CPU.

| | Reacciona en | Se cubre | Castiga tus golpes fallados | Combos |
|---|---|---|---|---|
| **FÁCIL** | ~0.4 s | casi nunca | casi nunca | golpes sueltos |
| **NORMAL** | ~0.27 s | a veces | a veces | a veces |
| **DIFÍCIL** | ~0.17 s | seguido, y adivina arriba/abajo | casi siempre | sí, y te remata en el aire |
| **PESADILLA** | ~0.1 s | casi siempre | siempre | siempre; te recibe cuando saltas |

La CPU ve lo que haces unos cuadros tarde (como una persona): en fácil le da tiempo de pegarte aunque la veas venir,
en pesadilla reacciona casi al instante. Está en [`src/ai.js`](src/ai.js) (`DIFICULTADES`).

## 🥋 Cómo se mueven
Las animaciones las calcula el juego en [`src/anim.js`](src/anim.js) con cinemática inversa: cada golpe dice a dónde
va la mano o el pie y el esqueleto se acomoda solo.
- **Guardia de pelea** con el pecho hacia la cámara (se ven las caras): mano y pie de adelante del lado lejano, la mano
  y la pierna de poder del lado de la cámara. Cada quien rebota a su ritmo (el boxeador más, los pesados menos).
- **Los pies se quedan plantados**: no resbalan al caminar (el paso sigue a lo que avanzas), se mantienen planos en el
  piso, y si te empujan das un paso para no caerte.
- **Golpes con peso**: preparan, giran la cadera y se estiran hasta donde está el rival (no lo atraviesan). El recto
  entra con un paso, la patada recoge la rodilla y suelta la pierna con el pie estirado, la giratoria da la vuelta
  completa, la barrida apoya la mano en el piso.
- **Reacciones según dónde te pegan**: en la cara la cabeza se va para atrás, en el cuerpo te doblas, abajo se te
  dobla la pierna. Al salir volando das vueltas en el aire, rebotas en el piso y te levantas sentándote y parándote.
- Saltos con **marometa** sobre su centro, aterrizaje que se hunde y rebota, y cuatro poses de victoria
  (`victoria` en el roster: 0 puño arriba, 1 brazos en V, 2 bíceps, 3 brazos cruzados).

## ⚙️ Opciones
**Dificultad de la CPU**, volumen de **música** y de **efectos**, **narrador** sí/no, **gráficos** (ALTA, MEDIA para
celulares, BAJA para celulares viejos: sin efectos ni sombras), **sangre** sí/no y **vibración** (celular). Se guardan
en el navegador.

## 📱 En el celular (y como app)
- **Joystick** en la mitad izquierda (aparece donde pones el dedo): moverse, saltar (arriba) y agacharse (abajo).
- **PUÑO · PATADA · BLOQ. · ESPECIAL** a la derecha. ESPECIAL solo = especial 1, adelante = 2, abajo = 3, atrás = 4,
  abajo-adelante = 5, abajo-atrás = 6; saltando, el especial en el aire. Arriba del botón sale el nombre del que vas a hacer.
- **☠ FATALITY**: aparece en “¡ACÁBALO!” y la marca por ti: tócalo para la FATALITY o déjalo presionado para la
  BRUTALITY. **❚❚** = pausa.
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
| DRONES KAMIKAZE | `← ← + P` (o Especial + abajo-adelante) | Suelta dos drones de la espalda que se acomodan arriba y luego lo persiguen hasta estrellarse en él: uno a la cabeza y otro al cuerpo (el segundo lo tumba) |
| PATADA METEORO | saltando + Especial | Se lanza en picada con las botas cohete encendidas; si cae al piso, explota |
| ☠ DESINTEGRACIÓN | `→ → ↓ + P` | Se pone el traje, llama a cuatro robots y entre todos (láser, plasma, rayos, misiles y su rayo del pecho) deshacen al rival en cubos de luz |
| 💀 DESINSTALACIÓN | la de la fatality, dejando presionado P | BRUTALITY: lo “desinstala” hasta el ERROR 404 |

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
| TURBINA | `← ← + K` (o Especial + abajo-adelante) | Turbina de avión: ráfaga caliente que empuja y golpea varias veces |
| BOOM SÓNICO | `→ → + K` (o Especial + abajo-atrás) | Prende el jetpack a todo y lo atraviesa más rápido que el sonido: el estruendo lo manda a volar |
| REENTRADA | saltando + Especial | Cae en picada envuelto en fuego como cápsula que regresa del espacio; al caer, onda de fuego |
| ☠ DESPEGUE ESPACIAL | `↓ → ↓ + P` | Le amarra un cohete al rival y lo manda al espacio con fuegos artificiales |
| 💀 TRIPLE ATROPELLO | la de la fatality, dejando presionado P | BRUTALITY: su Camaro lo atropella tres veces |

### Gera (boxeo) — siempre con guantes de box
| Especial | Entrada | Qué hace |
|---|---|---|
| RÁFAGA DE JABS | `→ → + P` | 6 jabs seguidos avanzando (fallan si el rival se agacha) |
| GANCHO DEMOLEDOR | `→ ↓ → + P` | Gancho volador que lanza al rival por los aires |
| PUÑO RESORTE | `← → + P` | Un guante con resorte sale disparado a lo lejos |
| CONTRAGOLPE | `↓ ← + P` | Guardia: si le pegan, responde con un gancho imbloqueable |
| HIGADAZO | `↓ → + P` (o Especial + abajo-adelante) | Entra agachado y le hunde el puño en el costado: si conecta, el otro se dobla de rodillas sin aire |
| MAZAZO | saltando + Especial | Los dos puños juntos desde arriba |
| ☠ NOCAUT | `→ → → + P` | Ráfaga de golpes y un gancho que lo manda a las estrellas |
| 💀 CABEZA DE PIÑATA | la de la fatality, dejando presionado P | BRUTALITY: la cabeza se infla con cada golpe y revienta |

### José Cortez (nalgas)
| Especial | Entrada | Qué hace |
|---|---|---|
| NALGADA VOLADORA | `← → + K` | Se lanza de espaldas con las nalgas por delante |
| SENTÓN | `↓ ↓ + K` | Brinca y cae sentado: aplasta al de abajo y hace una onda |
| TWERK SÍSMICO | `↓ ← + K` | Cada sacudida manda una onda (7 golpes de cerca) |
| GAS NUCLEAR | `← ← + P` | Nube verde que avanza y lastima mientras estés dentro (no se bloquea) |
| IMÁN DE NALGAS | `← → + P` (o Especial + abajo-adelante) | Se voltea y las menea: si estás cerca quedas hipnotizado (corazones), te acercas solito… y nalgazo (no se bloquea) |
| PEDO COHETE | saltando + Especial | Se lanza de nalgas propulsado por un pedo; al caer deja la nube |
| ☠ APLASTE NALGÓN | `↓ ↓ ↓ + K` | Las nalgas le crecen y aplasta al rival desde el cielo |
| 💀 TRAGADO POR LA TIERRA | la de la fatality, dejando presionado K | BRUTALITY: el piso se lo traga y sale una tumba |

### Conde (fuerza) — un poco más chaparro que los demás… hasta que se hace gigante
| Especial | Entrada | Qué hace |
|---|---|---|
| SÚPER GIGANTE | `↓ ↓ + P` (o el botón Especial solo) | Hace fuerza y crece 35% durante 7 s: pega 60% más, recibe 40% menos, nada lo tumba y llega más lejos. Cada paso retumba |
| EMBESTIDA DE TORO | `← → + K` | Se lanza con el hombro y tumba al rival |
| PISOTÓN SÍSMICO | `↓ ↓ + K` | Brinca y cae con todo: onda en el suelo (bloquear agachado) |
| LANZAMIENTO TITÁNICO | `← → + P` | Agarre de cerca: lo levanta sobre la cabeza y lo avienta. No se puede bloquear |
| ARRANCABANQUETAS | `↓ → + P` (o Especial + abajo-adelante) | Arranca un pedazo de banqueta del piso y se lo avienta en arco; al caer se hace pedazos |
| PLANCHA | saltando + Especial | Plancha de luchador: cae acostado encima y retumba el piso |
| ☠ PISOTÓN GIGANTE | `↓ → ↓ + K` | Se hace gigantesco y lo aplasta de un pisotón |
| 💀 MUÑECO DE TRAPO | la de la fatality, dejando presionado K | BRUTALITY: lo azota de un lado al otro y lo deja enterrado de cabeza |

### Emi (pescadero) — pescados y caguamas
| Especial | Entrada | Qué hace |
|---|---|---|
| PESCADAZO | `← → + P` (o el botón Especial solo) | Avienta un pescado que va dando vueltas |
| KAWAMA VOLADORA | `↓ → + P` | Avienta una caguama en parábola: se rompe y deja al rival mareado |
| LLUVIA DE PESCADOS | `↓ ← + K` | Chifla y le caen 5 pescados encima (el último lo tumba) |
| BAÑO DE CHELA | `← ← + K` | Agita la caguama y lo baña: varios chorros que lo empujan |
| ANZUELO | `← ← + P` (o Especial + abajo-adelante) | Lanza el hilo de pescar con su corcho: si lo engancha, lo jala hasta él y lo deja mareado |
| CLAVADO | saltando + Especial | Clavado olímpico de cabeza: al caer salpica como alberca |
| ☠ PESCADO GIGANTE | `→ ↓ → + K` | Un pescado gigante sale del suelo y se lo traga |
| 💀 PEZ GLOBO | la de la fatality, dejando presionado K | BRUTALITY: se infla con púas y revienta en lluvia de pescaditos |

### Ramces (barbero) — trae sus tijeras, máquina, navaja y brocha
| Especial | Entrada | Qué hace |
|---|---|---|
| TIJERAS BUMERÁN | `← → + P` (o Especial solo) | Avienta las tijeras girando: van, se regresan a su mano y pegan de ida (10) y de vuelta (6) |
| RAPADO EXPRESS | `→ → + P` (o Especial + adelante) | Se lanza con la máquina y le rapa la cabeza: 6 toques con pelos volando (agachado se esquiva) |
| NAVAJAZO | `↓ → + P` (o Especial + abajo) | Tajo de navaja de abajo hacia arriba que lo manda por los aires |
| BROCHAZO DE TALCO | `↓ ← + K` (o Especial + atrás) | Nube de talco en la cara: si lo agarra de cerca se queda mareado tosiendo |
| LANZALLAMAS DE SPRAY | `← ← + P` (o Especial + abajo-adelante) | Spray para el pelo + encendedor: llamarada de cerca que pega varias veces |
| NAVAJA EN PICADA | saltando + Especial | Cae en picada tajando con la navaja |
| ☠ CORTE AL RAS | `↓ ← → + P` | Sale su silla de barbero, lo sienta, le pone la capa y le pasa la máquina… afila la navaja y le quedó demasiado al ras: la cabeza sale volando |
| 💀 YA ESTÁS RASURADO | la de la fatality, dejando presionado P | BRUTALITY: lo atraviesa, “clic”… y se cae en pedazos |

Además siguen Brasa, Escarcha, Voltio y Mole (muñecos de ejemplo), cada uno con un especial más (COLUMNA DE FUEGO,
PUÑO GLACIAR, CAMPO ELÉCTRICO y SUPLEX), su especial en el aire y su brutality.

## 🔊 Sonidos y música
Todo es sintetizado (no hay archivos de audio) y pasa por un compresor y un poco de eco de cuarto.

**Música** ([`src/music.js`](src/music.js), toda original): tema épico en el menú (le entran tambores al elegir
peleador), una pista por escenario — electrónica rápida en SIX, **cumbia** con güiro y acordeón en La Cabaña,
synthwave nocturno en Casa Chuy y taikos con flauta en el Templo —, tensión con latido en “¡ACÁBALO!” y la fatality, y
fanfarria del ganador. En la presentación de cada ronda la pista baja, y en “¡PELEA!” vuelve a entrar con platillo; en
la ronda final (o con poco tiempo) suena con todo. En pausa y en la cámara lenta se oye apagada, y se hace a un lado
cuando habla el narrador.

**Efectos**: además de golpes (en capas: chasquido, cuerpo y retumbo; cada uno suena un poco distinto), especiales y
el narrador:
pasos (de metal con el traje de robot), puños y patadas suenan distinto, el combo sube de tono, campana al empezar
cada round, tic-tac en los últimos 10 segundos, el público en el K.O. y al final, tambores en la fatality,
corazón cuando te queda poca vida, pajaritos cuando alguien está mareado y ambiente en cada escenario
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
   `modelo`, `retrato`, `especiales` (hasta 6: el botón Especial solo, adelante, abajo, atrás, abajo-adelante y
   abajo-atrás), `aire` (su especial en el aire: `{ nombre, estilo, color, danio, onda }`), `fatality`, `brutality`,
   `frase` e `intro` (su pose en la presentación de la ronda 1: una animación de especial como `jojo`, `flexion`,
   `carga`, `rafaga`…). Opcional: `victoria` (0–3, su pose al ganar; si no, sale una según su estilo).

Tipos de especial: `proyectil`, `congelar`, `teletransporte`, `embestida`, `terremoto`, `gancho`,
`uppercut_volador`, `poder`, `rayo`; robot: `puno_cohete`, `laser`, `misiles`, `armadura`; aeroespacial:
`cohete`, `jetpack`, `orbital`, `turbina`, `camaro` (con `modelo`: el carro); robot con traje: `titan`, `plasma`, `megalaser`, `propulsores`, `descarga`; boxeo: `rafaga`, `resorte`, `contra`; nalgas: `culazo`, `senton`,
`twerk`, `gas`; fuerza: `gigante`, `agarre`; barbero: `tijeras`, `rapado`, `navaja`, `talco`; nuevos: `drones`, `boom_sonico`,
`higadazo`, `iman`, `losa`, `anzuelo`, `lanzallamas` (y `rayo` con `estilo: 'fuego'`). Estilos de `aire`: `cohete`, `reentrada`,
`mazazo`, `pedo`, `plancha`, `clavado`, `navaja`, `fuego`, `hielo`, `rayo`, `bala`. Fatalidades: `explosion`, `incinerar`, `congelar_romper`, `rayo`,
`aplastar`, `desintegrar`, `despegue`, `nocaut`, `nalgon`, `pisoton`, `pescadote`, `corte`. Brutalities: `desinstalar`,
`atropello`, `pinata`, `tragado`, `trapo`, `pezglobo`, `rasurado`, `combo_brutal` (con `estilo`: `fuego`, `hielo`, `rayo`,
`tanque`). Accesorios: `accesorios: ['guantes']` y/o `['jetpack']`.

Traje que se pone con un especial `titan` (como Diego): pasa el modelo por el convertidor con otro id (ej. `diego-robot`)
y en el roster agrega `traje: { modelo: 'assets/peleadores/diego-robot/modelo.glb', escala: 1.06 }` y la lista
`especialesTitan` con lo que hace el botón de especial mientras lo trae puesto. Los modelos de Meshy con la textura
partida en muchas islas también se reducen bien: el convertidor lo detecta solo.

Objetos que salen en un especial (como el Camaro de Alan): abre el convertidor con
`convertir.html?src=/assets/props/raw_camaro/archivo.fbx&prop=camaro&largo=4.8&rot=180` (`largo` en metros; con
`rot` gíralo hasta que el frente vea hacia la línea roja) y guarda: queda en `assets/props/camaro.glb`. Pon los
originales en `assets/props/raw_<algo>/` (no se suben a GitHub).

El esqueleto automático también pone huesos en los pies (para que queden planos en el piso) y la ropa suelta —faldas,
mandiles— sigue a la cadera y no al muslo, así no se estira como sábana cuando patea.

Si el esqueleto automático corta la ropa entre el brazo y el cuerpo (salen pedacitos flotando cerca de las manos),
pon `rig: { colgando: false }` en el roster (como Ramces); en el convertidor se prueba con `&colgando=0`.

Si el modelo sale de lado, usa "Girar" en el convertidor (o `rotacionY` en el roster). `escala` cambia la estatura
(Conde usa `0.94`). Lo mejor es que el modelo venga en **pose de T o de A**; si viene con los brazos pegados al cuerpo
(como Conde) también funciona: el esqueleto automático separa brazo y cuerpo sin estirar la ropa.
