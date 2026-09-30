// src/services/gemini-food.ts
//
// ⚠️ PERSONAL-USE APK ONLY. The Gemini key is embedded in this build; do not
// distribute this APK. This is a deliberate, approved exception to the
// "no keys in EXPO_PUBLIC_" rule for the Gemini key only (see README).
//
// The app calls the Gemini REST API directly (no Cloud Function — the project
// is on the free Spark plan and cannot deploy functions). The single
// `callGeminiRest()` function is the ONLY network touchpoint, so a server-side
// proxy can replace it later without changing callers.
//
// Advisory only: results pre-fill the donation form; every field stays editable
// and the form works fully manually when AI is unavailable.

import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Image } from 'react-native';

const GEMINI_MODEL = process.env.EXPO_PUBLIC_GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_WIDTH = 1024;

// §32: structured failure categories — never collapse to one generic message.
export type GeminiErrorCode =
  | 'NETWORK_ERROR' | 'AUTH_ERROR' | 'SERVER_CONFIG' | 'RATE_LIMIT' | 'TIMEOUT'
  | 'INVALID_IMAGE' | 'SAFETY_BLOCK' | 'INVALID_RESPONSE' | 'MODEL_UNAVAILABLE' | 'SERVICE_UNAVAILABLE';

export const GEMINI_ERROR_MESSAGES: Record<GeminiErrorCode, string> = {
  NETWORK_ERROR: 'Network error reaching the AI service — check your connection.',
  AUTH_ERROR: 'AI access rejected for your account — sign in again or continue manually.',
  SERVER_CONFIG: 'AI service key is invalid or has been rotated — continue manually.',
  RATE_LIMIT: 'AI quota exceeded — try again later or continue manually.',
  TIMEOUT: 'Analysis took too long — try again or continue manually.',
  INVALID_IMAGE: 'The photo could not be analyzed — try another photo or continue manually.',
  SAFETY_BLOCK: 'The image was blocked by the AI safety filter — continue manually.',
  INVALID_RESPONSE: 'The AI returned an unreadable response — try again or continue manually.',
  MODEL_UNAVAILABLE: 'The configured AI model is unavailable — continue manually.',
  SERVICE_UNAVAILABLE: 'AI analysis is unavailable right now — continue manually.',
};

export const GEMINI_UNAVAILABLE_MESSAGE = 'AI assistance unavailable. Continue manually.';

export interface GeminiFoodResult {
  category: string;
  itemName: string;
  estimatedPortions: number | null;
  estimatedWeightKg: number | null;
  expiryHoursFromNow: number | null;
  allergens: string[];
  confidence: number | null;
  notes: string;
}

const PROMPT = `You are a food-rescue intake assistant for a hotel kitchen donating surplus food to charities.
Analyse the food-safety photo and return ONLY a JSON object with these fields:
{
  "itemName": string,            // short human name, e.g. "Cooked chicken curry"
  "category": string,            // one of: Cooked meals, Fresh produce, Bakery, Dairy, Packaged goods, Beverages, Other
  "estimatedPortions": number|null,
  "estimatedWeightKg": number|null,
  "expiryHoursFromNow": number|null, // best estimate of hours until unsafe
  "allergens": string[],         // visible or likely allergens, e.g. ["nuts","dairy"]
  "confidence": number,          // 0..1 how sure you are overall
  "notes": string                // one short sentence for the kitchen staff
}
Be conservative: if quantity is unclear return null and lower confidence. Never invent allergens that are not visible or strongly implied.`;

export function isGeminiConfigured(): boolean {
  return !!GEMINI_API_KEY;
}

