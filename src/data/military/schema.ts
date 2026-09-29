/**
 * SHARED CONTRACT — real-world national military equipment.
 *
 * Regional data files (src/data/military/<region>.ts) each export:
 *   export const DESIGNS: MilitaryDesign[]      // equipment MANUFACTURED/DESIGNED in that region
 *   export const INVENTORY: NationInventory[]   // what each nation of the region FIELDS on 1 Jan 2030
 * Inventories may reference designs defined in other regions by id (e.g. Poland
 * fielding "k2_black_panther"), so ids must follow the naming rule below.
 *
 * ID RULE: lowercase ascii, words joined by "_", the common real designation
 * without punctuation: "m1a2_sepv3_abrams", "leopard_2a7", "t90m", "su35s",
 * "f35a", "f16v", "j20", "type_055", "arleigh_burke_flt3", "virginia_block5",
 * "patriot_pac3", "s400", "himars", "k9_thunder", "bayraktar_tb2".
 * Future/fictional designs: "<origin>_<concept>", e.g. "usa_f47_ngad", "chn_type_004".
 *
 * STAT SCALE: keep consistent with the generic designs in src/sim/data/units.ts
 * (same meaning & 0..100 ranges; range in hexes where 1 hex ≈ 50 km; air combat
 * radius in km; cost in USD millions per game unit = battalion / squadron /
 * single major warship). A 2030 top-tier MBT battalion ≈ generic gen-3/4 armor.
 */
import type { ArmorType, Mobility, UnitCategory } from '../../sim/types';

export interface MilitaryDesign {
  id: string;
  name: string; // real designation, e.g. "M1A2 SEPv3 Abrams"
  category: UnitCategory;
  origin: string; // ISO3 of the designing/manufacturing nation
  year: number; // in-service year (future designs: expected year)
  /** true = not in service by 2030; must be researched by origin nation (or bought once someone has it). */
  future: boolean;
  /** Research points to unlock (future designs only; ~ scale of src/sim/data/techs.ts costs). */
  researchCost?: number;
  /** Id of an earlier design this one requires/evolves from (optional). */
  predecessor?: string;
  /** Nations allowed to buy it on the arms market (ISO3). Empty/undefined = any nation not hostile to origin. */
  exportTo?: string[];
  exportable: boolean; // false for sensitive systems (e.g. B-21, Type 055 in reality)
  armor: ArmorType;
  mobility: Mobility;
  personnel: number;
  attackSoft: number;
  attackHard: number;
  attackAir: number;
  attackNaval: number;
  attackSub: number;
  rangeGround: number;
  rangeAir: number;
  rangeNaval: number;
  defenseGround: number;
  defenseAir: number;
  defenseNaval: number;
  speedKmh: number;
  spotting: number;
  stealth: number;
  rangeKm: number;
  fuelCapacity: number;
  cost: number;
  militaryGoodsCost: number;
  buildDays: number;
  upkeep: number;
  indirect: boolean;
  canCapture: boolean;
  description: string; // 1–2 sentences: role, key specs (weight/armament/speed/range), notes
}

export interface NationInventory {
  code: string; // ISO3
  /** Game units on 1 Jan 2030: land = battalions, air = squadrons, naval = major ships. */
  units: { id: string; count: number }[];
  /** Designs this nation can PRODUCE domestically at start (licence or own). */
  produces: string[];
}
