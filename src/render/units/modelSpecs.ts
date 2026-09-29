import { UnitCategory, type UnitDesign } from '../../sim/types';
import type { AirSpec, CarrierSpec, HeliSpec, ModelSpec, P2, ShipSpec, SoldierSpec, SubSpec, TowedSpec, Turret, VehSpec } from './designModels';

/**
 * Model parameters per design: a hand-authored table for iconic equipment
 * (family presets + per-design tweaks) and a deterministic derivation from
 * category / year / origin / stats / description for everything else.
 */

export interface DesignVisual {
  main: ModelSpec;
  /** Secondary vehicle in the formation (radar, prime mover, transport…). */
  extra?: ModelSpec;
  /** Formation override (offsets in unit sizes) and member scale multiplier. */
  members?: [number, number][];
  scale?: number;
}

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
class Rng {
  private s: number;
  constructor(seed: string) { this.s = hash(seed) || 1; }
  next(): number {
    this.s ^= this.s << 13; this.s >>>= 0;
    this.s ^= this.s >>> 17;
    this.s ^= this.s << 5; this.s >>>= 0;
    return (this.s % 100000) / 100000;
  }
  r(a: number, b: number): number { return a + (b - a) * this.next(); }
  /** Multiply by a factor in [1 - v, 1 + v]. */
  v(x: number, v = 0.05): number { return x * this.r(1 - v, 1 + v); }
  pick<T>(a: T[]): T { return a[Math.floor(this.next() * a.length) % a.length]; }
  chance(p: number): boolean { return this.next() < p; }
}

type Style = 'us' | 'weu' | 'ru' | 'cn' | 'as' | 'il' | 'mid' | 'oth';
const STYLE_OF: Record<string, Style> = {};
for (const c of ['USA', 'CAN', 'AUS', 'MEX', 'COL', 'CHL', 'PER', 'ECU', 'VEN', 'CUB']) STYLE_OF[c] = 'us';
for (const c of ['DEU', 'FRA', 'GBR', 'ITA', 'ESP', 'SWE', 'NOR', 'FIN', 'DNK', 'NLD', 'BEL', 'CHE', 'AUT', 'POL', 'CZE', 'SVK', 'PRT', 'GRC', 'TUR', 'ROU', 'HRV', 'IRL', 'LUX', 'HUN', 'SVN', 'BRA', 'ARG', 'ZAF', 'EST', 'LVA', 'LTU', 'MLT', 'CYP', 'ALB', 'MKD', 'MNE', 'BIH', 'KOS', 'BGR']) STYLE_OF[c] = 'weu';
for (const c of ['RUS', 'UKR', 'BLR', 'SRB', 'GEO', 'MDA', 'KAZ', 'PRK', 'IND']) STYLE_OF[c] = 'ru';
for (const c of ['CHN', 'PAK']) STYLE_OF[c] = 'cn';
for (const c of ['JPN', 'KOR', 'TWN', 'SGP', 'IDN', 'MYS']) STYLE_OF[c] = 'as';
STYLE_OF.ISR = 'il';
for (const c of ['IRN', 'EGY', 'ARE', 'SAU', 'YEM']) STYLE_OF[c] = 'mid';
const styleOf = (o?: string): Style => (o && STYLE_OF[o]) || 'oth';

const has = (d: UnitDesign, re: RegExp) => re.test(d.name) || re.test(d.description);
function axlesOf(d: UnitDesign): number | null {
  const m = /\b(\d{1,2})\s?[x×]\s?(\d{1,2})\b/.exec(d.description) ?? /\b(\d{1,2})\s?[x×]\s?(\d{1,2})\b/.exec(d.name);
  if (!m) return null;
  const n = Math.round(Number(m[1]) / 2);
  return n >= 2 && n <= 8 ? n : null;
}

const T = <K extends keyof Turret>(t: Turret, o: Pick<Partial<Turret>, K>): Turret => ({ ...t, ...o });
function V(base: VehSpec, o: Partial<VehSpec> = {}, t?: Partial<Turret>): VehSpec {
  const r: VehSpec = { ...base, ...o };
  if (t && r.tur) r.tur = { ...r.tur, ...t };
  if (o.add && base.add) r.add = [...new Set([...base.add, ...o.add])];
  return r;
}
const A = (base: AirSpec, o: Partial<AirSpec> = {}): AirSpec => ({ ...base, ...o });
const H = (base: HeliSpec, o: Partial<HeliSpec> = {}): HeliSpec => ({ ...base, ...o });
const S = (base: ShipSpec, o: Partial<ShipSpec> = {}): ShipSpec => ({ ...base, ...o });
const CV = (base: CarrierSpec, o: Partial<CarrierSpec> = {}): CarrierSpec => ({ ...base, ...o });
const SB = (base: SubSpec, o: Partial<SubSpec> = {}): SubSpec => ({ ...base, ...o });

// ===========================================================================
// Land presets
// ===========================================================================
const ABRAMS: VehSpec = { g: 'veh', ch: 'tracked', L: 1, W: 0.57, H: 0.2, n: 7, skirt: 1, nose: 'glacis', nl: 0.3, tur: { t: 'ang', w: 0.5, l: 0.5, h: 0.085, nose: 0.42, taper: 0.04, bustle: 0.34, gun: 0.56, gr: 0.02, x: -0.03 } };
const LEO2A4: VehSpec = { g: 'veh', ch: 'tracked', L: 1, W: 0.56, H: 0.2, n: 7, skirt: 1, nose: 'glacis', nl: 0.22, tur: { t: 'ang', w: 0.44, l: 0.44, h: 0.12, nose: 0.06, taper: 0.03, bustle: 0.22, gun: 0.6, gr: 0.02, x: -0.04 } };
const LEO2A6: VehSpec = V(LEO2A4, {}, { wedge: true, gun: 0.68 });
const LEO1: VehSpec = { g: 'veh', ch: 'tracked', L: 0.98, W: 0.52, H: 0.2, n: 7, skirt: 1, nose: 'glacis', nl: 0.26, tur: { t: 'ang', w: 0.42, l: 0.44, h: 0.13, nose: 0.5, taper: 0.22, bustle: 0.12, gun: 0.55, gr: 0.018, fume: true, x: -0.02 } };
const CHALLENGER: VehSpec = { g: 'veh', ch: 'tracked', L: 1.02, W: 0.56, H: 0.2, n: 6, skirt: 1, nose: 'glacis', nl: 0.2, tur: { t: 'ang', w: 0.44, l: 0.5, h: 0.11, nose: 0.14, taper: 0.2, bustle: 0.24, gun: 0.58, gr: 0.02, fume: true, x: -0.04 } };
const LECLERC: VehSpec = { g: 'veh', ch: 'tracked', L: 0.94, W: 0.56, H: 0.2, n: 6, skirt: 1, nose: 'glacis', nl: 0.24, tur: { t: 'ang', w: 0.46, l: 0.42, h: 0.12, nose: 0.12, taper: 0.05, bustle: 0.42, gun: 0.56, gr: 0.02, x: -0.02 } };
const ARIETE: VehSpec = V(LEO2A4, { n: 7 }, { nose: 0.12, taper: 0.12, bustle: 0.25, h: 0.11 });
const T72: VehSpec = { g: 'veh', ch: 'tracked', L: 0.95, W: 0.55, H: 0.185, n: 6, skirt: 0, nose: 'glacis', nl: 0.32, add: ['drums'], tur: { t: 'dome', w: 0.42, l: 0.42, h: 0.12, gun: 0.62, gr: 0.018, fume: true, x: -0.02 } };
const T72B3: VehSpec = V(T72, { skirt: 1, add: ['era'] }, { era: 1 });
const T80: VehSpec = V(T72B3, { n: 6, L: 0.98, add: ['era'] }, { h: 0.11, era: 1 });
const T90A: VehSpec = V(T72, { skirt: 1, add: ['era'] }, { t: 'ang', nose: 0.35, taper: 0.18, era: 1, shtora: true, h: 0.11, w: 0.44, l: 0.44 });
const T90M: VehSpec = V(T72, { skirt: 2, add: ['era'] }, { t: 'ang', nose: 0.38, taper: 0.15, era: 2, bustle: 0.3, h: 0.11, w: 0.44, l: 0.44, rws: true });
const T55: VehSpec = { g: 'veh', ch: 'tracked', L: 0.9, W: 0.52, H: 0.18, n: 5, skirt: 0, nose: 'glacis', nl: 0.3, add: ['drums'], tur: { t: 'dome', w: 0.42, l: 0.42, h: 0.14, gun: 0.52, gr: 0.016, fume: true, x: -0.0 } };
const T14: VehSpec = { g: 'veh', ch: 'tracked', L: 1.08, W: 0.56, H: 0.23, n: 7, skirt: 2, nose: 'glacis', nl: 0.2, tur: { t: 'unm', w: 0.38, l: 0.46, h: 0.085, nose: 0.3, taper: 0.1, bustle: 0.2, gun: 0.66, gr: 0.02, aps: true, x: -0.02 } };
const MERKAVA: VehSpec = { g: 'veh', ch: 'tracked', L: 1.05, W: 0.56, H: 0.21, n: 6, skirt: 1, nose: 'front', nl: 0.55, rearH: 0.21, tur: { t: 'ang', w: 0.46, l: 0.62, h: 0.12, nose: 0.95, taper: 0.22, bustle: 0.1, gun: 0.55, gr: 0.02, x: -0.16, aps: true } };
const TYPE99: VehSpec = { g: 'veh', ch: 'tracked', L: 1.04, W: 0.56, H: 0.2, n: 6, skirt: 1, nose: 'glacis', nl: 0.26, tur: { t: 'ang', w: 0.46, l: 0.48, h: 0.11, nose: 0.52, taper: 0.1, bustle: 0.2, gun: 0.64, gr: 0.019, wedge: true, era: 1, x: -0.04 } };
const TYPE96: VehSpec = V(T72, { skirt: 1, add: [] }, { t: 'ang', nose: 0.5, taper: 0.22, h: 0.12, bustle: 0.12 });
const TYPE15: VehSpec = { g: 'veh', ch: 'tracked', L: 0.86, W: 0.5, H: 0.2, n: 6, skirt: 1, nose: 'glacis', nl: 0.26, tur: { t: 'ang', w: 0.4, l: 0.42, h: 0.12, nose: 0.3, taper: 0.1, bustle: 0.25, gun: 0.46, gr: 0.017, x: -0.02 } };
const K2: VehSpec = { g: 'veh', ch: 'tracked', L: 1.02, W: 0.56, H: 0.2, n: 6, skirt: 1, nose: 'glacis', nl: 0.24, tur: { t: 'ang', w: 0.45, l: 0.5, h: 0.1, nose: 0.28, taper: 0.1, bustle: 0.3, gun: 0.62, gr: 0.02, rws: true, x: -0.04 } };
const TYPE10: VehSpec = V(K2, { n: 5, L: 0.96 }, { nose: 0.38, taper: 0.06, rws: false });
const ARJUN: VehSpec = { g: 'veh', ch: 'tracked', L: 1.06, W: 0.58, H: 0.22, n: 7, skirt: 1, nose: 'glacis', nl: 0.24, tur: { t: 'ang', w: 0.46, l: 0.5, h: 0.125, nose: 0.1, taper: 0.06, bustle: 0.18, gun: 0.6, gr: 0.02, fume: true, x: -0.03 } };
const M60: VehSpec = { g: 'veh', ch: 'tracked', L: 1, W: 0.56, H: 0.22, n: 6, skirt: 0, nose: 'glacis', nl: 0.26, tur: { t: 'dome', w: 0.44, l: 0.54, h: 0.13, gun: 0.55, gr: 0.018, fume: true, bustle: 0.2, x: -0.02 } };
const CENTURION: VehSpec = V(M60, { skirt: 1, n: 6 }, { t: 'ang', nose: 0.2, taper: 0.25, h: 0.14, bustle: 0.2 });
const KF51: VehSpec = V(LEO2A4, { add: ['smoke'] }, { nose: 0.22, taper: 0.12, bustle: 0.3, gun: 0.66, gr: 0.023, aps: true, rws: true, h: 0.105, w: 0.47 });
const MCV8: VehSpec = { g: 'veh', ch: 'wheeled', L: 1, W: 0.5, H: 0.25, n: 4, nose: 'glacis', nl: 0.2, tur: { t: 'ang', w: 0.38, l: 0.4, h: 0.1, nose: 0.3, taper: 0.1, bustle: 0.2, gun: 0.5, gr: 0.017, x: -0.08 } };

const BRADLEY: VehSpec = { g: 'veh', ch: 'tracked', L: 0.9, W: 0.56, H: 0.27, n: 6, skirt: 1, nose: 'glacis', nl: 0.22, add: ['ramp'], tur: { t: 'ifv', w: 0.3, l: 0.3, h: 0.1, nose: 0.3, taper: 0.1, gun: 0.26, gr: 0.008, atgm: 'side', x: 0.05 } };
const PUMA: VehSpec = { g: 'veh', ch: 'tracked', L: 0.98, W: 0.6, H: 0.26, n: 6, skirt: 2, nose: 'wedge', nl: 0.26, tur: { t: 'unm', w: 0.26, l: 0.34, h: 0.08, nose: 0.4, gun: 0.3, gr: 0.009, atgm: 'side', x: 0.02 } };
const CV90: VehSpec = { g: 'veh', ch: 'tracked', L: 0.92, W: 0.52, H: 0.26, n: 7, skirt: 0, nose: 'glacis', nl: 0.28, add: ['ramp'], tur: { t: 'ifv', w: 0.34, l: 0.33, h: 0.11, nose: 0.3, taper: 0.18, gun: 0.3, gr: 0.011, x: 0.02 } };
const LYNX: VehSpec = { g: 'veh', ch: 'tracked', L: 1, W: 0.56, H: 0.3, n: 6, skirt: 1, nose: 'wedge', nl: 0.3, tur: { t: 'ifv', w: 0.34, l: 0.36, h: 0.1, nose: 0.25, taper: 0.1, gun: 0.3, gr: 0.01, atgm: 'pods', x: 0.02 } };
const WARRIOR: VehSpec = V(CV90, { n: 6, H: 0.27 }, { t: 'ifv', nose: 0.2, taper: 0.12, gun: 0.26 });
const BMP1: VehSpec = { g: 'veh', ch: 'tracked', L: 0.9, W: 0.5, H: 0.19, n: 6, skirt: 0, nose: 'wedge', nl: 0.45, tur: { t: 'dome', w: 0.22, l: 0.22, h: 0.08, gun: 0.18, gr: 0.012, atgm: 'top', x: -0.02 } };
const BMP2: VehSpec = V(BMP1, {}, { gun: 0.28, gr: 0.007, w: 0.25, l: 0.25 });
const BMP3: VehSpec = { g: 'veh', ch: 'tracked', L: 0.92, W: 0.53, H: 0.21, n: 6, skirt: 0, nose: 'wedge', nl: 0.34, tur: { t: 'ang', w: 0.3, l: 0.3, h: 0.09, nose: 0.4, taper: 0.1, gun: 0.3, gr: 0.015, x: -0.04 } };
const MTLB: VehSpec = { g: 'veh', ch: 'tracked', L: 0.88, W: 0.5, H: 0.18, n: 6, skirt: 0, nose: 'blunt', add: ['lmg'] };
const M113: VehSpec = { g: 'veh', ch: 'tracked', L: 0.85, W: 0.5, H: 0.3, n: 5, skirt: 0, nose: 'boat', nl: 0.14, add: ['lmg', 'ramp'] };
const NAMER: VehSpec = { g: 'veh', ch: 'tracked', L: 1.05, W: 0.56, H: 0.27, n: 6, skirt: 1, nose: 'front', nl: 0.4, tur: { t: 'rws', w: 0.1, l: 0.14, h: 0.06, gun: 0.14, gr: 0.006, x: -0.1 } };
const T15: VehSpec = V(NAMER, { L: 1.1, nl: 0.36, skirt: 2 }, { t: 'unm', w: 0.26, l: 0.3, h: 0.08, gun: 0.3, gr: 0.01, atgm: 'side', x: -0.1 });
const KURGANETS: VehSpec = V(PUMA, { nose: 'wedge', skirt: 1, n: 7 }, { atgm: 'twin' });
const STRYKER: VehSpec = { g: 'veh', ch: 'wheeled', L: 1, W: 0.46, H: 0.3, n: 4, nose: 'glacis', nl: 0.13, add: ['rack'], tur: { t: 'rws', w: 0.1, l: 0.14, h: 0.06, gun: 0.14, gr: 0.006, x: 0.05 } };
const BOXER: VehSpec = { g: 'veh', ch: 'wheeled', L: 1, W: 0.5, H: 0.34, n: 4, nose: 'blunt', tur: { t: 'ifv', w: 0.3, l: 0.32, h: 0.09, nose: 0.3, gun: 0.3, gr: 0.009, x: -0.05 } };
const PATRIA: VehSpec = { g: 'veh', ch: 'wheeled', L: 1, W: 0.48, H: 0.29, n: 4, nose: 'glacis', nl: 0.22, tur: { t: 'ifv', w: 0.28, l: 0.28, h: 0.09, nose: 0.3, gun: 0.26, gr: 0.008, x: -0.04 } };
const PIRANHA: VehSpec = V(PATRIA, { nose: 'boat', nl: 0.2, H: 0.28 }, { t: 'rws', w: 0.1, l: 0.14, h: 0.06, gun: 0.14, gr: 0.006 });
const BTR80: VehSpec = { g: 'veh', ch: 'wheeled', L: 1, W: 0.44, H: 0.25, n: 4, nose: 'boat', nl: 0.26, rearH: 0.23, tur: { t: 'dome', w: 0.14, l: 0.14, h: 0.07, gun: 0.18, gr: 0.007, x: 0.15, z: -0.04 } };
const BTR4: VehSpec = { g: 'veh', ch: 'wheeled', L: 1, W: 0.46, H: 0.3, n: 4, nose: 'boat', nl: 0.2, tur: { t: 'ifv', w: 0.2, l: 0.24, h: 0.08, nose: 0.4, gun: 0.24, gr: 0.008, atgm: 'side', x: -0.05 } };
const VBCI: VehSpec = V(PATRIA, { H: 0.31, nose: 'glacis', nl: 0.16 }, { w: 0.3, l: 0.32 });
const MRAP: VehSpec = { g: 'veh', ch: 'wheeled', L: 0.84, W: 0.48, H: 0.38, n: 2, wr: 0.1, nose: 'v', nl: 0.3, add: ['spare'], tur: { t: 'rws', w: 0.1, l: 0.12, h: 0.06, gun: 0.12, gr: 0.006, x: 0 } };
const GRIFFON: VehSpec = { g: 'veh', ch: 'wheeled', L: 1, W: 0.48, H: 0.36, n: 3, wr: 0.095, nose: 'hood', tur: { t: 'rws', w: 0.1, l: 0.12, h: 0.06, gun: 0.13, gr: 0.006, x: -0.1 } };
const JLTV: VehSpec = { g: 'veh', ch: 'wheeled', L: 0.8, W: 0.46, H: 0.3, n: 2, wr: 0.09, nose: 'hood', tur: { t: 'rws', w: 0.09, l: 0.1, h: 0.05, gun: 0.12, gr: 0.006, x: -0.1 } };
const HUMVEE: VehSpec = { g: 'veh', ch: 'wheeled', L: 0.8, W: 0.5, H: 0.26, n: 2, wr: 0.08, nose: 'hood', add: ['lmg'] };
const TIGR: VehSpec = { g: 'veh', ch: 'wheeled', L: 0.82, W: 0.46, H: 0.32, n: 2, wr: 0.09, nose: 'hood', add: ['spare'] };
const TECHNICAL: VehSpec = { g: 'veh', ch: 'wheeled', L: 0.78, W: 0.42, H: 0.26, n: 2, wr: 0.07, nose: 'hood', rearH: 0.15, add: ['lmg'] };
const LMV: VehSpec = V(TIGR, { H: 0.29, L: 0.76 }, {});
const FENNEK: VehSpec = { g: 'veh', ch: 'wheeled', L: 0.8, W: 0.48, H: 0.22, n: 2, wr: 0.08, nose: 'glacis', nl: 0.3, add: ['mast'] };
const BRDM: VehSpec = { g: 'veh', ch: 'wheeled', L: 0.85, W: 0.44, H: 0.22, n: 2, wr: 0.08, nose: 'boat', nl: 0.3, tur: { t: 'dome', w: 0.14, l: 0.14, h: 0.07, gun: 0.14, gr: 0.006, x: 0 } };
const RECON8: VehSpec = { g: 'veh', ch: 'wheeled', L: 1, W: 0.48, H: 0.24, n: 4, nose: 'glacis', nl: 0.22, tur: { t: 'ang', w: 0.34, l: 0.36, h: 0.1, nose: 0.3, taper: 0.1, bustle: 0.2, gun: 0.44, gr: 0.015, x: -0.06 } };
const JAGUAR: VehSpec = { g: 'veh', ch: 'wheeled', L: 0.95, W: 0.5, H: 0.28, n: 3, nose: 'glacis', nl: 0.22, tur: { t: 'ifv', w: 0.3, l: 0.3, h: 0.1, nose: 0.3, gun: 0.3, gr: 0.012, atgm: 'pods', x: -0.06 } };
const AMX10RC: VehSpec = V(JAGUAR, { H: 0.22, nose: 'boat' }, { t: 'ang', gun: 0.42, gr: 0.015, atgm: undefined, bustle: 0.2 });
const AJAX: VehSpec = V(CV90, { L: 1, H: 0.29, n: 7, skirt: 1 }, { w: 0.34, l: 0.36, gun: 0.3 });

const PALADIN: VehSpec = { g: 'veh', ch: 'tracked', L: 0.95, W: 0.54, H: 0.19, n: 7, skirt: 0, nose: 'glacis', nl: 0.2, tur: { t: 'sph', w: 0.46, l: 0.5, h: 0.16, nose: 0.2, taper: 0.06, gun: 0.55, gr: 0.02, fume: true, brake: true, x: -0.1, bustle: 0.12 } };
const PZH2000: VehSpec = { g: 'veh', ch: 'tracked', L: 1.05, W: 0.56, H: 0.2, n: 7, skirt: 1, nose: 'glacis', nl: 0.18, tur: { t: 'sph', w: 0.48, l: 0.52, h: 0.16, nose: 0.15, taper: 0.08, gun: 0.72, gr: 0.02, fume: true, brake: true, x: -0.14 } };
const K9: VehSpec = V(PZH2000, { n: 6, L: 1.02 }, { gun: 0.66, nose: 0.3, h: 0.15 });
const MSTA: VehSpec = { g: 'veh', ch: 'tracked', L: 1, W: 0.55, H: 0.19, n: 6, skirt: 0, nose: 'glacis', nl: 0.3, tur: { t: 'sph', w: 0.48, l: 0.56, h: 0.18, nose: 0.3, taper: 0.05, gun: 0.7, gr: 0.02, fume: true, brake: true, x: -0.08 } };
const KOALITSIYA: VehSpec = V(MSTA, { skirt: 1, L: 1.05 }, { t: 'sph', nose: 0.45, taper: 0.14, h: 0.17, gun: 0.72 });
const S2S1: VehSpec = { g: 'veh', ch: 'tracked', L: 0.82, W: 0.5, H: 0.18, n: 7, nose: 'boat', nl: 0.2, tur: { t: 'sph', w: 0.34, l: 0.32, h: 0.12, nose: 0.4, taper: 0.2, gun: 0.36, gr: 0.015, brake: true, x: -0.08 } };
const S2S3: VehSpec = V(S2S1, { L: 0.92, n: 6, H: 0.2 }, { w: 0.42, l: 0.44, h: 0.15, gun: 0.46 });
const PION: VehSpec = { g: 'veh', ch: 'tracked', L: 1, W: 0.55, H: 0.18, n: 6, nose: 'blunt', pay: { k: 'gun', l: 0.75 }, add: ['dozer'] };
const PLZ05: VehSpec = V(MSTA, { skirt: 1 }, { nose: 0.4, taper: 0.1 });
const TRUCKGUN: VehSpec = { g: 'veh', ch: 'truck', L: 1, W: 0.46, H: 0.24, n: 3, cab: 'armored', cabL: 0.22, pay: { k: 'gun', l: 0.62 } };
const ARCHER: VehSpec = { g: 'veh', ch: 'truck', L: 1.05, W: 0.48, H: 0.26, n: 3, cab: 'armored', cabL: 0.24, pay: { k: 'gun', l: 0.6, turret: true } };
const M777: TowedSpec = { g: 'towed', bl: 0.62, r: 0.017, trails: 2, wheels: 2, w: 0.38 };
const D30: TowedSpec = { g: 'towed', bl: 0.5, r: 0.015, trails: 3, shield: true, w: 0.34 };
const FH70: TowedSpec = { g: 'towed', bl: 0.62, r: 0.017, trails: 2, wheels: 2, apu: true, shield: true };
const LIGHTGUN: TowedSpec = { g: 'towed', bl: 0.38, r: 0.012, trails: 2, wheels: 2, w: 0.32, shield: false };

const HIMARS: VehSpec = { g: 'veh', ch: 'truck', L: 0.95, W: 0.46, H: 0.25, n: 3, cab: 'flat', cabL: 0.22, pay: { k: 'mlrs', pods: 1, rows: 2, cols: 3, l: 0.38, a: 0.1, tr: 0.058 } };
const M270: VehSpec = { g: 'veh', ch: 'tracked', L: 1, W: 0.56, H: 0.2, n: 6, nose: 'blunt', add: ['cabin'], pay: { k: 'mlrs', pods: 2, rows: 2, cols: 3, l: 0.46, a: 0.08, tr: 0.06 } };
const GRAD: VehSpec = { g: 'veh', ch: 'truck', L: 0.95, W: 0.44, H: 0.25, n: 3, cab: 'bonnet', cabL: 0.3, pay: { k: 'mlrs', pods: 1, rows: 4, cols: 10, l: 0.46, a: 0.16, open: true, tr: 0.036 } };
const URAGAN: VehSpec = { g: 'veh', ch: 'truck', L: 1.05, W: 0.46, H: 0.26, n: 4, cab: 'flat', cabL: 0.22, pay: { k: 'mlrs', pods: 1, rows: 3, cols: 6, l: 0.6, a: 0.14, open: true, tr: 0.06 } };
const SMERCH: VehSpec = { g: 'veh', ch: 'truck', L: 1.1, W: 0.48, H: 0.27, n: 4, cab: 'maz', cabL: 0.24, pay: { k: 'mlrs', pods: 1, rows: 3, cols: 4, l: 0.66, a: 0.15, open: true, tr: 0.085 } };
const TOS1: VehSpec = V(T72, { add: ['cabin'], tur: undefined, pay: { k: 'mlrs', pods: 1, rows: 3, cols: 5, l: 0.55, a: 0.2, tr: 0.06 } });
const PHL16: VehSpec = { g: 'veh', ch: 'truck', L: 1.1, W: 0.48, H: 0.27, n: 4, cab: 'flat', cabL: 0.24, pay: { k: 'mlrs', pods: 2, rows: 2, cols: 3, l: 0.62, a: 0.12, tr: 0.075 } };
const ASTROS: VehSpec = V(PHL16, { n: 3, L: 1, cabL: 0.24 });
const CHUNMOO: VehSpec = V(PHL16, { cab: 'armored' });

