/**
 * Foreign minister: relation management, treaties, aid, alliances, and the
 * big decisions — war preparation, declarations, joining allies' wars and
 * suing for peace.
 */
import type { TreatyType } from '../types';
import { isDemocratic } from '../../worldgen/types';
import type { AIContext } from './context';
import { remember, type NationMemory, type WarPlan } from './memory';
import { financeView } from './economy';

const DAY = 24;

function cooldownOk(mem: NationMemory, key: string, hour: number, days: number): boolean {
  const last = mem.lastProposal.get(key);
  return last === undefined || hour - last >= days * DAY;
}

function propose(ctx: AIContext, me: number, mem: NationMemory, to: number, type: TreatyType, days = 45): boolean {
  const hour = ctx.state.hour;
  const key = `${type}:${to}`;
  if (!cooldownOk(mem, key, hour, days)) return false;
  mem.lastProposal.set(key, hour);
  const r = ctx.game.proposeTreaty(me, to, type);
  if (r.ok) {
    remember(mem, hour, 'diplomacy', `proposed ${type} to ${ctx.nation(to).name}`);
    if (type === 'alliance' || type === 'defensePact' || type === 'nonAggression') {
      ctx.globalLog(me, 'treaty', `${ctx.nation(me).name} proposed ${type} to ${ctx.nation(to).name}${ctx.game.hasTreaty(me, to, type) ? ' (accepted)' : ''}`);
    }
  }
  return r.ok;
}

/** Hexes of `b` that `me` claims (from WorldData.claims) or that were originally ours. */
export function claimsOn(ctx: AIContext, me: number, b: number): { claimed: number; lost: number } {
  const claims = ctx.state.world.claims[me];
  const owner = ctx.state.hexOwner;
  let claimed = 0;
  if (claims) for (let i = 0; i < claims.length; i++) if (owner[claims[i]] - 1 === b) claimed++;
  let lost = 0;
  const core = ctx.state.hexCore;
  // Originally ours but held by b (reconquest motive) — scan b's border region only.
  for (const h of ctx.terr.border[b]?.get(me) ?? []) if (core[h] - 1 === me) lost++;
  return { claimed, lost };
}

/** Power `b` can bring to a war with `me` including its likely defenders. */
export function coalitionPower(ctx: AIContext, side: number, against: number, weightAllies: number): number {
  let p = ctx.totalPower(side);
  for (const a of ctx.alliesOf(side)) {
    if (a === against || ctx.game.atWar(a, side)) continue;
    const rel = ctx.game.relation(a, against);
    const w = rel > 50 ? 0.15 : weightAllies;
    p += ctx.totalPower(a) * w;
  }
  return p;
}

export interface TargetEval {
  target: number;
  motive: number;
  ratio: number;
  score: number;
  reason: string;
  landBorder: boolean;
}

export function evaluateTarget(ctx: AIContext, me: number, b: number): TargetEval | null {
  const game = ctx.game;
  const A = ctx.nation(me);
  const B = ctx.nation(b);
  if (!B || !B.alive || b === me) return null;
  if (game.atWar(me, b)) return null;
  if (ctx.sameMilitaryBloc(me, b) || game.hasTreaty(me, b, 'alliance') || game.hasTreaty(me, b, 'defensePact')) return null;
  if (game.hasTreaty(me, b, 'ceasefire')) return null;
  // A land war needs a border reachable from our heartland (not an exclave/island).
  const landBorder = ctx.terr.mainBorderLength(me, b) > 0;
  ctx.refreshUnits();
  if (!landBorder) {
    // Overseas target: needs naval superiority, reach and a real navy.
    const d = ctx.km(ctx.capitalHex(me), ctx.capitalHex(b));
    const myNavy = ctx.units.navalPower[me];
    if (myNavy < 150 || myNavy < 1.8 * ctx.units.navalPower[b] || d > 2500) return null;
    if ((ctx.terr.coastal[b]?.length ?? 0) === 0) return null;
  }
  const rel = game.relation(me, b);
  const { claimed, lost } = claimsOn(ctx, me, b);
  const reasons: string[] = [];
  let motive = 0;
  if (claimed > 0) {
    motive += 0.3 + Math.min(0.35, claimed / 30);
    reasons.push(`territorial claims (${claimed} hexes)`);
  }
  if (lost > 0) {
    motive += 0.45;
    reasons.push('reconquest of lost land');
  }
  if (rel < -20) {
    motive += Math.min(0.5, (-rel - 20) / 120);
    reasons.push(`hostility (${rel.toFixed(0)})`);
  }
  const ideo = Math.abs(A.ideology - B.ideology);
  if (ideo > 0.8) {
    motive += (ideo - 0.8) * 0.2;
    reasons.push('ideological enmity');
  }
  if (motive < 0.35) return null;

  // Forces tied down facing other hostile neighbours are not available.
  let ours = coalitionPower(ctx, me, b, 0.15);
  const mem = ctx.mem[me];
  let tied = 0;
  for (const t of mem?.threatSources ?? []) if (t !== b) tied += ctx.totalPower(t) * 0.45;
  ours = Math.max(ours * 0.3, ours - tied);
  const theirs = coalitionPower(ctx, b, me, 0.55);
  let ratio = ours / Math.max(1, theirs);
  if (ctx.atWarAny(b)) {
    ratio *= 1.3;
    reasons.push('target distracted by another war');
  }
  if (!landBorder) ratio *= 0.7; // amphibious operations are hard
  const nap = game.hasTreaty(me, b, 'nonAggression');
  let score = motive * Math.max(0, Math.min(1, (ratio - 1.5) / 1.5));
  if (nap) score *= 0.3;
  return { target: b, motive, ratio, score, reason: reasons.join(', '), landBorder };
}

