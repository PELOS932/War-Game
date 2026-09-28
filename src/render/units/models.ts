import * as THREE from 'three';
import { UnitCategory } from '../../sim/types';
import { box, boxC, cone, cyl, cylC, extrudeXY, extrudeXZ, hull, merge, part, sphere } from '../models/geom';

/**
 * Procedural low-poly military models. Forward = +x, up = +y, right = +z,
 * base at y = 0, overall length ≈ 1. Parts with tint = 1 take the nation
 * colour (instance colour); others keep their vertex colour.
 */

const DARK = 0x26292b;
const TRACK = 0x1b1b1a;
const METAL = 0x5d6266;
const GLASS = 0x1c2a36;
const TINT = 0xd8d8d8; // base for nation-coloured parts
const TINT2 = 0xa8a8a8; // darker nation-coloured parts
const OLIVE = 0x56603f;
const NAVY = 0x8a929a;
const DECK = 0x4a4e52;
const WHITE = 0xe8e8e8;
const RED = 0xb02a20;
const T = { tint: 1 };

function wheelRow(n: number, x0: number, x1: number, z: number, r: number, w: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? x0 : x0 + ((x1 - x0) * i) / (n - 1);
    out.push(part(cylC(r, r, w, 10), DARK, { pos: [x, r, z], rot: [Math.PI / 2, 0, 0] }));
  }
  return out;
}

function tank(): THREE.BufferGeometry {
  const hullP: [number, number][] = [[-0.5, 0.05], [0.36, 0.05], [0.5, 0.13], [0.44, 0.21], [-0.47, 0.21], [-0.5, 0.14]];
  const turretP: [number, number][] = [[-0.3, 0], [0.12, 0], [0.22, 0.05], [0.14, 0.13], [-0.27, 0.13]];
  return merge([
    part(extrudeXY(hullP, 0.5), TINT2, T),
    part(box(1.0, 0.13, 0.13), TRACK, { pos: [0, 0, 0.215] }),
    part(box(1.0, 0.13, 0.13), TRACK, { pos: [0, 0, -0.215] }),
    part(box(0.9, 0.025, 0.6), TINT2, { ...T, pos: [-0.02, 0.18, 0] }),
    part(extrudeXY(turretP, 0.4), TINT, { ...T, pos: [-0.02, 0.21, 0] }),
    part(cylC(0.026, 0.034, 0.6, 8), DARK, { pos: [0.48, 0.28, 0], rot: [0, 0, Math.PI / 2] }),
    part(cylC(0.045, 0.045, 0.05, 8), DARK, { pos: [-0.14, 0.36, 0.1] }),
    part(box(0.1, 0.06, 0.34), DARK, { pos: [-0.32, 0.24, 0] }),
  ]);
}

function ifv(): THREE.BufferGeometry {
  const hullP: [number, number][] = [[-0.46, 0.05], [0.3, 0.05], [0.5, 0.16], [0.36, 0.3], [-0.46, 0.3]];
  return merge([
    part(extrudeXY(hullP, 0.5), TINT2, T),
    part(box(0.95, 0.12, 0.13), TRACK, { pos: [0.0, 0, 0.21] }),
    part(box(0.95, 0.12, 0.13), TRACK, { pos: [0.0, 0, -0.21] }),
    part(box(0.26, 0.1, 0.24), TINT, { ...T, pos: [0.02, 0.3, 0] }),
    part(cylC(0.018, 0.018, 0.36, 6), DARK, { pos: [0.3, 0.36, 0], rot: [0, 0, Math.PI / 2] }),
    part(box(0.2, 0.03, 0.3), DARK, { pos: [-0.3, 0.3, 0] }),
  ]);
}

