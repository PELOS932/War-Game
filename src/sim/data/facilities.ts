/**
 * Facility catalogue with Supreme-Ruler-style production chains.
 * Output/inputs are resource units per day at level 1 and 100% efficiency;
 * both scale linearly with level. Resource base prices (USD M / unit) are in
 * market.ts; every chain adds value (output worth more than its inputs).
 */
import { FacilityType, Resource, type FacilityDef } from '../types';

const R = Resource;

export const FACILITY_DEFS: FacilityDef[] = [
  { type: FacilityType.Farm, name: 'Farm Complex', produces: R.Agriculture, output: 6, inputs: { [R.Petroleum]: 0.15, [R.ElectricPower]: 0.2 }, workers: 9, cost: 120, buildDays: 90, upkeep: 0.05, maxLevel: 5, military: false, description: 'Cropland, orchards and livestock. Feeds the population and supplies consumer industry.' },
  { type: FacilityType.Plantation, name: 'Rubber Plantation', produces: R.Rubber, output: 3, inputs: { [R.ElectricPower]: 0.05 }, workers: 6, cost: 90, buildDays: 120, upkeep: 0.03, maxLevel: 5, military: false, description: 'Tropical rubber plantations. Requires jungle or tropical forest.' },
  { type: FacilityType.LumberMill, name: 'Lumber Mill', produces: R.Timber, output: 5, inputs: { [R.ElectricPower]: 0.2, [R.Petroleum]: 0.05 }, workers: 4, cost: 90, buildDays: 90, upkeep: 0.03, maxLevel: 5, military: false, description: 'Logging camps and saw mills. Requires forest.' },
  { type: FacilityType.OilWell, name: 'Oil Field', produces: R.Petroleum, output: 6, inputs: { [R.ElectricPower]: 0.3 }, workers: 2, cost: 450, buildDays: 180, upkeep: 0.1, maxLevel: 5, military: false, description: 'Onshore oil and gas wells with refining. Requires an oil deposit.' },
  { type: FacilityType.OffshorePlatform, name: 'Offshore Platform', produces: R.Petroleum, output: 8, inputs: { [R.ElectricPower]: 0.2 }, workers: 1.5, cost: 900, buildDays: 300, upkeep: 0.18, maxLevel: 5, military: false, description: 'Offshore drilling platform. Requires an offshore oil & gas field near your coast.' },
  { type: FacilityType.CoalMine, name: 'Coal Mine', produces: R.Coal, output: 10, inputs: { [R.ElectricPower]: 0.4, [R.Petroleum]: 0.05 }, workers: 5, cost: 250, buildDays: 150, upkeep: 0.06, maxLevel: 5, military: false, description: 'Open-pit and deep coal mining. Requires a coal seam.' },
  { type: FacilityType.OreMine, name: 'Metal Ore Mine', produces: R.MetalOre, output: 6, inputs: { [R.ElectricPower]: 0.5, [R.Petroleum]: 0.05 }, workers: 4, cost: 300, buildDays: 150, upkeep: 0.07, maxLevel: 5, military: false, description: 'Iron, copper and bauxite mining. Requires a metal ore deposit.' },
  { type: FacilityType.UraniumMine, name: 'Uranium Mine', produces: R.Uranium, output: 0.5, inputs: { [R.ElectricPower]: 0.2 }, workers: 1, cost: 350, buildDays: 200, upkeep: 0.06, maxLevel: 5, military: false, description: 'Uranium mining and enrichment. Fuels nuclear power plants.' },
  { type: FacilityType.PowerPlant, name: 'Fossil Power Station', produces: R.ElectricPower, output: 20, inputs: { [R.Coal]: 12, [R.Petroleum]: 2 }, workers: 1.5, cost: 700, buildDays: 240, upkeep: 0.1, maxLevel: 5, military: false, description: 'Coal and gas fired power station.' },
  { type: FacilityType.NuclearPlant, name: 'Nuclear Power Plant', produces: R.ElectricPower, output: 40, inputs: { [R.Uranium]: 0.8 }, workers: 1.5, cost: 5500, buildDays: 720, upkeep: 0.35, maxLevel: 3, military: false, description: 'Nuclear reactors. Huge clean output from small amounts of uranium.' },
  { type: FacilityType.HydroDam, name: 'Hydroelectric Dam', produces: R.ElectricPower, output: 15, inputs: {}, workers: 0.5, cost: 2200, buildDays: 600, upkeep: 0.06, maxLevel: 3, military: false, description: 'Hydroelectric dam. Needs a river in hills or mountains; no fuel required.' },
  { type: FacilityType.RenewablePlant, name: 'Wind & Solar Farm', produces: R.ElectricPower, output: 7, inputs: {}, workers: 0.4, cost: 500, buildDays: 150, upkeep: 0.03, maxLevel: 5, military: false, description: 'Wind turbines and solar arrays. No fuel, modest output.' },
  { type: FacilityType.ConsumerFactory, name: 'Consumer Goods Factory', produces: R.ConsumerGoods, output: 10, inputs: { [R.Agriculture]: 2, [R.Timber]: 1, [R.Rubber]: 0.5, [R.IndustryGoods]: 3, [R.ElectricPower]: 4 }, workers: 12, cost: 600, buildDays: 180, upkeep: 0.08, maxLevel: 5, military: false, description: 'Manufactures food products, clothing, electronics and vehicles for the population.' },
  { type: FacilityType.IndustrialPlant, name: 'Heavy Industry Plant', produces: R.IndustryGoods, output: 10, inputs: { [R.MetalOre]: 6, [R.Coal]: 4, [R.ElectricPower]: 5, [R.Petroleum]: 1 }, workers: 10, cost: 800, buildDays: 240, upkeep: 0.1, maxLevel: 5, military: false, description: 'Steel mills, chemicals and machinery. Supplies all other industry and construction.' },
  { type: FacilityType.MilitaryFactory, name: 'Arms Factory', produces: R.MilitaryGoods, output: 4, inputs: { [R.IndustryGoods]: 4, [R.MetalOre]: 1, [R.Petroleum]: 1, [R.ElectricPower]: 2 }, workers: 6, cost: 900, buildDays: 270, upkeep: 0.12, maxLevel: 5, military: true, description: 'Produces munitions and military equipment. Also allows land unit production in its city.' },
  { type: FacilityType.ResearchLab, name: 'Research Laboratory', produces: null, output: 0, inputs: { [R.ElectricPower]: 1.5 }, workers: 2, cost: 700, buildDays: 240, upkeep: 0.25, maxLevel: 5, military: false, description: 'National laboratories and universities. Each level adds research output.' },
  { type: FacilityType.Barracks, name: 'Army Base', produces: null, output: 0, inputs: { [R.ElectricPower]: 0.3 }, workers: 1, cost: 250, buildDays: 120, upkeep: 0.08, maxLevel: 3, military: true, description: 'Army garrison and training centre. Allows land unit production and acts as a supply source.' },
  { type: FacilityType.Airbase, name: 'Air Base', produces: null, output: 0, inputs: { [R.ElectricPower]: 0.4, [R.Petroleum]: 0.3 }, workers: 1.5, cost: 600, buildDays: 180, upkeep: 0.15, maxLevel: 3, military: true, description: 'Military airfield. Hosts air squadrons (4 per level) and builds aircraft.' },
  { type: FacilityType.NavalBase, name: 'Naval Base', produces: null, output: 0, inputs: { [R.ElectricPower]: 0.4, [R.Petroleum]: 0.2 }, workers: 2, cost: 900, buildDays: 270, upkeep: 0.18, maxLevel: 3, military: true, description: 'Naval base and shipyard. Builds, repairs and resupplies warships. Must be on the coast.' },
  { type: FacilityType.MissileSilo, name: 'Strategic Missile Complex', produces: null, output: 0, inputs: { [R.ElectricPower]: 0.2 }, workers: 0.5, cost: 2500, buildDays: 540, upkeep: 0.3, maxLevel: 1, military: true, description: 'Hardened strategic missile silos. A deterrent that discourages attacks.' },
  { type: FacilityType.SupplyDepot, name: 'Supply Depot', produces: null, output: 0, inputs: { [R.Petroleum]: 0.1 }, workers: 0.5, cost: 150, buildDays: 60, upkeep: 0.04, maxLevel: 3, military: true, description: 'Forward logistics hub. Acts as a strong supply source for nearby units.' },
  { type: FacilityType.RadarStation, name: 'Radar Station', produces: null, output: 0, inputs: { [R.ElectricPower]: 0.2 }, workers: 0.2, cost: 200, buildDays: 90, upkeep: 0.04, maxLevel: 3, military: true, description: 'Long-range radar. Reveals the surrounding area (6 hexes + 1 per level) and aids interception.' },
];

/** Radius (hexes) revealed by a radar station of the given level. */
export function radarRadius(level: number): number {
  return 5 + level;
}

/** Air squadrons an airbase can host. */
export function airbaseCapacity(level: number): number {
  return 4 * level + 2;
}
