/**
 * Ideologies (chosen by the player after picking a nation).
 *
 * Each ideology maps to a Government type, a Nation.ideology value (-1..1),
 * fiscal / military leanings (taxes, social spending, defence and police
 * budgets, research), persistent modifiers (merged into Nation.techMods, which
 * the economy, research and production already read), diplomatic affinities
 * with other regime families and bloc compatibility.
 *
 * applyIdeology() is called once after createGame(). Switching away from the
 * nation's real system costs approval, stability and growth, triggers
 * diplomatic reactions and can get the nation expelled from blocs.
 */
import type { GameAPI } from './api';
import type { Sim } from './core';
import { compliance, nominalTaxRate, socialSpending } from './economy';
import type { Nation, NationId } from './types';
import type { LeaderProfile } from './leaderProfile';
import { Government, isDemocratic } from '../worldgen/types';

export type IdeologyId =
  | 'liberalDemocracy' | 'socialDemocracy' | 'conservatism' | 'libertarian' | 'socialism' | 'communism'
  | 'fascism' | 'nationalism' | 'absoluteMonarchy' | 'theocracy' | 'militaryJunta';

/** Regime families used for diplomatic affinity. */
export type RegimeFamily = 'democratic' | 'authoritarian' | 'communist' | 'junta' | 'monarchy' | 'theocracy';
export const FAMILIES: RegimeFamily[] = ['democratic', 'authoritarian', 'communist', 'junta', 'monarchy', 'theocracy'];
export const FAMILY_NAMES: Record<RegimeFamily, string> = {
  democratic: 'Democracies', authoritarian: 'Authoritarian states', communist: 'Communist states',
  junta: 'Military regimes', monarchy: 'Absolute monarchies', theocracy: 'Theocracies',
};

export interface IdeologyDef {
  id: IdeologyId;
  name: string;
  /** One-line motto shown on the card. */
  motto: string;
  description: string;
  government: Government;
  /** Nation.ideology value (-1 authoritarian/collectivist .. 1 liberal democratic). */
  value: number;
  color: string;
  titles: { male: string; female: string };
  /** Relative levels (1 = typical) used as ratios when switching ideology. */
  tax: number;
  social: number;
  military: number;
  police: number;
  research: number;
  /** Starting DEFCON. */
  defcon: number;
  /** Persistent modifiers merged into Nation.techMods (same keys the tech tree uses). */
  mods: Record<string, number>;
  /** Relation affinity (points) towards each regime family. */
  affinity: Record<RegimeFamily, number>;
  /** Blocs (codes) that expel members adopting this ideology. */
  incompatibleBlocs: string[];
}

const DEMO_BLOCS = ['NATO', 'EU', 'ANZUS', 'AUKUS', 'MERCOSUR'];

