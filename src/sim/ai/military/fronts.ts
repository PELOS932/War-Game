/**
 * Front lines: our border hexes facing each adversary, split into sectors,
 * with per-sector threat estimates from visible enemy units plus rough
 * intelligence on unseen forces.
 */
import type { AIContext } from '../context';
import type { FrontSector, NationMemory } from '../memory';
import { clusterBorder, medoid } from '../territory';

export interface Adversary {
  nation: number;
  /** At war with us. */
  hot: boolean;
  /** Our planned war target (staging). */
  target: boolean;
  /** 0..1 how seriously to take this adversary when not at war. */
  weight: number;
}

/** Enemy land power per hex from visible units of the given adversaries. */
export function visibleEnemyPower(ctx: AIContext, me: number, advs: Adversary[]): Map<number, number> {
  const out = new Map<number, number>();
  const game = ctx.game;
  for (const a of advs) {
    for (const u of ctx.units.land[a.nation] ?? []) {
      if (u.embarked) continue;
      if (!game.isVisible(me, u.hex)) continue;
      const info = ctx.design(u.design);
      if (!info) continue;
      const p = Math.max(1, info.ground) * (u.strength / 100) * (0.45 + 0.55 * u.efficiency / 100);
      out.set(u.hex, (out.get(u.hex) ?? 0) + p);
    }
  }
  return out;
}

function sectorSize(borderLen: number): number {
  // Keep sector counts manageable on very long borders.
  return Math.max(5, Math.ceil(borderLen / 18));
}

/** (Re)build sector geometry when territory or adversaries changed. */
export function buildFronts(ctx: AIContext, me: number, mem: NationMemory, advs: Adversary[]): void {
  const key = ctx.terr.version * 1000 + advs.reduce((s, a) => (s * 31 + a.nation * 3 + (a.hot ? 1 : 0) + (a.target ? 2 : 0)) % 997, 7);
  if (mem.frontsVersion === key) return;
  mem.frontsVersion = key;
  const grid = ctx.grid;
  const cities = ctx.state.cities;
  const cap = ctx.capitalHex(me);
  const ownCities = (ctx.terr.cities[me] ?? []).map((id) => cities[id]);
  const sectors: FrontSector[] = [];
  for (const a of advs) {
    const border = ctx.terr.border[me]?.get(a.nation);
    if (!border || border.length === 0) continue;
    const chunks = clusterBorder(grid, border, sectorSize(border.length));
    for (const hexes of chunks) {
      const anchor = medoid(grid, hexes);
      let value = 1;
      if (cap >= 0) {
        const d = grid.distance(cap, anchor);
        if (d <= 8) value += 4 * (1 - d / 9);
      }
      for (const c of ownCities) {
        const d = grid.distance(c.hex, anchor);
        if (d <= 4) value += Math.log10(1 + c.population) * (1 - d / 5) * 0.6;
      }
      sectors.push({ key: anchor, adversary: a.nation, hexes, anchor, threat: 0, value, baseValue: value, demand: 0, assigned: 0, present: 0, hot: a.hot });
    }
  }
  mem.fronts = sectors;
}

/**
 * Update per-sector threat from visible enemies (and unseen estimates).
 * Returns the visible enemy power map for reuse by the caller.
 */
export function assessFronts(ctx: AIContext, me: number, mem: NationMemory, advs: Adversary[], enemyPower: Map<number, number>): void {
  const grid = ctx.grid;
  const sectors = mem.fronts;
  for (const s of sectors) {
    s.threat = 0;
    s.assigned = 0;
    s.present = 0;
    s.demand = 0;
    s.value = s.baseValue;
  }
  if (sectors.length === 0) return;
  const byAdv = new Map<number, FrontSector[]>();
  for (const s of sectors) {
    let l = byAdv.get(s.adversary);
    if (!l) byAdv.set(s.adversary, (l = []));
    l.push(s);
  }
  const owner = ctx.state.hexOwner;
  const visibleByAdv = new Map<number, number>();
  for (const [hex, p] of enemyPower) {
    const o = owner[hex] - 1;
    // Attribute to the sector list of whoever owns units there; fall back to any sector list.
    let best: FrontSector | null = null;
    let bestD = 7;
    for (const a of advs) {
      const list = byAdv.get(a.nation);
      if (!list) continue;
      for (const s of list) {
        const d = grid.distance(hex, s.anchor) - (o === me ? 2 : 0);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
    }
    if (best) {
      const w = o === me ? 1.3 : 1; // units already inside our territory
      best.threat += p * w;
      visibleByAdv.set(best.adversary, (visibleByAdv.get(best.adversary) ?? 0) + p);
    }
  }
  // Unseen forces: rough intelligence estimate spread along the front.
  for (const a of advs) {
    const list = byAdv.get(a.nation);
    if (!list) continue;
    const total = ctx.units.landPower[a.nation] ?? 0;
    const seen = visibleByAdv.get(a.nation) ?? 0;
    const unseen = Math.max(0, total - seen);
    let theirBorder = 0;
    const tb = ctx.terr.border[a.nation];
    if (tb) for (const l of tb.values()) theirBorder += l.length;
    const facing = ctx.terr.borderLength(a.nation, me);
    const exposure = Math.max(a.hot ? 0.45 : 0.15, facing / Math.max(1, theirBorder));
    const spread = unseen * exposure * (a.hot ? 0.55 : 0.35);
    let hexes = 0;
    for (const s of list) hexes += s.hexes.length;
    for (const s of list) {
      s.threat += (spread * s.hexes.length) / Math.max(1, hexes);
      if (!a.hot) s.threat *= a.weight;
    }
  }
}
