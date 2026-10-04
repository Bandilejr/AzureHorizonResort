/**
 * scripts/seed-demo-data.js — deterministic demo dataset for the mobile app.
 *
 *   node scripts/seed-demo-data.js            # apply (full refresh)
 *   node scripts/seed-demo-data.js --dry-run  # print the plan, write nothing
 *
 * What it does
 *   • Binds the 8 one-tap demo actors (read from EXPO_PUBLIC_DEMO_ACCOUNTS in .env)
 *     to realistic profiles + Firebase Auth uids. Passwords are never changed.
 *   • Seeds connected record chains:
 *       NPO partners → facilities → allocations → claims → collections → impact
 *       staff → availability → leave → rosters → shifts → open shifts → swaps
 *       → attendance exceptions
 *   • Full refresh: replaces the demo docs in the managed collections below
 *     (users / notifications / guest data are never deleted).
 *   • Idempotent: stable doc ids, re-running produces the same state.
 *   • Dates are local (Africa/Johannesburg). Forward-looking records (collections,
 *     open shifts, rosters, leave) are always today-or-later; only historical
 *     records (collected donations, past attendance) carry past dates.
 *
 * Requires the Admin SDK key at ../hotel-management-system-*-adminsdk-*.json
 * (same location as scripts/seed-staff-accounts.js). Run with
 *   NODE_PATH=functions/node_modules node scripts/seed-demo-data.js
 * or rely on the built-in fallback loader below.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---- firebase-admin resolution (it lives in functions/node_modules) ----------
function loadAdmin() {
  try { return { app: require('firebase-admin/app'), fs: require('firebase-admin/firestore'), auth: require('firebase-admin/auth') }; }
  catch {
    const Module = require('module');
    const nm = path.join(__dirname, '..', 'functions', 'node_modules');
    const parts = (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean);
    if (!parts.includes(nm)) {
      process.env.NODE_PATH = parts.length ? `${nm}${path.delimiter}${parts.join(path.delimiter)}` : nm;
      Module._initPaths();
    }
    return { app: require('firebase-admin/app'), fs: require('firebase-admin/firestore'), auth: require('firebase-admin/auth') };
  }
}
const { app: adminApp, fs: adminFs, auth: adminAuth } = loadAdmin();
const { initializeApp, cert } = adminApp;
const { getFirestore, Timestamp, FieldValue } = adminFs;
const { getAuth } = adminAuth;

const DRY = process.argv.includes('--dry-run');
const ROOT = path.join(__dirname, '..');

const KEY = process.env.SEED_KEY
  || path.join(ROOT, '..', 'hotel-management-system-c3526-firebase-adminsdk-fbsvc-967ea4ceee.json');
if (!fs.existsSync(KEY)) { console.error('Admin SDK key not found:', KEY); process.exit(1); }

const app = initializeApp({ credential: cert(require(KEY)) });
const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });
const auth = getAuth(app);

// ---- local date helpers (mirror src/utils/dates.ts) --------------------------
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseLocal = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseLocal(s); d.setDate(d.getDate() + n); return isoOf(d); };
const mondayOf = (d = new Date()) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const sh = (x.getDay() + 6) % 7; x.setDate(x.getDate() - sh); return isoOf(x); };
/** full ISO timestamp from a local calendar date + HH:mm */
const at = (dateStr, hhmm) => new Date(`${dateStr}T${hhmm}:00`).toISOString();
const nowIso = () => new Date().toISOString();

const TODAY = isoOf(new Date());
const WEEK = mondayOf();
const NEXT_WEEK = addDays(WEEK, 7);
const WEEK_AFTER = addDays(WEEK, 14);
const WEEK_3 = addDays(WEEK, 21);
const dayName = (dateStr) => parseLocal(dateStr).toLocaleDateString('en-US', { weekday: 'long' });

// ---- demo actors (from .env) -------------------------------------------------
function readDemoAccounts() {
  const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  const line = env.split(/\r?\n/).find((l) => l.startsWith('EXPO_PUBLIC_DEMO_ACCOUNTS='));
  if (!line) throw new Error('EXPO_PUBLIC_DEMO_ACCOUNTS missing from .env');
  let raw = line.slice('EXPO_PUBLIC_DEMO_ACCOUNTS='.length).trim();
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) raw = raw.slice(1, -1);
  let parsed = JSON.parse(raw);
  if (typeof parsed === 'string') parsed = JSON.parse(parsed);
  const arr = parsed.accounts || parsed.demoAccounts || parsed;
  if (!Array.isArray(arr)) throw new Error('demo accounts JSON is not an array');
  return arr;
}

function readQrSecret() {
  const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  const line = env.split(/\r?\n/).find((l) => l.startsWith('EXPO_PUBLIC_QR_SIGNING_SECRET='));
  if (!line) return null;
  return line.slice('EXPO_PUBLIC_QR_SIGNING_SECRET='.length).trim();
}
const QR_SECRET = readQrSecret();
/** byte-identical to src/services/qr-signing.ts: sha256hex(secret + JSON.stringify(payload)) */
const signPayload = (payload) => crypto.createHash('sha256').update(QR_SECRET + JSON.stringify(payload)).digest('hex');