// ---------------------------------------------------------------------------
// War planning
// ---------------------------------------------------------------------------
function considerWar(ctx: AIContext, me: number, mem: NationMemory): void {
  const n = ctx.nation(me);
  const hour = ctx.state.hour;
  const demo = isDemocratic(n.government);
  if (n.aggression < 0.35) return;
  if (demo && n.aggression < 0.6) return;
  if (ctx.atWarAny(me) || mem.warPlan) return;
  if (n.warWeariness > 35) return;
  if (hour < 24 * 10) return; // let the world settle first
  let lastWar = -1e9;
  for (const h of mem.lastWarEnd.values()) lastWar = Math.max(lastWar, h);
  const cooldown = hour - lastWar < 24 * 365 ? 0.25 : 1;
  const fv = financeView(n);
  if (n.treasury < fv.reserveTarget * 0.3 && fv.balance < 0) return;

  const cands = new Set<number>(ctx.terr.landNeighbours(me));
  // Overseas claims (e.g. island disputes).
  const claims = ctx.state.world.claims[me];
  if (claims) for (let i = 0; i < claims.length; i += 7) {
    const o = ctx.owner(claims[i]);
    if (o >= 0 && o !== me) cands.add(o);
  }
  let best: TargetEval | null = null;
  for (const b of cands) {
    const ev = evaluateTarget(ctx, me, b);
    if (ev && ev.score > 0 && (!best || ev.score > best.score)) best = ev;
  }
  if (!best) return;
  const restraint = (demo ? 0.35 : 1) * (1 - n.warWeariness / 100) * cooldown * (n.worldOpinion > 70 ? 0.7 : 1);
  const p = n.aggression * n.aggression * best.score * restraint * 0.22;
  if (mem.rng.next() >= p) return;
  const prepDays = 14 + Math.floor(mem.rng.next() * 21) + (best.landBorder ? 0 : 14);
  const plan: WarPlan = {
    target: best.target,
    reason: best.reason,
    startHour: hour,
    declareHour: hour + prepDays * DAY,
    abandonHour: hour + (prepDays + 28) * DAY,
    score: best.score,
  };
  mem.warPlan = plan;
  mem.posture = 'prep';
  remember(mem, hour, 'diplomacy', `preparing war on ${ctx.nation(best.target).name}: ${best.reason} (power ratio ${best.ratio.toFixed(2)})`);
  ctx.globalLog(me, 'prep', `${n.name} begins preparing for war against ${ctx.nation(best.target).name} — ${best.reason}; power ratio ${best.ratio.toFixed(2)}, declaration in ~${prepDays} days`);
}

/** Readiness of the staged invasion force vs visible defenders (land border). */
export function stagingReady(ctx: AIContext, me: number, mem: NationMemory, target: number): number {
  let ours = 0;
  let theirs = 0;
  for (const s of mem.fronts) {
    if (s.adversary !== target) continue;
    ours += s.present;
    theirs += s.threat;
  }
  for (const o of mem.offensives) if (o.enemy === target) ours += o.initialPower;
  return ours / Math.max(1, theirs);
}

