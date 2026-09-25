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
  /**
   * Connected component id of each owned land hex within its owner's territory
   * (-1 = water/unowned). Two own hexes with different ids cannot be reached
   * from each other by land without crossing foreign soil.
   */
  comp: Int32Array = new Int32Array(0);
  /** Main (largest) territory component per nation. */
  mainComp: Int32Array = new Int32Array(0);

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
    this.buildComponents(owner, n);
    this.ownerVersion = state.ownerVersion;
    this.builtHour = state.hour;
    this.version++;
  }

  private ownerRef: Uint16Array | null = null;

  private buildComponents(owner: Uint16Array, n: number): void {
    this.ownerRef = owner;
    const count = this.grid.count;
    const nb = this.grid.neighbours;
    const water = this.water;
    if (this.comp.length !== count) this.comp = new Int32Array(count);
    const comp = this.comp;
    comp.fill(-1);
    this.mainComp = new Int32Array(n).fill(-1);
    const bestSize = new Int32Array(n);
    const stack: number[] = [];
    let id = 0;
    for (let a = 0; a < n; a++) {
      for (const start of this.hexes[a]) {
        if (comp[start] >= 0) continue;
        const o = owner[start];
        comp[start] = id;
        stack.push(start);
        let size = 0;
        while (stack.length) {
          const h = stack.pop()!;
          size++;
          for (let d = 0; d < 6; d++) {
            const j = nb[h * 6 + d];
            if (j < 0 || comp[j] >= 0 || water[j] || owner[j] !== o) continue;
            comp[j] = id;
            stack.push(j);
          }
        }
        if (size > bestSize[a]) {
          bestSize[a] = size;
          this.mainComp[a] = id;
        }
        id++;
      }
    }
  }

  /**
   * Whether a land unit at `from` can plausibly reach own hex `to` by land.
   * Units standing outside their own territory are given the benefit of the doubt.
   */
  reachable(from: number, to: number): boolean {
    const a = this.comp[from];
    const b = this.comp[to];
    if (a < 0 || b < 0 || a === b) return true;
    // Different components of the same owner: separated by foreign soil or sea.
    const o = this.ownerRef;
    return !o || o[from] !== o[to];
  }

  private rebuildFacilities(state: GameState): void {
    const n = state.nations.length;
    this.facilities = Array.from({ length: n }, () => []);
    const owner = state.hexOwner;
    for (const f of state.facilities.values()) {
      // Facilities carry their owner (offshore platforms sit on unowned water).
      const a = typeof f.nation === 'number' ? f.nation : owner[f.hex] - 1;
      if (a >= 0 && a < n) this.facilities[a].push(f.id);
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

  /** Border hexes of a facing b that lie in a's main (largest) territory component. */
  mainBorderLength(a: number, b: number): number {
    const list = this.border[a]?.get(b);
    if (!list) return 0;
    const mc = this.mainComp[a];
    let k = 0;
    for (const h of list) if (this.comp[h] === mc) k++;
    return k;
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

  // Geodesic walk along the border: adjacent steps cost 1, 2-hex bridges cost 2.
  // Returns the component's hexes ordered by distance from `start`.
  const bfs = (start: number, mark: Set<number> | null): number[] => {
    const dist = new Map<number, number>([[start, 0]]);
    const done = new Set<number>();
    const order: number[] = [];
    const open: number[] = [start];
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) {
        const a = dist.get(open[i])!, b = dist.get(open[bi])!;
        if (a < b || (a === b && open[i] < open[bi])) bi = i;
      }
      const h = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (done.has(h)) continue;
      done.add(h);
      order.push(h);
      const dh = dist.get(h)!;
      grid.forRadius(h, 2, (m, d) => {
        if (d === 0 || !member.has(m) || done.has(m) || (mark && mark.has(m))) return;
        const nd = dh + d;
        const old = dist.get(m);
        if (old === undefined || nd < old) {
          dist.set(m, nd);
          open.push(m);
        }
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
