/**
 * DEV ONLY — a flat 2D canvas implementation of MapRenderer: coloured hexes,
 * unit markers, highlights, paths, pings, pan/zoom and all input callbacks.
 */
import { MapMode } from '../../render/api';
import type { MapClick, MapRenderer, RenderSettings } from '../../render/api';
import type { GameAPI } from '../../sim/api';
import { HexGrid, SQRT3 } from '../../core/hex';
import { Terrain, WorldData, isWaterTerrain } from '../../worldgen/types';
import { UnitClass } from '../../sim/types';

const TERRAIN_COL: Record<number, [number, number, number]> = {
  [Terrain.DeepOcean]: [18, 42, 70], [Terrain.Coastal]: [34, 72, 104], [Terrain.Lake]: [40, 80, 110],
  [Terrain.Plains]: [150, 160, 100], [Terrain.Farmland]: [130, 155, 85], [Terrain.Forest]: [60, 100, 55],
  [Terrain.Jungle]: [40, 90, 45], [Terrain.Hills]: [140, 130, 95], [Terrain.Mountains]: [120, 110, 100],
  [Terrain.Desert]: [205, 185, 130], [Terrain.Tundra]: [150, 160, 150], [Terrain.Marsh]: [90, 115, 90],
  [Terrain.Ice]: [230, 235, 240], [Terrain.Urban]: [170, 160, 150],
};
const BASE_PPU = 4;

