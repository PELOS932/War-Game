import * as THREE from 'three';
import { UnitCategory } from '../../sim/types';
import { natoSymbol, type Affiliation } from '../../ui/icons';
import { paintFlag } from './flagdraw';
import type { FlagSpec } from '../../worldgen/types';

/**
 * Texture atlas for unit counters: one flag cell per nation, one NATO symbol
 * cell per (category, affiliation), digits for stack counts.
 */
export const ATLAS_W = 2048, ATLAS_H = 1536;
export const FLAG_W = 64, FLAG_H = 42, FLAG_COLS = 32;
export const SYM_W = 96, SYM_H = 72, SYM_COLS = 20, SYM_Y0 = 640;
export const DIGIT_W = 32, DIGIT_H = 44, DIGIT_Y0 = 1400;
export const AFFS: Affiliation[] = ['friend', 'ally', 'neutral', 'hostile'];
export const CATEGORY_COUNT = 24;

export class BadgeAtlas {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private pending = 0;

  constructor(flags: FlagSpec[]) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = ATLAS_W;
    this.canvas.height = ATLAS_H;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.drawFlags(flags);
    this.drawDigits();
    this.drawSymbols();
  }

  private drawFlags(flags: FlagSpec[]): void {
    const c = this.ctx;
    flags.forEach((f, i) => {
      const x = (i % FLAG_COLS) * FLAG_W, y = Math.floor(i / FLAG_COLS) * FLAG_H;
      c.save();
      c.beginPath();
      c.rect(x + 1, y + 1, FLAG_W - 2, FLAG_H - 2);
      c.clip();
      try {
        paintFlag(c, f, x + 1, y + 1, FLAG_W - 2, FLAG_H - 2);
      } catch {
        c.fillStyle = '#888';
        c.fillRect(x, y, FLAG_W, FLAG_H);
      }
      c.restore();
    });
  }

  private drawDigits(): void {
    const c = this.ctx;
    c.font = `bold ${DIGIT_H - 8}px Arial, Helvetica, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const glyphs = '0123456789+';
    for (let i = 0; i < glyphs.length; i++) {
      const x = i * DIGIT_W, y = DIGIT_Y0;
      c.fillStyle = '#fff';
      c.fillText(glyphs[i], x + DIGIT_W / 2, y + DIGIT_H / 2 + 2);
    }
  }

  private drawSymbols(): void {
    for (let a = 0; a < AFFS.length; a++) {
      for (let cat = 0; cat < CATEGORY_COUNT; cat++) {
        const cell = a * CATEGORY_COUNT + cat;
        const x = (cell % SYM_COLS) * SYM_W, y = SYM_Y0 + Math.floor(cell / SYM_COLS) * SYM_H;
        let svg = natoSymbol(cat as UnitCategory, AFFS[a], SYM_W);
        svg = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
        const img = new Image();
        this.pending++;
        img.onload = () => {
          this.ctx.drawImage(img, x, y, SYM_W, SYM_H);
          this.pending--;
          this.texture.needsUpdate = true;
        };
        img.onerror = () => { this.pending--; };
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      }
    }
  }
}

export function flagCell(nation: number): [number, number] {
  return [(nation % FLAG_COLS) * FLAG_W, Math.floor(nation / FLAG_COLS) * FLAG_H];
}

export function symbolCell(cat: number, aff: number): [number, number] {
  const cell = aff * CATEGORY_COUNT + cat;
  return [(cell % SYM_COLS) * SYM_W, SYM_Y0 + Math.floor(cell / SYM_COLS) * SYM_H];
}
