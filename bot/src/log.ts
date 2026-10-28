import type { FoodItem } from './ai';
import { caffeineLines } from './caffeine';
import type { E, Settings } from './env';
import { active, lines, sendTagged } from './hooks';
import { streakDays } from './nudge';
import { getSettings, getState, once } from './store';
import { edit, send, type Button } from './tg';
import { inWindow, local, nowSec, toMins } from './time';
import { FACE } from './voice';

// The free daily log: water, /today and the morning recap (BOT_SPEC §4). No AI anywhere on the free plan.
// Weight, fasting and exercise are the free pack (src/free/), AI food is the sudo pack (src/addons/sudo/); both add
// their lines through src/hooks.ts.

// ---------- shared by caffeine (free) and food (sudo) ----------

export const kcalOf = (items: FoodItem[]) => Math.round(items.reduce((t, i) => t + (Number(i.kcal) || 0), 0));

/**
 * Over ~25 kcal outside the eating window breaks the fast (black coffee, a splash of milk, diet drinks don't).
 * Tonight's /late extension (state `late`) counts as inside.
 */
async function outsideWindow(env: E, s: Settings, kcal: number) {
  if (!s.window_start || !s.window_end || kcal <= 25) return false;
  const t = local(s.tz);
  const late = await getState(env, 'late');
  const l = late ? (JSON.parse(late) as { day: string; end: string }) : null;
  return !inWindow(t.mins, s.window_start, l?.day === t.day ? l.end : s.window_end);
}

export async function saveMeal(env: E, s: Settings, label: string, items: FoodItem[] | null, photo?: string, kind: string | null = null, source: string | null = null) {
  const kcal = items ? kcalOf(items) : null;
  const out = await outsideWindow(env, s, kcal ?? 0);
  const r = await env.DB.prepare(`INSERT INTO meals (ts, day, label, kcal, items, photo, kind, source, outside_window) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`)
    .bind(nowSec(), local(s.tz).day, label.slice(0, 80), kcal, items ? JSON.stringify(items) : null, photo ?? null, kind, source ?? kind, out ? 1 : 0)
    .first<{ id: number }>();
  return r!.id;
}

export const hm = (sec: number) => `${Math.floor(sec / 3600)}h ${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}m`;

// ---------- water (Jake's: four sizes, undo, typed amounts, nudges only when behind) ----------

const L = (ml: number) => (ml >= 1000 ? `${(ml / 1000).toFixed(ml % 1000 ? 1 : 0)}L` : `${ml}ml`);

/** `keep` = the buttons sit on a message that must stay (the morning one), so taps reply fresh instead of editing. */
export const waterButtons = (keep = false): Button[][] => {
  const k = keep ? ':n' : '';
  return [
    [{ text: '🥛 Glass 250ml', data: `w:250${k}` }, { text: '🍶 Bottle 500ml', data: `w:500${k}` }],
    [{ text: '🥤 750ml', data: `w:750${k}` }, { text: '🫗 1 litre', data: `w:1000${k}` }],
  ];
};

export async function waterToday(env: E, day: string) {
  const r = await env.DB.prepare(`SELECT COALESCE(SUM(ml), 0) AS ml FROM water WHERE day = ?`).bind(day).first<{ ml: number }>();
  return r?.ml ?? 0;
}

const waterBar = (ml: number, target: number) => {
  const n = Math.min(10, Math.round((ml / target) * 10));
  return '🟦'.repeat(n) + '⬜'.repeat(10 - n);
};

async function waterCard(env: E, added: number | null, id: number | null) {
  const s = await getSettings(env);
  const ml = await waterToday(env, local(s.tz).day);
  const left = s.water_ml - ml;
  const text = `${added ? `💧 <b>+${L(added)}</b> logged\n` : ''}${waterBar(ml, s.water_ml)}\n<b>${L(ml)} / ${L(s.water_ml)}</b> today` +
    (left > 0 ? ` · ${L(left)} to go` : ` · ${FACE.proud} target hit!`);
  const rows = waterButtons();
  if (id) rows.push([{ text: '↩️ Undo', data: `wu:${id}` }]);
  return { text, rows };
}

