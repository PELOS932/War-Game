/**
 * Scenario setup: turns WorldData (real-Earth or procedural) into the initial
 * GameState on 2030-01-01: nations with realistic budgets, cities, facilities
 * placed on deposits/terrain in proportion to GDP & endowment so the world
 * economy starts balanced, the initial order of battle derived from real
 * military statistics, and treaties from alliance blocs.
 */
import { HexGrid } from '../core/hex';
import { RNG, hashString } from '../core/rng';
import { NameGenerator } from '../worldgen/names';
import {
  Deposit, Government, Terrain, isDemocratic, isWaterTerrain, latitudeAt,
  type NationSeed, type WorldData,
} from '../worldgen/types';
import {
  CATEGORY_CLASS, FacilityType, RESOURCE_COUNT, Resource, UnitCategory, UnitClass,
  type City, type Department, type Facility, type GameState, type Minister, type MinisterRole, type Nation,
  type NationId, type Spending, type Taxes, type TradePolicy, type Unit, type UnitDesign,
} from './types';
import { UNIT_DESIGNS, designId } from './data/units';
import { FACILITY_DEFS, airbaseCapacity } from './data/facilities';
import { TECHS, initialTechs } from './data/techs';
import {
  AGRI_EXPORT, AMPHIBS, ARMS_INDUSTRY, CARRIERS, CRUISERS, HEAVY_INDUSTRY, HYDRO_POWER, MANUFACTURING,
  NUCLEAR_POWER, RENEWABLE_POWER, SHIP_PREFIX, SUBMARINES, realStats,
} from './data/realworld';
import { BASE_PRICE, TARGET_STOCK_DAYS, createMarket } from './market';
import { householdDemand, nominalTaxRate, socialSpending, totalSpending, compliance } from './economy';
import { computeTechMods } from './research';
import { clamp, ordinal } from './core';

const R = Resource;
const F = FacilityType;
const C = UnitCategory;

export const DEPARTMENTS: Department[] = ['economy', 'trade', 'research', 'production', 'diplomacy', 'military'];
const MINISTER_ROLES: MinisterRole[] = ['head', 'defense', 'foreign', 'finance', 'economy', 'research', 'interior', 'intelligence'];

interface NationPrep {
  seed: NationSeed;
  hexes: number[]; // owned land hexes
  coastHexes: number[];
  cities: City[];
  neighbours: Map<NationId, number[]>; // neighbour -> my border hexes facing it
  plan: PlannedUnit[];
  demand: Float64Array;
  cap: Float64Array; // planned production capacity per resource
  powerMix: { nuclear: number; hydro: number; renew: number; fossil: number };
}

interface PlannedUnit { design: string; cat: UnitCategory }

export function buildScenario(world: WorldData, playerNation: NationId, seed: number): GameState {
  const s = world.settings;
  const grid = new HexGrid(s.cols, s.rows);
  const rng = new RNG((seed ^ 0x2030) >>> 0);
  const names = new NameGenerator();
  const N = world.nations.length;
  const T = world.hexTerrain;

  // ---- territory ------------------------------------------------------------
  const prep: NationPrep[] = world.nations.map((sd) => ({
    seed: sd, hexes: [], coastHexes: [], cities: [], neighbours: new Map(), plan: [],
    demand: new Float64Array(RESOURCE_COUNT), cap: new Float64Array(RESOURCE_COUNT),
    powerMix: { nuclear: 0, hydro: 0, renew: 0, fossil: 1 },
  }));
  const nb = grid.neighbours;
  for (let i = 0; i < grid.count; i++) {
    const o = world.hexOwner[i];
    if (!o || isWaterTerrain(T[i])) continue;
    const p = prep[o - 1];
    if (!p) continue;
    p.hexes.push(i);
    if (world.hexCoast[i]) p.coastHexes.push(i);
    for (let d = 0; d < 6; d++) {
      const m = nb[i * 6 + d];
      if (m < 0) continue;
      const om = world.hexOwner[m];
      if (om && om !== o && !isWaterTerrain(T[m])) {
        let list = p.neighbours.get(om - 1);
        if (!list) { list = []; p.neighbours.set(om - 1, list); }
        if (list[list.length - 1] !== i) list.push(i);
      }
    }
  }

  // ---- designs / techs / defs ---------------------------------------------------
  const designs = new Map<string, UnitDesign>(UNIT_DESIGNS.map((d) => [d.id, d]));
  const techs = new Map(TECHS.map((t) => [t.id, t]));

  // ---- nations -------------------------------------------------------------------
  const nations: Nation[] = prep.map((p) => makeNation(p, world, techs, names, rng, playerNation));

  // ---- cities --------------------------------------------------------------------
  const cities: City[] = world.cities.map((c) => ({
    id: c.id, name: c.name, hex: c.hex, urbanHexes: c.urbanHexes.slice(), population: c.population,
    capital: c.capital, port: c.port, originalNation: c.nation, damage: 0, x: c.x, z: c.z,
  }));
  for (const c of cities) {
    const owner = world.hexOwner[c.hex] - 1;
    const p = prep[owner] ?? prep[c.originalNation];
    if (p) p.cities.push(c);
  }
  for (const p of prep) p.cities.sort((a, b) => b.population - a.population);
  for (const n of nations) {
    const p = prep[n.id];
    const cap = p.cities.find((c) => c.capital) ?? p.cities[0];
    if (cap) { cap.capital = true; n.capitalCity = cap.id; }
    for (const c of p.cities) if (c !== cap) c.capital = false;
  }

  const state: GameState = {
    world, grid, hour: 0, speed: 0, playerNation, nations, cities,
    units: new Map(), facilities: new Map(), designs, techs, facilityDefs: FACILITY_DEFS,
    hexOwner: Uint16Array.from(world.hexOwner), hexCore: Uint16Array.from(world.hexOwner),
    hexControlChangedHour: new Float32Array(grid.count).fill(-1e6),
    ownerVersion: 0, ownerDirty: [], facilityVersion: 0, hexFacilities: new Map(),
    relations: new Float32Array(N * N), treaties: [], wars: [], proposals: [], market: createMarket(),
    news: [], nextId: 1, gameOver: null, seed, supply: new Uint8Array(grid.count),
    stats: { hexesCaptured: 0, citiesCaptured: 0, unitsDestroyed: 0, unitsBuilt: 0, facilitiesBuilt: 0, warsDeclared: 0, peaceTreaties: 0, treatiesSigned: 0 },
  };
  for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) state.relations[a * N + b] = a === b ? 100 : world.relations[a * N + b] ?? 0;

  // ---- order of battle (composition) ------------------------------------------------
  for (const n of nations) prep[n.id].plan = planForces(n, prep[n.id], designs, techs, rng);

  // ---- economy capacity plan & facilities --------------------------------------------
  planCapacity(state, prep, world, grid);
  placeFacilities(state, prep, world, grid, rng);

  // ---- units positioned ---------------------------------------------------------------
  const hostile = (a: NationId, b: NationId) => state.relations[a * N + b] <= -25 || world.claims[a]?.length && claimsAgainst(world, a, b);
  for (const n of nations) placeForces(state, n, prep[n.id], hostile, names, rng);

  // ---- treaties -------------------------------------------------------------------------
  setupTreaties(state, prep);

  // ---- finances calibration ---------------------------------------------------------------
  for (const n of nations) calibrateNation(state, n, prep[n.id]);
  return state;
}

