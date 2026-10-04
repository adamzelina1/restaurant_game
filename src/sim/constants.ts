/** Simulation ticks per second. */
export const TICK_RATE = 10;
/** Seconds per tick. */
export const TICK_DT = 1 / TICK_RATE;

/** Base walk speed in tiles per second. */
export const BASE_WALK_SPEED = 2.5;
export const CARRY_CRATE_SPEED = 0.85;
export const CARRY_POT_SPEED = 0.7;

/** Seconds for simple hand actions. */
export const PICKUP_TIME = 1.0;
export const DROP_TIME = 0.5;
export const LOAD_TIME = 1.0;

// Blocking escalation (PLAN §3.3)
export const SIDESTEP_AFTER = 0.3;
export const REPATH_AFTER = 1.0;
export const SQUEEZE_AFTER = 3.0;
export const SQUEEZE_PENALTY = 1.5;
export const DETOUR_MAX_EXPANSIONS = 4000;

// Click speed-up (PLAN §4.6)
export const CLICK_FRACTION = 0.01;
export const CLICK_MIN_SECONDS = 1;
export const CLICK_CAP_FRACTION = 0.25;
export const HEAT_PER_CLICK = 10;
export const HEAT_MAX = 100;
export const HEAT_COOL_PER_SEC = 15;

// Quality (PLAN §4.7)
export const QUALITY_FLOOR = 0.4;
/** Ready batches hold full quality for max(this, 25% of cook time). */
export const READY_GRACE_MIN = 600;
export const READY_GRACE_FRACTION = 0.25;
/** Time constant (s) of the exponential decay toward the floor. */
export const QUALITY_DECAY_TAU = 2 * 3600;

/** Fraction of batch cost refunded when a batch is cancelled before cooking. */
export const CANCEL_REFUND = 0.5;

// Abstract buyers (replaced by real customers in FOH)
export const BUYER_INTERVAL = 15;
export const BASE_TIP_FRACTION = 0.25;

export const MAX_MESSAGES = 30;

// Staff (PLAN §5)
export const MAX_SKILL = 20;
/** XP multiplier by passion: none, minor, major. */
export const PASSION_XP = [0.35, 1.0, 1.5] as const;
/** Stamina drain multiplier while doing work you're passionate about. */
export const PASSION_DRAIN = [1, 0.85, 0.7] as const;
/** XP for loading a crate into a station, in seconds-of-work equivalent. */
export const LOAD_XP = 2;
export const STAMINA_MAX = 100;
/** Per second of active work at drainRate 1. */
export const STAMINA_DRAIN_WORK = 0.01;
/** Walking/carrying drains at this fraction of the work rate. */
export const STAMINA_WALK_FACTOR = 0.4;
/** Per second resting on a couch at recoverRate 1. */
export const STAMINA_RECOVER = 0.15;
/** Standing idle recovers at this fraction of the couch rate. */
export const STAMINA_IDLE_FACTOR = 0.25;
/** Coffee machines in the staff room add this much recovery each (max 2). */
export const COFFEE_BOOST = 0.5;
export const COFFEE_RANGE = 6;
/** Below this, staff take a break after their current task. */
export const BREAK_AT = 30;
/** Below this, staff are slowed (avoids starvation when the staff room is full). */
export const EXHAUSTED_AT = 15;
export const EXHAUSTED_SPEED = 0.75;

// Hiring (PLAN §5.4)
export const HIRING_REFRESH = 6 * 3600;
export const HIRING_REFRESH_COST = 50;
/** Signing fee in hours of wage. */
export const SIGNING_HOURS = 5;
