import type { GameRunner } from '../game/runner';
import { HEAT_MAX } from '../sim/constants';
import { stockByRecipe } from '../sim/counters/counters';
import { recipe } from '../data/recipes';
import { formatClock, formatMoney, hex } from './format';
import { ui } from './store';

const DEV_SPEEDS = [1, 4, 16, 64];

export function Hud({ runner }: { runner: GameRunner }) {
  const s = runner.state;
  const stock = stockByRecipe(s);
  const dishes = Object.entries(stock).filter(([, n]) => n > 0);
  const open = dishes.length > 0;
  return (
    <div class="hud panel">
      <div class="hud-money">{formatMoney(s.money)}</div>
      <div class="hud-clock">{formatClock(s.time)}</div>
      <button class="btn" onClick={() => runner.setPaused(!runner.paused)} title="Pause (Space)">
        {runner.paused ? '▶ Play' : '⏸ Pause'}
      </button>
      {import.meta.env.DEV && (
        <div class="hud-speeds" title="Dev builds only">
          {DEV_SPEEDS.map((sp) => (
            <button class={`btn small ${runner.speed === sp ? 'active' : ''}`} onClick={() => runner.setSpeed(sp)}>
              {sp}×
            </button>
          ))}
        </div>
      )}
      <div class="hud-heat" title="Speed-up heat: each click adds heat; clicks do nothing at max">
        <span>Heat</span>
        <div class="meter">
          <div class="meter-fill heat" style={{ width: `${(100 * s.heat) / HEAT_MAX}%` }} />
        </div>
      </div>
      <div class={`hud-open ${open ? 'is-open' : ''}`}>{open ? 'OPEN' : 'CLOSED'}</div>
      <div class="hud-stock">
        {dishes.map(([id, n]) => (
          <span class="chip" title={recipe(id).name}>
            <span class="dot" style={{ background: hex(recipe(id).color) }} />
            {recipe(id).name} <b>{n}</b>
          </span>
        ))}
      </div>
      <div class="hud-spacer" />
      <div class="hud-sold" title="Servings sold">
        🍽 {s.stats.servingsSold}
      </div>
      <button class="btn" onClick={() => ui.set({ menuOpen: !ui.state.menuOpen })}>
        ☰
      </button>
    </div>
  );
}
