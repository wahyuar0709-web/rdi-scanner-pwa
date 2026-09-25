/* L1 handler_coverage (audit menyeluruh tombol/fitur — 2026-09-25):
 * 1. Setiap fungsi yang dipanggil dari inline handler (onclick/oninput/onchange/
 *    onkeydown/onblur/onmousedown/dll) wajib terdefinisi di GLOBAL scope
 *    (index.html atau js/*.js) — mencegah class BUG-01 (ReferenceError saat klik).
 * 2. Tiap <button> harus punya handler (inline / type=submit / .onclick= programatik).
 * 3. Baseline jumlah handler per atribut (deteksi kehilangan handler tak sengaja). */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const files = ['index.html', 'js/util.js', 'js/cetak.js', 'js/outbox.js', 'js/format.js', 'scanner.html'];
const srcAll = files.map(f => {
  const p = path.join(ROOT, f);
  return fs.existsSync(p) ? { f, s: fs.readFileSync(p, 'utf8') } : null;
}).filter(Boolean);
const src = srcAll.map(x => x.s).join('\n');
const idx = srcAll.find(x => x.f === 'index.html').s;

let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- 1. kumpulkan handlers ----
const ATTRS = 'on(?:click|input|change|keydown|blur|focus|submit|dblclick|auxclick|mousedown|mouseup|touchstart|touchend|mouseover|scroll|contextmenu)';
const handlers = [];
const re = new RegExp('\\s(' + ATTRS + ')="([^"]*)"', 'g');
let m;
while ((m = re.exec(idx))) handlers.push({ attr: m[1], code: m[2] });
t('coverage: >=350 inline handler terdeteksi (baseline 353)', handlers.length >= 350, 'dapat ' + handlers.length);

const ATTR_COUNT = {};
for (const h of handlers) ATTR_COUNT[h.attr] = (ATTR_COUNT[h.attr] || 0) + 1;
t('coverage: onclick >=280 (baseline 282)', ATTR_COUNT.onclick >= 280, 'dapat ' + ATTR_COUNT.onclick);
t('coverage: onkeydown >=30 (baseline 32)', ATTR_COUNT.onkeydown >= 30, 'dapat ' + ATTR_COUNT.onkeydown);

// ---- 2. calon callee ----
const SKIP = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'new', 'await', 'void', 'delete', 'in', 'of', 'do', 'else', 'try', 'throw', 'case', 'var', 'let', 'const', 'else',
  'event', 'e', 'ev', 'evt', 'this', 'window', 'document', 'console', 'globalThis', 'Math', 'JSON', 'Date', 'String', 'Number', 'Boolean', 'Array', 'Object', 'RegExp', 'Error', 'Promise',
  'alert', 'confirm', 'prompt', 'fetch', 'parseInt', 'parseFloat', 'isNaN', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'requestAnimationFrame', 'encodeURIComponent', 'decodeURIComponent',
  'localStorage', 'sessionStorage', 'navigator', 'location', 'history', 'getComputedStyle', 'matchMedia', 'btoa', 'atob',
  // method receiver — dicek via pemiliknya, bukan fungsi global:
  'preventDefault', 'stopPropagation', 'getElementById', 'querySelector', 'querySelectorAll', 'toUpperCase', 'toLowerCase', 'print', 'focus', 'blur', 'click', 'remove', 'appendChild',
  'toFixed', 'trim', 'replace', 'split', 'join', 'push', 'slice', 'indexOf', 'includes', 'test', 'exec', 'match', 'forEach', 'map', 'filter', 'reduce', 'some', 'every', 'charAt', 'padStart', 'padEnd', 'startsWith', 'endsWith', 'toString', 'then', 'catch', 'add', 'remove', 'toggle', 'contains', 'preventDefault'
]);
const calls = new Map();
for (const h of handlers) {
  const cre = /([A-Za-z_$][\w$]*)\s*\(/g;
  let c;
  while ((c = cre.exec(h.code))) {
    const n = c[1];
    if (SKIP.has(n)) continue;
    if (!calls.has(n)) calls.set(n, 0);
    calls.set(n, calls.get(n) + 1);
  }
}
t('coverage: >=160 unique callee global (baseline 172)', calls.size >= 160, 'dapat ' + calls.size);

// ---- 3. verifikasi definisi global lintas file ----
function esc(x) { return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function isGlobalDef(name) {
  const e = esc(name);
  const pats = [
    'function\\s+' + e + '\\s*\\(',
    'window\\.' + e + '\\s*=',
    '(?:var|let|const)\\s+' + e + '\\s*=',
    '(?:^|[;\\s])' + e + '\\s*=\\s*function',
    '(?:var|let|const)\\s+' + e + '\\s*\\(',
    '\\.' + e + '\\s*=\\s*function' // method assignment (rare)
  ];
  return pats.some(p => new RegExp(p, 'm').test(src));
}
const missing = [];
for (const [name, count] of calls) {
  if (!isGlobalDef(name)) missing.push(name + '(x' + count + ')');
}
t('handler: semua callee punya definisi global lintas file', missing.length === 0, 'missing: ' + missing.join(', '));

// ---- 4. tombol tanpa handler (dead check) ----
const btnRe = /<button\b[^>]*>/g;
let bm, dead = [], total = 0;
while ((bm = btnRe.exec(idx))) {
  total++;
  const tag = bm[0];
  const line = idx.slice(0, bm.index).split(/\r?\n/).length;
  const hasH = /on(?:click|input|change|keydown|submit|focus|blur|mousedown|touchstart)=/.test(tag) || /type="submit"/.test(tag);
  // programatik: id tombol dinamis di-attach .onclick= / addEventListener di source
  const idm = tag.match(/id="([^"]+)"/);
  const prog = idm && new RegExp('getElementById\\([\'"]' + esc(idm[1]) + '[\'"]\\)\\s*\\.\\s*on(?:click|mousedown)\\s*=|addEventListener\\([\'"]click[\'"][^)]{0,120}' + esc(idm[1]), 's').test(idx);
  if (!hasH && !prog) dead.push('L' + line + ': ' + tag.slice(0, 100));
}
t('coverage: >=230 <button> terinventarisir (baseline 236)', total >= 230, 'dapat ' + total);
t('tombol: tidak ada <button> tanpa handler (inline/submit/programatik)', dead.length === 0, dead.join(' | ').slice(0, 300));

console.log('---- handler_coverage: ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);
