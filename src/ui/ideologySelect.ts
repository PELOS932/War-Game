/**
 * Ideology selection (after choosing a nation): Supreme Ruler style cards
 * with effects, plus a detail panel previewing the government, title,
 * approval shock, bloc expulsions and diplomatic reactions.
 *
 *   showIdeologySelect(root, game, nationId, leader) → Promise<IdeologyId | null>  (null = back)
 */
import './leader.css';
import { h, clear, append, escapeHTML, setTip } from './dom';
import { icon } from './icons';
import { flagImg, flagHTML } from './widgets';
import { installTooltips } from './tooltip';
import { leaderPortraitURL } from './leaderPortrait';
import type { GameAPI } from '../sim/api';
import type { NationId } from '../sim/types';
import type { LeaderProfile } from '../sim/leaderProfile';
import { GOVERNMENT_NAMES } from '../worldgen/types';
import {
  IDEOLOGIES, ideologyEffects, previewIdeology, realIdeologyOf, type IdeologyDef, type IdeologyId,
} from '../sim/ideology';

const S = (body: string, vb = '0 0 24 24') => `<svg viewBox="${vb}" class="sc-ideo-emblem" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

/** Simple emblem glyphs (inline SVG). */
export const IDEOLOGY_EMBLEMS: Record<IdeologyId, string> = {
  liberalDemocracy: S('<path d="M12 3v17M7 20h10M5 6h14"/><path d="M5 6l-3 6a3 3 0 0 0 6 0zM19 6l-3 6a3 3 0 0 0 6 0z" fill="currentColor" fill-opacity=".25"/><circle cx="12" cy="3.5" r="1.2" fill="currentColor"/>'),
  socialDemocracy: S('<path d="M12 21v-8M12 16c-2-2-4.5-2-6-1M12 13c3 0 5-2 5-5-2 0-3 .5-5 2-2-1.5-3-2-5-2 0 3 2 5 5 5z" /><path d="M9 6.5c0-2 1.5-3.5 3-3.5s3 1.5 3 3.5" fill="currentColor" fill-opacity=".35"/>'),
  conservatism: S('<path d="M4 21h16M5 18h14M6 18V9M10 18V9M14 18V9M18 18V9M4 8l8-5 8 5z"/><path d="M4 8h16" />'),
  libertarian: S('<circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.6-1-1.7-1.5-3-1.5-1.8 0-3 .9-3 2.3 0 3.2 6 1.8 6 5 0 1.4-1.3 2.4-3 2.4-1.5 0-2.7-.6-3.2-1.7M12 5.5v13"/>'),
  socialism: S('<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/><circle cx="12" cy="12" r="6.5"/>'),
  communism: S('<path d="M7.5 5.5c-3.5 3.5-3 9 .8 11.8 3.5 2.6 8.3 1.7 10.2-1.8" /><path d="M5 20l5-5" /><path d="M12.5 9.5l6-6M15.5 3.5l3 3M11 11l-6.5 6.5" stroke-width="2"/><path d="M19 11l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z" fill="currentColor" stroke-width="1"/>'),
  fascism: S('<path d="M9 5h6v14H9z" fill="currentColor" fill-opacity=".2"/><path d="M10.5 5v14M12 5v14M13.5 5v14M8.5 8h7M8.5 16h7"/><path d="M15 6.5h3.5c1 1.5 1 3.5 0 5H15" fill="currentColor" fill-opacity=".45"/><path d="M12 3v2M12 19v2.5"/>'),
  nationalism: S('<path d="M12 2.5l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6z" fill="currentColor" fill-opacity=".18"/><path d="M12 7.5l1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4z" fill="currentColor" stroke-width="1"/>'),
  absoluteMonarchy: S('<path d="M4 18h16l1.5-10-5 4L12 5l-4.5 7-5-4z" fill="currentColor" fill-opacity=".3"/><path d="M4 21h16"/><circle cx="12" cy="4" r="1" fill="currentColor"/><circle cx="2.5" cy="7.5" r="1" fill="currentColor"/><circle cx="21.5" cy="7.5" r="1" fill="currentColor"/>'),
  theocracy: S('<path d="M12 2l2.2 5.3L19.8 5l-2.3 5.6L23 12l-5.5 1.4 2.3 5.6-5.6-2.3L12 22l-2.2-5.3L4.2 19l2.3-5.6L1 12l5.5-1.4L4.2 5l5.6 2.3z" fill="currentColor" fill-opacity=".2"/><circle cx="12" cy="12" r="3.2"/>'),
  militaryJunta: S('<path d="M4 4l12 12M20 4L8 16M3 17l3 3M21 17l-3 3M6 15l3 3M18 15l-3 3"/><path d="M12 1.8l.9 1.9 2 .3-1.5 1.4.4 2-1.8-1-1.8 1 .4-2L9.1 4l2-.3z" fill="currentColor" stroke-width="1"/>'),
};

export function showIdeologySelect(root: HTMLElement, game: GameAPI, nationId: NationId, leader: LeaderProfile | null): Promise<IdeologyId | null> {
  installTooltips();
  return new Promise((resolve) => {
    const st = game.state;
    const n = st.nations[nationId];
    const origin = realIdeologyOf(n);
    let selected: IdeologyId = origin;
    const gender = leader?.gender ?? 'male';

    // ---------------------------------------------------------------- header
    const portrait = leader
      ? h('img', { class: 'sc-ideo-portrait', src: leaderPortraitURL(leader, 78, 94, { flag: n.flag }), width: 78, height: 94 })
      : null;
    const header = h('div', { class: 'sc-ideo-header sc-panel' },
      portrait,
      flagImg(n.flag, 44),
      h('div', { class: 'names' },
        h('div', { class: 'l0' }, 'Choose Your Ideology'),
        h('div', { class: 'l1' }, `${leader?.name ?? n.leaderName} — ${n.name}`),
        h('div', { class: 'l2 sc-dim' }, `Current system: ${GOVERNMENT_NAMES[n.government]} (${IDEOLOGIES.find((d) => d.id === origin)?.name ?? ''}). Keeping it avoids any transition shock.`),
      ),
    );

    // ----------------------------------------------------------------- cards
    const cardsEl = h('div', { class: 'sc-ideo-cards sc-scroll' });
    const cardEls = new Map<IdeologyId, HTMLElement>();
    for (const def of IDEOLOGIES) {
      const effects = ideologyEffects(def);
      const top = effects.filter((e) => e.good !== null).slice(0, 4);
      const card = h('div', { class: 'sc-ideo-card' + (def.id === origin ? ' origin' : ''), style: `--ic:${def.color}` },
        h('div', { class: 'stripe' }),
        h('div', { class: 'head' },
          h('div', { class: 'emb', html: IDEOLOGY_EMBLEMS[def.id] }),
          h('div', { class: 'tt' },
            h('div', { class: 'nm' }, def.name),
            h('div', { class: 'gov' }, GOVERNMENT_NAMES[def.id === origin ? n.government : def.government]),
          ),
        ),
        h('div', { class: 'motto' }, `“${def.motto}”`),
        h('div', { class: 'fx' }, ...top.map((e) => h('div', { class: e.good ? 'pos' : 'neg' }, h('span', null, e.label), h('b', null, e.text)))),
        def.id === origin ? h('div', { class: 'cur' }, 'Current system') : null,
      );
      card.addEventListener('click', () => select(def.id));
      card.addEventListener('dblclick', () => { select(def.id); proclaim(); });
      cardEls.set(def.id, card);
      cardsEl.appendChild(card);
    }

    // ---------------------------------------------------------------- detail
    const detailBody = h('div', { class: 'body sc-scroll' });
    const goBtn = h('button', { class: 'sc-btn primary big' });
    const backBtn = h('button', { class: 'sc-btn big', tip: 'Choose another nation' }, h('span', { html: icon('chevLeft') }), 'Back');
    const detail = h('div', { class: 'sc-ideo-detail sc-panel' },
      h('div', { class: 'sc-titlebar' }, h('span', { html: icon('cabinet') }), 'Government Briefing'),
      detailBody,
    );
    const footer = h('div', { class: 'sc-ideo-footer' }, backBtn, h('span', { class: 'sc-grow' }), goBtn);
    const wrap = h('div', { class: 'sc-ideo-wrap' }, header, h('div', { class: 'sc-ideo-main' }, cardsEl, detail), footer);
    const screen = h('div', { class: 'sc-screen sc-ideo' }, wrap);
    root.appendChild(screen);

    const flags = (ids: number[], max: number) => {
      const row = h('div', { class: 'sc-row sc-wrap', style: 'gap:3px' });
      for (const id of ids.slice(0, max)) {
        const o = st.nations[id];
        row.appendChild(flagImg(o.flag, 14, `<div class="tt-title">${flagHTML(o.flag, 12)} ${escapeHTML(o.name)}</div>`));
      }
      if (ids.length > max) row.appendChild(h('span', { class: 'sc-dim' }, `+${ids.length - max}`));
      if (!ids.length) row.appendChild(h('span', { class: 'sc-dimmer' }, 'None'));
      return row;
    };

    const renderDetail = () => {
      const def = IDEOLOGIES.find((d) => d.id === selected) as IdeologyDef;
      const pv = previewIdeology(game, nationId, selected, gender);
      const title = leader?.title || pv.title;
      clear(detailBody);
      const effects = ideologyEffects(def);
      append(detailBody, [
        h('div', { class: 'sc-ideo-dhead', style: `--ic:${def.color}` },
          h('div', { class: 'emb', html: IDEOLOGY_EMBLEMS[def.id] }),
          h('div', null,
            h('div', { class: 'nm' }, def.name),
            h('div', { class: 'motto' }, `“${def.motto}”`),
          ),
        ),
        h('div', { class: 'sc-ideo-desc' }, def.description),
        h('div', { class: 'sc-sechead' }, 'Government'),
        h('div', { class: 'sc-kv' },
          h('div', { class: 'k' }, 'System'), h('div', { class: 'v' }, GOVERNMENT_NAMES[pv.government]),
          h('div', { class: 'k' }, 'Your title'), h('div', { class: 'v' }, title),
          h('div', { class: 'k' }, 'Elections'), h('div', { class: 'v' }, pv.government <= 3 ? 'Yes — every 4 years' : 'None'),
        ),
        h('div', { class: 'sc-sechead' }, 'National Effects'),
        h('div', { class: 'sc-ideo-fxlist' }, ...effects.map((e) => h('div', { class: e.good === null ? '' : e.good ? 'pos' : 'neg' }, h('span', null, e.label), h('b', null, e.text)))),
        h('div', { class: 'sc-sechead' }, 'Transition'),
        pv.keep
          ? h('div', { class: 'sc-ideo-note pos' }, h('span', { html: icon('check') }), 'Continuity: no approval shock and no diplomatic upheaval.')
          : h('div', { class: 'sc-ideo-note neg' }, h('span', { html: icon('warning') }), `Regime change: approval −${pv.approvalHit}, law & order and growth fall for a while. The world will react.`),
        pv.blocsLost.length
          ? h('div', { class: 'sc-ideo-note neg' }, h('span', { html: icon('exit') }), 'Expelled from: ', ...pv.blocsLost.map((b) => h('span', { class: 'sc-tag red', style: 'margin-left:4px' }, b)))
          : null,
        pv.keep ? null : h('div', { class: 'sc-sechead' }, 'Relations Improve With'),
        pv.keep ? null : flags(pv.friends, 18),
        pv.keep ? null : h('div', { class: 'sc-sechead' }, 'Relations Worsen With'),
        pv.keep ? null : flags(pv.enemies, 18),
      ]);
      goBtn.replaceChildren(h('span', { html: icon('flag') }), pv.keep ? `Keep ${def.name}` : `Proclaim ${def.name}`);
    };

    const select = (id: IdeologyId) => {
      selected = id;
      for (const [k, el] of cardEls) el.classList.toggle('sel', k === id);
      renderDetail();
    };

    let done = false;
    const finish = (r: IdeologyId | null) => {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', onKey);
      screen.style.transition = 'opacity .3s';
      screen.style.opacity = '0';
      screen.style.pointerEvents = 'none';
      setTimeout(() => screen.remove(), 320);
      resolve(r);
    };
    const proclaim = () => finish(selected);
    goBtn.addEventListener('click', proclaim);
    backBtn.addEventListener('click', () => finish(null));
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.sc-dialog')) return;
      if (e.key === 'Enter') proclaim();
      else if (e.key === 'Escape') finish(null);
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const i = IDEOLOGIES.findIndex((d) => d.id === selected);
        const j = (i + (e.key === 'ArrowRight' ? 1 : IDEOLOGIES.length - 1)) % IDEOLOGIES.length;
        select(IDEOLOGIES[j].id);
      }
    };
    window.addEventListener('keydown', onKey);
    if (portrait) setTip(portrait, `<b>${escapeHTML(leader?.name ?? '')}</b>`);
    select(origin);
    cardEls.get(origin)?.scrollIntoView({ block: 'nearest' });
  });
}
