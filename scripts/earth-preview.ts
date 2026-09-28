/**
 * Builds the real Earth and writes preview PNGs + statistics.
 *   npx tsx scripts/earth-preview.ts [outDir] [crop,crop,...]
 * Crops: world (default), europe, asia, namerica, samerica, africa, oceania, seasia
 */
import { mkdirSync } from 'node:fs';
import { generateEarth } from '../src/worldgen/earth/index';
import { HexGrid } from '../src/core/hex';
import { writePNG } from './png';
import { BIOME_NAMES, Biome, DEPOSIT_NAMES, Deposit, TERRAIN_NAMES, Terrain } from '../src/worldgen/types';
import { EarthGrid } from '../src/worldgen/earth/grid';

const out = process.argv[2] ?? '/tmp/claude-0/earth';
const crops = (process.argv[3] ?? 'world').split(',');
mkdirSync(out, { recursive: true });

const t0 = Date.now();
let last = '';
let tl = Date.now();
const timings: [string, number][] = [];
const world = generateEarth((s) => {
  if (s !== last) {
    if (last) timings.push([last, Date.now() - tl]);
    last = s; tl = Date.now();
  }
});
timings.push([last, Date.now() - tl]);
const total = Date.now() - t0;
for (const [s, ms] of timings) if (ms > 40) console.log(`  ${s.padEnd(34)} ${ms} ms`);
console.log(`TOTAL ${total} ms`);

const { hw: w, hh: h } = world;
const g = new EarthGrid(world.settings);

// ---- Natural colour with hillshade ----------------------------------------------
const rgb = new Uint8Array(w * h * 3);
for (let j = 0; j < h; j++) {
  for (let i = 0; i < w; i++) {
    const k = j * w + i;
    const e = world.elevation[k];
    const lake = world.waterLevel[k] > -1e8;
    let r: number, gg: number, b: number;
    if (e <= 0 || lake) {
      const d = lake ? 0.25 : Math.min(1, Math.pow(-e / 5000, 0.6));
      r = 30 + 40 * (1 - d); gg = 60 + 80 * (1 - d); b = 110 + 70 * (1 - d);
      if (lake) { r = 50; gg = 95; b = 140; }
    } else {
      r = world.albedo[k * 4]; gg = world.albedo[k * 4 + 1]; b = world.albedo[k * 4 + 2];
      const xl = Math.max(0, i - 1), xr = Math.min(w - 1, i + 1), yu = Math.max(0, j - 1), yd = Math.min(h - 1, j + 1);
      const ex = Math.max(0, world.elevation[j * w + xr]) - Math.max(0, world.elevation[j * w + xl]);
      const ey = Math.max(0, world.elevation[yd * w + i]) - Math.max(0, world.elevation[yu * w + i]);
      const sx = (ex / (2 * g.kmEW[j] * 1000)) * 30, sy = (ey / (2 * g.kmNS * 1000)) * 30;
      const L = [-0.6, -0.6, 0.53];
      const sh = (-sx * L[0] - sy * L[1] + L[2]) / Math.hypot(sx, sy, 1) / Math.hypot(...L);
      const kf = 0.45 + 0.75 * Math.max(0, sh);
      r *= kf; gg *= kf; b *= kf;
      if (world.climateTex[k * 4 + 3] === 255) { r = 45; gg = 85; b = 150; }
    }
    rgb[k * 3] = Math.min(255, r); rgb[k * 3 + 1] = Math.min(255, gg); rgb[k * 3 + 2] = Math.min(255, b);
  }
}

// ---- Political map (per heightmap pixel, hex owner) ---------------------------------
const grid = new HexGrid(world.settings.cols, world.settings.rows);
const pol = new Uint8Array(w * h * 3);
for (let j = 0; j < h; j++) {
  for (let i = 0; i < w; i++) {
    const k = j * w + i;
    const hx = grid.fromWorld(i * 0.5, j * 0.5);
    let c: [number, number, number] = [18, 34, 70];
    if (hx >= 0) {
      const own = world.hexOwner[hx];
      if (own) {
        const col = world.nations[own - 1].color;
        const t = world.hexTerrain[hx];
        const f = t === Terrain.Urban ? 0.45 : 1;
        c = [col[0] * f, col[1] * f, col[2] * f];
        if (world.hexDeposit[hx] && (i + j) % 4 === 0) {
          const d = world.hexDeposit[hx];
          c = d === Deposit.Oil ? [0, 0, 0] : d === Deposit.Coal ? [90, 60, 40] : d === Deposit.Ore ? [200, 60, 200] : d === Deposit.Uranium ? [60, 255, 60] : [0, 200, 255];
        }
      } else if (world.hexTerrain[hx] === Terrain.Lake) c = [50, 95, 140];
      else if (world.hexDeposit[hx] === Deposit.Gas && (i + j) % 4 === 0) c = [0, 200, 255];
    }
    pol[k * 3] = c[0]; pol[k * 3 + 1] = c[1]; pol[k * 3 + 2] = c[2];
  }
}
// Claims overlay: hatched red.
for (const cl of world.claims) for (const hx of cl) {
  const cx = grid.cx[hx] / 0.5, cz = grid.cz[hx] / 0.5;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const k = (Math.round(cz) + dz) * w + Math.round(cx) + dx;
    if (k >= 0 && k < w * h && (dx + dz) % 2 === 0) { pol[k * 3] = 230; pol[k * 3 + 1] = 30; pol[k * 3 + 2] = 30; }
  }
}

