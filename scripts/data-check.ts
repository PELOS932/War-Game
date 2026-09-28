/**
 * Validates the real-world data tables (src/data/*).
 * Run: npx tsx scripts/data-check.ts        (exit code 1 on errors)
 *      npx tsx scripts/data-check.ts -v     (also list warnings in full)
 */
import { readFileSync } from 'node:fs';
import { feature, neighbors } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, Geometry, Position } from 'geojson';
import { COUNTRIES, BLOCS, RELATION_OVERRIDES } from '../src/data/countries';
import { CITIES } from '../src/data/cities';
import { FLAGS } from '../src/data/flagspecs';
import { CULTURES } from '../src/worldgen/names';
import { EARTH_SETTINGS } from '../src/worldgen/types';

const verbose = process.argv.includes('-v');
const errors: string[] = [];
const warnings: string[] = [];
const err = (m: string) => errors.push(m);
const warn = (m: string) => warnings.push(m);

// ---------------------------------------------------------------------------
// Atlas coverage
// ---------------------------------------------------------------------------
const topo = JSON.parse(readFileSync(new URL('../node_modules/world-atlas/countries-50m.json', import.meta.url), 'utf8')) as Topology;
const coll = topo.objects.countries as GeometryCollection<{ name: string }>;
const geoms = coll.geometries;
const featKey = (g: { id?: string | number; properties?: { name: string } | null }) =>
  g.id !== undefined && g.id !== null && g.id !== '' ? String(g.id) : 'name:' + (g.properties?.name ?? '?');

const keyToFeatures = new Map<string, number[]>();
geoms.forEach((g, i) => {
  const k = featKey(g);
  const arr = keyToFeatures.get(k) ?? [];
  arr.push(i);
  keyToFeatures.set(k, arr);
});

const featureOwner: (string | null)[] = geoms.map(() => null);
const codes = new Set<string>();
for (const c of COUNTRIES) {
  if (!/^[A-Z]{3}$/.test(c.code)) err(`${c.code}: bad ISO3 code`);
  if (codes.has(c.code)) err(`${c.code}: duplicate country code`);
  codes.add(c.code);
  if (!c.atlasIds.length) err(`${c.code}: no atlasIds`);
  for (const id of c.atlasIds) {
    const fs = keyToFeatures.get(id);
    if (!fs) {
      err(`${c.code}: atlas id "${id}" matches no feature`);
      continue;
    }
    for (const fi of fs) {
      if (featureOwner[fi]) err(`feature ${id} (${geoms[fi].properties?.name}) claimed by ${featureOwner[fi]} and ${c.code}`);
      featureOwner[fi] = c.code;
    }
  }
}
geoms.forEach((g, i) => {
  if (featKey(g) === '010') return; // Antarctica
  if (!featureOwner[i]) err(`feature ${featKey(g)} (${g.properties?.name}) is not assigned to any country`);
});

