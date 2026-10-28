import type { E, Settings } from '../env';
import { getSettings, getState } from '../store';
import { inWindow, local, nowSec, toMins } from '../time';
import { totals, type Item } from './items';

// free: one day's numbers, history rollups, streaks and the journey count (ported from Jake's db.ts). Everything
// reads D1; the eating window comes from settings plus tonight's /late extension.

export const addDays = (day: string, n: number) => {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const r0 = (n: number) => Math.round(n).toLocaleString('en-GB');

export function dur(mins: number) {
  mins = Math.max(0, Math.round(mins));
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** Settings as they apply right now: a /late extension for today replaces window_end (and sets `late`). */
export async function effective(env: E): Promise<Settings & { late?: boolean; normal_end?: string }> {
  const s = await getSettings(env);
  const raw = await getState(env, 'late');
  if (raw && s.window_end) {
    const l = JSON.parse(raw) as { day: string; end: string };
    if (l.day === local(s.tz).day) return { ...s, normal_end: s.window_end, window_end: l.end, late: true };
  }
  return s;
}

export interface MealRow { id: number; ts: number; day: string; label: string; items: string | null; kcal: number | null; photo: string | null; kind: string | null; source: string | null; outside_window: number }
export interface ExRow { id: number; ts: number; day: string; kind: string; reps: number | null; minutes: number | null; kcal: number }

const macros = (m: MealRow) => {
  const items: Item[] = m.items ? JSON.parse(m.items) : [];
  const t = totals(items);
  return { ...t, kcal: m.kcal ?? t.kcal };
};

export async function dayData(env: E, day: string) {
  const [meals, ex, wa] = await Promise.all([
    env.DB.prepare(`SELECT * FROM meals WHERE day = ? ORDER BY ts`).bind(day).all<MealRow>(),
    env.DB.prepare(`SELECT * FROM exercise WHERE day = ? ORDER BY ts`).bind(day).all<ExRow>(),
    env.DB.prepare(`SELECT id, ts, ml FROM water WHERE day = ? ORDER BY ts`).bind(day).all<{ id: number; ts: number; ml: number }>(),
  ]);
  const t = meals.results.map(macros).reduce((a, m) => ({ kcal: a.kcal + m.kcal, p: a.p + m.p, f: a.f + m.f, c: a.c + m.c }), { kcal: 0, p: 0, f: 0, c: 0 });
  const coffees = meals.results.filter((m) => m.kind === 'caffeine');
  const caffeine = coffees.reduce((a, m) => a + ((m.items ? JSON.parse(m.items)[0]?.caf : null) ?? 80), 0);
  return {
    day, meals: meals.results, exercise: ex.results, waterLog: wa.results, ...t,
    water: wa.results.reduce((a, w) => a + w.ml, 0),
    skipMins: ex.results.filter((e) => e.kind === 'skip').reduce((a, e) => a + (e.minutes ?? 0), 0),
    burpees: ex.results.filter((e) => e.kind === 'burpees').reduce((a, e) => a + (e.reps ?? 0), 0),
    burned: ex.results.reduce((a, e) => a + e.kcal, 0),
    coffee: coffees.length,
    caffeine,
  };
}

export interface DayRoll { day: string; kcal: number; p: number; f: number; c: number; n: number; late: number; coffee: number; water: number; burned: number; skip: number; burpees: number; kg: number | null }

/** Per-day rollup for trends, streaks and /week. */
export async function history(env: E, days: number, today?: string): Promise<DayRoll[]> {
  const s = await getSettings(env);
  const end = today ?? local(s.tz).day;
  const from = addDays(end, -(days - 1));
  const [m, e, w, wa] = await Promise.all([
    env.DB.prepare(`SELECT * FROM meals WHERE day BETWEEN ? AND ?`).bind(from, end).all<MealRow>(),
    env.DB.prepare(`SELECT day, SUM(kcal) burned, SUM(CASE WHEN kind='skip' THEN minutes ELSE 0 END) skip, SUM(CASE WHEN kind='burpees' THEN reps ELSE 0 END) burpees FROM exercise WHERE day BETWEEN ? AND ? GROUP BY day`).bind(from, end).all<any>(),
    env.DB.prepare(`SELECT day, kg FROM weights WHERE day BETWEEN ? AND ? ORDER BY day`).bind(from, end).all<{ day: string; kg: number }>(),
    env.DB.prepare(`SELECT day, SUM(ml) water FROM water WHERE day BETWEEN ? AND ? GROUP BY day`).bind(from, end).all<any>(),
  ]);
  const byDay = new Map<string, DayRoll>();
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    byDay.set(d, { day: d, kcal: 0, p: 0, f: 0, c: 0, n: 0, late: 0, coffee: 0, water: 0, burned: 0, skip: 0, burpees: 0, kg: null });
  }
  for (const r of m.results) {
    const d = byDay.get(r.day);
    if (!d) continue;
    const t = macros(r);
    d.kcal += t.kcal; d.p += t.p; d.f += t.f; d.c += t.c;
    if (r.kind === 'caffeine') d.coffee++;
    else d.n++;
    d.late = Math.max(d.late, r.outside_window ?? 0);
  }
  for (const r of e.results) Object.assign(byDay.get(r.day) ?? {}, { burned: r.burned ?? 0, skip: r.skip ?? 0, burpees: r.burpees ?? 0 });
  for (const r of wa.results) Object.assign(byDay.get(r.day) ?? {}, { water: r.water ?? 0 });
  for (const r of w.results) if (byDay.has(r.day)) byDay.get(r.day)!.kg = r.kg;
  return [...byDay.values()];
}

/** Streaks count back from yesterday (today isn't over), plus today if it already qualifies. */
export async function streaks(env: E) {
  const [h, s] = await Promise.all([history(env, 90), getSettings(env)]);
  const today = h[h.length - 1];
  const count = (ok: (d: DayRoll) => boolean) => {
    let n = 0;
    for (let i = h.length - 2; i >= 0 && ok(h[i]); i--) n++;
    return n + (ok(today) ? 1 : 0);
  };
  return {
    fasting: count((d) => d.n > 0 && !d.late),
    logging: count((d) => d.n > 0),
    exercise: count((d) => d.skip > 0 || d.burpees > 0),
    water: count((d) => d.water >= s.water_ml),
  };
}

/** Day N (first ever log = day 1) and "committed" days: food logged and eaten inside the window. */
export async function journey(env: E) {
  const s = await getSettings(env);
  const r = await env.DB.prepare(
    `SELECT (SELECT MIN(d) FROM (SELECT MIN(day) d FROM meals UNION ALL SELECT MIN(day) FROM weights UNION ALL SELECT MIN(day) FROM water)) start,
            (SELECT COUNT(*) FROM (SELECT day FROM meals GROUP BY day HAVING SUM(kind IS NULL) > 0 AND MAX(outside_window) = 0)) committed`,
  ).first<{ start: string | null; committed: number }>();
  const today = local(s.tz).day;
  const start = r?.start ?? today;
  return { start, day: Math.round((Date.parse(today) - Date.parse(start)) / 86400000) + 1, committed: r?.committed ?? 0 };
}

export async function currentWeight(env: E): Promise<number | null> {
  const r = await env.DB.prepare(`SELECT kg FROM weights ORDER BY day DESC LIMIT 1`).first<{ kg: number }>();
  return r?.kg ?? (await getSettings(env)).start_weight;
}

export async function lastMealTs(env: E) {
  return (await env.DB.prepare(`SELECT MAX(ts) t FROM meals WHERE kind IS NULL`).first<{ t: number | null }>())?.t ?? null;
}

/** Eating window right now: open (mins till it closes) or fasting (mins till it opens, mins since the last meal). */
export async function fastState(env: E) {
  const s = await effective(env);
  if (!s.window_start || !s.window_end) return null;
  const { mins } = local(s.tz);
  if (inWindow(mins, s.window_start, s.window_end)) return { eating: true, minsLeft: (toMins(s.window_end) - mins + 1440) % 1440, fastedMins: 0 };
  const last = await lastMealTs(env);
  return { eating: false, minsLeft: (toMins(s.window_start) - mins + 1440) % 1440, fastedMins: last ? (nowSec() - last) / 60 : 0 };
}
