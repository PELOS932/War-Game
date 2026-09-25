/**
 * Animated "strategic command" backdrop for the main menu and loading screen:
 * a dot-matrix world map (from world-atlas land outlines) with pulsing
 * hotspots and animated flight/missile arcs, over CSS radar/grid layers.
 */
import { h } from './dom';

interface Hot { lon: number; lat: number }

const HOTSPOTS: Hot[] = [
  { lon: -77, lat: 38.9 }, { lon: 37.6, lat: 55.7 }, { lon: 116.4, lat: 39.9 }, { lon: -0.1, lat: 51.5 },
  { lon: 2.35, lat: 48.85 }, { lon: 77.2, lat: 28.6 }, { lon: 139.7, lat: 35.7 }, { lon: -47.9, lat: -15.8 },
  { lon: 31.2, lat: 30 }, { lon: 51.4, lat: 35.7 }, { lon: 13.4, lat: 52.5 }, { lon: 151.2, lat: -33.9 },
  { lon: 28, lat: -26.2 }, { lon: -99.1, lat: 19.4 }, { lon: 126.9, lat: 37.5 }, { lon: 35.2, lat: 31.8 },
  { lon: 30.5, lat: 50.45 }, { lon: 3.4, lat: 6.5 }, { lon: -58.4, lat: -34.6 }, { lon: 106.8, lat: -6.2 },
];

let landMaskPromise: Promise<HTMLCanvasElement | null> | null = null;

/** Rasterises world land polygons into a 720x360 equirectangular mask. */
function loadLandMask(): Promise<HTMLCanvasElement | null> {
  if (!landMaskPromise) {
    landMaskPromise = (async () => {
      try {
        const [topo, land] = await Promise.all([import('topojson-client'), import('world-atlas/land-110m.json')]);
        const data = (land as { default?: unknown }).default ?? land;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const geo = topo.feature(data as any, (data as any).objects.land) as unknown as GeoJSON.FeatureCollection | GeoJSON.Feature;
        const W = 720;
        const H = 360;
        const c = document.createElement('canvas');
        c.width = W;
        c.height = H;
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        ctx.fillStyle = '#fff';
        const feats = 'features' in geo ? geo.features : [geo];
        for (const f of feats) {
          const g = f.geometry;
          const polys: number[][][][] = g.type === 'Polygon' ? [g.coordinates as number[][][]] : g.type === 'MultiPolygon' ? (g.coordinates as number[][][][]) : [];
          for (const poly of polys) {
            ctx.beginPath();
            for (const ring of poly) {
              ring.forEach(([lon, lat], i) => {
                const x = ((lon + 180) / 360) * W;
                const y = ((90 - lat) / 180) * H;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
              });
              ctx.closePath();
            }
            ctx.fill('evenodd');
          }
        }
        return c;
      } catch (e) {
        console.warn('[ui] world backdrop unavailable', e);
        return null;
      }
    })();
  }
  return landMaskPromise;
}

export interface Backdrop {
  el: HTMLElement;
  destroy(): void;
}

