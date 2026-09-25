/**
 * Real-Earth world builder: Natural Earth country outlines + our own relief,
 * climate, hydrology and biome simulation + real countries and cities.
 */
import { RNG } from '../../core/rng';
import { HexGrid } from '../../core/hex';
import { clamp } from '../../core/noise';
import { EarthGrid } from './grid';
import { rasterizeCountries } from './raster';
import { buildElevation } from './elevation';
import { carveLakes } from './lakes';
import { buildSurface } from '../generate';
import { buildRoadNetwork, placeDeposits } from '../settlements';
import { NameGenerator } from '../names';
import type { Progress } from '../terrain';
import { COUNTRIES, BLOCS, RELATION_OVERRIDES } from '../../data/countries';
import { CITIES } from '../../data/cities';
import {
  EARTH_SETTINGS, HEIGHT_SPACING, Terrain, worldXFromLon, worldZFromLat,
  type BlocSeed, type CitySeed, type NationSeed, type WorldData,
} from '../types';

export function generateEarth(progress: Progress = () => {}): WorldData {
  const settings = EARTH_SETTINGS;
  const rng = new RNG(settings.seed);
  const grid = new HexGrid(settings.cols, settings.rows);
  const g = new EarthGrid(settings);
  const w = g.w, h = g.h;

  progress('Tracing coastlines and borders', 0);
  const raster = rasterizeCountries(g);
  const el = buildElevation(g, raster, rng.fork(1), progress, Math.floor(g.n * 0.35));
  const elevation = el.elevation;
  progress('Filling lakes', 0);
  carveLakes(g, elevation, el.land);

  const surf = buildSurface(settings, grid, w, h, elevation, rng.fork(2), progress, (c) => applyClimateModifiers(c.precipitation, c.temperature, w, h));
  const { climate, hydro, biome, albedo, climateTex, hexLayer } = surf;

  // --- Countries → hex ownership ------------------------------------------------
  progress('Drawing national borders', 0);
  const keyMap = new Map<string, number>();
  COUNTRIES.forEach((c, i) => c.atlasIds.forEach((id) => keyMap.set(id, i)));
  const featToCountry = raster.features.map((f) =>
    keyMap.get(f.key) ?? (f.id ? keyMap.get(f.id) : undefined) ?? keyMap.get('name:' + f.name) ?? -1);
  const nHex = grid.count;
  const countryOfHex = new Int32Array(nHex).fill(-1);
  const isLand = (i: number) => hexLayer.terrain[i] > Terrain.Lake;
  const votes = new Map<number, number>();
  for (let i = 0; i < nHex; i++) {
    if (!isLand(i)) continue;
    votes.clear();
    const cx = grid.cx[i], cz = grid.cz[i];
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = Math.round(cx / HEIGHT_SPACING) + dx, z = Math.round(cz / HEIGHT_SPACING) + dz;
        if (x < 0 || z < 0 || x >= w || z >= h) continue;
        const f = raster.featureOf[z * w + x];
        if (f < 0) continue;
        const c = featToCountry[f];
        if (c >= 0) votes.set(c, (votes.get(c) ?? 0) + 1);
      }
    }
    let best = -1, bestV = 0;
    for (const [c, v] of votes) if (v > bestV) { bestV = v; best = c; }
    countryOfHex[i] = best;
  }
  // Force tiny states onto the map at their capital.
  const capOf = new Map<string, { lat: number; lon: number }>();
  for (const c of CITIES) if (c.capital) capOf.set(c.country, c);
  const hexCountByCountry = new Int32Array(COUNTRIES.length);
  for (let i = 0; i < nHex; i++) if (countryOfHex[i] >= 0) hexCountByCountry[countryOfHex[i]]++;
  COUNTRIES.forEach((c, ci) => {
    if (hexCountByCountry[ci] > 0) return;
    const cap = capOf.get(c.code);
    if (!cap) return;
    const hx = grid.fromWorld(worldXFromLon(cap.lon, settings), worldZFromLat(cap.lat, settings));
    if (hx < 0) return;
    countryOfHex[hx] = ci;
    if (!isLand(hx)) { hexLayer.terrain[hx] = Terrain.Plains; hexLayer.elevation[hx] = 20; hexLayer.habitability[hx] = 0.5; }
    hexCountByCountry[ci] = 1;
  });
  // Unassigned land joins the nearest country.
  {
    const q: number[] = [];
    const label = new Int32Array(nHex).fill(-1);
    for (let i = 0; i < nHex; i++) if (countryOfHex[i] >= 0) { label[i] = countryOfHex[i]; q.push(i); }
    for (let k = 0; k < q.length; k++) {
      const c = q[k];
      for (let d = 0; d < 6; d++) {
        const m = grid.neighbours[c * 6 + d];
        if (m < 0 || label[m] >= 0) continue;
        label[m] = label[c];
        q.push(m);
      }
    }
    for (let i = 0; i < nHex; i++) if (isLand(i) && countryOfHex[i] < 0) countryOfHex[i] = label[i];
  }

  // --- Nations ------------------------------------------------------------------
  const nationOfCountry = new Int32Array(COUNTRIES.length).fill(-1);
  const used = COUNTRIES.map((_, ci) => ci).filter((ci) => countryOfHex.some((c) => c === ci));
  used.forEach((ci, id) => (nationOfCountry[ci] = id));
  const hexOwner = new Uint16Array(nHex);
  for (let i = 0; i < nHex; i++) if (isLand(i) && countryOfHex[i] >= 0) hexOwner[i] = nationOfCountry[countryOfHex[i]] + 1;
  const blocIndex = new Map(BLOCS.map((b, i) => [b.code, i]));
  const names = new NameGenerator();
  const nations: NationSeed[] = used.map((ci, id) => {
    const c = COUNTRIES[ci];
    const perCap = (c.gdp * 1e9) / Math.max(1, c.population * 1e6);
    return {
      id, code: c.code, name: c.name, formalName: c.formalName, adjective: c.adjective, culture: c.culture,
      capitalHex: -1, capitalName: c.capital, color: c.color, flag: c.flag, government: c.government,
      leaderTitle: c.leaderTitle, leaderName: names.person(c.culture, rng),
      population: c.population, gdp: c.gdp, activeMilitary: c.activeMilitary, defenseBudget: c.defenseBudget,
      techLevel: c.techLevel, nuclear: c.nuclear, navyRating: c.navy, airRating: c.airForce,
      development: clamp((Math.log10(perCap) - 2.8) / 2, 0.05, 1),
      aggression: c.aggression, ideology: c.ideology,
      blocs: c.blocs.map((b) => blocIndex.get(b)).filter((b): b is number => b !== undefined),
      militarism: clamp(c.defenseBudget / 6 + (c.activeMilitary / Math.max(1, c.population * 1000)) * 25, 0.05, 1),
      navalFocus: clamp(c.navy / 10, 0, 1),
      hexCount: 0,
    };
  });
  for (let i = 0; i < nHex; i++) if (hexOwner[i]) nations[hexOwner[i] - 1].hexCount++;
  const byCode = new Map(nations.map((n) => [n.code, n.id]));
  const blocs: BlocSeed[] = BLOCS.map((b, i) => ({
    id: i, code: b.code, name: b.name, short: b.short, color: b.color, military: b.military,
    leader: b.leader ? byCode.get(b.leader) ?? -1 : -1,
  }));

  // --- Cities --------------------------------------------------------------------
  progress('Founding cities', 0);
  const hexCity = new Int32Array(nHex).fill(-1);
  const cities: CitySeed[] = [];
  const nb = grid.neighbours;
  const seaAdj = (i: number) => {
    for (let d = 0; d < 6; d++) {
      const m = nb[i * 6 + d];
      if (m >= 0 && (hexLayer.terrain[m] === Terrain.Coastal || hexLayer.terrain[m] === Terrain.DeepOcean)) return true;
    }
    return false;
  };
  const sorted = [...CITIES].sort((a, b) => Number(!!b.capital) - Number(!!a.capital) || b.pop - a.pop);
  for (const cd of sorted) {
    const nat = byCode.get(cd.country);
    if (nat === undefined) continue;
    const target = grid.fromWorld(worldXFromLon(cd.lon, settings), worldZFromLat(cd.lat, settings));
    if (target < 0) continue;
    let hx = -1, bestD = Infinity;
    grid.forRadius(target, 4, (m, d) => {
      if (hexOwner[m] !== nat + 1 || hexCity[m] >= 0 || !isLand(m)) return;
      if (d < bestD) { bestD = d; hx = m; }
    });
    if (hx < 0) continue;
    const id = cities.length;
    const urbanHexes = [hx];
    const extra = cd.pop > 9000 ? 6 : cd.pop > 4000 ? 4 : cd.pop > 1500 ? 2 : cd.pop > 600 ? 1 : 0;
    const around: number[] = [];
    for (let d = 0; d < 6; d++) {
      const m = nb[hx * 6 + d];
      if (m >= 0 && isLand(m) && hexOwner[m] === nat + 1 && hexCity[m] < 0 && hexLayer.terrain[m] !== Terrain.Mountains) around.push(m);
    }
    around.sort((a, b) => hexLayer.habitability[b] - hexLayer.habitability[a]);
    urbanHexes.push(...around.slice(0, extra));
    for (const u of urbanHexes) { hexCity[u] = id; hexLayer.terrain[u] = Terrain.Urban; }
    cities.push({
      id, name: cd.name, hex: hx, nation: nat, population: cd.pop, capital: !!cd.capital, port: seaAdj(hx),
      urbanHexes, x: grid.cx[hx], z: grid.cz[hx], gridAngle: rng.range(0, Math.PI / 2),
    });
    if (cd.capital && nations[nat].capitalHex < 0) nations[nat].capitalHex = hx;
  }
  for (const nt of nations) {
    if (nt.capitalHex >= 0) continue;
    const any = cities.find((c) => c.nation === nt.id);
    if (any) { any.capital = true; nt.capitalHex = any.hex; continue; }
    // No listed city: found one at the most habitable hex.
    let best = -1;
    for (let i = 0; i < nHex; i++) if (hexOwner[i] === nt.id + 1 && (best < 0 || hexLayer.habitability[i] > hexLayer.habitability[best])) best = i;
    if (best < 0) continue;
    const id = cities.length;
    hexCity[best] = id;
    hexLayer.terrain[best] = Terrain.Urban;
    cities.push({ id, name: nt.capitalName, hex: best, nation: nt.id, population: Math.max(50, nt.population * 150), capital: true, port: seaAdj(best), urbanHexes: [best], x: grid.cx[best], z: grid.cz[best], gridAngle: 0 });
    nt.capitalHex = best;
  }

  // --- Population ----------------------------------------------------------------
  const population = new Float32Array(nHex);
  const cityPop = new Float64Array(nations.length);
  for (const c of cities) cityPop[c.nation] += c.population;
  const habSum = new Float64Array(nations.length);
  for (let i = 0; i < nHex; i++) if (hexOwner[i]) habSum[hexOwner[i] - 1] += Math.pow(hexLayer.habitability[i], 1.5) + 0.01;
  for (let i = 0; i < nHex; i++) {
    const o = hexOwner[i];
    if (!o) continue;
    const nt = nations[o - 1];
    const total = nt.population * 1000;
    const rural = Math.max(total * 0.15, total - Math.min(cityPop[o - 1], total * 0.85));
    population[i] = (rural * (Math.pow(hexLayer.habitability[i], 1.5) + 0.01)) / habSum[o - 1];
  }
  for (const c of cities) {
    const share = c.urbanHexes.length > 1 ? 0.6 : 1;
    population[c.hex] += c.population * share;
    for (let u = 1; u < c.urbanHexes.length; u++) population[c.urbanHexes[u]] += (c.population * 0.4) / (c.urbanHexes.length - 1);
  }
  for (let i = 0; i < nHex; i++) {
    const t = hexLayer.terrain[i];
    if (!hexOwner[i] || hexCity[i] >= 0 || hexLayer.temperature[i] < 2) continue;
    const p = population[i];
    if ((t === Terrain.Plains && p > 110) || (t === Terrain.Forest && p > 300) || (t === Terrain.Hills && p > 250)) hexLayer.terrain[i] = Terrain.Farmland;
  }

  // --- Roads, resources, relations ----------------------------------------------------
  progress('Building road networks', 0);
  const net = buildRoadNetwork(grid, hexLayer, hexOwner, nations, cities);
  const dep = placeDeposits(grid, hexLayer, hexCity, rng.fork(3));

  const N = nations.length;
  const relations = new Int8Array(N * N);
  const adjacent = new Set<number>();
  for (let i = 0; i < nHex; i++) {
    const a = hexOwner[i];
    if (!a) continue;
    for (let d = 0; d < 3; d++) {
      const m = nb[i * 6 + d];
      const b = m >= 0 ? hexOwner[m] : 0;
      if (b && b !== a) { adjacent.add((a - 1) * N + (b - 1)); adjacent.add((b - 1) * N + (a - 1)); }
    }
  }
  for (let a = 0; a < N; a++) {
    relations[a * N + a] = 100;
    for (let b = a + 1; b < N; b++) {
      const A = nations[a], B = nations[b];
      let r = 5 + 28 * (1 - Math.abs(A.ideology - B.ideology) / 2) - 10;
      for (const x of A.blocs) if (B.blocs.includes(x)) r += blocs[x].military ? 40 : 12;
      if (adjacent.has(a * N + b)) r -= 5;
      const v = Math.round(clamp(r, -100, 100));
      relations[a * N + b] = v;
      relations[b * N + a] = v;
    }
  }
  for (const [ca, cb, v] of RELATION_OVERRIDES) {
    const a = byCode.get(ca), b = byCode.get(cb);
    if (a === undefined || b === undefined) continue;
    relations[a * N + b] = v;
    relations[b * N + a] = v;
  }

  progress('Finalizing world', 1);
  return {
    settings, hw: w, hh: h, elevation,
    temperature: climate.temperature, precipitation: climate.precipitation, biome, albedo, climateTex,
    waterLevel: hydro.waterLevel, rivers: hydro.rivers, lakes: hydro.lakes,
    hexTerrain: hexLayer.terrain, hexElevation: hexLayer.elevation, hexOwner, hexPopulation: population,
    hexRiverEdges: hexLayer.riverEdges, hexRoad: net.hexRoad, hexRail: net.hexRail,
    hexDeposit: dep.deposit, hexDepositSize: dep.depositSize, hexForest: hexLayer.forest,
    hexTemperature: hexLayer.temperature, hexPrecip: hexLayer.precip, hexHabitability: hexLayer.habitability,
    hexCity, hexCoast: hexLayer.coast, nations, blocs, cities, roads: net.roads, rails: net.rails,
    relations, claims: nations.map(() => new Int32Array(0)),
  };
}

