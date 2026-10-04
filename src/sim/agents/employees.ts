import { stationDef } from '../../data/stations';
import { distance } from '../grid/distance';
import { workTile } from '../grid/grid';
import { empWalkSpeed } from '../skills';
import type { Employee, GameState, Id } from '../state';
import { runTask } from '../tasks/execute';
import { pickTask } from '../tasks/tasks';
import { values } from '../util';
import { clearGoal, moveAgents, setGoal, type AgentRef } from './movement';

/** Idle staff walk to an idle spot so they're out of the walkways. */
function assignIdleSpots(state: GameState, idle: Employee[]): void {
  if (idle.length === 0) return;
  const spots = values(state.objects).filter((o) => stationDef(o.type).kind === 'idle');
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

/** Claim tasks and run them; sets movement goals. */
export function employeesDecide(state: GameState, dt: number): void {
  const idle: Employee[] = [];
  for (const emp of values(state.employees)) {
    emp.activity = 'idle';
    if (emp.taskId && !state.tasks[emp.taskId]) emp.taskId = null;
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
    const tier = t ? (t.urgent ? 0 : 1) : 2;
    out.push({
      id: emp.id,
      m: emp,
      speed: empWalkSpeed(emp),
      order: tier * 10000 + i++,
      canYield: !t,
      canSwap: emp.activity !== 'working',
    });
  }
  return out;
}

/** Time breakdown bookkeeping after movement. */
export function employeesAccount(state: GameState, dt: number): void {
  for (const emp of values(state.employees)) {
    if (emp.activity === 'walking' && !emp.step && emp.blocked > 0) emp.activity = 'blocked';
    emp.time[emp.activity] += dt;
  }
}

export function moveEmployees(state: GameState, dt: number): void {
  moveAgents(state, employeeAgents(state), dt);
}
