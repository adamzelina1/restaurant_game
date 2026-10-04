import type { Skill } from '../sim/state';

export interface IngredientLine {
  ingredient: string;
  /** One fetch trip (and one prep step, if any) per crate. */
  crates: number;
  prep?: { station: string; skill: Skill; verb: string; timePerCrate: number };
}

export interface BatchRecipe {
  id: string;
  name: string;
  station: string;
  /** Seconds of cooking at tier 1. */
  cookTime: number;
  /** Active recipes only cook while an employee tends the station. */
  cookMode: 'passive' | 'active';
  servings: number;
  pricePerServing: number;
  /** Ingredient cost, paid when the batch starts. */
  batchCost: number;
  ingredients: IngredientLine[];
  /** Seconds servings stay at full quality on the counter. */
  freshFor: number;
  /** Customer appeal weight. */
  appeal: number;
  unlock: { cost: number; minStars: number };
  /** Batches served to reach each mastery star (PLAN §7.1). */
  mastery: [number, number, number, number, number];
  color: number;
}

const MIN = 60;
const H = 3600;

const board = (verb: string, t: number) => ({ station: 'cuttingBoard', skill: 'Prep' as Skill, verb, timePerCrate: t });
const bench = (verb: string, t: number) => ({ station: 'mixingBench', skill: 'Baking' as Skill, verb, timePerCrate: t });

export const RECIPE_LIST: BatchRecipe[] = [
  {
    id: 'friedEggs', name: 'Fried eggs', station: 'stove', cookTime: 3 * MIN, cookMode: 'active',
    servings: 6, pricePerServing: 5, batchCost: 9,
    ingredients: [{ ingredient: 'eggs', crates: 1 }],
    freshFor: 10 * MIN, appeal: 1, unlock: { cost: 0, minStars: 0 },
    mastery: [5, 15, 40, 80, 160], color: 0xfff2cc,
  },
  {
    id: 'pancakes', name: 'Pancakes', station: 'stove', cookTime: 15 * MIN, cookMode: 'passive',
    servings: 12, pricePerServing: 6, batchCost: 22,
    ingredients: [
      { ingredient: 'flour', crates: 1, prep: bench('mix batter', 20) },
      { ingredient: 'eggs', crates: 1 },
      { ingredient: 'milk', crates: 1 },
    ],
    freshFor: 30 * MIN, appeal: 1, unlock: { cost: 0, minStars: 0 },
    mastery: [3, 8, 20, 40, 80], color: 0xf6b26b,
  },
  {
    id: 'burgers', name: 'Burgers', station: 'grill', cookTime: 1 * H, cookMode: 'passive',
    servings: 30, pricePerServing: 8, batchCost: 70,
    ingredients: [
      { ingredient: 'beef', crates: 2, prep: board('form patties', 20) },
      { ingredient: 'onions', crates: 1, prep: board('slice', 15) },
      { ingredient: 'buns', crates: 1 },
    ],
    freshFor: 90 * MIN, appeal: 1.2, unlock: { cost: 500, minStars: 1 },
    mastery: [2, 5, 10, 20, 40], color: 0x990000,
  },
  {
    id: 'roastChicken', name: 'Roast chicken', station: 'oven', cookTime: 4 * H, cookMode: 'passive',
    servings: 60, pricePerServing: 12, batchCost: 210,
    ingredients: [
      { ingredient: 'chicken', crates: 3, prep: board('truss', 20) },
      { ingredient: 'potatoes', crates: 2, prep: board('quarter', 15) },
    ],
    freshFor: 4 * H, appeal: 1.1, unlock: { cost: 1500, minStars: 2 },
    mastery: [1, 3, 6, 12, 24], color: 0xe69138,
  },
  {
    id: 'beefStew', name: 'Beef stew', station: 'stockPot', cookTime: 8 * H, cookMode: 'passive',
    servings: 100, pricePerServing: 10, batchCost: 300,
    ingredients: [
      { ingredient: 'beef', crates: 4, prep: board('cube', 20) },
      { ingredient: 'carrots', crates: 3, prep: board('dice', 15) },
      { ingredient: 'onions', crates: 3, prep: board('dice', 15) },
      { ingredient: 'stock', crates: 2 },
    ],
    freshFor: 10 * H, appeal: 1, unlock: { cost: 2500, minStars: 2 },
    mastery: [1, 2, 4, 8, 16], color: 0x783f04,
  },
  {
    id: 'lasagna', name: 'Lasagna', station: 'oven', cookTime: 12 * H, cookMode: 'passive',
    servings: 140, pricePerServing: 11, batchCost: 460,
    ingredients: [
      { ingredient: 'pasta', crates: 3, prep: bench('roll sheets', 20) },
      { ingredient: 'beef', crates: 3, prep: board('mince', 20) },
      { ingredient: 'tomatoes', crates: 3, prep: board('crush', 15) },
      { ingredient: 'cheese', crates: 2 },
    ],
    freshFor: 12 * H, appeal: 1.15, unlock: { cost: 4000, minStars: 3 },
    mastery: [1, 2, 3, 6, 12], color: 0xcc0000,
  },
];

export const RECIPES: Record<string, BatchRecipe> = Object.fromEntries(RECIPE_LIST.map((r) => [r.id, r]));

export function recipe(id: string): BatchRecipe {
  const r = RECIPES[id];
  if (!r) throw new Error(`Unknown recipe ${id}`);
  return r;
}

export function totalCrates(r: BatchRecipe): number {
  return r.ingredients.reduce((n, l) => n + l.crates, 0);
}
