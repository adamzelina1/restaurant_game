import { describe, expect, it } from 'vitest';
import { TRAITS } from '../src/data/traits';
import { BREAK_AT } from '../src/sim/constants';
import { newGame } from '../src/sim/newGame';
import { generateCandidate } from '../src/sim/staff/hiring';
import { gainXp, xpToNext } from '../src/sim/staff/xp';
import { WORK_TYPES, type Employee, type GameState } from '../src/sim/state';
import { runFor, step } from '../src/sim/step';
import { objOfType, runUntil } from './helpers';

const staff = (s: GameState) => Object.values(s.employees);
const byName = (s: GameState, n: string) => staff(s).find((e) => e.name === n)!;

describe('skills and XP', () => {
  it('passion multiplies XP and levels raise the wage', () => {
    const s = newGame();
    const marco = byName(s, 'Marco'); // Grill passion 2, Prep passion 0
    gainXp(s, marco, 'Prep', 100);
    expect(marco.skills.Prep.xp).toBeCloseTo(35);
    const wage = marco.wage;
    const level = marco.skills.Grill.level;
    gainXp(s, marco, 'Grill', xpToNext(level) / 1.5 + 1);
    expect(marco.skills.Grill.level).toBe(level + 1);
    expect(marco.wage).toBeGreaterThan(wage);
  });

  it('prep work trains the prep skill', () => {
    const s = newGame();
    s.money = 5000;
    const pot = objOfType(s, 'stockPot');
    const ana = byName(s, 'Ana');
    step(s, [{ type: 'startBatch', stationId: pot.id, recipeId: 'beefStew' }]);
    runUntil(s, () => s.batches[pot.cook!.batchId!].phase === 'cooking', 1800);
    expect(ana.skills.Prep.xp + ana.skills.Prep.level * 1000).toBeGreaterThan(6 * 1000);
  });
});

describe('priorities', () => {
  it('work types set to off are never done', () => {
    const s = newGame();
    for (const e of staff(s)) step(s, [{ type: 'setPriority', employeeId: e.id, workType: 'Haul', priority: 0 }]);
    const stove = objOfType(s, 'stove');
    step(s, [{ type: 'startBatch', stationId: stove.id, recipeId: 'friedEggs' }]);
    runFor(s, 120);
    const b = s.batches[stove.cook!.batchId!];
    expect(b.cratesLoaded).toBe(0);
    step(s, [{ type: 'setColumn', workType: 'Haul', priority: 3 }]);
    runUntil(s, () => b.cratesLoaded === 1, 60);
  });

  it('higher priority tiers are taken first', () => {
    const s = newGame();
    const [marco, ana] = [byName(s, 'Marco'), byName(s, 'Ana')];
    // Ana only hauls; Marco only cooks/preps.
    for (const w of WORK_TYPES) {
      step(s, [
        { type: 'setPriority', employeeId: ana.id, workType: w, priority: w === 'Haul' ? 1 : 0 },
        { type: 'setPriority', employeeId: marco.id, workType: w, priority: w === 'Haul' ? 0 : 1 },
      ]);
    }
    const stove = objOfType(s, 'stove');
    step(s, [{ type: 'startBatch', stationId: stove.id, recipeId: 'pancakes' }]);
    runUntil(s, () => s.batches[stove.cook!.batchId!].phase === 'cooking', 300);
    expect(ana.time.working).toBeGreaterThan(0);
    // Marco did the mixing; Ana never prepped.
    expect(marco.skills.Baking.xp).toBeGreaterThan(0);
    expect(ana.skills.Baking.xp).toBe(0);
  });

  it('Prima Donna refuses Dishes and Bus', () => {
    const s = newGame();
    const e = byName(s, 'Ana');
    e.traits = ['primaDonna'];
    step(s, [{ type: 'setPriority', employeeId: e.id, workType: 'Dishes', priority: 1 }]);
    step(s, [{ type: 'applyPreset', employeeId: e.id, presetId: 'busser' }]);
    expect(e.priorities.Dishes).toBe(0);
    expect(e.priorities.Bus).toBe(0);
    expect(e.priorities.Haul).toBe(2);
  });
});

