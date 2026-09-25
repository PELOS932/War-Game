/**
 * Cabinet tab: head of government, ministers (procedural portraits) and the
 * Supreme Ruler style minister autonomy toggles per department.
 */
import { h, setText, fmtPct, setTip, escapeHTML } from '../../dom';
import { icon, IconName } from '../../icons';
import { bar, toggle, Toggle, Bar } from '../../widgets';
import { portraitURL } from '../../portrait';
import { GOVERNMENT_NAMES, isDemocratic } from '../../../worldgen/types';
import type { Department, Minister, MinisterRole } from '../../../sim/types';
import type { Ctx } from '../context';
import type { TabView } from '../panel';

const ROLE_NAMES: Record<MinisterRole, string> = {
  head: 'Head of Government',
  defense: 'Minister of Defense',
  foreign: 'Minister of Foreign Affairs',
  finance: 'Minister of Finance',
  economy: 'Minister of Economy & Trade',
  research: 'Minister of Science & Technology',
  interior: 'Minister of Interior & Industry',
  intelligence: 'Director of Intelligence',
};

interface DeptDef { id: Department; name: string; role: MinisterRole; icon: IconName; desc: string }
const DEPTS: DeptDef[] = [
  { id: 'economy', name: 'Economy & Budget', role: 'finance', icon: 'coins', desc: 'Taxes, social spending and budget allocations.' },
  { id: 'trade', name: 'Trade & Resources', role: 'economy', icon: 'trade', desc: 'Resource trade policies and world market transactions.' },
  { id: 'production', name: 'Production & Construction', role: 'interior', icon: 'factory', desc: 'Building facilities and military procurement.' },
  { id: 'research', name: 'Research', role: 'research', icon: 'flask', desc: 'Choosing research projects and the research budget.' },
  { id: 'diplomacy', name: 'Foreign Affairs', role: 'foreign', icon: 'handshake', desc: 'Treaties, aid and relations with other nations.' },
  { id: 'military', name: 'Military Operations', role: 'defense', icon: 'tank', desc: 'Commanding units: defense, deployment and offensives.' },
];

function ideologyLabel(v: number): string {
  if (v < -0.6) return 'Hardline';
  if (v < -0.2) return 'Conservative';
  if (v < 0.2) return 'Centrist';
  if (v < 0.6) return 'Liberal';
  return 'Progressive';
}

