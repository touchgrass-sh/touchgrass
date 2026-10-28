import type { E } from '../env';
import { getSettings } from '../store';
import { edit, send } from '../tg';
import { local, nowSec } from '../time';
import { once } from '../store';
import { currentWeight, dayData, dur, r0, streaks } from './days';

// free: skipping and burpees (ported from Jake). /skip 10m, /skip 1200 (jumps), /burpees 50, or plain English
// ("skipped for 10 minutes", "30 burpees"). Burned calories are shown but never added to the food budget.
// The morning message carries a tiny mini goal (settings goal_burpees / goal_skip_min) with one-tap buttons.

async function logExercise(env: E, kind: 'skip' | 'burpees', reps: number | null, minutes: number | null, kcal: number) {
  const day = local((await getSettings(env)).tz).day;
  await env.DB.prepare(`INSERT INTO exercise (ts, day, kind, reps, minutes, kcal) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(nowSec(), day, kind, reps, minutes, kcal).run();
}

async function exerciseToday(env: E) {
  const s = await getSettings(env);
  const d = await dayData(env, local(s.tz).day);
  const st = await streaks(env);
  return `\nToday: 🪢 ${dur(d.skipMins)} · 💥 ${d.burpees} burpees · ~${r0(d.burned)} kcal${st.exercise > 1 ? `\n🔥 ${st.exercise}-day exercise streak` : ''}\n<i>Burned calories aren't added to your food budget, that's your bonus deficit.</i>`;
}

export async function exercise(env: E, chat: number, kind: 'skip' | 'burpees', arg: string) {
  const kg = (await currentWeight(env)) ?? 80;
  const m = arg.match(/(\d+(?:\.\d+)?)\s*([a-z]*)/i);
  if (!m) return send(env, chat, kind === 'skip'
    ? 'How much? <code>/skip 10m</code> (minutes) or <code>/skip 1200</code> (jumps)'
    : 'How many? <code>/burpees 50</code>');
  const n = Number(m[1]), unit = m[2].toLowerCase();
  if (kind === 'burpees') {
    const kcal = (n * 8 * kg) / 600; // ~8 MET at ~10 burpees/min
    await logExercise(env, 'burpees', Math.round(n), null, kcal);
    return send(env, chat, `💥 ${Math.round(n)} burpees logged (~${r0(kcal)} kcal). ${await exerciseToday(env)}`);
  }
  // Skipping: "10m" = minutes, "1200"/"1200j" = jumps (~110/min). Bare small numbers are minutes.
  const isJumps = unit.startsWith('j') || (!unit && n > 90);
  const minutes = isJumps ? n / 110 : n;
  const kcal = (10 * kg * minutes) / 60; // ~10 MET for moderate skipping
  await logExercise(env, 'skip', isJumps ? Math.round(n) : null, minutes, kcal);
  return send(env, chat, `🪢 Skipping ${isJumps ? `${Math.round(n)} jumps (~${dur(minutes)})` : dur(minutes)} logged (~${r0(kcal)} kcal). ${await exerciseToday(env)}`);
}

export const skipCmd = (env: E, chat: number, text: string) => exercise(env, chat, 'skip', text.replace(/^\/\S+\s*/, ''));
export const burpeesCmd = (env: E, chat: number, text: string) => exercise(env, chat, 'burpees', text.replace(/^\/\S+\s*/, ''));

/** Plain-English exercise. True if it was one. */
export async function exerciseText(env: E, chat: number, text: string) {
  const sk = text.match(/^(?:i\s+)?(?:did\s+|done\s+)?(?:skip(?:ped|ping)?|skips?|jump ?rope)\s*(?:for\s*)?(\d+(?:\.\d+)?)\s*(m|mins?|minutes?|j|jumps?|skips?)?\b/i)
    ?? text.match(/^(?:i\s+)?(?:did\s+)?(\d+(?:\.\d+)?)\s*(m|mins?|minutes?|j|jumps?|skips?)\s*(?:of\s+)?(?:skipping|skips?|jump ?rope)?$/i);
  if (sk && /skip|jump|rope/i.test(text)) {
    const unit = (sk[2] ?? '').toLowerCase();
    await exercise(env, chat, 'skip', `${sk[1]}${unit.startsWith('m') ? 'm' : unit.startsWith('j') || unit.startsWith('s') ? 'j' : ''}`);
    return true;
  }
  const bp = text.match(/^(?:i\s+)?(?:did\s+|done\s+)?(\d+)\s*burpees?$/i) ?? text.match(/^burpees?\s*(\d+)$/i);
  if (bp) {
    await exercise(env, chat, 'burpees', bp[1]);
    return true;
  }
  return false;
}

/** The morning mini goal. Deliberately tiny so it's easy to say yes to. */
export async function exerciseGoal(env: E, chat: number | string) {
  const s = await getSettings(env);
  if (!s.goal_burpees && !s.goal_skip_min) return;
  const opts = [s.goal_burpees ? `${s.goal_burpees} burpees` : '', s.goal_skip_min ? `${s.goal_skip_min} minutes of skipping` : ''].filter(Boolean);
  return send(env, chat, `💪 <b>Today's mini goal</b>\n${opts.join(' <b>or</b> ')}. That's it. Tap when it's done.`, [[
    ...(s.goal_burpees ? [{ text: `✅ ${s.goal_burpees} burpees`, data: 'xg:b' }] : []),
    ...(s.goal_skip_min ? [{ text: `✅ ${s.goal_skip_min} min skipping`, data: 'xg:s' }] : []),
  ]]);
}

/** xg:b / xg:s. */
export async function goalDone(env: E, chat: number, msgId: number, val: string) {
  if (!(await once(env, `xg:${msgId}:${val}`))) return; // double-tap
  const s = await getSettings(env);
  await edit(env, chat, msgId, '💪 <b>Mini goal done</b> ✅ Nice one.');
  return val === 'b' ? exercise(env, chat, 'burpees', String(s.goal_burpees || 5)) : exercise(env, chat, 'skip', `${s.goal_skip_min || 1}m`);
}
