// FOH phase 2 (PLAN §6): tables are left dirty, bussers carry the dishes to
// the dish pit, dishwashers wash them back onto the clean-plate rack that
// plating draws from.

import {
  BUS_TIME_BASE,
  BUS_TIME_PER_PLATE,
  DROP_TIME,
  PLATE_PACK,
  PLATE_PACK_COST,
  WASH_CHUNK,
  WASH_TIME,
} from '../constants';
import { distance } from '../grid/distance';
import { objectsOfKind, workTile, type Tile } from '../grid/grid';
import { tierSpeed } from '../production/batches';
import type { Employee, GameState, Id, PlacedObject, Task } from '../state';
import { createTask } from '../tasks/tasks';
import { goTo, timed, type Outcome } from '../tasks/toils';
import { message, spend, values } from '../util';

export function dishPits(state: GameState): PlacedObject[] {
  return objectsOfKind(state, 'dishpit');
}

/** Nearest dish pit to a tile, or null. */
export function nearestPit(state: GameState, from: Tile): PlacedObject | null {
  let best: PlacedObject | null = null;
  let bestD = Infinity;
  for (const p of dishPits(state)) {
    const wt = workTile(p);
    const d = distance(state, from.x, from.y, wt.x, wt.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/**
 * Dirty plates that didn't come off a table (scraped food, a waiter turned
 * back) go straight into a dish pit; with no pit they're rinsed on the spot.
 */
export function discardPlates(state: GameState, n: number, pitId: Id | null = null): void {
  if (n <= 0) return;
  const byId = pitId ? state.objects[pitId] : null;
  const pit = byId?.dishPit ? byId : dishPits(state)[0];
  if (pit?.dishPit) pit.dishPit.dirty += n;
  else state.plates.clean += n;
}

export function breakPlates(state: GameState, n: number): void {
  state.plates.total = Math.max(0, state.plates.total - n);
  state.stats.platesBroken += n;
}

export function buyPlates(state: GameState): boolean {
  if (!spend(state, PLATE_PACK_COST)) {
    message(state, `${PLATE_PACK} plates cost $${PLATE_PACK_COST}`, 'warn');
    return false;
  }
  state.plates.total += PLATE_PACK;
  state.plates.clean += PLATE_PACK;
  return true;
}

/** The wash task for a pit, created if missing. */
export function washTaskFor(state: GameState, pit: PlacedObject): Task {
  for (const t of values(state.tasks)) if (t.kind === 'wash' && t.objectId === pit.id) return t;
  return createTask(state, 'wash', 'Dishes', { objectId: pit.id });
}

/** Every dirty table gets a Bus task and every pit with dishes a Dishes task. */
export function generateDishTasks(state: GameState): void {
  const has = new Set<Id>();
  for (const t of values(state.tasks)) if (t.objectId) has.add(t.objectId);
  for (const o of objectsOfKind(state, 'table')) {
    if (o.table!.dirty > 0 && !has.has(o.id)) createTask(state, 'bus', 'Bus', { objectId: o.id });
  }
  for (const p of dishPits(state)) {
    if (p.dishPit!.dirty > 0 && !has.has(p.id)) createTask(state, 'wash', 'Dishes', { objectId: p.id });
  }
}

/** Plates on the table, in use by guests, carried, dirty or clean: all of them. */
export function platesAccountedFor(state: GameState): number {
  let n = state.plates.clean;
  for (const o of values(state.objects)) n += (o.table?.dirty ?? 0) + (o.dishPit?.dirty ?? 0);
  for (const c of values(state.customers)) if (c.plate) n++;
  for (const e of values(state.employees)) if (e.carrying?.kind === 'dishes') n += e.carrying.n;
  for (const t of values(state.tasks)) if (t.plate) n++;
  return n;
}

export function runBus(state: GameState, emp: Employee, t: Task, dt: number): Outcome {
  const table = t.objectId ? state.objects[t.objectId] : null;
  const pit = t.targetId ? state.objects[t.targetId] : null;
  if (!pit?.dishPit) return { r: 'fail' };
  switch (emp.toil) {
    case 0:
      if (!table?.table || table.table.dirty <= 0) return { r: table ? 'done' : 'fail' };
      return { r: goTo(emp, workTile(table)) };
    case 1: {
      if (!table?.table) return { r: 'fail' };
      const r = timed(emp, BUS_TIME_BASE + BUS_TIME_PER_PLATE * table.table.dirty, dt);
      if (r !== 'next') return { r };
      const n = table.table.dirty;
      table.table.dirty = 0;
      if (n <= 0) return { r: 'done' };
      emp.carrying = { kind: 'dishes', id: pit.id, n };
      return { r };
    }
    case 2:
      return { r: goTo(emp, workTile(pit)) };
    case 3: {
      const r = timed(emp, DROP_TIME, dt);
      if (r !== 'next') return { r };
      if (emp.carrying?.kind === 'dishes') pit.dishPit.dirty += emp.carrying.n;
      emp.carrying = null;
      pit.dishPit.incoming = pit.dishPit.incoming.filter((id) => id !== t.id);
      // Whoever brought the dishes can wash them straight away.
      return { r: 'done', follow: washTaskFor(state, pit) };
    }
  }
  return { r: 'fail' };
}

/** Wash plates one at a time; `emp.toil - 1` counts the plates washed so far. */
export function runWash(state: GameState, emp: Employee, t: Task, dt: number): Outcome {
  const pit = t.objectId ? state.objects[t.objectId] : null;
  if (!pit?.dishPit) return { r: 'fail' };
  if (emp.toil === 0) return { r: goTo(emp, workTile(pit)) };
  if (pit.dishPit.dirty <= 0) return { r: 'done' };
  const r = timed(emp, WASH_TIME, dt, tierSpeed(pit.tier));
  if (r !== 'next') return { r };
  pit.dishPit.dirty--;
  state.plates.clean++;
  if (emp.toil >= WASH_CHUNK || pit.dishPit.dirty <= 0) return { r: 'done' };
  emp.toil++;
  emp.toilTime = 0;
  return { r: 'wait' };
}