export async function logWater(env: E, ml: number) {
  const s = await getSettings(env);
  const r = await env.DB.prepare(`INSERT INTO water (ts, day, ml) VALUES (?, ?, ?) RETURNING id`).bind(nowSec(), local(s.tz).day, Math.round(ml)).first<{ id: number }>();
  return r!.id;
}

/** /water, /water 330, /water 1.5l. */
export async function showWater(env: E, chat: number, text = '') {
  const ml = parseAmount(text.replace(/^\/\S+\s*/, ''));
  return typedWater(env, chat, ml);
}

export async function typedWater(env: E, chat: number, ml: number | null) {
  if (ml) {
    const id = await logWater(env, ml);
    const c = await waterCard(env, ml, id);
    return send(env, chat, c.text, c.rows);
  }
  const c = await waterCard(env, null, null);
  return send(env, chat, `💧 How much?\n${c.text}`, c.rows);
}

/** Button w:<ml> (edits the card so a run of taps doesn't flood the chat) or w:<ml>:n (replies fresh). */
export async function addWater(env: E, chat: number, msgId: number, val: string) {
  const [mlS, n] = val.split(':');
  const ml = Number(mlS);
  if (![250, 500, 750, 1000].includes(ml)) return;
  if (n === 'n') return typedWater(env, chat, ml);
  const id = await logWater(env, ml);
  const c = await waterCard(env, ml, id);
  return edit(env, chat, msgId, c.text, c.rows);
}

/** wu:<id>. */
export async function undoWater(env: E, chat: number, msgId: number, val: string) {
  await env.DB.prepare(`DELETE FROM water WHERE id = ?`).bind(Number(val)).run();
  const c = await waterCard(env, null, null);
  return edit(env, chat, msgId, `↩️ Removed.\n${c.text}`, c.rows);
}

/**
 * "water", "glass of water", "500ml water", "1.5l", "a pint of water" → ml (null = ask with buttons).
 * Undefined if the text isn't about water at all. Only if every word is water-ish: "eggs and a glass of water" is a meal.
 */
export function parseWater(t: string): number | null | undefined {
  const s = t.trim().toLowerCase();
  if (!/\bwater\b/.test(s) && !/^\d+(\.\d+)?\s*(ml|l|litres?|liters?)$/.test(s)) return undefined;
  const leftover = s.replace(/\d+(\.\d+)?\s*(ml|l|litres?|liters?)\b/g, ' ')
    .replace(/\b(i|just|had|drank|drink|a|an|another|some|of|glass|glasses|bottle|bottles|big|small|large|pint|pints|cup|cups|mug|mugs|water|sparkling|still|tap|fizzy|cold|please)\b/g, ' ')
    .replace(/[^a-z]/g, '');
  if (leftover) return undefined;
  const m = s.match(/(\d+(?:\.\d+)?)\s*(ml|l|litres?|liters?)\b/);
  if (m) return m[2] === 'ml' ? Number(m[1]) : Number(m[1]) * 1000;
  const n = Number(s.match(/(\d+)\s*(?:big\s+)?(?:glass|cup|mug|bottle|pint)/)?.[1] ?? 1);
  if (/\bpints?\b/.test(s)) return 568 * n;
  if (/\bbig bottles?\b/.test(s)) return 750 * n;
  if (/\bbottles?\b/.test(s)) return 500 * n;
  if (/\bglass(es)?\b|\bcups?\b|\bmugs?\b/.test(s)) return 250 * n;
  return null;
}

/** "/water 330", "/water 1.5l", "/water 2" (= 2 litres). */
export function parseAmount(arg: string): number | null {
  const m = arg.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(ml|l|litres?|liters?)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] && m[2] !== 'ml' ? n * 1000 : n < 10 ? n * 1000 : n;
}

/**
 * Only nags if you're behind where you'd want to be by now (target spread evenly across your waking day) and
 * haven't had any in the last hour.
 */
