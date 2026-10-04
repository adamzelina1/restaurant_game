import type { GameState } from '../sim/state';
import { migrate } from './migrations';

/** What we write to storage. `savedAt` (wall clock ms) drives offline catch-up. */
export interface SaveFile {
  version: number;
  savedAt: number;
  state: GameState;
}

const SLOTS = ['restaurant.save.0', 'restaurant.save.1'];
const LAST_SLOT_KEY = 'restaurant.save.last';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function serialize(state: GameState): string {
  const file: SaveFile = { version: state.version, savedAt: Date.now(), state };
  return JSON.stringify(file);
}

export function deserialize(json: string): SaveFile {
  const file = JSON.parse(json) as SaveFile;
  if (!file || typeof file !== 'object' || !file.state) throw new Error('Not a save file');
  file.state = migrate(file.state);
  file.version = file.state.version;
  return file;
}

/**
 * Write to the older of two rotating slots, so a failed or corrupted write
 * never destroys the previous save.
 */
export function saveGame(state: GameState): boolean {
  const ls = storage();
  if (!ls) return false;
  try {
    const last = Number(ls.getItem(LAST_SLOT_KEY) ?? '1');
    const next = (last + 1) % SLOTS.length;
    ls.setItem(SLOTS[next], serialize(state));
    ls.setItem(LAST_SLOT_KEY, String(next));
    return true;
  } catch {
    return false;
  }
}

/** Load the newest valid save, or null. */
export function loadGame(): SaveFile | null {
  const ls = storage();
  if (!ls) return null;
  let best: SaveFile | null = null;
  for (const key of SLOTS) {
    try {
      const raw = ls.getItem(key);
      if (!raw) continue;
      const f = deserialize(raw);
      if (!best || f.savedAt > best.savedAt) best = f;
    } catch {
      // Corrupted (or from a newer version): fall back to the other slot, but
      // keep a copy so autosave never destroys the only one.
      try {
        const raw = ls.getItem(key);
        if (raw && !ls.getItem(`${key}.broken`)) ls.setItem(`${key}.broken`, raw);
      } catch {
        // Out of space: nothing more we can do.
      }
    }
  }
  return best;
}

export function clearSaves(): void {
  const ls = storage();
  if (!ls) return;
  for (const k of [...SLOTS, LAST_SLOT_KEY]) ls.removeItem(k);
}

/** Base64 save string for export/import. */
export function exportSave(state: GameState): string {
  const bytes = new TextEncoder().encode(serialize(state));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function importSave(text: string): SaveFile {
  const bin = atob(text.trim());
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return deserialize(new TextDecoder().decode(bytes));
}
