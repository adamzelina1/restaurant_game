import { INGREDIENTS } from '../../data/ingredients';
import { distance } from '../grid/distance';
import { objectsOfKind, workTile } from '../grid/grid';
import { rand } from '../rng';
import { empWalkSpeed } from '../skills';
import { isResting, needsBreak, runBreak, startBreak, tickStamina } from '../staff/stamina';
import { traitDropChance } from '../staff/traits';
import type { Employee, GameState, Id } from '../state';
import { runTask } from '../tasks/execute';
import { abandonTask, pickTask } from '../tasks/tasks';
import { message, values } from '../util';
import { clearGoal, setGoal, type AgentRef } from './movement';

/** Average seconds of carrying per trip, to spread a per-trip drop chance over time. */
const AVG_CARRY_SECONDS = 4;

/** Idle staff walk to an idle spot so they're out of the walkways. */
function assignIdleSpots(state: GameState, idle: Employee[]): void {
  if (idle.length === 0) return;
  const spots = objectsOfKind(state, 'idle');
  const taken = new Set<Id>();
  const pending: Employee[] = [];
  // Staff already standing on (or heading to) a spot keep it.
  for (const e of idle) {
    const s = spots.find((o) => {
      const t = workTile(o);
      return !taken.has(o.id) && ((e.x === t.x && e.y === t.y) || (e.goal?.x === t.x && e.goal?.y === t.y));
    });
    if (s) taken.add(s.id);
    else pending.push(e);
  }
  for (const e of pending) {
    let best: { id: Id; x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const o of spots) {
      if (taken.has(o.id)) continue;
      const t = workTile(o);
      const d = distance(state, e.x, e.y, t.x, t.y);
      if (d < bestD) {
        bestD = d;
        best = { id: o.id, ...t };
      }
    }
    if (best) {
      taken.add(best.id);
      setGoal(e, best.x, best.y);
    } else {
      clearGoal(e);
    }
  }
}

/** Claim tasks and run them, or take breaks; sets movement goals. */
export function employeesDecide(state: GameState, dt: number): void {
  const idle: Employee[] = [];
  for (const emp of values(state.employees)) {
    emp.activity = 'idle';
    emp.workingSkill = null;
    if (emp.taskId && !state.tasks[emp.taskId]) emp.taskId = null;
    // Tired staff finish their task first, then go rest (PLAN §5.3).
    if (!emp.taskId && !emp.onBreak && needsBreak(emp)) startBreak(state, emp);
    if (emp.onBreak && runBreak(state, emp)) continue;
    if (!emp.taskId) pickTask(state, emp);
    if (emp.taskId) runTask(state, emp, dt);
    if (!emp.taskId) idle.push(emp);
  }
  assignIdleSpots(state, idle);
}

export function employeeAgents(state: GameState): AgentRef[] {
  const out: AgentRef[] = [];
  let i = 0;
  for (const emp of values(state.employees)) {
    const t = emp.taskId ? state.tasks[emp.taskId] : null;
    const tier = t ? (t.urgent ? 0 : 1) : emp.onBreak ? 2 : 3;
    const resting = !!emp.onBreak && isResting(state, emp);
    out.push({
      id: emp.id,
      m: emp,
      speed: empWalkSpeed(emp),
      order: tier * 10000 + i++,
      canYield: !t && !emp.onBreak,
      canSwap: emp.activity !== 'working' && !resting,
      mask: 'staff',
    });
  }
  return out;
}

/** Clumsy staff sometimes drop what they carry; it lands on the floor and gets re-hauled. */
function rollDrops(state: GameState, emp: Employee, dt: number): void {
  if (!emp.carrying || emp.activity !== 'walking') return;
  const p = traitDropChance(emp);
  if (p <= 0 || rand(state) >= (p * dt) / AVG_CARRY_SECONDS) return;
  const what =
    emp.carrying.kind === 'crate'
      ? `a crate of ${INGREDIENTS[state.crates[emp.carrying.id]?.ingredient]?.name.toLowerCase() ?? 'food'}`
      : 'a pot';
  abandonTask(state, emp);
  message(state, `${emp.name} dropped ${what}!`, 'warn');
}

/** Stamina, time breakdown and accidents, after movement. */
export function employeesAfterMove(state: GameState, dt: number): void {
  for (const emp of values(state.employees)) {
    if (emp.activity === 'walking' && !emp.step && emp.blocked > 0) emp.activity = 'blocked';
    emp.time[emp.activity] += dt;
    tickStamina(state, emp, dt);
    rollDrops(state, emp, dt);
  }
}

