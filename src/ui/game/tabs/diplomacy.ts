/**
 * Diplomacy tab: every nation with relation, treaties, war status and bloc;
 * selected nation detail with treaty proposals, war/peace, aid and relations.
 */
import { h, append, setText, setHTML, setClass, clear, fmtMoney, fmtPop, fmtCompact, escapeHTML, setTip, KeyedList } from '../../dom';
import { icon, TREATY_ICON } from '../../icons';
import { flagImg, flagHTML, relBarHTML, relColor, relLabel } from '../../widgets';
import { confirm, promptNumber } from '../../dialogs';
import { GOVERNMENT_NAMES } from '../../../worldgen/types';
import { TREATY_NAMES, type Nation, type TreatyType } from '../../../sim/types';
import { TREATY_ORDER, type Ctx } from '../context';
import type { TabView } from '../panel';

type SortKey = 'name' | 'rel' | 'gdp' | 'power';
type Filter = 'all' | 'war' | 'allies' | 'neighbours' | 'bloc';

const TREATY_DESC: Record<TreatyType, string> = {
  embassy: 'Exchange ambassadors. Improves relations over time and is required for most other agreements.',
  trade: 'Lower tariffs and open markets. Boosts trade income for both nations.',
  mapSharing: 'Share maps and intelligence: see each other\'s territory and units.',
  militaryAccess: 'Allow each other\'s forces to move through your territory.',
  nonAggression: 'A formal promise not to attack each other.',
  defensePact: 'Each side comes to the other\'s aid if attacked.',
  alliance: 'Full military alliance: fight each other\'s wars.',
  researchSharing: 'Share scientific progress. Speeds research for both sides.',
  ceasefire: 'Halt hostilities while peace is negotiated.',
};

