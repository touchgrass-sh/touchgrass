import type { E } from '../env';
import { waterButtons } from '../log';
import { has } from '../plan';
import { getSettings, getState, once, saveSettings } from '../store';
import { esc, send, type Button } from '../tg';
import { local, parseHHMM, toMins } from '../time';
import { addDays, currentWeight, dayData, dur, effective, fastState, history, journey, r0, streaks } from './days';
import { deficitLines } from './deficit';
import { exerciseGoal } from './exercise';
import { celebrate, goalLines } from './goals';
import { sendWithGif } from './gifs';
import { habitLines, habitReminder, tickButton } from './habits';
import { tickReport } from './report';

// free: /today, /week, /fast, /window and the daily schedule (ported from Jake's bot.ts + cron.ts):
// morning (yesterday's recap, today, mini goal), 15 min before the window, window open, 30 min left (with
// "eating late"), fast started, habit reminders, the fridge-screen battery check.

const appButton = (origin: string, label = '📊 Open dashboard'): Button[][] => [[{ text: label, app: `${origin}/app` }]];

export async function fastText(env: E) {
  const s = await effective(env);
  const f = await fastState(env);
  if (!f) return '⏱️ No eating window set. Add one in the app → Settings.';
  const st = await streaks(env);
  const streak = st.fasting > 1 ? `\n🔥 ${st.fasting} days in a row inside your window` : '';
  return f.eating
    ? `🍽️ <b>Eating window open</b> — ${dur(f.minsLeft)} left (closes ${s.window_end}${s.late ? ', extended tonight 🍔' : ''})${streak}`
    : `🔒 <b>Fasting</b> — ${dur(f.minsLeft)} until ${s.window_start}` + (f.fastedMins > 0 ? ` (${dur(f.fastedMins)} done)` : '') +
      `\nWater, black coffee and plain tea are fine.${streak}`;
}

export async function todayText(env: E, day?: string) {
  const s = await effective(env);
  const today = local(s.tz).day;
  day ??= today;
  const d = await dayData(env, day);
  const food = await has(env, 'sudo');
  const meals = d.meals.filter((m) => m.kind !== 'caffeine').map((m) =>
    `• ${local(s.tz, new Date(m.ts * 1000)).hhmm} ${esc(m.label)} — ${m.kcal == null ? '?' : r0(m.kcal)} kcal${m.outside_window ? ' 🔒' : ''}`);
  return `📅 <b>${day === today ? 'Today' : day}</b>\n` +
    (food ? `🍽️ ${r0(d.kcal)}${s.kcal_target ? ` / ${r0(s.kcal_target)} kcal (${r0(s.kcal_target - d.kcal)} left)` : ' kcal'}\n` +
      `💪 Protein ${r0(d.p)}${s.protein_target ? ` / ${s.protein_target}` : ''}g · C ${r0(d.c)}g · F ${r0(d.f)}g\n` : '') +
    `🪢 ${dur(d.skipMins)} · 💥 ${d.burpees} burpees · ~${r0(d.burned)} kcal burned\n` +
    `💧 ${(d.water / 1000).toFixed(1)}L / ${(s.water_ml / 1000).toFixed(1)}L water\n` +
    (await habitLines(env, day)).map((l) => l + '\n').join('') +
    `☕ ${d.coffee} drink${d.coffee === 1 ? '' : 's'}${d.coffee ? ` · ~${d.caffeine}mg caffeine` : ''}\n` +
    (day === today ? (await fastText(env)) + '\n' : '') +
    (meals.length ? `\n${meals.join('\n')}` : food ? '\nNothing logged yet, send a photo!' : '');
}