function truck(cargo: number = OLIVE, cargoTint = 1): THREE.BufferGeometry {
  return merge([
    part(box(0.9, 0.06, 0.32), DARK, { pos: [0, 0.1, 0] }),
    part(box(0.24, 0.24, 0.34), TINT, { ...T, pos: [0.33, 0.16, 0] }),
    part(box(0.02, 0.1, 0.28), GLASS, { pos: [0.455, 0.28, 0] }),
    part(box(0.58, 0.26, 0.36), cargo, { tint: cargoTint, pos: [-0.1, 0.16, 0] }),
    ...wheelRow(3, -0.3, 0.32, 0.17, 0.08, 0.06),
    ...wheelRow(3, -0.3, 0.32, -0.17, 0.08, 0.06),
  ]);
}

function soldier(): THREE.BufferGeometry {
  // Chunky figure so it reads from above: helmet, pack, rifle.
  return merge([
    part(box(0.16, 0.34, 0.28), TINT2, { ...T, pos: [0, 0.3, 0] }),
    part(box(0.12, 0.3, 0.09), DARK, { pos: [0, 0, 0.07] }),
    part(box(0.12, 0.3, 0.09), DARK, { pos: [0, 0, -0.07] }),
    part(sphere(0.085, 8, 6), 0xc49a78, { pos: [0, 0.72, 0] }),
    part(sphere(0.1, 8, 4), TINT, { ...T, pos: [0, 0.76, 0], scale: [1, 0.6, 1] }),
    part(box(0.12, 0.24, 0.2), OLIVE, { pos: [-0.12, 0.38, 0] }),
    part(box(0.5, 0.035, 0.035), DARK, { pos: [0.2, 0.5, 0.12], rot: [0, 0, 0.35] }),
  ]);
}

function spg(): THREE.BufferGeometry {
  return merge([
    part(box(0.9, 0.18, 0.5), TINT2, { ...T, pos: [0, 0.08, 0] }),
    part(box(1.0, 0.13, 0.14), TRACK, { pos: [0, 0, 0.21] }),
    part(box(1.0, 0.13, 0.14), TRACK, { pos: [0, 0, -0.21] }),
    part(box(0.5, 0.2, 0.44), TINT, { ...T, pos: [-0.12, 0.26, 0] }),
    part(cylC(0.035, 0.04, 0.8, 8), DARK, { pos: [0.42, 0.52, 0], rot: [0, 0, Math.PI / 2 - 0.35] }),
  ]);
}

function mlrs(): THREE.BufferGeometry {
  return merge([
    part(box(0.95, 0.06, 0.34), DARK, { pos: [0, 0.1, 0] }),
    part(box(0.24, 0.24, 0.36), TINT, { ...T, pos: [0.36, 0.16, 0] }),
    part(box(0.02, 0.1, 0.3), GLASS, { pos: [0.485, 0.28, 0] }),
    part(box(0.56, 0.2, 0.34), TINT2, { ...T, pos: [-0.12, 0.3, 0], rot: [0, 0, 0.32] }),
    part(box(0.02, 0.18, 0.3), DARK, { pos: [0.16, 0.39, 0], rot: [0, 0, 0.32] }),
    ...wheelRow(3, -0.32, 0.34, 0.18, 0.08, 0.06),
    ...wheelRow(3, -0.32, 0.34, -0.18, 0.08, 0.06),
  ]);
}

function samLauncher(): THREE.BufferGeometry {
  const tubes: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const z = ((i % 2) - 0.5) * 0.14, y = Math.floor(i / 2) * 0.12;
    tubes.push(part(cylC(0.05, 0.05, 0.62, 8), TINT, { ...T, pos: [-0.08, 0.4 + y, z], rot: [0, 0, Math.PI / 2 - 0.9] }));
    tubes.push(part(cylC(0.045, 0.045, 0.01, 8), RED, { pos: [0.13 + 0.0, 0.64 + y + 0.02, z], rot: [0, 0, Math.PI / 2 - 0.9] }));
  }
  return merge([
    part(box(0.9, 0.06, 0.34), DARK, { pos: [0, 0.1, 0] }),
    part(box(0.22, 0.24, 0.36), TINT2, { ...T, pos: [0.35, 0.16, 0] }),
    part(box(0.34, 0.12, 0.3), METAL, { pos: [-0.12, 0.16, 0] }),
    ...tubes,
    ...wheelRow(3, -0.3, 0.32, 0.18, 0.08, 0.06),
    ...wheelRow(3, -0.3, 0.32, -0.18, 0.08, 0.06),
  ]);
}

