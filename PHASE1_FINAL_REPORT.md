# Phase 1 Final Report — Workforce Identity, Authentication, Device & Attendance Foundation

**Date:** 2026-09-24  
**SRS:** GRP 11 Fixed Funding SRS (UC34–UC45)  
**Status:** Code complete + build green + rules/indexes deployed + migration idempotent. **Device runtime evidence BLOCKED** (no ADB device connected).

---

## A. Scope delivered

Phase 1 foundations for role-separated attendance:

| Area | Delivered |
|------|-----------|
| Identity | UID-only (`getWorkforceIdentity` / `requireWorkforceIdentity`); no name picker |
| Auth | `AuthContext` workforce fields; ordered signOut teardown (listeners removed before `firebaseSignOut`) |
| Device | Stable device id (SecureStore + UUID); one ACTIVE device/employee; reset request → admin approve |
| Attendance | Session state machine; clock window 15min before → 30min after; auto-close scheduled end + 2h |
| Geofence | 4-check: `distance ≤ radius AND accuracy ≤ maxAge AND age ≤ maxAge AND (distance − accuracy) ≤ radius`; off-site BLOCKED |
| Route guard | `RouteGuard` on `(staff)/(admin)/(kitchen)/(npo)` group layouts |
| Notifications | `userId` kept; `readAt` + `targetRoute` written; uid-preferred resolution |
| AI | Gemini removed from client bundles; manual fallback (`GEMINI_UNAVAILABLE_MESSAGE`) |
| Migration | Dry-run/idempotent/no-delete; worksite + attendance_config seed |

**Decisions locked (Phase 0):** off-site BLOCKED; auto-close + exception; keep `userId`; AI option B (no Blaze); TZ `Africa/Johannesburg`; one active device; 4-check geofence; uid always from `auth.currentUser`; migration non-destructive.

---

## B. SRS mapping (UC34–UC45)

| UC | Phase 1 coverage |
|----|------------------|
| UC34 Clock-in | `clockIn` 13-step validation; identity block; worksite + window + distance UI |
| UC35 Clock-out | `clockOut`; pairing rules |
| UC36 Geofence | `evaluateGeofence` 4-check; worksite radius; blocked reasons |
| UC37 Attendance window | `DEFAULT_ATTENDANCE_CONFIG` 15/30/120min |
| UC38 Auto-close | scheduled end + 2h → `auto_closed` + exception (never silent) |
| UC39 Device enrollment | `ensureDeviceEnrollment` one-active-device |
| UC40 Device reset | employee request → admin approve → old revoked → new register |
| UC41 Worksites | `listActiveWorksites` / `upsertWorksite` |
| UC42 Role routing | `role-home.ts` role wins over npoId; `RouteGuard` |
| UC43 Notifications | `userId` + `readAt` + `targetRoute`; no email-key drops |
| UC44 AI assist | Disabled client-side with explicit unavailable message |
| UC45 Identity | No name picker anywhere; identity always `auth.currentUser.uid` |

---

## C. Implementation artifacts (mobile)

| Path | Purpose |
|------|---------|
| `src/types/workforce.ts` | Worksite, AttendanceConfig, Device*, Geofence*, AttendanceSession |
| `src/services/identity.ts` | UID-only identity |
| `src/services/worksites.ts` | Worksite CRUD + geofence + attendance config |
| `src/services/device.ts` | Device id, enrollment, reset |
| `src/services/attendance-sessions.ts` | Session state machine, clockIn/Out, auto-close |
| `src/services/attendance.ts` | GPS throws (no campus fallback); `blockOffsite` |
| `src/services/firebase-services.ts` | `recordAttendancePunch` uid-based + worksite geofence |
| `src/services/offline-queue.ts` | Replay never spoofs identity/deviceMatch |
| `src/context/AuthContext.tsx` | Workforce profile + ordered signOut |
| `src/components/clock-in-panel.tsx` | Identity block; device reset request |
| `src/components/RouteGuard.tsx` | Auth + role-area guard |
| `src/utils/role-home.ts` | Role-before-npoId precedence |
| `src/app/(staff\|admin\|kitchen\|npo)/_layout.tsx` | RouteGuard wrappers |
| `src/app/index.tsx` | Staff A/B demo chips |
| `src/services/gemini-food.ts` + donation-log | AI disabled |
| `scripts/migrate-workforce.js` | Dry-run/idempotent migration |
| `scripts/seed-worksites.js` | Worksites + attendance_config |
| `scripts/seed-staff-accounts.js` | Staff A/B auth + profile |
| `firestore.rules` / `firestore.indexes.json` | Phase 1 security + composite indexes |

**Web:** `increment2-services.ts` (uid preference, `readAt`), `DamageClaimResolutionPage.tsx` (`targetRoute`/`readAt`), `GuestExperience.tsx` (AI off), `.env` Gemini key removed.

---

## D. Test accounts