function claimsAgainst(world: WorldData, a: NationId, b: NationId): boolean {
  const list = world.claims[a];
  if (!list) return false;
  for (let i = 0; i < list.length; i++) if (world.hexOwner[list[i]] - 1 === b) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Nations
// ---------------------------------------------------------------------------
function makeNation(p: NationPrep, world: WorldData, techs: Map<string, import('./types').TechDef>, names: NameGenerator, rng: RNG, player: NationId): Nation {
  const sd = p.seed;
  const h = hashString(sd.code + sd.name) / 4294967296;
  const h2 = hashString(sd.name + 'x') / 4294967296;
  // Fallbacks for procedural worlds without real statistics.
  let pop = sd.population;
  if (!(pop > 0)) {
    let sum = 0;
    for (const i of p.hexes) sum += world.hexPopulation[i];
    pop = Math.max(0.2, sum / 1000);
  }
  const dev = clamp(sd.development || 0.3, 0.02, 1);
  let gdp = sd.gdp;
  if (!(gdp > 0)) gdp = pop * (1.5 + 60 * dev * dev);
  let active = sd.activeMilitary;
  if (!(active > 0) && sd.gdp <= 0) active = pop * 1000 * (0.002 + 0.006 * sd.militarism);
  const defenseBudget = sd.defenseBudget > 0 ? sd.defenseBudget : 1.5 + 2.5 * sd.militarism;
  const techLevel = clamp(sd.techLevel || dev, 0.05, 1);
  const gov = sd.government;
  const demo = isDemocratic(gov);
  const autoc = !demo;
  const rs = realStats(sd.code, dev, h);
  // --- spending (fractions of GDP) ---
  const spending: Spending = {
    health: 0.015 + 0.065 * dev + (demo ? 0.008 : 0),
    education: 0.025 + 0.025 * dev,
    infrastructure: 0.02 + 0.012 * (1 - dev),
    environment: 0.002 + 0.008 * dev,
    family: (0.003 + 0.015 * dev) * (demo ? 1 : 0.5),
    lawEnforcement: 0.01 + (autoc ? 0.006 : 0) + 0.004 * dev,
    culture: 0.002 + 0.004 * dev,
    socialAssistance: 0.015 + 0.13 * Math.pow(dev, 1.3) * (demo ? 1 : 0.6),
  };
  const taxes: Taxes = taxBase(gov);
  const researchBudget = clamp(0.0008 + 0.01 * Math.pow(techLevel, 2.5), 0.0005, 0.012);
  const literacy = clamp(0.4 + 0.6 * Math.sqrt(dev) * 1.15, 0.3, 0.995);
  const known = initialTechs(techLevel, (id) => hashString(sd.code + id) / 4294967296);
  const approval = demo ? 38 + 18 * h2 : 55 + 20 * h2;
  const debtRatio = rs.debtRatio;
  const credit = clamp(25 + 70 * Math.pow(dev, 0.7) - 12 * Math.max(0, debtRatio - 1.0) + (sd.government === Government.AbsoluteMonarchy ? 8 : 0), 5, 98);
  const ministers: Minister[] = MINISTER_ROLES.map((role) => ({
    role,
    name: role === 'head' ? sd.leaderName : names.person(sd.culture % 10, rng),
    competence: clamp(0.3 + 0.45 * dev + rng.range(-0.15, 0.25), 0.1, 0.98),
    loyalty: clamp(rng.range(0.5, 1), 0, 1),
    ideology: clamp(sd.ideology + rng.range(-0.3, 0.3), -1, 1),
  }));
  const isPlayer = sd.id === player;
  const autonomy = Object.fromEntries(DEPARTMENTS.map((d) => [d, !isPlayer])) as Record<Department, boolean>;
  const policy: TradePolicy[] = Array.from({ length: RESOURCE_COUNT }, () => 'auto');
  const n: Nation = {
    id: sd.id, code: sd.code, name: sd.name, formalName: sd.formalName, adjective: sd.adjective,
    color: sd.color, flag: sd.flag, government: gov, leaderTitle: sd.leaderTitle, leaderName: sd.leaderName,
    culture: sd.culture, alive: p.hexes.length > 0 || world.cities.some((c) => c.nation === sd.id), isPlayer, capitalCity: -1,
    population: pop, gdp, gdpGrowth: rs.trendGrowth, treasury: gdp * (0.03 + 0.05 * h), debt: gdp * debtRatio,
    creditRating: credit, taxes, spending, militaryBudget: defenseBudget / 100, researchBudget,
    approval, unemployment: rs.unemployment, literacy, worldOpinion: clamp(50 + 12 * sd.ideology + (h - 0.5) * 10, 5, 95),
    inflation: 0.02 + 0.05 * (1 - dev) * h2, defcon: 5, techLevel, nuclear: sd.nuclear, development: dev,
    stock: new Float64Array(RESOURCE_COUNT), production: new Float64Array(RESOURCE_COUNT),
    consumption: new Float64Array(RESOURCE_COUNT), traded: new Float64Array(RESOURCE_COUNT), tradePolicy: policy,
    researchPoints: 0, knownTechs: known, researching: [], productionQueue: [], ministers, autonomy,
    aggression: sd.aggression, ideology: sd.ideology, militarism: sd.militarism, navalFocus: sd.navalFocus,
    blocs: sd.blocs.slice(), warWeariness: 0, history: [], income: {}, expenses: {},
    militaryFund: 0, costFactor: clamp(0.55 + 0.45 * Math.min(1, (gdp / pop) * 1000 / 50000), 0.5, 1.1),
    interestRate: rs.interest, techMods: computeTechMods(techs, known), lawOrder: clamp(45 + 35 * dev + (autoc ? 8 : 0), 10, 95),
    satisfaction: new Float64Array(RESOURCE_COUNT).fill(1), demand: new Float64Array(RESOURCE_COUNT),
    hexCount: p.hexes.length, cityCount: 0, unitCount: 0, power: 0,
    nextElectionDay: demo ? Math.floor(30 + h2 * 1400) : -1,
    laborForce: pop * 0.47, tradeBalance: 0, servicesIncome: 0, rally: 0, growthShock: 0,
    baseline: {
      approval, approvalOffset: 0, taxBurden: 0, social: 0, unemployment: rs.unemployment, debtRatio,
      creditRating: credit, literacy, trendGrowth: rs.trendGrowth, infrastructure: spending.infrastructure,
      education: spending.education, facilityJobs: 0, lawEnforcement: spending.lawEnforcement, gdp,
      inflation: 0, lawOrder: 0, goodsMult: 1,
    },
    gdpServices: gdp, gdpGoods: 0, upkeepFactor: 1, casualtiesToday: 0,
  };
  n.baseline.inflation = n.inflation;
  n.baseline.lawOrder = n.lawOrder;
  // Stash military stats for force planning.
  (n as NationExtra)._active = active;
  (n as NationExtra)._navy = sd.navyRating;
  (n as NationExtra)._air = sd.airRating;
  return n;
}

interface NationExtra extends Nation { _active?: number; _navy?: number; _air?: number }

function taxBase(g: Government): Taxes {
  switch (g) {
    case Government.Democracy: return { income: 0.34, corporate: 0.24, sales: 0.2 };
    case Government.FederalRepublic: return { income: 0.3, corporate: 0.22, sales: 0.15 };
    case Government.ConstitutionalMonarchy: return { income: 0.33, corporate: 0.22, sales: 0.2 };
    case Government.PresidentialRepublic: return { income: 0.26, corporate: 0.25, sales: 0.16 };
    case Government.OneParty: return { income: 0.2, corporate: 0.25, sales: 0.15 };
    case Government.MilitaryJunta: return { income: 0.18, corporate: 0.22, sales: 0.14 };
    case Government.AbsoluteMonarchy: return { income: 0.05, corporate: 0.15, sales: 0.08 };
    case Government.Theocracy: return { income: 0.18, corporate: 0.2, sales: 0.12 };
    default: return { income: 0.25, corporate: 0.22, sales: 0.15 };
  }
}

// ---------------------------------------------------------------------------
// Forces (composition)
// ---------------------------------------------------------------------------
function bestGen(n: Nation, cat: UnitCategory, designs: Map<string, UnitDesign>): number {
  let best = 1;
  for (let g = 2; g <= 4; g++) {
    const d = designs.get(designId(cat, g));
    if (d && (!d.requiresTech || n.knownTechs.has(d.requiresTech))) best = g;
  }
  return best;
}

function planForces(n: Nation, p: NationPrep, designs: Map<string, UnitDesign>, _techs: unknown, rng: RNG): PlannedUnit[] {
  const ex = n as NationExtra;
  const active = ex._active ?? 0;
  const navy = ex._navy ?? 0;
  const air = ex._air ?? 0;
  const tl = n.techLevel;
  const out: PlannedUnit[] = [];
  if (!n.alive) return out;
  const add = (cat: UnitCategory, count: number) => {
    const best = bestGen(n, cat, designs);
    for (let i = 0; i < count; i++) {
      const r = rng.next();
      const g = r < 0.55 ? best : r < 0.9 ? best - 1 : best - 2;
      out.push({ design: designId(cat, Math.max(1, g)), cat });
    }
  };
  // ---- land ----
  const L = active > 0 ? Math.min(110, Math.round(2 + 11 * Math.pow(active / 100, 0.7))) : 0;
  const w: [UnitCategory, number][] = [
    [C.Infantry, 0.42 - 0.15 * tl], [C.Mechanized, 0.08 + 0.14 * tl], [C.Armor, 0.06 + 0.08 * tl],
    [C.Artillery, 0.09], [C.RocketArtillery, 0.03 + 0.03 * tl], [C.AirDefense, 0.05 + 0.04 * tl],
    [C.Recon, 0.05], [C.SpecialForces, 0.03 + 0.03 * tl], [C.Engineers, 0.04],
    [C.MissileLauncher, (n.nuclear || n.militarism > 0.6) && L >= 15 ? 0.03 : 0],
  ];
  allocate(L, w).forEach((cnt, i) => add(w[i][0], cnt));
  if (L > 0 && !out.some((u) => u.cat === C.Infantry)) add(C.Infantry, 1);
  // ---- air ----
  let A = air > 0 ? Math.round(0.9 * Math.pow(air, 1.65)) : 0;
  if (active < 20) A = Math.min(A, 3);
  if (A > 0) {
    const bombers = n.code === 'USA' ? 4 : n.code === 'RUS' || n.code === 'CHN' ? 3 : 0;
    const wa: [UnitCategory, number][] = [
      [C.Fighter, 0.2], [C.Multirole, 0.34], [C.Strike, tl >= 0.4 ? 0.12 : 0.04], [C.Helicopter, 0.16],
      [C.AirTransport, 0.08], [C.Drone, tl >= 0.3 ? 0.1 : 0.02],
    ];
    allocate(Math.max(1, A - bombers), wa).forEach((cnt, i) => add(wa[i][0], cnt));
    add(C.Bomber, bombers);
  }
  // ---- navy (needs a coast) ----
  const hasPort = p.cities.some((c) => c.port) || p.coastHexes.length > 0;
  if (navy > 0 && hasPort) {
    const major = Math.round(0.55 * Math.pow(navy, 1.75));
    const destroyerShare = 0.35 + 0.3 * tl;
    const dd = Math.round(major * destroyerShare);
    add(C.Destroyer, dd);
    add(C.Frigate, Math.max(0, major - dd));
    add(C.Cruiser, CRUISERS[n.code] ?? 0);
    add(C.Carrier, CARRIERS[n.code] ?? (navy >= 9 ? 1 : 0));
    add(C.Amphibious, AMPHIBS[n.code] ?? Math.round(major * 0.06));
    const subs = SUBMARINES[n.code] !== undefined ? Math.round(SUBMARINES[n.code] * 0.6) : Math.round(major * 0.2);
    add(C.Submarine, subs);
    add(C.PatrolBoat, Math.round(1 + navy * 0.8));
  }
  return out;
}

function allocate(total: number, weights: [unknown, number][]): number[] {
  const sum = weights.reduce((a, w) => a + Math.max(0, w[1]), 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (Math.max(0, w[1]) / sum) * total);
  const out = raw.map((r) => Math.floor(r));
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0 && k < order.length; k++, left--) out[order[k][1]]++;
  return out;
}

