/**
 * Finance, economy & trade ministers.
 *  - Finance: taxes, spending, bonds / debt, research budget.
 *  - Trade: per-resource trade policies and emergency purchases.
 *  - Economy: facility construction/upgrades against persistent deficits,
 *    unemployment and energy needs.
 */
import { FacilityType, Resource, RESOURCE_COUNT, RESOURCE_NAMES, type Facility, type Nation, type Spending, type Taxes, type TradePolicy } from '../types';
import { Deposit, Terrain, isDemocratic } from '../../worldgen/types';
import type { AIContext } from './context';
import { remember, type NationMemory } from './memory';

function sumRecord(r: Record<string, number> | undefined): number {
  if (!r) return 0;
  let s = 0;
  for (const k in r) {
    const v = r[k];
    if (Number.isFinite(v)) s += v;
  }
  return s;
}

export interface FinanceView {
  income: number; // billions/day
  expenses: number;
  balance: number;
  reserveTarget: number;
  daysLeft: number; // days until treasury is empty at current balance (Infinity if surplus)
}

export function financeView(n: Nation): FinanceView {
  const income = sumRecord(n.income);
  const expenses = sumRecord(n.expenses);
  const balance = income - expenses;
  const reserveTarget = Math.max(n.gdp / 365 * 12, expenses * 40, 0.05);
  const daysLeft = balance >= 0 ? Infinity : Math.max(0, n.treasury) / -balance;
  return { income, expenses, balance, reserveTarget, daysLeft };
}

interface TaxBounds {
  min: Taxes;
  max: Taxes;
}