describe('stamina and breaks', () => {
  it('tired staff finish their task, rest on the couch, and come back', () => {
    const s = newGame();
    s.money = 1e6;
    const ana = byName(s, 'Ana');
    ana.stamina.current = BREAK_AT + 0.5;
    const pot = objOfType(s, 'stockPot');
    step(s, [{ type: 'startBatch', stationId: pot.id, recipeId: 'beefStew' }]);
    runUntil(s, () => !!ana.onBreak, 600);
    expect(ana.taskId).toBeNull();
    const couch = objOfType(s, 'couch');
    runUntil(s, () => ana.activity === 'break' && ana.y === couch.y - 1, 120);
    runUntil(s, () => !ana.onBreak, 1200);
    expect(ana.stamina.current).toBeGreaterThan(99);
    expect(ana.time.break).toBeGreaterThan(60);
  });

  it('with no couch, exhausted staff keep working, slower', () => {
    const s = newGame();
    s.money = 1e6;
    delete s.objects[objOfType(s, 'couch').id];
    s.layoutVersion++;
    const ana = byName(s, 'Ana');
    ana.stamina.current = 5;
    const pot = objOfType(s, 'stockPot');
    step(s, [{ type: 'startBatch', stationId: pot.id, recipeId: 'beefStew' }]);
    runFor(s, 120);
    expect(ana.onBreak).toBeNull();
    expect(ana.time.working).toBeGreaterThan(10);
  });
});

describe('hiring and wages', () => {
  it('candidates are deterministic per seed', () => {
    const names = (seed: number) => newGame(seed).hiring.candidates.map((c) => c.name).join();
    expect(names(5)).toBe(names(5));
    expect(newGame(5).hiring.candidates.length).toBeGreaterThanOrEqual(3);
  });

  it('candidate skill points lean toward passions', () => {
    const s = newGame(9);
    let passionLevels = 0;
    let otherLevels = 0;
    let passionCount = 0;
    for (let i = 0; i < 200; i++) {
      const c = generateCandidate(s);
      for (const sk of Object.values(c.skills)) {
        if (sk.passion > 0) {
          passionLevels += sk.level;
          passionCount++;
        } else otherLevels += sk.level;
      }
    }
    const otherCount = 200 * 6 - passionCount;
    expect(passionLevels / passionCount).toBeGreaterThan(2 * (otherLevels / otherCount));
  });

  it('hire adds an employee with a preset; fire removes them', () => {
    const s = newGame();
    s.money = 1000;
    const c = s.hiring.candidates[0];
    step(s, [{ type: 'hire', index: 0 }]);
    const hired = staff(s).find((e) => e.name === c.name) as Employee;
    expect(hired).toBeTruthy();
    expect(s.money).toBeLessThan(1000);
    expect(Object.values(hired.priorities).some((p) => p > 0)).toBe(true);
    // Nobody shares a tile.
    const tiles = new Set(staff(s).map((e) => `${e.x},${e.y}`));
    expect(tiles.size).toBe(staff(s).length);
    step(s, [{ type: 'fire', employeeId: hired.id }]);
    expect(s.employees[hired.id]).toBeUndefined();
  });

  it('wages are only charged while open', () => {
    const s = newGame();
    s.nextPartyIn = 1e9;
    runFor(s, 600);
    expect(s.stats.wagesPaid).toBe(0);
    const ctr = objOfType(s, 'counter');
    ctr.counter!.recipeId = 'friedEggs';
    ctr.counter!.lots.push({ servings: 10000, quality: 1, placedAt: s.time, freshFor: 1e9 });
    runFor(s, 3600);
    const payroll = staff(s).reduce((n, e) => n + e.wage, 0);
    expect(s.stats.wagesPaid).toBeCloseTo(payroll, 0);
  });
});

describe('traits', () => {
  it('clumsy staff drop crates, but everything still gets loaded', () => {
    const s = newGame(3);
    s.money = 1e6;
    for (const e of staff(s)) e.traits = ['clumsy'];
    // Make drops frequent enough to observe.
    const original = TRAITS.clumsy.dropChance;
    TRAITS.clumsy.dropChance = 0.5;
    const pot = objOfType(s, 'stockPot');
    step(s, [{ type: 'startBatch', stationId: pot.id, recipeId: 'beefStew' }]);
    let drops = 0;
    let lastMsg = s.nextMessageId;
    runUntil(
      s,
      () => {
        for (const m of s.messages) if (m.id >= lastMsg && m.text.includes('dropped')) drops++;
        lastMsg = s.nextMessageId;
        return s.batches[pot.cook!.batchId!].phase === 'cooking';
      },
      3600,
    );
    TRAITS.clumsy.dropChance = original;
    expect(s.batches[pot.cook!.batchId!].cratesLoaded).toBe(12);
    expect(drops).toBeGreaterThan(0);
  });
});
