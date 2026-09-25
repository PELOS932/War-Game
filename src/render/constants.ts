/**
 * Renderer-wide scale constants. World units: 1 unit ≈ 0.2885° ≈ 32 km on the
 * Earth map (hex circumradius = 1). Everything vertical goes through Y_SCALE.
 */

/** World Y units per metre of elevation. Everest (8850 m) ≈ 2.3 units. */
export const Y_SCALE = 2.3 / 8850;

/** Terrain quadtree root chunk size (world units) and deepest level. */
export const ROOT_CHUNK = 64;
export const MAX_LOD = 9; // 64 / 2^9 = 0.125 units
/** Quads per chunk side. */
export const CHUNK_RES = 32;
/** Vertex spacing of the finest terrain LOD (world units). */
export const LEAF_SPACING = ROOT_CHUNK / (1 << MAX_LOD) / CHUNK_RES;

/** Camera distance limits (world units along the view ray). */
export const MIN_DIST = 0.14;

/** Street-grid block size in world units (cities & ground shader must agree). */
export const BLOCK_SIZE = 0.016;
export const STREET_WIDTH = 0.0026;

/** Size of vegetation / city tiles (world units). */
export const TILE_SIZE = 0.5;

/** Max number of nearby cities passed to the ground shader for street grids. */
export const MAX_SHADER_CITIES = 16;

export function clamp(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
