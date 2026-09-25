/**
 * Daily national economy (Supreme Ruler style):
 *  1. facilities produce (limited by damage, input availability, demand),
 *  2. population / industry / military / construction consume from stock,
 *  3. auto trade orders go to the world market (market.ts),
 *  4. finances: taxes, spending, trade, interest, bonds, credit rating,
 *  5. macro: GDP (services + goods), growth, unemployment, inflation,
 *     approval, literacy, law & order, population.
 * All money in billions USD, resources in units/day.
 */
import {
  FacilityType, RESOURCE_COUNT, Resource,
  type Facility, type Nation, type Spending, type Taxes,
} from './types';
import { isDemocratic } from '../worldgen/types';
import type { Sim } from './core';
import { clamp } from './core';
import { BASE_PRICE, MarketBook, clearMarket, planTrade } from './market';

const R = Resource;
/** Industry goods consumed per $M of facility construction cost. */
export const IG_PER_COST = 0.06;

// ---------------------------------------------------------------------------
// Demand
// ---------------------------------------------------------------------------
/** Household (population + services sector) demand per day. */
export function householdDemand(n: Nation, out: Float64Array): Float64Array {
  const gdpDay = (n.gdp / 365) * 1000; // USD M per day
  const pop = n.population;
  const dev = n.development;
  const m = n.techMods;
  out.fill(0);
  out[R.Agriculture] = 1.2 * pop * (0.5 + 1.0 * dev);
  out[R.Rubber] = 0.00012 * gdpDay;
  out[R.Timber] = 0.0015 * gdpDay + 0.03 * pop;
  out[R.Petroleum] = (0.0055 * gdpDay + 0.06 * pop) * Math.max(0.3, 1 + (m.petroleumDemand ?? 0));
  out[R.Coal] = 0.0005 * gdpDay;
  out[R.ElectricPower] = (0.018 * gdpDay + 0.25 * pop) * Math.max(0.3, 1 + (m.powerDemand ?? 0));
  out[R.ConsumerGoods] = (0.05 * gdpDay) / 3 + 0.08 * pop;
  out[R.IndustryGoods] = 0.0048 * gdpDay;
  return out;
}

/** Output multiplier of a facility type from tech effects. */
export function outputMult(type: FacilityType, m: Record<string, number>): number {
  switch (type) {
    case FacilityType.Farm: return 1 + (m.agriOutput ?? 0);
    case FacilityType.Plantation: return 1 + (m.rubberOutput ?? 0);
    case FacilityType.LumberMill: return 1 + (m.timberOutput ?? 0);
    case FacilityType.OilWell: return 1 + (m.oilOutput ?? 0);
    case FacilityType.OffshorePlatform: return 1 + (m.oilOutput ?? 0) * 0.5 + (m.offshoreOutput ?? 0);
    case FacilityType.CoalMine: case FacilityType.OreMine: case FacilityType.UraniumMine: return 1 + (m.miningOutput ?? 0);
    case FacilityType.PowerPlant: case FacilityType.HydroDam: return 1 + (m.powerOutput ?? 0);
    case FacilityType.NuclearPlant: return 1 + (m.powerOutput ?? 0) + (m.nuclearOutput ?? 0);
    case FacilityType.RenewablePlant: return 1 + (m.powerOutput ?? 0) + (m.renewableOutput ?? 0);
    case FacilityType.ConsumerFactory: return 1 + (m.consumerOutput ?? 0);
    case FacilityType.IndustrialPlant: return 1 + (m.industryOutput ?? 0);
    case FacilityType.MilitaryFactory: return 1 + (m.militaryOutput ?? 0);
    default: return 1;
  }
}

// ---------------------------------------------------------------------------
// Policy aggregates
// ---------------------------------------------------------------------------
export function compliance(n: Nation): number {
  return (0.45 + 0.55 * n.development) * (0.9 + 0.1 * clamp(n.lawOrder / 60, 0, 1.5)) * (1 + (n.techMods.taxEfficiency ?? 0));
}

