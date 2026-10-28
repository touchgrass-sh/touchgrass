import { webAppUser } from './auth';
import { cleanName, setName } from './bot';
import type { E, Habit, Level, Personality, Settings } from './env';
import { getOwner, getSettings, saveSettings } from './store';
import { parseHHMM, validTz } from './time';
import { PERSONALITIES } from './voice';

// Backend for the settings page (src/app.ts). Telegram signs who opened the page (initData); only the owner
// gets in. Every field is checked here, so a hand-made request can't save junk either.

const LEVELS: Level[] = ['easy', 'normal', 'spicy'];

// Limits the page's sliders use too. Exported so the page and the API agree.
export const LIMITS = {
  wait_sec: { min: 0, max: 600, step: 15 },
  cooldown_min: { min: 5, max: 180, step: 5 },
  daily_cap: { min: 1, max: 30, step: 1 },
  water_ml: { min: 500, max: 5000, step: 250 },
} as const;

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function isOwner(env: E, req: Request) {
  const user = await webAppUser(env.BOT_TOKEN, req.headers.get('x-init-data'));
  const owner = await getOwner(env);
  return user !== null && owner !== null && user === owner;
}

/** Check a patch from the page. Returns the clean patch, or the first problem in plain words. */
export function validate(body: any): { patch: Partial<Settings> } | { error: string } {
  const p: Partial<Settings> = {};
  if (body.name !== undefined) {
    const n = cleanName(String(body.name));
    if (!n) return { error: 'name: 1–24 letters or numbers' };
    p.name = n;
  }
  if (body.personality !== undefined) {
    if (!(body.personality in PERSONALITIES)) return { error: 'unknown personality' };
    p.personality = body.personality as Personality;
  }
  if (body.tz !== undefined) {
    if (!validTz(String(body.tz))) return { error: 'unknown timezone' };
    p.tz = String(body.tz);
  }
  for (const k of ['hours_start', 'hours_end'] as const) {
    if (body[k] === undefined) continue;
    const t = parseHHMM(String(body[k]));
    if (!t) return { error: `${k.replace('_', ' ')}: use HH:MM` };
    p[k] = t;
  }
  if (body.weekdays_only !== undefined) p.weekdays_only = !!body.weekdays_only;
  if (body.level !== undefined) {
    if (!LEVELS.includes(body.level)) return { error: 'unknown level' };
    p.level = body.level;
  }
  if (body.window_start !== undefined || body.window_end !== undefined) {
    if (body.window_start === null && body.window_end === null) {
      p.window_start = p.window_end = null;
    } else {
      const s = parseHHMM(String(body.window_start ?? '')), e = parseHHMM(String(body.window_end ?? ''));
      if (!s || !e) return { error: 'eating window: use HH:MM for both ends' };
      p.window_start = s;
      p.window_end = e;
    }
  }
  if (body.caffeine_cutoff !== undefined) {
    const t = parseHHMM(String(body.caffeine_cutoff));
    if (!t) return { error: 'caffeine cutoff: use HH:MM' };
    p.caffeine_cutoff = t;
  }
  // Food targets (sudo). null = no target.
  for (const [k, min, max] of [['kcal_target', 800, 6000], ['protein_target', 20, 400]] as const) {
    if (body[k] === undefined) continue;
    if (body[k] === null || body[k] === '') {
      p[k] = null;
      continue;
    }
    const v = Number(body[k]);
    if (!Number.isFinite(v) || v < min || v > max) return { error: `${k.replace('_', ' ')}: ${min}–${max}` };
    p[k] = Math.round(v);
  }
  // More sudo numbers (Jake parity). null or '' clears.
  for (const [k, min, max, dp] of [
    ['carbs_target', 0, 1000, 0], ['fat_target', 0, 400, 0], ['start_weight', 30, 300, 1], ['height_cm', 100, 250, 0], ['age', 13, 110, 0],
  ] as const) {
    if (body[k] === undefined) continue;
    if (body[k] === null || body[k] === '') {
      p[k] = null;
      continue;
    }
    const v = Number(body[k]);
    if (!Number.isFinite(v) || v < min || v > max) return { error: `${k.replace('_', ' ')}: ${min}–${max}` };
    p[k] = dp ? Math.round(v * 10) / 10 : Math.round(v);
  }
  if (body.sex !== undefined) {
    if (![null, '', 'm', 'f'].includes(body.sex)) return { error: 'sex: m or f' };
    p.sex = body.sex || null;
  }
  for (const k of ['weight_goals', 'waist_goals'] as const) {
    if (body[k] === undefined) continue;
    const list = (Array.isArray(body[k]) ? body[k] : String(body[k]).split(/[\s,]+/)).filter((x: unknown) => x !== '').map(Number);
    if (list.length > 8 || list.some((v: number) => !Number.isFinite(v) || v < 30 || v > 300)) return { error: `${k.replace('_', ' ')}: up to 8 numbers, 30–300` };
    p[k] = [...new Set<number>(list.map((v: number) => Math.round(v * 10) / 10))].sort((a, b) => b - a);
  }
  for (const [k, lim] of [['weather_lat', 90], ['weather_lon', 180]] as const) {
    if (body[k] === undefined) continue;
    if (body[k] === null || body[k] === '') { p[k] = null; continue; }
    const v = Number(body[k]);
    if (!Number.isFinite(v) || Math.abs(v) > lim) return { error: `${k.replace('_', ' ')}: -${lim} to ${lim}` };
    p[k] = Math.round(v * 100) / 100;
  }
  for (const k of ['food_db', 'food_saved', 'food_off'] as const) if (body[k] !== undefined) p[k] = !!body[k];
  if (body.gif_theme !== undefined) {
    if (!['light', 'dark'].includes(body.gif_theme)) return { error: 'GIF style: light or dark' };
    p.gif_theme = body.gif_theme;
  }
  if (body.shop !== undefined) p.shop = String(body.shop).replace(/[^\p{L}\p{N} '&.-]/gu, '').trim().slice(0, 40);
  if (body.morning !== undefined) {
    if (body.morning === null || body.morning === '') p.morning = null;
    else {
      const t = parseHHMM(String(body.morning));
      if (!t) return { error: 'morning message: use HH:MM' };
      p.morning = t;
    }
  }
  for (const [k, max] of [['goal_burpees', 200], ['goal_skip_min', 60]] as const) {
    if (body[k] === undefined) continue;
    const v = Number(body[k]);
    if (!Number.isFinite(v) || v < 0 || v > max) return { error: `${k.replace('_', ' ')}: 0–${max}` };
    p[k] = Math.round(v * 10) / 10;
  }
  if (body.habits !== undefined) {
    if (!Array.isArray(body.habits) || body.habits.length > 20) return { error: 'habits: up to 20' };
    const out: Habit[] = [];
    for (const h of body.habits) {
      const label = String(h?.label ?? '').trim().slice(0, 30);
      const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20);
      if (!id) return { error: 'habit names need letters or numbers' };
      if (out.some((x) => x.id === id)) return { error: `two habits called ${label}` };
      const remind = h?.remind ? parseHHMM(String(h.remind)) : null;
      if (h?.remind && !remind) return { error: `${label} reminder: use HH:MM` };
      out.push({ id, label, icon: String(h?.icon ?? '✅').slice(0, 4) || '✅', remind });
    }
    p.habits = out;
  }
  for (const [k, lim] of Object.entries(LIMITS) as [keyof typeof LIMITS, (typeof LIMITS)[keyof typeof LIMITS]][]) {
    if (body[k] === undefined) continue;
    const v = Number(body[k]);
    if (!Number.isFinite(v) || v < lim.min || v > lim.max) return { error: `${k}: ${lim.min}–${lim.max}` };
    p[k] = Math.round(v);
  }
  return { patch: p };
}

export async function settingsApi(env: E, req: Request): Promise<Response> {
  if (!(await isOwner(env, req))) return json({ ok: false, error: 'open this from your bot in Telegram' }, 401);

  if (req.method === 'GET') {
    return json({
      ok: true,
      settings: await getSettings(env),
      personalities: Object.fromEntries(Object.entries(PERSONALITIES).map(([k, v]) => [k, v.label])),
      limits: LIMITS,
    });
  }

  if (req.method === 'PUT') {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return json({ ok: false, error: 'send JSON' }, 400);
    const r = validate(body);
    if ('error' in r) return json({ ok: false, error: r.error }, 400);
    const before = await getSettings(env);
    const { name, ...rest } = r.patch;
    const saved = await saveSettings(env, rest);
    // setName also renames the bot in Telegram, so only call it when the name really changed.
    if (name !== undefined && name !== before.name) await setName(env, name);
    return json({ ok: true, settings: { ...saved, ...(name !== undefined ? { name } : {}) } });
  }

  return json({ ok: false, error: 'GET or PUT' }, 405);
}
