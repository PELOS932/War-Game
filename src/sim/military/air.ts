/**
 * Air operations. Squadrons are based at an airbase (or carrier). Missions:
 *  - airStrike: fly to the target (real km at cruise speed), strike once,
 *    fly home, rearm (4 h) and repeat while the target stays hostile.
 *  - airPatrol: loiter over the target (fuel permitting) engaging enemy
 *    aircraft within weapon range, then return, rearm (2 h), repeat.
 *  - airIntercept: stay on alert; scramble against visible enemy aircraft
 *    inside the combat radius of the base.
 *  - rebase: ferry flight to another base.
 * AA units and ships engage aircraft within their air range every hour.
 */
import { FacilityType, UnitCategory, UnitClass, type NationId, type Unit, type UnitDesign } from '../types';
import type { Sim } from '../core';
import { fire, attackVs } from './combat';
import { destroyUnit } from './units';
import { airbaseCapacity } from '../data/facilities';

const REARM_STRIKE = 4;
const REARM_PATROL = 2;

export function airRangeKm(sim: Sim, u: Unit, d: UnitDesign): number {
  return d.rangeKm * (1 + (sim.state.nations[u.nation].techMods.airRange ?? 0));
}

/** Is hex a usable base for this air unit's nation (airbase, carrier, or city for helicopters/drones)? */
export function validBase(sim: Sim, nation: NationId, hex: number, d: UnitDesign | null, carrierId = -1): boolean {
  if (carrierId >= 0) {
    const c = sim.state.units.get(carrierId);
    return !!c && c.nation === nation && c.hex === hex;
  }
  const o = sim.owner(hex);
  if (o < 0 || (o !== nation && !sim.isAllied(nation, o))) return false;
  for (const f of sim.facilitiesAt(hex)) if (f.type === FacilityType.Airbase && f.constructionDaysLeft <= 0 && f.damage < 0.9) return true;
  if (d && (d.category === UnitCategory.Helicopter || d.category === UnitCategory.Drone) && sim.cityAt[hex] >= 0 && o === nation) return true;
  return false;
}

/** Carrier at hex belonging to nation with spare capacity, or -1. */
export function carrierAt(sim: Sim, nation: NationId, hex: number, capacity = 4): number {
  for (const u of sim.unitsIn(hex)) {
    if (u.nation !== nation || sim.design(u).category !== UnitCategory.Carrier) continue;
    let used = 0;
    for (const a of sim.state.units.values()) if (a.carrier === u.id) used++;
    if (used < capacity) return u.id;
  }
  return -1;
}

export function airbaseLoad(sim: Sim, hex: number): { used: number; capacity: number } {
  let cap = 0;
  for (const f of sim.facilitiesAt(hex)) if (f.type === FacilityType.Airbase && f.constructionDaysLeft <= 0) cap += airbaseCapacity(f.level);
  let used = 0;
  for (const u of sim.state.units.values()) if (u.baseHex === hex && u.carrier < 0 && sim.design(u).cls === UnitClass.Air) used++;
  return { used, capacity: cap };
}

/** Nearest valid base within km of (x,z); returns [hex, carrierId] or null. */
export function nearestBase(sim: Sim, u: Unit, maxKm: number): [number, number] | null {
  const d = sim.design(u);
  let best: [number, number] | null = null, bestKm = maxKm;
  for (const f of sim.nationFacilities(u.nation)) {
    if (f.type !== FacilityType.Airbase || f.constructionDaysLeft > 0 || f.damage >= 0.9) continue;
    const km = sim.pointKm(u.x, u.z, sim.grid.cx[f.hex], sim.grid.cz[f.hex]);
    if (km < bestKm) { bestKm = km; best = [f.hex, -1]; }
  }
  for (const c of sim.nationUnits(u.nation)) {
    if (sim.design(c).category !== UnitCategory.Carrier) continue;
    const km = sim.pointKm(u.x, u.z, c.x, c.z);
    if (km < bestKm) { bestKm = km; best = [c.hex, c.id]; }
  }
  if (!best && (d.category === UnitCategory.Helicopter || d.category === UnitCategory.Drone)) {
    for (const c of sim.state.cities) {
      if (sim.owner(c.hex) !== u.nation) continue;
      const km = sim.pointKm(u.x, u.z, c.x, c.z);
      if (km < bestKm) { bestKm = km; best = [c.hex, -1]; }
    }
  }
  return best;
}

