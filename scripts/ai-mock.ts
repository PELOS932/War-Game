/**
 * Crude mock of the GameAPI for smoke-testing the AI before/independently of
 * the real simulation: naive movement (1 hex/hour), naive combat & capture,
 * instant treaty answers. Exercises every AI code path for runtime errors and
 * measures AI CPU cost.
 *
 *   npx tsx scripts/ai-mock.ts [days=120] [--nations=36] [--cols=320 --rows=192]
 */
import { HexGrid } from '../src/core/hex';
import { HexPathfinder } from '../src/core/pathfind';
import { RNG } from '../src/core/rng';
import { generateWorld, DEFAULT_SETTINGS } from '../src/worldgen/generate';
import { isWaterTerrain } from '../src/worldgen/types';
import type { CommandResult, GameAPI } from '../src/sim/api';
import {
  CATEGORY_CLASS, UnitCategory, UnitClass, RESOURCE_COUNT,
  type City, type GameEvent, type GameState, type Nation, type Unit, type War, type TreatyType,
} from '../src/sim/types';
import { UNIT_DESIGNS } from '../src/sim/data/units';
import { TECHS } from '../src/sim/data/techs';
import { FACILITY_DEFS } from '../src/sim/data/facilities';
import { createAI, getAILog, getAITiming, getAIDebug } from '../src/sim/ai/index';

const args = process.argv.slice(2);
const days = Number(args.find((a) => /^\d+$/.test(a)) ?? 120);
const opt = (k: string, d: number) => Number((args.find((a) => a.startsWith(`--${k}=`)) ?? `=${d}`).split('=')[1]);
const settings = { ...DEFAULT_SETTINGS, seed: opt('seed', 11), nationCount: opt('nations', 36), cols: opt('cols', 320), rows: opt('rows', 192) };
let t = Date.now();
const world = generateWorld(settings);
console.log(`world ${settings.cols}x${settings.rows}, ${world.nations.length} nations in ${Date.now() - t}ms`);
const grid = new HexGrid(settings.cols, settings.rows);
for (const s of world.nations) {
  if (!s.gdp) s.gdp = s.hexCount * (0.3 + s.development) * 6;
  if (!s.activeMilitary) s.activeMilitary = s.hexCount * (0.5 + s.militarism) * 2;
  if (!s.defenseBudget) s.defenseBudget = 1.5 + 3 * s.militarism;
}
const N = world.nations.length;
const rng = new RNG(5);
const OK: CommandResult = { ok: true };
const NO = (reason: string): CommandResult => ({ ok: false, reason });

const nations: Nation[] = world.nations.map((s) => ({
  id: s.id, code: s.code, name: s.name, formalName: s.formalName, adjective: s.adjective, color: s.color, flag: s.flag,
  government: s.government, leaderTitle: s.leaderTitle, leaderName: s.leaderName, culture: s.culture, alive: true, isPlayer: false,
  capitalCity: world.cities.find((c) => c.nation === s.id && c.capital)?.id ?? -1,
  population: s.population, gdp: s.gdp, gdpGrowth: 0.02, treasury: s.gdp * 0.05, debt: s.gdp * 0.5, creditRating: 60,
  taxes: { income: 0.25, corporate: 0.2, sales: 0.1 },
  spending: { health: 0.06, education: 0.05, infrastructure: 0.03, environment: 0.01, family: 0.02, lawEnforcement: 0.01, culture: 0.005, socialAssistance: 0.04 },
  militaryBudget: s.defenseBudget / 100, researchBudget: 0.01, approval: 55, unemployment: 0.07, literacy: 0.9, worldOpinion: 60,
  inflation: 0.02, defcon: 5, techLevel: s.techLevel, nuclear: s.nuclear, development: s.development,
  stock: new Float64Array(RESOURCE_COUNT).fill(100), production: new Float64Array(RESOURCE_COUNT).fill(10),
  consumption: new Float64Array(RESOURCE_COUNT).fill(10), traded: new Float64Array(RESOURCE_COUNT),
  tradePolicy: Array.from({ length: RESOURCE_COUNT }, () => 'auto' as const), researchPoints: 100, knownTechs: new Set(TECHS.filter((x) => x.prereqs.length === 0).map((x) => x.id)),
  researching: [], productionQueue: [], ministers: [],
  autonomy: { economy: true, trade: true, research: true, production: true, diplomacy: true, military: true },
  aggression: s.aggression, ideology: s.ideology, militarism: s.militarism, navalFocus: s.navalFocus, blocs: s.blocs,
  warWeariness: 0, history: [], militaryFund: s.gdp * s.defenseBudget / 100 * 0.15, upkeepFactor: 1, costFactor: 1, interestRate: 0.03,
  baseline: { debtRatio: 0.5 }, income: { taxes: s.gdp / 365 * 0.3 }, expenses: { spending: s.gdp / 365 * 0.29 },
} as unknown as Nation));

