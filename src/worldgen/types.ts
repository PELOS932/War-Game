/**
 * SHARED CONTRACT — world data produced by the world builder (real Earth, see
 * src/worldgen/earth/) or the legacy procedural generator (generate.ts).
 * Consumed by the renderer, simulation, AI and UI.
 *
 * Coordinate system (world units):
 *   x grows east, z grows south, y is up. Hex circumradius = 1 unit.
 *   The map is an equirectangular projection: x ∈ [0, worldW] maps linearly to
 *   longitude [lonWest, lonEast], z ∈ [0, worldH] maps to latitude [latNorth, latSouth].
 *   Heightmap sample (i, j) sits at world (i * HEIGHT_SPACING, j * HEIGHT_SPACING).
 */

export const HEIGHT_SPACING = 0.5; // world units between heightmap samples
/** Legacy constant used by the procedural generator's slope maths only. */
export const ELEV_EXAGGERATION = 4.2;
/** Legacy procedural-world scale (km per world unit). Earth code must use kmPerUnitAt(). */
export const KM_PER_UNIT = 30 / Math.sqrt(3);
export const KM_PER_DEG = 111.32;

export enum Biome {
  Ocean = 0,
  Lake = 1,
  Ice = 2,
  Tundra = 3,
  Taiga = 4,
  TemperateForest = 5,
  TemperateRainforest = 6,
  Grassland = 7,
  Mediterranean = 8,
  ColdDesert = 9,
  HotDesert = 10,
  Savanna = 11,
  TropicalDryForest = 12,
  TropicalRainforest = 13,
  Wetland = 14,
  Alpine = 15,
}

export const BIOME_NAMES: Record<Biome, string> = {
  [Biome.Ocean]: 'Ocean',
  [Biome.Lake]: 'Lake',
  [Biome.Ice]: 'Ice Sheet',
  [Biome.Tundra]: 'Tundra',
  [Biome.Taiga]: 'Boreal Forest',
  [Biome.TemperateForest]: 'Temperate Forest',
  [Biome.TemperateRainforest]: 'Temperate Rainforest',
  [Biome.Grassland]: 'Steppe',
  [Biome.Mediterranean]: 'Scrubland',
  [Biome.ColdDesert]: 'Cold Desert',
  [Biome.HotDesert]: 'Desert',
  [Biome.Savanna]: 'Savanna',
  [Biome.TropicalDryForest]: 'Tropical Forest',
  [Biome.TropicalRainforest]: 'Rainforest',
  [Biome.Wetland]: 'Wetland',
  [Biome.Alpine]: 'Alpine',
};

/** Gameplay terrain type of a hex. */
export enum Terrain {
  DeepOcean = 0,
  Coastal = 1,
  Lake = 2,
  Plains = 3,
  Farmland = 4,
  Forest = 5,
  Jungle = 6,
  Hills = 7,
  Mountains = 8,
  Desert = 9,
  Tundra = 10,
  Marsh = 11,
  Ice = 12,
  Urban = 13,
}

export const TERRAIN_NAMES: Record<Terrain, string> = {
  [Terrain.DeepOcean]: 'Deep Ocean',
  [Terrain.Coastal]: 'Coastal Waters',
  [Terrain.Lake]: 'Lake',
  [Terrain.Plains]: 'Plains',
  [Terrain.Farmland]: 'Farmland',
  [Terrain.Forest]: 'Forest',
  [Terrain.Jungle]: 'Jungle',
  [Terrain.Hills]: 'Hills',
  [Terrain.Mountains]: 'Mountains',
  [Terrain.Desert]: 'Desert',
  [Terrain.Tundra]: 'Tundra',
  [Terrain.Marsh]: 'Marsh',
  [Terrain.Ice]: 'Ice',
  [Terrain.Urban]: 'Urban',
};

export function isWaterTerrain(t: number): boolean {
  return t <= Terrain.Lake;
}

export enum Deposit {
  None = 0,
  Oil = 1,
  Coal = 2,
  Ore = 3,
  Uranium = 4,
  Gas = 5, // offshore oil & gas
}

export const DEPOSIT_NAMES: Record<Deposit, string> = {
  [Deposit.None]: 'None',
  [Deposit.Oil]: 'Oil Field',
  [Deposit.Coal]: 'Coal Seam',
  [Deposit.Ore]: 'Metal Ore',
  [Deposit.Uranium]: 'Uranium',
  [Deposit.Gas]: 'Offshore Oil & Gas',
};

export enum Government {
  Democracy = 0,
  FederalRepublic = 1,
  ConstitutionalMonarchy = 2,
  PresidentialRepublic = 3,
  OneParty = 4,
  MilitaryJunta = 5,
  AbsoluteMonarchy = 6,
  Theocracy = 7,
}

