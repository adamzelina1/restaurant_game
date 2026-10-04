// A scripted "player" for headless runs. It serves ready batches promptly,
// learns recipes when it can afford them, and keeps cooking stations busy.
//
//   short / long / best  keep every station busy with the shortest, longest or
//                        highest-$/hour recipe, whatever the demand (stress cases)
//   smart                cooks what guests will actually eat before it goes stale,
//                        hires when guests are being lost, and buys upgrades

import { RECIPE_LIST, type BatchRecipe } from '../src/data/recipes';
import type { Command } from '../src/sim/commands';
import { counterStock } from '../src/sim/counters/counters';
import { guestRate } from '../src/sim/offline/offline';
import { batchServings, canStartBatch } from '../src/sim/production/batches';
import { nextTier, servingPrice, unlockError, upgradeError } from '../src/sim/progression/progression';
import { SIGNING_HOURS } from '../src/sim/constants';
import type { GameState, PlacedObject } from '../src/sim/state';

export type Strategy = 'short' | 'long' | 'best' | 'smart';

/** Money the bot keeps back for ingredients and wages when buying things. */
const RESERVE = 300;
const MAX_STAFF = 6;

function naiveRecipe(state: GameState, st: PlacedObject, strategy: Strategy): string | null {
  const options = RECIPE_LIST.filter((r) => r.station === st.type && !canStartBatch(state, st.id, r.id));
  if (options.length === 0) return null;
  const perHour = (r: BatchRecipe) => (r.servings * r.pricePerServing) / r.cookTime;
  options.sort((a, b) =>
    strategy === 'short' ? a.cookTime - b.cookTime : strategy === 'long' ? b.cookTime - a.cookTime : perHour(b) - perHour(a),
  );
  return options[0].id;
}

/** Servings of each recipe on counters or on their way (cooking, ready, carried). */
function pipeline(state: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const o of Object.values(state.objects)) {
    if (o.counter?.recipeId) out[o.counter.recipeId] = (out[o.counter.recipeId] ?? 0) + counterStock(o) - o.counter.reserved;
  }
  for (const b of Object.values(state.batches)) out[b.recipeId] = (out[b.recipeId] ?? 0) + b.servings;
  return out;
}

/** Counters that could take a new dish, after the batches already headed for one. */
function freeCounters(state: GameState): number {
  const onCounter = new Set<string>();
  let empty = 0;
  for (const o of Object.values(state.objects)) {
    if (!o.counter) continue;
    if (o.counter.recipeId) onCounter.add(o.counter.recipeId);
    else if (o.counter.incoming.length === 0) empty++;
  }
  const needing = new Set(Object.values(state.batches).map((b) => b.recipeId).filter((r) => !onCounter.has(r)));
  return empty - needing.size;
}

function smartRecipe(state: GameState, st: PlacedObject): string | null {
  const have = pipeline(state);
  const dishes = Object.values(have).filter((n) => n > 0).length;
  // Guests per second each dish can expect if we add one more.
  const perDish = guestRate(state, dishes + 1) / (dishes + 1);
  const counters = freeCounters(state);
  let best: string | null = null;
  let bestValue = 0;
  for (const r of RECIPE_LIST) {
    if (r.station !== st.type || canStartBatch(state, st.id, r.id)) continue;
    const stock = have[r.id] ?? 0;
    if (stock <= 0 && counters <= 0) continue;
    // Enough on hand to last until this batch would be ready (plus a buffer)?
    if (stock > perDish * (r.cookTime + 1800)) continue;
    const servings = batchServings(state, r.id, st);
    const sellable = Math.min(servings, perDish * (r.freshFor * 1.5 + r.cookTime));
    // Active recipes tie up a cook; count them at a discount.
    const value = ((sellable * servingPrice(state, r.id) - r.batchCost) / r.cookTime) * (r.cookMode === 'active' ? 0.5 : 1);
    if (value > bestValue) {
      bestValue = value;
      best = r.id;
    }
  }
  return best;
}

export function botCommands(state: GameState, strategy: Strategy): Command[] {
  const out: Command[] = [];
  for (const r of RECIPE_LIST) {
    if (!unlockError(state, r.id) && state.money >= r.unlock.cost + RESERVE) {
      out.push({ type: 'unlockRecipe', recipeId: r.id });
      return out;
    }
  }
  if (strategy === 'smart') {
    const staff = Object.keys(state.employees).length;
    // Hire when guests are walking out and there's money for it.
    const lostShare = state.stats.customersLost / Math.max(1, state.stats.customersLost + state.stats.customersServed);
    const c = state.hiring.candidates[0];
    if (c && staff < MAX_STAFF && lostShare > 0.1 && state.money > c.wage * SIGNING_HOURS + RESERVE * 2) {
      out.push({ type: 'hire', index: 0 });
      return out;
    }
    // Upgrade the cheapest station when comfortably rich.
    const ups = Object.values(state.objects)
      .map((o) => ({ o, n: nextTier(o) }))
      .filter((x) => x.n && !upgradeError(state, x.o) && state.money > x.n.cost * 2 + RESERVE * 3)
      .sort((a, b) => a.n!.cost - b.n!.cost);
    if (ups.length) out.push({ type: 'upgradeObject', id: ups[0].o.id });
  }
  for (const o of Object.values(state.objects)) {
    if (!o.cook) continue;
    const b = o.cook.batchId ? state.batches[o.cook.batchId] : null;
    if (!b) {
      const r = strategy === 'smart' ? smartRecipe(state, o) : naiveRecipe(state, o, strategy);
      if (!r) continue;
      out.push({ type: 'startBatch', stationId: o.id, recipeId: r });
      // One new batch per decision, so the next one sees it in the pipeline.
      if (strategy === 'smart') return out;
    } else if (b.phase === 'ready' && !b.serveRequested) {
      out.push({ type: 'serveBatch', stationId: o.id });
    }
  }
  return out;
}
