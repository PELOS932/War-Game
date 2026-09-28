/**
 * World events & news (daily): general elections in democracies (outcome
 * driven by approval), coups in unpopular regimes, protests, economic
 * cycles (global recessions, oil shocks, national booms and busts), natural
 * disasters placed by geography and season (earthquakes near mountain belts,
 * hurricanes/typhoons/cyclones on tropical coasts, river floods, droughts) and
 * terrorist attacks (more likely with weak law & order or at war).
 */
import { Government, Terrain, isDemocratic, latitudeAt, longitudeAt } from '../worldgen/types';
import { NameGenerator } from '../worldgen/names';
import { FacilityType, Resource, hourToDate, type City, type Nation, type NationId } from './types';
import type { Sim } from './core';
import { clamp } from './core';

const STORM_NAMES = [
  'Adrian', 'Beatriz', 'Carlos', 'Delia', 'Emilio', 'Fiona', 'Gaston', 'Helena', 'Ivan', 'Julia', 'Kenji', 'Lorena',
  'Marco', 'Nadia', 'Oscar', 'Paloma', 'Rafael', 'Sonia', 'Tomas', 'Ursula', 'Victor', 'Wanda', 'Xavier', 'Yolanda', 'Zeno',
];

type Basin = 'hurricane' | 'typhoon' | 'cyclone';

interface CityGeo { city: City; lat: number; lon: number }

export class WorldEvents {
  private seismic: CityGeo[] = [];
  private stormCoast: (CityGeo & { basin: Basin; south: boolean })[] = [];
  private riverCities: CityGeo[] = [];
  private names = new NameGenerator();
  private stormIdx = 0;

  constructor(private sim: Sim) {
    const st = sim.state;
    const s = st.world.settings;
    const T = sim.terrain;
    for (const c of st.cities) {
      const lat = latitudeAt(c.z, s), lon = longitudeAt(c.x, s);
      const geo = { city: c, lat, lon };
      let rough = 0;
      sim.grid.forRadius(c.hex, 3, (h) => { if (T[h] === Terrain.Mountains) rough += 2; else if (T[h] === Terrain.Hills) rough += 1; });
      if (rough >= 6) this.seismic.push(geo);
      const alat = Math.abs(lat);
      if (c.port && alat >= 7 && alat <= 38) {
        let basin: Basin | null = null;
        if (lat > 0 && lon >= -120 && lon <= -10) basin = 'hurricane';
        else if (lat > 0 && lon >= 100 && lon <= 180) basin = 'typhoon';
        else if (lat > 0 && lon >= 45 && lon < 100) basin = 'cyclone';
        else if (lat < 0 && lon >= 30 && lon <= 180) basin = 'cyclone';
        if (basin) this.stormCoast.push({ ...geo, basin, south: lat < 0 });
      }
      let river = false;
      for (const h of c.urbanHexes.concat([c.hex])) if (st.world.hexRiverEdges[h]) river = true;
      if (river) this.riverCities.push(geo);
    }
  }

  day(): void {
    const sim = this.sim;
    const st = sim.state;
    const day = Math.floor(st.hour / 24);
    const month = hourToDate(st.hour).getUTCMonth();
    for (const n of st.nations) {
      if (!n.alive) continue;
      if (n.nextElectionDay >= 0 && day >= n.nextElectionDay) this.election(n);
      this.stability(n);
      this.terrorism(n);
      if (sim.rng.chance(1 / 3000)) this.nationalCycle(n);
    }
    if (sim.rng.chance(1 / 2600)) this.globalRecession();
    if (sim.rng.chance(1 / 1100)) this.oilShock();
    if (sim.rng.chance(0.011)) this.earthquake();
    this.storms(month);
    if (sim.rng.chance(month >= 5 && month <= 8 ? 0.02 : 0.006)) this.flood(month);
    if (sim.rng.chance(month >= 5 && month <= 8 ? 0.004 : 0.001)) this.drought();
  }

