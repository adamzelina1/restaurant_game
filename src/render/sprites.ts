import type Phaser from 'phaser';

/**
 * Procedural placeholder art, keyed by the `sprite` field in the station data.
 * If a texture with the same key is ever loaded (an asset pack), WorldScene
 * draws that image instead, so swapping art is a data change.
 */

type G = Phaser.GameObjects.Graphics;

/** Where to draw: pixel box of the footprint, plus which way the front (work side) faces. */
export interface SpriteBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Unit vector toward the work tile (0,1 = south). */
  fx: number;
  fy: number;
  color: number;
}

export type SpriteFn = (g: G, b: SpriteBox) => void;

// --- colour helpers ---------------------------------------------------------

export function shade(color: number, f: number): number {
  const r = (color >> 16) & 255;
  const gg = (color >> 8) & 255;
  const b = color & 255;
  const m = (c: number) => Math.max(0, Math.min(255, Math.round(f >= 0 ? c + (255 - c) * f : c * (1 + f))));
  return (m(r) << 16) | (m(gg) << 8) | m(b);
}

// --- geometry helpers -------------------------------------------------------

const INSET = 2;

/** The rectangle `depth` px deep along the front edge, inside the body. */
function frontStrip(b: SpriteBox, depth: number): { x: number; y: number; w: number; h: number } {
  const x0 = b.x + INSET;
  const y0 = b.y + INSET;
  const w = b.w - 2 * INSET;
  const h = b.h - 2 * INSET;
  if (b.fy > 0) return { x: x0, y: y0 + h - depth, w, h: depth };
  if (b.fy < 0) return { x: x0, y: y0, w, h: depth };
  if (b.fx > 0) return { x: x0 + w - depth, y: y0, w: depth, h };
  return { x: x0, y: y0, w: depth, h };
}

/** A point on the front edge, `t` (0–1) along it, `inset` px inside. */
function frontPoint(b: SpriteBox, t: number, inset: number): { x: number; y: number } {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  if (b.fy !== 0) return { x: b.x + INSET + (b.w - 2 * INSET) * t, y: cy + b.fy * (b.h / 2 - INSET - inset) };
  return { x: cx + b.fx * (b.w / 2 - INSET - inset), y: b.y + INSET + (b.h - 2 * INSET) * t };
}

/** Drop shadow + rounded body with a lighter top bevel. Returns the inner box. */
function body(g: G, b: SpriteBox, color: number, radius = 5): void {
  const { x, y, w, h } = b;
  g.fillStyle(0x000000, 0.3);
  g.fillRoundedRect(x + INSET + 1, y + INSET + 3, w - 2 * INSET, h - 2 * INSET, radius);
  g.fillStyle(shade(color, -0.25), 1);
  g.fillRoundedRect(x + INSET, y + INSET, w - 2 * INSET, h - 2 * INSET, radius);
  g.fillStyle(color, 1);
  g.fillRoundedRect(x + INSET, y + INSET, w - 2 * INSET, h - 2 * INSET - 2, radius);
  g.fillStyle(0xffffff, 0.12);
  g.fillRoundedRect(x + INSET + 2, y + INSET + 1, w - 2 * INSET - 4, 3, 2);
}

function cx(b: SpriteBox): number {
  return b.x + b.w / 2;
}
function cy(b: SpriteBox): number {
  return b.y + b.h / 2;
}

// --- sprites ----------------------------------------------------------------

const fridge: SpriteFn = (g, b) => {
  body(g, b, 0xdfe9f0, 4);
  // Two doors split down the middle, handles on the front.
  g.lineStyle(1, 0x9fb3c2, 1);
  if (b.fy !== 0) g.lineBetween(cx(b), b.y + 4, cx(b), b.y + b.h - 5);
  else g.lineBetween(b.x + 4, cy(b), b.x + b.w - 4, cy(b));
  g.fillStyle(0x7d8f9c, 1);
  for (const t of [0.4, 0.6]) {
    const p = frontPoint(b, t, 3);
    g.fillCircle(p.x, p.y, 1.5);
  }
  g.fillStyle(0x6fa8dc, 0.9);
  g.fillRect(b.x + 6, b.y + 6, 4, 2);
};

const counterTop = (g: G, b: SpriteBox) => body(g, b, 0x9e9e9e, 3);

const cuttingBoard: SpriteFn = (g, b) => {
  counterTop(g, b);
  g.fillStyle(0xd9a86c, 1);
  g.fillRoundedRect(b.x + 6, b.y + 7, b.w - 12, b.h - 14, 3);
  g.lineStyle(1, 0xb8864b, 0.8);
  g.lineBetween(b.x + 9, b.y + 11, b.x + b.w - 9, b.y + 11);
  g.lineBetween(b.x + 9, b.y + b.h - 11, b.x + b.w - 9, b.y + b.h - 11);
  // Knife.
  g.fillStyle(0xeeeeee, 1);
  g.fillRect(b.x + b.w - 11, b.y + 9, 2, 9);
  g.fillStyle(0x3d2b1f, 1);
  g.fillRect(b.x + b.w - 11, b.y + 18, 2, 5);
};

