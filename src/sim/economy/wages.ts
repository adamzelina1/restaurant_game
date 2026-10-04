import { isOpenForBusiness } from '../foh/customers';
import type { GameState } from '../state';
import { values } from '../util';

/** Open while any counter has stock or guests are still inside (PLAN §6). */
export function isOpen(state: GameState): boolean {
  return isOpenForBusiness(state);
}

export function payrollPerHour(state: GameState): number {
  return values(state.employees).reduce((n, e) => n + e.wage, 0);
}

/** Wages are charged only while the restaurant is open. */
export function tickWages(state: GameState, dt: number): void {
  if (!isOpen(state)) return;
  const amount = (payrollPerHour(state) * dt) / 3600;
  state.money -= amount;
  state.stats.wagesPaid += amount;
}