// label → realistic profile. Roles follow src/utils/role-home.ts.
const PROFILES = {
  'Admin': {
    displayName: 'Naledi Mahlangu', role: 'admin', subRole: 'administration',
    employmentType: 'FULL_TIME', employeeId: 'EMP-1000', department: 'Administration',
    position: 'Resort Systems Administrator', skills: ['administration', 'reporting'],
  },
  'Kitchen Mgr': {
    displayName: 'Zanele Khumalo', role: 'kitchen_manager', subRole: 'kitchen_manager',
    employmentType: 'FULL_TIME', employeeId: 'EMP-1001', department: 'Food & Beverage',
    position: 'Kitchen Operations Manager', skills: ['kitchen_management', 'food_safety', 'roster'],
  },
  'Kitchen Staff': {
    displayName: 'Sibusiso Ndlovu', role: 'chef', subRole: 'catering_staff',
    employmentType: 'FULL_TIME', employeeId: 'EMP-1002', department: 'Food & Beverage',
    position: 'Commis Chef', skills: ['food_prep', 'food_safety'],
  },
  'Staff A': {
    displayName: 'Ayanda Mthembu', role: 'staff', subRole: 'front_desk',
    employmentType: 'FULL_TIME', employeeId: 'EMP-2001', department: 'Front Office',
    position: 'Front Desk Officer', skills: ['check-in', 'guest_relations'],
  },
  'Staff B': {
    displayName: 'Lungelo Mthethwa', role: 'staff', subRole: 'maintenance',
    employmentType: 'PART_TIME', employeeId: 'EMP-2002', department: 'Facilities',
    position: 'Maintenance Technician', skills: ['repair', 'hvac'],
  },
  'Courier': {
    displayName: 'Bongani Cele', role: 'collector', subRole: 'courier',
    employmentType: 'CONTRACT', employeeId: 'EMP-3001', department: 'Logistics',
    position: 'Collection Driver', skills: ['driving', 'cold_chain'],
  },
  'Hotel Staff': {
    displayName: 'Nomvula Zulu', role: 'staff', subRole: 'housekeeping',
    employmentType: 'FULL_TIME', employeeId: 'EMP-2003', department: 'Housekeeping',
    position: 'Housekeeping Supervisor', skills: ['housekeeping', 'supervision'],
  },
  'NPO Rep': {
    displayName: 'Thandeka Naidoo', role: 'npo_rep', subRole: 'npo_rep',
    employmentType: 'FULL_TIME', employeeId: 'EMP-4001', department: 'NPO Programmes',
    position: 'Programme Coordinator', skills: ['community_outreach', 'logistics'],
    npoId: 'npo-dbn-haven', organisationName: 'Durban Haven Trust',
  },
};

const NPO_ID_BY_REP = 'npo-dbn-haven';

async function resolveActors() {
  const accounts = readDemoAccounts();
  const actors = {};
  for (const a of accounts) {
    const label = String(a.label || '');
    const profile = PROFILES[label];
    if (!profile) { console.warn('  ! no profile mapping for demo label:', label); continue; }
    const email = String(a.email || '').trim().toLowerCase();
    let uid;
    try {
      uid = (await auth.getUserByEmail(email)).uid;
    } catch {
      if (DRY) { uid = `dry-${label}`; }
      else {
        const u = await auth.createUser({ email, password: String(a.password || ''), displayName: profile.displayName });
        uid = u.uid;
      }
    }
    actors[label] = { label, email, uid, ...profile, worksiteId: 'dut_ritson' };
  }
  return actors;
}

// ---- dataset builders --------------------------------------------------------
function buildUsers(actors) {
  const out = [];
  for (const a of Object.values(actors)) {
    const base = {
      uid: a.uid, email: a.email, displayName: a.displayName, role: a.role, subRole: a.subRole,
      employmentType: a.employmentType, employeeId: a.employeeId, department: a.department,
      position: a.position, skills: a.skills, worksiteId: a.worksiteId, active: true,
      loyaltyPoints: 0, loyaltyTier: 'bronze', phoneNumber: '', photoURL: '', roomNumber: '',
      status: 'staff', preferences: { language: 'en', notifications: true },
      seedSet: 'azure-demo-v2', updatedAt: nowIso(), createdAt: nowIso(),
    };
    if (a.npoId) { base.npoId = a.npoId; base.organisationName = a.organisationName; }
    out.push({ collection: 'users', id: a.uid, data: base });
    // keep the legacy email-keyed mirror consistent for the login fallback
    out.push({ collection: 'users', id: a.email, data: { ...base, id: a.email } });
  }
  return out;
}

