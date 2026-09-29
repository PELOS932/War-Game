/**
 * Real-world military equipment: Russia/Soviet legacy, Belarus, Caucasus, Central Asia,
 * Middle East, Israel, Iran, Gulf states, Egypt, South Africa and the rest of Africa.
 * Designs are built from per-category generation tables (same scale as src/sim/data/units.ts)
 * interpolated by a `tier` (1 = 1980s legacy .. 4 = 2030 cutting edge), then tuned via overrides.
 */
import { UnitCategory as U } from '../../sim/types';
import type { ArmorType, Mobility } from '../../sim/types';
import type { MilitaryDesign, NationInventory } from './schema';

type Q = [number, number, number, number];
const q = (a: number, b: number, c: number, d: number): Q => [a, b, c, d];
const Z: Q = [0, 0, 0, 0];
const all = (v: number): Q => [v, v, v, v];

interface Base {
  ar: ArmorType | [ArmorType, ArmorType, ArmorType, ArmorType]; mo: Mobility | [Mobility, Mobility, Mobility, Mobility]; pers: number;
  s: Q; h: Q; a: Q; n: Q; sb: Q; rg: Q; ra: Q; rn: Q; dg: Q; da: Q; dn: Q; sp: Q; spot: Q; st: Q; rk?: Q;
  fu: number; c: Q; mg: Q; bd: Q; up: Q; ind?: boolean; cap: boolean;
}

const B: Record<number, Base> = {
  [U.Infantry]: { ar: 'soft', mo: 'foot', pers: 800, s: q(28, 36, 45, 54), h: q(10, 16, 24, 32), a: q(3, 6, 10, 14), n: q(2, 3, 5, 8), sb: Z, rg: all(1), ra: Z, rn: Z, dg: q(38, 44, 52, 60), da: q(32, 38, 46, 54), dn: q(30, 36, 44, 52), sp: q(12, 16, 18, 20), spot: all(2), st: q(0.1, 0.12, 0.15, 0.2), fu: 120, c: q(60, 90, 140, 200), mg: q(6, 9, 12, 16), bd: q(30, 35, 40, 45), up: q(0.5, 0.62, 0.75, 0.9), cap: true },
  [U.Mechanized]: { ar: 'hard', mo: 'tracked', pers: 700, s: q(40, 48, 58, 68), h: q(24, 34, 44, 56), a: q(8, 10, 14, 18), n: q(3, 4, 6, 8), sb: Z, rg: all(1), ra: Z, rn: Z, dg: q(42, 50, 60, 70), da: q(30, 36, 44, 52), dn: q(34, 40, 48, 56), sp: q(40, 45, 50, 55), spot: q(2, 2, 3, 3), st: all(0.05), fu: 80, c: q(250, 380, 520, 700), mg: q(25, 35, 45, 60), bd: q(60, 70, 80, 90), up: q(1.1, 1.4, 1.6, 2.0), cap: true },
  [U.Armor]: { ar: 'hard', mo: 'tracked', pers: 550, s: q(36, 44, 52, 60), h: q(56, 66, 76, 88), a: q(2, 3, 4, 6), n: q(4, 5, 6, 8), sb: Z, rg: all(1), ra: Z, rn: Z, dg: q(55, 64, 73, 82), da: q(34, 40, 48, 56), dn: q(40, 46, 52, 58), sp: q(40, 48, 52, 56), spot: all(2), st: all(0.02), fu: 70, c: q(400, 600, 850, 1150), mg: q(45, 60, 80, 100), bd: q(90, 100, 110, 120), up: q(1.8, 2.1, 2.5, 3.0), cap: true },
  [U.Artillery]: { ar: ['soft', 'hard', 'hard', 'hard'], mo: ['wheeled', 'tracked', 'tracked', 'tracked'], pers: 500, s: q(48, 56, 66, 76), h: q(22, 28, 36, 46), a: Z, n: q(10, 14, 18, 24), sb: Z, rg: q(1, 2, 2, 2), ra: Z, rn: q(1, 1, 2, 2), dg: q(18, 24, 28, 32), da: q(18, 22, 26, 30), dn: q(20, 24, 28, 32), sp: q(30, 40, 45, 50), spot: all(2), st: all(0.05), fu: 80, c: q(150, 250, 360, 480), mg: q(20, 28, 36, 45), bd: q(45, 60, 70, 80), up: q(0.9, 1.1, 1.3, 1.5), ind: true, cap: false },
  [U.RocketArtillery]: { ar: 'soft', mo: 'wheeled', pers: 400, s: q(60, 70, 80, 90), h: q(26, 34, 44, 56), a: Z, n: q(12, 18, 26, 34), sb: Z, rg: q(2, 2, 3, 3), ra: Z, rn: q(1, 2, 2, 3), dg: q(16, 20, 24, 28), da: q(16, 20, 24, 28), dn: q(16, 20, 24, 28), sp: q(40, 50, 60, 65), spot: all(2), st: all(0.05), fu: 90, c: q(250, 380, 520, 700), mg: q(35, 45, 55, 70), bd: q(60, 70, 80, 90), up: q(1.1, 1.3, 1.6, 1.9), ind: true, cap: false },
  [U.AirDefense]: { ar: ['soft', 'soft', 'hard', 'hard'], mo: 'wheeled', pers: 450, s: q(4, 5, 6, 8), h: q(2, 3, 4, 5), a: q(52, 64, 78, 90), n: Z, sb: Z, rg: Z, ra: q(2, 3, 3, 4), rn: Z, dg: q(18, 22, 26, 30), da: q(50, 58, 68, 78), dn: q(18, 22, 26, 30), sp: q(35, 45, 55, 60), spot: q(3, 4, 5, 6), st: all(0.05), fu: 90, c: q(300, 550, 900, 1300), mg: q(30, 45, 65, 90), bd: q(60, 80, 100, 120), up: q(1.0, 1.4, 1.9, 2.4), cap: false },
  [U.Recon]: { ar: 'soft', mo: 'wheeled', pers: 450, s: q(24, 30, 36, 42), h: q(12, 18, 24, 30), a: q(2, 4, 6, 8), n: Z, sb: Z, rg: all(1), ra: Z, rn: Z, dg: q(26, 32, 38, 44), da: q(24, 28, 32, 36), dn: q(24, 28, 32, 36), sp: q(60, 70, 75, 80), spot: q(4, 5, 5, 6), st: q(0.2, 0.3, 0.35, 0.45), fu: 100, c: q(120, 180, 260, 350), mg: q(12, 18, 24, 30), bd: q(40, 45, 50, 55), up: q(0.6, 0.75, 0.9, 1.05), cap: true },
  [U.SpecialForces]: { ar: 'soft', mo: 'foot', pers: 400, s: q(40, 48, 58, 68), h: q(18, 26, 34, 44), a: q(6, 10, 14, 18), n: q(4, 6, 8, 10), sb: Z, rg: all(1), ra: Z, rn: Z, dg: q(40, 46, 54, 62), da: q(40, 46, 52, 58), dn: q(36, 42, 48, 54), sp: q(18, 20, 22, 24), spot: q(3, 3, 4, 4), st: q(0.35, 0.45, 0.55, 0.65), fu: 150, c: q(120, 180, 260, 360), mg: q(8, 11, 15, 20), bd: q(60, 65, 70, 75), up: q(0.7, 0.85, 1.0, 1.2), cap: true },
  [U.Engineers]: { ar: 'soft', mo: 'wheeled', pers: 600, s: q(18, 22, 28, 34), h: q(14, 18, 24, 30), a: q(2, 3, 4, 6), n: Z, sb: Z, rg: all(1), ra: Z, rn: Z, dg: q(36, 42, 50, 58), da: q(28, 32, 36, 40), dn: q(28, 32, 36, 40), sp: q(30, 40, 45, 50), spot: all(2), st: all(0.05), fu: 90, c: q(80, 120, 170, 230), mg: q(8, 12, 16, 22), bd: q(40, 45, 50, 55), up: q(0.5, 0.6, 0.7, 0.85), cap: true },
  [U.MissileLauncher]: { ar: 'soft', mo: 'wheeled', pers: 350, s: q(62, 72, 82, 92), h: q(45, 55, 66, 78), a: Z, n: q(40, 52, 64, 76), sb: Z, rg: q(4, 5, 5, 6), ra: Z, rn: q(4, 5, 5, 6), dg: q(14, 18, 22, 26), da: q(14, 18, 22, 26), dn: q(14, 18, 22, 26), sp: q(40, 50, 55, 60), spot: all(2), st: q(0.1, 0.15, 0.2, 0.25), fu: 100, c: q(500, 800, 1200, 1600), mg: q(60, 80, 100, 120), bd: q(90, 110, 130, 150), up: q(1.5, 1.9, 2.3, 2.7), ind: true, cap: false },
  [U.Fighter]: { ar: 'air', mo: 'air', pers: 250, s: q(4, 6, 8, 10), h: q(4, 6, 8, 10), a: q(58, 70, 82, 94), n: q(4, 6, 8, 10), sb: Z, rg: Z, ra: all(2), rn: Z, dg: q(55, 66, 78, 90), da: q(55, 66, 78, 90), dn: q(55, 66, 78, 90), sp: q(900, 1100, 1300, 1500), spot: q(3, 4, 5, 6), st: q(0, 0.1, 0.4, 0.6), rk: q(800, 1000, 1200, 1400), fu: 4, c: q(900, 1500, 2200, 3200), mg: q(60, 90, 130, 180), bd: q(180, 220, 260, 300), up: q(2.6, 3.4, 4.3, 5.5), cap: false },
  [U.Multirole]: { ar: 'air', mo: 'air', pers: 250, s: q(30, 40, 50, 60), h: q(30, 40, 52, 64), a: q(45, 56, 68, 80), n: q(26, 36, 46, 58), sb: Z, rg: Z, ra: all(1), rn: Z, dg: q(48, 58, 70, 82), da: q(48, 58, 70, 82), dn: q(48, 58, 70, 82), sp: q(850, 1000, 1150, 1300), spot: q(3, 4, 5, 5), st: q(0, 0.05, 0.35, 0.5), rk: q(700, 900, 1100, 1300), fu: 4, c: q(800, 1300, 1900, 2800), mg: q(55, 80, 115, 160), bd: q(170, 210, 250, 290), up: q(2.4, 3.0, 3.8, 4.8), cap: false },
  [U.Strike]: { ar: 'air', mo: 'air', pers: 240, s: q(50, 60, 70, 80), h: q(50, 62, 74, 86), a: q(10, 12, 16, 20), n: q(40, 50, 60, 72), sb: Z, rg: Z, ra: Z, rn: Z, dg: q(35, 42, 54, 66), da: q(35, 42, 54, 66), dn: q(35, 42, 54, 66), sp: q(750, 850, 950, 1050), spot: q(3, 3, 4, 4), st: q(0, 0, 0.5, 0.6), rk: q(650, 850, 1000, 1200), fu: 4, c: q(700, 1100, 1600, 2300), mg: q(55, 80, 110, 150), bd: q(160, 200, 240, 280), up: q(2.2, 2.8, 3.5, 4.4), cap: false },
  [U.Bomber]: { ar: 'air', mo: 'air', pers: 300, s: q(75, 84, 92, 98), h: q(55, 66, 76, 86), a: all(5), n: q(35, 45, 55, 65), sb: Z, rg: Z, ra: Z, rn: Z, dg: q(30, 38, 55, 70), da: q(30, 38, 55, 70), dn: q(30, 38, 55, 70), sp: q(800, 850, 900, 1100), spot: all(3), st: q(0, 0.1, 0.7, 0.8), rk: q(3500, 4500, 6000, 7000), fu: 14, c: q(2500, 4000, 6000, 9000), mg: q(120, 180, 250, 330), bd: q(300, 360, 420, 480), up: q(5.5, 7.0, 8.8, 11.0), cap: false },
  [U.Helicopter]: { ar: 'air', mo: 'air', pers: 220, s: q(42, 50, 58, 66), h: q(50, 60, 70, 80), a: q(3, 5, 8, 10), n: q(12, 16, 20, 26), sb: q(10, 14, 18, 22), rg: Z, ra: Z, rn: Z, dg: q(22, 28, 34, 40), da: q(22, 28, 34, 40), dn: q(22, 28, 34, 40), sp: q(220, 250, 270, 400), spot: q(3, 3, 4, 4), st: q(0, 0, 0.1, 0.2), rk: q(180, 220, 260, 400), fu: 3, c: q(350, 550, 800, 1100), mg: q(30, 45, 60, 80), bd: q(120, 140, 160, 180), up: q(1.1, 1.4, 1.7, 2.1), cap: false },
  [U.AirTransport]: { ar: 'air', mo: 'air', pers: 200, s: Z, h: Z, a: Z, n: Z, sb: Z, rg: Z, ra: Z, rn: Z, dg: q(12, 15, 18, 22), da: q(12, 15, 18, 22), dn: q(12, 15, 18, 22), sp: q(500, 650, 750, 800), spot: all(2), st: Z, rk: q(2000, 2600, 3200, 3800), fu: 10, c: q(600, 900, 1200, 1500), mg: q(30, 40, 50, 60), bd: q(150, 170, 190, 210), up: q(1.2, 1.5, 1.8, 2.1), cap: false },
  [U.Drone]: { ar: 'air', mo: 'air', pers: 120, s: q(22, 32, 44, 56), h: q(22, 34, 46, 58), a: q(0, 0, 6, 14), n: q(10, 18, 26, 34), sb: Z, rg: Z, ra: Z, rn: Z, dg: q(10, 14, 20, 28), da: q(10, 14, 20, 28), dn: q(10, 14, 20, 28), sp: q(180, 250, 400, 650), spot: q(4, 5, 6, 7), st: q(0.2, 0.3, 0.45, 0.6), rk: q(700, 1000, 1400, 1800), fu: 24, c: q(150, 300, 500, 800), mg: q(15, 25, 40, 60), bd: q(60, 80, 100, 120), up: q(0.4, 0.6, 0.9, 1.2), cap: false },
  [U.PatrolBoat]: { ar: 'naval', mo: 'naval', pers: 120, s: q(10, 12, 14, 16), h: q(6, 8, 10, 12), a: q(6, 10, 14, 18), n: q(18, 26, 34, 42), sb: q(6, 10, 14, 18), rg: all(1), ra: q(0, 1, 1, 1), rn: q(1, 1, 2, 2), dg: all(20), da: q(18, 22, 26, 30), dn: q(20, 24, 28, 32), sp: q(45, 50, 55, 60), spot: q(2, 3, 3, 4), st: q(0.1, 0.15, 0.2, 0.3), fu: 240, c: q(80, 130, 190, 260), mg: q(8, 12, 16, 22), bd: q(90, 110, 130, 150), up: q(0.25, 0.32, 0.4, 0.48), cap: false },
  [U.Frigate]: { ar: 'naval', mo: 'naval', pers: 180, s: q(14, 16, 20, 24), h: q(10, 12, 14, 18), a: q(30, 38, 46, 54), n: q(36, 44, 52, 60), sb: q(44, 52, 60, 70), rg: all(1), ra: q(1, 2, 2, 2), rn: q(2, 2, 3, 3), dg: q(35, 40, 45, 50), da: q(40, 48, 56, 64), dn: q(40, 48, 56, 64), sp: q(40, 42, 44, 46), spot: q(3, 4, 4, 5), st: q(0.05, 0.1, 0.15, 0.2), fu: 500, c: q(450, 650, 850, 1100), mg: q(40, 55, 70, 90), bd: q(360, 420, 480, 540), up: q(0.8, 1.0, 1.2, 1.4), cap: false },
  [U.Destroyer]: { ar: 'naval', mo: 'naval', pers: 300, s: q(22, 26, 30, 36), h: q(14, 18, 22, 28), a: q(50, 62, 74, 86), n: q(50, 60, 70, 80), sb: q(36, 44, 52, 62), rg: all(2), ra: q(2, 2, 3, 3), rn: q(3, 3, 4, 4), dg: q(50, 56, 62, 68), da: q(50, 60, 70, 80), dn: q(50, 58, 66, 74), sp: q(44, 46, 48, 50), spot: q(4, 4, 5, 5), st: q(0.05, 0.1, 0.15, 0.3), fu: 500, c: q(1000, 1500, 2100, 2800), mg: q(80, 110, 140, 180), bd: q(540, 600, 660, 720), up: q(1.5, 1.9, 2.3, 2.8), cap: false },
  [U.Cruiser]: { ar: 'naval', mo: 'naval', pers: 400, s: q(30, 34, 40, 46), h: q(20, 24, 28, 34), a: q(64, 74, 84, 92), n: q(62, 72, 82, 90), sb: q(26, 32, 38, 44), rg: q(2, 2, 3, 3), ra: q(3, 3, 4, 4), rn: q(4, 4, 5, 5), dg: q(60, 64, 68, 72), da: q(60, 68, 76, 84), dn: q(60, 66, 72, 78), sp: q(44, 46, 48, 50), spot: all(5), st: q(0.02, 0.05, 0.1, 0.2), fu: 600, c: q(2200, 3000, 3800, 4800), mg: q(160, 200, 240, 300), bd: q(720, 780, 840, 900), up: q(2.6, 3.1, 3.6, 4.2), cap: false },
  [U.Carrier]: { ar: 'naval', mo: 'naval', pers: 5000, s: all(4), h: all(4), a: q(20, 24, 28, 32), n: q(6, 8, 8, 10), sb: q(10, 12, 14, 16), rg: Z, ra: all(1), rn: all(1), dg: q(60, 66, 72, 80), da: q(50, 56, 62, 68), dn: q(60, 66, 72, 80), sp: q(48, 50, 52, 54), spot: all(6), st: Z, fu: 5000, c: q(6000, 9000, 12000, 14000), mg: q(400, 550, 700, 850), bd: q(1080, 1200, 1320, 1460), up: q(8, 10, 12, 14), cap: false },
  [U.Submarine]: { ar: 'sub', mo: 'naval', pers: 130, s: q(0, 0, 10, 16), h: q(0, 0, 8, 14), a: Z, n: q(60, 70, 80, 90), sb: q(44, 54, 64, 76), rg: q(0, 0, 3, 4), ra: Z, rn: q(1, 2, 2, 3), dg: q(45, 52, 60, 68), da: q(60, 65, 70, 75), dn: q(45, 52, 60, 68), sp: q(30, 36, 40, 45), spot: q(2, 3, 3, 4), st: q(0.6, 0.7, 0.8, 0.88), fu: 1500, c: q(900, 1600, 2600, 3600), mg: q(70, 110, 160, 210), bd: q(540, 620, 700, 780), up: q(1.2, 1.7, 2.3, 2.9), cap: false },
  [U.Amphibious]: { ar: 'naval', mo: 'naval', pers: 1000, s: q(16, 20, 24, 28), h: q(8, 10, 12, 14), a: q(18, 24, 30, 36), n: q(8, 10, 12, 14), sb: q(4, 6, 8, 10), rg: q(1, 1, 2, 2), ra: all(1), rn: all(1), dg: q(40, 46, 52, 58), da: q(40, 46, 52, 58), dn: q(40, 46, 52, 58), sp: q(36, 38, 40, 42), spot: all(3), st: Z, fu: 800, c: q(1000, 1600, 2200, 3000), mg: q(80, 110, 140, 180), bd: q(540, 600, 660, 720), up: q(1.5, 1.9, 2.3, 2.7), cap: false },
};

