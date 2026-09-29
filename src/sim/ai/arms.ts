/**
 * Defence minister, arms procurement abroad: once a week an AI nation looks at
 * the arms market and buys (instant delivery) when a foreign design is clearly
 * better than anything it can build itself, or when war needs more of a
 * category than the domestic lines cover. Light: one deal per run at most.
 */
import { UnitCategory, UnitClass } from '../types';
import type { AIContext } from './context';
import { CATEGORY_COUNT } from './context';
import { remember, type NationMemory } from './memory';
import { airCategoryWeights, forceMix, landCategoryWeights, navalCategoryWeights, type DesignInfo } from './designs';
import { geography } from './research';

const quality = (i: DesignInfo): number => i.valuePerCost * Math.max(1, i.d.cost);

export function runArms(ctx: AIContext, me: number, mem: NationMemory): void {
  const game = ctx.game;
  const n = ctx.nation(me);
  const hour = ctx.state.hour;
  if (!n.alive || n.gdp < 8) return;
  const war = mem.posture === 'war';
  const prep = mem.posture === 'prep';
  if (!war && !prep && mem.rng.next() > 0.45) return; // peacetime: only sometimes shop
  const fv = n.treasury;
  const fund = (n.militaryFund ?? 0) + (war && fv > 0 ? fv * 0.05 : 0);
  if (fund < 0.03) return;
  ctx.refreshUnits();

  // Upkeep headroom (same model as domestic production).
  const upkeepK = ((n.upkeepFactor || 1) * (1 + 0.12 * (5 - n.defcon))) / 1000;
  const alloc = (n.militaryBudget * n.gdp) / 365;
  let headroom = alloc * (war ? 1.15 : 0.95) - ctx.units.upkeep[me] * upkeepK;
  for (const it of n.productionQueue) {
    const info = ctx.design(it.design);
    if (info) headroom -= info.d.upkeep * it.count * upkeepK;
  }
  if (headroom <= 0) return;

  // What we can build ourselves: best quality per category.
  const mine = new Map<UnitCategory, number>();
  for (const id of game.availableDesigns(me)) {
    const info = ctx.design(id);
    if (!info) continue;
    mine.set(info.cat, Math.max(mine.get(info.cat) ?? 0, quality(info)));
  }

  // Doctrine weights per category.
  const geo = geography(ctx, me);
  const seed = ctx.state.world.nations[me];
  const mix = forceMix({
    landlocked: geo.landlocked, coastalShare: geo.coastalShare, island: geo.island, navalFocus: n.navalFocus,
    navyRating: seed?.navyRating ?? 2, airRating: seed?.airRating ?? 2, development: n.development, gdp: n.gdp,
  });
  const w = new Float64Array(CATEGORY_COUNT);
  const addClass = (m: Map<UnitCategory, number>, share: number) => {
    let t = 0;
    for (const v of m.values()) t += v;
    if (t > 0) for (const [c, v] of m) w[c] += (v / t) * share;
  };
  addClass(landCategoryWeights(n.development, mem.enemyArmor, mem.enemyAir, n.gdp), mix.land);
  addClass(airCategoryWeights(n.development, n.gdp, mem.enemyAir, mem.enemyArmor), mix.air);
  if (!geo.landlocked) addClass(navalCategoryWeights(n.gdp, seed?.navyRating ?? 2, n.navalFocus, false), mix.naval);

  const offers = game.armsMarket(me);
  if (!offers.length) return;
  const maxCount = n.gdp > 2000 ? 4 : n.gdp > 300 ? 3 : 2;
  let best: { seller: number; id: string; count: number; score: number; name: string } | null = null;
  for (const o of offers) {
    const info = ctx.design(o.designId);
    if (!info || info.d.future && !war) continue;
    if (info.cls === UnitClass.Naval && geo.landlocked) continue;
    const wc = w[info.cat];
    if (wc <= 0) continue;
    const rel = game.relation(me, o.seller);
    const ally = game.hasTreaty(me, o.seller, 'alliance') || game.hasTreaty(me, o.seller, 'defensePact');
    if (rel < 5 && !ally && !war) continue;
    const q = quality(info);
    const my = mine.get(info.cat) ?? 0;
    const gain = my > 0 ? q / my : 3;
    // Buy when clearly better, or (at war/prep) when the domestic option is weak or missing.
    if (gain < (war ? 1.0 : prep ? 1.15 : 1.3)) continue;
    const unitPrice = o.price;
    const count = Math.min(maxCount, Math.floor((fund * 0.7) / Math.max(1e-6, unitPrice)), Math.floor(headroom / Math.max(1e-9, info.d.upkeep * upkeepK)));
    if (count < 1) continue;
    const score = (wc * gain * (ally ? 1.25 : 1) * (0.7 + rel / 200)) / Math.sqrt(Math.max(0.02, unitPrice));
    if (!best || score > best.score) best = { seller: o.seller, id: o.designId, count, score, name: info.d.name };
  }
  if (!best) return;
  const res = game.buyArms(me, best.seller, best.id, best.count);
  if (res.ok) remember(mem, hour, 'production', `bought ${best.count}× ${best.name} from ${ctx.state.nations[best.seller].name}`);
}
