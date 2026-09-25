/**
 * Map interaction: selection (click, shift, box, double-click), right-click
 * default orders, targeting modes, facility placement, path preview, groups
 * and keyboard shortcuts.
 */
import { typingInField } from '../dom';
import { closeTopDialog, closeDropdown, confirm, openDialogs } from '../dialogs';
import { hideTip } from '../tooltip';
import { FacilityType, UnitClass, type Unit } from '../../sim/types';
import type { MapClick } from '../../render/api';
import { designOf, type Ctx, type TabId } from './context';

export interface InputHooks {
  togglePause(): void;
  setSpeed(s: number): void;
  openMenu(): void;
  showHex(hex: number): void;
  hideHex(): void;
  hexVisible(): boolean;
  hover(hex: number, unit: number, x: number, y: number): void;
  cycleMapMode(dir: number): void;
  collapsePanel(): boolean;
  targetBanner(text: string | null, error?: boolean): void;
}

const TAB_KEYS: TabId[] = ['overview', 'cabinet', 'military', 'build', 'research', 'diplomacy', 'trade', 'finance', 'world'];

export function installInput(ctx: Ctx, hooks: InputHooks): { destroy(): void; update(dt: number): void; active: boolean } {
  const { game, renderer } = ctx;
  const state = { active: true };
  const groups = new Map<number, number[]>();
  let lastGroupRecall = { g: -1, t: 0 };
  let hoverHex = -1;
  let pathFor = '';
  let pathTimer = 0;
  let pendingPath = false;

  const own = (id: number): Unit | undefined => {
    const u = ctx.state.units.get(id);
    return u && u.nation === ctx.player ? u : undefined;
  };
  const byClass = (ids: number[]) => {
    const land: number[] = [], air: number[] = [], naval: number[] = [];
    for (const id of ids) {
      const u = own(id);
      if (!u) continue;
      const c = designOf(ctx.state, u)?.cls ?? UnitClass.Land;
      (c === UnitClass.Air ? air : c === UnitClass.Naval ? naval : land).push(id);
    }
    return { land, air, naval };
  };
  const hostileAt = (hex: number): boolean => {
    if (hex < 0) return false;
    const me = ctx.player;
    for (const u of game.unitsAt(hex)) if (u.nation !== me && game.atWar(me, u.nation) && game.isVisible(me, hex)) return true;
    const o = ctx.state.hexOwner[hex] - 1;
    return o >= 0 && o !== me && game.atWar(me, o);
  };
  const hasAirbase = (hex: number): boolean => {
    for (const id of ctx.state.hexFacilities.get(hex) ?? []) {
      const f = ctx.state.facilities.get(id);
      if (f && (f.type === FacilityType.Airbase) && f.constructionDaysLeft <= 0) return true;
    }
    for (const u of game.unitsAt(hex)) if (u.nation === ctx.player && designOf(ctx.state, u)?.category === 21) return true; // carrier
    return false;
  };

  const defaultOrder = (hex: number) => {
    const sel = ctx.selection;
    if (!sel.length || hex < 0) return;
    const { land, air, naval } = byClass(sel);
    const hostile = hostileAt(hex);
    let ok = false;
    if (land.length) ok = ctx.run(hostile ? game.attack(land, hex) : game.moveUnits(land, hex)) || ok;
    if (naval.length) ok = ctx.run(hostile ? game.attack(naval, hex) : game.moveUnits(naval, hex)) || ok;
    if (air.length) {
      if (hostile) ok = ctx.run(game.airMission(air, 'airStrike', hex)) || ok;
      else if (ctx.state.hexOwner[hex] === ctx.player + 1 && hasAirbase(hex)) ok = ctx.run(game.rebase(air, hex)) || ok;
      else ok = ctx.run(game.airMission(air, 'airPatrol', hex)) || ok;
    }
    if (ok) renderer.pingHex(hex, hostile ? '#ff4030' : '#60ff60');
    renderer.showPath([], false);
    pathFor = '';
  };

  const executeTarget = (e: MapClick) => {
    const t = ctx.target;
    if (!t) return;
    const hex = e.hex;
    if (hex < 0) return;
    if (t.kind === 'facility') {
      const def = ctx.state.facilityDefs[t.type];
      if (ctx.run(game.buildFacility(ctx.player, t.type, hex), `Construction of ${def?.name ?? 'facility'} started`)) {
        renderer.pingHex(hex, '#ffc040');
        if (!e.shift) ctx.setTarget(null);
        else refreshBuildSites();
      }
      return;
    }
    const { land, air, naval } = byClass(ctx.selection);
    let ok = false;
    switch (t.kind) {
      case 'move':
        if (land.length) ok = ctx.run(game.moveUnits(land, hex), 'Moving') || ok;
        if (naval.length) ok = ctx.run(game.moveUnits(naval, hex), 'Moving') || ok;
        break;
      case 'attack':
        if (land.length || naval.length) ok = ctx.run(game.attack([...land, ...naval], hex), 'Attack ordered');
        break;
      case 'airStrike':
      case 'airPatrol':
      case 'airIntercept':
        ok = ctx.run(game.airMission(air, t.kind, hex), t.kind === 'airStrike' ? 'Air strike ordered' : t.kind === 'airPatrol' ? 'Patrol ordered' : 'Interception ordered');
        break;
      case 'rebase':
        ok = ctx.run(game.rebase(air, hex), 'Rebasing');
        break;
      case 'navalPatrol':
        ok = ctx.run(game.moveUnits(naval, hex), 'Patrolling');
        if (ok) game.setStance(naval, 'aggressive');
        break;
      case 'bombard':
        ok = ctx.run(game.attack(naval, hex), 'Bombardment ordered');
        break;
    }
    if (ok) renderer.pingHex(hex, t.kind === 'move' || t.kind === 'rebase' || t.kind === 'airPatrol' ? '#60ff60' : '#ff4030');
    if (!e.shift) ctx.setTarget(null);
  };

  let buildSites: number[] = [];
  let sitesFor = -1;
  const refreshBuildSites = () => {
    const t = ctx.target;
    if (!t || t.kind !== 'facility') return;
    const st = ctx.state;
    const me = ctx.player + 1;
    const out: number[] = [];
    const own = st.hexOwner;
    let checked = 0;
    for (let i = 0; i < own.length && checked < 60000; i++) {
      if (own[i] !== me && !(t.type === FacilityType.OffshorePlatform && own[i] === 0 && st.world.hexDeposit[i])) continue;
      checked++;
      if (game.canBuildFacility(ctx.player, t.type, i).ok) out.push(i);
    }
    buildSites = out;
    renderer.setHexHighlight(out, '#5fd65a');
  };

  // --------------------------------------------------------------- callbacks
  renderer.onClick((e) => {
    if (!state.active) return;
    hideTip();
    closeDropdown();
    if (ctx.target) {
      if (e.button === 2) ctx.setTarget(null);
      else executeTarget(e);
      return;
    }
    if (e.button === 2) {
      if (ctx.selection.length) defaultOrder(e.hex);
      return;
    }
    // left click
    const u = e.unitId >= 0 ? ctx.state.units.get(e.unitId) : undefined;
    if (u) {
      if (u.nation === ctx.player) {
        ctx.inspect = -1;
        if (e.double) {
          const r = renderer.canvas.getBoundingClientRect();
          const ids = renderer.unitsInScreenRect(r.left, r.top, r.right, r.bottom, ctx.player).filter((id) => ctx.state.units.get(id)?.design === u.design);
          ctx.select(ids.length ? ids : [u.id]);
        } else if (e.shift || e.ctrl) {
          if (ctx.selection.includes(u.id)) ctx.select(ctx.selection.filter((x) => x !== u.id));
          else ctx.select([u.id], true);
        } else ctx.select([u.id]);
        hooks.hideHex();
      } else {
        ctx.select([]);
        ctx.inspect = u.id;
        hooks.hideHex();
      }
      return;
    }
    if (!e.shift) ctx.select([]);
    ctx.inspect = -1;
    if (e.hex >= 0) {
      if (hooks.hexVisible() && ctx.infoHex === e.hex) hooks.hideHex();
      else hooks.showHex(e.hex);
    } else hooks.hideHex();
  });

  renderer.onHover((hex, unit, x, y) => {
    if (!state.active) return;
    hooks.hover(hex, unit, x, y);
    if (hex !== hoverHex) {
      hoverHex = hex;
      pendingPath = true;
    }
  });

  renderer.onBoxSelect((x0, y0, x1, y1, shift) => {
    if (!state.active || ctx.target) return;
    const ids = renderer.unitsInScreenRect(x0, y0, x1, y1, ctx.player);
    ctx.inspect = -1;
    if (shift) ctx.select(ids, true);
    else ctx.select(ids);
    if (ids.length) hooks.hideHex();
  });

  const updatePath = () => {
    const t = ctx.target;
    if (t?.kind === 'facility') {
      if (hoverHex >= 0) {
        const r = game.canBuildFacility(ctx.player, t.type, hoverHex);
        const def = ctx.state.facilityDefs[t.type];
        hooks.targetBanner(r.ok ? `Place ${def?.name}: click to build (Shift = build several) · Right-click / Esc to cancel` : `Cannot build here: ${r.reason ?? 'invalid site'}`, !r.ok);
      }
      return;
    }
    const { land, naval } = byClass(ctx.selection);
    const movers = [...land, ...naval];
    const wantsPath = movers.length > 0 && hoverHex >= 0 && (!t || t.kind === 'move' || t.kind === 'attack' || t.kind === 'navalPatrol' || t.kind === 'bombard');
    const key = wantsPath ? movers.join(',') + '>' + hoverHex : '';
    if (key === pathFor) return;
    pathFor = key;
    if (!wantsPath) {
      renderer.showPath([], false);
      return;
    }
    let p: number[] | null = null;
    try {
      p = game.findPath(movers, hoverHex);
    } catch {
      p = null;
    }
    renderer.showPath(p ?? [], hostileAt(hoverHex) || t?.kind === 'attack' || t?.kind === 'bombard');
  };

  // --------------------------------------------------------------- keyboard
  const onKey = (e: KeyboardEvent) => {
    if (!state.active) return;
    if (typingInField()) {
      if (e.key === 'Escape') (document.activeElement as HTMLElement | null)?.blur();
      return;
    }
    const code = e.code;
    const digit = /^Digit([0-9])$/.exec(code)?.[1] ?? /^Numpad([0-9])$/.exec(code)?.[1];
    if (e.key === 'Escape') {
      closeDropdown();
      if (closeTopDialog()) return;
      if (ctx.target) { ctx.setTarget(null); return; }
      if (ctx.selection.length || ctx.inspect >= 0) { ctx.select([]); ctx.inspect = -1; return; }
      if (hooks.hexVisible()) { hooks.hideHex(); return; }
      if (hooks.collapsePanel()) return;
      hooks.openMenu();
      return;
    }
    if (openDialogs() > 0) return;
    if (/^F[1-9]$/.test(e.key)) {
      e.preventDefault();
      ctx.openTab(TAB_KEYS[Number(e.key.slice(1)) - 1]);
      return;
    }
    if (code === 'Space') {
      e.preventDefault();
      hooks.togglePause();
      return;
    }
    if (digit !== undefined) {
      const d = Number(digit);
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (d > 0) {
          groups.set(d, [...ctx.selection]);
          ctx.run({ ok: true }, ctx.selection.length ? `Group ${d} assigned (${ctx.selection.length} units)` : `Group ${d} cleared`);
        }
        return;
      }
      if (e.shiftKey || e.altKey) {
        e.preventDefault();
        const ids = (groups.get(d) ?? []).filter((id) => own(id));
        if (ids.length) {
          ctx.select(ids);
          const now = performance.now();
          if (lastGroupRecall.g === d && now - lastGroupRecall.t < 400) {
            const u = ctx.state.units.get(ids[0]);
            if (u) renderer.focusOn(u.x, u.z);
          }
          lastGroupRecall = { g: d, t: now };
        }
        return;
      }
      if (d >= 1 && d <= 5 && !code.startsWith('Numpad')) {
        hooks.setSpeed(d);
        return;
      }
      if (d === 0 && !code.startsWith('Numpad')) {
        hooks.togglePause();
        return;
      }
    }
    if (code === 'NumpadAdd' || e.key === ']') {
      hooks.setSpeed(Math.min(5, ctx.state.speed + 1));
      return;
    }
    if (code === 'NumpadSubtract' || e.key === '[') {
      hooks.setSpeed(Math.max(0, ctx.state.speed - 1));
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const sel = ctx.selection;
    switch (k) {
      case 'm':
        hooks.cycleMapMode(e.shiftKey ? -1 : 1);
        break;
      case 'home': {
        const c = ctx.state.cities[ctx.me.capitalCity];
        if (c) renderer.focusOn(c.x, c.z, 60);
        break;
      }
      case 'delete':
        if (sel.length) {
          const n = sel.length;
          confirm('Disband Units', `Permanently disband ${n} unit${n > 1 ? 's' : ''}?`, 'Disband', () => {
            ctx.run(game.disband(sel), `${n} unit${n > 1 ? 's' : ''} disbanded`);
            ctx.select([]);
          }, true);
        }
        break;
      case 'h':
        if (sel.length) ctx.run(game.holdPosition(sel), 'Holding position');
        break;
      case 'v':
        if (sel.length) ctx.setTarget({ kind: 'move' });
        break;
      case 't':
        if (sel.length) ctx.setTarget({ kind: 'attack' });
        break;
      case 'b':
        if (byClass(sel).air.length) ctx.setTarget({ kind: 'airStrike' });
        break;
      case 'p':
        if (byClass(sel).air.length) ctx.setTarget({ kind: 'airPatrol' });
        break;
      case 'i':
        if (byClass(sel).air.length) ctx.setTarget({ kind: 'airIntercept' });
        break;
      case 'r':
        if (sel.length) ctx.run(game.reinforce(sel), 'Reinforcements requested');
        break;
      case 'c': {
        const u = ctx.state.units.get(sel[0] ?? ctx.inspect);
        if (u) renderer.focusOn(u.x, u.z);
        break;
      }
      case 'n':
        ctx.openTab('world', { sub: 'news' });
        break;
    }
  };
  window.addEventListener('keydown', onKey);

  return {
    get active() {
      return state.active;
    },
    update(dt: number) {
      pathTimer -= dt;
      if (pendingPath && pathTimer <= 0) {
        pendingPath = false;
        pathTimer = 0.08;
        updatePath();
      }
      const tg = ctx.target;
      if (tg?.kind === 'facility') {
        if (sitesFor !== tg.type) {
          sitesFor = tg.type;
          refreshBuildSites();
        }
      } else if (sitesFor !== -1) {
        sitesFor = -1;
        buildSites = [];
      }
      if (!ctx.selection.length && pathFor) {
        pathFor = '';
        renderer.showPath([], false);
      }
    },
    destroy() {
      state.active = false;
      window.removeEventListener('keydown', onKey);
    },
  };
}
