// Front-of-house work (PLAN §6): take orders at the table, plate servings at
// the pass, carry plates to guests.

import { recipe } from '../../data/recipes';
import {
  EAT_TIME,
  ORDER_TIME_BASE,
  ORDER_TIME_PER_GUEST,
  PICKUP_TIME,
  PLATE_TIME,
  PLATING_BONUS_MAX,
  SERVE_TIME,
} from '../constants';
import { counterAvailable, counters, lotQuality, takeServingFrom } from '../counters/counters';
import { dishAppeal } from '../progression/progression';
import { randRange, weightedPick } from '../rng';
import { empWorkSpeed, skillLevel } from '../skills';
import { gainXp } from '../staff/xp';
import type { Customer, Employee, GameState, Id, Party, PlacedObject, Task } from '../state';
import { workTile } from '../grid/grid';
import { createTask, passDiningTile, passKitchenTile, tableTile } from '../tasks/tasks';
import { goTo, timed, type Outcome } from '../tasks/toils';
import { clamp, message } from '../util';

/** Average quality of a recipe's unpromised stock (for dish appeal). */
function availableQuality(state: GameState, recipeId: string): number {
  let n = 0;
  let q = 0;
  for (const c of counters(state)) {
    if (c.counter!.recipeId !== recipeId) continue;
    for (const l of c.counter!.lots) {
      n += l.servings;
      q += l.servings * lotQuality(state, l);
    }
  }
  return n ? q / n : 0;
}

/** Reserve one serving of `recipeId` on the counter with the most free stock. */
function reserveServing(state: GameState, recipeId: string): PlacedObject | null {
  let best: PlacedObject | null = null;
  for (const c of counters(state)) {
    if (c.counter!.recipeId !== recipeId || counterAvailable(c) <= 0) continue;
    if (!best || counterAvailable(c) > counterAvailable(best)) best = c;
  }
  if (best) best.counter!.reserved++;
  return best;
}

/**
 * Guests pick from what's in stock, weighted by appeal and freshness (PLAN §6),
 * and each choice reserves a serving so it can't be sold twice.
 */
export function chooseDishes(state: GameState, party: Party): void {
  for (const id of party.members) {
    const c = state.customers[id];
    if (!c) continue;
    const options = [...new Set(counters(state).map((o) => o.counter!.recipeId).filter((r): r is string => !!r))].filter(
      (r) => counters(state).some((o) => o.counter!.recipeId === r && counterAvailable(o) > 0),
    );
    const dish = weightedPick(state, options, (r) => dishAppeal(state, r) * (0.5 + availableQuality(state, r)));
    if (!dish) continue;
    const counter = reserveServing(state, dish);
    if (!counter) continue;
    c.dish = dish;
    c.counterId = counter.id;
    createTask(state, 'plate', 'Plate', { customerId: c.id, partyId: party.id });
  }
}

/** A plate was dropped or lost: plate again from stock if possible. */
export function replate(state: GameState, customerId: Id): void {
  const c = state.customers[customerId];
  const party = c ? state.parties[c.partyId] : null;
  if (!c || !party || party.phase === 'leaving' || !c.dish) return;
  c.plate = null;
  const counter = reserveServing(state, c.dish);
  if (counter) {
    c.counterId = counter.id;
    createTask(state, 'plate', 'Plate', { customerId: c.id, partyId: party.id });
  } else {
    message(state, `No ${recipe(c.dish).name.toLowerCase()} left to re-plate`, 'warn');
    c.dish = null;
    c.counterId = null;
  }
}

function partyOf(state: GameState, t: Task): Party | null {
  return t.partyId ? state.parties[t.partyId] ?? null : null;
}

function customerOf(state: GameState, t: Task): Customer | null {
  return t.customerId ? state.customers[t.customerId] ?? null : null;
}

