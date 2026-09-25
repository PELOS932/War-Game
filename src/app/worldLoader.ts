import type { WorldData } from '../worldgen/types';
import { loadCachedWorld, saveCachedWorld } from './cache';

/** Bump when the world builder output changes so stale caches are ignored. */
export const WORLD_CACHE_KEY = 'world-procedural-v1';

type Progress = (stage: string, fraction: number) => void;

/**
 * Loads the Earth world: from the IndexedDB cache when available, otherwise
 * by running the world builder in a Web Worker (falls back to the main thread).
 */
export async function loadWorld(progress: Progress): Promise<WorldData> {
  progress('Loading world data', 0);
  const cached = await loadCachedWorld(WORLD_CACHE_KEY);
  if (cached && cached.hexOwner && cached.elevation) {
    progress('World loaded from cache', 1);
    return cached;
  }
  // The real-Earth builder is not finished yet; use the procedural world.
  await new Promise((r) => setTimeout(r, 30));
  const { generateWorld, DEFAULT_SETTINGS } = await import('../worldgen/generate');
  const world: WorldData = generateWorld({ seed: 2030, ...DEFAULT_SETTINGS }, progress);
  progress('Caching world', 1);
  // Copy before caching is unnecessary: IndexedDB structured-clones the data.
  void saveCachedWorld(WORLD_CACHE_KEY, world);
  return world;
}

