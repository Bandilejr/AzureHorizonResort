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
  | "room_service";

const STAFF_PERMISSIONS: Record<string, StaffPermission[]> = {
  event_manager: [
    "staff_checkin",
    "pre_inspection",
    "attendee_checkin",
    "post_inspection",
    "damage_resolution",
    "live_complaints",
    "refund_approve",
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
  ],
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

  const hasPermission = (permission: StaffPermission): boolean => {
    if (isAdmin) return true;
    if (!isStaff || !profile?.subRole) return false;

    const permissions = STAFF_PERMISSIONS[profile.subRole] || [];
    return permissions.includes(permission);
  };

  const getPermissions = (): StaffPermission[] => {
    if (isAdmin) return Object.values(STAFF_PERMISSIONS).flat();
    if (!isStaff || !profile?.subRole) return [];
    return STAFF_PERMISSIONS[profile.subRole] || [];
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