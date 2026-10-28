import type { E, Settings } from './env';
import { getState, setState } from './store';
import { send } from './tg';
import { local } from './time';
import { FACE } from './voice';

// Streak + move-count badges (free core). Plain numbers from D1, no AI. Earned once, kept forever.

export const STREAK = [3, 7, 14, 30, 60, 100, 200, 365];
export const MOVES = [10, 50, 100, 250, 500, 1000, 2500];

type Earned = Record<string, string>; // badge id → day earned

export const badgeName = (id: string) => (id.startsWith('s') ? `🔥 ${id.slice(1)}-day streak` : `💪 ${id.slice(1)} moves`);

export async function earned(env: E): Promise<Earned> {
  return JSON.parse((await getState(env, 'badges')) ?? '{}');
}

/** After each ✅ done: award any badge reached for the first time. */
export async function checkBadges(env: E, chat: number, s: Settings, streak: number) {
  const have = await earned(env);
  const total = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM nudges WHERE status = 'done'`).first<{ n: number }>())?.n ?? 0;
  const day = local(s.tz).day;
  const fresh = [
    ...STREAK.filter((n) => streak >= n).map((n) => `s${n}`),
    ...MOVES.filter((n) => total >= n).map((n) => `m${n}`),
  ].filter((id) => !have[id]);
  if (!fresh.length) return;
  for (const id of fresh) have[id] = day;
  await setState(env, 'badges', JSON.stringify(have));
  return send(env, chat, `${FACE.celebrate} <b>new badge${fresh.length > 1 ? 's' : ''}</b>\n${fresh.map(badgeName).join('\n')}\n\nall of them: /badges`);
}

export async function badgesCmd(env: E, chat: number) {
  const have = await earned(env);
  const ids = Object.keys(have);
  const next = [STREAK.map((n) => `s${n}`).find((id) => !have[id]), MOVES.map((n) => `m${n}`).find((id) => !have[id])].filter(Boolean) as string[];
  return send(env, chat, [
    `${FACE.proud} <b>badges</b> (${ids.length})`,
    ids.length ? ids.map((id) => `${badgeName(id)} · ${have[id]}`).join('\n') : 'none yet. finish a nudge to start',
    '',
    next.length ? `next: ${next.map(badgeName).join(', ')}` : 'you have them all. go outside 🌱',
  ].join('\n'));
}