function progressWarPlan(ctx: AIContext, me: number, mem: NationMemory): void {
  const plan = mem.warPlan;
  if (!plan) return;
  const hour = ctx.state.hour;
  const n = ctx.nation(me);
  const target = ctx.nation(plan.target);
  if (!target?.alive || ctx.game.atWar(me, plan.target)) {
    mem.warPlan = null;
    return;
  }
  if (hour < plan.declareHour) return;
  const ev = evaluateTarget(ctx, me, plan.target);
  const ready = ev ? (ev.landBorder ? stagingReady(ctx, me, mem, plan.target) : 2) : 0;
  const ok = ev && ev.ratio >= 1.3 && ready >= 1.2;
  if (ok) {
    // Mobilise (declaring requires DEFCON 3 or lower).
    if (n.defcon > 2) ctx.game.setDefcon(me, 2);
    const r = ctx.game.declareWar(me, plan.target);
    if (r.ok) {
      remember(mem, hour, 'diplomacy', `DECLARED WAR on ${target.name}: ${plan.reason}`);
      ctx.globalLog(me, 'war', `${n.name} declares war on ${target.name} — ${plan.reason}; ratio ${ev!.ratio.toFixed(2)}, staging ${ready.toFixed(2)}`);
      mem.warPlan = null;
      mem.posture = 'war';
    } else {
      remember(mem, hour, 'diplomacy', `war declaration refused: ${r.reason ?? '?'}`);
      mem.warPlan = null;
    }
    return;
  }
  if (hour % (24 * 3) < 24) remember(mem, hour, 'diplomacy', `war on ${target.name} delayed: ratio ${ev ? ev.ratio.toFixed(2) : 'n/a'}, staging ${ready.toFixed(2)}`);
  if (hour >= plan.abandonHour || !ev) {
    remember(mem, hour, 'diplomacy', `abandoned war plan against ${target.name}`);
    ctx.globalLog(me, 'abandon', `${n.name} stands down its war preparations against ${target.name}`);
    mem.warPlan = null;
  }
}

