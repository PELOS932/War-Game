import * as THREE from 'three';
import { box, boxC, cone, cylC, extrudeXY, extrudeXZ, merge, part, sphere, type PartOpts } from '../models/geom';

/**
 * Parametric procedural models for individual equipment designs.
 *
 * Every generator returns a merged low-poly BufferGeometry (vertex colours +
 * `aTint` weight: 1 = recoloured by the nation colour) plus rotor mounts for
 * helicopters. Convention: forward = +x, up = +y, right (starboard) = +z,
 * base at y = 0, overall length ≈ 1 (same frame as ./models.ts).
 *
 * The parameters live in ./modelSpecs.ts (hand-authored table for iconic
 * designs + deterministic derivation for everything else).
 */

type G = THREE.BufferGeometry;
export type P2 = [number, number];
type V3 = [number, number, number];

export const COL = {
  DARK: 0x26292b,
  TRACK: 0x1b1b1a,
  METAL: 0x5d6266,
  STEEL: 0x7b8086,
  GLASS: 0x1c2a36,
  TINT: 0xd8d8d8,
  TINT2: 0xa8a8a8,
  TINT3: 0x7c7c7c,
  OLIVE: 0x56603f,
  NAVY: 0x8a929a,
  NAVY2: 0x6f777f,
  DECK: 0x4a4e52,
  WHITE: 0xe8e8e8,
  RED: 0xb02a20,
  HULLRED: 0x6b2a24,
  SKIN: 0xc49a78,
  RUBBER: 0x2a2c2d,
  YELLOW: 0xc9a227,
  TAN: 0xa8966c,
  BLACK: 0x151617,
  LIGHT: 0xc9ced3,
};

export interface RotorMount { x: number; y: number; z: number; r: number; b: number; dir: number }
export interface BuiltModel { geo: G; rotors: RotorMount[] }

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _d = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** Solid between two plan polygons (x, z) at y0 and y0 + h (sloped sides). Same vertex count. */
export function prismoid(bot: P2[], top: P2[], h: number, y0 = 0): G {
  const n = bot.length;
  const pos: number[] = [];
  const tri = (a: V3, b: V3, c: V3, want: V3) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * want[0] + ny * want[1] + nz * want[2] < 0) pos.push(...a, ...c, ...b);
    else pos.push(...a, ...b, ...c);
  };
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += bot[i][0] * bot[j][1] - bot[j][0] * bot[i][1];
  }
  const s = area >= 0 ? 1 : -1;
  const cap = (pts: P2[], y: number, up: number) => {
    const idx = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []);
    for (const [i, j, k] of idx) tri([pts[i][0], y, pts[i][1]], [pts[j][0], y, pts[j][1]], [pts[k][0], y, pts[k][1]], [0, up, 0]);
  };
  cap(bot, y0, -1);
  cap(top, y0 + h, 1);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ex = bot[j][0] - bot[i][0], ez = bot[j][1] - bot[i][1];
    const want: V3 = [ez * s, 0, -ex * s];
    const a: V3 = [bot[i][0], y0, bot[i][1]], b: V3 = [bot[j][0], y0, bot[j][1]];
    const c: V3 = [top[j][0], y0 + h, top[j][1]], d: V3 = [top[i][0], y0 + h, top[i][1]];
    tri(a, b, c, want);
    tri(a, c, d, want);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** Plan polygon inset toward its centroid (sx, sz scale) and shifted. */
function inset(pts: P2[], sx: number, sz: number, dx = 0): P2[] {
  let cx = 0;
  for (const p of pts) cx += p[0];
  cx /= pts.length;
  return pts.map(([x, z]) => [cx + (x - cx) * sx + dx, z * sz]);
}

/** Axisymmetric body along x from a profile of [x, radius] (x ascending). */
export function lathe(prof: P2[], seg = 10, phase = 0): G {
  const pts = prof.map(([x, r]) => new THREE.Vector2(Math.max(r, 0.0004), x));
  const g = new THREE.LatheGeometry(pts, seg, phase);
  g.rotateZ(-Math.PI / 2);
  return g;
}

/** Thin plate from a plan polygon, centred on y = 0. */
function plate(pts: P2[], t: number): G {
  return extrudeXZ(pts, t).translate(0, -t / 2, 0);
}
const mir = (pts: P2[]): P2[] => pts.map(([x, z]) => [x, -z] as P2);
const rect = (x0: number, x1: number, z0: number, z1: number): P2[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

class Kit {
  parts: G[] = [];
  rotors: RotorMount[] = [];
  add(g: G, c: number, o: PartOpts = {}): void { this.parts.push(part(g, c, o)); }
  tint(g: G, c: number = COL.TINT, o: PartOpts = {}): void { this.parts.push(part(g, c, { ...o, tint: 1 })); }
  /** Cylinder from a to b. */
  tube(a: V3, b: V3, r0: number, r1: number, c: number, seg = 8, tint = 0): void {
    _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = _d.length();
    if (len < 1e-5) return;
    _q.setFromUnitVectors(_up, _d.multiplyScalar(1 / len));
    _e.setFromQuaternion(_q);
    this.parts.push(part(cylC(r1, r0, len, seg), c, { tint, pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rot: [_e.x, _e.y, _e.z] }));
  }
  /** Box oriented along a→b (length) with cross-section w (z-ish) × h. */
  beam(a: V3, b: V3, w: number, h: number, c: number, tint = 0): void {
    _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = _d.length();
    if (len < 1e-5) return;
    _q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), _d.multiplyScalar(1 / len));
    _e.setFromQuaternion(_q);
    this.parts.push(part(boxC(len, h, w), c, { tint, pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rot: [_e.x, _e.y, _e.z] }));
  }
  done(): BuiltModel {
    const geo = merge(this.parts);
    this.parts = [];
    return { geo, rotors: this.rotors };
  }
}

// ===========================================================================
// Ground vehicles (tracked / wheeled / truck-based systems)
// ===========================================================================
export interface Turret {
  /** ang: angular welded/composite; dome: cast Soviet dome; ifv: small IFV turret; rws: remote weapon station;
   *  sph: large howitzer turret; aa: SPAAG gun turret with radars; unm: low unmanned turret (T-14). */
  t: 'ang' | 'dome' | 'ifv' | 'rws' | 'sph' | 'aa' | 'unm';
  x?: number; w: number; l: number; h: number;
  /** 0 flat front … 1 arrow-pointed front (plan). */
  nose?: number;
  /** Top inset (sloped faces) 0…0.35. */
  taper?: number;
  /** Rear bustle length (fraction of l). */
  bustle?: number;
  gun?: number; gr?: number; fume?: boolean; brake?: boolean; elev?: number;
  /** Leopard 2A5+ style spaced wedge armour. */
  wedge?: boolean;
  /** ERA: 1 = chevron/Kontakt blocks on front, 2 = heavy (Relikt) incl. sides. */
  era?: number;
  aps?: boolean; rws?: boolean; shtora?: boolean;
  atgm?: 'side' | 'top' | 'twin' | 'pods';
  radar?: 'dish' | 'panel' | 'both';
  sight?: boolean;
  /** Lateral offset (Puma / Namer style offset turrets). */
  z?: number;
}

export type Payload =
  | { k: 'mlrs'; pods: number; rows: number; cols: number; l: number; a: number; open?: boolean; tr?: number }
  | { k: 'sam'; s: 'box' | 'tubes' | 'rails' | 'turret' | 'cells' | 'pods' | 'vls'; n: number; l: number; r: number; a: number; rad?: boolean }
  | { k: 'radar'; s: 'panel' | 'rot' | 'dish' | 'mast'; w: number; h: number; a?: number }
  | { k: 'tel'; l: number; r: number; a: number; can?: boolean; stages?: number; n?: number }
  | { k: 'can'; n: number; rows?: number; l: number; r: number; a: number; round?: boolean }
  | { k: 'gun'; l: number; turret?: boolean }
  | { k: 'cargo'; h: number; canvas?: boolean }
  | { k: 'mortar'; l: number };

export interface VehSpec {
  g: 'veh';
  ch: 'tracked' | 'wheeled' | 'truck';
  L: number; W: number; H: number;
  /** Road wheels per side (tracked) or axles (wheeled/truck). */
  n?: number;
  wr?: number;
  /** 0 none, 1 side skirts, 2 heavy ERA skirts. */
  skirt?: number;
  nose?: 'glacis' | 'wedge' | 'blunt' | 'boat' | 'front' | 'hood' | 'v';
  /** Glacis length (fraction of L). */
  nl?: number;
  /** Hull top height at the rear (APCs with raised troop compartment / pickups). */
  rearH?: number;
  clr?: number;
  cab?: 'flat' | 'bonnet' | 'maz' | 'armored';
  cabL?: number; cabH?: number;
  tur?: Turret;
  pay?: Payload;
  /** Extras: era, drums, dozer, plough, crane, mast, rack, ramp, spare, slat, smoke, cage, lmg, gate. */
  add?: string[];
}

function wheel(k: Kit, x: number, y: number, z: number, r: number, w: number, hub = true): void {
  k.add(cylC(r, r, w, 10), COL.RUBBER, { pos: [x, y, z], rot: [Math.PI / 2, 0, 0] });
  if (hub) k.add(cylC(r * 0.5, r * 0.5, w + 0.006, 6), COL.METAL, { pos: [x, y, z], rot: [Math.PI / 2, 0, 0] });
}

function buildTurret(k: Kit, t: Turret, hx: number, baseY: number, W: number): void {
  const x0 = hx + (t.x ?? 0);
  const tz = t.z ?? 0;
  const { w, l, h } = t;
  const hw = w / 2, lf = l / 2, lr = -l / 2;
  const nose = t.nose ?? 0.2;
  const taper = t.taper ?? 0.1;
  let gunY = baseY + h * 0.55;
  let frontX = x0 + lf;
  const gunL = t.gun ?? 0;
  const gr = t.gr ?? 0.02;
  switch (t.t) {
    case 'ang':
    case 'sph':
    case 'ifv':
    case 'unm': {
      const fw = hw * (1 - nose * 0.88);
      const bot: P2[] = [[lf, -fw], [lf, fw], [lf - l * 0.3, hw], [lr, hw * 0.93], [lr, -hw * 0.93], [lf - l * 0.3, -hw]];
      const fb = taper * l * 1.4;
      const top: P2[] = bot.map(([x, z]) => [x > 0 ? x - fb * (x / lf) : x * (1 - taper * 0.3), z * (1 - taper * 1.1)] as P2);
      k.tint(prismoid(bot, top, h), t.t === 'sph' ? COL.TINT : COL.TINT, { pos: [x0, baseY, tz] });
      if (t.t === 'sph') gunY = baseY + h * 0.5;
      frontX = x0 + lf - fb * 0.4;
      if (t.bustle) {
        const bl = l * t.bustle;
        k.tint(prismoid(rect(-bl, 0, -hw * 0.82, hw * 0.82), rect(-bl * 0.92, 0, -hw * 0.78, hw * 0.78), h * 0.78), COL.TINT2, { pos: [x0 + lr + 0.005, baseY + h * 0.08, tz] });
      }
      if (t.wedge) {
        for (const s of [1, -1]) {
          const pts: P2[] = [[lf - l * 0.34, hw * 1.03], [lf + l * 0.36, fw + 0.014], [lf, fw + 0.004], [lf - l * 0.3, fw]];
          const pp = s > 0 ? pts : mir(pts);
          k.tint(prismoid(pp, inset(pp, 0.85, 0.96, -l * 0.04), h * 0.86), COL.TINT, { pos: [x0, baseY + h * 0.08, tz] });
        }
      }
      if (t.t === 'unm') {
        // Sensor blocks on the roof corners and a low profile.
        for (const s of [1, -1]) k.add(box(l * 0.16, h * 0.4, w * 0.12), COL.DARK, { pos: [x0 + lf - l * 0.35, baseY + h, tz + s * hw * 0.62] });
      }
      if (t.t === 'sph') {
        k.add(box(l * 0.1, h * 0.35, w * 0.18), COL.DARK, { pos: [x0 - l * 0.1, baseY + h, tz + hw * 0.5] });
      }
      break;
    }
    case 'dome': {
      const g = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      k.tint(g, COL.TINT, { pos: [x0, baseY, tz], scale: [lf, h, hw] });
      frontX = x0 + lf * 0.82;
      gunY = baseY + h * 0.42;
      if (t.bustle) k.tint(box(l * t.bustle, h * 0.55, w * 0.62), COL.TINT2, { pos: [x0 + lr - l * t.bustle * 0.3, baseY + h * 0.12, tz] });
      break;
    }
    case 'rws': {
      k.tint(box(l, h, w), COL.TINT2, { pos: [x0, baseY, tz] });
      k.add(box(l * 0.35, h * 0.6, w * 0.4), COL.DARK, { pos: [x0 + l * 0.1, baseY + h, tz + hw * 0.3] });
      frontX = x0 + lf;
      gunY = baseY + h * 0.6;
      break;
    }
    case 'aa': {
      k.tint(prismoid(rect(lr, lf, -hw, hw), rect(lr * 0.95, lf * 0.7, -hw * 0.85, hw * 0.85), h), COL.TINT, { pos: [x0, baseY, tz] });
      // Twin guns on the turret sides.
      for (const s of [1, -1]) {
        k.add(box(l * 0.35, h * 0.5, w * 0.14), COL.TINT2, { tint: 1, pos: [x0 + lf * 0.2, baseY + h * 0.35, tz + s * (hw + w * 0.07)] });
        k.tube([x0 + lf * 0.3, baseY + h * 0.6, tz + s * (hw + w * 0.07)], [x0 + lf * 0.3 + (gunL || 0.45) * Math.cos(0.25), baseY + h * 0.6 + (gunL || 0.45) * Math.sin(0.25), tz + s * (hw + w * 0.07)], gr, gr * 0.8, COL.DARK, 6);
      }
      const rad = t.radar ?? 'both';
      if (rad === 'dish' || rad === 'both') {
        k.add(cylC(0.012, 0.012, 0.08, 5), COL.METAL, { pos: [x0 - lf * 0.5, baseY + h + 0.04, tz] });
        k.add(box(0.03, 0.08, w * 0.9), COL.LIGHT, { pos: [x0 - lf * 0.5, baseY + h + 0.08, tz], rot: [0, 0, 0.3] });
      }
      if (rad === 'panel' || rad === 'both') {
        k.add(cylC(w * 0.16, w * 0.16, 0.02, 10), COL.LIGHT, { pos: [x0 + lf * 0.9, baseY + h * 0.7, tz], rot: [0, 0, Math.PI / 2] });
      }
      return;
    }
  }
  if (t.era) {
    // Chevron ERA blocks on the turret front.
    const rows = t.era >= 2 ? 3 : 2;
    for (const s of [1, -1]) {
      for (let i = 0; i < rows; i++) {
        const zz = tz + s * (0.05 + i * w * 0.12);
        k.tint(box(l * 0.16, h * 0.28, w * 0.11), COL.TINT2, { pos: [frontX - 0.02 - i * l * 0.06, baseY + h * (t.t === 'dome' ? 0.55 : 0.72), zz], rot: [0, s * 0.45, 0] });
      }
    }
    if (t.era >= 2) for (const s of [1, -1]) k.tint(box(l * 0.55, h * 0.5, 0.02), COL.TINT2, { pos: [x0 + l * 0.05, baseY + h * 0.25, tz + s * hw * 1.02] });
  }
  if (gunL > 0) {
    const el = t.elev ?? 0;
    const gx0 = frontX - 0.02;
    const ex = gx0 + gunL * Math.cos(el), ey = gunY + gunL * Math.sin(el);
    k.add(box(0.05, h * 0.42, Math.max(0.06, w * 0.2)), COL.TINT2, { tint: 1, pos: [frontX, gunY - h * 0.21, tz] });
    k.tube([gx0, gunY, tz], [ex, ey, tz], gr * 1.15, gr, COL.DARK, 8);
    if (t.fume) {
      const f = 0.45;
      k.tube([gx0 + (ex - gx0) * f, gunY + (ey - gunY) * f, tz], [gx0 + (ex - gx0) * (f + 0.1), gunY + (ey - gunY) * (f + 0.1), tz], gr * 1.6, gr * 1.6, COL.DARK, 8);
    }
    if (t.brake) k.add(boxC(0.06, gr * 2.6, gr * 3.2), COL.DARK, { pos: [ex, ey, tz], rot: [0, 0, el] });
  }
  if (t.shtora) for (const s of [1, -1]) k.add(box(0.05, h * 0.3, 0.05), 0x5a1512, { pos: [frontX - 0.02, baseY + h * 0.42, tz + s * w * 0.3] });
  if (t.aps) for (const s of [1, -1]) k.add(box(0.07, h * 0.45, 0.025), COL.DARK, { pos: [x0 + l * 0.12, baseY + h * 0.35, tz + s * (hw + 0.012)] });
  if (t.rws) {
    k.add(box(0.07, 0.04, 0.06), COL.DARK, { pos: [x0 - l * 0.08, baseY + h, tz - hw * 0.4] });
    k.tube([x0 - l * 0.08, baseY + h + 0.035, tz - hw * 0.4], [x0 + 0.06, baseY + h + 0.035, tz - hw * 0.4], 0.007, 0.007, COL.DARK, 4);
  }
  if (t.sight !== false && (t.t === 'ang' || t.t === 'dome')) k.add(box(0.05, 0.05, 0.05), COL.DARK, { pos: [x0 - l * 0.05, baseY + h * (t.t === 'dome' ? 0.85 : 1), tz + hw * 0.45] });
  if (t.atgm) {
    if (t.atgm === 'side') k.tint(box(l * 0.45, h * 0.6, 0.06), COL.TINT2, { pos: [x0 - l * 0.05, baseY + h * 0.3, tz - hw - 0.03] });
    else if (t.atgm === 'twin') for (const s of [1, -1]) k.add(cylC(0.022, 0.022, l * 0.6, 6), COL.OLIVE, { pos: [x0, baseY + h * 0.6, tz + s * (hw + 0.025)], rot: [0, 0, Math.PI / 2] });
    else if (t.atgm === 'pods') for (const s of [1, -1]) k.tint(box(l * 0.5, h * 0.7, 0.08), COL.TINT2, { pos: [x0, baseY + h * 0.2, tz + s * (hw + 0.04)] });
    else k.add(cylC(0.02, 0.02, l * 0.7, 6), COL.OLIVE, { pos: [x0, baseY + h + 0.025, tz], rot: [0, 0, Math.PI / 2] });
  }
  void W;
}