export const GOVERNMENT_NAMES: Record<Government, string> = {
  [Government.Democracy]: 'Parliamentary Democracy',
  [Government.FederalRepublic]: 'Federal Republic',
  [Government.ConstitutionalMonarchy]: 'Constitutional Monarchy',
  [Government.PresidentialRepublic]: 'Presidential Republic',
  [Government.OneParty]: 'One-Party State',
  [Government.MilitaryJunta]: 'Military Junta',
  [Government.AbsoluteMonarchy]: 'Absolute Monarchy',
  [Government.Theocracy]: 'Theocratic Republic',
};

export function isDemocratic(g: Government): boolean {
  return g <= Government.PresidentialRepublic;
}

// ---------------------------------------------------------------------------
// Flags (rendered to canvas by src/ui/flags.ts)
// ---------------------------------------------------------------------------

/**
 * Flag layouts. Flags are 3:2 unless `aspect` says otherwise.
 * - plain:     solid colors[0]
 * - hstripes:  horizontal stripes of `colors` (top→bottom), widths from `ratios`
 * - vstripes:  vertical stripes (left→right)
 * - nordic:    background colors[0], off-centre cross colors[1] (optional inner cross colors[2])
 * - cross:     centred cross colors[1] on colors[0] (Swiss/Georgian style)
 * - saltire:   diagonal cross colors[1] on colors[0]
 * - union:     Union-Jack style: colors[0] field, colors[1] saltire+cross border, colors[2] cross
 * - canton:    colors[0] field (or stripes if `ratios` given with multiple colors[] minus last),
 *              canton rectangle in `accent` in the top-left quarter
 * - starsStripes: 13 alternating stripes colors[0]/colors[1] with canton `accent` + stars
 * - triangle:  hstripes of `colors` plus a hoist triangle in `accent`
 * - chevron:   like triangle but a shallower wedge
 * - diagonal:  diagonal split colors[0] (upper-left) / colors[1] (lower-right), band `accent`
 * - bordered:  colors[0] field with border colors[1]
 * - quarters:  four quarters colors[0..3]
 */
export type FlagLayout =
  | 'plain' | 'hstripes' | 'vstripes' | 'nordic' | 'cross' | 'saltire' | 'union'
  | 'canton' | 'starsStripes' | 'triangle' | 'chevron' | 'diagonal' | 'bordered' | 'quarters';

export interface FlagEmblem {
  shape: 'star' | 'circle' | 'crescent' | 'crescentStar' | 'sun' | 'ring' | 'cross' | 'leaf' | 'shield' | 'starRing' | 'wheel' | 'triangle';
  color: string;
  /** Centre position as fraction of flag width / height. */
  x: number;
  y: number;
  /** Size as fraction of flag height. */
  size: number;
  /** For starRing / repeated stars. */
  count?: number;
}

export interface FlagSpec {
  layout: FlagLayout;
  colors: string[];
  ratios?: number[];
  accent?: string;
  emblems?: FlagEmblem[];
  aspect?: number; // width / height, default 1.5
}

// ---------------------------------------------------------------------------
// Nations, cities, world
// ---------------------------------------------------------------------------

export interface NationSeed {
  id: number; // index in WorldData.nations
  code: string; // ISO 3166-1 alpha-3 (Earth) or generated code
  name: string;
  formalName: string;
  adjective: string;
  culture: number; // index into CULTURES (names.ts) for generating person names
  capitalHex: number;
  capitalName: string;
  color: [number, number, number];
  flag: FlagSpec;
  government: Government;
  leaderTitle: string; // e.g. "President", "Prime Minister", "King"
  leaderName: string;
  /** Real-world style statistics (2030 estimates for Earth). */
  population: number; // millions
  gdp: number; // billions USD per year
  activeMilitary: number; // thousands of personnel
  defenseBudget: number; // % of GDP
  techLevel: number; // 0..1
  nuclear: boolean;
  navyRating: number; // 0..10
  airRating: number; // 0..10
  development: number; // 0..1 derived from GDP per capita
  aggression: number; // 0..1
  ideology: number; // -1 (authoritarian/collectivist) .. 1 (liberal democratic)
  blocs: number[]; // indices into WorldData.blocs
  militarism: number; // 0..1
  navalFocus: number; // 0..1
  hexCount: number;
}

export interface BlocSeed {
  id: number;
  code: string; // e.g. "NATO"
  name: string;
  short: string;
  color: string;
  military: boolean; // mutual defence obligation
  leader: number; // nation id or -1
}

