import type { FoodItem } from './ai';
import type { E } from './env';
import { saveMeal } from './log';
import { getSettings } from './store';
import { edit, send, type Button } from './tg';
import { local, nowSec, toMins } from './time';
import { FACE } from './voice';

// Free: one-tap caffeine log (grew out of Jake's coffee.ts). Fixed typical values instead of the AI: instant,
// free, and consistent so the daily total means something. Stored in `meals` with kind 'caffeine', so the
// drink's kcal still count toward the day. Alcohol/weed tracking is a separate idea, not this.

type Drink = { label: string; kcal: number; p: number; c: number; f: number; caf: number; aliases: string[] };

// Typical caffeine per serving (mg). Labels say the serving so the number makes sense.
const DRINKS: Record<string, Drink> = {
  // Coffee values match Jake's (semi-skimmed milk, a normal mug / regular café size).
  coffee: { label: 'Black coffee', kcal: 2, p: 0.3, c: 0, f: 0, caf: 80, aliases: ['coffee', 'black coffee', 'filter coffee', 'instant coffee', 'americano'] },
  splash: { label: 'Coffee, splash of milk', kcal: 16, p: 1.1, c: 1.5, f: 0.5, caf: 80, aliases: ['coffee with a splash of milk', 'splash of milk', 'coffee splash of milk'] },
  milky: { label: 'Milky coffee', kcal: 50, p: 3.5, c: 4.8, f: 1.7, caf: 80, aliases: ['white coffee', 'coffee with milk', 'milky coffee', 'cappuccino'] },
  cortado: { label: 'Cortado', kcal: 30, p: 2, c: 3, f: 1, caf: 130, aliases: ['cortado'] },
  latte: { label: 'Latte', kcal: 130, p: 9, c: 13, f: 5, caf: 80, aliases: ['latte', 'oat latte', 'iced latte', 'oat milk latte', 'skinny latte'] },
  flatwhite: { label: 'Flat white', kcal: 110, p: 7, c: 10, f: 4, caf: 130, aliases: ['flat white'] },
  espresso: { label: 'Espresso', kcal: 1, p: 0.1, c: 0, f: 0, caf: 63, aliases: ['espresso', 'single espresso'] },
  double: { label: 'Double espresso', kcal: 2, p: 0.2, c: 0, f: 0, caf: 126, aliases: ['double espresso', 'doppio'] },
  tea: { label: 'Tea (mug)', kcal: 15, p: 0.8, c: 1.5, f: 0.5, caf: 45, aliases: ['tea', 'cuppa', 'cup of tea', 'black tea', 'builders tea', "builder's tea", 'earl grey', 'earl grey tea', 'english breakfast', 'english breakfast tea', 'yorkshire tea', 'pg tips', 'milky tea'] },
  green: { label: 'Green tea', kcal: 0, p: 0, c: 0, f: 0, caf: 30, aliases: ['green tea'] },
  matcha: { label: 'Matcha latte', kcal: 120, p: 6, c: 15, f: 4, caf: 70, aliases: ['matcha', 'matcha latte'] },
  chai: { label: 'Chai latte', kcal: 140, p: 5, c: 24, f: 3, caf: 50, aliases: ['chai', 'chai latte', 'chai tea', 'dirty chai'] },
  mocha: { label: 'Mocha', kcal: 250, p: 9, c: 33, f: 9, caf: 95, aliases: ['mocha', 'caffe mocha', 'cafe mocha'] },
  iced: { label: 'Iced coffee', kcal: 80, p: 3, c: 10, f: 3, caf: 100, aliases: ['iced coffee', 'iced americano', 'cold brew'] },
  hotchoc: { label: 'Hot chocolate', kcal: 190, p: 7, c: 27, f: 6, caf: 8, aliases: ['hot chocolate', 'hot choc', 'cocoa'] },
  cola: { label: 'Cola (330ml can)', kcal: 139, p: 0, c: 35, f: 0, caf: 32, aliases: ['cola', 'coke', 'pepsi', 'dr pepper', 'can of coke'] },
  diet: { label: 'Diet cola (330ml can)', kcal: 1, p: 0, c: 0, f: 0, caf: 42, aliases: ['diet coke', 'coke zero', 'pepsi max', 'diet cola', 'diet pepsi'] },
  energy: { label: 'Energy drink (250ml)', kcal: 110, p: 0, c: 27, f: 0, caf: 80, aliases: ['energy drink', 'red bull', 'redbull'] },
  energy_l: { label: 'Energy drink (500ml)', kcal: 220, p: 0, c: 54, f: 0, caf: 160, aliases: ['monster', 'monster energy', 'relentless', 'prime energy', 'big energy drink', 'large energy drink'] },
  preworkout: { label: 'Pre-workout (1 scoop)', kcal: 10, p: 0, c: 2, f: 0, caf: 200, aliases: ['pre workout', 'pre-workout', 'preworkout', 'pre'] },
};
const DECAF_CAF = 3;
const SUGAR = { kcal: 16, c: 4 }; // 1 tsp
const DAILY_MAX = 400; // the commonly cited upper limit for most healthy adults

