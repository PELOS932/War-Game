import * as THREE from 'three';
import type { GameAPI } from '../../sim/api';
import type { WorldContext } from '../index';
import type { RTSCamera } from '../camera';
import type { Effects } from '../effects';

export class Units {
  readonly group = new THREE.Group();
  visible = true;
  constructor(ctx: WorldContext, canvas: HTMLCanvasElement) { void ctx; void canvas; }
  attachGame(game: GameAPI): void { void game; }
  update(dt: number, cam: RTSCamera, camera: THREE.Camera, fx: Effects | null): void { void dt; void cam; void camera; void fx; }
  onDestroyed(id: number): void { void id; }
  setSelected(ids: number[]): void { void ids; }
  pick(x: number, y: number, camera: THREE.Camera, w: number, h: number): number { void x; void y; void camera; void w; void h; return -1; }
  inRect(x0: number, y0: number, x1: number, y1: number, nation: number, camera: THREE.Camera, w: number, h: number): number[] { void x0; void y0; void x1; void y1; void nation; void camera; void w; void h; return []; }
}
