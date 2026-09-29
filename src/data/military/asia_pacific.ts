/**
 * Asia-Pacific military designs and 2030 national inventories.
 * Contract: src/data/military/schema.ts. Stats are derived from the generic
 * unit families in src/sim/data/units.ts by interpolating a "tier" t
 * (0 = gen 1 ... 3 = gen 4, may exceed 3 for cutting-edge systems), then
 * overriding individual values where the real system differs.
 */
import { UnitCategory as C, type ArmorType, type Mobility } from '../../sim/types';
import type { MilitaryDesign, NationInventory } from './schema';

type Q = [number, number, number, number];
interface Fam {
  a: ArmorType | ArmorType[]; m: Mobility | Mobility[]; p: number;
  s: Q; h: Q; ai: Q; n: Q; sb: Q; rg: Q; ra: Q; rn: Q; dg: Q; da: Q; dn: Q;
  sp: Q; spot: Q; st: Q; rk?: Q; fuel: number; cost: Q; mg: Q; days: Q; up: Q; ind?: boolean; cap: boolean;
}
const Z: Q = [0, 0, 0, 0];
const al = (v: number): Q => [v, v, v, v];
const FAM: Record<number, Fam> = {
  [C.Infantry]: { a: 'soft', m: 'foot', p: 800, s: [28, 36, 45, 54], h: [10, 16, 24, 32], ai: [3, 6, 10, 14], n: [2, 3, 5, 8], sb: Z, rg: al(1), ra: Z, rn: Z, dg: [38, 44, 52, 60], da: [32, 38, 46, 54], dn: [30, 36, 44, 52], sp: [12, 16, 18, 20], spot: al(2), st: [0.1, 0.12, 0.15, 0.2], fuel: 120, cost: [60, 90, 140, 200], mg: [6, 9, 12, 16], days: [30, 35, 40, 45], up: [0.5, 0.62, 0.75, 0.9], cap: true },
  [C.Mechanized]: { a: 'hard', m: 'tracked', p: 700, s: [40, 48, 58, 68], h: [24, 34, 44, 56], ai: [8, 10, 14, 18], n: [3, 4, 6, 8], sb: Z, rg: al(1), ra: Z, rn: Z, dg: [42, 50, 60, 70], da: [30, 36, 44, 52], dn: [34, 40, 48, 56], sp: [40, 45, 50, 55], spot: [2, 2, 3, 3], st: al(0.05), fuel: 80, cost: [250, 380, 520, 700], mg: [25, 35, 45, 60], days: [60, 70, 80, 90], up: [1.1, 1.4, 1.6, 2.0], cap: true },
  [C.Armor]: { a: 'hard', m: 'tracked', p: 550, s: [36, 44, 52, 60], h: [56, 66, 76, 88], ai: [2, 3, 4, 6], n: [4, 5, 6, 8], sb: Z, rg: al(1), ra: Z, rn: Z, dg: [55, 64, 73, 82], da: [34, 40, 48, 56], dn: [40, 46, 52, 58], sp: [40, 48, 52, 56], spot: al(2), st: al(0.02), fuel: 70, cost: [400, 600, 850, 1150], mg: [45, 60, 80, 100], days: [90, 100, 110, 120], up: [1.8, 2.1, 2.5, 3.0], cap: true },
  [C.Artillery]: { a: ['soft', 'hard', 'hard', 'hard'], m: ['wheeled', 'tracked', 'tracked', 'tracked'], p: 500, s: [48, 56, 66, 76], h: [22, 28, 36, 46], ai: Z, n: [10, 14, 18, 24], sb: Z, rg: [1, 2, 2, 2], ra: Z, rn: [1, 1, 2, 2], dg: [18, 24, 28, 32], da: [18, 22, 26, 30], dn: [20, 24, 28, 32], sp: [30, 40, 45, 50], spot: al(2), st: al(0.05), fuel: 80, cost: [150, 250, 360, 480], mg: [20, 28, 36, 45], days: [45, 60, 70, 80], up: [0.9, 1.1, 1.3, 1.5], ind: true, cap: false },
  [C.RocketArtillery]: { a: 'soft', m: 'wheeled', p: 400, s: [60, 70, 80, 90], h: [26, 34, 44, 56], ai: Z, n: [12, 18, 26, 34], sb: Z, rg: [2, 2, 3, 3], ra: Z, rn: [1, 2, 2, 3], dg: [16, 20, 24, 28], da: [16, 20, 24, 28], dn: [16, 20, 24, 28], sp: [40, 50, 60, 65], spot: al(2), st: al(0.05), fuel: 90, cost: [250, 380, 520, 700], mg: [35, 45, 55, 70], days: [60, 70, 80, 90], up: [1.1, 1.3, 1.6, 1.9], ind: true, cap: false },
  [C.AirDefense]: { a: ['soft', 'soft', 'hard', 'hard'], m: 'wheeled', p: 450, s: [4, 5, 6, 8], h: [2, 3, 4, 5], ai: [52, 64, 78, 90], n: Z, sb: Z, rg: Z, ra: [2, 3, 3, 4], rn: Z, dg: [18, 22, 26, 30], da: [50, 58, 68, 78], dn: [18, 22, 26, 30], sp: [35, 45, 55, 60], spot: [3, 4, 5, 6], st: al(0.05), fuel: 90, cost: [300, 550, 900, 1300], mg: [30, 45, 65, 90], days: [60, 80, 100, 120], up: [1.0, 1.4, 1.9, 2.4], cap: false },
  [C.Recon]: { a: 'soft', m: 'wheeled', p: 450, s: [24, 30, 36, 42], h: [12, 18, 24, 30], ai: [2, 4, 6, 8], n: Z, sb: Z, rg: al(1), ra: Z, rn: Z, dg: [26, 32, 38, 44], da: [24, 28, 32, 36], dn: [24, 28, 32, 36], sp: [60, 70, 75, 80], spot: [4, 5, 5, 6], st: [0.2, 0.3, 0.35, 0.45], fuel: 100, cost: [120, 180, 260, 350], mg: [12, 18, 24, 30], days: [40, 45, 50, 55], up: [0.6, 0.75, 0.9, 1.05], cap: true },
  [C.SpecialForces]: { a: 'soft', m: 'foot', p: 400, s: [40, 48, 58, 68], h: [18, 26, 34, 44], ai: [6, 10, 14, 18], n: [4, 6, 8, 10], sb: Z, rg: al(1), ra: Z, rn: Z, dg: [40, 46, 54, 62], da: [40, 46, 52, 58], dn: [36, 42, 48, 54], sp: [18, 20, 22, 24], spot: [3, 3, 4, 4], st: [0.35, 0.45, 0.55, 0.65], fuel: 150, cost: [120, 180, 260, 360], mg: [8, 11, 15, 20], days: [60, 65, 70, 75], up: [0.7, 0.85, 1.0, 1.2], cap: true },
  [C.Engineers]: { a: 'soft', m: 'wheeled', p: 600, s: [18, 22, 28, 34], h: [14, 18, 24, 30], ai: [2, 3, 4, 6], n: Z, sb: Z, rg: al(1), ra: Z, rn: Z, dg: [36, 42, 50, 58], da: [28, 32, 36, 40], dn: [28, 32, 36, 40], sp: [30, 40, 45, 50], spot: al(2), st: al(0.05), fuel: 90, cost: [80, 120, 170, 230], mg: [8, 12, 16, 22], days: [40, 45, 50, 55], up: [0.5, 0.6, 0.7, 0.85], cap: true },
  [C.MissileLauncher]: { a: 'soft', m: 'wheeled', p: 350, s: [62, 72, 82, 92], h: [45, 55, 66, 78], ai: Z, n: [40, 52, 64, 76], sb: Z, rg: [4, 5, 5, 6], ra: Z, rn: [4, 5, 5, 6], dg: [14, 18, 22, 26], da: [14, 18, 22, 26], dn: [14, 18, 22, 26], sp: [40, 50, 55, 60], spot: al(2), st: [0.1, 0.15, 0.2, 0.25], fuel: 100, cost: [500, 800, 1200, 1600], mg: [60, 80, 100, 120], days: [90, 110, 130, 150], up: [1.5, 1.9, 2.3, 2.7], ind: true, cap: false },
  [C.Fighter]: { a: 'air', m: 'air', p: 250, s: [4, 6, 8, 10], h: [4, 6, 8, 10], ai: [58, 70, 82, 94], n: [4, 6, 8, 10], sb: Z, rg: Z, ra: al(2), rn: Z, dg: [55, 66, 78, 90], da: [55, 66, 78, 90], dn: [55, 66, 78, 90], sp: [900, 1100, 1300, 1500], spot: [3, 4, 5, 6], st: [0, 0.1, 0.4, 0.6], rk: [800, 1000, 1200, 1400], fuel: 4, cost: [900, 1500, 2200, 3200], mg: [60, 90, 130, 180], days: [180, 220, 260, 300], up: [2.6, 3.4, 4.3, 5.5], cap: false },
  [C.Multirole]: { a: 'air', m: 'air', p: 250, s: [30, 40, 50, 60], h: [30, 40, 52, 64], ai: [45, 56, 68, 80], n: [26, 36, 46, 58], sb: Z, rg: Z, ra: al(1), rn: Z, dg: [48, 58, 70, 82], da: [48, 58, 70, 82], dn: [48, 58, 70, 82], sp: [850, 1000, 1150, 1300], spot: [3, 4, 5, 5], st: [0, 0.05, 0.35, 0.5], rk: [700, 900, 1100, 1300], fuel: 4, cost: [800, 1300, 1900, 2800], mg: [55, 80, 115, 160], days: [170, 210, 250, 290], up: [2.4, 3.0, 3.8, 4.8], cap: false },
  [C.Strike]: { a: 'air', m: 'air', p: 240, s: [50, 60, 70, 80], h: [50, 62, 74, 86], ai: [10, 12, 16, 20], n: [40, 50, 60, 72], sb: Z, rg: Z, ra: Z, rn: Z, dg: [35, 42, 54, 66], da: [35, 42, 54, 66], dn: [35, 42, 54, 66], sp: [750, 850, 950, 1050], spot: [3, 3, 4, 4], st: [0, 0, 0.5, 0.6], rk: [650, 850, 1000, 1200], fuel: 4, cost: [700, 1100, 1600, 2300], mg: [55, 80, 110, 150], days: [160, 200, 240, 280], up: [2.2, 2.8, 3.5, 4.4], cap: false },
  [C.Bomber]: { a: 'air', m: 'air', p: 300, s: [75, 84, 92, 98], h: [55, 66, 76, 86], ai: al(5), n: [35, 45, 55, 65], sb: Z, rg: Z, ra: Z, rn: Z, dg: [30, 38, 55, 70], da: [30, 38, 55, 70], dn: [30, 38, 55, 70], sp: [800, 850, 900, 1100], spot: al(3), st: [0, 0.1, 0.7, 0.8], rk: [3500, 4500, 6000, 7000], fuel: 14, cost: [2500, 4000, 6000, 9000], mg: [120, 180, 250, 330], days: [300, 360, 420, 480], up: [5.5, 7.0, 8.8, 11.0], cap: false },
  [C.Helicopter]: { a: 'air', m: 'air', p: 220, s: [42, 50, 58, 66], h: [50, 60, 70, 80], ai: [3, 5, 8, 10], n: [12, 16, 20, 26], sb: [10, 14, 18, 22], rg: Z, ra: Z, rn: Z, dg: [22, 28, 34, 40], da: [22, 28, 34, 40], dn: [22, 28, 34, 40], sp: [220, 250, 270, 400], spot: [3, 3, 4, 4], st: [0, 0, 0.1, 0.2], rk: [180, 220, 260, 400], fuel: 3, cost: [350, 550, 800, 1100], mg: [30, 45, 60, 80], days: [120, 140, 160, 180], up: [1.1, 1.4, 1.7, 2.1], cap: false },
  [C.AirTransport]: { a: 'air', m: 'air', p: 200, s: Z, h: Z, ai: Z, n: Z, sb: Z, rg: Z, ra: Z, rn: Z, dg: [12, 15, 18, 22], da: [12, 15, 18, 22], dn: [12, 15, 18, 22], sp: [500, 650, 750, 800], spot: al(2), st: Z, rk: [2000, 2600, 3200, 3800], fuel: 10, cost: [600, 900, 1200, 1500], mg: [30, 40, 50, 60], days: [150, 170, 190, 210], up: [1.2, 1.5, 1.8, 2.1], cap: false },
  [C.Drone]: { a: 'air', m: 'air', p: 120, s: [22, 32, 44, 56], h: [22, 34, 46, 58], ai: [0, 0, 6, 14], n: [10, 18, 26, 34], sb: Z, rg: Z, ra: Z, rn: Z, dg: [10, 14, 20, 28], da: [10, 14, 20, 28], dn: [10, 14, 20, 28], sp: [180, 250, 400, 650], spot: [4, 5, 6, 7], st: [0.2, 0.3, 0.45, 0.6], rk: [700, 1000, 1400, 1800], fuel: 24, cost: [150, 300, 500, 800], mg: [15, 25, 40, 60], days: [60, 80, 100, 120], up: [0.4, 0.6, 0.9, 1.2], cap: false },
  [C.PatrolBoat]: { a: 'naval', m: 'naval', p: 120, s: [10, 12, 14, 16], h: [6, 8, 10, 12], ai: [6, 10, 14, 18], n: [18, 26, 34, 42], sb: [6, 10, 14, 18], rg: al(1), ra: [0, 1, 1, 1], rn: [1, 1, 2, 2], dg: al(20), da: [18, 22, 26, 30], dn: [20, 24, 28, 32], sp: [45, 50, 55, 60], spot: [2, 3, 3, 4], st: [0.1, 0.15, 0.2, 0.3], fuel: 240, cost: [80, 130, 190, 260], mg: [8, 12, 16, 22], days: [90, 110, 130, 150], up: [0.25, 0.32, 0.4, 0.48], cap: false },
  [C.Frigate]: { a: 'naval', m: 'naval', p: 180, s: [14, 16, 20, 24], h: [10, 12, 14, 18], ai: [30, 38, 46, 54], n: [36, 44, 52, 60], sb: [44, 52, 60, 70], rg: al(1), ra: [1, 2, 2, 2], rn: [2, 2, 3, 3], dg: [35, 40, 45, 50], da: [40, 48, 56, 64], dn: [40, 48, 56, 64], sp: [40, 42, 44, 46], spot: [3, 4, 4, 5], st: [0.05, 0.1, 0.15, 0.2], fuel: 500, cost: [450, 650, 850, 1100], mg: [40, 55, 70, 90], days: [360, 420, 480, 540], up: [0.8, 1.0, 1.2, 1.4], cap: false },
  [C.Destroyer]: { a: 'naval', m: 'naval', p: 300, s: [22, 26, 30, 36], h: [14, 18, 22, 28], ai: [50, 62, 74, 86], n: [50, 60, 70, 80], sb: [36, 44, 52, 62], rg: al(2), ra: [2, 2, 3, 3], rn: [3, 3, 4, 4], dg: [50, 56, 62, 68], da: [50, 60, 70, 80], dn: [50, 58, 66, 74], sp: [44, 46, 48, 50], spot: [4, 4, 5, 5], st: [0.05, 0.1, 0.15, 0.3], fuel: 500, cost: [1000, 1500, 2100, 2800], mg: [80, 110, 140, 180], days: [540, 600, 660, 720], up: [1.5, 1.9, 2.3, 2.8], cap: false },
  [C.Cruiser]: { a: 'naval', m: 'naval', p: 400, s: [30, 34, 40, 46], h: [20, 24, 28, 34], ai: [64, 74, 84, 92], n: [62, 72, 82, 90], sb: [26, 32, 38, 44], rg: [2, 2, 3, 3], ra: [3, 3, 4, 4], rn: [4, 4, 5, 5], dg: [60, 64, 68, 72], da: [60, 68, 76, 84], dn: [60, 66, 72, 78], sp: [44, 46, 48, 50], spot: al(5), st: [0.02, 0.05, 0.1, 0.2], fuel: 600, cost: [2200, 3000, 3800, 4800], mg: [160, 200, 240, 300], days: [720, 780, 840, 900], up: [2.6, 3.1, 3.6, 4.2], cap: false },
  [C.Carrier]: { a: 'naval', m: 'naval', p: 5000, s: al(4), h: al(4), ai: [20, 24, 28, 32], n: [6, 8, 8, 10], sb: [10, 12, 14, 16], rg: Z, ra: al(1), rn: al(1), dg: [60, 66, 72, 80], da: [50, 56, 62, 68], dn: [60, 66, 72, 80], sp: [48, 50, 52, 54], spot: al(6), st: Z, fuel: 5000, cost: [6000, 9000, 12000, 14000], mg: [400, 550, 700, 850], days: [1080, 1200, 1320, 1460], up: [8, 10, 12, 14], cap: false },
  [C.Submarine]: { a: 'sub', m: 'naval', p: 130, s: [0, 0, 10, 16], h: [0, 0, 8, 14], ai: Z, n: [60, 70, 80, 90], sb: [44, 54, 64, 76], rg: [0, 0, 3, 4], ra: Z, rn: [1, 2, 2, 3], dg: [45, 52, 60, 68], da: [60, 65, 70, 75], dn: [45, 52, 60, 68], sp: [30, 36, 40, 45], spot: [2, 3, 3, 4], st: [0.6, 0.7, 0.8, 0.88], fuel: 1500, cost: [900, 1600, 2600, 3600], mg: [70, 110, 160, 210], days: [540, 620, 700, 780], up: [1.2, 1.7, 2.3, 2.9], cap: false },
  [C.Amphibious]: { a: 'naval', m: 'naval', p: 1000, s: [16, 20, 24, 28], h: [8, 10, 12, 14], ai: [18, 24, 30, 36], n: [8, 10, 12, 14], sb: [4, 6, 8, 10], rg: [1, 1, 2, 2], ra: al(1), rn: al(1), dg: [40, 46, 52, 58], da: [40, 46, 52, 58], dn: [40, 46, 52, 58], sp: [36, 38, 40, 42], spot: al(3), st: Z, fuel: 800, cost: [1000, 1600, 2200, 3000], mg: [80, 110, 140, 180], days: [540, 600, 660, 720], up: [1.5, 1.9, 2.3, 2.7], cap: false },
};

