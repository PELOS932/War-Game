/**
 * Player preferences (persisted in localStorage) and the Options dialog.
 */
import { h } from './dom';
import { dialog } from './dialogs';
import { toggle } from './widgets';
import type { MapRenderer, RenderSettings } from '../render/api';

export interface UIOptions {
  render: Partial<RenderSettings>;
  autoPauseEvents: boolean;
  autoPauseProposals: boolean;
  tooltips: boolean;
  newsPopups: boolean;
  uiScale: number;
}

const KEY = 'sc2030.options';

const DEFAULTS: UIOptions = {
  render: {},
  autoPauseEvents: true,
  autoPauseProposals: true,
  tooltips: true,
  newsPopups: true,
  uiScale: 1,
};

let cache: UIOptions | null = null;

export function loadOptions(): UIOptions {
  if (cache) return cache;
  let o: UIOptions = { ...DEFAULTS, render: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<UIOptions>;
      o = { ...o, ...p, render: { ...(p.render ?? {}) } };
    }
  } catch {
    /* storage blocked */
  }
  cache = o;
  return o;
}

export function saveOptions(o: UIOptions): void {
  cache = o;
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {
    /* storage blocked */
  }
}

export function applyUIScale(el: HTMLElement, scale: number): void {
  (el.style as CSSStyleDeclaration & { zoom?: string }).zoom = scale === 1 ? '' : String(scale);
}

/** Options dialog. With a renderer the render settings apply live. */
export function showOptions(renderer: MapRenderer | null, onApplied?: (o: UIOptions) => void): void {
  const o = loadOptions();
  const cur: RenderSettings = {
    dayNight: true,
    clouds: true,
    shadows: true,
    hexGrid: false,
    labels: true,
    units: true,
    quality: 'high',
    ...(renderer?.settings ?? {}),
    ...o.render,
  };
  const draft: UIOptions = { ...o, render: { ...cur } };
  const setR = <K extends keyof RenderSettings>(k: K, v: RenderSettings[K]) => {
    draft.render[k] = v;
    renderer?.applySettings({ [k]: v } as Partial<RenderSettings>);
  };
  const quality = h('select', { class: 'sc-select' },
    ...(['low', 'medium', 'high'] as const).map((q) => h('option', { value: q, selected: cur.quality === q }, q[0].toUpperCase() + q.slice(1)))) as HTMLSelectElement;
  quality.addEventListener('change', () => setR('quality', quality.value as RenderSettings['quality']));
  const scale = h('select', { class: 'sc-select' },
    ...[0.85, 0.9, 1, 1.1, 1.2, 1.35].map((s) => h('option', { value: String(s), selected: Math.abs(o.uiScale - s) < 0.01 }, Math.round(s * 100) + '%'))) as HTMLSelectElement;
  scale.addEventListener('change', () => (draft.uiScale = Number(scale.value)));
  const grid = h('div', { class: 'sc-opts' },
    h('div', { class: 'grp sc-sechead' }, 'Graphics'),
    h('span', null, 'Render quality'), quality,
    h('span', null, 'Day / night cycle'), toggle('', !!cur.dayNight, (v) => setR('dayNight', v)).el,
    h('span', null, 'Clouds'), toggle('', !!cur.clouds, (v) => setR('clouds', v)).el,
    h('span', null, 'Shadows'), toggle('', !!cur.shadows, (v) => setR('shadows', v)).el,
    h('span', null, 'Hex grid overlay'), toggle('', !!cur.hexGrid, (v) => setR('hexGrid', v)).el,
    h('span', null, 'Map labels'), toggle('', !!cur.labels, (v) => setR('labels', v)).el,
    h('span', null, 'Show units'), toggle('', cur.units !== false, (v) => setR('units', v)).el,
    h('div', { class: 'grp sc-sechead' }, 'Interface'),
    h('span', null, 'Interface scale'), scale,
    h('span', null, 'Tooltips'), toggle('', o.tooltips, (v) => (draft.tooltips = v)).el,
    h('span', null, 'Pop-up major news'), toggle('', o.newsPopups, (v) => (draft.newsPopups = v)).el,
    h('span', null, 'Pause on major events'), toggle('', o.autoPauseEvents, (v) => (draft.autoPauseEvents = v)).el,
    h('span', null, 'Pause on diplomatic proposals'), toggle('', o.autoPauseProposals, (v) => (draft.autoPauseProposals = v)).el,
  );
  dialog({
    title: 'Options',
    titleIcon: 'gear',
    body: grid,
    buttons: [
      {
        label: 'Apply',
        kind: 'primary',
        action: () => {
          saveOptions(draft);
          onApplied?.(draft);
        },
      },
      {
        label: 'Cancel',
        action: () => {
          // revert live render changes
          if (renderer) renderer.applySettings({ ...cur, ...o.render });
        },
      },
    ],
  });
}