function buildNpos(actors) {
  const rep = actors['NPO Rep'];
  const facility = (id, name, address, capacity, contact) => ({ id, name, address, capacity, contact, active: true });
  return [
    {
      collection: 'npo_partners', id: 'npo-dbn-haven', data: {
        npoId: 'npo-dbn-haven', organisationName: 'Durban Haven Trust',
        registrationNumber: 'NPO-145-820', pboNumber: 'PBO-930051477',
        contactName: rep ? rep.displayName : 'Thandeka Naidoo', email: rep ? rep.email : 'npo.rep@azurehorizon.demo',
        phone: '+27 31 555 0142', serviceAreas: ['eThekwini Central', 'Berea', 'Glenwood'],
        beneficiaryCapacity: 620, transportType: 'Refrigerated van', refrigerationAvailable: true,
        complianceDocuments: [
          { url: 'https://firebasestorage.googleapis.com/v0/b/hotel-management-system-c3526.firebasestorage.app/o/npo-docs%2Fdbn-haven-npo-certificate.pdf', fileName: 'dbn-haven-npo-certificate.pdf', mimeType: 'application/pdf', size: 182400, uploadedAt: nowIso(), uploadedBy: rep ? rep.uid : 'seed' },
          { url: 'https://firebasestorage.googleapis.com/v0/b/hotel-management-system-c3526.firebasestorage.app/o/npo-docs%2Fdbn-haven-pbo.pdf', fileName: 'dbn-haven-pbo.pdf', mimeType: 'application/pdf', size: 96400, uploadedAt: nowIso(), uploadedBy: rep ? rep.uid : 'seed' },
        ],
        facilities: [
          facility('fac-haven-central', 'Durban Haven Community Kitchen', '112 Julius Nyerere St, Durban Central', 350, '+27 31 555 0143'),
          facility('fac-haven-chatsworth', 'Chatsworth Care Centre', '45 Arena Park Dr, Chatsworth', 180, '+27 31 555 0144'),
        ],
        verificationStatus: 'approved', verifiedBy: actors['Admin'] ? actors['Admin'].uid : 'seed', verifiedAt: nowIso(),
        seedSet: 'azure-demo-v2', createdAt: nowIso(), updatedAt: nowIso(),
      },
    },
    {
      collection: 'npo_partners', id: 'npo-phoenix-foodbank', data: {
        npoId: 'npo-phoenix-foodbank', organisationName: 'Phoenix Community Foodbank',
        registrationNumber: 'NPO-092-337', pboNumber: 'PBO-930012088',
        contactName: 'Pravin Reddy', email: 'operations@phoenixfoodbank.co.za', phone: '+27 31 507 2210',
        serviceAreas: ['Phoenix', 'Verulam', 'Tongaat'], beneficiaryCapacity: 940,
        transportType: '1-ton truck', refrigerationAvailable: true,
        complianceDocuments: [
          { url: 'https://firebasestorage.googleapis.com/v0/b/hotel-management-system-c3526.firebasestorage.app/o/npo-docs%2Fphoenix-npo-certificate.pdf', fileName: 'phoenix-npo-certificate.pdf', mimeType: 'application/pdf', size: 154800, uploadedAt: nowIso(), uploadedBy: 'seed' },
        ],
        facilities: [
          facility('fac-phoenix-hub', 'Phoenix Foodbank Hub', '18 Parthenon St, Phoenix', 600, '+27 31 507 2211'),
        ],
        verificationStatus: 'approved', verifiedBy: actors['Admin'] ? actors['Admin'].uid : 'seed', verifiedAt: nowIso(),
        seedSet: 'azure-demo-v2', createdAt: nowIso(), updatedAt: nowIso(),
      },
    },
    {
      collection: 'npo_partners', id: 'npo-umlazi-feeding', data: {
        npoId: 'npo-umlazi-feeding', organisationName: 'Umlazi Feeding Scheme',
        registrationNumber: 'NPO-118-664',
        contactName: 'Sinenhlanhla Ngcobo', email: 'admin@umlazifeeds.org.za', phone: '+27 31 906 7781',
        serviceAreas: ['Umlazi', 'KwaMashu', 'Inanda'], beneficiaryCapacity: 480,
        transportType: 'Bakkie', refrigerationAvailable: false,
        complianceDocuments: [
          { url: 'https://firebasestorage.googleapis.com/v0/b/hotel-management-system-c3526.firebasestorage.app/o/npo-docs%2Fumlazi-npo-certificate.pdf', fileName: 'umlazi-npo-certificate.pdf', mimeType: 'application/pdf', size: 132200, uploadedAt: nowIso(), uploadedBy: 'seed' },
        ],
        facilities: [
          facility('fac-umlazi-hall', 'Umlazi Community Hall', 'Sibusiso Mdakane Rd, Umlazi', 300, '+27 31 906 7782'),
        ],
        verificationStatus: 'approved', verifiedBy: actors['Admin'] ? actors['Admin'].uid : 'seed', verifiedAt: nowIso(),
        seedSet: 'azure-demo-v2', createdAt: nowIso(), updatedAt: nowIso(),
      },
    },
    {
      collection: 'npo_partners', id: 'npo-pinetown-outreach', data: {
        npoId: 'npo-pinetown-outreach', organisationName: 'Pinetown Outreach Network',
        registrationNumber: 'NPO-201-905',
        contactName: 'Megan Pillay', email: 'hello@pinetownoutreach.org.za', phone: '+27 31 701 3344',
        serviceAreas: ['Pinetown', 'Westville', 'New Germany'], beneficiaryCapacity: 260,
        transportType: 'Own vehicle', refrigerationAvailable: false,
        complianceDocuments: [], facilities: [],
        verificationStatus: 'under_review', seedSet: 'azure-demo-v2', createdAt: nowIso(), updatedAt: nowIso(),
      },
    },
  ];
}