// ---------------------------------------------------------------------------
// Economy capacity planning
// ---------------------------------------------------------------------------
function perOutput(type: FacilityType): Float64Array {
  const d = FACILITY_DEFS[type];
  const out = new Float64Array(RESOURCE_COUNT);
  for (const k in d.inputs) out[+k] = (d.inputs[+k as Resource] ?? 0) / Math.max(1e-9, d.output || 1);
  return out;
}

interface Endowment {
  agri: number; oil: number; coal: number; ore: number; uranium: number; timber: number; rubber: number; hydro: number;
}

/** Offshore gas hexes attached to the nearest nation (by coast). */
let offshoreOwner: Map<number, NationId> = new Map();

function computeOffshore(world: WorldData, grid: HexGrid): Map<number, NationId> {
  const res = new Map<number, NationId>();
  for (let i = 0; i < grid.count; i++) {
    if (world.hexDeposit[i] !== Deposit.Gas || !isWaterTerrain(world.hexTerrain[i])) continue;
    let best = -1, bestD = 99;
    grid.forRadius(i, 4, (h, d) => {
      if (d < bestD && world.hexOwner[h] && !isWaterTerrain(world.hexTerrain[h])) { bestD = d; best = world.hexOwner[h] - 1; }
    });
    if (best >= 0) res.set(i, best);
  }
  return res;
}

function endowment(p: NationPrep, world: WorldData): Endowment {
  const e: Endowment = { agri: 0, oil: 0, coal: 0, ore: 0, uranium: 0, timber: 0, rubber: 0, hydro: 0 };
  const T = world.hexTerrain;
  const s = world.settings;
  for (const i of p.hexes) {
    const t = T[i];
    const pr = world.hexPrecip[i];
    const wet = clamp((pr - 200) / 500, 0, 1);
    e.agri += agriWeight(t) * (0.3 + 0.7 * wet);
    const dep = world.hexDeposit[i], ds = world.hexDepositSize[i];
    if (dep === Deposit.Oil) e.oil += ds;
    else if (dep === Deposit.Coal) e.coal += ds;
    else if (dep === Deposit.Ore) e.ore += ds;
    else if (dep === Deposit.Uranium) e.uranium += ds;
    const forest = world.hexForest[i] / 255;
    if (t === Terrain.Forest || t === Terrain.Jungle) e.timber += 0.5 + forest;
    else e.timber += forest * 0.3;
    const lat = Math.abs(latitudeAt(1.5 * Math.floor(i / s.cols) + 1, s));
    if ((t === Terrain.Jungle || t === Terrain.Forest) && lat < 20 && world.hexTemperature[i] > 21) e.rubber += 1;
    if (world.hexRiverEdges[i] && (t === Terrain.Hills || t === Terrain.Mountains)) e.hydro += 1;
  }
  for (const [hex, owner] of offshoreOwner) if (owner === p.seed.id) e.oil += world.hexDepositSize[hex] * 0.8;
  return e;
}

function agriWeight(t: number): number {
  switch (t) {
    case Terrain.Farmland: return 3;
    case Terrain.Plains: return 1.5;
    case Terrain.Hills: return 0.5;
    case Terrain.Forest: return 0.3;
    case Terrain.Jungle: return 0.2;
    case Terrain.Desert: return 0.05;
    case Terrain.Marsh: return 0.3;
    case Terrain.Tundra: return 0.03;
    default: return 0;
  }
}

