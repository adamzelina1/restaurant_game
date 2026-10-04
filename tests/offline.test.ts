import { describe, expect, it } from 'vitest';
import { OFFLINE_CAP } from '../src/sim/constants';
import { totalStock } from '../src/sim/counters/counters';
import { platesAccountedFor } from '../src/sim/foh/dishes';
import { offlineCatchUp } from '../src/sim/offline/offline';
import { awayReport, awaySnapshot } from '../src/sim/offline/report';
import type { GameState } from '../src/sim/state';
import { runFor, step } from '../src/sim/step';
import { objOfType, runUntil, unlockedGame } from './helpers';

function stock(s: GameState, recipeId: string, n: number, counter = 0): void {
  const c = objOfType(s, 'counter', counter);
  c.counter!.recipeId = recipeId;
  c.counter!.lots.push({ servings: n, quality: 0.8, placedAt: s.time, freshFor: 1e9 });
}

/** A restaurant that has been serving guests for a while (rolling stats warmed up). */
function warmGame(seed: number): GameState {
  const s = unlockedGame(seed);
  s.money = 5000;
  stock(s, 'burgers', 150);
  stock(s, 'pancakes', 80, 1);
  runFor(s, 3600);
  return s;
}

describe('offline catch-up', () => {
  it('short absences are simulated tick by tick', () => {
    const a = warmGame(1);
    const b = structuredClone(a);
    offlineCatchUp(a, 300);
    runFor(b, 300);
    expect(a).toEqual(b);
  });

  it('long absences roughly match a full simulation', () => {
    const a = warmGame(2);
    stock(a, 'burgers', 200, 2);
    const b = structuredClone(a);
    const before = awaySnapshot(a);
    runFor(a, 3 * 3600);
    offlineCatchUp(b, 3 * 3600);
    const ra = awayReport(before, a);
    const rb = awayReport(before, b);
    expect(b.time).toBe(a.time);
    expect(rb.guests).toBeGreaterThan(ra.guests * 0.8);
    expect(rb.guests).toBeLessThan(ra.guests * 1.2);
    expect(rb.income).toBeGreaterThan(ra.income * 0.8);
    expect(rb.income).toBeLessThan(ra.income * 1.2);
    expect(Math.abs(rb.wages - ra.wages)).toBeLessThan(Math.max(5, ra.wages * 0.25));
  });

  it('cooking batches finish on schedule and wait READY; served ones reach the counter', () => {
    const s = warmGame(3);
    const oven = objOfType(s, 'oven');
    const pot = objOfType(s, 'stockPot');
    const stove = objOfType(s, 'stove');
    step(s, [
      { type: 'startBatch', stationId: oven.id, recipeId: 'roastChicken' },
      { type: 'startBatch', stationId: pot.id, recipeId: 'beefStew' },
      { type: 'startBatch', stationId: stove.id, recipeId: 'pancakes' },
    ]);
    runUntil(s, () => s.batches[stove.cook!.batchId!]?.phase === 'ready', 3600);
    step(s, [{ type: 'serveBatch', stationId: stove.id }]);
    const start = s.time;
    offlineCatchUp(s, 6 * 3600);
    // The pancakes the player sent out were put on a counter.
    expect(stove.cook!.batchId).toBeNull();
    expect(s.mastery.pancakes).toBe(1);
    // The roast finished while away and is waiting; the stew (8 h) is still cooking.
    const roast = s.batches[oven.cook!.batchId!];
    expect(roast.phase).toBe('ready');
    expect(roast.readyAt).toBeGreaterThan(start);
    expect(roast.readyAt).toBeLessThan(s.time);
    expect(s.batches[pot.cook!.batchId!].phase).toBe('cooking');
    expect(awayReport(awaySnapshot(s), s).ready).toContain('Roast chicken');
  });

  it('hands a consistent world back to the agents', () => {
    const s = warmGame(4);
    const grill = objOfType(s, 'grill');
    step(s, [{ type: 'startBatch', stationId: grill.id, recipeId: 'burgers' }]);
    runFor(s, 20);
    s.rolling.loadPerCrate = 1e6; // nobody loads while away: the batch is still loading on return
    offlineCatchUp(s, 2 * 3600);
    expect(Object.keys(s.customers)).toHaveLength(0);
    expect(s.plates.clean).toBe(s.plates.total);
    expect(platesAccountedFor(s)).toBe(s.plates.total);
    expect(Object.values(s.employees).every((e) => !e.taskId && !e.carrying)).toBe(true);
    const b = s.batches[grill.cook!.batchId!];
    expect(b.phase).toBe('loading');
    // Staff pick the loading back up once the player returns.
    runUntil(s, () => b.phase === 'cooking', 1800);
    runFor(s, 600);
    expect(platesAccountedFor(s)).toBe(s.plates.total);
  });

  it('charges no wages once the counters are empty', () => {
    const s = unlockedGame(5);
    stock(s, 'burgers', 5);
    runFor(s, 60);
    const wages = s.stats.wagesPaid;
    offlineCatchUp(s, 10 * 3600);
    expect(totalStock(s)).toBe(0);
    // Selling five servings takes minutes, not hours.
    expect(s.stats.wagesPaid - wages).toBeLessThan(10);
  });

  it('is capped at 24 hours', () => {
    const s = unlockedGame(6);
    const t = s.time;
    offlineCatchUp(s, 3 * 86400);
    expect(s.time - t).toBe(OFFLINE_CAP);
  });
});
