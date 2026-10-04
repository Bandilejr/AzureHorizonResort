// src/services/qr-signing.ts — Central QR signing service (Increment 2 hardening).
// Target: Environment secret → QR signing service → signed payloads.
// The secret comes ONLY from VITE_QR_SIGNING_SECRET in app/.env (must match
// mobile EXPO_PUBLIC_QR_SIGNING_SECRET). Fail closed: no hardcoded fallback —
// a misconfigured environment can never mint or accept demo-secret passes.
// No other module may hard-code a QR secret.

function getSecret(): string {
  try {
    const fromEnv = (import.meta as unknown as { env?: Record<string, string | undefined> })?.env
      ?.VITE_QR_SIGNING_SECRET;
    if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  } catch {
    /* non-Vite runtime — fall through to throw */
  }
  throw new Error(
    '[qr-signing] VITE_QR_SIGNING_SECRET is not set. Set it in app/.env (must match mobile EXPO_PUBLIC_QR_SIGNING_SECRET).'
  );
}

export function qrSecretSource(): 'env' {
  getSecret();
  return 'env';
}

/** hex SHA-256 of (secret + JSON.stringify(payload)) — byte-identical to the legacy chain. */
export async function signQrPayload(payload: unknown): Promise<string> {
  const data = new TextEncoder().encode(getSecret() + JSON.stringify(payload));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Recomputes the signature over the unsigned payload and compares. */
export async function verifyQrSignature(payloadWithoutSig: unknown, sig: string): Promise<boolean> {
  const expected = await signQrPayload(payloadWithoutSig);
  return sig === expected;
}
