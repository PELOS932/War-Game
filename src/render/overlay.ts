import * as THREE from 'three';
import type { HexGrid } from '../core/hex';
import type { GameAPI } from '../sim/api';
import { Terrain, WorldData } from '../worldgen/types';
import { MapMode } from './api';

const PALETTE_SIZE = 1024;

const TERRAIN_COLORS: Record<number, [number, number, number]> = {
  [Terrain.DeepOcean]: [18, 40, 90],
  [Terrain.Coastal]: [40, 90, 160],
  [Terrain.Lake]: [60, 120, 190],
  [Terrain.Plains]: [170, 200, 110],
  [Terrain.Farmland]: [220, 210, 90],
  [Terrain.Forest]: [40, 120, 50],
  [Terrain.Jungle]: [20, 90, 40],
  [Terrain.Hills]: [170, 140, 90],
  [Terrain.Mountains]: [130, 105, 90],
  [Terrain.Desert]: [235, 205, 140],
  [Terrain.Tundra]: [160, 175, 170],
  [Terrain.Marsh]: [90, 140, 120],
  [Terrain.Ice]: [240, 245, 255],
  [Terrain.Urban]: [200, 60, 60],
};

/**
 * Hex-resolution overlay data shared by the terrain and water shaders:
 * owner/core textures, a per-owner palette recoloured by map mode, heat maps,
 * highlights. Owner updates are incremental (ownerDirty).
 */
export class Overlay {
  readonly cols: number;
  readonly rows: number;
  readonly ownerTex: THREE.DataTexture;
  readonly infoTex: THREE.DataTexture;
  readonly paletteTex: THREE.DataTexture;
  readonly rampTex: THREE.DataTexture;
  private ownerData: Uint8Array;
  private infoData: Uint8Array;
  private paletteData: Uint8Array;
  private rampData: Uint8Array;
  private world: WorldData;
  private grid: HexGrid;
  private game: GameAPI | null = null;
  private highlighted: number[] = [];
  mode: MapMode = MapMode.Political;
  private lastOwnerVersion = -1;
  private heatTimer = 0;
  private paletteTimer = 0;
  readonly uniforms: {
    uHexOwner: { value: THREE.DataTexture };
    uHexInfo: { value: THREE.DataTexture };
    uPalette: { value: THREE.DataTexture };
    uRamp: { value: THREE.DataTexture };
    uGridSize: { value: THREE.Vector2 };
    uMapMode: { value: number };
    uHighlightColor: { value: THREE.Color };
    uHexGridOn: { value: number };
    uOverlayAlpha: { value: number };
  };

