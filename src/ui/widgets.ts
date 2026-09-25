/**
 * Reusable UI widgets: bars, sliders, toggles, flags, sparklines, rating stars.
 */
import { h, setStyle, setText, setTip, clamp, TipContent } from './dom';
import { flagDataURL } from './flags';
import type { FlagSpec } from '../worldgen/types';

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------
export function flagImg(spec: FlagSpec | undefined, hgt = 14, tip?: TipContent): HTMLImageElement {
  const w = Math.round(hgt * (spec?.aspect ?? 1.5));
  const img = h('img', { class: 'sc-flag', width: w, height: hgt, draggable: false, alt: '' });
  if (spec) {
    try {
      img.src = flagDataURL(spec, w * 2, hgt * 2);
    } catch {
      /* flag renderer unavailable */
    }
  }
  if (tip) setTip(img, tip);
  return img;
}

export function flagHTML(spec: FlagSpec | undefined, hgt = 12): string {
  if (!spec) return '';
  const w = Math.round(hgt * (spec.aspect ?? 1.5));
  let src = '';
  try {
    src = flagDataURL(spec, w * 2, hgt * 2);
  } catch {
    /* ignore */
  }
  return `<img class="sc-flag" src="${src}" width="${w}" height="${hgt}" alt="">`;
}

// ---------------------------------------------------------------------------
// Bars
// ---------------------------------------------------------------------------
export interface Bar {
  el: HTMLDivElement;
  set(fraction: number, label?: string): void;
}

/** Colour mode 'auto' picks red/amber/green by value. */
export function bar(color: 'auto' | 'green' | 'amber' | 'red' | 'blue' | 'grey' = 'auto', tall = false): Bar {
  const fill = h('i');
  const txt = tall ? h('span', { class: 'sc-bar-t' }) : null;
  const el = h('div', { class: 'sc-bar' + (tall ? ' tall' : '') + (color !== 'auto' && color !== 'green' ? ' ' + color : '') }, fill, txt);
  let lastCls = '';
  return {
    el,
    set(f: number, label?: string) {
      const p = clamp(f, 0, 1);
      setStyle(fill, 'width', (p * 100).toFixed(1) + '%');
      if (color === 'auto') {
        const cls = p < 0.3 ? 'red' : p < 0.6 ? 'amber' : '';
        if (cls !== lastCls) {
          if (lastCls) el.classList.remove(lastCls);
          if (cls) el.classList.add(cls);
          lastCls = cls;
        }
      }
      if (txt && label !== undefined) setText(txt, label);
    },
  };
}

export function barHTML(f: number, color: 'auto' | 'green' | 'amber' | 'red' | 'blue' | 'grey' = 'auto', width = 60): string {
  const p = clamp(f, 0, 1);
  const cls = color === 'auto' ? (p < 0.3 ? 'red' : p < 0.6 ? 'amber' : '') : color === 'green' ? '' : color;
  return `<div class="sc-bar ${cls}" style="width:${width}px;display:inline-block;vertical-align:middle"><i style="width:${(p * 100).toFixed(1)}%"></i></div>`;
}

/** Relation bar -100..100 (red..green) centred at zero. */
export function relBarHTML(v: number, width = 70): string {
  const p = clamp(v, -100, 100) / 100;
  const left = p < 0 ? 50 + p * 50 : 50;
  const w = Math.abs(p) * 50;
  const col = relColor(v);
  return `<div class="sc-rel" style="width:${width}px;display:inline-block;vertical-align:middle"><i style="left:${left}%;width:${w}%;background:${col}"></i></div>`;
}

export function relColor(v: number): string {
  if (v >= 50) return '#5fd65a';
  if (v >= 15) return '#a6d65a';
  if (v > -15) return '#d6c85a';
  if (v > -50) return '#e38a3c';
  return '#e84a3a';
}

export function relLabel(v: number): string {
  if (v >= 75) return 'Allied';
  if (v >= 45) return 'Friendly';
  if (v >= 15) return 'Cordial';
  if (v > -15) return 'Neutral';
  if (v > -45) return 'Cool';
  if (v > -75) return 'Hostile';
  return 'Belligerent';
}

