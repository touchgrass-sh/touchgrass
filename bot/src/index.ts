import { APP_HTML } from './app';
import { bearer, secretMatches } from './auth';
import { settingsApi } from './settings-api';
import { dashApi } from './dash-api';
import { handleUpdate, setup } from './bot';
import type { E } from './env';
import { hook, tickNudges } from './nudge';
import { tickReminders } from './log';
import { active } from './hooks';
import { getPlan } from './plan';
import { avatarPng } from './avatar';
import { getOwner, getState, setState } from './store';
import { send } from './tg';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** Readable from any web page (the touchgrass.sh setup wizard). */
const open = (r: Response) => {
  r.headers.set('access-control-allow-origin', '*');
  return r;
};

export default {
  async fetch(req: Request, env: E): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    // Telegram webhook. Telegram hangs up at ~60s and drops the retry as a duplicate (Jake, 2026-10-21),
    // so bail out with a message at 50s instead of going silent.
    if (path === '/tg' && req.method === 'POST') {
      if (!secretMatches(req.headers.get('x-telegram-bot-api-secret-token'), env.WEBHOOK_SECRET)) return new Response('no', { status: 401 });
      const u: any = await req.json();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const slow = new Promise<'slow'>((r) => { timer = setTimeout(() => r('slow'), 50_000); });
      const done = await Promise.race([handleUpdate(env, u, url.origin).then(() => 'done' as const), slow]);
      if (timer) clearTimeout(timer);
      const chat = u.message?.chat?.id ?? u.callback_query?.message?.chat?.id;
      const from = u.message?.from?.id ?? u.callback_query?.from?.id;
      if (done === 'slow' && chat && from === (await getOwner(env))) {
        await send(env, chat, '⏳ that took too long (the AI was slow). send it again?');
      }
      return new Response('ok');
    }

    // The setup wizard on touchgrass.sh calls /setup and /health straight from the buyer's browser, so both allow
    // any origin. /setup still needs the WEBHOOK_SECRET the buyer chose; /health says nothing private.
    if (path === '/setup') {
      if (!secretMatches(url.searchParams.get('key'), env.WEBHOOK_SECRET)) return open(json({ ok: false, error: 'wrong key' }, 401));
      // Remembered so cron messages and packs can link the mini app.
      await setState(env, 'origin', url.origin);
      return open(json({ ok: true, ...(await setup(env, url.origin)) }));
    }

    // Settings page (Telegram mini app) and its API. The page itself is public; the API checks initData.
    if (path === '/app' || path === '/app/') {
      return new Response(APP_HTML, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    }
    if (path === '/api/settings') return settingsApi(env, req);
    if (path === '/api/dash') return dashApi(env, req);

    // Profile pictures, so /avatar can send them as photos by URL.
    const av = path.match(/^\/avatar\/(\w+)\.png$/);
    if (av) {
      const png = avatarPng(av[1]);
      if (png) return new Response(png, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } });
    }

    // For the setup wizard's "connected ✓" check and touchgrass.sh/upgrade's "now on sudo ✓". Says nothing private.
    if (path === '/health') return open(json({ ok: true, set_up: (await getState(env, 'origin')) !== null, claimed: (await getOwner(env)) !== null, plan: await getPlan(env) }));

    // Agent hook from the `touchgrass` CLI: { event: "start" | "stop", agent, session }.
    if (path === '/hook' && req.method === 'POST') {
      if (!secretMatches(bearer(req), env.HOOK_KEY)) return json({ ok: false, error: 'bad key' }, 401);
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return json({ ok: false, error: 'send JSON' }, 400);
      }
      const r = await hook(env, body);
      return json(r, r.ok ? 200 : 400);
    }

    // Same hook, but for the Claude Code plugin: its hooks are a bare `curl` that pipes Claude's own hook JSON
    // ({ session_id, hook_event_name, ... }) straight here. Always 204 with no body: UserPromptSubmit hook
    // stdout is shown to the model, so we must print nothing.
    const raw = path.match(/^\/hook\/(claude|codex)\/(start|stop)$/);
    if (raw && req.method === 'POST') {
      if (!secretMatches(bearer(req), env.HOOK_KEY)) return new Response(null, { status: 401 });
      const body: any = await req.json().catch(() => ({}));
      await hook(env, { event: raw[2], agent: raw[1], session: body?.session_id ?? 'default' });
      return new Response(null, { status: 204 });
    }

    // Routes a paid pack adds (e.g. sudo's e-ink screen feed at /trmnl).
    for (const a of await active(env)) {
      const r = a.routes?.[path];
      if (r) return r(env, req);
    }

    return new Response('touchgrass bot. https://touchgrass.sh', { status: 404 });
  },

  async scheduled(_c: ScheduledController, env: E, ctx: ExecutionContext) {
    // tickReminders also sends the morning recap.
    ctx.waitUntil(Promise.all([tickNudges(env), tickReminders(env), active(env).then((as) => Promise.all(as.map((a) => a.tick?.(env))))]));
  },
} satisfies ExportedHandler<E>;
