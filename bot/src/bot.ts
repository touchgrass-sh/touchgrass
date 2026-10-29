import type { E, Level, Personality, Settings } from './env';
import { claimOwner, delState, getAwaiting, getOwner, getSettings, getState, saveSettings, setAwaiting, setState } from './store';
import { edit, esc, send, tg, type Button } from './tg';
import { local, parseHHMM, validTz } from './time';
import { FACE, PERSONALITIES } from './voice';
import { nudgeButton, sendNudge } from './nudge';
import { addWater, parseWater, showWater, today, typedWater, undoWater } from './log';
import { undoButton, undoLast } from './undo';
import { badgesCmd } from './badges';
import { addSugar, backToCoffee, backToMenu, caffeineMenu, coffeePicker, espressoPicker, logButton, logText, toggleDecaf, undo, wantsCaffeineMenu } from './caffeine';
import { defaultAvatar, setAvatar, showAvatars } from './avatar';
import { AVATARS } from './avatar-data';
import { adminButton, showAdmin } from './admin';
import { getPlan, isDev } from './plan';
import { askReset, exportData, resetButton } from './account';
import { active, FREE_GIF, FREE_PHOTO, FREE_TEXT, GATE, LOCKED, upgradeButtons } from './hooks';

// Onboarding (BOT_SPEC §2) and /settings share the same pickers. While `onboarding` is set in state,
// each pick moves to the next step; otherwise it goes back to the settings menu.
const STEPS = ['name', 'personality', 'tz', 'hours', 'level', 'fast', 'hook'] as const;
type Step = (typeof STEPS)[number];

const TZ_PICKS: [string, string][] = [
  ['🇬🇧 London', 'Europe/London'], ['🇪🇺 Berlin/Paris', 'Europe/Berlin'],
  ['🇺🇸 New York', 'America/New_York'], ['🇺🇸 Chicago', 'America/Chicago'],
  ['🇺🇸 LA', 'America/Los_Angeles'], ['🇮🇳 India', 'Asia/Kolkata'],
  ['🇸🇬 Singapore', 'Asia/Singapore'], ['🇦🇺 Sydney', 'Australia/Sydney'],
];
const HOUR_PICKS = ['09:00-17:00', '09:00-18:00', '10:00-19:00', '08:00-20:00'];
const FAST_PICKS = ['12:00-20:00', '10:00-18:00', '08:00-16:00'];
// Moss is the mascot's name (user, 2026-10-27), so it's the first pick, but the bot can be called anything.
const NAME_PICKS = ['Moss', 'Tuft', 'Ping', 'Echo', 'Grep'];
const LEVELS: Record<Level, string> = { easy: '🌱 Easy', normal: '🌿 Normal', spicy: '🌶️ Spicy' };

export async function handleUpdate(env: E, u: any, origin: string) {
  const msg = u.message;
  const cb = u.callback_query;
  const from = msg?.from ?? cb?.from;
  const chat = msg?.chat?.id ?? cb?.message?.chat?.id;
  if (!from || !chat) return;

  // Owner lock: the first person to /start owns the bot. Strangers get one polite line and no AI calls.
  let owner = await getOwner(env);
  if (owner === null && msg?.text?.startsWith('/start') && msg.chat.type === 'private') {
    if (await claimOwner(env, from.id)) {
      owner = from.id;
      await setState(env, 'chat', String(chat));
      await setState(env, 'onboarding', '1');
      return welcome(env, chat);
    }
    owner = await getOwner(env);
  }
  if (owner !== from.id) {
    if (cb) return tg(env, 'answerCallbackQuery', { callback_query_id: cb.id });
    if (msg?.chat?.type === 'private') {
      return send(env, chat, `${FACE.idle} this is someone's personal touchgrass bot.\nget your own: https://touchgrass.sh`);
    }
    return;
  }

  if (cb) return onButton(env, cb, origin);
  if (msg?.animation) {
    for (const a of await active(env)) if (await a.onGif?.(env, chat, msg.animation.file_id)) return;
    return send(env, chat, FREE_GIF, upgradeButtons(await getPlan(env)));
  }
  // A photo, or an image sent as a file (uncompressed).
  const photos = msg?.photo?.length ? msg.photo : msg?.document?.mime_type?.startsWith('image/') ? [msg.document] : null;
  if (photos) {
    const caption = (msg.caption ?? '').trim();
    for (const a of await active(env)) if (await a.onPhoto?.(env, chat, photos, caption)) return;
    return send(env, chat, FREE_PHOTO, upgradeButtons(await getPlan(env)));
  }
  // Replies to the bot's own messages (e.g. correcting a meal card on sudo).
  if (msg?.text && msg.reply_to_message && !msg.text.startsWith('/')) {
    for (const a of await active(env)) if (await a.onReply?.(env, chat, msg.reply_to_message.message_id, msg.text.trim())) return;
  }
  if (msg?.text) return onText(env, chat, msg.text.trim(), origin);
}

