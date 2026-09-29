/**
 * THE AMERICAS — real military equipment designed/built in the region (USA, Canada,
 * Brazil, Argentina, Mexico, Colombia, Chile ...) plus 1 Jan 2030 orders of battle.
 *
 * Stats are interpolated from the generic designs in src/sim/data/units.ts using a
 * "tier" value (1 = gen-1 ... 4 = gen-4, fractions allowed, ~4.5 = beyond current gen)
 * and then overridden per system where the real hardware differs. Scale notes:
 *  - land unit = one battalion (or battery group), air = squadron (12-24 airframes),
 *    naval = one major warship (patrol boats / river craft = flotilla).
 *  - inventory counts are scaled game units (roughly 1 per real battalion for heavy arms,
 *    1 per ~1.5 real light battalions), not a headcount.
 */
import { UNIT_DESIGNS } from '../../sim/data/units';
import { UnitCategory as C } from '../../sim/types';
import type { UnitDesign } from '../../sim/types';
import type { MilitaryDesign, NationInventory } from './schema';

type Ov = Partial<MilitaryDesign> & { k?: number };

const BASE = new Map<number, UnitDesign[]>();
for (const u of UNIT_DESIGNS) {
  const a = BASE.get(u.category) ?? [];
  a.push(u);
  BASE.set(u.category, a);
}
for (const a of BASE.values()) a.sort((x, y) => x.generation - y.generation);

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Build a design by interpolating generic stats at `tier`, then applying overrides. */
function d(
  id: string, name: string, cat: C, origin: string, year: number, tier: number,
  description: string, o: Ov = {},
): MilitaryDesign {
  const gs = BASE.get(cat)!;
  const i = clamp(Math.floor(tier) - 1, 0, 2);
  const f = tier - (i + 1);
  const near = gs[clamp(Math.round(tier) - 1, 0, 3)];
  const L = (k: keyof UnitDesign): number => {
    const a = gs[i][k] as number;
    const b = gs[i + 1][k] as number;
    return a + (b - a) * f;
  };
  const st = (k: keyof UnitDesign) => Math.round(clamp(L(k), 0, 100));
  const { k = 1, ...ov } = o;
  const m: MilitaryDesign = {
    id, name, category: cat, origin, year, future: false, exportable: true,
    armor: near.armor, mobility: near.mobility, personnel: near.personnel,
    attackSoft: st('attackSoft'), attackHard: st('attackHard'), attackAir: st('attackAir'),
    attackNaval: st('attackNaval'), attackSub: st('attackSub'),
    rangeGround: Math.round(L('rangeGround')), rangeAir: Math.round(L('rangeAir')), rangeNaval: Math.round(L('rangeNaval')),
    defenseGround: st('defenseGround'), defenseAir: st('defenseAir'), defenseNaval: st('defenseNaval'),
    speedKmh: Math.round(L('speedKmh')), spotting: Math.round(L('spotting')),
    stealth: Math.round(clamp(L('stealth'), 0, 0.95) * 100) / 100,
    rangeKm: near.cls === 1 ? Math.round(L('rangeKm')) : 0,
    fuelCapacity: near.fuelCapacity,
    cost: Math.round(L('cost') * k), militaryGoodsCost: Math.round(L('militaryGoodsCost') * k),
    buildDays: Math.round(L('buildDays')), upkeep: Math.round(L('upkeep') * k * 100) / 100,
    indirect: near.indirect, canCapture: near.canCapture,
    description,
  };
  return { ...m, ...ov };
}
/** Future design helper. */
function fu(
  id: string, name: string, cat: C, origin: string, year: number, tier: number,
  researchCost: number, predecessor: string | undefined, description: string, o: Ov = {},
): MilitaryDesign {
  return d(id, name, cat, origin, year, tier, description, { future: true, researchCost, predecessor, ...o });
}

const SOFT = 'soft' as const, HARD = 'hard' as const;
const WHEEL = 'wheeled' as const, TRACK = 'tracked' as const, FOOT = 'foot' as const;

