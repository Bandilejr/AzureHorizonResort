// src/utils/datetime-input.ts — pure conversions between UI picker values and
// the EXACT stored formats. UI pickers must never write a different shape.
//
// Stored-format contract (must match the pre-redesign text inputs):
//   calendar date        'YYYY-MM-DD'      (local, via localDateISO)
//   clock time           'HH:mm'           (local, 24h)
//   collection window    ISO 8601 string   = new Date(`${date}T${time}`).toISOString()
//   timestamps (prepared/expiry) ISO 8601  = new Date(pickerDate).toISOString()
//
// The old logistics text inputs accepted 'YYYY-MM-DDTHH:mm' and stored
// `new Date(value).toISOString()`. `localWindowToIso` reproduces that byte for
// byte for the same wall-clock input (see scripts/test-datetime-helpers.js).
import { localDateISO } from './dates';

/** A picked Date → stored calendar date 'YYYY-MM-DD' (local timezone). */
export function dateToStored(d: Date): string {
  return localDateISO(d);
}

/** A picked Date → stored clock time 'HH:mm' (local, 24h, zero-padded). */
export function timeToStored(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Collection window: stored as `new Date(`${date}T${time}`).toISOString()`.
 * `date` is 'YYYY-MM-DD', `time` is 'HH:mm' — both LOCAL.
 */
export function localWindowToIso(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString();
}

/** Legacy text-input path — retained ONLY to prove equivalence in tests. */
export function legacyTextToIso(value: string): string {
  return new Date(value).toISOString();
}

/** Stored ISO → local 'YYYY-MM-DD' (to pre-fill a date picker). '' when invalid. */
export function isoToStoredDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : localDateISO(d);
}

/** Stored ISO → local 'HH:mm' (to pre-fill a time picker). '' when invalid. */
export function isoToStoredTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : timeToStored(d);
}

/** 'HH:mm' → a Date on today's date carrying those hours/minutes (picker seed). */
export function storedTimeToDate(time: string, base: Date = new Date()): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h || 0, m || 0, 0, 0);
  return d;
}

/** 'YYYY-MM-DD' → a local Date at midnight (picker seed). */
export function storedDateToDate(date: string, fallback: Date = new Date()): Date {
  const [y, m, d] = (date || '').split('-').map(Number);
  if (!y || !m || !d) return fallback;
  return new Date(y, m - 1, d);
}

/** A picked Date (datetime) → stored ISO timestamp. */
export function dateTimeToStoredIso(d: Date): string {
  return d.toISOString();
}
