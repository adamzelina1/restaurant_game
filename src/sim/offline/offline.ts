// Offline progress (PLAN §9). Short absences are simulated tick by tick. Long
// ones use a coarse event model that steps in 10-minute chunks with no agents
// or pathfinding: batches load at the kitchen's measured throughput, cook on
// schedule and then wait READY for the player; counters sell down at the
// lower of guest demand and the service rate measured online.

import { recipe } from '../../data/recipes';
import { stationDef } from '../../data/stations';
import {
  BASE_PARTY_INTERVAL,
  OFFLINE_CAP,
  OFFLINE_CHUNK,
  OFFLINE_TICK_LIMIT,
  ORDER_TIME_PER_GUEST,
  PLATE_TIME,
  SERVE_TIME,
  TICK_RATE,
} from '../constants';
import { availableByRecipe, counters, stockQuality, takeServing } from '../counters/counters';
import { varietyMult } from '../economy/demand';
import { serviceRate } from '../economy/rolling';
import { recordSale } from '../economy/sales';
import { payrollPerHour } from '../economy/wages';
import { AVG_PARTY_SIZE, entrance, settleGuests } from '../foh/customers';
import { finishCooking, onCrateLoaded, putBatchOnCounter } from '../production/batches';
import { dishAppeal, servingPrice } from '../progression/progression';
import { rateVisit, reputationTrafficMult } from '../reputation/reputation';
import { weightedPick } from '../rng';
import { empWorkSpeed, qualityLevel } from '../skills';
import { tickHiring } from '../staff/hiring';
import { gainXp } from '../staff/xp';
import type { Batch, Employee, GameState, Id, Skill, WorkType } from '../state';
import { step } from '../step';
import { abandonTask, counterAccepts, createTask, deleteTask } from '../tasks/tasks';
import { clamp, values } from '../util';

/** Fractional progress carried between chunks. */
interface Carry {
  /** Crates' worth of loading done per batch. */
  loading: Map<Id, number>;
  /** Fraction of a serving sold. */
  sold: number;
}

/** Catch up `elapsed` seconds of absence (capped at 24 h). */
export function offlineCatchUp(state: GameState, elapsed: number): void {
  const ticks = Math.round(Math.min(Math.max(0, elapsed), OFFLINE_CAP) * TICK_RATE);
  if (ticks <= OFFLINE_TICK_LIMIT * TICK_RATE) {
    for (let i = 0; i < ticks; i++) step(state);
    return;
  }
  settle(state);
  const carry: Carry = { loading: new Map(), sold: 0 };
  const chunk = OFFLINE_CHUNK * TICK_RATE;
  for (let left = ticks; left > 0; left -= chunk) {
    const n = Math.min(chunk, left);
    coarseChunk(state, n / TICK_RATE, carry);
    state.tick += n;
    state.time = state.tick / TICK_RATE;
    tickHiring(state);
  }
  rebuildTasks(state);
}

// ---------------------------------------------------------------------------
// Entering and leaving the coarse model

/**
 * Freeze the agent world into something the coarse model understands: guests
 * finish up, staff put down what they carry, every task is dropped, and pots
 * the player already sent to a counter are assumed delivered.
 */
function settle(state: GameState): void {
  settleGuests(state);
  for (const e of values(state.employees)) {
    abandonTask(state, e);
    e.step = null;
    e.goal = null;
    e.detour = [];
    e.blocked = 0;
  }
  for (const t of values(state.tasks)) deleteTask(state, t.id);
  for (const o of values(state.objects)) {
    if (o.dishPit) {
      o.dishPit.dirty = 0;
      o.dishPit.incoming = [];
    }
  }
  state.plates.clean = state.plates.total;
  state.heat = 0;
  for (const b of values(state.batches)) {
    if (!b.serveRequested) continue;
    const counter = counterFor(state, b.recipeId);
    if (counter) putBatchOnCounter(state, b, counter);
  }
}

/** A counter that can take this dish, preferring one that already holds it. */
function counterFor(state: GameState, recipeId: string) {
  const ok = counters(state).filter((c) => counterAccepts(state, c, recipeId));
  return ok.find((c) => c.counter!.recipeId === recipeId) ?? ok[0] ?? null;
}

/** Put the task board back together for the agents when the player returns. */
function rebuildTasks(state: GameState): void {
  for (const t of values(state.tasks)) deleteTask(state, t.id);
  for (const b of values(state.batches)) {
    if (b.phase === 'loading') {
      for (const cid of b.crates) {
        const c = state.crates[cid];
        if (!c || c.loc.kind === 'loaded') continue;
        if (c.loc.kind === 'station' && c.needsPrep && !c.prepped) createTask(state, 'prep', 'Prep', { batchId: b.id, crateId: c.id });
        else createTask(state, 'deliver', 'Haul', { batchId: b.id, crateId: c.id });
      }
    } else if (b.phase === 'cooking' && recipe(b.recipeId).cookMode === 'active') {
      createTask(state, 'tend', 'Cook', { batchId: b.id });
    } else if (b.serveRequested) {
      createTask(state, 'carryBatch', 'Haul', { batchId: b.id, urgent: true });
    }
  }
}

// ---------------------------------------------------------------------------
// One chunk

function coarseChunk(state: GameState, dt: number, carry: Carry): void {
  const t0 = state.time;
  for (const b of values(state.batches)) advanceBatch(state, b, t0, dt, carry);
  sell(state, dt, carry);
}

