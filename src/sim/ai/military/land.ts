/**
 * Land command: garrisons, front allocation (defensive parity), reserves,
 * refit of battered units, artillery fire support and offensives with local
 * superiority.
 */
import type { Unit } from '../../types';
import type { AIContext } from '../context';
import type { FrontSector, NationMemory, Offensive, UnitIntent } from '../memory';
import { remember } from '../memory';
import { terrainDefense, unitGroundPower, type DesignInfo } from '../designs';
import type { Adversary } from './fronts';
import { ensureAt, headingTo, setIntent, type OrderBatch } from './orders';

export interface LandUnit {
  u: Unit;
  info: DesignInfo;
  p: number;
  it: UnitIntent | undefined;
}

export interface LandInput {
  advs: Adversary[];
  /** Visible land power per hex of every adversary. */
  allPower: Map<number, number>;
  /** Visible land power per hex of nations at war with us. */
  hotPower: Map<number, number>;
  hot: number[];
}

const MAX_STACK = 4;

function powerNear(map: Map<number, number>, grid: AIContext['grid'], hex: number, r: number): number {
  let s = 0;
  for (const [h, p] of map) if (grid.distance(h, hex) <= r) s += p;
  return s;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 30;
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1];
}

/** Defensive value of standing on a hex (terrain + river). */
function hexDefense(ctx: AIContext, h: number): number {
  const w = ctx.state.world;
  return terrainDefense(w.hexTerrain[h]) + (w.hexRiverEdges[h] ? 0.15 : 0);
}

