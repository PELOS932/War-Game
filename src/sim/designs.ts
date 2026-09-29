/**
 * Which designs a nation can build: its real-world designs (own production,
 * licences, researched national programmes) plus generic designs for
 * categories where it has no real design.
 */
import { UnitClass, type GameState, type Nation, type UnitDesign } from './types';

export function ownedDesigns(n: Nation): Set<string> {
  if (!n.ownDesigns) n.ownDesigns = new Set();
  return n.ownDesigns;
}

interface Cache { sig: string; set: Set<string>; list: string[] }
const cache = new WeakMap<Nation, Cache>();

/** Cheap generic-availability test (tech gate only). */
export function genericUnlocked(n: Nation, d: UnitDesign): boolean {
  return !d.requiresTech || n.knownTechs.has(d.requiresTech);
}

export function buildable(state: GameState, n: Nation): Cache {
  const own = ownedDesigns(n);
  const sig = `${own.size}:${n.knownTechs.size}:${state.designs.size}`;
  const c = cache.get(n);
  if (c && c.sig === sig) return c;
  const cats = new Set<number>();
  for (const id of own) {
    const d = state.designs.get(id);
    if (d && !d.future && d.real) cats.add(d.category);
  }
  const set = new Set<string>();
  for (const d of state.designs.values()) {
    if (own.has(d.id)) set.add(d.id); // real designs and generic ones a region lists as produced
    else if (!d.real && !cats.has(d.category) && genericUnlocked(n, d)) set.add(d.id);
  }
  const res = { sig, set, list: [...set] };
  cache.set(n, res);
  return res;
}

export function isBuildable(state: GameState, n: Nation, d: UnitDesign): boolean {
  return buildable(state, n).set.has(d.id);
}

export function designClass(d: UnitDesign): UnitClass {
  return d.cls;
}

/** Display name incl. origin, e.g. "F-35A Lightning II". */
export function designLabel(d: UnitDesign): string {
  return d.name;
}
