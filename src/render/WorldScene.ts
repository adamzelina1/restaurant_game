import Phaser from 'phaser';
import { INGREDIENTS } from '../data/ingredients';
import { recipe } from '../data/recipes';
import { stationDef } from '../data/stations';
import type { GameRunner } from '../game/runner';
import { counterStock } from '../sim/counters/counters';
import { TICK_DT } from '../sim/constants';
import { footprint, objectAtTile, rotatedSize, workTile } from '../sim/grid/grid';
import { batchProgress, batchTimeLeft } from '../sim/production/batches';
import { Floor, type Employee, type GameState, type PlacedObject } from '../sim/state';
import { clickObject } from '../ui/actions';
import { formatDuration } from '../ui/format';
import { ui } from '../ui/store';

export const TILE = 32;

const FLOOR_COLORS: Record<number, [number, number]> = {
  [Floor.Kitchen]: [0x3b4049, 0x373c44],
  [Floor.Dining]: [0x6b5139, 0x654c35],
  [Floor.Wall]: [0x1f2228, 0x1f2228],
};

const TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: '10px',
  color: '#ffffff',
  resolution: 3,
};

interface FloatText {
  text: Phaser.GameObjects.Text;
  born: number;
}

export class WorldScene extends Phaser.Scene {
  private runner: GameRunner;
  private floorG!: Phaser.GameObjects.Graphics;
  private objG!: Phaser.GameObjects.Graphics;
  private fxG!: Phaser.GameObjects.Graphics;
  private agentG!: Phaser.GameObjects.Graphics;
  private topG!: Phaser.GameObjects.Graphics;
  private drawnLayout = -1;
  private drawnGrid: object | null = null;
  private texts = new Map<string, Phaser.GameObjects.Text>();
  private usedTexts = new Set<string>();
  private floats: FloatText[] = [];
  private keys!: Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT', Phaser.Input.Keyboard.Key>;
  private drag: { x: number; y: number; sx: number; sy: number; moved: boolean } | null = null;
  private hoverTile: { x: number; y: number } | null = null;

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

