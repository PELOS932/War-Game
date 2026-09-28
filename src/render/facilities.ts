import * as THREE from 'three';
import type { GameAPI } from '../sim/api';
import { FacilityType, FACILITY_TYPE_COUNT } from '../sim/types';
import type { RTSCamera } from './camera';
import { clamp, smoothstep } from './constants';
import type { Effects } from './effects';
import type { WorldContext } from './index';
import { patchStandard } from './lighting';
import { box, cone, cyl, extrudeXY, merge, part, prism, sphere } from './models/geom';

/**
 * Facilities (farms, derricks, platforms, mines, power plants, factories,
 * bases…) as small procedural models, instanced per type, scaled with zoom so
 * they stay visible at operational zoom levels. Damaged sites smoke.
 */

const CONC = 0xb9b6ae, DARK = 0x3a3d40, METAL = 0x8a9095, ROOF = 0x6d7175, RED = 0xa83a2a, WHITE = 0xe6e6e2;
const T = { tint: 1 };

function coolingTower(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const r = 0.16 - 0.07 * Math.sin(t * Math.PI * 0.85) + 0.01 * t;
    pts.push(new THREE.Vector2(r, t * 0.55));
  }
  return new THREE.LatheGeometry(pts, 12);
}

function windTurbine(x: number, z: number): THREE.BufferGeometry[] {
  const out = [part(cyl(0.012, 0.02, 0.6, 5), WHITE, { pos: [x, 0, z] }), part(box(0.05, 0.03, 0.03), WHITE, { pos: [x, 0.6, z] })];
  for (let i = 0; i < 3; i++) out.push(part(box(0.012, 0.28, 0.02).translate(0, 0.14, 0), WHITE, { pos: [x + 0.03, 0.615, z], rot: [(i * 2 * Math.PI) / 3, 0, 0] }));
  return out;
}

function hall(w: number, h: number, d: number, x: number, z: number, col = CONC): THREE.BufferGeometry[] {
  return [part(box(w, h, d), col, { pos: [x, 0, z] }), part(box(w * 1.02, 0.015, d * 1.02), ROOF, { pos: [x, h, z] })];
}

