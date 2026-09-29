import * as THREE from 'three';
import type { GameAPI } from '../sim/api';
import { type Landmark, type SkylineProfile, type SkylineStyle, skylineFor } from '../data/skylines';
import type { RTSCamera } from './camera';
import { BLOCK_SIZE, LEAF_SPACING, STREET_WIDTH, TILE_SIZE, Y_SCALE, clamp, smoothstep } from './constants';
import type { WorldContext } from './index';
import type { CityInfo } from './landuse';
import { patchStandard } from './lighting';
import { box, boxC, cone, cyl, merge, part, prism, sphere } from './models/geom';
import { cityDensity, fromGrid, hashI, mulberry, toGrid } from './procedural';

/**
 * Procedural cities in two levels of detail, driven by real skyline profiles
 * (src/data/skylines.ts):
 *  - FAR: every city as a cluster of skyline blocks on a coarse grid (always
 *    resident, one draw call per archetype). Heights/footprints are
 *    exaggerated as the camera zooms out so cities stay readable.
 *  - NEAR: street-grid aligned buildings generated per tile around the camera
 *    within a time budget.
 * Skyscrapers exist only where the profile says so (count and heights follow
 * towers150 / towers100 / tallest); every other city is low/mid-rise fabric in
 * the regional style (historic stone, Soviet slabs, Latin concrete, suburbs...).
 * Walls get procedural windows that light up at night. Capitals get a domed
 * landmark; profiled cities can add signature shapes (Eiffel, Burj, Kremlin...).
 */

const NEAR_D = 3.4;
const FAR_BLOCK = 0.085;
const K_BOX = 0, K_TOWER = 1, K_HOUSE = 2, K_SPIRE = 3, K_CHURCH = 4, K_MOSQUE = 5;
const NK = 6;
const STRIDE = 10; // x y z w h d angle r g b
/** World-unit height of one storey (already exaggerated so blocks read from above). */
const ST = 0.0026;
/** Fabric extends a bit past the ground-shader city disc so cities read as solid. */
const RB = 1.18;

/** Metres → world height units with the game's vertical exaggeration (soft-capped for supertalls). */
function mToU(m: number): number {
  const e = m < 250 ? m : 250 + (m - 250) * 0.5;
  return e * Y_SCALE * 2.8;
}

// ---- Palettes -------------------------------------------------------------------
const GLASS_BLUE = [0x5f7f9c, 0x6d8fa8, 0x4f6c88, 0x7d9bb3, 0x5a7a90, 0x8fa8ba, 0x4a6a80];
const GLASS_TEAL = [0x6f93a8, 0x86a5b6, 0x5d7f96, 0xcfd6d9, 0x7a94a5, 0xb7c6cf, 0x4f7080];
const GLASS_GULF = [0x9fb6c8, 0xb9c8d3, 0x8aa2b5, 0xd4c8a8, 0xc7d2da, 0x7f99ad];
const STEEL_US = [0x7d8ea3, 0x9aa7b4, 0x6d7f93, 0xb8b4aa, 0x8a7d70, 0x5f7188, 0xc9c3b6];
const CBD_EU = [0x8fa3b5, 0xa9b7c2, 0x7f95a8, 0xc4c8c9, 0x6f8296];
const CONC_TOWER = [0xc9c3b6, 0xb8b0a0, 0xa39f98, 0xd6cfc0, 0x9aa7b4, 0x8c9aa6];
const SOV_TOWER = [0xb9b6ae, 0xa8a8a2, 0x9aa7b4, 0x8c9aa6];
const STONE_HIST = [0xd9c9a8, 0xcdbb98, 0xe0d3b6, 0xc4ad86, 0xbfae94, 0xd8cdbb, 0xcfc2ad];
const TOWER_HIST = [0x8f9faf, 0xa9b4bd, 0x7d8e9e, 0xb8b4aa];
const CONC_LATIN = [0xc9c3b6, 0xb8b0a0, 0xa39f98, 0xd6cfc0, 0xc59b7d, 0xb9c4c0];
const SOV_MID = [0xb9b6ae, 0xa8a8a2, 0xc4bfb2, 0x9d9c98, 0xc7c0aa, 0xa9b0b3];
const SA_MID = [0xb59a80, 0xa9a49a, 0xc09a7c, 0x9c8a78, 0xbf8f86, 0x8fa39a, 0xd0c4a8];
const AF_MID = [0xd9c7a6, 0xc2b08e, 0xa8a49a, 0xe0d6c0, 0xb9856a];
const MENA_MID = [0xd8c8a4, 0xe0d2b0, 0xcdbb90, 0xe6dcc4, 0xc4b08a];
const JP_MID = [0xd7d5cf, 0xbfc3c4, 0xa8adb0, 0xe0dcd2, 0xb5b0a4];
const KR_MID = [0xd9d6cc, 0xc8ccd0, 0xe0dccf, 0xb9c4cc];
const US_MID = [0xc3baab, 0xb3a794, 0x9f9a94, 0xd2c8b5, 0xac9079, 0xc5b39a, 0x9da2a6, 0xe0d8c8];
const CN_MID = [0xe0dcd0, 0xd0cdc4, 0xc4c8c8, 0xd9d0bc, 0xb9c0c4];
const HOUSE_US = [0xe6dccb, 0xd8cdb8, 0xefe6d6, 0xcbbfa8, 0xd9c4a3, 0xbfc4c7, 0xb9a48a];
const HOUSE_EU = [0xe9dfc8, 0xdcc9a6, 0xe2d5bb, 0xd2b998, 0xe8e0d0, 0xc9b79a];
const HOUSE_FLAT_LATIN = [0xd8b48a, 0xc9a07c, 0xd9c7a6, 0xb9c4a8, 0xd48f78, 0xe3d3b0, 0xa8b8c4];
const HOUSE_FLAT_SA = [0xb59a80, 0xc09a7c, 0xbf8f86, 0x8fa39a, 0xd0c4a8, 0xa9a49a];
const HOUSE_FLAT_AF = [0xc2a27a, 0xb08d68, 0xa8a49a, 0xc9a684, 0x9f8062];
const HOUSE_FLAT_MENA = [0xdccbA6, 0xd2c09a, 0xe6dcc4, 0xcfb88c].map((c) => c & 0xffffff);
const HOUSE_FLAT_SOV = [0xb9b6ae, 0xc4bfb2, 0xb0a892, 0xa9a49a];
const WALL_IND = [0x8e959b, 0x7f8a92, 0xa0a4a6, 0x6f7c85];

