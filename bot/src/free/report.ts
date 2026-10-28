import type { E, Settings } from '../env';
import { hm, waterToday } from '../log';
import { once, getSettings, getState } from '../store';
import { badgeName, earned } from '../badges';
import { send } from '../tg';
import { local } from '../time';
import { has } from '../plan';
import { FACE } from '../voice';
import { dayMacros } from './macros';
import { caffeineToday } from '../caffeine';

// free: the weekly report card (Sunday evening). Plain numbers from D1, no AI.

const addDays = (day: string, n: number) => {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The 7 days ending `end` (inclusive). */
export async function report(env: E, chat: number | string, s: Settings, end: string) {
  const from = addDays(end, -6);
  const food = await has(env, 'sudo');
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const q = <T>(sql: string) => env.DB.prepare(sql).bind(from, end).first<T>();

  const moves = await q<{ done: number; sent: number; active: number }>(
    `SELECT COALESCE(SUM(status = 'done'), 0) done, COUNT(*) sent, COUNT(DISTINCT CASE WHEN status = 'done' THEN day END) active FROM nudges WHERE day BETWEEN ? AND ?`);
  const logged = (await env.DB.prepare(`SELECT DISTINCT day FROM meals WHERE kind IS NULL AND day BETWEEN ? AND ?`).bind(from, end).all<{ day: string }>()).results.map((r) => r.day);
  const macros = await Promise.all(logged.map((d) => dayMacros(env, d)));
  const avg = (k: 'kcal' | 'p') => (macros.length ? Math.round(macros.reduce((a, m) => a + m[k], 0) / macros.length) : 0);
  const onTarget = s.kcal_target ? macros.filter((m) => Math.abs(m.kcal - s.kcal_target!) <= s.kcal_target! * 0.1).length : 0;
  const water = await Promise.all(days.map((d) => waterToday(env, d)));
  const waterDays = water.filter((ml) => ml >= s.water_ml).length;
  const fasts = await env.DB.prepare(`SELECT COUNT(*) n, MAX(end - start) longest FROM fasts WHERE end IS NOT NULL AND date(end, 'unixepoch') BETWEEN ? AND ?`)
    .bind(from, end).first<{ n: number; longest: number | null }>();
  const w = (await env.DB.prepare(`SELECT kg FROM weights WHERE day BETWEEN ? AND ? ORDER BY day`).bind(from, end).all<{ kg: number }>()).results;
  const caf = await Promise.all(days.map((d) => caffeineToday(env, d)));
  const drinks = caf.reduce((a, c) => a + c.count, 0);
  const have = await earned(env);
  const newBadges = Object.entries(have).filter(([, d]) => d >= from && d <= end).map(([id]) => badgeName(id));

  const grade = moves!.active >= 5 ? 'A' : moves!.active >= 3 ? 'B' : moves!.active >= 1 ? 'C' : '–';
  const lines = [
    `${FACE.idle} <b>weekly report</b> · ${from} → ${end}`,
    '',
    `💪 moves: <b>${moves!.done}</b> done${moves!.sent ? ` of ${moves!.sent} nudges` : ''} · active ${moves!.active}/7 days · grade <b>${grade}</b>`,
    food && logged.length
      ? `🍽️ food logged ${logged.length}/7 days · avg ~${avg('kcal')} kcal, ${avg('p')}g protein <i>(est)</i>${s.kcal_target ? ` · near target ${onTarget}/${logged.length}` : ''}`
      : food ? '🍽️ no food logged' : null,
    `💧 water target hit ${waterDays}/7 days`,
    fasts?.n ? `🌙 ${fasts.n} fast${fasts.n > 1 ? 's' : ''}, longest ${hm(fasts.longest ?? 0)}` : null,
    w.length > 1 ? `⚖️ ${w[0].kg} → ${w[w.length - 1].kg} kg` : w.length ? `⚖️ ${w[0].kg} kg` : null,
    drinks ? `☕ ${drinks} caffeine drinks · ${(drinks / 7).toFixed(1)} a day` : null,
    newBadges.length ? `🏅 new: ${newBadges.join(', ')}` : null,
    '',
    moves!.active >= 5 ? 'proper week. keep it rolling 🌱' : moves!.active >= 1 ? 'some good days in there. next week, one more 🌱' : 'quiet week. Monday is a fresh one 🌱',
  ];
  return send(env, chat, lines.filter((x) => x !== null).join('\n'));
}

export async function weekCmd(env: E, chat: number) {
  const s = await getSettings(env);
  return report(env, chat, s, local(s.tz).day);
}

/** Cron: Sunday from 19:00 local, once. */
export async function tickReport(env: E) {
  const chat = await getState(env, 'chat');
  if (!chat) return;
  const s = await getSettings(env);
  const t = local(s.tz);
  if (t.weekday === 'Sun' && t.mins >= 19 * 60 && (await once(env, `week:${t.day}`))) await report(env, chat, s, t.day);
}