  // ---------------------------------------------------------------- politics
  private election(n: Nation): void {
    const sim = this.sim;
    const days = n.government === Government.PresidentialRepublic || n.government === Government.FederalRepublic ? 1461 : 1461 + Math.floor(sim.rng.next() * 300);
    n.nextElectionDay = Math.floor(sim.state.hour / 24) + days;
    const major = n.isPlayer || n.gdp > 800;
    // Incumbents lose below ~45% approval (with some randomness).
    const loseP = clamp((52 - n.approval) / 18, 0.03, 0.97);
    if (sim.rng.chance(loseP)) {
      const old = n.leaderName;
      this.newGovernment(n, false);
      n.ideology = clamp(n.ideology + (sim.rng.next() - 0.5) * 0.3, -1, 1);
      n.approval = clamp(52 + sim.rng.range(0, 10), 1, 99);
      sim.news('politics', `${n.name} election: the opposition wins. ${n.leaderName} replaces ${old} as ${n.leaderTitle}.`, [n.id], major ? 2 : 1);
    } else {
      n.approval = Math.min(99, n.approval + 4);
      if (major) sim.news('politics', `${n.name} election: ${n.leaderTitle} ${n.leaderName} is re-elected with ${Math.round(45 + (n.approval - 40) * 0.4)}% of the vote.`, [n.id], 1);
    }
  }

  private newGovernment(n: Nation, junta: boolean): void {
    const rng = this.sim.rng;
    const culture = n.culture % 10;
    n.leaderName = (junta ? 'Gen. ' : '') + this.names.person(culture, rng);
    for (const m of n.ministers) {
      if (m.role === 'head') { m.name = n.leaderName; m.competence = clamp(rng.range(0.35, 0.85), 0, 1); m.loyalty = 1; continue; }
      if (rng.chance(0.7)) {
        m.name = this.names.person(culture, rng);
        m.competence = clamp(0.3 + 0.4 * n.development + rng.range(-0.15, 0.25), 0.1, 0.98);
        m.loyalty = rng.range(0.5, 1);
        m.ideology = clamp(n.ideology + rng.range(-0.3, 0.3), -1, 1);
      }
    }
  }

  private stability(n: Nation): void {
    const sim = this.sim;
    const demo = isDemocratic(n.government);
    const pCoup = demo ? (n.approval < 12 ? 0.0012 : 0) : n.approval < 22 ? 0.004 * (22 - n.approval) / 10 : 0;
    if (pCoup > 0 && sim.rng.chance(pCoup)) {
      const old = n.leaderName;
      n.government = Government.MilitaryJunta;
      n.leaderTitle = 'Chairman of the Military Council';
      this.newGovernment(n, true);
      n.nextElectionDay = -1;
      n.approval = 45 + sim.rng.range(0, 10);
      n.ideology = clamp(n.ideology - 0.3, -1, 1);
      n.aggression = clamp(n.aggression + 0.1, 0, 1);
      n.worldOpinion = clamp(n.worldOpinion - 15, 0, 100);
      n.growthShock -= 0.02;
      n.lawOrder = Math.max(10, n.lawOrder - 15);
      for (const o of sim.state.nations) if (o.alive && o.id !== n.id && isDemocratic(o.government)) sim.addRelation(n.id, o.id, -12);
      sim.news('politics', `Military coup in ${n.name}! ${old} has been overthrown; ${n.leaderName} takes power.`, [n.id], n.isPlayer || n.gdp > 300 ? 3 : 2);
      return;
    }
    if (n.approval < 30 && sim.rng.chance(0.01)) {
      n.lawOrder = Math.max(5, n.lawOrder - 4);
      n.growthShock -= 0.003;
      const city = this.bigCity(n);
      sim.news('politics', `Mass protests against the government erupt in ${city?.name ?? n.name}.`, [n.id], n.isPlayer ? 2 : 1, city?.hex ?? -1);
    }
  }

