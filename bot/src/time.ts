const fmts = new Map<string, Intl.DateTimeFormat>();

function fmt(tz: string) {
  let f = fmts.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      weekday: 'short', hourCycle: 'h23',
    });
    fmts.set(tz, f);
  }
  return f;
}

/** Wall clock in the owner's timezone: day key, minutes since midnight, weekday. */
export function local(tz: string, d = new Date()) {
  const p = Object.fromEntries(fmt(tz).formatToParts(d).map((x) => [x.type, x.value]));
  const mins = Number(p.hour) * 60 + Number(p.minute);
  return { day: `${p.year}-${p.month}-${p.day}`, mins, hhmm: `${p.hour}:${p.minute}`, weekday: p.weekday as string, weekend: p.weekday === 'Sat' || p.weekday === 'Sun' };
}

export function validTz(tz: string) {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const toMins = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const nowSec = () => Math.floor(Date.now() / 1000);

export function inWindow(mins: number, start: string, end: string) {
  const s = toMins(start), e = toMins(end);
  return s <= e ? mins >= s && mins < e : mins >= s || mins < e;
}

/** "9" / "9:30" / "09:30" / "21" → "HH:MM", else null. */
export function parseHHMM(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
