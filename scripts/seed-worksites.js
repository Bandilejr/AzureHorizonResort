/**
 * Seed the three DUT campus worksites + attendance settings (idempotent).
 *   node scripts/seed-worksites.js
 *
 * Coordinates/radii: smallest OSM circle containing each campus' buildings
 * (+25 m pad) — see CAMPUSES in scripts/seed-demo-data.js for the source ways.
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

const CAMPUSES = [
  { id: 'dut_ml_sultan', name: 'DUT ML Sultan Campus', lat: -29.8496752, lng: 31.0094640, radiusM: 205, address: 'M.L. Sultan Road, Durban, 4001' },
  { id: 'dut_ritson', name: 'DUT Ritson Campus', lat: -29.8510602, lng: 31.0078848, radiusM: 200, address: 'Steve Biko Road, Musgrave, Durban, 4083' },
  { id: 'dut_steve_biko', name: 'DUT Steve Biko Campus', lat: -29.8536620, lng: 31.0064374, radiusM: 355, address: 'Chris Ntuli Road, Berea, Durban, 4083' },
];

async function main() {
  const now = new Date().toISOString();
  for (const c of CAMPUSES) {
    await db.collection('worksites').doc(c.id).set({
      id: c.id,
      name: c.name,
      lat: c.lat,
      lng: c.lng,
      radiusM: c.radiusM,
      address: c.address,
      timezone: 'Africa/Johannesburg',
      maxAccuracyM: 100,
      maxFixAgeMs: 60000,
      active: true,
      updatedAt: now,
    }, { merge: true });
  }

  await db.collection('settings').doc('attendance_config').set({
    timezone: 'Africa/Johannesburg',
    clockInBeforeMinutes: 15,
    clockInAfterMinutes: 30,
    autoCloseGraceMinutes: 120,
    maxAccuracyM: 100,
    maxFixAgeMs: 60000,
    updatedAt: now,
  }, { merge: true });

  // Single-fence fallback — only read when a punch carries no worksiteId.
  const primary = CAMPUSES.find((c) => c.id === 'dut_ritson');
  await db.collection('settings').doc('attendance_geofence').set({
    lat: primary.lat,
    lng: primary.lng,
    radiusM: primary.radiusM,
    label: `${primary.name}, ${primary.address}`,
    updatedAt: now,
  }, { merge: true });

  console.log('Seeded worksites:', CAMPUSES.map((c) => c.id).join(', '));
  console.log('Seeded settings/attendance_config and settings/attendance_geofence');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
