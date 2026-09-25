/**
 * Minimap (bottom-left): political map of hexOwner, own units, view footprint;
 * click/drag moves the camera. Map-mode buttons and render toggles around it.
 */
import { h, setClass, setTip } from '../dom';
import { icon, IconName } from '../icons';
import { MapMode } from '../../render/api';
import type { RenderSettings } from '../../render/api';
import { isWaterTerrain, Terrain } from '../../worldgen/types';
import type { Ctx } from './context';

const MODES: { mode: MapMode; name: string; icon: IconName; tip: string }[] = [
  { mode: MapMode.Political, name: 'Political', icon: 'flag', tip: 'Nation colours and borders' },
  { mode: MapMode.Terrain, name: 'Terrain', icon: 'mountain', tip: 'Natural terrain with borders only' },
  { mode: MapMode.Diplomatic, name: 'Diplomatic', icon: 'venn', tip: 'Relations with your nation: green allies … red enemies' },
  { mode: MapMode.Alliances, name: 'Alliances', icon: 'link', tip: 'International blocs and alliances' },
  { mode: MapMode.Supply, name: 'Supply', icon: 'truck', tip: 'Your supply network coverage' },
  { mode: MapMode.Population, name: 'Population', icon: 'people', tip: 'Population density' },
  { mode: MapMode.Resources, name: 'Resources', icon: 'gem', tip: 'Mineral and energy deposits' },
  { mode: MapMode.Terrain2, name: 'Terrain types', icon: 'hexes', tip: 'Gameplay terrain types (movement & defense)' },
];

const TOGGLES: { key: keyof RenderSettings; icon: IconName; name: string }[] = [
  { key: 'hexGrid', icon: 'hex', name: 'Hex grid' },
  { key: 'labels', icon: 'labels', name: 'Map labels' },
  { key: 'dayNight', icon: 'sun', name: 'Day / night cycle' },
  { key: 'clouds', icon: 'cloud', name: 'Clouds' },
];

const TCOL: Record<number, [number, number, number]> = {
  [Terrain.Plains]: [150, 160, 100], [Terrain.Farmland]: [130, 155, 85], [Terrain.Forest]: [60, 100, 55], [Terrain.Jungle]: [40, 90, 45],
  [Terrain.Hills]: [140, 130, 95], [Terrain.Mountains]: [125, 115, 105], [Terrain.Desert]: [205, 185, 130], [Terrain.Tundra]: [150, 160, 150],
  [Terrain.Marsh]: [90, 115, 90], [Terrain.Ice]: [230, 235, 240], [Terrain.Urban]: [170, 160, 150],
};

export interface Minimap {
  el: HTMLElement;
  width: number;
  update(dt: number): void;
  cycleMode(dir: number): void;
}

