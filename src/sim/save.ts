/** Save / load: the world is regenerated deterministically, so only dynamic state is stored. */
import type { GameAPI } from './api';
import { Game } from './game';
import { buildScenario } from './scenario';
import type { GameState } from './types';
import type { WorldData } from '../worldgen/types';

const DYNAMIC_KEYS: (keyof GameState)[] = [
  'hour', 'speed', 'playerNation', 'nations', 'cities', 'units', 'facilities', 'hexOwner', 'hexCore',
  'hexControlChangedHour', 'relations', 'treaties', 'wars', 'proposals', 'market', 'news', 'nextId', 'hexFacilities',
];

const TYPED: Record<string, new (b: ArrayBuffer) => ArrayBufferView> = {
  Float64Array, Float32Array, Uint16Array, Uint8Array, Int32Array, Int8Array,
};

function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function replacer(_k: string, v: unknown): unknown {
  if (v instanceof Map) return { __map: [...v.entries()] };
  if (v instanceof Set) return { __set: [...v] };
  if (ArrayBuffer.isView(v)) {
    const view = v as unknown as { constructor: { name: string }; buffer: ArrayBuffer; byteOffset: number; byteLength: number };
    return { __ta: view.constructor.name, d: bytesToB64(new Uint8Array(view.buffer, view.byteOffset, view.byteLength)) };
  }
  return v;
}

function reviver(_k: string, v: unknown): unknown {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('__map' in o) return new Map(o.__map as [unknown, unknown][]);
    if ('__set' in o) return new Set(o.__set as unknown[]);
    if ('__ta' in o) {
      const bytes = b64ToBytes(o.d as string);
      const Ctor = TYPED[o.__ta as string] ?? Uint8Array;
      return new Ctor(bytes.slice().buffer);
    }
  }
  return v;
}

export function serializeGame(game: GameAPI): string {
  const st = game.state;
  const out: Record<string, unknown> = { v: 1, seed: (game as Game).seed ?? 2030 };
  for (const k of DYNAMIC_KEYS) out[k] = st[k];
  return JSON.stringify(out, replacer);
}

export function loadGame(world: WorldData, json: string): GameAPI {
  const data = JSON.parse(json, reviver) as Record<string, unknown>;
  const seed = (data.seed as number) ?? 2030;
  const state = buildScenario(world, data.playerNation as number, seed);
  const target = state as unknown as Record<string, unknown>;
  for (const k of DYNAMIC_KEYS) if (k in data) target[k] = data[k];
  state.ownerVersion++;
  state.ownerDirty = [];
  state.facilityVersion++;
  const game = new Game(world, state, seed);
  game.sim.rebuildIndices();
  return game;
}
