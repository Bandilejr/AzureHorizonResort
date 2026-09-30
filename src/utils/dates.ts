// src/utils/dates.ts — local-timezone calendar date helpers (TZ Africa/Johannesburg).
// Roster, leave, availability and donation dates are calendar dates (YYYY-MM-DD)
// in LOCAL time. Never build them with `toISOString().slice(0, 10)`: that
// converts to UTC and shifts the date back one day in UTC+2 between 00:00 and
// 02:00 local — silently mislabelling "today", picked dates and calendar cells.

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD for a calendar date in the device's local timezone. */
export function localDateISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today as a local calendar date. */
export function todayISO(): string {
  return localDateISO(new Date());
}

/** Parse YYYY-MM-DD as a LOCAL date (midnight) — not UTC. */
export function parseISOLocal(iso: string): Date {
  const [y, m, d] = (iso || '').split('-').map(Number);
  if (!y || !m || !d) return new Date(NaN);
  return new Date(y, m - 1, d);
}

/** Add n days to a YYYY-MM-DD string (local-safe); returns YYYY-MM-DD. */
export function addDaysISO(iso: string, n: number): string {
  const d = parseISOLocal(iso);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + n);
  return localDateISO(d);
}

/** Monday-start week containing d, as a local YYYY-MM-DD (roster weeks start Monday). */
export function weekStartISO(d: Date = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const shift = (x.getDay() + 6) % 7; // Mon=0 .. Sun=6
  x.setDate(x.getDate() - shift);
  return localDateISO(x);
}

/** Local timestamp 'YYYY-MM-DDTHH:mm' for datetime pickers / pickup windows. */
export function localDateTimeISO(d: Date): string {
  return `${localDateISO(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Safe local display formatting for a YYYY-MM-DD string (never off-by-one). */
export function formatISODate(
  iso: string,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const d = parseISOLocal(iso);
  if (Number.isNaN(d.getTime())) return iso || '—';
  return d.toLocaleDateString('en-ZA', opts);
}

/** Inclusive day count between two YYYY-MM-DD strings. */
export function daysInclusive(startISO: string, endISO: string): number {
  const s = parseISOLocal(startISO);
  const e = parseISOLocal(endISO);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
}