export function runLand(ctx: AIContext, me: number, mem: NationMemory, batch: OrderBatch, input: LandInput): void {
  const grid = ctx.grid;
  const state = ctx.state;
  const hour = state.hour;
  const owner = state.hexOwner;
  const lus: LandUnit[] = [];
  for (const u of ctx.units.land[me]) {
    if (u.embarked) continue;
    const info = ctx.design(u.design);
    if (!info) continue;
    const it = mem.intents.get(u.id);
    if (it?.role === 'amphib') continue;
    lus.push({ u, info, p: unitGroundPower(info, u), it });
  }
  if (lus.length === 0) return;
  const typical = median(lus.map((l) => l.p));
  const atWar = input.hot.length > 0;
  const sectors = mem.fronts;
  const advByNation = new Map(input.advs.map((a) => [a.nation, a]));

  // ---- sector demand -------------------------------------------------------
  let targetCap = -1;
  if (mem.warPlan) targetCap = ctx.capitalHex(mem.warPlan.target);
  for (const s of sectors) {
    const a = advByNation.get(s.adversary);
    if (!a) continue;
    if (a.hot) s.demand = Math.max(s.threat * 1.15, typical * (s.threat > typical * 0.3 ? 1 : 0.6));
    else if (a.target) {
      const toCap = targetCap >= 0 ? grid.distance(s.anchor, targetCap) : 30;
      s.demand = Math.max(s.threat * 1.7, typical * (toCap < 15 ? 2.5 : 1.2));
      // Staging for our own planned offensive takes priority over quiet borders.
      s.value = s.value * 1.5 + (toCap < 15 ? 4 : 2);
    } else s.demand = s.threat * 0.8;
  }

  // ---- refit battered units -------------------------------------------------
  const hotAnchors = sectors.filter((s) => s.hot).map((s) => s.anchor);
  const ownCities = (ctx.terr.cities[me] ?? []).map((id) => state.cities[id]);
  const safeCities = ownCities.filter((c) => hotAnchors.every((a) => grid.distance(a, c.hex) >= 4));
  const free: LandUnit[] = [];
  const offenseUnits = new Set<number>();
  for (const o of mem.offensives) for (const id of o.units) offenseUnits.add(id);
  for (const o of mem.offensives) for (const id of o.support) offenseUnits.add(id);

  for (const lu of lus) {
    const { u, it } = lu;
    const battered = u.strength < 35 || u.efficiency < 22;
    if (it?.role === 'refit') {
      // Back to duty when rebuilt (or when replacements simply are not coming).
      const since = mem.refitSince.get(u.id) ?? hour;
      if (!mem.refitSince.has(u.id)) mem.refitSince.set(u.id, hour);
      if ((u.strength >= 75 && u.efficiency >= 40) || (hour - since > 24 * 15 && u.strength >= 50)) {
        mem.refitSince.delete(u.id);
        mem.intents.delete(u.id);
        lu.it = undefined;
      } else {
        doRefit(ctx, mem, batch, lu, safeCities.length ? safeCities : ownCities);
        continue;
      }
    } else if (battered && !(offenseUnits.has(u.id) && u.inCombat && u.strength > 25)) {
      offenseUnits.delete(u.id);
      removeFromOffensives(mem, u.id);
      doRefit(ctx, mem, batch, lu, safeCities.length ? safeCities : ownCities);
      continue;
    }
    // Periodic reinforcement of damaged but serviceable units in own territory.
    if (u.strength < 75 && !u.inCombat && owner[u.hex] - 1 === me) {
      const last = mem.reinforceHour.get(u.id) ?? -1e9;
      if (hour - last >= 24) {
        mem.reinforceHour.set(u.id, hour);
        batch.reinforce(u);
      }
    }
    if (offenseUnits.has(u.id)) continue;
    free.push(lu);
  }

  // ---- garrisons -----------------------------------------------------------
  const cap = ctx.capitalHex(me);
  const garrisonWant = new Map<number, number>(); // city hex -> units wanted
  if (cap >= 0 && lus.length >= 3) {
    const nearFront = hotAnchors.some((a) => grid.distance(a, cap) <= 8);
    garrisonWant.set(cap, atWar && nearFront ? 2 : 1);
  }
  if (atWar) {
    const threatened = ownCities
      .filter((c) => c.hex !== cap && hotAnchors.some((a) => grid.distance(a, c.hex) <= 6))
      .sort((a, b) => b.population - a.population)
      .slice(0, 3);
    for (const c of threatened) garrisonWant.set(c.hex, 1);
  }
  // Preparing an overseas war: stage an invasion force at the nearest port.
  if (mem.warPlan && ctx.terr.mainBorderLength(me, mem.warPlan.target) === 0) {
    const tcap = ctx.capitalHex(mem.warPlan.target);
    const port = tcap >= 0 ? ownCities.filter((c) => c.port).sort((a, b) => grid.distance(a.hex, tcap) - grid.distance(b.hex, tcap))[0] : undefined;
    if (port) garrisonWant.set(port.hex, Math.min(6, Math.max(2, Math.floor(lus.length / 4))));
  }
  // Overseas enemies: hold the coastal cities nearest to them.
  for (const e of input.hot) {
    if (ctx.terr.mainBorderLength(me, e) > 0) continue;
    const ecap = ctx.capitalHex(e);
    if (ecap < 0) continue;
    const coastal = ownCities.filter((c) => c.port).sort((a, b) => grid.distance(a.hex, ecap) - grid.distance(b.hex, ecap));
    for (const c of coastal.slice(0, 2)) garrisonWant.set(c.hex, Math.max(garrisonWant.get(c.hex) ?? 0, 1));
  }
  const garrisonHave = new Map<number, number>();
  const remaining: LandUnit[] = [];
  // Keep existing garrisons; AA units prefer garrison duty.
  for (const lu of free) {
    const it = lu.it;
    if (it?.role === 'garrison' && garrisonWant.has(it.key) && (garrisonHave.get(it.key) ?? 0) < (garrisonWant.get(it.key) ?? 0) && owner[it.key] - 1 === me) {
      garrisonHave.set(it.key, (garrisonHave.get(it.key) ?? 0) + 1);
      const i2 = setIntent(mem, lu.u, 'garrison', it.key, it.key);
      ensureAt(batch, ctx, i2, lu.u, it.key);
      batch.stance(lu.u, 'defensive');
      continue;
    }
    remaining.push(lu);
  }
  for (const [hex, want] of garrisonWant) {
    let have = garrisonHave.get(hex) ?? 0;
    if (have >= want) continue;
    const cands = remaining
      .filter((l) => (l.info.role === 'line' || l.info.role === 'aa' || l.info.role === 'recon') && ctx.terr.reachable(l.u.hex, hex))
      .sort((a, b) => grid.distance(a.u.hex, hex) - grid.distance(b.u.hex, hex) || a.u.id - b.u.id);
    for (const lu of cands) {
      if (have >= want) break;
      const it = setIntent(mem, lu.u, 'garrison', hex, hex);
      lu.it = it;
      ensureAt(batch, ctx, it, lu.u, hex);
      batch.stance(lu.u, 'defensive');
      have++;
      remaining.splice(remaining.indexOf(lu), 1);
    }
    garrisonHave.set(hex, have);
  }

  // ---- support (artillery) & AA -------------------------------------------
  const pool: LandUnit[] = [];
  const supportUnits: LandUnit[] = [];
  const aaUnits: LandUnit[] = [];
  for (const lu of remaining) {
    if (lu.info.role === 'support') supportUnits.push(lu);
    else if (lu.info.role === 'aa') aaUnits.push(lu);
    else pool.push(lu);
  }

  // ---- offensives ----------------------------------------------------------
  const occupied = new Map<number, number>(); // hex -> our planned stack count
  for (const off of [...mem.offensives]) runOffensive(ctx, me, mem, batch, off, input, typical);
  if (atWar) planOffensives(ctx, me, mem, batch, pool, supportUnits, input, typical);

  // ---- front allocation -----------------------------------------------------
  const sectorByKey = new Map<number, FrontSector>();
  for (const s of sectors) sectorByKey.set(s.key, s);
  const unassigned: LandUnit[] = [];
  // Pass 1: keep units in their current sector while it needs them.
  for (const lu of pool) {
    const it = lu.it;
    const s = it && it.role === 'front' ? sectorByKey.get(it.key) : undefined;
    if (s && s.assigned < s.demand * 1.3 && ctx.terr.reachable(lu.u.hex, s.anchor)) {
      s.assigned += lu.p;
      assignToSector(ctx, mem, batch, lu, s, occupied);
    } else unassigned.push(lu);
  }
  // Pass 2: fill deficits by priority with the nearest free units.
  const needy = sectors
    .filter((s) => s.demand > s.assigned + typical * 0.3)
    .sort((a, b) => (b.demand - b.assigned) * b.value - (a.demand - a.assigned) * a.value || a.key - b.key);
  for (const s of needy) {
    if (unassigned.length === 0) break;
    unassigned.sort((a, b) => grid.distance(a.u.hex, s.anchor) - grid.distance(b.u.hex, s.anchor) || a.u.id - b.u.id);
    for (let k = 0; k < unassigned.length && s.assigned < s.demand; ) {
      const lu = unassigned[k];
      if (!ctx.terr.reachable(lu.u.hex, s.anchor)) {
        k++;
        continue;
      }
      unassigned.splice(k, 1);
      s.assigned += lu.p;
      assignToSector(ctx, mem, batch, lu, s, occupied);
    }
  }
  // Pass 3: leftovers. At war keep a mobile reserve behind the most
  // threatened sector (counterattacks, plugging breaches); the rest thickens the line.
  const hotSectors = sectors.filter((s) => s.hot);
  const stagingSectors = sectors.filter((s) => advByNation.get(s.adversary)?.target);
  const reserveUnits: LandUnit[] = [];
  if (hotSectors.length && unassigned.length >= 3) {
    const focus = [...hotSectors].sort((a, b) => b.threat * b.value - a.threat * a.value || a.key - b.key)[0];
    const spot = reservePosition(ctx, me, focus, cap);
    const quota = Math.max(1, Math.floor(lus.length * 0.12));
    const mobiles = unassigned
      .filter((l) => l.info.role === 'mobile' && ctx.terr.reachable(l.u.hex, spot))
      .sort((a, b) => (a.it?.role === 'reserve' ? -5 : 0) + grid.distance(a.u.hex, spot) - ((b.it?.role === 'reserve' ? -5 : 0) + grid.distance(b.u.hex, spot)) || a.u.id - b.u.id)
      .slice(0, quota);
    for (const lu of mobiles) {
      unassigned.splice(unassigned.indexOf(lu), 1);
      reserveUnits.push(lu);
      const keep = lu.it?.role === 'reserve' && lu.it.key === focus.key ? lu.it.target : spot;
      const it = setIntent(mem, lu.u, 'reserve', focus.key, keep);
      lu.it = it;
      ensureAt(batch, ctx, it, lu.u, keep);
      batch.stance(lu.u, 'defensive');
    }
  }
  for (const lu of unassigned) {
    const extraTargets = (hotSectors.length ? hotSectors : stagingSectors).filter((s) => ctx.terr.reachable(lu.u.hex, s.anchor));
    if (extraTargets.length) {
      // Thicken the line where the threat per assigned power is highest (nearest as tie-break).
      let best = extraTargets[0];
      let bestScore = -Infinity;
      for (const s of extraTargets) {
        const sc = (s.threat + typical) / (s.assigned + typical) * s.value - grid.distance(lu.u.hex, s.anchor) * 0.05;
        if (sc > bestScore) {
          bestScore = sc;
          best = s;
        }
      }
      best.assigned += lu.p;
      assignToSector(ctx, mem, batch, lu, best, occupied);
      continue;
    }
    // Peace/reserve: stay put in own territory, otherwise come home.
    // Let units finish their current move; never drag them back to a stale hex.
    const dest = lu.u.path.length ? lu.u.path[lu.u.path.length - 1] : lu.u.hex;
    let target = owner[dest] - 1 === me ? dest : lu.u.hex;
    if (owner[target] - 1 !== me) {
      const home = nearestCity(ctx, ownCities, lu.u.hex);
      target = home >= 0 ? home : lu.u.hex;
    }
    const it = setIntent(mem, lu.u, 'reserve', -1, target);
    lu.it = it;
    ensureAt(batch, ctx, it, lu.u, target);
    batch.stance(lu.u, 'defensive');
  }

  // ---- artillery -------------------------------------------------------------
  runSupport(ctx, me, mem, batch, supportUnits, input, sectors);
  // ---- air defence units: capital, cities, hot sectors ------------------------
  runAirDefense(ctx, me, mem, batch, aaUnits, sectors, ownCities, cap);
  // ---- local pushes into empty enemy ground where we are clearly superior ------
  if (atWar) localPushes(ctx, me, mem, batch, pool, input);
  // ---- counterattacks against enemy stacks inside our territory -----------------
  if (atWar) counterattacks(ctx, me, mem, batch, [...reserveUnits, ...pool], input);
}

