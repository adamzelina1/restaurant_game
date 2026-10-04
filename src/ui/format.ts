export function formatDuration(sec: number): string {
  sec = Math.max(0, Math.ceil(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  if (m > 0) return `${m}:${String(s).padStart(2, '0')}`;
  return `${s}s`;
}

/** Coarse duration for recipe tables: "3 min", "1 h", "12 h". */
export function formatSpan(sec: number): string {
  if (sec < 60) return `${Math.round(sec)} s`;
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  const h = sec / 3600;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}

export function formatMoney(n: number): string {
  return `$${Math.floor(n).toLocaleString('en-US')}`;
}

/** Play time as "Day N, hh:mm". */
export function formatClock(time: number): string {
  const day = Math.floor(time / 86400) + 1;
  const t = time % 86400;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return `Day ${day}, ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function pct(q: number): string {
  return `${Math.round(q * 100)}%`;
}

export function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
