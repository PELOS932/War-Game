import * as THREE from 'three';
import type { WorldSettings } from '../worldgen/types';
import { worldHeight, worldWidth } from '../worldgen/types';
import { DAYLIGHT_GLSL } from './shaders/common';

/** Game hour 0 = 2030-01-01 00:00 UTC. */
export interface SunState {
  /** Sub-solar longitude (radians). */
  lon: number;
  /** Solar declination (radians). */
  decl: number;
  /** Day of year 0..365. */
  dayOfYear: number;
}

export function sunFromHour(hour: number): SunState {
  const day = hour / 24;
  const dayOfYear = ((day % 365.25) + 365.25) % 365.25;
  const utc = ((hour % 24) + 24) % 24;
  const decl = (-23.44 * Math.PI / 180) * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365.25);
  // Equation of time (minutes) for a little extra realism.
  const b = (2 * Math.PI * (dayOfYear - 81)) / 364;
  const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  let lonDeg = -15 * (utc - 12 + eot / 60);
  lonDeg = ((lonDeg + 540) % 360) - 180;
  return { lon: (lonDeg * Math.PI) / 180, decl, dayOfYear };
}

/**
 * Local sun direction (world space, pointing TO the sun) at latitude/longitude
 * in degrees. x = east, y = up, z = south.
 */
export function localSunDir(latDeg: number, lonDeg: number, sun: SunState, out: THREE.Vector3): THREE.Vector3 {
  const phi = (latDeg * Math.PI) / 180;
  const h = sun.lon - (lonDeg * Math.PI) / 180;
  const cd = Math.cos(sun.decl), sd = Math.sin(sun.decl);
  const east = cd * Math.sin(h);
  const north = Math.cos(phi) * sd - Math.sin(phi) * cd * Math.cos(h);
  const up = Math.sin(phi) * sd + Math.cos(phi) * cd * Math.cos(h);
  return out.set(east, up, -north).normalize();
}

/** Uniforms shared by every custom / patched material (assigned by reference). */
export function createSharedUniforms(s: WorldSettings) {
  return {
    uSunLon: { value: 0 },
    uSunDecl: { value: 0 },
    uDayNight: { value: 1 },
    uNightAmbient: { value: new THREE.Vector3(0.2, 0.25, 0.42) },
    uWorldSize: { value: new THREE.Vector2(worldWidth(s), worldHeight(s)) },
    uLatRange: { value: new THREE.Vector2(s.latNorth, s.latSouth) },
    uLonRange: { value: new THREE.Vector2(s.lonWest, s.lonEast) },
    uTime: { value: 0 },
    uCloudTime: { value: 0 },
    uCloudCover: { value: 0.4 },
    uCloudShadow: { value: 1 },
    uCloudsOn: { value: 1 },
    uCamDist: { value: 100 },
    uCamPos: { value: new THREE.Vector3() },
    uCamTarget: { value: new THREE.Vector3() },
    uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.3) },
    uDayOfYear: { value: 0 },
    uSkyColor: { value: new THREE.Color(0.55, 0.7, 0.9) },
    uHorizonColor: { value: new THREE.Color(0.75, 0.83, 0.92) },
    uPixelScale: { value: 1 },
    /** World units per device pixel per unit of view depth. */
    uPixelK: { value: 0.001 },
  };
}
export type Shared = ReturnType<typeof createSharedUniforms>;

export interface PatchOptions {
  /** Extra GLSL declarations for the fragment shader. */
  fragDecl?: string;
  /** GLSL run after lighting; may modify `reflectedLight` / `totalEmissiveRadiance`. */
  afterLights?: string;
  /** GLSL replacing <color_fragment> additions (runs after it). */
  afterColor?: string;
  vertDecl?: string;
  /** GLSL appended at the end of vertex main (after world position is known). */
  vertEnd?: string;
  /** GLSL inserted right after <begin_vertex> (can modify `transformed`). */
  afterBegin?: string;
  /** Replace the color_vertex chunk to tint by instance colour only where aTint = 1. */
  tintAttribute?: boolean;
  /** Extra uniforms. */
  uniforms?: Record<string, { value: unknown }>;
  /** Unique cache key if the patch differs from other materials of the same type. */
  key: string;
}

/**
 * Patches a MeshStandardMaterial (or subclass) so it respects the planetary
 * day/night cycle: direct light is scaled by the local sun altitude, the night
 * side gets a dim blue ambient, and a world-position varying (vWPos) is
 * available to extra code.
 */
export function patchStandard<T extends THREE.MeshStandardMaterial>(mat: T, shared: Shared, opts: PatchOptions): T {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared, opts.uniforms ?? {});
    let vs = shader.vertexShader;
    let fs = shader.fragmentShader;
    vs = vs.replace(
      '#include <common>',
      `#include <common>
varying vec3 vWPos;
${opts.tintAttribute ? 'attribute float aTint;' : ''}
${opts.vertDecl ?? ''}`,
    );
    if (opts.afterBegin) vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>\n${opts.afterBegin}`);
    if (opts.tintAttribute) {
      vs = vs.replace(
        '#include <color_vertex>',
        `#if defined( USE_COLOR_ALPHA )
  vColor = vec4( 1.0 );
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
  vColor = vec3( 1.0 );
#endif
#ifdef USE_COLOR
  vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
  vColor.xyz = mix(vColor.xyz, vColor.xyz * instanceColor.xyz, aTint);
#endif`,
      );
    }
    vs = vs.replace(
      '#include <fog_vertex>',
      `#include <fog_vertex>
{
  vec4 _wp = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  _wp = instanceMatrix * _wp;
#endif
  vWPos = (modelMatrix * _wp).xyz;
}
${opts.vertEnd ?? ''}`,
    );
    fs = fs.replace(
      '#include <common>',
      `#include <common>
varying vec3 vWPos;
${DAYLIGHT_GLSL}
${opts.fragDecl ?? ''}`,
    );
    if (opts.afterColor) fs = fs.replace('#include <color_fragment>', `#include <color_fragment>\n${opts.afterColor}`);
    fs = fs.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
{
  float _day = daylightFactor(vWPos);
  vec3 _tint = sunTint(vWPos);
  vec3 _moon = vec3(0.1, 0.13, 0.22) * uDayNight;
  reflectedLight.directDiffuse *= _day * _tint + (1.0 - _day) * _moon;
  reflectedLight.directSpecular *= _day * _tint;
  vec3 _amb = mix(uNightAmbient, vec3(1.0), _day);
  reflectedLight.indirectDiffuse *= _amb;
  reflectedLight.indirectSpecular *= _amb;
}
${opts.afterLights ?? ''}`,
    );
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => opts.key;
  return mat;
}