const lerp = (q: Q, t: number): number => {
  const i = Math.max(0, Math.min(2, Math.floor(t)));
  return Math.max(0, q[i] + (q[i + 1] - q[i]) * (t - i));
};
const pk = <T,>(v: T | T[], t: number): T => (Array.isArray(v) ? v[Math.max(0, Math.min(3, Math.round(t)))] : v);

type Opt = Partial<MilitaryDesign> & { cm?: number; nx?: boolean; to?: string[] };

function build(cat: C, id: string, name: string, origin: string, year: number, t: number, desc: string, o: Opt, future: boolean, extra: Partial<MilitaryDesign>): MilitaryDesign {
  const f = FAM[cat];
  const r = (q: Q) => Math.round(lerp(q, t));
  const cap100 = (q: Q) => Math.min(100, r(q));
  const { cm, nx, to, ...ov } = o;
  const air = cat >= C.Fighter && cat <= C.Drone;
  const base: MilitaryDesign = {
    id, name, category: cat, origin, year, future,
    exportable: !nx,
    ...(to ? { exportTo: to } : {}),
    armor: pk(f.a, t), mobility: pk(f.m, t), personnel: f.p,
    attackSoft: cap100(f.s), attackHard: cap100(f.h), attackAir: cap100(f.ai), attackNaval: cap100(f.n), attackSub: cap100(f.sb),
    rangeGround: r(f.rg), rangeAir: r(f.ra), rangeNaval: r(f.rn),
    defenseGround: cap100(f.dg), defenseAir: cap100(f.da), defenseNaval: cap100(f.dn),
    speedKmh: r(f.sp), spotting: r(f.spot),
    stealth: Math.min(0.95, Math.round(lerp(f.st, t) * 100) / 100),
    rangeKm: air ? (f.rk ? r(f.rk) : 800) : 0,
    fuelCapacity: f.fuel,
    cost: Math.round(lerp(f.cost, t) * (cm ?? 1)),
    militaryGoodsCost: Math.round(lerp(f.mg, t) * (cm ?? 1)),
    buildDays: r(f.days),
    upkeep: Math.round(lerp(f.up, t) * (cm ?? 1) * 100) / 100,
    indirect: !!f.ind, canCapture: f.cap, description: desc,
    ...extra,
  };
  return { ...base, ...ov } as MilitaryDesign;
}
const D = (cat: C, id: string, name: string, origin: string, year: number, t: number, desc: string, o: Opt = {}) =>
  build(cat, id, name, origin, year, t, desc, o, false, {});
const F = (cat: C, id: string, name: string, origin: string, year: number, t: number, predecessor: string, researchCost: number, desc: string, o: Opt = {}) =>
  build(cat, id, name, origin, year, t, desc, o, true, { researchCost, predecessor });

const W: Mobility = 'wheeled';
const TR: Mobility = 'tracked';

// =====================================================================
// CHINA
// =====================================================================
const CHN: MilitaryDesign[] = [
  // --- ground
  D(C.Armor, 'type_99a', 'Type 99A', 'CHN', 2011, 2.7, 'PLA third-generation MBT, 58 t, 125 mm smoothbore, composite plus ERA and Trophy-like APS trials; 1500 hp.', { cm: 0.6, nx: true }),
  D(C.Armor, 'type_99', 'Type 99', 'CHN', 2001, 2.3, 'Earlier Type 99 MBT, 54 t, 125 mm gun, laser dazzler; backbone of heavy combined-arms brigades.', { cm: 0.6, nx: true }),
  D(C.Armor, 'type_96b', 'Type 96B', 'CHN', 2010, 2.0, 'Upgraded Type 96, 42 t, 125 mm gun, add-on ERA and improved fire control.', { cm: 0.6 }),
  D(C.Armor, 'type_96a', 'Type 96A', 'CHN', 2000, 1.6, 'Widely fielded second-generation Chinese MBT, 42 t, 125 mm gun.', { cm: 0.6 }),
  D(C.Armor, 'type_15', 'Type 15 (ZTQ-15)', 'CHN', 2018, 2.2, 'Light tank for high-altitude and mountain warfare, 33 t, 105 mm gun, reactive armor.', { cm: 0.6, defenseGround: 55, speedKmh: 60 }),
  D(C.Armor, 'vt4', 'MBT-3000 / VT4', 'CHN', 2014, 2.5, 'Export MBT (Norinco) with 125 mm gun and composite armor, 52 t; sold to Thailand, Nigeria, Pakistan trials.', { cm: 0.6 }),
  D(C.Armor, 'type_59d', 'Type 59D', 'CHN', 1990, 0.8, 'Upgraded Cold War-era T-54 derivative, 36 t, 105 mm; reserve and exported to many small armies.', { cm: 0.5 }),
  D(C.Mechanized, 'zbd_04a', 'ZBD-04A', 'CHN', 2017, 2.4, 'Tracked IFV, 32 t, 100 mm gun plus 30 mm cannon and ATGM; amphibious variant of ZBD-04.', { cm: 0.6 }),
  D(C.Mechanized, 'zbd_05', 'ZBD-05 / ZTD-05', 'CHN', 2005, 2.3, 'Amphibious IFV of the PLA Marine Corps, 30 t, 105 mm gun on ZTD-05; 25 km/h swim speed.', { cm: 0.6 }),
  D(C.Mechanized, 'zbd_03', 'ZBD-03', 'CHN', 2004, 1.9, 'Airborne tracked IFV with 30 mm cannon and HJ-73 ATGM; airdroppable.', { cm: 0.6 }),
  D(C.Mechanized, 'zbl_08', 'ZBL-08 / VN1', 'CHN', 2012, 2.2, 'Wheeled 8x8 IFV, 21 t, 30 mm cannon; the standard motorized infantry vehicle in combined-arms brigades.', { cm: 0.55, mobility: W }),
  D(C.Mechanized, 'zsl_10', 'ZSL-10 / WZ-551B', 'CHN', 1998, 1.5, 'Older 6x6 wheeled APC family for light motorized brigades.', { cm: 0.5, mobility: W }),
  D(C.Recon, 'zbl_09_recon', 'ZTL-11 / Assault Recon Vehicle', 'CHN', 2013, 2.0, '8x8 wheeled assault gun vehicle with 105 mm gun; used as fast recon-in-force.', { cm: 0.6 }),
  D(C.Artillery, 'plz_05', 'PLZ-05', 'CHN', 2008, 2.7, 'Tracked 155 mm/52 cal SP howitzer, 35 t; range 50+ km with rocket-assisted shell.', { cm: 0.6 }),
  D(C.Artillery, 'pcl_181', 'PCL-181', 'CHN', 2019, 2.6, 'Truck-mounted 155 mm/52 cal howitzer on 6x6 chassis; 40+ km range, high strategic mobility.', { cm: 0.55 }),
  D(C.Artillery, 'plz_07b', 'PLZ-07B / PLL-09', 'CHN', 2015, 2.0, 'Light 122 mm SP howitzers on tracked/wheeled chassis for combined-arms brigades.', { cm: 0.55 }),
  D(C.RocketArtillery, 'phl_16', 'PHL-16 (A300)', 'CHN', 2018, 3.0, '370 km 300 mm guided rocket launcher, 12-round; the PLA long-range fires workhorse.', { cm: 0.6, rangeGround: 7 }),
  D(C.RocketArtillery, 'phl_03', 'PHL-03', 'CHN', 2004, 2.4, '300 mm 12-tube MRL, 130 km guided/unguided rockets on 8x8 truck.', { cm: 0.6, rangeGround: 3 }),
  D(C.RocketArtillery, 'phl_11', 'PHL-11 / PCL-191', 'CHN', 2021, 2.9, '370 km modular 8x8 launcher able to fire 370 mm rockets and missiles.', { cm: 0.6, rangeGround: 7 }),
  D(C.AirDefense, 'hq_9b', 'HQ-9B', 'CHN', 2013, 3.0, 'Long-range SAM (260 km), TELAR on 8x8 trucks, dual-role anti-ballistic; comparable to S-300PMU2/S-400 lower tier.', { cm: 0.7, rangeAir: 5 }),
  D(C.AirDefense, 'hq_9p', 'HQ-9/P (FD-2000)', 'CHN', 2021, 2.6, 'Export variant of HQ-9 fielded by Pakistan and others.', { cm: 0.65, rangeAir: 4 }),
  D(C.AirDefense, 'hq_16fe', 'HQ-16FE', 'CHN', 2012, 2.5, 'Medium-range SAM, 70 km, vertical launch on 6x6 truck; replaces SA-6/SA-11 class.', { cm: 0.6, rangeAir: 2 }),
  D(C.AirDefense, 'hq_22', 'HQ-22', 'CHN', 2016, 2.8, 'Long/medium-range SAM, 170 km range with semi-active seeker; export FK-3.', { cm: 0.65, rangeAir: 3 }),
  D(C.AirDefense, 'hq_17ab', 'HQ-17AB', 'CHN', 2013, 2.3, 'Tracked short-range SAM vehicle, 15 km, Tor-M1 derivative.', { cm: 0.55, mobility: TR, rangeAir: 1 }),
  D(C.AirDefense, 'pgz_09', 'PGZ-09 / PGZ-95', 'CHN', 2010, 1.8, 'Tracked 35 mm twin-gun SPAAG plus TY-90 missiles for point defence of maneuver formations.', { cm: 0.5, mobility: TR, rangeAir: 1 }),
  D(C.AirDefense, 'hq_19', 'HQ-19 / HQ-26 ABM', 'CHN', 2021, 3.2, 'Midcourse/terminal anti-ballistic missile battery for regional BMD.', { cm: 0.8, nx: true, rangeAir: 6 }),
  D(C.MissileLauncher, 'df_15b', 'DF-15B (CSS-6)', 'CHN', 1995, 1.8, 'Road-mobile SRBM, 600 km, conventional payload; Rocket Force brigades opposite Taiwan.', { cm: 0.6, rangeGround: 12, rangeNaval: 12 }),
  D(C.MissileLauncher, 'df_16', 'DF-16', 'CHN', 2011, 2.3, 'Solid-fuel MRBM, 1000 km, MARV precision warhead.', { cm: 0.6, rangeGround: 20, rangeNaval: 20 }),
  D(C.MissileLauncher, 'df_17', 'DF-17 HGV', 'CHN', 2019, 3.0, 'MRBM carrying DF-ZF hypersonic glide vehicle, 1800-2500 km; hard to intercept.', { cm: 0.65, nx: true, rangeGround: 45, rangeNaval: 45 }),
  D(C.MissileLauncher, 'df_21d', 'DF-21D', 'CHN', 2010, 2.8, 'Anti-ship ballistic missile, ~1500 km, MaRV; the "carrier killer".', { cm: 0.65, nx: true, rangeGround: 30, rangeNaval: 30, attackNaval: 92 }),
  D(C.MissileLauncher, 'df_26', 'DF-26', 'CHN', 2018, 3.0, 'Dual-capable IRBM, 4000 km, nuclear/conventional and anti-ship; "Guam Express".', { cm: 0.65, nx: true, rangeGround: 80, rangeNaval: 80 }),
  D(C.MissileLauncher, 'cj_10', 'CJ-10 / DH-10', 'CHN', 2009, 2.4, 'Ground-launched land-attack cruise missile, 1500+ km.', { cm: 0.6, rangeGround: 30, rangeNaval: 10 }),
  D(C.MissileLauncher, 'yj_18_coastal', 'YJ-12 / YJ-62 Coastal Defence', 'CHN', 2015, 2.6, 'Truck-launched supersonic/subsonic anti-ship missile battery covering the first island chain.', { cm: 0.6, attackSoft: 20, rangeGround: 8, rangeNaval: 8, attackNaval: 86 }),
  D(C.MissileLauncher, 'df_41', 'DF-41 ICBM', 'CHN', 2019, 3.4, 'Road/rail-mobile solid ICBM, 12000+ km, MIRV; Rocket Force strategic brigade.', { cm: 0.8, nx: true, rangeGround: 200, rangeNaval: 200 }),
  D(C.MissileLauncher, 'df_31ag', 'DF-31AG', 'CHN', 2017, 3.1, 'Off-road TEL ICBM, 11000 km.', { cm: 0.75, nx: true, rangeGround: 200, rangeNaval: 200 }),
  D(C.Infantry, 'pla_combined_arms_inf', 'PLA Light Combined Arms Battalion', 'CHN', 2018, 2.2, 'Standard PLA Army infantry battalion with QBZ-191 rifles, motorized on Mengshi trucks.', { cm: 0.5 }),
  D(C.Infantry, 'pla_mountain_inf', 'PLA High-Altitude Infantry Battalion', 'CHN', 2018, 2.2, 'Tibet/Xinjiang high-altitude mountain infantry with ZTQ-15 support.', { cm: 0.55, defenseGround: 58 }),
  D(C.SpecialForces, 'pla_special_ops', 'PLA Special Operations Battalion (Snow Leopard/Sharp Edge)', 'CHN', 2016, 2.4, 'Elite Army and PAP special operations detachment.', { cm: 0.6 }),
  D(C.SpecialForces, 'pla_marine', 'PLAN Marine Corps Battalion', 'CHN', 2017, 2.3, 'Expeditionary marine infantry with ZBD-05 and Type 07 amphibious vehicles.', { cm: 0.6, mobility: TR, armor: 'hard' }),
  D(C.Engineers, 'pla_engineers', 'PLA Combat Engineer Battalion', 'CHN', 2015, 2.2, 'Assault bridging, mine clearance and fortification battalion.', { cm: 0.55 }),
  // --- air
  D(C.Multirole, 'j10c', 'J-10C Vigorous Dragon', 'CHN', 2018, 2.8, '4.5-gen single-engine multirole with AESA radar, PL-15 BVR missiles (200+ km), WS-10B engine; 2100 km combat radius with tanks 550 km.', { cm: 0.6, rangeKm: 1100 }),
  D(C.Fighter, 'j11b', 'J-11B', 'CHN', 2007, 2.3, 'Chinese-built Su-27 derivative with WS-10A engines, PL-12 missiles.', { cm: 0.6, rangeKm: 1500 }),
  D(C.Multirole, 'j15', 'J-15 Flying Shark', 'CHN', 2013, 2.6, 'Carrier-based Su-33 derivative, ski-jump STOBAR fighter, PL-10/PL-12 and YJ-83K.', { cm: 0.65, rangeKm: 1200 }),
  D(C.Multirole, 'j15t', 'J-15T', 'CHN', 2024, 2.9, 'CATOBAR variant of J-15 with catapult launch; embarked on Fujian.', { cm: 0.7, nx: true, rangeKm: 1300 }),
  D(C.Multirole, 'j16', 'J-16', 'CHN', 2015, 2.9, 'Heavy two-seat multirole strike fighter, Su-30MKK derivative with AESA and PL-15, YJ-91 ARM.', { cm: 0.65, rangeKm: 1500 }),
  D(C.Multirole, 'j16d', 'J-16D Electronic Warfare', 'CHN', 2021, 2.7, 'EW/SEAD variant with wingtip jammer pods; suppresses enemy radar.', { cm: 0.7, nx: true, attackAir: 60, rangeKm: 1500 }),
  D(C.Fighter, 'j20a', 'J-20A Mighty Dragon', 'CHN', 2017, 3.1, 'Fifth-generation stealth heavy fighter, WS-15 engines (J-20A late), PL-15 in internal bay; 2000 km range.', { cm: 0.75, nx: true, rangeKm: 2000, stealth: 0.55 }),
  D(C.Multirole, 'j35a', 'J-35A / FC-31 Gyrfalcon', 'CHN', 2025, 3.0, 'Medium stealth fighter for PLAAF and PLAN (J-35), two WS-13/19 engines; export FC-31.', { cm: 0.75, nx: false, rangeKm: 1250, stealth: 0.5 }),
  D(C.Multirole, 'j35', 'J-35 (Naval)', 'CHN', 2026, 3.0, 'Carrier-based stealth fighter with CATOBAR gear operating from Fujian.', { cm: 0.8, nx: true, rangeKm: 1250, stealth: 0.5 }),
  D(C.Strike, 'jh7a', 'JH-7A Flying Leopard', 'CHN', 2004, 2.0, 'Twin-engine fighter-bomber, YJ-83K/YJ-91 ASMs; PLAN/PLAAF maritime strike.', { cm: 0.55, rangeKm: 1650 }),
  D(C.Bomber, 'h6k', 'H-6K', 'CHN', 2009, 2.2, 'Modernised Tu-16 with D-30KP engines, 6 x CJ-20 (2000 km) LACMs; 3500 km combat radius.', { cm: 0.6, rangeKm: 3500 }),
  D(C.Bomber, 'h6n', 'H-6N', 'CHN', 2019, 2.4, 'Air-refuellable H-6 carrying a DF-21-class ALBM (KD-21); nuclear-capable triad element.', { cm: 0.65, nx: true, rangeKm: 4500 }),
  D(C.Bomber, 'h6j', 'H-6J', 'CHN', 2001, 1.8, 'Naval anti-ship bomber carrying YJ-12 ASMs.', { cm: 0.55, rangeKm: 3000, attackNaval: 60 }),
  D(C.Helicopter, 'z10', 'Z-10 / WZ-10', 'CHN', 2012, 2.5, 'Dedicated attack helicopter, 30 mm cannon, HJ-10 ATGMs; Z-10ME export variant.', { cm: 0.6 }),
  D(C.Helicopter, 'z19e', 'Z-19E Black Whirlwind', 'CHN', 2013, 1.8, 'Light armed reconnaissance helicopter with Hellfire-like ATGMs.', { cm: 0.5 }),
  D(C.AirTransport, 'z20', 'Z-20 Utility Helicopter', 'CHN', 2019, 2.3, 'Medium 10 t utility helicopter (Blackhawk class) for PLA Army air assault.', { cm: 0.55, rangeKm: 1200, speedKmh: 300 }),
  D(C.AirTransport, 'y20', 'Y-20 Kunpeng', 'CHN', 2016, 2.9, 'Heavy strategic airlifter, 66 t payload, WS-20 engines; also tanker version.', { cm: 0.6, rangeKm: 7800 }),
  D(C.AirTransport, 'y9', 'Y-9', 'CHN', 2012, 2.1, 'Medium tactical transport turboprop, 25 t payload; many special-mission variants.', { cm: 0.55, rangeKm: 2500 }),
  D(C.AirTransport, 'h6u_tanker', 'HY-6 / H-6U Tanker', 'CHN', 2012, 1.8, 'H-6 based aerial tanker extending fighter radius.', { cm: 0.5 }),
  D(C.Drone, 'gj11', 'GJ-11 Sharp Sword', 'CHN', 2021, 3.0, 'Flying-wing stealthy UCAV for carrier and land ops, 2 internal bays.', { cm: 0.7, nx: true }),
  D(C.Drone, 'wing_loong_2', 'Wing Loong II', 'CHN', 2017, 2.3, 'MALE UCAV, 20 h endurance, 12 hardpoints; export success across Middle East and Africa.', { cm: 0.5 }),
  D(C.Drone, 'ch4', 'CH-4B Rainbow', 'CHN', 2014, 1.8, 'Export MALE UCAV, 250 kg payload.', { cm: 0.45 }),
  D(C.Drone, 'ch5', 'CH-5 Rainbow', 'CHN', 2019, 2.4, 'Larger MALE UCAV, 60 h endurance, 1000 kg payload.', { cm: 0.55 }),
  D(C.Drone, 'wz7', 'WZ-7 Soaring Dragon', 'CHN', 2018, 2.4, 'HALE reconnaissance drone for maritime surveillance.', { cm: 0.6, attackSoft: 5, attackHard: 5, attackNaval: 5, spotting: 8 }),
  D(C.Drone, 'gj2_pla', 'GJ-2', 'CHN', 2018, 2.3, 'PLA variant of Wing Loong II for ISR and strike.', { cm: 0.5, nx: true }),
  // --- naval
  D(C.Cruiser, 'type_055', 'Type 055 Renhai', 'CHN', 2020, 3.1, 'Large 13,000 t guided-missile destroyer/cruiser, 112 VLS cells, YJ-18 and CJ-10, dual-band radar; PLAN flagship escort.', { cm: 0.65, nx: true, personnel: 312, rangeNaval: 6 }),
  D(C.Destroyer, 'type_052d', 'Type 052D Luyang III', 'CHN', 2014, 2.8, '7,500 t AAW destroyer, 64 VLS cells with HHQ-9, YJ-18; AESA radar.', { cm: 0.6, nx: true, rangeNaval: 5 }),
  D(C.Destroyer, 'type_052c', 'Type 052C Luyang II', 'CHN', 2004, 2.4, 'First Chinese Aegis-like AAW destroyer with HHQ-9 and Type 348 AESA.', { cm: 0.6, nx: true }),
  D(C.Destroyer, 'type_052b', 'Type 052B Luyang I', 'CHN', 2004, 1.8, 'Early Luyang class with SA-N-12 Shtil and YJ-83 missiles.', { cm: 0.55 }),
  D(C.Frigate, 'type_054a', 'Type 054A Jiangkai II', 'CHN', 2008, 2.4, '4,000 t multirole frigate, 32 HQ-16 VLS cells, YJ-83; over 30 built.', { cm: 0.6 }),
  D(C.Frigate, 'type_054b', 'Type 054B', 'CHN', 2022, 2.7, 'Improved Jiangkai with AESA radar, larger hull and VLS.', { cm: 0.65, nx: true }),
  D(C.Frigate, 'type_056a', 'Type 056A Jiangdao', 'CHN', 2013, 1.5, '1,500 t corvette with ASW capability, YJ-83; over 70 built; export as F22P/P18N.', { cm: 0.45, personnel: 70 }),
  D(C.PatrolBoat, 'type_022', 'Type 022 Houbei', 'CHN', 2004, 2.0, 'Wave-piercing catamaran missile boat, 8 x YJ-83, stealth shaping; swarm-capable flotilla.', { cm: 0.5 }),
  D(C.Carrier, 'liaoning', 'Type 001 Liaoning', 'CHN', 2012, 2.0, 'Ex-Soviet Varyag, ski-jump STOBAR carrier, 60,000 t, J-15 wing.', { cm: 0.55, nx: true }),
  D(C.Carrier, 'shandong', 'Type 002 Shandong', 'CHN', 2019, 2.3, 'First domestically-built STOBAR carrier, 70,000 t, 36 J-15.', { cm: 0.6, nx: true }),
  D(C.Carrier, 'fujian', 'Type 003 Fujian', 'CHN', 2025, 3.1, 'First CATOBAR carrier with EMALS, 80,000 t, J-15T/J-35/KJ-600 wing.', { cm: 0.7, nx: true }),
  D(C.Amphibious, 'type_075', 'Type 075 Yushen', 'CHN', 2021, 3.0, 'LHD 36,000 t, 30 helicopters, 3 LCACs, 800 marines.', { cm: 0.6, nx: true }),
  D(C.Amphibious, 'type_076', 'Type 076 Sichuan', 'CHN', 2026, 3.3, 'Electromagnetic-catapult LHD 40,000 t for drones and helicopters; Type 075 successor.', { cm: 0.7, nx: true, defenseAir: 62 }),
  D(C.Amphibious, 'type_071', 'Type 071 Yuzhao', 'CHN', 2007, 2.5, 'LPD 25,000 t, 4 LCAC, 800 troops.', { cm: 0.6, nx: true }),
  D(C.Amphibious, 'type_072a', 'Type 072A/III LST', 'CHN', 2003, 1.8, 'Landing ship tank with 10 tanks, 500 troops.', { cm: 0.5 }),
  D(C.Submarine, 'type_093b', 'Type 093B Shang II', 'CHN', 2015, 2.6, 'Nuclear attack submarine with YJ-18 VLS; improved quieting.', { cm: 0.6, nx: true }),
  D(C.Submarine, 'type_094a', 'Type 094A Jin', 'CHN', 2010, 2.5, 'SSBN, 12 x JL-2 SLBMs (7200 km); PLAN sea deterrent.', { cm: 0.7, nx: true, attackSoft: 60, rangeGround: 145 }),
  D(C.Submarine, 'type_039a', 'Type 039A Yuan', 'CHN', 2006, 2.2, 'AIP diesel-electric attack submarine with YJ-82, Stirling engine.', { cm: 0.5 }),
  D(C.Submarine, 'type_039c', 'Type 039C', 'CHN', 2019, 2.5, 'Improved Yuan with X-rudder and better sensors; Hangor export basis.', { cm: 0.55 }),
  D(C.Submarine, 'type_039b', 'Type 039B / S26 Export', 'CHN', 2018, 2.4, 'Export Yuan variant sold to Pakistan (Hangor) and Thailand.', { cm: 0.5 }),
  D(C.Submarine, 'type_033_romeo', 'Type 033 Romeo', 'CHN', 1960, 0.8, 'Obsolete Soviet-derived diesel submarine, exported to North Korea, Egypt.', { cm: 0.35 }),
];

