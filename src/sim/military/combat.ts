/**
 * Hourly ground & naval combat. Every unit of a warring nation fires at most
 * once per hour at the best visible enemy within weapon range:
 *
 *   atk = attack[vs target armour] × strength × efficiency × experience × supply × tech
 *   def = defence[vs attacker class] × terrain × entrenchment × efficiency × tech
 *   damage% = 6 × atk/(atk+def) × atk/100 × (naval 2.2) × random(0.7..1.3)
 *
 * Stances: aggressive (or attack order) engages anything in range; defensive
 * and hold only return fire at enemies that are actively fighting; passive and
 * retreating units never fire. Broken units retreat; surrounded, broken,
 * unsupplied units surrender.
 */
import { UnitCategory, UnitClass, type ArmorType, type GameEvent, type Unit, type UnitDesign } from '../types';
import { Terrain } from '../../worldgen/types';
import type { Sim } from '../core';
import { CLOSE_TERRAIN, TERRAIN_DEFENSE } from './pathing';
import { destroyUnit, recordCasualties } from './units';
import { hostileLandIn } from './movement';

export const BASE_DAMAGE = 6;

export function attackVs(d: UnitDesign, armor: ArmorType): number {
  switch (armor) {
    case 'soft': return d.attackSoft;
    case 'hard': return d.attackHard;
    case 'air': return d.attackAir;
    case 'naval': return d.attackNaval;
    case 'sub': return d.attackSub;
  }
}

function techAttack(sim: Sim, u: Unit, d: UnitDesign): number {
  const m = sim.state.nations[u.nation].techMods;
  if (d.category === UnitCategory.MissileLauncher) return (m.missileAttack ?? 0) + (m.landAttack ?? 0) * 0.5;
  if (d.cls === UnitClass.Land) return (m.landAttack ?? 0) + (d.indirect ? (m.artilleryAttack ?? 0) : 0);
  if (d.cls === UnitClass.Naval) return m.navalAttack ?? 0;
  return m.airAttack ?? 0;
}

function techDefense(sim: Sim, u: Unit, d: UnitDesign): number {
  const m = sim.state.nations[u.nation].techMods;
  if (d.cls === UnitClass.Land) return m.landDefense ?? 0;
  if (d.cls === UnitClass.Naval) return m.navalDefense ?? 0;
  return m.airDefense ?? 0;
}

/** Effective armour class of a unit as a target. */
export function targetArmor(sim: Sim, t: Unit, td: UnitDesign): ArmorType {
  if (t.embarked) return 'naval';
  if (td.cls === UnitClass.Air) return t.airborne ? 'air' : 'soft';
  return td.armor;
}

export interface FireResult { damage: number; destroyed: boolean }