const PATRIOT: VehSpec = { g: 'veh', ch: 'truck', L: 1.05, W: 0.46, H: 0.25, n: 4, cab: 'flat', cabL: 0.22, pay: { k: 'sam', s: 'box', n: 4, l: 0.55, r: 0.05, a: 0.62 } };
const PATRIOT_RADAR: VehSpec = { g: 'veh', ch: 'truck', L: 0.95, W: 0.46, H: 0.25, n: 3, cab: 'flat', cabL: 0.22, pay: { k: 'radar', s: 'panel', w: 0.34, h: 0.26, a: 0.4 } };
const S400: VehSpec = { g: 'veh', ch: 'truck', L: 1.15, W: 0.48, H: 0.26, n: 4, cab: 'bonnet', cabL: 0.28, pay: { k: 'sam', s: 'tubes', n: 4, l: 0.62, r: 0.042, a: 1.25 } };
const S300: VehSpec = V(S400, { cab: 'maz', cabL: 0.24 });
const S400_RADAR: VehSpec = { g: 'veh', ch: 'truck', L: 1.05, W: 0.48, H: 0.26, n: 4, cab: 'bonnet', cabL: 0.28, pay: { k: 'radar', s: 'panel', w: 0.34, h: 0.3, a: 0.3 } };
const S300V: VehSpec = { g: 'veh', ch: 'tracked', L: 1.05, W: 0.56, H: 0.22, n: 6, nose: 'blunt', add: ['cabin'], pay: { k: 'sam', s: 'tubes', n: 2, l: 0.62, r: 0.06, a: 1.2 } };
const BUK: VehSpec = { g: 'veh', ch: 'tracked', L: 1, W: 0.54, H: 0.19, n: 6, nose: 'glacis', nl: 0.2, pay: { k: 'sam', s: 'rails', n: 4, l: 0.36, r: 0.028, a: 0.35 } };
const TOR: VehSpec = { g: 'veh', ch: 'tracked', L: 0.95, W: 0.54, H: 0.2, n: 6, nose: 'glacis', nl: 0.2, pay: { k: 'sam', s: 'turret', n: 8, l: 0.3, r: 0.03, a: 1.5 } };
const PANTSIR: VehSpec = { g: 'veh', ch: 'truck', L: 1.05, W: 0.48, H: 0.26, n: 4, cab: 'bonnet', cabL: 0.28, pay: { k: 'sam', s: 'turret', n: 12, l: 0.3, r: 0.02, a: 0.3, rad: true } };
const TUNGUSKA: VehSpec = { g: 'veh', ch: 'tracked', L: 0.98, W: 0.54, H: 0.2, n: 6, nose: 'glacis', nl: 0.24, tur: { t: 'aa', w: 0.42, l: 0.42, h: 0.15, gun: 0.4, gr: 0.009, radar: 'both', x: -0.06 } };
const GEPARD: VehSpec = V(LEO1, { add: [] }, { t: 'aa', w: 0.4, l: 0.38, h: 0.15, gun: 0.46, gr: 0.009, radar: 'both' });
const ZSU234: VehSpec = { g: 'veh', ch: 'tracked', L: 0.82, W: 0.5, H: 0.18, n: 6, nose: 'blunt', tur: { t: 'aa', w: 0.42, l: 0.4, h: 0.14, gun: 0.3, gr: 0.007, radar: 'dish', x: 0 } };
const IRONDOME: VehSpec = { g: 'veh', ch: 'truck', L: 1, W: 0.46, H: 0.25, n: 3, cab: 'flat', cabL: 0.22, pay: { k: 'sam', s: 'cells', n: 1, l: 0.36, r: 0.11, a: 0.95 } };
const NASAMS: VehSpec = { g: 'veh', ch: 'truck', L: 1, W: 0.46, H: 0.25, n: 3, cab: 'flat', cabL: 0.22, pay: { k: 'sam', s: 'box', n: 6, l: 0.44, r: 0.035, a: 0.55 } };
const VERTSAM: VehSpec = { g: 'veh', ch: 'truck', L: 1.02, W: 0.46, H: 0.25, n: 4, cab: 'flat', cabL: 0.22, pay: { k: 'sam', s: 'box', n: 8, l: 0.48, r: 0.033, a: 1.45 } };
const AVENGER: VehSpec = V(HUMVEE, { add: [], pay: { k: 'sam', s: 'pods', n: 2, l: 0.2, r: 0.018, a: 0.2 } });
const AESA_RADAR: VehSpec = { g: 'veh', ch: 'truck', L: 0.95, W: 0.46, H: 0.25, n: 3, cab: 'flat', cabL: 0.22, pay: { k: 'radar', s: 'rot', w: 0.3, h: 0.16 } };

const ISKANDER: VehSpec = { g: 'veh', ch: 'truck', L: 1.1, W: 0.48, H: 0.26, n: 4, cab: 'armored', cabL: 0.24, pay: { k: 'tel', l: 0.62, r: 0.042, a: 0, n: 2 } };
const SCUD: VehSpec = { g: 'veh', ch: 'truck', L: 1.1, W: 0.48, H: 0.26, n: 4, cab: 'maz', cabL: 0.26, pay: { k: 'tel', l: 0.74, r: 0.04, a: 0.04 } };
const ICBM_TEL: VehSpec = { g: 'veh', ch: 'truck', L: 1.2, W: 0.46, H: 0.26, n: 7, wr: 0.07, cab: 'maz', cabL: 0.2, pay: { k: 'tel', l: 0.95, r: 0.065, a: 0, can: true } };
const IRBM_TEL: VehSpec = { g: 'veh', ch: 'truck', L: 1.12, W: 0.46, H: 0.26, n: 5, wr: 0.072, cab: 'armored', cabL: 0.22, pay: { k: 'tel', l: 0.82, r: 0.055, a: 0, can: true } };
const COASTAL: VehSpec = { g: 'veh', ch: 'truck', L: 1.02, W: 0.46, H: 0.25, n: 3, cab: 'flat', cabL: 0.22, pay: { k: 'can', n: 4, rows: 2, l: 0.5, r: 0.035, a: 0.28 } };
const BASTION: VehSpec = { g: 'veh', ch: 'truck', L: 1.1, W: 0.48, H: 0.26, n: 4, cab: 'maz', cabL: 0.24, pay: { k: 'can', n: 3, rows: 1, l: 0.66, r: 0.045, a: 0.05, round: true } };
const TYPHON: VehSpec = { g: 'veh', ch: 'truck', L: 1.15, W: 0.48, H: 0.26, n: 4, cab: 'flat', cabL: 0.22, pay: { k: 'can', n: 4, rows: 2, l: 0.62, r: 0.042, a: 1.3 } };
const SILO_ICBM: VehSpec = { g: 'veh', ch: 'truck', L: 1.2, W: 0.46, H: 0.26, n: 6, wr: 0.07, cab: 'armored', cabL: 0.2, pay: { k: 'tel', l: 0.95, r: 0.06, a: 0.9, stages: 3 } };

const ENGINEER_TRACKED: VehSpec = { g: 'veh', ch: 'tracked', L: 0.95, W: 0.56, H: 0.23, n: 6, nose: 'glacis', nl: 0.2, add: ['dozer', 'crane'], tur: { t: 'rws', w: 0.1, l: 0.12, h: 0.06, gun: 0.12, gr: 0.006, x: -0.2 } };
const ENGINEER_TRUCK: VehSpec = { g: 'veh', ch: 'truck', L: 0.95, W: 0.46, H: 0.25, n: 3, cab: 'armored', cabL: 0.24, add: ['dozer'], pay: { k: 'cargo', h: 0.18, canvas: true } };
const ABV: VehSpec = V(ABRAMS, { add: ['plough'], tur: { t: 'ang', w: 0.44, l: 0.46, h: 0.1, nose: 0.2, taper: 0.1, x: -0.06 } });
const CARGO_TRUCK: VehSpec = { g: 'veh', ch: 'truck', L: 0.95, W: 0.44, H: 0.25, n: 3, cab: 'flat', cabL: 0.22, pay: { k: 'cargo', h: 0.2, canvas: true } };
const CARGO_BONNET: VehSpec = V(CARGO_TRUCK, { cab: 'bonnet', cabL: 0.3 });

// ===========================================================================
// Air presets
// ===========================================================================
const F16: AirSpec = { g: 'air', r: 0.042, nose: 0.2, tail: 0.18, tailR: 0.62, ck: [0.26, 0.16, 0.042], wing: { x: 0.06, root: 0.36, tip: 0.08, span: 0.32, sweep: 0.28, lerx: 0.2 }, hs: { x: -0.3, root: 0.14, tip: 0.05, span: 0.19, sweep: 0.12 }, vt: { n: 1, x: -0.2, root: 0.2, tip: 0.07, h: 0.19, sweep: 0.17 }, eng: { n: 1, k: 'int', r: 0.032, l: 0, x: 0, z: [0] }, int: 'chin' };
const F15: AirSpec = { g: 'air', bw: 0.055, r: 0.05, sy: 0.8, sz: 1.45, nose: 0.2, tail: 0.14, tailR: 0.8, ck: [0.27, 0.15, 0.045], wing: { x: 0.03, root: 0.4, tip: 0.08, span: 0.36, sweep: 0.26, y: 0.4 }, hs: { x: -0.33, root: 0.15, tip: 0.06, span: 0.21, sweep: 0.1 }, vt: { n: 2, x: -0.26, root: 0.17, tip: 0.08, h: 0.18, sweep: 0.12, cant: 0.04, z: 0.06 }, eng: { n: 2, k: 'int', r: 0.028, l: 0, x: 0, z: [0.035, -0.035] }, int: 'box' };
const F22: AirSpec = { g: 'air', bw: 0.075, r: 0.05, sy: 0.66, sz: 1.6, facet: 6, nose: 0.24, tail: 0.14, tailR: 0.75, ck: [0.26, 0.16, 0.042], wing: { x: 0.06, root: 0.44, tip: 0.05, span: 0.34, sweep: 0.33, y: 0.2 }, hs: { x: -0.32, root: 0.16, tip: 0.05, span: 0.22, sweep: 0.13 }, vt: { n: 2, x: -0.19, root: 0.18, tip: 0.07, h: 0.15, sweep: 0.12, cant: 0.45, z: 0.07 }, eng: { n: 2, k: 'int', r: 0.026, l: 0, x: 0, z: [0.035, -0.035] }, int: 'dsi' };
const F35: AirSpec = { g: 'air', bw: 0.07, r: 0.058, sy: 0.78, sz: 1.35, facet: 6, nose: 0.2, tail: 0.16, tailR: 0.62, ck: [0.25, 0.15, 0.045], wing: { x: 0.04, root: 0.38, tip: 0.07, span: 0.3, sweep: 0.24, y: 0.1 }, hs: { x: -0.32, root: 0.16, tip: 0.06, span: 0.2, sweep: 0.1 }, vt: { n: 2, x: -0.24, root: 0.16, tip: 0.07, h: 0.14, sweep: 0.12, cant: 0.42, z: 0.058 }, eng: { n: 1, k: 'int', r: 0.035, l: 0, x: 0, z: [0] }, int: 'dsi' };
const FLANKER: AirSpec = { g: 'air', bw: 0.06, r: 0.045, sy: 0.8, sz: 1.35, nose: 0.24, tail: 0.24, tailR: 0.5, ck: [0.3, 0.14, 0.045], wing: { x: 0.06, root: 0.38, tip: 0.06, span: 0.38, sweep: 0.31, y: 0.1, lerx: 0.2 }, hs: { x: -0.36, root: 0.17, tip: 0.06, span: 0.23, sweep: 0.12, y: -0.3 }, vt: { n: 2, x: -0.24, root: 0.16, tip: 0.07, h: 0.19, sweep: 0.13, cant: 0.02, z: 0.1 }, eng: { n: 2, k: 'nac', r: 0.032, l: 0.56, x: 0.12, z: [0.075, -0.075] } };
const FULCRUM: AirSpec = A(FLANKER, { r: 0.043, ck: [0.28, 0.14, 0.045], wing: { x: 0.06, root: 0.4, tip: 0.07, span: 0.34, sweep: 0.3, y: 0.1, lerx: 0.24 }, vt: { n: 2, x: -0.22, root: 0.16, tip: 0.07, h: 0.18, sweep: 0.12, cant: 0.12, z: 0.09 }, eng: { n: 2, k: 'nac', r: 0.03, l: 0.52, x: 0.1, z: [0.068, -0.068] } });
const SU57: AirSpec = { g: 'air', bw: 0.09, r: 0.048, sy: 0.6, sz: 1.7, facet: 6, nose: 0.25, tail: 0.2, tailR: 0.5, ck: [0.3, 0.15, 0.04], wing: { x: 0.08, root: 0.46, tip: 0.05, span: 0.38, sweep: 0.36, y: 0.1, lerx: 0.16 }, hs: { x: -0.33, root: 0.17, tip: 0.05, span: 0.24, sweep: 0.13 }, vt: { n: 2, x: -0.25, root: 0.12, tip: 0.06, h: 0.12, sweep: 0.08, cant: 0.5, z: 0.1 }, eng: { n: 2, k: 'nac', r: 0.03, l: 0.52, x: 0.1, z: [0.085, -0.085] } };
const J20: AirSpec = { g: 'air', bw: 0.06, r: 0.05, sy: 0.64, sz: 1.5, facet: 6, nose: 0.26, tail: 0.14, tailR: 0.7, ck: [0.3, 0.16, 0.04], cn: { x: 0.22, root: 0.12, tip: 0.04, span: 0.2, sweep: 0.1 }, wing: { x: 0.06, root: 0.46, tip: 0.04, span: 0.34, sweep: 0.4, y: 0.1 }, vt: { n: 2, x: -0.3, root: 0.12, tip: 0.05, h: 0.12, sweep: 0.08, cant: 0.42, z: 0.06 }, ventral: true, eng: { n: 2, k: 'int', r: 0.027, l: 0, x: 0, z: [0.035, -0.035] }, int: 'dsi' };
const RAFALE: AirSpec = { g: 'air', r: 0.045, sz: 1.2, nose: 0.2, tail: 0.14, tailR: 0.8, ck: [0.27, 0.15, 0.045], cn: { x: 0.2, root: 0.1, tip: 0.03, span: 0.16, sweep: 0.07 }, wing: { x: 0.08, root: 0.5, tip: 0.05, span: 0.35, sweep: 0.44, y: -0.3 }, vt: { n: 1, x: -0.25, root: 0.2, tip: 0.06, h: 0.2, sweep: 0.16 }, eng: { n: 2, k: 'int', r: 0.026, l: 0, x: 0, z: [0.028, -0.028] }, int: 'side', probe: true };
const TYPHOON: AirSpec = { g: 'air', r: 0.045, sz: 1.15, nose: 0.18, tail: 0.14, tailR: 0.8, ck: [0.26, 0.14, 0.045], cn: { x: 0.33, root: 0.08, tip: 0.03, span: 0.14, sweep: 0.05 }, wing: { x: 0.06, root: 0.48, tip: 0.06, span: 0.36, sweep: 0.42, y: -0.2 }, vt: { n: 1, x: -0.25, root: 0.22, tip: 0.07, h: 0.21, sweep: 0.17 }, eng: { n: 2, k: 'int', r: 0.026, l: 0, x: 0, z: [0.028, -0.028] }, int: 'chin' };
const GRIPEN: AirSpec = { g: 'air', r: 0.04, nose: 0.2, tail: 0.14, tailR: 0.7, ck: [0.26, 0.14, 0.04], cn: { x: 0.18, root: 0.1, tip: 0.03, span: 0.16, sweep: 0.07 }, wing: { x: 0.06, root: 0.44, tip: 0.05, span: 0.3, sweep: 0.36, y: 0 }, vt: { n: 1, x: -0.24, root: 0.2, tip: 0.07, h: 0.2, sweep: 0.16 }, eng: { n: 1, k: 'int', r: 0.03, l: 0, x: 0, z: [0] }, int: 'side' };
const MIRAGE2000: AirSpec = { g: 'air', r: 0.045, nose: 0.24, tail: 0.14, tailR: 0.7, ck: [0.24, 0.14, 0.045], wing: { x: 0.14, root: 0.62, tip: 0.03, span: 0.33, sweep: 0.56, y: -0.3 }, vt: { n: 1, x: -0.2, root: 0.24, tip: 0.07, h: 0.22, sweep: 0.2 }, eng: { n: 1, k: 'int', r: 0.034, l: 0, x: 0, z: [0] }, int: 'side', probe: true };
const MIG21: AirSpec = { g: 'air', r: 0.036, nose: 0.12, tail: 0.14, tailR: 0.8, int: 'nose', ck: [0.24, 0.12, 0.036], wing: { x: 0.02, root: 0.36, tip: 0.02, span: 0.26, sweep: 0.34, y: 0 }, hs: { x: -0.36, root: 0.1, tip: 0.03, span: 0.14, sweep: 0.08 }, vt: { n: 1, x: -0.2, root: 0.22, tip: 0.06, h: 0.2, sweep: 0.2 }, eng: { n: 1, k: 'int', r: 0.03, l: 0, x: 0, z: [0] } };
const HORNET: AirSpec = { g: 'air', r: 0.045, sz: 1.3, nose: 0.2, tail: 0.14, tailR: 0.75, ck: [0.27, 0.14, 0.045], wing: { x: 0.02, root: 0.32, tip: 0.1, span: 0.36, sweep: 0.2, y: 0.2, lerx: 0.3 }, hs: { x: -0.32, root: 0.16, tip: 0.06, span: 0.21, sweep: 0.12 }, vt: { n: 2, x: -0.12, root: 0.17, tip: 0.07, h: 0.16, sweep: 0.13, cant: 0.34, z: 0.06 }, eng: { n: 2, k: 'int', r: 0.026, l: 0, x: 0, z: [0.03, -0.03] }, int: 'side' };
const J10: AirSpec = A(GRIPEN, { r: 0.045, cn: { x: 0.2, root: 0.1, tip: 0.03, span: 0.15, sweep: 0.07 }, int: 'chin', ventral: true, wing: { x: 0.08, root: 0.46, tip: 0.05, span: 0.33, sweep: 0.4, y: -0.2 } });
const TEJAS: AirSpec = A(MIRAGE2000, { r: 0.04, wing: { x: 0.12, root: 0.56, tip: 0.04, span: 0.3, sweep: 0.46, y: -0.2 }, probe: false });
const JF17: AirSpec = A(F16, { int: 'dsi', wing: { x: 0.04, root: 0.34, tip: 0.08, span: 0.31, sweep: 0.24, lerx: 0.16 } });
const KF21: AirSpec = A(F22, { facet: 10, r: 0.05, vt: { n: 2, x: -0.2, root: 0.16, tip: 0.07, h: 0.16, sweep: 0.12, cant: 0.3, z: 0.065 } });
const TRAINER: AirSpec = { g: 'air', r: 0.04, nose: 0.2, tail: 0.2, tailR: 0.55, ck: [0.22, 0.2, 0.04], ckT: 'tandem', wing: { x: 0.04, root: 0.26, tip: 0.1, span: 0.3, sweep: 0.12, y: -0.4 }, hs: { x: -0.33, root: 0.12, tip: 0.06, span: 0.17, sweep: 0.06 }, vt: { n: 1, x: -0.26, root: 0.18, tip: 0.08, h: 0.17, sweep: 0.12 }, eng: { n: 1, k: 'int', r: 0.028, l: 0, x: 0, z: [0] }, int: 'side' };
const TURBOPROP_TRAINER: AirSpec = A(TRAINER, { nprop: 0.1, int: 'none', wing: { x: 0.08, root: 0.24, tip: 0.1, span: 0.36, sweep: 0.05, y: -0.5, dih: 0.08 }, eng: undefined });
const A10: AirSpec = { g: 'air', r: 0.045, nose: 0.18, tail: 0.3, tailR: 0.4, ck: [0.3, 0.12, 0.045], wing: { x: 0.08, root: 0.2, tip: 0.1, span: 0.46, sweep: 0.03, y: -0.6, dih: 0.06 }, hs: { x: -0.38, root: 0.1, tip: 0.08, span: 0.18, sweep: 0.0 }, vt: { n: 2, x: -0.37, root: 0.1, tip: 0.08, h: 0.11, sweep: 0.02, cant: 0, z: 0.18, y: 0 }, eng: { n: 2, k: 'rear', r: 0.035, l: 0.14, x: -0.2, y: 1.2, z: [0.075, -0.075] } };
const SU25: AirSpec = { g: 'air', r: 0.042, nose: 0.2, tail: 0.24, tailR: 0.5, ck: [0.28, 0.12, 0.04], wing: { x: 0.08, root: 0.26, tip: 0.1, span: 0.4, sweep: 0.14, y: 0.3 }, hs: { x: -0.36, root: 0.12, tip: 0.06, span: 0.18, sweep: 0.06, y: 0.4 }, vt: { n: 1, x: -0.25, root: 0.2, tip: 0.1, h: 0.19, sweep: 0.12 }, eng: { n: 2, k: 'nac', r: 0.028, l: 0.34, x: 0.12, z: [0.06, -0.06] } };
const TORNADO: AirSpec = { g: 'air', r: 0.045, sz: 1.2, nose: 0.22, tail: 0.14, tailR: 0.8, ck: [0.25, 0.18, 0.045], ckT: 'tandem', wing: { x: 0.04, root: 0.28, tip: 0.07, span: 0.36, sweep: 0.3, y: 0.3 }, hs: { x: -0.34, root: 0.17, tip: 0.07, span: 0.24, sweep: 0.12, y: -0.2 }, vt: { n: 1, x: -0.2, root: 0.26, tip: 0.08, h: 0.24, sweep: 0.2 }, eng: { n: 2, k: 'int', r: 0.026, l: 0, x: 0, z: [0.028, -0.028] }, int: 'box' };
const SU24: AirSpec = A(TORNADO, { r: 0.048, sz: 1.3, ckT: 'bubble', ck: [0.28, 0.14, 0.05] });
const SU34: AirSpec = A(FLANKER, { sz: 1.45, nose: 0.28, cn: { x: 0.2, root: 0.07, tip: 0.03, span: 0.12, sweep: 0.05 }, ck: [0.28, 0.14, 0.05] });
const AIRLINER: AirSpec = { g: 'air', r: 0.055, nose: 0.1, tail: 0.25, tailR: 0.3, ck: [0.44, 0.04, 0.03], ckT: 'airliner', wing: { x: 0.12, root: 0.22, tip: 0.06, span: 0.5, sweep: 0.26, y: -0.7, dih: 0.07 }, hs: { x: -0.36, root: 0.1, tip: 0.05, span: 0.2, sweep: 0.1 }, vt: { n: 1, x: -0.3, root: 0.16, tip: 0.07, h: 0.17, sweep: 0.15 }, eng: { n: 2, k: 'pod', r: 0.028, l: 0.12, x: 0.08, z: [0.18, -0.18] } };
const C17: AirSpec = { g: 'air', r: 0.07, nose: 0.12, tail: 0.3, tailR: 0.3, ck: [0.44, 0.04, 0.04], ckT: 'airliner', wing: { x: 0.12, root: 0.22, tip: 0.07, span: 0.5, sweep: 0.22, y: 0.9, dih: -0.04 }, vt: { n: 1, x: -0.28, root: 0.22, tip: 0.14, h: 0.2, sweep: 0.14, y: 0.6 }, tt: true, hs: { x: 0, root: 0.12, tip: 0.06, span: 0.2, sweep: 0.07 }, eng: { n: 4, k: 'pod', r: 0.025, l: 0.12, x: 0.07, z: [0.2, 0.33, -0.2, -0.33] } };
const C130: AirSpec = { g: 'air', r: 0.065, nose: 0.1, tail: 0.3, tailR: 0.3, ck: [0.44, 0.04, 0.04], ckT: 'airliner', wing: { x: 0.1, root: 0.16, tip: 0.08, span: 0.52, sweep: 0.03, y: 0.9 }, hs: { x: -0.36, root: 0.13, tip: 0.07, span: 0.22, sweep: 0.05, y: 0.4 }, vt: { n: 1, x: -0.28, root: 0.22, tip: 0.1, h: 0.24, sweep: 0.12, y: 0.6 }, eng: { n: 4, k: 'prop', r: 0.02, l: 0.14, x: 0.12, z: [0.17, 0.33, -0.17, -0.33], blades: 4 } };
const TWINPROP: AirSpec = A(C130, { r: 0.055, eng: { n: 2, k: 'prop', r: 0.022, l: 0.16, x: 0.1, z: [0.17, -0.17], blades: 4 }, wing: { x: 0.1, root: 0.14, tip: 0.07, span: 0.48, sweep: 0.02, y: 0.9 } });
const TWINJET_TT: AirSpec = A(C17, { r: 0.062, eng: { n: 2, k: 'pod', r: 0.03, l: 0.13, x: 0.08, z: [0.2, -0.2] } });
const B52: AirSpec = { g: 'air', r: 0.042, nose: 0.1, tail: 0.25, tailR: 0.3, ck: [0.42, 0.04, 0.03], ckT: 'airliner', wing: { x: 0.12, root: 0.22, tip: 0.06, span: 0.6, sweep: 0.26, y: 0.9, dih: -0.03 }, hs: { x: -0.38, root: 0.1, tip: 0.05, span: 0.2, sweep: 0.08, y: 0.4 }, vt: { n: 1, x: -0.28, root: 0.2, tip: 0.08, h: 0.24, sweep: 0.12 }, eng: { n: 4, k: 'pod', r: 0.028, l: 0.12, x: 0.02, z: [0.18, 0.34, -0.18, -0.34] } };
const TU95: AirSpec = A(B52, { r: 0.045, wing: { x: 0.1, root: 0.2, tip: 0.07, span: 0.56, sweep: 0.3, y: -0.1 }, eng: { n: 4, k: 'prop', r: 0.02, l: 0.18, x: 0.04, z: [0.16, 0.32, -0.16, -0.32], blades: 4 } });
const H6: AirSpec = A(B52, { r: 0.045, wing: { x: 0.12, root: 0.24, tip: 0.08, span: 0.5, sweep: 0.24, y: -0.3 }, eng: { n: 2, k: 'fan', r: 0.035, l: 0.28, x: 0.04, y: -0.9, z: [0.075, -0.075] }, ckT: 'glass', ck: [0.42, 0.1, 0.05] });
const TU160: AirSpec = { g: 'air', r: 0.048, sy: 0.75, sz: 1.3, nose: 0.2, tail: 0.18, tailR: 0.4, ck: [0.36, 0.1, 0.035], wing: { x: 0.1, root: 0.3, tip: 0.06, span: 0.44, sweep: 0.38, y: 0 }, hs: { x: -0.4, root: 0.12, tip: 0.05, span: 0.18, sweep: 0.1, y: 0.8 }, vt: { n: 1, x: -0.26, root: 0.2, tip: 0.1, h: 0.2, sweep: 0.14 }, eng: { n: 4, k: 'fan', r: 0.026, l: 0.24, x: -0.24, y: -1.2, z: [0.1, 0.155, -0.1, -0.155] } };
const B1B: AirSpec = A(TU160, { r: 0.046, wing: { x: 0.06, root: 0.28, tip: 0.06, span: 0.4, sweep: 0.4, y: 0 } });
const TU22M: AirSpec = A(TU160, { eng: { n: 2, k: 'int', r: 0.028, l: 0, x: 0, z: [0.03, -0.03] }, int: 'box', wing: { x: 0.02, root: 0.3, tip: 0.07, span: 0.38, sweep: 0.36, y: -0.2 } });
const B2_PF: P2[] = [[0.26, 0], [-0.1, 0.6], [-0.18, 0.6], [-0.06, 0.44], [-0.19, 0.28], [-0.08, 0.13], [-0.2, 0]];
const B2: AirSpec = { g: 'air', r: 0.06, sy: 0.55, sz: 2.2, len: 0.44, fx: 0.04, nose: 0.3, tail: 0.3, tailR: 0.3, ck: [0.2, 0.08, 0.02], ckT: 'glass', pf: B2_PF, pft: 0.028, dark: true, int: 'top' };
const B21: AirSpec = A(B2, { pf: [[0.28, 0], [-0.12, 0.55], [-0.18, 0.55], [-0.06, 0.3], [-0.16, 0]] });
const FLYWING_UCAV: AirSpec = { g: 'air', r: 0.05, sy: 0.55, sz: 1.8, len: 0.6, fx: 0.05, nose: 0.3, tail: 0.3, tailR: 0.3, ck: null, pf: [[0.36, 0], [-0.1, 0.45], [-0.18, 0.45], [-0.08, 0.2], [-0.2, 0.04], [-0.2, 0]], pft: 0.024, int: 'top' };
const TAILLESS6: AirSpec = { g: 'air', bw: 0.08, r: 0.05, sy: 0.6, sz: 1.6, facet: 6, nose: 0.25, tail: 0.14, tailR: 0.6, ck: [0.3, 0.15, 0.04], wing: { x: 0.08, root: 0.54, tip: 0.05, span: 0.38, sweep: 0.44, y: 0.1 }, eng: { n: 2, k: 'int', r: 0.026, l: 0, x: 0, z: [0.035, -0.035] }, int: 'dsi' };
const GCAP: AirSpec = A(TAILLESS6, { wing: { x: 0.1, root: 0.56, tip: 0.06, span: 0.4, sweep: 0.46, y: 0.1 }, vt: { n: 2, x: -0.26, root: 0.12, tip: 0.05, h: 0.11, sweep: 0.08, cant: 0.8, z: 0.07 } });
const NGAD: AirSpec = A(TAILLESS6, { cn: { x: 0.26, root: 0.1, tip: 0.03, span: 0.17, sweep: 0.08 } });
const J36: AirSpec = A(TAILLESS6, { wing: undefined, pf: [[0.46, 0], [-0.2, 0.42], [-0.28, 0.42], [-0.36, 0.1], [-0.3, 0]], pft: 0.03, sz: 1.8, eng: { n: 3, k: 'int', r: 0.022, l: 0, x: 0, z: [0.045, 0, -0.045] } });
const REAPER: AirSpec = { g: 'air', r: 0.032, nose: 0.14, tail: 0.3, tailR: 0.3, len: 0.72, fx: 0.08, ck: null, wing: { x: 0.12, root: 0.08, tip: 0.04, span: 0.6, sweep: 0.02, y: 0.4 }, vt: { n: 2, x: -0.18, root: 0.09, tip: 0.045, h: 0.1, sweep: 0.05, cant: 0.8, z: 0.012, y: 0.5 }, eng: { n: 1, k: 'pusher', r: 0.07, l: 0, x: 0, blades: 3 }, hump: 0.25 };
const TB2: AirSpec = { g: 'air', r: 0.026, nose: 0.2, tail: 0.3, tailR: 0.35, len: 0.5, fx: 0.18, ck: null, wing: { x: 0.12, root: 0.08, tip: 0.05, span: 0.52, sweep: 0.01, y: 0.4 }, boom: { z: 0.12, x0: 0.06, x1: -0.34 }, vt: { n: 2, x: -0.28, root: 0.07, tip: 0.05, h: 0.1, sweep: 0.03, cant: -2.35, z: 0.12, y: 0.3 }, eng: { n: 1, k: 'pusher', r: 0.06, l: 0, x: 0, blades: 2 } };
const GLOBALHAWK: AirSpec = { g: 'air', r: 0.04, nose: 0.18, tail: 0.3, tailR: 0.3, len: 0.9, ck: null, hump: 0.2, wing: { x: 0.08, root: 0.1, tip: 0.04, span: 0.62, sweep: 0.05, y: 0.5 }, vt: { n: 2, x: -0.32, root: 0.1, tip: 0.05, h: 0.1, sweep: 0.05, cant: 0.8, z: 0.02, y: 0.6 }, eng: { n: 1, k: 'top', r: 0.035, l: 0.2, x: -0.26, z: [0] } };
const SHAHED: AirSpec = { g: 'air', r: 0.03, nose: 0.18, tail: 0.1, tailR: 0.5, len: 0.9, ck: null, wing: { x: 0.2, root: 0.62, tip: 0.1, span: 0.38, sweep: 0.5, y: 0 }, vt: { n: 2, x: -0.3, root: 0.1, tip: 0.06, h: 0.1, sweep: 0.04, cant: 0, z: 0.38, y: -0.5 }, eng: { n: 1, k: 'pusher', r: 0.06, l: 0, x: 0, blades: 2 } };
const LANCET: AirSpec = { g: 'air', r: 0.03, nose: 0.16, tail: 0.1, tailR: 0.5, len: 1, ck: null, cn: { x: 0.2, root: 0.14, tip: 0.1, span: 0.26, sweep: 0.04 }, wing: { x: -0.12, root: 0.16, tip: 0.1, span: 0.28, sweep: 0.04, y: 0 }, vt: { n: 1, x: -0.25, root: 0.14, tip: 0.1, h: 0.14, sweep: 0.04 }, eng: { n: 1, k: 'pusher', r: 0.05, l: 0, x: 0, blades: 2 } };
const WINGMAN: AirSpec = { g: 'air', bw: 0.06, r: 0.045, sy: 0.6, sz: 1.5, facet: 6, nose: 0.28, tail: 0.14, tailR: 0.6, ck: null, wing: { x: 0.04, root: 0.34, tip: 0.07, span: 0.3, sweep: 0.26, y: 0.2 }, vt: { n: 2, x: -0.28, root: 0.14, tip: 0.07, h: 0.12, sweep: 0.08, cant: 0.75, z: 0.05 }, eng: { n: 1, k: 'int', r: 0.028, l: 0, x: 0, z: [0] }, int: 'top' };
const SMALLUAV: AirSpec = { g: 'air', r: 0.035, nose: 0.1, tail: 0.3, tailR: 0.3, len: 0.7, fx: 0.1, ck: null, nprop: 0.08, wing: { x: 0.12, root: 0.12, tip: 0.08, span: 0.46, sweep: 0.0, y: 0.8 }, hs: { x: -0.18, root: 0.08, tip: 0.06, span: 0.12, sweep: 0.0 }, vt: { n: 1, x: -0.16, root: 0.09, tip: 0.06, h: 0.1, sweep: 0.03 } };
const HARFANG_TB: AirSpec = A(TB2, { boom: { z: 0.12, x0: 0.06, x1: -0.34 }, vt: { n: 2, x: -0.28, root: 0.07, tip: 0.05, h: 0.12, sweep: 0.03, cant: 0, z: 0.12, y: 0.3 }, hs: { x: -0.28, root: 0.06, tip: 0.06, span: 0.12, sweep: 0, y: 3.5 } });

