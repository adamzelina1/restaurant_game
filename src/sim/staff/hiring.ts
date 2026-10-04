import { FIRST_NAMES, STAFF_COLORS } from '../../data/names';
import { TRAIT_LIST } from '../../data/traits';
import { PRESET_BY_ID } from '../../data/workTypes';
import { stationDef } from '../../data/stations';
import { HIRING_REFRESH, HIRING_REFRESH_COST, MAX_SKILL, SIGNING_HOURS, STAMINA_MAX } from '../constants';
import { DIRS, isWalkable, workTile, type Tile } from '../grid/grid';
import { pick, rand, randInt, randRange, weightedPick } from '../rng';
import {
  SKILLS,
  WORK_TYPES,
  type Candidate,
  type Employee,
  type GameState,
  type Id,
  type Passion,
  type Priority,
  type Skill,
  type SkillState,
  type WorkType,
} from '../state';
import { abandonTask } from '../tasks/tasks';
import { message, newId, spend, values } from '../util';
import { refuses } from './traits';
import { wageFor } from './xp';

/** Default preset for a new hire, from their best passions (PLAN §5.2). */
export function choosePreset(skills: Record<Skill, SkillState>): string {
  let best: Skill | null = null;
  let bestScore = -1;
  for (const s of SKILLS) {
    const score = skills[s].passion * 100 + skills[s].level;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  if (!best || bestScore < 4) return 'busser';
  if (best === 'Grill' || best === 'Saute') return 'lineCook';
  if (best === 'Prep' || best === 'Baking') return 'prepCook';
  return 'waiter';
}

export function presetPriorities(presetId: string, who: { traits: string[] }): Record<WorkType, Priority> {
  const p = { ...(PRESET_BY_ID[presetId] ?? PRESET_BY_ID.jack).priorities };
  for (const w of WORK_TYPES) if (refuses(who, w)) p[w] = 0;
  return p;
}

export function setPriority(state: GameState, empId: Id, w: WorkType, value: Priority): boolean {
  const e = state.employees[empId];
  if (!e) return false;
  if (value !== 0 && refuses(e, w)) return false;
  e.priorities[w] = value;
  return true;
}

function usedNames(state: GameState): Set<string> {
  return new Set([...values(state.employees).map((e) => e.name), ...state.hiring.candidates.map((c) => c.name)]);
}

/** A random applicant. Better reputation → bigger skill budget (PLAN §5.4). */
export function generateCandidate(state: GameState): Candidate {
  const taken = usedNames(state);
  const free = FIRST_NAMES.filter((n) => !taken.has(n));
  const name = free.length ? pick(state, free) : `${pick(state, FIRST_NAMES)} ${randInt(state, 2, 9)}`;

  const skills = {} as Record<Skill, SkillState>;
  for (const s of SKILLS) skills[s] = { level: 0, xp: 0, passion: 0 };
  const passionCount = randInt(state, 1, 3);
  const pool = [...SKILLS];
  for (let i = 0; i < passionCount; i++) {
    const s = pool.splice(Math.floor(rand(state) * pool.length), 1)[0];
    skills[s].passion = (rand(state) < 0.35 ? 2 : 1) as Passion;
  }
  // Skill points biased toward passions, so archetypes are recognizable.
  const budget = Math.max(6, Math.round(16 + 7 * (state.reputation - 1) + randInt(state, -4, 6)));
  for (let i = 0; i < budget; i++) {
    const s = weightedPick(state, SKILLS, (k) => (skills[k].level >= 12 ? 0 : [1, 3, 5][skills[k].passion]));
    if (!s) break;
    skills[s].level = Math.min(MAX_SKILL, skills[s].level + 1);
  }

  const traits: string[] = [];
  const roll = rand(state);
  const traitCount = roll < 0.4 ? 0 : roll < 0.85 ? 1 : 2;
  const traitPool = [...TRAIT_LIST];
  for (let i = 0; i < traitCount; i++) {
    traits.push(traitPool.splice(Math.floor(rand(state) * traitPool.length), 1)[0].id);
  }

  return {
    name,
    color: pick(state, STAFF_COLORS),
    skills,
    traits,
    walkSpeed: Math.round(randRange(state, 0.9, 1.1) * 100) / 100,
    wage: wageFor(skills, traits),
    presetId: choosePreset(skills),
  };
}

export function refreshCandidates(state: GameState): void {
  state.hiring.candidates = [];
  const n = randInt(state, 3, 5);
  for (let i = 0; i < n; i++) state.hiring.candidates.push(generateCandidate(state));
  state.hiring.refreshAt = state.time + HIRING_REFRESH;
}

export function tickHiring(state: GameState): void {
  if (state.time >= state.hiring.refreshAt) refreshCandidates(state);
}

export function paidRefresh(state: GameState): boolean {
  if (!spend(state, HIRING_REFRESH_COST)) {
    message(state, 'Not enough money to refresh the hiring board', 'warn');
    return false;
  }
  refreshCandidates(state);
  return true;
}

/** Nearest walkable tile to (x,y) that no employee occupies. */
export function findFreeTileNear(state: GameState, x: number, y: number): Tile | null {
  const occupied = new Set<string>();
  for (const e of values(state.employees)) {
    occupied.add(`${e.x},${e.y}`);
    if (e.step) occupied.add(`${e.step.tx},${e.step.ty}`);
  }
  const seen = new Set<string>([`${x},${y}`]);
  const queue: Tile[] = [{ x, y }];
  while (queue.length) {
    const t = queue.shift()!;
    if (isWalkable(state, t.x, t.y) && !occupied.has(`${t.x},${t.y}`)) return t;
    for (const [dx, dy] of DIRS.slice(0, 4)) {
      const k = `${t.x + dx},${t.y + dy}`;
      if (seen.has(k) || t.x + dx < 0 || t.y + dy < 0 || t.x + dx >= state.grid.width || t.y + dy >= state.grid.height) continue;
      seen.add(k);
      queue.push({ x: t.x + dx, y: t.y + dy });
    }
  }
  return null;
}

/** Where new staff appear: an idle spot if there is one. */
function spawnTile(state: GameState): Tile | null {
  const spot = values(state.objects).find((o) => stationDef(o.type).kind === 'idle');
  const from = spot ? workTile(spot) : { x: Math.floor(state.grid.width / 2), y: Math.floor(state.grid.height / 2) };
  return findFreeTileNear(state, from.x, from.y);
}

export function addEmployee(state: GameState, c: Candidate, at: Tile): Employee {
  const e: Employee = {
    id: newId(state, 'e'),
    name: c.name,
    portraitSeed: state.nextId * 7919,
    color: c.color,
    skills: structuredClone(c.skills),
    walkSpeed: c.walkSpeed,
    stamina: { current: STAMINA_MAX, max: STAMINA_MAX, drainRate: 1, recoverRate: 1 },
    traits: [...c.traits],
    priorities: presetPriorities(c.presetId, c),
    wage: c.wage,
    hiredAt: state.time,
    taskId: null,
    toil: 0,
    toilTime: 0,
    carrying: null,
    activity: 'idle',
    workingSkill: null,
    onBreak: null,
    time: { idle: 0, walking: 0, working: 0, blocked: 0, break: 0 },
    x: at.x,
    y: at.y,
    step: null,
    goal: null,
    blocked: 0,
    detour: [],
  };
  state.employees[e.id] = e;
  return e;
}

export function signingFee(c: Candidate): number {
  return Math.round(c.wage * SIGNING_HOURS);
}

export function hire(state: GameState, index: number): boolean {
  const c = state.hiring.candidates[index];
  if (!c) return false;
  const at = spawnTile(state);
  if (!at) {
    message(state, 'No room for a new hire', 'warn');
    return false;
  }
  if (!spend(state, signingFee(c))) {
    message(state, `Hiring ${c.name} costs $${signingFee(c)}`, 'warn');
    return false;
  }
  state.hiring.candidates.splice(index, 1);
  addEmployee(state, c, at);
  message(state, `${c.name} joined the team!`, 'good');
  return true;
}

export function fire(state: GameState, empId: Id): boolean {
  const e = state.employees[empId];
  if (!e) return false;
  abandonTask(state, e);
  delete state.employees[empId];
  message(state, `${e.name} was let go`);
  return true;
}
