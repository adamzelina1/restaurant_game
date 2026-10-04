import { TRAITS } from '../data/traits';
import { PRESETS, WORK_TYPE_DEFS } from '../data/workTypes';
import type { GameRunner } from '../game/runner';
import { payrollPerHour } from '../sim/economy/wages';
import { refuses } from '../sim/staff/traits';
import { WORK_TYPES, type Employee, type Priority, type WorkType } from '../sim/state';
import { describeEmployee } from './describe';
import { formatMoney, hex } from './format';
import { ui } from './store';

/** Click cycles 1 → 2 → 3 → 4 → off → 1. */
function nextPriority(p: Priority): Priority {
  return (p === 0 ? 1 : p === 4 ? 0 : p + 1) as Priority;
}

/** Best skill shown in a grid cell for this work type. */
function cellSkill(e: Employee, w: WorkType): { level: number; passion: number } | null {
  const skills = WORK_TYPE_DEFS[w].skills;
  if (skills.length === 0) return null;
  let best = e.skills[skills[0]];
  for (const s of skills) if (e.skills[s].level > best.level) best = e.skills[s];
  return best;
}

export function StaffPanel({ runner }: { runner: GameRunner }) {
  if (ui.state.modal !== 'staff') return null;
  const s = runner.state;
  const staff = Object.values(s.employees);
  const close = () => ui.set({ modal: null });
  // Column header click sets the whole column to the next value after the first row's.
  const setColumn = (w: WorkType) => {
    const first = staff[0]?.priorities[w] ?? 0;
    runner.send({ type: 'setColumn', workType: w, priority: nextPriority(first) });
  };

  return (
    <div class="modal-backdrop" onClick={close}>
      <div class="modal panel" onClick={(e) => e.stopPropagation()}>
        <div class="modal-head">
          <h2>Staff &amp; work priorities</h2>
          <span class="muted">
            Payroll {formatMoney(payrollPerHour(s))}/h (only while open)
          </span>
          <button class="btn small" onClick={close}>
            ✕
          </button>
        </div>
        <table class="grid">
          <thead>
            <tr>
              <th>Employee</th>
              {WORK_TYPES.map((w) => (
                <th class="clickable" title={`${WORK_TYPE_DEFS[w].description}. Click to set the whole column.`} onClick={() => setColumn(w)}>
                  {WORK_TYPE_DEFS[w].label}
                </th>
              ))}
              <th>Preset</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {staff.map((e) => (
              <tr>
                <td class="who">
                  <span class="dot" style={{ background: hex(e.color) }} />
                  <a
                    onClick={() => ui.set({ selected: { kind: 'employee', id: e.id }, modal: null })}
                    title={describeEmployee(s, e)}
                  >
                    {e.name}
                  </a>
                  <div class="muted small">
                    {formatMoney(e.wage)}/h
                    {e.traits.map((t) => (
                      <span class="trait" title={TRAITS[t]?.description}>
                        {TRAITS[t]?.name}
                      </span>
                    ))}
                  </div>
                </td>
                {WORK_TYPES.map((w) => {
                  const p = e.priorities[w];
                  const locked = refuses(e, w);
                  const sk = cellSkill(e, w);
                  return (
                    <td
                      class={`cell p${p} ${locked ? 'locked' : ''}`}
                      title={locked ? 'Refuses this work' : 'Click: 1 → 4 → off'}
                      onClick={() =>
                        !locked && runner.send({ type: 'setPriority', employeeId: e.id, workType: w, priority: nextPriority(p) })
                      }
                    >
                      <div class="prio-val">{locked ? '✕' : p || '–'}</div>
                      {sk && (
                        <div class="cell-skill">
                          {sk.level}
                          {'🔥'.repeat(sk.passion)}
                        </div>
                      )}
                    </td>
                  );
                })}
                <td>
                  <select
                    class="preset"
                    value=""
                    onChange={(ev) => {
                      const id = (ev.target as HTMLSelectElement).value;
                      if (id) runner.send({ type: 'applyPreset', employeeId: e.id, presetId: id });
                    }}
                  >
                    <option value="">Apply…</option>
                    {PRESETS.map((p) => (
                      <option value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <button
                    class="btn small danger"
                    onClick={() => confirm(`Let ${e.name} go?`) && runner.send({ type: 'fire', employeeId: e.id })}
                  >
                    Fire
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p class="hint">
          Staff look for work in their priority-1 jobs first, then 2, and so on; “–” is never done. Numbers show the
          relevant skill level, 🔥 is passion (faster learning, less tiring).
        </p>
        <button class="btn primary" onClick={() => ui.set({ modal: 'hiring' })}>
          Hiring board…
        </button>
      </div>
    </div>
  );
}
