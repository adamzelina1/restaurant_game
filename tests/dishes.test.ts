import { describe, expect, it } from 'vitest';
import { deserialize } from '../src/save/save';
import { validateLayout } from '../src/sim/build/analysis';
import { platesAccountedFor } from '../src/sim/foh/dishes';
import { newGame } from '../src/sim/newGame';
import type { GameState } from '../src/sim/state';
import { runFor, step } from '../src/sim/step';
import { objOfType, runUntil } from './helpers';

function stock(s: GameState, recipeId: string, n: number, counter = 0): void {
  const c = objOfType(s, 'counter', counter);
  c.counter!.recipeId = recipeId;
  c.counter!.lots.push({ servings: n, quality: 0.8, placedAt: s.time, freshFor: 1e9 });
}

const tables = (s: GameState) => Object.values(s.objects).filter((o) => o.table);

describe('dishes', () => {
  it('guests leave dirty tables that get bussed, washed and reused; plates are conserved', () => {
    const s = newGame(31);
    stock(s, 'burgers', 120);
    let sawDirty = false;
    let sawWashing = false;
    for (let i = 0; i < 3 * 3600 * 10; i++) {
      step(s);
      if (i % 20) continue;
      if (tables(s).some((t) => t.table!.dirty > 0)) sawDirty = true;
      if (Object.values(s.employees).some((e) => e.taskId && s.tasks[e.taskId]?.kind === 'wash')) sawWashing = true;
      // A dirty table is never seated.
      for (const t of tables(s)) if (t.table!.dirty > 0) expect(t.table!.partyId).toBeNull();
      expect(platesAccountedFor(s)).toBe(s.plates.total);
      expect(s.plates.clean).toBeGreaterThanOrEqual(0);
    }
    expect(sawDirty).toBe(true);
    expect(sawWashing).toBe(true);
    // More guests were served than there are plates, so plates came back around.
    expect(s.stats.customersServed).toBeGreaterThan(s.plates.total);
  });

  it('plating stalls without clean plates', () => {
    const s = newGame(32);
    s.plates = { clean: 0, total: 0 };
    stock(s, 'burgers', 40);
    runUntil(s, () => s.stats.customersLost > 0, 3600);
    expect(s.stats.servingsSold).toBe(0);
    expect(Object.values(s.tasks).some((t) => t.kind === 'plate' && t.status === 'claimed')).toBe(false);
    // Buying plates gets service going again.
    step(s, [{ type: 'buyPlates' }]);
    expect(s.plates.clean).toBeGreaterThan(0);
    runUntil(s, () => s.stats.servingsSold > 0, 3600);
  });

  it('without a dish pit tables stay dirty', () => {
    const s = newGame(33);
    const pit = objOfType(s, 'dishPit');
    delete s.objects[pit.id];
    s.layoutVersion++;
    stock(s, 'burgers', 60);
    runUntil(s, () => s.stats.customersServed >= 1, 3600);
    runFor(s, 600);
    expect(tables(s).some((t) => t.table!.dirty > 0)).toBe(true);
    expect(Object.values(s.tasks).filter((t) => t.kind === 'bus').every((t) => t.status === 'blocked')).toBe(true);
  });

  it('old saves are migrated with a dish pit and a plate rack', () => {
    const s = newGame(34) as any;
    const pit = objOfType(s, 'dishPit');
    delete s.objects[pit.id];
    s.version = 4;
    delete s.plates;
    delete s.stats.platesBroken;
    for (const o of Object.values<any>(s.objects)) if (o.table) delete o.table.dirty;
    const f = deserialize(JSON.stringify({ version: 4, savedAt: 0, state: s }));
    expect(Object.values(f.state.objects).some((o) => o.type === 'dishPit')).toBe(true);
    expect(validateLayout(f.state)).toEqual([]);
    expect(f.state.plates.clean).toBeGreaterThan(0);
    stock(f.state, 'burgers', 30);
    runUntil(f.state, () => f.state.stats.customersServed >= 2, 3600);
  });
});
