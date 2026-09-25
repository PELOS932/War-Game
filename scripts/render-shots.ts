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

const PRESETS: Record<string, Shot> = {
  world: { name: 'world', expr: `(() => { const w = __render.renderer.ctx; return [w.worldW/2, w.worldH/2, 1e5, 0, __render.dayHour(w.worldW/2, 12)]; })()` },
  continent: { name: 'continent', expr: `(() => { const c = __render.bigCities(1)[0]; return [c.x, c.z, 90, 0, __render.dayHour(c.x)]; })()` },
  region: { name: 'region', expr: `(() => { const c = __render.bigCities(1)[0]; return [c.x, c.z, 22, 0, __render.dayHour(c.x)]; })()` },
  mountains: { name: 'mountains', expr: `(() => { const w = __render.world; let best = 0, bi = 0; for (let i = 0; i < w.elevation.length; i += 7) if (w.elevation[i] > best) { best = w.elevation[i]; bi = i; } return [(bi % w.hw) * 0.5, Math.floor(bi / w.hw) * 0.5 + 1.5, 6, 0.3, __render.dayHour((bi % w.hw) * 0.5)]; })()` },
  mountainsClose: { name: 'mountainsClose', expr: `(() => { const w = __render.world; let best = 0, bi = 0; for (let i = 0; i < w.elevation.length; i += 7) if (w.elevation[i] > best) { best = w.elevation[i]; bi = i; } return [(bi % w.hw) * 0.5, Math.floor(bi / w.hw) * 0.5 + 0.8, 1.6, 0.5, __render.dayHour((bi % w.hw) * 0.5)]; })()` },
  city: { name: 'city', expr: `(() => { const c = __render.bigCities(1)[0]; return [c.x, c.z + 0.1, 0.6, 0.4, __render.dayHour(c.x)]; })()` },
  cityClose: { name: 'cityClose', expr: `(() => { const c = __render.bigCities(1)[0]; return [c.x, c.z, 0.2, 0.7, __render.dayHour(c.x)]; })()` },
  cityMid: { name: 'cityMid', expr: `(() => { const c = __render.bigCities(4)[3]; return [c.x, c.z, 2.2, 0.2, __render.dayHour(c.x)]; })()` },
  terminator: { name: 'terminator', expr: `(() => { const w = __render.renderer.ctx; return [w.worldW/2, w.worldH/2, 1e5, 0, 151*24 + 18]; })()` },
  night: { name: 'night', expr: `(() => { const c = __render.bigCities(1)[0]; return [c.x, c.z, 60, 0, 151*24 + 23 - Math.round((c.x / __render.renderer.ctx.worldW * 360 - 180) / 15)]; })()` },
  units: { name: 'units', expr: `(() => { const g = __render.game; const u = [...g.state.units.values()].find(u => u.design === 'cat2'); return [u.x, u.z, 3, 0.2, __render.dayHour(u.x)]; })()` },
  unitsClose: { name: 'unitsClose', expr: `(() => { const g = __render.game; const u = [...g.state.units.values()].find(u => u.design === 'cat2'); return [u.x, u.z, 0.5, 0.4, __render.dayHour(u.x)]; })()` },
  front: { name: 'front', before: `(() => { const g = __render.game; const f = g.fronts?.[0]; })()`, expr: `(() => { const g = __render.game; const us = [...g.state.units.values()].filter(u => g.motion.get(u.id)?.mode === 'static'); const u = us[0]; __render.burst(u.x, u.z, 8); return [u.x, u.z, 2.5, 0.3, __render.dayHour(u.x)]; })()`, wait: 1500 },
  forest: { name: 'forest', expr: `(() => { const w = __render.world; let bi = 0; for (let i = 0; i < w.albedo.length / 4; i += 13) { if (w.albedo[i*4+3] > 230 && w.elevation[i] > 200) { bi = i; break; } } return [(bi % w.hw) * 0.5, Math.floor(bi / w.hw) * 0.5, 0.35, 0.3, __render.dayHour((bi % w.hw) * 0.5)]; })()` },
  coast: { name: 'coast', expr: `(() => { const c = __render.world.cities.filter(c => c.port).sort((a,b)=>b.population-a.population)[0]; return [c.x, c.z, 1.2, 0.2, __render.dayHour(c.x)]; })()` },
};

const FRAMES = (k: number) => `new Promise((resolve) => { let n = 0; const f = () => { if (++n >= ${k}) resolve(); else requestAnimationFrame(f); }; requestAnimationFrame(f); })`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let params = 'world=procedural&seed=12345';
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

  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width, height } });
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
    const stats = await page.evaluate('JSON.stringify(window.__render.stats())');
    await page.screenshot({ path: `${out}/${s.name}.png` });
    console.log(`${s.name}: ${JSON.stringify(res)} ${Date.now() - t1}ms ${stats}`);
  }
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
