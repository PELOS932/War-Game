import { EARTH_SETTINGS, HEIGHT_SPACING, KM_PER_DEG, WorldSettings, worldHeight, worldWidth } from '../types';
import { heightmapSize } from '../generate';

/**
 * Geographic view of the equirectangular heightmap: converts between
 * heightmap cells (i = column, j = row), world units and lon/lat, and provides
 * real-kilometre metrics per row.
 */
export class EarthGrid {
  readonly s: WorldSettings;
  readonly w: number;
  readonly h: number;
  readonly n: number;
  /** World extents. */
  readonly W: number;
  readonly H: number;
  /** Degrees per heightmap cell (identical along both axes). */
  readonly dDeg: number;
  /** Kilometres per cell north-south. */
  readonly kmNS: number;
  /** Kilometres per cell east-west, per row. */
  readonly kmEW: Float32Array;
  readonly latRow: Float32Array;
  readonly lonCol: Float32Array;
  /** Number of columns spanning exactly 360° (non-integer). */
  readonly period: number;

  constructor(s: WorldSettings = EARTH_SETTINGS) {
    this.s = s;
    const { hw, hh } = heightmapSize(s.cols, s.rows);
    this.w = hw;
    this.h = hh;
    this.n = hw * hh;
    this.W = worldWidth(s);
    this.H = worldHeight(s);
    this.dDeg = ((s.lonEast - s.lonWest) * HEIGHT_SPACING) / this.W;
    this.kmNS = this.dDeg * KM_PER_DEG;
    this.period = 360 / this.dDeg;
    this.kmEW = new Float32Array(hh);
    this.latRow = new Float32Array(hh);
    for (let j = 0; j < hh; j++) {
      const lat = this.lat(j);
      this.latRow[j] = lat;
      this.kmEW[j] = this.kmNS * Math.max(0.03, Math.cos((lat * Math.PI) / 180));
    }
    this.lonCol = new Float32Array(hw);
    for (let i = 0; i < hw; i++) this.lonCol[i] = this.lon(i);
  }

  lon(i: number): number {
    return this.s.lonWest + i * this.dDeg;
  }

  lat(j: number): number {
    return this.s.latNorth - j * this.dDeg;
  }

  /** Fractional column of a longitude. */
  colF(lon: number): number {
    return (lon - this.s.lonWest) / this.dDeg;
  }

  /** Fractional row of a latitude. */
  rowF(lat: number): number {
    return (this.s.latNorth - lat) / this.dDeg;
  }

  /** Nearest cell index of lon/lat, clamped to the map. */
  cellOf(lon: number, lat: number): number {
    let i = Math.round(this.colF(lon));
    let j = Math.round(this.rowF(lat));
    if (i < 0) i = 0; else if (i >= this.w) i = this.w - 1;
    if (j < 0) j = 0; else if (j >= this.h) j = this.h - 1;
    return j * this.w + i;
  }

  /** World x/z of a lon/lat. */
  worldX(lon: number): number {
    return this.colF(lon) * HEIGHT_SPACING;
  }

  worldZ(lat: number): number {
    return this.rowF(lat) * HEIGHT_SPACING;
  }

  /** Approximate great-circle distance in km (equirectangular approximation, fine for < ~2000 km). */
  static distKm(lon1: number, lat1: number, lon2: number, lat2: number): number {
    const c = Math.cos((((lat1 + lat2) * 0.5) * Math.PI) / 180);
    let dl = lon2 - lon1;
    if (dl > 180) dl -= 360; else if (dl < -180) dl += 360;
    const dx = dl * c * KM_PER_DEG;
    const dy = (lat2 - lat1) * KM_PER_DEG;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

/**
 * Latitude-aware chamfer distance transform (km) from cells where mask = 1.
 * East-west steps are scaled by cos(latitude).
 */
export function distanceKm(g: EarthGrid, mask: Uint8Array, maxKm = 1e9): Float32Array {
  const { w, h } = g;
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : INF;
  const v = g.kmNS;
  for (let y = 0; y < h; y++) {
    const a = g.kmEW[y];
    const diagUp = y > 0 ? Math.sqrt(v * v + ((a + g.kmEW[y - 1]) * 0.5) ** 2) : 0;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      let m = d[i];
      if (x > 0 && d[i - 1] + a < m) m = d[i - 1] + a;
      if (y > 0) {
        if (d[i - w] + v < m) m = d[i - w] + v;
        if (x > 0 && d[i - w - 1] + diagUp < m) m = d[i - w - 1] + diagUp;
        if (x < w - 1 && d[i - w + 1] + diagUp < m) m = d[i - w + 1] + diagUp;
      }
      d[i] = m;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    const a = g.kmEW[y];
    const diagDn = y < h - 1 ? Math.sqrt(v * v + ((a + g.kmEW[y + 1]) * 0.5) ** 2) : 0;
    const row = y * w;
    for (let x = w - 1; x >= 0; x--) {
      const i = row + x;
      let m = d[i];
      if (x < w - 1 && d[i + 1] + a < m) m = d[i + 1] + a;
      if (y < h - 1) {
        if (d[i + w] + v < m) m = d[i + w] + v;
        if (x < w - 1 && d[i + w + 1] + diagDn < m) m = d[i + w + 1] + diagDn;
        if (x > 0 && d[i + w - 1] + diagDn < m) m = d[i + w - 1] + diagDn;
      }
      d[i] = m > maxKm ? maxKm : m;
    }
  }
  return d;
}

/**
 * Iterates the cells inside a lon/lat bounding box expanded by `padKm`.
 * Calls fn(cellIndex, i, j). Handles clipping to the map (no wrapping).
 */
export function forBox(
  g: EarthGrid,
  lon0: number, lat0: number, lon1: number, lat1: number, padKm: number,
  fn: (k: number, i: number, j: number) => void,
): void {
  const padLat = padKm / KM_PER_DEG;
  const latMax = Math.max(lat0, lat1) + padLat;
  const latMin = Math.min(lat0, lat1) - padLat;
  const cosMin = Math.max(0.05, Math.cos((Math.min(80, Math.max(Math.abs(latMax), Math.abs(latMin))) * Math.PI) / 180));
  const padLon = padKm / (KM_PER_DEG * cosMin);
  const lonMin = Math.min(lon0, lon1) - padLon;
  const lonMax = Math.max(lon0, lon1) + padLon;
  const j0 = Math.max(0, Math.floor(g.rowF(latMax)));
  const j1 = Math.min(g.h - 1, Math.ceil(g.rowF(latMin)));
  const i0 = Math.max(0, Math.floor(g.colF(lonMin)));
  const i1 = Math.min(g.w - 1, Math.ceil(g.colF(lonMax)));
  for (let j = j0; j <= j1; j++) {
    const row = j * g.w;
    for (let i = i0; i <= i1; i++) fn(row + i, i, j);
  }
}
