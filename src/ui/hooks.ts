import { useEffect, useState } from 'preact/hooks';
import type { GameRunner } from '../game/runner';
import { ui } from './store';

/** Re-render whenever the sim ticks or UI state changes. */
export function useLive(runner: GameRunner): void {
  const [, setN] = useState(0);
  useEffect(() => {
    const bump = () => setN((n) => n + 1);
    const a = runner.subscribe(bump);
    const b = ui.subscribe(bump);
    return () => {
      a();
      b();
    };
  }, [runner]);
}
