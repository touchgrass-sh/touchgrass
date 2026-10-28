function sameString(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Constant-time check of a header/query secret against the configured one. */
export function secretMatches(given: string | null, expected: string | undefined) {
  return !!given && !!expected && sameString(given, expected);
}

const enc = new TextEncoder();
async function hmac(key: ArrayBuffer | Uint8Array, data: string) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

/**
 * Telegram mini app login (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
 * Returns the Telegram user id if the signature is valid and under 24h old, else null. Same check as Jake.
 */
export async function webAppUser(botToken: string, initData: string | null): Promise<number | null> {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = await hmac(enc.encode('WebAppData'), botToken);
  if (!sameString(hex(await hmac(secret, check)), hash)) return null;
  if (Date.now() / 1000 - Number(params.get('auth_date') ?? 0) > 86400) return null;
  try {
    const id = Number(JSON.parse(params.get('user') ?? '{}').id);
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

/** `Authorization: Bearer <key>` for the agent hook. */
export function bearer(req: Request) {
  const h = req.headers.get('authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}
