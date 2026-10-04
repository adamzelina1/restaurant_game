import { buyObject, moveObject, paintTiles, sellObject, type FloorTool } from './build/build';
import { buyPlates } from './foh/dishes';
import type { Tile } from './grid/grid';
import { cancelBatch, requestServe, startBatch } from './production/batches';
import { fire, hire, paidRefresh, presetPriorities, setPriority } from './staff/hiring';
import { WORK_TYPES, type GameState, type Id, type Priority, type Rot, type WorkType } from './state';
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
  | { type: 'applyPreset'; employeeId: Id; presetId: string }
  | { type: 'buyObject'; objectType: string; x: number; y: number; rot: Rot }
  | { type: 'moveObject'; id: Id; x: number; y: number; rot: Rot }
  | { type: 'sellObject'; id: Id }
  | { type: 'paintFloor'; tiles: Tile[]; tool: FloorTool }
  | { type: 'resetHeatmaps' }
  | { type: 'buyPlates' };

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
    case 'buyObject':
      return buyObject(state, cmd.objectType, cmd.x, cmd.y, cmd.rot);
    case 'moveObject':
      return moveObject(state, cmd.id, cmd.x, cmd.y, cmd.rot);
    case 'sellObject':
      return sellObject(state, cmd.id);
    case 'paintFloor':
      return paintTiles(state, cmd.tiles, cmd.tool);
    case 'buyPlates':
      return buyPlates(state);
    case 'resetHeatmaps':
      state.stats.blockedByTile = {};
      state.stats.trafficByTile = {};
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
