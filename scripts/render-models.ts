/**
 * Screenshots of the design model gallery (dev/models.html). Requires the dev server:
 *   npx vite --port 5174 --strictPort
 * Usage: npx tsx scripts/render-models.ts "cat=Armor" [more query strings…] [--out dir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let port = 5174;
  let out = '/tmp/claude-0/models/shots';
  const qs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port') port = Number(args[++i]);
    else if (args[i] === '--out') out = args[++i];
    else qs.push(args[i]);
  }
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('console', (m) => { if (m.type() === 'error') console.log('[page]', m.text().slice(0, 400)); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  for (const q of qs) {
    await page.goto(`http://localhost:${port}/dev/models.html?${q}`);
    await page.waitForFunction('window.__modelsReady', undefined, { timeout: 180000 });
    const info = await page.evaluate('JSON.stringify(window.__modelsReady)');
    const name = q.replace(/[^a-z0-9]+/gi, '_').slice(0, 60);
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
    console.log(name, info);
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