export const IDEOLOGIES: IdeologyDef[] = [
  {
    id: 'liberalDemocracy', name: 'Liberal Democracy', motto: 'Liberty, markets and the rule of law',
    description: 'Free elections, independent courts and open markets. Innovation thrives and the democratic world trusts you, but voters are fickle and quickly tire of war.',
    government: Government.PresidentialRepublic, value: 0.85, color: '#3f7fd0',
    titles: { male: 'President', female: 'President' },
    tax: 1, social: 1, military: 0.9, police: 0.95, research: 1.15, defcon: 5,
    mods: { researchSpeed: 0.1, gdpGrowth: 0.004, consumerOutput: 0.05, approval: 2, warWeariness: 0.25, lawOrder: -2 },
    affinity: { democratic: 14, authoritarian: -10, communist: -12, junta: -12, monarchy: -3, theocracy: -8 },
    incompatibleBlocs: ['CSTO'],
  },
  {
    id: 'socialDemocracy', name: 'Social Democracy', motto: 'Prosperity shared by all',
    description: 'A generous welfare state funded by high taxes. Citizens are content and educated, industry is steady, but the treasury carries a heavy load.',
    government: Government.Democracy, value: 0.7, color: '#d0506a',
    titles: { male: 'Prime Minister', female: 'Prime Minister' },
    tax: 1.2, social: 1.3, military: 0.85, police: 0.95, research: 1.1, defcon: 5,
    mods: { approval: 4, literacy: 0.02, unemployment: -0.01, researchSpeed: 0.05, gdpGrowth: -0.002, warWeariness: 0.25 },
    affinity: { democratic: 12, authoritarian: -8, communist: -3, junta: -12, monarchy: -5, theocracy: -8 },
    incompatibleBlocs: [],
  },
  {
    id: 'conservatism', name: 'Conservatism', motto: 'Tradition, order and enterprise',
    description: 'Low taxes, strong institutions and a firm hand on law and order. Business and the armed forces are favoured; social programmes are trimmed.',
    government: Government.ConstitutionalMonarchy, value: 0.5, color: '#2a4f9a',
    titles: { male: 'Prime Minister', female: 'Prime Minister' },
    tax: 0.9, social: 0.85, military: 1.1, police: 1.1, research: 1.0, defcon: 5,
    mods: { gdpGrowth: 0.003, industryOutput: 0.05, lawOrder: 4, approval: 1, taxEfficiency: 0.03 },
    affinity: { democratic: 10, authoritarian: -3, communist: -14, junta: -5, monarchy: 5, theocracy: 0 },
    incompatibleBlocs: [],
  },
  {
    id: 'libertarian', name: 'Anarcho-Capitalism', motto: 'The state that governs least',
    description: 'A minimal state: rock-bottom taxes and almost no welfare. The economy races ahead while inequality, unemployment and unrest grow.',
    government: Government.FederalRepublic, value: 0.6, color: '#e0b020',
    titles: { male: 'President', female: 'President' },
    tax: 0.6, social: 0.45, military: 0.75, police: 0.7, research: 0.9, defcon: 5,
    mods: { gdpGrowth: 0.01, consumerOutput: 0.1, industryOutput: 0.05, unemployment: 0.02, lawOrder: -8, approval: -2, unitCost: 0.05, taxEfficiency: -0.05 },
    affinity: { democratic: 5, authoritarian: -8, communist: -20, junta: -6, monarchy: -4, theocracy: -10 },
    incompatibleBlocs: ['CSTO', 'GCC'],
  },
  {
    id: 'socialism', name: 'Socialism', motto: 'The people own the means of production',
    description: 'Key industries are nationalised and planned. Jobs are guaranteed and heavy industry expands, but consumer goods lag and capital flees.',
    government: Government.PresidentialRepublic, value: -0.2, color: '#c83030',
    titles: { male: 'President', female: 'President' },
    tax: 1.25, social: 1.3, military: 1.0, police: 1.1, research: 1.0, defcon: 5,
    mods: { industryOutput: 0.1, unemployment: -0.02, consumerOutput: -0.05, gdpGrowth: -0.004, approval: 2, lawOrder: 2 },
    affinity: { democratic: -3, authoritarian: 3, communist: 14, junta: -6, monarchy: -10, theocracy: -6 },
    incompatibleBlocs: ['GCC'],
  },
  {
    id: 'communism', name: 'Communism', motto: 'Workers of the world, unite!',
    description: 'A one-party workers\' state with a centrally planned economy. Industry, arms output and research are mobilised; freedoms and consumer goods are not. Communist states welcome you, the West does not.',
    government: Government.OneParty, value: -0.85, color: '#b01010',
    titles: { male: 'General Secretary', female: 'General Secretary' },
    tax: 1.35, social: 1.2, military: 1.3, police: 1.5, research: 1.1, defcon: 4,
    mods: { industryOutput: 0.15, militaryOutput: 0.1, researchSpeed: 0.05, consumerOutput: -0.1, gdpGrowth: -0.005, unemployment: -0.03, lawOrder: 10, warWeariness: -0.2, unitCost: -0.05 },
    affinity: { democratic: -20, authoritarian: 4, communist: 28, junta: -5, monarchy: -18, theocracy: -14 },
    incompatibleBlocs: [...DEMO_BLOCS, 'GCC'],
  },
  {
    id: 'fascism', name: 'Fascism', motto: 'Everything within the state',
    description: 'A totalitarian ultranationalist dictatorship. The economy is harnessed for war: arms flow, soldiers fight harder and the home front never tires. The entire world, democracies and communists above all, treats you as a pariah.',
    government: Government.OneParty, value: -1, color: '#303030',
    titles: { male: 'Supreme Leader', female: 'Supreme Leader' },
    tax: 1.1, social: 0.75, military: 1.8, police: 1.8, research: 0.95, defcon: 4,
    mods: { militaryOutput: 0.2, industryOutput: 0.08, unitBuildTime: -0.15, experienceGain: 0.2, warWeariness: -0.5, lawOrder: 14, consumerOutput: -0.08, researchSpeed: -0.05, approval: -1 },
    affinity: { democratic: -32, authoritarian: 5, communist: -32, junta: 10, monarchy: -8, theocracy: -10 },
    incompatibleBlocs: [...DEMO_BLOCS, 'AU', 'ECOWAS', 'GCC', 'CSTO'],
  },
  {
    id: 'nationalism', name: 'Authoritarian Nationalism', motto: 'The nation first, and above all',
    description: 'A strongman state with managed elections, a loyal press and a powerful security apparatus. Order and industry are strong; liberal democracies keep their distance.',
    government: Government.PresidentialRepublic, value: -0.55, color: '#8a4a1a',
    titles: { male: 'President', female: 'President' },
    tax: 1.0, social: 0.9, military: 1.35, police: 1.4, research: 1.0, defcon: 5,
    mods: { lawOrder: 8, industryOutput: 0.06, militaryOutput: 0.08, warWeariness: -0.25, researchSpeed: -0.03, approval: 1 },
    affinity: { democratic: -12, authoritarian: 14, communist: -3, junta: 8, monarchy: 3, theocracy: 0 },
    incompatibleBlocs: ['EU'],
  },
  {
    id: 'absoluteMonarchy', name: 'Absolute Monarchy', motto: 'By the grace of God, the Crown',
    description: 'The sovereign rules by decree. Taxes are light and the court is stable, but innovation is slow. Fellow monarchies are natural friends.',
    government: Government.AbsoluteMonarchy, value: -0.5, color: '#8a2a8a',
    titles: { male: 'King', female: 'Queen' },
    tax: 0.7, social: 0.9, military: 1.25, police: 1.3, research: 0.9, defcon: 5,
    mods: { lawOrder: 10, approval: 3, researchSpeed: -0.05, gdpGrowth: -0.001, taxEfficiency: 0.04 },
    affinity: { democratic: -8, authoritarian: 4, communist: -18, junta: 2, monarchy: 22, theocracy: 6 },
    incompatibleBlocs: [...DEMO_BLOCS.filter((b) => b !== 'MERCOSUR'), 'CSTO'],
  },
  {
    id: 'theocracy', name: 'Theocracy', motto: 'Divine law above the laws of men',
    description: 'Clerics govern according to scripture. The faithful are loyal and endure hardship, but science and trade suffer. Other theocracies stand with you.',
    government: Government.Theocracy, value: -0.75, color: '#2a8a5a',
    titles: { male: 'Supreme Guide', female: 'Supreme Guide' },
    tax: 0.9, social: 1.0, military: 1.2, police: 1.4, research: 0.8, defcon: 5,
    mods: { approval: 4, lawOrder: 8, warWeariness: -0.35, researchSpeed: -0.1, gdpGrowth: -0.003, literacy: -0.02 },
    affinity: { democratic: -15, authoritarian: 0, communist: -20, junta: -2, monarchy: 6, theocracy: 22 },
    incompatibleBlocs: [...DEMO_BLOCS, 'CSTO'],
  },
  {
    id: 'militaryJunta', name: 'Military Junta', motto: 'Order through strength',
    description: 'The generals rule directly. The armed forces receive everything they ask for and units train and deploy faster; the economy and civil society stagnate.',
    government: Government.MilitaryJunta, value: -0.7, color: '#4a5a2a',
    titles: { male: 'Chairman of the Military Council', female: 'Chairman of the Military Council' },
    tax: 0.95, social: 0.75, military: 1.9, police: 1.5, research: 0.85, defcon: 4,
    mods: { militaryOutput: 0.12, unitBuildTime: -0.2, experienceGain: 0.15, lawOrder: 10, gdpGrowth: -0.006, researchSpeed: -0.08, approval: -3, consumerOutput: -0.05 },
    affinity: { democratic: -18, authoritarian: 8, communist: -4, junta: 20, monarchy: 2, theocracy: -2 },
    incompatibleBlocs: [...DEMO_BLOCS, 'AU', 'ECOWAS'],
  },
];