function radarVehicle(): THREE.BufferGeometry {
  return merge([
    part(box(0.85, 0.06, 0.34), DARK, { pos: [0, 0.1, 0] }),
    part(box(0.22, 0.24, 0.36), TINT2, { ...T, pos: [0.33, 0.16, 0] }),
    part(box(0.44, 0.2, 0.34), TINT, { ...T, pos: [-0.12, 0.16, 0] }),
    part(cylC(0.03, 0.03, 0.18, 6), METAL, { pos: [-0.12, 0.45, 0] }),
    part(box(0.05, 0.3, 0.42), 0xd0d4d8, { pos: [-0.12, 0.62, 0], rot: [0, 0, 0.35] }),
    ...wheelRow(3, -0.3, 0.3, 0.18, 0.08, 0.06),
    ...wheelRow(3, -0.3, 0.3, -0.18, 0.08, 0.06),
  ]);
}

function armoredCar(): THREE.BufferGeometry {
  return merge([
    part(box(0.78, 0.2, 0.42), TINT2, { ...T, pos: [0, 0.1, 0] }),
    part(extrudeXZ([[0.39, -0.21], [0.5, -0.15], [0.5, 0.15], [0.39, 0.21]], 0.14), TINT2, { ...T, pos: [0, 0.12, 0] }),
    part(box(0.2, 0.09, 0.2), TINT, { ...T, pos: [0.02, 0.3, 0] }),
    part(cylC(0.015, 0.015, 0.28, 6), DARK, { pos: [0.22, 0.34, 0], rot: [0, 0, Math.PI / 2] }),
    ...wheelRow(4, -0.28, 0.3, 0.2, 0.09, 0.07),
    ...wheelRow(4, -0.28, 0.3, -0.2, 0.09, 0.07),
  ]);
}

function engineerVehicle(): THREE.BufferGeometry {
  return merge([
    part(box(0.72, 0.22, 0.46), 0xc9a227, { pos: [-0.04, 0.08, 0] }),
    part(box(0.82, 0.12, 0.12), TRACK, { pos: [-0.04, 0, 0.2] }),
    part(box(0.82, 0.12, 0.12), TRACK, { pos: [-0.04, 0, -0.2] }),
    part(box(0.26, 0.22, 0.34), TINT, { ...T, pos: [-0.14, 0.3, 0] }),
    part(box(0.06, 0.22, 0.62), METAL, { pos: [0.44, 0.02, 0], rot: [0, 0, -0.2] }),
    part(box(0.34, 0.04, 0.04), METAL, { pos: [0.2, 0.16, 0.2] }),
    part(box(0.34, 0.04, 0.04), METAL, { pos: [0.2, 0.16, -0.2] }),
  ]);
}

function tel(): THREE.BufferGeometry {
  return merge([
    part(box(1.1, 0.06, 0.34), DARK, { pos: [0, 0.1, 0] }),
    part(box(0.22, 0.26, 0.36), TINT, { ...T, pos: [0.46, 0.16, 0] }),
    part(box(0.02, 0.1, 0.3), GLASS, { pos: [0.575, 0.3, 0] }),
    part(box(0.78, 0.08, 0.3), TINT2, { ...T, pos: [-0.12, 0.16, 0] }),
    part(cylC(0.075, 0.075, 0.86, 10), 0xdfe2e4, { pos: [-0.1, 0.34, 0], rot: [0, 0, Math.PI / 2] }),
    part(cone(0.075, 0.2, 10), RED, { pos: [0.33 + 0.1, 0.34, 0], rot: [0, 0, -Math.PI / 2] }),
    ...wheelRow(4, -0.42, 0.44, 0.18, 0.08, 0.06),
    ...wheelRow(4, -0.42, 0.44, -0.18, 0.08, 0.06),
  ]);
}

