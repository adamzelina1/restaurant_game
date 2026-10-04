# Restaurant Manager: Game Plan (draft v4)

A browser restaurant-management idle game: **ChefVille meets RimWorld**.

- **From ChefVille:** the player clicks a station and picks a recipe. Short recipes
  earn more per hour but need you to keep coming back; long recipes (up to 12h)
  keep the restaurant stocked while you're away. When a batch is done, you click
  it to serve it to the counter, and customers order from what's in stock.
- **From RimWorld:** the actual work (fetching, chopping, loading, plating,
  serving, bussing, dishwashing) is done by hired staff with skills, passions and
  a work-priority grid, walking around a top-down restaurant whose layout you design.
- **One room, like ChefVille:** kitchen and seating share a single room, so every
  tile is a trade-off between cooking space and seats.

---

## 0. Implementation status (handoff)

**Read this first if you're picking the project up.** Milestones M0–M5 are built,
tested and pushed (`main` on github.com/adamzelina1/restaurant_game). M6–M9 remain.

### Done

| # | What exists | Where |
|---|---|---|
| M0 | Vite + TS + Phaser 3 + Preact + Vitest scaffold; fixed 10 Hz tick loop with accumulator and background-tab catch-up; command queue; seeded RNG in state; localStorage saves (two rotating slots, export/import base64, versioned migrations) | `src/main.ts`, `src/game/runner.ts`, `src/save/` |
| M1–M2 | Batch cooking end to end: recipe picker, per-crate fetch → prep → load tasks, passive and active cooking, READY → click to serve → urgent carry to a counter, click speed-up with heat + 25% cap, quality with grace/decay; task board with work types, priority tiers, chaining and reservations; 8-dir movement on cached distance fields with hard blocking (reserve, sidestep, wait, local A*, squeeze-past) and idle spots; all 6 recipes and their stations | `src/sim/production`, `tasks`, `agents`, `grid` |
| M3 | Skills 0–20 with XP and passion multipliers, data-driven traits, hiring board (reputation-scaled, passion-biased), signing fee, fire, wages charged only while open, priority grid UI with presets and column setting | `src/sim/staff`, `src/ui/StaffPanel.tsx`, `HiringPanel.tsx` |
| M4 | Build mode (pauses the sim): buy/move/rotate/sell with ghost preview, drag-rectangle floor/wall painting, busy objects locked, exit validation with red markers, work-tile display, chokepoint warnings (articulation points), route preview with walking time, walking/blocking heatmaps | `src/sim/build`, `src/render/BuildMode.ts`, `src/ui/BuildPanel.tsx` |
| M5 | Guests as blocking agents: parties arrive through the entrance, queue on spots near the host stand, sit, browse, order (reserving counter servings), get food plated at the pass and served, eat, pay + tip, leave; patience per phase, angry leaving, satisfaction (waits, quality incl. plating bonus, decor), rolling star reputation driving traffic and applicants; open while stock or guests remain | `src/sim/foh`, `src/sim/reputation` |
| Redesign | One shared room (single floor type) and **no stamina / breaks / staff room** (see §1). Save format v4 migrates older saves | `src/save/migrations.ts` |

Tooling: `npm test` (Vitest, ~46 tests incl. determinism, save round-trip and an
architecture guard that `src/sim` has no Phaser/DOM/`Math.random`),
`npm run headless -- balance|stress|bench` (bot-played balance report, blocking
stress test, ticks/s). See CLAUDE.md for commands.

### Still to do

1. **M6 – FOH phase 2:** tables left dirty after guests leave, `Bus` task
   (carry dishes to the dish pit), dish pit station + `Dishes` task, a clean-plate
   stock that plating consumes (plating stalls when it runs out). The `Bus` and
   `Dishes` work types, priority-grid columns, presets and the Prima Donna trait
   already exist; there are just no tasks for them yet. Table state lives in
   `PlacedObject.table`; add a `dirty` flag there and block seating until bussed.
2. **M7 – Progression:** recipe unlocks (money + star gate; data already in
   `recipes.ts` `unlock`; `state.unlockedRecipes` currently starts with *all*
   recipes, so gate it and add a recipe-book UI), mastery stars (`recipe.mastery`
   thresholds exist, nothing tracks progress yet; count batches in the carry-to-
   counter completion in `tasks/execute.ts`), equipment tiers (`PlacedObject.tier`
   and `tierSpeed` / `tierServings` exist in `production/batches.ts`; add an
   upgrade command, cost data in `src/data/equipment.ts`, star gates).
