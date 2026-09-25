/**
 * Research: research points from the research budget, literacy and labs;
 * up to 3 concurrent projects; tech diffusion discounts (research-sharing
 * partners and widely known techs are cheaper).
 */
import type { Nation, NationId, TechDef } from './types';
import type { Sim } from './core';
import { labLevels } from './economy';

export const MAX_RESEARCH_SLOTS = 3;

export function computeTechMods(techs: Map<string, TechDef>, known: Set<string>): Record<string, number> {
  const mods: Record<string, number> = {};
  for (const id of known) {
    const t = techs.get(id);
    if (!t) continue;
    for (const k in t.effects) mods[k] = (mods[k] ?? 0) + t.effects[k];
  }
  return mods;
}

/** Research points per day. */
export function researchRate(sim: Sim, n: Nation): number {
  const spendDay = (n.researchBudget * n.gdp) / 365; // $B per day
  const minister = n.ministers.find((m) => m.role === 'research');
  const labs = Math.min(0.8, labLevels(n) * 0.035);
  const base = 60 * Math.pow(Math.max(0, spendDay), 0.55);
  return base * (0.5 + 0.5 * n.literacy) * (1 + labs) * (1 + (n.techMods.researchSpeed ?? 0)) * (0.85 + 0.3 * (minister?.competence ?? 0.5));
}

/** Effective RP cost of a tech for a nation (after diffusion discounts). */
export function techCost(sim: Sim, n: Nation, t: TechDef): number {
  let known = 0, alive = 0;
  let partner = false;
  for (const o of sim.state.nations) {
    if (!o.alive || o.id === n.id) continue;
    alive++;
    if (o.knownTechs.has(t.id)) {
      known++;
      if (!partner && sim.hasTreaty(n.id, o.id, 'researchSharing')) partner = true;
    }
  }
  const diffusion = alive > 0 ? 0.25 * (known / alive) : 0;
  return t.cost * (1 - diffusion) * (partner ? 0.7 : 1);
}

export function canResearch(sim: Sim, n: Nation, id: string): string | null {
  const t = sim.state.techs.get(id);
  if (!t) return 'Unknown technology';
  if (n.knownTechs.has(id)) return 'Already researched';
  if (n.researching.some((s) => s.techId === id)) return 'Already being researched';
  for (const p of t.prereqs) if (!n.knownTechs.has(p)) return `Requires ${sim.state.techs.get(p)?.name ?? p}`;
  return null;
}

export function availableTechs(sim: Sim, n: Nation): string[] {
  const out: string[] = [];
  for (const t of sim.state.techs.values()) {
    if (n.knownTechs.has(t.id)) continue;
    if (t.prereqs.every((p) => n.knownTechs.has(p))) out.push(t.id);
  }
  return out;
}

export function grantTech(sim: Sim, n: Nation, id: string): void {
  n.knownTechs.add(id);
  n.techMods = computeTechMods(sim.state.techs, n.knownTechs);
}

export function researchDay(sim: Sim): void {
  const st = sim.state;
  for (const n of st.nations) {
    if (!n.alive) continue;
    n.researchPoints = researchRate(sim, n);
    if (!n.researching.length) continue;
    const share = n.researchPoints / n.researching.length;
    for (let i = n.researching.length - 1; i >= 0; i--) {
      const slot = n.researching[i];
      const t = st.techs.get(slot.techId);
      if (!t || n.knownTechs.has(slot.techId)) { n.researching.splice(i, 1); continue; }
      slot.progress += share;
      if (slot.progress >= techCost(sim, n, t)) {
        n.researching.splice(i, 1);
        grantTech(sim, n, t.id);
        announceTech(sim, n.id, t);
      }
    }
  }
}

function announceTech(sim: Sim, nation: NationId, t: TechDef): void {
  const n = sim.state.nations[nation];
  const major = n.isPlayer || t.cost >= 6000 || n.gdp > 2500;
  if (!major) return;
  const unlock = t.unlocksDesigns.length ? ` New designs available: ${t.unlocksDesigns.map((d) => sim.state.designs.get(d)?.name ?? d).join(', ')}.` : '';
  sim.news('research', `${n.name} completes research into ${t.name}.${n.isPlayer ? unlock : ''}`, [nation], n.isPlayer ? 2 : 1);
}