/** Staff who'd do this kind of work, keeping only the highest priority tier. */
function workers(state: GameState, w: WorkType): Employee[] {
  const able = values(state.employees).filter((e) => e.priorities[w] > 0);
  const top = Math.min(...able.map((e) => e.priorities[w]));
  return able.filter((e) => e.priorities[w] === top);
}

function bestQualityLevel(state: GameState, skill: Skill, w: WorkType): number {
  let best = 0;
  for (const e of workers(state, w)) best = Math.max(best, qualityLevel(e, skill));
  return best;
}

/** Load the next crate as if the staff had fetched, prepped and carried it. */
function loadOneCrate(state: GameState, b: Batch): void {
  const c = b.crates.map((id) => state.crates[id]).find((x) => x && x.loc.kind !== 'loaded');
  if (!c) return;
  if (c.loc.kind === 'station') {
    const st = state.objects[c.loc.id];
    if (st?.prep?.crateId === c.id) st.prep.crateId = null;
  }
  if (c.needsPrep && !c.prepped) {
    b.prepSkillSum += bestQualityLevel(state, c.prepSkill!, 'Prep');
    b.prepSkillCount++;
    c.prepped = true;
  }
  c.loc = { kind: 'loaded' };
  const skill = stationDef(recipe(b.recipeId).station).skill;
  if (skill) {
    b.cookSkillSum += bestQualityLevel(state, skill, 'Cook');
    b.cookSkillCount++;
  }
  onCrateLoaded(state, b);
}

function advanceBatch(state: GameState, b: Batch, t0: number, dt: number, carry: Carry): void {
  // Seconds into the chunk at which cooking (re)starts.
  let at = 0;
  if (b.phase === 'loading') {
    const per = Math.max(1, state.rolling.loadPerCrate);
    let prog = (carry.loading.get(b.id) ?? 0) + dt / per;
    while (prog >= 1 && b.phase === 'loading') {
      loadOneCrate(state, b);
      prog -= 1;
    }
    if (b.phase === 'loading') {
      carry.loading.set(b.id, prog);
      return;
    }
    carry.loading.delete(b.id);
    at = dt - prog * per;
  }
  if (b.phase !== 'cooking') return;
  const r = recipe(b.recipeId);
  let speed = 1;
  if (r.cookMode === 'active') {
    // Active recipes cook at the best available cook's pace (or not at all).
    const skill = stationDef(r.station).skill ?? 'Saute';
    speed = Math.max(0, ...workers(state, 'Cook').map((e) => empWorkSpeed(e, skill)));
    if (speed <= 0) return;
  }
  const need = b.cookTime - b.cookDone - b.clickRemoved;
  const avail = (dt - at) * speed;
  if (avail < need) {
    b.cookDone += avail;
    return;
  }
  b.cookDone += need;
  finishCooking(state, b, t0 + at + need / speed);
}

/** Guests per second the restaurant draws with this many dishes in stock. */
export function guestRate(state: GameState, dishes: number): number {
  if (dishes <= 0) return 0;
  return (AVG_PARTY_SIZE * reputationTrafficMult(state) * varietyMult(dishes)) / BASE_PARTY_INTERVAL;
}

function sell(state: GameState, dt: number, carry: Carry): void {
  const avail = availableByRecipe(state);
  const dishes = Object.keys(avail).filter((r) => avail[r] > 0);
  const stock = dishes.reduce((n, r) => n + avail[r], 0);
  if (stock <= 0 || !entrance(state)) return;
  const want = Math.min(guestRate(state, dishes.length), serviceRate(state)) * dt;
  carry.sold += Math.min(want, stock);
  const n = Math.min(stock, Math.floor(carry.sold));
  carry.sold -= n;
  const r = state.rolling;
  const left = { ...avail };
  for (let i = 0; i < n; i++) {
    const options = dishes.filter((d) => left[d] > 0);
    const dish = weightedPick(state, options, (d) => dishAppeal(state, d) * (0.5 + (stockQuality(state, d) ?? 0)));
    if (!dish) break;
    left[dish]--;
    const q = takeServing(state, dish);
    if (q === null) continue;
    const price = servingPrice(state, dish);
    // Guests feel the food's quality relative to what was measured online.
    const sat = clamp(r.satisfaction + 0.45 * (q - r.quality), 0, 1);
    const tip = Math.round(price * Math.max(0, r.tipFrac + 0.35 * (sat - r.satisfaction)) * 100) / 100;
    recordSale(state, dish, price, tip);
    rateVisit(state, sat);
  }
  // Wages only for the part of the chunk the restaurant had food to sell.
  const open = want > stock ? stock / want : 1;
  const wages = (payrollPerHour(state) * dt * open) / 3600;
  state.money -= wages;
  state.stats.wagesPaid += wages;
  trainService(state, n);
}

/** Service and Plating XP for the servings sold (PLAN §9). */
function trainService(state: GameState, servings: number): void {
  if (servings <= 0) return;
  const platers = workers(state, 'Plate');
  for (const e of platers) gainXp(state, e, 'Plating', (PLATE_TIME * servings) / platers.length);
  const waiters = workers(state, 'Serve');
  for (const e of waiters) gainXp(state, e, 'Service', ((ORDER_TIME_PER_GUEST + SERVE_TIME) * servings) / waiters.length);
}