function buildAvailability(actors) {
  const out = [];
  const week = (staff, weekStart, slots, unavailable) => out.push({
    collection: 'staff_availability',
    id: `avail-${staff.employeeId}-${weekStart}`,
    data: { staffId: staff.uid, staffName: staff.displayName, weekStart, availability: slots, unavailableDates: unavailable || [], seedSet: 'azure-demo-v2', updatedAt: nowIso() },
  });
  const slot = (day, startTime, endTime) => ({ day, startTime, endTime });
  const monFri = (s, e) => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((d) => slot(d, s, e));

  const a = actors['Staff A'], b = actors['Staff B'], k = actors['Kitchen Staff'];
  if (a) { week(a, WEEK, monFri('07:00', '18:00')); week(a, NEXT_WEEK, monFri('07:00', '18:00')); }
  if (b) { week(b, WEEK, [slot('Tuesday', '07:00', '18:00'), slot('Thursday', '07:00', '18:00')]); week(b, NEXT_WEEK, [slot('Tuesday', '07:00', '18:00'), slot('Thursday', '07:00', '18:00')]); }
  if (k) { week(k, WEEK, monFri('08:00', '20:00')); week(k, NEXT_WEEK, monFri('08:00', '20:00')); }
  return out;
}

function buildLeave(actors) {
  const out = [];
  const push = (id, staff, leaveType, startDate, endDate, status, extra = {}) => {
    if (!staff) return;
    out.push({
      collection: 'leave_requests', id, data: {
        staffId: staff.uid, staffName: staff.displayName, leaveType, startDate, endDate,
        supportingDocuments: [], status, submittedAt: nowIso(), seedSet: 'azure-demo-v2', ...extra,
      },
    });
  };
  const admin = actors['Admin'], mgr = actors['Kitchen Mgr'];
  push('leave-1001', actors['Staff A'], 'Annual leave', addDays(WEEK_AFTER, 0), addDays(WEEK_AFTER, 1), 'approved',
    { reviewedBy: mgr ? mgr.uid : undefined, reviewedAt: nowIso() });
  push('leave-1002', actors['Staff B'], 'Family responsibility', addDays(WEEK_AFTER, 3), addDays(WEEK_AFTER, 4), 'pending');
  push('leave-1003', actors['Kitchen Staff'], 'Annual leave', addDays(NEXT_WEEK, 2), addDays(NEXT_WEEK, 2), 'pending');
  push('leave-1004', actors['Hotel Staff'], 'Sick leave', addDays(NEXT_WEEK, 0), addDays(NEXT_WEEK, 1), 'rejected',
    { reviewedBy: mgr ? mgr.uid : undefined, reviewedAt: nowIso(), rejectionReason: 'Coverage already committed for those dates.' });
  push('leave-1005', actors['Courier'], 'Annual leave', addDays(WEEK_3, 0), addDays(WEEK_3, 4), 'approved',
    { reviewedBy: admin ? admin.uid : undefined, reviewedAt: nowIso() });
  return out;
}

function buildRosters(actors) {
  const out = [];
  const shift = (shiftId, staff, date, startTime, endTime, role, requiredSkill) => ({
    shiftId, staffId: staff.uid, staffName: staff.displayName, date, startTime, endTime, role, requiredSkill,
  });
  const roster = (id, weekStart, department, shifts, published) => out.push({
    collection: 'shift_rosters', id, data: {
      rosterId: `RS-${weekStart}-${department}`.replace(/\s+/g, '').toUpperCase(),
      weekStart, department, shifts,
      validationStatus: published ? 'published' : 'validated',
      validationWarnings: [], published,
      publishedAt: published ? nowIso() : undefined,
      publishedBy: published ? (actors['Kitchen Mgr'] ? actors['Kitchen Mgr'].uid : undefined) : undefined,
      seedSet: 'azure-demo-v2', createdAt: nowIso(), updatedAt: nowIso(),
    },
  });

  const a = actors['Staff A'], b = actors['Staff B'], k = actors['Kitchen Staff'], h = actors['Hotel Staff'];
  const d = (n) => addDays(WEEK, n);

  // Front Office holds Staff A and Hotel Staff — both swaps below live in this
  // one roster doc, which the manager approval transaction requires.
  if (a || h) {
    const shifts = [];
    if (a) [0, 1, 2, 3, 4].forEach((n) => shifts.push(shift(`sh-fo-${n}`, a, d(n), '08:00', '16:00', 'Front Desk Officer', 'check-in')));
    if (h) {
      shifts.push(shift('sh-hk-0', h, d(0), '12:00', '20:00', 'Housekeeping Supervisor', 'supervision'));
      shifts.push(shift('sh-hk-2', h, d(2), '12:00', '20:00', 'Housekeeping Supervisor', 'supervision'));
      shifts.push(shift('sh-hk-4', h, d(4), '12:00', '20:00', 'Housekeeping Supervisor', 'supervision'));
    }
    roster('roster-front-office', WEEK, 'Front Office', shifts, true);
  }

  if (b) roster('roster-facilities', WEEK, 'Facilities', [
    shift('sh-fac-1', b, d(1), '09:00', '17:00', 'Maintenance Technician', 'repair'),
    shift('sh-fac-3', b, d(3), '09:00', '17:00', 'Maintenance Technician', 'repair'),
  ], true);

  if (k) roster('roster-fnb', WEEK, 'Food & Beverage',
    [0, 1, 2, 3, 4].map((n) => shift(`sh-fnb-${n}`, k, d(n), '10:00', '18:00', 'Commis Chef', 'food_prep')), true);

  if (a) roster('roster-front-office-next', NEXT_WEEK, 'Front Office',
    [0, 1, 2, 3].map((n) => shift(`sh-fo-n-${n}`, a, addDays(NEXT_WEEK, n), '08:00', '16:00', 'Front Desk Officer', 'check-in')), false);

  return out;
}

