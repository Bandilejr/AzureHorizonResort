// src/components/collections/collection-timeline.tsx
// Shared collection status timeline. Structure derived from courier/delivery
// tracking references (order-tracker, rush33/food-delivery): a vertical status
// history where ONLY reached steps carry a real timestamp. Unreached steps are
// pending and NEVER show an invented/estimated time.
// Visuals come from our tokens + the shared <Timeline> primitive only.
import React from 'react';
import type { DonationBatch } from '@/types/increment2';
import { Timeline, type TimelineItem, type TimelineState } from '@/components/ui/timeline';

function fmt(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export interface CollectionStep {
  label: string;
  time?: string;
  reached: boolean;
}

/** Derive steps from REAL batch fields only. */
export function buildCollectionSteps(b: DonationBatch): CollectionStep[] {
  return [
    { label: 'Safety verified', time: fmt(b.createdAt), reached: b.status !== 'draft' },
    { label: 'Allocated', time: fmt(b.allocatedAt), reached: !!b.allocatedNpoId || !!b.allocatedAt },
    { label: 'Claimed', time: fmt(b.claimedAt), reached: !!b.claimedBy || !!b.claimedAt },
    { label: 'Scheduled · pass issued', time: fmt(b.pickupWindowStart), reached: !!b.pickupWindowStart || !!b.collectionQr },
    { label: 'Scanned', reached: b.qrConsumed === true || b.status === 'collected_completed' },
    { label: 'Collected', time: fmt(b.collectedAt), reached: b.status === 'collected_completed' },
  ];
}

/** Steps → Timeline items; the last reached step is `current`, earlier `done`. */
export function toTimelineItems(steps: CollectionStep[]): TimelineItem[] {
  const currentIndex = steps.reduce((acc, s, i) => (s.reached ? i : acc), -1);
  return steps.map((s, i) => {
    const state: TimelineState = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'pending';
    return { label: s.label, time: s.time, state };
  });
}

export function CollectionTimeline({ batch }: { batch: DonationBatch }) {
  return <Timeline items={toTimelineItems(buildCollectionSteps(batch))} />;
}

export default CollectionTimeline;
