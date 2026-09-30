/**
 * No-Firebase unit tests for src/utils/datetime-input.ts.
 *
 * Proves that the NEW picker conversions produce EXACTLY the same stored values
 * as the OLD text-input paths, for every write in the Layer-8 register,
 * including the logistics `new Date(`${date}T${time}`).toISOString()` case and
 * local-timezone (SAST/UTC+2) day-boundary behaviour.
 *
 * Runs with the repo's installed TypeScript (no extra deps):
 *   node scripts/test-datetime-helpers.js
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

// Transpile .ts on require.
require.extensions['.ts'] = function (mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  mod._compile(js, filename);
};

// Map the `@/` alias to src/.
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request.startsWith('@/')) request = path.join(SRC, request.slice(2));
  return origResolve.call(this, request, parent, ...rest);
};

const h = require('../src/utils/datetime-input');
const { localDateISO } = require('../src/utils/dates');

let PASS = 0, FAIL = 0;
function check(name, cond, detail) {
  if (cond) { PASS++; console.log(`  \u2713 ${name}`); }
  else { FAIL++; console.log(`  \u2717 ${name}${detail ? ` \u2014 ${detail}` : ''}`); }
}

console.log(`TZ = ${Intl.DateTimeFormat().resolvedOptions().timeZone} (offset ${-new Date().getTimezoneOffset() / 60}h)\n`);

// ── 1. Calendar date: picker Date -> 'YYYY-MM-DD' ──────────────────────────
console.log('[dateToStored] picker date -> stored YYYY-MM-DD');
check('midnight local', h.dateToStored(new Date(2026, 9, 15)) === '2026-10-15');
check('end of day local', h.dateToStored(new Date(2026, 9, 15, 23, 59)) === '2026-10-15');
check('month boundary', h.dateToStored(new Date(2026, 0, 31)) === '2026-01-31');
check('matches localDateISO', h.dateToStored(new Date(2026, 11, 1, 0, 30)) === localDateISO(new Date(2026, 11, 1, 0, 30)));
// Timezone proof: the naive UTC slice is WRONG for UTC+2 between 00:00-02:00.
{
  const d = new Date(2026, 9, 15, 0, 30);
  const offsetMin = -new Date().getTimezoneOffset();
  const naive = d.toISOString().slice(0, 10);
  check('local-safe date near midnight', h.dateToStored(d) === '2026-10-15', `naive=${naive}, offset=${offsetMin}m`);
  if (offsetMin >= 60) {
    check('naive UTC slice would be off-by-one (documents the TZ fix)', naive === '2026-10-14', `naive=${naive}`);
  }
}

// ── 2. Clock time: picker Date -> 'HH:mm' ──────────────────────────────────
console.log('\n[timeToStored] picker time -> stored HH:mm');
check('18:00', h.timeToStored(new Date(2026, 9, 15, 18, 0)) === '18:00');
check('zero-padded 08:05', h.timeToStored(new Date(2026, 9, 15, 8, 5)) === '08:05');
check('23:59', h.timeToStored(new Date(2026, 9, 15, 23, 59)) === '23:59');
check('00:00', h.timeToStored(new Date(2026, 9, 15, 0, 0)) === '00:00');

// ── 3. Collection window: NEW picker vs OLD text input (logistics) ─────────
console.log('\n[localWindowToIso] NEW picker vs OLD text input (logistics schedule)');
const windows = [
  ['2026-10-15', '08:00'], ['2026-10-15', '18:00'], ['2026-10-15', '00:00'],
  ['2026-10-15', '23:59'], ['2026-01-01', '10:00'], ['2026-12-31', '14:30'],
];
for (const [date, time] of windows) {
  const legacy = h.legacyTextToIso(`${date}T${time}`);       // old: new Date(form.start).toISOString()
  const modern = h.localWindowToIso(date, time);             // new: same, from pickers
  check(`${date} ${time} -> identical ISO`, legacy === modern, `${legacy} vs ${modern}`);
  const back = new Date(modern);
  check(`${date} ${time} -> local round-trip`, h.dateToStored(back) === date && h.timeToStored(back) === time);
}

// ── 4. Pre-fill from stored ISO (logistics reschedule) ─────────────────────
console.log('\n[isoToStored*] stored ISO -> picker seed (reschedule pre-fill)');
{
  const iso = new Date('2026-10-15T18:00').toISOString(); // local 18:00 on the test host TZ
  check('date pre-fill round-trips', h.isoToStoredDate(iso) === '2026-10-15');
  check('time pre-fill round-trips', h.isoToStoredTime(iso) === '18:00');
  check('invalid ISO -> empty', h.isoToStoredDate('nonsense') === '' && h.isoToStoredTime(null) === '');
}

// ── 5. Availability / leave / open-shift / roster formats ─────────────────
console.log('\n[availability/leave/open-shift/roster] date+time formats');
check('weekStart stays YYYY-MM-DD', h.dateToStored(new Date(2026, 9, 13)) === '2026-10-13');
check('leave start/end stay YYYY-MM-DD', h.dateToStored(new Date(2026, 9, 20)) === '2026-10-20' && h.dateToStored(new Date(2026, 9, 24)) === '2026-10-24');
check('roster shift date stays YYYY-MM-DD', h.dateToStored(new Date(2026, 9, 16)) === '2026-10-16');
check('roster start/end stay HH:mm', h.timeToStored(new Date(2026, 9, 16, 8, 0)) === '08:00' && h.timeToStored(new Date(2026, 9, 16, 16, 0)) === '16:00');
check('open-shift date/time stay YYYY-MM-DD / HH:mm', h.dateToStored(new Date(2026, 9, 17)) === '2026-10-17' && h.timeToStored(new Date(2026, 9, 17, 9, 30)) === '09:30');

// ── 6. Timestamps (donation prepared/expiry) ──────────────────────────────
console.log('\n[dateTimeToStoredIso] donation prepared/expiry timestamps');
{
  const d = new Date(2026, 9, 15, 12, 0);
  check('datetime picker -> ISO matches Date.toISOString()', h.dateTimeToStoredIso(d) === d.toISOString());
}

// ── 7. Picker seeds ────────────────────────────────────────────────────────
console.log('\n[picker seeds]');
check('storedTimeToDate carries HH:mm', h.timeToStored(h.storedTimeToDate('14:30')) === '14:30');
check('storedDateToDate carries Y-M-D', h.dateToStored(h.storedDateToDate('2026-10-15')) === '2026-10-15');

console.log(`\n===== ${PASS} passed, ${FAIL} failed =====`);
process.exit(FAIL ? 1 : 0);