async function welcome(env: E, chat: number) {
  await send(env, chat, [
    `${FACE.flex} <b>hey 👋 I'm your new buddy.</b>`,
    '',
    "I'll nudge you to move while your AI agent is busy, and keep you topped up on water (and honest about caffeine).",
    '',
    "I'm yours now: only you can talk to me. quick setup, about a minute 👇",
  ].join('\n'));
  return ask(env, chat, 'name');
}

async function onText(env: E, chat: number, text: string, origin: string) {
  const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@\w+$/, '');
  if (cmd === '/start') {
    await setState(env, 'onboarding', '1');
    return ask(env, chat, 'name');
  }
  if (cmd === '/settings') return settingsMenu(env, chat);
  if (cmd === '/help') return help(env, chat);
  if (cmd === '/upgrade') return upgrade(env, chat);
  // A pack's own command wins over core's (sudo's /today and /week say more than the free ones).
  if (cmd.startsWith('/')) {
    for (const a of await active(env)) {
      const c = a.commands?.find((c) => c.command === cmd.slice(1));
      if (c) return c.run(env, chat, text);
    }
  }
  if (cmd === '/hook') return ask(env, chat, 'hook', undefined, origin);
  // Try a nudge right now, ignoring hours/cooldown. Handy for testing without an agent.
  if (cmd === '/nudge') return sendNudge(env, chat, await getSettings(env), null);
  if (cmd === '/water') return showWater(env, chat, text);
  if (cmd === '/coffee') return coffeePicker(env, chat);
  if (cmd === '/caffeine' || cmd === '/caffine') return caffeineMenu(env, chat);
  if (cmd === '/today') return today(env, chat);
  if (cmd === '/undo') return undoLast(env, chat);
  if (cmd === '/badges') return badgesCmd(env, chat);
  if (cmd === '/avatar') return showAvatars(env, chat, origin);
  if (cmd === '/export') return exportData(env, chat);
  if (cmd === '/reset') return askReset(env, chat);
  if (cmd === '/admin' && isDev(env)) return showAdmin(env, chat);

  if (cmd.startsWith('/')) {
    const name = cmd.slice(1);
    for (const a of await active(env)) {
      const c = a.commands?.find((c) => c.command === name);
      if (c) return c.run(env, chat, text);
    }
    for (const a of await active(env)) if (await a.onCommand?.(env, chat, name, text)) return;
    if (LOCKED.includes(name)) return send(env, chat, GATE, upgradeButtons(await getPlan(env)));
  }

  const awaiting = await getAwaiting(env);
  if (awaiting === 'name') {
    const name = cleanName(text);
    if (!name) return send(env, chat, `${FACE.judging} keep it to 1–24 letters, numbers or spaces`);
    await delState(env, 'awaiting');
    await setName(env, name);
    await send(env, chat, `${FACE.proud} <b>${esc(name)}</b> it is.`);
    return next(env, chat, 'name', origin);
  }
  if (awaiting === 'tz') {
    if (!validTz(text)) return send(env, chat, `${FACE.judging} I don't know that one. try something like <code>Europe/Madrid</code> or <code>America/Denver</code>`);
    await delState(env, 'awaiting');
    await saveSettings(env, { tz: text });
    return next(env, chat, 'tz', origin);
  }
  if (awaiting === 'hours' || awaiting === 'fast') {
    const [a, b] = text.split(/\s*[-–to]+\s*/).map(parseHHMM);
    if (!a || !b || a === b) return send(env, chat, `${FACE.judging} send it like <code>9-17</code> or <code>08:30-17:30</code>`);
    await delState(env, 'awaiting');
    await saveSettings(env, awaiting === 'hours' ? { hours_start: a, hours_end: b } : { window_start: a, window_end: b });
    return next(env, chat, awaiting, origin);
  }

  if (text.startsWith('/')) return help(env, chat);
  if (wantsCaffeineMenu(text)) return caffeineMenu(env, chat);
  // Pack specifics first (a ✏️ fix answer, a weigh-in, exercise, a habit), then water and caffeine, then chat.
  for (const a of await active(env)) if (await a.onText?.(env, chat, text)) return;
  const ml = parseWater(text);
  if (ml !== undefined) return typedWater(env, chat, ml);
  if (await logText(env, chat, text)) return;
  for (const a of await active(env)) if (await a.onChat?.(env, chat, text)) return;
  return send(env, chat, `${FACE.idle} ${FREE_TEXT}`);
}

