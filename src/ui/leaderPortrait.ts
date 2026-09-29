/**
 * Procedural leader portraits (2D canvas, no external images).
 *
 *   drawLeaderPortrait(ctx, profile, x, y, w, h, opts?)  — paints a portrait
 *   leaderPortraitURL(profile, w, h, opts?)              — cached PNG data URL
 *
 * Everything is drawn in a 100 x 120 design space that is scaled to cover the
 * target rectangle (cropped, centred horizontally, anchored to the top).
 */
import type { FlagSpec } from '../worldgen/types';
import type { LeaderProfile } from '../sim/leaderProfile';
import { drawFlag } from './flags';

type Ctx2D = CanvasRenderingContext2D;

export interface PortraitDrawOpts {
  /** Flag used by the "National flag" backdrop (a generic banner otherwise). */
  flag?: FlagSpec;
  /** Zoom towards the face (1 = full bust; ~1.8 = head shot for small icons). */
  zoom?: number;
  /** What to centre on when zoomed (default: the eyes). */
  focus?: 'eyes' | 'brows' | 'nose' | 'mouth' | 'chin' | 'head' | 'crown' | 'chest';
}

// ---------------------------------------------------------------------------
// colour helpers
// ---------------------------------------------------------------------------
function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [128, 128, 128];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function rgbHex(r: number, g: number, b: number): string {
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
/** amt > 0 lightens towards white, < 0 darkens towards black. */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexRgb(hex);
  if (amt >= 0) return rgbHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
  const k = 1 + amt;
  return rgbHex(r * k, g * k, b * k);
}
function mix(a: string, b: string, t: number): string {
  const A = hexRgb(a), B = hexRgb(b);
  return rgbHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
function rgba(hex: string, a: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function lum(hex: string): number {
  const [r, g, b] = hexRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GOLD = '#d8a630';
const GOLD_HI = '#ffe08a';
const GOLD_LO = '#8a6414';

function goldGrad(ctx: Ctx2D, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, GOLD_HI);
  g.addColorStop(0.45, GOLD);
  g.addColorStop(1, GOLD_LO);
  return g;
}

// ---------------------------------------------------------------------------
// geometry
// ---------------------------------------------------------------------------
// [forehead, cheek, jaw, chin, height]
const FACE_PARAMS: [number, number, number, number, number][] = [
  [0.9, 1.0, 0.8, 0.36, 1.0], // oval
  [0.95, 1.06, 0.94, 0.52, 0.93], // round
  [0.96, 1.0, 1.0, 0.62, 0.98], // square
  [0.86, 0.9, 0.77, 0.38, 1.1], // long
  [1.0, 0.98, 0.7, 0.26, 1.0], // heart
  [0.78, 1.05, 0.75, 0.32, 1.02], // diamond
  [1.0, 1.1, 1.03, 0.58, 0.96], // broad
];

interface Geo {
  cx: number;
  top: number;
  H: number;
  fw: number;
  fore: number;
  cheek: number;
  jaw: number;
  chin: number;
  eyeY: number;
  browY: number;
  noseY: number;
  mouthY: number;
  chinY: number;
  ex: number;
  neckW: number;
  collarY: number;
  female: boolean;
  outline: [number, number][];
}

function geometry(p: LeaderProfile): Geo {
  const female = p.gender === 'female';
  const [fore, cheek, jaw0, chin0, hm] = FACE_PARAMS[p.face] ?? FACE_PARAMS[0];
  const jaw = female ? jaw0 * 0.93 : jaw0;
  const chin = female ? chin0 * 0.9 : chin0;
  const fw = (16.2 + 3.6 * p.faceWidth) * (female ? 0.94 : 1);
  const H = 50 * hm * (female ? 0.97 : 1);
  const top = 25;
  const cx = 50;
  const eyeY = top + H * 0.5;
  const side: [number, number][] = [
    [fw * 0.6 * fore, top + H * 0.025],
    [fw * fore, top + H * 0.24],
    [fw * cheek, top + H * 0.5],
    [fw * (0.25 * cheek + 0.75 * jaw), top + H * 0.74],
    [fw * chin, top + H * 0.95],
  ];
  const outline: [number, number][] = [[cx, top]];
  for (const [dx, y] of side) outline.push([cx + dx, y]);
  outline.push([cx, top + H]);
  for (let i = side.length - 1; i >= 0; i--) outline.push([cx - side[i][0], side[i][1]]);
  const eyeStyleWide = p.eyes === 4 ? 1.1 : 1;
  return {
    cx, top, H, fw, fore, cheek, jaw, chin, female, outline,
    eyeY,
    browY: eyeY - 5.4,
    noseY: top + H * 0.685,
    mouthY: top + H * 0.82,
    chinY: top + H,
    ex: fw * 0.43 * eyeStyleWide,
    neckW: fw * (female ? 0.47 : 0.6),
    collarY: top + H + 8,
  };
}

/** Closed Catmull-Rom spline through points. */
function smoothClosed(ctx: Ctx2D, pts: [number, number][]): void {
  const n = pts.length;
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    ctx.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
      p2[0], p2[1],
    );
  }
  ctx.closePath();
}

function facePath(ctx: Ctx2D, g: Geo): void {
  ctx.beginPath();
  smoothClosed(ctx, g.outline);
}

function ellipse(ctx: Ctx2D, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2);
}

// ---------------------------------------------------------------------------
// main entry
// ---------------------------------------------------------------------------
export function drawLeaderPortrait(ctx: Ctx2D, profile: LeaderProfile, x: number, y: number, w: number, h: number, opts: PortraitDrawOpts = {}): void {
  const p = profile;
  const g = geometry(p);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const z = Math.max(1, opts.zoom ?? 1);
  const s = Math.max(w / 100, h / 120) * z;
  // keep the face centred when zoomed in (focus point ~ eye level)
  const F = opts.focus;
  const fy = z <= 1 ? 60
    : F === 'brows' ? g.browY + 1.5
    : F === 'nose' ? g.noseY - 1
    : F === 'mouth' ? g.mouthY
    : F === 'chin' ? (g.mouthY + g.chinY) / 2 + 1
    : F === 'head' ? g.top + g.H * 0.45
    : F === 'crown' ? g.top + g.H * 0.3
    : F === 'chest' ? g.collarY + 1
    : g.eyeY + 2;
  const ty = z > 1 ? y + h * 0.48 - fy * s : y + Math.min(0, (h - 120 * s) * 0.35);
  ctx.translate(x + w / 2 - 50 * s, ty);
  ctx.scale(s, s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  drawBackdrop(ctx, p, opts);
  // soft drop shadow of the figure on the backdrop
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.filter = 'blur(3px)';
  ellipse(ctx, g.cx + 3, g.top + g.H * 0.55, g.fw * 1.25, g.H * 0.62);
  ctx.fill();
  ctx.filter = 'none';
  ctx.restore();

  if (p.headwear === 7) keffiyehBack(ctx, g, p);
  hairBack(ctx, g, p);
  drawNeck(ctx, g, p);
  drawAttire(ctx, g, p);
  drawEars(ctx, g, p);
  drawFace(ctx, g, p);
  ageLines(ctx, g, p);
  drawEyes(ctx, g, p);
  drawBrows(ctx, g, p);
  drawNose(ctx, g, p);
  drawMouth(ctx, g, p);
  facialHair(ctx, g, p);
  drawMark(ctx, g, p);
  hairFront(ctx, g, p);
  drawGlasses(ctx, g, p);
  drawHeadwear(ctx, g, p);

  // studio lighting: vignette and a warm key light from the upper left
  const v = ctx.createRadialGradient(46, 52, 22, 50, 60, 90);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, 100, 120);
  const k = ctx.createLinearGradient(0, 0, 100, 120);
  k.addColorStop(0, 'rgba(255,236,200,0.07)');
  k.addColorStop(0.6, 'rgba(255,236,200,0)');
  ctx.fillStyle = k;
  ctx.fillRect(0, 0, 100, 120);
  ctx.restore();
}

const urlCache = new Map<string, string>();

/** Cached PNG data URL of a portrait (for <img> elements). */
export function leaderPortraitURL(profile: LeaderProfile, w: number, h: number, opts: PortraitDrawOpts = {}): string {
  const key = JSON.stringify(profile) + '|' + w + 'x' + h + '|' + (opts.zoom ?? 1) + (opts.focus ?? '') + '|' + (opts.flag ? JSON.stringify(opts.flag) : '');
  let url = urlCache.get(key);
  if (!url) {
    const c = document.createElement('canvas');
    const S = 2;
    c.width = w * S;
    c.height = h * S;
    const ctx = c.getContext('2d');
    if (ctx) drawLeaderPortrait(ctx, profile, 0, 0, w * S, h * S, opts);
    url = c.toDataURL();
    if (urlCache.size > 60) urlCache.clear();
    urlCache.set(key, url);
  }
  return url;
}

// ---------------------------------------------------------------------------
// backdrop
// ---------------------------------------------------------------------------
function genericBanner(color: string): FlagSpec {
  return {
    layout: 'hstripes', colors: [color, shade(color, 0.55), color], ratios: [1, 0.6, 1],
    emblems: [{ shape: 'star', color: '#f0c040', x: 0.26, y: 0.5, size: 0.36 }],
  };
}

function drawBackdrop(ctx: Ctx2D, p: LeaderProfile, opts: PortraitDrawOpts): void {
  const c = p.backdropColor;
  const R = rng(hashStr(c) ^ (p.backdrop * 7919));
  switch (p.backdrop) {
    case 1: { // national flag, draped
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, 100, 120);
      drawFlag(ctx, opts.flag ?? genericBanner(c), -35, -4, 180, 124);
      const f = ctx.createLinearGradient(0, 0, 100, 0);
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        f.addColorStop(t, i % 2 ? 'rgba(0,0,0,0.32)' : 'rgba(255,255,255,0.10)');
      }
      ctx.fillStyle = f;
      ctx.fillRect(0, 0, 100, 120);
      ctx.fillStyle = 'rgba(10,12,14,0.25)';
      ctx.fillRect(0, 0, 100, 120);
      break;
    }
    case 2: { // office: panelled wall, bookshelves, window light
      const wall = ctx.createLinearGradient(0, 0, 0, 120);
      wall.addColorStop(0, shade(c, 0.1));
      wall.addColorStop(1, shade(c, -0.55));
      ctx.fillStyle = wall;
      ctx.fillRect(0, 0, 100, 120);
      // shelves
      for (const sx of [0, 76]) {
        ctx.fillStyle = '#3a2616';
        ctx.fillRect(sx, 0, 24, 120);
        for (let row = 0; row < 6; row++) {
          const y0 = 6 + row * 19;
          let bx = sx + 1.5;
          while (bx < sx + 22.5) {
            const bw = 1.4 + R() * 2.2;
            const bh = 11 + R() * 5;
            ctx.fillStyle = ['#6b1f1f', '#1f3a5a', '#2d4a2a', '#7a5a2a', '#4a2a4a', '#8a7a5a', '#222'][Math.floor(R() * 7)];
            ctx.fillRect(bx, y0 + 16 - bh, Math.min(bw, sx + 22.5 - bx), bh);
            bx += bw + 0.3;
          }
          ctx.fillStyle = '#23160c';
          ctx.fillRect(sx, y0 + 16, 24, 3);
        }
      }
      const win = ctx.createRadialGradient(50, 30, 2, 50, 30, 45);
      win.addColorStop(0, 'rgba(255,240,210,0.35)');
      win.addColorStop(1, 'rgba(255,240,210,0)');
      ctx.fillStyle = win;
      ctx.fillRect(0, 0, 100, 120);
      break;
    }
    case 3: { // parliament: stone columns with drapes
      const bg = ctx.createLinearGradient(0, 0, 0, 120);
      bg.addColorStop(0, '#d9d2c2');
      bg.addColorStop(1, '#7c7568');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 100, 120);
      for (const cx of [8, 34, 66, 92]) {
        const col = ctx.createLinearGradient(cx - 7, 0, cx + 7, 0);
        col.addColorStop(0, '#9b9486');
        col.addColorStop(0.35, '#f4efe4');
        col.addColorStop(1, '#827b6c');
        ctx.fillStyle = col;
        ctx.fillRect(cx - 7, 0, 14, 120);
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth = 0.6;
        for (let k = -2; k <= 2; k++) {
          ctx.beginPath();
          ctx.moveTo(cx + k * 2.6, 0);
          ctx.lineTo(cx + k * 2.6, 120);
          ctx.stroke();
        }
      }
      // drape
      const d = ctx.createLinearGradient(0, 0, 100, 0);
      for (let i = 0; i <= 10; i++) d.addColorStop(i / 10, i % 2 ? shade(c, -0.45) : shade(c, 0.05));
      ctx.fillStyle = d;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(100, 0);
      ctx.lineTo(100, 16);
      for (let i = 10; i >= 0; i--) ctx.quadraticCurveTo(i * 10 + 5, 26, i * 10, 16);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(40,30,20,0.25)';
      ctx.fillRect(0, 0, 100, 120);
      break;
    }
    case 4: { // war room: screens, grid, world map glow
      ctx.fillStyle = '#060d14';
      ctx.fillRect(0, 0, 100, 120);
      const glow = ctx.createRadialGradient(50, 40, 5, 50, 40, 70);
      glow.addColorStop(0, rgba(shade(c, 0.2), 0.55));
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 100, 120);
      ctx.strokeStyle = 'rgba(120,220,255,0.14)';
      ctx.lineWidth = 0.4;
      for (let i = 0; i <= 100; i += 6) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 120); ctx.stroke();
      }
      for (let j = 0; j <= 120; j += 6) {
        ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(100, j); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(110,230,200,0.28)';
      const blobs = [[20, 30, 12, 7], [30, 50, 6, 10], [52, 28, 9, 6], [56, 46, 7, 10], [74, 30, 16, 8], [84, 56, 6, 4]];
      for (const [bx, by, rx, ry] of blobs) { ellipse(ctx, bx, by, rx, ry, 0.3); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,90,60,0.9)';
      for (let i = 0; i < 6; i++) { ellipse(ctx, 8 + R() * 84, 12 + R() * 50, 0.9, 0.9); ctx.fill(); }
      // console screens along the bottom
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = 'rgba(40,200,255,0.18)';
        ctx.fillRect(2 + i * 20, 90, 16, 10);
      }
      break;
    }
    case 5: { // palace: velvet drapes, gold trim
      const bg = ctx.createRadialGradient(50, 45, 5, 50, 50, 80);
      bg.addColorStop(0, shade(c, 0.15));
      bg.addColorStop(1, shade(c, -0.6));
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 100, 120);
      // damask pattern
      ctx.fillStyle = rgba(shade(c, 0.35), 0.12);
      for (let yy = 4; yy < 120; yy += 12) {
        for (let xx = (yy / 12) % 2 ? 6 : 0; xx < 104; xx += 12) {
          ellipse(ctx, xx, yy, 2.4, 3.6); ctx.fill();
        }
      }
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? 0 : 100;
        const dg = ctx.createLinearGradient(x0, 0, x0 - side * 22, 0);
        dg.addColorStop(0, '#3a0a0e');
        dg.addColorStop(0.5, '#8a1a22');
        dg.addColorStop(1, '#4a0c12');
        ctx.fillStyle = dg;
        ctx.beginPath();
        ctx.moveTo(x0, 0);
        ctx.lineTo(x0 - side * 26, 0);
        ctx.bezierCurveTo(x0 - side * 14, 40, x0 - side * 22, 70, x0 - side * 8, 120);
        ctx.lineTo(x0, 120);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x0 - side * 26, 0);
        ctx.bezierCurveTo(x0 - side * 14, 40, x0 - side * 22, 70, x0 - side * 8, 120);
        ctx.stroke();
      }
      ctx.fillStyle = goldGrad(ctx, 0, 0, 0, 5);
      ctx.fillRect(0, 0, 100, 4);
      break;
    }
    case 6: { // sunburst (propaganda poster)
      ctx.fillStyle = shade(c, -0.25);
      ctx.fillRect(0, 0, 100, 120);
      ctx.fillStyle = shade(c, 0.12);
      const n = 22;
      for (let i = 0; i < n; i += 2) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(50, 50);
        ctx.lineTo(50 + Math.cos(a0) * 160, 50 + Math.sin(a0) * 160);
        ctx.lineTo(50 + Math.cos(a1) * 160, 50 + Math.sin(a1) * 160);
        ctx.closePath();
        ctx.fill();
      }
      const sg = ctx.createRadialGradient(50, 48, 4, 50, 48, 60);
      sg.addColorStop(0, 'rgba(255,230,160,0.55)');
      sg.addColorStop(1, 'rgba(255,230,160,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, 100, 120);
      break;
    }
    case 7: { // sanctuary: arch with stained glass
      ctx.fillStyle = '#1c1812';
      ctx.fillRect(0, 0, 100, 120);
      const stone = ctx.createLinearGradient(0, 0, 100, 0);
      stone.addColorStop(0, '#2a241c');
      stone.addColorStop(0.5, '#4a4032');
      stone.addColorStop(1, '#2a241c');
      ctx.fillStyle = stone;
      ctx.fillRect(0, 0, 100, 120);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(18, 120);
      ctx.lineTo(18, 40);
      ctx.bezierCurveTo(18, 10, 50, -2, 50, -2);
      ctx.bezierCurveTo(50, -2, 82, 10, 82, 40);
      ctx.lineTo(82, 120);
      ctx.closePath();
      ctx.clip();
      const cols = [c, shade(c, 0.4), '#d8a630', '#2a5aa0', '#a02a2a', '#2a8a4a'];
      for (let yy = -4; yy < 120; yy += 7) {
        for (let xx = 16; xx < 84; xx += 7) {
          ctx.fillStyle = cols[Math.floor(R() * cols.length)];
          ctx.globalAlpha = 0.55 + R() * 0.3;
          ctx.fillRect(xx, yy, 6.4, 6.4);
        }
      }
      ctx.globalAlpha = 1;
      const lg = ctx.createRadialGradient(50, 30, 5, 50, 40, 60);
      lg.addColorStop(0, 'rgba(255,245,220,0.5)');
      lg.addColorStop(1, 'rgba(0,0,0,0.3)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, 100, 120);
      ctx.restore();
      ctx.strokeStyle = '#6a5a44';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(18, 120);
      ctx.lineTo(18, 40);
      ctx.bezierCurveTo(18, 10, 50, -2, 50, -2);
      ctx.bezierCurveTo(50, -2, 82, 10, 82, 40);
      ctx.lineTo(82, 120);
      ctx.stroke();
      break;
    }
    case 8: { // night city skyline
      const sky = ctx.createLinearGradient(0, 0, 0, 120);
      sky.addColorStop(0, '#05070d');
      sky.addColorStop(0.7, shade(c, -0.35));
      sky.addColorStop(1, shade(c, 0.1));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, 100, 120);
      let bx = -2;
      while (bx < 102) {
        const bw = 5 + R() * 9, bh = 20 + R() * 50;
        ctx.fillStyle = '#0a0d14';
        ctx.fillRect(bx, 120 - bh, bw, bh);
        ctx.fillStyle = 'rgba(255,210,120,0.55)';
        for (let wy = 120 - bh + 3; wy < 118; wy += 3.2) for (let wx = bx + 1; wx < bx + bw - 1; wx += 2.2) if (R() < 0.3) ctx.fillRect(wx, wy, 0.9, 1.3);
        bx += bw + 0.6;
      }
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, 100, 120);
      break;
    }
    default: { // studio
      const bg = ctx.createRadialGradient(50, 42, 4, 50, 55, 85);
      bg.addColorStop(0, shade(c, 0.28));
      bg.addColorStop(0.55, c);
      bg.addColorStop(1, shade(c, -0.7));
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 100, 120);
    }
  }
}

