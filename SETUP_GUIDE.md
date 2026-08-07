# Azure Horizon Resort - Setup Guide

## Overview
This guide covers the setup of Firebase Extensions, SendGrid email, Cloud Functions, and local development for the Azure Horizon Resort mobile app.

---

## 1. Prerequisites

- Node.js 20+
- Firebase CLI (`npm install -g firebase-tools`)
- Expo CLI (`npm install -g expo-cli`)
- EAS CLI (`npm install -g eas-cli`) - for APK builds
- Firebase project: `hotel-management-system-c3526`

---

## 2. Firebase Extensions: SendGrid Email Setup

### 2.1 Create SendGrid Account
1. Go to [SendGrid](https://sendgrid.com/) and create a free account (100 emails/day)
2. Verify your sender identity:
   - **Option A**: Single Sender Verification (quick, for testing)
   - **Option B**: Domain Authentication (recommended for production)
3. Create API Key:
   - Settings → API Keys → Create API Key
   - Name: "Firebase Extensions Email"
   - Permissions: "Mail Send" → Full Access
   - **Copy and save the API key** (shown only once)

### 2.2 Install Firebase Extension
```bash
# Login to Firebase
firebase login

# Select your project
firebase use hotel-management-system-c3526

# Install the email extension
firebase ext:install firestore-send-email
```

### 2.3 Configure Extension (in Firebase Console)
1. Go to Firebase Console → Extensions → `firestore-send-email`
2. Click "Configure"
3. Settings:
   - **SMTP URI**: `smtp://apikey:YOUR_SENDGRID_API_KEY@smtp.sendgrid.net:587`
   - **Email collection**: `event_invitations`
   - **Reply-to address**: `noreply@yourdomain.com` (or verified sender)
   - **Users collection**: `users`
   - **Template collection**: `email_templates` (optional, for custom templates)

### 2.4 Create Email Template (Optional)
In Firestore, create collection `email_templates` with document `event_invitation`:
```json
{
  "subject": "You're invited to {{eventName}} at Azure Horizon Resort!",
  "html": "<p>Dear {{inviteeName}},</p><p>You've been invited to <strong>{{eventName}}</strong> on {{date}} at Azure Horizon Resort.</p><p><img src=\"{{qrCodeUrl}}\" alt=\"Event QR Code\" style=\"max-width: 200px;\"/></p><p>Please present this QR code at check-in.</p><p>Best regards,<br/>Azure Horizon Resort Team</p>",
  "text": "Dear {{inviteeName}},\n\nYou've been invited to {{eventName}} on {{date}} at Azure Horizon Resort.\n\nPlease present the QR code at check-in.\n\nBest regards,\nAzure Horizon Resort Team"
}
```

---

## 3. Cloud Functions Setup

### 3.1 Install Dependencies
```bash
cd functions
npm install
```

### 3.2 Set Secrets (Cloud Secret Manager)
```bash
# Generate RSA private key for JWT signing
openssl genrsa -out private_key.pem 2048
openssl rsa -in private_key.pem -pubout -out public_key.pem

# Set secrets (run from functions directory)
firebase functions:secrets:set JWT_PRIVATE_KEY="$(cat private_key.pem)"
firebase functions:secrets:set LOYALTY_HMAC_SECRET="$(openssl rand -hex 32)"
firebase functions:secrets:set INVITATION_SIGNING_KEY="$(openssl rand -hex 32)"
firebase functions:secrets:set SENDGRID_API_KEY="YOUR_SENDGRID_API_KEY"
```

### 3.3 Local Development with Emulators
```bash
# Start emulators
firebase emulators:start --only functions,firestore,auth

# In another terminal, build functions
npm run build
```

### 3.4 Deploy Functions
```bash
firebase deploy --only functions
```

---

## 4. Mobile App Setup

### 4.1 Install Dependencies
```bash
cd ../my-mobile-app
npm install
```

### 4.2 Configure Firebase (Already Done)
The `firebase-services.ts` uses the project config. Ensure it matches your Firebase project.

### 4.3 Run in Expo Go
```bash
npx expo start
```
- Scan QR code with Expo Go app (iOS) or Android emulator
- **Note**: NFC and biometrics require development build (not Expo Go)

### 4.4 Development Build (for NFC/Biometric Testing)
```bash
# Install EAS CLI
npm install -g eas-cli

# Login
eas login

# Configure
eas build:configure

# Build for Android (APK)
eas build --platform android --profile development

# Build for iOS (requires Apple Developer account)
eas build --platform ios --profile development
```

---

## 5. Firestore Security Rules

Deploy the rules:
```bash
firebase deploy --only firestore:rules
```
Rules file: `firestore.rules` (in project root)

---

## 6. Localization Setup (English, Zulu, Afrikaans)

### 6.1 Translation Files Structure
Create `src/i18n/` with:
```
src/i18n/
├── en.json
├── zu.json
├── af.json
└── index.ts
```

### 6.2 Example Translation Keys
```json
// en.json
{
  "welcome": "Welcome to Paradise",
  "signIn": "Sign In to Your Stay",
  "exploreResort": "Explore Resort as Visitor",
  "digitalKey": "Digital Room Key",
  "tapToUnlock": "Tap to Unlock Door",
  "loyaltyPoints": "Loyalty Points",
  "redeemRewards": "Redeem Rewards",
  "eventInvitations": "Event Invitations",
  "sendInvitations": "Send Invitations",
  "liveComplaint": "File Live Complaint",
  "eventFeedback": "Event Feedback"
}

// zu.json
{
  "welcome": "Wamukelekle eParadise",
  "signIn": "Ngena kuLindawo Yakho",
  "exploreResort": "Hlola iResort njengomakhelwane",
  "digitalKey": "Iqhosha Lengumbi Elidijithali",
  "tapToUnlock": "Thinta ukuvula umnyango",
  "loyaltyPoints": "Amapoyinti Obuhlobo",
  "redeemRewards": "Yenza Imisebenzi",
  "eventInvitations": "Imemulo Yezivakashi",
  "sendInvitations": "Thumela Imemulo",
  "liveComplaint": "Beka Isikhalo Esiphilayo",
  "eventFeedback": "Impendulo Yesivakashi"
}

// af.json
{
  "welcome": "Welkom by Paradise",
  "signIn": "Teken In vir Jou Verblyf",
  "exploreResort": "Verken die Resort as Gaste",
  "digitalKey": "Digitale Kamer Sleutel",
  "tapToUnlock": "Tik om te Ontgrendel",
  "loyaltyPoints": "Loyaliteitspunte",
  "redeemRewards": "Inlos Belonings",
  "eventInvitations": "Gebeurtenisuitnodigings",
  "sendInvitations": "Stuur Uitnodigings",
  "liveComplaint": "Dien 'n Lewende Klagte In",
  "eventFeedback": "Gebeurtenisterugvoer"
}
```

### 6.3 Using Translations
```typescript
import { useTranslation } from '../i18n';

const { t } = useTranslation();
// t('welcome') returns translated string based on user preferences
```

---

## 7. Testing Checklist

### 7.1 Physical Device Testing (Required for NFC/Biometrics)
- [ ] Android: NFC HCE room key transmission
- [ ] Android: Fingerprint authentication
- [ ] iOS: Face ID authentication
- [ ] iOS: NFC simulation fallback
- [ ] Camera: QR code scanning (loyalty, attendee, invitations)
- [ ] Offline: Queue actions → reconnect → sync
- [ ] Email: SendGrid invitation delivery

### 7.2 Role Testing
- [ ] Guest: Portal, Events, Dining, Spa, Loyalty, Profile
- [ ] Staff (event_manager): All staff tabs
- [ ] Staff (front_desk): Check-in, Attendee, Complaints
- [ ] Staff (maintenance): Inspections, Damages, Complaints
- [ ] Admin: Refund Management

---

## 8. Environment Variables

### 8.1 Functions (.env.example)
```bash
# Cloud Functions secrets (set via firebase functions:secrets:set)
JWT_PRIVATE_KEY=
LOYALTY_HMAC_SECRET=
INVITATION_SIGNING_KEY=
SENDGRID_API_KEY=
```

### 8.2 Mobile App
No additional env vars needed - Firebase config is in `firebase-services.ts`

---

## 9. Useful Commands

```bash
# View function logs
firebase functions:log

# Test function locally
firebase functions:shell

# Deploy specific function
firebase deploy --only functions:generateRoomCredential

# View Firestore data
firebase firestore:databases:list

# Export/Import Firestore data
firebase firestore:export gs://your-bucket
firebase firestore:import gs://your-bucket/export-folder
```

---

## 10. Troubleshooting

### NFC Not Working (Android)
- Ensure device has NFC hardware
- Check NFC is enabled in Settings
- Try development build (not Expo Go)

### Biometric Not Prompting
- Ensure device has fingerprint/Face ID enrolled
- Check `expo-local-authentication` permissions in app.json

### Email Not Sending
- Verify SendGrid API key in Firebase Extension config
- Check sender identity is verified in SendGrid
- Check Firebase Extension logs in Console

### Offline Queue Not Syncing
- Check NetInfo permissions
- Verify AsyncStorage is working
- Check network connectivity

---

## 11. Next Steps

1. **Complete Phase 1**: Role-based tab navigation
2. **Phase 2**: Security core (NFC, biometrics, loyalty QR)
3. **Phase 3**: Guest features (invitations, feedback, complaints)
4. **Phase 4**: Staff features (check-ins, inspections, damages)
5. **Phase 5**: Admin (refunds) + Polish

---

**Support**: For issues, check Firebase Console logs, Expo docs, or create GitHub issue.