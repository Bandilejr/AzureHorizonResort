// src/types/workforce.ts — Phase 1 workforce foundation (identity, device, worksite, session).

export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CASUAL' | 'CONTRACT';

export type DeviceStatus = 'active' | 'revoked' | 'pending_reset';

export type DeviceResetStatus = 'pending' | 'approved' | 'rejected';

export type AttendanceSessionStatus =
  | 'scheduled'
  | 'clocked_in'
  | 'clocked_out'
  | 'auto_closed'
  | 'cancelled';

export interface Worksite {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  address?: string;
  timezone: string;
  maxAccuracyM: number;
  maxFixAgeMs: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceConfig {
  timezone: string;
  clockInBeforeMinutes: number;
  clockInAfterMinutes: number;
  autoCloseGraceMinutes: number;
  maxAccuracyM: number;
  maxFixAgeMs: number;
}

export const DEFAULT_ATTENDANCE_CONFIG: AttendanceConfig = {
  timezone: 'Africa/Johannesburg',
  clockInBeforeMinutes: 15,
  clockInAfterMinutes: 30,
  autoCloseGraceMinutes: 120,
  maxAccuracyM: 100,
  maxFixAgeMs: 60_000,
};

export interface EmployeeWorkforceFields {
  employeeId: string | null;
  department: string | null;
  employmentType: EmploymentType | null;
  active: boolean;
  position: string | null;
  skills: string[];
  worksiteId: string | null;
  deviceBinding: string | null;
}

export interface DeviceRecord {
  id: string;
  employeeUid: string;
  deviceId: string;
  platform: string;
  model?: string;
  appVersion?: string;
  status: DeviceStatus;
  enrolledAt: string;
  lastSeenAt?: string;
  revokedAt?: string;
  revokedBy?: string;
}

export interface DeviceResetRequest {
  id: string;
  employeeUid: string;
  oldDeviceId: string;
  newDeviceId?: string;
  reason?: string;
  status: DeviceResetStatus;
  requestedAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

export interface GeofenceFix {
  lat: number;
  lng: number;
  accuracyM: number | null;
  ageMs: number;
}

export interface GeofenceResult {
  ok: boolean;
  distanceM: number;
  withinRadius: boolean;
  accuracyOk: boolean;
  ageOk: boolean;
  marginOk: boolean;
  blockedReason?: string;
}

export interface AttendanceSession {
  id: string;
  employeeUid: string;
  employeeId: string | null;
  worksiteId: string;
  shiftDate: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  status: AttendanceSessionStatus;
  clockInAt?: string;
  clockOutAt?: string;
  autoClosedAt?: string;
  clockInDistanceM?: number;
  clockOutDistanceM?: number;
  deviceId?: string;
  deviceMatchPassed?: boolean;
  exceptionTypes: string[];
  lastPunchType?: 'in' | 'out';
  updatedAt: string;
  createdAt: string;
}
