import * as THREE from 'three';
import { HEIGHT_SPACING } from '../../worldgen/types';
import { CHUNK_RES, MAX_LOD, ROOT_CHUNK, Y_SCALE } from '../constants';
import type { HeightField } from '../heightfield';

const N = CHUNK_RES;
const GRID_VERTS = (N + 1) * (N + 1);
const SKIRT_VERTS = 4 * (N + 1);
const DETAIL_MARGIN = 700 * Y_SCALE;

class ChunkNode {
  level: number;
  x0: number;
  z0: number;
  size: number;
  children: ChunkNode[] | null = null;
  mesh: THREE.Mesh | null = null;
  queued = false;
  minY: number;
  maxY: number;
  lastUsed = 0;
  priority = 0;

  constructor(level: number, x0: number, z0: number, size: number, minY: number, maxY: number) {
    this.level = level;
    this.x0 = x0;
    this.z0 = z0;
    this.size = size;
    this.minY = minY;
    this.maxY = maxY;
  }
}

export interface TerrainStats {
  drawn: number;
  cached: number;
  queued: number;
  built: number;
}

/**
 * Quadtree terrain: square chunks of CHUNK_RES² quads (+ skirts), split by
 * camera distance, meshes built lazily on the CPU from the HeightField within
 * a per-frame time budget. Vertex positions are chunk-local for precision.
 */
export class TerrainChunks {
  readonly group = new THREE.Group();
  private hf: HeightField;
  private material: THREE.Material;
  private roots: ChunkNode[] = [];
  private index: THREE.BufferAttribute;
  private frame = 0;
  private queue: ChunkNode[] = [];
  private cached = 0;
  private frustum = new THREE.Frustum();
  private projScreen = new THREE.Matrix4();
  private box = new THREE.Box3();
  private camPos = new THREE.Vector3();
  splitFactor = 2.4;
  maxCached = 1400;
  stats: TerrainStats = { drawn: 0, cached: 0, queued: 0, built: 0 };
  private drawList: ChunkNode[] = [];
  private heights = new Float32Array((N + 3) * (N + 3));

