import * as THREE from 'three';
import type { GameEvent } from '../sim/types';
import { clamp } from './constants';
import type { WorldContext } from './index';

/**
 * Pooled particle effects driven by GameEvents: muzzle flashes, tracers,
 * artillery shells on ballistic arcs, missiles with smoke trails, explosions,
 * fire & smoke columns, flak bursts, splashes. Two instanced billboard
 * layers: additive (light) and alpha-blended (smoke).
 */

const CAP = 6000;

const VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute vec4 aPos;    // xyz, size
attribute vec4 aColor;  // rgba
attribute vec4 aVel;    // velocity xyz, stretch
attribute vec2 aMisc;   // rotation, seed
varying vec4 vColor;
varying vec2 vUv;
varying float vSeed;
void main() {
  vec4 mv = viewMatrix * vec4(aPos.xyz, 1.0);
  vec2 corner = position.xy;
  float s = aPos.w;
  vec2 off;
  if (aVel.w > 0.0) {
    // Stretch along the projected velocity (tracers, sparks).
    vec3 vv = (viewMatrix * vec4(aVel.xyz, 0.0)).xyz;
    vec2 dir = length(vv.xy) > 1e-6 ? normalize(vv.xy) : vec2(1.0, 0.0);
    vec2 nrm = vec2(-dir.y, dir.x);
    off = dir * corner.x * s * (1.0 + aVel.w) + nrm * corner.y * s;
  } else {
    float c = cos(aMisc.x), sn = sin(aMisc.x);
    off = vec2(c * corner.x - sn * corner.y, sn * corner.x + c * corner.y) * s;
  }
  mv.xy += off;
  vec4 mvPosition = mv;
  gl_Position = projectionMatrix * mv;
  vColor = aColor;
  vUv = corner;
  vSeed = aMisc.y;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uSoft;
varying vec4 vColor;
varying vec2 vUv;
varying float vSeed;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + vSeed * 17.0) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float a;
  if (uSoft > 0.5) {
    float n = vn(vUv * 3.0 + vSeed * 5.0) * 0.6 + vn(vUv * 6.0 - vSeed * 3.0) * 0.4;
    a = smoothstep(1.0, 0.25, r + (n - 0.5) * 0.55);
  } else {
    a = pow(max(0.0, 1.0 - r), 1.6);
  }
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  #include <fog_fragment>
}
`;

interface Layer {
  mesh: THREE.Mesh;
  geo: THREE.InstancedBufferGeometry;
  pos: THREE.InstancedBufferAttribute;
  color: THREE.InstancedBufferAttribute;
  vel: THREE.InstancedBufferAttribute;
  misc: THREE.InstancedBufferAttribute;
}

const enum K { Flash, Fire, Smoke, Spark, Tracer, Shell, Missile, Splash, Flak }

class P {
  x = 0; y = 0; z = 0; vx = 0; vy = 0; vz = 0;
  life = 0; max = 1; s0 = 1; s1 = 1;
  r = 1; g = 1; b = 1; a0 = 1; a1 = 0;
  kind: K = K.Flash; add = true; grav = 0; drag = 0; rot = 0; vr = 0; seed = 0; stretch = 0;
  tx = 0; ty = 0; tz = 0; scale = 1; alive = false;
}

interface Emitter { x: number; y: number; z: number; t: number; rate: number; acc: number; scale: number; fire: boolean }

export class Effects {
  readonly group = new THREE.Group();
  private ctx: WorldContext;
  private parts: P[] = [];
  private free: P[] = [];
  private add: Layer;
  private alpha: Layer;
  private emitters: Emitter[] = [];
  private camDist = 10;

  constructor(ctx: WorldContext) {
    this.ctx = ctx;
    for (let i = 0; i < CAP * 2; i++) this.free.push(new P());
    this.add = this.makeLayer(true);
    this.alpha = this.makeLayer(false);
  }

  private makeLayer(additive: boolean): Layer {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = (n: number) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(CAP * n), n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    const pos = mk(4), color = mk(4), vel = mk(4), misc = mk(2);
    geo.setAttribute('aPos', pos);
    geo.setAttribute('aColor', color);
    geo.setAttribute('aVel', vel);
    geo.setAttribute('aMisc', misc);
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uSoft: { value: additive ? 0 : 1 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = additive ? 60 : 55;
    this.group.add(mesh);
    return { mesh, geo, pos, color, vel, misc };
  }

  private spawn(): P | null {
    const p = this.free.pop();
    if (!p) return null;
    p.alive = true;
    p.life = 0;
    p.rot = Math.random() * 6.28;
    p.vr = (Math.random() - 0.5) * 0.6;
    p.seed = Math.random();
    p.stretch = 0;
    p.grav = 0;
    p.drag = 0;
    this.parts.push(p);
    return p;
  }

  private ground(x: number, z: number): number {
    const hf = this.ctx.hf;
    const cx = clamp(x, 0, hf.worldW), cz = clamp(z, 0, hf.worldH);
    return Math.max(hf.heightAt(cx, cz, 0.02), hf.waterAt(cx, cz));
  }

  private scaleFor(): number {
    return clamp(this.camDist * 0.022, 0.012, 1.2);
  }

  // ---- Primitive effects -----------------------------------------------------------
  flash(x: number, y: number, z: number, s: number, r = 1, g = 0.85, b = 0.5): void {
    const p = this.spawn();
    if (!p) return;
    Object.assign(p, { x, y, z, vx: 0, vy: 0, vz: 0, max: 0.12, s0: s, s1: s * 1.4, r, g, b, a0: 1.6, a1: 0, kind: K.Flash, add: true });
  }

  explosion(x: number, y: number, z: number, s: number, big = false): void {
    this.flash(x, y + s * 0.3, z, s * (big ? 1.5 : 1.1), 1, 0.9, 0.7);
    const nf = big ? 12 : 7;
    for (let i = 0; i < nf; i++) {
      const p = this.spawn();
      if (!p) break;
      const a = Math.random() * 6.28, sp = s * (0.6 + Math.random() * 1.2);
      Object.assign(p, {
        x, y: y + s * 0.2, z, vx: Math.cos(a) * sp, vy: s * (0.8 + Math.random() * 1.5), vz: Math.sin(a) * sp,
        max: 0.45 + Math.random() * 0.45, s0: s * 0.35, s1: s * (big ? 0.9 : 0.65), r: 1, g: 0.45 + Math.random() * 0.3, b: 0.12,
        a0: 0.75, a1: 0, kind: K.Fire, add: true, drag: 2.5,
      });
    }
    const ns = big ? 14 : 7;
    for (let i = 0; i < ns; i++) {
      const p = this.spawn();
      if (!p) break;
      const a = Math.random() * 6.28, sp = s * (0.2 + Math.random() * 0.6);
      const gray = 0.12 + Math.random() * 0.12;
      Object.assign(p, {
        x: x + Math.cos(a) * s * 0.3, y: y + s * 0.3, z: z + Math.sin(a) * s * 0.3, vx: Math.cos(a) * sp, vy: s * (0.5 + Math.random() * 0.8), vz: Math.sin(a) * sp,
        max: 2.5 + Math.random() * 2.5, s0: s * 0.7, s1: s * (big ? 3.5 : 2.4), r: gray, g: gray, b: gray * 1.05, a0: 0.8, a1: 0, kind: K.Smoke, add: false, drag: 1.2,
      });
    }
    const nk = big ? 16 : 8;
    for (let i = 0; i < nk; i++) {
      const p = this.spawn();
      if (!p) break;
      const a = Math.random() * 6.28, sp = s * (2 + Math.random() * 3);
      Object.assign(p, {
        x, y: y + s * 0.2, z, vx: Math.cos(a) * sp, vy: s * (2 + Math.random() * 3), vz: Math.sin(a) * sp,
        max: 0.5 + Math.random() * 0.4, s0: s * 0.06, s1: s * 0.03, r: 1, g: 0.75, b: 0.35, a0: 1.5, a1: 0, kind: K.Spark, add: true, grav: s * 9, stretch: 3,
      });
    }
  }

  smoke(x: number, y: number, z: number, s: number, intensity = 1): void {
    const n = intensity > 0.6 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const p = this.spawn();
      if (!p) return;
      const g = 0.1 + Math.random() * 0.1;
      Object.assign(p, {
        x: x + (Math.random() - 0.5) * s * 0.3, y, z: z + (Math.random() - 0.5) * s * 0.3,
        vx: s * 0.25, vy: s * (0.5 + Math.random() * 0.4), vz: s * 0.1,
        max: 3 + Math.random() * 2, s0: s * 0.3, s1: s * 1.6, r: g, g, b: g, a0: 0.55 * intensity + 0.2, a1: 0, kind: K.Smoke, add: false, drag: 0.3,
      });
    }
    if (intensity > 0.5 && Math.random() < 0.5) {
      const p = this.spawn();
      if (!p) return;
      Object.assign(p, { x, y, z, vx: 0, vy: s * 0.6, vz: 0, max: 0.5, s0: s * 0.35, s1: s * 0.15, r: 1, g: 0.5, b: 0.15, a0: 1.1, a1: 0, kind: K.Fire, add: true });
    }
  }

  private tracer(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, s: number, col: [number, number, number]): void {
    const p = this.spawn();
    if (!p) return;
    const dx = tx - fx, dy = ty - fy, dz = tz - fz;
    const len = Math.hypot(dx, dy, dz) || 1;
    const speed = Math.max(s * 25, len / 0.35);
    const t = len / speed;
    Object.assign(p, {
      x: fx, y: fy, z: fz, vx: (dx / len) * speed, vy: (dy / len) * speed, vz: (dz / len) * speed,
      max: t, s0: s * 0.07, s1: s * 0.07, r: col[0], g: col[1], b: col[2], a0: 1.8, a1: 1.2, kind: K.Tracer, add: true, stretch: 7,
    });
  }

  private projectile(kind: K.Shell | K.Missile, fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, s: number, flight: number, arc: number): void {
    const p = this.spawn();
    if (!p) return;
    const t = flight;
    // Ballistic: y(t) = fy + vy t - g t²/2 reaching ty at t.
    const g = (arc * 8) / (t * t);
    Object.assign(p, {
      x: fx, y: fy, z: fz, vx: (tx - fx) / t, vz: (tz - fz) / t, vy: (ty - fy) / t + (g * t) / 2,
      max: t, s0: s * (kind === K.Missile ? 0.18 : 0.1), s1: s * 0.1, r: 1, g: kind === K.Missile ? 0.85 : 0.7, b: 0.4, a0: 2, a1: 2,
      kind, add: true, grav: g, tx, ty, tz, scale: s, stretch: kind === K.Missile ? 2 : 1,
    });
  }

  // ---- Game events --------------------------------------------------------------------
  onEvent(e: GameEvent, camDist: number): void {
    this.camDist = camDist;
    const s = this.scaleFor();
    switch (e.type) {
      case 'combat': {
        const fy = this.ground(e.fromX, e.fromZ) + s * 0.25;
        const ty = this.ground(e.toX, e.toZ) + s * 0.1;
        const dist = Math.hypot(e.toX - e.fromX, e.toZ - e.fromZ);
        switch (e.weapon) {
          case 'direct':
            this.flash(e.fromX, fy, e.fromZ, s * 0.7);
            for (let i = 0; i < 3; i++) {
              const j = () => (Math.random() - 0.5) * s * 0.6;
              setTimeout(() => this.tracer(e.fromX + j(), fy, e.fromZ + j(), e.toX + j(), ty, e.toZ + j(), s, [1, 0.8, 0.35]), i * 90);
            }
            setTimeout(() => this.explosion(e.toX, ty, e.toZ, s * 0.45), 350);
            break;
          case 'artillery':
          case 'naval': {
            this.flash(e.fromX, fy, e.fromZ, s * 1.1, 1, 0.8, 0.45);
            this.puff(e.fromX, fy, e.fromZ, s * 0.6);
            const n = e.weapon === 'naval' ? 2 : 3;
            for (let i = 0; i < n; i++) {
              const j = () => (Math.random() - 0.5) * s * 1.2;
              setTimeout(() => this.projectile(K.Shell, e.fromX, fy, e.fromZ, e.toX + j(), ty, e.toZ + j(), s, clamp(0.9 + dist * 0.05, 0.9, 2.2), Math.max(s * 2, dist * 0.25)), i * 160);
            }
            break;
          }
          case 'missile':
            this.flash(e.fromX, fy, e.fromZ, s * 0.9, 1, 0.9, 0.6);
            this.projectile(K.Missile, e.fromX, fy, e.fromZ, e.toX, ty, e.toZ, s, clamp(1.1 + dist * 0.06, 1.1, 3), Math.max(s * 1.5, dist * 0.18));
            break;
          case 'air': {
            const ay = fy + clamp(s * 1.3, 0.06, 3.2);
            this.projectile(K.Missile, e.fromX, ay, e.fromZ, e.toX, ty, e.toZ, s, clamp(0.8 + dist * 0.04, 0.8, 2), s * 0.2);
            break;
          }
          case 'aa': {
            const ay = ty + clamp(s * 1.3, 0.06, 3.2);
            for (let i = 0; i < 5; i++) {
              const j = () => (Math.random() - 0.5) * s * 1.5;
              setTimeout(() => {
                this.tracer(e.fromX, fy, e.fromZ, e.toX + j(), ay + j() * 0.5, e.toZ + j(), s, [1, 0.55, 0.3]);
                this.flak(e.toX + j(), ay + j() * 0.5, e.toZ + j(), s * 0.5);
              }, i * 110);
            }
            break;
          }
        }
        break;
      }
      case 'unitDestroyed': {
        const y = this.ground(e.x, e.z);
        this.explosion(e.x, y, e.z, s * 1.1, true);
        this.emitters.push({ x: e.x, y, z: e.z, t: 7, rate: 5, acc: 0, scale: s * 0.9, fire: true });
        break;
      }
      case 'facilityDamaged': {
        const y = this.ground(e.x, e.z);
        this.explosion(e.x, y, e.z, s * 0.8, true);
        this.emitters.push({ x: e.x, y, z: e.z, t: 5, rate: 4, acc: 0, scale: s * 0.7, fire: true });
        break;
      }
      case 'cityCaptured':
      case 'hexCaptured':
      default:
        break;
    }
  }

  private puff(x: number, y: number, z: number, s: number): void {
    for (let i = 0; i < 3; i++) {
      const p = this.spawn();
      if (!p) return;
      const g = 0.35 + Math.random() * 0.1;
      Object.assign(p, {
        x, y, z, vx: (Math.random() - 0.5) * s, vy: s * 0.6, vz: (Math.random() - 0.5) * s, max: 1.2 + Math.random(), s0: s * 0.4, s1: s * 1.2,
        r: g, g, b: g * 0.95, a0: 0.5, a1: 0, kind: K.Smoke, add: false, drag: 1.5,
      });
    }
  }

  private flak(x: number, y: number, z: number, s: number): void {
    this.flash(x, y, z, s * 0.8, 1, 0.7, 0.4);
    const p = this.spawn();
    if (!p) return;
    Object.assign(p, { x, y, z, vx: 0, vy: 0, vz: 0, max: 1.6, s0: s * 0.4, s1: s * 0.9, r: 0.08, g: 0.08, b: 0.08, a0: 0.8, a1: 0, kind: K.Flak, add: false, drag: 1 });
  }

  private splashOrBoom(x: number, y: number, z: number, s: number, big: boolean): void {
    const hf = this.ctx.hf;
    if (hf.isWater(clamp(x, 0, hf.worldW), clamp(z, 0, hf.worldH))) {
      for (let i = 0; i < 8; i++) {
        const p = this.spawn();
        if (!p) break;
        const a = Math.random() * 6.28, sp = s * 0.4;
        Object.assign(p, {
          x, y, z, vx: Math.cos(a) * sp, vy: s * (2 + Math.random() * 2), vz: Math.sin(a) * sp, max: 0.9, s0: s * 0.35, s1: s * 0.8,
          r: 0.85, g: 0.9, b: 0.95, a0: 0.8, a1: 0, kind: K.Splash, add: false, grav: s * 6, drag: 0.5,
        });
      }
    } else {
      this.explosion(x, y, z, s * (big ? 0.9 : 0.6), big);
    }
  }

  // ---- Simulation ------------------------------------------------------------------------
  update(dt: number, camera: THREE.Camera, camDist: number): void {
    void camera;
    this.camDist = camDist;
    // Emitters (burning wrecks, damaged sites).
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const em = this.emitters[i];
      em.t -= dt;
      em.acc += dt * em.rate;
      while (em.acc >= 1) {
        em.acc -= 1;
        this.smoke(em.x, em.y + em.scale * 0.2, em.z, em.scale, clamp(em.t / 4, 0.3, 1));
      }
      if (em.t <= 0) this.emitters.splice(i, 1);
    }
    const parts = this.parts;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.max) {
        if (p.kind === K.Shell) this.splashOrBoom(p.tx, p.ty, p.tz, p.scale, false);
        else if (p.kind === K.Missile) this.splashOrBoom(p.tx, p.ty, p.tz, p.scale, true);
        p.alive = false;
        parts[i] = parts[parts.length - 1];
        parts.pop();
        this.free.push(p);
        continue;
      }
      if (p.drag) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k; p.vz *= k;
        if (p.kind !== K.Smoke) p.vy *= k;
      }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += p.vr * dt;
      if (p.kind === K.Missile && Math.random() < 0.9) {
        // Smoke trail.
        const q = this.spawn();
        if (q) Object.assign(q, { x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, max: 1.4, s0: p.scale * 0.1, s1: p.scale * 0.45, r: 0.8, g: 0.8, b: 0.8, a0: 0.55, a1: 0, kind: K.Smoke, add: false, drag: 0 });
      } else if (p.kind === K.Shell && Math.random() < 0.4) {
        const q = this.spawn();
        if (q) Object.assign(q, { x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0, max: 0.5, s0: p.scale * 0.06, s1: p.scale * 0.2, r: 0.6, g: 0.6, b: 0.6, a0: 0.35, a1: 0, kind: K.Smoke, add: false, drag: 0 });
      }
    }
    this.upload();
  }

  private upload(): void {
    let na = 0, nb = 0;
    const A = this.add, B = this.alpha;
    const ap = A.pos.array as Float32Array, ac = A.color.array as Float32Array, av = A.vel.array as Float32Array, am = A.misc.array as Float32Array;
    const bp = B.pos.array as Float32Array, bc = B.color.array as Float32Array, bv = B.vel.array as Float32Array, bm = B.misc.array as Float32Array;
    for (const p of this.parts) {
      const t = p.life / p.max;
      const s = p.s0 + (p.s1 - p.s0) * t;
      let a = p.a0 + (p.a1 - p.a0) * t;
      if (p.kind === K.Smoke) a *= Math.min(1, p.life * 6);
      const add = p.add;
      if (add ? na >= CAP : nb >= CAP) continue;
      const i = add ? na++ : nb++;
      const P4 = add ? ap : bp, C4 = add ? ac : bc, V4 = add ? av : bv, M2 = add ? am : bm;
      P4[i * 4] = p.x; P4[i * 4 + 1] = p.y; P4[i * 4 + 2] = p.z; P4[i * 4 + 3] = s;
      let r = p.r, g = p.g, b = p.b;
      if (p.kind === K.Fire) { r = 1; g = p.g * (1 - t * 0.6); b = p.b * (1 - t); }
      C4[i * 4] = r; C4[i * 4 + 1] = g; C4[i * 4 + 2] = b; C4[i * 4 + 3] = a;
      V4[i * 4] = p.vx; V4[i * 4 + 1] = p.vy; V4[i * 4 + 2] = p.vz; V4[i * 4 + 3] = p.stretch;
      M2[i * 2] = p.rot; M2[i * 2 + 1] = p.seed;
    }
    for (const [L, n] of [[A, na], [B, nb]] as [Layer, number][]) {
      L.geo.instanceCount = n;
      for (const at of [L.pos, L.color, L.vel, L.misc]) {
        at.needsUpdate = true;
        at.clearUpdateRanges();
        at.addUpdateRange(0, Math.max(1, n) * at.itemSize);
      }
    }
  }
}
