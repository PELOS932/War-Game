/** Fixed size of unit models in world units (a hex is ~1.7 units across). */
const UNIT_MODEL_SIZE = 0.9;
import * as THREE from 'three';
import type { GameAPI } from '../../sim/api';
import { CATEGORY_CLASS, SPEED_HOURS_PER_SECOND, UnitCategory, UnitClass, type Unit } from '../../sim/types';
import type { RTSCamera } from '../camera';
import { clamp, smoothstep } from '../constants';
import type { Effects } from '../effects';
import type { WorldContext } from '../index';
import { patchStandard } from '../lighting';
import { TerrainChunks } from '../terrain/chunks';
import { ATLAS_H, ATLAS_W, BadgeAtlas, DIGIT_H, DIGIT_W, DIGIT_Y0, FLAG_H, FLAG_W, flagCell, SYM_H, SYM_W, symbolCell } from './atlas';
import { buildModel, Formation, formationFor, ModelKind } from './models';
import { builtModel, isBuilt, resolvedVisual, rotorGeo, type RotorMount } from './designModels';

/** Badge size in CSS px (frame 52×32 + 8 px stem). */
const BW = 52, BH = 40, STEM = 8;
const MODEL_MAX_DIST = 75;
/** Beyond this camera→unit distance the per-category model is used instead of the per-design one. */
const DETAIL_DIST = 60;
/** Max distinct per-design models drawn per frame (bounds draw calls); others fall back to category models. */
const MAX_DETAIL_KEYS = 140;
/** Per-design geometries generated per frame at most (lazy build without stalls). */
const BUILDS_PER_FRAME = 4;

/** Per-design render info (cached by design id). */
interface DInfo { cat: number; main: string | null; extra: string | null; members: [number, number][] | null; mscale: number }
const CLUSTER_DIST = 75;

interface Disp {
  id: number;
  x: number; z: number; y: number; h: number;
  fx: number; fz: number; tx: number; tz: number; t: number; dur: number;
  cat: number; cls: UnitClass; nation: number; form: Formation; info: DInfo;
  embarked: boolean; airborne: boolean; onCarrier: boolean;
  strength: number;
  seen: number;
  hex: number;
  // Per-frame render outputs.
  rx: number; rz: number; ry: number;
  sx: number; sy: number; onScreen: boolean;
  badge: boolean; bOffX: number; bOffY: number; bScale: number;
  hx: number; hz: number; hsp: number; hSurf: number; hWater: number; hGround: number;
}

class Pool {
  mesh: THREE.InstancedMesh;
  count = 0;
  private cap: number;
  private geo: THREE.BufferGeometry;
  private mat: THREE.Material;
  private group: THREE.Group;
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, group: THREE.Group, cap = 64) {
    this.geo = geo;
    this.mat = mat;
    this.group = group;
    this.cap = cap;
    this.mesh = this.make(cap);
  }
  private make(cap: number): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(this.geo, this.mat, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = true;
    m.receiveShadow = false;
    m.count = 0;
    m.renderOrder = 6;
    this.group.add(m);
    return m;
  }
  push(mat: THREE.Matrix4, c: THREE.Color): void {
    if (this.count >= this.cap) {
      const old = this.mesh;
      this.cap *= 2;
      this.mesh = this.make(this.cap);
      (this.mesh.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
      (this.mesh.instanceColor!.array as Float32Array).set(old.instanceColor!.array as Float32Array);
      this.group.remove(old);
      old.dispose();
    }
    mat.toArray(this.mesh.instanceMatrix.array as Float32Array, this.count * 16);
    c.toArray(this.mesh.instanceColor!.array as Float32Array, this.count * 3);
    this.count++;
  }
  finish(): void {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
    this.mesh.visible = this.count > 0;
    this.count = 0;
  }
}

const BADGE_VERT = /* glsl */ `
attribute vec3 aPos;
attribute vec4 aA;
attribute vec4 aB;
attribute vec4 aC;
attribute vec4 aD;
uniform vec2 uViewport;
uniform float uPx;
varying vec2 vP;
varying vec4 vA;
varying vec4 vB;
varying vec4 vC;
varying vec4 vD;
void main() {
  vec4 clip = projectionMatrix * viewMatrix * vec4(aPos, 1.0);
  if (clip.w <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float sc = uPx * aB.z;
  vec2 size = vec2(${BW.toFixed(1)}, ${BH.toFixed(1)});
  vP = vec2(position.x * size.x, (1.0 - position.y) * size.y);
  vec2 off = vec2((position.x - 0.5) * size.x, position.y * size.y) * sc + aB.xy * uPx;
  vec2 ndc = clip.xy / clip.w + off * 2.0 / uViewport;
  gl_Position = vec4(ndc, 0.0, 1.0);
  vA = aA; vB = aB; vC = aC; vD = aD;
}
`;

