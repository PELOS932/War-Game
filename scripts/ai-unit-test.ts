/**
 * Unit tests for the AI's pure helpers (no simulation needed).
 * Run: npx tsx scripts/ai-unit-test.ts
 */
import { HexGrid } from '../src/core/hex';
import { clusterBorder, medoid } from '../src/sim/ai/territory';
import { analyseDesign, forceMix, terrainDefense } from '../src/sim/ai/designs';
import { UnitCategory, UnitClass, type UnitDesign } from '../src/sim/types';
import { Terrain } from '../src/worldgen/types';

let failures = 0;
function check(cond: boolean, msg: string): void {
  if (!cond) {
    failures++;
    console.error('FAIL:', msg);
  } else console.log('ok  :', msg);
}

// --- clusterBorder: a straight 30-hex border line splits into contiguous sectors.
{
  const grid = new HexGrid(60, 40);
  const line: number[] = [];
  for (let c = 5; c < 35; c++) line.push(grid.index(c, 20));
  const sectors = clusterBorder(grid, line, 6);
  check(sectors.length === 5, `30-hex line → 5 sectors (got ${sectors.length})`);
  const total = sectors.reduce((s, x) => s + x.length, 0);
  check(total === 30, 'every border hex assigned exactly once');
  // Contiguity: max intra-sector distance small.
  let maxSpan = 0;
  for (const s of sectors) for (const a of s) for (const b of s) maxSpan = Math.max(maxSpan, grid.distance(a, b));
  check(maxSpan <= 7, `sectors are contiguous (max span ${maxSpan})`);
  const m = medoid(grid, sectors[0]);
  check(sectors[0].includes(m), 'medoid lies in its sector');
  // Two disconnected components never share a sector.
  const two = [...line.slice(0, 5), ...Array.from({ length: 5 }, (_, i) => grid.index(50 + i, 5))];
  const s2 = clusterBorder(grid, two, 10);
  check(s2.length === 2, `two separate border pieces → 2 sectors (got ${s2.length})`);
}

// --- analyseDesign ranks armour above infantry in ground power, AA high antiAir.
{
  const base: UnitDesign = {
    id: 'x', name: 'x', category: UnitCategory.Infantry, cls: UnitClass.Land, generation: 3, requiresTech: null,
    armor: 'soft', mobility: 'foot', personnel: 800, attackSoft: 45, attackHard: 24, attackAir: 10, attackNaval: 5, attackSub: 0,
    rangeGround: 1, rangeAir: 0, rangeNaval: 0, defenseGround: 52, defenseAir: 46, defenseNaval: 44, speedKmh: 18, spotting: 2,
    stealth: 0.15, rangeKm: 0, fuelCapacity: 120, cost: 140, militaryGoodsCost: 12, buildDays: 40, upkeep: 0.75, indirect: false,
    canCapture: true, description: '',
  };
  const inf = analyseDesign(base);
  const tank = analyseDesign({ ...base, id: 't', category: UnitCategory.Armor, attackSoft: 52, attackHard: 76, defenseGround: 73, cost: 850 });
  const aa = analyseDesign({ ...base, id: 'a', category: UnitCategory.AirDefense, attackAir: 70, attackSoft: 10, attackHard: 5 });
  check(tank.ground > inf.ground, `armour ground ${tank.ground.toFixed(1)} > infantry ${inf.ground.toFixed(1)}`);
  check(tank.role === 'mobile' && inf.role === 'line' && aa.role === 'aa', 'roles classified');
  check(aa.antiAir > inf.antiAir, 'AA has higher anti-air');
}

// --- doctrine: landlocked nations build no navy; islands build more.
{
  const common = { coastalShare: 0.2, navalFocus: 0.3, navyRating: 4, airRating: 4, development: 0.6, gdp: 500 };
  const ll = forceMix({ ...common, landlocked: true, island: false, coastalShare: 0 });
  const isl = forceMix({ ...common, landlocked: false, island: true, navalFocus: 0.8 });
  const cont = forceMix({ ...common, landlocked: false, island: false });
  check(ll.naval === 0, 'landlocked → no navy');
  check(isl.naval > cont.naval, `island navy share ${isl.naval.toFixed(2)} > continental ${cont.naval.toFixed(2)}`);
  check(Math.abs(cont.land + cont.air + cont.naval - 1) < 1e-9, 'mix sums to 1');
}

check(terrainDefense(Terrain.Mountains) > terrainDefense(Terrain.Plains), 'mountains defend better than plains');

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log('all AI helper tests passed');
