import { HexGrid } from '../core/hex';
import { Noise2D } from '../core/noise';
import { RNG } from '../core/rng';
import { Biome, CitySeed, HEIGHT_SPACING, Terrain, WorldData } from '../worldgen/types';
import { boxBlur } from './heightfield';
import { cityDensity, cityRadius } from './procedural';
import { clamp, smoothstep } from './constants';

/** Per-heightmap-cell land-use grids derived from world data (CPU side). */
export interface LandUse {
  /** Hex index of each heightmap cell (-1 outside). */
  cellHex: Int32Array;
  /** 0..1 built-up density (from cities). */
  urban: Float32Array;
  /** 0..1 cultivated land. */
  farm: Float32Array;
  /** 0..1 night-light brightness. */
  lights: Float32Array;
}

export interface CityInfo {
  id: number;
  x: number;
  z: number;
  r: number;
  angle: number;
  pop: number; // thousands
  capital: boolean;
  port: boolean;
  nation: number;
  name: string;
  seed: number;
}

export function cityInfos(world: WorldData): CityInfo[] {
  return world.cities.map((c: CitySeed) => ({
    id: c.id,
    x: c.x,
    z: c.z,
    r: cityRadius(c.population),
    angle: c.gridAngle,
    pop: c.population,
    capital: c.capital,
    port: c.port,
    nation: c.nation,
    name: c.name,
    seed: (c.id * 7919) % 1000,
  }));
}

export function computeLandUse(world: WorldData, grid: HexGrid, cities: CityInfo[]): LandUse {
  const w = world.hw, h = world.hh, n = w * h;
  const cellHex = new Int32Array(n);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) cellHex[j * w + i] = grid.fromWorld(i * HEIGHT_SPACING, j * HEIGHT_SPACING);
  }

  // --- Urban density from city footprints --------------------------------------
  const urban = new Float32Array(n);
  for (const c of cities) {
    const ext = c.r * 1.6;
    const i0 = Math.max(0, Math.floor((c.x - ext) / HEIGHT_SPACING)), i1 = Math.min(w - 1, Math.ceil((c.x + ext) / HEIGHT_SPACING));
    const j0 = Math.max(0, Math.floor((c.z - ext) / HEIGHT_SPACING)), j1 = Math.min(h - 1, Math.ceil((c.z + ext) / HEIGHT_SPACING));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * w + i;
        if (world.biome[k] === Biome.Ocean || world.biome[k] === Biome.Lake) continue;
        // Average a few sub-samples so small towns still register.
        let s = 0;
        for (let sj = -1; sj <= 1; sj += 2) for (let si = -1; si <= 1; si += 2) {
          s += cityDensity(i * HEIGHT_SPACING + si * 0.14, j * HEIGHT_SPACING + sj * 0.14, c.x, c.z, c.r, c.seed);
        }
        const d = s / 4;
        if (d > urban[k]) urban[k] = d;
      }
    }
  }

  // --- Farmland ---------------------------------------------------------------------
  const noise = new Noise2D(new RNG(world.settings.seed ^ 0xfa11).fork(3));
  const farmRaw = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const hx = cellHex[k];
    if (hx < 0) continue;
    const b = world.biome[k];
    if (b === Biome.Ocean || b === Biome.Lake || b === Biome.Ice) continue;
    const ter = world.hexTerrain[hx];
    let base = 0;
    if (ter === Terrain.Farmland) base = 0.95;
    else if (ter === Terrain.Plains) base = 0.35;
    else if (ter === Terrain.Hills) base = 0.22;
    else if (ter === Terrain.Urban) base = 0.5;
    else if (ter === Terrain.Forest) base = 0.08;
    else if (ter === Terrain.Jungle) base = 0.05;
    const pop = world.hexPopulation[hx];
    const popF = smoothstep(15, 600, pop);
    let f = Math.max(base, popF * 0.75);
    const t = world.temperature[k], p = world.precipitation[k];
    const river = world.climateTex[k * 4 + 3] / 255;
    const wet = Math.max(smoothstep(180, 480, p), river * 0.9 * smoothstep(0, 8, t));
    const suit = smoothstep(-2, 5, t) * (1 - 0.4 * smoothstep(25, 29, t)) * wet;
    f *= suit;
    f *= 1 - 0.55 * smoothstep(0.55, 0.9, world.albedo[k * 4 + 3] / 255);
    f *= 1 - smoothstep(1800, 3200, world.elevation[k]);
    farmRaw[k] = f;
  }
  const farm = boxBlur(farmRaw, w, h, 2);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (farm[k] <= 0) continue;
      const nz = noise.fbm(i * 0.11, j * 0.11, 3) * 0.5 + 0.5;
      farm[k] = clamp(farm[k] * (0.55 + 0.9 * nz) * (1 - urban[k] * 0.9), 0, 1);
      if (world.biome[k] === Biome.Ocean || world.biome[k] === Biome.Lake) farm[k] = 0;
    }
  }

  // --- Night lights -------------------------------------------------------------------
  const lightsRaw = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const hx = cellHex[k];
    if (hx < 0) continue;
    const own = world.hexOwner[hx];
    const dev = own ? world.nations[own - 1]?.development ?? 0.4 : 0.3;
    const bright = 0.3 + 0.7 * dev;
    const pop = world.hexPopulation[hx];
    const rural = smoothstep(10, 900, pop) * 0.45;
    lightsRaw[k] = Math.min(1, (Math.pow(urban[k], 0.7) * 1.1 + rural) * bright);
    if (world.biome[k] === Biome.Ocean || world.biome[k] === Biome.Lake) lightsRaw[k] = 0;
  }
  const lights = boxBlur(lightsRaw, w, h, 1);
  return { cellHex, urban, farm, lights };
}
