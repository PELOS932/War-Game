/** Unit lifecycle helpers: spawn, destroy, power estimates. */
import { UnitCategory, UnitClass, type Nation, type NationId, type Unit, type UnitDesign } from '../types';
import type { Sim } from '../core';
import { makeUnit, UnitNamer } from '../scenario';

export function spawnUnit(sim: Sim, namer: UnitNamer, designId: string, nation: NationId, hex: number): Unit {
  const st = sim.state;
  const n = st.nations[nation];
  const d = st.designs.get(designId)!;
  const u = makeUnit(st, designId, nation, hex, namer.name(st, n, d));
  u.experience = 5 + 20 * n.techLevel;
  u.efficiency = 60;
  if (d.cls === UnitClass.Naval) u.stance = 'aggressive';
  st.units.set(u.id, u);
  sim.addToHex(u, hex);
  sim.markUnitsDirty();
  st.stats.unitsBuilt++;
  sim.emit({ type: 'unitCreated', unit: u.id, nation });
  return u;
}

export function destroyUnit(sim: Sim, u: Unit, killer: Unit | null, quiet = false): void {
  const st = sim.state;
  if (!st.units.has(u.id)) return;
  if (!u.airborne) sim.removeFromHex(u, u.hex);
  st.units.delete(u.id);
  sim.markUnitsDirty();
  st.stats.unitsDestroyed++;
  if (killer) killer.kills++;
  const d = sim.design(u);
  // Record remaining personnel as casualties.
  const lost = (d.personnel * u.strength) / 100;
  recordCasualties(sim, u.nation, lost);
  if (!quiet) sim.emit({ type: 'unitDestroyed', unit: u.id, nation: u.nation, x: u.x, z: u.z });
  // Carrier lost: its parked air wing goes down with it; airborne squadrons must divert.
  if (d.category === UnitCategory.Carrier) {
    for (const a of [...st.units.values()]) {
      if (a.carrier !== u.id) continue;
      if (!a.airborne) destroyUnit(sim, a, killer, quiet);
      else { a.carrier = -1; a.baseHex = -1; }
    }
  }
}

export function recordCasualties(sim: Sim, nation: NationId, personnel: number): void {
  if (!(personnel > 0)) return;
  sim.casualties[nation] += personnel;
  sim.state.nations[nation].casualtiesToday += personnel;
  for (const w of sim.state.wars) {
    if (w.attackers.includes(nation) || w.defenders.includes(nation)) {
      w.casualties[nation] = (w.casualties[nation] ?? 0) + personnel;
      break;
    }
  }
}

/** Combat value of a design (used for power rankings). */
export function designValue(d: UnitDesign): number {
  const atk = Math.max(d.attackSoft, d.attackHard, d.attackAir, d.attackNaval, d.attackSub);
  const def = Math.max(d.defenseGround, d.defenseAir, d.defenseNaval);
  return (atk * 0.7 + def * 0.3) * (1 + 0.15 * (d.generation - 1)) * (d.category === UnitCategory.Carrier ? 3 : 1) / 10;
}

export function militaryPower(sim: Sim, n: NationId): number {
  let p = 0;
  for (const u of sim.nationUnits(n)) {
    const d = sim.design(u);
    p += designValue(d) * (u.strength / 100) * (0.5 + 0.5 * u.efficiency / 100);
  }
  return Math.round(p * 10) / 10;
}

export function refreshNationCounts(sim: Sim): void {
  const st = sim.state;
  const hexCount = new Int32Array(st.nations.length);
  for (let i = 0; i < st.hexOwner.length; i++) {
    const o = st.hexOwner[i];
    if (o && !sim.isWater(i)) hexCount[o - 1]++;
  }
  const cityCount = new Int32Array(st.nations.length);
  for (const c of st.cities) {
    const o = sim.owner(c.hex);
    if (o >= 0) cityCount[o]++;
  }
  for (const n of st.nations) {
    n.hexCount = hexCount[n.id];
    n.cityCount = cityCount[n.id];
    n.unitCount = sim.nationUnits(n.id).length;
    n.power = militaryPower(sim, n.id);
  }
}

export function nationOf(sim: Sim, u: Unit): Nation {
  return sim.state.nations[u.nation];
}
