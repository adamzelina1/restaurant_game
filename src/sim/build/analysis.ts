// Layout feedback (PLAN §3.4, §8): reachability validation, chokepoints, routes.

import { recipe } from '../../data/recipes';
import { stationDef } from '../../data/stations';
import { BASE_WALK_SPEED, CARRY_CRATE_SPEED } from '../constants';
import { distanceField } from '../grid/distance';
import { DIRS, canStepStatic, layout, objectsOfKind, objectsOfType, seatTiles, workTile, workTiles, type Layout, type Tile } from '../grid/grid';
import type { GameState, Id, PlacedObject } from '../state';
import { values } from '../util';

export interface LayoutProblem {
  tile: Tile;
  objectId: Id | null;
  message: string;
}

function neighbours(l: Layout, i: number): number[] {
  const x = i % l.width;
  const y = (i - x) / l.width;
  const out: number[] = [];
  for (const [dx, dy] of DIRS) if (canStepStatic(l, x, y, dx, dy)) out.push((y + dy) * l.width + x + dx);
  return out;
}

/** Connected component id per tile (-1 for non-walkable). */
function components(l: Layout): Int32Array {
  const comp = new Int32Array(l.width * l.height).fill(-1);
  const walk = l.walkable;
  let next = 0;
  for (let i = 0; i < comp.length; i++) {
    if (!walk[i] || comp[i] !== -1) continue;
    const stack = [i];
    comp[i] = next;
    while (stack.length) {
      const c = stack.pop()!;
      for (const n of neighbours(l, c)) {
        if (comp[n] === -1) {
          comp[n] = next;
          stack.push(n);
        }
      }
    }
    next++;
  }
  return comp;
}

/**
 * Every work tile, employee and dropped item must be on one connected walkable
 * area. Returns the problems found (empty = valid).
 */
export function validateLayout(state: GameState): LayoutProblem[] {
  const l = layout(state);
  const comp = components(l);
  const important: { tile: Tile; objectId: Id | null; what: string }[] = [];
  for (const o of values(state.objects)) {
    const name = stationDef(o.type).name;
    for (const t of workTiles(o)) important.push({ tile: t, objectId: o.id, what: name });
  }
  for (const e of values(state.employees)) important.push({ tile: { x: e.x, y: e.y }, objectId: null, what: e.name });

  const problems: LayoutProblem[] = [];
  const count = new Map<number, number>();
  for (const it of important) {
    const { x, y } = it.tile;
    const inside = x >= 0 && y >= 0 && x < l.width && y < l.height;
    const c = inside ? comp[y * l.width + x] : -1;
    if (c === -1) problems.push({ tile: it.tile, objectId: it.objectId, message: `${it.what}: work tile is blocked` });
    else count.set(c, (count.get(c) ?? 0) + 1);
  }
  // The main area is the one holding most of what matters.
  let main = -1;
  let best = -1;
  for (const [c, n] of count) {
    if (n > best) {
      best = n;
      main = c;
    }
  }
  for (const it of important) {
    const { x, y } = it.tile;
    if (x < 0 || y < 0 || x >= l.width || y >= l.height) continue;
    const c = comp[y * l.width + x];
    if (c !== -1 && c !== main) {
      problems.push({ tile: it.tile, objectId: it.objectId, message: `${it.what} can't be reached` });
    }
  }

  // Guests must be able to walk from the entrance to every chair and the host stand.
  const door = objectsOfKind(state, 'entrance')[0];
  if (door) {
    const gcomp = comp;
    const dt = workTile(door);
    const home = gcomp[dt.y * l.width + dt.x];
    const guestSpots: { tile: Tile; objectId: Id; what: string }[] = [];
    for (const o of values(state.objects)) {
      const def = stationDef(o.type);
      for (const s of seatTiles(o)) guestSpots.push({ tile: s, objectId: o.id, what: `${def.name} chair` });
      if (def.kind === 'host') guestSpots.push({ tile: workTile(o), objectId: o.id, what: def.name });
    }
    for (const g of guestSpots) {
      const { x, y } = g.tile;
      const inside = x >= 0 && y >= 0 && x < l.width && y < l.height;
      if (!inside || home === -1 || gcomp[y * l.width + x] !== home) {
        problems.push({ tile: g.tile, objectId: g.objectId, message: `Guests can't reach a ${g.what.toLowerCase()} from the entrance` });
      }
    }
  }
  return problems;
}

/**
 * Articulation points of the walkable grid: tiles that are the only path
 * between two areas. Iterative Tarjan.
 */
