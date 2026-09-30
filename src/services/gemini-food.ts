// Gemini food-image assist — Phase 1 §31: server-side proxy ONLY.
// Mobile → authenticated Cloud Function (analyzeFoodImage) → Gemini.
// The Gemini API key is a SERVER secret (functions/.env / Secret Manager) —
// never bundled into the client. When the proxy is unreachable or the server
// key is missing, Donation Log falls back to manual entry with a specific,
// human-readable message. 2.0-flash is retired — the proxy targets
// gemini-2.5-flash with thinking disabled for low latency.

import { functions } from '@/services/firebase-services';
import { httpsCallable } from 'firebase/functions';

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

export interface GeminiFoodResult {
  category: string;
  itemName: string;
  estimatedPortions: number | null;
  estimatedWeightKg: number | null;
  expiryHoursFromNow: number | null;
  allergens: string[];
  confidence: number | null; // §33: null when the model did not provide one — never fabricated
  notes: string;
}

export function isGeminiConfigured(): boolean {
  // §31: the authenticated proxy is always the configured path — real
  // availability is decided by the server (deployed function + server key).
  return true;
}

// Client-side timeout guard (§32/§37): the callable must never hang the UI.
async function callProxyWithTimeout(imageBase64: string, mimeType: string): Promise<GeminiFoodResult> {
  const call = httpsCallable<{ imageBase64: string; mimeType: string }, GeminiFoodResult>(
    functions,
    'analyzeFoodImage',
  );
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(Object.assign(new Error(GEMINI_ERROR_MESSAGES.TIMEOUT), { code: 'deadline-exceeded' })),
      25_000,
    ),
  );
  return Promise.race([call({ imageBase64, mimeType }).then((r) => r.data), timeout]);
}

/**
 * Map FunctionsError codes to §32 categories.
 * NOTE: the server returns `failed-precondition` for BOTH a safety block and a
 * retired model — the server message disambiguates. `permission-denied` is a
 * server KEY problem (leaked/revoked), NOT a user-auth problem, so it maps to
 * SERVER_CONFIG rather than AUTH_ERROR.
 */
function mapProxyError(e: unknown): Error {
  const code = (e as { code?: string })?.code || '';
  const serverMessage = (e as { message?: string })?.message || '';
  const map: Record<string, GeminiErrorCode> = {
    'unauthenticated': 'AUTH_ERROR',
    'permission-denied': 'SERVER_CONFIG',
    'resource-exhausted': 'RATE_LIMIT',
    'deadline-exceeded': 'TIMEOUT',
    'invalid-argument': 'INVALID_IMAGE',
    'failed-precondition': /model/i.test(serverMessage) ? 'MODEL_UNAVAILABLE' : 'SAFETY_BLOCK',
    'internal': 'INVALID_RESPONSE',
    'not-found': 'MODEL_UNAVAILABLE',
    'unavailable': 'SERVICE_UNAVAILABLE',
  };
  const category = map[code];
  // Prefer the server's specific, actionable message when present; fall back to
  // the category message. Always keep the manual-entry fallback wording.
  const message = serverMessage || (category ? GEMINI_ERROR_MESSAGES[category] : GEMINI_ERROR_MESSAGES.NETWORK_ERROR);
  return new Error(message);
}

export async function analyzeFoodImage(
  imageUri: string,
  opts?: { base64?: string; mimeType?: string },
): Promise<GeminiFoodResult | null> {
  // Prefer the picker's inline base64; fall back to reading the file directly
  // (expo-file-system) so gallery/camera results always work.
  let base64 = opts?.base64 || '';
  const mimeType = opts?.mimeType || 'image/jpeg';
  if (!base64) {
    const FileSystem = await import('expo-file-system');
    base64 = await (FileSystem as any).readAsStringAsync(imageUri, {
      encoding: (FileSystem as any).EncodingType?.Base64 || 'base64',
    });
  }
  if (!base64) throw new Error(GEMINI_ERROR_MESSAGES.INVALID_IMAGE);

  try {
    // §31: the image goes to the AUTHENTICATED server proxy — the Gemini key
    // never leaves the server.
    return await callProxyWithTimeout(base64, mimeType);
  } catch (e) {
    throw mapProxyError(e);
  }
}

export const GEMINI_UNAVAILABLE_MESSAGE =
  'AI assistance unavailable. Continue manually.';

