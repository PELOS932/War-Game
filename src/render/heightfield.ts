import { Noise2D, smoothstep } from '../core/noise';
import { RNG } from '../core/rng';
import { HEIGHT_SPACING, KM_PER_UNIT, WorldData } from '../worldgen/types';

/** Vertical exaggeration used for rendering (world Y units per metre). */
export const RENDER_EXAGGERATION = 5.5;
export const Y_SCALE = RENDER_EXAGGERATION / (KM_PER_UNIT * 1000);

/**
 * CPU-side terrain height function shared by the terrain mesh builder and
 * every object that must sit on the ground (trees, buildings, units, roads).
 */
export class HeightField {
  readonly w: number;
  readonly h: number;
  readonly elev: Float32Array;
  readonly water: Float32Array;
  readonly river: Uint8Array;
  private noise: Noise2D;
  private noise2: Noise2D;

  constructor(world: WorldData) {
    this.w = world.hw;
    this.h = world.hh;
    this.elev = world.elevation;
    this.water = world.waterLevel;
    this.river = new Uint8Array(this.w * this.h);
    for (let i = 0; i < this.river.length; i++) this.river[i] = world.climateTex[i * 4 + 3];
    const rng = new RNG(world.settings.seed ^ 0x5eed);
    this.noise = new Noise2D(rng.fork(1));
    this.noise2 = new Noise2D(rng.fork(2));
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
    let result = 0;
    for (let j = -1; j <= 2; j++) {
      const wz = cubicWeight(j - fz);
      let row = 0;
      for (let i = -1; i <= 2; i++) row += this.cell(ix + i, iz + j) * cubicWeight(i - fx);
      result += row * wz;
    }
    return result;
  }

  /** Bilinear elevation in metres (cheap). */
  elevationLinear(x: number, z: number): number {
    const gx = x / HEIGHT_SPACING, gz = z / HEIGHT_SPACING;
    const ix = Math.floor(gx), iz = Math.floor(gz);
    const fx = gx - ix, fz = gz - iz;
    const a = this.cell(ix, iz), b = this.cell(ix + 1, iz), c = this.cell(ix, iz + 1), d = this.cell(ix + 1, iz + 1);
    return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  }

  riverAt(x: number, z: number): number {
    const cx = Math.round(x / HEIGHT_SPACING), cz = Math.round(z / HEIGHT_SPACING);
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return 0;
    return this.river[cz * this.w + cx] / 255;
  }

  lakeLevelAt(x: number, z: number): number {
    const cx = Math.round(x / HEIGHT_SPACING), cz = Math.round(z / HEIGHT_SPACING);
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.h) return -1e9;
    return this.water[cz * this.w + cx];
  }

  /** High-frequency relief (metres) layered on the heightmap for close-up views. */
  detailAt(x: number, z: number, e: number): number {
    if (e <= -30) return 0;
    const mountain = smoothstep(150, 2600, e);
    const coast = smoothstep(0, 40, e);
    const riverDamp = 1 - Math.min(1, this.riverAt(x, z) * 1.6);
    const r = this.noise.ridged(x * 1.35, z * 1.35, 4) - 0.45;
    const f = this.noise2.fbm(x * 3.1, z * 3.1, 3);
    const amp = (18 + 260 * mountain) * coast * riverDamp;
    return r * amp + f * amp * 0.35;
  }

  /** Terrain surface height in world Y units (including sea floor). */
  heightAt(x: number, z: number, detail = true): number {
    const e = this.elevationAt(x, z);
    const d = detail ? this.detailAt(x, z, e) : 0;
    return (e + d) * Y_SCALE;
  }

  /** Height of whatever surface is visible: terrain or water. */
  surfaceAt(x: number, z: number): number {
    const t = this.heightAt(x, z);
    const lake = this.lakeLevelAt(x, z);
    if (lake > -1e8) return Math.max(t, lake * Y_SCALE);
    return Math.max(t, 0);
  }

  isWater(x: number, z: number): boolean {
    const e = this.elevationLinear(x, z);
    return e <= 0 || this.lakeLevelAt(x, z) > -1e8;
  }
}

function cubicWeight(t: number): number {
  const a = Math.abs(t);
  if (a < 1) return 1.5 * a * a * a - 2.5 * a * a + 1;
  if (a < 2) return -0.5 * a * a * a + 2.5 * a * a - 4 * a + 2;
  return 0;
}
