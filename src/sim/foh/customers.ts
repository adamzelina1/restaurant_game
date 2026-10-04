// Guests (PLAN §6): arrive → wait at the host stand → sit → browse → order →
// wait for food → eat → pay + tip → leave. Parties share a table.

import { STAFF_COLORS } from '../../data/names';
import { clearGoal, isAt, setGoal, type AgentRef } from '../agents/movement';
import {
  BASE_PARTY_INTERVAL,
  BROWSE_TIME,
  CUSTOMER_WALK_SPEED,
  DECOR_BONUS,
  DECOR_MAX,
  DECOR_RANGE,
  MAX_WAITING_PARTIES,
  PATIENCE_FOOD,
  PATIENCE_ORDER,
  PATIENCE_SEAT,
  WAIT_BUDGET,
} from '../constants';
import { availableByRecipe, totalAvailable } from '../counters/counters';
import { varietyMult } from '../economy/demand';
import { distance } from '../grid/distance';
import { DIRS, allObjects, canStepStatic, layout, objectsOfKind, seatTiles, workTile, workTiles, type Tile } from '../grid/grid';
import { reputationTrafficMult, rateVisit } from '../reputation/reputation';
import { servingPrice } from '../progression/progression';
import { pick, randRange, weightedPick } from '../rng';
import { traitTipMult } from '../staff/traits';
import type { Customer, GameState, Party, PlacedObject } from '../state';
import { discardPlates } from './dishes';
import { abandonTask, createTask, deleteTask } from '../tasks/tasks';
import { clamp, message, newId, values } from '../util';

const PARTY_SIZES = [1, 2, 3, 4];
const PARTY_WEIGHTS = [0.3, 0.4, 0.15, 0.15];

export function entrance(state: GameState): PlacedObject | null {
  return objectsOfKind(state, 'entrance')[0] ?? null;
}

function hostTile(state: GameState): Tile | null {
  const h = objectsOfKind(state, 'host')[0];
  if (h) return workTile(h);
  const e = entrance(state);
  return e ? workTile(e) : null;
}

/** Open while there's food to sell or guests still inside (PLAN §6). */
export function hasGuests(state: GameState): boolean {
  return Object.keys(state.customers).length > 0 || values(state.parties).some((p) => p.toSpawn > 0);
}

// ---------------------------------------------------------------------------
// Arrivals

export function tickArrivals(state: GameState, dt: number): void {
  const door = entrance(state);
  const dishes = Object.values(availableByRecipe(state)).filter((n) => n > 0).length;
  if (door && dishes > 0) {
    state.nextPartyIn -= dt;
    if (state.nextPartyIn <= 0) {
      const waiting = values(state.parties).filter((p) => p.phase === 'queue').length;
      if (waiting < MAX_WAITING_PARTIES) newParty(state);
      const rate = reputationTrafficMult(state) * varietyMult(dishes);
      state.nextPartyIn += (BASE_PARTY_INTERVAL * randRange(state, 0.6, 1.4)) / rate;
    }
  } else {
    // Closed: the first party shows up soon after food is back on the counters.
    state.nextPartyIn = Math.min(state.nextPartyIn, 10);
  }
  // Party members walk in one at a time when the doorway is clear.
  if (!door) return;
  const dt0 = workTile(door);
  // Wait until the doorway area is clear, so guests file in without bumping.
  const near = (x: number, y: number) => Math.max(Math.abs(x - dt0.x), Math.abs(y - dt0.y)) <= 1;
  const blocked =
    values(state.customers).some((c) => near(c.x, c.y) || (c.step !== null && near(c.step.tx, c.step.ty))) ||
    values(state.employees).some((e) => e.x === dt0.x && e.y === dt0.y);
  if (blocked) return;
  const p = values(state.parties).find((q) => q.toSpawn > 0);
  if (p) spawnMember(state, p, dt0);
}

function newParty(state: GameState): Party {
  const size = weightedPick(state, PARTY_SIZES, (n) => PARTY_WEIGHTS[n - 1]) ?? 2;
  const p: Party = {
    id: newId(state, 'p'),
    size,
    members: [],
    toSpawn: size,
    phase: 'queue',
    phaseTime: 0,
    tableId: null,
    color: pick(state, STAFF_COLORS),
    angry: false,
    arrivedAt: state.time,
    seatedAt: null,
    readyToOrderAt: null,
    orderTakenAt: null,
  };
  state.parties[p.id] = p;
  return p;
}

