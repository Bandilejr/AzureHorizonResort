// src/services/qr-signing.ts — Central QR signing service, mobile mirror.
// REMEDIATED: fail-closed. No hardcoded fallback secret (F-P1-20). Set
// EXPO_PUBLIC_QR_SIGNING_SECRET (same value as web VITE_QR_SIGNING_SECRET).
// Passes signed under a previous secret stop verifying after rotation —
// re-issue via Logistics. No other module may hold a QR secret.
import * as Crypto from 'expo-crypto';

function getSecret(): string {
  const fromEnv = process.env.EXPO_PUBLIC_QR_SIGNING_SECRET;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  throw new Error(
    '[qr-signing] EXPO_PUBLIC_QR_SIGNING_SECRET is not set. Refusing to sign/verify.'
  );
}

/** hex SHA-256 of (secret + JSON.stringify(payload)) — byte-identical to legacy chain. */
export async function signQrPayload(payload: unknown): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    getSecret() + JSON.stringify(payload)
  );
  return digest;
}

/** Recomputes the signature over the unsigned payload and compares. */
export async function verifyQrSignature(payloadWithoutSig: unknown, sig: string): Promise<boolean> {
  const expected = await signQrPayload(payloadWithoutSig);
  return sig === expected;
}
