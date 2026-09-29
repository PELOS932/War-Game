/**
 * Validation report for src/data/military: duplicate ids, unknown references,
 * unknown nation codes, designs nobody fields or produces, coverage per nation.
 *
 *   npx tsx scripts/military-check.ts [--strict]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import v8 from 'node:v8';
import { DESIGNS, INVENTORY, MILITARY_REPORT as R, genericFallback } from '../src/data/military/index';
import { CATEGORY_NAMES } from '../src/sim/types';

const strict = process.argv.includes('--strict');
const file = path.join(process.env.AI_WORLD_CACHE ?? path.join(os.tmpdir(), 'war-game-ai'), 'earth.v8');
let codes: Set<string> | null = null;
if (fs.existsSync(file)) codes = new Set((v8.deserialize(fs.readFileSync(file)) as { nations: { code: string }[] }).nations.map((n) => n.code));
else {
  const m = await import('../src/worldgen/earth/index');
  codes = new Set(m.generateEarth(() => {}).nations.map((n: { code: string }) => n.code));
}

console.log('=== Military data report ===');
for (const r of R.regions) console.log(`region ${r.name}: ${r.designs} designs, ${r.inventories} inventories`);
console.log(`totals: ${R.totals.designs} designs (${R.totals.future} future), ${R.totals.nations} nation inventories, ${R.totals.units} listed units`);
let problems = 0;
const section = (title: string, items: string[]) => {
  console.log(`\n-- ${title}: ${items.length}`);
  for (const i of items.slice(0, 60)) console.log('   ' + i);
  if (items.length > 60) console.log(`   … +${items.length - 60} more`);
  problems += items.length;
};
section('duplicate design ids (first wins)', R.duplicateIds);
section('invalid design fields (repaired / dropped)', R.invalidDesigns);
console.log(`\n-- numeric fields clamped to the sim range (informational): ${R.clamped.length}`);
for (const c of R.clamped.slice(0, 12)) console.log('   ' + c);
const rs = R.resolved.filter((x, i, a) => a.findIndex((y) => y.from === x.from && y.to === x.to) === i);
console.log(`\n-- ids resolved by alias/prefix (${rs.length} distinct; ${R.genericRefs} direct generic refs)`);
for (const c of rs.slice(0, 40)) console.log(`   ${c.nation}: ${c.from} -> ${c.to}`);
section('inventory ids not defined (dropped; generic OOB fills the category)', R.missingInventoryIds.map((x) => `${x.nation}: ${x.id}`));
section('produces ids not defined (dropped)', R.missingProduceIds.map((x) => `${x.nation}: ${x.id}`));
section('predecessors not defined (ignored)', R.missingPredecessors.map((x) => `${x.id} <- ${x.predecessor}`));
section('nation inventories listed in several regions (merged)', R.duplicateInventories);

const ids = new Set(DESIGNS.map((d) => d.id));
section('unknown inventory nation codes', INVENTORY.filter((i) => !codes!.has(i.code)).map((i) => i.code));
section('unknown design origin codes', DESIGNS.filter((d) => !codes!.has(d.origin)).map((d) => `${d.id}: ${d.origin}`));
section('unknown exportTo codes', DESIGNS.flatMap((d) => (d.exportTo ?? []).filter((c) => !codes!.has(c)).map((c) => `${d.id}: ${c}`)));
const fielded = new Set(INVENTORY.flatMap((i) => i.units.map((u) => u.id)));
const produced = new Set(INVENTORY.flatMap((i) => i.produces));
section('non-future designs neither fielded nor produced by anyone', DESIGNS.filter((d) => !d.future && !fielded.has(d.id) && !produced.has(d.id)).map((d) => d.id));
section('produced designs that are future (ignored at start)', DESIGNS.filter((d) => d.future && produced.has(d.id)).map((d) => d.id));
section('future designs missing researchCost (default 8000 used)', DESIGNS.filter((d) => d.future).filter((d) => !Number.isFinite(d.researchCost)).map((d) => d.id));
section('inventory units whose design is future', INVENTORY.flatMap((i) => i.units.filter((u) => DESIGNS.find((d) => d.id === u.id)?.future).map((u) => `${i.code}: ${u.id}`)));

// coverage: nations with inventory but no produced design; generic mapping example
const noProd = INVENTORY.filter((i) => !i.produces.length).map((i) => i.code);
console.log(`\n-- inventories with an empty produces list (they buy or use generic lines): ${noProd.length} ${noProd.slice(0, 30).join(' ')}`);
const nationsMissing = [...codes].filter((c) => !INVENTORY.some((i) => i.code === c));
console.log(`-- world nations WITHOUT an inventory (generic OOB): ${nationsMissing.length}${nationsMissing.length < 80 ? ' ' + nationsMissing.join(' ') : ''}`);
const byCat = new Map<number, number>();
for (const d of DESIGNS) byCat.set(d.category, (byCat.get(d.category) ?? 0) + 1);
console.log('-- designs per category: ' + [...byCat.entries()].sort((a, b) => a[0] - b[0]).map(([c, n]) => `${CATEGORY_NAMES[c as keyof typeof CATEGORY_NAMES]} ${n}`).join(', '));
console.log(`-- generic fallback sample: ${DESIGNS.slice(0, 3).map((d) => `${d.id}->${genericFallback(d)}`).join(', ')}`);
void ids;
console.log(`\n${problems} issue(s) reported`);
if (strict && problems) process.exit(1);
