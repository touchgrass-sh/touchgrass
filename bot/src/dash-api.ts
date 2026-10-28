import { earned, MOVES, STREAK } from './badges';
import { registerCommands } from './bot';
import { CAFFEINE_MAX, caffeineToday, DRINK_LIST, logKey } from './caffeine';
import type { E } from './env';
import { active } from './hooks';
import { waterToday } from './log';
import { sendNudge, streakDays } from './nudge';
import { getPlan, isDev, PLANS, setPlanOverride, type Plan } from './plan';
import { isOwner, json } from './settings-api';
import { getSettings, getState } from './store';
import { local, nowSec } from './time';
import { undoLastRow } from './undo';

// Backend for the mini app dashboard (src/app.ts). GET = everything the tabs show; POST { action } = the
// buttons. Same owner check as /api/settings. Paid packs add their own data and buttons via src/hooks.ts.

const addDays = (day: string, n: number) => {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** `view` = another day for the Meals tab (YYYY-MM-DD). */
async function snapshot(env: E, view?: string) {
  const s = await getSettings(env);
  const day = local(s.tz).day;
  const from = addDays(day, -6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));

  const moves = await env.DB.prepare(`SELECT SUM(status = 'done') AS done, COUNT(*) AS sent FROM nudges WHERE day = ?`).bind(day)
    .first<{ done: number | null; sent: number }>();
  const weekMoves = (await env.DB.prepare(`SELECT day, SUM(status = 'done') AS n FROM nudges WHERE day >= ? GROUP BY day`).bind(from)
    .all<{ day: string; n: number }>()).results;
  const weekWater = (await env.DB.prepare(`SELECT day, SUM(ml) AS n FROM water WHERE day >= ? GROUP BY day`).bind(from)
    .all<{ day: string; n: number }>()).results;
  const total = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM nudges WHERE status = 'done'`).first<{ n: number }>())?.n ?? 0;
  const have = await earned(env);
  const pick = (rows: { day: string; n: number }[]) => days.map((d) => rows.find((r) => r.day === d)?.n ?? 0);

  const packs: Record<string, unknown> = {};
  for (const a of await active(env)) {
    try {
      Object.assign(packs, await a.dash?.(env, s, day, view));
    } catch (err) {
      console.warn('[addon] dash failed', err);
    }
  }

  return {
    ok: true,
    plan: await getPlan(env),
    dev: isDev(env),
    name: s.name,
    day,
    today: {
      moves: { done: moves?.done ?? 0, sent: moves?.sent ?? 0 },
      streak: await streakDays(env, s),
      water: { ml: await waterToday(env, day), target: s.water_ml },
      caffeine: { ...(await caffeineToday(env, day)), max: CAFFEINE_MAX, cutoff: s.caffeine_cutoff },
    },
    week: { days, moves: pick(weekMoves), water: pick(weekWater), water_target: s.water_ml },
    badges: {
      total,
      list: [...STREAK.map((n) => ({ id: `s${n}`, label: `${n}-day streak`, icon: '🔥' })), ...MOVES.map((n) => ({ id: `m${n}`, label: `${n} moves`, icon: '💪' }))]
        .map((b) => ({ ...b, on: have[b.id] ?? null })),
    },
    drinks: DRINK_LIST,
    ...packs,
  };
}

export async function dashApi(env: E, req: Request): Promise<Response> {
  if (!(await isOwner(env, req))) return json({ ok: false, error: 'open this from your bot in Telegram' }, 401);
  if (req.method === 'GET') return json(await snapshot(env, new URL(req.url).searchParams.get('day') ?? undefined));
  if (req.method !== 'POST') return json({ ok: false, error: 'GET or POST' }, 405);

  const body: any = await req.json().catch(() => ({}));
  const s = await getSettings(env);
  let toast = '';
  switch (body.action) {
    case 'water': {
      const ml = Number(body.ml);
      if (![250, 500, 750, 1000].includes(ml)) return json({ ok: false, error: 'water: 250, 500, 750 or 1000' }, 400);
      await env.DB.prepare(`INSERT INTO water (ts, day, ml) VALUES (?, ?, ?)`).bind(nowSec(), local(s.tz).day, ml).run();
      toast = `💧 +${ml}ml`;
      break;
    }
    case 'caffeine':
      toast = (await logKey(env, String(body.key))) ? '☕ logged' : 'already got that one';
      break;
    case 'undo': {
      const what = await undoLastRow(env);
      toast = what ? `↩️ removed ${what}` : 'nothing to undo today';
      break;
    }
    case 'nudge': {
      const chat = await getState(env, 'chat');
      if (!chat) return json({ ok: false, error: 'say hi to the bot first' }, 400);
      await sendNudge(env, chat, s, null);
      toast = '💪 move sent to your chat';
      break;
    }
    case 'plan':
      if (!isDev(env) || !(PLANS as readonly string[]).includes(body.plan)) return json({ ok: false, error: 'not allowed' }, 403);
      await setPlanOverride(env, body.plan as Plan);
      await registerCommands(env);
      toast = `plan: ${body.plan}`;
      break;
    default: {
      // A pack's button, e.g. sudo's "fast" or "weight".
      const run = (await active(env)).map((a) => a.dashActions?.[body.action]).find(Boolean);
      if (!run) return json({ ok: false, error: 'that needs a paid plan' }, 403);
      try {
        toast = await run(env, body);
      } catch (err) {
        return json({ ok: false, error: (err as Error).message }, 400);
      }
    }
  }
  return json({ ...(await snapshot(env, body.view)), toast });
}
