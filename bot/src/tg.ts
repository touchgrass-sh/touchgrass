import type { E } from './env';

export type Button = { text: string; data?: string; app?: string; url?: string };

export async function tg<T = any>(env: E, method: string, body: unknown): Promise<T> {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j: any = await r.json();
  if (!j.ok) console.warn(`[tg] ${method} failed: ${j.description}`);
  return j.result;
}

export function keyboard(rows?: Button[][]) {
  if (!rows?.length) return undefined;
  return {
    inline_keyboard: rows.map((row) =>
      row.map((b) => (b.app ? { text: b.text, web_app: { url: b.app } } : b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data })),
    ),
  };
}

export function send(env: E, chat: number | string, text: string, rows?: Button[][]) {
  return tg(env, 'sendMessage', {
    chat_id: chat, text, parse_mode: 'HTML', reply_markup: keyboard(rows), link_preview_options: { is_disabled: true },
  });
}

export async function edit(env: E, chat: number | string, msgId: number, text: string, rows?: Button[][]) {
  const markup = keyboard(rows) ?? { inline_keyboard: [] };
  const r = await tg(env, 'editMessageText', { chat_id: chat, message_id: msgId, text, parse_mode: 'HTML', reply_markup: markup });
  // Reminders can arrive as a GIF with a caption (sendWithGif), and those have no text to edit.
  if (r || text.length > 1024) return r;
  return tg(env, 'editMessageCaption', { chat_id: chat, message_id: msgId, caption: text, parse_mode: 'HTML', reply_markup: markup });
}

export const typing = (env: E, chat: number | string) => tg(env, 'sendChatAction', { chat_id: chat, action: 'typing' });

export async function downloadFile(env: E, fileId: string): Promise<{ bytes: ArrayBuffer; mime: string }> {
  const f = await tg<{ file_path: string }>(env, 'getFile', { file_id: fileId });
  if (!f?.file_path) throw new Error('getFile failed');
  const r = await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${f.file_path}`);
  const ext = f.file_path.split('.').pop()?.toLowerCase();
  const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  return { bytes: await r.arrayBuffer(), mime };
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
