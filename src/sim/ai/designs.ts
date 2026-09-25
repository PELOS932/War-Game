/**
 * Unit design analysis for the AI: combat values, roles and simple power
 * estimates. Pure helpers (no GameAPI access) so they can be unit-tested.
 */
import { UnitCategory, UnitClass, type Unit, type UnitDesign } from '../types';
import { Terrain } from '../../worldgen/types';

export type DesignRole =
  | 'line' // infantry-type holding units
  | 'mobile' // armour / mechanised manoeuvre units
  | 'support' // indirect fire (artillery, MLRS, missiles)
  | 'aa' // ground air defence
  | 'recon'
  | 'fighter'
  | 'multirole'
  | 'strike'
  | 'bomber'
  | 'heli'
  | 'drone'
  | 'airlift'
  | 'surface'
  | 'sub'
  | 'carrier'
  | 'amphib';

export interface DesignInfo {
  id: string;
  d: UnitDesign;
  cls: UnitClass;
  cat: UnitCategory;
  role: DesignRole;
  /** Power in ground combat (attack & defence blend), ~0..100. */
  ground: number;
  /** Anti-armour capability 0..100. */
  antiArmor: number;
  /** Anti-air capability 0..100. */
  antiAir: number;
  /** Naval combat value ~0..100. */
  naval: number;
  /** Air superiority value ~0..100. */
  airCombat: number;
  /** Ground-attack value of aircraft ~0..100. */
  airStrike: number;
  /** Generic combat value per million USD (used for design choice). */
  valuePerCost: number;
}

export function categoryRole(cat: UnitCategory): DesignRole {
  switch (cat) {
    case UnitCategory.Infantry:
    case UnitCategory.SpecialForces:
    case UnitCategory.Engineers:
      return 'line';
    case UnitCategory.Mechanized:
    case UnitCategory.Armor:
      return 'mobile';
    case UnitCategory.Artillery:
    case UnitCategory.RocketArtillery:
    case UnitCategory.MissileLauncher:
      return 'support';
    case UnitCategory.AirDefense:
      return 'aa';
    case UnitCategory.Recon:
      return 'recon';
    case UnitCategory.Fighter:
      return 'fighter';
    case UnitCategory.Multirole:
      return 'multirole';
    case UnitCategory.Strike:
      return 'strike';
    case UnitCategory.Bomber:
      return 'bomber';
    case UnitCategory.Helicopter:
      return 'heli';
    case UnitCategory.Drone:
      return 'drone';
    case UnitCategory.AirTransport:
      return 'airlift';
    case UnitCategory.Submarine:
      return 'sub';
    case UnitCategory.Carrier:
      return 'carrier';
    case UnitCategory.Amphibious:
      return 'amphib';
    default:
      return 'surface';
  }
}

export function analyseDesign(d: UnitDesign): DesignInfo {
  const cat = d.category;
  const role = categoryRole(cat);
  const atkGround = 0.5 * d.attackSoft + 0.5 * d.attackHard;
  let ground: number;
  if (d.cls === UnitClass.Land) {
    if (d.indirect) ground = 0.75 * atkGround + 0.25 * d.defenseGround;
    else if (role === 'aa') ground = 0.35 * atkGround + 0.4 * d.defenseGround;
    else ground = 0.55 * atkGround + 0.45 * d.defenseGround;
  } else if (d.cls === UnitClass.Air) {
    ground = 0.3 * atkGround;
  } else {
    ground = 0.35 * atkGround;
  }
  const naval = d.cls === UnitClass.Naval
    ? 0.4 * d.attackNaval + 0.2 * d.attackSub + 0.4 * d.defenseNaval
    : 0.5 * d.attackNaval + 0.2 * d.attackSub;
  const airCombat = d.cls === UnitClass.Air ? 0.65 * d.attackAir + 0.35 * d.defenseAir : 0;
  const airStrike = d.cls === UnitClass.Air ? atkGround : 0;
  const antiAir = d.attackAir;
  const generic =
    d.cls === UnitClass.Land ? ground + 0.3 * antiAir
      : d.cls === UnitClass.Air ? Math.max(airCombat, airStrike) + 0.2 * Math.min(airCombat, airStrike)
        : naval + 0.2 * antiAir;
  return {
    id: d.id,
    d,
    cls: d.cls,
    cat,
    role,
    ground,
    antiArmor: d.attackHard,
    antiAir,
    naval,
    airCombat,
    airStrike,
    valuePerCost: generic / Math.max(1, d.cost),
  };
}

/** Readiness multiplier from strength & efficiency. */
export function readiness(u: Unit): number {
  return (u.strength / 100) * (0.45 + 0.55 * (u.efficiency / 100));
}

/** Effective ground power of a unit (0..~100). */
export function unitGroundPower(info: DesignInfo, u: Unit): number {
  return Math.max(1, info.ground) * readiness(u);
}

export function unitNavalPower(info: DesignInfo, u: Unit): number {
  return Math.max(1, info.naval) * readiness(u);
}

