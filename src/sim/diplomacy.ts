/**
 * Diplomacy: treaty acceptance logic (shared with the AI), proposals, wars
 * (declaration, call-to-arms, war score, peace), relations drift and world
 * opinion. The AI can reuse `evaluateTreaty` / `evaluatePeace` /
 * `evaluateJoinWar` to predict answers before proposing.
 */
import { TREATY_NAMES, UnitClass, type NationId, type Proposal, type TreatyType, type War } from './types';
import type { Sim } from './core';
import { clamp } from './core';

export interface Evaluation {
  accept: boolean;
  /** > 0 means acceptable; magnitude = enthusiasm. */
  score: number;
  reason: string;
}

const HOURS_PER_DAY = 24;
export const CEASEFIRE_HOURS = 365 * HOURS_PER_DAY;
export const PROPOSAL_HOURS = 14 * HOURS_PER_DAY;

// ---------------------------------------------------------------------------
// Evaluation helpers (pure; usable by the AI)
// ---------------------------------------------------------------------------
/** Nations at war with both a and b, or strongly hostile to both. */
export function commonEnemies(sim: Sim, a: NationId, b: NationId): number {
  let c = 0;
  for (let x = 0; x < sim.N; x++) {
    if (x === a || x === b || !sim.state.nations[x].alive) continue;
    const ea = sim.atWar(a, x) || sim.relation(a, x) < -50;
    const eb = sim.atWar(b, x) || sim.relation(b, x) < -50;
    if (ea && eb) c++;
  }
  return c;
}

/** Strongest hostile power relative to `n` (0 = no threat, 1 = equal, >1 = stronger). */
export function threatLevel(sim: Sim, n: NationId): number {
  const me = Math.max(1, sim.state.nations[n].power);
  let worst = 0;
  for (let x = 0; x < sim.N; x++) {
    if (x === n || !sim.state.nations[x].alive) continue;
    if (!(sim.atWar(n, x) || sim.relation(n, x) < -40)) continue;
    worst = Math.max(worst, sim.state.nations[x].power / me);
  }
  return worst;
}