/** Nominal tax take as a fraction of GDP before compliance. */
export function nominalTaxRate(t: Taxes): number {
  return t.income * 0.5 + t.corporate * 0.12 + t.sales * 0.5;
}

export function socialSpending(s: Spending): number {
  return s.health + s.education + s.family + s.socialAssistance + s.culture + s.environment;
}

export function totalSpending(s: Spending): number {
  return s.health + s.education + s.infrastructure + s.environment + s.family + s.lawEnforcement + s.culture + s.socialAssistance;
}

/** Interest rate the market charges for new debt. */
export function marketRate(n: Nation): number {
  const r = 0.01 + 0.13 * Math.pow(1 - n.creditRating / 100, 1.5) + 0.3 * Math.max(0, n.inflation - 0.02) + (n.techMods.interestRate ?? 0);
  return clamp(r, 0.002, 0.4);
}

/** Maximum debt/GDP the market will finance. */
export function debtCeiling(n: Nation): number {
  return Math.max(n.baseline.debtRatio * 1.15, 0.4 + 2.6 * (n.creditRating / 100) ** 1.3);
}

export function issueBonds(n: Nation, billions: number): boolean {
  if (!(billions > 0)) return false;
  if ((n.debt + billions) / Math.max(1, n.gdp) > debtCeiling(n)) return false;
  const rate = marketRate(n);
  n.interestRate = (n.interestRate * n.debt + rate * billions) / (n.debt + billions);
  n.debt += billions;
  n.treasury += billions;
  return true;
}

export function repayDebt(n: Nation, billions: number): boolean {
  const amt = Math.min(billions, n.debt, Math.max(0, n.treasury));
  if (!(amt > 0)) return false;
  n.debt -= amt;
  n.treasury -= amt;
  return true;
}

/** Unit upkeep in billions/day (includes DEFCON readiness costs). */
export function unitUpkeep(sim: Sim, n: Nation): number {
  let m = 0;
  for (const u of sim.nationUnits(n.id)) m += sim.design(u).upkeep;
  return (m * n.upkeepFactor * defconUpkeepMult(n.defcon)) / 1000;
}

export function defconUpkeepMult(defcon: number): number {
  return 1 + 0.12 * (5 - defcon);
}

// ---------------------------------------------------------------------------
// Daily tick
// ---------------------------------------------------------------------------
const tmpHouse = new Float64Array(RESOURCE_COUNT);
const tmpReq = new Float64Array(RESOURCE_COUNT);
const tmpProd = new Float64Array(RESOURCE_COUNT);

export function economyDay(sim: Sim, book: MarketBook): void {
  const st = sim.state;
  book.reset();
  for (const n of st.nations) {
    if (!n.alive) continue;
    produceAndConsume(sim, n, book);
  }
  clearMarket(sim, book);
  const dayNum = Math.floor(st.hour / 24);
  for (const n of st.nations) {
    if (!n.alive) continue;
    finances(sim, n);
    macro(sim, n);
  }
  if (dayNum === 7) calibrateServices(sim);
}