/** Resolve one attack of `u` on `t` at hex distance `dist`. */
export function fire(sim: Sim, u: Unit, t: Unit, dist: number, weapon: Extract<GameEvent, { type: 'combat' }>['weapon'], mult = 1): FireResult {
  const st = sim.state;
  const d = sim.design(u), td = sim.design(t);
  const armor = targetArmor(sim, t, td);
  let atk = attackVs(d, armor);
  if (atk <= 0) return { damage: 0, destroyed: false };
  const supplyF = u.supply > 5 ? 0.6 + 0.4 * u.supply / 100 : 0.3;
  atk *= (u.strength / 100) * (0.35 + 0.65 * u.efficiency / 100) * (1 + 0.3 * u.experience / 100) * supplyF * (1 + techAttack(sim, u, d));
  const targetIsGround = td.cls === UnitClass.Land && !t.embarked;
  const tTerrain = sim.terrain[t.hex];
  if (targetIsGround && d.cls === UnitClass.Land && !d.indirect && CLOSE_TERRAIN.has(tTerrain) && (d.mobility === 'tracked' || d.mobility === 'wheeled')) atk *= 0.75;
  if (d.cls === UnitClass.Land && dist === 1 && !d.indirect) {
    const dir = sim.grid.dirTo(u.hex, t.hex);
    if (dir >= 0 && (sim.world.hexRiverEdges[u.hex] >> dir) & 1) atk *= 0.75;
  }
  let def: number;
  if (t.embarked) def = 6;
  else if (td.cls === UnitClass.Air && !t.airborne) def = 12;
  else def = d.cls === UnitClass.Air ? td.defenseAir : d.cls === UnitClass.Naval && td.cls !== UnitClass.Land ? td.defenseNaval : td.defenseGround;
  def *= 1 + techDefense(sim, t, td);
  if (targetIsGround) {
    let terr = TERRAIN_DEFENSE[tTerrain] ?? 1;
    if (tTerrain === Terrain.Urban || sim.cityAt[t.hex] >= 0) terr = Math.max(terr, 1.5) * (1 + (st.nations[t.nation].techMods.urbanCombat ?? 0));
    def *= terr * (1 + 0.5 * t.entrenchment / 100);
  }
  def *= 0.5 + 0.5 * t.efficiency / 100;
  def = Math.max(1, def);
  const ratio = atk / (atk + def);
  let dmg = BASE_DAMAGE * ratio * (atk / 100) * mult * (0.7 + 0.6 * sim.rng.next());
  if ((d.cls === UnitClass.Naval || d.category === UnitCategory.MissileLauncher) && (td.cls === UnitClass.Naval || t.embarked)) dmg *= 2.2;
  if (d.indirect && dist > 1) dmg *= 0.85;
  dmg = Math.min(dmg, t.strength);
  t.strength -= dmg;
  t.efficiency = Math.max(0, t.efficiency - dmg * 0.7);
  t.entrenchment = Math.max(0, t.entrenchment - dmg * 0.5);
  const hour = st.hour;
  u.inCombat = t.inCombat = true;
  u.lastCombatHour = t.lastCombatHour = hour;
  u.supply = Math.max(0, u.supply - (d.indirect ? 3 : 1.5));
  u.efficiency = Math.max(0, u.efficiency - 0.2);
  u.experience = Math.min(100, u.experience + 0.06 * (1 + (st.nations[u.nation].techMods.experienceGain ?? 0)));
  sim.milAmmo[u.nation] += d.militaryGoodsCost * 0.003;
  recordCasualties(sim, t.nation, (td.personnel * dmg) / 100);
  sim.emit({ type: 'combat', attacker: u.id, defender: t.id, fromX: u.x, fromZ: u.z, toX: t.x, toZ: t.z, weapon });
  if (t.strength <= 2) {
    destroyUnit(sim, t, u);
    return { damage: dmg, destroyed: true };
  }
  return { damage: dmg, destroyed: false };
}

/** Is `t` a legitimate, visible target for `u` at distance `dist`? Returns weapon kind or null. */
function canEngage(sim: Sim, u: Unit, d: UnitDesign, t: Unit, dist: number): boolean {
  const td = sim.design(t);
  if (t.airborne) return false;
  if (td.category === UnitCategory.Submarine) {
    if (t.hidden && dist > 1) return false;
    return d.attackSub > 0 && dist <= Math.max(1, d.rangeNaval);
  }
  if (td.cls === UnitClass.Naval || t.embarked) return dist <= d.rangeNaval && attackVs(d, t.embarked ? 'naval' : td.armor) > 0;
  // Land / parked aircraft targets.
  if (d.cls === UnitClass.Naval) return dist <= d.rangeGround && d.rangeGround > 0 && (d.attackSoft > 0 || d.attackHard > 0);
  return dist <= d.rangeGround && d.rangeGround > 0;
}

