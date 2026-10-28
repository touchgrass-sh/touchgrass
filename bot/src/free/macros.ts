import type { FoodItem } from '../ai';
import type { E } from '../env';

// free: macro sums for the weekly report card. Everything else reads days.ts.

export interface Macros { kcal: number; p: number; c: number; f: number }

export const sumMacros = (items: FoodItem[]): Macros => items.reduce(
  (t, i) => ({ kcal: t.kcal + (+i.kcal || 0), p: t.p + (+(i.p ?? 0) || 0), c: t.c + (+(i.c ?? 0) || 0), f: t.f + (+(i.f ?? 0) || 0) }),
  { kcal: 0, p: 0, c: 0, f: 0 },
);

/** Everything eaten on `day`, coffees included. */
export async function dayMacros(env: E, day: string): Promise<Macros> {
  const { results } = await env.DB.prepare(`SELECT items FROM meals WHERE day = ? AND items IS NOT NULL`).bind(day).all<{ items: string }>();
  return sumMacros(results.flatMap((x) => JSON.parse(x.items) as FoodItem[]));
}
