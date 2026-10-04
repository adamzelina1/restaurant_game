import { describe, expect, it } from 'vitest';
import { TRAITS } from '../src/data/traits';
import { validateLayout } from '../src/sim/build/analysis';
import { placementError } from '../src/sim/build/build';
import { PASS_CAPACITY } from '../src/sim/constants';
import { isOpen } from '../src/sim/economy/wages';
import { newGame } from '../src/sim/newGame';
import { Floor, WORK_TYPES, type GameState } from '../src/sim/state';
import { runFor, step } from '../src/sim/step';
import { objOfType, runUntil } from './helpers';

/** Put `n` servings of a dish on a counter. */
function stock(s: GameState, recipeId: string, n: number, counter = 0, quality = 0.8): void {
  const c = objOfType(s, 'counter', counter);
  c.counter!.recipeId = recipeId;
  c.counter!.lots.push({ servings: n, quality, placedAt: s.time, freshFor: 1e9 });
}

describe('starter layout', () => {
  it('is valid and every object passes placement rules', () => {
    const s = newGame();
    expect(validateLayout(s)).toEqual([]);
    for (const o of Object.values(s.objects)) {
      expect([o.type, placementError(s, o.type, o.x, o.y, o.rot, o.id)]).toEqual([o.type, null]);
    }
  });
});

describe('service loop', () => {
  it('guests arrive, order, get plated food, eat, pay and tip', () => {
    const s = newGame(21);
    stock(s, 'burgers', 60);
    const rep0 = s.reputation;
    runUntil(s, () => s.stats.customersServed >= 6, 3600);
    expect(s.stats.revenue).toBeGreaterThan(0);
    expect(s.stats.tips).toBeGreaterThan(0);
    expect(s.reputation).not.toBe(rep0);
    // Service skills were trained.
    const ana = Object.values(s.employees).find((e) => e.name === 'Ana')!;
    expect(ana.skills.Service.xp + ana.skills.Plating.xp).toBeGreaterThan(0);
  });

  it('guests only ever stand on dining floor and the pass never overflows', () => {
    const s = newGame(5);
    stock(s, 'burgers', 80);
    stock(s, 'pancakes', 40, 1);
    for (let i = 0; i < 3600 * 10; i++) {
      step(s);
      if (i % 10) continue;
      for (const c of Object.values(s.customers)) {
        expect(s.grid.floor[c.y * s.grid.width + c.x]).toBe(Floor.Dining);
      }
      const pass = objOfType(s, 'pass');
      expect(pass.pass!.plates.length + pass.pass!.incoming.length).toBeLessThanOrEqual(PASS_CAPACITY);
    }
    expect(s.stats.customersServed).toBeGreaterThan(10);
  });

  it('nobody comes while every counter is empty', () => {
    const s = newGame();
    runFor(s, 1200);
    expect(Object.keys(s.parties)).toHaveLength(0);
    expect(isOpen(s)).toBe(false);
  });
});

describe('patience', () => {
  it('unattended guests leave angry, hurting reputation and releasing their food', () => {
    const s = newGame(8);
    s.reputation = 3;
    for (const e of Object.values(s.employees)) for (const w of WORK_TYPES) e.priorities[w] = 0;
    stock(s, 'burgers', 30);
    runUntil(s, () => s.stats.customersLost > 0, 1200);
    expect(s.reputation).toBeLessThan(3);
    expect(s.stats.customersServed).toBe(0);
    runFor(s, 120);
    const ctr = objOfType(s, 'counter');
    expect(ctr.counter!.reserved).toBe(0);
    expect(ctr.counter!.lots[0].servings).toBe(30);
  });

  it('waiting guests keep the restaurant open after the counters run dry', () => {
    const s = newGame(13);
    stock(s, 'burgers', 2);
    runUntil(s, () => Object.keys(s.customers).length > 0, 600);
    runUntil(s, () => s.stats.servingsSold >= 2 || Object.keys(s.customers).length === 0, 1200);
    // Once the last guests leave it closes.
    runUntil(s, () => Object.keys(s.customers).length === 0 && Object.values(s.parties).every((p) => p.toSpawn === 0), 1200);
    runFor(s, 5);
    expect(isOpen(s)).toBe(false);
  });
});

describe('dropped plates', () => {
  it('are re-plated from stock', () => {
    const s = newGame(4);
    const original = TRAITS.clumsy.dropChance;
    TRAITS.clumsy.dropChance = 0.6;
    for (const e of Object.values(s.employees)) e.traits = ['clumsy'];
    stock(s, 'burgers', 40);
    let drops = 0;
    let seen = s.nextMessageId;
    runUntil(
      s,
      () => {
        for (const m of s.messages) if (m.id >= seen && m.text.includes('dropped a')) drops++;
        seen = s.nextMessageId;
        return s.stats.customersServed >= 4;
      },
      3600,
    );
    TRAITS.clumsy.dropChance = original;
    expect(drops).toBeGreaterThan(0);
    // Every served guest used one serving; dropped ones used extra.
    const left = objOfType(s, 'counter').counter!.lots.reduce((n, l) => n + l.servings, 0);
    expect(40 - left).toBeGreaterThanOrEqual(s.stats.servingsSold);
  });
});
