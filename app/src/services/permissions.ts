// src/services/permissions.ts — Increment 2 central permission matrix.
// Extends existing hasRole() pattern. chef → kitchen_manager capability.
// npo_rep is a web-level role for the NPO portal (stored on users doc role).

import type { UserRole } from '@/types';
import type { Increment2Permission } from '@/types/increment2';

export type ExtendedRole = UserRole | 'kitchen_manager' | 'npo_rep' | 'staff';

const MATRIX: Record<string, Increment2Permission[]> = {
  admin: [
    'NPO_VERIFY', 'DONATION_LOG', 'DONATION_ALLOCATE', 'DONATION_CLAIM',
    'DONATION_SCHEDULE', 'DONATION_COLLECTION', 'IMPACT_REPORT',
    'STAFF_AVAILABILITY', 'LEAVE_APPROVAL', 'ROSTER_MANAGEMENT',
    'SHIFT_SWAP_APPROVAL', 'OPEN_SHIFT_CLAIM', 'ATTENDANCE',
    'ATTENDANCE_EXCEPTION_REVIEW',
  ],
  kitchen_manager: [
    'DONATION_LOG', 'DONATION_ALLOCATE', 'DONATION_SCHEDULE',
    'DONATION_COLLECTION', 'IMPACT_REPORT', 'ROSTER_MANAGEMENT',
    'SHIFT_SWAP_APPROVAL', 'LEAVE_APPROVAL', 'ATTENDANCE_EXCEPTION_REVIEW',
  ],
  // chef inherits kitchen_manager capability (no separate auth mechanism)
  chef: [
    'DONATION_LOG', 'DONATION_ALLOCATE', 'DONATION_SCHEDULE',
    'DONATION_COLLECTION', 'IMPACT_REPORT',
  ],
  event_manager: ['ROSTER_MANAGEMENT', 'SHIFT_SWAP_APPROVAL', 'LEAVE_APPROVAL', 'ATTENDANCE_EXCEPTION_REVIEW', 'IMPACT_REPORT'],
  front_desk: ['ATTENDANCE', 'ATTENDANCE_EXCEPTION_REVIEW'],
  npo_rep: ['DONATION_CLAIM', 'STAFF_AVAILABILITY'],
  staff: [
    'DONATION_LOG', 'DONATION_COLLECTION', 'STAFF_AVAILABILITY',
    'OPEN_SHIFT_CLAIM', 'ATTENDANCE',
  ],
  maintenance: ['DONATION_COLLECTION', 'ATTENDANCE'],
  guest: [],
};

export function hasIncrement2Permission(role: ExtendedRole | null | undefined, perm: Increment2Permission): boolean {
  if (!role) return false;
  return (MATRIX[role] || []).includes(perm);
}

export function permissionsFor(role: ExtendedRole | null | undefined): Increment2Permission[] {
  if (!role) return [];
  return MATRIX[role] || [];
}