/** Would `to` accept treaty `type` proposed by `from`? */
export function evaluateTreaty(sim: Sim, from: NationId, to: NationId, type: TreatyType): Evaluation {
  const st = sim.state;
  const A = st.nations[from], B = st.nations[to];
  if (!A?.alive || !B?.alive || from === to) return { accept: false, score: -100, reason: 'Invalid nations' };
  if (sim.hasTreaty(from, to, type)) return { accept: false, score: -100, reason: 'Treaty already in force' };
  const atWar = sim.atWar(from, to);
  if (atWar && type !== 'ceasefire') return { accept: false, score: -100, reason: 'The nations are at war' };
  const rel = sim.relation(to, from);
  const ideo = 1 - Math.abs(A.ideology - B.ideology) / 2; // 0..1
  const common = Math.min(3, commonEnemies(sim, from, to));
  const threat = threatLevel(sim, to);
  const powerRatio = (A.power + 1) / (B.power + 1);
  const embassy = sim.hasTreaty(from, to, 'embassy');
  const opinion = (A.worldOpinion - 50) / 5;
  let score = 0;
  let reason = '';
  switch (type) {
    case 'embassy':
      score = rel + 35 + opinion;
      reason = score > 0 ? 'Diplomatic ties welcome' : 'Relations too poor for an embassy exchange';
      break;
    case 'trade':
      score = rel + 5 + (embassy ? 10 : -10) + 10 * (ideo - 0.5) + Math.min(10, Math.log10(1 + A.gdp) * 2) + opinion;
      reason = score > 10 ? 'Trade benefits both economies' : 'Not interested in closer trade';
      score -= 10;
      break;
    case 'researchSharing':
      score = rel - 20 + (embassy ? 5 : -10) + (Math.abs(A.techLevel - B.techLevel) < 0.2 ? 10 : A.techLevel > B.techLevel ? 15 : -15) + opinion;
      reason = score > 15 ? 'Scientific cooperation is mutually beneficial' : 'Unwilling to share research';
      score -= 15;
      break;
    case 'mapSharing':
      score = rel - 35 + 25 * common + (sim.isAllied(from, to) ? 20 : 0) + 10 * (ideo - 0.5);
      reason = score > 15 ? 'Intelligence sharing accepted' : 'Intelligence sharing requires closer relations';
      score -= 15;
      break;
    case 'militaryAccess':
      score = rel - 45 + 25 * common + (sim.isAllied(from, to) ? 25 : 0) - (A.power > B.power * 3 ? 10 : 0);
      reason = score > 10 ? 'Access granted' : 'Foreign troops on our soil are not acceptable';
      score -= 10;
      break;
    case 'nonAggression':
      score = rel + 15 + (powerRatio > 2 ? 20 : powerRatio > 1 ? 8 : 0) - B.aggression * 30 + (embassy ? 5 : 0);
      if (st.world.claims[to]?.length && claimsOn(sim, to, from)) score -= 25;
      reason = score > 20 ? 'Peaceful coexistence welcomed' : 'Unwilling to rule out conflict';
      score -= 20;
      break;
    case 'defensePact': {
      const dragged = sim.warring.has(from) && !sim.enemiesOf(from).every((e) => sim.atWar(to, e));
      score = rel - 40 + 22 * common + 20 * (ideo - 0.5) + Math.min(20, 15 * threat) + (powerRatio > 0.5 ? 10 : -10) + (embassy ? 5 : -15) - (dragged ? 40 : 0);
      reason = dragged ? 'Will not be drawn into your war' : score > 15 ? 'Mutual defence strengthens us both' : 'Not prepared to guarantee your security';
      score -= 15;
      break;
    }
    case 'alliance': {
      const dragged = sim.warring.has(from) && !sim.enemiesOf(from).every((e) => sim.atWar(to, e) || sim.relation(to, e) < -30);
      score = rel - 55 + 28 * common + 25 * (ideo - 0.5) + (sim.hasTreaty(from, to, 'defensePact') ? 15 : 0) + Math.min(15, 10 * threat) + (embassy ? 5 : -20) - (dragged ? 40 : 0);
      reason = dragged ? 'Will not be drawn into your wars' : score > 15 ? 'A full alliance serves our interests' : 'An alliance is premature';
      score -= 15;
      break;
    }
    case 'ceasefire': {
      const p = evaluatePeace(sim, from, to);
      return { accept: p.accept, score: p.score, reason: p.reason };
    }
  }
  return { accept: score > 0, score, reason };
}

function claimsOn(sim: Sim, claimant: NationId, target: NationId): boolean {
  const list = sim.state.world.claims[claimant];
  if (!list) return false;
  for (let i = 0; i < list.length; i++) if (sim.state.hexOwner[list[i]] - 1 === target) return true;
  return false;
}

/** The war(s) between a and b (opposite sides). */
export function warBetween(sim: Sim, a: NationId, b: NationId): War | undefined {
  return sim.state.wars.find((w) => (w.attackers.includes(a) && w.defenders.includes(b)) || (w.attackers.includes(b) && w.defenders.includes(a)));
}

/** War score from nation n's perspective (positive = winning). */
export function warScoreFor(w: War, n: NationId): number {
  return w.attackers.includes(n) ? w.score : -w.score;
}

/** Would `to` accept peace offered by `from`? */
export function evaluatePeace(sim: Sim, from: NationId, to: NationId): Evaluation {
  const w = warBetween(sim, from, to);
  if (!w) return { accept: false, score: -100, reason: 'Not at war' };
  const B = sim.state.nations[to], A = sim.state.nations[from];
  const s = warScoreFor(w, to);
  const days = (sim.state.hour - w.startHour) / 24;
  let score = -s * 1.2 + B.warWeariness * 0.8 - 20 + Math.min(20, days / 12) + (B.approval < 30 ? 15 : 0)
    + (A.power > B.power * 2.5 ? 20 : 0) - (B.aggression - 0.5) * 20;
  if (s > 30 && B.warWeariness < 80) score -= 30;
  if (days < 7) score -= 30;
  const reason = score > 0 ? 'Peace is in our interest' : s > 20 ? 'We are winning this war' : 'We will fight on';
  return { accept: score > 0, score, reason };
}

