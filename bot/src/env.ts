export interface E {
  DB: D1Database;
  AI: Ai;
  VISION_MODEL: string;
  TEXT_MODEL: string;
  /** "1" = public demo bot: many users, capped, no owner lock (BOT_SPEC §8). Not built yet. */
  DEMO?: string;
  /** "1" = our own test deployment: enables /admin (plan switcher, try-it buttons). Never set for buyers. */
  DEV?: string;
  // secrets
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  HOOK_KEY: string;
  /** Optional: the e-ink screen's polling key (GET /trmnl?key=…). No key, no screen feed. */
  TRMNL_KEY?: string;
}

export type Personality = 'buddy' | 'hype' | 'zen' | 'savage';
export type Level = 'easy' | 'normal' | 'spicy';

export interface Settings {
  /** What the bot calls itself. touchgrass is the project, not the mascot, so the owner names it. */
  name: string;
  personality: Personality;
  tz: string; // IANA, e.g. "Europe/London"
  hours_start: string; // "HH:MM" local, nudges allowed from
  hours_end: string;
  weekdays_only: boolean;
  level: Level;
  /** Eating window, both null = not fasting. */
  window_start: string | null;
  window_end: string | null;
  water_ml: number;
  cooldown_min: number;
  daily_cap: number;
  /** Agent must still be busy this long before a nudge. */
  wait_sec: number;
  /** sudo: daily targets set with /goal. null = no target. */
  kcal_target: number | null;
  protein_target: number | null;
  /** sudo: caffeine after this local time gets a sleep heads-up. */
  caffeine_cutoff: string;
  /** sudo: carbs and fat targets (flexible, shown as bars). null = none. */
  carbs_target: number | null;
  fat_target: number | null;
  /** sudo: body stats for the deficit estimate (Mifflin-St Jeor) and progress lines. null = not set. */
  start_weight: number | null;
  height_cm: number | null;
  age: number | null;
  sex: 'm' | 'f' | null;
  /** sudo: weight and waist milestones, highest first; the last one is the goal. Empty = none. */
  weight_goals: number[];
  waist_goals: number[];
  /** sudo: where calories come from, in order. AI estimates are always the last resort. */
  food_db: boolean; // CoFID, the UK government's food composition data (2,853 foods)
  food_saved: boolean; // products you scanned or photographed before
  food_off: boolean; // Open Food Facts, the barcode database (needs the network)
  /** sudo: where you shop, e.g. "Aldi UK". Helps photo guesses and meal ideas. '' = anywhere. */
  shop: string;
  /** sudo: morning message (yesterday's recap + today), "HH:MM" or null = at the start of nudge hours. */
  morning: string | null;
  /** sudo: daily mini exercise goal sent with the morning message. 0 = off. */
  goal_burpees: number;
  goal_skip_min: number;
  /** sudo: daily tick-offs, e.g. an inhaler. Each gets /<id>, a button and a reminder. */
  habits: Habit[];
  /** sudo: weather on the e-ink screen (Open-Meteo, no key). null = off. */
  weather_lat: number | null;
  weather_lon: number | null;
  /** sudo: which built-in reaction GIFs to send. GIFs the owner forwards (theme NULL) suit both. */
  gif_theme: 'light' | 'dark';
}

export interface Habit { id: string; label: string; icon: string; remind: string | null }

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  personality: 'buddy',
  tz: 'Europe/London',
  hours_start: '09:00',
  hours_end: '18:00',
  weekdays_only: true,
  level: 'normal',
  window_start: null,
  window_end: null,
  water_ml: 2000,
  cooldown_min: 20,
  daily_cap: 8,
  wait_sec: 60,
  kcal_target: null,
  protein_target: null,
  caffeine_cutoff: '14:00',
  carbs_target: null,
  fat_target: null,
  start_weight: null,
  height_cm: null,
  age: null,
  sex: null,
  weight_goals: [],
  waist_goals: [],
  food_db: true,
  food_saved: true,
  food_off: true,
  shop: '',
  morning: null,
  goal_burpees: 0,
  goal_skip_min: 0,
  habits: [],
  weather_lat: null,
  weather_lon: null,
  gif_theme: 'light',
};