const CHN_FUTURE: MilitaryDesign[] = [
  F(C.Fighter, 'chn_j36', 'J-36 Tailless Sixth-Gen Fighter', 'CHN', 2032, 3.7, 'j20a', 2600, 'Large tailless tri-jet 6th-gen stealth fighter/strike platform with huge weapon bays, network-centric, AI teaming.', { cm: 0.85, nx: true, rangeKm: 2800, stealth: 0.75 }),
  F(C.Multirole, 'chn_j50', 'J-50 / J-XDS Sixth-Gen Multirole', 'CHN', 2033, 3.6, 'j35a', 2400, 'Tailless twin-engine 6th-gen stealth multirole for PLAN carrier decks.', { cm: 0.85, nx: true, rangeKm: 2000, stealth: 0.72 }),
  F(C.Bomber, 'chn_h20', 'H-20 Stealth Bomber', 'CHN', 2032, 3.2, 'h6n', 2800, 'Flying-wing subsonic stealth strategic bomber, 10,000 km range, 10 t payload; nuclear-capable.', { cm: 0.75, nx: true, rangeKm: 8500 }),
  F(C.Carrier, 'chn_type_004', 'Type 004 Nuclear Carrier', 'CHN', 2032, 3.5, 'fujian', 3200, 'Nuclear-powered CATOBAR supercarrier, 100,000 t, 4 EMALS; unlimited range.', { cm: 0.8, nx: true, fuelCapacity: 20000 }),
  F(C.Submarine, 'chn_type_095', 'Type 095 SSN', 'CHN', 2031, 3.2, 'type_093b', 2200, 'Next-generation nuclear attack submarine with pump-jet, VLS and near-Akula-II quietness.', { cm: 0.75, nx: true }),
  F(C.Submarine, 'chn_type_096', 'Type 096 SSBN', 'CHN', 2033, 3.3, 'type_094a', 2600, 'Next-generation SSBN with 24 JL-3 SLBMs (10,000 km).', { cm: 0.8, nx: true, rangeGround: 200, attackSoft: 80 }),
  F(C.Armor, 'chn_type_100', 'Type 100 Next-Gen MBT (concept)', 'CHN', 2032, 3.4, 'type_99a', 2200, '140 mm-class 3-man MBT with unmanned turret, APS and active protection, hybrid engine.', { cm: 0.75, nx: true }),
  F(C.Drone, 'chn_gj_x_wingman', 'GJ-X Loyal Wingman', 'CHN', 2030, 3.2, 'gj11', 1800, 'Jet-powered loyal wingman drone teamed with J-20/J-36 for EW and strike.', { cm: 0.7, nx: true }),
  F(C.Drone, 'chn_jiutian', 'Jiu Tian Drone Mothership', 'CHN', 2030, 3.3, 'wing_loong_2', 1700, 'Large jet drone mothership carrying swarms of loitering munitions.', { cm: 0.75, nx: true, rangeKm: 7000 }),
  F(C.MissileLauncher, 'chn_df_27', 'DF-27 Hypersonic Glide Missile', 'CHN', 2030, 3.4, 'df_26', 2000, 'Long-range HGV missile, 5000-8000 km; extends conventional precision strike to Hawaii-range.', { cm: 0.8, nx: true, rangeGround: 140, rangeNaval: 140 }),
  F(C.MissileLauncher, 'chn_df_61', 'DF-61 / Next ICBM', 'CHN', 2032, 3.5, 'df_41', 2400, 'Advanced MIRV/HGV road-mobile ICBM.', { cm: 0.85, nx: true, rangeGround: 200, rangeNaval: 200 }),
  F(C.AirDefense, 'chn_hq_29', 'HQ-29 Exo-Atmospheric Interceptor', 'CHN', 2031, 3.5, 'hq_19', 2000, 'Exo-atmospheric ABM/ASAT interceptor for strategic defence.', { cm: 0.85, nx: true, rangeAir: 9 }),
  F(C.Cruiser, 'chn_type_055b', 'Type 055B / Next-Gen Cruiser', 'CHN', 2030, 3.4, 'type_055', 1800, 'Improved Renhai with railgun/laser trials, integrated electric propulsion, more VLS.', { cm: 0.7, nx: true }),
  F(C.Amphibious, 'chn_type_076b', 'Type 076B Assault Carrier', 'CHN', 2031, 3.5, 'type_076', 1500, 'Second-batch drone-carrying amphibious assault ship with improved EMALS.', { cm: 0.75, nx: true }),
  F(C.Helicopter, 'chn_z21', 'Z-21 Next Attack Helicopter', 'CHN', 2031, 3.2, 'z10', 1300, 'Heavier stealth-shaped attack helicopter with manned-unmanned teaming.', { cm: 0.7, nx: true }),
  F(C.Mechanized, 'chn_next_ifv', 'ZBD-Next Optionally-Manned IFV', 'CHN', 2031, 3.3, 'zbd_04a', 1200, 'Modular IFV with APS, 30/40 mm cannon and drone integration.', { cm: 0.7, nx: true }),
  F(C.Multirole, 'chn_j20b_s', 'J-20S Two-Seat Command Fighter', 'CHN', 2030, 3.3, 'j20a', 1400, 'Two-seat J-20 for controlling loyal-wingman drones.', { cm: 0.8, nx: true, rangeKm: 2200 }),
];

