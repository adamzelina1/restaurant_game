// The "come back" hook (PLAN §11): a tab-title badge and an optional browser
// notification when a batch is ready to serve.

import { recipe } from '../data/recipes';
import type { GameRunner } from '../game/runner';
import type { GameState } from '../sim/state';

const BASE_TITLE = 'Restaurant Manager';
const PREF_KEY = 'restaurant.notify';

function readyBatches(s: GameState) {
  return Object.values(s.batches).filter((b) => b.phase === 'ready' && !b.serveRequested);
}

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationsWanted(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === '1' && notificationsSupported() && Notification.permission === 'granted';
  } catch {
    return false;
  }
}

/** Turn notifications on (asking for permission) or off. Resolves to the new setting. */
export async function setNotifications(on: boolean): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (on && Notification.permission !== 'granted') {
    if ((await Notification.requestPermission()) !== 'granted') on = false;
  }
  try {
    localStorage.setItem(PREF_KEY, on ? '1' : '0');
  } catch {
    // Storage blocked: the setting just won't stick.
  }
  return on;
}

/** Keep the tab title and notifications in sync with ready batches. */
export function watchReady(runner: GameRunner): void {
  const announced = new Set<string>();
  let lastTitle = '';
  runner.subscribe(() => {
    const ready = readyBatches(runner.state);
    const title = ready.length ? `(${ready.length}) Food's ready! · ${BASE_TITLE}` : BASE_TITLE;
    if (title !== lastTitle) {
      document.title = title;
      lastTitle = title;
    }
    const ids = new Set(ready.map((b) => b.id));
    for (const id of announced) if (!ids.has(id)) announced.delete(id);
    const fresh = ready.filter((b) => !announced.has(b.id));
    if (fresh.length === 0) return;
    for (const b of fresh) announced.add(b.id);
    if (!document.hidden || !notificationsWanted()) return;
    const names = fresh.map((b) => recipe(b.recipeId).name).join(', ');
    try {
      new Notification(fresh.length > 1 ? 'Food is ready!' : `${names} is ready!`, {
        body: fresh.length > 1 ? `${names} are ready to serve.` : 'Come back and serve it to the counter.',
        tag: 'restaurant-ready',
      });
    } catch {
      // Some browsers only allow notifications from a service worker.
    }
  });
}
