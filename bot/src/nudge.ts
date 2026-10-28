import type { E, Level, Settings } from './env';
import { getOwner, getSettings, getState, once, setState } from './store';
import { edit, send } from './tg';
import { inWindow, local, nowSec } from './time';
import { FACE, line } from './voice';
import { custom } from './custom';
import { maybeAskReview } from './account';
import { checkBadges } from './badges';
import { active } from './hooks';

// Agent-time nudges (BOT_SPEC §3). The CLI hook posts `start` when the agent starts thinking and `stop` when
// it's done. A cron tick every minute looks for agents that are *still* busy after `wait_sec`, and if the
// rules allow it, sends one move with done/skip/snooze buttons. Lines are canned, so no AI is used.

type Move = { name: string; n: Record<Level, number>; unit: 'reps' | 'sec' };

const BUILT_IN: Move[] = [
  { name: 'squats', n: { easy: 5, normal: 12, spicy: 25 }, unit: 'reps' },
  { name: 'wall push-ups', n: { easy: 5, normal: 12, spicy: 20 }, unit: 'reps' },
  { name: 'calf raises', n: { easy: 10, normal: 20, spicy: 40 }, unit: 'reps' },
  { name: 'lunges', n: { easy: 4, normal: 10, spicy: 20 }, unit: 'reps' },
  { name: 'shoulder rolls', n: { easy: 10, normal: 15, spicy: 20 }, unit: 'reps' },
  { name: 'seconds of plank', n: { easy: 15, normal: 30, spicy: 60 }, unit: 'sec' },
  { name: 'seconds of stretching', n: { easy: 30, normal: 45, spicy: 60 }, unit: 'sec' },
  { name: 'seconds walking about', n: { easy: 60, normal: 90, spicy: 120 }, unit: 'sec' },
];

// src/custom/ can add moves or replace the list (see that file).
const MOVES: Move[] = custom.replaceMoves && custom.moves?.length ? custom.moves : [...BUILT_IN, ...(custom.moves ?? [])];

const MAX_AGE = 30 * 60; // a `start` older than this with no `stop` is a crashed/abandoned session

/** POST /hook body: { event: "start" | "stop", agent?: string, session?: string } */
export async function hook(env: E, body: any) {
  const event = body?.event;
  if (event !== 'start' && event !== 'stop') return { ok: false, error: 'event must be start or stop' };
  const agent = String(body.agent ?? 'claude').slice(0, 20);
  const session = String(body.session ?? 'default').slice(0, 80);
  await env.DB.prepare(`INSERT INTO hook_events (agent, session, kind, ts) VALUES (?, ?, ?, ?)`)
    .bind(agent, session, event, nowSec()).run();
  if (event === 'stop') await agentDone(env, session);
  return { ok: true };
}

/**
 * Agent finished: only speak up if a nudge for this session went unanswered, and only once per nudge. A coding
 * agent stops after every turn, so without the `once` one ignored nudge pinged on every stop for 30 min (10-27).
 */
async function agentDone(env: E, session: string) {
  const n = await env.DB.prepare(`SELECT id FROM nudges WHERE session = ? AND status = 'sent' AND ts > ? ORDER BY ts DESC LIMIT 1`)
    .bind(session, nowSec() - MAX_AGE).first<{ id: number }>();
  if (!n || !(await once(env, `agentdone:${n.id}`))) return;
  const chat = await getState(env, 'chat');
  const s = await getSettings(env);
  if (chat) await send(env, chat, `${FACE.grass} ${line(s.personality, 'agent_done')}`);
}

/** Every minute: nudge for agents still busy past `wait_sec`, if the rules allow. */
export async function tickNudges(env: E) {
  const chat = await getState(env, 'chat');
  if (!chat || (await getOwner(env)) === null) return;
  const s = await getSettings(env);
  const now = nowSec();

  // Latest event per session in the last 30 min, keeping sessions whose latest event is a `start`.
  const { results } = await env.DB.prepare(`
    SELECT session, kind, ts FROM hook_events h
    WHERE ts > ? AND id = (SELECT MAX(id) FROM hook_events WHERE session = h.session)`)
    .bind(now - MAX_AGE).all<{ session: string; kind: string; ts: number }>();
  const busy = results.find((r) => r.kind === 'start' && now - r.ts >= s.wait_sec);
  if (!busy) return;

  // One nudge per thinking session.
  const already = await env.DB.prepare(`SELECT 1 FROM nudges WHERE session = ? AND ts >= ?`).bind(busy.session, busy.ts).first();
  if (already) return;

  if (await blocked(env, s, now)) return;
  await sendNudge(env, chat, s, busy.session);
}