export async function waterNudge(env: E, chat: string | number, s: Settings, force = false) {
  const t = local(s.tz);
  const ml = await waterToday(env, t.day);
  const last = (await env.DB.prepare(`SELECT MAX(ts) t FROM water WHERE day = ?`).bind(t.day).first<{ t: number | null }>())?.t;
  const start = toMins('08:00'), span = 13 * 60;
  const expected = Math.round(s.water_ml * Math.min(1, Math.max(0, (t.mins - start) / span)));
  if (!force && (ml >= expected - 300 || (last && nowSec() - last < 3600))) return;
  const behind = Math.max(0, expected - ml);
  return sendTagged(env, chat, 'water',
    `💧 <b>Water check</b>, you're on ${L(ml)}${behind ? `, about ${L(Math.round(behind / 50) * 50)} behind where you'd want to be by now` : ''}.\nHave a glass and tap:\n${waterBar(ml, s.water_ml)}`,
    waterButtons());
}

// ---------- /today ----------

export async function today(env: E, chat: number) {
  const s = await getSettings(env);
  const day = local(s.tz).day;
  const reps = await env.DB.prepare(`SELECT SUM(status = 'done') AS done, COUNT(*) AS sent FROM nudges WHERE day = ?`)
    .bind(day).first<{ done: number; sent: number }>();
  const streak = await streakDays(env, s);
  return send(env, chat, [
    `${FACE.idle} <b>today</b>`,
    `💪 moves done: ${reps?.done ?? 0}${reps?.sent ? ` of ${reps.sent} nudges` : ''}${streak > 1 ? ` · 🔥 ${streak} days` : ''}`,
    `💧 ${L(await waterToday(env, day))} / ${L(s.water_ml)} water`,
    ...(await caffeineLines(env, day)),
    ...(await lines(env, (a) => a.todayLines?.(env, s, day))),
  ].join('\n'));
}

// ---------- cron: water + recap ----------

/** Every minute. Each message fires once per day via the `sent` table. */
export async function tickReminders(env: E) {
  const chat = await getState(env, 'chat');
  if (!chat) return;
  const s = await getSettings(env);
  const t = local(s.tz);

  // Water checks at 11, 13, 15, 17 and 19 (each sends only if you're behind pace), inside nudge hours.
  for (const h of [11, 13, 15, 17, 19]) {
    const at = h * 60;
    if (t.mins >= at && t.mins < at + 30 && inWindow(t.mins, s.hours_start, s.hours_end) && !(s.weekdays_only && t.weekend) && (await once(env, `water${h}:${t.day}`))) {
      await waterNudge(env, chat, s);
    }
  }

  // Morning recap of yesterday, when nudge hours start. A pack with its own morning message (sudo) replaces it.
  if ((await active(env)).some((a) => a.ownsMorning)) return;
  if (inWindow(t.mins, s.hours_start, s.hours_end) && (await once(env, `recap:${t.day}`))) await recap(env, chat, s);
}

// ---------- morning recap ----------

/** Yesterday in one message. No AI. Skipped if nothing at all happened. */
export async function recap(env: E, chat: string | number, s: Settings, force = false) {
  const d = new Date(local(s.tz).day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  const day = d.toISOString().slice(0, 10);
  const reps = await env.DB.prepare(
    `SELECT COALESCE(SUM(status = 'done'), 0) AS done, COALESCE(SUM(status = 'skipped'), 0) AS skipped, COUNT(*) AS sent FROM nudges WHERE day = ?`,
  ).bind(day).first<{ done: number; skipped: number; sent: number }>();
  const ml = await waterToday(env, day);
  const extra = [...(await caffeineLines(env, day)), ...(await lines(env, (a) => a.recapLines?.(env, s, day)))];
  const empty = !reps?.sent && !ml && !extra.length;
  if (empty && !force) return;

  const streak = await streakDays(env, s);
  return send(env, chat, [
    `${FACE.idle} <b>yesterday</b>`,
    `💪 ${reps?.done ?? 0} moves done${reps?.sent ? `, ${reps.skipped} skipped` : ''}${streak > 1 ? ` · 🔥 ${streak} days` : ''}`,
    `💧 ${(ml / 1000).toFixed(1)}L of ${s.water_ml / 1000}L`,
    ...extra,
    '',
    empty ? 'quiet day. today\'s a fresh one 🌱' : 'new day. go touch some grass 🌱',
  ].join('\n'));
}
