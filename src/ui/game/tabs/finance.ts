/**
 * Finance tab: taxes, social spending, military & research budgets, income /
 * expense breakdown, projected balance and bonds.
 */
import { h, setText, setHTML, fmtMoney, fmtPct, fmtSigned, signClass, creditGrade, prettyKey } from '../../dom';
import { icon } from '../../icons';
import { slider, Slider } from '../../widgets';
import { promptNumber } from '../../dialogs';
import type { Spending, Taxes } from '../../../sim/types';
import type { Ctx } from '../context';
import type { TabView } from '../panel';

const TAXES: { k: keyof Taxes; label: string; max: number; tip: string }[] = [
  { k: 'income', label: 'Income tax', max: 0.7, tip: 'Personal income tax. High rates hurt approval.' },
  { k: 'corporate', label: 'Corporate tax', max: 0.6, tip: 'Tax on company profits. High rates slow GDP growth.' },
  { k: 'sales', label: 'Sales tax', max: 0.4, tip: 'Consumption tax. Raises inflation and hurts approval.' },
];

const SPEND: { k: keyof Spending; label: string; max: number; tip: string }[] = [
  { k: 'health', label: 'Health care', max: 0.15, tip: 'Improves approval and population growth.' },
  { k: 'education', label: 'Education', max: 0.12, tip: 'Improves literacy, research and long-term growth.' },
  { k: 'infrastructure', label: 'Infrastructure', max: 0.1, tip: 'Roads, rail and utilities: improves growth and supply.' },
  { k: 'environment', label: 'Environment', max: 0.05, tip: 'Pollution control. Improves world opinion.' },
  { k: 'family', label: 'Family subsidy', max: 0.05, tip: 'Child and family support: approval and population.' },
  { k: 'lawEnforcement', label: 'Law enforcement', max: 0.05, tip: 'Police and courts: law & order, stability.' },
  { k: 'culture', label: 'Culture & sports', max: 0.03, tip: 'Arts, heritage and sports: approval.' },
  { k: 'socialAssistance', label: 'Social assistance', max: 0.15, tip: 'Pensions and welfare: approval, reduces unrest.' },
];

const INCOME_LABELS: Record<string, string> = {};
const EXPENSE_LABELS: Record<string, string> = {};

