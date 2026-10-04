import { describe, expect, it } from 'vitest';
import { articulationPoints, chokepointWorkTiles, routePreview, validateLayout } from '../src/sim/build/analysis';
import { placementError } from '../src/sim/build/build';
import { emptyState, newGame, paintFloor, placeObject } from '../src/sim/newGame';
import { Floor } from '../src/sim/state';
import { runFor, step } from '../src/sim/step';
import { objOfType, runUntil } from './helpers';

describe('placement', () => {
  it('validates footprint, work tile, overlaps and agents', () => {
    const s = newGame();
    expect(placementError(s, 'stove', 6, 5, 0)).toBeNull();
    expect(placementError(s, 'stove', 0, 5, 0)).toBe('Must be on floor'); // wall
    expect(placementError(s, 'stove', 4, 1, 0)).toBe('Overlaps another object');
    // On the cutting board's work tile.
    expect(placementError(s, 'stove', 4, 2, 0)).toBe("Blocks another object's work tile");
    // Work tile facing the wall.
    expect(placementError(s, 'stove', 6, 5, 2)).toBeNull();
    expect(placementError(s, 'stove', 6, 1, 2)).toBe('Work tile must be on floor');
    expect(placementError(s, 'stove', 2, 1, 2)).toBe('Work tile must be on floor');
    const marco = Object.values(s.employees)[0];
    marco.x = 6;
    marco.y = 7;
    expect(placementError(s, 'stove', marco.x, marco.y, 0)).toBe('Someone is standing there');
  });

  it('buy, move, rotate and sell', () => {
    const s = newGame();
    s.money = 5000;
    step(s, [{ type: 'buyObject', objectType: 'grill', x: 6, y: 6, rot: 0 }]);
    const grills = Object.values(s.objects).filter((o) => o.type === 'grill');
    expect(grills).toHaveLength(2);
    expect(s.money).toBe(5000 - 800);
    const g = grills[1];
    step(s, [{ type: 'moveObject', id: g.id, x: 7, y: 6, rot: 3 }]);
    expect([g.x, g.y, g.rot]).toEqual([7, 6, 3]);
    step(s, [{ type: 'sellObject', id: g.id }]);
    expect(s.objects[g.id]).toBeUndefined();
    expect(s.money).toBe(5000 - 800 + 400);
  });

  it('busy stations cannot be moved or sold', () => {
    const s = newGame();
    const stove = objOfType(s, 'stove');
    step(s, [{ type: 'startBatch', stationId: stove.id, recipeId: 'friedEggs' }]);
    step(s, [{ type: 'sellObject', id: stove.id }]);
    expect(s.objects[stove.id]).toBeDefined();
    step(s, [{ type: 'moveObject', id: stove.id, x: 6, y: 6, rot: 0 }]);
    expect(stove.x).toBe(9);
  });

  it('staff follow a moved fridge and survive a sold one', () => {
    const s = newGame();
    s.money = 5000;
    const stove = objOfType(s, 'stove');
    const fridge = objOfType(s, 'fridge');
    step(s, [{ type: 'moveObject', id: fridge.id, x: 12, y: 9, rot: 2 }]);
    step(s, [{ type: 'startBatch', stationId: stove.id, recipeId: 'pancakes' }]);
    const b = s.batches[stove.cook!.batchId!];
    runFor(s, 3);
    // Sell the fridge mid-fetch: the task goes back on the board, blocked.
    step(s, [{ type: 'sellObject', id: fridge.id }]);
    runFor(s, 30);
    expect(b.cratesLoaded).toBe(0);
    expect(Object.values(s.tasks).every((t) => t.status !== 'claimed' || t.kind !== 'deliver')).toBe(true);
    step(s, [{ type: 'buyObject', objectType: 'fridge', x: 2, y: 1, rot: 0 }]);
    runUntil(s, () => b.phase === 'cooking', 300);
  });
});

describe('floor', () => {
  it('buying, rezoning and walls cost money and change walkability', () => {
    const s = newGame();
    s.money = 1000;
    // (20, 20) is void in the starter layout.
    step(s, [{ type: 'paintFloor', tiles: [{ x: 20, y: 20 }, { x: 21, y: 20 }], tool: 'dining' }]);
    expect(s.grid.floor[20 * s.grid.width + 20]).toBe(Floor.Dining);
    expect(s.money).toBe(1000 - 40);
    step(s, [{ type: 'paintFloor', tiles: [{ x: 20, y: 20 }], tool: 'kitchen' }]);
    expect(s.money).toBe(1000 - 42);
    step(s, [{ type: 'paintFloor', tiles: [{ x: 20, y: 20 }], tool: 'wall' }]);
    expect(s.grid.floor[20 * s.grid.width + 20]).toBe(Floor.Wall);
    // Can't wall over a work tile.
    const before = s.money;
    step(s, [{ type: 'paintFloor', tiles: [{ x: 4, y: 2 }], tool: 'wall' }]);
    expect(s.money).toBe(before);
  });
});

describe('layout analysis', () => {
  it('flags work tiles that cannot be reached', () => {
    const s = newGame();
    expect(validateLayout(s)).toEqual([]);
    // Wall off the stock pot's work tile.
    for (const [x, y] of [[5, 10], [7, 10], [5, 9], [6, 9], [7, 9]]) s.grid.floor[y * s.grid.width + x] = Floor.Wall;
    s.layoutVersion++;
    const problems = validateLayout(s);
    expect(problems.map((p) => p.message)).toContain("Stock pot can't be reached");
  });

  it('finds chokepoints in a corridor', () => {
    const s = emptyState(7, 3, 1);
    paintFloor(s, Floor.Kitchen, 0, 0, 3, 3);
    paintFloor(s, Floor.Kitchen, 4, 0, 3, 3);
    paintFloor(s, Floor.Kitchen, 3, 1, 1, 1); // one-tile doorway
    expect([...articulationPoints(s)]).toContain(1 * 7 + 3);
    // A station whose work tile is the doorway.
    s.grid.floor[0 * 7 + 3] = Floor.Kitchen;
    s.layoutVersion++;
    placeObject(s, { type: 'stove', x: 3, y: 0, rot: 0 });
    expect(chokepointWorkTiles(s).map((c) => c.tile)).toEqual([{ x: 3, y: 1 }]);
  });

  it('route preview estimates walking for a batch', () => {
    const s = newGame();
    const pot = objOfType(s, 'stockPot');
    const r = routePreview(s, pot.id, 'beefStew');
    expect(r.error).toBeNull();
    expect(r.legs).toHaveLength(4);
    expect(r.tiles).toBeGreaterThan(50);
    expect(r.seconds).toBeGreaterThan(r.tiles / 2.5);
    // Moving the fridge next to the pot shortens it.
    const fridge = objOfType(s, 'fridge');
    fridge.x = 8;
    fridge.y = 11;
    fridge.rot = 2;
    s.layoutVersion++;
    expect(routePreview(s, pot.id, 'beefStew').tiles).toBeLessThan(r.tiles);
  });
});