async function onButton(env: E, cb: any, origin: string) {
  const chat = cb.message.chat.id;
  const msgId = cb.message.message_id;
  const [kind, val = ''] = String(cb.data ?? '').split(/:(.*)/s);
  await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id });

  for (const a of await active(env)) {
    const h = a.buttons?.[kind];
    if (h) return h(env, chat, msgId, val);
  }

  switch (kind) {
    case 'nd':
    case 'ns':
    case 'nz':
      return nudgeButton(env, chat, msgId, kind, Number(val));
    case 'ad':
      return adminButton(env, chat, msgId, val);
    case 'w':
      return addWater(env, chat, msgId, val);
    case 'wu':
      return undoWater(env, chat, msgId, val);
    case 'cf':
      return logButton(env, chat, msgId, val);
    case 'cd':
      return toggleDecaf(env, chat, msgId, val);
    case 'cu':
      return undo(env, chat, msgId, val);
    case 'cm':
      return backToMenu(env, chat, msgId);
    case 'cs':
      return addSugar(env, chat, msgId, val);
    case 'ce':
      return espressoPicker(env, chat, msgId);
    case 'cb':
      return backToCoffee(env, chat, msgId);
    case 'un':
      return undoButton(env, chat, msgId, val);
    case 'rs':
      return resetButton(env, chat, msgId, val);
    case 'av':
      if (!(val in AVATARS)) return;
      return send(env, chat, (await setAvatar(env, val))
        ? `${FACE.proud} new look set. it can take a minute to show up in your chat list`
        : `${FACE.judging} Telegram wouldn't take it. try again in a bit`);
    case 'n': {
      if (val === 'custom') {
        await setAwaiting(env, 'name');
        return edit(env, chat, msgId, 'what should I be called? type a name');
      }
      const name = cleanName(val);
      if (!name) return;
      await setName(env, name);
      await edit(env, chat, msgId, `${FACE.proud} <b>${esc(name)}</b> it is.`);
      return next(env, chat, 'name', origin);
    }
    case 'p':
      if (!(val in PERSONALITIES)) return;
      await saveSettings(env, { personality: val as Personality });
      await edit(env, chat, msgId, `personality: <b>${PERSONALITIES[val as Personality].label}</b>`);
      return next(env, chat, 'personality', origin);
    case 'tz':
      if (val === 'other') {
        await setAwaiting(env, 'tz');
        return edit(env, chat, msgId, 'type your timezone, like <code>Europe/Madrid</code> or <code>America/Denver</code>');
      }
      if (!validTz(val)) return;
      await saveSettings(env, { tz: val });
      await edit(env, chat, msgId, `timezone: <b>${esc(val)}</b> (it's ${local(val).hhmm} there)`);
      return next(env, chat, 'tz', origin);
    case 'h': {
      if (val === 'custom') {
        await setAwaiting(env, 'hours');
        return edit(env, chat, msgId, 'send your hours like <code>9-17</code> or <code>08:30-17:30</code>');
      }
      if (val === 'wk' || val === 'all') {
        await saveSettings(env, { weekdays_only: val === 'wk' });
        await edit(env, chat, msgId, `nudges: <b>${val === 'wk' ? 'weekdays only' : 'every day'}</b>`);
        return next(env, chat, 'hours', origin);
      }
      const [a, b] = val.split('-');
      if (!parseHHMM(a) || !parseHHMM(b)) return;
      await saveSettings(env, { hours_start: a, hours_end: b });
      return edit(env, chat, msgId, `nudge hours: <b>${a}–${b}</b>. weekdays only, or every day?`, [[
        { text: '💼 Weekdays', data: 'h:wk' }, { text: '📅 Every day', data: 'h:all' },
      ]]);
    }
    case 'l':
      if (!(val in LEVELS)) return;
      await saveSettings(env, { level: val as Level });
      await edit(env, chat, msgId, `level: <b>${LEVELS[val as Level]}</b>`);
      return next(env, chat, 'level', origin);
    case 'f': {
      if (val === 'custom') {
        await setAwaiting(env, 'fast');
        return edit(env, chat, msgId, 'send your eating window like <code>12-20</code>');
      }
      if (val === 'none') {
        await saveSettings(env, { window_start: null, window_end: null });
        await edit(env, chat, msgId, 'fasting: <b>off</b>');
        return next(env, chat, 'fast', origin);
      }
      const [a, b] = val.split('-');
      if (!parseHHMM(a) || !parseHHMM(b)) return;
      await saveSettings(env, { window_start: a, window_end: b });
      await edit(env, chat, msgId, `eating window: <b>${a}–${b}</b>`);
      return next(env, chat, 'fast', origin);
    }
    case 's':
      if (val === 'menu') return settingsMenu(env, chat, msgId);
      if ((STEPS as readonly string[]).includes(val)) {
        await delState(env, 'onboarding');
        return ask(env, chat, val as Step, msgId, origin);
      }
      return;
  }
}

