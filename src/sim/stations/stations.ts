import { CLICK_CAP_FRACTION, CLICK_FRACTION, CLICK_MIN_SECONDS, HEAT_COOL_PER_SEC, HEAT_MAX, HEAT_PER_CLICK } from '../constants';
import type { GameState, Id } from '../state';

/** What a speed-up click on this object would do right now (null if nothing). */
export function speedUpTarget(state: GameState, objectId: Id): { kind: 'cook' | 'prep'; left: number } | null {
  const o = state.objects[objectId];
  if (!o) return null;
  if (o.cook?.batchId) {
    const b = state.batches[o.cook.batchId];
    if (b && b.phase === 'cooking') return { kind: 'cook', left: b.clickCap - b.clickRemoved };
  }
  if (o.prep?.crateId) {
    const c = state.crates[o.prep.crateId];
    if (c && c.needsPrep && !c.prepped && c.prepDone > 0) {
      return { kind: 'prep', left: CLICK_CAP_FRACTION * c.prepTime - c.clickRemoved };
    }
  }
  return null;
}

/**
 * Click speed-up (PLAN §4.6): each click removes 1% of the step's base time
 * (min 1 s), at most 25% per batch / prep step, paced by the heat meter.
 */
export function speedUp(state: GameState, objectId: Id): boolean {
  if (state.heat + HEAT_PER_CLICK > HEAT_MAX + 1e-9) return false;
  const o = state.objects[objectId];
  const target = speedUpTarget(state, objectId);
  if (!o || !target || target.left <= 1e-9) return false;
  if (target.kind === 'cook') {
    const b = state.batches[o.cook!.batchId!];
    const amount = Math.min(Math.max(CLICK_MIN_SECONDS, CLICK_FRACTION * b.cookTime), target.left);
    b.clickRemoved += amount;
  } else {
    const c = state.crates[o.prep!.crateId!];
    const amount = Math.min(Math.max(CLICK_MIN_SECONDS, CLICK_FRACTION * c.prepTime), target.left);
    c.clickRemoved += amount;
  }
  state.heat = Math.min(HEAT_MAX, state.heat + HEAT_PER_CLICK);
  return true;
}

export function coolHeat(state: GameState, dt: number): void {
  state.heat = Math.max(0, state.heat - HEAT_COOL_PER_SEC * dt);
}