interface StyleDef {
  tower: number[];
  /** Probability that a sub-150 m tower gets the stepped/spired crown. */
  spire: number;
  /** Tower footprint as a fraction of the lot. */
  tw: number;
  mid: number[];
  midStart: number; // density above which blocks are mid-rise fabric
  lo: number; hi: number; // storeys at midStart / at the centre
  popStoreys: number; // extra storeys for the biggest metros
  cov: number; // chance a mid-rise slot stays empty
  foot: number; // footprint fraction
  mode: 0 | 1 | 2; // 0 perimeter block, 1 parallel slabs, 2 single/pair
  house: number[];
  gable: boolean;
  houseStoreys: number;
  houseSkip: number;
  ind: number;
  small: 'church' | 'mosque' | null;
  smallProb: number;
  strip: boolean; // CBD as a linear strip (Sheikh Zayed Road)
}

const STYLES: Record<SkylineStyle, StyleDef> = {
  'gulf-supertall': { tower: GLASS_GULF, spire: 0.7, tw: 0.36, mid: MENA_MID, midStart: 0.45, lo: 2, hi: 6, popStoreys: 2, cov: 0.22, foot: 0.44, mode: 2, house: HOUSE_FLAT_MENA, gable: false, houseStoreys: 2, houseSkip: 0.2, ind: 0.1, small: 'mosque', smallProb: 0.05, strip: true },
  'asian-megacity': { tower: GLASS_TEAL, spire: 0.4, tw: 0.44, mid: CN_MID, midStart: 0.3, lo: 4, hi: 10, popStoreys: 2, cov: 0.1, foot: 0.4, mode: 1, house: HOUSE_FLAT_SA, gable: false, houseStoreys: 2, houseSkip: 0.15, ind: 0.12, small: null, smallProb: 0, strip: false },
  'american-downtown': { tower: STEEL_US, spire: 0.55, tw: 0.5, mid: US_MID, midStart: 0.8, lo: 2, hi: 5, popStoreys: 1.5, cov: 0.4, foot: 0.5, mode: 2, house: HOUSE_US, gable: true, houseStoreys: 2, houseSkip: 0.28, ind: 0.13, small: 'church', smallProb: 0.03, strip: false },
  'european-cbd': { tower: CBD_EU, spire: 0.4, tw: 0.42, mid: STONE_HIST, midStart: 0.42, lo: 4, hi: 8, popStoreys: 2, cov: 0.1, foot: 0.5, mode: 0, house: HOUSE_EU, gable: true, houseStoreys: 2, houseSkip: 0.2, ind: 0.1, small: 'church', smallProb: 0.05, strip: false },
  'latin-dense': { tower: CONC_TOWER, spire: 0.25, tw: 0.42, mid: CONC_LATIN, midStart: 0.3, lo: 3, hi: 9, popStoreys: 4, cov: 0.1, foot: 0.46, mode: 0, house: HOUSE_FLAT_LATIN, gable: false, houseStoreys: 1.7, houseSkip: 0.12, ind: 0.1, small: 'church', smallProb: 0.05, strip: false },
  'soviet-blocks': { tower: SOV_TOWER, spire: 0.15, tw: 0.42, mid: SOV_MID, midStart: 0.3, lo: 4, hi: 9, popStoreys: 2, cov: 0.3, foot: 0.4, mode: 1, house: HOUSE_FLAT_SOV, gable: true, houseStoreys: 1.6, houseSkip: 0.3, ind: 0.16, small: 'church', smallProb: 0.025, strip: false },
  'european-historic': { tower: TOWER_HIST, spire: 0.3, tw: 0.4, mid: STONE_HIST, midStart: 0.27, lo: 4, hi: 6, popStoreys: 1, cov: 0.06, foot: 0.46, mode: 0, house: HOUSE_EU, gable: true, houseStoreys: 2, houseSkip: 0.15, ind: 0.09, small: 'church', smallProb: 0.07, strip: false },
  'south-asian-dense': { tower: CONC_TOWER, spire: 0.2, tw: 0.44, mid: SA_MID, midStart: 0.25, lo: 3, hi: 7, popStoreys: 3, cov: 0.08, foot: 0.5, mode: 0, house: HOUSE_FLAT_SA, gable: false, houseStoreys: 1.6, houseSkip: 0.08, ind: 0.1, small: 'mosque', smallProb: 0.03, strip: false },
  'african-growing': { tower: CONC_TOWER, spire: 0.2, tw: 0.44, mid: AF_MID, midStart: 0.6, lo: 2, hi: 5, popStoreys: 2, cov: 0.3, foot: 0.44, mode: 0, house: HOUSE_FLAT_AF, gable: false, houseStoreys: 1.2, houseSkip: 0.18, ind: 0.08, small: 'church', smallProb: 0.03, strip: false },
  'mena-dense': { tower: CONC_TOWER, spire: 0.25, tw: 0.44, mid: MENA_MID, midStart: 0.3, lo: 3, hi: 6, popStoreys: 3, cov: 0.1, foot: 0.5, mode: 0, house: HOUSE_FLAT_MENA, gable: false, houseStoreys: 1.7, houseSkip: 0.1, ind: 0.1, small: 'mosque', smallProb: 0.07, strip: false },
  'japan-dense': { tower: GLASS_BLUE, spire: 0.3, tw: 0.4, mid: JP_MID, midStart: 0.3, lo: 3, hi: 7, popStoreys: 3, cov: 0.1, foot: 0.4, mode: 2, house: HOUSE_EU, gable: true, houseStoreys: 2, houseSkip: 0.08, ind: 0.1, small: null, smallProb: 0, strip: false },
  'korean-apartments': { tower: GLASS_BLUE, spire: 0.3, tw: 0.42, mid: KR_MID, midStart: 0.3, lo: 6, hi: 12, popStoreys: 2, cov: 0.22, foot: 0.4, mode: 1, house: HOUSE_FLAT_SOV, gable: false, houseStoreys: 2, houseSkip: 0.2, ind: 0.1, small: 'church', smallProb: 0.04, strip: false },
  lowrise: { tower: STEEL_US, spire: 0.4, tw: 0.5, mid: US_MID, midStart: 0.85, lo: 2, hi: 3, popStoreys: 1, cov: 0.35, foot: 0.5, mode: 2, house: HOUSE_US, gable: true, houseStoreys: 2, houseSkip: 0.24, ind: 0.12, small: 'church', smallProb: 0.03, strip: false },
};

