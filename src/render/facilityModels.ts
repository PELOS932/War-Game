import * as THREE from 'three';
import { FacilityType } from '../sim/types';
import { box, cone, cyl, extrudeXY, extrudeXZ, merge, part, prism, sphere } from './models/geom';

/**
 * Procedural low-poly facility models, detailed enough to be recognisable up
 * close (map at low zoom, UI thumbnails). Footprint ≈ [-0.5, 0.5]² in xz,
 * base at y = 0, height ≲ 0.9. Parts with tint = 1 take the owner's nation
 * colour (flags, roof trims); the rest keep their vertex colour.
 */

const CONC = 0xbdb9b0, CONC2 = 0x9f9b93, DARK = 0x33363a, METAL = 0x8a9095, STEEL = 0x6c7278, ROOF = 0x5f6368;
const RED = 0xb03a2a, WHITE = 0xe8e8e4, YELLOW = 0xe0b020, GLASS = 0x3c5a78, WATER = 0x2f6f96, ASPHALT = 0x3a3c3f;
const GRASS = 0x5f7a3a, DIRT = 0x8a7152, OLIVE = 0x5d6647;
const T = { tint: 1 };

type V3 = [number, number, number];
const _q = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** Square-section beam from a to b. */
function beam(a: V3, b: V3, th: number, col: number): THREE.BufferGeometry {
  _a.set(...a);
  _b.set(...b);
  const d = _b.clone().sub(_a);
  const len = d.length();
  const g = new THREE.BoxGeometry(th, len, th);
  _q.setFromUnitVectors(_up, d.normalize());
  g.applyQuaternion(_q);
  g.translate((_a.x + _b.x) / 2, (_a.y + _b.y) / 2, (_a.z + _b.z) / 2);
  return part(g, col);
}

/** Tapered 4-legged lattice tower with cross braces. */
function lattice(x: number, z: number, bw: number, tw: number, h: number, col: number, levels = 3, th = 0.014): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const at = (sx: number, sz: number, t: number): V3 => {
    const w = (bw + (tw - bw) * t) / 2;
    return [x + sx * w, h * t, z + sz * w];
  };
  const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of corners) out.push(beam(at(sx, sz, 0), at(sx, sz, 1), th, col));
  for (let l = 1; l <= levels; l++) {
    const t = l / levels, t0 = (l - 1) / levels;
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
      out.push(beam(at(ax, az, t), at(bx, bz, t), th * 0.7, col));
      out.push(beam(at(ax, az, t0), at(bx, bz, t), th * 0.6, col));
    }
  }
  return out;
}

/** Box building with flat roof slab. */
function hall(w: number, h: number, d: number, x: number, z: number, col = CONC, roof = ROOF): THREE.BufferGeometry[] {
  return [part(box(w, h, d), col, { pos: [x, 0, z] }), part(box(w * 1.03, 0.015, d * 1.03), roof, { pos: [x, h, z] })];
}

/** Building with gable roof; ridge along x. */
function gable(w: number, h: number, d: number, rh: number, x: number, z: number, col: number, roof: number, tint = 0): THREE.BufferGeometry[] {
  return [
    part(box(w, h, d), col, { pos: [x, 0, z] }),
    part(prism(d * 1.08, rh, w * 1.04), roof, { tint, pos: [x, h, z], rot: [0, Math.PI / 2, 0] }),
  ];
}

/** Half-cylinder (Quonset/hangar) roof building along x. */
function arched(len: number, r: number, x: number, z: number, col: number, open = false): THREE.BufferGeometry[] {
  const g = new THREE.CylinderGeometry(r, r, len, 14, 1, open, 0, Math.PI).rotateZ(Math.PI / 2);
  const out = [part(g, col, { pos: [x, 0, z] })];
  if (!open) out.push(part(box(0.01, r * 0.8, r * 1.4), DARK, { pos: [x + len / 2 + 0.002, 0, z] }));
  return out;
}

function tankFarm(x: number, z: number, r: number, h: number, col = 0xd4d0c4): THREE.BufferGeometry[] {
  return [part(cyl(r, r, h, 14), col, { pos: [x, 0, z] }), part(cone(r * 1.02, r * 0.25, 14), 0xa8a49a, { pos: [x, h, z] })];
}

function chimney(x: number, z: number, r: number, h: number, bands = true): THREE.BufferGeometry[] {
  const out = [part(cyl(r * 0.8, r, h, 10), 0xd6d2ca, { pos: [x, 0, z] })];
  if (bands) {
    out.push(part(cyl(r * 0.84, r * 0.84, h * 0.08, 10), RED, { pos: [x, h * 0.9, z] }));
    out.push(part(cyl(r * 0.87, r * 0.87, h * 0.08, 10), RED, { pos: [x, h * 0.72, z] }));
  }
  out.push(part(cyl(r * 0.6, r * 0.6, 0.01, 10), DARK, { pos: [x, h, z] }));
  return out;
}

function flag(x: number, z: number, h = 0.42): THREE.BufferGeometry[] {
  return [
    part(cyl(0.006, 0.008, h, 5), METAL, { pos: [x, 0, z] }),
    part(box(0.004, 0.07, 0.11), 0xffffff, { ...T, pos: [x, h - 0.075, z + 0.058] }),
  ];
}

function ground(w: number, d: number, col: number, x = 0, z = 0): THREE.BufferGeometry {
  return part(box(w, 0.012, d), col, { pos: [x, 0, z] });
}

function truckModel(x: number, z: number, rotY: number, col = OLIVE): THREE.BufferGeometry[] {
  const c = Math.cos(rotY), s = Math.sin(rotY);
  const at = (lx: number): V3 => [x + lx * c, 0.012, z - lx * s];
  return [
    part(box(0.07, 0.05, 0.05), 0xd0cfc8, { pos: at(0.045), rot: [0, rotY, 0] }),
    part(box(0.11, 0.06, 0.055), col, { pos: at(-0.04), rot: [0, rotY, 0] }),
  ];
}

