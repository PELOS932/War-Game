/**
 * SHARED CONTRACT — simulation state types.
 * Owned by the simulation agent (src/sim/**). Other modules (AI, UI, renderer)
 * read these types. Only ADD fields; never rename/remove existing ones.
 */
import type { FlagSpec, Government, WorldData } from '../worldgen/types';
import type { HexGrid } from '../core/hex';

export type NationId = number; // index into GameState.nations

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------
/** Game starts at 2030-01-01 00:00 UTC. One tick = one game hour. */
export const START_YEAR = 2030;
/** Game hours advanced per real second for speed levels 0 (paused) .. 5. */
export const SPEED_HOURS_PER_SECOND = [0, 1, 3, 6, 12, 24];

// ---------------------------------------------------------------------------
// Resources (Supreme Ruler style)
// ---------------------------------------------------------------------------
export enum Resource {
  Agriculture = 0,
  Rubber = 1,
  Timber = 2,
  Petroleum = 3,
  Coal = 4,
  MetalOre = 5,
  Uranium = 6,
  ElectricPower = 7,
  ConsumerGoods = 8,
  IndustryGoods = 9,
  MilitaryGoods = 10,
}
export const RESOURCE_COUNT = 11;
export const RESOURCE_NAMES = [
  'Agriculture', 'Rubber', 'Timber', 'Petroleum', 'Coal', 'Metal Ore', 'Uranium',
  'Electric Power', 'Consumer Goods', 'Industry Goods', 'Military Goods',
];

export type TradePolicy = 'auto' | 'buy' | 'sell' | 'hold';

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------
export enum UnitClass {
  Land = 0,
  Air = 1,
  Naval = 2,
}

export enum UnitCategory {
  Infantry = 0,
  Mechanized = 1,
  Armor = 2,
  Artillery = 3,
  RocketArtillery = 4,
  AirDefense = 5,
  Recon = 6,
  SpecialForces = 7,
  Engineers = 8,
  MissileLauncher = 9,
  Fighter = 10,
  Multirole = 11,
  Strike = 12,
  Bomber = 13,
  Helicopter = 14,
  AirTransport = 15,
  Drone = 16,
  PatrolBoat = 17,
  Frigate = 18,
  Destroyer = 19,
  Cruiser = 20,
  Carrier = 21,
  Submarine = 22,
  Amphibious = 23,
}

export const CATEGORY_CLASS: Record<UnitCategory, UnitClass> = {
  [UnitCategory.Infantry]: UnitClass.Land,
  [UnitCategory.Mechanized]: UnitClass.Land,
  [UnitCategory.Armor]: UnitClass.Land,
  [UnitCategory.Artillery]: UnitClass.Land,
  [UnitCategory.RocketArtillery]: UnitClass.Land,
  [UnitCategory.AirDefense]: UnitClass.Land,
  [UnitCategory.Recon]: UnitClass.Land,
  [UnitCategory.SpecialForces]: UnitClass.Land,
  [UnitCategory.Engineers]: UnitClass.Land,
  [UnitCategory.MissileLauncher]: UnitClass.Land,
  [UnitCategory.Fighter]: UnitClass.Air,
  [UnitCategory.Multirole]: UnitClass.Air,
  [UnitCategory.Strike]: UnitClass.Air,
  [UnitCategory.Bomber]: UnitClass.Air,
  [UnitCategory.Helicopter]: UnitClass.Air,
  [UnitCategory.AirTransport]: UnitClass.Air,
  [UnitCategory.Drone]: UnitClass.Air,
  [UnitCategory.PatrolBoat]: UnitClass.Naval,
  [UnitCategory.Frigate]: UnitClass.Naval,
  [UnitCategory.Destroyer]: UnitClass.Naval,
  [UnitCategory.Cruiser]: UnitClass.Naval,
  [UnitCategory.Carrier]: UnitClass.Naval,
  [UnitCategory.Submarine]: UnitClass.Naval,
  [UnitCategory.Amphibious]: UnitClass.Naval,
};