function planCapacity(state: GameState, prep: NationPrep[], world: WorldData, grid: HexGrid): void {
  offshoreOwner = computeOffshore(world, grid);
  const nations = state.nations.filter((n) => n.alive);
  const designs = state.designs;
  const sum = (f: (n: Nation) => number) => nations.reduce((a, n) => a + f(n), 0);
  for (const n of nations) householdDemand(n, prep[n.id].demand);
  const D = (n: Nation, r: Resource) => prep[n.id].demand[r];
  const cap = (n: Nation) => prep[n.id].cap;
  const coef = {
    cg: perOutput(F.ConsumerFactory), ig: perOutput(F.IndustrialPlant), mg: perOutput(F.MilitaryFactory),
    farm: perOutput(F.Farm), fossil: FACILITY_DEFS[F.PowerPlant].inputs,
  };
  // Consumer goods.
  const Wcg = sum((n) => D(n, R.ConsumerGoods)) * 1.03;
  const mW = (n: Nation) => n.gdp * (MANUFACTURING[n.code] ?? 0.75);
  const sumM = sum(mW);
  for (const n of nations) cap(n)[R.ConsumerGoods] = Wcg * (0.35 * D(n, R.ConsumerGoods) / (Wcg / 1.03) + 0.65 * mW(n) / sumM);
  // Military goods: maintenance of the planned OOB + procurement.
  const idleMG = (n: Nation) => prep[n.id].plan.reduce((a, u) => a + designs.get(u.design)!.militaryGoodsCost * 0.0004, 0);
  const Wmg = sum(idleMG) * 3.5;
  const aW = (n: Nation) => {
    const w = n.gdp * n.militaryBudget * (ARMS_INDUSTRY[n.code] ?? 0.25 * n.development);
    return w;
  };
  const sumA = sum(aW);
  for (const n of nations) {
    const share = sumA > 0 ? aW(n) / sumA : 0;
    cap(n)[R.MilitaryGoods] = share > 0.002 ? Wmg * share : 0;
  }
  // Industry goods.
  const sumCG = sum((n) => cap(n)[R.ConsumerGoods]);
  const sumMG = sum((n) => cap(n)[R.MilitaryGoods]);
  const Dig = sum((n) => D(n, R.IndustryGoods));
  const Wig = (Dig * 1.03 + coef.cg[R.IndustryGoods] * sumCG + coef.mg[R.IndustryGoods] * sumMG) * 1.04;
  const hW = (n: Nation) => n.gdp * (HEAVY_INDUSTRY[n.code] ?? 0.7);
  const sumH = sum(hW);
  for (const n of nations) cap(n)[R.IndustryGoods] = Wig * (0.3 * D(n, R.IndustryGoods) / Math.max(1e-9, Dig) + 0.7 * hW(n) / sumH);
  // Electric power per nation (self-sufficient) and its mix.
  const labPower = FACILITY_DEFS[F.ResearchLab].inputs[R.ElectricPower] ?? 0;
  const endow = new Map<NationId, Endowment>();
  for (const n of nations) endow.set(n.id, endowment(prep[n.id], world));
  let fossilLevels = 0, nuclearLevels = 0;
  for (const n of nations) {
    const c = cap(n);
    const need = (D(n, R.ElectricPower) * 1.06 + coef.cg[R.ElectricPower] * c[R.ConsumerGoods] + coef.ig[R.ElectricPower] * c[R.IndustryGoods]
      + coef.mg[R.ElectricPower] * c[R.MilitaryGoods] + labPower * researchLabLevels(n) + 2) * 1.04;
    c[R.ElectricPower] = need;
    const e = endow.get(n.id)!;
    let nuc = NUCLEAR_POWER[n.code] ?? (n.nuclear && n.development > 0.5 ? 0.1 : 0);
    let hyd = HYDRO_POWER[n.code] ?? Math.min(0.5, (e.hydro / Math.max(1, prep[n.id].hexes.length)) * 4);
    const ren = RENEWABLE_POWER[n.code] ?? 0.03 + 0.12 * n.development;
    if (need * nuc < 40 * 0.6) nuc = 0;
    if (need * hyd < 15 * 0.5 || e.hydro === 0 && HYDRO_POWER[n.code] === undefined) hyd = HYDRO_POWER[n.code] !== undefined ? hyd : 0;
    const fossil = Math.max(0.05, 1 - nuc - hyd - ren);
    const tot = nuc + hyd + ren + fossil;
    prep[n.id].powerMix = { nuclear: nuc / tot, hydro: hyd / tot, renew: ren / tot, fossil: fossil / tot };
    fossilLevels += (need * fossil / tot) / FACILITY_DEFS[F.PowerPlant].output;
    nuclearLevels += (need * nuc / tot) / FACILITY_DEFS[F.NuclearPlant].output;
  }
  // Raw materials, world totals.
  const Dagri = sum((n) => D(n, R.Agriculture));
  const Wagri = (Dagri + coef.cg[R.Agriculture] * sumCG) * 1.03;
  const sumIG = sum((n) => cap(n)[R.IndustryGoods]);
  const unitFuel = sum((n) => prep[n.id].plan.length * 0.02);
  const Wpet = (sum((n) => D(n, R.Petroleum)) + (coef.fossil[R.Petroleum] ?? 0) * fossilLevels + coef.ig[R.Petroleum] * sumIG
    + coef.mg[R.Petroleum] * sumMG + coef.farm[R.Petroleum] * Wagri + unitFuel) * 1.06;
  const Wcoal = (sum((n) => D(n, R.Coal)) + (coef.fossil[R.Coal] ?? 0) * fossilLevels + coef.ig[R.Coal] * sumIG) * 1.04;
  const Wore = (coef.ig[R.MetalOre] * sumIG + coef.mg[R.MetalOre] * sumMG) * 1.04;
  const Wu = (FACILITY_DEFS[F.NuclearPlant].inputs[R.Uranium] ?? 0) * nuclearLevels * 1.05;
  const Wtim = (sum((n) => D(n, R.Timber)) + coef.cg[R.Timber] * sumCG) * 1.03;
  const Wrub = (sum((n) => D(n, R.Rubber)) + coef.cg[R.Rubber] * sumCG) * 1.03;
  const agriW = (n: Nation) => endow.get(n.id)!.agri * (AGRI_EXPORT[n.code] ?? 1);
  const sumAgriW = sum(agriW);
  for (const n of nations) {
    cap(n)[R.Agriculture] = Wagri * (0.5 * D(n, R.Agriculture) / Dagri + 0.5 * (sumAgriW > 0 ? agriW(n) / sumAgriW : D(n, R.Agriculture) / Dagri));
  }
  const distribute = (r: Resource, W: number, weight: (n: Nation) => number, fallback: (n: Nation) => number) => {
    let total = sum(weight);
    let wf = weight;
    if (total <= 0) { wf = fallback; total = sum(fallback); }
    if (total <= 0) return;
    for (const n of nations) cap(n)[r] = (W * wf(n)) / total;
  };
  const byGdp = (n: Nation) => n.gdp;
  distribute(R.Petroleum, Wpet, (n) => endow.get(n.id)!.oil, byGdp);
  distribute(R.Coal, Wcoal, (n) => endow.get(n.id)!.coal, byGdp);
  distribute(R.MetalOre, Wore, (n) => endow.get(n.id)!.ore, byGdp);
  distribute(R.Uranium, Wu, (n) => endow.get(n.id)!.uranium, (n) => (n.nuclear ? n.gdp : 0));
  distribute(R.Timber, Wtim, (n) => endow.get(n.id)!.timber, byGdp);
  distribute(R.Rubber, Wrub, (n) => endow.get(n.id)!.rubber, (n) => endow.get(n.id)!.timber);
}

function researchLabLevels(n: Nation): number {
  return Math.round((n.researchBudget * n.gdp) / 6);
}

// ---------------------------------------------------------------------------
// Facility placement
// ---------------------------------------------------------------------------
function newFacility(state: GameState, type: FacilityType, hex: number, level: number, nation: NationId): Facility {
  const grid = state.grid;
  const list = state.hexFacilities.get(hex);
  const slot = list ? list.length : 0;
  const cityHex = state.world.hexCity[hex] >= 0;
  const ang = slot * 2.39996 + type * 0.7 + (hex % 7) * 0.4;
  const rad = (cityHex ? 0.5 : slot === 0 ? 0.15 : 0.45) + 0.08 * (slot % 3);
  const f: Facility = {
    id: state.nextId++, type, hex, level: Math.max(1, Math.min(FACILITY_DEFS[type].maxLevel, level)), damage: 0,
    constructionDaysLeft: 0, x: grid.cx[hex] + Math.cos(ang) * rad, z: grid.cz[hex] + Math.sin(ang) * rad,
    nation, efficiency: 1, constructionTotal: 0, upgradeDaysLeft: 0,
  };
  state.facilities.set(f.id, f);
  if (list) list.push(f.id);
  else state.hexFacilities.set(hex, [f.id]);
  return f;
}

/** Spread `levels` of a facility type over candidate hexes (best first). */
function placeLevels(state: GameState, n: Nation, type: FacilityType, levelsF: number, candidates: number[], perFacility = 3): number {
  if (!(levelsF >= 0.4) || candidates.length === 0) return 0;
  let levels = Math.max(1, Math.round(levelsF));
  const maxL = FACILITY_DEFS[type].maxLevel;
  const per = Math.min(maxL, perFacility);
  const nFac = Math.max(1, Math.ceil(levels / per));
  const placed = levels;
  for (let k = 0; k < nFac && levels > 0; k++) {
    const remainingFac = nFac - k;
    const lvl = Math.min(maxL, Math.ceil(levels / remainingFac));
    newFacility(state, type, candidates[k % candidates.length], lvl, n.id);
    levels -= lvl;
  }
  return placed;
}

