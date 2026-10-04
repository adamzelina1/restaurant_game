import Phaser from 'phaser';
import { h, render } from 'preact';
import { GameRunner } from './game/runner';
import { WorldScene } from './render/WorldScene';
import { loadGame, saveGame } from './save/save';
import { newGame } from './sim/newGame';
import { offlineCatchUp } from './sim/offline/offline';
import { App } from './ui/App';
import './ui/styles.css';

const AUTOSAVE_MS = 30_000;

function boot(): GameRunner {
  const saved = loadGame();
  if (!saved) return new GameRunner(newGame());
  const runner = new GameRunner(saved.state);
  const away = (Date.now() - saved.savedAt) / 1000;
  if (away > 1) offlineCatchUp(runner.state, away);
  return runner;
}

const runner = boot();

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
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    backgroundColor: '#15171b',
    scale: { mode: Phaser.Scale.RESIZE, width: container.clientWidth, height: container.clientHeight },
    render: { antialias: true, roundPixels: false },
    disableContextMenu: true,
    scene: [new WorldScene(runner)],
  });
});

render(h(App, { runner }), document.getElementById('ui')!);

setInterval(() => saveGame(runner.state), AUTOSAVE_MS);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveGame(runner.state);
});
window.addEventListener('beforeunload', () => saveGame(runner.state));

// Handy for debugging in the console.
(window as unknown as { game: GameRunner }).game = runner;
