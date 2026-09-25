/** Tiny helpers for writing FlagSpecs compactly (see src/ui/flags.ts for layout semantics). */
import type { FlagEmblem, FlagLayout, FlagSpec } from '../worldgen/types';

type Em = FlagEmblem[];

export function e(shape: FlagEmblem['shape'], color: string, x: number, y: number, size: number, count?: number): FlagEmblem {
  return count === undefined ? { shape, color, x, y, size } : { shape, color, x, y, size, count };
}

interface Opts {
  r?: number[]; // ratios
  a?: string; // accent
  e?: Em; // emblems
  asp?: number; // aspect
}

export function F(layout: FlagLayout, colors: string[], o: Opts = {}): FlagSpec {
  const s: FlagSpec = { layout, colors };
  if (o.r) s.ratios = o.r;
  if (o.a) s.accent = o.a;
  if (o.e && o.e.length) s.emblems = o.e;
  if (o.asp) s.aspect = o.asp;
  return s;
}

/** plain */
export const P = (c: string, em?: Em, asp?: number): FlagSpec => F('plain', [c], { e: em, asp });
/** horizontal stripes */
export const H = (colors: string[], em?: Em, r?: number[], asp?: number): FlagSpec => F('hstripes', colors, { e: em, r, asp });
/** vertical stripes */
export const V = (colors: string[], em?: Em, r?: number[], asp?: number): FlagSpec => F('vstripes', colors, { e: em, r, asp });
/** nordic cross */
export const N = (bg: string, cross: string, inner?: string, asp?: number): FlagSpec =>
  F('nordic', inner ? [bg, cross, inner] : [bg, cross], { asp });
/** hoist triangle over horizontal stripes */
export const T = (colors: string[], accent: string, em?: Em, r?: number[], asp?: number): FlagSpec =>
  F('triangle', colors, { a: accent, e: em, r, asp });

/** n alternating stripes a/b starting with a */
export function alt(a: string, b: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(i % 2 ? b : a);
  return out;
}
export const ones = (n: number): number[] => new Array<number>(n).fill(1);

/** Hexagram (Star of David style) built from triangle emblems. */
export function hexagram(color: string, bg: string, x: number, y: number, size: number): Em {
  return [
    e('triangle', color, x, y, size),
    e('triangle', color, x, y, size, -3),
    e('triangle', bg, x, y, size * 0.72),
    e('triangle', bg, x, y, size * 0.72, -3),
  ];
}