function placeFacilities(state: GameState, prep: NationPrep[], world: WorldData, grid: HexGrid, rng: RNG): void {
  const T = world.hexTerrain;
  const nb = grid.neighbours;
  const jitter = (h: number) => 0.7 + 0.6 * ((Math.imul(h ^ 0x9e37, 2654435761) >>> 0) / 4294967296);
  const offshoreByNation = new Map<NationId, number[]>();
  for (const [hex, owner] of offshoreOwner) {
    let l = offshoreByNation.get(owner);
    if (!l) { l = []; offshoreByNation.set(owner, l); }
    l.push(hex);
  }
  for (const n of state.nations) {
    if (!n.alive) continue;
    const p = prep[n.id];
    const cap = p.cap;
    const cityList = p.cities;
    const urban: number[] = [];
    for (const c of cityList) for (const h of c.urbanHexes) if (world.hexOwner[h] - 1 === n.id) urban.push(h);
    if (!urban.length && cityList.length) urban.push(cityList[0].hex);
    const ring: number[] = [];
    const seen = new Set<number>();
    for (const c of cityList) for (const h of c.urbanHexes) for (let d = 0; d < 6; d++) {
      const m = nb[h * 6 + d];
      if (m >= 0 && !seen.has(m) && world.hexOwner[m] - 1 === n.id && !isWaterTerrain(T[m]) && world.hexCity[m] < 0) { seen.add(m); ring.push(m); }
    }
    const landFallback = p.hexes.length ? p.hexes : urban;
    const nearCity = ring.length ? ring : landFallback;
    const sortBy = (list: number[], w: (h: number) => number) => list.map((h) => [w(h) * jitter(h), h]).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
    const deposits = (dep: Deposit) => sortBy(p.hexes.filter((h) => world.hexDeposit[h] === dep), (h) => world.hexDepositSize[h] + 0.1);
    // Agriculture.
    const farms = sortBy(p.hexes.filter((h) => world.hexCity[h] < 0), (h) => agriWeight(T[h]) * (0.3 + 0.7 * clamp((world.hexPrecip[h] - 200) / 500, 0, 1)) * (1 + Math.min(3, world.hexPopulation[h] / 200)));
    placeLevels(state, n, F.Farm, cap[R.Agriculture] / FACILITY_DEFS[F.Farm].output, farms.length ? farms : landFallback, 4);
    // Oil: onshore + offshore split by deposit size.
    const onshore = deposits(Deposit.Oil);
    const offshore = (offshoreByNation.get(n.id) ?? []).sort((a, b) => world.hexDepositSize[b] - world.hexDepositSize[a]);
    const onW = onshore.reduce((a, h) => a + world.hexDepositSize[h], 0);
    const offW = offshore.reduce((a, h) => a + world.hexDepositSize[h] * 0.8, 0);
    const pet = cap[R.Petroleum];
    if (pet > 0) {
      if (onW + offW > 0) {
        placeLevels(state, n, F.OilWell, (pet * onW / (onW + offW)) / FACILITY_DEFS[F.OilWell].output, onshore, 4);
        placeLevels(state, n, F.OffshorePlatform, (pet * offW / (onW + offW)) / FACILITY_DEFS[F.OffshorePlatform].output, offshore, 4);
      } else {
        placeLevels(state, n, F.OilWell, pet / FACILITY_DEFS[F.OilWell].output, sortBy(p.hexes, (h) => (T[h] === Terrain.Desert || T[h] === Terrain.Plains ? 1 : 0.2)), 4);
      }
    }
    placeLevels(state, n, F.CoalMine, cap[R.Coal] / FACILITY_DEFS[F.CoalMine].output, deposits(Deposit.Coal).length ? deposits(Deposit.Coal) : sortBy(p.hexes, (h) => (T[h] === Terrain.Hills ? 1 : 0.2)), 4);
    placeLevels(state, n, F.OreMine, cap[R.MetalOre] / FACILITY_DEFS[F.OreMine].output, deposits(Deposit.Ore).length ? deposits(Deposit.Ore) : sortBy(p.hexes, (h) => (T[h] === Terrain.Mountains || T[h] === Terrain.Hills ? 1 : 0.1)), 4);
    placeLevels(state, n, F.UraniumMine, cap[R.Uranium] / FACILITY_DEFS[F.UraniumMine].output, deposits(Deposit.Uranium).length ? deposits(Deposit.Uranium) : sortBy(p.hexes, (h) => (T[h] === Terrain.Desert || T[h] === Terrain.Hills ? 1 : 0.1)), 4);
    const forests = sortBy(p.hexes, (h) => (T[h] === Terrain.Forest || T[h] === Terrain.Jungle ? 1 : 0.05) * (0.2 + world.hexForest[h] / 255));
    placeLevels(state, n, F.LumberMill, cap[R.Timber] / FACILITY_DEFS[F.LumberMill].output, forests.length ? forests : landFallback, 4);
    const tropical = sortBy(p.hexes, (h) => (T[h] === Terrain.Jungle ? 2 : T[h] === Terrain.Forest ? 1 : 0.1) * (world.hexTemperature[h] > 20 ? 1 : 0.05));
    placeLevels(state, n, F.Plantation, cap[R.Rubber] / FACILITY_DEFS[F.Plantation].output, tropical.length ? tropical : landFallback, 4);
    // Power.
    const mix = p.powerMix;
    const pw = cap[R.ElectricPower];
    const hydroSites = sortBy(p.hexes, (h) => (world.hexRiverEdges[h] ? 1 : 0) * (T[h] === Terrain.Mountains ? 3 : T[h] === Terrain.Hills ? 2 : 0.3));
    let fossilShare = mix.fossil;
    if (mix.hydro > 0 && !hydroSites.length) fossilShare += mix.hydro;
    else placeLevels(state, n, F.HydroDam, pw * mix.hydro / FACILITY_DEFS[F.HydroDam].output, hydroSites, 3);
    const coastalNear = sortBy(nearCity, (h) => (world.hexCoast[h] ? 2 : 1) * (world.hexRiverEdges[h] ? 1.3 : 1));
    placeLevels(state, n, F.NuclearPlant, pw * mix.nuclear / FACILITY_DEFS[F.NuclearPlant].output, coastalNear, 2);
    const openLand = sortBy(nearCity.concat(p.hexes.slice(0, 200)), (h) => (T[h] === Terrain.Plains || T[h] === Terrain.Desert || T[h] === Terrain.Hills ? 1.5 : 0.5));
    placeLevels(state, n, F.RenewablePlant, pw * mix.renew / FACILITY_DEFS[F.RenewablePlant].output, openLand, 4);
    placeLevels(state, n, F.PowerPlant, pw * fossilShare / FACILITY_DEFS[F.PowerPlant].output, nearCity, 4);
    // Industry in cities.
    placeLevels(state, n, F.ConsumerFactory, cap[R.ConsumerGoods] / FACILITY_DEFS[F.ConsumerFactory].output, urban.concat(nearCity), 4);
    placeLevels(state, n, F.IndustrialPlant, cap[R.IndustryGoods] / FACILITY_DEFS[F.IndustrialPlant].output, nearCity.concat(urban), 4);
    placeLevels(state, n, F.MilitaryFactory, cap[R.MilitaryGoods] / FACILITY_DEFS[F.MilitaryFactory].output, nearCity.concat(urban), 3);
    placeLevels(state, n, F.ResearchLab, researchLabLevels(n), urban, 5);
    // Military infrastructure.
    const plan = p.plan;
    const land = plan.filter((u) => CATEGORY_CLASS[u.cat] === UnitClass.Land).length;
    const air = plan.filter((u) => CATEGORY_CLASS[u.cat] === UnitClass.Air).length;
    const ships = plan.filter((u) => CATEGORY_CLASS[u.cat] === UnitClass.Naval).length;
    const cityHexes = cityList.filter((c) => world.hexOwner[c.hex] - 1 === n.id).map((c) => c.hex);
    if (land > 0 && cityHexes.length) {
      const nb2 = Math.min(cityHexes.length, clamp(Math.ceil(land / 12), 1, 8));
      for (let k = 0; k < nb2; k++) newFacility(state, F.Barracks, cityHexes[k], land > 40 ? 3 : land > 15 ? 2 : 1, n.id);
    }
    if (air > 0) {
      // Airbases at (or next to) the largest cities, spaced apart.
      const carrierWings = plan.filter((u) => u.cat === C.Carrier).length * 2;
      const landAir = air + 0; void carrierWings;
      const count = clamp(Math.ceil(landAir / 5), 1, 12);
      const sites: number[] = [];
      for (const c of cityList) {
        if (sites.length >= count) break;
        if (world.hexOwner[c.hex] - 1 !== n.id) continue;
        if (sites.some((s) => grid.distance(s, c.hex) < 3)) continue;
        let site = c.hex;
        for (let d = 0; d < 6; d++) {
          const m = nb[c.hex * 6 + d];
          if (m >= 0 && world.hexOwner[m] - 1 === n.id && !isWaterTerrain(T[m]) && world.hexCity[m] < 0 && T[m] !== Terrain.Mountains) { site = m; break; }
        }
        sites.push(site);
      }
      if (!sites.length && p.hexes.length) sites.push(cityHexes[0] ?? p.hexes[0]);
      const per = Math.ceil(landAir / Math.max(1, sites.length));
      const lvl = clamp(Math.ceil((per - 2) / 4), 1, 3);
      for (const s of sites) newFacility(state, F.Airbase, s, lvl, n.id);
      void airbaseCapacity;
    }
    if (ships > 0) {
      const ports = cityList.filter((c) => c.port && world.hexOwner[c.hex] - 1 === n.id);
      const count = clamp(Math.ceil(ships / 8), 1, 8);
      const sites: number[] = [];
      for (const c of ports) {
        if (sites.length >= count) break;
        const coastal = c.urbanHexes.find((h) => world.hexCoast[h] && world.hexOwner[h] - 1 === n.id) ?? (world.hexCoast[c.hex] ? c.hex : -1);
        if (coastal < 0 || sites.some((s) => grid.distance(s, coastal) < 3)) continue;
        sites.push(coastal);
      }
      if (!sites.length && p.coastHexes.length) sites.push(p.coastHexes[0]);
      for (const s of sites) newFacility(state, F.NavalBase, s, ships > 40 ? 3 : ships > 12 ? 2 : 1, n.id);
    }
    // Supply depots near the most threatened borders, radar, silos.
    const borders = [...p.neighbours.entries()].sort((a, b) => state.relations[n.id * state.nations.length + a[0]] - state.relations[n.id * state.nations.length + b[0]]);
    if (land >= 6) {
      const depots = Math.min(borders.length, 1 + (borders.length && state.relations[n.id * state.nations.length + borders[0][0]] < -20 ? 2 : 0));
      for (let k = 0; k < depots; k++) {
        const list = borders[k][1];
        const h = inland(list[Math.floor(list.length / 2)], n.id, world, grid, 2);
        newFacility(state, F.SupplyDepot, h, 2, n.id);
      }
      if (cityHexes.length) newFacility(state, F.SupplyDepot, cityHexes[0], 1, n.id);
    }
    if (n.techLevel >= 0.45 && air > 0) {
      const radars = clamp(1 + Math.round(((n as NationExtra)._air ?? 0) / 3), 1, 5);
      for (let k = 0; k < radars; k++) {
        const h = k === 0 || !borders.length ? (cityHexes[0] ?? p.hexes[0]) : borders[(k - 1) % borders.length][1][0];
        if (h !== undefined) newFacility(state, F.RadarStation, inland(h, n.id, world, grid, 1), 1 + (n.techLevel > 0.8 ? 1 : 0), n.id);
      }
    }
    if (n.nuclear && p.hexes.length > 20) {
      const silos = n.code === 'USA' || n.code === 'RUS' ? 3 : n.code === 'CHN' ? 2 : 1;
      const interior = sortBy(p.hexes, (h) => (world.hexCoast[h] ? 0.1 : 1) * (world.hexCity[h] < 0 ? 1 : 0) * (T[h] === Terrain.Plains || T[h] === Terrain.Desert || T[h] === Terrain.Tundra ? 1 : 0.3) * (1 / (1 + world.hexPopulation[h] / 50)));
      for (let k = 0; k < silos && k < interior.length; k++) newFacility(state, F.MissileSilo, interior[Math.floor((k * interior.length) / (silos + 1))], 1, n.id);
    }
  }
  void rng;
}