// ============================================================================
// UNITED STATES — current designs
// ============================================================================
const USA: MilitaryDesign[] = [
  // ---- Armor
  d('m1a2_sepv3_abrams', 'M1A2 SEPv3 Abrams', C.Armor, 'USA', 2017, 3.8,
    '62-ton MBT with 120 mm M256 smoothbore, 1,500 hp AGT1500 turbine, Chobham/DU composite armor and Trophy APS retrofit; 67 km/h, 426 km range.', { exportable: true }),
  d('m1a2_sepv2_abrams', 'M1A2 SEPv2 Abrams', C.Armor, 'USA', 2008, 3.3,
    'Digitised Abrams with second-generation FLIR and TUSK urban survival kit; 120 mm gun, 62 tons, 67 km/h.'),
  d('m1a1_fep_abrams', 'M1A1 FEP Abrams', C.Armor, 'USA', 1996, 2.9,
    'Marine Corps/foreign-sale Abrams with depleted-uranium armor package and 120 mm gun; 63 tons, 67 km/h.', { exportTo: undefined }),
  // ---- Mechanized
  d('m2a4_bradley', 'M2A4 Bradley IFV', C.Mechanized, 'USA', 2020, 3.3,
    '33-ton IFV with 25 mm M242 Bushmaster, TOW-2B launcher and 6 dismounts; 66 km/h. Being upgraded to the M2A4E1 with Trophy APS.'),
  d('m2a4e1_bradley', 'M2A4E1 Bradley IFV', C.Mechanized, 'USA', 2024, 3.5,
    'Bradley with upgraded powertrain, Iron Fist-class APS integration and improved armor; 25 mm cannon and TOW ATGMs.'),
  d('stryker_a1_icv', 'M1126 Stryker A1 ICV', C.Mechanized, 'USA', 2019, 3.0,
    '8x8 wheeled infantry carrier (18.6 t) with M2 .50 cal or Mk19; 100 km/h road speed, double-V hull for mine protection.', { armor: HARD, mobility: WHEEL, speedKmh: 90 }),
  d('stryker_dragoon', 'M1296 Stryker Dragoon', C.Mechanized, 'USA', 2018, 3.3,
    'Stryker with unmanned 30 mm XM813 cannon and Javelin ATGM, giving the Stryker BCT organic firepower; 8x8, 100 km/h.', { armor: HARD, mobility: WHEEL, speedKmh: 90 }),
  d('acv_marine', 'BAE ACV-P Amphibious Combat Vehicle', C.Mechanized, 'USA', 2020, 3.0,
    'USMC 8x8 amphibious APC replacing the AAV-7; 30.5 t, 13 passengers, 12 km/h swim speed, .50 cal/Mk19 RWS.', { armor: HARD, mobility: WHEEL, speedKmh: 90 }),
  d('lav25a2', 'LAV-25A2 (Piranha)', C.Mechanized, 'USA', 1983, 2.4,
    'USMC 8x8 light armored vehicle with 25 mm chain gun; 12.8 t, 100 km/h, amphibious.', { armor: SOFT, mobility: WHEEL, speedKmh: 100 }),
  d('m113a3', 'M113A3 APC', C.Mechanized, 'USA', 1960, 1.9,
    'Ubiquitous 11-ton tracked aluminium APC with a .50 cal machine gun; 64 km/h, 11 troops. Used by dozens of armies worldwide.'),
  d('v150_commando', 'V-150 Commando', C.Mechanized, 'USA', 1971, 1.8,
    '4x4 armoured car / APC (Cadillac Gage) with turret-mounted 20 mm or .50 cal weapons; 10 t, 100 km/h. Popular across Latin America.', { armor: SOFT, mobility: WHEEL, speedKmh: 88 }),
  // ---- Infantry
  d('us_infantry_battalion', 'US Army IBCT Infantry Battalion', C.Infantry, 'USA', 2020, 3.5,
    'Light infantry battalion armed with M4A1/M7 rifles, Javelin, M240 and 60/81 mm mortars; ~700 soldiers with NVGs and squad radios.'),
  d('us_airborne_battalion', 'US Army Airborne / Air Assault Battalion', C.Infantry, 'USA', 2020, 3.6,
    '82nd/101st/173rd-style parachute or air-assault battalion, strategically deployable with heavy anti-armor punch; ~700 troops.', { speedKmh: 20 }),
  d('usmc_infantry_battalion', 'USMC Infantry Battalion (Force Design 2030)', C.Infantry, 'USA', 2022, 3.6,
    'Marine Littoral Regiment infantry battalion with NMESIS anti-ship support, Javelin, M27 IAR and organic loitering munitions; ~900 Marines.'),
  // ---- Special forces
  d('us_green_beret_battalion', 'US Army Special Forces Group Battalion', C.SpecialForces, 'USA', 2020, 3.9,
    'Green Beret SF battalion (12-man ODAs) specialised in unconventional warfare, foreign internal defence and direct action.'),
  d('us_ranger_battalion', '75th Ranger Regiment Battalion', C.SpecialForces, 'USA', 2020, 3.7,
    'Elite light infantry for airfield seizure and raids; parachute and helicopter insertion capable; ~600 Rangers.'),
  d('us_navy_seal_team', 'US Navy SEAL Team (NSW)', C.SpecialForces, 'USA', 2020, 4.0,
    'Maritime special operations team: direct action, hydrographic reconnaissance, hostage rescue and counter-terror; SDV and Combat Rubber Raiding Craft capable.', { stealth: 0.7 }),
  // ---- Recon
  d('m1127_stryker_rv', 'M1127 Stryker Reconnaissance Vehicle', C.Recon, 'USA', 2004, 3.0,
    'Stryker recon variant with LRAS3 sensors and remote weapon station for cavalry squadrons; 8x8, 100 km/h.', { mobility: WHEEL }),
  d('jltv_cavalry', 'JLTV Cavalry Troop (M1278 HGP)', C.Recon, 'USA', 2019, 3.1,
    'Joint Light Tactical Vehicle armed with M2/Mk19 or TOW; 6.4 t, 100 km/h, blast-protected crew capsule.'),
  d('m1117_asv', 'M1117 Guardian Armored Security Vehicle', C.Recon, 'USA', 1999, 2.6,
    '4x4 armoured security vehicle with Mk19/M2; 13 t, 100 km/h. Widely exported (Colombia, Iraq, Afghan forces).', { mobility: WHEEL }),
  // ---- Engineers
  d('us_combat_engineer_battalion', 'US Army Engineer Battalion (Combat)', C.Engineers, 'USA', 2020, 3.4,
    'Combat engineer battalion with M1132 ESV, Assault Breacher Vehicles, bridging and route clearance; obstacle breaching and construction.'),
  d('m1150_abv_engineers', 'M1150 Assault Breacher Vehicle Battalion', C.Engineers, 'USA', 2008, 3.6,
    'Abrams-chassis breacher with mine plough, MICLIC line charges and mine-clearing rakes; 72 t, armoured engineer assault.', { armor: HARD, mobility: TRACK }),
  // ---- Artillery
  d('m109a7_paladin', 'M109A7 Paladin Integrated Management', C.Artillery, 'USA', 2017, 3.5,
    '155 mm/39-cal SP howitzer on Bradley-based common chassis; 38 t, 24 km (30 km RAP), 4 rds/min. Replaces A6 Paladin.'),
  d('m777a2_howitzer', 'M777A2 155 mm Towed Howitzer', C.Artillery, 'USA', 2005, 3.1,
    'Ultralight 4.2-ton titanium towed 155 mm howitzer; 30 km (40 km Excalibur), 5 rds/min; used by US, Canada, Australia, India.', { armor: SOFT, mobility: WHEEL }),
  d('m119a3_howitzer', 'M119A3 105 mm Light Howitzer', C.Artillery, 'USA', 2015, 2.8,
    'Digital-fire-control 105 mm towed howitzer for IBCT and airborne units; 2.1 t, 19.5 km.', { armor: SOFT, mobility: WHEEL }),
  d('m1299_erca_howitzer', 'XM1299 ERCA Self-Propelled Howitzer', C.Artillery, 'USA', 2028, 3.8,
    '155 mm/58-cal Extended Range Cannon Artillery on M109 chassis with autoloader; 70+ km with XRAP rounds. Fielded in limited numbers by 2030.', { rangeGround: 2 }),
  // ---- Rocket artillery
  d('himars', 'M142 HIMARS', C.RocketArtillery, 'USA', 2005, 3.8,
    'Truck-mounted 6-rocket GMLRS or 1 ATACMS/PrSM launcher (5-ton FMTV); GMLRS 70-84 km with GPS/INS guidance.', { rangeGround: 3 }),
  d('m270a2_mlrs', 'M270A2 MLRS', C.RocketArtillery, 'USA', 2013, 3.7,
    'Tracked 12-rocket launcher on Bradley chassis firing GMLRS, ATACMS and PrSM; 25 t, 64 km/h.', { armor: HARD, mobility: TRACK, rangeGround: 3 }),
  // ---- Air defense
  d('patriot_pac3', 'MIM-104 Patriot PAC-3 MSE', C.AirDefense, 'USA', 2016, 3.9,
    'Multi-function AN/MPQ-65 radar with PAC-3 MSE hit-to-kill interceptors (~35 km altitude, 120 km vs aircraft); anti-ballistic missile capable. Battalion of 4-6 batteries.', { rangeAir: 4, spotting: 6 }),
  d('thaad', 'THAAD Battery', C.AirDefense, 'USA', 2008, 4.0,
    'Terminal High Altitude Area Defense: 6 launchers x 8 hit-to-kill interceptors and AN/TPY-2 radar; engages MRBMs/IRBMs at 150 km altitude and 200 km range.', { rangeAir: 5, spotting: 8, attackHard: 2, k: 1.2 }),
  d('nasams', 'NASAMS 3', C.AirDefense, 'USA', 2020, 3.5,
    'Kongsberg/Raytheon Norwegian-American SAM using AMRAAM-ER and AIM-9X from AN/MPQ-64 Sentinel; 40+ km range, integrates with IBCS. (US-Norwegian co-development.)', { rangeAir: 3 }),
  d('m1097_avenger', 'M1097 Avenger', C.AirDefense, 'USA', 1989, 2.4,
    'Humvee-mounted 8-Stinger short-range air defense turret with .50 cal; 5.5 km range.', { armor: SOFT, rangeAir: 2 }),
  d('m_shorad_stryker_a1', 'M-SHORAD Stryker A1', C.AirDefense, 'USA', 2021, 3.4,
    'Stryker with Stinger, Hellfire/AIM-9X launchers, 30 mm cannon and radar; counters UAVs, helicopters and cruise missiles for maneuver forces.', { mobility: WHEEL, rangeAir: 2 }),
  d('ifpc_inc2', 'IFPC Inc 2 Enduring Shield', C.AirDefense, 'USA', 2025, 3.6,
    'Indirect Fire Protection Capability: AIM-9X and AIM-9X Block II interceptors plus Sentinel A4 radar against cruise missiles, UAS and rockets.', { rangeAir: 3 }),
  // ---- Missile launchers
  d('prsm_launcher', 'PrSM Precision Strike Missile Battalion', C.MissileLauncher, 'USA', 2023, 3.8,
    'HIMARS/M270-launched PrSM Inc 1: 500+ km range, GPS/INS guided, replaces ATACMS; two missiles per pod.', { rangeGround: 6, rangeNaval: 4 }),
  d('typhon_mrc', 'Typhon Mid-Range Capability Battery', C.MissileLauncher, 'USA', 2024, 3.9,
    'Containerised launcher for SM-6 (~500 km) and Tomahawk (1,600 km) missiles; four launchers plus command post. Army/USMC theatre strike unit.', { rangeGround: 6, rangeNaval: 6 }),
  d('nmesis', 'NMESIS Naval Strike Missile Battery', C.MissileLauncher, 'USA', 2023, 3.6,
    'Navy/Marine Expeditionary Ship Interdiction System: Naval Strike Missile (185+ km) on unmanned JLTV-based launcher; 2 launchers per battery.', { rangeGround: 4, rangeNaval: 5, attackSoft: 55, attackHard: 50, attackNaval: 86 }),
  d('lgm30g_minuteman_iii', 'LGM-30G Minuteman III ICBM Squadron', C.MissileLauncher, 'USA', 1970, 3.0,
    'Silo-based three-stage solid ICBM (13,000 km, up to three MIRVed W87/W78 warheads); 400 deployed in three wings, replaced by LGM-35 Sentinel from the 2030s.', { exportable: false, rangeGround: 6, rangeNaval: 6, cost: 1500, indirect: true, mobility: WHEEL }),
  // ---- Fighters
  d('f22a_raptor', 'F-22A Raptor', C.Fighter, 'USA', 2005, 3.95,
    'Fifth-generation air-dominance stealth fighter: 2x F119 supercruise (Mach 1.8), 6 AIM-120D + 2 AIM-9X internal; 1,850 km combat radius.', { exportable: false, stealth: 0.62, rangeKm: 1300, cost: 3300 }),
  d('f15c_eagle', 'F-15C/D Eagle', C.Fighter, 'USA', 1979, 2.9,
    'Twin-engine Mach 2.5 air-superiority fighter with AN/APG-63(V)3 AESA, 8 AAMs, 1,900 km ferry; aging but potent, retiring from ANG.', { rangeKm: 1000 }),
  d('f15ex_eagle_ii', 'F-15EX Eagle II', C.Multirole, 'USA', 2021, 3.6,
    'Advanced Boeing F-15 with fly-by-wire, AN/APG-82 AESA, EPAWSS EW and 13 t external payload (12 AAMs); Mach 2.5.', { rangeKm: 1250, attackAir: 88 }),
  d('f15e_strike_eagle', 'F-15E Strike Eagle', C.Strike, 'USA', 1988, 3.0,
    'Two-seat all-weather deep-strike fighter with LANTIRN/Sniper pods and 11 t of ordnance; 1,270 km radius, Mach 2.5.', { attackAir: 40, rangeKm: 1250 }),
  d('f16c_block50', 'F-16C/D Block 50/52 Fighting Falcon', C.Multirole, 'USA', 1991, 2.9,
    'SEAD-optimised Falcon with F110-GE-129 engine, HARM targeting, AN/APG-68(V)5; the backbone of Air National Guard and allied fleets.', { rangeKm: 900 }),
  d('f16am_mlu', 'F-16AM/BM MLU Fighting Falcon', C.Multirole, 'USA', 1997, 2.7,
    'Mid-life-upgraded Block 15/20 Falcons with APG-66(V)2A radar, helmet-mounted cueing and AIM-120; exported to European and South American air forces (ex-Dutch, Danish, Norwegian).', { rangeKm: 850 }),
  d('f16v_block70', 'F-16 Block 70/72 Viper', C.Multirole, 'USA', 2019, 3.4,
    'Newest F-16: AN/APG-83 SABR AESA radar, conformal tanks, Automatic Ground Collision Avoidance and ~12,000 hr life; Mach 2.',  { rangeKm: 1000 }),
  d('f35a', 'F-35A Lightning II', C.Multirole, 'USA', 2016, 4.0,
    'Conventional-takeoff fifth-gen stealth multirole: F135 engine (Mach 1.6), AN/APG-81 AESA, EOTS, DAS; 2 AIM-120 + 2 JDAM internal; TR-3 Block 4 upgrades; 1,090 km radius.', { stealth: 0.55, rangeKm: 1100, cost: 3000, upkeep: 4.9 }),
  d('f35b', 'F-35B Lightning II', C.Multirole, 'USA', 2015, 3.85,
    'Short take-off/vertical landing F-35 with lift-fan; USMC/UK/Italy/Japan amphibious ships and austere bases; 830 km radius.', { stealth: 0.55, rangeKm: 900, cost: 3200 }),
  d('f35c', 'F-35C Lightning II', C.Multirole, 'USA', 2019, 3.9,
    'Carrier-variant F-35 with larger wings and folding tips, strengthened gear; 1,100 km radius, Navy/USMC carrier air wings.', { stealth: 0.55, rangeKm: 1150, cost: 3200 }),
  d('fa18ef_super_hornet', 'F/A-18E/F Super Hornet Block III', C.Multirole, 'USA', 1999, 3.3,
    'Carrier-based multirole twin-engine jet with AN/APG-79 AESA, conformal tanks, IRST and Advanced Cockpit System; 11 hardpoints, Mach 1.8.', { rangeKm: 1050, exportable: true }),
  d('ea18g_growler', 'EA-18G Growler', C.Strike, 'USA', 2009, 3.2,
    'Electronic-attack Super Hornet with ALQ-99/NGJ jammers and AGM-88G AARGM-ER; suppresses enemy air defenses.', { attackAir: 24, attackSoft: 44, attackHard: 44, rangeKm: 1000 }),
  d('a10c_thunderbolt_ii', 'A-10C Thunderbolt II', C.Strike, 'USA', 1977, 2.6,
    'Close air support jet built around the 30 mm GAU-8 Avenger cannon; titanium tub armor, 7.2 t of ordnance, 550 km/h.', { attackHard: 72, attackSoft: 68, speedKmh: 560, rangeKm: 460 }),
  d('ac130j_ghostrider', 'AC-130J Ghostrider', C.Strike, 'USA', 2017, 3.0,
    'Gunship C-130J with 30 mm, 105 mm howitzer, Griffin and Hellfire missiles, precision-guided munitions; long loiter.', { attackSoft: 78, speedKmh: 580, rangeKm: 1200 }),
  d('p8a_poseidon', 'P-8A Poseidon', C.Strike, 'USA', 2013, 3.2,
    'Boeing 737-based maritime patrol aircraft with APY-10 radar, sonobuoys, Mk 54 torpedoes, Harpoon; Mach 0.79, 2,200 km radius; used by US, UK, Australia, India, Canada (soon).', { attackSoft: 12, attackHard: 12, attackNaval: 60, attackSub: 70, speedKmh: 780, rangeKm: 2200, spotting: 7, cost: 1900 }),
  // ---- Bombers
  d('b1b_lancer', 'B-1B Lancer', C.Bomber, 'USA', 1986, 3.0,
    'Variable-sweep supersonic bomber (Mach 1.25) with 34 t internal payload (JASSM-ER/LRASM); 9,400 km unrefueled.', { rangeKm: 6200, stealth: 0.2 }),
  d('b2a_spirit', 'B-2A Spirit', C.Bomber, 'USA', 1997, 3.8,
    'Flying-wing stealth bomber: 18 t payload incl. GBU-57 MOP and B61-12, 11,000 km range, low observable; 20 built.', { exportable: false, rangeKm: 7000, cost: 8500 }),
  d('b21_raider', 'B-21 Raider', C.Bomber, 'USA', 2027, 4.2,
    'Sixth-generation stealth strategic bomber by Northrop Grumman: open-architecture, dual nuclear/conventional, ~14 t payload; first squadrons at Ellsworth AFB by 2030.', { exportable: false, stealth: 0.88, rangeKm: 7500, cost: 9500 }),
  d('b52h_stratofortress', 'B-52H Stratofortress', C.Bomber, 'USA', 1962, 2.6,
    'Eight-engine bomber with 31 t payload; carries ALCM/LRSO cruise missiles and JASSM-ER; 14,000 km range with refueling; airframes to fly beyond 2050.', { rangeKm: 7000, stealth: 0.02 }),
  // ---- Helicopters
  d('ah64e_apache_guardian', 'AH-64E Apache Guardian (v6)', C.Helicopter, 'USA', 2011, 3.7,
    'Attack helicopter with Longbow radar, 16 Hellfire/JAGM, 30 mm M230 and Manned-Unmanned Teaming with MQ-1C; 293 km/h, 480 km range.'),
  d('ah1z_viper', 'AH-1Z Viper', C.Helicopter, 'USA', 2010, 3.2,
    'Bell attack helicopter (USMC) with four-blade rotor, Sniper pod, Hellfire/JAGM and AIM-9; 411 km/h dash.'),
  d('uh60m_blackhawk', 'UH-60M Black Hawk', C.Helicopter, 'USA', 2007, 2.7,
    'Utility helicopter with T700-GE-701D engines, 11 troops or 1.2 t sling load; 295 km/h, 590 km range; door guns and limited armament.', { attackSoft: 20, attackHard: 12, attackAir: 4, cost: 260, militaryGoodsCost: 26 }),
  d('ch47f_chinook', 'CH-47F Chinook', C.Helicopter, 'USA', 2007, 2.8,
    'Heavy tandem-rotor lift helicopter: 33 troops or 10 t external; 315 km/h. Block II upgrade with new rotors.', { attackSoft: 12, attackHard: 6, attackAir: 3, cost: 320, militaryGoodsCost: 30, speedKmh: 260 }),
  d('mv22b_osprey', 'MV-22B Osprey', C.Helicopter, 'USA', 2007, 3.0,
    'Tiltrotor assault transport: 24 Marines, 509 km/h cruise, 1,600 km range with air refueling.', { attackSoft: 8, attackHard: 4, attackAir: 2, speedKmh: 450, rangeKm: 700, cost: 420, militaryGoodsCost: 38 }),
  d('ch53k_king_stallion', 'CH-53K King Stallion', C.Helicopter, 'USA', 2022, 3.2,
    'USMC/Israeli heavy-lift helicopter with three 7,500 shp engines: 12 t external load, 315 km/h.', { attackSoft: 10, attackHard: 4, attackAir: 2, cost: 480, militaryGoodsCost: 42, speedKmh: 280 }),
  d('mh60r_seahawk', 'MH-60R Seahawk', C.Helicopter, 'USA', 2006, 3.1,
    'Navy ASW/ASuW helicopter with AN/APS-153 radar, dipping sonar, Mk 54 torpedoes and Hellfire; 15 systems networked with Aegis; exported to Australia, Norway, India, Greece.', { attackSoft: 18, attackHard: 16, attackAir: 3, attackNaval: 28, attackSub: 34, spotting: 5, cost: 330 }),
  // ---- Transports
  d('c17a_globemaster_iii', 'C-17A Globemaster III', C.AirTransport, 'USA', 1995, 3.5,
    'Strategic airlifter: 77 t payload (M1 Abrams), 4,480 km range; can land on 1,060 m strips. 275 built.', { rangeKm: 4400, cost: 1650 }),
  d('c5m_super_galaxy', 'C-5M Super Galaxy', C.AirTransport, 'USA', 2016, 3.7,
    'Re-engined giant airlifter: 122 t payload, 7,000 km range; only aircraft to carry outsize cargo such as M1 Abrams pairs.', { rangeKm: 4500, speedKmh: 830, cost: 1700 }),
  d('c130j_super_hercules', 'C-130J-30 Super Hercules', C.AirTransport, 'USA', 1999, 3.0,
    'Four-turboprop tactical airlifter with 20 t payload, 6-blade props; 660 km/h, 3,300 km range; operated by 20+ nations.', { cost: 900, speedKmh: 640, rangeKm: 3200 }),
  d('kc46a_pegasus', 'KC-46A Pegasus', C.AirTransport, 'USA', 2019, 3.4,
    '767-based air refueler/transport with boom and drogue; 96 t fuel offload; extends the radius of all NATO fighters.', { rangeKm: 4000, cost: 1650, spotting: 3 }),
  d('kc135r_stratotanker', 'KC-135R Stratotanker', C.AirTransport, 'USA', 1957, 2.4,
    'Backbone tanker with 91 t fuel capacity; 707-derived; to be replaced by KC-46.', { rangeKm: 3400, cost: 900 }),
  // ---- Drones
  d('mq9a_reaper', 'MQ-9A Reaper', C.Drone, 'USA', 2007, 3.0,
    'MALE UCAV with 27 h endurance, 1.7 t payload: Hellfire, GBU-12, GBU-38; 482 km/h, 1,850 km radius; MQ-9B SkyGuardian is exported to Canada, UK, Belgium, Japan, India.', { rangeKm: 1800 }),
  d('mq9b_skyguardian', 'MQ-9B SkyGuardian / SeaGuardian', C.Drone, 'USA', 2021, 3.2,
    'Long-endurance (40 h) drone with STANAG 4671 certification, radar and sonobuoy payloads; ISR and maritime patrol.', { rangeKm: 2200, attackNaval: 24, attackSub: 6, spotting: 8 }),
  d('mq1c_gray_eagle', 'MQ-1C Gray Eagle', C.Drone, 'USA', 2009, 2.6,
    'Army 25-hour MALE UAV with heavy-fuel engine carrying four Hellfire and SATCOM; 270 km/h.', { rangeKm: 1200 }),
  d('rq4b_global_hawk', 'RQ-4B Global Hawk', C.Drone, 'USA', 2006, 3.4,
    'HALE surveillance UAV: 20 km altitude, 32 h endurance, SAR/EO/IR and SIGINT; 570 km/h, 22,800 km range.', { attackSoft: 0, attackHard: 0, attackNaval: 0, spotting: 12, rangeKm: 3500, speedKmh: 570, cost: 2200 }),
  d('mq4c_triton', 'MQ-4C Triton', C.Drone, 'USA', 2020, 3.4,
    'Maritime HALE UAV with AN/ZPY-3 multifunction radar, 24 h endurance, 360-degree coverage of 7.4 million km2.', { attackSoft: 0, attackHard: 0, attackNaval: 0, spotting: 12, rangeKm: 3500, speedKmh: 560, cost: 2300 }),
  d('mq25a_stingray', 'MQ-25A Stingray', C.Drone, 'USA', 2026, 3.3,
    'Carrier-based unmanned aerial refueler (6.8 t offload at 830 km) with ISR; frees F/A-18s from tanking duty.', { attackSoft: 0, attackHard: 0, attackNaval: 0, spotting: 6, rangeKm: 1800, cost: 600 }),
  d('xq58_valkyrie', 'XQ-58A Valkyrie', C.Drone, 'USA', 2028, 3.6,
    'Low-cost attritable jet UCAV (Mach 0.85, 5,500 km ferry) as collaborative wingman; carries 250 kg internal payload.', { stealth: 0.4, cost: 220, rangeKm: 1600 }),
  // ---- Naval
  d('arleigh_burke_flt1', 'Arleigh Burke Flight I/II (DDG-51)', C.Destroyer, 'USA', 1991, 2.8,
    'First-generation Aegis guided-missile destroyer: SPY-1D radar, 90 VLS cells, Harpoon, 5-inch gun; 8,300 t, 30 kn.', { exportable: false }),
  d('arleigh_burke_flt2a', 'Arleigh Burke Flight IIA (DDG-51)', C.Destroyer, 'USA', 2000, 3.3,
    'Helo hangars (2 MH-60R), 96 VLS cells (SM-2/SM-6/Tomahawk/ESSM), upgraded Aegis Baseline 9; 9,200 t.', { exportable: false }),
  d('arleigh_burke_flt3', 'Arleigh Burke Flight III (DDG-51)', C.Destroyer, 'USA', 2023, 3.9,
    'AN/SPY-6(V)1 AMDR radar, Aegis Baseline 10, 96 VLS; 5x the sensitivity of SPY-1D; 9,700 t, 30 kn; exported (Japan Maya-class, Spain F110 derivative).', { exportable: false, cost: 2900 }),
  d('zumwalt_ddg1000', 'Zumwalt-class Destroyer (DDG-1000)', C.Destroyer, 'USA', 2016, 3.5,
    'Stealth wave-piercing hull, 80 VLS (Mk 57 PVLS) converted for Conventional Prompt Strike hypersonics, two 155 mm AGS; 15,600 t, 30 kn. Only three built.', { exportable: false, stealth: 0.5, cost: 4200, rangeGround: 3 }),
  d('ticonderoga_cg47', 'Ticonderoga-class Cruiser (CG-47)', C.Cruiser, 'USA', 1983, 2.9,
    'Aegis cruiser with 122 VLS cells and 2 x 5-inch guns; fleet air-defense command ship; 9,800 t, 32 kn; the last few upgraded units serve until 2030.', { exportable: false }),
  d('constellation_ffg62', 'Constellation-class Frigate (FFG-62)', C.Frigate, 'USA', 2029, 3.4,
    'FREMM-derived multi-mission frigate: SPY-6(V)3, 32 VLS (SM-2, ESSM, NSM), Mk 110 57 mm; 7,300 t, 26 kn. Program cut back to two ships.', { exportable: false, cost: 1300 }),
  d('lcs_freedom', 'Freedom-class Littoral Combat Ship (LCS)', C.Frigate, 'USA', 2008, 2.3,
    'Semi-planing monohull, 3,450 t, 40+ kn with interchangeable mission modules (surface, mine, ASW); 57 mm Mk 110 and RAM/SeaRAM.', { attackSub: 32, attackAir: 26, cost: 550 }),
  d('lcs_independence', 'Independence-class Littoral Combat Ship (LCS)', C.Frigate, 'USA', 2010, 2.4,
    'Trimaran aluminium hull, 3,100 t, 44 kn, large flight deck and mission bay; 57 mm gun, RAM, NSM anti-ship missiles retrofitted.', { attackSub: 34, attackAir: 26, cost: 560 }),
  d('legend_nsc', 'Legend-class National Security Cutter (USCG)', C.Frigate, 'USA', 2008, 2.2,
    '127 m, 4,500 t Coast Guard cutter: 57 mm gun, Phalanx CIWS, helicopter deck; 28 kn, 12,000 nm range. The Coast Guard flagship.', { attackNaval: 26, attackSub: 20, attackAir: 24, cost: 700 }),
  d('sentinel_frc', 'Sentinel-class Fast Response Cutter (USCG)', C.PatrolBoat, 'USA', 2012, 2.4,
    '46 m, 353 t cutter with 25 mm Mk 38 gun; 28 kn; exported to Dominican Republic, Costa Rica-style partners under the FMS program.'),
  d('cyclone_pc', 'Cyclone-class Patrol Coastal', C.PatrolBoat, 'USA', 1993, 2.1,
    '55 m, 331 t patrol craft with 25 mm gun, Stinger and .50 cal; 35 kn; support of SOF and coastal patrol; transferred to allies.'),
  d('defender_class_rb', 'Defender-class Response Boat (RB-S)', C.PatrolBoat, 'USA', 2002, 1.6,
    '7.6 m aluminium patrol boat with .50 cal; 46 kn; exported by the dozen to Caribbean and Central American coast guards.', { cost: 40 }),
  d('heritage_opc', 'Heritage-class Offshore Patrol Cutter (USCG)', C.PatrolBoat, 'USA', 2025, 2.7,
    '110 m, 3,700 t medium endurance cutter with 57 mm gun, RWS and helo deck; 22 kn; 60 planned.', { attackNaval: 24, spotting: 4, cost: 320 }),
  d('nimitz_cvn68', 'Nimitz-class Carrier (CVN-68)', C.Carrier, 'USA', 1975, 3.2,
    '100,000-ton nuclear supercarrier with 2 A1W reactors; 4 catapults, 60+ aircraft air wing (2 F-35C squadrons, 2 F/A-18 squadrons, E-2D, EA-18G); 30+ kn, unlimited range.', { exportable: false }),
  d('ford_cvn78', 'Gerald R. Ford-class Carrier (CVN-78)', C.Carrier, 'USA', 2017, 3.95,
    '100,000-ton nuclear supercarrier with EMALS electromagnetic catapults, AAG, A1B reactors; 75+ aircraft; 33% higher sortie rate; 4,500 crew.', { exportable: false, cost: 13500 }),
  d('los_angeles_ssn688', 'Los Angeles-class SSN (SSN-688)', C.Submarine, 'USA', 1976, 2.7,
    '6,900 t nuclear attack submarine with Mk 48 torpedoes, Tomahawk VLS (Improved variant); 33 kn.', { exportable: false }),
  d('seawolf_ssn21', 'Seawolf-class SSN (SSN-21)', C.Submarine, 'USA', 1997, 3.3,
    '9,100 t ultra-quiet attack submarine with 8 x 660 mm tubes and 50 weapons; 35 kn; only three built.', { exportable: false }),
  d('virginia_block4', 'Virginia-class SSN Block III/IV', C.Submarine, 'USA', 2014, 3.6,
    '7,900 t nuclear attack submarine with 2 large-diameter Virginia Payload Tubes (12 Tomahawk) and 4 torpedo tubes; 34 kn; 30 years reactor-core life.', { exportable: false }),
  d('virginia_block5', 'Virginia-class SSN Block V (VPM)', C.Submarine, 'USA', 2026, 3.9,
    '10,200 t Virginia Payload Module hull plug with 28 additional Tomahawk/CPS missiles; AUKUS-shared; 34 kn; quietest US attack boat.', { exportable: false, cost: 4500 }),
  d('ohio_ssbn', 'Ohio-class SSBN (SSBN-726)', C.Submarine, 'USA', 1981, 3.0,
    '18,750 t ballistic-missile submarine carrying 20 Trident II D5 SLBMs (12,000 km) with up to 8 warheads each; strategic deterrent until replaced by Columbia.', { exportable: false, attackNaval: 40, attackSub: 26, rangeGround: 6, cost: 3400 }),
  d('america_lha6', 'America-class LHA (LHA-6)', C.Amphibious, 'USA', 2014, 3.6,
    '45,000 t large-deck amphibious assault ship without well deck; 13 F-35B/MV-22 aircraft, 1,650 Marines; 22 kn.', { exportable: false }),
  d('wasp_lhd1', 'Wasp-class LHD (LHD-1)', C.Amphibious, 'USA', 1989, 3.3,
    '41,000 t amphibious assault ship with well deck, 6 F-35B/8 AV-8B, 1,700 Marines, 3 LCACs; 22 kn.', { exportable: false }),
  d('san_antonio_lpd17', 'San Antonio-class LPD (LPD-17)', C.Amphibious, 'USA', 2006, 3.1,
    '25,000 t amphibious transport dock, 800 Marines, 2 LCACs, helo deck; Flight II adds Mk 41 VLS.', { exportable: false }),
  d('whidbey_island_lsd', 'Whidbey Island-class LSD (LSD-41)', C.Amphibious, 'USA', 1985, 2.5,
    '16,000 t dock landing ship carrying 4 LCACs and 500 Marines; 20 kn; the class retires by the 2030s.', { exportable: false }),
];

