/**
 * Screenshots of the REAL app (built dist served by `vite preview`):
 *   npx vite build && npx vite preview --port 5176 --strictPort &
 *   npx tsx scripts/render-app-shots.ts [nation-search] [--port 5176] [--out dir]
 * Clicks New Game, picks a nation, then captures several zoom levels around
 * the capital via the renderer's public API (window.__sc.session.renderer).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let nation = 'Germany';
  let port = 5176;
  let out = '/tmp/claude-0/render/app';
  let profile = '/tmp/claude-0/render/profile-app';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port') port = Number(args[++i]);
    else if (args[i] === '--out') out = args[++i];
    else if (args[i] === '--profile') profile = args[++i];
    else nation = args[i];
  }
  mkdirSync(out, { recursive: true });
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    viewport: { width: 1280, height: 720 },
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300)); });
  const t0 = Date.now();
  await page.goto(`http://localhost:${port}/`);
  await page.locator('.sc-menu-btn', { hasText: 'New Game' }).first().click({ timeout: 60000 });
  await page.waitForSelector('.sc-ns-list input', { timeout: 600000 });
  console.log('nation select after', Date.now() - t0, 'ms');
  await page.fill('.sc-ns-list input', nation);
  await page.waitForTimeout(500);
  await page.locator('.sc-ns-list tr').filter({ hasText: nation }).first().dispatchEvent('click');
  await page.waitForTimeout(800);
  await page.locator('button', { hasText: 'Lead this Nation' }).dispatchEvent('click');
  await page.waitForTimeout(8000);
  console.log('in game after', Date.now() - t0, 'ms');
  await page.screenshot({ path: `${out}/start.png`, timeout: 180000 });
  const zooms: [string, number, number][] = [['z60', 60, 0], ['z28', 28, 0], ['z12', 12, 0], ['z5', 5, 0], ['z2', 2, 0.3], ['z08', 0.8, 0.3]];
  for (const [name, d, dz] of zooms) {
    await page.evaluate(`(() => { const r = window.__sc.session.renderer; const g = window.__sc.session.game; const n = g.state.nations[g.state.playerNation]; const c = g.state.cities[n.capitalCity]; r.focusOn(c.x, c.z + ${dz}, ${d}); })()`);
    await page.waitForTimeout(d < 3 ? 12000 : 7000);
    await page.screenshot({ path: `${out}/${name}.png`, timeout: 180000 });
    console.log('shot', name, Date.now() - t0, 'ms');
  }
  await ctx.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
