import { QUALITY_DECAY_TAU, QUALITY_FLOOR, READY_GRACE_FRACTION, READY_GRACE_MIN } from './constants';
import type { Batch } from './state';
import { clamp } from './util';

/** Base batch quality (0–1) from the skills that went into it and the station tier. */
export function batchQuality(prepSkill: number, cookSkill: number, tier: number): number {
  return clamp(0.3 + 0.03 * cookSkill + 0.015 * prepSkill + 0.05 * (tier - 1), 0, 1);
}

export function computeBatchQuality(b: Batch, tier: number): number {
  const cook = b.cookSkillCount > 0 ? b.cookSkillSum / b.cookSkillCount : 0;
  const prep = b.prepSkillCount > 0 ? b.prepSkillSum / b.prepSkillCount : cook;
  return batchQuality(prep, cook, tier);
}

/**
 * Quality after waiting `age` seconds: full quality during the grace window,
 * then exponential decay toward the floor. Never below the floor unless it
 * started there.
 */
export function decayedQuality(q: number, age: number, grace: number): number {
  if (age <= grace || q <= QUALITY_FLOOR) return q;
  return QUALITY_FLOOR + (q - QUALITY_FLOOR) * Math.exp(-(age - grace) / QUALITY_DECAY_TAU);
}

export function readyGrace(cookTime: number): number {
  return Math.max(READY_GRACE_MIN, READY_GRACE_FRACTION * cookTime);
}
