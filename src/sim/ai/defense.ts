/**
 * Defence minister: strategic threat assessment, military budget, DEFCON,
 * unit production following doctrine & counters, and military facilities.
 */
import { FacilityType, Resource, UnitCategory, UnitClass, type Nation } from '../types';
import type { AIContext } from './context';
import { CATEGORY_COUNT } from './context';
import { remember, type NationMemory } from './memory';
import {
  airCategoryWeights, forceMix, landCategoryWeights, navalCategoryWeights, type DesignInfo,
} from './designs';
import { financeView } from './economy';
import { geography } from './research';
import { tryBuild, tryUpgrade } from './economy';

/** Nations that can plausibly project force against `me` (land neighbours + naval powers nearby). */
export function potentialThreats(ctx: AIContext, me: number): number[] {
  const out = new Set<number>(ctx.terr.landNeighbours(me));
  for (const e of ctx.enemiesOf(me)) out.add(e);
  return [...out].filter((x) => ctx.state.nations[x]?.alive);
}

export interface ThreatInfo {
  nation: number;
  level: number; // 0..1+
  hostility: number;
  ratio: number;
  massing: number; // visible power within 2 hexes of our border
}

/** Strategic threat assessment (daily). Updates mem.threat & enemy composition. */
export function assessThreats(ctx: AIContext, me: number, mem: NationMemory): ThreatInfo[] {
  ctx.refreshUnits();
  const game = ctx.game;
  const grid = ctx.grid;
  const owner = ctx.state.hexOwner;
  const myPower = ctx.totalPower(me);
  let allyPower = 0;
  for (const a of ctx.alliesOf(me)) allyPower += ctx.totalPower(a) * 0.35;
  const enemies = new Set(ctx.enemiesOf(me));
  const out: ThreatInfo[] = [];
  let armor = 0, land = 0, air = 0, naval = 0;
  for (const b of potentialThreats(ctx, me)) {
    const rel = game.relation(me, b);
    const war = enemies.has(b);
    if (!war && (rel > 20 || ctx.sameMilitaryBloc(me, b) || game.hasTreaty(me, b, 'alliance'))) continue;
    const hostility = war ? 1 : Math.max(0, (10 - rel) / 90);
    const theirPower = ctx.totalPower(b);
    const ratio = theirPower / Math.max(1, myPower + allyPower);
    // Massing: visible enemy land power within 2 hexes of our territory.
    let massing = 0;
    for (const u of ctx.units.land[b]) {
      if (owner[u.hex] - 1 === me) {
        massing += 1;
        continue;
      }
      let near = false;
      grid.forRadius(u.hex, 2, (h) => {
        if (!near && owner[h] - 1 === me) near = true;
      });
      if (near && game.isVisible(me, u.hex)) massing += 1;
    }
    const landN = ctx.terr.borderLength(me, b) > 0 ? 1 : 0.45;
    const massShare = massing / Math.max(4, ctx.units.land[b].length);
    const level = war
      ? 0.7 + 0.3 * Math.min(1, ratio)
      : hostility * Math.min(1.5, ratio) * landN * (0.6 + 0.8 * massShare) + (massShare > 0.35 && rel < 0 ? 0.25 : 0);
    out.push({ nation: b, level, hostility, ratio, massing });
    if (level > 0.15) {
      const w = level;
      land += ctx.units.landPower[b] * w;
      armor += ctx.units.armorPower[b] * w;
      air += ctx.units.airPower[b] * w;
      naval += ctx.units.navalPower[b] * w;
    }
  }
  out.sort((a, b) => b.level - a.level || a.nation - b.nation);
  mem.threat = Math.min(1, out[0]?.level ?? 0);
  mem.threatSources = out.filter((t) => t.level > 0.2).slice(0, 4).map((t) => t.nation);
  const total = land + air + naval;
  if (total > 0) {
    mem.enemyArmor = mem.enemyArmor * 0.6 + 0.4 * (armor / Math.max(1, land));
    mem.enemyAir = mem.enemyAir * 0.6 + 0.4 * (air / total);
    mem.enemyNaval = mem.enemyNaval * 0.6 + 0.4 * (naval / total);
  }
  return out;
}

