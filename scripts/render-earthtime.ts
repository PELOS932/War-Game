import { generateEarth } from '../src/worldgen/earth/index';
const t0 = Date.now();
let last = '';
const w = generateEarth((s) => { if (s !== last) { last = s; console.log(Date.now() - t0, s); } });
console.log('total', Date.now() - t0, 'hw', w.hw, w.hh, 'cities', w.cities.length, 'rivers', w.rivers.length, 'lakes', w.lakes.length, 'roads', w.roads.length, 'rails', w.rails.length);
const big = [...w.cities].sort((a, b) => b.population - a.population).slice(0, 8).map((c) => `${c.name}:${c.population}@${c.x.toFixed(1)},${c.z.toFixed(1)}`);
console.log(big.join(' '));
let mx = 0; for (const e of w.elevation) mx = Math.max(mx, e); console.log('max elev', mx);
