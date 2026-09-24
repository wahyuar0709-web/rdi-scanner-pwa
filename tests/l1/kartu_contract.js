// OI-04 kartu() contract — brace-match extraction, escape via xe()/ex(), caller shape
const fs = require('fs');
const path = require('path');
const ROOT = 'c:/projec/rdi-scanner-pwa';
let pass = 0, fail = 0;
function t(name, ok, ev) {
  if (ok === true) { pass++; console.log('PASS | ' + name + (ev ? ' | ' + ev : '')); }
  else if (ok === false) { fail++; console.log('FAIL | ' + name + ' | ' + ev); }
  else console.log(ok + ' | ' + name + ' | ' + ev);
}

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function extractFnBody(src, name) {
  const declRe = new RegExp('function\\s+' + name + '\\s*\\(');
  const methodRe = new RegExp('(?:^|[,{\\s])' + name + '\\s*\\([^)]*\\)\\s*\\{');
  let idx = -1;
  const dm = src.match(declRe);
  if (dm) idx = dm.index + dm[0].indexOf(name);
  else {
    const mm = src.match(methodRe);
    if (mm) idx = mm.index + mm[0].lastIndexOf(name);
  }
  if (idx < 0) return null;
  const braceStart = src.indexOf('{', idx);
  if (braceStart < 0) return null;
  let depth = 0, started = false, end = -1;
  for (let i = braceStart; i < src.length && i < braceStart + 50000; i++) {
    const ch = src[i];
    if (ch === '{') { depth++; started = true; }
    else if (ch === '}') { depth--; if (started && depth === 0) { end = i; break; } }
  }
  if (end < 0) return null;
  return { text: src.slice(idx, end + 1), start: idx, end: end + 1, form: dm ? 'function-decl' : 'method-shorthand' };
}

const kartu = extractFnBody(html, 'kartu');
t('kartu() found', !!kartu, kartu ? ('form=' + kartu.form + ' len=' + kartu.text.length) : 'neither declaration form matched');
if (!kartu) {
  console.log('=== KARTU CONTRACT: ' + pass + ' PASS / ' + fail + ' FAIL ===');
  process.exit(1);
}

const body = kartu.text;
const hasXe = /xe\s*\(/.test(body);
const hasEx = /\bex\s*\(/.test(body);
t('kartu() HTML-escapes user data', hasXe || hasEx, 'xe=' + hasXe + ' ex=' + hasEx);

// Escape helpers must exist somewhere in index.html
t('escape helper defined (xe or ex)', /function\s+xe\s*\(/.test(html) || /function\s+ex\s*\(/.test(html),
  'function xe=' + /function\s+xe\s*\(/.test(html) + ' function ex=' + /function\s+ex\s*\(/.test(html));

// xe and ex (when both exist) should be equivalent escape maps (ignore function name)
const xeBody = extractFnBody(html, 'xe');
const exBody = extractFnBody(html, 'ex');
if (xeBody && exBody) {
  // extractFnBody starts at name index — strip optional `function` + name for compare
  const stripName = s => s.replace(/^(?:function\s*)?[A-Za-z_$][\w$]*/, 'fn').replace(/\s+/g, '');
  t('xe() and ex() are equivalent escapes', stripName(xeBody.text) === stripName(exBody.text),
    'xeLen=' + xeBody.text.length + ' exLen=' + exBody.text.length);
} else {
  t('xe() and ex() both present for comparison', false, 'xe=' + !!xeBody + ' ex=' + !!exBody);
}

// kartu must not assign user strings into innerHTML without an escape helper nearby the field
// Heuristic: every `item.` / `r.` interpolation used in HTML strings should pass through xe/ex or encodeURIComponent
const htmlStrParts = body.match(/'(?:[^'\\]|\\.)*'/g) || [];
const dangerous = htmlStrParts.filter(s => /item\.(nama|rak|id)/.test(s) && !/ex\(|xe\(|encodeURIComponent/.test(s));
// Fields can also be concatenated outside string literals — scan whole body
const concatDangerous = (body.match(/['"]>\s*'\s*\+\s*(?:item|r)\.(?:nama|rak)/g) || []);
t('No raw item field concat into HTML without escape (string-literal pass)', dangerous.length === 0, 'dangerous=' + dangerous.length + ' sample=' + (dangerous[0] || 'none').slice(0, 120));
t('No raw item field concat into HTML without escape (concat pass)', concatDangerous.length === 0, 'count=' + concatDangerous.length);

// Externally important fields use encodeURIComponent for QR data (not HTML injection surface)
t('QR data uses encodeURIComponent', /encodeURIComponent\(/.test(body), 'qrData build present');

// Caller shape: c.map(function(item,i){return kartu(item,i);})
const callerMap = /c\.map\(function\s*\(\s*item\s*,\s*i\s*\)\s*\{\s*return\s+kartu\(item\s*,\s*i\)/.test(html)
  || /return\s+kartu\(item\s*,\s*i\)/.test(html);
t('kartu() called via map over collection', callerMap, 'map caller present=' + callerMap);

// Exactly one definition (no shadowing duplicate)
const defCount = (html.match(/function\s+kartu\s*\(/g) || []).length;
t('Single function kartu definition', defCount === 1, 'defCount=' + defCount);

// Body length sanity (regex window failure root cause was 3313 > 2500)
t('kartu body fully extracted (>2500 chars OK)', body.length > 500 && body.length < 20000, 'len=' + body.length);

console.log('=== KARTU CONTRACT: ' + pass + ' PASS / ' + fail + ' FAIL ===');
process.exit(fail ? 1 : 0);
