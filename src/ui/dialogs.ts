/**
 * Modal dialogs, toasts and dropdown menus.
 */
import { h, Child } from './dom';
import { icon, IconName } from './icons';

export interface DialogButton {
  label: string;
  kind?: 'primary' | 'danger' | '';
  icon?: IconName;
  /** Return false to keep the dialog open. */
  action?: () => void | boolean;
}

export interface DialogOptions {
  title: string;
  titleIcon?: IconName;
  body: Child;
  buttons?: DialogButton[];
  width?: number;
  /** Clicking outside / Esc closes (runs the last button's action when true). */
  dismissable?: boolean;
  className?: string;
  onClose?: () => void;
  dim?: boolean;
}

export interface DialogHandle {
  el: HTMLElement;
  close(): void;
  readonly open: boolean;
}

let layer: HTMLElement | null = null;
const stack: DialogHandle[] = [];

export function setModalLayer(el: HTMLElement): void {
  layer = el;
}

function ensureLayer(): HTMLElement {
  if (!layer || !layer.isConnected) {
    layer = h('div', { class: 'sc-modal-layer' });
    document.body.appendChild(layer);
  }
  return layer;
}

export function openDialogs(): number {
  return stack.filter((d) => d.open).length;
}

/** Close the top-most dismissable dialog (Esc). Returns true if one closed. */
export function closeTopDialog(): boolean {
  for (let i = stack.length - 1; i >= 0; i--) {
    const d = stack[i] as DialogHandle & { dismissable?: boolean; escape?: () => void };
    if (d.open && d.escape) {
      d.escape();
      return true;
    }
  }
  return false;
}

export function dialog(opts: DialogOptions): DialogHandle {
  const root = ensureLayer();
  const dim = opts.dim !== false ? h('div', { class: 'sc-modal-dim' }) : null;
  const foot = h('div', { class: 'foot' });
  const box = h(
    'div',
    { class: 'sc-dialog sc-panel ' + (opts.className ?? ''), style: opts.width ? `width:${opts.width}px;max-width:${opts.width}px` : '' },
    h('div', { class: 'sc-titlebar' }, opts.titleIcon ? h('span', { html: icon(opts.titleIcon) }) : null, h('span', { class: 'sc-grow' }, opts.title)),
    h('div', { class: 'body' }, opts.body),
  );
  let isOpen = true;
  const handle: DialogHandle & { escape?: () => void } = {
    el: box,
    close() {
      if (!isOpen) return;
      isOpen = false;
      box.remove();
      dim?.remove();
      const i = stack.indexOf(handle);
      if (i >= 0) stack.splice(i, 1);
      opts.onClose?.();
    },
    get open() {
      return isOpen;
    },
  };
  const buttons = opts.buttons ?? [{ label: 'OK', kind: 'primary' }];
  for (const b of buttons) {
    const btn = h('button', { class: 'sc-btn ' + (b.kind ?? '') }, b.icon ? h('span', { html: icon(b.icon) }) : null, b.label);
    btn.addEventListener('click', () => {
      const keep = b.action?.() === false;
      if (!keep) handle.close();
    });
    foot.appendChild(btn);
  }
  if (buttons.length) box.appendChild(foot);
  if (opts.dismissable !== false) {
    const last = buttons[buttons.length - 1];
    handle.escape = () => {
      if (last?.action?.() === false) return;
      handle.close();
    };
    dim?.addEventListener('click', () => handle.escape?.());
  }
  if (dim) root.appendChild(dim);
  root.appendChild(box);
  stack.push(handle);
  // focus first primary button for keyboard users
  const primary = foot.querySelector('.sc-btn.primary') as HTMLButtonElement | null;
  primary?.focus({ preventScroll: true });
  return handle;
}

export function message(title: string, text: Child, icn: IconName = 'info'): DialogHandle {
  return dialog({ title, titleIcon: icn, body: typeof text === 'string' ? h('div', null, text) : text, buttons: [{ label: 'OK', kind: 'primary' }] });
}

export function confirm(title: string, text: Child, yes: string, onYes: () => void, danger = false): DialogHandle {
  return dialog({
    title,
    titleIcon: danger ? 'warning' : 'info',
    body: typeof text === 'string' ? h('div', null, text) : text,
    buttons: [
      { label: yes, kind: danger ? 'danger' : 'primary', action: onYes },
      { label: 'Cancel' },
    ],
  });
}

