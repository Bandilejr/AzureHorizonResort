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
  | 'NETWORK_ERROR' | 'AUTH_ERROR' | 'RATE_LIMIT' | 'TIMEOUT'
  | 'INVALID_IMAGE' | 'SAFETY_BLOCK' | 'INVALID_RESPONSE' | 'SERVICE_UNAVAILABLE';

export const GEMINI_ERROR_MESSAGES: Record<GeminiErrorCode, string> = {
  NETWORK_ERROR: 'Network error reaching the AI service — check your connection.',
  AUTH_ERROR: 'AI access rejected for your account — sign in again or continue manually.',
  RATE_LIMIT: 'AI quota exceeded — try again later or continue manually.',
  TIMEOUT: 'Analysis took too long — try again or continue manually.',
  INVALID_IMAGE: 'The photo could not be analyzed — try another photo or continue manually.',
  SAFETY_BLOCK: 'The image was blocked by the AI safety filter — continue manually.',
  INVALID_RESPONSE: 'The AI returned an unreadable response — try again or continue manually.',
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

/** Map FunctionsError codes to §32 categories. */
function mapProxyError(e: unknown): Error {
  const code = (e as { code?: string })?.code || '';
  const map: Record<string, GeminiErrorCode> = {
    'unauthenticated': 'AUTH_ERROR',
    'permission-denied': 'AUTH_ERROR',
    'resource-exhausted': 'RATE_LIMIT',
    'deadline-exceeded': 'TIMEOUT',
    'invalid-argument': 'INVALID_IMAGE',
    'failed-precondition': 'SAFETY_BLOCK',
    'internal': 'INVALID_RESPONSE',
    'not-found': 'SERVICE_UNAVAILABLE',
    'unavailable': 'SERVICE_UNAVAILABLE',
  };
  const category = map[code];
  if (category) return new Error(GEMINI_ERROR_MESSAGES[category]);
  // Network failures surface as FirebaseError without a callable code, or as
  // plain Errors — treat anything unmapped as network/service trouble.
  return new Error(GEMINI_ERROR_MESSAGES.NETWORK_ERROR);
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
  'AI analysis is unavailable. You can continue manually.';