// ---- Aircraft (length ≈ 1, wings in xz plane) ---------------------------------------------
function fighter(twinTail: boolean, wingSpan = 0.62, glass = GLASS): THREE.BufferGeometry {
  const wing = extrudeXZ([[0.12, 0], [-0.25, wingSpan / 2], [-0.36, wingSpan / 2], [-0.3, 0]], 0.02);
  const wingL = extrudeXZ([[0.12, 0], [-0.3, 0], [-0.36, -wingSpan / 2], [-0.25, -wingSpan / 2]], 0.02);
  const parts = [
    part(cylC(0.06, 0.07, 0.72, 8), TINT, { ...T, pos: [-0.04, 0.08, 0], rot: [0, 0, Math.PI / 2] }),
    part(cone(0.06, 0.3, 8), TINT2, { ...T, pos: [0.32, 0.08, 0], rot: [0, 0, -Math.PI / 2] }),
    part(sphere(0.05, 8, 6), glass, { pos: [0.2, 0.13, 0], scale: [2.2, 0.9, 1] }),
    part(wing, TINT2, { ...T, pos: [0, 0.07, 0] }),
    part(wingL, TINT2, { ...T, pos: [0, 0.07, 0] }),
    part(extrudeXZ([[-0.3, 0], [-0.46, 0.2], [-0.5, 0.2], [-0.45, 0]], 0.015), TINT2, { ...T, pos: [0, 0.07, 0] }),
    part(extrudeXZ([[-0.3, 0], [-0.45, 0], [-0.5, -0.2], [-0.46, -0.2]], 0.015), TINT2, { ...T, pos: [0, 0.07, 0] }),
    part(cylC(0.05, 0.05, 0.04, 8), DARK, { pos: [-0.42, 0.08, 0], rot: [0, 0, Math.PI / 2] }),
  ];
  const fin = extrudeXZ([[-0.28, 0], [-0.44, 0], [-0.46, 0.18], [-0.38, 0.18]], 0.012);
  if (twinTail) {
    parts.push(part(fin.clone(), TINT, { ...T, pos: [0, 0.1, 0.06], rot: [-Math.PI / 2 + 0.2, 0, 0] }));
    parts.push(part(fin, TINT, { ...T, pos: [0, 0.1, -0.06], rot: [-Math.PI / 2 - 0.2, 0, 0] }));
  } else {
    parts.push(part(fin, TINT, { ...T, pos: [0, 0.1, 0], rot: [-Math.PI / 2, 0, 0] }));
  }
  return merge(parts);
}

function bomber(): THREE.BufferGeometry {
  // Flying wing.
  const pts: [number, number][] = [[0.42, 0], [-0.12, 0.62], [-0.22, 0.58], [-0.14, 0.36], [-0.3, 0.2], [-0.2, 0], [-0.3, -0.2], [-0.14, -0.36], [-0.22, -0.58], [-0.12, -0.62]];
  return merge([
    part(extrudeXZ(pts, 0.05), TINT2, { ...T, pos: [0, 0.05, 0] }),
    part(sphere(0.1, 10, 6), TINT, { ...T, pos: [0.12, 0.1, 0], scale: [2.2, 0.5, 1.4] }),
    part(sphere(0.04, 8, 4), GLASS, { pos: [0.28, 0.13, 0], scale: [1.6, 0.6, 1.4] }),
  ]);
}

