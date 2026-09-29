/**
 * Arms trade UI: design spec sheet (shared by the Build, Research and Market
 * views), the Arms Market (filters, offers table, instant purchase) and the
 * "Sell units" dialog.
 */
import { h, setText, setClass, clear, fmtMillions, fmtNum, escapeHTML, setTip } from '../dom';
import { icon, natoSymbol } from '../icons';
import { flagImg, flagHTML, relColor, relLabel } from '../widgets';
import { dialog } from '../dialogs';
import { CATEGORY_CLASS, CATEGORY_NAMES, UnitClass, type UnitDesign } from '../../sim/types';
import type { ArmsOffer } from '../../sim/arms';
import type { Ctx } from './context';

const money = (b: number): string => (b >= 1 ? `$${b.toFixed(b >= 10 ? 1 : 2)}B` : `$${(b * 1000).toFixed(0)}M`);

export function originFlag(ctx: Ctx, code: string | undefined, hgt = 11): HTMLElement {
  const n = code ? ctx.state.nations.find((x) => x.code === code) : undefined;
  return n ? flagImg(n.flag, hgt, n.name) : h('span', { class: 'sc-dim' }, code ?? '');
}

/** Full specification sheet of a design (bars, stats, description, origin). */
export function designSheet(ctx: Ctx, d: UnitDesign): HTMLElement {
  const statCell = (k: string, v: string | number) => h('div', null, h('span', null, k), h('span', null, String(v)));
  const att = (label: string, v: number) => [h('span', null, label), h('div', { class: 'sc-bar red' }, h('i', { style: `width:${v}%` })), h('span', null, String(v))];
  const def = (label: string, v: number) => [h('span', null, label), h('div', { class: 'sc-bar blue' }, h('i', { style: `width:${v}%` })), h('span', null, String(v))];
  const originN = d.origin ? ctx.state.nations.find((x) => x.code === d.origin) : undefined;
  const tags = h('div', { class: 'sc-row', style: 'gap:4px;margin-top:2px;flex-wrap:wrap' });
  if (d.real) {
    if (originN) tags.append(originFlag(ctx, d.origin, 11), h('span', { class: 'sc-dim' }, originN.name));
    tags.append(h('span', { class: 'sc-tag' }, String(d.year ?? '')));
    tags.append(d.future ? h('span', { class: 'sc-tag amber' }, 'FUTURE PROGRAMME') : h('span', { class: 'sc-tag green' }, 'IN SERVICE'));
    tags.append(d.exportable === false ? h('span', { class: 'sc-tag red' }, 'NOT EXPORTABLE') : h('span', { class: 'sc-tag blue' }, 'EXPORTABLE'));
  }
  const el = h('div', null,
    h('div', { class: 'sc-row', style: 'gap:8px;margin-bottom:4px' },
      h('span', { html: natoSymbol(d.category, 'friend', 44) }),
      h('div', { class: 'sc-grow' },
        h('div', { style: 'font-weight:800;font-size:13px;color:#fff' }, d.name),
        h('div', { class: 'sc-dim' }, `${CATEGORY_NAMES[d.category]} · Gen ${d.generation} · ${d.armor} armor · ${d.mobility}`),
        tags,
      ),
    ),
    h('div', { class: 'sc-dim', style: 'font-size:11px;margin-bottom:5px' }, d.description),
    h('div', { class: 'sc-grid2', style: 'gap:10px' },
      h('div', { class: 'sc-attbars' }, ...att('vs Soft', d.attackSoft), ...att('vs Hard', d.attackHard), ...att('vs Air', d.attackAir), ...att('vs Naval', d.attackNaval), ...att('vs Sub', d.attackSub)),
      h('div', { class: 'sc-attbars' }, ...def('Def. Ground', d.defenseGround), ...def('Def. Air', d.defenseAir), ...def('Def. Naval', d.defenseNaval),
        h('span', null, 'Stealth'), h('div', { class: 'sc-bar grey' }, h('i', { style: `width:${d.stealth * 100}%` })), h('span', null, (d.stealth * 100).toFixed(0))),
    ),
    h('div', { class: 'sc-statgrid', style: 'margin-top:6px' },
      statCell('Speed', `${d.speedKmh} km/h`), statCell('Spotting', `${d.spotting} hex`), statCell('Personnel', fmtNum(d.personnel)),
      statCell('Range gnd', d.rangeGround + (d.indirect ? ' (ind.)' : '')), statCell('Range air', d.rangeAir), statCell('Range naval', d.rangeNaval),
      statCell('Radius', d.rangeKm ? `${fmtNum(d.rangeKm)} km` : '—'), statCell('Fuel', `${d.fuelCapacity} h`), statCell('Capture', d.canCapture ? 'Yes' : 'No'),
      statCell('Cost', fmtMillions(d.cost)), statCell('Mil. goods', fmtNum(d.militaryGoodsCost)), statCell('Build', `${d.buildDays} d`),
      statCell('Upkeep', `${fmtMillions(d.upkeep)}/d`),
    ),
  );
  return el;
}

