import { employeeAgents, employeesAfterMove, employeesDecide } from './agents/employees';
import { moveAgents } from './agents/movement';
import { applyCommand, type Command } from './commands';
import { TICK_DT, TICK_RATE } from './constants';
import { tickWages } from './economy/wages';
import { tickCooking } from './production/batches';
import { tickHiring } from './staff/hiring';
import type { GameState } from './state';
import { coolHeat } from './stations/stations';
import { customerAgents, customersAfterMove, customersDecide, tickArrivals } from './foh/customers';
import { generateDishTasks } from './foh/dishes';
import { refreshTasks } from './tasks/tasks';

/**
 * Advance the simulation by one fixed tick. Systems run in a fixed order
 * (PLAN §2.1) so a run is deterministic for a given seed and command stream.
 */
export function step(state: GameState, commands: readonly Command[] = []): void {
  for (const c of commands) applyCommand(state, c);
  const dt = TICK_DT;

  tickArrivals(state, dt);
  customersDecide(state, dt);
  generateDishTasks(state);
  refreshTasks(state);
  employeesDecide(state, dt);
  // Staff and guests share one blocking pass so they block each other (PLAN §6).
  moveAgents(state, [...employeeAgents(state), ...customerAgents(state)], dt);
  employeesAfterMove(state, dt);
  customersAfterMove(state);
  tickCooking(state, dt);
  coolHeat(state, dt);
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