/** Interpolate a 4-generation table at fractional tier (1..4, extrapolates beyond). */
const ip = (v: Q, t: number): number => {
  const i = Math.min(2, Math.max(0, Math.floor(t - 1)));
  const f = t - 1 - i;
  return Math.max(0, v[i] + (v[i + 1] - v[i]) * f);
};
const r1 = (x: number) => Math.round(x * 100) / 100;
const ri = (x: number) => Math.round(x);
const pick = <T,>(v: T | [T, T, T, T], t: number): T => (Array.isArray(v) ? (v as T[])[Math.min(3, Math.max(0, Math.round(t - 1)))] : (v as T));

/** Overrides: s/h/a/n/sb attacks, rg/ra/rn ranges, dg/da/dn defences, sp speed, spot, st stealth, rk range km,
 *  cm cost multiplier, c absolute cost, up upkeep, bd build days, p personnel, ar armor, mo mobility, ind, cap, x (=false: not exportable), ex export list. */
interface O {
  s?: number; h?: number; a?: number; n?: number; sb?: number; rg?: number; ra?: number; rn?: number;
  dg?: number; da?: number; dn?: number; sp?: number; spot?: number; st?: number; rk?: number;
  cm?: number; c?: number; up?: number; bd?: number; p?: number; ar?: ArmorType; mo?: Mobility;
  ind?: boolean; cap?: boolean; x?: boolean; ex?: string[]; fu?: number;
}

const build = (id: string, name: string, cat: U, origin: string, year: number, t: number, desc: string, o: O = {}, fut?: { rc: number; pred?: string }): MilitaryDesign => {
  const b = B[cat];
  const cm = o.cm ?? 1;
  const isAir = cat >= U.Fighter && cat <= U.Drone;
  return {
    id, name, category: cat, origin, year, future: !!fut,
    ...(fut ? { researchCost: fut.rc } : {}),
    ...(fut?.pred ? { predecessor: fut.pred } : {}),
    ...(o.ex ? { exportTo: o.ex } : {}),
    exportable: o.x ?? true,
    armor: o.ar ?? pick(b.ar, t), mobility: o.mo ?? pick(b.mo, t),
    personnel: o.p ?? b.pers,
    attackSoft: ri(o.s ?? ip(b.s, t)), attackHard: ri(o.h ?? ip(b.h, t)), attackAir: ri(o.a ?? ip(b.a, t)),
    attackNaval: ri(o.n ?? ip(b.n, t)), attackSub: ri(o.sb ?? ip(b.sb, t)),
    rangeGround: o.rg ?? ri(ip(b.rg, t)), rangeAir: o.ra ?? ri(ip(b.ra, t)), rangeNaval: o.rn ?? ri(ip(b.rn, t)),
    defenseGround: ri(o.dg ?? ip(b.dg, t)), defenseAir: ri(o.da ?? ip(b.da, t)), defenseNaval: ri(o.dn ?? ip(b.dn, t)),
    speedKmh: ri(o.sp ?? ip(b.sp, t)), spotting: o.spot ?? ri(ip(b.spot, t)),
    stealth: Math.min(0.95, r1(o.st ?? ip(b.st, t))),
    rangeKm: isAir ? (o.rk ?? ri(b.rk ? ip(b.rk, t) : 800)) : 0,
    fuelCapacity: o.fu ?? b.fu,
    cost: ri(o.c ?? ip(b.c, t) * cm), militaryGoodsCost: ri(ip(b.mg, t) * cm),
    buildDays: o.bd ?? ri(ip(b.bd, t)), upkeep: r1(o.up ?? ip(b.up, t) * cm),
    indirect: o.ind ?? !!b.ind, canCapture: o.cap ?? b.cap, description: desc,
  };
};
const d = build;
const f = (id: string, name: string, cat: U, origin: string, year: number, t: number, pred: string, rc: number, desc: string, o: O = {}) =>
  build(id, name, cat, origin, year, t, desc, o, { rc, pred });

