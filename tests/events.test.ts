import { describe, expect, it } from 'vitest';
import { EventWatcher, type GameEvent } from '../src/render/events';
import { newGame } from '../src/sim/newGame';
import { runFor, step } from '../src/sim/step';
import { objOfType, unlockedGame } from './helpers';

describe('render event watcher', () => {
  it('reports a ready batch, the restock and guests paying, matching the takings', () => {
    const s = unlockedGame(3);
    const w = new EventWatcher();
    w.poll(s);
    const stove = objOfType(s, 'stove');
    step(s, [{ type: 'startBatch', stationId: stove.id, recipeId: 'friedEggs' }]);
    const events: GameEvent[] = [];
    const sales0 = s.stats.revenue + s.stats.tips;
    let served = false;
    for (let i = 0; i < 10 * 3600 && s.stats.customersServed < 4; i++) {
      const ready = Object.values(s.batches).some((b) => b.phase === 'ready');
      step(s, ready && !served ? [{ type: 'serveBatch', stationId: stove.id }] : []);
      if (ready) served = true;
      events.push(...w.poll(s));
    }
    const kinds = new Set(events.map((e) => e.kind));
    expect(kinds).toContain('ready');
    expect(kinds).toContain('stocked');
    expect(kinds).toContain('pay');
    const paid = events.reduce((sum, e) => sum + (e.kind === 'pay' ? e.amount : 0), 0);
    expect(paid).toBeCloseTo(s.stats.revenue + s.stats.tips - sales0, 6);
  });

  it('stays quiet on the first frame, on a new state and across a catch-up gap', () => {
    const w = new EventWatcher();
    const a = newGame(1);
    expect(w.poll(a)).toEqual([]);
    a.money += 1000;
    runFor(a, 3600);
    expect(w.poll(a)).toEqual([]);
    expect(w.poll(newGame(2))).toEqual([]);
  });
});
