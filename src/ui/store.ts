import type { FloorTool } from '../sim/build/build';
import type { LayoutProblem } from '../sim/build/analysis';
import type { Id, Rot } from '../sim/state';

export type Selection = { kind: 'object'; id: Id } | { kind: 'employee'; id: Id } | { kind: 'customer'; id: Id } | null;

export type Modal = 'staff' | 'hiring' | null;

export type BuildTool = 'select' | 'place' | 'floor' | 'sell';

export interface BuildState {
  active: boolean;
  tool: BuildTool;
  /** Object type being placed (tool 'place'). */
  placeType: string | null;
  rot: Rot;
  floorTool: FloorTool;
  /** Object picked up for moving (tool 'select'). */
  moving: Id | null;
  routeStation: Id | null;
  routeRecipe: string | null;
  /** Pause state to restore when leaving build mode. */
  wasPaused: boolean;
  /** Problems that blocked leaving build mode. */
  problems: LayoutProblem[];
}

export type Overlay = 'none' | 'traffic' | 'blocking';

export interface UiState {
  selected: Selection;
  /** Station whose recipe picker is open. */
  picker: Id | null;
  menuOpen: boolean;
  modal: Modal;
  build: BuildState;
  overlay: Overlay;
}

export const INITIAL_BUILD: BuildState = {
  active: false,
  tool: 'select',
  placeType: null,
  rot: 0,
  floorTool: 'floor',
  moving: null,
  routeStation: null,
  routeRecipe: null,
  wasPaused: false,
  problems: [],
};

/** Tiny observable store for view-only UI state (never game state). */
class UiStore {
  state: UiState = { selected: null, picker: null, menuOpen: false, modal: null, build: INITIAL_BUILD, overlay: 'none' };
  private listeners = new Set<() => void>();

  set(patch: Partial<UiState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  setBuild(patch: Partial<BuildState>): void {
    this.set({ build: { ...this.state.build, ...patch } });
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const ui = new UiStore();