export function articulationPoints(state: GameState): Set<number> {
  const l = layout(state);
  const n = l.width * l.height;
  const disc = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const parent = new Int32Array(n).fill(-1);
  const out = new Set<number>();
  let time = 0;
  for (let root = 0; root < n; root++) {
    if (!l.walkable[root] || disc[root] !== -1) continue;
    let rootChildren = 0;
    const stack: { v: number; ns: number[]; i: number }[] = [{ v: root, ns: neighbours(l, root), i: 0 }];
    disc[root] = low[root] = time++;
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top.i < top.ns.length) {
        const w = top.ns[top.i++];
        if (disc[w] === -1) {
          parent[w] = top.v;
          if (top.v === root) rootChildren++;
          disc[w] = low[w] = time++;
          stack.push({ v: w, ns: neighbours(l, w), i: 0 });
        } else if (w !== parent[top.v]) {
          low[top.v] = Math.min(low[top.v], disc[w]);
        }
      } else {
        stack.pop();
        const p = parent[top.v];
        if (p !== -1) {
          low[p] = Math.min(low[p], low[top.v]);
          if (p !== root && low[top.v] >= disc[p]) out.add(p);
        }
      }
    }
    if (rootChildren > 1) out.add(root);
  }
  return out;
}

/** Work tiles that sit on the only path between two areas (flag in red). */
export function chokepointWorkTiles(state: GameState): { tile: Tile; objectId: Id }[] {
  const ap = articulationPoints(state);
  const w = state.grid.width;
  const out: { tile: Tile; objectId: Id }[] = [];
  for (const o of values(state.objects)) {
    if (stationDef(o.type).walkable) continue;
    for (const t of workTiles(o)) if (ap.has(t.y * w + t.x)) out.push({ tile: t, objectId: o.id });
  }
  return out;
}

/** Greedy descent along a distance field: the tiles an agent would walk. */
export function pathTiles(state: GameState, from: Tile, to: Tile): Tile[] {
  const l = layout(state);
  const field = distanceField(state, to.x, to.y);
  const out: Tile[] = [from];
  let cur = from;
  for (let guard = 0; guard < 2000; guard++) {
    if (cur.x === to.x && cur.y === to.y) return out;
    let best: Tile | null = null;
    let bestD = field[cur.y * l.width + cur.x];
    if (!Number.isFinite(bestD)) return [];
    for (const [dx, dy] of DIRS) {
      if (!canStepStatic(l, cur.x, cur.y, dx, dy)) continue;
      const d = field[(cur.y + dy) * l.width + cur.x + dx];
      if (d < bestD - 1e-6) {
        bestD = d;
        best = { x: cur.x + dx, y: cur.y + dy };
      }
    }
    if (!best) return [];
    out.push(best);
    cur = best;
  }
  return out;
}

export interface RouteLeg {
  path: Tile[];
  ingredient: string;
}

export interface RoutePreview {
  legs: RouteLeg[];
  /** Total tiles walked by a single worker for the whole batch. */
  tiles: number;
  /** Estimated seconds of walking at base speed. */
  seconds: number;
  error: string | null;
}

function nearest(state: GameState, objs: PlacedObject[], from: Tile): PlacedObject | null {
  let best: PlacedObject | null = null;
  let bestD = Infinity;
  for (const o of objs) {
    const wt = workTile(o);
    const d = distanceField(state, wt.x, wt.y)[from.y * state.grid.width + from.x];
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

/**
 * Route preview (PLAN §3.4): fridge → prep → station for one crate of each
 * ingredient, and the estimated walking time for a whole batch by one worker
 * (who walks back to the fridge after every crate).
 */
export function routePreview(state: GameState, stationId: Id, recipeId: string): RoutePreview {
  const st = state.objects[stationId];
  const r = recipe(recipeId);
  const empty: RoutePreview = { legs: [], tiles: 0, seconds: 0, error: null };
  if (!st) return { ...empty, error: 'No station' };
  const stTile = workTile(st);
  const fridges = objectsOfKind(state, 'source');
  const fridge = nearest(state, fridges, stTile);
  if (!fridge) return { ...empty, error: 'No fridge' };
  const fTile = workTile(fridge);
  const dist = (a: Tile, b: Tile) => distanceField(state, b.x, b.y)[a.y * state.grid.width + a.x];

  const legs: RouteLeg[] = [];
  let carried = 0;
  let emptyWalk = 0;
  for (const line of r.ingredients) {
    let path: Tile[];
    let perCrate: number;
    if (line.prep) {
      const preps = objectsOfType(state, line.prep!.station);
      const prep = nearest(state, preps, fTile);
      if (!prep) return { ...empty, error: `No ${stationDef(line.prep.station).name}` };
      const pTile = workTile(prep);
      perCrate = dist(fTile, pTile) + dist(pTile, stTile);
      path = [...pathTiles(state, fTile, pTile), ...pathTiles(state, pTile, stTile).slice(1)];
    } else {
      perCrate = dist(fTile, stTile);
      path = pathTiles(state, fTile, stTile);
    }
    if (!Number.isFinite(perCrate)) return { ...empty, error: `${r.name}: route is blocked` };
    carried += perCrate * line.crates;
    emptyWalk += dist(stTile, fTile) * line.crates;
    legs.push({ path, ingredient: line.ingredient });
  }
  const tiles = carried + emptyWalk;
  const seconds = carried / (BASE_WALK_SPEED * CARRY_CRATE_SPEED) + emptyWalk / BASE_WALK_SPEED;
  return { legs, tiles, seconds, error: null };
}
