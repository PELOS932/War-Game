import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import atlasJson from 'world-atlas/countries-50m.json';
import { EarthGrid } from './grid';

export type Ring = ReadonlyArray<readonly [number, number]>;

/**
 * Even-odd scanline fill of polygon rings (lon/lat) at heightmap resolution.
 * Every ring is unwrapped so that consecutive vertices never jump by more than
 * 180° (antimeridian crossings), filled independently and XOR-combined, which
 * equals the even-odd rule for the whole set (holes subtract). Spans that
 * leave [-180, 180) wrap around. Calls fn(cell) once per inside cell.
 */
export function rasterRings(g: EarthGrid, rings: ReadonlyArray<Ring>, fn: (k: number) => void): void {
  const toggles: number[] = [];
  const KEY = 4096; // key = row * KEY + (lon + 1024)
  const cross: number[] = [];
  const latN = g.s.latNorth;
  const d = g.dDeg;
  for (const ring of rings) {
    const n = ring.length;
    if (n < 3) continue;
    // Unwrap longitudes.
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    let off = 0;
    xs[0] = ring[0][0];
    ys[0] = ring[0][1];
    for (let k = 1; k < n; k++) {
      const dx = ring[k][0] + off - xs[k - 1];
      if (dx > 180) off -= 360;
      else if (dx < -180) off += 360;
      xs[k] = ring[k][0] + off;
      ys[k] = ring[k][1];
    }
    cross.length = 0;
    for (let k = 0; k < n; k++) {
      const k2 = k + 1 === n ? 0 : k + 1;
      const x1 = xs[k], y1 = ys[k], x2 = xs[k2], y2 = ys[k2];
      if (y1 === y2) continue;
      const ymin = Math.min(y1, y2), ymax = Math.max(y1, y2);
      let ja = Math.floor((latN - ymax) / d) + 1;
      let jb = Math.floor((latN - ymin) / d);
      if (ja < 0) ja = 0;
      if (jb > g.h - 1) jb = g.h - 1;
      for (let j = ja; j <= jb; j++) {
        const lat = latN - j * d;
        if ((y1 > lat) === (y2 > lat)) continue;
        const x = x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1);
        cross.push(j * KEY + (x + 1024));
      }
    }
    if (cross.length < 2) continue;
    const arr = Float64Array.from(cross).sort();
    for (let k = 0; k + 1 < arr.length; k += 2) {
      const ja = Math.floor(arr[k] / KEY), jb = Math.floor(arr[k + 1] / KEY);
      if (ja !== jb) { k--; continue; } // malformed ring: resync
      let a = arr[k] - ja * KEY - 1024;
      let b = arr[k + 1] - jb * KEY - 1024;
      // Normalise so a ∈ [-180, 180).
      const shift = Math.floor((a + 180) / 360) * 360;
      a -= shift; b -= shift;
      const base = ja * KEY + 1024;
      if (b <= 180) {
        toggles.push(base + a, base + b);
      } else {
        toggles.push(base + a, base + 180, base - 180, base + Math.min(180, b - 360));
      }
    }
  }
  if (toggles.length < 2) return;
  const t = Float64Array.from(toggles).sort();
  const lonW = g.s.lonWest;
  for (let k = 0; k + 1 < t.length; k += 2) {
    const j = Math.floor(t[k] / KEY);
    const jb = Math.floor(t[k + 1] / KEY);
    if (j !== jb) { k--; continue; }
    const a = t[k] - j * KEY - 1024;
    const b = t[k + 1] - j * KEY - 1024;
    const i0 = Math.max(0, Math.ceil((a - lonW) / d));
    const i1 = Math.min(g.w - 1, Math.ceil((b - lonW) / d) - 1);
    const row = j * g.w;
    for (let i = i0; i <= i1; i++) fn(row + i);
  }
}

export interface AtlasFeature {
  index: number;
  /** Numeric-string id, or "name:<name>" when the feature has none. */
  key: string;
  id: string | undefined;
  name: string;
  /** Polygons: arrays of rings (first = outer). */
  polygons: [number, number][][][];
  cells: number;
  /** Area-weighted centroid lon/lat of the largest polygon. */
  lon: number;
  lat: number;
}

