import type { Passion, Priority, Rot, Skill, WorkType } from '../sim/state';

export interface FloorRect {
  floor: 'kitchen' | 'dining' | 'wall' | 'staff';
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
  width: 28,
  height: 18,
  money: 400,
  seed: 12345,
  /** Painted in order; later rects overwrite earlier ones. */
  floor: [
    { floor: 'wall', x: 0, y: 0, w: 15, h: 13 },
    { floor: 'kitchen', x: 1, y: 1, w: 13, h: 11 },
    { floor: 'wall', x: 14, y: 0, w: 14, h: 18 },
    { floor: 'dining', x: 15, y: 1, w: 12, h: 16 },
    // Counter gap between kitchen and dining, and a staff door.
    { floor: 'kitchen', x: 14, y: 3, w: 1, h: 5 },
    { floor: 'kitchen', x: 14, y: 10, w: 1, h: 1 },
    // Staff room below the kitchen, through a door at (9,12).
    { floor: 'wall', x: 6, y: 12, w: 8, h: 6 },
    { floor: 'staff', x: 7, y: 13, w: 6, h: 4 },
    { floor: 'kitchen', x: 9, y: 12, w: 1, h: 1 },
  ] as FloorRect[],
  objects: [
    // Back wall, facing south (work tiles on row 2).
    { type: 'fridge', x: 1, y: 1, rot: 0 },
    { type: 'cuttingBoard', x: 4, y: 1, rot: 0 },
    { type: 'cuttingBoard', x: 5, y: 1, rot: 0 },
    { type: 'mixingBench', x: 7, y: 1, rot: 0 },
    { type: 'stove', x: 9, y: 1, rot: 0 },
    { type: 'stove', x: 10, y: 1, rot: 0 },
    { type: 'grill', x: 12, y: 1, rot: 0 },
    // Front wall, facing north (work tiles on row 10).
    { type: 'oven', x: 3, y: 11, rot: 2 },
    { type: 'stockPot', x: 6, y: 11, rot: 2 },
    // Serving counters in the pass-through, facing the kitchen (west).
    { type: 'counter', x: 14, y: 3, rot: 1 },
    { type: 'counter', x: 14, y: 4, rot: 1 },
    { type: 'counter', x: 14, y: 5, rot: 1 },
    { type: 'counter', x: 14, y: 6, rot: 1 },
    { type: 'counter', x: 14, y: 7, rot: 1 },
    // Idle spots along the west wall.
    { type: 'idleSpot', x: 1, y: 5, rot: 0 },
    { type: 'idleSpot', x: 1, y: 6, rot: 0 },
    { type: 'idleSpot', x: 1, y: 7, rot: 0 },
    { type: 'idleSpot', x: 1, y: 8, rot: 0 },
    // Staff room: a couch (two seats) and a coffee machine.
    { type: 'couch', x: 7, y: 16, rot: 2 },
    { type: 'coffeeMachine', x: 12, y: 13, rot: 1 },
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
