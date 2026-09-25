import * as THREE from 'three';
import { HEIGHT_SPACING, WorldData } from '../worldgen/types';
import { Y_SCALE } from './constants';
import type { Shared } from './lighting';
import { OVERLAY_GLSL, Overlay } from './overlay';
import { CLOUD_GLSL, DAYLIGHT_GLSL, HEX_GLSL, NOISE_GLSL } from './shaders/common';
import { WORLDTEX_GLSL } from './terrain/material';
import type { WorldTextures } from './textures';

const WATER_FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
${NOISE_GLSL}
${DAYLIGHT_GLSL}
${CLOUD_GLSL}
${HEX_GLSL}
${WORLDTEX_GLSL}
${OVERLAY_GLSL}
uniform sampler2D uLandTex;
uniform sampler2D uClimateTex;
uniform int uIsLake;
uniform vec3 uSkyColor;
uniform vec3 uHorizonColor;
varying vec3 vWPos;

vec2 noiseGrad(vec2 p) {
  const float e = 0.08;
  return vec2(snoise(p + vec2(e, 0.0)) - snoise(p - vec2(e, 0.0)), snoise(p + vec2(0.0, e)) - snoise(p - vec2(0.0, e))) / (2.0 * e);
}

void main() {
  vec3 wp = vWPos;
  vec2 uv = hmUV(wp.xz);
  vec4 ld = texture(uLandTex, uv);
  if (uIsLake == 0 && ld.b < 0.01) discard;
  float floorM = texture(uHeightTex, uv).r;
  float level = wp.y / uYScale;
  float depth = level - floorM;
  if (uIsLake == 1 && depth < -2.0) discard;
  float pix = max(length(dFdx(wp.xz)), length(dFdy(wp.xz)));
  vec3 V = normalize(cameraPosition - wp);
  float t = uTime;

  // ---- climate for tint & sea ice.
  vec4 cl = texture(uClimateTex, uv);
  float tAnn = cl.r * 255.0 / 3.2 - 40.0;
  float lat = latAt(wp.z);
  float hemi = lat >= 0.0 ? 1.0 : -1.0;
  float sAmp = (2.5 + 19.0 * cl.b) * smoothstep(8.0, 60.0, abs(lat));
  float tNow = tAnn - hemi * sAmp * cos(6.2831853 * (uDayOfYear - 18.0) / 365.25);

  // ---- waves.
  vec3 N = vec3(0.0, 1.0, 0.0);
  float wk = 1.0 - smoothstep(0.002, 0.01, pix);
  float mk = 1.0 - smoothstep(0.012, 0.05, pix);
  vec2 g = vec2(0.0);
  if (mk > 0.0) g += noiseGrad(wp.xz * 5.0 + vec2(t * 0.03, t * 0.02)) * 0.012 * mk;
  if (wk > 0.0) {
    g += noiseGrad(wp.xz * 60.0 + vec2(t * 0.45, t * 0.25)) * 0.0022 * wk;
    g += noiseGrad(wp.xz * 150.0 + vec2(-t * 0.6, t * 0.5)) * 0.0011 * wk;
  }
  float calm = uIsLake == 1 ? 0.5 : 1.0;
  N = normalize(vec3(-g.x * calm * 6.0, 1.0, -g.y * calm * 6.0));

  // ---- body colour by depth.
  float d1 = smoothstep(0.0, 45.0, depth), d2 = smoothstep(35.0, 3200.0, depth);
  float tropic = smoothstep(14.0, 26.0, tAnn);
  vec3 shallow = mix(vec3(0.05, 0.25, 0.26), vec3(0.03, 0.42, 0.42), tropic);
  vec3 midc = mix(vec3(0.015, 0.085, 0.13), vec3(0.01, 0.15, 0.24), tropic);
  vec3 deep = mix(vec3(0.006, 0.03, 0.07), vec3(0.004, 0.035, 0.1), tropic);
  vec3 wc = mix(mix(shallow, midc, d1), deep, d2);
  if (uIsLake == 1) wc = mix(vec3(0.03, 0.16, 0.16), vec3(0.008, 0.05, 0.08), smoothstep(0.0, 70.0, depth));
  // Large-scale colour variation (plankton, sediment plumes).
  wc *= 1.0 + 0.12 * fbm2(wp.xz * 0.15 + t * 0.002);

  // ---- lighting.
  float day = daylightFactor(wp);
  float night = nightFactor(wp);
  vec3 L = normalize(uSunDir);
  vec3 tint = sunTint(wp);
  float cs = 0.0;
  if (uCloudShadow > 0.0) {
    vec2 cp = wp.xz + L.xz / max(L.y, 0.25) * 6.0;
    cs = cloudDensity(cp, latAt(cp.y), true) * 0.5 * uCloudShadow;
  }
  vec3 R = reflect(-V, N);
  float F = 0.02 + 0.98 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
  vec3 sky = mix(uHorizonColor, uSkyColor, clamp(R.y * 1.3, 0.0, 1.0));
  vec3 skyC = mix(vec3(0.006, 0.01, 0.025), sky, day);
  float diffuse = 0.65 + 0.35 * max(dot(N, L), 0.0);
  vec3 amb = mix(uNightAmbient * 0.25, vec3(1.0), day);
  vec3 col = wc * diffuse * amb * mix(vec3(1.0), tint, 0.4) * (1.0 - cs * 0.6);
  col = mix(col, skyC * (1.0 - cs * 0.5), clamp(F, 0.0, 1.0) * 0.9);
  float shin = mix(40.0, 700.0, wk);
  float spec = pow(max(dot(R, L), 0.0), shin) * mix(0.35, 4.0, wk);
  col += tint * spec * day * (1.0 - cs);
  // Moon glint on the night side.
  vec3 moonDir = normalize(vec3(-L.x, 0.6, -L.z));
  col += vec3(0.5, 0.6, 0.8) * pow(max(dot(R, moonDir), 0.0), 200.0) * 0.25 * night * wk;

  // ---- shoreline foam.
  float alpha = mix(0.3, 0.97, smoothstep(0.0, 14.0, depth));
  if (wk > 0.0) {
    float band = sin(depth * 1.6 - t * 1.4 + snoise(wp.xz * 70.0) * 2.5) * 0.5 + 0.5;
    float foam = (1.0 - smoothstep(0.0, 3.5, depth)) * smoothstep(0.35, 0.9, band) * wk;
    foam += (1.0 - smoothstep(0.0, 0.8, depth)) * 0.6 * wk;
    col = mix(col, vec3(0.85) * amb, clamp(foam, 0.0, 1.0) * 0.8);
    alpha = max(alpha, foam * 0.9);
  }

  // ---- seasonal sea ice.
  float iceN = fbm3(wp.xz * 1.5) * 1.5 + snoise(wp.xz * 12.0) * 0.6;
  float ice = smoothstep(-2.5, -7.0, tNow + iceN) * (uIsLake == 1 ? 1.2 : 1.0);
  if (ice > 0.0) {
    vec2 cc = cellular(wp.xz * 25.0);
    float crack = smoothstep(0.02, 0.08, cc.x);
    vec3 iceC = mix(vec3(0.55, 0.62, 0.7), vec3(0.85, 0.89, 0.93), crack * (0.8 + 0.2 * cc.y));
    iceC *= (0.55 + 0.45 * max(dot(vec3(0.0, 1.0, 0.0), L), 0.0)) * amb;
    col = mix(col, iceC, clamp(ice, 0.0, 1.0));
    alpha = max(alpha, clamp(ice, 0.0, 1.0));
  }

  vec3 emis = applyOverlay(col, wp, pix, true);
  col += emis;
  float outside = max(max(-wp.x, wp.x - uWorldSize.x), max(-wp.z, wp.z - uWorldSize.y));
  col *= 1.0 - smoothstep(0.0, 3.0, outside) * 0.65;
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

const OCEAN_VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
uniform vec3 uCenter;
uniform float uRadius;
varying vec3 vWPos;
void main() {
  vec2 p = position.xy;
  p = sign(p) * (p * p * 0.92 + abs(p) * 0.08);
  vec3 wp = vec3(uCenter.x + p.x * uRadius, 0.0, uCenter.z - p.y * uRadius);
  vWPos = wp;
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const LAKE_VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec3 vWPos;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWPos = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

export class Water {
  readonly group = new THREE.Group();
  readonly ocean: THREE.Mesh;
  readonly lakes: THREE.Mesh | null;
  private oceanMat: THREE.ShaderMaterial;
  private lakeMat: THREE.ShaderMaterial;

  constructor(world: WorldData, shared: Shared, tex: WorldTextures, overlay: Overlay) {
    const common = {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      ...shared,
      ...overlay.uniforms,
      uHeightTex: { value: tex.height },
      uLandTex: { value: tex.land },
      uClimateTex: { value: tex.climate },
      uHMSize: { value: new THREE.Vector2(world.hw, world.hh) },
      uYScale: { value: Y_SCALE },
    };
    this.oceanMat = new THREE.ShaderMaterial({
      uniforms: { ...common, uIsLake: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uRadius: { value: 100 } },
      vertexShader: OCEAN_VERT,
      fragmentShader: WATER_FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    const g = new THREE.PlaneGeometry(2, 2, 96, 96);
    this.ocean = new THREE.Mesh(g, this.oceanMat);
    this.ocean.frustumCulled = false;
    this.ocean.renderOrder = 1;
    this.group.add(this.ocean);

    this.lakeMat = new THREE.ShaderMaterial({
      uniforms: { ...common, uIsLake: { value: 1 } },
      vertexShader: LAKE_VERT,
      fragmentShader: WATER_FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    const lg = buildLakeGeometry(world);
    this.lakes = lg ? new THREE.Mesh(lg, this.lakeMat) : null;
    if (this.lakes) {
      this.lakes.renderOrder = 1;
      this.group.add(this.lakes);
    }
  }

  update(target: THREE.Vector3, camDist: number, worldW: number, worldH: number): void {
    const u = this.oceanMat.uniforms;
    const r = Math.max(camDist * 8, 40, camDist > 150 ? Math.max(worldW, worldH) * 1.2 : 0);
    // Snap the grid centre so vertices don't swim.
    const snap = r / 48;
    u.uCenter.value.set(Math.round(target.x / snap) * snap, 0, Math.round(target.z / snap) * snap);
    u.uRadius.value = r;
  }
}

function buildLakeGeometry(world: WorldData): THREE.BufferGeometry | null {
  if (!world.lakes.length) return null;
  const w = world.hw, h = world.hh;
  const owner = new Int32Array(w * h).fill(-1);
  world.lakes.forEach((l, li) => { for (const c of l.cells) owner[c] = li; });
  // Dilate twice so the lake plane runs under the shore.
  for (let pass = 0; pass < 2; pass++) {
    const add: [number, number][] = [];
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = j * w + i;
        if (owner[k] >= 0) continue;
        for (let d = 0; d < 4; d++) {
          const ii = i + (d === 0 ? 1 : d === 1 ? -1 : 0), jj = j + (d === 2 ? 1 : d === 3 ? -1 : 0);
          if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
          const o = owner[jj * w + ii];
          if (o >= 0) { add.push([k, o]); break; }
        }
      }
    }
    for (const [k, o] of add) owner[k] = o;
  }
  const pos: number[] = [];
  const idx: number[] = [];
  const hs = HEIGHT_SPACING / 2;
  for (let k = 0; k < w * h; k++) {
    const o = owner[k];
    if (o < 0) continue;
    const i = k % w, j = (k / w) | 0;
    const x = i * HEIGHT_SPACING, z = j * HEIGHT_SPACING;
    const y = world.lakes[o].level * Y_SCALE;
    const b = pos.length / 3;
    pos.push(x - hs, y, z - hs, x + hs, y, z - hs, x - hs, y, z + hs, x + hs, y, z + hs);
    idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}