3. **M8 – Idle features:** replace the placeholder `offlineCatchUp` in
   `src/sim/offline/offline.ts` (it currently runs the full tick sim, ~50k
   ticks/s, capped at 24h, so a long absence can take ~30s) with the coarse
   event model of §9; needs rolling online stats (service capacity, average
   tip/quality), which aren't tracked yet. Welcome-back report, tab-title badge +
   optional browser notification when a batch is READY. Save migrations and
   export/import already exist.
4. **M9 – Polish:** art pass (sprite keys are not data-driven yet; everything is
   drawn with Phaser Graphics in `WorldScene.ts`), sound, juice, balance tuning
   with the headless runner (all numbers in `src/sim/constants.ts` and
   `src/data/*` are first guesses), and UI polish (the HUD wraps on narrow windows).

### Deviations from the original plan (intentional, keep unless asked)

- Moving a prepped crate from the prep station to the cooking station is a
  **Cook** task (`deliver` with workType Cook), not Haul. Raw fetches are Haul. The
  employee who preps usually chains straight into it.
- Tables carry their own chairs (`seats` in the station def). Seating is
  automatic; there's no host *employee*. The host stand is just where guests queue.
- The pass has two work tiles: kitchen side (plating) and dining side (pickup).
- Customers choose dishes when the order is taken; each choice reserves a counter
  serving (`counter.reserved`) so stock can't be double-sold.
- Walls are painted with the floor tool rather than placed as objects; there are
  no doors (the room is open).

### Gotchas for the next agent

- The in-app browser pane stops `requestAnimationFrame` while hidden, so the sim
  doesn't tick then; the runner catches up on return. Don't mistake it for a freeze.
- Object lists are cached per `layoutVersion` (`allObjects` / `objectsOfKind` in
  `grid.ts`). Any code that adds or removes objects must bump `layoutVersion`.
- `STATE_VERSION` is in `src/sim/newGame.ts`; any change to the `GameState` shape
  needs a migration in `src/save/migrations.ts` and a test in `tests/save.test.ts`.
- On this Windows machine, bash heredocs with non-ASCII characters fail; write
  scripts to files instead.

---

## 1. Decisions so far

| Area | Decision |
|---|---|
| Engine | **Phaser 3 + TypeScript**, built with Vite, tested with Vitest |
| Architecture | **Pure TS simulation, Phaser only renders** |
| View | **Top-down tile grid** |
| Persistence | **localStorage only**, plus export/import save string |
| Production model | **Batch cooking (ChefVille-style)**: player picks a recipe per station; a batch yields N servings |
| What to cook next | **Player picks every batch.** No queue, no auto-repeat; an idle station stays idle |
| Finished batch | **Player must click to serve** it onto a serving counter |
| Offline progress | **Event-based catch-up**: batches finish on schedule, and counter stock sells down at the expected demand rate (§9) |
| Staff model | **One employee type** for kitchen and front of house; every hire can do any job |
| Work assignment | **RimWorld priority grid** (employee × work type, priority 1–4 or off), plus one-click presets |
| Recipes | **Batch recipes**: a prep task graph (fetch, chop… in parallel) → load → cook → done; defined as data |
| Front of house | **Full FOH**: customers, tables, order taking, plating, serving, bussing, dishwashing |
| Ordering | **An employee takes the order at the table**; customers choose from dishes in stock |
| Active play | **Click to speed up** cooking, with a heat meter and a per-batch cap (§4.6) |
| Staff stats | **Skills (0–20, level with use) + passions + traits**; no stamina or breaks |
| Ingredients | **Unlimited supply, paid when a batch starts**; staff still walk to the fridge/pantry |
| Layout | **One shared room** (ChefVille-style): kitchen and seating use the same floor; free grid build mode, buy floor tiles to expand |
| Movement | **8-directional grid movement, drawn smoothly**; diagonals cost √2, no corner cutting |
| Collision | **Hard blocking**: one agent per tile; staff block each other, so layout and modularity matter (§3) |
| Batch size vs walking | **Prep scales with batch size**: ingredients come in crates, one trip and one prep step per crate |
| Station adjacency | **Walking only**; adjacency matters only because it means a short distance |
| Time | **Always open while stocked**; **flat traffic** (no rush hours) |
| Serve click | **Staff carry the batch to a counter** as an urgent task after the click |
| Customer blocking | **Customers block and are blocked** by the same rules as staff |
| Recipe mastery | **Yes**: 5 mastery stars per recipe with stacking bonuses (§7.1) |
| Progression | **Recipe unlocks, reputation/stars, equipment tiers** (no prestige for now) |
| Unserved batch | **Grace window, then gradual quality loss**; food is never destroyed |
| Dish quality | **Yes**: skill + equipment + traits + freshness → quality → tips & satisfaction |
| Panel UI | **DOM overlay with Preact** over the Phaser canvas |
| Game speed | **Pause + 1× only** for players; fast-forward exists in dev builds only |
| Art | **Placeholders first**, then a CC0/paid top-down asset pack |
| Not included | **No mood/thoughts, social relationships, backstories, random events, stamina or staff room** |

