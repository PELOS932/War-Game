import { HexGrid } from '../core/hex';
import { RNG, hash2 } from '../core/rng';
import { Noise2D, clamp } from '../core/noise';
import { HexPathfinder } from '../core/pathfind';
import { HexLayer } from './hexes';
import { NameGenerator } from './names';
import { CitySeed, Deposit, NationSeed, RoadSeed, Terrain } from './types';

export interface SettlementResult {
  population: Float32Array;
  cities: CitySeed[];
  hexCity: Int32Array;
  roads: RoadSeed[];
  rails: RoadSeed[];
  hexRoad: Uint8Array;
  hexRail: Uint8Array;
  deposit: Uint8Array;
  depositSize: Float32Array;
}

const WORLD_POP_THOUSANDS = 8.3e6;

const ROAD_COST: Record<number, number> = {
  [Terrain.Plains]: 1, [Terrain.Farmland]: 1, [Terrain.Urban]: 0.8, [Terrain.Forest]: 1.6, [Terrain.Jungle]: 2.6,
  [Terrain.Hills]: 2.2, [Terrain.Mountains]: 6, [Terrain.Desert]: 1.5, [Terrain.Tundra]: 1.8, [Terrain.Marsh]: 3.2, [Terrain.Ice]: 8,
};

export function generateSettlements(
  grid: HexGrid,
  hex: HexLayer,
  owner: Uint16Array,
  nations: NationSeed[],
  rng: RNG,
  names: NameGenerator,
): SettlementResult {
  const n = grid.count;
  const nb = grid.neighbours;
  const isLand = (i: number) => hex.terrain[i] > Terrain.Lake;
  const noise = new Noise2D(rng.fork(71));

  // --- Rural population density ---------------------------------------------
  const popFactor = nations.map((nt) => Math.exp(rng.gauss(0, 0.45)) * (1.25 - nt.development * 0.5));
  const population = new Float32Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (!isLand(i) || !owner[i]) continue;
    const v = Math.pow(hex.habitability[i], 1.5) * (1 + 0.5 * noise.fbm(grid.cx[i] / 30, grid.cz[i] / 30, 3)) * popFactor[owner[i] - 1];
    population[i] = Math.max(0.2, v);
    total += population[i];
  }
  // ~72% lives in the countryside and towns (hex population), the rest in the
  // major named cities added below.
  const ruralScale = (WORLD_POP_THOUSANDS * 0.72) / total;
  const nationPop = new Float64Array(nations.length);
  for (let i = 0; i < n; i++) {
    population[i] *= ruralScale;
    if (owner[i]) nationPop[owner[i] - 1] += population[i];
  }

  // --- Cities -------------------------------------------------------------------
  const cities: CitySeed[] = [];
  const hexCity = new Int32Array(n).fill(-1);
  const nationHexes: number[][] = nations.map(() => []);
  for (let i = 0; i < n; i++) if (owner[i]) nationHexes[owner[i] - 1].push(i);
  const isSeaAdj = (i: number) => {
    for (let d = 0; d < 6; d++) {
      const m = nb[i * 6 + d];
      if (m >= 0 && (hex.terrain[m] === Terrain.Coastal || hex.terrain[m] === Terrain.DeepOcean)) return true;
    }
    return false;
  };

  for (const nt of nations) {
    const hexes = nationHexes[nt.id];
    if (!hexes.length) continue;
    const want = clamp(Math.round(2 + hexes.length / 26 + nationPop[nt.id] / 40000), 2, 32);
    const minD = hexes.length < 120 ? 3 : 4;
    const placed: number[] = [nt.capitalHex];
    const scored = hexes
      .filter((h) => hex.terrain[h] !== Terrain.Ice && hex.terrain[h] !== Terrain.Mountains)
      .map((h) => ({
        h,
        s: hex.habitability[h] * (1 + (hex.coast[h] ? 0.55 : 0) + (hex.hasRiver[h] ? 0.75 : 0)) * rng.range(0.6, 1.4) + 0.001,
      }))
      .sort((a, b) => b.s - a.s);
    for (const { h } of scored) {
      if (placed.length >= want) break;
      if (placed.some((p) => grid.distance(p, h) < minD)) continue;
      placed.push(h);
    }
    // Zipf distribution of the urban population.
    const cityShare = 0.1 + 0.3 * nt.development;
    const urbanPop = (nationPop[nt.id] / 0.72) * cityShare;
    const ranks = placed.map((_, k) => 1 / Math.pow(k + 1, 1.0) * (k === 0 ? rng.range(1.0, 2.0) : rng.range(0.7, 1.3)));
    const rsum = ranks.reduce((a, b) => a + b, 0);
    // Largest city besides capital should rank by habitability: sort non-capital by score.
    placed.forEach((h, k) => {
      const pop = clamp((urbanPop * ranks[k]) / rsum, 30, 36000);
      const id = cities.length;
      const urbanHexes = [h];
      const extra = pop > 9000 ? 6 : pop > 4000 ? 4 : pop > 1500 ? 2 : pop > 600 ? 1 : 0;
      const around: number[] = [];
      for (let d = 0; d < 6; d++) {
        const m = nb[h * 6 + d];
        if (m >= 0 && isLand(m) && owner[m] === nt.id + 1 && hexCity[m] < 0 && hex.terrain[m] !== Terrain.Mountains) around.push(m);
      }
      around.sort((a, b) => hex.habitability[b] - hex.habitability[a]);
      urbanHexes.push(...around.slice(0, extra));
      for (const u of urbanHexes) {
        hexCity[u] = id;
        hex.terrain[u] = Terrain.Urban;
      }
      population[h] += pop * (urbanHexes.length > 1 ? 0.6 : 1);
      for (let u = 1; u < urbanHexes.length; u++) population[urbanHexes[u]] += (pop * 0.4) / (urbanHexes.length - 1);
      cities.push({
        id,
        name: names.place(nt.culture, rng),
        hex: h,
        nation: nt.id,
        population: pop,
        capital: k === 0,
        port: isSeaAdj(h),
        urbanHexes,
        x: grid.cx[h],
        z: grid.cz[h],
        gridAngle: rng.range(0, Math.PI / 2),
      });
    });
  }

  // --- Farmland: cultivated land around dense population -------------------------
  for (let i = 0; i < n; i++) {
    const t = hex.terrain[i];
    if (!owner[i] || hexCity[i] >= 0) continue;
    const dens = population[i];
    if ((t === Terrain.Plains && dens > 700) || (t === Terrain.Forest && dens > 1500) || (t === Terrain.Hills && dens > 1300)) {
      if (hex.temperature[i] > 2) hex.terrain[i] = Terrain.Farmland;
    }
  }
  // Farmland also rings every city.
  for (const c of cities) {
    grid.forRadius(c.hex, c.population > 2000 ? 3 : 2, (m) => {
      const t = hex.terrain[m];
      if ((t === Terrain.Plains || t === Terrain.Forest) && hex.temperature[m] > 2 && owner[m] && hash2(m, 7) < 0.8) hex.terrain[m] = Terrain.Farmland;
    });
  }

  // --- Roads and rail -----------------------------------------------------------
  const hexRoad = new Uint8Array(n);
  const hexRail = new Uint8Array(n);
  const roads: RoadSeed[] = [];
  const rails: RoadSeed[] = [];
  const pf = new HexPathfinder(grid);
  const buildPath = (a: number, b: number, mask: Uint8Array, crossBorder: boolean): number[] | null => {
    const oa = owner[a], ob = owner[b];
    return pf.find(a, b, (from, to, d) => {
      if (!isLand(to)) return Infinity;
      if (!crossBorder && owner[to] !== oa) return Infinity;
      if (crossBorder && owner[to] !== oa && owner[to] !== ob) return Infinity;
      if (mask[from] & (1 << d)) return 0.35;
      let c = ROAD_COST[hex.terrain[to]] ?? 2;
      if (hex.riverEdges[from] & (1 << d)) c += 2.5;
      return c;
    }, 0.35, 60000);
  };
  const addRoute = (path: number[], mask: Uint8Array, list: RoadSeed[], kind: 0 | 1) => {
    for (let k = 0; k + 1 < path.length; k++) {
      const d = grid.dirTo(path[k], path[k + 1]);
      if (d < 0) continue;
      mask[path[k]] |= 1 << d;
      mask[path[k + 1]] |= 1 << ((d + 3) % 6);
    }
    list.push({ hexes: path, kind });
  };

  const citiesOf: CitySeed[][] = nations.map(() => []);
  for (const c of cities) citiesOf[c.nation].push(c);
  for (const nt of nations) {
    const cs = citiesOf[nt.id];
    if (cs.length < 2) continue;
    const edges = mstEdges(cs, grid);
    // Extra connections to nearest neighbours for a meshed network.
    for (let i = 0; i < cs.length; i++) {
      const d = cs.map((c, j) => ({ j, d: grid.distance(cs[i].hex, c.hex) })).filter((e) => e.j !== i).sort((a, b) => a.d - b.d);
      if (d.length > 1 && d[1].d < 13) edges.push([i, d[1].j]);
    }
    const seen = new Set<string>();
    for (const [a, b] of edges) {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const path = buildPath(cs[a].hex, cs[b].hex, hexRoad, false);
      if (!path) continue;
      const big = cs[a].population > 900 && cs[b].population > 900;
      addRoute(path, hexRoad, roads, big && nt.development > 0.35 ? 1 : 0);
    }
    // Rail between major cities in developed nations.
    if (nt.development > 0.3) {
      const major = cs.filter((c) => c.population > 350 || c.capital);
      if (major.length >= 2) {
        for (const [a, b] of mstEdges(major, grid)) {
          const path = buildPath(major[a].hex, major[b].hex, hexRail, false);
          if (path) addRoute(path, hexRail, rails, 0);
        }
      }
    }
  }
  // International roads between neighbouring nations' closest cities.
  const linked = new Set<string>();
  for (const ca of cities) {
    for (const cb of cities) {
      if (ca.nation >= cb.nation) continue;
      const key = `${ca.nation}:${cb.nation}`;
      if (linked.has(key)) continue;
      if (grid.distance(ca.hex, cb.hex) > 16) continue;
      // Pick the closest pair for these two nations.
      let bestA = ca, bestB = cb, bestD = grid.distance(ca.hex, cb.hex);
      for (const a of citiesOf[ca.nation]) for (const b of citiesOf[cb.nation]) {
        const d = grid.distance(a.hex, b.hex);
        if (d < bestD) { bestD = d; bestA = a; bestB = b; }
      }
      linked.add(key);
      const path = buildPath(bestA.hex, bestB.hex, hexRoad, true);
      if (path) addRoute(path, hexRoad, roads, 0);
    }
  }

  // --- Mineral deposits ------------------------------------------------------------
  const deposit = new Uint8Array(n);
  const depositSize = new Float32Array(n);
  const nOil = new Noise2D(rng.fork(81)), nCoal = new Noise2D(rng.fork(82)), nOre = new Noise2D(rng.fork(83)), nU = new Noise2D(rng.fork(84));
  for (let i = 0; i < n; i++) {
    const x = grid.cx[i], z = grid.cz[i];
    const t = hex.terrain[i];
    const r = hash2(i, 991);
    if (!isLand(i)) {
      if (t === Terrain.Coastal && hex.elevation[i] > -260) {
        const o = nOil.fbm(x / 40, z / 40, 3);
        if (o > 0.42 && r < 0.35) { deposit[i] = Deposit.Gas; depositSize[i] = 0.6 + (o - 0.42) * 3; }
      }
      continue;
    }
    if (hexCity[i] >= 0) continue;
    const o = nOil.fbm(x / 40, z / 40, 3);
    const co = nCoal.fbm(x / 34, z / 34, 3);
    const ore = nOre.fbm(x / 22, z / 22, 3);
    const u = nU.fbm(x / 28, z / 28, 3);
    const low = hex.elevation[i] < 900;
    if (low && o > 0.38 && (t === Terrain.Desert || t === Terrain.Plains || t === Terrain.Tundra || t === Terrain.Marsh || t === Terrain.Farmland) && r < 0.4) {
      deposit[i] = Deposit.Oil; depositSize[i] = 0.6 + (o - 0.38) * 3.2;
    } else if (co > 0.36 && (t === Terrain.Hills || t === Terrain.Plains || t === Terrain.Forest || t === Terrain.Farmland) && r < 0.35) {
      deposit[i] = Deposit.Coal; depositSize[i] = 0.6 + (co - 0.36) * 3;
    } else if (ore > 0.3 && (t === Terrain.Hills || t === Terrain.Mountains || hex.relief[i] > 500) && r < 0.4) {
      deposit[i] = Deposit.Ore; depositSize[i] = 0.6 + (ore - 0.3) * 2.5;
    } else if (u > 0.5 && hex.relief[i] < 700 && r < 0.3) {
      deposit[i] = Deposit.Uranium; depositSize[i] = 0.6 + (u - 0.5) * 3;
    }
    depositSize[i] = clamp(depositSize[i], 0, 2);
  }

  return { population, cities, hexCity, roads, rails, hexRoad, hexRail, deposit, depositSize };
}

/** Prim's minimum spanning tree over cities by hex distance. */
function mstEdges(cs: CitySeed[], grid: HexGrid): [number, number][] {
  const inTree = new Array(cs.length).fill(false);
  const bestD = new Array(cs.length).fill(Infinity);
  const bestFrom = new Array(cs.length).fill(-1);
  const edges: [number, number][] = [];
  bestD[0] = 0;
  for (let it = 0; it < cs.length; it++) {
    let u = -1;
    for (let i = 0; i < cs.length; i++) if (!inTree[i] && (u < 0 || bestD[i] < bestD[u])) u = i;
    inTree[u] = true;
    if (bestFrom[u] >= 0) edges.push([bestFrom[u], u]);
    for (let v = 0; v < cs.length; v++) {
      if (inTree[v]) continue;
      const d = grid.distance(cs[u].hex, cs[v].hex);
      if (d < bestD[v]) { bestD[v] = d; bestFrom[v] = u; }
    }
  }
  return edges;
}