export const CATEGORY_NAMES: Record<UnitCategory, string> = {
  [UnitCategory.Infantry]: 'Infantry',
  [UnitCategory.Mechanized]: 'Mechanized Infantry',
  [UnitCategory.Armor]: 'Armor',
  [UnitCategory.Artillery]: 'Artillery',
  [UnitCategory.RocketArtillery]: 'Rocket Artillery',
  [UnitCategory.AirDefense]: 'Air Defense',
  [UnitCategory.Recon]: 'Reconnaissance',
  [UnitCategory.SpecialForces]: 'Special Forces',
  [UnitCategory.Engineers]: 'Engineers',
  [UnitCategory.MissileLauncher]: 'Missile Launcher',
  [UnitCategory.Fighter]: 'Air Superiority Fighter',
  [UnitCategory.Multirole]: 'Multirole Fighter',
  [UnitCategory.Strike]: 'Strike Aircraft',
  [UnitCategory.Bomber]: 'Strategic Bomber',
  [UnitCategory.Helicopter]: 'Attack Helicopter',
  [UnitCategory.AirTransport]: 'Transport Aircraft',
  [UnitCategory.Drone]: 'Combat Drone',
  [UnitCategory.PatrolBoat]: 'Patrol Boat',
  [UnitCategory.Frigate]: 'Frigate',
  [UnitCategory.Destroyer]: 'Destroyer',
  [UnitCategory.Cruiser]: 'Cruiser',
  [UnitCategory.Carrier]: 'Aircraft Carrier',
  [UnitCategory.Submarine]: 'Submarine',
  [UnitCategory.Amphibious]: 'Amphibious Assault Ship',
};

export type ArmorType = 'soft' | 'hard' | 'air' | 'naval' | 'sub';
export type Mobility = 'foot' | 'wheeled' | 'tracked' | 'air' | 'naval';

export interface UnitDesign {
  id: string; // unique e.g. "mbt_gen3"
  name: string; // e.g. "M-30 Sentinel MBT"
  category: UnitCategory;
  cls: UnitClass;
  generation: number; // 1..4
  requiresTech: string | null;
  armor: ArmorType;
  mobility: Mobility;
  personnel: number; // men at full strength
  // Attack values vs target armour type (0..100)
  attackSoft: number;
  attackHard: number;
  attackAir: number;
  attackNaval: number;
  attackSub: number;
  /** Weapon ranges in hexes (0 = same hex only, 1 = adjacent). */
  rangeGround: number;
  rangeAir: number;
  rangeNaval: number;
  // Defence values (0..100)
  defenseGround: number;
  defenseAir: number;
  defenseNaval: number;
  speedKmh: number;
  spotting: number; // hexes
  stealth: number; // 0..1
  /** Air units: combat radius in km. Naval/land: 0. */
  rangeKm: number;
  fuelCapacity: number; // hours of movement
  cost: number; // millions USD
  militaryGoodsCost: number; // units of Military Goods
  buildDays: number;
  upkeep: number; // millions USD per day
  indirect: boolean; // artillery-style fire without closing in
  canCapture: boolean;
  description: string;
}

export type Stance = 'aggressive' | 'defensive' | 'hold' | 'passive';

export type OrderType =
  | 'idle' | 'move' | 'attack' | 'hold' | 'retreat' | 'patrol'
  | 'airStrike' | 'airPatrol' | 'airIntercept' | 'rebase' | 'returnToBase'
  | 'reinforce' | 'embark';

export interface UnitOrder {
  type: OrderType;
  targetHex: number; // -1 when none
  targetUnit: number; // -1 when none
}

