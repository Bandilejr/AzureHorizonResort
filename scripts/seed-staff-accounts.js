/**
 * Seed Staff A (FULL_TIME) and Staff B (PART_TIME) demo accounts if missing.
 * Idempotent. Auth users created only when absent.
 *   node scripts/seed-staff-accounts.js
 */
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const path = require('path');
const fs = require('fs');

const KEY = path.join(__dirname, '..', '..', 'hotel-management-system-c3526-firebase-adminsdk-fbsvc-967ea4ceee.json');
if (!fs.existsSync(KEY)) { console.error('missing key', KEY); process.exit(1); }

const app = initializeApp({ credential: cert(require(KEY)) });
const db = getFirestore(app);
const auth = getAuth(app);

const STAFF = [
  {
    email: 'staffa@azurehorizon.demo',
    password: 'Staff.1234',
    displayName: 'Staff A',
    role: 'staff',
    subRole: 'front_desk',
    employmentType: 'FULL_TIME',
    employeeId: 'EMP-2001',
    department: 'Front Office',
    position: 'Front Desk Officer',
    skills: ['check-in'],
    worksiteId: 'dut_ritson',
    active: true,
  },
  {
    email: 'staffb@azurehorizon.demo',
    password: 'Staff.1234',
    displayName: 'Staff B',
    role: 'staff',
    subRole: 'maintenance',
    employmentType: 'PART_TIME',
    employeeId: 'EMP-2002',
    department: 'Facilities',
    position: 'Maintenance Technician',
    skills: ['repair'],
    worksiteId: 'dut_ritson',
    active: true,
  },
];

async function ensureAuth(email, password, displayName) {
  try {
    const u = await auth.getUserByEmail(email);
    return u.uid;
  } catch {
    const u = await auth.createUser({ email, password, displayName });
    return u.uid;
  }
}

async function main() {
  for (const s of STAFF) {
    const uid = await ensureAuth(s.email, s.password, s.displayName);
    const now = new Date().toISOString();
    const profile = {
      uid,
      email: s.email,
      displayName: s.displayName,
      role: s.role,
      subRole: s.subRole,
      employmentType: s.employmentType,
      employeeId: s.employeeId,
      department: s.department,
      position: s.position,
      skills: s.skills,
      worksiteId: s.worksiteId,
      active: true,
      loyaltyPoints: 500,
      loyaltyTier: 'Silver',
      phoneNumber: '',
      photoURL: '',
      roomNumber: '101',
      status: 'resident',
      preferences: { language: 'en', notifications: true },
      createdAt: now,
      updatedAt: now,
    };
    await db.collection('users').doc(uid).set(profile, { merge: true });
    // Phase 1 identity: seed ONLY the uid-keyed authoritative profile —
    // no new email-keyed duplicate docs (legacy read fallback stays in identity.ts).
    console.log('ensured', s.email, uid, s.employmentType);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
