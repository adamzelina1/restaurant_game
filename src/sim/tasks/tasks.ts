import { recipe } from '../../data/recipes';
import { stationDef } from '../../data/stations';
import { clearGoal } from '../agents/movement';
import { distance } from '../grid/distance';
import { workTile, type Tile } from '../grid/grid';
import { skillLevel } from '../skills';
import type { Employee, GameState, Id, PlacedObject, Skill, Task, TaskKind, WorkType } from '../state';
import { newId, values } from '../util';

export function createTask(
  state: GameState,
  kind: TaskKind,
  workType: WorkType,
  batchId: Id,
  crateId: Id | null,
  urgent = false,
): Task {
  const t: Task = {
    id: newId(state, 't'),
    kind,
    workType,
    status: 'blocked',
    claimedBy: null,
    createdAt: state.time,
    urgent,
    batchId,
    crateId,
    sourceId: null,
    targetId: null,
  };
  state.tasks[t.id] = t;
  refreshTask(state, t);
  return t;
}

export function deleteTask(state: GameState, id: Id): void {
  const t = state.tasks[id];
  if (!t) return;
  releaseReservations(state, t);
  delete state.tasks[id];
}

// ---------------------------------------------------------------------------
// Queries

export function objectsOfKind(state: GameState, kind: string): PlacedObject[] {
  return values(state.objects).filter((o) => stationDef(o.type).kind === kind);
}

function reachable(state: GameState, from: Tile, to: Tile): boolean {
  return Number.isFinite(distance(state, from.x, from.y, to.x, to.y));
}

function isFreePrepStation(o: PlacedObject): boolean {
  return !!o.prep && !o.prep.crateId && !o.prep.reservedBy;
}