function buildPayload(k: Kit, p: Payload, x0: number, x1: number, y: number, W: number): void {
  const mx = (x0 + x1) / 2;
  const len = x1 - x0;
  switch (p.k) {
    case 'mlrs': {
      const pw = Math.min(W * 0.9 / p.pods, p.cols * (p.tr ?? 0.045) * 1.15);
      const ph = p.rows * (p.tr ?? 0.045) * 1.15;
      k.add(box(len * 0.5, 0.04, W * 0.6), COL.METAL, { pos: [mx, y, 0] });
      for (let i = 0; i < p.pods; i++) {
        const z = (i - (p.pods - 1) / 2) * pw * 1.05;
        const cx = mx - p.l * 0.1, cy = y + 0.04 + ph / 2 + Math.sin(p.a) * p.l * 0.35;
        if (p.open) {
          const tr = (p.tr ?? 0.045) * 0.5;
          for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) {
            const zz = z + (c - (p.cols - 1) / 2) * tr * 2.1;
            const yy = cy + (r - (p.rows - 1) / 2) * tr * 2.1;
            const dx = Math.cos(p.a) * p.l / 2, dy = Math.sin(p.a) * p.l / 2;
            k.tube([cx - dx, yy - dy, zz], [cx + dx, yy + dy, zz], tr, tr, r % 2 ? COL.DARK : COL.OLIVE, 6, 0);
          }
          k.tint(boxC(p.l * 0.2, ph * 1.05, pw * 1.02), COL.TINT2, { pos: [cx + Math.cos(p.a) * p.l * 0.3, cy + Math.sin(p.a) * p.l * 0.3, z], rot: [0, 0, p.a] });
          k.tint(boxC(p.l * 0.2, ph * 1.05, pw * 1.02), COL.TINT2, { pos: [cx - Math.cos(p.a) * p.l * 0.3, cy - Math.sin(p.a) * p.l * 0.3, z], rot: [0, 0, p.a] });
        } else {
          k.tint(boxC(p.l, ph, pw), COL.TINT2, { pos: [cx, cy, z], rot: [0, 0, p.a] });
          k.add(boxC(0.01, ph * 0.86, pw * 0.86), COL.DARK, { pos: [cx + Math.cos(p.a) * p.l / 2, cy + Math.sin(p.a) * p.l / 2, z], rot: [0, 0, p.a] });
        }
      }
      break;
    }
    case 'sam': {
      if (p.s === 'turret') {
        // Tor-style box turret with vertical missile module and radars.
        k.add(cylC(W * 0.3, W * 0.34, 0.03, 10), COL.METAL, { pos: [mx, y + 0.015, 0] });
        k.tint(prismoid(rect(-len * 0.3, len * 0.3, -W * 0.36, W * 0.36), rect(-len * 0.28, len * 0.22, -W * 0.3, W * 0.3), 0.18), COL.TINT, { pos: [mx, y + 0.03, 0] });
        k.add(box(0.04, 0.12, W * 0.55), COL.LIGHT, { pos: [mx - len * 0.2, y + 0.22, 0], rot: [0, 0, 0.3] });
        k.add(cylC(0.05, 0.05, 0.02, 10), COL.LIGHT, { pos: [mx + len * 0.3, y + 0.14, 0], rot: [0, 0, Math.PI / 2] });
        if (p.rad) for (const s of [1, -1]) {
          // Pantsir-style twin guns.
          k.tube([mx + len * 0.05, y + 0.12, s * W * 0.42], [mx + len * 0.05 + 0.3, y + 0.16, s * W * 0.42], 0.012, 0.01, COL.DARK, 5);
          k.tint(box(len * 0.4, 0.06, 0.07), COL.TINT2, { pos: [mx - len * 0.05, y + 0.14, s * W * 0.45], rot: [0, 0, 0.2] });
        }
        break;
      }
      if (p.s === 'rails') {
        k.add(cylC(W * 0.32, W * 0.36, 0.04, 10), COL.METAL, { pos: [mx, y + 0.02, 0] });
        k.tint(box(len * 0.5, 0.08, W * 0.5), COL.TINT2, { pos: [mx, y + 0.04, 0] });
        k.add(box(0.05, 0.12, W * 0.45), COL.LIGHT, { pos: [mx + len * 0.26, y + 0.08, 0] });
        for (let i = 0; i < p.n; i++) {
          const z = (i - (p.n - 1) / 2) * W * 0.18;
          const ax = mx - p.l * 0.45 * Math.cos(p.a), ay = y + 0.14;
          k.tube([ax, ay, z], [ax + p.l * Math.cos(p.a), ay + p.l * Math.sin(p.a), z], p.r, p.r, COL.WHITE, 7);
          k.add(cone(p.r, p.r * 3, 7), COL.WHITE, { pos: [ax + p.l * Math.cos(p.a), ay + p.l * Math.sin(p.a), z], rot: [0, 0, p.a - Math.PI / 2] });
        }
        break;
      }
      if (p.s === 'vls') {
        k.tint(box(len * 0.8, 0.22, W * 0.8), COL.TINT2, { pos: [mx, y, 0] });
        k.add(box(len * 0.7, 0.01, W * 0.7), COL.DARK, { pos: [mx, y + 0.22, 0] });
        break;
      }
      if (p.s === 'pods') {
        k.tint(box(0.12, 0.1, 0.12), COL.TINT2, { pos: [mx, y, 0] });
        for (const s of [1, -1]) {
          k.tint(boxC(p.l, p.r * 4, p.r * 4), COL.TINT, { pos: [mx, y + 0.1, s * (0.06 + p.r * 2)], rot: [0, 0, p.a] });
          k.add(boxC(0.01, p.r * 3.6, p.r * 3.6), COL.DARK, { pos: [mx + p.l / 2 * Math.cos(p.a), y + 0.1 + p.l / 2 * Math.sin(p.a), s * (0.06 + p.r * 2)], rot: [0, 0, p.a] });
        }
        break;
      }
      // Canister launchers raised at angle a (pivot at the rear of the deck).
      const n = p.n;
      const across = p.s === 'box' || p.s === 'cells' ? Math.min(n, 2) : n;
      const up = p.s === 'box' || p.s === 'cells' ? Math.ceil(n / across) : 1;
      const cw = p.r * 2.1;
      const px = x0 + 0.04, py = y + 0.05;
      k.add(box(len * 0.6, 0.05, W * 0.8), COL.METAL, { pos: [mx, y, 0] });
      const dx = Math.cos(p.a), dy = Math.sin(p.a);
      for (let j = 0; j < up; j++) for (let i = 0; i < across; i++) {
        const z = (i - (across - 1) / 2) * cw * (p.s === 'cells' ? 1.4 : 1.05);
        const off = (j + 0.5) * cw * (p.s === 'cells' ? 1.4 : 1.05);
        // Offset perpendicular to the launch direction.
        const ox = -dy * off, oy = dx * off;
        const a: V3 = [px + ox, py + oy, z], b: V3 = [px + ox + dx * p.l, py + oy + dy * p.l, z];
        if (p.s === 'tubes') {
          k.tube(a, b, p.r, p.r, COL.TINT2, 10, 1);
          k.add(cylC(p.r * 0.92, p.r * 0.92, 0.008, 10), COL.DARK, { pos: b, rot: [0, 0, p.a - Math.PI / 2] });
        } else {
          k.beam(a, b, cw * (p.s === 'cells' ? 1.4 : 1), cw * (p.s === 'cells' ? 1.4 : 1), COL.TINT2, 1);
          k.beam([b[0] - dx * 0.004, b[1] - dy * 0.004, z], [b[0] + dx * 0.004, b[1] + dy * 0.004, z], cw * 0.85, cw * 0.85, p.s === 'cells' ? 0x3a3a3a : COL.DARK);
        }
      }
      k.beam([px, py, 0], [px + dx * p.l * 0.6, py + dy * p.l * 0.6, 0], 0.02, 0.02, COL.METAL);
      break;
    }
    case 'radar': {
      const a = p.a ?? 0.35;
      if (p.s === 'panel') {
        k.tint(box(len * 0.5, 0.1, W * 0.8), COL.TINT2, { pos: [mx, y, 0] });
        k.add(boxC(0.04, p.h, p.w), COL.LIGHT, { pos: [mx + 0.02, y + 0.1 + p.h * 0.45, 0], rot: [0, 0, a] });
        k.add(boxC(0.005, p.h * 0.9, p.w * 0.9), 0x3b4148, { pos: [mx + 0.042, y + 0.1 + p.h * 0.45 + 0.004, 0], rot: [0, 0, a] });
      } else if (p.s === 'dish') {
        k.tint(box(len * 0.5, 0.12, W * 0.8), COL.TINT2, { pos: [mx, y, 0] });
        k.add(cylC(0.01, 0.015, 0.1, 5), COL.METAL, { pos: [mx, y + 0.17, 0] });
        k.add(new THREE.SphereGeometry(p.w / 2, 12, 4, 0, Math.PI * 2, 0, 0.9), COL.LIGHT, { pos: [mx, y + 0.24, 0], rot: [0, 0, Math.PI / 2 + 0.5] });
      } else if (p.s === 'mast') {
        k.tint(box(len * 0.6, 0.14, W * 0.85), COL.TINT2, { pos: [mx, y, 0] });
        k.add(cylC(0.012, 0.018, p.h, 5), COL.METAL, { pos: [mx, y + 0.14 + p.h / 2, 0] });
        k.add(boxC(0.03, 0.06, p.w), COL.LIGHT, { pos: [mx, y + 0.14 + p.h, 0] });
      } else {
        k.tint(box(len * 0.55, 0.12, W * 0.8), COL.TINT2, { pos: [mx, y, 0] });
        k.add(cylC(0.012, 0.012, 0.08, 5), COL.METAL, { pos: [mx, y + 0.16, 0] });
        k.add(boxC(0.03, p.h, p.w), COL.LIGHT, { pos: [mx, y + 0.2 + p.h / 2, 0], rot: [0, 0, 0.25] });
      }
      break;
    }
    case 'tel': {
      const n = p.n ?? 1;
      const dx = Math.cos(p.a), dy = Math.sin(p.a);
      const px = x0 + 0.02, py = y + p.r + 0.02;
      k.tint(box(len * 0.95, 0.03, W * 0.7), COL.TINT2, { pos: [mx, y, 0] });
      for (let i = 0; i < n; i++) {
        const z = (i - (n - 1) / 2) * p.r * 2.4;
        const bx = px + dx * p.l, by = py + dy * p.l;
        if (p.can) {
          k.tube([px, py, z], [bx, by, z], p.r, p.r, COL.TINT2, 12, 1);
          k.add(cylC(p.r * 0.95, p.r * 0.95, 0.01, 12), COL.DARK, { pos: [bx, by, z], rot: [0, 0, p.a - Math.PI / 2] });
        } else {
          const cl = p.r * 3.2;
          k.tube([px, py, z], [bx - dx * cl, by - dy * cl, z], p.r, p.r, 0xdfe2e4, 10);
          k.add(cone(p.r, cl, 10), p.stages && p.stages > 2 ? 0x3c4046 : COL.RED, { pos: [bx - dx * cl, by - dy * cl, z], rot: [0, 0, p.a - Math.PI / 2] });
          const st = p.stages ?? 1;
          for (let s = 1; s < st; s++) {
            const f = s / st * (1 - cl / p.l);
            k.tube([px + dx * p.l * f - dx * 0.005, py + dy * p.l * f - dy * 0.005, z], [px + dx * p.l * f + dx * 0.005, py + dy * p.l * f + dy * 0.005, z], p.r * 1.04, p.r * 1.04, COL.DARK, 10);
          }
          for (const fz of [1, -1]) k.add(box(0.05, 0.004, p.r * 1.2), COL.DARK, { pos: [px + dx * 0.03, py + dy * 0.03, z + fz * p.r * 0.9] });
        }
      }
      if (p.a > 0.05) k.beam([px + dx * p.l * 0.4, py + dy * p.l * 0.4 - p.r, 0], [px + dx * p.l * 0.2 + 0.1, y + 0.02, 0], 0.03, 0.03, COL.METAL);
      break;
    }
    case 'can': {
      const rows = p.rows ?? 1;
      const across = Math.ceil(p.n / rows);
      const dx = Math.cos(p.a), dy = Math.sin(p.a);
      const px = x0 + 0.03, py = y + 0.05;
      k.add(box(len * 0.7, 0.05, W * 0.8), COL.METAL, { pos: [mx, y, 0] });
      const cw = p.r * 2.1;
      for (let j = 0; j < rows; j++) for (let i = 0; i < across; i++) {
        const z = (i - (across - 1) / 2) * cw * 1.05;
        const off = (j + 0.5) * cw * 1.05;
        const a: V3 = [px - dy * off, py + dx * off, z], b: V3 = [a[0] + dx * p.l, a[1] + dy * p.l, z];
        if (p.round) k.tube(a, b, p.r, p.r, COL.TINT2, 10, 1);
        else k.beam(a, b, cw, cw, COL.TINT2, 1);
      }
      break;
    }
    case 'gun': {
      if (p.turret) {
        k.tint(prismoid(rect(-len * 0.25, len * 0.25, -W * 0.45, W * 0.45), rect(-len * 0.23, len * 0.15, -W * 0.4, W * 0.4), 0.2), COL.TINT, { pos: [x0 + len * 0.3, y, 0] });
        k.tube([x0 + len * 0.5, y + 0.12, 0], [x0 + len * 0.5 + p.l, y + 0.17, 0], 0.022, 0.018, COL.DARK);
        k.add(boxC(0.05, 0.05, 0.06), COL.DARK, { pos: [x0 + len * 0.5 + p.l, y + 0.17, 0] });
      } else {
        k.add(box(len * 0.4, 0.06, W * 0.55), COL.METAL, { pos: [x0 + len * 0.25, y, 0] });
        k.tint(box(0.12, 0.08, 0.12), COL.TINT2, { pos: [x0 + len * 0.2, y + 0.05, 0] });
        k.tube([x0 + 0.02, y + 0.12, 0], [x0 + 0.02 + p.l, y + 0.2, 0], 0.02, 0.017, COL.DARK);
        k.add(boxC(0.05, 0.045, 0.055), COL.DARK, { pos: [x0 + 0.02 + p.l, y + 0.2, 0] });
        k.add(box(0.02, 0.1, W * 0.7), COL.METAL, { pos: [x0 - 0.01, y - 0.1, 0], rot: [0, 0, -0.4] });
      }
      break;
    }
    case 'cargo': {
      k.tint(box(len * 0.96, p.h, W * 0.92), p.canvas ? COL.TINT2 : COL.TINT, { pos: [mx, y, 0] });
      if (p.canvas) for (let i = 0; i < 3; i++) k.add(box(0.012, p.h + 0.006, W * 0.93), COL.TINT3, { pos: [x0 + len * (0.2 + i * 0.3), y, 0] });
      break;
    }
    case 'mortar': {
      k.add(box(len * 0.4, 0.04, W * 0.4), COL.METAL, { pos: [mx, y, 0] });
      k.tube([mx - 0.05, y + 0.04, 0], [mx - 0.05 + p.l * Math.cos(1.0), y + 0.04 + p.l * Math.sin(1.0), 0], 0.025, 0.022, COL.DARK);
      break;
    }
  }
}

