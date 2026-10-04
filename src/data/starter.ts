import type { Passion, Priority, Rot, Skill, WorkType } from '../sim/state';

export interface FloorRect {
  floor: 'floor' | 'wall';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Placement {
  type: string;
  x: number;
  y: number;
  rot: Rot;
}

export interface StarterStaff {
  name: string;
  color: number;
  skills: Partial<Record<Skill, [level: number, passion: Passion]>>;
  traits: string[];
  priorities: Partial<Record<WorkType, Priority>>;
}

export const STARTER = {
  // One room (ChefVille-style): kitchen and tables share the same floor, so
  // every tile is a choice between cooking space and seating. The rest of the
  // lot is empty void you can buy to grow the room.
  width: 40,
  height: 28,
  money: 400,
  seed: 12345,
  /** Painted in order; later rects overwrite earlier ones. */
  floor: [
    { floor: 'wall', x: 0, y: 0, w: 26, h: 16 },
    { floor: 'floor', x: 1, y: 1, w: 24, h: 14 },
    // Front door in the east wall.
    { floor: 'floor', x: 25, y: 13, w: 1, h: 1 },
  ] as FloorRect[],
  objects: [
    // Kitchen line along the north wall, facing south (work tiles on row 2).
    { type: 'fridge', x: 1, y: 1, rot: 0 },
    { type: 'cuttingBoard', x: 3, y: 1, rot: 0 },
    { type: 'cuttingBoard', x: 4, y: 1, rot: 0 },
    { type: 'mixingBench', x: 6, y: 1, rot: 0 },
    { type: 'stove', x: 8, y: 1, rot: 0 },
    { type: 'stove', x: 9, y: 1, rot: 0 },
    { type: 'grill', x: 10, y: 1, rot: 0 },
    // Along the south wall, facing north (work tiles on row 13).
    { type: 'oven', x: 2, y: 14, rot: 2 },
    { type: 'stockPot', x: 4, y: 14, rot: 2 },
    // Serving counters, filled from the kitchen side (west).
    { type: 'counter', x: 12, y: 3, rot: 1 },
    { type: 'counter', x: 12, y: 4, rot: 1 },
    { type: 'counter', x: 12, y: 5, rot: 1 },
    { type: 'counter', x: 12, y: 6, rot: 1 },
    { type: 'counter', x: 12, y: 7, rot: 1 },
    // The pass: plated at (11,9), picked up by servers at (13,9).
    { type: 'pass', x: 12, y: 9, rot: 1 },
    // Seating.
    { type: 'entrance', x: 25, y: 13, rot: 0 },
    { type: 'hostStand', x: 22, y: 12, rot: 0 },
    { type: 'table4', x: 16, y: 3, rot: 0 },
    { type: 'table4', x: 16, y: 8, rot: 0 },
    { type: 'table2', x: 21, y: 3, rot: 0 },
    { type: 'table2', x: 21, y: 8, rot: 0 },
    { type: 'table2', x: 16, y: 12, rot: 0 },
    { type: 'plant', x: 24, y: 1, rot: 0 },
    { type: 'plant', x: 13, y: 14, rot: 0 },
    // Idle spots along the west wall.
    { type: 'idleSpot', x: 1, y: 6, rot: 0 },
    { type: 'idleSpot', x: 1, y: 7, rot: 0 },
    { type: 'idleSpot', x: 1, y: 8, rot: 0 },
    { type: 'idleSpot', x: 1, y: 9, rot: 0 },
  ] as Placement[],
  staff: [
    {
      name: 'Marco',
      color: 0x3d85c6,
      skills: { Grill: [7, 2], Saute: [5, 1], Prep: [4, 0], Baking: [2, 0], Plating: [3, 0], Service: [1, 0] },
      traits: ['grillMaster'],
      priorities: { Cook: 1, Prep: 2, Haul: 3, Plate: 3, Orders: 4, Serve: 4, Bus: 4, Dishes: 4 },
    },
    {
      name: 'Ana',
      color: 0xc27ba0,
      skills: { Prep: [6, 2], Baking: [5, 1], Saute: [3, 0], Grill: [2, 0], Plating: [4, 0], Service: [5, 1] },
      traits: [],
      priorities: { Prep: 1, Haul: 2, Cook: 3, Plate: 2, Orders: 1, Serve: 1, Bus: 3, Dishes: 4 },
    },
  ] as StarterStaff[],
};
