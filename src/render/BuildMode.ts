import type Phaser from 'phaser';
import { INGREDIENTS } from '../data/ingredients';
import { stationDef } from '../data/stations';
import type { GameRunner } from '../game/runner';
import { chokepointWorkTiles, routePreview, validateLayout } from '../sim/build/analysis';
import { floorTileCost, placementError } from '../sim/build/build';
import { footprint, objectAtTile, workTiles, type Tile } from '../sim/grid/grid';
import type { GameState, Id } from '../sim/state';
import { ui } from '../ui/store';

const TILE = 32;

export interface SceneApi {
  label(key: string, x: number, y: number, str: string, style?: Partial<Phaser.Types.GameObjects.Text.TextStyle>): Phaser.GameObjects.Text;
}

/** Build-mode input and overlays inside the world scene (PLAN §8, §3.4). */
export class BuildController {
  private rectStart: Tile | null = null;
  private rectEnd: Tile | null = null;
  private choke: { version: number; list: { tile: Tile; objectId: Id }[] } = { version: -1, list: [] };

  constructor(
    private runner: GameRunner,
    private scene: SceneApi,
  ) {}

  get active(): boolean {
    return ui.state.build.active;
  }

  /** Left-button press. Returns true if it starts a build gesture (so it shouldn't pan). */
  pointerDown(tile: Tile): boolean {
    if (ui.state.build.tool === 'floor') {
      this.rectStart = tile;
      this.rectEnd = tile;
      return true;
    }
    return false;
  }

  pointerMove(tile: Tile): void {
    if (this.rectStart) this.rectEnd = tile;
  }

  /** Returns true if a gesture finished. */
  pointerUp(tile: Tile): boolean {
    if (!this.rectStart) return false;
    this.rectEnd = tile;
    const tiles = this.rectTiles();
    this.rectStart = this.rectEnd = null;
    this.runner.send({ type: 'paintFloor', tiles, tool: ui.state.build.floorTool });
    return true;
  }