export function vehicle(s: VehSpec): BuiltModel {
  const k = new Kit();
  const { L, W, H } = s;
  const xf = L / 2, xr = -L / 2;
  const add = new Set(s.add ?? []);
  let deckX0 = xr + 0.02, deckX1 = xf - 0.05, deckY = H;
  let hullTopX = 0;
  if (s.ch === 'tracked') {
    const th = clamp(Math.min(H * 0.62, 0.15), 0.08, 0.15);
    const clr = s.clr ?? 0.05;
    const tw = W * 0.2;
    const wr = s.wr ?? th * 0.42;
    const n = s.n ?? 6;
    // Tracks.
    const tp: P2[] = [[xr + 0.01, th * 0.5], [xr + 0.07, 0], [xf - 0.1, 0], [xf, th * 0.62], [xf - 0.03, th], [xr + 0.02, th * 0.96]];
    for (const z of [1, -1]) {
      k.add(extrudeXY(tp, tw), COL.TRACK, { pos: [0, 0, z * (W / 2 - tw / 2)] });
      for (let i = 0; i < n; i++) {
        const x = xr + 0.1 + ((xf - 0.16) - (xr + 0.1)) * (n === 1 ? 0.5 : i / (n - 1));
        k.add(cylC(wr, wr, 0.014, 10), 0x3b3e3c, { pos: [x, wr + 0.004, z * (W / 2 + 0.002)], rot: [Math.PI / 2, 0, 0] });
      }
      k.add(cylC(wr * 0.7, wr * 0.7, 0.014, 8), 0x3b3e3c, { pos: [xf - 0.06, th * 0.62, z * (W / 2 + 0.002)], rot: [Math.PI / 2, 0, 0] });
    }
    // Lower hull between the tracks.
    const lowP: P2[] = [[xr + 0.03, clr], [xf - 0.12, clr], [xf - 0.02, th], [xr, th]];
    k.tint(extrudeXY(lowP, W - tw * 2 + 0.01), COL.TINT3);
    // Upper hull (over the tracks).
    const nl = (s.nl ?? 0.2) * L;
    const rearH = s.rearH ?? H;
    let up: P2[];
    switch (s.nose ?? 'glacis') {
      case 'wedge': up = [[xr, th], [xf, th], [xf, th + (H - th) * 0.15], [xf - nl, H], [xr + 0.02, rearH], [xr, rearH - 0.03]]; break;
      case 'blunt': up = [[xr, th], [xf - 0.01, th], [xf, H - 0.03], [xf - 0.04, H], [xr + 0.02, rearH], [xr, rearH - 0.03]]; break;
      case 'boat': up = [[xr, th], [xf - 0.02, th], [xf, th + (H - th) * 0.45], [xf - nl, H], [xr + 0.02, rearH], [xr, rearH - 0.03]]; break;
      case 'front': up = [[xr, th], [xf - 0.01, th], [xf, th + (H - th) * 0.35], [xf - nl, H], [xr + 0.01, rearH], [xr, rearH - 0.05]]; break;
      default: up = [[xr, th], [xf - 0.02, th], [xf, th + (H - th) * 0.35], [xf - nl, H], [xr + 0.02, rearH], [xr, rearH - 0.03]];
    }
    k.tint(extrudeXY(up, W + 0.004), COL.TINT2);
    hullTopX = xf - nl;
    if (s.skirt) {
      for (const z of [1, -1]) {
        k.tint(box(L * 0.84, th * 0.55, 0.012), COL.TINT2, { pos: [0.0, th * 0.48, z * (W / 2 + 0.01)] });
        if (s.skirt >= 2) for (let i = 0; i < 5; i++) k.tint(box(L * 0.13, th * 0.4, 0.012), COL.TINT3, { pos: [xf - 0.15 - i * L * 0.15, th * 0.52, z * (W / 2 + 0.018)] });
      }
    }
    deckX1 = hullTopX;
    deckY = Math.max(H, rearH);
  } else {
    const wr = s.wr ?? (s.ch === 'truck' ? 0.075 : 0.085);
    const n = s.n ?? (s.ch === 'truck' ? 3 : 4);
    const clr = s.clr ?? wr * 1.15;
    const tyreW = s.ch === 'truck' ? 0.06 : 0.07;
    const wz = W / 2 - tyreW / 2 + 0.01;
    const cabL = s.cabL ?? (s.ch === 'truck' ? 0.22 : 0);
    // Axle positions.
    const xs: number[] = [];
    if (s.ch === 'truck' && n <= 4) {
      xs.push(xf - cabL * 0.5);
      if (n >= 4) xs.push(xf - cabL * 0.5 - wr * 2.3);
      const m = n - xs.length;
      for (let i = 0; i < m; i++) xs.push(xr + 0.14 + i * wr * 2.3);
    } else {
      const a0 = xr + 0.13, a1 = xf - 0.15;
      for (let i = 0; i < n; i++) {
        let x = n === 1 ? 0 : a0 + (a1 - a0) * (i / (n - 1));
        if (n === 4 && s.ch === 'wheeled') x += i < 2 ? 0.02 : -0.02;
        xs.push(x);
      }
    }
    for (const x of xs) for (const z of [1, -1]) wheel(k, x, wr, z * wz, wr, tyreW);
    if (s.ch === 'wheeled') {
      const nl = (s.nl ?? 0.14) * L;
      const rearH = s.rearH ?? H;
      let prof: P2[];
      switch (s.nose ?? 'glacis') {
        case 'hood': {
          const hh = clr + (H - clr) * 0.55;
          prof = [[xr, clr], [xf - 0.03, clr], [xf, clr + 0.05], [xf, hh], [xf - L * 0.3, hh + 0.02], [xf - L * 0.42, H], [xr + L * 0.42, H], [xr + L * 0.4, rearH], [xr, rearH]];
          if (rearH < H - 0.01) prof = [[xr, clr], [xf - 0.03, clr], [xf, clr + 0.05], [xf, hh], [xf - L * 0.3, hh + 0.02], [xf - L * 0.42, H], [xr + L * 0.42, H], [xr + L * 0.42, rearH], [xr, rearH]];
          {
            const ax = xf - L * 0.3, ay = hh + 0.02, bx = xf - L * 0.42, by = H;
            const ang = Math.atan2(by - ay, ax - bx);
            k.add(boxC(Math.hypot(ax - bx, by - ay) * 0.8, 0.008, W * 0.74), COL.GLASS, { pos: [(ax + bx) / 2 + 0.004, (ay + by) / 2 + 0.004, 0], rot: [0, 0, -ang] });
          }
          break;
        }
        case 'blunt': prof = [[xr, clr], [xf - 0.04, clr], [xf, clr + 0.04], [xf, H - 0.03], [xf - 0.04, H], [xr, rearH]]; break;
        case 'boat': prof = [[xr, clr], [xf - nl, clr], [xf, clr + (H - clr) * 0.5], [xf - nl * 0.6, H], [xr, rearH]]; break;
        case 'v': prof = [[xr + 0.02, clr - 0.02], [xf - 0.08, clr - 0.02], [xf, clr + (H - clr) * 0.45], [xf - nl, H], [xr, rearH], [xr, clr + 0.02]]; break;
        default: prof = [[xr, clr], [xf - 0.04, clr], [xf, clr + (H - clr) * 0.3], [xf - nl, H], [xr + 0.01, rearH], [xr, rearH - 0.02]];
      }
      k.tint(extrudeXY(prof, W * 0.86), COL.TINT2);
      hullTopX = xf - nl;
      deckX1 = hullTopX;
      deckY = H;
      if (s.nose !== 'hood') k.add(box(0.012, 0.03, W * 0.4), COL.GLASS, { pos: [xf - nl * 0.55, clr + (H - clr) * 0.75, 0], rot: [0, 0, 0.8] });
    } else {
      // Truck: frame + cab.
      const fy = wr * 1.25;
      k.add(box(L * 0.97, 0.04, W * 0.55), COL.DARK, { pos: [0, fy - 0.02, 0] });
      const cabH = s.cabH ?? 0.2;
      const cx1 = xf, cx0 = xf - cabL;
      const cab = s.cab ?? 'flat';
      if (cab === 'maz') {
        for (const z of [1, -1]) {
          k.tint(prismoid(rect(cx0, cx1, -W * 0.16, W * 0.16), rect(cx0, cx1 - 0.04, -W * 0.15, W * 0.15), cabH), COL.TINT, { pos: [0, fy, z * W * 0.32] });
          k.add(box(0.012, cabH * 0.35, W * 0.24), COL.GLASS, { pos: [cx1 - 0.022, fy + cabH * 0.55, z * W * 0.32], rot: [0, 0, 0.3] });
        }
        k.tint(box(cabL * 0.9, cabH * 0.55, W * 0.3), COL.TINT2, { pos: [cx0 + cabL * 0.5, fy, 0] });
      } else if (cab === 'bonnet') {
        const hl = cabL * 0.45;
        k.tint(prismoid(rect(cx1 - hl, cx1, -W * 0.3, W * 0.3), rect(cx1 - hl, cx1 - 0.02, -W * 0.27, W * 0.27), cabH * 0.55), COL.TINT, { pos: [0, fy, 0] });
        k.tint(box(cabL - hl, cabH, W * 0.9), COL.TINT, { pos: [cx0 + (cabL - hl) / 2, fy, 0] });
        k.add(box(0.012, cabH * 0.32, W * 0.78), COL.GLASS, { pos: [cx1 - hl + 0.005, fy + cabH * 0.62, 0] });
      } else if (cab === 'armored') {
        k.tint(prismoid(rect(cx0, cx1, -W * 0.47, W * 0.47), rect(cx0, cx1 - cabL * 0.35, -W * 0.4, W * 0.4), cabH), COL.TINT, { pos: [0, fy, 0] });
        k.add(box(0.012, cabH * 0.28, W * 0.6), COL.GLASS, { pos: [cx1 - cabL * 0.25, fy + cabH * 0.62, 0], rot: [0, 0, 0.9] });
      } else {
        k.tint(prismoid(rect(cx0, cx1, -W * 0.47, W * 0.47), rect(cx0, cx1 - 0.03, -W * 0.46, W * 0.46), cabH), COL.TINT, { pos: [0, fy, 0] });
        k.add(box(0.012, cabH * 0.35, W * 0.8), COL.GLASS, { pos: [cx1 - 0.012, fy + cabH * 0.55, 0], rot: [0, 0, 0.1] });
      }
      hullTopX = cx0;
      deckX0 = xr + 0.01;
      deckX1 = cx0 - 0.01;
      deckY = fy + 0.02;
    }
  }
  if (s.tur) buildTurret(k, s.tur, s.ch === 'tracked' ? (s.tur.x !== undefined ? 0 : (xr + hullTopX) / 2 + 0.02) : 0, s.ch === 'truck' ? deckY : H, W);
  if (s.pay) buildPayload(k, s.pay, deckX0, deckX1, deckY, W);
  // Extras.
  if (add.has('drums')) for (const z of [1, -1]) k.add(cylC(0.04, 0.04, 0.16, 8), 0x3c4232, { pos: [xr + 0.03, H + 0.04, z * 0.1], rot: [Math.PI / 2, 0, 0] });
  if (add.has('era')) for (let i = 0; i < 4; i++) k.tint(box(0.05, 0.02, W * 0.2), COL.TINT3, { pos: [xf - 0.07 - (i % 2) * 0.05, s.ch === 'tracked' ? H - 0.025 - (i % 2) * 0.03 : H, (i < 2 ? 1 : -1) * W * 0.22], rot: [0, 0, 0.6] });
  if (add.has('dozer')) {
    k.add(boxC(0.05, 0.15, W * 1.05), COL.YELLOW, { pos: [xf + 0.06, 0.08, 0], rot: [0, 0, -0.25] });
    for (const z of [1, -1]) k.add(box(0.14, 0.03, 0.03), COL.METAL, { pos: [xf - 0.02, 0.1, z * W * 0.35] });
  }
  if (add.has('plough')) {
    for (const z of [1, -1]) {
      k.add(boxC(0.1, 0.06, W * 0.3), COL.METAL, { pos: [xf + 0.07, 0.04, z * W * 0.3], rot: [0, 0, -0.4] });
      k.add(box(0.14, 0.03, 0.03), COL.METAL, { pos: [xf, 0.1, z * W * 0.3] });
    }
  }
  if (add.has('crane')) {
    k.beam([xr + 0.1, H + 0.04, W * 0.2], [xf + 0.05, H + 0.22, W * 0.2], 0.035, 0.035, COL.YELLOW);
    k.beam([xf + 0.05, H + 0.22, W * 0.2], [xf + 0.12, H + 0.06, W * 0.2], 0.025, 0.025, COL.YELLOW);
  }
  if (add.has('mast')) {
    k.add(cylC(0.01, 0.014, 0.28, 5), COL.METAL, { pos: [xr * 0.3, H + 0.14, 0] });
    k.add(box(0.06, 0.05, 0.1), COL.DARK, { pos: [xr * 0.3, H + 0.28, 0] });
  }
  if (add.has('rack')) for (const z of [1, -1]) k.add(box(L * 0.35, 0.04, 0.04), COL.OLIVE, { pos: [xr * 0.2, H - 0.02, z * (W / 2 + 0.015)] });
  if (add.has('ramp')) k.add(box(0.012, (H - 0.08) * 0.8, W * 0.45), COL.TINT3, { tint: 1, pos: [xr - 0.004, 0.09, 0] });
  if (add.has('spare')) k.add(cylC(0.07, 0.07, 0.04, 10), COL.RUBBER, { pos: [xr - 0.02, H * 0.7, 0], rot: [0, 0, Math.PI / 2] });
  if (add.has('smoke')) for (const z of [1, -1]) k.add(cylC(0.015, 0.015, 0.05, 5), COL.DARK, { pos: [xf - 0.2, H + 0.03, z * W * 0.35], rot: [0, 0, -0.8] });
  if (add.has('lmg')) {
    k.add(box(0.04, 0.05, 0.04), COL.DARK, { pos: [0, H, 0] });
    k.tube([0, H + 0.04, 0], [0.14, H + 0.05, 0], 0.006, 0.006, COL.DARK, 4);
  }
  if (add.has('cabin')) {
    k.tint(prismoid(rect(-0.13, 0.13, -W * 0.46, W * 0.46), rect(-0.13, 0.08, -W * 0.44, W * 0.44), 0.13), COL.TINT, { pos: [xf - 0.17, H, 0] });
    k.add(box(0.01, 0.04, W * 0.7), COL.GLASS, { pos: [xf - 0.07, H + 0.07, 0], rot: [0, 0, 0.7] });
  }
  if (add.has('cage')) for (const z of [1, -1]) k.add(box(L * 0.75, H * 0.6, 0.006), 0x33372f, { pos: [0, H * 0.35, z * (W / 2 + 0.03)] });
  return k.done();
}