/** [lon, lat, radiusLon, radiusLat, precipitation multiplier, temperature offset °C] */
const CLIMATE_MODS: [number, number, number, number, number, number][] = [
  [-62, -5, 14, 9, 2.6, 0], [-50, -14, 9, 7, 1.9, 0], [-85, 37, 13, 10, 2.1, 0], [-93, 43, 8, 6, 1.6, 0],
  [90, 60, 50, 11, 1.9, 0], [40, 57, 16, 8, 1.6, 0], [-100, 55, 32, 9, 1.7, 0], [22, -2, 10, 7, 1.5, 0],
  [112, 27, 10, 7, 1.6, 0], [80, 22, 9, 8, 1.6, 0], [-5, 50, 12, 8, 1.3, 4], [15, 62, 12, 6, 1.2, 4],
  [10, 23, 22, 7, 0.3, 0], [47, 23, 10, 7, 0.3, 0], [133, -25, 12, 7, 0.5, 0], [-70, -23, 2.5, 7, 0.1, 0],
  [105, 43, 10, 4, 0.5, 0], [83, 39, 7, 3, 0.3, 0], [57, 31, 6, 4, 0.5, 0], [17, -23, 5, 5, 0.6, 0],
  [-113, 35, 6, 5, 0.5, 0], [63, 42, 9, 5, 0.6, 0],
];

