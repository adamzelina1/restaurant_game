import type { Id } from '../sim/state';

export type Selection = { kind: 'object'; id: Id } | { kind: 'employee'; id: Id } | null;

export interface UiState {
  selected: Selection;
  /** Station whose recipe picker is open. */
  picker: Id | null;
  menuOpen: boolean;
}

/** Tiny observable store for view-only UI state (never game state). */
class UiStore {
  state: UiState = { selected: null, picker: null, menuOpen: false };
  private listeners = new Set<() => void>();

  set(patch: Partial<UiState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const ui = new UiStore();
