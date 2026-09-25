/**
 * Supply network: per nation, a multi-source Dijkstra from cities, depots and
 * army bases through its own territory (roads & rails cheapen, rough terrain
 * costs more). Result stored in state.supply (0..100 per hex for its owner).
 * Refreshed staggered: warring nations every few hours, others every two days.
 */
import { MinHeap } from '../../core/heap';
import { FacilityType, UnitClass, type NationId, type Unit } from '../types';
import { Terrain } from '../../worldgen/types';
import type { Sim } from '../core';

const TERRAIN_SUPPLY_COST = [99, 99, 99, 1.0, 1.0, 1.5, 2.2, 1.5, 2.6, 1.4, 1.5, 2.0, 2.5, 0.8];
const BASE_COST = 3.2;

export class SupplyNetwork {
  private written: Int32Array[] = [];
  private g: Float32Array;
  private stamp: Uint32Array;
  private gen = 1;
  private heap = new MinHeap(4096);
  /** Hour each nation was last refreshed. */
  lastRefresh: Float64Array;

  constructor(private sim: Sim) {
    const n = sim.grid.count;
    this.g = new Float32Array(n);
    this.stamp = new Uint32Array(n);
    this.lastRefresh = new Float64Array(sim.N).fill(-1e9);
    for (let i = 0; i < sim.N; i++) this.written.push(new Int32Array(0));
  }

  refresh(nation: NationId): void {
    const sim = this.sim;
    const st = sim.state;
    const supply = st.supply;
    const owner = st.hexOwner;
    const me = nation + 1;
    // Clear previous values that are still ours.
    const old = this.written[nation];
    for (let i = 0; i < old.length; i++) if (owner[old[i]] === me) supply[old[i]] = 0;
    this.lastRefresh[nation] = st.hour;
    const n = st.nations[nation];
    if (!n.alive) { this.written[nation] = new Int32Array(0); return; }
    // Sources.
    const heap = this.heap;
    heap.clear();
    this.gen++;
    const gen = this.gen;
    const g = this.g, stamp = this.stamp;
    const push = (hex: number, strength: number) => {
      if (owner[hex] !== me) return;
      const deficit = 100 - strength;
      if (stamp[hex] === gen && g[hex] <= deficit) return;
      stamp[hex] = gen;
      g[hex] = deficit;
      heap.push(hex, deficit);
    };
    for (const c of st.cities) {
      if (owner[c.hex] !== me) continue;
      const base = c.capital ? 100 : c.population >= 1000 ? 95 : c.population >= 300 ? 88 : 78;
      push(c.hex, base * (1 - c.damage * 0.4));
    }
    for (const f of sim.nationFacilities(nation)) {
      if (f.constructionDaysLeft > 0 || f.damage > 0.7) continue;
      if (f.type === FacilityType.SupplyDepot) push(f.hex, 92 + 4 * f.level);
      else if (f.type === FacilityType.Barracks || f.type === FacilityType.NavalBase) push(f.hex, 85);
    }
    const rangeMod = 1 - Math.min(0.5, n.techMods.supplyRange ?? 0);
    const grid = sim.grid;
    const nb = grid.neighbours;
    const T = sim.terrain;
    const road = sim.world.hexRoad, rail = sim.world.hexRail, river = sim.world.hexRiverEdges;
    const out: number[] = [];
    while (heap.size > 0) {
      const cur = heap.pop();
      const gc = g[cur];
      if (stamp[cur] !== gen) continue;
      if (gc < 0) continue; // already settled marker
      const val = Math.max(0, Math.round(100 - gc));
      if (supply[cur] !== val || out.length === 0 || true) supply[cur] = val;
      out.push(cur);
      g[cur] = -1 - gc; // mark settled
      if (val <= 0) continue;
      for (let d = 0; d < 6; d++) {
        const m = nb[cur * 6 + d];
        if (m < 0 || owner[m] !== me) continue;
        if (stamp[m] === gen && g[m] < 0) continue;
        const t = T[m];
        let c = BASE_COST * TERRAIN_SUPPLY_COST[t];
        if ((rail[cur] >> d) & 1) c *= 0.3;
        else if ((road[cur] >> d) & 1) c *= 0.5;
        if ((river[cur] >> d) & 1) c += 1;
        c *= rangeMod;
        const ng = gc + c;
        if (stamp[m] !== gen || ng < g[m]) {
          stamp[m] = gen;
          g[m] = ng;
          heap.push(m, ng);
        }
      }
    }
    this.written[nation] = Int32Array.from(out);
    void Terrain;
  }

