import { RNG } from '../core/rng';
import { Noise2D, clamp, smoothstep } from '../core/noise';
import { HexGrid } from '../core/hex';
import { generateBaseHeight, hydraulicErosion, thermalErosion, distanceField, blur, Progress } from './terrain';
import { simulateClimate, classifyBiome, surfaceColour, SurfaceParams, latRange } from './climate';
import { computeHydrology } from './hydrology';
import { deriveHexes } from './hexes';
import { generatePolitics } from './politics';
import { generateSettlements } from './settlements';
import { NameGenerator } from './names';
import { Biome, ELEV_EXAGGERATION, HEIGHT_SPACING, KM_PER_UNIT, WorldData, WorldSettings } from './types';

export const DEFAULT_SETTINGS: Omit<WorldSettings, 'seed'> = {
  kind: 'procedural',
  cols: 320,
  rows: 192,
  latNorth: 72,
  latSouth: -50,
  lonWest: -180,
  lonEast: 180,
  landFraction: 0.36,
  nationCount: 36,
};

export function heightmapSize(cols: number, rows: number): { hw: number; hh: number } {
  const W = Math.sqrt(3) * (cols + 0.5);
  const H = 1.5 * rows + 0.5;
  return { hw: Math.ceil(W / HEIGHT_SPACING) + 1, hh: Math.ceil(H / HEIGHT_SPACING) + 1 };
}

