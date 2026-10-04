import { describe, expect, it } from 'vitest';
import { recipe } from '../src/data/recipes';
import { counterStock } from '../src/sim/counters/counters';
import { newGame } from '../src/sim/newGame';
import { runFor, step } from '../src/sim/step';
import { objOfType, runUntil } from './helpers';

describe('batch cooking loop', () => {
  it('fried eggs: fetch → tend (active) → ready → serve → counter → sold', () => {
    const s = newGame();
    const stove = objOfType(s, 'stove');
    const money0 = s.money;
    step(s, [{ type: 'startBatch', stationId: stove.id, recipeId: 'friedEggs' }]);
    expect(s.money).toBe(money0 - recipe('friedEggs').batchCost);
    const b = s.batches[stove.cook!.batchId!];
    expect(b.crates).toHaveLength(1);

    runUntil(s, () => b.phase === 'cooking', 60);
    // Active recipe: an employee must be tending.
    expect(Object.values(s.tasks).some((t) => t.kind === 'tend')).toBe(true);
    runUntil(s, () => b.phase === 'ready', 400);
    expect(b.quality).toBeGreaterThan(0.3);

    // Ready batches block the station until served.
    runFor(s, 5);
    expect(stove.cook!.batchId).toBe(b.id);

    step(s, [{ type: 'serveBatch', stationId: stove.id }]);
    runUntil(s, () => !s.batches[b.id], 60);
    expect(stove.cook!.batchId).toBeNull();
    const counter = Object.values(s.objects).find((o) => o.counter?.recipeId === 'friedEggs')!;
    expect(counterStock(counter)).toBe(6);

    runUntil(s, () => s.stats.servingsSold >= 6, 600);
    expect(counterStock(counter)).toBe(0);
    expect(counter.counter!.recipeId).toBeNull();
    expect(s.stats.revenue).toBe(30);
  });

  it('pancakes: crates are prepped at the mixing bench, then loaded', () => {
    const s = newGame();
    const stove = objOfType(s, 'stove');
    step(s, [{ type: 'startBatch', stationId: stove.id, recipeId: 'pancakes' }]);
    const b = s.batches[stove.cook!.batchId!];
    expect(b.crates).toHaveLength(3);
    const flour = b.crates.map((id) => s.crates[id]).find((c) => c.ingredient === 'flour')!;
    expect(flour.needsPrep).toBe(true);
    runUntil(s, () => flour.prepped, 120);
    runUntil(s, () => b.phase === 'cooking', 120);
    expect(b.cratesLoaded).toBe(3);
    expect(b.prepSkillCount).toBe(1);
    // Passive: nobody has to stand there.
    expect(Object.values(s.tasks)).toHaveLength(0);
    runUntil(s, () => b.phase === 'ready', recipe('pancakes').cookTime + 5);
  });

  it('a big batch is split into one trip per crate, worked in parallel', () => {
    const s = newGame();
    const pot = objOfType(s, 'stockPot');
    s.money = 10000;
    step(s, [{ type: 'startBatch', stationId: pot.id, recipeId: 'beefStew' }]);
    const b = s.batches[pot.cook!.batchId!];
    expect(b.crates).toHaveLength(12);
    const t = runUntil(s, () => b.phase === 'cooking', 1800);
    // Two employees and two boards: well under a solo worker's time.
    expect(t).toBeLessThan(900);
    const busy = Object.values(s.employees).filter((e) => e.time.working > 30);
    expect(busy).toHaveLength(2);
  });

  it('cancel refunds half before cooking starts', () => {
    const s = newGame();
    const grill = objOfType(s, 'grill');
    const money0 = s.money;
    step(s, [{ type: 'startBatch', stationId: grill.id, recipeId: 'burgers' }]);
    runFor(s, 3);
    step(s, [{ type: 'cancelBatch', stationId: grill.id }]);
    expect(grill.cook!.batchId).toBeNull();
    expect(Object.keys(s.batches)).toHaveLength(0);
    expect(Object.keys(s.crates)).toHaveLength(0);
    expect(Object.keys(s.tasks)).toHaveLength(0);
    expect(Object.values(s.employees).every((e) => !e.carrying && !e.taskId)).toBe(true);
    expect(s.money).toBe(money0 - 70 + 35);
  });

  it('serving waits for a free counter', () => {
    const s = newGame();
    for (const o of Object.values(s.objects)) {
      if (o.counter) o.counter.recipeId = 'lasagna';
      if (o.counter) o.counter.lots.push({ servings: 5, quality: 1, placedAt: 0, freshFor: 1e9 });
    }
    s.nextBuyerIn = 1e9;
    const stove = objOfType(s, 'stove');
    step(s, [{ type: 'startBatch', stationId: stove.id, recipeId: 'friedEggs' }]);
    const b = s.batches[stove.cook!.batchId!];
    runUntil(s, () => b.phase === 'ready', 600);
    step(s, [{ type: 'serveBatch', stationId: stove.id }]);
    runFor(s, 30);
    const carry = Object.values(s.tasks).find((t) => t.kind === 'carryBatch')!;
    expect(carry.status).toBe('blocked');
    // Free one counter.
    const c = objOfType(s, 'counter', 2);
    c.counter!.lots = [];
    c.counter!.recipeId = null;
    runUntil(s, () => !s.batches[b.id], 60);
    expect(c.counter!.recipeId).toBe('friedEggs');
  });
});

describe('click speed-up', () => {
  it('removes 1% per click, paced by heat, capped at 25%', () => {
    const s = newGame();
    s.money = 10000;
    const grill = objOfType(s, 'grill');
    step(s, [{ type: 'startBatch', stationId: grill.id, recipeId: 'burgers' }]);
    const b = s.batches[grill.cook!.batchId!];
    runUntil(s, () => b.phase === 'cooking', 600);
    // 10 clicks in one tick: heat caps at 100 after 10.
    step(s, Array.from({ length: 12 }, () => ({ type: 'speedUp' as const, objectId: grill.id })));
    expect(b.clickRemoved).toBeCloseTo(10 * 36);
    expect(s.heat).toBeGreaterThan(90);
    runFor(s, 10);
    expect(s.heat).toBe(0);
    for (let i = 0; i < 40; i++) {
      step(s, [{ type: 'speedUp', objectId: grill.id }]);
      runFor(s, 1);
    }
    expect(b.clickRemoved).toBeCloseTo(0.25 * 3600);
  });
});

describe('determinism', () => {
  it('same seed and commands give identical state', () => {
    const run = () => {
      const s = newGame(42);
      const stove = objOfType(s, 'stove');
      const pot = objOfType(s, 'stockPot');
      s.money = 5000;
      step(s, [
        { type: 'startBatch', stationId: stove.id, recipeId: 'pancakes' },
        { type: 'startBatch', stationId: pot.id, recipeId: 'beefStew' },
      ]);
      runFor(s, 1200);
      step(s, [{ type: 'serveBatch', stationId: stove.id }]);
      runFor(s, 600);
      return JSON.stringify(s);
    };
    expect(run()).toBe(run());
  });

  it('state survives a JSON round trip mid-run', () => {
    const a = newGame(7);
    const stove = objOfType(a, 'stove');
    step(a, [{ type: 'startBatch', stationId: stove.id, recipeId: 'pancakes' }]);
    runFor(a, 30);
    const b = JSON.parse(JSON.stringify(a));
    runFor(a, 300);
    runFor(b, 300);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});