| Account | Email | Password | Notes |
|---------|-------|----------|-------|
| Staff A | staffa@azurehorizon.demo | Staff.1234 | FULL_TIME, EMP-2001, front_desk, worksite dut_ritson |
| Staff B | staffb@azurehorizon.demo | Staff.1234 | PART_TIME, EMP-2002, maintenance, worksite dut_ritson |

**Verified via Admin SDK (2026-09-24):**

- Staff A UID `ZXZLKoM1CtaU0aNbluGo1bpyj362` — `users/{uid}` exists with employmentType, employeeId, department, position, skills, worksiteId, active
- Staff B UID `E5TbTkRRRAPphH7xpAD7UXdmqVB2` — same shape

---

## E. Migration / seed evidence

| Run | Command | Result |
|-----|---------|--------|
| Dry-run | `node scripts/migrate-workforce.js` (default) | planned=55 skipped=44 apply=false (first) |
| Apply | `--apply` | planned=55 skipped=44 apply=true |
| Worksites | `node scripts/seed-worksites.js` | Seeded `worksites/dut_ritson` + `settings/attendance_config` |
| Staff seed | `node scripts/seed-staff-accounts.js` | SEED_EXIT=0; both users ensured |
| **Idempotence** | re-run dry-run | **planned=0 skipped=103 apply=false** |

Migration is non-destructive (no deletes). Re-runs are safe.

---

## F. Firestore rules & indexes

**Rules deployed** (`firebase deploy --only firestore:rules`) — compile OK (warnings only: unused `isFrontDeskAny`, `isMaintenanceAny`, `eventId`):

- New: `worksites`, `devices`, `deviceResetRequests`, `attendance_sessions` (employee-own + manager; field locks), `attendance_config`
- `users` update: non-admin cannot self-edit `role, subRole, employmentType, active, employeeId, deviceBinding, department, position, skills, worksiteId`

**Indexes deployed** after removing invalid single-field entries (`deviceResetRequests(status)`, `worksites(active)` — automatic on Firestore):

```
attendance_sessions employeeUid,shiftDate,status
attendance_sessions employeeUid,status
devices employeeUid,status
deviceResetRequests employeeUid,status
```

Deploy: `firestore:deploying indexes...` → **deployed successfully**.  
Note: project had 2 extra indexes + 1 field override not in file (not deleted; no `--force`).

---

## G. Build / typecheck

| Check | Result |
|-------|--------|
| Mobile `tsc --noEmit` | **TSC_OK (0 errors)** |
| Android release build | **BUILD SUCCESSFUL in 25m 7s** (log: `build-phase1.log`) |
| APK | `android/app/build/outputs/apk/release/app-release.apk` — 181,446,754 bytes @ 17:36:59 |
| Gemini in JS bundle | **NOT present** (`GEMINI_KEY_NOT_IN_BUNDLE`, `GEMINI_ENV_NOT_FOUND`) |
| Expo env export | Only `EXPO_PUBLIC_QR_SIGNING_SECRET` (Gemini key not exported) |

**ADB / install:** `adb devices` → **empty** (no device attached). Install, launch, logcat **not executed**.

---

## H. Runtime evidence checklist (SRS §14) — BLOCKED

| # | Scenario | Status |
|---|----------|--------|
| 1 | Staff A clock-in identity block (no picker) | **PENDING device** |
| 2 | Staff B clock-in | **PENDING device** |
| 3 | Off-site punch blocked message | **PENDING device** |
| 4 | GPS-failure error (no campus fallback) | **PENDING device** |
| 5 | Route-guard redirect (guest → staff route) | **PENDING device** |
| 6 | SignOut teardown without permission-denied | **PENDING device** |
| 7 | AI-unavailable message | **PENDING device** (code verified) |
| 8 | Dual-device reset flow | **PENDING device** |
| 9 | Migration idempotence | **DONE** (planned=0) |
| 10 | Staff A/B auth + profile docs | **DONE** (Admin SDK) |
| 11 | Rules/indexes live | **DONE** |
| 12 | Gemini absent from bundle | **DONE** |

**To unblock:** reconnect device `c1984eb7` (USB debugging), then:

```powershell
adb -s c1984eb7 install -r "D:\Projects\UniversityProject\UniversityProject\my-mobile-app\android\app\build\outputs\apk\release\app-release.apk"
adb -s c1984eb7 shell am start -n com.justskii.Azure/.MainActivity
adb -s c1984eb7 logcat -d | findstr /i "FATAL AndroidRuntime"
```

Then walk H rows 1–8 on device and attach screenshots/logcat to this report.

---

## I. Security posture (Phase 1)

**Improved:**