export const DESIGNS: MilitaryDesign[] = [
  // =====================================================================================
  // RUSSIA / SOVIET LEGACY  -- LAND
  // =====================================================================================
  d('t55', 'T-55A/AM', U.Armor, 'RUS', 1958, 0.55, 'Soviet 36 t MBT, 100 mm gun; ubiquitous across Africa and the Middle East, obsolete against modern armour.', { cm: 0.6 }),
  d('t62', 'T-62M', U.Armor, 'RUS', 1961, 0.75, 'Soviet 40 t MBT with 115 mm smoothbore; still fielded by Syria, Uzbekistan, Ethiopia, Sudan.', { cm: 0.7 }),
  d('t72m', 'T-72M/M1', U.Armor, 'RUS', 1973, 1.15, 'Export T-72 with 125 mm gun and basic composite armour, 44 t; the backbone of dozens of armies.', { cm: 0.8 }),
  d('t72b3', 'T-72B3', U.Armor, 'RUS', 2011, 2.0, 'Modernised T-72B with Sosna-U sight, Relikt ERA and 9M119 Svinets missile, 46 t.'),
  d('t72b3m', 'T-72B3M (2022)', U.Armor, 'RUS', 2022, 2.4, 'T-72B3 with improved armour package, slat cages and more powerful V-92S2F 1,130 hp engine.'),
  d('t80bvm', 'T-80BVM', U.Armor, 'RUS', 2017, 2.7, 'Gas-turbine T-80B modernised with Relikt ERA and Sosna-U sight; fast, 46 t, 125 mm gun.'),
  d('t90a', 'T-90A', U.Armor, 'RUS', 2006, 2.7, 'T-90 with welded turret, Kontakt-5/Shtora, 125 mm gun; 46.5 t.'),
  d('t90s', 'T-90S/SK Bhishma-type', U.Armor, 'RUS', 2001, 2.6, 'Export T-90 sold to Algeria, Azerbaijan, Iraq, Turkmenistan, Vietnam; 125 mm gun, Kontakt-5 ERA.'),
  d('t90m', 'T-90M Proryv-3', U.Armor, 'RUS', 2020, 3.3, 'Latest T-90 with Relikt ERA, Kalina fire control, remote weapon station and 1,130 hp engine; 48 t.'),
  d('t14_armata', 'T-14 Armata', U.Armor, 'RUS', 2022, 3.7, 'Unmanned-turret MBT with crew capsule, 2A82-1M 125 mm gun, Malachit ERA and Afghanit APS; 55 t. Limited series.', { cm: 1.15, x: false }),
  d('bmp1', 'BMP-1/BMP-1P', U.Mechanized, 'RUS', 1966, 0.8, 'First Soviet IFV: 73 mm gun and Malyutka ATGM, 13 t, amphibious. Widely exported.', { cm: 0.65 }),
  d('bmp2m', 'BMP-2M Berezhok', U.Mechanized, 'RUS', 2016, 2.0, '30 mm autocannon IFV upgraded with Berezhok turret, Kornet ATGM and thermal sights; 14.3 t.'),
  d('bmp2', 'BMP-2', U.Mechanized, 'RUS', 1980, 1.3, '30 mm 2A42 autocannon and Konkurs ATGM, 14 t; exported to 30+ users.', { cm: 0.8 }),
  d('bmp3', 'BMP-3', U.Mechanized, 'RUS', 1987, 2.4, '100 mm gun/launcher plus 30 mm cannon, 18.7 t IFV with strong firepower.'),
  d('bmd4m', 'BMD-4M Sadovnitsa', U.Mechanized, 'RUS', 2016, 2.4, 'Airborne IFV, 13.6 t, air-droppable with crew inside; 100 mm + 30 mm guns.', { mo: 'tracked', dg: 52 }),
  d('mtlb', 'MT-LB', U.Mechanized, 'RUS', 1964, 0.9, 'Light tracked multi-purpose carrier, 12 t; carries 11 troops and many specialised variants.', { cm: 0.55, dg: 38 }),
  d('btr60', 'BTR-60PB', U.Mechanized, 'RUS', 1960, 0.55, 'Soviet 8x8 amphibious APC with 14.5 mm KPVT; widely exported to Africa.', { cm: 0.5, mo: 'wheeled', dg: 34 }),
  d('btr70', 'BTR-70/BTR-70M', U.Mechanized, 'RUS', 1972, 0.8, '8x8 amphibious APC with 14.5 mm gun.', { cm: 0.55, mo: 'wheeled', dg: 36 }),
  d('btr80', 'BTR-80/80A', U.Mechanized, 'RUS', 1986, 1.3, '8x8 APC, 30 mm 2A72 on 80A; 13.6 t, exported to 20+ nations.', { cm: 0.7, mo: 'wheeled' }),
  d('btr82a', 'BTR-82A', U.Mechanized, 'RUS', 2013, 1.9, 'Modernised BTR with 30 mm 2A72, improved armour and fire control.', { mo: 'wheeled' }),
  d('kurganets25', 'Kurganets-25', U.Mechanized, 'RUS', 2021, 3.3, 'Tracked amphibious IFV on the Armata-family platform; 25 t, AU-220M 57 mm or 30 mm turret. Limited series.', { cm: 1.05 }),
  d('boomerang_k17', 'K-17 Boomerang-BM', U.Mechanized, 'RUS', 2021, 3.2, '8x8 wheeled IFV/APC, 25+ t, Epoch turret with 30 mm gun and Kornet ATGM.', { mo: 'wheeled' }),
  d('brdm2', 'BRDM-2', U.Recon, 'RUS', 1962, 0.8, 'Soviet 4x4 amphibious scout car with 14.5 mm gun; ubiquitous Cold War export.', { cm: 0.6 }),
  d('tigr_m', 'GAZ-233014 Tigr-M', U.Recon, 'RUS', 2006, 2.4, 'Russian light 4x4 armoured patrol vehicle with RWS; used by recon and special forces.'),
  d('ratnik_infantry', 'Motor Rifle Battalion (Ratnik)', U.Infantry, 'RUS', 2015, 2.7, 'Modern Russian infantry with Ratnik-3 kit, AK-12, RPG-7/Kornet and drones.', { cm: 1.0 }),
  d('vdv_airborne', 'VDV Airborne Battalion', U.Infantry, 'RUS', 2010, 3.0, 'Russian airborne troops (VDV) with BMD-family vehicles and Ratnik equipment; elite light infantry.', { cm: 1.15, sp: 22 }),
  d('naval_infantry_rus', 'Naval Infantry (Morskaya Pekhota)', U.Infantry, 'RUS', 2010, 2.9, 'Russian marines, amphibious assault troops with BTR-82A and T-72B3 support.', { cm: 1.1 }),
  d('spetsnaz_gru', 'GRU Spetsnaz Group', U.SpecialForces, 'RUS', 2012, 3.2, 'Elite reconnaissance-sabotage teams of the GRU; also Zaslon/Alpha-type units.'),
  d('soviet_spetsnaz', 'Spetsnaz-trained Commando Battalion', U.SpecialForces, 'RUS', 1985, 1.6, 'Soviet-style commando battalions found in Syria, Ethiopia, Uzbekistan and elsewhere.', { cm: 0.7 }),
  d('ak_light_infantry', 'AK-armed Light Infantry Battalion', U.Infantry, 'RUS', 1978, 0.9, 'Conventional light infantry armed with AK-74/AKM, RPGs and PKM; the standard line battalion of most developing armies.', { cm: 0.6 }),
  d('imr3m', 'IMR-3M Engineer Clearing Vehicle', U.Engineers, 'RUS', 2005, 1.8, 'T-90-hull combat engineer vehicle with dozer blade and manipulator arm; supports mine clearance.'),
  d('isdm_engineer', 'BMR-3M Mine-Clearing Battalion', U.Engineers, 'RUS', 2013, 2.2, 'Heavily armoured mine-clearing vehicles built on the T-90 chassis; clear lanes through minefields.'),
  d('d30', 'D-30 122 mm Howitzer', U.Artillery, 'RUS', 1960, 0.8, 'Towed 122 mm howitzer, range 15.3 km; most widely used Soviet howitzer worldwide.', { cm: 0.55 }),
  d('2a65_msta_b', '2A65 Msta-B 152 mm', U.Artillery, 'RUS', 1986, 1.6, 'Towed 152 mm howitzer, range 24.7 km (30 km with RAP), 7 t.', { mo: 'wheeled', ar: 'soft' }),
  d('2s1_gvozdika', '2S1 Gvozdika 122 mm SPH', U.Artillery, 'RUS', 1971, 1.0, 'Tracked amphibious SP howitzer, 15.7 t, 122 mm, 15 km range; exported worldwide.', { cm: 0.6 }),
  d('2s3_akatsiya', '2S3 Akatsiya 152 mm SPH', U.Artillery, 'RUS', 1971, 1.05, 'Soviet SP 152 mm howitzer, 28 t, range 18.5 km.'),
  d('2s5_giatsint', '2S5 Giatsint-S 152 mm', U.Artillery, 'RUS', 1976, 1.6, 'Long-range 152 mm SP gun, 28 t, range 28-33 km.', { rg: 2 }),
  d('2s7_pion', '2S7M Malka 203 mm', U.Artillery, 'RUS', 1975, 1.8, 'Heavy 203 mm SP gun, 46 t, range 37 km.', { rg: 2, s: 74, h: 42 }),
  d('2s19m2', '2S19M2 Msta-S', U.Artillery, 'RUS', 2017, 2.6, '152 mm SP howitzer with automated fire control and Malakhit ERA; 42 t, range 29-40 km.'),
  d('2s31_vena', '2S31 Vena 120 mm', U.Artillery, 'RUS', 2010, 2.3, 'Tracked 120 mm gun-mortar (BMP-3 chassis), 19.5 t.'),
  d('2s35_koalitsiya', '2S35 Koalitsiya-SV', U.Artillery, 'RUS', 2021, 3.6, '152 mm SP howitzer with unmanned turret; 16 rpm, range up to 70 km with guided shells; 48 t.', { cm: 1.05 }),
  d('bm21_grad', 'BM-21 Grad 122 mm MRL', U.RocketArtillery, 'RUS', 1963, 1.0, '40-tube 122 mm truck-mounted rocket launcher, range 20-40 km; used by 60+ countries.', { cm: 0.6, rg: 2 }),
  d('bm27_uragan', 'BM-27 Uragan 220 mm MRL', U.RocketArtillery, 'RUS', 1975, 1.7, '16-tube 220 mm MRL, range 35 km with cluster warheads.', { rg: 2 }),
  d('bm30_smerch', 'BM-30 Smerch 300 mm MRL', U.RocketArtillery, 'RUS', 1987, 2.4, '12-tube 300 mm MRL, range 70-90 km, cluster and thermobaric warheads.', { rg: 3 }),
  d('tornado_s', 'BM-30 Tornado-S', U.RocketArtillery, 'RUS', 2016, 3.2, 'Modernised Smerch with digital fire control and guided rockets, range up to 120 km.', { rg: 3 }),
  d('tornado_g', '9K51M Tornado-G', U.RocketArtillery, 'RUS', 2013, 2.5, 'Modernised BM-21 with automated fire control and GLONASS; 40 rockets.', { rg: 2 }),
  d('tos1a', 'TOS-1A Solntsepek', U.RocketArtillery, 'RUS', 2001, 2.6, 'Heavy flamethrower system, 24-tube 220 mm thermobaric rockets on T-72 chassis, range 6 km. Devastating vs infantry and fortifications.', { ar: 'hard', mo: 'tracked', rg: 1, s: 96, h: 50, dg: 40, cm: 0.9 }),
  d('tochka_u', '9K79-1 Tochka-U (SS-21)', U.MissileLauncher, 'RUS', 1989, 1.2, 'Tactical ballistic missile, 120 km, 480 kg warhead; used by Syria, Yemen, Armenia, Belarus.', { rg: 3, cm: 0.6 }),
  d('scud_b', 'R-17 Scud-B/C', U.MissileLauncher, 'RUS', 1962, 0.6, 'Soviet TBM on MAZ-543 launcher, 300-600 km; widely proliferated (Syria, Yemen, Iraq legacy, Egypt).', { rg: 6, cm: 0.5, s: 66, h: 36 }),
  d('iskander_m', '9K720 Iskander-M (SS-26)', U.MissileLauncher, 'RUS', 2006, 3.2, 'Short-range ballistic missile 9M723, 500 km, 480-700 kg warhead, quasi-ballistic evasive flight; Iskander-K cruise missile 9M728 also carried.', { rg: 6, x: false }),
  d('bastion_p', 'K-300P Bastion-P', U.MissileLauncher, 'RUS', 2010, 3.0, 'Mobile coastal defence system with P-800 Oniks supersonic anti-ship missiles, range 300-600 km.', { rg: 5, rn: 6, n: 90, s: 62, h: 62, cm: 0.85 }),
  d('bal_e', '3K60 Bal coastal system', U.MissileLauncher, 'RUS', 2004, 2.4, 'Coastal defence with Kh-35 (Uran) anti-ship missiles, range 130-260 km.', { rg: 4, rn: 5, n: 70, s: 44, h: 44, cm: 0.55 }),
  d('rs26_oreshnik', 'RS-26 Oreshnik IRBM', U.MissileLauncher, 'RUS', 2024, 4.0, 'Road-mobile intermediate-range hypersonic ballistic missile with MIRV manoeuvring warheads, range 3,000-5,500 km.', { rg: 8, rn: 8, x: false, cm: 1.4, st: 0.3 }),
  d('s75', 'S-75 Dvina/Volkhov (SA-2)', U.AirDefense, 'RUS', 1957, 0.5, 'First-generation high-altitude SAM, 45 km; still used in Africa and the Middle East.', { cm: 0.35, ra: 2 }),
  d('s125_pechora', 'S-125 Neva/Pechora (SA-3)', U.AirDefense, 'RUS', 1961, 0.9, 'Low-to-medium altitude SAM, range 25-35 km; upgraded Pechora-2M widely used.', { cm: 0.45, ra: 2 }),
  d('s200', 'S-200VE Vega (SA-5)', U.AirDefense, 'RUS', 1967, 1.3, 'Long-range SAM, 250-300 km range, heavy warhead; Syria, Kazakhstan, Belarus.', { ra: 3, cm: 0.7, mo: 'wheeled', a: 60 }),
  d('zsu23_4', 'ZSU-23-4 Shilka', U.AirDefense, 'RUS', 1965, 0.8, 'Radar-guided quad 23 mm SPAAG, 2.5 km range; all over Africa and Asia.', { ra: 1, a: 36, mo: 'tracked', ar: 'hard', cm: 0.25, spot: 3 }),
  d('zu23_2', 'ZU-23-2 Twin 23 mm AA', U.AirDefense, 'RUS', 1960, 0.6, 'Towed twin 23 mm AA gun, usually truck-mounted as technicals; cheapest AD in service.', { ra: 1, a: 26, cm: 0.12, ar: 'soft' }),
  d('strela10', '9K35 Strela-10 (SA-13)', U.AirDefense, 'RUS', 1976, 1.0, 'Short-range IR-guided SAM on MT-LB, 5 km.', { ra: 1, cm: 0.4, mo: 'tracked' }),
  d('osa_9k33', '9K33 Osa (SA-8)', U.AirDefense, 'RUS', 1971, 1.2, 'Amphibious short-range SAM on 6x6, 10-15 km, integrated radar.', { ra: 1, cm: 0.5 }),
  d('tunguska_2k22', '2K22M Tunguska', U.AirDefense, 'RUS', 1982, 2.0, 'Gun/missile SPAAG: 2x30 mm + 8 9M311 missiles, range 8-10 km.', { ra: 2, mo: 'tracked', ar: 'hard' }),
  d('buk_m1', '9K37M1 Buk-M1 (SA-11)', U.AirDefense, 'RUS', 1983, 1.8, 'Medium-range SAM with 32 km range; tracked TELARs.', { ra: 2, mo: 'tracked', ar: 'hard' }),
  d('buk_m2', '9K317 Buk-M2 (SA-17)', U.AirDefense, 'RUS', 2008, 2.4, 'Medium-range SAM, 45 km, engages up to 24 targets simultaneously.', { ra: 3, mo: 'tracked', ar: 'hard' }),
  d('buk_m3', '9K317M Buk-M3 (SA-27)', U.AirDefense, 'RUS', 2016, 3.2, 'Buk-M3 with 9M317M missiles, 70 km range, 6 missiles per TELAR.', { ra: 3, mo: 'tracked', ar: 'hard' }),
  d('tor_m1', '9K330 Tor-M1 (SA-15)', U.AirDefense, 'RUS', 1991, 2.0, 'Short-range point defence SAM, 12 km, 8 missiles, tracked.', { ra: 2, mo: 'tracked', ar: 'hard' }),
  d('tor_m2', '9K332 Tor-M2', U.AirDefense, 'RUS', 2011, 3.1, 'Modern short-range SAM, 15 km range, engages 4 targets simultaneously; also anti-PGM.', { ra: 2, mo: 'tracked', ar: 'hard' }),
  d('pantsir_s1', '96K6 Pantsir-S1', U.AirDefense, 'RUS', 2012, 3.2, 'Truck-mounted gun/missile AD system: 12 missiles (20 km) + 2x30 mm guns; UAE, Syria and Algeria users.', { ra: 2 }),
  d('s300pmu2', 'S-300PMU-2 Favorit', U.AirDefense, 'RUS', 1997, 2.8, 'Long-range SAM, 200 km range, engages 6 targets; exported to Iran, Algeria, Vietnam, Azerbaijan, Armenia.', { ra: 4 }),
  d('s300v4', 'S-300V4', U.AirDefense, 'RUS', 2014, 3.4, 'Army-level ABM/SAM with 9M82MV missiles, 400 km vs aircraft, ABM to 40 km.', { ra: 4, mo: 'tracked', ar: 'hard' }),
  d('s400', 'S-400 Triumf (SA-21)', U.AirDefense, 'RUS', 2007, 3.6, 'Long-range IAMD, 40N6 up to 400 km, 48N6 250 km; exported to China, Turkey, India, Belarus.', { ra: 5, x: true, cm: 1.1 }),
  d('s400_belarus', 'S-400 (Belarus)', U.AirDefense, 'RUS', 2016, 3.5, 'S-400 fielded by Belarus air defence forces (integrated with Russian regional group).', { ra: 5, cm: 1.1 }),
  // ---- RUSSIA AIR
  d('mig21bis', 'MiG-21bis/MF', U.Fighter, 'RUS', 1959, 0.75, 'Soviet Mach 2 point-defence fighter; still flown by dozens of poorer air forces.', { cm: 0.35, rk: 600 }),
  d('mig23ml', 'MiG-23ML/MLD', U.Fighter, 'RUS', 1970, 1.0, 'Swing-wing fighter with R-23/R-60; Syria, Ethiopia, Libya, Sudan.', { cm: 0.5 }),
  d('mig27', 'MiG-27K Flogger', U.Strike, 'RUS', 1975, 1.0, 'Ground-attack version of MiG-23, 6 t bombload.', { cm: 0.5 }),
  d('mig25', 'MiG-25PDS Foxbat', U.Fighter, 'RUS', 1970, 1.2, 'Mach 2.8 interceptor; Syria, Algeria and Iraq legacy.', { sp: 2500, cm: 0.6, a: 62, rk: 1000 }),
  d('mig29', 'MiG-29A/UB Fulcrum', U.Fighter, 'RUS', 1983, 1.7, 'Soviet lightweight air-superiority fighter; R-73/R-27; exported to 25+ countries.', { cm: 0.7 }),
  d('mig29smt', 'MiG-29SMT/UPG', U.Multirole, 'RUS', 2008, 2.2, 'Upgraded Fulcrum with multi-role radar, extended range and Kh-31/Kh-29 capability; Algeria, Sudan, Myanmar, Belarus.'),
  d('mig29m', 'MiG-29M/M2', U.Multirole, 'RUS', 2016, 2.9, 'Advanced Fulcrum with fly-by-wire, Zhuk-ME AESA and R-77; Egypt bought 46.', { st: 0.15 }),
  d('mig31bm', 'MiG-31BM Foxhound', U.Fighter, 'RUS', 2008, 2.4, 'Long-range Mach 2.8 interceptor with Zaslon-M radar and R-33/R-37M missiles (300 km).', { sp: 2500, rk: 1400, a: 82, st: 0.05 }),
  d('mig31k', 'MiG-31K (Kinzhal carrier)', U.Strike, 'RUS', 2018, 3.0, 'MiG-31 carrying one Kh-47M2 Kinzhal air-launched hypersonic missile (2,000 km); strikes strategic ground and naval targets.', { sp: 2500, rk: 1500, s: 84, h: 84, n: 80, cm: 1.5, x: false, st: 0.05 }),
  d('su22', 'Su-22M4 Fitter', U.Strike, 'RUS', 1978, 1.1, 'Export swing-wing fighter-bomber; Syria, Yemen, Libya, Angola.', { cm: 0.5 }),
  d('su24m', 'Su-24M Fencer', U.Strike, 'RUS', 1975, 1.7, 'Swing-wing all-weather strike aircraft, 8 t bombload.'),
  d('su25', 'Su-25K Frogfoot', U.Strike, 'RUS', 1981, 1.5, 'Armoured CAS jet; exported to 20+ countries (Ethiopia, Sudan, Angola, Chad, Iraq).', { cm: 0.6, sp: 800, s: 62 }),
  d('su25sm3', 'Su-25SM3', U.Strike, 'RUS', 2013, 2.2, 'Modernised Su-25 with SOLT-25 EO pod, Vitebsk-25 self-protection and Kh-31 capability.', { sp: 850 }),
  d('su27', 'Su-27S/UB Flanker', U.Fighter, 'RUS', 1985, 1.8, 'Heavy twin-engine air-superiority fighter, R-27/R-73; Belarus, Kazakhstan, Uzbekistan, Ethiopia, Eritrea.', { cm: 0.75 }),
  d('su27sm', 'Su-27SM/SM3', U.Fighter, 'RUS', 2004, 2.6, 'Upgraded Flanker with digital systems, R-77 and Kh-31.'),
  d('su30sm2', 'Su-30SM2', U.Multirole, 'RUS', 2012, 3.0, 'Two-seat multirole Flanker with thrust vectoring, Byelka AESA (SM2), R-77-1 and Kh-31/Kh-59M; Belarus, Kazakhstan, Armenia.'),
  d('su34', 'Su-34 Fullback', U.Strike, 'RUS', 2014, 3.0, 'Twin-engine tandem-seat strike bomber, 8 t bombload, Kh-59/Kh-38/Kh-31, range 4,000 km.', { rk: 1400, s: 80, h: 82 }),
  d('su35s', 'Su-35S Flanker-E', U.Fighter, 'RUS', 2014, 3.3, 'Super-manoeuvrable 4++ gen fighter, Irbis-E PESA radar, 117S thrust vectoring engines, R-77-1.', { rk: 1400 }),
  d('su57', 'Su-57 Felon', U.Fighter, 'RUS', 2020, 3.8, 'Fifth-generation stealth fighter, N036 AESA, internal bays, supercruise; Izdeliye 30 engines entering service.', { st: 0.45, x: true, cm: 1.05 }),
  d('yak130', 'Yak-130 Mitten', U.Strike, 'RUS', 2009, 1.9, 'Advanced trainer/light attack jet exported to Algeria, Belarus, Bangladesh, Myanmar.', { cm: 0.45, s: 44, h: 40, rk: 600 }),
  d('tu22m3', 'Tu-22M3/M3M Backfire', U.Bomber, 'RUS', 1983, 2.0, 'Supersonic swing-wing bomber, Kh-22/Kh-32, range 2,400 km combat.', { sp: 1000, rk: 5500, n: 82 }),
  d('tu95ms', 'Tu-95MSM Bear-H', U.Bomber, 'RUS', 1983, 2.2, 'Turboprop strategic missile carrier with Kh-101/Kh-555 cruise missiles; 14,000 km range.', { rk: 8000, sp: 830 }),
  d('tu160m', 'Tu-160M Blackjack', U.Bomber, 'RUS', 2022, 3.2, 'Modernised supersonic variable-geometry strategic bomber, 12 Kh-101/102, Mach 2, 12,000 km.', { sp: 2000, rk: 10500, st: 0.2, x: false }),
  d('an12', 'An-12 Cub', U.AirTransport, 'RUS', 1959, 0.7, 'Soviet turboprop transport, 20 t; still used in Africa and Asia.', { cm: 0.4 }),
  d('an26', 'An-26 Curl', U.AirTransport, 'RUS', 1969, 0.6, 'Twin-turboprop tactical transport, 5.5 t; used by dozens of African air forces.', { cm: 0.3, rk: 1300 }),
  d('an32', 'An-32 Cline', U.AirTransport, 'RUS', 1976, 0.8, 'Twin-turboprop STOL transport, 6.7 t.', { cm: 0.3, rk: 1400 }),
  d('il76md', 'Il-76MD/TD', U.AirTransport, 'RUS', 1974, 1.6, 'Four-jet heavy transport, 47 t payload; Russia, Iran, Algeria, Kazakhstan, Uzbekistan.', { cm: 0.8 }),
  d('il76md90a', 'Il-76MD-90A', U.AirTransport, 'RUS', 2012, 3.0, 'Modernised Il-76 with PS-90A-76 engines and glass cockpit; 52 t payload.'),
  d('an124_ruslan', 'An-124-100 Ruslan', U.AirTransport, 'RUS', 1986, 3.6, 'Super-heavy strategic airlifter, 120 t payload, 4,500 km with max load.', { rk: 4800, sp: 800 }),
  d('mi24p', 'Mi-24P/V Hind', U.Helicopter, 'RUS', 1972, 1.4, 'Heavily armed attack/assault helicopter with 12.7 mm/30 mm gun, rockets, AT-6; exported to 50 countries.', { cm: 0.6 }),
  d('mi35m', 'Mi-35M', U.Helicopter, 'RUS', 2005, 2.5, 'Modernised Hind with glass cockpit, thermal sights and Ataka ATGM; Iraq, Egypt, Nigeria, Uzbekistan, Kazakhstan.'),
  d('mi8t', 'Mi-8T/Mi-17 Hip', U.Helicopter, 'RUS', 1967, 1.0, 'Transport helicopter with rocket pods and door guns; the most widespread Soviet helicopter, 24 troops.', { cm: 0.45, s: 34, h: 24, dg: 22 }),
  d('mi17v5', 'Mi-17V-5', U.Helicopter, 'RUS', 2005, 2.2, 'Export Mi-8 with upgraded engines, avionics and weapons; used in 40+ countries.', { s: 40, h: 30, cm: 0.8 }),
  d('mi8amtsh', 'Mi-8AMTSh Terminator', U.Helicopter, 'RUS', 2008, 2.7, 'Assault/gunship Mi-8 with Ataka ATGM, rocket pods and 12.7 mm gun; 20 troops.', { s: 50, h: 40 }),
  d('mi28nm', 'Mi-28NM Havoc', U.Helicopter, 'RUS', 2019, 3.3, 'All-weather attack helicopter with radar, Vikhr/Ataka and dual controls; Iraq and Russia use.'),
  d('ka52m', 'Ka-52M Alligator', U.Helicopter, 'RUS', 2020, 3.3, 'Coaxial-rotor attack helicopter with AESA radar, Vikhr-M/Izdeliye-305 missiles; Egypt and Russia use.'),
  d('mi26', 'Mi-26 Halo', U.AirTransport, 'RUS', 1983, 1.8, 'World\'s biggest helicopter, 20 t payload; Russia, Ethiopia, Algeria, Peru.', { sp: 260, rk: 800 }),
  d('orion_uav', 'Kronshtadt Orion (Inokhodets)', U.Drone, 'RUS', 2020, 2.6, 'MALE UCAV, 1,200 kg, 24 h endurance, 200 kg munitions.', { rk: 1500 }),
  d('forpost_r', 'Forpost-R', U.Drone, 'RUS', 2019, 2.4, 'Russian licence-built Israeli Searcher II with domestic upgrades; ISR and light strike.', { s: 24, h: 24 }),
  d('orlan10', 'Orlan-10 Recon UAV', U.Drone, 'RUS', 2012, 2.0, 'Small tactical recon drone, 16 h endurance, used for artillery spotting and EW.', { s: 6, h: 6, n: 0, cm: 0.2, spot: 6, sp: 150, rk: 600, dg: 6, da: 6, dn: 6 }),
  d('lancet3', 'ZALA Lancet-3', U.Drone, 'RUS', 2021, 2.7, 'Loitering munition with 3-5 kg warhead, 40 km range, lethal vs armour and air defences.', { sp: 110, rk: 600, s: 34, h: 52, cm: 0.15, up: 0.3 }),
  d('geran2', 'Geran-2 (Shahed-136)', U.Drone, 'RUS', 2022, 2.3, 'Russian-produced Shahed-136 long-range one-way attack drone, 50 kg warhead, 2,000 km range; mass-fired in swarms.', { sp: 185, rk: 1800, s: 44, h: 36, n: 20, st: 0.3, cm: 0.12, up: 0.25 }),
  d('kub_bla', 'ZALA KUB-BLA', U.Drone, 'RUS', 2015, 2.0, 'Small loitering munition, 3 kg warhead.', { sp: 130, rk: 400, cm: 0.1, up: 0.2 }),
  // ---- RUSSIA NAVAL
  d('admiral_kuznetsov', 'Admiral Kuznetsov (Project 1143.5)', U.Carrier, 'RUS', 1990, 1.9, 'Only Russian aircraft carrier, 58,500 t, STOBAR with Su-33/MiG-29K, 12 Granit missiles; long refit.', { x: false, a: 22, n: 20, sb: 12, c: 5200, up: 7, bd: 1300 }),
  d('kirov_class', 'Kirov-class (Project 1144) Pyotr Velikiy/Admiral Nakhimov', U.Cruiser, 'RUS', 1980, 2.5, 'Nuclear-powered 24,300 t battlecruisers; 20 P-700 Granit, S-300F, Kalibr/Zircon after modernisation.', { x: false, n: 92, rn: 6, ra: 4 }),
  d('slava_class', 'Slava-class (Project 1164) Moskva/Marshal Ustinov', U.Cruiser, 'RUS', 1982, 2.0, '11,300 t guided-missile cruiser, 16 P-1000 Vulkan, S-300F; remaining ships modernised.', { x: false, n: 88 }),
  d('udaloy_class', 'Udaloy I/II (Project 1155)', U.Destroyer, 'RUS', 1981, 2.3, '8,500 t ASW destroyer; Kashtan CIWS, Kalibr/URK-5 upgrades on Admiral Chabanenko.', { x: false }),
  d('sovremenny_class', 'Sovremenny (Project 956)', U.Destroyer, 'RUS', 1980, 1.9, '7,900 t anti-ship destroyer with Moskit (SS-N-22 Sunburn), exported to China.', { n: 68, sb: 30 }),
  d('admiral_gorshkov', 'Admiral Gorshkov (Project 22350)', U.Frigate, 'RUS', 2018, 3.5, '5,400 t multi-role frigate: 32 UKSK (Kalibr/Oniks/Zircon), Poliment-Redut SAM, Paket ASW.', { cm: 1.15, x: false }),
  d('admiral_grigorovich', 'Admiral Grigorovich (Project 11356)', U.Frigate, 'RUS', 2016, 2.8, '3,620 t Talwar-derived frigate with Kalibr VLS and Shtil-1 SAM.', { cm: 0.95 }),
  d('neustrashimy_class', 'Neustrashimy (Project 1154)', U.Frigate, 'RUS', 1993, 2.4, '4,400 t ASW frigate, Kashtan CIWS.', { cm: 0.9 }),
  d('steregushchiy_class', 'Steregushchiy (Project 20380/20385)', U.Frigate, 'RUS', 2008, 2.9, '2,200 t stealth corvette-frigate with Uran/Kalibr, Redut SAM on 20385.', { cm: 0.7 }),
  d('gremyashchiy_20385', 'Gremyashchiy (Project 20385)', U.Frigate, 'RUS', 2019, 3.0, 'Improved Steregushchiy with 8-cell UKSK VLS.', { cm: 0.75 }),
  d('bykov_22160', 'Vasily Bykov (Project 22160)', U.PatrolBoat, 'RUS', 2018, 2.3, '1,300 t patrol ship with helicopter and modular payload.', { cm: 1.1 }),
  d('buyan_m', 'Buyan-M (Project 21631)', U.PatrolBoat, 'RUS', 2015, 3.2, '950 t small missile ship with 8 Kalibr/Oniks cruise missiles; river-sea capable.', { cm: 1.2 }),
  d('karakurt_class', 'Karakurt (Project 22800)', U.PatrolBoat, 'RUS', 2018, 3.0, '870 t missile corvette with Kalibr VLS and Pantsir-M.', { cm: 1.0 }),
  d('molniya_1241', 'Molniya/Tarantul (Project 1241)', U.PatrolBoat, 'RUS', 1979, 1.6, '450 t fast attack missile craft with 4 P-15/Moskit; widely exported.', { cm: 0.7, n: 40 }),
  d('osa_class', 'Osa-II (Project 205)', U.PatrolBoat, 'RUS', 1960, 0.9, '210 t missile boat with 4 P-15 Termit; still used by Egypt, Syria, Yemen, Angola.', { cm: 0.4 }),
  d('zhuk_1400', 'Zhuk (Project 1400M) patrol boat', U.PatrolBoat, 'RUS', 1975, 0.7, '40 t coastal patrol boat, 14.5 mm guns; Africa & Asia navies.', { cm: 0.15, n: 12 }),
  d('project_636_kilo', 'Improved Kilo (Project 636.3 Varshavyanka)', U.Submarine, 'RUS', 2014, 2.9, '3,100 t AIP-less diesel-electric, 6 Kalibr/torpedo tubes; Algeria, Vietnam, China, Russia.', { cm: 0.75 }),
  d('project_877_kilo', 'Kilo (Project 877EKM)', U.Submarine, 'RUS', 1982, 2.0, 'Original Kilo, 3,000 t; Iran (Tareq), Algeria, India, China.', { cm: 0.65 }),
  d('lada_677', 'Lada (Project 677)', U.Submarine, 'RUS', 2021, 3.0, '1,765 t AIP-capable diesel-electric, quiet; Saint Petersburg in service.', { cm: 0.8, st: 0.8 }),
  d('akula_971', 'Akula (Project 971)', U.Submarine, 'RUS', 1984, 2.6, '12,770 t nuclear attack submarine; Kalibr-capable variants.', { x: false, cm: 1.0 }),
  d('oscar_949a', 'Oscar-II (Project 949A Antey)', U.Submarine, 'RUS', 1986, 2.5, '24,000 t SSGN with 24 P-700 Granit/Oniks; modernised with Kalibr.', { x: false, n: 88 }),
  d('delta_iv', 'Delta-IV (Project 667BDRM)', U.Submarine, 'RUS', 1985, 2.3, 'SSBN with 16 R-29RMU Sineva SLBMs; aging, being replaced.', { x: false, cm: 1.3 }),
  d('borei_a', 'Borei-A (Project 955A)', U.Submarine, 'RUS', 2013, 3.6, '24,000 t SSBN with 16 RSM-56 Bulava SLBMs, quiet.', { x: false, cm: 1.5, n: 60 }),
  d('yasen_m', 'Yasen-M (Project 885M)', U.Submarine, 'RUS', 2021, 3.8, '13,800 t multipurpose nuclear submarine; 32 Kalibr/Oniks/Zircon, quiet, sonar bow array.', { x: false, cm: 1.15 }),
  d('ivan_gren', 'Ivan Gren (Project 11711)', U.Amphibious, 'RUS', 2018, 2.5, '5,000 t landing ship, 300 troops + 13 tanks and 2 helicopters.', { x: false, cm: 0.9 }),
  d('ropucha_775', 'Ropucha (Project 775) LST', U.Amphibious, 'RUS', 1975, 1.4, '4,000 t landing ship, 10 tanks + 225 troops.', { cm: 0.6 }),
  d('polnocny_770', 'Polnocny (Project 770) LSM', U.Amphibious, 'RUS', 1967, 0.7, 'Medium landing ship, 5 tanks; legacy in Syria, Yemen, Angola, Ethiopia.', { cm: 0.3, p: 250 }),
  // =====================================================================================
  // BELARUS / CAUCASUS / CENTRAL ASIA / MISC EX-SOVIET
  // =====================================================================================
  d('polonez_a200', 'A200 Polonez MRL', U.RocketArtillery, 'BLR', 2016, 3.0, 'Belarusian 301 mm 8-tube MLRS (Chinese A200 derived) on MZKT-7930, range 200 km; sold to Azerbaijan.', { rg: 4, x: true }),
  d('didgori_2', 'Didgori-2 Armoured Car', U.Recon, 'GEO', 2011, 1.8, 'Georgian 4x4 MRAP/recon vehicle by STC Delta, 12 t.', { cm: 0.6 }),
  d('l39c', 'Aero L-39C Albatros', U.Strike, 'CZE', 1972, 1.1, 'Czech jet trainer with light strike loads; used across Africa, Kazakhstan, Georgia, Syria, Libya.', { cm: 0.25, rk: 600, s: 34, h: 26, sp: 700 }),
  d('l39ng', 'Aero L-39NG Skyfox', U.Strike, 'CZE', 2019, 2.2, 'Modernised L-39 with FADEC and glass cockpit; light attack trainer.', { cm: 0.35, sp: 750, s: 40, h: 34 }),
  // =====================================================================================
  // ISRAEL
  // =====================================================================================
  d('merkava_mk3', 'Merkava Mk.3 Baz', U.Armor, 'ISR', 1990, 2.0, '65 t MBT, front-engine layout, 120 mm smoothbore, Baz FCS; upgraded with Kasag armour.', { cm: 0.85, x: false }),
  d('merkava_mk4', 'Merkava Mk.4 Barak/Mk.4M Windbreaker', U.Armor, 'ISR', 2004, 3.3, '65 t, 120 mm gun, Trophy APS (Mk.4M), modular armour, 1,500 hp; high crew survivability. Barak digital upgrade.', { cm: 1.1 }),
  d('namer', 'Namer APC', U.Mechanized, 'ISR', 2008, 3.4, '60 t heavy APC on Merkava chassis, Trophy APS, 9 troops; among the best-protected APCs.', { cm: 1.1 }),
  d('achzarit', 'Achzarit', U.Mechanized, 'ISR', 2008, 2.7, '44 t heavy APC converted from captured T-54/55 with heavy armour.', { cm: 0.8 }),
  d('eitan_apc', 'Eitan 8x8 APC', U.Mechanized, 'ISR', 2022, 3.2, '35 t wheeled 8x8 armoured personnel carrier with Trophy and Spike-ready RCWS; replacing M113.', { mo: 'wheeled', cm: 0.9 }),
  d('puma_engineers', 'Puma Combat Engineering Vehicle', U.Engineers, 'ISR', 2000, 2.8, 'Heavy CEV on Centurion/Merkava chassis with breaching tools.', { mo: 'tracked', ar: 'hard', cm: 1.1 }),
  d('tavor_infantry', 'IDF Infantry Battalion (Tavor)', U.Infantry, 'ISR', 2010, 3.3, 'Highly trained IDF infantry with Tavor rifles, Spike ATGM, drones and Blue-force tracking.', { cm: 1.1 }),
  d('spike_at_infantry', 'Spike Anti-Tank Infantry', U.Infantry, 'ISR', 2007, 3.1, 'Infantry battalion equipped with Spike-LR/ER/NLOS missiles (up to 25 km); very high anti-armour effect.', { h: 55, cm: 1.15, p: 500 }),
  d('sayeret_matkal', 'Sayeret Matkal / Shayetet-13 Group', U.SpecialForces, 'ISR', 1957, 3.8, 'Elite IDF special forces.', { cm: 1.2 }),
  d('atmos_2000', 'ATMOS 2000 155 mm SP Howitzer', U.Artillery, 'ISR', 2000, 3.0, 'Truck-mounted 155 mm/52 cal howitzer, range 41 km.', { mo: 'wheeled', ar: 'soft' }),
  d('m109_doher', 'M109 Doher SPH', U.Artillery, 'ISR', 1970, 1.9, 'Israeli-modernised M109 155 mm SP gun; standard IDF SPH.', { cm: 0.9 }),
  d('sholef_155', 'Sholef 155 mm SP Gun', U.Artillery, 'ISR', 2024, 3.5, 'Automated 155 mm/52 cal tracked SPH, 43 t, 8 rpm; production for IDF ongoing.', { cm: 1.1 }),
  d('lynx_lar160', 'LAR-160 / Lynx MLRS', U.RocketArtillery, 'ISR', 1990, 2.6, 'Truck launcher with 160/306 mm rockets (LAR-160 40 km, Extra 150 km).', { rg: 3, cm: 0.9 }),
  d('extra_gm', 'EXTRA Guided Rocket System', U.RocketArtillery, 'ISR', 2015, 3.4, 'Precision 306 mm GPS-guided rockets, 150 km; Azerbaijan and Israel.', { rg: 3, cm: 1.2 }),
  d('lora', 'LORA Long Range Artillery Rocket', U.MissileLauncher, 'ISR', 2005, 3.3, 'Quasi-ballistic precision missile, 400 km, 570 kg warhead; Israel, Azerbaijan, Slovakia.', { rg: 6 }),
  d('jericho_ii', 'Jericho II IRBM', U.MissileLauncher, 'ISR', 1990, 3.0, 'Solid-fuel IRBM, 1,500 km; road/rail-mobile.', { rg: 8, x: false, cm: 1.2 }),
  d('jericho_iii', 'Jericho III IRBM/ICBM', U.MissileLauncher, 'ISR', 2011, 3.7, 'Three-stage solid-fuel missile, 4,800-6,500 km; road-mobile with MIRV capability.', { rg: 10, x: false, cm: 1.6 }),
  d('iron_dome', 'Iron Dome (Tamir)', U.AirDefense, 'ISR', 2011, 3.4, 'Counter-rocket/artillery/mortar and UAV system, 4-70 km; 90% claimed intercept rate. 3 launchers, 20 Tamir each.', { ra: 2, a: 78, x: true, cm: 0.85 }),
  d('davids_sling', "David's Sling (Stunner)", U.AirDefense, 'ISR', 2017, 3.6, 'Medium-range interceptor 40-300 km against aircraft, cruise and tactical ballistic missiles.', { ra: 4, a: 86 }),
  d('arrow_2', 'Arrow 2 (Hetz)', U.AirDefense, 'ISR', 2000, 3.5, 'ABM interceptor with Green Pine radar, 100 km range; to be replaced by Arrow 3.', { ra: 4, a: 84, x: false }),
  d('arrow_3', 'Arrow 3 (Hetz 3)', U.AirDefense, 'ISR', 2017, 3.9, 'Exo-atmospheric hit-to-kill ballistic missile interceptor, 2,400 km threat range, above 100 km altitude; Israel, Germany.', { ra: 5, a: 92, cm: 1.15 }),
  d('barak_8', 'Barak-8 / MRSAM', U.AirDefense, 'ISR', 2015, 3.3, 'Medium-range SAM (70-150 km), vertical launch, AESA; land and naval versions; India, Azerbaijan, Morocco.', { ra: 3 }),
  d('spyder_mr', 'Spyder-MR', U.AirDefense, 'ISR', 2005, 2.9, 'Rafael/IAI Python-5/Derby SAM system, 50 km; Czech, Georgia, India, Azerbaijan.', { ra: 2 }),
  d('kfir_c7', 'IAI Kfir C.7/TC.7', U.Multirole, 'ISR', 1975, 1.5, 'Israeli-built Mirage V derivative with J79 engine; Colombia, Ecuador legacy.', { cm: 0.55 }),
  d('f15i_raam', 'F-15I Ra\'am Thunder', U.Strike, 'ISR', 1998, 3.2, 'Israeli-configured F-15E strike eagle, 25 in service; long-range strike incl. Iran contingency.', { a: 44, x: false }),
  d('f16i_sufa', 'F-16I Sufa (Storm)', U.Multirole, 'ISR', 2004, 3.0, 'Israeli F-16 Block 52+ with conformal tanks and Israeli EW and weapons; 100 built.', { x: false }),
  d('f35i', 'F-35I Adir', U.Multirole, 'ISR', 2017, 3.9, 'Israeli-customised F-35A with Israeli EW and internal bays; first foreign F-35 operator in combat; ~75 by 2030.', { st: 0.55, x: false, cm: 1.05 }),
  d('heron_tp', 'IAI Heron TP Eitan', U.Drone, 'ISR', 2010, 3.0, 'Large MALE UAV, 4.6 t, 36 h endurance, 1,000 kg payload, ISR/strike.', { rk: 2500, s: 40, h: 40 }),
  d('heron_1', 'IAI Heron-1', U.Drone, 'ISR', 2005, 2.3, 'MALE ISR UAV, 45 h; India, Germany, Azerbaijan, Turkey.', { s: 4, h: 4, rk: 1500 }),
  d('hermes_900', 'Elbit Hermes 900 Kochav', U.Drone, 'ISR', 2015, 2.8, '1.1 t MALE UAV, 30 h endurance, ISR and light strike.', { rk: 1500, s: 32, h: 32 }),
  d('hermes_450', 'Elbit Hermes 450 Zik', U.Drone, 'ISR', 2000, 2.1, 'Tactical UAV, 20 h, ISR/light attack.', { rk: 800, s: 18, h: 18 }),
  d('harop', 'IAI Harop', U.Drone, 'ISR', 2005, 2.8, 'Anti-radar/loitering munition, 23 kg warhead, 6 h endurance, 1,000 km range; India, Azerbaijan, Germany.', { sp: 200, s: 44, h: 50, cm: 0.2, rk: 1000, st: 0.4, up: 0.35 }),
  d('orbiter_3', 'Aeronautics Orbiter 3/4', U.Drone, 'ISR', 2010, 2.2, 'Small tactical UAV, 7 h.', { s: 4, h: 4, cm: 0.2, rk: 500, spot: 5 }),
  d('saar_6', 'Sa\'ar 6 Magen-class', U.Frigate, 'ISR', 2020, 3.4, '2,000 t corvette (TKMS MEKO A-100 design); Barak-8, Naval Iron Dome, Harpoon/Gabriel V; 4 ships.', { cm: 1.05, x: false, da: 72 }),
  d('saar_5', 'Sa\'ar 5 Eilat-class', U.Frigate, 'ISR', 1994, 2.8, '1,275 t corvette, Harpoon, Barak-1, Phalanx; 3 ships.', { cm: 0.85, x: false }),
  d('saar_45', 'Sa\'ar 4.5 Hetz-class', U.PatrolBoat, 'ISR', 1991, 2.5, '488 t missile boat, Harpoon, Gabriel, Barak.', { cm: 0.9 }),
  d('super_dvora_mk3', 'Super Dvora Mk III', U.PatrolBoat, 'ISR', 2005, 2.3, '54 t fast patrol boat; export success (Sri Lanka, Nigeria, Eritrea, Slovenia).', { cm: 0.6 }),
  d('shaldag_mk5', 'Shaldag Mk V', U.PatrolBoat, 'ISR', 2015, 2.6, '61 t fast patrol boat, exported to Azerbaijan, Nigeria, Kenya.', { cm: 0.7 }),
  d('dabur_class', 'Dabur-class', U.PatrolBoat, 'ISR', 1973, 1.0, '39 t coastal patrol boat.', { cm: 0.25 }),
  d('dolphin_ii', 'Dolphin II (Type 800)', U.Submarine, 'ISR', 2014, 3.2, '2,400 t AIP diesel-electric (TKMS-built), 6 tubes incl. 650 mm; rumored nuclear-capable missiles; 3 in service.', { x: false, cm: 1.1, st: 0.83 }),
  d('dolphin_1', 'Dolphin I (Type 800)', U.Submarine, 'ISR', 1999, 2.6, '1,900 t diesel-electric, 3 in service.', { x: false, cm: 0.9 }),
  // =====================================================================================
  // IRAN
  // =====================================================================================
  d('safir_74', 'Safir-74 / T-72Z', U.Armor, 'IRN', 1995, 1.0, 'Iranian upgrade of captured T-54/55 and T-72.', { cm: 0.6 }),
  d('zulfiqar_1', 'Zulfiqar-1/2', U.Armor, 'IRN', 1994, 1.6, 'Iranian domestic MBT, 44 t, M48/M60/T-72 derived, 125 mm gun.', { cm: 0.7 }),
  d('zulfiqar_3', 'Zulfiqar-3', U.Armor, 'IRN', 2010, 2.0, 'Zulfiqar-3 with composite and ERA, laser rangefinder.', { cm: 0.8 }),
  d('karrar', 'Karrar MBT', U.Armor, 'IRN', 2017, 2.4, 'Iran\'s most advanced tank; 125 mm gun, Kontakt-5-like ERA, 51 t; T-90-derived turret.', { cm: 0.8 }),
  d('boragh', 'Boraq APC', U.Mechanized, 'IRN', 1998, 1.5, 'Iranian tracked/wheeled APC with 12.7 mm.', { cm: 0.6 }),
  d('rakhsh', 'Rakhsh 4x4 MRAP', U.Mechanized, 'IRN', 2010, 1.7, 'Iranian 4x4 armoured carrier.', { mo: 'wheeled', cm: 0.5 }),
  d('irgc_ground_force', 'IRGC Ground Forces Battalion', U.Infantry, 'IRN', 1980, 2.0, 'Committed revolutionary guard infantry with ATGM (Toophan/Dehlavieh), drones and rockets.', { cm: 0.8 }),
  d('basij_militia', 'Basij Militia Battalion', U.Infantry, 'IRN', 1980, 0.7, 'Volunteer paramilitary infantry; mass-mobilised.', { cm: 0.35, dg: 40 }),
  d('quds_force_sof', 'IRGC Quds Force / Saberin Group', U.SpecialForces, 'IRN', 1990, 2.6, 'Irregular warfare and expeditionary special forces.', { cm: 0.8 }),
  d('hm41', 'HM41 155 mm Howitzer', U.Artillery, 'IRN', 1990, 1.0, 'Iranian copy of Chinese-Austrian GHN-45 towed howitzer.', { cm: 0.55 }),
  d('raad_1', 'Raad-1 155 mm SPH', U.Artillery, 'IRN', 2005, 1.8, 'Tracked SP howitzer derived from M109; 30 km.', { cm: 0.75 }),
  d('fajr_5', 'Fajr-5 333 mm MRL', U.RocketArtillery, 'IRN', 1997, 1.6, '4-rail 333 mm rocket, 75 km; supplied to Hezbollah, Hamas.', { rg: 3, cm: 0.6 }),
  d('zelzal_2', 'Zelzal-2 / Fateh-110 rocket', U.RocketArtillery, 'IRN', 1990, 2.0, 'Heavy unguided rocket 210 km range, 600 kg warhead.', { rg: 4, cm: 0.7 }),
  d('fateh_110', 'Fateh-110/313', U.MissileLauncher, 'IRN', 2002, 2.6, 'Solid-fuel SRBM, 300-500 km, 500 kg warhead, GPS/INS guided.', { rg: 6, cm: 0.75 }),
  d('zolfaghar_srbm', 'Zolfaghar SRBM', U.MissileLauncher, 'IRN', 2016, 2.8, 'Fateh derivative, 700 km, 450 kg warhead; used in strikes on Syria and Iraq.', { rg: 7, cm: 0.8 }),
  d('shahab_3', 'Shahab-3 / Ghadr-1', U.MissileLauncher, 'IRN', 2003, 2.4, 'Liquid-fuel MRBM, 1,300-2,000 km, 750 kg warhead.', { rg: 9, cm: 0.9, x: false }),
  d('khorramshahr', 'Khorramshahr-4', U.MissileLauncher, 'IRN', 2019, 3.0, 'MRBM based on Musudan, 2,000 km, 1,500 kg MaRV warhead.', { rg: 9, cm: 1.0, x: false }),
  d('sejjil', 'Sejjil-2', U.MissileLauncher, 'IRN', 2009, 2.9, 'Two-stage solid-fuel MRBM, 2,000 km.', { rg: 9, cm: 1.0, x: false }),
  d('kheibar_shekan', 'Kheibar Shekan', U.MissileLauncher, 'IRN', 2022, 3.2, 'Solid-fuel MRBM, 1,450 km, manoeuvring warhead.', { rg: 9, cm: 1.05, x: false }),
  d('khalij_fars_asbm', 'Khalij Fars / Hormuz anti-ship BM', U.MissileLauncher, 'IRN', 2011, 2.6, 'Anti-ship ballistic missile, 300 km, terminal EO seeker; plus Noor/Ghader/Qader cruise missiles.', { rg: 4, rn: 6, n: 80, s: 50, h: 50, cm: 0.7 }),
  d('emad_ghadr', 'Emad / Qassem Basir', U.MissileLauncher, 'IRN', 2015, 3.0, 'Precision MRBM with manoeuvrable reentry vehicle, 1,700 km.', { rg: 9, cm: 1.0, x: false }),
  d('haj_qassem', 'Haj Qasem SRBM', U.MissileLauncher, 'IRN', 2020, 3.1, 'Solid fuel, 1,400 km, MaRV warhead.', { rg: 9, cm: 1.05, x: false }),
  d('bavar_373', 'Bavar-373', U.AirDefense, 'IRN', 2019, 3.3, 'Domestic long-range SAM ("S-300 equivalent"), 200 km, phased-array radar, 3 launchers.', { ra: 4, x: false, cm: 0.85 }),
  d('khordad_15', 'Khordad-15 (Talash)', U.AirDefense, 'IRN', 2019, 3.0, 'Long-range SAM with Sayyad-3 missile, 120 km range, AESA radar.', { ra: 3, cm: 0.75 }),
  d('khordad_3', 'Khordad-3 (Raad)', U.AirDefense, 'IRN', 2010, 2.4, 'Medium-range SAM (Buk-M2 derived), 50 km range; shot down RQ-4 in 2019.', { ra: 3, cm: 0.65 }),
  d('mersad', 'Mersad / Shahin Hawk SAM', U.AirDefense, 'IRN', 2010, 2.0, 'Iranian Hawk derivative, 45 km range.', { ra: 3, cm: 0.55 }),
  d('kowsar_fighter', 'HESA Kowsar', U.Fighter, 'IRN', 2018, 1.8, 'F-5F-derived single-seat light fighter with glass cockpit, 1,400 km/h.', { cm: 0.4, a: 52, sp: 1200 }),
  d('saeqeh', 'HESA Saeqeh', U.Multirole, 'IRN', 2006, 1.8, 'Twin-tail F-5E derivative resembling F/A-18 (Saeqeh-2 with new radar).', { cm: 0.5 }),
  d('azarakhsh', 'HESA Azarakhsh', U.Fighter, 'IRN', 1997, 1.3, 'F-5E reverse-engineered lightweight fighter.', { cm: 0.35, a: 48, sp: 1200 }),
  d('shahed_136', 'Shahed-136', U.Drone, 'IRN', 2021, 2.3, 'One-way attack drone, 2,000 km, 50 kg warhead, GPS navigation; built in thousands.', { sp: 185, rk: 2000, s: 44, h: 36, n: 20, st: 0.3, cm: 0.12, up: 0.25 }),
  d('shahed_129', 'Shahed-129', U.Drone, 'IRN', 2012, 2.4, 'MALE UCAV, 24 h endurance, 8 Sadid-1 missiles.', { rk: 1700 }),
  d('shahed_149', 'Shahed-149 Gaza', U.Drone, 'IRN', 2021, 2.9, 'Heavy UCAV with 500 kg payload, 35 h endurance.', { rk: 2500 }),
  d('mohajer_6', 'Mohajer-6', U.Drone, 'IRN', 2018, 2.3, 'Tactical UCAV, 12 h, 4 Qaem missiles; exported to Ethiopia, Sudan, Venezuela.', { rk: 700 }),
  d('ababil_3', 'Ababil-3', U.Drone, 'IRN', 2008, 2.0, 'Tactical UAV, 7 h.', { s: 12, h: 12, rk: 300 }),
  d('karrar_ucav', 'Karrar UCAV', U.Drone, 'IRN', 2010, 2.2, 'Jet-powered target drone / suicide UCAV, 1,000 km.', { sp: 800, rk: 1000, cm: 0.3, s: 36, h: 36 }),
  d('arash_2', 'Arash-2 loitering drone', U.Drone, 'IRN', 2019, 2.3, 'Long-range loitering munition, 2,000 km, 260 kg warhead.', { sp: 200, rk: 2000, s: 52, h: 50, cm: 0.15, up: 0.3 }),
  d('toufan_ah1', 'Toufan (AH-1J) attack helicopter', U.Helicopter, 'IRN', 1995, 1.6, 'Iranian-upgraded AH-1J Cobra with Iranian ATGMs; ~50 aircraft.', { cm: 0.6 }),
  d('moudge', 'Moudge (Jamaran) class', U.Frigate, 'IRN', 2010, 2.4, '1,500 t domestic frigate with C-802/Noor, Sayyad-2 SAM; several built.', { cm: 0.75, x: false }),
  d('alvand', 'Alvand (Vosper Mk5)', U.Frigate, 'IRN', 1971, 1.2, '1,100 t British-built frigate, 2 in Iranian service; obsolescent.', { cm: 0.55, x: false }),
  d('bayandor', 'Bayandor-class corvette', U.Frigate, 'IRN', 1963, 1.1, '900 t US-built patrol corvette; ASW, obsolescent.', { cm: 0.4, x: false }),
  d('makran_ship', 'IRIS Makran forward base ship', U.Amphibious, 'IRN', 2021, 1.4, 'Converted tanker, 121,000 t; carries helicopters and small boats for distant ops.', { x: false, cm: 0.8 }),
  d('shahid_bagheri', 'IRIS Shahid Bagheri drone carrier', U.Carrier, 'IRN', 2025, 0.4, 'Converted container ship, 240 m flight deck for UAVs, helicopters and small boats.', { x: false, c: 2500, ar: 'naval', dg: 40, da: 35, dn: 40, a: 8, n: 12, sb: 6, up: 3.5, p: 1500, sp: 40 }),
  d('sina_class', 'Sina-class missile boat', U.PatrolBoat, 'IRN', 2003, 2.3, '275 t catamaran fast attack, 4 C-802 missiles.', { cm: 0.7 }),
  d('peykaap_ii', 'Peykaap/IRGCN Fast Attack Craft', U.PatrolBoat, 'IRN', 1995, 1.7, 'Small missile/torpedo boats operated in swarms by IRGC Navy.', { cm: 0.3, n: 30 }),
  d('zolfaghar_boat', 'Zolfaghar/Seraj IRGCN Speedboat Flotilla', U.PatrolBoat, 'IRN', 2005, 1.4, 'Swarming fast attack craft with rockets and ASCM; Persian Gulf asymmetric doctrine.', { cm: 0.2, n: 26 }),
  d('ghadir_sub', 'Ghadir-class midget submarine', U.Submarine, 'IRN', 2007, 1.2, '120 t coastal midget sub with 2 533 mm torpedo tubes/mines; ~20 in service.', { x: false, cm: 0.12, st: 0.6, n: 50 }),
  d('fateh_sub', 'Fateh-class submarine', U.Submarine, 'IRN', 2019, 2.3, '600 t domestic diesel-electric with Jask-2 cruise missile capability.', { x: false, cm: 0.3, st: 0.65 }),
  // =====================================================================================
  // YEMEN (Houthi/legacy), GULF, JORDAN, EGYPT
  // =====================================================================================
  d('burkan_2h', 'Burkan-2H SRBM', U.MissileLauncher, 'YEM', 2017, 2.2, 'Houthi Scud derivative, 800 km range.', { rg: 7, cm: 0.5, x: false }),
  d('samad_3', 'Samad-3 UAV', U.Drone, 'YEM', 2018, 2.2, 'Houthi long-range attack UAV, 1,500+ km; Iran-derived.', { rk: 1700, cm: 0.15, s: 36, h: 32, sp: 200, up: 0.3 }),
  d('sakr_18', 'Sakr-18/36 122 mm MRL', U.RocketArtillery, 'EGY', 1970, 1.0, 'Egyptian licence BM-21 launcher; 122 mm.', { cm: 0.6 }),
  d('fahd_280', 'Fahd-280 APC', U.Mechanized, 'EGY', 1986, 0.9, 'Egyptian-Made Fahd 4x4 armoured personnel carrier.', { mo: 'wheeled', cm: 0.4 }),
  d('walid_apc', 'Walid APC', U.Mechanized, 'EGY', 1965, 0.6, 'Egyptian 4x4 APC.', { mo: 'wheeled', cm: 0.3 }),
  d('sakr_eye', 'Sakr Eye SHORAD', U.AirDefense, 'EGY', 2008, 2.0, 'Egyptian-made short-range air defence using Igla-derived missiles on 4x4.', { ra: 1, cm: 0.5 }),
  d('ramses_ii_t54', 'Ramses II (T-54/55 upgrade)', U.Armor, 'EGY', 1990, 1.1, 'T-54/55 upgraded with 125 mm-class fire control and composite armour.', { cm: 0.6 }),
  d('m1a1_egyptian', 'M1A1 Abrams (Egyptian co-production)', U.Armor, 'EGY', 1992, 2.9, 'Abrams co-produced at Factory 200, Egypt; 1,360 built, ~1,100 in service.', { cm: 0.95 }),
  d('tawazun_nimr', 'NIMR Ajban/Hafeet 4x4', U.Recon, 'ARE', 2007, 2.4, 'UAE armoured vehicle family produced by Nimr Automotive (EDGE).', { cm: 0.85 }),
  d('ghannatha', 'Ghannatha 8x8', U.Mechanized, 'ARE', 2020, 2.9, 'UAE 8x8 IFV/APC built by EDGE, 30 mm cannon.', { mo: 'wheeled', cm: 0.9 }),
  d('baynunah', 'Baynunah-class corvette', U.Frigate, 'ARE', 2011, 2.6, '830 t UAE-built corvette with RAM/ESSM and Exocet; 6 ships.', { cm: 0.6, x: true }),
  d('falaj_3', 'Ghannatha/Falaj-3 OPV', U.PatrolBoat, 'ARE', 2018, 2.5, 'UAE-built fast patrol vessels.', { cm: 0.8 }),
  d('yabhon_united_40', 'Yabhon United 40 UCAV', U.Drone, 'ARE', 2013, 2.4, 'UAE MALE UCAV.', { rk: 1500 }),
  d('khareef_class', 'Khareef-class corvette', U.Frigate, 'GBR', 2014, 2.6, '2,660 t Omani corvette (BAE), Exocet MM40, VL MICA.', { cm: 0.8, x: true }),
  // =====================================================================================
  // SOUTH AFRICA
  // =====================================================================================
  d('olifant_mk2', 'Olifant Mk.2', U.Armor, 'ZAF', 1976, 1.7, 'South African upgrade of Centurion, 58 t, 105 mm; Mk.2 with V12 engine.', { cm: 0.8 }),
  d('rooikat_76', 'Rooikat 8x8 Armoured Car', U.Recon, 'ZAF', 1989, 2.3, '28 t 8x8 with 76 mm gun; hunter-killer recon.', { h: 36, cm: 0.9 }),
  d('ratel_90', 'Ratel-90/ZT3', U.Mechanized, 'ZAF', 1976, 1.6, 'South African 6x6 IFV, 19 t, 90 mm or 20 mm gun; 1,200 built.', { mo: 'wheeled', cm: 0.6 }),
  d('casspir', 'Casspir MRAP', U.Mechanized, 'ZAF', 1980, 1.2, 'Mine-protected 4x4 pioneered in the border war; exported to 20+ countries.', { mo: 'wheeled', cm: 0.4 }),
  d('mamba_apc', 'Mamba Mk3 APC', U.Mechanized, 'ZAF', 1995, 1.5, 'Mine-protected 4x4 APC, exported to 30 countries.', { mo: 'wheeled', cm: 0.45 }),
  d('g5_howitzer', 'G5 155 mm Howitzer', U.Artillery, 'ZAF', 1982, 1.5, 'Towed 155 mm/45 cal gun-howitzer, range 39 km (BB); exported to Iraq, Iran, UAE.', { cm: 0.7 }),
  d('g6_rhino', 'G6 Rhino 155 mm SPH', U.Artillery, 'ZAF', 1988, 2.2, '47 t 6x6 self-propelled howitzer, 45 km; UAE, Oman, South Africa.', { mo: 'wheeled', cm: 0.85 }),
  d('valkiri_mk2', 'Valkiri Mk.2 127 mm MRL', U.RocketArtillery, 'ZAF', 1981, 1.5, 'South African 24-tube rocket launcher on Samil 100.', { cm: 0.6 }),
  d('umkhonto', 'Umkhonto-IR SAM', U.AirDefense, 'ZAF', 2006, 2.7, 'Denel Dynamics vertically launched SAM, 12-20 km; Finland, ZAF navy.', { ra: 2 }),
  d('rooivalk', 'Denel AH-2 Rooivalk', U.Helicopter, 'ZAF', 2011, 2.8, 'South African attack helicopter, 20 mm gun, ZT3 ATGM, Mistral; 12 built.', { cm: 0.85 }),
  d('seeker_400', 'Denel Seeker 400', U.Drone, 'ZAF', 2010, 2.3, 'Tactical UAV, 16 h.', { s: 8, h: 8, rk: 600, spot: 5 }),
  d('warrior_class', 'Warrior-class strike craft', U.PatrolBoat, 'ZAF', 1978, 1.4, '450 t Reshef-derived missile boats, Skerpioen; retired.', { cm: 0.5 }),
  // =====================================================================================
  // GENERIC AFRICAN / ASIAN THIRD-WORLD ORDER OF BATTLE
  // =====================================================================================
  d('toyota_technical', 'Technical Pickup Battalion', U.Mechanized, 'JPN', 1985, 0.7, 'Toyota Land Cruiser/Hilux pickups with ZU-23, DShK or ATGM; irregular mobile infantry.', { mo: 'wheeled', ar: 'soft', cm: 0.2, dg: 28 }),
  d('damen_stan_4207', 'Damen Stan Patrol 4207', U.PatrolBoat, 'NLD', 2008, 1.8, '42 m patrol vessel, 30 mm gun; small navies (Nigeria, Ghana, Cameroon, Iraq).', { cm: 0.35 }),
  d('c130h_hercules', 'C-130H Hercules', U.AirTransport, 'USA', 1965, 1.8, 'Four-turboprop tactical airlifter, 19 t; used by 20+ African air forces.', { cm: 0.7 }),
  d('super_tucano_a29', 'EMB-314 Super Tucano', U.Strike, 'BRA', 2003, 1.8, 'Turboprop light attack aircraft; Nigeria, Mali, Burkina Faso, Angola, Lebanon, Afghanistan.', { cm: 0.25, sp: 550, rk: 1000, s: 44, h: 32 }),
  d('bayraktar_tb2', 'Bayraktar TB2', U.Drone, 'TUR', 2016, 2.5, 'Turkish MALE armed UAV; widely exported.', { rk: 1500, s: 36, h: 36 }),
  d('wing_loong_2', 'Wing Loong II', U.Drone, 'CHN', 2017, 2.7, 'Chinese MALE UCAV; UAE, Saudi, Egypt, Nigeria.', { rk: 2000, s: 44, h: 44 }),
  d('s500', 'S-500 Prometey (55R6M Triumfator-M)', U.AirDefense, 'RUS', 2021, 4.1, 'Anti-ballistic/anti-satellite SAM, 600 km vs aircraft, BMs up to 200 km altitude; first units defend Moscow.', { ra: 5, x: false, cm: 1.2 }),
  d('koni_class', 'Koni-class (Project 1159) frigate', U.Frigate, 'RUS', 1978, 1.3, '1,900 t export frigate (Algeria, Cuba, Libya legacy); SS-N-2 Styx.', { cm: 0.5 }),
  d('western_line_infantry', 'Western-equipped Line Infantry Battalion', U.Infantry, 'USA', 1990, 2.2, 'Regular infantry with NATO-standard small arms, M2 machine guns, TOW/Javelin ATGMs; standard line battalion of Gulf, Moroccan and other Western-aligned armies.', { cm: 0.85 }),
  d('western_sof', 'Western-trained Special Forces Group', U.SpecialForces, 'USA', 2000, 2.9, 'US/UK/French-trained special operations groups.', { cm: 0.9 }),
  // =====================================================================================
  // FUTURE DESIGNS
  // =====================================================================================
  f('rus_t14_serial', 'T-14 Armata (full series)', U.Armor, 'RUS', 2031, 4.1, 't14_armata', 7500, 'Mass-produced Armata with 2A82-1M, Afghanit APS, active protection and AI-assisted FCS; 55 t.', { cm: 1.1, x: false }),
  f('rus_t15_serial', 'T-15 Barbarian IFV (series)', U.Mechanized, 'RUS', 2031, 4.0, 'kurganets25', 6500, 'Heavy tracked IFV on the Armata platform, 48 t, 30 mm cannon, Kornet, Afghanit APS.', { cm: 1.1, x: false }),
  f('rus_sotnik_infantry', 'Sotnik Ratnik-4 Infantry', U.Infantry, 'RUS', 2032, 3.7, 'ratnik_infantry', 4500, 'Exoskeleton-assisted infantry with networked C4 and drones.', { cm: 1.05 }),
  f('rus_s550', 'S-550 Triumf-D', U.AirDefense, 'RUS', 2030, 4.3, 's500', 9500, 'ABM/ASAT system with 77N6 hit-to-kill interceptors; range 600 km; replaces S-300V4.', { ra: 5, x: false }),
  f('rus_zircon_battery', 'Zircon Coastal Battery', U.MissileLauncher, 'RUS', 2030, 4.0, 'bastion_p', 6000, 'Mobile 3M22 Zircon hypersonic missile battery, Mach 9, 1,000 km range.', { rg: 8, rn: 8, x: false, cm: 1.2 }),
  f('rus_sarmat_battery', 'RS-28 Sarmat Silo Group', U.MissileLauncher, 'RUS', 2029, 4.5, 'rs26_oreshnik', 12000, 'Super-heavy ICBM, 18,000 km, 10-15 MIRV or Avangard glide vehicles.', { rg: 10, rn: 10, x: false, cm: 2.5, fu: 200 }),
  f('rus_su75_checkmate', 'Su-75 Checkmate', U.Multirole, 'RUS', 2032, 3.9, 'su57', 8000, 'Single-engine light stealth multirole fighter, AESA, internal bay, 7.4 t payload.', { st: 0.45, cm: 0.75, x: true }),
  f('rus_mig41', 'MiG-41 (PAK DP)', U.Fighter, 'RUS', 2033, 4.3, 'mig31bm', 11000, 'Long-range Mach 4 interceptor and hypersonic missile platform.', { sp: 4000, rk: 3000, st: 0.4, x: false }),
  f('rus_pak_da', 'PAK DA', U.Bomber, 'RUS', 2033, 4.1, 'tu160m', 12000, 'Subsonic flying-wing stealth strategic bomber, 30 t payload, range 15,000 km.', { st: 0.75, rk: 12000, x: false, cm: 1.0 }),
  f('rus_tu160m2', 'Tu-160M2', U.Bomber, 'RUS', 2028, 3.6, 'tu160m', 6500, 'Newly built Tu-160 with NK-32-02 engines and new avionics.', { st: 0.25, rk: 11500, sp: 2000, x: false }),
  f('rus_s70_okhotnik', 'S-70 Okhotnik-B', U.Drone, 'RUS', 2028, 3.6, 'su57', 5500, 'Stealth flying-wing heavy UCAV, 20 t, loyal wingman for Su-57, 6,000 km.', { st: 0.6, rk: 3500, sp: 800, cm: 1.2 }),
  f('rus_lider_destroyer', 'Lider (Project 23560E) destroyer', U.Destroyer, 'RUS', 2033, 4.3, 'admiral_gorshkov', 9000, 'Nuclear-powered 18,000 t destroyer, 60 VLS cells, Zircon, S-500 derivatives.', { x: false, cm: 1.4 }),
  f('rus_shtorm_carrier', 'Shtorm (Project 23000E) carrier', U.Carrier, 'RUS', 2038, 4.1, 'admiral_kuznetsov', 14000, 'Nuclear-powered 100,000 t supercarrier with EMALS and Su-57K/Okhotnik.', { x: false }),
  f('rus_husky_ssn', 'Husky/Laika (Project 545) SSN', U.Submarine, 'RUS', 2033, 4.0, 'yasen_m', 9500, 'Fifth-generation nuclear multi-role submarine, quieter than Yasen-M, Zircon and Kalibr.', { x: false, st: 0.9 }),
  f('isr_merkava_mk5', 'Merkava Mk.5 Barak', U.Armor, 'ISR', 2032, 4.0, 'merkava_mk4', 7000, 'Next-gen Israeli MBT, 3-man crew with AI, Trophy-2, 130 mm gun option, hybrid drive.', { cm: 1.15, x: false }),
  f('isr_carmel_ifv', 'Carmel Manned/Unmanned AFV', U.Mechanized, 'ISR', 2032, 3.9, 'namer', 5500, 'Future AFV with 2-man crew, unmanned turret, autonomous drones.', { cm: 1.05, x: false }),
  f('isr_iron_beam', 'Iron Beam laser', U.AirDefense, 'ISR', 2026, 4.0, 'iron_dome', 7000, 'High-power laser (100+ kW) against rockets, mortars and UAVs at cents per shot; operational 2025-27.', { ra: 2, a: 84, cm: 0.8 }),
  f('isr_arrow_4', 'Arrow 4', U.AirDefense, 'ISR', 2032, 4.4, 'arrow_3', 9500, 'Next-generation exo-atmospheric interceptor with hypersonic glide-vehicle capability.', { ra: 5, a: 95, x: false }),
  f('isr_sufa_gen6', 'Israeli 6th-gen partner fighter', U.Fighter, 'ISR', 2035, 4.2, 'f35i', 10000, 'Networked follow-on to F-35I; plausibly joint programme.', { x: false }),
  f('irn_shahed_238', 'Shahed-238', U.Drone, 'IRN', 2026, 3.0, 'shahed_136', 3500, 'Jet-powered Shahed with IR/radar seeker, 500+ km/h.', { sp: 500, rk: 1500, s: 46, h: 44, n: 24, cm: 0.2, up: 0.3 }),
  f('irn_qaher_313', 'Qaher-313 stealth fighter', U.Fighter, 'IRN', 2030, 2.8, 'kowsar_fighter', 4500, 'Indigenous "stealth" fighter concept; Iran claims low observability.', { st: 0.2, cm: 0.7 }),
  f('irn_fattah', 'Fattah hypersonic missile', U.MissileLauncher, 'IRN', 2028, 3.6, 'khorramshahr', 5500, 'Solid-fuel MaRV with hypersonic glide vehicle, 1,400+ km, Mach 13-15.', { rg: 9, cm: 1.2, x: false }),
  f('irn_bavar_373_ii', 'Bavar-373 (Block 2)', U.AirDefense, 'IRN', 2029, 3.7, 'bavar_373', 4000, 'Improved Bavar-373 with 300 km range and better seeker.', { ra: 4, x: false }),
  f('irn_fateh_sub_ii', 'Fateh-2 submarine', U.Submarine, 'IRN', 2031, 2.8, 'fateh_sub', 4500, 'Larger AIP-capable domestic submarine.', { x: false, cm: 0.45 }),
  f('are_edge_wingman', 'EDGE Loyal Wingman', U.Drone, 'ARE', 2030, 3.4, 'yabhon_united_40', 5000, 'UAE-developed loyal wingman drone.', { st: 0.4, sp: 800, cm: 1.0 }),
  f('sau_spa_drone', 'SAMI/SPA Local UCAV', U.Drone, 'SAU', 2030, 3.2, 'wing_loong_2', 4000, 'Saudi domestically built MALE UCAV.', { rk: 1800 }),
  f('egy_local_mbt', 'Egyptian Upgraded Abrams (M1A1 Plus)', U.Armor, 'EGY', 2030, 3.3, 'm1a1_egyptian', 4500, 'Egyptian-upgraded Abrams with APS and new FCS.', { cm: 1.0 }),
  f('egy_sakr_500', 'Sakr-500 Precision MRL', U.RocketArtillery, 'EGY', 2029, 2.5, 'sakr_18', 3000, 'Guided rocket 300 mm-class, 150 km.', { rg: 3 }),
  f('zaf_rooivalk_mk2', 'Rooivalk Mk.2', U.Helicopter, 'ZAF', 2031, 3.4, 'rooivalk', 4500, 'Fully upgraded attack helicopter with glass cockpit and Mokopa.', { cm: 0.9 }),
  f('zaf_rooikat_mk2', 'Rooikat Mk.2 105 mm', U.Recon, 'ZAF', 2031, 2.9, 'rooikat_76', 3000, 'Upgraded 105 mm armed vehicle.', { h: 44, cm: 0.95 }),
];

