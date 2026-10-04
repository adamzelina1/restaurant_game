// All game state lives in one serializable plain object. No classes, no functions,
// no Maps/Sets: saving is JSON.stringify.

export type Id = string;

export type Skill = 'Prep' | 'Grill' | 'Saute' | 'Baking' | 'Plating' | 'Service';
export const SKILLS: readonly Skill[] = ['Prep', 'Grill', 'Saute', 'Baking', 'Plating', 'Service'];

export type WorkType = 'Cook' | 'Prep' | 'Plate' | 'Orders' | 'Serve' | 'Haul' | 'Bus' | 'Dishes';
export const WORK_TYPES: readonly WorkType[] = [
  'Cook', 'Prep', 'Plate', 'Orders', 'Serve', 'Haul', 'Bus', 'Dishes',
];

/** 0 = off, 1 = highest priority, 4 = lowest. */
export type Priority = 0 | 1 | 2 | 3 | 4;
export type Passion = 0 | 1 | 2;
export type Rot = 0 | 1 | 2 | 3;

export interface RngState {
  s: number;
}

/** One open room: every floor tile serves kitchen and dining alike. */
export const Floor = {
  Void: 0,
  Open: 1,
  Wall: 3,
} as const;
export type Floor = (typeof Floor)[keyof typeof Floor];

export interface Grid {
  width: number;
  height: number;
  /** Floor per tile, index = y * width + x. */
  floor: Floor[];
}

// ---------------------------------------------------------------------------
// Placed objects (stations, counters, idle spots…)

export interface CookSlot {
  batchId: Id | null;
}

export interface PrepSlot {
  /** Crate sitting on the board (raw, being prepped, or prepped and waiting). */
  crateId: Id | null;
  /** Task that is bringing a crate here. */
  reservedBy: Id | null;
}

export interface Lot {
  servings: number;
  /** Quality when it reached the counter (0–1). */
  quality: number;
  placedAt: number;
  freshFor: number;
}

export interface CounterSlot {
  recipeId: string | null;
  lots: Lot[];
  /** Carry tasks heading here. */
  incoming: Id[];
  /** Servings promised to guests who ordered but haven't been plated yet. */
  reserved: number;
}

export interface TableSlot {
  partyId: Id | null;
}

export interface PassSlot {
  /** Guests whose plated food is waiting on the pass. */
  plates: Id[];
  /** Plate tasks that will put a plate here. */
  incoming: Id[];
}

export interface PlacedObject {
  id: Id;
  type: string;
  x: number;
  y: number;
  rot: Rot;
  tier: number;
  cook?: CookSlot;
  prep?: PrepSlot;
  counter?: CounterSlot;
  table?: TableSlot;
  pass?: PassSlot;
}

// ---------------------------------------------------------------------------
// Production

export type BatchPhase = 'loading' | 'cooking' | 'ready' | 'carrying';

export type PotLoc =
  | { kind: 'station' }
  | { kind: 'carried'; by: Id }
  | { kind: 'floor'; x: number; y: number };

export interface Batch {
  id: Id;
  recipeId: string;
  stationId: Id;
  phase: BatchPhase;
  crates: Id[];
  cratesLoaded: number;
  /** Seconds of cooking needed (after tier/mastery modifiers). */
  cookTime: number;
  cookDone: number;
  /** Seconds removed by player clicks (counts toward completion). */
  clickRemoved: number;
  /** Max seconds clicks may remove from this batch. */
  clickCap: number;
  servings: number;
  /** Base quality fixed when cooking starts. */
  quality: number;
  /** Sum and count of prep skill levels used on its crates. */
  prepSkillSum: number;
  prepSkillCount: number;
  /** Sum and count of cook skill levels of whoever loaded / tended. */
  cookSkillSum: number;
  cookSkillCount: number;
  startedAt: number;
  readyAt: number | null;
  cost: number;
  pot: PotLoc;
  /** Set once the player clicked "serve". */
  serveRequested: boolean;
}

export type CrateLoc =
  | { kind: 'source' }
  | { kind: 'carried'; by: Id }
  | { kind: 'station'; id: Id }
  | { kind: 'floor'; x: number; y: number }
  | { kind: 'loaded' };

export interface Crate {
  id: Id;
  batchId: Id;
  ingredient: string;
  needsPrep: boolean;
  prepped: boolean;
  /** Station type that preps it, if any. */
  prepStation: string | null;
  prepSkill: Skill | null;
  prepTime: number;
  prepDone: number;
  clickRemoved: number;
  loc: CrateLoc;
}

// ---------------------------------------------------------------------------
// Tasks

export type TaskKind = 'deliver' | 'prep' | 'tend' | 'carryBatch' | 'takeOrder' | 'plate' | 'serve';
export type TaskStatus = 'blocked' | 'ready' | 'claimed';

