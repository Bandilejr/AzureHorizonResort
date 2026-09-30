/**
 * Room-key NFC abstraction - REAL, no simulation.
 *
 * Two independent features:
 *  1. HCE emulation: arms the native `RoomKeyApduService` (Type-4 NDEF tag)
 *     so the phone behaves like a standard NFC tag exposing the URI record
 *     `azurehotel://room/<payload>`. Any NFC reader - including another
 *     phone running this app - reads it like a normal NDEF tag.
 *  2. Reader/verifier: reads a room-key tag via the OS NFC reader and
 *     verifies the payload against Firestore (`room_credentials`), which is
 *     the shared authority - Spark-plan compatible, no Cloud Functions.
 *
 * Credential lifecycle (all client-side, Firestore rules enforce access):
 *  - `generateRoomCredential` issues a random 192-bit token, stores its
 *    SHA-256 hash + expiry + room in `room_credentials/<bookingId>` and
 *    returns the URI payload to arm onto the HCE tag.
 *  - The reader only ever sees the token; it verifies the hash, room and
 *    expiry in Firestore. A revoked or expired credential is rejected.
 *
 * Every function reports REAL hardware/API state. If the device cannot
 * perform a real NFC operation the caller receives the underlying reason.
 */
import { NativeModules, Platform } from 'react-native';
import NfcManager, { NfcEvents, NfcAdapter, Ndef, TagEvent } from 'react-native-nfc-manager';
import * as Crypto from 'expo-crypto';
import { db } from './firebase-services';
import { doc, getDoc } from 'firebase/firestore';
import { RoomKeyPayload, buildRoomKeyUri, parseRoomKeyUri } from './room-key-payload';

export type { RoomKeyPayload };
export { buildRoomKeyUri, parseRoomKeyUri };

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
 * Verifies a parsed payload against the Firestore authority:
 *  - credential document exists
 *  - token hash matches (capability, not forgeable without the token)
 *  - room id matches the claimed room
 *  - not expired, not revoked
 * Throws with the real reason on any failure.
 */
export async function verifyRoomKeyPayload(payload: RoomKeyPayload): Promise<void> {
  if (payload.e < Date.now()) {
    throw new Error('Room key has expired');
  }
  const snap = await getDoc(doc(db, 'room_credentials', payload.b));
  if (!snap.exists()) {
    throw new Error('Room key was not issued (unknown booking)');
  }
  const cred = snap.data() as any;
  if (cred.revoked === true) {
    throw new Error('Room key has been revoked');
  }
  if (cred.roomId && payload.r && String(cred.roomId) !== String(payload.r)) {
    throw new Error('Room key does not match this room');
  }
  const expectedHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    payload.t
  );
  if (cred.tokenHash !== expectedHash) {
    throw new Error('Room key signature is invalid');
  }
  if (cred.expiresAt && Number(cred.expiresAt) < Date.now()) {
    throw new Error('Room key has expired');
  }
}

/**
 * Arms the HCE service with the room-key URI. Performs the ENTIRE real chain
 * on the device:
 *  1. local verification of the payload structure
 *  2. native arming of the HCE payload
 *  3. native read-back round-trip confirming the payload actually landed
 */
export async function activateRoomKey(uri: string): Promise<void> {
  const payload = parseRoomKeyUri(uri);
  if (!payload) throw new Error('Malformed room key payload');
  const ok = await getBridge().setPayload(uri);
  if (!ok) throw new Error('Failed to arm NFC room key');
  const stored = await getBridge().getPayload();
  if (stored !== uri) {
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
 * payload verifies against Firestore. Rejects with the real error otherwise
 * (bad tag, bad signature, expired/revoked credential, or timeout).
 */
export async function readRoomKey(timeoutMs = 45000): Promise<{ payload: RoomKeyPayload }> {
  await NfcManager.start();
  const result = await new Promise<{ payload: RoomKeyPayload }>((resolve, reject) => {
    let done = false;
    const finish = (err: Error | null, val?: { payload: RoomKeyPayload }) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
      // unregisterTagEvent disables reader mode; there is no stop() in v3
      NfcManager.unregisterTagEvent().catch(() => {});
      if (err) reject(err);
      else resolve(val!);
    };

    const timer = setTimeout(() => {
      finish(new Error('Timed out waiting for a room key tag'));
    }, timeoutMs);

    NfcManager.setEventListener(NfcEvents.DiscoverTag, (tag: TagEvent) => {
      (async () => {
        try {
          const uri = getUriFromTag(tag);
          const payload = parseRoomKeyUri(uri);
          if (!payload) {
            finish(new Error('Tag does not contain a room key'));
            return;
          }
          await verifyRoomKeyPayload(payload);
          finish(null, { payload });
        } catch (e) {
          finish(e as Error);
        }
      })();
    });

    NfcManager.registerTagEvent({
      isReaderModeEnabled: true,
      // No SKIP_NDEF_CHECK: the system must run full NDEF discovery so the
      // emulated Type-4 tag is parsed and ndefMessage is populated.
      readerModeFlags: NfcAdapter.FLAG_READER_NFC_A,
    }).catch((e: any) => finish(e instanceof Error ? e : new Error(String(e))));
  });
  return result;
}

export async function stopRoomKeyReader(): Promise<void> {
  try {
    NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
    await NfcManager.unregisterTagEvent();
  } catch {
    // ignore teardown errors
  }
}