  /** Staggered refresh: called every hour. */
  tick(): void {
    const sim = this.sim;
    const hour = sim.state.hour;
    for (let i = 0; i < sim.N; i++) {
      const n = sim.state.nations[i];
      if (!n.alive) continue;
      const interval = sim.warring.has(i) ? 4 : 48;
      if (hour - this.lastRefresh[i] >= interval && (i + hour) % (sim.warring.has(i) ? 4 : 24) === 0) this.refresh(i);
    }
  }

  refreshAll(): void {
    for (let i = 0; i < this.sim.N; i++) this.refresh(i);
  }
}

/** Supply 0..100 available to `nation` at `hex`. */
export function supplyAt(sim: Sim, nation: NationId, hex: number): number {
  if (hex < 0 || hex >= sim.grid.count) return 0;
  const st = sim.state;
  const owner = st.hexOwner[hex] - 1;
  if (owner === nation) return st.supply[hex];
  if (owner >= 0) {
    if (sim.hasTreaty(nation, owner, 'alliance') || sim.coBelligerent(nation, owner)) return st.supply[hex] * 0.8;
    if (sim.hasTreaty(nation, owner, 'militaryAccess')) return st.supply[hex] * 0.5;
  }
  // Foreign / unowned / sea: draw from nearby own hexes.
  let best = 0;
  sim.grid.forRadius(hex, 2, (h, d) => {
    if (st.hexOwner[h] - 1 === nation) best = Math.max(best, st.supply[h] - 20 * d);
  });
  return Math.max(0, best);
}

/** Hourly unit resupply / consumption. */
export function supplyUnitsHour(sim: Sim): void {
  const st = sim.state;
  for (const u of st.units.values()) {
    const d = sim.design(u);
    if (d.cls === UnitClass.Air) continue; // handled by air ops
    const n = st.nations[u.nation];
    if (d.cls === UnitClass.Naval) {
      if (nearFriendlyPort(sim, u)) {
        u.supply = Math.min(100, u.supply + 10);
        u.fuel = Math.min(100, u.fuel + 10);
        if (!u.inCombat && u.strength < 100) u.strength = Math.min(100, u.strength + 0.08);
      } else {
        u.supply = Math.max(0, u.supply - 0.12);
      }
      continue;
    }
    const s = u.embarked ? 20 : supplyAt(sim, u.nation, u.hex);
    const matSat = Math.min(1, 0.3 + 0.7 * n.satisfaction[10]);
    const fuelSat = Math.min(1, 0.3 + 0.7 * n.satisfaction[3]);
    if (s > u.supply) u.supply = Math.min(s, u.supply + (3 + s / 20) * matSat);
    else if (s < 20) u.supply = Math.max(0, u.supply - (u.inCombat ? 1.5 : 0.4));
    if (s > u.fuel) u.fuel = Math.min(s, u.fuel + (3 + s / 20) * fuelSat);
    // Efficiency cap from supply and DEFCON readiness.
    const cap = Math.min(defconCap(n.defcon), 35 + 0.65 * Math.max(u.supply, s));
    if (u.efficiency > cap) u.efficiency = Math.max(cap, u.efficiency - 1.5);
    else if (!u.inCombat) u.efficiency = Math.min(cap, u.efficiency + 0.6 * (1 + (n.techMods.efficiencyRecovery ?? 0)));
    // Slow replacement of losses when well supplied and quiet.
    if (!u.inCombat && s >= 70 && u.strength < 100 && st.hour - u.lastCombatHour > 24) u.strength = Math.min(100, u.strength + 0.05);
  }
}

export function defconCap(defcon: number): number {
  return defcon <= 1 ? 100 : defcon === 2 ? 95 : defcon === 3 ? 85 : defcon === 4 ? 80 : 75;
}

export function nearFriendlyPort(sim: Sim, u: Unit): boolean {
  const g = sim.grid;
  for (let d = 0; d < 6; d++) {
    const m = g.neighbours[u.hex * 6 + d];
    if (m < 0) continue;
    const o = sim.owner(m);
    if (o < 0 || (o !== u.nation && !sim.isAllied(o, u.nation))) continue;
    const cid = sim.cityAt[m];
    if (cid >= 0 && sim.state.cities[cid].port) return true;
    for (const f of sim.facilitiesAt(m)) if (f.type === FacilityType.NavalBase && f.constructionDaysLeft <= 0) return true;
  }
  return false;
}
