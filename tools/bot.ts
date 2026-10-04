// A scripted "player" for headless runs: keeps every cooking station busy with a
// chosen recipe and serves ready batches promptly.

import { RECIPE_LIST } from '../src/data/recipes';
import type { Command } from '../src/sim/commands';
import { canStartBatch } from '../src/sim/production/batches';
import { unlockError } from '../src/sim/progression/progression';
import type { GameState } from '../src/sim/state';

export type Strategy = 'short' | 'long' | 'best';

/** Recipe to cook on a station type under a strategy. */
function chooseRecipe(state: GameState, stationType: string, strategy: Strategy, stationId: string): string | null {
  const options = RECIPE_LIST.filter((r) => r.station === stationType && !canStartBatch(state, stationId, r.id));
  if (options.length === 0) return null;
  const perHour = (r: (typeof RECIPE_LIST)[number]) => (r.servings * r.pricePerServing) / r.cookTime;
  options.sort((a, b) =>
    strategy === 'short' ? a.cookTime - b.cookTime : strategy === 'long' ? b.cookTime - a.cookTime : perHour(b) - perHour(a),
  );
  return options[0].id;
}

/** Money the bot keeps back for ingredients when buying unlocks. */
const RESERVE = 300;

export function botCommands(state: GameState, strategy: Strategy): Command[] {
  const out: Command[] = [];
  for (const r of RECIPE_LIST) {
    if (!unlockError(state, r.id) && state.money >= r.unlock.cost + RESERVE) {
      out.push({ type: 'unlockRecipe', recipeId: r.id });
      return out;
    }
  }
  for (const o of Object.values(state.objects)) {
    if (!o.cook) continue;
    const b = o.cook.batchId ? state.batches[o.cook.batchId] : null;
    if (!b) {
      const r = chooseRecipe(state, o.type, strategy, o.id);
      if (r) out.push({ type: 'startBatch', stationId: o.id, recipeId: r });
    } else if (b.phase === 'ready' && !b.serveRequested) {
      out.push({ type: 'serveBatch', stationId: o.id });
    }
  }
  return out;
}
