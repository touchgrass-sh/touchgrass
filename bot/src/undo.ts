import type { E } from './env';
import { getSettings } from './store';
import { edit, esc, send, type Button } from './tg';
import { local } from './time';
import { FACE } from './voice';

// /undo never deletes straight away (Jake's rule): pick one of today's entries, then confirm. Water, caffeine,
// food, weight and exercise. The mini app's undo button removes the newest one straight away.

type Table = 'water' | 'meals' | 'weights' | 'exercise';
const TABLES: Table[] = ['water', 'meals', 'weights', 'exercise'];
interface Row { t: Table; k: string; ts: number; what: string }

async function todayRows(env: E, limit: number) {
  const day = local((await getSettings(env)).tz).day;
  return (await env.DB.prepare(
    `SELECT 'water' AS t, CAST(id AS TEXT) AS k, ts, '💧 Water ' || ml || 'ml' AS what FROM water WHERE day = ?1
     UNION ALL SELECT 'meals', CAST(id AS TEXT), ts, CASE WHEN kind = 'caffeine' THEN '☕ ' ELSE '🍽 ' END || label || COALESCE(' · ' || kcal || ' kcal', '') FROM meals WHERE day = ?1
     UNION ALL SELECT 'weights', day, ts, '⚖️ ' || kg || 'kg weigh-in' FROM weights WHERE day = ?1
     UNION ALL SELECT 'exercise', CAST(id AS TEXT), ts, CASE WHEN kind = 'skip' THEN '🪢 Skipping ' || CAST(ROUND(minutes, 1) AS TEXT) || ' min' ELSE '💥 ' || reps || ' burpees' END FROM exercise WHERE day = ?1
     ORDER BY ts DESC LIMIT ?2`,
  ).bind(day, limit).all<Row>()).results;
}

async function deleteRow(env: E, t: Table, k: string) {
  await env.DB.prepare(`DELETE FROM ${t} WHERE ${t === 'weights' ? 'day' : 'id'} = ?`).bind(t === 'weights' ? k : Number(k)).run();
}

/** Deletes the newest log today. Returns what it removed, or null if there was nothing. */
export async function undoLastRow(env: E) {
  const [last] = await todayRows(env, 1);
  if (!last) return null;
  await deleteRow(env, last.t, last.k);
  return last.what;
}

const hhmm = (tz: string, ts: number) => local(tz, new Date(ts * 1000)).hhmm;

async function listView(env: E): Promise<{ text: string; rows?: Button[][] }> {
  const rows = await todayRows(env, 8);
  if (!rows.length) return { text: `${FACE.idle} nothing logged today to undo` };
  const { tz } = await getSettings(env);
  return {
    text: "↩️ <b>Remove which one?</b> Today's latest entries (you'll confirm on the next tap):",
    rows: [
      ...rows.map((r) => [{ text: `🗑️ ${hhmm(tz, r.ts)} ${r.what}`.slice(0, 60), data: `un:${r.t}:${r.k}` }]),
      [{ text: '✋ Cancel', data: 'un:done' }],
    ],
  };
}

export async function undoLast(env: E, chat: number) {
  const v = await listView(env);
  return send(env, chat, v.text, v.rows);
}

const find = async (env: E, t: Table, k: string) => (await todayRows(env, 50)).find((r) => r.t === t && r.k === k);

/** un:<table>:<key> asks to confirm · un:yes:<table>:<key> removes · un:list back · un:done cancel. */
export async function undoButton(env: E, chat: number, msgId: number, val: string) {
  if (val === 'done') return edit(env, chat, msgId, '✋ Nothing removed.');
  if (val === 'list') {
    const v = await listView(env);
    return edit(env, chat, msgId, v.text, v.rows);
  }
  const yes = val.startsWith('yes:');
  const [t, k] = (yes ? val.slice(4) : val).split(/:(.*)/s) as [Table, string];
  if (!TABLES.includes(t) || !k) return;
  const e = await find(env, t, k);
  if (!e) return edit(env, chat, msgId, 'That entry is already gone.');
  const { tz } = await getSettings(env);
  if (!yes) {
    return edit(env, chat, msgId, `🗑️ Remove <b>${esc(e.what)}</b> (logged ${hhmm(tz, e.ts)})?`, [
      [{ text: '🗑️ Yes, remove it', data: `un:yes:${t}:${k}` }, { text: '✋ Keep it', data: 'un:done' }],
      [{ text: '← Back to list', data: 'un:list' }],
    ]);
  }
  await deleteRow(env, t, k);
  return edit(env, chat, msgId, `↩️ Removed <b>${esc(e.what)}</b>.`, [[{ text: '↩️ Undo something else', data: 'un:list' }]]);
}