function applyClimateModifiers(precip: Float32Array, temp: Float32Array, w: number, h: number): void {
  const s = EARTH_SETTINGS;
  for (let j = 0; j < h; j++) {
    const lat = s.latNorth - ((j * HEIGHT_SPACING) / (1.5 * s.rows + 0.5)) * (s.latNorth - s.latSouth);
    for (let i = 0; i < w; i++) {
      const lon = s.lonWest + ((i * HEIGHT_SPACING) / (Math.sqrt(3) * (s.cols + 0.5))) * (s.lonEast - s.lonWest);
      let mult = 1, dT = 0;
      for (const [x, y, rx, ry, m, t] of CLIMATE_MODS) {
        const d = ((lon - x) / rx) ** 2 + ((lat - y) / ry) ** 2;
        if (d >= 1.6) continue;
        const f = Math.exp(-d * 1.4);
        mult *= 1 + (m - 1) * f;
        dT += t * f;
      }
      const k = j * w + i;
      precip[k] *= mult;
      // Boreal forest belt and the North American interior receive steady
      // frontal precipitation that the simple advection model under-predicts.
      precip[k] += 380 * Math.exp(-(((lat - 59) / 8) ** 2)) + 300 * Math.exp(-(((lon + 94) / 12) ** 2 + ((lat - 40) / 7) ** 2));
      temp[k] += dT;
    }
  }
}
