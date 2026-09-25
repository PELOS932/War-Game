import * as THREE from 'three';
import type { GameAPI } from '../sim/api';
import type { WorldContext } from './index';
import type { RTSCamera } from './camera';

export class Cities {
  readonly group = new THREE.Group();
  constructor(ctx: WorldContext) { void ctx; }
  attachGame(game: GameAPI): void { void game; }
  update(camera: THREE.Camera, cam: RTSCamera, budgetMs: number): boolean { void camera; void cam; void budgetMs; return true; }
}
