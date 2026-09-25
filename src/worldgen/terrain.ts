import { RNG } from '../core/rng';
import { Noise2D, smoothstep, clamp } from '../core/noise';

/**
 * Tectonic heightmap generation.
 * Produces a normalised height field where 0 = sea level and 1.0 ≈ 8000 m.
 */

interface Plate {
  id: number;
  x: number;
  z: number;
  continental: boolean;
  base: number;
  vx: number;
  vz: number;
  roughness: number;
}

export type Progress = (stage: string, fraction: number) => void;

export function generateBaseHeight(
  rng: RNG,
  w: number,
  h: number,
  spacing: number,
  landFraction: number,
  progress: Progress,
): Float32Array {
  const W = (w - 1) * spacing;
  const H = (h - 1) * spacing;
  const noise = new Noise2D(rng.fork(1));
  const warpNoise = new Noise2D(rng.fork(2));
  const ridgeNoise = new Noise2D(rng.fork(3));
  const detailNoise = new Noise2D(rng.fork(4));
  const beltNoise = new Noise2D(rng.fork(5));

  // --- Tectonic plates -------------------------------------------------
  const area = W * H;
  const plateCount = rng.int(16, 22);
  const minDist = Math.sqrt(area / plateCount) * 0.55;
  const plates: Plate[] = [];
  let guard = 0;
  while (plates.length < plateCount && guard++ < 5000) {
    const x = rng.range(-0.05 * W, 1.05 * W);
    const z = rng.range(-0.05 * H, 1.05 * H);
    if (plates.some((p) => Math.hypot(p.x - x, p.z - z) < minDist)) continue;
    const a = rng.range(0, Math.PI * 2);
    const speed = rng.range(0.4, 1.0);
    plates.push({
      id: plates.length,
      x, z,
      continental: false,
      base: 0,
      vx: Math.cos(a) * speed,
      vz: Math.sin(a) * speed,
      roughness: rng.range(0.6, 1.4),
    });
  }
  // Continental plates: pick several well separated cratons (farthest point
  // sampling, avoiding map edges) and grow each into a continent of 1-3 plates.
  const interior = plates.filter((p) => {
    const e = Math.min(p.x / W, 1 - p.x / W, p.z / H, 1 - p.z / H);
    return e > 0.12;
  });
  const nCont = Math.max(5, Math.round(plates.length * (landFraction + 0.1)));
  const cratonCount = Math.min(interior.length, rng.int(4, 6));
  const chosen: Plate[] = [];
  if (interior.length > 0) chosen.push(rng.pick(interior));
  while (chosen.length < cratonCount) {
    let best: Plate | null = null;
    let bestD = -1;
    for (const p of interior) {
      if (chosen.includes(p)) continue;
      let d = Infinity;
      for (const c of chosen) d = Math.min(d, Math.hypot(p.x - c.x, p.z - c.z));
      d *= rng.range(0.8, 1.2);
      if (d > bestD) { bestD = d; best = p; }
    }
    if (!best) break;
    chosen.push(best);
  }
  for (const c of chosen) c.continental = true;
  let contCount = chosen.length;
  guard = 0;
  while (contCount < nCont && guard++ < 400) {
    const src = rng.pick(chosen);
    let best: Plate | null = null;
    let bestD = Infinity;
    for (const p of plates) {
      if (p.continental) continue;
      const e = Math.min(p.x / W, 1 - p.x / W, p.z / H, 1 - p.z / H);
      if (e < 0.03) continue;
      const d = Math.hypot(p.x - src.x, p.z - src.z) * rng.range(0.7, 1.3);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (!best || bestD > minDist * 2.6) continue;
    best.continental = true;
    contCount++;
  }
  for (const p of plates) {
    p.base = p.continental ? rng.range(0.2, 0.32) : rng.range(-0.55, -0.4);
  }

  // Hotspots: volcanic island chains in the ocean.
  const hotspots: { x: number; z: number; r: number; a: number }[] = [];
  const nHot = rng.int(5, 9);
  for (let i = 0; i < nHot; i++) {
    const hx = rng.range(0.1, 0.9) * W;
    const hz = rng.range(0.1, 0.9) * H;
    const dir = rng.range(0, Math.PI * 2);
    const n = rng.int(3, 7);
    for (let k = 0; k < n; k++) {
      hotspots.push({
        x: hx + Math.cos(dir) * k * rng.range(4, 7),
        z: hz + Math.sin(dir) * k * rng.range(4, 7),
        r: rng.range(1.6, 3.5) * (1 - k / (n + 2)),
        a: rng.range(0.35, 0.75) * (1 - k / (n + 1)),
      });
    }
  }

  const out = new Float32Array(w * h);
  const warpAmp = 34;
  const warpF = 1 / 110;
  const contF = 1 / 170;
  const blendW = 26;

  for (let j = 0; j < h; j++) {
    if ((j & 31) === 0) progress('Forming tectonic plates', j / h);
    const z = j * spacing;
    for (let i = 0; i < w; i++) {
      const x = i * spacing;
      // Domain warp gives wiggly plate boundaries & coastlines.
      const wx = x + warpAmp * warpNoise.fbm(x * warpF, z * warpF, 4);
      const wz = z + warpAmp * warpNoise.fbm(x * warpF + 71.3, z * warpF - 33.1, 4);

      // Two nearest plates.
      let d1 = Infinity, d2 = Infinity;
      let a: Plate = plates[0], b: Plate = plates[0];
      for (let p = 0; p < plates.length; p++) {
        const pl = plates[p];
        const dx = wx - pl.x, dz = wz - pl.z;
        const d = dx * dx + dz * dz;
        if (d < d1) { d2 = d1; b = a; d1 = d; a = pl; }
        else if (d < d2) { d2 = d; b = pl; }
      }
      const sep = Math.hypot(b.x - a.x, b.z - a.z);
      const bd = (d2 - d1) / (2 * sep); // distance to Voronoi boundary

      let e = a.base;
      if (bd < blendW) {
        const t = smoothstep(0, blendW, bd);
        e = (a.base + b.base) * 0.5 * (1 - t) + a.base * t;
      }

      // Large-scale continental variation and mid-scale relief.
      e += 0.24 * noise.fbm(x * contF, z * contF, 5);
      e += 0.07 * detailNoise.fbm(x / 38, z / 38, 5);

      // Boundary interaction.
      const nx = (b.x - a.x) / sep, nz = (b.z - a.z) / sep;
      const conv = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      const shear = Math.abs((a.vx - b.vx) * nz - (a.vz - b.vz) * nx);
      const rough = a.roughness;
      if (conv > 0) {
        if (a.continental && b.continental) {
          const ridge = ridgeNoise.ridged(x / 26, z / 26, 6);
          const falloff = Math.exp(-bd / (15 * rough));
          e += conv * falloff * (0.35 + 0.95 * ridge);
          e += conv * 0.22 * Math.exp(-bd / 34); // plateau
        } else if (a.continental && !b.continental) {
          const ridge = ridgeNoise.ridged(x / 22, z / 22, 6);
          const g = Math.exp(-((bd - 7) * (bd - 7)) / (2 * 8 * 8));
          e += conv * g * (0.25 + 0.95 * ridge);
        } else if (!a.continental && b.continental) {
          e -= conv * 0.3 * Math.exp(-bd / 5);
        } else {
          if (a.id < b.id) {
            const ridge = ridgeNoise.ridged(x / 14, z / 14, 5);
            const g = Math.exp(-((bd - 5) * (bd - 5)) / 22);
            e += conv * g * (0.05 + 0.75 * ridge * ridge);
          } else {
            e -= conv * 0.25 * Math.exp(-bd / 4);
          }
        }
      } else {
        const d = -conv;
        if (a.continental && b.continental) {
          e -= d * 0.2 * Math.exp(-bd / 5);
          e += d * 0.1 * Math.exp(-((bd - 9) * (bd - 9)) / 30);
        } else if (!a.continental && !b.continental) {
          e += d * 0.16 * Math.exp(-bd / 7);
        }
      }
      e += shear * 0.05 * Math.exp(-bd / 6) * ridgeNoise.noise(x / 9, z / 9);

      // Ancient eroded ranges inside continents.
      const oldMask = smoothstep(0.15, 0.55, noise.noise(x / 230 + 50, z / 230 - 20));
      if (oldMask > 0) e += 0.16 * oldMask * ridgeNoise.ridged(x / 40 + 13, z / 40 + 7, 5);
      // Long orogenic belts (fold mountains) crossing the continents.
      const belt = beltNoise.ridged(x / 150 + 7, z / 150 - 3, 2);
      const beltMask = smoothstep(0.8, 0.97, belt) * smoothstep(-0.25, 0.12, e);
      if (beltMask > 0) {
        const amp = 0.3 + 0.35 * (beltNoise.noise(x / 300 - 11, z / 300 + 5) * 0.5 + 0.5);
        e += beltMask * amp * (0.25 + 0.9 * ridgeNoise.ridged(x / 18 + 3, z / 18 - 9, 6));
      }

      // Hotspot volcanoes.
      for (let k = 0; k < hotspots.length; k++) {
        const hs = hotspots[k];
        const dx = x - hs.x, dz = z - hs.z;
        const dd = dx * dx + dz * dz;
        if (dd < hs.r * hs.r * 9) e += hs.a * Math.exp(-dd / (hs.r * hs.r)) * 1.3;
      }

      // Oceans at the map edges.
      const edge = Math.min(x, W - x, z * 1.4, (H - z) * 1.4);
      if (edge < 45) {
        const t = 1 - edge / 45;
        e -= t * t * 0.95;
      }
      out[j * w + i] = e;
    }
  }

  // Shift so the desired fraction of the map is land.
  const sample: number[] = [];
  for (let k = 0; k < out.length; k += 7) sample.push(out[k]);
  sample.sort((p, q) => p - q);
  const sea = sample[Math.floor(sample.length * (1 - landFraction))];
  let maxLand = 0;
  for (let k = 0; k < out.length; k++) {
    out[k] -= sea;
    if (out[k] > maxLand) maxLand = out[k];
  }
  // Reshape land so lowlands dominate and peaks are rare.
  const landSorted = sample.filter((v) => v > sea).map((v) => v - sea);
  const p995 = landSorted[Math.floor(landSorted.length * 0.997)] || maxLand;
  for (let k = 0; k < out.length; k++) {
    const v = out[k];
    if (v > 0) {
      const n = v / p995;
      out[k] = 0.004 + 0.96 * Math.pow(clamp(n, 0, 1.3), 1.55);
    } else {
      out[k] = v * 1.2;
    }
  }
  // Relief-scaled high frequency detail: sharp ridges in mountains, gentle
  // undulation in lowlands. Gives erosion something to channel.
  for (let j = 0; j < h; j++) {
    const z = j * spacing;
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const v = out[k];
      if (v <= 0) continue;
      const x = i * spacing;
      const relief = Math.pow(v, 0.75);
      const r = ridgeNoise.ridged(x / 6.5 + 91, z / 6.5 - 17, 4);
      const n = detailNoise.fbm(x / 3.2, z / 3.2, 3);
      out[k] = v + relief * (0.16 * (r - 0.45) + 0.04 * n) + 0.006 * n;
      if (out[k] < 0.001) out[k] = 0.001;
    }
  }
  return out;
}