const APACHE: HeliSpec = { g: 'heli', body: 'attack', w: 0.1, h: 0.15, bl: 0.6, boom: 0.4, wings: 0.16, mast: true, gun: true, sponson: true, ck: 'tandem', r: 0.46, b: 4 };
const COBRA: HeliSpec = { g: 'heli', body: 'attack', w: 0.065, h: 0.14, bl: 0.62, boom: 0.4, wings: 0.14, gun: true, skids: true, ck: 'tandem', r: 0.46, b: 4 };
const TIGER: HeliSpec = { g: 'heli', body: 'attack', w: 0.08, h: 0.13, bl: 0.6, boom: 0.36, wings: 0.13, mast: true, ck: 'tandem', r: 0.42, b: 4 };
const KA52: HeliSpec = { g: 'heli', body: 'attack', w: 0.1, h: 0.15, bl: 0.62, boom: 0.34, wings: 0.16, ck: 'side', coax: true, fin: 'twin', tr: 'none', gun: true, r: 0.44, b: 3 };
const MI28: HeliSpec = { g: 'heli', body: 'attack', w: 0.1, h: 0.16, bl: 0.62, boom: 0.4, wings: 0.17, gun: true, ck: 'tandem', r: 0.47, b: 5 };
const HIND: HeliSpec = { g: 'heli', body: 'hind', w: 0.12, h: 0.14, bl: 0.7, boom: 0.4, wings: 0.18, gun: true, ck: 'tandem', r: 0.46, b: 5 };
const BLACKHAWK: HeliSpec = { g: 'heli', body: 'utility', w: 0.14, h: 0.15, bl: 0.55, boom: 0.42, r: 0.46, b: 4 };
const SEAHAWK: HeliSpec = H(BLACKHAWK, { body: 'naval' });
const MI8: HeliSpec = { g: 'heli', body: 'utility', w: 0.15, h: 0.17, bl: 0.66, boom: 0.36, r: 0.5, b: 5 };
const CHINOOK: HeliSpec = { g: 'heli', body: 'tandem', w: 0.14, h: 0.15, bl: 0.95, r: 0.4, b: 3 };
const CH53: HeliSpec = { g: 'heli', body: 'heavy', w: 0.15, h: 0.17, bl: 0.68, boom: 0.34, r: 0.5, b: 7 };
const MI26: HeliSpec = { g: 'heli', body: 'heavy', w: 0.17, h: 0.19, bl: 0.72, boom: 0.3, r: 0.52, b: 8 };
const OSPREY: HeliSpec = { g: 'heli', body: 'tilt', w: 0.12, h: 0.13, bl: 0.72, boom: 0.12, fin: 'h', r: 0.22, b: 3, tilt: { span: 0.3 } };
const V280: HeliSpec = H(OSPREY, { fin: 'v', tilt: { span: 0.3 } });
const HUEY: HeliSpec = { g: 'heli', body: 'utility', w: 0.11, h: 0.13, bl: 0.46, boom: 0.44, skids: true, r: 0.46, b: 2 };
const LIGHTHELI: HeliSpec = { g: 'heli', body: 'light', w: 0.1, h: 0.13, bl: 0.5, boom: 0.4, skids: true, ck: 'glass', r: 0.42, b: 4 };
const NH90: HeliSpec = H(BLACKHAWK, { w: 0.14, h: 0.16, bl: 0.58, b: 4 });
const H160: HeliSpec = H(LIGHTHELI, { tr: 'fen', skids: false, body: 'utility', w: 0.12, bl: 0.52, b: 5 });

// ===========================================================================
// Naval presets
// ===========================================================================
const BURKE: ShipSpec = { g: 'ship', beam: 0.13, fb: 0.065, fc: [0.12, 0.012], blocks: [[0.05, 0.22, 0.84, 0.085, 0.1], [-0.17, 0.1, 0.62, 0.05, 0.1]], masts: [{ x: 0.0, h: 0.13, s: 'tri', r: 'rot' }], funnels: [[-0.04, 0.05, 0.05, 2], [-0.14, 0.05, 0.045, 2]], guns: [[0.36, 2, 1]], vls: [[0.26, 0.07, 0.5], [-0.3, 0.08, 0.55]], spy: [[0.08, 0.06, 0.024, 0.085, 4]], ciws: [[0.16, 0], [-0.24, 0]], heli: 0.14, hangar: 0.0 };
const TICO: ShipSpec = { g: 'ship', beam: 0.12, fb: 0.065, fc: [0.1, 0.012], blocks: [[0.08, 0.18, 0.8, 0.085, 0.08], [-0.13, 0.16, 0.76, 0.075, 0.08]], masts: [{ x: 0.06, h: 0.12, s: 'lat', r: 'rot' }, { x: -0.1, h: 0.1, s: 'lat', r: 'rot' }], funnels: [[-0.02, 0.05, 0.05, 2]], guns: [[0.38, 2, 0], [-0.4, 2, 0]], vls: [[0.28, 0.07, 0.5], [-0.33, 0.07, 0.5]], spy: [[0.1, 0.06, 0.022, 0.07, 2], [-0.12, 0.055, 0.022, -0.07, 2]], ciws: [[0.18, 0], [-0.22, 0]] };
const T055: ShipSpec = { g: 'ship', beam: 0.13, fb: 0.07, fc: [0.1, 0.01], blocks: [[0.05, 0.26, 0.86, 0.085, 0.2], [-0.14, 0.12, 0.7, 0.05, 0.15]], masts: [{ x: 0.03, h: 0.16, s: 'tower', w: 0.075 }], funnels: [[-0.09, 0.07, 0.05]], guns: [[0.37, 2, 1]], vls: [[0.26, 0.1, 0.55], [-0.24, 0.07, 0.55]], ciws: [[0.19, 0], [-0.22, 0]], heli: 0.15, hangar: 0.0 };
const T052D: ShipSpec = S(T055, { beam: 0.12, blocks: [[0.06, 0.22, 0.84, 0.08, 0.18], [-0.16, 0.1, 0.66, 0.05, 0.15]], masts: [{ x: 0.05, h: 0.12, s: 'int', w: 0.06, r: 'rot' }], funnels: [[-0.07, 0.07, 0.05]], vls: [[0.26, 0.08, 0.5], [-0.26, 0.06, 0.5]] });
const T45: ShipSpec = { g: 'ship', beam: 0.13, fb: 0.065, fc: [0.12, 0.012], blocks: [[0.07, 0.24, 0.86, 0.08, 0.16], [-0.14, 0.12, 0.7, 0.05, 0.1]], masts: [{ x: 0.08, h: 0.2, s: 'int', w: 0.05, r: 'sph' }, { x: -0.1, h: 0.11, s: 'int', w: 0.04, r: 'rot' }], funnels: [[-0.03, 0.06, 0.05]], guns: [[0.33, 1, 1]], vls: [[0.23, 0.08, 0.5]], heli: 0.16 };
const KIROV: ShipSpec = { g: 'ship', beam: 0.15, fb: 0.075, fc: [0.12, 0.01], blocks: [[0.05, 0.24, 0.72, 0.09, 0.05], [-0.16, 0.12, 0.62, 0.07, 0.05]], masts: [{ x: 0.09, h: 0.16, s: 'lat', r: 'big', w: 0.07 }, { x: -0.12, h: 0.12, s: 'lat', r: 'rot' }], funnels: [[-0.03, 0.06, 0.05, 2]], vls: [[0.28, 0.16, 0.6]], guns: [[-0.4, 3, 0]], ciws: [[0.18, 0.045], [0.18, -0.045], [-0.25, 0]], heli: 0.0 };
const SLAVA: ShipSpec = { g: 'ship', beam: 0.14, fb: 0.07, fc: [0.1, 0.012], blocks: [[0.08, 0.2, 0.7, 0.09], [-0.12, 0.1, 0.6, 0.06]], masts: [{ x: 0.06, h: 0.15, s: 'lat', r: 'big' }, { x: -0.1, h: 0.1, s: 'lat', r: 'rot' }], funnels: [[-0.02, 0.06, 0.05, 2]], can: [[0.22, 4, 2]], guns: [[0.4, 3, 0]], heli: 0.1 };
const ZUMWALT: ShipSpec = { g: 'ship', beam: 0.14, fb: 0.06, bow: 'tumble', blocks: [[-0.06, 0.28, 0.82, 0.1, 0.32]], guns: [[0.2, 2, 1], [0.12, 2, 1]], heli: 0.16 };
const FREMM: ShipSpec = { g: 'ship', beam: 0.13, fb: 0.065, fc: [0.12, 0.01], blocks: [[0.02, 0.3, 0.86, 0.07, 0.14]], masts: [{ x: 0.06, h: 0.16, s: 'int', w: 0.05, r: 'dome' }], funnels: [[-0.07, 0.05, 0.04]], guns: [[0.33, 1, 1]], vls: [[0.22, 0.07, 0.5]], heli: 0.16, hangar: 0.0 };
const T23: ShipSpec = { g: 'ship', beam: 0.13, fb: 0.065, fc: [0.12, 0.012], blocks: [[0.07, 0.18, 0.8, 0.07, 0.1], [-0.12, 0.14, 0.72, 0.06, 0.1]], masts: [{ x: 0.08, h: 0.1, s: 'lat', r: 'rot' }, { x: -0.08, h: 0.09, s: 'pole', r: 'dome' }], funnels: [[-0.03, 0.05, 0.04]], guns: [[0.33, 1, 1]], vls: [[0.24, 0.05, 0.4]], can: [[0.18, 2]], heli: 0.14 };
const T26: ShipSpec = S(FREMM, { blocks: [[0.02, 0.32, 0.88, 0.075, 0.12]], masts: [{ x: 0.07, h: 0.15, s: 'int', w: 0.055, r: 'rot' }], guns: [[0.34, 2, 1]], vls: [[0.24, 0.07, 0.55]] });
const LAFAYETTE: ShipSpec = { g: 'ship', beam: 0.13, fb: 0.065, fc: [0.1, 0.01], blocks: [[0.0, 0.34, 0.92, 0.07, 0.3]], masts: [{ x: 0.06, h: 0.12, s: 'int', w: 0.05, r: 'rot' }], guns: [[0.32, 1, 1]], heli: 0.16 };
const FDI: ShipSpec = S(LAFAYETTE, { blocks: [[0.02, 0.3, 0.9, 0.075, 0.25]], masts: [{ x: 0.06, h: 0.17, s: 'int', w: 0.06, r: 'dome' }], vls: [[0.22, 0.06, 0.45]] });
const F125: ShipSpec = S(FREMM, { blocks: [[0.08, 0.2, 0.86, 0.08, 0.15], [-0.14, 0.14, 0.8, 0.07, 0.15]], masts: [{ x: 0.08, h: 0.17, s: 'int', w: 0.05, r: 'dome' }, { x: -0.12, h: 0.12, s: 'int', w: 0.045, r: 'none' }], guns: [[0.34, 2, 1]] });
const VISBY: ShipSpec = { g: 'ship', beam: 0.15, fb: 0.07, fc: [0.1, 0.0], blocks: [[-0.02, 0.38, 0.95, 0.055, 0.35]], guns: [[0.28, 0, 1]], heli: 0.12 };
const CORVETTE: ShipSpec = { g: 'ship', beam: 0.14, fb: 0.065, fc: [0.12, 0.01], blocks: [[0.05, 0.24, 0.82, 0.07, 0.14]], masts: [{ x: 0.07, h: 0.13, s: 'tower', w: 0.05 }], funnels: [[-0.08, 0.05, 0.04]], guns: [[0.33, 1, 1]], vls: [[0.22, 0.05, 0.4]], heli: 0.14 };
const GORSHKOV: ShipSpec = S(CORVETTE, { beam: 0.13, blocks: [[0.04, 0.26, 0.85, 0.08, 0.14]], masts: [{ x: 0.05, h: 0.17, s: 'tower', w: 0.06 }], guns: [[0.34, 2, 1]], vls: [[0.23, 0.08, 0.5]], heli: 0.15 });
const T054A: ShipSpec = { g: 'ship', beam: 0.13, fb: 0.065, fc: [0.12, 0.01], blocks: [[0.04, 0.24, 0.82, 0.07, 0.15], [-0.14, 0.1, 0.72, 0.06, 0.12]], masts: [{ x: 0.06, h: 0.11, s: 'int', w: 0.045, r: 'rot' }], funnels: [[-0.05, 0.06, 0.04]], guns: [[0.33, 1, 1]], vls: [[0.23, 0.06, 0.45]], ciws: [[-0.06, 0.04], [-0.06, -0.04]], heli: 0.14 };
const KONGO: ShipSpec = S(BURKE, { beam: 0.13, blocks: [[0.05, 0.22, 0.84, 0.1, 0.08], [-0.17, 0.1, 0.62, 0.05, 0.1]], masts: [{ x: 0.02, h: 0.14, s: 'lat', r: 'rot' }], spy: [[0.08, 0.075, 0.024, 0.085, 4]] });
const SOVREM: ShipSpec = { g: 'ship', beam: 0.12, fb: 0.065, fc: [0.1, 0.012], blocks: [[0.08, 0.18, 0.72, 0.08], [-0.12, 0.12, 0.62, 0.06]], masts: [{ x: 0.07, h: 0.13, s: 'lat', r: 'dome' }, { x: -0.05, h: 0.12, s: 'lat', r: 'rot' }], funnels: [[-0.01, 0.07, 0.05]], guns: [[0.34, 3, 0], [-0.38, 3, 0]], can: [[0.2, 2, 1]], heli: 0.0 };
const UDALOY: ShipSpec = S(SOVREM, { blocks: [[0.08, 0.18, 0.72, 0.08], [-0.12, 0.16, 0.62, 0.06]], funnels: [[-0.02, 0.05, 0.05, 2], [-0.12, 0.05, 0.05, 2]], guns: [[0.36, 2, 0]], heli: 0.12, can: [[0.22, 2, 1]] });
const OPV: ShipSpec = { g: 'ship', beam: 0.15, fb: 0.07, fc: [0.2, 0.012], blocks: [[0.08, 0.24, 0.8, 0.07, 0.1]], masts: [{ x: 0.08, h: 0.1, s: 'pole', r: 'rot' }], guns: [[0.32, 0, 0]], heli: 0.18, win: true };
const MISSILEBOAT: ShipSpec = { g: 'ship', beam: 0.17, fb: 0.07, fc: [0.2, 0.01], blocks: [[0.06, 0.24, 0.8, 0.07, 0.14]], masts: [{ x: 0.07, h: 0.1, s: 'int', w: 0.04, r: 'rot' }], guns: [[0.3, 0, 1]], can: [[-0.18, 2]], win: true };
const FASTBOAT: ShipSpec = { g: 'ship', beam: 0.22, fb: 0.08, blocks: [[0.02, 0.28, 0.7, 0.08, 0.2]], masts: [{ x: 0.0, h: 0.1, s: 'pole', r: 'dome' }], guns: [[0.28, 0, 0]], win: true, bow: 'round' };
const USV: ShipSpec = { g: 'ship', beam: 0.2, fb: 0.05, blocks: [[-0.12, 0.2, 0.6, 0.035, 0.3]], hullC: 0x2c3036, bow: 'clip' };

const NIMITZ: CarrierSpec = { g: 'cv', beam: 0.2, fb: 0.09, ang: 0.16, isl: [[-0.05, 0.08, 0.035, 0.085]], cats: 4, planes: 8, port: 0.35 };
const FORD: CarrierSpec = CV(NIMITZ, { isl: [[-0.2, 0.065, 0.035, 0.075]] });
const KUZ: CarrierSpec = { g: 'cv', beam: 0.2, fb: 0.09, ang: 0.12, isl: [[-0.02, 0.15, 0.035, 0.1]], ski: 0.2, planes: 6, port: 0.28 };
const QE: CarrierSpec = { g: 'cv', beam: 0.2, fb: 0.09, ang: 0, isl: [[0.1, 0.08, 0.03, 0.085], [-0.14, 0.08, 0.03, 0.08]], ski: 0.12, planes: 6 };
const CDG: CarrierSpec = CV(NIMITZ, { beam: 0.2, isl: [[0.1, 0.08, 0.035, 0.085]], cats: 2 });
const CAVOUR: CarrierSpec = { g: 'cv', beam: 0.18, fb: 0.08, ang: 0, isl: [[0.0, 0.2, 0.032, 0.075]], ski: 0.12, planes: 5, ptype: 'mix' };
const LHA: CarrierSpec = { g: 'cv', beam: 0.18, fb: 0.09, ang: 0, isl: [[-0.02, 0.16, 0.032, 0.075]], planes: 6, ptype: 'mix', well: true, bowSharp: false };
const IZUMO: CarrierSpec = CV(LHA, { isl: [[0.0, 0.22, 0.03, 0.065]], well: false, ptype: 'heli', bowSharp: true });
const JCI: CarrierSpec = CV(LHA, { ski: 0.12, isl: [[0.0, 0.16, 0.03, 0.075]] });
const MISTRAL: CarrierSpec = CV(LHA, { isl: [[0.12, 0.15, 0.03, 0.07]], ptype: 'heli', planes: 5 });

