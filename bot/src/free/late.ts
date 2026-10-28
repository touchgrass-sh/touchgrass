import type { E } from '../env';
import { delState, getSettings, getState, setState } from '../store';
import { edit, send, type Button } from '../tg';
import { local, toMins } from '../time';
import { addDays, effective } from './days';

// free: one-off "eating late tonight" (ported from Jake's late.ts). Pushes today's window end later; tomorrow starts
// at the normal time. Capped at 23:55 so it never crosses midnight. 3+ late nights in a week → suggests a later window.

const STEPS = [60, 90, 120, 150];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const label = (m: number) => (m % 60 ? `+${Math.floor(m / 60)}½h` : `+${m / 60}h`);

async function lateDaysThisWeek(env: E, day: string) {
  const log: string[] = JSON.parse((await getState(env, 'late_log')) ?? '[]');
  return log.filter((d) => d >= addDays(day, -6));
}

export async function lateMenu(env: E, chat: number, msgId?: number) {
  const s = await effective(env);
  if (!s.window_end) return send(env, chat, 'No eating window set. Add one in the app → Settings.');
  const base = toMins(s.normal_end ?? s.window_end);
  const rows: Button[][] = [STEPS.filter((m) => base + m < 24 * 60).map((m) => ({ text: `${label(m)} (${hhmm(base + m)})`, data: `lx:${base + m}` }))];
  if (s.late) rows.push([{ text: `↩️ Back to ${s.normal_end}`, data: 'lc:' }]);
  const text = s.late
    ? `🍔 Tonight's window already runs to <b>${s.window_end}</b>. Change it?`
    : `🍔 <b>Eating late tonight?</b> Your window normally closes at ${s.window_end}. Extend it, just for tonight:`;
  return msgId ? edit(env, chat, msgId, text, rows) : send(env, chat, text, rows);
}

export async function setLate(env: E, chat: number, endMins: number, msgId?: number) {
  const s = await getSettings(env);
  if (!s.window_end || endMins <= toMins(s.window_end) || endMins >= 24 * 60) {
    return send(env, chat, `Pick a time between ${s.window_end ?? 'your window end'} and 23:55, e.g. <code>/late 23:00</code>.`);
  }
  const day = local(s.tz).day;
  await setState(env, 'late', JSON.stringify({ day, end: hhmm(endMins) }));
  const log = (await lateDaysThisWeek(env, day)).filter((d) => d !== day).concat(day);
  await setState(env, 'late_log', JSON.stringify(log));
  const lines = [
    `🍔 <b>Window extended to ${hhmm(endMins)}</b>, tonight only.`,
    `Food before then counts as inside your window, so your streak is safe.`,
    `Tomorrow it's back to ${s.window_start}–${s.window_end}.`,
  ];
  if (log.length >= 3) {
    lines.push('', `💡 That's ${log.length} late nights this week. If late dinners are your normal, a later window might suit you better, e.g. <code>/window 12:00 23:00</code> (same length, just later).`);
  }
  const rows: Button[][] = [[{ text: '↩️ Cancel', data: 'lc:' }]];
  return msgId ? edit(env, chat, msgId, lines.join('\n'), rows) : send(env, chat, lines.join('\n'), rows);
}

export async function cancelLate(env: E, chat: number, msgId?: number) {
  const s = await getSettings(env);
  await delState(env, 'late');
  const day = local(s.tz).day;
  await setState(env, 'late_log', JSON.stringify((await lateDaysThisWeek(env, day)).filter((d) => d !== day)));
  const text = `↩️ Back to normal: window closes at <b>${s.window_end}</b> tonight.`;
  return msgId ? edit(env, chat, msgId, text) : send(env, chat, text);
}

/** /late, /late 2h, /late 1.5, /late 23:15, /late off */
export async function lateCmd(env: E, chat: number, text: string) {
  const a = text.replace(/^\/\S+\s*/, '').trim().toLowerCase();
  if (!a) return lateMenu(env, chat);
  if (a === 'off' || a === 'cancel') return cancelLate(env, chat);
  const s = await getSettings(env);
  const t = a.match(/^(\d{1,2}):?(\d{2})$/);
  if (t) return setLate(env, chat, Number(t[1]) * 60 + Number(t[2]));
  const h = a.match(/^\+?(\d+(?:\.\d+)?)\s*h?(ours?|rs?)?$/);
  if (h && s.window_end) return setLate(env, chat, toMins(s.window_end) + Math.round(Number(h[1]) * 60));
  return send(env, chat, 'Try <code>/late</code> for options, <code>/late 2h</code>, or <code>/late 23:15</code>.');
}

/** Buttons: lt: menu · lx:<mins> set · lc: cancel. */
export const lateButtons = {
  lt: (env: E, chat: number, msgId: number) => lateMenu(env, chat, msgId),
  lx: (env: E, chat: number, msgId: number, val: string) => setLate(env, chat, Number(val), msgId),
  lc: (env: E, chat: number, msgId: number) => cancelLate(env, chat, msgId),
};
