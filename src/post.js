import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Postproceso: brillo (bloom) en rayos, chispas y focos + "color de cine": viñeta, contraste,
// grano fino, aberración de color en los golpes fuertes, gris en el K.O., bordes rojos con poca vida
// y, en las fatalities (fatal.js), un tinte de color y la imagen que "se descompone" como señal digital.
//   calidad 'alta'  → todo, resolución completa
//   calidad 'media' → todo, con menos resolución (celulares)
//   calidad 'baja'  → sin postproceso ni sombras (celulares viejos)
const GRADE = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: 0.4 }, uAberr: { value: 0 },
    uDesat: { value: 0 }, uDanger: { value: 0 }, uGrain: { value: 0.028 }, uAspect: { value: 1 },
    uTint: { value: new THREE.Color('#ff2020') }, uTintAmt: { value: 0 }, uGlitch: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uVignette, uAberr, uDesat, uDanger, uGrain, uAspect, uTintAmt, uGlitch;
    uniform vec3 uTint;
    varying vec2 vUv;
    float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv, c = vUv - 0.5;
      float r = length(c * vec2(uAspect, 1.0)) / length(vec2(uAspect, 1.0) * 0.5);   // 0 al centro, 1 en la esquina
      float ab = uAberr;
      if (uGlitch > 0.001) {
        // franjas que se corren de lado, como una señal digital que se rompe
        float f = floor(uTime * 24.0), band = floor(vUv.y * 42.0);
        if (rnd(vec2(band, f)) > 1.0 - uGlitch * 0.32) uv.x += (rnd(vec2(band, f + 3.1)) - 0.5) * 0.09 * uGlitch;
        ab += uGlitch * 1.4;
      }
      vec3 col;
      if (ab > 0.001) {
        vec2 off = c * ab * 0.018;
        col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      } else col = texture2D(tDiffuse, uv).rgb;
      col = (col - 0.5) * 1.07 + 0.5;                                     // un poco más de contraste
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, 1.1 - uDesat * 1.1);                        // más color (o gris en el K.O.)
      col = mix(col, l * uTint * 1.7, uTintAmt);                          // tinte de la fatality (rojo sangre, azul hielo…)
      col *= 1.0 - uVignette * smoothstep(0.35, 1.05, r);                 // orillas oscuras
      col = mix(col, vec3(0.7, 0.0, 0.03), uDanger * smoothstep(0.45, 1.1, r));
      col += (rnd(vUv * 731.0 + fract(uTime) * 61.0) - 0.5) * uGrain;     // grano de película
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

// [fuerza, umbral] del brillo por escenario: los de día casi no brillan, los de noche sí
const STAGE_BLOOM = { six: [0.45, 1.05], cabana: [0.4, 1.05], casachuy: [0.85, 0.7], templo: [0.7, 0.8] };

export class Post {
  constructor(renderer, scene, camera) {
    this.r = renderer; this.scene = scene; this.camera = camera;
    // los pone main.js cada cuadro (tint, tintAmt, glitch y vignette: fatal.js en las fatalities)
    this.fx = { aberr: 0, desat: 0, danger: 0, tint: new THREE.Color('#ff2020'), tintAmt: 0, glitch: 0, vignette: 0.4, bloom: 1 };
    this.quality = null; this.composer = null; this.w = 1; this.h = 1;
    this.bloomCfg = [0.5, 1];
    const gl = renderer.capabilities.isWebGL2;
    this.floatOk = gl && renderer.extensions.has('EXT_color_buffer_float');
    this.halfOk = this.floatOk || renderer.extensions.has('EXT_color_buffer_half_float');
  }

  build() {
    // MSAA solo si la tarjeta puede (si no, imagen sin suavizar pero sin pantalla negra)
    const rt = new THREE.WebGLRenderTarget(this.w, this.h, {
      type: this.halfOk ? THREE.HalfFloatType : THREE.UnsignedByteType,
      samples: this.r.capabilities.isWebGL2 && (this.floatOk || !this.halfOk) ? 4 : 0,
    });
    const c = new EffectComposer(this.r, rt);
    c.addPass(new RenderPass(this.scene, this.camera));
    if (this.halfOk) { this.bloom = new UnrealBloomPass(new THREE.Vector2(this.w, this.h), this.bloomCfg[0], 0.45, this.bloomCfg[1]); c.addPass(this.bloom); }
    c.addPass(new OutputPass());
    this.grade = new ShaderPass(GRADE);
    c.addPass(this.grade);
    this.composer = c;
  }

  setQuality(q) {
    if (q === this.quality) return;
    const r = this.r;
    const coarse = matchMedia('(pointer: coarse)').matches;
    r.setPixelRatio(Math.min(devicePixelRatio, q === 'baja' ? 1 : q === 'media' || coarse ? 1.5 : 2));
    // sombras: al cambiar hay que recompilar los materiales
    const shadows = q !== 'baja';
    if (r.shadowMap.enabled !== shadows) {
      r.shadowMap.enabled = shadows;
      this.scene.traverse((o) => { for (const m of [].concat(o.material || [])) m.needsUpdate = true; });
    }
    this.quality = q;
    if (q === 'baja') { this.composer?.dispose(); this.composer = null; this.bloom = null; }
    else if (!this.composer) this.build();
    if (this.composer) { this.composer.setPixelRatio(r.getPixelRatio()); this.composer.setSize(this.w, this.h); }
    this.applyBloom();
  }

  setSize(w, h) {
    this.w = w; this.h = h;
    this.composer?.setSize(w, h);
  }

  setStage(id) { this.bloomCfg = STAGE_BLOOM[id] || [0.5, 1]; this.applyBloom(); }
  applyBloom() {
    if (!this.bloom) return;
    this.bloom.strength = this.bloomCfg[0] * (this.quality === 'media' ? 0.9 : 1);
    this.bloom.threshold = this.bloomCfg[1];
  }

  render(dt) {
    if (!this.composer) { this.r.render(this.scene, this.camera); return; }
    const u = this.grade.uniforms, f = this.fx;
    u.uTime.value = (u.uTime.value + dt) % 1000;
    u.uAberr.value = f.aberr; u.uDesat.value = f.desat; u.uDanger.value = f.danger;
    u.uTint.value.copy(f.tint); u.uTintAmt.value = f.tintAmt; u.uGlitch.value = f.glitch; u.uVignette.value = f.vignette;
    if (this.bloom) this.bloom.strength = this.bloomCfg[0] * (this.quality === 'media' ? 0.9 : 1) * f.bloom;
    u.uAspect.value = this.w / Math.max(1, this.h);
    this.composer.render(dt);
  }
}
