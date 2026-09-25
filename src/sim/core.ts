/**
 * Shared simulation context: game state plus derived caches and helpers used
 * by every simulation module (hex→unit index, war matrix, treaty index,
 * distance tables, event emission, news).
 */
import { HexGrid } from '../core/hex';
import { RNG, hashString } from '../core/rng';
import {
  CATEGORY_CLASS, UnitClass,
  type City, type Facility, type GameEvent, type GameState, type Nation, type NationId, type NewsCategory,
  type NewsItem, type Treaty, type TreatyType, type Unit, type UnitDesign,
} from './types';
import { Terrain, kmPerUnitAt, isWaterTerrain, type WorldData } from '../worldgen/types';

export const TREATY_TYPES: TreatyType[] = [
  'embassy', 'trade', 'mapSharing', 'militaryAccess', 'nonAggression', 'defensePact', 'alliance', 'researchSharing', 'ceasefire',
];
export const TREATY_INDEX: Record<TreatyType, number> = Object.fromEntries(TREATY_TYPES.map((t, i) => [t, i])) as Record<TreatyType, number>;

export const MAX_NEWS = 400;

export class Sim {
  readonly world: WorldData;
  readonly grid: HexGrid;
  readonly state: GameState;
  readonly N: number;
  readonly terrain: Uint8Array;
  rng: RNG;
  private listeners = new Set<(e: GameEvent) => void>();

  // ---- caches ---------------------------------------------------------------
  /** hex -> units currently in that hex (not airborne). */
  readonly hexUnits = new Map<number, Unit[]>();
  /** Number of wars in which a and b are on opposite sides. */
  warMatrix: Uint8Array;
  private treatyIndex = new Map<number, Treaty>();
  /** Incremented whenever a treaty is added or removed. */
  treatyVersion = 0;
  /** Per nation: facilities it owns (rebuilt lazily). */
  private nationFac: Facility[][] = [];
  private facDirty = true;
  /** Per nation: units it owns (rebuilt each hour lazily). */
  private nationUnitsCache: Unit[][] = [];
  private unitsDirty = true;
  /** Nations that currently have at least one war. */
  warring = new Set<NationId>();
  /** Km per world unit N-S (constant) and E-W per hex row. */
  readonly kmNS: number;
  readonly kmEWRow: Float32Array;
  /** Step length in km per row: [row*3+0] east/west, [row*3+1] to row-1, [row*3+2] to row+1. */
  readonly stepKmRow: Float32Array;
  /** Minimum km of any single hex step (for heuristics). */
  readonly minStepKm: number;
  /** City id by hex (urban hexes included), -1 if none. */
  readonly cityAt: Int32Array;
  /** Hexes adjacent to sea (land) — from world. */
  readonly coast: Uint8Array;
  /** Wall-clock timings (ms) per subsystem, accumulated. */
  readonly timing: Record<string, number> = {};
  /** Finance entries recorded between daily economy ticks (billions USD). */
  pendingIncome: Record<string, number>[] = [];
  pendingExpenses: Record<string, number>[] = [];
  /** Military petroleum / military goods used since the last day tick (resource units). */
  milFuel: Float64Array;
  milAmmo: Float64Array;
  /** Net market exports (billions USD) accumulated for the services-income calibration. */
  tradeAccum: Float64Array;
  /** Smoothed demand satisfaction per nation (facility input availability). */
  satSmooth: Float64Array[] = [];
  /** Personnel lost since the last day tick, per nation. */
  casualties: Float64Array;
  /** Fog-of-war provider (set by the game). */
  vis: { isVisible(n: NationId, hex: number): boolean } | null = null;

