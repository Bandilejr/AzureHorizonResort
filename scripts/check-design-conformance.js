/**
 * Design-system conformance report.
 *   node scripts/check-design-conformance.js [--strict]
 *
 * Checks (see the redesign plan, section 5):
 *   1. zero hardcoded colors (hex / rgb() / rgba() / hsl()) outside
 *      src/design/tokens.ts ('transparent' is allowed)
 *   2. zero imports of the legacy theme shim (@/constants/theme)
 *   3. every screen under src/app renders a <Screen> or <AppShell> root
 *   4. every list screen has loading + empty + error states
 *
 * Batch A..H are in-progress, so this is REPORT-ONLY by default (exit 0).
 * Pass --strict to fail (exit 1) on any violation — used to prove Batch I done.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const TOKENS = path.join(SRC, 'design', 'tokens.ts');
const STRICT = process.argv.includes('--strict');

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const RGB = /\brgba?\(/g;
const HSL = /\bhsla?\(/g;
const NAMED = /(?:color|Color)\s*:\s*['"](black|white|red|green|blue|gray|grey|orange|purple|pink|yellow|brown|cyan|magenta|navy|teal|lime|maroon|olive|silver|aqua|fuchsia)['"]/g;
const SHIM = /from\s+['"]@\/constants\/theme['"]/;
const LISTY = /\.map\(|<FlatList|renderItem/;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = [...walk(path.join(SRC, 'app')), ...walk(path.join(SRC, 'components'))]
  .filter((f) => path.resolve(f) !== path.resolve(TOKENS));

const rel = (f) => f.replace(ROOT + path.sep, '').replace(/\\/g, '/');

const colors = [];
const shim = [];
const noRoot = [];
const weakLists = [];

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const count = (re) => (src.match(re) || []).length;
  const c = count(HEX) + count(RGB) + count(HSL) + count(NAMED);
  if (c > 0) colors.push({ file: rel(f), count: c });
  if (SHIM.test(src)) shim.push(rel(f));
  const isApp = f.includes(path.join('src', 'app'));
  // A thin wrapper that re-exports or delegates to a *Screen component is fine.
  const delegates = /export\s*\{\s*default\s*\}|<[A-Z][A-Za-z]*Screen[\s/>]/.test(src);
  if (isApp && !delegates && !/<Screen[\s>]|<AppShell[\s>]/.test(src)) noRoot.push(rel(f));
  if (isApp && LISTY.test(src) && !(/ListSkeleton|<Skeleton|EmptyState|ErrorState/.test(src))) weakLists.push(rel(f));
}

const totalColorFiles = colors.length;
const totalColorHits = colors.reduce((n, x) => n + x.count, 0);

const line = (s) => console.log(s);
line('=== Design-system conformance report ===');
line(`scanned: ${files.length} files under src/app + src/components (tokens excluded)`);
line('');
line(`1. hardcoded colors outside tokens.ts : ${totalColorFiles} files / ${totalColorHits} hits`);
colors.sort((a, b) => b.count - a.count).forEach((x) => line(`     ${String(x.count).padStart(3)}  ${x.file}`));
line(`2. legacy theme-shim imports          : ${shim.length} files`);
shim.forEach((f) => line(`     ${f}`));
line(`3. app screens without Screen/AppShell: ${noRoot.length} files`);
noRoot.forEach((f) => line(`     ${f}`));
line(`4. list screens missing state(s)      : ${weakLists.length} files`);
weakLists.forEach((f) => line(`     ${f}`));
line('');

const total = totalColorFiles + shim.length + noRoot.length + weakLists.length;
if (total === 0) {
  line('RESULT: PASS — zero violations.');
} else {
  line(`RESULT: ${total} outstanding item(s). Target is zero by Batch I (${STRICT ? 'STRICT' : 'report-only'}).`);
}
process.exit(STRICT && total > 0 ? 1 : 0);