function buildOpenShifts(actors) {
  const out = [];
  const os = (id, department, date, startTime, endTime, role, requiredSkill, urgency, status, extra = {}) => {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    out.push({
      collection: 'open_shifts', id, data: {
        shiftId: `OS-${id.toUpperCase()}`, rosterId: null, department, date, startTime, endTime, role,
        requiredSkill, hours: Math.round((((eh * 60 + em) - (sh * 60 + sm)) / 60) * 10) / 10,
        urgency, status, seedSet: 'azure-demo-v2', createdAt: nowIso(),
        createdBy: actors['Kitchen Mgr'] ? actors['Kitchen Mgr'].uid : 'seed', ...extra,
      },
    });
  };
  os('os-2001', 'Front Office', addDays(TODAY, 1), '14:00', '22:00', 'Front Desk Officer', 'check-in', 'urgent', 'open');
  os('os-2002', 'Food & Beverage', addDays(TODAY, 2), '10:00', '18:00', 'Commis Chef', 'food_prep', 'normal', 'open');
  os('os-2003', 'Facilities', addDays(TODAY, 1), '07:00', '15:00', 'Maintenance Technician', 'repair', 'critical', 'open');
  os('os-2004', 'Housekeeping', addDays(TODAY, 2), '08:00', '16:00', 'Housekeeping Supervisor', 'supervision', 'normal', 'open');
  os('os-2005', 'Front Office', addDays(TODAY, 1), '06:00', '14:00', 'Front Desk Officer', 'check-in', 'normal', 'open');
  os('os-2006', 'Food & Beverage', addDays(TODAY, 2), '12:00', '20:00', 'Commis Chef', 'food_safety', 'urgent', 'filled',
    actors['Staff B'] ? { claimedBy: actors['Staff B'].uid, claimedAt: nowIso() } : {});
  return out;
}

function buildSwaps(actors) {
  const out = [];
  const a = actors['Staff A'], h = actors['Hotel Staff'];
  if (a && h) out.push({
    collection: 'shift_swaps', id: 'swap-3001', data: {
      requesterStaffId: a.uid, requesterShiftId: 'sh-fo-2', targetStaffId: h.uid, targetShiftId: 'sh-hk-2',
      rosterId: 'roster-front-office', status: 'pending_peer', seedSet: 'azure-demo-v2', createdAt: nowIso(), updatedAt: nowIso(),
    },
  });
  if (h && a) out.push({
    collection: 'shift_swaps', id: 'swap-3002', data: {
      requesterStaffId: h.uid, requesterShiftId: 'sh-hk-0', targetStaffId: a.uid, targetShiftId: 'sh-fo-0',
      rosterId: 'roster-front-office', status: 'pending_manager', seedSet: 'azure-demo-v2', createdAt: nowIso(), updatedAt: nowIso(),
    },
  });
  return out;
}

