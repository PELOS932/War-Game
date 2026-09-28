import type { FlagEmblem, FlagSpec } from '../../worldgen/types';

/**
 * Complete canvas painter for FlagSpec (all layouts + emblems), used for the
 * unit-counter atlas. (src/ui/flags.ts currently only paints stripes.)
 */
export function paintFlag(c: CanvasRenderingContext2D, spec: FlagSpec, x: number, y: number, w: number, h: number): void {
  const cols = spec.colors.length ? spec.colors : ['#888'];
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  c.translate(x, y);
  const fill = (col: string) => { c.fillStyle = col; };
  const stripes = (colors: string[], ratios: number[] | undefined, vertical: boolean, x0 = 0, y0 = 0, ww = w, hh = h) => {
    const r = ratios && ratios.length >= colors.length ? ratios.slice(0, colors.length) : colors.map(() => 1);
    const tot = r.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    colors.forEach((col, i) => {
      fill(col);
      if (vertical) c.fillRect(x0 + (acc / tot) * ww, y0, (r[i] / tot) * ww + 0.6, hh);
      else c.fillRect(x0, y0 + (acc / tot) * hh, ww, (r[i] / tot) * hh + 0.6);
      acc += r[i];
    });
  };
  switch (spec.layout) {
    case 'plain':
      fill(cols[0]); c.fillRect(0, 0, w, h);
      break;
    case 'hstripes':
      stripes(cols, spec.ratios, false);
      break;
    case 'vstripes':
      stripes(cols, spec.ratios, true);
      break;
    case 'nordic': {
      fill(cols[0]); c.fillRect(0, 0, w, h);
      const cx = w * 0.36, t = h * 0.22;
      fill(cols[1]); c.fillRect(cx - t / 2, 0, t, h); c.fillRect(0, h / 2 - t / 2, w, t);
      if (cols[2]) { const t2 = t * 0.5; fill(cols[2]); c.fillRect(cx - t2 / 2, 0, t2, h); c.fillRect(0, h / 2 - t2 / 2, w, t2); }
      break;
    }
    case 'cross': {
      fill(cols[0]); c.fillRect(0, 0, w, h);
      const t = h * 0.2;
      fill(cols[1] ?? '#fff'); c.fillRect(w / 2 - t / 2, h * 0.15, t, h * 0.7); c.fillRect(w / 2 - h * 0.35, h / 2 - t / 2, h * 0.7, t);
      break;
    }
    case 'saltire': {
      fill(cols[0]); c.fillRect(0, 0, w, h);
      c.strokeStyle = cols[1] ?? '#fff'; c.lineWidth = h * 0.2;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(w, h); c.moveTo(w, 0); c.lineTo(0, h); c.stroke();
      break;
    }
    case 'union': {
      fill(cols[0]); c.fillRect(0, 0, w, h);
      c.strokeStyle = cols[1] ?? '#fff'; c.lineWidth = h * 0.2;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(w, h); c.moveTo(w, 0); c.lineTo(0, h); c.stroke();
      c.strokeStyle = cols[2] ?? '#c8102e'; c.lineWidth = h * 0.07;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(w, h); c.moveTo(w, 0); c.lineTo(0, h); c.stroke();
      fill(cols[1] ?? '#fff'); c.fillRect(w / 2 - h * 0.17, 0, h * 0.34, h); c.fillRect(0, h / 2 - h * 0.17, w, h * 0.34);
      fill(cols[2] ?? '#c8102e'); c.fillRect(w / 2 - h * 0.1, 0, h * 0.2, h); c.fillRect(0, h / 2 - h * 0.1, w, h * 0.2);
      break;
    }
    case 'canton': {
      const r = spec.ratios;
      let cw = 0.5, ch = 0.5;
      let sr: number[] | undefined = r;
      if (r && r.length === cols.length + 2) { cw = r[r.length - 2]; ch = r[r.length - 1]; sr = r.slice(0, cols.length); }
      stripes(cols, sr, false);
      fill(spec.accent ?? '#003'); c.fillRect(0, 0, w * cw, h * ch);
      break;
    }
    case 'starsStripes': {
      const n = 13;
      for (let i = 0; i < n; i++) { fill(i % 2 ? cols[1] ?? '#fff' : cols[0]); c.fillRect(0, (i * h) / n, w, h / n + 0.6); }
      const cw = w * 0.4, ch = (h * 7) / 13;
      fill(spec.accent ?? '#3c3b6e'); c.fillRect(0, 0, cw, ch);
      fill('#fff');
      for (let j = 0; j < 5; j++) for (let i = 0; i < 6; i++) {
        const sx = cw * (i + 0.5 + (j % 2) * 0.25) / 6.3, sy = ch * (j + 0.5) / 5;
        c.beginPath(); c.arc(sx, sy, Math.max(0.5, ch * 0.045), 0, Math.PI * 2); c.fill();
      }
      break;
    }
    case 'triangle':
    case 'chevron': {
      stripes(cols, spec.ratios, false);
      fill(spec.accent ?? '#000');
      c.beginPath(); c.moveTo(0, 0); c.lineTo(spec.layout === 'triangle' ? w * 0.42 : w * 0.26, h / 2); c.lineTo(0, h); c.closePath(); c.fill();
      break;
    }
    case 'diagonal': {
      fill(cols[0]); c.fillRect(0, 0, w, h);
      fill(cols[1] ?? cols[0]); c.beginPath(); c.moveTo(w, 0); c.lineTo(w, h); c.lineTo(0, h); c.closePath(); c.fill();
      if (spec.accent) { c.strokeStyle = spec.accent; c.lineWidth = h * 0.25; c.beginPath(); c.moveTo(0, h); c.lineTo(w, 0); c.stroke(); }
      break;
    }
    case 'bordered': {
      fill(cols[1] ?? '#fff'); c.fillRect(0, 0, w, h);
      const b = h * 0.09;
      fill(cols[0]); c.fillRect(b, b, w - 2 * b, h - 2 * b);
      break;
    }
    case 'quarters': {
      const q = [cols[0], cols[1] ?? cols[0], cols[2] ?? cols[0], cols[3] ?? cols[1] ?? cols[0]];
      fill(q[0]); c.fillRect(0, 0, w / 2, h / 2);
      fill(q[1]); c.fillRect(w / 2, 0, w / 2, h / 2);
      fill(q[2]); c.fillRect(0, h / 2, w / 2, h / 2);
      fill(q[3]); c.fillRect(w / 2, h / 2, w / 2, h / 2);
      break;
    }
    default:
      stripes(cols, spec.ratios, false);
  }
  for (const e of spec.emblems ?? []) emblem(c, e, w, h);
  c.restore();
}

