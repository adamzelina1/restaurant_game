// Task scripts. Each task kind is a short sequence of toils (walk, pick up, work,
// drop); `emp.toil` is the index of the current one, so a task survives saving.

import { recipe } from '../../data/recipes';
import { stationDef } from '../../data/stations';
import { clearGoal, isAt, setGoal } from '../agents/movement';
import { DROP_TIME, LOAD_TIME, PICKUP_TIME } from '../constants';
import { tidyCounter } from '../counters/counters';
import { workTile, type Tile } from '../grid/grid';
import { onCrateLoaded, readyBatchQuality } from '../production/batches';
import { empWorkSpeed, skillLevel } from '../skills';
import type { Employee, GameState, Task } from '../state';
import { message } from '../util';
import { abandonTask, claimTask, createTask, crateTile, deleteTask, potTile } from './tasks';

type R = 'wait' | 'next' | 'done' | 'fail';

interface Outcome {
  r: R;
  /** Task created by finishing this one, offered to the same employee first. */
  follow?: Task;
}

function goTo(emp: Employee, tile: Tile | null): R {
  if (!tile) return 'fail';
  if (isAt(emp, tile.x, tile.y)) {
    clearGoal(emp);
    return 'next';
  }
  setGoal(emp, tile.x, tile.y);
  emp.activity = 'walking';
  return 'wait';
}

function timed(emp: Employee, dur: number, dt: number): R {
  emp.activity = 'working';
  emp.toilTime += dt;
  return emp.toilTime >= dur - 1e-9 ? 'next' : 'wait';
}

function runDeliver(state: GameState, emp: Employee, t: Task, dt: number): Outcome {
  const c = state.crates[t.crateId!];
  const b = state.batches[t.batchId];
  const target = t.targetId ? state.objects[t.targetId] : null;
  if (!c || !b || !target) return { r: 'fail' };
  switch (emp.toil) {
    case 0: {
      if (c.loc.kind === 'source') {
        const src = t.sourceId ? state.objects[t.sourceId] : null;
        return { r: goTo(emp, src ? workTile(src) : null) };
      }
      if (c.loc.kind === 'carried') return { r: 'fail' };
      return { r: goTo(emp, crateTile(state, c.id)) };
    }
    case 1: {
      const r = timed(emp, PICKUP_TIME, dt);
      if (r === 'next') {
        if (c.loc.kind === 'station') {
          const st = state.objects[c.loc.id];
          if (st?.prep?.crateId === c.id) st.prep.crateId = null;
        }
        c.loc = { kind: 'carried', by: emp.id };
        emp.carrying = { kind: 'crate', id: c.id };
      }
      return { r };
    }
    case 2:
      return { r: goTo(emp, workTile(target)) };
    case 3: {
      const r = timed(emp, target.prep ? DROP_TIME : LOAD_TIME, dt);
      if (r !== 'next') return { r };
      emp.carrying = null;
      if (target.prep) {
        c.loc = { kind: 'station', id: target.id };
        target.prep.crateId = c.id;
        target.prep.reservedBy = null;
        return { r: 'done', follow: createTask(state, 'prep', 'Prep', b.id, c.id) };
      }
      c.loc = { kind: 'loaded' };
      const skill = stationDef(target.type).skill;
      if (skill) {
        b.cookSkillSum += skillLevel(emp, skill);
        b.cookSkillCount++;
      }
      onCrateLoaded(state, b);
      return { r: 'done' };
    }
  }
  return { r: 'fail' };
}

function runPrep(state: GameState, emp: Employee, t: Task, dt: number): Outcome {
  const c = state.crates[t.crateId!];
  const b = state.batches[t.batchId];
  const st = t.targetId ? state.objects[t.targetId] : null;
  if (!c || !b || !st || c.loc.kind !== 'station' || c.loc.id !== st.id) return { r: 'fail' };
  switch (emp.toil) {
    case 0:
      return { r: goTo(emp, workTile(st)) };
    case 1: {
      emp.activity = 'working';
      c.prepDone += dt * empWorkSpeed(emp, c.prepSkill!);
      if (c.prepDone + c.clickRemoved < c.prepTime) return { r: 'wait' };
      c.prepped = true;
      b.prepSkillSum += skillLevel(emp, c.prepSkill!);
      b.prepSkillCount++;
      return { r: 'done', follow: createTask(state, 'deliver', 'Cook', b.id, c.id) };
    }
  }
  return { r: 'fail' };
}

