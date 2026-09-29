/** Tiny placeholder dataset used until the regional data files are wired in (see regions.ts). */
import { UnitCategory as C } from '../../sim/types';
import type { MilitaryDesign, NationInventory } from './schema';

const base = {
  personnel: 0, attackSoft: 0, attackHard: 0, attackAir: 0, attackNaval: 0, attackSub: 0,
  rangeGround: 1, rangeAir: 0, rangeNaval: 0, defenseGround: 50, defenseAir: 40, defenseNaval: 40,
  speedKmh: 50, spotting: 2, stealth: 0.05, rangeKm: 0, fuelCapacity: 80, cost: 500, militaryGoodsCost: 50,
  buildDays: 100, upkeep: 2, indirect: false, canCapture: false, exportable: true, future: false,
};
export const DESIGNS: MilitaryDesign[] = [
  { ...base, id: 'm1a2_sepv3_abrams', name: 'M1A2 SEPv3 Abrams', category: C.Armor, origin: 'USA', year: 2017, armor: 'hard', mobility: 'tracked', personnel: 550, attackSoft: 62, attackHard: 90, defenseGround: 85, cost: 1200, description: 'US main battle tank.', canCapture: true },
  { ...base, id: 't90m', name: 'T-90M Proryv', category: C.Armor, origin: 'RUS', year: 2020, armor: 'hard', mobility: 'tracked', personnel: 550, attackSoft: 58, attackHard: 84, defenseGround: 78, cost: 800, description: 'Russian MBT.', canCapture: true },
  { ...base, id: 'f35a', name: 'F-35A Lightning II', category: C.Multirole, origin: 'USA', year: 2016, armor: 'air', mobility: 'air', personnel: 200, attackAir: 80, attackSoft: 70, attackHard: 70, rangeAir: 3, rangeKm: 1100, speedKmh: 1900, stealth: 0.8, cost: 1800, description: 'Stealth multirole.' },
  { ...base, id: 'usa_f47_ngad', name: 'F-47 NGAD', category: C.Fighter, origin: 'USA', year: 2035, future: true, researchCost: 9000, predecessor: 'f35a', armor: 'air', mobility: 'air', personnel: 200, attackAir: 95, rangeAir: 4, rangeKm: 1600, speedKmh: 2400, stealth: 0.95, cost: 3000, exportable: false, description: 'Sixth-generation fighter.' },
];
export const INVENTORY: NationInventory[] = [
  { code: 'USA', units: [{ id: 'm1a2_sepv3_abrams', count: 60 }, { id: 'f35a', count: 40 }], produces: ['m1a2_sepv3_abrams', 'f35a'] },
  { code: 'RUS', units: [{ id: 't90m', count: 50 }], produces: ['t90m'] },
];