// ---------------------------------------------------------------------------
// skin: neck, ears, face
// ---------------------------------------------------------------------------
function drawNeck(ctx: Ctx2D, g: Geo, p: LeaderProfile): void {
  const { cx, neckW } = g;
  const y0 = g.top + g.H * 0.7;
  const grad = ctx.createLinearGradient(cx - neckW, 0, cx + neckW, 0);
  grad.addColorStop(0, shade(p.skin, -0.3));
  grad.addColorStop(0.5, shade(p.skin, -0.1));
  grad.addColorStop(1, shade(p.skin, -0.32));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(cx - neckW, y0);
  ctx.lineTo(cx - neckW * 1.05, g.collarY + 4);
  ctx.quadraticCurveTo(cx, g.collarY + 12, cx + neckW * 1.05, g.collarY + 4);
  ctx.lineTo(cx + neckW, y0);
  ctx.closePath();
  ctx.fill();
  // jaw shadow
  const sh = ctx.createLinearGradient(0, g.chinY - 3, 0, g.chinY + 7);
  sh.addColorStop(0, 'rgba(40,20,10,0.45)');
  sh.addColorStop(1, 'rgba(40,20,10,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(cx - neckW * 1.1, g.chinY - 3, neckW * 2.2, 10);
  // Adam's apple / neck lines
  if (!g.female) {
    ctx.strokeStyle = rgba(shade(p.skin, -0.45), 0.25);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(cx - 1.2, g.chinY + 5);
    ctx.quadraticCurveTo(cx, g.chinY + 7.5, cx + 1.2, g.chinY + 5);
    ctx.stroke();
  }
  if (p.age > 55) {
    ctx.strokeStyle = rgba(shade(p.skin, -0.45), 0.18 + p.lines * 0.2);
    ctx.lineWidth = 0.5;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + side * 2.5, g.chinY + 2);
      ctx.quadraticCurveTo(cx + side * 4, g.chinY + 6, cx + side * 3.4, g.chinY + 10);
      ctx.stroke();
    }
  }
}

function drawEars(ctx: Ctx2D, g: Geo, p: LeaderProfile): void {
  for (const side of [-1, 1]) {
    const x = g.cx + side * g.fw * g.cheek * 0.96;
    const y = g.eyeY + 3.2;
    ctx.fillStyle = shade(p.skin, -0.12);
    ellipse(ctx, x + side * 1.3, y, 3.1, 6.3, side * 0.12);
    ctx.fill();
    ctx.strokeStyle = rgba(shade(p.skin, -0.5), 0.55);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.ellipse(x + side * 1.5, y - 0.3, 1.7, 4.2, side * 0.12, side < 0 ? Math.PI * 0.6 : -Math.PI * 0.6, side < 0 ? Math.PI * 1.5 : Math.PI * 0.4, side > 0);
    ctx.stroke();
    if (g.female && (p.hair === 0 || p.hair === 1 || p.hair === 9 || p.hair === 14 || p.hair === 3)) {
      ctx.fillStyle = goldGrad(ctx, x, y + 5, x, y + 8);
      ellipse(ctx, x + side * 1.2, y + 6.4, 0.9, 0.9);
      ctx.fill();
    }
  }
}

