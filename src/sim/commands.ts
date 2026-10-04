import { cancelBatch, requestServe, startBatch } from './production/batches';
import type { GameState, Id } from './state';
import { speedUp } from './stations/stations';

/** Player intents. The sim consumes them at the start of the next tick. */
export type Command =
  | { type: 'startBatch'; stationId: Id; recipeId: string }
  | { type: 'cancelBatch'; stationId: Id }
  | { type: 'serveBatch'; stationId: Id }
  | { type: 'speedUp'; objectId: Id };

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
  }
}
