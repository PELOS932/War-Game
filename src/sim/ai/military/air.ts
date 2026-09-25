/**
 * Air command: fighters patrol/intercept over threatened sectors, strike
 * aircraft/helicopters/drones hit enemy stacks attacking our line or
 * defending objectives, bombers hit enemy industry & bases, and squadrons
 * rebase forward when targets are out of range.
 */
import { FacilityType, type Unit } from '../../types';
import type { AIContext } from '../context';
import type { FrontSector, NationMemory } from '../memory';
import { remember } from '../memory';

export interface AirInput {
  hot: number[];
  hotPower: Map<number, number>;
  sectors: FrontSector[];
}

interface Target {
  hex: number;
  value: number;
  slots: number;
}

const FACILITY_PRIORITY: Partial<Record<FacilityType, number>> = {
  [FacilityType.MilitaryFactory]: 6,
  [FacilityType.Airbase]: 5,
  [FacilityType.SupplyDepot]: 4,
  [FacilityType.NavalBase]: 3.5,
  [FacilityType.PowerPlant]: 3,
  [FacilityType.NuclearPlant]: 2,
  [FacilityType.IndustrialPlant]: 2.5,
  [FacilityType.OilWell]: 2,
  [FacilityType.RadarStation]: 3,
  [FacilityType.MissileSilo]: 4,
  [FacilityType.Barracks]: 2,
};

function ready(u: Unit): boolean {
  const st = (u as Unit & { airState?: string }).airState;
  if (st !== undefined) return st === 'ready';
  return !u.airborne && (u.order.type === 'idle' || u.order.type === 'hold');
}