// =====================================================================
// INDIA
// =====================================================================
const IND: MilitaryDesign[] = [
  D(C.Armor, 'arjun_mk1a', 'Arjun Mk1A', 'IND', 2021, 2.6, 'Indigenous 68 t MBT, 120 mm rifled gun, Kanchan armor, 71 upgrades over Mk1.', { cm: 0.7 }),
  D(C.Armor, 't90s_bhishma', 'T-90S Bhishma', 'IND', 2001, 2.4, 'Licence-built T-90S with Kontakt-5 ERA, thermal sights; 1,000+ in service.', { cm: 0.7 }),
  D(C.Armor, 'ajeya_t72', 'T-72M1 Ajeya (upgraded)', 'IND', 1979, 1.5, 'Indian upgraded T-72M1 with thermal sight and Kanchan armor.', { cm: 0.6 }),
  D(C.Mechanized, 'bmp2_sarath', 'BMP-2 Sarath', 'IND', 1987, 1.6, 'Licence-built BMP-2 IFV, Indian mechanized infantry backbone.', { cm: 0.6 }),
  D(C.Mechanized, 'wheeled_apc_ind', 'Kestrel / WhAP 8x8', 'IND', 2020, 2.3, 'DRDO/Tata wheeled armoured platform, 30 mm cannon or ATGM.', { cm: 0.6, mobility: W }),
  D(C.Artillery, 'k9_vajra', 'K9 Vajra-T', 'IND', 2018, 2.6, 'L&T-built K9 Thunder derivative, 155 mm/52 cal, tracked SPH for desert and plains.', { cm: 0.7 }),
  D(C.Artillery, 'atags', 'ATAGS 155 mm/52', 'IND', 2023, 2.6, 'Towed 155 mm/52 cal gun, 48 km range, developed by DRDO with Tata and Bharat Forge.', { cm: 0.65, mobility: W, armor: 'soft' }),
  D(C.Artillery, 'dhanush', 'Dhanush 155 mm', 'IND', 2019, 2.0, 'Ordnance Factory Board Bofors FH-77B derivative, 38 km range.', { cm: 0.6 }),
  D(C.Artillery, 'sharang', 'Sharang 155 mm', 'IND', 2012, 1.8, 'Upgraded M-46 130 mm towed guns to 155 mm.', { cm: 0.55 }),
  D(C.RocketArtillery, 'pinaka_mk1', 'Pinaka Mk-I', 'IND', 2000, 2.3, '214 mm 12-tube MRL, 40 km rockets, mounted on Tatra 8x8.', { cm: 0.6 }),
  D(C.RocketArtillery, 'pinaka_guided', 'Pinaka Guided / Mk-II', 'IND', 2022, 2.9, 'Guided Pinaka with 75-90 km range and INS/GPS guidance.', { cm: 0.65, rangeGround: 2 }),
  D(C.AirDefense, 'akash', 'Akash', 'IND', 2008, 2.4, 'Medium-range SAM, 25-30 km, phased-array radar; Army and IAF.', { cm: 0.7, rangeAir: 2 }),
  D(C.AirDefense, 'akash_ng', 'Akash-NG', 'IND', 2025, 2.8, 'Next-gen Akash with AESA seeker, 70-80 km range.', { cm: 0.75, rangeAir: 3 }),
  D(C.AirDefense, 'mrsam', 'MRSAM / Barak-8 (India)', 'IND', 2017, 2.8, 'India-Israel medium-range SAM, 70-100 km, VL launch; Army and Navy.', { cm: 0.8, rangeAir: 3 }),
  D(C.AirDefense, 'qrsam', 'QRSAM', 'IND', 2023, 2.4, 'Quick-reaction SAM on mobile 8x8 for armored formations.', { cm: 0.6, rangeAir: 1 }),
  D(C.MissileLauncher, 'brahmos', 'BrahMos Land Battery', 'IND', 2007, 3.0, 'Supersonic (Mach 2.8) cruise missile battery, 290-450 km; Army mobile launcher.', { cm: 0.7, rangeGround: 8, rangeNaval: 8 }),
  D(C.MissileLauncher, 'prithvi_ii', 'Prithvi-II', 'IND', 2003, 1.7, 'Liquid-fuel SRBM, 350 km, conventional.', { cm: 0.6, rangeGround: 7 }),
  D(C.MissileLauncher, 'pralay', 'Pralay', 'IND', 2023, 2.6, 'Solid-fuel quasi-ballistic SRBM, 150-500 km, manoeuvring.', { cm: 0.65, rangeGround: 10 }),
  D(C.MissileLauncher, 'agni_v', 'Agni-V', 'IND', 2018, 3.0, 'Solid ICBM, 5,000-8,000 km, MIRV (Mission Divyastra) road-mobile.', { cm: 0.8, nx: true, rangeGround: 160, rangeNaval: 160 }),
  D(C.MissileLauncher, 'agni_p', 'Agni-P', 'IND', 2021, 2.6, 'Canisterised solid MRBM, 1,000-2,000 km.', { cm: 0.7, nx: true, rangeGround: 40, rangeNaval: 40 }),
  D(C.MissileLauncher, 'nirbhay', 'Nirbhay / LRLACM', 'IND', 2020, 2.3, 'Subsonic long-range land-attack cruise missile, 1,000 km.', { cm: 0.6, rangeGround: 20 }),
  D(C.Infantry, 'ind_infantry', 'Indian Army Infantry Battalion', 'IND', 2020, 1.9, 'Standard infantry battalion with INSAS/AK-203 and Javelin/Spike ATGM.', { cm: 0.4 }),
  D(C.Infantry, 'ind_mountain', 'Indian Mountain Strike Battalion', 'IND', 2020, 2.1, 'High-altitude mountain infantry (Ladakh/Arunachal), Vajra light tanks in support.', { cm: 0.5, defenseGround: 58 }),
  D(C.SpecialForces, 'ind_para_sf', 'Para SF / Garud / MARCOS', 'IND', 2018, 2.4, 'Indian special-forces group.', { cm: 0.6 }),
  D(C.Multirole, 'tejas_mk1a', 'Tejas Mk1A', 'IND', 2025, 2.5, 'Indigenous light multirole fighter with AESA (Uttam), EW suite, GE F404; 2,200 km range.', { cm: 0.7, rangeKm: 800 }),
  D(C.Multirole, 'tejas_mk1', 'Tejas Mk1', 'IND', 2015, 2.0, 'Initial-production LCA Tejas.', { cm: 0.65, rangeKm: 750 }),
  D(C.Multirole, 'su30mki', 'Su-30MKI (HAL)', 'IND', 2002, 2.7, 'HAL-built heavy multirole with thrust-vectoring, BrahMos-A capable; ~270 in IAF.', { cm: 0.85, rangeKm: 1500 }),
  D(C.Fighter, 'mig21_bison', 'MiG-21 Bison', 'IND', 1965, 1.2, 'Upgraded MiG-21bis, final squadrons retiring by ~2026.', { cm: 0.5 }),
  D(C.Strike, 'jaguar_darin3', 'Jaguar IS DARIN III', 'IND', 1979, 1.8, 'Upgraded deep-strike Jaguar with new radar and nuclear delivery role.', { cm: 0.6, rangeKm: 900 }),
  D(C.Helicopter, 'lch_prachand', 'HAL LCH Prachand', 'IND', 2022, 2.4, 'Light Combat Helicopter for high-altitude use, 20 mm gun, Helina ATGM.', { cm: 0.6 }),
  D(C.Helicopter, 'dhruv_rudra', 'HAL Rudra (armed Dhruv)', 'IND', 2013, 1.8, 'Armed ALH Dhruv with rockets and Helina ATGMs.', { cm: 0.55 }),
  D(C.AirTransport, 'dhruv_alh', 'HAL Dhruv ALH', 'IND', 2002, 1.8, 'Utility helicopter, Army/Navy/Coast Guard.', { cm: 0.55, rangeKm: 800, speedKmh: 245 }),
  D(C.AirTransport, 'hal_do228', 'Dornier Do-228 (HAL)', 'IND', 1985, 1.4, 'Light STOL transport / maritime recon.', { cm: 0.45, rangeKm: 1000, speedKmh: 400 }),
  D(C.Drone, 'rustom2', 'DRDO Rustom-2 / TAPAS', 'IND', 2023, 2.0, 'MALE UAV with 24 h endurance for ISR and light strike.', { cm: 0.5 }),
  D(C.Drone, 'archer_ng', 'Archer-NG', 'IND', 2027, 2.4, 'Indigenous armed MALE UCAV.', { cm: 0.5 }),
  D(C.Carrier, 'vikrant', 'INS Vikrant', 'IND', 2022, 2.3, 'First indigenous carrier, 45,000 t STOBAR, MiG-29K/Rafale-M wing.', { cm: 0.6, nx: true }),
  D(C.Carrier, 'vikramaditya', 'INS Vikramaditya', 'IND', 2013, 2.0, 'Ex-Admiral Gorshkov, 45,000 t STOBAR, MiG-29K.', { cm: 0.6, nx: true }),
  D(C.Destroyer, 'visakhapatnam', 'Visakhapatnam-class (P15B)', 'IND', 2021, 2.9, '7,400 t stealth guided-missile destroyer, BrahMos and MRSAM.', { cm: 0.7 }),
  D(C.Destroyer, 'kolkata', 'Kolkata-class (P15A)', 'IND', 2014, 2.6, '7,000 t stealth destroyer, BrahMos, Barak-8.', { cm: 0.7 }),
  D(C.Destroyer, 'delhi', 'Delhi-class (P15)', 'IND', 1997, 2.0, '6,700 t destroyer, Klub and Barak.', { cm: 0.65 }),
  D(C.Frigate, 'nilgiri', 'Nilgiri-class (P17A)', 'IND', 2024, 2.7, '6,700 t stealth frigate, BrahMos, MRSAM.', { cm: 0.7 }),
  D(C.Frigate, 'shivalik', 'Shivalik-class (P17)', 'IND', 2010, 2.3, '6,100 t stealth frigate, Klub, Shtil.', { cm: 0.7 }),
  D(C.Frigate, 'kamorta', 'Kamorta-class (P28)', 'IND', 2014, 1.8, '3,400 t ASW corvette, torpedoes and RBU.', { cm: 0.55 }),
  D(C.Submarine, 'arihant', 'Arihant-class SSBN', 'IND', 2016, 2.4, '6,000 t SSBN with K-15/K-4 SLBM, 12 launch tubes.', { cm: 0.8, nx: true, attackSoft: 50, rangeGround: 60 }),
  D(C.Submarine, 'kalvari', 'Kalvari-class (Scorpene)', 'IND', 2017, 2.4, 'French Scorpene built at MDL, 6 launched, MESMA AIP retrofit planned.', { cm: 0.8 }),
  D(C.Submarine, 'sindhughosh', 'Sindhughosh-class (Kilo 877)', 'IND', 1986, 1.8, 'Russian-built Kilo-class diesel submarines, Klub missiles.', { cm: 0.7 }),
  D(C.Amphibious, 'landing_ship_tank_ind', 'Magar / Shardul LST', 'IND', 1987, 1.4, 'Small LST for island/amphibious operations.', { cm: 0.5 }),
];

const IND_FUTURE: MilitaryDesign[] = [
  F(C.Fighter, 'ind_amca', 'AMCA Mk1/Mk2', 'IND', 2034, 3.3, 'tejas_mk1a', 2200, 'Indigenous 5th-gen twin-engine stealth medium fighter; Mk2 with GE F414/120 kN engine.', { cm: 0.8, nx: true, rangeKm: 1800, stealth: 0.5 }),
  F(C.Multirole, 'ind_tejas_mk2', 'Tejas Mk2 (MWF)', 'IND', 2031, 2.9, 'tejas_mk1a', 1200, 'Medium Weight Fighter with F414, AESA, canard-delta; 1,800 km range.', { cm: 0.75, rangeKm: 1100 }),
  F(C.Armor, 'ind_frcv', 'FRCV Future Ready Combat Vehicle', 'IND', 2032, 3.0, 't90s_bhishma', 1500, 'Next-generation Indian MBT, 3 crew, unmanned turret.', { cm: 0.75, nx: true }),
  F(C.Submarine, 'ind_p75i', 'Project-75I (Type 214-derived)', 'IND', 2031, 2.9, 'kalvari', 1200, 'Six AIP submarines built with TKMS Type 214 technology at MDL.', { cm: 0.8 }),
  F(C.Carrier, 'ind_iac2', 'IAC-2 Vishal Carrier', 'IND', 2035, 3.2, 'vikrant', 2600, '65,000 t CATOBAR carrier with EMALS, Rafale-M/AMCA-N.', { cm: 0.8, nx: true }),
  F(C.Submarine, 'ind_s5_ssbn', 'S5-class SSBN', 'IND', 2033, 2.8, 'arihant', 2000, '13,500 t SSBN with K-5 SLBM.', { cm: 0.85, nx: true, attackSoft: 70, rangeGround: 100 }),
  F(C.Submarine, 'ind_ssn', 'Project-77 SSN', 'IND', 2036, 2.9, 'arihant', 2400, 'Indigenous nuclear attack submarine.', { cm: 0.85, nx: true }),
  F(C.Drone, 'ind_ghatak', 'Ghatak UCAV', 'IND', 2032, 3.0, 'archer_ng', 1500, 'Stealthy flying-wing UCAV.', { cm: 0.7, nx: true }),
  F(C.Frigate, 'ind_p17b', 'Project 17B Frigate', 'IND', 2030, 2.9, 'nilgiri', 900, 'Follow-on stealth frigate with enhanced BrahMos-NG.', { cm: 0.75 }),
  F(C.Multirole, 'ind_tedbf', 'TEDBF Naval Fighter', 'IND', 2034, 3.0, 'tejas_mk2', 1700, 'Twin-engine deck-based fighter.', { cm: 0.8, nx: true }),
  F(C.MissileLauncher, 'ind_brahmos_ng', 'BrahMos-NG / BrahMos-II', 'IND', 2030, 3.3, 'brahmos', 1200, 'Compact supersonic (Mach 3.5+) missile, later hypersonic Mach 6-7 variant.', { cm: 0.8, nx: true, rangeGround: 10, rangeNaval: 10 }),
];

// =====================================================================
// PAKISTAN
// =====================================================================
const PAK: MilitaryDesign[] = [
  D(C.Armor, 'al_khalid', 'Al-Khalid (MBT-2000)', 'PAK', 2001, 2.1, 'Sino-Pakistani 48 t MBT with 125 mm gun; produced at HIT Taxila.', { cm: 0.6 }),
  D(C.Armor, 'al_khalid_2', 'Al-Khalid-II / Haider', 'PAK', 2020, 2.5, 'Improved with 1,300 hp engine and VT-4-style composite; Haider export version.', { cm: 0.6 }),
  D(C.Armor, 'al_zarrar', 'Al-Zarrar', 'PAK', 2004, 1.5, 'Upgraded Type 59 with 125 mm gun.', { cm: 0.5 }),
  D(C.Mechanized, 'talha_apc', 'Talha APC', 'PAK', 1990, 1.4, 'Pakistani-built M113 derivative.', { cm: 0.5 }),
  D(C.Mechanized, 'hamza_ifv', 'Hamza / Al-Hamza 6x6', 'PAK', 2020, 2.0, 'Wheeled IFV built by HIT.', { cm: 0.55, mobility: W }),
  D(C.RocketArtillery, 'fatah_1', 'Fatah-1/-2 Guided MRL', 'PAK', 2021, 2.7, '140/400 km guided rocket system with GPS guidance.', { cm: 0.6, rangeGround: 5 }),
  D(C.RocketArtillery, 'a100e', 'A-100E / SH-15 Type 300 mm', 'CHN', 2015, 2.5, 'Chinese 300 mm 8-tube MRL.', { cm: 0.6, rangeGround: 3 }),
  D(C.Artillery, 'sh15', 'SH-15 155 mm', 'CHN', 2019, 2.6, 'Chinese truck-mounted 155 mm howitzer purchased by Pakistan.', { cm: 0.55 }),
  D(C.MissileLauncher, 'babur', 'Babur (Hatf-7) GLCM', 'PAK', 2010, 2.3, 'Subsonic ground-launched cruise missile, 700 km; Babur-1B ship-launched.', { cm: 0.6, rangeGround: 14, rangeNaval: 14 }),
  D(C.MissileLauncher, 'shaheen_iii', 'Shaheen-III', 'PAK', 2015, 2.6, 'Solid-fuel MRBM, 2,750 km.', { cm: 0.7, nx: true, rangeGround: 55, rangeNaval: 55 }),
  D(C.MissileLauncher, 'ababeel', 'Ababeel MIRV', 'PAK', 2017, 2.8, 'MRBM with MIRV, 2,200 km.', { cm: 0.75, nx: true, rangeGround: 44, rangeNaval: 44 }),
  D(C.MissileLauncher, 'nasr', 'Nasr (Hatf-IX)', 'PAK', 2013, 2.1, 'Tactical nuclear-capable SRBM, 70 km on MBRL chassis.', { cm: 0.6, nx: true, rangeGround: 2 }),
  D(C.MissileLauncher, 'ghauri', 'Ghauri-I/II', 'PAK', 2003, 1.7, 'Liquid-fuel MRBM, 1,500 km.', { cm: 0.6, nx: true, rangeGround: 30 }),
  D(C.Infantry, 'pak_infantry', 'Pakistan Army Infantry Battalion', 'PAK', 2015, 1.9, 'Standard infantry battalion, G3/Type 56.', { cm: 0.4 }),
  D(C.SpecialForces, 'pak_ssg', 'SSG Commando Battalion', 'PAK', 2010, 2.4, 'Special Service Group, elite.', { cm: 0.6 }),
  D(C.Multirole, 'jf17_block3', 'JF-17 Thunder Block III', 'PAK', 2020, 2.5, 'Co-developed PAC/CAC lightweight multirole with KLJ-7A AESA and PL-15.', { cm: 0.55, rangeKm: 1000 }),
  D(C.Multirole, 'jf17_block2', 'JF-17 Thunder Block II', 'PAK', 2015, 2.1, 'Block II with in-flight refuelling and improved avionics.', { cm: 0.5, rangeKm: 900 }),
  D(C.Strike, 'k8_karakoram', 'K-8 Karakorum', 'PAK', 2000, 1.3, 'Jet trainer / light attack aircraft.', { cm: 0.35, rangeKm: 800 }),
  D(C.Drone, 'shahpar_2', 'Shahpar-II', 'PAK', 2021, 1.9, 'Domestic MALE UAV with laser-guided munitions.', { cm: 0.45 }),
  D(C.Drone, 'burraq', 'Burraq UCAV', 'PAK', 2015, 1.5, 'Armed UCAV with Barq missile.', { cm: 0.4 }),
  D(C.Frigate, 'babur_class', 'Babur-class (Ada-class MILGEM)', 'PAK', 2023, 2.6, 'Turkish MILGEM corvette/frigate for Pakistan Navy, ~3,000 t.', { cm: 0.7 }),
  D(C.Frigate, 'zulfiquar_f22p', 'Zulfiquar-class (F-22P)', 'CHN', 2009, 2.1, 'Chinese-built Type 053H3 derivative frigates.', { cm: 0.6 }),
  D(C.Submarine, 'hangor', 'Hangor-class', 'PAK', 2023, 2.5, 'Type 039B derived AIP submarine; assembled in Karachi.', { cm: 0.6 }),
  D(C.PatrolBoat, 'azmat', 'Azmat-class FAC', 'PAK', 2010, 1.8, 'Fast attack craft with C-802.', { cm: 0.5 }),
];
const PAK_FUTURE: MilitaryDesign[] = [
  F(C.Multirole, 'pak_jf17_block4', 'JF-17 Block IV / PFX', 'PAK', 2031, 2.9, 'jf17_block3', 900, 'Upgraded JF-17 with AESA and Chinese engine; PFX 4.5-gen.', { cm: 0.6, rangeKm: 1100 }),
  F(C.Multirole, 'pak_j35e', 'Pakistani Stealth Fighter (J-35E)', 'PAK', 2032, 3.0, 'jf17_block3', 1800, 'Planned procurement of 40 fifth-generation fighters from China.', { cm: 0.8, nx: true, stealth: 0.5 }),
  F(C.Submarine, 'pak_hangor_2', 'Hangor Batch 2 (VLS)', 'PAK', 2031, 2.8, 'hangor', 900, 'Improved Hangor with VLS cruise missiles.', { cm: 0.65 }),
  F(C.MissileLauncher, 'pak_ababeel_2', 'Ababeel-2 / Shaheen-IV', 'PAK', 2031, 3.0, 'ababeel', 1200, 'Extended range MRBM 3,500 km.', { cm: 0.8, nx: true, rangeGround: 70, rangeNaval: 70 }),
];

