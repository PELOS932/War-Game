/**
 * Main menu and loading screen.
 */
import { h } from './dom';
import { icon } from './icons';
import { createBackdrop } from './backdrop';
import { dialog } from './dialogs';
import { showOptions } from './options';
import { installTooltips } from './tooltip';
import type { MainMenuCallbacks, LoadingScreen } from './api';

const VERSION = 'v0.1.0';

const HEADLINES = [
  'JAN 01 2030 — Global tensions rise as resource prices climb to record highs',
  'Arctic shipping lanes open year-round for the first time in recorded history',
  'Energy ministers meet in emergency session over electricity shortfalls',
  'Defense budgets swell across three continents amid border disputes',
  'Water rights dispute escalates between upstream and downstream nations',
  'Markets jittery as world oil reserves report falls short of forecasts',
  'UN Security Council deadlocked on peacekeeping mandate renewal',
  'Record migration flows strain neighbouring economies',
];

function titleLogo(): HTMLElement {
  return h('div', { class: 'sc-title-logo' },
    h('div', { class: 'l1' }, 'SOVEREIGN COMMAND'),
    h('div', { class: 'l2' }, '2030'),
    h('div', { class: 'l3' }, 'Real-time Global Strategy'),
  );
}

export function showMainMenu(root: HTMLElement, cb: MainMenuCallbacks): { close(): void } {
  installTooltips();
  const bd = createBackdrop();
  const mk = (ico: Parameters<typeof icon>[0], label: string, key: string, action: (() => void) | null) => {
    const b = h('div', { class: 'sc-menu-btn' + (action ? '' : ' disabled') }, h('span', { html: icon(ico) }), h('span', null, label), h('span', { class: 'sc-kbd' }, key));
    if (action) b.addEventListener('click', action);
    return b;
  };
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('keydown', onKey);
    bd.destroy();
    screen.remove();
  };
  const newGame = () => {
    cb.onNewGame();
  };
  const loadGame = cb.onLoadGame ? () => cb.onLoadGame?.() : null;
  const credits = () =>
    dialog({
      title: 'Credits',
      titleIcon: 'star',
      body: h('div', { style: 'min-width:380px;line-height:1.6' },
        h('div', { class: 'sc-amber sc-bold', style: 'font-size:15px' }, 'SOVEREIGN COMMAND 2030'),
        h('div', { class: 'sc-dim' }, 'A real-time grand strategy game of the real Earth.'),
        h('div', { class: 'sc-sep' }),
        h('div', null, 'Design, simulation, AI, world building, rendering and interface created with Claude.'),
        h('div', null, 'Map data: Natural Earth via world-atlas (public domain).'),
        h('div', null, '3D engine: three.js.'),
        h('div', { class: 'sc-sep' }),
        h('div', { class: 'sc-dim' }, 'Inspired by the classic Supreme Ruler series of grand strategy games.'),
      ),
    });
  const box = h('div', { class: 'sc-menu-box sc-panel' },
    mk('play', 'New Game', 'N', newGame),
    mk('save', 'Load Game', 'L', loadGame),
    mk('gear', 'Options', 'O', () => showOptions(null)),
    mk('star', 'Credits', 'C', credits),
  );
  const ticker = h('div', { class: 'sc-menu-ticker' }, h('div', null, HEADLINES.join('   ◆   ')));
  const screen = h('div', { class: 'sc-screen sc-mainmenu' },
    bd.el,
    h('div', { class: 'sc-menu-center' }, titleLogo(), box),
    ticker,
    h('div', { class: 'sc-menu-foot' }, h('span', null, VERSION), h('span', null, h('span', { class: 'sc-blink' }, '●'), ' GLOBAL STRATEGIC NETWORK ONLINE'), h('span', null, '© 2030 Sovereign Command')),
  );
  const onKey = (e: KeyboardEvent) => {
    if (document.querySelector('.sc-dialog')) return;
    const k = e.key.toLowerCase();
    if (k === 'n' || k === 'enter') newGame();
    else if (k === 'l' && loadGame) loadGame();
    else if (k === 'o') showOptions(null);
    else if (k === 'c') credits();
  };
  window.addEventListener('keydown', onKey);
  root.appendChild(screen);
  return { close };
}

// ---------------------------------------------------------------------------
// Loading screen
// ---------------------------------------------------------------------------
const TIPS = [
  'Press SPACE to pause and 1–5 to change game speed. You can issue orders while paused.',
  'Right-click on the map to move selected units. Right-click an enemy to attack.',
  'Drag with the left mouse button to box-select several units at once.',
  'Ctrl + number assigns the selected units to a group; Shift + number recalls it.',
  'Hand departments to your cabinet ministers in the Cabinet panel to let AI manage them.',
  'Keep an eye on the resource bar: shortages of Electric Power cripple industry.',
  'Units out of supply lose efficiency quickly. Build Supply Depots near the front.',
  'Relations improve over time with embassies and trade agreements.',
  'Declaring war on a nation with allies may drag its whole bloc into the conflict.',
  'Air units operate within their combat radius of an airbase or carrier.',
  'Raising taxes fills the treasury but hurts approval and growth.',
  'Research labs and a healthy research budget speed up technology.',
  'Press F1–F9 to open the command panels. M cycles map modes.',
  'Entrenched units in hills, forests and cities are much harder to dislodge.',
  'Sell surplus resources on the world market — prices change with global supply and demand.',
];

export function showLoadingScreen(root: HTMLElement): LoadingScreen {
  installTooltips();
  const bd = createBackdrop();
  const stage = h('span', null, 'Initializing');
  const pct = h('span', null, '0%');
  const fill = h('i', { style: 'width:0%' });
  const tipText = h('span', null, TIPS[Math.floor(Math.random() * TIPS.length)]);
  const box = h('div', { class: 'sc-loading-box sc-panel' },
    h('div', { class: 'sc-loading-stage' }, stage, pct),
    h('div', { class: 'sc-progress' }, fill, h('b')),
    h('div', { class: 'sc-loading-tip' }, h('span', { html: icon('info') }), tipText),
  );
  const screen = h('div', { class: 'sc-screen sc-loading' },
    bd.el,
    h('div', { class: 'sc-menu-center', style: 'top:18%' }, titleLogo()),
    box,
  );
  root.appendChild(screen);
  let tipIdx = TIPS.indexOf(tipText.textContent ?? '');
  const tipTimer = window.setInterval(() => {
    tipIdx = (tipIdx + 1) % TIPS.length;
    tipText.style.opacity = '0';
    setTimeout(() => {
      tipText.textContent = TIPS[tipIdx];
      tipText.style.opacity = '1';
    }, 400);
  }, 5000);
  let closed = false;
  return {
    setProgress(s: string, f: number) {
      stage.textContent = s;
      const p = Math.max(0, Math.min(1, f));
      pct.textContent = Math.round(p * 100) + '%';
      fill.style.width = (p * 100).toFixed(1) + '%';
    },
    close() {
      if (closed) return;
      closed = true;
      clearInterval(tipTimer);
      screen.style.transition = 'opacity .45s';
      screen.style.opacity = '0';
      screen.style.pointerEvents = 'none';
      setTimeout(() => {
        bd.destroy();
        screen.remove();
      }, 460);
    },
  };
}
