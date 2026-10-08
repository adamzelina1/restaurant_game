import Phaser from 'phaser';
import { INGREDIENTS } from '../data/ingredients';
import { recipe } from '../data/recipes';
import { stationDef } from '../data/stations';
import type { GameRunner } from '../game/runner';
import { counterStock } from '../sim/counters/counters';
import { TICK_DT } from '../sim/constants';
import { footprint, objectAtTile, rotatedSize, seatTiles, workTile, workTiles } from '../sim/grid/grid';
import { batchProgress, batchTimeLeft } from '../sim/production/batches';
import { Floor, type GameState, type Mover, type PlacedObject } from '../sim/state';
import { patienceUsed } from '../sim/foh/customers';
import { clickObject } from '../ui/actions';
import { BuildController } from './BuildMode';
import { EventWatcher, type GameEvent } from './events';
import { chair, shade, sprite } from './sprites';
import { formatDuration, formatMoney } from '../ui/format';
import { ui } from '../ui/store';
import { play } from '../ui/sound';

export const TILE = 32;

const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xa86b3c];
const HAIR = [0x2b1d0e, 0x4a2c12, 0x8b5a2b, 0xd6b370, 0x1a1a1a, 0x9e4b25, 0x777777];
const PLANK_TONES = [0x6b5139, 0x674e36, 0x70553c, 0x654b33, 0x6e5238];

/** Stable per-id variation (skin, hair). */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return hash2(h, s.length);
}

/** Cheap stable hash for per-tile variation (render only, not game randomness). */
function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

const TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: '10px',
  color: '#ffffff',
  resolution: 3,
};

interface FloatText {
  text: Phaser.GameObjects.Text;
  born: number;
  /** Seconds on screen. */
  life: number;
  y0: number;
  /** Pixels risen over its life. */
  rise: number;
}

/** An expanding ring (a batch just finished, a station was upgraded). */
interface Burst {
  x: number;
  y: number;
  born: number;
  color: number;
}

/** Popups on screen at once; older ones are dropped first at high game speeds. */
const MAX_FLOATS = 40;

export class WorldScene extends Phaser.Scene {
  private runner: GameRunner;
  private floorG!: Phaser.GameObjects.Graphics;
  private objG!: Phaser.GameObjects.Graphics;
  private fxG!: Phaser.GameObjects.Graphics;
  private agentG!: Phaser.GameObjects.Graphics;
  private topG!: Phaser.GameObjects.Graphics;
  private heatG!: Phaser.GameObjects.Graphics;
  private drawnLayout = -1;
  private drawnGrid: object | null = null;
  private drawnBuild = false;
  private heatFrame = 0;
  private build!: BuildController;
  private texts = new Map<string, Phaser.GameObjects.Text>();
  private usedTexts = new Set<string>();
  private floats: FloatText[] = [];
  private bursts: Burst[] = [];
  /** Last heading per agent, so people keep facing the same way when they stop. */
  private facing = new Map<string, number>();
  private objImages = new Map<string, Phaser.GameObjects.Image>();
  private watcher = new EventWatcher();
  private keys!: Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT', Phaser.Input.Keyboard.Key>;
  private drag: { x: number; y: number; sx: number; sy: number; moved: boolean } | null = null;
  private hoverTile: { x: number; y: number } | null = null;
  /** The current press is with the left button. */
  private leftDown = false;
  /** The player has panned or zoomed, so stop auto-fitting. */
  private userCamera = false;
  private fittedHud = -1;

  constructor(runner: GameRunner) {
    super('world');
    this.runner = runner;
  }

