import { Noise2D, smoothstep, clamp, lerp } from '../core/noise';
import { RNG } from '../core/rng';
import { Biome } from './types';
import { blur, distanceField } from './terrain';

export interface Climate {
  temperature: Float32Array; // °C annual mean
  precipitation: Float32Array; // mm/yr
  continentality: Float32Array; // 0..1
  oceanDist: Float32Array; // cells
}

/** Latitude band of the map; set by simulateClimate callers. */
export const latRange = { north: 72, south: -50 };

export function latOfRow(j: number, h: number): number {
  return latRange.north - (j / (h - 1)) * (latRange.north - latRange.south);
}

const RAIN_RATE = 0.0038;

/** Zonal precipitation factor (ITCZ, subtropical highs, westerlies). */
function zonal(lat: number): number {
  const a = Math.abs(lat);
  return 0.42 + 1.45 * Math.exp(-((lat / 12) ** 2)) + 0.65 * Math.exp(-(((a - 50) / 15) ** 2)) - 0.12 * Math.exp(-(((a - 26) / 6) ** 2));
}

export function seaLevelTemp(lat: number): number {
  return 27 - 0.0065 * lat * lat;
}

/**
 * Simulates temperature and precipitation. Moisture is advected along the
 * prevailing winds of each latitude band, rained out over land with
 * orographic lift, which creates rain shadows and continental deserts.
 */
export function simulateClimate(elev: Float32Array, w: number, h: number, rng: RNG): Climate {
  const n = w * h;
  const noise = new Noise2D(rng.fork(21));
  const ocean = new Uint8Array(n);
  for (let i = 0; i < n; i++) ocean[i] = elev[i] <= 0 ? 1 : 0;
  const oceanDist = distanceField(ocean, w, h);

  const temperature = new Float32Array(n);
  const continentality = new Float32Array(n);
  for (let j = 0; j < h; j++) {
    const lat = latOfRow(j, h);
    const t0 = seaLevelTemp(lat);
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const e = Math.max(0, elev[k]) / 1000;
      const cont = clamp(oceanDist[k] / 120, 0, 1);
      continentality[k] = cont;
      let t = t0 - 6.5 * e;
      // Continental interiors are colder at high latitude (harsh winters).
      t -= cont * 5 * smoothstep(25, 65, Math.abs(lat));
      // Warm ocean currents etc: gentle noise.
      t += 1.6 * noise.fbm(i / 180, j / 180, 3);
      temperature[k] = t;
    }
  }

  // Moisture advection. Sweep each row in both directions; weight by the
  // prevailing wind of that latitude band.
  const rainFwd = new Float32Array(n); // wind blowing +x (westerlies)
  const rainBwd = new Float32Array(n); // wind blowing -x (trade winds / polar easterlies)
  const sweep = (out: Float32Array, dir: number) => {
    for (let j = 0; j < h; j++) {
      let m = 1;
      let prevE = 0;
      const row = j * w;
      for (let s = 0; s < w; s++) {
        const i = dir > 0 ? s : w - 1 - s;
        const k = row + i;
        const e = Math.max(0, elev[k]) / 1000;
        if (ocean[k]) {
          const t = temperature[k];
          const cap = clamp(0.35 + t / 30, 0.25, 1.2);
          m += (cap - m) * 0.06;
          out[k] = m * RAIN_RATE;
          prevE = 0;
          continue;
        }
        const de = e - prevE;
        let rain = m * RAIN_RATE + Math.max(0, de) * m * 2.6;
        if (e > 2.5) rain += m * 0.015 * (e - 2.5);
        rain = Math.min(rain, m * 0.6);
        m -= rain * 0.62; // some moisture is recycled by vegetation
        out[k] = rain;
        prevE = e;
      }
    }
  };
  sweep(rainFwd, 1);
  sweep(rainBwd, -1);

  let precip: Float32Array = new Float32Array(n);
  for (let j = 0; j < h; j++) {
    const lat = latOfRow(j, h);
    const a = Math.abs(lat);
    // Westerlies between 32° and 62°, easterlies elsewhere; smooth transitions.
    const west = smoothstep(26, 36, a) * (1 - smoothstep(58, 66, a));
    const z = zonal(lat);
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const r = rainFwd[k] * (0.15 + 0.85 * west) + rainBwd[k] * (0.15 + 0.85 * (1 - west));
      precip[k] = r;
      void z;
    }
  }
  // Smooth the streaky advection result; more smoothing across latitude.
  precip = blur(precip, w, h, 3, 7);
  for (let j = 0; j < h; j++) {
    const lat = latOfRow(j, h);
    const z = zonal(lat);
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const coastal = 250 * Math.exp(-oceanDist[k] / 10);
      const nz = 1 + 0.3 * noise.fbm(i / 90 + 40, j / 90 - 12, 4);
      // Convective rainfall of the inter-tropical convergence zone reaches deep
      // into continents (rainforest belts), plus a monsoon-like noise term.
      const itcz = 1500 * Math.exp(-((lat / 10.5) ** 2)) * (1 - 0.3 * continentality[k]);
      const monsoon = 380 * Math.max(0, noise.fbm(i / 140 - 70, j / 140 + 30, 3)) * smoothstep(40, 10, Math.abs(lat));
      precip[k] = Math.max(15, (precip[k] / RAIN_RATE) * 1200 * z * nz + coastal * z + (itcz + monsoon) * nz);
    }
  }
  return { temperature, precipitation: precip, continentality, oceanDist };
}

/** Aridity / vegetation helpers shared by biome & colour generation. */
export function potentialEvap(t: number): number {
  return 280 + 48 * Math.max(0, t);
}

