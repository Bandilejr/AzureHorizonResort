import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * Triggered when a new user is created in Firebase Auth.
 * Creates a user profile document in Firestore with default role.
 */
export const onUserCreate = functions.auth.user().onCreate(async (user) => {
  const userData = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || "",
    role: "guest", // Default role: guest, staff, admin
    subRole: null, // For staff: event_manager, front_desk, maintenance, catering_staff, housekeeping
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    loyaltyPoints: 0,
    loyaltyTier: "bronze",
    phoneNumber: user.phoneNumber || "",
    photoURL: user.photoURL || "",
    preferences: {
      language: "en", // en, zu, af
      notifications: true,
    },
  };

  try {
    await db.collection("users").doc(user.uid).set(userData);
    console.log(`Created user profile for ${user.uid}`);
  } catch (error) {
    console.error("Error creating user profile:", error);
    throw error;
  }
});