// ---------------------------------------------------------------------------
// Country field sanity
// ---------------------------------------------------------------------------
const blocCodes = new Set(BLOCS.map((b) => b.code));
const colorSeen = new Map<string, string>();
const inRange = (v: number, lo: number, hi: number) => Number.isFinite(v) && v >= lo && v <= hi;
for (const c of COUNTRIES) {
  const t = c.code;
  if (!inRange(c.population, 0.005, 2000)) err(`${t}: population ${c.population}`);
  if (!inRange(c.gdp, 0.1, 50000)) err(`${t}: gdp ${c.gdp}`);
  if (!inRange(c.activeMilitary, 0, 3000)) err(`${t}: activeMilitary ${c.activeMilitary}`);
  if (!inRange(c.defenseBudget, 0, 30)) err(`${t}: defenseBudget ${c.defenseBudget}`);
  if (!inRange(c.techLevel, 0, 1)) err(`${t}: techLevel ${c.techLevel}`);
  if (!inRange(c.navy, 0, 10) || !inRange(c.airForce, 0, 10)) err(`${t}: navy/air rating`);
  if (!inRange(c.aggression, 0, 1)) err(`${t}: aggression ${c.aggression}`);
  if (!inRange(c.ideology, -1, 1)) err(`${t}: ideology ${c.ideology}`);
  if (!Number.isInteger(c.culture) || c.culture < 0 || c.culture >= CULTURES.length) err(`${t}: culture ${c.culture}`);
  if (!c.name || !c.formalName || !c.adjective || !c.capital || !c.leaderTitle) err(`${t}: missing text field`);
  if (c.color.some((v) => !inRange(v, 0, 255))) err(`${t}: bad colour`);
  const ck = c.color.join(',');
  if (colorSeen.has(ck)) warn(`${t}: colour identical to ${colorSeen.get(ck)}`);
  colorSeen.set(ck, t);
  if (!FLAGS[t]) err(`${t}: no flag spec`);
  for (const b of c.blocs) if (!blocCodes.has(b)) err(`${t}: unknown bloc ${b}`);
  for (const [k, v] of Object.entries(c.resources)) if (!inRange(v ?? 0, 0, 10)) err(`${t}: resource ${k}=${v}`);
  const gdpPc = (c.gdp * 1000) / c.population;
  if (gdpPc > 150000 || gdpPc < 150) warn(`${t}: GDP per capita $${gdpPc.toFixed(0)} looks odd`);
  if (c.activeMilitary > 0 && (c.activeMilitary / 1000 / c.population) * 100 > 6) warn(`${t}: ${((c.activeMilitary / 10 / c.population)).toFixed(1)}% of population under arms`);
}
for (const k of Object.keys(FLAGS)) if (!codes.has(k)) warn(`flag spec for unknown country ${k}`);
const nuclear = COUNTRIES.filter((c) => c.nuclear).map((c) => c.code).sort();
if (nuclear.join() !== ['CHN', 'FRA', 'GBR', 'IND', 'ISR', 'PAK', 'PRK', 'RUS', 'USA'].join()) err(`nuclear states: ${nuclear.join(' ')}`);

// Blocs
for (const b of BLOCS) {
  const members = COUNTRIES.filter((c) => c.blocs.includes(b.code));
  if (!members.length) err(`bloc ${b.code} has no members`);
  if (b.leader && !members.some((m) => m.code === b.leader)) err(`bloc ${b.code} leader ${b.leader} is not a member`);
}

// Relations
const pairSeen = new Set<string>();
for (const [a, b, v] of RELATION_OVERRIDES) {
  if (!codes.has(a) || !codes.has(b)) err(`relation ${a}-${b}: unknown code`);
  if (a === b) err(`relation ${a}-${b}: self`);
  if (!inRange(v, -100, 100)) err(`relation ${a}-${b}: value ${v}`);
  const key = [a, b].sort().join('-');
  if (pairSeen.has(key)) err(`relation ${key}: duplicate`);
  pairSeen.add(key);
}

// ---------------------------------------------------------------------------
// Cities
// ---------------------------------------------------------------------------
const byCode = new Map(COUNTRIES.map((c) => [c.code, c]));
const cityKeys = new Set<string>();
for (const ct of CITIES) {
  if (!byCode.has(ct.country)) err(`city ${ct.name}: unknown country ${ct.country}`);
  if (!inRange(ct.lat, -90, 90) || !inRange(ct.lon, -180, 180)) err(`city ${ct.name}: bad lat/lon`);
  if (!inRange(ct.pop, 1, 60000)) err(`city ${ct.name}: pop ${ct.pop}`);
  const k = ct.country + '/' + ct.name;
  if (cityKeys.has(k)) err(`city ${k}: duplicate`);
  cityKeys.add(k);
  if (ct.lat < EARTH_SETTINGS.latSouth || ct.lat > EARTH_SETTINGS.latNorth) warn(`city ${k} lies outside the map latitude range`);
}
for (const c of COUNTRIES) {
  const cs = CITIES.filter((ct) => ct.country === c.code);
  if (!cs.length) err(`${c.code}: no cities`);
  const caps = cs.filter((ct) => ct.capital);
  if (caps.length !== 1) err(`${c.code}: ${caps.length} capitals in cities.ts`);
  else if (caps[0].name !== c.capital) err(`${c.code}: capital "${c.capital}" but cities.ts capital is "${caps[0].name}"`);
  else if (caps[0].lat !== c.capitalLat || caps[0].lon !== c.capitalLon) err(`${c.code}: capital coords mismatch`);
}

