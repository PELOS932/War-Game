import * as THREE from 'three';
import type { RTSCamera } from './camera';
import type { WorldContext } from './index';
import { buildRibbonGeometry, resample, RIBBON_VERT, smoothPolyline } from './ribbon';

const PATH_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uLen;
varying vec3 vWPos;
varying float vV;
varying float vDist;
varying float vWidthPx;
varying float vKind;
void main() {
  float av = abs(vV);
  float edge = 1.0 - smoothstep(0.6, 1.0, av);
  // Chevrons flowing toward the destination.
  float per = 0.08 * uLen;
  float u = fract((vDist - uTime * per * 1.6) / per);
  float chev = step(0.5, fract(u - av * 0.25));
  vec3 c = mix(uColor * 0.55, uColor * 1.25, chev);
  float outline = smoothstep(0.75, 0.9, av);
  c = mix(c, vec3(0.02), outline * 0.8);
  gl_FragColor = vec4(c, edge * 0.92);
}
`;

const RING_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uPhase;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = 0.0;
  for (int i = 0; i < 2; i++) {
    float ph = fract(uPhase * 1.2 - float(i) * 0.5);
    float rr = ph;
    float w = 0.08;
    a += (1.0 - smoothstep(0.0, w, abs(r - rr))) * (1.0 - ph);
  }
  a += (1.0 - smoothstep(0.08, 0.14, r)) * (1.0 - uPhase);
  if (a < 0.02) discard;
  gl_FragColor = vec4(uColor, min(1.0, a));
}
`;

const RING_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

interface Ping { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; t: number; x: number; z: number; y: number }

export class Markers {
  readonly group = new THREE.Group();
  private ctx: WorldContext;
  private pathMesh: THREE.Mesh | null = null;
  private pathMat: THREE.ShaderMaterial;
  private endMesh: THREE.Mesh;
  private endMat: THREE.ShaderMaterial;
  private pings: Ping[] = [];
  private pathEnd: THREE.Vector3 | null = null;
  private time = 0;
  private ringGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);

  constructor(ctx: WorldContext) {
    this.ctx = ctx;
    this.pathMat = new THREE.ShaderMaterial({
      uniforms: {
        ...ctx.shared,
        uColor: { value: new THREE.Color(0.35, 1, 0.35) },
        uLen: { value: 1 },
        uMinPx: { value: 7 },
        uBias: { value: 0.01 },
        uWidthScale: { value: 1 },
      },
      vertexShader: RIBBON_VERT.replace('#include <fog_pars_vertex>', '').replace('#include <fog_vertex>', ''),
      fragmentShader: PATH_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.endMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0.35, 1, 0.35) }, uPhase: { value: 0 } },
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.endMesh = new THREE.Mesh(this.ringGeo, this.endMat);
    this.endMesh.visible = false;
    this.endMesh.renderOrder = 900;
    this.group.add(this.endMesh);
  }

  private surface(x: number, z: number): number {
    const hf = this.ctx.hf;
    return Math.max(hf.heightAt(x, z, 0.1), hf.waterAt(x, z));
  }

  showPath(hexes: number[], hostile: boolean): void {
    if (this.pathMesh) {
      this.group.remove(this.pathMesh);
      this.pathMesh.geometry.dispose();
      this.pathMesh = null;
    }
    this.pathEnd = null;
    this.endMesh.visible = false;
    const g = this.ctx.grid;
    const valid = hexes.filter((h) => h >= 0 && h < g.count);
    if (!valid.length) return;
    const color = hostile ? new THREE.Color(1, 0.3, 0.22) : new THREE.Color(0.4, 1, 0.4);
    this.pathMat.uniforms.uColor.value.copy(color);
    this.endMat.uniforms.uColor.value.copy(color);
    const last = valid[valid.length - 1];
    this.pathEnd = new THREE.Vector3(g.cx[last], this.surface(g.cx[last], g.cz[last]), g.cz[last]);
    this.endMesh.visible = true;
    if (valid.length < 2) return;
    const xz: number[] = [];
    for (const h of valid) xz.push(g.cx[h], g.cz[h]);
    const sm = smoothPolyline(xz, 2);
    const rs = resample(sm.xz, 0.08);
    const pts: number[] = [];
    const widths: number[] = [];
    const m = rs.xz.length / 2;
    for (let i = 0; i < m; i++) {
      const x = rs.xz[i * 2], z = rs.xz[i * 2 + 1];
      pts.push(x, this.surface(x, z) + 0.01, z);
      widths.push(0.0);
    }
    const geo = buildRibbonGeometry([{ pts, widths, kind: 0 }]);
    if (!geo) return;
    let len = 0;
    for (let i = 1; i < m; i++) len += Math.hypot(rs.xz[i * 2] - rs.xz[i * 2 - 2], rs.xz[i * 2 + 1] - rs.xz[i * 2 - 1]);
    this.pathMat.uniforms.uLen.value = Math.max(0.5, Math.min(len, 8));
    this.pathMesh = new THREE.Mesh(geo, this.pathMat);
    this.pathMesh.frustumCulled = false;
    this.pathMesh.renderOrder = 890;
    this.group.add(this.pathMesh);
  }

  ping(hex: number, color: string): void {
    const g = this.ctx.grid;
    if (hex < 0 || hex >= g.count) return;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uPhase: { value: 0 } },
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.renderOrder = 910;
    mesh.frustumCulled = false;
    const x = g.cx[hex], z = g.cz[hex];
    this.pings.push({ mesh, mat, t: 0, x, z, y: this.surface(x, z) });
    this.group.add(mesh);
  }

  update(dt: number, cam: RTSCamera, camera: THREE.Camera): void {
    void camera;
    this.time += dt;
    const d = cam.dist;
    const r = Math.max(0.35, d * 0.035);
    if (this.pathEnd && this.endMesh.visible) {
      this.endMesh.position.copy(this.pathEnd);
      this.endMesh.scale.setScalar(r * 0.8);
      this.endMat.uniforms.uPhase.value = (this.time * 0.8) % 1;
    }
    this.pathMat.uniforms.uMinPx.value = 7 * (this.ctx.shared.uPixelScale.value as number);
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i];
      p.t += dt;
      const ph = p.t / 2.4;
      if (ph >= 1) {
        this.group.remove(p.mesh);
        p.mat.dispose();
        this.pings.splice(i, 1);
        continue;
      }
      p.mesh.position.set(p.x, p.y + 0.01, p.z);
      p.mesh.scale.setScalar(r * 1.6);
      p.mat.uniforms.uPhase.value = ph;
    }
  }
}
