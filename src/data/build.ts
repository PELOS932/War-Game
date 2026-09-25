/**
 * Compact row format + builder for the country tables (countries-*.ts).
 * Rows are positional tuples to keep the hand-written tables readable.
 */
import { Government } from '../worldgen/types';
import type { FlagSpec } from '../worldgen/types';
import type { CountryData } from './schema';
import { FLAGS } from './flagspecs';

/** Government abbreviations used in rows. */
export type GovCode = 'D' | 'F' | 'CM' | 'PR' | 'OP' | 'MJ' | 'AM' | 'T';
const GOV: Record<GovCode, Government> = {
  D: Government.Democracy,
  F: Government.FederalRepublic,
  CM: Government.ConstitutionalMonarchy,
  PR: Government.PresidentialRepublic,
  OP: Government.OneParty,
  MJ: Government.MilitaryJunta,
  AM: Government.AbsoluteMonarchy,
  T: Government.Theocracy,
};

/** Leader title abbreviations (anything else is used verbatim). */
const TITLES: Record<string, string> = {
  P: 'President',
  PM: 'Prime Minister',
  K: 'King',
  E: 'Emir',
  S: 'Sultan',
  SL: 'Supreme Leader',
  GS: 'General Secretary',
  C: 'Chairman',
  CH: 'Chancellor',
};

export const NUCLEAR_STATES = new Set(['USA', 'RUS', 'CHN', 'GBR', 'FRA', 'IND', 'PAK', 'ISR', 'PRK']);

const RES_KEYS = {
  o: 'oil',
  g: 'gas',
  c: 'coal',
  r: 'ore',
  u: 'uranium',
  a: 'agriculture',
  t: 'timber',
  b: 'rubber',
} as const;

/**
 * Row layout:
 *  0 code        ISO3
 *  1 atlas       world-atlas feature ids separated by '|' ("name:<x>" for id-less features)
 *  2 name
 *  3 formalName  ('' → same as name)
 *  4 adjective
 *  5 capital     (lat/lon are taken from the capital entry in cities.ts)
 *  6 population  millions
 *  7 gdp         billions USD
 *  8 government  GovCode
 *  9 leaderTitle (abbreviation or verbatim)
 * 10 culture     CULTURES index: 0 Nordic/Germanic, 1 Latin, 2 Slavic, 3 Arabic/Persian,
 *                4 EastAsian, 5 African, 6 Indic, 7 Anglo, 8 Turkic, 9 Austronesian
 * 11 activeMilitary thousands
 * 12 defenseBudget  % GDP
 * 13 techLevel      0..1
 * 14 navy 0..10     15 airForce 0..10
 * 16 color '#rrggbb'
 * 17 blocs space-separated
 * 18 aggression 0..1   19 ideology -1..1
 * 20 resources "o5 g3 c2 r4 u1 a6 t3 b0" (oil gas coal ore uranium agri timber rubber)
 * 21 options: 'f' = forceHex
 */
export type Row = [
  string, string, string, string, string, string,
  number, number, GovCode, string, number,
  number, number, number, number, number,
  string, string, number, number, string, string?,
];

export function hexColor(c: string): [number, number, number] {
  const v = parseInt(c.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function parseRes(s: string): CountryData['resources'] {
  const out: CountryData['resources'] = {};
  for (const tok of s.split(/\s+/)) {
    if (!tok) continue;
    const k = RES_KEYS[tok[0] as keyof typeof RES_KEYS];
    const n = Number(tok.slice(1));
    if (k && Number.isFinite(n)) out[k] = n;
  }
  return out;
}

const FALLBACK_FLAG: FlagSpec = { layout: 'plain', colors: ['#888888'] };

export function buildCountry(r: Row): CountryData {
  const [code, atlas, name, formal, adj, capital, pop, gdp, gov, title, culture, mil, def, tech, navy, air, color, blocs, aggr, ideo, res, opt] = r;
  const c: CountryData = {
    code,
    atlasIds: atlas.split('|').map((s) => s.trim()).filter(Boolean),
    name,
    formalName: formal || name,
    adjective: adj,
    capital,
    capitalLat: 0,
    capitalLon: 0,
    population: pop,
    gdp,
    government: GOV[gov],
    leaderTitle: TITLES[title] ?? title,
    culture,
    activeMilitary: mil,
    defenseBudget: def,
    techLevel: tech,
    nuclear: NUCLEAR_STATES.has(code),
    navy,
    airForce: air,
    color: hexColor(color),
    flag: FLAGS[code] ?? FALLBACK_FLAG,
    blocs: blocs.split(/\s+/).filter(Boolean),
    aggression: aggr,
    ideology: ideo,
    resources: parseRes(res),
  };
  if (opt && opt.includes('f')) c.forceHex = true;
  return c;
}
