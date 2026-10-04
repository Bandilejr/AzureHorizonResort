/**
 * Phase 1 migration DRY-RUN / APPLY for workforce identity backfill.
 * Usage:
 *   node scripts/migrate-workforce.js          # dry-run (default)
 *   node scripts/migrate-workforce.js --apply  # write changes
 *
 * - Idempotent: only fills missing fields; never deletes.
 * - Never overwrites role/employmentType/active if already set.
 * - Assigns worksiteId = 'dut_ritson' when missing.
 * - Generates employeeId EMP-#### when missing.
 * - Does NOT rename notifications userId (deferred by decision #4).
 */
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');
const fs = require('fs');

const APPLY = process.argv.includes('--apply');
const KEY_PATH = process.argv.find((a) => a.endsWith('.json')) ||
  path.join(__dirname, '..', '..', 'hotel-management-system-c3526-firebase-adminsdk-fbsvc-967ea4ceee.json');

if (!fs.existsSync(KEY_PATH)) {
  console.error('Service account not found:', KEY_PATH);
  process.exit(1);
}

const app = initializeApp({ credential: cert(require(KEY_PATH)) });
const db = getFirestore(app);

const DEFAULT_WORKSITE = 'dut_ritson';
const EMPLOYMENT_DEFAULT = {
  admin: 'FULL_TIME',
  staff: 'FULL_TIME',
  kitchen_manager: 'FULL_TIME',
  chef: 'FULL_TIME',
  npo_rep: 'CONTRACT',
};

async function run() {
  console.log(APPLY ? '=== MIGRATE (APPLY) ===' : '=== MIGRATE (DRY-RUN) ===');
  const usersSnap = await db.collection('users').get();
  const writes = [];
  let planned = 0;
  let skipped = 0;
  let empSeq = 1000;

  const existingIds = new Set();
  usersSnap.docs.forEach((d) => {
    const e = d.data().employeeId;
    if (e) existingIds.add(e);
  });

  for (const doc of usersSnap.docs) {
    const data = doc.data();
    const updates = {};
    const isWorkforce = data.role && data.role !== 'guest';
    if (!isWorkforce) { skipped++; continue; }

    if (data.active === undefined) updates.active = true;
    if (data.department === undefined) updates.department = null;
    if (data.position === undefined) updates.position = null;
    if (!Array.isArray(data.skills)) updates.skills = [];
    if (!data.worksiteId) updates.worksiteId = DEFAULT_WORKSITE;
    if (!data.employmentType && EMPLOYMENT_DEFAULT[data.role] != null) {
      updates.employmentType = EMPLOYMENT_DEFAULT[data.role];
    }
    if (!data.employeeId) {
      let id;
      do { id = `EMP-${++empSeq}`; } while (existingIds.has(id));
      existingIds.add(id);
      updates.employeeId = id;
    }

    if (Object.keys(updates).length === 0) { skipped++; continue; }
    updates.updatedAt = new Date().toISOString();
    planned++;
    console.log(APPLY ? '[write]' : '[plan]', doc.id, updates);
    if (APPLY) writes.push(doc.ref.set(updates, { merge: true }));
  }

  // Campus perimeters (fallback creation only — never overwrites existing docs).
  // Radii hug each campus' OSM buildings, not the surrounding roads.
  const CAMPUS_FALLBACKS = [
    { id: 'dut_ml_sultan', name: 'DUT ML Sultan Campus', lat: -29.8496752, lng: 31.0094640, radiusM: 205, address: 'M.L. Sultan Road, Durban, 4001' },
    { id: 'dut_ritson', name: 'DUT Ritson Campus', lat: -29.8510602, lng: 31.0078848, radiusM: 200, address: 'Steve Biko Road, Musgrave, Durban, 4083' },
    { id: 'dut_steve_biko', name: 'DUT Steve Biko Campus', lat: -29.8536620, lng: 31.0064374, radiusM: 355, address: 'Chris Ntuli Road, Berea, Durban, 4083' },
  ];
  for (const c of CAMPUS_FALLBACKS) {
    const wsRef = db.collection('worksites').doc(c.id);
    const ws = await wsRef.get();
    if (ws.exists) continue;
    const wsData = {
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    console.log(APPLY ? '[write]' : '[plan]', 'worksites/' + c.id, wsData);
    if (APPLY) writes.push(wsRef.set(wsData));
    planned++;
  }

  const cfgRef = db.collection('settings').doc('attendance_config');
  const cfg = await cfgRef.get();
  if (!cfg.exists) {
    const cfgData = {
      timezone: 'Africa/Johannesburg',
      clockInBeforeMinutes: 15,
      clockInAfterMinutes: 30,
      autoCloseGraceMinutes: 120,
      maxAccuracyM: 100,
      maxFixAgeMs: 60000,
      updatedAt: new Date().toISOString(),
    };
    console.log(APPLY ? '[write]' : '[plan]', 'settings/attendance_config', cfgData);
    if (APPLY) writes.push(cfgRef.set(cfgData));
    planned++;
  }

  if (APPLY) {
    for (const w of writes) await w;
  }

  console.log(`\nDone. planned=${planned} skipped=${skipped} apply=${APPLY}`);
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