  create(): void {
    this.floorG = this.add.graphics().setDepth(0);
    this.objG = this.add.graphics().setDepth(1);
    this.fxG = this.add.graphics().setDepth(2);
    this.agentG = this.add.graphics().setDepth(3);
    this.topG = this.add.graphics().setDepth(5);
    this.heatG = this.add.graphics().setDepth(0.5);
    this.build = new BuildController(this.runner, this);

    const cam = this.cameras.main;
    cam.setBackgroundColor('#15171b');
    this.fitCamera();
    // Keep the restaurant framed as the window or HUD changes size, until the player takes over.
    this.scale.on('resize', () => this.userCamera || this.fitCamera());
    const unsub = ui.subscribe(() => {
      if (ui.state.hudBottom !== this.fittedHud && !this.userCamera) this.fitCamera();
    });
    this.events.once('destroy', unsub);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT', false) as typeof this.keys;
    kb.on('keydown-HOME', () => this.fitCamera());

    const tileAt = (p: Phaser.Input.Pointer) => {
      const wp = cam.getWorldPoint(p.x, p.y);
      return { x: Math.floor(wp.x / TILE), y: Math.floor(wp.y / TILE) };
    };
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.hoverTile = tileAt(p);
      const left = !p.rightButtonDown() && !p.middleButtonDown();
      this.leftDown = left;
      // Build gestures (floor rectangles) take the left button; anything else pans.
      if (this.build.active && left && this.build.pointerDown(this.hoverTile)) return;
      this.drag = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY, moved: false };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.hoverTile = tileAt(p);
      if (this.build.active) this.build.pointerMove(this.hoverTile);
      if (!this.drag || !p.isDown) return;
      const dx = p.x - this.drag.x;
      const dy = p.y - this.drag.y;
      if (!this.drag.moved && Math.hypot(dx, dy) > 6) this.drag.moved = true;
      if (this.drag.moved) {
        this.userCamera = true;
        cam.scrollX = this.drag.sx - dx / cam.zoom;
        cam.scrollY = this.drag.sy - dy / cam.zoom;
      }
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.build.active && this.build.pointerUp(tileAt(p))) return;
      const wasDrag = this.drag?.moved;
      this.drag = null;
      if (wasDrag || !this.leftDown) return;
      if (this.build.active) this.build.click(tileAt(p));
      else this.handleClick(p);
    });
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      this.userCamera = true;
      const before = cam.getWorldPoint(p.x, p.y);
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.4, 3));
      const after = cam.getWorldPoint(p.x, p.y);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    });
    this.input.on('gameout', () => (this.hoverTile = null));
  }

  /** Frame the built floor in the part of the window below the HUD (Home key). */
  fitCamera(): void {
    const s = this.runner.state;
    const cam = this.cameras.main;
    const { width, height, floor } = s.grid;
    let [x0, y0, x1, y1] = [width, height, -1, -1];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (floor[y * width + x] === Floor.Void) continue;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
    if (x1 < 0) [x0, y0, x1, y1] = [0, 0, width - 1, height - 1];
    const top = Math.min(ui.state.hudBottom, this.scale.height / 2);
    const availW = this.scale.width;
    const availH = this.scale.height - top;
    const pad = 24;
    const worldW = (x1 - x0 + 1) * TILE;
    const worldH = (y1 - y0 + 1) * TILE;
    const zoom = Phaser.Math.Clamp(Math.min((availW - 2 * pad) / worldW, (availH - 2 * pad) / worldH), 0.4, 2);
    cam.setZoom(zoom);
    // centerOn centres in the whole viewport; shift down by half the HUD so it centres below it.
    cam.centerOn(x0 * TILE + worldW / 2, y0 * TILE + worldH / 2 - top / 2 / zoom);
    this.fittedHud = ui.state.hudBottom;
    this.userCamera = false;
  }

  private handleClick(p: Phaser.Input.Pointer): void {
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    const s = this.runner.state;
    // Agents first: they're drawn on top.
    for (const e of Object.values(s.employees)) {
      const pos = this.agentPos(e);
      if (Math.hypot(pos.x - wp.x, pos.y - wp.y) < TILE * 0.45) {
        ui.set({ selected: { kind: 'employee', id: e.id }, picker: null });
        return;
      }
    }
    for (const c of Object.values(s.customers)) {
      const pos = this.agentPos(c);
      if (Math.hypot(pos.x - wp.x, pos.y - wp.y) < TILE * 0.4) {
        ui.set({ selected: { kind: 'customer', id: c.id }, picker: null });
        return;
      }
    }
    const tx = Math.floor(wp.x / TILE);
    const ty = Math.floor(wp.y / TILE);
    const obj = objectAtTile(s, tx, ty);
    if (!obj) {
      ui.set({ selected: null, picker: null });
      return;
    }
    const r = clickObject(this.runner, obj.id);
    if (r === 'speedUp') this.floatText(wp.x, wp.y - 8, '⏩', '#ffd966');
    if (r === 'serve') this.floatText(wp.x, wp.y - 8, 'Serving!', '#93c47d');
  }

  floatText(x: number, y: number, str: string, color: string, opts: { size?: number; life?: number; rise?: number } = {}): void {
    const size = opts.size ?? 12;
    const t = this.add.text(x, y, str, { ...TEXT_STYLE, fontSize: `${size}px`, color, fontStyle: 'bold', stroke: '#000000', strokeThickness: 3 });
    t.setOrigin(0.5).setDepth(10).setScale(0.4);
    this.tweens.add({ targets: t, scale: 1, duration: 180, ease: 'Back.Out' });
    this.floats.push({ text: t, born: this.time.now, life: opts.life ?? 1.1, y0: y, rise: opts.rise ?? 26 });
    while (this.floats.length > MAX_FLOATS) this.floats.shift()!.text.destroy();
  }

  private burst(x: number, y: number, color: number): void {
    this.bursts.push({ x, y, born: this.time.now, color });
  }

  /** Sounds and popups for what changed since the last frame. */
  private react(events: GameEvent[]): void {
    const s = this.runner.state;
    for (const ev of events) {
      switch (ev.kind) {
        case 'pay':
          this.floatText(ev.x * TILE, ev.y * TILE - 10, `+${formatMoney(Math.round(ev.amount))}`, '#ffd966', { size: 13 });
          play('cash');
          break;
        case 'ready':
          this.burst(ev.x * TILE, ev.y * TILE, 0x93c47d);
          play('ding');
          break;
        case 'stocked':
          this.floatText(ev.x * TILE, ev.y * TILE - 12, `+${ev.n}`, '#93c47d');
          play('stock');
          break;
        case 'levelUp': {
          const e = s.employees[ev.employeeId];
          if (!e) break;
          const p = this.agentPos(e);
          this.floatText(p.x, p.y - 26, `${ev.skill} ${ev.level}!`, '#6fa8dc', { size: 12, life: 1.8, rise: 18 });
          play('levelUp');
          break;
        }
        case 'upgrade':
          this.burst(ev.x * TILE, ev.y * TILE, 0xffd966);
          this.floatText(ev.x * TILE, ev.y * TILE - 14, `Tier ${ev.tier}!`, '#ffd966', { size: 14, life: 1.6 });
          play('fanfare');
          break;
        case 'mastery':
        case 'unlock':
          play('fanfare');
          break;
        case 'angry':
          this.floatText(ev.x * TILE, ev.y * TILE - 14, '💢', '#e06666', { size: 14 });
          play('bad');
          break;
      }
    }
  }

  update(_time: number, delta: number): void {
    this.runner.frame(performance.now());
    const s = this.runner.state;
    this.react(this.watcher.poll(s));
    this.panWithKeys(delta);
    if (this.drawnLayout !== s.layoutVersion || this.drawnGrid !== s.grid || this.drawnBuild !== this.build.active) this.drawStatic(s);
    this.usedTexts.clear();
    if (this.heatFrame++ % 15 === 0) this.drawHeatmap(s);
    this.drawDynamic(s);
    this.drawAgents(s);
    for (const [k, t] of this.texts) if (!this.usedTexts.has(k)) t.setVisible(false);
    this.updateFloats();
  }

  private panWithKeys(delta: number): void {
    const cam = this.cameras.main;
    const v = (0.6 * delta) / cam.zoom;
    const k = this.keys;
    if (k.A.isDown || k.LEFT.isDown) cam.scrollX -= v;
    if (k.D.isDown || k.RIGHT.isDown) cam.scrollX += v;
    if (k.W.isDown || k.UP.isDown) cam.scrollY -= v;
    if (k.S.isDown || k.DOWN.isDown) cam.scrollY += v;
  }

  private updateFloats(): void {
    const now = this.time.now;
    this.floats = this.floats.filter((f) => {
      const age = (now - f.born) / 1000 / f.life;
      if (age > 1) {
        f.text.destroy();
        return false;
      }
      // Ease out: rise quickly, then hang and fade.
      f.text.y = f.y0 - f.rise * (1 - (1 - age) ** 3);
      f.text.setAlpha(age < 0.6 ? 1 : 1 - (age - 0.6) / 0.4);
      return true;
    });
    const g = this.topG;
    this.bursts = this.bursts.filter((b) => {
      const age = (now - b.born) / 600;
      if (age > 1) return false;
      g.lineStyle(3 * (1 - age), b.color, 1 - age);
      g.strokeCircle(b.x, b.y, 10 + 26 * age);
      return true;
    });
  }

  /** A pooled text label, keyed so it persists across frames; hidden when not drawn. */
  label(key: string, x: number, y: number, str: string, style: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}): Phaser.GameObjects.Text {
    let t = this.texts.get(key);
    if (!t) {
      t = this.add.text(0, 0, '', { ...TEXT_STYLE, ...style }).setOrigin(0.5).setDepth(6);
      this.texts.set(key, t);
    }
    if (style.backgroundColor && t.style.backgroundColor !== style.backgroundColor) t.setBackgroundColor(style.backgroundColor);
    if (style.color && t.style.color !== style.color) t.setColor(style.color as string);
    if (t.text !== str) t.setText(str);
    t.setPosition(x, y).setVisible(true);
    this.usedTexts.add(key);
    return t;
  }

  // -------------------------------------------------------------------------

  private drawStatic(s: GameState): void {
    this.drawnLayout = s.layoutVersion;
    this.drawnGrid = s.grid;
    this.drawnBuild = this.build.active;
    this.drawFloor(s);
    const o = this.objG;
    o.clear();
    for (const img of this.objImages.values()) img.destroy();
    this.objImages.clear();
    for (const obj of Object.values(s.objects)) this.drawObject(obj);
  }

  private drawFloor(s: GameState): void {
    const g = this.floorG;
    g.clear();
    const { width, height, floor } = s.grid;
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? Floor.Void : floor[y * width + x]);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const f = floor[y * width + x];
        const px = x * TILE;
        const py = y * TILE;
        if (f === Floor.Void) {
          // In build mode, show the empty lot you can buy.
          if (this.build.active) {
            g.lineStyle(1, 0x2c3038, 1);
            g.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
          }
          continue;
        }
        if (f === Floor.Wall) {
          g.fillStyle(0x23262c, 1);
          g.fillRect(px, py, TILE, TILE);
          // Lit edge where the wall meets the floor below it.
          if (at(x, y + 1) === Floor.Open) {
            g.fillStyle(0x3a3f49, 1);
            g.fillRect(px, py + TILE - 6, TILE, 6);
            g.fillStyle(0x4a505c, 1);
            g.fillRect(px, py + TILE - 6, TILE, 1);
          }
          continue;
        }
        this.drawPlanks(g, x, y);
        // Soft shadow cast by a wall above or to the left.
        if (at(x, y - 1) === Floor.Wall) {
          g.fillStyle(0x000000, 0.22);
          g.fillRect(px, py, TILE, 5);
        }
        if (at(x - 1, y) === Floor.Wall) {
          g.fillStyle(0x000000, 0.15);
          g.fillRect(px, py, 4, TILE);
        }
      }
    }
  }

  /** Wooden planks two tiles long, four rows per tile, joints staggered row to row. */
  private drawPlanks(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    const PLANK = TILE / 4;
    const LEN = TILE * 2;
    for (let i = 0; i < 4; i++) {
      const row = y * 4 + i;
      const offset = hash2(row, 7) % LEN;
      const py = y * TILE + i * PLANK;
      // Split this tile's slice of the row at the plank joint, if there is one.
      let px = x * TILE;
      const end = px + TILE;
      while (px < end) {
        const seg = Math.floor((px + offset) / LEN);
        const segEnd = Math.min(end, seg * LEN + LEN - offset);
        g.fillStyle(PLANK_TONES[hash2(seg, row) % PLANK_TONES.length], 1);
        g.fillRect(px, py, segEnd - px, PLANK);
        if (segEnd < end) {
          g.fillStyle(0x000000, 0.22);
          g.fillRect(segEnd - 1, py, 1, PLANK - 1);
        }
        px = segEnd;
      }
      g.fillStyle(0x000000, 0.18);
      g.fillRect(x * TILE, py + PLANK - 1, TILE, 1);
    }
  }

  private drawObject(obj: PlacedObject): void {
    const def = stationDef(obj.type);
    const g = this.objG;
    const { w, h } = rotatedSize(obj.type, obj.rot);
    const px = obj.x * TILE;
    const py = obj.y * TILE;
    // Chairs around tables.
    if (def.seats) {
      const tcx = px + (w * TILE) / 2;
      const tcy = py + (h * TILE) / 2;
      for (const st of seatTiles(obj)) {
        const ax = Math.sign(tcx - (st.x * TILE + TILE / 2));
        const ay = ax === 0 ? Math.sign(tcy - (st.y * TILE + TILE / 2)) : 0;
        chair(g, st.x * TILE, st.y * TILE, ax, ay);
      }
    }
    if (this.textures.exists(def.sprite)) {
      // An asset pack supplied this sprite: art faces south at rotation 0.
      const img = this.add.image(px + (w * TILE) / 2, py + (h * TILE) / 2, def.sprite).setDepth(1);
      img.setDisplaySize(stationDef(obj.type).w * TILE, stationDef(obj.type).h * TILE).setAngle(obj.rot * 90);
      this.objImages.set(obj.id, img);
    } else {
      let fx = 0;
      let fy = 1;
      if (def.work.length > 0) {
        const wt = workTile(obj);
        fx = Math.sign(wt.x * TILE + TILE / 2 - (px + (w * TILE) / 2));
        fy = Math.sign(wt.y * TILE + TILE / 2 - (py + (h * TILE) / 2));
        if (fx !== 0 && fy !== 0) fx = 0;
      }
      sprite(def.sprite)(g, { x: px, y: py, w: w * TILE, h: h * TILE, fx, fy, color: def.color });
    }
    // Equipment tier pips along the bottom edge.
    for (let i = 1; i < obj.tier; i++) {
      g.fillStyle(0x000000, 0.6);
      g.fillRect(px + w * TILE - 8 - (i - 1) * 5, py + h * TILE - 9, 5, 5);
      g.fillStyle(0xffd966, 1);
      g.fillRect(px + w * TILE - 7 - (i - 1) * 5, py + h * TILE - 8, 3, 3);
    }
  }

  private drawDynamic(s: GameState): void {
    const g = this.fxG;
    g.clear();
    const top = this.topG;
    top.clear();
    const now = this.time.now / 1000;
    const hoverObj = this.hoverTile && !this.drag?.moved ? objectAtTile(s, this.hoverTile.x, this.hoverTile.y) : null;
    const hoverId = hoverObj?.id ?? null;
    const selId = ui.state.selected?.kind === 'object' ? ui.state.selected.id : null;

    for (const obj of Object.values(s.objects)) {
      const def = stationDef(obj.type);
      const { w, h } = rotatedSize(obj.type, obj.rot);
      const cx = obj.x * TILE + (w * TILE) / 2;
      const cy = obj.y * TILE + (h * TILE) / 2;

      if (def.label && def.kind !== 'counter' && (this.build.active || obj.id === hoverId || obj.id === selId)) {
        this.label(`lbl:${obj.id}`, cx, cy, def.label, { fontSize: '9px', color: '#00000099', fontStyle: 'bold' });
      }

      if (obj.cook?.batchId) {
        const b = s.batches[obj.cook.batchId];
        if (!b) continue;
        const r = recipe(b.recipeId);
        const p = batchProgress(b);
        // Neighbouring stations stagger their labels so they never overlap.
        const labelY = cy - 22 - (obj.x % 2) * 12;
        // Recipe colour badge in the corner (full name is in the side panel).
        g.fillStyle(r.color, 1);
        g.fillCircle(obj.x * TILE + 7, obj.y * TILE + 7, 4);
        g.lineStyle(1, 0x000000, 0.7);
        g.strokeCircle(obj.x * TILE + 7, obj.y * TILE + 7, 4);
        if (b.phase === 'loading') {
          g.fillStyle(0x000000, 0.6);
          g.fillRect(cx - 14, cy + 9, 28, 4);
          g.fillStyle(0x6fa8dc, 1);
          g.fillRect(cx - 14, cy + 9, 28 * p, 4);
          this.label(`st:${obj.id}`, cx, labelY, `${b.cratesLoaded}/${b.crates.length}`, { backgroundColor: '#000000aa', padding: { x: 2, y: 1 } });
        } else if (b.phase === 'cooking') {
          g.fillStyle(0xff7f00, 0.12 + 0.06 * Math.sin(now * 9 + obj.x));
          g.fillCircle(cx, cy, 15);
          g.lineStyle(3, 0x000000, 0.5);
          g.strokeCircle(cx, cy, 13);
          g.lineStyle(3, 0xf6b26b, 1);
          g.beginPath();
          g.arc(cx, cy, 13, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2, false);
          g.strokePath();
          this.label(`st:${obj.id}`, cx, labelY, formatDuration(batchTimeLeft(b)), { backgroundColor: '#000000aa', padding: { x: 2, y: 1 } });
        } else if (b.phase === 'ready') {
          const bob = Math.sin(now * 5) * 2;
          const label = b.serveRequested ? 'Serving…' : 'Ready!';
          top.fillStyle(b.serveRequested ? 0x6aa84f : 0x38761d, 1);
          top.fillRoundedRect(cx - 22, cy - 32 + bob, 44, 16, 6);
          top.fillTriangle(cx - 4, cy - 16 + bob, cx + 4, cy - 16 + bob, cx, cy - 11 + bob);
          this.label(`st:${obj.id}`, cx, cy - 24 + bob, label, { fontStyle: 'bold' }).setDepth(7);
          g.lineStyle(2, 0x93c47d, 0.6 + 0.4 * Math.sin(now * 5));
          g.strokeRoundedRect(obj.x * TILE + 1, obj.y * TILE + 1, w * TILE - 2, h * TILE - 2, 6);
        }
      }

      if (obj.prep?.crateId) {
        const c = s.crates[obj.prep.crateId];
        if (c) {
          this.drawCrate(g, cx, cy - 2, c.ingredient, c.prepped);
          if (c.needsPrep && !c.prepped && c.prepDone > 0) {
            const p = Math.min(1, (c.prepDone + c.clickRemoved) / c.prepTime);
            g.fillStyle(0x000000, 0.6);
            g.fillRect(cx - 12, cy + 9, 24, 4);
            g.fillStyle(0x93c47d, 1);
            g.fillRect(cx - 12, cy + 9, 24 * p, 4);
          }
        }
      }

      if (obj.pass) {
        obj.pass.plates.forEach((cid, i) => {
          this.drawPlate(g, cx - 7 + (i % 2) * 14, cy - 7 + Math.floor(i / 2) * 14, s.customers[cid]?.dish ?? null);
        });
      }

      if (obj.table && obj.table.dirty > 0) {
        // Dirty plates left behind, waiting for a busser.
        for (let i = 0; i < obj.table.dirty; i++) {
          this.drawDirtyPlate(g, cx - 8 + (i % 3) * 8, cy - 4 + Math.floor(i / 3) * 7);
        }
      }

      if (obj.dishPit && obj.dishPit.dirty > 0) {
        const n = obj.dishPit.dirty;
        for (let i = 0; i < Math.min(n, 6); i++) this.drawDirtyPlate(g, cx - 5 + (i % 2) * 10, cy + 6 - Math.floor(i / 2) * 4);
        this.label(`pit:${obj.id}`, cx, cy - 18, String(n), { backgroundColor: '#000000aa', padding: { x: 2, y: 1 } });
      }

      if (obj.counter) {
        const stock = counterStock(obj);
        const rid = obj.counter.recipeId;
        if (rid) {
          g.fillStyle(recipe(rid).color, 1);
          g.fillCircle(cx, cy, 9);
          g.lineStyle(1, 0x000000, 0.6);
          g.strokeCircle(cx, cy, 9);
        }
        this.label(`ctr:${obj.id}`, cx, cy, rid ? String(stock) : obj.counter.incoming.length ? '…' : '—', {
          fontStyle: 'bold',
          color: rid ? '#000000' : '#666666',
        });
      }
    }

    // Crates on the floor.
    for (const c of Object.values(s.crates)) {
      if (c.loc.kind === 'floor') this.drawCrate(g, c.loc.x * TILE + TILE / 2, c.loc.y * TILE + TILE / 2, c.ingredient, c.prepped);
    }
    for (const b of Object.values(s.batches)) {
      if (b.pot.kind === 'floor') this.drawPot(g, b.pot.x * TILE + TILE / 2, b.pot.y * TILE + TILE / 2, b.recipeId);
    }

    if (this.build.active) {
      this.build.draw(top, s, this.hoverTile);
      this.input.setDefaultCursor('crosshair');
      return;
    }

    // Selection and hover.
    const sel = ui.state.selected;
    if (sel?.kind === 'object') {
      const o = s.objects[sel.id];
      if (o) this.highlight(top, o, 0xffd966);
    }
    if (this.hoverTile && !this.drag?.moved) {
      const o = objectAtTile(s, this.hoverTile.x, this.hoverTile.y);
      if (o && stationDef(o.type).kind !== 'idle') {
        this.highlight(top, o, 0xffffff, 0.35);
        this.input.setDefaultCursor('pointer');
      } else this.input.setDefaultCursor('default');
    }
  }

  /** Walking / blocking heatmaps (PLAN §3.4). */
  private drawHeatmap(s: GameState): void {
    const g = this.heatG;
    g.clear();
    const mode = ui.state.overlay;
    if (mode === 'none') return;
    const data = mode === 'traffic' ? s.stats.trafficByTile : s.stats.blockedByTile;
    let max = 0;
    for (const v of Object.values(data)) max = Math.max(max, v);
    if (max <= 0) return;
    const color = mode === 'traffic' ? 0x6fa8dc : 0xe06666;
    const w = s.grid.width;
    for (const [k, v] of Object.entries(data)) {
      const i = Number(k);
      // Square root keeps light traffic visible next to the busiest tiles.
      g.fillStyle(color, 0.12 + 0.68 * Math.sqrt(v / max));
      g.fillRect((i % w) * TILE, Math.floor(i / w) * TILE, TILE, TILE);
    }
  }

  private highlight(g: Phaser.GameObjects.Graphics, o: PlacedObject, color: number, alpha = 1): void {
    g.lineStyle(2, color, alpha);
    for (const t of footprint(o)) g.strokeRoundedRect(t.x * TILE + 1, t.y * TILE + 1, TILE - 2, TILE - 2, 5);
    g.lineStyle(1, color, alpha * 0.7);
    for (const wt of workTiles(o)) g.strokeRect(wt.x * TILE + 8, wt.y * TILE + 8, TILE - 16, TILE - 16);
  }

  private drawPlate(g: Phaser.GameObjects.Graphics, x: number, y: number, recipeId: string | null): void {
    g.fillStyle(0xf3f3f3, 1);
    g.fillCircle(x, y, 5);
    if (recipeId) {
      g.fillStyle(recipe(recipeId).color, 1);
      g.fillCircle(x, y, 3);
    }
  }

  private drawDirtyPlate(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0xd9d9d9, 1);
    g.fillCircle(x, y, 4);
    g.lineStyle(1, 0x666666, 0.8);
    g.strokeCircle(x, y, 4);
    g.fillStyle(0x7f6000, 0.6);
    g.fillCircle(x + 1, y - 1, 1.5);
  }

  private drawCrate(g: Phaser.GameObjects.Graphics, x: number, y: number, ingredient: string, prepped: boolean): void {
    const color = INGREDIENTS[ingredient]?.color ?? 0xcccccc;
    g.fillStyle(0x7f6000, 1);
    g.fillRect(x - 6, y - 6, 12, 12);
    g.fillStyle(color, 1);
    if (prepped) {
      g.fillCircle(x - 2, y - 2, 2.5);
      g.fillCircle(x + 2, y + 1, 2.5);
      g.fillCircle(x - 1, y + 3, 2);
    } else g.fillRect(x - 4, y - 4, 8, 8);
  }

  private drawPot(g: Phaser.GameObjects.Graphics, x: number, y: number, recipeId: string): void {
    g.fillStyle(0x434343, 1);
    g.fillCircle(x, y, 8);
    g.fillStyle(recipe(recipeId).color, 1);
    g.fillCircle(x, y, 5.5);
  }

  /** Interpolated pixel position (PLAN §2.1 render interpolation). */
  agentPos(e: Mover): { x: number; y: number } {
    let fx = e.x;
    let fy = e.y;
    if (e.step) {
      const lead = this.runner.paused ? 0 : this.runner.alpha * TICK_DT * this.runner.speed;
      const t = Math.min(1, (e.step.t + lead) / e.step.dur);
      fx = e.x + (e.step.tx - e.x) * t;
      fy = e.y + (e.step.ty - e.y) * t;
    }
    return { x: fx * TILE + TILE / 2, y: fy * TILE + TILE / 2 };
  }

  private drawAgents(s: GameState): void {
    const g = this.agentG;
    g.clear();
    const sel = ui.state.selected;
    // Guests come and go; forget old headings now and then.
    if (this.facing.size > 400) this.facing.clear();
    for (const e of Object.values(s.employees)) {
      const { x, y } = this.agentPos(e);
      const selected = sel?.kind === 'employee' && sel.id === e.id;
      const ring = e.activity === 'blocked' ? 0xe06666 : selected ? 0xffd966 : null;
      this.drawPerson(g, e, x, y, 10, e.color, ring, 'hat');
      if (e.carrying?.kind === 'crate') {
        const c = s.crates[e.carrying.id];
        if (c) this.drawCrate(g, x + 9, y - 7, c.ingredient, c.prepped);
      } else if (e.carrying?.kind === 'pot') {
        const b = s.batches[e.carrying.id];
        if (b) this.drawPot(g, x + 9, y - 6, b.recipeId);
      } else if (e.carrying?.kind === 'plate') {
        this.drawPlate(g, x + 9, y - 6, s.customers[e.carrying.id]?.dish ?? null);
      } else if (e.carrying?.kind === 'dishes') {
        for (let i = 0; i < Math.min(e.carrying.n, 4); i++) this.drawDirtyPlate(g, x + 9, y - 4 - i * 3);
      }
      this.label(`emp:${e.id}`, x, y - 18, e.name, { fontSize: '9px', backgroundColor: '#00000088', padding: { x: 2, y: 0 } }).setDepth(8);
    }
    this.drawCustomers(s);
  }

  /** Top-down person: body in their colour, hands, and a head turned the way they're heading. */
  private drawPerson(g: Phaser.GameObjects.Graphics, m: Mover & { id: string }, x: number, y: number, r: number, color: number, ring: number | null, top: 'hat' | 'hair'): void {
    let a = this.facing.get(m.id) ?? Math.PI / 2;
    if (m.step) {
      a = Math.atan2(m.step.ty - m.y, m.step.tx - m.x);
      this.facing.set(m.id, a);
    }
    const fx = Math.cos(a);
    const fy = Math.sin(a);
    const h = hashStr(m.id);
    const skin = SKIN[h % SKIN.length];
    g.fillStyle(0x000000, 0.28);
    g.fillEllipse(x, y + r * 0.85, r * 1.9, r * 0.6);
    // Hands, a little ahead of the shoulders.
    g.fillStyle(skin, 1);
    g.fillCircle(x + fx * r * 0.45 - fy * r * 0.85, y + fy * r * 0.45 + fx * r * 0.85, r * 0.22);
    g.fillCircle(x + fx * r * 0.45 + fy * r * 0.85, y + fy * r * 0.45 - fx * r * 0.85, r * 0.22);
    g.fillStyle(shade(color, -0.35), 1);
    g.fillCircle(x, y, r);
    g.fillStyle(color, 1);
    g.fillCircle(x - r * 0.08, y - r * 0.1, r * 0.88);
    if (ring !== null) {
      g.lineStyle(2, ring, 1);
      g.strokeCircle(x, y, r + 1.5);
    }
    // Head, nudged toward the way they face.
    const hx = x + fx * r * 0.2;
    const hy = y + fy * r * 0.2 - r * 0.05;
    g.fillStyle(0x000000, 0.25);
    g.fillCircle(hx + 0.5, hy + 1, r * 0.62);
    g.fillStyle(skin, 1);
    g.fillCircle(hx, hy, r * 0.6);
    // From above you mostly see the top of the head; the face peeks out in front.
    const bx = hx - fx * r * 0.14;
    const by = hy - fy * r * 0.14;
    if (top === 'hat') {
      g.fillStyle(0xd9d9d9, 1);
      g.fillCircle(bx, by, r * 0.55);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(bx - r * 0.08, by - r * 0.1, r * 0.4);
    } else {
      const hair = HAIR[(h >> 4) % HAIR.length];
      g.fillStyle(hair, 1);
      g.fillCircle(bx, by, r * 0.55);
      g.fillStyle(shade(hair, 0.25), 1);
      g.fillCircle(bx - r * 0.15, by - r * 0.18, r * 0.2);
    }
  }

  private drawCustomers(s: GameState): void {
    const g = this.agentG;
    const sel = ui.state.selected;
    for (const c of Object.values(s.customers)) {
      const p = s.parties[c.partyId];
      if (!p) continue;
      const { x, y } = this.agentPos(c);
      const selected = sel?.kind === 'customer' && sel.id === c.id;
      const angry = p.angry;
      this.drawPerson(g, c, x, y, 7.5, p.color, selected ? 0xffd966 : angry ? 0xe06666 : null, 'hair');
      // Food on the table in front of them.
      if (c.plate?.at === 'table' && p.tableId) {
        const t = s.objects[p.tableId];
        if (t) {
          const tx = (t.x + rotatedSize(t.type, t.rot).w / 2) * TILE;
          const ty = (t.y + rotatedSize(t.type, t.rot).h / 2) * TILE;
          const ox = Math.sign(x - tx) * 6;
          const oy = Math.sign(y - ty) * 5;
          this.drawPlate(g, tx + ox, ty + oy, c.eatLeft > 0 ? c.dish : null);
        }
      }
      // Thought bubble: what they're waiting for.
      if (p.phase === 'waitFood' && c.dish && c.plate?.at !== 'table') {
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(x + 8, y - 11, 6);
        g.fillStyle(recipe(c.dish).color, 1);
        g.fillCircle(x + 8, y - 11, 3.5);
      } else if (p.phase === 'waitOrder') {
        this.label(`ord:${c.id}`, x + 8, y - 12, '?', { fontSize: '10px', color: '#ffffff', fontStyle: 'bold' });
      } else if (angry) {
        this.label(`ang:${c.id}`, x, y - 13, '!', { fontSize: '11px', color: '#e06666', fontStyle: 'bold' });
      }
      // Patience bar once it's running low.
      const used = patienceUsed(p);
      if (used > 0.5 && !angry) {
        g.fillStyle(0x000000, 0.7);
        g.fillRect(x - 8, y + 10, 16, 3);
        g.fillStyle(used > 0.8 ? 0xe06666 : 0xf6b26b, 1);
        g.fillRect(x - 8, y + 10, 16 * (1 - used), 3);
      }
    }
  }
}
