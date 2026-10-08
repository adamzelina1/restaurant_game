/**
 * Tiny WebAudio synth: every sound is generated, nothing is downloaded.
 * The AudioContext starts on the first user gesture (browser autoplay rules).
 */

export type Sound = 'click' | 'ding' | 'cash' | 'levelUp' | 'fanfare' | 'stock' | 'bad';

const MUTE_KEY = 'restaurant.muted';
/** Same sound no more often than this (ms), so 64× speed doesn't turn into noise. */
const MIN_GAP: Record<Sound, number> = { click: 30, ding: 250, cash: 120, levelUp: 400, fanfare: 800, stock: 200, bad: 400 };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readMuted();
const lastPlayed: Partial<Record<Sound, number>> = {};
const listeners = new Set<() => void>();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  } catch {
    // Storage blocked: the setting just won't persist.
  }
  for (const fn of listeners) fn();
}

export function onMuteChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function audio(): AudioContext | null {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** One enveloped oscillator note. */
function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.5, slideTo?: number): void {
  const a = ctx!;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(master!);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

/** A short burst of filtered noise (the register drawer). */
function noise(start: number, dur: number, vol: number, freq: number): void {
  const a = ctx!;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  // Audio noise only, never game randomness.
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master!);
  src.start(start);
}

export function play(sound: Sound): void {
  if (muted) return;
  const nowMs = performance.now();
  if (nowMs - (lastPlayed[sound] ?? -Infinity) < MIN_GAP[sound]) return;
  lastPlayed[sound] = nowMs;
  const a = audio();
  if (!a || a.state !== 'running') return;
  const t = a.currentTime + 0.01;
  switch (sound) {
    case 'click':
      tone(900, t, 0.04, 'triangle', 0.15);
      break;
    case 'ding':
      // Kitchen bell: two bright partials with a long tail.
      tone(1568, t, 0.9, 'sine', 0.35);
      tone(2350, t, 0.6, 'sine', 0.12);
      tone(1568, t + 0.16, 0.9, 'sine', 0.25);
      break;
    case 'cash':
      noise(t, 0.08, 0.25, 3000);
      tone(2093, t + 0.05, 0.25, 'square', 0.06);
      tone(2637, t + 0.12, 0.35, 'square', 0.06);
      break;
    case 'stock':
      tone(660, t, 0.08, 'triangle', 0.2);
      tone(880, t + 0.06, 0.12, 'triangle', 0.2);
      break;
    case 'levelUp':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.07, 0.22, 'triangle', 0.22));
      break;
    case 'fanfare':
      [523, 659, 784].forEach((f, i) => tone(f, t + i * 0.1, 0.18, 'square', 0.08));
      tone(1047, t + 0.3, 0.6, 'square', 0.1);
      tone(1319, t + 0.3, 0.6, 'triangle', 0.12);
      break;
    case 'bad':
      tone(330, t, 0.25, 'sawtooth', 0.08, 220);
      break;
  }
}

/** Click sounds for every button, and unlock audio on the first gesture. */
export function installUiSounds(): void {
  document.addEventListener(
    'pointerdown',
    (e) => {
      audio();
      const btn = e.target instanceof Element ? e.target.closest('button, .pal-item') : null;
      if (btn && !(btn as HTMLButtonElement).disabled) play('click');
    },
    true,
  );
}