function buildDonations(actors) {
  const out = [];
  const mgr = actors['Kitchen Mgr'], npo = actors['NPO Rep'], courier = actors['Courier'];
  const checklist = (ok = true) => ({
    coreTemperatureVerified: ok, packagingIntegrityVerified: ok, allergenLabelsVerified: ok, safePreparationWindowVerified: ok,
  });
  const photo = (name) => ({
    url: `https://firebasestorage.googleapis.com/v0/b/hotel-management-system-c3526.firebasestorage.app/o/donation-safety%2F${name}.jpg`,
    fileName: `${name}.jpg`, mimeType: 'image/jpeg', size: 245000, uploadedAt: nowIso(), uploadedBy: mgr ? mgr.uid : 'seed',
  });
  const base = (id, batchId, itemName, mealCategory, portions, kg, allergens, prepared, expiry, status) => ({
    collection: 'donation_batches', id, data: {
      batchId, itemName, mealCategory, portionCount: portions, estimatedWeightKg: kg, allergens,
      preparedAt: prepared, expiryAt: expiry, safetyChecklist: checklist(true), safetyPhotoUrl: photo(batchId.toLowerCase()).url,
      photoMeta: photo(batchId.toLowerCase()), status, qrConsumed: false,
      createdBy: mgr ? mgr.uid : 'seed', seedSet: 'azure-demo-v2', createdAt: nowIso(), updatedAt: nowIso(),
    },
  });

  // 1 — awaiting allocation (logged today, expires tomorrow)
  out.push(base('batch-don-001', 'DON-2026-001', 'Chicken a la King', 'Cooked mains', 120, 42.5, ['milk', 'gluten'],
    at(TODAY, '09:15'), at(addDays(TODAY, 1), '09:15'), 'safety_verified_unassigned'));

  // 2 — allocated, awaiting NPO claim
  out.push(base('batch-don-002', 'DON-2026-002', 'Vegetable Lasagne', 'Cooked mains', 90, 34.0, ['milk', 'gluten'],
    at(TODAY, '08:40'), at(addDays(TODAY, 1), '08:40'), 'allocated_awaiting_claim'));
  Object.assign(out[out.length - 1].data, { allocatedNpoId: NPO_ID_BY_REP, allocatedAt: nowIso(), allocatedBy: mgr ? mgr.uid : 'seed' });

  out.push(base('batch-don-003', 'DON-2026-003', 'Beef Stew & Rice', 'Cooked mains', 150, 58.2, [],
    at(TODAY, '07:55'), at(addDays(TODAY, 1), '07:55'), 'allocated_awaiting_claim'));
  Object.assign(out[out.length - 1].data, { allocatedNpoId: 'npo-phoenix-foodbank', allocatedAt: nowIso(), allocatedBy: mgr ? mgr.uid : 'seed' });

  // 3 — claimed, ready to schedule
  out.push(base('batch-don-004', 'DON-2026-004', 'Sandwich Platters', 'Ready to eat', 200, 26.0, ['gluten', 'egg'],
    at(TODAY, '06:30'), at(TODAY, '18:30'), 'claimed_ready_for_scheduling'));
  Object.assign(out[out.length - 1].data, {
    allocatedNpoId: NPO_ID_BY_REP, allocatedAt: nowIso(), allocatedBy: mgr ? mgr.uid : 'seed',
    claimedBy: npo ? npo.uid : 'seed', claimedAt: nowIso(),
    receivingFacility: 'Durban Haven Community Kitchen', distributionTermsAccepted: true,
  });

  // 4 — collection scheduled (future window) with a valid signed pass
  out.push(base('batch-don-005', 'DON-2026-005', 'Fruit & Yoghurt Cups', 'Cold desserts', 180, 22.4, ['milk'],
    at(TODAY, '07:10'), at(addDays(TODAY, 2), '07:10'), 'collection_scheduled'));
  {
    const pickupDate = addDays(TODAY, 2);
    const windowStart = at(pickupDate, '09:00');
    const windowEnd = at(pickupDate, '11:00');
    const nonce = 'seednonce0005';
    const payload = {
      type: 'DONATION_COLLECTION', batchId: 'DON-2026-005', batchDocId: 'batch-don-005', npoId: NPO_ID_BY_REP,
      collectionWindowStart: windowStart, collectionWindowEnd: windowEnd, loadingBay: 'Loading Bay B', issuedAt: Date.now(), nonce,
    };
    const sig = QR_SECRET ? signPayload(payload) : 'unsigned-seed-pass';
    Object.assign(out[out.length - 1].data, {
      allocatedNpoId: NPO_ID_BY_REP, allocatedAt: nowIso(), allocatedBy: mgr ? mgr.uid : 'seed',
      claimedBy: npo ? npo.uid : 'seed', claimedAt: nowIso(), receivingFacility: 'Durban Haven Community Kitchen',
      distributionTermsAccepted: true, pickupDate, pickupWindowStart: windowStart, pickupWindowEnd: windowEnd,
      loadingBay: 'Loading Bay B', courierName: courier ? courier.displayName : 'Bongani Cele',
      collectionQr: JSON.stringify({ ...payload, sig }), collectionNonce: nonce,
    });
  }

  // 5–7 — collected (historical)
  const collected = [
    ['batch-don-006', 'DON-2026-006', 'Roast Chicken Portions', 'Cooked mains', 110, 38.0, [], -3, NPO_ID_BY_REP, 'Durban Haven Community Kitchen'],
    ['batch-don-007', 'DON-2026-007', 'Curry & Rice', 'Cooked mains', 140, 46.5, [], -6, 'npo-phoenix-foodbank', 'Phoenix Foodbank Hub'],
    ['batch-don-008', 'DON-2026-008', 'Assorted Pastries', 'Bakery', 260, 31.2, ['gluten', 'egg'], -9, 'npo-umlazi-feeding', 'Umlazi Community Hall'],
  ];
  const checkins = [];
  for (const [id, batchId, item, cat, portions, kg, allergens, offset, npoId, facility] of collected) {
    const prepDate = addDays(TODAY, offset);
    const pickDate = addDays(TODAY, offset + 1);
    const winStart = at(pickDate, '09:00');
    const winEnd = at(pickDate, '11:00');
    const nonce = `seednonce${batchId.slice(-3)}`;
    const payload = {
      type: 'DONATION_COLLECTION', batchId, batchDocId: id, npoId,
      collectionWindowStart: winStart, collectionWindowEnd: winEnd, loadingBay: 'Loading Bay A', issuedAt: Date.now(), nonce,
    };
    const sig = QR_SECRET ? signPayload(payload) : 'unsigned-seed-pass';
    const data = base(id, batchId, item, cat, portions, kg, allergens, at(prepDate, '08:00'), at(addDays(prepDate, 1), '08:00'), 'collected_completed').data;
    Object.assign(data, {
      allocatedNpoId: npoId, allocatedAt: at(prepDate, '08:30'), allocatedBy: mgr ? mgr.uid : 'seed',
      claimedBy: npoId === NPO_ID_BY_REP && npo ? npo.uid : 'seed', claimedAt: at(prepDate, '09:00'),
      receivingFacility: facility, distributionTermsAccepted: true,
      pickupDate: pickDate, pickupWindowStart: winStart, pickupWindowEnd: winEnd, loadingBay: 'Loading Bay A',
      courierName: courier ? courier.displayName : 'Bongani Cele',
      collectionQr: JSON.stringify({ ...payload, sig }), collectionNonce: nonce, qrConsumed: true,
      collectedAt: at(pickDate, '10:12'), verifiedBy: courier ? courier.uid : 'seed',
    });
    out.push({ collection: 'donation_batches', id, data });
    checkins.push({
      collection: 'donation_checkins', id: `${id}_${nonce}`, data: {
        batchId, npoId, courierName: courier ? courier.displayName : 'Bongani Cele',
        courierId: courier ? courier.uid : undefined, method: 'donation_scan',
        collectionWindow: `${winStart} → ${winEnd}`, loadingBay: 'Loading Bay A',
        sealVerified: true, signature: courier ? courier.displayName : 'Bongani Cele',
        collectedAt: at(pickDate, '10:12'), verifiedBy: courier ? courier.uid : 'seed',
        wasOffline: false, idempotencyKey: `${id}:${nonce}`, seedSet: 'azure-demo-v2',
      },
    });
  }

  // 8 — cancelled
  out.push(base('batch-don-009', 'DON-2026-009', 'Fish Curry', 'Cooked mains', 70, 27.8, ['fish'],
    at(addDays(TODAY, -1), '12:00'), at(TODAY, '12:00'), 'cancelled'));
  Object.assign(out[out.length - 1].data, { lastDecision: { performedBy: mgr ? mgr.uid : 'seed', performedAt: nowIso(), action: 'donation_cancelled', reason: 'Cold-chain break detected on inspection.' } });

  return [...out, ...checkins];
}