const cities: City[] = world.cities.map((c) => ({ id: c.id, name: c.name, hex: c.hex, urbanHexes: c.urbanHexes, population: c.population, capital: c.capital, port: c.port, originalNation: c.nation, damage: 0, x: c.x, z: c.z }));
const state = {
  world, grid, hour: 0, speed: 0, playerNation: -1, nations, cities, units: new Map<number, Unit>(), facilities: new Map(),
  designs: new Map(UNIT_DESIGNS.map((d) => [d.id, d])), techs: new Map(TECHS.map((x) => [x.id, x])), facilityDefs: FACILITY_DEFS,
  hexOwner: Uint16Array.from(world.hexOwner), hexCore: Uint16Array.from(world.hexOwner), hexControlChangedHour: new Float32Array(grid.count),
  ownerVersion: 0, ownerDirty: [], facilityVersion: 0, hexFacilities: new Map(), relations: Float32Array.from(world.relations),
  treaties: [], wars: [] as War[], proposals: [], market: { price: new Float64Array(RESOURCE_COUNT).fill(1), basePrice: new Float64Array(RESOURCE_COUNT).fill(1), supply: new Float64Array(RESOURCE_COUNT), demand: new Float64Array(RESOURCE_COUNT) },
  news: [], nextId: 1, gameOver: null, seed: 1,
} as unknown as GameState;

// ---- initial forces ---------------------------------------------------------
function spawn(nation: number, design: string, hex: number): Unit {
  const u = {
    id: state.nextId++, design, nation, name: `${design}#${state.nextId}`, hex, x: grid.cx[hex], z: grid.cz[hex], heading: 0,
    strength: 100, efficiency: 80, experience: 20, supply: 100, fuel: 100, entrenchment: 0, stance: 'defensive',
    order: { type: 'idle', targetHex: -1, targetUnit: -1 }, path: [], moveProgress: 0, inCombat: false, embarked: false,
    airborne: false, baseHex: -1, missionHours: 0, kills: 0, createdHour: 0, groupId: -1, airState: 'ready',
  } as unknown as Unit;
  state.units.set(u.id, u);
  return u;
}
const landDesigns = ['infantry_g2', 'mech_g2', 'armor_g2', 'artillery_g2', 'airdef_g2'];
for (const s of world.nations) {
  const own = cities.filter((c) => c.originalNation === s.id);
  if (own.length === 0) continue;
  const count = Math.max(3, Math.min(60, Math.round(s.activeMilitary / 40)));
  for (let i = 0; i < count; i++) spawn(s.id, landDesigns[i % landDesigns.length].replace('airdef', UNIT_DESIGNS.some((d) => d.id === 'airdef_g2') ? 'airdef' : 'infantry'), own[i % own.length].hex);
  const cap = own.find((c) => c.capital) ?? own[0];
  for (let i = 0; i < Math.round(count / 8); i++) {
    const a = spawn(s.id, i % 2 ? 'fighter_g2' : 'strike_g2', cap.hex);
    a.baseHex = cap.hex;
  }
  const port = own.find((c) => c.port);
  if (port) {
    let w = -1;
    for (let d = 0; d < 6; d++) {
      const j = grid.neighbour(port.hex, d);
      if (j >= 0 && isWaterTerrain(world.hexTerrain[j])) w = j;
    }
    if (w >= 0) for (let i = 0; i < Math.round(count / 10); i++) spawn(s.id, i % 2 ? 'frigate_g2' : 'destroyer_g2', w);
  }
}
for (const u of state.units.values()) if (!state.designs.has(u.design)) state.units.delete(u.id);
console.log(`${state.units.size} units`);

