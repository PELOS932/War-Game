/**
 * Design model gallery: renders a grid of per-design procedural models.
 * Params: ?cat=Armor | ?ids=a,b,c | ?q=substring  &cols=8 &cell=200 &yaw=0.7 &pitch=0.45 &extra=1 &page=0 &per=48 &hand=1|0 &tint=8a9a70
 */
import * as THREE from 'three';
import { UnitCategory } from '../src/sim/types';
import { buildSpec, bakeTint, designById, resolvedVisual, rotorGeometry } from '../src/render/units/designModels';
import { handSpecIds } from '../src/render/units/modelSpecs';
import { DESIGNS } from '../src/data/military/index';

const p = new URLSearchParams(location.search);
const cols = Number(p.get('cols') ?? 8);
const cell = Number(p.get('cell') ?? 200);
const yaw = Number(p.get('yaw') ?? 0.75);
const pitch = Number(p.get('pitch') ?? 0.42);
const per = Number(p.get('per') ?? 48);
const page = Number(p.get('page') ?? 0);
const tint = new THREE.Color(`#${p.get('tint') ?? '8a9a70'}`);
const hand = new Set(handSpecIds());

let ids: string[];
if (p.get('ids')) ids = p.get('ids')!.split(',');
else {
  let list = DESIGNS.slice();
  const cat = p.get('cat');
  if (cat) {
    const cs = cat.split(',').map((c) => UnitCategory[c as keyof typeof UnitCategory]);
    list = list.filter((d) => cs.includes(d.category));
  }
  const q = p.get('q');
  if (q) list = list.filter((d) => d.id.includes(q) || d.name.toLowerCase().includes(q.toLowerCase()));
  if (p.get('hand') === '1') list = list.filter((d) => hand.has(d.id));
  if (p.get('hand') === '0') list = list.filter((d) => !hand.has(d.id));
  ids = list.map((d) => d.id);
}
ids = ids.slice(page * per, page * per + per);
const rows = Math.ceil(ids.length / cols);
const W = cols * cell, Hh = rows * cell;
const grid = document.getElementById('grid')!;
grid.style.width = `${W}px`;
grid.style.height = `${Hh}px`;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(W, Hh);
renderer.outputColorSpace = THREE.SRGBColorSpace;
grid.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x3a3226, 1.3));
const sun = new THREE.DirectionalLight(0xfff3e0, 2.2);
sun.position.set(2, 4, 3);
scene.add(sun);
const cam = new THREE.PerspectiveCamera(28, 1, 0.01, 50);
const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15 });
renderer.setScissorTest(true);
let tris = 0;
const t0 = performance.now();
ids.forEach((id, i) => {
  const d = designById(id);
  const cx = (i % cols) * cell, cy = Math.floor(i / cols) * cell;
  const lbl = document.createElement('div');
  lbl.className = 'lbl';
  lbl.style.left = `${cx}px`; lbl.style.top = `${cy}px`; lbl.style.width = `${cell - 10}px`;
  grid.appendChild(lbl);
  if (!d) { lbl.textContent = `? ${id}`; return; }
  const rv = resolvedVisual(d);
  const spec = p.get('extra') === '1' && rv.v.extra ? rv.v.extra : rv.v.main;
  const b = buildSpec(spec);
  const g = bakeTint(b.geo, tint);
  tris += g.getAttribute('position').count / 3;
  const obj = new THREE.Group();
  obj.add(new THREE.Mesh(g, mat));
  for (const r of b.rotors) {
    const m = new THREE.Mesh(bakeTint(rotorGeometry(r.r, r.b), tint), mat);
    m.position.set(r.x, r.y, r.z);
    m.rotation.y = 0.4 * r.dir;
    obj.add(m);
  }
  scene.add(obj);
  const bb = new THREE.Box3().setFromObject(obj);
  const sph = bb.getBoundingSphere(new THREE.Sphere());
  const dist = sph.radius / Math.sin(THREE.MathUtils.degToRad(14)) * 1.02;
  cam.position.set(sph.center.x + Math.cos(yaw) * Math.cos(pitch) * dist, sph.center.y + Math.sin(pitch) * dist, sph.center.z + Math.sin(yaw) * Math.cos(pitch) * dist);
  cam.lookAt(sph.center);
  cam.updateProjectionMatrix();
  const y = Hh - cy - cell;
  renderer.setViewport(cx, y, cell, cell);
  renderer.setScissor(cx, y, cell, cell);
  renderer.setClearColor((Math.floor(i / cols) + i) % 2 ? 0x1b232c : 0x202a34);
  renderer.render(scene, cam);
  scene.remove(obj);
  g.dispose();
  b.geo.dispose();
  lbl.innerHTML = `<b>${d.name}</b><br><i>${id}</i> ${hand.has(id) ? '<span class="h">★</span>' : ''} ${d.origin ?? ''} ${d.year ?? ''}`;
});
(window as unknown as Record<string, unknown>).__modelsReady = { n: ids.length, tris, ms: performance.now() - t0 };
