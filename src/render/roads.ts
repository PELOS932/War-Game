import * as THREE from 'three';
import type { RoadSeed } from '../worldgen/types';
import { smoothstep } from './constants';
import type { WorldContext } from './index';
import { hashI } from './procedural';
import { buildRibbonGeometry, resample, RIBBON_VERT, RibbonLine, smoothPolyline } from './ribbon';
import { DAYLIGHT_GLSL, NOISE_GLSL } from './shaders/common';

const ROAD_FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
${NOISE_GLSL}
${DAYLIGHT_GLSL}
uniform float uFade;
varying vec3 vWPos;
varying float vV;
varying float vDist;
varying float vWidthPx;
varying float vKind;
void main() {
  float av = abs(vV);
  float edge = 1.0 - smoothstep(0.7, 1.0, av);
  float a = edge * clamp(vWidthPx * 0.9, 0.2, 1.0) * uFade;
  if (a < 0.01) discard;
  float detail = smoothstep(2.5, 6.0, vWidthPx);
  vec3 col;
  float nightGlow = 0.0;
  if (vKind > 1.5) {
    // Railway: ballast, sleepers, two rails.
    vec3 ballast = vec3(0.13, 0.115, 0.1);
    float sleeper = step(fract(vDist * 220.0), 0.45) * (1.0 - smoothstep(0.7, 0.8, av));
    float rails = 1.0 - smoothstep(0.05, 0.12, abs(av - 0.42));
    col = mix(ballast, vec3(0.07, 0.05, 0.035), sleeper * detail);
    col = mix(col, vec3(0.3, 0.3, 0.32), rails * detail);
    if (detail < 1.0) col = mix(vec3(0.09, 0.08, 0.07), col, detail);
  } else {
    vec3 asphalt = vKind > 0.5 ? vec3(0.055, 0.056, 0.06) : vec3(0.075, 0.072, 0.07);
    col = asphalt * (0.92 + 0.16 * snoise(vWPos.xz * 400.0) * detail);
    float edgeLine = 1.0 - smoothstep(0.03, 0.07, abs(av - 0.82));
    col = mix(col, vec3(0.5), edgeLine * detail * 0.6);
    if (vKind > 0.5) {
      float dash = step(fract(vDist * 60.0), 0.5) * (1.0 - smoothstep(0.03, 0.07, av));
      col = mix(col, vec3(0.6, 0.58, 0.5), dash * detail);
      nightGlow = 1.0;
    }
    if (detail < 1.0) col = mix(vKind > 0.5 ? vec3(0.1, 0.1, 0.1) : vec3(0.13, 0.12, 0.11), col, detail);
  }
  float day = daylightFactor(vWPos);
  vec3 amb = mix(uNightAmbient * 0.5, vec3(1.0), day);
  col *= amb * 1.6;
  col += vec3(1.0, 0.6, 0.25) * nightGlow * nightFactor(vWPos) * 0.35 * step(0.5, fract(vDist * 18.0));
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

const TILE = 48;

export class Roads {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;

  constructor(ctx: WorldContext) {
    const { world, shared } = ctx;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        ...shared,
        uFade: { value: 1 },
        uMinPx: { value: 1.2 },
        uBias: { value: 0.004 },
        uWidthScale: { value: 1 },
      },
      vertexShader: RIBBON_VERT,
      fragmentShader: ROAD_FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    const tiles = new Map<number, RibbonLine[]>();
    const add = (line: RibbonLine) => {
      const n = line.pts.length / 3;
      const mid = Math.floor(n / 2);
      const key = Math.floor(line.pts[mid * 3] / TILE) * 1000 + Math.floor(line.pts[mid * 3 + 2] / TILE);
      let l = tiles.get(key);
      if (!l) tiles.set(key, (l = []));
      l.push(line);
    };
    for (const chain of buildChains(world.roads, ctx.grid.count)) add(this.makeLine(ctx, chain.hexes, chain.kind, 0x1234));
    for (const chain of buildChains(world.rails, ctx.grid.count)) add(this.makeLine(ctx, chain.hexes, 2, 0x9876));
    for (const lines of tiles.values()) {
      const g = buildRibbonGeometry(lines);
      if (!g) continue;
      const mesh = new THREE.Mesh(g, this.mat);
      mesh.renderOrder = 4;
      this.group.add(mesh);
    }
  }

  private makeLine(ctx: WorldContext, hexes: number[], kind: number, seed: number): RibbonLine {
    const { grid, hf, world } = ctx;
    const xz: number[] = [];
    const n = hexes.length;
    for (let i = 0; i < n; i++) {
      const h = hexes[i];
      let x = grid.cx[h], z = grid.cz[h];
      const isEnd = i === 0 || i === n - 1;
      if (!isEnd && world.hexCity[h] < 0) {
        const a = hashI(h, 1, seed) * Math.PI * 2;
        const r = 0.12 + hashI(h, 2, seed) * 0.22;
        x += Math.cos(a) * r;
        z += Math.sin(a) * r;
      } else if (kind === 2) {
        // Offset railways from road junctions in cities.
        x += 0.09;
        z += 0.06;
      }
      xz.push(x, z);
    }
    const sm = smoothPolyline(xz, 3);
    const rs = resample(sm.xz, 0.045);
    const pts: number[] = [];
    const widths: number[] = [];
    const w = kind === 1 ? 0.0055 : kind === 2 ? 0.0032 : 0.0036;
    const m = rs.xz.length / 2;
    for (let i = 0; i < m; i++) {
      const x = rs.xz[i * 2], z = rs.xz[i * 2 + 1];
      let y = hf.heightAt(x, z);
      const wl = hf.waterAt(x, z);
      if (wl > y - 0.001) y = wl + 0.004; // bridge / causeway
      pts.push(x, y + 0.0006, z);
      widths.push(w);
    }
    return { pts, widths, kind };
  }

  update(camDist: number, camera: THREE.Camera): void {
    void camera;
    this.mat.uniforms.uBias.value = 0.003 + 0.01 * smoothstep(0.5, 40, camDist);
    const fade = 1 - smoothstep(18, 34, camDist);
    this.mat.uniforms.uFade.value = fade;
    this.group.visible = fade > 0.01;
  }
}