export function classifyBiome(t: number, p: number, elevM: number, slope: number, lowWet: number): Biome {
  if (elevM <= 0) return Biome.Ocean;
  if (t < -9) return Biome.Ice;
  const wet = p / potentialEvap(t);
  if (t < -3) return Biome.Tundra;
  if (elevM > 3200 && t < 2) return Biome.Alpine;
  if (lowWet > 0.6 && wet > 1.1 && slope < 0.02) return Biome.Wetland;
  if (t < 3) return wet > 0.55 ? Biome.Taiga : Biome.Tundra;
  if (t < 19) {
    if (wet < 0.15) return t < 11 ? Biome.ColdDesert : Biome.HotDesert;
    if (wet < 0.5) return Biome.Grassland;
    if (wet < 0.8 && t > 12) return Biome.Mediterranean;
    if (wet > 2.2) return Biome.TemperateRainforest;
    return t < 7 ? Biome.Taiga : Biome.TemperateForest;
  }
  if (wet < 0.14) return Biome.HotDesert;
  if (wet < 0.55) return Biome.Savanna;
  if (wet < 0.95) return Biome.TropicalDryForest;
  return Biome.TropicalRainforest;
}

type RGB = [number, number, number];
const C = {
  sandHot: [212, 178, 128] as RGB,
  sandRed: [196, 132, 88] as RGB,
  sandCold: [168, 156, 128] as RGB,
  steppe: [168, 160, 108] as RGB,
  grass: [118, 138, 68] as RGB,
  savanna: [164, 150, 86] as RGB,
  temperate: [62, 92, 44] as RGB,
  boreal: [44, 70, 50] as RGB,
  rainforest: [34, 76, 34] as RGB,
  tropDry: [92, 110, 52] as RGB,
  tundra: [128, 124, 98] as RGB,
  ice: [238, 243, 250] as RGB,
  rock: [118, 108, 98] as RGB,
  rockDark: [88, 82, 78] as RGB,
  wetland: [66, 88, 58] as RGB,
  beach: [218, 204, 164] as RGB,
  salt: [226, 222, 212] as RGB,
};

function mix3(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export interface SurfaceParams {
  t: number;
  p: number;
  elevM: number;
  slope: number; // rise/run in metres per metre
  riverProx: number; // 0..1
  coastDist: number; // cells
  salt: boolean;
  n1: number; // noise -1..1
  n2: number;
  wetland: number;
}

/** Computes a satellite-like surface colour and forest density for a land cell. */
export function surfaceColour(sp: SurfaceParams, out: Uint8Array, o: number): void {
  const { t, p, elevM, slope } = sp;
  const pet = potentialEvap(t);
  let wet = p / pet;
  wet += sp.riverProx * 0.9 * smoothstep(0.6, 0.1, wet); // riparian green belts in dry lands
  const veg = smoothstep(0.07, 0.55, wet);
  let forest = smoothstep(0.55, 1.15, wet) * smoothstep(-5, 2, t);
  const sandMix = clamp(0.5 + sp.n2 * 0.9, 0, 1) * smoothstep(12, 24, t);
  let dry = mix3(C.sandCold, C.sandHot, smoothstep(4, 18, t));
  dry = mix3(dry, C.sandRed, sandMix * 0.55);
  let grass = mix3(C.tundra, C.steppe, smoothstep(-4, 6, t));
  grass = mix3(grass, C.grass, smoothstep(0.3, 0.75, wet) * smoothstep(-2, 8, t));
  grass = mix3(grass, C.savanna, smoothstep(17, 24, t) * (1 - smoothstep(1.0, 1.6, wet)));
  let forestC = mix3(C.boreal, C.temperate, smoothstep(1, 11, t));
  forestC = mix3(forestC, C.tropDry, smoothstep(17, 23, t) * (1 - smoothstep(0.9, 1.5, wet)));
  forestC = mix3(forestC, C.rainforest, smoothstep(18, 24, t) * smoothstep(1.0, 1.6, wet));
  let c = mix3(dry, grass, veg);
  c = mix3(c, forestC, forest * 0.92);
  if (sp.wetland > 0) c = mix3(c, C.wetland, sp.wetland * 0.7);
  // Treeline & alpine rock.
  const alpine = smoothstep(1, -4, t);
  forest *= 1 - alpine;
  c = mix3(c, C.tundra, alpine * 0.7);
  const steep = smoothstep(0.1, 0.32, slope);
  forest *= 1 - steep * 0.8;
  c = mix3(c, sp.n1 > 0 ? C.rock : C.rockDark, Math.max(steep * 0.85, smoothstep(2800, 4200, elevM) * 0.6));
  // Permanent snow & glaciers.
  const snow = smoothstep(-5, -10, t) + smoothstep(-2.5, -7, t) * smoothstep(0.02, 0.12, slope) * 0.5;
  c = mix3(c, C.ice, clamp(snow, 0, 1));
  forest *= 1 - clamp(snow, 0, 1);
  // Beaches & salt flats.
  if (sp.coastDist < 1.6 && elevM < 18 && slope < 0.03) c = mix3(c, C.beach, 0.65 * (1 - forest));
  if (sp.salt) c = mix3(c, C.salt, 0.75);
  // Subtle brightness variation.
  const b = 1 + sp.n1 * 0.07;
  out[o] = clamp(c[0] * b, 0, 255);
  out[o + 1] = clamp(c[1] * b, 0, 255);
  out[o + 2] = clamp(c[2] * b, 0, 255);
  out[o + 3] = clamp(forest * 255, 0, 255);
}