const BY_ID = new Map<string, IdeologyDef>(IDEOLOGIES.map((d) => [d.id, d]));

export function ideologyDef(id: string | undefined): IdeologyDef | undefined {
  return id ? BY_ID.get(id) : undefined;
}

const COMMUNIST_STATES = new Set(['CHN', 'VNM', 'LAO', 'CUB', 'PRK']);
const NORDIC = new Set(['SWE', 'NOR', 'DNK', 'FIN', 'ISL']);

interface NationLike { code: string; government: Government; ideology: number }

/** The ideology that best describes a nation's real system of government. */
export function realIdeologyOf(n: NationLike): IdeologyId {
  switch (n.government) {
    case Government.OneParty: return COMMUNIST_STATES.has(n.code) ? 'communism' : 'nationalism';
    case Government.MilitaryJunta: return 'militaryJunta';
    case Government.AbsoluteMonarchy: return 'absoluteMonarchy';
    case Government.Theocracy: return 'theocracy';
    default:
      if (n.ideology < -0.3) return 'nationalism';
      if (NORDIC.has(n.code)) return 'socialDemocracy';
      return 'liberalDemocracy';
  }
}

/** Regime family of any nation (player: from its chosen ideology). */
export function familyOf(n: NationLike & { ideologyId?: string }): RegimeFamily {
  const id = (n.ideologyId as IdeologyId | undefined) ?? realIdeologyOf(n);
  return familyOfIdeology(id);
}