/** Own hex 2–3 hexes behind a sector, toward the capital. */
function reservePosition(ctx: AIContext, me: number, s: FrontSector, cap: number): number {
  const grid = ctx.grid;
  let best = s.anchor;
  let bs = Infinity;
  const border = new Set(s.hexes);
  grid.forRadius(s.anchor, 3, (h, d) => {
    if (d < 2 || border.has(h) || ctx.owner(h) !== me || ctx.terr.water[h]) return;
    const sc = (cap >= 0 ? grid.distance(h, cap) : 0) - hexDefense(ctx, h) + (d === 2 ? 0 : 0.5);
    if (sc < bs) {
      bs = sc;
      best = h;
    }
  });
  return best;
}

function counterattacks(ctx: AIContext, me: number, mem: NationMemory, batch: OrderBatch, cands: LandUnit[], input: LandInput): void {
  const grid = ctx.grid;
  const breaches: { hex: number; p: number }[] = [];
  for (const [h, p] of input.hotPower) if (ctx.owner(h) === me || ctx.state.hexCore[h] - 1 === me) breaches.push({ hex: h, p });
  if (breaches.length === 0) return;
  breaches.sort((a, b) => b.p - a.p || a.hex - b.hex);
  const used = new Set<number>();
  let done = 0;
  for (const br of breaches) {
    if (done >= 3) break;
    const def = br.p * terrainDefense(ctx.state.world.hexTerrain[br.hex]);
    const near = cands
      .filter((l) => !used.has(l.u.id) && l.u.strength > 50 && l.u.supply > 20 && grid.distance(l.u.hex, br.hex) <= 3)
      .sort((a, b) => grid.distance(a.u.hex, br.hex) - grid.distance(b.u.hex, br.hex) || b.p - a.p);
    let pw = 0;
    const group: LandUnit[] = [];
    for (const l of near) {
      if (pw >= def * 1.8) break;
      group.push(l);
      pw += l.p;
    }
    if (pw < def * 1.5 || group.length === 0) {
      mem.supportRequests.push(br.hex);
      continue;
    }
    done++;
    for (const l of group) {
      used.add(l.u.id);
      if (grid.distance(l.u.hex, br.hex) <= 1) {
        if (!(l.u.order.type === 'attack' && l.u.order.targetHex === br.hex)) batch.attack(l.u, br.hex);
      } else if (!(l.u.order.type === 'move' && grid.distance(l.u.order.targetHex, br.hex) <= 1)) {
        // Close in next to the breach (the unit's post is restored afterwards).
        let step = -1;
        let bd = Infinity;
        for (let d = 0; d < 6; d++) {
          const j = grid.neighbours[br.hex * 6 + d];
          if (j < 0 || ctx.terr.water[j] || input.hotPower.has(j) || ctx.owner(j) !== me) continue;
          const dist = grid.distance(j, l.u.hex);
          if (dist < bd) {
            bd = dist;
            step = j;
          }
        }
        if (step >= 0) batch.move(l.u, step);
      }
      batch.stance(l.u, 'aggressive');
    }
    remember(mem, ctx.state.hour, 'military', `counterattack at ${br.hex} with ${group.length} units (${pw.toFixed(0)} vs ${def.toFixed(0)})`);
  }
}