function drawFace(ctx: Ctx2D, g: Geo, p: LeaderProfile): void {
  const { cx } = g;
  facePath(ctx, g);
  ctx.fillStyle = p.skin;
  ctx.fill();
  ctx.save();
  facePath(ctx, g);
  ctx.clip();
  // form shading
  const r = ctx.createRadialGradient(cx - 2, g.eyeY - 2, g.fw * 0.35, cx, g.eyeY + 2, g.fw * 1.45);
  r.addColorStop(0, 'rgba(255,255,255,0)');
  r.addColorStop(0.7, rgba(shade(p.skin, -0.45), 0.12));
  r.addColorStop(1, rgba(shade(p.skin, -0.55), 0.55));
  ctx.fillStyle = r;
  ctx.fillRect(0, 0, 100, 120);
  // shadow side (light from upper left)
  const sd = ctx.createLinearGradient(cx - g.fw, 0, cx + g.fw, 0);
  sd.addColorStop(0, 'rgba(255,240,220,0.06)');
  sd.addColorStop(0.55, 'rgba(0,0,0,0)');
  sd.addColorStop(1, rgba(shade(p.skin, -0.6), 0.25));
  ctx.fillStyle = sd;
  ctx.fillRect(0, 0, 100, 120);
  // forehead highlight
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ellipse(ctx, cx - 2, g.top + g.H * 0.24, g.fw * 0.55, g.H * 0.1);
  ctx.fill();
  // cheeks
  const blush = g.female ? 0.16 : 0.07;
  for (const side of [-1, 1]) {
    const b = ctx.createRadialGradient(cx + side * g.ex * 1.05, g.noseY - 0.5, 0.5, cx + side * g.ex * 1.05, g.noseY - 0.5, 6);
    b.addColorStop(0, `rgba(210,80,80,${blush})`);
    b.addColorStop(1, 'rgba(210,80,80,0)');
    ctx.fillStyle = b;
    ctx.fillRect(0, 0, 100, 120);
    // cheekbone shadow
    ctx.fillStyle = rgba(shade(p.skin, -0.5), 0.08 + (p.age > 60 ? 0.06 : 0));
    ellipse(ctx, cx + side * g.fw * 0.72, g.noseY + 2.5, 2.5, 5, side * -0.3);
    ctx.fill();
  }
  // eye sockets
  for (const side of [-1, 1]) {
    const e = ctx.createRadialGradient(cx + side * g.ex, g.eyeY - 0.6, 1, cx + side * g.ex, g.eyeY - 0.6, 6.5);
    e.addColorStop(0, rgba(shade(p.skin, -0.5), p.eyes === 5 ? 0.35 : 0.18));
    e.addColorStop(1, rgba(shade(p.skin, -0.5), 0));
    ctx.fillStyle = e;
    ctx.fillRect(0, 0, 100, 120);
  }
  // chin highlight
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ellipse(ctx, cx - 0.5, g.chinY - 3.4, 3.4, 1.8);
  ctx.fill();
  ctx.restore();
  // outline
  facePath(ctx, g);
  ctx.strokeStyle = rgba(shade(p.skin, -0.6), 0.45);
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

function ageLines(ctx: Ctx2D, g: Geo, p: LeaderProfile): void {
  const a = Math.min(1, p.lines * 0.8 + Math.max(0, p.age - 45) / 70);
  if (a < 0.08) return;
  const col = rgba(shade(p.skin, -0.55), 0.12 + a * 0.4);
  const { cx } = g;
  ctx.strokeStyle = col;
  ctx.lineWidth = 0.45;
  ctx.save();
  facePath(ctx, g);
  ctx.clip();
  // forehead
  const nf = a > 0.55 ? 3 : a > 0.3 ? 2 : 1;
  for (let i = 0; i < nf; i++) {
    const y = g.browY - 4.2 - i * 2.4;
    ctx.beginPath();
    ctx.moveTo(cx - g.fw * 0.5, y + 0.8);
    ctx.quadraticCurveTo(cx, y - 1, cx + g.fw * 0.5, y + 0.8);
    ctx.stroke();
  }
  // frown lines
  if (a > 0.35 || p.brows === 6) {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + side * 1.4, g.browY - 1.6);
      ctx.lineTo(cx + side * 1.1, g.browY + 1.4);
      ctx.stroke();
    }
  }
  for (const side of [-1, 1]) {
    // nasolabial folds
    ctx.beginPath();
    ctx.moveTo(cx + side * 4.2, g.noseY - 0.2);
    ctx.quadraticCurveTo(cx + side * 7.6, g.mouthY - 2.5, cx + side * 7, g.mouthY + 2.8);
    ctx.stroke();
    // crow's feet
    const ox = cx + side * (g.ex + 5.2);
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.moveTo(ox, g.eyeY + k * 1.1);
      ctx.lineTo(ox + side * 2.2, g.eyeY + k * 1.9);
      ctx.stroke();
    }
    // under-eye bags
    ctx.beginPath();
    ctx.ellipse(cx + side * g.ex, g.eyeY + 1.8, 3.6, 1.6, 0, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    // jowls
    if (a > 0.55) {
      ctx.beginPath();
      ctx.moveTo(cx + side * 8, g.mouthY + 3);
      ctx.quadraticCurveTo(cx + side * 9.8, g.mouthY + 6, cx + side * 8.2, g.chinY - 2.5);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// features
// ---------------------------------------------------------------------------
// [halfWidth, height, tilt, heavyLid]
const EYE_PARAMS: [number, number, number, number][] = [
  [3.3, 1.9, 0.35, 0.25], // almond
  [3.0, 2.4, 0, 0.15], // round
  [3.5, 1.3, 0.3, 0.35], // narrow
  [3.2, 1.7, -0.2, 0.75], // hooded
  [3.2, 2.0, 0.2, 0.25], // wide-set
  [3.1, 1.8, 0, 0.45], // deep-set
  [3.5, 1.45, 0.55, 0.0], // monolid
];

function drawEyes(ctx: Ctx2D, g: Geo, p: LeaderProfile): void {
  const [w, hh, tilt, heavy] = EYE_PARAMS[p.eyes] ?? EYE_PARAMS[0];
  for (const side of [-1, 1]) {
    if (p.mark === 3 && side === -1) continue; // eyepatch
    ctx.save();
    ctx.translate(g.cx + side * g.ex, g.eyeY);
    ctx.scale(side, 1);
    // local: +x = outer corner
    const eyePath = () => {
      ctx.beginPath();
      ctx.moveTo(-w, 0.2);
      ctx.bezierCurveTo(-w * 0.45, -hh * 1.25, w * 0.4, -hh * 1.3 - tilt * 0.4, w, -tilt);
      ctx.bezierCurveTo(w * 0.45, hh * 0.85, -w * 0.45, hh * 0.9, -w, 0.2);
      ctx.closePath();
    };
    eyePath();
    ctx.fillStyle = '#f1ebe2';
    ctx.fill();
    ctx.save();
    eyePath();
    ctx.clip();
    const ir = Math.min(hh * 0.98, 1.85);
    const irg = ctx.createRadialGradient(0.1, -0.4, 0.2, 0.1, -0.2, ir);
    irg.addColorStop(0, shade(p.eyeColor, 0.35));
    irg.addColorStop(0.7, p.eyeColor);
    irg.addColorStop(1, shade(p.eyeColor, -0.5));
    ctx.fillStyle = irg;
    ellipse(ctx, 0.1, -0.2, ir, ir);
    ctx.fill();
    ctx.fillStyle = '#0b0807';
    ellipse(ctx, 0.1, -0.2, ir * 0.42, ir * 0.42);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ellipse(ctx, -0.5 * side, -0.9, 0.42, 0.42);
    ctx.fill();
    // lid shadow on the eyeball
    const ls = ctx.createLinearGradient(0, -hh * 1.3, 0, 0.5);
    ls.addColorStop(0, 'rgba(60,30,20,0.55)');
    ls.addColorStop(1, 'rgba(60,30,20,0)');
    ctx.fillStyle = ls;
    ctx.fillRect(-w - 1, -hh * 1.6, w * 2 + 2, hh * 1.8);
    ctx.restore();
    // upper lid line
    ctx.strokeStyle = '#2a1812';
    ctx.lineWidth = g.female ? 0.85 : 0.6;
    ctx.beginPath();
    ctx.moveTo(-w, 0.2);
    ctx.bezierCurveTo(-w * 0.45, -hh * 1.25, w * 0.4, -hh * 1.3 - tilt * 0.4, w, -tilt);
    ctx.stroke();
    if (g.female) {
      ctx.lineWidth = 0.5;
      for (let k = 0; k < 3; k++) {
        const t = 0.55 + k * 0.2;
        const lx = w * t, ly = -tilt * t - hh * (1 - t) * 0.9;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + 0.9, ly - 0.9);
        ctx.stroke();
      }
    }
    // lower lid
    ctx.strokeStyle = rgba(shade(p.skin, -0.55), 0.5);
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    ctx.moveTo(-w * 0.8, 0.8);
    ctx.bezierCurveTo(-w * 0.3, hh * 0.95, w * 0.4, hh * 0.9, w * 0.95, -tilt + 0.2);
    ctx.stroke();
    // crease / heavy lid
    if (heavy > 0.6) {
      ctx.fillStyle = shade(p.skin, -0.08);
      ctx.beginPath();
      ctx.moveTo(-w - 0.2, -0.3);
      ctx.bezierCurveTo(-w * 0.4, -hh * 1.6, w * 0.5, -hh * 1.7, w + 0.6, -tilt - 0.1);
      ctx.bezierCurveTo(w * 0.5, -hh * 0.95, -w * 0.4, -hh * 0.95, -w - 0.2, -0.3);
      ctx.fill();
      ctx.strokeStyle = rgba(shade(p.skin, -0.55), 0.6);
      ctx.lineWidth = 0.45;
      ctx.beginPath();
      ctx.moveTo(-w * 0.9, -0.4);
      ctx.bezierCurveTo(-w * 0.4, -hh * 1.05, w * 0.5, -hh * 1.05, w + 0.4, -tilt - 0.1);
      ctx.stroke();
    } else if (heavy > 0.05) {
      ctx.strokeStyle = rgba(shade(p.skin, -0.5), 0.4);
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(-w * 0.7, -hh * 1.0);
      ctx.bezierCurveTo(-w * 0.3, -hh * 1.9, w * 0.4, -hh * 1.9, w * 0.95, -tilt - hh * 0.6);
      ctx.stroke();
    }
    if (g.female) {
      // subtle eye shadow
      const es = ctx.createRadialGradient(0.5, -hh * 1.4, 0.3, 0.5, -hh * 1.4, 3.6);
      es.addColorStop(0, 'rgba(90,50,60,0.25)');
      es.addColorStop(1, 'rgba(90,50,60,0)');
      ctx.fillStyle = es;
      ctx.fillRect(-w - 1, -hh * 3, w * 2 + 2, hh * 2.2);
    }
    ctx.restore();
  }
}

// [thickness, arch, innerDrop, length]
const BROW_PARAMS: [number, number, number, number][] = [
  [1.25, 1.1, 0, 1], // natural
  [1.9, 0.9, 0, 1.05], // thick
  [1.0, 2.2, 0, 1], // arched
  [1.35, 0.15, 0, 1], // straight
  [2.3, 1.0, 0, 1.1], // bushy
  [0.7, 1.5, 0, 0.95], // thin
  [1.6, 0.5, 1.3, 1], // furrowed
];

function drawBrows(ctx: Ctx2D, g: Geo, p: LeaderProfile): void {
  let [th, arch, drop, len] = BROW_PARAMS[p.brows] ?? BROW_PARAMS[0];
  if (g.female) th *= 0.8;
  const hc = p.hairColor;
  const col = lum(hc) > 0.6 ? shade(hc, -0.35) : shade(hc, -0.1);
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(g.cx + side * g.ex, g.browY);
    ctx.scale(side, 1);
    const x0 = -3.3, x1 = 4.4 * len;
    ctx.beginPath();
    ctx.moveTo(x0, drop);
    ctx.bezierCurveTo(x0 + 2, -arch - th * 0.6 + drop * 0.4, x1 - 3, -arch - th * 0.5, x1, 0.6);
    ctx.bezierCurveTo(x1 - 3, -arch + th * 0.35, x0 + 2, -arch * 0.5 + th + drop * 0.4, x0, drop + th);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    if (p.brows === 4) {
      ctx.strokeStyle = col;
      ctx.lineWidth = 0.35;
      const R = rng(7 + side);
      for (let i = 0; i < 12; i++) {
        const t = R();
        const bx = x0 + (x1 - x0) * t;
        const by = -arch * Math.sin(Math.PI * t) + drop * (1 - t);
        ctx.beginPath();
        ctx.moveTo(bx, by + th * 0.5);
        ctx.lineTo(bx + 1.2, by - th * 0.6 - R());
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

// [nostrilHalfWidth, lengthMul, tipR, bridge]
const NOSE_PARAMS: [number, number, number, number][] = [
  [2.9, 1.0, 1.4, 0], // straight
  [3.8, 0.95, 1.9, 0], // broad
  [2.8, 1.08, 1.3, 1], // aquiline
  [2.7, 0.85, 1.6, -0.5], // button
  [2.9, 1.18, 1.4, 0.3], // long
  [3.1, 1.05, 1.5, 1.4], // roman
];

function drawNose(ctx: Ctx2D, g: Geo, p: LeaderProfile): void {
  const [nw0, lm, tr, bridge] = NOSE_PARAMS[p.nose] ?? NOSE_PARAMS[0];
  const nw = g.female ? nw0 * 0.88 : nw0;
  const { cx } = g;
  const ny = g.eyeY + (g.noseY - g.eyeY) * lm;
  const dark = rgba(shade(p.skin, -0.6), 0.55);
  // bridge shading (shadow side)
  ctx.strokeStyle = rgba(shade(p.skin, -0.55), 0.28);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx + 1.6, g.eyeY + 0.5);
  ctx.bezierCurveTo(cx + 1.8 + bridge * 0.6, g.eyeY + (ny - g.eyeY) * 0.45, cx + 2.2, ny - 3, cx + nw * 0.72, ny - 1.2);
  ctx.stroke();
  ctx.strokeStyle = rgba(shade(p.skin, -0.55), 0.14);
  ctx.beginPath();
  ctx.moveTo(cx - 1.6, g.eyeY + 1.5);
  ctx.quadraticCurveTo(cx - 1.9, ny - 3.5, cx - nw * 0.7, ny - 1.4);
  ctx.stroke();
  if (bridge > 0.5) {
    ctx.strokeStyle = rgba(shade(p.skin, -0.5), 0.25);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(cx + 1.2, g.eyeY + (ny - g.eyeY) * 0.35);
    ctx.quadraticCurveTo(cx + 2.4, g.eyeY + (ny - g.eyeY) * 0.45, cx + 1.4, g.eyeY + (ny - g.eyeY) * 0.6);
    ctx.stroke();
  }
  // highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(cx - 0.3, g.eyeY + 2);
  ctx.lineTo(cx - 0.2, ny - 2);
  ctx.stroke();
  // under-nose shadow
  const us = ctx.createRadialGradient(cx + 0.5, ny + 1.2, 0.3, cx + 0.5, ny + 1.2, nw * 1.4);
  us.addColorStop(0, rgba(shade(p.skin, -0.6), 0.35));
  us.addColorStop(1, rgba(shade(p.skin, -0.6), 0));
  ctx.fillStyle = us;
  ctx.fillRect(cx - 8, ny - 3, 16, 8);
  // tip
  ctx.fillStyle = rgba(shade(p.skin, 0.12), 0.8);
  ellipse(ctx, cx - 0.2, ny - 0.9, tr, tr * 0.85);
  ctx.fill();
  // wings and nostrils
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.55;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + side * (nw * 0.55), ny - 2.3);
    ctx.bezierCurveTo(cx + side * (nw + 0.5), ny - 1.8, cx + side * (nw + 0.3), ny + 0.6, cx + side * nw * 0.55, ny + 0.5);
    ctx.stroke();
    ctx.fillStyle = rgba('#2a1510', 0.65);
    ellipse(ctx, cx + side * nw * 0.45, ny + 0.15, 0.85, 0.45, side * 0.3);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(cx - nw * 0.4, ny + 0.6);
  ctx.quadraticCurveTo(cx, ny + 1.3, cx + nw * 0.4, ny + 0.6);
  ctx.strokeStyle = rgba(shade(p.skin, -0.55), 0.35);
  ctx.stroke();
}

function drawMouth(ctx: Ctx2D, g: Geo, p: LeaderProfile): void {
  const { cx } = g;
  const y = g.mouthY;
  const st = p.mouth;
  const mw = (g.female ? 5.4 : 5.8) * (st === 3 ? 1.08 : 1);
  let upH = g.female ? 1.35 : 1.0;
  let loH = g.female ? 2.0 : 1.5;
  if (st === 4) { upH *= 0.55; loH *= 0.5; }
  if (st === 5) { upH *= 1.35; loH *= 1.4; }
  let cl = 0, cr = 0; // corner offsets (negative = up)
  if (st === 1) { cl = cr = -1.1; }
  if (st === 2) { cl = cr = 0.9; }
  if (st === 3) { cl = cr = -1.5; }
  if (st === 6) { cl = 0.3; cr = -1.4; }
  const lip = mix(shade(p.skin, -0.18), '#b4505a', g.female ? 0.55 : 0.22);
  const L: [number, number] = [cx - mw, y + cl];
  const Rr: [number, number] = [cx + mw, y + cr];
  const midY = y + (st === 1 || st === 3 ? 0.6 : 0);
  // upper lip
  ctx.beginPath();
  ctx.moveTo(L[0], L[1]);
  ctx.bezierCurveTo(cx - mw * 0.55, y - upH * 0.9 + (cl * 0.4), cx - 1.4, y - upH - 0.3, cx, y - upH + 0.35);
  ctx.bezierCurveTo(cx + 1.4, y - upH - 0.3, cx + mw * 0.55, y - upH * 0.9 + (cr * 0.4), Rr[0], Rr[1]);
  ctx.quadraticCurveTo(cx, midY + 0.4, L[0], L[1]);
  ctx.fillStyle = shade(lip, -0.15);
  ctx.fill();
  // lower lip
  ctx.beginPath();
  ctx.moveTo(L[0], L[1]);
  ctx.quadraticCurveTo(cx, midY + 0.4, Rr[0], Rr[1]);
  ctx.bezierCurveTo(cx + mw * 0.5, y + loH * 1.2 + cr * 0.3, cx - mw * 0.5, y + loH * 1.2 + cl * 0.3, L[0], L[1]);
  const lg = ctx.createLinearGradient(0, y, 0, y + loH * 1.2);
  lg.addColorStop(0, lip);
  lg.addColorStop(1, shade(lip, -0.12));
  ctx.fillStyle = lg;
  ctx.fill();
  // lower lip highlight
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ellipse(ctx, cx - 0.6, y + loH * 0.55, mw * 0.35, loH * 0.25);
  ctx.fill();
  if (st === 3) {
    // teeth
    ctx.beginPath();
    ctx.moveTo(L[0] + 0.8, L[1] + 0.1);
    ctx.quadraticCurveTo(cx, y - 0.4, Rr[0] - 0.8, Rr[1] + 0.1);
    ctx.quadraticCurveTo(cx, y + 2.1, L[0] + 0.8, L[1] + 0.1);
    ctx.fillStyle = '#f2eee4';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,100,90,0.35)';
    ctx.lineWidth = 0.2;
    for (let k = -3; k <= 3; k++) {
      ctx.beginPath();
      ctx.moveTo(cx + k * 1.3, y - 0.2);
      ctx.lineTo(cx + k * 1.3, y + 1.3);
      ctx.stroke();
    }
  }
  // parting line
  ctx.strokeStyle = rgba(shade(lip, -0.6), 0.85);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(L[0], L[1]);
  ctx.quadraticCurveTo(cx, midY + (st === 3 ? 1.8 : 0.4), Rr[0], Rr[1]);
  ctx.stroke();
  // corners
  ctx.strokeStyle = rgba(shade(p.skin, -0.55), 0.35);
  ctx.lineWidth = 0.4;
  for (const [pt, s] of [[L, -1], [Rr, 1]] as [[number, number], number][]) {
    ctx.beginPath();
    ctx.moveTo(pt[0], pt[1]);
    ctx.lineTo(pt[0] + s * 0.8, pt[1] + (st === 2 ? 0.8 : -0.3));
    ctx.stroke();
  }
  // philtrum
  ctx.strokeStyle = rgba(shade(p.skin, -0.45), 0.2);
  ctx.lineWidth = 0.4;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.9, y - upH - 0.1);
    ctx.lineTo(cx + s * 0.7, g.noseY + 1.6);
    ctx.stroke();
  }
  // chin crease
  ctx.strokeStyle = rgba(shade(p.skin, -0.5), 0.2);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(cx - 2.2, y + loH + 2.3);
  ctx.quadraticCurveTo(cx, y + loH + 1.4, cx + 2.2, y + loH + 2.3);
  ctx.stroke();
}

function beardColor(p: LeaderProfile): string {
  return p.hairColor;
}

function hairTexture(ctx: Ctx2D, color: string, x0: number, y0: number, x1: number, y1: number, seed: number, density = 1, angle = 1.2): void {
  const R = rng(seed);
  const n = Math.floor((x1 - x0) * (y1 - y0) * 0.35 * density);
  ctx.lineWidth = 0.3;
  for (let i = 0; i < n; i++) {
    const x = x0 + R() * (x1 - x0), y = y0 + R() * (y1 - y0);
    ctx.strokeStyle = R() < 0.5 ? rgba(shade(color, 0.3), 0.35) : rgba(shade(color, -0.4), 0.4);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * 1.4, y + Math.sin(angle) * 1.4);
    ctx.stroke();
  }
}