// ============================================================================
// UNITED STATES — future designs (research after 2030)
// ============================================================================
const USA_FUTURE: MilitaryDesign[] = [
  fu('usa_f47_ngad', 'F-47 Next Generation Air Dominance', C.Fighter, 'USA', 2034, 4.6, 14000, 'f22a_raptor',
    'Boeing sixth-generation crewed air-dominance fighter with tailless stealth design, adaptive-cycle engines, Mach 2+ and 1,850+ km combat radius; controls CCA wingmen.',
    { exportable: false, stealth: 0.85, rangeKm: 1900, cost: 4600 }),
  fu('usa_fa_xx', 'F/A-XX Carrier Strike Fighter', C.Multirole, 'USA', 2035, 4.4, 12000, 'fa18ef_super_hornet',
    'Navy sixth-generation carrier fighter: long-range stealth, sensors and AI teaming with carrier-based CCAs to replace F/A-18E/F.',
    { exportable: false, stealth: 0.8, rangeKm: 1700, cost: 4000 }),
  fu('usa_cca_increment1', 'Collaborative Combat Aircraft (CCA Inc 1 / YFQ-42A, YFQ-44A)', C.Drone, 'USA', 2029, 4.0, 7000, 'xq58_valkyrie',
    'Semi-autonomous jet wingman ($25-30M each) that flies alongside F-35/F-47 carrying AAMs, sensors or EW payloads; ~1,850 km range.',
    { stealth: 0.5, attackAir: 40, rangeKm: 1800, cost: 650 }),
  fu('usa_b52j_stratofortress', 'B-52J Stratofortress (CERP)', C.Bomber, 'USA', 2033, 3.0, 5500, 'b52h_stratofortress',
    'Re-engined B-52 with Rolls-Royce F130 turbofans, AN/APY-24 radar and new avionics; 40% longer range and 7-hardpoint LRSO/hypersonic capability.',
    { rangeKm: 8500, stealth: 0.05 }),
  fu('usa_flraa_v280_valor', 'MV-75 FLRAA (Bell V-280 Valor)', C.Helicopter, 'USA', 2031, 4.1, 9000, 'uh60m_blackhawk',
    'Future Long-Range Assault Aircraft: tiltrotor at 520 km/h with 1,480 km range, 14 troops; replaces UH-60M; door guns and Hellfire/JAGM options.',
    { attackSoft: 22, attackHard: 16, attackAir: 4, speedKmh: 500, rangeKm: 800, cost: 620 }),
  fu('usa_xm30_micv', 'XM30 Mechanized Infantry Combat Vehicle', C.Mechanized, 'USA', 2032, 4.1, 8500, 'm2a4e1_bradley',
    'Optionally manned hybrid-electric IFV with 50 mm XM913 chain gun, ATGM, active protection and modular armor; 2 crew + 9 dismounts; replaces Bradley.',
    { cost: 800 }),
  fu('usa_m1e3_abrams', 'M1E3 Abrams', C.Armor, 'USA', 2033, 4.2, 9500, 'm1a2_sepv3_abrams',
    'Lighter (60 t) Abrams with autoloader, 3-man crew, hybrid-electric drive, Trophy APS and modular armor for drone-era survivability.',
    { cost: 1250 }),
  fu('usa_ddgx', 'DDG(X) Next Generation Destroyer', C.Destroyer, 'USA', 2034, 4.4, 12000, 'arleigh_burke_flt3',
    'Large (~13,500 t) integrated-electric destroyer with SPY-6, directed-energy weapons, hypersonic missiles and CPS; replaces Arleigh Burke class.',
    { exportable: false, cost: 3800 }),
  fu('usa_ssnx', 'SSN(X) Next Generation Attack Submarine', C.Submarine, 'USA', 2038, 4.4, 14000, 'virginia_block5',
    'Post-Virginia attack submarine with Seawolf-level quieting and Virginia-class payload; speed above 35 kn; entering service 2038-40.',
    { exportable: false, cost: 5800 }),
  fu('columbia_class', 'Columbia-class SSBN', C.Submarine, 'USA', 2031, 3.9, 10000, 'ohio_ssbn',
    '21,000 t ballistic-missile submarine with 16 Trident II D5LE missiles, life-of-ship reactor core and electric drive; replaces the Ohio class.',
    { exportable: false, attackNaval: 40, attackSub: 30, rangeGround: 6, cost: 7000 }),
  fu('usa_dark_eagle', 'LRHW Dark Eagle Hypersonic Battery', C.MissileLauncher, 'USA', 2030, 4.1, 8000, 'prsm_launcher',
    'Army Long-Range Hypersonic Weapon: 4 launchers with CHGB glide bodies flying Mach 5+ at 2,775 km; unpowered glide vehicles defeat existing air defenses.',
    { exportable: false, rangeGround: 6, rangeNaval: 6, cost: 2000 }),
  fu('usa_erca', 'XM1299 ERCA Battalion (production)', C.Artillery, 'USA', 2031, 4.1, 5500, 'm109a7_paladin',
    '155 mm/58-cal self-propelled howitzer with autoloader firing Excalibur/XRAP to 70+ km; 6-8 rds/min.',
    { rangeGround: 3, cost: 560 }),
  fu('lgm35_sentinel', 'LGM-35A Sentinel ICBM', C.MissileLauncher, 'USA', 2034, 3.6, 9000, 'lgm30g_minuteman_iii',
    'Next-generation solid-fuel ICBM replacing Minuteman III; new silos and command network; range 13,000+ km with a W87-1 warhead.',
    { exportable: false, rangeGround: 6, rangeNaval: 6, cost: 2200, mobility: 'wheeled' }),
  fu('usa_future_soldier_battalion', 'Future Soldier Squad (NGSW) Infantry Battalion', C.Infantry, 'USA', 2033, 4.2, 5000, 'us_infantry_battalion',
    'Battalion equipped with 6.8 mm XM7 rifles/XM250 MG, IVAS-class augmented reality, small drones and exoskeleton-assisted loadouts.',
    { cost: 260 }),
  fu('usa_rcv_robotic_combat', 'Robotic Combat Vehicle Recon Squadron (XM30-family)', C.Recon, 'USA', 2032, 4.1, 5200, 'jltv_cavalry',
    'Unmanned tracked scout vehicles (RCV-Light/Medium) teaming with manned tanks, carrying 30 mm cannons, ATGMs and loitering munitions.',
    { stealth: 0.5, cost: 380 }),
  fu('usa_gpi_bmd', 'Glide Phase Interceptor / NGI Battery', C.AirDefense, 'USA', 2035, 4.4, 10000, 'thaad',
    'Missile-defense battalion with Glide Phase Interceptors and Next Generation Interceptor for hypersonic and ICBM threats; layered with SPY-6.',
    { rangeAir: 6, spotting: 9, attackAir: 96, cost: 1800 }),
  fu('usa_ifpc_hel', 'Enduring HEL Directed-Energy Air Defense', C.AirDefense, 'USA', 2032, 4.1, 7000, 'ifpc_inc2',
    '300 kW-class high-energy laser and HPM battery on Stryker/JLTV chassis engaging drones, mortars and cruise missiles at low cost per shot.',
    { rangeAir: 2, attackAir: 88, cost: 1000 }),
  fu('usa_ffgx', 'FF(X) Next Frigate', C.Frigate, 'USA', 2032, 3.8, 5500, 'constellation_ffg62',
    'Navy frigate based on the Legend-class National Security Cutter hull: 16 VLS, 57 mm, NSM, 3,900 t, 28 kn; replaces cancelled Constellation program.',
    { exportable: false, cost: 950 }),
  fu('usa_medium_landing_ship', 'Landing Ship Medium (LSM / Landing Craft Utility II)', C.Amphibious, 'USA', 2029, 3.4, 4500, 'san_antonio_lpd17',
    'Low-cost 4,000-ton beachable landing ship carrying 75 Marines and NMESIS launchers; 14 kn; supports Littoral Regiment operations.',
    { cost: 500, attackNaval: 8 }),
  fu('usa_hypersonic_hacm', 'HACM Hypersonic Strike Fighter Wing (HACM/ARRW)', C.Strike, 'USA', 2032, 4.2, 9000, 'f15e_strike_eagle',
    'F-15EX/B-21 launched Hypersonic Attack Cruise Missile (Mach 5+, 1,000+ km) squadron; air-breathing scramjet.',
    { attackHard: 92, attackSoft: 86, stealth: 0.2, cost: 3100, exportable: false }),
];

