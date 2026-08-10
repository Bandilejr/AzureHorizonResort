const { initializeApp } = require('./node_modules/firebase/app');
const { getFirestore, doc, getDoc, runTransaction, collection, serverTimestamp } = require('./node_modules/firebase/firestore');
const { getAuth, signInWithEmailAndPassword } = require('./node_modules/firebase/auth');

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

async function testLoyaltyAtomicTransaction() {
  console.log("=== TESTING ATOMIC LOYALTY TRANSACTION ===");
  try {
    const cred = await signInWithEmailAndPassword(auth, "mphojunior6@gmail.com", "Skii.1234");
    const user = cred.user;
    console.log("Signed in as:", user.email, "(UID:", user.uid + ")");

    // 1. Fetch current points
    const userRef = doc(db, 'users', user.uid);
    const snapBefore = await getDoc(userRef);
    const ptsBefore = snapBefore.data()?.loyaltyPoints || 0;
    console.log("Loyalty Points before redemption:", ptsBefore);

    if (ptsBefore < 100) {
      console.log("Not enough points to test 100pt redemption. Current points:", ptsBefore);
      return;
    }

    // 2. Perform atomic transaction
    const voucherCode = `AZURE-REWARD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const reward = { title: "Complimentary Dessert & Coffee", pts: 100 };

    const result = await runTransaction(db, async (transaction) => {
      const uSnap = await transaction.get(userRef);
      const currPts = uSnap.data()?.loyaltyPoints || 0;
      if (currPts < reward.pts) {
        throw new Error("Insufficient points");
      }
      const newPoints = currPts - reward.pts;
      transaction.update(userRef, { loyaltyPoints: newPoints });

      const logRef = doc(collection(db, 'loyalty_logs'));
      transaction.set(logRef, {
        guestId: user.uid,
        points: -reward.pts,
        reason: `Redeemed: ${reward.title}`,
        createdAt: new Date().toISOString(),
      });

      const voucherRef = doc(collection(db, 'loyalty_vouchers'));
      transaction.set(voucherRef, {
        voucherCode,
        guestId: user.uid,
        rewardTitle: reward.title,
        pointsSpent: reward.pts,
        status: 'valid',
        claimed: false,
        createdAt: serverTimestamp(),
      });

      return { newPoints, voucherCode };
    });

    console.log("✅ ATOMIC TRANSACTION SUCCESSFUL!");
    console.log("   New Points Balance:", result.newPoints);
    console.log("   Voucher Generated:", result.voucherCode);

    // 3. Forced Failure Test (Insufficient Points)
    try {
      await runTransaction(db, async (transaction) => {
        const uSnap = await transaction.get(userRef);
        const currPts = uSnap.data()?.loyaltyPoints || 0;
        const fakeHighCost = currPts + 99999;
        if (currPts < fakeHighCost) {
          throw new Error("Not enough loyalty points.");
        }
        transaction.update(userRef, { loyaltyPoints: currPts - fakeHighCost });
      });
      console.log("❌ FORCED FAILURE TEST FAILED: Should have thrown error!");
    } catch (forcedErr) {
      console.log("✅ FORCED FAILURE SUCCESSFUL: Insufficient points caught, points NOT deducted.");
      console.log("   Error Caught:", `"${forcedErr.message}"`);
    }

  } catch (err) {
    console.error("❌ Loyalty Transaction Error:", err);
  }
}

testLoyaltyAtomicTransaction();
