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
/** XP for loading a crate into a station, in seconds-of-work equivalent. */
export const LOAD_XP = 2;

// Hiring (PLAN §5.4)
export const HIRING_REFRESH = 6 * 3600;
export const HIRING_REFRESH_COST = 50;
/** Signing fee in hours of wage. */
export const SIGNING_HOURS = 5;

// Front of house (PLAN §6)
export const PASS_CAPACITY = 4;
/** Seconds between parties at 1 star with one dish in stock. */
export const BASE_PARTY_INTERVAL = 75;
/** Parties waiting for a table beyond this turn away. */
export const MAX_WAITING_PARTIES = 3;
export const CUSTOMER_WALK_SPEED = 2.0;
export const BROWSE_TIME = 8;
/** Patience per phase, in seconds. */
export const PATIENCE_SEAT = 120;
export const PATIENCE_ORDER = 120;
export const PATIENCE_FOOD = 360;
export const EAT_TIME = 90;
export const ORDER_TIME_BASE = 3;
export const ORDER_TIME_PER_GUEST = 1.5;
export const PLATE_TIME = 4;
export const SERVE_TIME = 1;
/** Total waiting (seat + order + food) that drops the wait score to zero. */
export const WAIT_BUDGET = 360;
/** Reputation moves this fraction toward each guest's rating. */
export const REP_RATE = 0.03;
export const DECOR_RANGE = 6;
export const DECOR_BONUS = 0.03;
export const DECOR_MAX = 0.1;
/** Quality added by a level-20 plater. */
export const PLATING_BONUS_MAX = 0.1;

// Dishes (PLAN §6, FOH phase 2)
/** Plates a new restaurant owns. */
export const START_PLATES = 24;
export const PLATE_PACK = 10;
export const PLATE_PACK_COST = 25;
/** Clearing a table: base seconds plus seconds per plate. */
export const BUS_TIME_BASE = 2;
export const BUS_TIME_PER_PLATE = 0.75;
export const CARRY_DISHES_SPEED = 0.85;
/** Seconds to wash one plate at a tier-1 dish pit. */
export const WASH_TIME = 3;
/** Plates washed per Dishes task before the washer re-picks work. */
export const WASH_CHUNK = 8;

// Recipe mastery (PLAN §7.1), by star reached
export const MASTERY_SERVINGS_1 = 0.1;
export const MASTERY_COOK_MULT_2 = 0.9;
export const MASTERY_QUALITY_3 = 0.05;
export const MASTERY_SERVINGS_4 = 0.1;
/** ★5 signature dish: price and appeal multipliers. */
export const SIGNATURE_PRICE = 1.1;
export const SIGNATURE_APPEAL = 1.25;

// Offline progress (PLAN §9)
/** Longest absence that is caught up. */
export const OFFLINE_CAP = 24 * 3600;
/** Absences up to this long are simulated tick by tick (it's cheap and exact). */
export const OFFLINE_TICK_LIMIT = 600;
/** The coarse model steps in chunks of this many seconds. */
export const OFFLINE_CHUNK = 600;
/** Time constant (s) of the rolling labor-per-guest measurement. */
export const ROLLING_WINDOW = 3600;
/** Weight of each new guest / batch in the rolling averages. */
export const ROLLING_ALPHA = 0.05;
/** Share of their time front-of-house staff spend serving while you're away. */
export const OFFLINE_FOH_SHARE = 0.8;
/** Share of seats filled on average (parties don't fit tables exactly). */
export const OFFLINE_SEAT_FILL = 0.7;
export const ROLLING_DEFAULTS = {
  fohWork: 40 * 20,
  fohGuests: 20,
  seatTime: 160,
  satisfaction: 0.6,
  quality: 0.6,
  tipFrac: 0.2,
  loadPerCrate: 30,
};
