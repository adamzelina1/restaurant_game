// Headless runner (PLAN §12): run the sim with no rendering.
//
//   npm run headless -- balance [hours] [short|long|best]
//   npm run headless -- stress [trials]
//   npm run headless -- bench

import { RECIPES } from '../src/data/recipes';
import { moveAgents, setGoal, type AgentRef } from '../src/sim/agents/movement';
import { SQUEEZE_AFTER, TICK_RATE } from '../src/sim/constants';
import { distance } from '../src/sim/grid/distance';
import { emptyState, newGame, paintFloor } from '../src/sim/newGame';
import { rand } from '../src/sim/rng';
import { Floor, type Mover } from '../src/sim/state';
import { step } from '../src/sim/step';
import { botCommands, type Strategy } from './bot';

function pad(s: string | number, n: number): string {
  return String(s).padEnd(n);
}

function balance(hours: number, strategy: Strategy): void {
  const s = newGame(1);
  s.money = 2000;
  const ticks = hours * 3600 * TICK_RATE;
  const t0 = performance.now();
  for (let i = 0; i < ticks; i++) {
    // The bot acts once per sim second, like a very attentive player.
    step(s, i % TICK_RATE === 0 ? botCommands(s, strategy) : []);
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

const [cmd = 'balance', a, b] = process.argv.slice(2);
if (cmd === 'balance') balance(Number(a ?? 8), (b as Strategy) ?? 'best');
else if (cmd === 'stress') stress(Number(a ?? 40));
else if (cmd === 'bench') bench();
else console.log('Usage: headless balance [hours] [short|long|best] | stress [trials] | bench');