  constructor(hf: HeightField, material: THREE.Material) {
    this.hf = hf;
    this.material = material;
    this.group.name = 'terrain';
    this.index = buildIndex();
    const nx = Math.ceil(hf.worldW / ROOT_CHUNK), nz = Math.ceil(hf.worldH / ROOT_CHUNK);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x0 = i * ROOT_CHUNK, z0 = j * ROOT_CHUNK;
        const [mn, mx] = this.rangeY(x0, z0, ROOT_CHUNK);
        this.roots.push(new ChunkNode(0, x0, z0, ROOT_CHUNK, mn, mx));
      }
    }
  }

  setMaterial(m: THREE.Material): void {
    this.material = m;
    this.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = m; });
  }

  /** Build every root chunk now (so something is always drawable). */
  buildRoots(progress?: (f: number) => void): void {
    this.roots.forEach((r, i) => {
      this.build(r);
      progress?.((i + 1) / this.roots.length);
    });
  }

  private rangeY(x0: number, z0: number, size: number): [number, number] {
    const hf = this.hf;
    const i0 = Math.max(0, Math.floor(x0 / HEIGHT_SPACING) - 1), i1 = Math.min(hf.w - 1, Math.ceil((x0 + size) / HEIGHT_SPACING) + 1);
    const j0 = Math.max(0, Math.floor(z0 / HEIGHT_SPACING) - 1), j1 = Math.min(hf.h - 1, Math.ceil((z0 + size) / HEIGHT_SPACING) + 1);
    let mn = Infinity, mx = -Infinity;
    const step = Math.max(1, Math.floor((i1 - i0) / 48));
    for (let j = j0; j <= j1; j += step) {
      for (let i = i0; i <= i1; i += step) {
        const e = hf.elev[j * hf.w + i];
        if (e < mn) mn = e;
        if (e > mx) mx = e;
      }
    }
    if (!Number.isFinite(mn)) { mn = 0; mx = 0; }
    return [Math.min(mn * Y_SCALE, 0) - DETAIL_MARGIN * 0.3, Math.max(mx * Y_SCALE, 0) + DETAIL_MARGIN];
  }

  private split(node: ChunkNode): void {
    const h = node.size / 2;
    node.children = [];
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < 2; i++) {
        const x0 = node.x0 + i * h, z0 = node.z0 + j * h;
        const [mn, mx] = this.rangeY(x0, z0, h);
        node.children.push(new ChunkNode(node.level + 1, x0, z0, h, mn, mx));
      }
    }
  }

  /** Select visible LOD nodes, queue builds, and build within budgetMs. */
  update(camera: THREE.PerspectiveCamera, budgetMs: number): void {
    this.frame++;
    this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);
    this.camPos.copy(camera.position);
    for (const n of this.drawList) if (n.mesh) n.mesh.visible = false;
    this.drawList.length = 0;
    this.queue.length = 0;
    for (const r of this.roots) this.select(r);
    for (const n of this.drawList) if (n.mesh) n.mesh.visible = true;
    this.stats.drawn = this.drawList.length;

    // Build queued nodes, nearest / coarsest first.
    this.queue.sort((a, b) => a.priority - b.priority);
    const t0 = performance.now();
    let built = 0;
    for (const n of this.queue) {
      if (built > 0 && performance.now() - t0 > budgetMs) break;
      this.build(n);
      built++;
    }
    this.stats.built = built;
    this.stats.queued = this.queue.length - built;
    for (const n of this.queue) n.queued = false;
    if (this.cached > this.maxCached && (this.frame & 31) === 0) this.evict();
    this.stats.cached = this.cached;
  }

  /** True when nothing is waiting to be built for the current view. */
  get idle(): boolean {
    return this.stats.queued === 0 && this.stats.built === 0;
  }

  private nodeDistance(n: ChunkNode): number {
    const p = this.camPos;
    const dx = Math.max(n.x0 - p.x, 0, p.x - (n.x0 + n.size));
    const dz = Math.max(n.z0 - p.z, 0, p.z - (n.z0 + n.size));
    const dy = Math.max(n.minY - p.y, 0, p.y - n.maxY);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private inFrustum(n: ChunkNode): boolean {
    this.box.min.set(n.x0, n.minY, n.z0);
    this.box.max.set(n.x0 + n.size, n.maxY, n.z0 + n.size);
    return this.frustum.intersectsBox(this.box);
  }

  private select(n: ChunkNode): void {
    if (n.x0 >= this.hf.worldW + 0.5 || n.z0 >= this.hf.worldH + 0.5) return;
    if (!this.inFrustum(n)) return;
    n.lastUsed = this.frame;
    const d = this.nodeDistance(n);
    const wantSplit = n.level < MAX_LOD && d < n.size * this.splitFactor;
    if (wantSplit) {
      if (!n.children) this.split(n);
      let ready = true;
      for (const c of n.children!) {
        if (c.x0 >= this.hf.worldW + 0.5 || c.z0 >= this.hf.worldH + 0.5) continue;
        if (!c.mesh && this.inFrustum(c)) {
          ready = false;
          this.enqueue(c, this.nodeDistance(c) / c.size);
        }
      }
      if (ready || !n.mesh) {
        for (const c of n.children!) {
          if (c.mesh || !this.inFrustum(c)) this.select(c);
        }
        if (ready) return;
      }
    }
    if (n.mesh) this.drawList.push(n);
    else this.enqueue(n, d / n.size - 10);
  }

  private enqueue(n: ChunkNode, priority: number): void {
    if (n.queued || n.mesh) return;
    n.queued = true;
    n.priority = priority - n.level * 0.01;
    this.queue.push(n);
  }

  private build(n: ChunkNode): void {
    const hf = this.hf;
    const s = n.size / N;
    const H = this.heights;
    const W = N + 3;
    let mn = Infinity, mx = -Infinity;
    for (let j = 0; j < W; j++) {
      const z = n.z0 + (j - 1) * s;
      for (let i = 0; i < W; i++) {
        const x = n.x0 + (i - 1) * s;
        const y = hf.heightAt(x, z, s);
        H[j * W + i] = y;
        if (i >= 1 && j >= 1 && i <= N + 1 && j <= N + 1) {
          if (y < mn) mn = y;
          if (y > mx) mx = y;
        }
      }
    }
    const pos = new Float32Array((GRID_VERTS + SKIRT_VERTS) * 3);
    const nor = new Int8Array((GRID_VERTS + SKIRT_VERTS) * 3);
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const v = j * (N + 1) + i;
        const hi = (j + 1) * W + (i + 1);
        pos[v * 3] = i * s;
        pos[v * 3 + 1] = H[hi];
        pos[v * 3 + 2] = j * s;
        const nx = H[hi - 1] - H[hi + 1];
        const nz = H[hi - W] - H[hi + W];
        const ny = 2 * s;
        const l = 127 / Math.sqrt(nx * nx + ny * ny + nz * nz);
        nor[v * 3] = Math.round(nx * l);
        nor[v * 3 + 1] = Math.round(ny * l);
        nor[v * 3 + 2] = Math.round(nz * l);
      }
    }
    // Skirts: copies of the border vertices pushed down.
    const depth = Math.max(0.004, n.size * 0.03);
    let v = GRID_VERTS;
    const edge = (gi: (k: number) => number) => {
      for (let k = 0; k <= N; k++, v++) {
        const src = gi(k);
        pos[v * 3] = pos[src * 3];
        pos[v * 3 + 1] = pos[src * 3 + 1] - depth;
        pos[v * 3 + 2] = pos[src * 3 + 2];
        nor[v * 3] = nor[src * 3];
        nor[v * 3 + 1] = nor[src * 3 + 1];
        nor[v * 3 + 2] = nor[src * 3 + 2];
      }
    };
    edge((k) => k); // north (j = 0)
    edge((k) => N * (N + 1) + k); // south (j = N)
    edge((k) => k * (N + 1)); // west (i = 0)
    edge((k) => k * (N + 1) + N); // east (i = N)

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3, true));
    g.setAttribute('aSpacing', this.spacingAttr(s));
    g.setIndex(this.index);
    if (!Number.isFinite(mn)) { mn = 0; mx = 0; }
    g.boundingBox = new THREE.Box3(new THREE.Vector3(0, mn - depth, 0), new THREE.Vector3(n.size, mx, n.size));
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    n.minY = Math.min(mn, 0) - depth;
    n.maxY = Math.max(mx, 0);
    const m = new THREE.Mesh(g, this.material);
    m.position.set(n.x0, 0, n.z0);
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    m.castShadow = true;
    m.receiveShadow = true;
    m.visible = false;
    this.group.add(m);
    n.mesh = m;
    this.cached++;
  }

  private spacingAttrs = new Map<number, THREE.BufferAttribute>();
  /** Constant per-chunk vertex spacing attribute (shared between chunks of a level). */
  private spacingAttr(s: number): THREE.BufferAttribute {
    let a = this.spacingAttrs.get(s);
    if (!a) {
      a = new THREE.BufferAttribute(new Float32Array(GRID_VERTS + SKIRT_VERTS).fill(s), 1);
      this.spacingAttrs.set(s, a);
    }
    return a;
  }

  private evict(): void {
    const all: ChunkNode[] = [];
    const walk = (n: ChunkNode) => {
      if (n.children) for (const c of n.children) walk(c);
      if (n.mesh && n.level > 0) all.push(n);
    };
    for (const r of this.roots) walk(r);
    all.sort((a, b) => a.lastUsed - b.lastUsed);
    const remove = this.cached - Math.floor(this.maxCached * 0.8);
    for (let i = 0; i < remove && i < all.length; i++) {
      const n = all[i];
      if (this.frame - n.lastUsed < 30) break;
      this.dispose(n);
    }
    // Drop childless subtrees whose meshes are all gone.
    const prune = (n: ChunkNode): boolean => {
      if (!n.children) return !n.mesh;
      let empty = true;
      for (const c of n.children) if (!prune(c)) empty = false;
      if (empty && this.frame - n.lastUsed > 60) n.children = null;
      return empty && !n.mesh;
    };
    for (const r of this.roots) prune(r);
  }

  private dispose(n: ChunkNode): void {
    if (!n.mesh) return;
    this.group.remove(n.mesh);
    n.mesh.geometry.dispose();
    n.mesh = null;
    this.cached--;
  }

  /** Approximate mesh vertex spacing used near world point (x, z) given camera distance d. */
  static spacingForDistance(d: number, splitFactor: number): number {
    let size = ROOT_CHUNK;
    for (let l = 0; l < MAX_LOD && d < size * splitFactor; l++) size /= 2;
    return size / N;
  }

  dispose_all(): void {
    const walk = (n: ChunkNode) => {
      if (n.children) for (const c of n.children) walk(c);
      this.dispose(n);
    };
    for (const r of this.roots) walk(r);
  }
}

