import type { GameRunner } from '../game/runner';
import type { Id } from '../sim/state';
import { speedUpTarget } from '../sim/stations/stations';
import { ui } from './store';

export type ClickResult = 'picker' | 'speedUp' | 'serve' | 'select';

/**
 * What clicking a station does (PLAN §11): idle cooking station → recipe
 * picker; cooking → speed up; ready → serve. Everything else just selects.
 */
export function clickObject(runner: GameRunner, id: Id): ClickResult {
  const s = runner.state;
  const o = s.objects[id];
  ui.set({ selected: { kind: 'object', id } });
  if (!o) return 'select';
  if (o.cook) {
    const b = o.cook.batchId ? s.batches[o.cook.batchId] : null;
    if (!b) {
      ui.set({ picker: id });
      return 'picker';
    }
    if (b.phase === 'ready' && !b.serveRequested) {
      runner.send({ type: 'serveBatch', stationId: id });
      return 'serve';
    }
  }
  if (speedUpTarget(s, id)) {
    runner.send({ type: 'speedUp', objectId: id });
    return 'speedUp';
  }
  return 'select';
}