export interface Task {
  id: Id;
  kind: TaskKind;
  workType: WorkType;
  status: TaskStatus;
  claimedBy: Id | null;
  createdAt: number;
  urgent: boolean;
  /** Kitchen tasks belong to a batch; front-of-house tasks to a party/guest. */
  batchId: Id | null;
  crateId: Id | null;
  partyId: Id | null;
  customerId: Id | null;
  /** Resolved on claim: where the item comes from / goes to. */
  sourceId: Id | null;
  targetId: Id | null;
}

// ---------------------------------------------------------------------------
// Agents

export interface Step {
  tx: number;
  ty: number;
  /** Seconds spent on this step so far. */
  t: number;
  dur: number;
}

export interface Mover {
  x: number;
  y: number;
  /** The step in progress, if any. While stepping the agent holds both tiles. */
  step: Step | null;
  goal: { x: number; y: number } | null;
  /** Seconds the agent has been unable to advance toward its goal. */
  blocked: number;
  /** Short detour computed by the local A* (tile indices, next first). */
  detour: number[];
}

export interface SkillState {
  level: number;
  xp: number;
  passion: Passion;
}

/** A plate's id is the guest it is for. */
export type Carry = { kind: 'crate'; id: Id } | { kind: 'pot'; id: Id } | { kind: 'plate'; id: Id };

export type Activity = 'idle' | 'walking' | 'working' | 'blocked';

export interface Employee extends Mover {
  id: Id;
  name: string;
  portraitSeed: number;
  color: number;
  skills: Record<Skill, SkillState>;
  walkSpeed: number;
  traits: string[];
  priorities: Record<WorkType, Priority>;
  wage: number;
  hiredAt: number;
  taskId: Id | null;
  /** Index of the current step inside the task's script. */
  toil: number;
  /** Seconds spent in the current toil (for timed actions). */
  toilTime: number;
  carrying: Carry | null;
  activity: Activity;
  /** Skill used by the work done this tick (for XP). */
  workingSkill: Skill | null;
  /** Lifetime seconds per activity, for the time breakdown. */
  time: Record<Activity, number>;
}

/** A hiring-board applicant: an employee who hasn't been placed in the world yet. */
export interface Candidate {
  name: string;
  color: number;
  skills: Record<Skill, SkillState>;
  traits: string[];
  walkSpeed: number;
  wage: number;
  presetId: string;
}

// ---------------------------------------------------------------------------
// Front of house

export type PartyPhase = 'queue' | 'seating' | 'browsing' | 'waitOrder' | 'waitFood' | 'eating' | 'leaving';

export interface Party {
  id: Id;
  size: number;
  members: Id[];
  /** Members still waiting outside to come through the entrance. */
  toSpawn: number;
  phase: PartyPhase;
  /** Seconds in the current phase (patience). */
  phaseTime: number;
  tableId: Id | null;
  color: number;
  angry: boolean;
  arrivedAt: number;
  seatedAt: number | null;
  readyToOrderAt: number | null;
  orderTakenAt: number | null;
}

export interface Customer extends Mover {
  id: Id;
  partyId: Id;
  seat: number | null;
  dish: string | null;
  /** Counter holding the serving reserved for this guest. */
  counterId: Id | null;
  plate: { quality: number; at: 'carried' | 'pass' | 'table'; passId: Id | null } | null;
  servedAt: number | null;
  servedBy: Id | null;
  eatLeft: number;
  satisfaction: number | null;
}

// ---------------------------------------------------------------------------

export interface Message {
  id: number;
  t: number;
  text: string;
  kind: 'info' | 'warn' | 'good';
}

export interface Stats {
  servingsSold: number;
  revenue: number;
  tips: number;
  spent: number;
  soldByRecipe: Record<string, number>;
  batchesServed: number;
  wagesPaid: number;
  customersServed: number;
  customersLost: number;
  /** Seconds agents spent blocked, per tile index (blocking heatmap). */
  blockedByTile: Record<number, number>;
  /** Steps taken onto each tile (walking heatmap). */
  trafficByTile: Record<number, number>;
}

export interface GameState {
  version: number;
  /** Ticks simulated since the start of the game. */
  tick: number;
  /** Seconds simulated since the start of the game (tick / TICK_RATE). */
  time: number;
  rng: RngState;
  nextId: number;
  money: number;
  /** Bumped whenever floor or objects change; invalidates distance fields. */
  layoutVersion: number;
  grid: Grid;
  objects: Record<Id, PlacedObject>;
  employees: Record<Id, Employee>;
  customers: Record<Id, Customer>;
  parties: Record<Id, Party>;
  batches: Record<Id, Batch>;
  crates: Record<Id, Crate>;
  tasks: Record<Id, Task>;
  /** Click speed-up heat meter, 0–100. */
  heat: number;
  /** Seconds until the next party arrives (while open). */
  nextPartyIn: number;
  unlockedRecipes: string[];
  /** Reputation in stars, 1–5 (continuous). */
  reputation: number;
  hiring: { candidates: Candidate[]; refreshAt: number };
  messages: Message[];
  nextMessageId: number;
  stats: Stats;
}
