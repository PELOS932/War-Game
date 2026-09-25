import * as THREE from 'three';
import { BLOCK_SIZE, MAX_SHADER_CITIES, STREET_WIDTH, Y_SCALE } from '../constants';
import { patchStandard, Shared } from '../lighting';
import { OVERLAY_GLSL, Overlay } from '../overlay';
import { CLOUD_GLSL, HEX_GLSL, NOISE_GLSL, PROC_GLSL } from '../shaders/common';
import type { WorldTextures } from '../textures';

export interface CityUniforms {
  uCities: { value: THREE.Vector4[] };
  uCities2: { value: THREE.Vector4[] };
  uCityCount: { value: number };
}

export function createCityUniforms(): CityUniforms {
  return {
    uCities: { value: Array.from({ length: MAX_SHADER_CITIES }, () => new THREE.Vector4()) },
    uCities2: { value: Array.from({ length: MAX_SHADER_CITIES }, () => new THREE.Vector4()) },
    uCityCount: { value: 0 },
  };
}

/** GLSL helpers for sampling the world textures (needs uHMSize, uHeightTex, uYScale). */
export const WORLDTEX_GLSL = /* glsl */ `
uniform sampler2D uHeightTex;
uniform vec2 uHMSize;
uniform float uYScale;
vec2 hmUV(vec2 xz) { return (xz * 2.0 + 0.5) / uHMSize; }
float heightM(vec2 xz) { return texture(uHeightTex, hmUV(xz)).r; }
vec3 texNormal(vec2 xz) {
  float d = 0.5;
  float hl = max(heightM(xz - vec2(d, 0.0)), 0.0), hr = max(heightM(xz + vec2(d, 0.0)), 0.0);
  float hd = max(heightM(xz - vec2(0.0, d)), 0.0), hu = max(heightM(xz + vec2(0.0, d)), 0.0);
  return normalize(vec3((hl - hr) * uYScale, 2.0 * d, (hd - hu) * uYScale));
}
`;

const TERRAIN_DECL = /* glsl */ `
${NOISE_GLSL}
${PROC_GLSL}
${CLOUD_GLSL}
${HEX_GLSL}
${WORLDTEX_GLSL}
${OVERLAY_GLSL}
uniform sampler2D uAlbedoTex;
uniform sampler2D uClimateTex;
uniform sampler2D uLandTex;
uniform vec4 uCities[${MAX_SHADER_CITIES}];
uniform vec4 uCities2[${MAX_SHADER_CITIES}];
uniform int uCityCount;
varying vec3 vNormalW;
varying float vSpacing;
const float BLOCK = ${BLOCK_SIZE.toFixed(5)};
const float STREET = ${STREET_WIDTH.toFixed(5)};

float cloudShadowAt(vec3 wp) {
  if (uCloudShadow <= 0.0) return 0.0;
  vec3 L = normalize(uSunDir);
  vec2 p = wp.xz + L.xz / max(L.y, 0.25) * (6.0 - wp.y);
  return cloudDensity(p, latAt(p.y), true) * 0.5 * uCloudShadow;
}
`;

