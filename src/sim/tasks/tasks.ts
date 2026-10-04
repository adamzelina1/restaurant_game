import { recipe } from '../../data/recipes';
import { stationDef } from '../../data/stations';
import { clearGoal } from '../agents/movement';
import { PASS_CAPACITY } from '../constants';
import { breakPlates, discardPlates, nearestPit } from '../foh/dishes';
import { replate } from '../foh/service';
import { distance } from '../grid/distance';
import { objectsOfKind, objectsOfType, workTile, workTiles, type Tile } from '../grid/grid';
import { skillLevel } from '../skills';
import type { Employee, GameState, Id, PlacedObject, Skill, Task, TaskKind, WorkType } from '../state';
import { newId, values } from '../util';

export interface TaskRefs {
  batchId?: Id | null;
  crateId?: Id | null;
  partyId?: Id | null;
  customerId?: Id | null;
  objectId?: Id | null;
  urgent?: boolean;
}

export function createTask(state: GameState, kind: TaskKind, workType: WorkType, refs: TaskRefs): Task {
  const t: Task = {
    id: newId(state, 't'),
    kind,
    workType,
    status: 'blocked',
    claimedBy: null,
    createdAt: state.time,
    urgent: refs.urgent ?? false,
    batchId: refs.batchId ?? null,
    crateId: refs.crateId ?? null,
    partyId: refs.partyId ?? null,
    customerId: refs.customerId ?? null,
    objectId: refs.objectId ?? null,
    plate: false,
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
  for (const o of objectsOfType(state, type)) {
    if (!isFreePrepStation(o)) continue;
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
  return objectsOfType(state, type).some(isFreePrepStation);
}

/** Can this counter take servings of `recipeId` (now or once in-flight carries land)? */
export function counterAccepts(state: GameState, c: PlacedObject, recipeId: string): boolean {
  if (!c.counter) return false;
  if (c.counter.recipeId !== null) return c.counter.recipeId === recipeId;
  for (const tid of c.counter.incoming) {
    const t = state.tasks[tid];
    const b = t?.batchId ? state.batches[t.batchId] : null;
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

function passHasRoom(o: PlacedObject): boolean {
  return !!o.pass && o.pass.plates.length + o.pass.incoming.length < PASS_CAPACITY;
}

/** Kitchen side of the pass (where plates are put down). */
export function passKitchenTile(o: PlacedObject): Tile {
  return workTiles(o)[0];
}

/** Dining side of the pass (where servers pick plates up). */
export function passDiningTile(o: PlacedObject): Tile {
  const w = workTiles(o);
  return w[1] ?? w[0];
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

/** The service tile of a party's table, where waiters stand. */
export function tableTile(state: GameState, partyId: Id | null): Tile | null {
  const p = partyId ? state.parties[partyId] : null;
  const t = p?.tableId ? state.objects[p.tableId] : null;
  return t ? workTile(t) : null;
}

// ---------------------------------------------------------------------------
// Task generation: refresh statuses from world state each tick.

export function refreshTask(state: GameState, t: Task): void {
  if (t.status === 'claimed') return;
  t.status = isReady(state, t) ? 'ready' : 'blocked';
}

function isReady(state: GameState, t: Task): boolean {
  switch (t.kind) {
    case 'deliver': {
      const c = t.crateId ? state.crates[t.crateId] : null;
      if (!c || !t.batchId || !state.batches[t.batchId]) return false;
      // Prepped crates waiting on a prep station are loaded by cooks; raw
      // ingredients are fetched by haulers.
      t.workType = c.prepped && c.loc.kind === 'station' ? 'Cook' : 'Haul';
      if (c.loc.kind === 'source' && objectsOfKind(state, 'source').length === 0) return false;
      if (!c.needsPrep || c.prepped) return true;
      return anyFreePrepStation(state, c.prepStation!);
    }
    case 'prep':
    case 'tend':
      return !!t.batchId && !!state.batches[t.batchId];
    case 'carryBatch': {
      const b = t.batchId ? state.batches[t.batchId] : null;
      return !!b && objectsOfKind(state, 'counter').some((c) => counterAccepts(state, c, b.recipeId));
    }
    case 'takeOrder': {
      const p = t.partyId ? state.parties[t.partyId] : null;
      return !!p && p.phase === 'waitOrder' && !!tableTile(state, p.id);
    }
    case 'plate': {
      const c = t.customerId ? state.customers[t.customerId] : null;
      // Plating stalls when the clean-plate rack is empty (PLAN §6).
      return (
        !!c && !!c.dish && !!c.counterId && !c.plate && state.plates.clean > 0 && objectsOfKind(state, 'pass').some(passHasRoom)
      );
    }
    case 'serve': {
      const c = t.customerId ? state.customers[t.customerId] : null;
      return c?.plate?.at === 'pass';
    }
    case 'bus': {
      const o = t.objectId ? state.objects[t.objectId] : null;
      return !!o?.table && o.table.dirty > 0 && !o.table.partyId && objectsOfKind(state, 'dishpit').length > 0;
    }
    case 'wash': {
      const o = t.objectId ? state.objects[t.objectId] : null;
      return !!o?.dishPit && o.dishPit.dirty > 0;
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
    case 'prep':
      return crateTile(state, t.crateId!);
    case 'tend': {
      const st = state.objects[state.batches[t.batchId!].stationId];
      return st ? workTile(st) : null;
    }
    case 'carryBatch':
      return potTile(state, t.batchId!);
    case 'takeOrder':
      return tableTile(state, t.partyId);
    case 'plate': {
      const c = state.customers[t.customerId!];
      const counter = c?.counterId ? state.objects[c.counterId] : null;
      return counter ? workTile(counter) : null;
    }
    case 'serve': {
      const c = state.customers[t.customerId!];
      const pass = c?.plate?.passId ? state.objects[c.plate.passId] : null;
      return pass ? passDiningTile(pass) : null;
    }
    case 'bus':
    case 'wash': {
      const o = t.objectId ? state.objects[t.objectId] : null;
      return o ? workTile(o) : null;
    }
  }
}

export function scoreTask(state: GameState, t: Task, emp: Employee): number {
  const anchor = taskAnchor(state, t, emp);
  if (!anchor) return -Infinity;
  const d = distance(state, emp.x, emp.y, anchor.x, anchor.y);
  if (!Number.isFinite(d)) return -Infinity;
  let score = t.urgent ? 1000 : 0;
  // Older tasks gain a little urgency so nothing starves; hungry guests more so.
  const age = state.time - t.createdAt;
  score += t.partyId || t.customerId ? Math.min(40, age / 8) : Math.min(20, age / 30);
  const sk = relevantSkill(state, t);
  if (sk) score += 0.5 * skillLevel(emp, sk);
  score -= d;
  return score;
}

function relevantSkill(state: GameState, t: Task): Skill | null {
  switch (t.kind) {
    case 'takeOrder':
    case 'serve':
      return 'Service';
    case 'plate':
      return 'Plating';
    case 'prep':
      return state.crates[t.crateId!]?.prepSkill ?? null;
    case 'tend':
    case 'deliver': {
      if (t.kind === 'deliver' && t.workType !== 'Cook') return null;
      const b = t.batchId ? state.batches[t.batchId] : null;
      return b ? stationDef(recipe(b.recipeId).station).skill ?? null : null;
    }
    default:
      return null;
  }
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
  const here = { x: emp.x, y: emp.y };

  switch (t.kind) {
    case 'deliver': {
      const batch = state.batches[t.batchId!];
      const c = state.crates[t.crateId!];
      if (!batch || !c) return false;
      const from = crateTile(state, c.id) ?? here;
      const dest = c.needsPrep && !c.prepped ? findFreePrepStation(state, c.prepStation!, from) : state.objects[batch.stationId];
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
      if (!c || c.loc.kind !== 'station') return false;
      t.targetId = c.loc.id;
      break;
    }
    case 'tend': {
      const batch = state.batches[t.batchId!];
      if (!batch) return false;
      t.targetId = batch.stationId;
      break;
    }
    case 'carryBatch': {
      const batch = state.batches[t.batchId!];
      if (!batch) return false;
      const from = potTile(state, batch.id) ?? here;
      const counter = nearestCounterFor(state, batch.recipeId, from);
      if (!counter || !reachable(state, from, workTile(counter))) return false;
      t.targetId = counter.id;
      counter.counter!.incoming.push(t.id);
      break;
    }
    case 'takeOrder': {
      const tile = tableTile(state, t.partyId);
      if (!tile || !reachable(state, here, tile)) return false;
      t.targetId = state.parties[t.partyId!].tableId;
      break;
    }
    case 'plate': {
      const c = state.customers[t.customerId!];
      const counter = c?.counterId ? state.objects[c.counterId] : null;
      if (!c || !counter) return false;
      const ct = workTile(counter);
      if (!reachable(state, here, ct)) return false;
      let pass: PlacedObject | null = null;
      let bestD = Infinity;
      for (const o of objectsOfKind(state, 'pass')) {
        if (!passHasRoom(o)) continue;
        const pt = passKitchenTile(o);
        const d = distance(state, ct.x, ct.y, pt.x, pt.y);
        if (d < bestD) {
          bestD = d;
          pass = o;
        }
      }
      if (!pass || state.plates.clean <= 0) return false;
      t.sourceId = counter.id;
      t.targetId = pass.id;
      pass.pass!.incoming.push(t.id);
      state.plates.clean--;
      t.plate = true;
      break;
    }
    case 'bus': {
      const table = t.objectId ? state.objects[t.objectId] : null;
      if (!table) return false;
      const tt = workTile(table);
      const pit = nearestPit(state, tt);
      if (!pit || !reachable(state, here, tt) || !reachable(state, tt, workTile(pit))) return false;
      t.sourceId = table.id;
      t.targetId = pit.id;
      pit.dishPit!.incoming.push(t.id);
      break;
    }
    case 'wash': {
      const pit = t.objectId ? state.objects[t.objectId] : null;
      if (!pit || !reachable(state, here, workTile(pit))) return false;
      t.targetId = pit.id;
      break;
    }
    case 'serve': {
      const c = state.customers[t.customerId!];
      const pass = c?.plate?.passId ? state.objects[c.plate.passId] : null;
      const tile = c ? tableTile(state, c.partyId) : null;
      if (!c || !pass || !tile) return false;
      if (!reachable(state, here, passDiningTile(pass)) || !reachable(state, passDiningTile(pass), tile)) return false;
      t.sourceId = pass.id;
      t.targetId = state.parties[c.partyId].tableId;
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
  // An unused clean plate goes back on the rack.
  if (t.plate) {
    state.plates.clean++;
    t.plate = false;
  }
  if (!t.targetId) return;
  const target = state.objects[t.targetId];
  if (target?.prep && target.prep.reservedBy === t.id) target.prep.reservedBy = null;
  if (target?.counter) target.counter.incoming = target.counter.incoming.filter((id) => id !== t.id);
  if (target?.pass) target.pass.incoming = target.pass.incoming.filter((id) => id !== t.id);
  if (target?.dishPit) target.dishPit.incoming = target.dishPit.incoming.filter((id) => id !== t.id);
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
 * put down on their tile and its task goes back on the board. Food on a plate
 * is lost and the guest's dish is plated again if there's stock; the plate
 * goes to the dish pit, or breaks if it was `dropped`. So do carried dishes.
 */
export function abandonTask(state: GameState, emp: Employee, dropped = false): void {
  const t = emp.taskId ? state.tasks[emp.taskId] : null;
  let replateFor: Id | null = null;
  if (emp.carrying) {
    const x = emp.x;
    const y = emp.y;
    const carry = emp.carrying;
    if (carry.kind === 'crate') {
      const c = state.crates[carry.id];
      if (c) c.loc = { kind: 'floor', x, y };
    } else if (carry.kind === 'pot') {
      const b = state.batches[carry.id];
      if (b) b.pot = { kind: 'floor', x, y };
    } else if (carry.kind === 'dishes') {
      if (dropped) breakPlates(state, carry.n);
      else discardPlates(state, carry.n, carry.id);
    } else {
      replateFor = carry.id;
      const guest = state.customers[carry.id];
      if (guest) guest.plate = null;
      if (dropped) breakPlates(state, 1);
      else discardPlates(state, 1);
    }
    emp.carrying = null;
  }
  if (t) {
    if (replateFor) deleteTask(state, t.id);
    else unclaimTask(state, t);
  }
  if (replateFor) replate(state, replateFor);
  emp.taskId = null;
  emp.toil = 0;
  emp.toilTime = 0;
  clearGoal(emp);
}
