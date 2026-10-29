# Kombate de Amigos

Juego de pelea 3D para el navegador (Three.js): contra la CPU, 1 vs 1 en el mismo teclado, o **en línea**
con presencia en tiempo real (ves quién está conectado), retos, ranking y netcode con *rollback*.

## Jugar en tu computadora

```
node server.js
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

### Diego (robot)
| Especial | Entrada | Qué hace |
|---|---|---|
| PUÑO COHETE | `← → + P` | El antebrazo sale disparado con propulsor y derriba |
| LÁSER OCULAR | `↓ → + P` | Rayos de los ojos, 5 impactos. Pasa por encima si el rival se agacha |
| LLUVIA DE MISILES | `↓ ← + K` | 4 misiles desde la espalda que caen alrededor del rival |
| MODO TITÁN | `↓ ↓ + P` | Armadura 6 s: mitad de daño, sin daño por bloqueo |
| ☠ DESINTEGRACIÓN | `→ → ↓ + P` | (en "¡ACÁBALO!") escaneo láser y el rival se deshace en cubos de luz |

---

## 🌐 En línea: cómo funciona

- **Firebase Realtime Database**: lista de conectados (se actualiza al instante y detecta desconexiones),
  retos, salas, ranking y señalización.
- **WebRTC (P2P)**: durante la pelea los botones van **directo de un jugador al otro**, sin pasar por ningún
  servidor. Si la red no permite conexión directa, se usa Firebase como respaldo automáticamente.
- **Rollback**: tu personaje responde al instante. El juego predice los botones del rival y, si se equivocó,
  rebobina unos frames y corrige sin que se note. Si alguna vez las dos pantallas no coinciden, el anfitrión
  manda su estado y se corrigen solas.

> Sin Firebase configurado el modo en línea funciona en **modo local** (pestañas del mismo navegador).
> Para probarlo con mala conexión simulada: http://localhost:8080/herramientas/prueba-online.html

### 1. Crear Firebase (gratis)
1. https://console.firebase.google.com → **Crear proyecto**.
2. **Compilación → Realtime Database → Crear base de datos** → elige la ubicación más cercana a tus amigos → *modo bloqueado*.
3. Pestaña **Reglas** → pega el contenido de [`database.rules.json`](database.rules.json) → **Publicar**.
4. **Compilación → Authentication → Comenzar → Método de acceso → Anónimo → Habilitar**.
5. **Configuración del proyecto (⚙) → Tus apps → Web (`</>`)** → registra la app y copia los valores de `firebaseConfig`.

### 2. Subir a Vercel
1. Sube esta carpeta a un repositorio de GitHub (o usa `npx vercel` desde la carpeta).
2. En Vercel: **Add New → Project** → importa el repositorio → Framework: **Other** → Deploy.
3. **Settings → Environment Variables** (las mismas de [`.env.example`](.env.example)):

   | Variable | Valor de `firebaseConfig` |
   |---|---|
   | `FIREBASE_API_KEY` | `apiKey` |
   | `FIREBASE_AUTH_DOMAIN` | `authDomain` |
   | `FIREBASE_DATABASE_URL` | `databaseURL` |
   | `FIREBASE_PROJECT_ID` | `projectId` |
   | `FIREBASE_APP_ID` | `appId` |

4. **Deployments → Redeploy**. El juego lee la configuración en `/api/config`.
5. En Firebase → **Authentication → Configuración → Dominios autorizados** agrega tu dominio `*.vercel.app`.

Opcional: si a algún amigo no le conecta directo (redes de empresa/universidad muy cerradas), agrega un
servidor TURN con `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`.

Para usar Firebase también en tu computadora: copia `.env.example` como `.env`, llénalo y reinicia `node server.js`.

---

## ➕ Agregar a un amigo

### 1. El modelo (Meshy o Tripo)
- Cuerpo completo, de pie, de frente, en **pose de T o de A** (brazos separados del cuerpo).
- Exporta en **FBX** o **GLB** con texturas. No hace falta Mixamo.

### 2. Convertirlo
Con `node server.js` corriendo abre **http://localhost:8080/herramientas/convertir.html**:
1. Elige el `.fbx`/`.glb` (y sus texturas si vienen aparte).
2. Escribe el **id** (nombre de carpeta, ej. `juan`).
3. Revisa los botones de animación (idle, puño, patada…): el esqueleto se pone solo.
4. **GUARDAR EN EL JUEGO** → crea `assets/peleadores/<id>/modelo.glb` (optimizado, ~3 MB) y `retrato.png`.

### 3. Darlo de alta
En [`src/roster.js`](src/roster.js) copia el bloque de Diego y cambia `id`, `nombre`, `color`, `modelo`,
`retrato`, `especiales`, `fatality` y `frase`.

Tipos de especial: `proyectil`, `congelar`, `teletransporte`, `embestida`, `terremoto`, `gancho`,
`uppercut_volador`, `poder`, `rayo`, y robot: `puno_cohete`, `laser`, `misiles`, `armadura`.
Fatalidades: `explosion`, `incinerar`, `congelar_romper`, `rayo`, `aplastar`, `desintegrar`.

Si el modelo sale de lado, usa "Girar" en el convertidor (o `rotacionY` en el roster).

### Animaciones de Mixamo (opcional, más realistas)
Si un modelo ya viene con esqueleto de Mixamo (`.fbx` "With Skin"), ponlo directo como `modelo.fbx` y
descarga las animaciones "Without Skin" a `assets/animaciones/` con estos nombres: `idle`, `caminar`,
`caminar_atras`, `saltar`, `agacharse`, `bloqueo`, `bloqueo_bajo`, `puno`, `puno_fuerte`, `patada`,
`patada_giratoria`, `gancho_arriba`, `barrida`, `patada_aerea`, `golpeado`, `caer`, `levantarse`, `mareado`,
`victoria`, `especial`, `lanzar` (`.fbx`). Las que falten se animan solas.
