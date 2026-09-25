/**
 * Movement costs & A* over the hex grid, measured in game HOURS using real
 * distances (kmPerUnitAt — hexes near the poles are narrower east-west).
 *
 * hours per step = km / (speedKmh × OPERATIONAL_FACTOR × terrain × road/rail × river)
 */
import { MinHeap } from '../../core/heap';
import { Terrain } from '../../worldgen/types';
import { UnitClass, type Mobility, type NationId, type Unit, type UnitDesign } from '../types';
import type { Sim } from '../core';

/** March rate vs. top speed (halts, formation, traffic, refuelling). */
export const OPERATIONAL_FACTOR = 0.55;
/** Speed (km/h) of land units carried by sea. */
export const EMBARKED_SPEED = 26;
/** Naval cruise factor vs. top speed. */
export const NAVAL_FACTOR = 0.85;

// Indexed by Terrain: DeepOcean, Coastal, Lake, Plains, Farmland, Forest, Jungle, Hills, Mountains, Desert, Tundra, Marsh, Ice, Urban
export const TERRAIN_SPEED: Record<'foot' | 'wheeled' | 'tracked', number[]> = {
  foot: [0, 0, 0, 1.0, 1.0, 0.7, 0.45, 0.7, 0.4, 0.75, 0.6, 0.45, 0.3, 0.9],
  wheeled: [0, 0, 0, 1.0, 1.0, 0.5, 0.25, 0.55, 0.25, 0.65, 0.45, 0.25, 0.2, 0.85],
  tracked: [0, 0, 0, 1.0, 0.95, 0.6, 0.35, 0.65, 0.3, 0.8, 0.55, 0.3, 0.25, 0.75],
};

/** Terrain defence multipliers for land units being attacked. */
export const TERRAIN_DEFENSE = [1, 1, 1, 1.0, 1.0, 1.25, 1.35, 1.3, 1.6, 0.95, 1.0, 1.2, 1.0, 1.5];
/** Close terrain where vehicles attack at a penalty. */
export const CLOSE_TERRAIN = new Set<number>([Terrain.Forest, Terrain.Jungle, Terrain.Mountains, Terrain.Urban, Terrain.Marsh]);

export type MoveMode = 'land' | 'amphibious' | 'naval';

export interface MoveProfile {
  nation: NationId;
  mode: MoveMode;
  mobility: Mobility;
  speedKmh: number;
  /** Tech speed modifier (fraction). */
  speedMod: number;
  embarkMod: number;
  engineers: boolean;
}

export function profileFor(sim: Sim, u: Unit, mode?: MoveMode): MoveProfile {
  const d = sim.design(u);
  const n = sim.state.nations[u.nation];
  const cls = d.cls;
  return {
    nation: u.nation,
    mode: mode ?? (cls === UnitClass.Naval ? 'naval' : 'land'),
    mobility: d.mobility,
    speedKmh: d.speedKmh,
    speedMod: n.techMods.moveSpeed ?? 0,
    embarkMod: n.techMods.embarkSpeed ?? 0,
    engineers: false,
  };
}

/** Can a land unit of `nation` embark from this land hex (friendly port / naval base)? */
export function isEmbarkPoint(sim: Sim, nation: NationId, hex: number): boolean {
  const owner = sim.owner(hex);
  if (owner !== nation && !(owner >= 0 && (sim.isAllied(nation, owner) || sim.hasTreaty(nation, owner, 'militaryAccess')))) return false;
  const cid = sim.cityAt[hex];
  if (cid >= 0 && sim.state.cities[cid].port && sim.coast[hex]) return true;
  const fl = sim.state.hexFacilities.get(hex);
  if (fl) for (const id of fl) {
    const f = sim.state.facilities.get(id);
    if (f && f.type === 18 /* NavalBase */ && f.constructionDaysLeft <= 0) return true;
  }
  return false;
}

/**
 * Hours to step from `from` to adjacent `to` (direction `dir`). Infinity if
 * impassable for this profile. Does not consider units (dynamic blocking is
 * handled by movement).
 */
export function stepHours(sim: Sim, p: MoveProfile, from: number, to: number, dir: number): number {
  const w = sim.world;
  const tt = sim.terrain[to];
  const toWater = tt <= Terrain.Lake;
  const km = sim.stepKm(from, dir);
  if (p.mode === 'naval') {
    if (!toWater) return Infinity;
    return km / (p.speedKmh * NAVAL_FACTOR * (1 + p.speedMod * 0.5));
  }
  const fromWater = sim.terrain[from] <= Terrain.Lake;
  // Ownership rules for entering land.
  if (!toWater) {
    const owner = sim.state.hexOwner[to] - 1;
    if (owner >= 0 && owner !== p.nation && !sim.canEnterTerritory(p.nation, owner)) return Infinity;
  }
  if (p.mode === 'land') {
    if (toWater) return Infinity;
  } else {
    // amphibious
    if (toWater) {
      if (!fromWater && !isEmbarkPoint(sim, p.nation, from)) return Infinity;
      return km / (EMBARKED_SPEED * (1 + p.embarkMod));
    }
    if (fromWater) return km / (EMBARKED_SPEED * (1 + p.embarkMod)) + 6; // landing
  }
  const mob = p.mobility === 'foot' || p.mobility === 'wheeled' || p.mobility === 'tracked' ? p.mobility : 'foot';
  let f = TERRAIN_SPEED[mob][tt];
  if (f <= 0) return Infinity;
  const road = (w.hexRoad[from] >> dir) & 1;
  const rail = (w.hexRail[from] >> dir) & 1;
  if (rail) {
    const owner = sim.state.hexOwner[to] - 1;
    if (owner === p.nation || (owner >= 0 && sim.isAllied(p.nation, owner))) f = Math.max(f, 3.0);
    else if (road) f = Math.max(f, mob === 'foot' ? 1.25 : 1.6);
  } else if (road) {
    f = Math.max(f, mob === 'foot' ? 1.25 : 1.6);
  }
  if ((w.hexRiverEdges[from] >> dir) & 1) f *= road || rail ? 0.9 : p.engineers ? 0.8 : 0.5;
  return km / (p.speedKmh * OPERATIONAL_FACTOR * f * (1 + p.speedMod));
}

