import * as THREE from 'three';
import type { GameAPI } from '../sim/api';
import type { WorldContext } from './index';
import type { RTSCamera } from './camera';
import type { Effects } from './effects';

export class Facilities {
  readonly group = new THREE.Group();
  constructor(ctx: WorldContext) { void ctx; }
  attachGame(game: GameAPI): void { void game; }
  update(dt: number, cam: RTSCamera, camera: THREE.Camera, fx: Effects | null): void { void dt; void cam; void camera; void fx; }
}
