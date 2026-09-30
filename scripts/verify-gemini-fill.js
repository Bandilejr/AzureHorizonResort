/**
 * Sends sample food images to Gemini with the app's EXACT prompt/schema and
 * validates each response. Prints only field names/values — never the key.
 *
 *   1. Put 4-5 images in scripts/gemini-samples/ (see its README.md)
 *   2. node scripts/verify-gemini-fill.js
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const SAMPLES = path.join(__dirname, 'gemini-samples');

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

const { GEMINI_FOOD_PROMPT, GEMINI_FOOD_KEYS } = require('../src/utils/gemini-prompt');
const { extractJsonFromText, geminiToDonationForm } = require('../src/utils/gemini-fill');

const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const get = (n) => { const m = env.match(new RegExp('^' + n + '\\s*=\\s*"?([^"\\r\\n]+)"?', 'm')); return m ? m[1].trim() : ''; };
const key = get('EXPO_PUBLIC_GEMINI_API_KEY');
const model = get('EXPO_PUBLIC_GEMINI_MODEL') || 'gemini-3.5-flash-lite';

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

async function analyze(name, buf, mime) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const body = {
    contents: [{ parts: [{ text: GEMINI_FOOD_PROMPT }, { inline_data: { mime_type: mime, data: buf.toString('base64') } }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) { console.log(`  HTTP ${res.status} — ${(await res.text()).replace(/AQ\.[A-Za-z0-9_\-]+/g, '***').slice(0, 160)}`); return; }
  const payload = await res.json();
  const text = payload?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  const json = extractJsonFromText(text);
  if (!json) { console.log('  FAIL: response was not valid JSON'); return; }
  const missing = GEMINI_FOOD_KEYS.filter((k) => !(k in json));
  console.log(`  schema: ${missing.length ? 'MISSING ' + missing.join(',') : 'OK (' + GEMINI_FOOD_KEYS.length + ' keys)'}`);
  for (const k of GEMINI_FOOD_KEYS) {
    const v = Array.isArray(json[k]) ? json[k].join('|') : String(json[k]);
    console.log(`    ${k}: ${v.slice(0, 80)}`);
  }
  const mapped = geminiToDonationForm(json);
  console.log(`  form-fill: ${Object.keys(mapped).length ? JSON.stringify(mapped).slice(0, 160) : '(nothing mapped)'}`);
}

(async () => {
  if (!key) { console.log('EXPO_PUBLIC_GEMINI_API_KEY not set in .env'); return; }
  if (!fs.existsSync(SAMPLES)) { console.log('No samples folder. Create scripts/gemini-samples/ and add images.'); return; }
  const files = fs.readdirSync(SAMPLES).filter((f) => MIME[path.extname(f).toLowerCase()]);
  if (!files.length) { console.log('No images found in scripts/gemini-samples/ — see its README.md'); return; }
  console.log(`model: ${model}  ·  images: ${files.length}\n`);
  for (const f of files) {
    console.log(`=== ${f} ===`);
    try { await analyze(f, fs.readFileSync(path.join(SAMPLES, f)), MIME[path.extname(f).toLowerCase()]); }
    catch (e) { console.log('  ERROR: ' + e.message); }
    console.log('');
  }
})();
