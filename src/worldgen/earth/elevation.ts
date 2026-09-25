import { RNG } from '../../core/rng';
import { Noise2D, clamp, smoothstep } from '../../core/noise';
import { hydraulicErosion, blur, Progress } from '../terrain';
import { EarthGrid, distanceKm } from './grid';
import { CountryRaster } from './raster';
import { polygonField, polylineField, tiltAt } from './geom';
import { BASINS, DEPRESSIONS, PEAKS, PLATEAUS, RANGES, RIDGES, SEA_REGIONS, TRENCHES } from './relief';

/** A smooth noise field sampled on a coarse lattice and bilinearly interpolated. */
export class CoarseField {
  readonly data: Float32Array;
  readonly cw: number;
  readonly ch: number;
  constructor(readonly g: EarthGrid, readonly step: number, fn: (i: number, j: number) => number) {
    this.cw = Math.ceil(g.w / step) + 2;
    this.ch = Math.ceil(g.h / step) + 2;
    this.data = new Float32Array(this.cw * this.ch);
    for (let y = 0; y < this.ch; y++) for (let x = 0; x < this.cw; x++) this.data[y * this.cw + x] = fn(x * step, y * step);
  }
  at(i: number, j: number): number {
    const fx = i / this.step, fy = j / this.step;
    const x = fx | 0, y = fy | 0;
    const tx = fx - x, ty = fy - y;
    const o = y * this.cw + x;
    const d = this.data;
    return (d[o] * (1 - tx) + d[o + 1] * tx) * (1 - ty) + (d[o + this.cw] * (1 - tx) + d[o + this.cw + 1] * tx) * ty;
  }
}

export interface ElevationResult {
  elevation: Float32Array;
  land: Uint8Array;
  /** Land cells: km to the nearest sea cell. Sea cells: km to the nearest land cell. */
  coastKm: Float32Array;
  /** Mountain-range envelope (m), useful for climate/biome tweaks. */
  rangeEnv: Float32Array;
}

const GREENLAND_ID = '304';

