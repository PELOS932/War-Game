import * as THREE from 'three';
import type { WorldContext } from './index';
import type { RTSCamera } from './camera';
import { hash2 } from '../core/rng';
import { HEIGHT_SPACING } from '../worldgen/types';

/** Instanced forests (conifers in cold climates, broadleaf elsewhere), shown when zoomed in. */
export class Vegetation {
  readonly group = new THREE.Group();
  constructor(ctx: WorldContext) {
    const { world, hf } = ctx;
    const pine: number[] = [], leaf: number[] = [];
    const stride = 3;
    for (let j = 0; j < world.hh; j += stride) {
      for (let i = 0; i < world.hw; i += stride) {
        const k = j * world.hw + i;
        const f = world.albedo[k * 4 + 3] / 255;
        if (f < 0.35 || world.elevation[k] <= 0 || world.waterLevel[k] > -1e8 || world.climateTex[k * 4 + 3] > 200) continue;
        for (let t = 0; t < 2; t++) {
          if (hash2(i + t * 7, j, 3) > f) continue;
          const x = (i + hash2(i, j, t + 5) * stride) * HEIGHT_SPACING, z = (j + hash2(j, i, t + 9) * stride) * HEIGHT_SPACING;
          const temp = world.climateTex[k * 4] / 3.2 - 40;
          (temp < 8 ? pine : leaf).push(x, hf.heightAt(x, z), z, 0.7 + hash2(i, j, t) * 0.6);
        }
      }
    }
    const make = (data: number[], geo: THREE.BufferGeometry, color: number) => {
      const n = data.length / 4;
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.9 }), n);
      const m = new THREE.Matrix4();
      for (let i = 0; i < n; i++) {
        const s = data[i * 4 + 3];
        m.makeScale(s, s, s).setPosition(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
        mesh.setMatrixAt(i, m);
      }
      mesh.frustumCulled = false;
      this.group.add(mesh);
    };
    const cone = new THREE.ConeGeometry(0.03, 0.12, 6); cone.translate(0, 0.06, 0);
    const blob = new THREE.IcosahedronGeometry(0.045, 0); blob.translate(0, 0.06, 0);
    make(pine, cone, 0x24422a);
    make(leaf, blob, 0x3d6a2e);
  }
  update(camera: THREE.Camera, cam: RTSCamera, density: number, dayOfYear: number, budgetMs: number): boolean {
    void cam; void density; void dayOfYear; void budgetMs;
    this.group.visible = camera.position.y < 45;
    return true;
  }
}
