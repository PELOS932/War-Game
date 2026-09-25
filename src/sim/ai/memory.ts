/**
 * Per-nation AI memory: plans, unit intents, offensives, war preparation and
 * a decision log. Lives entirely inside the AI module.
 */
import { RNG } from '../../core/rng';
import { RESOURCE_COUNT } from '../types';

export type UnitRole = 'front' | 'garrison' | 'reserve' | 'offense' | 'refit' | 'support' | 'amphib' | 'coast';

export interface UnitIntent {
  role: UnitRole;
  /** Sector key / garrison city id / offensive id / amphibious op id. */
  key: number;
  /** Hex the unit should be at (or move toward). */
  target: number;
  issuedHour: number;
  /** Consecutive failed commands (backoff). */
  fails: number;
}

export interface Offensive {
  id: number;
  enemy: number;
  objective: number; // target hex
  objectiveCity: number; // city id or -1
  staging: number; // our hex where the group assembles
  units: number[];
  support: number[]; // artillery attached
  stage: 'assemble' | 'attack';
  startHour: number;
  stageHour: number;
  initialPower: number;
  bestDist: number;
  lastProgressHour: number;
  captured: number; // cities captured by this offensive
  reason: string;
}

export interface AmphibOp {
  id: number;
  enemy: number;
  targetCity: number;
  landingHex: number;
  port: number; // our embarkation hex (port city hex)
  units: number[];
  stage: 'assemble' | 'sail' | 'landed';
  startHour: number;
  stageHour: number;
}

export interface WarPlan {
  target: number;
  reason: string;
  startHour: number;
  /** Earliest hour at which war will be declared (after preparation). */
  declareHour: number;
  /** Give up if still not ready at this hour. */
  abandonHour: number;
  score: number;
}

export interface FleetIntent {
  mission: 'station' | 'hunt' | 'blockade' | 'escort' | 'raid';
  target: number;
  issuedHour: number;
}

export interface DecisionLogEntry {
  hour: number;
  dept: string;
  text: string;
}

export type Posture = 'peace' | 'tension' | 'prep' | 'war';

export interface NationMemory {
  id: number;
  rng: RNG;
  posture: Posture;
  /** Next hour the military command runs for this nation. */
  nextCommandHour: number;
  intents: Map<number, UnitIntent>;
  offensives: Offensive[];
  amphib: AmphibOp[];
  fleets: Map<number, FleetIntent>; // naval unit id -> intent
  airRebaseHour: Map<number, number>; // air unit id -> last rebase hour
  warPlan: WarPlan | null;
  /** Nations whose war we joined / decided to join: target -> hour. */
  pendingJoin: Map<number, number>;
  lastProposal: Map<string, number>;
  lastPeaceOffer: Map<number, number>;
  lastWarEnd: Map<number, number>;
  /** EMA of daily resource balance (production - consumption + traded). */
  balanceEma: Float64Array;
  /** Days the resource has been in deficit (consecutive). */
  deficitDays: Float64Array;
  lastBuildHour: number;
  threat: number; // 0..1 overall threat level
  threatSources: number[];
  /** Visible enemy composition estimates (0..1 shares). */
  enemyArmor: number;
  enemyAir: number;
  enemyNaval: number;
  log: DecisionLogEntry[];
  nextId: number;
  commandFails: number;
  /** Cached fronts for this nation: built from territory version. */
  frontsVersion: number;
  fronts: FrontSector[];
  /** Last computed desired production shares (debug). */
  productionPlan: string;
  lastTaxChangeHour: number;
}

export interface FrontSector {
  key: number; // anchor hex (stable while the border does not change)
  adversary: number;
  hexes: number[];
  anchor: number;
  threat: number;
  value: number;
  demand: number;
  assigned: number;
  hot: boolean; // at war with the adversary
}

export function createMemory(id: number, seed: number): NationMemory {
  return {
    id,
    rng: new RNG((seed ^ Math.imul(id + 1, 0x9e3779b1)) >>> 0),
    posture: 'peace',
    nextCommandHour: 0,
    intents: new Map(),
    offensives: [],
    amphib: [],
    fleets: new Map(),
    airRebaseHour: new Map(),
    warPlan: null,
    pendingJoin: new Map(),
    lastProposal: new Map(),
    lastPeaceOffer: new Map(),
    lastWarEnd: new Map(),
    balanceEma: new Float64Array(RESOURCE_COUNT),
    deficitDays: new Float64Array(RESOURCE_COUNT),
    lastBuildHour: -1e9,
    threat: 0,
    threatSources: [],
    enemyArmor: 0.25,
    enemyAir: 0.2,
    enemyNaval: 0.1,
    log: [],
    nextId: 1,
    commandFails: 0,
    frontsVersion: -1,
    fronts: [],
    productionPlan: '',
    lastTaxChangeHour: -1e9,
  };
}

const LOG_MAX = 40;

export function remember(mem: NationMemory, hour: number, dept: string, text: string): void {
  mem.log.push({ hour, dept, text });
  if (mem.log.length > LOG_MAX) mem.log.splice(0, mem.log.length - LOG_MAX);
}