const CROPS: Record<string, [number, number, number, number, number]> = {
  world: [-180, 84, 180, -57, 1],
  europe: [-12, 64, 42, 34, 2],
  asia: [40, 60, 150, 5, 1],
  namerica: [-170, 72, -50, 7, 1],
  samerica: [-85, 13, -33, -56, 1],
  africa: [-19, 38, 53, -36, 1],
  oceania: [110, 0, 180, -48, 1],
  seasia: [90, 30, 130, -11, 2],
  mideast: [25, 45, 75, 10, 2],
};
function crop(src: Uint8Array, name: string, spec: [number, number, number, number, number]): void {
  const [lon0, lat0, lon1, lat1, sc] = spec;
  const i0 = Math.max(0, Math.round(g.colF(lon0))), i1 = Math.min(w, Math.round(g.colF(lon1)));
  const j0 = Math.max(0, Math.round(g.rowF(lat0))), j1 = Math.min(h, Math.round(g.rowF(lat1)));
  const cw = (i1 - i0) * sc, ch = (j1 - j0) * sc;
  const o = new Uint8Array(cw * ch * 3);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const s = ((j0 + Math.floor(y / sc)) * w + i0 + Math.floor(x / sc)) * 3;
    const d = (y * cw + x) * 3;
    o[d] = src[s]; o[d + 1] = src[s + 1]; o[d + 2] = src[s + 2];
  }
  writePNG(`${out}/${name}.png`, cw, ch, o);
}
for (const c of crops) {
  if (!CROPS[c]) continue;
  crop(rgb, `sat-${c}`, CROPS[c]);
  crop(pol, `pol-${c}`, CROPS[c]);
}

// ---- Statistics -----------------------------------------------------------------------
const terr: Record<string, number> = {};
for (const t of world.hexTerrain) terr[TERRAIN_NAMES[t as Terrain]] = (terr[TERRAIN_NAMES[t as Terrain]] ?? 0) + 1;
console.log('terrain', terr);
const bio: Record<string, number> = {};
for (let k = 0; k < world.biome.length; k++) if (world.elevation[k] > 0) bio[BIOME_NAMES[world.biome[k] as Biome]] = (bio[BIOME_NAMES[world.biome[k] as Biome]] ?? 0) + 1;
console.log('biomes', bio);
const dep: Record<string, number> = {};
for (const d of world.hexDeposit) if (d) dep[DEPOSIT_NAMES[d as Deposit]] = (dep[DEPOSIT_NAMES[d as Deposit]] ?? 0) + 1;
console.log('deposits', dep);
console.log(`nations ${world.nations.length} cities ${world.cities.length} rivers ${world.rivers.length} lakes ${world.lakes.length} roads ${world.roads.length} rails ${world.rails.length}`);
let pop = 0; for (const p of world.hexPopulation) pop += p;
console.log('world pop (M)', (pop / 1000).toFixed(0), 'claims', world.claims.reduce((a, c) => a + c.length, 0));
const probe: [string, number, number][] = [
  ['London', -0.1, 51.5], ['Moscow', 37.6, 55.75], ['Cairo', 31.2, 30.0], ['Riyadh', 46.7, 24.7], ['Delhi', 77.2, 28.6],
  ['Mumbai', 72.9, 19.1], ['Cherrapunji', 91.7, 25.3], ['Beijing', 116.4, 39.9], ['Shanghai', 121.4, 31.2], ['Yakutsk', 129.7, 62.0],
  ['Kinshasa', 15.3, -4.3], ['Nairobi', 36.8, -1.3], ['Timbuktu', -3.0, 16.8], ['Lagos', 3.4, 6.5], ['Johannesburg', 28.0, -26.2],
  ['New York', -74.0, 40.7], ['Chicago', -87.6, 41.9], ['Denver', -105.0, 39.7], ['Kansas City', -94.6, 39.1], ['Phoenix', -112.1, 33.4],
  ['Seattle', -122.3, 47.6], ['Winnipeg', -97.1, 49.9], ['Manaus', -60.0, -3.1], ['Lima', -77.0, -12.0], ['Buenos Aires', -58.4, -34.6],
  ['Alice Springs', 133.9, -23.7], ['Sydney', 151.2, -33.9], ['Singapore', 103.8, 1.35], ['Tehran', 51.4, 35.7], ['Ulaanbaatar', 106.9, 47.9],
  ['Kashgar', 76.0, 39.5], ['Novosibirsk', 82.9, 55.0], ['Madrid', -3.7, 40.4], ['Bergen', 5.3, 60.4], ['Reykjavik', -21.9, 64.1],
];
for (const [nm, lo, la] of probe) {
  const k = g.cellOf(lo, la);
  console.log(`${nm.padEnd(14)} e=${world.elevation[k].toFixed(0).padStart(5)} T=${world.temperature[k].toFixed(1).padStart(5)} P=${world.precipitation[k].toFixed(0).padStart(5)} ${BIOME_NAMES[world.biome[k] as Biome]}`);
}
