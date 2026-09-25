/**
 * Unit design catalogue: every UnitCategory in four generations
 * (gen 1 ≈ 1980s-90s legacy, gen 2 ≈ 2000s, gen 3 ≈ 2010s-20s, gen 4 ≈ 2030 cutting edge).
 * Names are fictional but follow real designation conventions.
 *
 * Scale: land units are battalions, air units squadrons (12-18 airframes), naval
 * units individual major warships (patrol boats are flotillas).
 * Costs in millions USD, upkeep in millions USD per day (reference price level;
 * each nation applies its own cost/upkeep factor).
 */
import {
  CATEGORY_CLASS, UnitCategory, UnitClass,
  type ArmorType, type Mobility, type UnitDesign,
} from '../types';

type Quad = [number, number, number, number];

interface Family {
  cat: UnitCategory;
  key: string;
  tech: string | null; // tech id prefix; gen N requires `${tech}_${N}` (N >= 2)
  names: [string, string, string, string];
  armor: ArmorType | [ArmorType, ArmorType, ArmorType, ArmorType];
  mobility: Mobility | [Mobility, Mobility, Mobility, Mobility];
  personnel: number;
  soft: Quad; hard: Quad; air: Quad; naval: Quad; sub: Quad;
  rGround: Quad; rAir: Quad; rNaval: Quad;
  dGround: Quad; dAir: Quad; dNaval: Quad;
  speed: Quad; spot: Quad; stealth: Quad;
  rangeKm?: Quad;
  fuel: number;
  cost: Quad; mg: Quad; days: Quad; upkeep: Quad;
  indirect?: boolean;
  capture: boolean;
  desc: string;
}

const Z: Quad = [0, 0, 0, 0];
const q = (a: number, b: number, c: number, d: number): Quad => [a, b, c, d];
const all = (v: number): Quad => [v, v, v, v];

