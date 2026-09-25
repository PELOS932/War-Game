/**
 * Production & Trade tab: the 11 resources with production, consumption,
 * stock, days of supply, world price, trade policy and manual market trades.
 */
import { h, setText, setHTML, setClass, fmtCompact, fmtSigned, signClass, fmtMoney, clear, setTip } from '../../dom';
import { resourceIcon, RESOURCE_UNITS, facilityIcon, icon } from '../../icons';
import { RESOURCE_COUNT, RESOURCE_NAMES, type TradePolicy } from '../../../sim/types';
import type { Ctx } from '../context';
import type { TabView } from '../panel';

const POLICIES: { id: TradePolicy; label: string; tip: string }[] = [
  { id: 'auto', label: 'Auto', tip: 'Ministers buy shortfalls and sell surpluses automatically.' },
  { id: 'buy', label: 'Buy', tip: 'Actively buy on the world market to build up stock.' },
  { id: 'sell', label: 'Sell', tip: 'Actively sell to the world market.' },
  { id: 'hold', label: 'Hold', tip: 'Do not trade this resource.' },
];

export function tradeTab(ctx: Ctx): TabView {
  const { game } = ctx;
  let selRes = -1;
  const tbody = h('tbody');
  const table = h('table', { class: 'sc-table sc-trade-table' },
    h('thead', null, h('tr', null,
      h('th', null, 'Resource'), h('th', { class: 'num' }, 'Prod'), h('th', { class: 'num' }, 'Use'), h('th', { class: 'num' }, 'Net'),
      h('th', { class: 'num' }, 'Stock'), h('th', { class: 'num' }, 'Days'), h('th', { class: 'num' }, 'Price'), h('th', null, 'Policy'))),
    tbody);

  interface Row { tr: HTMLTableRowElement; prod: HTMLElement; cons: HTMLElement; net: HTMLElement; stock: HTMLElement; days: HTMLElement; price: HTMLElement; pol: HTMLSelectElement }
  const rows: Row[] = [];
  const sub = h('tr', { class: 'sc-trade-sub' });
  const subCell = h('td', { colSpan: 8 });
  sub.appendChild(subCell);

  for (let r = 0; r < RESOURCE_COUNT; r++) {
    const prod = h('td', { class: 'num' });
    const cons = h('td', { class: 'num' });
    const net = h('td', { class: 'num' });
    const stock = h('td', { class: 'num' });
    const days = h('td', { class: 'num' });
    const price = h('td', { class: 'num' });
    const pol = h('select', { class: 'sc-select' }, ...POLICIES.map((p) => h('option', { value: p.id }, p.label))) as HTMLSelectElement;
    pol.addEventListener('click', (e) => e.stopPropagation());
    pol.addEventListener('change', () => ctx.run(game.setTradePolicy(ctx.player, r, pol.value as TradePolicy), `${RESOURCE_NAMES[r]}: ${pol.value.toUpperCase()}`));
    setTip(pol, POLICIES.map((p) => `<b>${p.label}</b> — ${p.tip}`).join('<br>'));
    const nameCell = h('td', null, h('div', { class: 'sc-row', style: 'gap:5px' }, h('span', { html: resourceIcon(r) }), h('span', null, RESOURCE_NAMES[r])));
    const tr = h('tr', { class: 'clickable' }, nameCell, prod, cons, net, stock, days, price, h('td', null, pol));
    tr.addEventListener('click', () => {
      selRes = selRes === r ? -1 : r;
      renderSub();
    });
    tbody.appendChild(tr);
    rows.push({ tr, prod, cons, net, stock, days, price, pol });
  }

  const amount = h('input', { class: 'sc-input num', type: 'number', min: '1', value: '100', style: 'width:80px' }) as HTMLInputElement;
  amount.addEventListener('keydown', (e) => e.stopPropagation());
  const costLbl = h('span', { class: 'sc-dim' });
  const subInfo = h('div', { class: 'sc-kv2', style: 'margin-bottom:6px' });
  const facList = h('div', { class: 'sc-row sc-wrap', style: 'gap:4px;margin-top:4px' });
  const buyBtn = h('button', { class: 'sc-btn primary' }, h('span', { html: icon('plus') }), 'Buy');
  const sellBtn = h('button', { class: 'sc-btn' }, h('span', { html: icon('minus') }), 'Sell');
  buyBtn.addEventListener('click', () => trade(1));
  sellBtn.addEventListener('click', () => trade(-1));
  amount.addEventListener('input', () => updateCost());
  const trade = (sign: number) => {
    if (selRes < 0) return;
    const a = Math.max(0, Number(amount.value) || 0);
    if (!a) return;
    ctx.run(game.marketTrade(ctx.player, selRes, sign * a), `${sign > 0 ? 'Bought' : 'Sold'} ${fmtCompact(a)} ${RESOURCE_UNITS[selRes]} of ${RESOURCE_NAMES[selRes]}`);
  };
  const updateCost = () => {
    if (selRes < 0) return;
    const a = Math.max(0, Number(amount.value) || 0);
    setText(costLbl, `≈ ${fmtMoney((a * ctx.state.market.price[selRes]) / 1000, 2)}`);
  };

  const renderSub = () => {
    rows.forEach((rw, i) => setClass(rw.tr, 'sel', i === selRes));
    if (selRes < 0) {
      sub.remove();
      return;
    }
    rows[selRes].tr.after(sub);
    clear(subCell);
    subCell.append(
      subInfo,
      h('div', { class: 'sc-row' }, h('span', { class: 'sc-dim' }, 'Market order'), amount, h('span', { class: 'sc-dim' }, RESOURCE_UNITS[selRes]), costLbl, h('span', { class: 'sc-grow' }), buyBtn, sellBtn),
      h('div', { class: 'sc-dim', style: 'margin-top:6px;font-size:10.5px' }, 'Facilities producing this resource:'),
      facList,
    );
    updateSub();
  };

  const updateSub = () => {
    if (selRes < 0) return;
    const n = ctx.me;
    const m = ctx.state.market;
    const r = selRes;
    const dem = (n as { demand?: Float64Array }).demand?.[r];
    const sat = (n as { satisfaction?: Float64Array }).satisfaction?.[r];
    setHTML(subInfo,
      `<div class="k">World price</div><div class="v">${fmtMoney(m.price[r] / 1000, 3)}</div>` +
      `<div class="k">Base price</div><div class="v">${fmtMoney(m.basePrice[r] / 1000, 3)}</div>` +
      `<div class="k">World supply/day</div><div class="v">${fmtCompact(m.supply[r])}</div>` +
      `<div class="k">World demand/day</div><div class="v">${fmtCompact(m.demand[r])}</div>` +
      `<div class="k">Traded today</div><div class="v ${signClass(n.traded[r])}">${fmtSigned(n.traded[r])}</div>` +
      (dem !== undefined ? `<div class="k">Our demand/day</div><div class="v">${fmtCompact(dem)}</div>` : '') +
      (sat !== undefined ? `<div class="k">Demand met</div><div class="v ${sat < 0.9 ? 'neg' : 'pos'}">${(sat * 100).toFixed(0)}%</div>` : ''));
    updateCost();
    const counts = new Map<number, number>();
    for (const f of ctx.state.facilities.values()) {
      const def = ctx.state.facilityDefs[f.type];
      if (def?.produces === r && ctx.state.hexOwner[f.hex] === ctx.player + 1) counts.set(f.type, (counts.get(f.type) ?? 0) + f.level);
    }
    const html = [...counts.entries()].map(([t, lv]) => `<span class="sc-tag" style="display:inline-flex;align-items:center;gap:3px;height:18px">${facilityIcon(t)} ${ctx.state.facilityDefs[t].name} ×${lv}</span>`).join('') || '<span class="sc-dimmer">None</span>';
    setHTML(facList, html);
  };

  const summary = h('div', { class: 'sc-kv2', style: 'margin:2px 2px 6px' });
  const el = h('div', null,
    summary,
    h('div', { class: 'sc-sechead' }, 'Resources', h('span', { class: 'sc-grow' }), h('span', { class: 'sc-dim' }, 'per day · click a row to trade')),
    h('div', { class: 'sc-inset' }, table),
    h('div', { class: 'sc-dim', style: 'font-size:10.5px;margin-top:6px' }, 'Days = days of stock left at the current deficit. Trade policy applies when the Trade department is managed by your minister or set to Auto.'),
  );

  return {
    id: 'trade', title: 'Production & Trade', icon: 'factory', tip: 'Resource production, consumption, stockpiles and world market trade', el,
    show(arg) {
      const a = arg as { resource?: number } | undefined;
      if (a?.resource !== undefined) {
        selRes = a.resource;
        renderSub();
      }
    },
    update() {
      const n = ctx.me;
      const m = ctx.state.market;
      let tradeVal = 0;
      for (let r = 0; r < RESOURCE_COUNT; r++) {
        const rw = rows[r];
        const p = n.production[r], c = n.consumption[r], t = n.traded[r];
        const net = p - c + t;
        tradeVal -= (t * m.price[r]) / 1000;
        setText(rw.prod, fmtCompact(p));
        setText(rw.cons, fmtCompact(c));
        setHTML(rw.net, `<span class="${signClass(net, c * 0.002)}">${fmtSigned(net)}</span>`);
        setText(rw.stock, fmtCompact(n.stock[r]));
        const days = net < 0 ? n.stock[r] / -net : Infinity;
        setHTML(rw.days, isFinite(days) ? `<span class="${days < 30 ? 'neg' : days < 90 ? 'warn' : ''}">${days < 1000 ? Math.floor(days) : '999+'}</span>` : '<span class="sc-dimmer">∞</span>');
        const pr = m.price[r] / m.basePrice[r];
        setHTML(rw.price, `<span class="${pr > 1.1 ? 'neg' : pr < 0.9 ? 'pos' : ''}">${fmtMoney(m.price[r] / 1000, m.price[r] < 1 ? 3 : 2)}</span>`);
        const pol = n.tradePolicy[r] ?? 'auto';
        if (rw.pol.value !== pol && document.activeElement !== rw.pol) rw.pol.value = pol;
      }
      const tb = (n as { tradeBalance?: number }).tradeBalance ?? tradeVal;
      setHTML(summary,
        `<div class="k">Trade balance / day</div><div class="v ${signClass(tb)}">${fmtSigned(tb, (v) => fmtMoney(v, 2))}</div>` +
        `<div class="k">Trade department</div><div class="v">${n.autonomy.trade ? '<span class="sc-amber">Minister (AI)</span>' : 'Manual'}</div>`);
      updateSub();
    },
  };
}
