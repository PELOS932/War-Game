import * as THREE from 'three';
import type { WorldContext } from './index';
import type { RTSCamera } from './camera';

export class Vegetation {
  readonly group = new THREE.Group();
  constructor(ctx: WorldContext) { void ctx; }
  update(camera: THREE.Camera, cam: RTSCamera, density: number, dayOfYear: number, budgetMs: number): boolean { void camera; void cam; void density; void dayOfYear; void budgetMs; return true; }
}
