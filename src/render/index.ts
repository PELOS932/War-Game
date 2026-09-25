import * as THREE from 'three';
import { HexGrid } from '../core/hex';
import type { GameAPI } from '../sim/api';
import type { GameEvent } from '../sim/types';
import { WorldData, latitudeAt, longitudeAt, worldHeight, worldWidth } from '../worldgen/types';
import { MapClick, MapMode, MapRenderer, RenderSettings } from './api';
import { RTSCamera } from './camera';
import { MAX_SHADER_CITIES, clamp, smoothstep } from './constants';
import { HeightField } from './heightfield';
import { InputHandler } from './input';
import { CityInfo, cityInfos, computeLandUse, LandUse } from './landuse';
import { createSharedUniforms, localSunDir, Shared, sunFromHour } from './lighting';
import { Overlay } from './overlay';
import { Sky } from './sky';
import { TerrainChunks } from './terrain/chunks';
import { CityUniforms, createCityUniforms, createTerrainMaterial } from './terrain/material';
import { createWorldTextures, WorldTextures } from './textures';
import { Water } from './water';
import { Rivers } from './rivers';
import { Roads } from './roads';
import { Vegetation } from './vegetation';
import { Cities } from './cities';
import { Units } from './units/units';
import { Facilities } from './facilities';
import { Effects } from './effects';
import { Labels } from './labels';
import { Markers } from './markers';

export { MapMode } from './api';
export type { MapClick, MapRenderer, RenderSettings } from './api';

/** Default preview time when no game is attached: 1 June 2030, 11:00 UTC. */
const PREVIEW_HOUR = 151 * 24 + 11;

const QUALITY = {
  low: { pixelRatio: 0.85, split: 1.7, budget: 3, shadowSize: 1024, trees: 0.45 },
  medium: { pixelRatio: 1, split: 2.2, budget: 4, shadowSize: 2048, trees: 0.75 },
  high: { pixelRatio: 1.5, split: 2.7, budget: 6, shadowSize: 2048, trees: 1 },
};

const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 0));

export interface WorldContext {
  world: WorldData;
  grid: HexGrid;
  hf: HeightField;
  shared: Shared;
  landuse: LandUse;
  cities: CityInfo[];
  tex: WorldTextures;
  worldW: number;
  worldH: number;
}