const VIRGINIA: SubSpec = { g: 'sub', D: 0.09, sail: [0.22, 0.08, 0.05, 0], planes: 'bow', tail: '+', pump: true };
const LOSANGELES: SubSpec = { g: 'sub', D: 0.09, sail: [0.24, 0.08, 0.055, 0], planes: 'sail', tail: '+' };
const SEAWOLF: SubSpec = { g: 'sub', D: 0.12, sail: [0.2, 0.09, 0.05, 1], planes: 'bow', tail: '+', pump: true };
const OHIO: SubSpec = { g: 'sub', D: 0.075, sail: [0.28, 0.06, 0.05, 0], planes: 'sail', hump: [-0.02, 0.36, 0.012], tail: '+' };
const COLUMBIA: SubSpec = { g: 'sub', D: 0.08, sail: [0.26, 0.07, 0.05, 1], planes: 'sail', hump: [-0.02, 0.28, 0.012], tail: 'x', pump: true };
const BOREI: SubSpec = { g: 'sub', D: 0.1, sail: [0.17, 0.11, 0.055, 1], planes: 'bow', hump: [-0.06, 0.3, 0.025], tail: '+', pump: true };
const DELTA: SubSpec = { g: 'sub', D: 0.1, sail: [0.25, 0.08, 0.05, 0], planes: 'sail', hump: [-0.02, 0.34, 0.05], tail: '+' };
const T094: SubSpec = { g: 'sub', D: 0.1, sail: [0.25, 0.08, 0.05, 0], planes: 'sail', hump: [0.0, 0.26, 0.035], tail: '+' };
const AKULA: SubSpec = { g: 'sub', D: 0.12, sail: [0.08, 0.12, 0.06, 1], planes: 'bow', tail: '+', pod: true };
const OSCAR: SubSpec = { g: 'sub', D: 0.13, wide: 1.35, sail: [0.1, 0.12, 0.06, 1], planes: 'bow', tail: '+' };
const YASEN: SubSpec = { g: 'sub', D: 0.11, sail: [0.2, 0.11, 0.05, 1], planes: 'bow', tail: '+', pump: true };
const KILO: SubSpec = { g: 'sub', D: 0.15, shape: 'tear', sail: [0.1, 0.12, 0.06, 1], planes: 'bow', tail: '+' };
const T212: SubSpec = { g: 'sub', D: 0.12, sail: [0.15, 0.1, 0.07, 2], planes: 'sail', tail: 'x' };
const SCORPENE: SubSpec = { g: 'sub', D: 0.11, sail: [0.12, 0.09, 0.065, 0], planes: 'sail', tail: '+' };
const SORYU: SubSpec = { g: 'sub', D: 0.11, sail: [0.18, 0.1, 0.075, 0], planes: 'sail', tail: 'x' };
const COLLINS: SubSpec = { g: 'sub', D: 0.1, sail: [0.12, 0.08, 0.065, 0], planes: 'bow', tail: 'x' };
const T093: SubSpec = { g: 'sub', D: 0.11, sail: [0.2, 0.1, 0.055, 1], planes: 'sail', tail: '+', pump: true };
const ASTUTE: SubSpec = { g: 'sub', D: 0.11, sail: [0.22, 0.1, 0.05, 1], planes: 'bow', tail: '+', pump: true };
const BARRACUDA: SubSpec = { g: 'sub', D: 0.11, sail: [0.18, 0.08, 0.06, 1], planes: 'sail', tail: 'x', pump: true };
const MIDGET: SubSpec = { g: 'sub', D: 0.13, sail: [0.1, 0.12, 0.08, 0], planes: 'bow', tail: '+' };

const LPD: ShipSpec = { g: 'ship', beam: 0.15, fb: 0.09, bow: 'round', blocks: [[0.12, 0.3, 0.9, 0.08, 0.18]], masts: [{ x: 0.2, h: 0.12, s: 'int', w: 0.05, r: 'dome' }, { x: 0.02, h: 0.12, s: 'int', w: 0.05, r: 'none' }], heli: 0.34, well: true, ciws: [[0.3, 0]] };
const LSD: ShipSpec = S(LPD, { blocks: [[0.22, 0.2, 0.9, 0.08, 0.08]], masts: [{ x: 0.2, h: 0.12, s: 'lat', r: 'rot' }], heli: 0.2 });
const LST: ShipSpec = { g: 'ship', beam: 0.15, fb: 0.08, bow: 'round', blocks: [[-0.22, 0.18, 0.8, 0.08, 0.06]], masts: [{ x: -0.2, h: 0.1, s: 'lat', r: 'rot' }], guns: [[0.25, 0, 0]], well: false };
const BAYCLASS: ShipSpec = { g: 'ship', beam: 0.15, fb: 0.09, bow: 'round', blocks: [[0.25, 0.14, 0.9, 0.08, 0.06]], masts: [{ x: 0.24, h: 0.1, s: 'pole', r: 'rot' }], heli: 0.3, well: true };

// ===========================================================================
// Soldiers & light vehicles by nation style
// ===========================================================================
function soldierFor(d: UnitDesign, st: Style, r: Rng, sof: boolean): SoldierSpec {
  const n = (d.name + ' ' + d.description).toLowerCase();
  let helm: SoldierSpec['helm'] = st === 'ru' ? 'ssh' : st === 'us' || st === 'as' || st === 'il' ? 'ach' : st === 'cn' ? 'ssh' : 'pasgt';
  if (/militia|basij|irregular|guard|bolivarian/.test(n)) helm = r.pick(['cap', 'wrap', 'cap'] as const);
  if (/airborne|para|vdv/.test(n)) helm = r.chance(0.5) ? 'beret' : helm;
  if (/jungle|selva|mountain/.test(n)) helm = 'boonie';
  if (sof) helm = r.pick(['bump', 'bump', 'boonie', 'cap'] as const);
  if (d.future || (d.year ?? 2000) >= 2030) helm = 'future';
  const wpn: SoldierSpec['wpn'] = /anti-tank|spike|javelin|atgm/.test(n) ? 'at' : sof ? r.pick(['rifle', 'sniper'] as const) : st === 'ru' || st === 'mid' || st === 'cn' ? r.pick(['rifle', 'rpg', 'rifle'] as const) : r.pick(['rifle', 'rifle', 'lmg', 'at'] as const);
  const camo = sof ? 0x3a3d33 : st === 'mid' ? COLS.TAN : st === 'ru' ? 0x5b6048 : st === 'cn' ? 0x51603f : st === 'us' ? 0x6e6a52 : 0x56603f;
  return { g: 'soldier', helm, wpn, pack: r.r(0.3, 1), camo, vest: helm !== 'wrap' && helm !== 'cap', bulk: helm === 'future' ? 1.15 : 1 };
}
const COLS = { TAN: 0x9a8a62 };
function lightVehFor(st: Style, r: Rng, militia = false): VehSpec {
  if (militia) return TECHNICAL;
  switch (st) {
    case 'us': return r.chance(0.6) ? JLTV : HUMVEE;
    case 'ru': return TIGR;
    case 'cn': return V(TIGR, { H: 0.3 });
    case 'mid': return r.chance(0.5) ? TECHNICAL : TIGR;
    case 'weu': return r.pick([LMV, V(JLTV, { tur: undefined, add: ['lmg'] }), FENNEK]);
    default: return r.chance(0.5) ? CARGO_TRUCK : HUMVEE;
  }
}

// ===========================================================================
// Derivation per category
// ===========================================================================
const SQUAD4: [number, number][] = [[0.3, 0], [0.08, -0.26], [0.08, 0.26], [-0.18, 0]];
const TRI_M: [number, number][] = [[0.28, 0], [-0.2, -0.3], [-0.2, 0.3]];

function varyVeh(s: VehSpec, r: Rng): VehSpec {
  const o: VehSpec = { ...s, L: r.v(s.L, 0.035), W: r.v(s.W, 0.03), H: r.v(s.H, 0.04) };
  if (o.tur) o.tur = { ...o.tur, w: r.v(o.tur.w, 0.04), l: r.v(o.tur.l, 0.05), h: r.v(o.tur.h, 0.05), gun: o.tur.gun ? r.v(o.tur.gun, 0.05) : o.tur.gun };
  return o;
}

function deriveArmor(d: UnitDesign, st: Style, r: Rng): VehSpec {
  const y = d.year ?? 2000;
  if (d.mobility === 'wheeled') return varyVeh(MCV8, r);
  let b: VehSpec;
  if (y >= 2030 || d.future) {
    b = st === 'ru' ? T14 : st === 'cn' ? V(T14, { n: 6 }) : st === 'il' ? V(MERKAVA, { skirt: 2 }, { t: 'unm' }) : V(KF51, {}, { t: 'unm', h: 0.085, gun: 0.66 });
  } else switch (st) {
    case 'us': b = y < 1975 ? M60 : ABRAMS; break;
    case 'weu': b = y < 1980 ? LEO1 : y < 1998 ? LEO2A4 : LEO2A6; break;
    case 'ru': case 'mid': b = y < 1968 ? T55 : y < 1990 ? T72 : y < 2008 ? T72B3 : y < 2016 ? T90A : T90M; break;
    case 'cn': b = y < 1995 ? V(T55, { skirt: 1 }) : y < 2008 ? TYPE96 : TYPE99; break;
    case 'as': b = y < 1995 ? V(M60, { skirt: 1 }) : K2; break;
    case 'il': b = MERKAVA; break;
    default: b = y < 1985 ? CENTURION : T72B3;
  }
  const s = varyVeh(b, r);
  if (y >= 2012 && s.tur && r.chance(0.5)) s.tur = { ...s.tur, rws: true };
  return s;
}

function deriveMech(d: UnitDesign, st: Style, r: Rng): VehSpec {
  const y = d.year ?? 2000;
  const n = (d.name + ' ' + d.description).toLowerCase();
  if (/technical|pickup|toyota/.test(n)) return TECHNICAL;
  if (d.mobility === 'tracked') {
    let b: VehSpec;
    if (/\bapc\b|m113|armou?red personnel/.test(n) && !/ifv/.test(n)) b = st === 'ru' ? MTLB : M113;
    else if (/heavy/.test(n) || st === 'il') b = NAMER;
    else switch (st) {
      case 'ru': case 'mid': b = y < 1975 ? BMP1 : y < 1985 ? BMP2 : y < 2015 ? BMP3 : KURGANETS; break;
      case 'cn': b = y < 2010 ? BMP3 : V(BMP3, { H: 0.23 }, { t: 'ifv' }); break;
      case 'us': b = y < 1985 ? M113 : BRADLEY; break;
      case 'weu': b = y < 1990 ? WARRIOR : y < 2010 ? CV90 : y < 2020 ? PUMA : LYNX; break;
      case 'as': b = y < 2000 ? V(BRADLEY, { add: [] }, { atgm: 'twin' }) : V(CV90, { skirt: 1 }); break;
      default: b = CV90;
    }
    return varyVeh(b, r);
  }
  const ax = axlesOf(d) ?? (d.cost < 250 ? 2 : d.cost < 430 ? 3 : 4);
  if (ax <= 2) return varyVeh(/mrap|mine|bushmaster|casspir|kirpi|mamba/.test(n) || y >= 1990 ? MRAP : V(BRDM, { tur: undefined, add: ['lmg'] }), r);
  let b: VehSpec;
  if (st === 'ru' || (st === 'mid' && y < 2005)) b = y < 2000 ? BTR80 : BTR4;
  else if (/ifv|cannon|30 ?mm|25 ?mm|40 ?mm/.test(n)) b = /boxer/.test(n) ? BOXER : PATRIA;
  else b = PIRANHA;
  b = V(b, { n: ax });
  if (ax === 3) b = V(b, { L: 0.92 });
  return varyVeh(b, r);
}

function deriveRecon(d: UnitDesign, st: Style, r: Rng): VehSpec {
  const n = (d.name + ' ' + d.description).toLowerCase();
  const ax = axlesOf(d);
  if (d.mobility === 'tracked') return varyVeh(AJAX, r);
  if (/robotic|unmanned/.test(n)) return varyVeh(V(PUMA, { L: 0.8, H: 0.2 }, { t: 'rws' }), r);
  if ((ax ?? 0) >= 3 || /\b(76|90|105|120) ?mm|gun/.test(n)) return varyVeh(V(RECON8, { n: ax ?? 4 }), r);
  if (st === 'ru') return varyVeh(/brdm/.test(n) ? BRDM : TIGR, r);
  if (/sensor|mast|scout/.test(n) && st === 'weu') return varyVeh(FENNEK, r);
  return varyVeh(st === 'us' ? JLTV : r.chance(0.5) ? LMV : FENNEK, r);
}

function deriveArtillery(d: UnitDesign, st: Style, r: Rng): { main: ModelSpec; extra?: ModelSpec } {
  const n = (d.name + ' ' + d.description).toLowerCase();
  if (/mortar/.test(n)) return { main: varyVeh(V(PATRIA, {}, { t: 'sph', w: 0.3, l: 0.34, h: 0.1, gun: 0.2, brake: false }), r) };
  const towed = /towed|light gun/.test(n) && !/self-propelled|truck-mounted|wheeled sp/.test(n);
  if (towed) {
    const big = /155|152/.test(n);
    const base: TowedSpec = st === 'ru' && !big ? D30 : big ? (r.chance(0.5) ? FH70 : M777) : LIGHTGUN;
    return { main: { ...base, bl: r.v(base.bl, 0.05) }, extra: st === 'ru' || st === 'mid' ? CARGO_BONNET : CARGO_TRUCK };
  }
  if (d.mobility === 'tracked' || /tracked/.test(n)) {
    const b = st === 'ru' || st === 'mid' ? ((d.year ?? 2000) < 1980 ? S2S3 : MSTA) : st === 'cn' ? PLZ05 : st === 'as' ? K9 : st === 'us' ? PALADIN : PZH2000;
    return { main: varyVeh(b, r) };
  }
  const ax = axlesOf(d);
  if (/turret|automated|fully automatic|boxer/.test(n)) return { main: varyVeh(ax && ax >= 4 ? V(BOXER, {}, { t: 'sph', w: 0.4, l: 0.44, h: 0.15, gun: 0.66, gr: 0.018, brake: true, fume: true, x: -0.14 }) : ARCHER, r) };
  return { main: varyVeh(V(TRUCKGUN, { n: ax ?? 3 }), r) };
}

function deriveRockets(d: UnitDesign, st: Style, r: Rng): VehSpec {
  const n = (d.name + ' ' + d.description).toLowerCase();
  if (d.mobility === 'tracked') return varyVeh(/thermobaric|tos/.test(n) ? TOS1 : M270, r);
  const heavy = /300 ?mm|220 ?mm|240 ?mm|heavy|370 ?mm|guided/.test(n) || d.cost > 420;
  if (st === 'ru' || st === 'mid' || (st === 'cn' && !heavy) || st === 'oth') return varyVeh(heavy ? (st === 'ru' ? SMERCH : URAGAN) : GRAD, r);
  if (st === 'us' && !heavy) return varyVeh(HIMARS, r);
  return varyVeh(heavy ? PHL16 : ASTROS, r);
}

function deriveAD(d: UnitDesign, st: Style, r: Rng): { main: ModelSpec; extra?: ModelSpec } {
  const n = (d.name + ' ' + d.description).toLowerCase();
  const ra = d.rangeAir;
  const rus = st === 'ru' || st === 'cn' || st === 'mid';
  if (/laser|high-energy|directed/.test(n)) return { main: varyVeh(V(STRYKER, {}, { t: 'aa', w: 0.3, l: 0.3, h: 0.12, gun: 0.12, radar: 'panel' }), r) };
  if (/gun|cannon|spaag|35 ?mm|30 ?mm|23 ?mm|skyranger|skynex/.test(n) && ra <= 3) {
    if (d.mobility === 'tracked') return { main: varyVeh(rus ? ((d.year ?? 2000) < 1975 ? ZSU234 : TUNGUSKA) : GEPARD, r) };
    return { main: varyVeh(V(BOXER, {}, { t: 'aa', w: 0.34, l: 0.34, h: 0.12, gun: 0.35, gr: 0.008, radar: 'panel' }), r) };
  }
  if (ra >= 4) {
    const main = rus ? (/tracked/.test(d.mobility) ? S300V : r.chance(0.5) ? S400 : S300) : r.chance(0.5) ? PATRIOT : V(VERTSAM, { n: 4 });
    return { main: varyVeh(main, r), extra: rus ? S400_RADAR : PATRIOT_RADAR };
  }
  if (d.mobility === 'tracked') return { main: varyVeh(rus ? (r.chance(0.5) ? BUK : TOR) : V(TOR, {}), r) };
  if (ra <= 2) return { main: varyVeh(AVENGER, r) };
  return { main: varyVeh(r.chance(0.5) ? NASAMS : VERTSAM, r), extra: AESA_RADAR };
}

function deriveMissile(d: UnitDesign, st: Style, r: Rng): VehSpec {
  const n = (d.name + ' ' + d.description).toLowerCase();
  if (d.attackNaval > d.attackSoft || /anti-ship|coastal/.test(n)) {
    return varyVeh(/bastion|brahmos|yakhont|yj-|3 missiles/.test(n) || st === 'ru' || st === 'cn' ? BASTION : COASTAL, r);
  }
  if (/icbm|intercontinental/.test(n) || d.rangeGround >= 8 && d.cost > 1300) return varyVeh(st === 'us' ? SILO_ICBM : V(ICBM_TEL, { cab: st === 'ru' ? 'maz' : 'armored' }), r);
  if (/irbm|mrbm|intermediate|medium-range|hypersonic/.test(n)) return varyVeh(V(IRBM_TEL, { pay: { k: 'tel', l: 0.8, r: 0.055, a: 0, can: st !== 'mid' && st !== 'ru', stages: 2 } }), r);
  if (/cruise/.test(n)) return varyVeh(st === 'us' || st === 'weu' ? TYPHON : V(COASTAL, { n: 4 }), r);
  return varyVeh(st === 'ru' ? ISKANDER : st === 'mid' ? SCUD : V(ISKANDER, { cab: 'flat', pay: { k: 'tel', l: 0.6, r: 0.042, a: 0, n: 2, can: st === 'cn' } }), r);
}

function deriveFighter(d: UnitDesign, st: Style, r: Rng): AirSpec {
  const y = d.year ?? 2000;
  const n = (d.name + ' ' + d.description).toLowerCase();
  const cat = d.category;
  let b: AirSpec;
  if (y >= 2033 || /6th|sixth|ngad|gcap|tempest|scaf|ngf/.test(n)) b = r.pick([TAILLESS6, GCAP, NGAD]);
  else if (d.stealth >= 0.55) b = st === 'ru' ? SU57 : st === 'cn' ? r.pick([J20, A(F35, { vt: { ...F35.vt!, cant: 0.5 } })]) : st === 'as' ? KF21 : r.chance(0.5) ? F35 : A(F22, { r: 0.052 });
  else if (cat === UnitCategory.Strike && (d.speedKmh < 700 || /turboprop|tucano/.test(n))) b = TURBOPROP_TRAINER;
  else if (cat === UnitCategory.Strike && (/trainer|light attack|lead-in|jet trainer/.test(n) || d.cost < 700)) b = TRAINER;
  else if (/patrol|maritime|mpa|poseidon|orion|aurora/.test(n)) b = /p-3|orion|aurora|turboprop/.test(n) ? A(C130, { wing: { ...C130.wing!, y: -0.7 }, vt: { ...C130.vt!, y: 0.3 } }) : AIRLINER;
  else if (/gunship/.test(n)) b = C130;
  else if (/swing|variable-geometry/.test(n)) b = st === 'ru' ? SU24 : TORNADO;
  else if (y < 1972) b = st === 'ru' || st === 'cn' ? MIG21 : A(F16, { r: 0.04, int: 'side' });
  else switch (st) {
    case 'ru': b = d.cost > 1400 || cat === UnitCategory.Fighter ? (cat === UnitCategory.Strike ? SU34 : FLANKER) : FULCRUM; break;
    case 'cn': b = d.cost > 1500 ? FLANKER : r.chance(0.5) ? J10 : JF17; break;
    case 'us': b = cat === UnitCategory.Fighter || cat === UnitCategory.Strike ? F15 : d.cost > 2000 ? HORNET : F16; break;
    case 'weu': b = d.cost > 2200 ? r.pick([RAFALE, TYPHOON]) : r.pick([GRIPEN, MIRAGE2000]); break;
    case 'as': b = r.pick([F16, A(F16, { vt: { ...F16.vt!, h: 0.2 }, int: 'side' })]); break;
    case 'il': b = F16; break;
    default: b = r.pick([F16, MIRAGE2000, FULCRUM]);
  }
  const o: AirSpec = { ...b, r: r.v(b.r, 0.05) };
  if (o.wing) o.wing = { ...o.wing, span: r.v(o.wing.span, 0.05), sweep: r.v(o.wing.sweep, 0.06) };
  return o;
}

function deriveBomber(d: UnitDesign, st: Style, r: Rng): AirSpec {
  if (d.stealth >= 0.5) return st === 'us' ? B21 : A(B2, { pf: [[0.3, 0], [-0.1, r.v(0.55)], [-0.17, 0.55], [-0.08, 0.25], [-0.18, 0]] });
  if (d.speedKmh > 1500) return st === 'ru' ? TU160 : B1B;
  return st === 'ru' ? TU95 : st === 'cn' ? H6 : B52;
}

function deriveHeli(d: UnitDesign, st: Style, r: Rng): HeliSpec {
  const n = (d.name + ' ' + d.description).toLowerCase();
  if (/tilt-?rotor|tiltrotor/.test(n)) return /v-280|valor|flraa/.test(n) ? V280 : OSPREY;
  if (/tandem|chinook/.test(n)) return CHINOOK;
  if (/coaxial|ka-/.test(n)) return KA52;
  if (d.attackHard >= 45 || /attack|gunship|armed scout/.test(n)) {
    const b = st === 'ru' ? (/mi-2[45]|mi-35|hind/.test(n) ? HIND : MI28) : st === 'us' ? APACHE : r.pick([TIGER, COBRA, TIGER]);
    return { ...b, r: r.v(b.r, 0.04) };
  }
  if (/heavy|super stallion|mi-26/.test(n)) return st === 'ru' ? MI26 : CH53;
  if (/naval|anti-submarine|asw|maritime/.test(n)) return SEAHAWK;
  if (d.cost < 250 || /light/.test(n)) return st === 'ru' ? H(LIGHTHELI, { b: 3 }) : LIGHTHELI;
  return st === 'ru' || st === 'mid' ? MI8 : r.chance(0.5) ? BLACKHAWK : NH90;
}

function deriveTransport(d: UnitDesign, st: Style, r: Rng): ModelSpec {
  const n = (d.name + ' ' + d.description).toLowerCase();
  if (/helicopter|rotor/.test(n)) return deriveHeli(d, st, r);
  if (/tanker|mrtt|refuel/.test(n)) return /h-6|h6u/.test(n) ? H6 : A(AIRLINER, { r: r.v(0.06), eng: /kc-135|stratotanker|4 engines|four/.test(n) ? { n: 4, k: 'pod', r: 0.024, l: 0.11, x: 0.06, z: [0.2, 0.34, -0.2, -0.34] } : AIRLINER.eng });
  const big = d.cost > 1100 || /strategic|heavy|outsize/.test(n);
  if (/turboprop|propeller/.test(n) || (!big && d.cost < 900)) return big || /four|4 /.test(n) ? C130 : TWINPROP;
  if (big) return /an-124|ruslan|c-5|galaxy/.test(n) ? A(C17, { r: 0.08, tt: /c-5|galaxy/.test(n), vt: { ...C17.vt!, y: 0.6 } }) : C17;
  return TWINJET_TT;
}

function deriveDrone(d: UnitDesign, st: Style, r: Rng): DesignVisual {
  const n = (d.name + ' ' + d.description).toLowerCase();
  const small = { members: TRI_M, scale: 0.55 };
  if (/loiter|kamikaze|one-way|munition|suicide/.test(n) || d.cost < 110) {
    if (/lancet|switchblade|warmate|kub|x-wing/.test(n)) return { main: LANCET, ...small };
    if (/quad|fpv|rotor/.test(n)) return { main: SMALLUAV, ...small };
    return { main: A(SHAHED, { r: r.v(0.03) }), ...small };
  }
  if (/high-altitude|hale|global hawk|triton|wz-7|soaring/.test(n)) return { main: GLOBALHAWK };
  if (d.speedKmh > 520 || /jet|ucav|wingman|stealth|combat aircraft/.test(n)) {
    if (/flying.wing|tailless|okhotnik|neuron|gj-11|sharp sword|x-47|stingray/.test(n) || d.stealth >= 0.6) return { main: FLYWING_UCAV };
    return { main: A(WINGMAN, { r: r.v(0.045) }) };
  }
  if (/twin.boom|tb2|tb3|heron|mohajer|hermes|anka/.test(n) || st === 'weu' || st === 'mid') return { main: r.chance(0.5) ? TB2 : HARFANG_TB, scale: 0.9 };
  if (d.cost < 200) return { main: SMALLUAV, members: [[0.15, -0.2], [-0.12, 0.2]], scale: 0.7 };
  return { main: A(REAPER, { wing: { ...REAPER.wing!, span: r.v(0.6, 0.06) } }) };
}

function varyShip(s: ShipSpec, r: Rng): ShipSpec {
  return {
    ...s, beam: r.v(s.beam, 0.05),
    blocks: s.blocks?.map(([x, l, w, h, t]) => [x + r.r(-0.02, 0.02), r.v(l, 0.08), w, r.v(h, 0.08), t] as [number, number, number, number, number?]),
  };
}

function deriveSurface(d: UnitDesign, st: Style, r: Rng): ShipSpec {
  const n = (d.name + ' ' + d.description).toLowerCase();
  const y = d.year ?? 2000;
  const stealthy = y >= 2005 || d.future;
  switch (d.category) {
    case UnitCategory.PatrolBoat:
      if (/unmanned|usv|drone boat|sea baby|magura|swarm/.test(n)) return USV;
      if (/riverine|river|assault craft|cb90|fast attack craft|patrol boat|speedboat|swarm|flotilla|peykaap|zolfaghar|dabur|defender/.test(n) && d.cost < 120) return varyShip(FASTBOAT, r);
      if (d.attackNaval > 40 && d.cost < 260) return varyShip(MISSILEBOAT, r);
      return varyShip(OPV, r);
    case UnitCategory.Cruiser: return varyShip(st === 'ru' ? KIROV : st === 'cn' ? T055 : TICO, r);
    case UnitCategory.Destroyer:
      if (st === 'ru') return varyShip(y < 1995 ? r.pick([SOVREM, UDALOY]) : GORSHKOV, r);
      if (st === 'cn') return varyShip(y < 2010 ? T052D : T055, r);
      if (st === 'us' || st === 'as') return varyShip(d.future ? ZUMWALT : st === 'as' ? KONGO : BURKE, r);
      return varyShip(r.pick([T45, F125, FREMM]), r);
    default: // Frigate
      if (d.cost < 500 || /corvette|opv|offshore patrol/.test(n)) return varyShip(stealthy ? (st === 'weu' && r.chance(0.3) ? VISBY : CORVETTE) : S(OPV, { guns: [[0.3, 1, 0]] }), r);
      if (st === 'ru') return varyShip(y < 2010 ? S(SOVREM, { guns: [[0.34, 1, 0]], blocks: [[0.08, 0.18, 0.72, 0.07], [-0.12, 0.12, 0.62, 0.05]] }) : GORSHKOV, r);
      if (st === 'cn') return varyShip(T054A, r);
      if (!stealthy) return varyShip(T23, r);
      return varyShip(r.pick([FREMM, LAFAYETTE, FDI, T26, F125]), r);
  }
}