export function updatePosture(ctx: AIContext, me: number, mem: NationMemory): void {
  if (ctx.atWarAny(me)) mem.posture = 'war';
  else if (mem.warPlan) mem.posture = 'prep';
  else if (mem.threat > 0.35) mem.posture = 'tension';
  else mem.posture = 'peace';
}

export function desiredDefcon(ctx: AIContext, me: number, mem: NationMemory): number {
  const hour = ctx.state.hour;
  if (ctx.atWarAny(me)) {
    const cap = ctx.capitalHex(me);
    let capThreat = false;
    if (cap >= 0) {
      for (const e of ctx.enemiesOf(me)) {
        for (const u of ctx.units.land[e]) {
          if (ctx.grid.distance(u.hex, cap) <= 4) {
            capThreat = true;
            break;
          }
        }
        if (capThreat) break;
      }
    }
    return capThreat ? 1 : 2;
  }
  if (mem.warPlan) return mem.warPlan.declareHour - hour < 24 * 7 ? 2 : 3;
  if (mem.threat > 0.6) return 3;
  if (mem.threat > 0.3) return 4;
  return 5;
}

export function runDefenseBudget(ctx: AIContext, me: number, mem: NationMemory): void {
  const game = ctx.game;
  const n = ctx.nation(me);
  const seed = ctx.state.world.nations[me];
  const base = Math.max(0.006, (seed?.defenseBudget ?? 2) / 100);
  const fv = financeView(n);
  let target = base * (1 + 0.7 * mem.threat);
  if (mem.posture === 'prep') target = Math.max(target, base * 1.5);
  if (mem.posture === 'war') {
    const wars = ctx.warsOf(me);
    const losing = wars.some((w) => w.score < -20);
    target = Math.max(target, base * (losing ? 2.6 : 2.0));
  }
  // Finances constrain the budget.
  if (fv.balance < 0 && fv.daysLeft < 90 && mem.posture !== 'war') target = Math.min(target, base * 0.85);
  if (n.treasury < 0 && mem.posture !== 'war') target = Math.min(target, base * 0.7);
  target = Math.min(0.2, Math.max(0.004, target));
  if (Math.abs(target - n.militaryBudget) > Math.max(0.001, n.militaryBudget * 0.05)) {
    game.setMilitaryBudget(me, Math.round(target * 10000) / 10000);
    remember(mem, ctx.state.hour, 'defense', `military budget ${(target * 100).toFixed(1)}% of GDP (${mem.posture}, threat ${mem.threat.toFixed(2)})`);
  }
}

export function runDefcon(ctx: AIContext, me: number, mem: NationMemory): void {
  const want = desiredDefcon(ctx, me, mem);
  const n = ctx.nation(me);
  if (n.defcon !== want) {
    // Step at most one level toward peace per day; escalate immediately.
    const next = want < n.defcon ? want : n.defcon + 1;
    if (ctx.game.setDefcon(me, next).ok) remember(mem, ctx.state.hour, 'defense', `DEFCON ${next}`);
  }
}

// ---------------------------------------------------------------------------
// Production
// ---------------------------------------------------------------------------

function bestDesign(ctx: AIContext, me: number, cat: UnitCategory, designs: DesignInfo[]): DesignInfo | null {
  let best: DesignInfo | null = null;
  let bestScore = -Infinity;
  for (const info of designs) {
    if (info.cat !== cat) continue;
    const s = info.d.generation * 10 + info.valuePerCost * 50 - info.d.cost / 5000;
    if (s > bestScore) {
      bestScore = s;
      best = info;
    }
  }
  return best;
}