// ---------------------------------------------------------------------------
// Arms Market
// ---------------------------------------------------------------------------
type ClsFilter = 'all' | UnitClass;
type SortKey = 'design' | 'seller' | 'price' | 'year' | 'power' | 'rel';

const keyStat = (d: UnitDesign): string => {
  const atk = Math.max(d.attackSoft, d.attackHard, d.attackAir, d.attackNaval, d.attackSub);
  const df = Math.max(d.defenseGround, d.defenseAir, d.defenseNaval);
  return `A${atk} D${df}${d.rangeKm ? ` · ${fmtNum(d.rangeKm)}km` : ''}`;
};
const power = (d: UnitDesign): number => Math.max(d.attackSoft, d.attackHard, d.attackAir, d.attackNaval, d.attackSub) * 0.7 + Math.max(d.defenseGround, d.defenseAir, d.defenseNaval) * 0.3;

export interface ArmsMarketView {
  el: HTMLElement;
  update(force: boolean): void;
}

export function armsMarketView(ctx: Ctx): ArmsMarketView {
  const { game } = ctx;
  let cls: ClsFilter = 'all';
  let cat = -1;
  let seller = -1;
  let search = '';
  let sortKey: SortKey = 'power';
  let sortAsc = false;
  let sel: ArmsOffer | null = null;
  let offers: ArmsOffer[] = [];
  let offersHour = -1e9;
  let offersDirty = true;

  const clsChips = h('div', { class: 'sc-chips', style: 'margin-bottom:4px' });
  const clsEls: [ClsFilter, HTMLElement][] = [];
  ([['all', 'All', 'globe'], [UnitClass.Land, 'Land', 'helmet'], [UnitClass.Air, 'Air', 'plane'], [UnitClass.Naval, 'Naval', 'anchor']] as const).forEach(([c, label, ico]) => {
    const e = h('span', { class: 'sc-chip' + (c === cls ? ' on' : '') }, h('span', { html: icon(ico) }), label);
    e.addEventListener('click', () => {
      cls = c;
      cat = -1;
      clsEls.forEach(([k, x]) => setClass(x, 'on', k === c));
      renderFilters();
      renderTable();
    });
    clsEls.push([c, e]);
    clsChips.appendChild(e);
  });
  const catSel = h('select', { class: 'sc-select', style: 'flex:1;min-width:0' }) as HTMLSelectElement;
  const sellerSel = h('select', { class: 'sc-select', style: 'flex:1;min-width:0' }) as HTMLSelectElement;
  const searchIn = h('input', { class: 'sc-input', placeholder: 'Search designs…', style: 'flex:1;min-width:0' }) as HTMLInputElement;
  searchIn.addEventListener('keydown', (e) => e.stopPropagation());
  searchIn.addEventListener('input', () => { search = searchIn.value.trim().toLowerCase(); renderTable(); });
  catSel.addEventListener('change', () => { cat = Number(catSel.value); renderTable(); });
  sellerSel.addEventListener('change', () => { seller = Number(sellerSel.value); renderTable(); });
  const qty = h('input', { class: 'sc-input num', type: 'number', min: '1', max: '20', value: '1', style: 'width:48px' }) as HTMLInputElement;
  qty.addEventListener('keydown', (e) => e.stopPropagation());
  qty.addEventListener('input', () => {
    renderDetailTotals();
    tableHost.querySelectorAll('button.buyn').forEach((b) => { b.textContent = 'Buy ×' + nQty(); });
  });
  const info = h('div', { class: 'sc-dim', style: 'font-size:10.5px;margin:2px 0' });
  const tableHost = h('div', { class: 'sc-inset sc-scroll', style: 'max-height:250px' });
  const detail = h('div', { class: 'sc-inset', style: 'padding:6px;margin-top:6px' });

  let counts = [0, 0];
  const updateInfo = () => {
    setText(info, `${counts[0]} offers${counts[0] > counts[1] ? ` (showing the best ${counts[1]} — refine the filters)` : ''} · funds: ${money(Math.max(0, ctx.me.treasury) + ctx.me.militaryFund)} · instant delivery to your capital, airbases and ports`);
  };
  const filtered = (): ArmsOffer[] => {
    const out: ArmsOffer[] = [];
    for (const o of offers) {
      const d = ctx.state.designs.get(o.designId);
      if (!d) continue;
      if (cls !== 'all' && d.cls !== cls) continue;
      if (cat >= 0 && d.category !== cat) continue;
      if (seller >= 0 && o.seller !== seller) continue;
      if (search) {
        const s = ctx.state.nations[o.seller];
        if (!(d.name.toLowerCase().includes(search) || s.name.toLowerCase().includes(search) || (d.origin ?? '').toLowerCase() === search || CATEGORY_NAMES[d.category].toLowerCase().includes(search))) continue;
      }
      out.push(o);
    }
    const dir = sortAsc ? 1 : -1;
    const key = (o: ArmsOffer): number | string => {
      const d = ctx.state.designs.get(o.designId)!;
      switch (sortKey) {
        case 'design': return d.name;
        case 'seller': return ctx.state.nations[o.seller].name;
        case 'price': return o.price;
        case 'year': return d.year ?? 0;
        case 'rel': return game.relation(ctx.player, o.seller);
        default: return power(d);
      }
    };
    out.sort((a, b) => {
      const ka = key(a), kb = key(b);
      const c = typeof ka === 'string' ? ka.localeCompare(kb as string) : (ka as number) - (kb as number);
      return c * dir || a.price - b.price;
    });
    return out;
  };

  const renderFilters = () => {
    const cats = new Set<number>();
    const sellers = new Map<number, string>();
    for (const o of offers) {
      const d = ctx.state.designs.get(o.designId);
      if (!d) continue;
      if (cls === 'all' || d.cls === cls) cats.add(d.category);
      sellers.set(o.seller, ctx.state.nations[o.seller].name);
    }
    clear(catSel);
    catSel.appendChild(h('option', { value: '-1' }, 'All types'));
    [...cats].sort((a, b) => a - b).forEach((c) => catSel.appendChild(h('option', { value: String(c) }, CATEGORY_NAMES[c as keyof typeof CATEGORY_NAMES])));
    catSel.value = String(cat);
    if (catSel.value !== String(cat)) { cat = -1; catSel.value = '-1'; }
    clear(sellerSel);
    sellerSel.appendChild(h('option', { value: '-1' }, 'All sellers'));
    [...sellers.entries()].sort((a, b) => a[1].localeCompare(b[1])).forEach(([id, nm]) => sellerSel.appendChild(h('option', { value: String(id) }, nm)));
    sellerSel.value = String(seller);
    if (sellerSel.value !== String(seller)) { seller = -1; sellerSel.value = '-1'; }
  };

  const buy = (o: ArmsOffer, n: number) => {
    const d = ctx.state.designs.get(o.designId);
    const ok = ctx.run(game.buyArms(ctx.player, o.seller, o.designId, n), `${n}× ${d?.name ?? 'unit'} delivered from ${ctx.state.nations[o.seller].name}`);
    if (ok) { offersDirty = true; update(true); }
  };
  const nQty = (): number => Math.max(1, Math.min(20, Math.floor(Number(qty.value)) || 1));

  const headCell = (label: string, key: SortKey, cls2 = '') => {
    const th = h('th', { class: `sortable ${cls2}${sortKey === key ? ' sorted' + (sortAsc ? ' asc' : '') : ''}` }, label);
    th.addEventListener('click', () => {
      if (sortKey === key) sortAsc = !sortAsc; else { sortKey = key; sortAsc = key === 'design' || key === 'seller' || key === 'price'; }
      renderTable();
    });
    return th;
  };

  const renderTable = () => {
    clear(tableHost);
    const list = filtered();
    const shown = list.slice(0, 120);
    counts = [list.length, shown.length];
    updateInfo();
    if (!shown.length) {
      tableHost.appendChild(h('div', { class: 'sc-empty' }, offers.length ? 'No offers match the filters.' : 'No nation currently offers arms to you (relations too low, or at war).'));
      renderDetail();
      return;
    }
    const tbl = h('table', { class: 'sc-table' });
    tbl.appendChild(h('thead', null, h('tr', null, h('th'), headCell('Design', 'design'), headCell('Seller', 'seller'), headCell('Stats', 'power'), headCell('Year', 'year', 'num'), headCell('Price', 'price', 'num'), h('th'))));
    const tb = h('tbody');
    for (const o of shown) {
      const d = ctx.state.designs.get(o.designId)!;
      const s = ctx.state.nations[o.seller];
      const isSel = sel && sel.seller === o.seller && sel.designId === o.designId;
      const btn = h('button', { class: 'sc-btn sm primary buyn' }, 'Buy ×' + nQty());
      btn.addEventListener('click', (e) => { e.stopPropagation(); buy(o, nQty()); });
      const rel = game.relation(ctx.player, o.seller);
      const tr = h('tr', { class: 'clickable' + (isSel ? ' sel' : '') },
        h('td', { html: natoSymbol(d.category, 'friend', 20) }),
        h('td', { style: 'max-width:130px;overflow:hidden;text-overflow:ellipsis' }, d.name, d.future ? h('span', { class: 'sc-tag amber', style: 'margin-left:3px' }, 'NEW') : null),
        h('td', { html: `${flagHTML(s.flag, 10)} ${escapeHTML(s.code)} <span style="color:${relColor(rel)}">●</span>` }),
        h('td', null, keyStat(d)),
        h('td', { class: 'num' }, String(d.year ?? '')),
        h('td', { class: 'num' }, money(o.price)),
        h('td', null, btn),
      );
      setTip(tr, `<div class="tt-title">${escapeHTML(d.name)}</div>${escapeHTML(CATEGORY_NAMES[d.category])} · ${escapeHTML(s.name)}<br>Relations: ${escapeHTML(relLabel(rel))} · price markup ×${o.markup.toFixed(2)}<br>Base cost ${fmtMillions(d.cost)}`);
      tr.addEventListener('click', () => { sel = o; renderTable(); });
      tb.appendChild(tr);
    }
    tbl.appendChild(tb);
    tableHost.appendChild(tbl);
    renderDetail();
  };

  const totalLbl = h('span', { class: 'sc-dim' });
  const renderDetailTotals = () => {
    if (!sel) return;
    setText(totalLbl, `Total ${money(sel.price * nQty())}`);
  };
  const renderDetail = () => {
    clear(detail);
    const d = sel ? ctx.state.designs.get(sel.designId) : undefined;
    if (!sel || !d) {
      detail.appendChild(h('div', { class: 'sc-empty' }, 'Select an offer to view the full specifications.'));
      return;
    }
    const s = ctx.state.nations[sel.seller];
    const o = sel;
    const buyBtn = h('button', { class: 'sc-btn primary' }, h('span', { html: icon('coins') }), 'Buy');
    buyBtn.addEventListener('click', () => buy(o, nQty()));
    const licBtn = h('button', { class: 'sc-btn' }, h('span', { html: icon('factory') }), 'Licence');
    const own = ctx.me.ownDesigns?.has(d.id) ?? false;
    const fee = (d.cost / 1000) * 12 * o.markup;
    licBtn.disabled = own;
    setTip(licBtn, own ? 'You already produce this design.' : `Buy a production licence for ${money(fee)} — build it domestically from then on.`);
    licBtn.addEventListener('click', () => {
      const ok = ctx.run(game.licenseDesign(ctx.player, o.seller, o.designId), `Licence acquired: ${d.name}`);
      if (ok) { offersDirty = true; update(true); }
    });
    detail.append(
      designSheet(ctx, d),
      h('div', { class: 'sc-row', style: 'margin-top:8px;gap:6px' }, h('span', { class: 'sc-dim' }, 'Seller'), flagImg(s.flag, 11), h('b', null, s.name),
        h('span', { class: 'sc-dim' }, `· ${money(o.price)} each (×${o.markup.toFixed(2)})`)),
      h('div', { class: 'sc-row', style: 'margin-top:6px;gap:6px' }, h('span', { class: 'sc-dim' }, 'Qty'), qty, totalLbl, h('span', { class: 'sc-grow' }), licBtn, buyBtn),
    );
    renderDetailTotals();
  };

  const el = h('div', null,
    h('div', { class: 'sc-dim', style: 'font-size:10.5px;margin-bottom:5px' }, 'Buy equipment from any friendly or neutral nation. The seller is paid at once and the units appear instantly with full strength.'),
    clsChips,
    h('div', { class: 'sc-row', style: 'gap:4px;margin-bottom:4px' }, catSel, sellerSel),
    h('div', { class: 'sc-row', style: 'gap:4px' }, searchIn, h('span', { class: 'sc-dim' }, 'Qty'), qty),
    info, tableHost, detail,
  );

  function update(force: boolean): void {
    const hr = ctx.state.hour;
    if (force || offersDirty || hr - offersHour >= 24) {
      offers = game.armsMarket(ctx.player);
      offersHour = hr;
      offersDirty = false;
      if (sel && !offers.some((o) => sel!.seller === o.seller && sel!.designId === o.designId)) sel = null;
      renderFilters();
      renderTable();
    } else {
      updateInfo();
    }
  }
  return { el, update };
}

