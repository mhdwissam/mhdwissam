// All dates are handled as 'YYYY-MM-DD' strings in UTC to avoid timezone drift.

export const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
// Week order as used in Syria: Saturday first.
export const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

const MS_DAY = 86400000;

export function toDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fmt(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(s, n) {
  return fmt(new Date(toDate(s).getTime() + n * MS_DAY));
}

export function diffDays(a, b) {
  // b - a in days
  return Math.round((toDate(b) - toDate(a)) / MS_DAY);
}

export function weekday(s) {
  return toDate(s).getUTCDay();
}

export function minDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

export function maxDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

// Inclusive range of dates [from, to]
export function* eachDay(from, to) {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}

// Saturday on or before the given date
export function weekStart(s) {
  const wd = weekday(s);
  return addDays(s, -((wd + 1) % 7));
}

export function realToday() {
  const now = new Date();
  return fmt(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

export function prettyDate(s) {
  if (!s) return '—';
  const [y, m, d] = s.split('-').map(Number);
  return `${d}/${m}/${y}`;
}

export function dayLabel(s) {
  return `${DAY_NAMES[weekday(s)]} ${prettyDate(s)}`;
}