function helicopterBody(): THREE.BufferGeometry {
  return merge([
    part(sphere(0.14, 10, 8), TINT, { ...T, pos: [0.12, 0.2, 0], scale: [1.8, 1, 0.8] }),
    part(sphere(0.07, 8, 6), GLASS, { pos: [0.33, 0.24, 0], scale: [1.4, 1, 0.9] }),
    part(cylC(0.035, 0.05, 0.55, 6), TINT2, { ...T, pos: [-0.3, 0.24, 0], rot: [0, 0, Math.PI / 2] }),
    part(box(0.12, 0.16, 0.02), TINT2, { ...T, pos: [-0.56, 0.32, 0] }),
    part(box(0.14, 0.02, 0.28), DARK, { pos: [0.08, 0.16, 0] }),
    part(box(0.06, 0.04, 0.05), DARK, { pos: [0.08, 0.14, 0.15] }),
    part(box(0.06, 0.04, 0.05), DARK, { pos: [0.08, 0.14, -0.15] }),
    part(cylC(0.02, 0.02, 0.1, 6), METAL, { pos: [0.1, 0.34, 0] }),
    part(box(0.5, 0.015, 0.015), DARK, { pos: [0.12, 0.02, 0.1] }),
    part(box(0.5, 0.015, 0.015), DARK, { pos: [0.12, 0.02, -0.1] }),
  ]);
}

export function rotorGeometry(): THREE.BufferGeometry {
  return merge([
    part(boxC(0.95, 0.012, 0.05), 0x222222, { pos: [0, 0, 0] }),
    part(boxC(0.05, 0.012, 0.95), 0x222222, { pos: [0, 0, 0] }),
    part(cylC(0.03, 0.03, 0.03, 6), METAL, {}),
  ]);
}

function transportPlane(): THREE.BufferGeometry {
  const wing = extrudeXZ([[0.05, 0.62], [-0.08, 0.62], [-0.1, -0.62], [0.03, -0.62]], 0.02);
  const tail = extrudeXZ([[-0.38, 0.2], [-0.46, 0.2], [-0.46, -0.2], [-0.38, -0.2]], 0.015);
  const eng: THREE.BufferGeometry[] = [];
  for (const z of [-0.4, -0.22, 0.22, 0.4]) eng.push(part(cylC(0.035, 0.035, 0.14, 8), METAL, { pos: [0.06, 0.18, z], rot: [0, 0, Math.PI / 2] }));
  return merge([
    part(cylC(0.09, 0.09, 0.8, 10), TINT, { ...T, pos: [0, 0.12, 0], rot: [0, 0, Math.PI / 2] }),
    part(sphere(0.09, 10, 6), TINT, { ...T, pos: [0.4, 0.12, 0], scale: [1.4, 1, 1] }),
    part(cone(0.09, 0.2, 10), TINT, { ...T, pos: [-0.4, 0.12, 0], rot: [0, 0, Math.PI / 2] }),
    part(wing, TINT2, { ...T, pos: [0, 0.2, 0] }),
    part(box(0.12, 0.2, 0.02), TINT2, { ...T, pos: [-0.46, 0.18, 0] }),
    part(tail, TINT2, { ...T, pos: [0, 0.37, 0] }),
    ...eng,
  ]);
}

function drone(): THREE.BufferGeometry {
  const wing = extrudeXZ([[0.02, 0.6], [-0.06, 0.6], [-0.06, -0.6], [0.02, -0.6]], 0.012);
  return merge([
    part(cylC(0.04, 0.05, 0.7, 8), 0xb8bcc0, { pos: [0, 0.08, 0], rot: [0, 0, Math.PI / 2] }),
    part(sphere(0.06, 8, 6), TINT, { ...T, pos: [0.33, 0.1, 0], scale: [1.4, 1, 1] }),
    part(wing, TINT2, { ...T, pos: [0, 0.1, 0] }),
    part(box(0.12, 0.12, 0.01), TINT2, { ...T, pos: [-0.33, 0.14, 0.05], rot: [0.6, 0, 0] }),
    part(box(0.12, 0.12, 0.01), TINT2, { ...T, pos: [-0.33, 0.14, -0.05], rot: [-0.6, 0, 0] }),
  ]);
}