const TERRAIN_SURFACE = /* glsl */ `
vec3 wp = vWPos;
float pix = max(length(dFdx(wp.xz)), length(dFdy(wp.xz)));
float camD = length(cameraPosition - wp);
vec2 uv = hmUV(wp.xz);
vec4 alb = texture(uAlbedoTex, uv);
vec4 cl = texture(uClimateTex, uv);
vec4 ld = texture(uLandTex, uv);
float eCell = texture(uHeightTex, uv).r;
float altM = wp.y / uYScale;
float tAnn = cl.r * 255.0 / 3.2 - 40.0;
float precip = cl.g * 255.0 * 16.0;
float cont = cl.b;
float riverP = cl.a;
float forest = alb.a;
vec3 col = alb.rgb;
vec3 tLights = vec3(0.0);
vec3 tEmis = vec3(0.0);
float tRough = 0.92;

// ---- normals: geometry (with relief detail) near, heightmap texture far.
vec3 nGeo = normalize(vNormalW);
vec3 nTex = texNormal(wp.xz);
float geoW = 1.0 - smoothstep(0.12, 0.45, vSpacing);
vec3 N = normalize(mix(nTex, nGeo, geoW));
float slope = 1.0 - N.y;

// ---- climate & season.
float lat = latAt(wp.z);
float hemi = lat >= 0.0 ? 1.0 : -1.0;
float sAmp = (2.5 + 19.0 * cont) * smoothstep(8.0, 60.0, abs(lat));
float seasonCos = cos(6.2831853 * (uDayOfYear - 18.0) / 365.25);
float tNow = tAnn - hemi * sAmp * seasonCos;
float dAlt = altM - max(eCell, 0.0);
float tLocal = tNow - 0.0065 * dAlt;
float tLocalAnn = tAnn - 0.0065 * dAlt;
float summer = -hemi * seasonCos * smoothstep(12.0, 32.0, abs(lat));
float doyL = mod(uDayOfYear + (hemi < 0.0 ? 182.6 : 0.0), 365.25);
float temperate = smoothstep(-3.0, 3.0, tAnn) * (1.0 - smoothstep(14.0, 20.0, tAnn)) * smoothstep(24.0, 36.0, abs(lat));
float autumn = exp(-pow((doyL - 290.0) / 22.0, 2.0)) * temperate;
float winter = smoothstep(0.3, 0.9, -summer) * (1.0 - smoothstep(13.0, 21.0, tAnn));

float nearK = 1.0 - smoothstep(0.003, 0.02, pix);
float midK = 1.0 - smoothstep(0.02, 0.2, pix);

// ---- macro variation.
float mv1 = fbm3(wp.xz * 0.37);
float mv2 = snoise(wp.xz * 2.3 + 11.0);
col *= 1.0 + 0.07 * mv1 + 0.04 * mv2 * midK;
col = mix(col, col * vec3(1.06, 1.0, 0.9), 0.5 + 0.5 * snoise(wp.xz * 0.11));

// ---- seasonal vegetation tones.
float greenness = clamp((col.g - col.r * 0.9) * 8.0, 0.0, 1.0);
vec3 straw = vec3(0.19, 0.16, 0.095);
col = mix(col, mix(col, straw, 0.6), winter * greenness * (1.0 - forest * 0.7) * 0.8);
float decid = smoothstep(2.0, 9.0, tAnn) * (1.0 - smoothstep(17.0, 22.0, tAnn));
vec3 autumnC = mix(vec3(0.30, 0.10, 0.02), vec3(0.42, 0.26, 0.03), 0.5 + 0.5 * snoise(wp.xz * 7.0));
col = mix(col, autumnC, autumn * forest * decid * 0.7);
col = mix(col, vec3(0.085, 0.07, 0.055), winter * forest * decid * 0.55);

// ---- mid-scale land cover (5–50 km features): patchy vegetation, dry/rocky ground, dunes.
{
  float kM = 1.0 - smoothstep(0.05, 0.45, pix);
  if (kM > 0.0) {
    float veg = clamp((col.g - col.r * 0.85) * 7.0 + forest, 0.0, 1.0);
    float p1 = fbm3(wp.xz * 2.7 + 7.0);
    float p2 = fbm3(wp.xz * 8.3 - 3.0);
    float pm = smoothstep(-0.4, 0.4, p1 + 0.55 * p2);
    vec3 vcol = mix(col * vec3(0.7, 0.8, 0.68), col * vec3(1.16, 1.1, 0.9), pm);
    vec3 dcol = col * mix(vec3(0.8, 0.78, 0.76), vec3(1.12, 1.08, 1.02), pm);
    col = mix(col, mix(dcol, vcol, veg), kM * 0.85);
    // Dune fields in hot, dry deserts.
    float desert = smoothstep(350.0, 120.0, precip) * smoothstep(12.0, 20.0, tAnn) * (1.0 - veg) * smoothstep(0.25, 0.05, slope);
    if (desert > 0.01) {
      vec2 dq = vec2(wp.x * 0.8 + wp.z * 0.6, -wp.x * 0.6 + wp.z * 0.8);
      float dn = 1.0 - abs(snoise(vec2(dq.x * 5.0, dq.y * 14.0) + fbm2(wp.xz * 1.3) * 1.5));
      dn = pow(dn, 3.0);
      float dfield = smoothstep(-0.1, 0.4, fbm2(wp.xz * 0.6 + 2.0));
      col *= 1.0 + (dn - 0.3) * 0.28 * desert * dfield * kM;
    }
  }
}

// ---- ground micro-variation.
if (midK > 0.0) {
  float g1 = fbm3(wp.xz * 11.0);
  float g2 = snoise(wp.xz * 47.0);
  col *= 1.0 + midK * 0.11 * g1 + nearK * 0.07 * g2;
}

// ---- forest canopy.
if (forest > 0.04 && midK > 0.0) {
  float clump = fbm2(wp.xz * 26.0);
  col *= 1.0 + forest * midK * 0.2 * clump;
  if (nearK > 0.0) {
    vec2 cc = cellular(wp.xz * 140.0);
    float crown = 1.0 - smoothstep(0.1, 0.9, cc.x);
    vec3 fc = col * (0.55 + 0.6 * crown) * (0.88 + 0.24 * cc.y);
    col = mix(col, fc, forest * nearK);
  }
}

// ---- farmland patchwork.
float farmW = ld.g * (1.0 - smoothstep(0.35, 0.8, forest));
if (farmW > 0.02 && midK > 0.0) {
  float ang = snoise(wp.xz * 0.21) * 1.3 + 0.5;
  float ca = cos(ang), sa = sin(ang);
  vec2 q = vec2(ca * wp.x + sa * wp.z, -sa * wp.x + ca * wp.z);
  vec2 fsz = vec2(0.0125, 0.0082) * (0.75 + 0.6 * vnoise(wp.xz * 0.7, 3u));
  vec2 fq = q / fsz;
  vec2 cid = floor(fq);
  vec2 f = fq - cid;
  float h1 = hash12(cid + 17.0);
  float h2 = hash12(cid * 1.73 + 3.1);
  vec3 green = vec3(0.075, 0.15, 0.035);
  vec3 gold = vec3(0.36, 0.28, 0.11);
  vec3 brown = vec3(0.16, 0.11, 0.065);
  vec3 pale = vec3(0.19, 0.19, 0.09);
  vec3 fc;
  float s = summer;
  if (abs(lat) < 22.0) {
    fc = mix(green * 1.2, mix(gold, brown, h2), step(0.55, h1));
  } else if (h1 < 0.33) {
    fc = mix(brown, green, smoothstep(-0.5, 0.25, s));
  } else if (h1 < 0.7) {
    fc = mix(mix(green * 1.1, gold, smoothstep(0.35, 0.85, s)), brown * 1.1, smoothstep(0.1, -0.5, s));
  } else {
    fc = mix(pale, green * 1.25, smoothstep(-0.7, 0.1, s));
  }
  fc *= 0.8 + 0.4 * h2;
  // Keep the regional tone of the satellite albedo.
  float la = dot(col, vec3(0.3, 0.59, 0.11));
  float lf = dot(fc, vec3(0.3, 0.59, 0.11));
  fc = mix(fc, fc * la / max(lf, 0.005), 0.45);
  float edge = min(min(f.x, 1.0 - f.x) * fsz.x, min(f.y, 1.0 - f.y) * fsz.y);
  float hedge = 1.0 - smoothstep(0.00025, 0.0007 + pix * 0.7, edge);
  fc = mix(fc, col * 0.55, hedge * 0.55);
  float vis = 1.0 - smoothstep(0.003, 0.012, pix);
  vec3 avgF = mix(col, (green + gold + pale) / 3.0 * 1.1, 0.25);
  col = mix(col, mix(avgF, fc, vis), farmW * midK * 0.9);
}

// ---- rock on steep slopes and high barren ground.
slope = 1.0 - N.y;
float rockN = fbm3(wp.xz * 13.0);
float rockW = smoothstep(0.28, 0.52, slope + rockN * 0.1);
rockW = max(rockW, smoothstep(3000.0, 4800.0, altM + rockN * 400.0) * 0.55);
vec3 rockC = mix(vec3(0.13, 0.12, 0.11), vec3(0.28, 0.26, 0.23), 0.5 + 0.5 * rockN);
rockC *= 0.88 + 0.12 * sin(altM * 0.028 + rockN * 5.0);
rockC = mix(rockC, alb.rgb * 0.85, 0.3);
col = mix(col, rockC, rockW * smoothstep(-5.0, 20.0, altM));

// ---- beaches & underwater.
float oceanM = ld.b;
float beach = smoothstep(0.02, 0.25, oceanM) * (1.0 - smoothstep(2.0, 11.0, altM)) * (1.0 - smoothstep(0.08, 0.28, slope)) * step(-3.0, altM);
vec3 sand = vec3(0.58, 0.49, 0.32) * (0.93 + 0.12 * snoise(wp.xz * 31.0));
sand = mix(sand, sand * 0.62, 1.0 - smoothstep(-0.5, 1.2, altM));
col = mix(col, sand, beach * 0.85);
if (altM < 0.0 && oceanM > 0.02) {
  col = mix(col, vec3(0.32, 0.29, 0.2), 0.6) * mix(1.0, 0.35, smoothstep(0.0, 60.0, -altM));
  tRough = 0.4;
}

// ---- river-bank greenery in dry lands.
float riv = smoothstep(0.08, 0.55, riverP) * (1.0 - smoothstep(350.0, 1100.0, precip)) * step(1.0, altM);
col = mix(col, vec3(0.055, 0.1, 0.03) * (0.9 + 0.2 * mv2), riv * 0.5);

// ---- cities: street grids near the camera, grey patches far away.
float urb = ld.r;
float cityD = 0.0;
vec4 cc0 = vec4(0.0);
float cseed = 0.0;
for (int i = 0; i < ${MAX_SHADER_CITIES}; i++) {
  if (i >= uCityCount) break;
  vec4 c = uCities[i];
  float d = cityDensity(wp.xz, c.xy, c.z, uCities2[i].x);
  if (d > cityD) { cityD = d; cc0 = c; cseed = uCities2[i].x; }
}
vec3 urbanAvg = vec3(0.16, 0.155, 0.15);
if (cityD > 0.004) {
  float ca = cos(cc0.w), sa = sin(cc0.w);
  vec2 dq = wp.xz - cc0.xy;
  vec2 q = vec2(dq.x * ca + dq.y * sa, -dq.x * sa + dq.y * ca);
  vec2 bq = q / BLOCK;
  vec2 bid = floor(bq);
  vec2 bf = (bq - bid) * BLOCK;
  float sd = min(min(bf.x, BLOCK - bf.x), min(bf.y, BLOCK - bf.y));
  float street = 1.0 - smoothstep(STREET * 0.5 - pix * 0.5, STREET * 0.5 + pix * 0.5, sd);
  float bh = hashI(ivec2(bid), uint(cseed) + 101u);
  float bh2 = hashI(ivec2(bid), uint(cseed) + 202u);
  bool park = bh2 < 0.07 + 0.1 * (1.0 - cityD);
  vec3 lot = mix(vec3(0.15, 0.145, 0.14), vec3(0.26, 0.245, 0.225), bh);
  if (park) lot = vec3(0.05, 0.1, 0.03) * (0.9 + 0.3 * bh);
  else if (cityD < 0.45) lot = mix(lot, col * 0.8, 0.45);
  vec3 uc = mix(lot, vec3(0.045, 0.045, 0.05), street);
  float vis = 1.0 - smoothstep(BLOCK * 0.15, BLOCK * 0.5, pix);
  float wU = smoothstep(0.02, 0.2, cityD);
  col = mix(col, mix(urbanAvg, uc, vis), wU);
  tLights += vec3(1.0, 0.62, 0.3) * street * vis * wU * 0.9;
  tLights += vec3(1.0, 0.8, 0.55) * (1.0 - street) * vis * wU * step(0.8, hashI(ivec2(floor(q / (BLOCK * 0.25))), 77u)) * 0.35 * cityD;
  urb = max(urb, cityD * (1.0 - vis * 0.6));
  tRough = mix(tRough, 0.75, wU);
} else if (urb > 0.01) {
  col = mix(col, urbanAvg * (0.85 + 0.3 * snoise(wp.xz * 21.0)), smoothstep(0.02, 0.55, urb) * 0.85);
}

// ---- snow (seasonal + permanent), shed from steep faces.
float snowN = fbm3(wp.xz * 6.0) * 0.5 + snoise(wp.xz * 40.0) * 0.12 * midK;
float seasonal = smoothstep(1.0, -3.5, tLocal + snowN * 3.0) * smoothstep(90.0, 300.0, precip);
float perm = smoothstep(-5.0, -9.0, tLocalAnn + snowN * 2.5);
float snow = max(seasonal, perm);
snow *= 1.0 - smoothstep(0.42, 0.72, slope) * 0.8;
snow *= 1.0 - forest * 0.4 * (1.0 - perm);
snow *= step(0.0, altM + 5.0);
vec3 snowC = vec3(0.82, 0.85, 0.9) * (0.95 + 0.05 * rockN);
col = mix(col, snowC, clamp(snow, 0.0, 1.0));
tRough = mix(tRough, 0.55, snow);

// ---- small-scale relief bumps near the camera.
if (nearK > 0.0) {
  float e = 0.0015;
  float f0 = fbm2(wp.xz * 110.0);
  float fx = fbm2((wp.xz + vec2(e, 0.0)) * 110.0);
  float fz = fbm2((wp.xz + vec2(0.0, e)) * 110.0);
  float amp = 0.00045 * (0.5 + rockW * 1.8) * nearK * (1.0 - smoothstep(0.1, 0.6, urb));
  N = normalize(N + vec3(-(fx - f0) / e * amp, 0.0, -(fz - f0) / e * amp));
}

// ---- night lights.
{
  float sk = 1.0 - smoothstep(0.01, 0.05, pix);
  float spark = mix(0.85, 0.4 + 1.2 * vnoise(wp.xz * 40.0, 5u) * (0.5 + vnoise(wp.xz * 7.0, 6u)), sk);
  tLights += vec3(1.0, 0.66, 0.34) * pow(ld.a, 1.5) * spark * 1.4;
}

// ---- political overlay, borders, grid, highlight.
tEmis += applyOverlay(col, wp, pix, false);

// ---- map edges.
float outside = max(max(-wp.x, wp.x - uWorldSize.x), max(-wp.z, wp.z - uWorldSize.y));
col *= 1.0 - smoothstep(0.0, 3.0, outside) * 0.7;

diffuseColor.rgb = col;
vec3 tN = N;
`;