export interface Unit {
  id: number;
  design: string; // UnitDesign.id
  nation: NationId;
  name: string; // e.g. "3rd Armored Battalion"
  hex: number;
  /** Continuous world position for rendering (x, z world units). */
  x: number;
  z: number;
  heading: number; // radians, 0 = +x (east)
  strength: number; // 0..100 (% of full personnel/equipment)
  efficiency: number; // 0..100 (readiness/morale)
  experience: number; // 0..100
  supply: number; // 0..100 ammo & consumables
  fuel: number; // 0..100
  entrenchment: number; // 0..100
  stance: Stance;
  order: UnitOrder;
  path: number[]; // remaining hexes to traverse (next hex first)
  moveProgress: number; // 0..1 toward path[0]
  inCombat: boolean; // engaged this hour
  embarked: boolean; // land unit travelling by sea
  airborne: boolean; // air unit currently flying
  baseHex: number; // air units: home airbase/carrier hex (-1 otherwise)
  missionHours: number; // air units: hours spent on current sortie
  kills: number;
  createdHour: number;
  groupId: number; // AI grouping (-1 none)
  // ---- added by the simulation ----
  /** Air units: id of the carrier unit they are based on (-1 = land airbase). */
  carrier: number;
  /** Stealthy unit (submarine) currently undetected by every foreign nation. UI: hide from non-owners. */
  hidden: boolean;
  /** Last hour this unit fired or was fired upon (-1 = never). */
  lastCombatHour: number;
  /** Air units: sortie phase. */
  airState: AirState;
  /** Air units: hours left in the current phase (rearming / on station). */
  airTimer: number;
  /** Hours spent waiting for a blocked path step (re-path after a while). */
  blockedHours: number;
}

/** Air sortie phase: ready at base, flying out, over target, flying home, rearming at base. */
export type AirState = 'ready' | 'outbound' | 'onStation' | 'returning' | 'rearming';

/** Maximum number of friendly land units that may share one hex. */
export const STACK_LIMIT = 10;
/** Air squadrons a carrier can host. */
export const CARRIER_CAPACITY = 4;

// ---------------------------------------------------------------------------
// Facilities
// ---------------------------------------------------------------------------
export enum FacilityType {
  Farm = 0,
  Plantation = 1, // rubber
  LumberMill = 2,
  OilWell = 3,
  OffshorePlatform = 4,
  CoalMine = 5,
  OreMine = 6,
  UraniumMine = 7,
  PowerPlant = 8, // fossil fuel
  NuclearPlant = 9,
  HydroDam = 10,
  RenewablePlant = 11,
  ConsumerFactory = 12,
  IndustrialPlant = 13,
  MilitaryFactory = 14,
  ResearchLab = 15,
  Barracks = 16,
  Airbase = 17,
  NavalBase = 18,
  MissileSilo = 19,
  SupplyDepot = 20,
  RadarStation = 21,
}
export const FACILITY_TYPE_COUNT = 22;

export interface FacilityDef {
  type: FacilityType;
  name: string;
  produces: Resource | null;
  output: number; // units/day at level 1, full efficiency
  inputs: Partial<Record<Resource, number>>; // per day at level 1
  workers: number; // thousands employed at level 1
  cost: number; // millions USD
  buildDays: number;
  upkeep: number; // millions USD / day
  maxLevel: number;
  military: boolean;
  description: string;
}

export interface Facility {
  id: number;
  type: FacilityType;
  hex: number;
  level: number;
  damage: number; // 0 (intact) .. 1 (destroyed)
  constructionDaysLeft: number; // > 0 while under construction
  x: number; // world position for rendering
  z: number;
  // ---- added by the simulation ----
  /** Current owner (follows hex ownership; offshore platforms follow the nearest coast). */
  nation: NationId;
  /** Operating efficiency 0..1 over the last day (inputs, damage, demand). */
  efficiency: number;
  /** Total construction days of the current build/upgrade (for progress bars). */
  constructionTotal: number;
}

