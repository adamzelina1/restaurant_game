import {
  DETOUR_MAX_EXPANSIONS,
  REPATH_AFTER,
  SIDESTEP_AFTER,
  SQUEEZE_AFTER,
  SQUEEZE_PENALTY,
} from '../constants';
import { findPath } from '../grid/astar';
import { distanceField } from '../grid/distance';
import { DIRS, canStepStatic, layout, type Layout, type Mask } from '../grid/grid';
import type { GameState, Id, Mover } from '../state';

/** What the movement system needs to know about an agent this tick. */
export interface AgentRef {
  id: Id;
  m: Mover;
  /** Tiles per second right now. */
  speed: number;
  /** Lower moves first (deterministic order). */
  order: number;
  /** Idle agents step aside when someone needs their tile. */
  canYield: boolean;
  /** Agents that are not working at a station can be squeezed past. */
  canSwap: boolean;
  /** Guests are confined to dining floor. */
  mask: Mask;
}

const SQRT2 = Math.SQRT2;

export function setGoal(m: Mover, x: number, y: number): void {
  if (m.goal && m.goal.x === x && m.goal.y === y) return;
  m.goal = { x, y };
  m.blocked = 0;
  m.detour = [];
}

export function clearGoal(m: Mover): void {
  m.goal = null;
  m.blocked = 0;
  m.detour = [];
}

/** True when standing still on the goal tile. */
export function atGoal(m: Mover): boolean {
  return !!m.goal && !m.step && m.x === m.goal.x && m.y === m.goal.y;
}

export function isAt(m: Mover, x: number, y: number): boolean {
  return !m.step && m.x === x && m.y === y;
}

/** Tile occupancy counts: an agent holds its tile and, while stepping, its target. */
class Occupancy {
  private count = new Map<number, number>();
  add(i: number): void {
    this.count.set(i, (this.count.get(i) ?? 0) + 1);
  }
  remove(i: number): void {
    const c = (this.count.get(i) ?? 0) - 1;
    if (c <= 0) this.count.delete(i);
    else this.count.set(i, c);
  }
  has(i: number): boolean {
    return this.count.has(i);
  }
}

interface Ctx {
  state: GameState;
  l: Layout;
  occ: Occupancy;
  agents: AgentRef[];
}

function tileOf(l: Layout, m: Mover): number {
  return m.y * l.width + m.x;
}

/** Can the agent at (x,y) step by (dx,dy) right now, given agents? */
function canStep(ctx: Ctx, x: number, y: number, dx: number, dy: number, mask: Mask): boolean {
  const { l, occ } = ctx;
  if (!canStepStatic(l, x, y, dx, dy, mask)) return false;
  if (occ.has((y + dy) * l.width + x + dx)) return false;
  if (dx !== 0 && dy !== 0 && occ.has(y * l.width + x + dx) && occ.has((y + dy) * l.width + x)) return false;
  return true;
}

function startStep(ctx: Ctx, a: AgentRef, tx: number, ty: number, extra = 0): void {
  const diag = tx !== a.m.x && ty !== a.m.y;
  const dur = (diag ? SQRT2 : 1) / Math.max(0.05, a.speed) + extra;
  a.m.step = { tx, ty, t: 0, dur };
  ctx.occ.add(ty * ctx.l.width + tx);
}

function blockerAt(ctx: Ctx, tile: number): AgentRef | null {
  const w = ctx.l.width;
  for (const b of ctx.agents) {
    if (b.m.y * w + b.m.x === tile) return b;
    if (b.m.step && b.m.step.ty * w + b.m.step.tx === tile) return b;
  }
  return null;
}

/** Ask an idle agent to step off its tile. Returns true if it started moving. */
function yieldTile(ctx: Ctx, b: AgentRef, avoid: number[]): boolean {
  if (b.m.step) return false;
  const { l } = ctx;
  for (let k = 0; k < 8; k++) {
    const [dx, dy] = DIRS[k];
    const n = (b.m.y + dy) * l.width + b.m.x + dx;
    if (avoid.includes(n)) continue;
    if (!canStep(ctx, b.m.x, b.m.y, dx, dy, b.mask)) continue;
    startStep(ctx, b, b.m.x + dx, b.m.y + dy);
    return true;
  }
  return false;
}

function recordBlocked(state: GameState, tile: number, dt: number): void {
  const s = state.stats.blockedByTile;
  s[tile] = (s[tile] ?? 0) + dt;
}

function recordTraffic(state: GameState, tile: number): void {
  const s = state.stats.trafficByTile;
  s[tile] = (s[tile] ?? 0) + 1;
}