/** Real heights (m) of signature TV/observation towers, keyed by city name. */
const NEEDLE_M: Record<string, number> = { Toronto: 553, Tokyo: 634, Guangzhou: 604, Shanghai: 468, Colombo: 350, Tehran: 435, Auckland: 328, Berlin: 368 };

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
    // Bluish walls are curtain-wall glass: continuous glazing bands, not punched windows.
    float gl = step(0.03, diffuseColor.b - diffuseColor.r);
    float band = smoothstep(0.05, 0.14, f.y) * (1.0 - smoothstep(0.84, 0.94, f.y)) * smoothstep(0.01, 0.05, f.x) * (1.0 - smoothstep(0.95, 0.99, f.x));
    win = mix(win, band, gl * 0.85);
    float wv = mix(0.32, win, k);
    vec3 glass = mix(vec3(0.06, 0.08, 0.11) + vec3(0.04, 0.06, 0.09) * bhash(cell + vBase.xz * 311.0), vec3(0.30, 0.40, 0.50) + vec3(0.06, 0.08, 0.10) * bhash(cell + vBase.xz * 311.0), gl);
    diffuseColor.rgb = mix(diffuseColor.rgb, glass, wv * (0.75 - 0.4 * gl));
    // Vertical shading: slightly darker at street level (ambient occlusion).
    diffuseColor.rgb *= 0.72 + 0.28 * smoothstep(0.0, 0.25, vObj.y);
    float h = bhash(cell + vBase.xz * 997.0 + (sideX ? 13.7 : 0.0));
    float lit = step(0.62, h) * (0.5 + 0.5 * bhash(cell * 1.37 + vBase.xz * 71.0));
    vec3 wc = mix(vec3(1.0, 0.72, 0.42), vec3(0.75, 0.85, 1.0), step(0.9, h));
    // Sub-pixel windows average into a soft façade glow instead of noise.
    bEmis = mix(vec3(1.0, 0.76, 0.5) * 0.09, wc * lit * win * 1.4, k);
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

// ---- Building geometry ----------------------------------------------------------
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

/** Setback skyscraper with a needle: reads as a supertall from afar. */
function spireGeo(): THREE.BufferGeometry {
  return merge([
    part(box(1, 0.52, 1), 0xffffff, { tint: 1 }),
    part(box(0.82, 0.2, 0.82), 0xffffff, { tint: 1, pos: [0, 0.52, 0] }),
    part(box(0.62, 0.16, 0.62), 0xffffff, { tint: 1, pos: [0, 0.72, 0] }),
    part(box(0.36, 0.08, 0.36), 0xdfe4e8, { pos: [0, 0.88, 0] }),
    part(cyl(0.012, 0.03, 0.16, 4), 0xc7ccd0, { pos: [0, 0.96, 0] }),
  ]);
}

function houseGeo(): THREE.BufferGeometry {
  return merge([
    part(box(1, 0.62, 1), 0xffffff, { tint: 1 }),
    part(prism(1.12, 0.42, 1.08), 0x8a3b2a, { pos: [0, 0.62, 0] }),
  ]);
}

function churchGeo(): THREE.BufferGeometry {
  return merge([
    part(box(0.6, 0.42, 1), 0xffffff, { tint: 1, pos: [0, 0, 0.1] }),
    part(prism(0.66, 0.2, 1.04), 0x7a4a3a, { pos: [0, 0.42, 0.1] }),
    part(box(0.36, 0.7, 0.36), 0xffffff, { tint: 1, pos: [0, 0, -0.5] }),
    part(cone(0.3, 0.55, 4), 0x4f5457, { pos: [0, 0.7, -0.5], rot: [0, Math.PI / 4, 0] }),
  ]);
}