function deriveCarrier(d: UnitDesign, st: Style, r: Rng): CarrierSpec {
  const n = (d.name + ' ' + d.description).toLowerCase();
  if (/ski-?jump|stobar/.test(n)) return CV(KUZ, { isl: [[r.r(-0.08, 0.04), r.v(0.13), 0.035, 0.09]] });
  if (/catapult|emals|catobar|supercarrier/.test(n) || d.cost > 9000) return CV(NIMITZ, { isl: [[r.r(-0.2, 0.0), 0.07, 0.035, 0.08]] });
  if (/helicopter|lhd|amphibious|drone carrier/.test(n) || d.cost < 5000) return CV(JCI, { ski: /ski/.test(n) ? 0.12 : 0 });
  return st === 'weu' ? QE : KUZ;
}

function deriveSub(d: UnitDesign, st: Style, r: Rng): SubSpec {
  const n = (d.name + ' ' + d.description).toLowerCase();
  if (/ballistic|ssbn|slbm/.test(n)) return st === 'ru' ? BOREI : st === 'us' ? COLUMBIA : st === 'cn' ? T094 : SB(COLUMBIA, { tail: st === 'weu' ? 'x' : '+' });
  if (/nuclear|ssn|ssgn/.test(n)) return st === 'ru' ? YASEN : st === 'cn' ? T093 : st === 'us' ? VIRGINIA : ASTUTE;
  if (/midget|small|coastal/.test(n) || d.cost < 700) return MIDGET;
  const b = st === 'ru' || st === 'mid' ? KILO : st === 'as' ? SORYU : st === 'weu' ? r.pick([T212, SCORPENE, COLLINS]) : SCORPENE;
  return { ...b, D: r.v(b.D, 0.06), sail: [r.v(b.sail[0], 0.15), r.v(b.sail[1], 0.08), r.v(b.sail[2], 0.08), b.sail[3]] };
}

function deriveAmphib(d: UnitDesign, st: Style, r: Rng): ModelSpec {
  const n = (d.name + ' ' + d.description).toLowerCase();
  if (/lhd|lha|assault ship|flat.?top|helicopter carrier|landing helicopter/.test(n)) return CV(LHA, { isl: [[r.r(-0.05, 0.1), r.v(0.15), 0.03, 0.075]] });
  if (/lpd|dock|lsd|mrss/.test(n)) return varyShip(r.chance(0.5) ? LPD : LSD, r);
  return varyShip(LST, r);
}

