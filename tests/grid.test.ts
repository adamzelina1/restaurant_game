import { describe, expect, it } from 'vitest';
import { distance } from '../src/sim/grid/distance';
import { localToWorld, workTile } from '../src/sim/grid/grid';
import { emptyState, paintFloor, placeObject } from '../src/sim/newGame';
import { Floor } from '../src/sim/state';

describe('object rotation', () => {
  it('puts the work tile on the facing side', () => {
    const base = { type: 'stove', x: 5, y: 5 };
    expect(localToWorld({ ...base, rot: 0 }, 0, 1)).toEqual({ x: 5, y: 6 });
    expect(localToWorld({ ...base, rot: 1 }, 0, 1)).toEqual({ x: 4, y: 5 });
    expect(localToWorld({ ...base, rot: 2 }, 0, 1)).toEqual({ x: 5, y: 4 });
    expect(localToWorld({ ...base, rot: 3 }, 0, 1)).toEqual({ x: 6, y: 5 });
  });
});

describe('distance fields', () => {
  it('uses √2 diagonals on open floor', () => {
    const s = emptyState(10, 10, 1);
    paintFloor(s, Floor.Kitchen, 0, 0, 10, 10);
    expect(distance(s, 0, 0, 3, 3)).toBeCloseTo(3 * Math.SQRT2);
    expect(distance(s, 0, 0, 5, 2)).toBeCloseTo(3 + 2 * Math.SQRT2);
  });

  it('does not cut corners around objects', () => {
    const s = emptyState(5, 5, 1);
    paintFloor(s, Floor.Kitchen, 0, 0, 5, 5);
    // Block (1,0): going (0,0) → (1,1) diagonally would cut that corner.
    placeObject(s, { type: 'fridge', x: 1, y: 0, rot: 0 });
    expect(distance(s, 0, 0, 1, 1)).toBeCloseTo(2);
  });

  it('is recomputed when the layout changes', () => {
    const s = emptyState(5, 1, 1);
    paintFloor(s, Floor.Kitchen, 0, 0, 5, 1);
    expect(distance(s, 0, 0, 4, 0)).toBe(4);
    const o = placeObject(s, { type: 'fridge', x: 2, y: 0, rot: 0 });
    expect(distance(s, 0, 0, 4, 0)).toBe(Infinity);
    expect(workTile(o)).toEqual({ x: 2, y: 1 });
  });
});
