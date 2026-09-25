import type { RTSCamera } from './camera';

export interface InputCallbacks {
  /** World point on the ground under a client position (for zoom-to-cursor and grab-pan). */
  groundAt(clientX: number, clientY: number): { x: number; z: number } | null;
  click(button: 0 | 2, clientX: number, clientY: number, shift: boolean, ctrl: boolean, double: boolean): void;
  hover(clientX: number, clientY: number): void;
  boxSelect(x0: number, y0: number, x1: number, y1: number, shift: boolean): void;
}

const DRAG_PX = 5;

/**
 * RTS input: WASD/arrows/edge-scroll pan, wheel zoom toward cursor, Q/E and
 * alt-drag rotate, middle/right-drag grab-pan, left click / box select, right
 * click (not after a right-drag), double click.
 */
export class InputHandler {
  private el: HTMLElement;
  private cam: RTSCamera;
  private cb: InputCallbacks;
  private keys = new Set<string>();
  private down: { button: number; x: number; y: number; dragging: boolean; mode: 'none' | 'box' | 'pan' | 'rotate'; ground: { x: number; z: number } | null } | null = null;
  private boxEl: HTMLDivElement;
  private mouse = { x: -1, y: -1, inside: false, moved: false };
  private hoverPending = false;
  edgeScroll = true;
  private lastClickTime = 0;
  private lastClickPos = { x: 0, y: 0 };
  private disposers: (() => void)[] = [];