// =====================================================================
// JAPAN
// =====================================================================
const JPN: MilitaryDesign[] = [
  D(C.Armor, 'type_10', 'Type 10 (Hitomaru)', 'JPN', 2012, 3.0, '44 t MBT with 120 mm smoothbore, hydropneumatic suspension, network-centric C4I.', { cm: 1.0, nx: true }),
  D(C.Armor, 'type_90', 'Type 90 Kyunmaru', 'JPN', 1990, 2.3, '50 t MBT, licence-built Rheinmetall 120 mm.', { cm: 0.9, nx: true }),
  D(C.Armor, 'type_16_mcv', 'Type 16 Manoeuvre Combat Vehicle', 'JPN', 2016, 2.4, '8x8 wheeled tank destroyer with 105 mm rifled gun, 26 t.', { cm: 0.9, mobility: W }),
  D(C.Mechanized, 'type_89_ifv', 'Type 89 IFV', 'JPN', 1989, 2.0, '27 t tracked IFV with 35 mm cannon and ATGMs.', { cm: 0.9 }),
  D(C.Mechanized, 'type_96_wheeled_apc', 'Type 96 Wheeled APC', 'JPN', 1996, 1.7, '8x8 wheeled APC.', { cm: 0.9, mobility: W }),
  D(C.Mechanized, 'type_24_ifv', 'AMV / Type 24 8x8 (Patria AMV)', 'JPN', 2023, 2.4, 'New 8x8 IFV built by Komatsu under licence.', { cm: 1.0, mobility: W }),
  D(C.Recon, 'type_87_rcv', 'Type 87 Reconnaissance Vehicle', 'JPN', 1987, 2.0, '6x6 recon vehicle with 25 mm cannon.', { cm: 0.9 }),
  D(C.Artillery, 'type_19', 'Type 19 Wheeled 155 mm SPH', 'JPN', 2019, 2.7, '8x8 155 mm/52 cal SP howitzer, 30 t, range 30+ km.', { cm: 1.0, mobility: W, armor: 'soft' }),
  D(C.Artillery, 'type_99_sph', 'Type 99 155 mm SPH', 'JPN', 1999, 2.3, 'Tracked 155 mm/30 cal SPH.', { cm: 0.9 }),
  D(C.Artillery, 'fh70', 'FH-70 155 mm', 'JPN', 1983, 1.3, 'Towed 155 mm howitzer.', { cm: 0.8 }),
  D(C.RocketArtillery, 'type_75_mlrs', 'Type 75 130 mm SP MRL / M270', 'JPN', 2000, 2.0, 'Licence M270 MLRS and Type 75.', { cm: 0.9 }),
  D(C.AirDefense, 'type_03_chusam', 'Type 03 Chu-SAM Kai', 'JPN', 2003, 2.6, 'Medium-range SAM, 50 km, phased array radar.', { cm: 1.0, rangeAir: 2 }),
  D(C.AirDefense, 'type_81_tansam', 'Type 81 Tan-SAM / Type 93', 'JPN', 1981, 1.8, 'Short-range SAM.', { cm: 0.9, rangeAir: 1 }),
  D(C.AirDefense, 'type_87_spaag', 'Type 87 SPAAG', 'JPN', 1987, 1.6, 'Twin 35 mm SPAAG.', { cm: 0.8, mobility: TR, rangeAir: 1 }),
  D(C.MissileLauncher, 'type_12_ssm', 'Type 12 SSM', 'JPN', 2012, 2.8, 'Land-based anti-ship missile, 200 km.', { cm: 0.9, nx: true, rangeGround: 4, rangeNaval: 4 }),
  D(C.MissileLauncher, 'type_12_upgraded', 'Upgraded Type 12 SSM', 'JPN', 2026, 3.1, '1,000 km stand-off variant ("counterstrike").', { cm: 1.0, nx: true, rangeGround: 20, rangeNaval: 20 }),
  D(C.MissileLauncher, 'type_88_ssm', 'Type 88 SSM', 'JPN', 1988, 2.0, 'Coastal defence SSM.', { cm: 0.85, rangeNaval: 3 }),
  D(C.Infantry, 'jpn_infantry', 'JGSDF Infantry Regiment Battalion', 'JPN', 2015, 2.4, 'Type 20 rifle infantry battalion.', { cm: 0.9 }),
  D(C.SpecialForces, 'jpn_ardb', 'Amphibious Rapid Deployment Brigade Battalion', 'JPN', 2018, 2.6, 'Marine-equivalent JGSDF ARDB.', { cm: 0.9 }),
  D(C.SpecialForces, 'jpn_sfgp', 'Special Forces Group', 'JPN', 2010, 2.5, 'JGSDF special forces.', { cm: 0.9 }),
  D(C.Engineers, 'jpn_engineers', 'JGSDF Engineer Battalion', 'JPN', 2015, 2.3, 'Combat and disaster-relief engineer battalion.', { cm: 0.9 }),
  D(C.Multirole, 'f2', 'Mitsubishi F-2A/B', 'JPN', 2000, 2.3, 'Enlarged F-16 derivative with AESA and 4x ASM-2 anti-ship missiles.', { cm: 1.0, nx: true, rangeKm: 1000 }),
  D(C.Fighter, 'f15j_kai', 'F-15J Kai (MSIP)', 'JPN', 1982, 2.4, 'Upgraded F-15J with J/APG-1 AESA, JM-1 missile; ~98 modernised.', { cm: 1.0, nx: true, rangeKm: 1300 }),
  D(C.Strike, 'p1_mpa', 'Kawasaki P-1', 'JPN', 2013, 2.5, 'Indigenous maritime patrol aircraft, ASW, ASuW.', { cm: 1.0, nx: true, rangeKm: 2500, attackSub: 50, attackNaval: 60 }),
  D(C.AirTransport, 'c2', 'Kawasaki C-2', 'JPN', 2016, 2.7, 'Strategic transport, 37 t payload.', { cm: 1.0, rangeKm: 4500 }),
  D(C.Helicopter, 'ah1s_cobra', 'AH-1S Cobra Kai', 'JPN', 1982, 1.6, 'JGSDF attack helicopter (declining).', { cm: 0.9 }),
  D(C.AirTransport, 'uh2', 'Subaru UH-2', 'JPN', 2022, 2.2, 'Utility helicopter derived from Bell 412EPX.', { cm: 0.9, rangeKm: 600, speedKmh: 260 }),
  D(C.Carrier, 'izumo', 'JS Izumo (DDH-183)', 'JPN', 2015, 2.4, 'Helicopter destroyer converted to F-35B carrier, 27,000 t.', { cm: 0.35, nx: true, personnel: 470 }),
  D(C.Carrier, 'kaga', 'JS Kaga (DDH-184)', 'JPN', 2017, 2.4, 'Izumo-class sister ship, refit to carry F-35B.', { cm: 0.35, nx: true, personnel: 470 }),
  D(C.Cruiser, 'atago_class', 'Atago-class', 'JPN', 2007, 2.8, '10,000 t Aegis destroyer, BMD capable SM-3/SM-6.', { cm: 0.75, nx: true, rangeNaval: 4 }),
  D(C.Cruiser, 'kongo_class', 'Kongo-class', 'JPN', 1993, 2.5, '9,500 t Aegis destroyer, BMD role.', { cm: 0.7, nx: true }),
  D(C.Destroyer, 'maya_class', 'Maya-class (27DDG)', 'JPN', 2020, 3.1, '10,250 t Aegis system-equipped with Cooperative Engagement Capability, SM-6.', { cm: 0.8, nx: true }),
  D(C.Destroyer, 'akizuki_class', 'Akizuki-class', 'JPN', 2012, 2.6, '6,800 t destroyer, ESSM, Type 90 SSM.', { cm: 0.8, nx: true }),
  D(C.Destroyer, 'asahi_class', 'Asahi-class (DD-119)', 'JPN', 2018, 2.7, '5,000 t ASW destroyer.', { cm: 0.8, nx: true }),
  D(C.Destroyer, 'takanami_class', 'Takanami-class', 'JPN', 2003, 2.2, '4,650 t destroyer.', { cm: 0.75 }),
  D(C.Frigate, 'mogami_class', 'Mogami-class (FFM)', 'JPN', 2022, 2.7, '5,500 t multi-mission stealth frigate, 90 crew, mine warfare capable.', { cm: 0.75, nx: true, personnel: 90 }),
  D(C.Frigate, 'abukuma_class', 'Abukuma-class', 'JPN', 1989, 1.8, '2,550 t escort destroyer.', { cm: 0.75 }),
  D(C.Submarine, 'taigei_class', 'Taigei-class SS', 'JPN', 2022, 3.0, '3,000 t diesel-electric submarine with Li-ion batteries.', { cm: 0.85, nx: true }),
  D(C.Submarine, 'soryu_class', 'Soryu-class SS', 'JPN', 2009, 2.8, '4,200 t AIP submarine, Stirling and Li-ion (SS-510+).', { cm: 0.85, nx: true }),
  D(C.Submarine, 'oyashio_class', 'Oyashio-class', 'JPN', 1998, 2.2, 'Diesel-electric attack submarine.', { cm: 0.8 }),
  D(C.Amphibious, 'osumi_class', 'Osumi-class LST', 'JPN', 1998, 2.1, '14,000 t tank landing ship.', { cm: 0.8, nx: true }),
  D(C.PatrolBoat, 'hayabusa_class', 'Hayabusa-class', 'JPN', 2002, 2.0, '240 t missile boat with SSM-1B.', { cm: 0.8 }),
];
const JPN_FUTURE: MilitaryDesign[] = [
  F(C.Fighter, 'jpn_gcap', 'GCAP (Japan share) F-X', 'JPN', 2035, 3.7, 'f2', 3500, 'Global Combat Air Programme sixth-gen fighter with UK/Italy; Mitsubishi lead for Japan.', { cm: 0.9, nx: true, rangeKm: 2000, stealth: 0.75 }),
  F(C.Destroyer, 'jpn_13ddx', '13DDX Next-Gen Destroyer', 'JPN', 2032, 3.4, 'maya_class', 2500, 'Future Aegis destroyer with railgun and directed-energy weapons.', { cm: 0.9, nx: true }),
  F(C.Submarine, 'jpn_new_ssk', '29SS Next Submarine', 'JPN', 2031, 3.2, 'taigei_class', 1800, 'Successor to Taigei with VLS cruise missiles.', { cm: 0.9, nx: true }),
  F(C.MissileLauncher, 'jpn_hvgp', 'HVGP Hyper Velocity Gliding Projectile', 'JPN', 2030, 3.3, 'type_12_upgraded', 1500, 'Island defence hypersonic glide weapon.', { cm: 0.95, nx: true, rangeGround: 15, rangeNaval: 15 }),
  F(C.Frigate, 'jpn_30dx', '30DX Frigate', 'JPN', 2030, 2.9, 'mogami_class', 1000, 'Upgraded Mogami with more VLS.', { cm: 0.85, nx: true }),
  F(C.Drone, 'jpn_wingman', 'Japanese Loyal Wingman', 'JPN', 2032, 3.0, 'f2', 1600, 'Unmanned combat aircraft teaming with GCAP.', { cm: 0.8, nx: true }),
];

// =====================================================================
// SOUTH KOREA
// =====================================================================
const KOR: MilitaryDesign[] = [
  D(C.Armor, 'k2_black_panther', 'K2 Black Panther', 'KOR', 2014, 3.1, '55 t MBT with 120 mm L55 gun, KAPS APS, hydropneumatic suspension; exported to Poland.', { cm: 0.8 }),
  D(C.Armor, 'k1a2', 'K1A2', 'KOR', 2013, 2.3, 'Upgraded K1 MBT with 120 mm gun.', { cm: 0.8 }),
  D(C.Armor, 'k1a1', 'K1A1', 'KOR', 1999, 1.8, 'K1 with 120 mm gun.', { cm: 0.75 }),
  D(C.Mechanized, 'k21_ifv', 'K21 IFV', 'KOR', 2009, 2.6, 'Amphibious IFV with 40 mm cannon and composite hull, 25 t.', { cm: 0.75 }),
  D(C.Mechanized, 'k200a1', 'K200A1 KIFV', 'KOR', 1985, 1.8, 'Tracked APC.', { cm: 0.75 }),
  D(C.Mechanized, 'k808', 'K808 White Tiger 8x8', 'KOR', 2016, 2.0, 'Wheeled APC/IFV.', { cm: 0.75, mobility: W }),
  D(C.Artillery, 'k9_thunder', 'K9 Thunder / K9A1 / A2', 'KOR', 1999, 2.8, '155 mm/52 cal SPH, 47 t, 40 km range; exported to Poland, Turkey, India, Finland, Norway, Australia.', { cm: 0.7 }),
  D(C.Artillery, 'k55a1', 'K55A1 SPH', 'KOR', 1990, 1.7, '155 mm/39 SPH derived from M109.', { cm: 0.7 }),
  D(C.RocketArtillery, 'chunmoo', 'K239 Chunmoo', 'KOR', 2015, 3.0, 'Guided MRL with 130/239 mm rockets and 290 km KTSSM; Poland, UAE, Norway export.', { cm: 0.7, rangeGround: 6 }),
  D(C.AirDefense, 'km_sam', 'KM-SAM Cheongung II', 'KOR', 2018, 2.9, 'Medium-range SAM with hit-to-kill, 40 km; exports to Iraq, UAE, Saudi (M-SAM).', { cm: 0.8, rangeAir: 3 }),
  D(C.AirDefense, 'chunma', 'K30 Biho / Chunma', 'KOR', 1999, 2.2, 'Tracked SPAAG with Chiron missiles.', { cm: 0.7, mobility: TR, rangeAir: 1 }),
  D(C.MissileLauncher, 'hyunmoo_2', 'Hyunmoo-2', 'KOR', 2009, 2.6, 'SRBM 800 km, 500 kg warhead.', { cm: 0.75, rangeGround: 16 }),
  D(C.MissileLauncher, 'hyunmoo_3', 'Hyunmoo-3', 'KOR', 2010, 2.3, 'Ground-launched cruise missile, 1,500 km.', { cm: 0.7, rangeGround: 30 }),
  D(C.MissileLauncher, 'hyunmoo_5', 'Hyunmoo-5 Monster Missile', 'KOR', 2025, 3.1, 'Bunker-buster ballistic missile with 8 t warhead.', { cm: 0.85, nx: true, rangeGround: 6 }),
  D(C.Infantry, 'kor_infantry', 'ROK Army Infantry Battalion', 'KOR', 2015, 2.3, 'K2C1 rifle, 30 K-9 brigades.', { cm: 0.6 }),
  D(C.SpecialForces, 'kor_sof', 'ROK Special Warfare Battalion', 'KOR', 2010, 2.6, 'ROK special forces command.', { cm: 0.6 }),
  D(C.SpecialForces, 'kor_marine', 'ROK Marine Corps Battalion', 'KOR', 2015, 2.4, 'Marine infantry with KAAV.', { cm: 0.6 }),
  D(C.Engineers, 'kor_engineers', 'ROK Combat Engineers', 'KOR', 2010, 2.2, 'Engineer battalion.', { cm: 0.6 }),
  D(C.Multirole, 'kf21_boramae', 'KF-21 Boramae Block 1', 'KOR', 2026, 3.0, '4.5-gen fighter with AESA; Indonesia 20% partner.', { cm: 0.75, rangeKm: 1300 }),
  D(C.Multirole, 'fa50', 'FA-50 Fighting Eagle', 'KOR', 2013, 2.3, 'Light multirole fighter derived from T-50; exported to Poland, Philippines, Malaysia.', { cm: 0.6, rangeKm: 900 }),
  D(C.Multirole, 'fa50_block20', 'FA-50 Block 20 / FA-50PL', 'KOR', 2024, 2.5, 'Improved FA-50 with AESA and AIM-120.', { cm: 0.65, rangeKm: 900 }),
  D(C.Helicopter, 'lah_marineon', 'KAI LAH / Marineon', 'KOR', 2022, 2.3, 'Light armed helicopter.', { cm: 0.7 }),
  D(C.AirTransport, 'kuh1_surion', 'KAI KUH-1 Surion', 'KOR', 2012, 2.2, 'Utility helicopter; Marineon variant.', { cm: 0.7, rangeKm: 600, speedKmh: 260 }),
  D(C.Drone, 'kus_x', 'KUS-FC / Korean MALE UAV', 'KOR', 2024, 2.2, 'KAI medium altitude UAV.', { cm: 0.6 }),
  D(C.Cruiser, 'kdx3', 'Sejong the Great-class (KDX-III)', 'KOR', 2008, 2.9, '10,000 t Aegis destroyer with 128 VLS cells (Hyunmoo-3, SM-2, SM-6).', { cm: 0.75, nx: true }),
  D(C.Destroyer, 'kdx3_batch2', 'Jeongjo the Great (KDX-III Batch II)', 'KOR', 2029, 3.2, 'Upgraded Aegis destroyer with SM-3 BMD.', { cm: 0.8, nx: true }),
  D(C.Destroyer, 'kdx2', 'Chungmugong Yi Sun-sin-class (KDX-II)', 'KOR', 2003, 2.4, '5,500 t destroyer.', { cm: 0.75 }),
  D(C.Destroyer, 'kdx1', 'Gwanggaeto the Great-class (KDX-I)', 'KOR', 1998, 2.0, '3,900 t destroyer.', { cm: 0.7 }),
  D(C.Frigate, 'incheon', 'Incheon-class FFX', 'KOR', 2013, 2.3, '2,300 t frigate.', { cm: 0.7 }),
  D(C.Frigate, 'daegu_ffx2', 'Daegu-class FFX-II', 'KOR', 2018, 2.5, '2,800 t frigate.', { cm: 0.7 }),
  D(C.Frigate, 'chungnam_ffx3', 'Chungnam-class FFX-III', 'KOR', 2024, 2.8, '3,600 t frigate with VLS.', { cm: 0.75 }),
  D(C.Frigate, 'ulsan_ff', 'Ulsan-class', 'KOR', 1981, 1.7, '2,300 t frigate.', { cm: 0.65 }),
  D(C.Submarine, 'dosan_ahn_changho', 'Dosan Ahn Changho-class (KSS-III)', 'KOR', 2021, 2.9, '3,400 t AIP submarine with 6 VLS SLBM cells; batch II 10 cells.', { cm: 0.8, nx: true }),
  D(C.Submarine, 'son_won_il', 'Son Won-il-class (KSS-II)', 'KOR', 2007, 2.4, 'Type 214 licence-built.', { cm: 0.8 }),
  D(C.Submarine, 'chang_bogo', 'Chang Bogo-class (KSS-I)', 'KOR', 1993, 1.8, 'Type 209/1200.', { cm: 0.7 }),
  D(C.Amphibious, 'dokdo_class', 'Dokdo-class LPH', 'KOR', 2007, 2.4, '14,000 t amphibious assault ship, helicopter carrier.', { cm: 0.7, nx: true }),
  D(C.PatrolBoat, 'yoon_youngha', 'Yoon Youngha-class PKG', 'KOR', 2008, 2.4, '570 t missile patrol vessel.', { cm: 0.7 }),
];
const KOR_FUTURE: MilitaryDesign[] = [
  F(C.Multirole, 'kor_kf21_block2', 'KF-21 Block 2', 'KOR', 2029, 3.3, 'kf21_boramae', 1300, 'Ground-attack block with additional bays and weapons.', { cm: 0.8, rangeKm: 1400 }),
  F(C.Multirole, 'kor_kf21_block3', 'KF-21 Block 3 / KF-21EX', 'KOR', 2032, 3.5, 'kor_kf21_block2', 1600, 'Stealth-shaped EX with internal weapons bay.', { cm: 0.85, nx: true, stealth: 0.5 }),
  F(C.Armor, 'kor_k3', 'K3 Next-Gen Tank', 'KOR', 2035, 3.4, 'k2_black_panther', 2000, 'Unmanned turret 130 mm, APS, hybrid drive.', { cm: 0.85, nx: true }),
  F(C.Carrier, 'kor_cvx', 'CVX Light Carrier', 'KOR', 2036, 3.0, 'dokdo_class', 2200, '40,000 t STOVL carrier for KF-21/F-35B.', { cm: 0.7, nx: true }),
  F(C.AirDefense, 'kor_lsam', 'L-SAM Long-range SAM (Block 2)', 'KOR', 2029, 3.3, 'km_sam', 1300, 'Long-range SAM/ABM with hypersonic interceptor.', { cm: 0.85, nx: true, rangeAir: 8 }),
  F(C.Submarine, 'kor_kss_iv', 'KSS-IV / SSN Program', 'KOR', 2035, 3.2, 'dosan_ahn_changho', 2000, 'Nuclear-powered submarine.', { cm: 0.9, nx: true }),
  F(C.MissileLauncher, 'kor_hyunmoo_6', 'Hyunmoo-VI', 'KOR', 2032, 3.3, 'hyunmoo_5', 1400, 'Hypersonic conventional ballistic missile.', { cm: 0.9, nx: true, rangeGround: 24 }),
];

