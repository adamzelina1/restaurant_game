// Long-term goals (PLAN §7): recipe unlocks, recipe mastery stars and
// equipment tiers.

import { MAX_TIER, TIER_EFFECTS, UPGRADABLE, tierDef } from '../../data/equipment';
import { RECIPE_LIST, recipe } from '../../data/recipes';
import { stationDef } from '../../data/stations';
import {
  MASTERY_COOK_MULT_2,
  MASTERY_QUALITY_3,
  MASTERY_SERVINGS_1,
  MASTERY_SERVINGS_4,
  SIGNATURE_APPEAL,
  SIGNATURE_PRICE,
} from '../constants';
import { stars } from '../reputation/reputation';
import type { GameState, Id, PlacedObject } from '../state';
import { message, spend } from '../util';

// ---------------------------------------------------------------------------
// Equipment tiers

/** Cook / prep / wash speed multiplier from an object's tier. */
export function tierSpeed(tier: number): number {
  return 1 + TIER_EFFECTS.speed * (tier - 1);
}

/** Extra servings fraction from a cooking station's tier. */
export function tierServings(tier: number): number {
  return TIER_EFFECTS.servings * (tier - 1);
}

export function tierQuality(tier: number): number {
  return TIER_EFFECTS.quality * (tier - 1);
}

export function canUpgrade(o: PlacedObject): boolean {
  return UPGRADABLE.includes(stationDef(o.type).kind);
}

/** The next tier for an object and its price, or null at the top tier. */
export function nextTier(o: PlacedObject): { tier: number; cost: number; minStars: number } | null {
  if (!canUpgrade(o) || o.tier >= MAX_TIER) return null;
  const def = tierDef(o.tier + 1);
  if (!def) return null;
  return { tier: def.tier, cost: Math.round(stationDef(o.type).cost * def.costMult), minStars: def.minStars };
}

export function upgradeError(state: GameState, o: PlacedObject): string | null {
  const next = nextTier(o);
  if (!next) return canUpgrade(o) ? 'Already at the top tier' : "Can't be upgraded";
  if (stars(state) < next.minStars) return `Needs ${next.minStars}★ reputation`;
  if (state.money < next.cost) return 'Not enough money';
  return null;
}

export function upgradeObject(state: GameState, id: Id): boolean {
  const o = state.objects[id];
  if (!o) return false;
  const err = upgradeError(state, o);
  const next = nextTier(o);
  if (err || !next) {
    message(state, err ?? "Can't be upgraded", 'warn');
    return false;
  }
  spend(state, next.cost);
  o.tier = next.tier;
  message(state, `${stationDef(o.type).name} upgraded to tier ${o.tier}`, 'good');
  return true;
}

/** Purchase price plus every upgrade bought (what selling refunds a share of). */
export function objectValue(o: PlacedObject): number {
  const base = stationDef(o.type).cost;
  let v = base;
  for (let t = 2; t <= o.tier; t++) v += Math.round(base * (tierDef(t)?.costMult ?? 0));
  return v;
}

// ---------------------------------------------------------------------------
// Recipe unlocks

/** Recipes a new restaurant knows: the free ones. */
export function starterRecipes(): string[] {
  return RECIPE_LIST.filter((r) => r.unlock.cost === 0 && r.unlock.minStars <= 1).map((r) => r.id);
}

export function isUnlocked(state: GameState, recipeId: string): boolean {
  return state.unlockedRecipes.includes(recipeId);
}

export function unlockError(state: GameState, recipeId: string): string | null {
  const r = recipe(recipeId);
  if (isUnlocked(state, recipeId)) return 'Already unlocked';
  if (stars(state) < r.unlock.minStars) return `Needs ${r.unlock.minStars}★ reputation`;
  if (state.money < r.unlock.cost) return 'Not enough money';
  return null;
}

export function unlockRecipe(state: GameState, recipeId: string): boolean {
  const err = unlockError(state, recipeId);
  if (err) {
    message(state, err, 'warn');
    return false;
  }
  const r = recipe(recipeId);
  spend(state, r.unlock.cost);
  state.unlockedRecipes.push(recipeId);
  message(state, `New recipe: ${r.name}!`, 'good');
  return true;
}

// ---------------------------------------------------------------------------
// Mastery (PLAN §7.1)

export const MASTERY_TEXT = [
  `+${MASTERY_SERVINGS_1 * 100}% servings per batch`,
  `−${Math.round((1 - MASTERY_COOK_MULT_2) * 100)}% cook time`,
  `+${MASTERY_QUALITY_3 * 100}% quality`,
  `+${MASTERY_SERVINGS_4 * 100}% more servings per batch`,
  `Signature dish: +${Math.round((SIGNATURE_PRICE - 1) * 100)}% price, more guests want it`,
];

export function masteryCount(state: GameState, recipeId: string): number {
  return state.mastery[recipeId] ?? 0;
}

export function masteryStars(state: GameState, recipeId: string): number {
  const n = masteryCount(state, recipeId);
  return recipe(recipeId).mastery.filter((t) => n >= t).length;
}

/** Batches toward the next star: [done since the last star, needed], or null when mastered. */
export function masteryProgress(state: GameState, recipeId: string): { done: number; need: number } | null {
  const st = masteryStars(state, recipeId);
  const th = recipe(recipeId).mastery;
  if (st >= th.length) return null;
  const prev = st > 0 ? th[st - 1] : 0;
  return { done: masteryCount(state, recipeId) - prev, need: th[st] - prev };
}

export function masteryServings(stars: number): number {
  return (stars >= 1 ? MASTERY_SERVINGS_1 : 0) + (stars >= 4 ? MASTERY_SERVINGS_4 : 0);
}

export function masteryCookMult(stars: number): number {
  return stars >= 2 ? MASTERY_COOK_MULT_2 : 1;
}

export function masteryQuality(stars: number): number {
  return stars >= 3 ? MASTERY_QUALITY_3 : 0;
}

/** Menu price, with the signature-dish bonus. */
export function servingPrice(state: GameState, recipeId: string): number {
  const p = recipe(recipeId).pricePerServing;
  return masteryStars(state, recipeId) >= 5 ? Math.round(p * SIGNATURE_PRICE * 100) / 100 : p;
}

export function dishAppeal(state: GameState, recipeId: string): number {
  const a = recipe(recipeId).appeal;
  return masteryStars(state, recipeId) >= 5 ? a * SIGNATURE_APPEAL : a;
}

/** A batch reached the counter: fill its recipe's mastery bar. */
export function recordBatchServed(state: GameState, recipeId: string): void {
  const before = masteryStars(state, recipeId);
  state.mastery[recipeId] = masteryCount(state, recipeId) + 1;
  const after = masteryStars(state, recipeId);
  if (after > before) {
    message(state, `${recipe(recipeId).name} mastery ${'★'.repeat(after)}: ${MASTERY_TEXT[after - 1]}`, 'good');
  }
}
