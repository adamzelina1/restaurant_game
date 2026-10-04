import { employeesAfterMove, employeesDecide, moveEmployees } from './agents/employees';
import { applyCommand, type Command } from './commands';
import { TICK_DT, TICK_RATE } from './constants';
import { tickBuyers } from './economy/buyers';
import { tickWages } from './economy/wages';
import { tickCooking } from './production/batches';
import { tickHiring } from './staff/hiring';
import type { GameState } from './state';
import { coolHeat } from './stations/stations';
import { refreshTasks } from './tasks/tasks';

/**
 * Advance the simulation by one fixed tick. Systems run in a fixed order
 * (PLAN §2.1) so a run is deterministic for a given seed and command stream.
 */
export function step(state: GameState, commands: readonly Command[] = []): void {
  for (const c of commands) applyCommand(state, c);
  const dt = TICK_DT;

  refreshTasks(state);
  employeesDecide(state, dt);
  moveEmployees(state, dt);
  employeesAfterMove(state, dt);
  tickCooking(state, dt);
  coolHeat(state, dt);
  tickBuyers(state, dt);
  tickWages(state, dt);
  tickHiring(state);

  state.tick++;
  state.time = state.tick / TICK_RATE;
}

/** Run `seconds` of simulation with no commands (tests, catch-up). */
export function runFor(state: GameState, seconds: number): void {
  const ticks = Math.round(seconds * TICK_RATE);
  for (let i = 0; i < ticks; i++) step(state);
}
