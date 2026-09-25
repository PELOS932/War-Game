/**
 * Headless AI soak test: build the world, run N game days with every nation
 * AI-controlled, and report wars, peace deals, captures, territory changes,
 * economies, production, research and AI CPU timing.
 *
 *   npx tsx scripts/ai-test.ts [days=365] [--procedural] [--seed=N] [--quiet]
 */
import type { WorldData } from '../src/worldgen/types';
import type { GameAPI } from '../src/sim/api';
import type { GameEvent } from '../src/sim/types';
import { formatDate } from '../src/sim/types';
import { getAIDebug, getAILog, getAITiming } from '../src/sim/ai/index';

const args = process.argv.slice(2);
const days = Number(args.find((a) => /^\d+$/.test(a)) ?? 365);
const procedural = args.includes('--procedural');
const quiet = args.includes('--quiet');
const seedArg = args.find((a) => a.startsWith('--seed='));
const seed = seedArg ? Number(seedArg.slice(7)) : 7;
const watch = (args.find((a) => a.startsWith('--watch=')) ?? '').slice(8).split(',').filter(Boolean);

async function buildWorld(): Promise<WorldData> {
  if (!procedural) {
    try {
      const m = await import('../src/worldgen/earth/index');
      const t = Date.now();
      const w = (m as { generateEarth: (p?: (s: string, f: number) => void) => WorldData }).generateEarth(() => {});
      console.log(`Earth world built in ${((Date.now() - t) / 1000).toFixed(1)}s: ${w.nations.length} nations, ${w.cities.length} cities`);
      return w;
    } catch (err) {
      console.warn('Earth builder unavailable, falling back to procedural world:', (err as Error).message);
    }
  }
  const g = await import('../src/worldgen/generate');
  const t = Date.now();
  const w = g.generateWorld({ seed, ...g.DEFAULT_SETTINGS });
  console.log(`Procedural world built in ${((Date.now() - t) / 1000).toFixed(1)}s: ${w.nations.length} nations`);
  return w;
}

const world = await buildWorld();
const { createGame } = await import('../src/sim/game');
const t0 = Date.now();
const game: GameAPI = createGame(world, -1);
console.log(`Game created in ${((Date.now() - t0) / 1000).toFixed(1)}s: ${game.state.units.size} units, ${game.state.facilities.size} facilities`);
const st = game.state;
const N = st.nations.length;
const name = (i: number) => st.nations[i]?.name ?? `#${i}`;

// ---- event tallies ---------------------------------------------------------
const warsDeclared: string[] = [];
const peaces: string[] = [];
const captures: string[] = [];
const defeated: string[] = [];
let hexCaptures = 0;
let unitsCreated = 0;
let unitsDestroyed = 0;
let facilitiesBuilt = 0;
const builtBy = new Float64Array(N);
const lostBy = new Float64Array(N);
const warNames = new Map<number, string>();
game.on((e: GameEvent) => {
  switch (e.type) {
    case 'warDeclared': {
      const w = st.wars.find((x) => x.id === e.war);
      warNames.set(e.war, w?.name ?? `${name(e.attacker)}–${name(e.defender)}`);
      warsDeclared.push(`${formatDate(st.hour)}  ${name(e.attacker)} → ${name(e.defender)}${w ? `  [att: ${w.attackers.map(name).join(', ')} | def: ${w.defenders.map(name).join(', ')}]` : ''}`);
      break;
    }
    case 'peace': {
      const w = st.wars.find((x) => x.id === e.war);
      peaces.push(`${formatDate(st.hour)}  ${warNames.get(e.war) ?? `war ${e.war}`}${w ? ` (score ${w.score.toFixed(0)})` : ''}`);
      break;
    }
    case 'cityCaptured':
      captures.push(`${formatDate(st.hour)}  ${name(e.to)} took ${st.cities[e.city]?.name} from ${name(e.from)}`);
      break;
    case 'hexCaptured':
      hexCaptures++;
      break;
    case 'nationDefeated':
      defeated.push(`${formatDate(st.hour)}  ${name(e.nation)} defeated by ${name(e.by)}`);
      break;
    case 'unitCreated':
      unitsCreated++;
      builtBy[e.nation]++;
      break;
    case 'unitDestroyed':
      unitsDestroyed++;
      lostBy[e.nation]++;
      break;
    case 'facilityBuilt':
      facilitiesBuilt++;
      break;
    default:
      break;
  }
});