---

## 2. Architecture

### 2.1 Layering

```
┌────────────────────────────────────────────────────────┐
│ UI layer (Preact DOM overlay: HUD, panels)             │
├────────────────────────────────────────────────────────┤
│ Render layer (Phaser scenes) — reads state, sends      │
│                                 commands, never mutates │
├────────────────────────────────────────────────────────┤
│ Command queue (player intents: startBatch, serve, hire…)│
├────────────────────────────────────────────────────────┤
│ Simulation (pure TS, no Phaser imports)                │
│   step(state, dt) at a fixed 10 ticks/sec              │
│   offlineCatchUp(state, elapsed): coarse event model   │
├────────────────────────────────────────────────────────┤
│ Data (recipes, stations, work types, traits, tiers)    │
└────────────────────────────────────────────────────────┘
```

- **All game state is one serializable plain object** (`GameState`), with entities
  stored in `Record<id, Entity>` maps. That makes saving a plain `JSON.stringify`
  plus a version number.
- **Systems are plain functions** run in a fixed order each tick:
  `customers (spawn, seat, patience, eat, pay) → taskGeneration → employees (claim
  + act) → stations (batch progress) → counters (freshness) → economy →
  reputation → stats`.
- **Seeded RNG** is stored in the state, so a run is deterministic and replayable,
  which makes bugs and balance runs reproducible.
- **Render interpolation:** Phaser renders at 60fps and interpolates positions
  between the previous and current sim ticks.
- **The player never mutates state directly.** Clicks become commands
  (`{type:'startBatch', stationId, recipeId}`, `{type:'serveBatch', stationId}`,
  `{type:'speedUp', stationId}`) that the sim consumes at the start of the next
  tick.

### 2.2 Folder layout

```
src/
  main.ts                 # boot: load save, offline catch-up, Phaser + Preact, autosave
  game/runner.ts          # owns GameState, fixed-tick accumulator, command queue
  sim/                    # pure TS, no Phaser/DOM
    state.ts  step.ts  commands.ts  newGame.ts  constants.ts  rng.ts  util.ts
    skills.ts  quality.ts
    grid/                 # tiles, footprints/rotation, cached layout + distance fields, A*
    agents/               # movement (blocking + escalation), employee decide/after-move
    tasks/                # task board (create/refresh/pick/claim), task scripts, toils
    production/           # batches: start, cancel, cook, ready, serve request
    stations/             # click speed-up, heat
    counters/             # stock, reservations, freshness
    foh/                  # guests: arrivals, parties, seating, service scripts
    staff/                # traits, XP/wages, hiring
    economy/              # wages, demand (variety)
    reputation/
    build/                # placement rules, floor painting, layout analysis
    offline/              # catch-up (placeholder until M8)
  data/                   # recipes, stations, ingredients, traits, work types/presets, names, starter layout, build palette
  render/                 # WorldScene (all drawing + input), BuildMode controller
  ui/                     # Preact HUD and panels, UI-only store
  save/                   # save slots, export/import, migrations
tools/                    # headless.ts (balance/stress/bench), bot.ts (scripted player)
tests/
```

### 2.3 Game loop and background tabs

- Accumulator loop: `acc += realDelta * gameSpeed; while (acc >= TICK) step()`.
  Players only get pause and 1×. Dev builds expose 2×–64× for testing.
- Browsers throttle background tabs. On every frame, measure the real elapsed time:
  - **< 60 s gap:** catch up by running ticks (capped per frame to avoid freezing).
  - **≥ 60 s gap:** run `offlineCatchUp` (§9) instead of simulating tick by tick.

---

## 3. Grid, movement and blocking

Movement is one of the main optimization axes. Distance costs time, and because
staff physically block each other, **where people stand while working** matters
as much as how far they walk. A good kitchen is made of compact, modular "cells"
whose work tiles sit off the main walkways.

### 3.1 Grid and objects

- Tile grid (e.g. 32 px tiles). Each tile has a floor type and an optional placed
  object. Objects occupy 1×1 or N×M tiles and are not walkable.
- Each object has one or more **work tiles**: the walkable tile where an agent
  stands to use it, shown in build mode.
- **An agent using a station occupies its work tile for the whole step.** A cook
  dicing 10 crates of carrots stands there for minutes. If that work tile is also
  the only route to the fridge, everyone queues behind them. This is the core
  reason placement matters.