function nearestCity(ctx: AIContext, cities: { hex: number }[], from: number): number {
  let best = -1;
  let bd = Infinity;
  for (const c of cities) {
    if (!ctx.terr.reachable(from, c.hex)) continue;
    const d = ctx.grid.distance(c.hex, from);
    if (d < bd) {
      bd = d;
      best = c.hex;
    }
  }
  return best;
}

function doRefit(ctx: AIContext, mem: NationMemory, batch: OrderBatch, lu: LandUnit, cities: { hex: number }[]): void {
  const u = lu.u;
  const prev = lu.it?.role === 'refit' ? lu.it.target : -1;
  const target = prev >= 0 && ctx.owner(prev) === u.nation ? prev : nearestCity(ctx, cities, u.hex);
  if (target < 0) return;
  const it = setIntent(mem, u, 'refit', target, target);
  lu.it = it;
  batch.stance(u, 'passive');
  if (u.hex === target) {
    const last = mem.reinforceHour.get(u.id) ?? -1e9;
    if (ctx.state.hour - last >= 24) {
      mem.reinforceHour.set(u.id, ctx.state.hour);
      batch.reinforce(u);
    }
    return;
  }
  ensureAt(batch, ctx, it, u, target);
}

function removeFromOffensives(mem: NationMemory, id: number): void {
  for (const o of mem.offensives) {
    const i = o.units.indexOf(id);
    if (i >= 0) o.units.splice(i, 1);
    const j = o.support.indexOf(id);
    if (j >= 0) o.support.splice(j, 1);
  }
}

function assignToSector(ctx: AIContext, mem: NationMemory, batch: OrderBatch, lu: LandUnit, s: FrontSector, occupied: Map<number, number>): void {
  const grid = ctx.grid;
  const u = lu.u;
  const prev = lu.it && lu.it.role === 'front' && lu.it.key === s.key ? lu.it.target : -1;
  let target = -1;
  if (prev >= 0 && s.hexes.includes(prev) && (occupied.get(prev) ?? 0) < MAX_STACK) target = prev;
  else if (s.hexes.includes(u.hex) && (occupied.get(u.hex) ?? 0) < MAX_STACK) target = u.hex;
  else {
    let best = s.anchor;
    let bs = Infinity;
    for (const h of s.hexes) {
      const load = occupied.get(h) ?? 0;
      if (load >= MAX_STACK) continue;
      const sc = load * 3 + grid.distance(u.hex, h) * 0.4 - hexDefense(ctx, h) * 1.5;
      if (sc < bs) {
        bs = sc;
        best = h;
      }
    }
    target = best;
  }
  occupied.set(target, (occupied.get(target) ?? 0) + 1);
  if (grid.distance(u.hex, target) <= 1) s.present += lu.p;
  const it = setIntent(mem, u, 'front', s.key, target);
  lu.it = it;
  ensureAt(batch, ctx, it, u, target);
  batch.stance(u, 'defensive');
}

