# Restaurant game

Browser restaurant-management idle game (ChefVille meets RimWorld).

**The design source of truth is [PLAN.md](PLAN.md).** Read it before implementing anything.
Its §1 table lists every decision made so far; don't revisit those without asking.
Build in milestone order (PLAN.md §12), starting at M0.

## Key architecture rules

- Stack: Phaser 3 + TypeScript + Vite, Preact for the DOM overlay UI, Vitest for tests.
- `src/sim/` is pure TypeScript with **no Phaser or DOM imports**. It runs at a fixed
  10 ticks/sec and all state is one serializable `GameState` object.
- Phaser (`src/render/`) and Preact (`src/ui/`) only read state and send commands;
  they never mutate state directly.
- Game content (recipes, stations, traits, work types, equipment) lives in `src/data/`.
- Use the seeded RNG stored in state; never `Math.random()` inside the sim.
