/**
 * Region wiring: the regional data files are aggregated here. Each region
 * exports `DESIGNS` / `INVENTORY` (see schema.ts).
 */
import type { MilitaryDesign, NationInventory } from './schema';
import * as americas from './americas';
import * as asiaPacific from './asia_pacific';
import * as eurasia from './eurasia_mideast_africa';

export interface RegionSource { name: string; DESIGNS: MilitaryDesign[]; INVENTORY: NationInventory[] }

export const REGIONS: RegionSource[] = [
  { name: 'americas', ...americas },
  { name: 'europe', DESIGNS: [], INVENTORY: [] }, // TODO wire europe.ts when it exists
  { name: 'eurasia_mideast_africa', ...eurasia },
  { name: 'asia_pacific', ...asiaPacific },
];

/** Manual id aliases (id used by one region -> id defined by another). */
export const ALIASES: Record<string, string> = {
  f16v: 'f16v_block70',
};
