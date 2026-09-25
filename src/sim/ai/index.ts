/**
 * SHARED CONTRACT — AI entry point (implemented by the AI agent).
 * The simulation calls these hooks from its tick loop:
 *   - onHour(hour) every game hour (keep it cheap; stagger work across nations)
 *   - onDay(day) once per game day at hour % 24 === 0
 * The AI controls every nation where `!nation.isPlayer`, and for the player
 * nation only the departments where `nation.autonomy[dept]` is true.
 * The AI must issue orders exclusively through the GameAPI commands.
 *
 * Architecture (Supreme Ruler style "ministers" per nation):
 *   - finance/trade/economy (economy.ts)   daily, staggered by nation id
 *   - research (research.ts)               daily, staggered
 *   - defence: threat, budget, DEFCON, production (defense.ts) daily, staggered
 *   - foreign: treaties, war/peace (foreign.ts) weekly + daily fast path
 *   - military command (military/*)        every 2–24 h depending on posture
 */
import type { GameAPI } from '../api';
import type { GameEvent } from '../types';
import { AIContext, type AIGlobalLogEntry } from './context';
import { remember, type NationMemory } from './memory';
import { runEconomy, runFinance, runTrade } from './economy';
import { runResearch } from './research';
import { assessThreats, runDefcon, runDefenseBudget, runProduction, updatePosture } from './defense';
import { runForeign, runForeignDaily } from './foreign';
import { commandPeriod, runMilitary } from './military/command';

export interface AIController {
  onHour(hour: number): void;
  onDay(day: number): void;
}

const now: () => number = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();

export interface AIDebugInfo {
  nation: number;
  name: string;
  posture: string;
  threat: number;
  threatSources: string[];
  warPlan: null | { target: string; reason: string; declareInHours: number };
  fronts: { adversary: string; sectors: number; threat: number; assigned: number; demand: number; hot: boolean }[];
  offensives: { id: number; enemy: string; objective: number; reason: string; stage: string; units: number; power: number }[];
  amphib: { id: number; enemy: string; city: string; stage: string; units: number }[];
  intents: Record<string, number>;
  productionPlan: string;
  log: string[];
}

class AIRuntime {
  readonly ctx: AIContext;
  private lastHour = -1;
  private warParticipants = new Map<number, number[]>();

  constructor(game: GameAPI) {
    this.ctx = new AIContext(game);
    for (const w of game.state.wars) this.warParticipants.set(w.id, [...w.attackers, ...w.defenders]);
    game.on((e) => this.onEvent(e));
  }

  private onEvent(e: GameEvent): void {
    const ctx = this.ctx;
    switch (e.type) {
      case 'warDeclared': {
        const w = ctx.state.wars.find((x) => x.id === e.war);
        const parts = w ? [...w.attackers, ...w.defenders] : [e.attacker, e.defender];
        this.warParticipants.set(e.war, parts);
        for (const p of parts) {
          const mem = ctx.mem[p];
          if (!mem) continue;
          mem.posture = 'war';
          mem.nextCommandHour = Math.min(mem.nextCommandHour, ctx.state.hour + 1);
        }
        break;
      }
      case 'peace': {
        const parts = this.warParticipants.get(e.war) ?? [];
        for (const a of parts) {
          const mem = ctx.mem[a];
          if (!mem) continue;
          for (const b of parts) if (a !== b) mem.lastWarEnd.set(b, ctx.state.hour);
        }
        this.warParticipants.delete(e.war);
        break;
      }
      case 'cityCaptured': {
        const c = ctx.state.cities[e.city];
        ctx.globalLog(e.to, 'capture', `${ctx.nation(e.to)?.name} captured ${c?.name ?? e.city} from ${ctx.nation(e.from)?.name}`);
        const mem = ctx.mem[e.to];
        if (mem) remember(mem, ctx.state.hour, 'military', `captured ${c?.name}`);
        break;
      }
      default:
        break;
    }
  }

