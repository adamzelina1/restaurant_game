import { AURA_RANGE } from '../../data/traits';
import { MAX_SKILL, PASSION_XP } from '../constants';
import type { Employee, GameState, Skill, SkillState } from '../state';
import { message, values } from '../util';
import { traitDefs, traitWageMult } from './traits';

/** XP (seconds of work at 1×) needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return Math.round(300 * Math.pow(1 + level, 1.2));
}

/** XP multiplier from mentors standing nearby. */
function auraMult(state: GameState, emp: Employee): number {
  let m = 1;
  for (const other of values(state.employees)) {
    if (other.id === emp.id) continue;
    if (Math.max(Math.abs(other.x - emp.x), Math.abs(other.y - emp.y)) > AURA_RANGE) continue;
    for (const t of traitDefs(other)) if (t.xpAura) m = Math.max(m, t.xpAura);
  }
  return m;
}

/** Wage per hour for a set of skills and traits (PLAN §5.1). */
export function wageFor(skills: Record<Skill, SkillState>, traits: string[]): number {
  let levels = 0;
  let passions = 0;
  for (const s of Object.values(skills)) {
    levels += s.level;
    passions += s.passion;
  }
  return Math.round((4 + 0.35 * levels + passions) * traitWageMult({ traits }) * 10) / 10;
}

/** Gain XP for `seconds` of work in a skill; handles level-ups. */
export function gainXp(state: GameState, emp: Employee, skill: Skill, seconds: number): void {
  const s = emp.skills[skill];
  if (s.level >= MAX_SKILL) return;
  s.xp += seconds * PASSION_XP[s.passion] * auraMult(state, emp);
  while (s.level < MAX_SKILL && s.xp >= xpToNext(s.level)) {
    s.xp -= xpToNext(s.level);
    s.level++;
    // Wages rise slowly with skill.
    emp.wage = Math.round((emp.wage + 0.35 * traitWageMult(emp)) * 10) / 10;
    message(state, `${emp.name} reached ${skill} ${s.level}`, 'good');
  }
  if (s.level >= MAX_SKILL) s.xp = 0;
}
