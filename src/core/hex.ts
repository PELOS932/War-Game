/**
 * Pointy-top hexagon grid using "odd-r" offset coordinates.
 * World space: x grows east, z grows south. Hex circumradius = 1 world unit.
 *
 * Direction indices (used everywhere, including shaders and road bitmasks):
 *   0 = E, 1 = SE, 2 = SW, 3 = W, 4 = NW, 5 = NE
 */
export const SQRT3 = Math.sqrt(3);
export const HEX_W = SQRT3; // distance between adjacent hex centres
export const DIR_AXIAL: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1],
];
/** Unit vectors (x,z) from a hex centre toward each neighbour. */
export const DIR_VEC: ReadonlyArray<readonly [number, number]> = DIR_AXIAL.map((_, k) => {
  const a = (k * Math.PI) / 3;
  return [Math.cos(a), Math.sin(a)] as const;
});

export function oppositeDir(d: number): number {
  return (d + 3) % 6;
}

export class HexGrid {
  readonly cols: number;
  readonly rows: number;
  readonly count: number;
  readonly worldW: number;
  readonly worldH: number;
  /** neighbours[i*6+d] = index of neighbour in direction d, or -1. */
  readonly neighbours: Int32Array;
  readonly cx: Float32Array;
  readonly cz: Float32Array;

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.count = cols * rows;
    this.worldW = SQRT3 * (cols + 0.5);
    this.worldH = 1.5 * rows + 0.5;
    this.neighbours = new Int32Array(this.count * 6);
    this.cx = new Float32Array(this.count);
    this.cz = new Float32Array(this.count);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        this.cx[i] = SQRT3 * (c + 0.5 * (r & 1)) + SQRT3 / 2;
        this.cz[i] = 1.5 * r + 1;
        const q = c - (r - (r & 1)) / 2;
        for (let d = 0; d < 6; d++) {
          const nq = q + DIR_AXIAL[d][0];
          const nr = r + DIR_AXIAL[d][1];
          if (nr < 0 || nr >= rows) { this.neighbours[i * 6 + d] = -1; continue; }
          const nc = nq + (nr - (nr & 1)) / 2;
          this.neighbours[i * 6 + d] = nc < 0 || nc >= cols ? -1 : nr * cols + nc;
        }
      }
    }
  }

  index(col: number, row: number): number {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return -1;
    return row * this.cols + col;
  }

  col(i: number): number { return i % this.cols; }
  row(i: number): number { return (i / this.cols) | 0; }

  neighbour(i: number, d: number): number {
    return this.neighbours[i * 6 + d];
  }

  axialQ(i: number): number {
    const r = this.row(i);
    return this.col(i) - (r - (r & 1)) / 2;
  }

  distance(a: number, b: number): number {
    const ar = this.row(a), br = this.row(b);
    const aq = this.col(a) - (ar - (ar & 1)) / 2;
    const bq = this.col(b) - (br - (br & 1)) / 2;
    const dq = aq - bq, dr = ar - br;
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
  }

  /** Hex index containing world point, or -1 if outside the grid. */
  fromWorld(x: number, z: number): number {
    const px = x - SQRT3 / 2;
    const pz = z - 1;
    const qf = (SQRT3 / 3) * px - pz / 3;
    const rf = (2 / 3) * pz;
    const sf = -qf - rf;
    let q = Math.round(qf), r = Math.round(rf);
    const s = Math.round(sf);
    const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(s - sf);
    if (dq > dr && dq > ds) q = -r - s;
    else if (dr > ds) r = -q - s;
    const col = q + (r - (r & 1)) / 2;
    return this.index(col, r);
  }

  /** Direction index from hex a toward adjacent hex b, or -1. */
  dirTo(a: number, b: number): number {
    const base = a * 6;
    for (let d = 0; d < 6; d++) if (this.neighbours[base + d] === b) return d;
    return -1;
  }

  /** Calls fn for every hex within `radius` of centre (including centre). */
  forRadius(centre: number, radius: number, fn: (i: number, dist: number) => void): void {
    const r0 = this.row(centre);
    const q0 = this.col(centre) - (r0 - (r0 & 1)) / 2;
    for (let dr = -radius; dr <= radius; dr++) {
      const r = r0 + dr;
      if (r < 0 || r >= this.rows) continue;
      const qMin = Math.max(-radius, -dr - radius);
      const qMax = Math.min(radius, -dr + radius);
      for (let dq = qMin; dq <= qMax; dq++) {
        const q = q0 + dq;
        const c = q + (r - (r & 1)) / 2;
        if (c < 0 || c >= this.cols) continue;
        const dist = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
        fn(r * this.cols + c, dist);
      }
    }
  }

  /** Straight-line world distance between hex centres. */
  worldDist(a: number, b: number): number {
    const dx = this.cx[a] - this.cx[b];
    const dz = this.cz[a] - this.cz[b];
    return Math.sqrt(dx * dx + dz * dz);
  }
}
