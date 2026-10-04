// "While you were away" (PLAN §9): a diff of the game before and after an
// absence, however it was simulated.

import { recipe } from '../../data/recipes';
import { SKILLS, type GameState, type Id, type Skill } from '../state';
import { values } from '../util';

export interface AwaySnapshot {
  time: number;
  money: number;
  revenue: number;
  tips: number;
  wagesPaid: number;
  soldByRecipe: Record<string, number>;
  customersServed: number;
  customersLost: number;
  reputation: number;
  levels: Record<Id, Record<Skill, number>>;
}

export interface AwayReport {
  seconds: number;
  money: number;
  income: number;
  wages: number;
  sold: { recipeId: string; n: number }[];
  guests: number;
  lost: number;
  reputation: { before: number; after: number };
  /** Batches waiting for the player to serve them. */
  ready: string[];
  levelUps: string[];
}

export function awaySnapshot(state: GameState): AwaySnapshot {
  const levels: AwaySnapshot['levels'] = {};
  for (const e of values(state.employees)) {
    levels[e.id] = Object.fromEntries(SKILLS.map((k) => [k, e.skills[k].level])) as Record<Skill, number>;
  }
  return {
    time: state.time,
    money: state.money,
    revenue: state.stats.revenue,
    tips: state.stats.tips,
    wagesPaid: state.stats.wagesPaid,
    soldByRecipe: { ...state.stats.soldByRecipe },
    customersServed: state.stats.customersServed,
    customersLost: state.stats.customersLost,
    reputation: state.reputation,
    levels,
  };
}

export function awayReport(before: AwaySnapshot, state: GameState): AwayReport {
  const sold = Object.entries(state.stats.soldByRecipe)
    .map(([recipeId, n]) => ({ recipeId, n: n - (before.soldByRecipe[recipeId] ?? 0) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  const levelUps: string[] = [];
  for (const e of values(state.employees)) {
    const was = before.levels[e.id];
    if (!was) continue;
    for (const k of SKILLS) if (e.skills[k].level > was[k]) levelUps.push(`${e.name}: ${k} ${was[k]} → ${e.skills[k].level}`);
  }
  return {
    seconds: state.time - before.time,
    money: state.money - before.money,
    income: state.stats.revenue + state.stats.tips - before.revenue - before.tips,
    wages: state.stats.wagesPaid - before.wagesPaid,
    sold,
    guests: state.stats.customersServed - before.customersServed,
    lost: state.stats.customersLost - before.customersLost,
    reputation: { before: before.reputation, after: state.reputation },
    ready: values(state.batches)
      .filter((b) => b.phase === 'ready' && !b.serveRequested)
      .map((b) => recipe(b.recipeId).name),
    levelUps,
  };
}