  constructor(world: WorldData, grid: HexGrid) {
    this.world = world;
    this.grid = grid;
    this.cols = grid.cols;
    this.rows = grid.rows;
    const n = grid.count;
    this.ownerData = new Uint8Array(n * 4);
    this.infoData = new Uint8Array(n * 4);
    this.paletteData = new Uint8Array(PALETTE_SIZE * 4);
    this.rampData = new Uint8Array(256 * 4);
    const mk = (d: Uint8Array, w: number, h: number) => {
      const t = new THREE.DataTexture(d, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.needsUpdate = true;
      return t;
    };
    this.ownerTex = mk(this.ownerData, this.cols, this.rows);
    this.infoTex = mk(this.infoData, this.cols, this.rows);
    this.paletteTex = mk(this.paletteData, PALETTE_SIZE, 1);
    this.rampTex = mk(this.rampData, 256, 1);
    for (let i = 0; i < n; i++) this.infoData[i * 4 + 2] = world.hexTerrain[i];
    this.setOwners(world.hexOwner, world.hexOwner);
    this.uniforms = {
      uHexOwner: { value: this.ownerTex },
      uHexInfo: { value: this.infoTex },
      uPalette: { value: this.paletteTex },
      uRamp: { value: this.rampTex },
      uGridSize: { value: new THREE.Vector2(this.cols, this.rows) },
      uMapMode: { value: 1 },
      uHighlightColor: { value: new THREE.Color('#ffd84a') },
      uHexGridOn: { value: 1 },
      uOverlayAlpha: { value: 1 },
    };
    this.setMode(MapMode.Political);
  }

  attachGame(game: GameAPI): void {
    this.game = game;
    const s = game.state;
    this.setOwners(s.hexOwner, s.hexCore);
    this.lastOwnerVersion = s.ownerVersion;
    s.ownerDirty.length = 0;
    this.setMode(this.mode);
  }

  setOwners(owner: Uint16Array, core: Uint16Array): void {
    const d = this.ownerData;
    for (let i = 0; i < owner.length; i++) {
      d[i * 4] = owner[i] & 255;
      d[i * 4 + 1] = owner[i] >> 8;
      d[i * 4 + 2] = core[i] & 255;
      d[i * 4 + 3] = core[i] >> 8;
    }
    this.ownerTex.needsUpdate = true;
  }

  /** Returns true if ownership changed this frame. */
  update(dt: number): boolean {
    let changed = false;
    const g = this.game;
    if (g) {
      const s = g.state;
      if (s.ownerVersion !== this.lastOwnerVersion) {
        const d = this.ownerData;
        if (s.ownerDirty.length > 0 && s.ownerDirty.length < s.hexOwner.length / 4) {
          for (const i of s.ownerDirty) {
            d[i * 4] = s.hexOwner[i] & 255;
            d[i * 4 + 1] = s.hexOwner[i] >> 8;
            d[i * 4 + 2] = s.hexCore[i] & 255;
            d[i * 4 + 3] = s.hexCore[i] >> 8;
          }
          this.ownerTex.needsUpdate = true;
        } else {
          this.setOwners(s.hexOwner, s.hexCore);
        }
        s.ownerDirty.length = 0;
        this.lastOwnerVersion = s.ownerVersion;
        changed = true;
      }
      // Relation-dependent palettes & supply heat change over time.
      this.paletteTimer += dt;
      if (this.paletteTimer > 1.5 && (this.mode === MapMode.Diplomatic || this.mode === MapMode.Alliances || this.mode === MapMode.Political)) {
        this.paletteTimer = 0;
        this.buildPalette();
      }
      this.heatTimer += dt;
      if (this.heatTimer > 3 && (this.mode === MapMode.Supply || (changed && this.mode === MapMode.Population))) {
        this.heatTimer = 0;
        this.buildHeat();
      }
    }
    return changed;
  }

  setMode(mode: MapMode): void {
    this.mode = mode;
    this.buildPalette();
    this.buildHeat();
    let m = 1;
    if (mode === MapMode.Terrain) m = 0;
    else if (mode === MapMode.Supply || mode === MapMode.Population || mode === MapMode.Resources || mode === MapMode.Terrain2) m = 2;
    if (this.uniforms) this.uniforms.uMapMode.value = m;
  }

  private nationColor(i: number): [number, number, number] {
    const g = this.game;
    const c = g ? g.state.nations[i]?.color : this.world.nations[i]?.color;
    return c ?? [128, 128, 128];
  }

  private buildPalette(): void {
    const p = this.paletteData;
    const g = this.game;
    const nNations = g ? g.state.nations.length : this.world.nations.length;
    const player = g ? g.state.playerNation : -1;
    p.fill(0);
    for (let i = 0; i < Math.min(nNations, PALETTE_SIZE - 1); i++) {
      let c = this.nationColor(i);
      if (this.mode === MapMode.Diplomatic && g && player >= 0) {
        if (i === player) c = [70, 150, 255];
        else if (g.atWar(player, i)) c = [225, 30, 25];
        else {
          const allied = g.hasTreaty(player, i, 'alliance') || g.hasTreaty(player, i, 'defensePact');
          if (allied) c = [40, 200, 70];
          else {
            const r = g.relation(player, i) / 100;
            c = r >= 0
              ? mixc([210, 200, 120], [90, 200, 90], r)
              : mixc([210, 200, 120], [235, 110, 40], -r);
          }
        }
      } else if (this.mode === MapMode.Alliances) {
        const blocs = g ? g.state.nations[i]?.blocs : this.world.nations[i]?.blocs;
        const b = blocs && blocs.length ? this.world.blocs[blocs[0]] : undefined;
        c = b ? hexToRgb(b.color) : [150, 150, 150];
      }
      p[(i + 1) * 4] = c[0];
      p[(i + 1) * 4 + 1] = c[1];
      p[(i + 1) * 4 + 2] = c[2];
      p[(i + 1) * 4 + 3] = 255;
    }
    this.paletteTex.needsUpdate = true;
  }

  private buildHeat(): void {
    const info = this.infoData;
    const ramp = this.rampData;
    const n = this.grid.count;
    ramp.fill(0);
    for (let i = 0; i < n; i++) info[i * 4] = 0;
    const w = this.world;
    const g = this.game;
    switch (this.mode) {
      case MapMode.Population: {
        const scale = 255 / Math.log10(1 + 40000);
        for (let i = 0; i < n; i++) {
          const pop = w.hexPopulation[i];
          if (pop > 0.05 && w.hexTerrain[i] > Terrain.Lake) info[i * 4] = Math.max(1, Math.min(255, Math.round(Math.log10(1 + pop) * scale)));
        }
        for (let v = 1; v < 256; v++) setRamp(ramp, v, heatColor(v / 255), 0.8);
        break;
      }
      case MapMode.Supply: {
        const player = g ? g.state.playerNation : -1;
        if (g && player >= 0) {
          const owner = g.state.hexOwner;
          for (let i = 0; i < n; i++) {
            if (owner[i] !== player + 1) {
              let adj = false;
              for (let d = 0; d < 6 && !adj; d++) {
                const m = this.grid.neighbours[i * 6 + d];
                if (m >= 0 && owner[m] === player + 1) adj = true;
              }
              if (!adj) continue;
            }
            const s = g.supplyAt(player, i);
            info[i * 4] = Math.max(1, Math.min(255, Math.round(s * 2.55)));
          }
        }
        for (let v = 1; v < 256; v++) {
          const t = v / 255;
          const c = t < 0.5 ? mixc([220, 40, 30], [240, 210, 50], t * 2) : mixc([240, 210, 50], [50, 200, 70], (t - 0.5) * 2);
          setRamp(ramp, v, c, 0.6);
        }
        break;
      }
      case MapMode.Resources: {
        const cols: Record<number, [number, number, number]> = {
          1: [40, 30, 20], 2: [110, 110, 120], 3: [190, 90, 50], 4: [90, 240, 60], 5: [40, 170, 230],
        };
        for (let i = 0; i < n; i++) {
          const d = w.hexDeposit[i];
          if (!d) continue;
          const sz = Math.min(39, Math.round(Math.min(1, w.hexDepositSize[i]) * 39));
          info[i * 4] = d * 40 + sz;
        }
        for (let t = 1; t <= 5; t++) {
          for (let s = 0; s < 40; s++) {
            const k = 0.55 + 0.45 * (s / 39);
            const c = cols[t];
            setRamp(ramp, t * 40 + s, [c[0] * k + 40 * (1 - k), c[1] * k + 40 * (1 - k), c[2] * k + 40 * (1 - k)], 0.55 + 0.35 * (s / 39));
          }
        }
        break;
      }
      case MapMode.Terrain2: {
        for (let i = 0; i < n; i++) info[i * 4] = w.hexTerrain[i] + 1;
        for (const [k, c] of Object.entries(TERRAIN_COLORS)) setRamp(ramp, Number(k) + 1, c, 0.62);
        break;
      }
      default:
        break;
    }
    this.infoTex.needsUpdate = true;
    this.rampTex.needsUpdate = true;
  }

  setHighlight(hexes: number[], color: string): void {
    const info = this.infoData;
    for (const h of this.highlighted) info[h * 4 + 1] = 0;
    this.highlighted = hexes.filter((h) => h >= 0 && h < this.grid.count);
    for (const h of this.highlighted) info[h * 4 + 1] = 255;
    this.uniforms.uHighlightColor.value.set(color);
    this.infoTex.needsUpdate = true;
  }

  ownerAt(hex: number): number {
    return this.ownerData[hex * 4] | (this.ownerData[hex * 4 + 1] << 8);
  }
}

function mixc(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function setRamp(r: Uint8Array, i: number, c: [number, number, number], a: number): void {
  r[i * 4] = c[0]; r[i * 4 + 1] = c[1]; r[i * 4 + 2] = c[2]; r[i * 4 + 3] = Math.round(a * 255);
}

function heatColor(t: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0, [40, 20, 90]], [0.35, [150, 30, 120]], [0.6, [230, 70, 50]], [0.8, [250, 170, 40]], [1, [255, 250, 190]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const a = stops[i - 1], b = stops[i];
      return mixc(a[1], b[1], (t - a[0]) / (b[0] - a[0]));
    }
  }
  return stops[stops.length - 1][1];
}

