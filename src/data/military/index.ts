/**
 * Aggregated real-world military data: merges the regional files, dedupes by
 * id, validates references and exposes lookup helpers. Pure data (no sim state).
 */
import { CATEGORY_CLASS, UnitCategory, type ArmorType, type Mobility } from '../../sim/types';
import { UNIT_DESIGNS, designId } from '../../sim/data/units';
import type { MilitaryDesign, NationInventory } from './schema';
import { REGIONS, ALIASES } from './regions';

export type { MilitaryDesign, NationInventory } from './schema';

export interface MilitaryReport {
  regions: { name: string; designs: number; inventories: number }[];
  duplicateIds: string[]; // ids defined more than once (first wins)
  invalidDesigns: string[]; // human readable issues (dropped / repaired)
  clamped: string[]; // numeric fields clamped into the simulation's range (informational)
  missingInventoryIds: { nation: string; id: string }[]; // dropped, generic OOB fills the category
  missingProduceIds: { nation: string; id: string }[];
  missingPredecessors: { id: string; predecessor: string }[];
  /** Ids not defined anywhere but resolved to a close design (alias / prefix match). */
  resolved: { nation: string; from: string; to: string }[];
  /** Inventory/produce entries that use a generic sim design id directly (valid). */
  genericRefs: number;
  duplicateInventories: string[];
  totals: { designs: number; future: number; nations: number; units: number };
}

const report: MilitaryReport = {
  regions: [], duplicateIds: [], invalidDesigns: [], clamped: [], missingInventoryIds: [], missingProduceIds: [],
  missingPredecessors: [], resolved: [], genericRefs: 0, duplicateInventories: [], totals: { designs: 0, future: 0, nations: 0, units: 0 },
};

const ARMORS: ArmorType[] = ['soft', 'hard', 'air', 'naval', 'sub'];
const MOBS: Mobility[] = ['foot', 'wheeled', 'tracked', 'air', 'naval'];
const clampNum = (v: unknown, lo: number, hi: number, dflt: number): number => {
  const x = typeof v === 'number' && Number.isFinite(v) ? v : dflt;
  return x < lo ? lo : x > hi ? hi : x;
};

function sanitize(d: MilitaryDesign): MilitaryDesign | null {
  if (!d || typeof d.id !== 'string' || !d.id || typeof d.name !== 'string') {
    report.invalidDesigns.push(`design without id/name: ${JSON.stringify(d)?.slice(0, 60)}`);
    return null;
  }
  if (!(d.category in CATEGORY_CLASS)) {
    report.invalidDesigns.push(`${d.id}: bad category ${String(d.category)} (dropped)`);
    return null;
  }
  const out = { ...d };
  const cls = CATEGORY_CLASS[d.category];
  if (!ARMORS.includes(out.armor)) { report.invalidDesigns.push(`${d.id}: bad armor '${out.armor}'`); out.armor = cls === 2 ? 'air' : cls === 1 ? 'hard' : 'soft'; }
  if (!MOBS.includes(out.mobility)) { report.invalidDesigns.push(`${d.id}: bad mobility '${out.mobility}'`); out.mobility = cls === 2 ? 'air' : cls === 1 ? 'naval' : 'wheeled'; }
  const stat = (k: keyof MilitaryDesign, lo: number, hi: number, dflt: number) => {
    const v = out[k] as unknown;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) {
      if (v !== undefined) report.clamped.push(`${d.id}.${String(k)}=${String(v)} -> [${lo},${hi}]`);
      (out as unknown as Record<string, number>)[k as string] = clampNum(v, lo, hi, dflt);
    }
  };
  for (const k of ['attackSoft', 'attackHard', 'attackAir', 'attackNaval', 'attackSub', 'defenseGround', 'defenseAir', 'defenseNaval'] as const) stat(k, 0, 100, 0);
  for (const k of ['rangeGround', 'rangeAir', 'rangeNaval'] as const) stat(k, 0, 8, 0);
  stat('stealth', 0, 1, 0);
  stat('spotting', 0, 12, 2);
  stat('speedKmh', 1, 4000, 30);
  stat('personnel', 0, 20000, 500);
  stat('rangeKm', 0, 30000, 0);
  stat('fuelCapacity', 1, 2000, 80);
  stat('cost', 1, 100000, 500);
  stat('militaryGoodsCost', 0, 5000, 30);
  stat('buildDays', 1, 3000, 90);
  stat('upkeep', 0, 500, 1);
  out.exportable = out.exportable !== false;
  out.future = out.future === true;
  out.indirect = out.indirect === true;
  out.canCapture = out.canCapture === true;
  out.year = clampNum(out.year, 1900, 2100, out.future ? 2040 : 2020);
  out.description = out.description ?? '';
  if (out.future) out.researchCost = clampNum(out.researchCost, 500, 60000, 8000);
  return out;
}

const genericIds = new Set(UNIT_DESIGNS.map((d) => d.id));