function spawnMember(state: GameState, p: Party, at: Tile): void {
  const c: Customer = {
    id: newId(state, 'g'),
    partyId: p.id,
    seat: null,
    dish: null,
    counterId: null,
    plate: null,
    servedAt: null,
    servedBy: null,
    eatLeft: 0,
    satisfaction: null,
    x: at.x,
    y: at.y,
    step: null,
    goal: null,
    blocked: 0,
    detour: [],
  };
  state.customers[c.id] = c;
  if (p.tableId) c.seat = p.members.length;
  p.members.push(c.id);
  p.toSpawn--;
}

// ---------------------------------------------------------------------------
// Tables

/** Smallest free table that fits the party and that guests can reach. */
function findTable(state: GameState, p: Party): PlacedObject | null {
  const door = entrance(state);
  if (!door) return null;
  const from = workTile(door);
  let best: PlacedObject | null = null;
  let bestKey = Infinity;
  for (const o of objectsOfKind(state, 'table')) {
    if (o.table!.partyId || o.table!.dirty > 0) continue;
    const seats = seatTiles(o);
    if (seats.length < p.size) continue;
    if (!seats.slice(0, p.size).every((s) => Number.isFinite(distance(state, from.x, from.y, s.x, s.y)))) continue;
    const d = distance(state, from.x, from.y, seats[0].x, seats[0].y);
    const key = seats.length * 1000 + d;
    if (key < bestKey) {
      bestKey = key;
      best = o;
    }
  }
  return best;
}

function seatTile(state: GameState, c: Customer): Tile | null {
  const p = state.parties[c.partyId];
  const t = p?.tableId ? state.objects[p.tableId] : null;
  if (!t || c.seat === null) return null;
  return seatTiles(t)[c.seat] ?? null;
}

// ---------------------------------------------------------------------------
// Satisfaction, payment, leaving

function decorBonus(state: GameState, p: Party): number {
  const t = p.tableId ? state.objects[p.tableId] : null;
  if (!t) return 0;
  let n = 0;
  for (const o of objectsOfKind(state, 'decor')) {
    if (Math.max(Math.abs(o.x - t.x), Math.abs(o.y - t.y)) <= DECOR_RANGE) n++;
  }
  return Math.min(DECOR_MAX, n * DECOR_BONUS);
}

/** Satisfaction = f(wait times, dish quality incl. plating, decor) (PLAN §6). */
export function satisfaction(waited: number, quality: number, decor: number): number {
  const waitScore = clamp(1 - waited / WAIT_BUDGET, 0, 1);
  return clamp(0.2 + 0.45 * quality + 0.35 * waitScore + decor, 0, 1);
}

function waitedFor(p: Party, c: Customer): number {
  const seat = (p.seatedAt ?? p.arrivedAt) - p.arrivedAt;
  const order = (p.orderTakenAt ?? p.readyToOrderAt ?? 0) - (p.readyToOrderAt ?? 0);
  const food = (c.servedAt ?? p.orderTakenAt ?? 0) - (p.orderTakenAt ?? 0);
  return Math.max(0, seat) + Math.max(0, order) + Math.max(0, food);
}

function pay(state: GameState, p: Party): void {
  const decor = decorBonus(state, p);
  for (const id of p.members) {
    const c = state.customers[id];
    if (!c) continue;
    if (!c.dish || c.plate?.at !== 'table') {
      // Sat down but got nothing.
      c.satisfaction = 0.15;
      rateVisit(state, c.satisfaction);
      continue;
    }
    c.satisfaction = satisfaction(waitedFor(p, c), c.plate.quality, decor);
    const server = c.servedBy ? state.employees[c.servedBy] : null;
    const price = servingPrice(state, c.dish);
    const tip = Math.round(price * (0.05 + 0.35 * c.satisfaction) * (server ? traitTipMult(server) : 1) * 100) / 100;
    state.money += price + tip;
    state.stats.revenue += price;
    state.stats.tips += tip;
    state.stats.servingsSold++;
    state.stats.soldByRecipe[c.dish] = (state.stats.soldByRecipe[c.dish] ?? 0) + 1;
    state.stats.customersServed++;
    rateVisit(state, c.satisfaction);
  }
}

