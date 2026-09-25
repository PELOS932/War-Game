/**
 * DEV ONLY — a mock GameAPI with enough behaviour to exercise every UI screen:
 * time advances, units move along paths, economy ticks, news and proposals
 * appear, production and research progress.
 */
import type { GameAPI, CommandResult } from '../../sim/api';
import {
  CATEGORY_CLASS, City, Department, Facility, FacilityDef, FacilityType, GameEvent, GameState, Minister,
  MinisterRole, Nation, NewsItem, Proposal, RESOURCE_COUNT, Resource, SPEED_HOURS_PER_SECOND, Spending, Stance,
  Taxes, TechDef, TradePolicy, TreatyType, Unit, UnitCategory, UnitClass, UnitDesign, War, TechCategory,
} from '../../sim/types';
import { HexGrid } from '../../core/hex';
import { RNG } from '../../core/rng';
import { isWaterTerrain, WorldData } from '../../worldgen/types';

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------
type Tpl = [string, UnitCategory, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
// name, cat, soft, hard, air, naval, sub, rangeG, defG, defA, defN, speed, spot, cost(M), mg, days
const TPL: Tpl[] = [
  ['Rifle Infantry Battalion', UnitCategory.Infantry, 45, 15, 6, 0, 0, 0, 42, 18, 5, 6, 2, 60, 20, 20],
  ['Mechanized Infantry Battalion', UnitCategory.Mechanized, 50, 30, 8, 0, 0, 0, 50, 22, 5, 45, 2, 180, 60, 35],
  ['Main Battle Tank Battalion', UnitCategory.Armor, 45, 70, 4, 0, 0, 0, 70, 20, 5, 50, 2, 420, 140, 60],
  ['Self-Propelled Artillery', UnitCategory.Artillery, 60, 40, 0, 10, 0, 3, 25, 10, 5, 40, 2, 260, 90, 45],
  ['Rocket Artillery Battery', UnitCategory.RocketArtillery, 70, 35, 0, 15, 0, 5, 20, 10, 5, 50, 2, 320, 110, 50],
  ['SAM Battalion', UnitCategory.AirDefense, 5, 5, 75, 0, 0, 0, 25, 60, 5, 40, 4, 380, 120, 55],
  ['Reconnaissance Company', UnitCategory.Recon, 30, 15, 5, 0, 0, 0, 30, 15, 5, 70, 5, 90, 30, 20],
  ['Special Forces Group', UnitCategory.SpecialForces, 60, 25, 8, 0, 0, 0, 45, 20, 5, 8, 4, 150, 40, 40],
  ['Combat Engineer Battalion', UnitCategory.Engineers, 30, 20, 4, 0, 0, 0, 40, 15, 5, 30, 2, 110, 35, 30],
  ['Ballistic Missile Brigade', UnitCategory.MissileLauncher, 80, 80, 0, 40, 0, 12, 15, 10, 5, 40, 2, 900, 300, 90],
  ['Air Superiority Squadron', UnitCategory.Fighter, 5, 5, 85, 5, 0, 0, 30, 70, 10, 2100, 8, 1400, 420, 120],
  ['Multirole Fighter Squadron', UnitCategory.Multirole, 45, 45, 70, 30, 0, 0, 30, 60, 10, 1900, 7, 1200, 380, 110],
  ['Strike Aircraft Squadron', UnitCategory.Strike, 70, 75, 15, 45, 0, 0, 25, 40, 10, 1000, 6, 1000, 330, 100],
  ['Strategic Bomber Wing', UnitCategory.Bomber, 90, 85, 0, 60, 0, 0, 25, 30, 10, 950, 6, 2500, 700, 180],
  ['Attack Helicopter Squadron', UnitCategory.Helicopter, 65, 70, 15, 20, 5, 0, 30, 30, 10, 290, 5, 600, 200, 70],
  ['Airlift Squadron', UnitCategory.AirTransport, 0, 0, 0, 0, 0, 0, 20, 15, 5, 800, 4, 700, 150, 90],
  ['Combat Drone Squadron', UnitCategory.Drone, 50, 45, 5, 25, 0, 0, 15, 20, 5, 350, 9, 300, 90, 40],
  ['Patrol Boat Flotilla', UnitCategory.PatrolBoat, 20, 10, 10, 30, 10, 1, 20, 15, 25, 60, 4, 120, 40, 40],
  ['Frigate', UnitCategory.Frigate, 25, 20, 35, 45, 40, 2, 35, 40, 45, 55, 6, 700, 220, 150],
  ['Guided Missile Destroyer', UnitCategory.Destroyer, 35, 30, 60, 60, 45, 3, 45, 60, 55, 57, 7, 1800, 550, 240],
  ['Guided Missile Cruiser', UnitCategory.Cruiser, 50, 40, 65, 70, 30, 4, 55, 65, 65, 55, 7, 2800, 800, 300],
  ['Aircraft Carrier', UnitCategory.Carrier, 10, 10, 40, 20, 10, 1, 70, 55, 60, 55, 9, 12000, 3000, 900],
  ['Attack Submarine', UnitCategory.Submarine, 10, 10, 0, 75, 70, 3, 40, 10, 40, 60, 5, 2400, 650, 330],
  ['Amphibious Assault Ship', UnitCategory.Amphibious, 20, 15, 30, 25, 10, 1, 45, 40, 40, 40, 5, 3500, 900, 360],
];

const GEN_NAMES = ['', 'Mk I', 'Mk II', 'Mk III', 'Mk IV'];

function buildDesigns(): Map<string, UnitDesign> {
  const m = new Map<string, UnitDesign>();
  TPL.forEach((t, ti) => {
    for (let gen = 1; gen <= 3; gen++) {
      const k = 0.75 + gen * 0.15;
      const cat = t[1];
      const cls = CATEGORY_CLASS[cat];
      const id = `d${ti}_g${gen}`;
      m.set(id, {
        id, name: `${t[0]} ${GEN_NAMES[gen]}`, category: cat, cls, generation: gen,
        requiresTech: gen === 1 ? null : `${cls === UnitClass.Land ? 'land' : cls === UnitClass.Air ? 'air' : 'naval'}_${gen}`,
        armor: cls === UnitClass.Air ? 'air' : cls === UnitClass.Naval ? (cat === UnitCategory.Submarine ? 'sub' : 'naval') : cat === UnitCategory.Armor || cat === UnitCategory.Mechanized ? 'hard' : 'soft',
        mobility: cls === UnitClass.Air ? 'air' : cls === UnitClass.Naval ? 'naval' : cat === UnitCategory.Infantry || cat === UnitCategory.SpecialForces ? 'foot' : cat === UnitCategory.Armor ? 'tracked' : 'wheeled',
        personnel: cls === UnitClass.Land ? 600 + ti * 20 : cls === UnitClass.Air ? 120 : 250 + ti * 10,
        attackSoft: Math.round(t[2] * k), attackHard: Math.round(t[3] * k), attackAir: Math.round(t[4] * k), attackNaval: Math.round(t[5] * k), attackSub: Math.round(t[6] * k),
        rangeGround: t[7], rangeAir: cat === UnitCategory.AirDefense ? 3 : cls === UnitClass.Naval ? 2 : 0, rangeNaval: cls === UnitClass.Naval ? t[7] : 0,
        defenseGround: Math.round(t[8] * k), defenseAir: Math.round(t[9] * k), defenseNaval: Math.round(t[10] * k),
        speedKmh: Math.round(t[11] * (0.9 + gen * 0.05)), spotting: t[12], stealth: cat === UnitCategory.Submarine ? 0.8 : cat === UnitCategory.SpecialForces ? 0.6 : 0.2 + gen * 0.05,
        rangeKm: cls === UnitClass.Air ? 600 + gen * 250 : 0, fuelCapacity: cls === UnitClass.Air ? 6 + gen * 2 : 72 + gen * 24,
        cost: Math.round(t[13] * (0.7 + gen * 0.3)), militaryGoodsCost: Math.round(t[14] * (0.7 + gen * 0.3)), buildDays: Math.round(t[15] * (0.8 + gen * 0.2)),
        upkeep: +(t[13] * 0.0008 * gen).toFixed(3), indirect: cat === UnitCategory.Artillery || cat === UnitCategory.RocketArtillery || cat === UnitCategory.MissileLauncher,
        canCapture: cls === UnitClass.Land && cat !== UnitCategory.Artillery, description: `Generation ${gen} ${t[0].toLowerCase()}. Standard equipment of modern armed forces.`,
      });
    }
  });
  return m;
}

function buildTechs(): Map<string, TechDef> {
  const m = new Map<string, TechDef>();
  const add = (id: string, name: string, category: TechCategory, cost: number, prereqs: string[], effects: Record<string, number>, unlocks: string[] = [], desc = '') =>
    m.set(id, { id, name, category, cost, prereqs, effects, unlocksDesigns: unlocks, description: desc || `Advances in ${name.toLowerCase()}.` });
  const cats: [TechCategory, string[], string][] = [
    ['economy', ['Digital Banking', 'Automated Logistics', 'AI Market Forecasting', 'Post-Scarcity Planning'], 'gdpGrowth'],
    ['industry', ['Lean Manufacturing', 'Industrial Robotics', 'Additive Manufacturing', 'Nanofabrication'], 'industryOutput'],
    ['energy', ['Smart Grid', 'Advanced Solar', 'Grid-Scale Storage', 'Fusion Prototype'], 'powerOutput'],
    ['agriculture', ['Precision Farming', 'Vertical Farms', 'Drought-Resistant Crops', 'Lab-Grown Protein'], 'agriOutput'],
    ['society', ['Telemedicine', 'E-Learning Networks', 'Universal Healthcare Systems', 'Longevity Medicine'], 'approval'],
    ['land', ['Networked Infantry', 'Active Protection Systems', 'Robotic Ground Vehicles', 'Exoskeleton Infantry'], 'landAttack'],
    ['air', ['Stealth Coatings', 'Loyal Wingman Drones', 'Hypersonic Munitions', 'Sixth-Gen Air Dominance'], 'airAttack'],
    ['naval', ['Integrated Sensors', 'Unmanned Surface Vessels', 'Railgun Weapons', 'Autonomous Submarines'], 'navalAttack'],
    ['missiles', ['Precision Guidance', 'Cruise Missile Swarms', 'Hypersonic Glide Vehicles', 'Missile Defense Shield'], 'missileAccuracy'],
    ['cyber', ['Network Defense', 'Offensive Cyber Ops', 'Quantum Encryption', 'AI Command Systems'], 'cyberDefense'],
  ];
  for (const [cat, names, eff] of cats) {
    names.forEach((nm, i) => {
      const id = `${cat}_${i + 1}`;
      const prereqs = i === 0 ? [] : [`${cat}_${i}`];
      if (i === 3 && cat === 'air') prereqs.push('cyber_2');
      if (i === 2 && cat === 'land') prereqs.push('industry_2');
      const unlocks: string[] = [];
      if (cat === 'land' || cat === 'air' || cat === 'naval') {
        if (i === 1 || i === 2) {
          const gen = i + 1;
          TPL.forEach((t, ti) => {
            const cls = CATEGORY_CLASS[t[1]];
            if ((cls === UnitClass.Land && cat === 'land') || (cls === UnitClass.Air && cat === 'air') || (cls === UnitClass.Naval && cat === 'naval')) unlocks.push(`d${ti}_g${gen}`);
          });
        }
      }
      add(id, nm, cat, 400 + i * 450, prereqs, { [eff]: 0.03 + i * 0.02, ...(i === 3 ? { researchSpeed: 0.05 } : {}) }, unlocks);
    });
  }
  // alias ids used by designs' requiresTech
  for (const cls of ['land', 'air', 'naval']) {
    const t2 = m.get(`${cls}_2`);
    const t3 = m.get(`${cls}_3`);
    if (t2) m.set(`${cls}_2`, t2);
    if (t3) m.set(`${cls}_3`, t3);
  }
  return m;
}

function buildFacilityDefs(): FacilityDef[] {
  const R = Resource;
  const d = (type: FacilityType, name: string, produces: Resource | null, output: number, inputs: Partial<Record<Resource, number>>, workers: number, cost: number, buildDays: number, military: boolean, description: string): FacilityDef =>
    ({ type, name, produces, output, inputs, workers, cost, buildDays, upkeep: +(cost * 0.0004).toFixed(3), maxLevel: 5, military, description });
  return [
    d(FacilityType.Farm, 'Farm', R.Agriculture, 40, { [R.ElectricPower]: 2 }, 6, 120, 30, false, 'Grows crops and livestock.'),
    d(FacilityType.Plantation, 'Rubber Plantation', R.Rubber, 20, { [R.ElectricPower]: 1 }, 5, 140, 40, false, 'Harvests natural rubber in tropical climates.'),
    d(FacilityType.LumberMill, 'Lumber Mill', R.Timber, 30, { [R.ElectricPower]: 3 }, 3, 110, 25, false, 'Processes timber from forests.'),
    d(FacilityType.OilWell, 'Oil Well', R.Petroleum, 35, { [R.ElectricPower]: 3, [R.IndustryGoods]: 1 }, 2, 380, 60, false, 'Extracts crude oil from land deposits.'),
    d(FacilityType.OffshorePlatform, 'Offshore Platform', R.Petroleum, 50, { [R.ElectricPower]: 4, [R.IndustryGoods]: 2 }, 2, 900, 120, false, 'Extracts oil & gas from offshore fields.'),
    d(FacilityType.CoalMine, 'Coal Mine', R.Coal, 40, { [R.ElectricPower]: 3 }, 5, 250, 50, false, 'Mines coal from coal seams.'),
    d(FacilityType.OreMine, 'Ore Mine', R.MetalOre, 30, { [R.ElectricPower]: 4 }, 5, 300, 55, false, 'Mines metal ore.'),
    d(FacilityType.UraniumMine, 'Uranium Mine', R.Uranium, 4, { [R.ElectricPower]: 3 }, 2, 450, 80, false, 'Mines and enriches uranium.'),
    d(FacilityType.PowerPlant, 'Fossil Power Plant', R.ElectricPower, 80, { [R.Coal]: 10, [R.Petroleum]: 4 }, 1, 600, 90, false, 'Generates electricity from coal and oil.'),
    d(FacilityType.NuclearPlant, 'Nuclear Power Plant', R.ElectricPower, 200, { [R.Uranium]: 1 }, 1.5, 4500, 400, false, 'Generates large amounts of clean electricity.'),
    d(FacilityType.HydroDam, 'Hydroelectric Dam', R.ElectricPower, 120, {}, 0.5, 2200, 300, false, 'Generates electricity from rivers.'),
    d(FacilityType.RenewablePlant, 'Renewable Energy Park', R.ElectricPower, 50, {}, 0.3, 700, 80, false, 'Solar and wind generation.'),
    d(FacilityType.ConsumerFactory, 'Consumer Goods Factory', R.ConsumerGoods, 30, { [R.ElectricPower]: 6, [R.Agriculture]: 4, [R.Timber]: 3, [R.Rubber]: 1 }, 8, 450, 70, false, 'Produces consumer goods for the population.'),
    d(FacilityType.IndustrialPlant, 'Industrial Plant', R.IndustryGoods, 25, { [R.ElectricPower]: 8, [R.MetalOre]: 6, [R.Coal]: 3 }, 7, 550, 80, false, 'Produces industrial goods and machinery.'),
    d(FacilityType.MilitaryFactory, 'Military Factory', R.MilitaryGoods, 18, { [R.ElectricPower]: 8, [R.IndustryGoods]: 6, [R.Petroleum]: 2 }, 6, 800, 100, true, 'Produces military goods: munitions and equipment.'),
    d(FacilityType.ResearchLab, 'Research Laboratory', null, 0, { [R.ElectricPower]: 3 }, 1, 700, 90, false, 'Generates research points.'),
    d(FacilityType.Barracks, 'Barracks', null, 0, {}, 0.5, 200, 30, true, 'Trains land units; improves reinforcement.'),
    d(FacilityType.Airbase, 'Airbase', null, 0, { [R.Petroleum]: 2 }, 1, 900, 120, true, 'Hosts and supplies air units.'),
    d(FacilityType.NavalBase, 'Naval Base', null, 0, { [R.Petroleum]: 2 }, 1.5, 1200, 150, true, 'Builds, repairs and supplies naval units.'),
    d(FacilityType.MissileSilo, 'Missile Silo', null, 0, {}, 0.2, 1500, 180, true, 'Launches strategic missiles.'),
    d(FacilityType.SupplyDepot, 'Supply Depot', null, 0, {}, 0.3, 150, 20, true, 'Extends supply range for nearby units.'),
    d(FacilityType.RadarStation, 'Radar Station', null, 0, { [R.ElectricPower]: 1 }, 0.1, 250, 40, true, 'Extends detection range for air and ground contacts.'),
  ];
}

const ROLES: MinisterRole[] = ['head', 'defense', 'foreign', 'finance', 'economy', 'research', 'interior', 'intelligence'];
const MFIRST = ['Adrian', 'Elena', 'Victor', 'Amara', 'Tomas', 'Leila', 'Samuel', 'Nadia', 'Kofi', 'Mariam', 'Luis', 'Anya', 'Hassan', 'Irina', 'Pedro', 'Aisha', 'Viktor', 'Yuki', 'Helen', 'Robert'];
const MLAST = ['Moreau', 'Kovac', 'Mensah', 'Haddad', 'Silva', 'Novak', 'Osei', 'Petrov', 'Rahman', 'Castillo', 'Lindgren', 'Abara', 'Farouk', 'Dimitrov', 'Okoro', 'Varga', 'Santos', 'Ivanova', 'Grant', 'Walsh'];

// ---------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------
export function createMockGame(world: WorldData, playerNation: number): GameAPI {
  const rng = new RNG(99);
  const grid = new HexGrid(world.settings.cols, world.settings.rows);
  const designs = buildDesigns();
  const techs = buildTechs();
  const facilityDefs = buildFacilityDefs();
  const N = world.nations.length;
  const listeners: ((e: GameEvent) => void)[] = [];
  let nextId = 1;
  const emit = (e: GameEvent) => listeners.forEach((l) => l(e));

  const nations: Nation[] = world.nations.map((s) => {
    const stock = new Float64Array(RESOURCE_COUNT);
    const production = new Float64Array(RESOURCE_COUNT);
    const consumption = new Float64Array(RESOURCE_COUNT);
    for (let r = 0; r < RESOURCE_COUNT; r++) {
      production[r] = s.gdp * rng.range(0.01, 0.06);
      consumption[r] = production[r] * rng.range(0.7, 1.35);
      stock[r] = production[r] * rng.range(10, 90);
    }
    const ministers: Minister[] = ROLES.map((role) => ({
      role, name: role === 'head' ? s.leaderName : `${rng.pick(MFIRST)} ${rng.pick(MLAST)}`, competence: rng.range(0.3, 0.95), loyalty: rng.range(0.4, 1), ideology: rng.range(-1, 1),
    }));
    const known = new Set<string>();
    for (const t of techs.values()) if (t.prereqs.length === 0 && rng.chance(0.5 + s.techLevel * 0.4)) known.add(t.id);
    if (s.techLevel > 0.7) for (const c of ['land_1', 'land_2', 'air_1', 'air_2', 'naval_1', 'naval_2', 'cyber_1', 'cyber_2', 'industry_1', 'industry_2']) known.add(c);
    const hist = [];
    for (let d = -60; d <= 0; d += 3) hist.push({ day: d, gdp: s.gdp * (1 + d * 0.0003 + rng.range(-0.004, 0.004)), treasury: s.gdp * 0.05 * (1 + d * 0.004 + rng.range(-0.02, 0.02)), approval: 55 + rng.range(-5, 5) + d * 0.02, military: s.activeMilitary * (1 + rng.range(-0.01, 0.01)) });
    const n: Nation = {
      id: s.id, code: s.code, name: s.name, formalName: s.formalName, adjective: s.adjective, color: s.color, flag: s.flag,
      government: s.government, leaderTitle: s.leaderTitle, leaderName: s.leaderName, culture: s.culture, alive: true, isPlayer: s.id === playerNation,
      capitalCity: -1, population: s.population, gdp: s.gdp, gdpGrowth: rng.range(-0.01, 0.06), treasury: s.gdp * 0.05, debt: s.gdp * rng.range(0.2, 1.1),
      creditRating: 40 + s.development * 55, taxes: { income: 0.22, corporate: 0.2, sales: 0.12 },
      spending: { health: 0.06, education: 0.045, infrastructure: 0.03, environment: 0.008, family: 0.015, lawEnforcement: 0.012, culture: 0.004, socialAssistance: 0.05 },
      militaryBudget: s.defenseBudget / 100, researchBudget: 0.02, approval: 55 + rng.range(-10, 15), unemployment: rng.range(0.03, 0.14), literacy: 0.6 + s.development * 0.39,
      worldOpinion: 50 + rng.range(-20, 25), inflation: rng.range(0.01, 0.08), defcon: 5, techLevel: s.techLevel, nuclear: s.nuclear, development: s.development,
      stock, production, consumption, traded: new Float64Array(RESOURCE_COUNT), tradePolicy: Array.from({ length: RESOURCE_COUNT }, () => 'auto' as TradePolicy),
      researchPoints: s.gdp * 0.02 * (0.5 + s.techLevel), knownTechs: known, researching: [], productionQueue: [], ministers,
      autonomy: { economy: false, trade: true, research: false, production: false, diplomacy: false, military: false },
      aggression: s.aggression, ideology: s.ideology, militarism: s.militarism, navalFocus: s.navalFocus, blocs: [...s.blocs], warWeariness: rng.range(0, 20), history: hist,
      income: {}, expenses: {},
      militaryFund: s.gdp * 0.002, costFactor: 1, interestRate: 0.035, techMods: {}, lawOrder: 60 + rng.range(-10, 20),
      satisfaction: new Float64Array(RESOURCE_COUNT).map(() => rng.range(0.7, 1)), demand: new Float64Array(consumption),
      hexCount: s.hexCount, cityCount: 0, unitCount: 0, power: 0, nextElectionDay: s.government <= 3 ? rng.int(200, 1400) : -1,
      laborForce: s.population * 0.48, tradeBalance: rng.range(-0.5, 0.5), servicesIncome: s.gdp * 0.1, rally: 0, growthShock: 0,
      gdpServices: s.gdp * 0.7, gdpGoods: s.gdp * 0.3, upkeepFactor: 1, casualtiesToday: 0,
    } as unknown as Nation;
    computeFinance(n);
    return n;
  });

  function computeFinance(n: Nation): void {
    const g = n.gdp / 365;
    n.income = {
      incomeTax: g * n.taxes.income * 0.45, corporateTax: g * n.taxes.corporate * 0.25, salesTax: g * n.taxes.sales * 0.6,
      tradeRevenue: g * 0.004, tariffs: g * 0.002,
    };
    n.expenses = {
      health: g * n.spending.health, education: g * n.spending.education, infrastructure: g * n.spending.infrastructure,
      environment: g * n.spending.environment, family: g * n.spending.family, lawEnforcement: g * n.spending.lawEnforcement,
      culture: g * n.spending.culture, socialAssistance: g * n.spending.socialAssistance, military: g * n.militaryBudget,
      research: g * n.researchBudget, debtInterest: (n.debt * 0.035) / 365, facilityUpkeep: g * 0.004,
    };
  }

  const cities: City[] = world.cities.map((c) => ({ id: c.id, name: c.name, hex: c.hex, urbanHexes: c.urbanHexes, population: c.population, capital: c.capital, port: c.port, originalNation: c.nation, damage: 0, x: c.x, z: c.z }));
  for (const c of cities) if (c.capital) nations[c.originalNation].capitalCity = c.id;

  const relations = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) relations[i] = world.relations[i];

  const units = new Map<number, Unit>();
  const designList = [...designs.values()];
  const mkUnit = (nation: number, design: UnitDesign, hex: number, idx: number): Unit => {
    const id = nextId++;
    const u: Unit = {
      id, design: design.id, nation, name: `${ordinal(idx)} ${design.name.replace(/ Mk I+V?$/, '').replace(/ Battalion| Squadron| Battery| Company| Group| Brigade| Flotilla| Wing/, '')} ${design.cls === UnitClass.Land ? 'Bn' : design.cls === UnitClass.Air ? 'Sqn' : ''}`.trim(),
      hex, x: grid.cx[hex] + rng.range(-0.3, 0.3), z: grid.cz[hex] + rng.range(-0.3, 0.3), heading: 0,
      strength: rng.range(55, 100), efficiency: rng.range(50, 100), experience: rng.range(5, 70), supply: rng.range(40, 100), fuel: rng.range(40, 100), entrenchment: rng.range(0, 80),
      stance: 'defensive', order: { type: 'idle', targetHex: -1, targetUnit: -1 }, path: [], moveProgress: 0, inCombat: false, embarked: false,
      airborne: false, baseHex: design.cls === UnitClass.Air ? hex : -1, missionHours: 0, kills: rng.int(0, 12), createdHour: 0, groupId: -1,
      carrier: -1, hidden: false, lastCombatHour: -1, airState: 'ready', airTimer: 0, blockedHours: 0,
    } as Unit;
    units.set(id, u);
    return u;
  };
  // Place units near capitals / cities.
  for (const n of nations) {
    const cap = cities[n.capitalCity];
    if (!cap) continue;
    const count = n.id === playerNation ? 42 : Math.min(14, Math.max(2, Math.round(Math.log2(world.nations[n.id].activeMilitary + 2))));
    const own = (hx: number) => world.hexOwner[hx] === n.id + 1;
    const landHexes: number[] = [];
    const seaHexes: number[] = [];
    grid.forRadius(cap.hex, 8, (hx) => {
      if (own(hx)) landHexes.push(hx);
      else if (isWaterTerrain(world.hexTerrain[hx])) seaHexes.push(hx);
    });
    for (let i = 0; i < count; i++) {
      let d = rng.pick(designList.filter((x) => x.generation <= (n.techLevel > 0.7 ? 3 : 2)));
      if (d.cls === UnitClass.Naval && !seaHexes.length) d = designs.get('d0_g1') as UnitDesign;
      const hx = d.cls === UnitClass.Naval ? rng.pick(seaHexes) : rng.pick(landHexes.length ? landHexes : [cap.hex]);
      const u = mkUnit(n.id, d, hx, i + 1);
      if (d.cls === UnitClass.Air) u.baseHex = cap.hex;
    }
  }
  // A few units in combat for the player
  let k = 0;
  for (const u of units.values()) {
    if (u.nation === playerNation && k < 3) {
      u.inCombat = k === 0;
      u.order = k === 1 ? { type: 'move', targetHex: cities[nations[playerNation].capitalCity]?.hex ?? u.hex, targetUnit: -1 } : u.order;
      k++;
    }
  }

  const facilities = new Map<number, Facility>();
  const hexFacilities = new Map<number, number[]>();
  const addFac = (type: FacilityType, hex: number, level: number, construction = 0) => {
    const id = nextId++;
    facilities.set(id, { id, type, hex, level, damage: 0, constructionDaysLeft: construction, x: grid.cx[hex], z: grid.cz[hex], nation: world.hexOwner[hex] - 1, efficiency: 0.9, constructionTotal: construction || facilityDefs[type].buildDays } as Facility);
    const l = hexFacilities.get(hex) ?? [];
    l.push(id);
    hexFacilities.set(hex, l);
    return id;
  };
  for (const c of cities) {
    if (!rng.chance(0.8)) continue;
    const types = [FacilityType.ConsumerFactory, FacilityType.IndustrialPlant, FacilityType.PowerPlant, FacilityType.Farm, FacilityType.MilitaryFactory, FacilityType.ResearchLab, FacilityType.Airbase, FacilityType.Barracks];
    const nf = rng.int(1, 3);
    for (let i = 0; i < nf; i++) addFac(rng.pick(types), c.hex, rng.int(1, 4));
    if (c.port) addFac(FacilityType.NavalBase, c.hex, rng.int(1, 3));
  }
  const pCap = cities[nations[playerNation]?.capitalCity];
  if (pCap) addFac(FacilityType.SupplyDepot, pCap.hex, 1, 12);

  const treaties: GameState['treaties'] = [];
  for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) {
    const shared = nations[a].blocs.filter((x) => nations[b].blocs.includes(x));
    const r = relations[a * N + b];
    if (r > 10) treaties.push({ type: 'embassy', a, b, sinceHour: 0, expiresHour: -1 });
    if (r > 30) treaties.push({ type: 'trade', a, b, sinceHour: 0, expiresHour: -1 });
    if (shared.some((s) => world.blocs[s]?.military)) {
      treaties.push({ type: 'alliance', a, b, sinceHour: 0, expiresHour: -1 });
      treaties.push({ type: 'militaryAccess', a, b, sinceHour: 0, expiresHour: -1 });
      treaties.push({ type: 'mapSharing', a, b, sinceHour: 0, expiresHour: -1 });
    } else if (r > 45) treaties.push({ type: 'nonAggression', a, b, sinceHour: 0, expiresHour: -1 });
  }

  const wars: War[] = [];
  const codeId = (c: string) => nations.findIndex((n) => n.code === c);
  const addWar = (a: string, b: string, name: string, score: number) => {
    const x = codeId(a), y = codeId(b);
    if (x < 0 || y < 0) return;
    wars.push({ id: nextId++, name, attackers: [x], defenders: [y], startHour: -24 * 90, score, casualties: { [x]: 21000, [y]: 34000 } });
  };
  addWar('RUS', 'UKR', 'Russo-Ukrainian War', 12);
  addWar('ETH', 'SOM', 'Horn of Africa Conflict', -8);

  const price = new Float64Array([0.35, 1.8, 0.4, 0.08, 0.12, 0.9, 45, 0.06, 1.2, 1.6, 2.4]);
  const market = { price, basePrice: new Float64Array(price), supply: new Float64Array(RESOURCE_COUNT).map(() => rng.range(5000, 60000)), demand: new Float64Array(RESOURCE_COUNT).map(() => rng.range(5000, 60000)) };

  const news: NewsItem[] = [];
  const addNews = (category: NewsItem['category'], text: string, nats: number[], importance: 1 | 2 | 3, hex = -1): NewsItem => {
    const item: NewsItem = { id: nextId++, hour: state.hour, category, text, nations: nats, importance, hex };
    news.push(item);
    if (news.length > 400) news.shift();
    emit({ type: 'news', item });
    return item;
  };

  const state: GameState = {
    world, grid, hour: 0, speed: 0, playerNation, nations, cities, units, facilities, designs, techs, facilityDefs,
    hexOwner: new Uint16Array(world.hexOwner), hexCore: new Uint16Array(world.hexOwner), hexControlChangedHour: new Float32Array(grid.count),
    ownerVersion: 1, ownerDirty: [], facilityVersion: 1, hexFacilities, relations, treaties, wars, proposals: [], market, news, nextId, gameOver: null,
    seed: 99, supply: new Uint8Array(grid.count),
    stats: { hexesCaptured: 0, citiesCaptured: 0, unitsDestroyed: 0, unitsBuilt: 0, facilitiesBuilt: 0, warsDeclared: 0, peaceTreaties: 0, treatiesSigned: 0 },
  } as GameState;
  // occupied hexes near the war front so the tooltip shows core owner
  const rus = codeId('RUS'), ukr = codeId('UKR');
  if (rus >= 0 && ukr >= 0) {
    let n = 0;
    for (let i = 0; i < grid.count && n < 60; i++) {
      if (state.hexOwner[i] === ukr + 1) {
        let border = false;
        for (let d = 0; d < 6; d++) { const nb = grid.neighbours[i * 6 + d]; if (nb >= 0 && state.hexOwner[nb] === rus + 1) border = true; }
        if (border) { state.hexOwner[i] = rus + 1; n++; }
      }
    }
  }
  const pn = nations[playerNation];
  addNews('politics', `${pn?.leaderTitle ?? 'Leader'} ${pn?.leaderName ?? ''} addresses the nation on New Year's Day, promising security and prosperity.`, [playerNation], 1);
  addNews('war', 'Fighting continues along the eastern front of the Russo-Ukrainian War.', [rus, ukr].filter((x) => x >= 0), 2, cities[nations[ukr]?.capitalCity]?.hex ?? -1);
  addNews('economy', 'World oil prices climb 4% on supply concerns.', [], 1);
  addNews('diplomacy', 'NATO foreign ministers meet in Brussels to discuss eastern flank readiness.', [], 1);
  addNews('research', 'Scientists announce breakthrough in solid-state battery density.', [], 1);
  addNews('military', 'Naval exercises begin in the South China Sea.', [], 2);

  const n2 = (a: number, b: number) => a * N + b;
  const hasTreaty = (a: number, b: number, t: TreatyType) => treaties.some((x) => x.type === t && ((x.a === a && x.b === b) || (x.a === b && x.b === a)));
  const atWar = (a: number, b: number) => wars.some((w) => (w.attackers.includes(a) && w.defenders.includes(b)) || (w.attackers.includes(b) && w.defenders.includes(a)));
  const ok: CommandResult = { ok: true };
  const fail = (reason: string): CommandResult => ({ ok: false, reason });
  let acc = 0;

  const proposalTo = (from: number, kind: Proposal['kind'], message: string) => {
    const p: Proposal = { id: nextId++, from, to: playerNation, kind, data: 0, createdHour: state.hour, expiresHour: state.hour + 24 * 7, message };
    state.proposals.push(p);
    emit({ type: 'proposal', proposal: p });
  };

  const tickHour = () => {
    state.hour++;
    // unit movement
    for (const u of units.values()) {
      if (!u.path.length) {
        if (u.order.type === 'move' || u.order.type === 'rebase') u.order = { type: 'idle', targetHex: -1, targetUnit: -1 };
        continue;
      }
      const d = designs.get(u.design);
      const spd = d ? Math.min(1, d.speedKmh / 60) : 0.2;
      u.moveProgress += spd;
      const next = u.path[0];
      const fx = grid.cx[u.hex], fz = grid.cz[u.hex], tx = grid.cx[next], tz = grid.cz[next];
      u.heading = Math.atan2(tz - fz, tx - fx);
      const t = Math.min(1, u.moveProgress);
      u.x = fx + (tx - fx) * t;
      u.z = fz + (tz - fz) * t;
      if (u.moveProgress >= 1) {
        u.hex = next;
        u.path.shift();
        u.moveProgress = 0;
        u.fuel = Math.max(0, u.fuel - 0.5);
      }
    }
    if (state.hour % 24 === 0) tickDay();
    if (state.hour === 30 && playerNation >= 0) {
      const friend = nations.findIndex((n, i) => i !== playerNation && relations[n2(playerNation, i)] > 20 && !hasTreaty(playerNation, i, 'researchSharing'));
      if (friend >= 0) proposalTo(friend, 'researchSharing', `The government of ${nations[friend].name} proposes a Research Sharing agreement to pool our scientific efforts.`);
    }
    if (state.hour === 80) {
      const x = nations.findIndex((n, i) => i !== playerNation && n.gdp > 200 && relations[n2(playerNation, i)] < 0);
      if (x >= 0) {
        const item = addNews('war', `${nations[x].name} mobilises troops near the border — tensions reach a boiling point.`, [x, playerNation], 3, cities[nations[x].capitalCity]?.hex ?? -1);
        void item;
      }
    }
  };

  const tickDay = () => {
    const day = state.hour / 24;
    for (const n of nations) {
      const g = n.gdpGrowth / 365;
      n.gdp *= 1 + g;
      computeFinance(n);
      const inc = Object.values(n.income).reduce((a, b) => a + b, 0);
      const exp = Object.values(n.expenses).reduce((a, b) => a + b, 0);
      n.treasury += inc - exp;
      n.approval = Math.max(5, Math.min(95, n.approval + rng.range(-0.4, 0.4) - (n.taxes.income - 0.22) * 2));
      for (let r = 0; r < RESOURCE_COUNT; r++) {
        n.production[r] *= 1 + rng.range(-0.01, 0.012);
        n.consumption[r] *= 1 + rng.range(-0.01, 0.012);
        n.stock[r] = Math.max(0, n.stock[r] + n.production[r] - n.consumption[r] + n.traded[r]);
      }
      if (day % 3 === 0) n.history.push({ day, gdp: n.gdp, treasury: n.treasury, approval: n.approval, military: world.nations[n.id].activeMilitary });
      if (n.history.length > 120) n.history.shift();
      // research
      for (const s of n.researching) s.progress += n.researchPoints / Math.max(1, n.researching.length);
      for (const s of [...n.researching]) {
        const t = techs.get(s.techId);
        if (t && s.progress >= t.cost) {
          n.knownTechs.add(t.id);
          n.researching.splice(n.researching.indexOf(s), 1);
          if (n.id === playerNation) addNews('research', `Our scientists have completed research on ${t.name}.`, [n.id], 2);
        }
      }
      // production
      for (const item of [...n.productionQueue]) {
        item.daysLeft -= 1;
        if (item.daysLeft <= 0) {
          const d = designs.get(item.design);
          const c = cities[item.cityId];
          if (d && c) {
            const u = mkUnit(n.id, d, c.hex, units.size + 1);
            emit({ type: 'unitCreated', unit: u.id, nation: n.id });
            if (n.id === playerNation) addNews('military', `A new ${d.name} has been commissioned at ${c.name}.`, [n.id], 1, c.hex);
          }
          item.count--;
          if (item.count <= 0) n.productionQueue.splice(n.productionQueue.indexOf(item), 1);
          else item.daysLeft = item.totalDays;
        }
      }
    }
    for (const f of facilities.values()) {
      if (f.constructionDaysLeft > 0) {
        f.constructionDaysLeft--;
        if (f.constructionDaysLeft === 0) {
          state.facilityVersion++;
          emit({ type: 'facilityBuilt', facility: f.id });
          const owner = state.hexOwner[f.hex] - 1;
          if (owner === playerNation) addNews('economy', `Construction of a ${facilityDefs[f.type].name} has been completed.`, [owner], 1, f.hex);
        }
      }
    }
    for (let r = 0; r < RESOURCE_COUNT; r++) market.price[r] *= 1 + rng.range(-0.02, 0.02);
    for (const w of wars) w.score = Math.max(-100, Math.min(100, w.score + rng.range(-2, 2.2)));
    if (rng.chance(0.5)) {
      const a = rng.int(0, N - 1);
      const texts = [
        `${nations[a].name} reports quarterly GDP growth of ${(nations[a].gdpGrowth * 100).toFixed(1)}%.`,
        `Protests erupt in ${nations[a].name} over rising fuel prices.`,
        `${nations[a].name} signs new arms procurement contract.`,
        `Election campaign heats up in ${nations[a].name}.`,
      ];
      const cats: NewsItem['category'][] = ['economy', 'politics', 'military', 'politics'];
      const i = rng.int(0, 3);
      addNews(cats[i], texts[i], [a], 1, cities[nations[a].capitalCity]?.hex ?? -1);
    }
    if (day === 5) proposalTo(nations.findIndex((n, i) => i !== playerNation && n.gdp > 500) ?? 1, 'trade', 'We propose a comprehensive trade agreement lowering tariffs between our nations.');
  };

  const api: GameAPI = {
    state,
    get hourFraction() {
      return acc % 1;
    },
    advance(realSeconds: number) {
      acc += realSeconds * SPEED_HOURS_PER_SECOND[state.speed];
      let n = 0;
      while (acc >= 1 && n < 48) {
        acc -= 1;
        tickHour();
        n++;
      }
      // smooth unit interpolation within an hour
      for (const u of units.values()) {
        if (!u.path.length) continue;
        const d = designs.get(u.design);
        const spd = d ? Math.min(1, d.speedKmh / 60) : 0.2;
        const t = Math.min(1, u.moveProgress + spd * (acc % 1));
        const next = u.path[0];
        u.x = grid.cx[u.hex] + (grid.cx[next] - grid.cx[u.hex]) * t;
        u.z = grid.cz[u.hex] + (grid.cz[next] - grid.cz[u.hex]) * t;
      }
    },
    stepHours(n: number) {
      for (let i = 0; i < n; i++) tickHour();
    },
    setSpeed(s: number) {
      state.speed = Math.max(0, Math.min(5, Math.round(s)));
    },
    on(l) {
      listeners.push(l);
      return () => {
        const i = listeners.indexOf(l);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    unitsAt(hex) {
      const out: Unit[] = [];
      for (const u of units.values()) if (u.hex === hex) out.push(u);
      return out;
    },
    atWar,
    relation: (a, b) => relations[n2(a, b)],
    hasTreaty,
    isVisible(nation, hex) {
      if (state.hexOwner[hex] === nation + 1) return true;
      for (const u of units.values()) if (u.nation === nation && grid.distance(u.hex, hex) <= 4) return true;
      return false;
    },
    supplyAt(nation, hex) {
      const cap = cities[nations[nation]?.capitalCity];
      if (!cap) return 0;
      const d = grid.distance(cap.hex, hex);
      return Math.max(0, Math.round(100 - d * 3 - (state.hexOwner[hex] === nation + 1 ? 0 : 25)));
    },
    findPath(ids, target) {
      const u = units.get(ids[0]);
      if (!u || target < 0) return null;
      const path: number[] = [];
      let cur = u.hex;
      let guard = 0;
      while (cur !== target && guard++ < 400) {
        let best = -1, bd = Infinity;
        for (let d = 0; d < 6; d++) {
          const nb = grid.neighbours[cur * 6 + d];
          if (nb < 0) continue;
          const dist = grid.worldDist(nb, target);
          if (dist < bd) { bd = dist; best = nb; }
        }
        if (best < 0) break;
        path.push(best);
        cur = best;
      }
      return path;
    },
    militaryPower(nation) {
      let p = 0;
      for (const u of units.values()) if (u.nation === nation) {
        const d = designs.get(u.design);
        if (d) p += (d.attackSoft + d.attackHard + d.defenseGround) * (u.strength / 100);
      }
      return p + world.nations[nation].activeMilitary * 0.8;
    },
    availableDesigns(nation) {
      const n = nations[nation];
      return designList.filter((d) => !d.requiresTech || n.knownTechs.has(d.requiresTech)).map((d) => d.id);
    },
    availableTechs(nation) {
      const n = nations[nation];
      return [...techs.values()].filter((t) => !n.knownTechs.has(t.id) && t.prereqs.every((p) => n.knownTechs.has(p))).map((t) => t.id);
    },
    canBuildFacility(nation, type, hex) {
      if (hex < 0) return fail('Off map');
      if (state.hexOwner[hex] !== nation + 1) return fail('You can only build in your own territory');
      const t = world.hexTerrain[hex];
      const water = isWaterTerrain(t);
      if (type === FacilityType.OffshorePlatform) return water && world.hexDeposit[hex] ? ok : fail('Requires an offshore oil & gas deposit');
      if (water) return fail('Cannot build on water');
      if (type === FacilityType.NavalBase && !world.hexCoast[hex]) return fail('Naval bases must be built on the coast');
      if ((type === FacilityType.OilWell || type === FacilityType.CoalMine || type === FacilityType.OreMine || type === FacilityType.UraniumMine) && !world.hexDeposit[hex]) return fail('Requires a mineral deposit');
      if ((hexFacilities.get(hex)?.length ?? 0) >= 3) return fail('Hex already has 3 facilities');
      if (nations[nation].treasury < facilityDefs[type].cost / 1000) return fail('Insufficient funds');
      return ok;
    },
    canBuildUnitAt(nation, designId, cityId) {
      const c = cities[cityId];
      const d = designs.get(designId);
      if (!c || !d) return fail('Invalid');
      if (state.hexOwner[c.hex] !== nation + 1) return fail('Not your city');
      if (d.cls === UnitClass.Naval && !c.port) return fail('Naval units require a port city');
      return ok;
    },
    moveUnits(ids, target) {
      for (const id of ids) {
        const u = units.get(id);
        if (!u) continue;
        const p = api.findPath([id], target);
        if (!p) return fail('No path');
        u.path = p;
        u.moveProgress = 0;
        u.order = { type: 'move', targetHex: target, targetUnit: -1 };
      }
      return ok;
    },
    attack(ids, target) {
      const r = api.moveUnits(ids, target);
      for (const id of ids) { const u = units.get(id); if (u) u.order = { type: 'attack', targetHex: target, targetUnit: -1 }; }
      return r;
    },
    holdPosition(ids) {
      for (const id of ids) { const u = units.get(id); if (u) { u.path = []; u.order = { type: 'hold', targetHex: -1, targetUnit: -1 }; } }
      return ok;
    },
    setStance(ids, stance: Stance) {
      for (const id of ids) { const u = units.get(id); if (u) u.stance = stance; }
      return ok;
    },
    retreat(ids) {
      for (const id of ids) {
        const u = units.get(id);
        const cap = cities[nations[u?.nation ?? 0].capitalCity];
        if (u && cap) { api.moveUnits([id], cap.hex); u.order = { type: 'retreat', targetHex: cap.hex, targetUnit: -1 }; }
      }
      return ok;
    },
    airMission(ids, mission, target) {
      for (const id of ids) {
        const u = units.get(id);
        if (!u) continue;
        if (designs.get(u.design)?.cls !== UnitClass.Air) return fail('Only air units can fly missions');
        u.order = { type: mission, targetHex: target, targetUnit: -1 };
        u.airborne = true;
      }
      return ok;
    },
    rebase(ids, base) {
      for (const id of ids) { const u = units.get(id); if (u) { u.baseHex = base; u.order = { type: 'rebase', targetHex: base, targetUnit: -1 }; u.path = api.findPath([id], base) ?? []; } }
      return ok;
    },
    reinforce(ids) {
      for (const id of ids) { const u = units.get(id); if (u) u.order = { type: 'reinforce', targetHex: -1, targetUnit: -1 }; }
      return ok;
    },
    disband(ids) {
      for (const id of ids) units.delete(id);
      return ok;
    },
    queueUnit(nation, designId, cityId, count) {
      const d = designs.get(designId);
      if (!d) return fail('Unknown design');
      const c = api.canBuildUnitAt(nation, designId, cityId);
      if (!c.ok) return c;
      const n = nations[nation];
      const cost = (d.cost * count) / 1000;
      if (n.treasury < cost) return fail('Insufficient funds');
      n.treasury -= cost;
      n.productionQueue.push({ id: nextId++, design: designId, cityId, daysLeft: d.buildDays, totalDays: d.buildDays, count });
      return ok;
    },
    cancelProduction(nation, itemId) {
      const q = nations[nation].productionQueue;
      const i = q.findIndex((x) => x.id === itemId);
      if (i < 0) return fail('Not found');
      q.splice(i, 1);
      return ok;
    },
    buildFacility(nation, type, hex) {
      const c = api.canBuildFacility(nation, type, hex);
      if (!c.ok) return c;
      nations[nation].treasury -= facilityDefs[type].cost / 1000;
      addFac(type, hex, 1, facilityDefs[type].buildDays);
      state.facilityVersion++;
      return ok;
    },
    upgradeFacility(nation, fid) {
      const f = facilities.get(fid);
      if (!f) return fail('Not found');
      if (f.level >= facilityDefs[f.type].maxLevel) return fail('Already at maximum level');
      nations[nation].treasury -= (facilityDefs[f.type].cost * 0.6) / 1000;
      f.level++;
      f.constructionDaysLeft = Math.round(facilityDefs[f.type].buildDays / 2);
      return ok;
    },
    setTaxes(nation, t: Partial<Taxes>) { Object.assign(nations[nation].taxes, t); computeFinance(nations[nation]); return ok; },
    setSpending(nation, s: Partial<Spending>) { Object.assign(nations[nation].spending, s); computeFinance(nations[nation]); return ok; },
    setMilitaryBudget(nation, f) { nations[nation].militaryBudget = f; computeFinance(nations[nation]); return ok; },
    setResearchBudget(nation, f) { nations[nation].researchBudget = f; nations[nation].researchPoints = nations[nation].gdp * f; computeFinance(nations[nation]); return ok; },
    setTradePolicy(nation, r, p) { nations[nation].tradePolicy[r] = p; return ok; },
    marketTrade(nation, r, amount) {
      const n = nations[nation];
      const cost = (amount * market.price[r]) / 1000;
      if (amount > 0 && n.treasury < cost) return fail('Insufficient funds');
      if (amount < 0 && n.stock[r] < -amount) return fail('Not enough in stock');
      n.treasury -= cost;
      n.stock[r] += amount;
      n.traded[r] += amount;
      return ok;
    },
    issueBonds(nation, b) { nations[nation].debt += b; nations[nation].treasury += b; nations[nation].creditRating -= b * 0.05; return ok; },
    repayDebt(nation, b) {
      const n = nations[nation];
      if (n.treasury < b) return fail('Insufficient funds');
      n.debt = Math.max(0, n.debt - b); n.treasury -= b; return ok;
    },
    startResearch(nation, id) {
      const n = nations[nation];
      if (n.researching.length >= 3) return fail('All research slots are busy');
      if (n.researching.some((s) => s.techId === id)) return fail('Already researching');
      n.researching.push({ techId: id, progress: 0 });
      return ok;
    },
    cancelResearch(nation, id) {
      const n = nations[nation];
      n.researching = n.researching.filter((s) => s.techId !== id);
      return ok;
    },
    proposeTreaty(from, to, type) {
      if (hasTreaty(from, to, type)) return fail('Treaty already in force');
      if (relations[n2(to, from)] < 0) return fail(`${nations[to].name} rejected the proposal`);
      treaties.push({ type, a: from, b: to, sinceHour: state.hour, expiresHour: -1 });
      addNews('diplomacy', `${nations[from].name} and ${nations[to].name} sign a ${type} agreement.`, [from, to], 1);
      return ok;
    },
    cancelTreaty(from, to, type) {
      const i = treaties.findIndex((x) => x.type === type && ((x.a === from && x.b === to) || (x.a === to && x.b === from)));
      if (i >= 0) treaties.splice(i, 1);
      return ok;
    },
    declareWar(from, to) {
      if (atWar(from, to)) return fail('Already at war');
      const w: War = { id: nextId++, name: `${nations[from].adjective}-${nations[to].adjective} War`, attackers: [from], defenders: [to], startHour: state.hour, score: 0, casualties: {} };
      wars.push(w);
      relations[n2(from, to)] = relations[n2(to, from)] = -100;
      for (let i = treaties.length - 1; i >= 0; i--) { const t = treaties[i]; if ((t.a === from && t.b === to) || (t.a === to && t.b === from)) treaties.splice(i, 1); }
      emit({ type: 'warDeclared', war: w.id, attacker: from, defender: to });
      addNews('war', `${nations[from].name} has declared war on ${nations[to].name}!`, [from, to], 3, cities[nations[to].capitalCity]?.hex ?? -1);
      nations[from].defcon = Math.min(nations[from].defcon, 2);
      return ok;
    },
    offerPeace(from, to) {
      const i = wars.findIndex((w) => (w.attackers.includes(from) && w.defenders.includes(to)) || (w.attackers.includes(to) && w.defenders.includes(from)));
      if (i < 0) return fail('Not at war');
      if (rng.chance(0.5)) return fail(`${nations[to].name} refused the peace offer`);
      const w = wars.splice(i, 1)[0];
      emit({ type: 'peace', war: w.id });
      addNews('diplomacy', `${nations[from].name} and ${nations[to].name} sign a peace treaty.`, [from, to], 2);
      return ok;
    },
    sendAid(from, to, b) {
      if (nations[from].treasury < b) return fail('Insufficient funds');
      nations[from].treasury -= b; nations[to].treasury += b;
      relations[n2(to, from)] = Math.min(100, relations[n2(to, from)] + b * 2);
      relations[n2(from, to)] = relations[n2(to, from)];
      return ok;
    },
    improveRelations(from, to) {
      relations[n2(to, from)] = Math.min(100, relations[n2(to, from)] + 5);
      relations[n2(from, to)] = relations[n2(to, from)];
      nations[from].treasury -= 0.2;
      return ok;
    },
    respondProposal(pid, accept) {
      const i = state.proposals.findIndex((p) => p.id === pid);
      if (i < 0) return fail('Proposal expired');
      const p = state.proposals.splice(i, 1)[0];
      if (accept && p.kind !== 'peace' && p.kind !== 'aid' && p.kind !== 'joinWar') treaties.push({ type: p.kind, a: p.from, b: p.to, sinceHour: state.hour, expiresHour: -1 });
      return ok;
    },
    setDefcon(nation, level) { nations[nation].defcon = Math.max(1, Math.min(5, level)); return ok; },
    setAutonomy(nation, dept: Department, ai) { nations[nation].autonomy[dept] = ai; return ok; },
  };
  return api;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