/** Would `n` join `war` on the side of `ally`? */
export function evaluateJoinWar(sim: Sim, n: NationId, war: War, ally: NationId): Evaluation {
  const N = sim.state.nations[n];
  const enemies = war.attackers.includes(ally) ? war.defenders : war.attackers;
  if (enemies.some((e) => sim.isAllied(n, e))) return { accept: false, score: -100, reason: 'Allied to both sides' };
  const oblig = sim.isAllied(n, ally) ? 40 : 0;
  let enemyRel = 0;
  for (const e of enemies) enemyRel += sim.relation(n, e);
  enemyRel /= Math.max(1, enemies.length);
  const score = oblig + sim.relation(n, ally) * 0.3 - enemyRel * 0.4 + N.aggression * 20 - N.warWeariness * 0.5 - 25;
  return { accept: score > 0, score, reason: score > 0 ? 'We stand with our ally' : 'We will stay out of this war' };
}

// ---------------------------------------------------------------------------
// Treaties & proposals
// ---------------------------------------------------------------------------
export function signTreaty(sim: Sim, a: NationId, b: NationId, type: TreatyType, duration = -1): void {
  if (sim.hasTreaty(a, b, type)) return;
  sim.addTreaty(type, a, b, duration);
  sim.state.stats.treatiesSigned++;
  const bonus = type === 'alliance' ? 15 : type === 'defensePact' ? 10 : type === 'embassy' ? 3 : 6;
  sim.addRelation(a, b, bonus);
  const st = sim.state;
  const A = st.nations[a], B = st.nations[b];
  const major = type === 'alliance' || type === 'defensePact' || type === 'nonAggression' || type === 'ceasefire';
  const involvesPlayer = a === st.playerNation || b === st.playerNation;
  if (major || involvesPlayer) {
    const imp = (type === 'alliance' && (A.gdp > 1000 || B.gdp > 1000)) ? 2 : involvesPlayer ? 2 : 1;
    sim.news('diplomacy', `${A.name} and ${B.name} sign a ${TREATY_NAMES[type]}.`, [a, b], imp as 1 | 2);
  }
}

export function proposeTreaty(sim: Sim, from: NationId, to: NationId, type: TreatyType): { ok: boolean; reason?: string } {
  const st = sim.state;
  const A = st.nations[from], B = st.nations[to];
  if (!A?.alive || !B?.alive || from === to) return { ok: false, reason: 'Invalid nations' };
  if (sim.hasTreaty(from, to, type)) return { ok: false, reason: 'Treaty already in force' };
  if (type === 'ceasefire') return offerPeace(sim, from, to);
  if (sim.atWar(from, to)) return { ok: false, reason: 'Cannot sign treaties while at war' };
  if (type !== 'embassy' && type !== 'nonAggression' && !sim.hasTreaty(from, to, 'embassy')) return { ok: false, reason: 'An embassy exchange is required first' };
  if (st.proposals.some((p) => p.from === from && p.to === to && p.kind === type)) return { ok: false, reason: 'Proposal already pending' };
  if (B.isPlayer) {
    addProposal(sim, from, to, type, 0, `${A.name} proposes a ${TREATY_NAMES[type]}.`);
    return { ok: true, reason: 'Proposal sent' };
  }
  const ev = evaluateTreaty(sim, from, to, type);
  if (!ev.accept) {
    if (A.isPlayer) sim.news('diplomacy', `${B.name} rejects our proposed ${TREATY_NAMES[type]}: ${ev.reason}.`, [from, to], 1);
    return { ok: false, reason: `${B.name} declined: ${ev.reason}` };
  }
  signTreaty(sim, from, to, type);
  if (type === 'alliance' && !sim.hasTreaty(from, to, 'defensePact')) void 0;
  return { ok: true };
}

export function addProposal(sim: Sim, from: NationId, to: NationId, kind: Proposal['kind'], data: number, message: string): Proposal {
  const p: Proposal = { id: sim.nextId(), from, to, kind, data, createdHour: sim.state.hour, expiresHour: sim.state.hour + PROPOSAL_HOURS, message };
  sim.state.proposals.push(p);
  sim.emit({ type: 'proposal', proposal: p });
  return p;
}

