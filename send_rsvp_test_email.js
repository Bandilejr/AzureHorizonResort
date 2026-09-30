const { initializeApp } = require('./node_modules/firebase/app');
const {
  getFirestore, doc, getDoc, setDoc, collection, addDoc, getDocs,
  query, where, updateDoc, serverTimestamp
} = require('./node_modules/firebase/firestore');
const { getAuth, signInWithEmailAndPassword } = require('./node_modules/firebase/auth');
const crypto = require('crypto');

const firebaseConfig = {
  apiKey: "AIzaSyBRt04Rm3Ry9nW_DlTm3TsR8bCzkPvxvSA",
  authDomain: "hotel-management-system-c3526.firebaseapp.com",
  projectId: "hotel-management-system-c3526",
  storageBucket: "hotel-management-system-c3526.firebasestorage.app",
  messagingSenderId: "7196606684",
  appId: "1:7196606684:web:66cb6e026807b517f17419"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const SECRET = 'azure-horizon-demo-signing-secret-2026';
const RSVP_SITE_BASE = 'https://hotel-management-system-c3526.web.app/rsvp/';

const sha256Hex = (text) => crypto.createHash('sha256').update(text).digest('hex');

const EMAILJS_PUBLIC_KEY = 'e9wHktkV2OU_QMaYq';
const EMAILJS_PRIVATE_KEY = 'MbOqjaY8NL-yqLuQFhBmX';
const EMAILJS_SERVICE_ID = 'service_jdrtevg';
const EMAILJS_TEMPLATE_ID = 'template_poopd18';

async function sendEmail(params) {
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const text = await res.text();
  if (res.status !== 200) throw new Error(`EmailJS ${res.status}: ${text}`);
  return text;
}

async function main() {
  const guestCred = await signInWithEmailAndPassword(auth, 'mphojunior6@gmail.com', 'Skii.1234');
  const uid = guestCred.user.uid;
  console.log(`[AUTH] Signed in as ${guestCred.user.email} (${uid})`);

  const userSnap = await getDoc(doc(db, 'users', uid));
  const userName = userSnap.exists() ? (userSnap.data().name || 'Skii') : 'Skii';
  console.log(`[USER] Name: ${userName}`);

  const reuseInvitationId = process.env.REUSE_INVITE_ID || '';
  let event = null;
  let invitationId = '';
  let inviteeEmail = 'mphojunior6@gmail.com';
  let inviteeName = 'Skii';
  let eventTitle = 'Resort Gala Event';
  let venueName = 'Azure Horizon Pavilion';
  let rawDate = '2026-09-15';

  if (reuseInvitationId) {
    const invSnap = await getDoc(doc(db, 'event_invitations', reuseInvitationId));
    if (!invSnap.exists()) throw new Error(`Reuse invitation not found: ${reuseInvitationId}`);
    const inv = invSnap.data();
    invitationId = reuseInvitationId;
    event = { id: inv.eventId };
    inviteeEmail = inv.inviteeEmail || inviteeEmail;
    inviteeName = inv.inviteeName || inviteeName;
    const evSnap = await getDoc(doc(db, 'event_bookings', inv.eventId));
    if (evSnap.exists()) {
      const ev = evSnap.data();
      eventTitle = ev.eventTitle || ev.title || eventTitle;
      venueName = ev.venueName || ev.venue || venueName;
      rawDate = ev.eventDate || ev.date || rawDate;
    }
    console.log(`[INVITE] Reusing existing invitation ${invitationId}`);
  } else {
    const eventsQ = query(collection(db, 'event_bookings'), where('guestId', '==', uid));
    const eventsSnap = await getDocs(eventsQ);
    for (const d of eventsSnap.docs) {
      const s = String(d.data().status || '');
      if (!['cancelled', 'rejected'].includes(s)) { event = { id: d.id, ...d.data() }; break; }
    }

    if (!event) {
      const eventRef = await addDoc(collection(db, 'event_bookings'), {
        guestId: uid,
        guestEmail: 'mphojunior6@gmail.com',
        guestName: userName,
        eventTitle: 'Resort Gala Event',
        venueName: 'Azure Horizon Pavilion',
        eventDate: '2026-09-15',
        status: 'confirmed',
        deposit: 2500,
        totalAmount: 12000,
        createdAt: serverTimestamp(),
      });
      event = { id: eventRef.id, eventTitle: 'Resort Gala Event', venueName: 'Azure Horizon Pavilion', eventDate: '2026-09-15' };
      console.log(`[EVENT] Created fallback event: ${event.id}`);
    }
    eventTitle = event.eventTitle || event.title || eventTitle;
    venueName = event.venueName || event.venue || venueName;
    rawDate = event.eventDate || event.date || rawDate;
    console.log(`[EVENT] Using event ${event.id}: ${eventTitle} @ ${venueName}`);

    const invitationRef = await addDoc(collection(db, 'event_invitations'), {
      eventId: event.id,
      guestId: uid,
      inviteeEmail,
      inviteeName,
      status: 'pending',
      sentAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
    invitationId = invitationRef.id;
    console.log(`[INVITE] Created invitation ${invitationId}`);
  }

  const payload = { eventId: event.id, invitationId, inviteeEmail, inviteeName };
  const sig = sha256Hex(SECRET + JSON.stringify(payload));
  const qrCode = JSON.stringify({ ...payload, sig });
  await updateDoc(doc(db, 'event_invitations', invitationId), { qrCode });
  console.log('[INVITE] Signed QR payload stored');

  const acceptedToken = sha256Hex(SECRET + invitationId + ':accepted');
  const declinedToken = sha256Hex(SECRET + invitationId + ':declined');
  const rsvpAccepted = `${RSVP_SITE_BASE}?invitationId=${encodeURIComponent(invitationId)}&eventId=${encodeURIComponent(event.id)}&response=accepted&token=${acceptedToken}`;
  const rsvpDeclined = `${RSVP_SITE_BASE}?invitationId=${encodeURIComponent(invitationId)}&eventId=${encodeURIComponent(event.id)}&response=declined&token=${declinedToken}`;
  console.log(`[RSVP] Accept link: ${rsvpAccepted}`);
  console.log(`[RSVP] Decline link: ${rsvpDeclined}`);

  const eventDate = new Date(rawDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(qrCode)}`;
  const message =
    `You are cordially invited to ${eventTitle} at ${venueName} on ${eventDate}. ` +
    `Please present your unique QR Pass upon entry:<br/><br/>` +
    `<img src="${qrImageUrl}" width="220" height="220" alt="QR Pass" style="border-radius:12px;border:1px solid #e2e8f0;max-width:220px;" />` +
    `<div style="margin:20px 0 8px;text-align:center;">` +
    `<a href="${rsvpAccepted}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:800;padding:12px 28px;border-radius:10px;margin:4px;font-size:14px;">✅ Accept Invitation</a>` +
    `<a href="${rsvpDeclined}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:800;padding:12px 28px;border-radius:10px;margin:4px;font-size:14px;">❌ Decline</a>` +
    `</div>` +
    `<p style="text-align:center;font-size:12px;color:#64748b;">Let the host know if you'll be there — you can respond from any device.</p>`;

  const payloadEmail = {
    service_id: EMAILJS_SERVICE_ID,
    template_id: EMAILJS_TEMPLATE_ID,
    user_id: EMAILJS_PUBLIC_KEY,
    accessToken: EMAILJS_PRIVATE_KEY,
    template_params: {
      to_email: inviteeEmail,
      email: inviteeEmail,
      name: inviteeName,
      event_title: eventTitle,
      venue_name: venueName,
      event_date: eventDate,
      qr_image_url: qrImageUrl,
      rsvp_accept_url: rsvpAccepted,
      rsvp_decline_url: rsvpDeclined,
      reference_id: `AZH-${invitationId.slice(0, 8).toUpperCase()}`,
      time: new Date().toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }),
    },
  };

  const result = await sendEmail(payloadEmail);
  console.log(`[EMAIL] Sent to ${inviteeEmail}: ${result}`);

  console.log('\n===== SUMMARY =====');
  console.log(`Invitation ID: ${invitationId}`);
  console.log(`Event ID: ${event.id}`);
  console.log(`Accepted URL:\n${rsvpAccepted}`);
  console.log(`\nDeclined URL:\n${rsvpDeclined}`);
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
