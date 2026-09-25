import { KM_PER_DEG } from '../types';
import { EarthGrid } from './grid';

export type LonLat = readonly [number, number];

/** Makes longitudes continuous (no jumps > 180°) so shapes can straddle the antimeridian. */
export function unwrapLons<T extends readonly number[]>(pts: ReadonlyArray<T>): number[][] {
  const out: number[][] = [];
  let off = 0;
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k].slice() as number[];
    if (k > 0) {
      const d = p[0] + off - out[k - 1][0];
      if (d > 180) off -= 360; else if (d < -180) off += 360;
    }
    p[0] += off;
    out.push(p);
  }
  return out;
}

/**
 * Iterates cells of a lon/lat box given in "virtual" (possibly unwrapped)
 * longitudes. fn receives the real cell index, the virtual lon and the lat.
 */
export function forVirtualBox(
  g: EarthGrid,
  lonMin: number, lonMax: number, latMin: number, latMax: number,
  fn: (k: number, lon: number, lat: number) => void,
): void {
  const j0 = Math.max(0, Math.floor(g.rowF(latMax)));
  const j1 = Math.min(g.h - 1, Math.ceil(g.rowF(latMin)));
  const i0 = Math.floor(g.colF(lonMin));
  const i1 = Math.ceil(g.colF(lonMax));
  if (i1 - i0 > g.w * 1.5) return;
  const P = g.period;
  for (let iv = i0; iv <= i1; iv++) {
    let i = iv;
    if (i < 0) i = Math.round(i + P);
    else if (i >= g.w) i = Math.round(i - P);
    if (i < 0 || i >= g.w) continue;
    const lon = g.lon(iv);
    for (let j = j0; j <= j1; j++) fn(j * g.w + i, lon, g.latRow[j]);
  }
}

/**
 * Signed distance (km, positive inside) of cells to a polygon, evaluated over
 * the polygon's bounding box expanded by padKm. Calls fn(cell, sd, lon, lat).
 */
export function polygonField(
  g: EarthGrid,
  poly: ReadonlyArray<LonLat>,
  padKm: number,
  fn: (k: number, sd: number, lon: number, lat: number) => void,
): void {
  const pts = unwrapLons(poly);
  const n = pts.length;
  const xs = new Float64Array(n), ys = new Float64Array(n);
  let lonMin = 1e9, lonMax = -1e9, latMin = 1e9, latMax = -1e9;
  for (let k = 0; k < n; k++) {
    xs[k] = pts[k][0]; ys[k] = pts[k][1];
    lonMin = Math.min(lonMin, xs[k]); lonMax = Math.max(lonMax, xs[k]);
    latMin = Math.min(latMin, ys[k]); latMax = Math.max(latMax, ys[k]);
  }
  const padLat = padKm / KM_PER_DEG;
  const cosM = Math.max(0.08, Math.cos((Math.min(85, Math.max(Math.abs(latMin), Math.abs(latMax)) + padLat) * Math.PI) / 180));
  const padLon = padLat / cosM;
  forVirtualBox(g, lonMin - padLon, lonMax + padLon, latMin - padLat, latMax + padLat, (k, lon, lat) => {
    const c = Math.cos((lat * Math.PI) / 180) * KM_PER_DEG;
    let inside = false;
    let best = Infinity;
    for (let a = 0, b = n - 1; a < n; b = a++) {
      const xa = xs[a], ya = ys[a], xb = xs[b], yb = ys[b];
      if ((ya > lat) !== (yb > lat) && lon < xa + ((lat - ya) * (xb - xa)) / (yb - ya)) inside = !inside;
      // Distance to edge in km (local flat approximation).
      const ax = (xa - lon) * c, ay = (ya - lat) * KM_PER_DEG;
      const bx = (xb - lon) * c, by = (yb - lat) * KM_PER_DEG;
      const ex = bx - ax, ey = by - ay;
      const l2 = ex * ex + ey * ey;
      let t = l2 > 0 ? -(ax * ex + ay * ey) / l2 : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const dx = ax + ex * t, dy = ay + ey * t;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
    }
    const d = Math.sqrt(best);
    const sd = inside ? d : -d;
    if (sd > -padKm) fn(k, sd, lon, lat);
  });
}

/**
 * Distance of cells to each segment of a polyline, within reachKm. Calls
 * fn(cell, distKm, segmentIndex, t) once per (cell, segment) pair; callers
 * combine segments with min/max. Optional warp(k) returns a [dLon, dLat]
 * offset applied to the cell position (domain warping).
 */
export function polylineField(
  g: EarthGrid,
  line: ReadonlyArray<readonly number[]>,
  reachKm: (seg: number) => number,
  fn: (k: number, d: number, seg: number, t: number) => void,
  warp?: (k: number) => [number, number],
): void {
  const pts = unwrapLons(line);
  for (let s = 0; s + 1 < pts.length; s++) {
    const [lon1, lat1] = pts[s];
    const [lon2, lat2] = pts[s + 1];
    const reach = reachKm(s);
    const padLat = reach / KM_PER_DEG;
    const maxAbs = Math.min(85, Math.max(Math.abs(lat1), Math.abs(lat2)) + padLat);
    const cosM = Math.max(0.08, Math.cos((maxAbs * Math.PI) / 180));
    const padLon = padLat / cosM;
    const r2 = reach * reach;
    forVirtualBox(g,
      Math.min(lon1, lon2) - padLon, Math.max(lon1, lon2) + padLon,
      Math.min(lat1, lat2) - padLat, Math.max(lat1, lat2) + padLat,
      (k, lon, lat) => {
        if (warp) { const w = warp(k); lon += w[0]; lat += w[1]; }
        const c = Math.cos((lat * Math.PI) / 180) * KM_PER_DEG;
        const ax = (lon1 - lon) * c, ay = (lat1 - lat) * KM_PER_DEG;
        const ex = (lon2 - lon1) * c, ey = (lat2 - lat1) * KM_PER_DEG;
        const l2 = ex * ex + ey * ey;
        let t = l2 > 0 ? -(ax * ex + ay * ey) / l2 : 0;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const dx = ax + ex * t, dy = ay + ey * t;
        const d2 = dx * dx + dy * dy;
        if (d2 <= r2) fn(k, Math.sqrt(d2), s, t);
      });
  }
}

/** Evaluates a linear tilt [lonA, latA, eA, lonB, latB, eB] at a point. */
export function tiltAt(t: readonly number[], lon: number, lat: number): number {
  const [la, pa, ea, lb, pb, eb] = t;
  const c = Math.cos((((pa + pb) / 2) * Math.PI) / 180);
  const ex = (lb - la) * c, ey = pb - pa;
  const px = (lon - la) * c, py = lat - pa;
  let u = (px * ex + py * ey) / (ex * ex + ey * ey);
  if (u < -0.25) u = -0.25; else if (u > 1.25) u = 1.25;
  return ea + (eb - ea) * u;
}

/** Point-in-polygon (even-odd) with unwrapped polygon coordinates. */
export function pointInPoly(poly: ReadonlyArray<LonLat>, lon: number, lat: number): boolean {
  const pts = unwrapLons(poly);
  let inside = false;
  for (const off of [0, 360, -360]) {
    inside = false;
    const x = lon + off;
    for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
      const [xa, ya] = pts[a], [xb, yb] = pts[b];
      if ((ya > lat) !== (yb > lat) && x < xa + ((lat - ya) * (xb - xa)) / (yb - ya)) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}