/** After a pick: next onboarding step, or back to the settings menu. */
async function next(env: E, chat: number, done: Step, origin: string) {
  if (!(await getState(env, 'onboarding'))) return settingsMenu(env, chat);
  const steps: readonly Step[] = (await fastingOn(env)) ? STEPS : STEPS.filter((s) => s !== 'fast');
  const i = steps.indexOf(done);
  if (i < steps.length - 1) return ask(env, chat, steps[i + 1], undefined, origin);
}

/** The eating window (fasting) belongs to the sudo pack. */
async function fastingOn(env: E) {
  return (await active(env)).some((a) => a.fasting);
}

/** Show the picker for a step. Edits `msgId` when coming from the settings menu. */
async function ask(env: E, chat: number, step: Step, msgId?: number, origin = '') {
  const s = await getSettings(env);
  const out = (text: string, rows?: Button[][]) => (msgId ? edit(env, chat, msgId, text, rows) : send(env, chat, text, rows));
  const back: Button[][] = msgId ? [[{ text: '← back', data: 's:menu' }]] : [];

  switch (step) {
    case 'name': {
      // Offer the display name they gave the bot in BotFather, unless it's just the project name.
      const me = await tg<{ first_name?: string }>(env, 'getMe', {});
      const own = cleanName(me?.first_name ?? '');
      const picks = [...new Set([...(own && !/touch\s*grass/i.test(own) ? [own] : []), ...NAME_PICKS])].slice(0, 6);
      const rows: Button[][] = [];
      for (let i = 0; i < picks.length; i += 3) rows.push(picks.slice(i, i + 3).map((n) => ({ text: n, data: `n:${n}` })));
      rows.push([{ text: '✏️ my own name', data: 'n:custom' }]);
      return out("<b>first: what should I be called?</b>\nI'm Moss by default, but call me whatever you like. you can change it later in /settings", [...rows, ...back]);
    }
    case 'personality':
      return out('<b>pick my personality</b> (change it any time in /settings)', [
        ...Object.entries(PERSONALITIES).map(([k, p]) => [{ text: `${p.label} · ${p.blurb}`, data: `p:${k}` }]),
        ...back,
      ]);
    case 'tz': {
      const rows: Button[][] = [];
      for (let i = 0; i < TZ_PICKS.length; i += 2) rows.push(TZ_PICKS.slice(i, i + 2).map(([t, z]) => ({ text: t, data: `tz:${z}` })));
      rows.push([{ text: '🌍 somewhere else', data: 'tz:other' }]);
      return out('<b>where are you?</b> (for reminders at the right time)', [...rows, ...back]);
    }
    case 'hours':
      return out('<b>when can I nudge you?</b> outside these hours I stay quiet', [
        HOUR_PICKS.slice(0, 2).map((h) => ({ text: h.replace('-', '–'), data: `h:${h}` })),
        HOUR_PICKS.slice(2).map((h) => ({ text: h.replace('-', '–'), data: `h:${h}` })),
        [{ text: '✏️ custom', data: 'h:custom' }],
        ...back,
      ]);
    case 'level':
      return out('<b>how hard should I push?</b>\n🌱 easy: stretches, 5 squats\n🌿 normal: 10–15 reps\n🌶️ spicy: 20+, planks, burpees', [
        Object.entries(LEVELS).map(([k, t]) => ({ text: t, data: `l:${k}` })),
        ...back,
      ]);
    case 'fast':
      return out('<b>do you fast?</b> pick an eating window and I\'ll remind you when it opens and closes', [
        FAST_PICKS.map((f) => ({ text: f.replace('-', '–'), data: `f:${f}` })),
        [{ text: '✏️ custom', data: 'f:custom' }, { text: '🚫 no fasting', data: 'f:none' }],
        ...back,
      ]);
    case 'hook': {
      await delState(env, 'onboarding');
      const url = origin || (await getState(env, 'origin')) || '<your bot url>';
      return out([
        `${FACE.grass} <b>last bit: connect your AI agent</b> (optional)`,
        '',
        'on the computer where you run Claude Code, install the helper:',
        'mac / linux: <code>curl -fsSL touchgrass.sh | sh</code>',
        'windows (powershell): <code>irm touchgrass.sh/install.ps1 | iex</code>',
        'then run these two:',
        `<code>touchgrass connect ${esc(url)} ${esc(env.HOOK_KEY)}</code>`,
        '<code>touchgrass hook claude</code>',
        '',
        "keep that key to yourself. skip this and I still do water, caffeine and your daily recap.",
        '',
        `${summary(s, await fastingOn(env))}`,
        '',
        'change anything: /settings',
      ].join('\n'), back);
    }
  }
}

