// app/scripts/verify-audit-chain.mjs
//
// Verifies the integrity logic behind the activity journal. Runs directly on
// Node 22.6+/24 (native TypeScript type-stripping), so it needs no test runner
// and no new dependencies — auditChain.ts has only a type-only import, which is
// erased before the module is evaluated.
//
//   npm run test:audit
//
// Extend this file as the project's first real test harness; vitest would be the
// natural next step, but a single dependency-free script is enough to keep the
// tamper-evidence claims honest until then.
import {
  canonical, computeEntryHash, verifyAuditChain,
} from '../src/utils/auditChain.ts';

let pass = 0;
let fail = 0;

function ok(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${extra ? ` ${extra}` : ''}`);
  }
}

const entryAt = (i, over = {}) => ({
  action: 'donation_certified',
  entity: 'donation_batches',
  entityId: `doc${i}`,
  actorId: 'user-1',
  actorRole: 'kitchen_manager',
  beforeStatus: null,
  afterStatus: 'safety_verified_unassigned',
  summary: `Batch DON-TEST${i} certified`,
  metadata: { batchId: `DON-TEST${i}`, portionCount: 10, allergens: ['nuts', 'dairy'] },
  clientAt: `2026-01-0${i + 1}T09:00:00.000Z`,
  ...over,
});

/** Builds a correctly linked chain of n entries, then applies an optional tamper. */
async function buildChain(n, tamper) {
  const entries = [];
  let prevHash = null;
  for (let i = 0; i < n; i++) {
    const body = entryAt(i);
    const hash = await computeEntryHash(body, prevHash);
    entries.push({ id: `entry-${i}`, ...body, prevHash, hash, occurredAt: null });
    prevHash = hash;
  }
  return tamper ? tamper(entries) : entries;
}

console.log('\nActivity journal — hash chain integrity\n');

ok('canonical output ignores key insertion order',
  canonical({ b: 1, a: { d: 2, c: 3 } }) === canonical({ a: { c: 3, d: 2 }, b: 1 }));

ok('canonical output ignores nested key order',
  canonical({ a: { z: [{ y: 1, x: 2 }] } }) === canonical({ a: { z: [{ x: 2, y: 1 }] } }));

ok('canonical output still respects array order',
  canonical({ a: [1, 2] }) !== canonical({ a: [2, 1] }));

const good = await buildChain(3);

const intact = await verifyAuditChain(good);
ok('an intact chain verifies', intact.ok && intact.checked === 3, JSON.stringify(intact));

ok('verification does not depend on the order entries arrive in',
  (await verifyAuditChain([good[2], good[0], good[1]])).ok);

ok('an edited summary is detected',
  !(await verifyAuditChain(await buildChain(3, (e) => {
    e[1].summary = 'Batch DON-TEST1 certified (redacted)';
    return e;
  }))).ok);

ok('an edited status is detected',
  !(await verifyAuditChain(await buildChain(3, (e) => {
    e[2].afterStatus = 'collected_completed';
    return e;
  }))).ok);

ok('an edited actor is detected',
  !(await verifyAuditChain(await buildChain(3, (e) => {
    e[1].actorId = 'someone-else';
    return e;
  }))).ok);

ok('a deletion from the middle of the log is detected',
  !(await verifyAuditChain([good[0], good[2]])).ok);

ok('a broken prevHash link is detected',
  !(await verifyAuditChain(await buildChain(3, (e) => {
    e[1].prevHash = null;
    return e;
  }))).ok);

ok('a forged digest is detected',
  !(await verifyAuditChain(await buildChain(2, (e) => {
    e[1].hash = 'f'.repeat(64);
    return e;
  }))).ok);

ok('a missing digest is reported explicitly',
  (await verifyAuditChain(await buildChain(2, (e) => {
    e[1].hash = null;
    return e;
  }))).reason?.includes('no digest'));

ok('an empty journal is trivially valid', (await verifyAuditChain([])).ok);

// Documented limitation, asserted so it cannot regress into a false claim.
ok('tail truncation is NOT detectable (known limitation)',
  (await verifyAuditChain(good.slice(0, 2))).ok);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
