/**
 * createGameUI — the in-game HUD: wires the top bar, command panel, minimap,
 * message bar, unit/hex panels, tooltips, popups and input together.
 */
import { h, setText, setClass } from '../dom';
import { setModalLayer, setToastHost, report } from '../dialogs';
import { installTooltips } from '../tooltip';
import { loadOptions, applyUIScale } from '../options';
import type { GameAPI } from '../../sim/api';
import type { MapRenderer } from '../../render/api';
import type { GameUI } from '../api';
import type { Ctx, TabId, TargetMode } from './context';
import { CommandPanel } from './panel';
import { createTopBar } from './topbar';
import { createMinimap } from './minimap';
import { createNewsBar, createPopups } from './news';
import { createUnitPanel } from './unitpanel';
import { createHexPanel, createMapTip } from './hexinfo';
import { installInput } from './input';
import { openGameMenu, showGameOver } from './gamemenu';
import { overviewTab } from './tabs/overview';
import { cabinetTab } from './tabs/cabinet';
import { militaryTab } from './tabs/military';
import { buildTab } from './tabs/build';
import { researchTab } from './tabs/research';
import { diplomacyTab } from './tabs/diplomacy';
import { tradeTab } from './tabs/trade';
import { financeTab } from './tabs/finance';
import { worldTab } from './tabs/world';

const TARGET_TEXT: Record<string, string> = {
  move: 'MOVE — left-click a destination',
  attack: 'ATTACK — left-click a target hex',
  airStrike: 'AIR STRIKE — left-click a target hex',
  airPatrol: 'AIR PATROL — left-click the patrol area',
  airIntercept: 'INTERCEPT — left-click the area to defend',
  rebase: 'REBASE — left-click an airbase or carrier',
  navalPatrol: 'NAVAL PATROL — left-click the patrol area',
  bombard: 'BOMBARD — left-click a coastal target',
  facility: 'PLACE FACILITY — left-click a highlighted hex',
};

