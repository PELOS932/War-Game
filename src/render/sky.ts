import * as THREE from 'three';
import type { Shared } from './lighting';
import { CLOUD_GLSL, DAYLIGHT_GLSL, NOISE_GLSL } from './shaders/common';

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const SKY_FRAG = /* glsl */ `
#include <common>
${NOISE_GLSL}
${DAYLIGHT_GLSL}
uniform vec3 uSkyColor;
uniform vec3 uHorizonColor;
uniform float uLocalDay;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 L = normalize(uSunDir);
  vec3 day = mix(uHorizonColor, uSkyColor, pow(max(h, 0.0), 0.55));
  float sd = max(dot(d, L), 0.0);
  day += vec3(1.0, 0.8, 0.55) * pow(sd, 12.0) * 0.35 + vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9997, sd) * 4.0;
  vec3 nightC = mix(vec3(0.012, 0.018, 0.04), vec3(0.002, 0.004, 0.012), max(h, 0.0));
  vec2 sp = d.xz / max(d.y + 1.05, 0.05) * 420.0;
  float star = step(0.9975, hash12(floor(sp))) * smoothstep(0.0, 0.3, h);
  nightC += vec3(star) * 0.9;
  vec3 col = mix(nightC, day, uLocalDay);
  // Below the horizon: haze.
  col = mix(col, uHorizonColor * mix(0.05, 1.0, uLocalDay), smoothstep(0.02, -0.15, d.y));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const CLOUD_VERT = /* glsl */ `
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

const CLOUD_FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
${NOISE_GLSL}
${DAYLIGHT_GLSL}
${CLOUD_GLSL}
uniform float uCloudFade;
varying vec3 vWPos;
void main() {
  vec3 wp = vWPos;
  float lat = latAt(wp.z);
  float d = cloudDensity(wp.xz, lat, false);
  if (d < 0.01) discard;
  vec3 L = normalize(uSunDir);
  float d2 = cloudDensity(wp.xz + L.xz * 1.2, lat, true);
  float shade = 1.0 - clamp(d2 - d * 0.5, 0.0, 1.0) * 0.4;
  shade *= 0.82 + 0.18 * d;
  float day = daylightFactor(wp);
  vec3 tint = sunTint(wp);
  vec3 lit = vec3(0.96, 0.97, 1.0) * shade * tint;
  vec3 col = mix(vec3(0.025, 0.03, 0.05), lit, day);
  float a = pow(d, 1.3) * 0.92;
  gl_FragColor = vec4(col, a * uCloudFade * uCloudsOn);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export const CLOUD_HEIGHT = 6;

export class Sky {
  readonly dome: THREE.Mesh;
  readonly clouds: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private cloudMat: THREE.ShaderMaterial;

  constructor(shared: Shared, worldW: number, worldH: number) {
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { ...shared, uLocalDay: { value: 1 } },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.skyMat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -100;

    this.cloudMat = new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...shared, uCloudFade: { value: 1 } },
      vertexShader: CLOUD_VERT,
      fragmentShader: CLOUD_FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    const margin = 60;
    const g = new THREE.PlaneGeometry(worldW + margin * 2, worldH + margin * 2, 1, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(worldW / 2, CLOUD_HEIGHT, worldH / 2);
    this.clouds = new THREE.Mesh(g, this.cloudMat);
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = 50;
  }

  update(camera: THREE.PerspectiveCamera, camDist: number, localDay: number, cloudsOn: boolean): void {
    this.dome.position.copy(camera.position);
    this.dome.scale.setScalar(camera.far * 0.9);
    this.dome.updateMatrixWorld();
    this.skyMat.uniforms.uLocalDay.value = localDay;
    const fade = THREE.MathUtils.smoothstep(camDist, 14, 70);
    this.cloudMat.uniforms.uCloudFade.value = fade;
    this.clouds.visible = cloudsOn && fade > 0.01 && camera.position.y > CLOUD_HEIGHT + 1;
  }
}