export function runTakeOrder(state: GameState, emp: Employee, t: Task, dt: number): Outcome {
  const party = partyOf(state, t);
  if (!party || party.phase !== 'waitOrder') return { r: 'fail' };
  switch (emp.toil) {
    case 0:
      return { r: goTo(emp, tableTile(state, party.id)) };
    case 1: {
      const speed = empWorkSpeed(emp, 'Service');
      emp.workingSkill = 'Service';
      gainXp(state, emp, 'Service', dt);
      const r = timed(emp, ORDER_TIME_BASE + ORDER_TIME_PER_GUEST * party.size, dt, speed);
      if (r !== 'next') return { r };
      party.orderTakenAt = state.time;
      chooseDishes(state, party);
      const anyDish = party.members.some((id) => state.customers[id]?.dish);
      if (!anyDish) {
        message(state, 'Guests left: nothing left on the counters', 'warn');
        party.phase = 'eating'; // nothing to wait for: they settle up and go
      } else {
        party.phase = 'waitFood';
      }
      party.phaseTime = 0;
      return { r: 'done' };
    }
  }
  return { r: 'fail' };
}

export function runPlate(state: GameState, emp: Employee, t: Task, dt: number): Outcome {
  const c = customerOf(state, t);
  const party = c ? state.parties[c.partyId] : null;
  const counter = t.sourceId ? state.objects[t.sourceId] : null;
  const pass = t.targetId ? state.objects[t.targetId] : null;
  if (!c || !party || party.phase === 'leaving' || !counter || !pass?.pass) return { r: 'fail' };
  switch (emp.toil) {
    case 0:
      return { r: goTo(emp, workTile(counter)) };
    case 1: {
      const r = timed(emp, PICKUP_TIME, dt);
      if (r !== 'next') return { r };
      // Release the promise first so an emptied counter frees up.
      if (counter.counter) counter.counter.reserved = Math.max(0, counter.counter.reserved - 1);
      const q = takeServingFrom(state, counter);
      if (q === null) return { r: 'fail' };
      c.plate = { quality: q, at: 'carried', passId: null };
      t.plate = false;
      emp.carrying = { kind: 'plate', id: c.id };
      return { r };
    }
    case 2:
      return { r: goTo(emp, passKitchenTile(pass)) };
    case 3: {
      const speed = empWorkSpeed(emp, 'Plating');
      emp.workingSkill = 'Plating';
      gainXp(state, emp, 'Plating', dt);
      const r = timed(emp, PLATE_TIME, dt, speed);
      if (r !== 'next') return { r };
      // Presentation bonus from Plating skill (PLAN §4.7).
      const bonus = (PLATING_BONUS_MAX * skillLevel(emp, 'Plating')) / 20;
      c.plate = { quality: clamp(c.plate!.quality + bonus, 0, 1), at: 'pass', passId: pass.id };
      pass.pass.incoming = pass.pass.incoming.filter((id) => id !== t.id);
      pass.pass.plates.push(c.id);
      emp.carrying = null;
      return { r: 'done', follow: createTask(state, 'serve', 'Serve', { customerId: c.id, partyId: party.id }) };
    }
  }
  return { r: 'fail' };
}

export function runServe(state: GameState, emp: Employee, t: Task, dt: number): Outcome {
  const c = customerOf(state, t);
  const party = c ? state.parties[c.partyId] : null;
  const pass = t.sourceId ? state.objects[t.sourceId] : null;
  if (!c || !party || party.phase === 'leaving' || !pass?.pass) return { r: 'fail' };
  switch (emp.toil) {
    case 0:
      if (c.plate?.at !== 'pass') return { r: 'fail' };
      return { r: goTo(emp, passDiningTile(pass)) };
    case 1: {
      const r = timed(emp, PICKUP_TIME / 2, dt);
      if (r !== 'next') return { r };
      pass.pass.plates = pass.pass.plates.filter((id) => id !== c.id);
      c.plate = { ...c.plate!, at: 'carried', passId: null };
      emp.carrying = { kind: 'plate', id: c.id };
      return { r };
    }
    case 2:
      return { r: goTo(emp, tableTile(state, party.id)) };
    case 3: {
      emp.workingSkill = 'Service';
      gainXp(state, emp, 'Service', dt);
      const r = timed(emp, SERVE_TIME, dt);
      if (r !== 'next') return { r };
      c.plate = { ...c.plate!, at: 'table' };
      c.servedAt = state.time;
      c.servedBy = emp.id;
      c.eatLeft = EAT_TIME * randRange(state, 0.7, 1.3);
      emp.carrying = null;
      return { r: 'done' };
    }
  }
  return { r: 'fail' };
}
