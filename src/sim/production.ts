/**
 * Military production: units are paid upfront (from the military fund, then
 * the treasury) and built in parallel at cities with the right facility.
 * Progress each day scales with Military Goods availability.
 */
import { FacilityType, UnitClass, type Nation, type NationId, type UnitDesign } from './types';
import type { Sim } from './core';
import { UnitNamer, adjacentWaterHex } from './scenario';
import { spawnUnit } from './military/units';
import { validBase, carrierAt } from './military/air';

export interface Result { ok: boolean; reason?: string }

export function designAvailable(n: Nation, d: UnitDesign): boolean {
  return !d.requiresTech || n.knownTechs.has(d.requiresTech);
}

export function availableDesigns(sim: Sim, n: Nation): string[] {
  const out: string[] = [];
  for (const d of sim.state.designs.values()) if (designAvailable(n, d)) out.push(d.id);
  return out;
}

/** Unit price in billions for this nation. */
export function unitPrice(n: Nation, d: UnitDesign): number {
  return (d.cost * n.costFactor * Math.max(0.5, 1 + (n.techMods.unitCost ?? 0))) / 1000;
}

function hexesNear(sim: Sim, cityId: number): number[] {
  const c = sim.state.cities[cityId];
  const set = new Set<number>([c.hex, ...c.urbanHexes]);
  for (let d = 0; d < 6; d++) {
    const m = sim.grid.neighbours[c.hex * 6 + d];
    if (m >= 0) set.add(m);
  }
  return [...set];
}

/** Where a unit of design d would appear for a city, or -1 if the city can't build it. */
export function spawnHex(sim: Sim, nation: NationId, d: UnitDesign, cityId: number): number {
  const c = sim.state.cities[cityId];
  if (!c || sim.owner(c.hex) !== nation) return -1;
  const near = hexesNear(sim, cityId);
  const hasFac = (t: FacilityType) => {
    for (const h of near) {
      if (sim.owner(h) !== nation && !sim.isWater(h)) continue;
      for (const f of sim.facilitiesAt(h)) if (f.type === t && f.constructionDaysLeft <= 0 && f.damage < 0.8 && f.nation === nation) return h;
    }
    return -1;
  };
  if (d.cls === UnitClass.Land) {
    if (hasFac(FacilityType.Barracks) >= 0 || hasFac(FacilityType.MilitaryFactory) >= 0) return c.hex;
    return -1;
  }
  if (d.cls === UnitClass.Air) return hasFac(FacilityType.Airbase);
  // Naval: port with a naval base.
  if (!c.port) return -1;
  const nb = hasFac(FacilityType.NavalBase);
  if (nb < 0) return -1;
  return adjacentWaterHex(sim.state, nb);
}

export function canBuildUnitAt(sim: Sim, nation: NationId, designId: string, cityId: number): Result {
  const n = sim.state.nations[nation];
  const d = sim.state.designs.get(designId);
  if (!n?.alive) return { ok: false, reason: 'Invalid nation' };
  if (!d) return { ok: false, reason: 'Unknown design' };
  if (!designAvailable(n, d)) return { ok: false, reason: `Requires ${sim.state.techs.get(d.requiresTech!)?.name ?? d.requiresTech}` };
  const c = sim.state.cities[cityId];
  if (!c || sim.owner(c.hex) !== nation) return { ok: false, reason: 'City not controlled' };
  if (spawnHex(sim, nation, d, cityId) < 0) {
    const need = d.cls === UnitClass.Land ? 'an Army Base or Arms Factory' : d.cls === UnitClass.Air ? 'an Air Base' : 'a port with a Naval Base';
    return { ok: false, reason: `${c.name} needs ${need}` };
  }
  return { ok: true };
}

export function queueUnit(sim: Sim, nation: NationId, designId: string, cityId: number, count: number): Result {
  const chk = canBuildUnitAt(sim, nation, designId, cityId);
  if (!chk.ok) return chk;
  const n = sim.state.nations[nation];
  const d = sim.state.designs.get(designId)!;
  count = Math.max(1, Math.min(50, Math.floor(count) || 1));
  const price = unitPrice(n, d) * count;
  if (price > n.militaryFund + Math.max(0, n.treasury)) return { ok: false, reason: `Insufficient funds ($${price.toFixed(2)}B needed)` };
  const fromFund = Math.min(n.militaryFund, price);
  n.militaryFund -= fromFund;
  const exp = sim.pendingExpenses[nation];
  if (fromFund > 0) exp['Procurement (Military Fund)'] = (exp['Procurement (Military Fund)'] ?? 0) + fromFund;
  if (price > fromFund) sim.spend(nation, 'Military Procurement', price - fromFund);
  const days = Math.max(5, d.buildDays * Math.max(0.4, 1 + (n.techMods.unitBuildTime ?? 0)) * (n.defcon <= 1 ? 0.8 : 1));
  n.productionQueue.push({ id: sim.nextId(), design: designId, cityId, daysLeft: days, totalDays: days, count });
  return { ok: true };
}

export function cancelProduction(sim: Sim, nation: NationId, itemId: number): Result {
  const n = sim.state.nations[nation];
  const i = n.productionQueue.findIndex((p) => p.id === itemId);
  if (i < 0) return { ok: false, reason: 'No such production item' };
  const p = n.productionQueue[i];
  n.productionQueue.splice(i, 1);
  const d = sim.state.designs.get(p.design);
  if (d) {
    const each = unitPrice(n, d);
    const refund = each * (p.count - 1) + each * Math.max(0, p.daysLeft / p.totalDays) * 0.8;
    n.militaryFund += refund;
  }
  return { ok: true };
}

export function productionDay(sim: Sim, namer: UnitNamer): void {
  const st = sim.state;
  for (const n of st.nations) {
    if (!n.alive || !n.productionQueue.length) continue;
    const mg = Math.max(0.15, Math.min(1, n.satisfaction[10]));
    const speed = mg * (n.defcon <= 2 ? 1.1 : 1);
    for (let i = n.productionQueue.length - 1; i >= 0; i--) {
      const p = n.productionQueue[i];
      const d = st.designs.get(p.design);
      const c = st.cities[p.cityId];
      if (!d || !c || sim.owner(c.hex) !== n.id) {
        // City lost: the order is cancelled with a partial refund.
        n.productionQueue.splice(i, 1);
        if (d) n.militaryFund += unitPrice(n, d) * p.count * 0.4;
        continue;
      }
      p.daysLeft -= speed;
      if (p.daysLeft > 0) continue;
      const hex = spawnHex(sim, n.id, d, p.cityId);
      if (hex < 0) { p.daysLeft = 1; continue; } // facility destroyed: wait
      const u = spawnUnit(sim, namer, d.id, n.id, hex);
      if (d.cls === UnitClass.Air) {
        u.baseHex = hex;
        if (!validBase(sim, n.id, hex, d)) {
          const cv = carrierAt(sim, n.id, hex);
          if (cv >= 0) u.carrier = cv;
        }
      }
      if (n.isPlayer) sim.news('military', `A new ${d.name} (${u.name}) has been commissioned at ${c.name}.`, [n.id], 1, hex);
      p.count--;
      if (p.count <= 0) n.productionQueue.splice(i, 1);
      else p.daysLeft = p.totalDays * 0.35;
    }
  }
}
