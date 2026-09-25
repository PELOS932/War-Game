import * as THREE from 'three';
import type { GameAPI } from '../sim/api';
import type { WorldContext } from './index';
import type { RTSCamera } from './camera';

export class Labels {
  visible = true;
  constructor(ctx: WorldContext, container: HTMLElement) { void ctx; void container; }
  attachGame(game: GameAPI): void { void game; }
  markOwnersDirty(): void {}
  update(camera: THREE.Camera, cam: RTSCamera, canvas: HTMLCanvasElement): void { void camera; void cam; void canvas; }
  dispose(): void {}
}
