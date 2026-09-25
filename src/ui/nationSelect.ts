/**
 * Nation selection over the live 3D map. The player clicks a country on the
 * map or picks it from a searchable, sortable list, then leads it.
 */
import { h, clear, fmtMoney, fmtPop, fmtNum, escapeHTML, setTip } from './dom';
import { icon } from './icons';
import { flagImg, flagHTML, barHTML, starsHTML, DIFFICULTY_NAMES, relColor } from './widgets';
import { installTooltips } from './tooltip';
import { HexGrid } from '../core/hex';
import { MapMode } from '../render/api';
import type { MapRenderer } from '../render/api';
import { GOVERNMENT_NAMES, WorldData, NationSeed } from '../worldgen/types';

interface NInfo {
  seed: NationSeed;
  hexes: number[];
  difficulty: number; // 1..5
  power: number;
  borders: number[];
  gdpRank: number;
  milRank: number;
  cx: number;
  cz: number;
  extent: number;
}

type SortKey = 'name' | 'pop' | 'gdp' | 'mil' | 'diff';

export function analyseNations(world: WorldData): NInfo[] {
  const n = world.nations.length;
  const grid = new HexGrid(world.settings.cols, world.settings.rows);
  const hexes: number[][] = world.nations.map(() => []);
  const borderSets: Set<number>[] = world.nations.map(() => new Set<number>());
  const own = world.hexOwner;
  for (let i = 0; i < own.length; i++) {
    const o = own[i];
    if (!o) continue;
    hexes[o - 1].push(i);
    for (let d = 0; d < 6; d++) {
      const nb = grid.neighbours[i * 6 + d];
      if (nb < 0) continue;
      const on = own[nb];
      if (on && on !== o) borderSets[o - 1].add(on - 1);
    }
  }
  const infos: NInfo[] = world.nations.map((s, id) => {
    const hs = hexes[id];
    let sx = 0, sz = 0, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const hx of hs) {
      const x = grid.cx[hx], z = grid.cz[hx];
      sx += x; sz += z;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const cap = s.capitalHex >= 0 && s.capitalHex < grid.count ? s.capitalHex : hs[0] ?? 0;
    const extent = hs.length ? Math.max(maxX - minX, maxZ - minZ) : 10;
    const power = 0.55 * Math.log10(Math.max(1, s.gdp)) + 0.4 * Math.log10(s.activeMilitary + 1) + 1.1 * s.techLevel + (s.nuclear ? 0.35 : 0) + 0.05 * (s.navyRating + s.airRating) / 2;
    return {
      seed: s, hexes: hs, difficulty: 3, power, borders: [...borderSets[id]], gdpRank: 0, milRank: 0,
      cx: grid.cx[cap] ?? sx / Math.max(1, hs.length), cz: grid.cz[cap] ?? sz / Math.max(1, hs.length), extent,
    };
  });
  // Threat from hostile neighbours lowers the effective score.
  for (const inf of infos) {
    const id = inf.seed.id;
    let threat = 0;
    for (let j = 0; j < n; j++) {
      if (j === id) continue;
      const rel = world.relations[id * n + j];
      if (rel < -30) {
        const other = infos[j];
        const bordering = inf.borders.includes(j) ? 1 : 0.35;
        threat += Math.max(0, other.power - inf.power * 0.8) * bordering * (-rel / 100) * 0.5;
      }
    }
    (inf as NInfo & { score: number }).score = inf.power - threat;
  }
  const byScore = [...infos].sort((a, b) => (b as NInfo & { score: number }).score - (a as NInfo & { score: number }).score);
  byScore.forEach((inf, i) => {
    const q = i / Math.max(1, byScore.length - 1);
    inf.difficulty = q < 0.06 ? 1 : q < 0.22 ? 2 : q < 0.5 ? 3 : q < 0.8 ? 4 : 5;
  });
  [...infos].sort((a, b) => b.seed.gdp - a.seed.gdp).forEach((inf, i) => (inf.gdpRank = i + 1));
  [...infos].sort((a, b) => b.seed.activeMilitary - a.seed.activeMilitary).forEach((inf, i) => (inf.milRank = i + 1));
  return infos;
}

