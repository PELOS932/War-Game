/**
 * UI test harness against the REAL renderer + simulation (dev only).
 *   npx vite --port 5175 --strictPort &      (or vite preview for the built app)
 *   npx tsx scripts/ui-real.ts [--app] [step ...]
 * --app drives index.html (main menu → New Game → nation select); otherwise the
 * dev page /dev/ui.html?screen=game&real=1 is used (skips the menu).
 * Uses a persistent profile so the Earth world cache (IndexedDB) survives runs.
 * Screenshots go to /tmp/claude-0/ui/real-*.png
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.env.UI_SHOTS_DIR ?? '/tmp/claude-0/ui';
const PORT = process.env.UI_PORT ?? '5175';
const NATION = process.env.UI_NATION ?? 'USA';
mkdirSync(OUT, { recursive: true });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Dev = {
  game: { state: { units: Map<number, { id: number; nation: number; x: number; z: number; design: string; hex: number }>; playerNation: number; speed: number; hour: number; cities: { hex: number; x: number; z: number }[]; nations: { capitalCity: number }[] }; setSpeed(s: number): void; stepHours(n: number): void };
  renderer: { worldToScreen(x: number, y: number, z: number): { x: number; y: number; visible: boolean }; focusOn(x: number, z: number, d?: number): void; focusHex(h: number, d?: number): void };
};

async function devHandle(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const w = window as unknown as { __dev?: { game?: unknown }; __sc?: { session?: { game?: unknown; renderer?: unknown } }; __h?: unknown };
    if (w.__dev?.game) { w.__h = w.__dev; return true; }
    if (w.__sc?.session?.game) { w.__h = w.__sc.session; return true; }
    return false;
  });
}

const steps: Record<string, (page: Page, shot: (n: string) => Promise<void>) => Promise<void>> = {
  async hud(page, shot) {
    await shot('hud');
  },
  async tabs(page, shot) {
    const tabs = ['overview', 'cabinet', 'military', 'build', 'research', 'diplomacy', 'trade', 'finance', 'world'];
    for (let i = 0; i < tabs.length; i++) {
      await page.keyboard.press(`F${i + 1}`);
      await wait(900);
      await shot(`tab-${i + 1}-${tabs[i]}`);
    }
    await page.keyboard.press('Escape');
  },
  async units(page, shot) {
    const pos = await page.evaluate(() => {
      const h = (window as unknown as { __h: Dev }).__h;
      const st = h.game.state;
      const mine = [...st.units.values()].filter((u) => u.nation === st.playerNation);
      const u = mine[Math.floor(mine.length / 3)];
      if (!u) return null;
      h.renderer.focusOn(u.x, u.z, 14);
      return { id: u.id, x: u.x, z: u.z };
    });
    if (!pos) { console.log('no units'); return; }
    await wait(2500);
    const sp = await page.evaluate((p) => (window as unknown as { __h: Dev }).__h.renderer.worldToScreen(p.x, 0, p.z), pos);
    await page.mouse.move(sp.x, sp.y);
    await wait(300);
    await page.mouse.click(sp.x, sp.y);
    await wait(800);
    await shot('unit-click');
    const sel = await page.evaluate(() => document.querySelector('.sc-unitpanel:not(.sc-hidden) .sc-titlebar')?.textContent ?? 'none');
    console.log('unit panel title:', sel);
    // hover somewhere for path preview then right-click to move
    await page.mouse.move(sp.x + 160, sp.y + 40, { steps: 5 });
    await wait(1000);
    await shot('unit-path');
    await page.mouse.click(sp.x + 160, sp.y + 40, { button: 'right' });
    await wait(800);
    const order = await page.evaluate((id) => {
      const u = (window as unknown as { __h: Dev }).__h.game.state.units.get(id) as unknown as { order: { type: string; targetHex: number }; path: number[] } | undefined;
      return u ? `${u.order.type} → ${u.order.targetHex} (path ${u.path.length})` : 'gone';
    }, pos.id);
    console.log('order after right-click:', order);
    await shot('unit-moved');
    // box select
    await page.mouse.move(sp.x - 250, sp.y - 180);
    await page.mouse.down();
    await page.mouse.move(sp.x + 250, sp.y + 180, { steps: 10 });
    await page.mouse.up();
    await wait(900);
    await shot('unit-box');
    const n = await page.evaluate(() => document.querySelector('.sc-unitpanel:not(.sc-hidden) .sc-titlebar')?.textContent ?? 'none');
    console.log('after box select:', n);
  },
  async hover(page, shot) {
    await page.keyboard.press('Escape');
    await page.mouse.move(700, 450);
    await wait(200);
    await page.mouse.move(705, 455);
    await wait(1500);
    await shot('hover');
    await page.mouse.click(705, 455);
    await wait(900);
    await shot('hexinfo');
  },
  async run(page, shot) {
    // let time run to exercise news, popups, proposals
    await page.evaluate(() => (window as unknown as { __h: Dev }).__h.game.setSpeed(5));
    await wait(20000);
    await shot('after-run');
    await page.keyboard.press('Escape');
    await wait(300);
  },
  async menu(page, shot) {
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await wait(300);
    await page.click('.sc-topbar .sc-tb-right .sc-btn:last-child');
    await wait(600);
    await shot('gamemenu');
    await page.keyboard.press('Escape');
  },
  async minimap(page, shot) {
    const btns = await page.$$('.sc-minimap .mm-modes .sc-btn');
    for (let i = 0; i < btns.length; i++) {
      await btns[i].click();
      await wait(1200);
      await shot(`mapmode-${i}`);
    }
    await btns[0]?.click();
  },
  async diplo(page, shot) {
    await page.keyboard.press('F6');
    await wait(600);
    await page.click('.sc-dip-list tbody tr:nth-child(2)');
    await wait(900);
    await shot('diplo-detail');
  },
  async build(page, shot) {
    await page.keyboard.press('F4');
    await wait(600);
    await page.click('.sc-design');
    await wait(600);
    await shot('build-unit');
    await page.click('.sc-subtab:nth-child(2)');
    await wait(500);
    await page.click('.sc-factile:nth-child(15)');
    await wait(500);
    await shot('build-fac');
    await page.click('.sc-cmd-body .sc-btn.primary');
    await wait(2500);
    await shot('build-place');
    await page.keyboard.press('Escape');
  },
  async research(page, shot) {
    await page.keyboard.press('F5');
    await wait(600);
    const t = await page.$('.sc-tech.avail');
    if (t) {
      await t.click();
      await wait(500);
    }
    await shot('research-detail');
  },
  async trade(page, shot) {
    await page.keyboard.press('F7');
    await wait(600);
    await page.click('.sc-trade-table tbody tr:nth-child(4)');
    await wait(600);
    await shot('trade-detail');
  },
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const app = args.includes('--app');
  const names = args.filter((a) => !a.startsWith('--'));
  const ctx = await chromium.launchPersistentContext(`${OUT}/profile`, {
    executablePath: '/opt/pw-browsers/chromium',
    viewport: { width: 1600, height: 900 },
    args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.stack ?? e)));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
  });
  const shot = async (n: string) => {
    await page.screenshot({ path: `${OUT}/real-${n}.png` });
    console.log('shot', n);
  };
  const t0 = Date.now();
  if (app) {
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForSelector('.sc-menu-btn', { timeout: 60000 });
    await wait(800);
    await shot('menu');
    await page.click('.sc-menu-btn');
    await page.waitForSelector('.sc-loading', { timeout: 20000 });
    await wait(3000);
    await shot('loading');
    await page.waitForSelector('.sc-ns-list tbody tr', { timeout: 600000 });
    console.log('nation select after', ((Date.now() - t0) / 1000).toFixed(0), 's');
    await wait(3000);
    await shot('select');
    await page.fill('.sc-ns-list input', process.env.UI_SEARCH ?? 'United States');
    await wait(300);
    await page.click('.sc-ns-list tbody tr');
    await wait(3000);
    await shot('select-nation');
    await page.click('.sc-ns-lead .sc-btn');
  } else {
    await page.goto(`http://localhost:${PORT}/dev/ui.html?screen=game&real=1&nation=${NATION}&dist=28`);
  }
  await page.waitForSelector('.sc-topbar', { timeout: 600000 });
  console.log('game after', ((Date.now() - t0) / 1000).toFixed(0), 's');
  for (let i = 0; i < 50 && !(await devHandle(page)); i++) await wait(200);
  await wait(4000);
  for (const n of names.length ? names : ['hud']) {
    try {
      await steps[n](page, shot);
    } catch (e) {
      console.error(`[${n}] failed:`, e);
    }
  }
  if (errors.length) console.log('page errors/warnings:\n  ' + [...new Set(errors)].slice(0, 30).join('\n  '));
  await ctx.close();
}

void main();