// ---- initial snapshot ---------------------------------------------------------
function hexCounts(): Int32Array {
  const c = new Int32Array(N);
  for (let i = 0; i < st.hexOwner.length; i++) {
    const o = st.hexOwner[i];
    if (o > 0) c[o - 1]++;
  }
  return c;
}
const hex0 = hexCounts();
const treas0 = st.nations.map((n) => n.treasury);
const appr0 = st.nations.map((n) => n.approval);
const gdp0 = st.nations.map((n) => n.gdp);
const tech0 = st.nations.map((n) => n.knownTechs.size);
const units0 = new Int32Array(N);
for (const u of st.units.values()) units0[u.nation]++;

// ---- run ------------------------------------------------------------------------
const wallStart = Date.now();
let lastLog = 0;
for (let d = 1; d <= days; d++) {
  const t = Date.now();
  game.stepHours(24);
  const dt = Date.now() - t;
  if (!quiet && (d % 30 === 0 || d === days)) {
    const timing = getAITiming();
    const atWar = st.wars.length;
    const log = getAILog();
    const fresh = log.slice(lastLog);
    lastLog = log.length;
    console.log(`\n=== ${formatDate(st.hour)} (day ${d}) wars=${atWar} captures=${captures.length} hexCaptures=${hexCaptures} units=${st.units.size} built=${unitsCreated} lost=${unitsDestroyed} | day wall ${dt}ms, AI avg ${timing.avgPerHour.toFixed(2)}ms/h max ${timing.maxHour.toFixed(1)}ms`);
    for (const e of fresh.filter((x) => x.kind !== 'treaty' && x.kind !== 'offensive').slice(-25)) console.log(`   [${formatDate(e.hour)}] ${e.kind}: ${e.text}`);
    const offs = fresh.filter((x) => x.kind === 'offensive');
    if (offs.length) console.log(`   (${offs.length} offensives launched; e.g. ${offs.slice(-3).map((o) => o.text).join(' | ')})`);
    for (const w of watch) {
      const id = st.nations.findIndex((n) => n.code === w || n.name === w);
      if (id >= 0) console.log(`   WATCH ${w}:`, JSON.stringify(getAIDebug(id), null, 0).slice(0, 1500));
    }
  }
}
const wall = (Date.now() - wallStart) / 1000;

// ---- report ---------------------------------------------------------------------
console.log('\n================ SUMMARY ================');
console.log(`Simulated ${days} days in ${wall.toFixed(1)}s wall (${(wall * 1000 / days).toFixed(0)} ms/day)`);
const timing = getAITiming();
console.log(`AI: avg ${timing.avgPerHour.toFixed(2)} ms/hour, max ${timing.maxHour.toFixed(1)} ms/hour over ${timing.hours} hours`);
console.log('AI time by dept (ms total):', Object.fromEntries(Object.entries(timing.byDept).map(([k, v]) => [k, Math.round(v)])));

console.log(`\nWars declared (${warsDeclared.length}):`);
for (const w of warsDeclared) console.log('  ' + w);
console.log('\nAI war reasoning:');
for (const e of getAILog().filter((x) => x.kind === 'war' || x.kind === 'prep' || x.kind === 'join' || x.kind === 'abandon')) console.log(`  [${formatDate(e.hour)}] ${e.text}`);
console.log(`\nPeace deals (${peaces.length}):`);
for (const p of peaces) console.log('  ' + p);
console.log('\nPeace offers:');
for (const e of getAILog().filter((x) => x.kind === 'peace').slice(-30)) console.log(`  [${formatDate(e.hour)}] ${e.text}`);
console.log(`\nOngoing wars (${st.wars.length}):`);
for (const w of st.wars) console.log(`  ${w.name}: ${w.attackers.map(name).join(', ')} vs ${w.defenders.map(name).join(', ')} score ${w.score.toFixed(0)} since ${formatDate(w.startHour)}`);
console.log(`\nCities captured (${captures.length}):`);
for (const c of captures.slice(0, 60)) console.log('  ' + c);
if (captures.length > 60) console.log(`  ... ${captures.length - 60} more`);
if (defeated.length) {
  console.log('\nNations defeated:');
  for (const d of defeated) console.log('  ' + d);
}
console.log('\nAmphibious operations:');
for (const e of getAILog().filter((x) => x.kind === 'amphib')) console.log(`  [${formatDate(e.hour)}] ${e.text}`);

