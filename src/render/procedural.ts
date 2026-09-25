/**
 * Deterministic hash / value-noise helpers that have exact GLSL twins in
 * shaders/common.ts (PROC_GLSL). Used where CPU-placed objects (buildings,
 * trees) must line up with patterns drawn by the ground shader (street grids,
 * urban density).
 */
import { clamp, smoothstep } from './constants';

/** PCG integer hash (matches GLSL `pcgh`). */
export function pcg(v: number): number {
  const s = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
  const w = Math.imul(((s >>> (((s >>> 28) + 4) & 31)) ^ s) >>> 0, 277803737) >>> 0;
  return ((w >>> 22) ^ w) >>> 0;
}

/** Hash of an integer lattice point → [0,1). Matches GLSL `hashI`. */
export function hashI(ix: number, iy: number, seed: number): number {
  return pcg(((ix >>> 0) ^ pcg((iy + seed) >>> 0)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0,1]. Matches GLSL `vnoise`. */
export function vnoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hashI(ix, iy, seed), b = hashI(ix + 1, iy, seed);
  const c = hashI(ix, iy + 1, seed), d = hashI(ix + 1, iy + 1, seed);
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
}

/** Radius (world units) of the built-up area of a city of `popK` thousand people. */
export function cityRadius(popK: number): number {
  return clamp(0.065 + 0.21 * Math.sqrt(Math.max(0, popK) / 1000), 0.065, 1.6);
}

/**
 * Urban density 0..1 of a city at world point (x, z). Matches GLSL
 * `cityDensity`. The boundary is distorted by value noise so cities are not
 * perfect discs.
 */
export function cityDensity(x: number, z: number, cx: number, cz: number, r: number, seed: number): number {
  const dx = x - cx, dz = z - cz;
  let d = Math.sqrt(dx * dx + dz * dz) / r;
  if (d > 1.6) return 0;
  const n = vnoise(x * 4.0 + seed * 0.37, z * 4.0 - seed * 0.21, 7) * 2 - 1;
  const n2 = vnoise(x * 13.0, z * 13.0, 9) * 2 - 1;
  d *= 1 + 0.32 * n + 0.12 * n2;
  return 1 - smoothstep(0.25, 1.0, d);
}

/** Rotate (x, z) by -angle (world → city grid space). */
export function toGrid(x: number, z: number, cx: number, cz: number, angle: number): [number, number] {
  const c = Math.cos(angle), s = Math.sin(angle);
  const dx = x - cx, dz = z - cz;
  return [dx * c + dz * s, -dx * s + dz * c];
}

/** City grid space → world. */
export function fromGrid(u: number, v: number, cx: number, cz: number, angle: number): [number, number] {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [cx + u * c - v * s, cz + u * s + v * c];
}

/** Small seeded PRNG (mulberry32) for per-tile generation. */
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
