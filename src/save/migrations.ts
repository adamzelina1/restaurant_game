import { placeNear } from '../sim/build/build';
import { START_PLATES } from '../sim/constants';
import { STATE_VERSION } from '../sim/newGame';

/**
 * Ordered migrations: MIGRATIONS[n] upgrades a version-n state to n+1.
 * States are plain JSON, so migrations work on `any`.
 */
type Migration = (state: any) => any;

export const MIGRATIONS: Record<number, Migration> = {
  // v2: staff management (hiring board, wages, reputation).
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
  // v4: one shared room (no floor zones), no stamina or staff room.
  3: (s) => {
    s.grid.floor = s.grid.floor.map((f: number) => (f === 2 || f === 4 ? 1 : f));
    for (const e of Object.values<any>(s.employees)) {
      delete e.stamina;
      delete e.onBreak;
      delete e.time.break;
      e.traits = e.traits.filter((t: string) => t !== 'ironLungs');
    }
    for (const c of s.hiring.candidates) c.traits = c.traits.filter((t: string) => t !== 'ironLungs');
    for (const [id, o] of Object.entries<any>(s.objects)) {
      if (o.type === 'couch' || o.type === 'coffeeMachine') delete s.objects[id];
    }
    s.layoutVersion++;
    return s;
  },
  // v5: dirty tables, bussing, dish pit and the clean-plate stock.
  4: (s) => {
    s.plates ??= { clean: START_PLATES, total: START_PLATES };
    s.stats.platesBroken ??= 0;
    for (const o of Object.values<any>(s.objects)) if (o.table) o.table.dirty ??= 0;
    for (const t of Object.values<any>(s.tasks)) {
      t.objectId ??= null;
      t.plate ??= false;
    }
    s.layoutVersion++;
    // Older restaurants get a free dish pit near the pass.
    if (!Object.values<any>(s.objects).some((o) => o.type === 'dishPit')) {
      const pass = Object.values<any>(s.objects).find((o) => o.type === 'pass');
      const near = pass ?? { x: Math.floor(s.grid.width / 2), y: Math.floor(s.grid.height / 2) };
      placeNear(s, 'dishPit', { x: near.x, y: near.y });
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
