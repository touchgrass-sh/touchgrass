import type { E } from '../env';
import { getSettings } from '../store';
import { send } from '../tg';
import { local } from '../time';
import { addDays, currentWeight, history, r0 } from './days';

// free: the feel-good deficit (ported from Jake). Burn = Mifflin-St Jeor BMR × 1.3 (desk job, on your feet a bit)
// + logged exercise, minus what was eaten, for the Mon–Sun week, complete logged days only (today isn't over).
// On a Monday it reports last week's final total. Needs height, age and sex in settings.

const ACTIVITY = 1.3;
const KCAL_PER_KG_FAT = 7700;

const mondayOf = (day: string) => addDays(day, -((new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7));

export async function deficit(env: E) {
  const s = await getSettings(env);
  if (!s.height_cm || !s.age || !s.sex) return null;
  const today = local(s.tz).day;
  let from = mondayOf(today);
  let label: 'this week' | 'last week' = 'this week';
  if (from === today) { from = addDays(from, -7); label = 'last week'; }
  const to = label === 'this week' ? addDays(today, -1) : addDays(from, 6);
  const [h, kgNow] = await Promise.all([history(env, 14), currentWeight(env)]);
  let kg = kgNow ?? 80;
  const perDay = h.filter((d) => d.day >= from && d.day <= to && d.n > 0).map((d) => {
    if (d.kg) kg = d.kg;
    const burn = (10 * kg + 6.25 * s.height_cm! - 5 * s.age! + (s.sex === 'm' ? 5 : -161)) * ACTIVITY + (d.burned || 0);
    return { day: d.day, burn, eaten: d.kcal, def: burn - d.kcal };
  });
  const total = perDay.reduce((a, d) => a + d.def, 0);
  return { label, from, to, total, days: perDay.length, avg: perDay.length ? total / perDay.length : 0, fatKg: total / KCAL_PER_KG_FAT, perDay };
}

/** Feel-good line(s) for the morning message and /week. */
export async function deficitLines(env: E) {
  const w = await deficit(env);
  if (!w?.days) return [];
  const y = w.label === 'this week' ? w.perDay[w.perDay.length - 1] : undefined;
  const lines = [`🔥 <b>Deficit ${w.label}</b>${w.label === 'last week' ? ' (final)' : ` (Mon–${new Date(w.to + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short' })})`}: ` +
    `${w.total >= 0 ? '−' : '+'}${r0(Math.abs(w.total))} kcal` + (w.total > 0 ? ` ≈ <b>${w.fatKg.toFixed(2)} kg of fat</b> gone` : '')];
  if (y) lines.push(`   Yesterday: ${y.def >= 0 ? '−' : '+'}${r0(Math.abs(y.def))} kcal (burned ~${r0(y.burn)}, ate ${r0(y.eaten)})`);
  if (w.total > 0) lines.push(`   That's about <b>${Math.floor(w.total / 550)} Big Macs</b> you didn't become 🍔`);
  if (w.label === 'last week') lines.push(`   New week starts today, let's beat it 💪`);
  return lines;
}

export async function deficitCmd(env: E, chat: number) {
  const s = await getSettings(env);
  if (!s.height_cm || !s.age || !s.sex) return send(env, chat, 'Add your height, age and sex in the app → Settings and I can work out your deficit.');
  return send(env, chat, (await deficitLines(env)).join('\n') || 'No full logged days yet, check back tomorrow.');
}