// ===========================================================================
// Infantry & towed guns
// ===========================================================================
export interface SoldierSpec {
  g: 'soldier';
  helm: 'ach' | 'pasgt' | 'ssh' | 'beret' | 'bump' | 'boonie' | 'cap' | 'wrap' | 'future';
  wpn: 'rifle' | 'lmg' | 'at' | 'sniper' | 'rpg';
  pack?: number; camo?: number; vest?: boolean; bulk?: number;
}

export function soldier(s: SoldierSpec): BuiltModel {
  const k = new Kit();
  const b = s.bulk ?? 1;
  const camo = s.camo ?? COL.OLIVE;
  k.tint(box(0.16 * b, 0.34, 0.28 * b), COL.TINT2, { pos: [0, 0.3, 0] });
  if (s.vest !== false) k.add(box(0.18 * b, 0.2, 0.3 * b), camo, { pos: [0.005, 0.38, 0] });
  for (const z of [1, -1]) k.add(box(0.12, 0.3, 0.09), camo, { pos: [0, 0, z * 0.07] });
  const head = s.helm === 'future' ? 0x2a2e33 : COL.SKIN;
  k.add(sphere(0.085, 8, 6), head, { pos: [0, 0.72, 0] });
  switch (s.helm) {
    case 'pasgt': k.tint(sphere(0.11, 8, 4), COL.TINT, { pos: [0, 0.75, 0], scale: [1.05, 0.62, 1.05] }); break;
    case 'ssh': k.tint(sphere(0.105, 8, 4), COL.TINT, { pos: [0, 0.755, 0], scale: [1, 0.72, 1] }); break;
    case 'beret': k.add(cylC(0.09, 0.09, 0.03, 8), 0x7a1f28, { pos: [0, 0.8, 0.01], rot: [0.2, 0, 0] }); break;
    case 'bump':
      k.tint(sphere(0.1, 8, 4), COL.TINT3, { pos: [0, 0.76, 0], scale: [1, 0.62, 1] });
      k.add(box(0.05, 0.04, 0.08), COL.DARK, { pos: [0.08, 0.76, 0] });
      break;
    case 'boonie': k.add(cylC(0.14, 0.14, 0.02, 10), camo, { pos: [0, 0.78, 0] }); k.add(cylC(0.08, 0.09, 0.06, 8), camo, { pos: [0, 0.81, 0] }); break;
    case 'cap': k.add(cylC(0.08, 0.09, 0.05, 8), camo, { pos: [0, 0.79, 0] }); k.add(box(0.08, 0.01, 0.1), camo, { pos: [0.07, 0.77, 0] }); break;
    case 'wrap': k.add(sphere(0.095, 8, 5), 0xd8d0b8, { pos: [0, 0.74, 0], scale: [1, 0.85, 1] }); break;
    case 'future':
      k.tint(sphere(0.11, 8, 5), COL.TINT3, { pos: [0, 0.75, 0], scale: [1.05, 0.9, 1.05] });
      k.add(box(0.03, 0.05, 0.12), 0x3aa0c8, { pos: [0.09, 0.73, 0] });
      break;
    default: k.tint(sphere(0.1, 8, 4), COL.TINT, { pos: [0, 0.76, 0], scale: [1, 0.6, 1] });
  }
  const pack = s.pack ?? 0.6;
  if (pack > 0) k.add(box(0.12, 0.2 + pack * 0.12, 0.2), COL.OLIVE, { pos: [-0.13, 0.34, 0] });
  switch (s.wpn) {
    case 'at': k.add(cylC(0.035, 0.035, 0.46, 8), 0x3e4530, { pos: [0.02, 0.62, 0.13], rot: [0, 0, Math.PI / 2 - 0.1] }); break;
    case 'rpg': k.add(cylC(0.022, 0.022, 0.42, 6), 0x3a3526, { pos: [0.04, 0.62, 0.13], rot: [0, 0, Math.PI / 2] }); k.add(cone(0.045, 0.1, 6), 0x3e4530, { pos: [0.25, 0.62, 0.13], rot: [0, 0, -Math.PI / 2] }); break;
    case 'lmg': k.add(box(0.5, 0.06, 0.05), COL.DARK, { pos: [0.2, 0.46, 0.12], rot: [0, 0, 0.1] }); break;
    case 'sniper': k.add(box(0.62, 0.035, 0.035), COL.DARK, { pos: [0.24, 0.5, 0.12], rot: [0, 0, 0.3] }); break;
    default: k.add(box(0.5, 0.035, 0.035), COL.DARK, { pos: [0.2, 0.5, 0.12], rot: [0, 0, 0.35] });
  }
  return k.done();
}

export interface TowedSpec {
  g: 'towed';
  bl: number; r: number;
  shield?: boolean; trails?: number; wheels?: number; apu?: boolean; w?: number; brake?: boolean; elev?: number;
}

export function towedGun(s: TowedSpec): BuiltModel {
  const k = new Kit();
  const w = s.w ?? 0.36;
  const wheels = s.wheels ?? 2;
  const el = s.elev ?? 0.12;
  const py = 0.16;
  if (s.trails === 3) {
    // D-30 style: gun on a central pedestal with three trails.
    k.add(cylC(0.06, 0.08, 0.1, 8), COL.TINT2, { tint: 1, pos: [0.05, 0.1, 0] });
    for (let i = 0; i < 3; i++) {
      const a = Math.PI + (i - 1) * 2.1;
      k.beam([0.05, 0.04, 0], [0.05 + Math.cos(a) * 0.42, 0.02, Math.sin(a) * 0.42], 0.035, 0.035, COL.TINT2, 1);
    }
    for (const z of [1, -1]) wheel(k, 0.05, 0.08, z * w * 0.45, 0.08, 0.05);
  } else {
    for (const z of [1, -1]) {
      k.beam([0.02, py - 0.03, z * w * 0.2], [-0.52, 0.02, z * w * 0.45], 0.035, 0.035, COL.TINT2, 1);
      k.add(box(0.05, 0.03, 0.06), COL.DARK, { pos: [-0.52, 0, z * w * 0.45] });
    }
    for (let i = 0; i < wheels; i++) for (const z of [1, -1]) wheel(k, 0.02 - i * 0.18, 0.085, z * (w / 2 + 0.03), 0.085, 0.05);
    k.tint(box(0.22, 0.06, w * 0.6), COL.TINT2, { pos: [0.02, py - 0.05, 0] });
  }
  // Cradle + barrel.
  k.tint(boxC(0.3, 0.07, 0.1), COL.TINT, { pos: [0.02, py + 0.04, 0], rot: [0, 0, el] });
  const bx = 0.12 + s.bl * Math.cos(el), by = py + 0.06 + s.bl * Math.sin(el);
  k.tube([-0.12, py + 0.04 - 0.24 * Math.sin(el), 0], [bx, by, 0], s.r * 1.3, s.r, COL.DARK);
  if (s.brake !== false) k.add(boxC(0.05, s.r * 2.6, s.r * 3.2), COL.DARK, { pos: [bx, by, 0], rot: [0, 0, el] });
  if (s.shield) k.tint(boxC(0.012, 0.16, w * 0.9), COL.TINT2, { pos: [0.16, py + 0.06, 0], rot: [0, 0, 0.2] });
  if (s.apu) k.add(box(0.1, 0.08, 0.12), COL.OLIVE, { pos: [-0.12, py - 0.02, 0] });
  return k.done();
}

// ===========================================================================
// Aircraft (fighters, bombers, transports, drones)
// ===========================================================================
export interface Wing { x: number; root: number; tip: number; span: number; sweep: number; y?: number; dih?: number; t?: number; lerx?: number }
export interface AirSpec {
  g: 'air';
  /** Fuselage radius, nose-cone length, tail taper length, end radius (fraction of r). */
  r: number; nose?: number; tail?: number; tailR?: number;
  /** Fuselage section scale (y, z) — blended/flattened bodies. */
  sy?: number; sz?: number;
  /** Lathe segments (6 = chined stealth section). */
  facet?: number;
  /** Fuselage length (1 = full) and x offset. */
  len?: number; fx?: number;
  ck?: [number, number, number] | null;
  ckT?: 'bubble' | 'airliner' | 'glass' | 'tandem';
  wing?: Wing;
  /** Custom right-half planform [x, z] (flying wings, sawtooth edges). */
  pf?: P2[]; pft?: number;
  cn?: { x: number; root: number; tip?: number; span: number; sweep?: number };
  hs?: { x: number; root: number; tip: number; span: number; sweep: number; y?: number; dih?: number };
  vt?: { n: number; x: number; root: number; tip: number; h: number; sweep: number; cant?: number; z?: number; y?: number };
  tt?: boolean;
  ventral?: boolean;
  eng?: { n: number; k: 'int' | 'pod' | 'prop' | 'nac' | 'rear' | 'top' | 'pusher' | 'fan'; r: number; l: number; x: number; y?: number; z?: number[]; blades?: number };
  int?: 'chin' | 'side' | 'nose' | 'none' | 'dsi' | 'top' | 'box';
  boom?: { z: number; x0: number; x1: number };
  dark?: boolean;
  radome?: boolean;
  nprop?: number;
  lambda?: boolean;
  probe?: boolean;
  hump?: number;
  /** Blended body / chine plate half-width (lifting body between fuselage and wings). */
  bw?: number;
}

function propeller(k: Kit, x: number, y: number, z: number, r: number, blades: number): void {
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + 0.3;
    k.add(boxC(0.006, r * 2 * 0.5, r * 0.16), COL.BLACK, { pos: [x, y + Math.cos(a) * r * 0.5, z + Math.sin(a) * r * 0.5], rot: [a, 0, 0] });
  }
  k.add(cone(r * 0.22, r * 0.45, 8), COL.DARK, { pos: [x, y, z], rot: [0, 0, -Math.PI / 2] });
}

