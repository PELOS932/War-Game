/**
 * DEV ONLY — entry for dev/ui.html. Exercises every UI screen against the mock
 * game/renderer (or the real ones with ?real=1 when they exist).
 *
 *   /dev/ui.html?screen=menu|loading|select|game&nation=USA&tab=overview&real=1
 */
import { createGameUI, showLoadingScreen, showMainMenu, showNationSelect } from '../index';
import { buildMockWorld, createMockGame, createMockRenderer } from './mock';
import type { GameAPI } from '../../sim/api';
import type { MapRenderer } from '../../render/api';
import type { WorldData } from '../../worldgen/types';
import type { GameUI } from '../api';

const params = new URLSearchParams(location.search);
const screen = params.get('screen') ?? 'menu';
const real = params.get('real') === '1';
const mapEl = document.getElementById('map') as HTMLElement;
const uiEl = document.getElementById('ui') as HTMLElement;

type Mod = Record<string, unknown>;
const renderMods = import.meta.glob('../../render/index.ts') as Record<string, () => Promise<Mod>>;
const simMods = import.meta.glob('../../sim/game.ts') as Record<string, () => Promise<Mod>>;
const worldMods = import.meta.glob('../../app/worldLoader.ts') as Record<string, () => Promise<Mod>>;

async function getWorld(progress: (s: string, f: number) => void): Promise<WorldData> {
  if (real) {
    const wl = Object.values(worldMods)[0];
    if (wl) {
      const m = await wl();
      return (m.loadWorld as (p: typeof progress) => Promise<WorldData>)(progress);
    }
  }
  return buildMockWorld(progress);
}

async function getRenderer(): Promise<MapRenderer> {
  if (real) {
    const r = Object.values(renderMods)[0];
    if (r) {
      const m = await r();
      return (m.createRenderer as (c: HTMLElement) => MapRenderer)(mapEl);
    }
  }
  return createMockRenderer(mapEl);
}

async function getGame(world: WorldData, nation: number): Promise<GameAPI> {
  if (real) {
    const s = Object.values(simMods)[0];
    if (s) {
      const m = await s();
      return (m.createGame as (w: WorldData, n: number) => GameAPI)(world, nation);
    }
  }
  return createMockGame(world, nation);
}

interface DevHandle {
  game?: GameAPI;
  renderer?: MapRenderer;
  ui?: GameUI;
  world?: WorldData;
}
const dev: DevHandle = {};
(window as unknown as { __dev: DevHandle }).__dev = dev;

let loopStarted = false;
function loop(): void {
  if (loopStarted) return;
  loopStarted = true;
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    try {
      dev.game?.advance(dt);
    } catch (e) {
      console.error(e);
    }
    dev.renderer?.render(dt);
    dev.ui?.update(dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

async function start(skipSelect: boolean): Promise<void> {
  const loading = showLoadingScreen(uiEl);
  const world = await getWorld((s, f) => loading.setProgress(s, f * 0.6));
  const renderer = await getRenderer();
  await renderer.loadWorld(world, (s, f) => loading.setProgress(s, 0.6 + f * 0.4));
  dev.world = world;
  dev.renderer = renderer;
  loop();
  loading.close();
  let nation: number;
  if (skipSelect) {
    const code = params.get('nation') ?? 'USA';
    nation = Math.max(0, world.nations.findIndex((n) => n.code === code));
  } else {
    nation = await showNationSelect(uiEl, world, renderer);
  }
  const game = await getGame(world, nation);
  dev.game = game;
  renderer.attachGame(game);
  dev.ui = createGameUI(uiEl, game, renderer);
  const cap = game.state.cities[game.state.nations[nation].capitalCity];
  if (cap) renderer.focusOn(cap.x, cap.z, Number(params.get('dist') ?? 60));
  if (params.get('speed')) game.setSpeed(Number(params.get('speed')));
}

if (screen === 'menu') {
  const menu = showMainMenu(uiEl, {
    onNewGame: () => {
      menu.close();
      void start(false);
    },
    onLoadGame: params.get('save') === '1' ? () => undefined : undefined,
  });
} else if (screen === 'loading') {
  const l = showLoadingScreen(uiEl);
  let f = 0;
  setInterval(() => {
    f = (f + 0.013) % 1;
    l.setProgress(f < 0.5 ? 'Rasterising country borders' : 'Building terrain mesh', f);
  }, 50);
} else if (screen === 'select') {
  void start(false);
} else {
  void start(true);
}