  constructor(world: WorldData, state: GameState) {
    this.world = world;
    this.state = state;
    this.grid = state.grid;
    this.N = state.nations.length;
    this.terrain = world.hexTerrain;
    this.coast = world.hexCoast;
    this.rng = new RNG(state.seed);
    this.warMatrix = new Uint8Array(this.N * this.N);
    const s = world.settings;
    const g = this.grid;
    this.kmNS = kmPerUnitAt(0, s).ns;
    this.kmEWRow = new Float32Array(g.rows);
    for (let r = 0; r < g.rows; r++) this.kmEWRow[r] = kmPerUnitAt(1.5 * r + 1, s).ew;
    this.stepKmRow = new Float32Array(g.rows * 3);
    let minKm = Infinity;
    const SQ3 = Math.sqrt(3);
    for (let r = 0; r < g.rows; r++) {
      const ew = this.kmEWRow[r];
      this.stepKmRow[r * 3] = SQ3 * ew;
      const up = r > 0 ? (ew + this.kmEWRow[r - 1]) / 2 : ew;
      const dn = r < g.rows - 1 ? (ew + this.kmEWRow[r + 1]) / 2 : ew;
      this.stepKmRow[r * 3 + 1] = Math.hypot((SQ3 / 2) * up, 1.5 * this.kmNS);
      this.stepKmRow[r * 3 + 2] = Math.hypot((SQ3 / 2) * dn, 1.5 * this.kmNS);
      minKm = Math.min(minKm, this.stepKmRow[r * 3], this.stepKmRow[r * 3 + 1], this.stepKmRow[r * 3 + 2]);
    }
    this.minStepKm = minKm;
    this.milFuel = new Float64Array(this.N);
    this.milAmmo = new Float64Array(this.N);
    this.tradeAccum = new Float64Array(this.N);
    this.casualties = new Float64Array(this.N);
    for (let i = 0; i < this.N; i++) {
      this.pendingIncome.push({});
      this.pendingExpenses.push({});
      this.satSmooth.push(new Float64Array(11).fill(1));
    }
    this.cityAt = new Int32Array(g.count).fill(-1);
    for (const c of state.cities) for (const h of c.urbanHexes) this.cityAt[h] = c.id;
    for (const c of state.cities) this.cityAt[c.hex] = c.id;
    this.rebuildIndices();
  }