/** Walk up to `steps` hexes away from foreign territory (keeps depots/radars off the border line). */
function inland(hex: number, nation: NationId, world: WorldData, grid: HexGrid, steps: number): number {
  let cur = hex;
  for (let s = 0; s < steps; s++) {
    let best = cur, bestScore = foreignAdj(cur, nation, world, grid);
    for (let d = 0; d < 6; d++) {
      const m = grid.neighbours[cur * 6 + d];
      if (m < 0 || world.hexOwner[m] - 1 !== nation || isWaterTerrain(world.hexTerrain[m])) continue;
      const sc = foreignAdj(m, nation, world, grid);
      if (sc < bestScore) { bestScore = sc; best = m; }
    }
    cur = best;
  }
  return cur;
}

function foreignAdj(hex: number, nation: NationId, world: WorldData, grid: HexGrid): number {
  let c = 0;
  for (let d = 0; d < 6; d++) {
    const m = grid.neighbours[hex * 6 + d];
    if (m >= 0 && world.hexOwner[m] && world.hexOwner[m] - 1 !== nation) c++;
  }
  return c;
}

// ---------------------------------------------------------------------------
// Forces (placement)
// ---------------------------------------------------------------------------
const UNIT_LABEL: Record<UnitCategory, string> = {
  [C.Infantry]: 'Infantry Battalion', [C.Mechanized]: 'Mechanized Battalion', [C.Armor]: 'Tank Battalion',
  [C.Artillery]: 'Artillery Battalion', [C.RocketArtillery]: 'Rocket Artillery Battalion', [C.AirDefense]: 'Air Defense Battalion',
  [C.Recon]: 'Reconnaissance Squadron', [C.SpecialForces]: 'Special Forces Group', [C.Engineers]: 'Engineer Battalion',
  [C.MissileLauncher]: 'Missile Battalion', [C.Fighter]: 'Fighter Squadron', [C.Multirole]: 'Strike Fighter Squadron',
  [C.Strike]: 'Attack Squadron', [C.Bomber]: 'Bomb Squadron', [C.Helicopter]: 'Attack Helicopter Squadron',
  [C.AirTransport]: 'Airlift Squadron', [C.Drone]: 'UAV Squadron', [C.PatrolBoat]: 'Patrol Flotilla',
  [C.Frigate]: 'Frigate', [C.Destroyer]: 'Destroyer', [C.Cruiser]: 'Cruiser', [C.Carrier]: 'Carrier',
  [C.Submarine]: 'Submarine', [C.Amphibious]: 'Assault Ship',
};

/** Generates unit names per nation (ordinal land/air formations, named warships). */
export class UnitNamer {
  private counters = new Map<string, number>();
  private usedShips = new Set<string>();
  constructor(private names: NameGenerator, private rng: RNG) {}

  name(state: GameState, n: Nation, d: UnitDesign): string {
    const cat = d.category;
    const cls = CATEGORY_CLASS[cat];
    if (cls === UnitClass.Naval && cat !== C.PatrolBoat) {
      const prefix = SHIP_PREFIX[n.code] ?? '';
      for (let tries = 0; tries < 12; tries++) {
        let base: string;
        if (cat === C.Carrier || cat === C.Cruiser) base = this.names.person(n.culture % 10, this.rng).split(' ').pop()!;
        else {
          const own = state.cities.filter((c) => c.originalNation === n.id);
          base = own.length && this.rng.chance(0.75) ? this.rng.pick(own).name : this.names.place(n.culture % 10, this.rng);
        }
        const nm = `${prefix ? prefix + ' ' : ''}${base}`;
        const key = `${n.id}:${nm}`;
        if (!this.usedShips.has(key)) { this.usedShips.add(key); return nm; }
      }
    }
    const key = `${n.id}:${UNIT_LABEL[cat]}`;
    const k = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, k);
    return `${ordinal(k)} ${UNIT_LABEL[cat]}`;
  }

  /** Continue numbering after loading a save. */
  observe(n: Nation, cat: UnitCategory, name: string): void {
    const m = /^(\d+)/.exec(name);
    if (!m) { this.usedShips.add(`${n.id}:${name}`); return; }
    const key = `${n.id}:${UNIT_LABEL[cat]}`;
    this.counters.set(key, Math.max(this.counters.get(key) ?? 0, +m[1]));
  }
}