function land(sim: Sim, u: Unit, hex: number, carrier: number, rearm: number): void {
  u.airborne = false;
  u.baseHex = hex;
  u.carrier = carrier;
  u.hex = -1;
  sim.setUnitHexForce(u, hex);
  u.x = sim.grid.cx[hex];
  u.z = sim.grid.cz[hex];
  u.airState = 'rearming';
  u.airTimer = rearm;
  u.path = [];
  u.moveProgress = 0;
  u.missionHours = 0;
}

function launch(sim: Sim, u: Unit, target: number): void {
  sim.removeFromHex(u, u.hex);
  u.airborne = true;
  u.airState = 'outbound';
  u.path = [target];
  u.moveProgress = 0;
  u.missionHours = 0;
}

/** Fly toward (tx,tz) for one hour; returns true on arrival. */
function flyToward(sim: Sim, u: Unit, d: UnitDesign, tx: number, tz: number): boolean {
  const km = sim.pointKm(u.x, u.z, tx, tz);
  const speed = d.speedKmh;
  u.heading = Math.atan2(tz - u.z, tx - u.x);
  if (km <= speed) { u.x = tx; u.z = tz; }
  else {
    const f = speed / km;
    u.x += (tx - u.x) * f;
    u.z += (tz - u.z) * f;
  }
  const h = sim.grid.fromWorld(u.x, u.z);
  if (h >= 0) u.hex = h;
  return km <= speed;
}

function missionValid(sim: Sim, u: Unit): boolean {
  const t = u.order.targetHex;
  if (t < 0) return false;
  if (u.order.type === 'airStrike') {
    const o = sim.owner(t);
    if (o >= 0 && sim.atWar(u.nation, o)) return true;
    for (const x of sim.unitsIn(t)) if (sim.atWar(u.nation, x.nation)) return true;
    return false;
  }
  return u.order.type === 'airPatrol' || u.order.type === 'rebase';
}

export function airHour(sim: Sim): void {
  const st = sim.state;
  const airborne: Unit[] = [];
  const g = sim.grid;
  for (const u of [...st.units.values()]) {
    const d = sim.design(u);
    if (d.cls !== UnitClass.Air) continue;
    const n = st.nations[u.nation];
    if (u.airborne) u.missionHours++;
    switch (u.airState) {
      case 'rearming':
        u.airTimer -= 1;
        if (u.airTimer <= 0) u.airState = 'ready';
        break;
      case 'ready': {
        if (!validBase(sim, u.nation, u.baseHex, d, u.carrier)) {
          const nbase = nearestBase(sim, u, airRangeKm(sim, u, d) * 2.5);
          if (nbase) {
            u.order = { type: 'rebase', targetHex: nbase[0], targetUnit: nbase[1] };
          } else {
            destroyUnit(sim, u, null);
            continue;
          }
        }
        if ((u.order.type === 'airStrike' || u.order.type === 'airPatrol' || u.order.type === 'rebase') && missionValid(sim, u)) {
          if (u.order.type === 'rebase') { launch(sim, u, u.order.targetHex); break; }
          if (u.strength >= 25 && u.fuel >= 30) launch(sim, u, u.order.targetHex);
        } else if (u.order.type === 'airStrike') {
          u.order = { type: 'idle', targetHex: -1, targetUnit: -1 };
        }
        break;
      }
      case 'outbound': {
        const t = u.path[0] ?? u.order.targetHex;
        if (t < 0 || (u.order.type !== 'airStrike' && u.order.type !== 'airPatrol' && u.order.type !== 'rebase' && u.order.type !== 'airIntercept')) { u.airState = 'returning'; break; }
        if (flyToward(sim, u, d, g.cx[t], g.cz[t])) {
          if (u.order.type === 'rebase') {
            const cid = u.order.targetUnit >= 0 ? u.order.targetUnit : carrierAt(sim, u.nation, t);
            if (validBase(sim, u.nation, t, d, cid)) {
              land(sim, u, t, cid, 2);
              u.order = { type: 'idle', targetHex: -1, targetUnit: -1 };
            } else u.airState = 'returning';
          } else {
            u.airState = 'onStation';
            const legH = sim.pointKm(g.cx[u.baseHex >= 0 ? u.baseHex : t], g.cz[u.baseHex >= 0 ? u.baseHex : t], g.cx[t], g.cz[t]) / d.speedKmh;
            u.airTimer = u.order.type === 'airPatrol' ? Math.max(1, Math.min(6, d.fuelCapacity * (1 + (n.techMods.airRange ?? 0)) - 2 * legH)) : 1;
          }
        }
        break;
      }
      case 'onStation':
        // Strikes resolve in the combat phase below; patrol loiters.
        break;
      case 'returning': {
        let bx = g.cx[u.baseHex] ?? u.x, bz = g.cz[u.baseHex] ?? u.z;
        if (u.carrier >= 0) {
          const c = st.units.get(u.carrier);
          if (c) { u.baseHex = c.hex; bx = c.x; bz = c.z; } else u.carrier = -1;
        }
        if (u.baseHex < 0 || !validBase(sim, u.nation, u.baseHex, d, u.carrier)) {
          const nb = nearestBase(sim, u, airRangeKm(sim, u, d) * 1.5);
          if (!nb) { destroyUnit(sim, u, null); continue; }
          u.baseHex = nb[0];
          u.carrier = nb[1];
          bx = g.cx[nb[0]];
          bz = g.cz[nb[0]];
        }
        if (flyToward(sim, u, d, bx, bz)) {
          land(sim, u, u.baseHex, u.carrier, u.order.type === 'airPatrol' ? REARM_PATROL : REARM_STRIKE);
        }
        break;
      }
    }
    if (!st.units.has(u.id)) continue;
    if (u.airborne) {
      airborne.push(u);
      sim.milFuel[u.nation] += 0.04;
    } else if (u.airState !== 'outbound') {
      // Rearm & refuel at base.
      u.fuel = Math.min(100, u.fuel + 25);
      u.supply = Math.min(100, u.supply + 20);
      if (u.strength < 100 && st.hour - u.lastCombatHour > 12) u.strength = Math.min(100, u.strength + 0.08);
      if (u.efficiency < 80) u.efficiency = Math.min(80, u.efficiency + 0.5);
    }
  }
  if (sim.warring.size === 0) return;
  scramble(sim, airborne);
  airCombat(sim, airborne);
  strikes(sim, airborne);
}