export function createGameUI(root: HTMLElement, game: GameAPI, renderer: MapRenderer): GameUI {
  installTooltips();
  const opts = loadOptions();
  try {
    if (Object.keys(opts.render).length) renderer.applySettings(opts.render);
  } catch {
    /* renderer may not support everything */
  }

  const rootEl = h('div', { class: 'sc-root' });
  const modalLayer = h('div', { class: 'sc-modal-layer' });
  applyUIScale(rootEl, opts.uiScale);
  setModalLayer(modalLayer);
  setToastHost(modalLayer);

  const banner = h('div', { class: 'sc-targeting sc-panel sc-hidden' });
  let panel: CommandPanel;
  let lastTargetKind = '';

  const ctx: Ctx = {
    game,
    renderer,
    root: rootEl,
    get state() {
      return game.state;
    },
    get player() {
      return Math.max(0, game.state.playerNation);
    },
    get me() {
      return game.state.nations[Math.max(0, game.state.playerNation)];
    },
    selection: [],
    inspect: -1,
    infoHex: -1,
    target: null,
    isDirty: false,
    openTab(tab: TabId, arg?: unknown) {
      panel.open(tab, arg);
      layout();
    },
    select(ids: number[], add = false) {
      const next = add ? [...new Set([...ctx.selection, ...ids])] : [...new Set(ids)];
      const own = next.filter((id) => game.state.units.get(id)?.nation === ctx.player);
      ctx.selection = own;
      if (own.length) ctx.inspect = -1;
      try {
        renderer.setSelectedUnits(own);
      } catch {
        /* ignore */
      }
      if (!own.length) renderer.showPath([], false);
      panel?.markDirty();
    },
    setTarget(mode: TargetMode | null) {
      const prev = ctx.target;
      ctx.target = mode;
      if (prev?.kind === 'facility' && mode?.kind !== 'facility') renderer.setHexHighlight([], '#5fd65a');
      if (mode) {
        lastTargetKind = mode.kind;
        banner.textContent = `${TARGET_TEXT[mode.kind] ?? 'Select target'} · right-click or Esc to cancel`;
        banner.classList.remove('sc-hidden');
        renderer.canvas.style.cursor = 'crosshair';
      } else {
        lastTargetKind = '';
        banner.classList.add('sc-hidden');
        renderer.canvas.style.cursor = '';
      }
    },
    focusHex(hex: number, ping?: string) {
      if (hex < 0) return;
      renderer.focusHex(hex);
      if (ping) renderer.pingHex(hex, ping);
    },
    dirty() {
      panel?.markDirty();
    },
    run(res, okText) {
      const ok = report(res, okText);
      panel?.markDirty();
      return ok;
    },
  };

  const newsBar = createNewsBar(ctx);
  const onNewsViewed = () => newsBar.markRead();
  const views = [
    overviewTab(ctx), cabinetTab(ctx), militaryTab(ctx), buildTab(ctx), researchTab(ctx),
    diplomacyTab(ctx), tradeTab(ctx), financeTab(ctx), worldTab(ctx, onNewsViewed),
  ];
  panel = new CommandPanel(ctx, views);

  let lastSpeed = game.state.speed || 3;
  const togglePause = () => {
    if (game.state.speed > 0) {
      lastSpeed = game.state.speed;
      game.setSpeed(0);
    } else game.setSpeed(lastSpeed || 3);
  };
  const setSpeed = (s: number) => {
    game.setSpeed(s);
    if (s > 0) lastSpeed = s;
  };
  const menu = () => openGameMenu(ctx, rootEl);
  const topbar = createTopBar(ctx, () => ctx.openTab('world', { sub: 'news' }), menu);
  const minimap = createMinimap(ctx);
  const unitPanel = createUnitPanel(ctx);
  const hexPanel = createHexPanel(ctx);
  const mapTip = createMapTip(ctx);
  const popups = createPopups(ctx);

  rootEl.append(topbar.el, topbar.ticker, panel.el, minimap.el, newsBar.el, unitPanel.el, hexPanel.el, banner, mapTip.el, modalLayer);
  root.appendChild(rootEl);

  const layout = () => {
    const left = minimap.el.offsetWidth + 12;
    const right = panel.width + 6;
    newsBar.el.style.left = left + 'px';
    newsBar.el.style.right = right + 'px';
    for (const e of [unitPanel.el, hexPanel.el]) {
      e.style.left = left + 'px';
      e.style.right = right + 'px';
      e.style.marginLeft = 'auto';
      e.style.marginRight = 'auto';
      e.style.maxWidth = Math.max(300, rootEl.clientWidth - left - right) + 'px';
    }
    const nb = newsBar.el.offsetHeight || 118;
    unitPanel.el.style.bottom = nb + 12 + 'px';
    hexPanel.el.style.bottom = nb + 12 + 'px';
    banner.style.left = `calc(50% - ${(right - 0) / 2}px)`;
  };
  panel.onLayout = layout;
  const ro = new ResizeObserver(() => layout());
  ro.observe(rootEl);
  ro.observe(newsBar.el);
  ro.observe(minimap.el);
  layout();

  const input = installInput(ctx, {
    togglePause,
    setSpeed,
    openMenu: menu,
    showHex: (hx) => hexPanel.show(hx),
    hideHex: () => hexPanel.hide(),
    hexVisible: () => hexPanel.visible,
    hover: (hx, u, x, y) => mapTip.hover(hx, u, x, y),
    cycleMapMode: (d) => minimap.cycleMode(d),
    collapsePanel: () => {
      if (panel.active) {
        panel.collapse();
        return true;
      }
      return false;
    },
    targetBanner: (text, err) => {
      if (!text) return;
      banner.textContent = text;
      setClass(banner, 'neg', !!err);
    },
  });
  renderer.canvas.addEventListener('mouseleave', () => mapTip.hide());

  const unsub = game.on((e) => {
    try {
      popups.onEvent(e);
      if (e.type === 'unitDestroyed') {
        if (ctx.selection.includes(e.unit)) ctx.select(ctx.selection.filter((x) => x !== e.unit));
        if (ctx.inspect === e.unit) ctx.inspect = -1;
      } else if (e.type === 'unitCreated' || e.type === 'facilityBuilt' || e.type === 'warDeclared' || e.type === 'peace') {
        panel.markDirty();
      }
    } catch (err) {
      console.error('[ui] event handling failed', err);
    }
  });

  const errs = new Set<string>();
  const safe = (name: string, fn: () => void) => {
    try {
      fn();
    } catch (err) {
      if (!errs.has(name)) {
        errs.add(name);
        console.error(`[ui] ${name} update failed`, err);
      }
    }
  };

  let gameOverShown = false;
  let unreadT = 0;
  let destroyed = false;
  void setText;
  void lastTargetKind;

  return {
    update(dt: number) {
      if (destroyed) return;
      safe('topbar', () => topbar.update(dt));
      safe('panel', () => panel.update(dt));
      safe('minimap', () => minimap.update(dt));
      safe('news', () => newsBar.update(dt));
      safe('unitpanel', () => unitPanel.update(dt));
      safe('hexpanel', () => hexPanel.update(dt));
      safe('maptip', () => mapTip.update(dt));
      safe('input', () => input.update(dt));
      safe('popups', () => popups.update(dt));
      unreadT -= dt;
      if (unreadT <= 0) {
        unreadT = 0.5;
        safe('unread', () => topbar.setUnread(newsBar.unread()));
      }
      if (!gameOverShown && game.state.gameOver) {
        gameOverShown = true;
        safe('gameover', () => showGameOver(ctx, modalLayer));
      }
    },
    destroy() {
      destroyed = true;
      input.destroy();
      unsub();
      popups.destroy();
      ro.disconnect();
      try {
        renderer.setSelectedUnits([]);
        renderer.showPath([], false);
        renderer.setHexHighlight([], '#000');
      } catch {
        /* ignore */
      }
      rootEl.remove();
    },
  };
}
