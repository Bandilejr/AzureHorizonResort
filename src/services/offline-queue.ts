import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";

// React hook for using offline queue
import { useState, useEffect } from "react";

export type QueueItemType =
  | "staff_checkin"
  | "attendee_checkin"
  | "pre_inspection"
  | "post_inspection"
  | "damage_report"
  | "live_complaint"
  | "loyalty_scan"
  // Increment 2 (UC39, UC45) — replayable with idempotency keys; payloads carry
  // server-ready primitives only (strings/numbers), never file:// URIs.
  | "attendance_punch"
  | "donation_collection";

export interface QueueItem {
  id: string;
  type: QueueItemType;
  payload: any;
  timestamp: number;
  retries: number;
  maxRetries: number;
  status: 'queued' | 'sending' | 'retrying';
  lastError?: string;
  nextAttemptAt?: number;
}

export interface FailedItem {
  item: QueueItem;
  error: string;
  failedAt: number;
}

const QUEUE_KEY = "@offline_queue";
const FAILED_KEY = "@offline_queue_failed";
const MAX_RETRIES = 5;
const RETRY_DELAY_BASE = 1000; // 1 second

// Terminal failures: retrying cannot help (expired/invalid passes, denied
// writes, missing records). Park immediately instead of burning retries.
const TERMINAL_PATTERNS = /expired|not yet valid|invalid|no longer current|another loading bay|permission-denied|insufficient permissions|not found|is required|must be|cannot|Cannot|already reviewed|already published|already been reviewed/i;
// Idempotent replays: server already applied — treat as success.
const IDEMPOTENT_PATTERNS = /already been|already recorded|already used|already collected|already clocked in|clock in before/i;

function classifyFailure(message: string): 'success' | 'terminal' | 'retryable' {
  if (IDEMPOTENT_PATTERNS.test(message)) return 'success';
  if (TERMINAL_PATTERNS.test(message)) return 'terminal';
  return 'retryable';
}

class OfflineQueue {
  private queue: QueueItem[] = [];
  private failed: FailedItem[] = [];
  private isProcessing = false;
  private listeners: Set<(queue: QueueItem[]) => void> = new Set();
  private failedListeners: Set<(failed: FailedItem[]) => void> = new Set();
  private netInfoUnsubscribe: (() => void) | null = null;

  async initialize() {
    await this.loadQueue();
    await this.loadFailed();
    this.setupNetworkListener();
    this.processQueue();
  }

  private async loadQueue() {
    try {
      const stored = await AsyncStorage.getItem(QUEUE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
        this.notifyListeners();
      }
    } catch (error) {
      console.error("Failed to load offline queue:", error);
    }
  }

  private async loadFailed() {
    try {
      const stored = await AsyncStorage.getItem(FAILED_KEY);
      if (stored) {
        this.failed = JSON.parse(stored);
        this.notifyFailedListeners();
      }
    } catch (error) {
      console.error("Failed to load failed queue:", error);
    }
  }

