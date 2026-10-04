// Build mode commands (PLAN §8): place, move/rotate, sell objects and paint floor.

import { FLOOR_COSTS, SELL_REFUND, type FloorZone } from '../../data/build';
import { stationDef } from '../../data/stations';
import { footprint, inBounds, isFloor, workTiles, type Tile } from '../grid/grid';
import { placeObject } from '../newGame';
import { Floor, type GameState, type Id, type PlacedObject, type Rot } from '../state';
import { message, spend, values } from '../util';

const ZONE_FLOOR: Record<FloorZone, Floor> = { kitchen: Floor.Kitchen, dining: Floor.Dining, staff: Floor.Staff };

function agentTiles(state: GameState): Set<string> {
  const s = new Set<string>();
  for (const e of values(state.employees)) {
    s.add(`${e.x},${e.y}`);
    if (e.step) s.add(`${e.step.tx},${e.step.ty}`);
  }
  return s;
}

/** Tiles covered by objects (footprints) and used as work tiles, excluding one object. */
function occupiedBy(state: GameState, except: Id | null): { foot: Set<string>; work: Set<string> } {
  const foot = new Set<string>();
  const work = new Set<string>();
  for (const o of values(state.objects)) {
    if (o.id === except) continue;
    for (const t of footprint(o)) foot.add(`${t.x},${t.y}`);
    if (!stationDef(o.type).walkable) for (const t of workTiles(o)) work.add(`${t.x},${t.y}`);
  }
  return { foot, work };
}

/** Why an object can't go here, or null if it can (PLAN §8 ghost validity). */
export function placementError(
  state: GameState,
  type: string,
  x: number,
  y: number,
  rot: Rot,
  movingId: Id | null = null,
): string | null {
  const def = stationDef(type);
  const probe = { type, x, y, rot };
  const fp = footprint(probe);
  const wts = workTiles(probe);
  const { foot, work } = occupiedBy(state, movingId);
  const agents = agentTiles(state);
  for (const t of fp) {
    if (!inBounds(state, t.x, t.y) || !isFloor(state.grid.floor[t.y * state.grid.width + t.x])) return 'Must be on floor';
    if (foot.has(`${t.x},${t.y}`)) return 'Overlaps another object';
    if (!def.walkable && work.has(`${t.x},${t.y}`)) return "Blocks another object's work tile";
    if (!def.walkable && agents.has(`${t.x},${t.y}`)) return 'Someone is standing there';
  }
  if (!def.walkable) {
    const fpSet = new Set(fp.map((t) => `${t.x},${t.y}`));
    for (const t of wts) {
      if (!inBounds(state, t.x, t.y) || !isFloor(state.grid.floor[t.y * state.grid.width + t.x])) return 'Work tile must be on floor';
      if (foot.has(`${t.x},${t.y}`) || fpSet.has(`${t.x},${t.y}`)) return 'Work tile is blocked';
    }
  }
  return null;
}

/** Busy objects can't be moved or sold (PLAN §8). */
export function busyReason(state: GameState, o: PlacedObject): string | null {
  if (o.cook?.batchId) return 'It has a batch in progress';
  if (o.prep && (o.prep.crateId || o.prep.reservedBy)) return 'A crate is on it';
  if (o.counter && (o.counter.incoming.length > 0 || o.counter.lots.length > 0)) return 'It still holds food';
  if (values(state.employees).some((e) => e.onBreak?.objectId === o.id)) return 'Someone is resting on it';
  return null;
}

export function buyObject(state: GameState, type: string, x: number, y: number, rot: Rot): boolean {
  const err = placementError(state, type, x, y, rot);
  if (err) {
    message(state, err, 'warn');
    return false;
  }
  const def = stationDef(type);
  if (!spend(state, def.cost)) {
    message(state, `${def.name} costs $${def.cost}`, 'warn');
    return false;
  }
  placeObject(state, { type, x, y, rot });
  return true;
}

export function moveObject(state: GameState, id: Id, x: number, y: number, rot: Rot): boolean {
  const o = state.objects[id];
  if (!o) return false;
  const busy = busyReason(state, o);
  if (busy) {
    message(state, `Can't move: ${busy.toLowerCase()}`, 'warn');
    return false;
  }
  const err = placementError(state, o.type, x, y, rot, id);
  if (err) {
    message(state, err, 'warn');
    return false;
  }
  o.x = x;
  o.y = y;
  o.rot = rot;
  state.layoutVersion++;
  return true;
}

export function sellObject(state: GameState, id: Id): boolean {
  const o = state.objects[id];
  if (!o) return false;
  const busy = busyReason(state, o);
  if (busy) {
    message(state, `Can't sell: ${busy.toLowerCase()}`, 'warn');
    return false;
  }
  const refund = Math.floor(stationDef(o.type).cost * SELL_REFUND);
  state.money += refund;
  delete state.objects[id];
  state.layoutVersion++;
  return true;
}

export type FloorTool = FloorZone | 'wall';

/** Cost to apply a floor tool to one tile, or null if not allowed there. */
export function floorTileCost(state: GameState, t: Tile, tool: FloorTool): number | null {
  if (!inBounds(state, t.x, t.y)) return null;
  const cur = state.grid.floor[t.y * state.grid.width + t.x];
  if (tool === 'wall') return isFloor(cur) ? FLOOR_COSTS.wall : null;
  const target = ZONE_FLOOR[tool];
  if (cur === target) return null;
  return isFloor(cur) ? FLOOR_COSTS.rezone : FLOOR_COSTS.buy;
}

/** Paint floor on a set of tiles; skips tiles where the tool doesn't apply. */
export function paintTiles(state: GameState, tiles: Tile[], tool: FloorTool): boolean {
  const { foot, work } = occupiedBy(state, null);
  const agents = agentTiles(state);
  const apply: { t: Tile; cost: number }[] = [];
  for (const t of tiles) {
    const cost = floorTileCost(state, t, tool);
    if (cost === null) continue;
    const k = `${t.x},${t.y}`;
    if (tool === 'wall' && (foot.has(k) || work.has(k) || agents.has(k))) continue;
    apply.push({ t, cost });
  }
  if (apply.length === 0) return false;
  const total = apply.reduce((n, a) => n + a.cost, 0);
  if (!spend(state, total)) {
    message(state, `That costs $${total}`, 'warn');
    return false;
  }
  const f = tool === 'wall' ? Floor.Wall : ZONE_FLOOR[tool];
  for (const { t } of apply) state.grid.floor[t.y * state.grid.width + t.x] = f;
  state.layoutVersion++;
  return true;
}