/** Merge overlapping hex paths into a deduplicated network of chains. */
function buildChains(seeds: RoadSeed[], hexCount: number): { hexes: number[]; kind: number }[] {
  const edges = new Map<number, number>(); // key a*count+b (a<b) -> kind
  const adj = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    let l = adj.get(a);
    if (!l) adj.set(a, (l = []));
    if (!l.includes(b)) l.push(b);
  };
  for (const r of seeds) {
    for (let i = 0; i + 1 < r.hexes.length; i++) {
      const a = r.hexes[i], b = r.hexes[i + 1];
      if (a === b) continue;
      const key = Math.min(a, b) * hexCount + Math.max(a, b);
      const prev = edges.get(key);
      if (prev === undefined) {
        edges.set(key, r.kind);
        link(a, b);
        link(b, a);
      } else if (r.kind > prev) edges.set(key, r.kind);
    }
  }
  const used = new Set<number>();
  const kindOf = (a: number, b: number) => edges.get(Math.min(a, b) * hexCount + Math.max(a, b)) ?? 0;
  const chains: { hexes: number[]; kind: number }[] = [];
  const walk = (start: number, next: number, kind: number): number[] => {
    const out = [start, next];
    let prev = start, cur = next;
    for (;;) {
      const nb = adj.get(cur) ?? [];
      if (nb.length !== 2) break;
      const nx = nb[0] === prev ? nb[1] : nb[0];
      const key = Math.min(cur, nx) * hexCount + Math.max(cur, nx);
      if (used.has(key) || kindOf(cur, nx) !== kind) break;
      used.add(key);
      out.push(nx);
      prev = cur;
      cur = nx;
    }
    return out;
  };
  for (const [key, kind] of edges) {
    if (used.has(key)) continue;
    used.add(key);
    const a = Math.floor(key / hexCount), b = key % hexCount;
    const fwd = walk(a, b, kind);
    const back = walk(b, a, kind);
    // back = [b, a, ...more]; combine reversed(back minus first two) + fwd
    const pre = back.slice(2).reverse();
    chains.push({ hexes: [...pre, ...fwd], kind });
  }
  return chains;
}
