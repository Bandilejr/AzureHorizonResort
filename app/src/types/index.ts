// src/types/index.ts

// User Roles (extended for Increment 2: kitchen_manager capability + npo_rep portal + staff)
export type UserRole = 'admin' | 'guest' | 'front_desk' | 'chef' | 'kitchen_manager' | 'npo_rep' | 'staff' | 'waitstaff' | 'delivery' | 'maintenance' | 'housekeeping' | 'tour_guide' | 'spa_staff' | 'event_manager' | null;

// User Interface
export interface User {
  uid: string;
  id: string;
  name: string;
  email?: string;
  role: UserRole;
  roomNumber?: string;
  checkInDate?: string;
  checkOutDate?: string;
  // NEW: Essential for the Visitor vs Resident gatekeeping
  status?: 'visitor' | 'resident' | 'staff'; 
  isAuthenticated?: boolean;
  // Loyalty System
// Add these inside your User interface
  loyaltyPoints?: number;
  loyaltyTier?: 'bronze' | 'silver' | 'gold' | 'platinum';
  heldPoints?: number; // Mobile-compatible: points locked in pending vouchers
}

// Room Types
export interface Room {
  id: string;
  name: string;
  type: 'ocean_view' | 'garden' | 'penthouse' | 'family' | 'beachfront' | 'mountain_view' | 'accessible';
  price: number;
  capacity: number;
  description: string;
  amenities: string[];
  images: string[];
  isAvailable: boolean;
}

// Booking Types
export interface Booking {
  id: string;
  uid?: string; // Firebase UID for auth linkage
  guestId: string;
  guestEmail?: string;  // ← ADD THIS LINE
  guestName: string;
  roomId: string;
  roomName: string;
  roomNumber: string; // Ensure this exists for UI mapping
  checkInDate: string;
  checkOutDate: string;
  numberOfGuests: number;
  specialRequests?: string;
  status: 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled';
  totalAmount: number;
  depositPaid?: number;
  balanceDue?: number; // Amount remaining to be paid
  paymentStatus: 'pending' | 'deposit_paid' | 'paid' | 'refunded' ;
  lastPaidAt?: string; // Timestamp of last bill payment for tracking paid vs unpaid charges
  createdAt: string;
}

// Room Service Request Types
export type RequestType = 'housekeeping' | 'maintenance';
export type RequestStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface RoomServiceRequest {
  id: string;
  guestId: string;
  guestName: string;
  roomNumber: string;
  type: RequestType;
  description: string;
  status: RequestStatus;
  imageUrl?: string;  // Keep as optional string (undefined when not provided)
  priority?: 'low' | 'medium' | 'high'; 
  createdAt: string;
  completedAt?: string;
}

// Restaurant Types
export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: 'appetizers' | 'mains' | 'desserts' | 'beverages';
  image?: string;
  dietary?: string[];
}

export interface TableReservation {
  id: string;
  guestId: string;
  guestName: string;
  date: string;
  time: string;
  partySize: number;
  specialRequests?: string;
  status: 'confirmed' | 'cancelled' | 'completed';
}

export type OrderType = 'dine_in' | 'takeaway' | 'room_delivery';
export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'picked_up' | 'delivered' | 'cancelled';

export interface OrderItem {
  menuItemId?: string; // Optional if adding custom items
  name: string;
  quantity: number;
  price: number;
  specialInstructions?: string;
}

export interface FoodOrder {
  id: string;
  guestId: string;
  guestName: string;
  roomNumber?: string;
  tableNumber?: string;
  orderType: OrderType;
  items: OrderItem[];
  totalAmount: number;
  status: OrderStatus;  // ← This should use OrderStatus type
  assignedTo?: string;
  createdAt: string;
  estimatedReadyTime?: string;
}

// Chat Message Types
export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: 'guest' | 'concierge' | 'system';
  message: string;
  timestamp: string;
  isRead: boolean;
}

// Guide Content Types
export interface GuideSection {
  id: string;
  title: string;
  icon: string;
  content: string;
}

// Incidentals for Check-out
export interface IncidentalCharge {
  id: string;
  description: string;
  amount: number;
  date: string;
}

// ==========================================
// TOUR TYPES
// ==========================================

export interface TourScheduleSlot {
  date: string;        // ISO date string e.g. "2026-04-25"
  time: string;        // e.g. "09:00"
  capacity: number;
  bookedCount: number;
}

export interface TourPricingTier {
  adult: number;
  child: number;       // Under 12
  pensioner: number;   // 60+
}

export interface Tour {
  id: string;
  name: string;
  description: string;
  duration: string;    // e.g. "3 hours"
  locations: string;   // e.g. "Harbour → Whale Rock → Sunset Bay"
  images: string[];
  pricing: TourPricingTier;
  schedules: TourScheduleSlot[];
  isActive: boolean;
  createdAt: string;
}

