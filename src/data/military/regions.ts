/**
 * Region wiring: the four regional data files are aggregated here. Each region
 * exports `DESIGNS` / `INVENTORY` (see schema.ts). Until a regional file exists
 * the tiny stub keeps the game running.
 */
import type { MilitaryDesign, NationInventory } from './schema';
import * as stub from './stub';

export interface RegionSource { name: string; DESIGNS: MilitaryDesign[]; INVENTORY: NationInventory[] }

export const REGIONS: RegionSource[] = [
  { name: 'stub', DESIGNS: stub.DESIGNS, INVENTORY: stub.INVENTORY },
];
