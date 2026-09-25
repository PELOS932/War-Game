/**
 * Military command orchestrator (per nation, every few hours): builds the
 * adversary list, fronts and threat picture, then runs amphibious, land,
 * naval and air command with a shared order batch.
 */
import type { AIContext } from '../context';
import type { NationMemory } from '../memory';
import { assessFronts, buildFronts, visibleEnemyPower, type Adversary } from './fronts';
import { runLand } from './land';
import { runAir } from './air';
import { planAmphibious, runNaval } from './naval';
import { OrderBatch } from './orders';

export function adversaries(ctx: AIContext, me: number, mem: NationMemory): Adversary[] {
  const hot = ctx.enemiesOf(me);
  const out: Adversary[] = hot.map((e) => ({ nation: e, hot: true, target: false, weight: 1 }));
  const plan = mem.warPlan;
  if (plan && !hot.includes(plan.target) && ctx.state.nations[plan.target]?.alive) {
    out.push({ nation: plan.target, hot: false, target: true, weight: 1 });
  }
  for (const t of mem.threatSources) {
    if (out.some((a) => a.nation === t)) continue;
    const rel = ctx.game.relation(me, t);
    const weight = Math.max(0.2, Math.min(0.9, 0.35 + (-rel) / 150 + mem.threat * 0.3));
    out.push({ nation: t, hot: false, target: false, weight });
  }
  return out;
}

/** Command period (hours) by posture. */
export function commandPeriod(posture: NationMemory['posture']): number {
  switch (posture) {
    case 'war': return 2;
    case 'prep': return 4;
    case 'tension': return 8;
    default: return 24;
  }
}

export function runMilitary(ctx: AIContext, me: number, mem: NationMemory): { orders: number; failed: number } {
  ctx.refreshUnits();
  const advs = adversaries(ctx, me, mem);
  buildFronts(ctx, me, mem, advs);
  const allPower = advs.length ? visibleEnemyPower(ctx, me, advs) : new Map<number, number>();
  const hotAdvs = advs.filter((a) => a.hot);
  let hotPower: Map<number, number>;
  if (hotAdvs.length === advs.length) hotPower = allPower;
  else hotPower = hotAdvs.length ? visibleEnemyPower(ctx, me, hotAdvs) : new Map<number, number>();
  assessFronts(ctx, me, mem, advs, allPower);
  mem.supportRequests = [];
  const hot = hotAdvs.map((a) => a.nation);
  const batch = new OrderBatch(ctx, mem);
  if (hot.length) planAmphibious(ctx, me, mem, batch, { hot, hotPower });
  runLand(ctx, me, mem, batch, { advs, allPower, hotPower, hot });
  runNaval(ctx, me, mem, batch, { hot, hotPower });
  batch.flush();
  runAir(ctx, me, mem, { hot, hotPower, sectors: mem.fronts });
  return { orders: batch.issued, failed: batch.failed };
}