// ---- Ships (length ≈ 1) ---------------------------------------------------------------------
function warship(len: number, supers: [number, number, number, number][], guns: number[], mast: number[]): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    part(hull(len, len * 0.14, 0.07), NAVY, { pos: [0, 0, 0] }),
    part(hull(len * 0.99, len * 0.135, 0.012), DECK, { pos: [0, 0.07, 0] }),
    part(hull(len * 0.98, len * 0.13, 0.02), 0x6b2a24, { pos: [0, -0.01, 0], scale: [1, 1, 1.02] }),
  ];
  for (const [x, w, h, d] of supers) parts.push(part(box(w, h, d), TINT, { ...T, pos: [x, 0.08, 0] }));
  for (const x of guns) {
    parts.push(part(cylC(0.03, 0.035, 0.03, 8), METAL, { pos: [x, 0.1, 0] }));
    parts.push(part(cylC(0.006, 0.006, 0.08, 4), DARK, { pos: [x + 0.05, 0.11, 0], rot: [0, 0, Math.PI / 2] }));
  }
  for (const x of mast) {
    parts.push(part(cyl(0.008, 0.012, 0.22, 4), METAL, { pos: [x, 0.08, 0] }));
    parts.push(part(box(0.02, 0.012, 0.1), METAL, { pos: [x, 0.25, 0] }));
  }
  return merge(parts);
}

function patrolBoat(): THREE.BufferGeometry {
  return merge([
    part(hull(0.9, 0.2, 0.08, 0.35, 0.02), NAVY, {}),
    part(hull(0.88, 0.19, 0.012), DECK, { pos: [0, 0.08, 0] }),
    part(box(0.26, 0.1, 0.13), TINT, { ...T, pos: [-0.02, 0.09, 0] }),
    part(box(0.08, 0.05, 0.12), GLASS, { pos: [0.08, 0.14, 0] }),
    part(cylC(0.02, 0.025, 0.03, 6), METAL, { pos: [0.25, 0.1, 0] }),
    part(cyl(0.006, 0.008, 0.16, 4), METAL, { pos: [-0.04, 0.18, 0] }),
  ]);
}

function carrier(): THREE.BufferGeometry {
  const deck = extrudeXZ([[0.5, -0.08], [0.46, 0.12], [-0.46, 0.14], [-0.5, 0.1], [-0.5, -0.12], [0.2, -0.13], [0.42, -0.11]], 0.02);
  const planes: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const x = -0.38 + i * 0.07, z = -0.08;
    planes.push(part(extrudeXZ([[0.025, 0], [-0.02, 0.025], [-0.02, -0.025]], 0.006), 0x9aa0a6, { pos: [x, 0.115, z] }));
  }
  return merge([
    part(hull(1.0, 0.2, 0.09, 0.2, 0.02), NAVY, {}),
    part(hull(0.98, 0.19, 0.02), 0x6b2a24, { pos: [0, -0.01, 0] }),
    part(deck, DECK, { pos: [0, 0.09, 0] }),
    part(box(0.6, 0.004, 0.012), WHITE, { pos: [-0.05, 0.111, 0.02], rot: [0, 0.14, 0] }),
    part(box(0.36, 0.004, 0.02), TINT, { ...T, pos: [0.1, 0.111, -0.06] }),
    part(box(0.14, 0.12, 0.04), TINT, { ...T, pos: [0.02, 0.11, 0.1] }),
    part(cyl(0.006, 0.008, 0.1, 4), METAL, { pos: [0.02, 0.23, 0.1] }),
    ...planes,
  ]);
}

function submarine(): THREE.BufferGeometry {
  return merge([
    part(new THREE.CapsuleGeometry(0.07, 0.8, 4, 10), 0x2a2e33, { pos: [0, 0.03, 0], rot: [0, 0, Math.PI / 2] }),
    part(box(0.14, 0.12, 0.04), TINT, { ...T, pos: [0.12, 0.08, 0] }),
    part(box(0.03, 0.01, 0.16), 0x2a2e33, { pos: [0.14, 0.17, 0] }),
    part(box(0.05, 0.1, 0.012), 0x2a2e33, { pos: [-0.45, 0.06, 0] }),
    part(box(0.05, 0.012, 0.18), 0x2a2e33, { pos: [-0.45, 0.03, 0] }),
  ]);
}