- Identity never taken from client-supplied name/email for punch
- Self role/employment elevation blocked in rules
- Off-site punches blocked (decision #1)
- Offline replay cannot fabricate deviceMatchPassed or spoofed identity
- Gemini API key removed from mobile + web bundles
- One active device per employee; reset requires admin approval
- Route guards on role group layouts

**Accepted residual risk (Spark plan):** no server-side Cloud Functions for attendance (decision #4 option B); geofence evaluated client-side with signed claims/UI but not cryptographically server-enforced (documented).

---

## J. Remaining defects (must not hide)

| ID | Defect | Severity | Location | Notes |
|----|--------|----------|----------|-------|
| RD-1 | **`EXPO_PUBLIC_QR_SIGNING_SECRET` client-exposed** | High | mobile `.env` + web `.env` — value `f8ae01e3…676e9` | Rotated once; still in EXPO_PUBLIC_/VITE_ (bundled). Needs server signing or CF. |
| RD-2 | **EmailJS keys client-side** | Medium | `AdminRefundReview.tsx:78-80`, `MyEventBookings.tsx:126-128`, `FrontDeskDashboard.tsx:103-105` | Public keys + service/template IDs hardcoded; EmailJS is designed for browser but service can send arbitrary templates. |
| RD-3 | **Dead CF `recordAttendancePunch`** | Medium | `my-mobile-app/functions/src/attendance/recordAttendancePunch.ts` (exported in `functions/src/index.ts:35`) | Conflicts with decision #1: CF records off-site with `withinRadius:false` (flag, not block) and uses **email-keyed** `users/{email}`. Not deployed on Spark; if ever deployed would bypass Phase 1 rules path. **Do not deploy as-is.** |
| RD-4 | **RTDB orders rules console-only** | High | No `database.rules.json` in repo; RTDB used by web (`firebase-services`, `MyOrders`, `Restaurant`) + mobile (`order-queue`, `dining`, `my-orders`) | Rules exist only in Firebase console; not version-controlled; not redeployable. |
| RD-5 | **Web `tsc` baseline failures** | Medium | Pre-date remediation (documented earlier) | Not a Phase 1 gate; still broken for full type safety. |
| RD-6 | **`firebase-admin` installed `--no-save`** | Low | Not in `my-mobile-app/package.json` | Scripts (`migrate-workforce`, `seed-staff-accounts`, verification) will fail after clean `npm install` until `firebase-admin` is added to devDependencies. |
| RD-7 | **Device runtime evidence missing** | High (process) | ADB empty | Phase 1 not fully signed off per SRS §14 until H rows 1–8 captured. |
| RD-8 | **Paystack public key placeholder** | Low | Multiple web components | Falls back to `pk_test_placeholder_key_please_replace` if env missing (out of Phase 1 scope; noted). |
| RD-9 | **Firestore project has extra indexes/field override not in file** | Info | Deploy warning | Not deleted (no `--force`); may confuse future deploys. |

---

## K. How to re-verify (commands)

```powershell
# Typecheck
& "D:\Projects\UniversityProject\UniversityProject\my-mobile-app\node_modules\.bin\tsc.cmd" --noEmit --project "D:\Projects\UniversityProject\UniversityProject\my-mobile-app\tsconfig.json"

# Migration idempotence
node "D:\Projects\UniversityProject\UniversityProject\my-mobile-app\scripts\migrate-workforce.js"
# expect: planned=0 skipped=103

# Staff seed (idempotent)
node "D:\Projects\UniversityProject\UniversityProject\my-mobile-app\scripts\seed-staff-accounts.js"

# Rules + indexes
firebase deploy --only firestore:rules,firestore:indexes --project hotel-management-system-c3526 --config "D:\Projects\UniversityProject\UniversityProject\my-mobile-app\firebase.json"

# Build (from my-mobile-app\android)
gradlew assembleRelease -x :expo-log-box:verifyReleaseResources --console=plain
```

---

## L. Sign-off gate

| Gate | Met? |
|------|------|
| Code + rules + indexes deployed | **YES** |
| Mobile typecheck 0 errors | **YES** |
| Release APK built | **YES** |
| Migration idempotent | **YES** |
| Staff A/B seeded & verified | **YES** |
| Gemini not in bundle | **YES** |
| Device install + §14 runtime scenarios | **NO — device offline** |
| Remaining defects listed | **YES (Section J)** |

**Phase 1 is code-complete and deploy-complete; it is NOT runtime-signed-off until Section H is captured on device.**

---

## M. Immediate next actions

1. **Connect device** `c1984eb7` → install APK → launch → logcat (no FATAL).
2. Execute H rows 1–8; append evidence here.
3. Add `firebase-admin` to `devDependencies` (RD-6).
4. Stop exporting QR secret via `EXPO_PUBLIC_`/`VITE_` or move QR verify server-side (RD-1).
5. Add RTDB `database.rules.json` to repo and deploy (RD-4).
6. Remove or rewrite dead CF `recordAttendancePunch` to match blocked-off-site + uid keys (RD-3); never deploy current body.
7. Replace hardcoded EmailJS credentials with env vars (RD-2).
