import type { E } from './env';
import { AVATARS } from './avatar-data';
import { getState, setState } from './store';
import { send, tg, type Button } from './tg';
import { FACE } from './voice';

// Bot profile picture. Telegram lets a bot set its own photo (setMyProfilePhoto), so /setup gives a fresh
// bot the classic face, and /avatar lets the owner pick another. A photo the owner set in BotFather is
// never overwritten by /setup.

export const avatarPng = (key: string) => {
  const a = AVATARS[key];
  return a ? Uint8Array.from(atob(a.b64), (c) => c.charCodeAt(0)) : null;
};

/** Upload one of our avatars as the bot's profile photo. */
export async function setAvatar(env: E, key: string): Promise<boolean> {
  const png = avatarPng(key);
  if (!png) return false;
  const form = new FormData();
  form.append('photo', JSON.stringify({ type: 'static', photo: 'attach://pic' }));
  form.append('pic', new Blob([png], { type: 'image/png' }), `${key}.png`);
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/setMyProfilePhoto`, { method: 'POST', body: form });
  const j: any = await r.json();
  if (!j.ok) console.warn(`[tg] setMyProfilePhoto failed: ${j.description}`);
  else await setState(env, 'avatar', key);
  return !!j.ok;
}

/** /setup: give the bot a face unless it already has one. */
export async function defaultAvatar(env: E): Promise<'set' | 'kept' | 'failed'> {
  if (await getState(env, 'avatar')) return 'kept';
  const me = await tg<{ id: number }>(env, 'getMe', {});
  const photos = me ? await tg<{ total_count: number }>(env, 'getUserProfilePhotos', { user_id: me.id, limit: 1 }) : null;
  if (photos?.total_count) {
    await setState(env, 'avatar', 'own');
    return 'kept';
  }
  return (await setAvatar(env, 'proud')) ? 'set' : 'failed';
}

/** /avatar: send each look as a photo with a "use this" button. */
export async function showAvatars(env: E, chat: number, origin: string) {
  await send(env, chat, `${FACE.idle} <b>pick my look</b>. tap "use this" under one and I'll change my profile picture.`);
  for (const [key, a] of Object.entries(AVATARS)) {
    const rows: Button[][] = [[{ text: '✅ use this', data: `av:${key}` }]];
    await tg(env, 'sendPhoto', {
      chat_id: chat, photo: `${origin}/avatar/${key}.png`, caption: a.label,
      reply_markup: { inline_keyboard: rows.map((r) => r.map((b) => ({ text: b.text, callback_data: b.data }))) },
    });
  }
}
