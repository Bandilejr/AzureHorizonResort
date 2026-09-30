/**
 * Firestore security-rules unit tests — LOCAL EMULATOR ONLY.
 * Never connects to production and never uses a service-account key.
 *
 * Run from the repo root (see rules-tests/README.md):
 *   firebase emulators:exec --only firestore --project demo-fixedfunding "npm --prefix rules-tests test"
 *
 * Tests marked [HOLE] assert the SECURE expectation; if they FAIL, the current
 * rules have the gap described.
 */
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');

let env;
const RULES = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-fixedfunding',
    firestore: { host: '127.0.0.1', port: 8080, rules: RULES },
  });
});
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

// Seed with rules disabled.
async function seed(fn) {
  await env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));
}
const asUser = (uid, token = {}) => env.authenticatedContext(uid, { email: token.email || `${uid}@demo`, ...token }).firestore();
const asAnon = () => env.unauthenticatedContext().firestore();

describe('baseline', () => {
  test('signed-out cannot read users', async () => {
    await seed((db) => setDoc(doc(db, 'users/g1'), { role: 'guest' }));
    await assertFails(getDoc(doc(asAnon(), 'users/g1')));
  });
  test('signed-in can read users (broad by design)', async () => {
    await seed((db) => setDoc(doc(db, 'users/g1'), { role: 'guest' }));
    await assertSucceeds(getDoc(doc(asUser('g2'), 'users/g1')));
  });
});

describe('legitimate flows (should be ALLOWED)', () => {
  test('staff files own leave request (pending, self)', async () => {
    await seed((db) => setDoc(doc(db, 'users/s1'), { role: 'staff', subRole: 'front_desk' }));
    await assertSucceeds(setDoc(doc(asUser('s1'), 'leave_requests/l1'), { staffId: 's1', status: 'pending', leaveType: 'Annual' }));
  });
  test('kitchen_manager approves another staff leave', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users/m1'), { role: 'kitchen_manager' });
      await setDoc(doc(db, 'leave_requests/l1'), { staffId: 's1', status: 'pending', leaveType: 'Annual' });
    });
    await assertSucceeds(updateDoc(doc(asUser('m1'), 'leave_requests/l1'), { status: 'approved', reviewedBy: 'm1', reviewedAt: 'x' }));
  });
  test('collector (catering_staff) logs a donation batch', async () => {
    await seed((db) => setDoc(doc(db, 'users/c1'), { role: 'staff', subRole: 'catering_staff' }));
    await assertSucceeds(setDoc(doc(asUser('c1'), 'donation_batches/d1'), {
      createdBy: 'c1', itemName: 'Curry', status: 'safety_verified_unassigned',
      portionCount: 10, estimatedWeightKg: 4, safetyPhotoUrl: 'https://x/y.jpg',
    }));
  });
});

describe('self-approval is blocked (should be DENIED)', () => {
  test('staff cannot approve own leave', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users/s1'), { role: 'staff', subRole: 'front_desk' });
      await setDoc(doc(db, 'leave_requests/l1'), { staffId: 's1', status: 'pending' });
    });
    await assertFails(updateDoc(doc(asUser('s1'), 'leave_requests/l1'), { status: 'approved', reviewedBy: 's1', reviewedAt: 'x' }));
  });
  test('manager cannot verify own attendance exception', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'users/m1'), { role: 'kitchen_manager' });
      await setDoc(doc(db, 'attendance_exceptions/e1'), { staffId: 'm1', reviewStatus: 'exception_review' });
    });
    await assertFails(updateDoc(doc(asUser('m1'), 'attendance_exceptions/e1'), { reviewStatus: 'verified', adjustedBy: 'm1' }));
  });
});

describe('[HOLE] privilege escalation — expected DENIED', () => {
  test('user cannot self-create their profile as admin', async () => {
    await assertFails(setDoc(doc(asUser('attacker'), 'users/attacker'), { role: 'admin', email: 'attacker@demo' }));
  });
  test('user cannot set their own npoId', async () => {
    await seed((db) => setDoc(doc(db, 'users/u1'), { role: 'guest', email: 'u1@demo' }));
    await assertFails(updateDoc(doc(asUser('u1'), 'users/u1'), { npoId: 'npo_victim' }));
  });
  test('guest cannot inflate own loyaltyPoints', async () => {
    await seed((db) => setDoc(doc(db, 'users/g1'), { role: 'guest', email: 'g1@demo', loyaltyPoints: 0 }));
    await assertFails(updateDoc(doc(asUser('g1'), 'users/g1'), { loyaltyPoints: 999999 }));
  });
  test('user cannot mutate another user event booking', async () => {
    await seed((db) => setDoc(doc(db, 'event_bookings/b1'), { guestId: 'victim', status: 'Deposit Paid' }));
    await assertFails(updateDoc(doc(asUser('attacker'), 'event_bookings/b1'), { status: 'Paid In Full', paidAmount: 0 }));
  });
});
