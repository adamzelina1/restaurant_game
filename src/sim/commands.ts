import { cancelBatch, requestServe, startBatch } from './production/batches';
import { fire, hire, paidRefresh, presetPriorities, setPriority } from './staff/hiring';
import { WORK_TYPES, type GameState, type Id, type Priority, type WorkType } from './state';
import { speedUp } from './stations/stations';
import { values } from './util';

/** Player intents. The sim consumes them at the start of the next tick. */
export type Command =
  | { type: 'startBatch'; stationId: Id; recipeId: string }
  | { type: 'cancelBatch'; stationId: Id }
  | { type: 'serveBatch'; stationId: Id }
  | { type: 'speedUp'; objectId: Id }
  | { type: 'hire'; index: number }
  | { type: 'fire'; employeeId: Id }
  | { type: 'refreshCandidates' }
  | { type: 'setPriority'; employeeId: Id; workType: WorkType; priority: Priority }
  | { type: 'setColumn'; workType: WorkType; priority: Priority }
  | { type: 'applyPreset'; employeeId: Id; presetId: string };

export function applyCommand(state: GameState, cmd: Command): boolean {
  switch (cmd.type) {
    case 'startBatch':
      return startBatch(state, cmd.stationId, cmd.recipeId);
    case 'cancelBatch':
      return cancelBatch(state, cmd.stationId);
    case 'serveBatch':
      return requestServe(state, cmd.stationId);
    case 'speedUp':
      return speedUp(state, cmd.objectId);
    case 'hire':
      return hire(state, cmd.index);
    case 'fire':
      return fire(state, cmd.employeeId);
    case 'refreshCandidates':
      return paidRefresh(state);
    case 'setPriority':
      return setPriority(state, cmd.employeeId, cmd.workType, cmd.priority);
    case 'setColumn':
      for (const e of values(state.employees)) setPriority(state, e.id, cmd.workType, cmd.priority);
      return true;
    case 'applyPreset': {
      const e = state.employees[cmd.employeeId];
      if (!e) return false;
      const p = presetPriorities(cmd.presetId, e);
      for (const w of WORK_TYPES) e.priorities[w] = p[w];
      return true;
    }
  }
}