function starPath(c: CanvasRenderingContext2D, x: number, y: number, r: number, points = 5, inner = 0.42, rot = -Math.PI / 2): void {
  c.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i * Math.PI) / points;
    const rr = i % 2 ? r * inner : r;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
  }
  c.closePath();
}

function emblem(c: CanvasRenderingContext2D, e: FlagEmblem, w: number, h: number): void {
  const x = e.x * w, y = e.y * h, s = e.size * h, r = s / 2;
  c.fillStyle = e.color;
  c.strokeStyle = e.color;
  switch (e.shape) {
    case 'star':
      starPath(c, x, y, r);
      c.fill();
      break;
    case 'circle':
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      break;
    case 'ring':
      c.lineWidth = Math.max(1, s * 0.12); c.beginPath(); c.arc(x, y, r * 0.9, 0, Math.PI * 2); c.stroke();
      break;
    case 'crescent':
    case 'crescentStar': {
      c.save();
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      c.globalCompositeOperation = 'destination-out';
      c.beginPath(); c.arc(x + r * 0.32, y, r * 0.82, 0, Math.PI * 2); c.fill();
      c.restore();
      if (e.shape === 'crescentStar') { starPath(c, x + r * 0.75, y, r * 0.38); c.fill(); }
      break;
    }
    case 'sun': {
      c.beginPath(); c.arc(x, y, r * 0.55, 0, Math.PI * 2); c.fill();
      c.lineWidth = Math.max(0.8, s * 0.07);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        c.beginPath(); c.moveTo(x + Math.cos(a) * r * 0.65, y + Math.sin(a) * r * 0.65); c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); c.stroke();
      }
      break;
    }
    case 'cross': {
      const t = s * 0.22;
      c.fillRect(x - t / 2, y - r, t, s);
      c.fillRect(x - r, y - t / 2, s, t);
      break;
    }
    case 'leaf':
      starPath(c, x, y, r, 11, 0.62);
      c.fill();
      c.fillRect(x - s * 0.04, y + r * 0.4, s * 0.08, r * 0.7);
      break;
    case 'shield':
      c.beginPath();
      c.moveTo(x - r * 0.8, y - r); c.lineTo(x + r * 0.8, y - r); c.lineTo(x + r * 0.8, y); c.quadraticCurveTo(x + r * 0.7, y + r * 0.8, x, y + r);
      c.quadraticCurveTo(x - r * 0.7, y + r * 0.8, x - r * 0.8, y); c.closePath(); c.fill();
      break;
    case 'starRing': {
      const n = e.count ?? 12;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        starPath(c, x + Math.cos(a) * r, y + Math.sin(a) * r, Math.max(0.8, s * 0.09));
        c.fill();
      }
      break;
    }
    case 'wheel': {
      c.lineWidth = Math.max(0.8, s * 0.08);
      c.beginPath(); c.arc(x, y, r * 0.85, 0, Math.PI * 2); c.stroke();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI;
        c.beginPath(); c.moveTo(x - Math.cos(a) * r * 0.85, y - Math.sin(a) * r * 0.85); c.lineTo(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85); c.stroke();
      }
      break;
    }
    case 'triangle': {
      const rot = ((e.count ?? 0) * Math.PI) / 3;
      c.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = rot - Math.PI / 2 + (i * 2 * Math.PI) / 3;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
      }
      c.closePath(); c.fill();
      break;
    }
  }
}