export async function weekText(env: E) {
  const s = await getSettings(env);
  const h = await history(env, 7);
  const food = await has(env, 'sudo');
  const lines = h.map((d) => {
    const name = new Date(d.day + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit' });
    const rest = `${d.skip || d.burpees ? ' 🏃' : ''}${d.coffee ? ` ☕${d.coffee}` : ''}${d.water ? ` 💧${(d.water / 1000).toFixed(1)}L` : ''}${d.kg ? ` · ${d.kg}kg` : ''}`;
    if (!food) return `${name} ·${rest || ' —'}`;
    if (!d.n) return `${name} · —`;
    const ok = !s.kcal_target || d.kcal <= s.kcal_target * 1.05 ? '✅' : '⚠️';
    return `${name} · ${ok} ${r0(d.kcal)} kcal · ${r0(d.p)}g P${d.late ? ' 🔒' : ''}${rest}`;
  });
  const logged = h.filter((d) => d.n);
  const avg = logged.length ? logged.reduce((a, d) => a + d.kcal, 0) / logged.length : 0;
  const coffeeAvg = h.reduce((a, d) => a + d.coffee, 0) / h.length;
  const waterAvg = h.reduce((a, d) => a + d.water, 0) / h.length / 1000;
  const def = food ? await deficitLines(env) : [];
  return `📈 <b>Last 7 days</b>\n${lines.join('\n')}\n\nAverage: ${food ? `${r0(avg)} kcal${s.kcal_target ? ` (target ${s.kcal_target})` : ''} · ` : ''}💧 ${waterAvg.toFixed(1)}L · ☕ ${coffeeAvg.toFixed(1)}/day` +
    (def.length ? `\n\n${def.join('\n')}` : '') + `\n\n${food ? '✅ on target · ⚠️ over · 🔒 ate outside window · ' : ''}🏃 exercised · 💧 water · ☕ drinks`;
}

export async function windowCmd(env: E, chat: number, text: string) {
  const arg = text.replace(/^\/\S+\s*/, '');
  const m = arg.match(/^(\d{1,2}:?\d{2}|\d{1,2})\s*[-–\s]+\s*(\d{1,2}:?\d{2}|\d{1,2})$/);
  const fix = (x: string) => parseHHMM(/^\d{3,4}$/.test(x) ? `${x.slice(0, -2)}:${x.slice(-2)}` : x);
  const a = m ? fix(m[1]) : null, b = m ? fix(m[2]) : null;
  if (!a || !b) {
    const s = await getSettings(env);
    return send(env, chat, `⏱️ Eating window: <b>${s.window_start ? `${s.window_start}–${s.window_end}` : 'off'}</b>\nChange it: <code>/window 12:00 20:00</code>`);
  }
  await saveSettings(env, { window_start: a, window_end: b });
  return send(env, chat, `⏱️ Eating window set to <b>${a}–${b}</b>. Reminders follow it automatically.`);
}

// ---------- the morning message ----------

export async function morning(env: E, chat: string | number) {
  const s = await getSettings(env);
  const yday = addDays(local(s.tz).day, -1);
  const [d, st, kg] = await Promise.all([dayData(env, yday), streaks(env), currentWeight(env)]);
  // Two messages: the recap has no buttons so it stays put; tapping water/habits only touches the second one.
  const food = await has(env, 'sudo');
  const lines = [`📊 <b>Yesterday</b>`];
  const water = `💧 Water: ${(d.water / 1000).toFixed(1)}L / ${(s.water_ml / 1000).toFixed(1)}L${d.water >= s.water_ml ? ' ✅' : ''}`;
  if (food && d.meals.some((m) => m.kind !== 'caffeine')) {
    const ok = !s.kcal_target || d.kcal <= s.kcal_target * 1.05;
    lines.push(`${ok ? '✅' : '⚠️'} ${r0(d.kcal)}${s.kcal_target ? ` / ${r0(s.kcal_target)}` : ''} kcal · ${r0(d.p)}g protein` +
      (d.burned ? ` · 🏃 ~${r0(d.burned)} kcal burned` : '') + (d.coffee ? ` · ☕ ${d.coffee}` : ''));
    lines.push(water);
  } else if (!food && (d.water || d.coffee || d.burned)) {
    lines.push(water + (d.coffee ? ` · ☕ ${d.coffee}` : ''));
    if (d.skipMins || d.burpees) lines.push(`🏃 🪢 ${dur(d.skipMins)} · 💥 ${d.burpees} burpees`);
  } else {
    lines.push(`Nothing logged yesterday, today's a fresh start.`);
  }
  const moves = await env.DB.prepare(`SELECT SUM(status = 'done') AS done FROM nudges WHERE day = ?`).bind(yday).first<{ done: number | null }>();
  if (moves?.done) lines.push(`💪 ${moves.done} agent-time moves done`);
  const j = await journey(env);
  const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
  lines.push('', `🗓️ <b>Day ${j.day}</b> today${food ? ` · ${days(j.committed)} committed so far` : ''}`, `🔥 <b>Streaks</b>`,
    ...(food && s.window_start ? [`⏱️ Window: ${days(st.fasting)}${st.fasting ? '' : ' (starts again today)'}`] : []),
    ...(food ? [`📝 Logging: ${days(st.logging)}`] : []), `💧 Water: ${days(st.water)}`, `🏃 Exercise: ${days(st.exercise)}`);
  const def = food ? await deficitLines(env) : [];
  const goals = await goalLines(env);
  if (def.length) lines.push('', ...def);
  if (goals.length) lines.push('', ...goals);
  // Always a morning GIF here; 'win' GIFs are only for milestones (one topic per GIF).
  await sendWithGif(env, chat, 'morning', lines.join('\n'));
  await celebrate(env, chat);

  const today = [`☀️ <b>Morning!</b>`, '', await fastText(env), '',
    `⚖️ <b>Weigh in</b> after the loo, before food, just send the number${kg ? ` (last: ${kg} kg)` : ''}.`,
    `💧 Then start the day with a big glass of water, it helps the fast too.`];
  const batt = await battery(env);
  if (batt) today.push(`🔋 Fridge screen ${batt.pct}%${batt.pct < 15 ? ', charge it today!' : ''}`);
  await send(env, chat, today.join('\n'), [...waterButtons(true), ...s.habits.map((h) => tickButton(h, true)[0])]);
  await exerciseGoal(env, chat);
}

/** E-ink screen battery from its last poll (null if never, or older than 2 days). */
export async function battery(env: E): Promise<{ pct: number; at: number } | null> {
  const v = await getState(env, 'battery');
  if (!v) return null;
  const b = JSON.parse(v);
  return Date.now() - b.at < 2 * 86400 * 1000 ? b : null;
}

/** Window messages, by name, so /admin can fire them on demand. */
export const windowReminders: Record<string, (env: E, chat: string | number) => Promise<unknown>> = {
  async soon(env, chat) {
    const s = await getSettings(env);
    return sendWithGif(env, chat, 'soon', `⏰ <b>15 min</b> until your eating window opens (${s.window_start}).`);
  },
  async open(env, chat) {
    const s = await effective(env);
    const food = await has(env, 'sudo');
    return sendWithGif(env, chat, 'food', `✅ <b>Eating window open</b> until ${s.window_end}.${food ? ' Send a photo of whatever you eat.' : ''}`);
  },
  async last30(env, chat) {
    const s = await effective(env);
    const d = await dayData(env, local(s.tz).day);
    const food = await has(env, 'sudo');
    const left = s.kcal_target ? s.kcal_target - d.kcal : 0, pLeft = s.protein_target ? s.protein_target - d.p : 0;
    return sendWithGif(env, chat, 'lastcall', `🍽️ <b>30 min left to eat</b> (window closes ${s.window_end}).\n` +
      (!food || !s.kcal_target ? '' : left > 0 ? `You've got ${r0(left)} kcal left${pLeft > 0 ? ` and ${r0(pLeft)}g protein still to go${pLeft > 25 ? ', something high-protein would be ideal (/snack)' : ''}` : ' and your protein is done ✅'}.` : `You're at your calories for today 👍`),
      s.late ? undefined : [[{ text: '🍔 Eating late tonight', data: 'lt' }]]);
  },
  async close(env, chat) {
    const s = await getSettings(env);
    return sendWithGif(env, chat, 'fasting', `🔒 <b>Fast started.</b> No food until ${s.window_start} tomorrow.\nWater, black coffee and plain tea are fine. 💪`);
  },
  morning: (env, chat) => morning(env, chat),
};

/** Every minute. Each message fires once per day, in the first run at or after its time (30 min grace). */
export async function tick(env: E) {
  const chat = await getState(env, 'chat');
  if (!chat) return;
  const s = await effective(env);
  const { day, mins } = local(s.tz);
  const list: { key: string; at: number; run: () => Promise<unknown> }[] = [
    { key: 'morning', at: toMins(s.morning ?? s.hours_start), run: () => morning(env, chat) },
    ...s.habits.filter((h) => h.remind).map((h) => ({ key: `check-${h.id}`, at: toMins(h.remind!), run: () => habitReminder(env, chat, h) })),
    { key: 'battery', at: 18 * 60, run: async () => {
      const b = await battery(env);
      if (b && b.pct < 15) await send(env, chat, `🔋 <b>Fridge screen battery is at ${b.pct}%</b>, plug it in tonight.`);
    } },
  ];
  if (s.window_start && s.window_end) {
    const start = toMins(s.window_start), end = toMins(s.window_end);
    list.push(
      { key: 'soon', at: start - 15, run: () => windowReminders.soon(env, chat) },
      { key: 'open', at: start, run: () => windowReminders.open(env, chat) },
      // Keyed by the closing time, so a /late extension gets its own last call and fast start.
      { key: `lastcall-${s.window_end}`, at: end - 30, run: () => windowReminders.last30(env, chat) },
      { key: `fast-${s.window_end}`, at: end, run: () => windowReminders.close(env, chat) },
    );
  }
  for (const r of list) {
    const at = (r.at + 1440) % 1440;
    if (mins >= at && mins < at + 30 && (await once(env, `r:${day}:${r.key}`))) {
      try { await r.run(); } catch (err) { console.error(`[free cron] ${r.key}`, err); }
    }
  }
  await tickReport(env);
}
