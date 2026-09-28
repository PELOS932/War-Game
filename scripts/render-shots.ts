/**
 * Renderer screenshot harness (SwiftShader). Requires the dev server:
 *   npx vite --port 5174 --strictPort
 * Usage:
 *   npx tsx scripts/render-shots.ts [shots.json | preset names comma-separated] [--params "world=procedural&seed=1"] [--out dir]
 * A shot: { name, expr } where expr is JS evaluated in the page returning
 * [x, z, distance, yaw?, hour?] (window.__render helpers are available).
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';

interface Shot { name: string; expr: string; wait?: number; before?: string }

const city = (name: string, d: number, yaw = 0, dz = 0, hour?: number) => `(() => { const c = __render.cityByName('${name}'); return [c.x, c.z + ${dz}, ${d}, ${yaw}, ${hour === undefined ? '__render.dayHour(c.x)' : hour}]; })()`;
const at = (lon: number, lat: number, d: number, yaw = 0) => `(() => { const p = __render.ll(${lon}, ${lat}); return [p[0], p[1], ${d}, ${yaw}, __render.dayHour(p[0])]; })()`;
const PRESETS: Record<string, Shot> = {
  world: { name: 'world', expr: `(() => { const w = __render.renderer.ctx; return [w.worldW/2, w.worldH/2, 1e5, 0, __render.dayHour(w.worldW/2, 12)]; })()` },
  europe: { name: 'europe', expr: at(10, 49, 90) },
  usa28: { name: 'usa28', expr: city('Washington', 28) },
  usa8: { name: 'usa8', expr: city('Washington', 8, 0.2) },
  nyc3: { name: 'nyc3', expr: city('New York', 3, 0.3) },
  nyc1: { name: 'nyc1', expr: city('New York', 1, 0.4) },
  nyc04: { name: 'nyc04', expr: city('New York', 0.4, 0.6) },
  berlinStart28: { name: 'berlinStart28', expr: city('Berlin', 28, 0, 0, 0) },
  berlinStart8: { name: 'berlinStart8', expr: city('Berlin', 8, 0.2, 0, 0) },
  berlinStart2: { name: 'berlinStart2', expr: city('Berlin', 2, 0.3, 0.3, 0) },
  berlinDay2: { name: 'berlinDay2', expr: city('Berlin', 2, 0.3, 0.3, 11) },
  germany8: { name: 'germany8', expr: at(9.5, 50.5, 8, 0.1) },
  nile12: { name: 'nile12', expr: at(31.2, 27.5, 12, 0) },
  amazonRiver: { name: 'amazonRiver', expr: at(-58, -3, 20, 0) },
  chicago28: { name: 'chicago28', expr: city('Chicago', 28) },
  chicago8: { name: 'chicago8', expr: city('Chicago', 8, 0.2) },
  tokyo8: { name: 'tokyo8', expr: city('Tokyo', 8, 0.3) },
  paris28: { name: 'paris28', expr: city('Paris', 28) },
  paris6: { name: 'paris6', expr: city('Paris', 6, 0.2) },
  tokyo2: { name: 'tokyo2', expr: city('Tokyo', 2, 0.5) },
  himalaya: { name: 'himalaya', expr: at(86.9, 27.6, 7, 0.2) },
  himalayaClose: { name: 'himalayaClose', expr: at(86.9, 27.7, 1.6, 0.4) },
  alps: { name: 'alps', expr: at(9.5, 46.3, 3, 0.3) },
  terminator: { name: 'terminator', expr: `(() => { const w = __render.renderer.ctx; return [w.worldW/2, w.worldH/2, 1e5, 0, 151*24 + 18]; })()` },
  nightEurope: { name: 'nightEurope', expr: `(() => { const p = __render.ll(10, 49); return [p[0], p[1], 60, 0, __render.dayHour(p[0], 23)]; })()` },
  units: { name: 'units', expr: `(() => { const g = __render.game; const u = [...g.state.units.values()].find(u => u.nation === g.state.playerNation && g.state.designs.get(u.design).category === 2); return [u.x, u.z, 12, 0.2, __render.dayHour(u.x)]; })()` },
  unitsClose: { name: 'unitsClose', expr: `(() => { const g = __render.game; const u = [...g.state.units.values()].find(u => u.nation === g.state.playerNation && g.state.designs.get(u.design).category === 2); return [u.x, u.z, 3, 0.3, __render.dayHour(u.x)]; })()` },
  fleet: { name: 'fleet', expr: `(() => { const g = __render.game; const u = [...g.state.units.values()].find(u => u.nation === g.state.playerNation && g.state.designs.get(u.design).category === 21); return [u.x, u.z, 4, 0.3, __render.dayHour(u.x)]; })()` },
  front: { name: 'front', expr: `(() => { const p = __render.ll(37.5, 48.5); __render.burst(p[0], p[1], 10); return [p[0], p[1], 3, 0.3, __render.dayHour(p[0])]; })()`, wait: 1200 },
  forest: { name: 'forest', expr: at(-122.2, 46.6, 0.8, 0.3) },
  forestMid: { name: 'forestMid', expr: at(-122.2, 46.6, 2.5, 0.3) },
  taiga: { name: 'taiga', expr: at(95, 60, 1.0, 0.3) },
  amazon: { name: 'amazon', expr: at(-62, -4, 1.0, 0.3) },
  savanna: { name: 'savanna', expr: at(35, -2.5, 1.0, 0.3) },
  coast: { name: 'coast', expr: at(-9.2, 38.7, 1.5, 0.2) },
};


const FRAMES = (k: number) => `new Promise((resolve) => { let n = 0; const f = () => { if (++n >= ${k}) resolve(); else requestAnimationFrame(f); }; requestAnimationFrame(f); })`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let params = 'world=earth&game=real&player=USA';
  let out = '/tmp/claude-0/render';
  let spec = 'world,continent,mountains,city';
  let width = 1280, height = 720;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--params') params = args[++i];
    else if (args[i] === '--out') out = args[++i];
    else if (args[i] === '--size') { const [w, h] = args[++i].split('x').map(Number); width = w; height = h; }
    else spec = args[i];
  }
  mkdirSync(out, { recursive: true });
  let shots: Shot[];
  if (existsSync(spec) && spec.endsWith('.json')) shots = JSON.parse(readFileSync(spec, 'utf8'));
  else shots = spec.split(',').map((s) => { const p = PRESETS[s]; if (!p) throw new Error(`unknown preset ${s}`); return p; });

  // Persistent profile so the Earth world stays cached in IndexedDB between runs.
  const browser = await chromium.launchPersistentContext('/tmp/claude-0/render/profile', {
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    viewport: { width, height },
  });
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[page ${m.type()}]`, m.text().slice(0, 400)); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  const url = `http://localhost:5174/dev/render.html?${params}`;
  console.log('open', url);
  const t0 = Date.now();
  await page.goto(url);
  await page.waitForFunction('window.__render && window.__render.ready === true', undefined, { timeout: 300000, polling: 500 });
  console.log('ready in', Date.now() - t0, 'ms', await page.evaluate('JSON.stringify(window.__render.timings)'));
  for (const s of shots) {
    const t1 = Date.now();
    if (s.before) await page.evaluate(s.before);
    const res = await page.evaluate(`(() => { const r = ${s.expr}; __render.pause(true); if (r[4] !== undefined) __render.setHour(r[4]); __render.focus(r[0], r[1], r[2], r[3] ?? 0); return r; })()`);
    // Let a few frames render (SwiftShader is slow).
    await page.evaluate(FRAMES(3));
    if (s.wait) {
      await page.evaluate('window.__render.pause(false)');
      await page.waitForTimeout(s.wait);
      await page.evaluate('window.__render.pause(true)');
    }
    await page.evaluate('window.__render.settle()');
    await page.evaluate(FRAMES(2));
    const stats = await page.evaluate('JSON.stringify(window.__render.bench(8))');
    await page.screenshot({ path: `${out}/${s.name}.png`, timeout: 180000 });
    console.log(`${s.name}: ${JSON.stringify(res)} ${Date.now() - t1}ms ${stats}`);
  }
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