// ---------------------------------------------------------------------------
// Artillery
// ---------------------------------------------------------------------------
function runSupport(ctx: AIContext, me: number, mem: NationMemory, batch: OrderBatch, units: LandUnit[], input: LandInput, sectors: FrontSector[]): void {
  if (units.length === 0) return;
  const grid = ctx.grid;
  const hotSectors = sectors.filter((s) => s.hot || (s.threat > 0 && s.demand > 0)).sort((a, b) => b.threat - a.threat || a.key - b.key);
  const perSector = new Map<number, number>();
  for (const lu of units) {
    const u = lu.u;
    const range = Math.max(1, lu.info.d.rangeGround);
    // Fire at the strongest visible enemy stack in range (only at war enemies).
    let bestHex = -1;
    let bestP = 0;
    for (const [h, p] of input.hotPower) {
      const d = grid.distance(u.hex, h);
      if (d <= range && d >= 1 && p > bestP) {
        bestP = p;
        bestHex = h;
      }
    }
    for (const req of mem.supportRequests) {
      const d = grid.distance(u.hex, req);
      if (d <= range && d >= 1) {
        const p = (input.hotPower.get(req) ?? 0) * 1.5;
        if (p > bestP) {
          bestP = p;
          bestHex = req;
        }
      }
    }
    if (bestHex >= 0 && u.supply > 10) {
      setIntent(mem, u, 'support', lu.it?.key ?? -1, u.hex);
      if (!(u.order.type === 'attack' && u.order.targetHex === bestHex)) batch.attack(u, bestHex);
      continue;
    }
    // Position one hex behind the most threatened sectors.
    let sector: FrontSector | undefined;
    if (lu.it?.role === 'support') sector = hotSectors.find((s) => s.key === lu.it!.key);
    if (!sector || (perSector.get(sector.key) ?? 0) >= 2) sector = hotSectors.find((s) => (perSector.get(s.key) ?? 0) < 2 && ctx.terr.reachable(u.hex, s.anchor));
    if (!sector) {
      const it = setIntent(mem, u, 'support', -1, u.hex);
      lu.it = it;
      continue;
    }
    perSector.set(sector.key, (perSector.get(sector.key) ?? 0) + 1);
    let target = lu.it?.role === 'support' && lu.it.key === sector.key ? lu.it.target : -1;
    if (target < 0 || ctx.owner(target) !== me) target = behindLine(ctx, me, sector);
    const it = setIntent(mem, u, 'support', sector.key, target);
    lu.it = it;
    ensureAt(batch, ctx, it, u, target);
    batch.stance(u, 'defensive');
  }
}

/** An own hex adjacent to the sector but not on the border itself. */
function behindLine(ctx: AIContext, me: number, s: FrontSector): number {
  const grid = ctx.grid;
  const owner = ctx.state.hexOwner;
  const set = new Set(s.hexes);
  const nb = grid.neighbours;
  let best = s.anchor;
  let bd = Infinity;
  for (const h of s.hexes) {
    for (let d = 0; d < 6; d++) {
      const j = nb[h * 6 + d];
      if (j < 0 || set.has(j) || owner[j] - 1 !== me || ctx.terr.water[j]) continue;
      const dist = grid.distance(j, s.anchor);
      if (dist < bd) {
        bd = dist;
        best = j;
      }
    }
  }
  return best;
}

function runAirDefense(ctx: AIContext, me: number, mem: NationMemory, batch: OrderBatch, units: LandUnit[], sectors: FrontSector[], cities: { hex: number; population: number }[], cap: number): void {
  if (units.length === 0) return;
  const spots: number[] = [];
  if (cap >= 0) spots.push(cap);
  const hot = sectors.filter((s) => s.hot).sort((a, b) => b.threat - a.threat);
  for (const s of hot.slice(0, 3)) spots.push(behindLine(ctx, me, s));
  for (const c of [...cities].sort((a, b) => b.population - a.population)) {
    if (!spots.includes(c.hex)) spots.push(c.hex);
    if (spots.length >= units.length + 2) break;
  }
  const taken = new Map<number, number>();
  for (const lu of units) {
    let target = lu.it?.role === 'garrison' && spots.includes(lu.it.target) && (taken.get(lu.it.target) ?? 0) < 1 ? lu.it.target : -1;
    if (target < 0) {
      let bd = Infinity;
      for (const s of spots) {
        if ((taken.get(s) ?? 0) >= 1 || !ctx.terr.reachable(lu.u.hex, s)) continue;
        const d = ctx.grid.distance(lu.u.hex, s);
        if (d < bd) {
          bd = d;
          target = s;
        }
      }
    }
    if (target < 0) target = lu.u.hex;
    taken.set(target, (taken.get(target) ?? 0) + 1);
    const it = setIntent(mem, lu.u, 'garrison', target, target);
    ensureAt(batch, ctx, it, lu.u, target);
    batch.stance(lu.u, 'defensive');
  }
}