// ---------------------------------------------------------------------------
// Peace
// ---------------------------------------------------------------------------
function considerPeace(ctx: AIContext, me: number, mem: NationMemory): void {
  const hour = ctx.state.hour;
  const n = ctx.nation(me);
  const capital = n.capitalCity >= 0 ? ctx.state.cities[n.capitalCity] : undefined;
  const capitalLost = !!capital && ctx.owner(capital.hex) !== me;
  for (const w of ctx.warsOf(me)) {
    const dur = (hour - w.war.startHour) / DAY;
    if (dur < 10) continue;
    let enemyPower = 0;
    for (const e of w.enemies) enemyPower += ctx.totalPower(e);
    let friendPower = 0;
    for (const f of w.friends) friendPower += ctx.totalPower(f);
    const ratio = friendPower / Math.max(1, enemyPower);
    const ww = n.warWeariness;
    const leader = w.attacker ? w.war.attackers[0] === me : w.war.defenders[0] === me;
    let why = '';
    if (capitalLost) why = 'capital lost';
    else if (w.score < -40) why = `losing badly (score ${w.score.toFixed(0)})`;
    else if (ratio < 0.45 && dur > 30) why = 'hopelessly outmatched';
    else if (ww > 75 && w.score < 15) why = 'war exhaustion';
    else if (w.attacker && leader && w.score > 45 && (dur > 45 || ww > 30)) why = 'war aims achieved';
    else if (dur > 150 && Math.abs(w.score) < 15 && ww > 45) why = 'stalemate';
    else if (!leader && dur > 60 && ww > 40) why = 'coalition member fatigue';
    if (!why) continue;
    for (const e of w.enemies) {
      const last = mem.lastPeaceOffer.get(e) ?? -1e9;
      if (hour - last < 10 * DAY) continue;
      mem.lastPeaceOffer.set(e, hour);
      const r = ctx.game.offerPeace(me, e);
      remember(mem, hour, 'diplomacy', `offered peace to ${ctx.nation(e).name} (${why})${r.ok ? '' : ' — ' + (r.reason ?? 'rejected')}`);
      if (r.ok) ctx.globalLog(me, 'peace', `${n.name} offers peace to ${ctx.nation(e).name} (${why})${ctx.game.atWar(me, e) ? '' : ' — accepted'}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Alliances in war
// ---------------------------------------------------------------------------
function joinAlliesWars(ctx: AIContext, me: number, mem: NationMemory): void {
  const hour = ctx.state.hour;
  const game = ctx.game;
  const n = ctx.nation(me);
  const allies = new Set(ctx.alliesOf(me));
  if (allies.size === 0) return;
  for (const w of ctx.state.wars) {
    if (w.attackers.includes(me) || w.defenders.includes(me)) continue;
    // Only defensive obligations: an ally was attacked.
    const attackedAlly = w.defenders.find((d) => allies.has(d));
    if (attackedAlly === undefined) continue;
    const aggressor = w.attackers[0];
    if (aggressor === undefined || game.atWar(me, aggressor)) continue;
    if (allies.has(aggressor) || game.relation(me, aggressor) > 40) continue;
    if (ctx.totalPower(me) < 5) continue;
    const when = mem.pendingJoin.get(aggressor);
    if (when === undefined) {
      const delay = 1 + Math.floor(mem.rng.next() * 5);
      mem.pendingJoin.set(aggressor, hour + delay * DAY);
      remember(mem, hour, 'diplomacy', `will honour alliance with ${ctx.nation(attackedAlly).name} against ${ctx.nation(aggressor).name}`);
      continue;
    }
    if (hour < when) continue;
    mem.pendingJoin.delete(aggressor);
    const r = game.declareWar(me, aggressor);
    if (r.ok) {
      remember(mem, hour, 'diplomacy', `joined war against ${ctx.nation(aggressor).name} to defend ${ctx.nation(attackedAlly).name}`);
      ctx.globalLog(me, 'join', `${n.name} joins the war against ${ctx.nation(aggressor).name} in defence of ${ctx.nation(attackedAlly).name}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Relations & treaties
// ---------------------------------------------------------------------------
function partners(ctx: AIContext, me: number, mem: NationMemory): number[] {
  const out = new Set<number>(ctx.terr.landNeighbours(me));
  for (const a of ctx.alliesOf(me)) out.add(a);
  for (const t of mem.threatSources) out.add(t);
  // Great powers matter to everyone.
  const nations = ctx.state.nations;
  const bigs = nations.filter((x) => x.alive).sort((a, b) => b.gdp - a.gdp).slice(0, 8);
  for (const b of bigs) out.add(b.id);
  // Bloc partners (non-military blocs too, e.g. EU/ASEAN).
  const me_ = nations[me];
  for (const x of nations) {
    if (x.id !== me && x.alive && x.blocs.some((b) => me_.blocs.includes(b))) out.add(x.id);
  }
  out.delete(me);
  return [...out].filter((x) => nations[x]?.alive).sort((a, b) => a - b);
}

function manageRelations(ctx: AIContext, me: number, mem: NationMemory): void {
  const game = ctx.game;
  const hour = ctx.state.hour;
  const n = ctx.nation(me);
  const fv = financeView(n);
  const myPower = ctx.totalPower(me);
  const list = partners(ctx, me, mem);
  // Rotate through partners: at most ~10 considered per week.
  const start = Math.floor(hour / (7 * DAY)) * 10;
  const pick = list.length <= 10 ? list : Array.from({ length: 10 }, (_, i) => list[(start + i) % list.length]);
  let improveBudget = n.treasury > fv.reserveTarget ? 2 : 0;
  const enemies = new Set(ctx.enemiesOf(me));
  const myThreats = new Set(mem.threatSources);
  for (const p of pick) {
    if (enemies.has(p) || mem.warPlan?.target === p) continue;
    const rel = game.relation(me, p);
    const other = ctx.nation(p);
    const theirPower = ctx.totalPower(p);
    const neighbour = ctx.terr.borderLength(me, p) > 0;
    const sameBloc = ctx.sameBloc(me, p);
    if (rel > -30 && !game.hasTreaty(me, p, 'embassy')) propose(ctx, me, mem, p, 'embassy', 60);
    if (rel > 15 && game.hasTreaty(me, p, 'embassy') && !game.hasTreaty(me, p, 'trade')) propose(ctx, me, mem, p, 'trade', 60);
    if (rel > 50 && sameBloc && !game.hasTreaty(me, p, 'mapSharing')) propose(ctx, me, mem, p, 'mapSharing', 90);
    if (rel > 55 && sameBloc && !game.hasTreaty(me, p, 'researchSharing')) propose(ctx, me, mem, p, 'researchSharing', 90);
    // Weak nation next to a strong one: seek a non-aggression pact.
    if (neighbour && theirPower > 1.5 * myPower && rel > -40 && rel < 70 && !game.hasTreaty(me, p, 'nonAggression')) {
      propose(ctx, me, mem, p, 'nonAggression', 90);
    }
    // Common-threat alignment.
    const pMem = ctx.mem[p];
    const shared = pMem ? pMem.threatSources.some((t) => myThreats.has(t)) : false;
    if (shared && rel > 50 && !game.hasTreaty(me, p, 'defensePact') && !game.hasTreaty(me, p, 'alliance')) {
      propose(ctx, me, mem, p, 'defensePact', 90);
    }
    if (shared && rel > 75 && game.hasTreaty(me, p, 'defensePact') && !game.hasTreaty(me, p, 'alliance')) {
      propose(ctx, me, mem, p, 'alliance', 120);
    }
    // Improve relations: appease strong neighbours, court potential allies.
    if (improveBudget > 0) {
      const appease = neighbour && theirPower > 1.4 * myPower && rel < 25 && !(n.aggression > 0.6);
      const court = shared && rel > 20 && rel < 76;
      const trade = other.gdp > n.gdp * 3 && rel > -10 && rel < 40;
      if (appease || court || trade) {
        if (game.improveRelations(me, p).ok) {
          improveBudget--;
          remember(mem, hour, 'diplomacy', `improving relations with ${other.name}`);
        }
      }
    }
  }

  // Aid to allies at war.
  if (n.treasury > fv.reserveTarget * 3 && fv.balance > 0) {
    for (const a of ctx.alliesOf(me)) {
      if (!ctx.atWarAny(a) || ctx.atWarAny(me)) continue;
      const amount = Math.min(n.treasury * 0.04, n.gdp * 0.001);
      if (amount < 0.05) continue;
      if (game.sendAid(me, a, Math.round(amount * 100) / 100).ok) {
        remember(mem, hour, 'diplomacy', `sent ${amount.toFixed(2)}B aid to ${ctx.nation(a).name}`);
      }
      break;
    }
  }

  // Military access for allies fighting a shared enemy.
  for (const e of enemies) {
    for (const a of ctx.alliesOf(me)) {
      if (ctx.game.atWar(a, e) && !game.hasTreaty(me, a, 'militaryAccess')) propose(ctx, me, mem, a, 'militaryAccess', 60);
    }
  }
}

/** Answer proposals addressed to a player nation whose diplomacy is delegated. */
function answerPlayerProposals(ctx: AIContext, me: number, mem: NationMemory): void {
  const game = ctx.game;
  for (const p of [...ctx.state.proposals]) {
    if (p.to !== me) continue;
    const rel = game.relation(me, p.from);
    let accept = false;
    switch (p.kind) {
      case 'embassy': accept = rel > -40; break;
      case 'trade': accept = rel > 0; break;
      case 'mapSharing':
      case 'researchSharing': accept = rel > 40; break;
      case 'nonAggression': accept = rel > -10; break;
      case 'militaryAccess': accept = rel > 60; break;
      case 'defensePact':
      case 'alliance': accept = rel > 65; break;
      case 'ceasefire':
      case 'peace': {
        const w = ctx.warsOf(me).find((x) => x.enemies.includes(p.from));
        accept = !!w && (w.score < 10 || ctx.nation(me).warWeariness > 50);
        break;
      }
      case 'aid': accept = true; break;
      case 'joinWar': accept = false; break;
    }
    if (game.respondProposal(p.id, accept).ok) {
      remember(mem, ctx.state.hour, 'diplomacy', `${accept ? 'accepted' : 'declined'} ${p.kind} from ${ctx.nation(p.from).name}`);
    }
  }
}

export function runForeign(ctx: AIContext, me: number, mem: NationMemory, allowWar: boolean): void {
  const n = ctx.nation(me);
  if (n.isPlayer) answerPlayerProposals(ctx, me, mem);
  manageRelations(ctx, me, mem);
  if (!allowWar) return;
  joinAlliesWars(ctx, me, mem);
  if (ctx.atWarAny(me)) {
    considerPeace(ctx, me, mem);
    if (mem.warPlan) mem.warPlan = null;
    return;
  }
  if (mem.warPlan) progressWarPlan(ctx, me, mem);
  else considerWar(ctx, me, mem);
}

/** Daily fast-path: pending joins, war-plan deadlines, peace checks at war. */
export function runForeignDaily(ctx: AIContext, me: number, mem: NationMemory, allowWar: boolean): void {
  if (!allowWar) return;
  if (mem.pendingJoin.size > 0) joinAlliesWars(ctx, me, mem);
  if (mem.warPlan) progressWarPlan(ctx, me, mem);
  if (ctx.atWarAny(me)) considerPeace(ctx, me, mem);
}