// ---------------------------------------------------------------------------
// Slider
// ---------------------------------------------------------------------------
export interface Slider {
  el: HTMLDivElement;
  input: HTMLInputElement;
  set(v: number): void;
  readonly dragging: boolean;
}

export function slider(opts: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  onInput?: (v: number) => void;
  tip?: TipContent;
}): Slider {
  const input = h('input', { type: 'range', class: 'sc-slider', min: String(opts.min), max: String(opts.max), step: String(opts.step) }) as HTMLInputElement;
  const val = h('span', { class: 'val' });
  const lbl = h('span', { class: 'lbl' }, opts.label);
  const el = h('div', { class: 'sc-slrow' }, lbl, input, val);
  if (opts.tip) setTip(lbl, opts.tip);
  let dragging = false;
  const paint = (v: number) => {
    const p = ((v - opts.min) / (opts.max - opts.min)) * 100;
    input.style.setProperty('--p', p.toFixed(1) + '%');
    setText(val, opts.format(v));
  };
  input.addEventListener('pointerdown', () => (dragging = true));
  input.addEventListener('pointerup', () => (dragging = false));
  input.addEventListener('input', () => {
    const v = Number(input.value);
    paint(v);
    opts.onInput?.(v);
  });
  input.addEventListener('change', () => {
    dragging = false;
    opts.onChange(Number(input.value));
  });
  input.value = String(opts.value);
  paint(opts.value);
  return {
    el,
    input,
    get dragging() {
      return dragging || document.activeElement === input && dragging;
    },
    set(v: number) {
      if (dragging) return;
      if (Math.abs(Number(input.value) - v) > opts.step * 0.5) input.value = String(v);
      paint(Number(input.value));
    },
  };
}

// ---------------------------------------------------------------------------
// Toggle switch
// ---------------------------------------------------------------------------
export interface Toggle {
  el: HTMLElement;
  set(on: boolean): void;
}

export function toggle(label: string, on: boolean, onChange: (on: boolean) => void, tip?: TipContent): Toggle {
  const txt = h('span', null, label);
  const el = h('span', { class: 'sc-toggle' + (on ? ' on' : '') }, h('span', { class: 'sc-sw' }), label ? txt : null);
  if (tip) setTip(el, tip);
  let state = on;
  el.addEventListener('click', () => {
    state = !state;
    el.classList.toggle('on', state);
    onChange(state);
  });
  return {
    el,
    set(v: boolean) {
      if (v !== state) {
        state = v;
        el.classList.toggle('on', v);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Sparkline (SVG)
// ---------------------------------------------------------------------------
export function sparklineSVG(values: number[], color = '#f0a830', w = 180, hgt = 40): string {
  if (values.length < 2) {
    return `<svg class="sc-spark" viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none"><text x="${w / 2}" y="${hgt / 2 + 4}" fill="#5f675c" font-size="10" text-anchor="middle">collecting data…</text></svg>`;
  }
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max - min < 1e-9) {
    max += 1;
    min -= 1;
  }
  const pad = 3;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = pad + (1 - (v - min) / (max - min)) * (hgt - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const grid = [0.25, 0.5, 0.75].map((f) => `<line x1="0" x2="${w}" y1="${(hgt * f).toFixed(1)}" y2="${(hgt * f).toFixed(1)}" stroke="rgba(255,255,255,.06)"/>`).join('');
  const last = pts[pts.length - 1].split(',');
  return `<svg class="sc-spark" viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none">${grid}` +
    `<path d="M0,${hgt} L${pts.join(' L')} L${w},${hgt} Z" fill="${color}" fill-opacity=".16"/>` +
    `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>` +
    `<circle cx="${last[0]}" cy="${last[1]}" r="2.2" fill="${color}"/></svg>`;
}

// ---------------------------------------------------------------------------
// Rating stars
// ---------------------------------------------------------------------------
export function starsHTML(n: number, max = 5): string {
  let s = '<span class="sc-stars">';
  for (let i = 0; i < max; i++) s += i < n ? '★' : '<span class="off">★</span>';
  return s + '</span>';
}

export const DIFFICULTY_NAMES = ['', 'Very Easy', 'Easy', 'Moderate', 'Hard', 'Very Hard'];