// ---------------------------------------------------------------------------
// Local pushes: occupy empty enemy hexes next to strong sectors
// ---------------------------------------------------------------------------
function localPushes(ctx: AIContext, me: number, mem: NationMemory, batch: OrderBatch, pool: LandUnit[], input: LandInput): void {
  const grid = ctx.grid;
  const owner = ctx.state.hexOwner;
  const nb = grid.neighbours;
  const hotSet = new Set(input.hot);
  const bySector = new Map<number, LandUnit[]>();
  for (const lu of pool) {
    if (lu.it?.role !== 'front') continue;
    let l = bySector.get(lu.it.key);
    if (!l) bySector.set(lu.it.key, (l = []));
    l.push(lu);
  }
  for (const s of mem.fronts) {
    if (!s.hot || s.assigned < Math.max(s.threat * 2, 1)) continue;
    const members = bySector.get(s.key);
    if (!members || members.length < 2) continue;
    // One unit per sector per cycle steps into an empty, visible enemy hex.
    for (const lu of members) {
      const u = lu.u;
      if (u.hex !== lu.it?.target || u.supply < 40 || u.strength < 60 || u.inCombat) continue;
      let step = -1;
      for (let d = 0; d < 6; d++) {
        const j = nb[u.hex * 6 + d];
        if (j < 0 || ctx.terr.water[j]) continue;
        const o = owner[j] - 1;
        if (o < 0 || !hotSet.has(o)) continue;
        if (input.hotPower.has(j) || !ctx.game.isVisible(me, j)) continue;
        // Avoid stepping next to strong enemy stacks.
        let danger = 0;
        for (let e = 0; e < 6; e++) {
          const k = nb[j * 6 + e];
          if (k >= 0) danger += input.hotPower.get(k) ?? 0;
        }
        if (danger > lu.p * 1.2) continue;
        step = j;
        break;
      }
      if (step >= 0) {
        batch.move(u, step);
        batch.stance(u, 'aggressive');
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Offensives
// ---------------------------------------------------------------------------
function planOffensives(
  ctx: AIContext, me: number, mem: NationMemory, batch: OrderBatch,
  pool: LandUnit[], support: LandUnit[], input: LandInput, typical: number,
): void {
  const grid = ctx.grid;
  const state = ctx.state;
  const hour = state.hour;
  const totalUnits = ctx.units.land[me].length;
  const maxOff = Math.min(4, 1 + Math.floor(totalUnits / 14));
  if (mem.offensives.length >= maxOff) return;
  const claims = new Set<number>();
  const cl = state.world.claims[me];
  const hotDefence = new Map<number, number>();
  for (const e of input.hot) {
    const sectorsE = mem.fronts.filter((s) => s.adversary === e);
    if (sectorsE.length === 0) continue;
    if (mem.offensives.filter((o) => o.enemy === e).length >= 2) continue;
    if (claims.size === 0 && cl) for (let i = 0; i < cl.length; i++) claims.add(cl[i]);
    // Surplus power available beyond defensive needs of this front.
    let freePower = 0;
    for (const lu of pool) freePower += lu.p;
    let demand = 0;
    let assigned = 0;
    for (const s of mem.fronts) {
      if (!s.hot) continue;
      demand += s.demand;
      assigned += s.assigned;
    }
    const surplus = freePower - Math.max(0, demand - assigned) * 0.8;
    if (surplus < typical * 2) {
      remember(mem, hour, 'military', `no forces for an offensive vs ${ctx.nation(e).name} (surplus ${surplus.toFixed(0)})`);
      continue;
    }
    // Candidate objectives: enemy cities near our front.
    let best: { hex: number; city: number; score: number; def: number; staging: number; why: string } | null = null;
    for (const cid of ctx.terr.cities[e] ?? []) {
      const c = state.cities[cid];
      if (mem.offensives.some((o) => o.objective === c.hex)) continue;
      let dmin = Infinity;
      let sBest: FrontSector | null = null;
      for (const s of sectorsE) {
        const d = grid.distance(c.hex, s.anchor);
        if (d < dmin) {
          dmin = d;
          sBest = s;
        }
      }
      if (!sBest || dmin > 16) continue;
      let def = powerNear(input.hotPower, grid, c.hex, 2);
      if (!ctx.game.isVisible(me, c.hex)) def += sBest.threat * 0.5;
      def = Math.max(def, typical * 0.5) * terrainDefense(state.world.hexTerrain[c.hex]);
      const core = state.hexCore[c.hex] - 1 === me;
      const value = 2 + Math.log10(1 + c.population) * 1.5 + (c.capital ? 6 : 0) + (core ? 4 : 0) + (claims.has(c.hex) ? 3 : 0);
      const score = value / (1 + dmin / 6) / (1 + def / Math.max(30, surplus));
      if (!best || score > best.score) {
        let staging = sBest.anchor;
        let sd = Infinity;
        for (const h of sBest.hexes) {
          const d = grid.distance(h, c.hex);
          if (d < sd) {
            sd = d;
            staging = h;
          }
        }
        best = { hex: c.hex, city: cid, score, def, staging, why: `${c.name}${c.capital ? ' (capital)' : ''}` };
      }
    }
    // Fallback: push into the weakest hot sector to seize ground.
    if (!best) {
      const weakest = [...sectorsE].sort((a, b) => a.threat - b.threat || a.key - b.key)[0];
      const deep = enemyHexBeyond(ctx, weakest, e, 4);
      if (deep >= 0) best = { hex: deep, city: -1, score: 0.1, def: Math.max(typical, weakest.threat), staging: weakest.anchor, why: 'breakthrough in a weak sector' };
    }
    if (!best) continue;
    hotDefence.set(best.hex, best.def);
    const required = Math.max(best.def * 2, typical * 2);
    // Pick units: mobile first, then nearest to staging.
    const cands = pool
      .filter((l) => l.u.strength >= 60 && l.u.supply >= 30 && (l.info.role === 'mobile' || l.info.role === 'line' || l.info.role === 'recon') && ctx.terr.reachable(l.u.hex, best!.staging))
      .sort((a, b) => {
        const ma = a.info.role === 'mobile' ? -4 : 0;
        const mb = b.info.role === 'mobile' ? -4 : 0;
        return ma + grid.distance(a.u.hex, best!.staging) - (mb + grid.distance(b.u.hex, best!.staging)) || a.u.id - b.u.id;
      });
    const chosen: LandUnit[] = [];
    let power = 0;
    for (const lu of cands) {
      if (power >= required * 1.25 || chosen.length >= 10) break;
      if (grid.distance(lu.u.hex, best.staging) > 25) continue;
      chosen.push(lu);
      power += lu.p;
    }
    if (power < required || power > surplus + typical * 2) {
      remember(mem, hour, 'military', `offensive on ${best.why} deferred: ${power.toFixed(0)} of ${required.toFixed(0)} power`);
      continue;
    }
    const off: Offensive = {
      id: mem.nextId++,
      enemy: e,
      objective: best.hex,
      objectiveCity: best.city,
      staging: best.staging,
      units: chosen.map((l) => l.u.id),
      support: [],
      stage: 'assemble',
      startHour: hour,
      stageHour: hour,
      initialPower: power,
      bestDist: Infinity,
      lastProgressHour: hour,
      captured: 0,
      reason: best.why,
    };
    // Attach up to a third as artillery.
    const arty = support
      .filter((l) => grid.distance(l.u.hex, best!.staging) <= 20 && ctx.terr.reachable(l.u.hex, best!.staging))
      .sort((a, b) => grid.distance(a.u.hex, best!.staging) - grid.distance(b.u.hex, best!.staging))
      .slice(0, Math.max(1, Math.floor(chosen.length / 3)));
    for (const a of arty) {
      off.support.push(a.u.id);
      support.splice(support.indexOf(a), 1);
    }
    for (const lu of chosen) {
      pool.splice(pool.indexOf(lu), 1);
      const it = setIntent(mem, lu.u, 'offense', off.id, best.staging);
      lu.it = it;
    }
    mem.offensives.push(off);
    remember(mem, hour, 'military', `offensive #${off.id} toward ${best.why}: ${chosen.length} units, power ${power.toFixed(0)} vs ~${best.def.toFixed(0)}`);
    ctx.globalLog(me, 'offensive', `${ctx.nation(me).name} launches an offensive toward ${best.why} (${ctx.nation(e).name}) with ${chosen.length} units`);
    runOffensive(ctx, me, mem, batch, off, input, typical);
    if (mem.offensives.length >= maxOff) return;
  }
}

/** Enemy-owned land hex roughly `depth` hexes beyond the sector (straight out from the anchor). */
function enemyHexBeyond(ctx: AIContext, s: FrontSector, enemy: number, depth: number): number {
  const grid = ctx.grid;
  let best = -1;
  let bd = -1;
  grid.forRadius(s.anchor, depth, (h, dist) => {
    if (ctx.owner(h) !== enemy || ctx.terr.water[h]) return;
    if (dist > bd || (dist === bd && h < best)) {
      bd = dist;
      best = h;
    }
  });
  return best;
}

function dissolve(ctx: AIContext, me: number, mem: NationMemory, off: Offensive, why: string): void {
  const i = mem.offensives.indexOf(off);
  if (i >= 0) mem.offensives.splice(i, 1);
  for (const id of [...off.units, ...off.support]) {
    const it = mem.intents.get(id);
    if (it && it.role === 'offense') mem.intents.delete(id);
  }
  remember(mem, ctx.state.hour, 'military', `offensive #${off.id} (${off.reason}) ended: ${why}`);
}

function nextObjective(ctx: AIContext, me: number, off: Offensive, from: number, input: LandInput): number {
  const grid = ctx.grid;
  let best = -1;
  let bs = -Infinity;
  for (const cid of ctx.terr.cities[off.enemy] ?? []) {
    const c = ctx.state.cities[cid];
    const d = grid.distance(c.hex, from);
    if (d > 14) continue;
    const def = powerNear(input.hotPower, grid, c.hex, 2);
    const s = (2 + Math.log10(1 + c.population) + (c.capital ? 6 : 0)) / (1 + d / 5) / (1 + def / Math.max(30, off.initialPower));
    if (s > bs) {
      bs = s;
      best = c.hex;
    }
  }
  return best;
}

export function runOffensive(ctx: AIContext, me: number, mem: NationMemory, batch: OrderBatch, off: Offensive, input: LandInput, typical: number): void {
  const grid = ctx.grid;
  const state = ctx.state;
  const hour = state.hour;
  const members: LandUnit[] = [];
  for (const id of off.units) {
    const u = state.units.get(id);
    if (!u || u.nation !== me || u.embarked) continue;
    const info = ctx.design(u.design);
    if (!info) continue;
    members.push({ u, info, p: unitGroundPower(info, u), it: mem.intents.get(id) });
  }
  off.units = members.map((m) => m.u.id);
  off.support = off.support.filter((id) => state.units.get(id)?.nation === me);
  if (!input.hot.includes(off.enemy)) return dissolve(ctx, me, mem, off, 'war over');
  if (members.length === 0) return dissolve(ctx, me, mem, off, 'no units left');
  let power = 0;
  for (const m of members) power += m.p;
  if (power < off.initialPower * 0.4) return dissolve(ctx, me, mem, off, 'culminated (losses)');

  // Objective reached?
  if (ctx.owner(off.objective) === me) {
    off.captured++;
    if (off.objectiveCity >= 0) {
      remember(mem, hour, 'military', `offensive #${off.id} captured ${state.cities[off.objectiveCity]?.name}`);
    }
    const lead = members.reduce((a, b) => (grid.distance(a.u.hex, off.objective) <= grid.distance(b.u.hex, off.objective) ? a : b));
    const next = nextObjective(ctx, me, off, lead.u.hex, input);
    if (next < 0 || off.captured >= 4) return dissolve(ctx, me, mem, off, 'objectives secured');
    off.objective = next;
    off.objectiveCity = state.world.hexCity[next] ?? -1;
    const city = off.objectiveCity >= 0 ? state.cities[off.objectiveCity] : undefined;
    off.reason = city ? city.name : 'exploitation';
    off.bestDist = Infinity;
    off.lastProgressHour = hour;
    off.stage = 'attack';
  }

  for (const m of members) {
    setIntent(mem, m.u, 'offense', off.id, m.it?.target ?? off.staging);
    batch.stance(m.u, 'aggressive');
  }

  if (off.stage === 'assemble') {
    let near = 0;
    for (const m of members) if (grid.distance(m.u.hex, off.staging) <= 2) near++;
    if (near >= members.length * 0.7 || hour - off.stageHour > 72) {
      off.stage = 'attack';
      off.stageHour = hour;
    } else {
      for (const m of members) {
        const it = mem.intents.get(m.u.id)!;
        it.target = off.staging;
        ensureAt(batch, ctx, it, m.u, off.staging);
      }
      supportFollow(ctx, me, mem, batch, off, off.staging, input);
      return;
    }
  }

  // ---- attack stage ----
  const lead = members.reduce((a, b) => (grid.distance(a.u.hex, off.objective) <= grid.distance(b.u.hex, off.objective) ? a : b));
  const dist = grid.distance(lead.u.hex, off.objective);
  if (dist < off.bestDist) {
    off.bestDist = dist;
    off.lastProgressHour = hour;
  }
  if (hour - off.lastProgressHour > 144) return dissolve(ctx, me, mem, off, 'bogged down');

  // Contact: visible enemy stacks adjacent to our members, prefer those toward the objective.
  const nb = grid.neighbours;
  let contact = -1;
  let contactScore = Infinity;
  for (const m of members) {
    for (let d = 0; d < 6; d++) {
      const j = nb[m.u.hex * 6 + d];
      if (j < 0 || !input.hotPower.has(j)) continue;
      const sc = grid.distance(j, off.objective);
      if (sc < contactScore || (sc === contactScore && j < contact)) {
        contactScore = sc;
        contact = j;
      }
    }
  }
  // Stragglers catch up with the lead.
  const cohesive: LandUnit[] = [];
  for (const m of members) {
    if (grid.distance(m.u.hex, lead.u.hex) > 3) {
      const it = mem.intents.get(m.u.id)!;
      ensureAt(batch, ctx, it, m.u, lead.u.hex);
    } else cohesive.push(m);
  }

  if (contact >= 0) {
    const w = state.world;
    let defP = input.hotPower.get(contact) ?? 0;
    let entr = 0;
    for (const du of ctx.game.unitsAt(contact)) if (du.nation !== me) entr = Math.max(entr, du.entrenchment);
    defP *= terrainDefense(w.hexTerrain[contact]) * (1 + entr / 200);
    const adj = cohesive.filter((m) => grid.distance(m.u.hex, contact) <= 1 && m.u.supply > 15 && m.u.strength > 30);
    let atk = 0;
    for (const m of adj) atk += m.p;
    // Artillery in range adds support.
    for (const id of off.support) {
      const su = state.units.get(id);
      if (!su) continue;
      const info = ctx.design(su.design);
      if (info && grid.distance(su.hex, contact) <= Math.max(1, info.d.rangeGround)) atk += unitGroundPower(info, su) * 0.5;
    }
    const ratio = atk / Math.max(1, defP);
    mem.supportRequests.push(contact);
    if (ratio >= 1.4 || (ratio >= 1.1 && defP < typical * 0.6)) {
      for (const m of adj) if (!(m.u.order.type === 'attack' && m.u.order.targetHex === contact)) batch.attack(m.u, contact);
      // Others close in behind the attackers.
      for (const m of cohesive) if (!adj.includes(m)) ensureAt(batch, ctx, mem.intents.get(m.u.id)!, m.u, lead.u.hex);
    } else {
      // Wait for fire support / reinforcements; hold ground.
      for (const m of cohesive) {
        if (m.u.order.type === 'move') batch.hold(m.u);
      }
      if (ratio < 0.5 && hour - off.lastProgressHour > 48) return dissolve(ctx, me, mem, off, `stopped by strong defences at ${contact}`);
    }
    supportFollow(ctx, me, mem, batch, off, contact, input);
    return;
  }

  // No contact: advance toward the objective (wait for stragglers first).
  const lagging = members.length - cohesive.length;
  for (const m of cohesive) {
    const it = mem.intents.get(m.u.id)!;
    if (lagging > members.length / 2 && m === lead) {
      if (m.u.order.type === 'move') batch.hold(m.u);
      continue;
    }
    it.target = off.objective;
    if (!headingTo(m.u, off.objective)) ensureAt(batch, ctx, it, m.u, off.objective);
  }
  supportFollow(ctx, me, mem, batch, off, lead.u.hex, input);
  void typical;
}

/** Artillery attached to an offensive follows behind and fires on the contact hex. */
function supportFollow(ctx: AIContext, me: number, mem: NationMemory, batch: OrderBatch, off: Offensive, focus: number, input: LandInput): void {
  const grid = ctx.grid;
  for (const id of off.support) {
    const u = ctx.state.units.get(id);
    if (!u) continue;
    const info = ctx.design(u.design);
    if (!info) continue;
    const range = Math.max(1, info.d.rangeGround);
    const it = setIntent(mem, u, 'offense', off.id, u.hex);
    if (input.hotPower.has(focus) && grid.distance(u.hex, focus) <= range && grid.distance(u.hex, focus) >= 1) {
      if (!(u.order.type === 'attack' && u.order.targetHex === focus)) batch.attack(u, focus);
      continue;
    }
    // Stay 1-2 hexes behind the focus, inside own territory when possible.
    let pos = -1;
    let bd = Infinity;
    grid.forRadius(focus, Math.min(range, 2), (h, d) => {
      if (d < 1 || ctx.owner(h) !== me || ctx.terr.water[h]) return;
      const sc = d + grid.distance(h, u.hex) * 0.1;
      if (sc < bd) {
        bd = sc;
        pos = h;
      }
    });
    if (pos < 0) pos = off.staging;
    it.target = pos;
    ensureAt(batch, ctx, it, u, pos);
  }
}