export function financeTab(ctx: Ctx): TabView {
  const { game } = ctx;
  const n0 = ctx.me;
  const sliders: { s: Slider; get: () => number }[] = [];

  const sum = h('div', { class: 'sc-grid3' });
  const card = (label: string) => {
    const v = h('div', { class: 'v' });
    const s = h('div', { class: 's' });
    sum.appendChild(h('div', { class: 'sc-statcard sc-inset' }, h('div', { class: 'l' }, label), v, s));
    return { v, s };
  };
  const cTre = card('Treasury');
  const cBal = card('Daily balance');
  const cDebt = card('Debt');

  const taxBox = h('div');
  for (const t of TAXES) {
    const s = slider({
      label: t.label, min: 0, max: t.max, step: 0.005, value: n0.taxes[t.k], format: (v) => fmtPct(v, 1), tip: t.tip,
      onChange: (v) => ctx.run(game.setTaxes(ctx.player, { [t.k]: v } as Partial<Taxes>)),
    });
    sliders.push({ s, get: () => ctx.me.taxes[t.k] });
    taxBox.appendChild(s.el);
  }
  const spendBox = h('div');
  for (const t of SPEND) {
    const s = slider({
      label: t.label, min: 0, max: t.max, step: 0.001, value: n0.spending[t.k], format: (v) => fmtPct(v, 1), tip: t.tip + ' (share of GDP)',
      onChange: (v) => ctx.run(game.setSpending(ctx.player, { [t.k]: v } as Partial<Spending>)),
    });
    sliders.push({ s, get: () => ctx.me.spending[t.k] });
    spendBox.appendChild(s.el);
  }
  const milS = slider({
    label: 'Military budget', min: 0, max: 0.15, step: 0.001, value: n0.militaryBudget, format: (v) => fmtPct(v, 1),
    tip: 'Share of GDP for the armed forces: upkeep, readiness and procurement.',
    onChange: (v) => ctx.run(game.setMilitaryBudget(ctx.player, v)),
  });
  sliders.push({ s: milS, get: () => ctx.me.militaryBudget });
  const resS = slider({
    label: 'Research budget', min: 0, max: 0.08, step: 0.001, value: n0.researchBudget, format: (v) => fmtPct(v, 1),
    tip: 'Share of GDP for research & development.',
    onChange: (v) => ctx.run(game.setResearchBudget(ctx.player, v)),
  });
  sliders.push({ s: resS, get: () => ctx.me.researchBudget });

  const incBody = h('tbody');
  const expBody = h('tbody');
  const incTable = h('table', { class: 'sc-table' }, h('thead', null, h('tr', null, h('th', null, 'Income'), h('th', { class: 'num' }, 'Per day'), h('th', { class: 'num' }, 'Per year'))), incBody);
  const expTable = h('table', { class: 'sc-table' }, h('thead', null, h('tr', null, h('th', null, 'Expenses'), h('th', { class: 'num' }, 'Per day'), h('th', { class: 'num' }, 'Per year'))), expBody);

  const proj = h('div', { class: 'sc-kv2' });
  const bondInfo = h('div', { class: 'sc-kv2', style: 'margin-bottom:6px' });
  const issueBtn = h('button', { class: 'sc-btn' }, h('span', { html: icon('plus') }), 'Issue bonds');
  const repayBtn = h('button', { class: 'sc-btn' }, h('span', { html: icon('minus') }), 'Repay debt');
  issueBtn.addEventListener('click', () => {
    const n = ctx.me;
    const max = Math.max(1, Math.round(n.gdp * 0.1));
    promptNumber('Issue Government Bonds', 'Borrow on the bond market (billions USD). Raises debt and interest payments and may lower your credit rating.',
      Math.min(10, max), 0.5, max, 0.5, (v) => `${fmtMoney(v)} → debt ${fmtMoney(n.debt + v)}`, (v) => ctx.run(game.issueBonds(ctx.player, v), `Issued ${fmtMoney(v)} in bonds`));
  });
  repayBtn.addEventListener('click', () => {
    const n = ctx.me;
    const max = Math.max(0.5, Math.floor(Math.min(n.debt, Math.max(0.5, n.treasury)) * 2) / 2);
    promptNumber('Repay National Debt', 'Pay down debt from the treasury (billions USD).', Math.min(5, max), 0.5, max, 0.5, (v) => `${fmtMoney(v)} → debt ${fmtMoney(Math.max(0, n.debt - v))}`,
      (v) => ctx.run(game.repayDebt(ctx.player, v), `Repaid ${fmtMoney(v)} of debt`));
  });

  const el = h('div', null,
    sum,
    h('div', { class: 'sc-sechead' }, 'Taxation'), taxBox,
    h('div', { class: 'sc-sechead' }, 'Social Spending', h('span', { class: 'sc-grow' }), h('span', { class: 'sc-dim' }, '% of GDP')), spendBox,
    h('div', { class: 'sc-sechead' }, 'Defense & Research'), milS.el, resS.el,
    h('div', { class: 'sc-sechead' }, 'Budget Breakdown'),
    h('div', { class: 'sc-inset' }, incTable), h('div', { class: 'sc-inset', style: 'margin-top:4px' }, expTable),
    h('div', { class: 'sc-sechead' }, 'Projection'), proj,
    h('div', { class: 'sc-sechead' }, 'Debt & Bonds'), bondInfo, h('div', { class: 'sc-row' }, issueBtn, repayBtn),
  );

  const label = (k: string, map: Record<string, string>) => map[k] ?? prettyKey(k);
  let incKeys = '';
  let expKeys = '';
  const rowsInc = new Map<string, HTMLElement[]>();
  const rowsExp = new Map<string, HTMLElement[]>();
  const fillTable = (body: HTMLElement, rec: Record<string, number>, sig: string, cur: string, rows: Map<string, HTMLElement[]>, map: Record<string, string>, cls: string): string => {
    if (sig !== cur) {
      body.replaceChildren();
      rows.clear();
      for (const k of Object.keys(rec)) {
        const a = h('td', null, label(k, map));
        const b = h('td', { class: 'num ' + cls });
        const c = h('td', { class: 'num ' + cls });
        body.appendChild(h('tr', null, a, b, c));
        rows.set(k, [b, c]);
      }
      const tb = h('td', { class: 'num ' + cls, style: 'font-weight:800' });
      const tc = h('td', { class: 'num ' + cls, style: 'font-weight:800' });
      body.appendChild(h('tr', null, h('td', { style: 'font-weight:800' }, 'Total'), tb, tc));
      rows.set('__total', [tb, tc]);
    }
    let total = 0;
    for (const [k, [b, c]] of rows) {
      if (k === '__total') continue;
      const v = rec[k] ?? 0;
      total += v;
      setText(b, fmtMoney(v, 2));
      setText(c, fmtMoney(v * 365));
    }
    const t = rows.get('__total');
    if (t) {
      setText(t[0], fmtMoney(total, 2));
      setText(t[1], fmtMoney(total * 365));
    }
    return sig;
  };

  return {
    id: 'finance', title: 'Finance & Budget', icon: 'coins', tip: 'Taxes, spending, budget breakdown and national debt', el,
    update() {
      const n = ctx.me;
      for (const { s, get } of sliders) s.set(get());
      let inc = 0, exp = 0;
      for (const k in n.income) inc += n.income[k];
      for (const k in n.expenses) exp += n.expenses[k];
      const net = inc - exp;
      setText(cTre.v, fmtMoney(n.treasury));
      setText(cTre.s, `Credit ${creditGrade(n.creditRating)}`);
      setHTML(cBal.v, `<span class="${signClass(net)}">${fmtSigned(net, (v) => fmtMoney(v, 2))}</span>`);
      setText(cBal.s, `${fmtMoney(inc, 2)} in · ${fmtMoney(exp, 2)} out`);
      setText(cDebt.v, fmtMoney(n.debt));
      setText(cDebt.s, `${((n.debt / Math.max(1, n.gdp)) * 100).toFixed(0)}% of GDP`);
      incKeys = fillTable(incBody, n.income, Object.keys(n.income).join(','), incKeys, rowsInc, INCOME_LABELS, 'pos');
      expKeys = fillTable(expBody, n.expenses, Object.keys(n.expenses).join(','), expKeys, rowsExp, EXPENSE_LABELS, 'neg');
      const months = net < 0 && n.treasury > 0 ? n.treasury / -net / 30 : Infinity;
      setHTML(proj,
        `<div class="k">Next 30 days</div><div class="v ${signClass(net)}">${fmtSigned(net * 30, (v) => fmtMoney(v))}</div>` +
        `<div class="k">Next 12 months</div><div class="v ${signClass(net)}">${fmtSigned(net * 365, (v) => fmtMoney(v))}</div>` +
        `<div class="k">Treasury in 1 yr</div><div class="v">${fmtMoney(n.treasury + net * 365)}</div>` +
        `<div class="k">Bankrupt in</div><div class="v ${isFinite(months) && months < 12 ? 'neg' : ''}">${isFinite(months) ? months.toFixed(1) + ' months' : 'Never'}</div>`);
      const rate = (n as { interestRate?: number }).interestRate;
      setHTML(bondInfo,
        `<div class="k">National debt</div><div class="v">${fmtMoney(n.debt)}</div>` +
        `<div class="k">Credit rating</div><div class="v ${n.creditRating > 60 ? 'pos' : n.creditRating < 35 ? 'neg' : 'warn'}">${creditGrade(n.creditRating)} (${n.creditRating.toFixed(0)})</div>` +
        `<div class="k">Interest rate</div><div class="v">${rate !== undefined ? fmtPct(rate, 2) : '—'}</div>` +
        `<div class="k">Debt / GDP</div><div class="v">${((n.debt / Math.max(1, n.gdp)) * 100).toFixed(1)}%</div>`);
    },
  };
}