/** Why a nudge can't go out right now (hours, weekday, snooze, cooldown, daily cap), or null if it can. */
export async function blocked(env: E, s: Settings, now = nowSec()): Promise<string | null> {
  const t = local(s.tz);
  if (s.weekdays_only && t.weekend) return 'it\'s the weekend and nudges are weekdays only';
  if (!inWindow(t.mins, s.hours_start, s.hours_end)) return `it's ${t.hhmm}, outside your nudge hours (${s.hours_start}–${s.hours_end})`;
  if (Number((await getState(env, 'snooze_until')) ?? 0) > now) return 'you snoozed nudges for an hour';
  // Only agent nudges count: trying one with /nudge or the dashboard must not block the real ones.
  const last = await env.DB.prepare(`SELECT MAX(ts) AS ts FROM nudges WHERE session IS NOT NULL`).first<{ ts: number | null }>();
  if (last?.ts && now - last.ts < s.cooldown_min * 60) {
    return `cooldown: last nudge was ${Math.round((now - last.ts) / 60)} min ago, gap is ${s.cooldown_min} min`;
  }
  const today = await env.DB.prepare(`SELECT COUNT(*) AS n FROM nudges WHERE day = ? AND session IS NOT NULL`).bind(t.day).first<{ n: number }>();
  if ((today?.n ?? 0) >= s.daily_cap) return `daily cap reached (${s.daily_cap} nudges)`;
  return null;
}

/** Send one move. Also used by /nudge, which skips the rules. */
export async function sendNudge(env: E, chat: string | number, s: Settings, session: string | null) {
  const move = await pickMove(env);
  const n = move.n[s.level];
  const t = local(s.tz);
  const r = await env.DB.prepare(`INSERT INTO nudges (ts, day, move, reps, unit, session) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`)
    .bind(nowSec(), t.day, move.name, n, move.unit, session).first<{ id: number }>();
  const id = r!.id;
  const m = await send(env, chat, `${FACE.flex} ${line(s.personality, 'nudge', { n, move: move.name })}`, [[
    { text: '✅ done', data: `nd:${id}` }, { text: '⏭ skip', data: `ns:${id}` }, { text: '😴 1h', data: `nz:${id}` },
  ]]);
  if (m?.message_id) await env.DB.prepare(`UPDATE nudges SET msg_id = ? WHERE id = ?`).bind(m.message_id, id).run();
}

/** Rotate moves so the same one doesn't come up twice in a row. */
async function pickMove(env: E) {
  const last = await env.DB.prepare(`SELECT move FROM nudges ORDER BY id DESC LIMIT 1`).first<{ move: string }>();
  const pool = MOVES.filter((m) => m.name !== last?.move);
  return pool[Math.floor(Math.random() * pool.length)];
}

/** done / skip / snooze buttons on a nudge. */
export async function nudgeButton(env: E, chat: number, msgId: number, kind: string, id: number) {
  const n = await env.DB.prepare(`SELECT move, reps, unit, status FROM nudges WHERE id = ?`).bind(id)
    .first<{ move: string; reps: number; unit: string; status: string }>();
  if (!n || n.status !== 'sent') return;
  const s = await getSettings(env);
  const what = `${n.reps} ${n.move}`;

  if (kind === 'nd') {
    await env.DB.prepare(`UPDATE nudges SET status = 'done' WHERE id = ?`).bind(id).run();
    const streak = await streakDays(env, s);
    const tail = streak > 1 ? `\n🔥 ${streak} days in a row` : '';
    await edit(env, chat, msgId, `${FACE.proud} ${what}. ${line(s.personality, 'done')}${tail}`);
    await checkBadges(env, chat, s, streak);
    for (const a of await active(env)) await a.onMoveDone?.(env, chat, s, streak);
    return maybeAskReview(env, chat, s, streak);
  }
  if (kind === 'ns') {
    await env.DB.prepare(`UPDATE nudges SET status = 'skipped' WHERE id = ?`).bind(id).run();
    return edit(env, chat, msgId, `${FACE.idle} <s>${what}</s>. ${line(s.personality, 'skip')}`);
  }
  if (kind === 'nz') {
    await env.DB.prepare(`UPDATE nudges SET status = 'snoozed' WHERE id = ?`).bind(id).run();
    await setState(env, 'snooze_until', String(nowSec() + 3600));
    return edit(env, chat, msgId, `${FACE.zz} ${line(s.personality, 'snooze')}`);
  }
}

/** Consecutive days (ending today or yesterday) with at least one nudge done. */
export async function streakDays(env: E, s: Settings) {
  const { results } = await env.DB.prepare(`SELECT DISTINCT day FROM nudges WHERE status = 'done' ORDER BY day DESC LIMIT 400`)
    .all<{ day: string }>();
  const days = new Set(results.map((r) => r.day));
  const d = new Date(local(s.tz).day + 'T12:00:00Z');
  if (!days.has(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() - 1);
  let n = 0;
  while (days.has(d.toISOString().slice(0, 10))) {
    n++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return n;
}