### 3.2 Movement

- **8-directional** steps between tile centers, drawn as smooth motion (with
  interpolation). Diagonal steps cost √2, and a diagonal is only allowed when both
  orthogonal neighbors are free of obstacles (no corner cutting).
- Base speed ≈ 2.5 tiles/s × `walkSpeed` × trait modifiers. Carrying a crate is
  ×0.85.
- **Distance fields:** for each work tile, a precomputed BFS distance map over the
  static layout (ignoring agents). These are used for:
  - O(1) distance estimates in task scoring.
  - Choosing the next step: move to the free neighbor with the lowest distance.
  - Recomputed only when the layout changes.

### 3.3 Hard blocking

- **One agent per tile.** Before stepping, an agent must **reserve** the next
  tile. It holds both tiles while moving and releases the old one on arrival.
  Diagonal moves are also refused if both orthogonal tiles are occupied by agents,
  so nobody slips diagonally between two people.
- **Deterministic order:** agents move each tick in a fixed priority order (task
  urgency, then id), so results are reproducible.
- **When blocked**, an agent escalates:
  1. **Sidestep:** take another free neighbor with an equal or lower distance.
  2. **Wait** briefly (e.g. up to 1 s).
  3. **Re-path:** run a local A* that treats agents as temporary obstacles.
  4. **Squeeze past:** if still stuck after a timeout (e.g. 3 s), swap tiles
     with the blocker. This costs both of them a time penalty (e.g. 1.5 s each).

  Step 4 guarantees **no permanent deadlocks**, including head-on meetings in a
  1-tile corridor and 3+ agent cycles. Blocking stays expensive enough that the
  player sees it and fixes the layout.
- **Idle agents get out of the way:** idle staff walk to a
  designated **idle spot**, never stand in walkways, and step aside when a working
  agent requests their tile.
- **Customers** follow the same rules in the dining room. Seated customers sit on
  chair tiles, which aren't walkways.

### 3.4 Layout feedback

The player needs to *see* why a layout is bad:

- **Blocking heatmap:** an overlay of tiles where agents spent time waiting or
  squeezing.
- **Walking heatmap:** an overlay of tile traffic.
- **Per-employee time breakdown:** walking / working / **blocked** / idle /
  break.
- **Chokepoint warning in build mode:** work tiles that sit on the only path
  between two areas (articulation points of the walkable grid) are flagged in
  red.
- **Route preview in build mode:** pick a recipe to see the fridge → prep →
  station route and the estimated walking time per batch.

---

## 4. Production: batch cooking

### 4.1 The loop

```
 PLAYER clicks an idle station → recipe picker → picks a recipe (batch cost paid)
   │
   ▼
 STAFF  fetch ingredients ─→ prep steps (chop, mix… in parallel) ─→ load station
   │
   ▼
 STATION cooks (passive: minutes to 12h; a few short recipes are active and keep
   │      an employee at the station)
   ▼
 READY  "Ready!" bubble; the station is blocked until served
   │
   ▼
 PLAYER clicks the station → urgent "Carry batch" task
   │
   ▼
 STAFF  carry the pot to a free serving counter → becomes N servings
   │
   ▼
 CUSTOMERS order from counter stock → staff plate a serving → serve to the table
```

- **The player's decisions are what and when to cook.** Staff decide who does
  the work and how fast, based on skills, layout and the priority grid.
- **The serve click is still required** (ChefVille-style), but it creates a
  **"Carry batch"** Haul task with top urgency instead of teleporting the food.
  - The whole batch is one carry. A full pot is heavy (walk speed ×0.7).
  - The station is freed the moment the pot is picked up, so the player can
    start the next recipe right away.
  - A stove far from the counters costs time, and a heavy pot moving through a
    busy aisle causes jams. Counter placement is part of the layout puzzle.
- **No free serving counter = can't serve.** The carry task waits until a counter
  (or a counter already holding the same dish) is available, and the batch stays
  on the station meanwhile. Counters are a key purchase.
- **Cancel** a batch before cooking starts for a partial refund.

### 4.2 Stations (data-driven)

| Station | Skill | Used for |
|---|---|---|
| Fridge / Pantry | — | Ingredient source (Haul) |
| Cutting board | Prep | Prep steps: chop, slice |
| Mixing bench | Baking | Prep steps: dough, batter |
| Stove | Sauté | Short active recipes, pan dishes |
| Grill | Grill | Grilled batches |
| Deep fryer | Grill | Fried batches |
| Oven | Baking | Roasts, bakes, lasagna |
| Stock pot | Sauté | Soups, stews, stocks (long) |
| Serving counter | — | Holds one dish type's servings; customers' "menu" |
| Plating station / The Pass | Plating | A serving is plated here per order, then picked up to serve |
| Dish pit | — | Dishwashing (FOH loop) |