/** A* with a real-distance heuristic and typed-array bookkeeping (reused between searches). */
export class PathSearch {
  private g: Float32Array;
  private parent: Int32Array;
  private stamp: Uint32Array;
  private closed: Uint32Array;
  private gen = 1;
  private heap = new MinHeap(8192);
  lastCost = Infinity;
  lastExpanded = 0;

  constructor(private sim: Sim) {
    const n = sim.grid.count;
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
  }

  private nextGen(): number {
    this.gen++;
    if (this.gen >= 0xfffffff0) { this.stamp.fill(0); this.closed.fill(0); this.gen = 1; }
    return this.gen;
  }

  /** Returns hexes from start (exclusive) to goal (inclusive), or null. */
  find(start: number, goal: number, p: MoveProfile, maxExpand?: number): number[] | null {
    this.lastCost = Infinity;
    if (start === goal) { this.lastCost = 0; return []; }
    const sim = this.sim;
    const grid = sim.grid;
    const nb = grid.neighbours;
    const gen = this.nextGen();
    const heap = this.heap;
    heap.clear();
    const g = this.g, parent = this.parent, stamp = this.stamp, closed = this.closed;
    const cx = grid.cx, cz = grid.cz;
    const gx = cx[goal], gz = cz[goal];
    let hSpeed: number;
    if (p.mode === 'naval') hSpeed = p.speedKmh * NAVAL_FACTOR * (1 + p.speedMod * 0.5);
    else hSpeed = Math.max(p.speedKmh * OPERATIONAL_FACTOR * 2.0 * (1 + p.speedMod), p.mode === 'amphibious' ? EMBARKED_SPEED * (1 + p.embarkMod) : 0);
    const kmNS = sim.kmNS, kmEW = sim.kmEWRow;
    const rows = grid.rows;
    const heur = (h: number): number => {
      const dz = (gz - cz[h]);
      const zm = (gz + cz[h]) * 0.5;
      const row = Math.min(rows - 1, Math.max(0, ((zm - 1) / 1.5) | 0));
      const dx = (gx - cx[h]) * kmEW[row];
      return Math.sqrt(dx * dx + dz * dz * kmNS * kmNS) / hSpeed;
    };
    const limit = maxExpand ?? (p.mode === 'land' ? 60000 : 160000);
    g[start] = 0;
    parent[start] = -1;
    stamp[start] = gen;
    heap.push(start, heur(start));
    let expanded = 0;
    while (heap.size > 0) {
      const cur = heap.pop();
      if (closed[cur] === gen) continue;
      closed[cur] = gen;
      if (cur === goal) {
        this.lastCost = g[goal];
        this.lastExpanded = expanded;
        const path: number[] = [];
        let c = goal;
        while (c !== start && c !== -1) { path.push(c); c = parent[c]; }
        path.reverse();
        return path;
      }
      if (++expanded > limit) break;
      const gc = g[cur];
      const base = cur * 6;
      for (let d = 0; d < 6; d++) {
        const n = nb[base + d];
        if (n < 0 || closed[n] === gen) continue;
        const c = stepHours(sim, p, cur, n, d);
        if (c === Infinity) continue;
        const ng = gc + c;
        if (stamp[n] !== gen || ng < g[n]) {
          stamp[n] = gen;
          g[n] = ng;
          parent[n] = cur;
          heap.push(n, ng + heur(n));
        }
      }
    }
    this.lastExpanded = expanded;
    return null;
  }
}

/** Best water hex adjacent to a land hex (for ships targeting a coast / spawning at ports). */
export function adjacentWater(sim: Sim, hex: number, prefer = -1): number {
  const nb = sim.grid.neighbours;
  let best = -1, bestD = Infinity;
  for (let d = 0; d < 6; d++) {
    const n = nb[hex * 6 + d];
    if (n < 0 || !sim.isWater(n)) continue;
    const dd = prefer >= 0 ? sim.grid.distance(n, prefer) : sim.terrain[n] === Terrain.DeepOcean ? 1 : 0;
    if (dd < bestD) { bestD = dd; best = n; }
  }
  return best;
}

export function designSpeedLabel(d: UnitDesign): string {
  return `${d.speedKmh} km/h`;
}
