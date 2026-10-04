import { recipe, totalCrates } from '../../data/recipes';
import { stationDef } from '../../data/stations';
import { CANCEL_REFUND, CLICK_CAP_FRACTION } from '../constants';
import { recordLoad } from '../economy/rolling';
import { computeBatchQuality, decayedQuality, readyGrace } from '../quality';
import { tidyCounter } from '../counters/counters';
import {
  masteryCookMult,
  masteryQuality,
  masteryServings,
  masteryStars,
  recordBatchServed,
  tierServings,
  tierSpeed,
} from '../progression/progression';
import type { Batch, Crate, GameState, Id, PlacedObject } from '../state';
import { abandonTask, createTask, deleteTask } from '../tasks/tasks';
import { message, newId, spend, values } from '../util';

/** Servings a batch yields on this station: tier and mastery add servings, not crates. */
export function batchServings(state: GameState, recipeId: string, station: PlacedObject): number {
  const r = recipe(recipeId);
  const bonus = tierServings(station.tier) + masteryServings(masteryStars(state, recipeId));
  return Math.round(r.servings * (1 + bonus));
}

/** Seconds of cooking needed on this station. */
export function batchCookTime(state: GameState, recipeId: string, station: PlacedObject): number {
  const r = recipe(recipeId);
  const mastery = masteryCookMult(masteryStars(state, recipeId));
  // Active recipes progress at the tender's skill speed; tier speeds up passive ones.
  return r.cookMode === 'active' ? r.cookTime * mastery : (r.cookTime * mastery) / tierSpeed(station.tier);
}

export function canStartBatch(state: GameState, stationId: Id, recipeId: string): string | null {
  const st = state.objects[stationId];
  if (!st || !st.cook) return 'Not a cooking station';
  if (st.cook.batchId) return 'Station is busy';
  const r = recipe(recipeId);
  if (r.station !== st.type) return `${r.name} needs a ${stationDef(r.station).name}`;
  if (!state.unlockedRecipes.includes(recipeId)) return 'Recipe is locked';
  if (state.money < r.batchCost) return 'Not enough money';
  return null;
}

export function startBatch(state: GameState, stationId: Id, recipeId: string): boolean {
  const err = canStartBatch(state, stationId, recipeId);
  if (err) {
    message(state, err, 'warn');
    return false;
  }
  const st = state.objects[stationId];
  const r = recipe(recipeId);
  spend(state, r.batchCost);
  const cookTime = batchCookTime(state, recipeId, st);
  const b: Batch = {
    id: newId(state, 'b'),
    recipeId,
    stationId,
    phase: 'loading',
    crates: [],
    cratesLoaded: 0,
    cookTime,
    cookDone: 0,
    clickRemoved: 0,
    clickCap: CLICK_CAP_FRACTION * cookTime,
    servings: batchServings(state, recipeId, st),
    quality: 0,
    prepSkillSum: 0,
    prepSkillCount: 0,
    cookSkillSum: 0,
    cookSkillCount: 0,
    startedAt: state.time,
    readyAt: null,
    cost: r.batchCost,
    pot: { kind: 'station' },
    serveRequested: false,
  };
  state.batches[b.id] = b;
  st.cook!.batchId = b.id;

  for (const line of r.ingredients) {
    for (let i = 0; i < line.crates; i++) {
      const c: Crate = {
        id: newId(state, 'c'),
        batchId: b.id,
        ingredient: line.ingredient,
        needsPrep: !!line.prep,
        prepped: false,
        prepStation: line.prep?.station ?? null,
        prepSkill: line.prep?.skill ?? null,
        prepTime: line.prep?.timePerCrate ?? 0,
        prepDone: 0,
        clickRemoved: 0,
        loc: { kind: 'source' },
      };
      state.crates[c.id] = c;
      b.crates.push(c.id);
      createTask(state, 'deliver', 'Haul', { batchId: b.id, crateId: c.id });
    }
  }
  if (totalCrates(r) === 0) startCooking(state, b);
  return true;
}

export function startCooking(state: GameState, b: Batch): void {
  b.phase = 'cooking';
  recordLoad(state, b);
  // The crates are in the pot now.
  for (const cid of b.crates) delete state.crates[cid];
  if (recipe(b.recipeId).cookMode === 'active') createTask(state, 'tend', 'Cook', { batchId: b.id });
}

/** Called when a crate is loaded into the cooking station. */
export function onCrateLoaded(state: GameState, b: Batch): void {
  b.cratesLoaded++;
  if (b.cratesLoaded >= b.crates.length && b.phase === 'loading') startCooking(state, b);
}

