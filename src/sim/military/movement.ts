/**
 * Hourly movement of land & naval units along their paths: real travel time
 * per step, blocking by enemies and stacking, zone of control, embarking /
 * landing, capture on entry, entrenchment when stationary.
 */
import { STACK_LIMIT, UnitCategory, UnitClass, type Unit, type UnitDesign } from '../types';
import { Terrain } from '../../worldgen/types';
import type { Sim } from '../core';
import { PathSearch, profileFor, stepHours, type MoveProfile } from './pathing';
import { captureHex } from './capture';

export function hostileLandIn(sim: Sim, hex: number, nation: number): boolean {
  for (const o of sim.unitsIn(hex)) {
    if (o.nation !== nation && sim.atWar(nation, o.nation)) {
      const c = sim.design(o).cls;
      if (c === UnitClass.Land && !o.embarked) return true;
    }
  }
  return false;
}

function hostileBlocking(sim: Sim, hex: number, u: Unit, cls: UnitClass): boolean {
  for (const o of sim.unitsIn(hex)) {
    if (o.nation === u.nation || !sim.atWar(u.nation, o.nation)) continue;
    const oc = sim.design(o).cls;
    if (oc === UnitClass.Air) continue;
    if (cls === UnitClass.Naval) { if (oc === UnitClass.Naval && !o.hidden) return true; continue; }
    if (u.embarked) { if (oc === UnitClass.Naval && !o.hidden) return true; if (oc === UnitClass.Land) return true; continue; }
    if (oc === UnitClass.Land || (oc === UnitClass.Naval && !o.hidden && sim.isWater(hex))) return true;
  }
  return false;
}

function friendlyLandCount(sim: Sim, hex: number, nation: number): number {
  let c = 0;
  for (const o of sim.unitsIn(hex)) if (o.nation === nation && sim.design(o).cls === UnitClass.Land) c++;
  return c;
}

function adjacentHostile(sim: Sim, hex: number, nation: number): boolean {
  const nb = sim.grid.neighbours;
  for (let d = 0; d < 6; d++) {
    const m = nb[hex * 6 + d];
    if (m >= 0 && hostileLandIn(sim, m, nation)) return true;
  }
  return false;
}

export function movementHour(sim: Sim, search: PathSearch): void {
  const st = sim.state;
  for (const u of st.units.values()) {
    const d = sim.design(u);
    if (d.cls === UnitClass.Air) continue;
    if (u.path.length === 0) {
      idle(sim, u, d);
      continue;
    }
    step(sim, u, d, search);
  }
}

function idle(sim: Sim, u: Unit, d: UnitDesign): void {
  const g = sim.grid;
  u.x = g.cx[u.hex];
  u.z = g.cz[u.hex];
  u.moveProgress = 0;
  if (d.cls === UnitClass.Land && !u.embarked) {
    const n = sim.state.nations[u.nation];
    const t = sim.terrain[u.hex];
    const cap = t === Terrain.Urban || t === Terrain.Mountains ? 100 : t === Terrain.Forest || t === Terrain.Jungle || t === Terrain.Hills ? 90 : 70;
    const rate = 1.2 * (1 + (n.techMods.entrenchment ?? 0)) * (d.category === UnitCategory.Engineers ? 1.8 : 1);
    if (u.entrenchment < cap) u.entrenchment = Math.min(cap, u.entrenchment + rate);
  }
  if (u.order.type === 'move' || u.order.type === 'retreat' || u.order.type === 'embark') {
    u.order = { type: u.order.type === 'retreat' ? 'idle' : 'idle', targetHex: -1, targetUnit: -1 };
  }
}