function produceAndConsume(sim: Sim, n: Nation, book: MarketBook): void {
  const defs = sim.state.facilityDefs;
  const sat = sim.satSmooth[n.id];
  const m = n.techMods;
  const prod = tmpProd.fill(0);
  const req = tmpReq.fill(0);
  const house = householdDemand(n, tmpHouse);
  // Stock-days of each product (throttle when storage overflows).
  const throttle = new Float64Array(RESOURCE_COUNT).fill(1);
  for (let r = 0; r < RESOURCE_COUNT; r++) {
    const dem = Math.max(n.demand[r], 0.01);
    const days = n.stock[r] / dem;
    if (days > 300) throttle[r] = 0.35;
    else if (days > 180) throttle[r] = 0.7;
  }
  let jobs = 0;
  let labLevels = 0;
  for (const f of sim.nationFacilities(n.id)) {
    if (f.constructionDaysLeft > 0) { f.efficiency = 0; continue; }
    const def = defs[f.type];
    let eff = 1 - f.damage;
    for (const k in def.inputs) {
      const r = +k;
      eff *= Math.min(1, 0.15 + 0.85 * sat[r]);
    }
    if (def.produces !== null) eff *= throttle[def.produces];
    if (eff < 0) eff = 0;
    f.efficiency = eff;
    const lvl = f.level;
    if (def.produces !== null) prod[def.produces] += def.output * lvl * eff * outputMult(f.type, m);
    for (const k in def.inputs) req[+k] += (def.inputs[+k as Resource] ?? 0) * lvl * eff;
    jobs += def.workers * lvl * (eff > 0.05 ? 1 : 0.3);
    if (f.type === FacilityType.ResearchLab) labLevels += lvl * eff;
  }
  (n as NationScratch)._labLevels = labLevels;
  (n as NationScratch)._jobs = jobs / 1000; // millions
  // Household demand.
  for (let r = 0; r < RESOURCE_COUNT; r++) req[r] += house[r];
  // Military: idle upkeep consumption + activity accumulated hourly.
  let idleFuel = 0, idleAmmo = 0;
  for (const u of sim.nationUnits(n.id)) {
    const d = sim.design(u);
    const w = d.mobility === 'foot' ? 0.004 : d.mobility === 'wheeled' ? 0.012 : d.mobility === 'tracked' ? 0.025 : 0.05;
    idleFuel += w * (d.category === 21 ? 3 : 1);
    idleAmmo += d.militaryGoodsCost * 0.0004;
  }
  const fuelUse = (idleFuel + sim.milFuel[n.id]) * Math.max(0.3, 1 + (m.fuelUse ?? 0));
  req[R.Petroleum] += fuelUse;
  req[R.MilitaryGoods] += idleAmmo + sim.milAmmo[n.id];
  sim.milFuel[n.id] = 0;
  sim.milAmmo[n.id] = 0;
  // Construction (industry goods) and unit production (military goods).
  let constrIG = 0;
  for (const f of sim.nationFacilities(n.id)) {
    if (f.constructionDaysLeft > 0) constrIG += (defs[f.type].cost * IG_PER_COST) / Math.max(1, f.constructionTotal);
  }
  req[R.IndustryGoods] += constrIG;
  let prodMG = 0;
  for (const p of n.productionQueue) {
    const d = sim.state.designs.get(p.design);
    if (d) prodMG += d.militaryGoodsCost / Math.max(1, p.totalDays);
  }
  req[R.MilitaryGoods] += prodMG;

  // Allocate available goods.
  for (let r = 0; r < RESOURCE_COUNT; r++) {
    const avail = n.stock[r] + prod[r];
    const want = req[r];
    const used = Math.min(avail, want);
    let stock = avail - used;
    const s = want > 1e-9 ? used / want : 1;
    // Electricity barely stores; other goods spoil beyond ~2 years of demand.
    if (r === R.ElectricPower) stock = Math.min(stock, Math.max(want, prod[r]) * 3);
    else stock = Math.min(stock, Math.max(want, prod[r], 1) * 720);
    n.stock[r] = stock;
    n.production[r] = prod[r];
    n.consumption[r] = used;
    n.demand[r] = want;
    n.satisfaction[r] = s;
    sat[r] = sat[r] * 0.5 + s * 0.5;
    n.traded[r] = 0;
    book.worldProd[r] += prod[r];
    book.worldCons[r] += used;
  }
  planTrade(sim, n, book);
}

interface NationScratch extends Nation { _labLevels?: number; _jobs?: number; _deficit?: number }

export function labLevels(n: Nation): number {
  return (n as NationScratch)._labLevels ?? 0;
}