    const s = this.runner.state;
    const cam = this.cameras.main;
    cam.setBackgroundColor('#15171b');
    cam.centerOn((s.grid.width * TILE) / 2, (s.grid.height * TILE) / 2);
    const fit = Math.min(this.scale.width / (s.grid.width * TILE + 64), this.scale.height / (s.grid.height * TILE + 160));
    cam.setZoom(Phaser.Math.Clamp(fit, 0.5, 2));

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT', false) as typeof this.keys;

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.drag = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY, moved: false };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const wp = cam.getWorldPoint(p.x, p.y);
      this.hoverTile = { x: Math.floor(wp.x / TILE), y: Math.floor(wp.y / TILE) };
      if (!this.drag || !p.isDown) return;
      const dx = p.x - this.drag.x;
      const dy = p.y - this.drag.y;
      if (!this.drag.moved && Math.hypot(dx, dy) > 6) this.drag.moved = true;
      if (this.drag.moved) {
        cam.scrollX = this.drag.sx - dx / cam.zoom;
        cam.scrollY = this.drag.sy - dy / cam.zoom;
      }
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const wasDrag = this.drag?.moved;
      this.drag = null;
      if (!wasDrag) this.handleClick(p);
    });
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const before = cam.getWorldPoint(p.x, p.y);
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.4, 3));
      const after = cam.getWorldPoint(p.x, p.y);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    });
    this.input.on('gameout', () => (this.hoverTile = null));
  }

  private handleClick(p: Phaser.Input.Pointer): void {
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    const s = this.runner.state;
    // Employees first: they're drawn on top.
    for (const e of Object.values(s.employees)) {
      const pos = this.agentPos(e);
      if (Math.hypot(pos.x - wp.x, pos.y - wp.y) < TILE * 0.45) {
        ui.set({ selected: { kind: 'employee', id: e.id }, picker: null });
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

  floatText(x: number, y: number, str: string, color: string): void {
    const t = this.add.text(x, y, str, { ...TEXT_STYLE, fontSize: '12px', color, fontStyle: 'bold' });
    t.setOrigin(0.5).setDepth(10);
    this.floats.push({ text: t, born: this.time.now });
  }

  update(_time: number, delta: number): void {
    this.runner.frame(performance.now());
    const s = this.runner.state;
    this.panWithKeys(delta);
    if (this.drawnLayout !== s.layoutVersion || this.drawnGrid !== s.grid) this.drawStatic(s);
    this.usedTexts.clear();
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
      const age = (now - f.born) / 1000;
      if (age > 0.9) {
        f.text.destroy();
        return false;
      }
      f.text.y -= 0.6;
      f.text.setAlpha(1 - age / 0.9);
      return true;
    });
  }

  private text(key: string, x: number, y: number, str: string, style: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {}): Phaser.GameObjects.Text {
    let t = this.texts.get(key);
    if (!t) {
      t = this.add.text(0, 0, '', { ...TEXT_STYLE, ...style }).setOrigin(0.5).setDepth(6);
      this.texts.set(key, t);
    }
    if (t.text !== str) t.setText(str);
    t.setPosition(x, y).setVisible(true);
    this.usedTexts.add(key);
    return t;
  }

  // -------------------------------------------------------------------------

  private drawStatic(s: GameState): void {
    this.drawnLayout = s.layoutVersion;
    this.drawnGrid = s.grid;
    const g = this.floorG;
    g.clear();
    const { width, height, floor } = s.grid;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const f = floor[y * width + x];
        const c = FLOOR_COLORS[f];
        if (!c) continue;
        g.fillStyle(c[(x + y) % 2], 1);
        g.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
    const o = this.objG;
    o.clear();
    for (const obj of Object.values(s.objects)) this.drawObject(obj);
  }

  private drawObject(obj: PlacedObject): void {
    const def = stationDef(obj.type);
    const g = this.objG;
    const { w, h } = rotatedSize(obj.type, obj.rot);
    const px = obj.x * TILE;
    const py = obj.y * TILE;
    if (def.kind === 'idle') {
      g.lineStyle(1, def.color, 0.6);
      g.strokeRect(px + 6, py + 6, TILE - 12, TILE - 12);
      return;
    }
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(px + 3, py + 4, w * TILE - 4, h * TILE - 4, 5);
    g.fillStyle(def.color, 1);
    g.fillRoundedRect(px + 2, py + 2, w * TILE - 4, h * TILE - 4, 5);
    g.lineStyle(1, 0x000000, 0.5);
    g.strokeRoundedRect(px + 2, py + 2, w * TILE - 4, h * TILE - 4, 5);
    // Facing notch toward the work tile.
    const wt = workTile(obj);
    const cx = px + (w * TILE) / 2;
    const cy = py + (h * TILE) / 2;
    const nx = cx + Math.sign(wt.x * TILE + TILE / 2 - cx) * (w * TILE * 0.5 - 4);
    const ny = cy + Math.sign(wt.y * TILE + TILE / 2 - cy) * (h * TILE * 0.5 - 4);
    g.fillStyle(0xffffff, 0.5);
    g.fillCircle(nx, ny, 2);
  }

  private drawDynamic(s: GameState): void {
    const g = this.fxG;
    g.clear();
    const top = this.topG;
    top.clear();
    const now = this.time.now / 1000;

    for (const obj of Object.values(s.objects)) {
      const def = stationDef(obj.type);
      const { w, h } = rotatedSize(obj.type, obj.rot);
      const cx = obj.x * TILE + (w * TILE) / 2;
      const cy = obj.y * TILE + (h * TILE) / 2;

      if (def.label && def.kind !== 'counter') {
        this.text(`lbl:${obj.id}`, cx, cy, def.label, { fontSize: '9px', color: '#00000099', fontStyle: 'bold' });
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
          this.text(`st:${obj.id}`, cx, labelY, `${b.cratesLoaded}/${b.crates.length}`, { backgroundColor: '#000000aa', padding: { x: 2, y: 1 } });
        } else if (b.phase === 'cooking') {
          g.lineStyle(3, 0x000000, 0.5);
          g.strokeCircle(cx, cy, 13);
          g.lineStyle(3, 0xf6b26b, 1);
          g.beginPath();
          g.arc(cx, cy, 13, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2, false);
          g.strokePath();
          this.text(`st:${obj.id}`, cx, labelY, formatDuration(batchTimeLeft(b)), { backgroundColor: '#000000aa', padding: { x: 2, y: 1 } });
        } else if (b.phase === 'ready') {
          const bob = Math.sin(now * 5) * 2;
          const label = b.serveRequested ? 'Serving…' : 'Ready!';
          top.fillStyle(b.serveRequested ? 0x6aa84f : 0x38761d, 1);
          top.fillRoundedRect(cx - 22, cy - 32 + bob, 44, 16, 6);
          top.fillTriangle(cx - 4, cy - 16 + bob, cx + 4, cy - 16 + bob, cx, cy - 11 + bob);
          this.text(`st:${obj.id}`, cx, cy - 24 + bob, label, { fontStyle: 'bold' }).setDepth(7);
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

      if (obj.counter) {
        const stock = counterStock(obj);
        const rid = obj.counter.recipeId;
        if (rid) {
          g.fillStyle(recipe(rid).color, 1);
          g.fillCircle(cx, cy, 9);
          g.lineStyle(1, 0x000000, 0.6);
          g.strokeCircle(cx, cy, 9);
        }
        this.text(`ctr:${obj.id}`, cx, cy, rid ? String(stock) : obj.counter.incoming.length ? '…' : '—', {
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

  private highlight(g: Phaser.GameObjects.Graphics, o: PlacedObject, color: number, alpha = 1): void {
    g.lineStyle(2, color, alpha);
    for (const t of footprint(o)) g.strokeRoundedRect(t.x * TILE + 1, t.y * TILE + 1, TILE - 2, TILE - 2, 5);
    const wt = workTile(o);
    g.lineStyle(1, color, alpha * 0.7);
    g.strokeRect(wt.x * TILE + 8, wt.y * TILE + 8, TILE - 16, TILE - 16);
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
  agentPos(e: Employee): { x: number; y: number } {
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
    for (const e of Object.values(s.employees)) {
      const { x, y } = this.agentPos(e);
      g.fillStyle(0x000000, 0.3);
      g.fillEllipse(x, y + 9, 18, 6);
      g.fillStyle(e.color, 1);
      g.fillCircle(x, y, 10);
      const selected = sel?.kind === 'employee' && sel.id === e.id;
      const outline = e.activity === 'blocked' ? 0xe06666 : selected ? 0xffd966 : 0x111111;
      g.lineStyle(selected || e.activity === 'blocked' ? 2 : 1, outline, 1);
      g.strokeCircle(x, y, 10);
      // Face: a dot showing which way they're heading.
      if (e.step) {
        const a = Math.atan2(e.step.ty - e.y, e.step.tx - e.x);
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(x + Math.cos(a) * 6, y + Math.sin(a) * 6, 2);
      }
      if (e.carrying?.kind === 'crate') {
        const c = s.crates[e.carrying.id];
        if (c) this.drawCrate(g, x + 9, y - 7, c.ingredient, c.prepped);
      } else if (e.carrying?.kind === 'pot') {
        const b = s.batches[e.carrying.id];
        if (b) this.drawPot(g, x + 9, y - 6, b.recipeId);
      }
      this.text(`emp:${e.id}`, x, y - 18, e.name, { fontSize: '9px', backgroundColor: '#00000088', padding: { x: 2, y: 0 } }).setDepth(8);
    }
  }
}
