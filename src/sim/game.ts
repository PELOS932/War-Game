/**
 * Game: implements the GameAPI contract by wiring the simulation modules
 * together (hourly military tick, daily economy/diplomacy/research tick, AI).
 */
import type { CommandResult, GameAPI } from './api';
import { createAI, type AIController } from './ai/index';
import { Sim } from './core';
import { buildScenario, UnitNamer } from './scenario';
import { Visibility } from './visibility';
import { MarketBook, manualTrade } from './market';
import { economyDay, issueBonds, repayDebt } from './economy';
import { constructionDay, buildFacility, upgradeFacility, canBuildFacility } from './construction';
import { productionDay, queueUnit, cancelProduction, availableDesigns, canBuildUnitAt } from './production';
import { researchDay, canResearch, availableTechs } from './research';
import * as dip from './diplomacy';
import { PathSearch, profileFor } from './military/pathing';
import { movementHour, repath } from './military/movement';
import { combatHour, encirclementDay } from './military/combat';
import { airHour } from './military/air';
import { supplyAt, supplyUnitsHour } from './military/supply';
import { destroyUnit, militaryPower, refreshNationCounts } from './military/units';
import { NameGenerator } from '../worldgen/names';
import { RNG } from '../core/rng';
import type { WorldData } from '../worldgen/types';
import {
  SPEED_HOURS_PER_SECOND, UnitClass,
  type Department, type FacilityType, type GameEvent, type GameState, type NationId, type OrderType,
  type Resource, type Spending, type Stance, type Taxes, type TradePolicy, type TreatyType, type Unit,
} from './types';

const OK: CommandResult = { ok: true };
const fail = (reason: string): CommandResult => ({ ok: false, reason });
const MAX_RESEARCH_SLOTS = 5;

export class Game implements GameAPI {
  readonly sim: Sim;
  readonly state: GameState;
  readonly seed: number;
  private search: PathSearch;
  private vis: Visibility;
  private book: MarketBook;
  private namer: UnitNamer;
  private ai: AIController;
  private acc = 0;

  constructor(world: WorldData, state: GameState, seed: number) {
    this.seed = seed;
    this.state = state;
    this.sim = new Sim(world, state);
    this.search = new PathSearch(this.sim);
    this.vis = new Visibility(this.sim);
    this.sim.vis = this.vis;
    this.book = new MarketBook(state.nations.length);
    this.namer = new UnitNamer(new NameGenerator(), new RNG(seed ^ 0x51ab));
    this.vis.refreshAll();
    this.ai = createAI(this);
  }

  get hourFraction(): number {
    return this.acc;
  }

  // ----- time ------------------------------------------------------------------
  advance(realSeconds: number): void {
    if (this.state.gameOver) return;
    const rate = SPEED_HOURS_PER_SECOND[this.state.speed] ?? 0;
    if (!rate) return;
    this.acc += realSeconds * rate;
    let n = Math.floor(this.acc);
    this.acc -= n;
    n = Math.min(n, 6); // avoid spiral of death on slow frames
    for (let i = 0; i < n; i++) this.tick();
  }

  stepHours(n: number): void {
    for (let i = 0; i < n; i++) this.tick();
  }

  setSpeed(speed: number): void {
    this.state.speed = Math.max(0, Math.min(5, Math.round(speed)));
  }

  private tick(): void {
    const st = this.state;
    const sim = this.sim;
    st.hour++;
    const safe = (name: string, fn: () => void) => {
      try {
        fn();
      } catch (err) {
        console.error(`[sim] ${name} failed`, err);
      }
    };
    safe('movement', () => movementHour(sim, this.search));
    safe('combat', () => combatHour(sim));
    safe('air', () => airHour(sim));
    safe('supply', () => supplyUnitsHour(sim));
    safe('visibility', () => this.vis.tick());
    safe('ai-hour', () => this.ai.onHour(st.hour));
    if (st.hour % 24 === 0) {
      const day = st.hour / 24;
      safe('economy', () => economyDay(sim, this.book));
      safe('construction', () => constructionDay(sim));
      safe('production', () => productionDay(sim, this.namer));
      safe('research', () => researchDay(sim));
      safe('diplomacy', () => dip.diplomacyDay(sim));
      safe('encirclement', () => encirclementDay(sim));
      safe('counts', () => refreshNationCounts(sim));
      safe('ai-day', () => this.ai.onDay(day));
      this.checkGameOver();
    }
  }

