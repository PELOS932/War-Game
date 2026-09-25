/**
 * Tiny DOM toolkit for the UI: element builder, diff-friendly setters,
 * number formatting and a keyed list reconciler. No framework.
 */

export type Child = Node | string | number | null | undefined | false | Child[];

export interface Props {
  [key: string]: unknown;
  class?: string;
  style?: string | Partial<CSSStyleDeclaration>;
  tip?: TipContent;
}

export type TipContent = string | (() => string);

/** Tooltip registry (content may be a function evaluated when shown). */
export const tipRegistry = new WeakMap<Element, TipContent>();

export function setTip(el: Element, tip: TipContent | null): void {
  if (tip == null || tip === '') {
    tipRegistry.delete(el);
    el.removeAttribute('data-has-tip');
  } else {
    tipRegistry.set(el, tip);
    el.setAttribute('data-has-tip', '');
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) applyProps(el, props);
  append(el, children);
  return el;
}

function applyProps(el: HTMLElement, props: Props): void {
  for (const k in props) {
    const v = props[k];
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'style') {
      if (typeof v === 'string') el.style.cssText = v;
      else Object.assign(el.style, v);
    } else if (k === 'tip') setTip(el, v as TipContent);
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'html') el.innerHTML = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (k in el && typeof v !== 'string') {
      (el as unknown as Record<string, unknown>)[k] = v;
    } else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
}

export function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

/** Element from an HTML string (first element child). */
export function fromHTML<T extends Element = HTMLElement>(html: string): T {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as T;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Only touches the DOM when the value actually changed. */
export function setText(el: Element, s: string): void {
  if (el.textContent !== s) el.textContent = s;
}

export function setHTML(el: Element & { _html?: string }, s: string): void {
  if (el._html !== s) {
    el._html = s;
    el.innerHTML = s;
  }
}

export function setClass(el: Element, cls: string, on: boolean): void {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

export function setStyle(el: HTMLElement, prop: string, value: string): void {
  if (el.style.getPropertyValue(prop) !== value) el.style.setProperty(prop, value);
}

export function escapeHTML(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

// ---------------------------------------------------------------------------
// Number formatting
// ---------------------------------------------------------------------------

/** Money given in billions USD. */
export function fmtMoney(billions: number, digits = 1): string {
  const neg = billions < 0;
  const a = Math.abs(billions);
  let s: string;
  if (a >= 1000) s = `$${(a / 1000).toFixed(a >= 10000 ? 1 : 2)}T`;
  else if (a >= 1) s = `$${a.toFixed(a >= 100 ? 0 : digits)}B`;
  else if (a >= 0.001) s = `$${(a * 1000).toFixed(a >= 0.1 ? 0 : 1)}M`;
  else if (a === 0) s = '$0';
  else s = `$${(a * 1e6).toFixed(0)}K`;
  return neg ? '-' + s : s;
}

/** Money given in millions USD. */
export function fmtMillions(m: number): string {
  return fmtMoney(m / 1000);
}

/** Population given in millions. */
export function fmtPop(millions: number): string {
  const a = Math.abs(millions);
  if (a >= 1000) return (millions / 1000).toFixed(2) + 'B';
  if (a >= 100) return millions.toFixed(0) + 'M';
  if (a >= 1) return millions.toFixed(1) + 'M';
  if (a >= 0.001) return (millions * 1000).toFixed(0) + 'K';
  return (millions * 1e6).toFixed(0);
}

/** Population given in thousands. */
export function fmtThousands(k: number): string {
  return fmtPop(k / 1000);
}

export function fmtNum(x: number, digits = 0): string {
  if (!isFinite(x)) return '—';
  return x.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Compact number: 1.2K, 3.4M ... */
export function fmtCompact(x: number): string {
  const a = Math.abs(x);
  if (!isFinite(x)) return '—';
  if (a >= 1e9) return (x / 1e9).toFixed(1) + 'G';
  if (a >= 1e6) return (x / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M';
  if (a >= 1e3) return (x / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'K';
  if (a >= 100) return x.toFixed(0);
  if (a >= 10) return x.toFixed(1);
  return x.toFixed(a === 0 ? 0 : a < 1 ? 2 : 1);
}

export function fmtSigned(x: number, f: (v: number) => string = fmtCompact): string {
  if (x > 0) return '+' + f(x);
  if (x < 0) return '-' + f(-x);
  return f(0);
}

export function fmtPct(fraction: number, digits = 1): string {
  return (fraction * 100).toFixed(digits) + '%';
}

export function signClass(x: number, eps = 1e-9): string {
  return x > eps ? 'pos' : x < -eps ? 'neg' : 'zero';
}

export function clamp(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x;
}

export function rgbCss(c: [number, number, number] | number[], a = 1): string {
  const r = c[0] <= 1 && c[1] <= 1 && c[2] <= 1 ? c.map((v) => Math.round(v * 255)) : c;
  return a >= 1 ? `rgb(${r[0]},${r[1]},${r[2]})` : `rgba(${r[0]},${r[1]},${r[2]},${a})`;
}

/** Credit rating letters from 0..100 score. */
export function creditGrade(score: number): string {
  const grades = ['D', 'C', 'CC', 'CCC', 'B-', 'B', 'B+', 'BB-', 'BB', 'BB+', 'BBB-', 'BBB', 'BBB+', 'A-', 'A', 'A+', 'AA-', 'AA', 'AA+', 'AAA'];
  return grades[clamp(Math.floor((score / 100) * grades.length), 0, grades.length - 1)];
}

/** "someCamelKey" -> "Some Camel Key". */
export function prettyKey(k: string): string {
  const s = k.replace(/_/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Keyed list reconciliation
// ---------------------------------------------------------------------------

export interface KeyedRow<T> {
  el: HTMLElement;
  update(item: T): void;
}

/**
 * Keeps `container`'s children in sync with `items`, creating rows for new
 * keys, updating existing rows in place and removing stale ones.
 */
export class KeyedList<T> {
  private rows = new Map<string | number, KeyedRow<T>>();
  constructor(
    private container: HTMLElement,
    private key: (item: T) => string | number,
    private create: (item: T) => KeyedRow<T>,
  ) {}

  sync(items: T[]): void {
    const seen = new Set<string | number>();
    let prev: Element | null = null;
    for (const item of items) {
      const k = this.key(item);
      seen.add(k);
      let row = this.rows.get(k);
      if (!row) {
        row = this.create(item);
        this.rows.set(k, row);
      }
      row.update(item);
      const want: Element | null = prev ? prev.nextElementSibling : this.container.firstElementChild;
      if (want !== row.el) this.container.insertBefore(row.el, want);
      prev = row.el;
    }
    for (const [k, row] of this.rows) {
      if (!seen.has(k)) {
        row.el.remove();
        this.rows.delete(k);
      }
    }
  }

  get(k: string | number): KeyedRow<T> | undefined {
    return this.rows.get(k);
  }

  clear(): void {
    for (const row of this.rows.values()) row.el.remove();
    this.rows.clear();
  }
}

/** Returns true when an editable control has keyboard focus. */
export function typingInField(): boolean {
  const a = document.activeElement as HTMLElement | null;
  if (!a) return false;
  const tag = a.tagName;
  return (tag === 'INPUT' && (a as HTMLInputElement).type !== 'range' && (a as HTMLInputElement).type !== 'checkbox') || tag === 'TEXTAREA' || tag === 'SELECT' || a.isContentEditable;
}

/** Simple string hash (FNV-1a). */
export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small seeded PRNG (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
