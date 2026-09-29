import * as THREE from 'three';
import { UnitCategory, UnitClass, CATEGORY_CLASS } from '../sim/types';
import { buildModel, formationFor, rotorGeometry } from './units/models';

/**
 * Offscreen 3D thumbnail service for unit designs.
 *
 * One shared, lazily-created WebGLRenderer (the only extra WebGL context the
 * game ever opens) renders each design once with a fixed 3/4 studio camera,
 * auto-framed to the model's bounding box, and caches the result as PNG data
 * URLs in two sizes. Rendering is spread over animation frames (at most
 * `MAX_PER_FRAME` per frame, time-boxed) and the renderer + its context are
 * released again once the queue has been idle for a few seconds.
 *
 * Models come from `./units/designModels.ts` (`buildDesignObject`) when that
 * module exists; otherwise the per-category procedural models are used.
 */

export type ThumbSize = 'sm' | 'lg';

type DesignModelsModule = {
  buildDesignObject?: (designId: string, tint?: THREE.ColorRepresentation) => THREE.Object3D | null;
};
// Optional module (may not exist yet): glob resolves to {} when it is missing.
const designMods = import.meta.glob('./units/designModels.ts', { eager: true }) as Record<string, DesignModelsModule>;
const buildDesignObject = Object.values(designMods)[0]?.buildDesignObject;

/** Offscreen render size (lg output); sm is a downscale of the same frame. */
const LG_W = 288, LG_H = 192;
const SM_W = 144, SM_H = 96;
const MAX_PER_FRAME = 3;
const FRAME_BUDGET_MS = 12;
const IDLE_DISPOSE_MS = 4000;
const MAX_CONTEXT_ATTEMPTS = 3;
const STORE_KEY = `sc-thumb-v1-${buildDesignObject ? 'd' : 'c'}:`;

const cache = new Map<string, { sm: string; lg: string }>();
const failed = new Set<string>();
const queue: string[] = [];
const queued = new Set<string>();
const listeners = new Set<(designId: string) => void>();
const categoryHints = new Map<string, UnitCategory>();

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.OrthographicCamera | null = null;
let shadowDisc: THREE.Mesh | null = null;
let smCanvas: HTMLCanvasElement | null = null;
let smCtx: CanvasRenderingContext2D | null = null;
let rafId = 0;
let idleTimer = 0;
let contextAttempts = 0;
let disabled = false;
let persist = true;

/** Tell the service which category a design belongs to (needed for the fallback models). */
export function hintDesignCategory(designId: string, category: UnitCategory): void {
  categoryHints.set(designId, category);
}

/**
 * Cached data URL for a design's thumbnail, or null if it is not rendered
 * yet (rendering is then queued; `onThumbnailReady` fires when done).
 */
export function getDesignThumbnail(designId: string, size: ThumbSize = 'sm'): string | null {
  const hit = cache.get(designId) ?? loadStored(designId);
  if (hit) return hit[size];
  if (disabled || failed.has(designId)) return null;
  if (!queued.has(designId)) {
    queued.add(designId);
    queue.push(designId);
    schedule();
  }
  return null;
}

/** Subscribe to thumbnail completion. Returns an unsubscribe function. */
export function onThumbnailReady(cb: (designId: string) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Release the offscreen renderer and its WebGL context (cache is kept). */
export function disposeThumbnailRenderer(): void {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = 0;
  if (shadowDisc) {
    shadowDisc.geometry.dispose();
    const m = shadowDisc.material as THREE.MeshBasicMaterial;
    m.map?.dispose();
    m.dispose();
  }
  if (renderer) {
    const r = renderer;
    renderer = null;
    r.domElement.removeEventListener('webglcontextlost', onContextLost);
    r.dispose();
    r.forceContextLoss();
  }
  scene = null;
  camera = null;
  shadowDisc = null;
}

// ---------------------------------------------------------------------------

function loadStored(id: string): { sm: string; lg: string } | null {
  try {
    const s = sessionStorage.getItem(STORE_KEY + id);
    if (!s) return null;
    const v = JSON.parse(s) as { sm?: string; lg?: string };
    if (typeof v.sm !== 'string' || typeof v.lg !== 'string') return null;
    const e = { sm: v.sm, lg: v.lg };
    cache.set(id, e);
    return e;
  } catch {
    return null;
  }
}

function store(id: string, e: { sm: string; lg: string }): void {
  if (!persist) return;
  try {
    sessionStorage.setItem(STORE_KEY + id, JSON.stringify(e));
  } catch {
    persist = false; // quota or storage blocked: memory cache only
  }
}

function schedule(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = 0;
  }
  if (!rafId) rafId = requestAnimationFrame(processQueue);
}

