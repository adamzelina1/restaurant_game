import { INGREDIENTS } from '../data/ingredients';
import { recipe } from '../data/recipes';
import { stationDef } from '../data/stations';
import type { Crate, Customer, Employee, GameState, Task } from '../sim/state';

function objName(s: GameState, id: string | null): string {
  const o = id ? s.objects[id] : null;
  return o ? stationDef(o.type).name : '?';
}

export function describeTask(s: GameState, t: Task): string {
  const b = t.batchId ? s.batches[t.batchId] : null;
  const c = t.crateId ? s.crates[t.crateId] : null;
  const guest = t.customerId ? s.customers[t.customerId] : null;
  const dish = guest?.dish ? recipe(guest.dish).name.toLowerCase() : 'food';
  const ing = c ? INGREDIENTS[c.ingredient]?.name ?? c.ingredient : '';
  switch (t.kind) {
    case 'deliver':
      if (c?.prepped) return `Loading ${ing} into the ${objName(s, t.targetId ?? b?.stationId ?? null)}`;
      return `Fetching ${ing} → ${t.targetId ? objName(s, t.targetId) : 'station'}`;
    case 'prep': {
      const line = b && recipe(b.recipeId).ingredients.find((l) => l.ingredient === c?.ingredient);
      return `${capital(line?.prep?.verb ?? 'prep')} ${ing.toLowerCase()}`;
    }
    case 'tend':
      return `Cooking ${b ? recipe(b.recipeId).name : ''}`;
    case 'carryBatch':
      return `Carrying ${b ? recipe(b.recipeId).name : 'batch'} to the counter`;
    case 'takeOrder':
      return `Taking an order (party of ${t.partyId ? s.parties[t.partyId]?.size ?? '?' : '?'})`;
    case 'plate':
      return `Plating ${dish}`;
    case 'serve':
      return `Serving ${dish}`;
  }
}

const PHASE_TEXT: Record<string, string> = {
  queue: 'Waiting for a table',
  seating: 'Heading to their table',
  browsing: 'Reading the menu',
  waitOrder: 'Waiting to order',
  waitFood: 'Waiting for food',
  eating: 'Eating',
  leaving: 'Leaving',
};

export function describeCustomer(s: GameState, c: Customer): string {
  const p = s.parties[c.partyId];
  if (!p) return '';
  if (p.phase === 'leaving') return p.angry ? 'Leaving angry!' : 'Leaving happy';
  if (c.plate?.at === 'table' && c.eatLeft > 0) return `Eating ${recipe(c.dish!).name.toLowerCase()}`;
  if (p.phase === 'waitFood' && c.dish) return `Waiting for ${recipe(c.dish).name.toLowerCase()}`;
  return PHASE_TEXT[p.phase] ?? p.phase;
}

export function describeEmployee(s: GameState, e: Employee): string {
  if (e.onBreak) return 'On break ☕';
  const t = e.taskId ? s.tasks[e.taskId] : null;
  if (t) return describeTask(s, t) + (e.activity === 'blocked' ? ' (blocked!)' : '');
  return 'Idle';
}

export function describeCrate(s: GameState, c: Crate): string {
  switch (c.loc.kind) {
    case 'source':
      return 'in the fridge';
    case 'carried':
      return `carried by ${s.employees[c.loc.by]?.name ?? '?'}`;
    case 'station': {
      const where = objName(s, c.loc.id);
      if (c.prepped) return `prepped, on the ${where.toLowerCase()}`;
      if (c.prepDone > 0) return `prepping (${Math.round((100 * (c.prepDone + c.clickRemoved)) / c.prepTime)}%)`;
      return `on the ${where.toLowerCase()}`;
    }
    case 'floor':
      return 'dropped on the floor';
    case 'loaded':
      return 'loaded ✓';
  }
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