export function createTerrainMaterial(shared: Shared, tex: WorldTextures, overlay: Overlay, cities: CityUniforms, hmW: number, hmH: number): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  const uniforms = {
    uHeightTex: { value: tex.height },
    uAlbedoTex: { value: tex.albedo },
    uClimateTex: { value: tex.climate },
    uLandTex: { value: tex.land },
    uHMSize: { value: new THREE.Vector2(hmW, hmH) },
    uYScale: { value: Y_SCALE },
    ...cities,
    ...overlay.uniforms,
  };
  patchStandard(mat, shared, {
    key: 'terrain',
    uniforms,
    vertDecl: 'varying vec3 vNormalW; varying float vSpacing; attribute float aSpacing;',
    vertEnd: 'vNormalW = objectNormal; vSpacing = aSpacing;',
    fragDecl: TERRAIN_DECL,
    afterLights: /* glsl */ `
{
  float cs = cloudShadowAt(vWPos);
  reflectedLight.directDiffuse *= 1.0 - cs;
  reflectedLight.directSpecular *= 1.0 - cs;
  totalEmissiveRadiance += tLights * nightFactor(vWPos) + tEmis;
}`,
  });
  const base = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    base.call(mat, shader, r);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <map_fragment>', TERRAIN_SURFACE)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = 0.0;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(tN, 0.0)).xyz);');
  };
  return mat;
}
