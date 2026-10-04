import type { StationKind } from './stations';

/** Equipment tiers (PLAN §7): bought per station, gated by reputation stars. */
export interface TierDef {
  tier: number;
  /** Upgrade price as a multiple of the station's purchase price. */
  costMult: number;
  minStars: number;
}

export const TIERS: TierDef[] = [
  { tier: 2, costMult: 1, minStars: 1 },
  { tier: 3, costMult: 2.5, minStars: 3 },
  { tier: 4, costMult: 5, minStars: 4 },
];

export const MAX_TIER = 1 + TIERS.length;

/** Station kinds whose tier does something. */
export const UPGRADABLE: StationKind[] = ['cook', 'prep', 'dishpit'];

/** What each tier adds, per step above tier 1. */
export const TIER_EFFECTS = {
  /** Cook, prep and wash speed. */
  speed: 0.15,
  /** Extra servings per batch (cooking stations). */
  servings: 0.1,
  /** Dish quality (cooking stations). */
  quality: 0.05,
};

export function tierDef(tier: number): TierDef | null {
  return TIERS.find((t) => t.tier === tier) ?? null;
}
