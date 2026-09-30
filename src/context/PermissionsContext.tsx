import React, { createContext, useContext, ReactNode } from "react";
import { useAuth } from "./AuthContext";

export type StaffPermission =
  | "staff_checkin"
  | "pre_inspection"
  | "attendee_checkin"
  | "post_inspection"
  | "damage_resolution"
  | "live_complaints"
  | "refund_approve"
  | "kitchen_orders"
  | "room_service"
  // Increment 2 (UC34–UC45)
  | "npo_verify"
  | "donation_log"
  | "donation_allocate"
  | "donation_schedule"
  | "donation_collect"
  | "impact_report"
  | "leave_approve"
  | "roster_manage"
  | "swap_approve"
  | "attendance_review";

const STAFF_PERMISSIONS: Record<string, StaffPermission[]> = {
  event_manager: [
    "staff_checkin",
    "pre_inspection",
    "attendee_checkin",
    "post_inspection",
    "damage_resolution",
    "live_complaints",
    "refund_approve",
    "roster_manage",
    "swap_approve",
    "leave_approve",
    "attendance_review",
    "impact_report",
  ],
  front_desk: [
    "staff_checkin",
    "attendee_checkin",
    "live_complaints",
  ],
  maintenance: [
    "pre_inspection",
    "post_inspection",
    "damage_resolution",
    "live_complaints",
  ],
  catering_staff: [
    "kitchen_orders",
    "donation_log",
    "donation_collect",
  ],
  // chef: food operations lead (no workforce management — mirrors rules).
  chef: [
    "kitchen_orders",
    "donation_log",
    "donation_allocate",
    "donation_schedule",
    "donation_collect",
  ],
  // kitchen_manager capability: reuse catering_staff chain, no parallel auth
  kitchen_manager: [
    "kitchen_orders",
    "donation_log",
    "donation_allocate",
    "donation_schedule",
    "donation_collect",
    "impact_report",
    "leave_approve",
    "roster_manage",
    "swap_approve",
    "attendance_review",
  ],
  npo_rep: [],
  housekeeping: [
    "room_service",
  ],
  admin: [
    "staff_checkin",
    "pre_inspection",
    "attendee_checkin",
    "post_inspection",
    "damage_resolution",
    "live_complaints",
    "refund_approve",
    "kitchen_orders",
    "room_service",
    "npo_verify",
    "donation_log",
    "donation_allocate",
    "donation_schedule",
    "donation_collect",
    "impact_report",
    "leave_approve",
    "roster_manage",
    "swap_approve",
    "attendance_review",
  ],
};

interface PermissionsContextType {
  hasPermission: (permission: StaffPermission) => boolean;
  getPermissions: () => StaffPermission[];
  isStaff: boolean;
  subRole: string | null;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export const PermissionsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { profile, isAdmin, isStaff } = useAuth();

  // Role-aware resolution (remediation P1-11): role-keyed maps first
  // (kitchen_manager/chef/admin), then subRole maps for general staff.
  // Previously only role=staff+subRole resolved, locking out kitchen_manager.
  const resolvePermissions = (): StaffPermission[] => {
    if (isAdmin) return Object.values(STAFF_PERMISSIONS).flat();
    const role = profile?.role;
    if (role === 'kitchen_manager') return STAFF_PERMISSIONS.kitchen_manager;
    if (role === 'chef') return STAFF_PERMISSIONS.chef;
    if (role === 'npo_rep' || role === 'guest') return [];
    if (!isStaff || !profile?.subRole) return [];
    return STAFF_PERMISSIONS[profile.subRole] || [];
  };

  const hasPermission = (permission: StaffPermission): boolean => {
    return resolvePermissions().includes(permission);
  };

  const getPermissions = (): StaffPermission[] => {
    return resolvePermissions();
  };

  const value: PermissionsContextType = {
    hasPermission,
    getPermissions,
    isStaff: isStaff || false,
    subRole: profile?.subRole || null,
  };

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
};

export const usePermissions = (): PermissionsContextType => {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error("usePermissions must be used within a PermissionsProvider");
  }
  return context;
};