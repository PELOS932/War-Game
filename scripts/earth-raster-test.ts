import { EarthGrid } from '../src/worldgen/earth/grid';
import { rasterizeCountries } from '../src/worldgen/earth/raster';
import { writePNG } from './png';
const t0 = Date.now();
const g = new EarthGrid();
const r = rasterizeCountries(g);
console.log('raster ms', Date.now() - t0, 'w', g.w, 'h', g.h, 'features', r.features.length);
let land = 0; for (const v of r.land) land += v;
console.log('land frac', land / g.n);
const rgb = new Uint8Array(g.n * 3);
for (let k = 0; k < g.n; k++) {
  const f = r.featureOf[k];
  if (f < 0) { rgb[k*3]=20; rgb[k*3+1]=40; rgb[k*3+2]=90; continue; }
  const hsh = (f * 2654435761) >>> 0;
  rgb[k*3] = 80 + (hsh & 127); rgb[k*3+1] = 80 + ((hsh >> 8) & 127); rgb[k*3+2] = 80 + ((hsh >> 16) & 127);
}
writePNG('/tmp/claude-0/earth/raster.png', g.w, g.h, rgb);
console.log(r.features.filter(f => f.cells < 3).map(f => `${f.key}:${f.name}:${f.cells}`).join(', '));
