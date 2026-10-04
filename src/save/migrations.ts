import { STATE_VERSION } from '../sim/newGame';

/**
 * Ordered migrations: MIGRATIONS[n] upgrades a version-n state to n+1.
 * States are plain JSON, so migrations work on `any`.
 */
type Migration = (state: any) => any;

export const MIGRATIONS: Record<number, Migration> = {
  // v2: staff management (stamina breaks, hiring board, wages, reputation).
  1: (s) => {
    s.reputation ??= 1;
    s.hiring ??= { candidates: [], refreshAt: 0 };
    s.stats.wagesPaid ??= 0;
    for (const e of Object.values<any>(s.employees)) {
      e.workingSkill ??= null;
      e.onBreak ??= null;
    }
    return s;
  },
  // v3: front of house (guests, tables, the pass) replaces abstract buyers.
  2: (s) => {
    s.customers ??= {};
    s.parties ??= {};
    s.nextPartyIn ??= 10;
    delete s.nextBuyerIn;
    s.stats.customersServed ??= 0;
    s.stats.customersLost ??= 0;
    for (const o of Object.values<any>(s.objects)) if (o.counter) o.counter.reserved ??= 0;
    for (const t of Object.values<any>(s.tasks)) {
      t.partyId ??= null;
      t.customerId ??= null;
    }
    return s;
  },
};

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
