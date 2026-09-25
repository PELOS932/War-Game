/**
 * Research tab: budget, active research slots and the tech tree by category.
 */
import { h, append, setText, setClass, clear, fmtPct, fmtCompact, escapeHTML, prettyKey, setTip, KeyedList, fmtMoney } from '../../dom';
import { icon, IconName, natoSymbol } from '../../icons';
import { bar, slider } from '../../widgets';
import type { ResearchSlot, TechCategory, TechDef } from '../../../sim/types';
import type { Ctx } from '../context';
import type { TabView } from '../panel';

const CATS: { id: TechCategory; name: string; icon: IconName }[] = [
  { id: 'economy', name: 'Economy', icon: 'chart' },
  { id: 'industry', name: 'Industry', icon: 'factory' },
  { id: 'energy', name: 'Energy', icon: 'sun' },
  { id: 'agriculture', name: 'Agriculture', icon: 'hexes' },
  { id: 'society', name: 'Society', icon: 'people' },
  { id: 'land', name: 'Land Warfare', icon: 'tank' },
  { id: 'air', name: 'Air Warfare', icon: 'plane' },
  { id: 'naval', name: 'Naval Warfare', icon: 'anchor' },
  { id: 'missiles', name: 'Missiles', icon: 'target' },
  { id: 'cyber', name: 'Cyber & C4I', icon: 'cpu' },
];

function fmtEffect(k: string, v: number): string {
  const pct = Math.abs(v) < 2;
  const val = pct ? `${v > 0 ? '+' : ''}${(v * 100).toFixed(v * 100 % 1 ? 1 : 0)}%` : `${v > 0 ? '+' : ''}${v}`;
  return `<span class="${v >= 0 ? 'pos' : 'neg'}">${val}</span> ${escapeHTML(prettyKey(k))}`;
}

