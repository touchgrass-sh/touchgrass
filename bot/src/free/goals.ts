import type { E } from '../env';
import { getSettings, getState, saveSettings, setState } from '../store';
import { send } from '../tg';
import { local, nowSec } from '../time';
import { currentWeight, journey } from './days';
import { sendTagged } from '../hooks';

// free: goals and milestones (ported from Jake's goals.ts). Weight and waist steps come from settings
// (weight_goals / waist_goals, highest first; the last is the goal). No deadlines by design. A 🎉 fires once per
// milestone crossed; committed days (food logged, eaten in the window) get their own steps.

const COMMIT_STEPS = [7, 14, 30, 60, 100, 150, 200, 365];
const f1 = (n: number) => n.toFixed(1).replace(/\.0$/, '');

export async function latestWaist(env: E) {
  return env.DB.prepare(`SELECT day, cm FROM waist ORDER BY day DESC LIMIT 1`).first<{ day: string; cm: number }>();
}

/** "waist 113", "113cm", "waist is 113 cm", "my waist 44in". Returns cm or null. */
export function parseWaist(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/[.!]+$/, '');
  const m = t.match(/^(?:my\s+)?(?:waist|waste)?\s*(?:is|:|=|measured(?: at)?)?\s*(\d{2,3}(?:\.\d+)?)\s*(cm|in|inch|inches|")?(?:\s*(?:waist|waste))?$/);
  if (!m || (!m[2] && !/wais|wast/.test(t))) return null; // a bare number is a weight, not a waist
  const cm = m[2] && m[2] !== 'cm' ? +m[1] * 2.54 : +m[1];
  return cm >= 50 && cm <= 200 ? +cm.toFixed(1) : null;
}

/** One or two lines for the morning message, weigh-ins and /goal. */
export async function goalLines(env: E) {
  const s = await getSettings(env);
  const [kg, waist] = await Promise.all([currentWeight(env), latestWaist(env)]);
  const lines: string[] = [];
  const steps = s.weight_goals;
  if (steps.length && kg != null) {
    const goal = steps[steps.length - 1];
    const next = steps.find((x) => x < kg);
    lines.push(next == null
      ? `🎯 <b>Goal reached</b> — ${f1(kg)} kg 🏆`
      : `🎯 Next: <b>${next} kg</b> · ${f1(kg - next)} to go` + (next !== goal ? ` · goal ${goal} kg (${f1(kg - goal)} to go)` : ''));
  }
  if (waist && s.waist_goals.length) {
    const w = s.waist_goals, wNext = w.find((x) => x < waist.cm);
    lines.push(wNext == null
      ? `📏 Waist ${f1(waist.cm)} cm — goal reached 🏆`
      : `📏 Waist ${f1(waist.cm)} cm → next <b>${wNext} cm</b> · goal ${w[w.length - 1]} cm`);
  }
  return lines;
}

/** Sends a 🎉 for every milestone crossed for the first time. Safe to call often. */
export async function celebrate(env: E, chat: number | string) {
  const [s, kg, waist, j, raw] = await Promise.all([getSettings(env), currentWeight(env), latestWaist(env), journey(env), getState(env, 'milestones')]);
  const done = new Set<string>(raw ? JSON.parse(raw) : []);
  const fresh: string[] = [];
  const hit = (key: string, msg: string) => { if (!done.has(key)) { done.add(key); fresh.push(msg); } };
  const gone = s.start_weight && kg != null ? `${f1(s.start_weight - kg)} kg down since you started. ` : '';

  const goal = s.weight_goals[s.weight_goals.length - 1];
  if (kg != null) for (const step of s.weight_goals) {
    if (kg <= step) hit(`w${step}`, step === goal
      ? `🏆 <b>GOAL WEIGHT: ${step} kg!</b> ${gone}Absolute legend.`
      : `🎉 <b>Under ${step} kg!</b> ${gone}Next stop: ${s.weight_goals.find((x) => x < step)} kg.`);
  }
  const wGoal = s.waist_goals[s.waist_goals.length - 1];
  if (waist) for (const step of s.waist_goals) {
    if (waist.cm <= step) hit(`waist${step}`, step === wGoal ? `🏆 <b>Waist under ${step} cm</b>: that's your goal.` : `🎉 <b>Waist under ${step} cm!</b>`);
  }
  for (const step of COMMIT_STEPS) {
    if (j.committed >= step) hit(`c${step}`, `🎉 <b>${step} committed days!</b> Food logged and eaten in the window, ${step} times over.`);
  }
  if (!fresh.length) return;
  await setState(env, 'milestones', JSON.stringify([...done]));
  await sendTagged(env, chat, 'win', fresh.join('\n'));
}

export async function waist(env: E, chat: number, cm: number | null) {
  if (cm == null) return send(env, chat, 'Send your waist in cm, e.g. <code>/waist 113</code>: tape round the belly button, belly relaxed, after breathing out.');
  const s = await getSettings(env);
  const first = await env.DB.prepare(`SELECT cm FROM waist ORDER BY day LIMIT 1`).first<{ cm: number }>();
  await env.DB.prepare(`INSERT OR REPLACE INTO waist (day, cm, ts) VALUES (?, ?, ?)`).bind(local(s.tz).day, cm, nowSec()).run();
  await send(env, chat,
    `📏 <b>Waist ${cm} cm</b> logged` + (first && first.cm !== cm ? ` (${cm < first.cm ? '−' : '+'}${Math.abs(cm - first.cm).toFixed(1)} cm since your first)` : '') + `.\n` +
    (s.height_cm ? `Waist-to-height: <b>${(cm / s.height_cm).toFixed(2)}</b> (healthy is under 0.50 = ${Math.round(s.height_cm / 2)} cm)\n\n` : '\n') +
    (await goalLines(env)).join('\n') + `\n<i>Measure monthly, same way each time.</i>`);
  await celebrate(env, chat);
}

export const waistCmd = (env: E, chat: number, text: string) => {
  const arg = text.replace(/^\/\S+\s*/, '');
  return waist(env, chat, arg ? parseWaist(/[a-z"]/i.test(arg) ? arg : `${arg}cm`) : null);
};

/** /goal shows progress; /goal 1800 140 (old form) still sets kcal + protein targets. */
export async function goalCmd(env: E, chat: number, text: string) {
  const nums = text.replace(/^\/\S+/, '').match(/\d+/g);
  if (nums?.length) {
    await saveSettings(env, { kcal_target: Number(nums[0]), ...(nums[1] ? { protein_target: Number(nums[1]) } : {}) });
    return send(env, chat, `🎯 Targets set: ${nums[0]} kcal${nums[1] ? ` · ${nums[1]}g protein` : ''}. /targets shows them all.`);
  }
  const lines = await goalLines(env);
  return send(env, chat, lines.join('\n') || 'No goals set yet. Add weight or waist goals in the app → Settings.');
}
