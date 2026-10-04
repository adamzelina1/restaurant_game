import type { Skill, WorkType } from '../sim/state';

/** Data-driven employee modifiers (PLAN §5.1). Missing fields mean "no effect". */
export interface TraitDef {
  id: string;
  name: string;
  description: string;
  /** Walk speed multiplier. */
  walkSpeed?: number;
  /** Work speed multiplier for every skill. */
  workSpeed?: number;
  /** Work speed multipliers per skill (stack with workSpeed). */
  skillSpeed?: Partial<Record<Skill, number>>;
  /** Extra effective skill levels counted toward dish quality. */
  qualityLevels?: number;
  skillQualityLevels?: Partial<Record<Skill, number>>;
  /** Stamina drain multiplier. */
  staminaDrain?: number;
  /** Chance per carry trip to drop the item on the way. */
  dropChance?: number;
  /** XP multiplier given to other staff within `auraRange` tiles. */
  xpAura?: number;
  /** Work types this employee refuses (always off in the priority grid). */
  refuses?: WorkType[];
  /** Tip multiplier on tables this employee serves. */
  tipMult?: number;
  /** Positive traits raise the wage ask; negative ones lower it. */
  wageMod: number;
}

export const AURA_RANGE = 4;

const list: TraitDef[] = [
  { id: 'fastWalker', name: 'Fast Walker', description: '+25% walk speed', walkSpeed: 1.25, wageMod: 1.08 },
  {
    id: 'grillMaster', name: 'Grill Master', description: '+30% Grill speed and quality',
    skillSpeed: { Grill: 1.3 }, skillQualityLevels: { Grill: 3 }, wageMod: 1.1,
  },
  { id: 'clumsy', name: 'Clumsy', description: '5% chance to drop a carried item', dropChance: 0.05, wageMod: 0.9 },
  { id: 'perfectionist', name: 'Perfectionist', description: '+quality, −10% speed', qualityLevels: 4, workSpeed: 0.9, wageMod: 1.05 },
  { id: 'ironLungs', name: 'Iron Lungs', description: '40% slower stamina drain', staminaDrain: 0.6, wageMod: 1.05 },
  { id: 'mentor', name: 'Mentor', description: 'Staff nearby gain +25% XP', xpAura: 1.25, wageMod: 1.08 },
  { id: 'primaDonna', name: 'Prima Donna', description: 'Refuses Dishes and Bus', refuses: ['Dishes', 'Bus'], wageMod: 0.95 },
  { id: 'charming', name: 'Charming', description: '+15% Service speed, +25% tips', skillSpeed: { Service: 1.15 }, tipMult: 1.25, wageMod: 1.08 },
];

export const TRAITS: Record<string, TraitDef> = Object.fromEntries(list.map((t) => [t.id, t]));
export const TRAIT_LIST = list;
