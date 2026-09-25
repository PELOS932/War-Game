/**
 * World tab: rankings, active wars, blocs and the full news archive.
 */
import { h, setClass, setHTML, clear, fmtMoney, fmtPop, fmtCompact, fmtNum, escapeHTML } from '../../dom';
import { icon, IconName, NEWS_ICON } from '../../icons';
import { flagHTML, relColor } from '../../widgets';
import { formatDate, type NewsCategory, type NewsItem } from '../../../sim/types';
import type { Ctx } from '../context';
import type { TabView } from '../panel';

type Sub = 'rank' | 'wars' | 'blocs' | 'news';
type Metric = 'gdp' | 'power' | 'pop' | 'gdppc' | 'approval' | 'territory';

export function worldTab(ctx: Ctx, onNewsViewed: () => void): TabView {
  const { game } = ctx;
  let sub: Sub = 'rank';
  let metric: Metric = 'gdp';
  let newsCat: NewsCategory | 'all' | 'mine' = 'all';
  let openBloc = -1;

  const subEls = new Map<Sub, HTMLElement>();
  const subtabs = h('div', { class: 'sc-subtabs' });
  ([['rank', 'Rankings', 'chart'], ['wars', 'Wars', 'swords'], ['blocs', 'Blocs', 'link'], ['news', 'News', 'news']] as [Sub, string, IconName][]).forEach(([s, l, i]) => {
    const e = h('div', { class: 'sc-subtab' + (s === sub ? ' on' : '') }, h('span', { html: icon(i) }), l);
    e.addEventListener('click', () => setSub(s));
    subEls.set(s, e);
    subtabs.appendChild(e);
  });
  const body = h('div');
  const el = h('div', null, subtabs, body);
  let sig = '';

  const setSub = (s: Sub) => {
    sub = s;
    subEls.forEach((e, k) => setClass(e, 'on', k === s));
    sig = '';
    clear(body);
    render(true);
    if (s === 'news') onNewsViewed();
  };

  // ---------------------------------------------------------------- rankings
  const metricChips = h('div', { class: 'sc-chips', style: 'margin-bottom:5px' });
  const metricEls = new Map<Metric, HTMLElement>();
  ([['gdp', 'GDP'], ['power', 'Military'], ['pop', 'Population'], ['gdppc', 'GDP / capita'], ['approval', 'Approval'], ['territory', 'Territory']] as [Metric, string][]).forEach(([m, l]) => {
    const e = h('span', { class: 'sc-chip' + (m === metric ? ' on' : '') }, l);
    e.addEventListener('click', () => {
      metric = m;
      metricEls.forEach((x, k) => setClass(x, 'on', k === m));
      sig = '';
      render(true);
    });
    metricEls.set(m, e);
    metricChips.appendChild(e);
  });
  const rankTable = h('div', { class: 'sc-inset' });
  let territory: Int32Array | null = null;
  let territoryVer = -1;

  const renderRank = () => {
    const st = ctx.state;
    if (metric === 'territory' && territoryVer !== st.ownerVersion) {
      territory = new Int32Array(st.nations.length);
      for (let i = 0; i < st.hexOwner.length; i++) if (st.hexOwner[i]) territory[st.hexOwner[i] - 1]++;
      territoryVer = st.ownerVersion;
    }
    const val = (id: number): number => {
      const n = st.nations[id];
      switch (metric) {
        case 'gdp': return n.gdp;
        case 'power': return game.militaryPower(id);
        case 'pop': return n.population;
        case 'gdppc': return (n.gdp * 1e3) / Math.max(0.001, n.population);
        case 'approval': return n.approval;
        case 'territory': return territory?.[id] ?? 0;
      }
    };
    const fmt = (v: number) => metric === 'gdp' ? fmtMoney(v) : metric === 'pop' ? fmtPop(v) : metric === 'gdppc' ? '$' + fmtNum(v) : metric === 'approval' ? v.toFixed(0) + '%' : metric === 'territory' ? fmtNum(v) + ' hexes' : fmtCompact(v);
    const list = st.nations.filter((n) => n.alive).map((n) => ({ id: n.id, v: val(n.id) }));
    list.sort((a, b) => b.v - a.v);
    const top = list.slice(0, 25);
    const myIdx = list.findIndex((x) => x.id === ctx.player);
    const max = top[0]?.v || 1;
    const row = (x: { id: number; v: number }, rank: number) => {
      const n = st.nations[x.id];
      const me = x.id === ctx.player;
      return `<tr class="clickable${me ? ' me' : ''}" data-id="${x.id}"><td class="num" style="width:26px">${rank}</td><td>${flagHTML(n.flag, 12)} ${escapeHTML(n.name)}</td>` +
        `<td style="width:120px"><div class="sc-bar ${me ? 'amber' : 'blue'}" style="height:7px"><i style="width:${Math.max(1, (x.v / max) * 100).toFixed(1)}%"></i></div></td><td class="num">${fmt(x.v)}</td></tr>`;
    };
    let html = '<table class="sc-table"><tbody>' + top.map((x, i) => row(x, i + 1)).join('');
    if (myIdx >= 25) html += `<tr><td colspan="4" class="sc-center sc-dimmer">…</td></tr>` + row(list[myIdx], myIdx + 1);
    html += '</tbody></table>';
    setHTML(rankTable, html);
  };
  rankTable.addEventListener('click', (e) => {
    const tr = (e.target as HTMLElement).closest('tr[data-id]') as HTMLElement | null;
    if (tr) ctx.openTab('diplomacy', { nation: Number(tr.dataset.id) });
  });

  // ---------------------------------------------------------------- wars
  const warsEl = h('div');
  const renderWars = () => {
    const st = ctx.state;
    if (!st.wars.length) {
      setHTML(warsEl, '<div class="sc-empty">The world is at peace.</div>');
      return;
    }
    const side = (ids: number[]) => ids.map((i) => `<div class="sc-row" style="gap:4px">${flagHTML(st.nations[i]?.flag, 12)}<span class="sc-nowrap">${escapeHTML(st.nations[i]?.name ?? '?')}</span></div>`).join('');
    setHTML(warsEl, st.wars.map((w) => {
      const days = Math.floor((st.hour - w.startHour) / 24);
      const cas = (ids: number[]) => ids.reduce((a, i) => a + (w.casualties[i] ?? 0), 0);
      const mine = w.attackers.includes(ctx.player) || w.defenders.includes(ctx.player);
      const s = Math.max(-100, Math.min(100, w.score));
      return `<div class="sc-inset" style="padding:6px;margin-bottom:5px;${mine ? 'box-shadow:inset 0 0 0 1px rgba(255,90,72,.6)' : ''}">` +
        `<div class="sc-row" style="margin-bottom:4px"><span class="neg">${icon('swords')}</span><b class="sc-grow">${escapeHTML(w.name)}</b><span class="sc-dim">${days} days</span></div>` +
        `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:11px"><div><div class="sc-tier" style="margin:0 0 2px">Attackers</div>${side(w.attackers)}<div class="sc-dim" style="font-size:10px;margin-top:2px">Losses ${fmtNum(cas(w.attackers))}</div></div>` +
        `<div><div class="sc-tier" style="margin:0 0 2px">Defenders</div>${side(w.defenders)}<div class="sc-dim" style="font-size:10px;margin-top:2px">Losses ${fmtNum(cas(w.defenders))}</div></div></div>` +
        `<div class="sc-row" style="margin-top:5px;font-size:10px"><span>Attackers</span><div class="sc-rel sc-grow" style="height:9px"><i style="left:${s < 0 ? 50 + s / 2 : 50}%;width:${Math.abs(s) / 2}%;background:${relColor(s)}"></i></div><span>Defenders</span></div>` +
        `<div class="sc-center" style="font-size:10.5px;margin-top:2px">War score <b style="color:${relColor(s)}">${s > 0 ? '+' : ''}${s.toFixed(0)}</b> ${s > 5 ? '(attackers winning)' : s < -5 ? '(defenders winning)' : '(stalemate)'}</div></div>`;
    }).join(''));
  };

  // ---------------------------------------------------------------- blocs
  const blocsEl = h('div');
  blocsEl.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const n = t.closest('[data-nation]') as HTMLElement | null;
    if (n) {
      ctx.openTab('diplomacy', { nation: Number(n.dataset.nation) });
      return;
    }
    const b = t.closest('[data-bloc]') as HTMLElement | null;
    if (b) {
      const id = Number(b.dataset.bloc);
      openBloc = openBloc === id ? -1 : id;
      sig = '';
      render(true);
    }
  });
  const renderBlocs = () => {
    const st = ctx.state;
    const blocs = st.world.blocs;
    setHTML(blocsEl, blocs.map((b) => {
      const members = st.nations.filter((n) => n.alive && n.blocs.includes(b.id));
      const gdp = members.reduce((a, n) => a + n.gdp, 0);
      const mine = ctx.me.blocs.includes(b.id);
      const leader = b.leader >= 0 ? st.nations[b.leader] : null;
      return `<div class="sc-inset" style="margin-bottom:4px"><div class="sc-row" data-bloc="${b.id}" style="padding:5px 6px;cursor:pointer">` +
        `<span style="width:12px;height:12px;background:${b.color};border:1px solid #000;display:inline-block"></span>` +
        `<b class="sc-grow">${escapeHTML(b.name)} <span class="sc-dim">(${escapeHTML(b.short)})</span></b>${b.military ? '<span class="sc-tag red">DEFENSE</span>' : '<span class="sc-tag">ECONOMIC</span>'}${mine ? '<span class="sc-tag amber">MEMBER</span>' : ''}</div>` +
        `<div class="sc-row sc-dim" style="padding:0 6px 5px;font-size:10.5px"><span>${members.length} members</span><span>GDP ${fmtMoney(gdp)}</span>${leader ? `<span>Led by ${flagHTML(leader.flag, 10)} ${escapeHTML(leader.name)}</span>` : ''}</div>` +
        (openBloc === b.id ? `<div class="sc-row sc-wrap" style="gap:4px;padding:0 6px 6px">${members.map((m) => `<span data-nation="${m.id}" class="sc-chip" style="height:18px">${flagHTML(m.flag, 10)} ${escapeHTML(m.name)}</span>`).join('')}</div>` : '') +
        `</div>`;
    }).join('') || '<div class="sc-empty">No international blocs.</div>');
  };

  // ---------------------------------------------------------------- news
  const newsChips = h('div', { class: 'sc-chips', style: 'margin-bottom:5px' });
  const newsCatEls = new Map<string, HTMLElement>();
  const cats: [NewsCategory | 'all' | 'mine', string][] = [['all', 'All'], ['mine', 'Our nation'], ['war', 'War'], ['diplomacy', 'Diplomacy'], ['military', 'Military'], ['economy', 'Economy'], ['politics', 'Politics'], ['research', 'Research'], ['event', 'Events']];
  for (const [c, l] of cats) {
    const e = h('span', { class: 'sc-chip' + (c === newsCat ? ' on' : '') }, c !== 'all' && c !== 'mine' ? h('span', { html: icon(NEWS_ICON[c]) }) : null, l);
    e.addEventListener('click', () => {
      newsCat = c;
      newsCatEls.forEach((x, k) => setClass(x, 'on', k === c));
      sig = '';
      render(true);
    });
    newsCatEls.set(c, e);
    newsChips.appendChild(e);
  }
  const newsList = h('div', { class: 'sc-inset' });
  newsList.addEventListener('click', (e) => {
    const r = (e.target as HTMLElement).closest('[data-hex]') as HTMLElement | null;
    if (r && Number(r.dataset.hex) >= 0) ctx.focusHex(Number(r.dataset.hex), '#ffc040');
  });
  const renderNews = () => {
    const st = ctx.state;
    const items: NewsItem[] = [];
    for (let i = st.news.length - 1; i >= 0 && items.length < 200; i--) {
      const it = st.news[i];
      if (newsCat === 'mine' && !it.nations.includes(ctx.player)) continue;
      if (newsCat !== 'all' && newsCat !== 'mine' && it.category !== newsCat) continue;
      items.push(it);
    }
    setHTML(newsList, items.map((it) =>
      `<div class="sc-news c-${it.category}${it.nations.includes(ctx.player) ? ' me' : ''}${it.importance >= 3 ? ' imp3' : ''}" data-hex="${it.hex}">` +
      `<span class="d">${formatDate(it.hour).slice(0, 12)}</span>${icon(NEWS_ICON[it.category] ?? 'info')}<span>${escapeHTML(it.text)}</span></div>`).join('') || '<div class="sc-empty">No news.</div>');
  };

  const render = (force: boolean) => {
    const st = ctx.state;
    let s = sub + '|';
    if (sub === 'rank') s += metric + '|' + Math.floor(st.hour / 24);
    else if (sub === 'wars') s += st.wars.map((w) => w.id + ':' + w.score.toFixed(0)).join(',') + '|' + Math.floor(st.hour / 24);
    else if (sub === 'blocs') s += openBloc + '|' + Math.floor(st.hour / 24 / 7);
    else s += newsCat + '|' + st.news.length + '|' + (st.news[st.news.length - 1]?.id ?? 0);
    if (!force && s === sig) return;
    sig = s;
    if (!body.firstChild) {
      if (sub === 'rank') body.append(metricChips, rankTable);
      else if (sub === 'wars') body.append(warsEl);
      else if (sub === 'blocs') body.append(blocsEl);
      else body.append(newsChips, newsList);
    }
    if (sub === 'rank') renderRank();
    else if (sub === 'wars') renderWars();
    else if (sub === 'blocs') renderBlocs();
    else renderNews();
  };

  return {
    id: 'world', title: 'World Situation', icon: 'globe', tip: 'World rankings, wars, blocs and the news archive', el,
    show(arg) {
      const a = arg as { sub?: Sub } | undefined;
      if (a?.sub) setSub(a.sub);
      else if (!body.firstChild) setSub(sub);
      if (sub === 'news') onNewsViewed();
    },
    update(force) {
      render(force);
    },
  };
}
