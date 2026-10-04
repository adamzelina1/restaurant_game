import { MAX_MESSAGES } from './constants';
import type { GameState, Id, Message } from './state';

export function newId(state: GameState, prefix: string): Id {
  return `${prefix}${state.nextId++}`;
}

export function message(state: GameState, text: string, kind: Message['kind'] = 'info'): void {
  state.messages.push({ id: state.nextMessageId++, t: state.time, text, kind });
  if (state.messages.length > MAX_MESSAGES) state.messages.splice(0, state.messages.length - MAX_MESSAGES);
}

/** Object.values in insertion order, which is creation order for our string ids. */
export function values<T>(rec: Record<string, T>): T[] {
  return Object.values(rec);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function spend(state: GameState, amount: number): boolean {
  if (state.money < amount) return false;
  state.money -= amount;
  state.stats.spent += amount;
  return true;
}