  private bigCity(n: Nation, weighted = false): City | null {
    const sim = this.sim;
    let best: City | null = null, bestScore = -1;
    for (const c of sim.state.cities) {
      if (sim.owner(c.hex) !== n.id) continue;
      const score = weighted ? c.population * sim.rng.next() : c.population;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  private terrorism(n: Nation): void {
    const sim = this.sim;
    const p = 0.00012 * (1 + Math.max(0, 55 - n.lawOrder) / 15) * (sim.warring.has(n.id) ? 2.5 : 1) * Math.min(3, Math.sqrt(n.population / 40)) * (n.approval < 35 ? 1.5 : 1);
    if (!sim.rng.chance(p)) return;
    const city = this.bigCity(n, true);
    if (!city) return;
    const killed = Math.round(3 + Math.pow(sim.rng.next(), 3) * 250);
    n.population = Math.max(0.01, n.population - killed / 1e6);
    const demo = isDemocratic(n.government);
    if (demo && killed > 50) n.rally += 3;
    else n.approval = Math.max(1, n.approval - (1 + killed / 80));
    n.lawOrder = Math.max(0, n.lawOrder - 2);
    city.damage = Math.min(1, city.damage + 0.01);
    sim.news('event', `Terrorist attack in ${city.name}, ${n.name}: ${killed} people killed.`, [n.id], killed > 80 || n.isPlayer ? 2 : 1, city.hex);
  }

  // ---------------------------------------------------------------- economy
  private nationalCycle(n: Nation): void {
    const sim = this.sim;
    const boom = sim.rng.chance(0.5);
    const mag = sim.rng.range(0.008, 0.025);
    n.growthShock += boom ? mag : -mag;
    if (n.isPlayer || n.gdp > 500) {
      sim.news('economy', boom
        ? `Economic boom in ${n.name}: investment and consumer spending surge.`
        : `${n.name} slides into recession as demand falters.`, [n.id], n.isPlayer ? 2 : 1);
    }
  }

  private globalRecession(): void {
    const sim = this.sim;
    const mag = sim.rng.range(0.015, 0.035);
    for (const n of sim.state.nations) if (n.alive) n.growthShock -= mag * (0.6 + 0.8 * n.development);
    for (let r = 0; r < 11; r++) sim.state.market.price[r] *= 0.9;
    sim.news('economy', 'Global financial turmoil: markets crash and economists warn of a worldwide recession.', [], 3);
  }

  private oilShock(): void {
    const sim = this.sim;
    const m = sim.state.market;
    const f = sim.rng.range(1.25, 1.6);
    m.price[Resource.Petroleum] = Math.min(m.basePrice[Resource.Petroleum] * 4, m.price[Resource.Petroleum] * f);
    sim.news('economy', `Oil price shock: crude jumps ${Math.round((f - 1) * 100)}% on supply fears.`, [], 2);
  }

  // ---------------------------------------------------------------- disasters
  private strike(hex: number, radius: number, severity: number, cityDamage: number): number {
    const sim = this.sim;
    const st = sim.state;
    let hits = 0;
    sim.grid.forRadius(hex, radius, (h, d) => {
      for (const f of sim.facilitiesAt(h)) {
        const dmg = severity * (1 - d / (radius + 1)) * sim.rng.range(0.4, 1.2);
        if (dmg < 0.03) continue;
        f.damage = Math.min(1, f.damage + dmg);
        hits++;
        sim.emit({ type: 'facilityDamaged', facility: f.id, x: f.x, z: f.z });
      }
      const cid = sim.cityAt[h];
      if (cid >= 0 && st.cities[cid].hex === h) st.cities[cid].damage = Math.min(1, st.cities[cid].damage + cityDamage * (1 - d / (radius + 1)));
    });
    if (hits) sim.markFacilitiesDirty();
    return hits;
  }

  private casualtiesIn(c: City, rate: number): number {
    const n = this.sim.state.nations[this.sim.owner(c.hex)];
    const deaths = Math.round(c.population * 1000 * rate * (1.6 - (n?.development ?? 0.5)));
    if (n) n.population = Math.max(0.01, n.population - deaths / 1e6);
    return deaths;
  }

  private hitNation(owner: NationId, approval: number, shock: number): void {
    const n = this.sim.state.nations[owner];
    if (!n) return;
    n.approval = Math.max(1, n.approval - approval);
    n.growthShock -= shock;
  }

  private earthquake(): void {
    const sim = this.sim;
    if (!this.seismic.length) return;
    const g = sim.rng.pick(this.seismic);
    const c = g.city;
    const owner = sim.owner(c.hex);
    if (owner < 0) return;
    const mag = 5.6 + Math.pow(sim.rng.next(), 2) * 3;
    const sev = (mag - 5.5) / 3;
    const hits = this.strike(c.hex, mag > 7.5 ? 3 : 2, 0.45 * sev, 0.15 * sev);
    const deaths = this.casualtiesIn(c, 0.00004 * Math.pow(10, (mag - 6) * 0.9));
    const n = sim.state.nations[owner];
    this.hitNation(owner, 1 + 4 * sev, (0.004 * sev * c.population) / Math.max(200, n.population * 10));
    sim.news('event', `Magnitude ${mag.toFixed(1)} earthquake strikes near ${c.name}, ${n.name}: ${deaths.toLocaleString('en-US')} dead${hits ? `, ${hits} facilities damaged` : ''}.`, [owner], mag >= 7 || n.isPlayer ? 2 : 1, c.hex);
  }

  private storms(month: number): void {
    const sim = this.sim;
    const inSeason = (b: { basin: Basin; south: boolean }) => b.south ? (month <= 3 || month === 11) : b.basin === 'cyclone' ? (month >= 3 && month <= 5) || (month >= 9 && month <= 11) : month >= 5 && month <= 10;
    if (!sim.rng.chance(0.028)) return;
    const cands = this.stormCoast.filter(inSeason);
    if (!cands.length) return;
    const g = sim.rng.pick(cands);
    const c = g.city;
    const owner = sim.owner(c.hex);
    if (owner < 0) return;
    const cat = 1 + Math.floor(Math.pow(sim.rng.next(), 1.6) * 5);
    const name = STORM_NAMES[this.stormIdx++ % STORM_NAMES.length];
    const sev = cat / 5;
    const hits = this.strike(c.hex, cat >= 4 ? 3 : 2, 0.3 * sev, 0.08 * sev);
    const deaths = this.casualtiesIn(c, 0.000004 * cat * cat);
    const n = sim.state.nations[owner];
    this.hitNation(owner, 0.5 + 1.5 * sev, 0.002 * sev);
    const kind = g.basin === 'hurricane' ? 'Hurricane' : g.basin === 'typhoon' ? 'Typhoon' : 'Cyclone';
    sim.news('event', `${kind} ${name} (category ${cat}) makes landfall near ${c.name}, ${n.name}: ${deaths.toLocaleString('en-US')} dead${hits ? `, ${hits} facilities damaged` : ''}.`, [owner], cat >= 4 || n.isPlayer ? 2 : 1, c.hex);
  }

  private flood(month: number): void {
    const sim = this.sim;
    let cands = this.riverCities;
    if (month >= 5 && month <= 8) {
      const monsoon = cands.filter((g) => g.lon >= 60 && g.lon <= 130 && g.lat >= 0 && g.lat <= 35);
      if (monsoon.length && sim.rng.chance(0.6)) cands = monsoon;
    }
    if (!cands.length) return;
    const g = sim.rng.pick(cands);
    const c = g.city;
    const owner = sim.owner(c.hex);
    if (owner < 0) return;
    const sev = sim.rng.range(0.2, 1);
    const hits = this.strike(c.hex, 2, 0.2 * sev, 0.05 * sev);
    const deaths = this.casualtiesIn(c, 0.000006 * sev);
    const n = sim.state.nations[owner];
    this.hitNation(owner, 1 + 2 * sev, 0.0015 * sev);
    sim.news('event', `Severe flooding along the river at ${c.name}, ${n.name}: ${deaths.toLocaleString('en-US')} dead, thousands displaced${hits ? `, ${hits} facilities damaged` : ''}.`, [owner], n.isPlayer ? 2 : 1, c.hex);
  }

  private drought(): void {
    const sim = this.sim;
    const st = sim.state;
    const farmers = st.nations.filter((n) => n.alive && n.production[Resource.Agriculture] > 20);
    if (!farmers.length) return;
    const n = sim.rng.weighted(farmers, farmers.map((x) => x.production[Resource.Agriculture]));
    const sev = sim.rng.range(0.1, 0.35);
    let hit = 0;
    for (const f of sim.nationFacilities(n.id)) {
      if (f.type !== FacilityType.Farm || !sim.rng.chance(0.6)) continue;
      f.damage = Math.min(1, f.damage + sev);
      hit++;
    }
    if (hit) sim.markFacilitiesDirty();
    n.approval = Math.max(1, n.approval - 2);
    n.growthShock -= 0.003;
    sim.news('event', `Severe drought in ${n.name} devastates harvests; ${hit} farming regions affected.`, [n.id], n.isPlayer || n.production[Resource.Agriculture] > 300 ? 2 : 1);
  }
}