function taxBounds(n: Nation): TaxBounds {
  const demo = isDemocratic(n.government);
  return {
    min: { income: 0.05, corporate: 0.05, sales: 0.02 },
    max: demo ? { income: 0.5, corporate: 0.4, sales: 0.25 } : { income: 0.6, corporate: 0.5, sales: 0.3 },
  };
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

// ---------------------------------------------------------------------------
// Finance minister
// ---------------------------------------------------------------------------
/** Debt/GDP the bond market will tolerate (mirrors the credit-rating logic). */
export function debtCeilingEstimate(n: Nation): number {
  const base = n.baseline?.debtRatio ?? 0.6;
  return Math.max(base * 1.15, 0.4 + 2.6 * Math.pow(n.creditRating / 100, 1.3));
}

const startResearch = new WeakMap<Nation, number>();

export function runFinance(ctx: AIContext, me: number, mem: NationMemory): void {
  const game = ctx.game;
  const n = ctx.nation(me);
  const fv = financeView(n);
  const hour = ctx.state.hour;
  const demo = isDemocratic(n.government);
  const minApproval = demo ? 45 : 30;
  const atWar = ctx.atWarAny(me);
  const bounds = taxBounds(n);
  const t = n.taxes;
  const s = n.spending;
  const canTouchTaxes = hour - mem.lastTaxChangeHour >= 72;
  const gdp = Math.max(0.05, n.gdp);
  const debtRatio = n.debt / gdp;
  const ceiling = debtCeilingEstimate(n);
  const canBorrow = debtRatio < ceiling * 0.95;
  // Deficit as a share of GDP (positive = deficit).
  const deficit = (-fv.balance * 365) / gdp;
  // Tolerated structural deficit: like real governments, borrow while debt is sustainable.
  const room = Math.max(0, Math.min(1, (ceiling - debtRatio) / 0.35));
  let tolerated = (demo ? 0.03 : 0.015) * room + (atWar ? 0.03 * room : 0);
  if (n.creditRating < 30) tolerated *= 0.5;

  // 1. Liquidity: keep a cash buffer so the state never defaults.
  if (n.treasury < fv.reserveTarget * 0.3 && canBorrow) {
    const need = Math.max(fv.reserveTarget * 0.6 - n.treasury, fv.balance < 0 ? -fv.balance * 30 : 0);
    const amt = Math.min(need, (ceiling * 0.95 - debtRatio) * gdp, gdp * 0.05);
    if (amt > 0.01 && game.issueBonds(me, round3(amt)).ok) remember(mem, hour, 'finance', `issued ${amt.toFixed(2)}B bonds (treasury ${n.treasury.toFixed(2)}B, debt ${(debtRatio * 100).toFixed(0)}% GDP)`);
  }

  const newTaxes: Partial<Taxes> = {};
  const newSpending: Partial<Spending> = {};
  const approvalOk = n.approval > minApproval + 4;

  if (deficit > tolerated + 0.004 || (n.treasury < 0 && !canBorrow)) {
    // Consolidation: first trim waste, then raise the broad taxes.
    const severe = deficit > tolerated + 0.03 || !canBorrow;
    const cut = severe ? 0.95 : 0.98;
    for (const k of ['culture', 'environment', 'infrastructure'] as const) newSpending[k] = s[k] * cut;
    if (severe && (!atWar || !approvalOk)) newSpending.family = s.family * 0.98;
    if (canTouchTaxes && (approvalOk || severe)) {
      if (t.sales < bounds.max.sales - 0.005) newTaxes.sales = clamp(t.sales + 0.01, bounds.min.sales, bounds.max.sales);
      else if (t.income < bounds.max.income - 0.005) newTaxes.income = clamp(t.income + 0.01, bounds.min.income, bounds.max.income);
      else if (t.corporate < bounds.max.corporate - 0.005) newTaxes.corporate = clamp(t.corporate + 0.01, bounds.min.corporate, bounds.max.corporate);
    }
  } else if (deficit < tolerated - 0.015 && n.treasury > fv.reserveTarget) {
    // Fiscal room: repay expensive debt when very liquid, then invest & buy popularity.
    if (n.debt > 0.01 && n.treasury > fv.reserveTarget * 3 && (n.interestRate ?? 0) > 0.03) {
      const amt = Math.min(n.debt, (n.treasury - fv.reserveTarget * 2) * 0.3);
      if (amt > 0.01 && game.repayDebt(me, round3(amt)).ok) remember(mem, hour, 'finance', `repaid ${amt.toFixed(2)}B debt`);
    }
    if (canTouchTaxes && n.approval < 65) {
      if (t.income > bounds.min.income + 0.01) newTaxes.income = t.income - 0.01;
      else if (t.sales > bounds.min.sales + 0.01) newTaxes.sales = t.sales - 0.01;
    }
    // Growth-oriented investment (infrastructure & education pay back in GDP).
    newSpending.infrastructure = Math.min(0.06, s.infrastructure * 1.02);
    newSpending.education = Math.min(0.08, s.education * 1.01);
    if (n.approval < 60) newSpending.health = Math.min(0.12, s.health * 1.01);
  }

  // 2. Approval management (democracies care more; elections loom).
  if (n.approval < minApproval && deficit < tolerated + 0.02) {
    if (canTouchTaxes && newTaxes.income === undefined && newTaxes.sales === undefined && t.income > bounds.min.income + 0.01) newTaxes.income = t.income - 0.01;
    newSpending.health = Math.min(0.12, (newSpending.health ?? s.health) * 1.02);
    newSpending.socialAssistance = Math.min(0.2, (newSpending.socialAssistance ?? s.socialAssistance) * 1.02);
    if (!demo) newSpending.lawEnforcement = Math.min(0.05, s.lawEnforcement * 1.02);
  }

  if (Object.keys(newTaxes).length && game.setTaxes(me, newTaxes).ok) {
    mem.lastTaxChangeHour = hour;
    remember(mem, hour, 'finance', `taxes ${fmtTaxes({ ...t, ...newTaxes })} (deficit ${(deficit * 100).toFixed(1)}% GDP, tolerated ${(tolerated * 100).toFixed(1)}%, approval ${n.approval.toFixed(0)})`);
  }
  if (Object.keys(newSpending).length) game.setSpending(me, newSpending);

  // 3. Research budget: anchored to the nation's starting effort.
  if (!startResearch.has(n)) startResearch.set(n, n.researchBudget);
  const base = startResearch.get(n) ?? n.researchBudget;
  let f = 1;
  if (deficit > tolerated + 0.01) f = 0.8;
  else if (deficit < tolerated - 0.02 && n.development > 0.5) f = 1.25;
  if (atWar) f *= 0.85;
  const research = clamp(base * f, 0.0005, 0.02);
  if (Math.abs(research - n.researchBudget) > Math.max(0.0003, base * 0.05)) game.setResearchBudget(me, round4(research));
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
function fmtTaxes(t: Taxes): string {
  return `inc ${(t.income * 100).toFixed(0)}% corp ${(t.corporate * 100).toFixed(0)}% sales ${(t.sales * 100).toFixed(0)}%`;
}

// ---------------------------------------------------------------------------
// Trade minister
// ---------------------------------------------------------------------------
const CRITICAL: Resource[] = [Resource.Agriculture, Resource.ElectricPower, Resource.Petroleum, Resource.ConsumerGoods, Resource.IndustryGoods];

export function runTrade(ctx: AIContext, me: number, mem: NationMemory): void {
  const game = ctx.game;
  const n = ctx.nation(me);
  const hour = ctx.state.hour;
  const fv = financeView(n);
  const threatened = ctx.atWarAny(me) || mem.posture === 'prep' || mem.threat > 0.5;
  const price = ctx.state.market.price;
  for (let r = 0; r < RESOURCE_COUNT; r++) {
    const prod = n.production[r] ?? 0;
    const cons = n.consumption[r] ?? 0;
    const stock = n.stock[r] ?? 0;
    const net = prod - cons;
    const stockDays = stock / Math.max(cons, 1e-6);
    let policy: TradePolicy = 'auto';
    if (r === Resource.ElectricPower) policy = 'auto';
    else if (r === Resource.MilitaryGoods && threatened) policy = net < 0 && stockDays < 30 ? 'buy' : 'hold';
    else if (net < -1e-6 && stockDays < 60) policy = 'buy';
    else if (net > 1e-6 && (stockDays > 45 || cons < 1e-6)) policy = 'sell';
    if (n.tradePolicy[r] !== policy) game.setTradePolicy(me, r as Resource, policy);

    // Emergency purchases of critical goods.
    if (CRITICAL.includes(r as Resource) && net < 0 && stockDays < 7 && r !== Resource.ElectricPower) {
      const amount = Math.max(1, -net * 14);
      const cost = (price[r] ?? 0) * amount / 1000; // billions
      if (cost > 0 && cost < Math.max(0, n.treasury) * 0.2) {
        if (game.marketTrade(me, r as Resource, Math.round(amount)).ok) {
          remember(mem, hour, 'trade', `emergency purchase ${Math.round(amount)} ${RESOURCE_NAMES[r]}`);
        }
      }
    }
    // Liquidate big surpluses when broke.
    if (fv.balance < 0 && n.treasury < fv.reserveTarget * 0.3 && net > 0 && stockDays > 120 && r !== Resource.ElectricPower && !(r === Resource.MilitaryGoods && threatened)) {
      const amount = Math.round(Math.min(stock * 0.25, Math.max(1, net * 30)));
      if (amount > 0) game.marketTrade(me, r as Resource, -amount);
    }
  }
}

// ---------------------------------------------------------------------------
// Economy minister: facilities
// ---------------------------------------------------------------------------
function updateDeficits(n: Nation, mem: NationMemory): void {
  for (let r = 0; r < RESOURCE_COUNT; r++) {
    const bal = (n.production[r] ?? 0) - (n.consumption[r] ?? 0);
    mem.balanceEma[r] = mem.balanceEma[r] * 0.8 + bal * 0.2;
    const cons = n.consumption[r] ?? 0;
    const stockDays = (n.stock[r] ?? 0) / Math.max(cons, 1e-6);
    if (mem.balanceEma[r] < -0.03 * cons && stockDays < 120) mem.deficitDays[r] += 1;
    else mem.deficitDays[r] = Math.max(0, mem.deficitDays[r] - 2);
  }
}

const DEPOSIT_FOR: Partial<Record<FacilityType, Deposit>> = {
  [FacilityType.OilWell]: Deposit.Oil,
  [FacilityType.OffshorePlatform]: Deposit.Gas,
  [FacilityType.CoalMine]: Deposit.Coal,
  [FacilityType.OreMine]: Deposit.Ore,
  [FacilityType.UraniumMine]: Deposit.Uranium,
};

export function ownFacilities(ctx: AIContext, me: number): Facility[] {
  const out: Facility[] = [];
  for (const id of ctx.terr.facilities[me] ?? []) {
    const f = ctx.state.facilities.get(id);
    if (f) out.push(f);
  }
  return out;
}

function hexHasFacility(ctx: AIContext, hex: number, type?: FacilityType): boolean {
  const list = ctx.state.hexFacilities.get(hex);
  if (!list || list.length === 0) return false;
  if (type === undefined) return true;
  for (const id of list) if (ctx.state.facilities.get(id)?.type === type) return true;
  return false;
}

/** Candidate sites for a facility type in `me`'s territory, best first. */
export function siteCandidates(ctx: AIContext, me: number, type: FacilityType, limit = 8): number[] {
  const w = ctx.state.world;
  const hexes = ctx.terr.hexes[me] ?? [];
  const scored: { h: number; s: number }[] = [];
  const dep = DEPOSIT_FOR[type];
  const cityHexes = (portOnly: boolean): number[] => {
    const ids = [...(ctx.terr.cities[me] ?? [])]
      .map((id) => ctx.state.cities[id])
      .filter((c) => !portOnly || c.port)
      .sort((a, b) => b.population - a.population || a.id - b.id);
    const out: number[] = [];
    for (const c of ids) {
      out.push(c.hex);
      for (const u of c.urbanHexes) if (u !== c.hex && ctx.owner(u) === me) out.push(u);
      if (out.length >= limit * 3) break;
    }
    return out;
  };
  if (dep !== undefined) {
    if (type === FacilityType.OffshorePlatform) {
      // Offshore deposits: water hexes next to our coast.
      const seen = new Set<number>();
      for (const h of ctx.terr.coastal[me] ?? []) {
        for (let d = 0; d < 6; d++) {
          const j = ctx.grid.neighbours[h * 6 + d];
          if (j < 0 || seen.has(j)) continue;
          seen.add(j);
          if (w.hexDeposit[j] === dep && !hexHasFacility(ctx, j, type)) scored.push({ h: j, s: w.hexDepositSize[j] });
        }
      }
    }
    for (const h of hexes) {
      if (w.hexDeposit[h] === dep && !hexHasFacility(ctx, h, type)) scored.push({ h, s: w.hexDepositSize[h] + 0.001 });
    }
  } else {
    switch (type) {
      case FacilityType.Farm:
        for (const h of hexes) {
          const t = w.hexTerrain[h];
          if ((t === Terrain.Farmland || t === Terrain.Plains) && !hexHasFacility(ctx, h)) scored.push({ h, s: w.hexHabitability[h] + (t === Terrain.Farmland ? 0.5 : 0) + Math.min(1, w.hexPrecip[h] / 1200) });
        }
        break;
      case FacilityType.Plantation:
        for (const h of hexes) {
          const t = w.hexTerrain[h];
          if ((t === Terrain.Jungle || t === Terrain.Forest || t === Terrain.Farmland) && w.hexTemperature[h] > 20 && !hexHasFacility(ctx, h)) scored.push({ h, s: w.hexPrecip[h] / 1000 + w.hexTemperature[h] / 30 });
        }
        break;
      case FacilityType.LumberMill:
        for (const h of hexes) {
          const t = w.hexTerrain[h];
          if ((t === Terrain.Forest || t === Terrain.Jungle) && !hexHasFacility(ctx, h)) scored.push({ h, s: w.hexForest[h] / 255 });
        }
        break;
      case FacilityType.HydroDam:
        for (const h of hexes) {
          const t = w.hexTerrain[h];
          if (w.hexRiverEdges[h] && (t === Terrain.Hills || t === Terrain.Mountains || t === Terrain.Forest) && !hexHasFacility(ctx, h)) scored.push({ h, s: w.hexElevation[h] / 1000 + 1 });
        }
        break;
      case FacilityType.NavalBase:
        return cityHexes(true).filter((h) => !hexHasFacility(ctx, h, type)).slice(0, limit);
      default: {
        // Industrial/energy/military/research facilities go to cities.
        const list = cityHexes(false).filter((h) => !hexHasFacility(ctx, h, type));
        return list.slice(0, limit);
      }
    }
  }
  scored.sort((a, b) => b.s - a.s || a.h - b.h);
  return scored.slice(0, limit).map((x) => x.h);
}

/** Try to build `type` at the best valid site. Returns the hex or -1. */
export function tryBuild(ctx: AIContext, me: number, type: FacilityType, mem: NationMemory, why: string): number {
  const cands = siteCandidates(ctx, me, type, 8);
  for (const h of cands) {
    if (!ctx.game.canBuildFacility(me, type, h).ok) continue;
    const res = ctx.game.buildFacility(me, type, h);
    if (res.ok) {
      const def = ctx.state.facilityDefs[type];
      remember(mem, ctx.state.hour, 'economy', `building ${def?.name ?? type} (${why})`);
      return h;
    }
  }
  return -1;
}

/** Upgrade the best existing facility of `type`. Returns true on success. */
export function tryUpgrade(ctx: AIContext, me: number, type: FacilityType, mem: NationMemory, why: string): boolean {
  const def = ctx.state.facilityDefs[type];
  if (!def) return false;
  const list = ownFacilities(ctx, me)
    .filter((f) => f.type === type && f.constructionDaysLeft <= 0 && f.damage < 0.3 && f.level < def.maxLevel)
    .sort((a, b) => a.level - b.level || a.id - b.id);
  for (const f of list.slice(0, 3)) {
    if (ctx.game.upgradeFacility(me, f.id).ok) {
      remember(mem, ctx.state.hour, 'economy', `upgrading ${def.name} to level ${f.level + 1} (${why})`);
      return true;
    }
  }
  return false;
}

function underConstruction(ctx: AIContext, me: number): number {
  let k = 0;
  for (const f of ownFacilities(ctx, me)) if (f.constructionDaysLeft > 0) k++;
  return k;
}

export function runEconomy(ctx: AIContext, me: number, mem: NationMemory): void {
  const n = ctx.nation(me);
  const hour = ctx.state.hour;
  updateDeficits(n, mem);
  const fv = financeView(n);
  if (hour - mem.lastBuildHour < 24 * 4) return;
  // Construction capacity scales with the economy.
  const maxParallel = n.gdp > 3000 ? 4 : n.gdp > 800 ? 3 : n.gdp > 150 ? 2 : 1;
  if (underConstruction(ctx, me) >= maxParallel) return;
  const defs = ctx.state.facilityDefs;
  const affordable = (type: FacilityType, mult = 2.5): boolean => {
    const def = defs[type];
    if (!def) return false;
    const cost = def.cost / 1000;
    return n.treasury - cost * mult > fv.reserveTarget * 0.5 && (fv.balance >= 0 || fv.daysLeft > 200);
  };

  // Rank resources by persistent deficit severity.
  const cands: { r: Resource; sev: number }[] = [];
  for (let r = 0; r < RESOURCE_COUNT; r++) {
    if (r === Resource.MilitaryGoods) continue; // defence minister handles it
    const cons = n.consumption[r] ?? 0;
    if (mem.deficitDays[r] < 10 || cons <= 0) continue;
    const sev = (-mem.balanceEma[r] / cons) * (r === Resource.ElectricPower || r === Resource.Agriculture ? 1.6 : r === Resource.ConsumerGoods ? 1.3 : 1);
    if (sev > 0.03) cands.push({ r: r as Resource, sev });
  }
  cands.sort((a, b) => b.sev - a.sev || a.r - b.r);

  for (const { r } of cands) {
    const types = facilityTypesFor(ctx, me, r);
    for (const type of types) {
      if (!affordable(type)) continue;
      if (tryUpgrade(ctx, me, type, mem, `${RESOURCE_NAMES[r]} deficit`)) {
        mem.lastBuildHour = hour;
        return;
      }
      if (tryBuild(ctx, me, type, mem, `${RESOURCE_NAMES[r]} deficit`) >= 0) {
        mem.lastBuildHour = hour;
        return;
      }
    }
  }

  // Unemployment: add labour-intensive industry.
  if (n.unemployment > 0.1) {
    const type = (n.production[Resource.ConsumerGoods] ?? 0) <= (n.production[Resource.IndustryGoods] ?? 0) * 1.2 ? FacilityType.ConsumerFactory : FacilityType.IndustrialPlant;
    if (affordable(type) && (tryUpgrade(ctx, me, type, mem, 'unemployment') || tryBuild(ctx, me, type, mem, 'unemployment') >= 0)) {
      mem.lastBuildHour = hour;
      return;
    }
  }

  // Rich & developed: research labs and more industry for growth.
  if (fv.balance > 0 && n.treasury > fv.reserveTarget * 4) {
    const labs = ownFacilities(ctx, me).filter((f) => f.type === FacilityType.ResearchLab).length;
    const wantLabs = Math.round(1 + n.development * 4 + n.gdp / 2000);
    if (labs < wantLabs && affordable(FacilityType.ResearchLab, 4)) {
      if (tryBuild(ctx, me, FacilityType.ResearchLab, mem, 'research capacity') >= 0) {
        mem.lastBuildHour = hour;
        return;
      }
    }
    // Export-oriented growth: upgrade the most valuable producer we own.
    const growth = [FacilityType.IndustrialPlant, FacilityType.ConsumerFactory];
    for (const t of growth) {
      if (affordable(t, 5) && tryUpgrade(ctx, me, t, mem, 'growth investment')) {
        mem.lastBuildHour = hour;
        return;
      }
    }
  }
}

/** Facility types that produce resource r, ordered by suitability for this nation. */
export function facilityTypesFor(ctx: AIContext, me: number, r: Resource): FacilityType[] {
  const n = ctx.nation(me);
  const defs = ctx.state.facilityDefs;
  const out: FacilityType[] = [];
  for (let t = 0; t < defs.length; t++) if (defs[t] && defs[t].produces === r) out.push(t as FacilityType);
  if (r === Resource.ElectricPower) {
    // Fuel-aware ordering of power options.
    const has = (res: Resource) => (n.production[res] ?? 0) > (n.consumption[res] ?? 0) * 1.1;
    const score = (t: FacilityType): number => {
      switch (t) {
        case FacilityType.HydroDam: return 3;
        case FacilityType.NuclearPlant: return n.techLevel > 0.55 && (has(Resource.Uranium) || n.nuclear) ? 2.5 : 0.2;
        case FacilityType.PowerPlant: return has(Resource.Coal) || has(Resource.Petroleum) ? 2.2 : 1.2;
        case FacilityType.RenewablePlant: return 1 + n.development;
        default: return 1;
      }
    };
    out.sort((a, b) => score(b) - score(a) || a - b);
  }
  return out;
}
