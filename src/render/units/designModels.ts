import * as THREE from 'three';
import { UNIT_DESIGNS } from '../../sim/data/units';
import { realUnitDesigns } from '../../sim/data/realdesigns';
import type { UnitDesign } from '../../sim/types';
import { buildModel, formationFor } from './models';

/**
 * Per-design procedural 3D models (work in progress stub: category model).
 * Forward = +x, up = +y, right = +z, base at y = 0, length ≈ 1.
 */

let designIndex: Map<string, UnitDesign> | null = null;
/** Design lookup (generic sim designs + real equipment) by id. */
export function designById(id: string): UnitDesign | undefined {
  if (!designIndex) {
    designIndex = new Map();
    for (const d of UNIT_DESIGNS) designIndex.set(d.id, d);
    for (const d of realUnitDesigns()) designIndex.set(d.id, d);
  }
  return designIndex.get(id);
}

/** Copy of a model geometry with the nation tint baked into the vertex colours (for standalone rendering). */
export function bakeTint(geo: THREE.BufferGeometry, tint: THREE.ColorRepresentation): THREE.BufferGeometry {
  const g = geo.clone();
  const c = new THREE.Color(tint);
  const col = g.getAttribute('color') as THREE.BufferAttribute | undefined;
  const t = g.getAttribute('aTint') as THREE.BufferAttribute | undefined;
  if (col && t) {
    for (let i = 0; i < col.count; i++) {
      const w = t.getX(i);
      col.setXYZ(i, col.getX(i) * (1 - w + w * c.r), col.getY(i) * (1 - w + w * c.g), col.getZ(i) * (1 - w + w * c.b));
    }
  }
  return g;
}

/**
 * Standalone, correctly oriented model of a design (+x forward, y up, roughly
 * unit length, base at y = 0) for offscreen thumbnail / preview rendering.
 * Materials use vertex colours; `tint` recolours the nation-coloured parts.
 */
export function buildDesignObject(designId: string, tint: THREE.ColorRepresentation = 0x7d8a6a): THREE.Object3D | null {
  const d = designById(designId);
  if (!d) return null;
  const geo = bakeTint(buildModel(formationFor(d.category, false).kind), tint);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = designId;
  return mesh;
}