export interface CountryRaster {
  features: AtlasFeature[];
  /** Per heightmap cell: atlas feature index or -1 for sea. */
  featureOf: Int16Array;
  land: Uint8Array;
}

const EXCLUDED_IDS = new Set(['010']); // Antarctica

function ringArea(r: [number, number][]): { a: number; cx: number; cy: number } {
  let a = 0, cx = 0, cy = 0;
  let off = 0;
  let px = r[0][0], py = r[0][1];
  for (let k = 1; k <= r.length; k++) {
    const q = r[k % r.length];
    let x = q[0] + off;
    if (x - px > 180) { off -= 360; x -= 360; } else if (x - px < -180) { off += 360; x += 360; }
    const y = q[1];
    const c = px * y - x * py;
    a += c; cx += (px + x) * c; cy += (py + y) * c;
    px = x; py = y;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-12) return { a: 0, cx: r[0][0], cy: r[0][1] };
  let lon = cx / (6 * a);
  if (lon > 180) lon -= 360; else if (lon < -180) lon += 360;
  return { a: Math.abs(a), cx: lon, cy: cy / (6 * a) };
}

/** Decodes Natural Earth country outlines and rasterises them onto the heightmap. */
export function rasterizeCountries(g: EarthGrid): CountryRaster {
  const topo = atlasJson as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
  const fc = feature(topo, topo.objects.countries);
  const featureOf = new Int16Array(g.n).fill(-1);
  const features: AtlasFeature[] = [];
  const minIslandKm2 = 25;
  for (const f of fc.features) {
    const id = f.id === undefined ? undefined : String(f.id);
    if (id && EXCLUDED_IDS.has(id)) continue;
    const geom = f.geometry;
    if (!geom) continue;
    let polys: [number, number][][][];
    if (geom.type === 'Polygon') polys = [geom.coordinates as [number, number][][]];
    else if (geom.type === 'MultiPolygon') polys = geom.coordinates as [number, number][][][];
    else continue;
    const name = (f.properties as { name: string }).name;
    const af: AtlasFeature = {
      index: features.length,
      key: id ?? `name:${name}`,
      id,
      name,
      polygons: [],
      cells: 0,
      lon: 0,
      lat: 0,
    };
    let bestA = -1;
    for (const p of polys) {
      // Skip polygons entirely south of the map.
      let maxLat = -90;
      for (const pt of p[0]) if (pt[1] > maxLat) maxLat = pt[1];
      if (maxLat < g.s.latSouth) continue;
      af.polygons.push(p);
      let cnt = 0;
      const fi = af.index;
      rasterRings(g, p, (k) => { featureOf[k] = fi; cnt++; });
      const ra = ringArea(p[0]);
      if (ra.a > bestA) { bestA = ra.a; af.lon = ra.cx; af.lat = ra.cy; }
      if (cnt === 0) {
        // Too small for the raster: keep sizeable islands as a single cell.
        const km2 = ra.a * 111.32 * 111.32 * Math.cos((ra.cy * Math.PI) / 180);
        if (km2 >= minIslandKm2 && ra.cy > g.s.latSouth && ra.cy < g.s.latNorth) {
          const k = g.cellOf(ra.cx, ra.cy);
          if (featureOf[k] < 0) { featureOf[k] = fi; cnt = 1; }
        }
      }
      af.cells += cnt;
    }
    if (af.polygons.length) features.push(af);
  }
  // The last column (lon ≈ +180.01°) duplicates the first (−180°).
  for (let j = 0; j < g.h; j++) {
    const row = j * g.w;
    featureOf[row + g.w - 1] = featureOf[row];
  }
  const land = new Uint8Array(g.n);
  for (let k = 0; k < g.n; k++) land[k] = featureOf[k] >= 0 ? 1 : 0;
  return { features, featureOf, land };
}