export interface TourTicket {
  type: 'adult' | 'child' | 'pensioner';
  quantity: number;
  priceEach: number;
}

export type TourBookingStatus = 'confirmed' | 'checked_in' | 'no_show' | 'cancelled';

export interface TourBooking {
  id: string;
  tourId: string;
  tourName: string;
  guestId: string;
  guestName: string;
  date: string;
  time: string;
  tickets: TourTicket[];
  totalAmount: number;
  status: TourBookingStatus;
  bookingReference: string;
  createdAt: string;
}

// ==========================================
// ACTIVITY BOARD (Social Feature)
// ==========================================

export interface ActivityPost {
  id: string;
  guestId: string;
  guestName: string;
  roomNumber?: string;
  message: string;
  likes: number;
  likedBy?: string[]; // Array of guestIds who liked this post
  createdAt: string;
}

// ==========================================
// LOYALTY LOG
// =========================================

// ==========================================
// LOYALTY SYSTEM TYPES
// ==========================================

export interface RewardItem {
  id: string;
  title: string;
  pts: number;
  description?: string;
  category?: string;
  minTier?: string;
  tierRank?: number;
  validityDays: number;
  terms: string;
  howToRedeem: string;
  isActive: boolean;
}

export interface RedemptionVoucher {
  id: string;
  guestId: string;
  userEmail: string;
  userDocId?: string; // users doc id the points are held on (mobile-compatible)
  rewardId: string;
  rewardTitle: string;
  ptsSpent?: number;
  pointsSpent?: number; // mobile-app field alias
  voucherCode: string;
  status: 'active' | 'redeemed' | 'expired' | 'pending' | 'expired_refunded';
  claimed?: boolean; // mobile-app field
  claimedAt?: string;
  claimedByStaff?: string;
  howToRedeem?: string;
  terms?: string;
  createdAt: string;
  expiresAt: string;
  expiresAtMs?: number; // mobile-app field (24h expiry)
}

export interface LoyaltyLogEntry {
  id: string;
  guestId: string;
  points: number;
  reason: string;
  createdAt: string;
}

/**
 * Canonical action names for the append-only activity journal.
 *
 * Instrumented at DECISION points rather than every CRUD touch: the trail is for
 * answering "who decided what, and when", so a status transition that carries
 * consequence is recorded and incidental field edits are not.
 */
