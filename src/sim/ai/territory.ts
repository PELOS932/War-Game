/**
 * Global territory index shared by all AI nations: land hexes, land borders
 * per neighbour, coastal hexes, cities and facilities per nation. Rebuilt
 * lazily when hex ownership / facilities change (throttled), so every AI
 * minister can query borders in O(1).
 */
import type { HexGrid } from '../../core/hex';
import type { GameState } from '../types';
import { isWaterTerrain } from '../../worldgen/types';

export class TerritoryIndex {
  ownerVersion = -1;
  facilityVersion = -1;
  builtHour = -1e9;
  /** Incremented on every rebuild (for dependent caches such as fronts). */
  version = 0;
  n = 0;
  hexes: number[][] = [];
  /** border[a].get(b) = hexes of a adjacent to land hexes of b. */
  border: Map<number, number[]>[] = [];
  /** Land hexes of a adjacent to sea. */
  coastal: number[][] = [];
  cities: number[][] = [];
  facilities: number[][] = [];
  cx: Float64Array = new Float64Array(0);
  cz: Float64Array = new Float64Array(0);
  /** Water mask (1 = water) cached from world terrain. */
  water: Uint8Array = new Uint8Array(0);

  constructor(private grid: HexGrid) {}

  /**
   * Rebuild when ownership changed and at least `minHours` passed since the
   * last rebuild (or `force`). Returns true when rebuilt.
   */
  refresh(state: GameState, minHours: number, force = false): boolean {
    let rebuilt = false;
    const ownerChanged = state.ownerVersion !== this.ownerVersion;
    if (force || this.n !== state.nations.length || (ownerChanged && state.hour - this.builtHour >= minHours)) {
      this.rebuildOwnership(state);
      rebuilt = true;
    }
    if (rebuilt || state.facilityVersion !== this.facilityVersion) this.rebuildFacilities(state);
    return rebuilt;
  }

  private rebuildOwnership(state: GameState): void {
    const grid = this.grid;
    const n = state.nations.length;
    const count = grid.count;
    if (this.water.length !== count) {
      this.water = new Uint8Array(count);
      const t = state.world.hexTerrain;
      for (let i = 0; i < count; i++) this.water[i] = isWaterTerrain(t[i]) ? 1 : 0;
    }
    const water = this.water;
    const owner = state.hexOwner;
    const nb = grid.neighbours;
    const coastFlag = state.world.hexCoast;
    this.n = n;
    this.hexes = Array.from({ length: n }, () => []);
    this.border = Array.from({ length: n }, () => new Map<number, number[]>());
    this.coastal = Array.from({ length: n }, () => []);
    this.cities = Array.from({ length: n }, () => []);
    const sx = new Float64Array(n);
    const sz = new Float64Array(n);
    for (let i = 0; i < count; i++) {
      const o = owner[i];
      if (o === 0 || water[i]) continue;
      const a = o - 1;
      if (a >= n) continue;
      this.hexes[a].push(i);
      sx[a] += grid.cx[i];
      sz[a] += grid.cz[i];
      if (coastFlag[i]) this.coastal[a].push(i);
      const map = this.border[a];
      for (let d = 0; d < 6; d++) {
        const j = nb[i * 6 + d];
        if (j < 0) continue;
        const p = owner[j];
        if (p === 0 || p === o || water[j]) continue;
        const b = p - 1;
        let list = map.get(b);
        if (!list) {
          list = [];
          map.set(b, list);
        }
        if (list.length === 0 || list[list.length - 1] !== i) list.push(i);
      }
    }
    this.cx = new Float64Array(n);
    this.cz = new Float64Array(n);
    for (let a = 0; a < n; a++) {
      const k = this.hexes[a].length;
      if (k > 0) {
        this.cx[a] = sx[a] / k;
        this.cz[a] = sz[a] / k;
      }
    }
    for (const c of state.cities) {
      const o = owner[c.hex];
      if (o > 0 && o - 1 < n) this.cities[o - 1].push(c.id);
    }
    this.ownerVersion = state.ownerVersion;
    this.builtHour = state.hour;
    this.version++;
  }

  private rebuildFacilities(state: GameState): void {
    const n = state.nations.length;
    this.facilities = Array.from({ length: n }, () => []);
    const owner = state.hexOwner;
    for (const f of state.facilities.values()) {
      const o = owner[f.hex];
      if (o > 0 && o - 1 < n) this.facilities[o - 1].push(f.id);
    }
    this.facilityVersion = state.facilityVersion;
  }

  landNeighbours(a: number): number[] {
    const m = this.border[a];
    return m ? [...m.keys()] : [];
  }

  borderLength(a: number, b: number): number {
    return this.border[a]?.get(b)?.length ?? 0;
  }
}

/**
 * Split a border (list of hexes) into contiguous sectors of roughly
 * `targetSize` hexes by walking the border chain from one end (double-sweep
 * BFS with a 2-hex bridging radius). Deterministic. Returns hex lists.
 */
export function clusterBorder(grid: HexGrid, hexes: readonly number[], targetSize: number): number[][] {
  if (hexes.length === 0) return [];
  const member = new Set<number>(hexes);
  const visited = new Set<number>();
  const sectors: number[][] = [];
  const sorted = [...hexes].sort((a, b) => a - b);

  const bfs = (start: number, mark: Set<number> | null): number[] => {
    const seen = new Set<number>([start]);
    const order: number[] = [start];
    for (let qi = 0; qi < order.length; qi++) {
      const h = order[qi];
      grid.forRadius(h, 2, (m) => {
        if (!member.has(m) || seen.has(m) || (mark && mark.has(m))) return;
        seen.add(m);
        order.push(m);
      });
    }
    return order;
  };

  for (const h0 of sorted) {
    if (visited.has(h0)) continue;
    // First sweep: find an endpoint of this component.
    const first = bfs(h0, visited);
    const end = first[first.length - 1];
    const order = bfs(end, visited);
    for (const h of order) visited.add(h);
    const k = Math.max(1, Math.round(order.length / targetSize));
    const size = order.length / k;
    for (let s = 0; s < k; s++) {
      const chunk = order.slice(Math.round(s * size), Math.round((s + 1) * size));
      if (chunk.length) sectors.push(chunk);
    }
  }
  return sectors;
}

/** Medoid (hex minimising total distance to the others) of a small set. */
export function medoid(grid: HexGrid, hexes: readonly number[]): number {
  if (hexes.length <= 2) return hexes[0];
  let best = hexes[0];
  let bestSum = Infinity;
  const step = hexes.length > 24 ? Math.ceil(hexes.length / 24) : 1;
  for (let i = 0; i < hexes.length; i += step) {
    let s = 0;
    for (let j = 0; j < hexes.length; j += step) s += grid.distance(hexes[i], hexes[j]);
    if (s < bestSum) {
      bestSum = s;
      best = hexes[i];
    }
  }
  return best;
}
