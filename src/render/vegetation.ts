import * as THREE from 'three';
import { Biome } from '../worldgen/types';
import type { RTSCamera } from './camera';
import { LEAF_SPACING, TILE_SIZE, smoothstep } from './constants';
import type { WorldContext } from './index';
import type { CityInfo } from './landuse';
import { patchStandard } from './lighting';
import { merge, part } from './models/geom';
import { cityDensity, hashI, mulberry, toGrid } from './procedural';
import { BLOCK_SIZE } from './constants';

/**
 * Instanced trees near the camera: per-tile generation from forest density,
 * biome and climate, cached with a time budget. Types: conifer, broadleaf,
 * palm, acacia, shrub, birch. Seasonal tints (autumn / bare winter) for
 * deciduous trees in temperate zones.
 */

const T_CONIFER = 0, T_BROAD = 1, T_PALM = 2, T_ACACIA = 3, T_SHRUB = 4, T_BIRCH = 5;
const NTYPES = 6;
const STRIDE = 8; // x y z scale rot r g b
const MAX_DIST = 3.2;

const TRUNK = 0x4a3526;

// Open-ended low-poly primitives (no hidden caps) to keep forests cheap.
const trunkG = (r0: number, r1: number, h: number) => new THREE.CylinderGeometry(r1, r0, h, 4, 1, true).translate(0, h / 2, 0);
const coneG = (r: number, h: number, seg = 6) => new THREE.ConeGeometry(r, h, seg, 1, true).translate(0, h / 2, 0);
const blobG = (r: number) => new THREE.IcosahedronGeometry(r, 0);

function conifer(): THREE.BufferGeometry {
  return merge([
    part(trunkG(0.05, 0.035, 0.3), TRUNK, {}),
    part(coneG(0.3, 0.52), 0xffffff, { tint: 1, pos: [0, 0.18, 0] }),
    part(coneG(0.2, 0.45, 5), 0xffffff, { tint: 1, pos: [0, 0.5, 0], rot: [0, 0.5, 0] }),
  ]);
}

function broadleaf(): THREE.BufferGeometry {
  return merge([
    part(trunkG(0.06, 0.04, 0.42), TRUNK, {}),
    part(blobG(0.32), 0xffffff, { tint: 1, pos: [0, 0.62, 0], scale: [1, 0.82, 1] }),
  ]);
}

function birch(): THREE.BufferGeometry {
  return merge([
    part(trunkG(0.04, 0.03, 0.55), 0xd8d4c8, {}),
    part(blobG(0.2), 0xffffff, { tint: 1, pos: [0, 0.72, 0], scale: [0.8, 1.3, 0.8] }),
  ]);
}

function palm(): THREE.BufferGeometry {
  const fronds: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    fronds.push(part(new THREE.PlaneGeometry(0.42, 0.1).rotateX(-Math.PI / 2).translate(0.21, 0, 0), 0xffffff, {
      tint: 1, pos: [0.06, 0.86, 0], rot: [0, a, -0.35],
    }));
  }
  return merge([
    part(trunkG(0.04, 0.025, 0.88), 0x7a6248, { rot: [0, 0, 0.07] }),
    ...fronds,
  ]);
}

function acacia(): THREE.BufferGeometry {
  return merge([
    part(trunkG(0.04, 0.025, 0.52), TRUNK, { rot: [0, 0, 0.1] }),
    part(new THREE.CylinderGeometry(0.42, 0.3, 0.12, 7, 1, false).translate(0, 0.06, 0), 0xffffff, { tint: 1, pos: [0.04, 0.5, 0] }),
  ]);
}

function shrub(): THREE.BufferGeometry {
  return merge([
    part(blobG(0.26), 0xffffff, { tint: 1, pos: [0, 0.16, 0], scale: [1, 0.7, 1] }),
  ]);
}

const FOLIAGE: Record<number, [number, number, number][]> = {
  [T_CONIFER]: [[0.05, 0.1, 0.05], [0.06, 0.12, 0.06], [0.04, 0.09, 0.05]],
  [T_BROAD]: [[0.08, 0.17, 0.04], [0.1, 0.2, 0.05], [0.07, 0.15, 0.035], [0.11, 0.19, 0.06]],
  [T_PALM]: [[0.12, 0.22, 0.05], [0.1, 0.2, 0.04]],
  [T_ACACIA]: [[0.14, 0.18, 0.06], [0.12, 0.17, 0.05]],
  [T_SHRUB]: [[0.13, 0.15, 0.07], [0.1, 0.14, 0.06], [0.15, 0.16, 0.08]],
  [T_BIRCH]: [[0.13, 0.22, 0.06], [0.15, 0.24, 0.07]],
};
const AUTUMN: [number, number, number][] = [[0.42, 0.16, 0.02], [0.5, 0.3, 0.03], [0.35, 0.08, 0.02], [0.45, 0.38, 0.06]];

