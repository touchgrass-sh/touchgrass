import type { E, Settings } from '../env';
import { getSettings, getState } from '../store';
import { local } from '../time';
import { dayData, effective, fastState, history, journey, streaks } from './days';
import { deficit } from './deficit';
import { totals, type Item } from './items';
import { checkStatus, tick, untick } from './habits';

// free: the mini app's data (Jake's /api/data): today, a day of meals/exercise/water for the Meals tab, 30-day
// trends, streaks, deficit, weight, habits. Reads D1 only. The sudo pack adds kitchen, food sources and AI usage.

async function day(env: E, s: Settings, d: string) {
  const x = await dayData(env, d);
  const hm = (ts: number) => local(s.tz, new Date(ts * 1000)).hhmm;
  return {
    day: d,
    kcal: Math.round(x.kcal), p: Math.round(x.p), c: Math.round(x.c), f: Math.round(x.f),
    kcal_target: s.kcal_target, protein_target: s.protein_target, carbs_target: s.carbs_target, fat_target: s.fat_target,
    water: x.water, coffee: x.coffee, caffeine: x.caffeine,
    skip_mins: Math.round(x.skipMins * 10) / 10, burpees: x.burpees, burned: Math.round(x.burned),
    meals: x.meals.map((m) => {
      const items: Item[] = m.items ? JSON.parse(m.items) : [];
      return {
        id: m.id, label: m.label, kcal: m.kcal, time: hm(m.ts), caffeine: m.kind === 'caffeine', photo: !!m.photo, late: !!m.outside_window,
        p: Math.round(totals(items).p), items: items.map((i) => ({ name: i.name, grams: i.grams ?? null, kcal: Math.round(i.kcal), est: i.src === 'est' })),
      };
    }),
    exercise: x.exercise.map((e) => ({ id: e.id, time: hm(e.ts), kind: e.kind, reps: e.reps, minutes: e.minutes, kcal: Math.round(e.kcal) })),
    water_log: x.waterLog.map((w) => ({ id: w.id, time: hm(w.ts), ml: w.ml })),
  };
}

export async function dash(env: E, s: Settings, today: string, view?: string) {
  const eff = await effective(env);
  const [f, st, j, def, h, weights, first] = await Promise.all([
    fastState(env), streaks(env), journey(env), deficit(env), history(env, 30),
    env.DB.prepare(`SELECT day, kg FROM weights ORDER BY day DESC LIMIT 90`).all<{ day: string; kg: number }>().then((r) => r.results.reverse()),
    env.DB.prepare(`SELECT kg FROM weights ORDER BY day LIMIT 1`).first<{ kg: number }>(),
  ]);
  const habits = await Promise.all(s.habits.map(async (hb) => ({ ...hb, ...(await checkStatus(env, hb.id)) })));
  const habitDays = await Promise.all(s.habits.map(async (hb) => {
    const { results } = await env.DB.prepare(`SELECT day FROM checks WHERE item = ? AND day >= ?`).bind(hb.id, h[0].day).all<{ day: string }>();
    return { id: hb.id, days: results.map((r) => r.day) };
  }));
  return {
    food: await day(env, s, today),
    meals_day: view && view !== today && /^\d{4}-\d{2}-\d{2}$/.test(view) ? await day(env, s, view) : null,
    fast: { ...(f ?? {}), window_start: eff.window_start, window_end: eff.window_end, late: !!eff.late, window: f ? { eating: f.eating, mins_left: f.minsLeft } : null },
    streaks: st,
    journey: j,
    deficit: def,
    weights,
    weight_start: s.start_weight ?? first?.kg ?? null,
    weight_goals: s.weight_goals,
    trend: h,
    habits,
    habit_days: habitDays,
    targets: { kcal: s.kcal_target, protein: s.protein_target, carbs: s.carbs_target, fat: s.fat_target, water: s.water_ml },
  };
}


const del = (table: string) => async (env: E, body: any) => {
  const id = Number(body.id);
  if (!(id > 0)) return 'which one?';
  const r = await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
  return r.meta.changes ? '🗑 removed' : 'already gone';
};

export const dashActions: Record<string, (env: E, body: any) => Promise<string>> = {
  async weight(env, body) {
    const kg = Math.round(Number(body.kg) * 10) / 10;
    if (!(kg >= 30 && kg <= 300)) return 'weight: 30–300 kg';
    const s = await getSettings(env);
    await env.DB.prepare(`INSERT OR REPLACE INTO weights (day, kg, ts) VALUES (?, ?, ?)`).bind(local(s.tz).day, kg, Math.floor(Date.now() / 1000)).run();
    return `⚖️ ${kg} kg logged`;
  },
  delmeal: del('meals'),
  delwater: del('water'),
  delexercise: del('exercise'),
  async habit(env, body) {
    const s = await getSettings(env);
    const hb = s.habits.find((x) => x.id === body.id);
    if (!hb) return 'unknown habit';
    if ((await checkStatus(env, hb.id)).done) {
      await untick(env, hb.id);
      return `↩️ ${hb.label} unticked`;
    }
    await tick(env, hb.id);
    return `✅ ${hb.label} done`;
  },
};