  onHour(hour: number): void {
    if (hour === this.lastHour) return;
    this.lastHour = hour;
    const t0 = now();
    const ctx = this.ctx;
    const state = ctx.state;
    ctx.ensureMemories();
    const anyWar = state.wars.length > 0;
    ctx.terr.refresh(state, anyWar ? 3 : 12);
    const n = state.nations.length;
    const slot = ((hour % 24) + 24) % 24;
    const weekSlot = ((hour % 168) + 168) % 168;

    // Daily ministers, staggered: nation i runs at hour-of-day i % 24.
    for (let i = slot; i < n; i += 24) this.runDaily(i);
    // Weekly foreign policy review, staggered over the week.
    for (let i = weekSlot; i < n; i += 168) this.runWeekly(i);

    // Military command by posture period.
    for (let i = 0; i < n; i++) {
      const nat = state.nations[i];
      if (!nat.alive) continue;
      const mem = ctx.mem[i];
      if (hour < mem.nextCommandHour) continue;
      const period = commandPeriod(mem.posture);
      mem.nextCommandHour = hour + period;
      if (!ctx.controls(i, 'military')) continue;
      const t = now();
      try {
        runMilitary(ctx, i, mem);
      } catch (err) {
        this.report('military', i, err);
      }
      this.addTiming('military', now() - t);
    }

    const dt = now() - t0;
    ctx.timing.hourTotal += dt;
    ctx.timing.hours++;
    if (dt > ctx.timing.maxHour) ctx.timing.maxHour = dt;
  }

  onDay(day: number): void {
    void day;
    const ctx = this.ctx;
    const units = ctx.state.units;
    for (const mem of ctx.mem) {
      for (const id of mem.intents.keys()) if (!units.has(id)) mem.intents.delete(id);
      for (const id of mem.fleets.keys()) if (!units.has(id)) mem.fleets.delete(id);
      for (const id of mem.reinforceHour.keys()) if (!units.has(id)) mem.reinforceHour.delete(id);
      for (const id of mem.refitSince.keys()) if (!units.has(id)) mem.refitSince.delete(id);
      for (const id of mem.airRebaseHour.keys()) if (!units.has(id)) mem.airRebaseHour.delete(id);
    }
  }

  private runDaily(i: number): void {
    const ctx = this.ctx;
    const nat = ctx.state.nations[i];
    if (!nat || !nat.alive) return;
    const mem = ctx.mem[i];
    const step = (dept: string, fn: () => void) => {
      const t = now();
      try {
        fn();
      } catch (err) {
        this.report(dept, i, err);
      }
      this.addTiming(dept, now() - t);
    };
    ctx.refreshUnits();
    step('threat', () => {
      assessThreats(ctx, i, mem);
      updatePosture(ctx, i, mem);
    });
    const prevPeriod = commandPeriod(mem.posture);
    if (mem.nextCommandHour > ctx.state.hour + prevPeriod) mem.nextCommandHour = ctx.state.hour + (i % prevPeriod);
    if (ctx.controls(i, 'military')) {
      step('defense', () => {
        runDefenseBudget(ctx, i, mem);
        runDefcon(ctx, i, mem);
      });
    }
    if (ctx.controls(i, 'production')) step('production', () => runProduction(ctx, i, mem));
    if (ctx.controls(i, 'economy')) {
      step('finance', () => runFinance(ctx, i, mem));
      step('economy', () => runEconomy(ctx, i, mem));
    }
    if (ctx.controls(i, 'trade')) step('trade', () => runTrade(ctx, i, mem));
    if (ctx.controls(i, 'research')) step('research', () => runResearch(ctx, i, mem));
    if (ctx.controls(i, 'diplomacy')) step('foreign', () => runForeignDaily(ctx, i, mem, !nat.isPlayer));
  }