function summary(s: Settings, fasting: boolean) {
  return [
    `<b>your setup</b>`,
    `🏷️ ${s.name ? esc(s.name) : 'no name yet'}`,
    `${PERSONALITIES[s.personality].label} · ${LEVELS[s.level]}`,
    `🕘 nudges ${s.hours_start}–${s.hours_end}${s.weekdays_only ? ', weekdays' : ', every day'} (${esc(s.tz)})`,
    `💧 water target ${s.water_ml / 1000}L`,
    ...(fasting ? [`🍽️ ${s.window_start ? `eating window ${s.window_start}–${s.window_end}` : 'no fasting'}`] : []),
  ].join('\n');
}

async function settingsMenu(env: E, chat: number, msgId?: number) {
  const s = await getSettings(env);
  const fasting = await fastingOn(env);
  const rows: Button[][] = [
    [{ text: '🏷️ name', data: 's:name' }, { text: '🎭 personality', data: 's:personality' }],
    [{ text: '🌍 timezone', data: 's:tz' }, { text: '🕘 nudge hours', data: 's:hours' }],
    [{ text: '💪 level', data: 's:level' }, ...(fasting ? [{ text: '🍽️ fasting', data: 's:fast' }] : [])],
    [{ text: '🔌 connect agent', data: 's:hook' }],
  ];
  // Everything, including the timing rules, lives on the settings page (src/app.ts).
  const origin = await getState(env, 'origin');
  if (origin) rows.unshift([{ text: '⚙️ open full settings', app: `${origin}/app#settings` }]);
  const text = `${FACE.idle} <b>${s.name ? esc(s.name) : 'settings'}</b>\n\n${summary(s, fasting)}`;
  return msgId ? edit(env, chat, msgId, text, rows) : send(env, chat, text, rows);
}

/** What sudo/root add, with buttons to the upgrade page (it asks "bought yet?" first). */
async function upgrade(env: E, chat: number) {
  const plan = await getPlan(env);
  if (plan === 'root') return send(env, chat, `${FACE.proud} you're on <b>root</b>. everything's unlocked already.`);
  const sudo = '⚡ <b>sudo</b> · $19 one-off: food photos → calories + macros, barcodes + labels, UK food database, meal ideas, kitchen, calorie targets';
  const root = '🛠 <b>root</b> · $49 one-off: everything in sudo, we set it up for you, e-ink screen setup';
  return send(env, chat, [
    plan === 'user' ? `${FACE.idle} you're on the free plan. two ways up:` : `${FACE.idle} you're on <b>sudo</b>. one more level:`,
    '',
    ...(plan === 'user' ? [sudo, ''] : []),
    root,
    '',
    'same bot, same data. about 2 minutes, one GitHub button.',
  ].join('\n'), upgradeButtons(plan));
}