const mixingBench: SpriteFn = (g, b) => {
  counterTop(g, b);
  g.fillStyle(0xf3e9d2, 1);
  g.fillRoundedRect(b.x + 5, b.y + 6, b.w - 10, b.h - 12, 3);
  g.fillStyle(0xb7b7b7, 1);
  g.fillCircle(cx(b) - 1, cy(b), 7);
  g.fillStyle(0xfff2cc, 1);
  g.fillCircle(cx(b) - 1, cy(b), 5);
  g.lineStyle(1.5, 0x999999, 1);
  g.lineBetween(cx(b) + 2, cy(b) - 2, cx(b) + 9, cy(b) - 9);
};

const steel = 0x8a8f96;

const stove: SpriteFn = (g, b) => {
  body(g, b, steel, 3);
  g.fillStyle(0x2b2e33, 1);
  g.fillRoundedRect(b.x + 5, b.y + 5, b.w - 10, b.h - 12, 2);
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const x = cx(b) + dx * 5.5;
    const y = cy(b) - 1 + dy * 4.5;
    g.lineStyle(1.5, 0x666b73, 1);
    g.strokeCircle(x, y, 3.2);
  }
  g.fillStyle(0xdddddd, 1);
  for (const t of [0.3, 0.5, 0.7]) {
    const p = frontPoint(b, t, 2);
    g.fillCircle(p.x, p.y, 1.3);
  }
};

const grill: SpriteFn = (g, b) => {
  body(g, b, 0x4a4f57, 3);
  g.fillStyle(0x1b1d21, 1);
  g.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 12);
  g.lineStyle(1.5, 0x7a7f87, 1);
  for (let i = 0; i < 5; i++) {
    const x = b.x + 7 + i * ((b.w - 14) / 4);
    g.lineBetween(x, b.y + 6, x, b.y + b.h - 8);
  }
};

const fryer: SpriteFn = (g, b) => {
  body(g, b, steel, 3);
  g.fillStyle(0xc9a227, 1);
  g.fillRect(b.x + 5, b.y + 6, b.w / 2 - 6, b.h - 14);
  g.fillRect(cx(b) + 1, b.y + 6, b.w / 2 - 6, b.h - 14);
  g.lineStyle(1, 0x444444, 0.8);
  g.strokeRect(b.x + 5, b.y + 6, b.w / 2 - 6, b.h - 14);
  g.strokeRect(cx(b) + 1, b.y + 6, b.w / 2 - 6, b.h - 14);
};

const oven: SpriteFn = (g, b) => {
  body(g, b, 0x6b6f76, 3);
  g.fillStyle(0x3a3d42, 1);
  g.fillRoundedRect(b.x + 5, b.y + 5, b.w - 10, b.h - 12, 2);
  // Door window on the front.
  const s = frontStrip(b, 11);
  g.fillStyle(0x221a14, 1);
  g.fillRoundedRect(s.x + 4, s.y + 2, s.w - 8, s.h - 4, 2);
  g.fillStyle(0xe69138, 0.35);
  g.fillRoundedRect(s.x + 5, s.y + 3, s.w - 10, s.h - 6, 2);
};

const stockPot: SpriteFn = (g, b) => {
  body(g, b, 0x5b5f66, 3);
  g.fillStyle(0x2b2e33, 1);
  g.fillCircle(cx(b), cy(b) - 1, 11);
  g.fillStyle(0xa8adb4, 1);
  g.fillCircle(cx(b), cy(b) - 1, 9.5);
  g.fillStyle(0x6b4f2a, 1);
  g.fillCircle(cx(b), cy(b) - 1, 7.5);
  g.fillStyle(0x8a6a3a, 1);
  g.fillCircle(cx(b) - 2, cy(b) - 3, 2.5);
};

const servingCounter: SpriteFn = (g, b) => {
  body(g, b, 0xe8e4dc, 3);
  g.lineStyle(1, 0xc9c2b4, 1);
  g.strokeRoundedRect(b.x + 5, b.y + 5, b.w - 10, b.h - 12, 2);
};

const idleSpot: SpriteFn = (g, b) => {
  g.lineStyle(1, 0x6aa84f, 0.6);
  const x0 = b.x + 6;
  const y0 = b.y + 6;
  const s = b.w - 12;
  // Dashed square.
  for (let i = 0; i < s; i += 5) {
    const l = Math.min(3, s - i);
    g.lineBetween(x0 + i, y0, x0 + i + l, y0);
    g.lineBetween(x0 + i, y0 + s, x0 + i + l, y0 + s);
    g.lineBetween(x0, y0 + i, x0, y0 + i + l);
    g.lineBetween(x0 + s, y0 + i, x0 + s, y0 + i + l);
  }
};