/**
 * Particle-based hydraulic erosion. Carves valleys and deposits sediment,
 * creating realistic drainage patterns and river deltas.
 */
export function hydraulicErosion(
  hmap: Float32Array,
  w: number,
  h: number,
  rng: RNG,
  droplets: number,
  progress: Progress,
): void {
  const inertia = 0.06;
  const capacityFactor = 5;
  const minCapacity = 0.0008;
  const depositSpeed = 0.28;
  const erodeSpeed = 0.35;
  const evaporate = 0.018;
  const gravity = 6;
  const maxLife = 55;
  const radius = 2;
  // Precompute brush.
  const bOffX: number[] = [];
  const bOffY: number[] = [];
  const bW: number[] = [];
  let wsum = 0;
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d <= radius) {
        const wt = 1 - d / (radius + 0.5);
        bOffX.push(x); bOffY.push(y); bW.push(wt); wsum += wt;
      }
    }
  }
  for (let k = 0; k < bW.length; k++) bW[k] /= wsum;
  const nb = bW.length;

  const grad = { h: 0, gx: 0, gy: 0 };
  const sampleGrad = (px: number, py: number) => {
    const cx = px | 0, cy = py | 0;
    const fx = px - cx, fy = py - cy;
    const i = cy * w + cx;
    const hNW = hmap[i], hNE = hmap[i + 1], hSW = hmap[i + w], hSE = hmap[i + w + 1];
    grad.gx = (hNE - hNW) * (1 - fy) + (hSE - hSW) * fy;
    grad.gy = (hSW - hNW) * (1 - fx) + (hSE - hNE) * fx;
    grad.h = hNW * (1 - fx) * (1 - fy) + hNE * fx * (1 - fy) + hSW * (1 - fx) * fy + hSE * fx * fy;
  };

  const report = Math.max(1, Math.floor(droplets / 50));
  for (let n = 0; n < droplets; n++) {
    if (n % report === 0) progress('Eroding terrain', n / droplets);
    let px = 0, py = 0;
    let tries = 0;
    do {
      px = rng.range(2, w - 3);
      py = rng.range(2, h - 3);
      tries++;
    } while (hmap[(py | 0) * w + (px | 0)] <= 0.002 && tries < 6);
    if (tries >= 6) continue;
    let dx = 0, dy = 0, speed = 1, water = 1, sediment = 0;
    for (let life = 0; life < maxLife; life++) {
      const nodeX = px | 0, nodeY = py | 0;
      const idx = nodeY * w + nodeX;
      const ox = px - nodeX, oy = py - nodeY;
      sampleGrad(px, py);
      const hOld = grad.h;
      dx = dx * inertia - grad.gx * (1 - inertia);
      dy = dy * inertia - grad.gy * (1 - inertia);
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1e-10) break;
      dx /= len; dy /= len;
      px += dx; py += dy;
      if (px < 1 || py < 1 || px >= w - 2 || py >= h - 2) break;
      sampleGrad(px, py);
      const dh = grad.h - hOld;
      if (grad.h < -0.004) {
        // Reached the sea: dump sediment (delta formation).
        const amt = sediment * 0.8;
        hmap[idx] += amt * (1 - ox) * (1 - oy);
        hmap[idx + 1] += amt * ox * (1 - oy);
        hmap[idx + w] += amt * (1 - ox) * oy;
        hmap[idx + w + 1] += amt * ox * oy;
        break;
      }
      const capacity = Math.max(-dh * speed * water * capacityFactor, minCapacity);
      if (sediment > capacity || dh > 0) {
        const amt = dh > 0 ? Math.min(dh, sediment) : (sediment - capacity) * depositSpeed;
        sediment -= amt;
        hmap[idx] += amt * (1 - ox) * (1 - oy);
        hmap[idx + 1] += amt * ox * (1 - oy);
        hmap[idx + w] += amt * (1 - ox) * oy;
        hmap[idx + w + 1] += amt * ox * oy;
      } else {
        const amt = Math.min((capacity - sediment) * erodeSpeed, -dh);
        for (let k = 0; k < nb; k++) {
          const bx = nodeX + bOffX[k], by = nodeY + bOffY[k];
          if (bx < 0 || by < 0 || bx >= w || by >= h) continue;
          const bi = by * w + bx;
          const e = amt * bW[k];
          hmap[bi] -= e;
          sediment += e;
        }
      }
      speed = Math.sqrt(Math.max(0, speed * speed - dh * gravity));
      water *= 1 - evaporate;
    }
  }
}