function scramble(sim: Sim, airborne: Unit[]): void {
  const st = sim.state;
  const hostile = airborne.filter((a) => sim.warring.has(a.nation));
  if (!hostile.length) return;
  for (const nation of sim.warring) {
    for (const u of sim.nationUnits(nation)) {
      if (u.order.type !== 'airIntercept' || u.airState !== 'ready' || u.airborne) continue;
      const d = sim.design(u);
      if (d.attackAir <= 0) continue;
      const range = airRangeKm(sim, u, d);
      let best: Unit | null = null, bestKm = range;
      for (const e of hostile) {
        if (!sim.atWar(nation, e.nation)) continue;
        if (sim.vis && !sim.vis.isVisible(nation, e.hex)) continue;
        const km = sim.pointKm(u.x, u.z, e.x, e.z);
        if (km < bestKm) { bestKm = km; best = e; }
      }
      if (!best) continue;
      const tgt: Unit = best;
      launch(sim, u, tgt.hex);
      u.x = tgt.x; u.z = tgt.z; u.hex = tgt.hex;
      u.airState = 'onStation';
      u.airTimer = 1;
      airborne.push(u);
      void st;
    }
  }
}

function stealthFactor(sim: Sim, t: Unit): number {
  const d = sim.design(t);
  const s = Math.min(0.9, d.stealth + (sim.state.nations[t.nation].techMods.stealth ?? 0));
  return 1 - 0.7 * s;
}

