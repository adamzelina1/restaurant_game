import { recipe } from '../data/recipes';
import type { GameRunner } from '../game/runner';
import { formatMoney, formatSpan, hex } from './format';
import { ui } from './store';

/** "While you were away" (PLAN §9). */
export function WelcomeBack({ runner }: { runner: GameRunner }) {
  const r = ui.state.away;
  if (!r) return null;
  const close = () => ui.set({ away: null });
  const repDelta = r.reputation.after - r.reputation.before;
  return (
    <div class="modal-backdrop" onClick={close}>
      <div class="modal panel narrow welcome" onClick={(e) => e.stopPropagation()}>
        <div class="modal-head">
          <h2>While you were away</h2>
          <button class="btn small" onClick={close}>
            ✕
          </button>
        </div>
        <p class="muted">You were gone for {formatSpan(r.seconds)}.</p>
        <table class="report">
          <tr>
            <td>Guests served</td>
            <td class="num">{r.guests}</td>
          </tr>
          <tr>
            <td>Sales and tips</td>
            <td class="num good">+{formatMoney(r.income)}</td>
          </tr>
          <tr>
            <td>Wages</td>
            <td class="num">−{formatMoney(r.wages)}</td>
          </tr>
          <tr>
            <td>
              <b>Money</b>
            </td>
            <td class={`num ${r.money >= 0 ? 'good' : 'warn'}`}>
              <b>
                {r.money >= 0 ? '+' : '−'}
                {formatMoney(Math.abs(r.money))}
              </b>
            </td>
          </tr>
          <tr>
            <td>Reputation</td>
            <td class="num">
              {r.reputation.after.toFixed(1)}★{' '}
              <span class={repDelta >= 0 ? 'good' : 'warn'}>
                ({repDelta >= 0 ? '+' : ''}
                {repDelta.toFixed(2)})
              </span>
            </td>
          </tr>
        </table>
        {r.sold.length > 0 && (
          <>
            <h4>Sold</h4>
            <ul class="crates">
              {r.sold.map((x) => (
                <li>
                  <span class="dot" style={{ background: hex(recipe(x.recipeId).color) }} />
                  {recipe(x.recipeId).name}: {x.n}
                </li>
              ))}
            </ul>
          </>
        )}
        {r.ready.length > 0 && (
          <>
            <h4>Waiting to be served</h4>
            <p>
              {r.ready.join(', ')} <span class="muted">· click the station to send it to a counter</span>
            </p>
          </>
        )}
        {r.levelUps.length > 0 && (
          <>
            <h4>Level-ups</h4>
            <ul class="crates">
              {r.levelUps.map((l) => (
                <li>{l}</li>
              ))}
            </ul>
          </>
        )}
        {r.lost > 0 && <p class="warn">{r.lost} guests left unhappy.</p>}
        <button
          class="btn primary"
          onClick={() => {
            close();
            if (runner.paused) runner.setPaused(false);
          }}
        >
          Back to work
        </button>
      </div>
    </div>
  );
}
