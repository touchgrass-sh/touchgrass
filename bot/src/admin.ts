import type { E } from './env';
import { recap, waterNudge } from './log';
import { active } from './hooks';
import { registerCommands } from './bot';
import { blocked, hook, sendNudge, tickNudges } from './nudge';
import { getPlan, isDev, PLANS, setPlanOverride, type Plan } from './plan';
import { delState, getSettings, getState, setState } from './store';
import { edit, send, type Button } from './tg';
import { local, nowSec } from './time';
import { FACE } from './voice';

// /admin: our own test bot only (DEV=1). Switch plan to see each tier, and fire any scheduled or
// agent-driven message on demand instead of waiting for the clock.

const PLAN_LABEL: Record<Plan, string> = { user: '🌱 user (free)', sudo: '⚡ sudo', root: '👑 root' };

async function panel(env: E): Promise<[string, Button[][]]> {
  const s = await getSettings(env);
  const plan = await getPlan(env);
  const day = new Date().toISOString().slice(0, 10);
  const ai = await env.DB.prepare(`SELECT neurons, calls FROM ai_usage WHERE day = ?`).bind(day).first<{ neurons: number; calls: number }>();
  const why = await blocked(env, s);
  const text = [
    `🛠 <b>admin</b> <i>(test bot only)</i>`,
    '',
    `plan: <b>${PLAN_LABEL[plan]}</b>`,
    `AI today: ${ai?.neurons ?? 0} / 9000 neurons · ${ai?.calls ?? 0} calls`,
    `agent nudges right now: ${why ? `⛔ ${why}` : '✅ allowed'}`,
    `local time: ${local(s.tz).hhmm} (${s.tz})`,
  ].join('\n');
  const rows: Button[][] = [
    PLANS.map((p) => ({ text: `${p === plan ? '✓ ' : ''}${p}`, data: `ad:plan:${p}` })),
    [{ text: '🏃 fake agent run', data: 'ad:agent' }, { text: '🏁 agent finished', data: 'ad:stop' }],
    [{ text: '💪 nudge now (no rules)', data: 'ad:nudge' }],
    [{ text: '🌅 window opens', data: 'ad:r:open' }, { text: '⏳ 30 min left', data: 'ad:r:last30' }, { text: '🌙 window closes', data: 'ad:r:close' }],
    [{ text: '💧 water nudge', data: 'ad:r:water' }, { text: '📰 morning recap', data: 'ad:recap' }],
    [{ text: '🗑 reset today', data: 'ad:reset' }, { text: '🔄 refresh', data: 'ad:refresh' }],
  ];
  return [text, rows];
}

export async function showAdmin(env: E, chat: number, msgId?: number) {
  const [text, rows] = await panel(env);
  return msgId ? edit(env, chat, msgId, text, rows) : send(env, chat, text, rows);
}

export async function adminButton(env: E, chat: number, msgId: number, val: string) {
  if (!isDev(env)) return;
  const [what, arg] = val.split(/:(.*)/s);
  const s = await getSettings(env);

  switch (what) {
    case 'plan':
      if ((PLANS as readonly string[]).includes(arg)) await setPlanOverride(env, arg as Plan);
      // The command list depends on the plan.
      await registerCommands(env);
      return showAdmin(env, chat, msgId);

    case 'agent': {
      // Pretend Claude Code started thinking `wait_sec` ago, then run the real cron check.
      const session = `admin-${nowSec()}`;
      await env.DB.prepare(`INSERT INTO hook_events (agent, session, kind, ts) VALUES ('test', ?, 'start', ?)`)
        .bind(session, nowSec() - s.wait_sec - 1).run();
      await setState(env, 'admin_session', session);
      const why = await blocked(env, s);
      if (why) {
        // Close it again so the real cron doesn't nudge for it later.
        await env.DB.prepare(`INSERT INTO hook_events (agent, session, kind, ts) VALUES ('test', ?, 'stop', ?)`).bind(session, nowSec()).run();
        return send(env, chat, `🛠 fake agent run: <b>no nudge</b>, because ${why}.\nchange it in /settings, or use "nudge now".`);
      }
      await tickNudges(env);
      return send(env, chat, '🛠 fake agent started. tap 🏁 <b>agent finished</b> without answering the nudge to see the "agent done" message.');
    }

    case 'stop': {
      const session = await getState(env, 'admin_session');
      if (!session) return send(env, chat, '🛠 no fake agent running. tap 🏃 first');
      await delState(env, 'admin_session');
      await hook(env, { event: 'stop', agent: 'test', session });
      return send(env, chat, '🛠 fake agent finished. (you only get "agent done" if its nudge went unanswered)');
    }

    case 'nudge':
      return sendNudge(env, chat, s, null);

    case 'r': {
      if (arg === 'water') return waterNudge(env, chat, s);
      // Eating-window messages come from the sudo pack.
      const fire = (await active(env)).map((a) => a.reminders?.[arg]).find(Boolean);
      return fire ? fire(env, chat, s) : send(env, chat, '🛠 that one needs the sudo plan (fasting)');
    }

    case 'recap':
      return recap(env, chat, s, true);

    case 'reset': {
      const day = local(s.tz).day;
      const start = Math.floor(new Date(`${day}T00:00:00Z`).getTime() / 1000) - 14 * 3600;
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM nudges WHERE day = ?`).bind(day),
        env.DB.prepare(`DELETE FROM meals WHERE day = ?`).bind(day),
        env.DB.prepare(`DELETE FROM water WHERE day = ?`).bind(day),
        env.DB.prepare(`DELETE FROM weights WHERE day = ?`).bind(day),
        // Fasts that began from roughly the start of today in any timezone.
        env.DB.prepare(`DELETE FROM fasts WHERE start >= ?`).bind(start),
        env.DB.prepare(`DELETE FROM sent WHERE key LIKE ?`).bind(`%:${day}`),
        env.DB.prepare(`DELETE FROM state WHERE key IN ('snooze_until', 'awaiting')`),
      ]);
      await send(env, chat, `${FACE.idle} 🛠 today wiped: moves, meals, water, weight, fasts, reminders, snooze.`);
      return showAdmin(env, chat);
    }

    case 'refresh':
      return showAdmin(env, chat, msgId);
  }
}