// ============================================================================
// CANADA
// ============================================================================
const CAN: MilitaryDesign[] = [
  d('lav6_canada', 'LAV 6.0 (LAV III Upgrade)', C.Mechanized, 'CAN', 2020, 3.1,
    'GDLS-Canada 8x8 with 25 mm M242 chain gun, 24 t; 100 km/h; basis of Canadian Army mechanized battalions and Saudi/Kuwaiti exports.', { armor: HARD, mobility: WHEEL, speedKmh: 90 }),
  d('cf_infantry_battalion', 'Canadian Army Infantry Battalion (Reg Force)', C.Infantry, 'CAN', 2020, 3.4,
    'Light infantry battalion with C7A2 rifles, Carl Gustaf, Javelin and LAV/G-Wagen mobility; NATO-standard training; ~650 troops.'),
  d('jtf2_group', 'Joint Task Force 2 / CSOR', C.SpecialForces, 'CAN', 2020, 3.8,
    'Canada\'s tier-1 counter-terror and CANSOFCOM special operations units (JTF 2, CSOR, CJIRU).'),
  d('coyote_recon_can', 'LAV III Coyote Reconnaissance Squadron', C.Recon, 'CAN', 1996, 2.8,
    '8x8 surveillance vehicle with mast-mounted radar, thermal sight and laser rangefinder; 17 t.', { mobility: WHEEL }),
  d('cf_combat_engineer', 'Canadian Combat Engineer Regiment', C.Engineers, 'CAN', 2020, 3.2,
    'Armoured combat engineer unit with Badger AEV, Leopard bridge layers and demolition teams.'),
  d('cf18_hornet', 'CF-18 Hornet (Modernization)', C.Multirole, 'CAN', 1982, 2.9,
    'RCAF F/A-18A/B Hornets modernised with AN/APG-73 radar, Link 16, Sniper pod and AIM-9X; retire when F-35A arrive.', { rangeKm: 1000 }),
  d('cc130j_hercules_can', 'CC-130J Hercules', C.AirTransport, 'CAN', 2010, 3.0,
    'RCAF tactical airlift and SAR variant of C-130J-30.', { cost: 850, speedKmh: 640, rangeKm: 3200 }),
  d('ch147f_chinook_can', 'CH-147F Chinook', C.Helicopter, 'CAN', 2013, 2.9,
    'Canadian variant of CH-47F with advanced avionics for medium-heavy lift.', { attackSoft: 12, attackHard: 5, attackAir: 3, cost: 300, speedKmh: 260 }),
  d('cp140m_aurora', 'CP-140M Aurora', C.Strike, 'CAN', 1980, 2.4,
    'P-3-derived long-range maritime patrol aircraft with APS-137 radar, sonobuoys, Mk 46 torpedoes; 760 km/h, 1,800 km radius.', { attackSoft: 8, attackHard: 8, attackNaval: 40, attackSub: 55, speedKmh: 680, rangeKm: 1800, spotting: 6 }),
  d('halifax_ffh330', 'Halifax-class Frigate (FFH 330)', C.Frigate, 'CAN', 1992, 3.1,
    '4,750 t patrol frigate with Sea Sparrow VLS, Harpoon, Mk 46 torpedoes, 57 mm Bofors and a CH-148 helicopter; 29 kn; Frigate Life Extension upgrade with Thales APAR radar.', { attackAir: 46, attackNaval: 48, attackSub: 56, cost: 950 }),
  d('kingston_mcdv', 'Kingston-class Coastal Defence Vessel', C.PatrolBoat, 'CAN', 1996, 1.9,
    '970 t mine-countermeasure/patrol vessel with 40 mm gun; 15 kn; primarily reserve-crewed.'),
  d('harry_dewolf_aopv', 'Harry DeWolf-class Arctic Offshore Patrol Ship', C.PatrolBoat, 'CAN', 2021, 2.7,
    '6,600 t ice-strengthened patrol vessel (Polar Class 5-equivalent) with 25 mm gun, helicopter deck and 17 kn; the Arctic sovereignty flagship.', { attackNaval: 22, attackSub: 6, cost: 420 }),
  d('can_victoria_class', 'Victoria-class Submarine (SSK)', C.Submarine, 'CAN', 2000, 2.6,
    '2,200 t diesel-electric attack submarine (ex-UK Upholder) with 6 torpedo tubes and Mk 48 torpedoes; 20 kn; four in service, aging.', { exportable: false }),
];
const CAN_FUTURE: MilitaryDesign[] = [
  fu('can_river_class_ddg', 'River-class Destroyer (Canadian Surface Combatant)', C.Destroyer, 'CAN', 2032, 3.7, 6500, 'halifax_ffh330',
    'Type 26-derived 7,800 t destroyer with Mk 41 VLS (SM-2, ESSM), CEAFAR-2 radar; ASW specialist; 15 ships planned to replace Halifax and Iroquois.',
    { cost: 2500 }),
  fu('can_cpsp_submarine', 'Canadian Patrol Submarine Project boat', C.Submarine, 'CAN', 2035, 3.6, 7500, 'can_victoria_class',
    'Up to 12 new 3,500 t conventional/AIP submarines (candidate TKMS Type 212CD or KSS-III) able to operate under Arctic ice; 6 torpedo tubes, 25 days submerged.',
    { exportable: false, cost: 2200 }),
  fu('can_lav_next', 'Next Generation LAV / Canadian Light Armoured Vehicle (Mk 8)', C.Mechanized, 'CAN', 2032, 3.7, 4500, 'lav6_canada',
    'Hybrid-drive 8x8 with 30 mm remote turret, Trophy-class APS and open architecture, to replace LAV 6.0.', { armor: HARD, mobility: WHEEL, cost: 640 }),
];