export function buildElevation(g: EarthGrid, raster: CountryRaster, rng: RNG, progress: Progress, erosionDroplets?: number): ElevationResult {
  const { w, h, n } = g;
  const land = raster.land;
  const sea = new Uint8Array(n);
  for (let k = 0; k < n; k++) sea[k] = land[k] ? 0 : 1;
  progress('Measuring coastlines', 0);
  const dSea = distanceKm(g, sea); // for land cells
  const dLand = distanceKm(g, land); // for sea cells
  const coastKm = new Float32Array(n);
  for (let k = 0; k < n; k++) coastKm[k] = land[k] ? dSea[k] : dLand[k];

  const nBase = new Noise2D(rng.fork(1));
  const nWarp = new Noise2D(rng.fork(2));
  const nRidge = new Noise2D(rng.fork(3));
  const nDetail = new Noise2D(rng.fork(4));
  const nRough = new Noise2D(rng.fork(5));
  const nSea = new Noise2D(rng.fork(6));

  const baseNoise = new CoarseField(g, 4, (i, j) => nBase.fbm(i / 70, j / 70, 4));
  const roughNoise = new CoarseField(g, 3, (i, j) => nRough.fbm(i / 22, j / 22, 4));
  const warpX = new CoarseField(g, 4, (i, j) => nWarp.fbm(i / 30, j / 30, 3));
  const warpY = new CoarseField(g, 4, (i, j) => nWarp.fbm(i / 30 + 57.3, j / 30 - 21.7, 3));
  const hilly = new CoarseField(g, 4, (i, j) => smoothstep(-0.35, 0.45, nRough.fbm(i / 45 - 31.3, j / 45 + 7.1, 3)));
  const hillyAt = (i: number, j: number) => hilly.at(i, j);

  // ---- 1. Lowland baseline ----------------------------------------------
  progress('Raising continents', 0.05);
  const e = new Float32Array(n);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (!land[k]) continue;
      const d = dSea[k];
      e[k] = 6 + 200 * (1 - Math.exp(-d / 650)) + 90 * baseNoise.at(i, j) * smoothstep(0, 250, d);
    }
  }

  // ---- 2. Plateaus (max-combine with soft edges) ---------------------------
  progress('Raising continents', 0.15);
  const edgeNoise = new CoarseField(g, 2, (i, j) => nWarp.fbm(i / 11 + 91.3, j / 11 - 11.9, 4));
  for (const p of PLATEAUS) {
    const soft = p.soft ?? 120;
    const rough = p.rough ?? 0.1;
    const cosR = p.ridges ? Math.cos((p.ridges[1] * Math.PI) / 180) : 0;
    const sinR = p.ridges ? Math.sin((p.ridges[1] * Math.PI) / 180) : 0;
    polygonField(g, p.poly, soft * 2.0, (k, sd, lon, lat) => {
      if (!land[k]) return;
      const i = k % w, j = (k / w) | 0;
      sd += soft * 0.9 * edgeNoise.at(i, j);
      const f = smoothstep(-soft * 0.75, soft * 0.25, sd);
      if (f <= 0) return;
      let target = p.tilt ? tiltAt(p.tilt, lon, lat) : p.elev;
      target *= 1 + rough * 1.6 * roughNoise.at(i, j);
      if (p.ridges) {
        // Parallel fault-block / fold ranges: warped anisotropic ridged noise.
        const xkm = lon * 111.32 * Math.cos((lat * Math.PI) / 180), ykm = lat * 111.32;
        const sp = p.ridges[2];
        const u = (xkm * cosR - ykm * sinR) / sp + 0.9 * warpX.at(i, j) * 6;
        const v = (xkm * sinR + ykm * cosR) / (sp * 3.2) + 0.9 * warpY.at(i, j) * 3;
        const r = nRidge.ridged(u + 13.1, v - 7.7, 3);
        const a = 0.6 + 0.8 * hillyAt(i, j);
        target += p.ridges[0] * a * (r - 0.3) * f;
      }
      if (target > e[k]) e[k] += (target - e[k]) * f;
    });
  }

  // ---- 3. Basins (min-combine caps) -------------------------------------------
  progress('Raising continents', 0.3);
  const flat = new Float32Array(n);
  for (const b of BASINS) {
    const soft = b.soft ?? 100;
    polygonField(g, b.poly, soft * 1.6, (k, sd, lon, lat) => {
      if (!land[k]) return;
      sd += soft * 0.6 * edgeNoise.at(k % w, (k / w) | 0);
      const f = smoothstep(-soft * 0.5, soft * 0.5, sd);
      if (f <= 0) return;
      if (f > flat[k]) flat[k] = f;
      const cap = b.tilt ? Math.max(3, tiltAt(b.tilt, lon, lat)) : b.cap;
      const i = k % w, j = (k / w) | 0;
      const c = cap * (1 + 0.15 * roughNoise.at(i, j));
      if (e[k] > c) e[k] -= (e[k] - c) * f;
    });
  }
  for (const d of DEPRESSIONS) {
    polylineField(g, [[d.lon, d.lat], [d.lon + 0.001, d.lat]], () => d.r * 1.5, (k, dist) => {
      if (!land[k]) return;
      const f = smoothstep(d.r * 1.5, d.r * 0.3, dist);
      e[k] += (2 - e[k]) * f;
      if (f > flat[k]) flat[k] = f;
    });
  }

  // ---- 4. Mountain ranges --------------------------------------------------------
  progress('Folding mountain ranges', 0.4);
  const env = new Float32Array(n);
  const warpDeg = 0.35;
  const warp = (k: number): [number, number] => {
    const i = k % w, j = (k / w) | 0;
    return [warpX.at(i, j) * warpDeg * 1.6, warpY.at(i, j) * warpDeg];
  };
  for (const r of RANGES) {
    const pts = r.pts;
    polylineField(g, pts, (s) => Math.max(pts[s][3], pts[s + 1][3]) * 1.6, (k, d, s, t) => {
      const P = pts[s][2] + (pts[s + 1][2] - pts[s][2]) * t;
      const W = pts[s][3] + (pts[s + 1][3] - pts[s][3]) * t;
      const q = d / W;
      const v = P * Math.exp(-2.2 * q * q);
      if (v > env[k]) env[k] = v;
    }, warp);
  }
  // Ruggedness and soft-max combine with the base surface.
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const E = env[k];
      if (E < 20 || !land[k]) continue;
      const r = nRidge.ridged(i / 7 + 3.7, j / 7 - 1.3, 5);
      const R = E * (0.82 + 0.6 * (r - 0.35));
      const a = e[k];
      const kk = 350;
      const hh = Math.max(kk - Math.abs(a - R), 0) / kk;
      e[k] = Math.max(a, R) + hh * hh * kk * 0.25;
    }
  }

  // ---- 5. Greenland ice sheet --------------------------------------------------
  const gi = raster.features.find((f) => f.id === GREENLAND_ID)?.index ?? -1;
  const ice = new Uint8Array(n);
  if (gi >= 0) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = j * w + i;
        if (raster.featureOf[k] !== gi) continue;
        const lat = g.latRow[j];
        const d = dSea[k];
        const hmax = 3150 - 900 * smoothstep(75, 82, lat) - 500 * smoothstep(64, 60, lat);
        const ih = hmax * Math.sqrt(clamp((d - 20) / 380, 0, 1)) * (1 + 0.03 * roughNoise.at(i, j));
        if (ih > e[k]) { e[k] = ih; if (d > 40) ice[k] = 1; }
      }
    }
  }

  // ---- 6. Medium-scale hills -------------------------------------------------------------
  progress('Folding mountain ranges', 0.6);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (!land[k] || ice[k]) continue;
      const v = e[k];
      const hl = (0.15 + 0.85 * hillyAt(i, j)) * (1 - 0.85 * flat[k]);
      const amp = hl * (25 + 0.12 * v);
      const hr = nDetail.ridged(i / 4.3 + 17.7, j / 4.3 - 5.1, 4);
      e[k] = Math.max(1, v + amp * 1.5 * (hr - 0.3));
    }
  }

  // ---- 7. Erosion ------------------------------------------------------------------------
  const norm = new Float32Array(n);
  const VS = 14000; // vertical scale for the erosion model (≈2x the procedural map's cell size)
  for (let k = 0; k < n; k++) norm[k] = land[k] ? e[k] / VS : -0.012;
  let landCells = 0;
  for (let k = 0; k < n; k++) landCells += land[k];
  const drops = erosionDroplets ?? Math.round(landCells * 0.5);
  hydraulicErosion(norm, w, h, rng.fork(11), drops, (s, f) => progress('Eroding valleys', f));
  // Keep incision, discard most deposition (which would blur the relief at this cell size).
  const depo = Number(process.env.EARTH_DEPO ?? 0.35);
  for (let k = 0; k < n; k++) {
    if (!land[k] || ice[k]) continue;
    const d = norm[k] * VS - e[k];
    e[k] = Math.max(1, e[k] + (d < 0 ? d : d * depo));
  }

  // ---- 8. Fine relief-scaled detail (after erosion so it stays crisp) ---------------------
  progress('Weathering mountains', 0);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (!land[k]) continue;
      const v = e[k];
      const coast = smoothstep(0, 30, dSea[k]);
      if (!ice[k]) {
        const hl = (0.2 + 0.8 * hillyAt(i, j)) * (1 - 0.8 * flat[k]);
        const mount = smoothstep(200, 2500, env[k]);
        const r2 = nRidge.ridged(i / 2.4 - 41.3, j / 2.4 + 8.9, 3);
        const nd = nDetail.fbm(i / 1.9, j / 1.9, 2);
        const amp = mount * 0.2 * v + hl * (10 + 0.07 * v);
        e[k] = Math.max(1, v + (amp * 1.4 * (r2 - 0.33) + (6 + 0.025 * v) * nd) * (0.4 + 0.6 * coast));
      }
      // Keep the coastline strip low (cells are ~16 km).
      e[k] = 1 + (e[k] - 1) * (0.35 + 0.65 * smoothstep(0, 45, dSea[k]));
    }
  }
  applyPeaks(g, e, land);

  // ---- 8. Ocean floor ---------------------------------------------------------------------
  progress('Shaping ocean floor', 0);
  buildBathymetry(g, e, land, dLand, rng, nSea);

  return { elevation: e, land, coastKm, rangeEnv: env };
}