const FAMILIES: Family[] = [
  // ------------------------------------------------------------------ LAND
  {
    cat: UnitCategory.Infantry, key: 'infantry', tech: 'land_infantry',
    names: ['R-90 Rifleman Battalion', 'R-05 Motor Rifle Battalion', 'R-20 Warden Infantry Battalion', 'R-30 Aegis Soldier Battalion'],
    armor: 'soft', mobility: 'foot', personnel: 800,
    soft: q(28, 36, 45, 54), hard: q(10, 16, 24, 32), air: q(3, 6, 10, 14), naval: q(2, 3, 5, 8), sub: Z,
    rGround: all(1), rAir: Z, rNaval: Z,
    dGround: q(38, 44, 52, 60), dAir: q(32, 38, 46, 54), dNaval: q(30, 36, 44, 52),
    speed: q(12, 16, 18, 20), spot: all(2), stealth: q(0.1, 0.12, 0.15, 0.2),
    fuel: 120, cost: q(60, 90, 140, 200), mg: q(6, 9, 12, 16), days: q(30, 35, 40, 45), upkeep: q(0.5, 0.62, 0.75, 0.9),
    capture: true, desc: 'Line infantry battalion. Cheap, holds ground well in cities, forests and mountains.',
  },
  {
    cat: UnitCategory.Mechanized, key: 'mech', tech: 'land_mech',
    names: ['BMV-80 Mechanized Battalion', 'M-4 Vanguard IFV Battalion', 'M-21 Lancer IFV Battalion', 'M-32 Paladin Optionally-Manned IFV Battalion'],
    armor: 'hard', mobility: 'tracked', personnel: 700,
    soft: q(40, 48, 58, 68), hard: q(24, 34, 44, 56), air: q(8, 10, 14, 18), naval: q(3, 4, 6, 8), sub: Z,
    rGround: all(1), rAir: Z, rNaval: Z,
    dGround: q(42, 50, 60, 70), dAir: q(30, 36, 44, 52), dNaval: q(34, 40, 48, 56),
    speed: q(40, 45, 50, 55), spot: q(2, 2, 3, 3), stealth: all(0.05),
    fuel: 80, cost: q(250, 380, 520, 700), mg: q(25, 35, 45, 60), days: q(60, 70, 80, 90), upkeep: q(1.1, 1.4, 1.6, 2.0),
    capture: true, desc: 'Infantry mounted in armoured fighting vehicles. Fast, balanced attack and defence.',
  },
  {
    cat: UnitCategory.Armor, key: 'armor', tech: 'land_armor',
    names: ['T-78 Bastion MBT Battalion', 'M-1A Warhound MBT Battalion', 'M-21 Ironclad MBT Battalion', 'M-30 Sentinel MBT Battalion'],
    armor: 'hard', mobility: 'tracked', personnel: 550,
    soft: q(36, 44, 52, 60), hard: q(56, 66, 76, 88), air: q(2, 3, 4, 6), naval: q(4, 5, 6, 8), sub: Z,
    rGround: all(1), rAir: Z, rNaval: Z,
    dGround: q(55, 64, 73, 82), dAir: q(34, 40, 48, 56), dNaval: q(40, 46, 52, 58),
    speed: q(40, 48, 52, 56), spot: all(2), stealth: all(0.02),
    fuel: 70, cost: q(400, 600, 850, 1150), mg: q(45, 60, 80, 100), days: q(90, 100, 110, 120), upkeep: q(1.8, 2.1, 2.5, 3.0),
    capture: true, desc: 'Main battle tank battalion. The decisive breakthrough arm in open terrain.',
  },
  {
    cat: UnitCategory.Artillery, key: 'artillery', tech: 'land_artillery',
    names: ['G-70 Towed Howitzer Battalion', 'SPH-95 Thunder SP Howitzer Battalion', 'SPH-15 Hammerfall SP Howitzer Battalion', 'SPH-30 Longbow ER Howitzer Battalion'],
    armor: ['soft', 'hard', 'hard', 'hard'], mobility: ['wheeled', 'tracked', 'tracked', 'tracked'], personnel: 500,
    soft: q(48, 56, 66, 76), hard: q(22, 28, 36, 46), air: Z, naval: q(10, 14, 18, 24), sub: Z,
    rGround: q(1, 2, 2, 2), rAir: Z, rNaval: q(1, 1, 2, 2),
    dGround: q(18, 24, 28, 32), dAir: q(18, 22, 26, 30), dNaval: q(20, 24, 28, 32),
    speed: q(30, 40, 45, 50), spot: all(2), stealth: all(0.05),
    fuel: 80, cost: q(150, 250, 360, 480), mg: q(20, 28, 36, 45), days: q(45, 60, 70, 80), upkeep: q(0.9, 1.1, 1.3, 1.5),
    indirect: true, capture: false, desc: 'Tube artillery. Bombards enemies up to two hexes away without closing in.',
  },
  {
    cat: UnitCategory.RocketArtillery, key: 'rocket', tech: 'land_artillery',
    names: ['BR-72 Hailstorm MRL Battalion', 'MLRS-2 Tempest Battalion', 'HR-18 Firestorm Rocket Battalion', 'PR-30 Starfall Precision Rocket Battalion'],
    armor: 'soft', mobility: 'wheeled', personnel: 400,
    soft: q(60, 70, 80, 90), hard: q(26, 34, 44, 56), air: Z, naval: q(12, 18, 26, 34), sub: Z,
    rGround: q(2, 2, 3, 3), rAir: Z, rNaval: q(1, 2, 2, 3),
    dGround: q(16, 20, 24, 28), dAir: q(16, 20, 24, 28), dNaval: q(16, 20, 24, 28),
    speed: q(40, 50, 60, 65), spot: all(2), stealth: all(0.05),
    fuel: 90, cost: q(250, 380, 520, 700), mg: q(35, 45, 55, 70), days: q(60, 70, 80, 90), upkeep: q(1.1, 1.3, 1.6, 1.9),
    indirect: true, capture: false, desc: 'Multiple rocket launchers. Devastating area fire at two to three hexes.',
  },
  {
    cat: UnitCategory.AirDefense, key: 'airdef', tech: 'land_airdef',
    names: ['SA-70 Guardian SAM Battalion', 'SA-95 Bulwark SAM Battalion', 'SA-15 Skyshield SAM Battalion', 'SA-30 Aegis Dome IAMD Battalion'],
    armor: ['soft', 'soft', 'hard', 'hard'], mobility: 'wheeled', personnel: 450,
    soft: q(4, 5, 6, 8), hard: q(2, 3, 4, 5), air: q(52, 64, 78, 90), naval: Z, sub: Z,
    rGround: Z, rAir: q(2, 3, 3, 4), rNaval: Z,
    dGround: q(18, 22, 26, 30), dAir: q(50, 58, 68, 78), dNaval: q(18, 22, 26, 30),
    speed: q(35, 45, 55, 60), spot: q(3, 4, 5, 6), stealth: all(0.05),
    fuel: 90, cost: q(300, 550, 900, 1300), mg: q(30, 45, 65, 90), days: q(60, 80, 100, 120), upkeep: q(1.0, 1.4, 1.9, 2.4),
    capture: false, desc: 'Surface-to-air missile battalion. Shoots down aircraft within its engagement radius.',
  },
  {
    cat: UnitCategory.Recon, key: 'recon', tech: 'land_mech',
    names: ['BRD-75 Scout Company', 'RV-2 Pathfinder Recon Squadron', 'RV-18 Hawkeye Recon Squadron', 'RV-30 Nightwatch ISR Squadron'],
    armor: 'soft', mobility: 'wheeled', personnel: 450,
    soft: q(24, 30, 36, 42), hard: q(12, 18, 24, 30), air: q(2, 4, 6, 8), naval: Z, sub: Z,
    rGround: all(1), rAir: Z, rNaval: Z,
    dGround: q(26, 32, 38, 44), dAir: q(24, 28, 32, 36), dNaval: q(24, 28, 32, 36),
    speed: q(60, 70, 75, 80), spot: q(4, 5, 5, 6), stealth: q(0.2, 0.3, 0.35, 0.45),
    fuel: 100, cost: q(120, 180, 260, 350), mg: q(12, 18, 24, 30), days: q(40, 45, 50, 55), upkeep: q(0.6, 0.75, 0.9, 1.05),
    capture: true, desc: 'Fast reconnaissance unit with long spotting range.',
  },
  {
    cat: UnitCategory.SpecialForces, key: 'sof', tech: 'land_infantry',
    names: ['SF-80 Commando Battalion', 'SF-00 Ranger Battalion', 'SF-15 Special Operations Group', 'SF-30 Phantom Tier-1 Group'],
    armor: 'soft', mobility: 'foot', personnel: 400,
    soft: q(40, 48, 58, 68), hard: q(18, 26, 34, 44), air: q(6, 10, 14, 18), naval: q(4, 6, 8, 10), sub: Z,
    rGround: all(1), rAir: Z, rNaval: Z,
    dGround: q(40, 46, 54, 62), dAir: q(40, 46, 52, 58), dNaval: q(36, 42, 48, 54),
    speed: q(18, 20, 22, 24), spot: q(3, 3, 4, 4), stealth: q(0.35, 0.45, 0.55, 0.65),
    fuel: 150, cost: q(120, 180, 260, 360), mg: q(8, 11, 15, 20), days: q(60, 65, 70, 75), upkeep: q(0.7, 0.85, 1.0, 1.2),
    capture: true, desc: 'Elite light infantry. Stealthy, excellent in rough terrain and cities.',
  },
  {
    cat: UnitCategory.Engineers, key: 'engineer', tech: 'land_infantry',
    names: ['CE-80 Combat Engineer Battalion', 'CE-00 Sapper Battalion', 'CE-15 Breacher Engineer Battalion', 'CE-30 Titan Assault Engineer Battalion'],
    armor: 'soft', mobility: 'wheeled', personnel: 600,
    soft: q(18, 22, 28, 34), hard: q(14, 18, 24, 30), air: q(2, 3, 4, 6), naval: Z, sub: Z,
    rGround: all(1), rAir: Z, rNaval: Z,
    dGround: q(36, 42, 50, 58), dAir: q(28, 32, 36, 40), dNaval: q(28, 32, 36, 40),
    speed: q(30, 40, 45, 50), spot: all(2), stealth: all(0.05),
    fuel: 90, cost: q(80, 120, 170, 230), mg: q(8, 12, 16, 22), days: q(40, 45, 50, 55), upkeep: q(0.5, 0.6, 0.7, 0.85),
    capture: true, desc: 'Combat engineers. Speed river crossings and entrenchment for units they accompany.',
  },
  {
    cat: UnitCategory.MissileLauncher, key: 'missile', tech: 'missile_tactical',
    names: ['SS-70 Scimitar TBM Battalion', 'SS-95 Trident Cruise Missile Battalion', 'SS-12 Longsword Precision Strike Battalion', 'SS-30 Starlance Hypersonic Missile Battalion'],
    armor: 'soft', mobility: 'wheeled', personnel: 350,
    soft: q(62, 72, 82, 92), hard: q(45, 55, 66, 78), air: Z, naval: q(40, 52, 64, 76), sub: Z,
    rGround: q(4, 5, 5, 6), rAir: Z, rNaval: q(4, 5, 5, 6),
    dGround: q(14, 18, 22, 26), dAir: q(14, 18, 22, 26), dNaval: q(14, 18, 22, 26),
    speed: q(40, 50, 55, 60), spot: all(2), stealth: q(0.1, 0.15, 0.2, 0.25),
    fuel: 100, cost: q(500, 800, 1200, 1600), mg: q(60, 80, 100, 120), days: q(90, 110, 130, 150), upkeep: q(1.5, 1.9, 2.3, 2.7),
    indirect: true, capture: false, desc: 'Theatre missile battalion. Precision strikes on units and ships four to six hexes away.',
  },
  // ------------------------------------------------------------------- AIR
  {
    cat: UnitCategory.Fighter, key: 'fighter', tech: 'air_fighter',
    names: ['F-72 Kestrel Interceptor Squadron', 'F-95 Peregrine Air Superiority Squadron', 'F-28 Specter 5th-Gen Squadron', 'F-44 Nightwraith 6th-Gen Squadron'],
    armor: 'air', mobility: 'air', personnel: 250,
    soft: q(4, 6, 8, 10), hard: q(4, 6, 8, 10), air: q(58, 70, 82, 94), naval: q(4, 6, 8, 10), sub: Z,
    rGround: Z, rAir: all(2), rNaval: Z,
    dGround: q(55, 66, 78, 90), dAir: q(55, 66, 78, 90), dNaval: q(55, 66, 78, 90),
    speed: q(900, 1100, 1300, 1500), spot: q(3, 4, 5, 6), stealth: q(0, 0.1, 0.4, 0.6), rangeKm: q(800, 1000, 1200, 1400),
    fuel: 4, cost: q(900, 1500, 2200, 3200), mg: q(60, 90, 130, 180), days: q(180, 220, 260, 300), upkeep: q(2.6, 3.4, 4.3, 5.5),
    capture: false, desc: 'Air superiority fighters. Patrol and intercept to win control of the sky.',
  },
  {
    cat: UnitCategory.Multirole, key: 'multirole', tech: 'air_fighter',
    names: ['F/A-82 Cutlass Multirole Squadron', 'F/A-98 Mako Multirole Squadron', 'F/A-24 Gryphon Multirole Squadron', 'F/A-40 Stormhawk Multirole Squadron'],
    armor: 'air', mobility: 'air', personnel: 250,
    soft: q(30, 40, 50, 60), hard: q(30, 40, 52, 64), air: q(45, 56, 68, 80), naval: q(26, 36, 46, 58), sub: Z,
    rGround: Z, rAir: all(1), rNaval: Z,
    dGround: q(48, 58, 70, 82), dAir: q(48, 58, 70, 82), dNaval: q(48, 58, 70, 82),
    speed: q(850, 1000, 1150, 1300), spot: q(3, 4, 5, 5), stealth: q(0, 0.05, 0.35, 0.5), rangeKm: q(700, 900, 1100, 1300),
    fuel: 4, cost: q(800, 1300, 1900, 2800), mg: q(55, 80, 115, 160), days: q(170, 210, 250, 290), upkeep: q(2.4, 3.0, 3.8, 4.8),
    capture: false, desc: 'Multirole fighters. Strike ground and naval targets or fight for air superiority.',
  },
  {
    cat: UnitCategory.Strike, key: 'strike', tech: 'air_strike',
    names: ['A-75 Mauler Attack Squadron', 'A-92 Scorpion Strike Squadron', 'A-19 Manta Stealth Strike Squadron', 'A-34 Nemesis Strike Squadron'],
    armor: 'air', mobility: 'air', personnel: 240,
    soft: q(50, 60, 70, 80), hard: q(50, 62, 74, 86), air: q(10, 12, 16, 20), naval: q(40, 50, 60, 72), sub: Z,
    rGround: Z, rAir: Z, rNaval: Z,
    dGround: q(35, 42, 54, 66), dAir: q(35, 42, 54, 66), dNaval: q(35, 42, 54, 66),
    speed: q(750, 850, 950, 1050), spot: q(3, 3, 4, 4), stealth: q(0, 0, 0.5, 0.6), rangeKm: q(650, 850, 1000, 1200),
    fuel: 4, cost: q(700, 1100, 1600, 2300), mg: q(55, 80, 110, 150), days: q(160, 200, 240, 280), upkeep: q(2.2, 2.8, 3.5, 4.4),
    capture: false, desc: 'Dedicated ground-attack aircraft with heavy precision payloads.',
  },
  {
    cat: UnitCategory.Bomber, key: 'bomber', tech: 'air_strike',
    names: ['B-60 Colossus Heavy Bomber Squadron', 'B-88 Leviathan Strategic Bomber Squadron', 'B-12 Wraith Stealth Bomber Squadron', 'B-35 Obsidian Penetrating Bomber Squadron'],
    armor: 'air', mobility: 'air', personnel: 300,
    soft: q(75, 84, 92, 98), hard: q(55, 66, 76, 86), air: q(5, 5, 5, 5), naval: q(35, 45, 55, 65), sub: Z,
    rGround: Z, rAir: Z, rNaval: Z,
    dGround: q(30, 38, 55, 70), dAir: q(30, 38, 55, 70), dNaval: q(30, 38, 55, 70),
    speed: q(800, 850, 900, 1100), spot: all(3), stealth: q(0, 0.1, 0.7, 0.8), rangeKm: q(3500, 4500, 6000, 7000),
    fuel: 14, cost: q(2500, 4000, 6000, 9000), mg: q(120, 180, 250, 330), days: q(300, 360, 420, 480), upkeep: q(5.5, 7.0, 8.8, 11.0),
    capture: false, desc: 'Long-range strategic bombers. Strike deep behind the lines at cities and industry.',
  },
  {
    cat: UnitCategory.Helicopter, key: 'helicopter', tech: 'air_rotary',
    names: ['AH-70 Hornet Attack Helicopter Squadron', 'AH-90 Hellion Attack Helicopter Squadron', 'AH-15 Banshee Attack Helicopter Squadron', 'AH-30 Valkyrie Tiltrotor Attack Squadron'],
    armor: 'air', mobility: 'air', personnel: 220,
    soft: q(42, 50, 58, 66), hard: q(50, 60, 70, 80), air: q(3, 5, 8, 10), naval: q(12, 16, 20, 26), sub: q(10, 14, 18, 22),
    rGround: Z, rAir: Z, rNaval: Z,
    dGround: q(22, 28, 34, 40), dAir: q(22, 28, 34, 40), dNaval: q(22, 28, 34, 40),
    speed: q(220, 250, 270, 400), spot: q(3, 3, 4, 4), stealth: q(0, 0, 0.1, 0.2), rangeKm: q(180, 220, 260, 400),
    fuel: 3, cost: q(350, 550, 800, 1100), mg: q(30, 45, 60, 80), days: q(120, 140, 160, 180), upkeep: q(1.1, 1.4, 1.7, 2.1),
    capture: false, desc: 'Attack helicopters. Short-ranged tank hunters that support the front line.',
  },
  {
    cat: UnitCategory.AirTransport, key: 'transport', tech: 'air_rotary',
    names: ['C-70 Pelican Airlift Squadron', 'C-95 Albatross Airlift Squadron', 'C-15 Condor Strategic Airlift Squadron', 'C-30 Behemoth Heavy Airlift Squadron'],
    armor: 'air', mobility: 'air', personnel: 200,
    soft: Z, hard: Z, air: Z, naval: Z, sub: Z,
    rGround: Z, rAir: Z, rNaval: Z,
    dGround: q(12, 15, 18, 22), dAir: q(12, 15, 18, 22), dNaval: q(12, 15, 18, 22),
    speed: q(500, 650, 750, 800), spot: all(2), stealth: Z, rangeKm: q(2000, 2600, 3200, 3800),
    fuel: 10, cost: q(600, 900, 1200, 1500), mg: q(30, 40, 50, 60), days: q(150, 170, 190, 210), upkeep: q(1.2, 1.5, 1.8, 2.1),
    capture: false, desc: 'Transport aircraft. Improve supply of units near their airbase.',
  },
  {
    cat: UnitCategory.Drone, key: 'drone', tech: 'air_drone',
    names: ['MQ-8 Sparrowhawk UCAV Squadron', 'MQ-15 Vulture UCAV Squadron', 'MQ-24 Shrike Loyal Wingman Squadron', 'MQ-32 Swarmlord Autonomous Squadron'],
    armor: 'air', mobility: 'air', personnel: 120,
    soft: q(22, 32, 44, 56), hard: q(22, 34, 46, 58), air: q(0, 0, 6, 14), naval: q(10, 18, 26, 34), sub: Z,
    rGround: Z, rAir: Z, rNaval: Z,
    dGround: q(10, 14, 20, 28), dAir: q(10, 14, 20, 28), dNaval: q(10, 14, 20, 28),
    speed: q(180, 250, 400, 650), spot: q(4, 5, 6, 7), stealth: q(0.2, 0.3, 0.45, 0.6), rangeKm: q(700, 1000, 1400, 1800),
    fuel: 24, cost: q(150, 300, 500, 800), mg: q(15, 25, 40, 60), days: q(60, 80, 100, 120), upkeep: q(0.4, 0.6, 0.9, 1.2),
    capture: false, desc: 'Armed drones. Cheap, long-endurance strike and reconnaissance.',
  },
  // ----------------------------------------------------------------- NAVAL
  {
    cat: UnitCategory.PatrolBoat, key: 'patrol', tech: 'naval_surface',
    names: ['PB-80 Swift Patrol Flotilla', 'PC-00 Barracuda Fast Attack Flotilla', 'PC-15 Stingray Missile Boat Flotilla', 'PC-30 Wasp Unmanned Surface Flotilla'],
    armor: 'naval', mobility: 'naval', personnel: 120,
    soft: q(10, 12, 14, 16), hard: q(6, 8, 10, 12), air: q(6, 10, 14, 18), naval: q(18, 26, 34, 42), sub: q(6, 10, 14, 18),
    rGround: all(1), rAir: q(0, 1, 1, 1), rNaval: q(1, 1, 2, 2),
    dGround: all(20), dAir: q(18, 22, 26, 30), dNaval: q(20, 24, 28, 32),
    speed: q(45, 50, 55, 60), spot: q(2, 3, 3, 4), stealth: q(0.1, 0.15, 0.2, 0.3),
    fuel: 240, cost: q(80, 130, 190, 260), mg: q(8, 12, 16, 22), days: q(90, 110, 130, 150), upkeep: q(0.25, 0.32, 0.4, 0.48),
    capture: false, desc: 'Coastal patrol and fast attack craft flotilla.',
  },
  {
    cat: UnitCategory.Frigate, key: 'frigate', tech: 'naval_surface',
    names: ['FF-75 Harbor-class Frigate', 'FFG-95 Corsair-class Frigate', 'FFG-12 Meridian-class Frigate', 'FFG-28 Horizon-class Frigate'],
    armor: 'naval', mobility: 'naval', personnel: 180,
    soft: q(14, 16, 20, 24), hard: q(10, 12, 14, 18), air: q(30, 38, 46, 54), naval: q(36, 44, 52, 60), sub: q(44, 52, 60, 70),
    rGround: all(1), rAir: q(1, 2, 2, 2), rNaval: q(2, 2, 3, 3),
    dGround: q(35, 40, 45, 50), dAir: q(40, 48, 56, 64), dNaval: q(40, 48, 56, 64),
    speed: q(40, 42, 44, 46), spot: q(3, 4, 4, 5), stealth: q(0.05, 0.1, 0.15, 0.2),
    fuel: 500, cost: q(450, 650, 850, 1100), mg: q(40, 55, 70, 90), days: q(360, 420, 480, 540), upkeep: q(0.8, 1.0, 1.2, 1.4),
    capture: false, desc: 'Escort frigate specialised in anti-submarine warfare.',
  },
  {
    cat: UnitCategory.Destroyer, key: 'destroyer', tech: 'naval_surface',
    names: ['DD-70 Resolute-class Destroyer', 'DDG-90 Vigilant-class Destroyer', 'DDG-10 Arbiter-class Destroyer', 'DDG-30 Zenith-class Destroyer'],
    armor: 'naval', mobility: 'naval', personnel: 300,
    soft: q(22, 26, 30, 36), hard: q(14, 18, 22, 28), air: q(50, 62, 74, 86), naval: q(50, 60, 70, 80), sub: q(36, 44, 52, 62),
    rGround: all(2), rAir: q(2, 2, 3, 3), rNaval: q(3, 3, 4, 4),
    dGround: q(50, 56, 62, 68), dAir: q(50, 60, 70, 80), dNaval: q(50, 58, 66, 74),
    speed: q(44, 46, 48, 50), spot: q(4, 4, 5, 5), stealth: q(0.05, 0.1, 0.15, 0.3),
    fuel: 500, cost: q(1000, 1500, 2100, 2800), mg: q(80, 110, 140, 180), days: q(540, 600, 660, 720), upkeep: q(1.5, 1.9, 2.3, 2.8),
    capture: false, desc: 'Multi-mission guided-missile destroyer: area air defence, anti-ship and land attack.',
  },
  {
    cat: UnitCategory.Cruiser, key: 'cruiser', tech: 'naval_surface',
    names: ['CG-70 Dominion-class Cruiser', 'CG-88 Sovereign-class Cruiser', 'CG-12 Paramount-class Cruiser', 'CG-30 Imperator-class Cruiser'],
    armor: 'naval', mobility: 'naval', personnel: 400,
    soft: q(30, 34, 40, 46), hard: q(20, 24, 28, 34), air: q(64, 74, 84, 92), naval: q(62, 72, 82, 90), sub: q(26, 32, 38, 44),
    rGround: q(2, 2, 3, 3), rAir: q(3, 3, 4, 4), rNaval: q(4, 4, 5, 5),
    dGround: q(60, 64, 68, 72), dAir: q(60, 68, 76, 84), dNaval: q(60, 66, 72, 78),
    speed: q(44, 46, 48, 50), spot: all(5), stealth: q(0.02, 0.05, 0.1, 0.2),
    fuel: 600, cost: q(2200, 3000, 3800, 4800), mg: q(160, 200, 240, 300), days: q(720, 780, 840, 900), upkeep: q(2.6, 3.1, 3.6, 4.2),
    capture: false, desc: 'Large surface combatant with the heaviest missile load of any escort.',
  },
  {
    cat: UnitCategory.Carrier, key: 'carrier', tech: 'naval_carrier',
    names: ['CV-70 Majestic-class Carrier', 'CVN-85 Olympus-class Supercarrier', 'CVN-05 Monarch-class Supercarrier', 'CVN-30 Ascendant-class Supercarrier'],
    armor: 'naval', mobility: 'naval', personnel: 5000,
    soft: all(4), hard: all(4), air: q(20, 24, 28, 32), naval: q(6, 8, 8, 10), sub: q(10, 12, 14, 16),
    rGround: Z, rAir: all(1), rNaval: all(1),
    dGround: q(60, 66, 72, 80), dAir: q(50, 56, 62, 68), dNaval: q(60, 66, 72, 80),
    speed: q(48, 50, 52, 54), spot: all(6), stealth: Z,
    fuel: 5000, cost: q(6000, 9000, 12000, 14000), mg: q(400, 550, 700, 850), days: q(1080, 1200, 1320, 1460), upkeep: q(8, 10, 12, 14),
    capture: false, desc: 'Aircraft carrier. Hosts up to four air squadrons and projects air power worldwide.',
  },
  {
    cat: UnitCategory.Submarine, key: 'submarine', tech: 'naval_sub',
    names: ['SSK-75 Moray-class Diesel Submarine', 'SSN-90 Kraken-class Attack Submarine', 'SSN-10 Abyss-class Attack Submarine', 'SSN-30 Phantom-class Attack Submarine'],
    armor: 'sub', mobility: 'naval', personnel: 130,
    soft: q(0, 0, 10, 16), hard: q(0, 0, 8, 14), air: Z, naval: q(60, 70, 80, 90), sub: q(44, 54, 64, 76),
    rGround: q(0, 0, 3, 4), rAir: Z, rNaval: q(1, 2, 2, 3),
    dGround: q(45, 52, 60, 68), dAir: q(60, 65, 70, 75), dNaval: q(45, 52, 60, 68),
    speed: q(30, 36, 40, 45), spot: q(2, 3, 3, 4), stealth: q(0.6, 0.7, 0.8, 0.88),
    fuel: 1500, cost: q(900, 1600, 2600, 3600), mg: q(70, 110, 160, 210), days: q(540, 620, 700, 780), upkeep: q(1.2, 1.7, 2.3, 2.9),
    capture: false, desc: 'Attack submarine. Stealthy hunter of surface fleets and other submarines.',
  },
  {
    cat: UnitCategory.Amphibious, key: 'amphib', tech: 'naval_carrier',
    names: ['LST-75 Beachhead-class Landing Ship', 'LPD-95 Harbinger-class Assault Ship', 'LHD-10 Spearhead-class Assault Ship', 'LHA-30 Invictus-class Assault Ship'],
    armor: 'naval', mobility: 'naval', personnel: 1000,
    soft: q(16, 20, 24, 28), hard: q(8, 10, 12, 14), air: q(18, 24, 30, 36), naval: q(8, 10, 12, 14), sub: q(4, 6, 8, 10),
    rGround: q(1, 1, 2, 2), rAir: all(1), rNaval: all(1),
    dGround: q(40, 46, 52, 58), dAir: q(40, 46, 52, 58), dNaval: q(40, 46, 52, 58),
    speed: q(36, 38, 40, 42), spot: all(3), stealth: Z,
    fuel: 800, cost: q(1000, 1600, 2200, 3000), mg: q(80, 110, 140, 180), days: q(540, 600, 660, 720), upkeep: q(1.5, 1.9, 2.3, 2.7),
    capture: false, desc: 'Amphibious assault ship. Land units embarking from its port move faster and land stronger.',
  },
];

