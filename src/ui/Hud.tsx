import type { GameRunner } from '../game/runner';
import { HEAT_MAX } from '../sim/constants';
import { stockByRecipe } from '../sim/counters/counters';
import { isOpen } from '../sim/economy/wages';
import { stars } from '../sim/reputation/reputation';
import { recipe } from '../data/recipes';
import { formatClock, formatMoney, hex } from './format';
import { enterBuild, exitBuild } from './buildActions';
import { ui, type Overlay } from './store';

const OVERLAYS: { id: Overlay; label: string; title: string }[] = [
  { id: 'traffic', label: 'Traffic', title: 'Walking heatmap: where staff walk most' },
  { id: 'blocking', label: 'Jams', title: 'Blocking heatmap: where staff waited for each other' },
];

const DEV_SPEEDS = [1, 4, 16, 64];

export function Hud({ runner }: { runner: GameRunner }) {
  const s = runner.state;
  const stock = stockByRecipe(s);
  const dishes = Object.entries(stock).filter(([, n]) => n > 0);
  const open = isOpen(s);
  return (
    <div class="hud panel">
      <div class="hud-money">{formatMoney(s.money)}</div>
      <div class="hud-clock">{formatClock(s.time)}</div>
      <button class="btn" disabled={ui.state.build.active} onClick={() => runner.setPaused(!runner.paused)} title="Pause (Space)">
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
      <div class="hud-rep" title={`Reputation ${s.reputation.toFixed(2)} stars: more guests, better applicants`}>
        <span class="stars">{'★'.repeat(stars(s))}</span>
        <span class="stars dim">{'★'.repeat(5 - stars(s))}</span> {s.reputation.toFixed(1)}
      </div>
      <div class="hud-guests" title="Guests inside">
        🧑 {Object.keys(s.customers).length}
      </div>
      <button
        class={`btn small hud-plates ${s.plates.clean === 0 ? 'warn' : ''}`}
        title="Clean plates on the rack / plates owned. Click to show the dish pit."
        onClick={() => {
          const pit = Object.values(s.objects).find((o) => o.dishPit);
          if (pit) ui.set({ selected: { kind: 'object', id: pit.id } });
        }}
      >
        🍽 {s.plates.clean}/{s.plates.total}
      </button>
      <div class="hud-stock">
        {dishes.map(([id, n]) => (
          <span class="chip" title={recipe(id).name}>
            <span class="dot" style={{ background: hex(recipe(id).color) }} />
            {recipe(id).name} <b>{n}</b>
          </span>
        ))}
      </div>
      <div class="hud-spacer" />
      <div class="hud-overlays">
        {OVERLAYS.map((o) => (
          <button
            class={`btn small ${ui.state.overlay === o.id ? 'active' : ''}`}
            title={o.title}
            onClick={() => ui.set({ overlay: ui.state.overlay === o.id ? 'none' : o.id })}
          >
            {o.label}
          </button>
        ))}
        {ui.state.overlay !== 'none' && (
          <button class="btn small" title="Clear heatmap data" onClick={() => runner.send({ type: 'resetHeatmaps' })}>
            ↺
          </button>
        )}
      </div>
      <button
        class={`btn ${ui.state.build.active ? 'active' : ''}`}
        onClick={() => (ui.state.build.active ? exitBuild(runner) : enterBuild(runner))}
        title="Build mode (B)"
      >
        🔨 Build
      </button>
      <button class="btn" onClick={() => ui.set({ modal: 'staff' })} title="Staff and work priorities">
        👥 Staff ({Object.keys(s.employees).length})
      </button>
      <button class="btn" onClick={() => ui.set({ modal: 'hiring' })}>
        Hire
      </button>
      <div class="hud-sold" title="Servings sold">
        Sold {s.stats.servingsSold}
      </div>
      <button class="btn" onClick={() => ui.set({ menuOpen: !ui.state.menuOpen })}>
        ☰
      </button>
    </div>
  );
}
