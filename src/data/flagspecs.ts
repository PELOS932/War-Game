/** Real-world flag approximations for every country in countries.ts, keyed by ISO3. */
import type { FlagSpec } from '../worldgen/types';
import { FLAGS_A } from './flags-a';
import { FLAGS_B } from './flags-b';

export const FLAGS: Record<string, FlagSpec> = { ...FLAGS_A, ...FLAGS_B };