export function aircraft(s: AirSpec): BuiltModel {
  const k = new Kit();
  const r = s.r, sy = s.sy ?? 1, sz = s.sz ?? 1;
  const len = s.len ?? 1;
  const fx = s.fx ?? 0;
  const fy = r * sy + 0.03;
  const bodyC = s.dark ? COL.TINT3 : COL.TINT;
  const wingC = s.dark ? COL.TINT3 : COL.TINT2;
  const xn = fx + len / 2, xt = fx - len / 2;
  const nose = (s.nose ?? 0.22) * len, tail = (s.tail ?? 0.25) * len, tailR = s.tailR ?? 0.45;
  const noseTip = s.int === 'nose' ? 0.62 : 0.02;
  const prof: P2[] = [
    [xt, r * tailR], [xt + tail, r], [xn - nose, r], [xn - nose * 0.45, r * 0.72], [xn, r * noseTip],
  ];
  if (s.hump) prof.splice(2, 0, [fx, r * (1 + s.hump)]);
  const seg = s.facet ?? 10;
  const phase = seg === 6 ? 0 : seg === 4 ? Math.PI / 4 : 0;
  k.tint(lathe(prof, seg, phase), bodyC, { pos: [0, fy, 0], scale: [1, sy, sz] });
  if (s.int === 'nose') {
    k.add(cylC(r * noseTip * 0.95, r * noseTip * 0.95, 0.006, 10), COL.BLACK, { pos: [xn + 0.002, fy, 0], rot: [0, 0, Math.PI / 2] });
    k.add(cone(r * 0.3, 0.06, 8), COL.DARK, { pos: [xn - 0.02, fy, 0], rot: [0, 0, -Math.PI / 2] });
  }
  // Canopy.
  if (s.ck !== null) {
    const [cx, cl, ch] = s.ck ?? [xn - nose * 1.1, 0.14, r * 0.55];
    const t = s.ckT ?? 'bubble';
    if (t === 'airliner') {
      k.add(box(0.05, r * 0.28, r * 1.4 * sz), COL.GLASS, { pos: [cx, fy + r * sy * 0.35, 0], rot: [0, 0, -0.5] });
    } else if (t === 'glass') {
      k.add(sphere(1, 10, 6), COL.GLASS, { pos: [cx, fy + r * sy * 0.2, 0], scale: [cl / 2, ch, r * sz * 0.9] });
    } else {
      k.add(sphere(1, 10, 6), COL.GLASS, { pos: [cx, fy + r * sy * 0.72, 0], scale: [cl / 2, ch, Math.min(r * sz * 0.55, 0.05)] });
      if (t === 'tandem') k.add(sphere(1, 10, 6), COL.GLASS, { pos: [cx - cl * 0.55, fy + r * sy * 0.8, 0], scale: [cl / 2.4, ch * 1.05, Math.min(r * sz * 0.55, 0.05)] });
    }
  }
  if (s.radome) {
    k.add(cylC(0.004, 0.004, 0.08, 4), COL.METAL, { pos: [fx - 0.05, fy + r * sy + 0.04, 0] });
    k.add(cylC(0.14, 0.14, 0.025, 14), COL.LIGHT, { pos: [fx - 0.05, fy + r * sy + 0.09, 0] });
  }
  if (s.bw) {
    const bp: P2[] = [[xn - nose * 0.85, 0.001], [xn - nose * 1.5, s.bw], [xt + tail * 0.3, s.bw * 0.95], [xt + 0.01, 0.001]];
    k.tint(plate(bp, r * sy * 0.9), bodyC, { pos: [0, fy - r * sy * 0.15, 0] });
    k.tint(plate(mir(bp), r * sy * 0.9), bodyC, { pos: [0, fy - r * sy * 0.15, 0] });
  }
  // Main wing.
  const wt = s.wing?.t ?? 0.018;
  if (s.pf) {
    const t = s.pft ?? 0.03;
    k.tint(plate(s.pf, t), wingC, { pos: [0, fy, 0] });
    k.tint(plate(mir(s.pf), t), wingC, { pos: [0, fy, 0] });
  }
  if (s.wing) {
    const w = s.wing;
    const wy = fy + (w.y ?? 0) * r * sy;
    const rz = r * sz * 0.5;
    const pts: P2[] = [[w.x, rz], [w.x - w.sweep, w.span], [w.x - w.sweep - w.tip, w.span], [w.x - w.root, rz]];
    const dih = w.dih ?? 0;
    k.tint(plate(pts, wt), wingC, { pos: [0, wy, 0], rot: [-dih, 0, 0] });
    k.tint(plate(mir(pts), wt), wingC, { pos: [0, wy, 0], rot: [dih, 0, 0] });
    // Wing root fill (through the fuselage).
    k.tint(plate([[w.x, rz], [w.x - w.root, rz], [w.x - w.root, -rz], [w.x, -rz]], wt), wingC, { pos: [0, wy, 0] });
    if (w.lerx) {
      const lp: P2[] = [[w.x + w.lerx, r * sz * 0.55], [w.x, rz + w.root * 0.18], [w.x - w.root * 0.2, rz + w.root * 0.1], [w.x - w.root * 0.2, r * sz * 0.55]];
      k.tint(plate(lp, wt * 0.8), wingC, { pos: [0, wy + 0.004, 0] });
      k.tint(plate(mir(lp), wt * 0.8), wingC, { pos: [0, wy + 0.004, 0] });
    }
  }
  if (s.cn) {
    const c = s.cn;
    const pts: P2[] = [[c.x, r * sz * 0.6], [c.x - (c.sweep ?? c.root * 0.7), c.span], [c.x - (c.sweep ?? c.root * 0.7) - (c.tip ?? c.root * 0.3), c.span], [c.x - c.root, r * sz * 0.6]];
    k.tint(plate(pts, 0.012), wingC, { pos: [0, fy + r * sy * 0.25, 0], rot: [-0.08, 0, 0] });
    k.tint(plate(mir(pts), 0.012), wingC, { pos: [0, fy + r * sy * 0.25, 0], rot: [0.08, 0, 0] });
  }
  // Vertical tails.
  let finTopY = fy, finTopX = xt;
  if (s.vt) {
    const v = s.vt;
    const prof2: P2[] = [[v.x, 0], [v.x - v.sweep, v.h], [v.x - v.sweep - v.tip, v.h], [v.x - v.root, 0]];
    const vy = fy + (v.y ?? 0.5) * r * sy;
    finTopY = vy + v.h;
    finTopX = v.x - v.sweep - v.tip / 2;
    if (v.n >= 2) {
      const z = v.z ?? r * sz * 0.7;
      const cant = v.cant ?? 0.3;
      k.tint(extrudeXY(prof2, 0.012), bodyC, { pos: [0, vy, z], rot: [cant, 0, 0] });
      k.tint(extrudeXY(prof2, 0.012), bodyC, { pos: [0, vy, -z], rot: [-cant, 0, 0] });
    } else {
      k.tint(extrudeXY(prof2, 0.014), bodyC, { pos: [0, vy, 0] });
    }
    if (s.ventral) for (const zz of [1, -1]) k.tint(extrudeXY([[v.x, 0], [v.x - v.root * 0.8, 0], [v.x - v.root * 0.9, -v.h * 0.35]], 0.01), bodyC, { pos: [0, fy - r * sy * 0.6, zz * r * sz * 0.6], rot: [zz * -0.4 + Math.PI, 0, 0], scale: [1, 1, 1] });
  }
  if (s.hs) {
    const hsp = s.hs;
    const hy = s.tt ? finTopY : fy + (hsp.y ?? 0) * r * sy;
    const hx = s.tt ? finTopX + hsp.root * 0.3 : 0;
    const x0 = s.tt ? hx : hsp.x;
    const pts: P2[] = [[x0, s.tt ? 0 : r * sz * 0.4], [x0 - hsp.sweep, hsp.span], [x0 - hsp.sweep - hsp.tip, hsp.span], [x0 - hsp.root, s.tt ? 0 : r * sz * 0.4]];
    const dih = hsp.dih ?? 0;
    k.tint(plate(pts, 0.012), wingC, { pos: [0, hy, 0], rot: [-dih, 0, 0] });
    k.tint(plate(mir(pts), 0.012), wingC, { pos: [0, hy, 0], rot: [dih, 0, 0] });
  }
  // Engines.
  if (s.eng) {
    const e = s.eng;
    const zs = e.z ?? [0];
    const ey = fy + (e.y ?? 0) * r;
    switch (e.k) {
      case 'int':
        for (const z of zs) k.add(cylC(e.r, e.r * 0.9, 0.05, 10), COL.DARK, { pos: [xt - 0.012, fy, z], rot: [0, 0, Math.PI / 2] });
        break;
      case 'nac': {
        for (const z of zs) {
          const x0 = e.x, x1 = e.x - e.l;
          k.tint(prismoid(rect(x1, x0, -e.r, e.r), rect(x1, x0 - 0.04, -e.r * 0.9, e.r * 0.9), e.r * 1.7), bodyC, { pos: [0, fy - e.r * 1.3, z] });
          k.add(box(0.008, e.r * 1.3, e.r * 1.6), COL.BLACK, { pos: [x0 + 0.002, fy - e.r * 1.15, z] });
          k.add(cylC(e.r * 0.8, e.r * 0.75, 0.05, 10), COL.DARK, { pos: [x1 - 0.02, fy - e.r * 0.45, z], rot: [0, 0, Math.PI / 2] });
        }
        break;
      }
      case 'pod':
      case 'fan': {
        for (const z of zs) {
          const wz = Math.abs(z);
          const wy2 = (s.wing ? fy + (s.wing.y ?? 0) * r * sy : fy) + (s.wing?.dih ?? 0) * wz;
          const y = e.k === 'fan' ? ey : wy2 - e.r * 1.3;
          k.tint(cylC(e.r, e.r * 0.85, e.l, 10), COL.TINT2, { pos: [e.x, y, z], rot: [0, 0, Math.PI / 2] });
          k.add(cylC(e.r * 0.85, e.r * 0.85, 0.006, 10), COL.BLACK, { pos: [e.x + e.l / 2 + 0.002, y, z], rot: [0, 0, Math.PI / 2] });
          if (e.k === 'pod') k.add(box(e.l * 0.6, e.r * 1.1, 0.008), COL.TINT2, { tint: 1, pos: [e.x - e.l * 0.1, y + e.r * 0.4, z] });
        }
        break;
      }
      case 'prop': {
        for (const z of zs) {
          const wz = Math.abs(z);
          const wy2 = (s.wing ? fy + (s.wing.y ?? 0) * r * sy : fy) + (s.wing?.dih ?? 0) * wz;
          k.tint(cylC(e.r * 0.8, e.r, e.l, 8), COL.TINT2, { pos: [e.x, wy2 - e.r * 0.3, z], rot: [0, 0, Math.PI / 2] });
          propeller(k, e.x + e.l / 2 + 0.005, wy2 - e.r * 0.3, z, e.r * 3.2, e.blades ?? 4);
        }
        break;
      }
      case 'rear': {
        for (const z of zs) {
          k.tint(cylC(e.r, e.r * 0.9, e.l, 10), COL.TINT2, { pos: [e.x, ey, z], rot: [0, 0, Math.PI / 2] });
          k.add(cylC(e.r * 0.85, e.r * 0.85, 0.006, 10), COL.BLACK, { pos: [e.x + e.l / 2 + 0.002, ey, z], rot: [0, 0, Math.PI / 2] });
          k.add(box(0.06, 0.02, Math.abs(z) + 0.001), COL.TINT2, { tint: 1, pos: [e.x, ey - e.r * 0.5, z / 2] });
        }
        break;
      }
      case 'top': {
        k.tint(cylC(e.r * 0.8, e.r, e.l, 10), COL.TINT2, { pos: [e.x, fy + r * sy * 0.9 + e.r * 0.5, 0], rot: [0, 0, Math.PI / 2] });
        k.add(cylC(e.r * 0.8, e.r * 0.8, 0.006, 10), COL.BLACK, { pos: [e.x + e.l / 2 + 0.002, fy + r * sy * 0.9 + e.r * 0.5, 0], rot: [0, 0, Math.PI / 2] });
        break;
      }
      case 'pusher': {
        propeller(k, xt - 0.01, fy, 0, e.r, e.blades ?? 3);
        break;
      }
    }
  }
  if (s.nprop) propeller(k, xn + 0.005, fy, 0, s.nprop, 4);
  // Intakes.
  const il = 0.2 * len;
  switch (s.int) {
    case 'chin': {
      const ix = xn - nose - 0.04;
      k.tint(prismoid(rect(ix - il, ix, -r * 0.45, r * 0.45), rect(ix - il, ix - 0.02, -r * 0.4, r * 0.4), r * 0.5), bodyC, { pos: [0, fy - r * sy * 1.25, 0] });
      k.add(box(0.006, r * 0.4, r * 0.8), COL.BLACK, { pos: [ix + 0.001, fy - r * sy * 1.2, 0] });
      break;
    }
    case 'side':
    case 'dsi':
    case 'box': {
      const ix = s.ck ? s.ck[0] - s.ck[1] * 0.4 : xn - nose - 0.06;
      const iw = r * (s.int === 'box' ? 0.55 : 0.4);
      for (const z of [1, -1]) {
        const zc = z * (r * sz * 0.85 + iw * 0.4);
        k.tint(prismoid(rect(ix - il * 1.2, ix, -iw, iw), rect(ix - il * 1.2, ix - (s.int === 'dsi' ? 0.05 : 0.015), -iw * 0.8, iw * 0.8), r * sy * 1.1), bodyC, { pos: [0, fy - r * sy * 0.65, zc] });
        k.add(box(0.006, r * sy * 0.8, iw * 1.4), COL.BLACK, { pos: [ix + 0.001, fy - r * sy * 0.55, zc] });
      }
      break;
    }
    case 'top': {
      k.add(box(0.02, r * 0.3, r * 1.2), COL.BLACK, { pos: [fx + len * 0.15, fy + r * sy * 0.85, 0] });
      break;
    }
  }
  if (s.boom) {
    const b = s.boom;
    for (const z of [b.z, -b.z]) k.tube([b.x0, fy, z], [b.x1, fy + 0.01, z], 0.012, 0.01, bodyC === COL.TINT ? COL.TINT2 : COL.TINT3, 6, 1);
  }
  if (s.probe) k.tube([xn - nose * 0.6, fy + r * sy * 0.5, r * 0.5], [xn + 0.05, fy + r * sy * 0.55, r * 0.5], 0.004, 0.004, COL.DARK, 4);
  return k.done();
}

// ===========================================================================
// Helicopters & tiltrotors
// ===========================================================================
export interface HeliSpec {
  g: 'heli';
  body: 'attack' | 'utility' | 'heavy' | 'light' | 'tandem' | 'tilt' | 'hind' | 'naval';
  w: number; h: number;
  /** Body (pod) length and nose-to-rotor offset. */
  bl?: number;
  boom?: number;
  tr?: 'rotor' | 'fen' | 'none';
  fin?: 'single' | 'twin' | 'v' | 'h';
  wings?: number;
  mast?: boolean; gun?: boolean; sponson?: boolean; skids?: boolean;
  ck?: 'tandem' | 'side' | 'glass';
  r: number; b: number; coax?: boolean;
  r2?: number;
  tilt?: { span: number };
  hs?: boolean;
}

