/**
 * Territory changes: hex capture by land units (plus unguarded adjacent enemy
 * hexes), liberation of allied core territory, city capture (urban hexes and
 * facilities flip), capital relocation, and nation defeat.
 */
import { UnitClass, type NationId, type Unit } from '../types';
import type { Sim } from '../core';
import { destroyUnit } from './units';
import { endWarsFor } from '../diplomacy';

export function setHexOwner(sim: Sim, hex: number, nation: NationId): void {
  const st = sim.state;
  const prev = st.hexOwner[hex] - 1;
  if (prev === nation) return;
  st.hexOwner[hex] = nation + 1;
  st.hexControlChangedHour[hex] = st.hour;
  st.ownerVersion++;
  st.ownerDirty.push(hex);
  if (st.ownerDirty.length > 200000) st.ownerDirty.splice(0, st.ownerDirty.length - 100000);
  // Facilities on the hex change hands.
  const ids = st.hexFacilities.get(hex);
  if (ids) {
    for (const id of ids) {
      const f = st.facilities.get(id);
      if (f) f.nation = nation;
    }
    sim.markFacilitiesDirty();
  }
  // Supply: seed from friendly neighbours until the next network refresh.
  let best = 0;
  for (let d = 0; d < 6; d++) {
    const m = sim.grid.neighbours[hex * 6 + d];
    if (m >= 0 && st.hexOwner[m] === nation + 1) best = Math.max(best, st.supply[m]);
  }
  st.supply[hex] = Math.max(0, best - 6);
}

/** Owner a hex should go to when `by` takes it from `prev` (liberation of allies' core land). */
function liberator(sim: Sim, hex: number, by: NationId, prev: NationId): NationId {
  const core = sim.state.hexCore[hex] - 1;
  if (core < 0 || core === by || core === prev) return by;
  const cn = sim.state.nations[core];
  if (!cn.alive) return by;
  if (sim.atWar(by, core)) return by;
  if (sim.isAllied(by, core) || sim.coBelligerent(by, core)) return core;
  return by;
}

/** A land unit of `by` takes hex; returns true if ownership changed. */
export function captureHex(sim: Sim, hex: number, by: NationId, unit: Unit | null, spill = true): boolean {
  const st = sim.state;
  const prev = st.hexOwner[hex] - 1;
  if (prev === by || prev < 0 || !sim.atWar(by, prev)) return false;
  const cityId = sim.cityAt[hex];
  const city = cityId >= 0 ? st.cities[cityId] : null;
  if (city && city.hex === hex) {
    captureCity(sim, cityId, by);
  } else {
    const to = liberator(sim, hex, by, prev);
    setHexOwner(sim, hex, to);
    st.stats.hexesCaptured++;
    sim.emit({ type: 'hexCaptured', hex, from: prev, to });
    // Offshore platforms follow the coast.
    if (sim.coast[hex]) flipOffshore(sim, hex, prev, to);
  }
  if (spill) {
    // Unguarded adjacent enemy hexes fall too (not city centres).
    for (let d = 0; d < 6; d++) {
      const m = sim.grid.neighbours[hex * 6 + d];
      if (m < 0 || sim.isWater(m)) continue;
      const o = st.hexOwner[m] - 1;
      if (o < 0 || o === by || !sim.atWar(by, o)) continue;
      const cid = sim.cityAt[m];
      if (cid >= 0 && st.cities[cid].hex === m) continue;
      if (hasHostileLand(sim, m, by)) continue;
      const to = liberator(sim, m, by, o);
      setHexOwner(sim, m, to);
      st.stats.hexesCaptured++;
      sim.emit({ type: 'hexCaptured', hex: m, from: o, to });
      if (sim.coast[m]) flipOffshore(sim, m, o, to);
    }
  }
  void unit;
  return true;
}

function hasHostileLand(sim: Sim, hex: number, by: NationId): boolean {
  for (const u of sim.unitsIn(hex)) {
    if (u.nation === by) continue;
    if (sim.atWar(by, u.nation) && sim.design(u).cls === UnitClass.Land) return true;
  }
  return false;
}

function flipOffshore(sim: Sim, hex: number, prev: NationId, to: NationId): void {
  const st = sim.state;
  sim.grid.forRadius(hex, 2, (h) => {
    if (!sim.isWater(h)) return;
    for (const f of sim.facilitiesAt(h)) {
      if (f.nation !== prev) continue;
      let stillPrev = false;
      sim.grid.forRadius(h, 3, (m) => { if (!stillPrev && st.hexOwner[m] - 1 === prev && !sim.isWater(m)) stillPrev = true; });
      if (!stillPrev) { f.nation = to; sim.markFacilitiesDirty(); }
    }
  });
}

