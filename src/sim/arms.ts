/**
 * Arms trade with INSTANT delivery. Nations can buy any exportable design that
 * another (non-hostile) nation can produce; units appear immediately at the
 * buyer's capital / airbase / port. Existing units can also be sold or gifted.
 */
import type { Sim } from './core';
import { UnitNamer, adjacentWaterHex } from './scenario';
import { spawnUnit } from './military/units';
import { buildable, ownedDesigns } from './designs';
import { FacilityType, STACK_LIMIT, UnitClass, type NationId, type Unit, type UnitDesign } from './types';

export interface Result { ok: boolean; reason?: string }

export interface ArmsOffer {
  seller: NationId;
  designId: string;
  /** Price per unit in billions USD (already includes the relation markup). */
  price: number;
  markup: number;
}

/** Minimum bilateral relation for any arms deal. */
export const MIN_TRADE_RELATION = -10;
export const MAX_PURCHASE = 20;

export function armsMarkup(sim: Sim, buyer: NationId, seller: NationId): number {
  const st = sim.state;
  const rel = st.relations[seller * st.nations.length + buyer] ?? 0;
  let m = 1.3 - rel * 0.003;
  if (sim.hasTreaty(buyer, seller, 'alliance') || sim.hasTreaty(buyer, seller, 'defensePact')) m -= 0.1;
  else if (sim.hasTreaty(buyer, seller, 'trade')) m -= 0.03;
  return Math.max(1.02, Math.min(1.75, m));
}

function relOk(sim: Sim, a: NationId, b: NationId): boolean {
  const st = sim.state;
  if (sim.atWar(a, b)) return false;
  return (st.relations[a * st.nations.length + b] ?? 0) >= MIN_TRADE_RELATION;
}

/** Why `seller` cannot sell `d` to `buyer` (null = allowed). */
export function whyNotSellable(sim: Sim, buyer: NationId, seller: NationId, d: UnitDesign): string | null {
  const st = sim.state;
  const s = st.nations[seller], b = st.nations[buyer];
  if (!s?.alive || !b?.alive || seller === buyer) return 'Invalid trading partner';
  if (!d.real) return 'Not a tradeable design';
  if (d.future && !ownedDesigns(s).has(d.id)) return 'Not yet developed';
  if (d.exportable === false) return 'Export prohibited (sensitive system)';
  if (!ownedDesigns(s).has(d.id)) return `${s.name} does not produce it`;
  if (sim.atWar(buyer, seller)) return 'At war';
  if (!relOk(sim, buyer, seller)) return `${s.name} refuses to deal with you (relations too low)`;
  if (d.exportTo && d.exportTo.length && !d.exportTo.includes(b.code)) return 'Export licence not granted for this customer';
  const o = d.origin ? st.nations.find((x) => x.code === d.origin) : undefined;
  if (o && o.id !== seller && o.alive) {
    if (o.id === buyer) return null;
    if (sim.atWar(buyer, o.id) || !relOk(sim, buyer, o.id)) return `${o.name} blocks re-export of its design`;
  }
  return null;
}

export function offerPrice(sim: Sim, buyer: NationId, seller: NationId, d: UnitDesign): number {
  return (d.cost / 1000) * armsMarkup(sim, buyer, seller);
}