// ============================================================================
// BRAZIL
// ============================================================================
const BRA: MilitaryDesign[] = [
  d('guarani_vbtp_mr', 'VBTP-MR Guarani', C.Mechanized, 'BRA', 2014, 2.9,
    'Iveco/Brazilian 6x6 amphibious APC (18 t) with 30 mm RWS or 12.7 mm; 100 km/h; 2,000 planned for the Brazilian Army.', { armor: HARD, mobility: WHEEL, speedKmh: 100 }),
  d('urutu_ee11', 'EE-11 Urutu', C.Mechanized, 'BRA', 1974, 1.9,
    'Engesa 6x6 amphibious APC; 14 t, 105 km/h; exported widely to Latin America, Africa and the Middle East.', { armor: SOFT, mobility: WHEEL }),
  d('cascavel_ee9', 'EE-9 Cascavel', C.Recon, 'BRA', 1974, 2.4,
    'Engesa 6x6 armoured car with 90 mm gun; 13 t, 100 km/h; used by Bolivia, Paraguay, Ecuador, Uruguay and others.', { armor: HARD, mobility: WHEEL, attackHard: 40, attackSoft: 40 }),
  d('astros_ii', 'ASTROS II Mk 6', C.RocketArtillery, 'BRA', 1983, 3.2,
    'Avibras 6x6 MLRS firing SS-09 to SS-80 rockets up to 90 km and the AV-SS 150 km cruise missile; exported to Saudi Arabia, Iraq, Indonesia.', { rangeGround: 3 }),
  d('bra_army_infantry_battalion', 'Brazilian Army Infantry Battalion', C.Infantry, 'BRA', 2020, 2.9,
    'Motorised infantry battalion armed with IMBEL IA2 5.56 rifles and mortars; jungle, mountain and mechanised specialisations.'),
  d('bra_paraquedista_battalion', 'Brazilian Paratroop Infantry Brigade Battalion', C.Infantry, 'BRA', 2020, 3.2,
    'Airborne infantry of the 1st Parachute Brigade, trained for rapid intervention.'),
  d('bra_jungle_infantry_battalion', 'Brazilian Jungle Infantry (Batalhão de Infantaria de Selva)', C.Infantry, 'BRA', 2015, 3.2,
    'Amazon-based light infantry trained by CIGS in jungle warfare; foot and river-craft mobility.', { defenseGround: 62 }),
  d('bra_fuzileiros_navais', 'Brazilian Marine Corps Battalion (Fuzileiros Navais)', C.Infantry, 'BRA', 2018, 3.1,
    'Naval infantry with Piranha IIIC, CLAnf amphibious vehicles and MANSUP anti-ship missiles.'),
  d('bra_cmdo_acoes', '1st Special Actions Commando Battalion', C.SpecialForces, 'BRA', 2015, 3.5,
    'Brazilian Army special forces and Navy GRUMEC combat divers; counter-terror and jungle operations.'),
  d('bra_engineer_battalion', 'Brazilian Engineer Battalion', C.Engineers, 'BRA', 2015, 2.9,
    'Combat and construction engineers with floating bridges; regional infrastructure role.'),
  d('super_tucano_a29', 'Embraer A-29B Super Tucano', C.Strike, 'BRA', 2003, 2.2,
    'Turboprop light attack aircraft with 1,600 hp PT6A, 1.5 t weapons, FLIR/laser designator; 590 km/h, 1,300 km; sold to 20+ nations including USA, Colombia, Ecuador.', { attackAir: 12, speedKmh: 590, rangeKm: 660, cost: 480, militaryGoodsCost: 40, upkeep: 1.4, stealth: 0.02 }),
  d('emb312_tucano', 'EMB-312 Tucano', C.Strike, 'BRA', 1983, 1.5,
    'Turboprop trainer with light attack roles; 280 km/h; used by many South American air forces.', { attackAir: 3, speedKmh: 450, rangeKm: 500, cost: 240 }),
  d('embraer_kc390', 'Embraer C-390 Millennium (KC-390)', C.AirTransport, 'BRA', 2019, 3.3,
    'Twin-jet tactical airlifter (26 t payload, 870 km/h, 2,800 km) also in tanker role; ordered by Portugal, Netherlands, Sweden, Austria, Czechia, Hungary, Poland, Slovakia, Korea and others.', { rangeKm: 3400, cost: 1100 }),
  d('h225m_caracal', 'Helibras H225M Caracal', C.Helicopter, 'BRA', 2010, 2.7,
    'Brazilian-built EC725 multi-role helicopter for the Air Force, Army and Navy; 11 t, 260 km/h, 26 troops; door guns and rockets.', { attackSoft: 20, attackHard: 12, attackAir: 3, cost: 300 }),
  d('amx_a1m', 'AMX A-1M (Embraer/Aeritalia)', C.Strike, 'BRA', 1989, 2.3,
    'Subsonic attack jet upgraded with new radar, Elbit displays and Python-4; 900 km/h, 550 km radius; retiring by 2030.', { attackAir: 12, rangeKm: 700 }),
  d('riachuelo_class', 'Riachuelo-class Submarine (S40)', C.Submarine, 'BRA', 2022, 3.1,
    'Brazilian-built Scorpene-based 1,900 t diesel-electric submarine with 533 mm tubes, SM39 Exocet, F21 torpedoes; 20 kn; 4 planned.', { exportable: false }),
  d('tupi_tikuna_class', 'Tupi/Tikuna-class Submarine (Type 209/1400)', C.Submarine, 'BRA', 1989, 2.4,
    '1,450 t diesel-electric Type 209-derived submarine with 8 torpedo tubes; 21 kn; upgraded with Sonar and combat system.'),
  d('tamandare_class', 'Tamandaré-class Frigate (F200)', C.Frigate, 'BRA', 2025, 3.3,
    'MEKO A100-derived 3,500 t frigate built at Itajai by Thyssenkrupp/Embraer; 76 mm, Mk 41 VLS (Sea Ceptor), RBS-15 anti-ship, helicopter hangar; 26 kn.', { cost: 900 }),
  d('niteroi_class', 'Niterói-class Frigate', C.Frigate, 'BRA', 1976, 2.0,
    '3,700 t Vosper Mk 10 frigate with Exocet MM40, Seacat/Sea Wolf; 30 kn; being retired.'),
  d('barroso_class', 'Barroso-class Corvette (Tamandaré predecessor)', C.Frigate, 'BRA', 2008, 2.5,
    '2,350 t Brazilian-designed corvette with Exocet, Bofors 40 mm, Simbad-RC and Super Lynx helicopter.', { cost: 520 }),
  d('amazonas_opv', 'Amazonas-class Offshore Patrol Vessel', C.PatrolBoat, 'BRA', 2012, 2.6,
    '1,800 t OPV (BAE Systems River class) with 30 mm gun and helicopter deck; 22 kn; for EEZ patrol.', { cost: 240 }),
  d('bra_riverine_flotilla', 'Amazon Riverine Patrol Flotilla (Pedro Teixeira/Roraima)', C.PatrolBoat, 'BRA', 2010, 1.6,
    'Shallow-draft riverine patrol boats with 20-40 mm guns and hospital ships; controls the Amazon basin and its tributaries.', { cost: 60 }),
  d('atlantico_lph', 'PHM Atlântico (ex-HMS Ocean)', C.Amphibious, 'BRA', 2018, 2.9,
    '21,700 t helicopter carrier bought from the Royal Navy, 18 helicopters and 800 Marines; flagship of the Brazilian Navy after São Paulo\'s decommissioning.', { exportable: false }),
  d('bahia_class_lsd', 'Bahia-class Landing Platform Dock (ex-Siroco)', C.Amphibious, 'BRA', 2015, 2.6,
    '12,000 t French-built Foudre-class LPD; 350 troops, 2 CDIC LCAs; 21 kn.'),
];
const BRA_FUTURE: MilitaryDesign[] = [
  fu('bra_alvaro_alberto_ssn', 'Álvaro Alberto-class SSN (SN-BR)', C.Submarine, 'BRA', 2033, 3.7, 8500, 'riachuelo_class',
    'First Brazilian nuclear-powered attack submarine, using a national naval reactor from the Navy\'s Aramar centre with French-supported hull design; 6,000 t, 25+ kn.',
    { exportable: false, cost: 4200 }),
  fu('bra_astros_mtc300', 'ASTROS Strategic Rocket / MTC-300 Cruise Missile Battalion', C.MissileLauncher, 'BRA', 2032, 3.4, 5500, 'astros_ii',
    'Avibras AV-MTC 300 tactical cruise missiles (300 km) and AV-TM 300 ballistic missiles launched from ASTROS trucks; GPS/INS guided.',
    { rangeGround: 5, cost: 1000 }),
  fu('bra_guarani_ii_ifv', 'Guarani II 8x8 IFV (VBTP-MSR Vanguard)', C.Mechanized, 'BRA', 2030, 3.2, 3500, 'guarani_vbtp_mr',
    'Upgraded Guarani with 30 mm turret, Spike/MAR-1 missile and modular armor; 8x8 layout for greater capacity.', { armor: HARD, mobility: WHEEL, cost: 430 }),
  fu('bra_gripen_ngd', 'Embraer Multirole Fighter Advanced (Gripen E-BR Block 2)', C.Multirole, 'BRA', 2033, 3.9, 8000, 'embraer_kc390',
    'Domestically manufactured Gripen with Brazilian avionics, radar and weapons integration (MAR-1, Mectron A-Darter); Embraer/Akaer final assembly.',
    { stealth: 0.2, rangeKm: 1100, cost: 2400 }),
];