function airCombat(sim: Sim, airborne: Unit[]): void {
  const st = sim.state;
  const targets = airborne.filter((a) => a.airborne && sim.warring.has(a.nation));
  if (!targets.length) return;
  const firedAA = new Set<number>();
  // Surface-based air defence.
  for (const a of targets) {
    if (!st.units.has(a.id)) continue;
    sim.grid.forRadius(a.hex, 4, (h, dist) => {
      if (!st.units.has(a.id)) return;
      const list = sim.hexUnits.get(h);
      if (!list) return;
      for (const s of list) {
        if (firedAA.has(s.id) || s.nation === a.nation || !sim.atWar(s.nation, a.nation)) continue;
        const sd = sim.design(s);
        if (sd.attackAir <= 0 || dist > sd.rangeAir || s.embarked) continue;
        if (sd.rangeAir === 0 && a.airState !== 'onStation') continue; // MANPADS only vs low attackers over the hex
        firedAA.add(s.id);
        const tech = 1 + (st.nations[s.nation].techMods.aaAttack ?? 0);
        const r = fire(sim, s, a, dist, 'aa', 1.4 * tech * stealthFactor(sim, a));
        if (r.destroyed) return;
      }
    });
  }
  // Air-to-air.
  for (const f of airborne) {
    if (!st.units.has(f.id) || !f.airborne) continue;
    const d = sim.design(f);
    if (d.attackAir < 20 || d.rangeAir < 1) continue;
    let best: Unit | null = null, bestScore = 0;
    for (const e of targets) {
      if (!st.units.has(e.id) || e.nation === f.nation || !sim.atWar(f.nation, e.nation)) continue;
      const dist = sim.grid.distance(f.hex, e.hex);
      if (dist > d.rangeAir) continue;
      const score = (attackVs(d, 'air') + 10) / (1 + dist) * (sim.design(e).attackAir > 30 ? 1.3 : 1);
      if (score > bestScore) { bestScore = score; best = e; }
    }
    if (!best) continue;
    const e: Unit = best;
    fire(sim, f, e, sim.grid.distance(f.hex, e.hex), 'air', 1.3 * stealthFactor(sim, e));
  }
}

function strikes(sim: Sim, airborne: Unit[]): void {
  const st = sim.state;
  for (const a of airborne) {
    if (!st.units.has(a.id) || a.airState !== 'onStation') continue;
    if (a.order.type !== 'airStrike') {
      a.airTimer -= 1;
      if (a.airTimer <= 0) a.airState = 'returning';
      continue;
    }
    const d = sim.design(a);
    const hex = a.path[0] ?? a.order.targetHex;
    let best: Unit | null = null, bestScore = 0;
    for (const t of sim.unitsIn(hex)) {
      if (!sim.atWar(a.nation, t.nation) || t.airborne) continue;
      const td = sim.design(t);
      if (td.category === UnitCategory.Submarine && t.hidden) continue;
      const armor = t.embarked ? 'naval' : td.cls === UnitClass.Air ? 'soft' : td.armor;
      const atk = attackVs(d, armor);
      if (atk <= 0) continue;
      const score = atk * (1 + 0.2 * td.generation) * (td.category === UnitCategory.AirDefense ? 1.5 : 1);
      if (score > bestScore) { bestScore = score; best = t; }
    }
    sim.milAmmo[a.nation] += d.militaryGoodsCost * 0.005;
    if (best) {
      fire(sim, a, best, 0, 'air', d.category === UnitCategory.Bomber ? 2.2 : 1.6);
    } else {
      // Infrastructure strike.
      const owner = sim.owner(hex);
      const facs = sim.facilitiesAt(hex).filter((f) => f.nation >= 0 && sim.atWar(a.nation, f.nation) && f.damage < 1);
      const power = Math.max(d.attackSoft, d.attackHard) / 60 * (a.strength / 100) * (d.category === UnitCategory.Bomber ? 2.5 : 1);
      if (facs.length) {
        const f = facs[Math.floor(sim.rng.next() * facs.length)];
        f.damage = Math.min(1, f.damage + 0.06 * power);
        sim.markFacilitiesDirty();
        sim.emit({ type: 'facilityDamaged', facility: f.id, x: f.x, z: f.z });
      }
      const cid = sim.cityAt[hex];
      if (cid >= 0 && owner >= 0 && sim.atWar(a.nation, owner)) {
        const c = st.cities[cid];
        c.damage = Math.min(1, c.damage + 0.01 * power);
        const deaths = c.population * 0.00002 * power * 1000;
        st.nations[owner].population = Math.max(0.01, st.nations[owner].population - deaths / 1e6);
        st.nations[owner].warWeariness = Math.min(100, st.nations[owner].warWeariness + 0.2 * power);
      }
      sim.emit({ type: 'combat', attacker: a.id, defender: -1, fromX: a.x, fromZ: a.z, toX: sim.grid.cx[hex], toZ: sim.grid.cz[hex], weapon: 'air' });
    }
    a.lastCombatHour = st.hour;
    a.airState = 'returning';
  }
}
