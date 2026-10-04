import { decayedQuality } from '../quality';
import type { GameState, Lot, PlacedObject } from '../state';
import { values } from '../util';

export function counters(state: GameState): PlacedObject[] {
  return values(state.objects).filter((o) => !!o.counter);
}

export function counterStock(c: PlacedObject): number {
  return c.counter ? c.counter.lots.reduce((n, l) => n + l.servings, 0) : 0;
}

export function lotQuality(state: GameState, lot: Lot): number {
  return decayedQuality(lot.quality, state.time - lot.placedAt, lot.freshFor);
}

/** Servings in stock per recipe across all counters. */
export function stockByRecipe(state: GameState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of counters(state)) {
    const r = c.counter!.recipeId;
    if (!r) continue;
    out[r] = (out[r] ?? 0) + counterStock(c);
  }
  return out;
}

export function totalStock(state: GameState): number {
  let n = 0;
  for (const c of counters(state)) n += counterStock(c);
  return n;
}

/** Average current quality of a recipe's stock, or null if none. */
export function stockQuality(state: GameState, recipeId: string): number | null {
  let n = 0;
  let q = 0;
  for (const c of counters(state)) {
    if (c.counter!.recipeId !== recipeId) continue;
    for (const l of c.counter!.lots) {
      n += l.servings;
      q += l.servings * lotQuality(state, l);
    }
  }
  return n > 0 ? q / n : null;
}

/** Take one serving of a recipe (oldest first). Returns its quality, or null. */
export function takeServing(state: GameState, recipeId: string): number | null {
  let best: { c: PlacedObject; lot: Lot } | null = null;
  for (const c of counters(state)) {
    if (c.counter!.recipeId !== recipeId) continue;
    for (const lot of c.counter!.lots) {
      if (lot.servings > 0 && (!best || lot.placedAt < best.lot.placedAt)) best = { c, lot };
    }
  }
  if (!best) return null;
  const q = lotQuality(state, best.lot);
  best.lot.servings--;
  tidyCounter(best.c);
  return q;
}

/** Drop empty lots and free the counter once it is empty with nothing incoming. */
export function tidyCounter(c: PlacedObject): void {
  const cs = c.counter;
  if (!cs) return;
  cs.lots = cs.lots.filter((l) => l.servings > 0);
  if (cs.lots.length === 0 && cs.incoming.length === 0) cs.recipeId = null;
}