export function captureCity(sim: Sim, cityId: number, by: NationId): void {
  const st = sim.state;
  const city = st.cities[cityId];
  const prev = sim.owner(city.hex);
  if (prev === by || prev < 0) return;
  const to = liberator(sim, city.hex, by, prev);
  for (const h of city.urbanHexes.concat([city.hex])) {
    if (sim.owner(h) === prev) {
      setHexOwner(sim, h, to);
      sim.emit({ type: 'hexCaptured', hex: h, from: prev, to });
    }
  }
  city.damage = Math.min(1, city.damage + 0.08);
  st.stats.citiesCaptured++;
  sim.emit({ type: 'cityCaptured', city: cityId, from: prev, to });
  const pn = st.nations[prev], tn = st.nations[to];
  const wasCapital = city.capital;
  const liberated = to !== by;
  pn.approval = Math.max(1, pn.approval - (wasCapital ? 12 : Math.min(6, city.population / 800 + 1)));
  pn.warWeariness = Math.min(100, pn.warWeariness + (wasCapital ? 15 : 3));
  if (liberated) {
    sim.news('war', `${city.name} has been liberated by ${st.nations[by].name} and returned to ${tn.name}.`, [by, to, prev], 2, city.hex);
  } else {
    sim.news('war', wasCapital
      ? `${tn.name} forces capture ${city.name}, the capital of ${pn.name}!`
      : `${tn.name} forces capture ${city.name} from ${pn.name}.`, [to, prev], wasCapital || city.population > 2000 ? 3 : 2, city.hex);
  }
  if (wasCapital) {
    city.capital = false;
    relocateCapital(sim, prev);
  }
  if (tn.capitalCity < 0) { city.capital = true; tn.capitalCity = city.id; }
  if (!st.cities.some((c) => sim.owner(c.hex) === prev)) defeatNation(sim, prev, to);
}

export function relocateCapital(sim: Sim, nation: NationId): void {
  const st = sim.state;
  const n = st.nations[nation];
  let best = -1, bestPop = -1;
  for (const c of st.cities) {
    if (sim.owner(c.hex) !== nation) continue;
    const score = c.population * (c.originalNation === nation ? 1.5 : 1);
    if (score > bestPop) { bestPop = score; best = c.id; }
  }
  for (const c of st.cities) if (c.capital && sim.owner(c.hex) === nation) c.capital = false;
  n.capitalCity = best;
  if (best >= 0) {
    st.cities[best].capital = true;
    sim.news('politics', `The government of ${n.name} relocates the capital to ${st.cities[best].name}.`, [nation], 2, st.cities[best].hex);
  }
}

export function defeatNation(sim: Sim, loser: NationId, by: NationId): void {
  const st = sim.state;
  const n = st.nations[loser];
  if (!n.alive) return;
  // Main occupier: whoever holds most of the loser's core territory.
  const held = new Map<NationId, number>();
  for (let i = 0; i < st.hexCore.length; i++) {
    if (st.hexCore[i] - 1 !== loser) continue;
    const o = st.hexOwner[i] - 1;
    if (o >= 0 && o !== loser) held.set(o, (held.get(o) ?? 0) + 1);
  }
  let occupier = by, most = -1;
  for (const [o, c] of held) if (c > most && st.nations[o].alive) { most = c; occupier = o; }
  for (let i = 0; i < st.hexOwner.length; i++) if (st.hexOwner[i] - 1 === loser) setHexOwner(sim, i, occupier);
  for (const f of st.facilities.values()) if (f.nation === loser) f.nation = occupier;
  sim.markFacilitiesDirty();
  for (const u of [...sim.nationUnits(loser)]) destroyUnit(sim, u, null, true);
  n.alive = false;
  n.capitalCity = -1;
  n.productionQueue = [];
  n.researching = [];
  // Treaties and proposals involving the loser disappear.
  for (const t of [...st.treaties]) if (t.a === loser || t.b === loser) sim.removeTreaty(t.a, t.b, t.type);
  st.proposals = st.proposals.filter((p) => p.from !== loser && p.to !== loser);
  endWarsFor(sim, loser);
  sim.emit({ type: 'nationDefeated', nation: loser, by: occupier });
  sim.news('war', `${n.formalName} has fallen. ${st.nations[occupier].name} takes control of its remaining territory.`, [loser, occupier], 3);
  if (loser === st.playerNation) {
    st.gameOver = { winner: occupier, reason: `${n.name} has been defeated by ${st.nations[occupier].name}.` };
  }
}