- **Cooking stations run one batch at a time** (a station = one pot, as in
  ChefVille).
- **Equipment tiers** add cook speed, quality and +% servings per batch.
- A counter can stack more of **the same dish**. Different dishes need different
  counters.

### 4.3 Recipes

```ts
type BatchRecipe = {
  id: string; name: string;
  station: StationType;
  cookTime: number;          // seconds of cooking at tier 1
  cookMode: 'passive' | 'active';
  servings: number;
  pricePerServing: number;
  batchCost: number;         // ingredients, paid on start
  ingredients: IngredientLine[];
  freshFor: number;          // seconds servings stay at full quality on the counter
  unlock: { cost: number; minStars: number };
};

type IngredientLine = {
  ingredient: IngredientId;  // beef, carrots, onions…
  crates: number;            // one fetch trip per crate
  prep?: { station: StationType; skill: Skill; timePerCrate: number }; // omitted = no prep
};
```

**Prep scales with batch size.** Each ingredient comes in **crates**. Every crate
is one fetch trip from the fridge/pantry, one prep step at a prep station (if
needed), and one carry to the cooking station. The task graph is generated per
crate, so a big batch becomes many small parallel tasks.

Example, **Beef Stew** (100 servings, 8h):

```
beef ×4:     fetch ─→ cube (board, 20s) ─→ carry to pot ─┐
carrots ×3:  fetch ─→ dice (board, 15s) ─→ carry to pot ─┼─→ all in → [cook 8h] → READY
onions ×3:   fetch ─→ dice (board, 15s) ─→ carry to pot ─┤
stock ×2:    fetch ──────────────────────→ carry to pot ─┘
```

That is 12 fetch trips, 10 prep steps and 12 carries. With one cook and a fridge
10 tiles from the board, walking alone is several minutes. With three cooks and a
tight layout it goes fast, but only if their work tiles and walking routes don't
cross. **More staff speeds up prep, and also creates more chances to block each
other.** Equipment-tier "+% servings" bonuses add servings without adding crates.

**Illustrative starter set:** short recipes earn more per station-hour, while
long recipes cover absences. Real numbers come from headless balance runs.

| Recipe | Station | Cook | Servings | $/serving | Batch $ | $/station-hour |
|---|---|---|---|---|---|---|
| Fried eggs (active) | Stove | 3 min | 6 | 5 | 30 | ~600 (but ties up a cook) |
| Pancakes | Stove | 15 min | 12 | 6 | 72 | ~290 |
| Burgers | Grill | 1 h | 30 | 8 | 240 | ~240 |
| Roast chicken | Oven | 4 h | 60 | 12 | 720 | ~180 |
| Beef stew | Stock pot | 8 h | 100 | 10 | 1000 | ~125 |
| Lasagna | Oven | 12 h | 140 | 11 | 1540 | ~128 |

Customer demand is the second limit. 100 servings of stew only pays off if
enough customers come to eat them before they lose freshness, which is exactly
the overnight use case.

### 4.4 Task board and work types

- Starting a batch instantiates its prep graph as tasks (`blocked → ready →
  claimed → in_progress → done`). Customers generate FOH tasks the same way.
- **Every task belongs to exactly one work type.** The work types are the columns
  of the priority grid (§5.2):

  | Work type | Tasks | Skill used |
  |---|---|---|
  | Cook | load stations, stand at active recipes | Grill / Sauté / Baking (per station) |
  | Prep | cutting board, mixing bench | Prep / Baking |
  | Plate | plate a serving from the counter onto a clean plate at the pass | Plating |
  | Take orders | walk to table, take order | Service |
  | Serve | carry plate from pass to table, bring check | Service |
  | Haul | fetch ingredients, carry items between stations, **carry finished batch to counter (urgent)** | — (walk speed) |
  | Bus | clear dirty tables, carry dishes to pit | — |
  | Dishes | wash at dish pit | — |

- **Selecting a task (RimWorld-style):** an idle employee looks at ready tasks in
  their **priority 1** work types first. They only look at priority 2 if nothing
  at priority 1 is available, and so on. Work types set to *off* are never done.
- Within a priority tier, the employee picks the best score:
  ```
  score = urgency (customer patience left / batch age)
        + skillLevel(task.skill) weight
        − distance(employee → item → station) weight
  ```
  This is softer than RimWorld's strict left-to-right column order.
- **Re-evaluation:** an employee only re-picks between tasks. They never abandon
  an active step mid-way (except to go on break, §5.3).
