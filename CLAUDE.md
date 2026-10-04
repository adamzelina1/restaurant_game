# Restaurant game

Browser restaurant-management idle game (ChefVille meets RimWorld).

**The design source of truth is [PLAN.md](PLAN.md).** Read it before implementing anything.
Its §1 table lists every decision made so far; don't revisit those without asking.
The game is one shared room (kitchen + seating) with no stamina or staff room.
Build in milestone order (PLAN.md §12). M0–M5 are done; start with PLAN.md §0
(implementation status, remaining work, deviations, gotchas) and continue at M6.

## Key architecture rules

- Stack: Phaser 3 + TypeScript + Vite, Preact for the DOM overlay UI, Vitest for tests.
- `src/sim/` is pure TypeScript with **no Phaser or DOM imports**. It runs at a fixed
  10 ticks/sec and all state is one serializable `GameState` object.
- Phaser (`src/render/`) and Preact (`src/ui/`) only read state and send commands;
  they never mutate state directly.
- Game content (recipes, stations, traits, work types, equipment) lives in `src/data/`.
- Use the seeded RNG stored in state; never `Math.random()` inside the sim.

## Commands

- `npm run dev`: dev server on http://localhost:5173 (dev builds show 4×–64× speed buttons; `window.game` is the runner)
- `npm test`: Vitest (sim tests + an architecture guard for `src/sim`)
- `npm run typecheck`, `npm run build`
- `npm run headless -- balance [hours] [short|long|best]`: bot-played balance report
- `npm run headless -- stress [trials]`: blocking/deadlock stress test; `-- bench`: ticks/s