// ---- mock mechanics -------------------------------------------------------------
const listeners = new Set<(e: GameEvent) => void>();
const emit = (e: GameEvent) => { for (const l of listeners) l(e); };
const pf = new HexPathfinder(grid);
const owner = (h: number) => state.hexOwner[h] - 1;
function atWar(a: number, b: number): boolean {
  return a !== b && state.wars.some((w) => (w.attackers.includes(a) && w.defenders.includes(b)) || (w.attackers.includes(b) && w.defenders.includes(a)));
}
function cls(u: Unit): UnitClass { return CATEGORY_CLASS[state.designs.get(u.design)!.category]; }
function unitsAt(h: number): Unit[] { const out: Unit[] = []; for (const u of state.units.values()) if (u.hex === h && !u.airborne) out.push(u); return out; }
const byHex = new Map<number, Unit[]>();
function rebuildHex(): void { byHex.clear(); for (const u of state.units.values()) { let l = byHex.get(u.hex); if (!l) byHex.set(u.hex, (l = [])); l.push(u); } }
function path(u: Unit, target: number): number[] | null {
  const c = cls(u);
  const p = pf.find(u.hex, target, (_f, to) => {
    const water = isWaterTerrain(world.hexTerrain[to]);
    if (c === UnitClass.Naval) return water ? 1 : Infinity;
    if (water) return Infinity;
    const o = owner(to);
    if (o >= 0 && o !== u.nation && !atWar(u.nation, o)) return Infinity;
    return 1;
  }, 1, 20000);
  return p ? p.slice(1) : null;
}
function power(u: Unit): number { const d = state.designs.get(u.design)!; return ((d.attackSoft + d.attackHard) / 2 + d.defenseGround) * u.strength / 100; }
let visCalls = 0;
let moveCalls = 0, moveIds = 0, attackCalls = 0;
const mock: GameAPI = {
  state, hourFraction: 0,
  advance() {}, setSpeed() {},
  stepHours(n: number) {
    for (let k = 0; k < n; k++) {
      state.hour++;
      rebuildHex();
      for (const u of [...state.units.values()]) {
        u.inCombat = false;
        if (cls(u) === UnitClass.Air) { u.airborne = false; (u as unknown as { airState: string }).airState = 'ready'; u.order.type = 'idle'; continue; }
        if (u.order.type === 'attack' && grid.distance(u.hex, u.order.targetHex) <= 1) {
          const defs = (byHex.get(u.order.targetHex) ?? []).filter((d) => atWar(u.nation, d.nation));
          if (defs.length === 0) { u.path = [u.order.targetHex]; u.order.type = 'move'; }
          else { for (const d of defs) { d.strength -= 4 * power(u) / Math.max(10, power(d)); d.inCombat = true; } u.strength -= 2; u.inCombat = true; }
        }
        if (u.path.length) {
          const nx = u.path[0];
          const blockers = (byHex.get(nx) ?? []).filter((d) => atWar(u.nation, d.nation));
          if (blockers.length) continue;
          u.path.shift();
          u.hex = nx;
          const o = owner(nx);
          if (cls(u) === UnitClass.Land && o >= 0 && o !== u.nation && atWar(u.nation, o)) {
            state.hexOwner[nx] = u.nation + 1; state.ownerVersion++;
            emit({ type: 'hexCaptured', hex: nx, from: o, to: u.nation });
            const c = cities.find((cc) => cc.hex === nx);
            if (c) emit({ type: 'cityCaptured', city: c.id, from: o, to: u.nation });
          }
          if (!u.path.length) u.order.type = 'idle';
        }
      }
      for (const u of [...state.units.values()]) if (u.strength <= 0) { state.units.delete(u.id); emit({ type: 'unitDestroyed', unit: u.id, nation: u.nation, x: u.x, z: u.z }); }
      for (const u of state.units.values()) if (u.strength < 100 && !u.inCombat) u.strength = Math.min(100, u.strength + 0.2);
      for (const w of state.wars) {
        let a = 0, d = 0;
        for (let h = 0; h < grid.count; h++) { const o = state.hexOwner[h] - 1, c0 = state.hexCore[h] - 1; if (o !== c0 && o >= 0 && c0 >= 0) { if (w.attackers.includes(o) && w.defenders.includes(c0)) a++; if (w.defenders.includes(o) && w.attackers.includes(c0)) d++; } }
        w.score = Math.max(-100, Math.min(100, (a - d) / 2));
        for (const x of [...w.attackers, ...w.defenders]) nations[x].warWeariness = Math.min(100, nations[x].warWeariness + 0.01);
      }
      if (state.hour % 24 === 0) for (const n of nations) { let up = 0; for (const u of state.units.values()) if (u.nation === n.id) up += state.designs.get(u.design)!.upkeep; n.militaryFund = Math.max(0, n.militaryFund + n.militaryBudget * n.gdp / 365 - up / 1000); }
      ai.onHour(state.hour);
      if (state.hour % 24 === 0) ai.onDay(state.hour / 24);
    }
  },
  on(l) { listeners.add(l); return () => listeners.delete(l); },
  unitsAt, atWar,
  relation: (a, b) => state.relations[a * N + b],
  hasTreaty: (a, b, type) => state.treaties.some((x) => x.type === type && ((x.a === a && x.b === b) || (x.a === b && x.b === a))),
  isVisible(n, h) { visCalls++; let v = false; grid.forRadius(h, 2, (m) => { if (owner(m) === n) v = true; }); return v; },
  supplyAt: () => 100,
  findPath: (ids, target) => { const u = state.units.get(ids[0]); return u ? path(u, target) : null; },
  militaryPower: (n) => { let p = 0; for (const u of state.units.values()) if (u.nation === n) p += power(u); return p; },
  availableDesigns: () => UNIT_DESIGNS.filter((d) => d.generation <= 2).map((d) => d.id),
  availableTechs: (n) => TECHS.filter((x) => !nations[n].knownTechs.has(x.id) && x.prereqs.every((p) => nations[n].knownTechs.has(p))).map((x) => x.id),
  canBuildFacility: () => OK,
  canBuildUnitAt: () => OK,
  moveUnits(ids, target) {
    moveCalls++; moveIds += ids.length;
    let ok = false;
    for (const id of ids) { const u = state.units.get(id); if (!u) continue; const p = path(u, target); if (p) { u.path = p; u.order = { type: 'move', targetHex: target, targetUnit: -1 }; ok = true; } }
    return ok ? OK : NO('no path');
  },
  attack(ids, target) { attackCalls++; for (const id of ids) { const u = state.units.get(id); if (u) { u.order = { type: 'attack', targetHex: target, targetUnit: -1 }; if (grid.distance(u.hex, target) > 1) { const p = path(u, target); u.path = p ? p.slice(0, -1) : []; } } } return OK; },
  holdPosition(ids) { for (const id of ids) { const u = state.units.get(id); if (u) { u.path = []; u.order.type = 'hold'; } } return OK; },
  setStance(ids, s) { for (const id of ids) { const u = state.units.get(id); if (u) u.stance = s; } return OK; },
  retreat: () => OK,
  airMission(ids, m, target) { for (const id of ids) { const u = state.units.get(id); if (!u) continue; u.airborne = true; (u as unknown as { airState: string }).airState = 'outbound'; for (const d of byHex.get(target) ?? []) if (atWar(u.nation, d.nation) && m === 'airStrike') d.strength -= 3; } return OK; },
  rebase(ids, h) { for (const id of ids) { const u = state.units.get(id); if (u) { u.baseHex = h; u.hex = h; } } return OK; },
  reinforce: () => OK, disband: () => OK,
  queueUnit(n, d, city, count) { nations[n].militaryFund -= state.designs.get(d)!.cost * count / 1000; for (let i = 0; i < count; i++) { const u = spawn(n, d, cities[city].hex); emit({ type: 'unitCreated', unit: u.id, nation: n }); } return OK; },
  cancelProduction: () => OK, buildFacility: () => OK, upgradeFacility: () => OK,
  setTaxes(n, tx) { Object.assign(nations[n].taxes, tx); return OK; },
  setSpending(n, sp) { Object.assign(nations[n].spending, sp); return OK; },
  setMilitaryBudget(n, f) { nations[n].militaryBudget = f; return OK; },
  setResearchBudget(n, f) { nations[n].researchBudget = f; return OK; },
  setTradePolicy(n, r, p) { nations[n].tradePolicy[r] = p; return OK; },
  marketTrade: () => OK, issueBonds: () => OK, repayDebt: () => OK,
  startResearch(n, id) { const nat = nations[n]; if (nat.researching.length >= 3) return NO('slots'); nat.researching.push({ techId: id, progress: 0 }); return OK; },
  cancelResearch: () => OK,
  proposeTreaty(a, b, type: TreatyType) { if (state.relations[a * N + b] > 20 && !mock.hasTreaty(a, b, type)) state.treaties.push({ type, a, b, sinceHour: state.hour, expiresHour: -1 }); return OK; },
  cancelTreaty(a, b, type) { state.treaties = state.treaties.filter((x) => !(x.type === type && ((x.a === a && x.b === b) || (x.a === b && x.b === a)))); return OK; },
  declareWar(a, b) {
    if (atWar(a, b)) return NO('already');
    const w: War = { id: state.nextId++, name: `${nations[a].name}-${nations[b].name} War`, attackers: [a], defenders: [b], startHour: state.hour, score: 0, casualties: {} };
    state.wars.push(w);
    emit({ type: 'warDeclared', war: w.id, attacker: a, defender: b });
    return OK;
  },
  offerPeace(a, b) {
    const i = state.wars.findIndex((w) => (w.attackers.includes(a) && w.defenders.includes(b)) || (w.attackers.includes(b) && w.defenders.includes(a)));
    if (i < 0) return NO('not at war');
    if (rng.chance(0.4)) { const w = state.wars[i]; state.wars.splice(i, 1); emit({ type: 'peace', war: w.id }); return OK; }
    return NO('rejected');
  },
  sendAid: () => OK, improveRelations: () => OK, respondProposal: () => OK,
  setDefcon(n, l) { nations[n].defcon = l; return OK; },
  setAutonomy: () => OK,
};
const ai = createAI(mock);

