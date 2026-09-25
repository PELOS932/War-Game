/**
 * Technology tree (~90 techs). Tiers set cost and which nations know a tech at
 * game start (by techLevel). Effect keys are interpreted by the simulation:
 *
 *  Economy:  gdpGrowth (annual fraction), taxEfficiency, tradeCost, interestRate, inflationControl,
 *            unemployment, constructionCost, constructionTime, unitCost, unitBuildTime
 *  Output:   agriOutput, timberOutput, rubberOutput, oilOutput, offshoreOutput, miningOutput,
 *            powerOutput, nuclearOutput, renewableOutput, industryOutput, consumerOutput, militaryOutput
 *  Demand:   powerDemand, petroleumDemand (negative = less demand)
 *  Society:  approval (points), literacy, lawOrder (points), warWeariness (fraction), researchSpeed
 *  Military: landAttack, landDefense, airAttack, airDefense, navalAttack, navalDefense, aaAttack,
 *            subAttack, artilleryAttack, spotting (hexes), stealth, supplyRange, fuelUse,
 *            experienceGain, efficiencyRecovery, entrenchment, urbanCombat, airRange, embarkSpeed,
 *            moveSpeed, missileAttack
 */
import type { TechCategory, TechDef } from '../types';

interface T {
  id: string;
  name: string;
  cat: TechCategory;
  tier: 1 | 2 | 3 | 4;
  prereqs?: string[];
  effects?: Record<string, number>;
  unlocks?: string[];
  desc: string;
}

const TIER_COST = [0, 1200, 3000, 6500, 11000];
/** techLevel needed to know a tier at game start. */
export const TIER_KNOWN_AT = [0, 0.3, 0.55, 0.8, 0.97];

// Military generation families: [tech prefix, name for gen2, gen3, gen4, category, designs keys, extra prereqs for gen4]
const FAMILIES: [string, string, string, string, TechCategory, string[], string[]][] = [
  ['land_infantry', 'Modern Infantry Doctrine', 'Networked Soldier Systems', 'Integrated Soldier Augmentation', 'land', ['infantry', 'sof', 'engineer'], ['sci_computing']],
  ['land_mech', 'Tracked IFV Development', 'Digital Mechanized Warfare', 'Optionally-Manned Combat Vehicles', 'land', ['mech', 'recon'], ['cyber_ai']],
  ['land_armor', 'Composite Armor', 'Active Protection Systems', 'Next-Generation MBT Program', 'land', ['armor'], ['ind_materials']],
  ['land_artillery', 'Self-Propelled Artillery', 'Precision-Guided Munitions', 'Extended Range Cannon Artillery', 'land', ['artillery', 'rocket'], ['mil_c4isr_2']],
  ['land_airdef', 'Mobile SAM Systems', 'Integrated Air Defense Networks', 'Directed-Energy Air Defense', 'land', ['airdef'], ['en_storage']],
  ['missile_tactical', 'Tactical Ballistic Missiles', 'Precision Strike Missiles', 'Hypersonic Glide Vehicles', 'missiles', ['missile'], ['ind_materials']],
  ['air_fighter', '4th-Generation Fighters', '5th-Generation Stealth Fighters', '6th-Generation Air Dominance', 'air', ['fighter', 'multirole'], ['cyber_ai']],
  ['air_strike', 'Precision Strike Aviation', 'Stealth Strike Aircraft', 'Penetrating Strike Bombers', 'air', ['strike', 'bomber'], ['mil_ew']],
  ['air_rotary', 'Modern Attack Helicopters', 'Advanced Rotorcraft', 'Future Vertical Lift', 'air', ['helicopter', 'transport'], ['ind_materials']],
  ['air_drone', 'Armed UAVs', 'Stealth UCAVs', 'Autonomous Drone Swarms', 'air', ['drone'], ['cyber_ai']],
  ['naval_surface', 'Guided Missile Warships', 'Aegis-type Combat Systems', 'Integrated Power Warships', 'naval', ['patrol', 'frigate', 'destroyer', 'cruiser'], ['en_storage']],
  ['naval_carrier', 'Supercarrier Design', 'Electromagnetic Catapults', 'Next-Generation Carrier Strike', 'naval', ['carrier', 'amphib'], ['naval_surface_3']],
  ['naval_sub', 'Nuclear Attack Submarines', 'Air-Independent Propulsion & Quieting', 'Unmanned Undersea Warfare', 'naval', ['submarine'], ['cyber_ai']],
];