// =====================================================================
// NORTH KOREA
// =====================================================================
const PRK: MilitaryDesign[] = [
  D(C.Armor, 'chonma_216', 'Chonma-216 (M2020)', 'PRK', 2020, 1.9, 'Modernised tank with ERA, 125 mm gun, APS trials.', { cm: 0.4, nx: true }),
  D(C.Armor, 'pokpung_ho', 'Pokpung-ho', 'PRK', 1992, 1.7, 'T-72-derived MBT with 115/125 mm.', { cm: 0.4 }),
  D(C.Armor, 'chonma_ho', 'Chonma-ho', 'PRK', 1980, 1.2, 'T-62-derived NK MBT.', { cm: 0.35 }),
  D(C.Mechanized, 'vtt323', 'VTT-323 / Type 63 APC', 'PRK', 1985, 1.2, 'APC widely used by NKPA.', { cm: 0.35 }),
  D(C.Artillery, 'koksan_170', 'M1978/89 Koksan 170 mm', 'PRK', 1978, 1.5, '170 mm SP gun, 40-60 km range, threatens Seoul.', { cm: 0.35, mobility: TR }),
  D(C.Artillery, 'm1991_sph', 'M-1991 SPH 152 mm', 'PRK', 1991, 1.5, 'Domestic SPH.', { cm: 0.35 }),
  D(C.RocketArtillery, 'm1991_240', 'M-1991 240 mm MRL', 'PRK', 1991, 1.4, '12-tube 240 mm MRL, 60 km.', { cm: 0.35 }),
  D(C.RocketArtillery, 'kn25', 'KN-25 600 mm SRBM-MRL', 'PRK', 2019, 2.6, 'Super-large MRL, 400 km, guided rockets, tactical nuclear.', { cm: 0.5, nx: true, rangeGround: 8 }),
  D(C.RocketArtillery, 'm1985_mrl', 'Type 63 / M1985 107/122 mm MRL', 'PRK', 1985, 1.1, 'Numerous towed and truck MRL.', { cm: 0.3 }),
  D(C.MissileLauncher, 'kn23', 'Hwasong-11 (KN-23/24)', 'PRK', 2019, 2.4, 'Iskander-like SRBM, 600-800 km, quasi-ballistic.', { cm: 0.5, nx: true, rangeGround: 14 }),
  D(C.MissileLauncher, 'hwasong_12', 'Hwasong-12/-16 IRBM', 'PRK', 2017, 2.2, 'IRBM, 4,500 km.', { cm: 0.6, nx: true, rangeGround: 90, rangeNaval: 90 }),
  D(C.MissileLauncher, 'hwasong_15', 'Hwasong-15', 'PRK', 2017, 2.3, 'Liquid-fuel ICBM, 13,000 km.', { cm: 0.7, nx: true, rangeGround: 200, rangeNaval: 200 }),
  D(C.MissileLauncher, 'hwasong_17', 'Hwasong-17', 'PRK', 2022, 2.5, '11-axle TEL liquid ICBM, MIRV concept.', { cm: 0.75, nx: true, rangeGround: 200, rangeNaval: 200 }),
  D(C.MissileLauncher, 'hwasong_18', 'Hwasong-18 / -19', 'PRK', 2023, 2.7, 'Solid-fuel ICBM, TEL-launched, 15,000 km.', { cm: 0.8, nx: true, rangeGround: 200, rangeNaval: 200 }),
  D(C.MissileLauncher, 'hwasal_2', 'Hwasal-2 / Pulhwasal-3 Cruise Missile', 'PRK', 2023, 2.2, 'Cruise missile, 2,000 km.', { cm: 0.5, rangeGround: 40 }),
  D(C.AirDefense, 'kn06', 'KN-06 / Pongae-5', 'PRK', 2012, 2.0, 'S-300-inspired SAM, 150 km.', { cm: 0.5, rangeAir: 3 }),
  D(C.AirDefense, 'pongae_sam_old', 'Kumsong-3 / SA-3/SA-2', 'PRK', 1970, 1.1, 'Legacy SAM.', { cm: 0.3, rangeAir: 2 }),
  D(C.Infantry, 'prk_infantry', 'KPA Infantry Battalion', 'PRK', 1990, 1.4, 'Conscript light infantry.', { cm: 0.25 }),
  D(C.SpecialForces, 'prk_sof', 'KPA Special Operations Battalion', 'PRK', 2015, 2.3, 'Elite Reconnaissance General Bureau troops, Storm Corps.', { cm: 0.4 }),
  D(C.Engineers, 'prk_engineers', 'KPA Engineer Battalion', 'PRK', 1990, 1.5, 'Tunnel and fortification specialists.', { cm: 0.3 }),
  D(C.Helicopter, 'mi2_kpa', 'Mi-2 / MD-500 KPA Helicopters', 'PRK', 1985, 1.2, 'Obsolete attack helicopters.', { cm: 0.3 }),
  D(C.Drone, 'saetbyol_4', 'Saetbyol-4/-9', 'PRK', 2023, 1.8, 'MALE ISR drones copying Global Hawk / Reaper.', { cm: 0.4 }),
  D(C.Drone, 'kumsong_mohajer', 'Kumsong-series suicide drones', 'PRK', 2024, 1.9, 'Loitering munitions.', { cm: 0.3 }),
  D(C.Destroyer, 'choe_hyon', 'Choe Hyon-class Destroyer', 'PRK', 2025, 2.6, '5,000 t destroyer with 74 VLS cells.', { cm: 0.5, nx: true }),
  D(C.Frigate, 'amnok_class', 'Amnok-class', 'PRK', 2021, 1.5, 'Small frigate.', { cm: 0.4 }),
  D(C.Frigate, 'najin_class', 'Najin-class', 'PRK', 1972, 1.0, 'Old frigate.', { cm: 0.3 }),
  D(C.Submarine, 'sinpo_c', 'Sinpo-C / Hero Kim Kun Ok', 'PRK', 2023, 1.9, 'Ballistic missile submarine with Pukguksong SLBMs.', { cm: 0.5, nx: true, attackSoft: 40 }),
  D(C.Submarine, 'sang_o', 'Sang-O class', 'PRK', 1996, 1.3, 'Small coastal submarine.', { cm: 0.3 }),
  D(C.PatrolBoat, 'nongo_class', 'Nongo-class / Soho / Komar', 'PRK', 1970, 1.4, 'Fast attack craft.', { cm: 0.3 }),
  D(C.AirTransport, 'an2_kpaaf', 'An-2 Colt / Il-76', 'PRK', 1970, 1.0, 'Biplane transports for special ops.', { cm: 0.3, rangeKm: 800, speedKmh: 200 }),
];
const PRK_FUTURE: MilitaryDesign[] = [
  F(C.MissileLauncher, 'prk_hwasong_20', 'Hwasong-20 MIRV ICBM', 'PRK', 2029, 3.0, 'hwasong_18', 900, 'New solid ICBM with MIRV.', { cm: 0.85, nx: true, rangeGround: 200, rangeNaval: 200 }),
  F(C.Submarine, 'prk_ssbn', 'Hero Kim Kun Ok Nuclear Sub', 'PRK', 2030, 2.5, 'sinpo_c', 900, 'Planned nuclear-powered submarine.', { cm: 0.7, nx: true }),
  F(C.Destroyer, 'prk_choe_hyon_2', 'Choe Hyon batch 2', 'PRK', 2029, 2.9, 'choe_hyon', 500, 'Follow-on destroyers.', { cm: 0.55, nx: true }),
];

// =====================================================================
// TAIWAN
// =====================================================================
const TWN: MilitaryDesign[] = [
  D(C.Armor, 'cm11_brave_tiger', 'CM-11 Brave Tiger', 'TWN', 1990, 1.6, 'M48H/M60A3 hybrid with 105 mm gun.', { cm: 0.7 }),
  D(C.Mechanized, 'cm32_clouded_leopard', 'CM-32 Yunpao (Clouded Leopard)', 'TWN', 2008, 2.2, '8x8 wheeled IFV/APC, 30 mm cannon; main mechanised platform.', { cm: 0.7, mobility: W }),
  D(C.Mechanized, 'cm34', 'CM-34 Yunpao (30 mm)', 'TWN', 2020, 2.3, 'CM-32 variant with 30 mm turret.', { cm: 0.7, mobility: W }),
  D(C.Artillery, 'zuni_155', 'Mobile 155 mm SPH (Lei-Ting)', 'TWN', 2018, 2.0, 'Truck-mounted 155 mm self-propelled howitzer.', { cm: 0.7 }),
  D(C.RocketArtillery, 'thunderbolt_2000', 'Thunderbolt-2000 (Lei Ting)', 'TWN', 2005, 2.2, '117 mm MRL on CM-32 chassis.', { cm: 0.7 }),
  D(C.RocketArtillery, 'kung_feng_vi', 'Kung Feng VI', 'TWN', 2008, 2.2, '117 mm MRL.', { cm: 0.7 }),
  D(C.AirDefense, 'tien_kung_iv', 'Tien Kung IV (TK-4)', 'TWN', 2023, 2.9, 'Long-range SAM with anti-ballistic capability, 200 km.', { cm: 0.8, rangeAir: 4 }),
  D(C.AirDefense, 'tien_kung_iii', 'Tien Kung III (TK-3)', 'TWN', 2015, 2.6, 'Long-range SAM, 100+ km.', { cm: 0.8, rangeAir: 3 }),
  D(C.AirDefense, 'tien_chien_ii', 'Tien Chien II / Antelope', 'TWN', 2000, 2.0, 'Medium-range SAM.', { cm: 0.7, rangeAir: 2 }),
  D(C.MissileLauncher, 'hsiung_feng_ii', 'Hsiung Feng II', 'TWN', 1998, 2.2, 'Subsonic anti-ship missile, 150 km.', { cm: 0.7, rangeGround: 3, rangeNaval: 3 }),
  D(C.MissileLauncher, 'hsiung_feng_iii', 'Hsiung Feng III', 'TWN', 2007, 2.7, 'Supersonic Mach 2+ ASM/LACM, 150-400 km.', { cm: 0.75, rangeGround: 8, rangeNaval: 8 }),
  D(C.MissileLauncher, 'hsiung_feng_iie', 'Hsiung Feng IIE', 'TWN', 2013, 2.5, 'Land-attack cruise missile, 600-1,200 km.', { cm: 0.75, nx: true, rangeGround: 20 }),
  D(C.MissileLauncher, 'tien_ma', 'Tien Ma / Ching Tien', 'TWN', 2021, 2.6, 'Ballistic/cruise missile developed by NCSIST.', { cm: 0.75, nx: true, rangeGround: 24 }),
  D(C.Infantry, 'twn_infantry', 'ROC Army Infantry Battalion', 'TWN', 2020, 2.1, 'T91 rifle infantry.', { cm: 0.6 }),
  D(C.SpecialForces, 'twn_marine', 'ROC Marine Corps Battalion', 'TWN', 2015, 2.3, 'Marine brigades with AAV7.', { cm: 0.6 }),
  D(C.SpecialForces, 'twn_sof', 'ROC Special Forces Battalion', 'TWN', 2015, 2.4, 'Airborne special forces.', { cm: 0.6 }),
  D(C.Multirole, 'ching_kuo', 'AIDC F-CK-1C/D Ching-kuo', 'TWN', 1994, 1.9, 'Indigenous lightweight multirole fighter, Hsiung Feng II capable.', { cm: 0.7, nx: true }),
  D(C.Strike, 'at3_tzu_chiang', 'AT-3 Tzu-chiang', 'TWN', 1984, 1.4, 'Trainer/light attack jet.', { cm: 0.4 }),
  D(C.Drone, 'chien_hsiang', 'Chien Hsiang Loitering Drone', 'TWN', 2020, 2.0, 'Anti-radiation loitering munition.', { cm: 0.6 }),
  D(C.Drone, 'albatross_uav', 'Cardinal/Albatross-class UAV', 'TWN', 2021, 1.9, 'MALE surveillance UAV.', { cm: 0.6 }),
  D(C.Frigate, 'kang_ding', 'Kang Ding-class', 'TWN', 1996, 2.0, '3,600 t La Fayette-class frigate.', { cm: 0.7 }),
  D(C.Frigate, 'cheng_kung', 'Cheng Kung-class', 'TWN', 1993, 1.9, '4,100 t Perry-class derived frigate.', { cm: 0.7 }),
  D(C.Frigate, 'tuo_chiang', 'Tuo Chiang-class Corvette', 'TWN', 2014, 2.4, '600 t stealth catamaran corvette, 8 HF-II/III.', { cm: 0.6 }),
  D(C.PatrolBoat, 'kuang_hua_vi', 'Kuang Hua VI', 'TWN', 2000, 2.0, 'Missile patrol boat, HF-II.', { cm: 0.6 }),
  D(C.Submarine, 'hai_kun', 'Hai Kun (Narwhal)', 'TWN', 2025, 2.6, 'First indigenous 2,500 t diesel submarine, heavyweight torpedoes.', { cm: 0.8, nx: true }),
  D(C.Submarine, 'hai_lung', 'Hai Lung (Zwaardvis)', 'TWN', 1987, 1.6, 'Dutch Zwaardvis-class.', { cm: 0.7 }),
  D(C.Amphibious, 'yushan_lpd', 'Yushan-class LPD', 'TWN', 2021, 2.3, '10,600 t LPD.', { cm: 0.6 }),
];
const TWN_FUTURE: MilitaryDesign[] = [
  F(C.MissileLauncher, 'twn_yun_feng', 'Yun Feng Cruise Missile', 'TWN', 2030, 2.9, 'hsiung_feng_iie', 700, 'Supersonic cruise missile, 1,200+ km.', { cm: 0.85, nx: true, rangeGround: 24 }),
  F(C.Submarine, 'twn_hai_kun_2', 'Hai Kun Batch 2', 'TWN', 2030, 2.8, 'hai_kun', 600, 'Batch two with improved combat system.', { cm: 0.85, nx: true }),
  F(C.Multirole, 'twn_next_fighter', 'AIDC Next-Gen Jet Trainer/Fighter (T-5 Brave Eagle derivative)', 'TWN', 2031, 2.6, 'ching_kuo', 800, 'Light fighter successor.', { cm: 0.7, nx: true }),
  F(C.AirDefense, 'twn_tk_v', 'Tien Kung V', 'TWN', 2031, 3.2, 'tien_kung_iv', 900, 'Extended-range ABM SAM.', { cm: 0.9, nx: true, rangeAir: 6 }),
];