let namer: UnitNamer | null = null;

export function makeUnit(state: GameState, designIdStr: string, nation: NationId, hex: number, name: string): Unit {
  const d = state.designs.get(designIdStr)!;
  const grid = state.grid;
  return {
    id: state.nextId++, design: designIdStr, nation, name, hex, x: grid.cx[hex], z: grid.cz[hex], heading: 0,
    strength: 100, efficiency: 75, experience: 20, supply: 100, fuel: 100, entrenchment: 0, stance: 'defensive',
    order: { type: 'idle', targetHex: -1, targetUnit: -1 }, path: [], moveProgress: 0, inCombat: false,
    embarked: false, airborne: false, baseHex: d.cls === UnitClass.Air ? hex : -1, missionHours: 0, kills: 0,
    createdHour: state.hour, groupId: -1, carrier: -1, hidden: false, lastCombatHour: -1, airState: 'ready', airTimer: 0,
    blockedHours: 0,
  };
}

function placeForces(state: GameState, n: Nation, p: NationPrep, hostile: (a: NationId, b: NationId) => unknown, names: NameGenerator, rng: RNG): void {
  if (!n.alive || !p.plan.length) return;
  if (!namer) namer = new UnitNamer(names, rng);
  const world = state.world;
  const grid = state.grid;
  const designs = state.designs;
  const T = world.hexTerrain;
  const count = new Map<number, number>();
  const put = (u: Unit) => {
    state.units.set(u.id, u);
    count.set(u.hex, (count.get(u.hex) ?? 0) + 1);
  };
  const tl = n.techLevel;
  const exp = () => clamp(10 + 35 * tl + rng.range(-8, 12), 5, 70);
  const mkUnit = (pu: PlannedUnit, hex: number) => {
    const d = designs.get(pu.design)!;
    const u = makeUnit(state, pu.design, n.id, hex, namer!.name(state, n, d));
    u.experience = exp();
    u.efficiency = rng.range(66, 75);
    u.strength = rng.chance(0.3) ? rng.range(85, 100) : 100;
    return u;
  };
  // ---- land ----
  const landPlan = p.plan.filter((u) => CATEGORY_CLASS[u.cat] === UnitClass.Land);
  const ownCities = p.cities.filter((c) => world.hexOwner[c.hex] - 1 === n.id);
  const threats: [NationId, number[], number][] = [];
  for (const [b, list] of p.neighbours) {
    if (!state.nations[b]?.alive) continue;
    const rel = state.relations[n.id * state.nations.length + b];
    const h = hostile(n.id, b);
    const threat = Math.max(0, -rel) + (h ? 30 : 0);
    if (threat > 25) threats.push([b, list, threat]);
  }
  threats.sort((a, b) => b[2] - a[2]);
  const borderShare = threats.length ? 0.5 : 0.15;
  const nBorder = Math.round(landPlan.length * borderShare);
  // Mobile units prefer the border, air defence & infantry the cities.
  const pri = (c: UnitCategory) => (c === C.Armor || c === C.Mechanized || c === C.Artillery || c === C.RocketArtillery || c === C.Recon ? 0 : c === C.AirDefense ? 2 : 1);
  landPlan.sort((a, b) => pri(a.cat) - pri(b.cat) || (rng.next() - 0.5));
  const borderUnits = landPlan.slice(0, nBorder);
  const garrison = landPlan.slice(nBorder);
  const fits = (h: number) => (count.get(h) ?? 0) < 4;
  // Border placement.
  if (borderUnits.length) {
    const fronts = threats.length ? threats : [...p.neighbours.entries()].map(([b, l]) => [b, l, 1] as [NationId, number[], number]);
    const totalThreat = fronts.reduce((a, t) => a + t[2], 0) || 1;
    let idx = 0;
    for (const [, list, th] of fronts) {
      const k = Math.max(1, Math.round((borderUnits.length * th) / totalThreat));
      // Prefer border hexes with roads/population, spread along the front.
      const sorted = list.slice().sort((a, b) => (world.hexRoad[b] ? 2 : 0) + world.hexPopulation[b] / 100 - (world.hexRoad[a] ? 2 : 0) - world.hexPopulation[a] / 100);
      const step = Math.max(1, Math.floor(sorted.length / Math.max(1, Math.ceil(k / 2))));
      for (let j = 0; j < k && idx < borderUnits.length; j++) {
        let h = inland(sorted[(Math.floor(j / 2) * step) % sorted.length], n.id, world, grid, 1);
        if (!fits(h)) h = sorted.find(fits) ?? h;
        put(mkUnit(borderUnits[idx++], h));
      }
      if (idx >= borderUnits.length) break;
    }
    while (idx < borderUnits.length) garrison.push(borderUnits[idx++]);
  }
  // Garrisons weighted by city size (capital extra).
  if (garrison.length) {
    const targets = ownCities.length ? ownCities : [];
    const weights = targets.map((c) => Math.pow(c.population, 0.6) * (c.capital ? 2.5 : 1));
    const alloc = targets.length ? allocate(garrison.length, targets.map((c, i) => [c, weights[i]] as [unknown, number])) : [];
    let gi = 0;
    targets.forEach((c, i) => {
      const cands = [c.hex, ...c.urbanHexes.filter((h) => h !== c.hex)];
      for (let d = 0; d < 6; d++) {
        const m = grid.neighbours[c.hex * 6 + d];
        if (m >= 0 && world.hexOwner[m] - 1 === n.id && !isWaterTerrain(T[m])) cands.push(m);
      }
      for (let k = 0; k < alloc[i] && gi < garrison.length; k++) {
        const h = cands.find(fits) ?? cands[k % cands.length];
        put(mkUnit(garrison[gi++], h));
      }
    });
    while (gi < garrison.length) {
      const h = p.hexes[Math.floor(rng.next() * p.hexes.length)] ?? ownCities[0]?.hex;
      if (h === undefined) break;
      put(mkUnit(garrison[gi++], h));
    }
  }
  for (const u of state.units.values()) if (u.nation === n.id && CATEGORY_CLASS[designs.get(u.design)!.category] === UnitClass.Land) u.entrenchment = rng.range(30, 70);
  // ---- naval ----
  const bases: number[] = [];
  const airbases: number[] = [];
  for (const f of state.facilities.values()) {
    if (f.nation !== n.id) continue;
    if (f.type === F.NavalBase) bases.push(f.hex);
    if (f.type === F.Airbase) airbases.push(f.hex);
  }
  const navalPlan = p.plan.filter((u) => CATEGORY_CLASS[u.cat] === UnitClass.Naval);
  const carriers: Unit[] = [];
  if (navalPlan.length && bases.length) {
    navalPlan.forEach((pu, i) => {
      const base = bases[i % bases.length];
      const water = adjacentWaterHex(state, base);
      if (water < 0) return;
      const u = mkUnit(pu, water);
      u.stance = 'aggressive';
      put(u);
      if (pu.cat === C.Carrier) carriers.push(u);
    });
  }
  // ---- air ----
  const airPlan = p.plan.filter((u) => CATEGORY_CLASS[u.cat] === UnitClass.Air);
  if (airPlan.length && airbases.length) {
    airPlan.forEach((pu, i) => {
      const u = mkUnit(pu, airbases[i % airbases.length]);
      u.baseHex = u.hex;
      put(u);
    });
  }
  // Carrier air wings (two strike-fighter squadrons each).
  for (const cv of carriers) {
    const g = bestGen(n, C.Multirole, designs);
    for (let k = 0; k < 2; k++) {
      const u = mkUnit({ design: designId(C.Multirole, g), cat: C.Multirole }, cv.hex);
      u.baseHex = cv.hex;
      u.carrier = cv.id;
      u.name = `${u.name.replace('Strike Fighter Squadron', 'Carrier Air Wing Squadron')}`;
      put(u);
    }
  }
}

