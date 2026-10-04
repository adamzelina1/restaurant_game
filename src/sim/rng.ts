import type { GameState, RngState } from './state';

// mulberry32: tiny, fast, good enough for gameplay. The state is a single uint32
// stored in GameState, so runs are deterministic and replayable.

export function createRng(seed: number): RngState {
  return { s: seed >>> 0 };
}

export function nextFloat(rng: RngState): number {
  let t = (rng.s = (rng.s + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rand(state: GameState): number {
  return nextFloat(state.rng);
}

/** Integer in [min, max] inclusive. */
export function randInt(state: GameState, min: number, max: number): number {
  return min + Math.floor(rand(state) * (max - min + 1));
}

export function randRange(state: GameState, min: number, max: number): number {
  return min + rand(state) * (max - min);
}

export function pick<T>(state: GameState, items: readonly T[]): T {
  return items[Math.floor(rand(state) * items.length)];
}

export function weightedPick<T>(state: GameState, items: readonly T[], weight: (t: T) => number): T | null {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  if (total <= 0) return null;
  let r = rand(state) * total;
  for (const it of items) {
    r -= Math.max(0, weight(it));
    if (r < 0) return it;
  }
  return items[items.length - 1];
}
