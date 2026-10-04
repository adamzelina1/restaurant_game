import { INGREDIENTS } from '../data/ingredients';
import { recipe } from '../data/recipes';
import { stationDef } from '../data/stations';
import { WORK_TYPE_DEFS } from '../data/workTypes';
import type { GameRunner } from '../game/runner';
import { counterStock, lotQuality } from '../sim/counters/counters';
import { batchProgress, batchTimeLeft, readyBatchQuality } from '../sim/production/batches';
import { readyGrace } from '../sim/quality';
import { SKILLS, WORK_TYPES, type Activity, type Employee, type GameState, type PlacedObject } from '../sim/state';
import { speedUpTarget } from '../sim/stations/stations';
import { describeCrate, describeEmployee } from './describe';
import { formatDuration, hex, pct } from './format';
import { ui } from './store';

export function SelectionPanel({ runner }: { runner: GameRunner }) {
  const sel = ui.state.selected;
  const s = runner.state;
  if (!sel) return null;
  const close = () => ui.set({ selected: null });
  if (sel.kind === 'employee') {
    const e = s.employees[sel.id];
    return e ? <EmployeeView s={s} e={e} close={close} /> : null;
  }
  const o = s.objects[sel.id];
  return o ? <ObjectView runner={runner} o={o} close={close} /> : null;
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div class="meter">
      <div class="meter-fill" style={{ width: `${Math.round(100 * Math.min(1, value))}%`, background: color }} />
    </div>
  );
}

function ObjectView({ runner, o, close }: { runner: GameRunner; o: PlacedObject; close: () => void }) {
  const s = runner.state;
  const def = stationDef(o.type);
  return (
    <div class="side panel">
      <div class="modal-head">
        <h3>
          {def.name}
          {def.kind === 'cook' && <span class="muted"> · tier {o.tier}</span>}
        </h3>
        <button class="btn small" onClick={close}>
          ✕
        </button>
      </div>
      {def.kind === 'cook' && <CookView runner={runner} o={o} />}
      {def.kind === 'prep' && <PrepView runner={runner} o={o} />}
      {def.kind === 'counter' && <CounterView s={s} o={o} />}
      {def.kind === 'source' && <p class="muted">Unlimited ingredients. Staff fetch one crate per trip.</p>}
      {def.kind === 'idle' && <p class="muted">Idle staff wait here, out of the walkways.</p>}
    </div>
  );
}

function SpeedUpButton({ runner, id }: { runner: GameRunner; id: string }) {
  const t = speedUpTarget(runner.state, id);
  if (!t) return null;
  const capped = t.left <= 1e-9;
  return (
    <button
      class="btn"
      disabled={capped || runner.state.heat >= 100}
      onClick={() => runner.send({ type: 'speedUp', objectId: id })}
      title="Each click removes 1% of the time, up to 25% per batch"
    >
      {capped ? 'Speed-up maxed' : '⏩ Speed up'}
    </button>
  );
}

function CookView({ runner, o }: { runner: GameRunner; o: PlacedObject }) {
  const s = runner.state;
  const b = o.cook!.batchId ? s.batches[o.cook!.batchId] : null;
  if (!b) {
    return (
      <div>
        <p class="muted">Idle. Pick a recipe to start a batch.</p>
        <button class="btn primary" onClick={() => ui.set({ picker: o.id })}>
          Choose recipe
        </button>
      </div>
    );
  }
  const r = recipe(b.recipeId);
  return (
    <div>
      <div class="row">
        <span class="dot" style={{ background: hex(r.color) }} />
        <b>{r.name}</b>
        <span class="muted">· {b.servings} servings</span>
      </div>
      {b.phase === 'loading' && (
        <>
          <p>
            Loading ingredients: {b.cratesLoaded}/{b.crates.length} crates
          </p>
          <Bar value={batchProgress(b)} color="#6fa8dc" />
          <ul class="crates">
            {b.crates.map((cid) => {
              const c = s.crates[cid];
              if (!c) return null;
              return (
                <li>
                  <span class="dot" style={{ background: hex(INGREDIENTS[c.ingredient]?.color ?? 0xcccccc) }} />
                  {INGREDIENTS[c.ingredient]?.name}: <span class="muted">{describeCrate(s, c)}</span>
                </li>
              );
            })}
          </ul>
          <button class="btn danger" onClick={() => runner.send({ type: 'cancelBatch', stationId: o.id })}>
            Cancel (50% refund)
          </button>
        </>
      )}
      {b.phase === 'cooking' && (
        <>
          <p>
            Cooking: {formatDuration(batchTimeLeft(b))} left
            {r.cookMode === 'active' && <span class="muted"> (needs a cook at the station)</span>}
          </p>
          <Bar value={batchProgress(b)} color="#f6b26b" />
          <p class="muted">
            Clicked off: {formatDuration(b.clickRemoved)} / {formatDuration(b.clickCap)}
          </p>
          <SpeedUpButton runner={runner} id={o.id} />
        </>
      )}
      {b.phase === 'ready' && (
        <>
          <p>
            Ready! Quality {pct(readyBatchQuality(s, b))}
            {b.readyAt !== null && s.time - b.readyAt > readyGrace(b.cookTime) && <span class="warn"> (losing freshness)</span>}
          </p>
          {b.readyAt !== null && (
            <p class="muted">
              Waiting {formatDuration(s.time - b.readyAt)} · stays fresh for {formatDuration(readyGrace(b.cookTime))}
            </p>
          )}
          {b.serveRequested ? (
            <p class="muted">A hauler is carrying it to a counter…</p>
          ) : (
            <button class="btn primary" onClick={() => runner.send({ type: 'serveBatch', stationId: o.id })}>
              Serve to counter
            </button>
          )}
        </>
      )}
    </div>
  );
}

