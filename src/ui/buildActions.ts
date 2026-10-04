import type { GameRunner } from '../game/runner';
import { validateLayout } from '../sim/build/analysis';
import type { Rot } from '../sim/state';
import { INITIAL_BUILD, ui } from './store';

/** Build mode pauses the simulation (PLAN §8). */
export function enterBuild(runner: GameRunner): void {
  if (ui.state.build.active) return;
  ui.set({
    build: { ...INITIAL_BUILD, active: true, wasPaused: runner.paused, floorTool: ui.state.build.floorTool },
    picker: null,
    modal: null,
  });
  runner.setPaused(true);
}

/** Leave build mode if the layout is valid; otherwise show why. Returns success. */
export function exitBuild(runner: GameRunner): boolean {
  const b = ui.state.build;
  if (!b.active) return true;
  const problems = validateLayout(runner.state);
  if (problems.length > 0) {
    ui.setBuild({ problems, tool: 'select', moving: null, placeType: null });
    return false;
  }
  ui.set({ build: { ...INITIAL_BUILD, floorTool: b.floorTool } });
  runner.setPaused(b.wasPaused);
  return true;
}

export function rotateBuild(): void {
  const b = ui.state.build;
  ui.setBuild({ rot: ((b.rot + 1) % 4) as Rot });
}

/** Esc in build mode: drop the current tool / held object. */
export function cancelBuildTool(): void {
  ui.setBuild({ tool: 'select', placeType: null, moving: null });
}
