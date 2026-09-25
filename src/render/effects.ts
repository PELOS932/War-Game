import * as THREE from 'three';
import type { GameEvent } from '../sim/types';
import type { WorldContext } from './index';

export class Effects {
  readonly group = new THREE.Group();
  constructor(ctx: WorldContext) { void ctx; }
  onEvent(e: GameEvent, camDist: number): void { void e; void camDist; }
  update(dt: number, camera: THREE.Camera, camDist: number): void { void dt; void camera; void camDist; }
}