function buildAttendanceExceptions(actors) {
  const out = [];
  const mgr = actors['Kitchen Mgr'], a = actors['Staff A'], b = actors['Staff B'], h = actors['Hotel Staff'];
  const push = (id, staff, date, startTime, endTime, exceptionType, reviewStatus, rosterId, shiftId, extra = {}) => {
    if (!staff) return;
    out.push({
      collection: 'attendance_exceptions', id, data: {
        staffId: staff.uid, staffName: staff.displayName, shiftId, rosterId,
        clockInAt: at(date, startTime), clockOutAt: at(date, endTime), hoursWorked: 7.5, scheduledHours: 8,
        exceptionType, reviewStatus, seedSet: 'azure-demo-v2', createdAt: nowIso(), ...extra,
      },
    });
  };
  push('exc-4001', a, addDays(WEEK, 2), '08:22', '16:00', 'late_arrival', 'exception_review', 'roster-front-office', 'sh-fo-2');
  push('exc-4002', b, addDays(WEEK, 1), '09:12', '15:30', 'early_departure', 'exception_review', 'roster-facilities', 'sh-fac-1');
  push('exc-4003', h, addDays(WEEK, 0), '12:00', '20:00', 'outside_geofence', 'verified', 'roster-front-office', 'sh-hk-0',
    { adjustedBy: mgr ? mgr.uid : 'seed', adjustedAt: nowIso(), adjustmentReason: 'GPS drift confirmed — punch accepted on site.', originalValue: JSON.stringify({ reviewStatus: 'exception_review' }), newValue: JSON.stringify({ reviewStatus: 'verified' }) });
  return out;
}

function buildNotifications(actors) {
  const out = [];
  const n = (id, to, type, title, message, referenceId, targetRoute) => {
    if (!to) return;
    out.push({
      collection: 'notifications', id, data: {
        userId: to.uid, type, title, message, referenceId, targetRoute,
        senderId: actors['Admin'] ? actors['Admin'].uid : 'seed', read: false,
        createdAt: Timestamp.fromDate(new Date()), seedSet: 'azure-demo-v2',
      },
    });
  };
  n('notif-5001', actors['NPO Rep'], 'donation_allocated', 'Donation allocated to your organisation', 'A batch is awaiting your claim.', 'batch-don-002', '/(npo)/allocations');
  n('notif-5002', actors['NPO Rep'], 'collection_scheduled', 'Collection scheduled', 'Pickup window set at Loading Bay B.', 'batch-don-005', '/(npo)/collections');
  n('notif-5003', actors['NPO Rep'], 'collection_completed', 'Donation collected', 'Your scheduled donation has been collected and dispatched.', 'batch-don-006', '/(npo)/collections');
  n('notif-5004', actors['Staff A'], 'roster_published', 'Roster published', 'Your week roster is published. Check My Roster.', 'roster-front-office', '/(staff)/my-roster');
  n('notif-5005', actors['Staff B'], 'shift_swap_requested', 'Shift swap requested', 'A colleague wants to swap shifts. Accept or decline.', 'swap-3001', '/(staff)/shift-swaps');
  n('notif-5006', actors['Kitchen Mgr'], 'leave_submitted', 'Leave request submitted', 'Annual leave request awaiting your decision.', 'leave-1003', '/(kitchen)/leave-manage');
  n('notif-5007', actors['Kitchen Mgr'], 'open_shift_claimed', 'Open shift filled', 'A staff member claimed an open shift.', 'os-2006', '/(kitchen)/open-shifts');
  n('notif-5008', actors['Kitchen Mgr'], 'donation_claimed', 'Donation claimed by NPO', 'Batch claimed and ready to schedule collection.', 'batch-don-004', '/(kitchen)/logistics');
  return out;
}

// Three DUT campuses. Each lat/lng/radiusM is the smallest circle that
// contains every building of that campus footprint in OpenStreetMap (plus a
// 25 m standing pad) — so the perimeter hugs the campus and not the roads
// around it. Source ways: ML Sultan way/404322344, Ritson way/712499215,
// Steve Biko way/712499206.
const CAMPUSES = [
  {
    id: 'dut_ml_sultan', name: 'DUT ML Sultan Campus',
    lat: -29.8496752, lng: 31.0094640, radiusM: 205,
    address: 'M.L. Sultan Road, Durban, 4001',
  },
  {
    id: 'dut_ritson', name: 'DUT Ritson Campus',
    lat: -29.8510602, lng: 31.0078848, radiusM: 200,
    address: 'Steve Biko Road, Musgrave, Durban, 4083',
  },
  {
    id: 'dut_steve_biko', name: 'DUT Steve Biko Campus',
    lat: -29.8536620, lng: 31.0064374, radiusM: 355,
    address: 'Chris Ntuli Road, Berea, Durban, 4083',
  },
];

