/**
 * Order batching & anti-jitter helpers. Units are only re-ordered when their
 * intended destination/mission differs from what they are already doing.
 */
import type { Stance, Unit } from '../../types';
import type { AIContext } from '../context';
import type { NationMemory, UnitIntent, UnitRole } from '../memory';

export class OrderBatch {
  /** One movement-type command per unit per cycle; later calls win. */
  private cmds = new Map<number, { kind: 'move' | 'attack' | 'hold' | 'retreat'; target: number }>();
  private stances = new Map<number, Stance>();
  private reinforces: number[] = [];
  issued = 0;
  failed = 0;

  constructor(private ctx: AIContext, private mem: NationMemory) {}

  move(u: Unit, target: number): void {
    this.cmds.set(u.id, { kind: 'move', target });
  }
  attack(u: Unit, target: number): void {
    this.cmds.set(u.id, { kind: 'attack', target });
  }
  stance(u: Unit, s: Stance): void {
    if (u.stance !== s) this.stances.set(u.id, s);
    else this.stances.delete(u.id);
  }
  hold(u: Unit): void {
    this.cmds.set(u.id, { kind: 'hold', target: -1 });
  }
  reinforce(u: Unit): void {
    this.reinforces.push(u.id);
  }
  retreat(u: Unit): void {
    this.cmds.set(u.id, { kind: 'retreat', target: -1 });
  }
  /** Whether a command was already queued for this unit this cycle. */
  has(u: Unit): boolean {
    return this.cmds.has(u.id);
  }

  flush(): void {
    const game = this.ctx.game;
    const hour = this.ctx.state.hour;
    const note = (ids: number[], ok: boolean, target: number) => {
      this.issued++;
      if (!ok) this.failed++;
      for (const id of ids) {
        const it = this.mem.intents.get(id);
        if (!it) continue;
        it.issuedHour = hour;
        if (ok) it.fails = 0;
        else it.fails++;
        void target;
      }
    };
    const stanceGroups = new Map<Stance, number[]>();
    for (const [id, st] of this.stances) push(stanceGroups, st, id);
    for (const [st, ids] of stanceGroups) game.setStance(ids, st);
    const groups = new Map<string, number[]>();
    for (const [id, c] of this.cmds) push(groups, `${c.kind}:${c.target}`, id);
    for (const [key, ids] of groups) {
      const [kind, ts] = key.split(':');
      const t = Number(ts);
      for (const c of chunks(ids)) {
        switch (kind) {
          case 'move': note(c, game.moveUnits(c, t).ok, t); break;
          case 'attack': note(c, game.attack(c, t).ok, t); break;
          case 'retreat': note(c, game.retreat(c).ok, -1); break;
          default: game.holdPosition(c); break;
        }
      }
    }
    if (this.reinforces.length) game.reinforce(this.reinforces);
  }
}

function push<K>(m: Map<K, number[]>, k: K, v: number): void {
  let l = m.get(k);
  if (!l) m.set(k, (l = []));
  l.push(v);
}

function chunks(ids: number[], size = 10): number[][] {
  if (ids.length <= size) return ids.length ? [ids] : [];
  const out: number[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

export function setIntent(mem: NationMemory, u: Unit, role: UnitRole, key: number, target: number): UnitIntent {
  let it = mem.intents.get(u.id);
  if (!it) {
    it = { role, key, target, issuedHour: -1e9, fails: 0 };
    mem.intents.set(u.id, it);
  } else if (it.role !== role || it.key !== key) {
    it.role = role;
    it.key = key;
    it.fails = 0;
  }
  if (it.target !== target) {
    it.target = target;
  }
  return it;
}

/** True when a land/naval unit already heads to (or sits at) `target`. */
export function headingTo(u: Unit, target: number): boolean {
  if (u.hex === target) return true;
  if ((u.order.type === 'move' || u.order.type === 'attack') && u.order.targetHex === target) return true;
  if (u.path.length > 0 && u.path[u.path.length - 1] === target) return true;
  return false;
}

/** Issue a move only when needed (anti-jitter & failure backoff). */
export function ensureAt(batch: OrderBatch, ctx: AIContext, it: UnitIntent, u: Unit, target: number): void {
  if (headingTo(u, target)) return;
  // Never pull a unit out of an attack it is fighting (it returns to its post afterwards).
  if (u.order.type === 'attack' && u.inCombat) return;
  const hour = ctx.state.hour;
  // Back off after repeated failures (unreachable targets).
  if (it.fails > 0 && hour - it.issuedHour < 6 * Math.min(8, it.fails)) return;
  batch.move(u, target);
}
