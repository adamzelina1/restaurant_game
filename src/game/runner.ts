import { applyCommand, type Command } from '../sim/commands';
import { TICK_DT } from '../sim/constants';
import { offlineCatchUp } from '../sim/offline/offline';
import type { GameState } from '../sim/state';
import { step } from '../sim/step';

/** Real-time gap (s) above which we switch from tick catch-up to the offline model. */
const OFFLINE_THRESHOLD = 60;
/** Cap on ticks per frame so a catch-up never freezes the page. */
const MAX_TICKS_PER_FRAME = 400;

/**
 * Owns the GameState and drives the fixed-tick simulation from real time.
 * Rendering and UI read `state` and send commands; they never mutate it.
 */
export class GameRunner {
  state: GameState;
  paused = false;
  /** Players get 1×; dev builds can fast-forward. */
  speed = 1;
  /** Fraction (0–1) into the next tick, for render interpolation. */
  alpha = 0;
  /** Incremented after every tick or command batch; UI re-renders on change. */
  revision = 0;

  private queue: Command[] = [];
  private acc = 0;
  private lastReal: number | null = null;
  private listeners = new Set<() => void>();

  constructor(state: GameState) {
    this.state = state;
  }

  send(cmd: Command): void {
    this.queue.push(cmd);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Swap in a different state (load / new game). */
  replaceState(state: GameState): void {
    this.state = state;
    this.queue = [];
    this.acc = 0;
    this.notify();
  }

  setPaused(p: boolean): void {
    this.paused = p;
    this.notify();
  }

  setSpeed(s: number): void {
    this.speed = s;
    this.notify();
  }

  notify(): void {
    this.revision++;
    for (const fn of this.listeners) fn();
  }

  /** Call once per animation frame with performance.now(). */
  frame(nowMs: number): void {
    const last = this.lastReal ?? nowMs;
    this.lastReal = nowMs;
    const realDt = Math.max(0, (nowMs - last) / 1000);

    if (this.paused) {
      // Commands still apply while paused so the UI stays responsive.
      if (this.queue.length > 0) {
        for (const c of this.queue.splice(0)) applyCommand(this.state, c);
        this.notify();
      }
      return;
    }

    if (realDt >= OFFLINE_THRESHOLD) {
      // Background tab or sleep: catch up in one go.
      for (const c of this.queue.splice(0)) applyCommand(this.state, c);
      offlineCatchUp(this.state, realDt * this.speed);
      this.acc = 0;
      this.notify();
      return;
    }

    this.acc += realDt * this.speed;
    let n = 0;
    while (this.acc >= TICK_DT && n < MAX_TICKS_PER_FRAME) {
      step(this.state, this.queue.splice(0));
      this.acc -= TICK_DT;
      n++;
    }
    // Shorter gaps are caught up over the next frames; don't let debt pile up.
    if (n === MAX_TICKS_PER_FRAME) this.acc = Math.min(this.acc, TICK_DT * MAX_TICKS_PER_FRAME);
    this.alpha = Math.min(1, this.acc / TICK_DT);
    if (n > 0) this.notify();
  }
}