// ---------------------------------------------------------------------------
// Cities
// ---------------------------------------------------------------------------
export interface City {
  id: number;
  name: string;
  hex: number;
  urbanHexes: number[];
  population: number; // thousands
  capital: boolean; // capital of its current owner
  port: boolean;
  originalNation: NationId;
  damage: number; // 0..1
  x: number;
  z: number;
}

// ---------------------------------------------------------------------------
// Nations
// ---------------------------------------------------------------------------
export interface Taxes {
  income: number; // 0..0.7
  corporate: number; // 0..0.6
  sales: number; // 0..0.4
}

export interface Spending {
  health: number; // fraction of GDP
  education: number;
  infrastructure: number;
  environment: number;
  family: number;
  lawEnforcement: number;
  culture: number;
  socialAssistance: number;
}

export type MinisterRole = 'head' | 'defense' | 'foreign' | 'finance' | 'economy' | 'research' | 'interior' | 'intelligence';

export interface Minister {
  role: MinisterRole;
  name: string;
  competence: number; // 0..1
  loyalty: number; // 0..1
  ideology: number; // -1..1
}

export type Department = 'economy' | 'trade' | 'research' | 'production' | 'diplomacy' | 'military';

export interface ProductionItem {
  id: number;
  design: string;
  cityId: number;
  daysLeft: number;
  totalDays: number;
  count: number; // remaining units in this batch
}

export interface ResearchSlot {
  techId: string;
  progress: number; // research points accumulated
}

export interface NationHistoryPoint {
  day: number;
  gdp: number;
  treasury: number;
  approval: number;
  military: number;
}

export interface Nation {
  id: NationId;
  code: string;
  name: string;
  formalName: string;
  adjective: string;
  color: [number, number, number];
  flag: FlagSpec;
  government: Government;
  leaderTitle: string;
  leaderName: string;
  culture: number;
  alive: boolean;
  isPlayer: boolean;
  capitalCity: number; // city id, -1 if none
  // Demographics & economy
  population: number; // millions
  gdp: number; // billions USD / year
  gdpGrowth: number; // annualised fraction
  treasury: number; // billions USD
  debt: number; // billions USD
  creditRating: number; // 0..100
  taxes: Taxes;
  spending: Spending;
  militaryBudget: number; // fraction of GDP
  researchBudget: number; // fraction of GDP
  approval: number; // 0..100
  unemployment: number; // 0..1
  literacy: number; // 0..1
  worldOpinion: number; // 0..100
  inflation: number; // annual fraction
  defcon: number; // 5 (peace) .. 1 (total war)
  techLevel: number; // 0..1
  nuclear: boolean;
  development: number; // 0..1
  // Resources: indexed by Resource
  stock: Float64Array;
  production: Float64Array; // per day (last day)
  consumption: Float64Array; // per day (last day)
  traded: Float64Array; // per day: + bought, - sold
  tradePolicy: TradePolicy[];
  // Research
  researchPoints: number; // per day
  knownTechs: Set<string>;
  researching: ResearchSlot[];
  // Military production
  productionQueue: ProductionItem[];
  // Government
  ministers: Minister[];
  autonomy: Record<Department, boolean>; // true = AI minister manages it
  // Personality (AI)
  aggression: number;
  ideology: number;
  militarism: number;
  navalFocus: number;
  blocs: number[];
  warWeariness: number; // 0..100
  history: NationHistoryPoint[];
  // Daily finance breakdown (billions USD per day, last day)
  income: Record<string, number>;
  expenses: Record<string, number>;
  // ---- added by the simulation ----
  /** Unspent military budget available for unit procurement (billions USD). */
  militaryFund: number;
  /** National price level for military upkeep/procurement (1 = reference). */
  costFactor: number;
  /** Average annual interest rate paid on debt. */
  interestRate: number;
  /** Aggregated effects of known techs (effect key -> total). */
  techMods: Record<string, number>;
  /** Law & order 0..100 (police spending, approval, war). */
  lawOrder: number;
  /** 0..1 share of demand met per resource over the last day (indexed by Resource). */
  satisfaction: Float64Array;
  /** Total demand per resource per day (population + industry + military + construction). */
  demand: Float64Array;
  /** Owned hexes / cities / units (refreshed daily). */
  hexCount: number;
  cityCount: number;
  unitCount: number;
  /** Cached militaryPower() value (refreshed daily). */
  power: number;
  /** Day number of the next general election (-1 = none, non-democracies). */
  nextElectionDay: number;
  /** Workforce in millions. */
  laborForce: number;
  /** Net resource trade value over the last day (billions USD, + = surplus). */
  tradeBalance: number;
  /** Services, tourism & remittance net income (billions USD per year). */
  servicesIncome: number;
  /** Temporary approval bonus (rally round the flag), decays daily. */
  rally: number;
  /** Economic shock to annual growth from events (decays). */
  growthShock: number;
  /** Internal calibration baselines captured at game start. */
  baseline: NationBaseline;
  /** GDP components (billions USD / year): services & domestic demand vs. goods production value. */
  gdpServices: number;
  gdpGoods: number;
  /** Upkeep price level applied to unit upkeep (calibrated so the start OOB fits the real defence budget). */
  upkeepFactor: number;
  /** Personnel lost in the last day (all wars). */
  casualtiesToday: number;
}

