import * as THREE from 'three';
import { MIN_DIST, clamp, smoothstep } from './constants';

const DEG = Math.PI / 180;

/**
 * Supreme-Ruler style RTS camera: a target point on the map, a distance along
 * the view ray, a yaw, and a pitch that depends on the distance (near top-down
 * when zoomed out, ~38° at street level). All motion is damped.
 */
export class RTSCamera {
  readonly camera: THREE.PerspectiveCamera;
  worldW: number;
  worldH: number;
  minDist = MIN_DIST;
  maxDist: number;

  // Current (smoothed) state.
  x: number;
  z: number;
  y = 0;
  dist: number;
  yaw = 0;
  // Desired state.
  dx: number;
  dz: number;
  dDist: number;
  dYaw = 0;
  /** Surface height sampler (world units). */
  heightAt: (x: number, z: number, dist: number) => number = () => 0;
  private tmp = new THREE.Vector3();

  constructor(aspect: number, worldW: number, worldH: number) {
    this.camera = new THREE.PerspectiveCamera(42, aspect, 0.01, 5000);
    this.worldW = worldW;
    this.worldH = worldH;
    this.maxDist = this.computeMaxDist(aspect);
    this.x = this.dx = worldW / 2;
    this.z = this.dz = worldH / 2;
    this.dist = this.dDist = this.maxDist * 0.8;
  }

  setWorld(worldW: number, worldH: number): void {
    this.worldW = worldW;
    this.worldH = worldH;
    this.maxDist = this.computeMaxDist(this.camera.aspect);
    this.dDist = Math.min(this.dDist, this.maxDist);
  }

  private computeMaxDist(aspect: number): number {
    // Whole map visible (width-limited on wide screens) with a small margin.
    const vf = (this.camera.fov * DEG) / 2;
    const hf = Math.atan(Math.tan(vf) * aspect);
    const byW = (this.worldW * 0.5) / Math.tan(hf);
    const byH = (this.worldH * 0.5) / Math.tan(vf);
    return Math.max(20, Math.min(byW * 1.02, Math.max(byH * 1.15, byW * 0.8)));
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.maxDist = this.computeMaxDist(aspect);
    this.dDist = Math.min(this.dDist, this.maxDist);
    this.camera.updateProjectionMatrix();
  }

  /** Zoom fraction 0 (closest) .. 1 (whole world). */
  zoomT(dist = this.dist): number {
    return clamp(Math.log(dist / this.minDist) / Math.log(this.maxDist / this.minDist), 0, 1);
  }

  pitchFor(dist: number): number {
    const t = this.zoomT(dist);
    return (38 + (86 - 38) * smoothstep(0.0, 0.85, t)) * DEG;
  }

  focus(x: number, z: number, dist?: number, instant = false): void {
    this.dx = x;
    this.dz = z;
    if (dist !== undefined) this.dDist = clamp(dist, this.minDist, this.maxDist);
    this.clampDesired();
    if (instant) {
      this.x = this.dx;
      this.z = this.dz;
      this.dist = this.dDist;
      this.yaw = this.dYaw;
      this.y = this.heightAt(this.x, this.z, this.dist);
    }
  }

  panBy(wx: number, wz: number): void {
    this.dx += wx;
    this.dz += wz;
    this.clampDesired();
  }

  /** Pan in screen-aligned directions (right, forward) scaled by distance. */
  panScreen(right: number, forward: number): void {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    // yaw 0: forward = -z (north), right = +x.
    this.panBy(right * c + forward * s, right * s - forward * c);
  }

  rotateBy(a: number): void {
    this.dYaw += a;
  }

  /** Multiplicative zoom toward a world point (keeps it roughly under the cursor). */
  zoomAt(factor: number, px?: number, pz?: number): void {
    const nd = clamp(this.dDist * factor, this.minDist, this.maxDist);
    const f = nd / this.dDist;
    if (px !== undefined && pz !== undefined && Number.isFinite(px) && Number.isFinite(pz)) {
      this.dx = px + (this.dx - px) * f;
      this.dz = pz + (this.dz - pz) * f;
    }
    this.dDist = nd;
    this.clampDesired();
  }

  private clampDesired(): void {
    // Allow a little slack past the map edges when zoomed out.
    const m = Math.min(this.dDist * 0.3, 30);
    this.dx = clamp(this.dx, -m, this.worldW + m);
    this.dz = clamp(this.dz, -m * 0.5, this.worldH + m * 0.5);
  }

  update(dt: number): void {
    const k = 1 - Math.exp(-dt * 9);
    const kz = 1 - Math.exp(-dt * 7);
    this.x += (this.dx - this.x) * k;
    this.z += (this.dz - this.z) * k;
    // Zoom in log space for a uniform feel.
    const ld = Math.log(this.dist), ldd = Math.log(this.dDist);
    this.dist = Math.exp(ld + (ldd - ld) * kz);
    this.yaw += (this.dYaw - this.yaw) * k;
    const gy = this.heightAt(this.x, this.z, this.dist);
    const ky = 1 - Math.exp(-dt * 6);
    this.y += (gy - this.y) * (Number.isFinite(this.y) ? ky : 1);
    this.apply();
  }

  apply(): void {
    const p = this.pitchFor(this.dist);
    const cp = Math.cos(p), sp = Math.sin(p);
    const cam = this.camera;
    const ox = -Math.sin(this.yaw) * cp * this.dist;
    const oz = Math.cos(this.yaw) * cp * this.dist;
    let cy = this.y + sp * this.dist;
    const cx = this.x + ox, cz = this.z + oz;
    // Keep above the terrain under the camera.
    const ground = this.heightAt(cx, cz, this.dist);
    const minAbove = ground + this.dist * 0.12;
    if (cy < minAbove) cy = minAbove;
    cam.position.set(cx, cy, cz);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.tmp.set(this.x, this.y, this.z));
    cam.near = Math.max(0.0012, this.dist * 0.02);
    cam.far = this.dist * 30 + 8;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  get pitch(): number {
    return this.pitchFor(this.dist);
  }
}