export function familyOfIdeology(id: IdeologyId): RegimeFamily {
  switch (id) {
    case 'communism': case 'socialism': return 'communist';
    case 'fascism': case 'nationalism': return 'authoritarian';
    case 'militaryJunta': return 'junta';
    case 'absoluteMonarchy': return 'monarchy';
    case 'theocracy': return 'theocracy';
    default: return 'democratic';
  }
}

/** Affinity of an ideology towards another nation (relation points). */
function affinityTo(def: IdeologyDef, other: NationLike & { ideologyId?: string }): number {
  let a = def.affinity[familyOf(other)];
  // Fascism is hated even by other authoritarian regimes that aren't fascist.
  if (def.id === 'fascism' && other.ideologyId === 'fascism') a = 25;
  return a;
}

/**
 * Persistent relation bias between two nations caused by a player's ideology
 * change (added to the diplomacy drift target). 0 for nations that kept their
 * real system (so the baseline world is untouched).
 */
export function ideologyRelationBias(a: Nation, b: Nation): number {
  let bias = 0;
  if (a.ideologyId && a.ideologyId !== a.ideologyOrigin) bias += changeBias(a, b);
  if (b.ideologyId && b.ideologyId !== b.ideologyOrigin) bias += changeBias(b, a);
  return bias;
}

function changeBias(changer: Nation, other: Nation): number {
  const now = ideologyDef(changer.ideologyId);
  const was = ideologyDef(changer.ideologyOrigin);
  if (!now || !was) return 0;
  return affinityTo(now, other) - affinityTo(was, other);
}

/** Merges the nation's ideology modifiers into a freshly computed techMods table. */
export function addIdeologyMods(n: Nation): void {
  const def = ideologyDef(n.ideologyId);
  if (!def) return;
  const m = { ...n.techMods };
  for (const k in def.mods) m[k] = (m[k] ?? 0) + def.mods[k];
  n.techMods = m;
}

// ---------------------------------------------------------------------------
// Previews for the UI
// ---------------------------------------------------------------------------
export interface IdeologyEffect { label: string; text: string; good: boolean | null }