// ============================================================================
// ARGENTINA
// ============================================================================
const ARG: MilitaryDesign[] = [
  d('tam_2c', 'TAM 2C Medium Tank', C.Armor, 'ARG', 2014, 2.6,
    'Argentine 30-ton medium tank (Marder chassis) with 105 mm gun, new fire-control and thermal sights; 75 km/h.'),
  d('vctp_ifv', 'VCTP Infantry Combat Vehicle', C.Mechanized, 'ARG', 1980, 2.2,
    'Marder-derived 28-ton tracked IFV with 20 mm cannon; 75 km/h; basis of Argentine mechanised units.'),
  d('arg_infantry_battalion', 'Argentine Army Infantry Battalion', C.Infantry, 'ARG', 2020, 2.9,
    'Motorised infantry battalion with FAL/FARA rifles and 120 mm mortars; mountain and jungle variants.'),
  d('pampa_iii', 'FAdeA IA-63 Pampa III', C.Strike, 'ARG', 2016, 2.3,
    'Lockheed/Argentine advanced trainer and light attack jet with AN/APG-67 radar, Litening pod; 800 km/h, 1,200 km radius.', { attackAir: 20, speedKmh: 800, rangeKm: 800, cost: 480 }),
  d('arg_special_operations', 'Argentine Special Operations Group (Grupo de Operaciones Especiales)', C.SpecialForces, 'ARG', 2015, 3.2,
    'Army commandos and Navy BAT/Buzos Tácticos; mountain and amphibious operations.'),
  d('arg_engineer_battalion', 'Argentine Engineer Battalion', C.Engineers, 'ARG', 2015, 2.8,
    'Combat and construction engineers; Antarctic support and bridging.'),
  d('almirante_brown_meko360', 'Almirante Brown-class Destroyer (MEKO 360)', C.Destroyer, 'ARG', 1983, 2.3,
    '3,600 t German-built frigate/destroyer with 127 mm gun, Exocet MM40, Sea Sparrow (upgrade pending) and helicopter deck; 30 kn.', { cost: 1000 }),
  d('arg_gowind_opv', 'Bouchard-class Offshore Patrol Vessel (Gowind)', C.PatrolBoat, 'ARG', 2019, 2.7,
    '1,500 t French-designed Gowind OPV with 40 mm gun, helicopter platform; 21 kn; patrol of Argentine EEZ.', { cost: 220 }),
];
const ARG_FUTURE: MilitaryDesign[] = [
  fu('arg_tam_3', 'TAM 3 Modernised Medium Tank', C.Armor, 'ARG', 2032, 3.3, 3500, 'tam_2c',
    'Modernised TAM with 120 mm smoothbore, composite armor and digital FCS built on the VCTP chassis.', { cost: 640 }),
  fu('arg_pampa_iv', 'IA-63 Pampa IV Light Fighter', C.Multirole, 'ARG', 2033, 3.0, 4500, 'pampa_iii',
    'Proposed light multirole derivative with AESA radar and AIM-120/Python-4; 1.2 t payload.', { rangeKm: 700, cost: 1350 }),
  fu('arg_sabre_submarine', 'Argentine Conventional Submarine Replacement', C.Submarine, 'ARG', 2035, 3.2, 5500, undefined,
    'New 2,000 t diesel-electric submarine with AIP for the Argentine Navy after the ARA San Juan loss; likely licence-built design.', { exportable: false }),
];

