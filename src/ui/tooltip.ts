/**
 * Global tooltip: any element registered with setTip() (see dom.ts) shows a
 * floating tip after a short hover delay. One instance per document.
 */
import { tipRegistry } from './dom';

let tipEl: HTMLDivElement | null = null;
let current: Element | null = null;
let timer = 0;
let lastX = 0;
let lastY = 0;
let installed = false;

function findTipTarget(node: EventTarget | null): Element | null {
  let el = node as Element | null;
  while (el && el.nodeType === 1) {
    if (tipRegistry.has(el)) return el;
    el = el.parentElement;
  }
  return null;
}

function place(): void {
  if (!tipEl) return;
  const r = tipEl.getBoundingClientRect();
  let x = lastX + 14;
  let y = lastY + 18;
  if (x + r.width > window.innerWidth - 4) x = lastX - r.width - 10;
  if (y + r.height > window.innerHeight - 4) y = lastY - r.height - 10;
  tipEl.style.left = Math.max(4, x) + 'px';
  tipEl.style.top = Math.max(4, y) + 'px';
}

function show(): void {
  if (!tipEl || !current) return;
  const c = tipRegistry.get(current);
  if (!c) return;
  const html = typeof c === 'function' ? c() : c;
  if (!html) return;
  tipEl.innerHTML = html;
  tipEl.classList.add('show');
  place();
}

export function hideTip(): void {
  clearTimeout(timer);
  current = null;
  tipEl?.classList.remove('show');
}

export function installTooltips(): void {
  if (installed) return;
  installed = true;
  tipEl = document.createElement('div');
  tipEl.className = 'sc-tooltip';
  document.body.appendChild(tipEl);
  document.addEventListener('mouseover', (e) => {
    const t = findTipTarget(e.target);
    if (t === current) return;
    clearTimeout(timer);
    tipEl?.classList.remove('show');
    current = t;
    if (t) timer = window.setTimeout(show, 380);
  });
  document.addEventListener('mousemove', (e) => {
    lastX = e.clientX;
    lastY = e.clientY;
    if (tipEl?.classList.contains('show')) place();
  });
  document.addEventListener('mousedown', () => hideTip(), true);
  document.addEventListener('wheel', () => hideTip(), { passive: true });
}

/** Refresh the currently shown tip (dynamic content). */
export function refreshTip(): void {
  if (tipEl?.classList.contains('show')) show();
}