const GEN_TIER: (1 | 2 | 3 | 4)[] = [0 as 1, 0 as 1, 1, 2, 3];

const LIST: T[] = [
  // ---------------------------------------------------------------- science
  { id: 'sci_computing', name: 'Supercomputing', cat: 'cyber', tier: 1, effects: { researchSpeed: 0.08 }, desc: 'National supercomputing centres accelerate every research programme.' },
  { id: 'sci_quantum', name: 'Quantum Computing', cat: 'cyber', tier: 3, prereqs: ['sci_computing', 'cyber_3'], effects: { researchSpeed: 0.1, intel: 0.1 }, desc: 'Fault-tolerant quantum processors transform chemistry, logistics and code-breaking.' },
  // ------------------------------------------------------------------ cyber
  { id: 'cyber_1', name: 'Cyber Defense Command', cat: 'cyber', tier: 1, effects: { lawOrder: 3, intel: 0.05 }, desc: 'Protects government and infrastructure networks.' },
  { id: 'cyber_2', name: 'Offensive Cyber Operations', cat: 'cyber', tier: 2, prereqs: ['cyber_1'], effects: { landAttack: 0.03, airDefense: 0.03, intel: 0.1 }, desc: 'Disrupts enemy command networks and air defences.' },
  { id: 'cyber_3', name: 'Quantum-Safe Encryption', cat: 'cyber', tier: 2, prereqs: ['cyber_1', 'sci_computing'], effects: { researchSpeed: 0.04, lawOrder: 2 }, desc: 'Secures military and financial communications against future threats.' },
  { id: 'cyber_ai', name: 'Military Artificial Intelligence', cat: 'cyber', tier: 3, prereqs: ['cyber_2', 'sci_computing'], effects: { landAttack: 0.05, airAttack: 0.05, navalAttack: 0.05, researchSpeed: 0.05 }, desc: 'AI-assisted targeting, planning and autonomous systems.' },
  { id: 'cyber_space', name: 'Space-Based Surveillance', cat: 'cyber', tier: 3, prereqs: ['cyber_2', 'soc_space'], effects: { spotting: 1, missileAttack: 0.1 }, desc: 'Satellite constellations track enemy forces in real time.' },
  // -------------------------------------------------------------- doctrine
  { id: 'mil_logistics_1', name: 'Modern Military Logistics', cat: 'land', tier: 1, effects: { supplyRange: 0.15 }, desc: 'Palletised supply chains extend the reach of your supply network.' },
  { id: 'mil_logistics_2', name: 'Predictive Logistics', cat: 'land', tier: 2, prereqs: ['mil_logistics_1', 'sci_computing'], effects: { supplyRange: 0.15, fuelUse: -0.15 }, desc: 'Data-driven logistics reduce fuel use and extend supply lines.' },
  { id: 'mil_c4isr_1', name: 'Battlefield Networking', cat: 'land', tier: 1, effects: { spotting: 1, landAttack: 0.04 }, desc: 'Digital command and control links every unit.' },
  { id: 'mil_c4isr_2', name: 'Multi-Domain Operations', cat: 'land', tier: 2, prereqs: ['mil_c4isr_1'], effects: { landAttack: 0.05, airAttack: 0.05, navalAttack: 0.05 }, desc: 'Coordinated land, air, sea, space and cyber effects.' },
  { id: 'mil_training', name: 'Professional NCO Corps', cat: 'land', tier: 1, effects: { experienceGain: 0.25, efficiencyRecovery: 0.25 }, desc: 'Long-service professionals train faster and recover morale quicker.' },
  { id: 'mil_ew', name: 'Electronic Warfare', cat: 'air', tier: 2, prereqs: ['mil_c4isr_1'], effects: { airDefense: 0.08, stealth: 0.05 }, desc: 'Jamming and deception protect aircraft and ships.' },
  { id: 'land_urban', name: 'Urban Warfare Doctrine', cat: 'land', tier: 1, effects: { urbanCombat: 0.15 }, desc: 'Training for city fighting.' },
  { id: 'land_entrench', name: 'Fortification Engineering', cat: 'land', tier: 1, effects: { entrenchment: 0.3, landDefense: 0.04 }, desc: 'Units dig in faster and deeper.' },
  { id: 'land_maneuver', name: 'Combined Arms Maneuver', cat: 'land', tier: 2, prereqs: ['mil_c4isr_1'], effects: { moveSpeed: 0.08, landAttack: 0.04 }, desc: 'Faster, better-coordinated mechanised offensives.' },
  { id: 'air_tanker', name: 'Aerial Refueling', cat: 'air', tier: 1, effects: { airRange: 0.3 }, desc: 'Tanker aircraft extend combat radius.' },
  { id: 'air_awacs', name: 'Airborne Early Warning', cat: 'air', tier: 2, prereqs: ['air_tanker'], effects: { airAttack: 0.08, spotting: 1 }, desc: 'Flying radars guide fighters to their targets.' },
  { id: 'air_pgm', name: 'Smart Munitions', cat: 'air', tier: 2, effects: { airAttack: 0.06 }, desc: 'Precision-guided bombs and missiles.' },
  { id: 'naval_asw', name: 'Anti-Submarine Warfare', cat: 'naval', tier: 1, effects: { subAttack: 0.2 }, desc: 'Towed sonars and ASW helicopters.' },
  { id: 'naval_amphib', name: 'Amphibious Doctrine', cat: 'naval', tier: 1, effects: { embarkSpeed: 0.3 }, desc: 'Faster, safer sea transport and landings.' },
  { id: 'naval_damage', name: 'Damage Control Systems', cat: 'naval', tier: 2, effects: { navalDefense: 0.08 }, desc: 'Automated firefighting and compartmentalisation.' },
  { id: 'missile_defense', name: 'Ballistic Missile Defense', cat: 'missiles', tier: 2, prereqs: ['land_airdef_2'], effects: { aaAttack: 0.12 }, desc: 'Interceptors against missiles and aircraft.' },
  { id: 'missile_cruise', name: 'Long-Range Cruise Missiles', cat: 'missiles', tier: 2, prereqs: ['missile_tactical_2'], effects: { missileAttack: 0.12 }, desc: 'Stand-off precision strikes.' },
  // ---------------------------------------------------------------- economy
  { id: 'econ_banking', name: 'Modern Central Banking', cat: 'economy', tier: 1, effects: { inflationControl: 0.2, interestRate: -0.003 }, desc: 'Independent monetary policy tames inflation and lowers borrowing costs.' },
  { id: 'econ_fintech', name: 'Digital Finance', cat: 'economy', tier: 2, prereqs: ['econ_banking'], effects: { taxEfficiency: 0.03, gdpGrowth: 0.002 }, desc: 'Digital payments broaden the tax base.' },
  { id: 'econ_logistics', name: 'Containerized Logistics', cat: 'economy', tier: 1, effects: { tradeCost: -0.04, gdpGrowth: 0.002 }, desc: 'Cheaper trade and faster supply chains.' },
  { id: 'econ_ecommerce', name: 'E-Commerce Economy', cat: 'economy', tier: 2, prereqs: ['econ_logistics'], effects: { gdpGrowth: 0.003 }, desc: 'Online retail and platforms raise productivity.' },
  { id: 'econ_automation', name: 'Service Automation', cat: 'economy', tier: 3, prereqs: ['econ_ecommerce', 'sci_computing'], effects: { gdpGrowth: 0.004, unemployment: 0.01 }, desc: 'Automation boosts output but displaces some workers.' },
  { id: 'econ_ai', name: 'AI-Driven Economy', cat: 'economy', tier: 4, prereqs: ['econ_automation', 'cyber_ai'], effects: { gdpGrowth: 0.006, researchSpeed: 0.05 }, desc: 'Generative AI across every sector of the economy.' },
  { id: 'econ_tourism', name: 'Tourism Development', cat: 'economy', tier: 1, effects: { gdpGrowth: 0.001, approval: 1 }, desc: 'Visitors bring foreign currency and jobs.' },
  // --------------------------------------------------------------- industry
  { id: 'ind_lean', name: 'Lean Manufacturing', cat: 'industry', tier: 1, effects: { industryOutput: 0.05, consumerOutput: 0.05 }, desc: 'Just-in-time production.' },
  { id: 'ind_robotics', name: 'Industrial Robotics', cat: 'industry', tier: 2, prereqs: ['ind_lean'], effects: { industryOutput: 0.08, consumerOutput: 0.08, militaryOutput: 0.05 }, desc: 'Robotic assembly lines.' },
  { id: 'ind_additive', name: 'Additive Manufacturing', cat: 'industry', tier: 2, prereqs: ['ind_lean'], effects: { militaryOutput: 0.08, unitCost: -0.05 }, desc: '3D printing of parts and munitions.' },
  { id: 'ind_materials', name: 'Advanced Materials', cat: 'industry', tier: 2, prereqs: ['ind_lean'], effects: { industryOutput: 0.05, landDefense: 0.03 }, desc: 'Composites and super-alloys.' },
  { id: 'ind_nanotech', name: 'Nanotechnology', cat: 'industry', tier: 4, prereqs: ['ind_materials', 'ind_robotics'], effects: { industryOutput: 0.08, consumerOutput: 0.08 }, desc: 'Molecular-scale manufacturing.' },
  { id: 'ind_construction', name: 'Modular Construction', cat: 'industry', tier: 1, effects: { constructionCost: -0.1, constructionTime: -0.15 }, desc: 'Prefabricated modules speed up building.' },
  { id: 'ind_defense', name: 'Defense Industrial Base', cat: 'industry', tier: 2, prereqs: ['ind_lean'], effects: { unitBuildTime: -0.12, militaryOutput: 0.05 }, desc: 'Surge capacity in arms production.' },
  { id: 'ind_mining', name: 'Automated Mining', cat: 'industry', tier: 2, effects: { miningOutput: 0.12 }, desc: 'Autonomous haul trucks and drills.' },
  { id: 'ind_fracking', name: 'Hydraulic Fracturing', cat: 'industry', tier: 1, effects: { oilOutput: 0.15 }, desc: 'Unlocks shale oil and gas.' },
  { id: 'ind_deepwater', name: 'Deepwater Drilling', cat: 'industry', tier: 2, prereqs: ['ind_fracking'], effects: { offshoreOutput: 0.2 }, desc: 'Ultra-deep offshore wells.' },
  // ----------------------------------------------------------------- energy
  { id: 'en_grid', name: 'Smart Grid', cat: 'energy', tier: 1, effects: { powerOutput: 0.05, powerDemand: -0.04 }, desc: 'Digitally managed transmission cuts losses.' },
  { id: 'en_solar', name: 'Advanced Photovoltaics', cat: 'energy', tier: 1, effects: { renewableOutput: 0.25 }, desc: 'High-efficiency solar cells.' },
  { id: 'en_storage', name: 'Grid-Scale Storage', cat: 'energy', tier: 2, prereqs: ['en_solar', 'en_grid'], effects: { renewableOutput: 0.2, powerOutput: 0.03 }, desc: 'Batteries smooth out renewable supply.' },
  { id: 'en_nuclear3', name: 'Generation III+ Reactors', cat: 'energy', tier: 2, effects: { nuclearOutput: 0.15 }, desc: 'Safer, more efficient fission reactors.' },
  { id: 'en_smr', name: 'Small Modular Reactors', cat: 'energy', tier: 3, prereqs: ['en_nuclear3'], effects: { nuclearOutput: 0.15, constructionTime: -0.05 }, desc: 'Factory-built reactors.' },
  { id: 'en_fusion', name: 'Fusion Power', cat: 'energy', tier: 4, prereqs: ['en_smr', 'sci_quantum'], effects: { powerOutput: 0.12 }, desc: 'The first commercial fusion reactors.' },
  { id: 'en_efficiency', name: 'Energy Efficiency Standards', cat: 'energy', tier: 1, effects: { powerDemand: -0.06, petroleumDemand: -0.04 }, desc: 'Efficient buildings and appliances.' },
  { id: 'en_ev', name: 'Electric Vehicles', cat: 'energy', tier: 2, prereqs: ['en_storage'], effects: { petroleumDemand: -0.12, powerDemand: 0.04 }, desc: 'Mass electrification of transport.' },
  // ------------------------------------------------------------ agriculture
  { id: 'agri_mech', name: 'Farm Mechanization', cat: 'agriculture', tier: 1, effects: { agriOutput: 0.08 }, desc: 'Tractors and combines everywhere.' },
  { id: 'agri_irrigation', name: 'Modern Irrigation', cat: 'agriculture', tier: 1, effects: { agriOutput: 0.06 }, desc: 'Drip irrigation and reservoirs.' },
  { id: 'agri_gm', name: 'Genetically Engineered Crops', cat: 'agriculture', tier: 2, prereqs: ['agri_mech'], effects: { agriOutput: 0.12 }, desc: 'High-yield, drought-resistant crops.' },
  { id: 'agri_precision', name: 'Precision Agriculture', cat: 'agriculture', tier: 3, prereqs: ['agri_gm', 'sci_computing'], effects: { agriOutput: 0.1 }, desc: 'Satellite and drone guided farming.' },
  { id: 'agri_vertical', name: 'Vertical Farming', cat: 'agriculture', tier: 4, prereqs: ['agri_precision', 'en_storage'], effects: { agriOutput: 0.08 }, desc: 'Indoor farms in cities.' },
  { id: 'agri_forestry', name: 'Sustainable Forestry', cat: 'agriculture', tier: 1, effects: { timberOutput: 0.15, rubberOutput: 0.15 }, desc: 'Managed forests and plantations.' },
  // ---------------------------------------------------------------- society
  { id: 'soc_healthcare', name: 'Universal Healthcare Systems', cat: 'society', tier: 1, effects: { approval: 2 }, desc: 'Accessible public healthcare.' },
  { id: 'soc_education', name: 'Digital Education', cat: 'society', tier: 2, effects: { literacy: 0.02, researchSpeed: 0.05 }, desc: 'Online learning for every citizen.' },
  { id: 'soc_media', name: 'Mass Media Strategy', cat: 'society', tier: 1, effects: { approval: 1.5, warWeariness: -0.15 }, desc: 'Shapes public opinion.' },
  { id: 'soc_policing', name: 'Community Policing', cat: 'society', tier: 1, effects: { lawOrder: 6 }, desc: 'Better relations between police and public.' },
  { id: 'soc_genomics', name: 'Genomic Medicine', cat: 'society', tier: 3, prereqs: ['soc_healthcare', 'sci_computing'], effects: { approval: 2, gdpGrowth: 0.001 }, desc: 'Personalised medicine extends healthy lives.' },
  { id: 'soc_space', name: 'Commercial Space Industry', cat: 'society', tier: 2, prereqs: ['sci_computing'], effects: { researchSpeed: 0.04, gdpGrowth: 0.001 }, desc: 'Reusable launchers and satellite constellations.' },
  { id: 'soc_welfare', name: 'Modern Welfare State', cat: 'society', tier: 2, prereqs: ['soc_healthcare'], effects: { approval: 2, unemployment: -0.005 }, desc: 'Active labour-market policies.' },
];

