/**
 * Room-key payload codec - dependency-free so both `firebase-services`
 * (issuance) and `room-key-nfc` (arming + verification) can share it
 * without a circular import.
 */

export interface RoomKeyPayload {
  v: 1;
  /** booking id - document id in room_credentials */
  b: string;
  /** room id (venue/room reference) */
  r: string;
  /** random capability token (hex) */
  t: string;
  /** expiry epoch ms */
  e: number;
}

const ROOM_KEY_URI_PREFIX = 'azurehotel://room/';

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Serialises a payload into the NDEF URI `azurehotel://room/<base64url>`. */
export function buildRoomKeyUri(payload: RoomKeyPayload): string {
  const json = JSON.stringify(payload);
  return ROOM_KEY_URI_PREFIX + toBase64Url(new TextEncoder().encode(json));
}

/** Parses the NDEF URI payload. Returns null when malformed. */
export function parseRoomKeyUri(uri: string | null | undefined): RoomKeyPayload | null {
  if (!uri || !uri.startsWith(ROOM_KEY_URI_PREFIX)) return null;
  try {
    const json = new TextDecoder().decode(fromBase64Url(uri.slice(ROOM_KEY_URI_PREFIX.length)));
    const p = JSON.parse(json);
    if (p && p.v === 1 && typeof p.b === 'string' && typeof p.r === 'string' &&
        typeof p.t === 'string' && typeof p.e === 'number') {
      return p as RoomKeyPayload;
    }
    return null;
  } catch {
    return null;
  }
}