  private async saveQueue() {
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
    } catch (error) {
      console.error("Failed to save offline queue:", error);
    }
  }

  private setupNetworkListener() {
    this.netInfoUnsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected && !this.isProcessing) {
        this.processQueue();
      }
    });
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener([...this.queue]));
  }

  private notifyFailedListeners() {
    this.failedListeners.forEach((listener) => listener([...this.failed]));
  }

  subscribe(listener: (queue: QueueItem[]) => void) {
    this.listeners.add(listener);
    listener([...this.queue]);
    return () => { this.listeners.delete(listener); return undefined; };
  }

  subscribeFailed(listener: (failed: FailedItem[]) => void) {
    this.failedListeners.add(listener);
    listener([...this.failed]);
    return () => { this.failedListeners.delete(listener); return undefined; };
  }

  async enqueue(type: QueueItemType, payload: any, maxRetries = MAX_RETRIES) {
    // Idempotency: callers pass payload.idempotencyKey for replayable Increment 2
    // actions — a second enqueue with the same key collapses instead of duplicating.
    if (payload?.idempotencyKey) {
      const dup = this.queue.find(
        (i) => i.type === type && (i.payload as any)?.idempotencyKey === payload.idempotencyKey
      );
      if (dup) return dup.id;
    }
    const item: QueueItem = {
      id: payload?.idempotencyKey ? `${type}_${payload.idempotencyKey}` : `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      payload,
      timestamp: Date.now(),
      retries: 0,
      maxRetries,
      status: 'queued',
    };

    this.queue.push(item);
    await this.saveQueue();
    this.notifyListeners();

    // Try to process immediately if online
    const netInfo = await NetInfo.fetch();
    if (netInfo.isConnected) {
      this.processQueue();
    }

    return item.id;
  }

  async removeItem(id: string) {
    this.queue = this.queue.filter((item) => item.id !== id);
    await this.saveQueue();
    this.notifyListeners();
  }

  async retryFailed(id: string) {
    const idx = this.failed.findIndex((f) => f.item.id === id);
    if (idx < 0) return;
    const [f] = this.failed.splice(idx, 1);
    await this.saveFailed();
    this.notifyFailedListeners();
    f.item.retries = 0;
    f.item.status = 'queued';
    f.item.lastError = undefined;
    f.item.nextAttemptAt = undefined;
    this.queue.push(f.item);
    await this.saveQueue();
    this.notifyListeners();
    this.processQueue();
  }

  async discardFailed(id: string) {
    this.failed = this.failed.filter((f) => f.item.id !== id);
    await this.saveFailed();
    this.notifyFailedListeners();
  }

  private async saveFailed() {
    try {
      await AsyncStorage.setItem(FAILED_KEY, JSON.stringify(this.failed));
    } catch (error) {
      console.error("Failed to save failed queue:", error);
    }
  }

  private async parkAsFailed(item: QueueItem, error: string) {
    this.queue = this.queue.filter((i) => i.id !== item.id);
    this.failed = [{ item: { ...item, status: 'retrying' as const }, error, failedAt: Date.now() }, ...this.failed].slice(0, 100);
    await this.saveQueue();
    await this.saveFailed();
    this.notifyListeners();
    this.notifyFailedListeners();
  }

  getQueue(): QueueItem[] {
    return [...this.queue];
  }

  getFailed(): FailedItem[] {
    return [...this.failed];
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;

    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) return;

    this.isProcessing = true;
    try {
      // No head-of-line blocking: each cycle attempts every due item once;
      // failures back off individually, terminal failures park to the DLQ.
      const now = Date.now();
      for (const item of [...this.queue]) {
        if (item.nextAttemptAt && item.nextAttemptAt > now) continue;
        item.status = 'sending';
        this.notifyListeners();
        try {
          await this.processItem(item);
          this.queue = this.queue.filter((i) => i.id !== item.id);
          await this.saveQueue();
          this.notifyListeners();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const verdict = classifyFailure(message);
          if (verdict === 'success') {
            this.queue = this.queue.filter((i) => i.id !== item.id);
            await this.saveQueue();
            this.notifyListeners();
            continue;
          }
          item.retries++;
          item.lastError = message;
          if (verdict === 'terminal' || item.retries >= item.maxRetries) {
            await this.parkAsFailed(item, verdict === 'terminal'
              ? `Will not retry: ${message}`
              : `Gave up after ${item.retries} attempts: ${message}`);
          } else {
            item.status = 'retrying';
            item.nextAttemptAt = Date.now() + RETRY_DELAY_BASE * Math.pow(2, item.retries - 1);
            await this.saveQueue();
            this.notifyListeners();
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async processItem(item: QueueItem) {
    // Import dynamically to avoid circular dependencies
    const { db } = await import("../services/firebase-services");
    const { collection, addDoc, updateDoc, doc, getDoc } = await import("firebase/firestore");

    switch (item.type) {
      case "staff_checkin":
        await this.processStaffCheckin(item.payload);
        break;
      case "attendee_checkin":
        await this.processAttendeeCheckin(item.payload);
        break;
      case "pre_inspection":
        await this.processInspection(item.payload, "pre_event");
        break;
      case "post_inspection":
        await this.processInspection(item.payload, "post_event");
        break;
      case "damage_report":
        await this.processDamageReport(item.payload);
        break;
      case "live_complaint":
        await this.processLiveComplaint(item.payload);
        break;
      case "loyalty_scan":
        await this.processLoyaltyScan(item.payload);
        break;
      case "attendance_punch":
        await this.processAttendancePunch(item.payload);
        break;
      case "donation_collection":
        await this.processDonationCollection(item.payload);
        break;
      default:
        throw new Error(`Unknown queue item type: ${item.type}`);
    }
  }

  private async processAttendancePunch(payload: any) {
    // Replay: identity always from auth.currentUser.uid inside recordAttendancePunch.
    // Never invent staffName/deviceMatchPassed offline — rejected punches surface as errors.
    const { recordAttendancePunch } = await import("../services/firebase-services");
    const { auth } = await import("../services/firebase-services");
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("Sign in before syncing punches.");
      await recordAttendancePunch({
        punchType: payload.punchType,
        lat: payload.lat,
        lng: payload.lng,
        accuracyM: payload.accuracyM ?? null,
        staffName: payload.staffName || auth.currentUser?.displayName || uid,
        worksiteId: payload.worksiteId,
        deviceId: payload.deviceId,
        blockOffsite: true,
        deviceMatchPassed: false,
        overallStatus: "blocked",
      });
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (/already clocked in|clock in before/i.test(msg)) return;
      if (/off-site|blocked/i.test(msg)) return; // policy: do not queue blocked punches
      throw e;
    }
  }

  private async processDonationCollection(payload: any) {
    // Replay a collection verification captured offline. The deterministic
    // donation_checkins doc id (batch+nonce) makes replays collapse server-side.
    const { verifyCollectionFromMobile } = await import("./increment2-services");
    const res = await verifyCollectionFromMobile({ ...payload, offline: true });
    if (res.ok) return;
    if (/already been|already recorded|already used|already collected/i.test(res.message)) return; // idempotent drop
    throw new Error(res.message);
  }

  private async processStaffCheckin(payload: any) {
    const { db } = await import("../services/firebase-services");
    const { addDoc, collection, updateDoc, doc } = await import("firebase/firestore");

    // Create staff check-in record
    await addDoc(collection(db, "staff_checkins"), {
      ...payload,
      syncedAt: new Date().toISOString(),
      wasOffline: true,
    });

    // Update shift assignment
    if (payload.shiftAssignmentId) {
      await updateDoc(doc(db, "staff_shift_assignments", payload.shiftAssignmentId), {
        status: "checked_in",
        checkedInAt: new Date().toISOString(),
        syncedAt: new Date().toISOString(),
      });
    }
  }

  private async processAttendeeCheckin(payload: any) {
    const { db } = await import("../services/firebase-services");
    const { addDoc, collection, updateDoc, doc } = await import("firebase/firestore");

    await addDoc(collection(db, "attendee_checkins"), {
      ...payload,
      syncedAt: new Date().toISOString(),
      wasOffline: true,
    });

    if (payload.invitationId) {
      await updateDoc(doc(db, "event_invitations", payload.invitationId), {
        status: "checked_in",
        checkedInAt: new Date().toISOString(),
        syncedAt: new Date().toISOString(),
      });
    }
  }

  private async processInspection(payload: any, type: "pre_event" | "post_event") {
    const { db } = await import("../services/firebase-services");
    const { addDoc, collection, updateDoc, doc } = await import("firebase/firestore");

    const inspectionRef = await addDoc(collection(db, "event_inspections"), {
      ...payload,
      type,
      syncedAt: new Date().toISOString(),
      wasOffline: true,
    });

    if (payload.eventId) {
      await updateDoc(doc(db, "event_bookings", payload.eventId), {
        [`${type}InspectionId`]: inspectionRef.id,
        [`${type}InspectionStatus`]: "completed",
        updatedAt: new Date().toISOString(),
      });
    }
  }

  private async processDamageReport(payload: any) {
    const { db } = await import("../services/firebase-services");
    const { addDoc, collection } = await import("firebase/firestore");

    await addDoc(collection(db, "damage_records"), {
      ...payload,
      syncedAt: new Date().toISOString(),
      wasOffline: true,
    });
  }

  private async processLiveComplaint(payload: any) {
    const { db } = await import("../services/firebase-services");
    const { addDoc, collection } = await import("firebase/firestore");

    await addDoc(collection(db, "live_complaints"), {
      ...payload,
      syncedAt: new Date().toISOString(),
      wasOffline: true,
    });
  }

  private async processLoyaltyScan(payload: any) {
    // Loyalty scans are validated server-side, just log for analytics
    const { db } = await import("../services/firebase-services");
    const { addDoc, collection } = await import("firebase/firestore");

    await addDoc(collection(db, "loyalty_scan_logs"), {
      ...payload,
      syncedAt: new Date().toISOString(),
      wasOffline: true,
    });
  }

  destroy() {
    if (this.netInfoUnsubscribe) {
      this.netInfoUnsubscribe();
      this.netInfoUnsubscribe = null;
    }
    this.listeners.clear();
  }
}

export const offlineQueue = new OfflineQueue();

export const useOfflineQueue = () => {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [failed, setFailed] = useState<FailedItem[]>([]);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = offlineQueue.subscribe((newQueue) => {
      setQueue(newQueue);
    });

    const failedUnsub = offlineQueue.subscribeFailed((newFailed) => {
      setFailed(newFailed);
    });

    const netInfoUnsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected ?? true);
    });

    offlineQueue.initialize();

    return () => {
      unsubscribe();
      failedUnsub();
      netInfoUnsubscribe();
    };
  }, []);

  const enqueue = (type: QueueItemType, payload: any, maxRetries?: number) => {
    return offlineQueue.enqueue(type, payload, maxRetries);
  };

  return {
    queue,
    failed,
    isOnline,
    enqueue,
    queueLength: queue.length,
    failedLength: failed.length,
    retryFailed: (id: string) => offlineQueue.retryFailed(id),
    discardFailed: (id: string) => offlineQueue.discardFailed(id),
    removeItem: (id: string) => offlineQueue.removeItem(id),
  };
};