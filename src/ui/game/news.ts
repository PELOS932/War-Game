/**
 * Bottom message bar (recent news) plus popup dialogs for major events and
 * AI diplomatic proposals to the player.
 */
import { h, setClass, KeyedList, escapeHTML, setTip } from '../dom';
import { icon, NEWS_ICON, TREATY_ICON } from '../icons';
import { flagImg, flagHTML, relColor } from '../widgets';
import { dialog, DialogHandle } from '../dialogs';
import { loadOptions } from '../options';
import { formatDate, TREATY_NAMES, type GameEvent, type NewsCategory, type NewsItem, type Proposal } from '../../sim/types';
import type { Ctx } from './context';

export interface NewsBar {
  el: HTMLElement;
  update(dt: number): void;
  unread(): number;
  markRead(): void;
}

export function createNewsBar(ctx: Ctx): NewsBar {
  let filter: NewsCategory | 'all' | 'mine' = 'all';
  let lastSig = '';
  let readUpTo = ctx.state.news[ctx.state.news.length - 1]?.id ?? 0;
  let newestSeen = readUpTo;
  const chips = h('div', { class: 'sc-row', style: 'gap:2px' });
  const chipEls = new Map<string, HTMLElement>();
  const cats: [NewsCategory | 'all' | 'mine', string][] = [['all', 'All'], ['mine', 'Ours'], ['war', ''], ['diplomacy', ''], ['military', ''], ['economy', ''], ['politics', ''], ['research', '']];
  for (const [c, l] of cats) {
    const e = h('span', { class: 'sc-chip' + (c === filter ? ' on' : '') }, c !== 'all' && c !== 'mine' ? h('span', { html: icon(NEWS_ICON[c]) }) : null, l);
    setTip(e, c === 'all' ? 'All messages' : c === 'mine' ? 'Messages about our nation' : `${c[0].toUpperCase() + c.slice(1)} news`);
    e.addEventListener('click', () => {
      filter = c;
      chipEls.forEach((x, k) => setClass(x, 'on', k === c));
      lastSig = '';
    });
    chipEls.set(c, e);
    chips.appendChild(e);
  }
  const expandBtn = h('button', { class: 'sc-btn sm', html: icon('chevUp'), tip: 'Expand / shrink message log' });
  const archiveBtn = h('button', { class: 'sc-btn sm', html: icon('news'), tip: 'Open the full news archive' });
  archiveBtn.addEventListener('click', () => ctx.openTab('world', { sub: 'news' }));
  const listEl = h('div', { class: 'sc-newslist sc-inset sc-scroll' });
  const el = h('div', { class: 'sc-newsbar sc-panel' },
    h('div', { class: 'sc-titlebar' }, h('span', { html: icon('news') }), 'Messages', h('span', { class: 'sc-grow' }), chips, archiveBtn, expandBtn),
    listEl,
  );
  expandBtn.addEventListener('click', () => {
    el.classList.toggle('expanded');
    expandBtn.innerHTML = icon(el.classList.contains('expanded') ? 'chevDown' : 'chevUp');
  });
  let first = true;
  const list = new KeyedList<NewsItem>(listEl, (n) => n.id, (it) => {
    const mine = it.nations.includes(ctx.player);
    const flags = it.nations.slice(0, 2).map((id) => flagHTML(ctx.state.nations[id]?.flag, 10)).join('');
    const row = h('div', {
      class: `sc-news c-${it.category}${mine ? ' me' : ''}${it.importance >= 3 ? ' imp3' : ''}${first ? '' : ' fresh'}`,
      html: `<span class="d">${formatDate(it.hour).slice(0, 6)}</span>${icon(NEWS_ICON[it.category] ?? 'info')}${flags ? `<span style="display:inline-flex;gap:2px;margin-top:1px">${flags}</span>` : ''}<span>${escapeHTML(it.text)}</span>`,
    });
    if (it.hex >= 0) {
      setTip(row, `${formatDate(it.hour)}<br><span class="sc-dim">Click to show location</span>`);
      row.addEventListener('click', () => ctx.focusHex(it.hex, '#ffc040'));
    }
    return { el: row, update() {} };
  });

  let t = 0;
  return {
    el,
    update(dt: number) {
      t -= dt;
      if (t > 0) return;
      t = 0.25;
      const news = ctx.state.news;
      const sig = filter + '|' + news.length + '|' + (news[news.length - 1]?.id ?? 0);
      if (sig === lastSig) return;
      lastSig = sig;
      const items: NewsItem[] = [];
      for (let i = news.length - 1; i >= 0 && items.length < 60; i--) {
        const it = news[i];
        if (filter === 'mine' && !it.nations.includes(ctx.player)) continue;
        if (filter !== 'all' && filter !== 'mine' && it.category !== filter) continue;
        items.push(it);
      }
      const atTop = listEl.scrollTop < 4;
      list.sync(items);
      if (atTop) listEl.scrollTop = 0;
      first = false;
      newestSeen = news[news.length - 1]?.id ?? newestSeen;
    },
    unread() {
      let c = 0;
      const news = ctx.state.news;
      for (let i = news.length - 1; i >= 0; i--) {
        if (news[i].id <= readUpTo) break;
        if (news[i].importance >= 2 || news[i].nations.includes(ctx.player)) c++;
      }
      return c;
    },
    markRead() {
      readUpTo = ctx.state.news[ctx.state.news.length - 1]?.id ?? readUpTo;
      void newestSeen;
    },
  };
}