/** Internal reference values captured at scenario start (so an idle economy stays stable). */
export interface NationBaseline {
  approval: number;
  approvalOffset: number;
  taxBurden: number;
  social: number;
  unemployment: number;
  debtRatio: number;
  creditRating: number;
  literacy: number;
  trendGrowth: number;
  infrastructure: number;
  education: number;
  facilityJobs: number;
  lawEnforcement: number;
  gdp: number;
  inflation: number;
  lawOrder: number;
  /** Multiplier from goods production value (at base prices) to its GDP contribution. */
  goodsMult: number;
}

// ---------------------------------------------------------------------------
// Diplomacy
// ---------------------------------------------------------------------------
export type TreatyType =
  | 'embassy' | 'trade' | 'mapSharing' | 'militaryAccess' | 'nonAggression'
  | 'defensePact' | 'alliance' | 'researchSharing' | 'ceasefire';

export const TREATY_NAMES: Record<TreatyType, string> = {
  embassy: 'Embassy Exchange',
  trade: 'Trade Agreement',
  mapSharing: 'Map Sharing',
  militaryAccess: 'Military Access',
  nonAggression: 'Non-Aggression Pact',
  defensePact: 'Defense Pact',
  alliance: 'Military Alliance',
  researchSharing: 'Research Sharing',
  ceasefire: 'Ceasefire',
};

export interface Treaty {
  type: TreatyType;
  a: NationId;
  b: NationId;
  sinceHour: number;
  expiresHour: number; // -1 = permanent
}

export interface War {
  id: number;
  name: string;
  attackers: NationId[];
  defenders: NationId[];
  startHour: number;
  /** Positive favours attackers. Roughly -100..100. */
  score: number;
  casualties: Record<number, number>; // nation -> personnel lost
}

