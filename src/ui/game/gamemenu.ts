/**
 * In-game menu (save / options / quit) and the game-over screen.
 */
import { h, fmtMoney, fmtNum, escapeHTML } from '../dom';
import { icon } from '../icons';
import { dialog, confirm, toast, DialogHandle } from '../dialogs';
import { showOptions, applyUIScale } from '../options';
import { flagImg } from '../widgets';
import { formatDate } from '../../sim/types';
import type { Ctx } from './context';

export function openGameMenu(ctx: Ctx, rootEl: HTMLElement): DialogHandle {
  const wasSpeed = ctx.state.speed;
  if (wasSpeed > 0) ctx.game.setSpeed(0);
  const mk = (ico: Parameters<typeof icon>[0], label: string, fn: () => void) => {
    const b = h('div', { class: 'sc-menu-btn' }, h('span', { html: icon(ico) }), h('span', null, label));
    b.addEventListener('click', fn);
    return b;
  };
  let d: DialogHandle;
  const resume = () => {
    d.close();
  };
  const body = h('div', { class: 'sc-col', style: 'gap:6px' },
    h('div', { class: 'sc-center sc-dim', style: 'margin-bottom:4px' }, formatDate(ctx.state.hour)),
    mk('play', 'Resume', resume),
    mk('save', 'Save Game', () => {
      d.close();
      saveGame();
    }),
    mk('gear', 'Options', () => {
      d.close();
      showOptions(ctx.renderer, (o) => applyUIScale(rootEl, o.uiScale));
    }),
    mk('exit', 'Quit to Main Menu', () => {
      confirm('Quit Game', 'Return to the main menu? Unsaved progress will be lost.', 'Quit', () => {
        window.dispatchEvent(new Event('sc:quit'));
      }, true);
    }),
  );
  d = dialog({
    title: 'Game Menu',
    titleIcon: 'menu',
    body,
    buttons: [],
    className: 'sc-gamemenu',
    onClose: () => {
      if (wasSpeed > 0 && ctx.state.speed === 0) ctx.game.setSpeed(wasSpeed);
    },
  });
  return d;
}

let saveListener: ((e: Event) => void) | null = null;

export function saveGame(): void {
  if (!saveListener) {
    saveListener = (e: Event) => {
      const ok = (e as CustomEvent<{ ok: boolean }>).detail?.ok;
      toast(ok ? 'Game saved' : 'Save failed', !ok);
    };
    window.addEventListener('sc:saved', saveListener);
  }
  toast('Saving…');
  window.dispatchEvent(new Event('sc:save'));
}

export function showGameOver(ctx: Ctx, layer: HTMLElement): void {
  const go = ctx.state.gameOver;
  if (!go) return;
  ctx.game.setSpeed(0);
  const won = go.winner === ctx.player;
  const me = ctx.me;
  const winner = ctx.state.nations[go.winner];
  const days = Math.floor(ctx.state.hour / 24);
  const stats = (ctx.state as unknown as { stats?: Record<string, number> }).stats;
  const statRows: [string, string][] = [
    ['Campaign length', `${fmtNum(days)} days`],
    ['Final GDP', fmtMoney(me.gdp)],
    ['Treasury', fmtMoney(me.treasury)],
    ['Approval', me.approval.toFixed(0) + '%'],
  ];
  if (stats) {
    if (stats.citiesCaptured !== undefined) statRows.push(['Cities captured', fmtNum(stats.citiesCaptured)]);
    if (stats.unitsDestroyed !== undefined) statRows.push(['Units destroyed', fmtNum(stats.unitsDestroyed)]);
    if (stats.unitsBuilt !== undefined) statRows.push(['Units built', fmtNum(stats.unitsBuilt)]);
    if (stats.warsDeclared !== undefined) statRows.push(['Wars declared', fmtNum(stats.warsDeclared)]);
  }
  const screen = h('div', { class: 'sc-gameover' },
    h('div', { class: 'big ' + (won ? 'win' : 'lose') }, won ? 'VICTORY' : 'DEFEAT'),
    h('div', { class: 'sc-row', style: 'gap:12px;font-size:16px' }, winner ? flagImg(winner.flag, 30) : null, h('span', { html: escapeHTML(go.reason) })),
    h('div', { class: 'sc-panel', style: 'padding:12px 18px;min-width:340px' },
      h('div', { class: 'sc-row', style: 'gap:10px;margin-bottom:8px' }, flagImg(me.flag, 26), h('b', { style: 'font-size:15px' }, me.name)),
      h('div', { class: 'sc-kv' }, ...statRows.flatMap(([k, v]) => [h('div', { class: 'k' }, k), h('div', { class: 'v' }, v)])),
    ),
    h('div', { class: 'sc-row', style: 'gap:10px' },
      (() => { const b = h('button', { class: 'sc-btn big' }, 'Continue watching'); b.addEventListener('click', () => screen.remove()); return b; })(),
      (() => { const b = h('button', { class: 'sc-btn primary big' }, 'Main Menu'); b.addEventListener('click', () => window.dispatchEvent(new Event('sc:quit'))); return b; })(),
    ),
  );
  layer.appendChild(screen);
}
