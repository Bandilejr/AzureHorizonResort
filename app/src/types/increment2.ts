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

// Impact calculation constants — labelled estimates, never magic numbers elsewhere.
export const IMPACT_MEALS_PER_KG = 2.5;
export const IMPACT_CARBON_KG_PER_KG = 2.5;

export interface ImpactReport {
  periodStart: string; periodEnd: string;
  totalDonatedKg: number; totalCollectedKg: number;
  mealsDiverted: number; carbonOffsetKg: number;
  npoCount: number; batchCount: number; completionRate: number;
  byNpo: Array<{ npoId: string; batches: number; kg: number; meals: number }>;
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
