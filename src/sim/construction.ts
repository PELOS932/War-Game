/**
 * Facility construction, upgrades, repair. Construction is paid upfront from
 * the treasury and consumes Industry Goods while in progress (progress slows
 * when they're short).
 */
import { FacilityType, type Facility, type NationId } from './types';
import { Deposit, Terrain } from '../worldgen/types';
import type { Sim } from './core';

export interface Result { ok: boolean; reason?: string }

const MAX_PER_HEX = 4;

function priceScale(sim: Sim, nation: NationId): number {
  const n = sim.state.nations[nation];
  return (0.6 + 0.4 * n.costFactor) * Math.max(0.5, 1 + (n.techMods.constructionCost ?? 0));
}

export function facilityCost(sim: Sim, nation: NationId, type: FacilityType): number {
  return (sim.state.facilityDefs[type].cost * priceScale(sim, nation)) / 1000;
}

/** Owner of an offshore hex: nearest land owner within 4 hexes. */
export function offshoreOwner(sim: Sim, hex: number): NationId {
  let best = -1, bestD = 99;
  sim.grid.forRadius(hex, 4, (h, d) => {
    if (d < bestD && !sim.isWater(h) && sim.owner(h) >= 0) { bestD = d; best = sim.owner(h); }
  });
  return best;
}

export function canBuildFacility(sim: Sim, nation: NationId, type: FacilityType, hex: number): Result {
  const st = sim.state;
  const n = st.nations[nation];
  if (!n?.alive) return { ok: false, reason: 'Invalid nation' };
  const def = st.facilityDefs[type];
  if (!def) return { ok: false, reason: 'Unknown facility' };
  if (hex < 0 || hex >= sim.grid.count) return { ok: false, reason: 'Invalid location' };
  const t = sim.terrain[hex];
  const w = sim.world;
  const water = sim.isWater(hex);
  if (type === FacilityType.OffshorePlatform) {
    if (!water || w.hexDeposit[hex] !== Deposit.Gas) return { ok: false, reason: 'Needs an offshore oil & gas field' };
    if (offshoreOwner(sim, hex) !== nation) return { ok: false, reason: 'Field is not in your waters' };
  } else {
    if (water) return { ok: false, reason: 'Must be built on land' };
    if (sim.owner(hex) !== nation) return { ok: false, reason: 'Must be built in your territory' };
    if (t === Terrain.Ice) return { ok: false, reason: 'Cannot build on ice' };
  }
  switch (type) {
    case FacilityType.Farm:
      if (t === Terrain.Mountains || t === Terrain.Urban || t === Terrain.Tundra) return { ok: false, reason: 'Unsuitable terrain for farming' };
      break;
    case FacilityType.Plantation:
      if (!(t === Terrain.Jungle || t === Terrain.Forest) || w.hexTemperature[hex] < 20) return { ok: false, reason: 'Needs tropical forest or jungle' };
      break;
    case FacilityType.LumberMill:
      if (!(t === Terrain.Forest || t === Terrain.Jungle || w.hexForest[hex] > 100)) return { ok: false, reason: 'Needs forest' };
      break;
    case FacilityType.OilWell:
      if (w.hexDeposit[hex] !== Deposit.Oil) return { ok: false, reason: 'Needs an oil deposit' };
      break;
    case FacilityType.CoalMine:
      if (w.hexDeposit[hex] !== Deposit.Coal) return { ok: false, reason: 'Needs a coal deposit' };
      break;
    case FacilityType.OreMine:
      if (w.hexDeposit[hex] !== Deposit.Ore) return { ok: false, reason: 'Needs a metal ore deposit' };
      break;
    case FacilityType.UraniumMine:
      if (w.hexDeposit[hex] !== Deposit.Uranium) return { ok: false, reason: 'Needs a uranium deposit' };
      break;
    case FacilityType.HydroDam:
      if (!w.hexRiverEdges[hex] || !(t === Terrain.Hills || t === Terrain.Mountains)) return { ok: false, reason: 'Needs a river in hills or mountains' };
      break;
    case FacilityType.NavalBase:
      if (!sim.coast[hex]) return { ok: false, reason: 'Must be on the coast' };
      break;
    case FacilityType.Airbase:
      if (t === Terrain.Mountains || t === Terrain.Marsh) return { ok: false, reason: 'Terrain too rough for an airfield' };
      break;
    default:
      if (t === Terrain.Mountains && type !== FacilityType.RadarStation && type !== FacilityType.MissileSilo) return { ok: false, reason: 'Terrain too rough' };
  }
  const here = sim.facilitiesAt(hex);
  if (here.length >= MAX_PER_HEX) return { ok: false, reason: 'No room left in this hex' };
  if (here.some((f) => f.type === type) && (type === FacilityType.Airbase || type === FacilityType.NavalBase || type === FacilityType.RadarStation || type === FacilityType.SupplyDepot)) {
    return { ok: false, reason: 'Already present here (upgrade it instead)' };
  }
  const cost = facilityCost(sim, nation, type);
  if (n.treasury < cost) return { ok: false, reason: `Insufficient funds ($${cost.toFixed(2)}B needed)` };
  return { ok: true };
}