export function diplomacyTab(ctx: Ctx): TabView {
  const { game } = ctx;
  let sortKey: SortKey = 'rel';
  let sortAsc = false;
  let filter: Filter = 'all';
  let search = '';
  let selected = -1;
  let neighbours: Set<number> | null = null;
  let neighboursVersion = -1;

  const computeNeighbours = () => {
    const st = ctx.state;
    if (neighbours && neighboursVersion === st.ownerVersion) return neighbours;
    const set = new Set<number>();
    const me = ctx.player + 1;
    const own = st.hexOwner;
    const nb = st.grid.neighbours;
    for (let i = 0; i < own.length; i++) {
      if (own[i] !== me) continue;
      for (let d = 0; d < 6; d++) {
        const j = nb[i * 6 + d];
        if (j >= 0 && own[j] && own[j] !== me) set.add(own[j] - 1);
      }
    }
    neighbours = set;
    neighboursVersion = st.ownerVersion;
    return set;
  };

  const searchIn = h('input', { class: 'sc-input', placeholder: 'Search nations…', style: 'flex:1' }) as HTMLInputElement;
  searchIn.addEventListener('input', () => {
    search = searchIn.value.toLowerCase();
    refreshList();
  });
  searchIn.addEventListener('keydown', (e) => e.stopPropagation());
  const chips = h('div', { class: 'sc-chips', style: 'margin:4px 0' });
  const chipEls = new Map<Filter, HTMLElement>();
  ([['all', 'All'], ['neighbours', 'Neighbours'], ['allies', 'Allies & friends'], ['war', 'At war'], ['bloc', 'My blocs']] as [Filter, string][]).forEach(([f, l]) => {
    const c = h('span', { class: 'sc-chip' + (f === filter ? ' on' : '') }, l);
    c.addEventListener('click', () => {
      filter = f;
      chipEls.forEach((e, k) => setClass(e, 'on', k === f));
      refreshList();
    });
    chipEls.set(f, c);
    chips.appendChild(c);
  });

  const heads: Record<SortKey, HTMLTableCellElement> = {
    name: h('th', { class: 'sortable' }, 'Nation'),
    rel: h('th', { class: 'sortable' }, 'Relation'),
    gdp: h('th', { class: 'sortable num' }, 'GDP'),
    power: h('th', { class: 'sortable num' }, 'Military'),
  };
  (Object.keys(heads) as SortKey[]).forEach((k) => heads[k].addEventListener('click', () => {
    if (sortKey === k) sortAsc = !sortAsc;
    else { sortKey = k; sortAsc = k === 'name'; }
    refreshList();
  }));
  const tbody = h('tbody');
  const table = h('table', { class: 'sc-table' }, h('thead', null, h('tr', null, heads.name, heads.rel, h('th', null, 'Treaties'), heads.gdp, heads.power)), tbody);
  const listWrap = h('div', { class: 'sc-dip-list sc-inset sc-scroll' }, table);
  const detail = h('div', { class: 'sc-dip-detail sc-inset' });

  const treatyIcons = (a: number, b: number) =>
    TREATY_ORDER.filter((t) => t !== 'ceasefire').map((t) => `<span class="${game.hasTreaty(a, b, t) ? '' : 'off'}" title="">${icon(TREATY_ICON[t]).replace('class="sc-ico"', `class="sc-ico${game.hasTreaty(a, b, t) ? '' : ' off'}"`)}</span>`).join('');

  const rows = new KeyedList<Nation>(tbody, (n) => n.id, (n) => {
    const nid = n.id;
    const nameCell = h('td');
    const relCell = h('td');
    const trCell = h('td', { class: 'sc-treaties' });
    const gdpCell = h('td', { class: 'num' });
    const powCell = h('td', { class: 'num' });
    const tr = h('tr', { class: 'clickable' }, nameCell, relCell, trCell, gdpCell, powCell);
    nameCell.appendChild(h('div', { class: 'sc-row', style: 'gap:5px' }, flagImg(n.flag, 12), h('span', { class: 'sc-nowrap nm', style: 'max-width:120px' }, n.name), h('span', { class: 'war' })));
    tr.addEventListener('click', () => select(nid));
    tr.addEventListener('dblclick', () => focusNation(nid));
    setTip(trCell, () => {
      const lines = TREATY_ORDER.filter((t) => game.hasTreaty(ctx.player, nid, t)).map((t) => `${icon(TREATY_ICON[t])} ${TREATY_NAMES[t]}`);
      return lines.length ? `<div class="tt-title">Treaties</div>${lines.join('<br>')}` : 'No treaties';
    });
    return {
      el: tr,
      update(nn: Nation) {
        const r = game.relation(ctx.player, nn.id);
        setHTML(relCell, `${relBarHTML(r, 56)} <span style="color:${relColor(r)};font-weight:700">${r > 0 ? '+' : ''}${r.toFixed(0)}</span>`);
        setHTML(trCell, treatyIcons(ctx.player, nn.id));
        setText(gdpCell, fmtMoney(nn.gdp));
        setText(powCell, fmtCompact(game.militaryPower(nn.id)));
        const war = nameCell.querySelector('.war') as HTMLElement;
        setHTML(war, game.atWar(ctx.player, nn.id) ? '<span class="sc-tag red">WAR</span>' : '');
        setClass(tr, 'sel', nn.id === selected);
      },
    };
  });

  const focusNation = (id: number) => {
    const n = ctx.state.nations[id];
    const cap = ctx.state.cities[n?.capitalCity ?? -1];
    if (cap) ctx.focusHex(cap.hex, '#ffc040');
  };

  const refreshList = () => {
    (Object.keys(heads) as SortKey[]).forEach((k) => {
      heads[k].classList.toggle('sorted', k === sortKey);
      heads[k].classList.toggle('asc', k === sortKey && sortAsc);
    });
    const me = ctx.me;
    const nb = filter === 'neighbours' ? computeNeighbours() : null;
    let list = ctx.state.nations.filter((n) => n.alive && n.id !== ctx.player);
    if (search) list = list.filter((n) => n.name.toLowerCase().includes(search) || n.code.toLowerCase().includes(search));
    if (filter === 'war') list = list.filter((n) => game.atWar(ctx.player, n.id));
    else if (filter === 'allies') list = list.filter((n) => game.relation(ctx.player, n.id) >= 40 || game.hasTreaty(ctx.player, n.id, 'alliance') || game.hasTreaty(ctx.player, n.id, 'defensePact'));
    else if (filter === 'neighbours' && nb) list = list.filter((n) => nb.has(n.id));
    else if (filter === 'bloc') list = list.filter((n) => n.blocs.some((b) => me.blocs.includes(b)));
    const powers = new Map<number, number>();
    if (sortKey === 'power') for (const n of list) powers.set(n.id, game.militaryPower(n.id));
    const val = (n: Nation): number | string => sortKey === 'name' ? n.name : sortKey === 'rel' ? game.relation(ctx.player, n.id) : sortKey === 'gdp' ? n.gdp : powers.get(n.id) ?? 0;
    list.sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sortAsc ? c : -c;
    });
    rows.sync(list);
  };

  const actionBtn = (label: string, ico: Parameters<typeof icon>[0], tip: string, fn: () => void, cls = '') => {
    const b = h('button', { class: 'sc-btn ' + cls }, h('span', { html: icon(ico) }), label);
    setTip(b, tip);
    b.addEventListener('click', fn);
    return b;
  };

  let detailSig = '';
  const renderDetail = (force = false) => {
    const st = ctx.state;
    const n = st.nations[selected];
    const me = ctx.player;
    const sig = n ? [selected, game.relation(me, selected).toFixed(0), game.atWar(me, selected), TREATY_ORDER.map((t) => (game.hasTreaty(me, selected, t) ? 1 : 0)).join(''), n.alive].join('|') : 'none';
    if (!force && sig === detailSig) return;
    detailSig = sig;
    clear(detail);
    if (!n) {
      detail.appendChild(h('div', { class: 'sc-empty' }, 'Select a nation to conduct diplomacy.'));
      return;
    }
    const rel = game.relation(me, n.id);
    const theirRel = game.relation(n.id, me);
    const war = game.atWar(me, n.id);
    const blocs = n.blocs.map((b) => st.world.blocs[b]).filter(Boolean);
    const theirWars = st.wars.filter((w) => w.attackers.includes(n.id) || w.defenders.includes(n.id));
    append(detail, [
      h('div', { class: 'sc-row', style: 'gap:8px;align-items:flex-start' },
        flagImg(n.flag, 34),
        h('div', { class: 'sc-grow', style: 'min-width:0' },
          h('div', { style: 'font-size:14px;font-weight:800;color:#fff' }, n.name, war ? h('span', { class: 'sc-tag red', style: 'margin-left:6px' }, 'AT WAR') : null),
          h('div', { class: 'sc-dim', style: 'font-size:10.5px' }, `${GOVERNMENT_NAMES[n.government]} · ${n.leaderTitle} ${n.leaderName}`),
          h('div', { class: 'sc-row', style: 'gap:3px;margin-top:3px;flex-wrap:wrap' },
            ...blocs.map((b) => h('span', { class: 'sc-tag', style: `background:${b.color};color:#fff` }, b.short)),
            n.nuclear ? h('span', { class: 'sc-tag red' }, '☢') : null),
        ),
        (() => { const b = h('button', { class: 'sc-btn sc-ibtn', html: icon('focus'), tip: 'Show on map' }); b.addEventListener('click', () => focusNation(n.id)); return b; })(),
      ),
      h('div', { class: 'sc-kv2', style: 'margin:6px 0' },
        h('div', { class: 'k' }, 'Our relation'), h('div', { class: 'v', html: `<span style="color:${relColor(rel)}">${rel > 0 ? '+' : ''}${rel.toFixed(0)} ${relLabel(rel)}</span>` }),
        h('div', { class: 'k' }, 'Their view'), h('div', { class: 'v', html: `<span style="color:${relColor(theirRel)}">${theirRel > 0 ? '+' : ''}${theirRel.toFixed(0)}</span>` }),
        h('div', { class: 'k' }, 'GDP'), h('div', { class: 'v' }, fmtMoney(n.gdp)),
        h('div', { class: 'k' }, 'Population'), h('div', { class: 'v' }, fmtPop(n.population)),
        h('div', { class: 'k' }, 'Military'), h('div', { class: 'v' }, fmtCompact(game.militaryPower(n.id))),
        h('div', { class: 'k' }, 'Approval'), h('div', { class: 'v' }, n.approval.toFixed(0) + '%'),
      ),
      theirWars.length ? h('div', { class: 'sc-dim', style: 'font-size:10.5px;margin-bottom:4px', html: '⚔ At war: ' + theirWars.map((w) => {
        const enemies = w.attackers.includes(n.id) ? w.defenders : w.attackers;
        return enemies.map((e) => flagHTML(st.nations[e]?.flag, 10) + ' ' + escapeHTML(st.nations[e]?.name ?? '?')).join(', ');
      }).join('; ') }) : null,
    ]);
    // treaties grid
    const grid = h('div', { class: 'sc-actgrid' });
    for (const t of TREATY_ORDER) {
      if (t === 'ceasefire' && !war) continue;
      const has = game.hasTreaty(me, n.id, t);
      const b = h('button', { class: 'sc-btn' + (has ? ' has' : ''), disabled: war && t !== 'ceasefire' }, h('span', { html: icon(TREATY_ICON[t]) }), TREATY_NAMES[t].replace(' Agreement', '').replace(' Exchange', '').replace('Military ', 'Mil. ').replace('Non-Aggression Pact', 'Non-Aggression'));
      setTip(b, `<div class="tt-title">${TREATY_NAMES[t]}</div>${TREATY_DESC[t]}<div class="tt-sep"></div>${has ? '<span class="pos">In force</span> — click to cancel' : 'Click to propose'}`);
      b.addEventListener('click', () => {
        if (has) confirm('Cancel Treaty', `Cancel the ${TREATY_NAMES[t]} with ${n.name}? Relations will suffer.`, 'Cancel treaty', () => ctx.run(game.cancelTreaty(me, n.id, t), `${TREATY_NAMES[t]} cancelled`), true);
        else ctx.run(game.proposeTreaty(me, n.id, t), `${TREATY_NAMES[t]} proposed to ${n.name}`);
        detailSig = '';
      });
      grid.appendChild(b);
    }
    const acts = h('div', { class: 'sc-row sc-wrap', style: 'gap:3px;margin-top:6px' },
      actionBtn('Improve relations', 'heart', 'Diplomatic outreach: spend funds to improve relations.', () => { ctx.run(game.improveRelations(me, n.id), `Relations with ${n.name} improving`); detailSig = ''; }),
      actionBtn('Send aid', 'dollar', 'Send economic aid (billions USD). Improves relations.', () => {
        const max = Math.max(0.1, Math.floor(ctx.me.treasury * 10) / 10);
        promptNumber(`Aid to ${n.name}`, 'Amount of economic aid to send (billions USD):', Math.min(1, max), 0.1, max, 0.1, (v) => fmtMoney(v, 1), (v) => ctx.run(game.sendAid(me, n.id, v), `${fmtMoney(v)} sent to ${n.name}`));
      }),
      war
        ? actionBtn('Offer peace', 'whiteFlag', 'Propose a peace treaty to end the war.', () => { ctx.run(game.offerPeace(me, n.id), `Peace offered to ${n.name}`); detailSig = ''; }, 'primary')
        : actionBtn('Declare war', 'swords', 'Declare war. Their allies may join. World opinion will drop.', () => {
          const allies = ctx.state.nations.filter((o) => o.id !== n.id && o.alive && (game.hasTreaty(n.id, o.id, 'alliance') || game.hasTreaty(n.id, o.id, 'defensePact')));
          confirm('Declare War',
            h('div', null,
              h('div', { class: 'sc-row', style: 'gap:10px;margin-bottom:8px' }, flagImg(ctx.me.flag, 30), h('span', { style: 'font-size:18px' }, '⚔'), flagImg(n.flag, 30)),
              h('div', null, `Are you sure you want to declare war on ${n.formalName}?`),
              allies.length ? h('div', { class: 'neg', style: 'margin-top:6px' }, `Their allies may join the war: ${allies.slice(0, 8).map((a) => a.name).join(', ')}${allies.length > 8 ? '…' : ''}`) : null,
              h('div', { class: 'sc-dim', style: 'margin-top:6px' }, 'Existing treaties will be cancelled and world opinion will fall.'),
            ),
            'Declare War', () => { ctx.run(game.declareWar(me, n.id), `War declared on ${n.name}!`); detailSig = ''; }, true);
        }, 'danger'),
    );
    detail.append(h('div', { class: 'sc-tier', style: 'margin-top:2px' }, 'Treaties — click to propose / cancel'), grid, acts);
  };

  const select = (id: number) => {
    selected = id;
    refreshList();
    renderDetail(true);
  };

  const el = h('div', { class: 'sc-dip-split' },
    h('div', { class: 'sc-row' }, h('span', { html: icon('search'), class: 'sc-dim' }), searchIn),
    chips, listWrap, detail,
  );

  return {
    id: 'diplomacy', title: 'Diplomacy', icon: 'handshake', tip: 'Relations, treaties, war and peace with every nation', el,
    show(arg) {
      const a = arg as { nation?: number } | undefined;
      if (a?.nation !== undefined && a.nation !== ctx.player) {
        selected = a.nation;
        search = '';
        searchIn.value = '';
      }
      el.style.height = '100%';
      detailSig = '';
    },
    update(force) {
      refreshList();
      renderDetail(force);
      if (selected >= 0) {
        const r = rows.get(selected);
        if (r && force) r.el.scrollIntoView({ block: 'nearest' });
      }
    },
  };
}
