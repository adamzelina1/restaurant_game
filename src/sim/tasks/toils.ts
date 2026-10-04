// Building blocks for task scripts. A toil returns:
//   'wait' – keep doing this next tick, 'next' – move to the next toil,
//   'done' – the task is finished, 'fail' – the task can't continue.

import { clearGoal, isAt, setGoal } from '../agents/movement';
import type { Tile } from '../grid/grid';
import type { Employee, Task } from '../state';

export type R = 'wait' | 'next' | 'done' | 'fail';

export interface Outcome {
  r: R;
  /** Task created by finishing this one, offered to the same employee first. */
  follow?: Task;
}

export function goTo(emp: Employee, tile: Tile | null): R {
  if (!tile) return 'fail';
  if (isAt(emp, tile.x, tile.y)) {
    clearGoal(emp);
    return 'next';
  }
  setGoal(emp, tile.x, tile.y);
  emp.activity = 'walking';
  return 'wait';
}

/** A fixed-length action; `speed` scales progress (skill). */
export function timed(emp: Employee, dur: number, dt: number, speed = 1): R {
  emp.activity = 'working';
  emp.toilTime += dt * speed;
  return emp.toilTime >= dur - 1e-9 ? 'next' : 'wait';
}
