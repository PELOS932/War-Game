/**
 * Overview tab: country summary, key indicators, wars and history charts.
 */
import { h, setText, setHTML, fmtMoney, fmtPop, fmtPct, fmtSigned, signClass, creditGrade, fmtCompact, escapeHTML, fmtNum } from '../../dom';
import { flagImg, flagHTML, bar, sparklineSVG, relColor } from '../../widgets';
import { GOVERNMENT_NAMES } from '../../../worldgen/types';
import { DEFCON_TEXT, type Ctx } from '../context';
import type { TabView } from '../panel';

export function overviewTab(ctx: Ctx): TabView {
  const { game } = ctx;
  const el = h('div');
  const flagSlot = h('div');
  const n1 = h('div', { class: 'n1' });
  const n2 = h('div', { class: 'n2' });
  const n3 = h('div', { class: 'n2' });
  const head = h('div', { class: 'sc-ov-head sc-inset' }, flagSlot, h('div', { class: 'sc-grow' }, n1, n2, n3));

  const card = (label: string) => {
    const v = h('div', { class: 'v' });
    const s = h('div', { class: 's' });
    const e = h('div', { class: 'sc-statcard sc-inset' }, h('div', { class: 'l' }, label), v, s);
    return { e, v, s };
  };
  const cGdp = card('GDP');
  const cTre = card('Treasury');
  const cApp = card('Approval');
  const cards = h('div', { class: 'sc-grid3', style: 'margin-top:6px' }, cGdp.e, cTre.e, cApp.e);

  const kv = () => h('div', { class: 'sc-kv' });
  const row = (grid: HTMLElement, k: string, tip?: string) => {
    const kEl = h('div', { class: 'k' }, k);
    const vEl = h('div', { class: 'v' });
    if (tip) kEl.title = tip;
    grid.append(kEl, vEl);
    return vEl;
  };
  const eco = kv();
  const vGdp = row(eco, 'Gross domestic product');
  const vGrowth = row(eco, 'Growth (annual)');
  const vPc = row(eco, 'GDP per capita');
  const vTreasury = row(eco, 'Treasury');
  const vBalance = row(eco, 'Daily balance');
  const vDebt = row(eco, 'National debt');
  const vCredit = row(eco, 'Credit rating');
  const vInfl = row(eco, 'Inflation');
  const vUnemp = row(eco, 'Unemployment');

  const soc = kv();
  const vPop = row(soc, 'Population');
  const appBar = bar('auto', true);
  const vApp = row(soc, 'Approval');
  vApp.appendChild(appBar.el);
  const vLit = row(soc, 'Literacy');
  const opBar = bar('blue', true);
  const vOp = row(soc, 'World opinion');
  vOp.appendChild(opBar.el);
  const vGov = row(soc, 'Government');
  const vWW = row(soc, 'War weariness');

  const mil = kv();
  const vPower = row(mil, 'Military power');
  const vUnits = row(mil, 'Units in service');
  const vDef = row(mil, 'DEFCON');
  const vNuke = row(mil, 'Strategic weapons');
  const vTech = row(mil, 'Technology level');

  const wars = h('div');
  const charts = h('div', { class: 'sc-grid2' });
  const chart = (label: string) => {
    const val = h('b');
    const svg = h('div');
    const box = h('div', { class: 'sc-sparkbox sc-inset' }, h('div', { class: 't' }, h('span', null, label), val), svg);
    charts.appendChild(box);
    return { val, svg };
  };
  const chGdp = chart('GDP');
  const chTre = chart('Treasury');
  const chApp = chart('Approval');
  const chMil = chart('Military');

  el.append(
    head, cards,
    h('div', { class: 'sc-sechead' }, 'Economy'), eco,
    h('div', { class: 'sc-sechead' }, 'Society'), soc,
    h('div', { class: 'sc-sechead' }, 'Defense'), mil,
    h('div', { class: 'sc-sechead' }, 'Active Conflicts'), wars,
    h('div', { class: 'sc-sechead' }, 'History', h('span', { class: 'sc-grow' }), h('span', { class: 'sc-dim' }, 'recent months')), charts,
  );

  let flagFor = -1;
  let histLen = -1;
  let rankT = 0;
  let rank = 0;
  return {
    id: 'overview', title: 'Country Overview', icon: 'overview', tip: 'National summary, indicators and history charts', el,
    update() {
      const n = ctx.me;
      if (!n) return;
      if (flagFor !== n.id) {
        flagFor = n.id;
        flagSlot.replaceChildren(flagImg(n.flag, 40));
      }
      setText(n1, n.name);
      setText(n2, n.formalName);
      setText(n3, `${n.leaderTitle} ${n.leaderName} · ${GOVERNMENT_NAMES[n.government]}`);
      let inc = 0, exp = 0;
      for (const k in n.income) inc += n.income[k];
      for (const k in n.expenses) exp += n.expenses[k];
      const net = inc - exp;
      setText(cGdp.v, fmtMoney(n.gdp));
      setHTML(cGdp.s, `<span class="${signClass(n.gdpGrowth)}">${fmtSigned(n.gdpGrowth * 100, (v) => v.toFixed(2))}% / yr</span>`);
      setText(cTre.v, fmtMoney(n.treasury));
      setHTML(cTre.s, `<span class="${signClass(net)}">${fmtSigned(net, (v) => fmtMoney(v, 2))} / day</span>`);
      setHTML(cApp.v, `<span class="${n.approval < 35 ? 'neg' : n.approval > 60 ? 'pos' : ''}">${n.approval.toFixed(1)}%</span>`);
      setText(cApp.s, n.approval > 65 ? 'Popular' : n.approval > 45 ? 'Stable' : n.approval > 30 ? 'Discontent' : 'Unrest');

      setText(vGdp, fmtMoney(n.gdp) + ' / yr');
      setHTML(vGrowth, `<span class="${signClass(n.gdpGrowth)}">${fmtSigned(n.gdpGrowth * 100, (v) => v.toFixed(2))}%</span>`);
      setText(vPc, '$' + fmtNum((n.gdp * 1e3) / Math.max(0.001, n.population)));
      setText(vTreasury, fmtMoney(n.treasury, 2));
      setHTML(vBalance, `<span class="${signClass(net)}">${fmtSigned(net, (v) => fmtMoney(v, 2))}</span>`);
      setText(vDebt, `${fmtMoney(n.debt)} (${((n.debt / Math.max(1, n.gdp)) * 100).toFixed(0)}% GDP)`);
      setHTML(vCredit, `<span class="${n.creditRating > 60 ? 'pos' : n.creditRating < 35 ? 'neg' : 'warn'}">${creditGrade(n.creditRating)}</span> <span class="sc-dim">(${n.creditRating.toFixed(0)})</span>`);
      setHTML(vInfl, `<span class="${n.inflation > 0.06 ? 'neg' : ''}">${fmtPct(n.inflation)}</span>`);
      setHTML(vUnemp, `<span class="${n.unemployment > 0.1 ? 'neg' : ''}">${fmtPct(n.unemployment)}</span>`);

      setText(vPop, fmtPop(n.population));
      appBar.set(n.approval / 100, n.approval.toFixed(0) + '%');
      setText(vLit, fmtPct(n.literacy, 0));
      opBar.set(n.worldOpinion / 100, n.worldOpinion.toFixed(0));
      setText(vGov, GOVERNMENT_NAMES[n.government]);
      setHTML(vWW, `<span class="${n.warWeariness > 50 ? 'neg' : ''}">${n.warWeariness.toFixed(0)} / 100</span>`);

      rankT -= 1;
      const myPower = game.militaryPower(n.id);
      if (rankT <= 0) {
        rankT = 12;
        rank = 1;
        for (const o of game.state.nations) if (o.alive && o.id !== n.id && game.militaryPower(o.id) > myPower) rank++;
      }
      setText(vPower, `${fmtCompact(myPower)}  (rank #${rank})`);
      let cnt = 0;
      for (const u of game.state.units.values()) if (u.nation === n.id) cnt++;
      setText(vUnits, fmtNum(cnt));
      setHTML(vDef, `<b>${n.defcon}</b> <span class="sc-dim">${escapeHTML((DEFCON_TEXT[n.defcon] ?? '').split(' — ')[0])}</span>`);
      setHTML(vNuke, n.nuclear ? '<span class="warn">☢ Nuclear power</span>' : '<span class="sc-dim">None</span>');
      setText(vTech, fmtPct(n.techLevel, 0));

      const myWars = game.state.wars.filter((w) => w.attackers.includes(n.id) || w.defenders.includes(n.id));
      if (!myWars.length) setHTML(wars, '<div class="sc-dim" style="padding:2px 6px">The nation is at peace.</div>');
      else {
        setHTML(wars, myWars.map((w) => {
          const att = w.attackers.includes(n.id);
          const enemies = att ? w.defenders : w.attackers;
          const score = att ? w.score : -w.score;
          const flags = enemies.map((e) => flagHTML(game.state.nations[e]?.flag, 12)).join(' ');
          const names = enemies.map((e) => escapeHTML(game.state.nations[e]?.name ?? '?')).join(', ');
          return `<div class="sc-row" style="padding:2px 6px;gap:6px"><span class="neg">⚔</span>${flags}<span class="sc-grow sc-nowrap">${escapeHTML(w.name)} — vs ${names}</span>` +
            `<b style="color:${relColor(score)}">${score > 0 ? '+' : ''}${score.toFixed(0)}</b></div>`;
        }).join(''));
      }

      if (n.history.length !== histLen) {
        histLen = n.history.length;
        const hist = n.history;
        chGdp.svg.innerHTML = sparklineSVG(hist.map((p) => p.gdp), '#7cdc5e');
        chTre.svg.innerHTML = sparklineSVG(hist.map((p) => p.treasury), '#f0a830');
        chApp.svg.innerHTML = sparklineSVG(hist.map((p) => p.approval), '#69b4e6');
        chMil.svg.innerHTML = sparklineSVG(hist.map((p) => p.military), '#ff7a5a');
      }
      const last = n.history[n.history.length - 1];
      setText(chGdp.val, fmtMoney(n.gdp));
      setText(chTre.val, fmtMoney(n.treasury));
      setText(chApp.val, n.approval.toFixed(0) + '%');
      setText(chMil.val, last ? fmtCompact(last.military) : '—');
    },
  };
}