// ---------------------------------------------------------------------------
// Popups: major events and proposals
// ---------------------------------------------------------------------------
const PROPOSAL_NAMES: Record<string, string> = { ...TREATY_NAMES, peace: 'Peace Treaty', aid: 'Aid Request', joinWar: 'Call to Arms' };

const HEADER_GRAD: Record<string, string> = {
  war: 'linear-gradient(135deg,#5a120c,#b3301c 45%,#2a0806)',
  diplomacy: 'linear-gradient(135deg,#0c2a4a,#2c6aa0 45%,#081a2e)',
  economy: 'linear-gradient(135deg,#0f3a14,#3a8a2c 45%,#08200a)',
  military: 'linear-gradient(135deg,#3a300c,#8a6a1c 45%,#201a06)',
  event: 'linear-gradient(135deg,#3a3a0c,#a0901c 45%,#20200a)',
  research: 'linear-gradient(135deg,#2a0c4a,#6a3aa0 45%,#180830)',
  politics: 'linear-gradient(135deg,#2a2a2a,#6a6a5a 45%,#141414)',
};

export interface Popups {
  onEvent(e: GameEvent): void;
  update(dt: number): void;
  destroy(): void;
}

export function createPopups(ctx: Ctx): Popups {
  const shown = new Set<number>(); // proposal ids
  const open = new Map<number, DialogHandle>();
  const queue: (() => DialogHandle | null)[] = [];
  let current: DialogHandle | null = null;
  let pausedBy = false;
  let resumeSpeed = 0;
  const seenNews = new Set<number>();
  let lastPopupHour = -999;
  let popupsThisHour = 0;

  const autoPause = (kind: 'event' | 'proposal') => {
    const o = loadOptions();
    if ((kind === 'event' && o.autoPauseEvents) || (kind === 'proposal' && o.autoPauseProposals)) {
      if (ctx.state.speed > 0) {
        resumeSpeed = ctx.state.speed;
        pausedBy = true;
        ctx.game.setSpeed(0);
      }
    }
  };
  const maybeResume = () => {
    if (pausedBy && !current && !queue.length && ![...open.values()].some((d) => d.open)) {
      pausedBy = false;
      if (ctx.state.speed === 0 && resumeSpeed > 0) ctx.game.setSpeed(resumeSpeed);
    }
  };

  const pump = () => {
    if (current?.open) return;
    current = null;
    while (queue.length && !current) current = (queue.shift() as () => DialogHandle | null)();
    maybeResume();
  };

  const newsDialog = (title: string, cat: string, text: string, hex: number, nations: number[], big: string) => {
    queue.push(() => {
      autoPause('event');
      const flags = h('div', { class: 'sc-row', style: 'gap:6px' }, ...nations.slice(0, 3).map((id) => flagImg(ctx.state.nations[id]?.flag, 26)));
      const buttons = [] as { label: string; kind?: 'primary'; action?: () => void }[];
      if (hex >= 0) buttons.push({ label: 'Show on map', action: () => ctx.focusHex(hex, '#ff5040') });
      buttons.push({ label: 'Continue', kind: 'primary' });
      return dialog({
        title,
        titleIcon: NEWS_ICON[cat] ?? 'exclaim',
        body: h('div', { style: 'width:440px' },
          h('div', { class: 'newsimg' }, h('div', { class: 'ph', style: `background:${HEADER_GRAD[cat] ?? HEADER_GRAD.event}` }),
            h('div', { class: 'ph', style: 'background:repeating-linear-gradient(180deg,transparent 0 2px,rgba(0,0,0,.25) 2px 3px)' }),
            h('div', { class: 'cap' }, big),
            h('div', { style: 'position:absolute;right:12px;top:12px' }, flags)),
          h('div', { class: 'sc-dim', style: 'font-size:10.5px;margin-bottom:4px' }, formatDate(ctx.state.hour)),
          h('div', { style: 'font-size:13px' }, text),
        ),
        buttons,
        onClose: () => setTimeout(pump, 0),
      });
    });
    pump();
  };

  const proposalDialog = (p: Proposal) => {
    if (shown.has(p.id)) return;
    shown.add(p.id);
    queue.push(() => {
      if (!ctx.state.proposals.some((x) => x.id === p.id)) return null;
      autoPause('proposal');
      const from = ctx.state.nations[p.from];
      const rel = ctx.game.relation(ctx.player, p.from);
      const kindName = PROPOSAL_NAMES[p.kind] ?? p.kind;
      const tIcon = (TREATY_ICON as Record<string, Parameters<typeof icon>[0]>)[p.kind];
      const d = dialog({
        title: 'Diplomatic Proposal',
        titleIcon: 'mail',
        body: h('div', { style: 'width:420px' },
          h('div', { class: 'hero' }, flagImg(from?.flag, 40),
            h('div', null, h('div', { class: 'h1' }, from?.name ?? 'Unknown'), h('div', { class: 'h2' }, `${from?.leaderTitle ?? ''} ${from?.leaderName ?? ''}`),
              h('div', { class: 'h2', html: `Relation: <b style="color:${relColor(rel)}">${rel > 0 ? '+' : ''}${rel.toFixed(0)}</b>` }))),
          h('div', { class: 'sc-inset', style: 'padding:8px;margin-bottom:8px;display:flex;gap:8px;align-items:center' },
            tIcon ? h('span', { html: icon(tIcon), class: 'sc-amber' }) : null,
            h('b', { class: 'sc-amber' }, kindName),
            p.kind === 'aid' ? h('span', null, ` — $${p.data.toFixed(1)}B`) : null),
          h('div', { style: 'font-style:italic' }, `“${p.message}”`),
          h('div', { class: 'sc-dim', style: 'font-size:10.5px;margin-top:8px' }, `Expires ${formatDate(p.expiresHour)}`),
        ),
        buttons: [
          { label: 'Accept', kind: 'primary', icon: 'check', action: () => { ctx.run(ctx.game.respondProposal(p.id, true), `${kindName} with ${from?.name} accepted`); } },
          { label: 'Decline', icon: 'close', action: () => { ctx.run(ctx.game.respondProposal(p.id, false), `Proposal from ${from?.name} declined`); } },
        ],
        dismissable: false,
        onClose: () => {
          open.delete(p.id);
          setTimeout(pump, 0);
        },
      });
      open.set(p.id, d);
      return d;
    });
    pump();
  };

  const nm = (id: number) => escapeHTML(ctx.state.nations[id]?.name ?? '?');
  void nm;

  const popupAllowed = () => {
    const hr = ctx.state.hour;
    if (hr !== lastPopupHour) {
      lastPopupHour = hr;
      popupsThisHour = 0;
    }
    return ++popupsThisHour <= 2 && queue.length < 6;
  };

  let t = 0;
  return {
    onEvent(e: GameEvent) {
      const me = ctx.player;
      const N = ctx.state.nations;
      switch (e.type) {
        case 'proposal':
          if (e.proposal.to === me) proposalDialog(e.proposal);
          break;
        case 'warDeclared':
          if (e.defender === me && popupAllowed()) newsDialog('War Declared!', 'war', `${N[e.attacker]?.formalName ?? 'An enemy'} has declared war on our nation! Our forces must prepare to defend the homeland.`, ctx.state.cities[N[e.attacker]?.capitalCity ?? -1]?.hex ?? -1, [e.attacker, me], 'WAR!');
          break;
        case 'cityCaptured': {
          const c = ctx.state.cities[e.city];
          if (!c) break;
          if (e.from === me && popupAllowed()) newsDialog('City Lost', 'war', `${c.name} has fallen to the forces of ${N[e.to]?.name ?? 'the enemy'}.`, c.hex, [e.to, me], 'City Lost');
          else if (e.to === me && popupAllowed()) newsDialog('City Captured', 'military', `Our forces have captured ${c.name} from ${N[e.from]?.name ?? 'the enemy'}!`, c.hex, [me, e.from], 'Victory');
          break;
        }
        case 'peace':
          break;
        case 'nationDefeated':
          if ((e.nation === me || e.by === me) && popupAllowed()) newsDialog(e.nation === me ? 'Nation Defeated' : 'Enemy Defeated', 'war', e.nation === me ? 'Our government has capitulated.' : `${N[e.nation]?.name ?? 'The enemy'} has surrendered to our forces!`, -1, [e.by, e.nation], e.nation === me ? 'Defeat' : 'Triumph');
          break;
        case 'news': {
          const it = e.item;
          seenNews.add(it.id);
          if (it.importance >= 3 && loadOptions().newsPopups) {
            // war declarations on us / captures are covered by dedicated events
            if (it.category === 'war' && it.nations.includes(me) && /declared war/i.test(it.text)) break;
            if (popupAllowed()) newsDialog(it.category === 'war' ? 'Breaking News' : 'World News', it.category, it.text, it.hex, it.nations, it.category === 'war' ? 'Breaking' : it.category);
          }
          break;
        }
      }
    },
    update(dt: number) {
      t -= dt;
      if (t > 0) return;
      t = 0.5;
      // proposals that arrived without an event (e.g. after load)
      for (const p of ctx.state.proposals) if (p.to === ctx.player && !shown.has(p.id)) proposalDialog(p);
      // close dialogs of expired proposals
      for (const [id, d] of open) if (!ctx.state.proposals.some((p) => p.id === id)) d.close();
      if (!current?.open) pump();
    },
    destroy() {
      for (const d of open.values()) d.close();
      current?.close();
    },
  };
}