function pick<T>(v: T | [T, T, T, T], g: number): T {
  return Array.isArray(v) ? (v as T[])[g] : v;
}

function buildDesigns(): UnitDesign[] {
  const out: UnitDesign[] = [];
  for (const f of FAMILIES) {
    for (let g = 0; g < 4; g++) {
      const cls = CATEGORY_CLASS[f.cat];
      const id = `${f.key}_g${g + 1}`;
      const mob = pick(f.mobility, g);
      out.push({
        id,
        name: f.names[g],
        category: f.cat,
        cls,
        generation: g + 1,
        requiresTech: g === 0 || !f.tech ? null : `${f.tech}_${g + 1}`,
        armor: pick(f.armor, g),
        mobility: mob,
        personnel: f.personnel,
        attackSoft: f.soft[g],
        attackHard: f.hard[g],
        attackAir: f.air[g],
        attackNaval: f.naval[g],
        attackSub: f.sub[g],
        rangeGround: f.rGround[g],
        rangeAir: f.rAir[g],
        rangeNaval: f.rNaval[g],
        defenseGround: f.dGround[g],
        defenseAir: f.dAir[g],
        defenseNaval: f.dNaval[g],
        speedKmh: f.speed[g],
        spotting: f.spot[g],
        stealth: f.stealth[g],
        rangeKm: cls === UnitClass.Air ? (f.rangeKm ? f.rangeKm[g] : 800) : 0,
        fuelCapacity: f.fuel,
        cost: f.cost[g],
        militaryGoodsCost: f.mg[g],
        buildDays: f.days[g],
        upkeep: f.upkeep[g],
        indirect: !!f.indirect,
        canCapture: f.capture,
        description: `${f.desc} (Generation ${g + 1})`,
      });
    }
  }
  return out;
}

export const UNIT_DESIGNS: UnitDesign[] = buildDesigns();

/** Design id for a category key + generation (1..4). */
export function designId(cat: UnitCategory, gen: number): string {
  const f = FAMILIES.find((x) => x.cat === cat)!;
  return `${f.key}_g${Math.max(1, Math.min(4, gen))}`;
}

/** Tech id prefix of a category family. */
export function categoryTech(cat: UnitCategory): string | null {
  return FAMILIES.find((x) => x.cat === cat)?.tech ?? null;
}

export const CATEGORY_KEYS: Record<number, string> = Object.fromEntries(FAMILIES.map((f) => [f.cat, f.key]));
