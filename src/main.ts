import Phaser from 'phaser';
import { h, render } from 'preact';
import { GameRunner } from './game/runner';
import { WorldScene } from './render/WorldScene';
import { loadGame, saveGame } from './save/save';
import { newGame } from './sim/newGame';
import { offlineCatchUp } from './sim/offline/offline';
import { awayReport, awaySnapshot, type AwaySnapshot } from './sim/offline/report';
import type { GameState } from './sim/state';
import { App } from './ui/App';
import { watchReady } from './ui/notify';
import { ui } from './ui/store';
import './ui/styles.css';

const AUTOSAVE_MS = 30_000;

/** Absences shorter than this (sim seconds) don't get a welcome-back report. */
const REPORT_AFTER = 300;

function showAwayReport(before: AwaySnapshot, state: GameState): void {
  if (state.time - before.time >= REPORT_AFTER) ui.set({ away: awayReport(before, state) });
}

function boot(): GameRunner {
  const saved = loadGame();
  if (!saved) return new GameRunner(newGame());
  const runner = new GameRunner(saved.state);
  const away = (Date.now() - saved.savedAt) / 1000;
  if (away > 1) {
    const before = awaySnapshot(runner.state);
    offlineCatchUp(runner.state, away);
    showAwayReport(before, runner.state);
  }
  return runner;
}

const runner = boot();
watchReady(runner);

/** WebGL can't create a 0×0 framebuffer, so wait until the container has a size. */
function whenSized(el: HTMLElement, cb: () => void): void {
  if (el.clientWidth > 0 && el.clientHeight > 0) return cb();
  const ro = new ResizeObserver(() => {
    if (el.clientWidth > 0 && el.clientHeight > 0) {
      ro.disconnect();
      cb();
    }
  });
  ro.observe(el);
}

const container = document.getElementById('game')!;
whenSized(container, () => {
  const phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    backgroundColor: '#15171b',
    scale: { mode: Phaser.Scale.RESIZE, width: container.clientWidth, height: container.clientHeight },
    render: { antialias: true, roundPixels: false },
    disableContextMenu: true,
    scene: [new WorldScene(runner)],
  });
  if (import.meta.env.DEV) (window as unknown as { phaser: Phaser.Game }).phaser = phaser;
});

render(h(App, { runner }), document.getElementById('ui')!);

setInterval(() => saveGame(runner.state), AUTOSAVE_MS);
// Hidden tabs get no animation frames, so keep the sim going from a timer
// (browsers throttle it to about once a minute; the runner catches up).
let hiddenSince: AwaySnapshot | null = null;
setInterval(() => {
  if (document.hidden) runner.frame(performance.now());
}, 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    saveGame(runner.state);
    hiddenSince = awaySnapshot(runner.state);
  } else if (hiddenSince) {
    runner.frame(performance.now());
    showAwayReport(hiddenSince, runner.state);
    hiddenSince = null;
  }
});
window.addEventListener('beforeunload', () => saveGame(runner.state));

// Handy for debugging in the console.
(window as unknown as { game: GameRunner }).game = runner;
