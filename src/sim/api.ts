/**
 * SHARED CONTRACT — the interface the simulation exposes to the UI, the
 * renderer and the AI. The AI MUST act only through these commands (the same
 * ones the human player uses), so every nation plays by the same rules.
 *
 * Implemented by `Game` in src/sim/game.ts (simulation agent):
 *   export function createGame(world: WorldData, playerNation: NationId): GameAPI
 */
import type {
  Department, FacilityType, GameEvent, GameState, NationId, Resource, Spending, Stance,
  Taxes, TradePolicy, TreatyType, Unit,
} from './types';

export interface CommandResult {
  ok: boolean;
  reason?: string;
}

export interface GameAPI {
  readonly state: GameState;

  // ----- time -----------------------------------------------------------------
  /** Advance by real seconds at the current speed (runs whole hourly ticks). */
  advance(realSeconds: number): void;
  /** Run exactly n hourly ticks regardless of speed (tests/headless). */
  stepHours(n: number): void;
  setSpeed(speed: number): void;
  /** Fractional progress (0..1) into the current hour, for render interpolation. */
  readonly hourFraction: number;

  // ----- events ---------------------------------------------------------------
  /** Subscribe to transient game events. Returns an unsubscribe function. */
  on(listener: (e: GameEvent) => void): () => void;

  // ----- queries ----------------------------------------------------------------
  unitsAt(hex: number): Unit[];
  atWar(a: NationId, b: NationId): boolean;
  relation(a: NationId, b: NationId): number;
  hasTreaty(a: NationId, b: NationId, type: TreatyType): boolean;
  isVisible(nation: NationId, hex: number): boolean;
  /** Supply level 0..100 at a hex for a nation. */
  supplyAt(nation: NationId, hex: number): number;
  /** Movement path for units (null if unreachable). */
  findPath(unitIds: number[], targetHex: number): number[] | null;
  /** Total military strength estimate (for rankings/AI). */
  militaryPower(nation: NationId): number;
  availableDesigns(nation: NationId): string[];
  availableTechs(nation: NationId): string[];
  canBuildFacility(nation: NationId, type: FacilityType, hex: number): CommandResult;
  canBuildUnitAt(nation: NationId, designId: string, cityId: number): CommandResult;

  // ----- unit orders ------------------------------------------------------------
  moveUnits(ids: number[], targetHex: number): CommandResult;
  attack(ids: number[], targetHex: number): CommandResult;
  holdPosition(ids: number[]): CommandResult;
  setStance(ids: number[], stance: Stance): CommandResult;
  retreat(ids: number[]): CommandResult;
  /** Air units: strike / patrol / intercept at target hex (within combat radius). */
  airMission(ids: number[], mission: 'airStrike' | 'airPatrol' | 'airIntercept', targetHex: number): CommandResult;
  rebase(ids: number[], baseHex: number): CommandResult;
  reinforce(ids: number[]): CommandResult;
  disband(ids: number[]): CommandResult;

  // ----- production & construction ---------------------------------------------
  queueUnit(nation: NationId, designId: string, cityId: number, count: number): CommandResult;
  cancelProduction(nation: NationId, itemId: number): CommandResult;
  buildFacility(nation: NationId, type: FacilityType, hex: number): CommandResult;
  upgradeFacility(nation: NationId, facilityId: number): CommandResult;

  // ----- economy ------------------------------------------------------------------
  setTaxes(nation: NationId, taxes: Partial<Taxes>): CommandResult;
  setSpending(nation: NationId, spending: Partial<Spending>): CommandResult;
  setMilitaryBudget(nation: NationId, fraction: number): CommandResult;
  setResearchBudget(nation: NationId, fraction: number): CommandResult;
  setTradePolicy(nation: NationId, resource: Resource, policy: TradePolicy): CommandResult;
  /** Direct market transaction: positive amount buys, negative sells (units). */
  marketTrade(nation: NationId, resource: Resource, amount: number): CommandResult;
  issueBonds(nation: NationId, billions: number): CommandResult;
  repayDebt(nation: NationId, billions: number): CommandResult;

  // ----- research -----------------------------------------------------------------
  startResearch(nation: NationId, techId: string): CommandResult;
  cancelResearch(nation: NationId, techId: string): CommandResult;

  // ----- diplomacy ------------------------------------------------------------------
  /** Propose a treaty. AI targets answer immediately; human targets get a Proposal. */
  proposeTreaty(from: NationId, to: NationId, type: TreatyType): CommandResult;
  cancelTreaty(from: NationId, to: NationId, type: TreatyType): CommandResult;
  declareWar(from: NationId, to: NationId): CommandResult;
  offerPeace(from: NationId, to: NationId): CommandResult;
  sendAid(from: NationId, to: NationId, billions: number): CommandResult;
  improveRelations(from: NationId, to: NationId): CommandResult;
  respondProposal(proposalId: number, accept: boolean): CommandResult;
  setDefcon(nation: NationId, level: number): CommandResult;

  // ----- government -----------------------------------------------------------------
  setAutonomy(nation: NationId, dept: Department, aiControlled: boolean): CommandResult;
}
