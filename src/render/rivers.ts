import * as THREE from 'three';
import { Noise2D } from '../core/noise';
import { RNG } from '../core/rng';
import { smoothstep } from './constants';
import type { WorldContext } from './index';
import { buildRibbonGeometry, resample, RIBBON_VERT, RibbonLine, smoothPolyline } from './ribbon';
import { DAYLIGHT_GLSL, NOISE_GLSL } from './shaders/common';

const RIVER_FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
${NOISE_GLSL}
${DAYLIGHT_GLSL}
uniform vec3 uSkyColor;
uniform vec3 uHorizonColor;
uniform float uFade;
varying vec3 vWPos;
varying float vV;
varying float vDist;
varying float vWidthPx;
varying float vKind;
void main() {
  float edge = 1.0 - smoothstep(0.55, 1.0, abs(vV));
  float a = edge * clamp(vWidthPx * 0.8, 0.28, 1.0) * uFade;
  if (a < 0.01) discard;
  vec3 wp = vWPos;
  vec3 V = normalize(cameraPosition - wp);
  float t = uTime;
  float pix = length(fwidth(wp.xz));
  float k = 1.0 - smoothstep(0.002, 0.02, pix);
  vec2 g = vec2(0.0);
  if (k > 0.0) {
    float n1 = snoise(vec2(vDist * 40.0 - t * 1.4, vV * 1.5));
    float n2 = snoise(wp.xz * 160.0 + vec2(t * 0.4, -t * 0.3));
    g = vec2(n1 * 0.12 + n2 * 0.06, n2 * 0.08) * k;
  }
  vec3 N = normalize(vec3(g.x, 1.0, g.y));
  float day = daylightFactor(wp);
  vec3 L = normalize(uSunDir);
  float F = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 sky = mix(uHorizonColor, uSkyColor, 0.6);
  vec3 water = mix(vec3(0.05, 0.1, 0.09), vec3(0.025, 0.075, 0.1), smoothstep(0.3, 1.0, vKind));
  // Muddy / shallow banks.
  water = mix(water, vec3(0.12, 0.11, 0.07), smoothstep(0.45, 0.95, abs(vV)) * 0.5);
  vec3 amb = mix(uNightAmbient * 0.3, vec3(1.0), day);
  vec3 col = water * amb * (0.75 + 0.25 * max(dot(N, L), 0.0));
  col = mix(col, sky * amb, F * 0.8);
  vec3 R = reflect(-V, N);
  col += sunTint(wp) * pow(max(dot(R, L), 0.0), 300.0) * 2.0 * day * k;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

const TILE = 64;

export class Rivers {
  readonly group = new THREE.Group();
  private mat: THREE.ShaderMaterial;

  constructor(ctx: WorldContext) {
    const { world, hf, shared } = ctx;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        ...shared,
        uFade: { value: 1 },
        uMinPx: { value: 1.3 },
        uBias: { value: 0.004 },
        uWidthScale: { value: 1 },
      },
      vertexShader: RIBBON_VERT,
      fragmentShader: RIVER_FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    const noise = new Noise2D(new RNG(world.settings.seed ^ 0x51ee).fork(1));
    const tiles = new Map<number, RibbonLine[]>();
    for (const r of world.rivers) {
      const src = r.points;
      const n = src.length / 3;
      if (n < 3) continue;
      const xz: number[] = [];
      const wd: number[] = [];
      for (let i = 0; i < n; i++) {
        let x = src[i * 3], z = src[i * 3 + 1];
        const w = src[i * 3 + 2];
        // Meanders: offset interior points perpendicular to the flow.
        if (i > 0 && i < n - 1) {
          const tx = src[(i + 1) * 3] - src[(i - 1) * 3], tz = src[(i + 1) * 3 + 1] - src[(i - 1) * 3 + 1];
          const tl = Math.hypot(tx, tz) || 1;
          const off = noise.noise(x * 1.3, z * 1.3) * 0.16 + noise.noise(x * 4.1, z * 4.1) * 0.05;
          x += (-tz / tl) * off;
          z += (tx / tl) * off;
        }
        xz.push(x, z);
        wd.push(w);
      }
      const sm = smoothPolyline(xz, 2, wd);
      const rs = resample(sm.xz, 0.09, sm.extra);
      const pts: number[] = [];
      const widths: number[] = [];
      const m = rs.xz.length / 2;
      for (let i = 0; i < m; i++) {
        const x = rs.xz[i * 2], z = rs.xz[i * 2 + 1];
        let y = hf.heightAt(x, z);
        const wl = hf.waterAt(x, z);
        if (wl > y) y = wl;
        pts.push(x, y + 0.0008, z);
        // Data widths are generous; render narrower, growing downstream.
        const w = rs.extra![i];
        widths.push(Math.min(0.11, 0.008 + w * 0.16));
      }
      const kind = Math.min(1, (wd[wd.length - 1] - 0.05) / 0.35);
      const key = Math.floor(pts[0] / TILE) * 1000 + Math.floor(pts[2] / TILE);
      let list = tiles.get(key);
      if (!list) tiles.set(key, (list = []));
      list.push({ pts, widths, kind });
    }
    for (const lines of tiles.values()) {
      const g = buildRibbonGeometry(lines);
      if (!g) continue;
      const mesh = new THREE.Mesh(g, this.mat);
      mesh.renderOrder = 3;
      this.group.add(mesh);
    }
  }

  update(camDist: number): void {
    this.mat.uniforms.uBias.value = 0.0025 + 0.012 * smoothstep(0.5, 80, camDist);
    this.mat.uniforms.uFade.value = 1 - smoothstep(250, 420, camDist) * 0.6;
  }
}
