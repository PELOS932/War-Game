import { MinHeap } from '../core/heap';
import { LakeSeed, RiverSeed, HEIGHT_SPACING } from './types';
import { potentialEvap } from './climate';
import { Noise2D } from '../core/noise';
import { RNG } from '../core/rng';

const DX8 = [1, 1, 0, -1, -1, -1, 0, 1];
const DY8 = [0, 1, 1, 1, 0, -1, -1, -1];
const DD8 = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2];

export interface Hydrology {
  filled: Float32Array;
  receiver: Int32Array; // downstream cell or -1 (ocean)
  accumulation: Float32Array;
  waterLevel: Float32Array; // lake surface or -1e9
  lakes: LakeSeed[];
  rivers: RiverSeed[];
  riverCell: Uint8Array; // 1 = river
  saltFlat: Uint8Array;
  order: Int32Array; // cells in increasing filled height
}

/**
 * Priority-flood depression filling (Barnes 2014) with epsilon gradient,
 * lake detection, drainage network, flow accumulation and river extraction.
 * Carves river channels into `elev` in place.
 */
export function computeHydrology(
  elev: Float32Array,
  temperature: Float32Array,
  precip: Float32Array,
  w: number,
  h: number,
  rng: RNG,
): Hydrology {
  const n = w * h;
  // Routing surface: terrain plus a small smooth perturbation so drainage over
  // flats meanders naturally instead of following straight flood-fill lines.
  const route = new Float32Array(elev);
  const pn = new Noise2D(rng);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (route[i] > 0) route[i] += 7 * pn.fbm(x / 5, y / 5, 3) + 3;
    }
  }
  const filled = new Float32Array(route);
  const visited = new Uint8Array(n);
  const order = new Int32Array(n);
  let orderLen = 0;
  const heap = new MinHeap(1 << 16);
  const eps = 0.02;

  // Seed with ocean cells and the map border.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (elev[i] <= 0) {
        visited[i] = 1;
        order[orderLen++] = i;
        // Only coastal ocean cells need to be in the queue.
        let coastal = false;
        for (let d = 0; d < 8 && !coastal; d += 2) {
          const nx = x + DX8[d], ny = y + DY8[d];
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && elev[ny * w + nx] > 0) coastal = true;
        }
        if (coastal) heap.push(i, elev[i]);
      } else if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        visited[i] = 1;
        order[orderLen++] = i;
        heap.push(i, elev[i]);
      }
    }
  }
  while (heap.size > 0) {
    const c = heap.pop();
    const cx = c % w, cy = (c / w) | 0;
    const fc = filled[c];
    for (let d = 0; d < 8; d++) {
      const nx = cx + DX8[d], ny = cy + DY8[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (visited[ni]) continue;
      visited[ni] = 1;
      if (filled[ni] <= fc + eps) filled[ni] = fc + eps;
      order[orderLen++] = ni;
      heap.push(ni, filled[ni]);
    }
  }

  // Lakes: connected cells filled significantly above terrain.
  const waterLevel = new Float32Array(n).fill(-1e9);
  const saltFlat = new Uint8Array(n);
  const lakeId = new Int32Array(n).fill(-1);
  const lakes: LakeSeed[] = [];
  const stack: number[] = [];
  const comp: number[] = [];
  for (let i = 0; i < n; i++) {
    if (lakeId[i] !== -1 || elev[i] <= 0 || filled[i] - route[i] < 4) continue;
    comp.length = 0;
    stack.push(i);
    lakeId[i] = -2;
    let maxDepth = 0, level = 0, tSum = 0, pSum = 0;
    while (stack.length) {
      const c = stack.pop()!;
      comp.push(c);
      const d = filled[c] - route[c];
      if (d > maxDepth) maxDepth = d;
      if (filled[c] > level) level = filled[c];
      tSum += temperature[c];
      pSum += precip[c];
      const cx = c % w, cy = (c / w) | 0;
      for (let k = 0; k < 8; k += 2) {
        const nx = cx + DX8[k], ny = cy + DY8[k];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (lakeId[ni] !== -1 || elev[ni] <= 0 || filled[ni] - route[ni] < 4) continue;
        lakeId[ni] = -2;
        stack.push(ni);
      }
    }
    const area = comp.length;
    const tAvg = tSum / area, pAvg = pSum / area;
    const arid = pAvg < potentialEvap(tAvg) * 0.35;
    if (area >= 8 && maxDepth > 25 && (!arid || area > 300)) {
      const id = lakes.length;
      // Lake surface in terrain metres (remove the routing perturbation).
      let lvl = 0;
      for (const c of comp) lvl = Math.max(lvl, elev[c] + (filled[c] - route[c]));
      for (const c of comp) {
        lakeId[c] = id;
        waterLevel[c] = lvl;
      }
      lakes.push({ level: lvl, cells: Int32Array.from(comp) });
    } else {
      for (const c of comp) {
        lakeId[c] = -3;
        elev[c] = Math.max(elev[c], elev[c] + (filled[c] - route[c]) * 0.95 - 0.5);
        if (arid && area >= 150 && maxDepth > 40) saltFlat[c] = 1;
      }
    }
  }

  // Receivers: steepest descent on the filled surface.
  const receiver = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    if (elev[i] <= 0 && waterLevel[i] < -1e8) continue;
    const cx = i % w, cy = (i / w) | 0;
    let best = -1, bestS = 0;
    const fi = filled[i];
    for (let d = 0; d < 8; d++) {
      const nx = cx + DX8[d], ny = cy + DY8[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      const s = (fi - filled[ni]) / DD8[d];
      if (s > bestS) { bestS = s; best = ni; }
    }
    receiver[i] = best;
  }

  // Flow accumulation (process from highest to lowest).
  const acc = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (elev[i] > 0) {
      const runoff = Math.max(0.02, (precip[i] - 0.45 * potentialEvap(temperature[i])) / 1000);
      acc[i] += runoff;
    }
  }
  for (let k = orderLen - 1; k >= 0; k--) {
    const c = order[k];
    const r = receiver[c];
    if (r >= 0) acc[r] += acc[c];
  }

  // River threshold: aim for a readable network.
  const landAcc: number[] = [];
  for (let i = 0; i < n; i += 3) if (elev[i] > 0 && waterLevel[i] < -1e8) landAcc.push(acc[i]);
  landAcc.sort((a, b) => a - b);
  const threshold = Math.max(40, landAcc[Math.floor(landAcc.length * 0.982)] || 60);
  const riverCell = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (elev[i] > 0 && waterLevel[i] < -1e8 && acc[i] >= threshold) riverCell[i] = 1;
  }

  // Extract river polylines: start at sources, walk downstream.
  const upstreamRivers = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (riverCell[i] && receiver[i] >= 0) upstreamRivers[receiver[i]]++;
  const done = new Uint8Array(n);
  const rivers: RiverSeed[] = [];
  const widthOf = (a: number) => 0.05 + 0.07 * Math.log2(1 + a / threshold);
  const sources: number[] = [];
  for (let i = 0; i < n; i++) if (riverCell[i] && upstreamRivers[i] === 0) sources.push(i);
  // Longest rivers first so tributaries join main stems.
  sources.sort((a, b) => filled[b] - filled[a]);

  for (const s of sources) {
    const pts: number[] = [];
    let c = s;
    let steps = 0;
    while (c >= 0 && steps++ < 5000) {
      const x = (c % w) * HEIGHT_SPACING, z = ((c / w) | 0) * HEIGHT_SPACING;
      pts.push(x, z, widthOf(acc[c]));
      if (done[c]) break; // joined an existing river
      done[c] = 1;
      if (!riverCell[c]) break; // reached sea or lake
      c = receiver[c];
    }
    if (pts.length / 3 >= 6) rivers.push({ points: Float32Array.from(pts) });
  }

  // Carve channels so rivers sit in their valleys.
  for (let i = 0; i < n; i++) {
    if (!riverCell[i]) continue;
    const depth = Math.min(90, 10 + 14 * Math.log2(1 + acc[i] / threshold));
    const floor = 2;
    elev[i] = Math.max(Math.min(elev[i], floor + 0.5), elev[i] - depth);
    // Soften banks.
    const cx = i % w, cy = (i / w) | 0;
    for (let d = 0; d < 8; d++) {
      const nx = cx + DX8[d], ny = cy + DY8[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (riverCell[ni] || elev[ni] <= 0) continue;
      elev[ni] = Math.max(elev[ni] - depth * 0.3, Math.min(elev[ni], 3));
    }
  }

  return {
    filled, receiver, accumulation: acc, waterLevel, lakes, rivers, riverCell, saltFlat,
    order: order.subarray(0, orderLen),
  };
}
