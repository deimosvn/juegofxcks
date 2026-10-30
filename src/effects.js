import * as THREE from 'three';

// ---------------------------------------------------------------------
//  Partículas (un solo draw call por sistema)
// ---------------------------------------------------------------------
const VERT = `
attribute float aSize;
attribute vec4 aColor;
varying vec4 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (420.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
// uBoost: las partículas que brillan pasan de 1 para que el bloom (post.js) las haga resplandecer
const FRAG = `
uniform float uBoost;
varying vec4 vColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d) * vColor.a;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor.rgb * uBoost, a);
}`;

class ParticleSystem {
  constructor(scene, max, additive) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.c0 = new Float32Array(max * 3);
    this.c1 = new Float32Array(max * 3);
    this.grow = new Float32Array(max);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, uniforms: { uBoost: { value: additive ? 1.6 : 1 } },
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(o) {
    const n = o.count ?? 10;
    const c0 = new THREE.Color(o.color ?? '#fff');
    const c1 = new THREE.Color(o.colorEnd ?? o.color ?? '#fff');
    for (let k = 0; k < n; k++) {
      const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
      const sp = (o.speed ?? 3) * (0.4 + Math.random() * 0.8);
      let dx = (Math.random() * 2 - 1), dy = (Math.random() * 2 - 1), dz = (Math.random() * 2 - 1);
      if (o.dir) {
        const s = o.spread ?? 0.5;
        dx = o.dir[0] + dx * s; dy = o.dir[1] + dy * s; dz = o.dir[2] + dz * s;
      }
      const len = Math.hypot(dx, dy, dz) || 1;
      const j = o.jitter ?? 0;
      this.pos[i * 3] = o.pos.x + (Math.random() - 0.5) * j;
      this.pos[i * 3 + 1] = o.pos.y + (Math.random() - 0.5) * j;
      this.pos[i * 3 + 2] = o.pos.z + (Math.random() - 0.5) * j;
      this.vel[i * 3] = dx / len * sp; this.vel[i * 3 + 1] = dy / len * sp; this.vel[i * 3 + 2] = dz / len * sp;
      const life = (o.life ?? 0.6) * (0.6 + Math.random() * 0.8);
      this.life[i] = life; this.maxLife[i] = life;
      this.baseSize[i] = (o.size ?? 0.2) * (0.6 + Math.random() * 0.8);
      this.gravity[i] = o.gravity ?? 0;
      this.drag[i] = o.drag ?? 1.5;
      this.grow[i] = o.grow ?? 0;
      this.c0.set([c0.r, c0.g, c0.b], i * 3);
      this.c1.set([c1.r, c1.g, c1.b], i * 3);
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const t = 1 - Math.max(this.life[i], 0) / this.maxLife[i];
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.gravity[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.gravity[i] > 0 && this.pos[i * 3 + 1] < 0.01) { this.pos[i * 3 + 1] = 0.01; this.vel[i * 3 + 1] *= -0.2; this.vel[i * 3] *= 0.5; }
      for (let c = 0; c < 3; c++) this.col[i * 4 + c] = this.c0[i * 3 + c] + (this.c1[i * 3 + c] - this.c0[i * 3 + c]) * t;
      this.col[i * 4 + 3] = 1 - t * t;
      this.size[i] = this.baseSize[i] * (1 + this.grow[i] * t);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = true; a.aColor.needsUpdate = true; a.aSize.needsUpdate = true;
  }

  clear() { this.life.fill(0); }
}

// ---------------------------------------------------------------------
//  Efectos: chispas, sangre, ondas, rayos, flashes, temblor
// ---------------------------------------------------------------------
export class Effects {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.glow = new ParticleSystem(scene, 3000, true);
    this.solid = new ParticleSystem(scene, 2500, false);
    this.temp = [];        // { obj, life, max, update(t) }
    this.shake = 0;
    this.flashLight = new THREE.PointLight('#ffffff', 0, 12);
    scene.add(this.flashLight);
    this.blood = true;
    this.gate = null;      // filtro de efectos repetidos durante el rollback (ver main.js)
  }

  // Partículas que emite la simulación (se silencian durante el rollback)
  emitGlow(o) { this.glow.emit(o); }
  emitSolid(o) { this.solid.emit(o); }

  // Golpe contra la armadura robótica: chispas metálicas en lugar de sangre
  metalSpark(pos, color = '#9fe8ff') {
    this.glow.emit({ pos, count: 30, speed: 8, color: '#ffffff', colorEnd: color, life: 0.3, size: 0.12, drag: 3, gravity: 6 });
    this.glow.emit({ pos, count: 1, speed: 0, color, life: 0.1, size: 1.6 });
    // escudo hexagonal que aparece un instante
    const geo = new THREE.CircleGeometry(0.75, 6);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(pos); m.rotation.y = Math.PI / 2;
    this.addTemp(m, 0.25, (dt, t) => { mat.opacity = 0.5 * (1 - t); m.scale.setScalar(1 + t * 0.4); });
  }

  explosion(pos, color = '#ff7a00', size = 1) {
    this.glow.emit({ pos, count: Math.round(70 * size), speed: 7 * size, color: '#fff3c0', colorEnd: color, life: 0.5, size: 0.3 * size, drag: 3 });
    this.solid.emit({ pos, count: Math.round(30 * size), speed: 2.5 * size, jitter: 0.4 * size, color: '#444', colorEnd: '#000', life: 1.2, size: 0.55 * size, grow: 2.5, drag: 2, gravity: -1.5 });
    this.ring(pos.x, color, 2 * size, 0.35);
    this.flash(pos, color, 8 * size);
    this.addShake(0.15 * size);
  }

  // Desintegración en cubos (fatalidad robot)
  voxels(pos, color = '#4fd8ff', count = 260, height = 1.8) {
    const geo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const data = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      data.push({
        p: new THREE.Vector3(pos.x + (Math.random() - 0.5) * 0.6, Math.random() * height, (Math.random() - 0.5) * 0.4),
        v: new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 1.8, (Math.random() - 0.5) * 0.8),
        r: Math.random() * 6, delay: Math.random() * 0.6,
      });
    }
    this.addTemp(mesh, 2.6, (dt, t) => {
      for (let i = 0; i < count; i++) {
        const d = data[i];
        const k = Math.max(0, t * 2.6 - d.delay);
        if (k > 0) d.p.addScaledVector(d.v, dt);
        p.copy(d.p); q.setFromEuler(new THREE.Euler(d.r + k * 3, d.r * 2 + k * 2, 0));
        s.setScalar(Math.max(0.001, 1 - k / 2));
        mesh.setMatrixAt(i, m4.compose(p, q, s));
      }
      mesh.instanceMatrix.needsUpdate = true;
      mat.opacity = 1 - t * t;
    });
  }

  hitSpark(pos, color = '#ffe08a', strong = false) {
    this.glow.emit({ pos, count: strong ? 40 : 20, speed: strong ? 9 : 6, color: '#ffffff', colorEnd: color, life: 0.25, size: 0.16, drag: 4 });
    this.glow.emit({ pos, count: 1, speed: 0, color, life: 0.12, size: strong ? 2.2 : 1.4 });
    // rayitas que salen disparadas (más largas en los golpes fuertes)
    this.glow.emit({ pos, count: strong ? 10 : 5, speed: strong ? 16 : 11, color: '#ffffff', colorEnd: color, life: 0.1, size: 0.1, drag: 1 });
    this.impactRing(pos, color, strong ? 1.25 : 0.7);
    this.flash(pos, color, strong ? 6 : 3);
  }

  // onda de choque que mira a la cámara
  impactRing(pos, color, size = 1) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 32), mat);
    m.position.copy(pos);
    this.addTemp(m, 0.2, (dt, t) => { m.quaternion.copy(this.camera.quaternion); m.scale.setScalar(size * (0.25 + t * 1.5)); mat.opacity = (1 - t) * 0.9; });
  }

  bloodSplash(pos, dirX, amount = 1) {
    if (!this.blood) return this.hitSpark(pos, '#ffffff');
    this.solid.emit({ pos, count: Math.round(26 * amount), speed: 5 * amount, dir: [dirX, 0.7, 0], spread: 0.8, color: '#c00010', colorEnd: '#5a0006', life: 0.9, size: 0.11, gravity: 14, drag: 0.6 });
  }

  blockSpark(pos) {
    this.glow.emit({ pos, count: 14, speed: 4, color: '#bfe7ff', colorEnd: '#3a7bff', life: 0.2, size: 0.12, drag: 5 });
    this.impactRing(pos, '#7fb8ff', 0.55);
  }

  dust(pos, count = 16) {
    this.solid.emit({ pos, count, speed: 2.5, dir: [0, 0.4, 0], spread: 1.2, color: '#a39484', colorEnd: '#4a423a', life: 0.7, size: 0.35, grow: 1.5, drag: 3 });
  }

  aura(pos, color, count = 3) {
    this.glow.emit({ pos, count, speed: 1.6, dir: [0, 1, 0], spread: 0.5, jitter: 0.8, color, colorEnd: '#000000', life: 0.5, size: 0.25, drag: 1 });
  }

  burst(pos, color, count = 60, speed = 7, size = 0.22) {
    this.glow.emit({ pos, count, speed, color: '#ffffff', colorEnd: color, life: 0.6, size, drag: 2.5 });
  }

  smoke(pos, color = '#333', count = 30) {
    this.solid.emit({ pos, count, speed: 1.8, jitter: 0.8, color, colorEnd: '#000000', life: 1.0, size: 0.6, grow: 2, drag: 2, gravity: -1.2 });
  }

  gore(pos, amount = 1) {
    if (!this.blood) return this.burst(pos, '#ffffff', 80);
    this.solid.emit({ pos, count: Math.round(160 * amount), speed: 9, jitter: 0.6, color: '#d0001a', colorEnd: '#400005', life: 1.6, size: 0.14, gravity: 15, drag: 0.4 });
    // trozos
    const geo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    const mat = new THREE.MeshStandardMaterial({ color: '#7a0a10', roughness: 0.6 });
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(pos);
      m.scale.setScalar(0.6 + Math.random() * 1.4);
      const v = new THREE.Vector3((Math.random() - 0.5) * 9, 4 + Math.random() * 7, (Math.random() - 0.5) * 4);
      const spin = new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10);
      m.castShadow = true;
      this.scene.add(m);
      this.temp.push({ obj: m, life: 3.5, max: 3.5, update: (dt) => {
        v.y -= 20 * dt; m.position.addScaledVector(v, dt);
        if (m.position.y < 0.08) { m.position.y = 0.08; v.multiplyScalar(0.4); v.y = Math.abs(v.y) * 0.3; spin.multiplyScalar(0.5); }
        m.rotation.x += spin.x * dt; m.rotation.y += spin.y * dt;
      } });
    }
  }

  shards(pos, color = '#bfefff', count = 18) {
    const geo = new THREE.TetrahedronGeometry(0.18);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85, emissive: color, emissiveIntensity: 0.25 });
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 1.6 - 0.8, (Math.random() - 0.5) * 0.4));
      m.scale.setScalar(0.5 + Math.random() * 1.8);
      const v = new THREE.Vector3((Math.random() - 0.5) * 8, 2 + Math.random() * 6, (Math.random() - 0.5) * 4);
      this.scene.add(m);
      this.temp.push({ obj: m, life: 3, max: 3, update: (dt) => {
        v.y -= 18 * dt; m.position.addScaledVector(v, dt);
        if (m.position.y < 0.1) { m.position.y = 0.1; v.multiplyScalar(0.3); }
        m.rotation.x += dt * 6; m.rotation.z += dt * 4;
      } });
    }
  }

  ring(x, color, maxRadius = 3, duration = 0.45) {
    const geo = new THREE.RingGeometry(0.8, 1, 48);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.05, 0);
    this.scene.add(m);
    this.temp.push({ obj: m, life: duration, max: duration, update: (dt, t) => {
      m.scale.setScalar(0.2 + t * maxRadius);
      mat.opacity = 1 - t;
    } });
  }

  lightning(from, to, color = '#cfe9ff', duration = 0.35) {
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending });
    const geo = new THREE.BufferGeometry();
    const segs = 18;
    const arr = new Float32Array((segs + 1) * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const line = new THREE.Line(geo, mat);
    const build = () => {
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const j = (i === 0 || i === segs) ? 0 : 0.35;
        arr[i * 3] = from.x + (to.x - from.x) * t + (Math.random() - 0.5) * j;
        arr[i * 3 + 1] = from.y + (to.y - from.y) * t + (Math.random() - 0.5) * j * 0.3;
        arr[i * 3 + 2] = from.z + (to.z - from.z) * t + (Math.random() - 0.5) * j;
      }
      geo.attributes.position.needsUpdate = true;
    };
    build();
    this.scene.add(line);
    // Un núcleo grueso hecho de partículas a lo largo del rayo
    this.temp.push({ obj: line, life: duration, max: duration, update: (dt, t) => {
      build(); mat.opacity = 1 - t;
      for (let i = 0; i < 4; i++) {
        const k = Math.random();
        this.glow.emit({ pos: new THREE.Vector3(arr[0] + (arr[segs * 3] - arr[0]) * k, arr[1] + (arr[segs * 3 + 1] - arr[1]) * k, 0), count: 1, speed: 0.5, color: '#ffffff', colorEnd: color, life: 0.12, size: 0.45 });
      }
    } });
    this.flash(to, color, 10);
  }

  flash(pos, color = '#fff', intensity = 4) {
    this.flashLight.position.copy(pos);
    this.flashLight.color.set(color);
    this.flashLight.intensity = Math.max(this.flashLight.intensity, intensity * 10);
  }

  addShake(a) { this.shake = Math.min(this.shake + a, 0.6); }

  addTemp(obj, life, update) {
    if (obj) this.scene.add(obj);
    const entry = { obj, life, max: life, update };
    this.temp.push(entry);
    return entry;
  }

  update(dt) {
    this.glow.update(dt);
    this.solid.update(dt);
    this.flashLight.intensity *= Math.exp(-dt * 14);
    this.shake *= Math.exp(-dt * 9);
    for (let i = this.temp.length - 1; i >= 0; i--) {
      const e = this.temp[i];
      e.life -= dt;
      e.update && e.update(dt, 1 - Math.max(e.life, 0) / e.max);
      if (e.life <= 0) {
        if (e.obj) { this.scene.remove(e.obj); e.obj.geometry?.dispose?.(); }
        this.temp.splice(i, 1);
      }
    }
  }

  clear() {
    this.glow.clear(); this.solid.clear();
    for (const e of this.temp) if (e.obj) this.scene.remove(e.obj);
    this.temp.length = 0;
  }
}

// Durante el rollback la simulación repite frames: `gate` (lo pone main.js) decide si un
// efecto ya se mostró en ese frame para no repetirlo, o si es nuevo y debe salir aunque llegue tarde.
for (const name of ['emitGlow', 'emitSolid', 'metalSpark', 'explosion', 'voxels', 'hitSpark', 'bloodSplash', 'blockSpark',
  'dust', 'aura', 'burst', 'smoke', 'gore', 'shards', 'ring', 'lightning', 'flash', 'addShake', 'addTemp']) {
  const orig = Effects.prototype[name];
  Effects.prototype[name] = function (...args) { return (this.gate && !this.gate(name, args)) ? undefined : orig.apply(this, args); };
}
