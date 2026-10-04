import { RECIPE_LIST, recipe } from '../data/recipes';
import { stationDef } from '../data/stations';
import type { GameRunner } from '../game/runner';
import { MASTERY_TEXT, isUnlocked, masteryProgress, masteryStars, servingPrice, unlockError } from '../sim/progression/progression';
import type { GameState } from '../sim/state';
import { formatMoney, formatSpan, hex } from './format';
import { ui } from './store';

/** Mastery stars with progress toward the next one (PLAN §7.1). */
export function Mastery({ s, recipeId }: { s: GameState; recipeId: string }) {
  const st = masteryStars(s, recipeId);
  const prog = masteryProgress(s, recipeId);
  const tip = MASTERY_TEXT.map((t, i) => `${i < st ? '✓' : '·'} ★${i + 1}: ${t}`).join('\n');
  return (
    <span class="mastery" title={tip}>
      <span class="stars">{'★'.repeat(st)}</span>
      <span class="stars dim">{'★'.repeat(5 - st)}</span>
      {prog ? (
        <span class="muted small">
          {' '}
          {prog.done}/{prog.need}
        </span>
      ) : (
        <span class="tag">signature</span>
      )}
    </span>
  );
}

/** Unlock button for a locked recipe, with the reason it's disabled. */
export function UnlockButton({ runner, recipeId }: { runner: GameRunner; recipeId: string }) {
  const r = recipe(recipeId);
  const err = unlockError(runner.state, recipeId);
  return (
    <button
      class="btn primary small"
      disabled={!!err}
      title={err ?? `Learn ${r.name}`}
      onClick={() => runner.send({ type: 'unlockRecipe', recipeId })}
    >
      🔒 Unlock {formatMoney(r.unlock.cost)}
      {r.unlock.minStars > 1 && ` · ${r.unlock.minStars}★`}
    </button>
  );
}

export function RecipeBook({ runner }: { runner: GameRunner }) {
  if (ui.state.modal !== 'recipes') return null;
  const s = runner.state;
  const close = () => ui.set({ modal: null });
  return (
    <div class="modal-backdrop" onClick={close}>
      <div class="modal panel" onClick={(e) => e.stopPropagation()}>
        <div class="modal-head">
          <h2>Recipe book</h2>
          <button class="btn small" onClick={close}>
            ✕
          </button>
        </div>
        <table class="recipes">
          <thead>
            <tr>
              <th>Recipe</th>
              <th>Station</th>
              <th>Cook</th>
              <th>Servings</th>
              <th>$/serving</th>
              <th title="Revenue per hour of station time at tier 1">$/hour</th>
              <th title="How long servings stay fresh on the counter">Fresh</th>
              <th title="Every batch served to a counter fills the mastery bar">Mastery</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {RECIPE_LIST.map((r) => {
              const unlocked = isUnlocked(s, r.id);
              const price = servingPrice(s, r.id);
              return (
                <tr class={unlocked ? '' : 'disabled'}>
                  <td>
                    <span class="dot" style={{ background: hex(r.color) }} />
                    {r.name}
                    {r.cookMode === 'active' && <span class="tag" title="A cook must stand at the station">active</span>}
                  </td>
                  <td>{stationDef(r.station).name}</td>
                  <td>{formatSpan(r.cookTime)}</td>
                  <td>{r.servings}</td>
                  <td>{formatMoney(price)}</td>
                  <td>{formatMoney((r.servings * price) / (r.cookTime / 3600))}</td>
                  <td>{formatSpan(r.freshFor)}</td>
                  <td>{unlocked ? <Mastery s={s} recipeId={r.id} /> : <span class="muted">—</span>}</td>
                  <td>{unlocked ? <span class="muted">Known</span> : <UnlockButton runner={runner} recipeId={r.id} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <h4>Mastery bonuses (they stack)</h4>
        <ol class="mastery-list">
          {MASTERY_TEXT.map((t, i) => (
            <li>
              <span class="stars">{'★'.repeat(i + 1)}</span> {t}
            </li>
          ))}
        </ol>
        <p class="hint">
          Long recipes need fewer batches to master than short ones. Pricier recipes need a better reputation before you can learn
          them.
        </p>
      </div>
    </div>
  );
}