export interface CitySeed {
  id: number;
  name: string;
  hex: number;
  nation: number;
  population: number; // thousands (metro area)
  capital: boolean;
  port: boolean;
  urbanHexes: number[];
  x: number;
  z: number;
  gridAngle: number; // street grid orientation for rendering
}

export interface RoadSeed {
  hexes: number[];
  kind: 0 | 1; // 0 = road, 1 = highway
}

export interface RiverSeed {
  /** Interleaved x, z, width (world units) triples, from source to mouth. */
  points: Float32Array;
  name?: string;
}

export interface LakeSeed {
  level: number; // metres above sea level
  cells: Int32Array; // heightmap cell indices
  name?: string;
}

export interface WorldSettings {
  kind: 'earth' | 'procedural';
  seed: number;
  cols: number;
  rows: number;
  latNorth: number;
  latSouth: number;
  lonWest: number;
  lonEast: number;
  landFraction: number;
  nationCount: number;
}

export interface WorldData {
  settings: WorldSettings;
  // heightmap resolution data (hw * hh cells)
  hw: number;
  hh: number;
  elevation: Float32Array; // metres (<0 = sea floor)
  temperature: Float32Array; // annual mean °C
  precipitation: Float32Array; // mm / year
  biome: Uint8Array;
  albedo: Uint8Array; // RGBA per cell: rgb surface colour (sRGB) + a = forest density
  climateTex: Uint8Array; // RGBA: r = (T+40)*3.2, g = precip/16, b = continentality*255, a = river mask (255 = river)
  waterLevel: Float32Array; // lake surface metres, or -1e9 if no lake
  rivers: RiverSeed[];
  lakes: LakeSeed[];
  // hex resolution data (cols * rows hexes)
  hexTerrain: Uint8Array;
  hexElevation: Float32Array;
  hexOwner: Uint16Array; // 0 = none, else nation id + 1
  hexPopulation: Float32Array; // thousands of people
  hexRiverEdges: Uint8Array; // bitmask of directions where a river is crossed
  hexRoad: Uint8Array; // bitmask of directions with a road connection
  hexRail: Uint8Array; // bitmask of directions with rail
  hexDeposit: Uint8Array;
  hexDepositSize: Float32Array;
  hexForest: Uint8Array; // 0..255
  hexTemperature: Float32Array;
  hexPrecip: Float32Array;
  hexHabitability: Float32Array;
  hexCity: Int32Array; // city id or -1
  hexCoast: Uint8Array; // 1 if land hex adjacent to sea
  nations: NationSeed[];
  blocs: BlocSeed[];
  cities: CitySeed[];
  roads: RoadSeed[];
  rails: RoadSeed[];
  relations: Int8Array; // n*n initial relations -100..100
  claims: Int32Array[]; // per nation: claimed hexes owned by others
}

export function worldWidth(s: WorldSettings): number {
  return Math.sqrt(3) * (s.cols + 0.5);
}

export function worldHeight(s: WorldSettings): number {
  return 1.5 * s.rows + 0.5;
}

export function latitudeAt(z: number, s: WorldSettings): number {
  return s.latNorth - (z / worldHeight(s)) * (s.latNorth - s.latSouth);
}

export function longitudeAt(x: number, s: WorldSettings): number {
  return s.lonWest + (x / worldWidth(s)) * (s.lonEast - s.lonWest);
}

export function worldXFromLon(lon: number, s: WorldSettings): number {
  return ((lon - s.lonWest) / (s.lonEast - s.lonWest)) * worldWidth(s);
}

export function worldZFromLat(lat: number, s: WorldSettings): number {
  return ((s.latNorth - lat) / (s.latNorth - s.latSouth)) * worldHeight(s);
}

/** Degrees per world unit (same along both axes for equirectangular maps). */
export function degPerUnit(s: WorldSettings): number {
  return (s.lonEast - s.lonWest) / worldWidth(s);
}

/** Real kilometres per world unit north-south (constant) and east-west (at latitude). */
export function kmPerUnitAt(z: number, s: WorldSettings): { ns: number; ew: number } {
  const d = degPerUnit(s) * KM_PER_DEG;
  const lat = (latitudeAt(z, s) * Math.PI) / 180;
  return { ns: d, ew: d * Math.max(0.05, Math.cos(lat)) };
}

/** Earth map configuration: 0.5° hex columns, 84°N .. ~57°S. */
export const EARTH_SETTINGS: WorldSettings = {
  kind: 'earth',
  seed: 2030,
  cols: 720,
  rows: 326,
  latNorth: 84,
  latSouth: 84 - (1.5 * 326 + 0.5) * (360 / (Math.sqrt(3) * 720.5)),
  lonWest: -180,
  lonEast: 180,
  landFraction: 0,
  nationCount: 0,
};
