import type { Skill } from '../sim/state';

export type StationKind =
  | 'source' | 'prep' | 'cook' | 'counter' | 'idle' | 'rest' | 'boost'
  | 'table' | 'host' | 'pass' | 'entrance' | 'decor';

export interface StationDef {
  id: string;
  name: string;
  kind: StationKind;
  /** Skill used when working here (prep and cook stations). */
  skill?: Skill;
  /** Footprint at rotation 0. */
  w: number;
  h: number;
  /** Work tiles at rotation 0, relative to the footprint's top-left. Rotation 0 faces south. */
  work: { dx: number; dy: number }[];
  /** Footprint can be walked over (floor markers such as idle spots). */
  walkable?: boolean;
  /** Tables: chair tiles where guests sit (rot 0, relative to the top-left). */
  seats?: { dx: number; dy: number }[];
  /** Must stand on dining floor (guest-facing objects). */
  dining?: boolean;
  cost: number;
  /** Placeholder art. */
  color: number;
  label: string;
}

const S = { dx: 0, dy: 1 };

export const STATIONS: Record<string, StationDef> = {
  fridge: { id: 'fridge', name: 'Fridge', kind: 'source', w: 1, h: 1, work: [S], cost: 400, color: 0x8ab6d6, label: 'FRG' },
  cuttingBoard: { id: 'cuttingBoard', name: 'Cutting board', kind: 'prep', skill: 'Prep', w: 1, h: 1, work: [S], cost: 150, color: 0xc8a165, label: 'CUT' },
  mixingBench: { id: 'mixingBench', name: 'Mixing bench', kind: 'prep', skill: 'Baking', w: 1, h: 1, work: [S], cost: 250, color: 0xe6d3a3, label: 'MIX' },
  stove: { id: 'stove', name: 'Stove', kind: 'cook', skill: 'Saute', w: 1, h: 1, work: [S], cost: 600, color: 0x707070, label: 'STV' },
  grill: { id: 'grill', name: 'Grill', kind: 'cook', skill: 'Grill', w: 1, h: 1, work: [S], cost: 800, color: 0x5a3d2b, label: 'GRL' },
  fryer: { id: 'fryer', name: 'Deep fryer', kind: 'cook', skill: 'Grill', w: 1, h: 1, work: [S], cost: 700, color: 0xb8860b, label: 'FRY' },
  oven: { id: 'oven', name: 'Oven', kind: 'cook', skill: 'Baking', w: 1, h: 1, work: [S], cost: 1000, color: 0x8b4513, label: 'OVN' },
  stockPot: { id: 'stockPot', name: 'Stock pot', kind: 'cook', skill: 'Saute', w: 1, h: 1, work: [S], cost: 900, color: 0x556b2f, label: 'POT' },
  counter: { id: 'counter', name: 'Serving counter', kind: 'counter', w: 1, h: 1, work: [S], cost: 300, color: 0xd9d9d9, label: 'CTR' },
  idleSpot: { id: 'idleSpot', name: 'Idle spot', kind: 'idle', w: 1, h: 1, work: [{ dx: 0, dy: 0 }], walkable: true, cost: 0, color: 0x6aa84f, label: '' },
  // Staff room: each couch seat (work tile) is a rest spot; coffee machines boost recovery.
  couch: { id: 'couch', name: 'Couch', kind: 'rest', w: 2, h: 1, work: [S, { dx: 1, dy: 1 }], cost: 250, color: 0x8e7cc3, label: 'SOFA' },
  coffeeMachine: { id: 'coffeeMachine', name: 'Coffee machine', kind: 'boost', w: 1, h: 1, work: [S], cost: 350, color: 0x4e342e, label: 'CAF' },
  // Front of house. Waiters use the work tile; guests sit on the seats.
  table2: {
    id: 'table2', name: 'Table for 2', kind: 'table', w: 1, h: 1, work: [S], dining: true,
    seats: [{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }], cost: 200, color: 0xa0784f, label: '',
  },
  table4: {
    id: 'table4', name: 'Table for 4', kind: 'table', w: 2, h: 1, work: [S], dining: true,
    seats: [{ dx: -1, dy: 0 }, { dx: 2, dy: 0 }, { dx: 0, dy: -1 }, { dx: 1, dy: -1 }], cost: 350, color: 0xa0784f, label: '',
  },
  hostStand: { id: 'hostStand', name: 'Host stand', kind: 'host', w: 1, h: 1, work: [S], dining: true, cost: 150, color: 0x6d4c41, label: 'HOST' },
  // The pass: plated on the kitchen side (work tile 0), picked up from the dining side (work tile 1).
  pass: { id: 'pass', name: 'The Pass', kind: 'pass', w: 1, h: 1, work: [S, { dx: 0, dy: -1 }], cost: 400, color: 0xb7b7b7, label: 'PASS' },
  entrance: { id: 'entrance', name: 'Entrance', kind: 'entrance', w: 1, h: 1, work: [{ dx: 0, dy: 0 }], walkable: true, dining: true, cost: 0, color: 0xffd966, label: '' },
  plant: { id: 'plant', name: 'Plant', kind: 'decor', w: 1, h: 1, work: [], dining: true, cost: 120, color: 0x38761d, label: '' },
};

export function stationDef(type: string): StationDef {
  const d = STATIONS[type];
  if (!d) throw new Error(`Unknown station type ${type}`);
  return d;
}
