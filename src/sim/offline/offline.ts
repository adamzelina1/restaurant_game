import { TICK_RATE } from '../constants';
import type { GameState } from '../state';
import { step } from '../step';

/** Longest absence that is caught up. */
export const OFFLINE_CAP = 24 * 3600;

/**
 * Catch up after a long absence. Placeholder until the coarse event model
 * (PLAN §9, milestone M8): runs the full tick simulation, which is exact but
 * slower.
 */
export function offlineCatchUp(state: GameState, elapsed: number): void {
  const ticks = Math.round(Math.min(elapsed, OFFLINE_CAP) * TICK_RATE);
  for (let i = 0; i < ticks; i++) step(state);
}
