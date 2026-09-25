/**
 * SHARED — flag rendering (full implementation owned by the data agent).
 * Stable exports used by the UI and the renderer:
 *   drawFlag(ctx, spec, x, y, w, h)  — draw a flag into a 2D canvas context
 *   flagCanvas(spec, w, h)           — new canvas with the flag
 *   flagDataURL(spec, w, h)          — cached PNG data URL (for <img>)
 */
import type { FlagSpec } from '../worldgen/types';

export function drawFlag(ctx: CanvasRenderingContext2D, spec: FlagSpec, x: number, y: number, w: number, h: number): void {
  const cols = spec.colors.length ? spec.colors : ['#888'];
  const ratios = spec.ratios ?? cols.map(() => 1);
  const total = ratios.reduce((a, b) => a + b, 0);
  let acc = 0;
  cols.forEach((c, i) => {
    ctx.fillStyle = c;
    if (spec.layout === 'vstripes') ctx.fillRect(x + (acc / total) * w, y, (ratios[i] / total) * w + 0.5, h);
    else ctx.fillRect(x, y + (acc / total) * h, w, (ratios[i] / total) * h + 0.5);
    acc += ratios[i];
  });
}

export function flagCanvas(spec: FlagSpec, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx) drawFlag(ctx, spec, 0, 0, w, h);
  return c;
}

const cache = new Map<string, string>();
export function flagDataURL(spec: FlagSpec, w: number, h: number): string {
  const key = JSON.stringify(spec) + w + 'x' + h;
  let url = cache.get(key);
  if (!url) {
    url = flagCanvas(spec, w, h).toDataURL();
    cache.set(key, url);
  }
  return url;
}