export function createMinimap(ctx: Ctx): Minimap {
  const { renderer } = ctx;
  const st = () => ctx.state;
  const cols = st().world.settings.cols;
  const rows = st().world.settings.rows;
  const aspect = st().grid.worldW / st().grid.worldH;
  const W = 300;
  const H = Math.round(Math.max(90, Math.min(180, W / aspect)));
  const canvas = h('canvas', { width: W * 2, height: H * 2, style: `width:${W}px;height:${H}px` }) as HTMLCanvasElement;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  const base = document.createElement('canvas');
  base.width = cols;
  base.height = rows;
  const bctx = base.getContext('2d') as CanvasRenderingContext2D;
  const img = bctx.createImageData(cols, rows);

  const modeBtns = new Map<MapMode, HTMLElement>();
  const modesRow = h('div', { class: 'mm-modes' });
  for (const m of MODES) {
    const b = h('button', { class: 'sc-btn', html: icon(m.icon) });
    setTip(b, `<div class="tt-title">${m.name} map</div>${m.tip}<span class="tt-key">M</span>`);
    b.addEventListener('click', () => setMode(m.mode));
    modeBtns.set(m.mode, b);
    modesRow.appendChild(b);
  }
  const side = h('div', { class: 'mm-side' });
  const toggleBtns = new Map<keyof RenderSettings, HTMLElement>();
  for (const t of TOGGLES) {
    const b = h('button', { class: 'sc-btn', html: icon(t.icon) });
    setTip(b, `<b>${t.name}</b> — toggle`);
    b.addEventListener('click', () => {
      const cur = !!renderer.settings[t.key];
      renderer.applySettings({ [t.key]: !cur } as Partial<RenderSettings>);
      syncToggles();
    });
    toggleBtns.set(t.key, b);
    side.appendChild(b);
  }
  const homeBtn = h('button', { class: 'sc-btn', html: icon('home'), tip: '<b>Capital</b> — centre on your capital<span class="tt-key">Home</span>' });
  homeBtn.addEventListener('click', () => {
    const c = st().cities[ctx.me.capitalCity];
    if (c) renderer.focusOn(c.x, c.z, 60);
  });
  const worldBtn = h('button', { class: 'sc-btn', html: icon('globe'), tip: '<b>World view</b> — zoom out to the whole map' });
  worldBtn.addEventListener('click', () => {
    const t = renderer.getCameraTarget();
    renderer.focusOn(t.x, t.z, st().grid.worldH * 0.9);
  });
  side.append(h('div', { style: 'height:4px' }), homeBtn, worldBtn);
  const modeName = h('b');
  const title = h('div', { class: 'mm-title' }, h('span', null, 'Map: ', modeName), h('span', { class: 'coords' }));
  const el = h('div', { class: 'sc-minimap sc-panel' }, h('div', { class: 'mm-main' }, title, canvas, modesRow), side);

  const syncModes = () => {
    const m = renderer.mapMode;
    modeBtns.forEach((b, k) => setClass(b, 'on', k === m));
    modeName.textContent = MODES.find((x) => x.mode === m)?.name ?? '';
  };
  const syncToggles = () => toggleBtns.forEach((b, k) => setClass(b, 'on', !!renderer.settings[k]));
  const setMode = (m: MapMode) => {
    renderer.setMapMode(m);
    syncModes();
    dirty = true;
  };

  let dirty = true;
  let lastVer = -1;
  let lastMode = -1;
  let t = 0;
  let unitT = 0;
  const redrawBase = () => {
    const s = st();
    const own = s.hexOwner;
    const terr = s.world.hexTerrain;
    const d = img.data;
    const mode = renderer.mapMode;
    const player = ctx.player;
    const n = s.nations.length;
    const relCol: [number, number, number][] = [];
    if (mode === MapMode.Diplomatic) {
      for (let i = 0; i < n; i++) {
        if (i === player) relCol.push([70, 130, 230]);
        else if (ctx.game.atWar(player, i)) relCol.push([220, 40, 30]);
        else {
          const r = ctx.game.relation(player, i);
          relCol.push(r > 40 ? [70, 180, 70] : r > 0 ? [160, 190, 90] : r > -40 ? [210, 160, 70] : [200, 80, 50]);
        }
      }
    }
    const blocCol: ([number, number, number] | null)[] = [];
    if (mode === MapMode.Alliances) {
      for (const nat of s.nations) {
        const b = nat.blocs.find((x) => s.world.blocs[x]?.military) ?? nat.blocs[0];
        const hx = b !== undefined ? s.world.blocs[b]?.color : undefined;
        blocCol.push(hx ? [parseInt(hx.slice(1, 3), 16), parseInt(hx.slice(3, 5), 16), parseInt(hx.slice(5, 7), 16)] : [110, 110, 110]);
      }
    }
    for (let i = 0; i < own.length; i++) {
      const o = own[i];
      let r: number, gg: number, b: number;
      const t2 = terr[i];
      if (isWaterTerrain(t2)) {
        if (t2 === Terrain.DeepOcean) { r = 14; gg = 34; b = 58; } else { r = 24; gg = 52; b = 80; }
      } else if (mode === MapMode.Terrain || mode === MapMode.Terrain2 || !o) {
        const c = TCOL[t2] ?? [120, 120, 110];
        [r, gg, b] = c;
        if (!o && mode !== MapMode.Terrain && mode !== MapMode.Terrain2) { r *= 0.7; gg *= 0.7; b *= 0.7; }
      } else if (mode === MapMode.Diplomatic) {
        [r, gg, b] = relCol[o - 1];
      } else if (mode === MapMode.Alliances) {
        [r, gg, b] = blocCol[o - 1] ?? [110, 110, 110];
      } else {
        const c = s.nations[o - 1]?.color ?? [128, 128, 128];
        r = c[0]; gg = c[1]; b = c[2];
        if (c[0] <= 1 && c[1] <= 1 && c[2] <= 1) { r *= 255; gg *= 255; b *= 255; }
        if (o - 1 === player) { r = r * 0.7 + 255 * 0.3; gg = gg * 0.7 + 200 * 0.3; b = b * 0.7 + 80 * 0.3; }
      }
      // border darkening
      if (o) {
        const c = i % cols;
        const right = c + 1 < cols ? own[i + 1] : o;
        const down = i + cols < own.length ? own[i + cols] : o;
        if (right !== o || down !== o) { r *= 0.55; gg *= 0.55; b *= 0.55; }
      }
      const k = i * 4;
      d[k] = r; d[k + 1] = gg; d[k + 2] = b; d[k + 3] = 255;
    }
    bctx.putImageData(img, 0, 0);
    dirty = false;
  };

  const worldToMini = (x: number, z: number) => ({ x: (x / st().grid.worldW) * W, y: (z / st().grid.worldH) * H });
  const draw = () => {
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(base, 0, 0, W, H);
    // own units
    g.fillStyle = '#ffffff';
    const s = st();
    for (const u of s.units.values()) {
      if (u.nation !== ctx.player) continue;
      const p = worldToMini(u.x, u.z);
      g.fillRect(p.x - 0.75, p.y - 0.75, 1.5, 1.5);
    }
    // selected
    if (ctx.selection.length) {
      g.fillStyle = '#ffd040';
      for (const id of ctx.selection) {
        const u = s.units.get(id);
        if (!u) continue;
        const p = worldToMini(u.x, u.z);
        g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
    }
    // view footprint
    try {
      const fp = renderer.getViewFootprint();
      if (fp.length >= 3) {
        g.strokeStyle = 'rgba(255,220,120,0.95)';
        g.lineWidth = 1.2;
        g.shadowColor = 'rgba(0,0,0,.9)';
        g.shadowBlur = 2;
        g.beginPath();
        fp.forEach((p, i) => {
          const q = worldToMini(p.x, p.z);
          const qx = Math.max(-2, Math.min(W + 2, q.x));
          const qy = Math.max(-2, Math.min(H + 2, q.y));
          if (i === 0) g.moveTo(qx, qy);
          else g.lineTo(qx, qy);
        });
        g.closePath();
        g.stroke();
        g.shadowBlur = 0;
      }
    } catch {
      /* renderer not ready */
    }
  };

  // camera control
  let dragging = false;
  const moveTo = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fz = (e.clientY - r.top) / r.height;
    renderer.focusOn(Math.max(0, Math.min(1, fx)) * st().grid.worldW, Math.max(0, Math.min(1, fz)) * st().grid.worldH);
  };
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    moveTo(e);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (dragging) moveTo(e);
  });
  canvas.addEventListener('pointerup', () => (dragging = false));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const tgt = renderer.getCameraTarget();
    renderer.focusOn(tgt.x, tgt.z, Math.max(10, tgt.distance * Math.exp(e.deltaY * 0.0015)));
  }, { passive: false });

  syncModes();
  syncToggles();

  return {
    el,
    width: W + 48,
    update(dt: number) {
      const s = st();
      if (s.ownerVersion !== lastVer) {
        // throttle big redraws to ~1/s during rapid conquest
        t -= dt;
        if (t <= 0 || lastVer === -1) {
          lastVer = s.ownerVersion;
          dirty = true;
          t = 1;
        }
      }
      if (renderer.mapMode !== lastMode) {
        lastMode = renderer.mapMode;
        syncModes();
        dirty = true;
      }
      unitT -= dt;
      if (unitT <= 0) {
        unitT = 2;
        syncToggles();
        if (renderer.mapMode === MapMode.Diplomatic) dirty = true;
      }
      if (dirty) redrawBase();
      draw();
    },
    cycleMode(dir: number) {
      const i = MODES.findIndex((m) => m.mode === renderer.mapMode);
      const next = MODES[(i + dir + MODES.length) % MODES.length];
      setMode(next.mode);
    },
  };
}