  private rectTiles(): Tile[] {
    const a = this.rectStart!;
    const b = this.rectEnd!;
    const out: Tile[] = [];
    for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) {
      for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) out.push({ x, y });
    }
    return out;
  }

  click(tile: Tile): void {
    const b = ui.state.build;
    const s = this.runner.state;
    switch (b.tool) {
      case 'place':
        if (b.placeType) this.runner.send({ type: 'buyObject', objectType: b.placeType, x: tile.x, y: tile.y, rot: b.rot });
        break;
      case 'sell': {
        const o = objectAtTile(s, tile.x, tile.y);
        if (o) this.runner.send({ type: 'sellObject', id: o.id });
        break;
      }
      case 'select': {
        if (b.moving) {
          const o = s.objects[b.moving];
          if (o && !placementError(s, o.type, tile.x, tile.y, b.rot, o.id)) {
            this.runner.send({ type: 'moveObject', id: o.id, x: tile.x, y: tile.y, rot: b.rot });
            ui.setBuild({ moving: null });
          }
        } else {
          const o = objectAtTile(s, tile.x, tile.y);
          if (o) ui.setBuild({ moving: o.id, rot: o.rot });
        }
        break;
      }
      case 'floor':
        break;
    }
  }

  /** Overlays drawn every frame while in build mode. */
  draw(g: Phaser.GameObjects.Graphics, s: GameState, hover: Tile | null): void {
    const b = ui.state.build;

    // Work tiles of every object, so the player sees where staff will stand.
    for (const o of Object.values(s.objects)) {
      if (stationDef(o.type).walkable || o.id === b.moving) continue;
      for (const t of workTiles(o)) {
        g.lineStyle(1, 0x93c47d, 0.8);
        g.strokeRect(t.x * TILE + 9, t.y * TILE + 9, TILE - 18, TILE - 18);
      }
    }
    // Chokepoints: work tiles that are the only path between two areas.
    if (this.choke.version !== s.layoutVersion) this.choke = { version: s.layoutVersion, list: chokepointWorkTiles(s) };
    for (const c of this.choke.list) {
      g.fillStyle(0xe06666, 0.45);
      g.fillRect(c.tile.x * TILE + 2, c.tile.y * TILE + 2, TILE - 4, TILE - 4);
      this.scene.label(`choke:${c.tile.x},${c.tile.y}`, c.tile.x * TILE + TILE / 2, c.tile.y * TILE + TILE / 2, '!', {
        fontStyle: 'bold',
        color: '#ffffff',
      });
    }
    // Problems that blocked leaving build mode.
    for (const p of b.problems.length ? validateLayout(s) : []) {
      const x = p.tile.x * TILE;
      const y = p.tile.y * TILE;
      g.lineStyle(3, 0xff0000, 1);
      g.lineBetween(x + 6, y + 6, x + TILE - 6, y + TILE - 6);
      g.lineBetween(x + TILE - 6, y + 6, x + 6, y + TILE - 6);
    }

    this.drawRoute(g, s);

    if (!hover) return;
    if (b.tool === 'floor') {
      const tiles = this.rectStart ? this.rectTiles() : [hover];
      let cost = 0;
      for (const t of tiles) {
        const c = floorTileCost(s, t, b.floorTool);
        if (c === null) continue;
        cost += c;
        g.fillStyle(b.floorTool === 'wall' ? 0x000000 : 0xffffff, 0.25);
        g.fillRect(t.x * TILE, t.y * TILE, TILE, TILE);
      }
      const last = this.rectEnd ?? hover;
      if (cost > 0) this.scene.label('floorcost', last.x * TILE + TILE / 2, last.y * TILE - 6, `$${cost}`, { backgroundColor: '#000000aa', padding: { x: 3, y: 1 } });
      return;
    }
    if (b.tool === 'sell') {
      const o = objectAtTile(s, hover.x, hover.y);
      if (o) {
        g.lineStyle(2, 0xe06666, 1);
        for (const t of footprint(o)) g.strokeRect(t.x * TILE + 1, t.y * TILE + 1, TILE - 2, TILE - 2);
        this.scene.label('sellcost', o.x * TILE + TILE / 2, o.y * TILE - 6, `Sell +$${Math.floor(stationDef(o.type).cost / 2)}`, {
          backgroundColor: '#000000aa',
          padding: { x: 3, y: 1 },
        });
      }
      return;
    }
    const type = b.tool === 'place' ? b.placeType : b.moving ? s.objects[b.moving]?.type : null;
    if (type) this.drawGhost(g, s, type, hover, b.moving);
  }

  private drawGhost(g: Phaser.GameObjects.Graphics, s: GameState, type: string, at: Tile, movingId: Id | null): void {
    const b = ui.state.build;
    const probe = { type, x: at.x, y: at.y, rot: b.rot };
    const err = placementError(s, type, at.x, at.y, b.rot, movingId);
    const color = err ? 0xe06666 : 0x93c47d;
    const def = stationDef(type);
    for (const t of footprint(probe)) {
      g.fillStyle(def.color, 0.55);
      g.fillRect(t.x * TILE + 2, t.y * TILE + 2, TILE - 4, TILE - 4);
      g.lineStyle(2, color, 1);
      g.strokeRect(t.x * TILE + 1, t.y * TILE + 1, TILE - 2, TILE - 2);
    }
    if (!def.walkable) {
      for (const t of workTiles(probe)) {
        g.fillStyle(color, 0.35);
        g.fillRect(t.x * TILE + 8, t.y * TILE + 8, TILE - 16, TILE - 16);
      }
    }
    const text = err ?? (movingId ? 'Click to drop · R rotates' : `$${def.cost} · R rotates`);
    this.scene.label('ghost', at.x * TILE + TILE / 2, at.y * TILE - 8, text, {
      backgroundColor: err ? '#5a2626dd' : '#000000aa',
      padding: { x: 3, y: 1 },
    });
  }

  private drawRoute(g: Phaser.GameObjects.Graphics, s: GameState): void {
    const b = ui.state.build;
    if (!b.routeStation || !b.routeRecipe) return;
    const r = routePreview(s, b.routeStation, b.routeRecipe);
    r.legs.forEach((leg, i) => {
      const color = INGREDIENTS[leg.ingredient]?.color ?? 0xffffff;
      const off = (i - (r.legs.length - 1) / 2) * 3;
      g.lineStyle(2, color, 0.9);
      g.beginPath();
      leg.path.forEach((t, j) => {
        const x = t.x * TILE + TILE / 2 + off;
        const y = t.y * TILE + TILE / 2 + off;
        if (j === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.strokePath();
    });
  }
}
