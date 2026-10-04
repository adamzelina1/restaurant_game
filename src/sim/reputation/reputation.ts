import { REP_RATE, REP_SAT_FLOOR } from '../constants';
import type { GameState } from '../state';
import { clamp } from '../util';

/** Stars a guest with this satisfaction (0–1) would give. Good food is what earns the top stars. */
export function starsFor(satisfaction: number): number {
  return 1 + 4 * clamp((satisfaction - REP_SAT_FLOOR) / (1 - REP_SAT_FLOOR), 0, 1);
}

/** Each guest's rating nudges the rolling star rating (1–5). */
export function rateVisit(state: GameState, satisfaction: number): void {
  const target = starsFor(satisfaction);
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
