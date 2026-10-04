import { TRAITS } from '../data/traits';
import { PRESET_BY_ID } from '../data/workTypes';
import type { GameRunner } from '../game/runner';
import { HIRING_REFRESH_COST } from '../sim/constants';
import { signingFee } from '../sim/staff/hiring';
import { SKILLS } from '../sim/state';
import { formatDuration, formatMoney, hex } from './format';
import { ui } from './store';

export function HiringPanel({ runner }: { runner: GameRunner }) {
  if (ui.state.modal !== 'hiring') return null;
  const s = runner.state;
  const close = () => ui.set({ modal: null });
  return (
    <div class="modal-backdrop" onClick={close}>
      <div class="modal panel" onClick={(e) => e.stopPropagation()}>
        <div class="modal-head">
          <h2>Hiring board</h2>
          <span class="muted">New applicants in {formatDuration(s.hiring.refreshAt - s.time)}</span>
          <button class="btn small" onClick={close}>
            ✕
          </button>
        </div>
        <div class="cards">
          {s.hiring.candidates.length === 0 && <p class="muted">No applicants right now.</p>}
          {s.hiring.candidates.map((c, i) => {
            const fee = signingFee(c);
            return (
              <div class="card">
                <div class="row">
                  <span class="dot big" style={{ background: hex(c.color) }} />
                  <b>{c.name}</b>
                </div>
                <div class="muted small">Will work as: {PRESET_BY_ID[c.presetId]?.name}</div>
                <table class="skills">
                  {SKILLS.map((k) => (
                    <tr>
                      <td>{k}</td>
                      <td class="flames">{'🔥'.repeat(c.skills[k].passion)}</td>
                      <td class="num">{c.skills[k].level}</td>
                    </tr>
                  ))}
                </table>
                <div class="traits">
                  {c.traits.length === 0 && <span class="muted small">No traits</span>}
                  {c.traits.map((t) => (
                    <span class="trait" title={TRAITS[t]?.description}>
                      {TRAITS[t]?.name}
                    </span>
                  ))}
                </div>
                <div class="muted small">
                  Walk speed {Math.round(c.walkSpeed * 100)}% · wants {formatMoney(c.wage)}/h
                </div>
                <button
                  class="btn primary"
                  disabled={s.money < fee}
                  onClick={() => runner.send({ type: 'hire', index: i })}
                  title="Signing fee"
                >
                  Hire ({formatMoney(fee)})
                </button>
              </div>
            );
          })}
        </div>
        <button class="btn" disabled={s.money < HIRING_REFRESH_COST} onClick={() => runner.send({ type: 'refreshCandidates' })}>
          New applicants now ({formatMoney(HIRING_REFRESH_COST)})
        </button>
        <p class="hint">Better reputation attracts better applicants.</p>
      </div>
    </div>
  );
}