const own = (origin: string, minYear = 0): string[] =>
  DESIGNS.filter((x) => x.origin === origin && !x.future && x.year >= minYear).map((x) => x.id);
const inv = (code: string, produces: string, units: string): NationInventory => ({
  code,
  produces: produces.trim() ? produces.trim().split(/\s+/) : [],
  units: units.trim().split(/\s+/).map((u) => {
    const [id, c] = u.split(':');
    return { id, count: Number(c) };
  }),
});

export const INVENTORY: NationInventory[] = [
  // ------------------------------------------------------------------ RUSSIA
  {
    ...inv('RUS', '', `
      t72b3:22 t72b3m:14 t80bvm:14 t90m:8 t90a:6 t72m:10 t55:8 t14_armata:1
      bmp1:8 bmp2:30 bmp2m:8 bmp3:10 bmd4m:6 btr80:24 btr82a:20 mtlb:12 kurganets25:1 boomerang_k17:2
      brdm2:4 tigr_m:10 ratnik_infantry:45 vdv_airborne:18 naval_infantry_rus:8 spetsnaz_gru:8 imr3m:8 isdm_engineer:3
      2s19m2:20 2s3_akatsiya:10 2s5_giatsint:6 2s7_pion:3 2a65_msta_b:8 d30:18 2s31_vena:3 2s35_koalitsiya:2 2s1_gvozdika:6
      bm21_grad:8 tornado_g:6 bm27_uragan:6 bm30_smerch:4 tornado_s:4 tos1a:6
      iskander_m:14 tochka_u:3 bastion_p:5 bal_e:3 rs26_oreshnik:1
      s400:20 s300v4:10 s300pmu2:6 s500:1 buk_m3:8 buk_m2:8 buk_m1:4 tor_m2:8 tor_m1:4 pantsir_s1:16 tunguska_2k22:4 zsu23_4:4 strela10:2 osa_9k33:2
      su35s:8 su30sm2:8 su57:3 su27sm:6 su27:2 mig29smt:5 mig29:4 mig31bm:5 mig31k:2 su34:14 su24m:3 su25sm3:8 su25:2 yak130:3
      tu22m3:5 tu95ms:4 tu160m:2 il76md90a:5 il76md:6 an124_ruslan:2 an26:5 an12:2 mi26:4
      mi28nm:8 ka52m:10 mi35m:6 mi24p:6 mi8amtsh:12 mi17v5:12 mi8t:6
      orion_uav:3 forpost_r:3 orlan10:8 lancet3:6 geran2:10 kub_bla:2
      admiral_kuznetsov:1 kirov_class:2 slava_class:2 udaloy_class:6 sovremenny_class:3 admiral_gorshkov:4 admiral_grigorovich:3 neustrashimy_class:2
      steregushchiy_class:12 gremyashchiy_20385:2 bykov_22160:4 buyan_m:12 karakurt_class:10 molniya_1241:10 osa_class:4 zhuk_1400:6
      borei_a:6 delta_iv:5 yasen_m:6 akula_971:8 oscar_949a:6 project_636_kilo:8 project_877_kilo:4 lada_677:2
      ivan_gren:2 ropucha_775:12 polnocny_770:2
    `),
    produces: own('RUS', 1975).concat(['t62', 't55', 'bmp1', 'btr60', 'btr70', 'brdm2', 'd30', 'zsu23_4', 'zu23_2', 's125_pechora', 'mig21bis', 'an26', 'ak_light_infantry']),
  },
  inv('BLR', 'polonez_a200', 't72b3:6 t72m:8 bmp2:12 btr80:8 mtlb:6 ak_light_infantry:12 soviet_spetsnaz:3 bm21_grad:3 polonez_a200:3 bm27_uragan:1 bm30_smerch:1 2s3_akatsiya:4 2s5_giatsint:2 2s7_pion:2 2s19m2:2 d30:6 tochka_u:1 iskander_m:2 s300pmu2:4 s400_belarus:2 tor_m2:2 buk_m2:4 osa_9k33:2 tunguska_2k22:2 su30sm2:2 su25sm3:3 su25:1 mig29:2 mig29smt:1 yak130:1 l39c:1 an26:1 il76md:1 mi8amtsh:2 mi24p:2 mi35m:1 mi17v5:2 mi8t:2'),
  inv('GEO', 'didgori_2', 't72m:3 bmp1:4 bmp2:1 btr70:2 didgori_2:3 ak_light_infantry:14 soviet_spetsnaz:1 d30:2 bm21_grad:2 2s3_akatsiya:2 spyder_mr:1 s125_pechora:2 su25:1 l39c:1 mi8t:2 mi24p:1 mi17v5:1 orbiter_3:1 zhuk_1400:2'),
  inv('ARM', '', 't72b3:3 t72m:4 t55:1 bmp1:4 bmp2:3 btr70:2 btr80:1 ak_light_infantry:12 soviet_spetsnaz:1 d30:4 2s1_gvozdika:2 2s3_akatsiya:2 bm21_grad:3 bm30_smerch:1 tochka_u:1 iskander_m:1 s300pmu2:2 osa_9k33:2 strela10:2 buk_m1:1 tor_m2:1 s125_pechora:2 zsu23_4:2 su30sm2:1 su25:1 mi24p:1 mi17v5:1 orlan10:1'),
  inv('AZE', '', 't72m:8 t90s:4 bmp1:4 bmp2:4 btr80:3 mtlb:3 ak_light_infantry:16 soviet_spetsnaz:2 spike_at_infantry:2 d30:6 2s3_akatsiya:4 2s1_gvozdika:4 2s19m2:2 2s7_pion:2 2a65_msta_b:3 bm21_grad:4 bm30_smerch:3 tos1a:2 polonez_a200:2 extra_gm:2 lora:2 tochka_u:1 s300pmu2:2 barak_8:1 spyder_mr:2 buk_m1:2 s200:1 s125_pechora:2 osa_9k33:2 tunguska_2k22:1 zsu23_4:2 mig29:3 su25:3 jf17_block3:1 mi35m:3 mi17v5:4 mi8t:2 il76md:1 harop:2 orbiter_3:2 heron_1:2 hermes_900:2 bayraktar_tb2:3 molniya_1241:1 shaldag_mk5:3'),
  // ------------------------------------------------------------------ CENTRAL ASIA
  inv('KAZ', '', 't72b3:6 t72m:10 t55:6 bmp2:8 bmp1:4 btr80:8 btr82a:3 mtlb:4 ak_light_infantry:10 soviet_spetsnaz:3 d30:5 2s1_gvozdika:3 2s3_akatsiya:3 2s7_pion:1 bm21_grad:4 bm27_uragan:1 bm30_smerch:2 tornado_g:1 tochka_u:1 s300pmu2:3 s200:2 s125_pechora:2 tor_m2:1 buk_m2:1 osa_9k33:1 zsu23_4:2 su30sm2:2 su27:2 mig31bm:1 mig29:2 su25:2 mi35m:2 mi17v5:3 mi8t:2 mi24p:2 an26:2 il76md:1 orbiter_3:1 wing_loong_2:2 damen_stan_4207:2'),
  inv('UZB', '', 't72m:8 t62:3 t55:2 bmp2:5 bmp1:3 btr70:4 btr80:2 ak_light_infantry:12 soviet_spetsnaz:2 d30:3 2s3_akatsiya:2 2s1_gvozdika:2 bm21_grad:2 bm27_uragan:1 s125_pechora:2 s75:1 zsu23_4:2 strela10:1 su27:2 su24m:1 su25:2 mig29:2 mi35m:1 mi24p:2 mi17v5:2 mi8t:2 an26:2 il76md:1 wing_loong_2:1'),
  inv('TKM', '', 't72m:5 t90s:1 bmp2:3 btr80:3 btr70:2 ak_light_infantry:6 d30:2 2s3_akatsiya:1 bm21_grad:1 bm27_uragan:1 bm30_smerch:1 s125_pechora:2 s75:1 mig29:1 su25:1 mi24p:1 mi17v5:1 an26:1 damen_stan_4207:2'),
  inv('KGZ', '', 't72m:2 t55:1 bmp1:2 btr70:2 ak_light_infantry:6 soviet_spetsnaz:1 d30:2 bm21_grad:1 s125_pechora:1 zsu23_4:1 l39c:1 mi8t:1 mi24p:1 mi17v5:1 an26:1'),
  inv('TJK', '', 't72m:2 t55:1 bmp1:2 btr70:2 ak_light_infantry:6 d30:2 bm21_grad:1 s125_pechora:1 zsu23_4:1 mi8t:1 mi24p:1 mi17v5:1'),
  inv('AFG', '', 't55:3 t62:1 t72m:1 bmp1:2 btr70:2 toyota_technical:10 ak_light_infantry:30 soviet_spetsnaz:1 d30:4 bm21_grad:2 zu23_2:4 mi17v5:1 mi8t:2 mi24p:1 an26:1 uh60m_blackhawk:1'),
  // ------------------------------------------------------------------ LEVANT
  inv('SYR', '', 't55:3 t62:2 t72m:4 bmp1:4 btr70:3 mtlb:3 toyota_technical:10 ak_light_infantry:20 soviet_spetsnaz:1 d30:3 2s1_gvozdika:2 bm21_grad:3 scud_b:1 tochka_u:1 s125_pechora:2 s200:1 zsu23_4:3 zu23_2:3 su24m:1 mig29:1 mi8t:2 mi17v5:1 an26:1 bayraktar_tb2:1'),
  inv('LBN', '', 'm60a3_patton:4 t55:2 m113_apc:8 ak_light_infantry:16 m198_howitzer:3 d30:2 bm21_grad:1 zu23_2:3 mi17v5:2 uh1h_huey:1 super_tucano_a29:1 damen_stan_4207:3'),
  {
    ...inv('ISR', '', `
      merkava_mk4:12 merkava_mk3:6 namer:8 achzarit:6 eitan_apc:4 m113_apc:12 puma_engineers:4 tavor_infantry:30 spike_at_infantry:6 sayeret_matkal:4
      m109_doher:6 atmos_2000:3 lynx_lar160:4 extra_gm:2 lora:2 jericho_ii:2 jericho_iii:2
      iron_dome:10 davids_sling:2 arrow_2:3 arrow_3:3 barak_8:3 patriot_pac3:1
      f35i:6 f15i_raam:2 f15c:2 f16i_sufa:4 f16c:2 ah64e_apache:4 uh60m_blackhawk:4 ch53k_yasur:2 c130j_hercules:2
      heron_tp:2 hermes_900:3 heron_1:2 hermes_450:2 harop:2 orbiter_3:2
      saar_6:4 saar_5:3 saar_45:2 super_dvora_mk3:6 dabur_class:3 shaldag_mk5:3 dolphin_ii:5 dolphin_1:1
    `),
    produces: own('ISR').filter((i) => !['kfir_c7', 'dabur_class', 'saar_5', 'dolphin_1'].includes(i)),
  },
  inv('PSE', '', 'ak_light_infantry:14 toyota_technical:4 zu23_2:2'),
  inv('JOR', '', 'challenger_1:5 m60a3_patton:6 m113_apc:10 western_line_infantry:14 m109a6_paladin:4 m270_mlrs:1 bm21_grad:2 patriot_pac3:1 mim23_hawk:2 f16c:3 super_tucano_a29:1 ah1f_cobra:2 uh60m_blackhawk:1 c130h_hercules:1 damen_stan_4207:2'),
  inv('IRQ', 'ak_light_infantry', 'm1a1_abrams:6 t72m:8 t90s:2 bmp1:6 bmp2:3 m113_apc:6 ak_light_infantry:45 toyota_technical:6 soviet_spetsnaz:3 d30:4 2s1_gvozdika:4 2s3_akatsiya:2 g5_howitzer:2 bm21_grad:3 pantsir_s1:2 s125_pechora:2 zsu23_4:3 f16c:3 fa50:1 su25:2 mi28nm:3 mi35m:3 mi17v5:5 c130h_hercules:2 il76md:1 wing_loong_2:1 damen_stan_4207:3'),
  // ------------------------------------------------------------------ IRAN
  {
    ...inv('IRN', '', `
      karrar:4 zulfiqar_3:5 zulfiqar_1:4 safir_74:6 t72m:4 m60a1_patton:5 boragh:8 bmp2:6 bmp1:4 rakhsh:4
      irgc_ground_force:30 basij_militia:40 ak_light_infantry:25 quds_force_sof:3
      hm41:5 raad_1:4 d30:8 2s1_gvozdika:3 fajr_5:5 zelzal_2:3 bm21_grad:4
      fateh_110:6 zolfaghar_srbm:3 shahab_3:5 khorramshahr:3 sejjil:3 kheibar_shekan:2 emad_ghadr:2 haj_qassem:1 khalij_fars_asbm:3 scud_b:2
      s300pmu2:4 bavar_373:4 khordad_15:4 khordad_3:5 mersad:6 tor_m1:4 zsu23_4:5 zu23_2:8
      f14a:3 f4e_phantom:3 f5e_tiger:2 kowsar_fighter:2 saeqeh:1 azarakhsh:1 mig29:3 su24m:3 su22:1 su25:1 il76md:3 c130h_hercules:2
      toufan_ah1:3 mi17v5:3 mi8t:2
      shahed_136:8 shahed_129:3 shahed_149:3 mohajer_6:4 ababil_3:3 karrar_ucav:2 arash_2:3
      moudge:4 alvand:2 bayandor:1 sina_class:4 peykaap_ii:8 zolfaghar_boat:12 ghadir_sub:10 fateh_sub:1 project_877_kilo:3 makran_ship:1 shahid_bagheri:1
    `),
    produces: own('IRN').filter((i) => !['alvand', 'bayandor'].includes(i)),
  },
  // ------------------------------------------------------------------ GULF
  inv('SAU', '', 'm1a2_sepv3_abrams:12 m60a3_patton:3 m2_bradley:8 m113_apc:10 lav_25:6 western_line_infantry:40 western_sof:3 m109a6_paladin:8 caesar_155:4 himars:1 df_3a:2 patriot_pac3:12 thaad:2 mim23_hawk:4 f15sa:8 f15c:5 eurofighter_typhoon:6 tornado_ids:4 ah64e_apache:4 uh60m_blackhawk:3 ch47f:2 c130h_hercules:4 wing_loong_2:3 ch4_rainbow:2 al_riyadh_class:3 al_madinah_class:4 badr_class:4 damen_stan_4207:6'),
  inv('KWT', '', 'm1a2_sepv3_abrams:6 m113_apc:4 bmp3:3 western_line_infantry:8 western_sof:1 k9_thunder:2 m109a6_paladin:2 m270_mlrs:1 patriot_pac3:4 fa18e:2 fa18c:2 eurofighter_typhoon:2 ah64e_apache:2 c130j_hercules:1 damen_stan_4207:2'),
  inv('BHR', '', 'm60a3_patton:3 m113_apc:3 western_line_infantry:5 m109a6_paladin:1 himars:1 patriot_pac3:2 mim23_hawk:1 f16c:2 f16v:1 ah1z:1 uh60m_blackhawk:1 oliver_hazard_perry:1 damen_stan_4207:3'),
  inv('QAT', '', 'leopard_2a7:3 western_line_infantry:8 pzh2000:2 caesar_155:1 himars:1 patriot_pac3:3 nasams:2 f15e:3 rafale_f4:3 eurofighter_typhoon:3 ah64e_apache:2 c17_globemaster:1 c130j_hercules:1 bayraktar_tb2:1 al_zubarah_class:4 damen_stan_4207:3'),
  inv('ARE', 'tawazun_nimr ghannatha baynunah falaj_3 yabhon_united_40', 'leclerc:6 ghannatha:4 bmp3:4 tawazun_nimr:6 western_line_infantry:10 western_sof:2 g6_rhino:4 caesar_155:2 himars:1 bm30_smerch:1 pantsir_s1:5 patriot_pac3:6 thaad:2 mim23_hawk:2 f16v:6 mirage_2000_9:3 rafale_f4:4 ah64e_apache:3 uh60m_blackhawk:3 ch47f:2 c17_globemaster:1 c130j_hercules:2 yabhon_united_40:2 wing_loong_2:3 baynunah:6 gowind_2500:4 falaj_3:6'),
  inv('OMN', '', 'challenger_2:3 m60a3_patton:3 piranha_iii_lav:4 western_line_infantry:8 m109a6_paladin:1 nasams:1 f16c:3 eurofighter_typhoon:2 hawk_mk128:1 c130j_hercules:1 nh90:1 khareef_class:3 damen_stan_4207:3'),
  inv('YEM', 'burkan_2h samad_3', 't72m:3 t55:4 t62:2 bmp1:3 bmp2:1 btr60:2 toyota_technical:12 ak_light_infantry:25 d30:4 bm21_grad:3 scud_b:2 burkan_2h:3 tochka_u:1 s125_pechora:2 zsu23_4:3 zu23_2:5 mig29:1 su22:1 mig21bis:1 mi8t:2 mi24p:1 samad_3:3 an26:1 molniya_1241:1 osa_class:1 zhuk_1400:3 polnocny_770:1'),
  // ------------------------------------------------------------------ NORTH AFRICA
  inv('EGY', 'm1a1_egyptian fahd_280 walid_apc sakr_18 sakr_eye ramses_ii_t54 gowind_2500 mamba_apc', 'm1a1_egyptian:24 t62:4 t55:6 ramses_ii_t54:8 m60a3_patton:8 m113_apc:24 bmp1:6 btr60:8 fahd_280:8 walid_apc:4 brdm2:4 ak_light_infantry:40 soviet_spetsnaz:4 m109a6_paladin:8 2s1_gvozdika:10 2s3_akatsiya:6 d30:12 sakr_18:8 bm21_grad:6 scud_b:3 s300v4:2 s125_pechora:8 buk_m2:4 tor_m2:3 sakr_eye:8 mim23_hawk:4 zsu23_4:8 s75:3 f16c:12 mig21bis:2 mig29m:3 su35s:2 rafale_f4:4 mirage_2000_5:2 ka52m:3 mi35m:2 mi17v5:5 ah64e_apache:3 c130h_hercules:3 wing_loong_2:2 mistral_lhd:2 fremm_frigate:2 gowind_2500:4 meko_a200:2 oliver_hazard_perry:4 type_209:4 osa_class:4 ambassador_iii:4'),
  inv('DZA', '', 't90s:12 t72m:12 t55:6 bmp2:14 btr80:10 bmp1:6 brdm2:4 ak_light_infantry:40 soviet_spetsnaz:5 2s1_gvozdika:8 2s3_akatsiya:6 d30:10 bm21_grad:6 bm30_smerch:6 tos1a:2 iskander_m:4 s300pmu2:8 s400:2 pantsir_s1:6 tor_m2:3 buk_m2:4 s125_pechora:10 zsu23_4:6 su30sm2:4 su35s:2 mig29smt:3 mig29:2 su24m:3 mig25:1 yak130:2 il76md:3 mi28nm:3 mi17v5:5 mi8t:3 wing_loong_2:2 project_636_kilo:6 project_877_kilo:2 meko_a200:2 c28a_corvette:3 kalaat_beni_abbes:1 koni_class:3 osa_class:4'),
  inv('MAR', '', 'm1a1_abrams:6 m60a3_patton:6 vab_apc:8 m113_apc:12 western_line_infantry:30 western_sof:3 caesar_155:3 m109a6_paladin:3 himars:2 patriot_pac3:1 barak_8:1 f16v:3 f16c:3 mirage_f1:2 ah64e_apache:2 ch47f:1 c130h_hercules:2 bayraktar_tb2:2 hermes_900:1 fremm_frigate:1 sigma_class:3 floreal_class:2 damen_stan_4207:6'),
  inv('TUN', '', 'm60a3_patton:4 m113_apc:8 western_line_infantry:10 f5e_tiger:1 uh60m_blackhawk:1 c130h_hercules:1 damen_stan_4207:3'),
  inv('LBY', '', 't72m:6 t55:4 bmp1:4 btr60:3 ak_light_infantry:20 toyota_technical:15 d30:4 bm21_grad:4 s125_pechora:2 zu23_2:5 mig23ml:1 l39c:1 su22:1 mi8t:2 mi24p:1 bayraktar_tb2:2 an26:1 molniya_1241:1'),
  inv('SDN', '', 't72m:2 t55:4 bmp1:3 btr80:3 ak_light_infantry:30 toyota_technical:10 d30:4 bm21_grad:3 zu23_2:5 su24m:1 su25:1 mig29:1 mi24p:1 mi8t:2 an26:1 mohajer_6:2 bayraktar_tb2:1'),
  inv('SSD', '', 't72m:1 t55:1 ak_light_infantry:10 toyota_technical:6 mi24p:1 mi17v5:1'),
  // ------------------------------------------------------------------ EAST AFRICA / HORN
  inv('ETH', '', 't72m:5 t62:3 t55:4 bmp1:4 btr60:3 ak_light_infantry:40 soviet_spetsnaz:2 d30:6 bm21_grad:4 2s1_gvozdika:2 s125_pechora:3 zsu23_4:3 su27:2 mig23ml:1 su25:2 l39c:1 mi35m:3 mi17v5:3 mi8t:2 an26:1 mohajer_6:2 wing_loong_2:1 bayraktar_tb2:2'),
  inv('ERI', '', 't55:2 t72m:1 bmp1:1 ak_light_infantry:25 d30:3 bm21_grad:1 mig29:1 su27:1 mi8t:1 super_dvora_mk3:1'),
  inv('DJI', '', 'ak_light_infantry:6 toyota_technical:2 damen_stan_4207:1'),
  inv('SOM', '', 'ak_light_infantry:12 toyota_technical:8 zu23_2:3 bayraktar_tb2:1'),
  inv('KEN', '', 'casspir:4 mamba_apc:4 western_line_infantry:12 f5e_tiger:1 mi17v5:1 uh60m_blackhawk:1 c130h_hercules:1 damen_stan_4207:2'),
  inv('UGA', '', 't55:3 t72m:2 bmp2:2 btr60:3 ak_light_infantry:25 d30:3 bm21_grad:2 su30sm2:1 mig21bis:1 l39c:1 mi24p:1 mi17v5:2 mi8t:1'),
  inv('RWA', '', 't55:1 ratel_90:2 casspir:2 ak_light_infantry:12 d30:2 bm21_grad:1 mi17v5:1 mi24p:1 mi8t:1'),
  inv('BDI', '', 'ak_light_infantry:8 btr80:1 bm21_grad:1 mi24p:1 mi17v5:1'),
  inv('TZA', '', 't55:3 ak_light_infantry:25 d30:4 bm21_grad:2 mig21bis:1 mi17v5:2 an26:1 zu23_2:3'),
  // ------------------------------------------------------------------ CENTRAL / WEST AFRICA
  inv('COD', '', 't55:2 t72m:1 ak_light_infantry:25 btr60:2 d30:3 bm21_grad:2 su25:1 mi24p:1 mi17v5:1 mi8t:1 an26:1 damen_stan_4207:1'),
  inv('COG', '', 't55:1 ak_light_infantry:6 bm21_grad:1 mi17v5:1'),
  inv('GAB', '', 'ak_light_infantry:4 mi8t:1 damen_stan_4207:2'),
  inv('GNQ', '', 'ak_light_infantry:3 brdm2:1 mi24p:1 damen_stan_4207:1'),
  inv('CMR', '', 'western_line_infantry:10 mamba_apc:2 casspir:2 mi17v5:1 mi24p:1 l39c:1 damen_stan_4207:2'),
  inv('CAF', '', 'ak_light_infantry:4 brdm2:1 mi8t:1'),
  inv('TCD', '', 't55:1 btr80:2 ak_light_infantry:15 toyota_technical:8 d30:2 bm21_grad:1 zu23_2:2 su25:1 mi35m:1 mi17v5:1'),
  inv('NER', '', 'ak_light_infantry:8 toyota_technical:4 casspir:1 mi17v5:1 bayraktar_tb2:1'),
  inv('MLI', '', 't55:1 btr60:2 bmp1:1 ak_light_infantry:12 d30:2 bm21_grad:1 l39c:1 su25:1 mi24p:1 mi17v5:1 super_tucano_a29:1 bayraktar_tb2:1'),
  inv('BFA', '', 'ak_light_infantry:10 brdm2:1 toyota_technical:3 mi17v5:1 super_tucano_a29:1 bayraktar_tb2:1'),
  inv('MRT', '', 'western_line_infantry:8 brdm2:1 t55:1 bm21_grad:1 mi17v5:1 damen_stan_4207:2'),
  inv('SEN', '', 'western_line_infantry:10 brdm2:1 casspir:1 c130h_hercules:1 damen_stan_4207:2'),
  inv('GMB', '', 'western_line_infantry:2'),
  inv('GNB', '', 'ak_light_infantry:3'),
  inv('GIN', '', 'ak_light_infantry:8 brdm2:1 t55:1 mi24p:1 mi17v5:1'),
  inv('SLE', '', 'ak_light_infantry:5'),
  inv('LBR', '', 'western_line_infantry:3'),
  inv('CIV', '', 'western_line_infantry:8 brdm2:1 mi24p:1 mi17v5:1 damen_stan_4207:1'),
  inv('GHA', '', 'western_line_infantry:10 mamba_apc:1 mi17v5:1 damen_stan_4207:2'),
  inv('TGO', '', 'ak_light_infantry:3'),
  inv('BEN', '', 'western_line_infantry:5'),
  inv('NGA', '', 'vt4:4 t55:3 ak_light_infantry:50 casspir:2 mamba_apc:2 d30:4 bm21_grad:2 zu23_2:5 jf17_block3:2 l39c:1 super_tucano_a29:3 mi35m:3 mi17v5:3 c130h_hercules:2 wing_loong_2:1 damen_stan_4207:6 super_dvora_mk3:3 shaldag_mk5:2 hamilton_class:2'),
  inv('CPV', '', 'ak_light_infantry:2'),
  inv('STP', '', 'ak_light_infantry:1'),
  // ------------------------------------------------------------------ SOUTHERN AFRICA
  inv('AGO', '', 't72m:6 t55:5 bmp2:4 bmp1:2 btr60:3 ak_light_infantry:30 soviet_spetsnaz:2 d30:6 bm21_grad:4 bm27_uragan:2 2s1_gvozdika:2 s125_pechora:3 zsu23_4:4 su30sm2:2 su25:2 mig23ml:1 mig21bis:1 mi35m:2 mi17v5:2 mi8t:2 an26:1 il76md:1 osa_class:1 damen_stan_4207:2'),
  inv('ZMB', '', 't55:2 bmp1:1 ak_light_infantry:12 d30:2 bm21_grad:1 mig21bis:1 l39c:1 mi17v5:1 an26:1 zu23_2:2'),
  inv('MWI', '', 'ak_light_infantry:4'),
  inv('MOZ', '', 't55:3 bmp1:1 btr60:2 ak_light_infantry:15 d30:2 bm21_grad:1 mig21bis:1 mi24p:1 mi8t:1 an26:1'),
  inv('ZWE', '', 't55:2 bmp1:1 casspir:2 ak_light_infantry:20 d30:3 bm21_grad:2 zu23_2:3 mig21bis:1 mi24p:1 mi35m:1 mi8t:1 an26:1'),
  inv('NAM', '', 'casspir:2 mamba_apc:2 ratel_90:1 western_line_infantry:12 d30:2 bm21_grad:1 mi17v5:1 damen_stan_4207:1'),
  inv('BWA', '', 'western_line_infantry:6 ratel_90:1 f5e_tiger:1'),
  inv('LSO', '', 'ak_light_infantry:3'),
  inv('SWZ', '', 'ak_light_infantry:3'),
  inv('ZAF', 'olifant_mk2 rooikat_76 ratel_90 casspir mamba_apc g5_howitzer g6_rhino valkiri_mk2 umkhonto rooivalk seeker_400 western_line_infantry', 'olifant_mk2:4 rooikat_76:4 ratel_90:12 casspir:4 mamba_apc:8 western_line_infantry:40 western_sof:3 g5_howitzer:3 g6_rhino:3 valkiri_mk2:2 umkhonto:1 jas39c_gripen:1 hawk_mk120:1 rooivalk:2 c130h_hercules:1 seeker_400:1 meko_a200:4 type_209:3 warrior_class:1'),
  inv('MDG', '', 'ak_light_infantry:6'),
  inv('MUS', '', 'western_line_infantry:1 damen_stan_4207:1'),
  inv('SYC', '', 'western_line_infantry:1'),
  inv('COM', '', 'ak_light_infantry:1'),
];

