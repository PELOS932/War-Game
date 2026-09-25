/**
 * Military tab: order of battle grouped by category with filters, and the
 * unit production queue.
 */
import { h, setText, setClass, KeyedList, fmtNum, fmtCompact, fmtMoney, escapeHTML, setTip } from '../../dom';
import { icon, natoSymbol } from '../../icons';
import { bar, Bar } from '../../widgets';
import { CATEGORY_NAMES, UnitCategory, UnitClass, type Unit, type ProductionItem } from '../../../sim/types';
import { designOf, orderText, hexPlace, type Ctx } from '../context';
import type { TabView } from '../panel';

type Filter = 'all' | 'land' | 'air' | 'naval' | 'combat' | 'idle' | 'damaged';

type Item = { kind: 'group'; cat: UnitCategory; count: number; collapsed: boolean } | { kind: 'unit'; u: Unit };

export function militaryTab(ctx: Ctx): TabView {
  const { game } = ctx;
  let filter: Filter = 'all';
  let search = '';
  const collapsed = new Set<UnitCategory>();

  const sumLand = h('b');
  const sumAir = h('b');
  const sumNaval = h('b');
  const sumPers = h('b');
  const sumUpkeep = h('b');
  const sumCombat = h('b');
  const summary = h('div', { class: 'sc-grid3' },
    h('div', { class: 'sc-statcard sc-inset' }, h('div', { class: 'l' }, h('span', { html: icon('helmet') }), ' Land'), h('div', { class: 'v' }, sumLand)),
    h('div', { class: 'sc-statcard sc-inset' }, h('div', { class: 'l' }, h('span', { html: icon('plane') }), ' Air'), h('div', { class: 'v' }, sumAir)),
    h('div', { class: 'sc-statcard sc-inset' }, h('div', { class: 'l' }, h('span', { html: icon('anchor') }), ' Naval'), h('div', { class: 'v' }, sumNaval)),
  );
  const summary2 = h('div', { class: 'sc-kv2', style: 'margin:6px 2px' },
    h('div', { class: 'k' }, 'Personnel'), h('div', { class: 'v' }, sumPers),
    h('div', { class: 'k' }, 'Upkeep / day'), h('div', { class: 'v' }, sumUpkeep),
    h('div', { class: 'k' }, 'In combat'), h('div', { class: 'v' }, sumCombat),
  );

  const chips = h('div', { class: 'sc-chips', style: 'margin:4px 0' });
  const chipEls = new Map<Filter, HTMLElement>();
  const addChip = (f: Filter, label: string, ico?: Parameters<typeof icon>[0]) => {
    const c = h('span', { class: 'sc-chip' + (f === filter ? ' on' : '') }, ico ? h('span', { html: icon(ico) }) : null, label);
    c.addEventListener('click', () => {
      filter = f;
      chipEls.forEach((e, k) => setClass(e, 'on', k === f));
      refresh();
    });
    chipEls.set(f, c);
    chips.appendChild(c);
  };
  addChip('all', 'All');
  addChip('land', 'Land', 'helmet');
  addChip('air', 'Air', 'plane');
  addChip('naval', 'Naval', 'anchor');
  addChip('combat', 'In combat', 'swords');
  addChip('idle', 'Idle');
  addChip('damaged', 'Damaged');
  const searchIn = h('input', { class: 'sc-input', placeholder: 'Filter by name…', style: 'width:100%;margin-bottom:4px' }) as HTMLInputElement;
  searchIn.addEventListener('input', () => {
    search = searchIn.value.toLowerCase();
    refresh();
  });
  searchIn.addEventListener('keydown', (e) => e.stopPropagation());
  const selAllBtn = h('button', { class: 'sc-btn sm', tip: 'Select every unit in the current filter' }, 'Select all');
  const listEl = h('div', { class: 'sc-inset', style: 'min-height:80px' });
  const empty = h('div', { class: 'sc-empty sc-hidden' }, 'No units match the filter.');

  interface URow { el: HTMLElement; str: Bar; eff: Bar; name: HTMLElement; sub: HTMLElement; status: HTMLElement; sym: HTMLElement; symCat: number }
  const list = new KeyedList<Item>(listEl, (it) => (it.kind === 'group' ? 'g' + it.cat : 'u' + it.u.id), (it) => {
    if (it.kind === 'group') {
      const lbl = h('span');
      const cnt = h('span', { class: 'cnt' });
      const chev = h('span', { html: icon('chevDown') });
      const sym = h('span', { html: natoSymbol(it.cat, 'friend', 22) });
      const el = h('div', { class: 'sc-ugroup-h' }, chev, sym, lbl, cnt);
      el.addEventListener('click', (e) => {
        if (e.shiftKey || e.ctrlKey) {
          // select the whole group
          const ids = currentUnits.filter((u) => designOf(ctx.state, u)?.category === it.cat).map((u) => u.id);
          ctx.select(ids);
          return;
        }
        if (collapsed.has(it.cat)) collapsed.delete(it.cat);
        else collapsed.add(it.cat);
        refresh();
      });
      setTip(el, 'Click to expand/collapse. <b>Shift+click</b> selects the whole group.');
      return {
        el,
        update(g: Item) {
          if (g.kind !== 'group') return;
          setText(lbl, CATEGORY_NAMES[g.cat]);
          setText(cnt, String(g.count));
          chev.innerHTML = icon(g.collapsed ? 'chevRight' : 'chevDown');
        },
      };
    }
    const str = bar('auto');
    const eff = bar('blue');
    const name = h('span');
    const sub = h('small');
    const status = h('div', { class: 'st' });
    const sym = h('span');
    const row: URow = { el: h('div', { class: 'sc-urow' }), str, eff, name, sub, status, sym, symCat: -1 };
    row.el.append(sym, h('div', { class: 'nm' }, name, sub), h('div', { class: 'sc-col', style: 'gap:2px' }, str.el, eff.el), status);
    const uid = it.u.id;
    row.el.addEventListener('click', (e) => {
      ctx.select([uid], e.shiftKey);
      const u = ctx.state.units.get(uid);
      if (u) ctx.renderer.focusOn(u.x, u.z);
    });
    setTip(row.el, () => {
      const u = ctx.state.units.get(uid);
      if (!u) return '';
      const d = designOf(ctx.state, u);
      return `<div class="tt-title">${escapeHTML(u.name)}</div>${escapeHTML(d?.name ?? '')}<div class="tt-sep"></div>` +
        `<div class="tt-row"><span>Strength</span><b>${u.strength.toFixed(0)}%</b></div><div class="tt-row"><span>Efficiency</span><b>${u.efficiency.toFixed(0)}%</b></div>` +
        `<div class="tt-row"><span>Experience</span><span>${u.experience.toFixed(0)}</span></div><div class="tt-row"><span>Supply / Fuel</span><span>${u.supply.toFixed(0)}% / ${u.fuel.toFixed(0)}%</span></div>` +
        `<div class="tt-row"><span>Location</span><span>${escapeHTML(hexPlace(ctx.state, u.hex))}</span></div><div class="tt-sep"></div><span class="sc-dim">Click to select &amp; focus · Shift+click adds</span>`;
    });
    return {
      el: row.el,
      update(it2: Item) {
        if (it2.kind !== 'unit') return;
        const u = it2.u;
        const d = designOf(ctx.state, u);
        if (d && row.symCat !== d.category) {
          row.symCat = d.category;
          sym.innerHTML = natoSymbol(d.category, 'friend', 26);
        }
        setText(name, u.name);
        setText(sub, d ? d.name : u.design);
        str.set(u.strength / 100);
        eff.set(u.efficiency / 100);
        setText(status, orderText(ctx.state, u));
        setClass(status, 'combat', u.inCombat);
        setClass(row.el, 'sel', ctx.selection.includes(u.id));
      },
    };
  });

  // production queue
  const queueEl = h('div', { class: 'sc-inset' });
  const queueEmpty = h('div', { class: 'sc-empty' }, 'Nothing in production. Use the Build panel (F4) to order new units.');
  const queue = new KeyedList<ProductionItem>(queueEl, (p) => p.id, (p) => {
    const sym = h('span');
    const name = h('div', { class: 'sc-nowrap' });
    const sub = h('div', { class: 'sc-dim', style: 'font-size:10px' });
    const pb = bar('amber', true);
    const cancel = h('button', { class: 'sc-btn sm', html: icon('close'), tip: 'Cancel production (partial refund)' });
    const pid = p.id;
    cancel.addEventListener('click', () => ctx.run(game.cancelProduction(ctx.player, pid), 'Production cancelled'));
    const el = h('div', { class: 'sc-prodrow' }, sym, h('div', { style: 'min-width:0' }, name, sub), pb.el, cancel);
    let symSet = false;
    return {
      el,
      update(it: ProductionItem) {
        const d = ctx.state.designs.get(it.design);
        if (d && !symSet) {
          symSet = true;
          sym.innerHTML = natoSymbol(d.category, 'friend', 26);
        }
        setText(name, `${it.count > 1 ? it.count + '× ' : ''}${d?.name ?? it.design}`);
        setText(sub, `at ${ctx.state.cities[it.cityId]?.name ?? '?'}`);
        const f = it.totalDays > 0 ? 1 - it.daysLeft / it.totalDays : 0;
        pb.set(f, `${Math.ceil(it.daysLeft)}d left`);
      },
    };
  });

  selAllBtn.addEventListener('click', () => ctx.select(currentUnits.map((u) => u.id)));

  const el = h('div', null,
    summary, summary2,
    h('div', { class: 'sc-sechead' }, 'Order of Battle', h('span', { class: 'sc-grow' }), selAllBtn),
    chips, searchIn, listEl, empty,
    h('div', { class: 'sc-sechead' }, 'Production Queue'), queueEl, queueEmpty,
  );

  let currentUnits: Unit[] = [];
  const refresh = () => {
    const st = ctx.state;
    const me = ctx.player;
    const mine: Unit[] = [];
    let land = 0, air = 0, naval = 0, pers = 0, upkeep = 0, combat = 0;
    for (const u of st.units.values()) {
      if (u.nation !== me) continue;
      mine.push(u);
      const d = designOf(st, u);
      if (!d) continue;
      if (d.cls === UnitClass.Land) land++;
      else if (d.cls === UnitClass.Air) air++;
      else naval++;
      pers += d.personnel * (u.strength / 100);
      upkeep += d.upkeep;
      if (u.inCombat) combat++;
    }
    setText(sumLand, String(land));
    setText(sumAir, String(air));
    setText(sumNaval, String(naval));
    setText(sumPers, fmtNum(pers));
    setText(sumUpkeep, fmtMoney(upkeep / 1000, 2));
    setText(sumCombat, String(combat));
    const pass = (u: Unit) => {
      const d = designOf(st, u);
      if (search && !u.name.toLowerCase().includes(search) && !(d?.name.toLowerCase().includes(search))) return false;
      switch (filter) {
        case 'land': return d?.cls === UnitClass.Land;
        case 'air': return d?.cls === UnitClass.Air;
        case 'naval': return d?.cls === UnitClass.Naval;
        case 'combat': return u.inCombat;
        case 'idle': return u.order.type === 'idle' && !u.inCombat;
        case 'damaged': return u.strength < 70;
      }
      return true;
    };
    currentUnits = mine.filter(pass);
    const byCat = new Map<UnitCategory, Unit[]>();
    for (const u of currentUnits) {
      const c = designOf(st, u)?.category ?? UnitCategory.Infantry;
      let l = byCat.get(c);
      if (!l) byCat.set(c, (l = []));
      l.push(u);
    }
    const items: Item[] = [];
    [...byCat.keys()].sort((a, b) => a - b).forEach((cat) => {
      const us = byCat.get(cat) as Unit[];
      const isCol = collapsed.has(cat);
      items.push({ kind: 'group', cat, count: us.length, collapsed: isCol });
      if (!isCol) {
        us.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        for (const u of us) items.push({ kind: 'unit', u });
      }
    });
    list.sync(items);
    setClass(empty, 'sc-hidden', items.length > 0);
    const q = ctx.me.productionQueue;
    queue.sync(q);
    setClass(queueEmpty, 'sc-hidden', q.length > 0);
    void fmtCompact;
  };

  return {
    id: 'military', title: 'Military Forces', icon: 'tank', tip: 'Order of battle, unit status and production queue', el,
    update() {
      refresh();
    },
  };
}
