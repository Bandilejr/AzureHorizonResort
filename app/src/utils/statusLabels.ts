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

  // Bookings & stays
  booking_created: 'Booking created',
  booking_checked_in: 'Guest checked in',
  booking_checked_out: 'Guest checked out',
  booking_cancelled: 'Booking cancelled',
  booking_extended: 'Stay extended',
  room_charge_added: 'Charge added to folio',
  checked_in: 'Checked in',
  completed: 'Completed',
  paid: 'Paid',
  paid_in_full: 'Paid in full',
  deposit_paid: 'Deposit paid',
  deposit: 'Deposit',
  none: 'None',
  card_verified: 'Card verified',

  // Hospitality operations
  order_placed: 'Order placed',
  order_claimed: 'Order claimed',
  order_ready: 'Order ready',
  order_picked_up: 'Order picked up',
  order_delivered: 'Order delivered',
  service_request_raised: 'Service request raised',
  service_request_resolved: 'Service request completed',
  preparing: 'Preparing',
  ready: 'Ready',
  picked_up: 'Picked up',
  delivered: 'Delivered',
  in_progress: 'In progress',
  resolved: 'Resolved',

  // Payments & loyalty
  payment_captured: 'Payment captured',
  refund_approved: 'Refund approved',
  refund_declined: 'Refund declined',
  loyalty_points_awarded: 'Loyalty points awarded',
  loyalty_reward_redeemed: 'Reward redeemed',
  voucher_redeemed: 'Voucher redeemed',
  expired_refunded: 'Expired · points released',

  // Damage claims
  damage_reported: 'Damage reported',
  damage_repair_started: 'Repair started',
  damage_resolved: 'Damage resolved',
  damage_invoiced: 'Damage invoiced',
  reported: 'Reported',
  in_repair: 'In repair',
  invoiced: 'Invoiced',

  // Workforce
  leave_requested: 'Leave requested',
  leave_approved: 'Leave approved',
  leave_rejected: 'Leave rejected',
  shift_swap_requested: 'Shift swap requested',
  shift_swap_peer_accepted: 'Swap accepted by colleague',
  shift_swap_peer_declined: 'Swap declined by colleague',
  shift_swap_approved: 'Shift swap approved',
  shift_swap_rejected: 'Shift swap rejected',
  roster_published: 'Roster published',
  open_shift_created: 'Open shift posted',
  open_shift_claimed: 'Open shift claimed',
  attendance_exception_raised: 'Attendance flagged',
  attendance_exception_verified: 'Attendance verified',
  attendance_exception_adjusted: 'Attendance adjusted',

  // Tours & events
  tour_booking_created: 'Tour booking created',
  tour_checked_in: 'Tour attendee checked in',
  tour_booking_cancelled: 'Tour booking cancelled',
  attendee_checked_in: 'Attendee checked in',
  event_payment_applied: 'Event payment applied',
  confirmed: 'Confirmed',
  no_show: 'No show',

  // Guest feedback
  review_moderated: 'Review answered',

  // Public NPO intake
  npo_application_submitted: 'Public application received',
  npo_application_promoted: 'Application promoted',
  npo_application_rejected: 'Application rejected',
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
