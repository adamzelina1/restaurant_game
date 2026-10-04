import { FLOOR_COSTS, PALETTE } from '../data/build';
import { RECIPE_LIST } from '../data/recipes';
import { stationDef } from '../data/stations';
import type { GameRunner } from '../game/runner';
import { chokepointWorkTiles, routePreview, validateLayout } from '../sim/build/analysis';
import type { FloorTool } from '../sim/build/build';
import { cancelBuildTool, exitBuild } from './buildActions';
import { formatDuration, formatMoney, hex } from './format';
import { ui } from './store';

const FLOOR_TOOLS: { id: FloorTool; label: string; color: string }[] = [
  { id: 'floor', label: 'Floor', color: '#6b5139' },
  { id: 'wall', label: 'Wall', color: '#1f2228' },
];

export function BuildPanel({ runner }: { runner: GameRunner }) {
  const b = ui.state.build;
  if (!b.active) return null;
  const s = runner.state;
  const cookStations = Object.values(s.objects).filter((o) => o.cook);
  const routeStation = b.routeStation ? s.objects[b.routeStation] : null;
  const recipesForStation = routeStation ? RECIPE_LIST.filter((r) => r.station === routeStation.type) : [];
  const route = routeStation && b.routeRecipe ? routePreview(s, routeStation.id, b.routeRecipe) : null;
  const chokes = chokepointWorkTiles(s);
  // Problems that blocked leaving update live as the player fixes them.
  const problems = b.problems.length ? validateLayout(s) : [];

  return (
    <div class="build panel">
      <div class="modal-head">
        <h3>🔨 Build mode</h3>
        <button class="btn primary small" onClick={() => exitBuild(runner)}>
          Done
        </button>
      </div>
      <p class="muted small">The game is paused while you build. Drag with the right mouse button to pan.</p>

      <div class="tools">
        <button class={`btn small ${b.tool === 'select' ? 'active' : ''}`} onClick={() => cancelBuildTool()} title="Click an object to pick it up, click again to drop it">
          ✥ Move
        </button>
        <button class={`btn small ${b.tool === 'sell' ? 'active' : ''}`} onClick={() => ui.setBuild({ tool: 'sell', moving: null, placeType: null })}>
          $ Sell
        </button>
      </div>
      {b.moving && <p class="small">Moving {stationDef(s.objects[b.moving]?.type ?? 'fridge').name}: click to drop, R to rotate, Esc to cancel.</p>}

      <h4>Floor</h4>
      <div class="tools">
        {FLOOR_TOOLS.map((f) => (
          <button
            class={`btn small ${b.tool === 'floor' && b.floorTool === f.id ? 'active' : ''}`}
            onClick={() => ui.setBuild({ tool: 'floor', floorTool: f.id, moving: null, placeType: null })}
          >
            <span class="swatch" style={{ background: f.color }} />
            {f.label}
          </button>
        ))}
      </div>
      <p class="muted small">
        Drag a rectangle. Floor {formatMoney(FLOOR_COSTS.buy)}/tile (also knocks down walls), walls{' '}
        {formatMoney(FLOOR_COSTS.wall)}. Kitchen and tables share the same room.
      </p>

      {PALETTE.map((group) => (
        <div>
          <h4>{group.name}</h4>
          <div class="palette">
            {group.items.map((type) => {
              const def = stationDef(type);
              const active = b.tool === 'place' && b.placeType === type;
              return (
                <button
                  class={`pal-item ${active ? 'active' : ''}`}
                  disabled={s.money < def.cost}
                  onClick={() => ui.setBuild({ tool: 'place', placeType: type, moving: null })}
                  title={def.name}
                >
                  <span class="swatch" style={{ background: hex(def.color) }} />
                  <span class="pal-name">{def.name}</span>
                  <span class="pal-cost">{def.cost ? formatMoney(def.cost) : 'free'}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <h4>Route preview</h4>
      <div class="row">
        <select
          class="preset"
          value={b.routeStation ?? ''}
          onChange={(e) => {
            const id = (e.target as HTMLSelectElement).value || null;
            const st = id ? s.objects[id] : null;
            const first = st ? RECIPE_LIST.find((r) => r.station === st.type)?.id ?? null : null;
            ui.setBuild({ routeStation: id, routeRecipe: first });
          }}
        >
          <option value="">Station…</option>
          {cookStations.map((o) => (
            <option value={o.id}>
              {stationDef(o.type).name} ({o.x},{o.y})
            </option>
          ))}
        </select>
        {routeStation && (
          <select class="preset" value={b.routeRecipe ?? ''} onChange={(e) => ui.setBuild({ routeRecipe: (e.target as HTMLSelectElement).value })}>
            {recipesForStation.map((r) => (
              <option value={r.id}>{r.name}</option>
            ))}
          </select>
        )}
      </div>
      {route && (route.error ? <p class="warn small">{route.error}</p> : <p class="small">
            One cook walks ~{Math.round(route.tiles)} tiles per batch ≈ {formatDuration(route.seconds)} of walking.
          </p>)}

      {chokes.length > 0 && (
        <p class="warn small">
          ⚠ {chokes.length} work tile{chokes.length > 1 ? 's sit' : ' sits'} on the only path between two areas (red). Anyone working
          there blocks the way.
        </p>
      )}
      {problems.length > 0 && (
        <div class="problems">
          <p class="warn">Fix these before leaving build mode:</p>
          <ul class="crates">
            {problems.slice(0, 8).map((p) => (
              <li class="warn small">✕ {p.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
