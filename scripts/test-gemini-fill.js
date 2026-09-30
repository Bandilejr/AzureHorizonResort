/**
 * No-Firebase unit tests for src/utils/gemini-fill.ts.
 *   node scripts/test-gemini-fill.js
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
require.extensions['.ts'] = function (mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  mod._compile(js, filename);
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request.startsWith('@/')) request = path.join(SRC, request.slice(2));
  return origResolve.call(this, request, parent, ...rest);
};

const { geminiToDonationForm, mergeSuggestionIntoForm, extractJsonFromText } = require('../src/utils/gemini-fill');

let PASS = 0, FAIL = 0;
const check = (name, cond, detail) => { if (cond) { PASS++; console.log('  \u2713 ' + name); } else { FAIL++; console.log('  \u2717 ' + name + (detail ? ' \u2014 ' + detail : '')); } };

console.log('[full response]');
{
  const r = geminiToDonationForm({
    itemName: 'Cooked chicken curry', category: 'Cooked meals', estimatedPortions: 24,
    estimatedWeightKg: 7.5, expiryDateOnLabel: '2026-01-20', allergens: ['nuts', 'dairy'],
    confidence: 0.82, notes: 'Looks fresh.',
  });
  check('itemName', r.itemName === 'Cooked chicken curry');
  check('mealCategory', r.mealCategory === 'Cooked meals');
  check('portions string', r.portions === '24');
  check('weight string', r.weight === '7.5');
  check('allergens joined', r.allergens === 'nuts, dairy');
  check('expiryAt from printed label', r.expiryAt === '2026-01-20T23:59', r.expiryAt);
  check('safety NOT set', !('coreTemperatureVerified' in r) && !('safetyChecklist' in r));
}

console.log('\n[missing fields]');
{
  const r = geminiToDonationForm({ itemName: 'Bread' });
  check('only itemName', r.itemName === 'Bread' && r.portions === undefined && r.weight === undefined && r.allergens === undefined && r.expiryAt === undefined);
}

console.log('\n[numbers as strings]');
{
  const r = geminiToDonationForm({ estimatedPortions: '30', estimatedWeightKg: '12' });
  check('portions coerced', r.portions === '30');
  check('weight coerced', r.weight === '12');
}

console.log('\n[JSON in markdown fences]');
{
  const text = 'Here you go:\n```json\n{"itemName":"Soup","category":"Cooked meals","estimatedPortions":8,"confidence":0.5}\n```\n';
  const r = geminiToDonationForm(text);
  check('fenced itemName', r.itemName === 'Soup');
  check('fenced portions', r.portions === '8');
  check('extractJsonFromText works', extractJsonFromText(text).itemName === 'Soup');
}

console.log('\n[allergens not in our list]');
{
  const r = geminiToDonationForm({ allergens: ['Mustard', 'celery', 'nuts'] });
  check('unknown allergens preserved', r.allergens === 'mustard, celery, nuts');
  const dup = geminiToDonationForm({ allergens: ['Nuts', 'nuts', 'NUTS'] });
  check('deduped case-insensitively', dup.allergens === 'nuts');
}

console.log('\n[low confidence still maps fields]');
{
  const r = geminiToDonationForm({ itemName: 'Unknown', category: 'Other', confidence: 0.1, notes: 'unclear' });
  check('fields still mapped', r.itemName === 'Unknown' && r.mealCategory === 'Other');
}

console.log('\n[empty / malformed]');
{
  check('null -> {}', Object.keys(geminiToDonationForm(null)).length === 0);
  check('empty string -> {}', Object.keys(geminiToDonationForm('')).length === 0);
  check('non-json string -> {}', Object.keys(geminiToDonationForm('I cannot help with that.')).length === 0);
  check('truncated json -> {}', Object.keys(geminiToDonationForm('{"itemName": "Soup"')).length === 0);
  check('non-object array -> {}', Object.keys(geminiToDonationForm([1, 2, 3])).length === 0);
}

console.log('\n[use-by ONLY from a printed label]');
{
  check('no label date -> no expiryAt', geminiToDonationForm({ itemName: 'X' }).expiryAt === undefined);
  check('null label date -> no expiryAt', geminiToDonationForm({ itemName: 'X', expiryDateOnLabel: null }).expiryAt === undefined);
  check('blank label date -> no expiryAt', geminiToDonationForm({ itemName: 'X', expiryDateOnLabel: '   ' }).expiryAt === undefined);
  check('estimate alone is NEVER written', geminiToDonationForm({ itemName: 'X', expiryHoursFromNow: 3 }).expiryAt === undefined);
  check('estimate + no printed date stays empty', geminiToDonationForm({ itemName: 'X', expiryHoursFromNow: 48, expiryDateOnLabel: null }).expiryAt === undefined);
  check('bare printed date -> end of day', geminiToDonationForm({ expiryDateOnLabel: '2026-02-01' }).expiryAt === '2026-02-01T23:59');
  const iso = geminiToDonationForm({ expiryDateOnLabel: '2026-02-01T12:00:00.000Z' }).expiryAt;
  check('full ISO printed date normalized', typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(iso), iso);
  check('garbage label date ignored', geminiToDonationForm({ expiryDateOnLabel: 'soon' }).expiryAt === undefined);
}

console.log('\n[merge never overwrites user-edited fields]');
{
  const suggestion = { itemName: 'AI name', portions: '20', weight: '5', allergens: 'nuts' };
  const current = { itemName: 'My name', mealCategory: 'Cooked meals', portions: '10', weight: '2', allergens: '', expiryAt: '2026-01-15T12:00' };
  const touched = new Set(['itemName', 'portions']);
  const { next, applied } = mergeSuggestionIntoForm(current, suggestion, touched);
  check('itemName untouched', next.itemName === 'My name');
  check('portions untouched', next.portions === '10');
  check('weight applied', next.weight === '5');
  check('allergens applied', next.allergens === 'nuts');
  check('applied excludes touched', !applied.includes('itemName') && !applied.includes('portions') && applied.includes('weight'));
  check('unrelated fields preserved', next.mealCategory === 'Cooked meals' && next.expiryAt === '2026-01-15T12:00');
}

console.log(`\n===== ${PASS} passed, ${FAIL} failed =====`);
process.exit(FAIL ? 1 : 0);
