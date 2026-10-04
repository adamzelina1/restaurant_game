import type { GameState } from '../state';
import { DIRS, canStepStatic, layout, type Layout } from './grid';

const SQRT2 = Math.SQRT2;

/** Minimal binary min-heap of (priority, value) pairs. */
export class Heap {
  private p: number[] = [];
  private v: number[] = [];
  get size(): number {
    return this.p.length;
  }
  push(priority: number, value: number): void {
    const p = this.p;
    const v = this.v;
    let i = p.length;
    p.push(priority);
    v.push(value);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (p[parent] <= p[i]) break;
      [p[parent], p[i]] = [p[i], p[parent]];
      [v[parent], v[i]] = [v[i], v[parent]];
      i = parent;
    }
  }
  /** Returns the value with the lowest priority. Call only when size > 0. */
  pop(): number {
    const p = this.p;
    const v = this.v;
    const top = v[0];
    const lastP = p.pop()!;
    const lastV = v.pop()!;
    if (p.length > 0) {
      p[0] = lastP;
      v[0] = lastV;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < p.length && p[l] < p[m]) m = l;
        if (r < p.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [p[m], p[i]] = [p[i], p[m]];
        [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

function computeField(l: Layout, target: number): Float32Array {
  const dist = new Float32Array(l.width * l.height).fill(Infinity);
  dist[target] = 0;
  const heap = new Heap();
  heap.push(0, target);
  while (heap.size > 0) {
    const cur = heap.pop();
    const cx = cur % l.width;
    const cy = (cur - cx) / l.width;
    const d = dist[cur];
    for (let k = 0; k < 8; k++) {
      const [dx, dy] = DIRS[k];
      // Moves are symmetric, so a reverse step from neighbour to cur is valid iff this one is.
      if (!canStepStatic(l, cx, cy, dx, dy)) continue;
      const n = (cy + dy) * l.width + (cx + dx);
      const nd = d + (k < 4 ? 1 : SQRT2);
      if (nd < dist[n]) {
        dist[n] = nd;
        heap.push(nd, n);
      }
    }
  }
  return dist;
}

/**
 * Distance (in tiles, diagonals √2) from every tile to the target tile over the
 * static layout, ignoring agents. Cached until the layout changes. Non-walkable
 * targets still get a field (distances to reach it from a walkable neighbour are
 * not defined, so callers should only target walkable tiles).
 */
export function distanceField(state: GameState, tx: number, ty: number): Float32Array {
  const l = layout(state);
  const target = ty * l.width + tx;
  let f = l.fields.get(target);
  if (!f) {
    f = computeField(l, target);
    l.fields.set(target, f);
  }
  return f;
}

export function distance(state: GameState, fromX: number, fromY: number, toX: number, toY: number): number {
  if (fromX < 0 || fromY < 0 || fromX >= state.grid.width || fromY >= state.grid.height) return Infinity;
  return distanceField(state, toX, toY)[fromY * state.grid.width + fromX];
}
