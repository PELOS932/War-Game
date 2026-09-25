/**
 * Unit info panel (bottom-centre): single-unit details with status bars and
 * stats, multi-selection summary, and the order buttons for the selection.
 */
import { h, setText, setClass, clear, escapeHTML, setTip, fmtNum } from '../dom';
import { icon, natoSymbol, IconName } from '../icons';
import { flagImg, bar, Bar } from '../widgets';
import { confirm } from '../dialogs';
import { CATEGORY_NAMES, UnitClass, type Stance, type Unit } from '../../sim/types';
import { affiliation, designOf, hexPlace, orderText, type Ctx, type TargetMode } from './context';

export interface UnitPanel {
  el: HTMLElement;
  update(dt: number): void;
}

const STANCES: { s: Stance; icon: IconName; name: string; tip: string }[] = [
  { s: 'aggressive', icon: 'aggressive', name: 'Aggressive', tip: 'Pursue and engage any enemy in range.' },
  { s: 'defensive', icon: 'defensive', name: 'Defensive', tip: 'Engage enemies that come close; return to position.' },
  { s: 'hold', icon: 'holdGround', name: 'Hold fire / ground', tip: 'Hold ground and return fire only.' },
  { s: 'passive', icon: 'passive', name: 'Passive', tip: 'Avoid combat whenever possible.' },
];

