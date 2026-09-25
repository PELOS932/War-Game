/**
 * SHARED CONTRACT — UI entry points (implemented by the UI agent in src/ui/**,
 * exported from src/ui/index.ts). main.ts wires them together:
 *
 *   const menu = showMainMenu(root, { onNewGame });
 *   const loading = showLoadingScreen(root);           // world build progress
 *   const nation = await showNationSelect(root, world, renderer);
 *   const ui = createGameUI(root, game, renderer);     // in-game HUD
 *   // every frame: ui.update(dt)
 */
import type { GameAPI } from '../sim/api';
import type { MapRenderer } from '../render/api';
import type { WorldData } from '../worldgen/types';

export interface GameUI {
  update(dtSeconds: number): void;
  destroy(): void;
}

export interface LoadingScreen {
  setProgress(stage: string, fraction: number): void;
  close(): void;
}

export interface MainMenuCallbacks {
  onNewGame(): void;
  onLoadGame?(): void;
}

export type CreateGameUI = (root: HTMLElement, game: GameAPI, renderer: MapRenderer) => GameUI;
export type ShowMainMenu = (root: HTMLElement, cb: MainMenuCallbacks) => { close(): void };
export type ShowLoadingScreen = (root: HTMLElement) => LoadingScreen;
/** Lets the player pick a nation on the 3D map; resolves with the nation id. */
export type ShowNationSelect = (root: HTMLElement, world: WorldData, renderer: MapRenderer) => Promise<number>;
