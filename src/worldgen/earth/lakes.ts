import { LakeSeed } from '../types';
import { smoothstep } from '../../core/noise';
import { EarthGrid, distanceKm } from './grid';
import { rasterRings } from './raster';
import { LL } from './relief';

/**
 * Hand-authored lakes and reservoirs. Outlines are approximate [lon, lat]
 * polygons; `level` is the real surface elevation (m) and `depth` the real
 * maximum depth (m).
 */
export interface LakeDef { name: string; level: number; depth: number; poly: LL[] }

export const LAKES: LakeDef[] = [
  // North America
  { name: 'Lake Superior', level: 183, depth: 406, poly: [[-92.1, 46.75], [-91.4, 47.15], [-90.4, 47.75], [-89.6, 47.95], [-89.2, 48.4], [-88.4, 48.75], [-87.4, 48.8], [-86.4, 48.75], [-85.8, 48.0], [-84.9, 47.85], [-84.7, 47.2], [-84.6, 46.55], [-85.1, 46.75], [-86.0, 46.68], [-87.2, 46.5], [-87.8, 46.9], [-87.8, 47.45], [-88.4, 47.3], [-89.1, 47.0], [-89.8, 46.8], [-90.6, 46.6], [-90.9, 46.95], [-91.5, 46.75]] },
  { name: 'Lake Michigan', level: 176, depth: 281, poly: [[-87.6, 41.9], [-86.9, 41.7], [-86.5, 42.2], [-86.25, 43.0], [-86.45, 43.9], [-86.35, 44.5], [-86.0, 45.0], [-85.4, 45.3], [-85.0, 45.75], [-84.75, 45.85], [-85.5, 46.05], [-86.3, 45.95], [-87.05, 45.75], [-87.35, 45.5], [-87.6, 45.1], [-88.0, 44.55], [-87.55, 44.7], [-87.15, 45.1], [-86.95, 45.3], [-87.2, 44.9], [-87.45, 44.45], [-87.7, 43.75], [-87.9, 43.0], [-87.8, 42.4]] },
  { name: 'Lake Huron', level: 176, depth: 229, poly: [[-84.7, 45.85], [-84.0, 46.0], [-83.3, 46.1], [-82.4, 46.2], [-81.4, 46.1], [-80.9, 45.95], [-80.4, 45.8], [-80.05, 45.3], [-79.95, 44.8], [-80.6, 44.55], [-81.15, 44.95], [-81.6, 45.25], [-81.3, 44.9], [-81.35, 44.5], [-81.7, 44.0], [-81.75, 43.4], [-82.1, 43.05], [-82.45, 43.05], [-82.55, 43.6], [-82.9, 44.05], [-83.35, 43.7], [-83.9, 43.85], [-83.4, 44.25], [-83.3, 44.8], [-83.5, 45.3], [-84.1, 45.6]] },
  { name: 'Lake Erie', level: 174, depth: 64, poly: [[-83.45, 41.7], [-82.7, 41.45], [-81.7, 41.5], [-80.5, 41.95], [-80.1, 42.15], [-78.9, 42.85], [-79.3, 42.9], [-80.2, 42.6], [-81.2, 42.65], [-81.9, 42.3], [-82.5, 42.05], [-83.1, 42.05]] },
  { name: 'Lake Ontario', level: 75, depth: 244, poly: [[-79.8, 43.25], [-79.4, 43.63], [-78.5, 43.9], [-77.5, 44.0], [-76.5, 44.2], [-76.2, 44.0], [-76.3, 43.5], [-76.5, 43.45], [-77.6, 43.28], [-78.9, 43.35], [-79.2, 43.2]] },
  { name: 'Lake Winnipeg', level: 217, depth: 36, poly: [[-96.8, 50.35], [-96.35, 50.75], [-96.5, 51.2], [-96.9, 51.7], [-97.3, 52.3], [-97.7, 53.0], [-97.9, 53.7], [-98.4, 53.95], [-98.95, 53.7], [-99.0, 53.2], [-98.4, 52.5], [-97.5, 51.8], [-97.2, 51.3], [-97.05, 50.7]] },
  { name: 'Lake Manitoba', level: 248, depth: 7, poly: [[-98.8, 50.2], [-98.3, 50.5], [-98.6, 51.3], [-99.2, 51.6], [-99.1, 51.0]] },
  { name: 'Lake Winnipegosis', level: 254, depth: 12, poly: [[-99.8, 51.8], [-99.4, 52.2], [-99.9, 53.0], [-100.4, 52.8], [-100.1, 52.1]] },
  { name: 'Great Bear Lake', level: 156, depth: 446, poly: [[-124.8, 65.4], [-123.5, 65.1], [-122.0, 65.1], [-120.8, 65.3], [-119.7, 65.7], [-119.5, 66.1], [-120.3, 66.5], [-121.5, 66.6], [-122.7, 66.3], [-123.8, 66.2], [-124.9, 65.9]] },
  { name: 'Great Slave Lake', level: 156, depth: 614, poly: [[-116.9, 61.15], [-116.0, 61.0], [-114.5, 61.1], [-113.5, 61.5], [-112.5, 61.8], [-111.5, 62.2], [-110.4, 62.6], [-110.8, 62.9], [-112.0, 62.7], [-113.0, 62.4], [-114.2, 62.35], [-114.7, 62.55], [-115.5, 62.0], [-116.3, 61.6]] },
  { name: 'Lake Athabasca', level: 213, depth: 124, poly: [[-111.3, 58.6], [-110.3, 58.9], [-109.0, 59.15], [-107.8, 59.35], [-106.6, 59.45], [-106.7, 59.2], [-108.0, 59.05], [-109.2, 58.9], [-110.4, 58.6]] },
  { name: 'Reindeer Lake', level: 337, depth: 219, poly: [[-102.9, 56.4], [-102.2, 56.6], [-101.8, 57.3], [-101.9, 58.0], [-102.4, 58.1], [-102.6, 57.4], [-103.0, 56.9]] },
  { name: 'Wollaston Lake', level: 398, depth: 97, poly: [[-103.7, 57.9], [-103.0, 58.0], [-102.9, 58.6], [-103.5, 58.5]] },
  { name: 'Nettilling Lake', level: 30, depth: 60, poly: [[-72.0, 66.2], [-70.6, 66.1], [-69.6, 66.5], [-70.0, 66.9], [-71.2, 66.9], [-72.2, 66.6]] },
  { name: 'Lake Nipigon', level: 260, depth: 165, poly: [[-89.1, 49.5], [-88.3, 49.4], [-88.0, 49.8], [-88.3, 50.3], [-88.9, 50.2], [-89.2, 49.9]] },
  { name: 'Lake Mistassini', level: 372, depth: 183, poly: [[-74.3, 50.6], [-73.9, 50.6], [-73.2, 51.2], [-73.4, 51.4], [-74.0, 51.0]] },
  { name: 'Great Salt Lake', level: 1280, depth: 10, poly: [[-112.9, 41.7], [-112.2, 41.6], [-112.0, 41.1], [-112.4, 40.8], [-112.9, 41.1]] },
  { name: 'Lake Okeechobee', level: 4, depth: 4, poly: [[-81.1, 26.7], [-80.65, 26.75], [-80.7, 27.15], [-81.0, 27.1]] },
  { name: 'Lake Nicaragua', level: 32, depth: 26, poly: [[-85.9, 11.1], [-85.3, 11.0], [-84.8, 11.4], [-84.95, 12.0], [-85.4, 12.2], [-85.7, 11.6]] },
  { name: 'Lake Managua', level: 39, depth: 26, poly: [[-86.8, 12.2], [-86.3, 12.2], [-86.2, 12.45], [-86.6, 12.5]] },
  // South America
  { name: 'Lake Titicaca', level: 3812, depth: 281, poly: [[-70.0, -15.3], [-69.4, -15.35], [-69.05, -15.8], [-68.65, -16.35], [-68.9, -16.5], [-69.4, -16.1], [-69.9, -15.85], [-70.05, -15.55]] },
  { name: 'Lago Argentino-Viedma', level: 187, depth: 500, poly: [[-73.3, -50.1], [-72.2, -50.2], [-72.2, -50.4], [-73.2, -50.5], [-72.9, -49.6], [-72.4, -49.6]] },
  // Africa
  { name: 'Lake Victoria', level: 1134, depth: 84, poly: [[31.75, -1.0], [31.7, 0.0], [32.3, 0.35], [33.2, 0.35], [33.9, 0.2], [34.1, -0.3], [34.7, -0.3], [34.2, -0.8], [34.0, -1.6], [33.5, -2.2], [33.0, -2.55], [32.3, -2.5], [31.8, -2.0]] },
  { name: 'Lake Tanganyika', level: 773, depth: 1470, poly: [[29.25, -3.35], [29.45, -3.6], [29.7, -4.6], [29.85, -5.5], [30.2, -6.2], [30.6, -6.9], [30.9, -7.7], [31.2, -8.5], [31.0, -8.75], [30.6, -8.3], [30.4, -7.8], [30.0, -7.0], [29.5, -6.2], [29.35, -5.2], [29.1, -4.3], [29.1, -3.5]] },
  { name: 'Lake Malawi', level: 474, depth: 706, poly: [[33.95, -9.5], [34.3, -9.7], [34.6, -10.5], [34.75, -11.4], [34.8, -12.2], [35.0, -13.0], [35.3, -13.8], [35.25, -14.4], [34.9, -14.1], [34.5, -13.5], [34.3, -12.7], [34.2, -11.8], [34.1, -11.0], [33.95, -10.2]] },
  { name: 'Lake Turkana', level: 360, depth: 109, poly: [[35.9, 4.6], [36.3, 4.3], [36.4, 3.4], [36.65, 2.5], [36.5, 2.4], [36.2, 3.2], [35.95, 3.9]] },
  { name: 'Lake Albert', level: 615, depth: 58, poly: [[30.25, 1.15], [31.25, 2.3], [31.5, 2.15], [30.5, 0.95]] },
  { name: 'Lake Kivu', level: 1460, depth: 475, poly: [[28.9, -1.7], [29.3, -1.7], [29.2, -2.5], [28.9, -2.5]] },
  { name: 'Lake Mweru', level: 917, depth: 27, poly: [[28.4, -8.5], [29.0, -8.6], [29.2, -9.3], [28.6, -9.4]] },
  { name: 'Lake Kariba', level: 485, depth: 97, poly: [[26.8, -17.95], [27.5, -17.4], [28.5, -16.7], [29.05, -16.5], [28.9, -16.9], [28.0, -17.4], [27.1, -18.0]] },
  { name: 'Cahora Bassa', level: 326, depth: 150, poly: [[30.9, -15.55], [32.2, -15.55], [32.3, -15.8], [31.0, -15.8]] },
  { name: 'Lake Nasser', level: 183, depth: 130, poly: [[30.9, 21.5], [31.4, 21.9], [32.0, 22.4], [32.5, 22.8], [32.95, 23.6], [32.85, 23.9], [32.3, 23.2], [31.6, 22.5], [31.0, 21.9]] },
  { name: 'Lake Volta', level: 85, depth: 75, poly: [[-0.2, 6.3], [0.2, 6.5], [0.5, 7.0], [0.3, 7.8], [0.1, 8.5], [-0.5, 8.7], [-1.3, 8.5], [-1.0, 8.2], [-0.4, 8.0], [-0.1, 7.2]] },
  { name: 'Lake Chad', level: 280, depth: 11, poly: [[13.9, 13.8], [14.5, 13.9], [14.6, 13.3], [14.3, 12.8], [13.8, 13.1]] },
  { name: 'Lake Tana', level: 1788, depth: 15, poly: [[37.0, 12.2], [37.6, 12.2], [37.6, 11.6], [37.2, 11.6]] },
  { name: 'Lake Kainji', level: 142, depth: 60, poly: [[4.4, 9.9], [4.7, 9.9], [4.65, 10.7], [4.4, 10.6]] },
  // Europe
  { name: 'Lake Ladoga', level: 5, depth: 230, poly: [[29.9, 60.1], [31.0, 60.4], [32.6, 60.6], [32.9, 60.9], [32.5, 61.3], [31.5, 61.7], [30.7, 61.5], [30.2, 61.0], [29.9, 60.5]] },
  { name: 'Lake Onega', level: 33, depth: 127, poly: [[34.3, 61.0], [35.5, 61.2], [36.3, 61.5], [35.9, 62.0], [35.5, 62.6], [34.8, 62.8], [34.5, 62.3], [34.8, 61.6], [34.3, 61.4]] },
  { name: 'Lake Peipus', level: 30, depth: 15, poly: [[26.9, 58.0], [27.7, 58.0], [27.9, 58.4], [27.5, 58.95], [27.0, 58.85], [27.2, 58.4]] },
  { name: 'Rybinsk Reservoir', level: 102, depth: 30, poly: [[37.9, 58.0], [38.7, 58.1], [38.9, 58.5], [38.3, 58.9], [37.9, 58.6]] },
  { name: 'Kuybyshev Reservoir', level: 53, depth: 41, poly: [[48.6, 55.4], [49.3, 55.25], [49.5, 54.5], [49.2, 53.9], [48.8, 54.3], [49.0, 54.9]] },
  { name: 'Vanern', level: 44, depth: 106, poly: [[12.4, 58.4], [13.2, 58.5], [14.0, 58.9], [13.9, 59.3], [13.2, 59.4], [12.7, 59.1], [12.35, 58.8]] },
  { name: 'Vattern', level: 89, depth: 128, poly: [[14.35, 57.8], [14.8, 57.9], [14.95, 58.6], [14.6, 58.75], [14.4, 58.2]] },
  { name: 'Saimaa', level: 76, depth: 85, poly: [[27.7, 61.1], [28.9, 61.2], [29.2, 61.6], [28.5, 62.2], [27.6, 61.8]] },
  { name: 'Lake Geneva', level: 372, depth: 310, poly: [[6.15, 46.2], [6.8, 46.35], [6.95, 46.45], [6.5, 46.55], [6.2, 46.4]] },
  { name: 'Lake Balaton', level: 104, depth: 12, poly: [[17.2, 46.7], [17.9, 46.9], [18.15, 47.02], [17.4, 46.88]] },
  // Asia
  { name: 'Lake Baikal', level: 456, depth: 1642, poly: [[103.7, 51.55], [104.4, 51.5], [105.4, 51.8], [106.5, 52.35], [107.3, 52.9], [108.2, 53.4], [108.9, 54.2], [109.5, 55.2], [109.9, 55.8], [109.4, 55.8], [108.8, 55.3], [108.3, 54.5], [107.6, 53.8], [106.8, 53.4], [106.1, 53.0], [105.3, 52.6], [104.5, 52.1]] },
  { name: 'Lake Balkhash', level: 342, depth: 26, poly: [[73.5, 46.4], [74.4, 46.05], [75.5, 46.3], [76.5, 46.5], [77.5, 46.35], [78.5, 46.4], [79.3, 46.6], [79.0, 46.9], [78.0, 46.75], [77.0, 46.8], [76.0, 46.75], [75.0, 46.9], [74.2, 46.8]] },
  { name: 'North Aral Sea', level: 42, depth: 42, poly: [[60.5, 46.4], [61.3, 46.25], [61.8, 46.5], [61.3, 46.8], [60.6, 46.75]] },
  { name: 'South Aral Sea', level: 26, depth: 40, poly: [[58.2, 45.7], [58.6, 45.6], [58.8, 44.5], [58.5, 44.2], [58.2, 44.8]] },
  { name: 'Lake Zaysan', level: 386, depth: 15, poly: [[83.4, 47.9], [84.9, 47.9], [84.9, 48.2], [83.5, 48.2]] },
  { name: 'Issyk-Kul', level: 1607, depth: 668, poly: [[76.2, 42.35], [77.0, 42.2], [78.2, 42.35], [78.4, 42.5], [77.6, 42.7], [76.6, 42.6]] },
  { name: 'Lake Urmia', level: 1270, depth: 16, poly: [[45.1, 37.2], [45.6, 37.3], [45.9, 37.7], [45.6, 38.2], [45.25, 38.0], [45.2, 37.6]] },
  { name: 'Lake Van', level: 1640, depth: 451, poly: [[42.3, 38.6], [43.0, 38.4], [43.5, 38.5], [43.3, 38.9], [42.9, 38.95], [42.6, 38.8]] },
  { name: 'Lake Sevan', level: 1900, depth: 80, poly: [[44.9, 40.2], [45.4, 40.2], [45.4, 40.55], [45.0, 40.6]] },
  { name: 'Dead Sea', level: -430, depth: 300, poly: [[35.4, 31.1], [35.6, 31.1], [35.6, 31.8], [35.45, 31.8]] },
  { name: 'Qinghai Lake', level: 3196, depth: 25, poly: [[99.6, 36.8], [100.3, 36.6], [100.8, 36.8], [100.6, 37.2], [100.0, 37.2]] },
  { name: 'Nam Co', level: 4718, depth: 120, poly: [[90.2, 30.7], [90.9, 30.6], [90.9, 30.9], [90.3, 30.9]] },
  { name: 'Poyang Lake', level: 14, depth: 25, poly: [[115.9, 28.8], [116.6, 28.9], [116.7, 29.3], [116.2, 29.5], [115.9, 29.2]] },
  { name: 'Dongting Lake', level: 33, depth: 30, poly: [[112.3, 28.9], [113.1, 28.9], [113.1, 29.4], [112.6, 29.4]] },
  { name: 'Lake Tai', level: 3, depth: 3, poly: [[119.9, 30.95], [120.5, 31.0], [120.5, 31.5], [120.0, 31.4]] },
  { name: 'Tonle Sap', level: 5, depth: 10, poly: [[103.4, 13.3], [104.2, 12.6], [104.6, 12.4], [104.4, 12.8], [103.8, 13.3]] },
  { name: 'Lake Khanka', level: 69, depth: 10, poly: [[132.1, 44.6], [132.8, 44.6], [132.9, 45.1], [132.3, 45.3], [131.9, 45.0]] },
  { name: 'Hulun Lake', level: 545, depth: 8, poly: [[116.9, 48.7], [117.6, 48.9], [117.7, 49.2], [117.2, 49.3]] },
  { name: 'Khovsgol', level: 1645, depth: 262, poly: [[100.2, 50.4], [100.6, 50.4], [100.8, 51.5], [100.4, 51.6], [100.2, 51.0]] },
  { name: 'Uvs Lake', level: 759, depth: 20, poly: [[92.3, 50.2], [93.0, 50.2], [93.0, 50.5], [92.4, 50.5]] },
  { name: 'Lake Toba', level: 905, depth: 505, poly: [[98.6, 2.4], [99.1, 2.4], [99.1, 2.85], [98.8, 2.9]] },
  // Oceania
  { name: 'Lake Taupo', level: 356, depth: 186, poly: [[175.75, -38.95], [176.05, -38.85], [176.0, -38.65], [175.8, -38.7]] },
];