export function createUnitPanel(ctx: Ctx): UnitPanel {
  const { game } = ctx;
  const titleTxt = h('span', { class: 'sc-grow sc-nowrap' });
  const flagSlot = h('span');
  const closeBtn = h('button', { class: 'sc-btn sm', html: icon('close'), tip: 'Deselect (Esc)' });
  closeBtn.addEventListener('click', () => {
    ctx.select([]);
    ctx.inspect = -1;
  });
  const body = h('div');
  const orders = h('div', { class: 'sc-up-orders' });
  const el = h('div', { class: 'sc-unitpanel sc-panel sc-hidden' }, h('div', { class: 'sc-titlebar' }, flagSlot, titleTxt, closeBtn), body, orders);

  // --- single unit view
  const sym = h('span');
  const uName = h('div', { class: 'nm' });
  const uDesign = h('div', { class: 'ds' });
  const uLoc = h('div', { class: 'ds' });
  const uAff = h('span', { class: 'sc-tag' });
  const idBox = h('div', { class: 'sc-up-id' }, h('div', { class: 'sc-row', style: 'gap:6px' }, sym, uAff), uName, uDesign, uLoc);
  const bars: Record<string, { b: Bar; v: HTMLElement }> = {};
  const barsBox = h('div', { class: 'sc-up-bars' });
  const addBar = (key: string, label: string, ico: IconName, color: Parameters<typeof bar>[0], tip: string) => {
    const b = bar(color);
    const v = h('span');
    const lbl = h('span', null, h('span', { html: icon(ico) }), label);
    setTip(lbl, tip);
    barsBox.append(lbl, b.el, v);
    bars[key] = { b, v };
  };
  addBar('str', 'Strength', 'people', 'auto', 'Personnel and equipment at full strength (100%).');
  addBar('eff', 'Efficiency', 'gear', 'blue', 'Readiness, morale and organisation. Drops in combat and without supply.');
  addBar('exp', 'Experience', 'medal', 'amber', 'Combat experience improves attack and defense.');
  addBar('sup', 'Supply', 'ammo', 'auto', 'Ammunition and consumables.');
  addBar('fuel', 'Fuel', 'fuel', 'auto', 'Fuel for movement.');
  addBar('ent', 'Entrenched', 'spade', 'grey', 'Dug-in defensive bonus built up while stationary.');
  const statsBox = h('div', { class: 'sc-up-stats' });
  const orderLine = h('div', { class: 'sc-dim', style: 'padding:0 8px 4px;font-size:11px' });
  const single = h('div', null, h('div', { class: 'sc-up-body' }, idBox, barsBox, statsBox), orderLine);

  // --- multi view
  const multiCards = h('div', { class: 'sc-up-multi' });
  const multiBars = h('div', { class: 'sc-up-bars', style: 'padding:0 8px 6px' });
  const mb: Record<string, { b: Bar; v: HTMLElement }> = {};
  for (const [k, l, c] of [['str', 'Avg. strength', 'auto'], ['eff', 'Avg. efficiency', 'blue'], ['sup', 'Avg. supply', 'auto']] as const) {
    const b = bar(c);
    const v = h('span');
    multiBars.append(h('span', null, l), b.el, v);
    mb[k] = { b, v };
  }
  const multi = h('div', null, multiCards, multiBars);

  // --- orders
  const btn = (ico: IconName, tip: string, fn: () => void, key?: string) => {
    const b = h('button', { class: 'sc-btn', html: icon(ico) });
    setTip(b, `<b>${tip.split(' — ')[0]}</b>${tip.includes(' — ') ? '<br>' + tip.split(' — ')[1] : ''}${key ? `<span class="tt-key">${key}</span>` : ''}`);
    b.addEventListener('click', fn);
    return b;
  };
  const target = (kind: Extract<TargetMode, { kind: string }>['kind']) => () => ctx.setTarget({ kind } as TargetMode);
  const cmd = (fn: (ids: number[]) => { ok: boolean; reason?: string }, okText: string) => () => {
    if (ctx.selection.length) ctx.run(fn(ctx.selection), okText);
  };
  let ordersSig = '';
  const stanceBtns = new Map<Stance, HTMLElement>();
  const buildOrders = (classes: Set<UnitClass>) => {
    const sig = [...classes].sort().join(',');
    if (sig === ordersSig) return;
    ordersSig = sig;
    clear(orders);
    stanceBtns.clear();
    const hasLand = classes.has(UnitClass.Land);
    const hasAir = classes.has(UnitClass.Air);
    const hasNaval = classes.has(UnitClass.Naval);
    const g1 = h('div', { class: 'grp' });
    if (hasLand || hasNaval) {
      g1.append(
        btn('move', 'Move — then right/left-click a destination', target('move'), 'V'),
        btn('attack', 'Attack — then click a target hex', target('attack'), 'T'),
        btn('hold', 'Hold position — stop and hold the current hex', cmd((ids) => game.holdPosition(ids), 'Holding position'), 'H'),
        btn('retreat', 'Retreat — fall back towards friendly supply', cmd((ids) => game.retreat(ids), 'Retreating')),
      );
    }
    if (hasNaval) {
      g1.append(
        btn('patrol', 'Naval patrol — move and engage enemies en route', target('navalPatrol')),
        btn('burst', 'Bombard — shell a coastal hex', target('bombard')),
      );
    }
    const g2 = h('div', { class: 'grp' });
    if (hasAir) {
      g2.append(
        btn('bomb', 'Air strike — attack ground or naval targets at a hex', target('airStrike'), 'B'),
        btn('patrol', 'Combat air patrol — patrol over a hex', target('airPatrol'), 'P'),
        btn('intercept', 'Intercept — intercept enemy aircraft over a hex', target('airIntercept'), 'I'),
        btn('runway', 'Rebase — move to another airbase or carrier', target('rebase')),
        btn('home', 'Return to base', () => {
          const byBase = new Map<number, number[]>();
          for (const id of ctx.selection) {
            const u = ctx.state.units.get(id);
            if (!u || u.baseHex < 0) continue;
            const l = byBase.get(u.baseHex) ?? [];
            l.push(id);
            byBase.set(u.baseHex, l);
          }
          for (const [hx, ids] of byBase) ctx.run(game.rebase(ids, hx), 'Returning to base');
        }),
      );
    }
    const g3 = h('div', { class: 'grp' });
    for (const s of STANCES) {
      const b = btn(s.icon, `${s.name} stance — ${s.tip}`, cmd((ids) => game.setStance(ids, s.s), `Stance: ${s.name}`));
      stanceBtns.set(s.s, b);
      g3.appendChild(b);
    }
    const g4 = h('div', { class: 'grp' });
    g4.append(
      btn('reinforce', 'Reinforce — replenish strength (costs money & goods)', cmd((ids) => game.reinforce(ids), 'Reinforcements requested'), 'R'),
      btn('focus', 'Centre view on selection', () => {
        const u = ctx.state.units.get(ctx.selection[0]);
        if (u) ctx.renderer.focusOn(u.x, u.z);
      }, 'C'),
      btn('disband', 'Disband — permanently disband the selected units', () => {
        const n = ctx.selection.length;
        if (!n) return;
        confirm('Disband Units', `Permanently disband ${n} unit${n > 1 ? 's' : ''}? This cannot be undone.`, 'Disband', () => {
          ctx.run(game.disband(ctx.selection), `${n} unit${n > 1 ? 's' : ''} disbanded`);
          ctx.select([]);
        }, true);
      }, 'Del'),
    );
    orders.append(...[g1, g2, g3, g4].filter((g) => g.childElementCount > 0));
  };

  let mode: 'none' | 'single' | 'multi' = 'none';
  let lastKey = '';
  let t = 0;
  let symCat = -1;
  const multiRows = new Map<number, { el: HTMLElement; b: Bar }>();

  const statsHTML = (u: Unit) => {
    const d = designOf(ctx.state, u);
    if (!d) return '';
    const row = (k: string, v: string) => `<div class="tt-row" style="display:flex;justify-content:space-between"><span class="sc-dim">${k}</span><b>${v}</b></div>`;
    return row('Attack S/H', `${d.attackSoft} / ${d.attackHard}`) + row('Attack A/N', `${d.attackAir} / ${d.attackNaval}`) +
      row('Defense G/A', `${d.defenseGround} / ${d.defenseAir}`) + row('Speed', `${d.speedKmh} km/h`) +
      row('Range', d.rangeKm ? `${d.rangeKm} km` : `${d.rangeGround} hex`) + row('Kills', fmtNum(u.kills)) +
      row('Stance', u.stance[0].toUpperCase() + u.stance.slice(1));
  };

  return {
    el,
    update(dt: number) {
      t -= dt;
      const st = ctx.state;
      const sel = ctx.selection.filter((id) => st.units.has(id));
      if (sel.length !== ctx.selection.length) ctx.select(sel);
      const inspectU = ctx.inspect >= 0 ? st.units.get(ctx.inspect) : undefined;
      const newMode = sel.length === 1 || (!sel.length && inspectU) ? 'single' : sel.length > 1 ? 'multi' : 'none';
      const key = newMode + ':' + (sel.length ? sel.join(',') : inspectU?.id ?? '');
      if (key !== lastKey) {
        lastKey = key;
        t = 0;
        if (newMode !== mode) {
          mode = newMode;
          body.replaceChildren(mode === 'single' ? single : mode === 'multi' ? multi : '');
        }
        setClass(el, 'sc-hidden', mode === 'none');
        if (mode === 'multi') {
          clear(multiCards);
          multiRows.clear();
        }
      }
      if (mode === 'none' || t > 0) return;
      t = 0.12;
      if (mode === 'single') {
        const u = sel.length ? st.units.get(sel[0]) : inspectU;
        if (!u) return;
        const d = designOf(st, u);
        const own = u.nation === ctx.player;
        const aff = affiliation(game, ctx.player, u.nation);
        if (d && symCat !== d.category * 10 + aff.length) {
          symCat = d.category * 10 + aff.length;
          sym.innerHTML = natoSymbol(d.category, aff, 54);
        }
        flagSlot.replaceChildren(flagImg(st.nations[u.nation]?.flag, 12));
        setText(titleTxt, own ? 'Unit Information' : `${st.nations[u.nation]?.adjective ?? ''} Unit (${aff === 'hostile' ? 'Enemy' : aff === 'ally' ? 'Allied' : 'Foreign'})`);
        setText(uAff, own ? 'OWN' : aff === 'hostile' ? 'ENEMY' : aff === 'ally' ? 'ALLY' : 'FOREIGN');
        uAff.className = 'sc-tag ' + (own ? 'blue' : aff === 'hostile' ? 'red' : aff === 'ally' ? 'green' : '');
        setText(uName, u.name);
        setText(uDesign, d ? `${d.name} · ${CATEGORY_NAMES[d.category]}` : u.design);
        setText(uLoc, '⌖ ' + hexPlace(st, u.hex));
        const set = (k: string, v: number) => {
          bars[k].b.set(v / 100);
          setText(bars[k].v, v.toFixed(0));
        };
        set('str', u.strength);
        set('eff', u.efficiency);
        set('exp', u.experience);
        set('sup', u.supply);
        set('fuel', u.fuel);
        set('ent', u.entrenchment);
        statsBox.innerHTML = statsHTML(u);
        const air = (u as { airState?: string }).airState;
        orderLine.innerHTML = `<b class="${u.inCombat ? 'neg' : 'sc-amber'}">${escapeHTML(orderText(st, u))}</b>` +
          (d?.cls === UnitClass.Air && air ? ` <span class="sc-dim">· ${escapeHTML(air)}</span>` : '') +
          (u.path.length ? ` <span class="sc-dim">· ${u.path.length} hexes to go</span>` : '');
        if (own) {
          buildOrders(new Set([d?.cls ?? UnitClass.Land]));
          orders.style.display = '';
          stanceBtns.forEach((b, s) => setClass(b, 'on', u.stance === s));
        } else orders.style.display = 'none';
      } else {
        flagSlot.replaceChildren(flagImg(ctx.me.flag, 12));
        setText(titleTxt, `${sel.length} Units Selected`);
        const classes = new Set<UnitClass>();
        let s = 0, e = 0, su = 0;
        const stances = new Set<Stance>();
        for (const id of sel) {
          const u = st.units.get(id);
          if (!u) continue;
          const d = designOf(st, u);
          classes.add(d?.cls ?? UnitClass.Land);
          s += u.strength;
          e += u.efficiency;
          su += u.supply;
          stances.add(u.stance);
          let r = multiRows.get(id);
          if (!r) {
            const b = bar('auto');
            const card = h('div', { class: 'sc-up-card', html: d ? natoSymbol(d.category, 'friend', 34) : '' }, b.el);
            const uid = id;
            card.addEventListener('click', (ev) => {
              if (ev.shiftKey) ctx.select(ctx.selection.filter((x) => x !== uid));
              else ctx.select([uid]);
            });
            setTip(card, () => {
              const uu = st.units.get(uid);
              return uu ? `<b>${escapeHTML(uu.name)}</b><br>${escapeHTML(designOf(st, uu)?.name ?? '')}<br>Strength ${uu.strength.toFixed(0)}%<br><span class="sc-dim">Click: select only · Shift+click: remove</span>` : '';
            });
            multiCards.appendChild(card);
            r = { el: card, b };
            multiRows.set(id, r);
          }
          r.b.set(u.strength / 100);
        }
        const n = Math.max(1, sel.length);
        mb.str.b.set(s / n / 100); setText(mb.str.v, (s / n).toFixed(0));
        mb.eff.b.set(e / n / 100); setText(mb.eff.v, (e / n).toFixed(0));
        mb.sup.b.set(su / n / 100); setText(mb.sup.v, (su / n).toFixed(0));
        buildOrders(classes);
        orders.style.display = '';
        stanceBtns.forEach((b, sn) => setClass(b, 'on', stances.size === 1 && stances.has(sn)));
      }
    },
  };
}
