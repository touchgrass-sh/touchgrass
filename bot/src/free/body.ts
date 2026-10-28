import type { E } from '../env';
import { getSettings } from '../store';
import { send } from '../tg';
import { local, nowSec } from '../time';
import { history } from './days';
import { celebrate, goalLines } from './goals';

// free: weigh-ins (ported from Jake). A plain number is a weight: "105.8", "105.8kg", "I'm 105.8kg today",
// "weighed in at 105.8", "16st 9lb". Shown with the change since you started, the 7-day average and the next goal.

/** Weight in plain words → kg, or null. Food like "2 eggs" never matches (needs 30–300 kg or stones). */
export function parseWeight(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/[.!]+$/, '');
  const lead = String.raw`(?:(?:i'?m|im|i am|i'm now|now|weight(?: is)?|weighed(?: in)?(?: at)?|weigh(?:ed)?|weigh-in|scale(?: says)?|today|this morning)\s*:?\s*)*`;
  const tail = String.raw`(?:\s*(?:weight|weigh-in|today|this morning|on the scales?|now))*`;
  const kg = t.match(new RegExp(String.raw`^${lead}(\d{2,3}(?:\.\d+)?)\s*(?:kg|kgs|kilos?|kilograms?)?${tail}$`));
  if (kg && +kg[1] >= 30 && +kg[1] <= 300) return +(+kg[1]).toFixed(1);
  const lb = t.match(new RegExp(String.raw`^${lead}(\d{2,3}(?:\.\d+)?)\s*(?:lb|lbs|pounds?)${tail}$`));
  if (lb && +lb[1] * 0.453592 >= 30 && +lb[1] * 0.453592 <= 300) return +(+lb[1] * 0.453592).toFixed(1);
  const st = t.match(new RegExp(String.raw`^${lead}(\d{1,2})\s*(?:st|stone|stones)\s*(\d{1,2}(?:\.\d+)?)?\s*(?:lb|lbs|pounds?)?${tail}$`));
  if (st) {
    const v = +st[1] * 6.35029 + (st[2] ? +st[2] * 0.453592 : 0);
    if (v >= 30 && v <= 300) return +v.toFixed(1);
  }
  return null;
}

export async function weigh(env: E, chat: number, kg: number) {
  if (!(kg >= 30 && kg <= 300)) return send(env, chat, 'Send your weight in kg, e.g. <code>106.8</code>');
  const s = await getSettings(env);
  await env.DB.prepare(`INSERT OR REPLACE INTO weights (day, kg, ts) VALUES (?, ?, ?)`).bind(local(s.tz).day, kg, nowSec()).run();
  const ws = (await history(env, 14)).filter((d) => d.kg != null).map((d) => d.kg as number);
  const week = ws.slice(-7);
  const avg = week.reduce((x, y) => x + y, 0) / (week.length || 1);
  const change = s.start_weight ? kg - s.start_weight : null;
  const goal = (await goalLines(env))[0];
  await send(env, chat,
    `⚖️ <b>${kg.toFixed(1)} kg</b> logged.\n` +
    (change != null ? `${change <= 0 ? '📉' : '📈'} ${change <= 0 ? '' : '+'}${change.toFixed(1)} kg since you started (${s.start_weight} kg)` : '') +
    (week.length >= 3 ? `\n7-day average: ${avg.toFixed(1)} kg` : '') +
    `\n<i>Daily weight jumps around with water and salt, the trend is what matters.</i>` + (goal ? `\n\n${goal}` : ''));
  await celebrate(env, chat);
}

export async function weightCmd(env: E, chat: number, text: string) {
  const kg = parseWeight(text.replace(/^\/\S+\s*/, ''));
  return kg ? weigh(env, chat, kg) : send(env, chat, 'Send your weight in kg, e.g. <code>/weight 106.8</code>, <code>16st 9</code> or <code>235 lb</code>');
}
