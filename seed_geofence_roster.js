/**
 * Authenticated seed script — run with: node seed_geofence_roster.js
 * Signs in as staff@azure.com, then seeds the geofence + staff_roster.
 */

const { initializeApp } = require('firebase/app');
const {
  getFirestore,
  doc,
  setDoc,
  collection,
  getDocs,
} = require('firebase/firestore');
const {
  getAuth,
  signInWithEmailAndPassword,
} = require('firebase/auth');

const firebaseConfig = {
  apiKey: "AIzaSyBRt04Rm3Ry9nW_DlTm3TsR8bCzkPvxvSA",
  authDomain: "hotel-management-system-c3526.firebaseapp.com",
  projectId: "hotel-management-system-c3526",
  storageBucket: "hotel-management-system-c3526.firebasestorage.app",
  messagingSenderId: "7196606684",
  appId: "1:7196606684:web:66cb6e026807b517f17419",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// DUT Ritson Campus, Steve Biko Rd, Durban, 4001
const DUT_RITSON = { lat: -29.8606, lng: 30.9803, radiusM: 400 };

const STAFF_ROSTER = [
  { name: 'Sipho Dlamini',      role: 'Events Coordinator',              subRole: 'event_ops',         id: 'staff_001' },
  { name: 'Ayanda Mthembu',     role: 'Front Desk Officer',              subRole: 'staff_checkin',     id: 'staff_002' },
  { name: 'Thabo Nkosi',        role: 'Venue Inspector',                  subRole: 'pre_inspection',    id: 'staff_003' },
  { name: 'Nomvula Zulu',       role: 'Guest Relations',                  subRole: 'live_complaints',   id: 'staff_004' },
  { name: 'Lungelo Mthethwa',   role: 'Damage Resolution Technician',     subRole: 'damage_resolution', id: 'staff_005' },
  { name: 'Zanele Khumalo',     role: 'Catering Coordinator',             subRole: 'event_ops',         id: 'staff_006' },
  { name: 'Mpho Mokoena',       role: 'Refund & Finance Officer',         subRole: 'refund_approve',    id: 'staff_007' },
  { name: 'Bongani Cele',       role: 'Security & Access Control',        subRole: 'attendee_checkin',  id: 'staff_008' },
];

async function seed() {
  // Sign in as admin (staff account has admin role in users collection)
  console.log('Signing in...');
  await signInWithEmailAndPassword(auth, 'staff@azure.com', 'Staff.1234');
  console.log('Signed in OK');

  // Set DUT Ritson Campus geofence
  console.log('\nSetting DUT Ritson Campus geofence...');
  await setDoc(doc(db, 'settings', 'attendance_geofence'), {
    lat: DUT_RITSON.lat,
    lng: DUT_RITSON.lng,
    radiusM: DUT_RITSON.radiusM,
    label: 'DUT Ritson Campus, Steve Biko Rd, Durban, 4001',
    updatedAt: new Date().toISOString(),
  });
  console.log(`Geofence set: lat=${DUT_RITSON.lat}, lng=${DUT_RITSON.lng}, radius=${DUT_RITSON.radiusM}m`);

  // Seed staff_roster
  console.log('\nSeeding staff_roster...');
  for (const member of STAFF_ROSTER) {
    await setDoc(doc(db, 'staff_roster', member.id), {
      id:       member.id,
      name:     member.name,
      role:     member.role,
      subRole:  member.subRole,
      active:   true,
      createdAt: new Date().toISOString(),
    });
    console.log(`  OK: ${member.name} (${member.role})`);
  }

  console.log('\nSeed complete!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err.code || err.message);
  process.exit(1);
});