function facialHair(ctx: Ctx2D, g: Geo, p: LeaderProfile): void {
  const st = p.facialHair;
  if (!st) return;
  const col = beardColor(p);
  const { cx } = g;
  const y = g.mouthY;
  const ny = g.noseY;
  const beardRegion = (len: number, cheekTop: number, widthMul = 1) => {
    const cw = g.fw * g.cheek * 0.98 * widthMul;
    const jw = g.fw * g.jaw * 1.02 * widthMul;
    ctx.beginPath();
    ctx.moveTo(cx - cw, g.eyeY + cheekTop);
    ctx.quadraticCurveTo(cx - jw - 0.5, g.top + g.H * 0.82, cx - g.fw * g.chin * 1.25, g.chinY + len * 0.55);
    ctx.quadraticCurveTo(cx, g.chinY + len * 1.25, cx + g.fw * g.chin * 1.25, g.chinY + len * 0.55);
    ctx.quadraticCurveTo(cx + jw + 0.5, g.top + g.H * 0.82, cx + cw, g.eyeY + cheekTop);
    ctx.lineTo(cx + cw - 1.5, g.eyeY + cheekTop + 1);
    ctx.quadraticCurveTo(cx + g.fw * 0.5, ny + 1, cx + 5.5, ny + 1.6);
    ctx.quadraticCurveTo(cx, ny + 1.2, cx - 5.5, ny + 1.6);
    ctx.quadraticCurveTo(cx - g.fw * 0.5, ny + 1, cx - cw + 1.5, g.eyeY + cheekTop + 1);
    ctx.closePath();
    // mouth hole
    ctx.moveTo(cx + 5.2, y);
    ctx.ellipse(cx, y + 0.5, 5.2, 2.3, 0, 0, Math.PI * 2, true);
  };
  const moustache = (thick: number, droop: number, width = 7.2) => {
    ctx.beginPath();
    ctx.moveTo(cx - width, y + droop);
    ctx.quadraticCurveTo(cx - width * 0.6, ny + 1.2, cx, ny + 1.9);
    ctx.quadraticCurveTo(cx + width * 0.6, ny + 1.2, cx + width, y + droop);
    ctx.quadraticCurveTo(cx + width * 0.5, y - 1.6 + thick * 0.2, cx, y - 1.2);
    ctx.quadraticCurveTo(cx - width * 0.5, y - 1.6 + thick * 0.2, cx - width, y + droop);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.save();
    ctx.clip();
    hairTexture(ctx, col, cx - width, ny, cx + width, y + 1, 99, 1.4, 1.9);
    ctx.restore();
  };
  ctx.save();
  switch (st) {
    case 1: { // stubble
      beardRegion(0.6, 5);
      ctx.save();
      ctx.clip('evenodd');
      ctx.fillStyle = rgba(col, lum(col) > 0.5 ? 0.18 : 0.26);
      ctx.fillRect(0, 0, 100, 120);
      const R = rng(5);
      ctx.fillStyle = rgba(shade(col, -0.2), 0.35);
      for (let i = 0; i < 380; i++) ctx.fillRect(cx - 20 + R() * 40, g.eyeY + 4 + R() * 30, 0.35, 0.35);
      ctx.restore();
      break;
    }
    case 2: moustache(1.4, 0.4); break;
    case 3: case 6: case 10: { // full / long / boxed beard
      const len = st === 6 ? 15 : st === 3 ? 4.5 : 1.8;
      beardRegion(len, st === 10 ? 5.5 : 4.2, st === 10 ? 0.98 : 1.04);
      ctx.fillStyle = col;
      ctx.fill('evenodd');
      ctx.save();
      beardRegion(len, 4.2, 1.04);
      ctx.clip('evenodd');
      const sg = ctx.createLinearGradient(0, g.eyeY, 0, g.chinY + len);
      sg.addColorStop(0, rgba(shade(col, 0.25), 0.2));
      sg.addColorStop(1, rgba(shade(col, -0.45), 0.5));
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, 100, 120);
      hairTexture(ctx, col, cx - 22, g.eyeY + 3, cx + 22, g.chinY + len + 2, 17, 1.2, 1.45);
      ctx.restore();
      moustache(1.2, 1.2, 7.4);
      break;
    }
    case 4: { // goatee
      ctx.beginPath();
      ctx.moveTo(cx - 4.8, y + 0.4);
      ctx.quadraticCurveTo(cx - 5.5, g.chinY - 1, cx - 2.8, g.chinY + 1.8);
      ctx.quadraticCurveTo(cx, g.chinY + 3.2, cx + 2.8, g.chinY + 1.8);
      ctx.quadraticCurveTo(cx + 5.5, g.chinY - 1, cx + 4.8, y + 0.4);
      ctx.quadraticCurveTo(cx, y + 2.5, cx - 4.8, y + 0.4);
      ctx.fillStyle = col;
      ctx.fill();
      moustache(1.1, 1.8, 6);
      break;
    }
    case 5: { // chevron + soul patch
      moustache(1.6, 0.6, 6.4);
      ctx.fillStyle = col;
      ellipse(ctx, cx, y + 3.8, 1.4, 1.7);
      ctx.fill();
      break;
    }
    case 7: { // handlebar
      moustache(1.2, -0.2, 6.2);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.1;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + s * 6, y - 0.1);
        ctx.bezierCurveTo(cx + s * 9, y + 0.4, cx + s * 10.5, y - 1.5, cx + s * 9.6, y - 3.2);
        ctx.stroke();
      }
      break;
    }
    case 8: { // mutton chops
      for (const s of [-1, 1]) {
        ctx.beginPath();
        const ox = cx + s * g.fw * g.cheek * 0.97;
        ctx.moveTo(ox, g.eyeY + 1);
        ctx.quadraticCurveTo(cx + s * g.fw * g.jaw * 1.02, g.mouthY + 2, cx + s * 7.5, y + 1.2);
        ctx.lineTo(cx + s * 7.2, ny + 1.2);
        ctx.quadraticCurveTo(cx + s * g.fw * 0.7, g.eyeY + 4, ox - s * 3, g.eyeY + 1);
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();
      }
      moustache(1.4, 1.2, 7.5);
      break;
    }
    case 9: { // pencil moustache
      ctx.strokeStyle = col;
      ctx.lineWidth = 0.7;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + s * 0.8, y - 1.6);
        ctx.quadraticCurveTo(cx + s * 3.5, y - 2.4, cx + s * 5.6, y - 1.1);
        ctx.stroke();
      }
      break;
    }
  }
  ctx.restore();
}

