/**
 * Shared AI context: the GameAPI, cached indices (territory, units, designs),
 * per-nation memories and small query helpers used by all ministers.
 */
import type { GameAPI } from '../api';
import type { HexGrid } from '../../core/hex';
import { CATEGORY_CLASS, UnitClass, type GameState, type Nation, type Unit, type War } from '../types';
import { KM_PER_UNIT, kmPerUnitAt } from '../../worldgen/types';
import { analyseDesign, readiness, type DesignInfo } from './designs';
import { TerritoryIndex } from './territory';
import { createMemory, type NationMemory } from './memory';

export const CATEGORY_COUNT = 24;

export interface AIGlobalLogEntry {
  hour: number;
  nation: number;
  kind: 'war' | 'peace' | 'prep' | 'treaty' | 'offensive' | 'amphib' | 'capture' | 'economy' | 'join' | 'abandon';
  text: string;
}

/** Per-hour index of all units, bucketed by nation and class, with power totals. */
export class UnitIndex {
  hour = -1;
  byNation: Unit[][] = [];
  land: Unit[][] = [];
  air: Unit[][] = [];
  naval: Unit[][] = [];
  landPower = new Float64Array(0);
  airPower = new Float64Array(0);
  navalPower = new Float64Array(0);
  /** Upkeep of existing units, millions USD per day. */
  upkeep = new Float64Array(0);
  /** Unit counts per nation per category: [nation * CATEGORY_COUNT + cat]. */
  catCount = new Float64Array(0);
  /** Land power by category (for composition analysis). */
  armorPower = new Float64Array(0);
  byHex = new Map<number, Unit[]>();

  rebuild(state: GameState, designs: (id: string) => DesignInfo | undefined): void {
    const n = state.nations.length;
    this.byNation = Array.from({ length: n }, () => []);
    this.land = Array.from({ length: n }, () => []);
    this.air = Array.from({ length: n }, () => []);
    this.naval = Array.from({ length: n }, () => []);
    this.landPower = new Float64Array(n);
    this.airPower = new Float64Array(n);
    this.navalPower = new Float64Array(n);
    this.upkeep = new Float64Array(n);
    this.catCount = new Float64Array(n * CATEGORY_COUNT);
    this.armorPower = new Float64Array(n);
    this.byHex.clear();
    for (const u of state.units.values()) {
      const a = u.nation;
      if (a < 0 || a >= n) continue;
      const info = designs(u.design);
      if (!info) continue;
      this.byNation[a].push(u);
      const r = readiness(u);
      this.upkeep[a] += info.d.upkeep;
      this.catCount[a * CATEGORY_COUNT + info.cat] += 1;
      if (info.cls === UnitClass.Land) {
        this.land[a].push(u);
        this.landPower[a] += Math.max(1, info.ground) * r;
        if (info.role === 'mobile') this.armorPower[a] += Math.max(1, info.ground) * r;
      } else if (info.cls === UnitClass.Air) {
        this.air[a].push(u);
        this.airPower[a] += Math.max(1, info.airCombat + 0.5 * info.airStrike) * r;
      } else {
        this.naval[a].push(u);
        this.navalPower[a] += Math.max(1, info.naval) * r;
      }
      let list = this.byHex.get(u.hex);
      if (!list) {
        list = [];
        this.byHex.set(u.hex, list);
      }
      list.push(u);
    }
    this.hour = state.hour;
  }
}

export interface WarView {
  war: War;
  attacker: boolean;
  enemies: number[];
  friends: number[];
  /** War score from this nation's perspective (positive = winning). */
  score: number;
}

export class AIContext {
  readonly game: GameAPI;
  readonly state: GameState;
  readonly grid: HexGrid;
  readonly terr: TerritoryIndex;
  readonly units = new UnitIndex();
  readonly mem: NationMemory[] = [];
  readonly log: AIGlobalLogEntry[] = [];
  private designCache = new Map<string, DesignInfo>();
  private kmNS: number;
  private isEarth: boolean;
  /** Timing statistics (ms). */
  timing = { hourTotal: 0, hours: 0, maxHour: 0, byDept: new Map<string, number>() };
  private warCacheHour = -1;
  private warCache = new Map<number, WarView[]>();
  private allyCacheHour = -1;
  private allyCache = new Map<number, number[]>();

  constructor(game: GameAPI) {
    this.game = game;
    this.state = game.state;
    this.grid = game.state.grid;
    this.terr = new TerritoryIndex(this.grid);
    const s = this.state.world.settings;
    this.isEarth = s.kind === 'earth';
    this.kmNS = this.isEarth ? kmPerUnitAt(0, s).ns : KM_PER_UNIT;
    this.ensureMemories();
  }

  ensureMemories(): void {
    const seed = this.state.world.settings.seed | 0;
    while (this.mem.length < this.state.nations.length) this.mem.push(createMemory(this.mem.length, seed));
  }

  design(id: string): DesignInfo | undefined {
    let info = this.designCache.get(id);
    if (!info) {
      const d = this.state.designs.get(id);
      if (!d) return undefined;
      info = analyseDesign(d);
      this.designCache.set(id, info);
    }
    return info;
  }

  refreshUnits(): void {
    if (this.units.hour !== this.state.hour) this.units.rebuild(this.state, (id) => this.design(id));
  }

  nation(id: number): Nation {
    return this.state.nations[id];
  }