// ============================================================================
// MEXICO / COLOMBIA / CHILE / OTHERS
// ============================================================================
const OTHER: MilitaryDesign[] = [
  // ---- Mexico
  d('mex_dn_xi_apc', 'SEDENA DN-XI Wheeled APC', C.Mechanized, 'MEX', 2010, 2.0,
    'Mexican-built 4x4 armoured vehicle (Sedena/Mexican Army factory) based on truck chassis; 7.5 t, 90 km/h, MG turret.', { armor: SOFT, mobility: WHEEL }),
  d('mex_army_infantry_battalion', 'Mexican Army Infantry Battalion', C.Infantry, 'MEX', 2020, 2.6,
    'Infantry battalion with HK G3/FX-05 Xiuhcoatl rifles and Mexican-built support weapons.'),
  d('mex_guardia_nacional_battalion', 'Guardia Nacional Battalion', C.Infantry, 'MEX', 2019, 2.2,
    'Militarised National Guard security battalion for internal security and drug interdiction.'),
  d('mex_marine_infantry', 'Mexican Marines Infantry Battalion (Infantería de Marina)', C.Infantry, 'MEX', 2018, 2.8,
    'Naval infantry with amphibious training and riverine capabilities.'),
  d('mex_gafe_sof', 'Grupo Aeromóvil de Fuerzas Especiales (GAFE)', C.SpecialForces, 'MEX', 2010, 3.1,
    'Mexican Army special forces battalions; counter-cartel and counter-terror.'),
  d('mex_105mm_towed', 'Mexican Army 105 mm Howitzer Battalion', C.Artillery, 'MEX', 1980, 1.8,
    'M101/M56 towed 105 mm howitzers; 11 km range.', { armor: SOFT, mobility: WHEEL }),
  d('mex_marina_opv', 'Oaxaca/Sierra-class Offshore Patrol Vessel', C.Frigate, 'MEX', 2004, 2.0,
    '1,700 t Mexican-built OPV with 57 mm gun, helicopter deck and patrol tasks; 22 kn.', { attackAir: 20, attackNaval: 30, attackSub: 20, cost: 240 }),
  d('mex_durango_class', 'Durango-class Patrol Vessel', C.PatrolBoat, 'MEX', 2011, 2.3,
    '1,700 t patrol ship with 76 mm gun; helicopter deck; 20 kn; built by the Mexican Navy.'),
  d('mex_fast_patrol_flotilla', 'Mexican Coast Patrol Flotilla (Polaris/Tenochtitlan)', C.PatrolBoat, 'MEX', 2005, 1.9,
    'Interceptor and coastal patrol craft for the Mexican Navy: 12.7 mm guns, 40+ kn.', { cost: 90 }),
  // ---- Colombia
  d('col_army_infantry_battalion', 'Colombian Army Infantry Battalion', C.Infantry, 'COL', 2020, 3.0,
    'Combat-hardened counter-insurgency battalion with Galil ACE rifles and jungle equipment; extremely experienced.', { defenseGround: 60 }),
  d('col_special_forces', 'Colombian Commandos & Lancero Battalion', C.SpecialForces, 'COL', 2018, 3.4,
    'Special-forces and Lancero jungle-warfare units; US-trained; counter-narcotics.'),
  d('arc_20_de_julio_opv', 'ARC 20 de Julio-class Offshore Patrol Vessel', C.Frigate, 'COL', 2021, 2.1,
    '2,000 t Cotecmar-built OPV with 76 mm gun, Bofors 40 mm and helicopter deck; 22 kn.', { cost: 250, attackNaval: 34, attackSub: 20 }),
  d('col_river_flotilla', 'Colombian Riverine Combat Flotilla (Nodriza)', C.PatrolBoat, 'COL', 2012, 1.7,
    'Cotecmar-built armoured riverine craft with .50 cal/40 mm weapons; supports counter-narcotics.', { cost: 50 }),
  // ---- Chile
  d('chl_army_infantry_battalion', 'Chilean Army Infantry Battalion', C.Infantry, 'CHL', 2020, 3.1,
    'Professional infantry battalion with SIG SG 540 rifles; mountain warfare specialisation.'),
  d('chl_special_forces', 'Chilean Special Forces (Brigada de Operaciones Especiales)', C.SpecialForces, 'CHL', 2015, 3.4,
    'Army Lautaro and Navy special forces.'),
  d('chl_asmar_opv', 'Piloto Pardo/Comandante Toro-class Offshore Patrol Vessel', C.PatrolBoat, 'CHL', 2008, 2.6,
    '1,800 t Fassmer-designed OPV with 76 mm gun and helicopter deck; 20 kn; Chilean Antarctic/OPV patrol.', { cost: 200 }),
  // ---- Peru
  d('per_army_infantry_battalion', 'Peruvian Army Infantry Battalion', C.Infantry, 'PER', 2018, 2.7,
    'Andean/jungle infantry battalion with FAL/Galil rifles and heavy mortars.'),
  d('per_lupo_class', 'Carvajal-class Frigate (Lupo)', C.Frigate, 'PER', 1979, 2.3,
    '2,525 t Italian-designed Lupo frigate with Aspide SAM, Exocet MM40 and 127 mm gun; 35 kn; refit in Peruvian yards.', { cost: 600, attackAir: 40, attackNaval: 46 }),
  // ---- Ecuador / Venezuela / misc
  d('ecu_army_infantry_battalion', 'Ecuadorian Army Infantry Battalion', C.Infantry, 'ECU', 2018, 2.8,
    'Andean/Amazon light infantry.'),
  d('ven_bolivarian_militia', 'Venezuelan Bolivarian Militia Battalion', C.Infantry, 'VEN', 2010, 2.0,
    'Paramilitary reserve infantry formations; large but poorly trained.'),
  d('ven_army_infantry_battalion', 'Venezuelan Army Infantry Battalion (FANB)', C.Infantry, 'VEN', 2018, 2.5,
    'Army infantry with AK-103 rifles; equipped with Russian support weapons.'),
  d('cub_revolutionary_infantry', 'Cuban Revolutionary Army Infantry Battalion', C.Infantry, 'CUB', 2000, 2.4,
    'Territorial Troops Militia and Revolutionary Armed Forces (FAR) infantry with AK-47 rifles.'),
  d('lat_national_infantry_battalion', 'Latin American Light Infantry Battalion', C.Infantry, 'USA', 2015, 2.3,
    'Generic small-nation light infantry battalion (M16/FAL rifles, 81 mm mortars) used by militaries of Central America and the Caribbean.', { personnel: 600 }),
  d('cessna_a37b_dragonfly', 'Cessna A-37B Dragonfly', C.Strike, 'USA', 1968, 1.4,
    'Light COIN jet; 2 x J85 engines; 4 t of weapons, 816 km/h; still in service in Central and South America.', { attackAir: 5, speedKmh: 700, rangeKm: 500, cost: 200 }),
  d('f5e_tiger_ii', 'Northrop F-5E/F Tiger II', C.Multirole, 'USA', 1972, 1.8,
    'Light supersonic fighter (Mach 1.6) with 7 hardpoints; 2 x J85; operated by Brazil, Chile, Mexico, Honduras and many others.', { attackAir: 40, rangeKm: 600, cost: 600 }),
  d('uh1h_huey', 'Bell UH-1H Iroquois (Huey)', C.Helicopter, 'USA', 1959, 1.3,
    'Utility helicopter; 200 km/h, 8 troops; used across Central America and the Caribbean.', { attackSoft: 20, attackHard: 5, attackAir: 2, cost: 100, militaryGoodsCost: 10 }),
];

// ---- extra small designs & future concepts for other regional powers ----
const EXTRA: MilitaryDesign[] = [
  d('m101_105mm_howitzer', 'M101A1 105 mm Howitzer', C.Artillery, 'USA', 1941, 1.6,
    'WWII-era towed 105 mm howitzer, 2.2 t, 11.2 km; still widely used by Latin American armies.', { armor: SOFT, mobility: WHEEL }),
  d('m109a5_paladin', 'M109A5/A6 Paladin', C.Artillery, 'USA', 1996, 2.9,
    '155 mm/39-cal SP howitzer, 27-35 t, 24 km (30 km rocket-assisted); exported to Brazil, Chile, Egypt, etc.'),
];
const EXTRA_FUTURE: MilitaryDesign[] = [
  fu('mex_dn_xii_ifv', 'SEDENA DN-XII Wheeled IFV', C.Mechanized, 'MEX', 2033, 2.9, 2800, 'mex_dn_xi_apc',
    'Mexican-built 8x8 IFV with 30 mm turret and mine-protected hull, planned to modernise army mechanised units.', { armor: HARD, mobility: WHEEL, cost: 380 }),
  fu('mex_marina_frigate', 'Mexican Navy Multipurpose Frigate (Reformador)', C.Frigate, 'MEX', 2034, 2.9, 3800, 'mex_marina_opv',
    'Locally built 3,000 t frigate with 76 mm, VL-launched SAM and helicopter hangar; ASTIMAR yard.', { cost: 600 }),
  fu('mex_tlaloc_uav', 'Mexican Tlaloc Armed UAV', C.Drone, 'MEX', 2032, 2.6, 2500, undefined,
    'Domestic MALE UAV based on the Hydra/Atlante series with laser-guided munitions for anti-cartel operations.', { cost: 260 }),
  fu('col_pes_frigate', 'Cotecmar Plataforma Estratégica de Superficie (PES) Frigate', C.Frigate, 'COL', 2034, 3.0, 3500, 'arc_20_de_julio_opv',
    'Colombian-built 3,000 t multi-mission frigate with VLS SAMs and anti-ship missiles; designed by Cotecmar.', { cost: 550 }),
  fu('col_gavilan_uav', 'Colombian Gavilán ISR/Strike UAV', C.Drone, 'COL', 2031, 2.6, 2400, undefined,
    'Locally produced MALE UAV with laser-guided weapons for counter-narcotics and counter-insurgency.', { cost: 240 }),
  fu('chl_asmar_frigate', 'ASMAR Multipurpose Frigate (Tipo Fragata Chilena)', C.Frigate, 'CHL', 2035, 3.4, 5000, 'chl_asmar_opv',
    'Chilean-built 4,500 t frigate to replace the Type 22/23 frigates; VLS, 76 mm, ASW helicopter.', { cost: 800 }),
  fu('chl_uav_ala', 'ENAER Chilean HALE/MALE UAV', C.Drone, 'CHL', 2033, 2.8, 2600, undefined,
    'ENAER-developed medium-altitude UAV for maritime surveillance of the Pacific coast and Antarctic support.', { cost: 260 }),
  fu('per_sima_frigate', 'SIMA Peruvian Multipurpose Frigate', C.Frigate, 'PER', 2035, 2.9, 3800, 'per_lupo_class',
    'Peruvian-built frigate (SIMA Callao) replacing the Lupo class; 3,000 t with 76 mm and VLS.', { cost: 560 }),
];

export const DESIGNS: MilitaryDesign[] = [
  ...USA, ...USA_FUTURE, ...CAN, ...CAN_FUTURE, ...BRA, ...BRA_FUTURE, ...ARG, ...ARG_FUTURE, ...OTHER, ...EXTRA, ...EXTRA_FUTURE,
];

// ============================================================================
// INVENTORIES — 1 Jan 2030
// ============================================================================
type U = [string, number];
const inv = (code: string, units: U[], produces: string[] = []): NationInventory => ({
  code, units: units.map(([id, count]) => ({ id, count })), produces,
});
const G: U = ['lat_national_infantry_battalion', 0];
const small = (code: string, infantry: number, patrol: [string, number][] = [['defender_class_rb', 1]], extra: U[] = []): NationInventory =>
  inv(code, [...(infantry > 0 ? [['lat_national_infantry_battalion', infantry] as U] : []), ...patrol, ...extra]);
void G;