export function unitAirPower(info: DesignInfo, u: Unit): number {
  return Math.max(1, info.airCombat + 0.5 * info.airStrike) * readiness(u);
}

/** Defensive multiplier for a defender standing on this terrain. */
export function terrainDefense(t: number): number {
  switch (t) {
    case Terrain.Forest: return 1.25;
    case Terrain.Jungle: return 1.35;
    case Terrain.Hills: return 1.4;
    case Terrain.Mountains: return 1.9;
    case Terrain.Marsh: return 1.3;
    case Terrain.Urban: return 1.7;
    case Terrain.Tundra: return 1.05;
    case Terrain.Ice: return 1.1;
    case Terrain.Desert: return 0.95;
    default: return 1;
  }
}

/** Whether terrain is poor for armour (avoid as offensive axis). */
export function roughTerrain(t: number): boolean {
  return t === Terrain.Mountains || t === Terrain.Jungle || t === Terrain.Marsh || t === Terrain.Ice;
}

export function isLandCategory(cat: UnitCategory): boolean {
  return cat <= UnitCategory.MissileLauncher;
}

/** Desired land/air/naval mix by doctrine. */
export interface ForceMix {
  land: number;
  air: number;
  naval: number;
}

export interface DoctrineInput {
  landlocked: boolean;
  coastalShare: number; // 0..1 share of our land hexes that are coastal
  island: boolean; // no land neighbours at all
  navalFocus: number;
  navyRating: number; // 0..10 (seed)
  airRating: number; // 0..10 (seed)
  development: number;
  gdp: number;
}

export function forceMix(x: DoctrineInput): ForceMix {
  let naval = x.landlocked ? 0 : 0.06 + 0.3 * x.navalFocus + 0.02 * x.navyRating + (x.island ? 0.12 : 0) + 0.08 * x.coastalShare;
  let air = 0.14 + 0.02 * x.airRating + 0.08 * x.development + (x.island ? 0.05 : 0);
  naval = Math.min(0.45, naval);
  air = Math.min(0.38, air);
  // Poor nations cannot sustain big navies/air forces.
  if (x.gdp < 40) {
    naval *= 0.5;
    air *= 0.6;
  }
  const land = Math.max(0.3, 1 - naval - air);
  const t = land + air + naval;
  return { land: land / t, air: air / t, naval: naval / t };
}

/** Category weights inside each class (before counters). */
export function landCategoryWeights(development: number, enemyArmor: number, enemyAir: number, gdp: number): Map<UnitCategory, number> {
  const rich = Math.min(1, development * 1.2);
  const m = new Map<UnitCategory, number>();
  m.set(UnitCategory.Infantry, 0.34 - 0.14 * rich);
  m.set(UnitCategory.Mechanized, 0.15 + 0.08 * rich);
  m.set(UnitCategory.Armor, 0.13 + 0.07 * rich + 0.12 * enemyArmor);
  m.set(UnitCategory.Artillery, 0.1);
  m.set(UnitCategory.RocketArtillery, 0.04 + 0.03 * rich);
  m.set(UnitCategory.AirDefense, 0.07 + 0.25 * enemyAir);
  m.set(UnitCategory.Recon, 0.03);
  m.set(UnitCategory.SpecialForces, 0.03 * rich);
  m.set(UnitCategory.Engineers, 0.02);
  m.set(UnitCategory.MissileLauncher, gdp > 500 ? 0.03 : 0);
  return m;
}

export function airCategoryWeights(development: number, gdp: number, enemyAir: number, enemyArmor: number): Map<UnitCategory, number> {
  const m = new Map<UnitCategory, number>();
  m.set(UnitCategory.Fighter, 0.25 + 0.3 * enemyAir);
  m.set(UnitCategory.Multirole, 0.3);
  m.set(UnitCategory.Strike, 0.12 + 0.15 * enemyArmor);
  m.set(UnitCategory.Helicopter, 0.14 + 0.1 * enemyArmor);
  m.set(UnitCategory.Drone, 0.08 + 0.08 * development);
  m.set(UnitCategory.Bomber, gdp > 1500 ? 0.06 : 0);
  m.set(UnitCategory.AirTransport, 0.02);
  return m;
}

export function navalCategoryWeights(gdp: number, navyRating: number, navalFocus: number, expeditionary: boolean): Map<UnitCategory, number> {
  const m = new Map<UnitCategory, number>();
  const blue = navyRating >= 6 && gdp > 800;
  m.set(UnitCategory.PatrolBoat, blue ? 0.05 : 0.35);
  m.set(UnitCategory.Frigate, 0.28);
  m.set(UnitCategory.Destroyer, gdp > 150 ? 0.22 : 0.05);
  m.set(UnitCategory.Cruiser, blue ? 0.08 : 0);
  m.set(UnitCategory.Submarine, gdp > 80 ? 0.15 + 0.05 * navalFocus : 0);
  m.set(UnitCategory.Carrier, blue && navyRating >= 7 ? 0.06 : 0);
  m.set(UnitCategory.Amphibious, expeditionary ? 0.1 : gdp > 300 ? 0.04 : 0);
  return m;
}
