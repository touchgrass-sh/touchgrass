import { DEFAULT_SETTINGS, type E, type Settings } from './env';
import { nowSec } from './time';
import { custom } from './custom';

export async function getState(env: E, key: string): Promise<string | null> {
  const r = await env.DB.prepare(`SELECT value FROM state WHERE key = ?`).bind(key).first<{ value: string }>();
  return r?.value ?? null;
}

export async function setState(env: E, key: string, value: string) {
  await env.DB.prepare(`INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .bind(key, value).run();
}

export async function delState(env: E, key: string) {
  await env.DB.prepare(`DELETE FROM state WHERE key = ?`).bind(key).run();
}

// "Type your answer" prompts (a name, a timezone, a meal fix). They expire after 15 minutes, so a forgotten
// prompt can't swallow a message sent much later.
const AWAIT_TTL = 15 * 60;

export const setAwaiting = (env: E, what: string) => setState(env, 'awaiting', `${what}@${nowSec()}`);

/** The prompt waiting for an answer, or null if there isn't one (or it went stale). */
export async function getAwaiting(env: E): Promise<string | null> {
  const raw = await getState(env, 'awaiting');
  if (!raw) return null;
  const at = raw.lastIndexOf('@');
  if (at < 0 || nowSec() - Number(raw.slice(at + 1)) > AWAIT_TTL) {
    await delState(env, 'awaiting');
    return null;
  }
  return raw.slice(0, at);
}

export async function getSettings(env: E): Promise<Settings> {
  const raw = await getState(env, 'settings');
  return { ...DEFAULT_SETTINGS, ...custom.defaults, ...(raw ? JSON.parse(raw) : {}) };
}

export async function saveSettings(env: E, patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings(env)), ...patch };
  await setState(env, 'settings', JSON.stringify(next));
  return next;
}

/** Telegram user id of the owner, or null before the first /start. */
export async function getOwner(env: E): Promise<number | null> {
  const v = await getState(env, 'owner');
  return v ? Number(v) : null;
}

/**
 * Claim the bot for `userId` if nobody owns it yet. Atomic, so two people racing /start can't both win.
 * Returns true if `userId` is (now) the owner.
 */
export async function claimOwner(env: E, userId: number): Promise<boolean> {
  await env.DB.prepare(`INSERT OR IGNORE INTO state (key, value) VALUES ('owner', ?)`).bind(String(userId)).run();
  return (await getOwner(env)) === userId;
}

/** True the first time a key is seen; used to make scheduled messages fire once. */
export async function once(env: E, key: string): Promise<boolean> {
  const r = await env.DB.prepare(`INSERT OR IGNORE INTO sent (key, ts) VALUES (?, ?)`).bind(key, nowSec()).run();
  return (r.meta.changes ?? 0) > 0;
}