export function buildFacility(sim: Sim, nation: NationId, type: FacilityType, hex: number): Result {
  const chk = canBuildFacility(sim, nation, type, hex);
  if (!chk.ok) return chk;
  const st = sim.state;
  const n = st.nations[nation];
  const def = st.facilityDefs[type];
  sim.spend(nation, 'Construction', facilityCost(sim, nation, type));
  const list = st.hexFacilities.get(hex);
  const slot = list ? list.length : 0;
  const ang = slot * 2.39996 + type * 0.7 + (hex % 7) * 0.4;
  const rad = (sim.cityAt[hex] >= 0 ? 0.5 : slot === 0 ? 0.15 : 0.45) + 0.08 * (slot % 3);
  const days = Math.max(10, def.buildDays * Math.max(0.4, 1 + (n.techMods.constructionTime ?? 0)));
  const f: Facility = {
    id: sim.nextId(), type, hex, level: 1, damage: 0, constructionDaysLeft: days,
    x: sim.grid.cx[hex] + Math.cos(ang) * rad, z: sim.grid.cz[hex] + Math.sin(ang) * rad,
    nation, efficiency: 0, constructionTotal: days, upgradeDaysLeft: 0,
  };
  st.facilities.set(f.id, f);
  sim.addFacilityToHex(f);
  sim.markFacilitiesDirty();
  return { ok: true };
}

export function upgradeFacility(sim: Sim, nation: NationId, facilityId: number): Result {
  const st = sim.state;
  const f = st.facilities.get(facilityId);
  if (!f || f.nation !== nation) return { ok: false, reason: 'Facility not owned' };
  const def = st.facilityDefs[f.type];
  if (f.constructionDaysLeft > 0 || f.upgradeDaysLeft > 0) return { ok: false, reason: 'Construction already in progress' };
  if (f.level >= def.maxLevel) return { ok: false, reason: 'Already at maximum level' };
  if (f.damage > 0.3) return { ok: false, reason: 'Repair the facility first' };
  const cost = facilityCost(sim, nation, f.type) * (0.5 + 0.15 * f.level);
  const n = st.nations[nation];
  if (n.treasury < cost) return { ok: false, reason: `Insufficient funds ($${cost.toFixed(2)}B needed)` };
  sim.spend(nation, 'Construction', cost);
  const days = Math.max(10, def.buildDays * 0.5 * Math.max(0.4, 1 + (n.techMods.constructionTime ?? 0)));
  f.upgradeDaysLeft = days;
  f.constructionTotal = days;
  sim.markFacilitiesDirty();
  return { ok: true };
}

export function constructionDay(sim: Sim): void {
  const st = sim.state;
  for (const f of st.facilities.values()) {
    const n = st.nations[f.nation];
    if (!n || !n.alive) continue;
    const ig = Math.max(0.25, Math.min(1, n.satisfaction[9])) * (n.treasury < 0 ? 0.5 : 1);
    if (f.constructionDaysLeft > 0) {
      f.constructionDaysLeft -= ig;
      if (f.constructionDaysLeft <= 0) {
        f.constructionDaysLeft = 0;
        st.stats.facilitiesBuilt++;
        sim.markFacilitiesDirty();
        sim.emit({ type: 'facilityBuilt', facility: f.id });
        if (n.isPlayer) sim.news('economy', `Construction of a ${st.facilityDefs[f.type].name} has been completed.`, [n.id], 1, f.hex);
      }
    } else if (f.upgradeDaysLeft > 0) {
      f.upgradeDaysLeft -= ig;
      if (f.upgradeDaysLeft <= 0) {
        f.upgradeDaysLeft = 0;
        f.level = Math.min(st.facilityDefs[f.type].maxLevel, f.level + 1);
        sim.markFacilitiesDirty();
        sim.emit({ type: 'facilityBuilt', facility: f.id });
        if (n.isPlayer) sim.news('economy', `${st.facilityDefs[f.type].name} upgraded to level ${f.level}.`, [n.id], 1, f.hex);
      }
    }
    // Repairs (not while enemies are adjacent).
    if (f.damage > 0 && n.treasury > 0) {
      let contested = false;
      if (sim.warring.has(f.nation)) {
        sim.grid.forRadius(f.hex, 1, (h) => {
          if (contested) return;
          for (const u of sim.unitsIn(h)) if (sim.atWar(u.nation, f.nation)) { contested = true; return; }
        });
      }
      if (!contested) {
        const rep = Math.min(f.damage, 0.02);
        f.damage -= rep;
        sim.spend(f.nation, 'Repairs', (st.facilityDefs[f.type].cost * rep * 0.5) / 1000);
        if (f.damage <= 0.001) { f.damage = 0; sim.markFacilitiesDirty(); }
      }
    }
  }
  for (const c of st.cities) if (c.damage > 0) c.damage = Math.max(0, c.damage - 0.003);
}
