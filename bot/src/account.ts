import type { E, Settings } from './env';
import { getSettings, getState, setState } from './store';
import { edit, send, tg, type Button } from './tg';
import { local } from './time';
import { FACE } from './voice';

// Your data (BOT_SPEC §4, build step 5): /export, /reset, and the one-time review ask.

const REPO = 'https://github.com/touchgrass-sh/touchgrass';

/** Everything the owner logged. Secrets live in Worker secrets, never in D1, so nothing here is sensitive. */
const TABLES = ['nudges', 'hook_events', 'meals', 'fasts', 'weights', 'water', 'pending'] as const;

// ---------- /export ----------

export async function exportData(env: E, chat: number) {
  const s = await getSettings(env);
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), settings: s };
  out.badges = JSON.parse((await getState(env, 'badges')) ?? '{}');
  for (const t of TABLES) out[t] = (await env.DB.prepare(`SELECT * FROM ${t} ORDER BY ${t === 'weights' ? 'day' : 'id'}`).all()).results;

  const form = new FormData();
  form.append('chat_id', String(chat));
  form.append('caption', `${FACE.idle} all your data, as JSON. settings, badges, moves, agent events, meals, fasts, weight, water.`);
  form.append('document', new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }), `touchgrass-${local(s.tz).day}.json`);
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendDocument`, { method: 'POST', body: form });
  const j: any = await r.json();
  if (!j.ok) {
    console.warn('[export] sendDocument failed', j.description);
    return send(env, chat, `${FACE.judging} Telegram wouldn't take the file. try /export again in a bit`);
  }
}

// ---------- /reset ----------

export function askReset(env: E, chat: number) {
  return send(env, chat, [
    `${FACE.judging} <b>wipe everything?</b>`,
    '',
    "this deletes every move, meal, fast, weight, water log, badge and agent event. it can't be undone.",
    'your settings and name stay, and you stay the owner. want a copy first? /export',
  ].join('\n'), [[{ text: '🗑 yes, wipe it all', data: 'rs:yes' }, { text: 'cancel', data: 'rs:no' }]]);
}

export async function resetButton(env: E, chat: number, msgId: number, val: string) {
  if (val !== 'yes') return edit(env, chat, msgId, `${FACE.idle} nothing deleted`);
  await env.DB.batch([
    ...TABLES.map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
    // `sent` (reminder dedupe) and `ai_usage` stay: wiping them would re-send today's reminders and reset the AI budget.
    env.DB.prepare(`DELETE FROM state WHERE key IN ('snooze_until', 'awaiting', 'badges', 'ideas')`),
  ]);
  return edit(env, chat, msgId, `${FACE.idle} done. clean slate 🌱`);
}

// ---------- review ask ----------

/** Once ever, the first time a 7-day streak is reached. Never again, even after /reset. */
export async function maybeAskReview(env: E, chat: number, s: Settings, streak: number) {
  if (streak < 7 || (await getState(env, 'review_asked'))) return;
  await setState(env, 'review_asked', String(Date.now()));
  const rows: Button[][] = [[{ text: '⭐ star touchgrass on GitHub', url: REPO }]];
  return send(env, chat, [
    `${FACE.celebrate} <b>7 days in a row.</b> that's a proper habit${s.name ? `, from ${s.name} and me` : ''}.`,
    '',
    "if I've been useful, a GitHub star helps other chair goblins find this. a line about how it's going to hello@touchgrass.sh helps even more.",
    '',
    "I'll only ask this once.",
  ].join('\n'), rows);
}
