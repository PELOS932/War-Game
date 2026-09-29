/**
 * Bridges src/data/military (real national equipment) into the simulation:
 * MilitaryDesign -> UnitDesign, future designs -> research items (`design:<id>`).
 */
import { DESIGNS, generationOf, type MilitaryDesign } from '../../data/military/index';
import { CATEGORY_CLASS, UnitCategory, UnitClass, type TechCategory, type TechDef, type UnitDesign } from '../types';

export const DESIGN_TECH_PREFIX = 'design:';
export const designTechId = (designId: string): string => DESIGN_TECH_PREFIX + designId;

export function toUnitDesign(m: MilitaryDesign): UnitDesign {
  return {
    id: m.id, name: m.name, category: m.category, cls: CATEGORY_CLASS[m.category], generation: generationOf(m),
    requiresTech: null, armor: m.armor, mobility: m.mobility, personnel: m.personnel,
    attackSoft: m.attackSoft, attackHard: m.attackHard, attackAir: m.attackAir, attackNaval: m.attackNaval, attackSub: m.attackSub,
    rangeGround: m.rangeGround, rangeAir: m.rangeAir, rangeNaval: m.rangeNaval,
    defenseGround: m.defenseGround, defenseAir: m.defenseAir, defenseNaval: m.defenseNaval,
    speedKmh: m.speedKmh, spotting: m.spotting, stealth: m.stealth, rangeKm: m.rangeKm, fuelCapacity: m.fuelCapacity,
    cost: m.cost, militaryGoodsCost: m.militaryGoodsCost, buildDays: m.buildDays, upkeep: m.upkeep,
    indirect: m.indirect, canCapture: m.canCapture, description: m.description,
    real: true, origin: m.origin, year: m.year, future: m.future, exportable: m.exportable,
    exportTo: m.exportTo && m.exportTo.length ? m.exportTo.slice() : undefined, predecessor: m.predecessor,
  };
}

export function realUnitDesigns(): UnitDesign[] {
  return DESIGNS.map(toUnitDesign);
}

/** One research item per future design (only the origin nation and its research-sharing partners can research it). */
export function futureDesignTechs(): TechDef[] {
  const future = new Set(DESIGNS.filter((d) => d.future).map((d) => d.id));
  const out: TechDef[] = [];
  for (const m of DESIGNS) {
    if (!m.future) continue;
    const cls = CATEGORY_CLASS[m.category];
    const cat: TechCategory = m.category === UnitCategory.MissileLauncher ? 'missiles' : cls === UnitClass.Air ? 'air' : cls === UnitClass.Naval ? 'naval' : 'land';
    out.push({
      id: designTechId(m.id),
      name: m.name,
      category: cat,
      cost: m.researchCost ?? 8000,
      prereqs: m.predecessor && future.has(m.predecessor) ? [designTechId(m.predecessor)] : [],
      description: `${m.description} National programme of ${m.origin}, expected in service around ${m.year}.`,
      effects: {},
      unlocksDesigns: [m.id],
      nations: [m.origin],
    });
  }
  return out;
}
