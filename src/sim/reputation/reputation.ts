import { REP_RATE } from '../constants';
import type { GameState } from '../state';
import { clamp } from '../util';

/** Each guest's satisfaction (0–1) nudges the rolling star rating (1–5). */
export function rateVisit(state: GameState, satisfaction: number): void {
  const target = 1 + 4 * clamp(satisfaction, 0, 1);
  state.reputation = clamp(state.reputation + (target - state.reputation) * REP_RATE, 1, 5);
}

/** Whole stars earned, for unlocks and display. */
export function stars(state: GameState): number {
  return Math.floor(state.reputation + 1e-9);
}

/** Better reputation brings more guests (PLAN §6 flat traffic). */
export function reputationTrafficMult(state: GameState): number {
  return 0.6 + 0.2 * state.reputation;
}
