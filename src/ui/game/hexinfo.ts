/**
 * Hex information: hover tooltip on the map and the clicked-hex info panel.
 */
import { h, clear, fmtThousands, escapeHTML, fmtNum, setTip } from '../dom';
import { icon, facilityIcon, natoSymbol } from '../icons';
import { flagHTML, barHTML } from '../widgets';
import { report } from '../dialogs';
import { TERRAIN_NAMES, DEPOSIT_NAMES, Terrain, isWaterTerrain, latitudeAt, longitudeAt } from '../../worldgen/types';
import { affiliation, designOf, type Ctx } from './context';

export function climateText(t: number, p: number): string {
  const band = t < -5 ? 'Polar' : t < 3 ? 'Subarctic' : t < 12 ? 'Temperate' : t < 20 ? 'Warm temperate' : 'Tropical';
  const wet = p < 250 ? 'arid' : p < 500 ? 'semi-arid' : p < 1000 ? 'moderate' : p < 2000 ? 'humid' : 'very wet';
  return `${band}, ${wet}`;
}

function latLon(ctx: Ctx, hex: number): string {
  const s = ctx.state.world.settings;
  const lat = latitudeAt(ctx.state.grid.cz[hex], s);
  const lon = longitudeAt(ctx.state.grid.cx[hex], s);
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`;
}

/** Compact HTML description of a hex (shared by tooltip and info panel). */
export function hexDetailsHTML(ctx: Ctx, hex: number, withUnits: boolean): { title: string; body: string } {
  const st = ctx.state;
  const w = st.world;
  const t = w.hexTerrain[hex] as Terrain;
  const owner = st.hexOwner[hex] - 1;
  const core = st.hexCore[hex] - 1;
  const n = owner >= 0 ? st.nations[owner] : null;
  const cid = w.hexCity[hex];
  const city = cid >= 0 ? st.cities[cid] : null;
  const rows: string[] = [];
  const kv = (k: string, v: string) => rows.push(`<div class="k">${k}</div><div class="v">${v}</div>`);
  kv('Terrain', escapeHTML(TERRAIN_NAMES[t] ?? '?'));
  if (n) kv('Controlled by', `${flagHTML(n.flag, 10)} ${escapeHTML(n.name)}`);
  if (core >= 0 && core !== owner) kv('Occupied — core of', `<span class="warn">${flagHTML(st.nations[core]?.flag, 10)} ${escapeHTML(st.nations[core]?.name ?? '?')}</span>`);
  if (!isWaterTerrain(t)) {
    kv('Elevation', `${fmtNum(Math.max(0, w.hexElevation[hex]))} m`);
    kv('Climate', `${climateText(w.hexTemperature[hex], w.hexPrecip[hex])} · ${w.hexTemperature[hex].toFixed(0)}°C`);
    if (w.hexPopulation[hex] > 0.5) kv('Population', fmtThousands(w.hexPopulation[hex]));
  } else kv('Depth', `${fmtNum(Math.max(0, -w.hexElevation[hex]))} m`);
  if (city) kv('City', `${city.capital ? '★ ' : ''}<b>${escapeHTML(city.name)}</b> (${fmtThousands(city.population)})${city.port ? ' ⚓' : ''}`);
  if (w.hexDeposit[hex]) kv('Deposit', `<span class="sc-amber">${escapeHTML(DEPOSIT_NAMES[w.hexDeposit[hex] as keyof typeof DEPOSIT_NAMES] ?? '?')}</span>`);
  const facs = st.hexFacilities.get(hex) ?? [];
  if (facs.length) {
    kv('Facilities', facs.map((id) => {
      const f = st.facilities.get(id);
      if (!f) return '';
      const def = st.facilityDefs[f.type];
      const state = f.constructionDaysLeft > 0 ? ` <span class="warn">(building ${Math.ceil(f.constructionDaysLeft)}d)</span>` : f.damage > 0.05 ? ` <span class="neg">(${Math.round(f.damage * 100)}% dmg)</span>` : '';
      return `${escapeHTML(def?.name ?? '?')} L${f.level}${state}`;
    }).join('<br>'));
  }
  if (ctx.player >= 0 && !isWaterTerrain(t)) {
    const s = ctx.game.supplyAt(ctx.player, hex);
    kv('Our supply', barHTML(s / 100, 'auto', 70) + ` ${s.toFixed(0)}`);
  }
  kv('Location', latLon(ctx, hex));
  let units = '';
  if (withUnits && (ctx.player < 0 || ctx.game.isVisible(ctx.player, hex))) {
    const us = ctx.game.unitsAt(hex).filter((u) => u.nation === ctx.player || !(u as { hidden?: boolean }).hidden);
    if (us.length) {
      units = '<div class="tt-sep"></div><div class="units">' + us.slice(0, 8).map((u) => {
        const d = designOf(st, u);
        const aff = affiliation(ctx.game, ctx.player, u.nation);
        return `<div>${d ? natoSymbol(d.category, aff, 20) : ''}${flagHTML(st.nations[u.nation]?.flag, 9)}<span class="sc-nowrap" style="max-width:150px">${escapeHTML(u.name)}</span><span class="sc-dim" style="margin-left:auto">${u.strength.toFixed(0)}%</span></div>`;
      }).join('') + (us.length > 8 ? `<div class="sc-dim">+${us.length - 8} more</div>` : '') + '</div>';
    }
  }
  const title = city ? city.name : n ? `${TERRAIN_NAMES[t]} — ${n.name}` : TERRAIN_NAMES[t];
  return { title, body: `<div class="sc-kv">${rows.join('')}</div>${units}` };
}

// ---------------------------------------------------------------------------
// Hover tooltip
// ---------------------------------------------------------------------------
export interface MapTip {
  el: HTMLElement;
  hover(hex: number, unitId: number, x: number, y: number): void;
  hide(): void;
  update(dt: number): void;
}

export function createMapTip(ctx: Ctx): MapTip {
  const title = h('span', { class: 'sc-grow sc-nowrap' });
  const flagSlot = h('span');
  const body = h('div', { class: 'body' });
  const el = h('div', { class: 'sc-maptip sc-panel' }, h('div', { class: 'sc-titlebar' }, flagSlot, title), body);
  let hex = -1;
  let unit = -1;
  let px = 0, py = 0;
  let still = 0;
  let shownFor = -2;
  const place = () => {
    const r = el.getBoundingClientRect();
    let x = px + 18, y = py + 20;
    if (x + r.width > window.innerWidth - 8) x = px - r.width - 12;
    if (y + r.height > window.innerHeight - 8) y = py - r.height - 12;
    el.style.left = Math.max(4, x) + 'px';
    el.style.top = Math.max(4, y) + 'px';
  };
  return {
    el,
    hover(hx, u, x, y) {
      if (hx !== hex || u !== unit) {
        hex = hx;
        unit = u;
        still = 0;
        el.classList.remove('show');
        shownFor = -2;
      }
      px = x;
      py = y;
      if (el.classList.contains('show')) place();
    },
    hide() {
      hex = -1;
      el.classList.remove('show');
      shownFor = -2;
    },
    update(dt) {
      if (hex < 0 || ctx.target) {
        if (el.classList.contains('show')) el.classList.remove('show');
        return;
      }
      still += dt;
      if (still < 0.45) return;
      if (shownFor === hex * 100000 + unit) {
        // refresh occasionally (units move)
        if (still % 1 > dt) return;
      }
      shownFor = hex * 100000 + unit;
      const d = hexDetailsHTML(ctx, hex, true);
      title.textContent = d.title;
      const o = ctx.state.hexOwner[hex] - 1;
      flagSlot.innerHTML = o >= 0 ? flagHTML(ctx.state.nations[o]?.flag, 12) : icon('anchor');
      body.innerHTML = d.body;
      el.classList.add('show');
      place();
    },
  };
}

// ---------------------------------------------------------------------------
// Clicked-hex info panel
// ---------------------------------------------------------------------------
export interface HexPanel {
  el: HTMLElement;
  show(hex: number): void;
  hide(): void;
  update(dt: number): void;
  readonly visible: boolean;
}

export function createHexPanel(ctx: Ctx): HexPanel {
  const title = h('span', { class: 'sc-grow sc-nowrap' });
  const flagSlot = h('span');
  const closeBtn = h('button', { class: 'sc-btn sm', html: icon('close') });
  const body = h('div', { class: 'body' });
  const actions = h('div', { class: 'sc-row sc-wrap', style: 'gap:3px;padding:0 8px 8px' });
  const el = h('div', { class: 'sc-hexinfo sc-panel sc-hidden' }, h('div', { class: 'sc-titlebar' }, flagSlot, title, closeBtn), body, actions);
  let hex = -1;
  let t = 0;
  let sig = '';
  closeBtn.addEventListener('click', () => hide());
  const hide = () => {
    hex = -1;
    ctx.infoHex = -1;
    el.classList.add('sc-hidden');
  };
  const render = () => {
    const st = ctx.state;
    const d = hexDetailsHTML(ctx, hex, true);
    title.textContent = d.title;
    const o = st.hexOwner[hex] - 1;
    flagSlot.innerHTML = o >= 0 ? flagHTML(st.nations[o]?.flag, 12) : '';
    body.innerHTML = d.body;
    clear(actions);
    const mine = o === ctx.player;
    for (const id of st.hexFacilities.get(hex) ?? []) {
      const f = st.facilities.get(id);
      if (!f || !mine) continue;
      const def = st.facilityDefs[f.type];
      if (f.level < (def?.maxLevel ?? 1) && f.constructionDaysLeft <= 0) {
        const b = h('button', { class: 'sc-btn sm' }, h('span', { html: facilityIcon(f.type) }), `Upgrade ${def?.name ?? ''} → L${f.level + 1}`);
        setTip(b, `Upgrade to level ${f.level + 1}. Increases output.`);
        b.addEventListener('click', () => {
          report(ctx.game.upgradeFacility(ctx.player, f.id), `${def?.name} upgrade started`);
          sig = '';
          ctx.dirty();
        });
        actions.appendChild(b);
      }
    }
    if (mine) {
      const b = h('button', { class: 'sc-btn sm' }, h('span', { html: icon('hammer') }), 'Build here…');
      b.addEventListener('click', () => ctx.openTab('build', { sub: 'facilities' }));
      actions.appendChild(b);
    } else if (o >= 0) {
      const b = h('button', { class: 'sc-btn sm' }, h('span', { html: icon('handshake') }), 'Diplomacy');
      b.addEventListener('click', () => ctx.openTab('diplomacy', { nation: o }));
      actions.appendChild(b);
    }
  };
  return {
    el,
    get visible() {
      return hex >= 0;
    },
    show(hx) {
      hex = hx;
      ctx.infoHex = hx;
      el.classList.remove('sc-hidden');
      sig = '';
      t = 0;
    },
    hide,
    update(dt) {
      if (hex < 0) return;
      t -= dt;
      if (t > 0) return;
      t = 0.5;
      const st = ctx.state;
      const s = [st.hexOwner[hex], (st.hexFacilities.get(hex) ?? []).map((id) => { const f = st.facilities.get(id); return f ? `${f.level}:${Math.ceil(f.constructionDaysLeft)}` : ''; }).join(','), ctx.game.unitsAt(hex).length, st.facilityVersion].join('|');
      if (s !== sig) {
        sig = s;
        render();
      }
    },
  };
}
