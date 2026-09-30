// Central role → home-route resolution (single source; login + staff-login share it).
// Role areas: (admin) administrators · (kitchen) kitchen managers/chefs ·
// (npo) NPO representatives · (staff) general staff · (guest) guests/visitors.

export type RoleArea = 'admin' | 'kitchen' | 'npo' | 'staff' | 'courier' | 'guest';

export interface RoleProfile {
  role?: string | null;
  subRole?: string | null;
  npoId?: string | null;
}

export function roleAreaFor(profile: RoleProfile | null | undefined): RoleArea {
  if (!profile) return 'guest';
  // Role ALWAYS wins over npoId (locked Phase-1 fix: npoId must not hijack staff/admin).
  if (profile.role === 'admin') return 'admin';
  if (profile.role === 'kitchen_manager') return 'kitchen';
  if (profile.role === 'chef') return 'kitchen';
  if (profile.role === 'collector') return 'courier';
  if (profile.role === 'staff') {
    // Phase 1 (§24): collectors get the Courier/Collections home, not the
    // manager-centric Kitchen Operations dashboard.
    if (profile.subRole === 'catering_staff') return 'courier';
    if (profile.subRole === 'kitchen_manager') return 'kitchen';
    return 'staff';
  }
  if (profile.role === 'npo_rep') return 'npo';
  if (profile.role === 'guest') return 'guest';
  // Unmapped legacy role with only npoId → npo (after explicit role checks).
  if (profile.npoId) return 'npo';
  return 'guest';
}

export function homeRouteFor(profile: RoleProfile | null | undefined): string {
  switch (roleAreaFor(profile)) {
    case 'admin': return '/(admin)/dashboard';
    case 'kitchen': return '/(kitchen)/dashboard';
    case 'npo': return '/(npo)/dashboard';
    case 'staff': return '/(staff)/staff-dashboard';
    case 'courier': return '/(courier)/dashboard';
    default: return '/(guest)/guest-portal';
  }
}

export const ROLE_AREA_META: Record<RoleArea, { title: string; subtitle: string }> = {
  admin: { title: 'Admin Dashboard', subtitle: 'FixedFunding administration' },
  kitchen: { title: 'Kitchen Operations', subtitle: 'Donations, roster & attendance' },
  npo: { title: 'My NPO', subtitle: 'Allocations & collections' },
  staff: { title: 'My Work', subtitle: 'Roster, shifts & attendance' },
  courier: { title: 'Courier & Collections', subtitle: 'Today’s pickups, QR passes & scans' },
  guest: { title: 'Guest Portal', subtitle: 'Welcome to Azure Horizon' },
};
