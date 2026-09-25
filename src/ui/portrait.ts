/**
 * Procedurally drawn minister portraits (canvas), deterministic per name.
 */
import { hashStr, seeded } from './dom';

const SKIN = ['#f3d2b5', '#e8b996', '#d9a47c', '#c68a5f', '#a86c45', '#8b5434', '#6b3e25', '#f0c8a8'];
const HAIR = ['#1a1310', '#2d1d14', '#4a3020', '#6b4a2b', '#8b6a3e', '#b89560', '#d8c8a8', '#9a9a9a', '#c9c9c9', '#3a2a22'];
const SUIT = ['#1c2433', '#23262b', '#2b2f36', '#1b1b1f', '#3a3f47', '#2c2a3a', '#33291f'];
const TIE = ['#8c1d1d', '#1d3f8c', '#2d6b2d', '#6b1d6b', '#b07a1d', '#444', '#1d6b6b', '#a33'];
const BG = [['#4c5a66', '#1c232a'], ['#5a5048', '#211c18'], ['#3e5244', '#18201a'], ['#58465a', '#1f1820'], ['#4a4f5c', '#191b22']];

export interface PortraitOpts {
  military?: boolean;
  female?: boolean;
  age?: number; // 0..1
}

const cache = new Map<string, string>();

export function portraitURL(name: string, w: number, h: number, opts: PortraitOpts = {}): string {
  const key = `${name}|${w}|${h}|${opts.military ? 1 : 0}|${opts.female ?? '-'}|${opts.age ?? '-'}`;
  let url = cache.get(key);
  if (!url) {
    url = drawPortrait(name, w, h, opts).toDataURL();
    cache.set(key, url);
  }
  return url;
}