function startLeaving(state: GameState, p: Party): void {
  p.phase = 'leaving';
  p.phaseTime = 0;
  const t = p.tableId ? state.objects[p.tableId] : null;
  if (t?.table?.partyId === p.id) t.table.partyId = null;
  // Their plates stay behind: the table is dirty until it's bussed (PLAN §6).
  for (const id of p.members) {
    const c = state.customers[id];
    if (c?.plate?.at !== 'table') continue;
    c.plate = null;
    if (t?.table) t.table.dirty++;
    else discardPlates(state, 1);
  }
}

/** Patience ran out: everyone leaves, unhappy (PLAN §6). */
function leaveAngry(state: GameState, p: Party, why: string): void {
  p.angry = true;
  for (const id of p.members) {
    const c = state.customers[id];
    if (!c) continue;
    // Release the serving promised to this guest, and any plate waiting on the pass.
    if (c.dish && c.counterId && !c.plate) {
      const counter = state.objects[c.counterId];
      if (counter?.counter) counter.counter.reserved = Math.max(0, counter.counter.reserved - 1);
    }
    if (c.plate?.passId) {
      const pass = state.objects[c.plate.passId];
      if (pass?.pass) pass.pass.plates = pass.pass.plates.filter((x) => x !== c.id);
      // The food is scraped and the plate goes to the dish pit.
      c.plate = null;
      discardPlates(state, 1);
    }
    c.satisfaction = 0;
    rateVisit(state, 0);
    state.stats.customersLost++;
  }
  state.stats.customersLost += p.toSpawn;
  p.toSpawn = 0;
  // Plates already on the table are left dirty; carried ones are dealt with below.
  startLeaving(state, p);
  for (const t of values(state.tasks)) {
    if (t.partyId !== p.id && !(t.customerId && p.members.includes(t.customerId))) continue;
    const e = t.claimedBy ? state.employees[t.claimedBy] : null;
    if (e) abandonTask(state, e);
    deleteTask(state, t.id);
  }
  message(state, `A party of ${p.size} left angry: ${why}`, 'warn');
}

// ---------------------------------------------------------------------------
// Per-tick behaviour

export function customersDecide(state: GameState, dt: number): void {
  for (const p of values(state.parties)) {
    p.phaseTime += dt;
    switch (p.phase) {
      case 'queue':
        if (!p.tableId) {
          const t = findTable(state, p);
          if (t) {
            t.table!.partyId = p.id;
            p.tableId = t.id;
            p.members.forEach((id, i) => (state.customers[id].seat = i));
          }
        }
        if (p.tableId) {
          p.phase = 'seating';
          p.phaseTime = 0;
        } else if (p.phaseTime > PATIENCE_SEAT) leaveAngry(state, p, 'no table');
        break;
      case 'seating':
        if (p.toSpawn === 0 && p.members.every((id) => {
          const c = state.customers[id];
          const s = c && seatTile(state, c);
          return !!s && isAt(c, s.x, s.y);
        })) {
          p.phase = 'browsing';
          p.phaseTime = 0;
          p.seatedAt = state.time;
        }
        break;
      case 'browsing':
        if (p.phaseTime >= BROWSE_TIME) {
          p.phase = 'waitOrder';
          p.phaseTime = 0;
          p.readyToOrderAt = state.time;
          createTask(state, 'takeOrder', 'Orders', { partyId: p.id });
        }
        break;
      case 'waitOrder':
        if (p.phaseTime > PATIENCE_ORDER) leaveAngry(state, p, 'nobody took their order');
        break;
      case 'waitFood': {
        const members = p.members.map((id) => state.customers[id]).filter(Boolean);
        for (const c of members) if (c.plate?.at === 'table') c.eatLeft -= dt;
        const waiting = members.some((c) => c.dish && c.plate?.at !== 'table');
        if (!waiting) {
          p.phase = 'eating';
          p.phaseTime = 0;
        } else if (p.phaseTime > PATIENCE_FOOD) leaveAngry(state, p, 'the food took too long');
        break;
      }
      case 'eating': {
        const members = p.members.map((id) => state.customers[id]).filter(Boolean);
        for (const c of members) if (c.plate?.at === 'table') c.eatLeft -= dt;
        if (members.every((c) => c.plate?.at !== 'table' || c.eatLeft <= 0)) {
          pay(state, p);
          startLeaving(state, p);
        }
        break;
      }
      case 'leaving':
        break;
    }
  }

  // Movement goals. Waiting guests line up on queue spots in arrival order.
  const door = entrance(state);
  const spots = queueSpots(state);
  let place = 0;
  for (const p of values(state.parties)) {
    for (const id of p.members) {
      const c = state.customers[id];
      if (!c) continue;
      if (p.phase === 'leaving') {
        if (door) setGoal(c, workTile(door).x, workTile(door).y);
        continue;
      }
      const seat = seatTile(state, c);
      if (seat) setGoal(c, seat.x, seat.y);
      else if (spots.length) {
        const s = spots[Math.min(place++, spots.length - 1)];
        setGoal(c, s.x, s.y);
      } else clearGoal(c);
    }
  }
}