  private checkGameOver(): void {
    const st = this.state;
    const p = st.nations[st.playerNation];
    if (p && !p.alive && !st.gameOver) st.gameOver = { winner: -1, reason: `${p.name} has been defeated.` };
  }

  // ----- events & queries -------------------------------------------------------
  on(listener: (e: GameEvent) => void): () => void {
    return this.sim.on(listener);
  }

  unitsAt(hex: number): Unit[] {
    return this.sim.unitsIn(hex);
  }

  atWar(a: NationId, b: NationId): boolean {
    return this.sim.atWar(a, b);
  }

  relation(a: NationId, b: NationId): number {
    return this.state.relations[a * this.state.nations.length + b] ?? 0;
  }

  hasTreaty(a: NationId, b: NationId, type: TreatyType): boolean {
    return this.sim.hasTreaty(a, b, type);
  }

  isVisible(nation: NationId, hex: number): boolean {
    return this.vis.isVisible(nation, hex);
  }

  supplyAt(nation: NationId, hex: number): number {
    return supplyAt(this.sim, nation, hex);
  }

  findPath(unitIds: number[], targetHex: number): number[] | null {
    const u = this.units(unitIds)[0];
    if (!u) return null;
    const d = this.sim.design(u);
    if (d.cls === UnitClass.Air) return [u.hex, targetHex];
    const p = profileFor(this.sim, u, d.cls === UnitClass.Naval ? 'naval' : 'land');
    let path = this.search.find(u.hex, targetHex, p, 40000);
    if (!path && d.cls === UnitClass.Land) path = this.search.find(u.hex, targetHex, { ...p, mode: 'amphibious' }, 40000);
    return path ? [u.hex, ...path] : null;
  }

  militaryPower(nation: NationId): number {
    return militaryPower(this.sim, nation);
  }

  availableDesigns(nation: NationId): string[] {
    return availableDesigns(this.sim, this.state.nations[nation]);
  }

  availableTechs(nation: NationId): string[] {
    return availableTechs(this.sim, this.state.nations[nation]);
  }

  canBuildFacility(nation: NationId, type: FacilityType, hex: number): CommandResult {
    return canBuildFacility(this.sim, nation, type, hex);
  }

  canBuildUnitAt(nation: NationId, designId: string, cityId: number): CommandResult {
    return canBuildUnitAt(this.sim, nation, designId, cityId);
  }

  // ----- unit orders ------------------------------------------------------------
  private units(ids: number[]): Unit[] {
    const out: Unit[] = [];
    for (const id of ids) {
      const u = this.state.units.get(id);
      if (u) out.push(u);
    }
    return out;
  }

  private order(ids: number[], type: OrderType, targetHex: number): CommandResult {
    const us = this.units(ids);
    if (!us.length) return fail('No units selected');
    let any = false;
    for (const u of us) {
      const d = this.sim.design(u);
      if (d.cls === UnitClass.Air) {
        u.order = { type: this.sim.atWar(u.nation, this.ownerOf(targetHex)) ? 'airStrike' : 'airPatrol', targetHex, targetUnit: -1 };
        any = true;
        continue;
      }
      u.order = { type, targetHex, targetUnit: -1 };
      u.path = [];
      repath(this.sim, u, this.search);
      if (u.path.length) any = true;
      else u.order = { type: 'idle', targetHex: -1, targetUnit: -1 };
    }
    return any ? OK : fail('No route to destination');
  }

  private ownerOf(hex: number): NationId {
    return (this.state.hexOwner[hex] ?? 0) - 1;
  }

  moveUnits(ids: number[], targetHex: number): CommandResult {
    return this.order(ids, 'move', targetHex);
  }

  attack(ids: number[], targetHex: number): CommandResult {
    return this.order(ids, 'attack', targetHex);
  }

