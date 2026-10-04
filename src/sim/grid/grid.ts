import { stationDef } from '../../data/stations';
import { Floor, type GameState, type Id, type PlacedObject, type Rot } from '../state';

export interface Tile {
  x: number;
  y: number;
}

export function idx(state: GameState, x: number, y: number): number {
  return y * state.grid.width + x;
}

export function inBounds(state: GameState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < state.grid.width && y < state.grid.height;
}

export function isFloor(f: Floor): boolean {
  return f === Floor.Kitchen || f === Floor.Dining || f === Floor.Staff;
}

/** Footprint size after rotation. */
export function rotatedSize(type: string, rot: Rot): { w: number; h: number } {
  const d = stationDef(type);
  return rot % 2 === 0 ? { w: d.w, h: d.h } : { w: d.h, h: d.w };
}

/**
 * Rotate a rot-0 local cell (may lie outside the footprint, e.g. a work tile) into
 * world space. Rotation is clockwise in steps of 90°: 0 faces south, 1 west,
 * 2 north, 3 east.
 */
export function localToWorld(obj: { type: string; x: number; y: number; rot: Rot }, dx: number, dy: number): Tile {
  const d = stationDef(obj.type);
  // Vector from the footprint centre to the cell centre, in rot-0 space.
  let vx = dx + 0.5 - d.w / 2;
  let vy = dy + 0.5 - d.h / 2;
  for (let i = 0; i < obj.rot; i++) {
    const t = vx;
    vx = -vy;
    vy = t;
  }
  const { w, h } = rotatedSize(obj.type, obj.rot);
  return { x: Math.round(obj.x + w / 2 + vx - 0.5), y: Math.round(obj.y + h / 2 + vy - 0.5) };
}

export function footprint(obj: { type: string; x: number; y: number; rot: Rot }): Tile[] {
  const { w, h } = rotatedSize(obj.type, obj.rot);
  const out: Tile[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.push({ x: obj.x + x, y: obj.y + y });
  return out;
}

export function workTiles(obj: { type: string; x: number; y: number; rot: Rot }): Tile[] {
  return stationDef(obj.type).work.map((w) => localToWorld(obj, w.dx, w.dy));
}

/** The primary work tile, where an agent stands to use the object. */
export function workTile(obj: PlacedObject): Tile {
  return workTiles(obj)[0];
}

// ---------------------------------------------------------------------------
// Derived layout data, cached per grid object and invalidated by layoutVersion.

export interface Layout {
  version: number;
  width: number;
  height: number;
  /** 1 = an agent may stand here. */
  walkable: Uint8Array;
  /** Object occupying each tile ('' for none). Walkable markers are not listed. */
  objectAt: Id[];
  /** Distance fields keyed by target tile index. */
  fields: Map<number, Float32Array>;
}

const cache = new WeakMap<object, Layout>();

export function layout(state: GameState): Layout {
  const cached = cache.get(state.grid);
  if (cached && cached.version === state.layoutVersion) return cached;
  const { width, height, floor } = state.grid;
  const walkable = new Uint8Array(width * height);
  const objectAt: Id[] = new Array(width * height).fill('');
  for (let i = 0; i < floor.length; i++) walkable[i] = isFloor(floor[i]) ? 1 : 0;
  for (const obj of Object.values(state.objects)) {
    const def = stationDef(obj.type);
    if (def.walkable) continue;
    for (const t of footprint(obj)) {
      if (!inBounds(state, t.x, t.y)) continue;
      const i = t.y * width + t.x;
      walkable[i] = 0;
      objectAt[i] = obj.id;
    }
  }
  const l: Layout = { version: state.layoutVersion, width, height, walkable, objectAt, fields: new Map() };
  cache.set(state.grid, l);
  return l;
}

export function isWalkable(state: GameState, x: number, y: number): boolean {
  if (!inBounds(state, x, y)) return false;
  return layout(state).walkable[y * state.grid.width + x] === 1;
}

export function objectAtTile(state: GameState, x: number, y: number): PlacedObject | null {
  if (!inBounds(state, x, y)) return null;
  const id = layout(state).objectAt[y * state.grid.width + x];
  if (id) return state.objects[id] ?? null;
  // Walkable markers (idle spots) are not in objectAt.
  for (const o of Object.values(state.objects)) {
    if (o.x === x && o.y === y) return o;
  }
  return null;
}

export function bumpLayout(state: GameState): void {
  state.layoutVersion++;
}

/** 8 neighbour offsets; the first four are orthogonal. */
export const DIRS: readonly [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/** Can a step from (x,y) by (dx,dy) be taken on the static layout? No corner cutting. */
export function canStepStatic(l: Layout, x: number, y: number, dx: number, dy: number): boolean {
  const nx = x + dx;
  const ny = y + dy;
  if (nx < 0 || ny < 0 || nx >= l.width || ny >= l.height) return false;
  if (!l.walkable[ny * l.width + nx]) return false;
  if (dx !== 0 && dy !== 0) {
    if (!l.walkable[y * l.width + nx] || !l.walkable[ny * l.width + x]) return false;
  }
  return true;
}
