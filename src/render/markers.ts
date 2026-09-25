import * as THREE from 'three';
import type { WorldContext } from './index';
import type { RTSCamera } from './camera';

export class Markers {
  readonly group = new THREE.Group();
  constructor(ctx: WorldContext) { void ctx; }
  showPath(hexes: number[], hostile: boolean): void { void hexes; void hostile; }
  ping(hex: number, color: string): void { void hex; void color; }
  update(dt: number, cam: RTSCamera, camera: THREE.Camera): void { void dt; void cam; void camera; }
}