function buildWorksiteAndSettings() {
  const out = [];
  for (const c of CAMPUSES) {
    out.push({
      collection: 'worksites', id: c.id, data: {
        id: c.id, name: c.name, lat: c.lat, lng: c.lng, radiusM: c.radiusM,
        address: c.address, timezone: 'Africa/Johannesburg',
        maxAccuracyM: 100, maxFixAgeMs: 60000, active: true, seedSet: 'azure-demo-v3',
        createdAt: nowIso(), updatedAt: nowIso(),
      },
    });
  }
  out.push(
    {
      collection: 'settings', id: 'attendance_config', data: {
        timezone: 'Africa/Johannesburg', clockInBeforeMinutes: 15, clockInAfterMinutes: 30,
        autoCloseGraceMinutes: 120, maxAccuracyM: 100, maxFixAgeMs: 60000, updatedAt: nowIso(),
      },
    },
    {
      // Single-fence fallback (only read when a punch carries no worksiteId).
      // Points at the default campus so it can never resurrect stale coords.
      collection: 'settings', id: 'attendance_geofence', data: {
        lat: CAMPUSES[1].lat, lng: CAMPUSES[1].lng, radiusM: CAMPUSES[1].radiusM,
        label: `${CAMPUSES[1].name}, ${CAMPUSES[1].address}`, updatedAt: nowIso(),
      },
    },
  );
  return out;
}

// ---- apply -------------------------------------------------------------------
// Collections fully refreshed (all docs replaced). users/notifications are additive.
const MANAGED = [
  'npo_partners', 'donation_batches', 'donation_checkins', 'staff_availability',
  'leave_requests', 'shift_rosters', 'shift_swaps', 'open_shifts', 'attendance_exceptions',
];
// Collections where the seed only upserts its own stable ids (never deletes).
const UPSERT_ONLY = ['users', 'worksites', 'settings', 'notifications'];

async function commit(ops) {
  const chunk = 400;
  for (let i = 0; i < ops.length; i += chunk) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + chunk)) {
      const ref = db.collection(op.collection).doc(op.id);
      if (op.delete) batch.delete(ref); else batch.set(ref, op.data, { merge: true });
    }
    await batch.commit();
  }
}

async function main() {
  console.log(DRY ? '=== DRY RUN (no writes) ===' : '=== APPLYING seed ===');
  console.log('today', TODAY, '| week', WEEK, '| next week', NEXT_WEEK);

  const actors = await resolveActors();
  console.log('actors resolved:', Object.keys(actors).join(', '));
  if (!actors['Kitchen Mgr'] || !actors['NPO Rep'] || !actors['Staff A'] || !actors['Staff B']) {
    throw new Error('Missing required demo actors (Kitchen Mgr / NPO Rep / Staff A / Staff B).');
  }

  const seedDocs = [
    ...buildWorksiteAndSettings(),
    ...buildUsers(actors),
    ...buildNpos(actors),
    ...buildAvailability(actors),
    ...buildLeave(actors),
    ...buildRosters(actors),
    ...buildOpenShifts(actors),
    ...buildSwaps(actors),
    ...buildDonations(actors),
    ...buildAttendanceExceptions(actors),
    ...buildNotifications(actors),
  ];

  // plan deletions for managed collections
  const plan = new Map();
  for (const d of seedDocs) {
    if (!plan.has(d.collection)) plan.set(d.collection, { keep: new Set(), docs: [] });
    plan.get(d.collection).keep.add(d.id);
    plan.get(d.collection).docs.push(d);
  }

  const ops = [];
  for (const col of MANAGED) {
    const snap = await db.collection(col).get();
    const keep = plan.get(col)?.keep || new Set();
    let del = 0;
    snap.docs.forEach((doc) => { if (!keep.has(doc.id)) { ops.push({ collection: col, id: doc.id, delete: true }); del++; } });
    console.log(`  ${col.padEnd(22)} existing ${String(snap.size).padStart(3)} | delete ${String(del).padStart(3)} | upsert ${(plan.get(col)?.docs.length || 0)}`);
  }
  for (const col of UPSERT_ONLY) {
    const n = plan.get(col)?.docs.length || 0;
    console.log(`  ${col.padEnd(22)} upsert ${n} (no deletes)`);
  }
  for (const d of seedDocs) ops.push({ collection: d.collection, id: d.id, data: d.data });

  if (DRY) { console.log(`\nplanned ops: ${ops.length} (${ops.filter((o) => o.delete).length} deletes, ${ops.filter((o) => !o.delete).length} writes)`); process.exit(0); }

  // marker
  ops.push({ collection: 'seed_meta', id: 'demo_v2', data: { seededAt: FieldValue.serverTimestamp(), seedSet: 'azure-demo-v2', today: TODAY, weekStart: WEEK, docCount: seedDocs.length } });

  await commit(ops);
  console.log(`\nDONE — ${ops.length} operations committed.`);
  process.exit(0);
}

main().catch((e) => { console.error('SEED FAILED:', e); process.exit(1); });