const table: SpriteFn = (g, b) => {
  const { x, y, w, h } = b;
  g.fillStyle(0x000000, 0.28);
  g.fillRoundedRect(x + 4, y + 7, w - 6, h - 8, 6);
  g.fillStyle(0x8a6239, 1);
  g.fillRoundedRect(x + 3, y + 3, w - 6, h - 6, 6);
  g.fillStyle(0xa8794a, 1);
  g.fillRoundedRect(x + 3, y + 3, w - 6, h - 8, 6);
  // Grain.
  g.lineStyle(1, 0x8a6239, 0.5);
  g.lineBetween(x + 8, y + h / 2 - 4, x + w - 10, y + h / 2 - 4);
  g.lineBetween(x + 12, y + h / 2 + 3, x + w - 7, y + h / 2 + 3);
};

/** Chair at a seat tile; `ax, ay` points toward the table. */
export function chair(g: G, x: number, y: number, ax: number, ay: number): void {
  const c = { x: x + 16, y: y + 16 };
  g.fillStyle(0x000000, 0.25);
  g.fillRoundedRect(c.x - 7, c.y - 5, 14, 14, 3);
  g.fillStyle(0x6d4c41, 1);
  g.fillRoundedRect(c.x - 7, c.y - 7, 14, 14, 3);
  // Backrest on the side away from the table.
  g.fillStyle(0x4e342e, 1);
  if (ax !== 0) g.fillRoundedRect(c.x - ax * 7 - 2, c.y - 7, 4, 14, 2);
  else g.fillRoundedRect(c.x - 7, c.y - ay * 7 - 2, 14, 4, 2);
}

const hostStand: SpriteFn = (g, b) => {
  body(g, b, 0x5d4037, 4);
  g.fillStyle(0xf3e9d2, 1);
  g.fillRect(cx(b) - 7, cy(b) - 6, 14, 10);
  g.lineStyle(1, 0xb0a48a, 1);
  g.lineBetween(cx(b), cy(b) - 6, cx(b), cy(b) + 4);
  g.fillStyle(0xcc0000, 1);
  g.fillRect(cx(b) + 3, cy(b) - 7, 2, 6);
};

const pass: SpriteFn = (g, b) => {
  body(g, b, 0xc0c4c8, 3);
  g.fillStyle(0xe8eaec, 1);
  g.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 10);
  // Heat lamps.
  g.fillStyle(0xffd966, 0.25);
  g.fillCircle(cx(b) - 7, cy(b) - 1, 6);
  g.fillCircle(cx(b) + 7, cy(b) - 1, 6);
};

const dishPit: SpriteFn = (g, b) => {
  body(g, b, steel, 3);
  g.fillStyle(0x4f6f78, 1);
  g.fillRoundedRect(b.x + 5, b.y + 5, b.w - 10, b.h - 12, 3);
  g.fillStyle(0x76a5af, 0.8);
  g.fillRoundedRect(b.x + 7, b.y + 7, b.w - 14, b.h - 16, 2);
  // Faucet at the back.
  const back = frontPoint(b, 0.5, b.fy !== 0 ? b.h - 8 : b.w - 8);
  g.fillStyle(0xd0d0d0, 1);
  g.fillCircle(back.x, back.y, 2);
};

const entrance: SpriteFn = (g, b) => {
  g.fillStyle(0x7a3e2b, 1);
  g.fillRoundedRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6, 3);
  g.lineStyle(1, 0xb0563c, 1);
  for (let i = 0; i < 4; i++) g.lineBetween(b.x + 6, b.y + 8 + i * 5, b.x + b.w - 6, b.y + 8 + i * 5);
  g.lineStyle(1.5, 0xffd966, 0.9);
  g.strokeRoundedRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4, 3);
};

const plant: SpriteFn = (g, b) => {
  const x = cx(b);
  const y = cy(b);
  g.fillStyle(0x000000, 0.25);
  g.fillEllipse(x + 1, y + 10, 20, 7);
  g.fillStyle(0x8d5a3b, 1);
  g.fillCircle(x, y + 3, 8);
  g.fillStyle(0x5c3a26, 1);
  g.fillCircle(x, y + 3, 6);
  const leaf = [
    [0, -6, 7],
    [-6, -1, 6],
    [6, -1, 6],
    [-3, 4, 5],
    [4, 4, 5],
  ];
  for (const [dx, dy, r] of leaf) {
    g.fillStyle(0x2f6b1a, 1);
    g.fillCircle(x + dx, y + dy, r);
  }
  for (const [dx, dy, r] of leaf) {
    g.fillStyle(0x4f9a30, 1);
    g.fillCircle(x + dx - 1, y + dy - 1, r * 0.6);
  }
};

/** Fallback: a coloured block (used for unknown sprite keys). */
export const blockSprite: SpriteFn = (g, b) => body(g, b, b.color);

export const SPRITES: Record<string, SpriteFn> = {
  fridge,
  cuttingBoard,
  mixingBench,
  stove,
  grill,
  fryer,
  oven,
  stockPot,
  counter: servingCounter,
  idleSpot,
  table,
  hostStand,
  pass,
  dishPit,
  entrance,
  plant,
};

export function sprite(key: string): SpriteFn {
  return SPRITES[key] ?? blockSprite;
}