export const INVENTORY: NationInventory[] = [
  inv('USA', [
    ['m1a2_sepv3_abrams', 26], ['m1a2_sepv2_abrams', 14],
    ['m2a4_bradley', 28], ['m2a4e1_bradley', 8], ['stryker_a1_icv', 20], ['stryker_dragoon', 6], ['acv_marine', 6], ['lav25a2', 4], ['m113a3', 6],
    ['us_infantry_battalion', 55], ['us_airborne_battalion', 18], ['usmc_infantry_battalion', 22],
    ['us_green_beret_battalion', 18], ['us_ranger_battalion', 3], ['us_navy_seal_team', 6],
    ['m1127_stryker_rv', 8], ['jltv_cavalry', 18],
    ['us_combat_engineer_battalion', 24], ['m1150_abv_engineers', 4],
    ['m109a7_paladin', 20], ['m777a2_howitzer', 24], ['m119a3_howitzer', 14],
    ['himars', 18], ['m270a2_mlrs', 10],
    ['patriot_pac3', 14], ['thaad', 4], ['nasams', 2], ['m_shorad_stryker_a1', 8], ['ifpc_inc2', 3],
    ['prsm_launcher', 4], ['typhon_mrc', 2], ['nmesis', 3], ['lgm30g_minuteman_iii', 3],
    ['f22a_raptor', 6], ['f15c_eagle', 2], ['f15ex_eagle_ii', 4], ['f15e_strike_eagle', 7], ['f16c_block50', 16],
    ['f35a', 28], ['f35b', 8], ['f35c', 10], ['fa18ef_super_hornet', 22], ['ea18g_growler', 6],
    ['a10c_thunderbolt_ii', 4], ['ac130j_ghostrider', 3], ['p8a_poseidon', 10],
    ['b1b_lancer', 3], ['b2a_spirit', 2], ['b21_raider', 1], ['b52h_stratofortress', 6],
    ['ah64e_apache_guardian', 24], ['ah1z_viper', 6], ['uh60m_blackhawk', 32], ['ch47f_chinook', 12], ['mv22b_osprey', 10], ['ch53k_king_stallion', 5], ['mh60r_seahawk', 12],
    ['c17a_globemaster_iii', 14], ['c5m_super_galaxy', 3], ['c130j_super_hercules', 20], ['kc46a_pegasus', 8], ['kc135r_stratotanker', 10],
    ['mq9a_reaper', 10], ['mq1c_gray_eagle', 6], ['rq4b_global_hawk', 2], ['mq4c_triton', 2], ['mq25a_stingray', 2],
    ['arleigh_burke_flt1', 28], ['arleigh_burke_flt2a', 34], ['arleigh_burke_flt3', 14], ['zumwalt_ddg1000', 3], ['ticonderoga_cg47', 4],
    ['constellation_ffg62', 1], ['lcs_freedom', 6], ['lcs_independence', 12], ['legend_nsc', 11], ['sentinel_frc', 4], ['cyclone_pc', 1], ['defender_class_rb', 3], ['heritage_opc', 3],
    ['nimitz_cvn68', 7], ['ford_cvn78', 3],
    ['los_angeles_ssn688', 12], ['seawolf_ssn21', 3], ['virginia_block4', 22], ['virginia_block5', 4], ['ohio_ssbn', 12],
    ['america_lha6', 3], ['wasp_lhd1', 7], ['san_antonio_lpd17', 13], ['whidbey_island_lsd', 4],
  ], USA.map((x) => x.id).filter((id) => !['m1a1_fep_abrams', 'v150_commando', 'm1117_asv'].includes(id))),

  inv('CAN', [
    ['lav6_canada', 8], ['leopard_2a6', 2], ['cf_infantry_battalion', 12], ['jtf2_group', 2], ['coyote_recon_can', 2], ['cf_combat_engineer', 4],
    ['m777a2_howitzer', 3], ['nasams', 1],
    ['f35a', 2], ['cf18_hornet', 3], ['cc130j_hercules_can', 3], ['c17a_globemaster_iii', 1], ['ch147f_chinook_can', 2], ['a330_mrtt', 1],
    ['cp140m_aurora', 1], ['p8a_poseidon', 1], ['mq9b_skyguardian', 1],
    ['halifax_ffh330', 8], ['kingston_mcdv', 6], ['harry_dewolf_aopv', 5], ['can_victoria_class', 4],
  ], ['lav6_canada', 'cf_infantry_battalion', 'jtf2_group', 'coyote_recon_can', 'cf_combat_engineer', 'halifax_ffh330', 'kingston_mcdv', 'harry_dewolf_aopv']),

  inv('MEX', [
    ['mex_army_infantry_battalion', 50], ['mex_guardia_nacional_battalion', 20], ['mex_marine_infantry', 12], ['mex_gafe_sof', 4],
    ['mex_dn_xi_apc', 6], ['erc90_sagaie', 4], ['mex_105mm_towed', 5],
    ['f5e_tiger_ii', 1], ['pc7_turbo_trainer', 1], ['uh60m_blackhawk', 1], ['mi17', 2], ['c295', 1],
    ['mex_marina_opv', 6], ['mex_durango_class', 4], ['mex_fast_patrol_flotilla', 4], ['knox_class', 2],
  ], ['mex_dn_xi_apc', 'mex_army_infantry_battalion', 'mex_guardia_nacional_battalion', 'mex_marine_infantry', 'mex_gafe_sof', 'mex_marina_opv', 'mex_durango_class', 'mex_fast_patrol_flotilla']),

  inv('GTM', [['lat_national_infantry_battalion', 8], ['v150_commando', 1], ['uh1h_huey', 1], ['defender_class_rb', 1]]),
  small('BLZ', 1),
  inv('HND', [['lat_national_infantry_battalion', 6], ['f5e_tiger_ii', 1], ['cessna_a37b_dragonfly', 1], ['uh1h_huey', 1], ['defender_class_rb', 1]]),
  inv('SLV', [['lat_national_infantry_battalion', 8], ['cessna_a37b_dragonfly', 1], ['uh1h_huey', 1], ['defender_class_rb', 1]]),
  inv('NIC', [['lat_national_infantry_battalion', 6], ['t55', 1], ['mi17', 1], ['defender_class_rb', 1]]),
  small('CRI', 2, [['defender_class_rb', 1]]),
  small('PAN', 2, [['defender_class_rb', 2]], [['uh1h_huey', 1]]),
  inv('CUB', [
    ['cub_revolutionary_infantry', 24], ['t55', 3], ['t62', 1], ['bmp1', 2], ['btr60', 2], ['2s3_akatsiya', 2], ['bm21_grad', 3], ['s125', 3],
    ['mig29', 1], ['mi17', 1], ['osa_ii', 2], ['koni_class', 1],
  ], ['cub_revolutionary_infantry']),
  small('HTI', 1),
  inv('DOM', [
    ['lat_national_infantry_battalion', 12], ['v150_commando', 2], ['super_tucano_a29', 1], ['uh1h_huey', 1],
    ['defender_class_rb', 2], ['cyclone_pc', 1],
  ]),
  inv('JAM', [['lat_national_infantry_battalion', 2], ['defender_class_rb', 1], ['damen_stan_patrol_4207', 1]]),
  inv('BHS', [['lat_national_infantry_battalion', 1], ['damen_stan_patrol_4207', 2]]),
  inv('TTO', [['lat_national_infantry_battalion', 2], ['damen_stan_patrol_4207', 2]]),
  small('BRB', 1),
  small('LCA', 0), small('VCT', 0), small('GRD', 0), small('DMA', 0), small('ATG', 0), small('KNA', 0),

  inv('COL', [
    ['col_army_infantry_battalion', 70], ['col_special_forces', 4], ['m1117_asv', 6], ['cascavel_ee9', 3], ['v150_commando', 2],
    ['us_combat_engineer_battalion', 3], ['m101_105mm_howitzer', 4],
    ['jas39_gripen_e', 1], ['kfir_c10', 1], ['super_tucano_a29', 2], ['uh60m_blackhawk', 2], ['mi17', 2], ['c295', 1],
    ['type_209', 2], ['fs1500_padilla', 4], ['arc_20_de_julio_opv', 2], ['col_river_flotilla', 6],
  ], ['col_army_infantry_battalion', 'col_special_forces', 'arc_20_de_julio_opv', 'col_river_flotilla']),

  inv('VEN', [
    ['ven_army_infantry_battalion', 14], ['ven_bolivarian_militia', 10], ['t72b1', 3], ['amx30', 2], ['bmp3', 2], ['btr80', 3],
    ['2s1_gvozdika', 2], ['bm21_grad', 2], ['bm30_smerch', 1], ['s300vm', 1], ['buk_m2e', 1],
    ['su30mk2', 1], ['k8_karakorum', 1], ['mi17', 1], ['mi35m', 1],
    ['type_209', 2], ['per_lupo_class', 2], ['damen_stan_patrol_4207', 2],
  ], ['ven_army_infantry_battalion', 'ven_bolivarian_militia']),

  small('GUY', 3), small('SUR', 2),

  inv('BRA', [
    ['bra_army_infantry_battalion', 60], ['bra_paraquedista_battalion', 4], ['bra_jungle_infantry_battalion', 6], ['bra_fuzileiros_navais', 8], ['bra_cmdo_acoes', 2], ['bra_engineer_battalion', 6],
    ['leopard_1a5', 3], ['guarani_vbtp_mr', 16], ['urutu_ee11', 6], ['cascavel_ee9', 6], ['m113a3', 4],
    ['m109a5_paladin', 5], ['astros_ii', 4], ['rbs70', 2],
    ['jas39_gripen_e', 2], ['f5e_tiger_ii', 1], ['amx_a1m', 1], ['super_tucano_a29', 5], ['embraer_kc390', 2], ['c295', 1],
    ['h225m_caracal', 3], ['mi35m', 1], ['uh60m_blackhawk', 2],
    ['tamandare_class', 3], ['niteroi_class', 2], ['barroso_class', 1], ['amazonas_opv', 4], ['bra_riverine_flotilla', 4],
    ['riachuelo_class', 4], ['tupi_tikuna_class', 5], ['atlantico_lph', 1], ['bahia_class_lsd', 1],
  ], BRA.map((x) => x.id).concat(['jas39_gripen_e', 'c295'])),

  inv('ECU', [
    ['ecu_army_infantry_battalion', 14], ['amx13', 2], ['cascavel_ee9', 2], ['urutu_ee11', 3], ['m101_105mm_howitzer', 3], ['us_combat_engineer_battalion', 2],
    ['kfir_c10', 1], ['super_tucano_a29', 1], ['mi17', 1], ['uh1h_huey', 1],
    ['type_209', 2], ['esmeraldas_corvette', 2], ['defender_class_rb', 2],
  ], ['ecu_army_infantry_battalion']),

  inv('PER', [
    ['per_army_infantry_battalion', 22], ['t55', 4], ['m113a3', 3], ['m101_105mm_howitzer', 3], ['bm21_grad', 2], ['us_combat_engineer_battalion', 2],
    ['mig29', 1], ['mirage_2000', 1], ['su25', 1], ['cessna_a37b_dragonfly', 1], ['mi17', 2], ['mi24', 1],
    ['per_lupo_class', 3], ['type_209', 5], ['bra_riverine_flotilla', 2],
  ], ['per_army_infantry_battalion', 'per_lupo_class']),

  inv('BOL', [
    ['lat_national_infantry_battalion', 10], ['sk105_kurassier', 1], ['cascavel_ee9', 2], ['v150_commando', 1],
    ['k8_karakorum', 1], ['mi17', 1], ['uh1h_huey', 1], ['bra_riverine_flotilla', 2],
  ]),
  inv('PRY', [
    ['lat_national_infantry_battalion', 8], ['cascavel_ee9', 2], ['urutu_ee11', 2],
    ['emb312_tucano', 1], ['uh1h_huey', 1], ['bra_riverine_flotilla', 2],
  ]),

  inv('ARG', [
    ['arg_infantry_battalion', 20], ['tam_2c', 4], ['vctp_ifv', 6], ['m113a3', 4], ['arg_special_operations', 2], ['arg_engineer_battalion', 3],
    ['m101_105mm_howitzer', 4], ['rbs70', 1],
    ['f16am_mlu', 2], ['pampa_iii', 2],
    ['almirante_brown_meko360', 3], ['meko_140', 4], ['arg_gowind_opv', 4],
  ], ['arg_infantry_battalion', 'tam_2c', 'vctp_ifv', 'arg_special_operations', 'arg_engineer_battalion', 'pampa_iii', 'arg_gowind_opv']),

  inv('URY', [
    ['lat_national_infantry_battalion', 6], ['m113a3', 2], ['btr60', 2],
    ['cessna_a37b_dragonfly', 1], ['uh1h_huey', 1], ['chl_asmar_opv', 1], ['bra_riverine_flotilla', 1],
  ]),

  inv('CHL', [
    ['chl_army_infantry_battalion', 16], ['chl_special_forces', 1], ['leopard_2a4', 3], ['marder_1a3', 3], ['piranha_iii', 3], ['m109a5_paladin', 2], ['us_combat_engineer_battalion', 2],
    ['f16c_block50', 1], ['f16am_mlu', 2], ['f5e_tiger_ii', 1], ['kc135r_stratotanker', 1], ['as532_cougar', 1],
    ['karel_doorman', 2], ['duke_class', 3], ['scorpene', 2], ['type_209', 2], ['chl_asmar_opv', 4],
  ], ['chl_army_infantry_battalion', 'chl_special_forces', 'chl_asmar_opv']),
];

// EXTERNAL IDS (designs referenced but defined in other regions; integrator please verify):
// leopard_2a6, leopard_2a4, leopard_1a5, marder_1a3, piranha_iii, amx30, amx13, sk105_kurassier, erc90_sagaie,
// t55, t62, t72b1, bmp1, bmp3, btr60, btr80, 2s1_gvozdika, 2s3_akatsiya, bm21_grad, bm30_smerch, s125, s300vm, buk_m2e, rbs70,
// mig29, su25, su30mk2, mirage_2000, kfir_c10, jas39_gripen_e, k8_karakorum, pc7_turbo_trainer,
// mi17, mi24, mi35m, c295, a330_mrtt, as532_cougar,
// type_209, scorpene, karel_doorman, duke_class, knox_class, koni_class, osa_ii, fs1500_padilla, esmeraldas_corvette, meko_140, damen_stan_patrol_4207
