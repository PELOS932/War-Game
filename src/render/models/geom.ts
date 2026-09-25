import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Helpers for assembling low-poly procedural models from primitives. Every
 * part gets a vertex colour and an `aTint` weight (1 = recoloured by the
 * instance colour, e.g. nation colour or foliage variation).
 */
export type ColorLike = number | string | THREE.Color;

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();

export interface PartOpts {
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
  tint?: number;
  flat?: boolean;
}

export function part(geo: THREE.BufferGeometry, color: ColorLike, o: PartOpts = {}): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g === geo) g = geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  tmpP.set(...(o.pos ?? [0, 0, 0]));
  tmpE.set(...(o.rot ?? [0, 0, 0]));
  tmpQ.setFromEuler(tmpE);
  tmpS.set(...(o.scale ?? [1, 1, 1]));
  tmpM.compose(tmpP, tmpQ, tmpS);
  g.applyMatrix4(tmpM);
  if (o.flat !== false) g.computeVertexNormals();
  const n = g.attributes.position.count;
  const c = color instanceof THREE.Color ? color : new THREE.Color(color);
  const col = new Float32Array(n * 3);
  const tint = new Float32Array(n).fill(o.tint ?? 0);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aTint', new THREE.BufferAttribute(tint, 1));
  geo.dispose();
  return g;
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('mergeGeometries failed');
  for (const p of parts) p.dispose();
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

// Shorthand primitive constructors (base at y = 0 where it makes sense).
export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
export const boxC = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt: number, rb: number, h: number, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg, 1).translate(0, h / 2, 0);
export const cylC = (rt: number, rb: number, h: number, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg, 1);
export const cone = (r: number, h: number, seg = 8) => new THREE.ConeGeometry(r, h, seg, 1).translate(0, h / 2, 0);
export const sphere = (r: number, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);
export const ico = (r: number, detail = 0) => new THREE.IcosahedronGeometry(r, detail);

/** Triangular prism along z (gable roof): width w (x), height h, length l. Base at y = 0. */
export function prism(w: number, h: number, l: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: l, bevelEnabled: false });
  g.translate(0, 0, -l / 2);
  return g;
}

/** Extruded 2D outline in the xz plane (y up), height h. pts are [x, z] pairs. */
export function extrudeXZ(pts: [number, number][], h: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], -pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], -pts[i][1]);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}

/** A simple hull shape for ships: pointed bow at +x. */
export function hull(len: number, beam: number, height: number, bowFrac = 0.28, sternFrac = 0.06): THREE.BufferGeometry {
  const L = len / 2, B = beam / 2;
  const pts: [number, number][] = [
    [-L, -B * 0.85], [-L + len * sternFrac, -B], [L - len * bowFrac, -B], [L, 0], [L - len * bowFrac, B], [-L + len * sternFrac, B], [-L, B * 0.85],
  ];
  const g = extrudeXZ(pts, height);
  return g;
}