  constructor(el: HTMLElement, cam: RTSCamera, cb: InputCallbacks) {
    this.el = el;
    this.cam = cam;
    this.cb = cb;
    this.boxEl = document.createElement('div');
    Object.assign(this.boxEl.style, {
      position: 'absolute', border: '1px solid rgba(140,220,255,0.95)', background: 'rgba(120,200,255,0.12)',
      pointerEvents: 'none', display: 'none', zIndex: '5', boxShadow: '0 0 6px rgba(120,200,255,0.5)',
    } as CSSStyleDeclaration);
    (el.parentElement ?? el).appendChild(this.boxEl);

    const on = <K extends keyof HTMLElementEventMap>(t: EventTarget, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts);
      this.disposers.push(() => t.removeEventListener(type, fn as EventListener, opts));
    };
    on(el, 'pointerdown', (e: PointerEvent) => this.onDown(e));
    on(window, 'pointermove', (e: PointerEvent) => this.onMove(e));
    on(window, 'pointerup', (e: PointerEvent) => this.onUp(e));
    on(el, 'wheel', (e: WheelEvent) => this.onWheel(e), { passive: false });
    on(el, 'contextmenu', (e: MouseEvent) => e.preventDefault());
    on(el, 'pointerleave', () => { this.mouse.inside = false; });
    on(el, 'pointerenter', () => { this.mouse.inside = true; });
    on(window, 'keydown', (e: KeyboardEvent) => this.onKey(e, true));
    on(window, 'keyup', (e: KeyboardEvent) => this.onKey(e, false));
    on(window, 'blur', () => this.keys.clear());
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.boxEl.remove();
  }

  private isTyping(e: Event): boolean {
    const t = e.target as HTMLElement | null;
    if (!t) return false;
    const tag = t.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (down && this.isTyping(e)) return;
    const k = e.key.toLowerCase();
    const handled = ['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', '+', '-', '=', 'pageup', 'pagedown'];
    if (!handled.includes(k)) return;
    if (down) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      this.keys.add(k);
      if (k.startsWith('arrow')) e.preventDefault();
    } else this.keys.delete(k);
  }

  private rect(): DOMRect {
    return this.el.getBoundingClientRect();
  }

  private onDown(e: PointerEvent): void {
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
    if (this.down) return;
    const mode = e.button === 1 ? 'pan' : 'none';
    this.down = { button: e.button, x: e.clientX, y: e.clientY, dragging: false, mode, ground: null };
    if (e.button === 1 || e.button === 2) {
      this.down.ground = this.cb.groundAt(e.clientX, e.clientY);
      e.preventDefault();
    }
    try { this.el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  private onMove(e: PointerEvent): void {
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
    this.mouse.moved = true;
    const r = this.rect();
    this.mouse.inside = e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom;
    const d = this.down;
    if (d) {
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!d.dragging && Math.hypot(dx, dy) > DRAG_PX) {
        d.dragging = true;
        if (d.button === 0) d.mode = e.altKey ? 'rotate' : 'box';
        else if (d.button === 2 || d.button === 1) d.mode = 'pan';
      }
      if (d.dragging) {
        if (d.mode === 'box') {
          const x0 = Math.min(d.x, e.clientX) - r.left, y0 = Math.min(d.y, e.clientY) - r.top;
          Object.assign(this.boxEl.style, {
            display: 'block', left: `${x0 + this.el.offsetLeft}px`, top: `${y0 + this.el.offsetTop}px`,
            width: `${Math.abs(dx)}px`, height: `${Math.abs(dy)}px`,
          });
        } else if (d.mode === 'rotate') {
          this.cam.rotateBy(-(e.movementX || 0) * 0.006);
        } else if (d.mode === 'pan') {
          const g = this.cb.groundAt(e.clientX, e.clientY);
          if (d.ground && g) {
            this.cam.panBy(d.ground.x - g.x, d.ground.z - g.z);
            // Snap current state too so grab-pan feels direct.
            this.cam.x += d.ground.x - g.x;
            this.cam.z += d.ground.z - g.z;
          } else if (!d.ground) d.ground = g;
        }
      }
    }
    if (!this.hoverPending && this.mouse.inside) {
      this.hoverPending = true;
    }
  }

  private onUp(e: PointerEvent): void {
    const d = this.down;
    if (!d || e.button !== d.button) return;
    this.down = null;
    try { this.el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    this.boxEl.style.display = 'none';
    const r = this.rect();
    if (d.dragging) {
      if (d.mode === 'box') {
        this.cb.boxSelect(Math.min(d.x, e.clientX), Math.min(d.y, e.clientY), Math.max(d.x, e.clientX), Math.max(d.y, e.clientY), e.shiftKey);
      }
      return;
    }
    if (e.clientX < r.left || e.clientY < r.top || e.clientX >= r.right || e.clientY >= r.bottom) return;
    if (d.button === 0) {
      const now = performance.now();
      const dbl = now - this.lastClickTime < 350 && Math.hypot(e.clientX - this.lastClickPos.x, e.clientY - this.lastClickPos.y) < 6;
      this.lastClickTime = dbl ? 0 : now;
      this.lastClickPos = { x: e.clientX, y: e.clientY };
      this.cb.click(0, e.clientX, e.clientY, e.shiftKey, e.ctrlKey || e.metaKey, dbl);
    } else if (d.button === 2) {
      this.cb.click(2, e.clientX, e.clientY, e.shiftKey, e.ctrlKey || e.metaKey, false);
    }
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 32;
    else if (e.deltaMode === 2) dy *= 400;
    const factor = Math.exp(Math.max(-1.5, Math.min(1.5, dy * 0.0016)));
    const g = this.cb.groundAt(e.clientX, e.clientY);
    this.cam.zoomAt(factor, g?.x, g?.z);
  }

  /** Per-frame continuous input (keys, edge scroll) and hover dispatch. */
  update(dt: number): void {
    const k = this.keys;
    let right = 0, fwd = 0, rot = 0, zoom = 0;
    if (k.has('a') || k.has('arrowleft')) right -= 1;
    if (k.has('d') || k.has('arrowright')) right += 1;
    if (k.has('w') || k.has('arrowup')) fwd += 1;
    if (k.has('s') || k.has('arrowdown')) fwd -= 1;
    if (k.has('q')) rot += 1;
    if (k.has('e')) rot -= 1;
    if (k.has('+') || k.has('=') || k.has('pageup')) zoom -= 1;
    if (k.has('-') || k.has('pagedown')) zoom += 1;
    if (this.edgeScroll && this.mouse.inside && this.mouse.moved && !this.down && document.hasFocus()) {
      const r = this.rect();
      const m = 6;
      if (this.mouse.x - r.left < m) right -= 1;
      else if (r.right - this.mouse.x < m) right += 1;
      if (this.mouse.y - r.top < m) fwd += 1;
      else if (r.bottom - this.mouse.y < m) fwd -= 1;
    }
    if (right || fwd) {
      const speed = this.cam.dist * 1.1 * dt;
      this.cam.panScreen(right * speed, fwd * speed);
    }
    if (rot) this.cam.rotateBy(rot * dt * 1.6);
    if (zoom) this.cam.zoomAt(Math.exp(zoom * dt * 2.2));
    if (this.hoverPending) {
      this.hoverPending = false;
      if (!this.down || !this.down.dragging) this.cb.hover(this.mouse.x, this.mouse.y);
    }
  }

  get dragging(): boolean {
    return !!this.down?.dragging;
  }
}