function onContextLost(e: Event): void {
  e.preventDefault();
  // Drop everything tied to the dead context; the next queued item recreates it.
  disposeThumbnailRenderer();
  if (queue.length) schedule();
}

function ensureRenderer(): boolean {
  if (renderer) return true;
  if (disabled) return false;
  if (++contextAttempts > MAX_CONTEXT_ATTEMPTS) {
    disabled = true;
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = LG_W;
    canvas.height = LG_H;
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    r.setPixelRatio(1);
    r.setSize(LG_W, LG_H, false);
    r.setClearColor(0x000000, 0);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.15;
    canvas.addEventListener('webglcontextlost', onContextLost);
    renderer = r;
  } catch {
    renderer = null;
    disabled = true; // no WebGL for thumbnails: UI keeps its SVG symbols
    return false;
  }

  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe8f2, 0x3a3630, 1.1));
  const key = new THREE.DirectionalLight(0xfff4e2, 2.3);
  key.position.set(2, 4, 3);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xb8c8dc, 0.7);
  fill.position.set(-3, 1.5, 1);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 1.0);
  rim.position.set(-1, 2.5, -4);
  scene.add(rim);

  // Soft contact shadow under the model.
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  shadowDisc = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }),
  );
  shadowDisc.renderOrder = -1;
  scene.add(shadowDisc);

  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  return true;
}

const LAND_TINT = 0x7f8a64;
const AIR_TINT = 0x8e98a3;
const NAVAL_TINT = 0x9aa3ab;

/** Bake the `aTint` weight into vertex colours (the in-world shader does this per instance). */
function bakeTint(geo: THREE.BufferGeometry, tint: THREE.Color): void {
  const col = geo.getAttribute('color') as THREE.BufferAttribute | undefined;
  const tw = geo.getAttribute('aTint') as THREE.BufferAttribute | undefined;
  if (!col || !tw) return;
  for (let i = 0; i < col.count; i++) {
    const w = tw.getX(i);
    if (w <= 0) continue;
    col.setXYZ(
      i,
      col.getX(i) * (1 - w + w * tint.r),
      col.getY(i) * (1 - w + w * tint.g),
      col.getZ(i) * (1 - w + w * tint.b),
    );
  }
  col.needsUpdate = true;
}

/** Fallback: single procedural model of the design's category. Owns its resources. */
function buildFallback(cat: UnitCategory): THREE.Object3D {
  const cls = CATEGORY_CLASS[cat];
  const tint = new THREE.Color(cls === UnitClass.Air ? AIR_TINT : cls === UnitClass.Naval ? NAVAL_TINT : LAND_TINT);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15 });
  const f = formationFor(cat, false);
  const grp = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, x = 0, y = 0, z = 0) => {
    bakeTint(geo, tint);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    grp.add(m);
  };
  if (f.kind === 'soldier') {
    // A lone figure reads poorly: show the fire team (+ its vehicle) in model units.
    const s = f.scale;
    for (const [mx, mz] of f.members.slice(0, 4)) {
      const g = buildModel('soldier');
      g.scale(s, s, s);
      add(g, mx, 0, mz);
    }
    if (f.extra) {
      const g = buildModel(f.extra.kind);
      g.scale(0.6, 0.6, 0.6);
      add(g, f.extra.at[0] - 0.55, 0, f.extra.at[1] - 0.35);
    }
  } else {
    add(buildModel(f.kind));
    if (f.kind === 'heli') add(rotorGeometry(), 0.12, 0.4, 0);
  }
  grp.userData.ownedResources = true;
  return grp;
}

function buildObject(designId: string): THREE.Object3D | null {
  if (buildDesignObject) {
    try {
      const o = buildDesignObject(designId);
      if (o) return o;
    } catch (err) {
      console.warn('[thumbnails] buildDesignObject failed for', designId, err);
    }
  }
  const cat = categoryHints.get(designId);
  return cat === undefined ? null : buildFallback(cat);
}

function disposeOwned(obj: THREE.Object3D): void {
  if (!obj.userData.ownedResources) return; // external models: freed with the renderer
  const mats = new Set<THREE.Material>();
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => mats.add(x));
    }
  });
  mats.forEach((m) => m.dispose());
}

