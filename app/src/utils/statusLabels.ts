// Central human-readable labels for Increment 2 workflow states.
// Display layers must use formatStatus() — never render raw snake_case enums.

const LABELS: Record<string, string> = {
  // NPO verification
  pending: 'Pending',
  under_review: 'Under review',
  approved: 'Approved',
  rejected: 'Rejected',
  // Donation lifecycle
  draft: 'Draft',
  safety_verified_unassigned: 'Verified · Unassigned',
  allocated_awaiting_claim: 'Awaiting claim',
  claimed_ready_for_scheduling: 'Ready to schedule',
  collection_scheduled: 'Collection scheduled',
  collected_completed: 'Collected',
  cancelled: 'Cancelled',
  // Roster / swaps / shifts
  validated: 'Validated',
  published: 'Published',
  pending_peer: 'Awaiting colleague',
  peer_accepted: 'Accepted by colleague',
  pending_manager: 'Awaiting manager',
  open: 'Open',
  filled: 'Filled',
  // Attendance
  clocked_in: 'Clocked in',
  clocked_out: 'Clocked out',
  exception_review: 'Under review',
  verified: 'Verified',
  late_arrival: 'Late arrival',
  early_departure: 'Early departure',
  unscheduled_overtime: 'Unscheduled overtime',
  outside_geofence: 'Outside geofence',
  missing_clock_out: 'Missing clock-out',
  // Misc
  normal: 'Normal',
  urgent: 'Urgent',
  critical: 'Critical',
  // Activity journal actions
  npo_under_review: 'NPO moved to review',
  npo_approved: 'NPO approved',
  npo_rejected: 'NPO rejected',
  donation_certified: 'Donation certified',
  donation_allocated: 'Donation allocated',
  donation_claimed: 'Donation claimed',
  collection_completed: 'Collection completed',
  impact_report_generated: 'Impact report generated',
  exported: 'Exported',
};

export function formatStatus(status: string | null | undefined): string {
  if (!status) return '—';
  const hit = LABELS[status];
  if (hit) return hit;
  return status
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}