const BADGE_FRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uTime;
varying vec2 vP;
varying vec4 vA;
varying vec4 vB;
varying vec4 vC;
varying vec4 vD;
const vec2 ATLAS = vec2(${ATLAS_W.toFixed(1)}, ${ATLAS_H.toFixed(1)});
float sdBox(vec2 p, vec2 c, vec2 h, float r) {
  vec2 d = abs(p - c) - h + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}
vec4 atlas(vec2 px) { return texture(uAtlas, vec2(px.x / ATLAS.x, 1.0 - px.y / ATLAS.y)); }
void main() {
  vec2 p = vP;
  float sel = vC.w;
  vec4 outc = vec4(0.0);
  // Stem from the counter down to the unit.
  if (p.y > 31.0) {
    float s = 1.0 - smoothstep(0.6, 1.4, abs(p.x - 26.0));
    float dot = 1.0 - smoothstep(1.8, 2.8, length(p - vec2(26.0, 38.0)));
    vec3 sc = sel > 0.5 ? vec3(1.0, 0.9, 0.3) : vec3(0.05);
    outc = vec4(sc, max(s * 0.9, dot));
    if (outc.a < 0.01) discard;
    gl_FragColor = outc;
    return;
  }
  float d = sdBox(p, vec2(26.0, 16.0), vec2(26.0, 16.0), 3.5);
  if (sel > 0.5) {
    float g = 1.0 - smoothstep(-1.0, 2.5, d - 1.0);
    outc = vec4(1.0, 0.88, 0.25, g * (0.8 + 0.2 * sin(uTime * 7.0)));
  }
  float inside = 1.0 - smoothstep(-0.6, 0.6, d);
  if (inside > 0.0) {
    vec3 body = vC.rgb;
    float di = sdBox(p, vec2(26.0, 16.0), vec2(23.5, 13.5), 2.0);
    body = mix(body, vec3(0.07, 0.08, 0.09), 1.0 - smoothstep(-0.5, 0.5, di));
    // Flag.
    if (p.x > 4.0 && p.x < 22.0 && p.y > 5.0 && p.y < 17.0) {
      vec2 f = (p - vec2(4.0, 5.0)) / vec2(18.0, 12.0);
      body = atlas(vA.xy + vec2(1.5) + f * vec2(${(FLAG_W - 3).toFixed(1)}, ${(FLAG_H - 3).toFixed(1)})).rgb;
    }
    // NATO symbol.
    if (p.x > 23.0 && p.x < 49.0 && p.y > 3.0 && p.y < 22.5) {
      vec2 f = (p - vec2(23.0, 3.0)) / vec2(26.0, 19.5);
      vec4 s = atlas(vA.zw + f * vec2(${SYM_W.toFixed(1)}, ${SYM_H.toFixed(1)}));
      body = mix(body, s.rgb, s.a);
    }
    // Strength bar.
    if (p.x > 4.0 && p.x < 48.0 && p.y > 24.0 && p.y < 28.5) {
      float str = vB.w;
      float fx = (p.x - 4.0) / 44.0;
      vec3 bc = str > 0.5 ? mix(vec3(0.95, 0.8, 0.1), vec3(0.2, 0.85, 0.25), (str - 0.5) * 2.0) : mix(vec3(0.9, 0.15, 0.1), vec3(0.95, 0.8, 0.1), str * 2.0);
      body = fx < str ? bc : vec3(0.2, 0.2, 0.2);
    }
    outc = vec4(mix(outc.rgb, body, inside), max(outc.a, inside));
  }
  // Stack count tab (top-right).
  float cnt = vD.x;
  if (cnt > 1.5) {
    vec2 c = vec2(49.0, 3.0);
    float two = cnt > 9.5 ? 1.0 : 0.0;
    float rd = sdBox(p, c, vec2(5.0 + two * 3.5, 6.0), 5.0);
    float tab = 1.0 - smoothstep(-0.5, 0.5, rd);
    if (tab > 0.0) {
      vec3 tc = vec3(0.9, 0.12, 0.1);
      float ring = smoothstep(-2.0, -1.0, rd);
      tc = mix(tc, vec3(1.0), ring * 0.9);
      // Digits.
      float n = min(cnt, 99.0);
      float d0 = two > 0.5 ? floor(n / 10.0) : mod(n, 10.0);
      float d1 = mod(n, 10.0);
      vec2 q = p - c + vec2(4.0 + two * 3.5, 5.5);
      float gw = 8.0, gh = 11.0;
      for (int k = 0; k < 2; k++) {
        if (k == 1 && two < 0.5) break;
        float dig = k == 0 ? d0 : d1;
        vec2 gq = q - vec2(float(k) * 7.0, 0.0);
        if (gq.x >= 0.0 && gq.x < gw && gq.y >= 0.0 && gq.y < gh) {
          vec4 g = atlas(vec2(dig * ${DIGIT_W.toFixed(1)}, ${DIGIT_Y0.toFixed(1)}) + gq / vec2(gw, gh) * vec2(${DIGIT_W.toFixed(1)}, ${DIGIT_H.toFixed(1)}));
          tc = mix(tc, vec3(1.0), g.a);
        }
      }
      outc = vec4(mix(outc.rgb, tc, tab), max(outc.a, tab));
    }
  }
  if (outc.a < 0.01) discard;
  gl_FragColor = outc;
}
`;

const RING_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying vec3 vColor;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float ring = smoothstep(0.72, 0.8, r) * (1.0 - smoothstep(0.92, 1.0, r));
  float pulse = 0.75 + 0.25 * sin(uTime * 5.0 - r * 6.0);
  float ticks = step(0.6, fract(atan(p.y, p.x) * 3.0 / 3.14159 + uTime * 0.3));
  float a = ring * pulse * mix(0.65, 1.0, ticks);
  if (a < 0.02) discard;
  gl_FragColor = vec4(vColor * 1.2, a);
}
`;
const RING_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vColor;
void main() {
  vUv = uv;
  vColor = instanceColor;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

export class Units {
  readonly group = new THREE.Group();
  visible = true;
  private ctx: WorldContext;
  private canvas: HTMLCanvasElement;
  private game: GameAPI | null = null;
  private disp = new Map<number, Disp>();
  private pools = new Map<string, Pool>();
  private poolUsed = new Map<string, number>();
  private infoCache = new Map<string, DInfo>();
  private usedKeys = new Set<string>();
  private builds = 0;
  private buildT0 = 0;
  /** Stats of the last frame (dev/bench). */
  stats = { detailKeys: 0, detailUnits: 0, categoryUnits: 0, pools: 0 };
  /** Camera distance up to which per-design models are drawn (0 = category models only). */
  detailDist = DETAIL_DIST;
  private mat: THREE.MeshStandardMaterial;
  private glow = { value: 0.2 };
  private frame = 0;
  private time = 0;
  private selected = new Set<number>();
  private atlas: BadgeAtlas | null = null;
  private badgeGeo: THREE.InstancedBufferGeometry;
  private badgeMat: THREE.ShaderMaterial;
  private badgeMesh: THREE.Mesh;
  private badgeCap = 0;
  private bPos!: THREE.InstancedBufferAttribute;
  private bA!: THREE.InstancedBufferAttribute;
  private bB!: THREE.InstancedBufferAttribute;
  private bC!: THREE.InstancedBufferAttribute;
  private bD!: THREE.InstancedBufferAttribute;
  private ringPool: Pool;
  private shadowPool: Pool;
  private affil: Int8Array = new Int8Array(0);
  private affilTimer = 0;
  private catCache = new Map<string, number>();
  private natColors: THREE.Color[] = [];
  private natSRGB: [number, number, number][] = [];
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private sv = new THREE.Vector3();
  private col = new THREE.Color();
  private up = new THREE.Vector3(0, 1, 0);
  private projV = new THREE.Vector3();
  private badgeOrder: Disp[] = [];
  private size = 0.1;
  private lastW = 1;
  private lastH = 1;
  private gScale = 1;
  private camD = 10;

  constructor(ctx: WorldContext, canvas: HTMLCanvasElement) {
    this.ctx = ctx;
    this.canvas = canvas;
    this.group.name = 'units';
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 });
    patchStandard(this.mat, ctx.shared, {
      key: 'units',
      tintAttribute: true,
      uniforms: { uUnitGlow: this.glow },
      fragDecl: 'uniform float uUnitGlow;',
      afterLights: 'totalEmissiveRadiance += diffuseColor.rgb * (uUnitGlow + 0.55 * nightFactor(vWPos));',
    });

    // Counters.
    this.badgeGeo = new THREE.InstancedBufferGeometry();
    this.badgeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3));
    this.badgeGeo.setIndex([0, 1, 2, 0, 2, 3]);
    this.allocBadges(1024);
    this.badgeMat = new THREE.ShaderMaterial({
      uniforms: {
        uAtlas: { value: null },
        uViewport: { value: new THREE.Vector2(1, 1) },
        uPx: { value: 1 },
        uTime: ctx.shared.uTime,
      },
      vertexShader: BADGE_VERT,
      fragmentShader: BADGE_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.badgeMesh = new THREE.Mesh(this.badgeGeo, this.badgeMat);
    this.badgeMesh.frustumCulled = false;
    this.badgeMesh.renderOrder = 1000;
    this.group.add(this.badgeMesh);

    // Selection rings (drawn over terrain, under the models).
    const ringGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    const ringMat = new THREE.ShaderMaterial({
      uniforms: { uTime: ctx.shared.uTime },
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.ringPool = new Pool(ringGeo, ringMat, this.group, 32);
    this.ringPool.mesh.castShadow = false;

    // Soft ground shadows under aircraft.
    const sc = document.createElement('canvas');
    sc.width = sc.height = 64;
    const g2 = sc.getContext('2d')!;
    const grd = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g2.fillStyle = grd;
    g2.fillRect(0, 0, 64, 64);
    const shTex = new THREE.CanvasTexture(sc);
    const shMat = new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false, color: 0xffffff });
    shMat.polygonOffset = true;
    shMat.polygonOffsetFactor = -4;
    shMat.polygonOffsetUnits = -40;
    this.shadowPool = new Pool(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), shMat, this.group, 64);
    this.shadowPool.mesh.castShadow = false;
  }

  private allocBadges(cap: number): void {
    this.badgeCap = cap;
    const mk = (n: number) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.bPos = mk(3); this.bA = mk(4); this.bB = mk(4); this.bC = mk(4); this.bD = mk(4);
    this.badgeGeo.setAttribute('aPos', this.bPos);
    this.badgeGeo.setAttribute('aA', this.bA);
    this.badgeGeo.setAttribute('aB', this.bB);
    this.badgeGeo.setAttribute('aC', this.bC);
    this.badgeGeo.setAttribute('aD', this.bD);
  }

  attachGame(game: GameAPI): void {
    this.game = game;
    this.disp.clear();
    const nations = game.state.nations;
    this.atlas?.texture.dispose();
    this.atlas = new BadgeAtlas(nations.map((n) => n.flag));
    this.atlas.texture.colorSpace = THREE.NoColorSpace;
    this.badgeMat.uniforms.uAtlas.value = this.atlas.texture;
    this.natColors = nations.map((n) => new THREE.Color().setRGB(n.color[0] / 255, n.color[1] / 255, n.color[2] / 255, THREE.SRGBColorSpace));
    this.natSRGB = nations.map((n) => [n.color[0] / 255, n.color[1] / 255, n.color[2] / 255]);
    this.affil = new Int8Array(nations.length);
    this.affilTimer = 1e9;
  }

  private pool(kind: ModelKind): Pool {
    const key = `k:${kind}`;
    let p = this.pools.get(key);
    if (!p) {
      p = new Pool(buildModel(kind), this.mat, this.group, 64);
      this.pools.set(key, p);
    }
    this.poolUsed.set(key, this.frame);
    return p;
  }

  /** Instanced pool of a per-design model (geometry built lazily by the library). */
  private designPool(key: string): Pool {
    const pk = `d:${key}`;
    let p = this.pools.get(pk);
    if (!p) {
      p = new Pool(builtModel(key)!.geo, this.mat, this.group, 8);
      this.pools.set(pk, p);
    }
    this.poolUsed.set(pk, this.frame);
    return p;
  }

  private rotorPool(r: number, b: number): Pool {
    const pk = `r:${r.toFixed(3)}|${b}`;
    let p = this.pools.get(pk);
    if (!p) {
      p = new Pool(rotorGeo(r, b), this.mat, this.group, 16);
      p.mesh.castShadow = false;
      this.pools.set(pk, p);
    }
    this.poolUsed.set(pk, this.frame);
    return p;
  }

  /** May this frame draw per-design model `key`? (bounded distinct models + lazy build budget). */
  private detailOK(key: string): boolean {
    if (this.usedKeys.has(key)) return true;
    if (this.usedKeys.size >= MAX_DETAIL_KEYS) return false;
    if (!isBuilt(key)) {
      if (this.builds >= BUILDS_PER_FRAME || performance.now() - this.buildT0 > 8) return false;
      this.builds++;
    }
    this.usedKeys.add(key);
    return true;
  }

  private designInfo(id: string): DInfo {
    let i = this.infoCache.get(id);
    if (!i) {
      const d = this.game?.state.designs.get(id);
      const cat = d?.category ?? UnitCategory.Infantry;
      i = { cat, main: null, extra: null, members: null, mscale: 1 };
      if (d) {
        try {
          const rv = resolvedVisual(d);
          i = { cat, main: rv.mainKey, extra: rv.extraKey, members: rv.v.members ?? null, mscale: rv.v.scale ?? 1 };
        } catch (e) {
          console.warn('design model failed', id, e);
        }
      }
      this.infoCache.set(id, i);
    }
    return i;
  }

  private category(u: Unit): number {
    let c = this.catCache.get(u.design);
    if (c === undefined) {
      c = this.designInfo(u.design).cat;
      this.catCache.set(u.design, c);
    }
    return c;
  }

  private refreshAffiliations(): void {
    const g = this.game!;
    const p = g.state.playerNation;
    const n = this.affil.length;
    for (let i = 0; i < n; i++) {
      if (p < 0) { this.affil[i] = 2; continue; }
      if (i === p) this.affil[i] = 0;
      else if (g.atWar(p, i)) this.affil[i] = 3;
      else if (g.hasTreaty(p, i, 'alliance') || g.hasTreaty(p, i, 'defensePact')) this.affil[i] = 1;
      else this.affil[i] = 2;
    }
  }

  onDestroyed(id: number): void {
    this.disp.delete(id);
    this.selected.delete(id);
  }

  setSelected(ids: number[]): void {
    this.selected = new Set(ids);
  }

  // ---------------------------------------------------------------------------
  update(dt: number, cam: RTSCamera, camera: THREE.PerspectiveCamera, fx: Effects | null): void {
    void fx;
    this.time += dt;
    this.frame++;
    const g = this.game;
    this.group.visible = this.visible && !!g;
    if (!g || !this.visible) return;
    const st = g.state;
    const player = st.playerNation;
    this.affilTimer += dt;
    if (this.affilTimer > 1) {
      this.affilTimer = 0;
      this.refreshAffiliations();
    }
    const d = cam.dist;
    this.camD = d;
    // Model size grows with distance so units never become sub-pixel.
    const s = UNIT_MODEL_SIZE; // fixed world size: models don't resize with zoom
    this.size = s;
    this.glow.value = 0.12 + 0.3 * smoothstep(4, 60, d);
    const hps = SPEED_HOURS_PER_SECOND[st.speed] ?? 1;
    const tickDur = clamp(hps > 0 ? 1 / hps : 1, 0.04, 1.2);
    const hf = this.ctx.hf;
    const split = 2.2;
    const frame = this.frame;

    // 1. Sync display state.
    for (const u of st.units.values()) {
      if (u.hidden && u.nation !== player) continue;
      if (player >= 0 && u.nation !== player && this.affil[u.nation] !== 1 && !g.isVisible(player, u.hex)) continue;
      let o = this.disp.get(u.id);
      if (!o) {
        const cat = this.category(u);
        o = {
          id: u.id, x: u.x, z: u.z, y: 0, h: u.heading, fx: u.x, fz: u.z, tx: u.x, tz: u.z, t: 1, dur: tickDur,
          cat, cls: CATEGORY_CLASS[cat as UnitCategory], nation: u.nation, form: formationFor(cat, u.embarked), info: this.designInfo(u.design),
          embarked: u.embarked, airborne: u.airborne, onCarrier: false, strength: u.strength, seen: frame, hex: u.hex,
          rx: u.x, rz: u.z, ry: 0, sx: 0, sy: 0, onScreen: false, badge: false, bOffX: 0, bOffY: 0, bScale: 1,
          hx: NaN, hz: NaN, hsp: 0, hSurf: 0, hWater: -Infinity, hGround: 0,
        };
        this.disp.set(u.id, o);
      }
      if (u.x !== o.tx || u.z !== o.tz) {
        const jump = Math.hypot(u.x - o.x, u.z - o.z);
        if (jump > 12) {
          o.x = o.fx = u.x; o.z = o.fz = u.z; o.t = 1;
        } else {
          o.fx = o.x; o.fz = o.z; o.t = 0; o.dur = tickDur;
        }
        o.tx = u.x; o.tz = u.z;
      }
      if (o.embarked !== u.embarked) {
        o.embarked = u.embarked;
        o.form = formationFor(o.cat, u.embarked);
      }
      o.airborne = u.airborne;
      o.onCarrier = !u.airborne && (u.carrier ?? -1) >= 0;
      o.nation = u.nation;
      o.strength = u.strength;
      o.hex = u.hex;
      o.seen = frame;
      if (o.t < 1) {
        o.t = Math.min(1, o.t + dt / o.dur);
        o.x = o.fx + (o.tx - o.fx) * o.t;
        o.z = o.fz + (o.tz - o.fz) * o.t;
      }
      let dh = u.heading - o.h;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      o.h += dh * Math.min(1, dt * 6);
    }
    for (const [id, o] of this.disp) if (o.seen !== frame) this.disp.delete(id);

    // 2. Spread co-located units around their hex so formations don't overlap.
    const byHex = new Map<number, Disp[]>();
    for (const o of this.disp.values()) {
      o.rx = o.x; o.rz = o.z;
      if (o.onCarrier) continue;
      const key = o.hex * 4 + (o.cls === UnitClass.Air && o.airborne ? 1 : o.cls === UnitClass.Naval || o.embarked ? 2 : 0);
      let l = byHex.get(key);
      if (!l) byHex.set(key, (l = []));
      l.push(o);
    }
    for (const l of byHex.values()) {
      if (l.length < 2) continue;
      l.sort((a, b) => a.id - b.id);
      const n = l.length;
      // Ships and aircraft are longer than land formations: spread them further.
      const wide = l[0].cls !== UnitClass.Land && !(l[0].cls === UnitClass.Air && !l[0].airborne);
      const r = s * (n <= 4 ? (wide ? 0.78 : 0.62) : wide ? 1.0 : 0.85);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.5;
        l[i].rx += Math.cos(a) * r;
        l[i].rz += Math.sin(a) * r;
      }
    }

    // 3. Heights, screen projection.
    const W = this.canvas.clientWidth || 1, H = this.canvas.clientHeight || 1;
    this.lastW = W; this.lastH = H;
    const sp = TerrainChunks.spacingForDistance(Math.max(d * 0.8, 0.1), split);
    for (const o of this.disp.values()) {
      // Cached ground sample (re-sampled when the unit moves or the LOD changes).
      if (Math.abs(o.rx - o.hx) > s * 0.05 || Math.abs(o.rz - o.hz) > s * 0.05 || o.hsp !== sp) {
        o.hx = o.rx; o.hz = o.rz; o.hsp = sp;
        o.hGround = hf.heightAt(clamp(o.rx, 0, hf.worldW), clamp(o.rz, 0, hf.worldH), sp);
        o.hWater = hf.waterAt(o.rx, o.rz);
        o.hSurf = Math.max(o.hGround, o.hWater);
      }
      const ground = o.hGround, water = o.hWater, surf = o.hSurf;
      if (o.cls === UnitClass.Air && o.airborne) {
        o.ry = surf + clamp(s * 1.3, 0.06, 3.2) + (o.cat === UnitCategory.Helicopter ? -s * 0.5 : 0);
      } else if (o.cls === UnitClass.Naval || o.embarked) {
        o.ry = (water > -Infinity ? water : ground) + Math.sin(this.time * 1.3 + o.id) * s * 0.012;
      } else {
        o.ry = surf;
      }
      const ay = o.ry + s * 0.35;
      this.projV.set(o.rx, ay, o.rz).project(camera);
      o.onScreen = this.projV.z < 1 && this.projV.z > -1 && Math.abs(this.projV.x) < 1.15 && Math.abs(this.projV.y) < 1.15;
      o.sx = (this.projV.x * 0.5 + 0.5) * W;
      o.sy = (-this.projV.y * 0.5 + 0.5) * H;
      o.badge = false;
    }

    // 4. Models: per-design model near the camera, category model further away.
    const showModels = d < MODEL_MAX_DIST;
    this.usedKeys.clear();
    this.builds = 0;
    this.buildT0 = performance.now();
    let nDetail = 0, nCat = 0;
    if (showModels) {
      const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const sphere = new THREE.Sphere();
      const cp = camera.position;
      for (const o of this.disp.values()) {
        if (o.onCarrier) continue;
        sphere.center.set(o.rx, o.ry, o.rz);
        sphere.radius = s * 1.2;
        if (!fr.intersectsSphere(sphere)) continue;
        const nc = this.natColors[o.nation] ?? this.col.set(0x888888);
        const f = o.form;
        const ch = Math.cos(o.h), sh = Math.sin(o.h);
        const isAir = o.cls === UnitClass.Air;
        const place = (pool: Pool, rotors: RotorMount[] | null, heli: boolean, lx: number, lz: number, scale: number, yaw: number) => {
          const wx = o.rx + (lx * ch - lz * sh) * s;
          const wz = o.rz + (lx * sh + lz * ch) * s;
          let wy = o.ry;
          if (!isAir && o.cls === UnitClass.Land && !o.embarked && d < 12) {
            wy = Math.max(hf.heightAt(wx, wz, sp), hf.waterAt(wx, wz));
          }
          this.q.setFromAxisAngle(this.up, -o.h + yaw);
          if (o.cls === UnitClass.Naval || o.embarked) {
            const roll = Math.sin(this.time * 1.1 + o.id * 1.7) * 0.03;
            this.q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), roll));
          }
          this.m4.compose(this.v.set(wx, wy, wz), this.q, this.sv.set(scale, scale, scale));
          pool.push(this.m4, nc);
          if (heli) {
            this.q.setFromAxisAngle(this.up, this.time * 25 + o.id);
            this.m4.compose(this.v.set(wx + 0.12 * scale * ch, wy + 0.4 * scale, wz + 0.12 * scale * sh), this.q, this.sv.set(scale, scale, scale));
            this.pool('rotor').push(this.m4, nc);
          }
          if (rotors) {
            const cy = Math.cos(o.h - yaw), sy = Math.sin(o.h - yaw);
            for (const m of rotors) {
              const ang = o.airborne ? this.time * 25 * m.dir + o.id : m.dir * 0.4 + o.id;
              this.q.setFromAxisAngle(this.up, ang);
              const rx = m.x * scale, rz = m.z * scale;
              this.m4.compose(this.v.set(wx + rx * cy - rz * sy, wy + m.y * scale, wz + rx * sy + rz * cy), this.q, this.sv.set(scale, scale, scale));
              this.rotorPool(m.r, m.b).push(this.m4, nc);
            }
          }
          if (isAir && o.airborne) {
            const gy = o.hSurf;
            this.q.identity();
            this.m4.compose(this.v.set(wx, gy + 0.002, wz), this.q, this.sv.set(scale * 0.5, 1, scale * 0.5));
            this.shadowPool.push(this.m4, this.col.set(0xffffff));
          }
        };
        const info = o.info;
        const dc = Math.hypot(o.rx - cp.x, o.ry - cp.y, o.rz - cp.z);
        if (!o.embarked && info.main && dc < this.detailDist && this.detailOK(info.main)) {
          nDetail++;
          const bm = builtModel(info.main)!;
          const pool = this.designPool(info.main);
          const rot = bm.rotors.length ? bm.rotors : null;
          const members = info.members ?? f.members;
          const ms = s * f.scale * info.mscale;
          for (let i = 0; i < members.length; i++) {
            const [lx, lz] = members[i];
            place(pool, rot, false, lx, lz, ms, (i % 3) * 0.04);
          }
          if (info.extra && this.detailOK(info.extra)) {
            const at = f.extra?.at ?? [-0.36, 0];
            const eb = builtModel(info.extra)!;
            place(this.designPool(info.extra), eb.rotors.length ? eb.rotors : null, false, at[0], at[1], s * 0.42, 0);
          } else if (f.extra) place(this.pool(f.extra.kind), null, f.extra.kind === 'heli', f.extra.at[0], f.extra.at[1], s * 0.42, 0);
        } else {
          nCat++;
          const ms = s * f.scale;
          const pool = this.pool(f.kind);
          for (let i = 0; i < f.members.length; i++) {
            const [lx, lz] = f.members[i];
            place(pool, null, f.kind === 'heli', lx, lz, ms, (i % 3) * 0.04);
          }
          if (f.extra) place(this.pool(f.extra.kind), null, f.extra.kind === 'heli', f.extra.at[0], f.extra.at[1], s * 0.42, 0);
        }
        if (this.selected.has(o.id)) {
          this.q.identity();
          const rr = s * 0.95;
          this.m4.compose(this.v.set(o.rx, o.ry + 0.003, o.rz), this.q, this.sv.set(rr, 1, rr));
          const aff = this.affil[o.nation];
          this.ringPool.push(this.m4, this.col.set(aff === 3 ? 0xff5040 : 0x7dff6a));
        }
      }
    } else {
      for (const o of this.disp.values()) {
        if (!this.selected.has(o.id) || !o.onScreen) continue;
        this.q.identity();
        const rr = Math.min(s * 0.95, d * 0.02);
        this.m4.compose(this.v.set(o.rx, o.ry + 0.01, o.rz), this.q, this.sv.set(rr, 1, rr));
        this.ringPool.push(this.m4, this.col.set(0x7dff6a));
      }
    }
    this.stats.detailKeys = this.usedKeys.size;
    this.stats.detailUnits = nDetail;
    this.stats.categoryUnits = nCat;
    // Release instanced meshes of models not drawn for a while (geometry stays cached).
    if (this.frame % 120 === 0) {
      for (const [k, fu] of this.poolUsed) {
        if (this.frame - fu > 1800 && !k.startsWith('k:')) {
          const p = this.pools.get(k);
          if (p) { this.group.remove(p.mesh); p.mesh.dispose(); this.pools.delete(k); }
          this.poolUsed.delete(k);
        }
      }
    }
    this.stats.pools = this.pools.size;
    for (const p of this.pools.values()) p.finish();
    this.ringPool.finish();
    this.shadowPool.finish();

    // 5. Counters (badges): stack per hex when zoomed in, cluster on screen when zoomed out.
    this.buildBadges(d, player);
  }

  private buildBadges(d: number, player: number): void {
    const gs = d > 260 ? 0.72 : d > 120 ? 0.85 : 1;
    this.gScale = gs;
    const dpr = this.canvas.width / Math.max(1, this.canvas.clientWidth);
    this.badgeMat.uniforms.uViewport.value.set(this.canvas.width, this.canvas.height);
    this.badgeMat.uniforms.uPx.value = dpr * gs;
    const groups = new Map<string, Disp[]>();
    const cluster = d > CLUSTER_DIST;
    const spread = d > 300 ? 1.9 : d > 120 ? 1.35 : 1;
    const cw = BW * gs * 0.95 * spread, ch = (BH - STEM) * gs * 0.9 * spread;
    for (const o of this.disp.values()) {
      if (!o.onScreen) continue;
      // Whole-world view: only the player's forces and enemies at war with the player.
      if (d > 300 && player >= 0 && o.nation !== player && this.affil[o.nation] !== 3 && !this.selected.has(o.id)) continue;
      let key: string;
      if (this.selected.has(o.id)) key = `s${o.id}`;
      else if (o.onCarrier) key = `h${o.hex}n`;
      else if (cluster) key = `c${Math.floor(o.sx / cw)},${Math.floor(o.sy / ch)}`;
      else key = `h${o.hex}${o.cls === UnitClass.Naval || o.embarked ? 'n' : o.cls === UnitClass.Air && o.airborne ? 'a' : ''}`;
      let l = groups.get(key);
      if (!l) groups.set(key, (l = []));
      l.push(o);
    }
    const prio = (o: Disp) => (o.nation === player ? 0 : this.affil[o.nation] === 3 ? 1 : 2) * 1000 - (o.onCarrier ? -500 : 0) - o.strength;
    const order: { o: Disp; k: number; n: number; y: number; sel: boolean }[] = [];
    for (const l of groups.values()) {
      l.sort((a, b) => prio(a) - prio(b));
      const n = l.length;
      const top = l[0];
      const cascade = cluster ? 1 : Math.min(3, n);
      for (let k = cascade - 1; k >= 0; k--) {
        const o = l[k];
        order.push({ o, k, n, y: top.sy, sel: this.selected.has(o.id) });
      }
    }
    // Far (top of screen) first so nearer counters draw on top; selected last.
    order.sort((a, b) => (a.sel === b.sel ? a.y - b.y : a.sel ? 1 : -1));
    if (order.length > this.badgeCap) {
      let c = this.badgeCap;
      while (c < order.length) c *= 2;
      this.allocBadges(c);
    }
    const P = this.bPos.array as Float32Array, A = this.bA.array as Float32Array, B = this.bB.array as Float32Array;
    const C = this.bC.array as Float32Array, D = this.bD.array as Float32Array;
    this.badgeOrder.length = 0;
    let i = 0;
    for (const e of order) {
      const o = e.o;
      const sel = e.sel;
      o.badge = true;
      o.bOffX = e.k * 4;
      o.bOffY = e.k * 5;
      o.bScale = sel ? 1.12 : 1;
      P[i * 3] = o.rx; P[i * 3 + 1] = o.ry + this.size * 0.35; P[i * 3 + 2] = o.rz;
      const [fxp, fyp] = flagCell(o.nation);
      const aff = this.affil[o.nation] ?? 2;
      const [sxp, syp] = symbolCell(Math.min(23, o.cat), aff);
      A[i * 4] = fxp; A[i * 4 + 1] = fyp; A[i * 4 + 2] = sxp; A[i * 4 + 3] = syp;
      B[i * 4] = o.bOffX; B[i * 4 + 1] = o.bOffY; B[i * 4 + 2] = o.bScale; B[i * 4 + 3] = clamp(o.strength / 100, 0, 1);
      const c = this.natSRGB[o.nation] ?? [0.5, 0.5, 0.5];
      C[i * 4] = c[0]; C[i * 4 + 1] = c[1]; C[i * 4 + 2] = c[2]; C[i * 4 + 3] = sel ? 1 : 0;
      D[i * 4] = e.k === 0 ? e.n : 0; D[i * 4 + 1] = aff; D[i * 4 + 2] = 0; D[i * 4 + 3] = 0;
      this.badgeOrder.push(o);
      i++;
    }
    this.badgeGeo.instanceCount = i;
    for (const a of [this.bPos, this.bA, this.bB, this.bC, this.bD]) {
      a.needsUpdate = true;
      a.clearUpdateRanges();
      a.addUpdateRange(0, i * a.itemSize);
    }
  }

  // ---------------------------------------------------------------------------
  /** Counter rectangle in CSS px (x0, y0, x1, y1). */
  private badgeRect(o: Disp): [number, number, number, number] {
    const sc = this.gScale * o.bScale;
    const x0 = o.sx - (BW / 2) * sc + o.bOffX * this.gScale;
    const y1 = o.sy - STEM * sc - o.bOffY * this.gScale;
    return [x0, y1 - (BH - STEM) * sc, x0 + BW * sc, y1];
  }

  pick(x: number, y: number, camera: THREE.Camera, w: number, h: number): number {
    void camera; void w; void h;
    // Counters first (topmost = last drawn).
    for (let i = this.badgeOrder.length - 1; i >= 0; i--) {
      const o = this.badgeOrder[i];
      const [x0, y0, x1, y1] = this.badgeRect(o);
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1 + STEM) return o.id;
    }
    // Then models: nearest projected centre within the model's screen radius.
    let best = -1, bd = Infinity;
    const pxPerUnit = this.lastH / Math.max(1e-6, 0.77 * this.camD);
    const rad = Math.max(14, this.size * pxPerUnit * 0.55);
    for (const o of this.disp.values()) {
      if (!o.onScreen) continue;
      const dd = Math.hypot(o.sx - x, o.sy - y);
      if (dd < rad && dd < bd) { bd = dd; best = o.id; }
    }
    return best;
  }

  inRect(x0: number, y0: number, x1: number, y1: number, nation: number, camera: THREE.Camera, w: number, h: number): number[] {
    void camera; void w; void h;
    const out: number[] = [];
    for (const o of this.disp.values()) {
      if (!o.onScreen || (nation >= 0 && o.nation !== nation)) continue;
      const inside = o.sx >= x0 && o.sx <= x1 && o.sy >= y0 && o.sy <= y1;
      let hit = inside;
      if (!hit && o.badge) {
        const [bx0, by0, bx1, by1] = this.badgeRect(o);
        hit = bx1 >= x0 && bx0 <= x1 && by1 >= y0 && by0 <= y1 && (bx0 + bx1) / 2 >= x0 && (bx0 + bx1) / 2 <= x1;
      }
      if (hit) out.push(o.id);
    }
    return out;
  }

  /** Current display position of a unit (for effects / UI). */
  positionOf(id: number): THREE.Vector3 | null {
    const o = this.disp.get(id);
    return o ? new THREE.Vector3(o.rx, o.ry, o.rz) : null;
  }

  get unitSize(): number {
    return this.size;
  }
}
