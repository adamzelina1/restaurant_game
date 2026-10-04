import { describe, expect, it } from 'vitest';
import { deserialize, serialize } from '../src/save/save';
import { newGame, STATE_VERSION } from '../src/sim/newGame';
import { runFor } from '../src/sim/step';

describe('saves', () => {
  it('round-trips through serialize/deserialize', () => {
    const s = newGame(11);
    runFor(s, 30);
    const back = deserialize(serialize(s));
    expect(back.state).toEqual(s);
    expect(back.version).toBe(STATE_VERSION);
  });

  it('migrates a v1 save forward and keeps simulating', () => {
    const s = newGame(11) as any;
    // Strip what v2 added to fake an old save.
    s.version = 1;
    delete s.reputation;
    delete s.hiring;
    delete s.stats.wagesPaid;
    for (const e of Object.values<any>(s.employees)) {
      delete e.workingSkill;
    }
    const f = deserialize(JSON.stringify({ version: 1, savedAt: 0, state: s }));
    expect(f.state.version).toBe(STATE_VERSION);
    expect(f.state.hiring.candidates).toEqual([]);
    runFor(f.state, 10);
    // The hiring board refills on the first tick.
    expect(f.state.hiring.candidates.length).toBeGreaterThan(0);
  });

  it('rejects saves from the future', () => {
    const s = newGame(1);
    s.version = STATE_VERSION + 1;
    expect(() => deserialize(JSON.stringify({ version: s.version, savedAt: 0, state: s }))).toThrow();
  });
});
