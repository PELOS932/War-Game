/**
 * Shared state for all HUD components: the game, renderer, player nation,
 * the current unit selection and cross-component navigation.
 */
import type { GameAPI, CommandResult } from '../../sim/api';
import type { MapRenderer } from '../../render/api';
import {
  CATEGORY_CLASS, FacilityType, GameState, Nation, Unit, UnitClass, UnitDesign, TreatyType,
} from '../../sim/types';
import type { Affiliation } from '../icons';

export type TabId = 'overview' | 'cabinet' | 'military' | 'build' | 'research' | 'diplomacy' | 'trade' | 'finance' | 'world';

export type TargetMode =
  | { kind: 'move' | 'attack' | 'airStrike' | 'airPatrol' | 'airIntercept' | 'rebase' | 'navalPatrol' | 'bombard' }
  | { kind: 'facility'; type: FacilityType };

export interface Ctx {
  game: GameAPI;
  renderer: MapRenderer;
  root: HTMLElement;
  readonly state: GameState;
  readonly player: number;
  readonly me: Nation;
  /** Selected own units. */
  selection: number[];
  /** Foreign unit being inspected (-1 none). */
  inspect: number;
  /** Hex shown in the hex info panel (-1 none). */
  infoHex: number;
  target: TargetMode | null;
  openTab(tab: TabId, arg?: unknown): void;
  select(ids: number[], add?: boolean): void;
  setTarget(mode: TargetMode | null): void;
  focusHex(hex: number, ping?: string): void;
  /** Mark panels dirty so they refresh on the next frame. */
  dirty(): void;
  /** Run a command, toast the reason when it fails, refresh panels. */
  run(res: CommandResult, okText?: string): boolean;
  isDirty: boolean;
}

export function designOf(state: GameState, u: Unit): UnitDesign | undefined {
  return state.designs.get(u.design);
}

export function classOf(state: GameState, u: Unit): UnitClass {
  const d = state.designs.get(u.design);
  return d ? d.cls ?? CATEGORY_CLASS[d.category] : UnitClass.Land;
}

export function affiliation(game: GameAPI, player: number, nation: number): Affiliation {
  if (nation === player) return 'friend';
  if (player < 0) return 'neutral';
  if (game.atWar(player, nation)) return 'hostile';
  if (game.hasTreaty(player, nation, 'alliance') || game.hasTreaty(player, nation, 'defensePact')) return 'ally';
  return 'neutral';
}

const ORDER_TEXT: Record<string, string> = {
  idle: 'Idle',
  move: 'Moving',
  attack: 'Attacking',
  hold: 'Holding position',
  retreat: 'Retreating',
  patrol: 'Patrolling',
  airStrike: 'Air strike',
  airPatrol: 'Combat air patrol',
  airIntercept: 'Intercepting',
  rebase: 'Rebasing',
  returnToBase: 'Returning to base',
  reinforce: 'Reinforcing',
  embark: 'Embarked',
};

export function orderText(state: GameState, u: Unit): string {
  let t = ORDER_TEXT[u.order.type] ?? u.order.type;
  if (u.inCombat) t = 'In combat';
  else if (u.embarked) t = 'At sea (embarked)';
  if (u.order.targetHex >= 0 && u.order.type !== 'idle' && u.order.type !== 'hold' && !u.inCombat) {
    t += ' → ' + hexPlace(state, u.order.targetHex);
  }
  return t;
}

const placeCache = new Map<number, string>();
let placeCacheCities = -1;

/** "Paris" or "near Lyon" or terrain fallback. */
export function hexPlace(state: GameState, hex: number): string {
  if (hex < 0) return '—';
  if (placeCacheCities !== state.cities.length) {
    placeCache.clear();
    placeCacheCities = state.cities.length;
  }
  const c = placeCache.get(hex);
  if (c !== undefined) return c;
  const w = state.world;
  let res = '';
  const cid = w.hexCity[hex];
  if (cid >= 0 && state.cities[cid]) res = state.cities[cid].name;
  else {
    const g = state.grid;
    let best = -1;
    let bd = 7;
    for (const city of state.cities) {
      const d = g.distance(hex, city.hex);
      if (d < bd) {
        bd = d;
        best = city.id;
      }
    }
    if (best >= 0) res = 'near ' + state.cities[best].name;
    else {
      const col = hex % w.settings.cols;
      const row = Math.floor(hex / w.settings.cols);
      res = `hex ${col},${row}`;
    }
  }
  if (placeCache.size > 5000) placeCache.clear();
  placeCache.set(hex, res);
  return res;
}

export const TREATY_ORDER: TreatyType[] = ['embassy', 'trade', 'researchSharing', 'mapSharing', 'militaryAccess', 'nonAggression', 'defensePact', 'alliance', 'ceasefire'];

export const DEFCON_TEXT: Record<number, string> = {
  5: 'Peacetime — lowest readiness, lowest upkeep',
  4: 'Increased intelligence watch and strengthened security',
  3: 'Increased readiness — forces ready to mobilise',
  2: 'Next step to war — forces ready to deploy',
  1: 'Maximum readiness — total war footing',
};

/** Nation power ranking (cached per call site by caller). */
export function militaryRanking(game: GameAPI): { id: number; power: number }[] {
  const out: { id: number; power: number }[] = [];
  for (const n of game.state.nations) if (n.alive) out.push({ id: n.id, power: game.militaryPower(n.id) });
  out.sort((a, b) => b.power - a.power);
  return out;
}