// ---------------------------------------------------------------------------
// Sell units dialog
// ---------------------------------------------------------------------------
export function openSellDialog(ctx: Ctx, unitIds: number[]): void {
  const { game, state } = ctx;
  const ids = unitIds.filter((id) => state.units.get(id)?.nation === ctx.player);
  if (!ids.length) return;
  const fair = game.unitsValue(ids);
  const nations = state.nations.filter((n) => n.alive && n.id !== ctx.player && !game.atWar(ctx.player, n.id))
    .sort((a, b) => game.relation(ctx.player, b.id) - game.relation(ctx.player, a.id));
  if (!nations.length) return;
  const sel = h('select', { class: 'sc-select', style: 'width:100%' }) as HTMLSelectElement;
  for (const n of nations) sel.appendChild(h('option', { value: String(n.id) }, `${n.name} — ${relLabel(game.relation(ctx.player, n.id))}`));
  const price = h('input', { class: 'sc-input num', type: 'number', min: '0', step: '0.05', value: fair.toFixed(2), style: 'width:90px' }) as HTMLInputElement;
  price.addEventListener('keydown', (e) => e.stopPropagation());
  const names = ids.slice(0, 6).map((id) => state.units.get(id)!).map((u) => `${u.name} (${state.designs.get(u.design)?.name ?? ''})`);
  const hint = h('div', { class: 'sc-dim', style: 'font-size:10.5px;margin-top:4px' });
  const upd = () => {
    const n = state.nations[Number(sel.value)];
    setText(hint, n ? `${n.name} treasury: ${money(Math.max(0, n.treasury))}. Fair value ≈ ${money(fair)}. Units transfer instantly to their capital, airbases and ports.` : '');
  };
  sel.addEventListener('change', upd);
  upd();
  dialog({
    title: `Sell ${ids.length} unit${ids.length > 1 ? 's' : ''}`,
    titleIcon: 'handshake',
    width: 400,
    body: h('div', null,
      h('div', { class: 'sc-dim', style: 'margin-bottom:6px;font-size:11px' }, names.join(', ') + (ids.length > 6 ? ` … +${ids.length - 6}` : '')),
      h('div', { class: 'sc-row', style: 'gap:6px;margin-bottom:6px' }, h('span', { class: 'sc-dim', style: 'width:60px' }, 'Buyer'), sel),
      h('div', { class: 'sc-row', style: 'gap:6px' }, h('span', { class: 'sc-dim', style: 'width:60px' }, 'Price ($B)'), price, h('span', { class: 'sc-dim' }, '0 = gift (improves relations)')),
      hint),
    buttons: [
      {
        label: 'Sell', kind: 'primary', icon: 'coins',
        action: () => {
          const buyer = Number(sel.value);
          const p = Math.max(0, Number(price.value) || 0);
          const ok = ctx.run(game.sellUnits(ctx.player, buyer, ids, p), `Sold to ${state.nations[buyer].name}${p > 0 ? ` for ${money(p)}` : ''}`);
          if (!ok) return false;
          ctx.select([]);
          return undefined;
        },
      },
      { label: 'Cancel' },
    ],
  });
}