export function generateWorld(settings: WorldSettings, progress: Progress = () => {}): WorldData {
  const rng = new RNG(settings.seed);
  const grid = new HexGrid(settings.cols, settings.rows);
  const { hw: w, hh: h } = heightmapSize(settings.cols, settings.rows);
  const n = w * h;

  // 1. Tectonics & base relief.
  const norm = generateBaseHeight(rng.fork(10), w, h, HEIGHT_SPACING, settings.landFraction, progress);
  // 2. Erosion.
  hydraulicErosion(norm, w, h, rng.fork(11), Math.floor(n * 1.1), progress);
  progress('Weathering mountains', 0);
  thermalErosion(norm, w, h, 5, 0.012);

  // 3. Metres + ocean bathymetry.
  progress('Shaping ocean floor', 0);
  const landMask = new Uint8Array(n);
  for (let i = 0; i < n; i++) landMask[i] = norm[i] > 0 ? 1 : 0;
  const distToLand = distanceField(landMask, w, h);
  const elevation = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = norm[i];
    if (v > 0) {
      elevation[i] = Math.max(1, v * 8000);
    } else {
      const d = distToLand[i];
      const s1 = smoothstep(0, 9, d);
      const s2 = smoothstep(6, 28, d);
      elevation[i] = -(25 + 170 * s1 + 3700 * s2 * (0.5 + 0.5 * clamp(-v / 0.6, 0, 1.6)));
    }
  }

  // 4. Climate.
  progress('Simulating climate', 0);
  latRange.north = settings.latNorth;
  latRange.south = settings.latSouth;
  const climate = simulateClimate(elevation, w, h, rng.fork(20));

  // 5. Hydrology (modifies elevation: fills sinks and carves rivers).
  progress('Carving rivers and lakes', 0);
  const hydro = computeHydrology(elevation, climate.temperature, climate.precipitation, w, h, rng.fork(25));

  // 6. Biomes & surface colour.
  progress('Growing vegetation', 0);
  const riverMask = new Float32Array(n);
  for (let i = 0; i < n; i++) riverMask[i] = hydro.riverCell[i] ? 1 : 0;
  const riverProx = blur(riverMask, w, h, 3, 3);
  const biome = new Uint8Array(n);
  const albedo = new Uint8Array(n * 4);
  const climateTex = new Uint8Array(n * 4);
  const cellM = HEIGHT_SPACING * KM_PER_UNIT * 1000;
  const cn1 = new Noise2D(rng.fork(30)), cn2 = new Noise2D(rng.fork(31));
  const sp: SurfaceParams = { t: 0, p: 0, elevM: 0, slope: 0, riverProx: 0, coastDist: 0, salt: false, n1: 0, n2: 0, wetland: 0 };
  for (let y = 0; y < h; y++) {
    if ((y & 63) === 0) progress('Growing vegetation', y / h);
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const e = elevation[i];
      const t = climate.temperature[i];
      const p = climate.precipitation[i];
      const xl = Math.max(0, x - 1), xr = Math.min(w - 1, x + 1);
      const yu = Math.max(0, y - 1), yd = Math.min(h - 1, y + 1);
      const gx = (elevation[y * w + xr] - elevation[y * w + xl]) / ((xr - xl) * cellM);
      const gz = (elevation[yd * w + x] - elevation[yu * w + x]) / ((yd - yu) * cellM);
      const slope = Math.sqrt(gx * gx + gz * gz) * ELEV_EXAGGERATION;
      const rp = clamp(riverProx[i] * 2.2, 0, 1);
      const lowWet = rp * smoothstep(400, 60, e);
      const isLake = hydro.waterLevel[i] > -1e8;
      if (e <= 0 || isLake) {
        biome[i] = isLake ? Biome.Lake : Biome.Ocean;
        albedo[i * 4] = 40; albedo[i * 4 + 1] = 70; albedo[i * 4 + 2] = 60; albedo[i * 4 + 3] = 0;
      } else {
        biome[i] = classifyBiome(t, p, e, slope, lowWet);
        const x0 = x * HEIGHT_SPACING, z0 = y * HEIGHT_SPACING;
        sp.t = t; sp.p = p; sp.elevM = e; sp.slope = slope; sp.riverProx = rp;
        sp.coastDist = climate.oceanDist[i]; sp.salt = hydro.saltFlat[i] === 1;
        sp.n1 = cn1.fbm(x0 / 6, z0 / 6, 4); sp.n2 = cn2.fbm(x0 / 25, z0 / 25, 3);
        sp.wetland = biome[i] === Biome.Wetland ? 1 : 0;
        surfaceColour(sp, albedo, i * 4);
      }
      climateTex[i * 4] = clamp(Math.round((t + 40) * 3.2), 0, 255);
      climateTex[i * 4 + 1] = clamp(Math.round(p / 16), 0, 255);
      climateTex[i * 4 + 2] = clamp(Math.round(climate.continentality[i] * 255), 0, 255);
      climateTex[i * 4 + 3] = hydro.riverCell[i] ? 255 : Math.round(rp * 160);
    }
  }

  // 7. Hex layer.
  progress('Mapping terrain hexes', 0);
  const hexLayer = deriveHexes(grid, w, h, elevation, hydro.waterLevel, climate.temperature, climate.precipitation,
    biome, albedo, hydro.riverCell, hydro.accumulation);

  // 8. Nations.
  progress('Founding nations', 0);
  const names = new NameGenerator();
  const politics = generatePolitics(grid, hexLayer, rng.fork(40), names, settings.nationCount);

  // 9. Cities, roads, resources.
  progress('Building cities and roads', 0);
  const settle = generateSettlements(grid, hexLayer, politics.owner, politics.nations, rng.fork(50), names);

  // Fill real-style statistics for the generated nations.
  const popK = new Float64Array(politics.nations.length);
  for (let i = 0; i < politics.owner.length; i++) if (politics.owner[i]) popK[politics.owner[i] - 1] += settle.population[i];
  for (const nt of politics.nations) {
    const pop = popK[nt.id] / 1000;
    const perCap = 1500 + 62000 * nt.development * nt.development;
    nt.population = Math.max(0.2, pop);
    nt.gdp = Math.max(1, (nt.population * perCap) / 1000);
    nt.activeMilitary = nt.population * 1000 * 0.0035 * (0.5 + nt.militarism);
    nt.defenseBudget = 1 + 3 * nt.militarism;
    nt.navyRating = Math.round(Math.min(10, nt.navalFocus * 6 + nt.development * 4));
    nt.airRating = Math.round(Math.min(10, nt.development * 8 + nt.militarism * 2));
    nt.nuclear = nt.development > 0.7 && nt.population > 80;
    const cap = settle.cities.find((c) => c.nation === nt.id && c.capital);
    if (cap) nt.capitalName = cap.name;
  }

  progress('Finalizing world', 1);
  return {
    settings,
    hw: w,
    hh: h,
    elevation,
    temperature: climate.temperature,
    precipitation: climate.precipitation,
    biome,
    albedo,
    climateTex,
    waterLevel: hydro.waterLevel,
    rivers: hydro.rivers,
    lakes: hydro.lakes,
    hexTerrain: hexLayer.terrain,
    hexElevation: hexLayer.elevation,
    hexOwner: politics.owner,
    hexPopulation: settle.population,
    hexRiverEdges: hexLayer.riverEdges,
    hexRoad: settle.hexRoad,
    hexRail: settle.hexRail,
    hexDeposit: settle.deposit,
    hexDepositSize: settle.depositSize,
    hexForest: hexLayer.forest,
    hexTemperature: hexLayer.temperature,
    hexPrecip: hexLayer.precip,
    hexHabitability: hexLayer.habitability,
    hexCity: settle.hexCity,
    hexCoast: hexLayer.coast,
    nations: politics.nations,
    blocs: politics.blocs,
    cities: settle.cities,
    roads: settle.roads,
    rails: settle.rails,
    relations: politics.relations,
    claims: politics.claims,
  };
}

/** Typed arrays in WorldData that can be transferred between threads. */
export function transferables(world: WorldData): ArrayBuffer[] {
  const list: ArrayBuffer[] = [];
  for (const v of Object.values(world)) {
    if (ArrayBuffer.isView(v)) list.push(v.buffer as ArrayBuffer);
  }
  for (const r of world.rivers) list.push(r.points.buffer as ArrayBuffer);
  for (const l of world.lakes) list.push(l.cells.buffer as ArrayBuffer);
  for (const c of world.claims) list.push(c.buffer as ArrayBuffer);
  return [...new Set(list)];
}