  /** Approximate great-circle-ish distance in km between two hexes. */
  km(a: number, b: number): number {
    const g = this.grid;
    const dx = g.cx[a] - g.cx[b];
    const dz = g.cz[a] - g.cz[b];
    if (!this.isEarth) return Math.sqrt(dx * dx + dz * dz) * this.kmNS;
    const ew = kmPerUnitAt((g.cz[a] + g.cz[b]) * 0.5, this.state.world.settings).ew;
    const x = dx * ew;
    const z = dz * this.kmNS;
    return Math.sqrt(x * x + z * z);
  }

  /** Approximate km per hex step near a hex. */
  kmPerHex(h: number): number {
    if (!this.isEarth) return Math.sqrt(3) * this.kmNS;
    const ew = kmPerUnitAt(this.grid.cz[h], this.state.world.settings).ew;
    return Math.sqrt(3) * Math.sqrt(ew * this.kmNS);
  }

  owner(hex: number): number {
    return this.state.hexOwner[hex] - 1;
  }

  private buildWarCache(): void {
    if (this.warCacheHour === this.state.hour) return;
    this.warCacheHour = this.state.hour;
    this.warCache.clear();
    for (const w of this.state.wars) {
      for (const a of w.attackers) this.pushWar(a, w, true);
      for (const d of w.defenders) this.pushWar(d, w, false);
    }
  }

  private pushWar(n: number, w: War, attacker: boolean): void {
    let list = this.warCache.get(n);
    if (!list) {
      list = [];
      this.warCache.set(n, list);
    }
    list.push({
      war: w,
      attacker,
      enemies: attacker ? w.defenders : w.attackers,
      friends: attacker ? w.attackers : w.defenders,
      score: attacker ? w.score : -w.score,
    });
  }

  warsOf(n: number): WarView[] {
    this.buildWarCache();
    return this.warCache.get(n) ?? [];
  }

  enemiesOf(n: number): number[] {
    const out: number[] = [];
    for (const w of this.warsOf(n)) {
      for (const e of w.enemies) if (!out.includes(e) && this.state.nations[e]?.alive) out.push(e);
    }
    return out;
  }

  atWarAny(n: number): boolean {
    return this.warsOf(n).length > 0;
  }

  /** Nations bound to defend `n`: alliances, defence pacts and military blocs. */
  alliesOf(n: number): number[] {
    if (this.allyCacheHour !== this.state.hour) {
      this.allyCache.clear();
      this.allyCacheHour = this.state.hour;
    }
    const cached = this.allyCache.get(n);
    if (cached) return cached;
    const out = new Set<number>();
    for (const t of this.state.treaties) {
      if (t.type !== 'alliance' && t.type !== 'defensePact') continue;
      if (t.a === n) out.add(t.b);
      else if (t.b === n) out.add(t.a);
    }
    const me = this.state.nations[n];
    const blocs = this.state.world.blocs;
    for (const b of me.blocs) {
      if (!blocs[b]?.military) continue;
      for (const o of this.state.nations) {
        if (o.id !== n && o.alive && o.blocs.includes(b)) out.add(o.id);
      }
    }
    const list = [...out].filter((x) => this.state.nations[x]?.alive);
    this.allyCache.set(n, list);
    return list;
  }

  sameMilitaryBloc(a: number, b: number): boolean {
    const blocs = this.state.world.blocs;
    const A = this.state.nations[a];
    const B = this.state.nations[b];
    for (const x of A.blocs) if (blocs[x]?.military && B.blocs.includes(x)) return true;
    return false;
  }

  sameBloc(a: number, b: number): boolean {
    const A = this.state.nations[a];
    const B = this.state.nations[b];
    for (const x of A.blocs) if (B.blocs.includes(x)) return true;
    return false;
  }

  totalPower(n: number): number {
    this.refreshUnits();
    return this.units.landPower[n] + 0.8 * this.units.airPower[n] + 0.5 * this.units.navalPower[n];
  }

  /** Whether `me` controls this department (AI nation or delegated by the player). */
  controls(me: number, dept: 'economy' | 'trade' | 'research' | 'production' | 'diplomacy' | 'military'): boolean {
    const n = this.state.nations[me];
    if (!n || !n.alive) return false;
    if (!n.isPlayer) return true;
    return !!n.autonomy?.[dept];
  }

  capitalHex(n: number): number {
    const nat = this.state.nations[n];
    const c = nat.capitalCity >= 0 ? this.state.cities[nat.capitalCity] : undefined;
    if (c && this.owner(c.hex) === n) return c.hex;
    // Fallback: biggest owned city, else centroid-ish hex.
    let best = -1;
    let bestPop = -1;
    for (const id of this.terr.cities[n] ?? []) {
      const city = this.state.cities[id];
      if (city.population > bestPop) {
        bestPop = city.population;
        best = city.hex;
      }
    }
    if (best >= 0) return best;
    const hx = this.terr.hexes[n];
    return hx && hx.length ? hx[0] : -1;
  }

  globalLog(nation: number, kind: AIGlobalLogEntry['kind'], text: string): void {
    this.log.push({ hour: this.state.hour, nation, kind, text });
    if (this.log.length > 5000) this.log.splice(0, 1000);
  }

  isAirCategoryClass(cat: number): boolean {
    return CATEGORY_CLASS[cat as keyof typeof CATEGORY_CLASS] === UnitClass.Air;
  }
}
