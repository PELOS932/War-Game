import { HexGrid } from './hex';
import { MinHeap } from './heap';

/**
 * Cost of moving from hex `from` into adjacent hex `to` via direction `dir`.
 * Return Infinity (or a negative number) for impassable.
 */
export type StepCost = (from: number, to: number, dir: number) => number;

/** Reusable A* / Dijkstra search over a HexGrid. */
export class HexPathfinder {
  private grid: HexGrid;
  private g: Float64Array;
  private parent: Int32Array;
  private stamp: Uint32Array;
  private closed: Uint32Array;
  private gen = 1;
  private heap = new MinHeap(4096);

  constructor(grid: HexGrid) {
    this.grid = grid;
    this.g = new Float64Array(grid.count);
    this.parent = new Int32Array(grid.count);
    this.stamp = new Uint32Array(grid.count);
    this.closed = new Uint32Array(grid.count);
  }

  private nextGen(): number {
    this.gen++;
    if (this.gen >= 0xfffffff0) {
      this.stamp.fill(0);
      this.closed.fill(0);
      this.gen = 1;
    }
    return this.gen;
  }

  /**
   * A* search. `minStepCost` must be a lower bound of the cost per hex step for
   * an admissible heuristic. Returns the list of hexes from start to goal
   * (inclusive) or null.
   */
  find(start: number, goal: number, cost: StepCost, minStepCost: number, maxExpand = 200000): number[] | null {
    if (start === goal) return [start];
    const grid = this.grid;
    const gen = this.nextGen();
    const heap = this.heap;
    heap.clear();
    const g = this.g, parent = this.parent, stamp = this.stamp, closed = this.closed;
    const nb = grid.neighbours;
    g[start] = 0;
    parent[start] = -1;
    stamp[start] = gen;
    heap.push(start, grid.distance(start, goal) * minStepCost);
    let expanded = 0;
    while (heap.size > 0) {
      const cur = heap.pop();
      if (closed[cur] === gen) continue;
      closed[cur] = gen;
      if (cur === goal) return this.reconstruct(goal);
      if (++expanded > maxExpand) return null;
      const gc = g[cur];
      for (let d = 0; d < 6; d++) {
        const n = nb[cur * 6 + d];
        if (n < 0 || closed[n] === gen) continue;
        const c = cost(cur, n, d);
        if (!(c >= 0) || c === Infinity) continue;
        const ng = gc + c;
        if (stamp[n] !== gen || ng < g[n]) {
          stamp[n] = gen;
          g[n] = ng;
          parent[n] = cur;
          heap.push(n, ng + grid.distance(n, goal) * minStepCost);
        }
      }
    }
    return null;
  }

  private reconstruct(goal: number): number[] {
    const path: number[] = [];
    let c = goal;
    while (c !== -1) {
      path.push(c);
      c = this.parent[c];
    }
    path.reverse();
    return path;
  }

  /** Cost of the last found path's goal (valid right after find()). */
  lastCost(goal: number): number {
    return this.stamp[goal] === this.gen ? this.g[goal] : Infinity;
  }

  /**
   * Multi-source Dijkstra flood. Calls visit(hex, cost, source) for each settled
   * hex in increasing cost order until maxCost. Returns nothing; use callbacks.
   */
  flood(
    sources: number[],
    cost: StepCost,
    maxCost: number,
    visit: (hex: number, cost: number) => boolean | void,
  ): void {
    const gen = this.nextGen();
    const heap = this.heap;
    heap.clear();
    const g = this.g, stamp = this.stamp, closed = this.closed;
    const nb = this.grid.neighbours;
    for (const s of sources) {
      g[s] = 0;
      stamp[s] = gen;
      heap.push(s, 0);
    }
    while (heap.size > 0) {
      const cur = heap.pop();
      if (closed[cur] === gen) continue;
      closed[cur] = gen;
      const gc = g[cur];
      if (visit(cur, gc) === false) continue;
      for (let d = 0; d < 6; d++) {
        const n = nb[cur * 6 + d];
        if (n < 0 || closed[n] === gen) continue;
        const c = cost(cur, n, d);
        if (!(c >= 0) || c === Infinity) continue;
        const ng = gc + c;
        if (ng > maxCost) continue;
        if (stamp[n] !== gen || ng < g[n]) {
          stamp[n] = gen;
          g[n] = ng;
          heap.push(n, ng);
        }
      }
    }
  }
}
