/**
 * Dev-only mock of the simulation: fake units of every category moving
 * around, facilities, occasional combat and captures, advancing time. Lets the
 * renderer be exercised without src/sim.
 */
import { HexGrid } from '../../core/hex';
import type { CommandResult, GameAPI } from '../../sim/api';
import {
  CATEGORY_CLASS, CATEGORY_NAMES, City, Facility, FacilityType, GameEvent, GameState, Nation, SPEED_HOURS_PER_SECOND,
  Unit, UnitCategory, UnitClass, UnitDesign,
} from '../../sim/types';
import { Terrain, WorldData } from '../../worldgen/types';

type Listener = (e: GameEvent) => void;

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Motion {
  mode: 'wander' | 'orbit' | 'patrol' | 'static';
  cx: number;
  cz: number;
  r: number;
  ang: number;
  speed: number; // world units per hour
  tx: number;
  tz: number;
  home: number; // nation id for territory checks
}

export class MockGame implements GameAPI {
  readonly state: GameState;
  private listeners: Listener[] = [];
  private acc = 0;
  private rand: () => number;
  private motion = new Map<number, Motion>();
  private grid: HexGrid;
  private world: WorldData;
  private warPairs: [number, number][] = [];
  private fronts: { a: number; b: number; hexes: number[] }[] = [];
  focusNations: number[] = [];

  get hourFraction(): number {
    return this.acc;
  }

