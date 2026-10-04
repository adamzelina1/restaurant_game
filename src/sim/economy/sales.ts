import type { GameState } from '../state';

/** Money and stats for one serving sold to a guest. */
export function recordSale(state: GameState, recipeId: string, price: number, tip: number): void {
  state.money += price + tip;
  state.stats.revenue += price;
  state.stats.tips += tip;
  state.stats.servingsSold++;
  state.stats.soldByRecipe[recipeId] = (state.stats.soldByRecipe[recipeId] ?? 0) + 1;
  state.stats.customersServed++;
}
