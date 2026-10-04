import { useState } from 'preact/hooks';
import type { GameRunner } from '../game/runner';
import { clearSaves, exportSave, importSave, saveGame } from '../save/save';
import { newGame } from '../sim/newGame';
import { ui } from './store';

export function Menu({ runner }: { runner: GameRunner }) {
  const [mode, setMode] = useState<'main' | 'export' | 'import'>('main');
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  if (!ui.state.menuOpen) return null;
  const close = () => {
    ui.set({ menuOpen: false });
    setMode('main');
    setNote('');
  };

  return (
    <div class="modal-backdrop" onClick={close}>
      <div class="modal panel narrow" onClick={(e) => e.stopPropagation()}>
        <div class="modal-head">
          <h2>Menu</h2>
          <button class="btn small" onClick={close}>
            ✕
          </button>
        </div>
        {mode === 'main' && (
          <div class="menu-buttons">
            <button class="btn" onClick={() => setNote(saveGame(runner.state) ? 'Saved.' : 'Could not save.')}>
              Save now
            </button>
            <button
              class="btn"
              onClick={() => {
                setText(exportSave(runner.state));
                setMode('export');
              }}
            >
              Export save
            </button>
            <button
              class="btn"
              onClick={() => {
                setText('');
                setMode('import');
              }}
            >
              Import save
            </button>
            <button
              class="btn danger"
              onClick={() => {
                if (!confirm('Start a new restaurant? Your current save will be erased.')) return;
                clearSaves();
                runner.replaceState(newGame(Date.now() >>> 0));
                ui.set({ selected: null, picker: null });
                close();
              }}
            >
              New game
            </button>
            {note && <p class="muted">{note}</p>}
            <p class="hint">The game autosaves every 30 seconds and when you leave the tab.</p>
          </div>
        )}
        {mode === 'export' && (
          <div>
            <p class="muted">Copy this string somewhere safe:</p>
            <textarea class="savebox" readOnly value={text} onFocus={(e) => (e.target as HTMLTextAreaElement).select()} />
            <button class="btn" onClick={() => navigator.clipboard?.writeText(text).then(() => setNote('Copied.'))}>
              Copy
            </button>{' '}
            <button class="btn" onClick={() => setMode('main')}>
              Back
            </button>
            {note && <span class="muted"> {note}</span>}
          </div>
        )}
        {mode === 'import' && (
          <div>
            <p class="muted">Paste a save string:</p>
            <textarea class="savebox" value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
            <button
              class="btn primary"
              onClick={() => {
                try {
                  const f = importSave(text);
                  runner.replaceState(f.state);
                  saveGame(f.state);
                  ui.set({ selected: null, picker: null });
                  close();
                } catch (err) {
                  setNote(`Import failed: ${(err as Error).message}`);
                }
              }}
            >
              Load
            </button>{' '}
            <button class="btn" onClick={() => setMode('main')}>
              Back
            </button>
            {note && <p class="warn">{note}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