// ===========================================================================
// Hand-authored table
// ===========================================================================
type Entry = ModelSpec | DesignVisual;
const HAND: Record<string, Entry> = {
  // ---- Main battle tanks ----
  m1a2_sepv3_abrams: V(ABRAMS, {}, { rws: true, aps: true }),
  m1a2_sepv2_abrams: V(ABRAMS, {}, { rws: true }),
  m1a1_fep_abrams: ABRAMS,
  m1a1_egyptian: V(ABRAMS, {}, { bustle: 0.26 }),
  usa_m1e3_abrams: V(ABRAMS, { skirt: 2, L: 0.97 }, { t: 'unm', h: 0.085, nose: 0.4, aps: true, rws: true }),
  leopard_1a5: LEO1,
  leopard_2a4: LEO2A4,
  leopard_2a5: V(LEO2A6, {}, { gun: 0.6 }),
  leopard_2a6: LEO2A6,
  leopard_2a7: V(LEO2A6, { skirt: 2 }, { rws: true }),
  leopard_2a8: V(LEO2A6, { skirt: 2 }, { rws: true, aps: true }),
  leopard_2a8_plus: V(LEO2A6, { skirt: 2, L: 1.04 }, { rws: true, aps: true, gun: 0.7 }),
  leopard_2e: V(LEO2A6, {}, { nose: 0.1, taper: 0.06 }),
  strv_122: V(LEO2A6, { skirt: 2 }, { h: 0.12 }),
  challenger_2: CHALLENGER,
  challenger_3: V(CHALLENGER, { skirt: 2 }, { fume: false, aps: true, rws: true, taper: 0.14 }),
  leclerc: LECLERC,
  leclerc_xlr: V(LECLERC, { skirt: 2 }, { rws: true, aps: true }),
  ariete: ARIETE,
  altay: V(K2, { n: 6 }, { nose: 0.2, taper: 0.08, rws: true }),
  tur_altay_t2: V(K2, { skirt: 2 }, { nose: 0.2, aps: true, rws: true }),
  m60t_sabra: V(M60, { skirt: 1 }, { t: 'ang', nose: 0.3, taper: 0.1, era: 1 }),
  pt91_twardy: V(T72B3, {}, { era: 1 }),
  t72m4cz: V(T72B3, { skirt: 2 }, { bustle: 0.25 }),
  t64bm_bulat: V(T72B3, { n: 6, add: ['era'] }, { era: 2 }),
  t84_oplot: V(T90M, { n: 6 }, { shtora: false, nose: 0.45 }),
  m84as: V(T72B3, {}, { era: 1, rws: true }),
  m84a4_snajper: V(T72, { skirt: 1 }, {}),
  deu_mgcs: V(KF51, { L: 1.08, skirt: 2 }, { t: 'unm', h: 0.08, gun: 0.72, gr: 0.024 }),
  deu_kf51_panther: KF51,
  pol_k2pl: V(K2, { L: 1.06, n: 7, skirt: 2 }, { aps: true }),
  ita_a2cs_panther_mbt: V(KF51, {}, { nose: 0.3 }),
  t55: T55,
  t62: V(T55, { L: 0.94, n: 5 }, { gun: 0.58 }),
  t72m: T72,
  t72b3: T72B3,
  t72b3m: V(T72B3, { skirt: 2, add: ['cage'] }, { era: 2 }),
  t80bvm: T80,
  t90a: T90A,
  t90s: V(T90A, {}, { era: 1 }),
  t90m: T90M,
  t14_armata: T14,
  rus_t14_serial: V(T14, {}, { rws: true }),
  merkava_mk3: V(MERKAVA, {}, { aps: false }),
  merkava_mk4: MERKAVA,
  isr_merkava_mk5: V(MERKAVA, { skirt: 2 }, { t: 'unm', h: 0.09, nose: 0.8, rws: true }),
  safir_74: V(T55, {}, { gun: 0.55 }),
  zulfiqar_1: V(M60, {}, { t: 'ang', nose: 0.3, taper: 0.15 }),
  zulfiqar_3: V(T72B3, {}, { t: 'ang', nose: 0.4, taper: 0.12 }),
  karrar: V(T90A, {}, { shtora: false }),
  ramses_ii_t54: V(T55, { n: 6, L: 0.95 }, {}),
  olifant_mk2: CENTURION,
  egy_local_mbt: V(ABRAMS, {}, { nose: 0.4, rws: true }),
  type_99a: V(TYPE99, {}, { rws: true, aps: true }),
  type_99: V(TYPE99, {}, { wedge: false }),
  type_96b: V(TYPE96, {}, { era: 1 }),
  type_96a: TYPE96,
  type_15: TYPE15,
  vt4: V(TYPE99, { L: 1, n: 6 }, { wedge: false, nose: 0.4, bustle: 0.3, rws: true }),
  type_59d: V(T55, { skirt: 1 }, { era: 1 }),
  chn_type_100: V(T14, { L: 1, n: 6 }, { nose: 0.4, rws: true }),
  arjun_mk1a: ARJUN,
  t90s_bhishma: V(T90A, {}, { era: 1 }),
  ajeya_t72: T72,
  ind_frcv: V(T14, { n: 6 }, { t: 'ang', h: 0.1 }),
  al_khalid: V(TYPE96, {}, { nose: 0.45, bustle: 0.2 }),
  al_khalid_2: V(TYPE96, { skirt: 2 }, { nose: 0.45, bustle: 0.25, rws: true, era: 1 }),
  al_zarrar: V(T55, { skirt: 1 }, { era: 1 }),
  type_10: TYPE10,
  type_90: V(LEO2A4, { n: 6 }, { nose: 0.1, bustle: 0.35 }),
  type_16_mcv: MCV8,
  k2_black_panther: K2,
  k1a2: V(K2, { n: 6 }, { nose: 0.2, taper: 0.14, bustle: 0.15, rws: false, h: 0.1 }),
  k1a1: V(K2, { n: 6, L: 0.98 }, { nose: 0.15, taper: 0.16, bustle: 0.12, rws: false, gun: 0.56 }),
  kor_k3: V(T14, { n: 6 }, { nose: 0.35, gun: 0.7, rws: true }),
  chonma_216: V(T90A, { n: 6, skirt: 2 }, { shtora: false, era: 2 }),
  pokpung_ho: V(T72, { n: 6, skirt: 1 }, { era: 1 }),
  chonma_ho: T55,
  cm11_brave_tiger: V(M60, {}, {}),
  harimau_kaplan: TYPE15,
  tam_2c: V(LEO1, { n: 6, H: 0.22 }, { t: 'ang', nose: 0.5, bustle: 0.1 }),
  arg_tam_3: V(LEO1, { n: 6, H: 0.22 }, { rws: true }),
  // ---- IFVs / APCs ----
  m2a4_bradley: V(BRADLEY, { skirt: 2 }),
  m2a4e1_bradley: V(BRADLEY, { skirt: 2 }, { aps: true }),
  usa_xm30_micv: V(LYNX, { L: 1.02 }, { t: 'unm', gun: 0.38 }),
  stryker_a1_icv: STRYKER,
  stryker_dragoon: V(STRYKER, {}, { t: 'ifv', w: 0.24, l: 0.26, h: 0.08, nose: 0.3, gun: 0.3, gr: 0.009 }),
  acv_marine: V(PATRIA, { nose: 'boat', nl: 0.3, H: 0.32 }, { t: 'rws', w: 0.1, l: 0.12, h: 0.06, gun: 0.13, gr: 0.006 }),
  lav25a2: V(PIRANHA, {}, { t: 'ifv', w: 0.22, l: 0.24, h: 0.08, nose: 0.4, gun: 0.3, gr: 0.008 }),
  lav6_canada: V(PIRANHA, { H: 0.31 }, { t: 'ifv', w: 0.24, l: 0.26, h: 0.08, nose: 0.4, gun: 0.28, gr: 0.008 }),
  m113a3: M113,
  v150_commando: V(BRDM, { L: 0.8 }, { gun: 0.16 }),
  puma: PUMA,
  lynx_kf41: LYNX,
  marder_1a3: V(CV90, { H: 0.24, n: 6 }, { t: 'ifv', gun: 0.26, nose: 0.4, x: 0.0 }),
  cv9030: V(CV90, {}, { gun: 0.28 }),
  cv9035: V(CV90, { skirt: 1 }, { gun: 0.34 }),
  cv9040: CV90,
  cv90_mkiv: V(CV90, { skirt: 2 }, { aps: true }),
  swe_cv90_next: V(CV90, { skirt: 2 }, { t: 'unm', aps: true }),
  ascod_ulan: V(CV90, { skirt: 1, H: 0.28 }, { nose: 0.35 }),
  borsuk: V(LYNX, { nose: 'boat' }, { t: 'unm', atgm: 'side' }),
  dardo: V(CV90, { n: 6 }, { atgm: 'twin' }),
  tulpar: V(LYNX, {}, { atgm: 'side' }),
  acv15: V(M113, {}, {}),
  warrior_ifv: WARRIOR,
  namer: NAMER,
  achzarit: V(NAMER, { H: 0.22, L: 0.95, nose: 'glacis', nl: 0.3 }),
  eitan_apc: V(BOXER, { H: 0.34, nose: 'glacis', nl: 0.2 }, { t: 'rws', w: 0.1, l: 0.14, h: 0.06, gun: 0.14, gr: 0.006 }),
  isr_carmel_ifv: V(NAMER, { L: 0.95 }, { t: 'unm', w: 0.24, l: 0.28, h: 0.08, gun: 0.3, gr: 0.01, aps: true }),
  bmp1: BMP1, bmp1_mod_pol: V(BMP1, {}, { t: 'ifv', w: 0.24, l: 0.26, gun: 0.26, gr: 0.008 }), bmp1_mod_ukr: V(BMP1, {}, { gun: 0.26, gr: 0.008 }),
  bmp2: BMP2, bmp2m: V(BMP2, {}, { atgm: 'twin' }), bmp2_sarath: BMP2,
  bmp3: BMP3,
  bmd4m: V(BMP3, { L: 0.82, H: 0.18, W: 0.48 }),
  mtlb: MTLB,
  btr60: V(BTR80, { H: 0.22, rearH: 0.2 }),
  btr70: V(BTR80, { H: 0.23 }),
  btr80: BTR80,
  btr82a: V(BTR80, {}, { gun: 0.22, w: 0.16, l: 0.16 }),
  btr4e: BTR4,
  kurganets25: KURGANETS,
  boomerang_k17: V(BOXER, { nose: 'boat', nl: 0.2 }, { t: 'unm', atgm: 'twin' }),
  rus_t15_serial: T15,
  boxer_ifv: BOXER,
  patria_amv: PATRIA,
  patria_6x6: V(MRAP, { n: 3, L: 0.9, H: 0.33, nose: 'boat' }),
  fin_next_patria: V(PATRIA, {}, { t: 'unm' }),
  rosomak: PATRIA,
  freccia: V(PATRIA, { nose: 'glacis' }, { atgm: 'twin' }),
  pandur_ii: V(PIRANHA, { n: 4 }),
  piranha_iiic: PIRANHA,
  vbci: VBCI,
  griffon: GRIFFON,
  vab: V(GRIFFON, { n: 2, L: 0.85, H: 0.3, nose: 'boat', nl: 0.26 }),
  kirpi: MRAP, casspir: V(MRAP, { H: 0.4 }, { t: 'rws' }), mamba_apc: MRAP, bushmaster_pmv: MRAP,
  ejder_yalcin: V(MRAP, { L: 0.9, nose: 'boat' }),
  pars_iii: V(PATRIA, { n: 4, nose: 'boat' }),
  toyota_technical: TECHNICAL,
  zbd_04a: V(BMP3, { skirt: 1 }, { atgm: 'side' }),
  zbd_05: V(BMP3, { L: 1, nose: 'boat', nl: 0.3, H: 0.22 }),
  zbd_03: V(BMP3, { L: 0.82, H: 0.19 }),
  zbl_08: V(PATRIA, { nose: 'boat' }, { gun: 0.3 }),
  zsl_10: V(PIRANHA, { n: 3 }),
  chn_next_ifv: V(PUMA, {}, { atgm: 'twin' }),
  k21_ifv: V(CV90, { H: 0.25, n: 6 }, { t: 'ifv', nose: 0.3, gun: 0.3, atgm: 'side' }),
  k200a1: M113,
  k808: V(PIRANHA, {}, { t: 'rws' }),
  type_89_ifv: V(CV90, { n: 6, H: 0.25 }, { atgm: 'twin' }),
  type_96_wheeled_apc: V(PIRANHA, { H: 0.3, nose: 'blunt' }),
  type_24_ifv: V(PATRIA, { H: 0.3 }, { atgm: 'side' }),
  terrex_icv: V(PATRIA, {}, { t: 'rws' }),
  bionix_ifv: V(CV90, { n: 5 }, {}),
  hunter_afv: V(LYNX, {}, { t: 'unm', atgm: 'side' }),
  redback_ifv: V(LYNX, { skirt: 2 }, { atgm: 'side' }),
  ghannatha: V(PATRIA, { n: 3 }),
  ratel_90: V(PIRANHA, { n: 3, H: 0.3, nose: 'blunt' }, { t: 'ifv', gun: 0.3, gr: 0.013 }),
  cm32_clouded_leopard: V(PATRIA, {}, {}),
  vtt323: V(BMP1, {}, {}),
  // ---- Recon ----
  m1127_stryker_rv: V(STRYKER, { add: ['mast'] }),
  jltv_cavalry: JLTV,
  m1117_asv: V(MRAP, { nose: 'glacis', H: 0.3 }, { t: 'dome', w: 0.18, l: 0.2, h: 0.07, gun: 0.14 }),
  ajax: AJAX,
  fennek: FENNEK,
  ebrc_jaguar: JAGUAR,
  amx10rc: AMX10RC,
  vbl: V(FENNEK, { L: 0.72, add: ['lmg'] }),
  jackal_2: V(HUMVEE, { H: 0.24 }),
  centauro_ii: V(RECON8, {}, { gun: 0.56, gr: 0.018, w: 0.38, l: 0.42 }),
  lince_lmv: LMV,
  dingo_2: V(MRAP, { L: 0.8, nose: 'hood' }),
  cobra_ii: V(MRAP, { L: 0.8, nose: 'boat' }),
  brdm2: BRDM,
  tigr_m: TIGR,
  rooikat_76: V(RECON8, { nose: 'boat' }, { gun: 0.48 }),
  zbl_09_recon: V(RECON8, { n: 3 }, { t: 'ifv', gun: 0.3 }),
  type_87_rcv: V(PIRANHA, { n: 4, H: 0.26 }, { t: 'ifv', gun: 0.3 }),
  aslav_25: V(PIRANHA, {}, { t: 'ifv', w: 0.22, l: 0.24, h: 0.08, gun: 0.3, gr: 0.008 }),
  cascavel_ee9: V(RECON8, { n: 3, H: 0.22 }, { gun: 0.36 }),
  coyote_recon_can: V(PIRANHA, { add: ['mast'] }, { t: 'ifv', gun: 0.28 }),
  // ---- Artillery ----
  m109a7_paladin: PALADIN,
  m109a5_paladin: V(PALADIN, {}, { fume: true, bustle: 0.2 }),
  m109_doher: V(PALADIN, {}, { gun: 0.45 }),
  m1299_erca_howitzer: V(PALADIN, { L: 1.02 }, { gun: 0.78 }),
  usa_erca: V(PALADIN, { L: 1.02 }, { gun: 0.8, rws: true }),
  m777a2_howitzer: { main: M777, extra: CARGO_TRUCK },
  m119a3_howitzer: { main: LIGHTGUN, extra: HUMVEE },
  m101_105mm_howitzer: { main: { ...LIGHTGUN, shield: true, bl: 0.34 }, extra: CARGO_TRUCK },
  mex_105mm_towed: { main: LIGHTGUN, extra: CARGO_TRUCK },
  l119_light_gun: { main: { ...LIGHTGUN, bl: 0.4 }, extra: V(TIGR, { H: 0.28 }) },
  fh70: { main: FH70, extra: CARGO_TRUCK },
  tr_f1: { main: { ...FH70, apu: false }, extra: CARGO_TRUCK },
  d30: { main: D30, extra: CARGO_BONNET },
  '2a65_msta_b': { main: { ...FH70, shield: true, apu: false, bl: 0.6 }, extra: CARGO_BONNET },
  hm41: { main: D30, extra: CARGO_BONNET },
  g5_howitzer: { main: FH70, extra: CARGO_TRUCK },
  atags: { main: { ...FH70, bl: 0.7 }, extra: CARGO_TRUCK },
  dhanush: { main: FH70, extra: CARGO_TRUCK },
  pzh2000: PZH2000,
  rch155: V(BOXER, {}, { t: 'sph', w: 0.4, l: 0.44, h: 0.15, gun: 0.68, gr: 0.018, brake: true, fume: true, x: -0.14 }),
  caesar: TRUCKGUN,
  caesar_mk2: V(TRUCKGUN, { cab: 'armored', cabL: 0.26 }),
  archer: ARCHER,
  as90: V(PALADIN, { skirt: 1 }, { taper: 0.1, gun: 0.6 }),
  dana_m2: V(ARCHER, { n: 4 }, {}),
  zuzana2: V(ARCHER, { n: 4 }),
  krab: V(K9, { n: 7 }, { nose: 0.2 }),
  t155_firtina: K9,
  bohdana: V(TRUCKGUN, { cab: 'flat' }),
  nora_b52: V(ARCHER, { n: 4, cab: 'flat' }),
  nemo_mortar: V(PATRIA, {}, { t: 'sph', w: 0.3, l: 0.34, h: 0.1, gun: 0.2, brake: false }),
  deu_next_gen_sph: V(PZH2000, { skirt: 2 }, { gun: 0.78, taper: 0.14 }),
  '2s1_gvozdika': S2S1,
  '2s3_akatsiya': S2S3,
  '2s5_giatsint': V(PION, { pay: { k: 'gun', l: 0.65 } }),
  '2s7_pion': PION,
  '2s19m2': MSTA,
  '2s31_vena': V(BMP3, {}, { t: 'sph', gun: 0.26, gr: 0.018, w: 0.34, l: 0.36, h: 0.12 }),
  '2s35_koalitsiya': KOALITSIYA,
  atmos_2000: V(TRUCKGUN, { cab: 'armored' }),
  sholef_155: V(ARCHER, { n: 4 }, {}),
  raad_1: S2S1,
  g6_rhino: V(RECON8, { n: 3, H: 0.28, nose: 'glacis' }, { t: 'sph', w: 0.4, l: 0.44, h: 0.15, gun: 0.66, gr: 0.018, brake: true, x: -0.1 }),
  plz_05: PLZ05,
  pcl_181: V(TRUCKGUN, { cab: 'flat', cabL: 0.24 }),
  plz_07b: S2S1,
  k9_vajra: V(K9, {}, {}),
  sharang: { main: FH70, extra: CARGO_TRUCK },
  sh15: V(ARCHER, { n: 3, cab: 'flat' }, {}),
  type_19: V(TRUCKGUN, { cab: 'flat', n: 4 }),
  type_99_sph: V(PZH2000, { n: 6 }, { gun: 0.66 }),
  k9_thunder: K9,
  k55a1: V(PALADIN, {}, { gun: 0.45 }),
  koksan_170: V(PION, { pay: { k: 'gun', l: 0.85 } }),
  m1991_sph: V(S2S3, {}, {}),
  zuni_155: V(TRUCKGUN, {}),
  k9a10_huntsman: V(K9, { skirt: 2 }, { rws: true }),
  primus_spg: V(PALADIN, { n: 5 }, { gun: 0.5 }),
  // ---- Rocket artillery ----
  himars: HIMARS,
  m270a2_mlrs: M270,
  m270_gbr: M270,
  mars_ii: M270,
  lars_2: V(GRAD, { cab: 'flat', cabL: 0.22 }, {}),
  bm21_grad: GRAD,
  bm27_uragan: URAGAN,
  bm30_smerch: SMERCH,
  tornado_s: V(SMERCH, { cab: 'armored' }),
  tornado_g: V(GRAD, { cab: 'flat' }),
  tos1a: TOS1,
  vilkha: SMERCH,
  polonez_a200: V(PHL16, { cab: 'maz' }),
  homar_a: HIMARS,
  homar_k: CHUNMOO,
  chunmoo: CHUNMOO,
  astros_ii: ASTROS,
  phl_16: PHL16,
  phl_03: V(SMERCH, { cab: 'flat' }),
  phl_11: V(GRAD, { cab: 'flat', n: 3 }),
  pinaka_mk1: V(PHL16, { cab: 'armored' }),
  pinaka_guided: V(PHL16, { cab: 'armored' }),
  tr_300_kasirga: V(PHL16, { n: 4 }),
  t122_sakarya: V(GRAD, { cab: 'flat', pay: { k: 'mlrs', pods: 2, rows: 4, cols: 5, l: 0.44, a: 0.14, open: true, tr: 0.034 } }),
  wr40_langusta: V(GRAD, { cab: 'flat' }),
  vampire_ra: V(GRAD, { cab: 'flat' }),
  fajr_5: V(URAGAN, { cab: 'bonnet', cabL: 0.28 }),
  zelzal_2: V(SCUD, { cab: 'bonnet', pay: { k: 'tel', l: 0.72, r: 0.045, a: 0.05 } }),
  kn25: V(PHL16, { cab: 'maz' }),
  m1991_240: URAGAN,
  lynx_lar160: V(HIMARS, { pay: { k: 'mlrs', pods: 2, rows: 3, cols: 3, l: 0.4, a: 0.12, tr: 0.045 } }),
  extra_gm: V(HIMARS, { pay: { k: 'mlrs', pods: 2, rows: 2, cols: 2, l: 0.52, a: 0.12, tr: 0.07 } }),
  // ---- Air defence ----
  patriot_pac3: { main: PATRIOT, extra: PATRIOT_RADAR },
  thaad: { main: V(PATRIOT, { n: 4, L: 1.12, pay: { k: 'sam', s: 'box', n: 8, l: 0.58, r: 0.04, a: 0.5 } }), extra: V(PATRIOT_RADAR, { pay: { k: 'radar', s: 'panel', w: 0.4, h: 0.22, a: 0.2 } }) },
  usa_gpi_bmd: { main: V(PATRIOT, { pay: { k: 'sam', s: 'tubes', n: 2, l: 0.7, r: 0.06, a: 1.2 } }), extra: PATRIOT_RADAR },
  nasams: { main: NASAMS, extra: AESA_RADAR },
  nasams_3: { main: NASAMS, extra: AESA_RADAR },
  m1097_avenger: AVENGER,
  m_shorad_stryker_a1: V(STRYKER, {}, { t: 'rws', w: 0.18, l: 0.2, h: 0.08, atgm: 'pods', gun: 0.2 }),
  ifpc_inc2: { main: V(NASAMS, { pay: { k: 'sam', s: 'tubes', n: 3, l: 0.5, r: 0.05, a: 0.8 } }), extra: AESA_RADAR },
  usa_ifpc_hel: V(STRYKER, {}, { t: 'aa', w: 0.3, l: 0.3, h: 0.12, gun: 0.1, radar: 'panel' }),
  iris_t_slm: { main: V(VERTSAM, { pay: { k: 'sam', s: 'box', n: 8, l: 0.46, r: 0.03, a: 1.3 } }), extra: AESA_RADAR },
  iris_t_sls: V(JLTV, { pay: { k: 'sam', s: 'box', n: 4, l: 0.3, r: 0.03, a: 0.5 } }),
  skynex: { main: { g: 'towed', bl: 0.4, r: 0.01, trails: 2, wheels: 2, w: 0.4, shield: true, elev: 0.5 }, extra: AESA_RADAR },
  skyranger_30: V(BOXER, {}, { t: 'aa', w: 0.34, l: 0.34, h: 0.12, gun: 0.35, gr: 0.008, radar: 'panel' }),
  gepard: GEPARD,
  ozelot: V(M113, {}, { t: 'rws' }),
  samp_t: { main: V(VERTSAM, {}), extra: AESA_RADAR },
  samp_t_ng: { main: V(VERTSAM, {}), extra: V(AESA_RADAR, { pay: { k: 'radar', s: 'rot', w: 0.34, h: 0.2 } }) },
  crotale_ng: V(VAB_LIKE(), {}),
  mistral_3: AVENGER,
  sky_sabre: { main: V(VERTSAM, {}), extra: AESA_RADAR },
  gbr_sky_sabre_er: { main: V(VERTSAM, { L: 1.08 }), extra: AESA_RADAR },
  rapier: { main: { g: 'towed', bl: 0.1, r: 0.01, trails: 2, wheels: 2, w: 0.4, shield: true }, extra: CARGO_TRUCK },
  starstreak_lml: V(M113, { add: [] }, { t: 'rws', atgm: 'pods', w: 0.16, l: 0.2, h: 0.08 }),
  rbs_70: AVENGER,
  bamse: { main: V(VERTSAM, { pay: { k: 'sam', s: 'box', n: 6, l: 0.4, r: 0.032, a: 1.0 } }), extra: AESA_RADAR },
  piorun: AVENGER,
  narew_camm_er: { main: VERTSAM, extra: AESA_RADAR },
  pilica_plus: { main: { g: 'towed', bl: 0.34, r: 0.01, trails: 2, wheels: 2, w: 0.4, shield: false, elev: 0.3 }, extra: CARGO_TRUCK },
  hisar_a: V(M113, { add: [] }, { t: 'rws', atgm: 'pods', w: 0.16, l: 0.2, h: 0.08 }),
  hisar_o: { main: VERTSAM, extra: AESA_RADAR },
  korkut: V(ZSU234, { n: 6, L: 0.9 }, { radar: 'dish' }),
  tur_siper: { main: V(VERTSAM, { n: 4, L: 1.1 }), extra: AESA_RADAR },
  s125_pechora_2m: { main: V(BUK, { n: 6 }, {}), extra: S400_RADAR },
  spada_2000: { main: NASAMS, extra: AESA_RADAR },
  skyguard_ada: { main: { g: 'towed', bl: 0.32, r: 0.01, trails: 2, wheels: 2, w: 0.4, shield: true, elev: 0.4 }, extra: AESA_RADAR },
  s75: { main: { g: 'veh', ch: 'truck', L: 1, W: 0.46, H: 0.25, n: 3, cab: 'bonnet', cabL: 0.3, pay: { k: 'sam', s: 'rails', n: 1, l: 0.68, r: 0.035, a: 0.5 } }, extra: V(S400_RADAR, { pay: { k: 'radar', s: 'dish', w: 0.26, h: 0.2 } }) },
  s125_pechora: { main: { g: 'veh', ch: 'truck', L: 1, W: 0.46, H: 0.25, n: 3, cab: 'bonnet', cabL: 0.3, pay: { k: 'sam', s: 'rails', n: 2, l: 0.5, r: 0.03, a: 0.4 } }, extra: S400_RADAR },
  s200: { main: { g: 'veh', ch: 'truck', L: 1.1, W: 0.46, H: 0.25, n: 4, cab: 'bonnet', cabL: 0.3, pay: { k: 'sam', s: 'rails', n: 1, l: 0.8, r: 0.045, a: 0.45 } }, extra: V(S400_RADAR, { pay: { k: 'radar', s: 'dish', w: 0.3, h: 0.2 } }) },
  zsu23_4: ZSU234,
  zu23_2: { main: { g: 'towed', bl: 0.24, r: 0.006, trails: 2, wheels: 2, w: 0.4, shield: false, elev: 0.5, brake: false }, extra: TECHNICAL },
  strela10: V(MTLB, { add: [] }, undefined),
  osa_9k33: V(BTR80, { n: 3, tur: undefined, pay: { k: 'sam', s: 'rails', n: 4, l: 0.28, r: 0.022, a: 0.4 } }),
  tunguska_2k22: TUNGUSKA,
  buk_m1: BUK, buk_m2: BUK, buk_m3: V(BUK, { pay: { k: 'sam', s: 'tubes', n: 6, l: 0.4, r: 0.028, a: 0.5 } }),
  tor_m1: TOR, tor_m2: TOR,
  pantsir_s1: PANTSIR,
  s300pmu2: { main: S300, extra: S400_RADAR },
  s300v4: { main: S300V, extra: V(S300V, { pay: { k: 'radar', s: 'panel', w: 0.34, h: 0.3, a: 0.25 } }) },
  s400: { main: S400, extra: S400_RADAR },
  s400_belarus: { main: S400, extra: S400_RADAR },
  s500: { main: V(S400, { n: 5, L: 1.2, pay: { k: 'sam', s: 'tubes', n: 2, l: 0.72, r: 0.06, a: 1.25 } }), extra: S400_RADAR },
  rus_s550: { main: V(S400, { n: 5, L: 1.2, pay: { k: 'sam', s: 'tubes', n: 2, l: 0.72, r: 0.06, a: 1.25 } }), extra: S400_RADAR },
  iron_dome: { main: IRONDOME, extra: V(AESA_RADAR, { pay: { k: 'radar', s: 'panel', w: 0.3, h: 0.2, a: 0.2 } }) },
  davids_sling: { main: V(IRONDOME, { pay: { k: 'sam', s: 'box', n: 12, l: 0.45, r: 0.03, a: 1.1 } }), extra: AESA_RADAR },
  arrow_2: { main: V(PATRIOT, { pay: { k: 'sam', s: 'tubes', n: 6, l: 0.6, r: 0.04, a: 0.7 } }), extra: V(AESA_RADAR, { pay: { k: 'radar', s: 'panel', w: 0.38, h: 0.24 } }) },
  arrow_3: { main: V(PATRIOT, { pay: { k: 'sam', s: 'tubes', n: 6, l: 0.62, r: 0.04, a: 0.75 } }), extra: V(AESA_RADAR, { pay: { k: 'radar', s: 'panel', w: 0.38, h: 0.24 } }) },
  isr_arrow_4: { main: V(PATRIOT, { pay: { k: 'sam', s: 'tubes', n: 4, l: 0.64, r: 0.045, a: 0.8 } }), extra: AESA_RADAR },
  isr_iron_beam: V(PATRIOT, { pay: { k: 'radar', s: 'dish', w: 0.24, h: 0.2 } }),
  barak_8: { main: VERTSAM, extra: AESA_RADAR },
  spyder_mr: V(VERTSAM, { pay: { k: 'sam', s: 'box', n: 8, l: 0.5, r: 0.03, a: 0.45 } }),
  bavar_373: { main: V(S400, { pay: { k: 'sam', s: 'box', n: 4, l: 0.6, r: 0.05, a: 1.3 } }), extra: S400_RADAR },
  irn_bavar_373_ii: { main: V(S400, { pay: { k: 'sam', s: 'box', n: 4, l: 0.6, r: 0.05, a: 1.3 } }), extra: S400_RADAR },
  khordad_15: { main: V(S300, { pay: { k: 'sam', s: 'box', n: 4, l: 0.55, r: 0.045, a: 1.0 } }), extra: AESA_RADAR },
  khordad_3: { main: V(S300, { pay: { k: 'sam', s: 'box', n: 3, l: 0.55, r: 0.045, a: 0.6 } }), extra: AESA_RADAR },
  mersad: { main: { g: 'veh', ch: 'truck', L: 1, W: 0.46, H: 0.25, n: 3, cab: 'bonnet', cabL: 0.3, pay: { k: 'sam', s: 'rails', n: 3, l: 0.46, r: 0.03, a: 0.4 } }, extra: AESA_RADAR },
  hq_9b: { main: V(S300, { cab: 'armored' }), extra: S400_RADAR },
  hq_9p: { main: V(S300, { cab: 'armored' }), extra: S400_RADAR },
  hq_16fe: { main: V(S300, { n: 3, cab: 'flat', pay: { k: 'sam', s: 'tubes', n: 6, l: 0.5, r: 0.032, a: 1.3 } }), extra: AESA_RADAR },
  hq_22: { main: V(S300, { cab: 'flat', pay: { k: 'sam', s: 'box', n: 3, l: 0.56, r: 0.045, a: 0.9 } }), extra: AESA_RADAR },
  hq_17ab: V(TOR, { ch: 'wheeled', n: 3 }),
  pgz_09: V(TUNGUSKA, { skirt: 1 }, { radar: 'panel' }),
  hq_19: { main: V(S300, { cab: 'armored', pay: { k: 'sam', s: 'tubes', n: 2, l: 0.72, r: 0.055, a: 1.2 } }), extra: S400_RADAR },
  chn_hq_29: { main: V(S300, { cab: 'armored', n: 5, pay: { k: 'sam', s: 'tubes', n: 2, l: 0.75, r: 0.06, a: 1.25 } }), extra: S400_RADAR },
  akash: { main: V(BUK, { pay: { k: 'sam', s: 'rails', n: 3, l: 0.36, r: 0.028, a: 0.3 } }), extra: AESA_RADAR },
  akash_ng: { main: V(NASAMS, { pay: { k: 'sam', s: 'tubes', n: 3, l: 0.46, r: 0.035, a: 0.6 } }), extra: AESA_RADAR },
  mrsam: { main: VERTSAM, extra: AESA_RADAR },
  qrsam: { main: V(NASAMS, { pay: { k: 'sam', s: 'tubes', n: 6, l: 0.4, r: 0.028, a: 0.6 } }), extra: AESA_RADAR },
  type_03_chusam: { main: V(VERTSAM, { n: 3 }), extra: AESA_RADAR },
  type_81_tansam: { main: V(NASAMS, { pay: { k: 'sam', s: 'rails', n: 4, l: 0.36, r: 0.025, a: 0.4 } }), extra: AESA_RADAR },
  type_87_spaag: V(GEPARD, { n: 6 }),
  km_sam: { main: VERTSAM, extra: AESA_RADAR },
  kor_lsam: { main: V(VERTSAM, { L: 1.1 }), extra: V(AESA_RADAR, { pay: { k: 'radar', s: 'panel', w: 0.34, h: 0.26 } }) },
  chunma: V(K9, { tur: undefined, pay: { k: 'sam', s: 'turret', n: 8, l: 0.3, r: 0.03, a: 0.3 } }),
  kn06: { main: S300, extra: S400_RADAR },
  pongae_sam_old: { main: V(PATRIOT, { pay: { k: 'sam', s: 'rails', n: 2, l: 0.5, r: 0.03, a: 0.4 } }), extra: S400_RADAR },
  tien_kung_iii: { main: PATRIOT, extra: PATRIOT_RADAR },
  tien_kung_iv: { main: PATRIOT, extra: PATRIOT_RADAR },
  twn_tk_v: { main: V(PATRIOT, { pay: { k: 'sam', s: 'tubes', n: 4, l: 0.6, r: 0.045, a: 0.8 } }), extra: PATRIOT_RADAR },
  tien_chien_ii: { main: V(PATRIOT, { pay: { k: 'sam', s: 'box', n: 4, l: 0.5, r: 0.035, a: 0.9 } }), extra: PATRIOT_RADAR },
  umkhonto: VERTSAM,
  sakr_eye: AVENGER,
  // ---- Ballistic / cruise / coastal missiles ----
  iskander_m: ISKANDER,
  scud_b: SCUD,
  tochka_u: V(BTR80, { tur: undefined, n: 3, H: 0.24, pay: { k: 'tel', l: 0.56, r: 0.036, a: 0 } }),
  bastion_p: BASTION,
  bal_e: V(COASTAL, { cab: 'maz', n: 4, cabL: 0.24, pay: { k: 'can', n: 8, rows: 2, l: 0.48, r: 0.03, a: 0.25 } }),
  rs26_oreshnik: V(ICBM_TEL, { n: 6 }),
  rus_sarmat_battery: V(SILO_ICBM, { pay: { k: 'tel', l: 1.0, r: 0.075, a: 1.2, stages: 3 } }),
  rus_zircon_battery: BASTION,
  lgm30g_minuteman_iii: SILO_ICBM,
  lgm35_sentinel: V(SILO_ICBM, { pay: { k: 'tel', l: 0.95, r: 0.065, a: 1.35, stages: 3 } }),
  usa_dark_eagle: V(TYPHON, { pay: { k: 'tel', l: 0.82, r: 0.05, a: 0, n: 2, can: true } }),
  typhon_mrc: TYPHON,
  prsm_launcher: V(HIMARS, { pay: { k: 'mlrs', pods: 1, rows: 1, cols: 2, l: 0.52, a: 0.1, tr: 0.09 } }),
  nmesis: V(JLTV, { tur: undefined, pay: { k: 'can', n: 2, rows: 1, l: 0.38, r: 0.035, a: 0.2 } }),
  nsm_coastal: COASTAL, nor_nsm_block2: COASTAL,
  rbs15_coastal: V(COASTAL, { pay: { k: 'can', n: 4, rows: 2, l: 0.52, r: 0.04, a: 0.2 } }),
  mm40_coastal: COASTAL, exocet_coastal_grc: COASTAL, otomat_teseo_coastal: COASTAL, harpoon_coastal_dnk: COASTAL,
  atmaca_coastal: COASTAL,
  neptune_r360: V(COASTAL, { cab: 'bonnet', cabL: 0.28, pay: { k: 'can', n: 4, rows: 2, l: 0.5, r: 0.035, a: 0.3, round: true } }),
  brahmos: V(BASTION, { cab: 'armored' }),
  ind_brahmos_ng: V(BASTION, { cab: 'armored', pay: { k: 'can', n: 4, rows: 2, l: 0.5, r: 0.035, a: 0.1, round: true } }),
  yj_18_coastal: V(BASTION, { cab: 'armored' }),
  hsiung_feng_ii: COASTAL, hsiung_feng_iii: V(COASTAL, { n: 4, pay: { k: 'can', n: 4, rows: 2, l: 0.56, r: 0.04, a: 0.28 } }), hsiung_feng_iie: TYPHON,
  type_12_ssm: V(COASTAL, { n: 4, pay: { k: 'can', n: 6, rows: 2, l: 0.5, r: 0.033, a: 0.3 } }),
  type_12_upgraded: V(COASTAL, { n: 4, pay: { k: 'can', n: 6, rows: 2, l: 0.56, r: 0.036, a: 0.3 } }),
  type_88_ssm: V(COASTAL, { pay: { k: 'can', n: 6, rows: 2, l: 0.48, r: 0.032, a: 0.3 } }),
  khalij_fars_asbm: V(SCUD, { cab: 'bonnet' }),
  df_15b: V(ISKANDER, { pay: { k: 'tel', l: 0.66, r: 0.05, a: 0, n: 1 } }),
  df_16: V(ISKANDER, { n: 5, pay: { k: 'tel', l: 0.72, r: 0.055, a: 0, n: 1 } }),
  df_17: V(IRBM_TEL, { pay: { k: 'tel', l: 0.8, r: 0.055, a: 0, stages: 2 } }),
  df_21d: IRBM_TEL,
  df_26: V(IRBM_TEL, { n: 6 }),
  df_31ag: V(ICBM_TEL, { cab: 'armored' }),
  df_41: V(ICBM_TEL, { n: 8, cab: 'armored', pay: { k: 'tel', l: 1.0, r: 0.07, a: 0, can: true } }),
  chn_df_27: V(IRBM_TEL, { n: 6 }),
  chn_df_61: V(ICBM_TEL, { cab: 'armored' }),
  cj_10: V(TYPHON, { cab: 'armored', pay: { k: 'can', n: 3, rows: 1, l: 0.6, r: 0.045, a: 0.1, round: true } }),
  agni_v: V(ICBM_TEL, { cab: 'armored' }),
  agni_p: V(IRBM_TEL, {}),
  prithvi_ii: V(SCUD, { cab: 'flat' }),
  pralay: V(ISKANDER, { cab: 'flat', pay: { k: 'tel', l: 0.6, r: 0.042, a: 0, n: 2 } }),
  nirbhay: V(TYPHON, { cab: 'armored', pay: { k: 'can', n: 4, rows: 2, l: 0.5, r: 0.035, a: 0.3, round: true } }),
  babur: V(TYPHON, { cab: 'flat', pay: { k: 'can', n: 3, rows: 1, l: 0.56, r: 0.04, a: 0.2, round: true } }),
  shaheen_iii: V(ICBM_TEL, { n: 6, cab: 'armored', pay: { k: 'tel', l: 0.9, r: 0.06, a: 0, stages: 2 } }),
  ababeel: V(ICBM_TEL, { n: 6, cab: 'armored', pay: { k: 'tel', l: 0.88, r: 0.062, a: 0, stages: 3 } }),
  pak_ababeel_2: V(ICBM_TEL, { n: 6, cab: 'armored', pay: { k: 'tel', l: 0.9, r: 0.064, a: 0, stages: 3 } }),
  nasr: V(PHL16, { pay: { k: 'can', n: 4, rows: 2, l: 0.45, r: 0.035, a: 0.2, round: true } }),
  ghauri: V(SCUD, { cab: 'bonnet' }),
  lora: V(COASTAL, { n: 4, pay: { k: 'can', n: 2, rows: 1, l: 0.6, r: 0.05, a: 0.1 } }),
  jericho_ii: V(IRBM_TEL, { pay: { k: 'tel', l: 0.8, r: 0.05, a: 0, stages: 2 } }),
  jericho_iii: V(ICBM_TEL, { cab: 'flat', pay: { k: 'tel', l: 0.95, r: 0.06, a: 0, stages: 3 } }),
  fateh_110: V(COASTAL, { cab: 'bonnet', cabL: 0.28, pay: { k: 'tel', l: 0.6, r: 0.035, a: 0.1, n: 3 } }),
  zolfaghar_srbm: V(COASTAL, { cab: 'bonnet', cabL: 0.28, pay: { k: 'tel', l: 0.62, r: 0.04, a: 0.1, n: 2 } }),
  shahab_3: V(SCUD, { n: 5, pay: { k: 'tel', l: 0.82, r: 0.045, a: 0.05, stages: 1 } }),
  emad_ghadr: V(SCUD, { n: 5, pay: { k: 'tel', l: 0.84, r: 0.045, a: 0.05, stages: 1 } }),
  khorramshahr: V(SCUD, { n: 5, pay: { k: 'tel', l: 0.8, r: 0.06, a: 0.05, stages: 1 } }),
  sejjil: V(IRBM_TEL, { cab: 'bonnet', pay: { k: 'tel', l: 0.86, r: 0.055, a: 0, stages: 2 } }),
  kheibar_shekan: V(SCUD, { cab: 'bonnet', pay: { k: 'tel', l: 0.7, r: 0.05, a: 0, stages: 2 } }),
  haj_qassem: V(SCUD, { cab: 'bonnet', pay: { k: 'tel', l: 0.7, r: 0.045, a: 0, stages: 1 } }),
  irn_fattah: V(SCUD, { cab: 'bonnet', pay: { k: 'tel', l: 0.7, r: 0.05, a: 0.1, stages: 2 } }),
  burkan_2h: SCUD,
  hyunmoo_2: V(ISKANDER, { cab: 'flat', pay: { k: 'tel', l: 0.66, r: 0.045, a: 0 } }),
  hyunmoo_3: V(TYPHON, { cab: 'flat', pay: { k: 'can', n: 3, rows: 1, l: 0.56, r: 0.04, a: 0.2 } }),
  hyunmoo_5: V(ICBM_TEL, { n: 6, cab: 'armored', pay: { k: 'tel', l: 0.9, r: 0.075, a: 0, can: true } }),
  kor_hyunmoo_6: V(IRBM_TEL, { n: 5 }),
  kn23: V(ISKANDER, { cab: 'bonnet', pay: { k: 'tel', l: 0.62, r: 0.042, a: 0 } }),
  hwasong_12: V(ICBM_TEL, { n: 5, cab: 'maz', pay: { k: 'tel', l: 0.86, r: 0.055, a: 0, stages: 1 } }),
  hwasong_15: V(ICBM_TEL, { n: 6, cab: 'maz', pay: { k: 'tel', l: 0.95, r: 0.06, a: 0, stages: 2 } }),
  hwasong_17: V(ICBM_TEL, { n: 8, L: 1.3, cab: 'maz', pay: { k: 'tel', l: 1.1, r: 0.075, a: 0, stages: 2 } }),
  hwasong_18: V(ICBM_TEL, { n: 7, cab: 'maz', pay: { k: 'tel', l: 1.0, r: 0.065, a: 0, can: true } }),
  prk_hwasong_20: V(ICBM_TEL, { n: 8, L: 1.3, cab: 'maz', pay: { k: 'tel', l: 1.1, r: 0.075, a: 0, can: true } }),
  hwasal_2: V(COASTAL, { cab: 'bonnet', pay: { k: 'can', n: 3, rows: 1, l: 0.5, r: 0.035, a: 0.3, round: true } }),
  tien_ma: V(TYPHON, { n: 4 }),
  twn_yun_feng: V(TYPHON, { n: 4, pay: { k: 'tel', l: 0.8, r: 0.045, a: 0, n: 2, can: true } }),
  tayfun_block1: V(ISKANDER, { cab: 'flat', pay: { k: 'can', n: 2, rows: 1, l: 0.68, r: 0.045, a: 0.05 } }),
  tur_tayfun_block4: V(ISKANDER, { cab: 'flat', n: 5, pay: { k: 'can', n: 1, rows: 1, l: 0.82, r: 0.06, a: 0.05 } }),
  bora_srbm: V(ISKANDER, { cab: 'flat', pay: { k: 'can', n: 2, rows: 1, l: 0.6, r: 0.045, a: 0.05 } }),
  // ---- Engineers ----
  m1150_abv_engineers: ABV,
  terrier_aveng: V(ENGINEER_TRACKED, { H: 0.22, n: 5 }),
  kodiak_pionier: V(LEO2A4, { add: ['dozer', 'crane'], tur: undefined }),
  wisent_2: V(LEO1, { add: ['dozer', 'crane'], tur: undefined }),
  dachs: V(LEO1, { add: ['dozer', 'crane'], tur: undefined }),
  imr3m: V(T72, { add: ['dozer', 'crane'], tur: undefined }),
  puma_engineers: V(NAMER, { add: ['plough'] }),
  // ---- Aircraft: fighters ----
  f22a_raptor: F22,
  f15c_eagle: F15,
  f15ex_eagle_ii: F15,
  f15e_strike_eagle: A(F15, { ckT: 'tandem', ck: [0.27, 0.18, 0.045] }),
  f15i_raam: A(F15, { ckT: 'tandem', ck: [0.27, 0.18, 0.045] }),
  f15j_kai: F15,
  f16c_block50: F16, f16am_mlu: F16, f16v_block70: A(F16, { hump: 0.15 }),
  f16i_sufa: A(F16, { hump: 0.3, ckT: 'tandem', ck: [0.26, 0.2, 0.042] }),
  f35a: F35, f35i: F35,
  f35b: A(F35, { hump: 0.12 }),
  f35c: A(F35, { wing: { x: 0.05, root: 0.42, tip: 0.1, span: 0.36, sweep: 0.24, y: 0.1 } }),
  fa18ef_super_hornet: A(HORNET, { r: 0.048, int: 'box' }),
  ea18g_growler: A(HORNET, { r: 0.048, int: 'box', ckT: 'tandem', ck: [0.27, 0.18, 0.045] }),
  cf18_hornet: HORNET,
  usa_f47_ngad: NGAD,
  usa_fa_xx: A(TAILLESS6, { wing: { x: 0.1, root: 0.5, tip: 0.08, span: 0.4, sweep: 0.4, y: 0.1 } }),
  f5e_tiger_ii: A(TRAINER, { ckT: 'bubble', ck: [0.24, 0.12, 0.036], r: 0.036, wing: { x: 0.02, root: 0.26, tip: 0.06, span: 0.26, sweep: 0.2, y: -0.2, lerx: 0.14 }, eng: { n: 2, k: 'int', r: 0.02, l: 0, x: 0, z: [0.02, -0.02] } }),
  mirage_2000c: MIRAGE2000, mirage_2000d: A(MIRAGE2000, { ckT: 'tandem', ck: [0.24, 0.18, 0.045] }),
  rafale_f3r: RAFALE, rafale_f4: RAFALE, fra_rafale_f5: A(RAFALE, { hump: 0.12 }),
  eurofighter_typhoon: TYPHOON, typhoon_t1: TYPHOON, typhoon_ecr90: A(TYPHOON, { hump: 0.1 }),
  jas39c_gripen: GRIPEN, jas39e_gripen: A(GRIPEN, { r: 0.043 }), bra_gripen_ngd: A(GRIPEN, { r: 0.043 }),
  swe_gripen_next: A(TAILLESS6, { cn: { x: 0.2, root: 0.1, tip: 0.03, span: 0.16, sweep: 0.08 }, eng: { n: 1, k: 'int', r: 0.03, l: 0, x: 0, z: [0] } }),
  gbr_gcap: GCAP, jpn_gcap: GCAP,
  fra_ngf_scaf: A(TAILLESS6, { cn: { x: 0.24, root: 0.08, tip: 0.02, span: 0.14, sweep: 0.06 }, wing: { x: 0.1, root: 0.56, tip: 0.03, span: 0.38, sweep: 0.52, y: 0.1 } }),
  kaan: A(KF21, { facet: 6, r: 0.054 }),
  tur_kaan_block2: A(KF21, { facet: 6, r: 0.054 }),
  tur_kaan_block3_tfx: A(KF21, { facet: 6, r: 0.054, vt: { n: 2, x: -0.22, root: 0.14, tip: 0.06, h: 0.12, sweep: 0.1, cant: 0.6, z: 0.065 } }),
  su27: FLANKER, su27sm: FLANKER, su27p1m_ukr: FLANKER,
  su35s: A(FLANKER, { hs: { ...FLANKER.hs! } }),
  su30sm2: A(FLANKER, { cn: { x: 0.24, root: 0.08, tip: 0.03, span: 0.14, sweep: 0.05 }, ckT: 'tandem', ck: [0.3, 0.18, 0.045] }),
  su30mki: A(FLANKER, { cn: { x: 0.24, root: 0.08, tip: 0.03, span: 0.14, sweep: 0.05 }, ckT: 'tandem', ck: [0.3, 0.18, 0.045] }),
  j11b: FLANKER, j16: A(FLANKER, { ckT: 'tandem', ck: [0.3, 0.18, 0.045] }), j16d: A(FLANKER, { ckT: 'tandem', ck: [0.3, 0.18, 0.045] }), j15: A(FLANKER, { cn: { x: 0.24, root: 0.08, tip: 0.03, span: 0.14, sweep: 0.05 } }), j15t: A(FLANKER, { cn: { x: 0.24, root: 0.08, tip: 0.03, span: 0.14, sweep: 0.05 } }),
  su34: SU34,
  mig29: FULCRUM, mig29smt: A(FULCRUM, { hump: 0.25 }), mig29m: FULCRUM, mig29mu1_ukr: FULCRUM,
  mig31bm: A(F15, { r: 0.05, sz: 1.5, nose: 0.24, ckT: 'tandem', ck: [0.28, 0.18, 0.045], wing: { x: 0.02, root: 0.34, tip: 0.1, span: 0.36, sweep: 0.22, y: 0.4 }, vt: { n: 2, x: -0.24, root: 0.18, tip: 0.08, h: 0.19, sweep: 0.12, cant: 0.12, z: 0.07 } }),
  mig31k: A(F15, { r: 0.05, sz: 1.5, nose: 0.24, ckT: 'tandem', ck: [0.28, 0.18, 0.045], wing: { x: 0.02, root: 0.34, tip: 0.1, span: 0.36, sweep: 0.22, y: 0.4 }, vt: { n: 2, x: -0.24, root: 0.18, tip: 0.08, h: 0.19, sweep: 0.12, cant: 0.12, z: 0.07 } }),
  mig25: A(F15, { r: 0.05, sz: 1.5, nose: 0.22, wing: { x: 0.02, root: 0.34, tip: 0.1, span: 0.34, sweep: 0.22, y: 0.4 }, vt: { n: 2, x: -0.24, root: 0.18, tip: 0.08, h: 0.2, sweep: 0.12, cant: 0.15, z: 0.07 } }),
  rus_mig41: A(SU57, { wing: { x: 0.12, root: 0.5, tip: 0.04, span: 0.34, sweep: 0.44, y: 0.1 } }),
  mig21bis: MIG21, mig21_bison: MIG21,
  mig23ml: A(TORNADO, { r: 0.042, sz: 1, ckT: 'bubble', ck: [0.26, 0.12, 0.04] }),
  mig27: A(TORNADO, { r: 0.042, sz: 1, ckT: 'bubble', ck: [0.26, 0.12, 0.04], nose: 0.26 }),
  su57: SU57,
  rus_su75_checkmate: A(F35, { int: 'chin', vt: { n: 2, x: -0.28, root: 0.14, tip: 0.07, h: 0.14, sweep: 0.08, cant: 0.8, z: 0.04 }, wing: { x: 0.04, root: 0.42, tip: 0.05, span: 0.32, sweep: 0.36, y: 0.1 } }),
  j20a: J20, chn_j20b_s: A(J20, { hump: 0.1, ck: [0.28, 0.2, 0.042], ckT: 'tandem' }),
  j35a: A(F35, { sz: 1.45, eng: { n: 2, k: 'int', r: 0.026, l: 0, x: 0, z: [0.03, -0.03] } }),
  j35: A(F35, { sz: 1.45, eng: { n: 2, k: 'int', r: 0.026, l: 0, x: 0, z: [0.03, -0.03] } }),
  pak_j35e: A(F35, { sz: 1.45, eng: { n: 2, k: 'int', r: 0.026, l: 0, x: 0, z: [0.03, -0.03] } }),
  chn_j36: J36,
  chn_j50: A(TAILLESS6, { wing: { x: 0.1, root: 0.56, tip: 0.05, span: 0.36, sweep: 0.5, y: 0.1 }, cn: undefined }),
  j10c: J10,
  tejas_mk1: TEJAS, tejas_mk1a: TEJAS,
  ind_tejas_mk2: A(TEJAS, { cn: { x: 0.2, root: 0.08, tip: 0.03, span: 0.13, sweep: 0.05 } }),
  ind_amca: A(F22, { r: 0.052, vt: { n: 2, x: -0.22, root: 0.14, tip: 0.06, h: 0.12, sweep: 0.1, cant: 0.55, z: 0.07 } }),
  ind_tedbf: A(RAFALE, { cn: { x: 0.22, root: 0.1, tip: 0.03, span: 0.15, sweep: 0.06 } }),
  jf17_block2: JF17, jf17_block3: JF17, pak_jf17_block4: JF17,
  f2: A(F16, { r: 0.045, wing: { x: 0.08, root: 0.42, tip: 0.1, span: 0.36, sweep: 0.3, lerx: 0.2 } }),
  kf21_boramae: KF21, kor_kf21_block2: KF21, kor_kf21_block3: A(KF21, { facet: 6 }), idn_kf21_ifx: KF21,
  fa50: TRAINER, fa50_block20: TRAINER,
  ching_kuo: A(F16, { int: 'side', eng: { n: 2, k: 'int', r: 0.022, l: 0, x: 0, z: [0.024, -0.024] } }),
  twn_next_fighter: KF21,
  kfir_c7: A(MIRAGE2000, { cn: { x: 0.12, root: 0.08, tip: 0.02, span: 0.12, sweep: 0.05 }, int: 'side' }),
  saeqeh: A(F16, { r: 0.04, int: 'side', vt: { n: 2, x: -0.22, root: 0.16, tip: 0.07, h: 0.15, sweep: 0.12, cant: 0.3, z: 0.03 } }),
  kowsar_fighter: A(TRAINER, { ckT: 'bubble', r: 0.036, wing: { x: 0.02, root: 0.26, tip: 0.06, span: 0.26, sweep: 0.2, y: -0.2, lerx: 0.14 } }),
  azarakhsh: A(TRAINER, { ckT: 'bubble', r: 0.036, wing: { x: 0.02, root: 0.26, tip: 0.06, span: 0.26, sweep: 0.2, y: -0.2, lerx: 0.14 } }),
  irn_qaher_313: A(TAILLESS6, { r: 0.04, vt: { n: 2, x: -0.3, root: 0.1, tip: 0.05, h: 0.08, sweep: 0.05, cant: -2.3, z: 0.12, y: 0 } }),
  isr_sufa_gen6: GCAP,
  arg_pampa_iv: TRAINER,
  // ---- Strike / special ----
  a10c_thunderbolt_ii: A10,
  ac130j_ghostrider: C130,
  p8a_poseidon: AIRLINER,
  p1_mpa: A(AIRLINER, { eng: { n: 4, k: 'pod', r: 0.022, l: 0.1, x: 0.06, z: [0.17, 0.3, -0.17, -0.3] } }),
  cp140m_aurora: A(C130, { wing: { x: 0.1, root: 0.16, tip: 0.07, span: 0.5, sweep: 0.03, y: -0.6 }, vt: { ...C130.vt!, y: 0.3 } }),
  usa_hypersonic_hacm: A(SU57, { r: 0.04, wing: { x: 0.2, root: 0.62, tip: 0.02, span: 0.24, sweep: 0.58, y: 0 }, vt: { n: 1, x: -0.3, root: 0.14, tip: 0.06, h: 0.1, sweep: 0.08 }, ck: null, eng: undefined }),
  super_tucano_a29: TURBOPROP_TRAINER, emb312_tucano: TURBOPROP_TRAINER,
  amx_a1m: A(TRAINER, { ckT: 'bubble', wing: { x: 0.04, root: 0.26, tip: 0.08, span: 0.3, sweep: 0.2, y: 0.4 } }),
  pampa_iii: TRAINER, m346fa: TRAINER, hawk_t2: TRAINER, l159_alca: TRAINER, hurjet: A(TRAINER, { r: 0.042 }), yak130: TRAINER, l39c: TRAINER, l39ng: TRAINER,
  iar99_soim: TRAINER, k8_karakoram: TRAINER, at3_tzu_chiang: A(TRAINER, { eng: { n: 2, k: 'int', r: 0.02, l: 0, x: 0, z: [0.024, -0.024] } }),
  cessna_a37b_dragonfly: A(TRAINER, { ckT: 'glass', ck: [0.28, 0.12, 0.05], eng: { n: 2, k: 'int', r: 0.02, l: 0, x: 0, z: [0.03, -0.03] } }),
  tornado_gr4: TORNADO, tornado_ids: TORNADO,
  su24m: SU24, su24m_ukr: SU24,
  su22: A(MIG21, { r: 0.04, wing: { x: 0.02, root: 0.3, tip: 0.06, span: 0.32, sweep: 0.3, y: 0.1 } }),
  su25: SU25, su25sm3: SU25, su25m1_ukr: SU25,
  jh7a: A(TORNADO, { ckT: 'tandem', r: 0.048, wing: { x: 0.02, root: 0.3, tip: 0.08, span: 0.34, sweep: 0.26, y: 0.4 } }),
  jaguar_darin3: A(TORNADO, { ckT: 'bubble', r: 0.04, sz: 1.1, wing: { x: 0.0, root: 0.26, tip: 0.08, span: 0.28, sweep: 0.2, y: 0.8 } }),
  // ---- Bombers ----
  b1b_lancer: B1B,
  b2a_spirit: B2,
  b21_raider: B21,
  b52h_stratofortress: B52,
  usa_b52j_stratofortress: A(B52, { eng: { n: 4, k: 'pod', r: 0.03, l: 0.13, x: 0.02, z: [0.18, 0.34, -0.18, -0.34] } }),
  tu22m3: TU22M,
  tu95ms: TU95,
  tu160m: TU160, rus_tu160m2: TU160,
  rus_pak_da: A(B2, { pf: [[0.3, 0], [-0.08, 0.6], [-0.16, 0.6], [-0.1, 0.35], [-0.2, 0.18], [-0.14, 0]] }),
  h6k: H6, h6n: H6, h6j: A(H6, { eng: { n: 2, k: 'fan', r: 0.028, l: 0.3, x: 0.02, y: -0.4, z: [0.07, -0.07] } }),
  chn_h20: A(B2, { pf: [[0.3, 0], [-0.12, 0.58], [-0.19, 0.58], [-0.08, 0.36], [-0.2, 0.18], [-0.1, 0]] }),
  gbr_gcap_deep_strike: A(B21, { pf: [[0.3, 0], [-0.08, 0.5], [-0.15, 0.5], [-0.06, 0.26], [-0.16, 0]] }),
  // ---- Helicopters ----
  ah64e_apache_guardian: APACHE,
  ah1z_viper: COBRA, ah1s_cobra: H(COBRA, { r: 0.44, b: 2 }), toufan_ah1: H(COBRA, { b: 2 }),
  uh60m_blackhawk: BLACKHAWK,
  mh60r_seahawk: SEAHAWK,
  ch47f_chinook: CHINOOK, ch147f_chinook_can: CHINOOK,
  mv22b_osprey: OSPREY,
  usa_flraa_v280_valor: V280,
  ch53k_king_stallion: CH53,
  uh1h_huey: HUEY,
  h225m_caracal: H(NH90, { w: 0.14, h: 0.16, b: 5 }),
  tiger_hap: TIGER, tiger_uht: TIGER, fra_tiger_mk3: TIGER,
  a129_cbt: H(COBRA, { w: 0.07, skids: false }), t129_atak: H(COBRA, { w: 0.07, skids: false, b: 5 }), tur_t629: H(COBRA, { w: 0.07, skids: false, b: 5 }),
  aw159_wildcat: H(LIGHTHELI, { body: 'utility', skids: false, b: 4 }),
  nh90_nfh: H(NH90, { body: 'naval' }),
  nh90_tth: NH90,
  pzl_w3_sokol: H(MI8, { w: 0.12, bl: 0.54, b: 4 }),
  h160m_guepard: H160,
  gokbey_utility: H(NH90, { b: 4 }),
  mi24p: HIND, mi35m: HIND,
  mi8t: MI8, mi17v5: MI8, mi8amtsh: H(MI8, { wings: 0.14 }),
  mi28nm: H(MI28, { mast: true }),
  ka52m: KA52,
  rooivalk: H(TIGER, { w: 0.09 }), zaf_rooivalk_mk2: H(TIGER, { w: 0.09 }),
  z10: H(TIGER, { b: 5, mast: false }), z19e: H(TIGER, { w: 0.07, tr: 'fen' }), chn_z21: H(APACHE, { b: 5 }),
  lch_prachand: H(TIGER, { w: 0.07, b: 4 }),
  dhruv_rudra: H(NH90, { w: 0.13, wings: 0.14, b: 4 }),
  dhruv_alh: H(NH90, { w: 0.13, b: 4 }),
  lah_marineon: H(NH90, { b: 4, wings: 0.14 }),
  mi2_kpa: H(HUEY, { b: 3, w: 0.1 }),
  aw101_merlin: H(CH53, { b: 5, w: 0.14, h: 0.16 }),
  mi26: MI26,
  z20: BLACKHAWK,
  uh2: H(HUEY, { b: 4, w: 0.12 }),
  kuh1_surion: H(NH90, { b: 4 }),
  // ---- Transports ----
  c17a_globemaster_iii: C17,
  c5m_super_galaxy: A(C17, { r: 0.08, wing: { x: 0.14, root: 0.22, tip: 0.07, span: 0.52, sweep: 0.26, y: 0.9, dih: -0.04 } }),
  c130j_super_hercules: A(C130, { eng: { ...C130.eng!, blades: 6 } }), cc130j_hercules_can: A(C130, { eng: { ...C130.eng!, blades: 6 } }), c130h_hercules: C130,
  kc46a_pegasus: AIRLINER,
  kc135r_stratotanker: A(AIRLINER, { eng: { n: 4, k: 'pod', r: 0.022, l: 0.1, x: 0.06, z: [0.2, 0.34, -0.2, -0.34] } }),
  a330_mrtt: A(AIRLINER, { r: 0.06 }),
  embraer_kc390: TWINJET_TT,
  a400m: A(C130, { r: 0.07, tt: true, hs: { x: 0, root: 0.12, tip: 0.06, span: 0.2, sweep: 0.08 }, eng: { n: 4, k: 'prop', r: 0.024, l: 0.14, x: 0.12, z: [0.17, 0.33, -0.17, -0.33], blades: 8 }, wing: { x: 0.12, root: 0.18, tip: 0.07, span: 0.52, sweep: 0.1, y: 0.9 } }),
  c295: TWINPROP, c27j_spartan: TWINPROP, cn235_220: TWINPROP, an26: TWINPROP, an32: TWINPROP, hal_do228: A(TWINPROP, { r: 0.045 }), n219: A(TWINPROP, { r: 0.045 }),
  an178_ukr: TWINJET_TT, c2: TWINJET_TT,
  an124_ruslan: A(C17, { r: 0.08, tt: false, hs: { x: -0.4, root: 0.12, tip: 0.06, span: 0.22, sweep: 0.1, y: 0.4 }, vt: { n: 1, x: -0.28, root: 0.2, tip: 0.1, h: 0.22, sweep: 0.14, y: 0.6 } }),
  an12: A(C130, { r: 0.06, ck: [0.44, 0.08, 0.05], ckT: 'glass' }), y9: C130,
  il76md: A(C17, { r: 0.065 }), il76md90a: A(C17, { r: 0.065 }), y20: A(C17, { r: 0.068 }),
  h6u_tanker: H6,
  an2_kpaaf: A(SMALLUAV, { len: 0.9, fx: 0, r: 0.06, ck: [0.3, 0.1, 0.03], ckT: 'glass', nprop: 0.18, wing: { x: 0.2, root: 0.16, tip: 0.16, span: 0.46, sweep: 0, y: 1.0 } }),
  // ---- Drones ----
  mq9a_reaper: REAPER, mq9b_skyguardian: A(REAPER, { wing: { x: 0.12, root: 0.08, tip: 0.035, span: 0.66, sweep: 0.02, y: 0.4 } }), mq1c_gray_eagle: A(REAPER, { eng: { n: 1, k: 'pusher', r: 0.06, l: 0, x: 0, blades: 3 } }),
  rq4b_global_hawk: GLOBALHAWK, mq4c_triton: GLOBALHAWK,
  mq25a_stingray: A(WINGMAN, { wing: { x: 0.1, root: 0.2, tip: 0.07, span: 0.5, sweep: 0.12, y: 0.2 } }),
  xq58_valkyrie: WINGMAN, usa_cca_increment1: A(WINGMAN, { r: 0.05 }), ghost_bat: A(WINGMAN, { vt: { n: 2, x: -0.28, root: 0.14, tip: 0.07, h: 0.12, sweep: 0.08, cant: 0.9, z: 0.05 } }), aus_ghost_bat_2: WINGMAN,
  bayraktar_tb2: TB2, bayraktar_tb3: A(TB2, { r: 0.03 }),
  bayraktar_akinci: A(REAPER, { eng: { n: 2, k: 'prop', r: 0.02, l: 0.1, x: 0.1, z: [0.1, -0.1], blades: 3 }, vt: { n: 2, x: -0.18, root: 0.09, tip: 0.045, h: 0.1, sweep: 0.05, cant: 0.2, z: 0.02, y: 0.5 } }),
  bayraktar_kizilelma: A(WINGMAN, { cn: { x: 0.24, root: 0.1, tip: 0.03, span: 0.16, sweep: 0.08 } }), tur_kizilelma_production: A(WINGMAN, { cn: { x: 0.24, root: 0.1, tip: 0.03, span: 0.16, sweep: 0.08 } }),
  tai_anka: HARFANG_TB, tai_aksungur: A(HARFANG_TB, { r: 0.034, eng: { n: 2, k: 'prop', r: 0.02, l: 0.1, x: 0.12, z: [0.1, -0.1], blades: 3 } }), tur_anka3: FLYWING_UCAV,
  harfang: HARFANG_TB, heron_1: HARFANG_TB, heron_tp: A(HARFANG_TB, { r: 0.034 }), deu_eurodrone: A(REAPER, { eng: { n: 2, k: 'prop', r: 0.02, l: 0.1, x: 0.14, z: [0.1, -0.1], blades: 3 } }), esp_sirtap: TB2,
  watchkeeper: A(HARFANG_TB, { r: 0.024 }), hermes_450: A(REAPER, { r: 0.028 }), hermes_900: REAPER,
  patroller_sdt: A(SMALLUAV, { len: 0.8 }), mohajer_6: HARFANG_TB, kumsong_mohajer: HARFANG_TB, shahed_129: REAPER, shahed_149: REAPER, saetbyol_4: GLOBALHAWK,
  fra_neuron_ucav: FLYWING_UCAV, rus_s70_okhotnik: FLYWING_UCAV, gj11: FLYWING_UCAV, ind_ghatak: FLYWING_UCAV, chn_gj_x_wingman: FLYWING_UCAV,
  gbr_gcap_loyal_wingman: WINGMAN, fra_scaf_remote_carrier: WINGMAN, deu_fcas_remote_carrier: WINGMAN, jpn_wingman: WINGMAN, are_edge_wingman: WINGMAN, sau_spa_drone: WINGMAN, ukr_ai_drone_wing: WINGMAN,
  wing_loong_2: A(REAPER, { vt: { n: 2, x: -0.18, root: 0.09, tip: 0.045, h: 0.1, sweep: 0.05, cant: 0.8, z: 0.012, y: 0.5 } }), ch4: REAPER, ch5: A(REAPER, { wing: { x: 0.12, root: 0.09, tip: 0.04, span: 0.66, sweep: 0.02, y: 0.4 } }),
  wz7: A(GLOBALHAWK, { pf: [[0.0, 0.0], [-0.1, 0.5], [-0.16, 0.5], [-0.08, 0.0]], wing: { x: 0.1, root: 0.12, tip: 0.04, span: 0.5, sweep: 0.3, y: 0.5 } }),
  shahed_136: { main: SHAHED, members: TRI_M, scale: 0.55 }, geran2: { main: SHAHED, members: TRI_M, scale: 0.55 }, irn_shahed_238: { main: A(SHAHED, { eng: { n: 1, k: 'top', r: 0.03, l: 0.14, x: -0.3, z: [0] } }), members: TRI_M, scale: 0.55 },
  lancet3: { main: LANCET, members: TRI_M, scale: 0.5 }, kub_bla: { main: A(SHAHED, { r: 0.03, wing: { x: 0.2, root: 0.5, tip: 0.1, span: 0.32, sweep: 0.4, y: 0 }, vt: undefined }), members: TRI_M, scale: 0.5 },
  harop: { main: A(SHAHED, { cn: { x: 0.35, root: 0.1, span: 0.12 } }), members: TRI_M, scale: 0.6 },
  warmate_pol: { main: LANCET, members: TRI_M, scale: 0.5 },
  orlan10: { main: SMALLUAV, members: [[0.15, -0.2], [-0.12, 0.2]], scale: 0.7 },
  // ---- Surface combatants ----
  arleigh_burke_flt1: S(BURKE, { heli: 0.12, hangar: 0 }),
  arleigh_burke_flt2a: S(BURKE, { hangar: 0.06 }),
  arleigh_burke_flt3: S(BURKE, { hangar: 0.06, spy: [[0.08, 0.065, 0.03, 0.085, 4]] }),
  zumwalt_ddg1000: ZUMWALT,
  usa_ddgx: S(ZUMWALT, { bow: 'clip', blocks: [[0.02, 0.26, 0.86, 0.1, 0.25]], masts: [{ x: 0.04, h: 0.1, s: 'int', w: 0.07 }], guns: [[0.34, 2, 1]], vls: [[0.24, 0.1, 0.55], [-0.2, 0.08, 0.55]] }),
  ticonderoga_cg47: TICO,
  type_055: T055, chn_type_055b: S(T055, { beam: 0.135 }),
  type_052d: T052D, type_052c: S(T052D, { vls: [[0.26, 0.07, 0.4], [-0.26, 0.05, 0.4]] }), type_052b: S(T052D, { masts: [{ x: 0.05, h: 0.13, s: 'lat', r: 'rot' }], vls: [] }),
  type_45_daring: T45,
  horizon_class: S(T45, { masts: [{ x: 0.06, h: 0.15, s: 'int', w: 0.05, r: 'rot' }, { x: -0.1, h: 0.13, s: 'int', w: 0.045, r: 'dome' }], guns: [[0.34, 1, 1], [-0.3, 0, 1]], funnels: [[-0.01, 0.06, 0.05], [-0.18, 0.05, 0.04]] }),
  f124_sachsen: S(F125, { masts: [{ x: 0.07, h: 0.17, s: 'int', w: 0.055, r: 'panel' }, { x: -0.12, h: 0.1, s: 'int', w: 0.04, r: 'rot' }] }),
  alvaro_de_bazan: S(BURKE, { beam: 0.13, masts: [{ x: 0.02, h: 0.12, s: 'int', w: 0.05, r: 'rot' }], funnels: [[-0.06, 0.06, 0.05]] }),
  hobart_class: S(BURKE, { beam: 0.13, masts: [{ x: 0.02, h: 0.12, s: 'int', w: 0.05, r: 'rot' }], funnels: [[-0.06, 0.06, 0.05]] }),
  de_zeven_provincien: S(F125, { masts: [{ x: 0.07, h: 0.18, s: 'int', w: 0.06, r: 'panel' }, { x: -0.12, h: 0.1, s: 'int', w: 0.04, r: 'rot' }] }),
  gbr_type_83: S(T055, { masts: [{ x: 0.05, h: 0.2, s: 'int', w: 0.06, r: 'sph' }] }),
  deu_f127: S(BURKE, { masts: [{ x: 0.02, h: 0.14, s: 'int', w: 0.06, r: 'none' }], spy: [[0.02, 0.1, 0.028, 0.03, 4]] }),
  kongo_class: KONGO, atago_class: S(KONGO, { hangar: 0.06 }), maya_class: S(KONGO, { hangar: 0.06, blocks: [[0.05, 0.22, 0.84, 0.105, 0.08], [-0.17, 0.12, 0.62, 0.05, 0.1]] }),
  akizuki_class: S(FREMM, { blocks: [[0.04, 0.26, 0.86, 0.08, 0.12]], masts: [{ x: 0.06, h: 0.15, s: 'int', w: 0.05, r: 'panel' }, { x: -0.1, h: 0.1, s: 'int', w: 0.045, r: 'panel' }], funnels: [[-0.04, 0.05, 0.05], [-0.16, 0.05, 0.05]] }),
  asahi_class: S(FREMM, { blocks: [[0.04, 0.26, 0.86, 0.08, 0.12]], masts: [{ x: 0.06, h: 0.15, s: 'int', w: 0.05, r: 'panel' }, { x: -0.1, h: 0.1, s: 'int', w: 0.045, r: 'panel' }], funnels: [[-0.04, 0.05, 0.05], [-0.16, 0.05, 0.05]] }),
  takanami_class: S(T23, { masts: [{ x: 0.06, h: 0.12, s: 'lat', r: 'rot' }], funnels: [[-0.02, 0.05, 0.05], [-0.14, 0.05, 0.05]] }),
  jpn_13ddx: S(T26, { masts: [{ x: 0.06, h: 0.18, s: 'int', w: 0.06, r: 'panel' }] }),
  kdx3: S(KONGO, { beam: 0.13, hangar: 0.06 }), kdx3_batch2: S(KONGO, { beam: 0.13, hangar: 0.06, masts: [{ x: 0.02, h: 0.14, s: 'int', w: 0.055, r: 'rot' }] }),
  kdx2: S(T23, { masts: [{ x: 0.06, h: 0.13, s: 'lat', r: 'rot' }], guns: [[0.34, 2, 1]] }),
  kdx1: T23,
  visakhapatnam: S(GORSHKOV, { beam: 0.12, masts: [{ x: 0.04, h: 0.16, s: 'int', w: 0.055, r: 'rot' }], funnels: [[-0.06, 0.06, 0.05]] }),
  kolkata: S(GORSHKOV, { beam: 0.12, masts: [{ x: 0.04, h: 0.16, s: 'int', w: 0.055, r: 'rot' }], funnels: [[-0.06, 0.06, 0.05]] }),
  delhi: S(SOVREM, { guns: [[0.34, 1, 0]] }),
  choe_hyon: S(T055, { beam: 0.13 }), prk_choe_hyon_2: S(T055, { beam: 0.13 }),
  udaloy_class: UDALOY, sovremenny_class: SOVREM,
  rus_lider_destroyer: S(KIROV, { blocks: [[0.04, 0.26, 0.8, 0.09, 0.15], [-0.16, 0.12, 0.66, 0.06, 0.12]], masts: [{ x: 0.05, h: 0.18, s: 'tower', w: 0.07 }], guns: [[0.38, 2, 1]] }),
  kirov_class: KIROV, slava_class: SLAVA,
  can_river_class_ddg: S(T26, { spy: [[0.04, 0.09, 0.025, 0.05, 4]] }),
  almirante_brown_meko360: S(T23, { funnels: [[-0.04, 0.05, 0.04, 2]] }),
  tur_tf2000: S(T26, { masts: [{ x: 0.06, h: 0.18, s: 'int', w: 0.06, r: 'panel' }] }),
  ita_ddx: S(T055, { masts: [{ x: 0.05, h: 0.17, s: 'int', w: 0.06, r: 'panel' }] }),
  // Frigates / corvettes
  constellation_ffg62: S(FREMM, { masts: [{ x: 0.06, h: 0.14, s: 'int', w: 0.05, r: 'rot' }], spy: [[0.06, 0.1, 0.022, 0.03, 4]] }),
  lcs_freedom: S(VISBY, { beam: 0.16, blocks: [[-0.02, 0.36, 0.95, 0.07, 0.25]], masts: [{ x: 0.06, h: 0.1, s: 'int', w: 0.05, r: 'rot' }], heli: 0.16 }),
  lcs_independence: { g: 'ship', beam: 0.3, fb: 0.07, bow: 'clip', blocks: [[0.05, 0.3, 0.8, 0.07, 0.2], [-0.2, 0.2, 0.95, 0.03, 0.05]], masts: [{ x: 0.08, h: 0.1, s: 'int', w: 0.05, r: 'rot' }], guns: [[0.32, 0, 1]], heli: 0.28 },
  legend_nsc: S(OPV, { beam: 0.13, masts: [{ x: 0.08, h: 0.12, s: 'int', w: 0.04, r: 'rot' }], guns: [[0.32, 1, 1]] }),
  usa_ffgx: S(FDI, {}),
  halifax_ffh330: S(T23, { funnels: [[-0.02, 0.06, 0.05]], masts: [{ x: 0.08, h: 0.12, s: 'lat', r: 'rot' }] }),
  type_23_duke: T23, type_26_city: T26, nor_type_26_frigate: T26, hunter_class: S(T26, { spy: [[0.05, 0.1, 0.025, 0.04, 4]] }), aus_hunter_2: S(T26, { spy: [[0.05, 0.1, 0.025, 0.04, 4]] }),
  type_31_inspiration: S(OPV, { beam: 0.14, masts: [{ x: 0.07, h: 0.13, s: 'int', w: 0.045, r: 'rot' }], guns: [[0.32, 1, 1]], vls: [[0.22, 0.04, 0.4]] }),
  fremm_aquitaine: FREMM, fdi_belharra: FDI, la_fayette: LAFAYETTE, khareef_class: LAFAYETTE, formidable_class: LAFAYETTE, tamandare_class: S(FREMM, { beam: 0.14 }),
  f125_baden_wurttemberg: F125, f126_class: S(F125, { beam: 0.14, masts: [{ x: 0.06, h: 0.16, s: 'int', w: 0.06, r: 'panel' }] }), f123_brandenburg: S(T23, { funnels: [[-0.04, 0.05, 0.04, 2]] }), k130_braunschweig: CORVETTE,
  f110_bonifaz: S(FREMM, { masts: [{ x: 0.06, h: 0.14, s: 'int', w: 0.055, r: 'panel' }] }), santa_maria_class: S(T23, { beam: 0.12 }), oliver_hazard_perry_tur: S(T23, { beam: 0.12, guns: [[-0.02, 1, 0]] }),
  iver_huitfeldt: S(T26, { beam: 0.14 }), absalon_class: S(T26, { beam: 0.15, masts: [{ x: 0.07, h: 0.13, s: 'int', w: 0.05, r: 'dome' }] }),
  fridtjof_nansen: S(BURKE, { beam: 0.13, masts: [{ x: 0.05, h: 0.12, s: 'int', w: 0.045, r: 'rot' }], funnels: [[-0.06, 0.05, 0.04]], guns: [[0.33, 1, 1]] }),
  visby_class: VISBY, pohjanmaa_class: S(CORVETTE, { beam: 0.14, masts: [{ x: 0.07, h: 0.14, s: 'int', w: 0.055, r: 'rot' }] }),
  miecznik: S(T31_LIKE(), {}), karel_doorman_class: T23, vasco_da_gama_class: S(T23, { beam: 0.12 }), asw_frigate_nl: T26,
  ada_class: CORVETTE, tcg_istanbul: S(FREMM, { beam: 0.13 }), istif_class: S(FREMM, { beam: 0.13 }), barbaros_meko200: S(T23, { funnels: [[-0.04, 0.05, 0.04, 2]] }), hydra_meko200: S(T23, { funnels: [[-0.04, 0.05, 0.04, 2]] }),
  type_22_ro: S(T23, { beam: 0.11 }),
  admiral_gorshkov: GORSHKOV, admiral_grigorovich: S(GORSHKOV, { masts: [{ x: 0.05, h: 0.13, s: 'lat', r: 'rot' }] }), neustrashimy_class: S(SOVREM, { guns: [[0.34, 1, 0]] }),
  steregushchiy_class: CORVETTE, gremyashchiy_20385: S(CORVETTE, { vls: [[0.22, 0.06, 0.45]] }), koni_class: S(SOVREM, { guns: [[0.34, 1, 0], [-0.34, 1, 0]], blocks: [[0.06, 0.2, 0.7, 0.07]], can: [] }),
  saar_6: S(CORVETTE, { beam: 0.15, masts: [{ x: 0.06, h: 0.16, s: 'tower', w: 0.06 }], vls: [[0.22, 0.06, 0.45], [-0.2, 0.05, 0.4]] }), saar_5: CORVETTE,
  moudge: S(OPV, { guns: [[0.32, 1, 0]], can: [[-0.12, 2]] }), alvand: S(OPV, { guns: [[0.32, 1, 0]], can: [[-0.12, 2]] }), bayandor: OPV,
  baynunah: CORVETTE,
  type_054a: T054A, type_054b: S(T054A, { beam: 0.13, masts: [{ x: 0.06, h: 0.14, s: 'int', w: 0.055, r: 'panel' }] }), type_056a: CORVETTE, zulfiquar_f22p: S(T054A, { vls: [] }), babur_class: S(CORVETTE, { beam: 0.13 }),
  nilgiri: S(FDI, { beam: 0.13 }), shivalik: S(T054A, { beam: 0.12 }), kamorta: S(CORVETTE, { beam: 0.13 }), ind_p17b: S(FDI, { beam: 0.13 }),
  mogami_class: S(LAFAYETTE, { masts: [{ x: 0.06, h: 0.12, s: 'int', w: 0.06, r: 'dome' }] }), abukuma_class: T23, jpn_30dx: S(LAFAYETTE, { masts: [{ x: 0.06, h: 0.14, s: 'int', w: 0.06, r: 'dome' }] }),
  incheon: S(T054A, {}), daegu_ffx2: S(T054A, { masts: [{ x: 0.06, h: 0.12, s: 'int', w: 0.05, r: 'rot' }] }), chungnam_ffx3: S(T054A, { masts: [{ x: 0.06, h: 0.14, s: 'int', w: 0.055, r: 'panel' }] }), ulsan_ff: T23,
  kang_ding: LAFAYETTE, cheng_kung: S(T23, { beam: 0.12, guns: [[-0.02, 1, 0]] }),
  tuo_chiang: { g: 'ship', beam: 0.26, fb: 0.07, blocks: [[0.04, 0.3, 0.7, 0.07, 0.2]], masts: [{ x: 0.06, h: 0.08, s: 'int', w: 0.05, r: 'dome' }], guns: [[0.3, 0, 1]], can: [[-0.15, 2]] },
  anzac_class: T23, martadinata: S(CORVETTE, { beam: 0.13 }), maharaja_lela: S(CORVETTE, { beam: 0.13 }), kedah_opv: OPV, independence_class: S(CORVETTE, { beam: 0.14 }), victory_class: MISSILEBOAT,
  niteroi_class: T23, barroso_class: CORVETTE, per_lupo_class: S(T23, { beam: 0.11 }),
  amnok_class: CORVETTE, najin_class: S(OPV, { guns: [[0.32, 1, 0], [-0.3, 1, 0]] }),
  // Patrol boats
  magura_v5: { main: USV, members: TRI_M, scale: 0.35 }, sea_baby_usv: { main: USV, members: TRI_M, scale: 0.35 }, ukr_naval_swarm_usv: { main: USV, members: TRI_M, scale: 0.35 },
  cb90: { main: S(FASTBOAT, { guns: [], masts: [{ x: 0.0, h: 0.06, s: 'pole', r: 'dome' }] }), members: [[0.2, -0.22], [-0.14, 0.22]], scale: 0.5 },
  skjold_class: { g: 'ship', beam: 0.28, fb: 0.07, blocks: [[0.0, 0.34, 0.7, 0.07, 0.35]], guns: [[0.28, 0, 1]] },
  karakurt_class: S(MISSILEBOAT, { masts: [{ x: 0.05, h: 0.12, s: 'tower', w: 0.05 }], vls: [[-0.12, 0.05, 0.4]], can: [] }),
  buyan_m: S(MISSILEBOAT, { vls: [[-0.1, 0.05, 0.4]], can: [], masts: [{ x: 0.05, h: 0.12, s: 'int', w: 0.05, r: 'rot' }] }),
  bykov_22160: S(OPV, { masts: [{ x: 0.08, h: 0.14, s: 'tower', w: 0.06 }] }),
  osa_class: S(MISSILEBOAT, { can: [[-0.12, 2, 1]], blocks: [[0.08, 0.2, 0.7, 0.07]] }), molniya_1241: S(MISSILEBOAT, { can: [[-0.12, 2, 1]] }),
  type_022: { g: 'ship', beam: 0.3, fb: 0.07, blocks: [[0.0, 0.3, 0.6, 0.06, 0.3]], can: [[-0.18, 2, 1]] },
  hamina_class: S(MISSILEBOAT, { blocks: [[0.05, 0.26, 0.85, 0.07, 0.3]] }),
  sina_class: MISSILEBOAT, azmat: MISSILEBOAT, saar_45: MISSILEBOAT, falaj_3: MISSILEBOAT, hayabusa_class: MISSILEBOAT, yoon_youngha: MISSILEBOAT, kcr_60: MISSILEBOAT, kuang_hua_vi: MISSILEBOAT,
  cyclone_pc: FASTBOAT, super_dvora_mk3: FASTBOAT, shaldag_mk5: FASTBOAT, dabur_class: FASTBOAT, peykaap_ii: FASTBOAT, zolfaghar_boat: FASTBOAT, defender_class_rb: FASTBOAT,
  // ---- Carriers ----
  nimitz_cvn68: NIMITZ, ford_cvn78: FORD,
  queen_elizabeth_class: QE, charles_de_gaulle: CDG, cavour: CAVOUR, tcg_anadolu: JCI, juan_carlos_i: JCI, canberra_class: JCI,
  admiral_kuznetsov: KUZ, liaoning: KUZ, shandong: CV(KUZ, { isl: [[-0.04, 0.12, 0.035, 0.1]] }),
  fujian: CV(NIMITZ, { isl: [[-0.02, 0.07, 0.035, 0.09]], cats: 3 }),
  chn_type_004: CV(NIMITZ, { isl: [[-0.1, 0.08, 0.035, 0.09]], cats: 4 }),
  vikramaditya: CV(KUZ, { isl: [[0.0, 0.18, 0.04, 0.1]], ski: 0.16 }),
  vikrant: CV(KUZ, { isl: [[-0.04, 0.12, 0.035, 0.085]], ski: 0.15 }),
  ind_iac2: CV(NIMITZ, { isl: [[-0.08, 0.1, 0.035, 0.085]], cats: 2 }),
  izumo: IZUMO, kaga: IZUMO,
  fra_pang: CV(NIMITZ, { isl: [[-0.02, 0.08, 0.035, 0.085]], cats: 3 }),
  rus_shtorm_carrier: CV(KUZ, { isl: [[-0.02, 0.1, 0.035, 0.09], [-0.2, 0.08, 0.035, 0.085]] }),
  tur_mugem_carrier: CV(KUZ, { isl: [[-0.04, 0.12, 0.035, 0.09]] }),
  kor_cvx: CV(QE, { isl: [[-0.05, 0.14, 0.035, 0.08]], ski: 0 }),
  shahid_bagheri: CV(JCI, { isl: [[0.25, 0.12, 0.05, 0.1]], ski: 0.1, hullC: 0x5d6570 }),
  // ---- Amphibious ----
  america_lha6: CV(LHA, { well: false }), wasp_lhd1: LHA, trieste_lhd: CV(JCI, { ski: 0 }), type_075: LHA,
  type_076: CV(LHA, { cats: 1, isl: [[0.05, 0.12, 0.03, 0.08], [-0.14, 0.1, 0.03, 0.075]], ptype: 'jet' }), chn_type_076b: CV(LHA, { cats: 1, isl: [[0.05, 0.12, 0.03, 0.08], [-0.14, 0.1, 0.03, 0.075]], ptype: 'jet' }),
  mistral_class: MISTRAL, dokdo_class: MISTRAL, atlantico_lph: CV(IZUMO, { isl: [[0.0, 0.14, 0.03, 0.08]] }), esp_lhd_next: JCI,
  san_antonio_lpd17: LPD, rotterdam_class: LPD, galicia_class: LPD, albion_class: LPD, san_giorgio_class: LPD, osumi_class: CV(IZUMO, { isl: [[0.0, 0.16, 0.05, 0.07]], planes: 0, well: true }),
  type_071: LPD, yushan_lpd: LPD, makassar_lpd: LPD, endurance_class: LPD, bahia_class_lsd: LSD, whidbey_island_lsd: LSD,
  bay_class: BAYCLASS, gbr_mrss: BAYCLASS,
  ivan_gren: S(LST, { heli: 0.1, blocks: [[-0.12, 0.2, 0.8, 0.08, 0.1]], masts: [{ x: -0.1, h: 0.1, s: 'int', w: 0.04, r: 'rot' }] }),
  ropucha_775: LST, polnocny_770: S(LST, { beam: 0.18 }), makran_ship: S(OPV, { beam: 0.16, blocks: [[0.36, 0.12, 0.9, 0.08, 0.05]], heli: 0.5, hullC: 0x5d6570 }),
  type_072a: LST, landing_ship_tank_ind: LST, usa_medium_landing_ship: S(LST, { blocks: [[-0.3, 0.14, 0.8, 0.08, 0.1]] }),
  // ---- Submarines ----
  los_angeles_ssn688: LOSANGELES, seawolf_ssn21: SEAWOLF, virginia_block4: VIRGINIA, virginia_block5: SB(VIRGINIA, { hump: [0.0, 0.18, 0.008] }),
  ohio_ssbn: OHIO, columbia_class: COLUMBIA, usa_ssnx: SB(SEAWOLF, { tail: 'x' }),
  astute_class: ASTUTE, vanguard_class: SB(OHIO, { sail: [0.2, 0.08, 0.05, 1], planes: 'bow', pump: true, hump: [-0.05, 0.3, 0.02] }), dreadnought_class: SB(COLUMBIA, {}), gbr_ssn_aukus: SB(ASTUTE, { tail: 'x' }), aus_ssn_aukus: SB(ASTUTE, { tail: 'x' }),
  suffren_barracuda: BARRACUDA, rubis_class: SB(BARRACUDA, { D: 0.13, pump: false, tail: '+' }), triomphant_class: SB(BARRACUDA, { D: 0.1, hump: [-0.05, 0.28, 0.02], tail: '+' }), fra_ssbn3g: SB(BARRACUDA, { D: 0.1, hump: [-0.05, 0.28, 0.02] }),
  type_212a: T212, type_212cd: SB(T212, { sail: [0.12, 0.12, 0.065, 1] }), type_209: SB(SCORPENE, { D: 0.13 }), type_214: SB(T212, { tail: '+' }), reis_class: SB(T212, { tail: '+' }),
  scorpene: SCORPENE, kalvari: SCORPENE, idn_scorpene_evo: SCORPENE, riachuelo_class: SCORPENE,
  s80_plus: SB(SCORPENE, { D: 0.1, tail: 'x' }), gotland_class: SB(T212, { sail: [0.14, 0.1, 0.07, 0] }), a26_blekinge: SB(T212, { sail: [0.15, 0.12, 0.07, 1] }),
  collins_class: COLLINS, taigei_class: SB(SORYU, { sail: [0.18, 0.1, 0.07, 1] }), soryu_class: SORYU, oyashio_class: SB(SORYU, { tail: '+' }), jpn_new_ssk: SB(SORYU, { sail: [0.18, 0.1, 0.07, 1] }),
  project_636_kilo: KILO, project_877_kilo: KILO, sindhughosh: KILO, lada_677: SB(KILO, { shape: 'cyl', D: 0.11, sail: [0.18, 0.1, 0.06, 1] }),
  akula_971: AKULA, oscar_949a: OSCAR, delta_iv: DELTA, borei_a: BOREI, yasen_m: YASEN, rus_husky_ssn: SB(YASEN, { sail: [0.15, 0.12, 0.05, 1] }),
  type_093b: T093, chn_type_095: SB(T093, { hump: [0.0, 0.16, 0.012] }), type_094a: T094, chn_type_096: SB(T094, { sail: [0.18, 0.1, 0.05, 1], hump: [-0.04, 0.28, 0.02], pump: true }),
  type_039a: SB(KILO, { shape: 'cyl', D: 0.12, sail: [0.2, 0.1, 0.07, 3] }), type_039c: SB(KILO, { shape: 'cyl', D: 0.12, sail: [0.2, 0.12, 0.065, 1] }), type_039b: SB(KILO, { shape: 'cyl', D: 0.12, sail: [0.2, 0.1, 0.07, 3] }), type_033_romeo: SB(SCORPENE, { D: 0.1, sail: [0.08, 0.14, 0.06, 0] }),
  arihant: SB(OHIO, { D: 0.1, hump: [0.0, 0.2, 0.025] }), ind_s5_ssbn: SB(OHIO, { D: 0.1 }), ind_ssn: T093, ind_p75i: SB(T212, { tail: '+' }),
  hangor: SB(KILO, { shape: 'cyl', D: 0.12, sail: [0.2, 0.12, 0.065, 1] }), pak_hangor_2: SB(KILO, { shape: 'cyl', D: 0.12, sail: [0.2, 0.12, 0.065, 1] }),
  dosan_ahn_changho: SB(SORYU, { tail: '+', hump: [0.05, 0.1, 0.01] }), son_won_il: SB(T212, { tail: '+' }), chang_bogo: SB(SCORPENE, { D: 0.13 }), kor_kss_iv: SB(ASTUTE, {}),
  sinpo_c: SB(KILO, { D: 0.15, sail: [0.08, 0.16, 0.09, 3] }), sang_o: MIDGET, prk_ssbn: SB(KILO, { D: 0.14, sail: [0.06, 0.22, 0.08, 3] }),
  ghadir_sub: MIDGET, fateh_sub: SB(SCORPENE, { D: 0.13 }), irn_fateh_sub_ii: SB(SCORPENE, { D: 0.13 }),
  dolphin_1: SB(T212, { tail: '+', sail: [0.14, 0.1, 0.07, 0] }), dolphin_ii: SB(T212, { tail: 'x', sail: [0.14, 0.11, 0.07, 1] }),
  hai_kun: SB(SORYU, {}), twn_hai_kun_2: SB(SORYU, {}), hai_lung: SB(SCORPENE, { D: 0.12 }), nagapasa: SB(SCORPENE, { D: 0.12 }),
  walrus_class: SB(COLLINS, { D: 0.12 }), nld_orka: SB(COLLINS, {}), pol_orka: SB(COLLINS, {}), ula_class: SB(T212, { tail: '+' }), tridente_class: SB(T212, { tail: '+' }), sauro_class: SB(SCORPENE, { D: 0.12 }), preveze_class: SB(SCORPENE, { D: 0.13 }),
  tupi_tikuna_class: SB(SCORPENE, { D: 0.13 }), bra_alvaro_alberto_ssn: SB(BARRACUDA, {}), arg_sabre_submarine: SCORPENE, can_victoria_class: SB(COLLINS, { tail: '+' }), can_cpsp_submarine: SB(SORYU, {}),
};

