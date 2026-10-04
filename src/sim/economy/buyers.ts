// Abstract buyers: until the front of house exists, customers are a flat stream
// that buys straight off the counters.

import { recipe } from '../../data/recipes';
import { BASE_TIP_FRACTION, BUYER_INTERVAL } from '../constants';
import { stockByRecipe, stockQuality, takeServing } from '../counters/counters';
import { randRange, weightedPick } from '../rng';
import type { GameState } from '../state';

/** More different dishes in stock draws more customers. */
export function varietyMult(distinctDishes: number): number {
  return distinctDishes <= 0 ? 0 : 1 + 0.15 * (distinctDishes - 1);
}

export function sellServing(state: GameState, recipeId: string): boolean {
  const q = takeServing(state, recipeId);
  if (q === null) return false;
  const r = recipe(recipeId);
  const price = r.pricePerServing;
  const tip = Math.round(price * BASE_TIP_FRACTION * q * 100) / 100;
  state.money += price + tip;
  state.stats.revenue += price;
  state.stats.tips += tip;
  state.stats.servingsSold++;
  state.stats.soldByRecipe[recipeId] = (state.stats.soldByRecipe[recipeId] ?? 0) + 1;
  return true;
}

export function tickBuyers(state: GameState, dt: number): void {
  const stock = stockByRecipe(state);
  const dishes = Object.keys(stock).filter((r) => stock[r] > 0);
  if (dishes.length === 0) {
    // Closed: nobody arrives, and the next buyer comes soon after reopening.
    state.nextBuyerIn = Math.min(state.nextBuyerIn, BUYER_INTERVAL * 0.5);
    return;
  }
  state.nextBuyerIn -= dt;
  if (state.nextBuyerIn > 0) return;
  const choice = weightedPick(state, dishes, (id) => recipe(id).appeal * (0.5 + (stockQuality(state, id) ?? 0)));
  if (choice) sellServing(state, choice);
  state.nextBuyerIn += (BUYER_INTERVAL * randRange(state, 0.6, 1.4)) / varietyMult(dishes.length);
}