// ---- run ---------------------------------------------------------------------------
t = Date.now();
let captures = 0;
mock.on((e) => { if (e.type === 'cityCaptured') captures++; });
for (let d = 1; d <= days; d++) {
  mock.stepHours(24);
  if (d % 30 === 0) {
    const tm = getAITiming();
    console.log(`day ${d}: wars ${state.wars.length}, captures ${captures}, units ${state.units.size}, AI avg ${tm.avgPerHour.toFixed(2)} ms/h (max ${tm.maxHour.toFixed(1)}), isVisible calls ${visCalls}, moves ${moveCalls} (${moveIds} unit-orders), attacks ${attackCalls}`);
  }
}
console.log(`ran ${days} days in ${((Date.now() - t) / 1000).toFixed(1)}s`);
for (const e of getAILog().filter((x) => x.kind !== 'treaty').slice(-40)) console.log(`[${e.hour}] ${e.kind}: ${e.text}`);
console.log(getAITiming());
const warrior = state.wars[0]?.attackers[0];
if (warrior !== undefined) console.log(JSON.stringify(getAIDebug(warrior), null, 1));
for (const nm of (args.find((a) => a.startsWith('--debug=')) ?? '').slice(8).split(',').filter(Boolean)) {
  const id = nations.findIndex((n) => n.name === nm);
  if (id >= 0) console.log(nm, JSON.stringify(getAIDebug(id), null, 1));
}
