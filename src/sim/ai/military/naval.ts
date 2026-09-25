/**
 * Naval command: fleets station in home waters, hunt weaker enemy fleets,
 * blockade/bombard enemy ports and coasts, and escort amphibious invasions.
 * Amphibious operations: embark land units at a port, sail, land near a
 * weakly defended enemy coastal city, then continue as a land offensive.
 */
import { UnitClass, type Unit } from '../../types';
import type { AIContext } from '../context';
import type { AmphibOp, NationMemory, Offensive } from '../memory';
import { remember } from '../memory';
import { unitGroundPower, unitNavalPower } from '../designs';
import { ensureAt, headingTo, setIntent, type OrderBatch } from './orders';

export interface NavalInput {
  hot: number[];
  hotPower: Map<number, number>;
}

const stationCache = new Map<number, { version: number; stations: number[] }>();

/** Water hexes adjacent to our port cities (biggest first). */
export function homeStations(ctx: AIContext, me: number): number[] {
  const c = stationCache.get(me);
  if (c && c.version === ctx.terr.version) return c.stations;
  const cities = (ctx.terr.cities[me] ?? []).map((id) => ctx.state.cities[id]).filter((x) => x.port).sort((a, b) => b.population - a.population || a.id - b.id);
  const out: number[] = [];
  for (const city of cities) {
    const w = adjacentWater(ctx, city.hex);
    if (w >= 0) out.push(w);
    if (out.length >= 6) break;
  }
  stationCache.set(me, { version: ctx.terr.version, stations: out });
  return out;
}

export function adjacentWater(ctx: AIContext, hex: number): number {
  const nb = ctx.grid.neighbours;
  let best = -1;
  for (let d = 0; d < 6; d++) {
    const j = nb[hex * 6 + d];
    if (j >= 0 && ctx.terr.water[j]) {
      if (best < 0 || ctx.state.world.hexTerrain[j] < ctx.state.world.hexTerrain[best]) best = j;
    }
  }
  if (best >= 0) return best;
  // Two rings out (cities slightly inland).
  let bd = Infinity;
  ctx.grid.forRadius(hex, 2, (h, d) => {
    if (ctx.terr.water[h] && d < bd) {
      bd = d;
      best = h;
    }
  });
  return best;
}

function nearestEnemyPort(ctx: AIContext, enemies: number[], from: number): number {
  let best = -1;
  let bd = Infinity;
  for (const e of enemies) {
    for (const cid of ctx.terr.cities[e] ?? []) {
      const c = ctx.state.cities[cid];
      if (!c.port) continue;
      const d = ctx.grid.distance(c.hex, from);
      if (d < bd) {
        bd = d;
        best = c.hex;
      }
    }
  }
  return best;
}