export class Renderer implements MapRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly settings: RenderSettings = {
    dayNight: true, clouds: false, shadows: true, hexGrid: true, labels: true, units: true, quality: 'medium',
  };
  mapMode: MapMode = MapMode.Political;

  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly cam: RTSCamera;
  private container: HTMLElement;
  private input: InputHandler;
  private sunLight: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private fog: THREE.Fog;

  ctx: WorldContext | null = null;
  private overlay: Overlay | null = null;
  terrain: TerrainChunks | null = null;
  private terrainMat: THREE.MeshStandardMaterial | null = null;
  private cityUniforms: CityUniforms = createCityUniforms();
  private water: Water | null = null;
  private sky: Sky | null = null;
  private rivers: Rivers | null = null;
  private roads: Roads | null = null;
  vegetation: Vegetation | null = null;
  cities: Cities | null = null;
  units: Units | null = null;
  private facilities: Facilities | null = null;
  effects: Effects | null = null;
  private labels: Labels | null = null;
  private markers: Markers | null = null;

  private game: GameAPI | null = null;
  private unsub: (() => void) | null = null;
  private clickCbs: ((e: MapClick) => void)[] = [];
  private hoverCbs: ((hex: number, unitId: number, x: number, y: number) => void)[] = [];
  private boxCbs: ((x0: number, y0: number, x1: number, y1: number, shift: boolean) => void)[] = [];
  private time = 0;
  previewHour = PREVIEW_HOUR;
  /** Frame timing (ms) for diagnostics. */
  stats = { frameMs: 0, cpuMs: 0, drawCalls: 0, triangles: 0 };
  private raycaster = new THREE.Raycaster();
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private sunDir = new THREE.Vector3(0.4, 0.8, 0.3);
  private ro: ResizeObserver;
  private lastCitySelect = -1;

  constructor(container: HTMLElement) {
    this.container = container;
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    this.gl = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false });
    this.canvas = this.gl.domElement;
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.touchAction = 'none';
    this.canvas.tabIndex = 0;
    container.appendChild(this.canvas);
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.NeutralToneMapping;
    this.gl.toneMappingExposure = 1.0;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.shadowMap.autoUpdate = true;
    this.gl.setClearColor(0x0a1420, 1);

    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    this.cam = new RTSCamera(w / h, 100, 60);
    this.applyPixelRatio();
    this.gl.setSize(w, h, false);

    this.fog = new THREE.Fog(0x9fb4c8, 100, 1000);
    this.scene.fog = this.fog;
    this.scene.background = new THREE.Color(0x0a1420);
    this.sunLight = new THREE.DirectionalLight(0xfff4e6, 2.3);
    this.sunLight.castShadow = false;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight, this.sunLight.target);
    this.hemi = new THREE.HemisphereLight(0xb8cbe6, 0x6b5a45, 1.0);
    this.scene.add(this.hemi);

    this.input = new InputHandler(this.canvas, this.cam, {
      groundAt: (x, y) => this.groundAt(x, y),
      click: (button, x, y, shift, ctrl, dbl) => this.dispatchClick(button, x, y, shift, ctrl, dbl),
      hover: (x, y) => this.dispatchHover(x, y),
      boxSelect: (x0, y0, x1, y1, shift) => { for (const cb of this.boxCbs) cb(x0, y0, x1, y1, shift); },
    });

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
  }

  private applyPixelRatio(): void {
    const q = QUALITY[this.settings.quality];
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
  }

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.gl.setSize(w, h, false);
    this.cam.setAspect(w / h);
  }

  // ---------------------------------------------------------------------------
  // World loading
  // ---------------------------------------------------------------------------
  async loadWorld(world: WorldData, progress?: (stage: string, fraction: number) => void): Promise<void> {
    const p = progress ?? (() => {});
    this.disposeWorld();
    const s = world.settings;
    const worldW = worldWidth(s), worldH = worldHeight(s);
    const grid = new HexGrid(s.cols, s.rows);
    p('Preparing land use', 0);
    await yieldFrame();
    const cities = cityInfos(world);
    const landuse = computeLandUse(world, grid, cities);
    p('Preparing terrain', 0.15);
    await yieldFrame();
    const hf = new HeightField(world, landuse.urban);
    const shared = createSharedUniforms(s);
    p('Uploading textures', 0.3);
    await yieldFrame();
    const tex = createWorldTextures(world, landuse);
    this.ctx = { world, grid, hf, shared, landuse, cities, tex, worldW, worldH };
    this.cam.setWorld(worldW, worldH);
    this.cam.heightAt = (x, z, d) => this.surfaceForCamera(x, z, d);

    this.overlay = new Overlay(world, grid);
    this.terrainMat = createTerrainMaterial(shared, tex, this.overlay, this.cityUniforms, world.hw, world.hh);
    this.terrain = new TerrainChunks(hf, this.terrainMat);
    this.scene.add(this.terrain.group);
    p('Building terrain', 0.4);
    await yieldFrame();
    this.terrain.buildRoots();

    p('Filling oceans', 0.55);
    await yieldFrame();
    this.water = new Water(world, shared, tex, this.overlay);
    this.scene.add(this.water.group);
    this.sky = new Sky(shared, worldW, worldH);
    this.scene.add(this.sky.dome, this.sky.clouds);

    p('Tracing rivers', 0.62);
    await yieldFrame();
    this.rivers = new Rivers(this.ctx);
    this.scene.add(this.rivers.group);
    p('Laying roads and railways', 0.7);
    await yieldFrame();
    this.roads = new Roads(this.ctx);
    this.scene.add(this.roads.group);
    p('Planting forests', 0.78);
    await yieldFrame();
    this.vegetation = new Vegetation(this.ctx);
    this.scene.add(this.vegetation.group);
    p('Raising cities', 0.84);
    await yieldFrame();
    this.cities = new Cities(this.ctx);
    this.scene.add(this.cities.group);
    p('Preparing forces', 0.9);
    await yieldFrame();
    this.units = new Units(this.ctx, this.canvas);
    this.scene.add(this.units.group);
    this.facilities = new Facilities(this.ctx);
    this.scene.add(this.facilities.group);
    this.effects = new Effects(this.ctx);
    this.scene.add(this.effects.group);
    this.markers = new Markers(this.ctx);
    this.scene.add(this.markers.group);
    this.labels = new Labels(this.ctx, this.container);
    this.applySettings({});
    this.setMapMode(this.mapMode);
    this.cam.focus(worldW / 2, worldH / 2, this.cam.maxDist * 0.85, true);
    p('Ready', 1);
  }

  private disposeWorld(): void {
    if (!this.ctx) return;
    for (const o of [...this.scene.children]) {
      if (o !== this.sunLight && o !== this.sunLight.target && o !== this.hemi) this.scene.remove(o);
    }
    this.terrain?.dispose_all();
    this.labels?.dispose();
    this.ctx = null;
  }

  attachGame(game: GameAPI): void {
    this.unsub?.();
    this.game = game;
    this.overlay?.attachGame(game);
    this.units?.attachGame(game);
    this.facilities?.attachGame(game);
    this.labels?.attachGame(game);
    this.cities?.attachGame(game);
    this.unsub = game.on((e) => this.onGameEvent(e));
  }

  private onGameEvent(e: GameEvent): void {
    this.effects?.onEvent(e, this.cam.dist);
    if (e.type === 'unitDestroyed') this.units?.onDestroyed(e.unit);
  }

  // ---------------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------------
  render(dt: number): void {
    const t0 = performance.now();
    dt = clamp(dt, 0, 0.25);
    this.time += dt;
    this.input.update(dt);
    this.cam.update(dt);
    const ctx = this.ctx;
    if (!ctx) {
      this.gl.render(this.scene, this.cam.camera);
      return;
    }
    const camera = this.cam.camera;
    const q = QUALITY[this.settings.quality];
    const sh = ctx.shared;
    const hour = this.game ? this.game.state.hour + this.game.hourFraction : this.previewHour;
    const sun = sunFromHour(hour);
    sh.uSunLon.value = sun.lon;
    sh.uSunDecl.value = sun.decl;
    sh.uDayOfYear.value = sun.dayOfYear;
    sh.uDayNight.value = this.settings.dayNight ? 1 : 0;
    sh.uTime.value = this.time;
    sh.uCloudTime.value = hour * 0.35 + this.time * 0.02;
    sh.uCamDist.value = this.cam.dist;
    sh.uCamPos.value.copy(camera.position);
    sh.uCamTarget.value.set(this.cam.x, this.cam.y, this.cam.z);
    sh.uCloudShadow.value = this.settings.clouds ? 1 : 0;
    sh.uCloudsOn.value = this.settings.clouds ? 1 : 0;
    sh.uPixelScale.value = this.gl.getPixelRatio();
    sh.uPixelK.value = (2 * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, this.gl.domElement.height);

    // Sun / lights.
    const lat = latitudeAt(this.cam.z, ctx.world.settings), lon = longitudeAt(this.cam.x, ctx.world.settings);
    localSunDir(lat, lon, sun, this.sunDir);
    const localAlt = this.sunDir.y;
    const localDay = this.settings.dayNight ? smoothstep(-0.09, 0.14, localAlt) : 1;
    if (!this.settings.dayNight) this.sunDir.set(-0.45, 0.72, 0.5);
    // Keep relief readable: clamp elevation; blend to a fixed light when zoomed out.
    const minEl = 0.26;
    if (this.sunDir.y < minEl) {
      const hz = Math.hypot(this.sunDir.x, this.sunDir.z) || 1;
      const k = Math.sqrt(1 - minEl * minEl) / hz;
      this.sunDir.set(this.sunDir.x * k, minEl, this.sunDir.z * k);
    }
    const fixed = this.tmpV2.set(-0.42, 0.78, 0.46).normalize();
    this.sunDir.lerp(fixed, smoothstep(30, 160, this.cam.dist)).normalize();
    sh.uSunDir.value.copy(this.sunDir);
    this.sunLight.position.set(this.cam.x + this.sunDir.x * 50, this.cam.y + this.sunDir.y * 50, this.cam.z + this.sunDir.z * 50);
    this.sunLight.target.position.set(this.cam.x, this.cam.y, this.cam.z);
    this.sunLight.target.updateMatrixWorld();
    const lowSun = 1 - smoothstep(0.05, 0.35, localAlt);
    this.sunLight.color.setRGB(1, 0.96 - 0.25 * lowSun, 0.9 - 0.4 * lowSun);
    const skyDay = new THREE.Color(0.36, 0.55, 0.85);
    const horizonDay = new THREE.Color(0.7, 0.78, 0.88);
    sh.uSkyColor.value.copy(skyDay);
    sh.uHorizonColor.value.copy(horizonDay);
    this.hemi.intensity = 1.0;
    // Night side stays readable when zoomed out (strategic view).
    const nb = 1 + 1.3 * smoothstep(15, 250, this.cam.dist);
    sh.uNightAmbient.value.set(0.2 * nb, 0.25 * nb, 0.42 * nb);

    // Shadows only when zoomed in.
    const useShadows = this.settings.shadows && this.settings.quality !== 'low' && this.cam.dist < 6;
    if (useShadows !== this.sunLight.castShadow) {
      this.sunLight.castShadow = useShadows;
      this.sunLight.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      this.sunLight.shadow.map?.dispose();
      this.sunLight.shadow.map = null;
    }
    if (useShadows) {
      const ext = this.cam.dist * 1.6 + 0.05;
      const sc = this.sunLight.shadow.camera;
      // Snap to texel grid to avoid shimmering.
      sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext;
      sc.near = 1; sc.far = 100;
      sc.updateProjectionMatrix();
      const texel = (2 * ext) / q.shadowSize;
      const sx = Math.round(this.cam.x / texel) * texel, sz = Math.round(this.cam.z / texel) * texel;
      this.sunLight.position.set(sx + this.sunDir.x * 50, this.cam.y + this.sunDir.y * 50, sz + this.sunDir.z * 50);
      this.sunLight.target.position.set(sx, this.cam.y, sz);
      this.sunLight.target.updateMatrixWorld();
      this.sunLight.shadow.bias = -0.0002 - 0.00002 * this.cam.dist;
      this.sunLight.shadow.normalBias = 0.002 + this.cam.dist * 0.004;
    }

    // Fog / atmospheric perspective.
    const fogCol = this.tmpColor.copy(horizonDay).multiplyScalar(0.25 + 0.75 * localDay);
    fogCol.lerp(this.nightFog, (1 - localDay) * 0.8);
    this.fog.color.copy(fogCol);
    this.fog.near = this.cam.dist * 1.25;
    this.fog.far = this.cam.dist * 8 + 2;
    (this.scene.background as THREE.Color).copy(fogCol).multiplyScalar(0.4);

    // Overlay & terrain.
    const ownersChanged = this.overlay!.update(dt);
    if (ownersChanged) this.labels?.markOwnersDirty();
    this.updateCityUniforms();
    this.terrain!.splitFactor = q.split;
    this.terrain!.update(camera, q.budget);
    const target = this.tmpV.set(this.cam.x, this.cam.y, this.cam.z);
    this.water!.update(target, this.cam.dist, ctx.worldW, ctx.worldH);
    this.sky!.update(camera, this.cam.dist, localDay, this.settings.clouds);
    this.rivers?.update(this.cam.dist);
    this.roads?.update(this.cam.dist, camera);
    this.vegetation?.update(camera, this.cam, q.trees, sun.dayOfYear, 2);
    this.cities?.update(camera, this.cam, 2);
    this.facilities?.update(dt, this.cam, camera, this.effects);
    if (this.units) {
      this.units.visible = this.settings.units;
      this.units.update(dt, this.cam, camera, this.effects);
    }
    this.effects?.update(dt, camera, this.cam.dist);
    this.markers?.update(dt, this.cam, camera);

    const cpu = performance.now() - t0;
    this.gl.render(this.scene, camera);
    if (this.labels) {
      this.labels.visible = this.settings.labels;
      this.labels.update(camera, this.cam, this.canvas);
    }
    const info = this.gl.info.render;
    this.stats.drawCalls = info.calls;
    this.stats.triangles = info.triangles;
    this.stats.cpuMs = cpu;
    this.stats.frameMs = performance.now() - t0;
  }

  private tmpColor = new THREE.Color();
  private nightFog = new THREE.Color(0.02, 0.03, 0.06);

  /** Nearest cities to the camera target → ground shader street grids. */
  private updateCityUniforms(): void {
    const ctx = this.ctx!;
    const u = this.cityUniforms;
    if (this.cam.dist > 9) {
      u.uCityCount.value = 0;
      return;
    }
    const key = Math.round(this.cam.x * 4) * 100000 + Math.round(this.cam.z * 4) + Math.round(this.cam.dist) * 1e9;
    if (key === this.lastCitySelect) return;
    this.lastCitySelect = key;
    const range = this.cam.dist * 3 + 1.5;
    const cand: { c: CityInfo; d: number }[] = [];
    for (const c of ctx.cities) {
      const d = Math.hypot(c.x - this.cam.x, c.z - this.cam.z) - c.r * 1.6;
      if (d < range) cand.push({ c, d });
    }
    cand.sort((a, b) => a.d - b.d);
    const n = Math.min(MAX_SHADER_CITIES, cand.length);
    for (let i = 0; i < n; i++) {
      const c = cand[i].c;
      u.uCities.value[i].set(c.x, c.z, c.r, c.angle);
      u.uCities2.value[i].set(c.seed, c.pop, c.capital ? 1 : 0, c.id);
    }
    u.uCityCount.value = n;
  }

  /** Height the camera orbits around: smooth-ish surface. */
  private surfaceForCamera(x: number, z: number, d: number): number {
    const hf = this.ctx?.hf;
    if (!hf) return 0;
    const sp = TerrainChunks.spacingForDistance(d, QUALITY[this.settings.quality].split);
    return hf.surfaceAt(clamp(x, 0, hf.worldW), clamp(z, 0, hf.worldH), sp);
  }

  // ---------------------------------------------------------------------------
  // Settings & presentation
  // ---------------------------------------------------------------------------
  applySettings(s: Partial<RenderSettings>): void {
    const prevQ = this.settings.quality;
    Object.assign(this.settings, s);
    if (this.settings.quality !== prevQ) this.applyPixelRatio();
    if (this.overlay) this.overlay.uniforms.uHexGridOn.value = this.settings.hexGrid ? 1 : 0;
    if (this.labels) this.labels.visible = this.settings.labels;
    if (this.units) this.units.visible = this.settings.units;
    this.resize();
  }

  setMapMode(mode: MapMode): void {
    this.mapMode = mode;
    this.overlay?.setMode(mode);
  }

  setHexHighlight(hexes: number[], color: string): void {
    this.overlay?.setHighlight(hexes, color);
  }

  showPath(hexes: number[], hostile: boolean): void {
    this.markers?.showPath(hexes, hostile);
  }

  setSelectedUnits(ids: number[]): void {
    this.units?.setSelected(ids);
  }

  pingHex(hex: number, color: string): void {
    this.markers?.ping(hex, color);
  }

  focusOn(x: number, z: number, distance?: number): void {
    this.cam.focus(x, z, distance);
  }

  focusHex(hex: number, distance?: number): void {
    const g = this.ctx?.grid;
    if (!g || hex < 0 || hex >= g.count) return;
    this.cam.focus(g.cx[hex], g.cz[hex], distance);
  }

  getCameraTarget(): { x: number; z: number; distance: number } {
    return { x: this.cam.x, z: this.cam.z, distance: this.cam.dist };
  }

  getViewFootprint(): { x: number; z: number }[] {
    const out: { x: number; z: number }[] = [];
    const cam = this.cam.camera;
    const y = this.cam.y;
    for (const [nx, ny] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const v = this.tmpV.set(nx, ny, 0.5).unproject(cam).sub(cam.position).normalize();
      let t: number;
      if (v.y < -1e-4) t = (y - cam.position.y) / v.y;
      else t = cam.far;
      t = Math.min(t, this.cam.dist * 12);
      out.push({ x: cam.position.x + v.x * t, z: cam.position.z + v.z * t });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Picking
  // ---------------------------------------------------------------------------
  private ndc(clientX: number, clientY: number): THREE.Vector2 {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  }

  /** Terrain / water intersection of the ray through a client position. */
  pickWorld(clientX: number, clientY: number): THREE.Vector3 | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    this.raycaster.setFromCamera(this.ndc(clientX, clientY), this.cam.camera);
    const o = this.raycaster.ray.origin, d = this.raycaster.ray.direction;
    const t = ctx.hf.raycast(o.x, o.y, o.z, d.x, d.y, d.z, this.cam.camera.far);
    if (t < 0) return null;
    return new THREE.Vector3(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t);
  }

  /** Cheap ground-plane intersection at the target height (for panning/zooming). */
  groundAt(clientX: number, clientY: number): { x: number; z: number } | null {
    this.raycaster.setFromCamera(this.ndc(clientX, clientY), this.cam.camera);
    const o = this.raycaster.ray.origin, d = this.raycaster.ray.direction;
    if (d.y > -1e-4) return null;
    const t = (this.cam.y - o.y) / d.y;
    return { x: o.x + d.x * t, z: o.z + d.z * t };
  }

  pickHex(clientX: number, clientY: number): number {
    const p = this.pickWorld(clientX, clientY);
    if (!p || !this.ctx) return -1;
    return this.ctx.grid.fromWorld(p.x, p.z);
  }

  pickUnit(clientX: number, clientY: number): number {
    if (!this.units || !this.settings.units) return -1;
    const r = this.canvas.getBoundingClientRect();
    return this.units.pick(clientX - r.left, clientY - r.top, this.cam.camera, r.width, r.height);
  }

  unitsInScreenRect(x0: number, y0: number, x1: number, y1: number, nation: number): number[] {
    if (!this.units) return [];
    const r = this.canvas.getBoundingClientRect();
    return this.units.inRect(Math.min(x0, x1) - r.left, Math.min(y0, y1) - r.top, Math.max(x0, x1) - r.left, Math.max(y0, y1) - r.top, nation, this.cam.camera, r.width, r.height);
  }

  worldToScreen(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const v = this.tmpV.set(x, y, z).project(this.cam.camera);
    const r = this.canvas.getBoundingClientRect();
    const visible = v.z > -1 && v.z < 1 && v.x >= -1 && v.x <= 1 && v.y >= -1 && v.y <= 1;
    return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height, visible };
  }

  onClick(cb: (e: MapClick) => void): void {
    this.clickCbs.push(cb);
  }

  onHover(cb: (hex: number, unitId: number, clientX: number, clientY: number) => void): void {
    this.hoverCbs.push(cb);
  }

  onBoxSelect(cb: (x0: number, y0: number, x1: number, y1: number, shift: boolean) => void): void {
    this.boxCbs.push(cb);
  }

  private dispatchClick(button: 0 | 2, x: number, y: number, shift: boolean, ctrl: boolean, dbl: boolean): void {
    const p = this.pickWorld(x, y);
    const hex = p && this.ctx ? this.ctx.grid.fromWorld(p.x, p.z) : -1;
    const unitId = this.pickUnit(x, y);
    const e: MapClick = { button, hex, unitId, worldX: p?.x ?? NaN, worldZ: p?.z ?? NaN, clientX: x, clientY: y, shift, ctrl, double: dbl };
    for (const cb of this.clickCbs) cb(e);
  }

  private dispatchHover(x: number, y: number): void {
    if (!this.hoverCbs.length) return;
    const hex = this.pickHex(x, y);
    const unitId = this.pickUnit(x, y);
    for (const cb of this.hoverCbs) cb(hex, unitId, x, y);
  }

  /** Dev/test helper: build everything pending for the current view synchronously. */
  settle(maxMs = 20000): void {
    if (!this.ctx) return;
    const t0 = performance.now();
    this.cam.update(10);
    for (let i = 0; i < 400 && performance.now() - t0 < maxMs; i++) {
      this.terrain!.update(this.cam.camera, 1000);
      const vb = this.vegetation?.update(this.cam.camera, this.cam, QUALITY[this.settings.quality].trees, sunFromHour(this.game ? this.game.state.hour : this.previewHour).dayOfYear, 1000) ?? true;
      const cb = this.cities?.update(this.cam.camera, this.cam, 1000) ?? true;
      if (this.terrain!.idle && vb && cb) break;
    }
  }

  dispose(): void {
    this.unsub?.();
    this.input.dispose();
    this.ro.disconnect();
    this.disposeWorld();
    this.gl.dispose();
    this.canvas.remove();
  }
}

export function createRenderer(container: HTMLElement): MapRenderer {
  return new Renderer(container);
}