function VAB_LIKE(): VehSpec { return V(GRIFFON, { n: 2, L: 0.85, H: 0.3, nose: 'boat', nl: 0.26, tur: undefined, pay: { k: 'sam', s: 'box', n: 8, l: 0.3, r: 0.022, a: 0.4 } }); }
function T31_LIKE(): ShipSpec { return S(OPV, { beam: 0.14, masts: [{ x: 0.07, h: 0.13, s: 'int', w: 0.045, r: 'rot' }], guns: [[0.32, 1, 1]], vls: [[0.22, 0.04, 0.4]] }); }

/** Number of hand-authored design entries. */
export const HAND_COUNT = Object.keys(HAND).length;
export const handSpecIds = (): string[] => Object.keys(HAND);

function isVisual(e: Entry): e is DesignVisual { return (e as DesignVisual).main !== undefined; }

/** Small deterministic per-design variation so designs sharing a preset still differ. */
export function varySpec(m: ModelSpec, r: Rng, a = 0.035): ModelSpec {
  switch (m.g) {
    case 'veh': {
      const o = varyVeh(m, new Rng(String(r.next())));
      return { ...o, L: m.L * r.r(1 - a, 1 + a), W: m.W * r.r(1 - a * 0.6, 1 + a * 0.6), H: m.H * r.r(1 - a, 1 + a) };
    }
    case 'air': {
      const o: AirSpec = { ...m, r: r.v(m.r, a) };
      if (o.wing) o.wing = { ...o.wing, span: r.v(o.wing.span, a), sweep: r.v(o.wing.sweep, a), root: r.v(o.wing.root, a * 0.6) };
      if (o.vt) o.vt = { ...o.vt, h: r.v(o.vt.h, a) };
      if (o.nose !== undefined || true) o.nose = r.v(m.nose ?? 0.22, a);
      return o;
    }
    case 'heli': return { ...m, r: r.v(m.r, a * 0.6), w: r.v(m.w, a), h: r.v(m.h, a), bl: r.v(m.bl ?? 0.62, a * 0.6) };
    case 'ship': return varyShip(m, r);
    case 'cv': return { ...m, beam: r.v(m.beam, a * 0.6), isl: m.isl.map(([x, l, w, h]) => [x + r.r(-0.02, 0.02), r.v(l, a), w, r.v(h, a)] as [number, number, number, number]) };
    case 'sub': return { ...m, D: r.v(m.D, a), sail: [m.sail[0] + r.r(-0.015, 0.015), r.v(m.sail[1], a), r.v(m.sail[2], a), m.sail[3]] };
    case 'soldier': return { ...m, bulk: r.v(m.bulk ?? 1, a * 0.5), pack: r.r(0.2, 1) };
    case 'towed': return { ...m, bl: r.v(m.bl, a), w: r.v(m.w ?? 0.36, a) };
  }
}