export function runNaval(ctx: AIContext, me: number, mem: NationMemory, batch: OrderBatch, input: NavalInput): void {
  const ships = ctx.units.naval[me];
  if (!ships || ships.length === 0) return;
  const grid = ctx.grid;
  const game = ctx.game;
  const hour = ctx.state.hour;
  const stations = homeStations(ctx, me);
  const seaEnemies = input.hot.filter((e) => (ctx.terr.coastal[e]?.length ?? 0) > 0);

  // Visible enemy ships.
  const enemyShips: { hex: number; p: number }[] = [];
  for (const e of seaEnemies) {
    for (const u of ctx.units.naval[e] ?? []) {
      if (!game.isVisible(me, u.hex)) continue;
      const info = ctx.design(u.design);
      if (info) enemyShips.push({ hex: u.hex, p: unitNavalPower(info, u) });
    }
  }
  // Escort targets from amphibious operations.
  const escort = mem.amphib.filter((o) => o.stage !== 'landed').map((o) => adjacentWater(ctx, o.landingHex)).filter((h) => h >= 0);

  // Group into fleets by hex.
  const fleets = new Map<number, Unit[]>();
  for (const u of ships) {
    let l = fleets.get(u.hex);
    if (!l) fleets.set(u.hex, (l = []));
    l.push(u);
  }
  let stationIdx = 0;
  const seaPower = ctx.units.navalPower[me];
  for (const [hex, fleet] of fleets) {
    let fp = 0;
    for (const u of fleet) {
      const info = ctx.design(u.design);
      if (info) fp += unitNavalPower(info, u);
    }
    let target = -1;
    let attack = -1;
    let mission: 'station' | 'hunt' | 'blockade' | 'escort' | 'raid' = 'station';
    const damaged = fleet.every((u) => u.strength < 40);
    if (seaEnemies.length > 0 && !damaged) {
      // Local balance.
      let nearest = -1;
      let nd = Infinity;
      let localEnemy = 0;
      for (const s of enemyShips) {
        const d = grid.distance(s.hex, hex);
        if (d <= 3) localEnemy += s.p;
        if (d < nd && d <= 15) {
          nd = d;
          nearest = s.hex;
        }
      }
      if (nearest >= 0) {
        let there = 0;
        for (const s of enemyShips) if (grid.distance(s.hex, nearest) <= 1) there += s.p;
        if (fp >= there * 1.2) {
          attack = nearest;
          mission = 'hunt';
        } else if (localEnemy > fp * 1.2) {
          mission = 'station'; // withdraw under the guns of home ports
        }
      }
      if (attack < 0 && mission === 'station' && escort.length) {
        target = escort[0];
        mission = 'escort';
      }
      const enemyNavy = seaEnemies.reduce((s, e) => s + ctx.units.navalPower[e], 0);
      if (attack < 0 && mission === 'station' && seaPower > enemyNavy * 1.2) {
        const port = nearestEnemyPort(ctx, seaEnemies, hex);
        if (port >= 0 && grid.distance(port, hex) < 60) {
          target = adjacentWater(ctx, port);
          mission = 'blockade';
        }
      }
      // Bombard coastal enemy stacks within gun range.
      if (attack < 0 && (mission === 'blockade' || mission === 'escort')) {
        let range = 0;
        for (const u of fleet) range = Math.max(range, ctx.design(u.design)?.d.rangeGround ?? 0);
        if (range >= 1) {
          let bp = 0;
          for (const [h, p] of input.hotPower) {
            if (grid.distance(h, hex) <= range && p > bp) {
              bp = p;
              attack = h;
            }
          }
        }
      }
    }
    if (mission === 'station') {
      const prev = mem.fleets.get(fleet[0].id);
      if (prev && prev.mission === 'station' && stations.includes(prev.target)) target = prev.target;
      else if (stations.length) target = stations[stationIdx++ % Math.min(3, stations.length)];
      else target = hex;
    }
    for (const u of fleet) {
      const prev = mem.fleets.get(u.id);
      const tgt = attack >= 0 ? attack : target;
      const sameAsBefore = !!prev && prev.target === tgt;
      mem.fleets.set(u.id, { mission, target: tgt, issuedHour: sameAsBefore ? prev!.issuedHour : hour });
      if (attack >= 0) {
        if (!(u.order.type === 'attack' && u.order.targetHex === attack)) batch.attack(u, attack);
      } else if (target >= 0 && !headingTo(u, target)) {
        // Re-issue at most twice a day for the same destination (unreachable stations stay quiet).
        if (!sameAsBefore || hour - prev!.issuedHour >= 12) {
          batch.move(u, target);
          mem.fleets.set(u.id, { mission, target: tgt, issuedHour: hour });
        }
      }
      batch.stance(u, mission === 'station' ? 'defensive' : 'aggressive');
    }
  }
}