function removeBatchTasks(state: GameState, batchId: Id): void {
  for (const t of values(state.tasks)) {
    if (t.batchId !== batchId) continue;
    if (t.claimedBy) {
      const e = state.employees[t.claimedBy];
      if (e) {
        abandonTask(state, e);
        // A crate the employee was carrying belongs to this batch and is deleted below.
      }
    }
    deleteTask(state, t.id);
  }
}

/** Cancel a batch before cooking starts, for a partial refund. */
export function cancelBatch(state: GameState, stationId: Id): boolean {
  const st = state.objects[stationId];
  const b = st?.cook?.batchId ? state.batches[st.cook.batchId] : null;
  if (!st || !b) return false;
  if (b.phase !== 'loading') {
    message(state, 'Cooking has started; the batch can no longer be cancelled', 'warn');
    return false;
  }
  removeBatchTasks(state, b.id);
  for (const cid of b.crates) {
    for (const o of values(state.objects)) {
      if (o.prep?.crateId === cid) o.prep.crateId = null;
    }
    delete state.crates[cid];
  }
  const refund = Math.floor(b.cost * CANCEL_REFUND);
  state.money += refund;
  st.cook!.batchId = null;
  delete state.batches[b.id];
  message(state, `Batch cancelled, refunded $${refund}`);
  return true;
}

/** Advance passive cooking and detect finished batches. */
export function tickCooking(state: GameState, dt: number): void {
  for (const b of values(state.batches)) {
    if (b.phase !== 'cooking') continue;
    const r = recipe(b.recipeId);
    if (r.cookMode === 'passive') b.cookDone += dt;
    if (b.cookDone + b.clickRemoved >= b.cookTime) finishCooking(state, b, state.time);
  }
}

/** Cooking is done at time `at`: the batch waits READY for the player's click. */
export function finishCooking(state: GameState, b: Batch, at: number): void {
  const r = recipe(b.recipeId);
  const st = state.objects[b.stationId];
  b.phase = 'ready';
  b.readyAt = at;
  b.quality = Math.min(1, computeBatchQuality(b, st?.tier ?? 1) + masteryQuality(masteryStars(state, b.recipeId)));
  message(state, `${r.name} is ready! Click the ${stationDef(r.station).name} to serve it.`, 'good');
}

/** The pot reaches a counter and becomes servings. */
export function putBatchOnCounter(state: GameState, b: Batch, counter: PlacedObject): void {
  const rec = recipe(b.recipeId);
  const cs = counter.counter!;
  if (b.readyAt !== null) {
    // Lock in the quality lost while waiting to be served.
    b.quality = readyBatchQuality(state, b);
    b.readyAt = null;
  }
  const st = state.objects[b.stationId];
  if (st?.cook?.batchId === b.id) st.cook.batchId = null;
  cs.recipeId = b.recipeId;
  cs.lots.push({ servings: b.servings, quality: b.quality, placedAt: state.time, freshFor: rec.freshFor });
  tidyCounter(counter);
  state.stats.batchesServed++;
  recordBatchServed(state, b.recipeId);
  delete state.batches[b.id];
  message(state, `${b.servings} servings of ${rec.name} on the counter`);
}

/** Quality of a ready batch right now, including the wait since it finished. */
export function readyBatchQuality(state: GameState, b: Batch): number {
  if (b.readyAt === null) return b.quality;
  return decayedQuality(b.quality, state.time - b.readyAt, readyGrace(b.cookTime));
}

/** Player clicked a READY station: create the urgent carry task. */
export function requestServe(state: GameState, stationId: Id): boolean {
  const st = state.objects[stationId];
  const b = st?.cook?.batchId ? state.batches[st.cook.batchId] : null;
  if (!b || b.phase !== 'ready' || b.serveRequested) return false;
  b.serveRequested = true;
  createTask(state, 'carryBatch', 'Haul', { batchId: b.id, urgent: true });
  return true;
}

export function batchProgress(b: Batch): number {
  if (b.phase === 'loading') return b.crates.length ? b.cratesLoaded / b.crates.length : 0;
  if (b.phase === 'cooking') return Math.min(1, (b.cookDone + b.clickRemoved) / b.cookTime);
  return 1;
}

export function batchTimeLeft(b: Batch): number {
  return Math.max(0, b.cookTime - b.cookDone - b.clickRemoved);
}