function finances(sim: Sim, n: Nation): void {
  // Pending maps already hold today's market trades, construction, procurement,
  // aid etc. (applied to the treasury when they happened).
  const inc = sim.pendingIncome[n.id];
  const exp = sim.pendingExpenses[n.id];
  const credit = (k: string, v: number) => { if (v > 0) { inc[k] = (inc[k] ?? 0) + v; n.treasury += v; } };
  const debit = (k: string, v: number) => { if (v > 0) { exp[k] = (exp[k] ?? 0) + v; n.treasury -= v; } };
  const gdpDay = n.gdp / 365;
  const c = compliance(n);
  credit('Income Tax', n.taxes.income * 0.5 * c * gdpDay);
  credit('Corporate Tax', n.taxes.corporate * 0.12 * c * gdpDay);
  credit('Sales Tax', n.taxes.sales * 0.5 * c * gdpDay);
  credit('Other Revenue', 0.015 * gdpDay);
  credit('Services & Tourism', n.servicesIncome / 365);
  const s = n.spending;
  debit('Health', s.health * gdpDay);
  debit('Education', s.education * gdpDay);
  debit('Infrastructure', s.infrastructure * gdpDay);
  debit('Environment', s.environment * gdpDay);
  debit('Family', s.family * gdpDay);
  debit('Law Enforcement', s.lawEnforcement * gdpDay);
  debit('Culture', s.culture * gdpDay);
  debit('Social Assistance', s.socialAssistance * gdpDay);
  debit('Research', n.researchBudget * gdpDay);
  debit('Debt Interest', (n.debt * n.interestRate) / 365);
  // State-run facilities upkeep (military, research).
  let facUp = 0;
  const defs = sim.state.facilityDefs;
  for (const f of sim.nationFacilities(n.id)) {
    const d = defs[f.type];
    if (d.military || f.type === FacilityType.ResearchLab) facUp += d.upkeep * f.level;
  }
  debit('Facility Upkeep', facUp / 1000);
  // Military allocation pays unit upkeep; the rest accrues to the procurement fund.
  const alloc = n.militaryBudget * gdpDay;
  const upkeep = unitUpkeep(sim, n);
  let milSpend = alloc;
  n.militaryFund += alloc - upkeep;
  const fundCap = n.militaryBudget * n.gdp * 0.6 + 0.5;
  if (n.militaryFund > fundCap) { milSpend -= n.militaryFund - fundCap; n.militaryFund = fundCap; }
  debit('Military', Math.max(0, milSpend));
  if (n.militaryFund < 0) {
    debit('Military Overrun', -n.militaryFund);
    n.militaryFund = 0;
  }
  n.income = inc;
  n.expenses = exp;
  sim.pendingIncome[n.id] = {};
  sim.pendingExpenses[n.id] = {};
  let totalInc = 0, totalExp = 0;
  for (const k in inc) totalInc += inc[k];
  for (const k in exp) totalExp += exp[k];
  const sc = n as NationScratch;
  sc._deficit = (sc._deficit ?? (totalExp - totalInc)) * 0.95 + (totalExp - totalInc) * 0.05;
  n.tradeBalance = (inc['Resource Exports'] ?? 0) - (exp['Resource Imports'] ?? 0);
  // Automatic bond issuance keeps the treasury solvent while credit allows.
  if (n.treasury < 0) {
    const need = -n.treasury + n.gdp * 0.002;
    if (!issueBonds(n, need)) {
      const room = debtCeiling(n) * n.gdp - n.debt;
      if (room > 0) issueBonds(n, room);
    }
  } else if (n.treasury > n.gdp * 0.12 && n.debt > 0 && !n.isPlayer) {
    repayDebt(n, (n.treasury - n.gdp * 0.1) * 0.05);
  }
}

/** Deficit (billions/day, smoothed). */
export function smoothedDeficit(n: Nation): number {
  return (n as NationScratch)._deficit ?? 0;
}