export function createMockRenderer(container: HTMLElement): MapRenderer {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;background:#0b1622';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const settings: RenderSettings = { dayNight: true, clouds: true, shadows: true, hexGrid: false, labels: true, units: true, quality: 'high' };
  let mode: MapMode = MapMode.Political;
  let world: WorldData | null = null;
  let grid: HexGrid | null = null;
  let game: GameAPI | null = null;
  let base: HTMLCanvasElement | null = null;
  let baseDirty = true;
  let lastOwnerVersion = -1;
  let hl: HTMLCanvasElement | null = null;
  let hlColor = '#ffc040';
  let hlHexes: number[] = [];
  let path: number[] = [];
  let pathHostile = false;
  let selected = new Set<number>();
  const pings: { hex: number; color: string; t: number }[] = [];
  const cam = { x: 300, z: 110, dist: 180 };
  let camTarget: { x: number; z: number; dist: number } | null = null;
  const clickCbs: ((e: MapClick) => void)[] = [];
  const hoverCbs: ((hex: number, unitId: number, x: number, y: number) => void)[] = [];
  const boxCbs: ((x0: number, y0: number, x1: number, y1: number, shift: boolean) => void)[] = [];
  let W = 1, H = 1;
  let labelPos: { name: string; x: number; z: number; size: number }[] = [];

  const ppu = () => H / (cam.dist * 0.9);
  const toScreen = (x: number, z: number) => ({ x: (x - cam.x) * ppu() + W / 2, y: (z - cam.z) * ppu() + H / 2 });
  const toWorld = (sx: number, sy: number) => ({ x: cam.x + (sx - W / 2) / ppu(), z: cam.z + (sy - H / 2) / ppu() });

  const nationColor = (id: number): [number, number, number] => {
    const n = game?.state.nations[id] ?? null;
    const c = n?.color ?? world?.nations[id]?.color ?? [128, 128, 128];
    return [c[0], c[1], c[2]];
  };

  const hexColor = (i: number): [number, number, number] => {
    if (!world) return [0, 0, 0];
    const t = world.hexTerrain[i];
    const tc = TERRAIN_COL[t] ?? [100, 100, 100];
    if (isWaterTerrain(t)) return tc;
    const owner = game ? game.state.hexOwner[i] : world.hexOwner[i];
    const player = game?.state.playerNation ?? -1;
    const mix = (a: [number, number, number], b: [number, number, number], k: number): [number, number, number] => [a[0] * (1 - k) + b[0] * k, a[1] * (1 - k) + b[1] * k, a[2] * (1 - k) + b[2] * k];
    switch (mode) {
      case MapMode.Terrain: return tc;
      case MapMode.Terrain2: return tc.map((v) => Math.min(255, v * 1.2)) as [number, number, number];
      case MapMode.Diplomatic: {
        if (!owner) return tc;
        if (owner - 1 === player) return mix(tc, [60, 120, 230], 0.7);
        const r = game && player >= 0 ? game.relation(player, owner - 1) : world.relations[(Math.max(0, player)) * world.nations.length + owner - 1];
        const col: [number, number, number] = game && player >= 0 && game.atWar(player, owner - 1) ? [220, 30, 30] : r > 40 ? [70, 190, 70] : r > 0 ? [170, 200, 90] : r > -40 ? [220, 170, 70] : [210, 80, 50];
        return mix(tc, col, 0.65);
      }
      case MapMode.Alliances: {
        if (!owner) return tc;
        const b = world.nations[owner - 1]?.blocs.find((x) => world!.blocs[x]?.military) ?? world.nations[owner - 1]?.blocs[0];
        if (b === undefined) return mix(tc, [120, 120, 120], 0.5);
        const hx = world.blocs[b].color;
        return mix(tc, [parseInt(hx.slice(1, 3), 16), parseInt(hx.slice(3, 5), 16), parseInt(hx.slice(5, 7), 16)], 0.7);
      }
      case MapMode.Population: {
        const p = Math.min(1, Math.log10(1 + world.hexPopulation[i]) / 4);
        return mix([30, 30, 30], [255, 200, 60], p);
      }
      case MapMode.Resources: return world.hexDeposit[i] ? [230, 150, 40] : mix(tc, [40, 40, 40], 0.6);
      case MapMode.Supply: {
        const s = game && player >= 0 ? game.supplyAt(player, i) / 100 : 0;
        return mix([60, 20, 20], [60, 200, 90], s);
      }
      default:
        return owner ? mix(tc, nationColor(owner - 1), 0.72) : tc;
    }
  };

  const drawHex = (c: CanvasRenderingContext2D, x: number, z: number, r: number) => {
    c.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 + (k * Math.PI) / 3;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (k === 0) c.moveTo(px, pz);
      else c.lineTo(px, pz);
    }
    c.closePath();
  };

  const buildBase = () => {
    if (!world || !grid) return;
    base = base ?? document.createElement('canvas');
    base.width = Math.ceil(grid.worldW * BASE_PPU);
    base.height = Math.ceil(grid.worldH * BASE_PPU);
    const b = base.getContext('2d') as CanvasRenderingContext2D;
    b.fillStyle = '#12304e';
    b.fillRect(0, 0, base.width, base.height);
    for (let i = 0; i < grid.count; i++) {
      const c = hexColor(i);
      b.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
      drawHex(b, grid.cx[i] * BASE_PPU, grid.cz[i] * BASE_PPU, 1.04 * BASE_PPU);
      b.fill();
    }
    // borders
    const own = game ? game.state.hexOwner : world.hexOwner;
    b.strokeStyle = 'rgba(20,20,20,0.85)';
    b.lineWidth = 1.2;
    b.beginPath();
    for (let i = 0; i < grid.count; i++) {
      if (!own[i]) continue;
      for (let d = 0; d < 6; d++) {
        const nb = grid.neighbours[i * 6 + d];
        if (nb < 0 || own[nb] === own[i] || (d > 2 && own[nb])) continue;
        const a0 = -Math.PI / 6 + (d * Math.PI) / 3;
        const a1 = a0 + Math.PI / 3;
        b.moveTo((grid.cx[i] + Math.cos(a0)) * BASE_PPU, (grid.cz[i] + Math.sin(a0)) * BASE_PPU);
        b.lineTo((grid.cx[i] + Math.cos(a1)) * BASE_PPU, (grid.cz[i] + Math.sin(a1)) * BASE_PPU);
      }
    }
    b.stroke();
    // labels
    const sx = new Float64Array(world.nations.length), sz = new Float64Array(world.nations.length), cnt = new Int32Array(world.nations.length);
    for (let i = 0; i < grid.count; i++) if (own[i]) { const n = own[i] - 1; sx[n] += grid.cx[i]; sz[n] += grid.cz[i]; cnt[n]++; }
    labelPos = world.nations.map((n, i) => ({ name: n.name.toUpperCase(), x: sx[i] / Math.max(1, cnt[i]), z: sz[i] / Math.max(1, cnt[i]), size: Math.sqrt(cnt[i]) })).filter((l) => l.size > 2);
    baseDirty = false;
  };

  const buildHighlight = () => {
    if (!grid || !base) return;
    if (!hlHexes.length) { hl = null; return; }
    hl = hl ?? document.createElement('canvas');
    hl.width = base.width;
    hl.height = base.height;
    const c = hl.getContext('2d') as CanvasRenderingContext2D;
    c.clearRect(0, 0, hl.width, hl.height);
    c.fillStyle = hlColor;
    c.globalAlpha = 0.45;
    for (const i of hlHexes) { drawHex(c, grid.cx[i] * BASE_PPU, grid.cz[i] * BASE_PPU, 1.02 * BASE_PPU); c.fill(); }
    c.globalAlpha = 1;
    const set = new Set(hlHexes);
    c.strokeStyle = hlColor;
    c.lineWidth = 2;
    c.beginPath();
    for (const i of hlHexes) for (let d = 0; d < 6; d++) {
      const nb = grid.neighbours[i * 6 + d];
      if (nb >= 0 && set.has(nb)) continue;
      const a0 = -Math.PI / 6 + (d * Math.PI) / 3, a1 = a0 + Math.PI / 3;
      c.moveTo((grid.cx[i] + Math.cos(a0)) * BASE_PPU, (grid.cz[i] + Math.sin(a0)) * BASE_PPU);
      c.lineTo((grid.cx[i] + Math.cos(a1)) * BASE_PPU, (grid.cz[i] + Math.sin(a1)) * BASE_PPU);
    }
    c.stroke();
  };

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  const unitScreen = (id: number) => {
    const u = game?.state.units.get(id);
    return u ? toScreen(u.x, u.z) : null;
  };

  const pickUnit = (sx: number, sy: number): number => {
    if (!game || !settings.units) return -1;
    let best = -1, bd = 12 * 12;
    for (const u of game.state.units.values()) {
      const p = toScreen(u.x, u.z);
      const d = (p.x - sx) ** 2 + (p.y - sy) ** 2;
      if (d < bd) { bd = d; best = u.id; }
    }
    return best;
  };
  const rel = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const pickHex = (clientX: number, clientY: number) => {
    if (!grid) return -1;
    const p = rel({ clientX, clientY });
    const w = toWorld(p.x, p.y);
    return grid.fromWorld(w.x, w.z);
  };

  // --------------------------------------------------------------- input
  let down: { x: number; y: number; button: number; moved: boolean; cx: number; cz: number } | null = null;
  let box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  let lastClick = { t: 0, x: 0, y: 0 };
  let lastHover = { hex: -2, unit: -2 };
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const p = rel(e);
    down = { x: p.x, y: p.y, button: e.button, moved: false, cx: cam.x, cz: cam.z };
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = rel(e);
    if (down) {
      if (Math.hypot(p.x - down.x, p.y - down.y) > 5) down.moved = true;
      if (down.moved) {
        if (down.button === 0) box = { x0: down.x, y0: down.y, x1: p.x, y1: p.y };
        else {
          cam.x = down.cx - (p.x - down.x) / ppu();
          cam.z = down.cz - (p.y - down.y) / ppu();
          camTarget = null;
        }
      }
      return;
    }
    const hex = pickHex(e.clientX, e.clientY);
    const unit = pickUnit(p.x, p.y);
    if (hex !== lastHover.hex || unit !== lastHover.unit) {
      lastHover = { hex, unit };
    }
    hoverCbs.forEach((cb) => cb(hex, unit, e.clientX, e.clientY));
  });
  canvas.addEventListener('pointerleave', () => hoverCbs.forEach((cb) => cb(-1, -1, 0, 0)));
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const p = rel(e);
    const r = canvas.getBoundingClientRect();
    if (down.moved && down.button === 0 && box) {
      const b = { x0: Math.min(box.x0, box.x1) + r.left, y0: Math.min(box.y0, box.y1) + r.top, x1: Math.max(box.x0, box.x1) + r.left, y1: Math.max(box.y0, box.y1) + r.top };
      boxCbs.forEach((cb) => cb(b.x0, b.y0, b.x1, b.y1, e.shiftKey));
    } else if (!down.moved && (down.button === 0 || down.button === 2)) {
      const now = performance.now();
      const dbl = now - lastClick.t < 320 && Math.hypot(p.x - lastClick.x, p.y - lastClick.y) < 6 && down.button === 0;
      lastClick = { t: now, x: p.x, y: p.y };
      const w = toWorld(p.x, p.y);
      const ev: MapClick = {
        button: down.button as 0 | 2, hex: pickHex(e.clientX, e.clientY), unitId: pickUnit(p.x, p.y), worldX: w.x, worldZ: w.z,
        clientX: e.clientX, clientY: e.clientY, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, double: dbl,
      };
      clickCbs.forEach((cb) => cb(ev));
    }
    down = null;
    box = null;
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = rel(e);
    const before = toWorld(p.x, p.y);
    cam.dist = Math.max(8, Math.min(320, cam.dist * Math.exp(e.deltaY * 0.0012)));
    const after = toWorld(p.x, p.y);
    cam.x += before.x - after.x;
    cam.z += before.z - after.z;
    camTarget = null;
  }, { passive: false });
  const keys = new Set<string>();
  window.addEventListener('keydown', (e) => keys.add(e.key));
  window.addEventListener('keyup', (e) => keys.delete(e.key));

  // --------------------------------------------------------------- render
  const render = (dt: number) => {
    if (camTarget) {
      const k = 1 - Math.exp(-dt * 6);
      cam.x += (camTarget.x - cam.x) * k;
      cam.z += (camTarget.z - cam.z) * k;
      cam.dist += (camTarget.dist - cam.dist) * k;
      if (Math.abs(camTarget.x - cam.x) < 0.05 && Math.abs(camTarget.dist - cam.dist) < 0.1) camTarget = null;
    }
    const pan = cam.dist * dt * 0.8;
    if (keys.has('ArrowLeft')) cam.x -= pan;
    if (keys.has('ArrowRight')) cam.x += pan;
    if (keys.has('ArrowUp')) cam.z -= pan;
    if (keys.has('ArrowDown')) cam.z += pan;
    if (game && game.state.ownerVersion !== lastOwnerVersion) { lastOwnerVersion = game.state.ownerVersion; baseDirty = true; }
    if (baseDirty) { buildBase(); buildHighlight(); }
    const dpr = canvas.width / W;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b1622';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!base || !grid) return;
    const k = ppu();
    const o = toScreen(0, 0);
    ctx.imageSmoothingEnabled = k < BASE_PPU;
    ctx.drawImage(base, o.x, o.y, base.width * (k / BASE_PPU), base.height * (k / BASE_PPU));
    if (hl) ctx.drawImage(hl, o.x, o.y, hl.width * (k / BASE_PPU), hl.height * (k / BASE_PPU));
    // hex grid
    if (settings.hexGrid && k > 9) {
      const tl = toWorld(0, 0), br = toWorld(W, H);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      const r0 = Math.max(0, Math.floor(tl.z / 1.5) - 1), r1 = Math.min(grid.rows - 1, Math.ceil(br.z / 1.5) + 1);
      const c0 = Math.max(0, Math.floor(tl.x / SQRT3) - 1), c1 = Math.min(grid.cols - 1, Math.ceil(br.x / SQRT3) + 1);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const i = r * grid.cols + c;
        const p = toScreen(grid.cx[i], grid.cz[i]);
        drawHex(ctx, p.x, p.y, k);
        ctx.stroke();
      }
    }
    // cities
    if (game) {
      for (const c of game.state.cities) {
        const p = toScreen(c.x, c.z);
        if (p.x < -20 || p.y < -20 || p.x > W + 20 || p.y > H + 20) continue;
        const big = c.capital || c.population > 5000;
        if (!big && k < 3) continue;
        ctx.fillStyle = c.capital ? '#ffdd66' : '#fff';
        ctx.strokeStyle = '#000';
        ctx.beginPath();
        if (c.capital) {
          for (let s = 0; s < 10; s++) {
            const a = -Math.PI / 2 + (s * Math.PI) / 5;
            const rr = s % 2 ? 2.4 : 5.5;
            ctx.lineTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr);
          }
          ctx.closePath();
        } else ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (settings.labels && (k > 3.5 || c.capital)) {
          ctx.font = `${c.capital ? 'bold ' : ''}11px Arial`;
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = 'rgba(0,0,0,.8)';
          ctx.lineWidth = 3;
          ctx.strokeText(c.name, p.x + 7, p.y + 4);
          ctx.fillText(c.name, p.x + 7, p.y + 4);
          ctx.lineWidth = 1;
        }
      }
    }
    // nation labels
    if (settings.labels && k < 6) {
      ctx.textAlign = 'center';
      for (const l of labelPos) {
        const sz = Math.min(26, Math.max(9, l.size * k * 0.45));
        if (sz < 9.5) continue;
        const p = toScreen(l.x, l.z);
        ctx.font = `bold ${sz}px Arial`;
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 3;
        ctx.strokeText(l.name, p.x, p.y);
        ctx.fillText(l.name, p.x, p.y);
      }
      ctx.textAlign = 'left';
      ctx.lineWidth = 1;
    }
    // path
    if (path.length) {
      ctx.strokeStyle = pathHostile ? '#ff4a3a' : '#7dff6a';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      const first = [...selected].map((id) => game?.state.units.get(id)).find(Boolean);
      if (first) { const p = toScreen(first.x, first.z); ctx.moveTo(p.x, p.y); }
      for (const hx of path) { const p = toScreen(grid.cx[hx], grid.cz[hx]); ctx.lineTo(p.x, p.y); }
      ctx.stroke();
      ctx.setLineDash([]);
      const endP = toScreen(grid.cx[path[path.length - 1]], grid.cz[path[path.length - 1]]);
      ctx.beginPath();
      ctx.arc(endP.x, endP.y, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    // units
    if (game && settings.units) {
      const st = game.state;
      const player = st.playerNation;
      const s = Math.max(7, Math.min(18, k * 1.6));
      for (const u of st.units.values()) {
        if (player >= 0 && u.nation !== player && !game.isVisible(player, u.hex)) continue;
        const p = toScreen(u.x, u.z);
        if (p.x < -20 || p.y < -20 || p.x > W + 20 || p.y > H + 20) continue;
        const nc = nationColor(u.nation);
        const d = st.designs.get(u.design);
        const hostile = player >= 0 && game.atWar(player, u.nation);
        ctx.fillStyle = u.nation === player ? '#80c8f0' : hostile ? '#ff8a80' : '#b5f0a0';
        ctx.strokeStyle = `rgb(${nc[0]},${nc[1]},${nc[2]})`;
        ctx.lineWidth = 2;
        if (d?.cls === UnitClass.Air) { ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.5, Math.PI, 0); ctx.lineTo(p.x + s * 0.5, p.y + s * 0.3); ctx.lineTo(p.x - s * 0.5, p.y + s * 0.3); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        else if (d?.cls === UnitClass.Naval) { ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.45, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
        else { ctx.fillRect(p.x - s * 0.6, p.y - s * 0.4, s * 1.2, s * 0.8); ctx.strokeRect(p.x - s * 0.6, p.y - s * 0.4, s * 1.2, s * 0.8); }
        // strength pip
        ctx.fillStyle = '#000';
        ctx.fillRect(p.x - s * 0.6, p.y + s * 0.5, s * 1.2, 3);
        ctx.fillStyle = u.strength > 60 ? '#6c6' : u.strength > 30 ? '#ec3' : '#e43';
        ctx.fillRect(p.x - s * 0.6, p.y + s * 0.5, s * 1.2 * (u.strength / 100), 3);
        if (selected.has(u.id)) {
          ctx.strokeStyle = '#ffd040';
          ctx.lineWidth = 2;
          ctx.strokeRect(p.x - s * 0.8, p.y - s * 0.6, s * 1.6, s * 1.4);
        }
        if (u.inCombat) { ctx.fillStyle = '#ff3a2a'; ctx.beginPath(); ctx.arc(p.x + s * 0.7, p.y - s * 0.5, 3, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.lineWidth = 1;
    }
    // pings
    for (let i = pings.length - 1; i >= 0; i--) {
      const pg = pings[i];
      pg.t += dt;
      if (pg.t > 1.6) { pings.splice(i, 1); continue; }
      const p = toScreen(grid.cx[pg.hex], grid.cz[pg.hex]);
      ctx.strokeStyle = pg.color;
      ctx.globalAlpha = 1 - pg.t / 1.6;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6 + pg.t * 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (box) {
      ctx.strokeStyle = '#ffd040';
      ctx.fillStyle = 'rgba(255,208,64,0.12)';
      const x = Math.min(box.x0, box.x1), y = Math.min(box.y0, box.y1);
      ctx.fillRect(x, y, Math.abs(box.x1 - box.x0), Math.abs(box.y1 - box.y0));
      ctx.strokeRect(x, y, Math.abs(box.x1 - box.x0), Math.abs(box.y1 - box.y0));
    }
  };

  const r: MapRenderer = {
    canvas,
    settings,
    get mapMode() { return mode; },
    async loadWorld(w, progress) {
      world = w;
      grid = new HexGrid(w.settings.cols, w.settings.rows);
      cam.x = grid.worldW * 0.5;
      cam.z = grid.worldH * 0.45;
      cam.dist = grid.worldH * 0.95;
      const stages = ['Building terrain mesh', 'Generating vegetation', 'Placing cities', 'Tracing rivers', 'Compiling shaders'];
      for (let i = 0; i < stages.length; i++) {
        progress?.(stages[i], i / stages.length);
        await new Promise((res) => setTimeout(res, 120));
      }
      baseDirty = true;
      progress?.('Ready', 1);
    },
    attachGame(g) { game = g; baseDirty = true; },
    render,
    applySettings(s) { Object.assign(settings, s); },
    setMapMode(m) { mode = m; baseDirty = true; },
    setHexHighlight(hexes, color) { hlHexes = hexes; hlColor = color; buildHighlight(); },
    showPath(hexes, hostile) { path = hexes; pathHostile = hostile; },
    setSelectedUnits(ids) { selected = new Set(ids); },
    pingHex(hex, color) { if (hex >= 0) pings.push({ hex, color, t: 0 }); },
    focusOn(x, z, distance) { camTarget = { x, z, dist: distance ?? cam.dist }; },
    focusHex(hex, distance) { if (grid && hex >= 0) camTarget = { x: grid.cx[hex], z: grid.cz[hex], dist: distance ?? Math.min(cam.dist, 60) }; },
    getCameraTarget() { return { x: cam.x, z: cam.z, distance: cam.dist }; },
    getViewFootprint() {
      const a = toWorld(0, 0), b = toWorld(W, 0), c = toWorld(W, H), d = toWorld(0, H);
      return [a, b, c, d].map((p) => ({ x: p.x, z: p.z }));
    },
    pickHex,
    pickUnit(clientX, clientY) { const p = rel({ clientX, clientY }); return pickUnit(p.x, p.y); },
    unitsInScreenRect(x0, y0, x1, y1, nation) {
      if (!game) return [];
      const rr = canvas.getBoundingClientRect();
      const out: number[] = [];
      for (const u of game.state.units.values()) {
        if (u.nation !== nation) continue;
        const p = unitScreen(u.id);
        if (!p) continue;
        const cx = p.x + rr.left, cy = p.y + rr.top;
        if (cx >= Math.min(x0, x1) && cx <= Math.max(x0, x1) && cy >= Math.min(y0, y1) && cy <= Math.max(y0, y1)) out.push(u.id);
      }
      return out;
    },
    worldToScreen(x, _y, z) {
      const p = toScreen(x, z);
      const rr = canvas.getBoundingClientRect();
      return { x: p.x + rr.left, y: p.y + rr.top, visible: p.x >= 0 && p.y >= 0 && p.x <= W && p.y <= H };
    },
    onClick(cb) { clickCbs.push(cb); },
    onHover(cb) { hoverCbs.push(cb); },
    onBoxSelect(cb) { boxCbs.push(cb); },
  };
  return r;
}