export interface LakeResult {
  waterLevel: Float32Array;
  lakes: LakeSeed[];
  lakeMask: Uint8Array;
}

/**
 * Carves the lakes into `elev`: water cells get their real surface level
 * (clamped to ≥ 3 m, because the map keeps all dry land above sea level) and
 * a bed below it; surrounding land is raised just above the shoreline so the
 * water sits in a basin.
 */
export function carveLakes(g: EarthGrid, elev: Float32Array, land: Uint8Array): LakeResult {
  const n = g.n;
  const waterLevel = new Float32Array(n).fill(-1e9);
  const lakeMask = new Uint8Array(n);
  const lakes: LakeSeed[] = [];
  const cells: number[] = [];
  for (const L of LAKES) {
    cells.length = 0;
    rasterRings(g, [L.poly], (k) => { if (land[k] && !lakeMask[k]) cells.push(k); });
    if (cells.length === 0) {
      // Too small to rasterise: keep the centre cell so the lake still exists.
      let cx = 0, cy = 0;
      for (const p of L.poly) { cx += p[0]; cy += p[1]; }
      const k = g.cellOf(cx / L.poly.length, cy / L.poly.length);
      if (land[k] && !lakeMask[k]) cells.push(k);
    }
    if (!cells.length) continue;
    const level = Math.max(3, L.level);
    const m = new Uint8Array(n);
    for (const k of cells) { m[k] = 1; lakeMask[k] = 1; }
    // Local distance-to-shore for the bed profile (computed on a padded bbox).
    let i0 = g.w, i1 = 0, j0 = g.h, j1 = 0;
    for (const k of cells) {
      const i = k % g.w, j = (k / g.w) | 0;
      if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j;
    }
    const pad = 6;
    i0 = Math.max(0, i0 - pad); i1 = Math.min(g.w - 1, i1 + pad);
    j0 = Math.max(0, j0 - pad); j1 = Math.min(g.h - 1, j1 + pad);
    // Inside distance (cells) via simple BFS from the shore.
    const inside = new Map<number, number>();
    const queue: number[] = [];
    for (const k of cells) {
      const i = k % g.w, j = (k / g.w) | 0;
      let shore = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + dx, jj = j + dy;
        if (ii < 0 || jj < 0 || ii >= g.w || jj >= g.h || !m[jj * g.w + ii]) shore = true;
      }
      if (shore) { inside.set(k, 1); queue.push(k); }
    }
    for (let q = 0; q < queue.length; q++) {
      const c = queue[q];
      const i = c % g.w, j = (c / g.w) | 0;
      const dc = inside.get(c)!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + dx, jj = j + dy;
        if (ii < 0 || jj < 0 || ii >= g.w || jj >= g.h) continue;
        const nk = jj * g.w + ii;
        if (!m[nk] || inside.has(nk)) continue;
        inside.set(nk, dc + 1);
        queue.push(nk);
      }
    }
    let maxIn = 1;
    for (const v of inside.values()) if (v > maxIn) maxIn = v;
    const depth = Math.min(L.depth, level - 1 > 0 ? level - 1 : 1);
    for (const k of cells) {
      waterLevel[k] = level;
      const t = smoothstep(0, Math.max(1.5, maxIn * 0.6), inside.get(k) ?? 1);
      elev[k] = Math.max(1, level - Math.max(2, depth * (0.25 + 0.75 * t)));
    }
    // Shore: land around the lake is lifted to at least the water level,
    // decaying away from the shore so the lake sits in a shallow basin.
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * g.w + i;
        if (m[k] || !land[k] || lakeMask[k]) continue;
        let dmin = 99;
        for (let dy = -pad; dy <= pad; dy++) {
          const jj = j + dy;
          if (jj < 0 || jj >= g.h) continue;
          for (let dx = -pad; dx <= pad; dx++) {
            const ii = i + dx;
            if (ii < 0 || ii >= g.w || !m[jj * g.w + ii]) continue;
            const dd = Math.sqrt(dx * dx + dy * dy);
            if (dd < dmin) dmin = dd;
          }
        }
        if (dmin > pad) continue;
        const floor = level + 2 + 6 * dmin - 40 * Math.max(0, dmin - 2);
        if (elev[k] < floor) elev[k] = floor;
      }
    }
    lakes.push({ level, cells: Int32Array.from(cells), name: L.name });
  }
  return { waterLevel, lakes, lakeMask };
}

/** Distance (km) from any lake cell, handy for climate moisture. */
export function lakeDistance(g: EarthGrid, lakeMask: Uint8Array): Float32Array {
  return distanceKm(g, lakeMask, 2000);
}
