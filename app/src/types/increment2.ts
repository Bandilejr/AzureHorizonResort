// src/types/increment2.ts — Increment 2 shared domain types.
// D-DRIVE ONLY. Centralized status enums — never scatter raw strings.
// Food Rescue chain: safety_verified_unassigned → allocated_awaiting_claim →
//   claimed_ready_for_scheduling → collection_scheduled → collected_completed
// Leave: pending → approved | rejected
// Swap: pending_peer → peer_accepted → pending_manager → approved | rejected
// Open shift: open → filled | cancelled
// Attendance: clocked_in → clocked_out → exception_review → verified

export type NpoVerificationStatus = 'pending' | 'under_review' | 'approved' | 'rejected';

export type DonationStatus =
  | 'draft'
  | 'safety_verified_unassigned'
  | 'allocated_awaiting_claim'
  | 'claimed_ready_for_scheduling'
  | 'collection_scheduled'
  | 'collected_completed'
  | 'cancelled';

export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export type RosterValidationStatus = 'draft' | 'validated' | 'published';

export type SwapStatus =
  | 'pending_peer'
  | 'peer_accepted'
  | 'pending_manager'
  | 'approved'
  | 'rejected';

export type OpenShiftStatus = 'open' | 'filled' | 'cancelled';

export type AttendanceExceptionType =
  | 'late_arrival'
  | 'early_departure'
  | 'unscheduled_overtime'
  | 'outside_geofence'
  | 'missing_clock_out';

export type AttendanceReviewStatus =
  | 'clocked_in'
  | 'clocked_out'
  | 'exception_review'
  | 'verified';

export interface FileMeta {
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
}

/**
 * Public NPO application, submitted from the unauthenticated /npo-apply page.
 *
 * Deliberately a separate record type from NpoPartner. Public intake is
 * untrusted input from anonymous Firebase sessions, so it lands in its own
 * collection where the security rules can be narrow (create-only, fixed field
 * set, no update) without loosening the rules that govern verified partner
 * records. An admin promotes a reviewed application into `npo_partners`, which
 * reuses the existing admin-gated createNpoApplication path unchanged.
 */
export interface NpoApplication {
  id: string;
  organisationName: string;
  registrationNumber: string;
  pboNumber: string;
  contactName: string;
  email: string;
  phone: string;
  /** Comma-separated on entry; stored as an array. Drives rankNpoPartners. */
  serviceAreas: string[];
  beneficiaryCapacity: number;
  transportType: string;
  refrigerationAvailable: boolean;
  /** How the application reached the resort. */
  source: ApplicationSource;
  /** Anonymous Firebase uid, or null when the session was lost before submit. */
  applicantUid: string | null;
  /** Always 'pending' on create; advanced by the admin promote/reject flow. */
  verificationStatus: NpoVerificationStatus;
  /** Set when an admin promotes this into npo_partners. */
  promotedToNpoId: string | null;
  promotedAt: string | null;
  rejectionReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  /**
   * Manifest of compliance documents attached at submission. Storage holds the
   * bytes under npo_applications/{id}/documents/; this is what the reviewer
   * sees. Empty when the applicant attached nothing, or when every upload
   * failed while the application itself was still created.
   */
  documents: FileMeta[];
}

export type ApplicationSource = 'public_web' | 'admin_walk_in';

export interface AuditDecision {
  performedBy: string;
  performedAt: string;
  action: string;
  reason?: string;
}

