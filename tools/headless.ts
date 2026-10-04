// Headless runner (PLAN §12): run the sim with no rendering.
//
//   npm run headless -- balance [hours] [smart|short|long|best]
//   npm run headless -- stress [trials]
//   npm run headless -- bench
//   npm run headless -- offline [hours]

import { RECIPES } from '../src/data/recipes';
import { moveAgents, setGoal, type AgentRef } from '../src/sim/agents/movement';
import { SQUEEZE_AFTER, TICK_RATE } from '../src/sim/constants';
import { distance } from '../src/sim/grid/distance';
import { emptyState, newGame, paintFloor } from '../src/sim/newGame';
import { rand } from '../src/sim/rng';
import { Floor, type Mover } from '../src/sim/state';
import { step } from '../src/sim/step';
import { offlineCatchUp } from '../src/sim/offline/offline';
import { awayReport, awaySnapshot } from '../src/sim/offline/report';
import { botCommands, type Strategy } from './bot';

function pad(s: string | number, n: number): string {
  return String(s).padEnd(n);
}

function balance(hours: number, strategy: Strategy): void {
  const s = newGame(1);
  // The naive strategies need a cushion; 'smart' plays from the real start.
  if (strategy !== 'smart') s.money = 2000;
  const ticks = hours * 3600 * TICK_RATE;
  const t0 = performance.now();
  const every = Math.max(1, Math.round(hours / 12));
  console.log(`\n  hour    money  rep  staff recipes  served  lost  sold/h`);
  let lastSold = 0;
  for (let i = 0; i < ticks; i++) {
    // The bot acts once per sim second, like a very attentive player.
    step(s, i % TICK_RATE === 0 ? botCommands(s, strategy) : []);
    if ((i + 1) % (every * 3600 * TICK_RATE) === 0) {
      const h = (i + 1) / (3600 * TICK_RATE);
      console.log(
        `  ${pad(h, 6)} ${pad('$' + Math.round(s.money), 8)} ${pad(s.reputation.toFixed(1), 4)} ${pad(Object.keys(s.employees).length, 5)} ` +
          `${pad(s.unlockedRecipes.length, 7)} ${pad(s.stats.customersServed, 7)} ${pad(s.stats.customersLost, 5)} ${Math.round((s.stats.servingsSold - lastSold) / every)}`,
      );
      lastSold = s.stats.servingsSold;
    }
  }
  const ms = performance.now() - t0;
  const income = s.stats.revenue + s.stats.tips;
  console.log(`\n=== Balance: ${hours} h, strategy "${strategy}" (${(ms / 1000).toFixed(1)} s real) ===`);
  console.log(`Money: $${Math.round(s.money)}  income $${Math.round(income)}  spent $${Math.round(s.stats.spent)}  wages $${Math.round(s.stats.wagesPaid)}`);
  console.log(`Profit/hour: $${Math.round((income - s.stats.spent - s.stats.wagesPaid) / hours)}  servings sold: ${s.stats.servingsSold}  batches served: ${s.stats.batchesServed}`);
  console.log('\nSold by recipe:');
  for (const [id, n] of Object.entries(s.stats.soldByRecipe)) console.log(`  ${pad(RECIPES[id].name, 16)} ${n}`);
  console.log('\nStaff time:');
  for (const e of Object.values(s.employees)) {
    const total = Object.values(e.time).reduce((a, b) => a + b, 0);
    const p = (k: keyof typeof e.time) => `${pad(k, 7)} ${pad(((100 * e.time[k]) / total).toFixed(1) + '%', 7)}`;
    console.log(`  ${pad(e.name, 8)} ${p('working')} ${p('walking')} ${p('blocked')} ${p('idle')}`);
  }
  const hot = Object.entries(s.stats.blockedByTile)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([i, t]) => `(${Number(i) % s.grid.width},${Math.floor(Number(i) / s.grid.width)}) ${t.toFixed(1)}s`);
  console.log(`\nWorst blocking tiles: ${hot.join(', ') || 'none'}`);
}

/** A few squeeze attempts' worth of waiting. */
const STUCK_LIMIT = SQUEEZE_AFTER * 4;

