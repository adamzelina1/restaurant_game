import { describe, expect, it } from 'vitest';
import { recipe } from '../src/data/recipes';
import { stationDef } from '../src/data/stations';
import { newGame } from '../src/sim/newGame';
import { batchCookTime, batchServings } from '../src/sim/production/batches';
import { masteryStars, nextTier, objectValue, servingPrice } from '../src/sim/progression/progression';
import { runFor, step } from '../src/sim/step';
import { objOfType, runUntil, unlockedGame } from './helpers';

describe('recipe unlocks', () => {
  it('a new restaurant only knows the free recipes', () => {
    const s = newGame();
    expect(s.unlockedRecipes.sort()).toEqual(['friedEggs', 'pancakes']);
    const grill = objOfType(s, 'grill');
    step(s, [{ type: 'startBatch', stationId: grill.id, recipeId: 'burgers' }]);
    expect(grill.cook!.batchId).toBeNull();
  });

  it('unlocking costs money and needs enough stars', () => {
    const s = newGame();
    s.money = 10000;
    s.reputation = 1.5;
    step(s, [{ type: 'unlockRecipe', recipeId: 'roastChicken' }]); // needs 2 stars
    expect(s.unlockedRecipes).not.toContain('roastChicken');
    step(s, [{ type: 'unlockRecipe', recipeId: 'burgers' }]);
    expect(s.unlockedRecipes).toContain('burgers');
    expect(s.money).toBe(10000 - recipe('burgers').unlock.cost);
    const grill = objOfType(s, 'grill');
    step(s, [{ type: 'startBatch', stationId: grill.id, recipeId: 'burgers' }]);
    expect(grill.cook!.batchId).not.toBeNull();
    s.reputation = 2.2;
    step(s, [{ type: 'unlockRecipe', recipeId: 'roastChicken' }]);
    expect(s.unlockedRecipes).toContain('roastChicken');
  });

  it('can’t be bought without the money', () => {
    const s = newGame();
    s.money = 100;
    step(s, [{ type: 'unlockRecipe', recipeId: 'burgers' }]);
    expect(s.unlockedRecipes).not.toContain('burgers');
    expect(s.money).toBe(100);
  });
});

describe('mastery', () => {
  it('fills as batches reach the counter', () => {
    const s = unlockedGame(3);
    s.money = 1000;
    const stove = objOfType(s, 'stove');
    for (let i = 0; i < 2; i++) {
      step(s, [{ type: 'startBatch', stationId: stove.id, recipeId: 'pancakes' }]);
      runUntil(s, () => s.batches[stove.cook!.batchId!]?.phase === 'ready', 3600);
      step(s, [{ type: 'serveBatch', stationId: stove.id }]);
      runUntil(s, () => stove.cook!.batchId === null, 600);
      runFor(s, 10);
    }
    expect(s.mastery.pancakes).toBe(2);
  });

  it('stars add servings, cut cook time and make a signature dish', () => {
    const s = unlockedGame();
    const oven = objOfType(s, 'oven');
    const base = { servings: batchServings(s, 'lasagna', oven), cook: batchCookTime(s, 'lasagna', oven) };
    const th = recipe('lasagna').mastery;
    s.mastery.lasagna = th[0];
    expect(masteryStars(s, 'lasagna')).toBe(1);
    expect(batchServings(s, 'lasagna', oven)).toBe(Math.round(base.servings * 1.1));
    s.mastery.lasagna = th[1];
    expect(batchCookTime(s, 'lasagna', oven)).toBeCloseTo(base.cook * 0.9);
    s.mastery.lasagna = th[4];
    expect(masteryStars(s, 'lasagna')).toBe(5);
    expect(batchServings(s, 'lasagna', oven)).toBe(Math.round(base.servings * 1.2));
    expect(servingPrice(s, 'lasagna')).toBeGreaterThan(recipe('lasagna').pricePerServing);
  });
});

describe('equipment tiers', () => {
  it('upgrades cost money, need stars and speed up cooking', () => {
    const s = unlockedGame();
    s.money = 100000;
    const oven = objOfType(s, 'oven');
    const cook1 = batchCookTime(s, 'roastChicken', oven);
    const serv1 = batchServings(s, 'roastChicken', oven);
    step(s, [{ type: 'upgradeObject', id: oven.id }]);
    expect(oven.tier).toBe(2);
    expect(s.money).toBe(100000 - stationDef('oven').cost);
    expect(batchCookTime(s, 'roastChicken', oven)).toBeLessThan(cook1);
    expect(batchServings(s, 'roastChicken', oven)).toBeGreaterThan(serv1);
    // Tier 3 needs 3 stars.
    s.reputation = 2.5;
    step(s, [{ type: 'upgradeObject', id: oven.id }]);
    expect(oven.tier).toBe(2);
    s.reputation = 3;
    step(s, [{ type: 'upgradeObject', id: oven.id }]);
    expect(oven.tier).toBe(3);
  });

  it('selling refunds part of what the upgrades cost', () => {
    const s = unlockedGame();
    s.money = 100000;
    const board = objOfType(s, 'cuttingBoard');
    step(s, [{ type: 'upgradeObject', id: board.id }]);
    const value = objectValue(board);
    expect(value).toBeGreaterThan(stationDef('cuttingBoard').cost);
    const before = s.money;
    step(s, [{ type: 'sellObject', id: board.id }]);
    expect(s.money - before).toBe(Math.floor(value * 0.5));
  });

  it('only stations that use a tier can be upgraded', () => {
    const s = newGame();
    expect(nextTier(objOfType(s, 'table2'))).toBeNull();
    expect(nextTier(objOfType(s, 'counter'))).toBeNull();
    expect(nextTier(objOfType(s, 'dishPit'))).not.toBeNull();
  });
});