export function drawPortrait(name: string, w: number, h: number, opts: PortraitOpts = {}): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const S = 2; // supersample
  c.width = w * S;
  c.height = h * S;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const rnd = seeded(hashStr(name));
  const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
  const female = opts.female ?? rnd() < 0.32;
  const age = opts.age ?? rnd();
  ctx.scale((w * S) / 100, (h * S) / 118);
  // background
  const bg = pick(BG);
  const g = ctx.createRadialGradient(50, 40, 5, 50, 55, 85);
  g.addColorStop(0, bg[0]);
  g.addColorStop(1, bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 100, 118);
  // flag-ish backdrop stripe
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(0, 70, 100, 6);

  const skin = pick(SKIN);
  const hairCol = age > 0.75 ? pick(['#9a9a9a', '#c9c9c9', '#d8d8d8']) : pick(HAIR);
  const suit = opts.military ? pick(['#3c4a2c', '#2e3a26', '#44503a', '#26324a']) : pick(SUIT);
  const faceW = 30 + rnd() * 6;
  const faceH = 38 + rnd() * 5;
  const cx = 50;
  const cy = 52;

  // shoulders / suit
  ctx.fillStyle = suit;
  ctx.beginPath();
  ctx.moveTo(4, 118);
  ctx.bezierCurveTo(8, 92, 26, 86, 50, 86);
  ctx.bezierCurveTo(74, 86, 92, 92, 96, 118);
  ctx.closePath();
  ctx.fill();
  // shirt & tie / collar
  if (opts.military) {
    ctx.fillStyle = shade(suit, 0.25);
    ctx.beginPath();
    ctx.moveTo(38, 88); ctx.lineTo(50, 104); ctx.lineTo(62, 88); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e8e2c8';
    ctx.fillRect(46, 88, 8, 6);
    // ribbons
    const rc = ['#b22', '#228', '#2a2', '#dd2', '#fff', '#a2a'];
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = rc[Math.floor(rnd() * rc.length)];
      ctx.fillRect(24 + (i % 3) * 5, 98 + Math.floor(i / 3) * 3.2, 4.6, 2.8);
    }
    // epaulettes
    ctx.fillStyle = '#c9a43a';
    ctx.fillRect(12, 94, 14, 3);
    ctx.fillRect(74, 94, 14, 3);
  } else {
    ctx.fillStyle = '#eef0f2';
    ctx.beginPath();
    ctx.moveTo(40, 87); ctx.lineTo(50, 108); ctx.lineTo(60, 87); ctx.closePath();
    ctx.fill();
    if (!female || rnd() < 0.2) {
      ctx.fillStyle = pick(TIE);
      ctx.beginPath();
      ctx.moveTo(48, 90); ctx.lineTo(52, 90); ctx.lineTo(54, 106); ctx.lineTo(50, 112); ctx.lineTo(46, 106); ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = pick(['#d4af37', '#e0e0e0', '#8b0000']);
      ctx.beginPath();
      ctx.arc(50, 96, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // lapels
    ctx.fillStyle = shade(suit, -0.15);
    ctx.beginPath();
    ctx.moveTo(40, 87); ctx.lineTo(47, 104); ctx.lineTo(36, 96); ctx.closePath();
    ctx.moveTo(60, 87); ctx.lineTo(53, 104); ctx.lineTo(64, 96); ctx.closePath();
    ctx.fill();
  }
  // neck
  ctx.fillStyle = shade(skin, -0.12);
  ctx.fillRect(cx - 8, cy + faceH / 2 - 8, 16, 18);

  // long hair behind (female)
  if (female && rnd() < 0.75) {
    ctx.fillStyle = hairCol;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, faceW / 2 + 7, faceH / 2 + 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // ears
  ctx.fillStyle = shade(skin, -0.06);
  ctx.beginPath();
  ctx.ellipse(cx - faceW / 2, cy + 2, 3.5, 6, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + faceW / 2, cy + 2, 3.5, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // face
  const fg = ctx.createLinearGradient(cx - faceW / 2, 0, cx + faceW / 2, 0);
  fg.addColorStop(0, shade(skin, -0.1));
  fg.addColorStop(0.45, skin);
  fg.addColorStop(1, shade(skin, -0.18));
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.ellipse(cx, cy, faceW / 2, faceH / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // jaw shading
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + faceH * 0.3, faceW * 0.4, faceH * 0.18, 0, 0, Math.PI);
  ctx.fill();

  // hair on top
  ctx.fillStyle = hairCol;
  const bald = !female && age > 0.6 && rnd() < 0.45;
  ctx.beginPath();
  if (bald) {
    ctx.ellipse(cx - faceW / 2 + 2, cy - 4, 4, 9, 0.2, 0, Math.PI * 2);
    ctx.ellipse(cx + faceW / 2 - 2, cy - 4, 4, 9, -0.2, 0, Math.PI * 2);
  } else {
    ctx.ellipse(cx, cy - faceH / 2 + 7, faceW / 2 + 2, 12 + rnd() * 3, 0, Math.PI, Math.PI * 2);
    ctx.rect(cx - faceW / 2 - 2, cy - faceH / 2 + 6, 5, 14);
    ctx.rect(cx + faceW / 2 - 3, cy - faceH / 2 + 6, 5, 14);
  }
  ctx.fill();
  if (!bald) {
    // parting / fringe
    ctx.beginPath();
    const side = rnd() < 0.5 ? -1 : 1;
    ctx.moveTo(cx - faceW / 2, cy - faceH / 2 + 12);
    ctx.quadraticCurveTo(cx + side * 4, cy - faceH / 2 + 2, cx + faceW / 2, cy - faceH / 2 + 12);
    ctx.lineTo(cx + faceW / 2, cy - faceH / 2 + 4);
    ctx.lineTo(cx - faceW / 2, cy - faceH / 2 + 4);
    ctx.fill();
  }
  if (opts.military && rnd() < 0.7) {
    // peaked cap
    ctx.fillStyle = shade(suit, 0.05);
    ctx.beginPath();
    ctx.ellipse(cx, cy - faceH / 2 + 4, faceW / 2 + 6, 9, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.fillRect(cx - faceW / 2 - 2, cy - faceH / 2 + 3, faceW + 4, 4);
    ctx.fillStyle = '#c9a43a';
    ctx.beginPath();
    ctx.arc(cx, cy - faceH / 2 - 1, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // eyebrows
  const eyeY = cy - 2;
  ctx.strokeStyle = shade(hairCol === '#c9c9c9' ? '#777' : hairCol, -0.1);
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  const browTilt = (rnd() - 0.5) * 3;
  ctx.beginPath();
  ctx.moveTo(cx - 12, eyeY - 5 + browTilt); ctx.lineTo(cx - 4, eyeY - 6);
  ctx.moveTo(cx + 4, eyeY - 6); ctx.lineTo(cx + 12, eyeY - 5 + browTilt);
  ctx.stroke();
  // eyes
  ctx.fillStyle = '#f4f1ea';
  ctx.beginPath();
  ctx.ellipse(cx - 8, eyeY, 3.6, 1.9, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 8, eyeY, 3.6, 1.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pick(['#3b2a1a', '#2a3b4a', '#2f4a2a', '#1a1a1a', '#4a3a2a']);
  ctx.beginPath();
  ctx.arc(cx - 8, eyeY, 1.5, 0, Math.PI * 2);
  ctx.arc(cx + 8, eyeY, 1.5, 0, Math.PI * 2);
  ctx.fill();
  // glasses
  if (rnd() < 0.3) {
    ctx.strokeStyle = rnd() < 0.5 ? '#222' : '#8a7a50';
    ctx.lineWidth = 1.1;
    ctx.strokeRect(cx - 13, eyeY - 4, 10, 7.5);
    ctx.strokeRect(cx + 3, eyeY - 4, 10, 7.5);
    ctx.beginPath();
    ctx.moveTo(cx - 3, eyeY - 1); ctx.lineTo(cx + 3, eyeY - 1);
    ctx.stroke();
  }
  // nose
  ctx.strokeStyle = shade(skin, -0.3);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - 1, eyeY + 2);
  ctx.quadraticCurveTo(cx - 3.5, eyeY + 10, cx - 3, eyeY + 11);
  ctx.quadraticCurveTo(cx, eyeY + 12.5, cx + 3, eyeY + 11);
  ctx.stroke();
  // mouth
  const smile = (rnd() - 0.35) * 3;
  ctx.strokeStyle = female ? '#a44a4a' : shade(skin, -0.4);
  ctx.lineWidth = female ? 2 : 1.4;
  ctx.beginPath();
  ctx.moveTo(cx - 6, eyeY + 17);
  ctx.quadraticCurveTo(cx, eyeY + 17 + smile, cx + 6, eyeY + 17);
  ctx.stroke();
  // facial hair
  if (!female && rnd() < 0.3) {
    ctx.fillStyle = hairCol;
    ctx.globalAlpha = 0.85;
    if (rnd() < 0.5) {
      ctx.beginPath();
      ctx.ellipse(cx, eyeY + 14.5, 7, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx - faceW / 2 + 2, cy + 2);
      ctx.quadraticCurveTo(cx, cy + faceH / 2 + 8, cx + faceW / 2 - 2, cy + 2);
      ctx.quadraticCurveTo(cx, cy + faceH / 2 - 2, cx - faceW / 2 + 2, cy + 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // wrinkles for age
  if (age > 0.6) {
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy - faceH / 2 + 12); ctx.lineTo(cx + 7, cy - faceH / 2 + 12);
    ctx.moveTo(cx - 9, eyeY + 12); ctx.quadraticCurveTo(cx - 11, eyeY + 16, cx - 8, eyeY + 19);
    ctx.moveTo(cx + 9, eyeY + 12); ctx.quadraticCurveTo(cx + 11, eyeY + 16, cx + 8, eyeY + 19);
    ctx.stroke();
  }
  // studio light vignette
  const v = ctx.createRadialGradient(50, 50, 30, 50, 60, 80);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, 100, 118);
  return c;
}

function shade(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  let s = m[1];
  if (s.length === 3) s = s.split('').map((ch) => ch + ch).join('');
  const n = parseInt(s, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))));
  r = f(r); g = f(g); b = f(b);
  return `rgb(${r},${g},${b})`;
}
