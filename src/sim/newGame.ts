import { STARTER, type Placement, type StarterStaff } from '../data/starter';
import { stationDef } from '../data/stations';
import { START_PLATES } from './constants';
import { starterRecipes } from './progression/progression';
import { createRng } from './rng';
import { addEmployee, refreshCandidates } from './staff/hiring';
import { wageFor } from './staff/xp';
import {
  Floor,
  SKILLS,
  WORK_TYPES,
  type Employee,
  type GameState,
  type PlacedObject,
  type Skill,
  type SkillState,
} from './state';
import { newId } from './util';

export const STATE_VERSION = 6;

const FLOOR_OF = { floor: Floor.Open, wall: Floor.Wall } as const;

export function emptyState(width: number, height: number, seed: number): GameState {
  return {
    version: STATE_VERSION,
    tick: 0,
    time: 0,
    rng: createRng(seed),
    nextId: 1,
    money: 0,
    layoutVersion: 1,
    grid: { width, height, floor: new Array(width * height).fill(Floor.Void) },
    objects: {},
    employees: {},
    customers: {},
    parties: {},
    batches: {},
    crates: {},
    tasks: {},
    heat: 0,
    nextPartyIn: 10,
    plates: { clean: START_PLATES, total: START_PLATES },
    unlockedRecipes: starterRecipes(),
    mastery: {},
    reputation: 1,
    hiring: { candidates: [], refreshAt: 0 },
    messages: [],
    nextMessageId: 1,
    stats: {
      servingsSold: 0,
      revenue: 0,
      tips: 0,
      spent: 0,
      soldByRecipe: {},
      batchesServed: 0,
      wagesPaid: 0,
      customersServed: 0,
      customersLost: 0,
      platesBroken: 0,
      blockedByTile: {},
      trafficByTile: {},
    },
  };
}

export function paintFloor(state: GameState, floor: Floor, x: number, y: number, w: number, h: number): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (xx < 0 || yy < 0 || xx >= state.grid.width || yy >= state.grid.height) continue;
      state.grid.floor[yy * state.grid.width + xx] = floor;
    }
  }
  state.layoutVersion++;
}

export function placeObject(state: GameState, p: Placement, tier = 1): PlacedObject {
  const def = stationDef(p.type);
  const o: PlacedObject = { id: newId(state, 'o'), type: p.type, x: p.x, y: p.y, rot: p.rot, tier };
  if (def.kind === 'cook') o.cook = { batchId: null };
  if (def.kind === 'prep') o.prep = { crateId: null, reservedBy: null };
  if (def.kind === 'counter') o.counter = { recipeId: null, lots: [], incoming: [], reserved: 0 };
  if (def.kind === 'table') o.table = { partyId: null, dirty: 0 };
  if (def.kind === 'dishpit') o.dishPit = { dirty: 0, incoming: [] };
  if (def.kind === 'pass') o.pass = { plates: [], incoming: [] };
  state.objects[o.id] = o;
  state.layoutVersion++;
  return o;
}

/** Turn a starter-staff definition into an employee standing at (x, y). */
export function makeEmployee(state: GameState, st: StarterStaff, x: number, y: number): Employee {
  const skills = {} as Record<Skill, SkillState>;
  for (const k of SKILLS) {
    const [level, passion] = st.skills[k] ?? [0, 0];
    skills[k] = { level, xp: 0, passion };
  }
  const e = addEmployee(
    state,
    { name: st.name, color: st.color, skills, traits: st.traits, walkSpeed: 1, wage: wageFor(skills, st.traits), presetId: 'jack' },
    { x, y },
  );
  for (const w of WORK_TYPES) e.priorities[w] = st.priorities[w] ?? 3;
  return e;
}

export function newGame(seed = STARTER.seed): GameState {
  const s = emptyState(STARTER.width, STARTER.height, seed);
  s.money = STARTER.money;
  for (const r of STARTER.floor) paintFloor(s, FLOOR_OF[r.floor], r.x, r.y, r.w, r.h);
  for (const p of STARTER.objects) placeObject(s, p);
  const spots = STARTER.objects.filter((o) => o.type === 'idleSpot');
  STARTER.staff.forEach((st: StarterStaff, i: number) => {
    const spot = spots[i % spots.length];
    makeEmployee(s, st, spot.x, spot.y);
  });
  refreshCandidates(s);
  return s;
}
