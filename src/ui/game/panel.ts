/**
 * Right-hand command panel: vertical tab strip (F1–F9) + content area.
 */
import { h, setText, clear, setTip } from '../dom';
import { icon, IconName } from '../icons';
import { flagImg } from '../widgets';
import type { Ctx, TabId } from './context';

export interface TabView {
  id: TabId;
  title: string;
  icon: IconName;
  tip: string;
  el: HTMLElement;
  wide?: boolean;
  /** Called when the tab becomes visible, with an optional navigation argument. */
  show?(arg?: unknown): void;
  hide?(): void;
  /** Refresh contents (force = data definitely changed). */
  update(force: boolean): void;
}

export class CommandPanel {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private content: HTMLElement;
  private title: HTMLElement;
  private flagSlot: HTMLElement;
  private tabBtns = new Map<TabId, HTMLElement>();
  private tabs = new Map<TabId, TabView>();
  private current: TabId | null = null;
  private timer = 0;
  private forceNext = false;
  private wideBtn: HTMLElement;
  private userWide = false;
  onLayout: () => void = () => {};

  constructor(private ctx: Ctx, views: TabView[]) {
    const strip = h('div', { class: 'sc-cmd-tabs' });
    views.forEach((v, i) => {
      this.tabs.set(v.id, v);
      const b = h('div', { class: 'sc-tab', html: icon(v.icon) + `<span class="k">F${i + 1}</span>` });
      b.addEventListener('click', () => this.toggle(v.id));
      setTip(b, `<div class="tt-title">${v.title}<span class="tt-key">F${i + 1}</span></div>${v.tip}`);
      this.tabBtns.set(v.id, b);
      strip.appendChild(b);
      if (i === 0 || i === 3 || i === 7) strip.appendChild(h('div', { class: 'sc-tab-sep' }));
    });
    this.title = h('span', { class: 'sc-grow' });
    this.flagSlot = h('span', { class: 'sc-cmd-head-flag' });
    this.wideBtn = h('button', { class: 'sc-btn sm', tip: 'Expand / shrink panel', html: icon('expand') });
    this.wideBtn.addEventListener('click', () => {
      this.userWide = !this.userWide;
      this.applyWide();
    });
    const closeBtn = h('button', { class: 'sc-btn sm', tip: 'Close panel', html: icon('chevRight') });
    closeBtn.addEventListener('click', () => this.collapse());
    this.content = h('div', { class: 'sc-cmd-content sc-scroll' });
    this.body = h('div', { class: 'sc-cmd-body sc-panel' },
      h('div', { class: 'sc-titlebar' }, this.flagSlot, this.title, this.wideBtn, closeBtn),
      this.content,
    );
    this.el = h('div', { class: 'sc-cmd collapsed' }, strip, this.body);
    for (const v of views) {
      v.el.style.display = 'none';
      this.content.appendChild(v.el);
    }
  }

  get width(): number {
    return this.el.classList.contains('collapsed') ? 44 : this.el.classList.contains('wide') ? 744 : 484;
  }

  get active(): TabId | null {
    return this.current;
  }

  private applyWide(): void {
    const v = this.current ? this.tabs.get(this.current) : null;
    this.el.classList.toggle('wide', !!v && (this.userWide || !!v.wide));
    this.onLayout();
  }

  open(id: TabId, arg?: unknown): void {
    const v = this.tabs.get(id);
    if (!v) return;
    if (this.current && this.current !== id) {
      const old = this.tabs.get(this.current);
      if (old) {
        old.el.style.display = 'none';
        old.hide?.();
      }
      this.tabBtns.get(this.current)?.classList.remove('on');
    }
    this.current = id;
    this.el.classList.remove('collapsed');
    this.tabBtns.get(id)?.classList.add('on');
    v.el.style.display = '';
    setText(this.title, v.title);
    clear(this.flagSlot);
    const me = this.ctx.me;
    if (me) this.flagSlot.appendChild(flagImg(me.flag, 13));
    v.show?.(arg);
    v.update(true);
    this.applyWide();
  }

  toggle(id: TabId): void {
    if (this.current === id && !this.el.classList.contains('collapsed')) this.collapse();
    else this.open(id);
  }

  collapse(): void {
    if (this.current) {
      const v = this.tabs.get(this.current);
      v?.hide?.();
      if (v) v.el.style.display = 'none';
      this.tabBtns.get(this.current)?.classList.remove('on');
    }
    this.current = null;
    this.el.classList.add('collapsed');
    this.el.classList.remove('wide');
    this.onLayout();
  }

  /** The scrolling content element (tabs that manage their own scroll disable it). */
  setContentScroll(on: boolean): void {
    this.content.classList.toggle('sc-scroll', on);
    this.content.style.overflow = on ? '' : 'hidden';
  }

  markDirty(): void {
    this.forceNext = true;
  }

  update(dt: number): void {
    if (!this.current) return;
    this.timer -= dt;
    if (this.timer > 0 && !this.forceNext) return;
    this.timer = 0.25;
    const f = this.forceNext;
    this.forceNext = false;
    try {
      this.tabs.get(this.current)?.update(f);
    } catch (e) {
      console.error('[ui] tab update failed', e);
    }
  }
}