function macro(sim: Sim, n: Nation): void {
  const b = n.baseline;
  const m = n.techMods;
  const sat = n.satisfaction;
  const dem = isDemocratic(n.government);
  // ---- GDP ----
  const tb = nominalTaxRate(n.taxes) * compliance(n);
  const warring = sim.warring.has(n.id);
  const occupiedCities = coreCityLoss(sim, n);
  let g = b.trendGrowth
    + (m.gdpGrowth ?? 0)
    + 0.6 * (n.spending.infrastructure - b.infrastructure)
    + 0.3 * (n.spending.education - b.education)
    - 0.35 * (tb - b.taxBurden)
    - 0.08 * (1 - sat[R.ElectricPower]) - 0.05 * (1 - sat[R.Petroleum]) - 0.03 * (1 - sat[R.ConsumerGoods]) - 0.03 * (1 - sat[R.IndustryGoods])
    - 0.04 * (1 - sat[R.Agriculture])
    - (warring ? 0.01 + 0.004 * (5 - n.defcon) : 0)
    - 0.25 * occupiedCities
    - 0.03 * Math.max(0, (45 - n.approval) / 45)
    + 0.25 * (n.creditRating - b.creditRating) / 100
    + n.growthShock;
  if (n.treasury < 0) g -= 0.04;
  g = clamp(g, -0.25, 0.15);
  n.growthShock *= 0.99;
  n.gdpServices *= Math.pow(1 + g, 1 / 365);
  let goods = 0;
  const price = sim.state.market.price;
  for (let r = 0; r < RESOURCE_COUNT; r++) goods += n.production[r] * (0.5 * BASE_PRICE[r] + 0.5 * price[r]);
  n.gdpGoods = (goods * 365 / 1000) * b.goodsMult;
  const prevGdp = n.gdp;
  n.gdp = Math.max(0.05, n.gdpServices + n.gdpGoods);
  const goodsTrend = prevGdp > 0 ? Math.log(n.gdp / prevGdp) * 365 : 0;
  n.gdpGrowth = n.gdpGrowth * 0.9 + 0.1 * (0.9 * g + 0.1 * clamp(goodsTrend, -0.3, 0.3));
  // ---- population ----
  const popG = 0.025 * (1 - n.development) ** 2 - 0.002;
  n.population = Math.max(0.01, n.population * Math.pow(1 + popG, 1 / 365) - n.casualtiesToday / 1e6);
  n.laborForce = n.population * 0.47;
  // ---- unemployment ----
  const jobs = (n as NationScratch)._jobs ?? b.facilityJobs;
  let personnel = 0;
  for (const u of sim.nationUnits(n.id)) personnel += sim.design(u).personnel * u.strength / 100;
  const uTarget = clamp(
    b.unemployment + (b.facilityJobs - jobs) / Math.max(0.1, n.laborForce) * 0.6
    + 0.4 * (b.trendGrowth - g) + (m.unemployment ?? 0)
    - 0.5 * Math.max(0, personnel / 1e6 - n.baseline.gdp * 0) / Math.max(0.1, n.laborForce) * 0,
    0.01, 0.6);
  n.unemployment += (uTarget - n.unemployment) * 0.02;
  // ---- inflation ----
  const deficitRatio = (smoothedDeficit(n) * 365) / Math.max(1, n.gdp);
  const infTarget = b.inflation
    + 0.3 * Math.max(0, deficitRatio - 0.04)
    + 0.12 * (1 - sat[R.ConsumerGoods]) + 0.08 * (1 - sat[R.Agriculture]) + 0.05 * (1 - sat[R.Petroleum])
    + (n.treasury < 0 ? 0.1 : 0)
    - (m.inflationControl ?? 0) * 0.02;
  n.inflation += (clamp(infTarget, -0.02, 2) - n.inflation) * 0.01;
  // ---- credit rating ----
  const debtRatio = n.debt / Math.max(1, n.gdp);
  const crTarget = clamp(
    b.creditRating
    - 45 * Math.max(0, debtRatio - b.debtRatio - 0.05)
    - 250 * Math.max(0, deficitRatio - 0.05)
    + 150 * (g - b.trendGrowth)
    - (n.treasury < 0 ? 25 : 0)
    - (warring ? 5 : 0),
    2, 100);
  n.creditRating += (crTarget - n.creditRating) * 0.01;
  // ---- literacy / law & order ----
  const litT = clamp(b.literacy + 1.5 * (n.spending.education - b.education) + (m.literacy ?? 0), 0.2, 0.998);
  n.literacy += (litT - n.literacy) * 0.002;
  const lawT = clamp(b.lawOrder + 800 * (n.spending.lawEnforcement - b.lawEnforcement) + 0.25 * (n.approval - b.approval) + (m.lawOrder ?? 0) - 0.15 * n.warWeariness, 0, 100);
  n.lawOrder += (lawT - n.lawOrder) * 0.02;
  // ---- war weariness ----
  if (warring) {
    n.warWeariness += 0.04 + n.casualtiesToday / Math.max(1, n.population * 150) + occupiedCities * 0.4;
    n.warWeariness *= 1 + (m.warWeariness ?? 0) * 0.01;
  } else {
    n.warWeariness -= 0.35;
  }
  n.warWeariness = clamp(n.warWeariness, 0, 100);
  // ---- approval ----
  const social = socialSpending(n.spending);
  const head = n.ministers.find((x) => x.role === 'head');
  let aT = b.approval
    + clamp(250 * (n.gdpGrowth - b.trendGrowth), -12, 10)
    - 150 * (n.unemployment - b.unemployment)
    - 60 * (tb - b.taxBurden)
    + 80 * (social - b.social)
    - 25 * (1 - sat[R.Agriculture]) - 15 * (1 - sat[R.ConsumerGoods]) - 12 * (1 - sat[R.ElectricPower]) - 6 * (1 - sat[R.Petroleum])
    - 100 * Math.max(0, n.inflation - b.inflation - 0.01)
    - 0.35 * n.warWeariness
    - (5 - n.defcon) * (dem ? 1.5 : 0.5)
    + n.rally
    + (m.approval ?? 0)
    + (n.lawOrder - b.lawOrder) * 0.08
    + ((head?.competence ?? 0.5) - 0.5) * 6
    - (n.treasury < 0 ? 8 : 0)
    - 25 * occupiedCities;
  aT = clamp(aT, 1, 99);
  n.approval = clamp(n.approval + (aT - n.approval) * 0.03 + (sim.rng.next() - 0.5) * 0.3, 1, 99);
  n.rally *= 0.985;
  // ---- world opinion ----
  const woT = 50 + 12 * n.ideology;
  n.worldOpinion = clamp(n.worldOpinion + (woT - n.worldOpinion) * 0.004, 0, 100);
  n.casualtiesToday = 0;
}

/** Fraction of the nation's original cities (by population) held by others. */
export function coreCityLoss(sim: Sim, n: Nation): number {
  let total = 0, lost = 0;
  for (const c of sim.state.cities) {
    if (c.originalNation !== n.id) continue;
    total += c.population;
    if (sim.owner(c.hex) !== n.id) lost += c.population;
  }
  return total > 0 ? lost / total : 0;
}

/** At day 7: credit services/tourism income that offsets structural trade deficits. */
function calibrateServices(sim: Sim): void {
  for (const n of sim.state.nations) {
    if (!n.alive) continue;
    const perDay = sim.tradeAccum[n.id] / 7;
    if (perDay < 0) n.servicesIncome += -perDay * 365 * 0.9;
    else n.servicesIncome = Math.max(0, n.servicesIncome - perDay * 365 * 0.5);
    sim.tradeAccum[n.id] = 0;
  }
}

/** Estimated daily facility jobs (millions) for baselines. */
export function facilityJobs(sim: Sim, facs: Facility[]): number {
  let jobs = 0;
  for (const f of facs) if (f.constructionDaysLeft <= 0) jobs += sim.state.facilityDefs[f.type].workers * f.level;
  return jobs / 1000;
}