function build(t: FacilityType): THREE.BufferGeometry {
  switch (t) {
    case FacilityType.Farm:
      return merge([
        part(box(0.5, 0.01, 0.35), 0x7a8a3a, { pos: [0.15, 0, 0.05] }),
        part(box(0.3, 0.012, 0.35), 0xb09a4a, { pos: [-0.28, 0, 0.05] }),
        part(box(0.3, 0.16, 0.2), 0x9c3b2c, { pos: [0.0, 0, -0.5] }),
        part(prism(0.34, 0.12, 0.22), 0x5a3a2a, { pos: [0.0, 0.16, -0.5], rot: [0, Math.PI / 2, 0] }),
        part(cyl(0.06, 0.06, 0.3, 8), 0xc8c8c0, { pos: [0.25, 0, -0.5] }),
        part(sphere(0.06, 8, 4), 0xa0a4a8, { pos: [0.25, 0.3, -0.5] }),
      ]);
    case FacilityType.Plantation: {
      const trees: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) trees.push(part(sphere(0.07, 6, 4), 0x2f5a22, { pos: [-0.4 + i * 0.22, 0.1, -0.25 + j * 0.22] }));
      return merge([...trees, part(box(0.2, 0.1, 0.14), 0x8a6a4a, { pos: [0.45, 0, 0.3] }), part(box(1.0, 0.008, 0.7), 0x4a4a2a, {})]);
    }
    case FacilityType.LumberMill: {
      const logs: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 5; i++) logs.push(part(cyl(0.035, 0.035, 0.5, 6), 0x7a5a38, { pos: [0.1, 0.035 + (i % 2) * 0.06, -0.3 + i * 0.07], rot: [0, 0, Math.PI / 2] }));
      return merge([...hall(0.5, 0.18, 0.3, -0.25, 0.2, 0x8a7a64), ...logs, part(cyl(0.02, 0.025, 0.35, 6), METAL, { pos: [-0.45, 0, 0.3] })]);
    }
    case FacilityType.OilWell:
      return merge([
        part(box(0.5, 0.04, 0.2), DARK, {}),
        part(extrudeXY([[-0.05, 0], [0.05, 0], [0.02, 0.3], [-0.02, 0.3]], 0.12), METAL, {}),
        part(box(0.6, 0.04, 0.05), 0x2a2a2a, { pos: [0.02, 0.3, 0], rot: [0, 0, 0.2] }),
        part(extrudeXY([[0, -0.08], [0.08, 0.02], [0.02, 0.08]], 0.06), 0x2a2a2a, { pos: [0.3, 0.36, 0] }),
        part(cyl(0.12, 0.12, 0.18, 10), 0xc8c0a8, { pos: [-0.35, 0, 0.3] }),
        part(cyl(0.012, 0.012, 0.5, 4), METAL, { pos: [0.2, 0, -0.3] }),
        part(cone(0.03, 0.08, 6), 0xff8a20, { pos: [0.2, 0.5, -0.3] }),
      ]);
    case FacilityType.OffshorePlatform: {
      const legs: THREE.BufferGeometry[] = [];
      for (const [x, z] of [[-0.25, -0.2], [0.25, -0.2], [-0.25, 0.2], [0.25, 0.2]]) legs.push(part(cyl(0.035, 0.045, 0.3, 6), 0xd0b030, { pos: [x, -0.1, z] }));
      return merge([
        ...legs,
        part(box(0.7, 0.07, 0.55), 0x5a6068, { pos: [0, 0.2, 0] }),
        part(box(0.25, 0.14, 0.2), WHITE, { pos: [-0.18, 0.27, 0.1] }),
        part(cone(0.12, 0.55, 4), 0xc04030, { pos: [0.15, 0.27, -0.08] }),
        part(cyl(0.01, 0.01, 0.35, 4), METAL, { pos: [0.35, 0.27, 0.25], rot: [0, 0, -0.5] }),
        part(cone(0.03, 0.08, 6), 0xff8a20, { pos: [0.52, 0.55, 0.25] }),
        part(cyl(0.07, 0.07, 0.01, 8), 0xe0e040, { pos: [-0.2, 0.42, 0.1] }),
      ]);
    }
    case FacilityType.CoalMine:
      return merge([
        part(cone(0.2, 0.15, 8), 0x3a3836, { pos: [0.25, 0, 0.15] }),
        part(box(0.06, 0.5, 0.06), METAL, { pos: [-0.3, 0, -0.1] }),
        part(box(0.06, 0.5, 0.06), METAL, { pos: [-0.15, 0, -0.1] }),
        part(box(0.2, 0.06, 0.08), METAL, { pos: [-0.22, 0.5, -0.1] }),
        part(cyl(0.05, 0.05, 0.02, 10), DARK, { pos: [-0.22, 0.56, -0.1], rot: [Math.PI / 2, 0, 0] }),
        ...hall(0.3, 0.14, 0.2, -0.2, 0.3, 0x7a6a5a),
      ]);
    case FacilityType.OreMine:
    case FacilityType.UraniumMine: {
      const heap = t === FacilityType.UraniumMine ? 0xc8b040 : 0x8a5a3a;
      return merge([
        part(cyl(0.45, 0.3, 0.04, 12), 0x6a5a4a, { pos: [0.1, -0.03, 0] }),
        part(cone(0.22, 0.2, 8), heap, { pos: [-0.35, 0, 0.3] }),
        part(box(0.5, 0.03, 0.05), METAL, { pos: [-0.2, 0.12, 0.15], rot: [0, 0.6, 0.3] }),
        ...hall(0.25, 0.14, 0.2, -0.35, -0.3, t === FacilityType.UraniumMine ? 0xd0d0c8 : 0x8a7a6a),
        part(box(0.1, 0.06, 0.06), 0xe0b020, { pos: [0.2, 0, 0.1] }),
      ]);
    }
    case FacilityType.PowerPlant:
      return merge([
        ...hall(0.55, 0.22, 0.35, -0.1, 0),
        part(cyl(0.045, 0.06, 0.85, 8), 0xd8d4cc, { pos: [0.3, 0, -0.15] }),
        part(cyl(0.047, 0.047, 0.08, 8), RED, { pos: [0.3, 0.72, -0.15] }),
        part(cyl(0.045, 0.06, 0.7, 8), 0xd8d4cc, { pos: [0.3, 0, 0.15] }),
        part(cyl(0.047, 0.047, 0.08, 8), RED, { pos: [0.3, 0.58, 0.15] }),
        part(cone(0.1, 0.08, 8), 0x3a3836, { pos: [-0.3, 0, 0.35] }),
      ]);
    case FacilityType.NuclearPlant:
      return merge([
        part(coolingTower(), 0xd8d6d0, { pos: [-0.25, 0, -0.18], flat: false }),
        part(coolingTower(), 0xd8d6d0, { pos: [-0.25, 0, 0.2], flat: false }),
        part(cyl(0.13, 0.13, 0.2, 14), 0xc8c6c0, { pos: [0.25, 0, 0] }),
        part(sphere(0.13, 14, 6), 0xc8c6c0, { pos: [0.25, 0.2, 0], scale: [1, 0.8, 1] }),
        ...hall(0.25, 0.14, 0.2, 0.3, 0.3),
      ]);
    case FacilityType.HydroDam:
      return merge([
        part(extrudeXY([[-0.12, 0], [0.12, 0], [0.04, 0.35], [-0.04, 0.35]], 1.0), 0xb0aca4, {}),
        part(box(0.3, 0.02, 1.0), 0x9a968e, { pos: [0, 0.35, 0] }),
        part(box(0.12, 0.12, 0.3), CONC, { pos: [0.22, 0, 0] }),
        part(box(0.2, 0.015, 0.16), 0x7ab0d0, { pos: [0.15, 0.02, 0.3] }),
      ]);
    case FacilityType.RenewablePlant: {
      const panels: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 3; i++) panels.push(part(box(0.5, 0.01, 0.1), 0x1c2e4a, { pos: [0.15, 0.05, -0.3 + i * 0.14], rot: [0.35, 0, 0] }));
      return merge([...panels, ...windTurbine(-0.35, -0.25), ...windTurbine(-0.3, 0.25)]);
    }
    case FacilityType.ConsumerFactory: {
      const teeth: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 4; i++) teeth.push(part(prism(0.16, 0.08, 0.5), ROOF, { pos: [-0.3 + i * 0.16, 0.18, 0], rot: [0, 0, 0] }));
      return merge([part(box(0.66, 0.18, 0.5), 0xbab2a4, {}), ...teeth, part(cyl(0.03, 0.04, 0.4, 6), 0x9a4a3a, { pos: [0.4, 0, 0.2] }), part(box(0.2, 0.08, 0.3), 0x4a6a8a, { tint: 0.4, pos: [0.45, 0, -0.1] })]);
    }
    case FacilityType.IndustrialPlant:
      return merge([
        ...hall(0.5, 0.24, 0.3, -0.15, -0.15, 0x9a9690),
        ...hall(0.3, 0.16, 0.25, 0.3, 0.2, 0xa8a49c),
        part(cyl(0.04, 0.05, 0.75, 8), 0x8a4a3a, { pos: [0.3, 0, -0.25] }),
        part(cyl(0.035, 0.045, 0.6, 8), 0x8a4a3a, { pos: [0.4, 0, -0.1] }),
        part(cyl(0.1, 0.1, 0.16, 10), 0xd0d0c8, { pos: [-0.3, 0, 0.3] }),
        part(cyl(0.1, 0.1, 0.16, 10), 0xd0d0c8, { pos: [-0.08, 0, 0.3] }),
      ]);
    case FacilityType.MilitaryFactory:
      return merge([
        part(new THREE.CylinderGeometry(0.2, 0.2, 0.7, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 0, 0), 0x5a6448, { pos: [-0.1, 0.0, 0] }),
        ...hall(0.3, 0.16, 0.3, 0.35, 0.1, 0x6a7058),
        part(box(0.02, 0.06, 1.1), 0x777777, { pos: [0.6, 0, 0] }),
        part(box(0.06, 0.03, 0.03), 0xffffff, { ...T, pos: [0.35, 0.2, 0.1] }),
      ]);
    case FacilityType.ResearchLab:
      return merge([
        ...hall(0.5, 0.2, 0.3, -0.05, 0.05, 0xdadcd8),
        part(box(0.5, 0.05, 0.3), 0x4a6a8a, { pos: [-0.05, 0.1, 0.05] }),
        part(cyl(0.12, 0.12, 0.12, 12), WHITE, { pos: [0.35, 0, -0.25] }),
        part(sphere(0.12, 12, 6), WHITE, { pos: [0.35, 0.12, -0.25] }),
        part(cyl(0.008, 0.008, 0.4, 4), METAL, { pos: [-0.3, 0.2, -0.2] }),
      ]);
    case FacilityType.Barracks: {
      const b: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 3; i++) b.push(...hall(0.55, 0.1, 0.12, -0.1, -0.3 + i * 0.2, 0x7a7e62));
      return merge([...b, part(box(0.4, 0.008, 0.4), 0x9a9a8a, { pos: [0.1, 0, 0.35] }), part(cyl(0.006, 0.006, 0.4, 4), METAL, { pos: [0.4, 0, 0.35] }), part(box(0.12, 0.07, 0.008), 0xffffff, { ...T, pos: [0.46, 0.33, 0.35] })]);
    }
    case FacilityType.Airbase: {
      const marks: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 8; i++) marks.push(part(box(0.06, 0.004, 0.01), WHITE, { pos: [-0.85 + i * 0.24, 0.012, 0] }));
      return merge([
        part(box(2.0, 0.01, 0.16), 0x3a3c3e, {}),
        ...marks,
        part(box(1.2, 0.008, 0.08), 0x4a4c4e, { pos: [0.1, 0, 0.24] }),
        part(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), 0x707468, { pos: [-0.3, 0, 0.45] }),
        part(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), 0x707468, { pos: [0.05, 0, 0.45] }),
        part(cyl(0.03, 0.04, 0.26, 6), CONC, { pos: [0.45, 0, 0.42] }),
        part(cyl(0.06, 0.05, 0.06, 8), 0x3a6a8a, { pos: [0.45, 0.26, 0.42] }),
      ]);
    }
    case FacilityType.NavalBase:
      return merge([
        part(box(0.8, 0.05, 0.25), CONC, { pos: [0, 0, -0.2] }),
        part(box(0.08, 0.04, 0.7), CONC, { pos: [-0.25, 0, 0.25] }),
        part(box(0.08, 0.04, 0.7), CONC, { pos: [0.15, 0, 0.25] }),
        part(box(0.02, 0.4, 0.02), 0xd0a020, { pos: [0.3, 0, -0.25] }),
        part(box(0.3, 0.02, 0.02), 0xd0a020, { pos: [0.3, 0.4, -0.18], rot: [0, 0.5, 0] }),
        ...hall(0.3, 0.12, 0.15, -0.2, -0.25, 0x8a8e92),
      ]);
    case FacilityType.MissileSilo:
      return merge([
        part(cyl(0.3, 0.32, 0.03, 12), CONC, {}),
        part(cyl(0.1, 0.1, 0.02, 12), 0x4a4e48, { pos: [0, 0.03, 0] }),
        part(box(0.2, 0.012, 0.02), 0xd0b020, { pos: [0, 0.045, 0] }),
        part(box(0.7, 0.05, 0.01), 0x777777, { pos: [0, 0, 0.35] }),
        part(box(0.7, 0.05, 0.01), 0x777777, { pos: [0, 0, -0.35] }),
        part(box(0.12, 0.08, 0.1), 0x6a7058, { pos: [0.3, 0, 0.2] }),
      ]);
    case FacilityType.SupplyDepot: {
      const c: THREE.BufferGeometry[] = [];
      const cols = [0x6a7a4a, 0x7a6a4a, 0x5a6a5a];
      for (let i = 0; i < 6; i++) c.push(part(box(0.14, 0.07, 0.06), cols[i % 3], { pos: [-0.2 + (i % 3) * 0.16, (i > 2 ? 0.07 : 0), 0.3] }));
      return merge([...hall(0.6, 0.14, 0.26, 0, -0.15, 0x8a8a7a), ...c]);
    }
    case FacilityType.RadarStation:
      return merge([
        part(cyl(0.05, 0.08, 0.35, 6), CONC, {}),
        part(sphere(0.16, 12, 8), WHITE, { pos: [0, 0.45, 0] }),
        part(cyl(0.02, 0.02, 0.2, 4), METAL, { pos: [0.3, 0, 0.1] }),
        part(cyl(0.12, 0.02, 0.05, 10, ), 0xd8d8d8, { pos: [0.3, 0.22, 0.1], rot: [0.9, 0, 0] }),
        ...hall(0.2, 0.08, 0.14, -0.3, 0.2),
      ]);
  }
  return merge([part(box(0.4, 0.2, 0.4), CONC, {})]);
}

