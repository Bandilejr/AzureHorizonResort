import { db, rtdb } from '../lib/firebase';
import { doc, setDoc, collection, addDoc, getDocs, getDoc, deleteDoc, query, where, updateDoc } from 'firebase/firestore';
import { ref, set } from 'firebase/database';
import { seedTables } from './tableSeedData';
import { signQrPayload } from './qr-signing';
import { writeSeedAuditEntries, type AuditInput } from './audit-services';
import { AUDIT_ACTIONS } from '../types/index';
import type { AuditAction } from '../types/index';

// ==========================================
// ONLINE IMAGE LIBRARY (Unsplash CDN)
// Stored in Firestore/RTDB so both web AND the
// mobile app can render them from anywhere.
// ==========================================
const u = (id: string, w = 1200) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`;

const IMG = {
  oceanSuite: [u('photo-1582719478250-c89cae4dc85b'), u('photo-1566073771259-6a8506099945'), u('photo-1584132967334-10e028bd69f7'), u('photo-1512918728675-ed5a9ecdebfd')],
  gardenSuite: [u('photo-1611892440504-42a792e24d32'), u('photo-1560185893-a55cbc8c57e8'), u('photo-1578683010236-d716f9a3f461')],
  heritageSuite: [u('photo-1590490360182-c33d57733427'), u('photo-1505693416388-ac5ce068fe85'), u('photo-1519710164239-da123dc03ef4')],
  familyVilla: [u('photo-1584622650111-993a426fbf0a'), u('photo-1493809842364-78817add7ffb'), u('photo-1598928506311-c55ded91a20c')],
  penthouse: [u('photo-1512917774080-9991f1c4c750'), u('photo-1520333789090-1afc82db536a'), u('photo-1545324418-cc1a3fa10c00'), u('photo-1600607687939-ce8a6c25118c')],
  ballroom: u('photo-1519167758481-83f550bb49b3'),
  estate: u('photo-1600585154340-be6161a56a0c'),
  vineyard: u('photo-1528823872057-9c018a7a7553'),
  beachPavilion: u('photo-1507525428034-b723cf961d3e'),
  gardenTerrace: u('photo-1416879595882-3373a0480b5b'),
  foodTartare: u('photo-1546069901-ba9599a7e63c'),
  foodOysters: u('photo-1559742811-822873691df8'),
  foodSteak: u('photo-1546964124-0cce460f38ef'),
  foodLobster: u('photo-1615141982883-c7ad0e69fd62'),
  foodRisotto: u('photo-1476124369491-e7addf5db371'),
  foodCake: u('photo-1606313564200-e75d5e30476c'),
  foodCocktail: u('photo-1546171753-97d7676e4602'),
  foodWine: u('photo-1510812431401-41d2bd2722f3'),
};

// Local date helpers (matches web EventBooking's getLocalISODate)
const localISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayStr = localISODate(new Date());
const dayStr = (offset: number) => localISODate(new Date(Date.now() + offset * 86400000));
const isoFor = (day: string, time = '10:00') => `${day}T${time}:00.000Z`;

// QR signing — MUST match the mobile app (firebase-services.ts):
// hex SHA-256 of (secret + JSON.stringify(payload)) with payload key order:
// invitationId, eventId, inviteeEmail, inviteeName, hostId, status, issuedAt
const QR_SIGNING_SECRET = "azure-horizon-demo-signing-secret-2026";
const sha256Hex = async (text: string): Promise<string> => {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
};

export const seedDatabase = async (opts: { silent?: boolean } = {}) => {
  const notify = (msg: string) => {
    if (!opts.silent) alert(msg);
    console.log(msg);
  };
  try {
    notify("Starting database initialization...");

    // ==========================================
    // 0. CLEAN SLATE — remove ALL previously seeded
    // (now stale) event-related data so the fresh
    // seed below always reflects TODAY's dates.
    // ==========================================
    const wipeCollection = async (name: string) => {
      try {
        const snap = await getDocs(collection(db, name));
        for (const d of snap.docs) await deleteDoc(d.ref);
      } catch (err) {
        console.warn(`Wipe ${name} skipped:`, err);
      }
    };
    await Promise.all([
      wipeCollection('event_bookings'),
      wipeCollection('event_invitations'),
      wipeCollection('attendee_checkins'),
      wipeCollection('event_inspections'),
      wipeCollection('damage_records'),
      wipeCollection('refund_requests'),
      wipeCollection('live_complaints'),
      wipeCollection('event_feedback'),
      wipeCollection('invoices'),
      // Increment 2 demo data — wiped + reseeded daily like the rest.
      wipeCollection('npo_partners'),
      wipeCollection('donation_batches'),
      wipeCollection('donation_checkins'),
      wipeCollection('staff_availability'),
      wipeCollection('leave_requests'),
      wipeCollection('shift_rosters'),
      wipeCollection('shift_swaps'),
      wipeCollection('open_shifts'),
      wipeCollection('attendance_exceptions'),
    ]);
    try {
      const eventReviews = await getDocs(query(collection(db, 'reviews'), where('category', '==', 'event')));
      for (const r of eventReviews.docs) await deleteDoc(r.ref);
    } catch (err) {
      console.warn('Wipe event reviews skipped:', err);
    }
    console.log("🧹 Wiped stale event data for a fresh seed");

    // ==========================================
    // 1. STAFF ACCOUNTS (27)
    // ==========================================
    const staffList = [
      { id: 'bandile_maqeda', uid: 'bandile_maqeda', name: "Bandile Maqeda", role: "admin", email: "admin@azurehorizon.com", status: 'staff' },
      { id: 'sarah_jenkins', uid: 'sarah_jenkins', name: "Sarah Jenkins", role: "admin", email: "s.jenkins@azurehorizon.com", status: 'staff' },
      { id: 'pieter_uys', uid: 'pieter_uys', name: "Pieter-Dirk Uys", role: "admin", email: "p.uys@azurehorizon.com", status: 'staff' },
      { id: 'sibusiso_khoza', uid: 'sibusiso_khoza', name: "Chef Sibusiso Khoza", role: "chef", email: "s.khoza@azurehorizon.com", status: 'staff' },
      { id: 'marco_rossi', uid: 'marco_rossi', name: "Chef Marco Rossi", role: "chef", email: "m.rossi@azurehorizon.com", status: 'staff' },
      { id: 'oliver_tambo', uid: 'oliver_tambo', name: "Chef Oliver Tambo", role: "chef", email: "o.tambo@azurehorizon.com", status: 'staff' },
      { id: 'zuki_matola', uid: 'zuki_matola', name: "Chef Zuki Matola", role: "chef", email: "z.matola@azurehorizon.com", status: 'staff' },
      { id: 'gordon_ramsay', uid: 'gordon_ramsay', name: "Chef Gordon Ramsay", role: "chef", email: "g.ramsay@azurehorizon.com", status: 'staff' },
      { id: 'elena_meyer', uid: 'elena_meyer', name: "Elena Meyer", role: "front_desk", email: "e.meyer@azurehorizon.com", status: 'staff' },
      { id: 'lindiwe_buthelezi', uid: 'lindiwe_buthelezi', name: "Lindiwe Buthelezi", role: "front_desk", email: "l.buthelezi@azurehorizon.com", status: 'staff' },
      { id: 'anita_desai', uid: 'anita_desai', name: "Anita Desai", role: "front_desk", email: "a.desai@azurehorizon.com", status: 'staff' },
      { id: 'grace_kelly', uid: 'grace_kelly', name: "Grace Kelly", role: "front_desk", email: "g.kelly@azurehorizon.com", status: 'staff' },
      { id: 'musa_ndlovu', uid: 'musa_ndlovu', name: "Musa Ndlovu", role: "tour_guide", email: "m.ndlovu@azurehorizon.com", status: 'staff' },
      { id: 'david_attenborough', uid: 'david_attenborough', name: "David Attenborough", role: "tour_guide", email: "d.attenborough@azurehorizon.com", status: 'staff' },
      { id: 'lesego_tau', uid: 'lesego_tau', name: "Lesego Tau", role: "tour_guide", email: "l.tau@azurehorizon.com", status: 'staff' },
      { id: 'tanya_smith', uid: 'tanya_smith', name: "Tanya Smith", role: "tour_guide", email: "t.smith@azurehorizon.com", status: 'staff' },
      { id: 'johan_van_wyk', uid: 'johan_van_wyk', name: "Johan van Wyk", role: "spa_staff", email: "j.vanwyk@azurehorizon.com", status: 'staff' },
      { id: 'nomsa_mkhize', uid: 'nomsa_mkhize', name: "Nomsa Mkhize", role: "spa_staff", email: "n.mkhize@azurehorizon.com", status: 'staff' },
      { id: 'claire_foster', uid: 'claire_foster', name: "Claire Foster", role: "spa_staff", email: "c.foster@azurehorizon.com", status: 'staff' },
      { id: 'kabelo_modise', uid: 'kabelo_modise', name: "Kabelo Modise", role: "spa_staff", email: "k.modise@azurehorizon.com", status: 'staff' },
      { id: 'thabo_mbeki', uid: 'thabo_mbeki', name: "Thabo Mbeki", role: "maintenance", email: "t.mbeki@azurehorizon.com", status: 'staff' },
      { id: 'kevin_dupreez', uid: 'kevin_dupreez', name: "Kevin Du Preez", role: "maintenance", email: "k.dupreez@azurehorizon.com", status: 'staff' },
      { id: 'chris_evans', uid: 'chris_evans', name: "Chris Evans", role: "housekeeping", email: "c.evans@azurehorizon.com", status: 'staff' },
      { id: 'frikkie_louw', uid: 'frikkie_louw', name: "Frikkie Louw", role: "housekeeping", email: "f.louw@azurehorizon.com", status: 'staff' },
      { id: 'zanele_moyo', uid: 'zanele_moyo', name: "Zanele Moyo", role: "housekeeping", email: "z.moyo@azurehorizon.com", status: 'staff' },
      { id: 'sipho_dlamini', uid: 'sipho_dlamini', name: "Sipho Dlamini", role: "event_manager", email: "s.dlamini@azurehorizon.com", status: 'staff' },
      { id: 'lerato_molefe', uid: 'lerato_molefe', name: "Lerato Molefe", role: "event_manager", email: "l.molefe@azurehorizon.com", status: 'staff' },
    ];

    for (const staff of staffList) {
      await setDoc(doc(db, 'users', staff.email), staff);
    }
    console.log(`✅ Added ${staffList.length} staff accounts`);

    const additionalStaff = [
      { id: 'kim_kitchen', uid: 'kim_kitchen', name: "Kim Kitchen", displayName: "Kim Kitchen", title: "Kitchen Manager", role: "kitchen_manager", subRole: "kitchen_manager", email: "kim.kitchen@azurehorizon.demo", status: 'staff' },
      { id: 'sam_staff', uid: 'sam_staff', name: "Sam Staff", displayName: "Sam Staff", title: "Catering Staff", role: "staff", subRole: "catering_staff", email: "sam.staff@azurehorizon.demo", status: 'staff' },
      { id: 'joe_staff', uid: 'joe_staff', name: "Joe Staff", displayName: "Joe Staff", title: "Housekeeping", role: "staff", subRole: "housekeeping", email: "joe.staff@azurehorizon.demo", status: 'staff' },
    ];

    for (const staff of additionalStaff) {
      await setDoc(doc(db, 'users', staff.email), staff);
    }
    console.log(`✅ Added ${additionalStaff.length} additional staff accounts`);

    // ==========================================
    // 2. GUEST ACCOUNTS (20)
    // ==========================================
    const guests = [
      { id: 'robert_harrison', uid: 'robert_harrison', name: "Robert Harrison", role: "guest", email: "guest1@example.com", status: 'guest' },
      { id: 'zoe_katsaros', uid: 'zoe_katsaros', name: "Zoe Katsaros", role: "guest", email: "guest2@example.com", status: 'guest' },
      { id: 'amara_okafor', uid: 'amara_okafor', name: "Amara Okafor", role: "guest", email: "guest3@example.com", status: 'guest' },
      { id: 'jacobus_van_der_merwe', uid: 'jacobus_van_der_merwe', name: "Jacobus van der Merwe", role: "guest", email: "guest4@example.com", status: 'guest' },
      { id: 'sanjay_gupta', uid: 'sanjay_gupta', name: "Sanjay Gupta", role: "guest", email: "guest5@example.com", status: 'guest' },
      { id: 'isabella_rossi', uid: 'isabella_rossi', name: "Isabella Rossi", role: "guest", email: "guest6@example.com", status: 'guest' },
      { id: 'emily_blunt', uid: 'emily_blunt', name: "Emily Blunt", role: "guest", email: "guest7@example.com", status: 'guest' },
      { id: 'sarah_johnson', uid: 'sarah_johnson', name: "Sarah Johnson", role: "guest", email: "guest8@example.com", status: 'guest' },
      { id: 'maria_garcia', uid: 'maria_garcia', name: "Maria Garcia", role: "guest", email: "guest9@example.com", status: 'guest' },
      { id: 'david_wilson', uid: 'david_wilson', name: "David Wilson", role: "guest", email: "guest10@example.com", status: 'guest' },
      { id: 'ahmed_khan', uid: 'ahmed_khan', name: "Ahmed Khan", role: "guest", email: "guest11@example.com", status: 'guest' },
      { id: 'linda_thompson', uid: 'linda_thompson', name: "Linda Thompson", role: "guest", email: "guest12@example.com", status: 'guest' },
      { id: 'michael_chen', uid: 'michael_chen', name: "Michael Chen", role: "guest", email: "guest13@example.com", status: 'guest' },
      { id: 'thomas_shelby', uid: 'thomas_shelby', name: "Thomas Shelby", role: "guest", email: "guest14@example.com", status: 'guest' },
      { id: 'james_brown', uid: 'james_brown', name: "James Brown", role: "guest", email: "guest15@example.com", status: 'guest' },
      { id: 'lucy_liu', uid: 'lucy_liu', name: "Lucy Liu", role: "guest", email: "guest16@example.com", status: 'guest' },
      { id: 'william_shakespeare', uid: 'william_shakespeare', name: "William Shakespeare", role: "guest", email: "guest17@example.com", status: 'guest' },
      { id: 'elon_musk', uid: 'elon_musk', name: "Elon Musk", role: "guest", email: "guest18@example.com", status: 'guest' },
      { id: 'oprah_winfrey', uid: 'oprah_winfrey', name: "Oprah Winfrey", role: "guest", email: "guest19@example.com", status: 'guest' },
      { id: 'nelson_mandela', uid: 'nelson_mandela', name: "Nelson Mandela", role: "guest", email: "guest20@example.com", status: 'guest' },
    ];

    for (const g of guests) {
      await setDoc(doc(db, 'users', g.email), g);
    }
    console.log(`✅ Added ${guests.length} guest accounts`);

    // ==========================================
    // 3. ROOMS (200 rooms programmatic, online images)
    // ==========================================
    const rooms = [];
    const baseTypes = [
      { prefix: '1', type: 'ocean_view', name: 'Oceanic Executive Suite', price: 4200, capacity: 2, amenities: ['King Bed', 'Ocean View', 'WiFi', 'Mini Bar', 'Room Service', 'Private Balcony', 'Walk-in Shower'], images: IMG.oceanSuite },
      { prefix: '2', type: 'garden', name: 'Coral Garden Terrace', price: 2800, capacity: 2, amenities: ['Queen Bed', 'Garden View', 'WiFi', 'Patio', 'Outdoor Seating', 'Rain Shower'], images: IMG.gardenSuite },
      { prefix: '3', type: 'family', name: 'Heritage Suite', price: 6200, capacity: 4, amenities: ['King Bed', 'Living Room', 'Dining Area', 'WiFi', 'Fireplace', 'Antique Furnishings'], images: IMG.heritageSuite },
      { prefix: '4', type: 'villa', name: 'Family Villa', price: 6500, capacity: 6, amenities: ['Bunk Beds', 'Kitchenette', 'Play Area', 'Garden Access', 'Kids Club', 'Game Console', 'Crib Available'], images: IMG.familyVilla },
      { prefix: '5', type: 'penthouse', name: 'Skyline Penthouse', price: 9500, capacity: 4, amenities: ['King Bed', 'Private Pool', 'Butler Service', 'Kitchen', '360° View', 'Dining Area', 'Home Theater'], images: IMG.penthouse },
    ];

    for (let floor = 1; floor <= 5; floor++) {
      const typeData = baseTypes[floor - 1];
      for (let r = 1; r <= 40; r++) {
        const roomNum = `${typeData.prefix}${r.toString().padStart(2, '0')}`;
        rooms.push({
          id: roomNum,
          name: `${typeData.name} ${roomNum}`,
          price: typeData.price,
          type: typeData.type,
          isAvailable: true,
          capacity: typeData.capacity,
          description: `Spacious ${typeData.name} on floor ${floor}.`,
          amenities: typeData.amenities,
          images: typeData.images
        });
      }
    }

    for (const room of rooms) {
      await setDoc(doc(db, 'rooms', room.id), room);
    }
    console.log(`✅ Added ${rooms.length} rooms`);

    // ==========================================
    // 4. BOOKINGS (12 generated)
    // ==========================================
    const futureDate = (days: number) => dayStr(days);
    const pastDate = (days: number) => dayStr(-days);

    const bookings = [
      { id: 'BK-1001', guestId: 'robert_harrison', guestName: 'Robert Harrison', status: 'checked_in', roomNumber: '101', roomName: 'Oceanic Executive Suite 101', checkInDate: pastDate(2), checkOutDate: futureDate(2), totalAmount: 16800, numberOfGuests: 2, paymentStatus: 'deposit_paid', depositPaid: 2520, balanceDue: 14280 },
      { id: 'BK-1002', guestId: 'zoe_katsaros', guestName: 'Zoe Katsaros', status: 'checked_in', roomNumber: '204', roomName: 'Coral Garden Terrace 204', checkInDate: pastDate(3), checkOutDate: futureDate(1), totalAmount: 11200, numberOfGuests: 2, paymentStatus: 'deposit_paid', depositPaid: 1680, balanceDue: 9520 },
      { id: 'BK-1003', guestId: 'amara_okafor', guestName: 'Amara Okafor', status: 'checked_in', roomNumber: '302', roomName: 'Heritage Suite 302', checkInDate: pastDate(1), checkOutDate: futureDate(5), totalAmount: 37200, numberOfGuests: 4, paymentStatus: 'paid', depositPaid: 5580, balanceDue: 0, lastPaidAt: new Date().toISOString() },
      { id: 'BK-1004', guestId: 'jacobus_van_der_merwe', guestName: 'Jacobus van der Merwe', status: 'checked_in', roomNumber: '410', roomName: 'Family Villa 410', checkInDate: pastDate(4), checkOutDate: futureDate(3), totalAmount: 45500, numberOfGuests: 6, paymentStatus: 'deposit_paid', depositPaid: 6825, balanceDue: 38675 },
      { id: 'BK-1005', guestId: 'sanjay_gupta', guestName: 'Sanjay Gupta', status: 'checked_in', roomNumber: '501', roomName: 'Skyline Penthouse 501', checkInDate: pastDate(1), checkOutDate: futureDate(7), totalAmount: 76000, numberOfGuests: 4, paymentStatus: 'paid', depositPaid: 11400, balanceDue: 0, lastPaidAt: new Date().toISOString() },
      { id: 'BK-1015', guestId: 'emily_blunt', guestName: 'Emily Blunt', status: 'checked_in', roomNumber: '109', roomName: 'Oceanic Executive Suite 109', checkInDate: pastDate(1), checkOutDate: futureDate(4), totalAmount: 21000, numberOfGuests: 2, paymentStatus: 'paid', depositPaid: 3150, balanceDue: 0, lastPaidAt: new Date().toISOString() },

      { id: 'BK-1006', guestId: 'isabella_rossi', guestName: 'Isabella Rossi', status: 'checked_out', roomNumber: '105', roomName: 'Oceanic Executive Suite 105', checkInDate: pastDate(10), checkOutDate: pastDate(7), totalAmount: 12600, numberOfGuests: 2, paymentStatus: 'paid', depositPaid: 1890, balanceDue: 0, lastPaidAt: pastDate(7) },
      { id: 'BK-1012', guestId: 'linda_thompson', guestName: 'Linda Thompson', status: 'checked_out', roomNumber: '215', roomName: 'Coral Garden Terrace 215', checkInDate: pastDate(20), checkOutDate: pastDate(17), totalAmount: 8400, numberOfGuests: 2, paymentStatus: 'paid', depositPaid: 1260, balanceDue: 0, lastPaidAt: pastDate(17) },

      { id: 'BK-1008', guestId: 'sarah_johnson', guestName: 'Sarah Johnson', status: 'confirmed', roomNumber: '305', roomName: 'Heritage Suite 305', checkInDate: futureDate(3), checkOutDate: futureDate(6), totalAmount: 18600, numberOfGuests: 2, paymentStatus: 'deposit_paid', depositPaid: 2790, balanceDue: 15810 },
      { id: 'BK-1009', guestId: 'maria_garcia', guestName: 'Maria Garcia', status: 'confirmed', roomNumber: '208', roomName: 'Coral Garden Terrace 208', checkInDate: futureDate(5), checkOutDate: futureDate(9), totalAmount: 11200, numberOfGuests: 2, paymentStatus: 'pending', depositPaid: 0, balanceDue: 11200 },
      { id: 'BK-1010', guestId: 'david_wilson', guestName: 'David Wilson', status: 'confirmed', roomNumber: '505', roomName: 'Skyline Penthouse 505', checkInDate: futureDate(7), checkOutDate: futureDate(11), totalAmount: 38000, numberOfGuests: 3, paymentStatus: 'pending', depositPaid: 0, balanceDue: 38000 },
      { id: 'BK-1016', guestId: 'lucy_liu', guestName: 'Lucy Liu', status: 'confirmed', roomNumber: '218', roomName: 'Coral Garden Terrace 218', checkInDate: futureDate(2), checkOutDate: futureDate(5), totalAmount: 8400, numberOfGuests: 2, paymentStatus: 'deposit_paid', depositPaid: 1260, balanceDue: 7140 },
    ];

    for (const b of bookings) {
      await setDoc(doc(db, 'bookings', b.id), b);

      if (b.status === 'checked_in') {
        const roomRef = doc(db, 'rooms', b.roomNumber);
        await setDoc(roomRef, { isAvailable: false }, { merge: true });
      }
    }
    console.log(`✅ Added ${bookings.length} bookings`);

    // ==========================================
    // 4.1 INCIDENTAL CHARGES FOR CHECKED IN
    // ==========================================
    const incidentals = [
      { bookingId: 'BK-1001', guestId: 'robert_harrison', description: 'Spa: Hot Stone Therapy', amount: 1100, date: new Date().toISOString() },
      { bookingId: 'BK-1001', guestId: 'robert_harrison', description: 'Tour: Coastal Whale Watching', amount: 450, date: new Date().toISOString() },
      { bookingId: 'BK-1002', guestId: 'zoe_katsaros', description: 'Room Service: Breakfast', amount: 350, date: new Date().toISOString() },
      { bookingId: 'BK-1004', guestId: 'jacobus_van_der_merwe', description: 'Mini Bar Restock', amount: 1200, date: new Date().toISOString() },
      { bookingId: 'BK-1005', guestId: 'sanjay_gupta', description: 'Private Dining Experience', amount: 4500, date: pastDate(1) },
    ];
    for (const inc of incidentals) {
      await addDoc(collection(db, 'incidental_charges'), inc);
    }
    console.log(`✅ Added ${incidentals.length} incidental charges`);

    // ==========================================
    // 5. SERVICE REQUESTS
    // ==========================================
    const serviceRequests = [
      { id: 'M-01', type: 'maintenance', description: 'AC unit making humming noise in 101', status: 'in_progress', assignedTo: 'Thabo Mbeki', guestName: 'Robert Harrison', roomNumber: '101', createdAt: new Date().toISOString(), priority: 'high' },
      { id: 'M-02', type: 'maintenance', description: 'Leaking tap in bathroom 204', status: 'completed', assignedTo: 'Kevin Du Preez', guestName: 'Zoe Katsaros', roomNumber: '204', createdAt: new Date(Date.now() - 2 * 86400000).toISOString(), priority: 'medium' },
      { id: 'M-03', type: 'housekeeping', description: 'Extra towels and robes requested for 302', status: 'completed', assignedTo: 'Chris Evans', guestName: 'Amara Okafor', roomNumber: '302', createdAt: new Date(Date.now() - 1 * 86400000).toISOString(), priority: 'low' },
      { id: 'M-05', type: 'housekeeping', description: 'Daily turn-down service required for VIP guest', status: 'in_progress', assignedTo: 'Frikkie Louw', guestName: 'Sanjay Gupta', roomNumber: '501', createdAt: new Date().toISOString(), priority: 'high' },
    ];

    for (const req of serviceRequests) {
      await setDoc(doc(db, 'service_requests', req.id), req);
    }
    console.log(`✅ Added ${serviceRequests.length} service requests`);

    // ==========================================
    // 6. RESTAURANT MENU (RTDB, online images)
    // ==========================================
    const menuRef = ref(rtdb, 'menu');
    await set(menuRef, {
      appetizers: [
        { id: 'a1', name: 'Tuna Tartare', price: 145, description: 'Fresh Atlantic tuna with avocado, sesame, and citrus soy dressing.', dietary: ['gluten-free'], image: IMG.foodTartare },
        { id: 'a2', name: 'Oysters Rockefeller', price: 180, description: 'Half dozen fresh oysters baked with spinach, herbs, and breadcrumbs.', dietary: ['contains shellfish'], image: IMG.foodOysters },
      ],
      mains: [
        { id: 'm1', name: 'Wagyu Beef Steak', price: 450, description: '250g A5 Wagyu with truffle mash, asparagus, and red wine reduction.', dietary: ['gluten-free option'], image: IMG.foodSteak },
        { id: 'm2', name: 'Grilled Lobster', price: 580, description: 'Whole lobster split and grilled with garlic herb butter.', dietary: ['contains shellfish'], image: IMG.foodLobster },
        { id: 'm3', name: 'Wild Mushroom Risotto', price: 210, description: 'Creamy Arborio rice with porcini, shiitake, and truffle oil.', dietary: ['vegetarian'], image: IMG.foodRisotto },
      ],
      desserts: [
        { id: 'de1', name: 'Chocolate Fondant', price: 95, description: 'Warm chocolate lava cake with vanilla bean ice cream.', dietary: ['vegetarian'], image: IMG.foodCake },
      ],
      beverages: [
        { id: 'b1', name: 'Signature Cocktail', price: 120, description: 'Azure Horizon Special - gin, elderflower, prosecco, and edible flowers.', image: IMG.foodCocktail },
        { id: 'b2', name: 'Vineyard Reserve Merlot', price: 340, description: 'Single-estate merlot from the Cape Winelands, served by the bottle.', dietary: ['contains alcohol'], image: IMG.foodWine },
      ],
    });
    console.log(`✅ Added restaurant menu`);

    // ==========================================
    // 7. RESTAURANT TABLES
    // ==========================================
    await seedTables();

    // ==========================================
    // 8. SAMPLE TABLE RESERVATIONS
    // ==========================================
    const tableReservations = [
      { guestId: 'robert_harrison', guestName: 'Robert Harrison', date: futureDate(1), time: '19:00', partySize: 2, tableNumber: 5, tableType: 'medium', location: 'Window', status: 'confirmed', specialRequests: 'Anniversary celebration', createdAt: new Date().toISOString() },
      { guestId: 'amara_okafor', guestName: 'Amara Okafor', date: futureDate(2), time: '18:30', partySize: 4, tableNumber: 12, tableType: 'large', location: 'Terrace', status: 'confirmed', specialRequests: 'High chair for toddler', createdAt: new Date().toISOString() },
    ];
    for (const r of tableReservations) {
      await addDoc(collection(db, 'table_reservations'), r);
    }
    console.log(`✅ Added ${tableReservations.length} table reservations`);

    // ==========================================
    // 9. TOURS AND SPA
    // ==========================================
    const spaBookings = [
      {
        id: 'SPA-001',
        guestId: 'robert_harrison', guestName: 'Robert Harrison', treatmentId: 'TREAT-01', treatmentName: 'Hot Stone Massage',
        therapistId: 'nomsa_mkhize', date: futureDate(1), time: '10:00', price: 1100,
        bookingReference: 'SPA-001', status: 'confirmed', paymentMethod: 'room_charge', createdAt: new Date().toISOString()
      }
    ];
    for (const sb of spaBookings) {
      await setDoc(doc(db, 'spa_bookings', sb.id), sb);
    }

    const tourBookings = [
      {
        id: 'TB-001',
        tourId: 'TOUR-001', tourName: 'Coastal Whale Watching',
        guestId: 'robert_harrison', guestName: 'Robert Harrison', date: futureDate(1), time: '08:00',
        tickets: [{ type: 'adult', quantity: 2, priceEach: 350 }],
        totalAmount: 700, status: 'confirmed', bookingReference: 'TB-001', paymentMethod: 'paystack', createdAt: new Date().toISOString()
      }
    ];
    for (const tb of tourBookings) {
      await setDoc(doc(db, 'tour_bookings', tb.id), tb);
    }
    console.log(`✅ Added tours and spa bookings`);

    // ==========================================
    // 10. REVIEWS
    // ==========================================
    const dummyReviews = [
      { guestId: 'guest_001', guestName: 'Thandi Mokoena', category: 'room', rating: 5, comments: 'The Ocean View Suite was absolutely breathtaking! Waking up to the sound of waves every morning made this the best holiday of my life.', createdAt: pastDate(2), helpful: 12 },
      { guestId: 'guest_005', guestName: 'Priya Naidoo', category: 'restaurant', rating: 5, comments: 'Chef Sibusiso\'s seafood platter is out of this world! The fresh line fish with chakalaka butter sauce was a masterpiece.', createdAt: pastDate(1), helpful: 22 },
      { guestId: 'guest_010', guestName: 'Zanele Mthembu', category: 'tour', rating: 5, comments: 'The whale watching tour was a once-in-a-lifetime experience! Our guide was incredibly knowledgeable and we spotted a mother and calf.', createdAt: pastDate(1), helpful: 25 },
      { guestId: 'guest_014', guestName: 'Lerato Maseko', category: 'spa', rating: 5, comments: 'The hot stone massage was pure bliss. Therapist Nomsa has magic hands! The relaxation room with herbal tea afterwards was the perfect way to unwind.', createdAt: pastDate(2), helpful: 20 },
      { guestId: 'robert_harrison', guestName: 'Robert Harrison', category: 'event', rating: 5, comments: 'Our corporate gala at the Grand Ocean Ballroom was flawless. The AV setup, catering and coordination were world class.', createdAt: pastDate(3), helpful: 31 },
    ];
    for (const review of dummyReviews) {
      await addDoc(collection(db, 'reviews'), review);
    }
    console.log(`✅ Added ${dummyReviews.length} guest reviews`);

    // ==========================================
    // 11. FRESH EVENT BOOKINGS (online venue images)
    // Matches EventBooking.tsx shape + statuses the
    // mobile staff app's check-in / inspection filters accept.
    // ==========================================
    const venues = [
      { id: 'v-grand-ballroom', name: 'The Grand Ocean Ballroom', maxCapacity: 400, pricePerDay: 25000, image: IMG.ballroom },
      { id: 'v-ashanti-estate', name: 'Ashanti Estate', maxCapacity: 300, pricePerDay: 32000, image: IMG.estate },
      { id: 'v-klein-vineyards', name: 'Klein Parys Vineyards', maxCapacity: 120, pricePerDay: 18000, image: IMG.vineyard },
      { id: 'v-beach-pavilion', name: 'Sunset Beach Pavilion', maxCapacity: 150, pricePerDay: 15000, image: IMG.beachPavilion },
      { id: 'v-garden-terrace', name: 'Botanical Garden Terrace', maxCapacity: 80, pricePerDay: 9000, image: IMG.gardenTerrace },
    ];

    const eventBookings = [
      {
        id: 'EV-1001',
        guestId: 'robert_harrison', guestName: 'Robert Harrison',
        venueId: 'v-grand-ballroom', venueName: 'The Grand Ocean Ballroom', venueMaxCapacity: 400,
        eventDate: isoFor(todayStr, '18:00'), date: todayStr, eventDateStr: todayStr,
        bookedDates: [todayStr], expectedAttendance: 85,
        eventType: 'Gala Dinner', bookingType: 'hourly', startTime: '18:00', duration: 5,
        totalAmount: 125000, depositRequired: 62500, termsAccepted: true,
        status: 'paid', imageUrl: IMG.ballroom,
        preInspectionStatus: 'completed', inspectionStatus: 'passed',
        createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
      },
      {
        id: 'EV-1002',
        guestId: 'amara_okafor', guestName: 'Amara Okafor',
        venueId: 'v-beach-pavilion', venueName: 'Sunset Beach Pavilion', venueMaxCapacity: 150,
        eventDate: isoFor(todayStr, '14:00'), date: todayStr, eventDateStr: todayStr,
        bookedDates: [todayStr], expectedAttendance: 60,
        eventType: 'Beach Party', bookingType: 'hourly', startTime: '14:00', duration: 6,
        totalAmount: 90000, depositRequired: 45000, termsAccepted: true,
        status: 'confirmed', imageUrl: IMG.beachPavilion,
        createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      },
      {
        id: 'EV-1003',
        guestId: 'sarah_johnson', guestName: 'Sarah Johnson',
        venueId: 'v-ashanti-estate', venueName: 'Ashanti Estate', venueMaxCapacity: 300,
        eventDate: isoFor(dayStr(2), '11:00'), date: dayStr(2), eventDateStr: dayStr(2),
        bookedDates: [dayStr(2)], expectedAttendance: 150,
        eventType: 'Wedding', bookingType: 'daily',
        totalAmount: 128000, depositRequired: 64000, termsAccepted: true,
        status: 'deposit_paid', imageUrl: IMG.estate,
        createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
      },
      {
        id: 'EV-1004',
        guestId: 'zoe_katsaros', guestName: 'Zoe Katsaros',
        venueId: 'v-klein-vineyards', venueName: 'Klein Parys Vineyards', venueMaxCapacity: 120,
        eventDate: isoFor(dayStr(5), '16:00'), date: dayStr(5), eventDateStr: dayStr(5),
        bookedDates: [dayStr(5)], expectedAttendance: 70,
        eventType: 'Wine & Cheese Evening', bookingType: 'hourly', startTime: '16:00', duration: 4,
        totalAmount: 72000, depositRequired: 36000, termsAccepted: true,
        status: 'confirmed', imageUrl: IMG.vineyard,
        createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      },
      {
        id: 'EV-1005',
        guestId: 'jacobus_van_der_merwe', guestName: 'Jacobus van der Merwe',
        venueId: 'v-garden-terrace', venueName: 'Botanical Garden Terrace', venueMaxCapacity: 80,
        eventDate: isoFor(dayStr(9), '13:00'), date: dayStr(9), eventDateStr: dayStr(9),
        bookedDates: [dayStr(9)], expectedAttendance: 45,
        eventType: 'Garden Party', bookingType: 'hourly', startTime: '13:00', duration: 5,
        totalAmount: 45000, depositRequired: 22500, termsAccepted: true,
        status: 'pending_payment', imageUrl: IMG.gardenTerrace,
        createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      },
      {
        id: 'EV-1006',
        guestId: 'sanjay_gupta', guestName: 'Sanjay Gupta',
        venueId: 'v-grand-ballroom', venueName: 'The Grand Ocean Ballroom', venueMaxCapacity: 400,
        eventDate: isoFor(dayStr(-2), '19:00'), date: dayStr(-2), eventDateStr: dayStr(-2),
        bookedDates: [dayStr(-2)], expectedAttendance: 200,
        eventType: 'Corporate Conference', bookingType: 'daily',
        totalAmount: 175000, depositRequired: 87500, termsAccepted: true,
        status: 'paid', imageUrl: IMG.ballroom,
        preInspectionStatus: 'completed', inspectionStatus: 'passed', postInspectionStatus: 'completed', damageRecorded: true,
        createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
      },
      {
        id: 'EV-1007',
        guestId: 'thembi_nkosi', guestName: 'Thembi Nkosi',
        venueId: 'v-garden-terrace', venueName: 'Botanical Garden Terrace', venueMaxCapacity: 80,
        eventDate: isoFor(dayStr(1), '10:00'), date: dayStr(1), eventDateStr: dayStr(1),
        bookedDates: [dayStr(1)], expectedAttendance: 40,
        eventType: 'Charity Breakfast', bookingType: 'hourly', startTime: '10:00', duration: 3,
        totalAmount: 36000, depositRequired: 18000, termsAccepted: true,
        status: 'confirmed', imageUrl: IMG.gardenTerrace,
        createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
      },
      {
        id: 'EV-1008',
        guestId: 'ndidi_emecheta', guestName: 'Ndidi Emecheta',
        venueId: 'v-beach-pavilion', venueName: 'Sunset Beach Pavilion', venueMaxCapacity: 150,
        eventDate: isoFor(dayStr(-1), '17:00'), date: dayStr(-1), eventDateStr: dayStr(-1),
        bookedDates: [dayStr(-1)], expectedAttendance: 55,
        eventType: 'Sunset Cocktail Reception', bookingType: 'hourly', startTime: '17:00', duration: 4,
        totalAmount: 60000, depositRequired: 30000, termsAccepted: true,
        status: 'paid', imageUrl: IMG.beachPavilion,
        preInspectionStatus: 'completed', inspectionStatus: 'passed', postInspectionStatus: 'completed',
        createdAt: new Date(Date.now() - 6 * 86400000).toISOString(),
      },
      {
        id: 'EV-1009',
        guestId: 'marta_costa', guestName: 'Marta Costa',
        venueId: 'v-ashanti-estate', venueName: 'Ashanti Estate', venueMaxCapacity: 300,
        eventDate: isoFor(dayStr(-2), '12:00'), date: dayStr(-2), eventDateStr: dayStr(-2),
        bookedDates: [dayStr(-2)], expectedAttendance: 120,
        eventType: 'Birthday Celebration', bookingType: 'daily',
        totalAmount: 96000, depositRequired: 48000, termsAccepted: true,
        status: 'paid', imageUrl: IMG.estate,
        preInspectionStatus: 'completed', inspectionStatus: 'passed', postInspectionStatus: 'completed', damageRecorded: true, damagePenaltyTotal: 18500, damageInspectionId: 'INSP-DMG-EV1009',
        createdAt: new Date(Date.now() - 9 * 86400000).toISOString(),
      },
    ];

    for (const ev of eventBookings) {
      await setDoc(doc(db, 'event_bookings', ev.id), ev);
    }
    console.log(`✅ Added ${eventBookings.length} event bookings`);

    // ==========================================
    // 12. EVENT INVITATIONS + QR CODES
    // QR payloads are signed exactly like the mobile
    // app does, so seeded QRs scan successfully.
    // ==========================================
    interface InviteSeed { id: string; eventId: string; inviteeEmail: string; inviteeName: string; status: string; checkedInAt?: string }

    const inviteSeeds: InviteSeed[] = [
      // EV-1001 (today — Gala Dinner)
      { id: 'INV-1001', eventId: 'EV-1001', inviteeEmail: 'n.ngema@example.com', inviteeName: 'Naledi Ngema', status: 'accepted' },
      { id: 'INV-1002', eventId: 'EV-1001', inviteeEmail: 'p.pillay@example.com', inviteeName: 'Priya Pillay', status: 'accepted' },
      { id: 'INV-1003', eventId: 'EV-1001', inviteeEmail: 't.brown@example.com', inviteeName: 'Trevor Brown', status: 'accepted' },
      { id: 'INV-1004', eventId: 'EV-1001', inviteeEmail: 'k.mokoena@example.com', inviteeName: 'Kabelo Mokoena', status: 'checked_in', checkedInAt: isoFor(todayStr, '17:05') },
      { id: 'INV-1005', eventId: 'EV-1001', inviteeEmail: 's.leclerc@example.com', inviteeName: 'Sibongile Leclerc', status: 'declined' },
      // EV-1002 (today — Beach Party)
      { id: 'INV-1006', eventId: 'EV-1002', inviteeEmail: 'j.vos@example.com', inviteeName: 'Janine Vos', status: 'accepted' },
      { id: 'INV-1007', eventId: 'EV-1002', inviteeEmail: 'a.dube@example.com', inviteeName: 'Ayanda Dube', status: 'accepted' },
      { id: 'INV-1008', eventId: 'EV-1002', inviteeEmail: 'm.kruger@example.com', inviteeName: 'Marike Kruger', status: 'checked_in', checkedInAt: isoFor(todayStr, '13:30') },
      // EV-1003 (upcoming — Wedding)
      { id: 'INV-1009', eventId: 'EV-1003', inviteeEmail: 'b.mthembu@example.com', inviteeName: 'Bongani Mthembu', status: 'accepted' },
      { id: 'INV-1010', eventId: 'EV-1003', inviteeEmail: 'l.petersen@example.com', inviteeName: 'Lerato Petersen', status: 'accepted' },
      { id: 'INV-1011', eventId: 'EV-1003', inviteeEmail: 's.anand@example.com', inviteeName: 'Suresh Anand', status: 'accepted' },
      // EV-1004 (upcoming — Wine evening)
      { id: 'INV-1012', eventId: 'EV-1004', inviteeEmail: 'h.venter@example.com', inviteeName: 'Helena Venter', status: 'accepted' },
      { id: 'INV-1013', eventId: 'EV-1004', inviteeEmail: 'd.okafor@example.com', inviteeName: 'Dike Okafor', status: 'accepted' },
      // EV-1001 (today — more checked-in attendees for demo)
      { id: 'INV-1014', eventId: 'EV-1001', inviteeEmail: 's.hlambisa@example.com', inviteeName: 'Sifundo Hlambisa', status: 'checked_in', checkedInAt: isoFor(todayStr, '17:10') },
      { id: 'INV-1015', eventId: 'EV-1001', inviteeEmail: 'b.maqeda@example.com', inviteeName: 'Bandile Maqeda', status: 'checked_in', checkedInAt: isoFor(todayStr, '17:12') },
      { id: 'INV-1016', eventId: 'EV-1001', inviteeEmail: 'l.gwala@example.com', inviteeName: 'Lunga Bradley Gwala', status: 'checked_in', checkedInAt: isoFor(todayStr, '17:15') },
      { id: 'INV-1017', eventId: 'EV-1001', inviteeEmail: 'm.dlamini@example.com', inviteeName: 'Mpho Dlamini', status: 'accepted' },
      { id: 'INV-1018', eventId: 'EV-1001', inviteeEmail: 'f.mdlalose@example.com', inviteeName: 'Fanelesibonge Mdlalose', status: 'accepted' },
      { id: 'INV-1019', eventId: 'EV-1001', inviteeEmail: 's.mwandla@example.com', inviteeName: 'Sinakhokonke Mwandla', status: 'accepted' },
      // EV-1002 (today — more sent invitations)
      { id: 'INV-1020', eventId: 'EV-1002', inviteeEmail: 'm.mabanga@example.com', inviteeName: 'Melusi Mabanga', status: 'checked_in', checkedInAt: isoFor(todayStr, '13:45') },
      { id: 'INV-1021', eventId: 'EV-1002', inviteeEmail: 'i.olatunji@example.com', inviteeName: 'Isaac Toluwanimi Olatunji', status: 'accepted' },
      { id: 'INV-1022', eventId: 'EV-1002', inviteeEmail: 's.bande@example.com', inviteeName: 'Simphiwe Owethu Bande', status: 'accepted' },
      { id: 'INV-1023', eventId: 'EV-1002', inviteeEmail: 'a.nzama@example.com', inviteeName: 'Asanda S. Nzama', status: 'accepted' },
    ];

    for (const inv of inviteSeeds) {
      const issuedAt = Date.now() - 4 * 86400000;
      const hostId = eventBookings.find(e => e.id === inv.eventId)?.guestId || 'robert_harrison';
      const payload = {
        invitationId: inv.id,
        eventId: inv.eventId,
        inviteeEmail: inv.inviteeEmail,
        inviteeName: inv.inviteeName,
        hostId,
        status: inv.status,
        issuedAt,
      };
      const sig = await sha256Hex(QR_SIGNING_SECRET + JSON.stringify(payload));
      const qrCode = JSON.stringify({ ...payload, sig });
      const inviteDoc: Record<string, unknown> = {
        eventId: inv.eventId,
        inviteeEmail: inv.inviteeEmail,
        inviteeName: inv.inviteeName,
        hostId,
        status: inv.status,
        issuedAt,
        qrCode,
        createdAt: new Date(issuedAt).toISOString(),
      };
      if (inv.checkedInAt) {
        inviteDoc.checkedInAt = inv.checkedInAt;
        inviteDoc.checkedInBy = 'sipho_dlamini';
        inviteDoc.method = 'qr_scan';
      }
      await setDoc(doc(db, 'event_invitations', inv.id), inviteDoc);

      if (inv.status === 'checked_in') {
        await addDoc(collection(db, 'attendee_checkins'), {
          eventId: inv.eventId,
          invitationId: inv.id,
          attendeeId: inv.id,
          inviteeEmail: inv.inviteeEmail,
          inviteeName: inv.inviteeName,
          checkedInAt: inv.checkedInAt,
          checkedInBy: 'sipho_dlamini',
          method: 'qr_scan',
        });
      }
    }
    console.log(`✅ Added ${inviteSeeds.length} event invitations with signed QR codes`);

    // ==========================================
    // 13. DEMO DAMAGE RECORDS (online photo evidence)
    // Uses item.photo + top-level photos so the mobile
    // Damage Resolution screen renders proof images.
    // ==========================================
    const demoDamage = [
      {
        id: 'DMG-1001',
        eventId: 'EV-1006',
        bookingRef: 'EV-1006',
        guestId: 'sanjay_gupta',
        guestEmail: 'guest5@example.com',
        venueId: 'v-grand-ballroom',
        venueName: 'The Grand Ocean Ballroom',
        eventDate: isoFor(dayStr(-2), '19:00'),
        expectedAttendance: 200,
        inspectorId: 'sipho_dlamini',
        inspectorName: 'Sipho Dlamini',
        inspectorEmail: 's.dlamini@azurehorizon.com',
        assignedTechnicianId: 'kevin_dupreez',
        updatedByEmail: 's.dlamini@azurehorizon.com',
        items: [
          {
            item: 'Crystal Chandeliers',
            assetName: 'Crystal Chandeliers',
            category: 'Decor & Fixtures',
            condition: 'damaged',
            description: 'One crystal pendant knocked loose and a glass finial cracked during the gala.',
            estimatedCost: 1450,
            photo: u('photo-1519710164239-da123dc03ef4'),
            photoName: 'chandelier-damage.jpg',
          },
          {
            item: 'AV Projector & Screen',
            assetName: 'AV Projector & Screen',
            category: 'AV & Electrical',
            condition: 'damaged',
            description: 'Projector lens scratched; screen has a 10cm tear on the lower left corner.',
            estimatedCost: 3200,
            photo: u('photo-1504384308090-c894fdcc538d'),
            photoName: 'projector-screen-tear.jpg',
          },
        ],
        generalNotes: 'Light damage only. Guest has agreed to cover repair costs.',
        totalCost: 4650,
        status: 'in_repair',
        inspectionId: 'INSP-2026-08-12-001',
        damageFlagged: true,
        assignedTechnicianName: 'Kevin Du Preez',
        startedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
        createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
        updatedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
        photos: [u('photo-1519710164239-da123dc03ef4'), u('photo-1504384308090-c894fdcc538d')],
      },
      {
        id: 'DMG-1002',
        eventId: 'EV-1002',
        bookingRef: 'EV-1002',
        guestId: 'amara_okafor',
        guestEmail: 'guest3@example.com',
        venueId: 'v-beach-pavilion',
        venueName: 'Sunset Beach Pavilion',
        eventDate: isoFor(todayStr, '14:00'),
        expectedAttendance: 60,
        inspectorId: 'lerato_molefe',
        inspectorName: 'Lerato Molefe',
        inspectorEmail: 'l.molefe@azurehorizon.com',
        assignedTechnicianId: '',
        updatedByEmail: 'l.molefe@azurehorizon.com',
        items: [
          {
            item: 'Wooden Decking',
            assetName: 'Wooden Decking',
            category: 'Grounds & Outdoor',
            condition: 'damaged',
            description: 'Two deck planks charred by a tipped tiki torch near the bar area.',
            estimatedCost: 950,
            photo: u('photo-1486915309851-b0cc1f8a0084'),
            photoName: 'decking-burn.jpg',
          },
        ],
        generalNotes: 'Pending guest response.',
        totalCost: 950,
        status: 'recorded',
        inspectionId: 'INSP-2026-08-14-002',
        damageFlagged: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        photos: [u('photo-1486915309851-b0cc1f8a0084')],
      },
    ];

    for (const dmg of demoDamage) {
      await setDoc(doc(db, 'damage_records', dmg.id), dmg);
    }
    console.log(`✅ Added ${demoDamage.length} demo damage records with photo evidence`);

    // ==========================================
    // 14. EVENT INSPECTIONS (pre + post history)
    // Matches the mobile createEventInspection shape
    // so event-ops / post-inspection history renders.
    // ==========================================
    const demoInspections = [
      {
        id: 'INSP-PRE-EV1001',
        eventId: 'EV-1001',
        type: 'pre_event',
        inspectorId: 'sipho_dlamini',
        inspectorName: 'Sipho Dlamini',
        checklistItems: [
          { item: 'Room layout matches floor plan', status: 'passed' },
          { item: 'Seating count matches guest list', status: 'passed' },
          { item: 'Lighting system fully operational', status: 'passed' },
          { item: 'AV equipment tested & working', status: 'passed' },
          { item: 'Microphones tested', status: 'passed' },
          { item: 'Projector/screen aligned & calibrated', status: 'passed' },
          { item: 'Climate control set to correct temperature', status: 'passed' },
          { item: 'Emergency exits clear & signage visible', status: 'passed' },
          { item: 'Catering tables positioned correctly', status: 'passed' },
          { item: 'Decorations match client brief', status: 'passed' },
          { item: 'Flooring clean & free of hazards', status: 'passed' },
          { item: 'Registration desk set up', status: 'passed' },
        ],
        overallStatus: 'approved',
        completedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
        createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        id: 'INSP-PRE-EV1007',
        eventId: 'EV-1007',
        type: 'pre_event',
        inspectorId: 'sipho_dlamini',
        inspectorName: 'Sipho Dlamini',
        checklistItems: [
          { item: 'Room layout matches floor plan', status: 'passed' },
          { item: 'Seating count matches guest list', status: 'passed' },
          { item: 'Lighting system fully operational', status: 'passed' },
          { item: 'AV equipment tested & working', status: 'passed' },
          { item: 'Microphones tested', status: 'needs_attention', notes: 'Spare microphone battery low' },
          { item: 'Projector/screen aligned & calibrated', status: 'passed' },
          { item: 'Climate control set to correct temperature', status: 'passed' },
          { item: 'Emergency exits clear & signage visible', status: 'passed' },
          { item: 'Catering tables positioned correctly', status: 'passed' },
          { item: 'Decorations match client brief', status: 'passed' },
          { item: 'Flooring clean & free of hazards', status: 'passed' },
          { item: 'Registration desk set up', status: 'passed' },
        ],
        overallStatus: 'needs_attention',
        completedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
        createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        id: 'INSP-POST-EV1006',
        eventId: 'EV-1006',
        type: 'post_event',
        inspectorId: 'sipho_dlamini',
        inspectorName: 'Sipho Dlamini',
        checklistItems: [
          { item: 'Venue left in clean condition', status: 'passed' },
          { item: 'Furniture returned to standard layout', status: 'passed' },
          { item: 'AV equipment accounted for', status: 'passed' },
          { item: 'Regulatory checklists completed', status: 'passed' },
          { item: 'Damage flagged & documented', status: 'passed' },
        ],
        overallStatus: 'approved',
        completedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
        createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        id: 'INSP-POST-EV1008',
        eventId: 'EV-1008',
        type: 'post_event',
        inspectorId: 'lerato_molefe',
        inspectorName: 'Lerato Molefe',
        checklistItems: [
          { item: 'Venue left in clean condition', status: 'passed' },
          { item: 'Furniture returned to standard layout', status: 'passed' },
          { item: 'AV equipment accounted for', status: 'passed' },
          { item: 'Regulatory checklists completed', status: 'passed' },
          { item: 'Damage flagged & documented', status: 'na' },
        ],
        overallStatus: 'approved',
        completedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
        createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        id: 'INSP-POST-EV1009',
        eventId: 'EV-1009',
        type: 'post_event',
        inspectorId: 'sipho_dlamini',
        inspectorName: 'Sipho Dlamini',
        checklistItems: [
          { item: 'Venue left in clean condition', status: 'failed' },
          { item: 'Furniture returned to standard layout', status: 'passed' },
          { item: 'AV equipment accounted for', status: 'passed' },
          { item: 'Regulatory checklists completed', status: 'failed' },
          { item: 'Damage flagged & documented', status: 'failed' },
        ],
        overallStatus: 'needs_attention',
        completedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
        createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
    ];
    for (const insp of demoInspections) {
      await setDoc(doc(db, 'event_inspections', insp.id), insp);
    }
    console.log(`✅ Added ${demoInspections.length} event inspection records`);

    // ==========================================
    // 15. EXTRA DAMAGE RECORD (EV-1009, resolved-style)
    // ==========================================
    await setDoc(doc(db, 'damage_records', 'DMG-1003'), {
      id: 'DMG-1003',
      eventId: 'EV-1009',
      bookingRef: 'EV-1009',
      guestId: 'marta_costa',
      guestEmail: 'guest7@example.com',
      venueId: 'v-ashanti-estate',
      venueName: 'Ashanti Estate',
      eventDate: isoFor(dayStr(-2), '12:00'),
      expectedAttendance: 120,
      inspectorId: 'sipho_dlamini',
      inspectorName: 'Sipho Dlamini',
      inspectorEmail: 's.dlamini@azurehorizon.com',
      assignedTechnicianId: 'kevin_dupreez',
      updatedByEmail: 's.dlamini@azurehorizon.com',
      items: [
        {
          item: 'Outdoor Patio Umbrellas',
          assetName: 'Outdoor Patio Umbrellas',
          category: 'Grounds & Outdoor',
          condition: 'damaged',
          description: 'Two umbrellas torn and one pole bent during a windy reception.',
          estimatedCost: 8500,
          photo: u('photo-1504384308090-c894fdcc538d'),
          photoName: 'umbrella-damage.jpg',
        },
        {
          item: 'Garden Pathway Lighting',
          assetName: 'Garden Pathway Lighting',
          category: 'Grounds & Outdoor',
          condition: 'damaged',
          description: 'Three pathway light casings cracked from heavy foot traffic.',
          estimatedCost: 10000,
          photo: u('photo-1519710164239-da123dc03ef4'),
          photoName: 'path-lighting-damage.jpg',
        },
      ],
      generalNotes: 'Guest accepted liability. Repairs scheduled with maintenance.',
      totalCost: 18500,
      status: 'resolved',
      inspectionId: 'INSP-POST-EV1009',
      damageFlagged: true,
      assignedTechnicianName: 'Kevin Du Preez',
      startedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      resolvedAt: new Date(Date.now() - 0.25 * 86400000).toISOString(),
      repairNotes: 'Replaced both damaged umbrellas with reinforced units and re-cast three pathway light casings. All repairs tested and signed off.',
      actualRepairCost: 17850,
      createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 0.25 * 86400000).toISOString(),
      photos: [u('photo-1504384308090-c894fdcc538d'), u('photo-1519710164239-da123dc03ef4')],
    });

    // ==========================================
    // 15b. INVOICED DEMO DAMAGE CLAIM + OFFICIAL INVOICE (EV-1008)
    // Shows the end state: maintenance resolved → admin ruled →
    // invoice issued to the guest (visible in their billing portal).
    // ==========================================
    const dmg1004 = {
      id: 'DMG-1004',
      eventId: 'EV-1008',
      bookingRef: 'EV-1008',
      guestId: 'ndidi_emecheta',
      guestEmail: 'ndidi.emecheta@example.com',
      venueId: 'v-beach-pavilion',
      venueName: 'Sunset Beach Pavilion',
      eventDate: isoFor(dayStr(-1), '17:00'),
      expectedAttendance: 55,
      inspectorId: 'lerato_molefe',
      inspectorName: 'Lerato Molefe',
      inspectorEmail: 'l.molefe@azurehorizon.com',
      assignedTechnicianId: 'thabo_mbeki',
      assignedTechnicianName: 'Thabo Mbeki',
      updatedByEmail: 'l.molefe@azurehorizon.com',
      items: [
        {
          item: 'Weatherproof Table Umbrellas',
          assetName: 'Weatherproof Table Umbrellas',
          category: 'Grounds & Outdoor',
          condition: 'damaged',
          description: 'One market umbrella arm snapped and tabletop scratched during the cocktail reception.',
          estimatedCost: 4200,
          photo: u('photo-1486915309851-b0cc1f8a0084'),
          photoName: 'table-umbrella-damage.jpg',
        },
      ],
      generalNotes: 'Claim fully reviewed. Guest liability confirmed by admin.',
      totalCost: 4200,
      status: 'invoiced',
      decision: 'APPROVED_FULL_CHARGE',
      finalAssessedAmount: 4200,
      resolutionReason: 'Photo evidence confirms structural damage; full repair cost charged to the guest account.',
      invoiceNumber: 'INV-DMG-EV1008-0001',
      inspectionId: 'INSP-POST-EV1008',
      damageFlagged: true,
      startedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      resolvedAt: new Date(Date.now() - 0.5 * 86400000).toISOString(),
      repairNotes: 'Replaced umbrella arm and re-sanded the tabletop; sealed with marine-grade varnish.',
      actualRepairCost: 4200,
      invoicedAt: new Date(Date.now() - 0.25 * 86400000).toISOString(),
      createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 0.25 * 86400000).toISOString(),
      photos: [u('photo-1486915309851-b0cc1f8a0084')],
    };
    await setDoc(doc(db, 'damage_records', dmg1004.id), dmg1004);

    await setDoc(doc(db, 'invoices', 'INV-DMG-EV1008-0001'), {
      id: 'INV-DMG-EV1008-0001',
      invoiceNumber: 'INV-DMG-EV1008-0001',
      type: 'damage',
      recordId: 'DMG-1004',
      guestId: 'ndidi_emecheta',
      guestEmail: 'ndidi.emecheta@example.com',
      guestName: 'Ndidi Emecheta',
      amount: 4200,
      subtotal: 4200,
      tax: 0,
      lineItems: [
        { name: 'Weatherproof Table Umbrellas', quantity: 1, price: 4200, subtotal: 4200 },
      ],
      sentAt: new Date(Date.now() - 0.25 * 86400000).toISOString(),
      emailStatus: 'sent',
      createdAt: new Date(Date.now() - 0.25 * 86400000).toISOString(),
    });
    console.log(`✅ Added ${demoDamage.length + 1} demo damage records incl. seeded invoice flow`);

    // ==========================================
    // 16. REFUND REQUESTS (admin queue)
    // ==========================================
    const demoRefunds = [
      {
        id: 'REF-1001',
        eventId: 'EV-1002',
        bookingRef: 'EV-1002',
        guestId: 'amara_okafor',
        guestName: 'Amara Okafor',
        guestEmail: 'guest3@example.com',
        reason: 'Shoreline forecast predicts heavy rain; hosting the beach party is not feasible.',
        requestedAmount: 45000,
        totalPaidAmount: 90000,
        status: 'pending',
        proofImages: [u('photo-1507525428034-b723cf961d3e')],
        createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
      {
        id: 'REF-1002',
        eventId: 'EV-1005',
        bookingRef: 'EV-1005',
        guestId: 'jacobus_van_der_merwe',
        guestName: 'Jacobus van der Merwe',
        guestEmail: 'guest6@example.com',
        reason: 'Asked for full refund after finding a cheaper venue. No deposit paid yet.',
        requestedAmount: 22500,
        totalPaidAmount: 0,
        status: 'declined',
        proofImages: [],
        createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
        reviewedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      },
    ];
    for (const rf of demoRefunds) {
      await setDoc(doc(db, 'refund_requests', rf.id), rf);
    }
    console.log(`✅ Added ${demoRefunds.length} refund requests`);

    // ==========================================
    // 17. LIVE COMPLAINTS (guest relations feed)
    // ==========================================
    const demoComplaints = [
      {
        eventId: 'EV-1001',
        guestId: 'guest_001',
        guestName: 'Thandi Mokoena',
        category: 'noise',
        location: 'Grand Ocean Ballroom',
        description: 'Volume of the live band is too loud near the entrance where I was seated.',
        urgency: 'medium',
        photos: [],
        status: 'open',
        createdAt: new Date(Date.now() - 5 * 3600000).toISOString(),
      },
      {
        eventId: 'EV-1001',
        guestId: 'guest_005',
        guestName: 'Priya Naidoo',
        category: 'service',
        location: 'Grand Ocean Ballroom',
        description: 'Cocktail service was slow during the first hour of the reception.',
        urgency: 'low',
        photos: [],
        status: 'open',
        createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
      },
      {
        eventId: 'EV-1006',
        guestId: 'guest_003',
        guestName: 'Lerato Maseko',
        category: 'facility',
        location: 'Grand Ocean Ballroom',
        description: 'One of the breakout rooms had a flickering light; noted it at the front desk.',
        urgency: 'medium',
        photos: [],
        status: 'resolved',
        createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
        updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      },
    ];
    for (const comp of demoComplaints) {
      await addDoc(collection(db, 'live_complaints'), comp);
    }
    console.log(`✅ Added ${demoComplaints.length} live complaints`);

    // ==========================================
    // 18. EVENT FEEDBACK (past event)
    // Mirrors mobile submitEventFeedback (+ its
    // mirrored 'reviews' entry so Leave Review shows it).
    // ==========================================
    await addDoc(collection(db, 'event_feedback'), {
      eventId: 'EV-1006',
      guestId: 'sanjay_gupta',
      guestName: 'Sanjay Gupta',
      ratings: { venue: 5, catering: 4, staff: 5, setup: 4 },
      comments: 'Excellent conference venue, well organised. Catering could do with more vegetarian variety.',
      submittedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    });
    await addDoc(collection(db, 'reviews'), {
      guestId: 'sanjay_gupta',
      guestName: 'Sanjay Gupta',
      category: 'event',
      rating: 5,
      comments: 'Excellent conference venue, well organised. Catering could do with more vegetarian variety.',
      eventId: 'EV-1006',
      helpful: 8,
      createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    });

    // ==========================================
    // 19. INCREMENT 2 — NPO PARTNERS (1 pending, 2 approved)
    // ==========================================
    const seedNpos = [
      {
        npoId: 'NPO-DURBAN-CARE', organisationName: 'Durban Community Care', registrationNumber: 'NPO-2014-118822',
        pboNumber: 'PBO-930045117', contactName: 'Melusi Mabanga', email: 'npo1@azurehorizon.demo',
        phone: '+27315550101', serviceAreas: ['Umlazi', 'Chatsworth'], beneficiaryCapacity: 450,
        transportType: 'Refrigerated van', refrigerationAvailable: true, complianceDocuments: [],
        verificationStatus: 'approved', verifiedBy: 'bandile_maqeda', verifiedAt: new Date(Date.now() - 6 * 86400000).toISOString(),
        lastDecision: { performedBy: 'bandile_maqeda', performedAt: new Date(Date.now() - 6 * 86400000).toISOString(), action: 'npo_approved', reason: null },
        createdAt: new Date(Date.now() - 7 * 86400000).toISOString(), updatedAt: new Date(Date.now() - 6 * 86400000).toISOString(),
      },
      {
        npoId: 'NPO-PHOENIX-FOOD', organisationName: 'Phoenix Food Rescue', registrationNumber: 'NPO-2019-203311',
        pboNumber: 'PBO-930061204', contactName: 'Priya Naidoo', email: 'npo2@azurehorizon.demo',
        phone: '+27315550102', serviceAreas: ['Phoenix', 'Umhlanga'], beneficiaryCapacity: 280,
        transportType: 'Bakkie + cooler boxes', refrigerationAvailable: false, complianceDocuments: [],
        verificationStatus: 'approved', verifiedBy: 'bandile_maqeda', verifiedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
        lastDecision: { performedBy: 'bandile_maqeda', performedAt: new Date(Date.now() - 5 * 86400000).toISOString(), action: 'npo_approved', reason: null },
        createdAt: new Date(Date.now() - 6 * 86400000).toISOString(), updatedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      },
      {
        npoId: 'NPO-UMLAZI-KITCHEN', organisationName: 'Umlazi Soup Kitchen', registrationNumber: 'NPO-2023-310077',
        contactName: 'Bandile Maqeda', email: 'npo3@azurehorizon.demo',
        phone: '+27315550103', serviceAreas: ['Umlazi'], beneficiaryCapacity: 120,
        transportType: 'Minibus', refrigerationAvailable: false, complianceDocuments: [],
        verificationStatus: 'pending',
        createdAt: new Date(Date.now() - 1 * 86400000).toISOString(), updatedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
    ];
    for (const npo of seedNpos) await addDoc(collection(db, 'npo_partners'), npo);
    console.log(`✅ Added ${seedNpos.length} NPO partners`);

    // ==========================================
    // 20. INCREMENT 2 — DONATION BATCHES (8 across statuses)
    // ==========================================
    const fullChecks = { coreTemperatureVerified: true, packagingIntegrityVerified: true, allergenLabelsVerified: true, safePreparationWindowVerified: true };
    const mkBatch = (batchId: string, item: string, cat: string, portions: number, kg: number, allergens: string[], status: string, extra: Record<string, unknown> = {}) => ({
      batchId, itemName: item, mealCategory: cat, portionCount: portions, estimatedWeightKg: kg, allergens,
      preparedAt: new Date(Date.now() - 5 * 3600000).toISOString(),
      expiryAt: new Date(Date.now() + 19 * 3600000).toISOString(),
      safetyChecklist: fullChecks,
      safetyPhotoUrl: u('photo-1546069901-ba9599a7e63c'),
      photoMeta: null, status, qrConsumed: false,
      createdBy: 'sibusiso_khoza', createdAt: new Date(Date.now() - 4 * 3600000).toISOString(),
      updatedAt: new Date(Date.now() - 4 * 3600000).toISOString(), ...extra,
    });
    const seedBatches = [
      mkBatch('DON-SEED-01', 'Chicken curry + rice', 'Cooked meals', 60, 24, ['dairy'], 'safety_verified_unassigned'),
      mkBatch('DON-SEED-02', 'Vegetable soup', 'Soups', 40, 16, [], 'safety_verified_unassigned'),
      mkBatch('DON-SEED-03', 'Beef stew + samp', 'Cooked meals', 80, 32, [], 'allocated_awaiting_claim', { allocatedNpoId: 'NPO-DURBAN-CARE', allocatedAt: new Date(Date.now() - 3 * 3600000).toISOString(), allocatedBy: 'sibusiso_khoza' }),
      mkBatch('DON-SEED-04', 'Fruit salad cups', 'Fresh produce', 50, 12, [], 'allocated_awaiting_claim', { allocatedNpoId: 'NPO-PHOENIX-FOOD', allocatedAt: new Date(Date.now() - 2 * 3600000).toISOString(), allocatedBy: 'sibusiso_khoza' }),
      mkBatch('DON-SEED-05', 'Pasta bake trays', 'Cooked meals', 70, 28, ['gluten', 'dairy'], 'claimed_ready_for_scheduling', { allocatedNpoId: 'NPO-DURBAN-CARE', allocatedAt: new Date(Date.now() - 8 * 3600000).toISOString(), allocatedBy: 'sibusiso_khoza', claimedBy: 'npo1@azurehorizon.demo', claimedAt: new Date(Date.now() - 6 * 3600000).toISOString(), receivingFacility: 'Umlazi Community Hall', distributionTermsAccepted: true }),
      mkBatch('DON-SEED-07', 'Bread rolls + sandwiches', 'Bakery', 100, 20, ['gluten'], 'collected_completed', { allocatedNpoId: 'NPO-DURBAN-CARE', allocatedAt: new Date(Date.now() - 2 * 86400000).toISOString(), allocatedBy: 'sibusiso_khoza', claimedBy: 'npo1@azurehorizon.demo', claimedAt: new Date(Date.now() - 2 * 86400000 + 3600000).toISOString(), receivingFacility: 'Umlazi Community Hall', distributionTermsAccepted: true, collectedAt: new Date(Date.now() - 1 * 86400000).toISOString(), verifiedBy: 'sibusiso_khoza', qrConsumed: true }),
      mkBatch('DON-SEED-08', 'Grilled fish + veg', 'Cooked meals', 45, 18, ['fish'], 'collected_completed', { allocatedNpoId: 'NPO-PHOENIX-FOOD', allocatedAt: new Date(Date.now() - 3 * 86400000).toISOString(), allocatedBy: 'sibusiso_khoza', claimedBy: 'npo2@azurehorizon.demo', claimedAt: new Date(Date.now() - 3 * 86400000 + 3600000).toISOString(), receivingFacility: 'Phoenix Youth Centre', distributionTermsAccepted: true, collectedAt: new Date(Date.now() - 2 * 86400000).toISOString(), verifiedBy: 'marco_rossi', qrConsumed: true }),
    ];
    const batchDocIds: Record<string, string> = {};
    for (const b of seedBatches) {
      const r = await addDoc(collection(db, 'donation_batches'), b);
      batchDocIds[b.batchId] = r.id;
    }
    // Scheduled batch with a real signed collection pass (same payload order as scheduler)
    const schedStart = new Date(Date.now() + 2 * 3600000).toISOString();
    const schedEnd = new Date(Date.now() + 4 * 3600000).toISOString();
    const schedRef = await addDoc(collection(db, 'donation_batches'), mkBatch('DON-SEED-06', 'Lamb biryani trays', 'Cooked meals', 90, 36, ['dairy'], 'claimed_ready_for_scheduling', { allocatedNpoId: 'NPO-DURBAN-CARE', allocatedAt: new Date(Date.now() - 5 * 3600000).toISOString(), allocatedBy: 'sibusiso_khoza', claimedBy: 'npo1@azurehorizon.demo', claimedAt: new Date(Date.now() - 4 * 3600000).toISOString(), receivingFacility: 'Umlazi Community Hall', distributionTermsAccepted: true }));
    batchDocIds['DON-SEED-06'] = schedRef.id;
    const schedPayload = { type: 'DONATION_COLLECTION', batchId: 'DON-SEED-06', batchDocId: schedRef.id, npoId: 'NPO-DURBAN-CARE', collectionWindowStart: schedStart, collectionWindowEnd: schedEnd, loadingBay: 'Bay A', issuedAt: Date.now(), nonce: 'seednonce06' };
    const schedSig = await signQrPayload(schedPayload);
    await updateDoc(schedRef, {
      status: 'collection_scheduled', pickupDate: todayStr, pickupWindowStart: schedStart, pickupWindowEnd: schedEnd,
      loadingBay: 'Bay A', courierName: 'Fanelesibonge Mdlalose', collectionQr: JSON.stringify({ ...schedPayload, sig: schedSig }),
      collectionNonce: 'seednonce06', qrConsumed: false, updatedAt: new Date().toISOString(),
    });
    await addDoc(collection(db, 'donation_checkins'), {
      batchId: 'DON-SEED-07', npoId: 'NPO-DURBAN-CARE', courierName: 'Fanelesibonge Mdlalose',
      method: 'donation_scan', collectionWindow: 'seed window', loadingBay: 'Bay A',
      sealVerified: true, signature: 'Fanelesibonge Mdlalose', collectedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      verifiedBy: 'sibusiso_khoza', wasOffline: false, idempotencyKey: 'seed07:seednonce07',
    });
    console.log(`✅ Added 8 donation batches + 1 collection record`);

    // ==========================================
    // 21. INCREMENT 2 — WORKFORCE
    // ==========================================
    await addDoc(collection(db, 'staff_availability'), {
      staffId: 'sibusiso_khoza', staffName: 'Chef Sibusiso Khoza', weekStart: todayStr,
      availability: [
        { day: 'Monday', startTime: '08:00', endTime: '17:00' },
        { day: 'Tuesday', startTime: '08:00', endTime: '17:00' },
        { day: 'Wednesday', startTime: '08:00', endTime: '17:00' },
        { day: 'Thursday', startTime: '08:00', endTime: '17:00' },
        { day: 'Friday', startTime: '08:00', endTime: '17:00' },
      ],
      unavailableDates: [], updatedAt: new Date().toISOString(),
    });
    await addDoc(collection(db, 'staff_availability'), {
      staffId: 'elena_meyer', staffName: 'Elena Meyer', weekStart: todayStr,
      availability: [
        { day: 'Monday', startTime: '09:00', endTime: '15:00' },
        { day: 'Wednesday', startTime: '09:00', endTime: '15:00' },
        { day: 'Friday', startTime: '09:00', endTime: '15:00' },
      ],
      unavailableDates: [], updatedAt: new Date().toISOString(),
    });
    await addDoc(collection(db, 'leave_requests'), {
      staffId: 'elena_meyer', staffName: 'Elena Meyer', leaveType: 'Annual',
      startDate: dayStr(14), endDate: dayStr(16), supportingDocuments: [],
      status: 'approved', submittedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      reviewedBy: 'bandile_maqeda', reviewedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    });
    await addDoc(collection(db, 'leave_requests'), {
      staffId: 'marco_rossi', staffName: 'Chef Marco Rossi', leaveType: 'Sick',
      startDate: dayStr(3), endDate: dayStr(4), supportingDocuments: [],
      status: 'pending', submittedAt: new Date().toISOString(),
    });
    const rosterRef = await addDoc(collection(db, 'shift_rosters'), {
      rosterId: `RS-${todayStr}-F&B`.replace(/\s+/g, '').toUpperCase(),
      weekStart: todayStr, department: 'Food & Beverage',
      shifts: [
        { shiftId: 'SH-SEED-01', staffId: 'sibusiso_khoza', staffName: 'Chef Sibusiso Khoza', date: dayStr(1), startTime: '08:00', endTime: '16:00', role: 'chef', requiredSkill: 'hot-kitchen' },
        { shiftId: 'SH-SEED-02', staffId: 'marco_rossi', staffName: 'Chef Marco Rossi', date: dayStr(1), startTime: '16:00', endTime: '23:00', role: 'chef', requiredSkill: 'hot-kitchen' },
        { shiftId: 'SH-SEED-03', staffId: 'elena_meyer', staffName: 'Elena Meyer', date: dayStr(2), startTime: '09:00', endTime: '15:00', role: 'front_desk', requiredSkill: 'check-in' },
        { shiftId: 'SH-SEED-04', staffId: 'sibusiso_khoza', staffName: 'Chef Sibusiso Khoza', date: dayStr(2), startTime: '08:00', endTime: '16:00', role: 'chef', requiredSkill: 'cold-kitchen' },
      ],
      validationStatus: 'published', validationWarnings: [], published: true,
      publishedAt: new Date().toISOString(), publishedBy: 'bandile_maqeda',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    const swapRef = await addDoc(collection(db, 'shift_swaps'), {
      requesterStaffId: 'sibusiso_khoza', requesterShiftId: 'SH-SEED-01',
      targetStaffId: 'marco_rossi', targetShiftId: 'SH-SEED-02', rosterId: rosterRef.id,
      status: 'pending_peer', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    const seedOpenShifts = [
      { shiftId: 'OS-SEED-01', department: 'Food & Beverage', date: dayStr(3), startTime: '18:00', endTime: '23:00', role: 'chef', requiredSkill: 'hot-kitchen', hours: 5, urgency: 'urgent', status: 'open' },
      { shiftId: 'OS-SEED-02', department: 'Front Office', date: dayStr(4), startTime: '08:00', endTime: '14:00', role: 'front_desk', requiredSkill: 'check-in', hours: 6, urgency: 'normal', status: 'open' },
    ];
    for (const os of seedOpenShifts) {
      await addDoc(collection(db, 'open_shifts'), { ...os, rosterId: rosterRef.id, createdAt: new Date().toISOString(), createdBy: 'bandile_maqeda' });
    }
    await addDoc(collection(db, 'punch_records'), {
      punchType: 'in', staffUid: 'sibusiso_khoza', staffRosterId: 'SH-SEED-01', staffName: 'Chef Sibusiso Khoza',
      deviceId: 'seed-device', deviceMatchPassed: true, isFirstTimeEnrollment: false,
      biometricPassed: true, biometricMethod: 'fingerprint', lat: -29.8606, lng: 30.9803,
      accuracyM: 12, distanceM: 8, withinRadius: true, overallStatus: 'clocked-in',
      source: 'staff_mobile', isoTime: new Date(Date.now() - 2 * 3600000).toISOString(),
    });
    await addDoc(collection(db, 'attendance_exceptions'), {
      staffId: 'marco_rossi', staffName: 'Chef Marco Rossi', shiftId: 'SH-SEED-02', rosterId: rosterRef.id,
      clockInAt: new Date(Date.now() - 1 * 86400000 + 9 * 3600000).toISOString(),
      clockOutAt: new Date(Date.now() - 1 * 86400000 + 17 * 3600000).toISOString(),
      hoursWorked: 8, exceptionType: 'late_arrival', reviewStatus: 'exception_review',
      createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    });
    console.log(`✅ Added workforce seed: availability, leave, roster, swap, open shifts, punches, exception`);

    // ==========================================
    // 22. AUDIT BACKFILL FOR SEEDED RECORDS
    // ==========================================
    // These records were written directly above rather than through the
    // instrumented services, so the journal knows nothing about them. Emit one
    // entry per meaningful seeded state so the trail is not misleadingly empty
    // on a fresh database. Guarded by a dated marker because the journal is
    // append-only (there is no delete rule) — reseeding must not duplicate.
    //
    // clientAt on these entries is the backfill time, not the historical date of
    // the record: the journal is hash-chained and sorted by clientAt, so writing
    // a fabricated past timestamp would corrupt the chain's ordering claims. The
    // real dates live in each entry's summary/metadata instead.
    try {
      const marker = await getDoc(doc(db, 'meta', 'auditSeed'));
      if (marker.exists() && marker.data()?.lastAuditSeedDate === todayStr) {
        console.log('📅 Audit backfill already run for', todayStr);
      } else {
        const entries: AuditInput[] = [];

        for (const b of bookings) {
          entries.push({
            action: AUDIT_ACTIONS.bookingCreated,
            entity: 'bookings',
            entityId: b.id,
            afterStatus: b.status,
            summary: `Booking ${b.id} seeded for ${b.guestName} in room ${b.roomNumber}`,
            metadata: { roomNumber: b.roomNumber, totalAmount: b.totalAmount, paymentStatus: b.paymentStatus },
          });
          if (b.status === 'checked_in') {
            entries.push({
              action: AUDIT_ACTIONS.bookingCheckedIn,
              entity: 'bookings',
              entityId: b.id,
              beforeStatus: 'confirmed',
              afterStatus: 'checked_in',
              summary: `${b.guestName} checked in to room ${b.roomNumber}`,
              metadata: { roomNumber: b.roomNumber },
            });
          }
          if (b.status === 'checked_out') {
            entries.push({
              action: AUDIT_ACTIONS.bookingCheckedOut,
              entity: 'bookings',
              entityId: b.id,
              beforeStatus: 'checked_in',
              afterStatus: 'checked_out',
              summary: `${b.guestName} checked out of room ${b.roomNumber}`,
              metadata: { roomNumber: b.roomNumber, balanceDue: b.balanceDue },
            });
          }
        }

        for (const inc of incidentals) {
          entries.push({
            action: AUDIT_ACTIONS.roomChargeAdded,
            entity: 'incidental_charges',
            entityId: inc.bookingId,
            summary: `Charge added to booking ${inc.bookingId}: ${inc.description}`,
            metadata: { bookingId: inc.bookingId, amount: inc.amount, description: inc.description },
          });
        }

        for (const req of serviceRequests) {
          entries.push({
            action: AUDIT_ACTIONS.serviceRequestRaised,
            entity: 'service_requests',
            entityId: req.id,
            afterStatus: 'pending',
            summary: `${req.type} request raised in room ${req.roomNumber}: ${req.description}`,
            metadata: { roomNumber: req.roomNumber, priority: req.priority },
          });
          if (req.status === 'completed') {
            entries.push({
              action: AUDIT_ACTIONS.serviceRequestResolved,
              entity: 'service_requests',
              entityId: req.id,
              beforeStatus: 'in_progress',
              afterStatus: 'completed',
              summary: `Service request ${req.id} completed`,
              metadata: { assignedTo: req.assignedTo },
            });
          }
        }

        for (const npo of seedNpos) {
          if (npo.verificationStatus === 'approved') {
            entries.push({
              action: AUDIT_ACTIONS.npoApproved,
              entity: 'npo_partners',
              entityId: npo.npoId,
              beforeStatus: 'under_review',
              afterStatus: 'approved',
              summary: `${npo.organisationName} approved as an NPO partner`,
              metadata: { registrationNumber: npo.registrationNumber, serviceAreas: npo.serviceAreas },
            });
          }
          // The pending partner is deliberately not recorded: no decision has
          // happened yet, and inventing one would misstate the ledger.
        }

        const BATCH_ACTION: Record<string, AuditAction> = {
          safety_verified_unassigned: AUDIT_ACTIONS.donationCertified,
          allocated_awaiting_claim: AUDIT_ACTIONS.donationAllocated,
          claimed_ready_for_scheduling: AUDIT_ACTIONS.donationClaimed,
          collection_scheduled: AUDIT_ACTIONS.collectionScheduled,
          collected_completed: AUDIT_ACTIONS.collectionCompleted,
        };
        for (const b of seedBatches) {
          const action = BATCH_ACTION[String(b.status)];
          if (!action) continue;
          entries.push({
            action,
            entity: 'donation_batches',
            entityId: batchDocIds[b.batchId] ?? b.batchId,
            afterStatus: String(b.status),
            summary: `${b.batchId}: ${b.itemName} (${b.portionCount} portions, ${b.estimatedWeightKg}kg)`,
            metadata: { batchId: b.batchId, allocatedNpoId: (b as Record<string, unknown>).allocatedNpoId ?? null },
          });
        }
        // DON-SEED-06 was created unscheduled and then moved by updateDoc, so it
        // is not in seedBatches but has a real collection window worth recording.
        entries.push({
          action: AUDIT_ACTIONS.collectionScheduled,
          entity: 'donation_batches',
          entityId: schedRef.id,
          beforeStatus: 'claimed_ready_for_scheduling',
          afterStatus: 'collection_scheduled',
          summary: 'DON-SEED-06: Lamb biryani trays collection scheduled for today, Bay A',
          metadata: { batchId: 'DON-SEED-06', npoId: 'NPO-DURBAN-CARE', loadingBay: 'Bay A' },
        });

        entries.push({
          action: AUDIT_ACTIONS.rosterPublished,
          entity: 'shift_rosters',
          entityId: rosterRef.id,
          afterStatus: 'published',
          summary: `Roster published for Food & Beverage, week of ${todayStr}`,
          metadata: { weekStart: todayStr, shiftCount: 4 },
        });
        entries.push({
          action: AUDIT_ACTIONS.shiftSwapRequested,
          entity: 'shift_swaps',
          entityId: swapRef.id,
          afterStatus: 'pending_peer',
          summary: 'Chef Sibusiso Khoza requested a shift swap with Chef Marco Rossi',
          metadata: { rosterId: rosterRef.id },
        });
        for (const os of seedOpenShifts) {
          entries.push({
            action: AUDIT_ACTIONS.openShiftCreated,
            entity: 'open_shifts',
            entityId: os.shiftId,
            afterStatus: 'open',
            summary: `Open shift posted: ${os.role}, ${os.date} ${os.startTime}–${os.endTime}`,
            metadata: { department: os.department, urgency: os.urgency },
          });
        }
        entries.push({
          action: AUDIT_ACTIONS.leaveApproved,
          entity: 'leave_requests',
          entityId: 'seed-elena-meyer',
          beforeStatus: 'pending',
          afterStatus: 'approved',
          summary: 'Elena Meyer annual leave approved',
          metadata: { staffId: 'elena_meyer', dates: `${dayStr(14)} → ${dayStr(16)}` },
        });
        entries.push({
          action: AUDIT_ACTIONS.leaveRequested,
          entity: 'leave_requests',
          entityId: 'seed-marco-rossi',
          afterStatus: 'pending',
          summary: 'Chef Marco Rossi sick leave requested, awaiting review',
          metadata: { staffId: 'marco_rossi', dates: `${dayStr(3)} → ${dayStr(4)}` },
        });
        entries.push({
          action: AUDIT_ACTIONS.attendanceExceptionRaised,
          entity: 'attendance_exceptions',
          entityId: 'seed-marco-rossi-late',
          afterStatus: 'exception_review',
          summary: 'late_arrival flagged for Chef Marco Rossi, awaiting review',
          metadata: { staffId: 'marco_rossi', hoursWorked: 8 },
        });

        await writeSeedAuditEntries(entries);
        await setDoc(doc(db, 'meta', 'auditSeed'), {
          lastAuditSeedDate: todayStr,
          lastAuditSeedAt: new Date().toISOString(),
          entryCount: entries.length,
        });
        console.log(`📝 Backfilled ${entries.length} audit entries for seeded records`);
      }
    } catch (err) {
      // The trail is best-effort; a failed backfill must not fail the seed.
      console.warn('Audit backfill skipped:', err);
    }

    await setDoc(doc(db, 'meta', 'seedMarker'), {
      lastSeedDate: todayStr,
      lastSeedAt: new Date().toISOString(),
    });

    notify("✅ System Initialized Successfully with 200 rooms, 9 fresh events, signed QR invitations and online images!");
  } catch (err) {
    console.error(err);
    notify("Seeding failed. Check console for details.");
  }
};

// Auto-run on web landing page: only re-seeds when the
// seed marker is stale (i.e. a different day), keeping the
// demo data permanently in sync with "today". Silent by default.
export const autoSeedIfNeeded = async (opts: { silent?: boolean } = {}) => {
  try {
    const marker = await getDoc(doc(db, 'meta', 'seedMarker'));
    const lastSeedDate = marker.exists() ? (marker.data()?.lastSeedDate || '') : '';
    if (lastSeedDate === todayStr) {
      console.log('📅 Seed data already fresh for', todayStr);
      return;
    }
    await seedDatabase({ silent: true });
  } catch (err) {
    console.error('autoSeedIfNeeded failed:', err);
  }
};