function extractJson(text: string): Record<string, unknown> | null {
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
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** Resize/compress to ~1024px JPEG before sending. Falls back to the raw bytes. */
async function resizeForUpload(imageUri: string, providedBase64?: string | null): Promise<{ base64: string; mimeType: string }> {
  try {
    const size = await new Promise<{ width: number; height: number } | null>((resolve) => {
      Image.getSize(imageUri, (width, height) => resolve({ width, height }), () => resolve(null));
    });
    const actions = size && size.width > MAX_WIDTH ? [{ resize: { width: MAX_WIDTH } }] : [];
    const out = await manipulateAsync(imageUri, actions, { compress: 0.7, format: SaveFormat.JPEG, base64: true });
    if (out.base64) return { base64: out.base64, mimeType: 'image/jpeg' };
  } catch { /* fall through to raw bytes */ }
  if (providedBase64) return { base64: providedBase64, mimeType: 'image/jpeg' };
  const FileSystem = await import('expo-file-system');
  const b64 = await (FileSystem as any).readAsStringAsync(imageUri, {
    encoding: (FileSystem as any).EncodingType?.Base64 || 'base64',
  });
  return { base64: b64, mimeType: 'image/jpeg' };
}

function classifyHttp(status: number): GeminiErrorCode {
  if (status === 401 || status === 403) return 'SERVER_CONFIG';
  if (status === 429) return 'RATE_LIMIT';
  if (status === 404) return 'MODEL_UNAVAILABLE';
  if (status === 400) return 'INVALID_IMAGE';
  if (status >= 500) return 'SERVICE_UNAVAILABLE';
  return 'SERVICE_UNAVAILABLE';
}

const RETRYABLE: GeminiErrorCode[] = ['NETWORK_ERROR', 'TIMEOUT', 'SERVICE_UNAVAILABLE'];

/**
 * The single network touchpoint — replace this with a proxy call later.
 * Hard timeout via AbortController; throws a mapped, human-readable Error.
 */
async function callGeminiRest(base64: string, mimeType: string): Promise<GeminiFoodResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
  } catch (e: any) {
    clearTimeout(timer);
    const code: GeminiErrorCode = e?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR';
    throw Object.assign(new Error(GEMINI_ERROR_MESSAGES[code]), { geminiCode: code });
  }
  clearTimeout(timer);

  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch { /* ignore */ }
    if ((res.status === 400) && /SAFETY|safety/.test(detail)) {
      throw Object.assign(new Error(GEMINI_ERROR_MESSAGES.SAFETY_BLOCK), { geminiCode: 'SAFETY_BLOCK' });
    }
    const code = classifyHttp(res.status);
    throw Object.assign(new Error(GEMINI_ERROR_MESSAGES[code]), { geminiCode: code });
  }

  const payload = await res.json();
  const finish = payload?.candidates?.[0]?.finishReason || '';
  if (finish === 'SAFETY') {
    throw Object.assign(new Error(GEMINI_ERROR_MESSAGES.SAFETY_BLOCK), { geminiCode: 'SAFETY_BLOCK' });
  }
  const text = payload?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
  const json = extractJson(text);
  if (!json) {
    throw Object.assign(new Error(GEMINI_ERROR_MESSAGES.INVALID_RESPONSE), { geminiCode: 'INVALID_RESPONSE' });
  }
  return {
    itemName: typeof json.itemName === 'string' ? json.itemName : '',
    category: typeof json.category === 'string' ? json.category : 'Other',
    estimatedPortions: toNum(json.estimatedPortions),
    estimatedWeightKg: toNum(json.estimatedWeightKg),
    expiryHoursFromNow: toNum(json.expiryHoursFromNow),
    allergens: Array.isArray(json.allergens) ? (json.allergens as unknown[]).map((a) => String(a)).filter(Boolean) : [],
    confidence: toNum(json.confidence),
    notes: typeof json.notes === 'string' ? json.notes : '',
  };
}

/**
 * Analyze a food photo. Advisory only. Never hangs: hard timeout per attempt and
 * at most ONE retry for transient failures.
 */
export async function analyzeFoodImage(
  imageUri: string,
  opts?: { base64?: string; mimeType?: string },
): Promise<GeminiFoodResult | null> {
  if (!GEMINI_API_KEY) throw new Error(GEMINI_UNAVAILABLE_MESSAGE);
  const { base64, mimeType } = await resizeForUpload(imageUri, opts?.base64);
  if (!base64) throw new Error(GEMINI_ERROR_MESSAGES.INVALID_IMAGE);
  try {
    return await callGeminiRest(base64, mimeType);
  } catch (e: any) {
    const code: GeminiErrorCode | undefined = e?.geminiCode;
    if (code && RETRYABLE.includes(code)) {
      try { return await callGeminiRest(base64, mimeType); } catch (e2: any) { throw e2; }
    }
    throw e;
  }
}
