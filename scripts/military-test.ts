/**
 * Real-military integration test: builds Earth, creates a game, prints sample
 * orders of battle, runs 30 days, performs an arms purchase and a unit sale.
 *
 *   npx tsx scripts/military-test.ts [days=30] [--rebuild]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import v8 from 'node:v8';
import type { WorldData } from '../src/worldgen/types';
import { CATEGORY_CLASS, CATEGORY_NAMES, UnitClass } from '../src/sim/types';
import { MILITARY_REPORT } from '../src/data/military/index';

const args = process.argv.slice(2);
const days = Number(args.find((a) => /^\d+$/.test(a)) ?? 30);
const cacheDir = process.env.AI_WORLD_CACHE ?? path.join(os.tmpdir(), 'war-game-ai');
let failures = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++; };

async function buildWorld(): Promise<WorldData> {
  const file = path.join(cacheDir, 'earth.v8');
  if (fs.existsSync(file) && !args.includes('--rebuild')) return v8.deserialize(fs.readFileSync(file)) as WorldData;
  const m = await import('../src/worldgen/earth/index');
  const t = Date.now();
  const w = m.generateEarth(() => {});
  console.log(`Earth built in ${((Date.now() - t) / 1000).toFixed(1)}s`);
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(file, v8.serialize(w));
  return w;
}

const world = await buildWorld();
console.log(`Military data: ${MILITARY_REPORT.totals.designs} designs (${MILITARY_REPORT.totals.future} future), ${MILITARY_REPORT.totals.nations} inventories, ${MILITARY_REPORT.totals.units} listed units`);
const { createGame } = await import('../src/sim/game');
let t0 = Date.now();
const game = createGame(world, 0);
const createMs = Date.now() - t0;
const st = game.state;
const code2id = new Map(st.nations.map((n) => [n.code, n.id]));
console.log(`createGame ${createMs} ms; units=${st.units.size}, designs=${st.designs.size}, techs=${st.techs.size}`);
check(st.units.size >= 800 && st.units.size <= 8000, `world unit total ${st.units.size} within 800..8000`);
check(createMs < 30000, 'createGame < 30 s');

function oob(code: string): void {
  const id = code2id.get(code);
  if (id === undefined) { console.log(`${code}: not in world`); return; }
  const counts = new Map<string, number>();
  let real = 0, total = 0;
  for (const u of st.units.values()) {
    if (u.nation !== id) continue;
    total++;
    const d = st.designs.get(u.design)!;
    if (d.real) real++;
    counts.set(d.name, (counts.get(d.name) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${v}× ${k}`).join(', ');
  const buildable = game.availableDesigns(id).filter((x) => st.designs.get(x)?.real).length;
  console.log(`${code}: ${total} units (${real} real-design); buildable real designs ${buildable}; top: ${top}`);
}
for (const c of ['USA', 'RUS', 'CHN', 'IND', 'GBR', 'ISR', 'BRA']) oob(c);

// class totals
const byCls = [0, 0, 0];
let realUnits = 0;
for (const u of st.units.values()) { const d = st.designs.get(u.design)!; byCls[d.cls]++; if (d.real) realUnits++; }
console.log(`units by class land/air/naval = ${byCls.join('/')}; real-design units ${realUnits}`);
const missingDesign = [...st.units.values()].filter((u) => !st.designs.has(u.design)).length;
check(missingDesign === 0, 'every unit has a design');

// ---- future designs / research ----
const designTechs = [...st.techs.values()].filter((t) => t.id.startsWith('design:'));
console.log(`future-design research items: ${designTechs.length}`);
const usa = code2id.get('USA')!;
const availUsa = game.availableTechs(usa).filter((t) => t.startsWith('design:'));
console.log(`USA researchable national designs now: ${availUsa.length} ${availUsa.slice(0, 4).join(', ')}`);
const notUs = designTechs.find((t) => !t.nations?.includes('USA'));
if (notUs) check(!game.availableTechs(usa).includes(notUs.id), `USA cannot research ${notUs.id} (origin ${notUs.nations})`);

// ---- 30 days ----
t0 = Date.now();
const before = st.units.size;
game.stepHours(24 * days);
const simMs = Date.now() - t0;
console.log(`${days} days simulated in ${(simMs / 1000).toFixed(1)} s (${(simMs / (24 * days)).toFixed(1)} ms/hour); units ${before} -> ${st.units.size}`);

// ---- arms purchase ----
const me = code2id.get('POL') ?? 5;
const meN = st.nations[me];
meN.treasury = Math.max(meN.treasury, 500);
t0 = Date.now();
const market = game.armsMarket(me);
const marketMs = Date.now() - t0;
check(marketMs < 100, `armsMarket() took ${marketMs} ms`);
console.log(`Arms market for ${meN.name}: ${market.length} offers from ${new Set(market.map((o) => o.seller)).size} sellers`);
check(market.length > 0, 'market has offers');
const cand = market.find((o) => st.designs.get(o.designId)!.cls === UnitClass.Land) ?? market[0];
if (cand) {
  const d = st.designs.get(cand.designId)!;
  const tre0 = meN.treasury, sellTre0 = st.nations[cand.seller].treasury;
  const cnt0 = st.units.size;
  const r = game.buyArms(me, cand.seller, cand.designId, 3);
  console.log(`buyArms ${d.name} x3 from ${st.nations[cand.seller].name} @ $${cand.price.toFixed(3)}B each -> ${JSON.stringify(r)}`);
  check(r.ok, 'purchase ok');
  check(st.units.size === cnt0 + 3, 'three units appeared instantly');
  check(st.nations[cand.seller].treasury > sellTre0, 'seller was paid');
  check(meN.treasury < tre0 || meN.militaryFund >= 0, 'buyer paid');
  const bought = [...st.units.values()].filter((u) => u.nation === me && u.design === cand.designId && u.createdHour === st.hour);
  check(bought.length >= 3 && bought.every((u) => u.strength === 100), 'new units full strength');
}
// air + naval purchases
for (const cls of [UnitClass.Air, UnitClass.Naval]) {
  const o = market.find((x) => st.designs.get(x.designId)!.cls === cls);
  if (o) { const r = game.buyArms(me, o.seller, o.designId, 1); console.log(`buy ${UnitClass[cls]} ${st.designs.get(o.designId)!.name}: ${JSON.stringify(r)}`); }
}
// ---- sale ----
const buyerId = code2id.get('UKR') ?? 6;
const sellerId = code2id.get('USA')!;
const own = [...st.units.values()].filter((u) => u.nation === sellerId && !u.airborne && CATEGORY_CLASS[st.designs.get(u.design)!.category] === UnitClass.Land).slice(0, 2).map((u) => u.id);
st.nations[buyerId].treasury = Math.max(st.nations[buyerId].treasury, 50);
st.relations[buyerId * st.nations.length + sellerId] = st.relations[sellerId * st.nations.length + buyerId] = 40;
const fair = game.unitsValue(own);
const rs = game.sellUnits(sellerId, buyerId, own, fair);
console.log(`sellUnits ${own.length} units (fair $${fair.toFixed(2)}B) USA -> ${st.nations[buyerId].name}: ${JSON.stringify(rs)}`);
check(rs.ok, 'sale ok');
check(own.every((id) => st.units.get(id)?.nation === buyerId), 'units changed owner instantly');
st.nations[buyerId].treasury = 100000;
const gouge = game.sellUnits(sellerId, buyerId, [...st.units.values()].filter((u) => u.nation === sellerId).slice(0, 1).map((u) => u.id), fair * 40);
check(!gouge.ok, `overpriced sale refused (${gouge.reason})`);
game.stepHours(48);
check(!Number.isNaN(st.nations[me].treasury), 'sim survives 2 more days after trades');

// ---- save/load ----
const { serializeGame, loadGame } = await import('../src/sim/save');
t0 = Date.now();
const json = serializeGame(game);
const g2 = loadGame(world, json);
check(g2.state.units.size === st.units.size, `save/load round-trip (${(json.length / 1e6).toFixed(1)} MB, ${Date.now() - t0} ms)`);
check((g2.state.nations[me].ownDesigns?.size ?? 0) === (st.nations[me].ownDesigns?.size ?? 0), 'ownDesigns persisted');
g2.stepHours(24);

// AI trade activity
const news = st.news.filter((n) => /buys|sells|transfers|licence/.test(n.text));
console.log(`arms-trade news items so far: ${news.length}`);
for (const n of news.slice(-5)) console.log('  ', n.text);
void CATEGORY_NAMES;
console.log(failures ? `\n${failures} FAILURES` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