// ---------------------------------------------------------------------------
// Amphibious operations
// ---------------------------------------------------------------------------
export function planAmphibious(ctx: AIContext, me: number, mem: NationMemory, batch: OrderBatch, input: NavalInput): void {
  const hour = ctx.state.hour;
  const grid = ctx.grid;
  const state = ctx.state;
  // Progress existing operations.
  for (const op of [...mem.amphib]) progressAmphib(ctx, me, mem, batch, op, input);
  if (mem.amphib.length >= 1 || hour < mem.amphibRetryHour) return;
  if (input.hot.length === 0) return;
  const ports = (ctx.terr.cities[me] ?? []).map((id) => state.cities[id]).filter((c) => c.port);
  if (ports.length === 0) return;
  const myNavy = ctx.units.navalPower[me];
  for (const e of input.hot) {
    // Only where no land route exists (islands / overseas).
    if (ctx.terr.mainBorderLength(me, e) > 0) continue;
    if (myNavy < 1.2 * ctx.units.navalPower[e] || myNavy < 50) continue;
    // Target: enemy coastal city, weakly held, near one of our ports.
    let best: { city: number; landing: number; port: number; score: number; def: number } | null = null;
    for (const cid of ctx.terr.cities[e] ?? []) {
      const c = state.cities[cid];
      const w = state.world;
      if (!w.hexCoast[c.hex] && !c.port) continue;
      const port = ports.reduce((a, b) => (grid.distance(a.hex, c.hex) <= grid.distance(b.hex, c.hex) ? a : b));
      const dist = grid.distance(port.hex, c.hex);
      if (dist > 80) continue;
      let def = 0;
      for (const [h, p] of input.hotPower) if (grid.distance(h, c.hex) <= 3) def += p;
      // Landing hex: enemy coastal land hex within 2 of the city, fewest defenders.
      let landing = -1;
      let lScore = Infinity;
      grid.forRadius(c.hex, 2, (h, d) => {
        if (ctx.terr.water[h] || !w.hexCoast[h] || ctx.owner(h) !== e) return;
        const s = (input.hotPower.get(h) ?? 0) * 3 + d;
        if (s < lScore) {
          lScore = s;
          landing = h;
        }
      });
      if (landing < 0) continue;
      const value = 2 + Math.log10(1 + c.population) * 1.5 + (c.capital ? 4 : 0);
      const score = value / (1 + dist / 20) / (1 + def / 60);
      if (!best || score > best.score) best = { city: cid, landing, port: port.hex, score, def };
    }
    if (!best) continue;
    // Choose the landing force from reserves and quiet units.
    const cands = ctx.units.land[me]
      .filter((u) => {
        const it = mem.intents.get(u.id);
        if (u.embarked || u.strength < 70 || !ctx.terr.reachable(u.hex, best!.port)) return false;
        if (it && (it.role === 'offense' || it.role === 'refit' || it.role === 'amphib')) return false;
        if (it && it.role === 'garrison' && it.key === ctx.capitalHex(me)) return false;
        const info = ctx.design(u.design);
        return !!info && (info.role === 'line' || info.role === 'mobile' || info.role === 'recon');
      })
      .sort((a, b) => grid.distance(a.hex, best!.port) - grid.distance(b.hex, best!.port) || a.id - b.id);
    const required = Math.max(best.def * 2.2, 90);
    const chosen: Unit[] = [];
    let power = 0;
    for (const u of cands) {
      if (power >= required || chosen.length >= 10) break;
      const info = ctx.design(u.design)!;
      chosen.push(u);
      power += unitGroundPower(info, u);
    }
    if (power < required || chosen.length < 2) {
      remember(mem, hour, 'military', `amphibious assault on ${state.cities[best.city].name} not possible yet (${power.toFixed(0)}/${required.toFixed(0)})`);
      mem.amphibRetryHour = hour + 3 * 24;
      continue;
    }
    const op: AmphibOp = {
      id: mem.nextId++,
      enemy: e,
      targetCity: best.city,
      landingHex: best.landing,
      port: best.port,
      units: chosen.map((u) => u.id),
      stage: 'assemble',
      startHour: hour,
      stageHour: hour,
    };
    for (const u of chosen) setIntent(mem, u, 'amphib', op.id, best.port);
    mem.amphib.push(op);
    remember(mem, hour, 'military', `amphibious operation #${op.id}: ${chosen.length} units to land near ${state.cities[best.city].name}`);
    ctx.globalLog(me, 'amphib', `${ctx.nation(me).name} assembles an amphibious force (${chosen.length} units) to invade ${ctx.nation(e).name} near ${state.cities[best.city].name}`);
    progressAmphib(ctx, me, mem, batch, op, input);
    return;
  }
}