export class Facilities {
  readonly group = new THREE.Group();
  private ctx: WorldContext;
  private game: GameAPI | null = null;
  private meshes: THREE.InstancedMesh[] = [];
  private caps: number[] = [];
  private mat: THREE.MeshStandardMaterial;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private col = new THREE.Color();
  private up = new THREE.Vector3(0, 1, 0);
  private smokeTimer = 0;
  private yCache = new Map<number, number>();
  private lastD = -1;

  constructor(ctx: WorldContext) {
    this.ctx = ctx;
    this.group.name = 'facilities';
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.15 });
    patchStandard(this.mat, ctx.shared, {
      key: 'facilities',
      tintAttribute: true,
      uniforms: { uFacGlow: { value: 0.12 } },
      fragDecl: 'uniform float uFacGlow;',
      afterLights: 'totalEmissiveRadiance += diffuseColor.rgb * uFacGlow;',
    });
    for (let t = 0; t < FACILITY_TYPE_COUNT; t++) {
      const m = new THREE.InstancedMesh(build(t as FacilityType), this.mat, 64);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(64 * 3), 3);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      this.meshes.push(m);
      this.caps.push(64);
      this.group.add(m);
    }
  }

  attachGame(game: GameAPI): void {
    this.game = game;
    this.yCache.clear();
  }

  private ensure(t: number, n: number): void {
    if (n <= this.caps[t]) return;
    let c = this.caps[t];
    while (c < n) c *= 2;
    const old = this.meshes[t];
    const m = new THREE.InstancedMesh(old.geometry, this.mat, c);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(c * 3), 3);
    m.frustumCulled = false;
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.remove(old);
    old.dispose();
    this.group.add(m);
    this.meshes[t] = m;
    this.caps[t] = c;
  }

  update(dt: number, cam: RTSCamera, camera: THREE.PerspectiveCamera, fx: Effects | null): void {
    const g = this.game;
    const d = cam.dist;
    this.group.visible = !!g && d < 45;
    if (!g || d >= 45) return;
    const hf = this.ctx.hf;
    const size = clamp(0.019 * d, 0.028, 0.7);
    const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const sph = new THREE.Sphere();
    const counts = new Array(FACILITY_TYPE_COUNT).fill(0);
    const byType: number[][] = Array.from({ length: FACILITY_TYPE_COUNT }, () => []);
    const st = g.state;
    const player = st.playerNation;
    if (Math.abs(d - this.lastD) / Math.max(d, 1e-3) > 0.2) { this.yCache.clear(); this.lastD = d; }
    this.smokeTimer += dt;
    const emitSmoke = this.smokeTimer > 0.25;
    if (emitSmoke) this.smokeTimer = 0;
    for (const f of st.facilities.values()) {
      if (player >= 0 && f.nation !== player && !g.isVisible(player, f.hex)) continue;
      let y = this.yCache.get(f.id);
      if (y === undefined) {
        const sp = Math.max(0.004, d * 0.004);
        y = f.type === FacilityType.OffshorePlatform ? 0 : Math.max(hf.heightAt(f.x, f.z, sp), hf.waterAt(f.x, f.z));
        this.yCache.set(f.id, y);
      }
      sph.center.set(f.x, y, f.z);
      sph.radius = size * 1.5;
      if (!fr.intersectsSphere(sph)) continue;
      byType[f.type].push(f.id);
      if (emitSmoke && fx && f.damage > 0.15) fx.smoke(f.x, y + size * 0.3, f.z, size * (0.5 + f.damage), f.damage);
    }
    for (let t = 0; t < FACILITY_TYPE_COUNT; t++) {
      const ids = byType[t];
      this.ensure(t, ids.length + 1);
      const m = this.meshes[t];
      const M = m.instanceMatrix.array as Float32Array;
      const C = m.instanceColor!.array as Float32Array;
      for (const id of ids) {
        const f = st.facilities.get(id)!;
        const y = this.yCache.get(id)!;
        const building = f.constructionDaysLeft > 0;
        const k = counts[t];
        const lvl = 1 + Math.min(4, f.level - 1) * 0.12;
        const sc = size * lvl * (building ? 0.75 : 1);
        this.q.setFromAxisAngle(this.up, ((id * 2654435761) % 628) / 100);
        this.m4.compose(this.v.set(f.x, y, f.z), this.q, this.s.set(sc, sc * (building ? 0.5 : 1), sc));
        this.m4.toArray(M, k * 16);
        const nc = st.nations[f.nation]?.color ?? [180, 180, 180];
        this.col.setRGB(nc[0] / 255, nc[1] / 255, nc[2] / 255, THREE.SRGBColorSpace);
        const dmg = clamp(f.damage, 0, 1);
        const dark = building ? 0.6 : 1 - dmg * 0.6;
        C[k * 3] = this.col.r * dark; C[k * 3 + 1] = this.col.g * dark; C[k * 3 + 2] = this.col.b * dark;
        counts[t]++;
      }
      m.count = counts[t];
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor!.needsUpdate = true;
    }
    void smoothstep;
  }
}