export function helicopter(s: HeliSpec): BuiltModel {
  const k = new Kit();
  const bl = s.bl ?? 0.62;
  const x0 = 0.5 - bl; // rear end of pod
  const cy = 0.08 + s.h / 2;
  const cx = x0 + bl / 2;
  // Main body pod (lathe, squashed).
  if (s.body === 'utility' || s.body === 'heavy' || s.body === 'naval' || s.body === 'tandem' || s.body === 'tilt') {
    const noseL = bl * 0.2;
    const bot: P2[] = [[x0, -s.w / 2], [0.5 - noseL, -s.w / 2], [0.5, -s.w * 0.3], [0.5, s.w * 0.3], [0.5 - noseL, s.w / 2], [x0, s.w / 2]];
    const top: P2[] = [[x0 + 0.02, -s.w * 0.42], [0.5 - noseL * 1.6, -s.w * 0.42], [0.5 - noseL * 1.1, -s.w * 0.25], [0.5 - noseL * 1.1, s.w * 0.25], [0.5 - noseL * 1.6, s.w * 0.42], [x0 + 0.02, s.w * 0.42]];
    k.tint(prismoid(bot, top, s.h), COL.TINT, { pos: [0, 0.08, 0] });
    k.add(box(noseL * 1.1, s.h * 0.35, s.w * 0.62), COL.GLASS, { pos: [0.5 - noseL * 0.8, 0.08 + s.h * 0.5, 0], rot: [0, 0, -0.5] });
    if (s.body === 'tandem') k.tint(box(0.16, s.h * 0.35, s.w * 0.5), COL.TINT2, { pos: [x0 + 0.08, 0.08 + s.h, 0] });
    if (s.body !== 'tilt') k.tint(box(bl * 0.4, s.h * 0.22, s.w * 0.6), COL.TINT2, { pos: [cx + 0.02, 0.08 + s.h, 0] });
  } else {
    // Slim pod (attack / light / hind).
    const prof: P2[] = [[x0, 0.02], [x0 + bl * 0.25, 1], [0.5 - bl * 0.25, 1], [0.5, 0.25]];
    k.tint(lathe(prof.map(([x, r]) => [x, r * s.h / 2] as P2), 10), COL.TINT, { pos: [0, cy, 0], scale: [1, 1, s.w / s.h] });
    const ck = s.ck ?? (s.body === 'light' ? 'glass' : 'tandem');
    if (ck === 'tandem') {
      k.add(sphere(1, 8, 6), COL.GLASS, { pos: [0.5 - bl * 0.22, cy + s.h * 0.28, 0], scale: [bl * 0.1, s.h * 0.28, s.w * 0.36] });
      k.add(sphere(1, 8, 6), COL.GLASS, { pos: [0.5 - bl * 0.4, cy + s.h * 0.4, 0], scale: [bl * 0.11, s.h * 0.34, s.w * 0.38] });
    } else if (ck === 'side') {
      k.add(sphere(1, 8, 6), COL.GLASS, { pos: [0.5 - bl * 0.24, cy + s.h * 0.18, 0], scale: [bl * 0.16, s.h * 0.34, s.w * 0.48] });
    } else {
      k.add(sphere(1, 10, 6), COL.GLASS, { pos: [0.5 - bl * 0.2, cy + s.h * 0.08, 0], scale: [bl * 0.22, s.h * 0.42, s.w * 0.46] });
    }
    // Engine hump.
    k.tint(box(bl * 0.34, s.h * 0.28, s.w * 0.7), COL.TINT2, { pos: [cx - 0.02, cy + s.h * 0.35, 0] });
    if (s.body === 'hind') {
      k.tint(box(bl * 0.4, s.h * 0.55, s.w * 1.05), COL.TINT, { pos: [cx - 0.04, cy - s.h * 0.45, 0] });
    }
  }
  if (s.sponson) for (const z of [1, -1]) k.tint(box(bl * 0.4, s.h * 0.3, s.w * 0.25), COL.TINT2, { pos: [cx, cy - s.h * 0.2, z * s.w * 0.55] });
  if (s.gun) {
    k.add(sphere(0.025, 6, 4), COL.DARK, { pos: [0.5 - bl * 0.18, cy - s.h * 0.45, 0] });
    k.tube([0.5 - bl * 0.18, cy - s.h * 0.5, 0], [0.5 - bl * 0.18 + 0.08, cy - s.h * 0.52, 0], 0.006, 0.006, COL.DARK, 4);
  }
  if (s.wings) {
    const wy = s.body === 'hind' ? cy + s.h * 0.05 : cy - s.h * 0.05;
    const pts: P2[] = [[cx + 0.06, s.w * 0.4], [cx + 0.05, s.wings], [cx - 0.03, s.wings], [cx - 0.04, s.w * 0.4]];
    const dih = s.body === 'hind' ? 0.2 : 0.05;
    k.tint(plate(pts, 0.014), COL.TINT2, { pos: [0, wy, 0], rot: [dih, 0, 0] });
    k.tint(plate(mir(pts), 0.014), COL.TINT2, { pos: [0, wy, 0], rot: [-dih, 0, 0] });
    for (const z of [1, -1]) for (const f of [0.55, 0.9]) {
      k.add(cylC(0.018, 0.018, 0.1, 6), 0x4a4f3c, { pos: [cx + 0.01, wy - 0.03 - f * s.wings * dih * 0, z * s.wings * f], rot: [0, 0, Math.PI / 2] });
    }
  }
  // Tail boom.
  const boom = s.boom ?? 0.42;
  const tx = x0 - boom;
  const by = cy + s.h * (s.body === 'heavy' || s.body === 'utility' || s.body === 'naval' ? 0.3 : 0.1);
  if (s.body !== 'tandem' && s.body !== 'tilt') {
    k.tube([x0 + 0.05, by, 0], [tx, by + 0.03, 0], s.h * 0.2, s.h * 0.1, COL.TINT2, 7, 1);
    const fin = s.fin ?? 'single';
    const fh = s.h * 0.75;
    if (fin === 'twin') {
      for (const z of [1, -1]) k.tint(extrudeXY([[tx + 0.08, -fh * 0.3], [tx + 0.04, fh * 0.6], [tx - 0.02, fh * 0.6], [tx, -fh * 0.3]], 0.01), COL.TINT, { pos: [0, by, z * 0.1] });
      k.tint(plate(rect(tx - 0.01, tx + 0.08, -0.1, 0.1), 0.01), COL.TINT2, { pos: [0, by, 0] });
    } else {
      k.tint(extrudeXY([[tx + 0.08, 0], [tx + 0.02, fh], [tx - 0.04, fh], [tx - 0.02, -fh * 0.15]], 0.012), COL.TINT, { pos: [0, by, 0] });
      if (s.hs !== false) k.tint(plate(rect(tx + 0.02, tx + 0.1, -s.w * 0.6, s.w * 0.6), 0.01), COL.TINT2, { pos: [0, by + 0.01, 0] });
    }
    const tr = s.tr ?? 'rotor';
    if (tr === 'rotor') {
      k.add(cylC(s.r * 0.2, s.r * 0.2, 0.008, 10), 0x2c2c2c, { pos: [tx - 0.01, by + fh * 0.55, 0.03], rot: [Math.PI / 2, 0, 0] });
    } else if (tr === 'fen') {
      k.tint(cylC(0.06, 0.06, 0.03, 10), COL.TINT, { pos: [tx, by + 0.05, 0], rot: [Math.PI / 2, 0, 0] });
      k.add(cylC(0.045, 0.045, 0.032, 10), COL.DARK, { pos: [tx, by + 0.05, 0], rot: [Math.PI / 2, 0, 0] });
    }
  }
  if (s.skids) for (const z of [1, -1]) k.add(box(bl * 0.7, 0.012, 0.015), COL.DARK, { pos: [cx + 0.02, 0.0, z * s.w * 0.55] });
  else for (const z of [1, -1]) {
    k.add(cylC(0.022, 0.022, 0.015, 8), COL.RUBBER, { pos: [cx + bl * 0.1, 0.022, z * s.w * 0.55], rot: [Math.PI / 2, 0, 0] });
  }
  const topY = s.body === 'tandem' ? 0.08 + s.h + 0.08 : cy + s.h * (s.body === 'utility' || s.body === 'heavy' || s.body === 'naval' ? 0.72 : 0.6) + 0.06;
  // Rotors.
  if (s.body === 'tilt' && s.tilt) {
    const sp = s.tilt.span;
    const wy = 0.08 + s.h + 0.01;
    k.tint(plate(rect(cx - 0.05, cx + 0.07, -sp, sp), 0.02), COL.TINT2, { pos: [0, wy, 0] });
    for (const z of [1, -1]) {
      k.tint(cylC(0.04, 0.04, 0.18, 8), COL.TINT, { pos: [cx + 0.01, wy + 0.09, z * sp] });
      k.rotors.push({ x: cx + 0.01, y: wy + 0.19, z: z * sp, r: s.r, b: s.b, dir: z });
    }
    // Twin fins (H-tail) or V-tail.
    const tx2 = x0 - (s.boom ?? 0.1);
    k.tube([x0 + 0.05, 0.08 + s.h * 0.6, 0], [tx2 + 0.02, 0.08 + s.h * 0.75, 0], s.h * 0.3, s.h * 0.15, COL.TINT, 7, 1);
    if (s.fin === 'v') {
      for (const z of [1, -1]) k.tint(extrudeXY([[tx2 + 0.12, 0], [tx2 + 0.04, 0.14], [tx2 - 0.02, 0.14], [tx2, 0]], 0.01), COL.TINT, { pos: [0, 0.08 + s.h * 0.72, z * 0.03], rot: [z * 0.7, 0, 0] });
    } else {
      k.tint(plate(rect(tx2, tx2 + 0.1, -0.12, 0.12), 0.012), COL.TINT2, { pos: [0, 0.08 + s.h * 0.75, 0] });
      for (const z of [1, -1]) k.tint(extrudeXY([[tx2 + 0.1, -0.03], [tx2 + 0.06, 0.12], [tx2, 0.12], [tx2, -0.03]], 0.01), COL.TINT, { pos: [0, 0.08 + s.h * 0.75, z * 0.12] });
    }
  } else if (s.body === 'tandem') {
    k.tint(prismoid(rect(0.2, 0.36, -s.w * 0.25, s.w * 0.25), rect(0.22, 0.33, -s.w * 0.2, s.w * 0.2), 0.05), COL.TINT2, { pos: [0, 0.08 + s.h, 0] });
    k.rotors.push({ x: 0.3, y: 0.08 + s.h + 0.07, z: 0, r: s.r, b: s.b, dir: 1 });
    k.rotors.push({ x: x0 + 0.08, y: 0.08 + s.h + 0.12, z: 0, r: s.r2 ?? s.r, b: s.b, dir: -1 });
    k.tint(box(0.12, 0.1, s.w * 0.4), COL.TINT2, { pos: [x0 + 0.08, 0.08 + s.h + 0.0, 0] });
  } else {
    const rx = cx + 0.02;
    k.add(cylC(0.018, 0.022, s.coax ? 0.12 : 0.07, 6), COL.METAL, { pos: [rx, topY - 0.02, 0] });
    k.rotors.push({ x: rx, y: topY, z: 0, r: s.r, b: s.b, dir: 1 });
    if (s.coax) k.rotors.push({ x: rx, y: topY + 0.06, z: 0, r: s.r, b: s.b, dir: -1 });
    if (s.mast) k.add(sphere(0.04, 8, 5), 0xb8bcae, { pos: [rx, topY + (s.coax ? 0.1 : 0.04), 0], scale: [1, 0.55, 1] });
  }
  return k.done();
}

/** Rotor disc geometry (blades + hub) of radius r. */
export function rotorGeometry(r: number, blades: number): G {
  const k = new Kit();
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2;
    k.add(boxC(r, 0.01, 0.04), 0x222222, { pos: [Math.cos(a) * r / 2, 0, Math.sin(a) * r / 2], rot: [0, -a, 0] });
  }
  k.add(cylC(0.028, 0.028, 0.03, 6), COL.METAL);
  return k.done().geo;
}

// ===========================================================================
// Surface ships
// ===========================================================================
/** Superstructure block: x centre, length, width (fraction of beam), height, taper (0 box … 0.4 pyramid). */
export type Block = [number, number, number, number, number?];
export interface Mast { x: number; h: number; s: 'lat' | 'pole' | 'int' | 'tri' | 'tower'; r?: 'rot' | 'sph' | 'dome' | 'big' | 'panel' | 'none'; y?: number; w?: number }
export interface ShipSpec {
  g: 'ship';
  beam: number; fb: number;
  bow?: 'clip' | 'tumble' | 'round' | 'ramp' | 'box';
  /** Raised forecastle: [x where it ends, extra height]. */
  fc?: [number, number];
  blocks?: Block[];
  masts?: Mast[];
  funnels?: [number, number, number, number?][];
  /** Guns: [x, size 0 small / 1 medium / 2 large / 3 twin, stealth 0/1]. */
  guns?: [number, number, number?][];
  /** VLS patches: [x, length, width fraction]. */
  vls?: [number, number, number][];
  /** Anti-ship canisters: [x, n per side, big 0/1/2 (2 = Slava tubes)]. */
  can?: [number, number, number?][];
  ciws?: [number, number][];
  /** Flight deck length at the stern (0 = none) and hangar length. */
  heli?: number; hangar?: number;
  /** SPY-style fixed radar panels: [x, y, size, fore/aft half-length offset, faces 2|4]. */
  spy?: [number, number, number, number, number][];
  hullC?: number;
  /** Small boats: open cockpit / low hull. */
  low?: boolean;
  /** Draw a stern well / ramp. */
  well?: boolean;
  /** Bridge windows band on the forward block. */
  win?: boolean;
  /** Cargo / container stacks: [x0, x1]. */
  cargo?: [number, number];
}

function hullPlan(beam: number, bowF = 0.3, stern = 0.06, box = false): P2[] {
  const b = beam / 2;
  if (box) return [[-0.5, -b], [0.45, -b], [0.5, -b * 0.7], [0.5, b * 0.7], [0.45, b], [-0.5, b]];
  const xb = 0.5 - bowF;
  return [
    [-0.5, -b * 0.82], [-0.5 + stern, -b], [xb, -b], [xb + bowF * 0.45, -b * 0.8], [xb + bowF * 0.8, -b * 0.38], [0.5, 0],
    [xb + bowF * 0.8, b * 0.38], [xb + bowF * 0.45, b * 0.8], [xb, b], [-0.5 + stern, b], [-0.5, b * 0.82],
  ];
}