async function help(env: E, chat: number) {
  const s = await getSettings(env);
  const addons = await active(env);
  const extra = addons.flatMap((a) => a.helpLines ?? []);
  return send(env, chat, [
    `${FACE.idle} <b>${s.name ? esc(s.name) : 'your buddy'}</b> · built with touchgrass.sh`,
    '',
    '💪 while your AI agent thinks, I nudge you to move',
    ...extra,
    '',
    '/today — your day so far',
    '/water — log a glass',
    '/undo — pick something you logged today to remove',
    '/badges — your streak + move badges',
    '/caffeine — log coffee, tea, energy drinks',
    '/nudge — get a move right now (to try it out)',
    '/settings — name, personality, hours, level',
    '/avatar — change my profile picture',
    '/hook — connect Claude Code',
    '/export — download all your data',
    '/reset — wipe your data (asks first)',
    ...addons.flatMap((a) => (a.commands ?? []).filter((c) => c.help).map((c) => c.help)),
    '/help — this',
    ...((await getPlan(env)) === 'user' ? ['', '⚡ food photos, calories and meal ideas come with sudo · /upgrade'] : (await getPlan(env)) === 'sudo' ? ['', '🛠 /upgrade — what root adds'] : []),
    ...(isDev(env) ? ['', `🛠 /admin — test panel · plan: <b>${await getPlan(env)}</b>`] : []),
  ].join('\n'));
}

/** 1–24 letters/numbers/spaces/dashes, trimmed. */
export function cleanName(s: string) {
  const n = s.replace(/\s+/g, ' ').trim();
  return /^[\p{L}\p{N} ._'-]{1,24}$/u.test(n) ? n : '';
}

/** Save the name and make it the bot's display name in Telegram too. */
export async function setName(env: E, name: string) {
  await saveSettings(env, { name });
  await tg(env, 'setMyName', { name });
}

/** Telegram-side setup: webhook, command list, description. Called from /setup. */
export async function setup(env: E, origin: string) {
  await setState(env, 'origin', origin);
  const webhook = await tg(env, 'setWebhook', {
    url: `${origin}/tg`, secret_token: env.WEBHOOK_SECRET, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true,
  });
  const commands = await registerCommands(env);
  await tg(env, 'setMyDescription', {
    description: "Your agent's got the code. I've got you. A buddy that nudges you to move while your AI agent thinks. Send /start.",
  });
  await tg(env, 'setMyShortDescription', { short_description: 'move while your AI agent thinks · touchgrass.sh' });
  // The ⚙️ button next to the message box opens the settings page. No BotFather step needed.
  // The menu button opens the dashboard. Telegram sizes it to its label, so the label is just the bot's face:
  // a long one was huge on phones (user, 10-27).
  const menu = await tg(env, 'setChatMenuButton', { menu_button: { type: 'web_app', text: '[▮‿▮]', web_app: { url: `${origin}/app` } } });
  const avatar = await defaultAvatar(env);
  return { webhook: !!webhook, commands: !!commands, menu: !!menu, avatar, owner: await getOwner(env) };
}

/** Telegram's command list for the current plan. Rerun when the plan changes (/admin does). */
export async function registerCommands(env: E) {
  return tg(env, 'setMyCommands', {
    commands: [
      { command: 'today', description: 'your day so far' },
      { command: 'water', description: 'log a glass of water' },
      { command: 'caffeine', description: 'log coffee, tea, energy drinks' },
      { command: 'undo', description: 'remove something you logged' },
      { command: 'nudge', description: 'get a move right now' },
      { command: 'badges', description: 'your badges' },
      { command: 'settings', description: 'personality, hours, level' },
      { command: 'avatar', description: 'change my profile picture' },
      ...(isDev(env) ? [{ command: 'admin', description: '🛠 test panel (test bot only)' }] : []),
      { command: 'hook', description: 'connect your AI agent' },
      { command: 'export', description: 'download all your data' },
      { command: 'reset', description: 'wipe your data' },
      ...((await getPlan(env)) === 'root' ? [] : [{ command: 'upgrade', description: 'get sudo or root' }]),
      ...(await active(env)).flatMap((a) => (a.commands ?? []).map(({ command, description }) => ({ command, description }))),
      { command: 'help', description: 'what I can do' },
    ],
  });
}