function drawMark(ctx: Ctx2D, g: Geo, p: LeaderProfile): void {
  const { cx } = g;
  switch (p.mark) {
    case 1: { // brow scar
      ctx.strokeStyle = rgba(shade(p.skin, 0.35), 0.9);
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(cx + g.ex - 1, g.browY - 3.5);
      ctx.lineTo(cx + g.ex + 1.8, g.eyeY - 1.8);
      ctx.stroke();
      ctx.strokeStyle = rgba(shade(p.skin, -0.4), 0.35);
      ctx.lineWidth = 0.3;
      ctx.stroke();
      break;
    }
    case 2: { // mole
      ctx.fillStyle = rgba('#3a2216', 0.85);
      ellipse(ctx, cx - g.ex + 1, g.noseY + 3.2, 0.7, 0.7);
      ctx.fill();
      break;
    }
    case 3: { // eyepatch
      const ex = cx - g.ex;
      ctx.strokeStyle = '#141414';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(ex - 5, g.eyeY - 7.5);
      ctx.lineTo(cx + g.fw * 1.02, g.browY - 6);
      ctx.moveTo(ex - 4, g.eyeY + 2);
      ctx.lineTo(cx - g.fw * g.cheek * 1.0, g.eyeY + 1.5);
      ctx.stroke();
      const pg = ctx.createRadialGradient(ex - 0.8, g.eyeY - 1.4, 0.3, ex, g.eyeY, 4.8);
      pg.addColorStop(0, '#3a3a3a');
      pg.addColorStop(1, '#0c0c0c');
      ctx.fillStyle = pg;
      ellipse(ctx, ex, g.eyeY - 0.4, 4.3, 3.6, -0.1);
      ctx.fill();
      break;
    }
    case 4: { // duelling scar on cheek
      ctx.strokeStyle = rgba(shade(p.skin, 0.3), 0.85);
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(cx - g.ex - 3.6, g.eyeY + 4);
      ctx.lineTo(cx - g.ex + 1, g.noseY + 4);
      ctx.moveTo(cx - g.ex - 2.4, g.eyeY + 6);
      ctx.lineTo(cx - g.ex - 0.2, g.eyeY + 5.2);
      ctx.stroke();
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// hair
// ---------------------------------------------------------------------------
function hairFill(ctx: Ctx2D, g: Geo, col: string): CanvasGradient {
  const gr = ctx.createLinearGradient(g.cx - g.fw, g.top - 8, g.cx + g.fw, g.top + g.H * 0.6);
  gr.addColorStop(0, shade(col, 0.22));
  gr.addColorStop(0.45, col);
  gr.addColorStop(1, shade(col, -0.35));
  return gr;
}

/** Generic cap of hair: sides down to `sideY`, crown `vol` above the skull, hairline at `hl`. */
function capPath(ctx: Ctx2D, g: Geo, vol: number, sideY: number, hl: number, widen = 1.04, templeIn = 0.8): void {
  const { cx, fw, top } = g;
  const W = fw * g.fore * widen + 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - W, sideY);
  ctx.bezierCurveTo(cx - W - 0.8, top + g.H * 0.15, cx - W * 0.7, top - vol, cx, top - vol);
  ctx.bezierCurveTo(cx + W * 0.7, top - vol, cx + W + 0.8, top + g.H * 0.15, cx + W, sideY);
  ctx.lineTo(cx + fw * templeIn, sideY);
  ctx.quadraticCurveTo(cx + fw * templeIn, hl + 2, cx + fw * 0.5, hl + 0.8);
  ctx.quadraticCurveTo(cx, hl - 1.2, cx - fw * 0.5, hl + 0.8);
  ctx.quadraticCurveTo(cx - fw * templeIn, hl + 2, cx - fw * templeIn, sideY);
  ctx.closePath();
}

function hairBack(ctx: Ctx2D, g: Geo, p: LeaderProfile): void {
  const col = p.hairColor;
  const { cx, fw, top } = g;
  const hat = p.headwear === 7;
  if (hat) return;
  ctx.fillStyle = hairFill(ctx, g, shade(col, -0.15));
  switch (p.hair) {
    case 7: case 10: { // long hair
      const wavy = p.hair === 10;
      const W = fw * 1.18 + (wavy ? 2 : 0);
      ctx.beginPath();
      ctx.moveTo(cx - W * 0.8, top + 2);
      ctx.bezierCurveTo(cx - W * 1.05, top + 20, cx - W * 1.1, top + 50, cx - W * 1.12 - (wavy ? 2 : 0), 104);
      if (wavy) {
        for (let i = 0; i <= 6; i++) ctx.quadraticCurveTo(cx - W + i * (W / 3) - 1, 108 + (i % 2) * 3, cx - W + (i + 0.5) * (W / 3), 104);
      } else ctx.lineTo(cx + W * 1.12, 104);
      ctx.bezierCurveTo(cx + W * 1.1, top + 50, cx + W * 1.05, top + 20, cx + W * 0.8, top + 2);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 8: { // bob
      const W = fw * 1.22;
      ctx.beginPath();
      ctx.moveTo(cx - W * 0.8, top);
      ctx.bezierCurveTo(cx - W * 1.12, top + 14, cx - W * 1.08, g.mouthY, cx - W * 0.95, g.chinY + 1);
      ctx.quadraticCurveTo(cx, g.chinY + 4, cx + W * 0.95, g.chinY + 1);
      ctx.bezierCurveTo(cx + W * 1.08, g.mouthY, cx + W * 1.12, top + 14, cx + W * 0.8, top);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 9: { // bun on top
      ctx.fillStyle = hairFill(ctx, g, col);
      ellipse(ctx, cx, top - 5.5, 6, 4.8);
      ctx.fill();
      ctx.strokeStyle = rgba(shade(col, -0.5), 0.6);
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.ellipse(cx, top - 5.5, 4, 3, 0, 0.3, 2.8);
      ctx.stroke();
      break;
    }
    case 13: { // afro
      ctx.fillStyle = hairFill(ctx, g, col);
      const R = rng(13);
      ctx.beginPath();
      const rcx = cx, rcy = top + g.H * 0.28, rr = fw * 1.55;
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        const r = rr + (R() - 0.5) * 1.6;
        const px = rcx + Math.cos(a) * r, py = rcy + Math.sin(a) * r * 0.95;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.clip();
      hairTexture(ctx, col, rcx - rr, rcy - rr, rcx + rr, rcy + rr, 131, 1.6, 0.4);
      ctx.restore();
      break;
    }
    case 5: { // curly volume behind
      ctx.fillStyle = hairFill(ctx, g, shade(col, -0.1));
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (1.05 + (i / 8) * 0.9);
        ellipse(ctx, cx + Math.cos(a) * fw * 1.1, top + g.H * 0.3 + Math.sin(a) * g.H * 0.42, 4.2, 4.2);
        ctx.fill();
      }
      break;
    }
  }
}

function hairFront(ctx: Ctx2D, g: Geo, p: LeaderProfile): void {
  const col = p.hairColor;
  const { cx, fw, top, H } = g;
  const hat = p.headwear;
  if (hat === 7) return; // keffiyeh covers the hair
  const fill = hairFill(ctx, g, col);
  const sideY = g.eyeY - 1.5;
  const textured = (seed: number, dens = 1, ang = 1.2) => {
    ctx.save();
    ctx.clip();
    hairTexture(ctx, col, cx - fw * 1.3, top - 10, cx + fw * 1.3, g.eyeY + 2, seed, dens, ang);
    ctx.restore();
  };
  // sideburns for most short styles
  const sideburns = (len = 4) => {
    ctx.fillStyle = shade(col, -0.1);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      const ox = cx + s * fw * g.fore * 1.03;
      ctx.moveTo(ox, sideY - 2);
      ctx.lineTo(ox - s * 2.2, sideY - 2);
      ctx.lineTo(ox - s * 1.8, g.eyeY + len);
      ctx.lineTo(ox + s * 0.1, g.eyeY + len);
      ctx.closePath();
      ctx.fill();
    }
  };
  switch (p.hair) {
    case 0: { // bald: scalp sheen
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ellipse(ctx, cx - 3, top + 4, fw * 0.45, 2.5, -0.1);
      ctx.fill();
      if (p.age > 50) {
        // grey fringe at the back / sides
        ctx.fillStyle = rgba(col, 0.55);
        for (const s of [-1, 1]) {
          ctx.beginPath();
          const ox = cx + s * fw * g.fore * 1.03;
          ctx.moveTo(ox, g.eyeY - 7);
          ctx.quadraticCurveTo(ox + s * 1.2, g.eyeY - 3, ox, g.eyeY + 2);
          ctx.lineTo(ox - s * 1.6, g.eyeY + 1);
          ctx.quadraticCurveTo(ox - s * 1, g.eyeY - 4, ox - s * 0.8, g.eyeY - 7);
          ctx.closePath();
          ctx.fill();
        }
      }
      break;
    }
    case 1: { // buzz
      capPath(ctx, g, 0.8, sideY, top + H * 0.17, 1.02);
      ctx.fillStyle = rgba(col, 0.72);
      ctx.fill();
      capPath(ctx, g, 0.8, sideY, top + H * 0.17, 1.02);
      ctx.save();
      ctx.clip();
      const R = rng(3);
      ctx.fillStyle = rgba(shade(col, -0.3), 0.5);
      for (let i = 0; i < 500; i++) ctx.fillRect(cx - fw * 1.1 + R() * fw * 2.2, top - 2 + R() * (sideY - top), 0.35, 0.35);
      ctx.restore();
      break;
    }
    case 2: { // side part
      sideburns(2);
      capPath(ctx, g, 4.2, sideY, top + H * 0.2);
      ctx.fillStyle = fill;
      ctx.fill();
      capPath(ctx, g, 4.2, sideY, top + H * 0.2);
      textured(21, 1, 0.15);
      // swoop
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(cx - fw * 0.42, top - 3.4);
      ctx.bezierCurveTo(cx + fw * 0.2, top - 3, cx + fw * 0.9, top + 2, cx + fw * 0.95, top + H * 0.22);
      ctx.quadraticCurveTo(cx + fw * 0.4, top + H * 0.16, cx - fw * 0.42, top + H * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba(shade(col, -0.55), 0.8);
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.moveTo(cx - fw * 0.42, top - 3.2);
      ctx.lineTo(cx - fw * 0.45, top + H * 0.14);
      ctx.stroke();
      break;
    }
    case 3: { // slicked back
      sideburns(2);
      capPath(ctx, g, 3, sideY, top + H * 0.16, 1.03, 0.82);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.save();
      capPath(ctx, g, 3, sideY, top + H * 0.16, 1.03, 0.82);
      ctx.clip();
      ctx.strokeStyle = rgba(shade(col, 0.45), 0.35);
      ctx.lineWidth = 0.4;
      for (let i = -5; i <= 5; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * 2.8, top + H * 0.18);
        ctx.quadraticCurveTo(cx + i * 3.4, top - 1, cx + i * 3.8, top - 5);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 4: { // pompadour
      sideburns(3);
      capPath(ctx, g, 4, sideY, top + H * 0.2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - fw * 0.85, top + H * 0.14);
      ctx.bezierCurveTo(cx - fw * 0.9, top - 9, cx + fw * 0.5, top - 12, cx + fw * 0.9, top - 3);
      ctx.quadraticCurveTo(cx + fw * 0.9, top + H * 0.12, cx + fw * 0.6, top + H * 0.18);
      ctx.quadraticCurveTo(cx, top + H * 0.08, cx - fw * 0.85, top + H * 0.14);
      ctx.closePath();
      ctx.fillStyle = hairFill(ctx, g, shade(col, 0.05));
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = rgba(shade(col, 0.4), 0.35);
      ctx.lineWidth = 0.45;
      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - fw * 0.8 + i * 3, top + H * 0.15);
        ctx.bezierCurveTo(cx - fw * 0.7 + i * 3, top - 6, cx + i * 2, top - 10, cx + fw * 0.8, top - 3 + i * 0.4);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 5: { // curly
      capPath(ctx, g, 5, sideY + 1, top + H * 0.2, 1.08);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.fillStyle = hairFill(ctx, g, col);
      const R = rng(55);
      for (let i = 0; i < 26; i++) {
        const a = Math.PI * (1.02 + R() * 0.96);
        const rr = 0.85 + R() * 0.25;
        const px = cx + Math.cos(a) * fw * 1.02 * rr, py = top + H * 0.26 + Math.sin(a) * H * 0.33 * rr;
        ellipse(ctx, px, py, 2.5, 2.5);
        ctx.fill();
      }
      ctx.strokeStyle = rgba(shade(col, -0.5), 0.5);
      ctx.lineWidth = 0.35;
      for (let i = 0; i < 30; i++) {
        const a = Math.PI * (1.02 + R() * 0.96);
        const px = cx + Math.cos(a) * fw * 0.95 * (0.7 + R() * 0.35), py = top + H * 0.26 + Math.sin(a) * H * 0.3 * (0.7 + R() * 0.35);
        ctx.beginPath();
        ctx.arc(px, py, 1.2, 0, Math.PI * 1.3);
        ctx.stroke();
      }
      break;
    }
    case 6: { // receding
      ctx.fillStyle = rgba(col, 0.35);
      ellipse(ctx, cx, top + 1, fw * 0.55, 3);
      ctx.fill();
      for (const s of [-1, 1]) {
        ctx.beginPath();
        const ox = cx + s * fw * g.fore * 1.05;
        ctx.moveTo(ox, sideY + 1);
        ctx.bezierCurveTo(ox + s * 0.8, top + H * 0.2, ox - s * 1, top + 2, cx + s * fw * 0.45, top + 0.6);
        ctx.quadraticCurveTo(cx + s * fw * 0.55, top + H * 0.14, cx + s * fw * 0.8, top + H * 0.28);
        ctx.lineTo(cx + s * fw * 0.82, sideY + 1);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ellipse(ctx, cx - 2, top + 4.5, fw * 0.35, 2);
      ctx.fill();
      break;
    }
    case 7: case 10: { // long straight / wavy — centre part
      capPath(ctx, g, 3.2, g.eyeY + 6, top + H * 0.2, 1.08, 0.9);
      ctx.fillStyle = fill;
      ctx.fill();
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx, top - 3);
        ctx.bezierCurveTo(cx + s * fw * 0.6, top - 1, cx + s * fw * 1.0, top + H * 0.12, cx + s * fw * 1.02, g.eyeY + 8);
        ctx.lineTo(cx + s * fw * 1.2, g.eyeY + 10);
        ctx.bezierCurveTo(cx + s * fw * 1.2, top + H * 0.2, cx + s * fw * 0.8, top - 3.2, cx, top - 3.4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = rgba(shade(col, -0.5), 0.6);
      ctx.lineWidth = 0.45;
      ctx.beginPath();
      ctx.moveTo(cx, top - 3.2);
      ctx.lineTo(cx, top + H * 0.08);
      ctx.stroke();
      break;
    }
    case 8: { // bob with fringe
      capPath(ctx, g, 3.8, g.eyeY, top + H * 0.3, 1.1, 0.95);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - fw * 0.95, top + H * 0.15);
      ctx.bezierCurveTo(cx - fw * 0.5, top - 3, cx + fw * 0.5, top - 3, cx + fw * 0.95, top + H * 0.15);
      ctx.lineTo(cx + fw * 0.9, top + H * 0.3);
      for (let i = 0; i < 6; i++) {
        const x0 = cx + fw * 0.9 - (i + 1) * (fw * 1.8 / 6);
        ctx.quadraticCurveTo(x0 + fw * 0.15, top + H * 0.33, x0, top + H * 0.3 - (i % 2) * 0.6);
      }
      ctx.closePath();
      ctx.fill();
      textured(88, 0.8, 1.45);
      break;
    }
    case 9: { // bun: pulled back
      capPath(ctx, g, 2.4, sideY, top + H * 0.17, 1.03, 0.84);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.save();
      capPath(ctx, g, 2.4, sideY, top + H * 0.17, 1.03, 0.84);
      ctx.clip();
      ctx.strokeStyle = rgba(shade(col, 0.4), 0.3);
      ctx.lineWidth = 0.4;
      for (let i = -5; i <= 5; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * 3, top + H * 0.2);
        ctx.quadraticCurveTo(cx + i * 2, top, cx, top - 4);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 11: { // flat top
      sideburns(1);
      ctx.beginPath();
      const W = fw * g.fore * 1.02;
      ctx.moveTo(cx - W, sideY);
      ctx.lineTo(cx - W - 0.3, top - 3);
      ctx.quadraticCurveTo(cx - W, top - 6.5, cx - W + 3, top - 6.5);
      ctx.lineTo(cx + W - 3, top - 6.5);
      ctx.quadraticCurveTo(cx + W, top - 6.5, cx + W + 0.3, top - 3);
      ctx.lineTo(cx + W, sideY);
      ctx.lineTo(cx + fw * 0.82, sideY);
      ctx.quadraticCurveTo(cx + fw * 0.8, top + H * 0.18, cx, top + H * 0.15);
      ctx.quadraticCurveTo(cx - fw * 0.8, top + H * 0.18, cx - fw * 0.82, sideY);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      textured(111, 1.2, 1.57);
      break;
    }
    case 12: { // comb-over
      sideburns(1);
      for (const s of [-1, 1]) {
        ctx.beginPath();
        const ox = cx + s * fw * g.fore * 1.04;
        ctx.moveTo(ox, sideY);
        ctx.bezierCurveTo(ox + s * 0.5, top + H * 0.2, ox - s * 0.5, top + 4, cx + s * fw * 0.7, top + 2);
        ctx.lineTo(cx + s * fw * 0.8, sideY);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.strokeStyle = rgba(col, 0.85);
      ctx.lineWidth = 0.7;
      for (let i = 0; i < 9; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - fw * 0.8, top + 3 + i * 0.6);
        ctx.quadraticCurveTo(cx, top - 1.5 + i * 0.9, cx + fw * 0.85, top + 4 + i * 0.7);
        ctx.stroke();
      }
      break;
    }
    case 13: { // afro front hairline
      capPath(ctx, g, 2, sideY, top + H * 0.19, 1.05);
      ctx.fillStyle = fill;
      ctx.fill();
      textured(1313, 1.6, 0.4);
      break;
    }
    case 14: { // pixie
      capPath(ctx, g, 3.4, sideY + 2, top + H * 0.22, 1.05, 0.86);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx + fw * 0.9, top);
      ctx.bezierCurveTo(cx + fw * 0.3, top - 2, cx - fw * 0.6, top + H * 0.1, cx - fw * 0.85, top + H * 0.34);
      ctx.quadraticCurveTo(cx - fw * 0.2, top + H * 0.2, cx + fw * 0.5, top + H * 0.2);
      ctx.closePath();
      ctx.fill();
      textured(1414, 0.9, 2.5);
      break;
    }
  }
  void hat;
}

// ---------------------------------------------------------------------------
// glasses
// ---------------------------------------------------------------------------
function drawGlasses(ctx: Ctx2D, g: Geo, p: LeaderProfile): void {
  const st = p.glasses;
  if (!st) return;
  const { cx, ex } = g;
  const y = g.eyeY - 0.3;
  const arms = (col: string, lw: number) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * (ex + 4.6), y - 1);
      ctx.lineTo(cx + s * g.fw * g.cheek * 1.0, y - 0.5);
      ctx.stroke();
    }
  };
  const lensTint = (path: () => void, a: number) => {
    path();
    ctx.fillStyle = `rgba(200,225,240,${a})`;
    ctx.fill();
  };
  switch (st) {
    case 1: case 6: { // round / heavy
      const heavy = st === 6;
      const col = heavy ? '#101010' : '#8a7040';
      const lw = heavy ? 1.3 : 0.5;
      for (const s of [-1, 1]) {
        const path = () => {
          ctx.beginPath();
          if (heavy) ctx.roundRect(cx + s * ex - 5, y - 3.6, 10, 7.2, 2);
          else ctx.arc(cx + s * ex, y, 4.3, 0, Math.PI * 2);
        };
        lensTint(path, 0.1);
        path();
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - ex + (heavy ? 5 : 4.3), y - 0.6);
      ctx.quadraticCurveTo(cx, y - 2.2, cx + ex - (heavy ? 5 : 4.3), y - 0.6);
      ctx.stroke();
      arms(col, lw * 0.8);
      break;
    }
    case 2: { // rectangular
      for (const s of [-1, 1]) {
        const path = () => { ctx.beginPath(); ctx.roundRect(cx + s * ex - 4.8, y - 2.6, 9.6, 5.4, 1.2); };
        lensTint(path, 0.12);
        path();
        ctx.strokeStyle = '#2a2a30';
        ctx.lineWidth = 0.65;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - ex + 4.8, y - 0.8);
      ctx.lineTo(cx + ex - 4.8, y - 0.8);
      ctx.stroke();
      arms('#2a2a30', 0.55);
      break;
    }
    case 3: { // aviators
      for (const s of [-1, 1]) {
        const path = () => {
          ctx.beginPath();
          ctx.moveTo(cx + s * (ex - 4.6), y - 2.6);
          ctx.lineTo(cx + s * (ex + 4.8), y - 2.8);
          ctx.bezierCurveTo(cx + s * (ex + 5.6), y + 2, cx + s * (ex + 2), y + 5, cx + s * ex, y + 4.6);
          ctx.bezierCurveTo(cx + s * (ex - 3.6), y + 4.4, cx + s * (ex - 5), y + 1, cx + s * (ex - 4.6), y - 2.6);
          ctx.closePath();
        };
        path();
        const lg = ctx.createLinearGradient(0, y - 3, 0, y + 5);
        lg.addColorStop(0, 'rgba(20,24,30,0.95)');
        lg.addColorStop(1, 'rgba(70,60,50,0.85)');
        ctx.fillStyle = lg;
        ctx.fill();
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 0.45;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ellipse(ctx, cx + s * ex - 1.5, y - 0.8, 1.6, 0.8, -0.4);
        ctx.fill();
      }
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 0.45;
      ctx.beginPath();
      ctx.moveTo(cx - ex + 4.6, y - 2.4);
      ctx.lineTo(cx + ex - 4.6, y - 2.4);
      ctx.moveTo(cx - ex + 4.4, y - 0.8);
      ctx.quadraticCurveTo(cx, y - 1.8, cx + ex - 4.4, y - 0.8);
      ctx.stroke();
      arms(GOLD, 0.45);
      break;
    }
    case 4: { // half-moon reading glasses, low on the nose
      const yy = y + 2.2;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + s * ex - 4.4, yy - 0.4);
        ctx.lineTo(cx + s * ex + 4.4, yy - 0.4);
        ctx.quadraticCurveTo(cx + s * ex + 4.2, yy + 3.6, cx + s * ex, yy + 3.6);
        ctx.quadraticCurveTo(cx + s * ex - 4.2, yy + 3.6, cx + s * ex - 4.4, yy - 0.4);
        ctx.fillStyle = 'rgba(200,225,240,0.12)';
        ctx.fill();
        ctx.strokeStyle = '#b09050';
        ctx.lineWidth = 0.45;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - ex + 4.4, yy - 0.2);
      ctx.quadraticCurveTo(cx, yy - 1.4, cx + ex - 4.4, yy - 0.2);
      ctx.stroke();
      break;
    }
    case 5: { // monocle
      const mx = cx + ex;
      ctx.beginPath();
      ctx.arc(mx, y, 4.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(200,225,240,0.12)';
      ctx.fill();
      ctx.strokeStyle = goldGrad(ctx, mx - 4, y - 4, mx + 4, y + 4);
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.moveTo(mx + 3.6, y + 2.6);
      ctx.bezierCurveTo(mx + 7, y + 12, mx + 3, y + 20, mx + 8, g.collarY + 12);
      ctx.stroke();
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// attire
// ---------------------------------------------------------------------------
function bodyPath(ctx: Ctx2D, g: Geo, extra = 0): void {
  const { cx } = g;
  const y0 = g.collarY;
  const sw = (g.female ? 38 : 44) + extra;
  const nw = g.neckW + 4;
  ctx.beginPath();
  ctx.moveTo(cx - sw - 10, 121);
  ctx.lineTo(cx - sw - 7, y0 + 24);
  ctx.bezierCurveTo(cx - sw - 5, y0 + 9, cx - sw + 8, y0 + 2.5, cx - nw, y0 - 1);
  ctx.lineTo(cx + nw, y0 - 1);
  ctx.bezierCurveTo(cx + sw - 8, y0 + 2.5, cx + sw + 5, y0 + 9, cx + sw + 7, y0 + 24);
  ctx.lineTo(cx + sw + 10, 121);
  ctx.closePath();
}

function fillBody(ctx: Ctx2D, g: Geo, color: string, extra = 0): void {
  bodyPath(ctx, g, extra);
  const gr = ctx.createLinearGradient(0, g.collarY, 0, 120);
  gr.addColorStop(0, shade(color, 0.14));
  gr.addColorStop(1, shade(color, -0.3));
  ctx.fillStyle = gr;
  ctx.fill();
  // shoulder highlights and side shading
  ctx.save();
  bodyPath(ctx, g, extra);
  ctx.clip();
  const sg = ctx.createLinearGradient(0, 0, 100, 0);
  sg.addColorStop(0, 'rgba(0,0,0,0.35)');
  sg.addColorStop(0.3, 'rgba(255,255,255,0.05)');
  sg.addColorStop(0.7, 'rgba(0,0,0,0)');
  sg.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, 100, 121);
  ctx.restore();
}

function shirtV(ctx: Ctx2D, g: Geo, depth: number, color = '#f1f0ea', half = 6.5): void {
  const { cx } = g;
  const y0 = g.collarY - 2;
  ctx.beginPath();
  ctx.moveTo(cx - half - 1, y0 - 1);
  ctx.lineTo(cx, y0 + depth);
  ctx.lineTo(cx + half + 1, y0 - 1);
  ctx.closePath();
  const gr = ctx.createLinearGradient(0, y0, 0, y0 + depth);
  gr.addColorStop(0, color);
  gr.addColorStop(1, shade(color, -0.15));
  ctx.fillStyle = gr;
  ctx.fill();
}

function shirtCollar(ctx: Ctx2D, g: Geo, color = '#f6f5f0', open = false): void {
  const { cx } = g;
  const y0 = g.collarY - 3;
  const nw = g.neckW;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * (nw + 0.6), y0 - 3.5);
    ctx.lineTo(cx + s * (nw + 2.6), y0 + 3.5);
    ctx.lineTo(cx + s * (open ? 4.5 : 1.2), y0 + (open ? 8 : 5.2));
    ctx.lineTo(cx + s * (open ? 2 : 0.2), y0 + 1);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.35;
    ctx.stroke();
  }
}

