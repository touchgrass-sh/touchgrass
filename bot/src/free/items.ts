import type { FoodItem } from '../ai';

// Logged food lines as stored in meals.items. Only the sudo pack writes them (AI food logging); free reads them so
// caffeine drinks and any food rows still add up in /today, /week and the dashboard.

export interface Per100 { kcal: number; p: number; f: number; c: number }

/** A resolved food line: totals for `grams`. src = "cofid:<code>" | "off:<barcode>" | "label" | "est" | "user". */
export type Item = FoodItem & { grams: number; p: number; f: number; c: number; src: string };

export function totals(items: Pick<FoodItem, 'kcal' | 'p' | 'f' | 'c'>[]): Per100 {
  return items.reduce<Per100>((t, i) => ({ kcal: t.kcal + (+i.kcal || 0), p: t.p + (+(i.p ?? 0) || 0), f: t.f + (+(i.f ?? 0) || 0), c: t.c + (+(i.c ?? 0) || 0) }), { kcal: 0, p: 0, f: 0, c: 0 });
}
