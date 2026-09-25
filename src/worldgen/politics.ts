import { HexGrid } from '../core/hex';
import { RNG } from '../core/rng';
import { MinHeap } from '../core/heap';
import { clamp, Noise2D } from '../core/noise';
import { HexLayer } from './hexes';
import { NameGenerator, CULTURES, blocName } from './names';
import { BlocSeed, FlagSpec, Government, NationSeed, Terrain, isDemocratic } from './types';

const GROWTH_COST: Record<number, number> = {
  [Terrain.Plains]: 1, [Terrain.Farmland]: 1, [Terrain.Forest]: 1.5, [Terrain.Jungle]: 2.1,
  [Terrain.Hills]: 1.9, [Terrain.Mountains]: 5.5, [Terrain.Desert]: 1.35, [Terrain.Tundra]: 1.3,
  [Terrain.Marsh]: 2.2, [Terrain.Ice]: 2.5, [Terrain.Urban]: 1,
};

export interface PoliticsResult {
  owner: Uint16Array;
  nations: NationSeed[];
  blocs: BlocSeed[];
  relations: Int8Array;
  claims: Int32Array[];
}

function hsl(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function hex2(c: [number, number, number]): string {
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

const FLAG_PALETTE = ['#c8102e', '#002868', '#ffffff', '#000000', '#009739', '#fcd116', '#0072c6', '#ef7d00', '#7a1c2e', '#00843d', '#5b92e5', '#d52b1e', '#003f87', '#f4c400', '#6a0dad', '#008080'];

const LAYOUTS: FlagSpec['layout'][] = ['hstripes', 'vstripes', 'nordic', 'canton', 'triangle', 'diagonal', 'cross', 'bordered', 'hstripes', 'vstripes'];

function makeFlag(rng: RNG, nationColor: [number, number, number]): FlagSpec {
  const colors: string[] = [];
  const main = hex2(nationColor);
  colors.push(rng.chance(0.55) ? main : rng.pick(FLAG_PALETTE));
  while (colors.length < 3) {
    const c = rng.pick(FLAG_PALETTE);
    if (!colors.includes(c)) colors.push(c);
  }
  rng.shuffle(colors);
  const layout = rng.pick(LAYOUTS);
  const accent = rng.pick(FLAG_PALETTE);
  const emblems = rng.chance(0.5)
    ? [{ shape: rng.pick(['star', 'circle', 'crescentStar', 'sun'] as const), color: rng.pick(['#ffffff', '#fcd116', '#000000']), x: 0.5, y: 0.5, size: 0.35 }]
    : [];
  return { layout, colors, accent, emblems };
}

export function generatePolitics(
  grid: HexGrid,
  hex: HexLayer,
  rng: RNG,
  names: NameGenerator,
  nationCount: number,
): PoliticsResult {
  const n = grid.count;
  const isLand = (i: number) => hex.terrain[i] > Terrain.Lake;
  const nb = grid.neighbours;

  // --- Landmasses --------------------------------------------------------
  const mass = new Int32Array(n).fill(-1);
  const massSize: number[] = [];
  const massHexes: number[][] = [];
  for (let i = 0; i < n; i++) {
    if (!isLand(i) || mass[i] >= 0) continue;
    const id = massSize.length;
    const list: number[] = [i];
    mass[i] = id;
    for (let k = 0; k < list.length; k++) {
      const c = list[k];
      for (let d = 0; d < 6; d++) {
        const m = nb[c * 6 + d];
        if (m >= 0 && mass[m] < 0 && isLand(m)) { mass[m] = id; list.push(m); }
      }
    }
    massSize.push(list.length);
    massHexes.push(list);
  }
  const totalLand = massSize.reduce((a, b) => a + b, 0);
  const alloc = massSize.map((s) => (s >= 45 ? Math.max(1, Math.round((nationCount * s) / totalLand)) : 0));
  let sum = alloc.reduce((a, b) => a + b, 0);
  const bySize = massSize.map((s, i) => i).sort((a, b) => massSize[b] - massSize[a]);
  let k = 0;
  while (sum < nationCount && bySize.length) { alloc[bySize[k % Math.min(3, bySize.length)]]++; sum++; k++; }
  k = 0;
  while (sum > nationCount) {
    const m = bySize[k % bySize.length];
    if (alloc[m] > 1) { alloc[m]--; sum--; }
    k++;
    if (k > 1000) break;
  }

  // --- Capitals -----------------------------------------------------------
  const capitals: number[] = [];
  for (let m = 0; m < massSize.length; m++) {
    const want = alloc[m];
    if (want <= 0) continue;
    const cands = massHexes[m];
    let minD = Math.max(3, Math.floor(0.72 * Math.sqrt(massSize[m] / want)));
    const placed: number[] = [];
    let guard = 0;
    while (placed.length < want && guard++ < 4000) {
      const weights = cands.map((c) => Math.pow(hex.habitability[c], 2) + 0.0005);
      const c = rng.weighted(cands, weights);
      if (placed.some((p) => grid.distance(p, c) < minD)) {
        if (guard % 300 === 299) minD = Math.max(2, minD - 1);
        continue;
      }
      placed.push(c);
    }
    capitals.push(...placed);
  }
  const N = capitals.length;

  // --- Territorial growth (weighted Voronoi via Dijkstra) -------------------
  const owner = new Uint16Array(n);
  const best = new Float64Array(n).fill(Infinity);
  const noise = new Noise2D(rng.fork(55));
  const strength = capitals.map(() => Math.exp(rng.gauss(0, 0.42)));
  const heap = new MinHeap(1 << 14);
  const claimant = new Int32Array(n).fill(-1);
  capitals.forEach((c, id) => {
    best[c] = 0;
    claimant[c] = id;
    heap.push(c, 0);
  });
  const done = new Uint8Array(n);
  while (heap.size > 0) {
    const c = heap.pop();
    if (done[c]) continue;
    done[c] = 1;
    const id = claimant[c];
    owner[c] = id + 1;
    for (let d = 0; d < 6; d++) {
      const m = nb[c * 6 + d];
      if (m < 0 || done[m] || !isLand(m)) continue;
      let cost = GROWTH_COST[hex.terrain[m]] ?? 1.5;
      if (hex.riverEdges[c] & (1 << d)) cost += 2.8;
      cost += 0.9 * (noise.fbm(grid.cx[m] / 25, grid.cz[m] / 25, 3) + 1);
      const g = best[c] + cost / strength[id];
      if (g < best[m]) {
        best[m] = g;
        claimant[m] = id;
        heap.push(m, g);
      }
    }
  }
  // Unclaimed land (small islands): attach to nearest nation through water.
  {
    const label = new Uint16Array(n);
    const q: number[] = [];
    for (let i = 0; i < n; i++) if (owner[i]) { label[i] = owner[i]; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      for (let d = 0; d < 6; d++) {
        const m = nb[c * 6 + d];
        if (m < 0 || label[m]) continue;
        label[m] = label[c];
        q.push(m);
      }
    }
    for (let i = 0; i < n; i++) if (isLand(i) && !owner[i]) owner[i] = label[i];
  }

  // --- Culture regions (k-means over capitals) -------------------------------
  const kC = Math.min(CULTURES.length, Math.max(3, Math.round(N / 3.6)));
  const centres: [number, number][] = [];
  const shuffled = rng.shuffle(capitals.slice());
  for (let i = 0; i < kC; i++) centres.push([grid.cx[shuffled[i]], grid.cz[shuffled[i]]]);
  const clusterOf = new Int32Array(N);
  for (let iter = 0; iter < 12; iter++) {
    const acc = centres.map(() => [0, 0, 0]);
    capitals.forEach((c, id) => {
      let bi = 0, bd = Infinity;
      centres.forEach((ce, j) => {
        const d = (grid.cx[c] - ce[0]) ** 2 + (grid.cz[c] - ce[1]) ** 2;
        if (d < bd) { bd = d; bi = j; }
      });
      clusterOf[id] = bi;
      acc[bi][0] += grid.cx[c]; acc[bi][1] += grid.cz[c]; acc[bi][2]++;
    });
    acc.forEach((a, j) => { if (a[2] > 0) centres[j] = [a[0] / a[2], a[1] / a[2]]; });
  }
  const cultureOrder = rng.shuffle(CULTURES.map((_, i) => i));
  const clusterDev = centres.map(() => rng.range(-1, 1));

  // --- Neighbour graph ------------------------------------------------------
  const hexCount = new Int32Array(N);
  const coastCount = new Int32Array(N);
  const adjacency: Set<number>[] = capitals.map(() => new Set<number>());
  for (let i = 0; i < n; i++) {
    const o = owner[i];
    if (!o) continue;
    hexCount[o - 1]++;
    if (hex.coast[i]) coastCount[o - 1]++;
    for (let d = 0; d < 3; d++) {
      const m = nb[i * 6 + d];
      if (m < 0) continue;
      const o2 = owner[m];
      if (o2 && o2 !== o) { adjacency[o - 1].add(o2 - 1); adjacency[o2 - 1].add(o - 1); }
    }
  }

  // --- Nation attributes ----------------------------------------------------
  const nations: NationSeed[] = [];
  const colours: [number, number, number][] = [];
  const hueStep = 0.61803398875;
  let hue = rng.next();
  const palette: [number, number, number][] = [];
  for (let i = 0; i < N * 3; i++) {
    hue = (hue + hueStep) % 1;
    const s = 0.45 + 0.35 * ((i * 7) % 5) / 4;
    const l = 0.38 + 0.2 * ((i * 3) % 4) / 3;
    palette.push(hsl(hue, s, l));
  }
  const colourDist = (a: [number, number, number], b: [number, number, number]) =>
    Math.hypot(a[0] - b[0], (a[1] - b[1]) * 1.2, a[2] - b[2]);
  const usedPal = new Set<number>();
  for (let id = 0; id < N; id++) {
    let bestP = 0, bestScore = -1;
    for (let p = 0; p < palette.length; p++) {
      if (usedPal.has(p)) continue;
      let score = 400;
      for (const m of adjacency[id]) if (colours[m]) score = Math.min(score, colourDist(palette[p], colours[m]));
      for (let j = 0; j < id; j++) score = Math.min(score, colourDist(palette[p], colours[j]) * 2.2);
      score += rng.range(0, 12);
      if (score > bestScore) { bestScore = score; bestP = p; }
    }
    usedPal.add(bestP);
    colours[id] = palette[bestP];
  }

  for (let id = 0; id < N; id++) {
    const cap = capitals[id];
    const cl = clusterOf[id];
    const culture = cultureOrder[cl % cultureOrder.length];
    const t = hex.temperature[cap];
    const climateScore = Math.exp(-(((t - 12) / 10) ** 2));
    const dev = clamp(0.3 + 0.22 * clusterDev[cl] + 0.3 * climateScore + rng.gauss(0, 0.13), 0.08, 0.97);
    let gov: Government;
    const r = rng.next();
    if (dev > 0.62) gov = r < 0.35 ? Government.Democracy : r < 0.6 ? Government.FederalRepublic : r < 0.82 ? Government.ConstitutionalMonarchy : r < 0.94 ? Government.PresidentialRepublic : Government.OneParty;
    else if (dev > 0.38) gov = r < 0.4 ? Government.PresidentialRepublic : r < 0.55 ? Government.Democracy : r < 0.72 ? Government.OneParty : r < 0.84 ? Government.AbsoluteMonarchy : r < 0.93 ? Government.Theocracy : Government.MilitaryJunta;
    else gov = r < 0.3 ? Government.PresidentialRepublic : r < 0.5 ? Government.MilitaryJunta : r < 0.68 ? Government.OneParty : r < 0.84 ? Government.AbsoluteMonarchy : Government.Theocracy;
    const demo = isDemocratic(gov);
    const ideology = clamp((demo ? 0.45 : -0.45) + rng.gauss(0, 0.28), -1, 1);
    const aggression = clamp(rng.range(0.1, 0.6) + (demo ? -0.08 : 0.18) + (gov === Government.MilitaryJunta ? 0.2 : 0), 0.02, 0.98);
    const { name, adjective } = names.nationRoot(culture, rng);
    const formal = formalName(name, gov, rng, hexCount[id]);
    const islandFactor = hexCount[id] > 0 ? coastCount[id] / hexCount[id] : 0;
    nations.push({
      id,
      code: name.slice(0, 3).toUpperCase(),
      name,
      formalName: formal,
      adjective,
      culture,
      capitalHex: cap,
      capitalName: '',
      color: colours[id],
      flag: makeFlag(rng, colours[id]),
      government: gov,
      leaderTitle: isDemocratic(gov) ? 'President' : 'Leader',
      leaderName: names.person(culture, rng),
      population: 0,
      gdp: 0,
      activeMilitary: 0,
      defenseBudget: 2,
      techLevel: dev,
      nuclear: false,
      navyRating: 3,
      airRating: 3,
      development: dev,
      aggression,
      ideology,
      blocs: [],
      militarism: clamp(rng.range(0.15, 0.7) + (demo ? -0.1 : 0.15), 0.05, 1),
      navalFocus: clamp(islandFactor * 1.6 + rng.range(-0.1, 0.2), 0, 1),
      hexCount: hexCount[id],
    });
  }

  // --- Alliance blocs --------------------------------------------------------
  const power = nations.map((nt) => nt.hexCount * (0.3 + nt.development) * (0.6 + nt.militarism));
  const blocs: BlocSeed[] = [];
  const usedNames = new Set<string>();
  const demos = nations.filter((x) => isDemocratic(x.government)).sort((a, b) => power[b.id] - power[a.id]);
  const autos = nations.filter((x) => !isDemocratic(x.government)).sort((a, b) => power[b.id] - power[a.id]);
  const leaders: NationSeed[] = [];
  if (demos.length) leaders.push(demos[0]);
  if (autos.length) leaders.push(autos[0]);
  if (N >= 24) {
    const third = [...demos.slice(1), ...autos.slice(1)].sort((a, b) => power[b.id] - power[a.id])
      .find((x) => leaders.every((l) => grid.distance(l.capitalHex, x.capitalHex) > 40));
    if (third) leaders.push(third);
  }
  const blocColours = ['#3f7fd6', '#c8412f', '#d9a520'];
  leaders.forEach((l, i) => {
    const bn = blocName(rng, usedNames);
    blocs.push({ id: i, code: bn.short, name: bn.name, short: bn.short, color: blocColours[i], military: true, leader: l.id });
    l.blocs = [i];
  });
  const maxDist = Math.hypot(grid.worldW, grid.worldH);
  for (const nt of nations) {
    if (nt.blocs.length) continue;
    let bestB = -1, bestS = 0.7;
    for (const b of blocs) {
      const l = nations[b.leader];
      const ideoSim = 1 - Math.abs(l.ideology - nt.ideology) / 2;
      const prox = 1 - grid.worldDist(l.capitalHex, nt.capitalHex) / maxDist;
      const s = ideoSim * 0.65 + prox * 0.35 + rng.range(-0.12, 0.12);
      if (s > bestS) { bestS = s; bestB = b.id; }
    }
    if (bestB >= 0) nt.blocs = [bestB];
  }

  // --- Initial relations and territorial claims -------------------------------
  const relations = new Int8Array(N * N);
  const rival = new Set<string>();
  for (const nt of nations) {
    if (adjacency[nt.id].size && rng.chance(0.32 + nt.aggression * 0.3)) {
      const opts = [...adjacency[nt.id]];
      const r2 = rng.pick(opts);
      rival.add(`${Math.min(nt.id, r2)}:${Math.max(nt.id, r2)}`);
    }
  }
  for (let a = 0; a < N; a++) {
    relations[a * N + a] = 100;
    for (let b = a + 1; b < N; b++) {
      const A = nations[a], B = nations[b];
      let r = 8 + 34 * (1 - Math.abs(A.ideology - B.ideology)) - 16;
      const ba = A.blocs[0] ?? -1, bb = B.blocs[0] ?? -1;
      if (ba >= 0 && ba === bb) r += 42;
      else if (ba >= 0 && bb >= 0) r -= 32;
      if (adjacency[a].has(b)) r -= 8;
      if (A.culture === B.culture) r += 14;
      if (rival.has(`${a}:${b}`)) r -= 48;
      r += rng.range(-12, 12);
      const v = Math.round(clamp(r, -100, 100));
      relations[a * N + b] = v;
      relations[b * N + a] = v;
    }
  }
  const claims: Int32Array[] = nations.map(() => new Int32Array(0));
  for (const key of rival) {
    const [a, b] = key.split(':').map(Number);
    // The more aggressive side claims border territory of the other.
    const [cl, vi] = nations[a].aggression >= nations[b].aggression ? [a, b] : [b, a];
    const list: number[] = [];
    for (let i = 0; i < n; i++) {
      if (owner[i] !== vi + 1) continue;
      let near = false;
      grid.forRadius(i, 3, (m) => { if (owner[m] === cl + 1) near = true; });
      if (near) list.push(i);
    }
    claims[cl] = Int32Array.from([...claims[cl], ...list]);
  }

  return { owner, nations, blocs, relations, claims };
}

function formalName(name: string, gov: Government, rng: RNG, size: number): string {
  switch (gov) {
    case Government.Democracy: return rng.pick([`Republic of ${name}`, `Commonwealth of ${name}`, `${name}`, `Democratic Republic of ${name}`]);
    case Government.FederalRepublic: return size > 700 ? rng.pick([`Federation of ${name}`, `United States of ${name}`, `Federal Republic of ${name}`]) : `Federal Republic of ${name}`;
    case Government.ConstitutionalMonarchy: return rng.pick([`Kingdom of ${name}`, `Grand Duchy of ${name}`, `United Kingdom of ${name}`]);
    case Government.PresidentialRepublic: return rng.pick([`Republic of ${name}`, `${name} Republic`, `State of ${name}`]);
    case Government.OneParty: return rng.pick([`People's Republic of ${name}`, `Socialist Republic of ${name}`, `${name} People's State`]);
    case Government.MilitaryJunta: return rng.pick([`${name} National Council`, `State of ${name}`, `${name} Military Directorate`]);
    case Government.AbsoluteMonarchy: return rng.pick([`Kingdom of ${name}`, `Sultanate of ${name}`, `Emirate of ${name}`, `Empire of ${name}`]);
    case Government.Theocracy: return rng.pick([`Holy Republic of ${name}`, `Divine State of ${name}`, `Sacred Union of ${name}`]);
  }
}
