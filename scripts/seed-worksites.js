/**
 * Seed worksite + attendance_config (idempotent). Safe to re-run.
 *   node scripts/seed-worksites.js
 */
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');
const fs = require('fs');

const KEY = process.argv.find((a) => a.endsWith('.json')) ||
  path.join(__dirname, '..', '..', 'hotel-management-system-c3526-firebase-adminsdk-fbsvc-967ea4ceee.json');
if (!fs.existsSync(KEY)) {
  console.error('missing key', KEY);
  process.exit(1);
}
const app = initializeApp({ credential: cert(require(KEY)) });
const db = getFirestore(app);

async function main() {
  await db.collection('worksites').doc('dut_ritson').set({
    id: 'dut_ritson',
    name: 'DUT Ritson Campus',
    lat: -29.8606,
    lng: 30.9803,
    radiusM: 400,
    address: 'Steve Biko Rd, Durban, 4001',
    timezone: 'Africa/Johannesburg',
    maxAccuracyM: 100,
    maxFixAgeMs: 60000,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  await db.collection('settings').doc('attendance_config').set({
    timezone: 'Africa/Johannesburg',
    clockInBeforeMinutes: 15,
    clockInAfterMinutes: 30,
    autoCloseGraceMinutes: 120,
    maxAccuracyM: 100,
    maxFixAgeMs: 60000,
    updatedAt: new Date().toISOString(),
  }, { merge: true });

  console.log('Seeded worksites/dut_ritson and settings/attendance_config');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