  // ---- events ---------------------------------------------------------------
  on(fn: (e: GameEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(e: GameEvent): void {
    for (const fn of this.listeners) {
      try { fn(e); } catch (err) { console.error('GameEvent listener failed', err); }
    }
  }

  nextId(): number {
    return this.state.nextId++;
  }

  news(category: NewsCategory, text: string, nations: NationId[], importance: 1 | 2 | 3, hex = -1): NewsItem {
    const item: NewsItem = { id: this.nextId(), hour: this.state.hour, category, text, nations, importance, hex };
    const list = this.state.news;
    list.push(item);
    if (list.length > MAX_NEWS) list.splice(0, list.length - MAX_NEWS);
    this.emit({ type: 'news', item });
    return item;
  }

  /** Deterministic RNG for the current hour (re-seeded every tick so save/load resumes identically). */
  reseed(): void {
    this.rng = new RNG((Math.imul(this.state.seed ^ 0x5bd1e995, 2654435761) + Math.imul(this.state.hour + 1, 40503)) >>> 0);
  }

  // ---- indices --------------------------------------------------------------
  rebuildIndices(): void {
    this.hexUnits.clear();
    for (const u of this.state.units.values()) if (!u.airborne) this.addToHex(u, u.hex);
    this.warMatrix.fill(0);
    this.warring.clear();
    for (const w of this.state.wars) this.addWarToMatrix(w.attackers, w.defenders, 1);
    this.treatyIndex.clear();
    for (const t of this.state.treaties) this.treatyIndex.set(this.treatyKey(t.type, t.a, t.b), t);
    this.facDirty = true;
    this.unitsDirty = true;
  }

  addToHex(u: Unit, hex: number): void {
    let list = this.hexUnits.get(hex);
    if (!list) { list = []; this.hexUnits.set(hex, list); }
    list.push(u);
  }

  removeFromHex(u: Unit, hex: number): void {
    const list = this.hexUnits.get(hex);
    if (!list) return;
    const i = list.indexOf(u);
    if (i >= 0) {
      list[i] = list[list.length - 1];
      list.pop();
    }
    if (list.length === 0) this.hexUnits.delete(hex);
  }

  /** Move a (non-airborne) unit to a new hex keeping the index in sync. */
  setUnitHex(u: Unit, hex: number): void {
    if (u.hex === hex) return;
    if (!u.airborne) this.removeFromHex(u, u.hex);
    u.hex = hex;
    if (!u.airborne) this.addToHex(u, hex);
  }

  /** Index a unit at hex regardless of its previous (possibly invalid) hex. */
  setUnitHexForce(u: Unit, hex: number): void {
    u.hex = hex;
    if (!u.airborne) this.addToHex(u, hex);
  }

  unitsIn(hex: number): Unit[] {
    return this.hexUnits.get(hex) ?? EMPTY;
  }

  markUnitsDirty(): void { this.unitsDirty = true; }
  markFacilitiesDirty(): void { this.facDirty = true; this.state.facilityVersion++; }

  nationUnits(n: NationId): Unit[] {
    if (this.unitsDirty) {
      this.nationUnitsCache = Array.from({ length: this.N }, () => []);
      for (const u of this.state.units.values()) this.nationUnitsCache[u.nation]?.push(u);
      this.unitsDirty = false;
    }
    return this.nationUnitsCache[n] ?? EMPTY;
  }

  nationFacilities(n: NationId): Facility[] {
    if (this.facDirty) {
      this.nationFac = Array.from({ length: this.N }, () => []);
      for (const f of this.state.facilities.values()) if (f.nation >= 0) this.nationFac[f.nation]?.push(f);
      this.facDirty = false;
    }
    return this.nationFac[n] ?? EMPTY_F;
  }

  addFacilityToHex(f: Facility): void {
    let list = this.state.hexFacilities.get(f.hex);
    if (!list) { list = []; this.state.hexFacilities.set(f.hex, list); }
    list.push(f.id);
  }

  removeFacility(f: Facility): void {
    this.state.facilities.delete(f.id);
    const list = this.state.hexFacilities.get(f.hex);
    if (list) {
      const i = list.indexOf(f.id);
      if (i >= 0) list.splice(i, 1);
      if (!list.length) this.state.hexFacilities.delete(f.hex);
    }
    this.markFacilitiesDirty();
  }

  facilitiesAt(hex: number): Facility[] {
    const ids = this.state.hexFacilities.get(hex);
    if (!ids) return EMPTY_F;
    const out: Facility[] = [];
    for (const id of ids) {
      const f = this.state.facilities.get(id);
      if (f) out.push(f);
    }
    return out;
  }

  // ---- money ----------------------------------------------------------------
  /** Pay from treasury (billions) and record under an expense heading. */
  spend(n: NationId, key: string, billions: number): void {
    if (!(billions > 0)) return;
    this.state.nations[n].treasury -= billions;
    const e = this.pendingExpenses[n];
    e[key] = (e[key] ?? 0) + billions;
  }

  earn(n: NationId, key: string, billions: number): void {
    if (!(billions > 0)) return;
    this.state.nations[n].treasury += billions;
    const e = this.pendingIncome[n];
    e[key] = (e[key] ?? 0) + billions;
  }

  // ---- wars -----------------------------------------------------------------
  addWarToMatrix(att: NationId[], def: NationId[], delta: number): void {
    const N = this.N;
    for (const a of att) for (const d of def) {
      this.warMatrix[a * N + d] = Math.max(0, this.warMatrix[a * N + d] + delta);
      this.warMatrix[d * N + a] = Math.max(0, this.warMatrix[d * N + a] + delta);
    }
    this.warring.clear();
    for (const w of this.state.wars) {
      for (const a of w.attackers) this.warring.add(a);
      for (const d of w.defenders) this.warring.add(d);
    }
  }

  /** Recompute the war matrix and warring set from state.wars. */
  rebuildWarMatrix(): void {
    this.warMatrix.fill(0);
    this.warring.clear();
    for (const w of this.state.wars) this.addWarToMatrix(w.attackers, w.defenders, 1);
  }

  atWar(a: NationId, b: NationId): boolean {
    if (a < 0 || b < 0 || a === b) return false;
    return this.warMatrix[a * this.N + b] > 0;
  }

  enemiesOf(n: NationId): NationId[] {
    const out: NationId[] = [];
    if (!this.warring.has(n)) return out;
    const base = n * this.N;
    for (let b = 0; b < this.N; b++) if (this.warMatrix[base + b] > 0) out.push(b);
    return out;
  }

  // ---- treaties ---------------------------------------------------------------
  treatyKey(type: TreatyType, a: NationId, b: NationId): number {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    return (TREATY_INDEX[type] * this.N + lo) * this.N + hi;
  }

  getTreaty(a: NationId, b: NationId, type: TreatyType): Treaty | undefined {
    return this.treatyIndex.get(this.treatyKey(type, a, b));
  }

  hasTreaty(a: NationId, b: NationId, type: TreatyType): boolean {
    if (a === b) return false;
    return this.treatyIndex.has(this.treatyKey(type, a, b));
  }

  addTreaty(type: TreatyType, a: NationId, b: NationId, durationHours = -1): Treaty {
    const existing = this.getTreaty(a, b, type);
    if (existing) return existing;
    const t: Treaty = { type, a: Math.min(a, b), b: Math.max(a, b), sinceHour: this.state.hour, expiresHour: durationHours > 0 ? this.state.hour + durationHours : -1 };
    this.state.treaties.push(t);
    this.treatyIndex.set(this.treatyKey(type, a, b), t);
    this.treatyVersion++;
    return t;
  }

  removeTreaty(a: NationId, b: NationId, type: TreatyType): boolean {
    const key = this.treatyKey(type, a, b);
    const t = this.treatyIndex.get(key);
    if (!t) return false;
    this.treatyIndex.delete(key);
    const i = this.state.treaties.indexOf(t);
    if (i >= 0) this.state.treaties.splice(i, 1);
    this.treatyVersion++;
    return true;
  }

  /** Alliance or defence pact. */
  isAllied(a: NationId, b: NationId): boolean {
    return a === b || this.hasTreaty(a, b, 'alliance') || this.hasTreaty(a, b, 'defensePact');
  }

  /** Co-belligerent: fighting on the same side of some war. */
  coBelligerent(a: NationId, b: NationId): boolean {
    if (a === b) return true;
    for (const w of this.state.wars) {
      if ((w.attackers.includes(a) && w.attackers.includes(b)) || (w.defenders.includes(a) && w.defenders.includes(b))) return true;
    }
    return false;
  }

  /** May units of `a` enter territory owned by `b`? */
  canEnterTerritory(a: NationId, b: NationId): boolean {
    if (b < 0 || a === b) return true;
    if (this.atWar(a, b)) return true;
    return this.hasTreaty(a, b, 'alliance') || this.hasTreaty(a, b, 'militaryAccess');
  }

  /** Shares vision (alliance or map sharing). */
  sharesMap(a: NationId, b: NationId): boolean {
    return this.hasTreaty(a, b, 'alliance') || this.hasTreaty(a, b, 'mapSharing');
  }

  relation(a: NationId, b: NationId): number {
    if (a === b) return 100;
    return this.state.relations[a * this.N + b];
  }

  addRelation(a: NationId, b: NationId, delta: number): void {
    if (a === b || a < 0 || b < 0) return;
    const N = this.N;
    const v = Math.max(-100, Math.min(100, this.state.relations[a * N + b] + delta));
    this.state.relations[a * N + b] = v;
    this.state.relations[b * N + a] = v;
  }

  // ---- geometry ---------------------------------------------------------------
  owner(hex: number): NationId {
    return this.state.hexOwner[hex] - 1;
  }

  isWater(hex: number): boolean {
    return isWaterTerrain(this.terrain[hex]);
  }

  /** Real km of a single step from hex `from` in direction `dir`. */
  stepKm(from: number, dir: number): number {
    const row = this.grid.row(from);
    const k = dir === 0 || dir === 3 ? 0 : dir === 4 || dir === 5 ? 1 : 2;
    return this.stepKmRow[row * 3 + k];
  }

  /** Approximate real distance in km between two hex centres. */
  hexKm(a: number, b: number): number {
    const g = this.grid;
    return this.pointKm(g.cx[a], g.cz[a], g.cx[b], g.cz[b]);
  }

  pointKm(x0: number, z0: number, x1: number, z1: number): number {
    const zm = (z0 + z1) / 2;
    const row = Math.max(0, Math.min(this.grid.rows - 1, Math.round((zm - 1) / 1.5)));
    const dx = (x1 - x0) * this.kmEWRow[row];
    const dz = (z1 - z0) * this.kmNS;
    return Math.sqrt(dx * dx + dz * dz);
  }

  design(u: Unit): UnitDesign {
    return this.state.designs.get(u.design)!;
  }

  isLandUnit(u: Unit): boolean {
    return CATEGORY_CLASS[this.design(u).category] === UnitClass.Land;
  }

  city(id: number): City | undefined {
    return this.state.cities[id];
  }

  nation(n: NationId): Nation {
    return this.state.nations[n];
  }

  isUrban(hex: number): boolean {
    return this.terrain[hex] === Terrain.Urban || this.cityAt[hex] >= 0;
  }

  /** Stable per-entity pseudo random in [0,1). */
  hash01(...parts: number[]): number {
    let h = 2166136261 ^ this.state.seed;
    for (const p of parts) {
      h ^= p | 0;
      h = Math.imul(h, 16777619);
      h ^= h >>> 13;
    }
    return (h >>> 0) / 4294967296;
  }

  time<T>(key: string, fn: () => T): T {
    const t0 = performance.now();
    const r = fn();
    this.timing[key] = (this.timing[key] ?? 0) + performance.now() - t0;
    return r;
  }
}

const EMPTY: Unit[] = [];
const EMPTY_F: Facility[] = [];

export function codeHash(code: string): number {
  return hashString(code) / 4294967296;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function day(hour: number): number {
  return Math.floor(hour / 24);
}