export function runAir(ctx: AIContext, me: number, mem: NationMemory, input: AirInput): void {
  const air = ctx.units.air[me];
  if (!air || air.length === 0) return;
  const game = ctx.game;
  const state = ctx.state;
  const hour = state.hour;
  const atWar = input.hot.length > 0;
  const threatSectors = input.sectors.filter((s) => s.threat > 0).sort((a, b) => b.threat * b.value - a.threat * a.value);
  if (!atWar && (mem.posture === 'peace' || threatSectors.length === 0)) return;

  // ---- targets ----------------------------------------------------------------
  const ground: Target[] = [];
  if (atWar) {
    const req = new Set(mem.supportRequests);
    for (const [hex, p] of input.hotPower) {
      const o = ctx.owner(hex);
      const value = p * (1 + (o === me ? 1.2 : 0) + (req.has(hex) ? 1.5 : 0));
      ground.push({ hex, value, slots: Math.max(1, Math.min(4, Math.round(p / 35))) });
    }
    ground.sort((a, b) => b.value - a.value || a.hex - b.hex);
    ground.length = Math.min(ground.length, 30);
  }
  const strategic: Target[] = [];
  if (atWar) {
    for (const e of input.hot) {
      for (const fid of ctx.terr.facilities[e] ?? []) {
        const f = state.facilities.get(fid);
        if (!f || f.damage > 0.7 || f.constructionDaysLeft > 0) continue;
        const pr = FACILITY_PRIORITY[f.type];
        if (!pr) continue;
        strategic.push({ hex: f.hex, value: pr * (1 - f.damage) * f.level, slots: 2 });
      }
    }
    strategic.sort((a, b) => b.value - a.value || a.hex - b.hex);
    strategic.length = Math.min(strategic.length, 30);
  }
  // Enemy aircraft seen over or near our front.
  const enemyAir: Target[] = [];
  if (atWar) {
    for (const e of input.hot) {
      for (const u of ctx.units.air[e] ?? []) {
        if (!u.airborne || !game.isVisible(me, u.hex)) continue;
        enemyAir.push({ hex: u.hex, value: 1, slots: 2 });
      }
    }
  }
  const patrolSpots: Target[] = threatSectors.slice(0, 4).map((s) => ({ hex: s.anchor, value: s.threat, slots: 2 }));
  const cap = ctx.capitalHex(me);
  if (atWar && cap >= 0 && mem.enemyAir > 0.12) patrolSpots.push({ hex: cap, value: 1, slots: 1 });

  const pick = (list: Target[], base: number, rangeKm: number): Target | null => {
    let best: Target | null = null;
    let bs = -Infinity;
    for (const t of list) {
      if (t.slots <= 0) continue;
      const d = ctx.km(base, t.hex);
      if (d > rangeKm * 0.9) continue;
      const s = t.value / (1 + d / 600);
      if (s > bs) {
        bs = s;
        best = t;
      }
    }
    return best;
  };

  const missions = new Map<string, number[]>();
  const add = (kind: 'airStrike' | 'airPatrol' | 'airIntercept', hex: number, id: number) => {
    const k = `${kind}:${hex}`;
    let l = missions.get(k);
    if (!l) missions.set(k, (l = []));
    l.push(id);
  };
  const outOfRange: Unit[] = [];

  for (const u of air) {
    if (!ready(u)) continue;
    const info = ctx.design(u.design);
    if (!info) continue;
    const base = u.baseHex >= 0 ? u.baseHex : u.hex;
    const range = Math.max(100, info.d.rangeKm);
    const role = info.role;
    if (role === 'airlift') continue;
    if (u.strength < 30) continue; // let damaged squadrons rebuild
    let t: Target | null = null;
    let kind: 'airStrike' | 'airPatrol' | 'airIntercept' = 'airStrike';
    if (role === 'fighter' || (role === 'multirole' && (mem.enemyAir > 0.22 || enemyAir.length > 0))) {
      t = pick(enemyAir, base, range);
      kind = 'airIntercept';
      if (!t) {
        t = pick(patrolSpots, base, range);
        kind = 'airPatrol';
      }
      if (!t && role === 'multirole' && atWar) {
        t = pick(ground, base, range);
        kind = 'airStrike';
      }
    } else if (role === 'bomber') {
      t = pick(strategic, base, range) ?? pick(ground, base, range);
      kind = 'airStrike';
    } else if (role === 'strike' || role === 'heli' || role === 'drone' || role === 'multirole') {
      t = pick(ground, base, range);
      kind = 'airStrike';
      if (!t && role !== 'heli' && strategic.length) t = pick(strategic, base, range);
    }
    if (!atWar && kind === 'airStrike') t = null;
    if (!t) {
      if (atWar) outOfRange.push(u);
      continue;
    }
    t.slots--;
    add(kind, t.hex, u.id);
  }
  for (const [k, ids] of missions) {
    const [kind, hexS] = k.split(':');
    const r = game.airMission(ids, kind as 'airStrike' | 'airPatrol' | 'airIntercept', Number(hexS));
    if (!r.ok) mem.commandFails++;
  }

  // ---- forward rebasing ----------------------------------------------------------
  if (outOfRange.length === 0) return;
  const focus = ground[0]?.hex ?? threatSectors[0]?.anchor ?? strategic[0]?.hex;
  if (focus === undefined) return;
  const bases = candidateBases(ctx, me);
  for (const u of outOfRange) {
    const last = mem.airRebaseHour.get(u.id) ?? -1e9;
    if (hour - last < 72) continue;
    const info = ctx.design(u.design);
    if (!info) continue;
    const range = info.d.rangeKm;
    let best = -1;
    let bd = Infinity;
    for (const b of bases) {
      const d = ctx.km(b, focus);
      // Not too close to the front line, within striking range of the focus.
      if (d > range * 0.7 || ctx.grid.distance(b, focus) < 3) continue;
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    mem.airRebaseHour.set(u.id, hour);
    if (best >= 0 && best !== u.baseHex) {
      if (game.rebase([u.id], best).ok) remember(mem, hour, 'military', `rebased ${u.name} forward`);
    }
  }
}

function candidateBases(ctx: AIContext, me: number): number[] {
  const out: number[] = [];
  for (const fid of ctx.terr.facilities[me] ?? []) {
    const f = ctx.state.facilities.get(fid);
    if (f && f.type === FacilityType.Airbase && f.constructionDaysLeft <= 0 && f.damage < 0.6) out.push(f.hex);
  }
  for (const cid of ctx.terr.cities[me] ?? []) {
    const c = ctx.state.cities[cid];
    if (c.population >= 200) out.push(c.hex);
  }
  return out;
}
