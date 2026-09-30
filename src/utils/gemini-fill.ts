// src/utils/gemini-fill.ts — PURE mapping from a Gemini food-analysis response
// to donation-form fields. No Firebase, no UI, no side effects (fully unit-tested
// in scripts/test-gemini-fill.js).
//
// Guarantees:
//  - NEVER sets the safety checklist (AI cannot pre-tick safety).
//  - Expiry is only suggested when the model reported a date actually PRINTED
//    on the label (`expiryDateOnLabel`). An advisory `expiryHoursFromNow`
//    estimate is NEVER written into `expiryAt` (staff set the real use-by).
//  - Numbers-as-strings are coerced; missing/malformed fields are skipped.
//  - JSON wrapped in markdown fences is unwrapped.
import { localDateTimeISO } from './dates';

export interface DonationFormSuggestion {
  itemName?: string;
  mealCategory?: string;
  portions?: string;
  weight?: string;
  allergens?: string;
  expiryAt?: string; // local 'YYYY-MM-DDTHH:mm'
}

export interface GeminiRawFields {
  itemName?: unknown;
  category?: unknown;
  estimatedPortions?: unknown;
  estimatedWeightKg?: unknown;
  expiryDateOnLabel?: unknown;
  expiryHoursFromNow?: unknown;
  allergens?: unknown;
  confidence?: unknown;
  notes?: unknown;
}

/**
 * Normalize a date the model read off a label into the form's local
 * 'YYYY-MM-DDTHH:mm' shape. A bare date is treated as end-of-day (23:59) since
 * that is what a printed "use by <date>" means. Anything unparseable is ignored.
 */
function normalizePrintedExpiry(v: string): string | null {
  const s = v.trim();
  const dateOnly = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T23:59`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return localDateTimeISO(d);
}

/** Unwrap a JSON object from raw model text (handles ```json fences). */
export function extractJsonFromText(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toNum(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalize(input: unknown): GeminiRawFields | null {
  if (input == null) return null;
  if (typeof input === 'string') return extractJsonFromText(input);
  if (typeof input === 'object') return input as GeminiRawFields;
  return null;
}

/**
 * Map a Gemini response (raw text or parsed object) to donation-form fields.
 * Pure and deterministic — no clock is used (printed dates pass through as-is).
 */
export function geminiToDonationForm(input: unknown): DonationFormSuggestion {
  const raw = normalize(input);
  if (!raw) return {};
  const out: DonationFormSuggestion = {};

  if (typeof raw.itemName === 'string' && raw.itemName.trim()) out.itemName = raw.itemName.trim();
  if (typeof raw.category === 'string' && raw.category.trim()) out.mealCategory = raw.category.trim();

  const portions = toNum(raw.estimatedPortions);
  if (portions != null && portions > 0) out.portions = String(portions);

  const weight = toNum(raw.estimatedWeightKg);
  if (weight != null && weight > 0) out.weight = String(weight);

  if (Array.isArray(raw.allergens)) {
    const list = (raw.allergens as unknown[])
      .map((a) => String(a).trim().toLowerCase())
      .filter(Boolean);
    const uniq = [...new Set(list)];
    if (uniq.length) out.allergens = uniq.join(', ');
  }

  // Only a date PRINTED on the label may pre-fill expiryAt. An hours-from-now
  // estimate is advisory only and is never written here (staff set the real
  // use-by via the quick chips / picker).
  if (typeof raw.expiryDateOnLabel === 'string' && raw.expiryDateOnLabel.trim()) {
    const normalized = normalizePrintedExpiry(raw.expiryDateOnLabel);
    if (normalized) out.expiryAt = normalized;
  }

  // Intentionally NO safety-checklist output.
  return out;
}

/**
 * Merge a suggestion into the current form, skipping any field the user has
 * already edited (present in `touched`). Returns the applied field names.
 */
export function mergeSuggestionIntoForm<T extends Record<string, unknown>>(
  current: T,
  suggestion: DonationFormSuggestion,
  touched: Set<string>,
): { next: T; applied: string[] } {
  const next: T = { ...current };
  const applied: string[] = [];
  (Object.keys(suggestion) as (keyof DonationFormSuggestion)[]).forEach((k) => {
    if (touched.has(k as string)) return;
    const v = suggestion[k];
    if (v == null) return;
    (next as Record<string, unknown>)[k as string] = v;
    applied.push(k as string);
  });
  return { next, applied };
}