export function respondProposal(sim: Sim, id: number, accept: boolean): { ok: boolean; reason?: string } {
  const st = sim.state;
  const i = st.proposals.findIndex((p) => p.id === id);
  if (i < 0) return { ok: false, reason: 'Proposal not found' };
  const p = st.proposals[i];
  st.proposals.splice(i, 1);
  if (!st.nations[p.from].alive || !st.nations[p.to].alive) return { ok: false, reason: 'Nation no longer exists' };
  if (!accept) {
    sim.addRelation(p.from, p.to, p.kind === 'joinWar' ? -20 : p.kind === 'peace' ? -3 : -4);
    if (p.kind === 'joinWar' && sim.isAllied(p.from, p.to)) {
      // Refusing to honour a pact voids it.
      sim.removeTreaty(p.from, p.to, 'defensePact');
      sim.removeTreaty(p.from, p.to, 'alliance');
      sim.news('diplomacy', `${st.nations[p.to].name} refuses to honour its obligations to ${st.nations[p.from].name}; their pact is dissolved.`, [p.from, p.to], 2);
    }
    return { ok: true };
  }
  switch (p.kind) {
    case 'peace':
      if (!sim.atWar(p.from, p.to)) return { ok: false, reason: 'No longer at war' };
      makePeace(sim, p.from, p.to);
      return { ok: true };
    case 'aid':
      return { ok: true };
    case 'joinWar': {
      const w = st.wars.find((x) => x.id === p.data);
      if (!w) return { ok: false, reason: 'The war is over' };
      joinWar(sim, p.to, w, p.from);
      return { ok: true };
    }
    default:
      if (sim.atWar(p.from, p.to)) return { ok: false, reason: 'At war' };
      signTreaty(sim, p.from, p.to, p.kind);
      return { ok: true };
  }
}