  constructor(world: WorldData, opts: { startHour?: number; player?: number; seed?: number; unitsPerNation?: number } = {}) {
    this.world = world;
    this.rand = rng(opts.seed ?? 7);
    const grid = new HexGrid(world.settings.cols, world.settings.rows);
    this.grid = grid;
    const nations = world.nations.map((ns) => ({
      id: ns.id, code: ns.code, name: ns.name, formalName: ns.formalName, adjective: ns.adjective, color: ns.color,
      flag: ns.flag, government: ns.government, leaderTitle: ns.leaderTitle, leaderName: ns.leaderName, culture: ns.culture,
      alive: true, isPlayer: false, capitalCity: -1, population: ns.population, gdp: ns.gdp, blocs: ns.blocs,
      techLevel: ns.techLevel, nuclear: ns.nuclear, development: ns.development, defcon: 5,
    }) as unknown as Nation);
    const cities: City[] = world.cities.map((c) => ({
      id: c.id, name: c.name, hex: c.hex, urbanHexes: c.urbanHexes, population: c.population, capital: c.capital, port: c.port,
      originalNation: c.nation, damage: 0, x: c.x, z: c.z,
    }));
    for (const c of cities) if (c.capital && nations[c.originalNation]) (nations[c.originalNation] as { capitalCity: number }).capitalCity = c.id;
    const designs = new Map<string, UnitDesign>();
    for (let cat = 0; cat <= UnitCategory.Amphibious; cat++) {
      designs.set(`cat${cat}`, {
        id: `cat${cat}`, name: CATEGORY_NAMES[cat as UnitCategory], category: cat as UnitCategory, cls: CATEGORY_CLASS[cat as UnitCategory],
        generation: 3, requiresTech: null, armor: 'hard', mobility: 'tracked', personnel: 600, attackSoft: 50, attackHard: 50, attackAir: 10,
        attackNaval: 10, attackSub: 0, rangeGround: 1, rangeAir: 0, rangeNaval: 0, defenseGround: 50, defenseAir: 20, defenseNaval: 10,
        speedKmh: 40, spotting: 2, stealth: 0, rangeKm: 0, fuelCapacity: 100, cost: 100, militaryGoodsCost: 10, buildDays: 30, upkeep: 0.1,
        indirect: false, canCapture: true, description: '',
      });
    }
    const n = world.nations.length;
    const relations = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) relations[i] = world.relations[i] ?? 0;
    this.state = {
      world, grid, hour: opts.startHour ?? 0, speed: 1, playerNation: opts.player ?? 0, nations, cities,
      units: new Map(), facilities: new Map(), designs, techs: new Map(), facilityDefs: [],
      hexOwner: new Uint16Array(world.hexOwner), hexCore: new Uint16Array(world.hexOwner),
      hexControlChangedHour: new Float32Array(grid.count), ownerVersion: 0, ownerDirty: [], facilityVersion: 0,
      hexFacilities: new Map(), relations, treaties: [], wars: [], proposals: [], market: {} as GameState['market'], news: [],
      nextId: 1, gameOver: null,
    } as unknown as GameState;
    if (this.state.playerNation >= 0 && nations[this.state.playerNation]) (nations[this.state.playerNation] as { isPlayer: boolean }).isPlayer = true;
    this.populate(opts.unitsPerNation ?? 1);
  }

  // --------------------------------------------------------------------------
  private isLand(h: number): boolean {
    return h >= 0 && this.world.hexTerrain[h] > Terrain.Lake;
  }

  private isSea(h: number): boolean {
    return h >= 0 && (this.world.hexTerrain[h] === Terrain.DeepOcean || this.world.hexTerrain[h] === Terrain.Coastal);
  }

  private findNear(h: number, pred: (i: number) => boolean, maxR = 12): number {
    for (let r = 0; r <= maxR; r++) {
      const cands: number[] = [];
      this.grid.forRadius(h, r, (i, d) => { if (d === r && pred(i)) cands.push(i); });
      if (cands.length) return cands[Math.floor(this.rand() * cands.length)];
    }
    return -1;
  }

  private addUnit(nation: number, cat: UnitCategory, hex: number, motion: Motion, name?: string): Unit {
    const id = this.state.nextId++;
    const g = this.grid;
    const cls = CATEGORY_CLASS[cat];
    const u = {
      id, design: `cat${cat}`, nation, name: name ?? `${id}th ${CATEGORY_NAMES[cat]}`, hex,
      x: g.cx[hex] + (this.rand() - 0.5) * 0.6, z: g.cz[hex] + (this.rand() - 0.5) * 0.6,
      heading: this.rand() * Math.PI * 2, strength: 40 + this.rand() * 60, efficiency: 80, experience: 30, supply: 80, fuel: 90,
      entrenchment: 0, stance: 'aggressive', order: { type: 'idle', targetHex: -1, targetUnit: -1 }, path: [], moveProgress: 0,
      inCombat: false, embarked: false, airborne: cls === UnitClass.Air && this.rand() < 0.8, baseHex: cls === UnitClass.Air ? hex : -1,
      missionHours: 0, kills: 0, createdHour: 0, groupId: -1, carrier: -1, hidden: false, lastCombatHour: -1, airState: 'ready', airTimer: 0, blockedHours: 0,
    } as unknown as Unit;
    this.state.units.set(id, u);
    this.motion.set(id, motion);
    return u;
  }

  private addFacility(type: FacilityType, hex: number, nation: number): void {
    const id = this.state.nextId++;
    const g = this.grid;
    const f = {
      id, type, hex, level: 1 + Math.floor(this.rand() * 3), damage: this.rand() < 0.15 ? 0.5 : 0, constructionDaysLeft: 0,
      x: g.cx[hex] + (this.rand() - 0.5) * 0.8, z: g.cz[hex] + (this.rand() - 0.5) * 0.8, nation, efficiency: 1, constructionTotal: 0,
    } as unknown as Facility;
    this.state.facilities.set(id, f);
    const list = this.state.hexFacilities.get(hex) ?? [];
    list.push(id);
    this.state.hexFacilities.set(hex, list);
  }

  private populate(scale: number): void {
    const w = this.world;
    // Nations by size; the biggest ones get armies.
    const order = [...w.nations].sort((a, b) => b.hexCount - a.hexCount).map((n) => n.id);
    this.focusNations = order.slice(0, Math.min(order.length, 14));
    const landCats = [UnitCategory.Infantry, UnitCategory.Mechanized, UnitCategory.Armor, UnitCategory.Artillery, UnitCategory.RocketArtillery,
      UnitCategory.AirDefense, UnitCategory.Recon, UnitCategory.SpecialForces, UnitCategory.Engineers, UnitCategory.MissileLauncher];
    const airCats = [UnitCategory.Fighter, UnitCategory.Multirole, UnitCategory.Strike, UnitCategory.Bomber, UnitCategory.Helicopter, UnitCategory.AirTransport, UnitCategory.Drone];
    const navalCats = [UnitCategory.PatrolBoat, UnitCategory.Frigate, UnitCategory.Destroyer, UnitCategory.Cruiser, UnitCategory.Carrier, UnitCategory.Submarine, UnitCategory.Amphibious];
    for (const nid of this.focusNations) {
      const cap = w.cities.find((c) => c.nation === nid && c.capital) ?? w.cities.find((c) => c.nation === nid);
      if (!cap) continue;
      for (let rep = 0; rep < scale; rep++) {
        for (const cat of landCats) {
          const h = this.findNear(cap.hex, (i) => this.isLand(i) && this.state.hexOwner[i] === nid + 1 && this.rand() < 0.3, 8);
          if (h < 0) continue;
          this.addUnit(nid, cat, h, { mode: 'wander', cx: 0, cz: 0, r: 0, ang: 0, speed: 0.25 + this.rand() * 0.2, tx: this.grid.cx[h], tz: this.grid.cz[h], home: nid });
        }
        for (const cat of airCats) {
          const h = this.findNear(cap.hex, (i) => this.isLand(i) && this.state.hexOwner[i] === nid + 1, 4);
          if (h < 0) continue;
          const r = 2 + this.rand() * 4;
          this.addUnit(nid, cat, h, { mode: 'orbit', cx: this.grid.cx[h], cz: this.grid.cz[h], r, ang: this.rand() * 6.28, speed: cat === UnitCategory.Helicopter ? 1.5 : 4 + this.rand() * 3, tx: 0, tz: 0, home: nid });
        }
        const seaHex = this.findNear(cap.hex, (i) => this.isSea(i) && this.world.hexTerrain[i] === Terrain.DeepOcean, 14);
        if (seaHex >= 0) {
          for (const cat of navalCats) {
            const h = this.findNear(seaHex, (i) => this.isSea(i), 3);
            if (h < 0) continue;
            this.addUnit(nid, cat, h, { mode: 'patrol', cx: this.grid.cx[h], cz: this.grid.cz[h], r: 0.8 + this.rand() * 1.2, ang: this.rand() * 6.28, speed: 0.6, tx: 0, tz: 0, home: nid });
          }
        }
        // An embarked land unit (transport ship).
        if (seaHex >= 0) {
          const u = this.addUnit(nid, UnitCategory.Infantry, seaHex, { mode: 'patrol', cx: this.grid.cx[seaHex], cz: this.grid.cz[seaHex], r: 1.4, ang: 0, speed: 0.5, tx: 0, tz: 0, home: nid });
          u.embarked = true;
        }
      }
      // Facilities around the nation's cities.
      const types = [FacilityType.Farm, FacilityType.OilWell, FacilityType.CoalMine, FacilityType.OreMine, FacilityType.PowerPlant, FacilityType.NuclearPlant,
        FacilityType.HydroDam, FacilityType.RenewablePlant, FacilityType.ConsumerFactory, FacilityType.IndustrialPlant, FacilityType.MilitaryFactory,
        FacilityType.ResearchLab, FacilityType.Barracks, FacilityType.Airbase, FacilityType.MissileSilo, FacilityType.SupplyDepot, FacilityType.RadarStation,
        FacilityType.LumberMill, FacilityType.Plantation, FacilityType.UraniumMine];
      const ncities = w.cities.filter((c) => c.nation === nid).slice(0, 6);
      let k = 0;
      for (const c of ncities) {
        for (let j = 0; j < 4; j++) {
          const t = types[k++ % types.length];
          const h = this.findNear(c.hex, (i) => this.isLand(i) && this.state.hexOwner[i] === nid + 1 && this.world.hexCity[i] < 0, 4);
          if (h >= 0) this.addFacility(t, h, nid);
        }
        if (c.port) {
          const sh = this.findNear(c.hex, (i) => this.isSea(i), 2);
          if (sh >= 0) {
            // Naval base on the coastal land hex, offshore platform further out.
            this.addFacility(FacilityType.NavalBase, c.hex, nid);
            const oh = this.findNear(sh, (i) => this.world.hexTerrain[i] === Terrain.Coastal, 3);
            if (oh >= 0) this.addFacility(FacilityType.OffshorePlatform, oh, nid);
          }
        }
      }
    }
    // Wars between neighbouring focus nations → fronts.
    const g = this.grid;
    const own = this.state.hexOwner;
    const seen = new Set<string>();
    for (let i = 0; i < g.count && this.fronts.length < 3; i++) {
      const a = own[i] - 1;
      if (a < 0 || !this.focusNations.includes(a) || !this.isLand(i)) continue;
      for (let d = 0; d < 6; d++) {
        const m = g.neighbours[i * 6 + d];
        if (m < 0) continue;
        const b = own[m] - 1;
        if (b < 0 || b === a || !this.isLand(m)) continue;
        const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const hexes: number[] = [];
        for (let j = 0; j < g.count; j++) {
          if (own[j] !== a + 1 || !this.isLand(j)) continue;
          for (let e = 0; e < 6; e++) { const q = g.neighbours[j * 6 + e]; if (q >= 0 && own[q] === b + 1) { hexes.push(j); break; } }
        }
        if (hexes.length > 3) {
          this.fronts.push({ a, b, hexes });
          this.warPairs.push([a, b]);
          (this.state.wars as unknown[]).push({ id: this.fronts.length, name: 'War', attackers: [a], defenders: [b], startHour: 0, score: 0, casualties: {} });
          // Station units along the front.
          for (let k2 = 0; k2 < Math.min(10, hexes.length); k2++) {
            const h = hexes[Math.floor(this.rand() * hexes.length)];
            const cats = [UnitCategory.Armor, UnitCategory.Infantry, UnitCategory.Mechanized, UnitCategory.Artillery];
            this.addUnit(a, cats[k2 % 4], h, { mode: 'static', cx: 0, cz: 0, r: 0, ang: 0, speed: 0, tx: 0, tz: 0, home: a });
            const oh = this.findNear(h, (q) => own[q] === b + 1 && this.isLand(q), 2);
            if (oh >= 0) this.addUnit(b, cats[(k2 + 1) % 4], oh, { mode: 'static', cx: 0, cz: 0, r: 0, ang: 0, speed: 0, tx: 0, tz: 0, home: b });
          }
        }
        break;
      }
    }
  }

  // --------------------------------------------------------------------------
  private emit(e: GameEvent): void {
    for (const l of this.listeners) l(e);
  }

  private tick(): void {
    const s = this.state;
    s.hour++;
    const g = this.grid;
    for (const u of s.units.values()) {
      const m = this.motion.get(u.id);
      if (!m) continue;
      const ox = u.x, oz = u.z;
      if (m.mode === 'orbit' || m.mode === 'patrol') {
        if (m.mode === 'orbit' && !u.airborne) continue;
        m.ang += m.speed / Math.max(0.3, m.r);
        u.x = m.cx + Math.cos(m.ang) * m.r;
        u.z = m.cz + Math.sin(m.ang) * m.r;
      } else if (m.mode === 'wander') {
        const dx = m.tx - u.x, dz = m.tz - u.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.05) {
          const tgt = this.findNear(u.hex, (i) => this.isLand(i) && s.hexOwner[i] === m.home + 1 && this.rand() < 0.15, 5);
          if (tgt >= 0) { m.tx = g.cx[tgt] + (this.rand() - 0.5) * 0.5; m.tz = g.cz[tgt] + (this.rand() - 0.5) * 0.5; }
          u.path = tgt >= 0 ? [tgt] : [];
        } else {
          const st = Math.min(d, m.speed);
          u.x += (dx / d) * st;
          u.z += (dz / d) * st;
        }
      }
      if (u.x !== ox || u.z !== oz) u.heading = Math.atan2(u.z - oz, u.x - ox);
      const h = g.fromWorld(u.x, u.z);
      if (h >= 0) u.hex = h;
      u.inCombat = false;
    }
    // Combat along fronts.
    for (const f of this.fronts) {
      if (this.rand() < 0.6) {
        const us = [...s.units.values()].filter((u) => (u.nation === f.a || u.nation === f.b) && this.motion.get(u.id)?.mode === 'static');
        if (us.length < 2) continue;
        const a = us[Math.floor(this.rand() * us.length)];
        const cands = us.filter((u) => u.nation !== a.nation && Math.hypot(u.x - a.x, u.z - a.z) < 8);
        if (!cands.length) continue;
        const b = cands[Math.floor(this.rand() * cands.length)];
        const weapons = ['direct', 'artillery', 'missile', 'air', 'aa', 'naval'] as const;
        const wpn = weapons[Math.floor(this.rand() * 4)];
        a.inCombat = b.inCombat = true;
        a.heading = Math.atan2(b.z - a.z, b.x - a.x);
        this.emit({ type: 'combat', attacker: a.id, defender: b.id, fromX: a.x, fromZ: a.z, toX: b.x, toZ: b.z, weapon: wpn });
        b.strength = Math.max(5, b.strength - this.rand() * 4);
        if (this.rand() < 0.04) {
          this.emit({ type: 'unitDestroyed', unit: b.id, nation: b.nation, x: b.x, z: b.z });
          b.strength = 100;
        }
        // Occasionally flip a front hex.
        if (this.rand() < 0.08 && f.hexes.length) {
          const h = f.hexes[Math.floor(this.rand() * f.hexes.length)];
          const from = s.hexOwner[h] - 1;
          const to = from === f.a ? f.b : f.a;
          s.hexOwner[h] = to + 1;
          s.ownerDirty.push(h);
          s.ownerVersion++;
          this.emit({ type: 'hexCaptured', hex: h, from, to });
        }
      }
    }
    if (this.rand() < 0.1) {
      const fs = [...s.facilities.values()];
      const f = fs[Math.floor(this.rand() * fs.length)];
      if (f) {
        f.damage = Math.min(1, f.damage + 0.3);
        s.facilityVersion++;
        this.emit({ type: 'facilityDamaged', facility: f.id, x: f.x, z: f.z });
      }
    }
  }

  advance(realSeconds: number): void {
    this.acc += realSeconds * (SPEED_HOURS_PER_SECOND[this.state.speed] ?? 0);
    let guard = 0;
    while (this.acc >= 1 && guard++ < 48) {
      this.acc -= 1;
      this.tick();
    }
    if (this.acc >= 1) this.acc = 0;
  }

  stepHours(n: number): void { for (let i = 0; i < n; i++) this.tick(); }
  setSpeed(speed: number): void { this.state.speed = Math.max(0, Math.min(5, speed)); }
  on(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter((l) => l !== listener); };
  }
  unitsAt(hex: number): Unit[] { return [...this.state.units.values()].filter((u) => u.hex === hex); }
  atWar(a: number, b: number): boolean { return this.warPairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a)); }
  relation(a: number, b: number): number { return this.state.relations[a * this.state.nations.length + b] ?? 0; }
  hasTreaty(): boolean { return false; }
  isVisible(): boolean { return true; }
  supplyAt(nation: number, hex: number): number {
    const cap = this.world.cities.find((c) => c.nation === nation && c.capital);
    if (!cap) return 50;
    return Math.max(0, 100 - this.grid.distance(cap.hex, hex) * 3);
  }
  findPath(ids: number[], target: number): number[] | null {
    const u = this.state.units.get(ids[0]);
    if (!u) return null;
    const out: number[] = [];
    let cur = u.hex;
    for (let i = 0; i < 200 && cur !== target; i++) {
      let best = -1, bd = Infinity;
      for (let d = 0; d < 6; d++) {
        const m = this.grid.neighbours[cur * 6 + d];
        if (m < 0) continue;
        const dd = this.grid.worldDist(m, target);
        if (dd < bd) { bd = dd; best = m; }
      }
      if (best < 0) break;
      out.push(best);
      cur = best;
    }
    return out;
  }
  militaryPower(): number { return 0; }
  availableDesigns(): string[] { return []; }
  availableTechs(): string[] { return []; }
  private ok(): CommandResult { return { ok: true }; }
  canBuildFacility(): CommandResult { return this.ok(); }
  canBuildUnitAt(): CommandResult { return this.ok(); }
  moveUnits(ids: number[], targetHex: number): CommandResult {
    for (const id of ids) {
      const m = this.motion.get(id);
      if (m) { m.mode = 'wander'; m.tx = this.grid.cx[targetHex]; m.tz = this.grid.cz[targetHex]; }
    }
    return this.ok();
  }
  attack(): CommandResult { return this.ok(); }
  holdPosition(): CommandResult { return this.ok(); }
  setStance(): CommandResult { return this.ok(); }
  retreat(): CommandResult { return this.ok(); }
  airMission(): CommandResult { return this.ok(); }
  rebase(): CommandResult { return this.ok(); }
  reinforce(): CommandResult { return this.ok(); }
  disband(): CommandResult { return this.ok(); }
  queueUnit(): CommandResult { return this.ok(); }
  cancelProduction(): CommandResult { return this.ok(); }
  buildFacility(): CommandResult { return this.ok(); }
  upgradeFacility(): CommandResult { return this.ok(); }
  setTaxes(): CommandResult { return this.ok(); }
  setSpending(): CommandResult { return this.ok(); }
  setMilitaryBudget(): CommandResult { return this.ok(); }
  setResearchBudget(): CommandResult { return this.ok(); }
  setTradePolicy(): CommandResult { return this.ok(); }
  marketTrade(): CommandResult { return this.ok(); }
  issueBonds(): CommandResult { return this.ok(); }
  repayDebt(): CommandResult { return this.ok(); }
  startResearch(): CommandResult { return this.ok(); }
  cancelResearch(): CommandResult { return this.ok(); }
  proposeTreaty(): CommandResult { return this.ok(); }
  cancelTreaty(): CommandResult { return this.ok(); }
  declareWar(): CommandResult { return this.ok(); }
  offerPeace(): CommandResult { return this.ok(); }
  sendAid(): CommandResult { return this.ok(); }
  improveRelations(): CommandResult { return this.ok(); }
  respondProposal(): CommandResult { return this.ok(); }
  setDefcon(): CommandResult { return this.ok(); }
  setAutonomy(): CommandResult { return this.ok(); }

  /** Debug: fire a burst of combat events around a point. */
  burst(x: number, z: number, n = 6): void {
    const weapons = ['direct', 'artillery', 'missile', 'air', 'aa', 'naval'] as const;
    for (let i = 0; i < n; i++) {
      const a = this.rand() * 6.28, r = 0.3 + this.rand() * 1.2;
      const fx = x + Math.cos(a) * r, fz = z + Math.sin(a) * r;
      this.emit({ type: 'combat', attacker: -1, defender: -1, fromX: fx, fromZ: fz, toX: x + (this.rand() - 0.5) * 0.4, toZ: z + (this.rand() - 0.5) * 0.4, weapon: weapons[i % weapons.length] });
    }
    this.emit({ type: 'unitDestroyed', unit: -1, nation: 0, x, z });
  }
}
