import * as THREE from 'three';
import type { GameAPI } from '../sim/api';
import type { RTSCamera } from './camera';
import { BLOCK_SIZE, LEAF_SPACING, STREET_WIDTH, TILE_SIZE, clamp, smoothstep } from './constants';
import type { WorldContext } from './index';
import type { CityInfo } from './landuse';
import { patchStandard } from './lighting';
import { box, cyl, extrudeXY, merge, part, prism, sphere } from './models/geom';
import { cityDensity, fromGrid, hashI, mulberry, toGrid } from './procedural';

/**
 * Procedural cities in two levels of detail:
 *  - FAR: every city as a cluster of skyline blocks on a coarse grid (always
 *    resident, one draw call per archetype). Heights/footprints are
 *    exaggerated as the camera zooms out so skylines stay readable.
 *  - NEAR: street-grid aligned buildings (towers, mid-rise, houses,
 *    industry) generated per tile around the camera within a time budget.
 * Walls get procedural windows that light up at night. Capitals get a
 * domed landmark.
 */

const NEAR_D = 3.4;
const FAR_BLOCK = 0.085;
const K_BOX = 0, K_TOWER = 1, K_HOUSE = 2;
const STRIDE = 10; // x y z w h d angle r g b

const WALL_TOWER = [0x7d8ea3, 0x9aa7b4, 0x5f7188, 0xb8b4aa, 0x8c9aa6, 0x6d7f93, 0xc9c3b6];
const WALL_MID = [0xb3aa9b, 0xa39784, 0x8f8a84, 0xc2b8a5, 0x9c8069, 0xb5a38a, 0x8d9296, 0xd0c8b8];
const WALL_HOUSE = [0xe6dccb, 0xd8cdb8, 0xefe6d6, 0xcbbfa8, 0xd9c4a3, 0xbfc4c7];
const WALL_IND = [0x8e959b, 0x7f8a92, 0xa0a4a6, 0x6f7c85];

