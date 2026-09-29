import { createRenderer } from '../render/index';
import type { MapRenderer } from '../render/api';
import { createGame } from '../sim/game';
import { serializeGame, loadGame } from '../sim/save';
import type { GameAPI } from '../sim/api';
import { createGameUI, showLoadingScreen, showMainMenu, showNationSelect, showLeaderCreator, showIdeologySelect } from '../ui/index';
import { applyIdeology, applyLeaderProfile } from '../sim/ideology';
import type { LeaderProfile } from '../sim/leaderProfile';
import type { GameUI } from '../ui/api';
import type { WorldData } from '../worldgen/types';
import { loadWorld } from './worldLoader';
import { hasSaveFlag, readSave, writeSave } from './saves';

const SAVE_KEY = 'sovereign-command-2030:save';

interface Session {
  world: WorldData;
  renderer: MapRenderer;
  game: GameAPI | null;
  ui: GameUI | null;
}

let session: Session | null = null;
let loopStarted = false;

function el(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`Missing #${id}`);
  return e;
}

/** Entry point: show the main menu. */
export async function boot(): Promise<void> {
  showMenu();
  installDebugHooks();
}

function showMenu(): void {
  const root = el('ui');
  const menu = showMainMenu(root, {
    onNewGame: () => {
      menu.close();
      void startSession(null);
    },
    onLoadGame: hasSave()
      ? () => {
        menu.close();
        void readSave(SAVE_KEY).then((json) => startSession(json));
      }
      : undefined,
  });
}

function hasSave(): boolean {
  try {
    return hasSaveFlag();
  } catch {
    return false;
  }
}

/** Builds (or reuses) the world + renderer, then starts a new or loaded game. */
async function startSession(saveJson: string | null): Promise<void> {
  const root = el('ui');
  let leader: LeaderProfile | null = null;
  if (!saveJson) {
    // New game: design the head of state first (Back returns to the main menu).
    leader = await showLeaderCreator(root);
    if (!leader) {
      showMenu();
      return;
    }
  }
  if (!session) {
    const loading = showLoadingScreen(root);
    const world = await loadWorld((stage, f) => loading.setProgress(stage, f * 0.6));
    const renderer = createRenderer(el('map'));
    await renderer.loadWorld(world, (stage, f) => loading.setProgress(stage, 0.6 + f * 0.4));
    loading.close();
    session = { world, renderer, game: null, ui: null };
    startLoop();
  }
  const s = session;
  let game: GameAPI;
  if (saveJson) {
    game = loadGame(s.world, saveJson);
  } else {
    // Nation → ideology (Back on the ideology screen returns to nation select).
    for (;;) {
      const nation = await showNationSelect(root, s.world, s.renderer);
      const g = createGame(s.world, nation);
      const ideology = await showIdeologySelect(root, g, nation, leader);
      if (!ideology) continue;
      if (leader) applyLeaderProfile(g, nation, leader);
      applyIdeology(g, nation, ideology, { title: leader?.title || undefined, gender: leader?.gender });
      game = g;
      break;
    }
  }
  s.game = game;
  s.renderer.attachGame(game);
  s.ui = createGameUI(root, game, s.renderer);
  const player = game.state.nations[game.state.playerNation];
  if (player) {
    const capital = game.state.cities[player.capitalCity];
    if (capital) s.renderer.focusOn(capital.x, capital.z, 28);
  }
}

function startLoop(): void {
  if (loopStarted) return;
  loopStarted = true;
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (session) {
      try {
        session.game?.advance(dt);
      } catch (err) {
        console.error('Simulation error', err);
      }
      session.renderer.render(dt);
      session.ui?.update(dt);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Save the running game to IndexedDB. Resolves false if nothing was saved. */
export async function saveCurrentGame(): Promise<boolean> {
  if (!session?.game) return false;
  try {
    return await writeSave(SAVE_KEY, serializeGame(session.game));
  } catch (err) {
    console.error('Save failed', err);
    return false;
  }
}

function installDebugHooks(): void {
  const w = window as unknown as Record<string, unknown>;
  w.__sc = {
    get session() {
      return session;
    },
    save: saveCurrentGame,
  };
  // UI menus dispatch these so they don't need to import the app module.
  window.addEventListener('sc:save', () => {
    void saveCurrentGame().then((ok) => window.dispatchEvent(new CustomEvent('sc:saved', { detail: { ok } })));
  });
  window.addEventListener('sc:quit', () => {
    location.reload();
  });
}
