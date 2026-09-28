import * as THREE from 'three';
import type { GameAPI } from '../sim/api';
import { Terrain } from '../worldgen/types';
import type { RTSCamera } from './camera';
import { clamp, smoothstep } from './constants';
import type { WorldContext } from './index';

interface NationLabel { id: number; name: string; x: number; z: number; size: number; angle: number; hexes: number }
interface Slot { el: HTMLDivElement; used: boolean }

/**
 * HTML label overlay: nation names (large, spaced capitals, aligned with the
 * territory's main axis) when zoomed out; city names with capital stars when
 * zoomed in. Greedy screen-space collision avoidance by priority.
 */
export class Labels {
  visible = true;
  private ctx: WorldContext;
  private root: HTMLDivElement;
  private game: GameAPI | null = null;
  private nations: NationLabel[] = [];
  private dirty = true;
  private timer = 0;
  private pool: Slot[] = [];
  private v = new THREE.Vector3();

  constructor(ctx: WorldContext, container: HTMLElement) {
    this.ctx = ctx;
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden', zIndex: '2',
      fontFamily: '"Segoe UI", Tahoma, Arial, sans-serif', userSelect: 'none',
    } as CSSStyleDeclaration);
    container.appendChild(this.root);
    const style = document.createElement('style');
    style.textContent = `
.rl-nation { position: absolute; left: 0; top: 0; white-space: nowrap; color: rgba(255,255,255,0.86); font-weight: 600;
  text-transform: uppercase; text-shadow: 0 0 3px rgba(0,0,0,0.9), 0 1px 2px rgba(0,0,0,0.9); will-change: transform; }
.rl-city { position: absolute; left: 0; top: 0; white-space: nowrap; color: #f4f1e6; font-size: 12px; font-weight: 600;
  text-shadow: 0 0 3px #000, 0 1px 2px #000; will-change: transform; display: flex; align-items: center; gap: 4px; }
.rl-city i { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #f4f1e6; box-shadow: 0 0 0 1.5px rgba(0,0,0,0.75); }
.rl-city.cap i { width: 11px; height: 11px; border-radius: 0; background: #ffd24a; box-shadow: none;
  clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%); filter: drop-shadow(0 0 1px #000); }
.rl-city.cap { color: #ffe9a8; font-size: 13px; }
.rl-city.big { font-size: 13px; }
`;
    this.root.appendChild(style);
  }

  attachGame(game: GameAPI): void {
    this.game = game;
    this.dirty = true;
  }

  markOwnersDirty(): void {
    this.dirty = true;
  }

  dispose(): void {
    this.root.remove();
  }

  private computeNations(): void {
    const { world, grid } = this.ctx;
    const owner = this.game ? this.game.state.hexOwner : world.hexOwner;
    const n = grid.count;
    const seen = new Uint8Array(n);
    const best = new Map<number, { hexes: number[] }>();
    const queue = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const o = owner[i];
      if (!o || seen[i] || world.hexTerrain[i] <= Terrain.Lake) continue;
      let qh = 0, qt = 0;
      queue[qt++] = i;
      seen[i] = 1;
      const comp: number[] = [];
      while (qh < qt) {
        const h = queue[qh++];
        comp.push(h);
        for (let d = 0; d < 6; d++) {
          const m = grid.neighbours[h * 6 + d];
          if (m < 0 || seen[m] || owner[m] !== o || world.hexTerrain[m] <= Terrain.Lake) continue;
          seen[m] = 1;
          queue[qt++] = m;
        }
      }
      const b = best.get(o);
      if (!b || comp.length > b.hexes.length) best.set(o, { hexes: comp });
    }
    const out: NationLabel[] = [];
    for (const [o, { hexes }] of best) {
      const id = o - 1;
      const name = this.game?.state.nations[id]?.name ?? world.nations[id]?.name ?? '';
      if (!name || (this.game && this.game.state.nations[id] && !this.game.state.nations[id].alive)) continue;
      let sx = 0, sz = 0;
      for (const h of hexes) { sx += grid.cx[h]; sz += grid.cz[h]; }
      const cx = sx / hexes.length, cz = sz / hexes.length;
      let xx = 0, zz = 0, xz = 0;
      for (const h of hexes) {
        const dx = grid.cx[h] - cx, dz = grid.cz[h] - cz;
        xx += dx * dx; zz += dz * dz; xz += dx * dz;
      }
      const angle = 0.5 * Math.atan2(2 * xz, xx - zz);
      // Pick the hex closest to the centroid that belongs to the component (for concave shapes).
      let bx = cx, bz = cz, bd = Infinity;
      for (const h of hexes) {
        const d = (grid.cx[h] - cx) ** 2 + (grid.cz[h] - cz) ** 2;
        if (d < bd) { bd = d; bx = grid.cx[h]; bz = grid.cz[h]; }
      }
      const major = Math.sqrt(Math.max(xx, zz) / hexes.length) * 3.2 + 1;
      out.push({ id, name, x: (bx + cx) / 2, z: (bz + cz) / 2, size: major, angle: clamp(angle, -0.6, 0.6), hexes: hexes.length });
    }
    out.sort((a, b) => b.hexes - a.hexes);
    this.nations = out;
  }

  private slot(i: number, cls: string): HTMLDivElement {
    let s = this.pool[i];
    if (!s) {
      const el = document.createElement('div');
      this.root.appendChild(el);
      s = { el, used: false };
      this.pool[i] = s;
    }
    if (s.el.className !== cls) {
      s.el.className = cls;
      s.el.style.cssText = '';
      s.el.textContent = '';
      delete s.el.dataset.t;
    }
    s.used = true;
    s.el.style.display = '';
    return s.el;
  }

  update(camera: THREE.PerspectiveCamera, cam: RTSCamera, canvas: HTMLCanvasElement): void {
    this.root.style.display = this.visible ? '' : 'none';
    if (!this.visible) return;
    this.timer += 1;
    if (this.dirty && this.timer > 30) {
      this.dirty = false;
      this.timer = 0;
      this.computeNations();
    } else if (!this.nations.length) this.computeNations();
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const d = cam.dist;
    const pxPerUnit = H / (2 * Math.tan((camera.fov * Math.PI) / 360) * d);
    const placed: [number, number, number, number][] = [];
    const overlaps = (x0: number, y0: number, x1: number, y1: number) => {
      for (const r of placed) if (x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1]) return true;
      return false;
    };
    let k = 0;
    const hf = this.ctx.hf;
    const project = (x: number, z: number): [number, number, boolean] => {
      const y = hf.surfaceAt(clamp(x, 0, hf.worldW), clamp(z, 0, hf.worldH), 0.5);
      this.v.set(x, y, z).project(camera);
      return [(this.v.x * 0.5 + 0.5) * W, (-this.v.y * 0.5 + 0.5) * H, this.v.z < 1 && this.v.z > -1];
    };

    // Cities first when zoomed in, nations first when zoomed out.
    const nationAlpha = smoothstep(9, 22, d);
    const cityAlpha = 1 - smoothstep(60, 110, d);
    const doCities = () => {
      if (cityAlpha <= 0.01) return;
      const minPop = d < 6 ? 0 : d < 14 ? 200 : d < 30 ? 900 : d < 60 ? 3000 : 9000;
      const st = this.game?.state;
      const list = st ? st.cities : null;
      const cities = this.ctx.cities;
      const order = cities.map((c, i) => i).sort((a, b) => {
        const ca = list ? list[a]?.capital : cities[a].capital, cb = list ? list[b]?.capital : cities[b].capital;
        if (ca !== cb) return ca ? -1 : 1;
        return cities[b].pop - cities[a].pop;
      });
      for (const i of order) {
        const c = cities[i];
        const cap = list ? !!list[i]?.capital : c.capital;
        if (c.pop < minPop && !cap) continue;
        const [sx, sy, ok] = project(c.x, c.z);
        if (!ok || sx < -50 || sy < -20 || sx > W + 50 || sy > H + 20) continue;
        const name = list?.[i]?.name ?? c.name;
        const w = name.length * 7 + 18, h = 16;
        const x0 = sx - 6, y0 = sy - h / 2;
        if (overlaps(x0, y0, x0 + w, y0 + h)) continue;
        placed.push([x0, y0, x0 + w, y0 + h]);
        const el = this.slot(k++, `rl-city${cap ? ' cap' : ''}${c.pop > 5000 ? ' big' : ''}`);
        if (el.dataset.t !== name) {
          el.innerHTML = `<i></i><span></span>`;
          (el.lastChild as HTMLElement).textContent = name;
          el.dataset.t = name;
        }
        el.style.transform = `translate(${(sx - (cap ? 5.5 : 3)).toFixed(1)}px, ${(sy - 8).toFixed(1)}px)`;
        el.style.opacity = cityAlpha.toFixed(2);
      }
    };
    const doNations = () => {
      if (nationAlpha <= 0.01) return;
      for (const n of this.nations) {
        const ext = n.size * pxPerUnit;
        const fs = clamp(ext * 0.2, 9, 34);
        if (ext < 26) continue;
        const [sx, sy, ok] = project(n.x, n.z);
        if (!ok || sx < -200 || sy < -50 || sx > W + 200 || sy > H + 50) continue;
        const text = n.name;
        const spacing = clamp(fs * 0.25, 1, 8);
        const w = text.length * (fs * 0.66 + spacing), h = fs * 1.2;
        const x0 = sx - w / 2, y0 = sy - h / 2;
        if (overlaps(x0, y0, x0 + w, y0 + h)) continue;
        placed.push([x0, y0, x0 + w, y0 + h]);
        const el = this.slot(k++, 'rl-nation');
        if (el.textContent !== text) el.textContent = text;
        el.style.fontSize = `${fs.toFixed(1)}px`;
        el.style.letterSpacing = `${spacing.toFixed(1)}px`;
        const rot = n.angle * (180 / Math.PI) * 0.8;
        el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%) rotate(${rot.toFixed(1)}deg)`;
        el.style.opacity = (nationAlpha * 0.9).toFixed(2);
      }
    };
    if (d > 40) { doNations(); doCities(); } else { doCities(); doNations(); }
    for (let i = k; i < this.pool.length; i++) {
      const s = this.pool[i];
      if (s.used) {
        s.used = false;
        s.el.style.display = 'none';
      }
    }
  }
}