function coolingTower(r: number, h: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const rr = r * (1 - 0.42 * Math.sin(Math.min(1, t / 0.8) * Math.PI * 0.62) + 0.06 * Math.max(0, t - 0.8) / 0.2);
    pts.push(new THREE.Vector2(rr, t * h));
  }
  return new THREE.LatheGeometry(pts, 20);
}

function windTurbine(x: number, z: number, h: number, phase: number): THREE.BufferGeometry[] {
  const out = [part(cyl(0.008, 0.016, h, 6), WHITE, { pos: [x, 0, z] }), part(box(0.05, 0.025, 0.025), WHITE, { pos: [x + 0.01, h - 0.012, z] })];
  for (let i = 0; i < 3; i++) {
    out.push(part(box(0.008, h * 0.42, 0.02).translate(0, h * 0.21, 0), WHITE, { pos: [x + 0.04, h, z], rot: [phase + (i * 2 * Math.PI) / 3, 0, 0] }));
  }
  return out;
}

function logPile(x: number, z: number, n: number, len: number, rotY = 0): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const r = 0.024;
  let row = 0, k = n;
  while (k > 0) {
    for (let i = 0; i < k; i++) {
      const off = (i - (k - 1) / 2) * r * 2.05;
      const c = Math.cos(rotY), s = Math.sin(rotY);
      out.push(part(cyl(r, r, len, 7), i % 2 ? 0x8a633c : 0x7a5530, { pos: [x + off * s, r + row * r * 1.75, z + off * c], rot: [0, rotY, Math.PI / 2] }));
    }
    row++;
    k--;
  }
  return out;
}

function tree(x: number, z: number, s: number, col = 0x2f5a22): THREE.BufferGeometry[] {
  return [part(cyl(0.008 * s * 1.5, 0.012 * s * 1.5, 0.08 * s, 5), 0x5a4030, { pos: [x, 0, z] }), part(sphere(0.06 * s, 7, 5), col, { pos: [x, 0.1 * s, z], scale: [1, 0.9, 1] })];
}

/** Stepped open-pit crater (lathe): pit floor at y≈0, rim at y = h. */
function openPit(rIn: number, rOut: number, h: number, steps: number, col: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0.001, 0.004)];
  for (let i = 0; i <= steps; i++) {
    const r = rIn + ((rOut - rIn) * i) / steps;
    const y = (h * i) / steps + 0.004;
    if (i > 0) pts.push(new THREE.Vector2(r - (rOut - rIn) / steps * 0.25, y));
    pts.push(new THREE.Vector2(r, y));
  }
  pts.push(new THREE.Vector2(rOut + 0.08, 0));
  pts.reverse();
  return part(new THREE.LatheGeometry(pts, 24), col);
}