/** For hand entries shared by several designs: the first id keeps the exact preset, others get a variation. */
let firstOfShared: Map<string, string> | null = null;
function isFirstUser(id: string, e: Entry): boolean {
  if (!firstOfShared) {
    firstOfShared = new Map();
    for (const [k, v] of Object.entries(HAND)) {
      const sk = specKey(isVisual(v) ? v.main : v);
      if (!firstOfShared.has(sk)) firstOfShared.set(sk, k);
    }
  }
  return firstOfShared.get(specKey(isVisual(e) ? e.main : e)) === id;
}

/** Deterministic visual description of a design. */
export function visualFor(d: UnitDesign): DesignVisual {
  const r = new Rng(d.id);
  const st = styleOf(d.origin);
  const hand = HAND[d.id];
  let v: DesignVisual;
  if (hand) {
    v = isVisual(hand) ? hand : { main: hand };
    if (!isFirstUser(d.id, hand)) v = { ...v, main: varySpec(v.main, new Rng(d.id + '#v')) };
  } else {
    v = deriveVisual(d, st, r);
    v = { ...v, main: varySpec(v.main, new Rng(d.id + '#v'), 0.025) };
  }
  // Default secondary vehicles.
  if (!v.extra) {
    if (d.category === UnitCategory.Infantry) v = { ...v, extra: lightVehFor(st, r, /militia|basij|irregular|bolivarian|irgc/i.test(d.name)) };
    else if (d.category === UnitCategory.SpecialForces) v = { ...v, extra: st === 'us' ? V(HUMVEE, { H: 0.22 }) : lightVehFor(st, r) };
    else if (d.category === UnitCategory.Engineers && v.main.g === 'veh' && v.main.ch !== 'truck') v = { ...v, extra: st === 'ru' || st === 'mid' ? CARGO_BONNET : CARGO_TRUCK };
  }
  return v;
}

function deriveVisual(d: UnitDesign, st: Style, r: Rng): DesignVisual {
  switch (d.category) {
    case UnitCategory.Infantry: return { main: soldierFor(d, st, r, false) };
    case UnitCategory.SpecialForces: return { main: soldierFor(d, st, r, true), members: SQUAD4 };
    case UnitCategory.Mechanized: return { main: deriveMech(d, st, r) };
    case UnitCategory.Armor: return { main: deriveArmor(d, st, r) };
    case UnitCategory.Artillery: return deriveArtillery(d, st, r);
    case UnitCategory.RocketArtillery: return { main: deriveRockets(d, st, r) };
    case UnitCategory.AirDefense: return deriveAD(d, st, r);
    case UnitCategory.Recon: return { main: deriveRecon(d, st, r) };
    case UnitCategory.Engineers: return { main: varyVeh(d.mobility === 'tracked' ? ENGINEER_TRACKED : ENGINEER_TRUCK, r) };
    case UnitCategory.MissileLauncher: return { main: deriveMissile(d, st, r) };
    case UnitCategory.Fighter:
    case UnitCategory.Multirole:
    case UnitCategory.Strike: return { main: deriveFighter(d, st, r) };
    case UnitCategory.Bomber: return { main: deriveBomber(d, st, r) };
    case UnitCategory.Helicopter: return { main: deriveHeli(d, st, r) };
    case UnitCategory.AirTransport: return { main: deriveTransport(d, st, r) };
    case UnitCategory.Drone: return deriveDrone(d, st, r);
    case UnitCategory.PatrolBoat:
    case UnitCategory.Frigate:
    case UnitCategory.Destroyer:
    case UnitCategory.Cruiser: return { main: deriveSurface(d, st, r) };
    case UnitCategory.Carrier: return { main: deriveCarrier(d, st, r) };
    case UnitCategory.Submarine: return { main: deriveSub(d, st, r) };
    case UnitCategory.Amphibious: return { main: deriveAmphib(d, st, r) };
    default: return { main: CARGO_TRUCK };
  }
}

/** Stable key of a spec (identical specs share geometry). */
export function specKey(s: ModelSpec): string {
  return JSON.stringify(s, (_k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v));
}
