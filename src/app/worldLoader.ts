import type { WorldData } from '../worldgen/types';
import { loadCachedWorld, saveCachedWorld } from './cache';

/** Bump when the world builder output changes so stale caches are ignored. */
export const WORLD_CACHE_KEY = 'earth-v1';

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
  let world: WorldData;
  try {
    world = await generateInWorker(progress);
  } catch (err) {
    console.warn('World worker failed, generating on main thread', err);
    const { generateEarth } = await import('../worldgen/earth/index');
    world = generateEarth(progress);
  }
  progress('Caching world', 1);
  // Copy before caching is unnecessary: IndexedDB structured-clones the data.
  void saveCachedWorld(WORLD_CACHE_KEY, world);
  return world;
}

function generateInWorker(progress: Progress): Promise<WorldData> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../worldgen/worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as { type: string; stage?: string; fraction?: number; world?: WorldData; error?: string };
      if (msg.type === 'progress') progress(msg.stage ?? '', msg.fraction ?? 0);
      else if (msg.type === 'done' && msg.world) {
        worker.terminate();
        resolve(msg.world);
      } else if (msg.type === 'error') {
        worker.terminate();
        reject(new Error(msg.error));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message));
    };
    worker.postMessage({ type: 'generate', kind: 'earth' });
  });
}