const queueCache = new WeakMap<object, { version: number; spots: Tile[] }>();

/**
 * Where waiting guests stand: the dining tiles nearest the host stand that
 * keep the doorway, chairs and waiters' tiles clear. Cached per layout.
 */
export function queueSpots(state: GameState): Tile[] {
  const cached = queueCache.get(state.grid);
  if (cached && cached.version === state.layoutVersion) return cached.spots;
  const spots: Tile[] = [];
  const host = hostTile(state);
  const door = entrance(state);
  if (host && door) {
    const dt0 = workTile(door);
    const reserved = new Set<string>();
    for (const o of allObjects(state)) {
      for (const t of [...workTiles(o), ...seatTiles(o)]) reserved.add(`${t.x},${t.y}`);
    }
    reserved.delete(`${host.x},${host.y}`);
    const l = layout(state);
    const seen = new Set<string>([`${host.x},${host.y}`]);
    const queue: Tile[] = [host];
    while (queue.length && spots.length < 16) {
      const t = queue.shift()!;
      const nearDoor = Math.max(Math.abs(t.x - dt0.x), Math.abs(t.y - dt0.y)) <= 1;
      if (!nearDoor && !reserved.has(`${t.x},${t.y}`)) spots.push(t);
      for (const [dx, dy] of DIRS) {
        const n = { x: t.x + dx, y: t.y + dy };
        const k = `${n.x},${n.y}`;
        if (seen.has(k) || !canStepStatic(l, t.x, t.y, dx, dy)) continue;
        seen.add(k);
        queue.push(n);
      }
    }
  }
  queueCache.set(state.grid, { version: state.layoutVersion, spots });
  return spots;
}

/** Guests who reach the door on their way out disappear; empty parties are removed. */
export function customersAfterMove(state: GameState): void {
  const door = entrance(state);
  const dt0 = door ? workTile(door) : null;
  for (const c of values(state.customers)) {
    const p = state.parties[c.partyId];
    // Leavers step out once they're at (or right next to) the door, so they
    // don't fight arriving guests for the doorway tile.
    const atDoor = !dt0 || (!c.step && Math.max(Math.abs(c.x - dt0.x), Math.abs(c.y - dt0.y)) <= 1);
    if (!p || (p.phase === 'leaving' && atDoor)) delete state.customers[c.id];
  }
  for (const p of values(state.parties)) {
    if (p.phase === 'leaving' && p.toSpawn === 0 && p.members.every((id) => !state.customers[id])) delete state.parties[p.id];
  }
}

export function customerAgents(state: GameState): AgentRef[] {
  const out: AgentRef[] = [];
  let i = 0;
  for (const c of values(state.customers)) {
    const p = state.parties[c.partyId];
    const seat = seatTile(state, c);
    const seated = !!seat && isAt(c, seat.x, seat.y) && p?.phase !== 'leaving';
    out.push({
      id: c.id,
      m: c,
      speed: CUSTOMER_WALK_SPEED,
      order: 50000 + i++,
      canYield: !seated && !c.goal,
      canSwap: !seated,
    });
  }
  return out;
}

/** Fraction of patience used in the current phase, for UI. */
export function patienceUsed(p: Party): number {
  const limit = p.phase === 'queue' ? PATIENCE_SEAT : p.phase === 'waitOrder' ? PATIENCE_ORDER : p.phase === 'waitFood' ? PATIENCE_FOOD : 0;
  return limit ? clamp(p.phaseTime / limit, 0, 1) : 0;
}

export function isOpenForBusiness(state: GameState): boolean {
  return totalAvailable(state) > 0 || hasGuests(state);
}

