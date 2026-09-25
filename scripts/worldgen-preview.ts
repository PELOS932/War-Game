import { generateWorld, DEFAULT_SETTINGS } from '../src/worldgen/generate';
import { HexGrid } from '../src/core/hex';
import { writePNG } from './png';
import { HEIGHT_SPACING, ELEV_EXAGGERATION, KM_PER_UNIT, TERRAIN_NAMES, Terrain, DEPOSIT_NAMES, GOVERNMENT_NAMES } from '../src/worldgen/types';

const seed = Number(process.argv[2] ?? 12345);
const out = process.argv[3] ?? '/tmp/claude-0/world';
const t0 = Date.now();
let last = '';
const world = generateWorld({ seed, ...DEFAULT_SETTINGS }, (s) => { if (s !== last) { last = s; console.log(`[${Date.now() - t0}ms] ${s}`); } });
console.log('total', Date.now() - t0, 'ms');
const { hw: w, hh: h } = world;
const cellM = HEIGHT_SPACING * KM_PER_UNIT * 1000;
// Satellite view with hillshade.
const rgb = new Uint8Array(w * h * 3);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const i = y * w + x;
  const e = world.elevation[i];
  const lake = world.waterLevel[i] > -1e8;
  let r, g, b;
  if (e <= 0 || lake) {
    const d = lake ? 0.3 : Math.min(1, -e / 4000);
    r = 20 + 30 * (1 - d); g = 50 + 80 * (1 - d); b = 90 + 70 * (1 - d);
    if (world.climateTex[i * 4] < (40 - 2) * 3.2) { r = 220; g = 230; b = 240; }
  } else {
    r = world.albedo[i * 4]; g = world.albedo[i * 4 + 1]; b = world.albedo[i * 4 + 2];
    const xr = Math.min(w - 1, x + 1), xl = Math.max(0, x - 1), yd = Math.min(h - 1, y + 1), yu = Math.max(0, y - 1);
    const sx = (world.elevation[y * w + xr] - world.elevation[y * w + xl]) / (2 * cellM) * ELEV_EXAGGERATION * 2;
    const sy = (world.elevation[yd * w + x] - world.elevation[yu * w + x]) / (2 * cellM) * ELEV_EXAGGERATION * 2;
    const nl = Math.hypot(sx, sy, 1);
    const L = [-0.55, -0.55, 0.63];
    const sh = Math.max(0.15, (-sx * L[0] - sy * L[1] + L[2]) / nl / Math.hypot(...L));
    const k = 0.35 + sh * 0.85;
    r *= k; g *= k; b *= k;
    if (world.climateTex[i * 4 + 3] === 255) { r = 40; g = 80; b = 130; }
  }
  rgb[i * 3] = Math.min(255, r); rgb[i * 3 + 1] = Math.min(255, g); rgb[i * 3 + 2] = Math.min(255, b);
}
writePNG(`${out}-sat.png`, w, h, rgb);

// Political map at hex resolution (2x2 px per hex).
const grid = new HexGrid(world.settings.cols, world.settings.rows);
const pw = w, ph = h;
const pol = new Uint8Array(pw * ph * 3);
for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
  const wx = x * HEIGHT_SPACING, wz = y * HEIGHT_SPACING;
  const hx = grid.fromWorld(wx, wz);
  const o = (y * pw + x) * 3;
  if (hx < 0) continue;
  const own = world.hexOwner[hx];
  if (own) {
    const c = world.nations[own - 1].color;
    let k = 1;
    // border darkening
    const t = world.hexTerrain[hx];
    if (t === Terrain.Urban) k = 0.45;
    pol[o] = c[0] * k; pol[o + 1] = c[1] * k; pol[o + 2] = c[2] * k;
    if (world.hexRoad[hx] && ((x + y) % 3 === 0)) { pol[o] = 60; pol[o + 1] = 60; pol[o + 2] = 60; }
  } else {
    pol[o] = 20; pol[o + 1] = 40; pol[o + 2] = 80;
  }
}
writePNG(`${out}-pol.png`, pw, ph, pol);

// Stats.
const counts: Record<string, number> = {};
for (const t of world.hexTerrain) counts[TERRAIN_NAMES[t as Terrain]] = (counts[TERRAIN_NAMES[t as Terrain]] ?? 0) + 1;
console.log(counts);
const dep: Record<string, number> = {};
for (const d of world.hexDeposit) if (d) dep[DEPOSIT_NAMES[d as 1]] = (dep[DEPOSIT_NAMES[d as 1]] ?? 0) + 1;
console.log(dep);
console.log('rivers', world.rivers.length, 'lakes', world.lakes.length, 'cities', world.cities.length, 'roads', world.roads.length, 'rails', world.rails.length);
let totalPop = 0; for (const p of world.hexPopulation) totalPop += p;
console.log('world pop (M)', (totalPop / 1000).toFixed(0));
for (const nt of world.nations.slice(0, 40)) {
  const cs = world.cities.filter((c) => c.nation === nt.id);
  let pop = 0; for (let i = 0; i < world.hexOwner.length; i++) if (world.hexOwner[i] === nt.id + 1) pop += world.hexPopulation[i];
  console.log(`${nt.id} ${nt.formalName.padEnd(38)} ${GOVERNMENT_NAMES[nt.government].padEnd(24)} hexes=${nt.hexCount} pop=${(pop / 1000).toFixed(1)}M dev=${nt.development.toFixed(2)} blocs=${nt.blocs.join(",")} cap=${cs[0]?.name} (${cs[0]?.population.toFixed(0)}k) cities=${cs.length} leader=${nt.leaderName}`);
}
console.log(world.blocs);
{
  const land: number[] = [];
  for (let i = 0; i < world.elevation.length; i += 5) if (world.elevation[i] > 0) land.push(world.elevation[i]);
  land.sort((a, b) => a - b);
  const pct = [0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99, 0.999].map((p) => `${p * 100}%=${land[Math.floor(land.length * p)].toFixed(0)}m`);
  console.log('land elevation', pct.join(' '));
  const pr: number[] = [];
  for (let i = 0; i < world.elevation.length; i += 5) if (world.elevation[i] > 0) pr.push(world.precipitation[i]);
  pr.sort((a, b) => a - b);
  console.log('precip', [0.1, 0.25, 0.5, 0.75, 0.9].map((p) => `${p * 100}%=${pr[Math.floor(pr.length * p)].toFixed(0)}mm`).join(' '));
  const bc: Record<number, number> = {};
  for (let i = 0; i < world.biome.length; i++) bc[world.biome[i]] = (bc[world.biome[i]] ?? 0) + 1;
  console.log('biomes', bc);
}