function amphib(): THREE.BufferGeometry {
  return merge([
    part(hull(1.0, 0.18, 0.1, 0.18, 0.02), NAVY, {}),
    part(hull(0.98, 0.17, 0.02), 0x6b2a24, { pos: [0, -0.01, 0] }),
    part(box(0.86, 0.02, 0.17), DECK, { pos: [-0.04, 0.1, 0] }),
    part(box(0.2, 0.12, 0.05), TINT, { ...T, pos: [0.0, 0.12, 0.06] }),
    part(sphere(0.03, 8, 4), 0x707478, { pos: [-0.25, 0.14, -0.02] }),
    part(sphere(0.03, 8, 4), 0x707478, { pos: [-0.1, 0.14, -0.04] }),
    part(box(0.12, 0.05, 0.1), TINT2, { ...T, pos: [0.3, 0.12, -0.02] }),
  ]);
}

function cargoShip(): THREE.BufferGeometry {
  const cont: THREE.BufferGeometry[] = [];
  const cols = [0xb03a2e, 0x2e6fb0, 0xd9a520, 0x3a8a4a, 0x8a8f96];
  for (let i = 0; i < 6; i++) cont.push(part(box(0.1, 0.06, 0.12), cols[i % cols.length], { pos: [0.28 - i * 0.11, 0.09, 0] }));
  return merge([
    part(hull(1.0, 0.17, 0.09, 0.2, 0.03), 0x2d3a48, {}),
    part(hull(0.98, 0.16, 0.012), DECK, { pos: [0, 0.09, 0] }),
    part(box(0.12, 0.16, 0.15), TINT, { ...T, pos: [-0.38, 0.09, 0] }),
    part(box(0.02, 0.03, 0.14), GLASS, { pos: [-0.32, 0.22, 0] }),
    ...cont,
  ]);
}

export type ModelKind =
  | 'tank' | 'ifv' | 'soldier' | 'spg' | 'mlrs' | 'sam' | 'radar' | 'car' | 'engineer' | 'tel' | 'truck'
  | 'fighter' | 'multirole' | 'strike' | 'bomber' | 'heli' | 'rotor' | 'transport' | 'drone'
  | 'patrol' | 'frigate' | 'destroyer' | 'cruiser' | 'carrier' | 'sub' | 'amphib' | 'cargo';

export function buildModel(kind: ModelKind): THREE.BufferGeometry {
  switch (kind) {
    case 'tank': return tank();
    case 'ifv': return ifv();
    case 'soldier': return soldier();
    case 'spg': return spg();
    case 'mlrs': return mlrs();
    case 'sam': return samLauncher();
    case 'radar': return radarVehicle();
    case 'car': return armoredCar();
    case 'engineer': return engineerVehicle();
    case 'tel': return tel();
    case 'truck': return truck();
    case 'fighter': return fighter(true, 0.64);
    case 'multirole': return fighter(false, 0.58);
    case 'strike': return fighter(true, 0.78, 0x2a2a2a);
    case 'bomber': return bomber();
    case 'heli': return helicopterBody();
    case 'rotor': return rotorGeometry();
    case 'transport': return transportPlane();
    case 'drone': return drone();
    case 'patrol': return patrolBoat();
    case 'frigate': return warship(1, [[0.02, 0.2, 0.07, 0.09], [-0.2, 0.12, 0.05, 0.08]], [0.3], [0.02]);
    case 'destroyer': return warship(1, [[0.08, 0.2, 0.08, 0.09], [-0.18, 0.16, 0.06, 0.08]], [0.32, -0.36], [0.1, -0.16]);
    case 'cruiser': return warship(1, [[0.1, 0.22, 0.09, 0.1], [-0.14, 0.2, 0.08, 0.09]], [0.34, 0.26, -0.38], [0.12, -0.12]);
    case 'carrier': return carrier();
    case 'sub': return submarine();
    case 'amphib': return amphib();
    case 'cargo': return cargoShip();
  }
}