function buildIndex(): THREE.BufferAttribute {
  const idx: number[] = [];
  const V = (i: number, j: number) => j * (N + 1) + i;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = V(i, j), b = V(i + 1, j), c = V(i, j + 1), d = V(i + 1, j + 1);
      // Alternate the diagonal for a less directional look.
      if ((i + j) & 1) {
        idx.push(a, c, b, b, c, d);
      } else {
        idx.push(a, c, d, a, d, b);
      }
    }
  }
  // Skirts. Each edge: top vertex t_k (grid) and bottom b_k (skirt).
  const base = GRID_VERTS;
  const strip = (topOf: (k: number) => number, off: number, flip: boolean) => {
    for (let k = 0; k < N; k++) {
      const t0 = topOf(k), t1 = topOf(k + 1), b0 = base + off + k, b1 = base + off + k + 1;
      if (flip) idx.push(t0, b0, t1, t1, b0, b1);
      else idx.push(t0, t1, b0, t1, b1, b0);
    }
  };
  strip((k) => V(k, 0), 0, false); // north: outward -z
  strip((k) => V(k, N), N + 1, true); // south: outward +z
  strip((k) => V(0, k), 2 * (N + 1), true); // west: outward -x
  strip((k) => V(N, k), 3 * (N + 1), false); // east: outward +x
  return new THREE.BufferAttribute(new Uint16Array(idx), 1);
}