const hex1 = hexCounts();
const deltas = Array.from({ length: N }, (_, i) => ({ i, d: hex1[i] - hex0[i] })).filter((x) => x.d !== 0).sort((a, b) => b.d - a.d);
console.log('\nTerritory changes (hexes):');
for (const x of deltas.slice(0, 12)) console.log(`  ${name(x.i).padEnd(28)} ${x.d > 0 ? '+' : ''}${x.d} (${hex0[x.i]} → ${hex1[x.i]})`);

let broke = 0, lowApproval = 0, apprSum = 0, alive = 0, gdpGrowth = 0;
const econRows: string[] = [];
for (const n of st.nations) {
  if (!n.alive) continue;
  alive++;
  apprSum += n.approval;
  if (n.treasury < 0) broke++;
  if (n.approval < 30) lowApproval++;
  gdpGrowth += n.gdp / Math.max(1e-6, gdp0[n.id]);
}
const bigs = [...st.nations].filter((n) => n.alive).sort((a, b) => b.gdp - a.gdp).slice(0, 15);
for (const n of bigs) {
  econRows.push(`  ${n.name.padEnd(24)} GDP ${gdp0[n.id].toFixed(0)}→${n.gdp.toFixed(0)}  treasury ${treas0[n.id].toFixed(1)}→${n.treasury.toFixed(1)}  debt ${n.debt.toFixed(0)}  approval ${appr0[n.id].toFixed(0)}→${n.approval.toFixed(0)}  tax ${(n.taxes.income * 100).toFixed(0)}/${(n.taxes.corporate * 100).toFixed(0)}/${(n.taxes.sales * 100).toFixed(0)}  mil ${(n.militaryBudget * 100).toFixed(1)}%  DEFCON ${n.defcon}  techs ${tech0[n.id]}→${n.knownTechs.size}  units ${units0[n.id]}→${[...st.units.values()].filter((u) => u.nation === n.id).length}`);
}
console.log(`\nEconomy: ${alive} nations alive, ${broke} with negative treasury, ${lowApproval} with approval < 30, mean approval ${(apprSum / Math.max(1, alive)).toFixed(1)}, mean GDP ratio ${(gdpGrowth / Math.max(1, alive)).toFixed(3)}`);
for (const r of econRows) console.log(r);

let techGain = 0, researching = 0;
for (const n of st.nations) {
  techGain += n.knownTechs.size - tech0[n.id];
  if (n.researching.length > 0) researching++;
}
console.log(`\nResearch: ${techGain} techs discovered in total; ${researching}/${alive} nations researching`);
console.log(`Production: ${unitsCreated} units built, ${unitsDestroyed} destroyed, ${facilitiesBuilt} facilities built`);
const topBuild = Array.from({ length: N }, (_, i) => i).sort((a, b) => builtBy[b] - builtBy[a]).slice(0, 8);
console.log('  top builders: ' + topBuild.map((i) => `${name(i)} ${builtBy[i]}`).join(', '));
const topLoss = Array.from({ length: N }, (_, i) => i).sort((a, b) => lostBy[b] - lostBy[a]).slice(0, 8);
console.log('  top losses:   ' + topLoss.filter((i) => lostBy[i] > 0).map((i) => `${name(i)} ${lostBy[i]}`).join(', '));

// Idle-at-war check: land units of nations at war that have no order and are far from any enemy.
let idle = 0, warUnits = 0;
for (const u of st.units.values()) {
  const wars = st.wars.some((w) => w.attackers.includes(u.nation) || w.defenders.includes(u.nation));
  if (!wars) continue;
  warUnits++;
  if (u.order.type === 'idle' && !u.inCombat) idle++;
}
console.log(`At-war units idle: ${idle}/${warUnits}`);
for (const w of watch) {
  const id = st.nations.findIndex((n) => n.code === w || n.name === w);
  if (id >= 0) console.log(`\nDEBUG ${w}:`, JSON.stringify(getAIDebug(id), null, 1));
}