/** Formation for a unit: model kind + member offsets (local x fwd, z right) in units of the unit size, member scale. */
export interface Formation { kind: ModelKind; members: [number, number][]; scale: number; extra?: { kind: ModelKind; at: [number, number] } }

const TRI: [number, number][] = [[0.28, 0], [-0.2, -0.3], [-0.2, 0.3]];
const PAIR: [number, number][] = [[0.18, -0.22], [-0.12, 0.22]];
const SQUAD: [number, number][] = [[0.3, 0], [0.08, -0.26], [0.08, 0.26], [-0.18, -0.12], [-0.18, 0.14], [-0.36, 0]];

export function formationFor(cat: UnitCategory, embarked: boolean): Formation {
  if (embarked) return { kind: 'cargo', members: [[0, 0]], scale: 1.15 };
  switch (cat) {
    case UnitCategory.Infantry: return { kind: 'soldier', members: SQUAD, scale: 0.3, extra: { kind: 'truck', at: [-0.05, 0] } };
    case UnitCategory.Mechanized: return { kind: 'ifv', members: TRI, scale: 0.46 };
    case UnitCategory.Armor: return { kind: 'tank', members: TRI, scale: 0.5 };
    case UnitCategory.Artillery: return { kind: 'spg', members: PAIR, scale: 0.52 };
    case UnitCategory.RocketArtillery: return { kind: 'mlrs', members: PAIR, scale: 0.52 };
    case UnitCategory.AirDefense: return { kind: 'sam', members: PAIR, scale: 0.5, extra: { kind: 'radar', at: [-0.05, 0] } };
    case UnitCategory.Recon: return { kind: 'car', members: TRI, scale: 0.44 };
    case UnitCategory.SpecialForces: return { kind: 'soldier', members: SQUAD.slice(0, 4), scale: 0.32, extra: { kind: 'car', at: [-0.1, 0] } };
    case UnitCategory.Engineers: return { kind: 'engineer', members: PAIR, scale: 0.5, extra: { kind: 'truck', at: [-0.3, 0] } };
    case UnitCategory.MissileLauncher: return { kind: 'tel', members: PAIR, scale: 0.55 };
    case UnitCategory.Fighter: return { kind: 'fighter', members: PAIR, scale: 0.6 };
    case UnitCategory.Multirole: return { kind: 'multirole', members: PAIR, scale: 0.6 };
    case UnitCategory.Strike: return { kind: 'strike', members: PAIR, scale: 0.62 };
    case UnitCategory.Bomber: return { kind: 'bomber', members: [[0, 0]], scale: 0.95 };
    case UnitCategory.Helicopter: return { kind: 'heli', members: PAIR, scale: 0.6 };
    case UnitCategory.AirTransport: return { kind: 'transport', members: [[0, 0]], scale: 1.0 };
    case UnitCategory.Drone: return { kind: 'drone', members: [[0, 0]], scale: 0.8 };
    case UnitCategory.PatrolBoat: return { kind: 'patrol', members: PAIR, scale: 0.55 };
    case UnitCategory.Frigate: return { kind: 'frigate', members: [[0, 0]], scale: 1.0 };
    case UnitCategory.Destroyer: return { kind: 'destroyer', members: [[0, 0]], scale: 1.1 };
    case UnitCategory.Cruiser: return { kind: 'cruiser', members: [[0, 0]], scale: 1.2 };
    case UnitCategory.Carrier: return { kind: 'carrier', members: [[0, 0]], scale: 1.45 };
    case UnitCategory.Submarine: return { kind: 'sub', members: [[0, 0]], scale: 1.0 };
    case UnitCategory.Amphibious: return { kind: 'amphib', members: [[0, 0]], scale: 1.2 };
    default: return { kind: 'truck', members: TRI, scale: 0.45 };
  }
}