function mosqueGeo(): THREE.BufferGeometry {
  return merge([
    part(box(0.9, 0.34, 0.9), 0xffffff, { tint: 1 }),
    part(sphere(0.34, 12, 6), 0xd9e0dc, { pos: [0, 0.34, 0], scale: [1, 0.85, 1] }),
    part(cyl(0.05, 0.06, 0.95, 6), 0xf0ece2, { pos: [0.5, 0, 0.5] }),
    part(cone(0.08, 0.14, 6), 0x6f8f88, { pos: [0.5, 0.95, 0.5] }),
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

// ---- Signature landmarks (unit-height shapes, scaled per city) -------------------
function eiffelGeo(): THREE.BufferGeometry {
  const iron = 0x5d4a3e;
  const parts: THREE.BufferGeometry[] = [];
  const th = 0.62;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    parts.push(part(cyl(0.05, 0.1, 0.44, 4), iron, { pos: [sx * 0.42, 0, sz * 0.42], rot: [-sz * th, Math.PI / 4, sx * th] }));
  }
  parts.push(part(box(0.62, 0.035, 0.62), iron, { pos: [0, 0.3, 0] }));
  parts.push(part(cyl(0.05, 0.16, 0.42, 4), iron, { pos: [0, 0.335, 0], rot: [0, Math.PI / 4, 0] }));
  parts.push(part(box(0.2, 0.03, 0.2), iron, { pos: [0, 0.7, 0] }));
  parts.push(part(cyl(0.012, 0.045, 0.3, 4), iron, { pos: [0, 0.72, 0], rot: [0, Math.PI / 4, 0] }));
  return merge(parts);
}

function burjGeo(): THREE.BufferGeometry {
  const c = 0xb9c6d0;
  const tiers: [number, number, number, number][] = [[0.5, 0.42, 0, 0.2], [0.42, 0.34, 0.2, 0.4], [0.34, 0.26, 0.4, 0.6], [0.26, 0.17, 0.6, 0.78], [0.17, 0.07, 0.78, 0.9]];
  const parts = tiers.map(([rb, rt, y0, y1]) => part(cyl(rt, rb, y1 - y0, 6), c, { pos: [0, y0, 0] }));
  parts.push(part(cyl(0.015, 0.03, 0.1, 6), 0xdfe4e8, { pos: [0, 0.9, 0] }));
  return merge(parts);
}

function needleGeo(): THREE.BufferGeometry {
  const c = 0xd8d8d4;
  return merge([
    part(cyl(0.3, 0.42, 0.05, 10), c),
    part(cyl(0.05, 0.11, 0.6, 8), c, { pos: [0, 0.04, 0] }),
    part(cyl(0.22, 0.14, 0.05, 12), 0xb8bec4, { pos: [0, 0.56, 0] }),
    part(cyl(0.22, 0.22, 0.05, 12), 0x9aa4ac, { pos: [0, 0.61, 0] }),
    part(cyl(0.14, 0.22, 0.03, 12), 0xb8bec4, { pos: [0, 0.66, 0] }),
    part(cyl(0.012, 0.05, 0.3, 6), c, { pos: [0, 0.68, 0] }),
  ]);
}

function kremlinGeo(): THREE.BufferGeometry {
  const brick = 0x9a4636, gold = 0xd8b04a, green = 0x2f6b4a;
  const parts: THREE.BufferGeometry[] = [
    part(box(1, 0.1, 0.05), brick, { pos: [0, 0, 0.5] }),
    part(box(1, 0.1, 0.05), brick, { pos: [0, 0, -0.5] }),
    part(box(0.05, 0.1, 1), brick, { pos: [0.5, 0, 0] }),
    part(box(0.05, 0.1, 1), brick, { pos: [-0.5, 0, 0] }),
    part(box(0.34, 0.2, 0.28), 0xe8e0cc, { pos: [-0.12, 0, -0.1] }),
    part(box(0.1, 0.62, 0.1), 0xe6ddc6, { pos: [0.2, 0, 0.05] }),
    part(sphere(0.06, 8, 6), gold, { pos: [0.2, 0.66, 0.05] }),
    part(cyl(0.008, 0.008, 0.08), gold, { pos: [0.2, 0.7, 0.05] }),
  ];
  for (const [x, z] of [[-0.24, -0.16], [-0.12, -0.16], [0, -0.16], [-0.18, -0.02], [-0.06, -0.02]]) parts.push(part(sphere(0.045, 8, 6), gold, { pos: [x, 0.24, z], scale: [1, 1.3, 1] }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    parts.push(part(cyl(0.045, 0.05, 0.28, 6), brick, { pos: [sx * 0.5, 0, sz * 0.5] }));
    parts.push(part(cone(0.07, 0.24, 6), green, { pos: [sx * 0.5, 0.28, sz * 0.5] }));
  }
  return merge(parts);
}

function domeGeo(): THREE.BufferGeometry {
  const stone = 0xe4dccb;
  return merge([
    part(box(0.9, 0.24, 0.9), stone),
    part(cyl(0.33, 0.35, 0.2, 16), stone, { pos: [0, 0.24, 0] }),
    part(sphere(0.33, 16, 8), 0x8fa39c, { pos: [0, 0.44, 0], scale: [1, 0.95, 1] }),
    part(cyl(0.04, 0.05, 0.13, 8), stone, { pos: [0, 0.74, 0] }),
    part(cyl(0.008, 0.008, 0.12), 0xd8b04a, { pos: [0, 0.87, 0] }),
  ]);
}

function cathedralGeo(): THREE.BufferGeometry {
  const st = 0xa8a290, roof = 0x6c6f6f;
  return merge([
    part(box(0.5, 0.3, 1.0), st, { pos: [0, 0, 0.1] }),
    part(prism(0.56, 0.12, 1.0), roof, { pos: [0, 0.3, 0.1] }),
    part(box(0.2, 0.55, 0.2), st, { pos: [-0.15, 0, -0.45] }),
    part(box(0.2, 0.55, 0.2), st, { pos: [0.15, 0, -0.45] }),
    part(cone(0.16, 0.4, 4), roof, { pos: [-0.15, 0.55, -0.45], rot: [0, Math.PI / 4, 0] }),
    part(cone(0.16, 0.4, 4), roof, { pos: [0.15, 0.55, -0.45], rot: [0, Math.PI / 4, 0] }),
    part(cone(0.08, 0.35, 4), roof, { pos: [0, 0.4, 0.1], rot: [0, Math.PI / 4, 0] }),
  ]);
}

function minaretsGeo(): THREE.BufferGeometry {
  const w = 0xece7da;
  const parts: THREE.BufferGeometry[] = [
    part(box(0.7, 0.18, 0.7), w),
    part(sphere(0.3, 14, 7), 0x7fa3a0, { pos: [0, 0.18, 0], scale: [1, 0.85, 1] }),
    part(sphere(0.12, 8, 5), 0x7fa3a0, { pos: [0.28, 0.16, 0.28] }),
    part(sphere(0.12, 8, 5), 0x7fa3a0, { pos: [-0.28, 0.16, -0.28] }),
  ];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    parts.push(part(cyl(0.028, 0.038, 0.66, 8), w, { pos: [sx * 0.5, 0, sz * 0.5] }));
    parts.push(part(cyl(0.05, 0.05, 0.03, 8), w, { pos: [sx * 0.5, 0.5, sz * 0.5] }));
    parts.push(part(cone(0.045, 0.16, 8), 0x6f8f88, { pos: [sx * 0.5, 0.66, sz * 0.5] }));
  }
  return merge(parts);
}

function pagodaGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [part(box(1, 0.06, 1), 0xd8d0c0)];
  for (let i = 0; i < 5; i++) {
    const s = 0.62 - i * 0.08;
    const y = 0.06 + i * 0.16;
    parts.push(part(box(s, 0.1, s), 0xa03a2c, { pos: [0, y, 0] }));
    parts.push(part(cone(s * 0.95, 0.07, 4), 0x33393c, { pos: [0, y + 0.1, 0], rot: [0, Math.PI / 4, 0] }));
  }
  parts.push(part(cyl(0.01, 0.02, 0.14, 4), 0xd8b04a, { pos: [0, 0.86, 0] }));
  return merge(parts);
}

function bridgeGeo(): THREE.BufferGeometry {
  const steel = 0xc0553b;
  const parts: THREE.BufferGeometry[] = [part(boxC(1, 0.03, 0.12), 0x9ea3a6, { pos: [0, 0.28, 0] })];
  const cable = (x1: number, y1: number, x2: number, y2: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    parts.push(part(boxC(len, 0.012, 0.012), steel, { pos: [(x1 + x2) / 2, (y1 + y2) / 2, 0.05], rot: [0, 0, Math.atan2(y2 - y1, x2 - x1)] }));
    parts.push(part(boxC(len, 0.012, 0.012), steel, { pos: [(x1 + x2) / 2, (y1 + y2) / 2, -0.05], rot: [0, 0, Math.atan2(y2 - y1, x2 - x1)] }));
  };
  for (const sx of [-1, 1]) {
    parts.push(part(box(0.05, 0.9, 0.14), steel, { pos: [sx * 0.24, 0, 0] }));
    cable(sx * 0.24, 0.88, sx * 0.5, 0.3);
    cable(sx * 0.24, 0.88, sx * 0.02, 0.3);
    cable(sx * 0.24, 0.88, sx * 0.13, 0.3);
    cable(sx * 0.24, 0.88, sx * 0.37, 0.3);
  }
  return merge(parts);
}

const LM_GEO: Record<Landmark, () => THREE.BufferGeometry> = {
  eiffel: eiffelGeo, burj: burjGeo, 'cn-tower': needleGeo, kremlin: kremlinGeo, dome: domeGeo,
  minarets: minaretsGeo, pagoda: pagodaGeo, bridge: bridgeGeo, cathedral: cathedralGeo,
};
const LM_KINDS = Object.keys(LM_GEO) as Landmark[];

// ---- Skyline plans --------------------------------------------------------------
/** Tower heights (m, descending) to render for a profile, following its real counts. */
function towerHeights(p: SkylineProfile): number[] {
  const out: number[] = [];
  const t100 = Math.max(p.towers100, p.towers150);
  if (t100 === 0 && p.tallest < 60) return out;
  const tallest = Math.max(p.tallest, p.towers150 > 0 ? 150 : 0);
  // Real counts are compressed: a footprint on the map is hundreds of metres wide.
  const n100 = t100 <= 6 ? t100 : Math.round(6 + Math.pow(t100 - 6, 0.6));
  const n150 = p.towers150 <= 0 ? 0 : Math.min(n100, Math.max(1, Math.round((n100 * p.towers150) / t100)));
  for (let i = 0; i < n150; i++) {
    const u = n150 > 1 ? i / (n150 - 1) : 0;
    out.push(tallest - (tallest - 150) * Math.pow(u, 0.65));
  }
  const top = Math.min(149, tallest);
  const n1 = n100 - n150;
  for (let i = 0; i < n1; i++) {
    const u = n1 > 1 ? i / (n1 - 1) : 0;
    out.push(top - (top - 100) * u);
  }
  const nFill = t100 > 0 ? Math.min(140, Math.round(n100 * 0.9) + 2) : 2;
  const fTop = Math.min(99, tallest);
  for (let i = 0; i < nFill; i++) {
    const u = nFill > 1 ? i / (nFill - 1) : 0;
    out.push(fTop - (fTop - 50) * Math.pow(u, 0.8));
  }
  out.sort((a, b) => b - a);
  return out.slice(0, 320);
}

interface Tower { lu: number; lv: number; w: number; d: number; h: number; kind: number; col: number }
interface CityPlan {
  towers: Map<number, Tower[]>;
  /** Flat list for the far LOD: [u, v, h, w, kind, col]. */
  list: Tower[];
  /** Position (grid space) of the tallest tower when a 'burj' landmark replaces it. */
  burj: { u: number; v: number; h: number } | null;
}

const blockKey = (bu: number, bv: number) => (bu + 8192) * 16384 + (bv + 8192);

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
  private lmMat: THREE.MeshStandardMaterial;
  private lmGroup = new THREE.Group();
  private profiles = new Map<number, SkylineProfile>();
  private plans = new Map<number, CityPlan>();
  private capitals: { x: number; y: number; z: number; nation: number; angle: number }[] = [];
  private capTimer = 0;
  private holeR = 0;

  constructor(ctx: WorldContext) {
    this.ctx = ctx;
    this.group.name = 'cities';
    this.group.add(this.farGroup, this.nearGroup, this.lmGroup);
    for (const c of ctx.cities) {
      const iso = ctx.world.nations[c.nation]?.code ?? '';
      this.profiles.set(c.id, skylineFor(iso, c.name));
    }
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
    this.geos = [boxGeo(), towerGeo(), houseGeo(), spireGeo(), churchGeo(), mosqueGeo()];
    this.nearPools = this.geos.map((g) => new InstPool(g, this.nearMat, this.nearGroup, 256, true));

    // Tile → overlapping cities index.
    for (const c of ctx.cities) {
      const ext = c.r * 2.0;
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

    // Signature landmarks (Eiffel, Burj, Kremlin...): share the far exaggeration uniforms.
    this.lmMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.15 });
    patchStandard(this.lmMat, ctx.shared, {
      key: 'city-lm',
      uniforms: { uHeightMul: this.farU.uHeightMul, uFootMul: this.farU.uFootMul },
      vertDecl: 'uniform float uHeightMul;\nuniform float uFootMul;',
      afterBegin: 'transformed.y *= uHeightMul;\ntransformed.xz *= uFootMul;',
      afterLights: 'totalEmissiveRadiance += diffuseColor.rgb * 0.18 * nightFactor(vWPos);',
    });
    this.buildLandmarks();
  }

  attachGame(game: GameAPI): void {
    this.game = game;
    this.capTimer = 1e9;
  }

  /** Number of cities that matched a hand-authored skyline profile (diagnostics). */
  profiledCount(): number {
    let n = 0;
    for (const p of this.profiles.values()) if (p.towers100 > 0 || p.towers150 > 0 || p.tallest > 0) n++;
    return n;
  }

  private popFactor(c: CityInfo): number {
    return clamp((Math.log10(Math.max(1, c.pop)) - 2.3) / 2.2, 0, 1);
  }

  private style(c: CityInfo): StyleDef {
    return STYLES[this.profiles.get(c.id)!.style];
  }

  private dens(c: CityInfo, x: number, z: number): number {
    return cityDensity(x, z, c.x, c.z, c.r * RB, c.seed);
  }

  /** Decides which blocks of a city carry towers, and how tall (cached per city). */
  private planFor(c: CityInfo): CityPlan {
    const cached = this.plans.get(c.id);
    if (cached) return cached;
    const prof = this.profiles.get(c.id)!;
    const st = STYLES[prof.style];
    const plan: CityPlan = { towers: new Map(), list: [], burj: null };
    this.plans.set(c.id, plan);
    const heights = towerHeights(prof);
    if (!heights.length) return plan;
    const hf = this.ctx.hf;
    const B = BLOCK_SIZE, lot = BLOCK_SIZE - STREET_WIDTH;
    const ang = ((c.seed * 37) % 628) / 100;
    const off = prof.cbdOffset ? { u: Math.cos(ang) * c.r * 0.42, v: Math.sin(ang) * c.r * 0.42 } : { u: 0, v: 0 };
    const ext = c.r * RB * 1.05;
    const n = Math.ceil(ext / B);
    const cand: { bu: number; bv: number; score: number }[] = [];
    for (let bv = -n; bv < n; bv++) {
      for (let bu = -n; bu < n; bu++) {
        const cu = (bu + 0.5) * B, cv = (bv + 0.5) * B;
        const [x, z] = fromGrid(cu, cv, c.x, c.z, c.angle);
        const dens = this.dens(c, x, z);
        if (dens < 0.45) continue;
        if (hashI(bu, bv, c.seed + 202) < 0.07 + 0.1 * (1 - dens)) continue;
        if (c.capital && Math.hypot(x - c.x, z - c.z) < B * 1.6) continue;
        if (hf.isWater(x, z)) continue;
        const du = cu - off.u, dv = cv - off.v;
        const rad = Math.min(1, Math.hypot(du, dv) / (c.r * 0.9));
        let score = dens * 0.5 + (1 - rad) * 1.0 + hashI(bu, bv, c.seed + 808) * 0.5;
        if (st.strip) score = dens * 0.5 + (1 - Math.min(1, Math.abs(dv) / (c.r * 0.25))) * 0.9 + (1 - Math.min(1, Math.abs(du) / (c.r * 0.95))) * 0.4 + hashI(bu, bv, c.seed + 808) * 0.35;
        cand.push({ bu, bv, score });
      }
    }
    if (!cand.length) return plan;
    cand.sort((a, b) => b.score - a.score);
    const N = heights.length;
    const nbUse = Math.min(cand.length, Math.max(1, Math.ceil(N / (N > 40 ? 2.4 : 1.25))));
    const perBlock: number[][] = Array.from({ length: nbUse }, () => []);
    for (let i = 0; i < N; i++) perBlock[i % nbUse].push(heights[i]);
    const hasBurj = prof.landmarks.includes('burj');
    for (let bi = 0; bi < nbUse; bi++) {
      const { bu, bv } = cand[bi];
      const hs = perBlock[bi].slice(0, 4);
      const r = mulberry(hashI(bu, bv, c.seed + 909) * 4294967296);
      const k = hs.length;
      const list: Tower[] = [];
      hs.forEach((hm, i) => {
        if (hasBurj && bi === 0 && i === 0) {
          plan.burj = { u: (bu + 0.5) * B, v: (bv + 0.5) * B, h: mToU(hm) };
          return;
        }
        const slim = hm >= 250 ? 0.85 : 1;
        let lu = 0, lv = 0;
        if (k === 2) lu = (i ? 0.24 : -0.24) * lot;
        else if (k === 3) { lu = (i === 0 ? -0.24 : 0.24) * lot; lv = (i === 2 ? 0.26 : -0.16) * lot; if (i === 2) lu = 0; }
        else if (k >= 4) { lu = (i & 1 ? 0.25 : -0.25) * lot; lv = (i & 2 ? 0.25 : -0.25) * lot; }
        const single = k === 1;
        const w = lot * st.tw * (single ? 1 : 0.62) * (0.85 + 0.3 * r()) * slim;
        const d = lot * st.tw * (single ? 1 : 0.62) * (0.85 + 0.3 * r()) * slim;
        const kind = hm >= 150 || r() < st.spire ? K_SPIRE : K_TOWER;
        const pal = st.tower;
        const col = pal[Math.floor(r() * pal.length)];
        list.push({ lu: (bu + 0.5) * B + lu, lv: (bv + 0.5) * B + lv, w, d, h: mToU(hm), kind, col });
      });
      if (list.length) plan.towers.set(blockKey(bu, bv), list);
      plan.list.push(...list);
    }
    return plan;
  }

  /** Coarse skyline blocks for every city. */
  private buildFar(): void {
    const hf = this.ctx.hf;
    const per: number[][] = Array.from({ length: NK }, () => []);
    const B = FAR_BLOCK;
    for (const c of this.ctx.cities) {
      const pf = this.popFactor(c);
      const st = this.style(c);
      const plan = this.planFor(c);
      // Far towers: the two tallest per coarse cell.
      const cells = new Map<number, Tower[]>();
      for (const t of plan.list) {
        const key = blockKey(Math.floor(t.lu / B), Math.floor(t.lv / B));
        let l = cells.get(key);
        if (!l) cells.set(key, (l = []));
        l.push(t);
      }
      for (const l of cells.values()) {
        l.sort((a, b) => b.h - a.h);
        for (const t of l.slice(0, 2)) {
          const [x, z] = fromGrid(t.lu, t.lv, c.x, c.z, c.angle);
          const w = Math.min(B * 0.5, Math.max(B * 0.24, t.w * 1.5));
          colTmp.set(t.col);
          per[t.kind].push(x, hf.heightAt(x, z, 0.02) - 0.002, z, w, t.h, w, c.angle, colTmp.r, colTmp.g, colTmp.b);
        }
      }
      const ext = c.r * RB * 1.35;
      const n = Math.ceil(ext / B);
      for (let bv = -n; bv < n; bv++) {
        for (let bu = -n; bu < n; bu++) {
          if (cells.has(blockKey(bu, bv))) continue;
          const u = (bu + 0.5) * B, v = (bv + 0.5) * B;
          const [x, z] = fromGrid(u, v, c.x, c.z, c.angle);
          const dens = this.dens(c, x, z);
          if (dens < 0.06) continue;
          if (hashI(bu, bv, c.seed + 505) > dens * 2.3 + 0.3) continue;
          if (hf.isWater(x, z)) continue;
          if (c.capital && Math.hypot(x - c.x, z - c.z) < B * 1.2) continue;
          const r = mulberry(hashI(bu, bv, c.seed + 606) * 4294967296);
          const mid = dens > st.midStart;
          const t = smoothstep(st.midStart, 1.0, dens);
          const storeys = mid ? st.lo + (st.hi - st.lo) * t + st.popStoreys * pf * t : 1.5 + 0.6 * dens;
          let h = 0.012 + 0.012 * dens + ST * 0.9 * storeys * (0.75 + 0.5 * r());
          if (!mid && dens < 0.35) h *= 0.75;
          const w = B * (0.5 + 0.32 * r());
          const d = B * (0.5 + 0.32 * r());
          const pal = mid ? st.mid : st.house;
          colTmp.set(pal[Math.floor(r() * pal.length)]);
          const y = hf.heightAt(x, z, 0.02) - 0.002;
          per[K_BOX].push(x, y, z, w, h, d, c.angle, colTmp.r, colTmp.g, colTmp.b);
        }
      }
    }
    for (const k of [K_BOX, K_TOWER, K_SPIRE]) {
      const data = Float32Array.from(per[k]);
      const pool = new InstPool(this.geos[k], this.farMat, this.farGroup, Math.max(16, data.length / STRIDE), false);
      writeInstances(pool, [{ data, count: data.length / STRIDE }]);
    }
  }

  /** Signature landmarks (static, always resident). */
  private buildLandmarks(): void {
    const hf = this.ctx.hf;
    const per = new Map<Landmark, number[]>();
    const add = (k: Landmark, x: number, z: number, w: number, h: number, d: number, angle: number) => {
      let l = per.get(k);
      if (!l) per.set(k, (l = []));
      l.push(x, hf.heightAt(x, z, 0.02) - 0.002, z, w, h, d, angle, 1, 1, 1);
    };
    const B = BLOCK_SIZE;
    for (const c of this.ctx.cities) {
      const prof = this.profiles.get(c.id)!;
      if (!prof.landmarks.length) continue;
      const plan = this.planFor(c);
      const a0 = ((c.seed * 53) % 628) / 100;
      let idx = 0;
      for (const lm of prof.landmarks) {
        if (lm === 'burj') {
          if (plan.burj) {
            const [x, z] = fromGrid(plan.burj.u, plan.burj.v, c.x, c.z, c.angle);
            add('burj', x, z, 0.024, plan.burj.h, 0.024, c.angle);
          }
          continue;
        }
        const a = a0 + idx * 2.1;
        idx++;
        const rad = B * (2.6 + 0.5 * idx) + (c.capital ? B : 0);
        let x = c.x + Math.cos(a) * rad, z = c.z + Math.sin(a) * rad;
        let angle = c.angle;
        const tries = 8;
        for (let t = 0; t < tries && hf.isWater(x, z); t++) {
          const a2 = a + (t + 1) * 0.8;
          x = c.x + Math.cos(a2) * rad; z = c.z + Math.sin(a2) * rad;
        }
        switch (lm) {
          case 'eiffel': add(lm, x, z, 0.05, mToU(330), 0.05, angle); break;
          case 'cn-tower': add(lm, x, z, 0.03, mToU(NEEDLE_M[c.name] ?? 380), 0.03, angle); break;
          case 'kremlin': add(lm, x, z, 0.075, mToU(85), 0.075, angle); break;
          case 'dome': add(lm, x, z, 0.05, mToU(110), 0.05, angle); break;
          case 'cathedral': add(lm, x, z, 0.04, mToU(120), 0.06, angle); break;
          case 'minarets': add(lm, x, z, 0.055, mToU(80), 0.055, angle); break;
          case 'pagoda': add(lm, x, z, 0.04, mToU(70), 0.04, angle); break;
          case 'bridge': {
            // Find the shore and span it.
            let best = -1, bestD = Infinity;
            for (let i = 0; i < 16; i++) {
              const aa = (i / 16) * Math.PI * 2;
              for (let rr = 0.15; rr <= 1.2; rr += 0.1) {
                if (hf.isWater(c.x + Math.cos(aa) * c.r * rr, c.z + Math.sin(aa) * c.r * rr)) { if (rr < bestD) { bestD = rr; best = aa; } break; }
              }
            }
            if (best < 0) break;
            const rr = bestD * c.r + 0.05;
            add(lm, c.x + Math.cos(best) * rr, c.z + Math.sin(best) * rr, 0.17, mToU(110), 0.03, best);
            break;
          }
          default: break;
        }
        angle = 0;
      }
    }
    for (const k of LM_KINDS) {
      const l = per.get(k);
      if (!l) continue;
      const pool = new InstPool(LM_GEO[k](), this.lmMat, this.lmGroup, Math.max(4, l.length / STRIDE), false);
      writeInstances(pool, [{ data: Float32Array.from(l), count: l.length / STRIDE }]);
    }
  }

  /** Street-grid buildings for one tile. */
  private genTile(tx: number, tz: number): CityTile {
    const key = tx * 100000 + tz;
    const hf = this.ctx.hf;
    const x0 = tx * TILE_SIZE, z0 = tz * TILE_SIZE, x1 = x0 + TILE_SIZE, z1 = z0 + TILE_SIZE;
    const per: number[][] = Array.from({ length: NK }, () => []);
    const cities = this.tileCities.get(key) ?? [];
    const B = BLOCK_SIZE, lot = BLOCK_SIZE - STREET_WIDTH;
    for (const c of cities) {
      const pf = this.popFactor(c);
      const st = this.style(c);
      const plan = this.planFor(c);
      const corners = [toGrid(x0, z0, c.x, c.z, c.angle), toGrid(x1, z0, c.x, c.z, c.angle), toGrid(x0, z1, c.x, c.z, c.angle), toGrid(x1, z1, c.x, c.z, c.angle)];
      const u0 = Math.floor(Math.min(...corners.map((p) => p[0])) / B), u1 = Math.ceil(Math.max(...corners.map((p) => p[0])) / B);
      const v0 = Math.floor(Math.min(...corners.map((p) => p[1])) / B), v1 = Math.ceil(Math.max(...corners.map((p) => p[1])) / B);
      for (let bv = v0; bv < v1; bv++) {
        for (let bu = u0; bu < u1; bu++) {
          const cu = (bu + 0.5) * B, cv = (bv + 0.5) * B;
          const [x, z] = fromGrid(cu, cv, c.x, c.z, c.angle);
          if (x < x0 || x >= x1 || z < z0 || z >= z1) continue;
          const dens = this.dens(c, x, z);
          if (dens < 0.02) continue;
          let dominated = false;
          for (const o of cities) {
            if (o !== c && this.dens(o, x, z) > dens) { dominated = true; break; }
          }
          if (dominated) continue;
          // Parks and empty lots (must match the ground shader).
          const bh2 = hashI(bu, bv, c.seed + 202);
          if (bh2 < 0.07 + 0.1 * (1 - dens)) continue;
          if (hashI(bu, bv, c.seed + 303) > dens * 2.4 + 0.35) continue;
          if (c.capital && Math.hypot(x - c.x, z - c.z) < B * 1.6) continue;
          if (hf.isWater(x, z)) continue;
          const y = hf.heightAt(x, z, LEAF_SPACING) - 0.0012;
          const r = mulberry(hashI(bu, bv, c.seed + 707) * 4294967296);
          const push = (kind: number, lu: number, lv: number, w: number, h: number, d: number, pal: number[], rot = 0) => {
            const [px, pz] = fromGrid(cu + lu, cv + lv, c.x, c.z, c.angle);
            colTmp.set(pal[Math.floor(r() * pal.length)]);
            const k = 0.9 + 0.2 * r();
            per[kind].push(px, y, pz, w, h, d, c.angle + rot, colTmp.r * k, colTmp.g * k, colTmp.b * k);
          };
          // Skyscrapers exist only where the city's real skyline puts them.
          const tw = plan.towers.get(blockKey(bu, bv));
          if (tw) {
            for (const t of tw) {
              const [px, pz] = fromGrid(t.lu, t.lv, c.x, c.z, c.angle);
              colTmp.set(t.col);
              const k = 0.94 + 0.12 * r();
              per[t.kind].push(px, y, pz, t.w, t.h, t.d, c.angle, colTmp.r * k, colTmp.g * k, colTmp.b * k);
            }
            // Low podium beside the towers.
            if (tw.length < 3) push(K_BOX, -0.3 * lot, 0.3 * lot, lot * 0.3, ST * (3 + 3 * r()), lot * 0.3, st.mid);
            continue;
          }
          const industrial = hashI(bu, bv, c.seed + 404) < st.ind && dens > 0.2 && dens < 0.7;
          const mid = dens > st.midStart;
          if (industrial) {
            push(K_BOX, 0, 0, lot * (0.7 + 0.2 * r()), 0.008 + 0.006 * r(), lot * (0.55 + 0.3 * r()), WALL_IND);
            if (r() < 0.5) push(K_BOX, lot * 0.3, lot * 0.3, lot * 0.2, 0.014, lot * 0.2, WALL_IND);
            continue;
          }
          // Local landmarks: church spires in the west, minarets and domes in the Muslim world.
          let hole = -1;
          if (st.small && r() < st.smallProb * (mid ? 1.6 : 1) && dens > 0.12) {
            if (st.small === 'church') push(K_CHURCH, 0, 0, lot * 0.2, ST * (7 + 4 * r()), lot * 0.34, HOUSE_EU, r() < 0.5 ? 0 : Math.PI / 2);
            else push(K_MOSQUE, 0, 0, lot * 0.24, ST * (5 + 2 * r()), lot * 0.24, [0xe9e4d6, 0xdcd3bc]);
            hole = Math.floor(r() * 4);
            if (st.mode !== 0 || !mid) continue;
          }
          if (mid) {
            const t = smoothstep(st.midStart, 1.0, dens);
            const stor = (bias: number) => Math.max(2, (st.lo + (st.hi - st.lo) * t + st.popStoreys * pf * t) * bias);
            if (st.mode === 0) {
              // Perimeter blocks (taller toward the centre).
              for (let i = 0; i < 4; i++) {
                if (i === hole || r() < st.cov) continue;
                const lu = (i & 1 ? 0.25 : -0.25) * lot, lv = (i & 2 ? 0.25 : -0.25) * lot;
                const sz = lot * (st.foot * 0.9 + 0.1 * r());
                push(K_BOX, lu, lv, sz, ST * stor(0.75 + 0.5 * r()), sz * (0.9 + 0.1 * r()), st.mid);
              }
            } else if (st.mode === 1) {
              // Parallel slabs (prefab estates, apartment complexes).
              const alongV = hashI(bu, bv, c.seed + 111) < 0.5;
              const ns = r() < 0.5 ? 2 : 3;
              const bias = 0.8 + 0.4 * r();
              for (let i = 0; i < ns; i++) {
                if (r() < st.cov) continue;
                const off = ((i + 0.5) / ns - 0.5) * lot * 0.86;
                const len = lot * (0.5 + 0.25 * r());
                const wd = lot * (0.21 + 0.07 * r());
                const hh = ST * stor(bias * (0.85 + 0.3 * r()));
                if (alongV) push(K_BOX, off, 0, wd, hh, len, st.mid);
                else push(K_BOX, 0, off, len, hh, wd, st.mid);
              }
            } else {
              const n = r() < 0.4 ? 2 : 1;
              for (let i = 0; i < n; i++) {
                if (r() < st.cov * 0.6) continue;
                const sz = lot * (st.foot * (n === 2 ? 0.7 : 1) + 0.1 * r());
                const off = n === 2 ? (i ? 0.25 : -0.25) * lot : 0;
                push(K_BOX, off, 0, sz, ST * stor(0.7 + 0.6 * r()), sz * (0.8 + 0.2 * r()), st.mid);
              }
            }
          } else {
            // Houses (and low blocks): gabled or flat depending on region.
            const nu = 3, nv = 2;
            for (let i = 0; i < nu * nv; i++) {
              if (r() < st.houseSkip) continue;
              const lu = ((i % nu) + 0.5) / nu - 0.5, lv = (Math.floor(i / nu) + 0.5) / nv - 0.5;
              const s = 0.0075 + 0.0025 * r();
              const hh = 0.0065 * (st.houseStoreys / 2) + 0.002 * r();
              if (st.gable) push(K_HOUSE, lu * lot * 0.9, lv * lot * 0.85, s * 1.2, hh, s, st.house);
              else push(K_BOX, lu * lot * 0.9, lv * lot * 0.85, s * 1.3, Math.max(0.0055, ST * st.houseStoreys * (0.9 + 0.4 * r())), s * 1.1, st.house);
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
    // Zoom-dependent exaggeration of the far skyline (cities must read at the default zoom).
    const zf = smoothstep(3, 40, d);
    this.farU.uHeightMul.value = 1 + 3.0 * zf;
    this.farU.uFootMul.value = 1 + 1.4 * zf;
    this.farU.uFloorH.value = 0.012 * (1 + zf);
    this.updateLandmarks(d);
    this.farGroup.visible = d < 170;
    this.lmGroup.visible = d < 170;
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
      for (let k = 0; k < NK; k++) {
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