/** Nearest free prep station of a type, measured from `from`. */
export function findFreePrepStation(state: GameState, type: string, from: Tile): PlacedObject | null {
  let best: PlacedObject | null = null;
  let bestD = Infinity;
  for (const o of values(state.objects)) {
    if (o.type !== type || !isFreePrepStation(o)) continue;
    const wt = workTile(o);
    const d = distance(state, from.x, from.y, wt.x, wt.y);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

function anyFreePrepStation(state: GameState, type: string): boolean {
  return values(state.objects).some((o) => o.type === type && isFreePrepStation(o));
}

/** Can this counter take servings of `recipeId` (now or once in-flight carries land)? */
export function counterAccepts(state: GameState, c: PlacedObject, recipeId: string): boolean {
  if (!c.counter) return false;
  if (c.counter.recipeId !== null) return c.counter.recipeId === recipeId;
  for (const tid of c.counter.incoming) {
    const t = state.tasks[tid];
    const b = t && state.batches[t.batchId];
    if (b && b.recipeId !== recipeId) return false;
  }
  return true;
}

function nearestCounterFor(state: GameState, recipeId: string, from: Tile): PlacedObject | null {
  let best: PlacedObject | null = null;
  let bestD = Infinity;
  for (const c of objectsOfKind(state, 'counter')) {
    if (!counterAccepts(state, c, recipeId)) continue;
    const wt = workTile(c);
    // Prefer counters already holding this dish so stock stacks.
    const d = distance(state, from.x, from.y, wt.x, wt.y) - (c.counter!.recipeId === recipeId ? 1000 : 0);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Nearest ingredient source (fridge) for a trip employee → source → dest. */
function bestSource(state: GameState, from: Tile, dest: Tile): PlacedObject | null {
  let best: PlacedObject | null = null;
  let bestD = Infinity;
  for (const s of objectsOfKind(state, 'source')) {
    const wt = workTile(s);
    const d = distance(state, from.x, from.y, wt.x, wt.y) + distance(state, wt.x, wt.y, dest.x, dest.y);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** Where a deliver task's crate currently is, as a tile. */
export function crateTile(state: GameState, crateId: Id): Tile | null {
  const c = state.crates[crateId];
  if (!c) return null;
  switch (c.loc.kind) {
    case 'floor':
      return { x: c.loc.x, y: c.loc.y };
    case 'station': {
      const o = state.objects[c.loc.id];
      return o ? workTile(o) : null;
    }
    case 'carried': {
      const e = state.employees[c.loc.by];
      return e ? { x: e.x, y: e.y } : null;
    }
    default:
      return null;
  }
}

export function potTile(state: GameState, batchId: Id): Tile | null {
  const b = state.batches[batchId];
  if (!b) return null;
  if (b.pot.kind === 'floor') return { x: b.pot.x, y: b.pot.y };
  if (b.pot.kind === 'carried') {
    const e = state.employees[b.pot.by];
    return e ? { x: e.x, y: e.y } : null;
  }
  const st = state.objects[b.stationId];
  return st ? workTile(st) : null;
}

// ---------------------------------------------------------------------------
// Task generation: refresh statuses from world state each tick.

function deliverDestinationIsCook(state: GameState, t: Task): boolean {
  const c = state.crates[t.crateId!];
  return !c.needsPrep || c.prepped;
}

export function refreshTask(state: GameState, t: Task): void {
  if (t.status === 'claimed') return;
  const batch = state.batches[t.batchId];
  if (!batch) {
    t.status = 'blocked';
    return;
  }
  switch (t.kind) {
    case 'deliver': {
      const c = state.crates[t.crateId!];
      // Prepped crates waiting on a prep station are loaded by cooks; raw
      // ingredients are fetched by haulers.
      t.workType = c.prepped && c.loc.kind === 'station' ? 'Cook' : 'Haul';
      if (deliverDestinationIsCook(state, t)) t.status = 'ready';
      else t.status = anyFreePrepStation(state, c.prepStation!) ? 'ready' : 'blocked';
      if (c.loc.kind === 'source' && objectsOfKind(state, 'source').length === 0) t.status = 'blocked';
      break;
    }
    case 'prep':
    case 'tend':
      t.status = 'ready';
      break;
    case 'carryBatch': {
      const ok = objectsOfKind(state, 'counter').some((c) => counterAccepts(state, c, batch.recipeId));
      t.status = ok ? 'ready' : 'blocked';
      break;
    }
  }
}

export function refreshTasks(state: GameState): void {
  for (const t of values(state.tasks)) refreshTask(state, t);
}

// ---------------------------------------------------------------------------
// Selection (PLAN §4.4): priority tiers first, then the best score in a tier.

/** First tile the employee must walk to for this task (for distance scoring). */
function taskAnchor(state: GameState, t: Task, emp: Employee): Tile | null {
  switch (t.kind) {
    case 'deliver': {
      const c = state.crates[t.crateId!];
      if (c.loc.kind === 'source') {
        let best: Tile | null = null;
        let bestD = Infinity;
        for (const s of objectsOfKind(state, 'source')) {
          const wt = workTile(s);
          const d = distance(state, emp.x, emp.y, wt.x, wt.y);
          if (d < bestD) {
            bestD = d;
            best = wt;
          }
        }
        return best;
      }
      return crateTile(state, c.id);
    }
    case 'prep': {
      const c = state.crates[t.crateId!];
      return crateTile(state, c.id);
    }
    case 'tend': {
      const st = state.objects[state.batches[t.batchId].stationId];
      return st ? workTile(st) : null;
    }
    case 'carryBatch':
      return potTile(state, t.batchId);
  }
}

export function scoreTask(state: GameState, t: Task, emp: Employee): number {
  const anchor = taskAnchor(state, t, emp);
  if (!anchor) return -Infinity;
  const d = distance(state, emp.x, emp.y, anchor.x, anchor.y);
  if (!Number.isFinite(d)) return -Infinity;
  let score = t.urgent ? 1000 : 0;
  // Older tasks gain a little urgency so nothing starves.
  score += Math.min(20, (state.time - t.createdAt) / 30);
  const sk = relevantSkill(state, t);
  if (sk) score += 0.5 * skillLevel(emp, sk);
  score -= d;
  return score;
}

function relevantSkill(state: GameState, t: Task): Skill | null {
  const b = state.batches[t.batchId];
  if (!b) return null;
  if (t.kind === 'prep') return state.crates[t.crateId!].prepSkill;
  if (t.kind === 'tend' || (t.kind === 'deliver' && t.workType === 'Cook')) {
    return stationDef(recipe(b.recipeId).station).skill ?? null;
  }
  return null;
}

/** Pick the best ready task for an idle employee, honouring priority tiers. */
export function pickTask(state: GameState, emp: Employee): Task | null {
  const ready = values(state.tasks).filter((t) => t.status === 'ready');
  if (ready.length === 0) return null;
  for (let tier = 1; tier <= 4; tier++) {
    const inTier = ready.filter((t) => emp.priorities[t.workType] === tier);
    if (inTier.length === 0) continue;
    const scored = inTier
      .map((t) => ({ t, s: scoreTask(state, t, emp) }))
      .filter((x) => Number.isFinite(x.s))
      .sort((a, b) => b.s - a.s);
    for (const { t } of scored) {
      if (claimTask(state, emp, t)) return t;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Claiming and releasing

/** Resolve source/target and take reservations. Returns false if impossible now. */
export function claimTask(state: GameState, emp: Employee, t: Task): boolean {
  if (t.status !== 'ready' || t.claimedBy) return false;
  const batch = state.batches[t.batchId];
  if (!batch) return false;
  const here = { x: emp.x, y: emp.y };

  switch (t.kind) {
    case 'deliver': {
      const c = state.crates[t.crateId!];
      const cookStation = state.objects[batch.stationId];
      let dest: PlacedObject | null;
      const from = crateTile(state, c.id) ?? here;
      if (c.needsPrep && !c.prepped) {
        dest = findFreePrepStation(state, c.prepStation!, from);
      } else {
        dest = cookStation;
      }
      if (!dest) return false;
      const destTile = workTile(dest);
      let source: PlacedObject | null = null;
      if (c.loc.kind === 'source') {
        source = bestSource(state, here, destTile);
        if (!source) return false;
        if (!reachable(state, here, workTile(source)) || !reachable(state, workTile(source), destTile)) return false;
      } else if (c.loc.kind === 'station') {
        source = state.objects[c.loc.id] ?? null;
      }
      if (!reachable(state, from, destTile)) return false;
      t.sourceId = source?.id ?? null;
      t.targetId = dest.id;
      if (dest.prep) dest.prep.reservedBy = t.id;
      break;
    }
    case 'prep': {
      const c = state.crates[t.crateId!];
      if (c.loc.kind !== 'station') return false;
      t.targetId = c.loc.id;
      break;
    }
    case 'tend':
      t.targetId = batch.stationId;
      break;
    case 'carryBatch': {
      const from = potTile(state, batch.id) ?? here;
      const counter = nearestCounterFor(state, batch.recipeId, from);
      if (!counter || !reachable(state, from, workTile(counter))) return false;
      t.targetId = counter.id;
      counter.counter!.incoming.push(t.id);
      break;
    }
  }
  t.status = 'claimed';
  t.claimedBy = emp.id;
  emp.taskId = t.id;
  emp.toil = 0;
  emp.toilTime = 0;
  return true;
}

function releaseReservations(state: GameState, t: Task): void {
  if (!t.targetId) return;
  const target = state.objects[t.targetId];
  if (target?.prep && target.prep.reservedBy === t.id) target.prep.reservedBy = null;
  if (target?.counter) target.counter.incoming = target.counter.incoming.filter((id) => id !== t.id);
}

/** Unclaim the task so someone else can pick it up. */
export function unclaimTask(state: GameState, t: Task): void {
  releaseReservations(state, t);
  t.status = 'blocked';
  t.claimedBy = null;
  t.sourceId = null;
  t.targetId = null;
  refreshTask(state, t);
}

/**
 * Make an employee drop whatever task they are doing. A carried crate or pot is
 * put down on their tile and its task goes back on the board.
 */
export function abandonTask(state: GameState, emp: Employee): void {
  const t = emp.taskId ? state.tasks[emp.taskId] : null;
  if (emp.carrying) {
    const x = emp.x;
    const y = emp.y;
    if (emp.carrying.kind === 'crate') {
      const c = state.crates[emp.carrying.id];
      if (c) c.loc = { kind: 'floor', x, y };
    } else {
      const b = state.batches[emp.carrying.id];
      if (b) b.pot = { kind: 'floor', x, y };
    }
    emp.carrying = null;
  }
  if (t) unclaimTask(state, t);
  emp.taskId = null;
  emp.toil = 0;
  emp.toilTime = 0;
  clearGoal(emp);
}