// EXTERNAL IDS: ah1f_cobra, ah1z, ah64e_apache, al_madinah_class, al_riyadh_class, al_zubarah_class, ambassador_iii, badr_class, c130j_hercules, c17_globemaster, c28a_corvette, caesar_155, ch47f, ch4_rainbow, ch53k_yasur, challenger_1, challenger_2, df_3a, eurofighter_typhoon, f14a, f15c, f15e, f15sa, f16c, f16v, f4e_phantom, f5e_tiger, fa18c, fa18e, fa50, floreal_class, fremm_frigate, gowind_2500, hamilton_class, hawk_mk120, hawk_mk128, himars, jas39c_gripen, jf17_block3, k9_thunder, kalaat_beni_abbes, lav_25, leclerc, leopard_2a7, m109a6_paladin, m113_apc, m198_howitzer, m1a1_abrams, m1a2_sepv3_abrams, m270_mlrs, m2_bradley, m60a1_patton, m60a3_patton, meko_a200, mim23_hawk, mirage_2000_5, mirage_2000_9, mirage_f1, mistral_lhd, nasams, nh90, oliver_hazard_perry, patriot_pac3, piranha_iii_lav, pzh2000, rafale_f4, sigma_class, thaad, tornado_ids, type_209, uh1h_huey, uh60m_blackhawk, vab_apc, vt4

