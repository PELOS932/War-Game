import * as THREE from 'three';
import { Biome, WorldData } from '../worldgen/types';
import type { LandUse } from './landuse';

export interface WorldTextures {
  /** R16F elevation in metres (sea floor negative). */
  height: THREE.DataTexture;
  /** sRGB surface colour + forest density in alpha. */
  albedo: THREE.DataTexture;
  /** r = temperature, g = precipitation, b = continentality, a = river mask. */
  climate: THREE.DataTexture;
  /** r = urban, g = farmland, b = ocean mask, a = night lights. */
  land: THREE.DataTexture;
}

export function createWorldTextures(world: WorldData, lu: LandUse): WorldTextures {
  const w = world.hw, h = world.hh, n = w * h;

  const hdata = new Uint16Array(n);
  for (let i = 0; i < n; i++) hdata[i] = THREE.DataUtils.toHalfFloat(world.elevation[i]);
  const height = new THREE.DataTexture(hdata, w, h, THREE.RedFormat, THREE.HalfFloatType);
  height.magFilter = THREE.LinearFilter;
  height.minFilter = THREE.LinearFilter;
  height.wrapS = height.wrapT = THREE.ClampToEdgeWrapping;
  height.needsUpdate = true;

  // Albedo: dilate land colours into water cells so bilinear filtering along
  // coasts doesn't bleed the placeholder ocean colour onto beaches.
  const alb = new Uint8Array(world.albedo);
  const isWater = new Uint8Array(n);
  for (let i = 0; i < n; i++) isWater[i] = world.biome[i] === Biome.Ocean || world.biome[i] === Biome.Lake ? 1 : 0;
  const filled = new Uint8Array(n);
  for (let i = 0; i < n; i++) filled[i] = isWater[i] ? 0 : 1;
  for (let pass = 0; pass < 3; pass++) {
    const next: number[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (filled[i]) continue;
        let r = 0, g = 0, b = 0, c = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (!filled[j]) continue;
          r += alb[j * 4]; g += alb[j * 4 + 1]; b += alb[j * 4 + 2]; c++;
        }
        if (c) {
          alb[i * 4] = r / c; alb[i * 4 + 1] = g / c; alb[i * 4 + 2] = b / c; alb[i * 4 + 3] = 0;
          next.push(i);
        }
      }
    }
    for (const i of next) filled[i] = 1;
  }
  for (let i = 0; i < n; i++) {
    if (filled[i]) continue;
    // Sea floor sediment colour (seen through shallow water).
    alb[i * 4] = 150; alb[i * 4 + 1] = 142; alb[i * 4 + 2] = 112; alb[i * 4 + 3] = 0;
  }
  const albedo = new THREE.DataTexture(alb, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.magFilter = THREE.LinearFilter;
  albedo.minFilter = THREE.LinearMipmapLinearFilter;
  albedo.generateMipmaps = true;
  albedo.anisotropy = 4;
  albedo.wrapS = albedo.wrapT = THREE.ClampToEdgeWrapping;
  albedo.needsUpdate = true;

  const climate = new THREE.DataTexture(new Uint8Array(world.climateTex), w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  climate.magFilter = THREE.LinearFilter;
  climate.minFilter = THREE.LinearFilter;
  climate.needsUpdate = true;

  const ld = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    ld[i * 4] = Math.round(Math.min(1, lu.urban[i]) * 255);
    ld[i * 4 + 1] = Math.round(Math.min(1, lu.farm[i]) * 255);
    ld[i * 4 + 2] = world.biome[i] === Biome.Ocean ? 255 : 0;
    ld[i * 4 + 3] = Math.round(Math.min(1, lu.lights[i]) * 255);
  }
  const land = new THREE.DataTexture(ld, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  land.magFilter = THREE.LinearFilter;
  land.minFilter = THREE.LinearMipmapLinearFilter;
  land.generateMipmaps = true;
  land.needsUpdate = true;

  return { height, albedo, climate, land };
}