function tie(ctx: Ctx2D, g: Geo, color: string, stripes = true): void {
  const { cx } = g;
  const y0 = g.collarY - 1.6;
  ctx.beginPath();
  ctx.moveTo(cx - 2.2, y0);
  ctx.lineTo(cx + 2.2, y0);
  ctx.lineTo(cx + 1.5, y0 + 3.6);
  ctx.lineTo(cx - 1.5, y0 + 3.6);
  ctx.closePath();
  ctx.fillStyle = shade(color, -0.12);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 1.5, y0 + 3.6);
  ctx.lineTo(cx - 3.4, y0 + 26);
  ctx.lineTo(cx, y0 + 30);
  ctx.lineTo(cx + 3.4, y0 + 26);
  ctx.lineTo(cx + 1.5, y0 + 3.6);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  if (stripes) {
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = rgba(shade(color, lum(color) > 0.5 ? -0.4 : 0.4), 0.45);
    ctx.lineWidth = 0.8;
    for (let k = -2; k < 12; k++) {
      ctx.beginPath();
      ctx.moveTo(cx - 6, y0 + k * 3);
      ctx.lineTo(cx + 6, y0 + k * 3 + 4);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 0.3;
  ctx.stroke();
}

function lapels(ctx: Ctx2D, g: Geo, color: string, depth = 24, peak = false): void {
  const { cx } = g;
  const y0 = g.collarY - 1.5;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * (g.neckW + 1.5), y0 - 2);
    ctx.lineTo(cx + s * 1.2, y0 + depth);
    ctx.lineTo(cx + s * 5.5, y0 + depth * 0.52);
    ctx.lineTo(cx + s * (peak ? 15 : 13.5), y0 + (peak ? 4 : 7));
    ctx.lineTo(cx + s * (peak ? 11.5 : 11), y0 + (peak ? 3 : 3.2));
    ctx.lineTo(cx + s * (g.neckW + 3.6), y0 + 0.5);
    ctx.closePath();
    const lg = ctx.createLinearGradient(cx, y0, cx + s * 14, y0 + depth);
    lg.addColorStop(0, shade(color, 0.12));
    lg.addColorStop(1, shade(color, -0.15));
    ctx.fillStyle = lg;
    ctx.fill();
    ctx.strokeStyle = rgba(shade(color, -0.6), 0.8);
    ctx.lineWidth = 0.4;
    ctx.stroke();
  }
}

function buttons(ctx: Ctx2D, x: number, y0: number, n: number, gap: number, gold = true, r = 0.9): void {
  for (let i = 0; i < n; i++) {
    const y = y0 + i * gap;
    ctx.fillStyle = gold ? goldGrad(ctx, x - r, y - r, x + r, y + r) : '#1a1a1a';
    ellipse(ctx, x, y, r, r);
    ctx.fill();
  }
}

function ribbons(ctx: Ctx2D, x0: number, y0: number, rows: number, seed: number): void {
  const R = rng(seed);
  const pal = ['#b22', '#228', '#2a2', '#dd2', '#fff', '#a2a', '#e80', '#0aa', '#822'];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 3; c++) {
      const x = x0 + c * 3.3 + (r % 2 ? 1.6 : 0) * 0;
      const y = y0 - r * 1.9;
      ctx.fillStyle = pal[Math.floor(R() * pal.length)];
      ctx.fillRect(x, y, 3.1, 1.6);
      ctx.fillStyle = pal[Math.floor(R() * pal.length)];
      ctx.fillRect(x + 1.1, y, 0.9, 1.6);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 0.15;
      ctx.strokeRect(x, y, 3.1, 1.6);
    }
  }
}

function medalHang(ctx: Ctx2D, x: number, y: number, ribbon: string, star = false): void {
  ctx.fillStyle = ribbon;
  ctx.fillRect(x - 1.1, y, 2.2, 3.2);
  ctx.fillStyle = goldGrad(ctx, x - 2, y + 3, x + 2, y + 7);
  if (star) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 1.1 : 2.4;
      ctx.lineTo(x + Math.cos(a) * r, y + 5.2 + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  } else {
    ellipse(ctx, x, y + 5, 1.8, 1.8);
    ctx.fill();
  }
}

function epaulette(ctx: Ctx2D, g: Geo, color: string, fringe: boolean, stars: number): void {
  const sw = g.female ? 38 : 44;
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(g.cx + s * (sw - 10), g.collarY + 4.2);
    ctx.rotate(s * 0.22);
    if (fringe) {
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 0.55;
      for (let i = -6; i <= 6; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 0.9 + s * 1.6, 1.8);
        ctx.lineTo(i * 0.95 + s * 2.5, 6);
        ctx.stroke();
      }
    }
    ctx.beginPath();
    ctx.roundRect(-7, -2, 14, 4.2, 2);
    ctx.fillStyle = fringe ? goldGrad(ctx, 0, -2, 0, 2.5) : color;
    ctx.fill();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 0.4;
    ctx.stroke();
    ctx.fillStyle = fringe ? '#c0c0c8' : GOLD_HI;
    for (let i = 0; i < stars; i++) {
      const sx = -3.5 + i * 2.4 - ((stars - 1) * 2.4) / 2 + 3.5;
      star(ctx, sx, 0.1, 1);
    }
    ctx.restore();
  }
}