  private runWeekly(i: number): void {
    const ctx = this.ctx;
    const nat = ctx.state.nations[i];
    if (!nat || !nat.alive || !ctx.controls(i, 'diplomacy')) return;
    const t = now();
    try {
      runForeign(ctx, i, ctx.mem[i], !nat.isPlayer);
    } catch (err) {
      this.report('foreign', i, err);
    }
    this.addTiming('foreign', now() - t);
  }

  private errors = 0;
  private report(dept: string, nation: number, err: unknown): void {
    this.errors++;
    if (this.errors <= 20) console.error(`[AI] ${dept} failed for nation ${nation}:`, err);
  }

  private addTiming(dept: string, ms: number): void {
    const m = this.ctx.timing.byDept;
    m.set(dept, (m.get(dept) ?? 0) + ms);
  }

  debug(nationId: number): AIDebugInfo | null {
    const ctx = this.ctx;
    const nat = ctx.state.nations[nationId];
    const mem: NationMemory | undefined = ctx.mem[nationId];
    if (!nat || !mem) return null;
    const name = (i: number) => ctx.state.nations[i]?.name ?? String(i);
    const fronts = new Map<number, AIDebugInfo['fronts'][number]>();
    for (const s of mem.fronts) {
      let f = fronts.get(s.adversary);
      if (!f) fronts.set(s.adversary, (f = { adversary: name(s.adversary), sectors: 0, threat: 0, assigned: 0, demand: 0, hot: s.hot }));
      f.sectors++;
      f.threat += s.threat;
      f.assigned += s.assigned;
      f.demand += s.demand;
    }
    const intents: Record<string, number> = {};
    for (const it of mem.intents.values()) intents[it.role] = (intents[it.role] ?? 0) + 1;
    return {
      nation: nationId,
      name: nat.name,
      posture: mem.posture,
      threat: mem.threat,
      threatSources: mem.threatSources.map(name),
      warPlan: mem.warPlan ? { target: name(mem.warPlan.target), reason: mem.warPlan.reason, declareInHours: mem.warPlan.declareHour - ctx.state.hour } : null,
      fronts: [...fronts.values()],
      offensives: mem.offensives.map((o) => {
        let power = 0;
        for (const id of o.units) {
          const u = ctx.state.units.get(id);
          const info = u && ctx.design(u.design);
          if (u && info) power += info.ground * u.strength / 100;
        }
        return { id: o.id, enemy: name(o.enemy), objective: o.objective, reason: o.reason, stage: o.stage, units: o.units.length, power: Math.round(power) };
      }),
      amphib: mem.amphib.map((a) => ({ id: a.id, enemy: name(a.enemy), city: ctx.state.cities[a.targetCity]?.name ?? '?', stage: a.stage, units: a.units.length })),
      intents,
      productionPlan: mem.productionPlan,
      log: mem.log.slice(-15).map((l) => `[${l.hour}] ${l.dept}: ${l.text}`),
    };
  }
}

let current: AIRuntime | null = null;

export function createAI(game: GameAPI): AIController {
  const rt = new AIRuntime(game);
  current = rt;
  return {
    onHour: (hour: number) => rt.onHour(hour),
    onDay: (day: number) => rt.onDay(day),
  };
}

/** Development/debug view of an AI nation's current plans (last created AI). */
export function getAIDebug(nationId: number): AIDebugInfo | null {
  return current ? current.debug(nationId) : null;
}

/** Global log of major AI decisions (wars, peace, offensives, invasions). */
export function getAILog(): readonly AIGlobalLogEntry[] {
  return current ? current.ctx.log : [];
}

/** AI CPU timing statistics (ms). */
export function getAITiming(): { avgPerHour: number; maxHour: number; byDept: Record<string, number>; hours: number } {
  if (!current) return { avgPerHour: 0, maxHour: 0, byDept: {}, hours: 0 };
  const t = current.ctx.timing;
  const byDept: Record<string, number> = {};
  for (const [k, v] of t.byDept) byDept[k] = v;
  return { avgPerHour: t.hours ? t.hourTotal / t.hours : 0, maxHour: t.maxHour, byDept, hours: t.hours };
}