export interface Proposal {
  id: number;
  from: NationId;
  to: NationId;
  kind: TreatyType | 'peace' | 'aid' | 'joinWar';
  /** Extra data, e.g. the war id for peace or amount for aid. */
  data: number;
  createdHour: number;
  expiresHour: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Research
// ---------------------------------------------------------------------------
export type TechCategory = 'economy' | 'industry' | 'energy' | 'agriculture' | 'society' | 'land' | 'air' | 'naval' | 'missiles' | 'cyber';

export interface TechDef {
  id: string;
  name: string;
  category: TechCategory;
  cost: number; // research points
  prereqs: string[];
  description: string;
  /** Free-form effect keys interpreted by the simulation, e.g. { landAttack: 0.05 }. */
  effects: Record<string, number>;
  unlocksDesigns: string[];
}

// ---------------------------------------------------------------------------
// Market & news & events
// ---------------------------------------------------------------------------
export interface WorldMarket {
  price: Float64Array; // USD millions per unit, indexed by Resource
  basePrice: Float64Array;
  supply: Float64Array; // world offered per day
  demand: Float64Array; // world wanted per day
}

export type NewsCategory = 'war' | 'diplomacy' | 'economy' | 'military' | 'event' | 'research' | 'politics';

export interface NewsItem {
  id: number;
  hour: number;
  category: NewsCategory;
  text: string;
  nations: NationId[];
  importance: 1 | 2 | 3; // 3 = major (popup-worthy)
  hex: number; // -1 if not located
}

/** Transient events emitted each tick, consumed by renderer (effects) and UI. */
export type GameEvent =
  | { type: 'combat'; attacker: number; defender: number; fromX: number; fromZ: number; toX: number; toZ: number; weapon: 'direct' | 'artillery' | 'missile' | 'air' | 'naval' | 'aa' }
  | { type: 'unitDestroyed'; unit: number; nation: NationId; x: number; z: number }
  | { type: 'unitCreated'; unit: number; nation: NationId }
  | { type: 'hexCaptured'; hex: number; from: NationId | -1; to: NationId }
  | { type: 'cityCaptured'; city: number; from: NationId; to: NationId }
  | { type: 'facilityDamaged'; facility: number; x: number; z: number }
  | { type: 'facilityBuilt'; facility: number }
  | { type: 'warDeclared'; war: number; attacker: NationId; defender: NationId }
  | { type: 'peace'; war: number }
  | { type: 'nationDefeated'; nation: NationId; by: NationId }
  | { type: 'news'; item: NewsItem }
  | { type: 'proposal'; proposal: Proposal };

// ---------------------------------------------------------------------------
// Whole game state
// ---------------------------------------------------------------------------
export interface GameState {
  world: WorldData;
  grid: HexGrid;
  hour: number; // hours since 2030-01-01 00:00
  speed: number; // 0..5
  playerNation: NationId; // -1 = spectator
  nations: Nation[];
  cities: City[];
  units: Map<number, Unit>;
  facilities: Map<number, Facility>;
  designs: Map<string, UnitDesign>;
  techs: Map<string, TechDef>;
  facilityDefs: FacilityDef[]; // indexed by FacilityType
  hexOwner: Uint16Array; // current owner (nation id + 1), 0 = none
  hexCore: Uint16Array; // original owner (nation id + 1)
  hexControlChangedHour: Float32Array;
  /** Incremented whenever any hex changes owner (renderer re-uploads textures). */
  ownerVersion: number;
  /** Hexes changed since the renderer last cleared this list. */
  ownerDirty: number[];
  /** Incremented whenever facilities are added/removed/damaged. */
  facilityVersion: number;
  hexFacilities: Map<number, number[]>; // hex -> facility ids
  relations: Float32Array; // n*n (-100..100)
  treaties: Treaty[];
  wars: War[];
  proposals: Proposal[];
  market: WorldMarket;
  news: NewsItem[];
  nextId: number;
  gameOver: null | { winner: NationId; reason: string };
  // ---- added by the simulation ----
  /** RNG seed of this game (determinism for save/load). */
  seed: number;
  /** Supply level 0..100 of each hex for its current owner (see GameAPI.supplyAt). */
  supply: Uint8Array;
  /** Running totals for statistics screens. */
  stats: GameStats;
}

export interface GameStats {
  hexesCaptured: number;
  citiesCaptured: number;
  unitsDestroyed: number;
  unitsBuilt: number;
  facilitiesBuilt: number;
  warsDeclared: number;
  peaceTreaties: number;
  treatiesSigned: number;
}

export function hourToDate(hour: number): Date {
  return new Date(Date.UTC(START_YEAR, 0, 1) + hour * 3600 * 1000);
}

export function formatDate(hour: number): string {
  const d = hourToDate(hour);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')}, ${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2, '0')}:00`;
}
