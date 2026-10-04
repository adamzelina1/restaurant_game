import { TRAITS, type TraitDef } from '../../data/traits';
import type { Skill, WorkType } from '../state';

type HasTraits = { traits: string[] };

export function traitDefs(e: HasTraits): TraitDef[] {
  return e.traits.map((t) => TRAITS[t]).filter((t): t is TraitDef => !!t);
}

function product(e: HasTraits, f: (t: TraitDef) => number | undefined): number {
  let m = 1;
  for (const t of traitDefs(e)) m *= f(t) ?? 1;
  return m;
}

export function traitWalkMult(e: HasTraits): number {
  return product(e, (t) => t.walkSpeed);
}

export function traitWorkMult(e: HasTraits, skill: Skill): number {
  return product(e, (t) => (t.workSpeed ?? 1) * (t.skillSpeed?.[skill] ?? 1));
}

export function traitQualityLevels(e: HasTraits, skill: Skill): number {
  let n = 0;
  for (const t of traitDefs(e)) n += (t.qualityLevels ?? 0) + (t.skillQualityLevels?.[skill] ?? 0);
  return n;
}

export function traitDropChance(e: HasTraits): number {
  let p = 0;
  for (const t of traitDefs(e)) p = Math.max(p, t.dropChance ?? 0);
  return p;
}

export function refuses(e: HasTraits, w: WorkType): boolean {
  return traitDefs(e).some((t) => t.refuses?.includes(w));
}

export function traitTipMult(e: HasTraits): number {
  return product(e, (t) => t.tipMult);
}

export function traitWageMult(e: HasTraits): number {
  return product(e, (t) => t.wageMod);
}