/** Thermal erosion: material slides down slopes steeper than the talus angle. */
export function thermalErosion(hmap: Float32Array, w: number, h: number, iterations: number, talus: number): void {
  const delta = new Float32Array(w * h);
  for (let it = 0; it < iterations; it++) {
    delta.fill(0);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const hi = hmap[i];
        if (hi <= 0) continue;
        let maxD = 0, total = 0;
        const n0 = hi - hmap[i - 1], n1 = hi - hmap[i + 1], n2 = hi - hmap[i - w], n3 = hi - hmap[i + w];
        if (n0 > talus) { total += n0; if (n0 > maxD) maxD = n0; }
        if (n1 > talus) { total += n1; if (n1 > maxD) maxD = n1; }
        if (n2 > talus) { total += n2; if (n2 > maxD) maxD = n2; }
        if (n3 > talus) { total += n3; if (n3 > maxD) maxD = n3; }
        if (total <= 0) continue;
        const move = 0.35 * (maxD - talus);
        delta[i] -= move;
        if (n0 > talus) delta[i - 1] += (move * n0) / total;
        if (n1 > talus) delta[i + 1] += (move * n1) / total;
        if (n2 > talus) delta[i - w] += (move * n2) / total;
        if (n3 > talus) delta[i + w] += (move * n3) / total;
      }
    }
    for (let i = 0; i < hmap.length; i++) hmap[i] += delta[i];
  }
}