const BUILDING_VERT_DECL = /* glsl */ `
varying vec3 vObj;
varying vec3 vScl;
varying vec3 vNo;
varying vec3 vBase;
uniform float uHeightMul;
uniform float uFootMul;
uniform vec3 uNearHole;
`;
const BUILDING_AFTER_BEGIN = /* glsl */ `
vObj = position;
vNo = normal;
#ifdef USE_INSTANCING
  vec3 _sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vBase = instanceMatrix[3].xyz;
#else
  vec3 _sc = vec3(1.0);
  vBase = vec3(0.0);
#endif
transformed.y *= uHeightMul;
transformed.xz *= uFootMul;
vScl = _sc * vec3(uFootMul, uHeightMul, uFootMul);
if (uNearHole.z > 0.0 && distance(vBase.xz, uNearHole.xy) < uNearHole.z) transformed *= 0.0;
`;
const BUILDING_FRAG_DECL = /* glsl */ `
varying vec3 vObj;
varying vec3 vScl;
varying vec3 vNo;
varying vec3 vBase;
uniform float uFloorH;
float bhash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;
const BUILDING_AFTER_COLOR = /* glsl */ `
vec3 bEmis = vec3(0.0);
{
  if (abs(vNo.y) < 0.3) {
    bool sideX = abs(vNo.x) > 0.5;
    vec2 fc = sideX ? vec2(vObj.z * vScl.z, vObj.y * vScl.y) : vec2(vObj.x * vScl.x, vObj.y * vScl.y);
    float fh = uFloorH * (vScl.y < uFloorH * 3.5 ? 0.8 : 1.0);
    vec2 g = fc / vec2(fh * 0.85, fh);
    vec2 cell = floor(g);
    vec2 f = g - cell;
    float px = max(fwidth(g.x), fwidth(g.y));
    float k = 1.0 - smoothstep(0.3, 0.75, px);
    float win = smoothstep(0.14, 0.22, f.x) * (1.0 - smoothstep(0.78, 0.86, f.x)) * smoothstep(0.22, 0.32, f.y) * (1.0 - smoothstep(0.76, 0.84, f.y));
    float wv = mix(0.32, win, k);
    vec3 glass = vec3(0.06, 0.08, 0.11) + vec3(0.04, 0.06, 0.09) * bhash(cell + vBase.xz * 311.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, glass, wv * 0.75);
    // Vertical shading: slightly darker at street level (ambient occlusion).
    diffuseColor.rgb *= 0.72 + 0.28 * smoothstep(0.0, 0.25, vObj.y);
    float h = bhash(cell + vBase.xz * 997.0 + (sideX ? 13.7 : 0.0));
    float lit = step(0.5, h) * (0.5 + 0.5 * bhash(cell * 1.37 + vBase.xz * 71.0));
    bEmis = mix(vec3(1.0, 0.72, 0.42), vec3(0.75, 0.85, 1.0), step(0.85, h)) * lit * wv * 1.6;
  } else if (vNo.y > 0.9) {
    diffuseColor.rgb *= 0.62;
  }
}
`;

interface CityTile {
  key: number;
  data: Float32Array[]; // per kind
  counts: number[];
  used: number;
}

class InstPool {
  mesh: THREE.InstancedMesh;
  cap: number;
  constructor(private geo: THREE.BufferGeometry, private mat: THREE.Material, private group: THREE.Group, cap: number, private shadows: boolean) {
    this.cap = cap;
    this.mesh = this.make(cap);
  }
  private make(cap: number): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(this.geo, this.mat, cap);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    m.frustumCulled = false;
    m.castShadow = this.shadows;
    m.receiveShadow = this.shadows;
    m.count = 0;
    this.group.add(m);
    return m;
  }
  ensure(n: number): void {
    if (n <= this.cap) return;
    let c = this.cap;
    while (c < n) c *= 2;
    this.group.remove(this.mesh);
    this.mesh.dispose();
    this.cap = c;
    this.mesh = this.make(c);
  }
}

const m4 = new THREE.Matrix4();
const q4 = new THREE.Quaternion();
const v3 = new THREE.Vector3();
const s3 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const colTmp = new THREE.Color();

function writeInstances(pool: InstPool, arrays: { data: Float32Array; count: number }[]): void {
  let n = 0;
  for (const a of arrays) n += a.count;
  pool.ensure(Math.max(1, n));
  const M = pool.mesh.instanceMatrix.array as Float32Array;
  const C = pool.mesh.instanceColor!.array as Float32Array;
  let i = 0;
  for (const a of arrays) {
    const d = a.data;
    for (let k = 0; k < a.count; k++) {
      const o = k * STRIDE;
      q4.setFromAxisAngle(UP, -d[o + 6]);
      m4.compose(v3.set(d[o], d[o + 1], d[o + 2]), q4, s3.set(d[o + 3], d[o + 4], d[o + 5]));
      m4.toArray(M, i * 16);
      C[i * 3] = d[o + 7]; C[i * 3 + 1] = d[o + 8]; C[i * 3 + 2] = d[o + 9];
      i++;
    }
  }
  pool.mesh.count = n;
  pool.mesh.instanceMatrix.needsUpdate = true;
  pool.mesh.instanceColor!.needsUpdate = true;
}

function boxGeo(): THREE.BufferGeometry {
  return merge([part(box(1, 1, 1), 0xffffff, { tint: 1 })]);
}

function towerGeo(): THREE.BufferGeometry {
  return merge([
    part(box(1, 0.78, 1), 0xffffff, { tint: 1 }),
    part(box(0.74, 0.16, 0.74), 0xffffff, { tint: 1, pos: [0, 0.78, 0] }),
    part(box(0.42, 0.05, 0.42), 0x6a6e72, { pos: [0, 0.94, 0] }),
    part(cyl(0.02, 0.03, 0.12, 4), 0x9a9ea2, { pos: [0.1, 0.94, 0.1] }),
  ]);
}

function houseGeo(): THREE.BufferGeometry {
  return merge([
    part(box(1, 0.62, 1), 0xffffff, { tint: 1 }),
    part(prism(1.12, 0.42, 1.08), 0x8a3b2a, { pos: [0, 0.62, 0] }),
  ]);
}

function landmarkGeo(): THREE.BufferGeometry {
  const stone = 0xe8e2d4;
  const cols: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) cols.push(part(cyl(0.025, 0.025, 0.22, 6), stone, { pos: [-0.25 + i * 0.1, 0.12, 0.33] }));
  return merge([
    part(box(1.0, 0.12, 0.62), 0xcfc8b8, {}),
    part(box(0.9, 0.24, 0.5), stone, { pos: [0, 0.12, 0] }),
    part(box(0.62, 0.04, 0.12), stone, { pos: [0, 0.34, 0.3] }),
    part(prism(0.62, 0.1, 0.12), stone, { pos: [0, 0.38, 0.3] }),
    ...cols,
    part(cyl(0.17, 0.19, 0.16, 16), stone, { pos: [0, 0.36, 0] }),
    part(sphere(0.18, 16, 8).translate(0, 0, 0), 0xb9c7cf, { pos: [0, 0.52, 0], scale: [1, 1.05, 1] }),
    part(cyl(0.03, 0.03, 0.12, 8), stone, { pos: [0, 0.68, 0] }),
    part(cyl(0.006, 0.006, 0.34, 4), 0x555555, { pos: [0.4, 0.36, -0.15] }),
    part(box(0.14, 0.08, 0.01), 0xffffff, { tint: 1, pos: [0.47, 0.62, -0.15] }),
  ]);
}

void extrudeXY;

export class Cities {
  readonly group = new THREE.Group();
  private ctx: WorldContext;
  private game: GameAPI | null = null;
  private nearMat: THREE.MeshStandardMaterial;
  private farMat: THREE.MeshStandardMaterial;
  private farU = { uHeightMul: { value: 1 }, uFootMul: { value: 1 }, uNearHole: { value: new THREE.Vector3() }, uFloorH: { value: 0.012 } };
  private nearU = { uHeightMul: { value: 1 }, uFootMul: { value: 1 }, uNearHole: { value: new THREE.Vector3() }, uFloorH: { value: 0.0045 } };
  private geos: THREE.BufferGeometry[];
  private nearPools: InstPool[];
  private farGroup = new THREE.Group();
  private nearGroup = new THREE.Group();
  private tiles = new Map<number, CityTile>();
  private tileCities = new Map<number, CityInfo[]>();
  private frame = 0;
  private lastSetKey = '';
  private landmark: InstPool;
  private landmarkMat: THREE.MeshStandardMaterial;
  private capitals: { x: number; y: number; z: number; nation: number; angle: number }[] = [];
  private capTimer = 0;
  private holeR = 0;

  constructor(ctx: WorldContext) {
    this.ctx = ctx;
    this.group.name = 'cities';
    this.group.add(this.farGroup, this.nearGroup);
    const mk = (u: Record<string, { value: unknown }>, key: string) => {
      const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.08 });
      patchStandard(m, ctx.shared, {
        key,
        tintAttribute: true,
        uniforms: u,
        vertDecl: BUILDING_VERT_DECL,
        afterBegin: BUILDING_AFTER_BEGIN,
        fragDecl: BUILDING_FRAG_DECL,
        afterColor: BUILDING_AFTER_COLOR,
        afterLights: 'totalEmissiveRadiance += bEmis * nightFactor(vWPos);',
      });
      return m;
    };
    this.nearMat = mk(this.nearU, 'bld-near');
    this.farMat = mk(this.farU, 'bld-far');
    this.geos = [boxGeo(), towerGeo(), houseGeo()];
    this.nearPools = this.geos.map((g) => new InstPool(g, this.nearMat, this.nearGroup, 256, true));

    // Tile → overlapping cities index.
    for (const c of ctx.cities) {
      const ext = c.r * 1.6;
      const tx0 = Math.floor((c.x - ext) / TILE_SIZE), tx1 = Math.floor((c.x + ext) / TILE_SIZE);
      const tz0 = Math.floor((c.z - ext) / TILE_SIZE), tz1 = Math.floor((c.z + ext) / TILE_SIZE);
      for (let tz = tz0; tz <= tz1; tz++) for (let tx = tx0; tx <= tx1; tx++) {
        const k = tx * 100000 + tz;
        let l = this.tileCities.get(k);
        if (!l) this.tileCities.set(k, (l = []));
        l.push(c);
      }
    }
    this.buildFar();

    // Capital landmarks.
    this.landmarkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 });
    patchStandard(this.landmarkMat, ctx.shared, { key: 'landmark', tintAttribute: true, afterLights: 'totalEmissiveRadiance += diffuseColor.rgb * 0.25 * nightFactor(vWPos);' });
    this.landmark = new InstPool(landmarkGeo(), this.landmarkMat, this.group, 256, true);
    this.capitals = ctx.cities.filter((c) => c.capital).map((c) => ({ x: c.x, y: ctx.hf.heightAt(c.x, c.z), z: c.z, nation: c.nation, angle: c.angle }));
  }

  attachGame(game: GameAPI): void {
    this.game = game;
    this.capTimer = 1e9;
  }

  private popFactor(c: CityInfo): number {
    return clamp((Math.log10(Math.max(1, c.pop)) - 2.3) / 2.2, 0, 1);
  }

  /** Coarse skyline blocks for every city. */
  private buildFar(): void {
    const hf = this.ctx.hf;
    const per: number[][] = [[], [], []];
    const B = FAR_BLOCK;
    for (const c of this.ctx.cities) {
      const pf = this.popFactor(c);
      const ext = c.r * 1.35;
      const n = Math.ceil(ext / B);
      for (let bv = -n; bv < n; bv++) {
        for (let bu = -n; bu < n; bu++) {
          const u = (bu + 0.5) * B, v = (bv + 0.5) * B;
          const [x, z] = fromGrid(u, v, c.x, c.z, c.angle);
          const dens = cityDensity(x, z, c.x, c.z, c.r, c.seed);
          if (dens < 0.1) continue;
          if (hashI(bu, bv, c.seed + 505) > dens * 1.5 + 0.15) continue;
          if (hf.isWater(x, z)) continue;
          if (c.capital && Math.hypot(x - c.x, z - c.z) < B * 1.2) continue;
          const r = mulberry(hashI(bu, bv, c.seed + 606) * 4294967296);
          const core = smoothstep(0.8, 1.0, dens) * smoothstep(0.35, 0.8, pf + 0.2);
          let h = 0.01 + 0.028 * dens + r() * 0.01;
          let kind = K_BOX;
          if (core > 0 && c.pop > 600 && r() < 0.35 + 0.55 * core) {
            h += (0.05 + 0.24 * pf) * core * (0.45 + 0.8 * r());
            kind = h > 0.07 ? K_TOWER : K_BOX;
          } else if (dens < 0.35) {
            h *= 0.6;
          }
          const w = B * (0.42 + 0.3 * r());
          const d = B * (0.42 + 0.3 * r());
          const pal = kind === K_TOWER ? WALL_TOWER : WALL_MID;
          colTmp.set(pal[Math.floor(r() * pal.length)]);
          const y = hf.heightAt(x, z, 0.02) - 0.002;
          per[kind].push(x, y, z, w, h, d, c.angle, colTmp.r, colTmp.g, colTmp.b);
        }
      }
    }
    for (let k = 0; k < 2; k++) {
      const data = Float32Array.from(per[k]);
      const pool = new InstPool(this.geos[k], this.farMat, this.farGroup, Math.max(16, data.length / STRIDE), false);
      writeInstances(pool, [{ data, count: data.length / STRIDE }]);
    }
  }

  /** Street-grid buildings for one tile. */
  private genTile(tx: number, tz: number): CityTile {
    const key = tx * 100000 + tz;
    const hf = this.ctx.hf;
    const x0 = tx * TILE_SIZE, z0 = tz * TILE_SIZE, x1 = x0 + TILE_SIZE, z1 = z0 + TILE_SIZE;
    const per: number[][] = [[], [], []];
    const cities = this.tileCities.get(key) ?? [];
    const B = BLOCK_SIZE, lot = BLOCK_SIZE - STREET_WIDTH;
    for (const c of cities) {
      const pf = this.popFactor(c);
      const corners = [toGrid(x0, z0, c.x, c.z, c.angle), toGrid(x1, z0, c.x, c.z, c.angle), toGrid(x0, z1, c.x, c.z, c.angle), toGrid(x1, z1, c.x, c.z, c.angle)];
      const u0 = Math.floor(Math.min(...corners.map((p) => p[0])) / B), u1 = Math.ceil(Math.max(...corners.map((p) => p[0])) / B);
      const v0 = Math.floor(Math.min(...corners.map((p) => p[1])) / B), v1 = Math.ceil(Math.max(...corners.map((p) => p[1])) / B);
      for (let bv = v0; bv < v1; bv++) {
        for (let bu = u0; bu < u1; bu++) {
          const cu = (bu + 0.5) * B, cv = (bv + 0.5) * B;
          const [x, z] = fromGrid(cu, cv, c.x, c.z, c.angle);
          if (x < x0 || x >= x1 || z < z0 || z >= z1) continue;
          const dens = cityDensity(x, z, c.x, c.z, c.r, c.seed);
          if (dens < 0.02) continue;
          let dominated = false;
          for (const o of cities) {
            if (o !== c && cityDensity(x, z, o.x, o.z, o.r, o.seed) > dens) { dominated = true; break; }
          }
          if (dominated) continue;
          // Parks and empty lots (must match the ground shader).
          const bh2 = hashI(bu, bv, c.seed + 202);
          if (bh2 < 0.07 + 0.1 * (1 - dens)) continue;
          if (hashI(bu, bv, c.seed + 303) > dens * 1.7 + 0.12) continue;
          if (c.capital && Math.hypot(x - c.x, z - c.z) < B * 1.6) continue;
          if (hf.isWater(x, z)) continue;
          const y = hf.heightAt(x, z, LEAF_SPACING) - 0.0012;
          const r = mulberry(hashI(bu, bv, c.seed + 707) * 4294967296);
          const push = (kind: number, lu: number, lv: number, w: number, h: number, d: number, pal: number[]) => {
            const [px, pz] = fromGrid(cu + lu, cv + lv, c.x, c.z, c.angle);
            colTmp.set(pal[Math.floor(r() * pal.length)]);
            const k = 0.9 + 0.2 * r();
            per[kind].push(px, y, pz, w, h, d, c.angle, colTmp.r * k, colTmp.g * k, colTmp.b * k);
          };
          const core = smoothstep(0.84, 1.0, dens) * smoothstep(0.35, 0.8, pf + 0.2);
          const industrial = hashI(bu, bv, c.seed + 404) < 0.13 && dens > 0.2 && dens < 0.7;
          if (core > 0 && c.pop > 600 && r() < 0.25 + 0.65 * core) {
            // Downtown towers.
            const two = r() < 0.45;
            const n = two ? 2 : 1;
            for (let i = 0; i < n; i++) {
              const h = (0.028 + (0.05 + 0.22 * pf) * core * (0.35 + 0.9 * r())) * (i ? 0.7 : 1);
              const w = lot * (two ? 0.4 : 0.62 + 0.2 * r());
              const d = lot * (0.55 + 0.3 * r());
              const off = two ? (i ? 0.25 : -0.25) * lot : 0;
              push(h > 0.05 ? K_TOWER : K_BOX, off, 0, w, h, d, WALL_TOWER);
            }
          } else if (industrial) {
            push(K_BOX, 0, 0, lot * (0.7 + 0.2 * r()), 0.008 + 0.006 * r(), lot * (0.55 + 0.3 * r()), WALL_IND);
            if (r() < 0.5) push(K_BOX, lot * 0.3, lot * 0.3, lot * 0.2, 0.014, lot * 0.2, WALL_IND);
          } else if (dens > 0.42) {
            // Mid-rise perimeter blocks (taller toward the centre).
            const hb = 0.009 + 0.03 * smoothstep(0.42, 1.0, dens) + 0.012 * pf;
            for (let i = 0; i < 4; i++) {
              if (r() < 0.18) continue;
              const lu = (i & 1 ? 0.25 : -0.25) * lot, lv = (i & 2 ? 0.25 : -0.25) * lot;
              push(K_BOX, lu, lv, lot * (0.36 + 0.1 * r()), hb * (0.6 + 0.8 * r()), lot * (0.36 + 0.1 * r()), WALL_MID);
            }
          } else {
            // Suburban houses.
            const nu = 3, nv = 2;
            for (let i = 0; i < nu * nv; i++) {
              if (r() < 0.25) continue;
              const lu = ((i % nu) + 0.5) / nu - 0.5, lv = (Math.floor(i / nu) + 0.5) / nv - 0.5;
              const s = 0.0075 + 0.0025 * r();
              push(K_HOUSE, lu * lot * 0.9, lv * lot * 0.85, s * 1.2, 0.0065 + 0.002 * r(), s, WALL_HOUSE);
            }
          }
        }
      }
    }
    const data = per.map((a) => Float32Array.from(a));
    return { key, data, counts: data.map((d) => d.length / STRIDE), used: this.frame };
  }

  update(camera: THREE.PerspectiveCamera, cam: RTSCamera, budgetMs: number): boolean {
    void camera;
    this.frame++;
    const d = cam.dist;
    // Zoom-dependent exaggeration of the far skyline.
    const zf = smoothstep(3, 40, d);
    this.farU.uHeightMul.value = 1 + 2.6 * zf;
    this.farU.uFootMul.value = 1 + 0.8 * zf;
    this.farU.uFloorH.value = 0.012 * (1 + zf);
    this.updateLandmarks(d);
    const near = d < NEAR_D;
    this.nearGroup.visible = near;
    if (!near) {
      this.farU.uNearHole.value.z = 0;
      this.holeR = 0;
      return true;
    }
    const R = d * 1.7 + 0.7;
    const cx = cam.x, cz = cam.z;
    const tx0 = Math.floor((cx - R) / TILE_SIZE), tx1 = Math.floor((cx + R) / TILE_SIZE);
    const tz0 = Math.floor((cz - R) / TILE_SIZE), tz1 = Math.floor((cz + R) / TILE_SIZE);
    const want: { key: number; tx: number; tz: number; dist: number }[] = [];
    for (let tz = tz0; tz <= tz1; tz++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const key = tx * 100000 + tz;
        if (!this.tileCities.has(key)) continue;
        const dx = Math.max(tx * TILE_SIZE - cx, 0, cx - (tx + 1) * TILE_SIZE);
        const dz = Math.max(tz * TILE_SIZE - cz, 0, cz - (tz + 1) * TILE_SIZE);
        const dist = Math.hypot(dx, dz);
        if (dist > R) continue;
        want.push({ key, tx, tz, dist });
      }
    }
    want.sort((a, b) => a.dist - b.dist);
    const t0 = performance.now();
    let missing = 0;
    for (const w of want) {
      if (this.tiles.has(w.key)) continue;
      if (performance.now() - t0 > budgetMs) { missing++; continue; }
      this.tiles.set(w.key, this.genTile(w.tx, w.tz));
    }
    const ready = want.filter((w) => this.tiles.has(w.key));
    for (const w of ready) this.tiles.get(w.key)!.used = this.frame;
    const setKey = ready.map((w) => w.key).join(',');
    if (setKey !== this.lastSetKey) {
      this.lastSetKey = setKey;
      for (let k = 0; k < 3; k++) {
        writeInstances(this.nearPools[k], ready.map((w) => {
          const t = this.tiles.get(w.key)!;
          return { data: t.data[k], count: t.counts[k] };
        }));
      }
    }
    // Hide far blocks where near tiles are present.
    if (missing === 0) this.holeR = Math.max(0, R - TILE_SIZE * 0.8);
    this.farU.uNearHole.value.set(cx, cz, this.holeR);
    // Evict old tiles.
    if (this.tiles.size > 260) {
      const old = [...this.tiles.values()].sort((a, b) => a.used - b.used);
      for (let i = 0; i < old.length - 200; i++) this.tiles.delete(old[i].key);
    }
    return missing === 0;
  }

  private updateLandmarks(d: number): void {
    this.capTimer += 1;
    if (this.game && this.capTimer > 120) {
      this.capTimer = 0;
      const st = this.game.state;
      this.capitals = st.cities.filter((c) => c.capital).map((c) => {
        const owner = st.hexOwner[c.hex] - 1;
        const ci = this.ctx.cities[c.id];
        return { x: c.x, y: this.ctx.hf.heightAt(c.x, c.z), z: c.z, nation: owner >= 0 ? owner : c.originalNation, angle: ci?.angle ?? 0 };
      });
    }
    const s = Math.max(0.075, d * 0.016);
    const data = new Float32Array(this.capitals.length * STRIDE);
    const nations = this.game?.state.nations;
    this.capitals.forEach((c, i) => {
      const o = i * STRIDE;
      const col = nations?.[c.nation]?.color ?? this.ctx.world.nations[c.nation]?.color ?? [200, 200, 200];
      colTmp.setRGB(col[0] / 255, col[1] / 255, col[2] / 255, THREE.SRGBColorSpace);
      data[o] = c.x; data[o + 1] = c.y - 0.002; data[o + 2] = c.z;
      data[o + 3] = s; data[o + 4] = s; data[o + 5] = s; data[o + 6] = c.angle;
      data[o + 7] = colTmp.r; data[o + 8] = colTmp.g; data[o + 9] = colTmp.b;
    });
    writeInstances(this.landmark, [{ data, count: this.capitals.length }]);
    this.landmark.mesh.visible = d < 140;
  }
}