export function adjacentWaterHex(state: GameState, hex: number): number {
  const grid = state.grid;
  const T = state.world.hexTerrain;
  let best = -1, bestScore = -1;
  for (let d = 0; d < 6; d++) {
    const m = grid.neighbours[hex * 6 + d];
    if (m < 0 || !isWaterTerrain(T[m])) continue;
    const sc = T[m] === Terrain.Coastal ? 2 : T[m] === Terrain.DeepOcean ? 1.5 : 1;
    if (sc > bestScore) { bestScore = sc; best = m; }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Treaties
// ---------------------------------------------------------------------------
function setupTreaties(state: GameState, prep: NationPrep[]): void {
  const N = state.nations.length;
  const world = state.world;
  const has = new Set<string>();
  const add = (type: import('./types').TreatyType, a: number, b: number) => {
    if (a === b) return;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const k = `${type}:${lo}:${hi}`;
    if (has.has(k)) return;
    has.add(k);
    state.treaties.push({ type, a: lo, b: hi, sinceHour: 0, expiresHour: -1 });
  };
  const members = world.blocs.map((b) => state.nations.filter((n) => n.alive && n.blocs.includes(b.id)).map((n) => n.id));
  world.blocs.forEach((bloc, i) => {
    const m = members[i];
    for (let x = 0; x < m.length; x++) for (let y = x + 1; y < m.length; y++) {
      if (bloc.military) {
        add('alliance', m[x], m[y]);
        add('embassy', m[x], m[y]);
      } else if (m.length <= 30) {
        add('trade', m[x], m[y]);
        add('embassy', m[x], m[y]);
      }
      state.relations[m[x] * N + m[y]] = Math.min(100, state.relations[m[x] * N + m[y]] + 5);
      state.relations[m[y] * N + m[x]] = Math.min(100, state.relations[m[y] * N + m[x]] + 5);
    }
  });
  // Embassies: neighbours, major economies with each other, friendly pairs.
  const byGdp = state.nations.filter((n) => n.alive).sort((a, b) => b.gdp - a.gdp);
  const rank = new Map(byGdp.map((n, i) => [n.id, i]));
  for (let a = 0; a < N; a++) {
    if (!state.nations[a].alive) continue;
    for (let b = a + 1; b < N; b++) {
      if (!state.nations[b].alive) continue;
      const rel = state.relations[a * N + b];
      if (rel < -10) continue;
      const neighbours = prep[a].neighbours.has(b);
      const ra = rank.get(a) ?? 999, rb = rank.get(b) ?? 999;
      const major = (ra < 40 && rb < 40) || ((ra < 12 || rb < 12) && rel >= 15) || rel >= 45;
      if (neighbours || major) add('embassy', a, b);
      if (rel >= 60 && !has.has(`alliance:${a}:${b}`)) add('nonAggression', a, b);
      if (rel >= 55 && ra < 60 && rb < 60) add('trade', a, b);
    }
  }
  // Extreme hostility at start → open war (rare; peaceful start otherwise).
  for (let a = 0; a < N; a++) {
    for (let b = a + 1; b < N; b++) {
      if (state.relations[a * N + b] <= -99 && prep[a].neighbours.has(b)) {
        state.wars.push({ id: state.nextId++, name: `${state.nations[a].adjective}-${state.nations[b].adjective} War`, attackers: [a], defenders: [b], startHour: 0, score: 0, casualties: {} });
      }
    }
  }
  // DEFCON reflects tensions.
  for (const n of state.nations) {
    let minRel = 100;
    for (const b of prep[n.id].neighbours.keys()) minRel = Math.min(minRel, state.relations[n.id * N + b]);
    if (minRel <= -60) n.defcon = 4;
    if (state.wars.some((w) => w.attackers.includes(n.id) || w.defenders.includes(n.id))) n.defcon = 2;
  }
}

// ---------------------------------------------------------------------------
// Finances calibration & starting stocks
// ---------------------------------------------------------------------------
function calibrateNation(state: GameState, n: Nation, p: NationPrep): void {
  if (!n.alive) return;
  const defs = state.facilityDefs;
  const prod = new Float64Array(RESOURCE_COUNT);
  const req = householdDemand(n, new Float64Array(RESOURCE_COUNT));
  let facJobs = 0;
  let stateUpkeep = 0;
  for (const f of state.facilities.values()) {
    if (f.nation !== n.id) continue;
    const d = defs[f.type];
    if (d.produces !== null) prod[d.produces] += d.output * f.level;
    for (const k in d.inputs) req[+k] += (d.inputs[+k as Resource] ?? 0) * f.level;
    facJobs += d.workers * f.level;
    if (d.military || f.type === F.ResearchLab) stateUpkeep += d.upkeep * f.level;
  }
  let unitUp = 0, idleMG = 0;
  let unitCount = 0;
  for (const u of state.units.values()) {
    if (u.nation !== n.id) continue;
    const d = state.designs.get(u.design)!;
    unitUp += d.upkeep;
    idleMG += d.militaryGoodsCost * 0.0004;
    req[R.Petroleum] += 0.015;
    unitCount++;
  }
  req[R.MilitaryGoods] += idleMG;
  // Upkeep price level: the start OOB costs ~70% of the real defence budget.
  const allocM = (n.militaryBudget * n.gdp / 365) * 1000;
  n.upkeepFactor = unitUp > 0 ? clamp((0.7 * allocM) / unitUp, 0.1, 8) : 1;
  n.militaryFund = n.militaryBudget * n.gdp * 0.15;
  n.unitCount = unitCount;
  // Goods share of GDP.
  let goods = 0, net = 0;
  for (let r = 0; r < RESOURCE_COUNT; r++) {
    goods += prod[r] * BASE_PRICE[r];
    net += (prod[r] - req[r]) * BASE_PRICE[r];
  }
  const goodsY = (goods * 365) / 1000;
  const goodsMult = goodsY > 0.45 * n.gdp ? (0.45 * n.gdp) / goodsY : 1;
  n.baseline.goodsMult = goodsMult;
  n.gdpGoods = goodsY * goodsMult;
  n.gdpServices = n.gdp - n.gdpGoods;
  // Structural trade gap covered by services/tourism/remittances.
  const netY = (net * 365) / 1000;
  n.servicesIncome = netY < 0 ? -netY * 0.9 : 0;
  // Starting stocks & demand estimates.
  for (let r = 0; r < RESOURCE_COUNT; r++) {
    n.demand[r] = req[r];
    n.production[r] = prod[r];
    n.stock[r] = Math.max(req[r], prod[r] * 0.3) * TARGET_STOCK_DAYS[r] * (0.85 + 0.3 * ((n.id * 7 + r * 13) % 10) / 10);
  }
  // Tax calibration: target a modest deficit.
  const gdp = n.gdp;
  const spend = totalSpending(n.spending) + n.researchBudget + n.militaryBudget
    + (n.debt * n.interestRate) / gdp + (stateUpkeep * 365 / 1000) / gdp;
  const tradeY = netY + n.servicesIncome;
  const other = 0.015 + tradeY / gdp;
  const dem = isDemocratic(n.government);
  const targetDeficit = dem ? 0.025 : 0.012;
  const c = compliance(n);
  const need = spend - targetDeficit - other;
  const base = nominalTaxRate(n.taxes) * c;
  let k = base > 0 ? need / base : 1;
  k = clamp(k, 0.35, 1.7);
  n.taxes = {
    income: clamp(n.taxes.income * k, 0.02, 0.7),
    corporate: clamp(n.taxes.corporate * Math.sqrt(k), 0.05, 0.6),
    sales: clamp(n.taxes.sales * k, 0.02, 0.4),
  };
  // If taxes can't cover it, trim civilian spending.
  const got = nominalTaxRate(n.taxes) * c;
  const gap = spend - targetDeficit - other - got;
  if (gap > 0.01) {
    const civ = totalSpending(n.spending);
    const f = clamp((civ - gap * 0.7) / civ, 0.6, 1);
    for (const key of Object.keys(n.spending) as (keyof Spending)[]) n.spending[key] *= f;
  }
  const b = n.baseline;
  b.taxBurden = nominalTaxRate(n.taxes) * c;
  b.social = socialSpending(n.spending);
  b.infrastructure = n.spending.infrastructure;
  b.education = n.spending.education;
  b.lawEnforcement = n.spending.lawEnforcement;
  b.facilityJobs = facJobs / 1000;
  b.gdp = n.gdp;
  n.hexCount = p.hexes.length;
  n.cityCount = p.cities.length;
  n.history.push({ day: 0, gdp: n.gdp, treasury: n.treasury, approval: n.approval, military: 0 });
}