export function combatHour(sim: Sim): void {
  if (sim.warring.size === 0) return;
  const st = sim.state;
  const hour = st.hour;
  const grid = sim.grid;
  const damaged = new Set<Unit>();
  for (const nation of sim.warring) {
    const units = sim.nationUnits(nation).slice();
    for (const u of units) {
      if (!st.units.has(u.id) || u.airborne || u.embarked) continue;
      if (u.stance === 'passive' || u.order.type === 'retreat') continue;
      const d = sim.design(u);
      if (d.cls === UnitClass.Air) continue;
      const maxR = Math.max(d.rangeGround, d.rangeNaval, d.attackSub > 0 ? 1 : 0);
      if (maxR <= 0) continue;
      const eager = u.stance === 'aggressive' || u.order.type === 'attack';
      const engaged = u.lastCombatHour >= hour - 1;
      let best: Unit | null = null, bestScore = 0, bestDist = 0;
      const consider = (t: Unit, dist: number) => {
        if (t.nation === nation || !sim.atWar(nation, t.nation)) return;
        if (!eager && !engaged && t.lastCombatHour < hour - 1) return;
        if (!canEngage(sim, u, d, t, dist)) return;
        if (!sim.state.nations[nation] || !visibleTo(sim, nation, t)) return;
        const td = sim.design(t);
        const a = attackVs(d, targetArmor(sim, t, td));
        if (a <= 0) return;
        let score = a * (1.2 - t.strength / 250) / (1 + dist * 0.15);
        if (u.order.type === 'attack' && t.hex === u.order.targetHex) score *= 3;
        if (t.lastCombatHour >= hour - 1) score *= 1.3;
        if (score > bestScore) { bestScore = score; best = t; bestDist = dist; }
      };
      grid.forRadius(u.hex, maxR, (h, dist) => {
        const list = sim.hexUnits.get(h);
        if (!list) return;
        for (const t of list) consider(t, dist);
      });
      if (!best) continue;
      const t: Unit = best;
      const weapon = d.cls === UnitClass.Naval ? 'naval' : d.category === UnitCategory.MissileLauncher ? 'missile' : d.indirect ? 'artillery' : 'direct';
      const r = fire(sim, u, t, bestDist, weapon);
      if (!r.destroyed && sim.design(t).cls === UnitClass.Land) damaged.add(t);
    }
  }
  for (const t of damaged) if (st.units.has(t.id)) checkBreak(sim, t);
}

export function visibleTo(sim: Sim, nation: number, t: Unit): boolean {
  return sim.vis ? sim.vis.isVisible(nation, t.hex) : true;
}

/** Broken units try to retreat; trapped ones may surrender. */
export function checkBreak(sim: Sim, u: Unit): void {
  if (u.order.type === 'retreat' || u.order.type === 'hold' || u.stance === 'hold') return;
  if (u.strength >= 30 && u.efficiency >= 20) return;
  const grid = sim.grid;
  let best = -1, bestScore = -Infinity;
  for (let dd = 0; dd < 6; dd++) {
    const m = grid.neighbours[u.hex * 6 + dd];
    if (m < 0 || sim.isWater(m)) continue;
    const o = sim.owner(m);
    if (o >= 0 && o !== u.nation && !sim.canEnterTerritory(u.nation, o)) continue;
    if (o >= 0 && sim.atWar(u.nation, o)) continue;
    if (hostileLandIn(sim, m, u.nation)) continue;
    let threat = 0;
    for (let k = 0; k < 6; k++) {
      const q = grid.neighbours[m * 6 + k];
      if (q >= 0 && hostileLandIn(sim, q, u.nation)) threat++;
    }
    const score = -threat * 10 + sim.state.supply[m] / 10 + (o === u.nation ? 5 : 0);
    if (score > bestScore) { bestScore = score; best = m; }
  }
  if (best >= 0) {
    u.path = [best];
    u.moveProgress = 0;
    u.order = { type: 'retreat', targetHex: best, targetUnit: -1 };
    return;
  }
  // Nowhere to go.
  if (u.supply < 25 || u.strength < 15) surrender(sim, u);
}

export function surrender(sim: Sim, u: Unit): void {
  const st = sim.state;
  const n = st.nations[u.nation];
  if (n.isPlayer || sim.design(u).personnel >= 700) {
    sim.news('military', `The ${n.adjective} ${u.name} has surrendered.`, [u.nation], n.isPlayer ? 2 : 1, u.hex);
  }
  destroyUnit(sim, u, null);
}

/** Daily: encircled, unsupplied, exhausted units may surrender. */
export function encirclementDay(sim: Sim): void {
  if (sim.warring.size === 0) return;
  const grid = sim.grid;
  for (const n of sim.warring) {
    for (const u of sim.nationUnits(n).slice()) {
      const d = sim.design(u);
      if (d.cls !== UnitClass.Land || u.embarked) continue;
      if (u.supply > 8 || u.efficiency > 35) continue;
      let open = false;
      for (let k = 0; k < 6 && !open; k++) {
        const m = grid.neighbours[u.hex * 6 + k];
        if (m < 0 || sim.isWater(m)) continue;
        const o = sim.owner(m);
        if ((o === n || (o >= 0 && sim.isAllied(n, o))) && !hostileLandIn(sim, m, n)) open = true;
      }
      if (!open && sim.rng.chance(0.35)) surrender(sim, u);
    }
  }
}
