/**
 * Room-key NFC abstraction.
 *
 * Two independent features:
 *  1. HCE emulation: arms the native `RoomKeyBridge` module so the phone
 *     behaves like a Type-4 NFC tag exposing the URI record
 *     `azurehotel://room/<jwt>`.
 *  2. Reader/verifier: reads a room-key tag via the OS NFC reader and
 *     verifies the JWT (RS256 signature + expiry) with the server public key.
 *
 * Credentials are ONLY ever issued by the backend (`generateRoomCredential`),
 * signed with the server's private key. The app can verify but never sign.
 *
 * Every function reports REAL hardware/API state - there is no simulation
 * anywhere in this module. If the device cannot perform a real NFC operation
 * the caller receives the underlying reason (no NFC chip, NFC disabled,
 * native bridge missing, signature/expiry failure, ...).
 */
import { NativeModules, Platform } from 'react-native';
import NfcManager, { NfcEvents, NfcAdapter, Ndef, TagEvent } from 'react-native-nfc-manager';
import { KJUR, b64utoutf8 } from 'jsrsasign';
import { SERVER_PUBLIC_KEY_PEM } from './room-key-keys';
import { auth } from './firebase-services';

const ROOM_KEY_URI_PREFIX = 'azurehotel://room/';

export interface RoomKeyEnvironment {
  platform: 'android' | 'ios' | string;
  /** Host-card-emulation bridge module compiled into the binary. */
  bridgeAvailable: boolean;
  /** The OS reports an NFC chip on this device (reader+emulation capable). */
  nfcHardware: boolean;
  /** OS-level switch: NFC is enabled on this device. */
  nfcEnabled: boolean;
}

function getBridge(): any {
  if (Platform.OS !== 'android') throw new Error('RoomKey HCE is Android-only');
  const bridge = NativeModules.RoomKeyBridge;
  if (!bridge) throw new Error('Native RoomKeyBridge not available - use a development build');
  return bridge;
}

/**
 * Real device capability probe. Never assumes the hardware exists.
 * On web / iOS / emulator each report naturally reflects what the device
 * actually exposes (emulators report no NFC chip).
 */
export async function checkRoomKeyEnvironment(): Promise<RoomKeyEnvironment> {
  if (Platform.OS === 'web') {
    return { platform: 'web', bridgeAvailable: false, nfcHardware: false, nfcEnabled: false };
  }

  let nfcHardware = false;
  let nfcEnabled = false;
  try {
    nfcHardware = await NfcManager.isSupported();
  } catch {
    nfcHardware = false;
  }
  try {
    if (Platform.OS === 'android') nfcEnabled = await NfcManager.isEnabled();
  } catch {
    nfcEnabled = false;
  }

  return {
    platform: Platform.OS,
    bridgeAvailable: Platform.OS === 'android' && !!NativeModules.RoomKeyBridge,
    nfcHardware,
    nfcEnabled,
  };
}

/**
 * Verifies the JWT (RS256 signature against the SERVER public key), the
 * credential type, the bearer and the lifetime. Throws with the real reason
 * on any failure. Called before anything is armed onto the NFC stack.
 */
export function verifyRoomKeyCredential(jwt: string): Record<string, any> {
  if (!jwt || jwt.split('.').length !== 3) {
    throw new Error('Malformed room key credential');
  }
  const claims = JSON.parse(b64utoutf8(jwt.split('.')[1]));
  if (!claims || typeof claims !== 'object') {
    throw new Error('Invalid credential claims');
  }
  const valid = KJUR.jws.JWS.verify(jwt, SERVER_PUBLIC_KEY_PEM, ['RS256']);
  if (!valid) {
    throw new Error('Credential signature is invalid');
  }

  const now = Date.now() / 1000;

  if (claims.type !== 'room_key') {
    throw new Error('Credential type is not a room key');
  }
  if (typeof claims.bookingId !== 'string' || !claims.bookingId) {
    throw new Error('Credential has no booking reference');
  }
  if (typeof claims.exp !== 'number' || claims.exp < now) {
    throw new Error('Credential has expired');
  }
  if (claims.iat && claims.iat > now + 60) {
    throw new Error('Credential not yet valid');
  }
  if (auth.currentUser && claims.sub !== auth.currentUser.uid) {
    throw new Error('Credential was not issued for the signed-in guest');
  }
  return claims as Record<string, any>;
}

