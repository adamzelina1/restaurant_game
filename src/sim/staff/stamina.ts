import { clearGoal, isAt, setGoal } from '../agents/movement';
import {
  BREAK_AT,
  COFFEE_BOOST,
  COFFEE_RANGE,
  PASSION_DRAIN,
  STAMINA_DRAIN_WORK,
  STAMINA_IDLE_FACTOR,
  STAMINA_RECOVER,
  STAMINA_WALK_FACTOR,
} from '../constants';
import { distance } from '../grid/distance';
import { objectsOfKind, workTiles, type Tile } from '../grid/grid';
import type { Employee, GameState, Id } from '../state';
import { clamp, values } from '../util';
import { traitDrainMult } from './traits';

export interface Seat extends Tile {
  objectId: Id;
  seat: number;
}

export function restSeats(state: GameState): Seat[] {
  const out: Seat[] = [];
  for (const o of objectsOfKind(state, 'rest')) {
    workTiles(o).forEach((t, i) => out.push({ ...t, objectId: o.id, seat: i }));
  }
  return out;
}

function seatTaken(state: GameState, s: Seat, exceptId: Id): boolean {
  return values(state.employees).some(
    (e) => e.id !== exceptId && e.onBreak?.objectId === s.objectId && e.onBreak.seat === s.seat,
  );
}

export function needsBreak(emp: Employee): boolean {
  return emp.stamina.current < BREAK_AT;
}

/** Claim the nearest free rest seat. Returns false if the staff room is full. */
export function startBreak(state: GameState, emp: Employee): boolean {
  let best: Seat | null = null;
  let bestD = Infinity;
  for (const s of restSeats(state)) {
    if (seatTaken(state, s, emp.id)) continue;
    const d = distance(state, emp.x, emp.y, s.x, s.y);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  if (!best) return false;
  emp.onBreak = { objectId: best.objectId, seat: best.seat };
  return true;
}

function seatTile(state: GameState, emp: Employee): Tile | null {
  const ob = emp.onBreak;
  const o = ob ? state.objects[ob.objectId] : null;
  return o ? workTiles(o)[ob!.seat] ?? null : null;
}

export function isResting(state: GameState, emp: Employee): boolean {
  const t = seatTile(state, emp);
  return !!t && isAt(emp, t.x, t.y);
}

/** Walk to the seat and rest. Returns true while still on break. */
export function runBreak(state: GameState, emp: Employee): boolean {
  const t = seatTile(state, emp);
  if (!t) {
    emp.onBreak = null;
    return false;
  }
  if (emp.stamina.current >= emp.stamina.max - 1e-6) {
    emp.onBreak = null;
    clearGoal(emp);
    return false;
  }
  emp.activity = 'break';
  if (isAt(emp, t.x, t.y)) clearGoal(emp);
  else setGoal(emp, t.x, t.y);
  return true;
}

/** Coffee machines near the resting employee speed up recovery. */
function recoveryMult(state: GameState, emp: Employee): number {
  let n = 0;
  for (const o of objectsOfKind(state, 'boost')) {
    if (Math.max(Math.abs(o.x - emp.x), Math.abs(o.y - emp.y)) <= COFFEE_RANGE) n++;
  }
  return 1 + COFFEE_BOOST * Math.min(2, n);
}

export function tickStamina(state: GameState, emp: Employee, dt: number): void {
  const st = emp.stamina;
  let delta = 0;
  switch (emp.activity) {
    case 'working': {
      const passion = emp.workingSkill ? emp.skills[emp.workingSkill].passion : 0;
      delta = -STAMINA_DRAIN_WORK * st.drainRate * traitDrainMult(emp) * PASSION_DRAIN[passion];
      break;
    }
    case 'walking':
    case 'blocked':
      delta = -STAMINA_DRAIN_WORK * STAMINA_WALK_FACTOR * st.drainRate * traitDrainMult(emp);
      break;
    case 'idle':
      delta = STAMINA_RECOVER * STAMINA_IDLE_FACTOR * st.recoverRate;
      break;
    case 'break':
      if (isResting(state, emp)) delta = STAMINA_RECOVER * st.recoverRate * recoveryMult(state, emp);
      else delta = -STAMINA_DRAIN_WORK * STAMINA_WALK_FACTOR * st.drainRate * traitDrainMult(emp);
      break;
  }
  st.current = clamp(st.current + delta * dt, 0, st.max);
}