function shipGun(k: Kit, x: number, y: number, size: number, stealth: boolean): void {
  if (size >= 3) {
    k.tint(prismoid(rect(-0.035, 0.035, -0.03, 0.03), rect(-0.03, 0.02, -0.025, 0.025), 0.03), COL.TINT, { pos: [x, y, 0] });
    for (const z of [1, -1]) k.tube([x + 0.02, y + 0.018, z * 0.012], [x + 0.1, y + 0.022, z * 0.012], 0.005, 0.004, COL.DARK, 4);
    return;
  }
  const sc = size === 2 ? 1 : size === 1 ? 0.75 : 0.5;
  if (stealth) {
    k.tint(prismoid(rect(-0.03 * sc, 0.035 * sc, -0.025 * sc, 0.025 * sc), rect(-0.025 * sc, 0.0, -0.015 * sc, 0.015 * sc), 0.028 * sc), COL.TINT, { pos: [x, y, 0] });
  } else {
    k.tint(sphere(0.03 * sc, 8, 4), COL.TINT, { pos: [x, y, 0], scale: [1.2, 0.8, 1] });
  }
  k.tube([x + 0.02 * sc, y + 0.013 * sc, 0], [x + 0.02 * sc + 0.09 * sc, y + 0.016 * sc, 0], 0.0045 * sc + 0.001, 0.004 * sc + 0.001, COL.DARK, 5);
}

function shipMast(k: Kit, m: Mast, baseY: number): void {
  const y = m.y ?? baseY;
  const w = m.w ?? 0.05;
  let top = y + m.h;
  switch (m.s) {
    case 'lat':
      k.add(prismoid(rect(-w / 2, w / 2, -w / 2, w / 2), rect(-0.006, 0.006, -0.006, 0.006), m.h), COL.METAL, { pos: [m.x, y, 0] });
      k.add(boxC(0.012, 0.006, m.h * 0.45), COL.METAL, { pos: [m.x, y + m.h * 0.75, 0] });
      break;
    case 'tri':
      for (const [dx, dz] of [[0.03, 0.02], [0.03, -0.02], [-0.03, 0]] as P2[]) k.tube([m.x + dx, y, dz], [m.x, y + m.h, 0], 0.004, 0.003, COL.METAL, 4);
      k.add(boxC(0.012, 0.006, m.h * 0.45), COL.METAL, { pos: [m.x, y + m.h * 0.8, 0] });
      break;
    case 'pole':
      k.add(cylC(0.004, 0.007, m.h, 4), COL.METAL, { pos: [m.x, y + m.h / 2, 0] });
      k.add(boxC(0.01, 0.005, m.h * 0.5), COL.METAL, { pos: [m.x, y + m.h * 0.7, 0] });
      break;
    case 'int':
    case 'tower': {
      const ww = m.s === 'tower' ? w * 1.4 : w;
      k.tint(prismoid(rect(-ww / 2, ww / 2, -ww / 2, ww / 2), rect(-ww * 0.3, ww * 0.3, -ww * 0.3, ww * 0.3), m.h), COL.TINT, { pos: [m.x, y, 0] });
      // Panel faces.
      for (const [dx, dz, ry] of [[1, 0, 0], [-1, 0, Math.PI], [0, 1, -Math.PI / 2], [0, -1, Math.PI / 2]] as [number, number, number][]) {
        k.add(boxC(0.003, m.h * 0.2, ww * 0.5), 0x3b4148, { pos: [m.x + dx * ww * 0.42, y + m.h * 0.7, dz * ww * 0.42], rot: [0, ry, 0] });
      }
      k.add(cylC(0.003, 0.004, 0.06, 4), COL.METAL, { pos: [m.x, top + 0.03, 0] });
      top += 0.03;
      break;
    }
  }
  switch (m.r) {
    case 'rot': k.add(boxC(0.012, 0.018, 0.07), COL.LIGHT, { pos: [m.x, top + 0.01, 0] }); break;
    case 'sph': k.add(sphere(0.022, 10, 8), COL.WHITE, { pos: [m.x, top + 0.02, 0] }); break;
    case 'dome': k.add(sphere(0.012, 8, 6), COL.WHITE, { pos: [m.x, top + 0.008, 0] }); break;
    case 'big': k.add(boxC(0.02, 0.04, 0.1), COL.LIGHT, { pos: [m.x, top + 0.02, 0], rot: [0, 0, 0.2] }); break;
    case 'panel': k.add(boxC(0.006, 0.03, 0.05), COL.LIGHT, { pos: [m.x, top + 0.015, 0] }); break;
  }
}

export function ship(s: ShipSpec): BuiltModel {
  const k = new Kit();
  const fb = s.fb;
  const beam = s.beam;
  const hc = s.hullC ?? COL.NAVY;
  const plan = hullPlan(beam, s.bow === 'box' ? 0.08 : s.bow === 'round' ? 0.2 : 0.3, 0.05, s.bow === 'box');
  if (s.bow === 'tumble') {
    k.add(prismoid(inset(plan, 1.0, 0.98), inset(plan, 0.95, 0.75, -0.02), fb), hc);
  } else {
    k.add(prismoid(inset(plan, 0.97, 0.86, -0.012), plan, fb), hc);
  }
  k.add(prismoid(inset(plan, 0.95, 0.84, -0.015), inset(plan, 0.97, 0.86, -0.012), 0.022, -0.022), COL.HULLRED);
  const deckPlan = inset(plan, 0.985, 0.94);
  k.add(plate(deckPlan, 0.006), COL.DECK, { pos: [0, fb + 0.002, 0] });
  let deckY = fb;
  if (s.fc) {
    const [xe, dh] = s.fc;
    const fcp = plan.filter(([x]) => x >= xe - 0.001);
    const b = beam / 2;
    // Width at xe from the plan.
    const pts: P2[] = [[xe, -b], ...fcp.filter(([, z]) => z < 0), [0.5, 0], ...fcp.filter(([, z]) => z > 0), [xe, b]];
    const uniq = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
    k.add(prismoid(uniq, inset(uniq, 1, 0.98), dh), hc, { pos: [0, fb, 0] });
    k.add(plate(inset(uniq, 0.98, 0.93), 0.004), COL.DECK, { pos: [0, fb + dh + 0.002, 0] });
  }
  const fcTop = (x: number) => (s.fc && x >= s.fc[0] ? fb + s.fc[1] : fb);
  deckY = fb;
  // Flight deck & hangar.
  if (s.heli) {
    const hx = -0.5 + s.heli / 2 + 0.01;
    k.add(cylC(Math.min(beam * 0.3, s.heli * 0.35), Math.min(beam * 0.3, s.heli * 0.35), 0.002, 16), COL.WHITE, { pos: [hx, deckY + 0.006, 0] });
    k.add(cylC(Math.min(beam * 0.27, s.heli * 0.32), Math.min(beam * 0.27, s.heli * 0.32), 0.003, 16), COL.DECK, { pos: [hx, deckY + 0.006, 0] });
    if (s.hangar) k.tint(prismoid(rect(0, s.hangar, -beam * 0.4, beam * 0.4), rect(0, s.hangar * 0.9, -beam * 0.36, beam * 0.36), 0.05), COL.TINT, { pos: [-0.5 + s.heli, deckY, 0] });
  }
  for (const [x, l, wf, h, tp] of s.blocks ?? []) {
    const w = beam * wf;
    const t = tp ?? 0.08;
    k.tint(prismoid(rect(-l / 2, l / 2, -w / 2, w / 2), rect(-l / 2 * (1 - t), l / 2 * (1 - t * 1.4), -w / 2 * (1 - t * 1.6), w / 2 * (1 - t * 1.6)), h), COL.TINT, { pos: [x, fcTop(x), 0] });
  }
  if (s.win && s.blocks?.length) {
    const [x, l, wf, h] = s.blocks[0];
    k.add(box(0.004, h * 0.18, beam * wf * 0.7), COL.GLASS, { pos: [x + l / 2 - l * 0.08, fcTop(x) + h * 0.7, 0] });
  }
  for (const m of s.masts ?? []) {
    // Base on top of the tallest block under the mast.
    let by = fcTop(m.x);
    for (const [x, l, , h] of s.blocks ?? []) if (Math.abs(m.x - x) <= l / 2) by = Math.max(by, fcTop(x) + h);
    shipMast(k, m, by);
  }
  for (const [x, l, h, n] of s.funnels ?? []) {
    let by = fcTop(x);
    for (const [bx, bl, , bh] of s.blocks ?? []) if (Math.abs(x - bx) <= bl / 2) by = Math.max(by, fcTop(bx) + bh);
    const cnt = n ?? 1;
    for (let i = 0; i < cnt; i++) {
      const z = cnt === 1 ? 0 : (i - 0.5) * beam * 0.3;
      k.tint(prismoid(rect(-l / 2, l / 2, -beam * 0.12, beam * 0.12), rect(-l / 2 * 0.8, l / 2 * 0.7, -beam * 0.1, beam * 0.1), h), COL.TINT2, { pos: [x, by, z] });
      k.add(plate(rect(-l / 2 * 0.75, l / 2 * 0.65, -beam * 0.09, beam * 0.09), 0.006), COL.BLACK, { pos: [x, by + h, z] });
    }
  }
  for (const [x, size, st] of s.guns ?? []) shipGun(k, x, fcTop(x), size, !!st);
  for (const [x, l, wf] of s.vls ?? []) {
    k.add(box(l, 0.006, beam * wf), 0x383c40, { pos: [x, fcTop(x), 0] });
    const nr = Math.max(1, Math.round(l / 0.02));
    for (let i = 1; i < nr; i++) k.add(box(0.002, 0.008, beam * wf), 0x5b6066, { pos: [x - l / 2 + (i * l) / nr, fcTop(x), 0] });
  }
  for (const [x, n, big] of s.can ?? []) {
    for (const z of [1, -1]) {
      if (big === 2) {
        for (let i = 0; i < n; i++) k.tube([x - 0.05 - i * 0.03, fcTop(x) + 0.02, z * beam * 0.36], [x + 0.08 - i * 0.03, fcTop(x) + 0.05, z * beam * 0.36], 0.012, 0.012, COL.TINT2, 6, 1);
      } else {
        const cl = big ? 0.06 : 0.04, cr = big ? 0.007 : 0.005;
        for (let i = 0; i < n; i++) k.tube([x - cl / 2, fcTop(x) + 0.01 + i * cr * 2.1, z * beam * 0.12], [x + cl / 2, fcTop(x) + 0.02 + i * cr * 2.1, z * beam * 0.12 + z * 0.02], cr, cr, COL.LIGHT, 5);
      }
    }
  }
  for (const [x, z] of s.ciws ?? []) {
    let by = fcTop(x);
    for (const [bx, bl, bw, bh] of s.blocks ?? []) if (Math.abs(x - bx) <= bl / 2 && Math.abs(z) <= beam * bw / 2) by = Math.max(by, fcTop(bx) + bh);
    k.add(cylC(0.008, 0.009, 0.012, 6), COL.WHITE, { pos: [x, by + 0.006, z] });
    k.add(sphere(0.009, 6, 4), COL.WHITE, { pos: [x, by + 0.018, z], scale: [1, 1.3, 1] });
  }
  for (const [x, y, sz, dx, faces] of s.spy ?? []) {
    for (const zs of [1, -1]) for (const fwd of faces >= 4 ? [1, -1] : [1]) {
      const yaw = fwd > 0 ? zs * Math.PI / 4 : Math.PI - zs * Math.PI / 4;
      k.add(cylC(sz, sz, 0.004, 8), 0x2f3439, { pos: [x + fwd * dx, fcTop(x) + y, zs * beam * 0.32], rot: [0, -yaw, Math.PI / 2], scale: [1, 1, 1] });
    }
  }
  if (s.well) k.add(box(0.004, fb * 0.7, beam * 0.5), COL.DARK, { pos: [-0.502, fb * 0.1, 0] });
  if (s.cargo) {
    const cols = [0xb03a2e, 0x2e6fb0, 0xd9a520, 0x3a8a4a, 0x8a8f96];
    const [c0, c1] = s.cargo;
    const n = Math.max(1, Math.round((c1 - c0) / 0.1));
    for (let i = 0; i < n; i++) k.add(box((c1 - c0) / n * 0.92, 0.05, beam * 0.8), cols[i % cols.length], { pos: [c0 + (i + 0.5) * (c1 - c0) / n, fb, 0] });
  }
  return k.done();
}

// ===========================================================================
// Carriers & flat-deck amphibious ships
// ===========================================================================
export interface CarrierSpec {
  g: 'cv';
  beam: number; fb: number;
  /** Angled deck angle (rad, 0 = straight through-deck). */
  ang: number;
  /** Islands: [x, length, width, height]. */
  isl: [number, number, number, number][];
  ski?: number;
  cats?: number;
  well?: boolean;
  planes?: number;
  ptype?: 'jet' | 'heli' | 'mix';
  /** Deck overhang to port (fraction of beam) — angled-deck sponson. */
  port?: number;
  hullC?: number;
  bowSharp?: boolean;
}