export function hexToRgb(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
}

/**
 * GLSL: political/heat overlay, borders, hex grid, highlight, occupation
 * hatching. Requires HEX_GLSL. `applyOverlay` returns emissive boost for
 * borders/highlights so they stay readable at night.
 */
export const OVERLAY_GLSL = /* glsl */ `
uniform sampler2D uHexOwner;
uniform sampler2D uHexInfo;
uniform sampler2D uPalette;
uniform sampler2D uRamp;
uniform vec2 uGridSize;
uniform int uMapMode;
uniform vec3 uHighlightColor;
uniform float uHexGridOn;
uniform float uOverlayAlpha;

int ownerOfTexel(vec4 t) { return int(t.r * 255.0 + 0.5) + int(t.g * 255.0 + 0.5) * 256; }
int coreOfTexel(vec4 t) { return int(t.b * 255.0 + 0.5) + int(t.a * 255.0 + 0.5) * 256; }
bool inGrid(ivec2 o) { return o.x >= 0 && o.y >= 0 && o.x < int(uGridSize.x) && o.y < int(uGridSize.y); }

// col: surface albedo (linear). Returns emissive addition.
vec3 applyOverlay(inout vec3 col, vec3 wp, float pix, bool water) {
  ivec2 ax = hexAxial(wp.xz);
  ivec2 off = axialToOffset(ax);
  if (!inGrid(off)) return vec3(0.0);
  vec4 ot = texelFetch(uHexOwner, off, 0);
  vec4 it = texelFetch(uHexInfo, off, 0);
  int owner = ownerOfTexel(ot);
  int core = coreOfTexel(ot);
  bool hexWater = it.b * 255.0 < 2.5;
  vec2 local = wp.xz - axialCenter(ax);
  float bw = max(pix * 1.3, 0.018);      // dark border line half-width (world units)
  float glow = max(pix * 7.0, 0.12);     // inner colour glow width
  float border = 0.0;
  float borderGlow = 0.0;
  float edgeMin = 10.0;
  float hlEdge = 0.0;
  bool hl = it.g > 0.5;
  for (int d = 0; d < 6; d++) {
    float ed = 0.8660254 - dot(local, HEX_NORMALS[d]);
    edgeMin = min(edgeMin, ed);
    if (ed > glow * 1.2 && ed > bw * 2.5) continue;
    ivec2 nax = ax + HEX_DIRS[d];
    ivec2 noff = axialToOffset(nax);
    if (!inGrid(noff)) continue;
    vec4 nt = texelFetch(uHexOwner, noff, 0);
    int nOwner = ownerOfTexel(nt);
    vec4 ni = texelFetch(uHexInfo, noff, 0);
    bool nWater = ni.b * 255.0 < 2.5;
    if (nOwner != owner && !(owner == 0 && hexWater) && !(nOwner == 0 && nWater)) {
      border = max(border, 1.0 - smoothstep(bw * 0.6, bw * 1.6, ed));
      borderGlow = max(borderGlow, 1.0 - smoothstep(0.0, glow, ed));
    }
    if (hl && ni.g < 0.5) hlEdge = max(hlEdge, 1.0 - smoothstep(bw * 0.8, bw * 2.2, ed));
  }
  vec3 emis = vec3(0.0);
  float farT = smoothstep(4.0, 120.0, uCamDist);
  vec3 pc = owner > 0 ? texelFetch(uPalette, ivec2(owner, 0), 0).rgb : vec3(0.0);
  pc = pow(pc, vec3(2.2));
  if (uMapMode == 1 && owner > 0 && !water) {
    float a = mix(0.0, 0.4, smoothstep(1.2, 70.0, uCamDist)) * uOverlayAlpha;
    col = mix(col, pc * 0.9 + col * 0.25, a);
    // Occupied territory: diagonal hatching in the original owner's colour.
    if (core != owner && core > 0) {
      vec3 cc = pow(texelFetch(uPalette, ivec2(core, 0), 0).rgb, vec3(2.2));
      float per = max(pix * 9.0, 0.06);
      float s = step(0.5, fract((wp.x + wp.z) / per));
      col = mix(col, cc, s * 0.45 * uOverlayAlpha);
    }
  } else if (uMapMode == 2) {
    int v = int(it.r * 255.0 + 0.5);
    if (v > 0) {
      vec4 rc = texelFetch(uRamp, ivec2(v, 0), 0);
      col = mix(col, pow(rc.rgb, vec3(2.2)), rc.a * uOverlayAlpha);
    }
  }
  if (owner > 0 && !water) {
    // Borders: nation-coloured inner glow + dark crisp line.
    vec3 gc = uMapMode == 0 ? vec3(1.0, 0.92, 0.6) : pc;
    col = mix(col, gc * 1.1, borderGlow * borderGlow * mix(0.35, 0.55, farT) * uOverlayAlpha);
    emis += gc * borderGlow * borderGlow * 0.05;
  }
  col = mix(col, vec3(0.02, 0.02, 0.03), border * 0.85 * uOverlayAlpha);
  // Hex grid (zoomed in).
  float gridA = uHexGridOn * (1.0 - smoothstep(6.0, 22.0, uCamDist)) * (water ? 0.16 : 0.2);
  if (gridA > 0.0) {
    float gl = 1.0 - smoothstep(pix * 0.5, pix * 1.5 + 0.004, edgeMin);
    col = mix(col, water ? vec3(0.6, 0.75, 0.85) : vec3(0.05), gl * gridA);
  }
  if (hl) {
    col = mix(col, pow(uHighlightColor, vec3(2.2)), 0.28);
    col = mix(col, pow(uHighlightColor, vec3(2.2)), hlEdge * 0.9);
    emis += pow(uHighlightColor, vec3(2.2)) * (0.05 + hlEdge * 0.25);
  }
  return emis;
}
`;