export function showNationSelect(root: HTMLElement, world: WorldData, renderer: MapRenderer): Promise<number> {
  installTooltips();
  return new Promise<number>((resolve) => {
    const infos = analyseNations(world).filter((i) => i.hexes.length > 0 || i.seed.capitalHex >= 0);
    const byId = new Map<number, NInfo>();
    for (const i of infos) byId.set(i.seed.id, i);
    let active = true;
    let selected = -1;
    let sortKey: SortKey = 'gdp';
    let sortAsc = false;
    let filter = '';

    try {
      renderer.setMapMode(MapMode.Political);
    } catch {
      /* renderer not ready */
    }

    // ------------------------------------------------------------- list panel
    const search = h('input', { class: 'sc-input', placeholder: 'Search nations…', type: 'text', spellcheck: false }) as HTMLInputElement;
    const tbody = h('tbody');
    const heads: Record<SortKey, HTMLTableCellElement> = {
      name: h('th', { class: 'sortable' }, 'Nation'),
      pop: h('th', { class: 'sortable num' }, 'Pop.'),
      gdp: h('th', { class: 'sortable num' }, 'GDP'),
      mil: h('th', { class: 'sortable num' }, 'Military'),
      diff: h('th', { class: 'sortable ctr' }, 'Difficulty'),
    };
    (Object.keys(heads) as SortKey[]).forEach((k) =>
      heads[k].addEventListener('click', () => {
        if (sortKey === k) sortAsc = !sortAsc;
        else {
          sortKey = k;
          sortAsc = k === 'name' || k === 'diff';
        }
        renderList();
      }),
    );
    const table = h('table', { class: 'sc-table' }, h('thead', null, h('tr', null, heads.name, heads.pop, heads.gdp, heads.mil, heads.diff)), tbody);
    const countLbl = h('span', { class: 'sc-dim', style: 'font-weight:400;letter-spacing:0;text-transform:none' });
    const randomBtn = h('button', { class: 'sc-btn', tip: 'Pick a random nation' }, h('span', { html: icon('patrol') }), 'Random');
    const listPanel = h('div', { class: 'sc-ns-list sc-panel' },
      h('div', { class: 'sc-titlebar' }, h('span', { html: icon('globe') }), 'Nations of the World', h('span', { class: 'sc-grow' }), countLbl),
      h('div', { class: 'sc-ns-tools' }, h('span', { html: icon('search'), class: 'sc-dim' }), search, randomBtn),
      h('div', { class: 'sc-ns-tablewrap sc-inset sc-scroll' }, table),
    );
    const rowEls = new Map<number, HTMLTableRowElement>();

    const renderList = () => {
      (Object.keys(heads) as SortKey[]).forEach((k) => {
        heads[k].classList.toggle('sorted', k === sortKey);
        heads[k].classList.toggle('asc', k === sortKey && sortAsc);
      });
      const f = filter.trim().toLowerCase();
      const list = infos.filter((i) => !f || i.seed.name.toLowerCase().includes(f) || i.seed.code.toLowerCase().includes(f) || i.seed.formalName.toLowerCase().includes(f));
      const val = (i: NInfo): number | string =>
        sortKey === 'name' ? i.seed.name : sortKey === 'pop' ? i.seed.population : sortKey === 'gdp' ? i.seed.gdp : sortKey === 'mil' ? i.seed.activeMilitary : i.difficulty;
      list.sort((a, b) => {
        const va = val(a), vb = val(b);
        let c = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
        if (c === 0) c = b.seed.gdp - a.seed.gdp;
        return sortAsc ? c : -c;
      });
      clear(tbody);
      for (const i of list) {
        let tr = rowEls.get(i.seed.id);
        if (!tr) {
          const s = i.seed;
          tr = h('tr', { class: 'clickable' },
            h('td', null, h('div', { class: 'sc-row', style: 'gap:6px' }, flagImg(s.flag, 13), h('span', { class: 'sc-nowrap', style: 'max-width:150px' }, s.name))),
            h('td', { class: 'num' }, fmtPop(s.population)),
            h('td', { class: 'num' }, fmtMoney(s.gdp)),
            h('td', { class: 'num' }, fmtNum(s.activeMilitary) + 'K'),
            h('td', { class: 'ctr', html: `<span class="sc-diff-${i.difficulty}">${starsHTML(i.difficulty).replace('sc-stars', 'sc-stars sc-diff-' + i.difficulty)}</span>` }),
          );
          setTip(tr.cells[4], `<b>${DIFFICULTY_NAMES[i.difficulty]}</b>`);
          tr.addEventListener('click', () => select(i.seed.id, true));
          tr.addEventListener('dblclick', () => lead());
          rowEls.set(i.seed.id, tr);
        }
        tr.classList.toggle('sel', i.seed.id === selected);
        tbody.appendChild(tr);
      }
      countLbl.textContent = `${list.length} nations`;
    };
    search.addEventListener('input', () => {
      filter = search.value;
      renderList();
    });
    search.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const first = tbody.querySelector('tr') as HTMLTableRowElement | null;
        first?.click();
      }
    });
    randomBtn.addEventListener('click', () => {
      const pick = infos[Math.floor(Math.random() * infos.length)];
      select(pick.seed.id, true);
    });

    // ---------------------------------------------------------- detail panel
    const detailBody = h('div', { class: 'body sc-scroll' });
    const leadBtn = h('button', { class: 'sc-btn primary big', disabled: true }, h('span', { html: icon('flag') }), 'Lead this Nation');
    leadBtn.addEventListener('click', () => lead());
    const detail = h('div', { class: 'sc-ns-detail sc-panel' },
      h('div', { class: 'sc-titlebar' }, h('span', { html: icon('flag') }), 'Nation Briefing'),
      detailBody,
      h('div', { class: 'sc-ns-lead' }, leadBtn),
    );

    const banner = h('div', { class: 'sc-ns-banner sc-panel' },
      h('div', { class: 'sc-titlebar' }, 'Choose Your Nation'),
      h('div', { class: 'sub' }, 'January 1, 2030 — Click a country on the map or select it from the list'),
    );
    const hoverName = h('div', { class: 'sc-hovername sc-panel sc-hidden' });

    const screen = h('div', { class: 'sc-ns' }, banner, listPanel, detail, hoverName);
    root.appendChild(screen);

    const nameOf = (id: number) => world.nations[id]?.name ?? '?';

    const renderDetail = () => {
      clear(detailBody);
      const inf = byId.get(selected);
      if (!inf) {
        detailBody.appendChild(h('div', { class: 'sc-empty', style: 'padding:40px 10px' },
          h('div', { html: icon('globe'), style: 'color:#f0a830;margin-bottom:8px' }),
          'Select a nation to view its briefing.'));
        leadBtn.disabled = true;
        return;
      }
      leadBtn.disabled = false;
      const s = inf.seed;
      const n = world.nations.length;
      const capital = s.capitalName || world.cities.find((c) => c.nation === s.id && c.capital)?.name || '—';
      const gdpPc = (s.gdp * 1e9) / Math.max(1, s.population * 1e6);
      const blocs = s.blocs.map((b) => world.blocs[b]).filter(Boolean);
      const friends: number[] = [];
      const rivals: number[] = [];
      for (let j = 0; j < n; j++) {
        if (j === s.id) continue;
        const r = world.relations[s.id * n + j];
        if (r >= 50) friends.push(j);
        else if (r <= -35) rivals.push(j);
      }
      friends.sort((a, b) => world.relations[s.id * n + b] - world.relations[s.id * n + a]);
      rivals.sort((a, b) => world.relations[s.id * n + a] - world.relations[s.id * n + b]);
      const flagList = (ids: number[], max = 10) => {
        const wrap = h('div', { class: 'sc-row sc-wrap', style: 'gap:3px' });
        ids.slice(0, max).forEach((j) => {
          const f = flagImg(world.nations[j].flag, 13, () => {
            const rel = world.relations[s.id * n + j];
            return `<div class="tt-title">${flagHTML(world.nations[j].flag, 12)} ${escapeHTML(world.nations[j].name)}</div>Relation: <b style="color:${relColor(rel)}">${rel > 0 ? '+' : ''}${rel}</b>`;
          });
          f.style.cursor = 'pointer';
          f.addEventListener('click', () => select(j, true));
          wrap.appendChild(f);
        });
        if (ids.length > max) wrap.appendChild(h('span', { class: 'sc-dim' }, `+${ids.length - max}`));
        if (!ids.length) wrap.appendChild(h('span', { class: 'sc-dimmer' }, 'None'));
        return wrap;
      };
      const kv = (k: string, v: string | Node, cls = '') => [h('div', { class: 'k' }, k), h('div', { class: 'v ' + cls }, v)];
      detailBody.append(
        h('div', { class: 'sc-ns-head' },
          flagImg(s.flag, 56),
          h('div', { class: 'names' },
            h('div', { class: 'n1' }, s.name),
            h('div', { class: 'n2' }, s.formalName),
            h('div', { class: 'sc-row', style: 'margin-top:5px;gap:4px;flex-wrap:wrap' },
              ...blocs.map((b) => {
                const t = h('span', { class: 'sc-tag', style: `background:${b.color};color:#fff;text-shadow:0 1px 0 #000` }, b.short);
                setTip(t, `<b>${escapeHTML(b.name)}</b>${b.military ? '<br>Mutual defence alliance' : ''}`);
                return t;
              }),
              s.nuclear ? h('span', { class: 'sc-tag red', tip: 'Nuclear-armed state' }, '☢ NUCLEAR') : null,
            ),
          ),
        ),
        h('div', { class: 'sc-sechead' }, 'Difficulty', h('span', { class: 'sc-grow' }),
          h('span', { html: `<span class="sc-diff-${inf.difficulty}" style="letter-spacing:0;text-transform:none">${DIFFICULTY_NAMES[inf.difficulty]}</span> ${starsHTML(inf.difficulty)}` })),
        h('div', { class: 'sc-sechead' }, 'Government'),
        h('div', { class: 'sc-kv' },
          ...kv('System', GOVERNMENT_NAMES[s.government]),
          ...kv(s.leaderTitle, s.leaderName),
          ...kv('Capital', capital),
        ),
        h('div', { class: 'sc-sechead' }, 'Economy & Society'),
        h('div', { class: 'sc-kv' },
          ...kv('Population', fmtPop(s.population)),
          ...kv('GDP', `${fmtMoney(s.gdp)}  (#${inf.gdpRank})`),
          ...kv('GDP per capita', '$' + fmtNum(gdpPc)),
          ...kv('Development', h('span', { html: barHTML(s.development, 'blue', 110) })),
          ...kv('Technology', h('span', { html: barHTML(s.techLevel, 'amber', 110) })),
          ...kv('Territory', `${fmtNum(inf.hexes.length)} hexes`),
        ),
        h('div', { class: 'sc-sechead' }, 'Armed Forces'),
        h('div', { class: 'sc-kv' },
          ...kv('Active personnel', `${fmtNum(s.activeMilitary)}K  (#${inf.milRank})`),
          ...kv('Defence budget', `${s.defenseBudget.toFixed(1)}% of GDP`),
          ...kv('Air force', h('span', { html: barHTML(s.airRating / 10, 'blue', 110) })),
          ...kv('Navy', h('span', { html: barHTML(s.navyRating / 10, 'blue', 110) })),
        ),
        h('div', { class: 'sc-sechead' }, 'Neighbours'),
        flagList(inf.borders.sort((a, b) => world.nations[b].gdp - world.nations[a].gdp), 14),
        h('div', { class: 'sc-sechead' }, 'Friends'),
        flagList(friends),
        h('div', { class: 'sc-sechead' }, 'Rivals'),
        flagList(rivals),
      );
    };

    const select = (id: number, fly: boolean) => {
      if (!active) return;
      const inf = byId.get(id);
      if (!inf) return;
      selected = id;
      for (const [nid, tr] of rowEls) tr.classList.toggle('sel', nid === id);
      const row = rowEls.get(id);
      if (row && row.isConnected) row.scrollIntoView({ block: 'nearest' });
      renderDetail();
      try {
        renderer.setHexHighlight(inf.hexes, '#ffc040');
        if (fly) {
          const dist = Math.max(28, Math.min(420, inf.extent * 1.5 + 18));
          renderer.focusOn(inf.cx, inf.cz, dist);
        }
      } catch (e) {
        console.warn('[ui] renderer highlight failed', e);
      }
    };

    const lead = () => {
      if (!active || selected < 0) return;
      active = false;
      window.removeEventListener('keydown', onKey);
      try {
        renderer.setHexHighlight([], '#ffc040');
      } catch {
        /* ignore */
      }
      screen.style.transition = 'opacity .3s';
      screen.style.opacity = '0';
      setTimeout(() => screen.remove(), 320);
      resolve(selected);
    };

    renderer.onClick((e) => {
      if (!active || e.hex < 0) return;
      const o = world.hexOwner[e.hex];
      if (o > 0) {
        select(o - 1, false);
        if (e.double) lead();
      }
    });
    renderer.onHover((hex, _u, x, y) => {
      if (!active) return;
      const o = hex >= 0 ? world.hexOwner[hex] : 0;
      if (o > 0) {
        const s = world.nations[o - 1];
        hoverName.innerHTML = `${flagHTML(s.flag, 13)}<span>${escapeHTML(s.name)}</span>`;
        hoverName.classList.remove('sc-hidden');
        hoverName.style.left = x + 16 + 'px';
        hoverName.style.top = y + 14 + 'px';
      } else hoverName.classList.add('sc-hidden');
    });
    renderer.canvas.addEventListener('mouseleave', () => hoverName.classList.add('sc-hidden'));

    const onKey = (e: KeyboardEvent) => {
      if (!active) return;
      if (e.key === 'Enter' && document.activeElement !== search) lead();
    };
    window.addEventListener('keydown', onKey);

    void nameOf;
    renderList();
    renderDetail();
  });
}
