// Rolling online measurements for the offline model (PLAN §9): how much
// front-of-house labor a guest takes, how long tables turn over, and how
// happy guests are.

import { OFFLINE_FOH_SHARE, OFFLINE_SEAT_FILL, ROLLING_ALPHA, ROLLING_WINDOW } from '../constants';
import { objectsOfKind, seatTiles } from '../grid/grid';
import type { Batch, GameState, TaskKind, WorkType } from '../state';
import { values } from '../util';

const FOH_TASKS: TaskKind[] = ['takeOrder', 'plate', 'serve', 'bus', 'wash'];
const FOH_WORK: WorkType[] = ['Orders', 'Serve', 'Plate', 'Bus', 'Dishes'];

/** Count staff time spent on front-of-house tasks, decaying older measurements. */
export function tickRolling(state: GameState, dt: number): void {
  const r = state.rolling;
  const k = Math.exp(-dt / ROLLING_WINDOW);
  r.fohWork *= k;
  r.fohGuests *= k;
  for (const e of values(state.employees)) {
    const t = e.taskId ? state.tasks[e.taskId] : null;
    if (t && FOH_TASKS.includes(t.kind)) r.fohWork += dt;
  }
}

/** A guest paid for a served dish. */
export function recordGuest(state: GameState, satisfaction: number, quality: number, tipFrac: number): void {
  const r = state.rolling;
  r.fohGuests += 1;
  r.satisfaction += (satisfaction - r.satisfaction) * ROLLING_ALPHA;
  r.quality += (quality - r.quality) * ROLLING_ALPHA;
  r.tipFrac += (tipFrac - r.tipFrac) * ROLLING_ALPHA;
}

/** A party left its table after `seconds`. */
export function recordSeating(state: GameState, seconds: number): void {
  state.rolling.seatTime += (seconds - state.rolling.seatTime) * 4 * ROLLING_ALPHA;
}

/** A batch finished loading: how long did its crates take? */
export function recordLoad(state: GameState, b: Batch): void {
  if (b.crates.length === 0) return;
  const per = (state.time - b.startedAt) / b.crates.length;
  state.rolling.loadPerCrate += (per - state.rolling.loadPerCrate) * 4 * ROLLING_ALPHA;
}

/**
 * Guests per second the restaurant can serve with nobody watching: the lower
 * of what the front-of-house staff can handle and how fast tables turn over.
 */
export function serviceRate(state: GameState): number {
  const r = state.rolling;
  const laborPerGuest = r.fohGuests > 0.5 ? r.fohWork / r.fohGuests : 40;
  const staff = values(state.employees).filter((e) => FOH_WORK.some((w) => e.priorities[w] > 0)).length;
  const labor = (staff * OFFLINE_FOH_SHARE) / Math.max(5, laborPerGuest);
  let seats = 0;
  for (const t of objectsOfKind(state, 'table')) seats += seatTiles(t).length;
  const tables = (seats * OFFLINE_SEAT_FILL) / Math.max(30, r.seatTime);
  return Math.min(labor, tables);
}
