/** Floor zones the player can paint. */
export type FloorZone = 'kitchen' | 'dining' | 'staff';

export const FLOOR_COSTS = {
  /** Buy new floor (void or wall → floor), per tile. */
  buy: 20,
  /** Re-zone existing floor (kitchen ↔ dining ↔ staff), per tile. */
  rezone: 2,
  /** Build a wall on a floor tile. */
  wall: 10,
};

/** Fraction of the purchase price refunded when selling an object. */
export const SELL_REFUND = 0.5;

export interface PaletteGroup {
  name: string;
  items: string[];
}

export const PALETTE: PaletteGroup[] = [
  { name: 'Kitchen', items: ['fridge', 'cuttingBoard', 'mixingBench', 'stove', 'grill', 'fryer', 'oven', 'stockPot'] },
  { name: 'Service', items: ['counter'] },
  { name: 'Staff', items: ['idleSpot', 'couch', 'coffeeMachine'] },
];