export function cancelTreaty(sim: Sim, from: NationId, to: NationId, type: TreatyType): { ok: boolean; reason?: string } {
  if (!sim.removeTreaty(from, to, type)) return { ok: false, reason: 'No such treaty' };
  const heavy = type === 'alliance' || type === 'defensePact' || type === 'nonAggression';
  sim.addRelation(from, to, heavy ? -20 : -8);
  const st = sim.state;
  if (heavy || from === st.playerNation || to === st.playerNation) {
    sim.news('diplomacy', `${st.nations[from].name} cancels its ${TREATY_NAMES[type]} with ${st.nations[to].name}.`, [from, to], heavy ? 2 : 1);
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// War
// ---------------------------------------------------------------------------
function warName(sim: Sim, a: NationId, b: NationId): string {
  const st = sim.state;
  const base = `${st.nations[a].adjective}-${st.nations[b].adjective} War`;
  const prior = st.news.filter((n) => n.category === 'war' && n.text.includes(base)).length;
  const ords = ['', 'Second ', 'Third ', 'Fourth ', 'Fifth '];
  return prior > 0 && prior < ords.length ? `${ords[prior]}${base}` : base;
}

export function declareWar(sim: Sim, from: NationId, to: NationId): { ok: boolean; reason?: string } {
  const st = sim.state;
  const A = st.nations[from], B = st.nations[to];
  if (!A?.alive || !B?.alive || from === to) return { ok: false, reason: 'Invalid nations' };
  if (sim.atWar(from, to)) return { ok: false, reason: 'Already at war' };
  if (A.defcon > 3) return { ok: false, reason: 'DEFCON must be 3 or lower to declare war' };
  if (sim.isAllied(from, to)) return { ok: false, reason: 'Cancel the alliance / defence pact first' };
  let opinionHit = claimsOn(sim, from, to) ? 8 : 18;
  if (sim.removeTreaty(from, to, 'nonAggression')) {
    opinionHit += 20;
    for (let x = 0; x < sim.N; x++) if (x !== from) sim.addRelation(from, x, -8);
    sim.news('diplomacy', `${A.name} tears up its non-aggression pact with ${B.name}!`, [from, to], 2);
  }
  if (sim.removeTreaty(from, to, 'ceasefire')) opinionHit += 12;
  for (const t of ['trade', 'mapSharing', 'militaryAccess', 'researchSharing', 'embassy'] as TreatyType[]) sim.removeTreaty(from, to, t);
  st.proposals = st.proposals.filter((p) => !((p.from === from && p.to === to) || (p.from === to && p.to === from)));
  const war: War = { id: sim.nextId(), name: warName(sim, from, to), attackers: [from], defenders: [to], startHour: st.hour, score: 0, casualties: {} };
  st.wars.push(war);
  st.stats.warsDeclared++;
  sim.rebuildWarMatrix();
  A.defcon = Math.min(A.defcon, 2);
  B.defcon = Math.min(B.defcon, 2);
  const N = sim.N;
  st.relations[from * N + to] = st.relations[to * N + from] = Math.min(st.relations[from * N + to], -60) - 20;
  A.worldOpinion = clamp(A.worldOpinion - opinionHit, 0, 100);
  for (let x = 0; x < N; x++) {
    if (x === from || x === to || !st.nations[x].alive) continue;
    const pen = sim.isAllied(x, to) ? -15 : sim.relation(x, to) > 40 ? -8 : -3;
    sim.addRelation(from, x, pen);
  }
  B.rally += 12;
  A.rally += A.aggression > 0.5 ? 4 : 0;
  sim.emit({ type: 'warDeclared', war: war.id, attacker: from, defender: to });
  sim.news('war', `${A.name} declares war on ${B.name}! The ${war.name} has begun.`, [from, to], 3, st.cities[B.capitalCity]?.hex ?? -1);
  // Call to arms.
  for (let x = 0; x < N; x++) {
    if (x === from || x === to || !st.nations[x].alive) continue;
    const X = st.nations[x];
    if (sim.isAllied(x, to) && !sim.isAllied(x, from) && !sim.atWar(x, from)) {
      if (X.isPlayer) addProposal(sim, to, x, 'joinWar', war.id, `${B.name} invokes our defence treaty and asks us to join the ${war.name}.`);
      else if (evaluateJoinWar(sim, x, war, to).accept || sim.hasTreaty(x, to, 'alliance') || sim.hasTreaty(x, to, 'defensePact')) joinWar(sim, x, war, to);
    } else if (sim.hasTreaty(x, from, 'alliance') && !sim.isAllied(x, to) && !sim.atWar(x, to)) {
      if (X.isPlayer) addProposal(sim, from, x, 'joinWar', war.id, `${A.name} asks us to join the ${war.name} against ${B.name}.`);
      else if (evaluateJoinWar(sim, x, war, from).accept && X.defcon <= 4) joinWar(sim, x, war, from);
    }
  }
  return { ok: true };
}

export function joinWar(sim: Sim, n: NationId, war: War, ally: NationId): void {
  const st = sim.state;
  if (!st.wars.includes(war) || !st.nations[n].alive) return;
  if (war.attackers.includes(n) || war.defenders.includes(n)) return;
  const side = war.attackers.includes(ally) ? war.attackers : war.defenders;
  const enemies = side === war.attackers ? war.defenders : war.attackers;
  if (enemies.some((e) => sim.isAllied(n, e))) return;
  side.push(n);
  for (const e of enemies) {
    for (const t of ['trade', 'mapSharing', 'militaryAccess', 'researchSharing', 'nonAggression', 'embassy'] as TreatyType[]) sim.removeTreaty(n, e, t);
    const N = sim.N;
    st.relations[n * N + e] = st.relations[e * N + n] = Math.min(st.relations[n * N + e], -50);
  }
  st.nations[n].defcon = Math.min(st.nations[n].defcon, 2);
  sim.rebuildWarMatrix();
  sim.news('war', `${st.nations[n].name} joins the ${war.name} on the side of ${st.nations[ally].name}.`, [n, ally, ...enemies], 2);
}

/** Peace between a and b (principals end the whole war; minor participants leave it). */
export function makePeace(sim: Sim, a: NationId, b: NationId): void {
  const st = sim.state;
  for (const w of [...st.wars]) {
    const aAtt = w.attackers.includes(a), aDef = w.defenders.includes(a);
    const bAtt = w.attackers.includes(b), bDef = w.defenders.includes(b);
    if (!((aAtt && bDef) || (aDef && bAtt))) continue;
    const aLead = (aAtt ? w.attackers : w.defenders)[0] === a;
    const bLead = (bAtt ? w.attackers : w.defenders)[0] === b;
    let ended = false;
    const pairs: [NationId, NationId][] = [];
    if (aLead && bLead) {
      for (const x of w.attackers) for (const y of w.defenders) pairs.push([x, y]);
      ended = true;
    } else {
      const leaver = !aLead ? a : b;
      const other = leaver === a ? b : a;
      const enemies = w.attackers.includes(leaver) ? w.defenders : w.attackers;
      for (const e of enemies) pairs.push([leaver, e]);
      w.attackers = w.attackers.filter((x) => x !== leaver);
      w.defenders = w.defenders.filter((x) => x !== leaver);
      void other;
      if (!w.attackers.length || !w.defenders.length) ended = true;
    }
    if (ended) st.wars.splice(st.wars.indexOf(w), 1);
    sim.rebuildWarMatrix();
    for (const [x, y] of pairs) {
      if (!st.nations[x].alive || !st.nations[y].alive) continue;
      if (sim.atWar(x, y)) continue;
      sim.addTreaty('ceasefire', x, y, CEASEFIRE_HOURS);
      sim.addRelation(x, y, 15);
      repatriate(sim, x, y);
      repatriate(sim, y, x);
    }
    st.stats.peaceTreaties++;
    sim.emit({ type: 'peace', war: w.id });
    const A = st.nations[a], B = st.nations[b];
    sim.news('war', ended ? `The ${w.name} is over: ${A.name} and ${B.name} sign a peace treaty.` : `${A.name} and ${B.name} make a separate peace in the ${w.name}.`, [a, b], ended ? 3 : 2);
    for (const n of [a, b]) {
      const N = st.nations[n];
      if (!sim.warring.has(n)) N.warWeariness *= 0.6;
    }
  }
}

export function offerPeace(sim: Sim, from: NationId, to: NationId): { ok: boolean; reason?: string } {
  const st = sim.state;
  if (!sim.atWar(from, to)) return { ok: false, reason: 'Not at war' };
  const B = st.nations[to];
  if (B.isPlayer) {
    if (st.proposals.some((p) => p.from === from && p.to === to && p.kind === 'peace')) return { ok: false, reason: 'Offer already pending' };
    addProposal(sim, from, to, 'peace', warBetween(sim, from, to)?.id ?? -1, `${st.nations[from].name} offers peace.`);
    return { ok: true, reason: 'Peace offer sent' };
  }
  const ev = evaluatePeace(sim, from, to);
  if (!ev.accept) return { ok: false, reason: `${B.name} refused: ${ev.reason}` };
  makePeace(sim, from, to);
  return { ok: true };
}

/** Land units of `n` standing in territory of `other` go home after peace. */
function repatriate(sim: Sim, n: NationId, other: NationId): void {
  const st = sim.state;
  for (const u of [...sim.nationUnits(n)]) {
    if (sim.owner(u.hex) !== other || sim.design(u).cls !== UnitClass.Land) continue;
    let target = -1;
    const grid = sim.grid;
    for (let r = 1; r <= 40 && target < 0; r++) {
      grid.forRadius(u.hex, r, (h, d) => {
        if (target >= 0 || d !== r) return;
        const o = sim.owner(h);
        if (!sim.isWater(h) && (o === n || (o >= 0 && sim.canEnterTerritory(n, o) && !sim.atWar(n, o)))) target = h;
      });
    }
    if (target < 0) continue;
    sim.setUnitHex(u, target);
    u.x = grid.cx[target];
    u.z = grid.cz[target];
    u.path = [];
    u.moveProgress = 0;
    u.order = { type: 'idle', targetHex: -1, targetUnit: -1 };
  }
  void st;
}

export function endWarsFor(sim: Sim, n: NationId): void {
  const st = sim.state;
  for (const w of [...st.wars]) {
    if (!w.attackers.includes(n) && !w.defenders.includes(n)) continue;
    w.attackers = w.attackers.filter((x) => x !== n);
    w.defenders = w.defenders.filter((x) => x !== n);
    if (!w.attackers.length || !w.defenders.length) {
      st.wars.splice(st.wars.indexOf(w), 1);
      sim.emit({ type: 'peace', war: w.id });
      sim.news('war', `The ${w.name} has ended.`, [...w.attackers, ...w.defenders, n], 2);
    }
  }
  sim.rebuildWarMatrix();
}

// ---------------------------------------------------------------------------
// Daily upkeep
// ---------------------------------------------------------------------------
const TREATY_BONUS: Partial<Record<TreatyType, number>> = {
  embassy: 3, trade: 6, mapSharing: 5, militaryAccess: 5, nonAggression: 6, defensePact: 12, alliance: 18, researchSharing: 5, ceasefire: 0,
};

export function diplomacyDay(sim: Sim): void {
  const st = sim.state;
  const N = sim.N;
  const hour = st.hour;
  // Expire treaties & proposals.
  for (const t of [...st.treaties]) if (t.expiresHour >= 0 && t.expiresHour <= hour) sim.removeTreaty(t.a, t.b, t.type);
  st.proposals = st.proposals.filter((p) => p.expiresHour > hour && st.nations[p.from].alive && st.nations[p.to].alive);
  // Relation baselines.
  const adj = new Float32Array(N * N);
  for (const t of st.treaties) {
    const v = TREATY_BONUS[t.type] ?? 0;
    adj[t.a * N + t.b] += v;
    adj[t.b * N + t.a] += v;
  }
  for (const w of st.wars) {
    for (const sideA of [w.attackers, w.defenders]) {
      for (const x of sideA) for (const y of sideA) if (x !== y) adj[x * N + y] += 15;
    }
    for (const x of w.attackers) for (const y of w.defenders) { adj[x * N + y] -= 70; adj[y * N + x] -= 70; }
  }
  const init = st.world.relations;
  const rel = st.relations;
  for (let a = 0; a < N; a++) {
    const A = st.nations[a];
    if (!A.alive) continue;
    for (let b = a + 1; b < N; b++) {
      if (!st.nations[b].alive) continue;
      const B = st.nations[b];
      const ideo = (0.5 - Math.abs(A.ideology - B.ideology) / 2) * 8;
      const base = clamp((init[a * N + b] ?? 0) + adj[a * N + b] + ideo * 0.5 + (B.worldOpinion - 50) * 0.1, -100, 100);
      const cur = rel[a * N + b];
      const v = cur + (base - cur) * 0.01;
      rel[a * N + b] = v;
      rel[b * N + a] = v;
    }
  }
  updateWarScores(sim);
}

function updateWarScores(sim: Sim): void {
  const st = sim.state;
  if (!st.wars.length) return;
  const N = sim.N;
  const occ = new Float32Array(N * N); // [core * N + holder]
  const coreTotal = new Float32Array(N);
  const own = st.hexOwner, core = st.hexCore;
  for (let i = 0; i < own.length; i++) {
    const c = core[i];
    if (!c) continue;
    coreTotal[c - 1]++;
    const o = own[i];
    if (o && o !== c) occ[(c - 1) * N + (o - 1)]++;
  }
  const cityPop = new Float32Array(N);
  const cityHeld = new Float32Array(N * N);
  for (const c of st.cities) {
    cityPop[c.originalNation] += c.population;
    const o = sim.owner(c.hex);
    if (o >= 0 && o !== c.originalNation) cityHeld[c.originalNation * N + o] += c.population;
  }
  for (const w of st.wars) {
    const held = (victims: NationId[], holders: NationId[]) => {
      let land = 0, landT = 0, city = 0, cityT = 0;
      for (const v of victims) {
        landT += coreTotal[v];
        cityT += cityPop[v];
        for (const h of holders) { land += occ[v * N + h]; city += cityHeld[v * N + h]; }
      }
      return { land: landT > 0 ? land / landT : 0, city: cityT > 0 ? city / cityT : 0 };
    };
    const byA = held(w.defenders, w.attackers);
    const byD = held(w.attackers, w.defenders);
    let casA = 0, casD = 0;
    for (const a of w.attackers) casA += w.casualties[a] ?? 0;
    for (const d of w.defenders) casD += w.casualties[d] ?? 0;
    const cas = (casD - casA) / (casA + casD + 2000);
    w.score = Math.round(100 * clamp(1.5 * (byA.land - byD.land) + 2 * (byA.city - byD.city) + 0.3 * cas, -1, 1) * 10) / 10;
  }
}