/** Pick and start the next step toward the goal. Returns false if the agent is stuck. */
function advance(ctx: Ctx, a: AgentRef, dt: number): boolean {
  const { state, l } = ctx;
  const m = a.m;
  const goal = m.goal!;
  const here = tileOf(l, m);

  // Follow a detour found by the local A*, if it is still usable.
  if (m.detour.length > 0) {
    const n = m.detour[0];
    const nx = n % l.width;
    const ny = (n - nx) / l.width;
    const dx = nx - m.x;
    const dy = ny - m.y;
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && canStep(ctx, m.x, m.y, dx, dy, a.mask)) {
      m.detour.shift();
      startStep(ctx, a, nx, ny);
      m.blocked = 0;
      return true;
    }
    m.detour = [];
  }

  const field = distanceField(state, goal.x, goal.y, a.mask);
  const curD = field[here];
  if (!Number.isFinite(curD)) {
    m.blocked += dt;
    return false;
  }

  // Neighbours that make progress, best first; equal-distance ones are sidesteps.
  let best = -1;
  let bestD = Infinity;
  let progress: { dx: number; dy: number; d: number }[] = [];
  const sidesteps: { dx: number; dy: number }[] = [];
  for (let k = 0; k < 8; k++) {
    const [dx, dy] = DIRS[k];
    if (!canStepStatic(l, m.x, m.y, dx, dy, a.mask)) continue;
    const n = (m.y + dy) * l.width + m.x + dx;
    const d = field[n];
    if (d < curD - 1e-6) {
      progress.push({ dx, dy, d });
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    } else if (Math.abs(d - curD) < 1e-6) {
      sidesteps.push({ dx, dy });
    }
  }
  progress = progress.sort((p, q) => p.d - q.d);

  for (const p of progress) {
    if (canStep(ctx, m.x, m.y, p.dx, p.dy, a.mask)) {
      startStep(ctx, a, m.x + p.dx, m.y + p.dy);
      m.blocked = 0;
      return true;
    }
  }

  // 1. Sidestep onto an equal-distance tile, once per blocked episode (doesn't
  //    reset the blocked timer).
  if (m.blocked < SIDESTEP_AFTER && m.blocked + dt >= SIDESTEP_AFTER) {
    for (const s of sidesteps) {
      if (canStep(ctx, m.x, m.y, s.dx, s.dy, a.mask)) {
        startStep(ctx, a, m.x + s.dx, m.y + s.dy);
        m.blocked += dt;
        return true;
      }
    }
  }

  // Who is in the way? Prefer the best tile; otherwise any progress tile (the
  // best tile may be free but a diagonal squeeze between two agents refused).
  const candidates: number[] = [];
  for (const p of progress) {
    candidates.push((m.y + p.dy) * l.width + m.x + p.dx);
    if (p.dx !== 0 && p.dy !== 0) {
      candidates.push(m.y * l.width + m.x + p.dx, (m.y + p.dy) * l.width + m.x);
    }
  }
  let blocker: AgentRef | null = null;
  let blockedTile = best;
  for (const tile of candidates) {
    const b = blockerAt(ctx, tile);
    if (b && b.id !== a.id) {
      blocker = b;
      blockedTile = tile;
      break;
    }
  }

  // Idle agents in the way step aside.
  if (blocker && blocker.canYield) yieldTile(ctx, blocker, [here, blockedTile]);

  // 2. Wait.
  const before = m.blocked;
  m.blocked += dt;

  // 3. Re-path around agents with a local A*, once per second while blocked.
  if (m.blocked >= REPATH_AFTER && Math.floor(m.blocked) !== Math.floor(before)) {
    const occupied = (i: number) => i !== here && ctx.occ.has(i);
    const path = findPath(state, m.x, m.y, goal.x, goal.y, occupied, DETOUR_MAX_EXPANSIONS, a.mask);
    if (path && path.length > 0 && path.length <= curD + 12) m.detour = path;
  }

  // 4. Squeeze past: swap tiles with a blocker that isn't busy working.
  const adjacent = blocker && Math.abs(blocker.m.x - m.x) <= 1 && Math.abs(blocker.m.y - m.y) <= 1;
  if (m.blocked >= SQUEEZE_AFTER && blocker && adjacent && blocker.canSwap && !blocker.m.step) {
    const bx = blocker.m.x;
    const by = blocker.m.y;
    startStep(ctx, blocker, m.x, m.y, SQUEEZE_PENALTY);
    startStep(ctx, a, bx, by, SQUEEZE_PENALTY);
    blocker.m.detour = [];
    m.blocked = 0;
    return true;
  }

  recordBlocked(state, here, dt);
  return false;
}

/**
 * Move every agent for one tick. Agents are processed in a fixed order so
 * results are reproducible.
 */
export function moveAgents(state: GameState, agents: AgentRef[], dt: number): void {
  const l = layout(state);
  const occ = new Occupancy();
  for (const a of agents) {
    occ.add(tileOf(l, a.m));
    if (a.m.step) occ.add(a.m.step.ty * l.width + a.m.step.tx);
  }
  const ordered = [...agents].sort((p, q) => p.order - q.order);
  const ctx: Ctx = { state, l, occ, agents: ordered };

  for (const a of ordered) {
    const m = a.m;
    let budget = dt;
    let guard = 0;
    while (budget > 1e-9 && guard++ < 4) {
      if (m.step) {
        m.step.t += budget;
        if (m.step.t < m.step.dur) {
          budget = 0;
          break;
        }
        budget = m.step.t - m.step.dur;
        occ.remove(tileOf(l, m));
        m.x = m.step.tx;
        m.y = m.step.ty;
        m.step = null;
        recordTraffic(state, tileOf(l, m));
        continue;
      }
      if (!m.goal || (m.x === m.goal.x && m.y === m.goal.y)) {
        m.blocked = 0;
        break;
      }
      if (!advance(ctx, a, budget)) break;
    }
  }
}