export function extractJwtFromUri(uri: string | null | undefined): string | null {
  if (!uri || !uri.startsWith(ROOM_KEY_URI_PREFIX)) return null;
  return uri.slice(ROOM_KEY_URI_PREFIX.length);
}

/**
 * Arms the HCE service with the room-key JWT. Performs the ENTIRE real chain
 * on the device:
 *  1. local verification of the server-issued credential (throws on failure)
 *  2. native arming of the HCE payload
 *  3. native read-back round-trip confirming the payload actually landed
 *  with no simulation at any step.
 */
export async function activateRoomKey(jwt: string): Promise<void> {
  verifyRoomKeyCredential(jwt);
  const ok = await getBridge().setPayload(jwt);
  if (!ok) throw new Error('Failed to arm NFC room key');
  const stored = await getBridge().getPayload();
  if (stored !== jwt) {
    throw new Error('Failed to confirm the armed payload on the NFC emulator');
  }
}

/** Reads the currently armed payload back from native - null when not armed. */
export async function readArmedPayload(): Promise<string | null> {
  try {
    return (await getBridge().getPayload()) as string | null;
  } catch {
    return null;
  }
}

/** Disarms the HCE service. */
export async function deactivateRoomKey(): Promise<void> {
  try {
    await getBridge().setPayload(null);
  } catch {
    // ignore teardown errors
  }
}

/** True only when the native emulator actually holds a payload. */
export async function isRoomKeyActive(): Promise<boolean> {
  if (Platform.OS !== 'android' || !NativeModules.RoomKeyBridge) return false;
  const payload = await readArmedPayload();
  return !!payload;
}

function getUriFromTag(tag: TagEvent): string | null {
  const records = tag.ndefMessage ?? [];
  const uriRecord =
    records.find((r) => r.tnf === 0x01 && r.type === 'U') ??
    records.find((r) => Ndef.isType(r, 0x01, 'U'));
  if (!uriRecord || !uriRecord.payload) return null;
  try {
    return Ndef.uri.decodePayload(new Uint8Array(uriRecord.payload));
  } catch {
    return null;
  }
}

/**
 * Starts reader mode and resolves once a room-key tag is tapped and its
 * signed JWT verifies. Rejects with the real error otherwise (bad tag or
 * bad signature). The caller is responsible for a real timeout if wanted.
 */
export async function readRoomKey() {
  await NfcManager.start();
  const result = await new Promise<any>((resolve, reject) => {
    let done = false;
    const finish = (err: Error | null, val?: unknown) => {
      if (done) return;
      done = true;
      NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
      NfcManager.unregisterTagEvent().catch(() => {});
      (NfcManager as any).stop().catch(() => {});
      if (err) reject(err);
      else resolve(val);
    };

    NfcManager.setEventListener(NfcEvents.DiscoverTag, (tag: TagEvent) => {
      try {
        const uri = getUriFromTag(tag);
        const jwt = extractJwtFromUri(uri);
        if (!jwt) {
          finish(new Error('Tag does not contain a room key'));
          return;
        }
        const claims = verifyRoomKeyCredential(jwt);
        finish(null, { jwt, claims });
      } catch (e) {
        finish(e as Error);
      }
    });

    NfcManager.registerTagEvent({
      isReaderModeEnabled: true,
      readerModeFlags:
        NfcAdapter.FLAG_READER_NFC_A | NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK,
    }).catch((e: any) => finish(e instanceof Error ? e : new Error(String(e))));
  });
  return result;
}

export async function stopRoomKeyReader(): Promise<void> {
  try {
    NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
    await NfcManager.unregisterTagEvent();
    await (NfcManager as any).stop();
  } catch {
    // ignore teardown errors
  }
}
