/**
 * SHARED CONTRACT — schema of the hand-written real-world data tables
 * (src/data/countries.ts, src/data/cities.ts) authored by the data agent and
 * consumed by the Earth world builder (src/worldgen/earth/).
 */
import type { FlagSpec, Government } from '../worldgen/types';

export interface CountryData {
  code: string; // ISO 3166-1 alpha-3
  /**
   * world-atlas (Natural Earth 50m) feature ids this country owns, as the
   * numeric-string ids used in countries-50m.json (e.g. "840"), or "name:<name>"
   * for features without an id (e.g. "name:Kosovo"). Include dependencies and
   * territories that should belong to this nation in the game (e.g. Greenland
   * → Denmark, Puerto Rico → USA).
   */
  atlasIds: string[];
  name: string;
  formalName: string;
  adjective: string;
  capital: string;
  capitalLat: number;
  capitalLon: number;
  population: number; // millions, 2030 estimate
  gdp: number; // billions USD, 2030 estimate (nominal)
  government: Government;
  leaderTitle: string; // "President", "Prime Minister", "Chancellor", "King", "Supreme Leader", ...
  /** Name-style culture index for generated leader/minister names (see worldgen/names.ts CULTURES). */
  culture: number;
  activeMilitary: number; // thousands of active personnel
  defenseBudget: number; // % of GDP
  techLevel: number; // 0..1
  nuclear: boolean;
  navy: number; // 0..10 blue-water navy strength rating
  airForce: number; // 0..10
  color: [number, number, number]; // map colour (distinct from neighbours)
  flag: FlagSpec;
  blocs: string[]; // bloc codes, e.g. ["NATO", "EU"]
  aggression: number; // 0..1
  ideology: number; // -1 (authoritarian) .. 1 (liberal democracy)
  /** Resource endowment hints 0..10, used to seed deposits & facilities. */
  resources: Partial<Record<'oil' | 'gas' | 'coal' | 'ore' | 'uranium' | 'agriculture' | 'timber' | 'rubber', number>>;
  /** If true the nation always gets at least its capital hex even if too small to rasterize. */
  forceHex?: boolean;
}

export interface CityData {
  name: string;
  country: string; // ISO3
  lat: number;
  lon: number;
  pop: number; // thousands, metro area 2030 estimate
  capital?: boolean;
}

export interface BlocData {
  code: string;
  name: string;
  short: string;
  color: string;
  military: boolean; // mutual defence obligation
  leader?: string; // ISO3
}

/** [codeA, codeB, relation -100..100] explicit overrides of initial relations. */
export type RelationOverride = [string, string, number];