- Claiming a task **reserves** the station and item, so two employees can't target
  the same pot or plate.

### 4.5 Items in the world

- Employees carry **1 item**: one crate, one prepped crate, or one plate. Servers
  carry one plate at a time, so dining room distances count per serving.
- A cook who preps a crate normally carries it straight to the cooking station
  themselves (one chained task). If they're pulled away, the prepped crate sits in
  the prep station's output slot and becomes a Haul task.
- Cooking starts automatically once every crate has been loaded.

### 4.6 Click speed-up

- Clicking a station that is cooking (or a prep station mid-step) removes
  **1% of that step's base time** per click (minimum 1 s).
- **Per-batch cap:** clicks can remove at most **25%** of a batch's total time.
  This keeps an 8h stew from being clicked down to nothing.
- **Heat meter** paces clicks: +10 heat per click, max 100 (clicks do nothing at
  max), cools 15 heat/s.
- No quality penalty.
- Most of the value of active play comes from **chaining short recipes** and
  **serving promptly**. Clicking is the extra bonus on top.

### 4.7 Dish quality

- A batch's quality = `f(prep skill, cook skill, station tier, traits)`. It is
  shared by all of the batch's servings.
- **Waiting to be served:** a READY batch holds full quality for a grace window
  (scaled with cook time, e.g. 25% of it, min 10 min). After that it slowly
  degrades to a floor (e.g. 40%). Never destroyed.
- **On the counter:** servings stay fresh for `freshFor` (longer for long
  recipes), then slowly degrade to the same floor.
- **Plating** skill adds a small per-plate presentation bonus.
- **Effects:** price is fixed; quality scales the **tip** and the customer's
  **satisfaction**, which feeds reputation.

---

## 5. Staff

One employee type covers the kitchen and the dining room. What someone actually
does is decided by their skills, passions and the priority grid.

### 5.1 Skills, passions and traits

```ts
type Skill = 'Prep' | 'Grill' | 'Saute' | 'Baking' | 'Plating' | 'Service';
type Passion = 0 | 1 | 2;   // none, minor 🔥, major 🔥🔥

type Employee = {
  id; name; portraitSeed;
  skills: Record<Skill, { level: number /* 0–20 */; xp: number; passion: Passion }>;
  walkSpeed: number;
  traits: TraitId[];                                  // 0–2
  priorities: Record<WorkType, 0 | 1 | 2 | 3 | 4>;    // 0 = off
  wage: number;                                       // per hour
  state: EmployeeFSMState;
};
```

- **Skill levels 0–20,** as in RimWorld. XP needed per level grows with level.
- **Work speed** (prep, plating, serving) scales with skill level (e.g. level 0 =
  0.6×, level 10 = 1.0×, level 20 = 1.6×).
- **Cook skill** affects batch quality and, for active recipes, cook speed.
- **XP** is gained per second of work in that skill, multiplied by passion:

  | Passion | XP multiplier |
  |---|---|
  | None | 0.35× |
  | Minor 🔥 | 1.0× |
  | Major 🔥🔥 | 1.5× |

- **Wage** scales with total skill and passions, and rises slowly as an employee
  levels up.
- *(Optional, decide later)* RimWorld-style skill decay above level 10.
- **Traits** are data-driven modifiers, for example:
  - *Fast Walker* (+25% walk speed)
  - *Grill Master* (+30% Grill speed and quality)
  - *Clumsy* (5% chance to drop a carried item)
  - *Perfectionist* (+quality, −10% speed)
  - *Mentor* (nearby staff gain +XP)
  - *Prima Donna* (refuses Dishes and Bus)
  - *Charming* (+Service, bigger tips)

### 5.2 Work priority grid

```
              Cook Prep Plate │ Orders Serve │ Haul Bus Dishes
Marco 🔥Grill   1    2    3   │   –      –   │  4    –    –
Ana   🔥🔥Svc    –    4    2   │   1      1   │  3    2    –
Joe   (new)     –    2    –   │   3      3   │  1    1    1
```

- Each cell is 1–4 or off. Click cycles through the values; a column header
  click sets the whole column.
- Cells show skill level and passion flames.
- **Presets** fill a row in one click: *Line Cook*, *Prep Cook*, *Waiter*,
  *Busser / Dishwasher*, *Jack of all trades*.
- **New hires get a preset** based on their best passions, so the restaurant
  works without the player ever opening the grid.

### 5.3 Stamina and breaks (dropped)

Removed by design decision: staff work without fatigue, and there is no staff room.

### 5.4 Hiring

- The hiring board shows 3–5 candidates and refreshes periodically (paid early
  refresh allowed).