export interface NpoPartner {
  id: string;
  npoId: string;
  organisationName: string;
  registrationNumber: string;
  pboNumber?: string;
  contactName: string;
  email: string;
  phone: string;
  serviceAreas: string[];
  beneficiaryCapacity: number;
  transportType: string;
  refrigerationAvailable: boolean;
  complianceDocuments: FileMeta[];
  /**
   * Set when this partner was created by promoting a public application, holding
   * that npo_applications doc id. Makes the intake -> verification handoff
   * traceable in the admin queue; absent for walk-ins recorded directly.
   */
  sourceApplicationId?: string;
  verificationStatus: NpoVerificationStatus;
  rejectionReason?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SafetyChecklist {
  coreTemperatureVerified: boolean;
  packagingIntegrityVerified: boolean;
  allergenLabelsVerified: boolean;
  safePreparationWindowVerified: boolean;
}

export interface DonationBatch {
  id: string;
  batchId: string;
  itemName: string;
  mealCategory: string;
  portionCount: number;
  estimatedWeightKg: number;
  allergens: string[];
  preparedAt: string;
  expiryAt: string;
  safetyChecklist: SafetyChecklist;
  safetyPhotoUrl: string;
  photoMeta?: FileMeta;
  status: DonationStatus;
  // allocation
  allocatedNpoId?: string;
  allocatedAt?: string;
  allocatedBy?: string;
  // claim
  claimedBy?: string;
  claimedAt?: string;
  receivingFacility?: string;
  distributionTermsAccepted?: boolean;
  // scheduling
  pickupDate?: string;
  pickupWindowStart?: string;
  pickupWindowEnd?: string;
  loadingBay?: string;
  courierName?: string;
  collectionQr?: string;
  collectionNonce?: string;
  qrConsumed?: boolean;
  // completion
  collectedAt?: string;
  verifiedBy?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DonationCheckin {
  id: string;
  batchId: string;
  npoId: string;
  courierName: string;
  courierId?: string;
  method: 'donation_scan';
  collectionWindow: string;
  loadingBay: string;
  sealVerified: boolean;
  signature: string;
  collectedAt: string;
  verifiedBy: string;
  wasOffline: boolean;
}

export interface AvailabilitySlot {
  day: string;
  startTime: string;
  endTime: string;
}

export interface StaffAvailability {
  id: string;
  staffId: string;
  staffName?: string;
  weekStart: string;
  availability: AvailabilitySlot[];
  unavailableDates: string[];
  updatedAt: string;
}

export interface LeaveRequest {
  id: string;
  staffId: string;
  staffName?: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  supportingDocuments: FileMeta[];
  status: LeaveStatus;
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

export interface RosterShift {
  shiftId: string;
  staffId: string;
  staffName?: string;
  date: string;
  startTime: string;
  endTime: string;
  role: string;
  requiredSkill?: string;
}

export interface ShiftRoster {
  id: string;
  rosterId: string;
  weekStart: string;
  department: string;
  shifts: RosterShift[];
  validationStatus: RosterValidationStatus;
  validationWarnings?: string[];
  published: boolean;
  publishedAt?: string;
  publishedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftSwap {
  id: string;
  requesterStaffId: string;
  requesterShiftId: string;
  targetStaffId: string;
  targetShiftId: string;
  rosterId: string;
  status: SwapStatus;
  impactNotes?: string[];
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OpenShift {
  id: string;
  shiftId: string;
  rosterId?: string;
  department: string;
  date: string;
  startTime: string;
  endTime: string;
  role: string;
  requiredSkill?: string;
  hours: number;
  premiumRate?: number;
  urgency?: 'normal' | 'urgent' | 'critical';
  status: OpenShiftStatus;
  claimedBy?: string;
  claimedAt?: string;
  createdAt: string;
}

export interface AttendanceException {
  id: string;
  staffId: string;
  staffName?: string;
  shiftId?: string;
  rosterId?: string;
  clockInAt?: string;
  clockOutAt?: string;
  hoursWorked?: number;
  scheduledHours?: number;
  exceptionType: AttendanceExceptionType;
  reviewStatus: AttendanceReviewStatus;
  adjustedBy?: string;
  adjustedAt?: string;
  adjustmentReason?: string;
  originalValue?: string;
  newValue?: string;
  createdAt: string;
}

// ---------- Impact reporting ----------
//
// Two different kinds of number live in the impact report, and they must not be
// confused. The distinction is carried in the field names and in
// ImpactReport.assumptions, which the report and the PDF both print.
//
// MEASURED — read straight from operational records, no assumption applied:
//   weight, batches, portion counts, collection confirmations, seal checks.
//
// MODELLED — a measurement multiplied by an assumed factor:
//   carbon avoided. The app records no CO2e per batch, so this is the one
//   figure that cannot be derived from the data and depends entirely on the
//   emission factor below.
//
// Meals are MEASURED, not modelled. DonationBatch.portionCount is entered by
// the kitchen when the batch is created and safety-verified, so "meals
// provided" sums real portion counts. It used to be kg x IMPACT_MEALS_PER_KG,
// which discarded a recorded number and invented one in its place.

// Fallback meals-per-kg for a legacy batch that predates portionCount, or one
// where the field is missing. Only used when a batch reports no portions.
export const FALLBACK_MEALS_PER_KG = 2.5;

// Emission factor for avoided greenhouse-gas emissions, kg CO2e avoided per kg
// of food rescued.
//
// THIS IS AN ASSUMPTION, NOT A MEASUREMENT, and it is the single largest
// source of uncertainty in the report. It is a single blended figure covering
// food that would otherwise be landfilled or, for some categories, composted;
// it does not vary by mealCategory, transport mode, or whether the food was
// edible surplus versus unavoidable waste.
//
// Before any figure derived from this is published externally, replace it with
// a factor from a cited source and record that source in the comment below.
// Changing this constant changes every historical report's rendered number, so
// past PDFs retain the factor that was in force when they were generated — see
// ImpactReport.assumptions, which is snapshotted per report for that reason.
export const EMISSION_KG_CO2E_PER_KG = 2.5;

/**
 * Emission-factor provenance. Printed in the PDF so a reader can tell what the
 * carbon figure rests on rather than being handed a bare number.
 */
export const EMISSION_FACTOR_PROVENANCE = {
  factor: EMISSION_KG_CO2E_PER_KG,
  unit: 'kg CO2e avoided per kg of food rescued',
  basis: 'Operator-set planning estimate. No external dataset is currently cited.',
  /** False until a sourced factor replaces the placeholder. */
  externallySourced: false,
} as const;

export interface ImpactReport {
  periodStart: string; periodEnd: string;

  // --- Measured ---
  /** Sum of estimatedWeightKg over batches created in the period. */
  totalDonatedKg: number;
  /**
   * Weight covered by an actual collection confirmation, not merely a batch
   * status. See confirmedCollectedKg for the reconciled figure.
   */
  totalCollectedKg: number;
  /** Sum of portionCount over collected batches. Measured, not modelled. */
  mealsDiverted: number;
  npoCount: number; batchCount: number; completionRate: number;
  /** Collection confirmations recorded in the period. */
  confirmedCollections: number;
  /** Weight of batches confirmed collected via a checkin record. */
  confirmedCollectedKg: number;
  /**
   * Weight of batches marked collected_completed but with no matching
   * confirmation. Non-zero means the two records disagree, which for a
   * food-safety audit is the number worth looking at first.
   */
  unverifiedCollectedKg: number;
  /** Collections where the seal was checked. */
  sealVerifiedCollections: number;
  /** Collections scanned offline and reconciled later. */
  offlineScannedCollections: number;
  /** Mean hours from a batch's expiry to its collection confirmation. */
  avgHoursToCollection: number | null;

  // --- Modelled ---
  /** modelled: measured kg x EMISSION_KG_CO2E_PER_KG. */
  carbonOffsetKg: number;

  /** Snapshot of the factors used, so a rendered report stays self-describing. */
  assumptions: {
    emissionKgCo2ePerKg: number;
    emissionFactorBasis: string;
    /** True when any collected batch lacked portionCount and used the fallback. */
    mealsFallbackUsed: boolean;
    /** True when carbon is reported from an unsourced operator-set factor. */
    carbonIsUnsourcedEstimate: boolean;
  };

  byNpo: Array<{
    npoId: string; batches: number; kg: number; meals: number;
    /** Collection confirmations attributed to this NPO. */
    confirmations: number;
  }>;
}

export type Increment2Permission =
  | 'NPO_VERIFY'
  | 'DONATION_LOG'
  | 'DONATION_ALLOCATE'
  | 'DONATION_CLAIM'
  | 'DONATION_SCHEDULE'
  | 'DONATION_COLLECTION'
  | 'IMPACT_REPORT'
  | 'STAFF_AVAILABILITY'
  | 'LEAVE_APPROVAL'
  | 'ROSTER_MANAGEMENT'
  | 'SHIFT_SWAP_APPROVAL'
  | 'OPEN_SHIFT_CLAIM'
  | 'ATTENDANCE'
  | 'ATTENDANCE_EXCEPTION_REVIEW';
