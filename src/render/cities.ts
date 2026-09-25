import * as THREE from 'three';
import type { GameAPI } from '../sim/api';
import type { WorldContext } from './index';
import type { RTSCamera } from './camera';
import { RNG } from '../core/rng';

/** Instanced procedural skylines for every city, shown when zoomed in. */
export class Cities {
  readonly group = new THREE.Group();
  constructor(ctx: WorldContext) {
    const boxes: { x: number; y: number; z: number; w: number; h: number; rot: number; c: THREE.Color }[] = [];
    const palette = [0x9aa3ad, 0xb8b2a6, 0x8a8f96, 0xc9c2b4, 0x6f7f95, 0xa89880];
    for (const c of ctx.cities) {
      const rng = new RNG(c.seed || c.id + 1);
      const n = Math.round(Math.min(260, Math.max(18, c.pop / 35)));
      const radius = 0.18 + Math.sqrt(c.pop) * 0.009;
      for (let i = 0; i < n; i++) {
        const d = Math.pow(rng.next(), 0.8) * radius;
        const a = rng.range(0, Math.PI * 2);
        const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
        if (ctx.hf.isWater(x, z)) continue;
        const core = 1 - d / radius;
        const tall = core * core * Math.min(1, c.pop / 3000);
        const h = 0.02 + rng.next() * 0.03 + tall * rng.range(0.05, 0.28);
        boxes.push({ x, z, y: ctx.hf.heightAt(x, z), w: rng.range(0.015, 0.035), h, rot: c.angle, c: new THREE.Color(rng.pick(palette)) });
      }
    }
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.2 });
    const mesh = new THREE.InstancedMesh(geo, mat, boxes.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    boxes.forEach((b, i) => {
      q.setFromAxisAngle(up, b.rot);
      m.compose(p.set(b.x, b.y - 0.005, b.z), q, s.set(b.w, b.h, b.w));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, b.c);
    });
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }
  attachGame(game: GameAPI): void { void game; }
  update(camera: THREE.Camera, cam: RTSCamera, budgetMs: number): boolean {
    void cam; void budgetMs;
    this.group.visible = camera.position.y < 90;
    return true;
  }
}
