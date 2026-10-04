import type { GameState } from '../state';
import { DIRS, canStepStatic, layout, type Mask } from './grid';
import { Heap } from './distance';

const SQRT2 = Math.SQRT2;

function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
}

/**
 * Local A* that treats `occupied` tiles as temporary obstacles (agents).
 * Returns the tile indices of the path, excluding the start, or null.
 * The goal tile is never treated as occupied.
 */
export function findPath(
  state: GameState,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  occupied: (i: number) => boolean,
  maxExpansions: number,
  mask: Mask = 'staff',
): number[] | null {
  const l = layout(state);
  const w = l.width;
  const start = sy * w + sx;
  const goal = gy * w + gx;
  if (start === goal) return [];
  const g = new Map<number, number>();
  const came = new Map<number, number>();
  const closed = new Set<number>();
  const heap = new Heap();
  g.set(start, 0);
  heap.push(octile(sx, sy, gx, gy), start);
  let expansions = 0;
  while (heap.size > 0) {
    const cur = heap.pop();
    if (cur === goal) {
      const path: number[] = [];
      let c = cur;
      while (c !== start) {
        path.push(c);
        c = came.get(c)!;
      }
      return path.reverse();
    }
    if (closed.has(cur)) continue;
    closed.add(cur);
    if (++expansions > maxExpansions) return null;
    const cx = cur % w;
    const cy = (cur - cx) / w;
    const cg = g.get(cur)!;
    for (let k = 0; k < 8; k++) {
      const [dx, dy] = DIRS[k];
      if (!canStepStatic(l, cx, cy, dx, dy, mask)) continue;
      const n = (cy + dy) * w + (cx + dx);
      if (n !== goal && occupied(n)) continue;
      // No slipping diagonally between two agents.
      if (k >= 4 && occupied(cy * w + cx + dx) && occupied((cy + dy) * w + cx)) continue;
      const ng = cg + (k < 4 ? 1 : SQRT2);
      if (ng < (g.get(n) ?? Infinity)) {
        g.set(n, ng);
        came.set(n, cur);
        heap.push(ng + octile(cx + dx, cy + dy, gx, gy), n);
      }
    }
  }
  return null;
}