function endAmphib(ctx: AIContext, me: number, mem: NationMemory, op: AmphibOp, why: string, retryDays = 10): void {
  mem.amphib.splice(mem.amphib.indexOf(op), 1);
  mem.amphibRetryHour = ctx.state.hour + retryDays * 24;
  for (const id of op.units) {
    const it = mem.intents.get(id);
    if (it?.role === 'amphib') mem.intents.delete(id);
  }
  remember(mem, ctx.state.hour, 'military', `amphibious op #${op.id} ended: ${why}`);
}

function progressAmphib(ctx: AIContext, me: number, mem: NationMemory, batch: OrderBatch, op: AmphibOp, input: NavalInput): void {
  const state = ctx.state;
  const hour = state.hour;
  const grid = ctx.grid;
  const units = op.units.map((id) => state.units.get(id)).filter((u): u is Unit => !!u && u.nation === me);
  op.units = units.map((u) => u.id);
  if (!input.hot.includes(op.enemy)) return endAmphib(ctx, me, mem, op, 'war over', 0);
  if (units.length === 0) return endAmphib(ctx, me, mem, op, 'force lost');
  if (ctx.owner(op.port) !== me) return endAmphib(ctx, me, mem, op, 'port lost');
  if (op.stage === 'assemble') {
    let at = 0;
    for (const u of units) {
      const it = setIntent(mem, u, 'amphib', op.id, op.port);
      if (u.hex === op.port) at++;
      else ensureAt(batch, ctx, it, u, op.port);
    }
    if (at >= units.length * 0.75 || hour - op.stageHour > 120) {
      op.stage = 'sail';
      op.stageHour = hour;
      const ready = units.filter((u) => u.hex === op.port);
      if (ready.length === 0) return endAmphib(ctx, me, mem, op, 'force failed to assemble');
      const r = ctx.game.moveUnits(ready.map((u) => u.id), op.landingHex);
      if (!r.ok) return endAmphib(ctx, me, mem, op, `cannot sail (${r.reason ?? 'no route'})`);
      op.units = ready.map((u) => u.id);
      for (const u of units) if (!ready.includes(u)) mem.intents.delete(u.id);
      for (const u of ready) setIntent(mem, u, 'amphib', op.id, op.landingHex);
      remember(mem, hour, 'military', `amphibious force #${op.id} sails`);
    }
    return;
  }
  if (op.stage === 'sail') {
    const landed = units.filter((u) => !u.embarked && !ctx.terr.water[u.hex] && grid.distance(u.hex, op.landingHex) <= 2);
    const stillAtSea = units.filter((u) => u.embarked);
    if (landed.length > 0 && stillAtSea.length === 0) {
      op.stage = 'landed';
      // Continue ashore as a land offensive toward the target city.
      const city = state.cities[op.targetCity];
      let power = 0;
      for (const u of landed) {
        const info = ctx.design(u.design);
        if (info) power += unitGroundPower(info, u);
      }
      const off: Offensive = {
        id: mem.nextId++,
        enemy: op.enemy,
        objective: city.hex,
        objectiveCity: op.targetCity,
        staging: op.landingHex,
        units: landed.map((u) => u.id),
        support: [],
        stage: 'attack',
        startHour: hour,
        stageHour: hour,
        initialPower: power,
        bestDist: Infinity,
        lastProgressHour: hour,
        captured: 0,
        reason: `${city.name} (beachhead)`,
      };
      mem.offensives.push(off);
      for (const u of landed) setIntent(mem, u, 'offense', off.id, city.hex);
      mem.amphib.splice(mem.amphib.indexOf(op), 1);
      ctx.globalLog(me, 'amphib', `${ctx.nation(me).name} lands ${landed.length} units near ${city.name}`);
      return;
    }
    // Re-issue if the force stopped (e.g. path blocked) without landing.
    for (const u of units) {
      if (u.embarked || u.hex === op.port) {
        if (u.order.type !== 'move' || u.order.targetHex !== op.landingHex) {
          if (hour - op.stageHour > 6) batch.move(u, op.landingHex);
        }
      }
    }
    if (hour - op.stageHour > 24 * 10) return endAmphib(ctx, me, mem, op, 'invasion timed out');
  }
}

export function isNaval(cls: UnitClass): boolean {
  return cls === UnitClass.Naval;
}
