/**
 * Top bar (nation, clock & speed, key stats, DEFCON, news, menu) and the
 * resource ticker below it.
 */
import { h, setText, setClass, setTip, fmtMoney, fmtCompact, fmtSigned, fmtPct, signClass, escapeHTML, fmtPop } from '../dom';
import { icon, resourceIcon, RESOURCE_UNITS } from '../icons';
import { flagImg } from '../widgets';
import { dropdown } from '../dialogs';
import { RESOURCE_COUNT, RESOURCE_NAMES, formatDate, hourToDate } from '../../sim/types';
import { DEFCON_TEXT, type Ctx } from './context';

export interface TopBar {
  el: HTMLElement;
  ticker: HTMLElement;
  update(dt: number): void;
  setUnread(n: number): void;
}

const SPEED_LABEL = ['Paused', 'Slowest (1 h/s)', 'Slow (3 h/s)', 'Normal (6 h/s)', 'Fast (12 h/s)', 'Fastest (1 day/s)'];

export function createTopBar(ctx: Ctx, onNews: () => void, onMenu: () => void): TopBar {
  const { game } = ctx;
  const me = () => ctx.me;
  let lastSpeed = 1;

  // nation
  const flagSlot = h('span');
  const nm = h('div', { class: 'nm' });
  const ld = h('div', { class: 'ld' });
  const nation = h('div', { class: 'sc-tb-sec sc-tb-nation', tip: 'Open country overview (F1)' }, flagSlot, h('div', null, nm, ld));
  nation.addEventListener('click', () => ctx.openTab('overview'));

  // clock & speed
  const lcd = h('div', { class: 'sc-lcd' });
  setTip(lcd, () => {
    const d = hourToDate(game.state.hour);
    const days = Math.floor(game.state.hour / 24);
    return `<div class="tt-title">${d.toUTCString().slice(0, 16)}</div>Day ${days + 1} of the campaign`;
  });
  const pauseBtn = h('button', { class: 'sc-btn', html: icon('pause') });
  setTip(pauseBtn, '<b>Pause / resume</b><span class="tt-key">Space</span>');
  pauseBtn.addEventListener('click', () => togglePause());
  const pips: HTMLElement[] = [];
  const speedWrap = h('div', { class: 'sc-speed' }, pauseBtn);
  for (let s = 1; s <= 5; s++) {
    const p = h('button', { class: 'sc-btn pip', html: '<i></i>' });
    setTip(p, `<b>Speed ${s}</b> — ${SPEED_LABEL[s]}<span class="tt-key">${s}</span>`);
    p.addEventListener('click', () => setSpeed(s));
    pips.push(p);
    speedWrap.appendChild(p);
  }
  const pausedLbl = h('span', { class: 'sc-amber sc-bold sc-blink', style: 'font-size:10px;letter-spacing:.18em;width:52px' }, 'PAUSED');
  const clock = h('div', { class: 'sc-tb-sec' }, lcd, speedWrap, pausedLbl);

  // stats
  const stat = (ico: Parameters<typeof icon>[0], label: string, tip: () => string, click?: () => void) => {
    const val = h('div', { class: 'val' });
    const el = h('div', { class: 'sc-stat' }, h('span', { html: icon(ico) }), h('div', null, h('div', { class: 'lbl' }, label), val));
    setTip(el, tip);
    if (click) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', click);
    }
    return { el, val };
  };
  const daily = () => {
    const n = me();
    let inc = 0, exp = 0;
    for (const k in n.income) inc += n.income[k];
    for (const k in n.expenses) exp += n.expenses[k];
    return { inc, exp, net: inc - exp };
  };
  const treasury = stat('dollar', 'Treasury', () => {
    const n = me();
    const d = daily();
    return `<div class="tt-title">Treasury</div><div class="tt-row"><span>Cash reserves</span><b>${fmtMoney(n.treasury, 2)}</b></div>` +
      `<div class="tt-row"><span>Income / day</span><span class="pos">${fmtMoney(d.inc, 2)}</span></div><div class="tt-row"><span>Expenses / day</span><span class="neg">${fmtMoney(d.exp, 2)}</span></div>` +
      `<div class="tt-row"><span>Balance / day</span><b class="${signClass(d.net)}">${fmtSigned(d.net, (v) => fmtMoney(v, 2))}</b></div><div class="tt-sep"></div>` +
      `<div class="tt-row"><span>National debt</span><span>${fmtMoney(n.debt)}</span></div><div class="tt-sep"></div><span class="sc-dim">Click to open Finance (F8)</span>`;
  }, () => ctx.openTab('finance'));
  const gdp = stat('chart', 'GDP', () => {
    const n = me();
    return `<div class="tt-title">Gross Domestic Product</div><div class="tt-row"><span>Annual GDP</span><b>${fmtMoney(n.gdp)}</b></div>` +
      `<div class="tt-row"><span>Growth (annual)</span><span class="${signClass(n.gdpGrowth)}">${fmtSigned(n.gdpGrowth * 100, (v) => v.toFixed(2))}%</span></div>` +
      `<div class="tt-row"><span>Per capita</span><span>$${Math.round((n.gdp * 1e3) / Math.max(0.001, n.population)).toLocaleString('en-US')}</span></div>` +
      `<div class="tt-row"><span>Population</span><span>${fmtPop(n.population)}</span></div>`;
  }, () => ctx.openTab('overview'));
  const approval = stat('person', 'Approval', () => {
    const n = me();
    return `<div class="tt-title">Domestic Approval</div><div class="tt-row"><span>Approval rating</span><b>${n.approval.toFixed(1)}%</b></div>` +
      `<div class="tt-row"><span>Unemployment</span><span>${fmtPct(n.unemployment)}</span></div><div class="tt-row"><span>Inflation</span><span>${fmtPct(n.inflation)}</span></div>` +
      `<div class="tt-row"><span>War weariness</span><span>${n.warWeariness.toFixed(0)}</span></div>` +
      (n.approval < 30 ? '<div class="tt-sep"></div><span class="neg">Low approval risks unrest and loss of power.</span>' : '');
  }, () => ctx.openTab('cabinet'));
  const power = stat('tank', 'Mil. Power', () => {
    const n = me();
    return `<div class="tt-title">Military Strength</div><div class="tt-row"><span>Power index</span><b>${fmtCompact(game.militaryPower(n.id))}</b></div>` +
      `<div class="tt-row"><span>World rank</span><span>#${rankCache.rank}</span></div><div class="tt-row"><span>Military budget</span><span>${fmtPct(n.militaryBudget)} of GDP</span></div>`;
  }, () => ctx.openTab('military'));
  const defN = h('div', { class: 'n' });
  const defcon = h('div', { class: 'sc-defcon d5' }, h('div', { class: 't' }, 'DEFCON'), defN);
  setTip(defcon, () => `<div class="tt-title">DEFCON ${me().defcon}</div>${DEFCON_TEXT[me().defcon] ?? ''}<div class="tt-sep"></div><span class="sc-dim">Click to change readiness level</span>`);
  defcon.addEventListener('click', () => {
    dropdown(defcon, [5, 4, 3, 2, 1].map((lvl) => ({
      label: `DEFCON ${lvl} — ${DEFCON_TEXT[lvl].split(' — ')[0]}`,
      on: me().defcon === lvl,
      icon: `<span class="sc-defcon d${lvl}" style="width:18px;height:14px;display:inline-flex;animation:none"><span class="n" style="font-size:10px">${lvl}</span></span>`,
      action: () => ctx.run(game.setDefcon(me().id, lvl), `DEFCON ${lvl} declared`),
    })));
  });
  const stats = h('div', { class: 'sc-tb-sec', style: 'gap:16px' }, treasury.el, gdp.el, approval.el, power.el, defcon);

  // right side
  const badge = h('span', { class: 'sc-badge sc-hidden' });
  const newsBtn = h('button', { class: 'sc-btn sc-ibtn sc-rel-btn', html: icon('news') }, badge);
  setTip(newsBtn, '<b>News archive</b> — unread messages');
  newsBtn.addEventListener('click', onNews);
  const worldBtn = h('button', { class: 'sc-btn sc-ibtn', html: icon('globe'), tip: '<b>World overview</b> (F9)' });
  worldBtn.addEventListener('click', () => ctx.openTab('world'));
  const menuBtn = h('button', { class: 'sc-btn sc-ibtn', html: icon('menu'), tip: '<b>Game menu</b><span class="tt-key">Esc</span>' });
  menuBtn.addEventListener('click', onMenu);
  const right = h('div', { class: 'sc-tb-sec sc-tb-right' }, newsBtn, worldBtn, menuBtn);

  const el = h('div', { class: 'sc-topbar' }, nation, clock, stats, right);

  // resource ticker
  const ticker = h('div', { class: 'sc-restick' });
  const resEls: { el: HTMLElement; st: HTMLElement; nt: HTMLElement }[] = [];
  for (let r = 0; r < RESOURCE_COUNT; r++) {
    const st = h('span', { class: 'st' });
    const nt = h('span', { class: 'nt' });
    const e = h('div', { class: 'sc-res' }, h('span', { html: resourceIcon(r) }), h('div', { class: 'c' }, st, nt));
    setTip(e, () => {
      const n = me();
      const prod = n.production[r], cons = n.consumption[r], net = prod - cons + (n.traded?.[r] ?? 0);
      const days = cons > prod ? n.stock[r] / Math.max(1e-6, cons - prod) : Infinity;
      const price = game.state.market.price[r];
      return `<div class="tt-title">${resourceIcon(r)} ${RESOURCE_NAMES[r]}</div>` +
        `<div class="tt-row"><span>Stockpile</span><b>${fmtCompact(n.stock[r])} ${RESOURCE_UNITS[r]}</b></div>` +
        `<div class="tt-row"><span>Production / day</span><span>${fmtCompact(prod)}</span></div>` +
        `<div class="tt-row"><span>Consumption / day</span><span>${fmtCompact(cons)}</span></div>` +
        `<div class="tt-row"><span>Market trade / day</span><span class="${signClass(n.traded?.[r] ?? 0)}">${fmtSigned(n.traded?.[r] ?? 0)}</span></div>` +
        `<div class="tt-row"><span>Net / day</span><b class="${signClass(net)}">${fmtSigned(net)}</b></div>` +
        `<div class="tt-row"><span>Days of supply</span><span>${isFinite(days) ? Math.floor(days) : '∞'}</span></div>` +
        `<div class="tt-row"><span>World price</span><span>${fmtMoney(price / 1000, 2)} / unit</span></div>` +
        `<div class="tt-row"><span>Trade policy</span><span class="sc-amber">${escapeHTML((n.tradePolicy[r] ?? 'auto').toUpperCase())}</span></div>` +
        `<div class="tt-sep"></div><span class="sc-dim">Click to open Production &amp; Trade</span>`;
    });
    e.addEventListener('click', () => ctx.openTab('trade', { resource: r }));
    ticker.appendChild(e);
    resEls.push({ el: e, st, nt });
  }

  const togglePause = () => {
    if (game.state.speed > 0) {
      lastSpeed = game.state.speed;
      game.setSpeed(0);
    } else game.setSpeed(lastSpeed || 3);
  };
  const setSpeed = (s: number) => {
    game.setSpeed(s);
    lastSpeed = s;
  };

  const rankCache = { rank: 0, t: 0 };
  let flagFor = -1;
  let tickT = 0;
  return {
    el,
    ticker,
    setUnread(n: number) {
      setText(badge, n > 99 ? '99+' : String(n));
      setClass(badge, 'sc-hidden', n <= 0);
    },
    update(dt: number) {
      const n = me();
      if (!n) return;
      if (flagFor !== n.id) {
        flagFor = n.id;
        flagSlot.replaceChildren(flagImg(n.flag, 26));
      }
      setText(nm, n.name);
      setText(ld, `${n.leaderTitle} ${n.leaderName}`);
      const st = game.state;
      setText(lcd, formatDate(st.hour));
      const sp = st.speed;
      setClass(pauseBtn, 'on', sp === 0);
      pips.forEach((p, i) => setClass(p, 'on', i < sp));
      setClass(pausedLbl, 'sc-hidden', sp !== 0);
      tickT -= dt;
      if (tickT > 0) return;
      tickT = 0.2;
      const d = daily();
      treasury.val.innerHTML = `${fmtMoney(n.treasury)}<small class="${signClass(d.net)}">${fmtSigned(d.net, (v) => fmtMoney(v, 2))}/d</small>`;
      gdp.val.innerHTML = `${fmtMoney(n.gdp)}<small class="${signClass(n.gdpGrowth)}">${fmtSigned(n.gdpGrowth * 100, (v) => v.toFixed(1))}%</small>`;
      approval.val.innerHTML = `<span class="${n.approval < 35 ? 'neg' : n.approval > 60 ? 'pos' : ''}">${n.approval.toFixed(0)}%</span>`;
      rankCache.t -= 0.2;
      if (rankCache.t <= 0) {
        rankCache.t = 3;
        const mine = game.militaryPower(n.id);
        let rank = 1;
        for (const o of st.nations) if (o.alive && o.id !== n.id && game.militaryPower(o.id) > mine) rank++;
        rankCache.rank = rank;
      }
      setText(power.val, `#${rankCache.rank}`);
      setText(defN, String(n.defcon));
      defcon.className = 'sc-defcon d' + Math.max(1, Math.min(5, n.defcon));
      for (let r = 0; r < RESOURCE_COUNT; r++) {
        const e = resEls[r];
        const net = n.production[r] - n.consumption[r] + (n.traded?.[r] ?? 0);
        setText(e.st, fmtCompact(n.stock[r]));
        const txt = fmtSigned(net);
        setText(e.nt, txt);
        const cls = 'nt ' + signClass(net, Math.max(1e-6, n.consumption[r] * 0.002));
        if (e.nt.className !== cls) e.nt.className = cls;
        const days = net < 0 ? n.stock[r] / -net : Infinity;
        setClass(e.el, 'short', days < 30);
      }
    },
  };
}
