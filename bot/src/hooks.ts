import type { FoodItem } from './ai';
import type { E, Settings } from './env';
import { send, type Button } from './tg';
import { ADDONS } from './addons';
import { free } from './free';
import { has, type Plan } from './plan';

// The seam between the open-source core and the paid packs (BOT_SPEC §5). A pack is one `Addon` object listed
// in src/addons/index.ts; core calls these hooks and never imports pack code directly.

export interface AddonCommand {
  command: string; // without the slash
  description: string; // Telegram's command list
  help: string; // one /help line; '' = hidden alias (not in /help or the command list)
  run: (env: E, chat: number, text: string) => Promise<unknown>;
}

export interface Addon {
  plan: Plan;
  commands?: AddonCommand[];
  /** Callback-data prefix → handler. */
  buttons?: Record<string, (env: E, chat: number, msgId: number, val: string) => Promise<unknown>>;
  /** Runs before the core food-photo path. Return true if it handled the photo. */
  onPhoto?: (env: E, chat: number, photos: any[], caption: string) => Promise<boolean>;
  /** Runs before core's water/caffeine parsing. Return true if it handled the text. */
  onText?: (env: E, chat: number, text: string) => Promise<boolean>;
  /** Free text nothing else claimed (e.g. food or a question for the AI). Return true if handled. */
  onChat?: (env: E, chat: number, text: string) => Promise<boolean>;
  /** A text reply to one of the bot's messages. Return true if it handled it. */
  onReply?: (env: E, chat: number, replyTo: number, text: string) => Promise<boolean>;
  /** Extra /help lines that aren't commands (e.g. "send a food photo"). */
  helpLines?: string[];
  /** Scheduled messages /admin can fire on demand, by name. */
  reminders?: Record<string, (env: E, chat: string | number, s: Settings) => Promise<unknown>>;
  /** Shows the eating-window (fasting) step in onboarding and /settings. */
  fasting?: boolean;
  /** Extra lines under a meal card. */
  mealLines?: (items: FoodItem[]) => string[];
  todayLines?: (env: E, s: Settings, day: string) => Promise<string[]>;
  recapLines?: (env: E, s: Settings, day: string) => Promise<string[]>;
  onMoveDone?: (env: E, chat: number, s: Settings, streak: number) => Promise<unknown>;
  /** Extra data for the mini app dashboard, merged into GET /api/dash under the pack's own keys. */
  dash?: (env: E, s: Settings, day: string, view?: string) => Promise<Record<string, unknown>>;
  /** Mini app buttons: POST /api/dash { action } runs the matching handler. Return a short toast line. */
  dashActions?: Record<string, (env: E, body: any) => Promise<string>>;
  /** Send a core message with a topic GIF on top (sudo's reaction GIFs). Core falls back to plain text. */
  sendTagged?: (env: E, chat: number | string, tag: string, text: string, rows?: Button[][]) => Promise<unknown>;
  /** The pack sends its own morning message, so core skips its recap. */
  ownsMorning?: boolean;
  /** A forwarded GIF. Return true if handled. */
  onGif?: (env: E, chat: number, fileId: string) => Promise<boolean>;
  /** A /command no pack lists (e.g. one per habit). Return true if handled. */
  onCommand?: (env: E, chat: number, name: string, text: string) => Promise<boolean>;
  /** Extra HTTP routes (path → handler), e.g. an e-ink screen feed. */
  routes?: Record<string, (env: E, req: Request) => Promise<Response>>;
  /** Every minute, from the cron. */
  tick?: (env: E) => Promise<unknown>;
}

/** Paid commands, known to core so the free plan can answer them with one line instead of /help. */
export const LOCKED = ['eat', 'targets', 'deficit', 'ideas', 'breakfast', 'lunch', 'dinner', 'snack', 'kitchen', 'barcode', 'scan', 'snap'];
export const GATE = "⚡ that's a sudo feature (AI food logging) · touchgrass.sh";

/** What the free plan says to a photo or a message it has no use for. No AI on free. */
export const FREE_PHOTO = "📸 food photos and calorie tracking are a sudo feature · touchgrass.sh";
export const FREE_TEXT = "I'm not much of a chatter 🌱 I nudge you to move and log water, caffeine, weight and exercise. /help shows the rest";

/** The packs this bot runs: installed paid packs its plan unlocks first (their text handlers win), then free. */
export async function active(env: E): Promise<Addon[]> {
  const out: Addon[] = [];
  for (const a of ADDONS) if (await has(env, a.plan)) out.push(a);
  return [...out, free];
}

/** Collect lines from every active pack, never letting one broken pack break the core message. */
export async function lines(env: E, pick: (a: Addon) => Promise<string[]> | string[] | undefined) {
  const out: string[] = [];
  for (const a of await active(env)) {
    try {
      out.push(...((await pick(a)) ?? []));
    } catch (err) {
      console.warn('[addon] lines failed', err);
    }
  }
  return out;
}

/** A core message on a topic ('water'…): a pack may add a GIF, otherwise plain text. */
export async function sendTagged(env: E, chat: number | string, tag: string, text: string, rows?: Button[][]) {
  for (const a of await active(env)) if (a.sendTagged) return a.sendTagged(env, chat, tag, text, rows);
  return send(env, chat, text, rows);
}