/** Chamfer distance transform (in cells) from cells where mask=1. */
export function distanceField(mask: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : INF;
  const a = 1, b = Math.SQRT2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + a);
      if (y > 0) {
        v = Math.min(v, d[i - w] + a);
        if (x > 0) v = Math.min(v, d[i - w - 1] + b);
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + b);
      }
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + a);
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + a);
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + b);
        if (x > 0) v = Math.min(v, d[i + w - 1] + b);
      }
      d[i] = v;
    }
  }
  return d;
}

/** Separable box blur approximating a gaussian (3 passes). */
export function blur(src: Float32Array, w: number, h: number, rx: number, ry: number): Float32Array {
  let a = src.slice();
  let b = new Float32Array(w * h);
  for (let pass = 0; pass < 3; pass++) {
    if (rx > 0) {
      for (let y = 0; y < h; y++) {
        const row = y * w;
        let acc = 0;
        for (let x = -rx; x <= rx; x++) acc += a[row + clamp(x, 0, w - 1)];
        for (let x = 0; x < w; x++) {
          b[row + x] = acc / (2 * rx + 1);
          acc += a[row + Math.min(w - 1, x + rx + 1)] - a[row + Math.max(0, x - rx)];
        }
      }
      [a, b] = [b, a];
    }
    if (ry > 0) {
      for (let x = 0; x < w; x++) {
        let acc = 0;
        for (let y = -ry; y <= ry; y++) acc += a[clamp(y, 0, h - 1) * w + x];
        for (let y = 0; y < h; y++) {
          b[y * w + x] = acc / (2 * ry + 1);
          acc += a[Math.min(h - 1, y + ry + 1) * w + x] - a[Math.max(0, y - ry) * w + x];
        }
      }
      [a, b] = [b, a];
    }
  }
  return a;
}