type CafItem = FoodItem & { caf: number; key: string; decaf?: boolean; sugar?: number };

const MENU: Button[][] = [
  [{ text: '☕ Coffee', data: 'cf:coffee' }, { text: '🥛 With milk', data: 'cf:milky' }, { text: '☕ Latte', data: 'cf:latte' }],
  [{ text: '☕ Espresso', data: 'cf:espresso' }, { text: '☕☕ Double', data: 'cf:double' }, { text: '☕ Flat white', data: 'cf:flatwhite' }],
  [{ text: '🍵 Tea', data: 'cf:tea' }, { text: '🍵 Green tea', data: 'cf:green' }, { text: '🍵 Matcha', data: 'cf:matcha' }],
  [{ text: '🫖 Chai', data: 'cf:chai' }, { text: '🍫 Mocha', data: 'cf:mocha' }, { text: '🧊 Iced coffee', data: 'cf:iced' }],
  [{ text: '🥤 Cola', data: 'cf:cola' }, { text: '🥤 Diet cola', data: 'cf:diet' }, { text: '🍫 Hot choc', data: 'cf:hotchoc' }],
  [{ text: '⚡ Energy 250ml', data: 'cf:energy' }, { text: '⚡ Energy 500ml', data: 'cf:energy_l' }, { text: '🏋️ Pre-workout', data: 'cf:preworkout' }],
];
const MENU_TEXT = '☕ what are you having?\n<i>or type it: "red bull", "pepsi max", "200mg"</i>';

