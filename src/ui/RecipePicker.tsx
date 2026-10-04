import { RECIPE_LIST, totalCrates } from '../data/recipes';
import { stationDef } from '../data/stations';
import type { GameRunner } from '../game/runner';
import { batchCookTime, batchServings, canStartBatch } from '../sim/production/batches';
import { formatMoney, formatSpan, hex } from './format';
import { ui } from './store';

export function RecipePicker({ runner }: { runner: GameRunner }) {
  const s = runner.state;
  const id = ui.state.picker;
  const st = id ? s.objects[id] : null;
  if (!st || !st.cook || st.cook.batchId) return null;
  const def = stationDef(st.type);
  const recipes = RECIPE_LIST.filter((r) => r.station === st.type);
  const close = () => ui.set({ picker: null });

  return (
    <div class="modal-backdrop" onClick={close}>
      <div class="modal panel" onClick={(e) => e.stopPropagation()}>
        <div class="modal-head">
          <h2>{def.name}: pick a recipe</h2>
          <button class="btn small" onClick={close}>
            ✕
          </button>
        </div>
        <table class="recipes">
          <thead>
            <tr>
              <th>Recipe</th>
              <th>Cook</th>
              <th>Servings</th>
              <th>$/serving</th>
              <th>Cost</th>
              <th title="Revenue per hour of station time">$/hour</th>
              <th title="How long servings stay fresh on the counter">Fresh</th>
              <th title="One trip from the fridge per crate">Crates</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {recipes.map((r) => {
              const cook = batchCookTime(r.id, st);
              const servings = batchServings(r.id, st);
              const perHour = (servings * r.pricePerServing) / (cook / 3600);
              const err = canStartBatch(s, st.id, r.id);
              return (
                <tr class={err ? 'disabled' : ''}>
                  <td>
                    <span class="dot" style={{ background: hex(r.color) }} />
                    {r.name}
                    {r.cookMode === 'active' && <span class="tag" title="A cook must stand at the station">active</span>}
                  </td>
                  <td>{formatSpan(cook)}</td>
                  <td>{servings}</td>
                  <td>{formatMoney(r.pricePerServing)}</td>
                  <td>{formatMoney(r.batchCost)}</td>
                  <td>{formatMoney(perHour)}</td>
                  <td>{formatSpan(r.freshFor)}</td>
                  <td>{totalCrates(r)}</td>
                  <td>
                    <button
                      class="btn primary small"
                      disabled={!!err}
                      title={err ?? ''}
                      onClick={() => {
                        runner.send({ type: 'startBatch', stationId: st.id, recipeId: r.id });
                        close();
                      }}
                    >
                      Cook
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p class="hint">
          Ingredients are paid when the batch starts. Staff fetch one crate per trip, prep it, and load the station.
        </p>
      </div>
    </div>
  );
}
