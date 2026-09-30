# Firestore rules tests (LOCAL EMULATOR ONLY)

These tests **never** touch production and **never** use a service-account key.
They run against the local Firestore emulator with `projectId: demo-fixedfunding`.

## Prerequisites
- **Java 11+ (JDK)** — required by the Firestore emulator (`java -version`).
- **firebase-tools** — `npm i -g firebase-tools` (`firebase --version`).
- **Node 18+**.

## Run (from the repo root: `my-mobile-app/`)
```powershell
cd rules-tests
npm install
cd ..
firebase emulators:exec --only firestore --project demo-fixedfunding "npm --prefix rules-tests test"
```
`emulators:exec` starts the emulator, runs the tests, then shuts it down. The
`demo-fixedfunding` project id is a throwaway demo id — no real Firebase project
is contacted.

## What the tests assert
- **Legitimate flows** (allowed): staff file own leave; manager approves another
  staff's leave; collector logs a donation.
- **Self-approval blocked** (denied): staff approving own leave; manager
  verifying own attendance exception.
- **[HOLE] privilege escalation** — these assert the *secure* expectation, so
  **a FAILURE reveals a current gap**:
  - self-creating `users/{uid}` with `role: 'admin'`;
  - self-setting `npoId`;
  - a guest inflating their own `loyaltyPoints`;
  - mutating another user's `event_bookings` doc.

A failing `[HOLE]` test is expected against the current rules and documents the
fix needed (see the proposed diff in the final report). Do not deploy rules
until you approve the changes.
