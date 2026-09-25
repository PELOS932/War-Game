import { Noise2D } from '../core/noise';
import { RNG } from '../core/rng';
import { Biome, HEIGHT_SPACING, WorldData, worldHeight, worldWidth } from '../worldgen/types';
import { LEAF_SPACING, Y_SCALE, clamp, smoothstep } from './constants';

export { Y_SCALE };
/** @deprecated kept for older imports; use Y_SCALE. */
export const RENDER_EXAGGERATION = Y_SCALE;

const DETAIL_BASE_WAVELENGTH = 0.8;
const DETAIL_OCTAVES = 6;

/**
 * CPU-side terrain height function shared by the terrain mesh builder and
 * every object that must sit on the ground (trees, buildings, units, roads),
 * plus picking (ray marching).
 *
 * Height = bicubic heightmap + band-limited "detail" relief noise whose
 * amplitude follows local ruggedness (ridged in mountains, gentle on plains),
 * damped near coasts, rivers, lakes, ice sheets and cities.
 */
export class HeightField {
  readonly w: number;
  readonly h: number;
  readonly worldW: number;
  readonly worldH: number;
  readonly elev: Float32Array;
  readonly water: Float32Array;
  /** 1 where the cell is open ocean (biome Ocean). */
  readonly ocean: Uint8Array;
  /** 0..1 detail damping (1 = full detail). */
  readonly damp: Float32Array;
  /** 0..1 local ruggedness. */
  readonly rough: Float32Array;
  readonly river: Float32Array;
  readonly maxY: number;
  readonly minY: number;
  private noise: Noise2D;

  constructor(world: WorldData, urban?: Float32Array) {
    this.w = world.hw;
    this.h = world.hh;
    this.worldW = worldWidth(world.settings);
    this.worldH = worldHeight(world.settings);
    this.elev = world.elevation;
    this.water = world.waterLevel;
    const n = this.w * this.h;
    this.ocean = new Uint8Array(n);
    this.river = new Float32Array(n);
    let maxE = 0, minLand = 0;
    for (let i = 0; i < n; i++) {
      this.ocean[i] = world.biome[i] === Biome.Ocean ? 1 : 0;
      const a = world.climateTex[i * 4 + 3];
      this.river[i] = a >= 255 ? 1 : a / 255;
      const e = this.elev[i];
      if (e > maxE) maxE = e;
      if (!this.ocean[i] && e < minLand) minLand = e;
    }
    this.maxY = (maxE + 600) * Y_SCALE;
    this.minY = Math.min(0, minLand) * Y_SCALE - 0.01;

    // Damping grid: rivers, lakes, ice sheets, cities → less relief noise.
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let d = 1 - Math.min(1, this.river[i] * 1.6);
      if (this.water[i] > -1e8) d = 0;
      const b = world.biome[i];
      if (b === Biome.Ice) d *= 0.2;
      else if (b === Biome.Wetland) d *= 0.35;
      if (urban) d *= 1 - 0.9 * Math.min(1, urban[i] * 1.5);
      raw[i] = d;
    }
    this.damp = boxBlur(raw, this.w, this.h, 1);

