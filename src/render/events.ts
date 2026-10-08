import { rotatedSize } from '../sim/grid/grid';
import { counterStock } from '../sim/counters/counters';
import { masteryStars } from '../sim/progression/progression';
import { SKILLS, type GameState, type Id, type Skill } from '../sim/state';

/**
 * Things worth a sound or a popup, found by diffing two frames of state.
 * Render-side only: the sim never knows these exist. Positions are in tiles.
 */
export type GameEvent =
  | { kind: 'pay'; amount: number; x: number; y: number }
  | { kind: 'ready'; objectId: Id; x: number; y: number }
  | { kind: 'stocked'; objectId: Id; n: number; x: number; y: number }
  | { kind: 'levelUp'; employeeId: Id; skill: Skill; level: number }
  | { kind: 'mastery'; recipeId: string; stars: number }
  | { kind: 'unlock'; recipeId: string }
  | { kind: 'upgrade'; objectId: Id; tier: number; x: number; y: number }
  | { kind: 'angry'; x: number; y: number };

/** A gap bigger than this (sim seconds) is a catch-up, not something to animate. */
const MAX_GAP = 30;

interface Snapshot {
  state: GameState;
  time: number;
  sales: number;
  paid: Set<Id>;
  angry: Set<Id>;
  ready: Set<Id>;
  stock: Map<Id, number>;
  tiers: Map<Id, number>;
  skills: Map<string, number>;
  mastery: Map<string, number>;
  unlocked: Set<string>;
}

function centre(state: GameState, id: Id): { x: number; y: number } {
  const o = state.objects[id];
  if (!o) return { x: 0, y: 0 };
  const { w, h } = rotatedSize(o.type, o.rot);
  return { x: o.x + w / 2, y: o.y + h / 2 };
}

function snapshot(s: GameState): Snapshot {
  const snap: Snapshot = {
    state: s,
    time: s.time,
    sales: s.stats.revenue + s.stats.tips,
    paid: new Set(),
    angry: new Set(),
    ready: new Set(),
    stock: new Map(),
    tiers: new Map(),
    skills: new Map(),
    mastery: new Map(),
    unlocked: new Set(s.unlockedRecipes),
  };
  for (const c of Object.values(s.customers)) if (c.satisfaction !== null) snap.paid.add(c.id);
  for (const p of Object.values(s.parties)) if (p.angry) snap.angry.add(p.id);
  for (const b of Object.values(s.batches)) if (b.phase === 'ready') snap.ready.add(b.id);
  for (const o of Object.values(s.objects)) {
    if (o.counter) snap.stock.set(o.id, counterStock(o));
    snap.tiers.set(o.id, o.tier);
  }
  for (const e of Object.values(s.employees)) for (const k of SKILLS) snap.skills.set(`${e.id}:${k}`, e.skills[k].level);
  for (const r of s.unlockedRecipes) snap.mastery.set(r, masteryStars(s, r));
  return snap;
}

export class EventWatcher {
  private prev: Snapshot | null = null;

  /** Events since the last call. Call once per rendered frame. */
  poll(s: GameState): GameEvent[] {
    const prev = this.prev;
    const now = snapshot(s);
    this.prev = now;
    if (!prev || prev.state !== s || s.time < prev.time || s.time - prev.time > MAX_GAP) return [];
    if (s.time === prev.time) return [];
    const out: GameEvent[] = [];

    // Guests who paid since last frame, grouped by party; the frame's takings are split between them.
    const parties = new Map<Id, { x: number; y: number; n: number }>();
    for (const c of Object.values(s.customers)) {
      if (c.satisfaction === null || prev.paid.has(c.id)) continue;
      const p = s.parties[c.partyId];
      const at = p?.tableId ? centre(s, p.tableId) : { x: c.x + 0.5, y: c.y + 0.5 };
      const g = parties.get(c.partyId) ?? { ...at, n: 0 };
      g.n++;
      parties.set(c.partyId, g);
    }
    const takings = now.sales - prev.sales;
    if (takings > 0 && parties.size > 0) {
      for (const g of parties.values()) out.push({ kind: 'pay', amount: takings / parties.size, x: g.x, y: g.y });
    }

    for (const p of Object.values(s.parties)) {
      if (!p.angry || prev.angry.has(p.id)) continue;
      const c = s.customers[p.members[0]];
      if (c) out.push({ kind: 'angry', x: c.x + 0.5, y: c.y + 0.5 });
    }
    for (const b of Object.values(s.batches)) {
      if (b.phase === 'ready' && !prev.ready.has(b.id)) out.push({ kind: 'ready', objectId: b.stationId, ...centre(s, b.stationId) });
    }
    for (const [id, n] of now.stock) {
      const before = prev.stock.get(id);
      if (before !== undefined && n > before) out.push({ kind: 'stocked', objectId: id, n: n - before, ...centre(s, id) });
    }
    for (const [id, tier] of now.tiers) {
      const before = prev.tiers.get(id);
      if (before !== undefined && tier > before) out.push({ kind: 'upgrade', objectId: id, tier, ...centre(s, id) });
    }
    for (const [key, level] of now.skills) {
      const before = prev.skills.get(key);
      if (before === undefined || level <= before) continue;
      const [employeeId, skill] = key.split(':') as [Id, Skill];
      out.push({ kind: 'levelUp', employeeId, skill, level });
    }
    for (const r of now.unlocked) if (!prev.unlocked.has(r)) out.push({ kind: 'unlock', recipeId: r });
    for (const [r, stars] of now.mastery) {
      const before = prev.mastery.get(r);
      if (before !== undefined && stars > before) out.push({ kind: 'mastery', recipeId: r, stars });
    }
    return out;
  }
}