export function cabinetTab(ctx: Ctx): TabView {
  const { game } = ctx;
  const el = h('div');
  let built = -1;
  const toggles = new Map<Department, Toggle>();
  const bars: { comp: Bar; loy: Bar; m: () => Minister | undefined; compT: HTMLElement; loyT: HTMLElement }[] = [];
  const headInfo = h('div', { class: 'sc-kv', style: 'flex:1' });

  const build = () => {
    el.replaceChildren();
    toggles.clear();
    bars.length = 0;
    const n = ctx.me;
    built = n.id;
    const head = n.ministers.find((m) => m.role === 'head');
    const hsCanvas = h('img', { src: portraitURL(n.leaderName, 70, 82, { age: 0.7 }), width: 70, height: 82, style: 'border:1px solid #000;box-shadow:0 0 0 1px rgba(240,168,48,.5)' });
    el.append(
      h('div', { class: 'sc-headstate sc-inset' },
        hsCanvas,
        h('div', { style: 'flex:1;min-width:0' },
          h('div', { style: 'font-size:10px;color:var(--sc-amber);letter-spacing:.1em;text-transform:uppercase;font-weight:700' }, n.leaderTitle),
          h('div', { style: 'font-size:16px;font-weight:800;color:#fff' }, n.leaderName),
          h('div', { class: 'sc-dim', style: 'margin-bottom:4px' }, GOVERNMENT_NAMES[n.government]),
          headInfo,
        ),
      ),
      h('div', { class: 'sc-sechead' }, 'Departments & Autonomy', h('span', { class: 'sc-grow' }),
        (() => {
          const b = h('button', { class: 'sc-btn sm', tip: 'Hand every department to its minister (AI)' }, 'All AI');
          b.addEventListener('click', () => { for (const d of DEPTS) game.setAutonomy(n.id, d.id, true); ctx.dirty(); });
          return b;
        })(),
        (() => {
          const b = h('button', { class: 'sc-btn sm', tip: 'Take personal control of every department' }, 'All manual');
          b.addEventListener('click', () => { for (const d of DEPTS) game.setAutonomy(n.id, d.id, false); ctx.dirty(); });
          return b;
        })(),
      ),
      h('div', { class: 'sc-dim', style: 'font-size:10.5px;margin:0 2px 6px' }, 'Departments set to AI are managed by their minister. Competent ministers make better decisions.'),
    );
    const ministerCard = (m: Minister | undefined, role: MinisterRole, dept?: DeptDef) => {
      const name = m?.name ?? 'Vacant';
      const img = h('img', { src: portraitURL(name, 46, 54, { military: role === 'defense' || role === 'intelligence' && name.length % 2 === 0 }), width: 46, height: 54, style: 'border:1px solid #000;box-shadow:0 0 0 1px rgba(255,255,255,.12);flex:none' });
      const comp = bar('auto');
      const loy = bar('blue');
      const compT = h('span');
      const loyT = h('span');
      bars.push({ comp, loy, compT, loyT, m: () => ctx.me.ministers.find((x) => x.role === role) });
      const info = h('div', { class: 'info' },
        h('div', { class: 'role' }, dept ? h('span', { html: icon(dept.icon), style: 'margin-right:4px' }) : null, dept ? dept.name : ROLE_NAMES[role]),
        h('div', { class: 'nm' }, name),
        h('div', { class: 'sc-dim', style: 'font-size:10px' }, `${ROLE_NAMES[role]}${m ? ' · ' + ideologyLabel(m.ideology) : ''}`),
        h('div', { class: 'bars' }, h('span', null, 'Competence'), comp.el, compT, h('span', null, 'Loyalty'), loy.el, loyT),
      );
      const ctl = h('div', { class: 'ctl' });
      if (dept) {
        const t = toggle('AI', !!ctx.me.autonomy[dept.id], (on) => {
          ctx.run(game.setAutonomy(ctx.me.id, dept.id, on), on ? `${dept.name} delegated to ${name}` : `You now control ${dept.name}`);
        }, `<b>${escapeHTML(dept.name)}</b><br>${escapeHTML(dept.desc)}<div class="tt-sep"></div>On: the minister manages this department.<br>Off: you are in direct control.`);
        toggles.set(dept.id, t);
        ctl.append(t.el);
      }
      const card = h('div', { class: 'sc-minister sc-inset' }, img, info, ctl);
      if (m) setTip(img, `<div class="tt-title">${escapeHTML(m.name)}</div>${ROLE_NAMES[role]}<div class="tt-sep"></div>Competence ${(m.competence * 100).toFixed(0)}%<br>Loyalty ${(m.loyalty * 100).toFixed(0)}%<br>Ideology: ${ideologyLabel(m.ideology)}`);
      return card;
    };
    for (const d of DEPTS) el.appendChild(ministerCard(n.ministers.find((m) => m.role === d.role), d.role, d));
    el.appendChild(h('div', { class: 'sc-sechead' }, 'Other Cabinet Members'));
    for (const role of ['interior', 'intelligence'] as MinisterRole[]) {
      if (DEPTS.some((d) => d.role === role)) continue;
      el.appendChild(ministerCard(n.ministers.find((m) => m.role === role), role));
    }
    void head;
  };

  return {
    id: 'cabinet', title: 'Cabinet & Government', icon: 'cabinet', tip: 'Ministers and department autonomy (AI delegation)', el,
    update() {
      const n = ctx.me;
      if (!n) return;
      if (built !== n.id) build();
      for (const [d, t] of toggles) t.set(!!n.autonomy[d]);
      for (const b of bars) {
        const m = b.m();
        b.comp.set(m?.competence ?? 0);
        b.loy.set(m?.loyalty ?? 0);
        setText(b.compT, m ? (m.competence * 100).toFixed(0) : '—');
        setText(b.loyT, m ? (m.loyalty * 100).toFixed(0) : '—');
      }
      const elect = (n as { nextElectionDay?: number }).nextElectionDay;
      const day = Math.floor(game.state.hour / 24);
      headInfo.innerHTML =
        `<div class="k">Approval</div><div class="v ${n.approval < 35 ? 'neg' : n.approval > 60 ? 'pos' : ''}">${n.approval.toFixed(1)}%</div>` +
        `<div class="k">Unemployment</div><div class="v">${fmtPct(n.unemployment)}</div>` +
        (isDemocratic(n.government) ? `<div class="k">Next election</div><div class="v">${elect !== undefined && elect >= 0 ? `in ${Math.max(0, elect - day)} days` : '—'}</div>` : `<div class="k">Regime stability</div><div class="v">${n.approval > 40 ? 'Stable' : 'Fragile'}</div>`);
    },
  };
}