    // Ruggedness: local standard deviation of elevation over a 5×5 window.
    const e2 = new Float32Array(n);
    const ec = new Float32Array(n);
    for (let i = 0; i < n; i++) { const e = Math.max(0, this.elev[i]); ec[i] = e; e2[i] = e * e; }
    const m1 = boxBlur(ec, this.w, this.h, 2);
    const m2 = boxBlur(e2, this.w, this.h, 2);
    const rough = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const sd = Math.sqrt(Math.max(0, m2[i] - m1[i] * m1[i]));
      rough[i] = smoothstep(30, 650, sd);
    }
    this.rough = boxBlur(rough, this.w, this.h, 1);

    const rng = new RNG(world.settings.seed ^ 0x5eed);
    this.noise = new Noise2D(rng.fork(1));
  }

  private cell(x: number, y: number): number {
    const cx = x < 0 ? 0 : x >= this.w ? this.w - 1 : x;
    const cy = y < 0 ? 0 : y >= this.h ? this.h - 1 : y;
    return this.elev[cy * this.w + cx];
  }

  /** Smooth (Catmull-Rom bicubic) elevation in metres. */
  elevationAt(x: number, z: number): number {
    const gx = x / HEIGHT_SPACING, gz = z / HEIGHT_SPACING;
    const ix = Math.floor(gx), iz = Math.floor(gz);
    const fx = gx - ix, fz = gz - iz;
    const wx0 = cubicWeight(-1 - fx), wx1 = cubicWeight(-fx), wx2 = cubicWeight(1 - fx), wx3 = cubicWeight(2 - fx);
    let result = 0;
    if (ix >= 1 && iz >= 1 && ix < this.w - 2 && iz < this.h - 2) {
      const el = this.elev, w = this.w;
      let o = (iz - 1) * w + ix - 1;
      for (let j = -1; j <= 2; j++, o += w) {
        const row = el[o] * wx0 + el[o + 1] * wx1 + el[o + 2] * wx2 + el[o + 3] * wx3;
        result += row * cubicWeight(j - fz);
      }
      return result;
    }
    for (let j = -1; j <= 2; j++) {
      const row = this.cell(ix - 1, iz + j) * wx0 + this.cell(ix, iz + j) * wx1 + this.cell(ix + 1, iz + j) * wx2 + this.cell(ix + 2, iz + j) * wx3;
      result += row * cubicWeight(j - fz);
    }
    return result;
  }

  /** Bilinear elevation in metres (cheap). */
  elevationLinear(x: number, z: number): number {
    return this.bilinear(this.elev, x, z);
  }

  /** Bilinear sample of any per-cell float grid. */
  bilinear(arr: Float32Array, x: number, z: number): number {
    let gx = x / HEIGHT_SPACING, gz = z / HEIGHT_SPACING;
    gx = gx < 0 ? 0 : gx > this.w - 1.001 ? this.w - 1.001 : gx;
    gz = gz < 0 ? 0 : gz > this.h - 1.001 ? this.h - 1.001 : gz;
    const ix = gx | 0, iz = gz | 0;
    const fx = gx - ix, fz = gz - iz;
    const o = iz * this.w + ix;
    const a = arr[o], b = arr[o + 1], c = arr[o + this.w], d = arr[o + this.w + 1];
    return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
  }

  /** Bilinear sample of one channel of a per-cell byte grid with `stride` channels. Returns 0..255. */
  bilinearU8(arr: Uint8Array, stride: number, ch: number, x: number, z: number): number {
    let gx = x / HEIGHT_SPACING, gz = z / HEIGHT_SPACING;
    gx = gx < 0 ? 0 : gx > this.w - 1.001 ? this.w - 1.001 : gx;
    gz = gz < 0 ? 0 : gz > this.h - 1.001 ? this.h - 1.001 : gz;
    const ix = gx | 0, iz = gz | 0;
    const fx = gx - ix, fz = gz - iz;
    const o = iz * this.w + ix;
    const a = arr[o * stride + ch], b = arr[(o + 1) * stride + ch];
    const c = arr[(o + this.w) * stride + ch], d = arr[(o + this.w + 1) * stride + ch];
    return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
  }

  cellIndex(x: number, z: number): number {
    const cx = Math.round(x / HEIGHT_SPACING), cz = Math.round(z / HEIGHT_SPACING);
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return -1;
    return cz * this.w + cx;
  }

  riverAt(x: number, z: number): number {
    return this.bilinear(this.river, x, z);
  }

  lakeLevelAt(x: number, z: number): number {
    const i = this.cellIndex(x, z);
    return i < 0 ? -1e9 : this.water[i];
  }

  isOceanCell(x: number, z: number): boolean {
    const i = this.cellIndex(x, z);
    return i >= 0 && this.ocean[i] === 1;
  }

  /**
   * High-frequency relief (metres) layered on the heightmap. `spacing` is the
   * vertex spacing of the mesh sampling it: octaves shorter than ~3 samples
   * are faded out so coarse LODs are not aliased.
   */
  detailAt(x: number, z: number, e: number, spacing = LEAF_SPACING): number {
    if (e <= 1) return 0;
    const coast = smoothstep(1, 45, e);
    const damp = this.bilinear(this.damp, x, z) * coast;
    if (damp <= 0.001) return 0;
    const m = this.bilinear(this.rough, x, z);
    const amp = (16 + 520 * m * m + 120 * m) * damp;
    let sum = 0;
    let a = 1;
    let lambda = DETAIL_BASE_WAVELENGTH;
    const persistence = 0.5 + 0.06 * m;
    for (let k = 0; k < DETAIL_OCTAVES; k++) {
      const wgt = spacing > 0 ? smoothstep(2 * spacing, 4 * spacing, lambda) : 1;
      if (wgt <= 0) break;
      const f = 1 / lambda;
      const nv = this.noise.noise(x * f + k * 17.31, z * f - k * 9.17);
      let r = 1 - Math.abs(nv);
      r = r * r * 2 - 0.72;
      sum += (nv + (r - nv) * m) * a * wgt;
      a *= persistence;
      lambda *= 0.5;
    }
    return sum * amp;
  }

  /** Terrain surface height in world Y units (including sea floor). */
  heightAt(x: number, z: number, spacing = LEAF_SPACING): number {
    const e = this.elevationAt(x, z);
    return (e + this.detailAt(x, z, e, spacing)) * Y_SCALE;
  }

  /** Water surface Y at (x, z), or -Infinity where there is no water body. */
  waterAt(x: number, z: number): number {
    const i = this.cellIndex(x, z);
    if (i < 0) return 0;
    if (this.water[i] > -1e8) return this.water[i] * Y_SCALE;
    if (this.ocean[i]) return 0;
    return -Infinity;
  }

  /** Height of whatever surface is visible: terrain or water. */
  surfaceAt(x: number, z: number, spacing = LEAF_SPACING): number {
    const t = this.heightAt(x, z, spacing);
    const w = this.waterAt(x, z);
    return w > t ? w : t;
  }

  isWater(x: number, z: number): boolean {
    const t = this.heightAt(x, z);
    return this.waterAt(x, z) > t;
  }

  /** World-space normal of the terrain (with detail), written into out[0..2]. */
  normalAt(x: number, z: number, out: number[] | Float32Array, eps = 0.01): void {
    const hl = this.heightAt(x - eps, z), hr = this.heightAt(x + eps, z);
    const hd = this.heightAt(x, z - eps), hu = this.heightAt(x, z + eps);
    const nx = hl - hr, ny = 2 * eps, nz = hd - hu;
    const l = Math.hypot(nx, ny, nz) || 1;
    out[0] = nx / l; out[1] = ny / l; out[2] = nz / l;
  }

  /**
   * Ray / surface intersection by marching then bisecting. Returns the ray
   * parameter t of the first hit, or -1.
   */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): number {
    // Clip to the vertical slab containing the surface.
    const top = this.maxY + 0.05, bottom = this.minY - 0.05;
    let t0 = 0, t1 = maxT;
    if (Math.abs(dy) < 1e-9) {
      if (oy > top || oy < bottom) return -1;
    } else {
      const ta = (top - oy) / dy, tb = (bottom - oy) / dy;
      t0 = Math.max(0, Math.min(ta, tb));
      t1 = Math.min(maxT, Math.max(ta, tb));
    }
    if (t0 >= t1) return -1;
    const f = (t: number) => {
      const x = ox + dx * t, z = oz + dz * t;
      return oy + dy * t - this.surfaceAt(x, z);
    };
    let prevT = t0;
    let prevF = f(t0);
    if (prevF <= 0) return t0;
    let t = t0;
    let guard = 0;
    while (t < t1 && guard++ < 4000) {
      // Step size: proportional to the height above the surface, bounded.
      const horiz = Math.hypot(dx, dz) || 1e-6;
      const step = Math.max(LEAF_SPACING * 0.5, Math.min(prevF / Math.max(0.05, Math.abs(dy)) * 0.6, (t1 - t0) / 60 + 0.001, 4 / horiz));
      t = Math.min(t1, t + step);
      const fv = f(t);
      if (fv <= 0) {
        let a = prevT, b = t;
        for (let k = 0; k < 24; k++) {
          const m = (a + b) * 0.5;
          if (f(m) > 0) a = m; else b = m;
        }
        return (a + b) * 0.5;
      }
      prevT = t;
      prevF = fv;
    }
    return -1;
  }
}

function cubicWeight(t: number): number {
  const a = Math.abs(t);
  if (a < 1) return 1.5 * a * a * a - 2.5 * a * a + 1;
  if (a < 2) return -0.5 * a * a * a + 2.5 * a * a - 4 * a + 2;
  return 0;
}

/** Separable box blur with radius r (clamped edges). */
export function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += src[o + clamp(x + k, 0, w - 1)];
      tmp[o + x] = s * inv;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[clamp(y + k, 0, h - 1) * w + x];
      out[y * w + x] = s * inv;
    }
  }
  return out;
}
