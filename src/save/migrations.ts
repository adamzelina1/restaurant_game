import { STATE_VERSION } from '../sim/newGame';

/**
 * Ordered migrations: MIGRATIONS[n] upgrades a version-n state to n+1.
 * States are plain JSON, so migrations work on `any`.
 */
type Migration = (state: any) => any;

export const MIGRATIONS: Record<number, Migration> = {};

export function migrate(state: any): any {
  let s = state;
  while (s.version < STATE_VERSION) {
    const m = MIGRATIONS[s.version];
    if (!m) throw new Error(`No migration from save version ${s.version}`);
    s = m(s);
    s.version++;
  }
  if (s.version > STATE_VERSION) throw new Error(`Save is from a newer version (${s.version})`);
  return s;
}
