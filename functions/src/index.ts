import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import * as dotenv from "dotenv";

// Load environment variables from .env file (for local development)
dotenv.config();

// Initialize Firebase Admin
admin.initializeApp();

const db = admin.firestore();

// Secret keys (from .env for local, Cloud Secret Manager for production)
const JWT_PRIVATE_KEY = process.env.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n') || "";
const LOYALTY_HMAC_SECRET = process.env.LOYALTY_HMAC_SECRET || "";
const INVITATION_SIGNING_KEY = process.env.INVITATION_SIGNING_KEY || "";

// Log warning if secrets are missing (dev only)
if (process.env.NODE_ENV !== 'production') {
  if (!JWT_PRIVATE_KEY) console.warn('WARNING: JWT_PRIVATE_KEY not set');
  if (!LOYALTY_HMAC_SECRET) console.warn('WARNING: LOYALTY_HMAC_SECRET not set');
  if (!INVITATION_SIGNING_KEY) console.warn('WARNING: INVITATION_SIGNING_KEY not set');
}

// Export all functions
export { onUserCreate } from "./auth/onUserCreate";
export { generateRoomCredential } from "./events/generateRoomCredential";
export { generateInvitationQR } from "./events/generateInvitationQR";
export { validateAttendeeQR } from "./events/validateAttendeeQR";
export { generateLoyaltyQR } from "./loyalty/generateLoyaltyQR";
export { validateLoyaltyQR } from "./loyalty/validateLoyaltyQR";
export { processDamageClaim } from "./damages/processDamageClaim";
export { processRefund } from "./refunds/processRefund";
export { recordAttendancePunch } from "./attendance/recordAttendancePunch";