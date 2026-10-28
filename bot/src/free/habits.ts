import type { E, Habit } from '../env';
import { getSettings } from '../store';
import { edit, esc, send, type Button } from '../tg';
import { local, nowSec } from '../time';
import { sendWithGif } from './gifs';

// free: daily tick-offs (ported from Jake's checklist, e.g. an inhaler). Habits live in settings; each one gets
// /<id>, typing its name ("inhaler", "took my inhaler"), a button on the morning message and a reminder at its time
// if it isn't ticked yet.

const hhmm = (tz: string, ts: number) => local(tz, new Date(ts * 1000)).hhmm;

export async function checkStatus(env: E, item: string, day?: string) {
  const s = await getSettings(env);
  const r = await env.DB.prepare(`SELECT ts FROM checks WHERE day = ? AND item = ?`).bind(day ?? local(s.tz).day, item).first<{ ts: number }>();
  return r ? { done: true, at: hhmm(s.tz, r.ts) } : { done: false, at: null as string | null };
}

const habit = async (env: E, id: string): Promise<Habit | undefined> => (await getSettings(env)).habits.find((h) => h.id === id);

export const tickButton = (h: Habit, keep = false): Button[][] => [[{ text: `✅ ${h.label} done`, data: `ck:${h.id}${keep ? ':n' : ''}` }]];

export async function tick(env: E, item: string) {
  const s = await getSettings(env);
  await env.DB.prepare(`INSERT OR IGNORE INTO checks (day, item, ts) VALUES (?, ?, ?)`).bind(local(s.tz).day, item, nowSec()).run();
  return checkStatus(env, item);
}

export async function untick(env: E, item: string) {
  const s = await getSettings(env);
  await env.DB.prepare(`DELETE FROM checks WHERE day = ? AND item = ?`).bind(local(s.tz).day, item).run();
}

/** /inhaler, or typing "inhaler" / "inhaler done" / "took my inhaler". */
export async function tickCommand(env: E, chat: number, id: string) {
  const h = await habit(env, id);
  if (!h) return;
  const st = await tick(env, id);
  return send(env, chat, `✅ <b>${esc(h.label)}</b> ticked off at ${st.at}.`, [[{ text: '↩️ Undo', data: `cx:${id}` }]]);
}

/** ck:<id> (edits the message) or ck:<id>:n (a button on the morning message: reply fresh so it stays). */
export async function tickTap(env: E, chat: number, msgId: number, val: string) {
  const [id, n] = val.split(':');
  if (n === 'n') return tickCommand(env, chat, id);
  const h = await habit(env, id);
  if (!h) return;
  const st = await tick(env, id);
  return edit(env, chat, msgId, `✅ <b>${esc(h.label)}</b> ticked off at ${st.at}.`, [[{ text: '↩️ Undo', data: `cx:${id}` }]]);
}

/** cx:<id>. */
export async function untickTap(env: E, chat: number, msgId: number, id: string) {
  const h = await habit(env, id);
  if (!h) return;
  await untick(env, id);
  return edit(env, chat, msgId, `↩️ ${esc(h.label)} unticked.`, tickButton(h));
}

/** "inhaler", "took my inhaler", "stretch done" → the habit id. */
export async function looksLikeTick(env: E, text: string) {
  const s = text.trim().toLowerCase().replace(/[.!]+$/, '');
  for (const h of (await getSettings(env)).habits) {
    const name = h.label.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    if (new RegExp(`^(took |had |used |done |did )?(my |the )?(${h.id}|${name})( done| taken)?$`).test(s)) return h.id;
  }
  return null;
}

/** Cron: at a habit's reminder time, nudge once if it isn't ticked yet. */
export async function habitReminder(env: E, chat: string | number, h: Habit) {
  if ((await checkStatus(env, h.id)).done) return;
  return sendWithGif(env, chat, 'nudge', `${h.icon} <b>${esc(h.label)}</b>: not ticked off yet today.`, tickButton(h));
}

/** Lines for /today: "🫁 Inhaler ✅ 08:12". */
export async function habitLines(env: E, day: string) {
  const s = await getSettings(env);
  const out: string[] = [];
  for (const h of s.habits) {
    const st = await checkStatus(env, h.id, day);
    out.push(`${h.icon} ${esc(h.label)} ${st.done ? `✅ ${st.at}` : '⬜ not yet'}`);
  }
  return out;
}