/** All offers available to `buyer` right now. */
export function armsMarket(sim: Sim, buyer: NationId): ArmsOffer[] {
  const st = sim.state;
  const out: ArmsOffer[] = [];
  if (!st.nations[buyer]?.alive) return out;
  for (const s of st.nations) {
    if (!s.alive || s.id === buyer || !s.ownDesigns || !s.ownDesigns.size) continue;
    if (!relOk(sim, buyer, s.id)) continue;
    const markup = armsMarkup(sim, buyer, s.id);
    for (const id of s.ownDesigns) {
      const d = st.designs.get(id);
      if (!d || whyNotSellable(sim, buyer, s.id, d)) continue;
      out.push({ seller: s.id, designId: id, price: (d.cost / 1000) * markup, markup });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------
function landHexNear(sim: Sim, nation: NationId, centre: number, cityId: number): number {
  const st = sim.state;
  const cands: number[] = [centre];
  const c = st.cities[cityId];
  if (c) for (const h of c.urbanHexes) cands.push(h);
  for (let d = 0; d < 6; d++) {
    const m = st.grid.neighbours[centre * 6 + d];
    if (m >= 0 && !sim.isWater(m) && sim.owner(m) === nation) cands.push(m);
  }
  let best = centre, bc = Infinity;
  for (const h of cands) {
    const cnt = sim.unitsIn(h).length;
    if (cnt < bc) { bc = cnt; best = h; }
    if (cnt < 2) break;
  }
  return best;
}

function homeCity(sim: Sim, nation: NationId): number {
  const st = sim.state;
  const n = st.nations[nation];
  const cap = st.cities[n.capitalCity];
  if (cap && sim.owner(cap.hex) === nation) return cap.id;
  let best = -1, bp = -1;
  for (const c of st.cities) if (sim.owner(c.hex) === nation && c.population > bp) { bp = c.population; best = c.id; }
  return best;
}

/** Hex where a newly delivered unit of design d appears for `nation`, or -1. */
export function deliveryHex(sim: Sim, nation: NationId, d: UnitDesign): number {
  const st = sim.state;
  const city = homeCity(sim, nation);
  if (city < 0) return -1;
  const capHex = st.cities[city].hex;
  const dist = (h: number) => st.grid.distance(h, capHex);
  if (d.cls === UnitClass.Air) {
    let best = -1, bd = Infinity;
    for (const f of sim.nationFacilities(nation)) {
      if (f.type !== FacilityType.Airbase || f.constructionDaysLeft > 0 || f.damage >= 0.9 || sim.owner(f.hex) !== nation) continue;
      const dd = dist(f.hex);
      if (dd < bd) { bd = dd; best = f.hex; }
    }
    return best >= 0 ? best : capHex;
  }
  if (d.cls === UnitClass.Naval) {
    let best = -1, bd = Infinity;
    for (const f of sim.nationFacilities(nation)) {
      if (f.type !== FacilityType.NavalBase || f.constructionDaysLeft > 0 || f.damage >= 0.9 || sim.owner(f.hex) !== nation) continue;
      const w = adjacentWaterHex(st, f.hex);
      if (w < 0) continue;
      const dd = dist(f.hex);
      if (dd < bd) { bd = dd; best = w; }
    }
    if (best >= 0) return best;
    for (const c of st.cities) {
      if (!c.port || sim.owner(c.hex) !== nation) continue;
      const w = adjacentWaterHex(st, c.hex);
      const dd = dist(c.hex);
      if (w >= 0 && dd < bd) { bd = dd; best = w; }
    }
    return best;
  }
  return landHexNear(sim, nation, capHex, city);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------
function bump(sim: Sim, a: NationId, b: NationId, delta: number): void {
  const N = sim.state.nations.length;
  const r = sim.state.relations;
  r[a * N + b] = Math.max(-100, Math.min(100, r[a * N + b] + delta));
  r[b * N + a] = Math.max(-100, Math.min(100, r[b * N + a] + delta));
}

function pay(sim: Sim, buyer: NationId, seller: NationId, billions: number, key: string): Result {
  const b = sim.state.nations[buyer];
  const fromFund = Math.min(b.militaryFund, billions);
  if (billions > fromFund + Math.max(0, b.treasury)) return { ok: false, reason: `Insufficient funds ($${billions.toFixed(2)}B needed)` };
  if (fromFund > 0) {
    b.militaryFund -= fromFund;
    const exp = sim.pendingExpenses[buyer];
    exp[key] = (exp[key] ?? 0) + fromFund;
  }
  if (billions > fromFund) sim.spend(buyer, key, billions - fromFund);
  sim.earn(seller, 'Arms Exports', billions);
  return { ok: true };
}

export function buyArms(sim: Sim, namer: UnitNamer, buyer: NationId, seller: NationId, designId: string, count: number): Result & { unitIds?: number[] } {
  const st = sim.state;
  const d = st.designs.get(designId);
  if (!d) return { ok: false, reason: 'Unknown design' };
  count = Math.max(1, Math.min(MAX_PURCHASE, Math.floor(count) || 1));
  const why = whyNotSellable(sim, buyer, seller, d);
  if (why) return { ok: false, reason: why };
  if (deliveryHex(sim, buyer, d) < 0) return { ok: false, reason: d.cls === UnitClass.Naval ? 'You have no port to receive ships' : 'No delivery site' };
  const each = offerPrice(sim, buyer, seller, d);
  const total = each * count;
  const paid = pay(sim, buyer, seller, total, 'Arms Imports');
  if (!paid.ok) return paid;
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    const hex = deliveryHex(sim, buyer, d);
    const u = spawnUnit(sim, namer, d.id, buyer, hex);
    u.experience = Math.min(60, 20 + 25 * st.nations[seller].techLevel);
    u.efficiency = 70;
    if (d.cls === UnitClass.Air) u.baseHex = hex;
    ids.push(u.id);
  }
  bump(sim, buyer, seller, Math.min(12, 1.5 + count * 0.6 + total * 8));
  const b = st.nations[buyer], s = st.nations[seller];
  const imp = b.isPlayer || s.isPlayer ? 2 : 1;
  sim.news('military', `${b.name} buys ${count}× ${d.name} from ${s.name} for $${total.toFixed(2)}B (delivered).`, [buyer, seller], imp, st.units.get(ids[0])?.hex ?? -1);
  return { ok: true, unitIds: ids };
}

/** Estimated fair value (billions) of a set of units. */
export function unitsValue(sim: Sim, unitIds: number[]): number {
  let v = 0;
  for (const id of unitIds) {
    const u = sim.state.units.get(id);
    if (!u) continue;
    const d = sim.design(u);
    v += (d.cost / 1000) * (0.35 + 0.65 * (u.strength / 100)) * (0.55 + 0.45 * (u.efficiency / 100));
  }
  return v;
}

export function expandSale(sim: Sim, seller: NationId, unitIds: number[]): Unit[] {
  const st = sim.state;
  const set = new Map<number, Unit>();
  for (const id of unitIds) {
    const u = st.units.get(id);
    if (u && u.nation === seller) set.set(u.id, u);
  }
  // A carrier takes its embarked air wing along.
  for (const u of st.units.values()) {
    if (u.nation === seller && u.carrier >= 0 && set.has(u.carrier)) set.set(u.id, u);
  }
  return [...set.values()];
}

/** Would an AI buyer accept this price for these units? */
export function buyerAccepts(sim: Sim, seller: NationId, buyer: NationId, unitIds: number[], priceB: number): string | null {
  const st = sim.state;
  const b = st.nations[buyer];
  if (!relOk(sim, buyer, seller)) return `${b.name} does not trust you enough (relations too low)`;
  if (b.treasury < priceB) return `${b.name} cannot afford $${priceB.toFixed(2)}B`;
  const fair = unitsValue(sim, unitIds);
  const rel = st.relations[buyer * st.nations.length + seller] ?? 0;
  const willing = fair * (1.05 + rel * 0.002);
  if (priceB > willing + 1e-9) return `${b.name} refuses: asking $${priceB.toFixed(2)}B, they would pay about $${willing.toFixed(2)}B`;
  return null;
}

export function sellUnits(sim: Sim, namer: UnitNamer, seller: NationId, buyer: NationId, unitIds: number[], priceB: number): Result {
  const st = sim.state;
  const s = st.nations[seller], b = st.nations[buyer];
  if (!s?.alive || !b?.alive || seller === buyer) return { ok: false, reason: 'Invalid trading partner' };
  if (sim.atWar(seller, buyer)) return { ok: false, reason: 'Cannot trade with a nation at war with you' };
  if (!(priceB >= 0)) return { ok: false, reason: 'Invalid price' };
  const units = expandSale(sim, seller, unitIds).filter((u) => !u.airborne);
  if (!units.length) return { ok: false, reason: 'No transferable units selected (airborne or not yours)' };
  const ids = units.map((u) => u.id);
  for (const u of units) {
    if (u.inCombat) return { ok: false, reason: `${u.name} is in combat` };
    const d = sim.design(u);
    if (deliveryHex(sim, buyer, d) < 0) return { ok: false, reason: `${b.name} has no site to receive ${d.name}` };
  }
  if (!b.isPlayer) {
    const why = buyerAccepts(sim, seller, buyer, ids, priceB);
    if (why) return { ok: false, reason: why };
  } else if (b.treasury < priceB) return { ok: false, reason: `${b.name} cannot afford $${priceB.toFixed(2)}B` };
  if (priceB > 0) {
    b.treasury -= priceB;
    sim.pendingExpenses[buyer]['Arms Imports'] = (sim.pendingExpenses[buyer]['Arms Imports'] ?? 0) + priceB;
    sim.earn(seller, 'Arms Exports', priceB);
  }
  // Detach the carrier links first (wings sold with their carrier keep the link because both move).
  for (const u of units) {
    const d = sim.design(u);
    if (!u.airborne) sim.removeFromHex(u, u.hex);
    u.nation = buyer;
    const hex = deliveryHex(sim, buyer, d);
    u.hex = hex;
    u.x = st.grid.cx[hex];
    u.z = st.grid.cz[hex];
    sim.addToHex(u, hex);
    u.path = [];
    u.moveProgress = 0;
    u.order = { type: 'idle', targetHex: -1, targetUnit: -1 };
    u.embarked = false;
    u.groupId = -1;
    u.blockedHours = 0;
    u.hidden = false;
    u.entrenchment = 0;
    u.efficiency = Math.max(u.efficiency, 60);
    u.name = namer.name(st, b, d);
    if (d.cls === UnitClass.Air) { u.baseHex = hex; u.carrier = -1; u.airState = 'ready'; u.airTimer = 0; }
    sim.emit({ type: 'unitCreated', unit: u.id, nation: buyer });
  }
  sim.markUnitsDirty();
  bump(sim, seller, buyer, Math.min(15, 1 + units.length * 0.5 + priceB * 5));
  const summary = units.length === 1 ? sim.design(units[0]).name : `${units.length} units`;
  sim.news('military', `${s.name} ${priceB > 0 ? `sells ${summary} to ${b.name} for $${priceB.toFixed(2)}B` : `transfers ${summary} to ${b.name}`} (delivered).`, [seller, buyer], s.isPlayer || b.isPlayer ? 2 : 1, units[0].hex);
  return { ok: true };
}

/** Licence: the buyer may produce the design domestically from now on. */
export function licenseFee(sim: Sim, buyer: NationId, seller: NationId, d: UnitDesign): number {
  return (d.cost / 1000) * 12 * armsMarkup(sim, buyer, seller);
}

export function licenseDesign(sim: Sim, buyer: NationId, seller: NationId, designId: string): Result {
  const st = sim.state;
  const d = st.designs.get(designId);
  if (!d) return { ok: false, reason: 'Unknown design' };
  const why = whyNotSellable(sim, buyer, seller, d);
  if (why) return { ok: false, reason: why };
  const b = st.nations[buyer];
  if (ownedDesigns(b).has(designId)) return { ok: false, reason: 'Already in production' };
  if (b.techLevel < 0.25 && d.cost > 150) return { ok: false, reason: `${b.name} lacks the industrial base for licensed production` };
  const fee = licenseFee(sim, buyer, seller, d);
  const paid = pay(sim, buyer, seller, fee, 'Licence Fees');
  if (!paid.ok) return paid;
  ownedDesigns(b).add(designId);
  buildable(st, b);
  bump(sim, buyer, seller, 4);
  sim.news('military', `${b.name} acquires a production licence for the ${d.name} from ${st.nations[seller].name} ($${fee.toFixed(2)}B).`, [buyer, seller], b.isPlayer || st.nations[seller].isPlayer ? 2 : 1);
  return { ok: true };
}

void STACK_LIMIT;