function PrepView({ runner, o }: { runner: GameRunner; o: PlacedObject }) {
  const s = runner.state;
  const c = o.prep!.crateId ? s.crates[o.prep!.crateId] : null;
  if (!c) return <p class="muted">{o.prep!.reservedBy ? 'A crate is on its way.' : 'Free.'}</p>;
  return (
    <div>
      <p>
        {INGREDIENTS[c.ingredient]?.name}: {describeCrate(s, c)}
      </p>
      {!c.prepped && <Bar value={(c.prepDone + c.clickRemoved) / c.prepTime} color="#93c47d" />}
      <SpeedUpButton runner={runner} id={o.id} />
    </div>
  );
}

function CounterView({ s, o }: { s: GameState; o: PlacedObject }) {
  const cs = o.counter!;
  if (!cs.recipeId) return <p class="muted">{cs.incoming.length ? 'A batch is on its way.' : 'Empty. Serve a batch to stock it.'}</p>;
  const r = recipe(cs.recipeId);
  return (
    <div>
      <div class="row">
        <span class="dot" style={{ background: hex(r.color) }} />
        <b>{r.name}</b>
        <span class="muted">· {counterStock(o)} servings</span>
      </div>
      <ul class="crates">
        {cs.lots.map((l) => (
          <li>
            {l.servings} × quality {pct(lotQuality(s, l))}
            <span class="muted">
              {' '}
              · {s.time - l.placedAt < l.freshFor ? `fresh for ${formatDuration(l.freshFor - (s.time - l.placedAt))}` : 'going stale'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ACTIVITY_COLORS: Record<Activity, string> = {
  working: '#93c47d',
  walking: '#6fa8dc',
  blocked: '#e06666',
  idle: '#999999',
  break: '#c27ba0',
};

function EmployeeView({ s, e, close }: { s: GameState; e: Employee; close: () => void }) {
  const total = Object.values(e.time).reduce((a, b) => a + b, 0) || 1;
  return (
    <div class="side panel">
      <div class="modal-head">
        <h3>
          <span class="dot big" style={{ background: hex(e.color) }} />
          {e.name}
        </h3>
        <button class="btn small" onClick={close}>
          ✕
        </button>
      </div>
      <p>{describeEmployee(s, e)}</p>
      <h4>Skills</h4>
      <table class="skills">
        {SKILLS.map((k) => (
          <tr>
            <td>{k}</td>
            <td class="flames">{'🔥'.repeat(e.skills[k].passion)}</td>
            <td class="num">{e.skills[k].level}</td>
            <td class="wide">
              <Bar value={e.skills[k].level / 20} color="#f6b26b" />
            </td>
          </tr>
        ))}
      </table>
      <h4>Work priorities</h4>
      <div class="prio-row">
        {WORK_TYPES.map((w) => (
          <span class="prio" title={WORK_TYPE_DEFS[w].description}>
            {WORK_TYPE_DEFS[w].label} <b>{e.priorities[w] || '–'}</b>
          </span>
        ))}
      </div>
      <h4>Time</h4>
      <div class="timebar">
        {(Object.keys(ACTIVITY_COLORS) as Activity[]).map((a) => (
          <div style={{ width: `${(100 * e.time[a]) / total}%`, background: ACTIVITY_COLORS[a] }} title={`${a}: ${formatDuration(e.time[a])}`} />
        ))}
      </div>
      <div class="legend">
        {(Object.keys(ACTIVITY_COLORS) as Activity[]).map((a) => (
          <span>
            <span class="dot" style={{ background: ACTIVITY_COLORS[a] }} />
            {a} {Math.round((100 * e.time[a]) / total)}%
          </span>
        ))}
      </div>
    </div>
  );
}