export function createBackdrop(): Backdrop {
  const canvas = h('canvas', { class: 'sc-worlddots' });
  const el = h('div', { class: 'sc-backdrop' },
    h('div', { class: 'sc-rings' }),
    h('div', { class: 'sc-grid3d' }),
    canvas,
    h('div', { class: 'sc-radar' }),
    h('div', { class: 'sc-scan' }),
    h('div', { class: 'sc-vignette' }),
  );
  let alive = true;
  let dots: HTMLCanvasElement | null = null;
  let mask: HTMLCanvasElement | null = null;
  let maskData: Uint8ClampedArray | null = null;
  let W = 0;
  let H = 0;
  // map placement (equirectangular, lat 75..-58)
  let mx = 0;
  let my = 0;
  let mw = 0;
  let mh = 0;
  const LAT_N = 78;
  const LAT_S = -58;
  const proj = (lon: number, lat: number) => ({ x: mx + ((lon + 180) / 360) * mw, y: my + ((LAT_N - lat) / (LAT_N - LAT_S)) * mh });

  interface Arc { a: Hot; b: Hot; t: number; speed: number; hostile: boolean }
  const arcs: Arc[] = [];
  const spawnArc = () => {
    const a = HOTSPOTS[Math.floor(Math.random() * HOTSPOTS.length)];
    let b = HOTSPOTS[Math.floor(Math.random() * HOTSPOTS.length)];
    if (a === b) b = HOTSPOTS[(HOTSPOTS.indexOf(a) + 3) % HOTSPOTS.length];
    arcs.push({ a, b, t: 0, speed: 0.12 + Math.random() * 0.12, hostile: Math.random() < 0.35 });
  };

  const buildDots = () => {
    const r = el.getBoundingClientRect();
    W = Math.max(320, Math.round(r.width));
    H = Math.max(240, Math.round(r.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    mw = W * 1.02;
    mh = mw * ((LAT_N - LAT_S) / 360);
    if (mh > H * 0.95) {
      mh = H * 0.95;
      mw = mh * (360 / (LAT_N - LAT_S));
    }
    mx = (W - mw) / 2;
    my = (H - mh) / 2 + H * 0.04;
    if (!mask || !maskData) return;
    dots = document.createElement('canvas');
    dots.width = canvas.width;
    dots.height = canvas.height;
    const ctx = dots.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    const step = Math.max(5, Math.round(W / 230));
    for (let y = my; y < my + mh; y += step) {
      const lat = LAT_N - ((y - my) / mh) * (LAT_N - LAT_S);
      for (let x = mx; x < mx + mw; x += step) {
        const lon = ((x - mx) / mw) * 360 - 180;
        const px = Math.floor(((lon + 180) / 360) * 720);
        const py = Math.floor(((90 - lat) / 180) * 360);
        if (px < 0 || py < 0 || px >= 720 || py >= 360) continue;
        if (maskData[(py * 720 + px) * 4 + 3] > 100) {
          const edge = Math.sin(x * 0.05 + y * 0.03) * 0.5 + 0.5;
          ctx.fillStyle = `rgba(${110 + edge * 40},${200 + edge * 30},${190 + edge * 30},${0.35 + edge * 0.25})`;
          ctx.fillRect(x, y, step * 0.42, step * 0.42);
        } else if ((Math.round(x / step) + Math.round(y / step)) % 4 === 0) {
          ctx.fillStyle = 'rgba(80,140,150,0.07)';
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  };

  loadLandMask().then((m) => {
    if (!alive || !m) return;
    mask = m;
    const c = m.getContext('2d');
    maskData = c ? c.getImageData(0, 0, 720, 360).data : null;
    buildDots();
  });

  const ro = new ResizeObserver(() => buildDots());
  ro.observe(el);

  let last = performance.now();
  let spawnT = 0;
  const frame = (now: number) => {
    if (!alive) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const ctx = canvas.getContext('2d');
    if (ctx && W > 0) {
      const dpr = canvas.width / W;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (dots) ctx.drawImage(dots, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // hotspots
      const t = now / 1000;
      HOTSPOTS.forEach((p, i) => {
        const q = proj(p.lon, p.lat);
        const ph = (t * 0.6 + i * 0.37) % 1;
        ctx.strokeStyle = `rgba(255,190,80,${(1 - ph) * 0.7})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(q.x, q.y, 3 + ph * 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,200,100,0.95)';
        ctx.beginPath();
        ctx.arc(q.x, q.y, 2, 0, Math.PI * 2);
        ctx.fill();
      });
      // arcs
      spawnT -= dt;
      if (spawnT <= 0 && arcs.length < 7) {
        spawnArc();
        spawnT = 0.9 + Math.random() * 1.4;
      }
      for (let i = arcs.length - 1; i >= 0; i--) {
        const a = arcs[i];
        a.t += dt * a.speed;
        if (a.t > 1.6) {
          arcs.splice(i, 1);
          continue;
        }
        const p0 = proj(a.a.lon, a.a.lat);
        const p1 = proj(a.b.lon, a.b.lat);
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const len = Math.hypot(dx, dy);
        const cx = (p0.x + p1.x) / 2;
        const cy = (p0.y + p1.y) / 2 - len * 0.35;
        const head = Math.min(1, a.t);
        const tail = Math.max(0, a.t - 0.6);
        const col = a.hostile ? '255,90,60' : '120,230,220';
        ctx.lineWidth = 1.4;
        const steps = 40;
        let prev: { x: number; y: number } | null = null;
        for (let s = 0; s <= steps; s++) {
          const u = tail + (head - tail) * (s / steps);
          const x = (1 - u) * (1 - u) * p0.x + 2 * (1 - u) * u * cx + u * u * p1.x;
          const y = (1 - u) * (1 - u) * p0.y + 2 * (1 - u) * u * cy + u * u * p1.y;
          if (prev) {
            ctx.strokeStyle = `rgba(${col},${(s / steps) * 0.85})`;
            ctx.beginPath();
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(x, y);
            ctx.stroke();
          }
          prev = { x, y };
        }
        if (prev && a.t < 1) {
          ctx.fillStyle = `rgba(${col},1)`;
          ctx.beginPath();
          ctx.arc(prev.x, prev.y, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        if (a.t >= 1 && a.t < 1.35) {
          const k = (a.t - 1) / 0.35;
          ctx.strokeStyle = `rgba(${col},${1 - k})`;
          ctx.beginPath();
          ctx.arc(p1.x, p1.y, 4 + k * 22, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  return {
    el,
    destroy() {
      alive = false;
      ro.disconnect();
    },
  };
}