export function buildFacilityGeometry(t: FacilityType): THREE.BufferGeometry {
  switch (t) {
    case FacilityType.Farm: {
      const p: THREE.BufferGeometry[] = [ground(1.0, 0.9, GRASS, 0, 0.02)];
      // Crop fields with furrows.
      const fields: [number, number, number, number, number, number][] = [
        [-0.24, 0.24, 0.44, 0.38, 0xc9a843, 0xb08e32], // wheat
        [0.24, 0.24, 0.44, 0.38, 0x6f9a3a, 0x587e2c], // green crop
        [0.24, -0.22, 0.44, 0.4, 0x8a6a45, 0x735636], // ploughed
      ];
      for (const [x, z, w, d, c1, c2] of fields) {
        const n = 7;
        for (let i = 0; i < n; i++) p.push(part(box(w, 0.018, d / n * 0.92), i % 2 ? c1 : c2, { pos: [x, 0.012, z - d / 2 + (i + 0.5) * d / n] }));
      }
      p.push(...gable(0.24, 0.13, 0.15, 0.09, -0.24, -0.2, 0xa23a2a, 0x4a3a30));
      p.push(part(box(0.06, 0.08, 0.005), 0xe8e0d0, { pos: [-0.12 + 0.001, 0, -0.2], rot: [0, Math.PI / 2, 0] }));
      p.push(part(cyl(0.045, 0.045, 0.3, 10), 0xc8ccd0, { pos: [-0.42, 0, -0.34] }), part(sphere(0.045, 10, 5), 0x9aa0a6, { pos: [-0.42, 0.3, -0.34] }));
      p.push(part(cyl(0.04, 0.04, 0.25, 10), 0xc8ccd0, { pos: [-0.42, 0, -0.22] }), part(sphere(0.04, 10, 5), 0x9aa0a6, { pos: [-0.42, 0.25, -0.22] }));
      p.push(...gable(0.12, 0.08, 0.1, 0.06, -0.05, -0.36, 0xe4ddc8, 0x6a4a3a));
      p.push(part(box(0.06, 0.035, 0.035), 0x3a7a3a, { pos: [0.02, 0.012, -0.12] }), part(cyl(0.02, 0.02, 0.012, 8), DARK, { pos: [0.0, 0.03, -0.1], rot: [Math.PI / 2, 0, 0] }));
      return merge(p);
    }
    case FacilityType.Plantation: {
      const p: THREE.BufferGeometry[] = [ground(1.0, 0.9, 0x4a5a2a, 0, 0)];
      for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) {
        const x = -0.42 + i * 0.16 + (j % 2) * 0.04, z = -0.1 + j * 0.15;
        p.push(part(cyl(0.008, 0.011, 0.14, 5), 0x8a8070, { pos: [x, 0, z] }));
        p.push(part(sphere(0.065, 7, 5), j % 2 ? 0x2c5a24 : 0x376a2a, { pos: [x, 0.17, z], scale: [1, 0.85, 1] }));
      }
      p.push(...gable(0.26, 0.1, 0.14, 0.06, 0.26, -0.32, 0x9a7a52, 0x5a4a3a));
      p.push(part(box(0.12, 0.05, 0.1), 0xe8e4d8, { pos: [-0.05, 0, -0.34] }));
      for (let i = 0; i < 4; i++) p.push(part(cyl(0.02, 0.02, 0.04, 8), 0xf0ecdc, { pos: [-0.3 + i * 0.05, 0.012, -0.32] }));
      p.push(...truckModel(-0.32, -0.2, 0, 0x6a5a3a));
      return merge(p);
    }
    case FacilityType.LumberMill: {
      const p: THREE.BufferGeometry[] = [ground(1.0, 0.9, 0x6a5a40)];
      p.push(...gable(0.42, 0.16, 0.22, 0.1, -0.18, -0.24, 0x8a6a48, 0x4a4c4e));
      // Open saw shed.
      for (const [x, z] of [[0.12, -0.34], [0.36, -0.34], [0.12, -0.14], [0.36, -0.14]] as [number, number][]) p.push(part(box(0.018, 0.14, 0.018), 0x6a5a48, { pos: [x, 0, z] }));
      p.push(part(box(0.3, 0.012, 0.26), ROOF, { pos: [0.24, 0.14, -0.24], rot: [0.1, 0, 0] }));
      p.push(part(cyl(0.035, 0.035, 0.01, 12), METAL, { pos: [0.24, 0.07, -0.24], rot: [Math.PI / 2, 0, 0] }));
      p.push(...logPile(-0.22, 0.2, 4, 0.34), ...logPile(0.2, 0.18, 3, 0.3), ...logPile(0.24, 0.02, 3, 0.26, 0.2));
      // Plank stacks.
      for (let i = 0; i < 4; i++) p.push(part(box(0.2, 0.02, 0.1), i % 2 ? 0xd8b880 : 0xc8a870, { pos: [-0.24, 0.012 + i * 0.022, 0.4] }));
      p.push(...chimney(-0.38, -0.34, 0.025, 0.36, false));
      p.push(...tree(0.42, 0.4, 1.3), ...tree(0.3, 0.44, 1.1), ...tree(0.44, 0.26, 1.2));
      return merge(p);
    }
    case FacilityType.OilWell: {
      const p: THREE.BufferGeometry[] = [ground(1.0, 0.9, 0x8a7a5a)];
      // Drilling derrick.
      p.push(part(box(0.2, 0.04, 0.2), DARK, { pos: [-0.25, 0, -0.1] }));
      p.push(...lattice(-0.25, -0.1, 0.16, 0.04, 0.78, 0xc9a42a, 5, 0.012));
      p.push(part(box(0.07, 0.03, 0.07), 0xc9a42a, { pos: [-0.25, 0.78, -0.1] }));
      // Pumpjack.
      const px = 0.2, pz = 0.18;
      p.push(part(box(0.3, 0.025, 0.08), DARK, { pos: [px, 0, pz] }));
      p.push(beam([px - 0.02, 0.02, pz - 0.035], [px, 0.2, pz], 0.014, STEEL), beam([px - 0.02, 0.02, pz + 0.035], [px, 0.2, pz], 0.014, STEEL), beam([px + 0.06, 0.02, pz], [px, 0.2, pz], 0.014, STEEL));
      p.push(part(box(0.34, 0.03, 0.028), 0x2a2c2e, { pos: [px + 0.02, 0.19, pz], rot: [0, 0, 0.12] }));
      p.push(part(extrudeXY([[0, -0.07], [0.05, -0.02], [0.05, 0.04], [0, 0.05]], 0.034), 0x2a2c2e, { pos: [px + 0.18, 0.21, pz] }));
      p.push(part(cyl(0.004, 0.004, 0.15, 4), METAL, { pos: [px + 0.225, 0.02, pz] }));
      p.push(part(box(0.1, 0.07, 0.012), RED, { pos: [px - 0.12, 0.02, pz + 0.03] }), part(box(0.1, 0.07, 0.012), RED, { pos: [px - 0.12, 0.02, pz - 0.03] }));
      p.push(...tankFarm(0.3, -0.26, 0.09, 0.16), ...tankFarm(0.1, -0.3, 0.07, 0.13));
      p.push(beam([0.14, 0.03, 0.12], [0.22, 0.03, -0.2], 0.012, METAL));
      p.push(...flag(-0.44, 0.38, 0.3));
      return merge(p);
    }
    case FacilityType.OffshorePlatform: {
      const p: THREE.BufferGeometry[] = [];
      for (const [x, z] of [[-0.28, -0.22], [0.28, -0.22], [-0.28, 0.22], [0.28, 0.22]] as [number, number][]) {
        p.push(part(cyl(0.035, 0.045, 0.34, 8), 0xd0a830, { pos: [x, -0.14, z] }));
      }
      p.push(beam([-0.28, 0.02, -0.22], [0.28, 0.12, -0.22], 0.015, 0xd0a830), beam([-0.28, 0.02, 0.22], [0.28, 0.12, 0.22], 0.015, 0xd0a830));
      p.push(part(box(0.72, 0.05, 0.56), 0x5a6068, { pos: [0, 0.2, 0] }));
      p.push(part(box(0.66, 0.04, 0.5), 0x6a7078, { pos: [0, 0.34, 0] }));
      for (const [x, z] of [[-0.3, -0.22], [0.3, -0.22], [-0.3, 0.22], [0.3, 0.22]] as [number, number][]) p.push(part(box(0.025, 0.1, 0.025), STEEL, { pos: [x, 0.25, z] }));
      // Quarters + helideck.
      p.push(part(box(0.24, 0.16, 0.2), WHITE, { pos: [-0.2, 0.38, 0.12] }));
      p.push(part(box(0.24, 0.02, 0.005), GLASS, { pos: [-0.2, 0.47, 0.223] }));
      p.push(part(cyl(0.12, 0.12, 0.015, 16), 0x3a6a3a, { pos: [-0.24, 0.54, 0.12] }), part(cyl(0.1, 0.1, 0.004, 16), 0xe0d040, { pos: [-0.24, 0.555, 0.12] }), part(cyl(0.085, 0.085, 0.004, 16), 0x3a6a3a, { pos: [-0.24, 0.558, 0.12] }));
      // Derrick.
      p.push(...lattice(0.12, -0.08, 0.14, 0.035, 0.52, 0xe0e0dc, 4, 0.011).map((g) => g.translate(0, 0.38, 0)));
      // Flare boom.
      p.push(beam([0.3, 0.36, 0.22], [0.56, 0.62, 0.36], 0.014, STEEL));
      p.push(part(cone(0.035, 0.1, 6), 0xff8a20, { pos: [0.56, 0.62, 0.36] }), part(cone(0.02, 0.06, 6), 0xffe070, { pos: [0.56, 0.63, 0.36] }));
      // Crane.
      p.push(part(cyl(0.02, 0.02, 0.1, 6), YELLOW, { pos: [0.28, 0.36, 0.2] }), beam([0.28, 0.46, 0.2], [0.08, 0.6, 0.36], 0.012, YELLOW));
      p.push(...flag(-0.34, -0.24, 0.3).map((g) => g.translate(0, 0.36, 0)));
      return merge(p);
    }
    case FacilityType.CoalMine: {
      const p: THREE.BufferGeometry[] = [ground(1.0, 0.9, 0x5a5448)];
      // Headframe: tower + back legs + sheave wheels.
      const hx = -0.18, hz = -0.12;
      p.push(...lattice(hx, hz, 0.14, 0.08, 0.62, 0x9a3a2a, 4, 0.016));
      p.push(beam([hx + 0.3, 0, hz - 0.06], [hx + 0.04, 0.58, hz - 0.03], 0.02, 0x9a3a2a), beam([hx + 0.3, 0, hz + 0.06], [hx + 0.04, 0.58, hz + 0.03], 0.02, 0x9a3a2a));
      p.push(part(box(0.12, 0.03, 0.12), 0x9a3a2a, { pos: [hx, 0.62, hz] }));
      for (const dz of [-0.035, 0.035]) p.push(part(cyl(0.06, 0.06, 0.012, 14), DARK, { pos: [hx, 0.66, hz + dz], rot: [Math.PI / 2, 0, 0] }));
      p.push(...gable(0.2, 0.14, 0.16, 0.06, hx + 0.36, hz, 0x8a6a52, 0x4a4c4e));
      // Coal heaps + conveyor.
      p.push(part(cone(0.18, 0.16, 10), 0x1e1e1e, { pos: [0.24, 0, 0.26], scale: [1.3, 1, 1] }), part(cone(0.1, 0.1, 9), 0x2a2826, { pos: [-0.02, 0, 0.32] }));
      p.push(beam([hx + 0.06, 0.25, hz + 0.06], [0.2, 0.18, 0.24], 0.03, STEEL));
      // Rail wagons.
      p.push(part(box(0.9, 0.008, 0.06), 0x4a4038, { pos: [0, 0.012, 0.42] }));
      for (let i = 0; i < 4; i++) p.push(part(box(0.14, 0.06, 0.06), 0x4a3a30, { pos: [-0.3 + i * 0.16, 0.02, 0.42] }), part(box(0.12, 0.02, 0.05), 0x151515, { pos: [-0.3 + i * 0.16, 0.08, 0.42] }));
      return merge(p);
    }
    case FacilityType.OreMine: {
      const p: THREE.BufferGeometry[] = [openPit(0.08, 0.36, 0.16, 4, 0xa0724a)];
      p.push(part(cyl(0.08, 0.08, 0.006, 12), 0x5a8a9a, { pos: [0, 0.004, 0] }));
      // Haul trucks on the benches.
      p.push(part(box(0.08, 0.05, 0.05), YELLOW, { pos: [0.2, 0.08, 0.05] }), part(box(0.05, 0.035, 0.045), 0x8a5a3a, { pos: [0.19, 0.13, 0.05] }));
      p.push(part(box(0.08, 0.05, 0.05), YELLOW, { pos: [-0.12, 0.04, -0.16], rot: [0, 0.8, 0] }));
      // Spoil heap, crusher + conveyor.
      p.push(part(cone(0.16, 0.2, 9), 0x7a5a40, { pos: [-0.38, 0, 0.36], scale: [1.2, 1, 1] }));
      p.push(...hall(0.16, 0.18, 0.14, 0.38, -0.36, 0x8a8478));
      p.push(beam([0.3, 0.16, -0.3], [0.1, 0.02, -0.12], 0.03, STEEL));
      p.push(...lattice(0.44, -0.2, 0.06, 0.04, 0.3, STEEL, 2, 0.01));
      return merge(p);
    }
    case FacilityType.UraniumMine: {
      const p: THREE.BufferGeometry[] = [ground(1.0, 0.9, 0xa89a78), openPit(0.06, 0.24, 0.1, 3, 0x9a8a60).translate(-0.2, 0, 0.18)];
      // Processing mill (white) + tall vent stack.
      p.push(...hall(0.3, 0.2, 0.2, 0.22, -0.22, 0xe0e0d8, 0x7a8288));
      p.push(part(box(0.3, 0.03, 0.005), YELLOW, { pos: [0.22, 0.14, -0.119] }));
      p.push(...chimney(0.42, -0.02, 0.03, 0.5, true));
      p.push(...tankFarm(0.02, -0.28, 0.06, 0.18, 0xd8d8d0));
      // Yellowcake drums with warning plate.
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) p.push(part(cyl(0.018, 0.018, 0.05, 8), YELLOW, { pos: [0.16 + i * 0.045, 0.012, 0.1 + j * 0.045] }));
      p.push(part(box(0.1, 0.1, 0.008), YELLOW, { pos: [0.34, 0.04, 0.2] }), part(cyl(0.025, 0.025, 0.01, 3), 0x151515, { pos: [0.34, 0.09, 0.205], rot: [Math.PI / 2, 0, 0] }));
      // Shaft headframe.
      p.push(...lattice(-0.36, -0.28, 0.1, 0.05, 0.36, STEEL, 3, 0.012));
      p.push(part(box(0.9, 0.04, 0.008), 0xd8d8d0, { pos: [0, 0, 0.44] }));
      return merge(p);
    }
    case FacilityType.PowerPlant: {
      const p: THREE.BufferGeometry[] = [ground(1.0, 0.9, CONC2)];
      p.push(...hall(0.42, 0.2, 0.22, -0.12, 0.08, 0xc8c4bc, 0x6a6e72));
      p.push(...hall(0.2, 0.34, 0.22, 0.18, 0.08, 0xa8a49c, 0x5a5e62));
      p.push(part(box(0.62, 0.05, 0.005), 0x8a4a3a, { pos: [-0.02, 0.12, 0.191] }));
      p.push(...chimney(0.32, -0.22, 0.045, 0.85), ...chimney(0.16, -0.26, 0.04, 0.72));
      p.push(part(coolingTower(0.12, 0.3), 0xd8d6d0, { pos: [-0.3, 0, -0.26], flat: false }));
      p.push(part(cone(0.16, 0.12, 10), 0x1e1e1e, { pos: [-0.3, 0, 0.36], scale: [1.4, 1, 1] }));
      // Transformer yard.
      for (let i = 0; i < 3; i++) p.push(part(box(0.04, 0.05, 0.04), 0x6a7a6a, { pos: [0.1 + i * 0.08, 0.012, 0.35] }));
      p.push(...lattice(0.42, 0.36, 0.05, 0.02, 0.28, STEEL, 2, 0.008));
      return merge(p);
    }
    case FacilityType.NuclearPlant: {
      const p: THREE.BufferGeometry[] = [ground(1.0, 0.9, CONC2)];
      p.push(part(coolingTower(0.2, 0.62), 0xdedcd6, { pos: [-0.26, 0, -0.2], flat: false }));
      p.push(part(coolingTower(0.18, 0.56), 0xdedcd6, { pos: [-0.24, 0, 0.26], flat: false }));
      // Steam plume.
      p.push(part(sphere(0.12, 10, 6), 0xf2f2f2, { pos: [-0.26, 0.7, -0.2], scale: [1, 0.55, 1] }));
      // Containment domes + turbine hall.
      p.push(part(cyl(0.12, 0.12, 0.22, 18), 0xd0cec8, { pos: [0.2, 0, -0.2] }), part(sphere(0.12, 18, 8), 0xd0cec8, { pos: [0.2, 0.22, -0.2], scale: [1, 0.75, 1] }));
      p.push(part(cyl(0.1, 0.1, 0.18, 18), 0xd0cec8, { pos: [0.34, 0, 0.04] }), part(sphere(0.1, 18, 8), 0xd0cec8, { pos: [0.34, 0.18, 0.04], scale: [1, 0.75, 1] }));
      p.push(...hall(0.34, 0.14, 0.14, 0.14, 0.3, 0xc0c4c8, 0x5a6068));
      p.push(part(box(0.34, 0.03, 0.005), 0x3a6aa0, { pos: [0.14, 0.09, 0.231] }));
      p.push(...chimney(0.44, -0.4, 0.02, 0.36, true));
      return merge(p);
    }
    case FacilityType.HydroDam: {
      const p: THREE.BufferGeometry[] = [];
      // Reservoir (high, behind) and river (low, in front).
      p.push(part(box(0.5, 0.25, 1.0), 0x6a7a4a, { pos: [-0.26, 0, 0] }));
      p.push(part(box(0.46, 0.012, 0.9), WATER, { pos: [-0.24, 0.25, 0] }));
      p.push(part(box(0.44, 0.02, 0.4), 0x3f86b0, { pos: [0.28, 0, 0] }));
      p.push(part(box(0.44, 0.03, 0.3), 0x6a7a4a, { pos: [0.28, 0, 0.35] }), part(box(0.44, 0.03, 0.3), 0x6a7a4a, { pos: [0.28, 0, -0.35] }));
      // Curved dam wall.
      const wall: [number, number][] = [];
      const n = 10;
      for (let i = 0; i <= n; i++) { const a = -0.9 + (1.8 * i) / n; wall.push([Math.cos(a) * 0.55 - 0.55 + 0.02, Math.sin(a) * 0.55]); }
      for (let i = n; i >= 0; i--) { const a = -0.9 + (1.8 * i) / n; wall.push([Math.cos(a) * 0.65 - 0.55 + 0.02, Math.sin(a) * 0.65]); }
      p.push(part(extrudeXZ(wall, 0.34), 0xc4c0b6));
      p.push(part(box(0.06, 0.24, 0.2), 0xb0aca2, { pos: [0.1, 0, 0] }));
      for (let i = 0; i < 3; i++) p.push(part(box(0.1, 0.012, 0.05), 0xdff0ff, { pos: [0.14, 0.02 + i * 0.07, -0.06 + i * 0.06], rot: [0, 0, -0.9] }));
      // Powerhouse + pylons.
      p.push(...hall(0.12, 0.1, 0.34, 0.2, 0, 0xb8b4aa, 0x5a5e62));
      p.push(...lattice(0.4, 0.38, 0.05, 0.02, 0.3, STEEL, 2, 0.008), ...lattice(0.4, -0.38, 0.05, 0.02, 0.3, STEEL, 2, 0.008));
      return merge(p);
    }
    case FacilityType.RenewablePlant: {
      const p: THREE.BufferGeometry[] = [ground(1.0, 0.9, 0x6f8a44)];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
        const x = 0.02 + c * 0.16, z = -0.36 + r * 0.14;
        p.push(part(box(0.14, 0.008, 0.09), 0x1c3050, { pos: [x, 0.05, z], rot: [0.45, 0, 0] }));
        p.push(part(box(0.005, 0.05, 0.005), METAL, { pos: [x, 0, z + 0.02] }));
      }
      p.push(...windTurbine(-0.3, -0.3, 0.72, 0.2), ...windTurbine(-0.36, 0.08, 0.66, 1.1), ...windTurbine(-0.06, 0.34, 0.6, 0.6));
      p.push(...hall(0.12, 0.08, 0.08, 0.38, 0.34, 0xe0e0dc));
      return merge(p);
    }
    case FacilityType.ConsumerFactory: {
      const p: THREE.BufferGeometry[] = [ground(1.0, 0.9, 0x8a8a84)];
      p.push(part(box(0.6, 0.16, 0.42), 0xc4bcae, { pos: [-0.12, 0, -0.08] }));
      for (let i = 0; i < 5; i++) {
        p.push(part(prism(0.12, 0.08, 0.42), ROOF, { pos: [-0.36 + i * 0.12, 0.16, -0.08] }));
        p.push(part(box(0.005, 0.06, 0.4), 0x9ac0e0, { pos: [-0.36 + i * 0.12 + 0.058, 0.17, -0.08] }));
      }
      // Office block with glass bands and nation-coloured sign.
      p.push(part(box(0.18, 0.28, 0.16), 0xd8d4cc, { pos: [0.34, 0, -0.18] }));
      for (let i = 0; i < 4; i++) p.push(part(box(0.185, 0.03, 0.165), GLASS, { pos: [0.34, 0.04 + i * 0.06, -0.18] }));
      p.push(part(box(0.3, 0.04, 0.01), 0xffffff, { ...T, pos: [-0.12, 0.11, 0.135] }));
      p.push(...chimney(-0.36, 0.26, 0.02, 0.32, false));
      // Loading bay: trucks + parking.
      p.push(ground(0.4, 0.2, ASPHALT, 0.2, 0.3));
      p.push(...truckModel(0.08, 0.3, Math.PI / 2, 0x3a5a8a), ...truckModel(0.2, 0.3, Math.PI / 2, 0xb04a30), ...truckModel(0.32, 0.3, Math.PI / 2, 0xe0e0e0));
      return merge(p);
    }
    case FacilityType.IndustrialPlant: {
      const p: THREE.BufferGeometry[] = [ground(1.0, 0.9, 0x7a7870)];
      p.push(...hall(0.4, 0.22, 0.24, -0.22, -0.2, 0x9a968e, 0x5a5e62));
      p.push(...hall(0.24, 0.16, 0.2, -0.28, 0.2, 0xa8a49c, 0x5a5e62));
      // Distillation columns + tanks + pipe racks.
      p.push(part(cyl(0.04, 0.04, 0.62, 10), 0xd0d0cc, { pos: [0.12, 0, -0.14] }), part(cyl(0.03, 0.03, 0.5, 10), 0xd0d0cc, { pos: [0.22, 0, -0.1] }), part(cyl(0.05, 0.05, 0.4, 10), 0xd0d0cc, { pos: [0.16, 0, 0.02] }));
      for (const y of [0.18, 0.34, 0.5]) p.push(part(cyl(0.046, 0.046, 0.015, 10), STEEL, { pos: [0.12, y, -0.14] }));
      p.push(...tankFarm(0.36, 0.22, 0.09, 0.14), ...tankFarm(0.14, 0.32, 0.08, 0.12));
      p.push(beam([-0.02, 0.12, -0.12], [0.12, 0.12, -0.14], 0.02, STEEL), beam([0.22, 0.14, -0.1], [0.36, 0.14, 0.22], 0.018, STEEL));
      p.push(...chimney(0.4, -0.34, 0.04, 0.8), ...chimney(-0.04, 0.4, 0.035, 0.62));
      return merge(p);
    }
    case FacilityType.MilitaryFactory: {
      const p: THREE.BufferGeometry[] = [ground(1.0, 0.9, 0x6a6a5e)];
      p.push(...arched(0.62, 0.2, -0.12, -0.16, 0x5f6a4a));
      p.push(...hall(0.26, 0.2, 0.2, 0.3, -0.2, 0x6a7058, 0x3e4436));
      p.push(...chimney(0.38, -0.36, 0.025, 0.42, false));
      // Finished tanks lined up in the yard.
      for (let i = 0; i < 4; i++) {
        const x = -0.34 + i * 0.16, z = 0.26;
        p.push(part(box(0.11, 0.035, 0.07), OLIVE, { pos: [x, 0.012, z] }), part(box(0.06, 0.03, 0.05), 0x6e7858, { pos: [x - 0.01, 0.047, z] }));
        p.push(part(cyl(0.006, 0.006, 0.08, 5), DARK, { pos: [x + 0.06, 0.062, z], rot: [0, 0, Math.PI / 2] }));
      }
      // Perimeter fence + flag.
      p.push(part(box(0.96, 0.05, 0.006), 0x8a8a84, { pos: [0, 0, 0.44] }), part(box(0.006, 0.05, 0.88), 0x8a8a84, { pos: [0.48, 0, 0] }), part(box(0.006, 0.05, 0.88), 0x8a8a84, { pos: [-0.48, 0, 0] }));
      p.push(...flag(0.4, 0.1, 0.36));
      return merge(p);
    }
    case FacilityType.ResearchLab: {
      const p: THREE.BufferGeometry[] = [ground(1.0, 0.9, 0x6f8a54)];
      p.push(part(box(0.44, 0.18, 0.2), 0xe4e6e2, { pos: [-0.14, 0, 0.12] }));
      p.push(part(box(0.445, 0.05, 0.205), GLASS, { pos: [-0.14, 0.06, 0.12] }), part(box(0.445, 0.03, 0.205), GLASS, { pos: [-0.14, 0.13, 0.12] }));
      p.push(part(box(0.2, 0.28, 0.16), 0xd8dadc, { pos: [-0.26, 0, -0.14] }), part(box(0.205, 0.2, 0.02), GLASS, { pos: [-0.26, 0.05, -0.06] }));
      // Observatory dome.
      p.push(part(cyl(0.14, 0.14, 0.14, 20), WHITE, { pos: [0.24, 0, -0.18] }), part(sphere(0.14, 20, 10), 0xf0f0ee, { pos: [0.24, 0.14, -0.18] }));
      p.push(part(box(0.03, 0.12, 0.04), DARK, { pos: [0.24, 0.16, -0.05], rot: [0.5, 0, 0] }));
      // Satellite dish.
      p.push(part(cyl(0.012, 0.018, 0.12, 6), METAL, { pos: [0.3, 0, 0.26] }));
      p.push(part(new THREE.SphereGeometry(0.1, 14, 6, 0, Math.PI * 2, 0, 0.9), 0xe8e8e8, { pos: [0.3, 0.2, 0.26], rot: [0.5 + Math.PI, 0, 0.3], flat: false }));
      p.push(part(cyl(0.005, 0.005, 0.46, 4), METAL, { pos: [0.02, 0.18, -0.14] }));
      p.push(...flag(0.12, 0.34, 0.3));
      return merge(p);
    }
    case FacilityType.Barracks: {
      const p: THREE.BufferGeometry[] = [ground(1.0, 0.9, 0x7a7a5a)];
      for (let i = 0; i < 4; i++) p.push(...gable(0.46, 0.08, 0.1, 0.05, -0.2, -0.36 + i * 0.15, 0x7a7e62, 0x4a5040));
      // Parade ground + flag.
      p.push(ground(0.34, 0.3, 0xa8a898, 0.26, 0.24));
      p.push(...flag(0.26, 0.24, 0.46));
      // Watch tower + vehicles + fence.
      p.push(...lattice(0.42, -0.38, 0.06, 0.05, 0.28, 0x6a5a48, 2, 0.01), part(box(0.08, 0.05, 0.08), 0x6a5a48, { pos: [0.42, 0.28, -0.38] }), part(prism(0.1, 0.04, 0.1), 0x4a4a40, { pos: [0.42, 0.33, -0.38] }));
      p.push(...truckModel(0.2, -0.16, 0), ...truckModel(0.2, -0.06, 0));
      p.push(part(box(0.96, 0.04, 0.006), 0x8a8a84, { pos: [0, 0, 0.44] }), part(box(0.96, 0.04, 0.006), 0x8a8a84, { pos: [0, 0, -0.44] }));
      return merge(p);
    }
    case FacilityType.Airbase: {
      const p: THREE.BufferGeometry[] = [ground(1.2, 0.9, 0x6a7a4a)];
      p.push(part(box(1.2, 0.014, 0.18), ASPHALT, { pos: [0, 0, -0.26] }));
      for (let i = 0; i < 9; i++) p.push(part(box(0.06, 0.004, 0.012), WHITE, { pos: [-0.48 + i * 0.12, 0.014, -0.26] }));
      p.push(part(box(0.02, 0.004, 0.14), WHITE, { pos: [0.57, 0.014, -0.26] }), part(box(0.02, 0.004, 0.14), WHITE, { pos: [-0.57, 0.014, -0.26] }));
      p.push(part(box(1.0, 0.012, 0.06), 0x4a4c4e, { pos: [0, 0, -0.1] }), part(box(0.6, 0.012, 0.22), 0x55585a, { pos: [-0.1, 0, 0.1] }));
      // Hangars (open ends) + control tower.
      p.push(...arched(0.24, 0.12, -0.32, 0.3, 0x707468), ...arched(0.24, 0.12, 0.0, 0.3, 0x707468));
      p.push(part(cyl(0.03, 0.04, 0.3, 8), CONC, { pos: [0.34, 0, 0.26] }), part(cyl(0.065, 0.05, 0.06, 8), GLASS, { pos: [0.34, 0.3, 0.26] }), part(cyl(0.07, 0.07, 0.012, 8), DARK, { pos: [0.34, 0.36, 0.26] }));
      // Parked jets.
      for (let i = 0; i < 3; i++) {
        const x = -0.3 + i * 0.16, z = 0.08;
        p.push(part(box(0.1, 0.02, 0.02), 0x8a929a, { pos: [x, 0.02, z] }));
        p.push(part(extrudeXZ([[0.02, 0], [-0.03, 0.05], [-0.04, 0.05], [-0.03, 0], [-0.04, -0.05], [-0.03, -0.05]], 0.006), 0x8a929a, { pos: [x, 0.025, z] }));
        p.push(part(box(0.02, 0.03, 0.004), 0x8a929a, { pos: [x - 0.045, 0.03, z] }));
      }
      p.push(...flag(0.46, 0.38, 0.3));
      return merge(p);
    }
    case FacilityType.NavalBase: {
      const p: THREE.BufferGeometry[] = [];
      p.push(part(box(1.0, 0.004, 0.6), WATER, { pos: [0, 0, 0.16] }));
      p.push(part(box(1.0, 0.06, 0.34), CONC, { pos: [0, 0, -0.32] }));
      p.push(part(box(0.08, 0.05, 0.5), CONC2, { pos: [-0.22, 0, 0.12] }), part(box(0.08, 0.05, 0.5), CONC2, { pos: [0.2, 0, 0.12] }));
      // Docked warship.
      const hullG = extrudeXZ([[-0.2, -0.045], [0.12, -0.045], [0.22, 0], [0.12, 0.045], [-0.2, 0.045]], 0.05);
      p.push(part(hullG.clone(), 0x7a848e, { pos: [0, 0, 0.12], rot: [0, Math.PI / 2, 0] }));
      p.push(part(box(0.07, 0.06, 0.12), 0x9aa2aa, { pos: [0, 0.05, 0.08] }), part(cyl(0.004, 0.006, 0.1, 4), METAL, { pos: [0, 0.11, 0.08] }));
      p.push(part(hullG, 0x7a848e, { pos: [0.4, 0, 0.18], rot: [0, Math.PI / 2, 0], scale: [0.8, 1, 1] }));
      // Gantry cranes.
      for (const x of [-0.36, 0.34]) {
        p.push(beam([x - 0.05, 0.06, -0.2], [x - 0.05, 0.38, -0.2], 0.018, YELLOW), beam([x + 0.05, 0.06, -0.2], [x + 0.05, 0.38, -0.2], 0.018, YELLOW));
        p.push(beam([x, 0.4, -0.3], [x, 0.4, 0.06], 0.02, YELLOW), part(box(0.14, 0.04, 0.04), YELLOW, { pos: [x, 0.37, -0.2] }));
      }
      p.push(...hall(0.3, 0.12, 0.14, -0.04, -0.38, 0x8a8e92, 0x5a5e62).map((g) => g.translate(0, 0.06, 0)));
      p.push(...flag(0.46, -0.44, 0.3).map((g) => g.translate(0, 0.06, 0)));
      return merge(p);
    }
    case FacilityType.MissileSilo: {
      const p: THREE.BufferGeometry[] = [ground(1.0, 0.9, 0x7a7a60)];
      p.push(part(cyl(0.3, 0.33, 0.03, 20), CONC, {}));
      // Open silo with missile nose + slid-back hatch.
      p.push(part(cyl(0.1, 0.1, 0.035, 16), 0x1a1a1a, { pos: [-0.06, 0, 0] }));
      p.push(part(cyl(0.05, 0.05, 0.1, 12), 0xe8e8e4, { pos: [-0.06, 0.02, 0] }), part(cone(0.05, 0.12, 12), RED, { pos: [-0.06, 0.12, 0] }));
      p.push(part(box(0.22, 0.03, 0.22), 0x5a5e58, { pos: [0.2, 0.03, 0] }));
      // Second (closed) silo.
      p.push(part(cyl(0.09, 0.09, 0.045, 16), 0x5a5e58, { pos: [-0.3, 0, 0.3] }), part(box(0.14, 0.006, 0.02), YELLOW, { pos: [-0.3, 0.046, 0.3] }));
      // Fence posts + command bunker + mast.
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; p.push(part(box(0.01, 0.06, 0.01), 0x8a8a84, { pos: [Math.cos(a) * 0.44, 0, Math.sin(a) * 0.4] })); }
      p.push(part(box(0.14, 0.07, 0.1), 0x6a7058, { pos: [0.28, 0, 0.3] }), part(sphere(0.06, 10, 5, ), 0x6a7058, { pos: [0.28, 0.06, 0.3], scale: [1.2, 0.5, 0.9] }));
      p.push(part(cyl(0.006, 0.006, 0.4, 4), METAL, { pos: [0.34, 0, -0.3] }));
      p.push(...flag(0.4, 0.1, 0.3));
      return merge(p);
    }
    case FacilityType.SupplyDepot: {
      const p: THREE.BufferGeometry[] = [ground(1.0, 0.9, 0x8a8674)];
      p.push(...gable(0.44, 0.14, 0.2, 0.06, -0.18, -0.26, 0x8a8a7a, 0x5a5e52));
      p.push(...arched(0.28, 0.1, 0.28, -0.28, 0x6a7058));
      // Container stacks.
      const cols = [0x6a7a4a, 0x7a6a4a, 0x5a6a5a, 0xa0522d, 0x3a5a7a];
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < (i + j) % 3 + 1; k++) {
        p.push(part(box(0.14, 0.055, 0.06), cols[(i * 2 + j + k) % cols.length], { pos: [-0.34 + i * 0.16, 0.012 + k * 0.056, 0.08 + j * 0.07] }));
      }
      // Fuel tanks + trucks + crates.
      p.push(...tankFarm(0.3, 0.14, 0.07, 0.12, 0x7a8a6a), ...tankFarm(0.42, 0.28, 0.06, 0.1, 0x7a8a6a));
      p.push(...truckModel(-0.2, 0.36, 0), ...truckModel(0.0, 0.36, 0), ...truckModel(0.2, 0.38, 0.3));
      p.push(...flag(0.44, -0.08, 0.3));
      return merge(p);
    }
    case FacilityType.RadarStation: {
      const p: THREE.BufferGeometry[] = [ground(1.0, 0.9, 0x6a7a54)];
      // Radome on a tower.
      p.push(part(cyl(0.1, 0.12, 0.3, 10), CONC, { pos: [-0.14, 0, -0.08] }));
      p.push(part(sphere(0.2, 18, 12), 0xf0f0ec, { pos: [-0.14, 0.46, -0.08], flat: false }));
      p.push(part(cyl(0.16, 0.16, 0.02, 18), 0xc8c8c4, { pos: [-0.14, 0.3, -0.08] }));
      // Rotating surveillance array on a lattice mast.
      p.push(...lattice(0.3, 0.2, 0.08, 0.04, 0.32, STEEL, 3, 0.01));
      p.push(part(box(0.03, 0.12, 0.3), 0x3a3e42, { pos: [0.3, 0.32, 0.2], rot: [0, 0.4, 0.25] }));
      // Dish + control building + comm mast.
      p.push(part(new THREE.SphereGeometry(0.09, 14, 6, 0, Math.PI * 2, 0, 0.9), 0xe0e0e0, { pos: [0.3, 0.14, -0.3], rot: [Math.PI + 0.6, 0, -0.4], flat: false }), part(cyl(0.01, 0.014, 0.1, 6), METAL, { pos: [0.3, 0, -0.3] }));
      p.push(...hall(0.24, 0.1, 0.14, -0.2, 0.3, 0xd0d0cc));
      p.push(part(cyl(0.005, 0.007, 0.6, 4), METAL, { pos: [0.04, 0, 0.36] }));
      p.push(...flag(0.44, -0.4, 0.3));
      return merge(p);
    }
  }
  return merge([part(box(0.4, 0.2, 0.4), CONC)]);
}

const FAC_TINT = 0x4a78b8;

/** Standalone facility model (thumbnails, previews): nation tint baked into vertex colours. */
export function buildFacilityObject(type: FacilityType, tint: THREE.ColorRepresentation = FAC_TINT): THREE.Object3D {
  const geo = buildFacilityGeometry(type);
  const col = geo.getAttribute('color') as THREE.BufferAttribute;
  const tw = geo.getAttribute('aTint') as THREE.BufferAttribute;
  const c = new THREE.Color(tint);
  for (let i = 0; i < col.count; i++) {
    const w = tw.getX(i);
    if (w > 0) col.setXYZ(i, col.getX(i) * (1 - w + w * c.r), col.getY(i) * (1 - w + w * c.g), col.getZ(i) * (1 - w + w * c.b));
  }
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 }));
  mesh.userData.ownedResources = true;
  return mesh;
}