function star(ctx: Ctx2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function sash(ctx: Ctx2D, g: Geo, color: string, stripe: string | null): void {
  const { cx } = g;
  const y0 = g.collarY;
  ctx.save();
  bodyPath(ctx, g);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(cx - 24, y0 + 1);
  ctx.lineTo(cx - 15, y0 - 1);
  ctx.lineTo(cx + 34, 121);
  ctx.lineTo(cx + 20, 121);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  if (stripe) {
    ctx.beginPath();
    ctx.moveTo(cx - 20.5, y0);
    ctx.lineTo(cx - 18, y0 - 0.5);
    ctx.lineTo(cx + 28.5, 121);
    ctx.lineTo(cx + 25.5, 121);
    ctx.closePath();
    ctx.fillStyle = stripe;
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.moveTo(cx - 24, y0 + 1);
  ctx.lineTo(cx + 20, 121);
  ctx.lineTo(cx + 23, 121);
  ctx.lineTo(cx - 21, y0 + 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function pocket(ctx: Ctx2D, x: number, y: number, w: number, h: number, color: string, button = true): void {
  ctx.strokeStyle = rgba(shade(color, -0.55), 0.9);
  ctx.lineWidth = 0.4;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = shade(color, 0.06);
  ctx.beginPath();
  ctx.moveTo(x - 0.3, y);
  ctx.lineTo(x + w + 0.3, y);
  ctx.lineTo(x + w + 0.3, y + 2.6);
  ctx.lineTo(x + w / 2, y + 3.6);
  ctx.lineTo(x - 0.3, y + 2.6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (button) buttons(ctx, x + w / 2, y + 2.4, 1, 0, false, 0.55);
}

function drawAttire(ctx: Ctx2D, g: Geo, p: LeaderProfile): void {
  const { cx } = g;
  const c = p.attireColor;
  const a = p.accentColor;
  const y0 = g.collarY;
  const female = g.female;
  switch (p.attire) {
    case 0: case 9: { // business suit / presidential sash
      fillBody(ctx, g, c);
      shirtV(ctx, g, 24);
      if (female) {
        // blouse and pearls
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        for (let i = 0; i <= 12; i++) {
          const t = i / 12;
          const px = cx - 6 + t * 12;
          const py = y0 - 1 + Math.sin(t * Math.PI) * 4.5;
          ellipse(ctx, px, py, 0.7, 0.7);
          ctx.fill();
        }
      } else {
        shirtCollar(ctx, g);
        tie(ctx, g, a);
      }
      lapels(ctx, g, c, 24);
      if (p.attire === 9) {
        sash(ctx, g, a, '#f4f4f0');
        medalHang(ctx, cx + 21, y0 + 22, a, true);
      } else if (p.medals > 0) {
        // lapel pin (flag pin)
        ctx.fillStyle = a;
        ctx.fillRect(cx - 13, y0 + 7, 2.4, 1.6);
        ctx.fillStyle = GOLD;
        ctx.fillRect(cx - 13.2, y0 + 6.8, 0.4, 2);
      }
      // pocket square
      ctx.fillStyle = '#f2f2f0';
      ctx.beginPath();
      ctx.moveTo(cx + 13.2, y0 + 16);
      ctx.lineTo(cx + 13.6, y0 + 14.6);
      ctx.lineTo(cx + 16, y0 + 13.9);
      ctx.lineTo(cx + 18.6, y0 + 14.8);
      ctx.lineTo(cx + 18.8, y0 + 16);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba(shade(c, -0.6), 0.8);
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(cx + 12.5, y0 + 16);
      ctx.lineTo(cx + 19.5, y0 + 16);
      ctx.stroke();
      buttons(ctx, cx + 1.5, y0 + 26, 2, 5, false, 0.7);
      break;
    }
    case 1: { // open collar
      fillBody(ctx, g, c);
      shirtV(ctx, g, 16, shade(a, 0.75));
      ctx.fillStyle = rgba(shade(p.skin, -0.1), 1);
      ctx.beginPath();
      ctx.moveTo(cx - 3.5, y0 - 2);
      ctx.lineTo(cx, y0 + 5);
      ctx.lineTo(cx + 3.5, y0 - 2);
      ctx.closePath();
      ctx.fill();
      shirtCollar(ctx, g, shade(a, 0.75), true);
      lapels(ctx, g, c, 22);
      break;
    }
    case 2: { // military dress uniform
      fillBody(ctx, g, c);
      shirtV(ctx, g, 20, '#e0d8c0');
      shirtCollar(ctx, g, '#e0d8c0');
      tie(ctx, g, shade(c, -0.45), false);
      lapels(ctx, g, c, 20, true);
      // collar insignia
      for (const s of [-1, 1]) {
        ctx.fillStyle = a;
        ctx.beginPath();
        ctx.moveTo(cx + s * 8.5, y0 + 4);
        ctx.lineTo(cx + s * 12, y0 + 5.5);
        ctx.lineTo(cx + s * 10.5, y0 + 8);
        ctx.lineTo(cx + s * 7.8, y0 + 6.6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = GOLD_HI;
        star(ctx, cx + s * 10, y0 + 6.1, 0.8);
      }
      epaulette(ctx, g, shade(c, -0.2), p.medals >= 3, Math.max(1, p.medals + 1));
      buttons(ctx, cx + 1.8, y0 + 22, 3, 5);
      if (p.medals >= 1) ribbons(ctx, cx + 10, y0 + 15, p.medals + 1, 42);
      if (p.medals >= 2) {
        medalHang(ctx, cx + 11.5, y0 + 17, '#b22');
        medalHang(ctx, cx + 15.5, y0 + 17, '#228', true);
        medalHang(ctx, cx - 14, y0 + 16, '#dd2', true);
      }
      if (p.medals >= 3) {
        // aiguillette
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 0.7;
        for (let k = 0; k < 2; k++) {
          ctx.beginPath();
          ctx.moveTo(cx - 30, y0 + 5);
          ctx.bezierCurveTo(cx - 28 + k * 2, y0 + 20 + k * 3, cx - 16, y0 + 18, cx - 12, y0 + 11);
          ctx.stroke();
        }
      }
      pocket(ctx, cx - 18, y0 + 16, 7, 6, c);
      break;
    }
    case 3: { // combat fatigues
      fillBody(ctx, g, c);
      ctx.save();
      bodyPath(ctx, g);
      ctx.clip();
      const R = rng(hashStr(c) + 3);
      const camo = [shade(c, -0.35), shade(c, 0.2), mix(c, '#3a2a1a', 0.5)];
      for (let i = 0; i < 70; i++) {
        ctx.fillStyle = rgba(camo[i % 3], 0.75);
        ellipse(ctx, R() * 100, y0 + R() * 40, 2 + R() * 4, 1 + R() * 2.2, R() * 3);
        ctx.fill();
      }
      ctx.restore();
      // T-shirt
      ctx.fillStyle = shade(c, -0.55);
      ctx.beginPath();
      ctx.moveTo(cx - 6.5, y0 - 2);
      ctx.quadraticCurveTo(cx, y0 + 7, cx + 6.5, y0 - 2);
      ctx.closePath();
      ctx.fill();
      shirtCollar(ctx, g, shade(c, 0.05), true);
      pocket(ctx, cx - 18, y0 + 12, 8, 7, c);
      pocket(ctx, cx + 10, y0 + 12, 8, 7, c);
      // name tape and flag patch
      ctx.fillStyle = shade(c, -0.1);
      ctx.fillRect(cx + 10, y0 + 9.5, 8, 1.8);
      ctx.fillStyle = a;
      ctx.fillRect(cx - 38, y0 + 10, 5, 3.4);
      if (p.medals > 0) {
        ctx.fillStyle = '#111';
        for (let i = 0; i < Math.min(4, p.medals + 1); i++) star(ctx, cx - 14 + i * 2.4, y0 + 8, 0.9);
      }
      break;
    }
    case 4: { // royal regalia
      fillBody(ctx, g, c);
      // jacket front with gold frogging
      shirtV(ctx, g, 26, shade(a, 0.1), 7);
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 0.6;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - 4 + i * 0.6, y0 + 4 + i * 4);
        ctx.lineTo(cx + 4 - i * 0.6, y0 + 4 + i * 4);
        ctx.stroke();
      }
      // ermine cape collar
      ctx.save();
      bodyPath(ctx, g, 2);
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(0, y0 + 20);
      ctx.bezierCurveTo(20, y0 + 22, 30, y0 + 16, cx - 8, y0 + 12);
      ctx.lineTo(cx - 6, y0 - 4);
      ctx.lineTo(cx + 6, y0 - 4);
      ctx.lineTo(cx + 8, y0 + 12);
      ctx.bezierCurveTo(70, y0 + 16, 80, y0 + 22, 100, y0 + 20);
      ctx.lineTo(100, y0 - 10);
      ctx.lineTo(0, y0 - 10);
      ctx.closePath();
      ctx.fillStyle = '#f4f1ea';
      ctx.fill();
      ctx.fillStyle = '#141414';
      const R = rng(4);
      for (let i = 0; i < 26; i++) {
        const x = R() * 100, y = y0 + R() * 18;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 0.7, y + 1.4, x, y + 2.6);
        ctx.quadraticCurveTo(x - 0.7, y + 1.4, x, y);
        ctx.fill();
      }
      ctx.restore();
      // chain of office
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1;
      ctx.setLineDash([1.2, 0.6]);
      ctx.beginPath();
      ctx.moveTo(cx - 16, y0 + 8);
      ctx.quadraticCurveTo(cx, y0 + 26, cx + 16, y0 + 8);
      ctx.stroke();
      ctx.setLineDash([]);
      medalHang(ctx, cx, y0 + 15.5, a, true);
      if (p.medals >= 1) sash(ctx, g, shade(a, -0.1), null);
      break;
    }
    case 5: { // religious robes
      fillBody(ctx, g, c, 3);
      // cloak edges
      ctx.strokeStyle = rgba(shade(c, -0.6), 0.9);
      ctx.lineWidth = 0.6;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + s * (g.neckW + 3), y0);
        ctx.bezierCurveTo(cx + s * 9, y0 + 12, cx + s * 11, y0 + 22, cx + s * 12, 121);
        ctx.stroke();
      }
      // inner robe
      ctx.fillStyle = shade(c, lum(c) > 0.5 ? -0.12 : 0.15);
      ctx.beginPath();
      ctx.moveTo(cx - g.neckW - 2, y0 - 1);
      ctx.bezierCurveTo(cx - 8, y0 + 12, cx - 10, y0 + 22, cx - 11, 121);
      ctx.lineTo(cx + 11, 121);
      ctx.bezierCurveTo(cx + 10, y0 + 22, cx + 8, y0 + 12, cx + g.neckW + 2, y0 - 1);
      ctx.closePath();
      ctx.fill();
      // clerical collar band
      ctx.fillStyle = '#f4f2ea';
      ctx.beginPath();
      ctx.moveTo(cx - g.neckW - 0.5, y0 - 4.5);
      ctx.quadraticCurveTo(cx, y0 - 1, cx + g.neckW + 0.5, y0 - 4.5);
      ctx.lineTo(cx + g.neckW + 0.8, y0 - 2);
      ctx.quadraticCurveTo(cx, y0 + 1.8, cx - g.neckW - 0.8, y0 - 2);
      ctx.closePath();
      ctx.fill();
      // stole
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(cx + s * (g.neckW + 0.5), y0 - 1);
        ctx.lineTo(cx + s * (g.neckW + 5), y0 - 0.5);
        ctx.lineTo(cx + s * 9.5, 121);
        ctx.lineTo(cx + s * 4.5, 121);
        ctx.closePath();
        ctx.fillStyle = a;
        ctx.fill();
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 0.4;
        ctx.stroke();
        ctx.fillStyle = GOLD;
        const yy = y0 + 22;
        ctx.fillRect(cx + s * 6.9 - 0.4, yy - 2, 0.8, 4);
        ctx.fillRect(cx + s * 6.9 - 1.6, yy - 0.8, 3.2, 0.8);
      }
      break;
    }
    case 6: { // revolutionary shirt
      fillBody(ctx, g, c);
      ctx.fillStyle = shade(p.skin, -0.12);
      ctx.beginPath();
      ctx.moveTo(cx - 5, y0 - 2);
      ctx.lineTo(cx, y0 + 9);
      ctx.lineTo(cx + 5, y0 - 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e8e2d0';
      ctx.beginPath();
      ctx.moveTo(cx - 4, y0 - 1);
      ctx.quadraticCurveTo(cx, y0 + 4, cx + 4, y0 - 1);
      ctx.lineTo(cx + 3, y0 - 1.5);
      ctx.quadraticCurveTo(cx, y0 + 2.4, cx - 3, y0 - 1.5);
      ctx.closePath();
      ctx.fill();
      shirtCollar(ctx, g, shade(c, 0.08), true);
      pocket(ctx, cx - 17, y0 + 11, 8, 8, c);
      pocket(ctx, cx + 9, y0 + 11, 8, 8, c);
      buttons(ctx, cx, y0 + 12, 3, 6, false, 0.6);
      // shoulder straps
      const sw = female ? 38 : 44;
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(cx + s * (sw - 12), y0 + 3.5);
        ctx.rotate(s * 0.2);
        ctx.fillStyle = shade(c, 0.1);
        ctx.fillRect(-6, -1.2, 12, 2.6);
        ctx.strokeStyle = rgba(shade(c, -0.5), 0.8);
        ctx.lineWidth = 0.3;
        ctx.strokeRect(-6, -1.2, 12, 2.6);
        ctx.restore();
      }
      ctx.fillStyle = a;
      star(ctx, cx - 9.5, y0 + 4.5, 1.6);
      break;
    }
    case 7: { // tunic suit (closed stand collar)
      fillBody(ctx, g, c);
      ctx.fillStyle = shade(c, 0.08);
      ctx.beginPath();
      ctx.moveTo(cx - g.neckW - 1.2, y0 - 5);
      ctx.quadraticCurveTo(cx, y0 - 2.5, cx + g.neckW + 1.2, y0 - 5);
      ctx.lineTo(cx + g.neckW + 2.5, y0 + 0.5);
      ctx.lineTo(cx + 1, y0 + 3);
      ctx.lineTo(cx - 1, y0 + 3);
      ctx.lineTo(cx - g.neckW - 2.5, y0 + 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba(shade(c, -0.6), 0.9);
      ctx.lineWidth = 0.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, y0 + 3);
      ctx.lineTo(cx, 121);
      ctx.stroke();
      buttons(ctx, cx + 0.9, y0 + 6, 5, 5.5, false, 0.65);
      pocket(ctx, cx - 17, y0 + 9, 8, 7.5, c);
      pocket(ctx, cx + 9, y0 + 9, 8, 7.5, c);
      pocket(ctx, cx - 19, y0 + 25, 10, 9, c);
      pocket(ctx, cx + 9, y0 + 25, 10, 9, c);
      if (p.medals >= 1) {
        ctx.fillStyle = a;
        ellipse(ctx, cx - 13, y0 + 6, 1.6, 1.6);
        ctx.fill();
        ctx.fillStyle = GOLD_HI;
        star(ctx, cx - 13, y0 + 6, 1);
      }
      break;
    }
    case 8: { // thobe & bisht
      fillBody(ctx, g, '#f2f1ec');
      ctx.fillStyle = '#f7f6f2';
      ctx.beginPath();
      ctx.moveTo(cx - g.neckW - 1, y0 - 4);
      ctx.quadraticCurveTo(cx, y0 - 1, cx + g.neckW + 1, y0 - 4);
      ctx.lineTo(cx + g.neckW + 1.5, y0 - 1.5);
      ctx.quadraticCurveTo(cx, y0 + 2, cx - g.neckW - 1.5, y0 - 1.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 0.35;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, y0 + 1);
      ctx.lineTo(cx, y0 + 16);
      ctx.stroke();
      buttons(ctx, cx + 0.8, y0 + 4, 3, 4, true, 0.55);
      // bisht (cloak)
      for (const s of [-1, 1]) {
        ctx.beginPath();
        const sw = (female ? 38 : 44) + 3;
        ctx.moveTo(cx + s * (g.neckW + 3), y0 - 1.5);
        ctx.bezierCurveTo(cx + s * (sw - 6), y0 + 1, cx + s * (sw + 6), y0 + 8, cx + s * (sw + 11), 121);
        ctx.lineTo(cx + s * 13, 121);
        ctx.bezierCurveTo(cx + s * 11, y0 + 20, cx + s * 9, y0 + 8, cx + s * (g.neckW + 3), y0 - 1.5);
        ctx.closePath();
        const bg = ctx.createLinearGradient(cx, 0, cx + s * 50, 0);
        bg.addColorStop(0, shade(c, 0.1));
        bg.addColorStop(1, shade(c, -0.35));
        ctx.fillStyle = bg;
        ctx.fill();
        ctx.strokeStyle = goldGrad(ctx, cx, y0, cx, 121);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(cx + s * (g.neckW + 3), y0 - 1.5);
        ctx.bezierCurveTo(cx + s * 9, y0 + 8, cx + s * 11, y0 + 20, cx + s * 13, 121);
        ctx.stroke();
      }
      break;
    }
    case 10: { // admiral whites
      const white = lum(c) > 0.7 ? c : '#f1efe8';
      fillBody(ctx, g, white);
      ctx.fillStyle = shade(white, 0.02);
      ctx.beginPath();
      ctx.moveTo(cx - g.neckW - 1.2, y0 - 5);
      ctx.quadraticCurveTo(cx, y0 - 2.5, cx + g.neckW + 1.2, y0 - 5);
      ctx.lineTo(cx + g.neckW + 2.2, y0 + 0.5);
      ctx.lineTo(cx - g.neckW - 2.2, y0 + 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 0.35;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, y0 + 0.5);
      ctx.lineTo(cx, 121);
      ctx.stroke();
      buttons(ctx, cx + 0.9, y0 + 4, 5, 5.5);
      // shoulder boards
      const sw = female ? 38 : 44;
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(cx + s * (sw - 11), y0 + 4);
        ctx.rotate(s * 0.2);
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.roundRect(-6.5, -1.8, 13, 3.8, 1.5);
        ctx.fill();
        ctx.fillStyle = GOLD;
        ctx.fillRect(-5.5, -0.9, 9, 1.8);
        ctx.fillStyle = GOLD_HI;
        star(ctx, 4.8, 0, 1);
        ctx.restore();
      }
      if (p.medals >= 1) ribbons(ctx, cx - 17, y0 + 13, p.medals + 1, 77);
      if (p.medals >= 2) {
        medalHang(ctx, cx + 12, y0 + 14, a, true);
        medalHang(ctx, cx + 16, y0 + 14, '#228');
      }
      if (p.medals >= 3) sash(ctx, g, a, null);
      break;
    }
    case 11: { // turtleneck + jacket
      fillBody(ctx, g, c);
      shirtV(ctx, g, 26, a, 8);
      ctx.fillStyle = shade(a, 0.08);
      ctx.beginPath();
      ctx.roundRect(cx - g.neckW - 1.2, y0 - 7, (g.neckW + 1.2) * 2, 7.5, 2.5);
      ctx.fill();
      ctx.strokeStyle = rgba(shade(a, -0.5), 0.6);
      ctx.lineWidth = 0.3;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - g.neckW, y0 - 7 + i * 1.8);
        ctx.lineTo(cx + g.neckW, y0 - 7 + i * 1.8);
        ctx.stroke();
      }
      lapels(ctx, g, c, 26);
      break;
    }
    default:
      fillBody(ctx, g, c);
  }
}

// ---------------------------------------------------------------------------
// headwear
// ---------------------------------------------------------------------------
function keffiyehBack(ctx: Ctx2D, g: Geo, p: LeaderProfile): void {
  const { cx, fw, top } = g;
  const cloth = p.accentColor === '#161616' ? '#f4f2ea' : p.accentColor;
  ctx.beginPath();
  ctx.moveTo(cx - fw * 1.2, top + 2);
  ctx.bezierCurveTo(cx - fw * 1.5, top + 30, cx - fw * 1.9, g.collarY, cx - fw * 2.3, 121);
  ctx.lineTo(cx + fw * 2.3, 121);
  ctx.bezierCurveTo(cx + fw * 1.9, g.collarY, cx + fw * 1.5, top + 30, cx + fw * 1.2, top + 2);
  ctx.closePath();
  ctx.fillStyle = '#f2f0ea';
  ctx.fill();
  ctx.save();
  ctx.clip();
  if (cloth !== '#f4f2ea' && cloth !== '#ffffff') {
    ctx.strokeStyle = rgba(cloth, 0.6);
    ctx.lineWidth = 0.5;
    for (let i = -40; i < 140; i += 3) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 60, 120); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i + 60, 0); ctx.lineTo(i, 120); ctx.stroke();
    }
  }
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, 0, 100, 120);
  ctx.restore();
}

