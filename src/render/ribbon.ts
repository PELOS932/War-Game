import * as THREE from 'three';

/**
 * Screen-space-aware ribbons draped on terrain (rivers, roads, rails, paths).
 * Each polyline point becomes two vertices sharing the centre position; the
 * vertex shader offsets them sideways by max(true width, minimum pixel width)
 * and pulls them toward the camera to win against coarse terrain LODs.
 */
export interface RibbonLine {
  /** x, y, z triples (centreline, already draped). */
  pts: number[];
  /** Half-width per point (world units). */
  widths: number[];
  /** Arbitrary per-line value (kind). */
  kind: number;
}

export function smoothPolyline(xz: number[], iterations: number, extra?: number[]): { xz: number[]; extra?: number[] } {
  let p = xz, e = extra;
  for (let it = 0; it < iterations; it++) {
    const n = p.length / 2;
    if (n < 3) break;
    const q: number[] = [p[0], p[1]];
    const qe: number[] | undefined = e ? [e[0]] : undefined;
    for (let i = 0; i < n - 1; i++) {
      const ax = p[i * 2], az = p[i * 2 + 1], bx = p[i * 2 + 2], bz = p[i * 2 + 3];
      q.push(ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25, ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75);
      if (qe && e) qe.push(e[i] * 0.75 + e[i + 1] * 0.25, e[i] * 0.25 + e[i + 1] * 0.75);
    }
    q.push(p[(n - 1) * 2], p[(n - 1) * 2 + 1]);
    if (qe && e) qe.push(e[n - 1]);
    p = q;
    e = qe;
  }
  return { xz: p, extra: e };
}

/** Resample a polyline to roughly uniform spacing. */
export function resample(xz: number[], spacing: number, extra?: number[]): { xz: number[]; extra?: number[] } {
  const n = xz.length / 2;
  if (n < 2) return { xz, extra };
  const out: number[] = [xz[0], xz[1]];
  const oe: number[] | undefined = extra ? [extra[0]] : undefined;
  let carry = 0;
  for (let i = 0; i < n - 1; i++) {
    const ax = xz[i * 2], az = xz[i * 2 + 1], bx = xz[i * 2 + 2], bz = xz[i * 2 + 3];
    const len = Math.hypot(bx - ax, bz - az);
    let t = spacing - carry;
    while (t < len) {
      const f = t / len;
      out.push(ax + (bx - ax) * f, az + (bz - az) * f);
      if (oe && extra) oe.push(extra[i] + (extra[i + 1] - extra[i]) * f);
      t += spacing;
    }
    carry = len - (t - spacing);
  }
  const lx = xz[(n - 1) * 2], lz = xz[(n - 1) * 2 + 1];
  if (Math.hypot(out[out.length - 2] - lx, out[out.length - 1] - lz) > spacing * 0.2) {
    out.push(lx, lz);
    if (oe && extra) oe.push(extra[n - 1]);
  }
  return { xz: out, extra: oe };
}

/**
 * Build ribbon geometry. Attributes: position (centre), aSide (xz unit
 * perpendicular * ±1), aWidth (half width), aDist (distance along line),
 * aKind.
 */
export function buildRibbonGeometry(lines: RibbonLine[]): THREE.BufferGeometry | null {
  let nv = 0, ni = 0;
  for (const l of lines) {
    const n = l.pts.length / 3;
    if (n < 2) continue;
    nv += n * 2;
    ni += (n - 1) * 6;
  }
  if (!nv) return null;
  const pos = new Float32Array(nv * 3);
  const side = new Float32Array(nv * 2);
  const width = new Float32Array(nv);
  const dist = new Float32Array(nv);
  const kind = new Float32Array(nv);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let v = 0, k = 0;
  for (const l of lines) {
    const p = l.pts;
    const n = p.length / 3;
    if (n < 2) continue;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      let tx = p[i1 * 3] - p[i0 * 3], tz = p[i1 * 3 + 2] - p[i0 * 3 + 2];
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      if (i > 0) acc += Math.hypot(p[i * 3] - p[(i - 1) * 3], p[i * 3 + 2] - p[(i - 1) * 3 + 2]);
      for (let s = 0; s < 2; s++) {
        const sg = s === 0 ? -1 : 1;
        pos[v * 3] = p[i * 3];
        pos[v * 3 + 1] = p[i * 3 + 1];
        pos[v * 3 + 2] = p[i * 3 + 2];
        side[v * 2] = -tz * sg;
        side[v * 2 + 1] = tx * sg;
        width[v] = l.widths[i];
        dist[v] = acc;
        kind[v] = l.kind;
        v++;
      }
      if (i < n - 1) {
        const a = v - 2;
        // a: left(i) a+1: right(i) a+2: left(i+1) a+3: right(i+1)
        idx[k++] = a; idx[k++] = a + 2; idx[k++] = a + 1;
        idx[k++] = a + 1; idx[k++] = a + 2; idx[k++] = a + 3;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 2));
  g.setAttribute('aWidth', new THREE.BufferAttribute(width, 1));
  g.setAttribute('aDist', new THREE.BufferAttribute(dist, 1));
  g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/**
 * Vertex shader body for ribbons. Declares vWPos, vV (−1..1 across),
 * vDist, vWidthPx, vKind. Needs uniforms uPixelK (world units per pixel per
 * unit view depth), uMinPx, uBias.
 */
export const RIBBON_VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
attribute vec2 aSide;
attribute float aWidth;
attribute float aDist;
attribute float aKind;
uniform float uPixelK;
uniform float uMinPx;
uniform float uBias;
uniform float uWidthScale;
varying vec3 vWPos;
varying float vV;
varying float vDist;
varying float vWidthPx;
varying float vKind;
void main() {
  vec4 wc = modelMatrix * vec4(position, 1.0);
  float depth = max(0.001, -(viewMatrix * wc).z);
  float pixW = depth * uPixelK;
  float w = aWidth * uWidthScale;
  float wEff = max(w, pixW * uMinPx * 0.5);
  vWidthPx = (2.0 * w) / pixW;
  vec3 wp = wc.xyz + vec3(aSide.x, 0.0, aSide.y) * wEff;
  vWPos = wp;
  vV = (gl_VertexID % 2 == 0) ? -1.0 : 1.0;
  vDist = aDist;
  vKind = aKind;
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  mvPosition.xyz *= 1.0 - uBias;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