  holdPosition(ids: number[]): CommandResult {
    for (const u of this.units(ids)) {
      u.path = [];
      u.order = { type: 'hold', targetHex: u.hex, targetUnit: -1 };
    }
    return OK;
  }

  setStance(ids: number[], stance: Stance): CommandResult {
    for (const u of this.units(ids)) u.stance = stance;
    return OK;
  }

  retreat(ids: number[]): CommandResult {
    const us = this.units(ids);
    for (const u of us) {
      let best = -1, bestD = Infinity;
      for (const c of this.state.cities) {
        if (this.ownerOf(c.hex) !== u.nation) continue;
        const dd = this.state.grid.distance(u.hex, c.hex);
        if (dd < bestD) { bestD = dd; best = c.hex; }
      }
      if (best >= 0) this.order([u.id], 'retreat', best);
    }
    return OK;
  }

  airMission(ids: number[], mission: 'airStrike' | 'airPatrol' | 'airIntercept', targetHex: number): CommandResult {
    const us = this.units(ids).filter((u) => this.sim.design(u).cls === UnitClass.Air);
    if (!us.length) return fail('Select air units');
    for (const u of us) u.order = { type: mission === 'airIntercept' ? 'airPatrol' : mission, targetHex, targetUnit: -1 };
    return OK;
  }

  rebase(ids: number[], baseHex: number): CommandResult {
    const us = this.units(ids).filter((u) => this.sim.design(u).cls === UnitClass.Air);
    if (!us.length) return fail('Select air units');
    for (const u of us) u.order = { type: 'rebase', targetHex: baseHex, targetUnit: -1 };
    return OK;
  }

  reinforce(ids: number[]): CommandResult {
    let done = 0;
    for (const u of this.units(ids)) {
      if (u.strength >= 99) continue;
      const n = this.state.nations[u.nation];
      if (this.ownerOf(u.hex) !== u.nation || supplyAt(this.sim, u.nation, u.hex) < 30) continue;
      const d = this.sim.design(u);
      const cost = (d.cost * (100 - u.strength)) / 100 / 1000 * 0.7; // billions
      if (n.treasury < cost) continue;
      this.sim.spend(u.nation, 'Reinforcements', cost);
      u.strength = 100;
      u.efficiency = Math.max(40, u.efficiency - 10);
      done++;
    }
    return done ? OK : fail('Units must be in supplied home territory and funds available');
  }

  disband(ids: number[]): CommandResult {
    for (const u of this.units(ids)) destroyUnit(this.sim, u, null, true);
    return OK;
  }

  // ----- production & construction ---------------------------------------------
  queueUnit(nation: NationId, designId: string, cityId: number, count: number): CommandResult {
    return queueUnit(this.sim, nation, designId, cityId, count);
  }

  cancelProduction(nation: NationId, itemId: number): CommandResult {
    return cancelProduction(this.sim, nation, itemId);
  }

  buildFacility(nation: NationId, type: FacilityType, hex: number): CommandResult {
    return buildFacility(this.sim, nation, type, hex);
  }

  upgradeFacility(nation: NationId, facilityId: number): CommandResult {
    return upgradeFacility(this.sim, nation, facilityId);
  }

  // ----- economy ------------------------------------------------------------------
  setTaxes(nation: NationId, taxes: Partial<Taxes>): CommandResult {
    const t = this.state.nations[nation].taxes;
    if (taxes.income !== undefined) t.income = clamp(taxes.income, 0, 0.7);
    if (taxes.corporate !== undefined) t.corporate = clamp(taxes.corporate, 0, 0.6);
    if (taxes.sales !== undefined) t.sales = clamp(taxes.sales, 0, 0.4);
    return OK;
  }

  setSpending(nation: NationId, spending: Partial<Spending>): CommandResult {
    const s = this.state.nations[nation].spending as unknown as Record<string, number>;
    for (const [k, v] of Object.entries(spending)) if (typeof v === 'number' && k in s) s[k] = clamp(v, 0, 0.2);
    return OK;
  }

  setMilitaryBudget(nation: NationId, fraction: number): CommandResult {
    this.state.nations[nation].militaryBudget = clamp(fraction, 0, 0.3);
    return OK;
  }