export const AUDIT_ACTIONS = {
  // --- NPO partners & public intake ---
  npoUnderReview: 'npo_under_review',
  npoApproved: 'npo_approved',
  npoRejected: 'npo_rejected',
  npoApplicationSubmitted: 'npo_application_submitted',
  npoApplicationPromoted: 'npo_application_promoted',
  npoApplicationRejected: 'npo_application_rejected',

  // --- Food rescue ---
  donationCertified: 'donation_certified',
  donationAllocated: 'donation_allocated',
  donationClaimed: 'donation_claimed',
  collectionScheduled: 'collection_scheduled',
  collectionCompleted: 'collection_completed',
  impactReportGenerated: 'impact_report_generated',

  // --- Bookings & stays ---
  bookingCreated: 'booking_created',
  bookingCheckedIn: 'booking_checked_in',
  bookingCheckedOut: 'booking_checked_out',
  bookingCancelled: 'booking_cancelled',
  bookingExtended: 'booking_extended',
  roomChargeAdded: 'room_charge_added',

  // --- Hospitality operations ---
  orderPlaced: 'order_placed',
  orderClaimed: 'order_claimed',
  orderReady: 'order_ready',
  orderPickedUp: 'order_picked_up',
  orderDelivered: 'order_delivered',
  serviceRequestRaised: 'service_request_raised',
  serviceRequestResolved: 'service_request_resolved',

  // --- Money ---
  paymentCaptured: 'payment_captured',
  refundApproved: 'refund_approved',
  refundDeclined: 'refund_declined',
  loyaltyPointsAwarded: 'loyalty_points_awarded',
  loyaltyRewardRedeemed: 'loyalty_reward_redeemed',
  voucherRedeemed: 'voucher_redeemed',

  // --- Damage claims ---
  damageReported: 'damage_reported',
  damageRepairStarted: 'damage_repair_started',
  damageResolved: 'damage_resolved',
  damageInvoiced: 'damage_invoiced',

  // --- Workforce ---
  leaveRequested: 'leave_requested',
  leaveApproved: 'leave_approved',
  leaveRejected: 'leave_rejected',
  shiftSwapRequested: 'shift_swap_requested',
  shiftSwapPeerAccepted: 'shift_swap_peer_accepted',
  shiftSwapPeerDeclined: 'shift_swap_peer_declined',
  shiftSwapApproved: 'shift_swap_approved',
  shiftSwapRejected: 'shift_swap_rejected',
  rosterPublished: 'roster_published',
  openShiftCreated: 'open_shift_created',
  openShiftClaimed: 'open_shift_claimed',
  attendanceExceptionRaised: 'attendance_exception_raised',
  attendanceExceptionVerified: 'attendance_exception_verified',
  attendanceExceptionAdjusted: 'attendance_exception_adjusted',

  // --- Tours & events ---
  tourBookingCreated: 'tour_booking_created',
  tourCheckedIn: 'tour_checked_in',
  tourBookingCancelled: 'tour_booking_cancelled',
  attendeeCheckedIn: 'attendee_checked_in',
  eventPaymentApplied: 'event_payment_applied',

  // --- Guest feedback ---
  reviewModerated: 'review_moderated',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/**
 * Coarse groupings for the trail UI's section toggle. Every action name belongs
 * to exactly one section, and the mapping is exhaustive by construction:
 * AUDIT_SECTIONS is derived from AUDIT_ACTIONS, so adding an action without
 * classifying it is a type error rather than a silently invisible entry.
 */
export const AUDIT_SECTIONS = {
  npo: 'NPO partners',
  foodRescue: 'Food rescue',
  bookings: 'Bookings & stays',
  hospitality: 'Hospitality operations',
  money: 'Payments & loyalty',
  damage: 'Damage claims',
  workforce: 'Workforce',
  tours: 'Tours & events',
  feedback: 'Guest feedback',
} as const;

/**
 * The section id is the AUDIT_SECTIONS key ('npo'), never its display label
 * ('NPO partners'). Entries persist the id, so that is what the type must be;
 * resolve a label with AUDIT_SECTIONS[section].
 */
export type AuditSection = keyof typeof AUDIT_SECTIONS;

const SECTION_BY_ACTION: Record<AuditAction, AuditSection> = {
  // NPO partners & public intake
  npo_under_review: 'npo',
  npo_approved: 'npo',
  npo_rejected: 'npo',
  npo_application_submitted: 'npo',
  npo_application_promoted: 'npo',
  npo_application_rejected: 'npo',

  // Food rescue
  donation_certified: 'foodRescue',
  donation_allocated: 'foodRescue',
  donation_claimed: 'foodRescue',
  collection_scheduled: 'foodRescue',
  collection_completed: 'foodRescue',
  impact_report_generated: 'foodRescue',

  // Bookings & stays
  booking_created: 'bookings',
  booking_checked_in: 'bookings',
  booking_checked_out: 'bookings',
  booking_cancelled: 'bookings',
  booking_extended: 'bookings',
  room_charge_added: 'bookings',

  // Hospitality operations
  order_placed: 'hospitality',
  order_claimed: 'hospitality',
  order_ready: 'hospitality',
  order_picked_up: 'hospitality',
  order_delivered: 'hospitality',
  service_request_raised: 'hospitality',
  service_request_resolved: 'hospitality',

  // Money
  payment_captured: 'money',
  refund_approved: 'money',
  refund_declined: 'money',
  loyalty_points_awarded: 'money',
  loyalty_reward_redeemed: 'money',
  voucher_redeemed: 'money',

  // Damage claims
  damage_reported: 'damage',
  damage_repair_started: 'damage',
  damage_resolved: 'damage',
  damage_invoiced: 'damage',

  // Workforce
  leave_requested: 'workforce',
  leave_approved: 'workforce',
  leave_rejected: 'workforce',
  shift_swap_requested: 'workforce',
  shift_swap_peer_accepted: 'workforce',
  shift_swap_peer_declined: 'workforce',
  shift_swap_approved: 'workforce',
  shift_swap_rejected: 'workforce',
  roster_published: 'workforce',
  open_shift_created: 'workforce',
  open_shift_claimed: 'workforce',
  attendance_exception_raised: 'workforce',
  attendance_exception_verified: 'workforce',
  attendance_exception_adjusted: 'workforce',

  // Tours & events
  tour_booking_created: 'tours',
  tour_checked_in: 'tours',
  tour_booking_cancelled: 'tours',
  attendee_checked_in: 'tours',
  event_payment_applied: 'tours',

  // Guest feedback
  review_moderated: 'feedback',
};

export function auditSectionFor(action: string): AuditSection | null {
  return SECTION_BY_ACTION[action as AuditAction] ?? null;
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  /** Collection the change landed in, e.g. "npo_partners". */
  entity: string;
  entityId: string | null;
  beforeStatus: string | null;
  afterStatus: string | null;
  /** Pre-rendered, human-readable line shown in the trail UI. */
  summary: string;
  metadata: Record<string, unknown> | null;
  /** Server clock. Authoritative ordering. */
  occurredAt: unknown;
  /** Client clock at write time. Covered by the hash chain. */
  clientAt: string;
  /** Hash of the preceding entry; null for the first entry or a failed lookup. */
  prevHash: string | null;
  /** SHA-256 over prevHash + the canonical entry body. */
  hash: string | null;
}

export interface AuditChainResult {
  ok: boolean;
  checked: number;
  /** Index of the first entry that failed verification, if any. */
  brokenAt: number | null;
  reason: string | null;
}