/** Individual summits: smooth cones max-combined into the surface. */
function applyPeaks(g: EarthGrid, e: Float32Array, land: Uint8Array): void {
  const half = g.kmNS * 0.45;
  for (const p of PEAKS) {
    polylineField(g, [[p.lon, p.lat], [p.lon + 0.001, p.lat]], () => p.r * 3.5, (k, dist) => {
      if (!land[k]) return;
      const q = Math.max(0, dist - half) / p.r;
      const v = p.elev / (1 + q * q * 1.4);
      if (v > e[k]) e[k] = v;
    });
  }
}

function buildBathymetry(g: EarthGrid, e: Float32Array, land: Uint8Array, dLand: Float32Array, rng: RNG, nSea: Noise2D): void {
  const { w, h, n } = g;
  const floor = new Float32Array(n);
  const abyss = new CoarseField(g, 4, (i, j) => nSea.fbm(i / 60, j / 60, 4));
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (land[k]) continue;
      floor[k] = 4300 + 700 * smoothstep(250, 1400, dLand[k]) + 450 * abyss.at(i, j);
    }
  }
  for (const r of SEA_REGIONS) {
    const soft = r.soft ?? 150;
    polygonField(g, r.poly, soft * 0.6, (k, sd) => {
      if (land[k]) return;
      const f = smoothstep(-soft * 0.5, soft * 0.5, sd);
      if (f > 0) floor[k] += (r.depth - floor[k]) * f;
    });
  }
  const nHills = new Noise2D(rng.fork(61));
  // Continental shelves are wide next to large landmasses, narrow around oceanic islands.
  const lf = new Float32Array(n);
  for (let k = 0; k < n; k++) lf[k] = land[k];
  const landFrac = blur(lf, w, h, 10, 10);
  const shelfNoise = new CoarseField(g, 4, (i, j) => nSea.fbm(i / 25 + 40, j / 25 - 9, 3));
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (land[k]) continue;
      const F = floor[k];
      const d = dLand[k];
      const cont = smoothstep(0.015, 0.2, landFrac[k]);
      let z: number;
      if (F <= 220) {
        z = 6 + (F - 6) * smoothstep(0, 110, d);
      } else {
        const shelfW = (12 + 70 * cont) * (1 + 0.45 * shelfNoise.at(i, j)), slopeW = 50 + 110 * cont;
        const shelf = Math.min(F, 140);
        z = 8 + (shelf - 8) * smoothstep(0, shelfW, d) + (F - shelf) * smoothstep(shelfW * 0.7, shelfW + slopeW, d);
      }
      // Abyssal hills.
      z += smoothstep(80, 400, d) * smoothstep(300, 2500, F) * 220 * nHills.fbm(i / 5, j / 5, 3);
      e[k] = -Math.max(2, z);
    }
  }
  // Mid-ocean ridges: raise towards the crest with a central rift.
  const ridgeRaise = new Float32Array(n);
  for (const r of RIDGES) {
    polylineField(g, r.pts, () => r.halfKm * 2, (k, d) => {
      if (land[k]) return;
      const q = d / r.halfKm;
      const f = Math.exp(-2 * q * q);
      if (f > ridgeRaise[k]) ridgeRaise[k] = f;
      const target = -(r.crest + 500 * Math.exp(-((d / 18) ** 2)));
      const cur = e[k];
      if (target > cur) {
        const nr = 0.55 + 0.9 * nHills.ridged(k % w / 4, ((k / w) | 0) / 4, 3);
        e[k] = Math.min(-2, cur + (target - cur) * f * nr);
      }
    });
  }
  // Trenches.
  for (const t of TRENCHES) {
    polylineField(g, t.pts, () => t.halfKm * 2.2, (k, d) => {
      if (land[k]) return;
      const q = d / t.halfKm;
      const target = -t.depth;
      const cur = e[k];
      if (target < cur) e[k] = cur + (target - cur) * Math.exp(-2 * q * q);
    });
  }
}