function candidateCities(ctx: AIContext, me: number, cls: UnitClass, mem: NationMemory): number[] {
  const cities = (ctx.terr.cities[me] ?? []).map((id) => ctx.state.cities[id]);
  let focus = -1;
  const hot = mem.fronts.filter((f) => f.hot || f.threat > 0).sort((a, b) => b.threat - a.threat)[0];
  if (hot) focus = hot.anchor;
  const scored = cities
    .filter((c) => (cls === UnitClass.Naval ? c.port : true))
    .map((c) => {
      let s = Math.log(1 + c.population);
      if (c.capital) s += 1;
      if (focus >= 0 && cls === UnitClass.Land) s += 3 / (1 + ctx.grid.distance(c.hex, focus) / 6);
      // Never produce inside a city that is itself on the front line.
      if (focus >= 0 && ctx.grid.distance(c.hex, focus) <= 1) s -= 2;
      return { id: c.id, s };
    })
    .sort((a, b) => b.s - a.s || a.id - b.id);
  return scored.slice(0, 8).map((x) => x.id);
}

export function runProduction(ctx: AIContext, me: number, mem: NationMemory): void {
  ctx.refreshUnits();
  const game = ctx.game;
  const n = ctx.nation(me);
  const seed = ctx.state.world.nations[me];
  const fv = financeView(n);
  const hour = ctx.state.hour;
  const war = mem.posture === 'war';
  const prep = mem.posture === 'prep';
  // Money model: the military allocation (budget × GDP) pays unit upkeep and the
  // remainder accrues to the procurement fund. Buy only what the fund can pay
  // for and what the allocation can keep in the field afterwards.
  const upkeepK = (n.upkeepFactor || 1) * (1 + 0.12 * (5 - n.defcon)) / 1000; // design upkeep (M/day) → billions/day
  const upkeepNow = ctx.units.upkeep[me] * upkeepK;
  let queuedUpkeep = 0;
  let queuedItems = 0;
  let queuedCost = 0;
  const queuedCat = new Float64Array(CATEGORY_COUNT);
  for (const it of n.productionQueue) {
    const info = ctx.design(it.design);
    if (!info) continue;
    queuedUpkeep += info.d.upkeep * it.count * upkeepK;
    queuedItems++;
    queuedCat[info.cat] += it.count;
    queuedCost += 0;
  }
  const alloc = (n.militaryBudget * n.gdp) / 365;
  // At war we accept overruns paid from the treasury.
  const headroom = alloc * (war ? 1.15 : prep ? 1.02 : 0.95) - upkeepNow - queuedUpkeep;
  const fund = (n.militaryFund ?? 0) + (war ? Math.max(0, n.treasury - fv.reserveTarget) * 0.1 : 0);
  const maxQueue = Math.min(10, 1 + Math.floor(n.gdp / 800) + (war ? 3 : prep ? 2 : 0));
  mem.productionPlan = `fund ${fund.toFixed(2)}B headroom ${(headroom * 1000).toFixed(1)}M/d queue ${queuedItems}/${maxQueue}`;
  if (queuedItems >= maxQueue || headroom <= 0 || fund <= 0) return;
  void queuedCost;

  // Composition targets.
  const geo = geography(ctx, me);
  const mix = forceMix({
    landlocked: geo.landlocked,
    coastalShare: geo.coastalShare,
    island: geo.island,
    navalFocus: n.navalFocus,
    navyRating: seed?.navyRating ?? 2,
    airRating: seed?.airRating ?? 2,
    development: n.development,
    gdp: n.gdp,
  });
  const expeditionary = mem.amphib.length > 0 || (mem.warPlan !== null && ctx.terr.mainBorderLength(me, mem.warPlan.target) === 0);
  const weights = new Float64Array(CATEGORY_COUNT);
  const addClass = (m: Map<UnitCategory, number>, share: number) => {
    let t = 0;
    for (const v of m.values()) t += v;
    if (t <= 0) return;
    for (const [c, v] of m) weights[c] += (v / t) * share;
  };
  addClass(landCategoryWeights(n.development, mem.enemyArmor, mem.enemyAir, n.gdp), mix.land);
  addClass(airCategoryWeights(n.development, n.gdp, mem.enemyAir, mem.enemyArmor), mix.air);
  if (!geo.landlocked) addClass(navalCategoryWeights(n.gdp, seed?.navyRating ?? 2, n.navalFocus, expeditionary), mix.naval);

  const avail: DesignInfo[] = [];
  for (const id of game.availableDesigns(me)) {
    const info = ctx.design(id);
    if (info) avail.push(info);
  }
  if (avail.length === 0) return;
  const availCats = new Set(avail.map((d) => d.cat));

  // Current composition (count based, including queue).
  let total = 0;
  const cur = new Float64Array(CATEGORY_COUNT);
  for (let c = 0; c < CATEGORY_COUNT; c++) {
    cur[c] = ctx.units.catCount[me * CATEGORY_COUNT + c] + queuedCat[c];
    total += cur[c];
  }
  let wsum = 0;
  for (let c = 0; c < CATEGORY_COUNT; c++) if (availCats.has(c)) wsum += weights[c];
  if (wsum <= 0) return;
  const order: { c: number; gap: number }[] = [];
  for (let c = 0; c < CATEGORY_COUNT; c++) {
    if (!availCats.has(c) || weights[c] <= 0) continue;
    const want = weights[c] / wsum;
    const have = total > 0 ? cur[c] / total : 0;
    order.push({ c, gap: want - have + 0.02 * mem.rng.next() });
  }
  order.sort((a, b) => b.gap - a.gap || a.c - b.c);
  mem.productionPlan += ' | ' + order.slice(0, 4).map((o) => `${UnitCategory[o.c]}:${o.gap.toFixed(2)}`).join(' ');

  let queuedNow = 0;
  let fundLeft = fund;
  let upLeft = headroom;
  const maxNow = war ? 3 : 2;
  for (const { c } of order) {
    if (queuedNow >= maxNow || queuedItems + queuedNow >= maxQueue) break;
    const info = bestDesign(ctx, me, c as UnitCategory, avail);
    if (!info) continue;
    const unitCost = (info.d.cost * (n.costFactor || 1)) / 1000;
    const unitUpkeep = info.d.upkeep * upkeepK;
    let count = n.gdp > 2000 ? 3 : n.gdp > 300 ? 2 : 1;
    count = Math.min(count, Math.floor(fundLeft / Math.max(1e-6, unitCost)), Math.floor(upLeft / Math.max(1e-9, unitUpkeep)));
    if (count < 1) continue;
    let placed = false;
    for (const cityId of candidateCities(ctx, me, info.cls, mem)) {
      if (!game.canBuildUnitAt(me, info.id, cityId).ok) continue;
      if (game.queueUnit(me, info.id, cityId, count).ok) {
        placed = true;
        queuedNow++;
        fundLeft -= unitCost * count;
        upLeft -= unitUpkeep * count;
        remember(mem, hour, 'production', `queued ${count}× ${info.d.name} at ${ctx.state.cities[cityId]?.name}`);
        break;
      }
    }
    if (!placed) ensureMilitaryFacility(ctx, me, mem, info.cls);
  }

  // Military goods shortage while arming: expand arms industry.
  if ((war || prep || mem.threat > 0.5) && mem.deficitDays[Resource.MilitaryGoods] > 7 && hour - mem.lastBuildHour > 24 * 7) {
    if (tryUpgrade(ctx, me, FacilityType.MilitaryFactory, mem, 'arms production') || tryBuild(ctx, me, FacilityType.MilitaryFactory, mem, 'arms production') >= 0) {
      mem.lastBuildHour = hour;
    }
  }
}

const facilityAttempt = new Map<string, number>();

function ensureMilitaryFacility(ctx: AIContext, me: number, mem: NationMemory, cls: UnitClass): void {
  const key = `${me}:${cls}`;
  const last = facilityAttempt.get(key) ?? -1e9;
  if (ctx.state.hour - last < 24 * 20) return;
  facilityAttempt.set(key, ctx.state.hour);
  const type = cls === UnitClass.Naval ? FacilityType.NavalBase : cls === UnitClass.Air ? FacilityType.Airbase : FacilityType.MilitaryFactory;
  const n = ctx.nation(me);
  const def = ctx.state.facilityDefs[type];
  if (!def) return;
  if (n.treasury < (def.cost / 1000) * 2) return;
  if (tryBuild(ctx, me, type, mem, 'no facility to build units') < 0 && type === FacilityType.MilitaryFactory) {
    tryBuild(ctx, me, FacilityType.Barracks, mem, 'no facility to build units');
  }
}