  setResearchBudget(nation: NationId, fraction: number): CommandResult {
    this.state.nations[nation].researchBudget = clamp(fraction, 0, 0.1);
    return OK;
  }

  setTradePolicy(nation: NationId, resource: Resource, policy: TradePolicy): CommandResult {
    this.state.nations[nation].tradePolicy[resource] = policy;
    return OK;
  }

  marketTrade(nation: NationId, resource: Resource, amount: number): CommandResult {
    const err = manualTrade(this.sim, this.state.nations[nation], resource, amount);
    return err ? fail(err) : OK;
  }

  issueBonds(nation: NationId, billions: number): CommandResult {
    return issueBonds(this.state.nations[nation], billions) ? OK : fail('Credit limit reached');
  }

  repayDebt(nation: NationId, billions: number): CommandResult {
    return repayDebt(this.state.nations[nation], billions) ? OK : fail('Insufficient funds');
  }

  // ----- research -----------------------------------------------------------------
  startResearch(nation: NationId, techId: string): CommandResult {
    const n = this.state.nations[nation];
    const err = canResearch(this.sim, n, techId);
    if (err) return fail(err);
    if (n.researching.some((r) => r.techId === techId)) return fail('Already researching');
    if (n.researching.length >= MAX_RESEARCH_SLOTS) return fail('All research slots are busy');
    n.researching.push({ techId, progress: 0 });
    return OK;
  }

  cancelResearch(nation: NationId, techId: string): CommandResult {
    const n = this.state.nations[nation];
    n.researching = n.researching.filter((r) => r.techId !== techId);
    return OK;
  }

  // ----- diplomacy ------------------------------------------------------------------
  proposeTreaty(from: NationId, to: NationId, type: TreatyType): CommandResult {
    return dip.proposeTreaty(this.sim, from, to, type);
  }

  cancelTreaty(from: NationId, to: NationId, type: TreatyType): CommandResult {
    return dip.cancelTreaty(this.sim, from, to, type);
  }

  declareWar(from: NationId, to: NationId): CommandResult {
    return dip.declareWar(this.sim, from, to);
  }

  offerPeace(from: NationId, to: NationId): CommandResult {
    return dip.offerPeace(this.sim, from, to);
  }

  sendAid(from: NationId, to: NationId, billions: number): CommandResult {
    const a = this.state.nations[from], b = this.state.nations[to];
    if (!a || !b || billions <= 0) return fail('Invalid aid');
    if (a.treasury < billions) return fail('Insufficient funds');
    this.sim.spend(from, 'Foreign Aid', billions);
    this.sim.earn(to, 'Foreign Aid', billions);
    this.bumpRelation(from, to, Math.min(25, (billions / Math.max(1, b.gdp)) * 800 + 2));
    return OK;
  }

  improveRelations(from: NationId, to: NationId): CommandResult {
    const a = this.state.nations[from];
    const cost = Math.max(0.05, a.gdp * 0.0002);
    if (a.treasury < cost) return fail('Insufficient funds');
    this.sim.spend(from, 'Diplomacy', cost);
    this.bumpRelation(from, to, 3);
    return OK;
  }

  private bumpRelation(a: NationId, b: NationId, delta: number): void {
    const N = this.state.nations.length;
    const r = this.state.relations;
    r[a * N + b] = clamp(r[a * N + b] + delta, -100, 100);
    r[b * N + a] = clamp(r[b * N + a] + delta, -100, 100);
  }

  respondProposal(proposalId: number, accept: boolean): CommandResult {
    return dip.respondProposal(this.sim, proposalId, accept);
  }

  setDefcon(nation: NationId, level: number): CommandResult {
    this.state.nations[nation].defcon = clamp(Math.round(level), 1, 5);
    return OK;
  }

  setAutonomy(nation: NationId, dept: Department, aiControlled: boolean): CommandResult {
    this.state.nations[nation].autonomy[dept] = aiControlled;
    return OK;
  }
}

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function createGame(world: WorldData, playerNation: NationId, seed = 2030): GameAPI {
  const state = buildScenario(world, playerNation, seed);
  return new Game(world, state, seed);
}