// =====================================================================
// AUSTRALIA / NEW ZEALAND
// =====================================================================
const AUS: MilitaryDesign[] = [
  D(C.Frigate, 'hunter_class', 'Hunter-class', 'AUS', 2031, 3.0, 'Type 26 derived 10,000 t frigate, 32 Mk41 VLS, CEAFAR radar.', { cm: 1.0, nx: true }),
  D(C.Destroyer, 'hobart_class', 'Hobart-class (AWD)', 'AUS', 2017, 2.8, '7,000 t Aegis destroyer, SM-2, SM-6.', { cm: 0.95, nx: true }),
  D(C.Frigate, 'anzac_class', 'ANZAC-class', 'AUS', 1996, 2.0, '3,600 t frigate, upgraded.', { cm: 0.9 }),
  D(C.Submarine, 'collins_class', 'Collins-class', 'AUS', 1996, 2.3, '3,400 t diesel submarine.', { cm: 0.9, nx: true }),
  D(C.Amphibious, 'canberra_class', 'Canberra-class LHD', 'AUS', 2014, 2.5, '27,000 t LHD.', { cm: 0.8, nx: true }),
  D(C.Recon, 'aslav_25', 'ASLAV-25', 'AUS', 1996, 1.7, '8x8 light armored recon vehicle.', { cm: 1.0 }),
  D(C.Mechanized, 'bushmaster_pmv', 'Bushmaster PMV', 'AUS', 2005, 1.8, 'Protected mobility vehicle.', { cm: 0.9, mobility: W }),
  D(C.Mechanized, 'redback_ifv', 'Redback IFV', 'AUS', 2028, 2.9, 'Hanwha AS21 IFV, 42 t, 30 mm.', { cm: 0.9 }),
  D(C.Artillery, 'k9a10_huntsman', 'K9A1EA1 Huntsman', 'AUS', 2028, 2.8, '30 x AS9 Huntsman SPH.', { cm: 0.9 }),
  D(C.Infantry, 'aus_infantry', 'Australian Army Infantry Battalion', 'AUS', 2020, 2.3, 'Motorised infantry with EF88.', { cm: 1.0 }),
  D(C.SpecialForces, 'aus_sas', 'SASR/Commando Regiment Company', 'AUS', 2015, 2.7, 'Special forces.', { cm: 1.0 }),
  D(C.Drone, 'ghost_bat', 'MQ-28A Ghost Bat', 'AUS', 2026, 3.0, 'Boeing Australia loyal wingman, 3,700 km.', { cm: 0.9 }),
];
const AUS_FUTURE: MilitaryDesign[] = [
  F(C.Submarine, 'aus_ssn_aukus', 'SSN-AUKUS (Australia)', 'AUS', 2040, 3.4, 'collins_class', 5000, 'Nuclear-powered attack submarine, 3rd-gen.', { cm: 1.0, nx: true }),
  F(C.Drone, 'aus_ghost_bat_2', 'MQ-28 Block 2', 'AUS', 2029, 3.3, 'ghost_bat', 700, 'Weapon-carrying Ghost Bat.', { cm: 1.0, nx: true }),
  F(C.Frigate, 'aus_hunter_2', 'Hunter Batch 2', 'AUS', 2035, 3.2, 'hunter_class', 900, 'Follow-on frigates.', { cm: 1.0, nx: true }),
];

// =====================================================================
// SOUTHEAST ASIA
// =====================================================================
const SEA: MilitaryDesign[] = [
  D(C.Mechanized, 'anoa_apc', 'Pindad Anoa', 'IDN', 2008, 1.8, '6x6 wheeled APC.', { cm: 0.5, mobility: W }),
  D(C.Armor, 'harimau_kaplan', 'Pindad/FNSS Harimau (Kaplan MT)', 'IDN', 2020, 2.3, 'Medium tank co-developed with Turkey, 35 t, 105 mm.', { cm: 0.5 }),
  D(C.RocketArtillery, 'rhan_122', 'RHAN-122B', 'IDN', 2015, 1.9, 'Indonesian MLRS.', { cm: 0.5 }),
  D(C.Drone, 'elang_hitam', 'PTDI Elang Hitam', 'IDN', 2024, 2.0, 'MALE UAV.', { cm: 0.5 }),
  D(C.AirTransport, 'n219', 'PTDI N-219 Nurtanio', 'IDN', 2017, 1.5, 'Light STOL utility aircraft.', { cm: 0.4, rangeKm: 1500, speedKmh: 350 }),
  D(C.AirTransport, 'cn235_220', 'CN-235-220 (PTDI)', 'IDN', 2010, 1.9, 'Tactical airlift, 6 t.', { cm: 0.5, rangeKm: 2500, speedKmh: 450 }),
  D(C.Frigate, 'martadinata', 'Martadinata-class (SIGMA 10514)', 'IDN', 2017, 2.5, '2,400 t frigate with Damen SIGMA.', { cm: 0.6 }),
  D(C.Submarine, 'nagapasa', 'Nagapasa-class (Chang Bogo)', 'IDN', 2017, 2.1, '1,400 t submarine, PT PAL assembled.', { cm: 0.7 }),
  D(C.Amphibious, 'makassar_lpd', 'Makassar-class LPD', 'IDN', 2007, 2.0, '11,000 t LPD.', { cm: 0.6 }),
  D(C.PatrolBoat, 'kcr_60', 'KCR-60 / Sampari FAC', 'IDN', 2013, 1.9, 'Missile patrol craft.', { cm: 0.6 }),
  D(C.Mechanized, 'av8_gempita', 'DefTech AV8 Gempita', 'MYS', 2014, 2.0, '8x8 IFV/APC (Malaysia).', { cm: 0.7, mobility: W }),
  D(C.Frigate, 'maharaja_lela', 'Maharaja Lela-class (LMS Batch 2)', 'MYS', 2026, 2.6, 'Gowind-derived 3,100 t frigate.', { cm: 0.7 }),
  D(C.Frigate, 'kedah_opv', 'Kedah-class OPV', 'MYS', 2006, 1.7, 'Offshore patrol vessel.', { cm: 0.6 }),
  D(C.Mechanized, 'terrex_icv', 'Terrex ICV / AV81', 'SGP', 2010, 2.5, 'ST Engineering 8x8 armored carrier with 30 mm cannon.', { cm: 1.0, mobility: W }),
  D(C.Mechanized, 'bionix_ifv', 'Bionix IFV', 'SGP', 1999, 2.0, 'Tracked IFV.', { cm: 0.9 }),
  D(C.Mechanized, 'hunter_afv', 'Hunter Armoured Fighting Vehicle', 'SGP', 2023, 2.8, 'New tracked IFV with unmanned turret, 30 mm cannon.', { cm: 1.0 }),
  D(C.Artillery, 'primus_spg', 'SSPH 1 Primus', 'SGP', 1997, 2.1, '155 mm self-propelled howitzer.', { cm: 0.9 }),
  D(C.RocketArtillery, 'pegasus_hac', 'Pegasus Light Gun / Hitrole', 'SGP', 2005, 1.8, 'Singapore artillery.', { cm: 0.9 }),
  D(C.Frigate, 'formidable_class', 'Formidable-class', 'SGP', 2007, 2.6, '3,200 t stealth frigate (La Fayette derivative).', { cm: 0.9 }),
  D(C.Frigate, 'independence_class', 'Independence-class LMV', 'SGP', 2016, 2.5, '1,250 t littoral mission vessel.', { cm: 0.8 }),
  D(C.Amphibious, 'endurance_class', 'Endurance-class LPD', 'SGP', 2000, 2.0, '8,500 t LPD.', { cm: 0.7 }),
  D(C.Frigate, 'victory_class', 'Victory-class', 'SGP', 1990, 1.7, 'Missile corvettes.', { cm: 0.7 }),
];
const SEA_FUTURE: MilitaryDesign[] = [
  F(C.Mechanized, 'sgp_next_ifv', 'Singapore Next-Gen Combat Vehicle', 'SGP', 2031, 3.1, 'hunter_afv', 700, 'Hybrid-electric IFV.', { cm: 1.0, nx: true }),
  F(C.Multirole, 'idn_kf21_ifx', 'Indonesian KF-21 IF-X Variant', 'IDN', 2032, 3.0, 'kf21_boramae', 800, 'Indonesia\'s share of KF-21 production.', { cm: 0.8 }),
  F(C.Submarine, 'idn_scorpene_evo', 'Scorpene Evolved (Indonesia)', 'IDN', 2033, 2.7, 'nagapasa', 700, 'Order for two French Scorpene Evolved.', { cm: 0.8 }),
];

const DESIGNS_ALL: MilitaryDesign[] = [
  ...CHN, ...CHN_FUTURE, ...IND, ...IND_FUTURE, ...PAK, ...PAK_FUTURE,
  ...JPN, ...JPN_FUTURE, ...KOR, ...KOR_FUTURE, ...PRK, ...PRK_FUTURE,
  ...TWN, ...TWN_FUTURE, ...AUS, ...AUS_FUTURE, ...SEA, ...SEA_FUTURE,
];
export const DESIGNS: MilitaryDesign[] = DESIGNS_ALL;

