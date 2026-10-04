/** More different dishes in stock draws more guests (PLAN §6). */
export function varietyMult(distinctDishes: number): number {
  return distinctDishes <= 0 ? 0 : 1 + 0.15 * (distinctDishes - 1);
}
