// src/services/identity.ts — Authoritative Firebase Auth UID → users/{uid} identity.
// Never accepts caller-supplied staff name/uid as identity source.

import { auth, db } from '@/services/firebase-services';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import type { EmployeeWorkforceFields, EmploymentType } from '@/types/workforce';

export interface WorkforceIdentity {
  uid: string;
  email: string;
  displayName: string;
  role: string | null;
  subRole: string | null;
  npoId: string | null;
  employeeId: string | null;
  department: string | null;
  employmentType: EmploymentType | null;
  active: boolean;
  position: string | null;
  skills: string[];
  worksiteId: string | null;
  deviceBinding: string | null;
}

function requireAuthUser() {
  const u = auth.currentUser;
  if (!u) throw new Error('You must be signed in to perform this action.');
  return u;
}

function isWorkforceRole(role: string | null | undefined): boolean {
  if (!role) return false;
  if (role === 'guest' || role === 'npo_rep') return false;
  return ['admin', 'staff', 'kitchen_manager', 'chef'].includes(role) || !!role;
}

export async function getWorkforceIdentity(): Promise<WorkforceIdentity> {
  const u = requireAuthUser();
  const snap = await getDoc(doc(db, 'users', u.uid));
  let data: Record<string, unknown> = {};
  if (snap.exists()) {
    data = snap.data() as Record<string, unknown>;
  } else if (u.email) {
    const emailSnap = await getDoc(doc(db, 'users', u.email.trim().toLowerCase()));
    if (emailSnap.exists()) data = emailSnap.data() as Record<string, unknown>;
  }
  const role = (data.role as string) || null;
  const skillsRaw = Array.isArray(data.skills) ? (data.skills as string[]) : [];
  return {
    uid: u.uid,
    email: (data.email as string) || (u.email || '').trim().toLowerCase(),
    displayName:
      (data.displayName as string) ||
      (data.name as string) ||
      (u.displayName || u.email?.split('@')[0] || u.uid),
    role,
    subRole: (data.subRole as string) || null,
    npoId: (data.npoId as string) || null,
    employeeId: (data.employeeId as string) || null,
    department: (data.department as string) || null,
    employmentType: (data.employmentType as EmploymentType) || null,
    active: data.active !== false,
    position: (data.position as string) || null,
    skills: skillsRaw,
    worksiteId: (data.worksiteId as string) || null,
    deviceBinding: (data.deviceBinding as string) || null,
  };
}

export async function requireWorkforceIdentity(): Promise<WorkforceIdentity> {
  const id = await getWorkforceIdentity();
  if (!id.role || !isWorkforceRole(id.role)) {
    throw new Error('Only staff members can clock in/out.');
  }
  if (id.active === false) {
    throw new Error('Your employee account is inactive. Contact your administrator.');
  }
  return id;
}

export async function mergeWorkforceProfile(fields: Partial<EmployeeWorkforceFields>): Promise<void> {
  const u = requireAuthUser();
  await updateDoc(doc(db, 'users', u.uid), { ...fields, updatedAt: new Date().toISOString() }).catch(
    async (e) => {
      if ((e as { code?: string })?.code === 'not-found') {
        await setDoc(
          doc(db, 'users', u.uid),
          { uid: u.uid, email: u.email || '', ...fields, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          { merge: true },
        );
      } else {
        throw e;
      }
    },
  );
}