// City inside its own country's polygons (or within tolerance of its coast/border)
const features = geoms.map((g) => feature(topo, g) as Feature<Geometry>);
function polygonsOf(g: Geometry): Position[][][] {
  if (g.type === 'Polygon') return [g.coordinates];
  if (g.type === 'MultiPolygon') return g.coordinates;
  return [];
}
function inRing(lon: number, lat: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
/** Returns 0 if inside, else approx distance in degrees (lon scaled by cos lat) to the nearest boundary. */
function distToFeature(lon: number, lat: number, f: Feature<Geometry>): number {
  const k = Math.cos((lat * Math.PI) / 180);
  let best = Infinity;
  for (const poly of polygonsOf(f.geometry)) {
    let inside = false;
    poly.forEach((ring) => {
      if (inRing(lon, lat, ring)) inside = !inside;
    });
    if (inside) return 0;
    for (const ring of poly)
      for (let i = 1; i < ring.length; i++)
        best = Math.min(best, segDist(lon * k, lat, ring[i - 1][0] * k, ring[i - 1][1], ring[i][0] * k, ring[i][1]));
  }
  return best;
}
const featuresOf = new Map<string, Feature<Geometry>[]>();
features.forEach((f, i) => {
  const o = featureOwner[i];
  if (!o) return;
  const arr = featuresOf.get(o) ?? [];
  arr.push(f);
  featuresOf.set(o, arr);
});
let outside = 0;
for (const ct of CITIES) {
  const fs = featuresOf.get(ct.country);
  if (!fs) continue;
  const d = Math.min(...fs.map((f) => distToFeature(ct.lon, ct.lat, f)));
  if (d > 0.3) {
    // find which country actually contains it
    let actual = '';
    features.forEach((f, i) => {
      if (!actual && featureOwner[i] && distToFeature(ct.lon, ct.lat, f) === 0) actual = featureOwner[i] ?? '';
    });
    err(`city ${ct.country}/${ct.name} (${ct.lat}, ${ct.lon}) is ${d.toFixed(2)}° outside its country${actual ? ` (inside ${actual})` : ''}`);
    outside++;
  } else if (d > 0.12) warn(`city ${ct.country}/${ct.name} is ${d.toFixed(2)}° off the coast/border`);
}

// ---------------------------------------------------------------------------
// Neighbour colour contrast
// ---------------------------------------------------------------------------
function lab([r, g, b]: [number, number, number]): [number, number, number] {
  const lin = (v: number) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const deltaE = (a: [number, number, number], b: [number, number, number]) => {
  const A = lab(a), B = lab(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
};
const nb = neighbors(geoms as never);
const adjPairs = new Set<string>();
nb.forEach((list, i) => {
  for (const j of list) {
    const a = featureOwner[i];
    const b = featureOwner[j];
    if (a && b && a !== b) adjPairs.add([a, b].sort().join('-'));
  }
});
const lowContrast: string[] = [];
for (const p of adjPairs) {
  const [a, b] = p.split('-');
  const d = deltaE(byCode.get(a)!.color, byCode.get(b)!.color);
  if (d < 18) lowContrast.push(`${p} ΔE=${d.toFixed(1)}`);
}
if (lowContrast.length) warn(`low-contrast neighbour colours: ${lowContrast.join(', ')}`);

// ---------------------------------------------------------------------------
console.log(`countries: ${COUNTRIES.length}  cities: ${CITIES.length} (capitals ${CITIES.filter((c) => c.capital).length})  blocs: ${BLOCS.length}  relation overrides: ${RELATION_OVERRIDES.length}`);
console.log(`atlas features: ${geoms.length} (assigned ${featureOwner.filter(Boolean).length})  land borders between countries: ${adjPairs.size}  cities off-country: ${outside}`);
console.log(`forceHex: ${COUNTRIES.filter((c) => c.forceHex).length}  nuclear: ${nuclear.join(' ')}`);
const topCities = new Map<string, number>();
for (const ct of CITIES) topCities.set(ct.country, (topCities.get(ct.country) ?? 0) + 1);
console.log('cities per country (top): ' + [...topCities.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${k}:${v}`).join(' '));
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s)`);
  for (const w of verbose ? warnings : warnings.slice(0, 40)) console.log('  WARN ' + w);
}
if (errors.length) {
  console.log(`\n${errors.length} error(s)`);
  for (const e of errors) console.log('  ERR  ' + e);
  process.exit(1);
}
console.log('\nOK — all data checks passed');
