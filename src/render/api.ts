/**
 * SHARED CONTRACT — the 3D map renderer (implemented by the renderer agent in
 * src/render/**, exported from src/render/index.ts as `createRenderer`).
 *
 *   export function createRenderer(container: HTMLElement): MapRenderer
 *
 * The renderer owns the <canvas>, the camera and all pointer handling on the
 * map. The UI subscribes to click/hover/box-select callbacks and calls back
 * into the renderer for highlights, paths and camera moves.
 */
import type { WorldData } from '../worldgen/types';
import type { GameAPI } from '../sim/api';

export enum MapMode {
  Terrain = 0, // no political tint, borders only
  Political = 1, // nation colours
  Diplomatic = 2, // relations to the player (green allies .. red enemies)
  Alliances = 3, // bloc colours
  Supply = 4, // player supply network
  Population = 5, // population density heat map
  Resources = 6, // mineral deposits
  Terrain2 = 7, // gameplay terrain type colouring
}

export interface MapClick {
  button: 0 | 2; // left / right
  hex: number; // -1 if off-map
  unitId: number; // -1 if no unit under cursor
  worldX: number;
  worldZ: number;
  clientX: number;
  clientY: number;
  shift: boolean;
  ctrl: boolean;
  double: boolean;
}

export interface RenderSettings {
  dayNight: boolean;
  clouds: boolean;
  shadows: boolean;
  hexGrid: boolean;
  labels: boolean;
  units: boolean;
  quality: 'low' | 'medium' | 'high';
}

export interface MapRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly settings: RenderSettings;

  /** Build terrain/water/vegetation/cities etc. Reports progress 0..1. */
  loadWorld(world: WorldData, progress?: (stage: string, fraction: number) => void): Promise<void>;
  /** Start showing live game state: units, facilities, ownership, effects, day/night. */
  attachGame(game: GameAPI): void;
  /** Called every animation frame by main.ts. */
  render(dtSeconds: number): void;
  applySettings(s: Partial<RenderSettings>): void;

  // ----- map presentation ------------------------------------------------------------
  setMapMode(mode: MapMode): void;
  readonly mapMode: MapMode;
  /** Highlight hexes (e.g. selected nation, valid build sites). Empty array clears. */
  setHexHighlight(hexes: number[], color: string): void;
  /** Draw a planned movement path. Empty array clears. */
  showPath(hexes: number[], hostile: boolean): void;
  setSelectedUnits(ids: number[]): void;
  /** Temporarily show a marker (e.g. attack target, news location). */
  pingHex(hex: number, color: string): void;

  // ----- camera -------------------------------------------------------------------------
  focusOn(x: number, z: number, distance?: number): void;
  focusHex(hex: number, distance?: number): void;
  getCameraTarget(): { x: number; z: number; distance: number };
  /** For the minimap: world-space quad of the current view footprint. */
  getViewFootprint(): { x: number; z: number }[];

  // ----- picking & input ------------------------------------------------------------------
  pickHex(clientX: number, clientY: number): number;
  pickUnit(clientX: number, clientY: number): number;
  unitsInScreenRect(x0: number, y0: number, x1: number, y1: number, nation: number): number[];
  worldToScreen(x: number, y: number, z: number): { x: number; y: number; visible: boolean };
  onClick(cb: (e: MapClick) => void): void;
  onHover(cb: (hex: number, unitId: number, clientX: number, clientY: number) => void): void;
  onBoxSelect(cb: (x0: number, y0: number, x1: number, y1: number, shift: boolean) => void): void;
}