/** Ask for a number. */
export function promptNumber(title: string, label: string, value: number, min: number, max: number, step: number, fmt: (v: number) => string, onOk: (v: number) => void): DialogHandle {
  const input = h('input', { class: 'sc-input num', type: 'number', min: String(min), max: String(max), step: String(step), value: String(value), style: 'width:110px' }) as HTMLInputElement;
  const range = h('input', { class: 'sc-slider', type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) }) as HTMLInputElement;
  const out = h('div', { class: 'sc-dim', style: 'margin-top:4px' }, fmt(value));
  const sync = (v: number) => {
    out.textContent = fmt(v);
    range.style.setProperty('--p', (((v - min) / (max - min)) * 100).toFixed(1) + '%');
  };
  range.addEventListener('input', () => {
    input.value = range.value;
    sync(Number(range.value));
  });
  input.addEventListener('input', () => {
    range.value = input.value;
    sync(Number(input.value));
  });
  sync(value);
  const d = dialog({
    title,
    titleIcon: 'dollar',
    body: h('div', { class: 'sc-col', style: 'min-width:320px' }, h('div', { class: 'sc-dim' }, label), h('div', { class: 'sc-row' }, range, input), out),
    buttons: [
      {
        label: 'Confirm',
        kind: 'primary',
        action: () => {
          const v = Math.min(max, Math.max(min, Number(input.value)));
          if (!isFinite(v)) return false;
          onOk(v);
        },
      },
      { label: 'Cancel' },
    ],
  });
  setTimeout(() => input.select(), 0);
  return d;
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
let toastHost: HTMLElement | null = null;
export function setToastHost(el: HTMLElement): void {
  toastHost = el;
}

export function toast(text: string, error = false): void {
  const host = toastHost && toastHost.isConnected ? toastHost : ensureLayer();
  host.querySelectorAll('.sc-toast').forEach((t) => t.remove());
  const t = h('div', { class: 'sc-toast sc-panel' + (error ? ' err' : '') }, text);
  host.appendChild(t);
  setTimeout(() => t.remove(), 2700);
}

/** Show the result of a command: toast on failure, optional toast on success. */
export function report(res: { ok: boolean; reason?: string }, okText?: string): boolean {
  if (!res.ok) toast(res.reason ?? 'Order could not be carried out', true);
  else if (okText) toast(okText);
  return res.ok;
}

// ---------------------------------------------------------------------------
// Dropdown menu
// ---------------------------------------------------------------------------
export interface DropItem {
  label: string;
  icon?: string; // raw HTML
  on?: boolean;
  action: () => void;
  tip?: string;
}

let openDrop: { el: HTMLElement; off: () => void } | null = null;

export function closeDropdown(): void {
  if (openDrop) {
    openDrop.el.remove();
    openDrop.off();
    openDrop = null;
  }
}

export function dropdown(anchor: HTMLElement, items: DropItem[], alignRight = false): void {
  closeDropdown();
  const root = ensureLayer();
  const el = h('div', { class: 'sc-dropdown sc-panel' });
  for (const it of items) {
    const row = h('div', { class: 'it' + (it.on ? ' on' : '') }, it.icon ? h('span', { html: it.icon }) : null, h('span', null, it.label));
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      closeDropdown();
      it.action();
    });
    el.appendChild(row);
  }
  root.appendChild(el);
  const r = anchor.getBoundingClientRect();
  const rr = root.getBoundingClientRect();
  const w = el.offsetWidth;
  let left = alignRight ? r.right - w - rr.left : r.left - rr.left;
  left = Math.max(4, Math.min(rr.width - w - 4, left));
  el.style.left = left + 'px';
  el.style.top = r.bottom + 3 - rr.top + 'px';
  const onDown = (e: MouseEvent) => {
    if (!el.contains(e.target as Node) && !anchor.contains(e.target as Node)) closeDropdown();
  };
  setTimeout(() => document.addEventListener('mousedown', onDown), 0);
  openDrop = { el, off: () => document.removeEventListener('mousedown', onDown) };
}