- Candidates have visible skills, passions, traits and wage asks. Higher
  reputation brings better candidates.
- **Generation:** a skill-point budget (scaled by reputation), 1–3 passions, and
  skill points biased toward passions. This produces recognizable archetypes.
- Fire anytime. Wages are deducted only while the restaurant is open (§6).

---

## 6. Front of house (full)

Guests and staff share the one room: guests walk the same floor as the kitchen
staff and block each other, so where tables sit relative to the kitchen line and
the pass is part of the layout puzzle.

Customer lifecycle:

```
arrive → wait at host stand → seated at table → browse (few seconds)
→ an employee takes the order (picks a dish from counter stock)
→ Plate task: serving taken from counter, plated at the pass (needs a clean plate)
→ Serve task: carried to table → eat → pay + tip → leave
→ table left dirty → Bus → dishes to pit → Dishes → clean plate stock
```

- **Open / closed:** the restaurant is **open while any counter has stock**. When
  every counter is empty, no new customers arrive. Once the last guests leave, it
  closes: staff idle and **no wages are charged**. Running out of food costs you
  sales, not money.
- **Traffic is flat:** `spawnRate = base × reputationMult × varietyMult`, with
  small random variation in arrival gaps and party sizes. There are no rush
  hours. `varietyMult` grows with the number of different dishes in stock.
- **Customers physically block** staff and each other, using the same reservation
  and escalation rules as staff (§3.3). Aisle width and table spacing matter.
- **Dish choice:** customers pick from what's in stock, weighted by dish appeal
  and freshness.
- **Parties** of 1–4 need matching table sizes.
- **Patience** is a timer per phase (waiting to sit, to order, for food). When it
  runs out, the customer leaves, which costs reputation.
- **Satisfaction** = f(wait times, dish quality, plating, decor). It drives the
  tip and the reputation change.
- **Clean plates are a constrained resource.** If the dish pit falls behind,
  plating stalls.
- Placeable FOH objects: tables (2/4 seat), chairs, host stand, serving counters,
  decor (adds satisfaction), walls and doors.

FOH is built in two phases (see Milestones): first customers, tables, order
taking, plating, serving and payment; then dirty tables, bussing and dishwashing.

---

## 7. Economy and progression

- **Money in:** servings sold + tips.
- **Money out:** batch costs, wages (only while open), purchases (stations,
  counters, equipment tiers, furniture, floor tiles, recipe unlocks).
- **Reputation:** a rolling average of satisfaction, mapped to 1–5 stars.
  - It raises traffic and unlocks pricier recipes.
  - It gates equipment and improves hiring candidates.
- **Recipe book:** unlocked with money and star requirements. The player's
  "menu" is simply whatever is currently on the counters.
- **Equipment tiers:** each station has tiers 1–N adding cook speed, quality and
  +% servings.
- **Expansion:** buy floor tiles to grow the one room, and more
  serving counters.

### 7.1 Recipe mastery

- Each recipe has a **mastery bar**, filled by every batch served to a counter.
- **Thresholds are per recipe** and expressed in batches, scaled so mastering
  takes similar total cook time for short and long dishes (fried eggs needs many
  more batches than lasagna). Thresholds live in the recipe data.
- Five stars, with stacking bonuses (starting values):

  | Star | Bonus |
  |---|---|
  | ★1 | +10% servings per batch (no extra crates) |
  | ★2 | −10% cook time |
  | ★3 | +quality on every batch |
  | ★4 | +10% servings per batch |
  | ★5 | **Signature dish**: +10% price and extra customer appeal while it's on a counter |

- The recipe picker shows mastery progress, so "finish mastering the stew" becomes
  a short-term goal.

---

## 8. Build mode

- Toggling build mode **pauses the simulation**.
- Place, move, rotate and sell objects from a palette; ghost preview with validity
  coloring.
- A station can't be moved or sold while it has a batch in progress (or the batch
  is refunded).
- **Validation on exit:** every interaction tile must be reachable, and there must
  be a path from the entrance to each chair and the host stand, and every work
  tile (including both sides of the pass) must be reachable by staff.
  Invalid layouts are blocked with a highlight showing why.
- Exiting build mode recomputes distance fields; in-flight tasks are re-queued.

---

## 9. Offline progress: event-based catch-up

With batch cooking, offline progress no longer needs to guess. Production is
scheduled and sales are capped by stock, so `offlineCatchUp(state, elapsed)` steps
a **coarse model** forward in 10-minute chunks (no agents or pathfinding):

1. **Stations:** prep that was in progress completes at the measured staff
   throughput. Cooking batches finish at their known times, then **wait as READY**
   (the player must click to serve), with grace and quality decay applied.
