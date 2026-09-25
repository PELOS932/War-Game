/**
 * Research minister: keeps research slots filled with technologies chosen by
 * doctrine (land/air/naval by geography & navalFocus), economic needs and
 * war status.
 */
import { Resource, UnitClass, type TechCategory } from '../types';
import { isDemocratic } from '../../worldgen/types';
import type { AIContext } from './context';
import { remember, type NationMemory } from './memory';
import { hash2 } from '../../core/rng';

export interface Geo {
  landlocked: boolean;
  island: boolean;
  coastalShare: number;
}

export function geography(ctx: AIContext, me: number): Geo {
  const hexes = ctx.terr.hexes[me]?.length ?? 0;
  const coastal = ctx.terr.coastal[me]?.length ?? 0;
  const neighbours = ctx.terr.landNeighbours(me).length;
  return {
    landlocked: coastal === 0,
    island: neighbours === 0 && coastal > 0,
    coastalShare: hexes > 0 ? coastal / hexes : 0,
  };
}

export function categoryWeights(ctx: AIContext, me: number, mem: NationMemory): Record<TechCategory, number> {
  const n = ctx.nation(me);
  const geo = geography(ctx, me);
  const war = ctx.atWarAny(me) ? 1 : 0;
  const threat = Math.max(mem.threat, mem.posture === 'prep' ? 0.6 : 0);
  const deficit = (r: Resource) => (mem.deficitDays[r] > 5 ? 1 : 0);
  const demo = isDemocratic(n.government);
  const seed = ctx.state.world.nations[me];
  return {
    economy: 1.0 + (n.treasury < 0 ? 0.3 : 0),
    industry: 0.95 + 0.4 * Math.max(deficit(Resource.IndustryGoods), deficit(Resource.ConsumerGoods)),
    energy: 0.85 + 0.7 * deficit(Resource.ElectricPower) + 0.2 * deficit(Resource.Petroleum),
    agriculture: 0.6 + 0.9 * deficit(Resource.Agriculture),
    society: 0.55 + (n.approval < (demo ? 50 : 35) ? 0.5 : 0),
    land: 0.6 + 0.8 * threat + 0.6 * war + (geo.landlocked ? 0.25 : 0) + 0.3 * n.militarism - (geo.island ? 0.3 : 0),
    air: 0.45 + (seed?.airRating ?? 3) / 20 + 0.35 * threat + 0.3 * war + (geo.island ? 0.2 : 0),
    naval: geo.landlocked ? 0 : 0.15 + 1.1 * n.navalFocus + (geo.island ? 0.35 : 0) + 0.1 * (seed?.navyRating ?? 0) / 10,
    missiles: 0.25 + 0.35 * n.militarism + (n.nuclear ? 0.2 : 0) + 0.2 * war,
    cyber: 0.3 + 0.5 * n.techLevel,
  };
}

export function runResearch(ctx: AIContext, me: number, mem: NationMemory): void {
  const game = ctx.game;
  const n = ctx.nation(me);
  const avail = game.availableTechs(me);
  if (avail.length === 0) return;
  const busy = new Set(n.researching.map((s) => s.techId));
  const weights = categoryWeights(ctx, me, mem);
  const geo = geography(ctx, me);
  const techs = ctx.state.techs;
  const costs: number[] = [];
  for (const id of avail) {
    const t = techs.get(id);
    if (t) costs.push(t.cost);
  }
  costs.sort((a, b) => a - b);
  const refCost = Math.max(1, costs[costs.length >> 1] ?? 1);
  const scored: { id: string; s: number }[] = [];
  for (const id of avail) {
    if (busy.has(id) || n.knownTechs.has(id)) continue;
    const t = techs.get(id);
    if (!t) continue;
    let w = weights[t.category] ?? 0.5;
    if (w <= 0) continue;
    // Designs this tech unlocks: value ones matching our doctrine.
    let unlock = 0;
    for (const did of t.unlocksDesigns) {
      const info = ctx.design(did);
      if (!info) continue;
      if (info.cls === UnitClass.Naval && geo.landlocked) continue;
      unlock += info.cls === UnitClass.Naval ? 0.5 * n.navalFocus + 0.1 : 0.3;
    }
    w *= 1 + Math.min(0.8, unlock);
    // Slight personal preference noise so nations diverge (deterministic).
    const noise = 0.9 + 0.2 * hash2(me, hashId(id), ctx.state.world.settings.seed);
    const s = (w * noise) / Math.sqrt(Math.max(0.2, t.cost / refCost));
    scored.push({ id, s });
  }
  scored.sort((a, b) => b.s - a.s || (a.id < b.id ? -1 : 1));
  let fails = 0;
  let started = 0;
  for (const c of scored) {
    if (fails >= 2 || started >= 4) break;
    const res = game.startResearch(me, c.id);
    if (res.ok) {
      started++;
      remember(mem, ctx.state.hour, 'research', `researching ${techs.get(c.id)?.name ?? c.id}`);
    } else {
      fails++;
    }
  }
}

function hashId(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}
