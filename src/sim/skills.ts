import { BASE_WALK_SPEED, CARRY_CRATE_SPEED, CARRY_DISHES_SPEED, CARRY_POT_SPEED } from './constants';
import { traitQualityLevels, traitWalkMult, traitWorkMult } from './staff/traits';
import type { Employee, Skill } from './state';

/** Work speed multiplier from skill level: 0 → 0.6×, 10 → 1.0×, 20 → 1.6×. */
export function workSpeed(level: number): number {
  return level <= 10 ? 0.6 + 0.04 * level : 1.0 + 0.06 * (level - 10);
}

export function skillLevel(emp: Employee, skill: Skill): number {
  return emp.skills[skill].level;
}

/** Skill level as it counts toward dish quality (traits like Perfectionist add levels). */
export function qualityLevel(emp: Employee, skill: Skill): number {
  return skillLevel(emp, skill) + traitQualityLevels(emp, skill);
}

export function empWorkSpeed(emp: Employee, skill: Skill): number {
  return workSpeed(skillLevel(emp, skill)) * traitWorkMult(emp, skill);
}

/** Current walking speed in tiles per second. */
export function empWalkSpeed(emp: Employee): number {
  let s = BASE_WALK_SPEED * emp.walkSpeed * traitWalkMult(emp);
  if (emp.carrying?.kind === 'crate') s *= CARRY_CRATE_SPEED;
  else if (emp.carrying?.kind === 'pot') s *= CARRY_POT_SPEED;
  else if (emp.carrying?.kind === 'dishes') s *= CARRY_DISHES_SPEED;
  return s;
}
