import { HexGrid } from '../core/hex';
import { smoothstep } from '../core/noise';
import { Biome, Terrain, HEIGHT_SPACING } from './types';
import { potentialEvap } from './climate';

export interface HexLayer {
  terrain: Uint8Array;
  elevation: Float32Array;
  forest: Uint8Array;
  temperature: Float32Array;
  precip: Float32Array;
  riverEdges: Uint8Array;
  hasRiver: Uint8Array;
  coast: Uint8Array;
  habitability: Float32Array;
  relief: Float32Array;
}

export function deriveHexes(
  grid: HexGrid,
  w: number,
  h: number,
  elev: Float32Array,
  waterLevel: Float32Array,
  temperature: Float32Array,
  precip: Float32Array,
  biome: Uint8Array,
  albedo: Uint8Array,
  riverCell: Uint8Array,
  accumulation: Float32Array,
): HexLayer {
  const n = grid.count;
  const terrain = new Uint8Array(n);
  const elevation = new Float32Array(n);
  const forest = new Uint8Array(n);
  const temp = new Float32Array(n);
  const prec = new Float32Array(n);
  const riverEdges = new Uint8Array(n);
  const hasRiver = new Uint8Array(n);
  const coast = new Uint8Array(n);
  const habitability = new Float32Array(n);
  const relief = new Float32Array(n);
  const sp = HEIGHT_SPACING;
  const R = 0.92;
  const biomeCount = new Float32Array(16);
  const isLand = new Uint8Array(n);
  const lakeFrac = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const cx = grid.cx[i], cz = grid.cz[i];
    const x0 = Math.max(0, Math.floor((cx - R) / sp)), x1 = Math.min(w - 1, Math.ceil((cx + R) / sp));
    const y0 = Math.max(0, Math.floor((cz - R) / sp)), y1 = Math.min(h - 1, Math.ceil((cz + R) / sp));
    let cnt = 0, land = 0, lake = 0, sumE = 0, sumLandE = 0, minE = 1e9, maxE = -1e9;
    let sumT = 0, sumP = 0, sumF = 0;
    biomeCount.fill(0);
    let river = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x * sp - cx, dz = y * sp - cz;
        if (dx * dx + dz * dz > R * R) continue;
        const k = y * w + x;
        cnt++;
        const e = elev[k];
        sumE += e;
        sumT += temperature[k];
        sumP += precip[k];
        if (waterLevel[k] > -1e8) { lake++; continue; }
        if (e > 0) {
          land++;
          sumLandE += e;
          if (e < minE) minE = e;
          if (e > maxE) maxE = e;
          sumF += albedo[k * 4 + 3];
          biomeCount[biome[k]]++;
          if (riverCell[k]) river = Math.max(river, accumulation[k]);
        }
      }
    }
    if (cnt === 0) cnt = 1;
    temp[i] = sumT / cnt;
    prec[i] = sumP / cnt;
    lakeFrac[i] = lake / cnt;
    if (land / cnt >= 0.34) {
      isLand[i] = 1;
      const avgE = sumLandE / land;
      elevation[i] = avgE;
      const rel = maxE - minE;
      relief[i] = rel;
      const f = sumF / land / 255;
      forest[i] = Math.round(f * 255);
      hasRiver[i] = river > 0 ? 1 : 0;
      let bestB = 0, bestC = -1;
      for (let b = 0; b < 16; b++) if (biomeCount[b] > bestC) { bestC = biomeCount[b]; bestB = b; }
      let t: Terrain;
      if (bestB === Biome.Ice) t = Terrain.Ice;
      else if (avgE > 2600 || rel > 1500) t = Terrain.Mountains;
      else if (avgE > 1250 || rel > 620) t = Terrain.Hills;
      else if (bestB === Biome.Wetland) t = Terrain.Marsh;
      else if (bestB === Biome.HotDesert || bestB === Biome.ColdDesert) t = Terrain.Desert;
      else if (bestB === Biome.Tundra || bestB === Biome.Alpine) t = Terrain.Tundra;
      else if (bestB === Biome.TropicalRainforest && f > 0.45) t = Terrain.Jungle;
      else if (f > 0.5) t = bestB === Biome.TropicalDryForest && f > 0.7 ? Terrain.Jungle : Terrain.Forest;
      else t = Terrain.Plains;
      terrain[i] = t;
    } else {
      elevation[i] = sumE / cnt;
      terrain[i] = lake > cnt - land - lake ? Terrain.Lake : elevation[i] < -300 ? Terrain.DeepOcean : Terrain.Coastal;
    }
  }

  // Coastal waters: any sea hex touching land. Coastal land hexes.
  for (let i = 0; i < n; i++) {
    for (let d = 0; d < 6; d++) {
      const nb = grid.neighbours[i * 6 + d];
      if (nb < 0) continue;
      if (isLand[i] && !isLand[nb] && terrain[nb] !== Terrain.Lake) coast[i] = 1;
      if (!isLand[i] && terrain[i] === Terrain.DeepOcean && isLand[nb]) terrain[i] = Terrain.Coastal;
    }
  }

  // River crossings between adjacent hexes.
  for (let i = 0; i < n; i++) {
    if (!isLand[i]) continue;
    for (let d = 0; d < 3; d++) {
      const nb = grid.neighbours[i * 6 + d];
      if (nb < 0 || !isLand[nb]) continue;
      let crossed = false;
      for (let s = 1; s <= 5 && !crossed; s++) {
        const t = 0.25 + s * 0.083;
        const x = grid.cx[i] + (grid.cx[nb] - grid.cx[i]) * t;
        const z = grid.cz[i] + (grid.cz[nb] - grid.cz[i]) * t;
        const k = Math.round(z / sp) * w + Math.round(x / sp);
        if (riverCell[k]) crossed = true;
      }
      if (crossed) {
        riverEdges[i] |= 1 << d;
        riverEdges[nb] |= 1 << ((d + 3) % 6);
      }
    }
  }

  // Habitability.
  const TERRAIN_HAB: Record<number, number> = {
    [Terrain.Plains]: 1, [Terrain.Farmland]: 1, [Terrain.Forest]: 0.62, [Terrain.Jungle]: 0.4,
    [Terrain.Hills]: 0.55, [Terrain.Mountains]: 0.14, [Terrain.Desert]: 0.07, [Terrain.Tundra]: 0.08,
    [Terrain.Marsh]: 0.3, [Terrain.Ice]: 0.005, [Terrain.Urban]: 1,
  };
  for (let i = 0; i < n; i++) {
    if (!isLand[i]) continue;
    const t = temp[i], p = prec[i];
    const tempScore = Math.exp(-(((t - 16) / 11) ** 2));
    const wet = p / potentialEvap(t);
    const precipScore = smoothstep(0.12, 0.75, wet) * (1 - 0.35 * smoothstep(1.8, 3.5, wet));
    let hab = tempScore * precipScore * (TERRAIN_HAB[terrain[i]] ?? 0.3);
    if (hasRiver[i]) hab = hab * 1.45 + 0.08 * tempScore; // river valleys support life even in deserts
    if (coast[i]) hab *= 1.3;
    habitability[i] = hab;
  }

  return { terrain, elevation, forest, temperature: temp, precip: prec, riverEdges, hasRiver, coast, habitability, relief };
}
