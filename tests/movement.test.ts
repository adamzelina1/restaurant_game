import { describe, expect, it } from 'vitest';
import { moveAgents, setGoal, type AgentRef } from '../src/sim/agents/movement';
import { SQUEEZE_AFTER } from '../src/sim/constants';
import { emptyState, paintFloor } from '../src/sim/newGame';
import { rand } from '../src/sim/rng';
import { Floor, type GameState, type Mover } from '../src/sim/state';

function mover(x: number, y: number): Mover {
  return { x, y, step: null, goal: null, blocked: 0, detour: [] };
}

function agent(id: string, m: Mover, order: number, opts: Partial<AgentRef> = {}): AgentRef {
  return { id, m, speed: 2.5, order, canYield: false, canSwap: true, ...opts };
}

function run(s: GameState, agents: AgentRef[], seconds: number, onTick?: () => void): void {
  for (let i = 0; i < seconds * 10; i++) {
    moveAgents(s, agents, 0.1);
    onTick?.();
  }
}

const arrived = (m: Mover) => !!m.goal && !m.step && m.x === m.goal.x && m.y === m.goal.y;

describe('hard blocking', () => {
  it('never puts two agents on one tile', () => {
    const s = emptyState(12, 6, 3);
    paintFloor(s, Floor.Kitchen, 0, 0, 12, 6);
    const agents: AgentRef[] = [];
    for (let i = 0; i < 8; i++) {
      const m = mover(i, 0);
      setGoal(m, 11 - i, 5);
      agents.push(agent(`a${i}`, m, i));
    }
    run(s, agents, 20, () => {
      const seen = new Set<string>();
      for (const a of agents) {
        const k = `${a.m.x},${a.m.y}`;
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
    });
    expect(agents.every((a) => arrived(a.m))).toBe(true);
  });

  it('resolves a head-on meeting in a 1-tile corridor by squeezing past', () => {
    const s = emptyState(10, 1, 1);
    paintFloor(s, Floor.Kitchen, 0, 0, 10, 1);
    const a = mover(0, 0);
    const b = mover(9, 0);
    setGoal(a, 9, 0);
    setGoal(b, 0, 0);
    run(s, [agent('a', a, 0), agent('b', b, 1)], 15);
    expect(arrived(a)).toBe(true);
    expect(arrived(b)).toBe(true);
    // The jam was visible: someone spent time blocked.
    expect(Object.values(s.stats.blockedByTile).reduce((x, y) => x + y, 0)).toBeGreaterThan(SQUEEZE_AFTER - 0.2);
  });

  it('re-paths around a blocker when there is room', () => {
    const s = emptyState(10, 3, 1);
    paintFloor(s, Floor.Kitchen, 0, 0, 10, 3);
    const a = mover(0, 1);
    const wall = mover(5, 1); // stands still (working), can't be squeezed
    setGoal(a, 9, 1);
    run(s, [agent('a', a, 0), agent('w', wall, 1, { canSwap: false })], 8);
    expect(arrived(a)).toBe(true);
    expect(wall.x).toBe(5);
  });

  it('idle agents step aside', () => {
    const s = emptyState(10, 2, 1);
    paintFloor(s, Floor.Kitchen, 0, 0, 10, 2);
    const a = mover(0, 0);
    const idle = mover(5, 0);
    setGoal(a, 9, 0);
    run(s, [agent('a', a, 0), agent('i', idle, 1, { canYield: true })], 6);
    expect(arrived(a)).toBe(true);
  });

  it('stress: random crowds in a cramped room never deadlock', () => {
    for (let trial = 0; trial < 5; trial++) {
      const s = emptyState(9, 5, 100 + trial);
      paintFloor(s, Floor.Kitchen, 0, 0, 9, 5);
      // Pillars make corridors.
      for (const [x, y] of [[2, 1], [2, 3], [4, 2], [6, 1], [6, 3]]) s.grid.floor[y * 9 + x] = Floor.Wall;
      s.layoutVersion++;
      const free: [number, number][] = [];
      for (let y = 0; y < 5; y++) for (let x = 0; x < 9; x++) if (s.grid.floor[y * 9 + x] === Floor.Kitchen) free.push([x, y]);
      const shuffle = (arr: [number, number][]) => {
        const out = [...arr];
        for (let i = out.length - 1; i > 0; i--) {
          const j = Math.floor(rand(s) * (i + 1));
          [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
      };
      const starts = shuffle(free).slice(0, 7);
      const goals = shuffle(free).slice(0, 7);
      const agents = starts.map(([x, y], i) => {
        const m = mover(x, y);
        setGoal(m, goals[i][0], goals[i][1]);
        return agent(`a${i}`, m, i);
      });
      let maxBlocked = 0;
      run(s, agents, 60, () => {
        for (const a of agents) maxBlocked = Math.max(maxBlocked, a.m.blocked);
      });
      expect(agents.filter((a) => !arrived(a.m)).map((a) => a.id)).toEqual([]);
      expect(maxBlocked).toBeLessThan(SQUEEZE_AFTER + 2);
    }
  });
});