function step(sim: Sim, u: Unit, d: UnitDesign, search: PathSearch): void {
  const st = sim.state;
  const grid = sim.grid;
  const n = st.nations[u.nation];
  const cls = d.cls;
  // Indirect-fire units on an attack order stop once the target is in range.
  if (u.order.type === 'attack' && u.order.targetHex >= 0 && d.indirect && cls === UnitClass.Land) {
    if (grid.distance(u.hex, u.order.targetHex) <= Math.max(1, d.rangeGround) && !u.embarked) {
      u.path = [];
      u.moveProgress = 0;
      idle(sim, u, d);
      return;
    }
  }
  const profile: MoveProfile = profileFor(sim, u, cls === UnitClass.Naval ? 'naval' : 'amphibious');
  if (cls === UnitClass.Land) profile.engineers = engineersWith(sim, u);
  let budget = 1;
  let moved = 0;
  const warring = sim.warring.has(u.nation);
  u.entrenchment = Math.max(0, u.entrenchment - 25);
  while (budget > 1e-6 && u.path.length) {
    const next = u.path[0];
    const dir = grid.dirTo(u.hex, next);
    if (dir < 0) { // path broken (teleport / repatriation)
      repath(sim, u, search);
      if (!u.path.length || grid.dirTo(u.hex, u.path[0]) < 0) { u.path = []; break; }
      continue;
    }
    if (warring && hostileBlocking(sim, next, u, cls)) {
      u.blockedHours++;
      if (u.order.type !== 'attack' && u.stance !== 'aggressive' && u.blockedHours > 3) { u.path = []; u.order = { type: 'idle', targetHex: -1, targetUnit: -1 }; }
      break;
    }
    if (cls === UnitClass.Land && !sim.isWater(next) && friendlyLandCount(sim, next, u.nation) >= STACK_LIMIT && u.path.length === 1) {
      u.blockedHours++;
      if (u.blockedHours > 8) u.path = [];
      break;
    }
    let cost = stepHours(sim, profile, u.hex, next, dir);
    if (cost === Infinity) {
      if (u.blockedHours++ < 2) { repath(sim, u, search); continue; }
      u.path = [];
      break;
    }
    if (u.fuel <= 0) cost *= 4;
    if (warring && cls === UnitClass.Land && adjacentHostile(sim, u.hex, u.nation) && adjacentHostile(sim, next, u.nation)) cost *= 2;
    if (u.order.type === 'retreat') cost *= 0.8;
    const remaining = (1 - u.moveProgress) * cost;
    if (budget >= remaining) {
      budget -= remaining;
      moved += remaining;
      u.path.shift();
      u.moveProgress = 0;
      u.blockedHours = 0;
      enter(sim, u, d, next);
      if (!st.units.has(u.id)) return;
    } else {
      u.moveProgress += budget / cost;
      moved += budget;
      budget = 0;
    }
  }
  // Fuel & logistics.
  if (moved > 0) {
    u.fuel = Math.max(0, u.fuel - (moved * 100) / Math.max(1, d.fuelCapacity));
    const w = d.mobility === 'foot' ? 0.002 : d.mobility === 'wheeled' ? 0.006 : d.mobility === 'tracked' ? 0.014 : 0.01;
    sim.milFuel[u.nation] += w * moved * (d.category === UnitCategory.Carrier ? 3 : 1);
  }
  // Render position.
  if (u.path.length) {
    const nx = u.path[0];
    const fx = grid.cx[u.hex], fz = grid.cz[u.hex];
    const tx = grid.cx[nx], tz = grid.cz[nx];
    u.x = fx + (tx - fx) * u.moveProgress;
    u.z = fz + (tz - fz) * u.moveProgress;
    u.heading = Math.atan2(tz - fz, tx - fx);
  } else {
    u.x = grid.cx[u.hex];
    u.z = grid.cz[u.hex];
    if (u.order.type === 'move' || u.order.type === 'retreat' || u.order.type === 'embark') u.order = { type: 'idle', targetHex: -1, targetUnit: -1 };
  }
}

function engineersWith(sim: Sim, u: Unit): boolean {
  for (const o of sim.unitsIn(u.hex)) if (o.nation === u.nation && sim.design(o).category === UnitCategory.Engineers) return true;
  return false;
}

function enter(sim: Sim, u: Unit, d: UnitDesign, hex: number): void {
  const st = sim.state;
  const from = u.hex;
  const g = sim.grid;
  u.heading = Math.atan2(g.cz[hex] - g.cz[from], g.cx[hex] - g.cx[from]);
  sim.setUnitHex(u, hex);
  if (d.cls === UnitClass.Land) {
    const water = sim.isWater(hex);
    if (water && !u.embarked) { u.embarked = true; u.order = { ...u.order, type: u.order.type === 'attack' ? 'attack' : 'embark' }; }
    else if (!water && u.embarked) {
      u.embarked = false;
      u.efficiency = Math.max(10, u.efficiency - 12 * (1 - Math.min(0.8, st.nations[u.nation].techMods.embarkSpeed ?? 0)));
    }
    if (!water && d.canCapture) {
      const o = sim.owner(hex);
      if (o >= 0 && o !== u.nation && sim.atWar(u.nation, o)) captureHex(sim, hex, u.nation, u);
    }
  } else if (d.cls === UnitClass.Naval && d.category === UnitCategory.Carrier) {
    for (const a of st.units.values()) {
      if (a.carrier !== u.id) continue;
      a.baseHex = hex;
      if (!a.airborne) { sim.setUnitHex(a, hex); a.x = g.cx[hex]; a.z = g.cz[hex]; }
    }
  }
}

/** Recompute the path to the unit's current destination (last hex of its path or order target). */
export function repath(sim: Sim, u: Unit, search: PathSearch): void {
  const dest = u.path.length ? u.path[u.path.length - 1] : u.order.targetHex;
  if (dest < 0) { u.path = []; return; }
  const d = sim.design(u);
  const p = profileFor(sim, u, d.cls === UnitClass.Naval ? 'naval' : 'land');
  let path = search.find(u.hex, dest, p);
  if (!path && d.cls === UnitClass.Land) path = search.find(u.hex, dest, { ...p, mode: 'amphibious' });
  u.path = path ?? [];
  u.moveProgress = 0;
}
