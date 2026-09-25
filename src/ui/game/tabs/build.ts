/**
 * Build tab: procure units (designs by category, city, quantity) and
 * construct facilities (pick a type, then place it on the map).
 */
import { h, setText, setClass, clear, fmtMoney, fmtMillions, fmtNum, escapeHTML, setTip, KeyedList } from '../../dom';
import { icon, natoSymbol, resourceIcon, facilityIcon, RESOURCE_SHORT } from '../../icons';
import { bar } from '../../widgets';
import {
  CATEGORY_NAMES, FacilityType, RESOURCE_NAMES, UnitClass, type Facility, type FacilityDef, type UnitDesign,
} from '../../../sim/types';
import type { Ctx } from '../context';
import type { TabView } from '../panel';

type Sub = 'units' | 'facilities';

export function buildTab(ctx: Ctx): TabView {
  const { game } = ctx;
  let sub: Sub = 'units';
  let cls: UnitClass = UnitClass.Land;
  let selDesign: string | null = null;
  let selFacility: FacilityType | null = null;

  // ---------------------------------------------------------------- sub tabs
  const stUnits = h('div', { class: 'sc-subtab on' }, h('span', { html: icon('tank') }), 'Units');
  const stFac = h('div', { class: 'sc-subtab' }, h('span', { html: icon('factory') }), 'Facilities');
  const subtabs = h('div', { class: 'sc-subtabs' }, stUnits, stFac);
  const unitsPane = h('div');
  const facPane = h('div', { style: 'display:none' });
  const setSub = (s: Sub) => {
    sub = s;
    setClass(stUnits, 'on', s === 'units');
    setClass(stFac, 'on', s === 'facilities');
    unitsPane.style.display = s === 'units' ? '' : 'none';
    facPane.style.display = s === 'facilities' ? '' : 'none';
    update(true);
  };
  stUnits.addEventListener('click', () => setSub('units'));
  stFac.addEventListener('click', () => setSub('facilities'));

  // ---------------------------------------------------------------- units
  const clsChips = h('div', { class: 'sc-chips', style: 'margin-bottom:4px' });
  const clsEls: HTMLElement[] = [];
  ([[UnitClass.Land, 'Land Forces', 'helmet'], [UnitClass.Air, 'Air Force', 'plane'], [UnitClass.Naval, 'Navy', 'anchor']] as const).forEach(([c, label, ico]) => {
    const e = h('span', { class: 'sc-chip' + (c === cls ? ' on' : '') }, h('span', { html: icon(ico) }), label);
    e.addEventListener('click', () => {
      cls = c;
      clsEls.forEach((x, i) => setClass(x, 'on', i === c));
      renderDesigns();
    });
    clsEls.push(e);
    clsChips.appendChild(e);
  });
  const designList = h('div', { class: 'sc-inset sc-scroll', style: 'max-height:260px' });
  const detail = h('div', { class: 'sc-inset', style: 'padding:6px;margin-top:6px' });
  unitsPane.append(clsChips, designList, detail);

  const statCell = (k: string, v: string | number) => h('div', null, h('span', null, k), h('span', null, String(v)));

  const renderDesigns = () => {
    clear(designList);
    const avail = new Set(game.availableDesigns(ctx.player));
    const all = [...ctx.state.designs.values()].filter((d) => d.cls === cls);
    all.sort((a, b) => a.category - b.category || a.generation - b.generation || a.cost - b.cost);
    let lastCat = -1;
    for (const d of all) {
      const ok = avail.has(d.id);
      if (!ok) {
        // show locked designs only if the previous generation is available
        const prev = all.find((x) => x.category === d.category && x.generation === d.generation - 1);
        if (!prev || !avail.has(prev.id)) continue;
      }
      if (d.category !== lastCat) {
        lastCat = d.category;
        designList.appendChild(h('div', { class: 'sc-tier', style: 'margin:4px 6px 2px' }, CATEGORY_NAMES[d.category]));
      }
      const row = h('div', { class: 'sc-design' + (d.id === selDesign ? ' sel' : ''), style: ok ? '' : 'opacity:.5' },
        h('span', { html: natoSymbol(d.category, 'friend', 30) }),
        h('div', { class: 'nm' }, d.name, h('small', null, `${fmtMillions(d.cost)} · ${d.buildDays} days · ${d.personnel.toLocaleString('en-US')} men`)),
        h('span', { class: 'gen sc-tag ' + (ok ? 'amber' : '') }, ok ? `GEN ${d.generation}` : '🔒 ' + (ctx.state.techs.get(d.requiresTech ?? '')?.name ?? 'Locked')),
      );
      row.addEventListener('click', () => {
        selDesign = d.id;
        designList.querySelectorAll('.sc-design.sel').forEach((x) => x.classList.remove('sel'));
        row.classList.add('sel');
        renderDetail();
      });
      designList.appendChild(row);
    }
    if (!designList.children.length) designList.appendChild(h('div', { class: 'sc-empty' }, 'No designs available.'));
    renderDetail();
  };

  const citySel = h('select', { class: 'sc-select', style: 'flex:1;min-width:0' }) as HTMLSelectElement;
  const qty = h('input', { class: 'sc-input num', type: 'number', min: '1', max: '20', value: '1', style: 'width:48px' }) as HTMLInputElement;
  qty.addEventListener('keydown', (e) => e.stopPropagation());
  const totalLbl = h('span', { class: 'sc-dim' });
  const queueBtn = h('button', { class: 'sc-btn primary' }, h('span', { html: icon('plus') }), 'Queue');

  const fillCities = (d: UnitDesign) => {
    const prev = citySel.value;
    clear(citySel);
    const mine = ctx.state.cities.filter((c) => ctx.state.hexOwner[c.hex] === ctx.player + 1);
    mine.sort((a, b) => Number(b.capital) - Number(a.capital) || b.population - a.population);
    let any = false;
    for (const c of mine) {
      const r = game.canBuildUnitAt(ctx.player, d.id, c.id);
      const o = h('option', { value: String(c.id), disabled: !r.ok }, `${c.capital ? '★ ' : ''}${c.name}${r.ok ? '' : ' — ' + (r.reason ?? 'unavailable')}`);
      citySel.appendChild(o);
      if (r.ok && !any) {
        any = true;
        if (!prev) citySel.value = String(c.id);
      }
    }
    if (prev && [...citySel.options].some((o) => o.value === prev && !o.disabled)) citySel.value = prev;
    else {
      const first = [...citySel.options].find((o) => !o.disabled);
      if (first) citySel.value = first.value;
    }
    queueBtn.disabled = !any;
  };

  const updateTotal = () => {
    const d = selDesign ? ctx.state.designs.get(selDesign) : undefined;
    if (!d) return;
    const n = Math.max(1, Math.min(20, Number(qty.value) || 1));
    setText(totalLbl, `Total ${fmtMillions(d.cost * n)} · ${fmtNum(d.militaryGoodsCost * n)} MG`);
  };
  qty.addEventListener('input', updateTotal);
  queueBtn.addEventListener('click', () => {
    if (!selDesign) return;
    const n = Math.max(1, Math.min(20, Number(qty.value) || 1));
    const d = ctx.state.designs.get(selDesign);
    ctx.run(game.queueUnit(ctx.player, selDesign, Number(citySel.value), n), `${n}× ${d?.name ?? 'unit'} added to production`);
  });

  const renderDetail = () => {
    clear(detail);
    const d = selDesign ? ctx.state.designs.get(selDesign) : undefined;
    if (!d || d.cls !== cls) {
      detail.appendChild(h('div', { class: 'sc-empty' }, 'Select a design to view its specifications.'));
      return;
    }
    const avail = game.availableDesigns(ctx.player).includes(d.id);
    const att = (label: string, v: number) => [h('span', null, label), h('div', { class: 'sc-bar red' }, h('i', { style: `width:${v}%` })), h('span', null, String(v))];
    const def = (label: string, v: number) => [h('span', null, label), h('div', { class: 'sc-bar blue' }, h('i', { style: `width:${v}%` })), h('span', null, String(v))];
    detail.append(
      h('div', { class: 'sc-row', style: 'gap:8px;margin-bottom:4px' },
        h('span', { html: natoSymbol(d.category, 'friend', 44) }),
        h('div', { class: 'sc-grow' },
          h('div', { style: 'font-weight:800;font-size:13px;color:#fff' }, d.name),
          h('div', { class: 'sc-dim' }, `${CATEGORY_NAMES[d.category]} · Generation ${d.generation} · ${d.armor} armor · ${d.mobility}`),
        ),
      ),
      h('div', { class: 'sc-dim', style: 'font-size:11px;margin-bottom:5px' }, d.description),
      h('div', { class: 'sc-grid2', style: 'gap:10px' },
        h('div', { class: 'sc-attbars' }, ...att('vs Soft', d.attackSoft), ...att('vs Hard', d.attackHard), ...att('vs Air', d.attackAir), ...att('vs Naval', d.attackNaval), ...att('vs Sub', d.attackSub)),
        h('div', { class: 'sc-attbars' }, ...def('Def. Ground', d.defenseGround), ...def('Def. Air', d.defenseAir), ...def('Def. Naval', d.defenseNaval),
          h('span', null, 'Stealth'), h('div', { class: 'sc-bar grey' }, h('i', { style: `width:${d.stealth * 100}%` })), h('span', null, (d.stealth * 100).toFixed(0))),
      ),
      h('div', { class: 'sc-statgrid', style: 'margin-top:6px' },
        statCell('Speed', `${d.speedKmh} km/h`), statCell('Spotting', `${d.spotting} hex`), statCell('Personnel', fmtNum(d.personnel)),
        statCell('Range gnd', d.rangeGround + (d.indirect ? ' (ind.)' : '')), statCell('Range air', d.rangeAir), statCell('Range naval', d.rangeNaval),
        statCell('Radius', d.rangeKm ? `${d.rangeKm} km` : '—'), statCell('Fuel', `${d.fuelCapacity} h`), statCell('Capture', d.canCapture ? 'Yes' : 'No'),
        statCell('Cost', fmtMillions(d.cost)), statCell('Mil. goods', fmtNum(d.militaryGoodsCost)), statCell('Build', `${d.buildDays} d`),
        statCell('Upkeep', `${fmtMillions(d.upkeep)}/d`),
      ),
    );
    if (avail) {
      fillCities(d);
      updateTotal();
      detail.append(
        h('div', { class: 'sc-row', style: 'margin-top:8px' }, h('span', { class: 'sc-dim' }, 'Build at'), citySel, h('span', { class: 'sc-dim' }, 'Qty'), qty),
        h('div', { class: 'sc-row', style: 'margin-top:6px' }, totalLbl, h('span', { class: 'sc-grow' }), queueBtn),
      );
    } else {
      const t = ctx.state.techs.get(d.requiresTech ?? '');
      detail.append(h('div', { class: 'sc-row', style: 'margin-top:8px;color:var(--sc-warn)' }, h('span', { html: icon('lock') }), `Requires research: ${t?.name ?? d.requiresTech}`));
    }
  };

  // ---------------------------------------------------------------- facilities
  const facGrid = h('div', { class: 'sc-facgrid' });
  const facDetail = h('div', { class: 'sc-inset', style: 'padding:6px;margin-top:6px' });
  const constrEl = h('div', { class: 'sc-inset' });
  const constrEmpty = h('div', { class: 'sc-empty' }, 'No construction projects under way.');
  facPane.append(
    h('div', { class: 'sc-dim', style: 'font-size:10.5px;margin-bottom:5px' }, 'Select a facility type, then click a hex in your territory to build it.'),
    facGrid, facDetail,
    h('div', { class: 'sc-sechead' }, 'Under Construction'), constrEl, constrEmpty,
  );
  const facTiles = new Map<FacilityType, HTMLElement>();
  const renderFacGrid = () => {
    clear(facGrid);
    facTiles.clear();
    ctx.state.facilityDefs.forEach((f) => {
      const tile = h('div', { class: 'sc-factile' + (f.type === selFacility ? ' sel' : '') }, h('span', { html: facilityIcon(f.type) }), h('span', null, f.name));
      setTip(tile, `<div class="tt-title">${escapeHTML(f.name)}</div>${escapeHTML(f.description)}<div class="tt-sep"></div><div class="tt-row"><span>Cost</span><b>${fmtMillions(f.cost)}</b></div><div class="tt-row"><span>Build time</span><span>${f.buildDays} days</span></div>`);
      tile.addEventListener('click', () => {
        selFacility = f.type;
        facTiles.forEach((t, k) => setClass(t, 'sel', k === f.type));
        renderFacDetail();
      });
      facTiles.set(f.type, tile);
      facGrid.appendChild(tile);
    });
  };
  const chainItem = (r: number, amt: number) => h('span', { class: 'item', html: `${resourceIcon(r)} ${amt.toFixed(amt < 10 ? 1 : 0)} ${RESOURCE_SHORT[r]}` });
  const renderFacDetail = () => {
    clear(facDetail);
    const f: FacilityDef | undefined = selFacility !== null ? ctx.state.facilityDefs[selFacility] : undefined;
    if (!f) {
      facDetail.appendChild(h('div', { class: 'sc-empty' }, 'Select a facility type.'));
      return;
    }
    let owned = 0;
    for (const fc of ctx.state.facilities.values()) if (fc.type === f.type && ctx.state.hexOwner[fc.hex] === ctx.player + 1) owned++;
    const chain = h('div', { class: 'sc-chain sc-inset' });
    const inputs = Object.entries(f.inputs) as [string, number][];
    if (inputs.length) inputs.forEach(([r, a], i) => { if (i) chain.append(h('span', { class: 'sc-dim' }, '+')); chain.append(chainItem(Number(r), a)); });
    else chain.append(h('span', { class: 'sc-dim' }, 'No inputs'));
    chain.append(h('span', { class: 'arrow' }, '➜'));
    if (f.produces !== null) chain.append(chainItem(f.produces, f.output));
    else chain.append(h('span', { class: 'item' }, f.military ? 'Military support' : 'Services'));
    const placeBtn = h('button', { class: 'sc-btn primary' }, h('span', { html: icon('hammer') }), 'Place on map');
    placeBtn.addEventListener('click', () => ctx.setTarget({ kind: 'facility', type: f.type }));
    facDetail.append(
      h('div', { class: 'sc-row', style: 'gap:8px' }, h('span', { html: facilityIcon(f.type), style: 'transform:scale(1.6);margin:4px 8px' }),
        h('div', { class: 'sc-grow' }, h('div', { style: 'font-weight:800;font-size:13px;color:#fff' }, f.name), h('div', { class: 'sc-dim' }, f.description))),
      h('div', { class: 'sc-sechead' }, 'Production chain (per day, level 1)'), chain,
      h('div', { class: 'sc-statgrid', style: 'margin-top:6px' },
        statCell('Cost', fmtMillions(f.cost)), statCell('Build', `${f.buildDays} d`), statCell('Upkeep', `${fmtMillions(f.upkeep)}/d`),
        statCell('Workers', `${fmtNum(f.workers * 1000)}`), statCell('Max level', f.maxLevel), statCell('You own', owned),
      ),
      h('div', { class: 'sc-row', style: 'margin-top:8px' }, h('span', { class: 'sc-dim sc-grow' }, f.produces !== null ? `Produces ${RESOURCE_NAMES[f.produces]}` : f.military ? 'Military installation' : ''), placeBtn),
    );
  };

  const constr = new KeyedList<Facility>(constrEl, (f) => f.id, (f) => {
    const name = h('div', { class: 'sc-nowrap' });
    const where = h('div', { class: 'sc-dim', style: 'font-size:10px' });
    const pb = bar('amber', true);
    const fid = f.id;
    const el = h('div', { class: 'sc-prodrow', style: 'cursor:pointer' }, h('span', { html: facilityIcon(f.type) }), h('div', { style: 'min-width:0' }, name, where), pb.el, h('span'));
    el.addEventListener('click', () => {
      const fc = ctx.state.facilities.get(fid);
      if (fc) ctx.focusHex(fc.hex, '#ffc040');
    });
    return {
      el,
      update(fc: Facility) {
        const def = ctx.state.facilityDefs[fc.type];
        setText(name, `${def?.name ?? 'Facility'}${fc.level > 1 ? ' (Lv ' + fc.level + ')' : ''}`);
        const cid = ctx.state.world.hexCity[fc.hex];
        setText(where, cid >= 0 ? ctx.state.cities[cid]?.name ?? '' : `hex ${fc.hex}`);
        const total = (fc as { constructionTotal?: number }).constructionTotal || def?.buildDays || 1;
        pb.set(1 - fc.constructionDaysLeft / total, `${Math.ceil(fc.constructionDaysLeft)}d`);
      },
    };
  });

  const el = h('div', null, subtabs, unitsPane, facPane);
  let designsSig = '';
  const update = (force: boolean) => {
    if (sub === 'units') {
      const sig = game.availableDesigns(ctx.player).join(',');
      if (force || sig !== designsSig) {
        if (designsSig === '' || sig !== designsSig) renderDesigns();
        designsSig = sig;
      }
    } else {
      if (!facGrid.children.length) {
        renderFacGrid();
        renderFacDetail();
      }
      const list: Facility[] = [];
      for (const f of ctx.state.facilities.values()) if (f.constructionDaysLeft > 0 && ctx.state.hexOwner[f.hex] === ctx.player + 1) list.push(f);
      list.sort((a, b) => a.constructionDaysLeft - b.constructionDaysLeft);
      constr.sync(list.slice(0, 60));
      setClass(constrEmpty, 'sc-hidden', list.length > 0);
    }
  };

  return {
    id: 'build', title: 'Build & Procurement', icon: 'hammer', tip: 'Order new units and construct facilities', el,
    show(arg) {
      const a = arg as { sub?: Sub; facility?: FacilityType; design?: string } | undefined;
      if (a?.sub) setSub(a.sub);
      if (a?.facility !== undefined) {
        setSub('facilities');
        selFacility = a.facility;
        renderFacGrid();
        renderFacDetail();
      }
    },
    update,
  };
  void fmtMoney;
}