// A plain "coffee" asks which kind, like Jake (a latte is 65x the calories of a black coffee).
const COFFEE_MENU: Button[][] = [
  [{ text: '☕ Black', data: 'cf:coffee' }, { text: '🥛 Splash of milk', data: 'cf:splash' }],
  [{ text: '☕ Milky', data: 'cf:milky' }, { text: '☕ Espresso', data: 'ce:' }],
  [{ text: '☕ Cortado', data: 'cf:cortado' }, { text: '☕ Flat white', data: 'cf:flatwhite' }],
  [{ text: '☕ Latte', data: 'cf:latte' }, { text: '🍵 Other drinks…', data: 'cm' }],
];
const COFFEE_TEXT = '☕ What are you having?';
const bareCoffee = (t: string) =>
  /^(?:i\s*(?:'ve|have)?\s*)?(?:just\s+)?(?:had\s+|having\s+)?(?:a |another |my |one )?(?:cup of |mug of )?(?:strong |large |small )?(?:decaf )?coffees?(?: please| now)?[.!]?$/i.test(t.trim());

export const coffeePicker = (env: E, chat: number) => send(env, chat, COFFEE_TEXT, COFFEE_MENU);

/** Button ce: espresso, single or double, on the same message. */
export const espressoPicker = (env: E, chat: number, msgId: number) => edit(env, chat, msgId, '☕ Espresso: single or double?', [
  [{ text: '☕ Single', data: 'cf:espresso' }, { text: '☕☕ Double', data: 'cf:double' }],
  [{ text: '← Back', data: 'cb:' }],
]);
export const backToCoffee = (env: E, chat: number, msgId: number) => edit(env, chat, msgId, COFFEE_TEXT, COFFEE_MENU);

const ALIAS = new Map(Object.entries(DRINKS).flatMap(([k, d]) => d.aliases.map((a) => [a, k] as const)));

const COUNT: Record<string, number> = { a: 1, an: 1, another: 1, my: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };

/** "a red bull", "had a coffee", "2 coffees", "large decaf latte with milk" → a drink key and how many, or a bare
 *  "150mg" → mg. Only whole messages that are clearly a drink match, so "tea and toast" stays food. */
export function parseCaffeine(text: string): { key: string; decaf: boolean; n: number } | { mg: number } | null {
  let t = text.trim().toLowerCase().replace(/[.!]+$/, '').replace(/\s+/g, ' ');
  const mg = t.match(/^(?:caffeine\s*)?(\d{1,4})\s*mg(?:\s*(?:of\s*)?caffeine)?$/);
  if (mg) return Number(mg[1]) > 0 && Number(mg[1]) <= 1000 ? { mg: Number(mg[1]) } : null;
  t = t.replace(/^(?:i\s*(?:'ve|have)?\s*)?(?:just\s+)?(?:had|having|drank|drinking|grabbed|got|getting)\s+/, '');
  const m = t.match(/^(?:(\d|a|an|another|my|one|two|three|four|five)\s+)?(?:(?:can|cup|mug|glass|bottle|pot)s? of\s+)?(?:(?:small|medium|regular|large|big)\s+)?(decaf\s+)?(.+?)(?:\s+(?:please|today|now|this morning))?$/);
  if (!m) return null;
  const n = Math.min(5, Number(m[1]) || COUNT[m[1] ?? 'a'] || 1);
  const find = (s: string) => ALIAS.get(s) ?? ALIAS.get(s.replace(/s$/, '')) ?? ALIAS.get(s.replace(/es$/, ''));
  // "coffee with milk" is its own drink; otherwise milk/sugar extras don't change the caffeine.
  const key = find(m[3]) ?? find(m[3].replace(/\s+(?:with|and|no|without)\s+(?:oat milk|milk|sugar|sweetener)(?:\s+(?:and|&)\s+(?:milk|sugar|sweetener))?$/, ''));
  if (!key) return null;
  return { key: key === 'coffee' && /\bmilk\b/.test(m[3]) ? 'milky' : key, decaf: !!m[2], n };
}

/** Typed "caffeine" / "caffeine?" / "log caffeine" (and the usual typos) opens the menu, no slash needed. */
export const wantsCaffeineMenu = (t: string) => /^(?:(?:log|add|track)\s+)?caff?[ie]+ne\??[.!]?$/i.test(t.trim());

export const caffeineMenu =(env: E, chat: number) => send(env, chat, MENU_TEXT, MENU);

export async function caffeineToday(env: E, day: string) {
  const { results } = await env.DB.prepare(`SELECT items FROM meals WHERE day = ? AND kind = 'caffeine'`).bind(day).all<{ items: string }>();
  const caf = results.reduce((a, m) => a + ((JSON.parse(m.items) as CafItem[])[0]?.caf ?? 0), 0);
  return { count: results.length, caf };
}

async function card(env: E, id: number, it: CafItem) {
  const s = await getSettings(env);
  const t = local(s.tz);
  const { count, caf } = await caffeineToday(env, t.day);
  const notes = [
    !it.decaf && it.caf > 10 && t.mins >= toMins(s.caffeine_cutoff) &&
      `☝️ it's after ${s.caffeine_cutoff}. caffeine now can cost you sleep tonight${DRINKS[it.key] ? `. tap 🌙 if it's decaf` : ''}`,
    caf > DAILY_MAX && `⚠️ that's ~${caf}mg today, over the ~${DAILY_MAX}mg most adults are advised to stay under`,
  ].filter(Boolean);
  const rows: Button[][] = [
    [{ text: '🍬 +1 sugar', data: `cs:${id}` }, ...(DRINKS[it.key] ? [{ text: it.decaf ? '☕ Not decaf' : '🌙 Decaf', data: `cd:${id}` }] : [])],
    [{ text: '↩️ Undo', data: `cu:${id}` }, { text: '☕ Another', data: 'cm' }],
  ];
  const sugar = it.sugar ? ` + ${it.sugar} sugar` : '';
  return {
    text: `☕ <b>${it.decaf ? 'Decaf ' + it.name.toLowerCase() : it.name}</b>${sugar} logged (${Math.round(it.kcal)} kcal)\n<b>Drink #${count} today</b> · ~${caf}mg caffeine` +
      (notes.length ? `\n${notes.join('\n')}` : ''),
    rows,
  };
}

/** Log one drink. Returns the card to send or edit, or null on a double-tap. */
async function log(env: E, it: CafItem, tap = false) {
  // A double-tap fires two button callbacks a moment apart (Jake, 2026-10-22): one tapped drink per 8s. Typed
  // drinks always log, or "coffee" then "tea" would silently drop the tea.
  if (tap) {
    const last = await env.DB.prepare(`SELECT MAX(ts) t FROM meals WHERE kind = 'caffeine'`).first<{ t: number | null }>();
    if (last?.t && nowSec() - last.t < 8) return null;
  }
  const s = await getSettings(env);
  const id = await saveMeal(env, s, it.name, [it], undefined, 'caffeine');
  return card(env, id, it);
}

const fromDrink = (key: string, decaf = false): CafItem | null => {
  const d = DRINKS[key];
  return d ? { name: d.label, kcal: d.kcal, p: d.p, c: d.c, f: d.f, caf: decaf ? DECAF_CAF : d.caf, key, decaf } : null;
};

/** For the mini app: the drink buttons, and logging one by key. False on a double-tap or unknown key. */
export const DRINK_LIST = Object.entries(DRINKS).map(([key, d]) => ({ key, label: d.label, caf: d.caf }));
export const CAFFEINE_MAX = DAILY_MAX;
export async function logKey(env: E, key: string) {
  const it = fromDrink(key);
  return !!(it && (await log(env, it, true)));
}

/** Button: cf:<key>. */
export async function logButton(env: E, chat: number, msgId: number, key: string) {
  const it = fromDrink(key);
  const out = it && (await log(env, it, true));
  if (out) return edit(env, chat, msgId, out.text, out.rows);
}

/** Typed drink or "150mg". True if it was one. */
export async function logText(env: E, chat: number, text: string) {
  if (bareCoffee(text)) {
    await coffeePicker(env, chat);
    return true;
  }
  const p = parseCaffeine(text);
  if (!p) return false;
  const it = 'mg' in p ? { name: 'Caffeine', kcal: 0, caf: p.mg, key: 'mg' } : fromDrink(p.key, p.decaf);
  if (!it) return false;
  let out = null;
  for (let i = 0; i < ('n' in p ? p.n : 1); i++) out = await log(env, { ...it });
  if (out) await send(env, chat, out.text, out.rows);
  return true;
}

async function getItem(env: E, id: number) {
  const m = await env.DB.prepare(`SELECT items FROM meals WHERE id = ? AND kind = 'caffeine'`).bind(id).first<{ items: string }>();
  return m ? (JSON.parse(m.items) as CafItem[])[0] : null;
}

/** Button cs:<id>: one teaspoon of sugar on a logged drink. */
export async function addSugar(env: E, chat: number, msgId: number, val: string) {
  const id = Number(val);
  const it = await getItem(env, id);
  if (!it) return edit(env, chat, msgId, `${FACE.idle} that one was removed`);
  it.sugar = (it.sugar ?? 0) + 1;
  it.kcal += SUGAR.kcal;
  it.c = (it.c ?? 0) + SUGAR.c;
  await env.DB.prepare(`UPDATE meals SET items = ?, kcal = ? WHERE id = ?`).bind(JSON.stringify([it]), Math.round(it.kcal), id).run();
  const { text, rows } = await card(env, id, it);
  return edit(env, chat, msgId, text, rows);
}

/** Flip decaf: only the caffeine changes. */
export async function toggleDecaf(env: E, chat: number, msgId: number, val: string) {
  const id = Number(val);
  const it = await getItem(env, id);
  if (!it || !DRINKS[it.key]) return edit(env, chat, msgId, `${FACE.idle} that one was removed`);
  it.decaf = !it.decaf;
  it.caf = it.decaf ? DECAF_CAF : DRINKS[it.key].caf;
  await env.DB.prepare(`UPDATE meals SET items = ? WHERE id = ?`).bind(JSON.stringify([it]), id).run();
  const { text, rows } = await card(env, id, it);
  return edit(env, chat, msgId, text, rows);
}

export async function undo(env: E, chat: number, msgId: number, val: string) {
  await env.DB.prepare(`DELETE FROM meals WHERE id = ? AND kind = 'caffeine'`).bind(Number(val)).run();
  const s = await getSettings(env);
  const { count, caf } = await caffeineToday(env, local(s.tz).day);
  return edit(env, chat, msgId, `↩️ removed. ${count} today · ~${caf}mg`, [[{ text: '☕ log one', data: 'cm' }]]);
}

export const backToMenu = (env: E, chat: number, msgId: number) => edit(env, chat, msgId, MENU_TEXT, MENU);

export async function caffeineLines(env: E, day: string) {
  const { count, caf } = await caffeineToday(env, day);
  return count ? [`☕ ${count} caffeine drink${count > 1 ? 's' : ''} · ~${caf}mg`] : [];
}
