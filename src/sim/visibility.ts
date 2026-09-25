/**
 * Fog of war: per-nation bitsets of hexes currently spotted by units, radars
 * and cities. Own territory is always visible; alliance / map-sharing partners
 * share vision. Submarines are hidden unless an anti-submarine unit of a
 * hostile nation is close enough (spotting × (1 - stealth)) or they just fired.
 */
import { FacilityType, UnitCategory, UnitClass, type NationId } from './types';
import type { Sim } from './core';
import { radarRadius } from './data/facilities';

export class Visibility {
  private bits: Uint32Array[] = [];
  private words: number;
  private partners: NationId[][] = [];
  private partnersVersion = -1;


  constructor(private sim: Sim) {
    this.words = (sim.grid.count + 31) >>> 5;
    for (let i = 0; i < sim.N; i++) this.bits.push(new Uint32Array(this.words));
  }

  private partnersOf(n: NationId): NationId[] {
    if (this.partnersVersion !== this.sim.treatyVersion) {
      this.partners = Array.from({ length: this.sim.N }, () => []);
      for (const t of this.sim.state.treaties) {
        if (t.type === 'alliance' || t.type === 'mapSharing') {
          if (!this.partners[t.a].includes(t.b)) this.partners[t.a].push(t.b);
          if (!this.partners[t.b].includes(t.a)) this.partners[t.b].push(t.a);
        }
      }
      this.partnersVersion = this.sim.treatyVersion;
    }
    return this.partners[n] ?? [];
  }

  isVisible(n: NationId, hex: number): boolean {
    if (n < 0) return true; // spectator
    if (hex < 0 || hex >= this.sim.grid.count) return false;
    const owner = this.sim.state.hexOwner[hex] - 1;
    if (owner === n) return true;
    const w = hex >>> 5, b = 1 << (hex & 31);
    if (this.bits[n][w] & b) return true;
    for (const p of this.partnersOf(n)) {
      if (owner === p || (this.bits[p][w] & b)) return true;
    }
    return false;
  }

  refresh(n: NationId): void {
    const sim = this.sim;
    const bits = this.bits[n];
    bits.fill(0);
    const nation = sim.state.nations[n];
    if (!nation.alive) return;
    const extra = nation.techMods.spotting ?? 0;
    const grid = sim.grid;
    const set = (h: number) => { bits[h >>> 5] |= 1 << (h & 31); };
    for (const u of sim.nationUnits(n)) {
      const d = sim.design(u);
      const r = Math.max(1, Math.round(d.spotting + extra * (d.cls === UnitClass.Naval ? 0.5 : 1)));
      grid.forRadius(u.hex, r, set);
    }
    for (const f of sim.nationFacilities(n)) {
      if (f.type === FacilityType.RadarStation && f.constructionDaysLeft <= 0 && f.damage < 0.8) grid.forRadius(f.hex, radarRadius(f.level), set);
    }
    for (const c of sim.state.cities) if (sim.owner(c.hex) === n) grid.forRadius(c.hex, 2, set);
  }

  /** Staggered hourly refresh. */
  tick(): void {
    const sim = this.sim;
    const hour = sim.state.hour;
    const player = sim.state.playerNation;
    for (let i = 0; i < sim.N; i++) {
      if (!sim.state.nations[i].alive) continue;
      if (i === player || sim.warring.has(i) || (i + hour) % 6 === 0) this.refresh(i);
    }
    this.updateSubmarines();
  }

  refreshAll(): void {
    for (let i = 0; i < this.sim.N; i++) this.refresh(i);
    this.updateSubmarines();
  }

  /** Decide which stealthy units are detected by foreign (hostile) forces. */
  updateSubmarines(): void {
    const sim = this.sim;
    const hour = sim.state.hour;
    for (const u of sim.state.units.values()) {
      const d = sim.design(u);
      if (d.category !== UnitCategory.Submarine) { if (u.hidden) u.hidden = false; continue; }
      if (hour - u.lastCombatHour <= 1) { u.hidden = false; continue; }
      let detected = false;
      sim.grid.forRadius(u.hex, 3, (h, dist) => {
        if (detected) return;
        for (const o of sim.unitsIn(h)) {
          if (o.nation === u.nation || sim.isAllied(o.nation, u.nation)) continue;
          const od = sim.design(o);
          if (od.attackSub <= 0) continue;
          const range = Math.max(1, Math.floor(od.spotting * (1 - d.stealth) + (sim.state.nations[o.nation].techMods.subAttack ?? 0) * 3));
          if (dist <= range) { detected = true; return; }
        }
      });
      u.hidden = !detected;
    }
  }
}