const VIEW_DIR = new THREE.Vector3(0.62, 0.5, 1).normalize();
const tmpBox = new THREE.Box3();
const tmpV = new THREE.Vector3();

function renderOne(designId: string): { sm: string; lg: string } | null {
  if (!ensureRenderer() || !renderer || !scene || !camera || !shadowDisc) return null;
  const obj = buildObject(designId);
  if (!obj) return null;
  scene.add(obj);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) {
    scene.remove(obj);
    disposeOwned(obj);
    return null;
  }
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Shadow disc on the model's base.
  shadowDisc.position.set(center.x, box.min.y + 0.001, center.z);
  shadowDisc.scale.set(size.x * 1.25 + 0.05, 1, size.z * 1.25 + 0.05);
  shadowDisc.updateMatrixWorld(true);

  // 3/4 orthographic camera framed to the object (+ most of the shadow).
  const radius = size.length() * 0.5 + 0.01;
  camera.position.copy(center).addScaledVector(VIEW_DIR, radius * 4);
  camera.up.set(0, 1, 0);
  camera.lookAt(center);
  camera.updateMatrixWorld(true);
  const inv = camera.matrixWorldInverse;
  tmpBox.makeEmpty();
  const addCorners = (b: THREE.Box3) => {
    for (let i = 0; i < 8; i++) {
      tmpV.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(inv);
      tmpBox.expandByPoint(tmpV);
    }
  };
  addCorners(box);
  const sBox = new THREE.Box3(
    new THREE.Vector3(center.x - size.x * 0.52, box.min.y, center.z - size.z * 0.52),
    new THREE.Vector3(center.x + size.x * 0.52, box.min.y, center.z + size.z * 0.52),
  );
  addCorners(sBox);
  const aspect = LG_W / LG_H;
  let hw = (tmpBox.max.x - tmpBox.min.x) / 2;
  let hh = (tmpBox.max.y - tmpBox.min.y) / 2;
  const cx = (tmpBox.max.x + tmpBox.min.x) / 2;
  const cy = (tmpBox.max.y + tmpBox.min.y) / 2;
  const pad = 1.1;
  hw *= pad;
  hh *= pad;
  if (hw / hh > aspect) hh = hw / aspect;
  else hw = hh * aspect;
  camera.left = cx - hw;
  camera.right = cx + hw;
  camera.top = cy + hh;
  camera.bottom = cy - hh;
  camera.near = Math.max(0.001, -tmpBox.max.z - radius);
  camera.far = -tmpBox.min.z + radius;
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
  const canvas = renderer.domElement;
  const lg = canvas.toDataURL('image/png');
  if (!smCanvas) {
    smCanvas = document.createElement('canvas');
    smCanvas.width = SM_W;
    smCanvas.height = SM_H;
    smCtx = smCanvas.getContext('2d');
    if (smCtx) smCtx.imageSmoothingQuality = 'high';
  }
  let sm = lg;
  if (smCtx && smCanvas) {
    smCtx.clearRect(0, 0, SM_W, SM_H);
    smCtx.drawImage(canvas, 0, 0, SM_W, SM_H);
    sm = smCanvas.toDataURL('image/png');
  }
  scene.remove(obj);
  disposeOwned(obj);
  return { sm, lg };
}

function processQueue(): void {
  rafId = 0;
  const t0 = performance.now();
  let n = 0;
  while (queue.length && n < MAX_PER_FRAME && (n === 0 || performance.now() - t0 < FRAME_BUDGET_MS)) {
    const id = queue.shift()!;
    queued.delete(id);
    if (cache.has(id)) continue;
    let res: { sm: string; lg: string } | null = null;
    try {
      res = renderOne(id);
    } catch (err) {
      console.warn('[thumbnails] render failed for', id, err);
    }
    n++;
    if (!res) {
      failed.add(id);
      if (disabled) {
        queue.length = 0;
        queued.clear();
        return;
      }
      continue;
    }
    cache.set(id, res);
    store(id, res);
    for (const cb of listeners) {
      try {
        cb(id);
      } catch (err) {
        console.warn('[thumbnails] listener error', err);
      }
    }
  }
  if (queue.length) rafId = requestAnimationFrame(processQueue);
  else if (renderer && !idleTimer) {
    idleTimer = window.setTimeout(() => {
      idleTimer = 0;
      if (!queue.length) {
        disposeThumbnailRenderer();
        contextAttempts = 0; // an intentional release is not a failure
      }
    }, IDLE_DISPOSE_MS);
  }
}