/** Random cramped layouts with many agents: nobody may stay stuck past the squeeze timeout. */
function stress(trials: number): void {
  let worst = 0;
  let failures = 0;
  for (let trial = 0; trial < trials; trial++) {
    const w = 8 + (trial % 6);
    const h = 5 + (trial % 4);
    const s = emptyState(w, h, 1000 + trial);
    paintFloor(s, Floor.Open, 0, 0, w, h);
    for (let i = 0; i < (w * h) / 6; i++) {
      const x = Math.floor(rand(s) * w);
      const y = Math.floor(rand(s) * h);
      s.grid.floor[y * w + x] = Floor.Wall;
    }
    s.layoutVersion++;
    const free: [number, number][] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (s.grid.floor[y * w + x] === Floor.Open) free.push([x, y]);
    const shuffled = () => [...free].sort(() => rand(s) - 0.5);
    const n = Math.min(10, Math.floor(free.length / 3));
    const starts = shuffled().slice(0, n);
    const agents: AgentRef[] = starts.map(([x, y], i) => {
      const m: Mover = { x, y, step: null, goal: null, blocked: 0, detour: [] };
      return { id: `a${i}`, m, speed: 2.5, order: i, canYield: false, canSwap: true };
    });
    let maxBlocked = 0;
    // Keep handing out new random goals for two simulated minutes.
    for (let t = 0; t < 120 * TICK_RATE; t++) {
      for (const a of agents) {
        if (!a.m.goal || (a.m.x === a.m.goal.x && a.m.y === a.m.goal.y && !a.m.step)) {
          // Only goals reachable on the static layout; sealed pockets aren't a blocking bug.
          for (let tries = 0; tries < 20; tries++) {
            const g = free[Math.floor(rand(s) * free.length)];
            if (Number.isFinite(distance(s, a.m.x, a.m.y, g[0], g[1]))) {
              setGoal(a.m, g[0], g[1]);
              break;
            }
          }
        }
      }
      moveAgents(s, agents, 1 / TICK_RATE);
      for (const a of agents) maxBlocked = Math.max(maxBlocked, a.m.blocked);
    }
    worst = Math.max(worst, maxBlocked);
    if (maxBlocked > STUCK_LIMIT) {
      failures++;
      const stuck = agents.filter((a) => a.m.blocked > STUCK_LIMIT).map((a) => `${a.id}@(${a.m.x},${a.m.y})→(${a.m.goal?.x},${a.m.goal?.y})`);
      console.log(`  trial ${trial} (${w}×${h}): stuck ${stuck.join(' ')}`);
    }
  }
  console.log(`Stress: ${trials} trials, worst blocked streak ${worst.toFixed(1)} s, ${failures} trials over ${STUCK_LIMIT} s`);
  if (failures > 0) process.exitCode = 1;
}

function bench(): void {
  const s = newGame(1);
  s.money = 1e6;
  const ticks = 3600 * TICK_RATE;
  const t0 = performance.now();
  for (let i = 0; i < ticks; i++) step(s, i % TICK_RATE === 0 ? botCommands(s, 'short') : []);
  const ms = performance.now() - t0;
  console.log(`Bench: 1 sim hour (${ticks} ticks) in ${ms.toFixed(0)} ms → ${Math.round(ticks / (ms / 1000))} ticks/s`);
}

/**
 * Validate the coarse offline model (PLAN §9, §12): play online for a while,
 * leave with long batches started, then compare `offlineCatchUp` with a full
 * tick simulation of the same absence.
 */
function offline(hours: number): void {
  const s = newGame(1);
  s.money = 3000;
  for (let i = 0; i < 2 * 3600 * TICK_RATE; i++) step(s, i % TICK_RATE === 0 ? botCommands(s, 'best') : []);
  // Before leaving: serve what's ready and start long batches everywhere.
  for (let i = 0; i < 3; i++) step(s, botCommands(s, 'long'));
  const ticked = structuredClone(s);
  const coarse = structuredClone(s);
  const before = awaySnapshot(s);

  let t0 = performance.now();
  for (let i = 0; i < hours * 3600 * TICK_RATE; i++) step(ticked);
  const tickMs = performance.now() - t0;
  t0 = performance.now();
  offlineCatchUp(coarse, hours * 3600);
  const coarseMs = performance.now() - t0;

  const a = awayReport(before, ticked);
  const b = awayReport(before, coarse);
  const row = (label: string, x: number | string, y: number | string) => console.log(`  ${pad(label, 22)} ${pad(x, 14)} ${y}`);
  console.log(`\n=== Offline model vs tick sim: ${hours} h away ===`);
  row('', 'ticks', 'coarse');
  row('real time', `${(tickMs / 1000).toFixed(1)} s`, `${coarseMs.toFixed(0)} ms`);
  row('money change', `$${Math.round(a.money)}`, `$${Math.round(b.money)}`);
  row('income', `$${Math.round(a.income)}`, `$${Math.round(b.income)}`);
  row('wages', `$${Math.round(a.wages)}`, `$${Math.round(b.wages)}`);
  row('guests served', a.guests, b.guests);
  for (const id of new Set([...a.sold, ...b.sold].map((x) => x.recipeId))) {
    row(`  ${RECIPES[id].name}`, a.sold.find((x) => x.recipeId === id)?.n ?? 0, b.sold.find((x) => x.recipeId === id)?.n ?? 0);
  }
  row('reputation', a.reputation.after.toFixed(2), b.reputation.after.toFixed(2));
  row('batches ready', a.ready.join(', ') || '-', b.ready.join(', ') || '-');
  row('level-ups', a.levelUps.length, b.levelUps.length);
}

const [cmd = 'balance', a, b] = process.argv.slice(2);
if (cmd === 'balance') balance(Number(a ?? 8), (b as Strategy) ?? 'smart');
else if (cmd === 'stress') stress(Number(a ?? 40));
else if (cmd === 'bench') bench();
else if (cmd === 'offline') for (const h of a ? [Number(a)] : [1, 4, 12]) offline(h);
else console.log('Usage: headless balance [hours] [short|long|best] | stress [trials] | bench | offline [hours]');
