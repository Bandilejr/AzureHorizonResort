import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";

export type QueueItemType =
  | "staff_checkin"
  | "attendee_checkin"
  | "pre_inspection"
  | "post_inspection"
  | "damage_report"
  | "live_complaint"
  | "loyalty_scan";

export interface QueueItem {
  id: string;
  type: QueueItemType;
  payload: any;
  timestamp: number;
  retries: number;
  maxRetries: number;
}

const QUEUE_KEY = "@offline_queue";
const MAX_RETRIES = 5;
const RETRY_DELAY_BASE = 1000; // 1 second

class OfflineQueue {
  private queue: QueueItem[] = [];
  private isProcessing = false;
  private listeners: Set<(queue: QueueItem[]) => void> = new Set();
  private netInfoUnsubscribe: (() => void) | null = null;

  async initialize() {
    await this.loadQueue();
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

  subscribe(listener: (queue: QueueItem[]) => void) {
    this.listeners.add(listener);
    listener([...this.queue]);
    return () => this.listeners.delete(listener);
  }

  async enqueue(type: QueueItemType, payload: any, maxRetries = MAX_RETRIES) {
    const item: QueueItem = {
      id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      payload,
      timestamp: Date.now(),
      retries: 0,
      maxRetries,
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

  async clearQueue() {
    this.queue = [];
    await this.saveQueue();
    this.notifyListeners();
  }

  getQueue(): QueueItem[] {
    return [...this.queue];
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;

    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) return;

    this.isProcessing = true;

    // Process items in order (FIFO)
    while (this.queue.length > 0) {
      const item = this.queue[0];

      try {
        await this.processItem(item);
        // Success - remove from queue
        this.queue.shift();
        await this.saveQueue();
        this.notifyListeners();
      } catch (error) {
        console.error(`Failed to process queue item ${item.id}:`, error);

        item.retries++;
        if (item.retries >= item.maxRetries) {
          // Max retries reached - remove and log
          console.error(`Max retries reached for item ${item.id}, removing from queue`);
          this.queue.shift();
          await this.saveQueue();
          this.notifyListeners();
        } else {
          // Wait before retry with exponential backoff
          const delay = RETRY_DELAY_BASE * Math.pow(2, item.retries - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    this.isProcessing = false;
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
      default:
        throw new Error(`Unknown queue item type: ${item.type}`);
    }
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

// React hook for using offline queue
import { useState, useEffect } from "react";

export const useOfflineQueue = () => {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = offlineQueue.subscribe((newQueue) => {
      setQueue(newQueue);
    });

    const netInfoUnsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected ?? true);
    });

    offlineQueue.initialize();

    return () => {
      unsubscribe();
      netInfoUnsubscribe();
    };
  }, []);

  const enqueue = (type: QueueItemType, payload: any, maxRetries?: number) => {
    return offlineQueue.enqueue(type, payload, maxRetries);
  };

  return {
    queue,
    isOnline,
    enqueue,
    queueLength: queue.length,
  };
};