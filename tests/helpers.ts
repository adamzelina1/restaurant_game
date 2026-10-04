import { RECIPE_LIST } from '../src/data/recipes';
import { newGame } from '../src/sim/newGame';
import { step } from '../src/sim/step';
import type { GameState, PlacedObject } from '../src/sim/state';

export function objOfType(state: GameState, type: string, n = 0): PlacedObject {
  const list = Object.values(state.objects).filter((o) => o.type === type);
  if (!list[n]) throw new Error(`No ${type} #${n}`);
  return list[n];
}

/** Step until `pred` is true; returns seconds simulated. Throws after `maxSeconds`. */
export function runUntil(state: GameState, pred: () => boolean, maxSeconds: number): number {
  const start = state.time;
  while (!pred()) {
    if (state.time - start > maxSeconds) throw new Error(`Condition not met within ${maxSeconds}s`);
    step(state);
  }
  return state.time - start;
}

/** A new game with every recipe unlocked (for tests about cooking, not progression). */
export function unlockedGame(seed?: number): GameState {
  const s = newGame(seed);
  s.unlockedRecipes = RECIPE_LIST.map((r) => r.id);
  return s;
}