const MOD_LABELS: Record<string, [string, (v: number) => string, boolean]> = {
  gdpGrowth: ['Economic growth', (v) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%/yr`, true],
  researchSpeed: ['Research speed', (v) => pct(v), true],
  industryOutput: ['Heavy industry output', (v) => pct(v), true],
  consumerOutput: ['Consumer goods output', (v) => pct(v), true],
  militaryOutput: ['Arms factory output', (v) => pct(v), true],
  unitBuildTime: ['Unit build time', (v) => pct(v), false],
  unitCost: ['Unit cost', (v) => pct(v), false],
  experienceGain: ['Troop experience gain', (v) => pct(v), true],
  approval: ['Approval', (v) => `${v > 0 ? '+' : ''}${v}`, true],
  lawOrder: ['Law & order', (v) => `${v > 0 ? '+' : ''}${v}`, true],
  unemployment: ['Unemployment', (v) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(0)} pts`, false],
  warWeariness: ['War weariness growth', (v) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(0)}%`, false],
  taxEfficiency: ['Tax collection', (v) => pct(v), true],
  literacy: ['Literacy', (v) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(0)} pts`, true],
};

function pct(v: number): string {
  return `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
}

function level(v: number, name: string, goodHigh: boolean | null): IdeologyEffect | null {
  if (Math.abs(v - 1) < 0.04) return null;
  const word = v >= 1.6 ? 'Very high' : v > 1 ? 'Higher' : v <= 0.65 ? 'Very low' : 'Lower';
  return { label: name, text: `${word} (${v > 1 ? '+' : ''}${Math.round((v - 1) * 100)}%)`, good: goodHigh === null ? null : (v > 1) === goodHigh };
}

/** Human-readable effect list for an ideology card. */
export function ideologyEffects(def: IdeologyDef): IdeologyEffect[] {
  const out: IdeologyEffect[] = [];
  for (const k in def.mods) {
    const l = MOD_LABELS[k];
    if (!l) continue;
    const v = def.mods[k];
    out.push({ label: l[0], text: l[1](v), good: (v > 0) === l[2] });
  }
  const lv = [level(def.tax, 'Taxes', null), level(def.social, 'Social spending', null), level(def.military, 'Defence budget', null), level(def.police, 'Security forces', null), level(def.research, 'Research budget', true)];
  for (const e of lv) if (e) out.push(e);
  if (def.defcon < 5) out.push({ label: 'Starting readiness', text: `DEFCON ${def.defcon}`, good: null });
  return out;
}

export interface IdeologyPreview {
  keep: boolean;
  approvalHit: number;
  government: Government;
  title: string;
  blocsLost: string[];
  friends: NationId[]; // nations whose relations improve most
  enemies: NationId[]; // nations whose relations worsen most
}

/** What choosing `id` would do for `nationId` (used by the ideology screen). */
export function previewIdeology(game: GameAPI, nationId: NationId, id: IdeologyId, gender: 'male' | 'female' = 'male'): IdeologyPreview {
  const st = game.state;
  const n = st.nations[nationId];
  const origin = realIdeologyOf(n);
  const def = BY_ID.get(id) ?? BY_ID.get(origin)!;
  const was = BY_ID.get(origin)!;
  const keep = id === origin;
  const deltas: { id: NationId; d: number }[] = [];
  if (!keep) {
    for (const o of st.nations) {
      if (!o.alive || o.id === nationId) continue;
      const d = affinityTo(def, o) - affinityTo(was, o);
      if (d) deltas.push({ id: o.id, d });
    }
  }
  const weight = (x: { id: NationId; d: number }) => x.d * Math.log10(Math.max(2, st.nations[x.id].gdp));
  const friends = deltas.filter((x) => x.d > 0).sort((a, b) => weight(b) - weight(a)).map((x) => x.id);
  const enemies = deltas.filter((x) => x.d < 0).sort((a, b) => weight(a) - weight(b)).map((x) => x.id);
  const blocsLost = keep ? [] : n.blocs.map((b) => st.world.blocs[b]).filter((b) => b && def.incompatibleBlocs.includes(b.code)).map((b) => b.short);
  return {
    keep,
    approvalHit: keep ? 0 : switchShock(was, def).approval,
    government: keep ? n.government : def.government,
    title: keep ? (gender === 'female' ? feminineTitle(n.leaderTitle) : n.leaderTitle) : def.titles[gender],
    blocsLost,
    friends,
    enemies,
  };
}

function switchShock(was: IdeologyDef, now: IdeologyDef): { approval: number; law: number; growth: number } {
  if (was.id === now.id) return { approval: 0, law: 0, growth: 0 };
  const dist = Math.abs(now.value - was.value); // 0..2
  const regime = isDemocratic(was.government) !== isDemocratic(now.government) ? 1 : 0;
  return {
    approval: Math.round(4 + 6 * dist + 5 * regime),
    law: Math.round(4 + 7 * dist + 5 * regime),
    growth: 0.002 + 0.005 * dist + 0.004 * regime,
  };
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------
function simOf(game: GameAPI): Sim | null {
  const sim = (game as unknown as { sim?: Sim }).sim;
  return sim && typeof sim.removeTreaty === 'function' ? sim : null;
}

/**
 * Applies an ideology to a nation right after createGame(). Keeping the real
 * system only adds the ideology's persistent modifiers; switching also changes
 * the government, budgets, approval, relations and bloc memberships.
 */
export function applyIdeology(game: GameAPI, nationId: NationId, ideologyId: string, opts: { title?: string; gender?: 'male' | 'female' } = {}): void {
  const st = game.state;
  const n = st.nations[nationId];
  if (!n) return;
  const originId = realIdeologyOf(n);
  const def = BY_ID.get(ideologyId) ?? BY_ID.get(originId)!;
  const was = BY_ID.get(originId)!;
  const keep = def.id === was.id;
  const sim = simOf(game);
  n.ideologyId = def.id;
  n.ideologyOrigin = was.id;
  addIdeologyMods(n);
  if (opts.title) n.leaderTitle = opts.title;
  else if (opts.gender === 'female') n.leaderTitle = feminineTitle(n.leaderTitle);
  if (keep) return;

  const day = Math.floor(st.hour / 24);
  const oldGov = n.government;
  n.government = def.government;
  n.ideology = def.value;
  if (!opts.title) n.leaderTitle = def.titles[opts.gender ?? 'male'];
  const demNow = isDemocratic(def.government);
  if (demNow && !isDemocratic(oldGov)) n.nextElectionDay = day + 730;
  else if (!demNow) n.nextElectionDay = -1;
  for (const m of n.ministers) m.ideology = Math.max(-1, Math.min(1, def.value + (m.ideology - was.value) * 0.5));

  // ---- budgets (ratios between the new and the old ideology's leanings) ----
  const rt = def.tax / was.tax;
  n.taxes = {
    income: clamp(n.taxes.income * rt, 0.02, 0.7),
    corporate: clamp(n.taxes.corporate * rt, 0.03, 0.6),
    sales: clamp(n.taxes.sales * rt, 0.02, 0.4),
  };
  const rs = def.social / was.social;
  n.spending.health *= rs;
  n.spending.family *= rs;
  n.spending.socialAssistance *= rs;
  n.spending.education *= Math.sqrt(rs);
  n.spending.lawEnforcement *= def.police / was.police;
  n.militaryBudget = clamp(n.militaryBudget * (def.military / was.military), 0.003, 0.25);
  n.researchBudget = clamp(n.researchBudget * (def.research / was.research), 0.0003, 0.03);
  // The new budget is the new normal: re-baseline so approval isn't hit twice.
  const b = n.baseline;
  b.taxBurden = nominalTaxRate(n.taxes) * compliance(n);
  b.social = socialSpending(n.spending);
  b.education = n.spending.education;
  b.lawEnforcement = n.spending.lawEnforcement;
  n.defcon = Math.min(n.defcon, def.defcon);

  // ---- domestic shock of the regime change ----
  const shock = switchShock(was, def);
  n.approval = clamp(n.approval - shock.approval * 0.5, 5, 95);
  n.rally -= shock.approval * 0.5;
  n.lawOrder = clamp(n.lawOrder - shock.law, 5, 100);
  n.growthShock -= shock.growth;
  n.worldOpinion = clamp(n.worldOpinion + (def.value - was.value) * 12, 0, 100);
  if (def.id === 'fascism') n.worldOpinion = clamp(n.worldOpinion - 15, 0, 100);

  // ---- diplomatic reactions ----
  const N = st.nations.length;
  const rel = st.relations;
  let condemned = 0;
  let welcomed = 0;
  for (const o of st.nations) {
    if (!o.alive || o.id === n.id) continue;
    const d = (affinityTo(def, o) - affinityTo(was, o)) * 0.85;
    if (!d) continue;
    const v = clamp(rel[n.id * N + o.id] + d, -100, 100);
    rel[n.id * N + o.id] = v;
    rel[o.id * N + n.id] = v;
    if (d <= -10) condemned++;
    else if (d >= 10) welcomed++;
  }

  // ---- bloc compatibility ----
  const lost: string[] = [];
  for (const bi of [...n.blocs]) {
    const bloc = st.world.blocs[bi];
    if (!bloc || !def.incompatibleBlocs.includes(bloc.code)) continue;
    n.blocs = n.blocs.filter((x) => x !== bi);
    lost.push(bloc.short);
    for (const o of st.nations) {
      if (o.id === n.id || !o.blocs.includes(bi)) continue;
      const stillAllied = bloc.military && n.blocs.some((x) => st.world.blocs[x]?.military && o.blocs.includes(x));
      if (bloc.military && !stillAllied) {
        if (sim) sim.removeTreaty(n.id, o.id, 'alliance');
        else removeTreatyRaw(game, n.id, o.id, 'alliance');
      }
      const v = clamp(rel[n.id * N + o.id] - 10, -100, 100);
      rel[n.id * N + o.id] = v;
      rel[o.id * N + n.id] = v;
    }
  }
  // Defence pacts / alliances with nations that now despise us collapse.
  for (const t of [...st.treaties]) {
    if ((t.type !== 'alliance' && t.type !== 'defensePact') || (t.a !== n.id && t.b !== n.id)) continue;
    const o = t.a === n.id ? t.b : t.a;
    if (rel[n.id * N + o] < 0) {
      if (sim) sim.removeTreaty(t.a, t.b, t.type);
      else removeTreatyRaw(game, t.a, t.b, t.type);
    }
  }

  // ---- news ----
  if (sim) {
    sim.news('politics', `${n.leaderTitle} ${n.leaderName} proclaims ${articleFor(def)} in ${n.name}, replacing the ${was.name.toLowerCase()}.`, [n.id], 2);
    if (condemned) sim.news('diplomacy', `${condemned} nations condemn the new regime in ${n.name}.${welcomed ? ` ${welcomed} others welcome it.` : ''}`, [n.id], 1);
    else if (welcomed) sim.news('diplomacy', `${welcomed} nations welcome the new government of ${n.name}.`, [n.id], 1);
    for (const b of lost) sim.news('diplomacy', `${n.name} is expelled from ${b} following its change of regime.`, [n.id], 2);
  }
}

const FEMININE: Record<string, string> = {
  King: 'Queen', Emperor: 'Empress', Prince: 'Princess', 'Grand Duke': 'Grand Duchess', Sultan: 'Sultana', Emir: 'Emira', Tsar: 'Tsarina',
};

/** Female form of a leader title (unchanged when it is gender-neutral). */
export function feminineTitle(t: string): string {
  return FEMININE[t] ?? t;
}

/** Installs the player's leader (name + portrait profile) on a nation. */
export function applyLeaderProfile(game: GameAPI, nationId: NationId, profile: LeaderProfile): void {
  const n = game.state.nations[nationId];
  if (!n) return;
  n.leaderProfile = profile;
  const name = profile.name.trim();
  if (name) {
    n.leaderName = name;
    const head = n.ministers.find((m) => m.role === 'head');
    if (head) head.name = name;
  }
}

function articleFor(def: IdeologyDef): string {
  switch (def.id) {
    case 'liberalDemocracy': return 'a liberal democracy';
    case 'socialDemocracy': return 'a social democracy';
    case 'conservatism': return 'a conservative government';
    case 'libertarian': return 'an anarcho-capitalist free state';
    case 'socialism': return 'a socialist republic';
    case 'communism': return "a communist people's republic";
    case 'fascism': return 'a fascist state';
    case 'nationalism': return 'a nationalist regime';
    case 'absoluteMonarchy': return 'an absolute monarchy';
    case 'theocracy': return 'a theocracy';
    case 'militaryJunta': return 'military rule';
  }
}

function removeTreatyRaw(game: GameAPI, a: NationId, b: NationId, type: string): void {
  const list = game.state.treaties;
  for (let i = list.length - 1; i >= 0; i--) {
    const t = list[i];
    if (t.type === type && ((t.a === a && t.b === b) || (t.a === b && t.b === a))) list.splice(i, 1);
  }
}

function clamp(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x;
}