function runTend(state: GameState, emp: Employee, t: Task, dt: number): Outcome {
  const b = state.batches[t.batchId];
  const st = b ? state.objects[b.stationId] : null;
  if (!b || !st) return { r: 'fail' };
  if (b.phase !== 'cooking') return { r: 'done' };
  switch (emp.toil) {
    case 0:
      return { r: goTo(emp, workTile(st)) };
    case 1: {
      const skill = stationDef(st.type).skill ?? 'Saute';
      if (emp.toilTime === 0) {
        b.cookSkillSum += skillLevel(emp, skill);
        b.cookSkillCount++;
      }
      emp.activity = 'working';
      emp.toilTime += dt;
      b.cookDone += dt * empWorkSpeed(emp, skill);
      return { r: 'wait' };
    }
  }
  return { r: 'fail' };
}

function runCarryBatch(state: GameState, emp: Employee, t: Task, dt: number): Outcome {
  const b = state.batches[t.batchId];
  const counter = t.targetId ? state.objects[t.targetId] : null;
  if (!b || !counter?.counter) return { r: 'fail' };
  switch (emp.toil) {
    case 0:
      if (b.pot.kind === 'carried') return { r: 'fail' };
      return { r: goTo(emp, potTile(state, b.id)) };
    case 1: {
      const r = timed(emp, PICKUP_TIME, dt);
      if (r === 'next') {
        if (b.readyAt !== null) {
          // Lock in the quality lost while waiting to be served.
          b.quality = readyBatchQuality(state, b);
          b.readyAt = null;
        }
        if (b.pot.kind === 'station') {
          const st = state.objects[b.stationId];
          if (st?.cook?.batchId === b.id) st.cook.batchId = null;
        }
        b.pot = { kind: 'carried', by: emp.id };
        b.phase = 'carrying';
        emp.carrying = { kind: 'pot', id: b.id };
      }
      return { r };
    }
    case 2:
      return { r: goTo(emp, workTile(counter)) };
    case 3: {
      const r = timed(emp, DROP_TIME, dt);
      if (r !== 'next') return { r };
      const rec = recipe(b.recipeId);
      const cs = counter.counter;
      cs.recipeId = b.recipeId;
      cs.lots.push({ servings: b.servings, quality: b.quality, placedAt: state.time, freshFor: rec.freshFor });
      cs.incoming = cs.incoming.filter((id) => id !== t.id);
      tidyCounter(counter);
      emp.carrying = null;
      state.stats.batchesServed++;
      delete state.batches[b.id];
      message(state, `${b.servings} servings of ${rec.name} on the counter`);
      return { r: 'done' };
    }
  }
  return { r: 'fail' };
}

function runOnce(state: GameState, emp: Employee, t: Task, dt: number): Outcome {
  switch (t.kind) {
    case 'deliver':
      return runDeliver(state, emp, t, dt);
    case 'prep':
      return runPrep(state, emp, t, dt);
    case 'tend':
      return runTend(state, emp, t, dt);
    case 'carryBatch':
      return runCarryBatch(state, emp, t, dt);
  }
}

/** Run the employee's current task for one tick. */
export function runTask(state: GameState, emp: Employee, dt: number): void {
  for (let guard = 0; guard < 8; guard++) {
    const t = emp.taskId ? state.tasks[emp.taskId] : null;
    if (!t) {
      emp.taskId = null;
      return;
    }
    const out = runOnce(state, emp, t, dt);
    if (out.r === 'wait') return;
    if (out.r === 'next') {
      emp.toil++;
      emp.toilTime = 0;
      continue;
    }
    if (out.r === 'fail') {
      const valid = !!state.batches[t.batchId] && (!t.crateId || !!state.crates[t.crateId]);
      abandonTask(state, emp);
      if (!valid) deleteTask(state, t.id);
      return;
    }
    // done
    deleteTask(state, t.id);
    emp.taskId = null;
    emp.toil = 0;
    emp.toilTime = 0;
    // Chain straight into the follow-up (e.g. prep the crate you just brought).
    if (out.follow && emp.priorities[out.follow.workType] !== 0 && !emp.carrying) {
      if (claimTask(state, emp, out.follow)) continue;
    }
    return;
  }
}
