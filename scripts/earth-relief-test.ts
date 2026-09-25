import { EarthGrid } from '../src/worldgen/earth/grid';
import { rasterizeCountries } from '../src/worldgen/earth/raster';
import { buildElevation } from '../src/worldgen/earth/elevation';
import { RNG } from '../src/core/rng';
import { writePNG } from './png';

const drops = process.argv[2] ? Number(process.argv[2]) : undefined;
const t0 = Date.now();
const g = new EarthGrid();
const r = rasterizeCountries(g);
console.log('raster', Date.now() - t0);
let last = ''; let tl = Date.now();
const res = buildElevation(g, r, new RNG(2030), (s) => { if (s !== last) { console.log(`  ${last} ${Date.now() - tl}ms`); last = s; tl = Date.now(); } }, drops);
console.log('elevation', Date.now() - t0);
const e = res.elevation;
function hyps(v: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = v <= 0
    ? [[-11000, [5, 10, 40]], [-6000, [15, 30, 80]], [-4000, [25, 55, 120]], [-2000, [40, 90, 160]], [-200, [80, 140, 200]], [0, [140, 190, 230]]]
    : [[0, [60, 120, 70]], [200, [110, 160, 90]], [500, [190, 190, 110]], [1000, [200, 160, 90]], [2000, [160, 110, 70]], [3500, [130, 100, 90]], [5000, [220, 220, 220]], [9000, [255, 255, 255]]];
  for (let s = 1; s < stops.length; s++) {
    if (v <= stops[s][0] || s === stops.length - 1) {
      const [a, ca] = stops[s - 1], [b, cb] = stops[s];
      const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
      return [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t];
    }
  }
  return [0, 0, 0];
}
const { w, h } = g;
const rgb = new Uint8Array(w * h * 3);
for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
  const k = j * w + i;
  let [R, G, B] = hyps(e[k]);
  const xl = Math.max(0, i - 1), xr = Math.min(w - 1, i + 1), yu = Math.max(0, j - 1), yd = Math.min(h - 1, j + 1);
  const ex = Math.max(0, e[j * w + xr]) - Math.max(0, e[j * w + xl]);
  const ey = Math.max(0, e[yd * w + i]) - Math.max(0, e[yu * w + i]);
  const sx = ex / (2 * g.kmEW[j] * 1000) * 45, sy = ey / (2 * g.kmNS * 1000) * 45;
  const L = [-0.6, -0.6, 0.53];
  const nl = Math.hypot(sx, sy, 1);
  const sh = (-sx * L[0] - sy * L[1] + L[2]) / nl / Math.hypot(...L);
  const kf = e[k] > 0 ? 0.3 + 0.9 * Math.max(0, sh) : 1;
  if (process.env.GRAY && e[k] > 0) { R = G = B = 200; }
  rgb[k * 3] = Math.min(255, R * kf); rgb[k * 3 + 1] = Math.min(255, G * kf); rgb[k * 3 + 2] = Math.min(255, B * kf);
}
writePNG('/tmp/claude-0/earth/relief.png', w, h, rgb);
// crops
function crop(name: string, lon0: number, lat0: number, lon1: number, lat1: number, sc = 2) {
  const i0 = Math.round(g.colF(lon0)), i1 = Math.round(g.colF(lon1)), j0 = Math.round(g.rowF(lat0)), j1 = Math.round(g.rowF(lat1));
  const cw = (i1 - i0) * sc, ch = (j1 - j0) * sc;
  const out = new Uint8Array(cw * ch * 3);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) for (let c = 0; c < 3; c++) out[(y * cw + x) * 3 + c] = rgb[((j0 + Math.floor(y / sc)) * w + i0 + Math.floor(x / sc)) * 3 + c];
  writePNG(`/tmp/claude-0/earth/relief-${name}.png`, cw, ch, out);
}
const which = process.argv[3] ?? 'all';
if (which === 'all' || which.includes('a')) crop('asia', 60, 50, 110, 20);
if (which === 'all' || which.includes('e')) crop('europe', -12, 62, 40, 34);
if (which === 'all' || which.includes('n')) crop('namerica', -130, 55, -65, 25);
if (which === 'all' || which.includes('s')) crop('samerica', -85, 12, -34, -56, 1);
if (which === 'all' || which.includes('f')) crop('africa', -20, 38, 55, -36, 1);
const stats: number[] = []; for (let k = 0; k < g.n; k += 3) if (res.land[k]) stats.push(e[k]);
stats.sort((a, b) => a - b);
console.log('land pct', [0.1, 0.25, 0.5, 0.75, 0.9, 0.99, 0.999, 1].map(p => stats[Math.min(stats.length - 1, Math.floor(stats.length * p))].toFixed(0)).join(' '));
const pts: [string, number, number][] = [['Everest', 86.93, 27.99], ['Lhasa', 91.1, 29.65], ['Tibet center', 88, 33], ['Denver', -104.99, 39.74], ['Kansas City', -94.6, 39.1], ['Manaus', -60, -3.1], ['La Paz', -68.15, -16.5], ['Moscow', 37.6, 55.75], ['Mont Blanc', 6.86, 45.83], ['Addis', 38.74, 9.03], ['Johannesburg', 28.05, -26.2], ['Tehran', 51.4, 35.7], ['Mexico City', -99.13, 19.43], ['Kinshasa', 15.3, -4.3], ['Delhi', 77.2, 28.6], ['Ulaanbaatar', 106.9, 47.9], ['Greenland summit', -38.5, 72.6], ['Riyadh', 46.7, 24.7], ['Madrid', -3.7, 40.4], ['Aconcagua', -70.01, -32.65], ['Mariana', 142.2, 11.35], ['Mid Atlantic', -30, 38], ['North Sea', 3, 56], ['Pacific', -150, 0]];
for (const [nm, lo, la] of pts) console.log(nm.padEnd(18), e[g.cellOf(lo, la)].toFixed(0));
