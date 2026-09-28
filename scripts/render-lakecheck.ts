import { generateEarth } from '../src/worldgen/earth/index';
const w = generateEarth(() => {});
let wl = 0; for (const v of w.waterLevel) if (v > -1e8) wl++;
let lc = 0; for (const l of w.lakes) lc += l.cells.length;
console.log('waterLevel cells', wl, 'lake cells', lc, 'lakes', w.lakes.length);
// cells below an adjacent lake's level but not lake
let below = 0, belowFar = 0;
const W = w.hw, H = w.hh;
for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
  const k = j * W + i;
  if (w.waterLevel[k] > -1e8) continue;
  let lvl = -1e9;
  for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) { const kk = (j + dj) * W + i + di; if (kk >= 0 && kk < W * H && w.waterLevel[kk] > lvl) lvl = w.waterLevel[kk]; }
  if (lvl > -1e8 && w.elevation[k] < lvl) { if (Math.max(Math.abs(0), 0) === 0) below++; }
}
console.log('non-lake cells below nearby lake level (r<=4):', below);
const mich = w.lakes.slice().sort((a, b) => b.cells.length - a.cells.length).slice(0, 5).map((l) => `${l.name ?? '?'}:${l.cells.length}@${l.level.toFixed(0)}`);
console.log(mich.join(' '));
