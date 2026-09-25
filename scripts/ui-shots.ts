/**
 * UI screenshot harness (dev only). Requires the dev server:
 *   npx vite --port 5175 --strictPort &
 *   npx tsx scripts/ui-shots.ts [scenario ...]
 * Screenshots go to /tmp/claude-0/ui/.
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.env.UI_SHOTS_DIR ?? '/tmp/claude-0/ui';
const BASE = process.env.UI_BASE ?? 'http://localhost:5175/dev/ui.html';
mkdirSync(OUT, { recursive: true });

type Scenario = (page: Page, shot: (name: string) => Promise<void>) => Promise<void>;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function gotoGame(page: Page, extra = ''): Promise<void> {
  await page.goto(`${BASE}?screen=game&nation=USA${extra}`);
  await page.waitForSelector('.sc-topbar', { timeout: 60000 });
  await wait(1500);
}

const scenarios: Record<string, Scenario> = {
  async menu(page, shot) {
    await page.goto(`${BASE}?screen=menu&save=1`);
    await wait(2500);
    await shot('menu');
  },
  async loading(page, shot) {
    await page.goto(`${BASE}?screen=loading`);
    await wait(1800);
    await shot('loading');
  },
  async select(page, shot) {
    await page.goto(`${BASE}?screen=select`);
    await page.waitForSelector('.sc-ns-list tbody tr', { timeout: 60000 });
    await wait(800);
    await shot('select-empty');
    await page.fill('.sc-ns-list input', 'germ');
    await wait(200);
    await page.click('.sc-ns-list tbody tr');
    await wait(1500);
    await shot('select-germany');
  },
  async hud(page, shot) {
    await gotoGame(page);
    await shot('hud');
  },
  async tabs(page, shot) {
    await gotoGame(page);
    const tabs = ['overview', 'cabinet', 'military', 'build', 'research', 'diplomacy', 'trade', 'finance', 'world'];
    for (let i = 0; i < tabs.length; i++) {
      await page.keyboard.press(`F${i + 1}`);
      await wait(700);
      await shot(`tab-${i + 1}-${tabs[i]}`);
    }
  },
  async units(page, shot) {
    await gotoGame(page, '&dist=40');
    await page.evaluate(() => {
      const dev = (window as unknown as { __dev: { game: { state: { units: Map<number, { nation: number; id: number }> ; playerNation: number } } } }).__dev;
      const ids = [...dev.game.state.units.values()].filter((u) => u.nation === dev.game.state.playerNation).map((u) => u.id);
      (window as unknown as { __sel: number[] }).__sel = ids;
    });
    // click a unit via its screen position
    const pos = await page.evaluate(() => {
      const dev = (window as unknown as { __dev: { game: { state: { units: Map<number, { nation: number; x: number; z: number }>; playerNation: number } }; renderer: { worldToScreen(x: number, y: number, z: number): { x: number; y: number } } } }).__dev;
      const u = [...dev.game.state.units.values()].find((x) => x.nation === dev.game.state.playerNation);
      return u ? dev.renderer.worldToScreen(u.x, 0, u.z) : null;
    });
    if (pos) {
      await page.mouse.click(pos.x, pos.y);
      await wait(600);
      await shot('unit-single');
      await page.mouse.move(pos.x + 120, pos.y + 60);
      await wait(900);
      await shot('unit-path-hover');
    }
    await page.mouse.move(420, 300);
    await page.mouse.down();
    await page.mouse.move(1100, 700, { steps: 8 });
    await page.mouse.up();
    await wait(600);
    await shot('unit-multi');
  },
  async hover(page, shot) {
    await gotoGame(page, '&dist=40');
    await page.keyboard.press('Escape');
    await page.mouse.move(640, 420);
    await wait(300);
    await page.mouse.move(645, 425);
    await wait(1200);
    await shot('hover-tip');
    await page.mouse.click(645, 425);
    await wait(800);
    await shot('hex-info');
  },
  async dialogs(page, shot) {
    await gotoGame(page, '&speed=5');
    await wait(6000);
    await shot('proposal');
    await page.keyboard.press('Escape');
    await wait(300);
    await page.click('.sc-topbar .sc-tb-right .sc-btn:last-child');
    await wait(500);
    await shot('game-menu');
  },
  async defcon(page, shot) {
    await gotoGame(page);
    await page.click('.sc-defcon');
    await wait(400);
    await shot('defcon');
  },
  async diplo(page, shot) {
    await gotoGame(page);
    await page.keyboard.press('F6');
    await wait(500);
    await page.click('.sc-dip-list tbody tr:nth-child(3)');
    await wait(600);
    await shot('diplomacy-detail');
  },
  async build(page, shot) {
    await gotoGame(page);
    await page.keyboard.press('F4');
    await wait(400);
    await page.click('.sc-design');
    await wait(500);
    await shot('build-unit');
    await page.click('.sc-subtab:nth-child(2)');
    await wait(400);
    await page.click('.sc-factile:nth-child(13)');
    await wait(400);
    await shot('build-facility');
  },
  async research(page, shot) {
    await gotoGame(page);
    await page.keyboard.press('F5');
    await wait(400);
    await page.click('.sc-tech.avail');
    await wait(400);
    await shot('research-detail');
  },
  async trade(page, shot) {
    await gotoGame(page);
    await page.keyboard.press('F7');
    await wait(400);
    await page.click('.sc-trade-table tbody tr:nth-child(4)');
    await wait(500);
    await shot('trade-detail');
  },
};

async function main(): Promise<void> {
  const want = process.argv.slice(2);
  const names = want.length ? want : Object.keys(scenarios);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  for (const name of names) {
    const sc = scenarios[name];
    if (!sc) {
      console.warn('unknown scenario', name);
      continue;
    }
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    try {
      await sc(page, async (n) => {
        await page.screenshot({ path: `${OUT}/${n}.png` });
        console.log('shot', n);
      });
    } catch (e) {
      console.error(`[${name}] failed:`, e);
    }
    if (errors.length) console.log(`[${name}] page errors:\n  ` + errors.slice(0, 10).join('\n  '));
    await page.close();
  }
  await browser.close();
}

void main();
