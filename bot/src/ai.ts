import type { E } from './env';

// Workers AI, ported from Jake: JSON out, thinking off. The sudo pack turns its food guesses into real numbers
// with the UK food database (addons/sudo/foods.ts).
// Usage is counted per UTC day (Cloudflare resets the free allowance at 00:00 UTC) so we stop calling the AI
// before the owner's account starts paying for it (BOT_SPEC §7).

export interface Image { b64: string; mime: string }

/** Stay under the ~10k neurons/day free allowance, with room for the last call in flight. */
const DAILY_NEURONS = 9000;

// Neurons per million tokens (Workers AI pricing), used when a response doesn't report neurons itself.
const RATES: Record<string, [number, number]> = { qwen: [40909, 290909], gemma: [9091, 27273] };

export class OverBudget extends Error {}

export async function askJSON<T>(env: E, kind: 'vision' | 'text', prompt: string, image?: Image): Promise<T> {
  if ((await usedToday(env)) >= DAILY_NEURONS) throw new OverBudget('free AI allowance used up today');
  const model = kind === 'vision' ? env.VISION_MODEL : env.TEXT_MODEL;
  const content: any[] = [{ type: 'text', text: prompt }];
  if (image) content.push({ type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.b64}` } });
  const input: Record<string, unknown> = {
    messages: [{ role: 'user', content: image ? content : prompt }],
    max_tokens: 2500,
    temperature: 0.2,
    // Both models "think" by default, which burns the allowance and adds ~25s (Jake lesson).
    chat_template_kwargs: { enable_thinking: false },
  };
  if (model.includes('qwen')) input.reasoning_effort = 'low';
  // Telegram gives the webhook ~60s; a hung call is worse than no estimate.
  const out: any = await Promise.race([
    env.AI.run(model as any, input as any),
    new Promise((_, rej) => setTimeout(() => rej(new Error('AI timed out')), 35_000)),
  ]);
  await recordUsage(env, model, out?.usage);
  const text = out?.choices?.[0]?.message?.content ?? out?.response ?? out?.result?.response;
  if (text == null) throw new Error('empty model response');
  return parseJSON<T>(typeof text === 'string' ? text : JSON.stringify(text));
}

const utcDay = () => new Date().toISOString().slice(0, 10);

async function usedToday(env: E) {
  const r = await env.DB.prepare(`SELECT neurons FROM ai_usage WHERE day = ?`).bind(utcDay()).first<{ neurons: number }>();
  return r?.neurons ?? 0;
}

async function recordUsage(env: E, model: string, usage: any) {
  let neurons = Number(usage?.neurons);
  if (!(neurons > 0)) {
    const [inR, outR] = RATES[model.includes('qwen') ? 'qwen' : 'gemma'];
    neurons = ((usage?.prompt_tokens ?? 0) * inR + (usage?.completion_tokens ?? 0) * outR) / 1e6;
  }
  await env.DB.prepare(
    `INSERT INTO ai_usage (day, neurons, calls) VALUES (?, ?, 1)
     ON CONFLICT(day) DO UPDATE SET neurons = neurons + excluded.neurons, calls = calls + 1`,
  ).bind(utcDay(), Math.round(neurons)).run();
}

function parseJSON<T>(text: string): T {
  const s = text.replace(/```(?:json)?/g, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error(`no JSON in: ${text.slice(0, 200)}`);
  return JSON.parse(s.slice(a, b + 1));
}

export function toB64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(b64: string): ArrayBuffer {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

/** One food. p/c/f are grams for this portion (only sudo fills and shows them). */
export interface FoodItem { name: string; kcal: number; p?: number; c?: number; f?: number; grams?: number; src?: string }
