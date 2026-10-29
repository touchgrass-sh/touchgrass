import type { E } from '../env';
import { edit, keyboard, send, tg, type Button } from '../tg';
import { getSettings } from '../store';
import { nowSec } from '../time';

// free: reaction GIFs (ported from Jake). Forward any GIF to the bot, pick the ONE topic it's for, and messages on
// that topic (morning, window, water, wins…) arrive with one on top. One topic per GIF on purpose (user, 2026-10-27:
// Jake reused the same GIF across topics). Untagged GIFs are never sent. Telegram file ids only work in the bot that
// received them. The built-in set is brand/gifs (Moss scenes). Each window message has its own topic (soon, food, lastcall,
// fasting) so they never repeat the same GIF back to back (user, 2026-10-29).

export const TAGS = {
  morning: '☀️ Morning',
  food: '🍽️ Food',
  soon: '⏰ Window soon',
  lastcall: '⏳ Last call',
  water: '💧 Water',
  fasting: '🌙 Fasting / night',
  win: '🎉 Celebrating',
  treat: '🍦 Treats',
  nudge: '👉 Nudge',
  chat: '💬 Chatting',
} as const;
export type Tag = keyof typeof TAGS;

/** A random GIF for `tag` in the owner's GIF style (settings.gif_theme); untagged-style ones (NULL) suit both.
 *  Falls back to any GIF with the tag, so a topic missing one style still gets a GIF. */
async function pick(env: E, tag: Tag) {
  const theme = (await getSettings(env)).gif_theme;
  return (await env.DB.prepare(`SELECT file_id FROM gifs WHERE (',' || tags || ',') LIKE ?
    ORDER BY (theme IS NULL OR theme = ?) DESC, RANDOM() LIMIT 1`)
    .bind(`%,${tag},%`, theme).first<{ file_id: string }>())?.file_id ?? null;
}

/** `text` with a GIF tagged `tag` on top (as the caption); plain message if none, or too long for a caption. */
export async function sendWithGif(env: E, chat: number | string, tag: Tag, text: string, rows?: Button[][]) {
  const file = text.length <= 1000 ? await pick(env, tag) : null;
  if (file) {
    const r = await tg(env, 'sendAnimation', { chat_id: chat, animation: file, caption: text, parse_mode: 'HTML', reply_markup: keyboard(rows) });
    if (r) return r;
    await env.DB.prepare(`DELETE FROM gifs WHERE file_id = ?`).bind(file).run(); // Telegram no longer has it
  }
  return send(env, chat, text, rows);
}

function tagPicker(id: number, tags: string[]): { text: string; rows: Button[][] } {
  const keys = Object.keys(TAGS) as Tag[];
  const rows: Button[][] = [];
  for (let i = 0; i < keys.length; i += 2) {
    rows.push(keys.slice(i, i + 2).map((k) => ({ text: `${tags.includes(k) ? '✅ ' : ''}${TAGS[k]}`, data: `gt:${id}:${k}` })));
  }
  rows.push([{ text: '👍 Done', data: `gt:${id}:done` }, { text: "🗑️ Don't use it", data: `gt:${id}:del` }]);
  return { text: `when should I use this GIF? tick all that fit.${tags.length ? '' : '\n<i>untagged GIFs never get sent.</i>'}`, rows };
}

/** A forwarded GIF: save it (or find it) and show the tag picker. */
export async function onGif(env: E, chat: number, fileId: string) {
  await env.DB.prepare(`INSERT OR IGNORE INTO gifs (file_id, tags, ts) VALUES (?, '', ?)`).bind(fileId, nowSec()).run();
  const g = await env.DB.prepare(`SELECT id, tags FROM gifs WHERE file_id = ?`).bind(fileId).first<{ id: number; tags: string }>();
  const p = tagPicker(g!.id, g!.tags ? g!.tags.split(',') : []);
  await send(env, chat, p.text, p.rows);
  return true;
}

/** Button gt:<id>:<tag|done|del>. */
export async function gifTag(env: E, chat: number, msgId: number, val: string) {
  const [idS, what] = val.split(':');
  const id = Number(idS);
  if (what === 'del') {
    await env.DB.prepare(`DELETE FROM gifs WHERE id = ?`).bind(id).run();
    return edit(env, chat, msgId, 'binned 🗑️');
  }
  const g = await env.DB.prepare(`SELECT tags FROM gifs WHERE id = ?`).bind(id).first<{ tags: string }>();
  if (!g) return edit(env, chat, msgId, "that GIF's gone. send it again");
  let tags = g.tags ? g.tags.split(',') : [];
  if (what === 'done') {
    return edit(env, chat, msgId, tags.length ? `got it ✅ I'll use it for ${tags.map((t) => TAGS[t as Tag] ?? t).join(', ')}` : "saved, but with no tags it won't be used. send it again to tag it");
  }
  if (what in TAGS) {
    tags = tags.includes(what) ? [] : [what]; // one topic per GIF
    await env.DB.prepare(`UPDATE gifs SET tags = ? WHERE id = ?`).bind(tags.join(','), id).run();
  }
  const p = tagPicker(id, tags);
  return edit(env, chat, msgId, p.text, p.rows);
}

export async function gifsCmd(env: E, chat: number) {
  const { results } = await env.DB.prepare(`SELECT tags FROM gifs`).all<{ tags: string }>();
  const count = (t: string) => results.filter((r) => (',' + r.tags + ',').includes(`,${t},`)).length;
  return send(env, chat, `🎞️ <b>${results.length} GIFs</b>\n` + (Object.keys(TAGS) as Tag[]).map((t) => `${TAGS[t]}: ${count(t)}`).join('\n') +
    `\n\nto add one: tap the GIF button in any chat, find one, send it here and tick what it's for. send one again to re-tag it.`);
}