export function researchTab(ctx: Ctx): TabView {
  const { game } = ctx;
  let cat: TechCategory = 'economy';
  let selTech: string | null = null;

  const rpLbl = h('b');
  const knownLbl = h('b');
  const budget = slider({
    label: 'Research budget', min: 0, max: 0.08, step: 0.001, value: ctx.me.researchBudget,
    format: (v) => fmtPct(v, 1) + ' GDP',
    onChange: (v) => ctx.run(game.setResearchBudget(ctx.player, v)),
    tip: 'Share of GDP invested in research. Higher budgets generate more research points per day.',
  });
  budget.el.style.gridTemplateColumns = '100px 1fr 80px';
  const budgetCost = h('span', { class: 'sc-dim' });

  const slotsEl = h('div');
  const slotsEmpty = h('div', { class: 'sc-empty', style: 'padding:8px' }, 'No active research. Pick a technology below.');
  const slots = new KeyedList<ResearchSlot>(slotsEl, (s) => s.techId, (s) => {
    const nm = h('span', { class: 'sc-grow sc-nowrap' });
    const eta = h('span', { class: 'sc-dim' });
    const pb = bar('amber', true);
    const tid = s.techId;
    const cancel = h('button', { class: 'sc-btn sm', html: icon('close'), tip: 'Cancel research (progress is kept)' });
    cancel.addEventListener('click', () => ctx.run(game.cancelResearch(ctx.player, tid), 'Research cancelled'));
    const el = h('div', { class: 'sc-slot sc-inset' }, h('div', { class: 'top' }, h('span', { html: icon('flask'), class: 'sc-amber' }), nm, eta, cancel), pb.el);
    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      const t = ctx.state.techs.get(tid);
      if (t) {
        cat = t.category;
        selTech = tid;
        renderTree(true);
      }
    });
    return {
      el,
      update(sl: ResearchSlot) {
        const t = ctx.state.techs.get(sl.techId);
        setText(nm, t?.name ?? sl.techId);
        const cost = t?.cost ?? 1;
        const f = Math.min(1, sl.progress / cost);
        pb.set(f, `${fmtCompact(sl.progress)} / ${fmtCompact(cost)} RP (${(f * 100).toFixed(0)}%)`);
        const n = ctx.me;
        const rate = n.researchPoints / Math.max(1, n.researching.length);
        const days = rate > 0 ? Math.ceil((cost - sl.progress) / rate) : Infinity;
        setText(eta, isFinite(days) ? `~${days} days` : '—');
      },
    };
  });

  const catChips = h('div', { class: 'sc-chips', style: 'margin:4px 0 6px' });
  const catEls = new Map<TechCategory, HTMLElement>();
  for (const c of CATS) {
    const e = h('span', { class: 'sc-chip' + (c.id === cat ? ' on' : '') }, h('span', { html: icon(c.icon) }), c.name);
    e.addEventListener('click', () => {
      cat = c.id;
      selTech = null;
      renderTree(true);
    });
    catEls.set(c.id, e);
    catChips.appendChild(e);
  }
  const catProg = h('span', { class: 'sc-dim' });
  const tree = h('div');
  const detail = h('div', { class: 'sc-inset', style: 'padding:6px;margin-top:6px' });

  const el = h('div', null,
    h('div', { class: 'sc-kv2', style: 'margin:2px' },
      h('div', { class: 'k' }, 'Research output'), h('div', { class: 'v' }, rpLbl),
      h('div', { class: 'k' }, 'Technologies'), h('div', { class: 'v' }, knownLbl),
    ),
    budget.el,
    h('div', { class: 'sc-row', style: 'justify-content:flex-end;font-size:10.5px' }, budgetCost),
    h('div', { class: 'sc-sechead' }, 'Active Research'), slotsEl, slotsEmpty,
    h('div', { class: 'sc-sechead' }, 'Technology Tree', h('span', { class: 'sc-grow' }), catProg),
    catChips, tree, detail,
  );

  const tierOf = (t: TechDef, techs: Map<string, TechDef>, memo: Map<string, number>): number => {
    const m = memo.get(t.id);
    if (m !== undefined) return m;
    memo.set(t.id, 0);
    let d = 0;
    for (const p of t.prereqs) {
      const pt = techs.get(p);
      if (pt && pt.category === t.category) d = Math.max(d, tierOf(pt, techs, memo) + 1);
    }
    memo.set(t.id, d);
    return d;
  };

  let treeSig = '';
  const renderTree = (force: boolean) => {
    const n = ctx.me;
    const techs = ctx.state.techs;
    const active = new Set(n.researching.map((s) => s.techId));
    const avail = new Set(game.availableTechs(ctx.player));
    const list = [...techs.values()].filter((t) => t.category === cat);
    const sig = cat + '|' + selTech + '|' + list.map((t) => (n.knownTechs.has(t.id) ? 'k' : active.has(t.id) ? 'a' : avail.has(t.id) ? 'v' : 'l')).join('');
    if (!force && sig === treeSig) return;
    treeSig = sig;
    catEls.forEach((e, k) => setClass(e, 'on', k === cat));
    const known = list.filter((t) => n.knownTechs.has(t.id)).length;
    setText(catProg, `${known} / ${list.length} researched`);
    const memo = new Map<string, number>();
    const tiers = new Map<number, TechDef[]>();
    for (const t of list) {
      const tier = tierOf(t, techs, memo);
      let arr = tiers.get(tier);
      if (!arr) tiers.set(tier, (arr = []));
      arr.push(t);
    }
    clear(tree);
    [...tiers.keys()].sort((a, b) => a - b).forEach((tier) => {
      tree.appendChild(h('div', { class: 'sc-tier' }, `Tier ${tier + 1}`));
      const grid = h('div', { class: 'sc-techgrid' });
      for (const t of (tiers.get(tier) as TechDef[]).sort((a, b) => a.cost - b.cost)) {
        const state = n.knownTechs.has(t.id) ? 'known' : active.has(t.id) ? 'active' : avail.has(t.id) ? 'avail' : 'locked';
        const stIcon: IconName = state === 'known' ? 'check' : state === 'active' ? 'flask' : state === 'avail' ? 'star' : 'lock';
        const card = h('div', { class: `sc-tech ${state}${t.id === selTech ? ' sel' : ''}` },
          h('div', { class: 'nm' }, h('span', { html: icon(stIcon) }), h('span', { class: 'sc-nowrap' }, t.name)),
          h('div', { class: 'meta' }, h('span', null, `${fmtCompact(t.cost)} RP`), h('span', null, state === 'known' ? 'Researched' : state === 'active' ? 'In progress' : state === 'avail' ? 'Available' : 'Locked')),
        );
        card.addEventListener('click', () => {
          selTech = t.id;
          renderTree(true);
        });
        card.addEventListener('dblclick', () => {
          if (state === 'avail') ctx.run(game.startResearch(ctx.player, t.id), `Research started: ${t.name}`);
        });
        setTip(card, `<div class="tt-title">${escapeHTML(t.name)}</div>${escapeHTML(t.description)}` +
          (Object.keys(t.effects).length ? '<div class="tt-sep"></div>' + Object.entries(t.effects).map(([k, v]) => fmtEffect(k, v)).join('<br>') : '') +
          (state === 'avail' ? '<div class="tt-sep"></div><span class="sc-dim">Double-click to research</span>' : ''));
        grid.appendChild(card);
      }
      tree.appendChild(grid);
    });
    renderDetail();
  };

  const renderDetail = () => {
    clear(detail);
    const t = selTech ? ctx.state.techs.get(selTech) : undefined;
    if (!t) {
      detail.appendChild(h('div', { class: 'sc-empty', style: 'padding:8px' }, 'Select a technology for details. Double-click an available one to start research.'));
      return;
    }
    const n = ctx.me;
    const known = n.knownTechs.has(t.id);
    const activeSlot = n.researching.find((s) => s.techId === t.id);
    const avail = game.availableTechs(ctx.player).includes(t.id);
    const rate = n.researchPoints / Math.max(1, n.researching.length + (activeSlot ? 0 : 1));
    const days = rate > 0 ? Math.ceil((t.cost - (activeSlot?.progress ?? 0)) / rate) : Infinity;
    const prereqs = h('div', { class: 'sc-col', style: 'gap:1px' });
    if (!t.prereqs.length) prereqs.appendChild(h('span', { class: 'sc-dim' }, 'None'));
    for (const p of t.prereqs) {
      const pt = ctx.state.techs.get(p);
      const ok = n.knownTechs.has(p);
      const row = h('span', { class: ok ? 'pos' : 'neg', style: 'cursor:pointer' }, h('span', { html: icon(ok ? 'check' : 'close') }), ' ', pt?.name ?? p);
      row.addEventListener('click', () => {
        if (pt) {
          cat = pt.category;
          selTech = pt.id;
          renderTree(true);
        }
      });
      prereqs.appendChild(row);
    }
    const unlocks = h('div', { class: 'sc-col', style: 'gap:2px' });
    for (const id of t.unlocksDesigns.slice(0, 8)) {
      const d = ctx.state.designs.get(id);
      if (d) unlocks.appendChild(h('div', { class: 'sc-row', style: 'gap:5px' }, h('span', { html: natoSymbol(d.category, 'friend', 20) }), d.name));
    }
    if (t.unlocksDesigns.length > 8) unlocks.appendChild(h('span', { class: 'sc-dim' }, `+${t.unlocksDesigns.length - 8} more designs`));
    const action = known
      ? h('span', { class: 'pos sc-bold' }, '✔ Researched')
      : activeSlot
        ? (() => { const b = h('button', { class: 'sc-btn danger' }, 'Cancel research'); b.addEventListener('click', () => ctx.run(game.cancelResearch(ctx.player, t.id))); return b; })()
        : (() => {
          const b = h('button', { class: 'sc-btn primary', disabled: !avail }, h('span', { html: icon('flask') }), 'Start research');
          b.addEventListener('click', () => ctx.run(game.startResearch(ctx.player, t.id), `Research started: ${t.name}`));
          return b;
        })();
    append(detail, [
      h('div', { style: 'font-weight:800;font-size:13px;color:#fff' }, t.name),
      h('div', { class: 'sc-dim', style: 'margin:2px 0 6px' }, t.description),
      h('div', { class: 'sc-grid2' },
        h('div', null, h('div', { class: 'sc-tier', style: 'margin-top:0' }, 'Prerequisites'), prereqs),
        h('div', null, h('div', { class: 'sc-tier', style: 'margin-top:0' }, 'Effects'),
          h('div', { html: Object.keys(t.effects).length ? Object.entries(t.effects).map(([k, v]) => fmtEffect(k, v)).join('<br>') : '<span class="sc-dim">—</span>' })),
      ),
      t.unlocksDesigns.length ? h('div', null, h('div', { class: 'sc-tier' }, 'Unlocks designs'), unlocks) : null,
      h('div', { class: 'sc-row', style: 'margin-top:8px' },
        h('span', { class: 'sc-dim sc-grow' }, `Cost ${fmtCompact(t.cost)} RP${known ? '' : isFinite(days) ? ` · est. ${days} days` : ''}`), action),
    ]);
  };

  return {
    id: 'research', title: 'Research & Technology', icon: 'flask', tip: 'Research budget, active projects and the technology tree', el,
    show(arg) {
      const a = arg as { tech?: string } | undefined;
      if (a?.tech) {
        const t = ctx.state.techs.get(a.tech);
        if (t) { cat = t.category; selTech = t.id; }
      }
      treeSig = '';
    },
    update(force) {
      const n = ctx.me;
      setText(rpLbl, `${fmtCompact(n.researchPoints)} RP / day`);
      setText(knownLbl, `${n.knownTechs.size} / ${ctx.state.techs.size}`);
      budget.set(n.researchBudget);
      setText(budgetCost, `≈ ${fmtMoney((n.gdp * n.researchBudget) / 365, 2)} per day`);
      slots.sync(n.researching);
      setClass(slotsEmpty, 'sc-hidden', n.researching.length > 0);
      renderTree(force);
    },
  };
}