export function carrier(s: CarrierSpec): BuiltModel {
  const k = new Kit();
  const b = s.beam / 2;
  const hc = s.hullC ?? COL.NAVY;
  const plan = hullPlan(s.beam * 0.78, s.bowSharp === false ? 0.14 : 0.24, 0.04);
  k.add(prismoid(inset(plan, 0.97, 0.85, -0.01), plan, s.fb), hc);
  k.add(prismoid(inset(plan, 0.95, 0.83, -0.012), inset(plan, 0.97, 0.85, -0.01), 0.022, -0.022), COL.HULLRED);
  // Flight deck outline.
  const port = s.port ?? (s.ang > 0 ? 0.35 : 0);
  const dp: P2[] = s.ang > 0
    ? [[-0.5, -b * 0.9], [-0.1, -b * (1 + port)], [0.18, -b * (1 + port * 0.9)], [0.3, -b * 0.75], [0.48, -b * 0.5], [0.5, b * 0.1], [0.46, b * 0.85], [0.1, b], [-0.46, b], [-0.5, b * 0.8]]
    : [[-0.5, -b * 0.85], [0.3, -b * 0.95], [0.47, -b * 0.6], [0.5, 0], [0.47, b * 0.6], [0.3, b * 0.95], [-0.5, b * 0.85]];
  const dt = 0.018;
  k.add(prismoid(dp, dp, dt), COL.DECK, { pos: [0, s.fb, 0] });
  const dy = s.fb + dt + 0.001;
  // Deck markings.
  if (s.ang > 0) {
    k.add(boxC(0.62, 0.002, 0.006), COL.WHITE, { pos: [-0.14, dy, -b * 0.28], rot: [0, s.ang, 0] });
    k.add(boxC(0.62, 0.002, 0.005), 0xd8c040, { pos: [-0.14, dy, -b * 0.08], rot: [0, s.ang, 0] });
  } else {
    k.add(boxC(0.85, 0.002, 0.005), COL.WHITE, { pos: [-0.02, dy, 0] });
  }
  for (let i = 0; i < (s.cats ?? 0); i++) {
    const z = i < 2 ? (i - 0.5) * b * 0.5 : -b * (0.4 + (i - 2) * 0.25);
    const x = i < 2 ? 0.3 : 0.02;
    k.add(boxC(0.28, 0.002, 0.004), 0x9ba3aa, { pos: [x, dy, z], rot: [0, i >= 2 ? s.ang * 0.8 : 0, 0] });
  }
  if (s.ski) {
    const sl = s.ski;
    k.add(extrudeXY([[0.5 - sl, 0], [0.5, 0], [0.5, sl * 0.28], [0.5 - sl * 0.3, sl * 0.12]], b * 1.2), COL.DECK, { pos: [0, dy - 0.001, s.ang > 0 ? -b * 0.25 : 0] });
  }
  // Islands (starboard).
  for (const [x, l, w, h] of s.isl) {
    const z = b - w / 2 - 0.004;
    k.tint(prismoid(rect(-l / 2, l / 2, -w / 2, w / 2), rect(-l / 2 * 0.85, l / 2 * 0.8, -w / 2 * 0.85, w / 2 * 0.85), h), COL.TINT, { pos: [x, dy, z] });
    k.add(box(0.004, h * 0.15, w * 0.8), COL.GLASS, { pos: [x + l / 2 * 0.82, dy + h * 0.7, z] });
    k.add(cylC(0.003, 0.005, h * 0.7, 4), COL.METAL, { pos: [x - l * 0.1, dy + h + h * 0.35, z] });
    k.add(boxC(0.01, 0.015, 0.04), COL.LIGHT, { pos: [x - l * 0.1, dy + h + h * 0.55, z] });
  }
  // Parked aircraft.
  const np = s.planes ?? 6;
  const pt = s.ptype ?? 'jet';
  for (let i = 0; i < np; i++) {
    const x = -0.4 + i * (0.6 / Math.max(1, np - 1));
    const z = b * 0.55;
    if (pt === 'heli' || (pt === 'mix' && i % 2 === 1)) {
      k.add(box(0.035, 0.012, 0.012), 0x8e949a, { pos: [x, dy, z] });
      k.add(boxC(0.07, 0.002, 0.004), 0x222222, { pos: [x, dy + 0.018, z], rot: [0, 0.6, 0] });
    } else {
      k.add(extrudeXZ([[0.028, 0], [-0.018, 0.024], [-0.022, 0.024], [-0.022, -0.024], [-0.018, -0.024]], 0.006), 0x9aa0a6, { pos: [x, dy, z], rot: [0, Math.PI * 0.8, 0] });
    }
  }
  if (s.well) k.add(box(0.004, s.fb * 0.7, s.beam * 0.4), COL.DARK, { pos: [-0.502, s.fb * 0.1, 0] });
  return k.done();
}

// ===========================================================================
// Submarines
// ===========================================================================
export interface SubSpec {
  g: 'sub';
  D: number;
  /** Sail: [x, length, height, style 0 upright / 1 blended (fillet) / 2 swept-back / 3 tall stepped]. */
  sail: [number, number, number, number?];
  planes?: 'sail' | 'bow';
  hump?: [number, number, number];
  tail?: '+' | 'x';
  pump?: boolean;
  pod?: boolean;
  wide?: number;
  shape?: 'tear' | 'cyl';
}

export function submarine(s: SubSpec): BuiltModel {
  const k = new Kit();
  const r = s.D / 2;
  const cy = r * 0.35;
  const sz = s.wide ?? 1;
  const tear = s.shape === 'tear';
  const prof: P2[] = tear
    ? [[-0.5, 0.05], [-0.36, 0.55], [-0.15, 0.92], [0.15, 1], [0.36, 0.9], [0.46, 0.62], [0.5, 0.05]]
    : [[-0.5, 0.05], [-0.4, 0.45], [-0.3, 0.88], [-0.22, 1], [0.35, 1], [0.44, 0.85], [0.49, 0.5], [0.5, 0.05]];
  const body = 0x2a2e33;
  k.add(lathe(prof.map(([x, f]) => [x, f * r] as P2), 12), body, { pos: [0, cy, 0], scale: [1, 1, sz] });
  const [sx, sl, sh0, st] = s.sail;
  const sh = sh0 * 1.35;
  const sy0 = cy + r * 0.8;
  const w = r * 0.42;
  if (st === 1) {
    const bot: P2[] = [[sx - sl * 0.7, 0], [sx - sl / 2, -w * 1.3], [sx + sl * 0.3, -w * 1.3], [sx + sl * 0.75, 0], [sx + sl * 0.3, w * 1.3], [sx - sl / 2, w * 1.3]];
    const top: P2[] = [[sx - sl * 0.45, 0], [sx - sl * 0.4, -w * 0.8], [sx + sl * 0.3, -w * 0.8], [sx + sl * 0.45, 0], [sx + sl * 0.3, w * 0.8], [sx - sl * 0.4, w * 0.8]];
    k.tint(prismoid(bot, top, sh), COL.TINT3, { pos: [0, sy0, 0] });
  } else if (st === 2) {
    const bot: P2[] = [[sx - sl / 2, -w], [sx + sl / 2, -w], [sx + sl / 2, w], [sx - sl / 2, w]];
    const top: P2[] = [[sx - sl / 2 - sl * 0.15, -w * 0.9], [sx + sl * 0.1, -w * 0.9], [sx + sl * 0.1, w * 0.9], [sx - sl / 2 - sl * 0.15, w * 0.9]];
    k.tint(prismoid(bot, top, sh), COL.TINT3, { pos: [0, sy0, 0] });
  } else if (st === 3) {
    k.tint(prismoid(rect(sx - sl / 2, sx + sl / 2, -w * 1.1, w * 1.1), rect(sx - sl / 2, sx + sl * 0.2, -w * 0.9, w * 0.9), sh * 0.55), COL.TINT3, { pos: [0, sy0, 0] });
    k.tint(prismoid(rect(sx - sl / 2, sx + sl * 0.2, -w * 0.9, w * 0.9), rect(sx - sl * 0.45, sx + sl * 0.1, -w * 0.8, w * 0.8), sh * 0.45), COL.TINT3, { pos: [0, sy0 + sh * 0.55, 0] });
  } else {
    const bot: P2[] = [[sx - sl / 2, 0], [sx - sl * 0.3, -w], [sx + sl * 0.3, -w], [sx + sl / 2, 0], [sx + sl * 0.3, w], [sx - sl * 0.3, w]];
    k.tint(prismoid(bot, inset(bot, 0.95, 0.9), sh), COL.TINT3, { pos: [0, sy0, 0] });
  }
  if ((s.planes ?? 'sail') === 'sail') k.add(plate([[sx + 0.02, 0], [sx, r * 1.7], [sx - 0.03, r * 1.7], [sx - 0.035, 0]], 0.008), body, { pos: [0, sy0 + sh * 0.6, 0] });
  if ((s.planes ?? 'sail') === 'sail') k.add(plate([[sx + 0.02, 0], [sx, -r * 1.7], [sx - 0.03, -r * 1.7], [sx - 0.035, 0]], 0.008), body, { pos: [0, sy0 + sh * 0.6, 0] });
  if (s.planes === 'bow') k.add(plate(rect(0.34, 0.39, -r * 1.7, r * 1.7), 0.008), body, { pos: [0, cy + r * 0.3, 0] });
  if (s.hump) {
    const [hx, hl, hh] = s.hump;
    k.add(prismoid(rect(hx - hl / 2, hx + hl / 2, -r * 0.7 * sz, r * 0.7 * sz), rect(hx - hl / 2 + 0.02, hx + hl / 2 - 0.01, -r * 0.55 * sz, r * 0.55 * sz), hh), body, { pos: [0, cy + r * 0.7, 0] });
    const n = Math.max(2, Math.round(hl / 0.04));
    for (let i = 0; i < n; i++) for (const z of [1, -1]) k.add(cylC(r * 0.14, r * 0.14, 0.003, 6), 0x3c4148, { pos: [hx - hl / 2 + 0.03 + i * (hl - 0.04) / Math.max(1, n - 1), cy + r * 0.7 + hh + 0.001, z * r * 0.28 * sz] });
  }
  // Tail control surfaces.
  const tx = -0.43;
  const fin = (rot: number) => k.add(extrudeXY([[tx + 0.06, 0], [tx - 0.01, r * 1.4], [tx - 0.05, r * 1.4], [tx - 0.04, 0]], 0.008), body, { pos: [tx * 0 + 0, cy, 0], rot: [rot, 0, 0] });
  const rots = s.tail === 'x' ? [Math.PI / 4, -Math.PI / 4, Math.PI * 0.75, -Math.PI * 0.75] : [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  for (const rt of rots) fin(rt);
  if (s.pump) k.add(cylC(r * 0.5, r * 0.42, 0.05, 10), 0x3a3f45, { pos: [-0.5, cy, 0], rot: [0, 0, Math.PI / 2] });
  else k.add(cylC(r * 0.08, r * 0.08, 0.02, 6), 0x7a6a40, { pos: [-0.505, cy, 0], rot: [0, 0, Math.PI / 2] });
  if (s.pod) k.add(lathe([[-0.06, 0.004], [-0.03, r * 0.28], [0.03, r * 0.28], [0.05, 0.004]], 8), body, { pos: [tx - 0.03, cy + r * 1.35, 0] });
  return k.done();
}

// ===========================================================================
// Dispatcher
// ===========================================================================
export type ModelSpec = VehSpec | SoldierSpec | TowedSpec | AirSpec | HeliSpec | ShipSpec | CarrierSpec | SubSpec;

export function buildSpec(s: ModelSpec): BuiltModel {
  switch (s.g) {
    case 'veh': return vehicle(s);
    case 'soldier': return soldier(s);
    case 'towed': return towedGun(s);
    case 'air': return aircraft(s);
    case 'heli': return helicopter(s);
    case 'ship': return ship(s);
    case 'cv': return carrier(s);
    case 'sub': return submarine(s);
  }
}

// ===========================================================================
// Public API: design lookup, cached building, standalone objects
// ===========================================================================
import { UNIT_DESIGNS } from '../../sim/data/units';
import { realUnitDesigns } from '../../sim/data/realdesigns';
import type { UnitDesign } from '../../sim/types';
import { specKey, visualFor, type DesignVisual } from './modelSpecs';

let designIndex: Map<string, UnitDesign> | null = null;
/** Design lookup (generic sim designs + real equipment) by id. */
export function designById(id: string): UnitDesign | undefined {
  if (!designIndex) {
    designIndex = new Map();
    for (const d of UNIT_DESIGNS) designIndex.set(d.id, d);
    for (const d of realUnitDesigns()) designIndex.set(d.id, d);
  }
  return designIndex.get(id);
}

/** Resolved visual of a design with short geometry keys (cached per design id). */
export interface ResolvedVisual { v: DesignVisual; mainKey: string; extraKey: string | null }
const visCache = new Map<string, ResolvedVisual>();
const keyOfSpec = new Map<string, string>();
const specByKey = new Map<string, ModelSpec>();
const built = new Map<string, BuiltModel>();
/** Short stable id for a spec; identical specs share one id (and one geometry). */
export function internSpec(s: ModelSpec): string {
  const full = specKey(s);
  let k = keyOfSpec.get(full);
  if (!k) {
    k = `m${keyOfSpec.size}`;
    keyOfSpec.set(full, k);
    specByKey.set(k, s);
  }
  return k;
}
export function resolvedVisual(d: UnitDesign): ResolvedVisual {
  let r = visCache.get(d.id);
  if (!r) {
    const v = visualFor(d);
    r = { v, mainKey: internSpec(v.main), extraKey: v.extra ? internSpec(v.extra) : null };
    visCache.set(d.id, r);
  }
  return r;
}
/** Built model for a key (null if the key is unknown). Builds and caches on first use. */
export function builtModel(key: string): BuiltModel | null {
  let b = built.get(key);
  if (!b) {
    const s = specByKey.get(key);
    if (!s) return null;
    b = buildSpec(s);
    built.set(key, b);
  }
  return b;
}
export const isBuilt = (key: string): boolean => built.has(key);

/** Copy of a model geometry with the nation tint baked into the vertex colours (for standalone rendering). */
export function bakeTint(geo: THREE.BufferGeometry, tint: THREE.ColorRepresentation): THREE.BufferGeometry {
  const g = geo.clone();
  const c = new THREE.Color(tint);
  const col = g.getAttribute('color') as THREE.BufferAttribute | undefined;
  const t = g.getAttribute('aTint') as THREE.BufferAttribute | undefined;
  if (col && t) {
    for (let i = 0; i < col.count; i++) {
      const w = t.getX(i);
      col.setXYZ(i, col.getX(i) * (1 - w + w * c.r), col.getY(i) * (1 - w + w * c.g), col.getZ(i) * (1 - w + w * c.b));
    }
  }
  return g;
}

const rotorGeoCache = new Map<string, G>();
export function rotorGeo(r: number, b: number): G {
  const k = `${r.toFixed(3)}|${b}`;
  let g = rotorGeoCache.get(k);
  if (!g) rotorGeoCache.set(k, (g = rotorGeometry(r, b)));
  return g;
}

/** Standalone object of a spec (tint baked, rotors as child meshes). */
export function buildSpecObject(s: ModelSpec, tint: THREE.ColorRepresentation = 0x7d8a6a): THREE.Object3D {
  const b = buildSpec(s);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(bakeTint(b.geo, tint), mat));
  b.geo.dispose();
  for (const r of b.rotors) {
    const m = new THREE.Mesh(rotorGeometry(r.r, r.b), mat);
    m.position.set(r.x, r.y, r.z);
    m.rotation.y = r.dir * 0.4;
    group.add(m);
  }
  return group;
}

/**
 * Standalone, correctly oriented model of a design (+x forward, y up, roughly
 * unit length, base at y = 0) for offscreen thumbnail / preview rendering.
 * Returns a Group of Meshes (MeshStandardMaterial, vertex colours; `tint`
 * recolours the nation-coloured parts). Caller disposes geometries/materials.
 */
export function buildDesignObject(designId: string, tint: THREE.ColorRepresentation = 0x7d8a6a): THREE.Object3D | null {
  const d = designById(designId);
  if (!d) return null;
  const o = buildSpecObject(resolvedVisual(d).v.main, tint);
  o.name = designId;
  return o;
}