interface Tile {
  key: number;
  data: Float32Array[];
  counts: number[];
  used: number;
  season: number;
}

export class Vegetation {
  readonly group = new THREE.Group();
  private ctx: WorldContext;
  private meshes: THREE.InstancedMesh[] = [];
  private caps: number[] = [];
  private mat: THREE.MeshStandardMaterial;
  private uVeg = { value: new THREE.Vector3(0, 0, 1) };
  private tiles = new Map<number, Tile>();
  private frame = 0;
  private lastKey = '';
  private cityIndex = new Map<number, CityInfo[]>();
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(ctx: WorldContext) {
    this.ctx = ctx;
    this.group.name = 'vegetation';
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
    patchStandard(this.mat, ctx.shared, {
      key: 'trees',
      tintAttribute: true,
      uniforms: { uVeg: this.uVeg },
      vertDecl: 'uniform vec3 uVeg; uniform float uTime;',
      afterBegin: /* glsl */ `
{
#ifdef USE_INSTANCING
  vec3 _base = instanceMatrix[3].xyz;
  float _fd = distance(_base.xz, uVeg.xy);
  transformed *= smoothstep(uVeg.z, uVeg.z * 0.8, _fd);
  float _sw = sin(uTime * 1.6 + _base.x * 53.0 + _base.z * 41.0) * 0.035 * max(position.y - 0.25, 0.0);
  transformed.x += _sw;
  transformed.z += _sw * 0.6;
#endif
}`,
    });
    const geos = [conifer(), broadleaf(), palm(), acacia(), shrub(), birch()];
    for (let t = 0; t < NTYPES; t++) {
      const cap = 4096;
      const m = new THREE.InstancedMesh(geos[t], this.mat, cap);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      this.meshes.push(m);
      this.caps.push(cap);
      this.group.add(m);
    }
    for (const c of ctx.cities) {
      const ext = c.r * 1.6;
      for (let tz = Math.floor((c.z - ext) / TILE_SIZE); tz <= Math.floor((c.z + ext) / TILE_SIZE); tz++) {
        for (let tx = Math.floor((c.x - ext) / TILE_SIZE); tx <= Math.floor((c.x + ext) / TILE_SIZE); tx++) {
          const k = tx * 100000 + tz;
          let l = this.cityIndex.get(k);
          if (!l) this.cityIndex.set(k, (l = []));
          l.push(c);
        }
      }
    }
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

  private genTile(tx: number, tz: number, season: number, dayOfYear: number): Tile {
    const { world, hf, landuse } = this.ctx;
    const key = tx * 100000 + tz;
    const x0 = tx * TILE_SIZE, z0 = tz * TILE_SIZE;
    const rand = mulberry(hashI(tx, tz, 991) * 4294967296);
    const per: number[][] = Array.from({ length: NTYPES }, () => []);
    const sp = 0.0105;
    const n = Math.ceil(TILE_SIZE / sp);
    const cities = this.cityIndex.get(key) ?? [];
    const lat = world.settings.latNorth - (z0 / this.ctx.worldH) * (world.settings.latNorth - world.settings.latSouth);
    const hemi = lat >= 0 ? 0 : 182.6;
    const doyL = (dayOfYear + hemi) % 365.25;
    const autumn = Math.exp(-Math.pow((doyL - 290) / 22, 2));
    const winter = doyL > 320 || doyL < 80 ? 1 : 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = x0 + (i + rand()) * sp, z = z0 + (j + rand()) * sp;
        const k = hf.cellIndex(x, z);
        if (k < 0) continue;
        const b = world.biome[k];
        if (b === Biome.Ocean || b === Biome.Lake || b === Biome.Ice) continue;
        const forest = hf.bilinearU8(world.albedo, 4, 3, x, z) / 255;
        let p = Math.pow(forest, 0.85) * 0.95;
        // Scattered trees in open country.
        switch (b) {
          case Biome.Savanna: p += 0.06; break;
          case Biome.Grassland: p += 0.025; break;
          case Biome.Mediterranean: p += 0.06; break;
          case Biome.Tundra: p += 0.03; break;
          case Biome.TropicalDryForest: p += 0.05; break;
          case Biome.Wetland: p += 0.08; break;
          case Biome.HotDesert: p += hf.riverAt(x, z) > 0.3 ? 0.15 : 0.002; break;
          case Biome.ColdDesert: p += 0.004; break;
          default: p += 0.02;
        }
        const farm = hf.bilinear(landuse.farm, x, z);
        p *= 1 - farm * 0.8;
        const urb = hf.bilinear(landuse.urban, x, z);
        if (urb > 0.05 && cities.length) {
          // Street trees only in parks.
          let best = 0, bc: CityInfo | null = null;
          for (const c of cities) { const d = cityDensity(x, z, c.x, c.z, c.r, c.seed); if (d > best) { best = d; bc = c; } }
          if (bc && best > 0.05) {
            const [gu, gv] = toGrid(x, z, bc.x, bc.z, bc.angle);
            const bu = Math.floor(gu / BLOCK_SIZE), bv = Math.floor(gv / BLOCK_SIZE);
            const park = hashI(bu, bv, bc.seed + 202) < 0.07 + 0.1 * (1 - best);
            p = park ? 0.55 : p * (1 - smoothstep(0.02, 0.2, best));
          }
        }
        if (rand() > p) continue;
        const e = hf.elev[k];
        const tAnn = world.climateTex[k * 4] / 3.2 - 40;
        if (tAnn < -7 || e < 0.5) continue;
        if (hf.waterAt(x, z) > -Infinity || hf.riverAt(x, z) > 0.72) continue;
        const y = hf.heightAt(x, z, LEAF_SPACING);
        // Species by biome.
        const r = rand();
        let t: number;
        switch (b) {
          case Biome.Taiga: t = r < 0.85 ? T_CONIFER : T_BIRCH; break;
          case Biome.TemperateForest: t = tAnn < 6 ? (r < 0.55 ? T_CONIFER : r < 0.75 ? T_BIRCH : T_BROAD) : (r < 0.72 ? T_BROAD : r < 0.85 ? T_BIRCH : T_CONIFER); break;
          case Biome.TemperateRainforest: t = r < 0.8 ? T_CONIFER : T_BROAD; break;
          case Biome.Mediterranean: t = r < 0.45 ? T_BROAD : r < 0.85 ? T_SHRUB : T_CONIFER; break;
          case Biome.Grassland: t = r < 0.5 ? T_BROAD : T_SHRUB; break;
          case Biome.Savanna: t = r < 0.7 ? T_ACACIA : T_SHRUB; break;
          case Biome.TropicalDryForest: t = r < 0.6 ? T_BROAD : r < 0.85 ? T_ACACIA : T_PALM; break;
          case Biome.TropicalRainforest: t = r < 0.88 ? T_BROAD : T_PALM; break;
          case Biome.Wetland: t = r < 0.5 ? T_BROAD : T_SHRUB; break;
          case Biome.Tundra: t = r < 0.85 ? T_SHRUB : T_CONIFER; break;
          case Biome.Alpine: t = r < 0.7 ? T_CONIFER : T_SHRUB; break;
          case Biome.HotDesert: t = r < 0.7 ? T_PALM : T_SHRUB; break;
          default: t = T_SHRUB;
        }
        if (tAnn > 20 && e < 30 && hf.bilinearU8(hf.ocean, 1, 0, x, z) > 0.05) t = T_PALM;
        // Size: tropical giants, stunted near the treeline.
        let s = 0.011 + rand() * 0.005;
        if (b === Biome.TropicalRainforest) s *= 1.25;
        if (t === T_SHRUB) s *= 0.55;
        s *= 0.55 + 0.45 * smoothstep(-6, 2, tAnn);
        // Colour.
        const pal = FOLIAGE[t];
        let c = pal[Math.floor(rand() * pal.length)];
        const decid = (t === T_BROAD || t === T_BIRCH) && tAnn > 1 && tAnn < 18 && Math.abs(lat) > 24;
        if (decid && autumn > 0.2 && rand() < autumn) c = AUTUMN[Math.floor(rand() * AUTUMN.length)];
        else if (decid && winter) c = [0.09, 0.075, 0.06];
        const v = 0.85 + rand() * 0.3;
        per[t].push(x, y - s * 0.05, z, s, rand() * Math.PI * 2, c[0] * v, c[1] * v, c[2] * v);
      }
    }
    const data = per.map((a) => Float32Array.from(a));
    return { key, data, counts: data.map((d) => d.length / STRIDE), used: this.frame, season };
  }

  /** Returns true when all wanted tiles are built. */
  update(camera: THREE.Camera, cam: RTSCamera, density: number, dayOfYear: number, budgetMs: number): boolean {
    void camera;
    this.frame++;
    const d = cam.dist;
    if (d > MAX_DIST) {
      this.group.visible = false;
      return true;
    }
    this.group.visible = true;
    const castShadow = d < 1.3;
    for (const m of this.meshes) m.castShadow = castShadow;
    const R = Math.min(3.4, d * 1.35 + 0.55);
    this.uVeg.value.set(cam.x, cam.z, R);
    const season = Math.floor(dayOfYear / 15);
    const cx = cam.x, cz = cam.z;
    const want: { key: number; tx: number; tz: number; dist: number }[] = [];
    for (let tz = Math.floor((cz - R) / TILE_SIZE); tz <= Math.floor((cz + R) / TILE_SIZE); tz++) {
      for (let tx = Math.floor((cx - R) / TILE_SIZE); tx <= Math.floor((cx + R) / TILE_SIZE); tx++) {
        const dx = Math.max(tx * TILE_SIZE - cx, 0, cx - (tx + 1) * TILE_SIZE);
        const dz = Math.max(tz * TILE_SIZE - cz, 0, cz - (tz + 1) * TILE_SIZE);
        const dist = Math.hypot(dx, dz);
        if (dist <= R) want.push({ key: tx * 100000 + tz, tx, tz, dist });
      }
    }
    want.sort((a, b) => a.dist - b.dist);
    const t0 = performance.now();
    let missing = 0;
    for (const w of want) {
      const t = this.tiles.get(w.key);
      if (t && t.season === season) continue;
      if (performance.now() - t0 > budgetMs) { missing++; continue; }
      this.tiles.set(w.key, this.genTile(w.tx, w.tz, season, dayOfYear));
    }
    const ready = want.filter((w) => this.tiles.get(w.key)?.season === season);
    for (const w of ready) this.tiles.get(w.key)!.used = this.frame;
    const setKey = ready.map((w) => w.key).join(',') + '|' + density;
    if (setKey !== this.lastKey) {
      this.lastKey = setKey;
      this.rebuild(ready.map((w) => ({ t: this.tiles.get(w.key)!, dist: w.dist })), density);
    }
    if (this.tiles.size > 400) {
      const old = [...this.tiles.values()].sort((a, b) => a.used - b.used);
      for (let i = 0; i < old.length - 300; i++) this.tiles.delete(old[i].key);
    }
    return missing === 0;
  }

  private rebuild(tiles: { t: Tile; dist: number }[], density: number): void {
    const budget = Math.round(70000 * density);
    const v = new THREE.Vector3(), sc = new THREE.Vector3();
    const counts = new Array(NTYPES).fill(0);
    // Thin distant tiles (keep 1 in k) but enlarge the survivors.
    let total = 0;
    for (const { t } of tiles) for (let k = 0; k < NTYPES; k++) total += t.counts[k];
    for (let k = 0; k < NTYPES; k++) {
      let n = 0;
      for (const { t } of tiles) n += t.counts[k];
      this.ensure(k, Math.min(n, budget) + 1);
    }
    let used = 0;
    for (const { t, dist } of tiles) {
      const keepEvery = dist < 0.7 ? 1 : dist < 1.5 ? 2 : dist < 2.5 ? 4 : 6;
      const grow = keepEvery === 1 ? 1 : keepEvery === 2 ? 1.3 : keepEvery === 4 ? 1.65 : 1.95;
      for (let k = 0; k < NTYPES; k++) {
        const d = t.data[k];
        const m = this.meshes[k];
        const M = m.instanceMatrix.array as Float32Array;
        const C = m.instanceColor!.array as Float32Array;
        for (let i = 0; i < t.counts[k]; i += keepEvery) {
          if (used >= budget || counts[k] >= this.caps[k]) break;
          const o = i * STRIDE;
          const s = d[o + 3] * grow;
          this.q.setFromAxisAngle(this.up, d[o + 4]);
          this.m4.compose(v.set(d[o], d[o + 1], d[o + 2]), this.q, sc.set(s, s * (0.9 + (i % 5) * 0.05), s));
          this.m4.toArray(M, counts[k] * 16);
          C[counts[k] * 3] = d[o + 5]; C[counts[k] * 3 + 1] = d[o + 6]; C[counts[k] * 3 + 2] = d[o + 7];
          counts[k]++;
          used++;
        }
      }
    }
    for (let k = 0; k < NTYPES; k++) {
      const m = this.meshes[k];
      m.count = counts[k];
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor!.needsUpdate = true;
    }
    void total;
  }
}