// =====================================================================
// INVENTORY (1 Jan 2030)
// =====================================================================
const u = (id: string, count: number) => ({ id, count });
export const INVENTORY: NationInventory[] = [
  { code: 'CHN', units: [
    u('type_99a', 26), u('type_99', 8), u('type_96b', 22), u('type_96a', 30), u('type_15', 10), u('type_59d', 10), u('zbd_04a', 22), u('zbd_05', 16), u('zbd_03', 6), u('zbl_08', 50), u('zsl_10', 14), u('zbl_09_recon', 8), u('plz_05', 28), u('pcl_181', 18), u('plz_07b', 10), u('phl_16', 16), u('phl_03', 24), u('phl_11', 10), u('hq_9b', 18), u('hq_16fe', 20), u('hq_22', 8), u('hq_17ab', 12), u('pgz_09', 18), u('hq_19', 2), u('s400', 2), u('s300pmu2', 4), u('df_15b', 5), u('df_16', 5), u('df_17', 4), u('df_21d', 5), u('df_26', 6), u('cj_10', 6), u('yj_18_coastal', 6), u('df_41', 3), u('df_31ag', 3), u('pla_combined_arms_inf', 90), u('pla_mountain_inf', 14), u('pla_special_ops', 12), u('pla_marine', 10), u('pla_engineers', 20), u('j10c', 20), u('j11b', 14), u('j15', 6), u('j15t', 3), u('j16', 20), u('j16d', 2), u('j20a', 20), u('j35a', 3), u('j35', 1), u('jh7a', 10), u('h6k', 10), u('h6n', 3), u('h6j', 3), u('su30mkk', 6), u('su35s', 2), u('z10', 16), u('z19e', 8), u('z20', 8), u('y20', 8), u('y9', 6), u('il76md', 2), u('gj11', 3), u('wing_loong_2', 6), u('gj2_pla', 3), u('ch4', 4), u('ch5', 3), u('wz7', 3), u('type_055', 8), u('type_052d', 22), u('type_052c', 4), u('type_052b', 2), u('type_054a', 30), u('type_054b', 3), u('type_056a', 40), u('type_022', 12), u('liaoning', 1), u('shandong', 1), u('fujian', 1), u('type_075', 3), u('type_076', 1), u('type_071', 8), u('type_072a', 15), u('type_093b', 8), u('type_094a', 6), u('type_039a', 14), u('type_039c', 4),
  ], produces: ['type_99a', 'type_96b', 'type_15', 'zbd_04a', 'zbd_05', 'zbl_08', 'plz_05', 'pcl_181', 'phl_16', 'phl_03', 'phl_11', 'hq_9b', 'hq_16fe', 'hq_22', 'hq_17ab', 'pgz_09',
    'df_15b', 'df_16', 'df_17', 'df_21d', 'df_26', 'cj_10', 'yj_18_coastal', 'j10c', 'j11b', 'j15', 'j16', 'j20a', 'j35a', 'jh7a', 'h6k', 'h6n', 'z10', 'z19e', 'z20', 'y20', 'y9',
    'gj11', 'wing_loong_2', 'ch4', 'ch5', 'wz7', 'type_055', 'type_052d', 'type_054a', 'type_054b', 'type_056a', 'type_022', 'liaoning', 'shandong', 'fujian', 'type_075', 'type_076', 'type_071', 'type_093b', 'type_094a', 'type_039a', 'type_039c', 'hq_9p', 'vt4', 'type_039b', 'sh15', 'a100e', 'type_033_romeo'] },
  { code: 'IND', units: [
    u('arjun_mk1a', 6), u('t90s_bhishma', 30), u('ajeya_t72', 40), u('bmp2_sarath', 45), u('wheeled_apc_ind', 6), u('k9_vajra', 8), u('atags', 6), u('dhanush', 6), u('sharang', 6), u('m777', 8), u('pinaka_mk1', 12), u('pinaka_guided', 8), u('smerch', 4), u('akash', 16), u('akash_ng', 2), u('mrsam', 6), u('qrsam', 2), u('s400', 4), u('spyder', 4), u('brahmos', 10), u('prithvi_ii', 3), u('pralay', 3), u('agni_v', 3), u('agni_p', 3), u('nirbhay', 3), u('ind_infantry', 120), u('ind_mountain', 18), u('ind_para_sf', 10), u('tejas_mk1a', 6), u('tejas_mk1', 4), u('su30mki', 14), u('mig29', 4), u('mig21_bison', 1), u('jaguar_darin3', 4), u('mirage2000_5', 3), u('rafale_f4', 3), u('rafale_m', 1), u('lch_prachand', 4), u('dhruv_rudra', 3), u('ah64e', 2), u('mi17v5', 6), u('dhruv_alh', 6), u('c130j', 2), u('c17a', 2), u('il76md', 3), u('p8a', 1), u('rustom2', 2), u('heron_mk2', 2), u('mq9b', 1), u('vikrant', 1), u('vikramaditya', 1), u('visakhapatnam', 3), u('kolkata', 3), u('delhi', 3), u('nilgiri', 4), u('shivalik', 3), u('talwar_class', 6), u('kamorta', 4), u('arihant', 3), u('kalvari', 6), u('sindhughosh', 6), u('landing_ship_tank_ind', 5),
  ], produces: ['arjun_mk1a', 't90s_bhishma', 'ajeya_t72', 'bmp2_sarath', 'wheeled_apc_ind', 'k9_vajra', 'atags', 'dhanush', 'pinaka_mk1', 'pinaka_guided', 'akash', 'akash_ng', 'mrsam', 'qrsam', 'brahmos', 'prithvi_ii', 'pralay', 'agni_v', 'agni_p', 'nirbhay',
    'tejas_mk1a', 'tejas_mk1', 'su30mki', 'jaguar_darin3', 'lch_prachand', 'dhruv_rudra', 'dhruv_alh', 'hal_do228', 'rustom2', 'archer_ng', 'vikrant', 'visakhapatnam', 'kolkata', 'nilgiri', 'shivalik', 'kamorta', 'arihant', 'kalvari', 'landing_ship_tank_ind'] },
  { code: 'PAK', units: [
    u('al_khalid', 16), u('al_khalid_2', 6), u('al_zarrar', 20), u('t80ud', 4), u('vt4', 4), u('talha_apc', 30), u('hamza_ifv', 4), u('m113', 30), u('sh15', 10), u('m109a5', 8), u('a100e', 4), u('fatah_1', 3), u('hq_9p', 4), u('hq_16fe', 4), u('babur', 3), u('shaheen_iii', 2), u('ababeel', 2), u('nasr', 2), u('ghauri', 2), u('pak_infantry', 90), u('pak_ssg', 5), u('jf17_block3', 3), u('jf17_block2', 8), u('f16c', 4), u('mirage_5', 3), u('j10c', 3), u('k8_karakoram', 3), u('ah1f_cobra', 3), u('z10', 1), u('mi17v5', 3), u('c130e', 2), u('shahpar_2', 3), u('burraq', 2), u('babur_class', 4), u('zulfiquar_f22p', 4), u('hangor', 3), u('agosta_90b', 5), u('azmat', 4),
  ], produces: ['al_khalid', 'al_khalid_2', 'al_zarrar', 'talha_apc', 'hamza_ifv', 'fatah_1', 'babur', 'shaheen_iii', 'ababeel', 'nasr', 'ghauri', 'jf17_block3', 'jf17_block2', 'k8_karakoram', 'shahpar_2', 'burraq', 'babur_class', 'hangor', 'azmat', 'agosta_90b'] },
  { code: 'JPN', units: [
    u('type_10', 10), u('type_90', 10), u('type_16_mcv', 14), u('type_89_ifv', 10), u('type_96_wheeled_apc', 14), u('type_24_ifv', 2), u('type_87_rcv', 6), u('type_19', 6), u('type_99_sph', 8), u('fh70', 4), u('type_75_mlrs', 4), u('type_03_chusam', 8), u('type_81_tansam', 8), u('type_87_spaag', 3), u('patriot_pac3', 6), u('type_12_ssm', 6), u('type_12_upgraded', 2), u('type_88_ssm', 3), u('jpn_infantry', 32), u('jpn_ardb', 4), u('jpn_sfgp', 1), u('jpn_engineers', 6), u('f2', 4), u('f15j_kai', 6), u('f35a', 5), u('f35b', 1), u('f4ej_kai', 1), u('p1_mpa', 5), u('c2', 3), u('kc46a', 2), u('e2d', 2), u('ah1s_cobra', 2), u('ah64d', 1), u('uh2', 3), u('ch47j', 3), u('mq9b', 1), u('izumo', 1), u('kaga', 1), u('atago_class', 2), u('kongo_class', 4), u('maya_class', 2), u('akizuki_class', 4), u('asahi_class', 2), u('takanami_class', 5), u('mogami_class', 8), u('abukuma_class', 4), u('taigei_class', 4), u('soryu_class', 9), u('oyashio_class', 4), u('osumi_class', 3), u('hayabusa_class', 4),
  ], produces: ['type_10', 'type_16_mcv', 'type_24_ifv', 'type_19', 'type_03_chusam', 'type_12_ssm', 'type_12_upgraded', 'f2', 'f15j_kai', 'p1_mpa', 'c2', 'uh2', 'izumo', 'kaga', 'atago_class', 'maya_class', 'akizuki_class', 'asahi_class', 'mogami_class', 'taigei_class', 'soryu_class', 'osumi_class', 'hayabusa_class'] },
  { code: 'KOR', units: [
    u('k2_black_panther', 12), u('k1a2', 20), u('k1a1', 18), u('k21_ifv', 10), u('k200a1', 25), u('k808', 8), u('k9_thunder', 24), u('k55a1', 14), u('chunmoo', 10), u('km_sam', 8), u('chunma', 6), u('patriot_pac3', 6), u('hyunmoo_2', 6), u('hyunmoo_3', 5), u('hyunmoo_5', 2), u('kor_infantry', 80), u('kor_sof', 6), u('kor_marine', 6), u('kor_engineers', 8), u('kf21_boramae', 3), u('fa50', 7), u('fa50_block20', 1), u('f15k', 4), u('f16c', 5), u('f35a', 4), u('lah_marineon', 2), u('ah64e', 3), u('kuh1_surion', 6), u('ch47d', 2), u('c130h', 2), u('a330_mrtt', 1), u('kus_x', 1), u('kdx3', 3), u('kdx3_batch2', 1), u('kdx2', 6), u('kdx1', 3), u('incheon', 5), u('daegu_ffx2', 3), u('chungnam_ffx3', 3), u('ulsan_ff', 6), u('dosan_ahn_changho', 3), u('son_won_il', 9), u('chang_bogo', 3), u('dokdo_class', 2), u('yoon_youngha', 4),
  ], produces: ['k2_black_panther', 'k1a2', 'k21_ifv', 'k200a1', 'k808', 'k9_thunder', 'chunmoo', 'km_sam', 'hyunmoo_2', 'hyunmoo_3', 'hyunmoo_5', 'kf21_boramae', 'fa50', 'fa50_block20', 'lah_marineon', 'kuh1_surion', 'kus_x', 'kdx3', 'kdx3_batch2', 'kdx2', 'incheon', 'daegu_ffx2', 'chungnam_ffx3', 'dosan_ahn_changho', 'son_won_il', 'dokdo_class', 'yoon_youngha'] },
  { code: 'PRK', units: [
    u('chonma_216', 6), u('pokpung_ho', 20), u('chonma_ho', 30), u('vtt323', 40), u('koksan_170', 12), u('m1991_sph', 14), u('m1991_240', 20), u('kn25', 8), u('m1985_mrl', 30), u('kn23', 6), u('hwasong_12', 3), u('hwasong_15', 2), u('hwasong_17', 2), u('hwasong_18', 3), u('hwasal_2', 3), u('kn06', 4), u('pongae_sam_old', 12), u('prk_infantry', 110), u('prk_sof', 20), u('prk_engineers', 12), u('mig29', 2), u('mig21', 4), u('mig23', 1), u('su25', 1), u('il28', 2), u('mi2_kpa', 3), u('an2_kpaaf', 3), u('saetbyol_4', 1), u('kumsong_mohajer', 2), u('choe_hyon', 2), u('amnok_class', 2), u('najin_class', 2), u('sinpo_c', 1), u('sang_o', 20), u('type_033_romeo', 20), u('nongo_class', 20),
  ], produces: ['chonma_216', 'pokpung_ho', 'vtt323', 'koksan_170', 'm1991_sph', 'm1991_240', 'kn25', 'm1985_mrl', 'kn23', 'hwasong_12', 'hwasong_15', 'hwasong_17', 'hwasong_18', 'hwasal_2', 'kn06', 'saetbyol_4', 'kumsong_mohajer', 'choe_hyon', 'amnok_class', 'sinpo_c', 'sang_o', 'nongo_class'] },
  { code: 'TWN', units: [
    u('m1a2_sepv3_abrams', 4), u('cm11_brave_tiger', 12), u('m60a3', 8), u('cm32_clouded_leopard', 18), u('cm34', 4), u('m113', 10), u('zuni_155', 4), u('m109a6', 6), u('himars', 4), u('thunderbolt_2000', 5), u('kung_feng_vi', 3), u('tien_kung_iv', 4), u('tien_kung_iii', 6), u('tien_chien_ii', 4), u('patriot_pac3', 5), u('nasams', 2), u('hsiung_feng_ii', 5), u('hsiung_feng_iii', 5), u('hsiung_feng_iie', 3), u('tien_ma', 1), u('harpoon_coastal', 2), u('twn_infantry', 40), u('twn_marine', 4), u('twn_sof', 3), u('f16v', 5), u('mirage2000_5', 2), u('ching_kuo', 6), u('at3_tzu_chiang', 3), u('ah64e', 2), u('ah1w', 2), u('uh60m', 3), u('ch47f', 1), u('chien_hsiang', 2), u('albatross_uav', 1), u('kang_ding', 6), u('cheng_kung', 8), u('tuo_chiang', 4), u('kidd_class', 4), u('kuang_hua_vi', 8), u('hai_kun', 1), u('hai_lung', 2), u('yushan_lpd', 1), u('newport_lst', 2),
  ], produces: ['cm11_brave_tiger', 'cm32_clouded_leopard', 'cm34', 'zuni_155', 'thunderbolt_2000', 'kung_feng_vi', 'tien_kung_iv', 'tien_kung_iii', 'hsiung_feng_ii', 'hsiung_feng_iii', 'hsiung_feng_iie', 'tien_ma', 'ching_kuo', 'at3_tzu_chiang', 'chien_hsiang', 'albatross_uav', 'tuo_chiang', 'kuang_hua_vi', 'hai_kun', 'yushan_lpd'] },
  { code: 'AUS', units: [
    u('m1a2_sepv3_abrams', 4), u('aslav_25', 4), u('bushmaster_pmv', 8), u('boxer_crv', 4), u('redback_ifv', 2), u('k9a10_huntsman', 3), u('m777', 3), u('himars', 2), u('nasams', 2), u('aus_infantry', 24), u('aus_sas', 3), u('f35a', 4), u('f18f_super_hornet', 2), u('ea18g', 1), u('ghost_bat', 2), u('ah64e', 3), u('mh60r', 2), u('nh90', 1), u('ch47f', 1), u('c17a', 1), u('c130j', 2), u('kc30a', 1), u('p8a', 2), u('mq4c', 1), u('e7a', 1), u('hobart_class', 3), u('anzac_class', 8), u('collins_class', 6), u('canberra_class', 2),
  ], produces: ['bushmaster_pmv', 'redback_ifv', 'k9a10_huntsman', 'ghost_bat', 'hobart_class', 'hunter_class', 'anzac_class', 'collins_class', 'aus_infantry'] },
  { code: 'NZL', units: [
    u('infantry_g3', 4), u('mech_g2', 2), u('p8a', 1), u('c130j', 1), u('nh90', 2), u('anzac_class', 2), u('patrol_g3', 2),
  ], produces: [] },
  { code: 'IDN', units: [
    u('leopard_2a4', 4), u('leopard_2rev', 1), u('harimau_kaplan', 3), u('amx13', 6), u('anoa_apc', 10), u('bmp3f', 2), u('m113', 6), u('marder_1a3', 3), u('caesar', 3), u('rhan_122', 4), u('astros_ii', 2), u('nasams', 1), u('chiron', 2), u('infantry_g2', 60), u('sof_g2', 4), u('su27sk', 2), u('su30mk2', 3), u('f16c', 2), u('rafale_f4', 2), u('t50i', 1), u('mi35p', 2), u('ah64e', 1), u('cn235_220', 3), u('n219', 2), u('c130j', 2), u('elang_hitam', 1), u('martadinata', 2), u('frigate_g3', 4), u('nagapasa', 3), u('type_209', 2), u('makassar_lpd', 4), u('kcr_60', 6), u('frigate_g2', 6),
  ], produces: ['anoa_apc', 'harimau_kaplan', 'rhan_122', 'elang_hitam', 'n219', 'cn235_220', 'martadinata', 'nagapasa', 'makassar_lpd', 'kcr_60'] },
  { code: 'MYS', units: [
    u('pt91m_twardy', 4), u('av8_gempita', 8), u('recon_g2', 2), u('infantry_g2', 20), u('sof_g2', 2), u('su30mkm', 2), u('f18d', 1), u('fa50', 1), u('a400m', 1), u('maharaja_lela', 2), u('kedah_opv', 6), u('scorpene', 2), u('frigate_g2', 2),
  ], produces: ['av8_gempita', 'maharaja_lela', 'kedah_opv'] },
  { code: 'SGP', units: [
    u('leopard_2a4', 6), u('terrex_icv', 12), u('bionix_ifv', 10), u('hunter_afv', 6), u('primus_spg', 6), u('m777', 3), u('himars', 2), u('spyder', 2), u('barak_8', 2), u('infantry_g3', 12), u('sof_g3', 2), u('f15sg', 3), u('f16v', 3), u('f35b', 1), u('f35a', 1), u('g550_caew', 1), u('h225m', 1), u('ah64d', 1), u('c130h', 1), u('a330_mrtt', 1), u('heron_1', 1), u('formidable_class', 6), u('independence_class', 8), u('victory_class', 6), u('endurance_class', 4), u('type_218sg', 4), u('submarine_g2', 2),
  ], produces: ['terrex_icv', 'bionix_ifv', 'hunter_afv', 'primus_spg', 'formidable_class', 'independence_class', 'endurance_class'] },
  { code: 'THA', units: [
    u('vt4', 4), u('m60a3', 4), u('armor_g2', 4), u('m113', 12), u('zbl_08', 6), u('infantry_g2', 40), u('sof_g2', 3), u('jas39c', 3), u('f16c', 4), u('fa50', 2), u('ah6', 2), u('uh60m', 3), u('carrier_g1', 1), u('frigate_g2', 2), u('type_039b', 1), u('patrol_g2', 2), u('frigate_g3', 1), u('amphib_g2', 1),
  ], produces: [] },
  { code: 'VNM', units: [
    u('t90s', 4), u('t72m1', 10), u('t54', 20), u('pt76', 8), u('bmp1', 12), u('btr60', 12), u('infantry_g2', 100), u('sof_g2', 4), u('bm21_grad', 8), u('s300pmu2', 2), u('airdef_g1', 6), u('missile_g3', 2), u('su30mk2', 5), u('su22', 2), u('su27sk', 2), u('mi17v5', 3), u('mi24', 2), u('an26', 2), u('frigate_g2', 4), u('kilo_636', 6), u('patrol_g2', 8), u('frigate_g1', 3),
  ], produces: [] },
  { code: 'PHL', units: [
    u('recon_g2', 2), u('m113', 6), u('infantry_g2', 32), u('sof_g2', 3), u('brahmos', 1), u('fa50', 2), u('mi17v5', 2), u('transport_g2', 2), u('frigate_g3', 2), u('frigate_g2', 2), u('frigate_g1', 2), u('amphib_g2', 2), u('patrol_g2', 2),
  ], produces: [] },
  { code: 'MMR', units: [
    u('type_59d', 10), u('infantry_g1', 90), u('sof_g1', 2), u('mig29', 3), u('jf17_block2', 1), u('mi35p', 2), u('y9', 2), u('frigate_g2', 4),
  ], produces: [] },
  { code: 'KHM', units: [
    u('t55', 6), u('infantry_g1', 20), u('sof_g1', 1), u('patrol_g2', 2),
  ], produces: [] },
  { code: 'LAO', units: [
    u('t54', 6), u('infantry_g1', 14), u('sof_g1', 1),
  ], produces: [] },
  { code: 'BGD', units: [
    u('type_59d', 10), u('armor_g2', 2), u('infantry_g2', 30), u('sof_g1', 2), u('mig29', 1), u('multirole_g1', 1), u('frigate_g2', 1), u('submarine_g1', 2), u('patrol_g2', 4), u('frigate_g1', 4),
  ], produces: [] },
  { code: 'LKA', units: [
    u('type_59d', 4), u('infantry_g2', 20), u('sof_g1', 1), u('k8_karakoram', 1), u('mi24', 1), u('patrol_g2', 4),
  ], produces: [] },
  { code: 'NPL', units: [
    u('infantry_g1', 20), u('sof_g1', 1),
  ], produces: [] },
  { code: 'BTN', units: [
    u('infantry_g1', 4),
  ], produces: [] },
  { code: 'MDV', units: [
    u('infantry_g1', 1), u('patrol_g1', 2),
  ], produces: [] },
  { code: 'MNG', units: [
    u('t72m1', 4), u('t55', 4), u('infantry_g1', 12), u('bmp1', 4),
  ], produces: [] },
  { code: 'BRN', units: [
    u('infantry_g2', 5), u('frigate_g2', 3),
  ], produces: [] },
  { code: 'TLS', units: [
    u('infantry_g1', 2), u('patrol_g1', 2),
  ], produces: [] },
  { code: 'PNG', units: [
    u('infantry_g1', 3), u('patrol_g1', 2),
  ], produces: [] },
  { code: 'SLB', units: [
    u('infantry_g1', 1),
  ], produces: [] },
  { code: 'VUT', units: [
    u('infantry_g1', 1),
  ], produces: [] },
  { code: 'FJI', units: [
    u('infantry_g1', 3), u('patrol_g1', 1),
  ], produces: [] },
  { code: 'WSM', units: [
    u('infantry_g1', 1), u('patrol_g1', 1),
  ], produces: [] },
  { code: 'KIR', units: [
    u('infantry_g1', 1), u('patrol_g1', 1),
  ], produces: [] },
  { code: 'FSM', units: [
    u('infantry_g1', 1), u('patrol_g1', 1),
  ], produces: [] },
  { code: 'MHL', units: [
    u('infantry_g1', 1), u('patrol_g1', 1),
  ], produces: [] },
  { code: 'PLW', units: [
    u('infantry_g1', 1), u('patrol_g1', 1),
  ], produces: [] },
];

// EXTERNAL IDS: a330_mrtt, a400m, agosta_90b, ah1f_cobra, ah1w, ah6, ah64d, ah64e, airdef_g1, amphib_g2, amx13, an26, armor_g2, astros_ii, barak_8, bm21_grad, bmp1, bmp3f, boxer_crv, btr60, c130e, c130h, c130j, c17a, caesar, carrier_g1, ch47d, ch47f, ch47j, chiron, e2d, e7a, ea18g, f15k, f15sg, f16c, f16v, f18d, f18f_super_hornet, f35a, f35b, f4ej_kai, frigate_g1, frigate_g2, frigate_g3, g550_caew, h225m, harpoon_coastal, heron_1, heron_mk2, himars, il28, il76md, infantry_g1, infantry_g2, infantry_g3, jas39c, kc30a, kc46a, kidd_class, kilo_636, leopard_2a4, leopard_2rev, m109a5, m109a6, m113, m1a2_sepv3_abrams, m60a3, m777, marder_1a3, mech_g2, mh60r, mi17v5, mi24, mi35p, mig21, mig23, mig29, mirage2000_5, mirage_5, missile_g3, mq4c, mq9b, multirole_g1, nasams, newport_lst, nh90, p8a, patriot_pac3, patrol_g1, patrol_g2, patrol_g3, pt76, pt91m_twardy, rafale_f4, rafale_m, recon_g2, s300pmu2, s400, scorpene, smerch, sof_g1, sof_g2, sof_g3, spyder, su22, su25, su27sk, su30mk2, su30mkk, su30mkm, su35s, submarine_g1, submarine_g2, t50i, t54, t55, t72m1, t80ud, t90s, talwar_class, transport_g2, type_209, type_218sg, uh60m