// ---- designs --------------------------------------------------------------------
const designMap = new Map<string, MilitaryDesign>();
const invCodes = new Map<string, Set<string>>();
for (const r of REGIONS) invCodes.set(r.name, new Set(r.INVENTORY.map((i) => i.code)));
const homeRegion = new Map<string, boolean>(); // id -> current definition comes from the origin's own region
for (const r of REGIONS) {
  report.regions.push({ name: r.name, designs: r.DESIGNS.length, inventories: r.INVENTORY.length });
  for (const raw of r.DESIGNS) {
    const d = sanitize(raw);
    if (!d) continue;
    const home = invCodes.get(r.name)!.has(d.origin);
    if (designMap.has(d.id)) {
      // Duplicate: prefer the definition from the origin nation's own region, else first wins.
      if (home && !homeRegion.get(d.id)) {
        report.duplicateIds.push(`${d.id} (${r.name} definition preferred: origin region)`);
        designMap.set(d.id, d);
        homeRegion.set(d.id, true);
      } else report.duplicateIds.push(`${d.id} (${r.name} ignored)`);
      continue;
    }
    designMap.set(d.id, d);
    homeRegion.set(d.id, home);
  }
}
for (const d of designMap.values()) {
  if (d.predecessor && !designMap.has(d.predecessor) && !genericIds.has(d.predecessor)) {
    report.missingPredecessors.push({ id: d.id, predecessor: d.predecessor });
    d.predecessor = undefined;
  }
}
export const DESIGNS: MilitaryDesign[] = [...designMap.values()];

// ---- id resolution -------------------------------------------------------------------
const resolveCache = new Map<string, string | null>();
/** Real id, generic sim id, alias or unique prefix relative; null when unknown. */
function resolveId(id: string, nation: string): string | null {
  if (designMap.has(id)) return id;
  if (genericIds.has(id)) { report.genericRefs++; return id; }
  let r = resolveCache.get(id);
  if (r === undefined) {
    r = null;
    const alias = ALIASES[id];
    if (alias && designMap.has(alias)) r = alias;
    else {
      let bestLen = Infinity;
      for (const k of designMap.keys()) {
        if ((k.startsWith(id + '_') || id.startsWith(k + '_')) && k.length < bestLen) { r = k; bestLen = k.length; }
      }
    }
    resolveCache.set(id, r);
  }
  if (r) report.resolved.push({ nation, from: id, to: r });
  return r;
}

// ---- inventories ------------------------------------------------------------------
const invMap = new Map<string, NationInventory>();
for (const r of REGIONS) {
  for (const raw of r.INVENTORY) {
    const inv: NationInventory = { code: raw.code, units: [], produces: [] };
    for (const u of raw.units ?? []) {
      const rid = resolveId(u.id, raw.code);
      if (!rid) { report.missingInventoryIds.push({ nation: raw.code, id: u.id }); continue; }
      const c = Math.floor(u.count);
      if (c <= 0) continue;
      const e = inv.units.find((x) => x.id === rid);
      if (e) e.count += c; else inv.units.push({ id: rid, count: c });
    }
    for (const id of raw.produces ?? []) {
      const rid = resolveId(id, raw.code);
      if (!rid) { report.missingProduceIds.push({ nation: raw.code, id }); continue; }
      if (!inv.produces.includes(rid)) inv.produces.push(rid);
    }
    const prev = invMap.get(raw.code);
    if (prev) {
      // Same nation listed in two regions: merge (units summed by id).
      report.duplicateInventories.push(`${raw.code} (${r.name})`);
      for (const u of inv.units) {
        const e = prev.units.find((x) => x.id === u.id);
        if (e) e.count += u.count; else prev.units.push(u);
      }
      for (const id of inv.produces) if (!prev.produces.includes(id)) prev.produces.push(id);
    } else invMap.set(raw.code, inv);
  }
}
export const INVENTORY: NationInventory[] = [...invMap.values()];

report.totals = {
  designs: DESIGNS.length,
  future: DESIGNS.filter((d) => d.future).length,
  nations: INVENTORY.length,
  units: INVENTORY.reduce((a, i) => a + i.units.reduce((b, u) => b + u.count, 0), 0),
};
export const MILITARY_REPORT: MilitaryReport = report;

// ---- lookups ------------------------------------------------------------------------
export const militaryDesign = (id: string): MilitaryDesign | undefined => designMap.get(id);
export const inventoryOf = (code: string): NationInventory | undefined => invMap.get(code);
export const designsByOrigin = (code: string): MilitaryDesign[] => DESIGNS.filter((d) => d.origin === code);
export const designsByCategory = (cat: UnitCategory): MilitaryDesign[] => DESIGNS.filter((d) => d.category === cat);
/** Closest generic (sim/data/units.ts) design id for a real design. */
export function genericFallback(d: MilitaryDesign): string {
  const y = d.year;
  const gen = d.future || y >= 2024 ? 4 : y >= 2012 ? 3 : y >= 2000 ? 2 : 1;
  return designId(d.category, gen);
}
/** Generation 1..4 derived from the in-service year. */
export function generationOf(d: { year: number; future: boolean }): number {
  return d.future || d.year >= 2024 ? 4 : d.year >= 2012 ? 3 : d.year >= 1998 ? 2 : 1;
}
