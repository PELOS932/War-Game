/** Quick probe: per-day finance log for a few nations (AI decisions + sim state). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import v8 from 'node:v8';
import type { WorldData } from '../src/worldgen/types';
import { createGame } from '../src/sim/game';
import { getAIDebug } from '../src/sim/ai/index';
const world = v8.deserialize(fs.readFileSync(path.join(process.env.AI_WORLD_CACHE ?? path.join(os.tmpdir(), 'war-game-ai'), 'earth.v8'))) as WorldData;
const game = createGame(world, -1);
const st = game.state;
const codes = (process.argv[2] ?? 'CHN,FRA,USA').split(',');
const days = Number(process.argv[3] ?? 5);
const ids = codes.map((c) => st.nations.findIndex((n) => n.code === c));
for (let d = 0; d <= days; d++) {
  for (const id of ids) {
    const n = st.nations[id];
    const inc = Object.values(n.income).reduce((a, b) => a + b, 0);
    const exp = Object.values(n.expenses).reduce((a, b) => a + b, 0);
    console.log(`d${d} ${n.code} treas ${n.treasury.toFixed(1)} debt ${n.debt.toFixed(0)} inc ${inc.toFixed(2)} exp ${exp.toFixed(2)} fund ${n.militaryFund.toFixed(1)} appr ${n.approval.toFixed(1)} gdp ${n.gdp.toFixed(0)}`);
    if (d === days) {
      console.log('  income', JSON.stringify(Object.fromEntries(Object.entries(n.income).map(([k, v]) => [k, +v.toFixed(2)]))));
      console.log('  expenses', JSON.stringify(Object.fromEntries(Object.entries(n.expenses).map(([k, v]) => [k, +v.toFixed(2)]))));
      console.log('  ', (getAIDebug(id)?.log ?? []).join('\n   '));
    }
  }
  game.stepHours(24);
}