function drawHeadwear(ctx: Ctx2D, g: Geo, p: LeaderProfile): void {
  const { cx, fw, top, H } = g;
  const c = p.attireColor;
  const a = p.accentColor;
  switch (p.headwear) {
    case 1: { // peaked military cap
      const bandY = top + H * 0.13;
      const W = fw * 1.08;
      // crown
      ctx.beginPath();
      ctx.moveTo(cx - W, bandY);
      ctx.bezierCurveTo(cx - W * 1.5, top - 4, cx - W * 0.9, top - 11, cx, top - 11);
      ctx.bezierCurveTo(cx + W * 0.9, top - 11, cx + W * 1.5, top - 4, cx + W, bandY);
      ctx.closePath();
      const cg = ctx.createLinearGradient(0, top - 11, 0, bandY);
      cg.addColorStop(0, shade(c, 0.2));
      cg.addColorStop(1, shade(c, -0.15));
      ctx.fillStyle = cg;
      ctx.fill();
      // band
      ctx.fillStyle = lum(a) > 0.85 ? '#1a1a1a' : a;
      ctx.beginPath();
      ctx.moveTo(cx - W, bandY - 4.5);
      ctx.quadraticCurveTo(cx, bandY - 3, cx + W, bandY - 4.5);
      ctx.lineTo(cx + W, bandY + 0.5);
      ctx.quadraticCurveTo(cx, bandY + 2, cx - W, bandY + 0.5);
      ctx.closePath();
      ctx.fill();
      // chin cord
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx - W + 1, bandY + 0.2);
      ctx.quadraticCurveTo(cx, bandY + 2.2, cx + W - 1, bandY + 0.2);
      ctx.stroke();
      // visor
      ctx.beginPath();
      ctx.moveTo(cx - W * 0.92, bandY + 0.4);
      ctx.quadraticCurveTo(cx, bandY + 7.5, cx + W * 0.92, bandY + 0.4);
      ctx.quadraticCurveTo(cx, bandY + 3, cx - W * 0.92, bandY + 0.4);
      const vg = ctx.createLinearGradient(0, bandY, 0, bandY + 6);
      vg.addColorStop(0, '#2a2a2a');
      vg.addColorStop(1, '#050505');
      ctx.fillStyle = vg;
      ctx.fill();
      if (p.medals >= 2) {
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 0.6;
        for (let i = -3; i <= 3; i++) {
          ctx.beginPath();
          ctx.moveTo(cx + i * 3, bandY + 2.6);
          ctx.lineTo(cx + i * 3 + 1.2, bandY + 4.2);
          ctx.stroke();
        }
      }
      // badge
      ctx.fillStyle = goldGrad(ctx, cx - 3, bandY - 9, cx + 3, bandY - 2);
      ctx.beginPath();
      ctx.moveTo(cx - 4, bandY - 5);
      ctx.quadraticCurveTo(cx - 2, bandY - 9, cx, bandY - 9);
      ctx.quadraticCurveTo(cx + 2, bandY - 9, cx + 4, bandY - 5);
      ctx.quadraticCurveTo(cx, bandY - 1.6, cx - 4, bandY - 5);
      ctx.fill();
      ctx.fillStyle = a;
      ellipse(ctx, cx, bandY - 5.6, 1.4, 1.4);
      ctx.fill();
      break;
    }
    case 2: { // beret
      const col = a;
      ctx.beginPath();
      ctx.moveTo(cx - fw * 1.05, top + H * 0.14);
      ctx.bezierCurveTo(cx - fw * 1.4, top - 6, cx + fw * 0.4, top - 12, cx + fw * 1.35, top - 1);
      ctx.bezierCurveTo(cx + fw * 1.55, top + 4, cx + fw * 1.25, top + 8, cx + fw * 1.02, top + H * 0.14);
      ctx.quadraticCurveTo(cx, top + H * 0.08, cx - fw * 1.05, top + H * 0.14);
      ctx.closePath();
      const bg = ctx.createLinearGradient(cx - fw, top - 10, cx + fw, top + 8);
      bg.addColorStop(0, shade(col, 0.2));
      bg.addColorStop(1, shade(col, -0.35));
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.fillStyle = shade(col, -0.45);
      ctx.beginPath();
      ctx.moveTo(cx - fw * 1.05, top + H * 0.14);
      ctx.quadraticCurveTo(cx, top + H * 0.08, cx + fw * 1.02, top + H * 0.14);
      ctx.lineTo(cx + fw * 1.0, top + H * 0.14 - 2.2);
      ctx.quadraticCurveTo(cx, top + H * 0.08 - 2.2, cx - fw * 1.03, top + H * 0.14 - 2.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = goldGrad(ctx, cx - fw * 0.6, top - 1, cx - fw * 0.3, top + 4);
      ellipse(ctx, cx - fw * 0.55, top + 1.8, 2, 2.4);
      ctx.fill();
      break;
    }
    case 3: { // revolutionary soft cap
      const bandY = top + H * 0.15;
      const W = fw * 1.06;
      ctx.beginPath();
      ctx.moveTo(cx - W, bandY);
      ctx.lineTo(cx - W * 1.02, top - 5);
      ctx.quadraticCurveTo(cx, top - 9, cx + W * 1.02, top - 5);
      ctx.lineTo(cx + W, bandY);
      ctx.closePath();
      const cg = ctx.createLinearGradient(0, top - 8, 0, bandY);
      cg.addColorStop(0, shade(c, 0.15));
      cg.addColorStop(1, shade(c, -0.2));
      ctx.fillStyle = cg;
      ctx.fill();
      ctx.strokeStyle = rgba(shade(c, -0.6), 0.6);
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(cx - W, bandY - 3.5);
      ctx.quadraticCurveTo(cx, bandY - 2.4, cx + W, bandY - 3.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - W * 0.85, bandY);
      ctx.quadraticCurveTo(cx, bandY + 6, cx + W * 0.85, bandY);
      ctx.quadraticCurveTo(cx, bandY + 2, cx - W * 0.85, bandY);
      ctx.fillStyle = shade(c, -0.4);
      ctx.fill();
      ctx.fillStyle = a === '#161616' ? '#c01818' : a;
      star(ctx, cx, bandY - 6.5, 2.6);
      break;
    }
    case 4: { // royal crown
      const baseY = top + H * 0.13;
      const W = fw * 1.02;
      // velvet cap
      ctx.fillStyle = '#7a1020';
      ctx.beginPath();
      ctx.moveTo(cx - W, baseY);
      ctx.bezierCurveTo(cx - W, top - 13, cx + W, top - 13, cx + W, baseY);
      ctx.closePath();
      ctx.fill();
      // arches
      ctx.strokeStyle = goldGrad(ctx, cx - W, top - 16, cx + W, baseY);
      ctx.lineWidth = 1.5;
      for (const t of [-0.6, 0, 0.6]) {
        ctx.beginPath();
        ctx.moveTo(cx + t * W * 1.4, baseY - 1);
        ctx.quadraticCurveTo(cx + t * W * 0.9, top - 12, cx, top - 11);
        ctx.stroke();
      }
      // cross / orb
      ctx.fillStyle = goldGrad(ctx, cx - 2, top - 17, cx + 2, top - 10);
      ellipse(ctx, cx, top - 12, 1.8, 1.8);
      ctx.fill();
      ctx.fillRect(cx - 0.5, top - 18, 1, 5);
      ctx.fillRect(cx - 1.8, top - 16.5, 3.6, 1);
      // band with points
      ctx.fillStyle = goldGrad(ctx, 0, baseY - 6, 0, baseY + 2);
      ctx.beginPath();
      ctx.moveTo(cx - W - 0.5, baseY + 1.5);
      ctx.lineTo(cx - W - 0.5, baseY - 4);
      for (let i = 0; i <= 6; i++) {
        const x = cx - W + (i * 2 * W) / 6;
        ctx.lineTo(x - W / 6 + (i === 0 ? W / 6 : 0), baseY - 4);
        ctx.lineTo(x, baseY - 8);
        ctx.lineTo(x + W / 6, baseY - 4);
      }
      ctx.lineTo(cx + W + 0.5, baseY - 4);
      ctx.lineTo(cx + W + 0.5, baseY + 1.5);
      ctx.closePath();
      ctx.fill();
      // ermine rim
      ctx.fillStyle = '#f3f0e8';
      ctx.beginPath();
      ctx.roundRect(cx - W - 1.2, baseY - 0.5, 2 * W + 2.4, 3.4, 1.5);
      ctx.fill();
      ctx.fillStyle = '#111';
      for (let i = 0; i < 7; i++) ctx.fillRect(cx - W + i * (2 * W / 6) - 0.3, baseY + 0.3, 0.6, 1.6);
      // jewels
      const jewels = ['#c01818', '#1850c0', '#18a050'];
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = jewels[i % 3];
        ellipse(ctx, cx - W * 0.7 + i * W * 0.35, baseY - 2.4, 0.9, 1.1);
        ctx.fill();
      }
      break;
    }
    case 5: { // turban
      const col = a === '#161616' ? '#1c1c1c' : a === '#ffffff' ? '#f2f0ea' : a;
      const W = fw * 1.15;
      const baseY = top + H * 0.2;
      ctx.beginPath();
      ctx.moveTo(cx - W, baseY);
      ctx.bezierCurveTo(cx - W * 1.25, top - 6, cx - W * 0.6, top - 14, cx, top - 14);
      ctx.bezierCurveTo(cx + W * 0.6, top - 14, cx + W * 1.25, top - 6, cx + W, baseY);
      ctx.quadraticCurveTo(cx, baseY - 4, cx - W, baseY);
      ctx.closePath();
      const tg = ctx.createLinearGradient(cx - W, 0, cx + W, 0);
      tg.addColorStop(0, shade(col, 0.15));
      tg.addColorStop(0.5, col);
      tg.addColorStop(1, shade(col, -0.35));
      ctx.fillStyle = tg;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = rgba(shade(col, lum(col) > 0.5 ? -0.35 : 0.3), 0.55);
      ctx.lineWidth = 0.6;
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - W * 1.2, baseY - 1 - i * 2.4);
        ctx.quadraticCurveTo(cx, baseY - 8 - i * 2.2 + (i % 2 ? 3 : 0), cx + W * 1.2, baseY - 3 - i * 2.6);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 6: { // skullcap
      ctx.beginPath();
      ctx.ellipse(cx, top + 2.5, fw * 0.95, 7.5, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = lum(a) > 0.9 ? '#f4f2ea' : a;
      ctx.fill();
      ctx.strokeStyle = rgba(GOLD, 0.8);
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(cx - fw * 0.95, top + 2);
      ctx.lineTo(cx + fw * 0.95, top + 2);
      ctx.stroke();
      break;
    }
    case 7: { // keffiyeh front + agal
      const W = fw * 1.14;
      ctx.beginPath();
      ctx.moveTo(cx - W, g.eyeY + 6);
      ctx.bezierCurveTo(cx - W * 1.12, top - 2, cx - W * 0.6, top - 7, cx, top - 7);
      ctx.bezierCurveTo(cx + W * 0.6, top - 7, cx + W * 1.12, top - 2, cx + W, g.eyeY + 6);
      ctx.lineTo(cx + fw * 0.92, g.eyeY + 6);
      ctx.bezierCurveTo(cx + fw * 0.95, top + 6, cx + fw * 0.5, top + H * 0.14, cx, top + H * 0.14);
      ctx.bezierCurveTo(cx - fw * 0.5, top + H * 0.14, cx - fw * 0.95, top + 6, cx - fw * 0.92, g.eyeY + 6);
      ctx.closePath();
      ctx.fillStyle = '#f4f2ea';
      ctx.fill();
      const cloth = a === '#161616' ? null : a;
      if (cloth && cloth !== '#ffffff') {
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = rgba(cloth, 0.6);
        ctx.lineWidth = 0.5;
        for (let i = -40; i < 140; i += 3) {
          ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 60, 120); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(i + 60, 0); ctx.lineTo(i, 120); ctx.stroke();
        }
        ctx.restore();
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      // agal (black cord)
      ctx.strokeStyle = '#0c0c0c';
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        ctx.ellipse(cx, top + 1.5 + k * 1.8, W * 0.98, 3.2, 0, Math.PI * 0.05, Math.PI * 0.95, true);
        ctx.stroke();
      }
      break;
    }
    case 8: { // tiara
      const baseY = top + H * 0.08;
      ctx.fillStyle = goldGrad(ctx, 0, baseY - 6, 0, baseY + 1);
      ctx.beginPath();
      ctx.moveTo(cx - fw * 0.8, baseY + 1);
      ctx.quadraticCurveTo(cx, baseY - 2, cx + fw * 0.8, baseY + 1);
      for (let i = 8; i >= 0; i--) {
        const x = cx - fw * 0.8 + (i * fw * 1.6) / 8;
        const hgt = 2 + (4 - Math.abs(i - 4)) * 1.3;
        ctx.lineTo(x, baseY - 1 - hgt * (i % 2 ? 0.55 : 1));
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = a;
      ellipse(ctx, cx, baseY - 4.4, 1.3, 1.6);
      ctx.fill();
      ctx.fillStyle = '#fff';
      for (const t of [-0.5, 0.5]) { ellipse(ctx, cx + t * fw * 0.8, baseY - 2, 0.7, 0.7); ctx.fill(); }
      break;
    }
    case 9: { // kepi
      const bandY = top + H * 0.14;
      const W = fw * 0.98;
      ctx.beginPath();
      ctx.moveTo(cx - W, bandY);
      ctx.lineTo(cx - W * 0.9, top - 9);
      ctx.quadraticCurveTo(cx, top - 11, cx + W * 0.9, top - 9);
      ctx.lineTo(cx + W, bandY);
      ctx.closePath();
      ctx.fillStyle = a;
      ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(cx - W, bandY);
      ctx.lineTo(cx - W * 0.97, bandY - 5);
      ctx.quadraticCurveTo(cx, bandY - 3.5, cx + W * 0.97, bandY - 5);
      ctx.lineTo(cx + W, bandY);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - W * 0.95, bandY - 6.5 - i * 1.2);
        ctx.quadraticCurveTo(cx, bandY - 5 - i * 1.2, cx + W * 0.95, bandY - 6.5 - i * 1.2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - W * 0.9, bandY);
      ctx.quadraticCurveTo(cx, bandY + 6, cx + W * 0.9, bandY);
      ctx.quadraticCurveTo(cx, bandY + 2.5, cx - W * 0.9, bandY);
      ctx.fillStyle = '#0c0c0c';
      ctx.fill();
      ctx.fillStyle = goldGrad(ctx, cx - 2, bandY - 5, cx + 2, bandY);
      star(ctx, cx, bandY - 2.5, 1.6);
      break;
    }
    case 10: { // fur hat (papakha)
      const baseY = top + H * 0.16;
      const W = fw * 1.12;
      const fur = lum(a) > 0.8 ? '#e8e4dc' : lum(a) < 0.12 ? '#1a1612' : '#6a5038';
      ctx.beginPath();
      ctx.moveTo(cx - W, baseY);
      ctx.lineTo(cx - W * 1.05, top - 12);
      ctx.quadraticCurveTo(cx, top - 15, cx + W * 1.05, top - 12);
      ctx.lineTo(cx + W, baseY);
      ctx.quadraticCurveTo(cx, baseY + 2, cx - W, baseY);
      ctx.closePath();
      ctx.fillStyle = fur;
      ctx.fill();
      ctx.save();
      ctx.clip();
      hairTexture(ctx, fur, cx - W * 1.1, top - 16, cx + W * 1.1, baseY + 2, 1010, 2.4, 1.2);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(cx + W * 0.3, top - 16, W, 30);
      ctx.restore();
      ctx.fillStyle = GOLD;
      star(ctx, cx, baseY - 7, 1.8);
      break;
    }
  }
}