2. **Counters:** each chunk sells
   `min(stock, demand(reputation, variety), serviceCapacity)` servings. Batches
   the player already clicked to serve are assumed delivered to the counter.
   - `serviceCapacity` = servings/min the staff actually achieved in the last
     online session (rolling stats).
   - Freshness decay is applied per chunk.
3. **Money:** sales × price + tips, using the average tip/quality measured
   online.
4. **Wages:** charged only for chunks while the restaurant was open (stock > 0).
5. **XP:** Service/Plating XP proportional to servings sold.
6. **Cap:** 24h. Beyond that, nothing more happens (counters will be empty long
   before that anyway).

A **"While you were away"** report shows servings sold per dish, money, batches
waiting to be served, and level-ups.

This gives the ChefVille rhythm: before leaving, fill the counters and start long
batches. While online, chain short recipes and serve promptly for more money per
hour.

---

## 10. Persistence

- `save = { version, savedAt, state }` is written to localStorage. `savedAt` drives
  the offline catch-up.
- **Autosave** every 30 s, on `visibilitychange` (hidden), and on `beforeunload`.
- **Migrations:** an ordered list of `vN → vN+1` functions.
- **Export/import:** a base64 save string.
- **Two rotating slots,** so a corrupted write can't destroy progress.

---

## 11. Rendering and UI

- **WorldScene** draws tiles, stations (with cook progress rings and a "Ready!"
  bubble), counters (with stock count), employees, customers and carried items.
  It is synced from state via an id → sprite map.
- **Station interactions:**
  - Click an idle station to open the **recipe picker**: time, servings, cost,
    $/hour, and freshness for each recipe.
  - Click a cooking station to speed it up.
  - Click a READY station to serve it (a "carrying…" indicator follows the pot).
- The recipe picker also shows each recipe's mastery stars and progress.
- **Panels** (recipe picker, hiring, staff priority grid, build palette, recipe
  book, stats, welcome-back report) are Preact components in a DOM overlay. They
  read a state snapshot published once per tick and dispatch commands.
- **Camera:** pan with drag or WASD, zoom with the wheel.
- **Overlays:** walking heatmap, blocking heatmap, station utilization (§3.4).
- **Notifications:** a tab title badge and an optional browser notification when
  a batch is ready (the "come back" hook).
- **Art:** placeholders first; sprite keys are data-driven so swapping art is a
  data change.

---

## 12. Milestones

| # | Milestone | Playable result | Status |
|---|---|---|---|
| M0 | Scaffold: Vite + TS + Phaser + Preact + Vitest, fixed-tick loop, grid render, command queue | Empty grid, ticking clock | ✅ done |
| M1 | 1 employee; fridge → cutting board → stove; 8-dir movement + distance fields; recipe picker; crate-based prep → load → cook → READY → click to serve → counter; abstract buyers deplete stock; click speed-up; basic save | The core ChefVille loop | ✅ done |
| M2 | Per-crate task graphs, work types + priority-tier selection (priorities set in code), multiple employees, **hard blocking + deadlock escalation + idle spots**, oven/grill/stock pot, 6 recipes from 3 min to 12 h | Parallel kitchen teamwork, with traffic jams | ✅ done |
| M3 | Skills 0–20 + XP + passions, traits, hiring board, wages, **priority grid UI + presets** (stamina + staff room dropped) | Staff management | ✅ done |
| M4 | Build mode: place/move/rotate, counters, floor expansion, reachability validation, work-tile display, chokepoint warnings, route preview, heatmaps | Layout optimization | ✅ done |
| M5 | FOH phase 1: customers (flat traffic, blocking), tables, open/closed, Take orders + Plate + Serve, Service skill, patience, tips, reputation | Full service loop | ✅ done |
| M6 | FOH phase 2: dirty tables, Bus + Dishes, dish pit, clean-plate stock | Second logistics puzzle | to do |
| M7 | Progression: recipe book unlocks, recipe mastery stars, equipment tiers, star-gated unlocks | Long-term goals | to do |
| M8 | Offline catch-up model, welcome-back report, ready notifications (save migrations and export/import already done) | True idle game | to do |
| M9 | Art pass, sound, juice, headless balance runs, tuning | Release candidate | to do |

The headless runner (`tools/headless.ts`) was built in M2. It:

- **To do (M8):** validate the offline model by comparing `offlineCatchUp` against
  a full tick simulation of the same period.
- **Stress-tests blocking:** it runs random layouts with many agents and asserts
  that no agent stays stuck longer than the squeeze-past timeout.

---

## 13. Open questions

- **Q7:** Name and theme (generic diner, Italian trattoria, multi-cuisine that
  unlocks over time).