function build(): TechDef[] {
  const out: TechDef[] = [];
  const add = (t: T) => {
    out.push({
      id: t.id,
      name: t.name,
      category: t.cat,
      cost: TIER_COST[t.tier],
      prereqs: t.prereqs ?? [],
      description: t.desc,
      effects: t.effects ?? {},
      unlocksDesigns: t.unlocks ?? [],
    });
    TECH_TIER.set(t.id, t.tier);
  };
  for (const [prefix, n2, n3, n4, cat, keys, extra] of FAMILIES) {
    const names = ['', '', n2, n3, n4];
    for (let g = 2; g <= 4; g++) {
      const prereqs = g === 2 ? [] : [`${prefix}_${g - 1}`];
      if (g === 4) prereqs.push(...extra);
      const effects: Record<string, number> = {};
      if (cat === 'land') effects.landAttack = 0.02;
      else if (cat === 'air') effects.airAttack = 0.02;
      else if (cat === 'naval') effects.navalAttack = 0.02;
      else effects.missileAttack = 0.03;
      add({
        id: `${prefix}_${g}`,
        name: names[g],
        cat,
        tier: GEN_TIER[g],
        prereqs,
        effects,
        unlocks: keys.map((k) => `${k}_g${g}`),
        desc: `Unlocks generation ${g} designs: ${keys.join(', ')}.`,
      });
    }
  }
  for (const t of LIST) add(t);
  return out;
}

/** Tier (1..4) of each tech. */
export const TECH_TIER = new Map<string, number>();
export const TECHS: TechDef[] = build();

/** Techs a nation knows at game start given its techLevel (deterministic jitter per nation). */
export function initialTechs(techLevel: number, jitter: (id: string) => number): Set<string> {
  const known = new Set<string>();
  // Iterate in dependency order (repeat until stable).
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of TECHS) {
      if (known.has(t.id)) continue;
      const tier = TECH_TIER.get(t.id) ?? 1;
      const need = TIER_KNOWN_AT[tier] + (jitter(t.id) - 0.5) * 0.12;
      if (techLevel < need) continue;
      if (!t.prereqs.every((p) => known.has(p))) continue;
      known.add(t.id);
      changed = true;
    }
  }
  return known;
}
